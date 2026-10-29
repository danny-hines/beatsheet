import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renameCast, SCHEMA_VERSION, STAGE_IDS, type Asset, type ProjectFile } from "@beatsheet/schema";

// The engine reads where projects live (and settings) when its modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-make-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");
process.env.BEATSHEET_MAKE_POLL_MS = "5";

// Keys come from the Keychain, and a key there means the service is connected: fal, and the two that make stills in
// one request, OpenAI and Meta. A test can set a spending limit.
const settings = vi.hoisted(() => ({ make: undefined as undefined | { limit?: { usd: number; since: string } } }));
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return {
    ...real,
    getSecret: async (id: string) => (["fal", "openai", "meta"].includes(id) ? "test-key" : undefined),
    readSettings: () => ({ services: { fal: { addedAt: "2026-10-28" }, openai: { addedAt: "2026-10-29" }, meta: { addedAt: "2026-10-29" } }, checks: {}, make: settings.make }),
  };
});
// Plans (ChatGPT through Codex, Muse Code) aren't signed in unless a test says so, and make their picture without the CLI.
const plans = vi.hoisted(() => ({ ready: [] as string[], asks: [] as { route: string; prompt: string; aspect?: string; refs?: string[] }[] }));
vi.mock("../src/plans.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/plans.ts")>();
  return {
    ...real,
    planStates: () => Object.fromEntries(real.PLANS.map((p) => [p.id, { label: p.label, state: plans.ready.includes(p.id) ? "ready" : "missing" }])),
    planImage: async (route: string, a: { prompt: string; aspect?: string; refs?: string[] }) => {
      plans.asks.push({ route, ...a });
      return { bytes: Buffer.from("a picture on a plan"), contentType: "image/png" };
    },
  };
});
// Adding an asset probes it with ffprobe and makes previews; here it only records it, as a 6-second video or a still.
// Like the real one, it picks the id first and saves a moment later (the previews take time), and a test can make it
// fail, as a file in use would.
const ingest = vi.hoisted(() => ({ failures: 0, chosen: [] as string[] }));
vi.mock("../src/ingest.ts", async () => {
  const { loadFile, updateFile } = await import("../src/store.ts");
  return {
    addAsset: async (id: string, file: string, meta: { id?: string; label?: string; tags?: string[]; provenance?: Asset["provenance"] }) => {
      const used = new Set(loadFile(id).doc.assets.map((a) => a.id));
      let aid = meta.id ?? "take";
      for (let n = 2; used.has(aid); n++) aid = `${meta.id}-${n}`;
      ingest.chosen.push(aid);
      await new Promise((r) => setTimeout(r, 10));
      if (ingest.failures > 0 && ingest.failures--) throw new Error("EPERM: operation not permitted, rename");
      const video = file.endsWith(".mp4");
      const asset: Asset = { id: aid, kind: video ? "video" : "image", path: file, label: meta.label, tags: meta.tags, provenance: meta.provenance, width: 1080, height: 1920, ...(video ? { duration: 6 } : {}) };
      updateFile(id, (d) => void d.assets.push(asset));
      return asset;
    },
  };
});

type Make = typeof import("../src/make.ts");
let make: Make;
let store: typeof import("../src/store.ts");

// ---- A stand-in for fal: uploads, the queue (waiting, then running, then done), and the files it made. And for
// OpenAI's and Meta's Images API, which answer with the picture.
type Seen = { submits: { endpoint: string; input: Record<string, unknown> }[]; uploads: number; direct: { url: string; type: string; body: string }[] };
let seen: Seen;
let refuse: string | undefined;
let server: Server;
let base = "";
const polls = new Map<string, number>();

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "";
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const send = (status: number, data: unknown, type = "application/json") => {
        res.writeHead(status, { "content-type": type });
        res.end(type === "application/json" ? JSON.stringify(data) : (data as Buffer));
      };
      if (url.startsWith("/direct/")) {
        if (req.headers.authorization !== "Bearer test-key") return send(401, { error: { message: "no" } });
        seen.direct.push({ url, type: String(req.headers["content-type"]), body });
        if (refuse && body.includes(refuse)) return send(400, { error: { message: "Your request was rejected by the safety system.", code: "moderation_blocked" } });
        if (body.includes("busy")) return send(503, { error: { message: "Overloaded" } });
        return send(200, { data: [{ b64_json: Buffer.from("a made picture").toString("base64") }], usage: { input_tokens: 50, input_tokens_details: { text_tokens: 50, image_tokens: 0 }, output_tokens: 1000 } });
      }
      if (req.headers.authorization !== "Key test-key" && !url.startsWith("/out/") && !url.startsWith("/upload/")) return send(401, { detail: "no" });
      if (url.startsWith("/rest/storage/upload/initiate")) {
        seen.uploads++;
        return send(200, { upload_url: `${base}/upload/${seen.uploads}`, file_url: `${base}/out/uploaded-${seen.uploads}.jpg` });
      }
      if (url.startsWith("/upload/")) return send(200, {});
      if (url.startsWith("/out/")) return send(200, Buffer.from(url.endsWith(".mp4") ? "a video" : "a picture"), url.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
      const status = url.match(/^\/queue\/([^/]+\/[^/]+)\/requests\/([^/]+)\/status/);
      if (status) {
        const n = (polls.get(status[2]!) ?? 0) + 1;
        polls.set(status[2]!, n);
        return send(200, n === 1 ? { status: "IN_QUEUE", queue_position: 2 } : n === 2 ? { status: "IN_PROGRESS" } : { status: "COMPLETED" });
      }
      const result = url.match(/^\/queue\/([^/]+\/[^/]+)\/requests\/([^/]+)$/);
      if (result) {
        const video = result[1]!.includes("kling") || result[1]!.includes("wan");
        return send(200, video ? { video: { url: `${base}/out/${result[2]}.mp4`, content_type: "video/mp4" } } : { images: [{ url: `${base}/out/${result[2]}.jpg`, content_type: "image/jpeg" }], seed: 7 });
      }
      if (req.method === "POST" && url.startsWith("/queue/")) {
        const endpoint = url.slice("/queue/".length);
        const input = JSON.parse(body) as Record<string, unknown>;
        if (refuse && String(input.prompt).includes(refuse)) return send(422, { detail: [{ loc: ["body", "prompt"], msg: "was flagged by the safety checker" }] });
        seen.submits.push({ endpoint, input });
        const id = `r${seen.submits.length}`;
        const app = `${base}/queue/${endpoint.split("/").slice(0, 2).join("/")}/requests/${id}`;
        return send(200, { request_id: id, status_url: `${app}/status`, response_url: app, cancel_url: `${app}/cancel` });
      }
      send(404, { detail: `nothing at ${url}` });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.BEATSHEET_FAL_QUEUE = `${base}/queue`;
  process.env.BEATSHEET_FAL_REST = `${base}/rest`;
  process.env.BEATSHEET_OPENAI = `${base}/direct/openai`;
  process.env.BEATSHEET_META = `${base}/direct/meta`;
  make = await import("../src/make.ts");
  store = await import("../src/store.ts");
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

// A 9:16 cut of the cat video with two placeholder shots, and the cat's photo.
const PROJECT = "cat";
beforeEach(() => {
  seen = { submits: [], uploads: 0, direct: [] };
  refuse = undefined;
  plans.ready = [];
  plans.asks = [];
  polls.clear();
  const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cat.jpg"), "the cat");
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: PROJECT,
    title: "A day in the life of my cat",
    sources: [],
    brief: { goal: "60 seconds: the cat's secret life of crime" },
    assets: [{ id: "cat-photo", kind: "image", path: join(dir, "cat.jpg"), width: 1080, height: 1440 }],
    cast: [
      { id: "cat", name: "the cat", kind: "character", about: "orange tabby, white chest", seen: [{ asset: "cat-photo" }], variants: [{ id: "heist", about: "a tiny black eye mask" }] },
      { id: "alley", name: "the alley", kind: "place", about: "narrow, wet brick" },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "film",
        spec: {},
        formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [
          { id: "s1", track: "pic", duration: 2.5, content: { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" }, fidelity: "idea" },
          { id: "s2", track: "pic", duration: 3.2, content: { kind: "placeholder", description: "The cat strolls down the alley like it owns it" }, fidelity: "idea" },
        ],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

const shot = (id: string) => store.loadProject(PROJECT).project.shots.find((s) => s.id === id)!;

describe("making takes for a shot", () => {
  it("makes two boards for a placeholder, which becomes a generated shot showing the first", async () => {
    const { fit, jobs } = make.startMake(PROJECT, { op: "image", shot: "s2", count: 2 });
    expect(fit).toMatchObject({ model: "nano-banana", route: "fal", aspect: "9:16", usd: 0.08 });
    expect(jobs).toHaveLength(2);
    await make.driveJobs(PROJECT);

    expect(seen.submits.map((s) => s.endpoint)).toEqual(["fal-ai/nano-banana", "fal-ai/nano-banana"]);
    expect(seen.submits[0]!.input).toMatchObject({ prompt: "The cat strolls down the alley like it owns it", aspect_ratio: "9:16", num_images: 1 });
    expect(make.listJobs(PROJECT).map((j) => j.status)).toEqual(["done", "done"]);
    const s = shot("s2");
    expect(s.fidelity).toBe("board");
    expect(s.content).toMatchObject({ kind: "generated", take: "s2-take", takes: ["s2-take", "s2-take-2"], model: "nano-banana", provider: "fal" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ source: "generated", provider: "fal", model: "fal-ai/nano-banana", seed: 7, op: "image", job: jobs[0]!.id, costUsd: 0.04 });
    expect(readFileSync(take.path, "utf8")).toBe("a picture");
  });

  it("animates a board: uploads it, asks for the next length over the shot's, and trims the take to the middle", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    const { fit } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "s2-take" });
    expect(fit).toMatchObject({ model: "kling-2.5-turbo", endpoint: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", seconds: 5, usd: 0.35 });
    await make.driveJobs(PROJECT);

    expect(seen.uploads).toBe(1);
    expect(seen.submits[1]!.input).toEqual({ prompt: "The cat strolls down the alley like it owns it", duration: "5", image_url: `${base}/out/uploaded-1.jpg` });
    const s = shot("s2");
    // The 6-second take covers the 3.2-second shot with half a second spare at the start.
    expect(s.content).toMatchObject({ kind: "generated", take: "s2-take-2", takes: ["s2-take", "s2-take-2"], start: "s2-take", in: 0.5 });
    expect(s.fidelity).toBe("rough");
  });

  it("picks a job up again after a restart, from where the service has it, without sending it twice", async () => {
    const [job] = make.startMake(PROJECT, { op: "image", shot: "s1" }).jobs;
    await make.driveJobs(PROJECT);
    // Pretend the process stopped after sending: the job is running at fal, and its lock is a dead process's.
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT, "jobs");
    const saved = JSON.parse(readFileSync(join(dir, `${job!.id}.json`), "utf8")) as import("../src/make.ts").MakeJob;
    const assets = store.loadProject(PROJECT).project.assets.filter((a) => a.id !== saved.asset);
    store.updateFile(PROJECT, (d) => {
      d.assets = assets;
      const s = d.cuts[0]!.shots.find((x) => x.id === "s1")!;
      s.content = { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" };
      s.fidelity = "idea";
    });
    writeFileSync(join(dir, `${job!.id}.json`), JSON.stringify({ ...saved, status: "running", asset: undefined }));
    writeFileSync(join(dir, `${job!.id}.lock`), "999999");
    polls.clear();

    await make.driveJobs(PROJECT);
    expect(seen.submits).toHaveLength(1);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", asset: "s1-take" });
    expect(shot("s1").content).toMatchObject({ kind: "generated", take: "s1-take" });
  });

  it("gives fal's reason when it won't make something", async () => {
    refuse = "alley";
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "failed", error: "prompt: was flagged by the safety checker" });
    expect(shot("s2").content.kind).toBe("placeholder");
  });

  it("refuses what can't be made before sending anything", () => {
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s2", start: "nope" })).toThrow('no asset "nope"');
    expect(() => make.startMake(PROJECT, { op: "video", prompt: "a long walk", seconds: 12 })).toThrow("Makes up to 10s; this shot is 12s");
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s2", model: "nano-banana" })).toThrow("doesn't make video");
    expect(seen.submits).toHaveLength(0);
  });
});

describe("what the agent's turn has spent", () => {
  it("adds up the takes asked for since its turn began", async () => {
    store.updateFile(PROJECT, (d) => void (d.turn = { who: "agent", since: new Date(Date.now() - 1000).toISOString() }));
    make.startMake(PROJECT, { op: "image", shot: "s1", count: 3 });
    await make.driveJobs(PROJECT);
    expect(make.spentThisTurn(PROJECT)).toBeCloseTo(0.12, 3);
    store.updateFile(PROJECT, (d) => void (d.turn = { who: "you", since: new Date().toISOString() }));
    expect(make.spentThisTurn(PROJECT)).toBe(0);
  });
});

describe("fal's inputs for each kind of model", () => {
  it("asks Wan for whole frames at 16 a second", async () => {
    const { falInput, wanFrames } = await import("../src/fal.ts");
    expect(wanFrames(5.06)).toBe(81);
    expect(wanFrames(4.2)).toBe(69);
    expect(wanFrames(0.5)).toBe(17);
    expect(wanFrames(30)).toBe(161);
    expect(falInput("wan", { prompt: "x", seconds: 4.2, start: "u" })).toMatchObject({ num_frames: 69, aspect_ratio: "auto", image_url: "u" });
    expect(falInput("kling", { prompt: "x", seconds: 10, aspect: "9:16" })).toEqual({ prompt: "x", duration: "10", aspect_ratio: "9:16" });
    expect(() => falInput("sora", { prompt: "x" })).toThrow('no way to ask fal for "sora"');
  });
});

describe("cast and sets", () => {
  it("makes a sheet for the cat from its photo, and the sheet becomes the cat's picture", async () => {
    const { fit } = make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    expect(fit).toMatchObject({ model: "nano-banana", endpoint: "fal-ai/nano-banana/edit", aspect: "16:9" });
    await make.driveJobs(PROJECT);

    const sent = seen.submits[0]!.input;
    expect(sent.image_urls).toEqual([`${base}/out/uploaded-1.jpg`]);
    // A photograph, said in so many words: "reference sheet" alone comes back drawn.
    expect(String(sent.prompt)).toMatch(/^A photographic reference sheet of the cat \(orange tabby, white chest\): front, three-quarter/);
    expect(String(sent.prompt)).toMatch(/photographed rather than drawn, nothing else in the picture and no text or labels\. The reference photos show the cat: keep the cat's features, markings, colors and shape exactly\.$/);
    const cat = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!;
    expect(cat.images).toEqual(["cat-sheet"]);
    expect(store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-sheet")).toMatchObject({ tags: ["sheet"], provenance: { cast: ["cat"] } });
  });

  it("gives a board the pictures of the cast its prompt names, describes them, and keeps the prompt as written on the shot", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    seen.submits = [];
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat/heist strolls down @alley like it owns it", count: 1 });
    await make.driveJobs(PROJECT);

    const sent = seen.submits[0]!;
    expect(sent.endpoint).toBe("fal-ai/nano-banana/edit");
    expect(sent.input.prompt).toBe(
      "the cat (orange tabby, white chest; a tiny black eye mask) strolls down the alley (narrow, wet brick) like it owns it. Reference pictures, in order: the cat. Keep each one's features, markings and colors as they are there; draw them in the style asked for. The picture is one single frame of the scene, not a sheet, a grid or panels.",
    );
    expect(shot("s2").content).toMatchObject({ kind: "generated", prompt: "@cat/heist strolls down @alley like it owns it" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ cast: ["cat/heist", "alley"], refs: ["cat-sheet"] });
  });

  it("draws sheets and boards in the project's style, and a cast member in its own when it has one", async () => {
    store.updateFile(PROJECT, (d) => {
      d.cast!.push({ id: "noir", name: "film noir", kind: "style", about: "black and white, hard shadows" }, { id: "toon", name: "hand-drawn", kind: "style", about: "2D animation, clean ink lines" });
      d.look = { style: "noir" };
    });
    // The alley takes the look's style; its sheet says so, and isn't a photograph.
    make.startMake(PROJECT, { op: "image", sheet: "alley", count: 1 });
    await make.driveJobs(PROJECT);
    expect(seen.submits[0]!.input.prompt).toBe(
      "A wide establishing view of the alley (narrow, wet brick), empty of people, nothing else in the picture and no text or labels, in the style of film noir (black and white, hard shadows).",
    );

    // The cat is drawn: its sheet is in its own style, and a board puts the drawn cat in the noir alley.
    store.updateFile(PROJECT, (d) => void (d.cast!.find((m) => m.id === "cat")!.style = "toon"));
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[1]!.input.prompt)).toMatch(/^A reference sheet of the cat \(orange tabby, white chest\): .*, nothing else in the picture and no text or labels, in the style of hand-drawn \(2D animation, clean ink lines\)\. The reference photos show the cat: keep/);
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat strolls down @alley", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[2]!.input.prompt)).toMatch(
      /^the cat \(orange tabby, white chest; in the style of hand-drawn: 2D animation, clean ink lines\) strolls down the alley \(narrow, wet brick\)\. In the style of film noir \(black and white, hard shadows\)\./,
    );
  });

  it("refuses a sheet for someone who isn't in the cast", () => {
    expect(() => make.startMake(PROJECT, { op: "image", sheet: "dog" })).toThrow('No cast member "dog"');
  });
});

describe("roughs, finals and whole passes", () => {
  it("makes a final from the board with Kling 3, without its own sound, and the final replaces the rough", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", count: 1 });
    await make.driveJobs(PROJECT);
    expect(shot("s2")).toMatchObject({ fidelity: "rough", content: { take: "s2-take-2" } });

    const { fit } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", quality: "final", count: 1 });
    expect(fit).toMatchObject({ model: "kling-3", seconds: 5, usd: 0.56 });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)!.input).toEqual({ prompt: "The cat strolls down the alley like it owns it", duration: "5", start_image_url: `${base}/out/uploaded-2.jpg`, generate_audio: false });
    // The board is still where the clips start from, after a rough took its place.
    expect(shot("s2")).toMatchObject({ fidelity: "final", content: { take: "s2-take-3", start: "s2-take" } });
  });

  it("says a shot has no board yet when asked to start from one", () => {
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s1", start: "board" })).toThrow('Shot "s1" has no board yet');
  });

  it("checks a whole pass against what may be spent before starting any of it", () => {
    const asks = ["s1", "s2"].map((shot) => ({ op: "image" as const, shot, count: 2 }));
    expect(make.estimate(PROJECT, asks).rows.find((r) => r.model === "nano-banana")).toMatchObject({ usd: 0.16, made: 2, unfit: [] });
    // With each shot's Auto pick (Nano Banana here, the first ready one).
    expect(make.estimate(PROJECT, asks).auto).toEqual({ usd: 0.16, made: 2 });
    // A shot that has no board to start from is set aside, and the rest is still estimated.
    expect(make.estimate(PROJECT, ["s1", "s2"].map((shot) => ({ op: "video" as const, shot, start: "board" }))).problems).toEqual([
      { shot: "s1", reason: 'Shot "s1" has no board yet: make stills for it first' },
      { shot: "s2", reason: 'Shot "s2" has no board yet: make stills for it first' },
    ]);
    expect(() => make.startMakeAll(PROJECT, asks, { spendable: 0.1 })).toThrow("This is about $0.16, and only $0.10 more can be spent");
    expect(make.listJobs(PROJECT)).toHaveLength(0);
    const { plans, usd } = make.startMakeAll(PROJECT, asks, { spendable: 1 });
    expect(usd).toBe(0.16);
    expect(plans.map((p) => p.jobs.length)).toEqual([2, 2]);
  });
});

describe("the spending limit", () => {
  it("refuses what would go past it, counting every take asked for since it was set, whoever asked", async () => {
    // From now: takes an earlier test left going were asked for before.
    settings.make = { limit: { usd: 0.1, since: new Date().toISOString() } };
    try {
      make.startMake(PROJECT, { op: "image", shot: "s1", count: 2 });
      await make.driveJobs(PROJECT);
      expect(make.spentSince(settings.make.limit!.since)).toBeCloseTo(0.08, 3);
      expect(() => make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 })).toThrow("This is about $0.04, and $0.08 of the $0.10 spending limit");
      // What failed or was stopped doesn't count.
      refuse = "alley";
      settings.make.limit!.usd = 0.12;
      make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
      await make.driveJobs(PROJECT);
      expect(make.spentSince(settings.make.limit!.since)).toBeCloseTo(0.08, 3);
    } finally {
      settings.make = undefined;
    }
  });
});

describe("a variant's sheet", () => {
  it("says the difference is in every view, since it starts from the plain sheet", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    make.startMake(PROJECT, { op: "image", sheet: "cat/heist", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[1]!.input.prompt)).toMatch(/ In every view: a tiny black eye mask\.$/);
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.variants![0]!.images).toEqual(["cat-heist-sheet"]);
  });
});

describe("takes that finish together, and trying again", () => {
  it("brings in takes that finish at once one at a time, so each gets its own id", async () => {
    ingest.chosen = [];
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 4 });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT).map((j) => j.status)).toEqual(["done", "done", "done", "done"]);
    expect(shot("s2").content).toMatchObject({ takes: ["s2-take", "s2-take-2", "s2-take-3", "s2-take-4"] });
    // No two picked the same id (and wrote the same previews) along the way.
    expect(ingest.chosen).toEqual(["s2-take", "s2-take-2", "s2-take-3", "s2-take-4"]);
  });

  it("tries bringing a take in again when the project's side goes wrong, without asking the service again", async () => {
    ingest.failures = 2;
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", charged: true, asset: "s2-take" });
    expect(seen.submits).toHaveLength(1);
  });

  it("fetches a failed take the service had made, rather than paying for it again, and counts what it cost", async () => {
    const since = new Date().toISOString();
    const [job] = make.startMake(PROJECT, { op: "image", shot: "s1", count: 1 }).jobs;
    await make.driveJobs(PROJECT);
    // As if bringing it in had failed for good: the service made it, and it's paid for.
    const file = join(process.env.BEATSHEET_PROJECTS!, PROJECT, "jobs", `${job!.id}.json`);
    const saved = JSON.parse(readFileSync(file, "utf8")) as import("../src/make.ts").MakeJob;
    store.updateFile(PROJECT, (d) => {
      d.assets = d.assets.filter((a) => a.id !== saved.asset);
      const s = d.cuts[0]!.shots.find((x) => x.id === "s1")!;
      s.content = { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" };
    });
    writeFileSync(file, JSON.stringify({ ...saved, status: "failed", error: "EPERM", asset: undefined }));
    expect(make.spentSince(since)).toBeCloseTo(0.04, 3);

    expect(make.retryJobs(PROJECT, [job!.id])).toMatchObject([{ status: "running" }]);
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", asset: "s1-take" });
    expect(seen.submits).toHaveLength(1);
  });
});

describe("stills from services that answer in one request", () => {
  it("makes a board with GPT Image at the shot's shape, saves the picture, and counts what it actually cost", async () => {
    const { fit } = make.startMake(PROJECT, { op: "image", shot: "s2", model: "gpt-image" });
    expect(fit).toMatchObject({ model: "gpt-image", route: "openai", endpoint: "gpt-image-2.5-flare", aspect: "9:16", usd: 0.03 });
    await make.driveJobs(PROJECT);

    expect(seen.submits).toHaveLength(0);
    expect(seen.direct[0]!.url).toBe("/direct/openai/images/generations");
    expect(JSON.parse(seen.direct[0]!.body)).toEqual({ model: "gpt-image-2.5-flare", prompt: "The cat strolls down the alley like it owns it", n: 1, size: "864x1536", output_format: "jpeg", quality: "medium", output_compression: 92 });
    const [job] = make.listJobs(PROJECT);
    // 50 words in at $5 a million, a picture of 1,000 tokens out at $30.
    expect(job).toMatchObject({ status: "done", charged: true, usd: 0.0303, asset: "s2-take" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ provider: "openai", model: "gpt-image-2.5-flare", costUsd: 0.0303, params: { model: "gpt-image" } });
    expect(readFileSync(take.path, "utf8")).toBe("a made picture");
    expect(shot("s2")).toMatchObject({ fidelity: "board", content: { kind: "generated", take: "s2-take", provider: "openai" } });
  });

  it("makes a still on the ChatGPT plan when Codex is signed in, at no charge, and with the key when asked", async () => {
    plans.ready = ["chatgpt"];
    const { fit } = make.startMake(PROJECT, { op: "image", shot: "s2", model: "gpt-image" });
    expect(fit).toMatchObject({ route: "chatgpt", where: "ChatGPT plan", usd: 0, also: [{ route: "openai", usd: 0.03 }] });
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(0);
    expect(plans.asks).toEqual([{ route: "chatgpt", prompt: "The cat strolls down the alley like it owns it", aspect: "9:16", refs: undefined }]);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", route: "chatgpt", usd: 0, asset: "s2-take" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ provider: "chatgpt", model: "gpt-image", costUsd: 0 });
    expect(take.path).toMatch(/\.png$/);

    make.startMake(PROJECT, { op: "image", shot: "s2", model: "gpt-image", via: "openai", count: 1 });
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(1);
    expect(make.listJobs(PROJECT)[1]).toMatchObject({ status: "done", route: "openai" });
    expect(() => make.startMake(PROJECT, { op: "image", shot: "s2", model: "muse-image", via: "muse-code" })).toThrow("Muse Image can't make this: Runs on Muse Code plan");
  });

  it("brings a sheet in as the renamed one's when its cast member is renamed while it's made", async () => {
    // Nano Banana on fal: it waits in the queue a while.
    make.startMake(PROJECT, { op: "image", sheet: "cat", model: "nano-banana", count: 1 });
    store.updateFile(PROJECT, (d) => void renameCast(d, "cat", "marmalade"));
    expect(make.renameInJobs(PROJECT, "cat", "marmalade")).toBe(1);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ sheet: "marmalade", request: { cast: ["marmalade"] } });
    expect(make.listJobs(PROJECT)[0]!.request.prompt).toMatch(/^A photographic reference sheet of @marmalade:/);
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", sheet: "marmalade", asset: "marmalade-sheet" });
    expect(store.loadFile(PROJECT).doc.cast!.find((m) => m.id === "marmalade")!.images).toEqual(["marmalade-sheet"]);
  });

  it("gives a model that takes more pictures more of the cast's, once it's picked", async () => {
    // Five characters with pictures: every still model takes four, Muse Image ten.
    store.updateFile(PROJECT, (d) => {
      for (const n of ["a", "b", "c", "d", "e"]) {
        d.assets.push({ id: `${n}-pic`, kind: "image", path: d.assets[0]!.path });
        d.cast!.push({ id: n, name: n.toUpperCase(), kind: "character", images: [`${n}-pic`] });
      }
    });
    const prompt = "@a, @b, @c, @d and @e at the table";
    expect(make.makeChoices(PROJECT, { op: "image", prompt }).req.refs).toEqual(["a-pic", "b-pic", "c-pic", "d-pic"]);
    const { jobs } = make.startMake(PROJECT, { op: "image", prompt, model: "muse-image", count: 1 });
    expect(jobs[0]!.request.refs).toEqual(["a-pic", "b-pic", "c-pic", "d-pic", "e-pic"]);
    expect(jobs[0]!.request.sent).toContain("Reference pictures, in order: A, B, C, D, E.");
    await make.driveJobs(PROJECT);
    expect(JSON.parse(seen.direct[0]!.body).images).toHaveLength(5);
  });

  it("gives a sheet made from photos its style's picture too, when there's room", async () => {
    store.updateFile(PROJECT, (d) => {
      d.assets.push({ id: "noir-pic", kind: "image", path: d.assets[0]!.path });
      d.cast!.push({ id: "noir", name: "Film noir", kind: "style", about: "black and white", images: ["noir-pic"] });
      d.look = { ...(d.look ?? {}), style: "noir" };
    });
    const { jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", model: "muse-image", count: 1 });
    expect(jobs[0]!.request.refs).toEqual(["cat-photo", "noir-pic"]);
    expect(jobs[0]!.request.sent).toMatch(/The reference photos show the cat: keep .* exactly\. The last reference picture shows the style to draw it in, not who or what it is\.$/);
    await make.driveJobs(PROJECT);
  });

  it("gives Muse Image the cast's pictures as data in JSON, and GPT Image as files in a form", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", model: "muse-image", count: 1 });
    await make.driveJobs(PROJECT);
    expect(seen.direct[0]!.url).toBe("/direct/meta/images/edits");
    const sent = JSON.parse(seen.direct[0]!.body) as Record<string, unknown>;
    expect(sent).toMatchObject({ model: "muse-image-1.0", size: "1536x864", response_format: "b64_json", images: [{ image_url: `data:image/jpeg;base64,${Buffer.from("the cat").toString("base64")}` }] });
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", usd: 0.01 });
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.images).toEqual(["cat-sheet"]);

    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat strolls down @alley", model: "gpt-image" });
    await make.driveJobs(PROJECT);
    expect(seen.direct[1]!.url).toBe("/direct/openai/images/edits");
    expect(seen.direct[1]!.type).toMatch(/^multipart\/form-data/);
    expect(seen.direct[1]!.body).toContain('name="image[]"; filename="');
    expect(seen.direct[1]!.body).toContain("a made picture");
  });

  it("says why when the service won't make it, and sends again after a hiccup", async () => {
    refuse = "alley";
    make.startMake(PROJECT, { op: "image", shot: "s2", model: "muse-image" });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "failed", error: "Your request was rejected by the safety system." });
    expect(make.listJobs(PROJECT)[0]!.charged).toBeUndefined();

    // Busy once, then fine: nothing was made the first time, so it goes again.
    let busy = true;
    const real = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (busy && String(url).includes("/direct/")) {
        busy = false;
        return new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: 503 });
      }
      return real(url, init);
    });
    refuse = undefined;
    make.startMake(PROJECT, { op: "image", shot: "s1", model: "muse-image" });
    await make.driveJobs(PROJECT);
    spy.mockRestore();
    expect(make.listJobs(PROJECT)[1]).toMatchObject({ status: "done", asset: "s1-take" });
  });

  it("can't pick up a still that was being made when the engine stopped, so it counts it and says so", async () => {
    const since = new Date().toISOString();
    const [job] = make.startMake(PROJECT, { op: "image", shot: "s1", model: "gpt-image" }).jobs;
    await make.driveJobs(PROJECT);
    // As if the engine had stopped while it waited for the answer: running, no picture, a dead process's lock.
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT, "jobs");
    store.updateFile(PROJECT, (d) => {
      d.assets = d.assets.filter((a) => a.id !== "s1-take");
      d.cuts[0]!.shots.find((x) => x.id === "s1")!.content = { kind: "placeholder", description: "The cat slips out through the cat flap at dawn" };
    });
    writeFileSync(join(dir, `${job!.id}.json`), JSON.stringify({ ...job, status: "running" }));
    writeFileSync(join(dir, `${job!.id}.lock`), "999999");
    seen.direct = [];
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(0);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "failed", charged: true, error: expect.stringMatching(/^The engine stopped while this was being made/) });
    expect(make.spentSince(since)).toBeCloseTo(0.03, 3);

    // Trying again makes it again.
    make.retryJobs(PROJECT, [job!.id]);
    await make.driveJobs(PROJECT);
    expect(seen.direct).toHaveLength(1);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", asset: "s1-take" });
  });
});
