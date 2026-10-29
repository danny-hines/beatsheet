import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type Asset, type ProjectFile } from "@beatsheet/schema";

// The engine reads where projects live (and settings) when its modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-make-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");
process.env.BEATSHEET_MAKE_POLL_MS = "5";

// fal's key comes from the Keychain, and a key there means fal is connected.
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return { ...real, getSecret: async (id: string) => (id === "fal" ? "test-key" : undefined), readSettings: () => ({ services: { fal: { addedAt: "2026-10-28" } }, checks: {} }) };
});
// Adding an asset probes it with ffprobe and makes previews; here it only records it, as a 6-second video or a still.
vi.mock("../src/ingest.ts", async () => {
  const { loadFile, updateFile } = await import("../src/store.ts");
  return {
    addAsset: async (id: string, file: string, meta: { id?: string; label?: string; tags?: string[]; provenance?: Asset["provenance"] }) => {
      const used = new Set(loadFile(id).doc.assets.map((a) => a.id));
      let aid = meta.id ?? "take";
      for (let n = 2; used.has(aid); n++) aid = `${meta.id}-${n}`;
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

// ---- A stand-in for fal: uploads, the queue (waiting, then running, then done), and the files it made.
type Seen = { submits: { endpoint: string; input: Record<string, unknown> }[]; uploads: number };
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
  seen = { submits: [], uploads: 0 };
  refuse = undefined;
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
    expect(String(sent.prompt)).toMatch(/photographed rather than drawn, nothing else in the picture\. The reference photos show the cat: keep the cat's features, markings, colors and shape exactly\.$/);
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
      "the cat (orange tabby, white chest; a tiny black eye mask) strolls down the alley (narrow, wet brick) like it owns it. Reference pictures, in order: the cat. Keep each one's features, markings and colors as they are there; draw them in the style asked for.",
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
      "A wide establishing view of the alley (narrow, wet brick), empty of people, nothing else in the picture, in the style of film noir (black and white, hard shadows).",
    );

    // The cat is drawn: its sheet is in its own style, and a board puts the drawn cat in the noir alley.
    store.updateFile(PROJECT, (d) => void (d.cast!.find((m) => m.id === "cat")!.style = "toon"));
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[1]!.input.prompt)).toMatch(/^A reference sheet of the cat \(orange tabby, white chest\): .*, nothing else in the picture, in the style of hand-drawn \(2D animation, clean ink lines\)\. The reference photos show the cat: keep/);
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
