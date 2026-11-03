import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renameCast, SCHEMA_VERSION, STAGE_IDS, type Asset, type ProjectFile } from "@beatsheet/schema";

// The engine reads where projects live (and settings) when its modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-make-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");
process.env.BEATSHEET_MAKE_POLL_MS = "5";

// Keys come from the Keychain, and a key there means the service is connected: fal, and the two that make stills in
// one request, OpenAI and Meta. A test can connect more (Gemini), and set a spending limit.
const settings = vi.hoisted(() => ({ make: undefined as undefined | { limit?: { usd: number; since: string } }, services: {} as Record<string, { addedAt: string }> }));
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return {
    ...real,
    getSecret: async (id: string) => (["fal", "openai", "meta", "gemini"].includes(id) ? "test-key" : undefined),
    readSettings: () => ({ services: { fal: { addedAt: "2026-10-28" }, openai: { addedAt: "2026-10-29" }, meta: { addedAt: "2026-10-29" }, ...settings.services }, checks: {}, make: settings.make }),
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
// The clip a service sends back: 6 seconds, 9:16, with its own sound (as a lip-synced one comes back saying its line).
const clipMade = join(root, "made.mp4");

beforeAll(async () => {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=540x960:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-pix_fmt", "yuv420p", "-shortest", clipMade]);
  server = createServer((req, res) => {
    const url = req.url ?? "";
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const send = (status: number, data: unknown, type = "application/json") => {
        res.writeHead(status, { "content-type": type });
        res.end(type === "application/json" ? JSON.stringify(data) : (data as Buffer));
      };
      // Gemini's generateContent: the picture comes back as a part of the answer.
      if (url.startsWith("/gemini/")) {
        if (req.headers["x-goog-api-key"] !== "test-key") return send(400, { error: { message: "API key not valid", status: "INVALID_ARGUMENT" } });
        seen.direct.push({ url, type: String(req.headers["content-type"]), body });
        if (body.includes("free tier")) return send(429, { error: { message: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 0", status: "RESOURCE_EXHAUSTED" } });
        return send(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from("a made picture").toString("base64") } }] } }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 1290 } });
      }
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
      if (url.startsWith("/out/")) return send(200, url.endsWith(".mp4") ? readFileSync(clipMade) : Buffer.from("a picture"), url.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
      const status = url.match(/^\/queue\/([^/]+\/[^/]+)\/requests\/([^/]+)\/status/);
      if (status) {
        const n = (polls.get(status[2]!) ?? 0) + 1;
        polls.set(status[2]!, n);
        return send(200, n === 1 ? { status: "IN_QUEUE", queue_position: 2 } : n === 2 ? { status: "IN_PROGRESS" } : { status: "COMPLETED" });
      }
      const result = url.match(/^\/queue\/([^/]+\/[^/]+)\/requests\/([^/]+)$/);
      if (result) {
        const video = !/banana|image/.test(result[1]!);
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
  process.env.BEATSHEET_GEMINI = `${base}/gemini`;
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
  settings.services = {};
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
    expect(fit).toMatchObject({ model: "nano-banana-2.1", route: "fal", aspect: "9:16", usd: 0.08 });
    expect(jobs).toHaveLength(2);
    await make.driveJobs(PROJECT);

    expect(seen.submits.map((s) => s.endpoint)).toEqual(["google/nano-banana-2.1", "google/nano-banana-2.1"]);
    expect(seen.submits[0]!.input).toMatchObject({ prompt: "The cat strolls down the alley like it owns it", aspect_ratio: "9:16", num_images: 1 });
    expect(make.listJobs(PROJECT).map((j) => j.status)).toEqual(["done", "done"]);
    const s = shot("s2");
    expect(s.fidelity).toBe("board");
    expect(s.content).toMatchObject({ kind: "generated", take: "s2-take", takes: ["s2-take", "s2-take-2"], model: "nano-banana-2.1", provider: "fal" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take")!;
    expect(take.provenance).toMatchObject({ source: "generated", provider: "fal", model: "google/nano-banana-2.1", seed: 7, op: "image", job: jobs[0]!.id, costUsd: 0.04 });
    expect(readFileSync(take.path, "utf8")).toBe("a picture");
  });

  it("animates a board: uploads it, asks for the next length over the shot's, and trims the take to the middle", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2" });
    await make.driveJobs(PROJECT);
    const { fit } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "s2-take", model: "kling-2.5-turbo" });
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
    expect(() => make.startMake(PROJECT, { op: "video", prompt: "a long walk", seconds: 40 })).toThrow(/Makes up to (10|15|30)s; this shot is 40s/);
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

  it("asks MiniMax H3 for whole seconds at 768p, H3 Max for 1080p, and names the references for it", async () => {
    const { falInput, takesSeed } = await import("../src/fal.ts");
    expect(falInput("minimax-h3", { prompt: "x", seconds: 5.4, start: "u", end: "v", seed: 3 })).toEqual({ prompt: "x", duration: 6, resolution: "768P", image_url: "u", end_image_url: "v", seed: 3 });
    expect(falInput("minimax-h3-max", { prompt: "x", seconds: 5.4, aspect: "9:16" })).toEqual({ prompt: "x", duration: 5.4, resolution: "1080P", aspect_ratio: "9:16" });
    expect(falInput("minimax-h3-max-turbo", { prompt: "x", seconds: 7 })).toMatchObject({ duration: 7, resolution: "768P" });
    expect(falInput("minimax-h3", { prompt: "Two friends fence on a pier.", seconds: 5, aspect: "16:9", refs: ["a", "b"] })).toEqual({
      prompt: "Two friends fence on a pier. Image 1 to Image 2 are references for who and what is in it.",
      duration: 5,
      resolution: "768P",
      reference_image_urls: ["a", "b"],
      aspect_ratio: "16:9",
    });
    expect(takesSeed("minimax-h3-max")).toBe(true);
  });

  it("asks the models that make roughs and finals both for a rough's size or a final's", async () => {
    const { falInput, takesSeed } = await import("../src/fal.ts");
    // Wan 3.0: 480p and 1080p, whole seconds, its start frame by its own name.
    expect(falInput("wan-3", { prompt: "x", quality: "rough", seconds: 5.4, start: "u", end: "v", seed: 3 })).toEqual({ prompt: "x", duration: 6, resolution: "480p", start_image_url: "u", end_image_url: "v", seed: 3 });
    expect(falInput("wan-3", { prompt: "x", quality: "final", seconds: 5, aspect: "9:16" })).toEqual({ prompt: "x", duration: 5, resolution: "1080p", aspect_ratio: "9:16" });
    expect(falInput("wan-3", { prompt: "x", seconds: 5, refs: ["a"] })).toMatchObject({ prompt: "x Image 1 is a reference for who and what is in it.", reference_image_urls: ["a"], resolution: "480p" });
    expect(takesSeed("wan-3")).toBe(true);
    // Seedance 2.5: seconds as a string, references as @Image1…, and no seed of its own to give.
    expect(falInput("seedance-2.5", { prompt: "x", quality: "final", seconds: 4, start: "u" })).toEqual({ prompt: "x", duration: "4", resolution: "1080p", image_url: "u" });
    expect(falInput("seedance-2.5", { prompt: "x", seconds: 6, refs: ["a", "b"], aspect: "16:9" })).toEqual({
      prompt: "x @Image1 to @Image2 are references for who and what is in it.",
      duration: "6",
      resolution: "480p",
      image_urls: ["a", "b"],
      aspect_ratio: "16:9",
    });
    expect(takesSeed("seedance-2.5")).toBe(false);
    // Kling 4.0: 720p and 1080p.
    expect(falInput("kling-4", { prompt: "x", quality: "rough", seconds: 12, start: "u" })).toEqual({ prompt: "x", duration: 12, resolution: "720p", start_image_url: "u" });
    // Gemini Omni Flash: wide or tall, even from a picture.
    expect(falInput("gemini-omni", { prompt: "x", quality: "rough", seconds: 3.5, start: "u", aspect: "9:16" })).toEqual({ prompt: "x", duration: 4, resolution: "360p", aspect_ratio: "9:16", image_url: "u" });
    expect(falInput("gemini-omni", { prompt: "x", quality: "final", seconds: 8, aspect: "4:3" })).toMatchObject({ resolution: "1080p", aspect_ratio: "16:9" });
  });

  it("gives each lip sync model the board (or the clip) and what's said, in its own words", async () => {
    const { falInput } = await import("../src/fal.ts");
    const ask = { prompt: "The cat boasts, looking into the camera", start: `${base}/out/board.jpg`, audio: `${base}/out/said.wav`, seconds: 5, seed: 3 };
    const both = { image_url: ask.start, audio_url: ask.audio };
    expect(falInput("sync", ask)).toEqual(both);
    expect(falInput("sync", { ...ask, start: undefined, video: `${base}/out/take.mp4` })).toEqual({ video_url: `${base}/out/take.mp4`, audio_url: ask.audio, sync_mode: "cut_off" });
    expect(falInput("kling-avatar", ask)).toEqual({ ...both, prompt: ask.prompt });
    expect(falInput("omnihuman", ask)).toEqual({ ...both, prompt: ask.prompt });
    expect(falInput("veed-fabric", { ...ask, quality: "final" })).toEqual({ ...both, resolution: "720p" });
    expect(falInput("h3-max-lipsync", { ...ask, quality: "final" })).toEqual({ ...both, resolution: "1080P", seed: 3 });
    // InfiniteTalk on fal makes the frames it's asked for, not as many as the sound lasts: 5 seconds at 25 a second, on its fours plus one.
    expect(falInput("infinitalk", ask)).toEqual({ ...both, prompt: ask.prompt, num_frames: 125, resolution: "480p", seed: 3 });
    // LongCat makes segments: 5.8 seconds is one, 10.8 two.
    expect(falInput("longcat-avatar", { ...ask, seconds: 5.8 })).toEqual({ ...both, prompt: ask.prompt, num_segments: 1, resolution: "480p", seed: 3 });
    expect(falInput("longcat-avatar", { ...ask, seconds: 10.8, quality: "final" })).toMatchObject({ num_segments: 2, resolution: "720p" });
    expect(falInput("latentsync", { ...ask, start: undefined, video: `${base}/out/take.mp4` })).toEqual({ video_url: `${base}/out/take.mp4`, audio_url: ask.audio, seed: 3 });
  });

  it("gives Kling's motion control the board and the stretch of the clip, and GPT Image a size in the shot's shape", async () => {
    const { falInput } = await import("../src/fal.ts");
    expect(falInput("kling-motion", { prompt: "two knights duel", start: "u", video: "w" })).toEqual({ prompt: "two knights duel", image_url: "u", video_url: "w", character_orientation: "video", keep_original_sound: false });
    expect(falInput("gpt-image", { prompt: "x", aspect: "9:16", refs: ["a"] })).toEqual({ prompt: "x", image_size: { width: 864, height: 1536 }, quality: "medium", output_format: "jpeg", image_urls: ["a"] });
  });
});

describe("cast and sets", () => {
  it("makes a sheet for the cat from its photo, and the sheet becomes the cat's picture", async () => {
    const { fit } = make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    expect(fit).toMatchObject({ model: "nano-banana-2.1", endpoint: "google/nano-banana-2.1/edit", aspect: "16:9" });
    await make.driveJobs(PROJECT);

    const sent = seen.submits[0]!.input;
    expect(sent.image_urls).toEqual([`${base}/out/uploaded-1.jpg`]);
    // A photograph, said in so many words: "reference sheet" alone comes back drawn. The face shows once.
    expect(String(sent.prompt)).toMatch(
      /^A photographic reference sheet of the cat \(orange tabby, white chest\) in three panels side by side on a plain light gray background: a close-up of the head and face, with anything worn on them; a full-length front view cropped at the neck, so the face shows only once; and a full-length back view\./,
    );
    expect(String(sent.prompt)).toMatch(/photographed rather than drawn, nothing else in the picture and no text or labels\. The reference photos show the cat: keep the cat's features, markings, colors and shape exactly\.$/);
    const cat = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!;
    expect(cat.sheet).toBe("cat-sheet");
    expect(store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-sheet")).toMatchObject({ tags: ["sheet"], provenance: { cast: ["cat"] } });
  });

  it("gives a board the pictures of the cast its prompt names, describes them, and keeps the prompt as written on the shot", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    seen.submits = [];
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat/heist strolls down @alley like it owns it", count: 1 });
    await make.driveJobs(PROJECT);

    const sent = seen.submits[0]!;
    expect(sent.endpoint).toBe("google/nano-banana-2.1/edit");
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
    expect(String(seen.submits[1]!.input.prompt)).toMatch(
      /^A reference sheet of the cat \(orange tabby, white chest\) in three panels .*\. Nothing else in the picture and no text or labels, in the style of hand-drawn \(2D animation, clean ink lines\)\. The reference photos show the cat: keep/,
    );
    make.startMake(PROJECT, { op: "image", shot: "s2", prompt: "@cat strolls down @alley", count: 1 });
    await make.driveJobs(PROJECT);
    expect(String(seen.submits[2]!.input.prompt)).toMatch(
      /^the cat \(orange tabby, white chest; in the style of hand-drawn: 2D animation, clean ink lines\) strolls down the alley \(narrow, wet brick\)\. In the style of film noir \(black and white, hard shadows\)\./,
    );
  });

  it("refuses a sheet for someone who isn't in the cast", () => {
    expect(() => make.startMake(PROJECT, { op: "image", sheet: "dog" })).toThrow('No cast member "dog"');
  });

  it("makes a character's portrait from their own photos, and a look's from the plain one's chosen face", async () => {
    // The plain look's: from the cat's photo, in the shape of a portrait, and it becomes the chosen one. The photo is
    // tagged "portrait" for its shape, and is still read as a photo.
    store.updateFile(PROJECT, (d) => void (d.assets.find((a) => a.id === "cat-photo")!.tags = ["portrait"]));
    const { fit, jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", portrait: true, count: 1 });
    expect(fit).toMatchObject({ aspect: "4:5" });
    expect(jobs[0]).toMatchObject({ sheet: "cat", portrait: true, request: { refs: ["cat-photo"] } });
    await make.driveJobs(PROJECT);
    const prompt = String(seen.submits[0]!.input.prompt);
    expect(prompt).toMatch(/^A photographic head-and-shoulders portrait of the cat \(orange tabby, white chest\) facing the camera, with anything worn on the head or face/);
    expect(prompt).toMatch(/The reference photos show the cat: keep the cat's features, markings, colors and shape exactly\.$/);
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.portrait).toBe("cat-portrait");
    expect(store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-portrait")).toMatchObject({ tags: ["portrait"] });

    // A look's starts from that settled face, and says what's different.
    const look = make.startMake(PROJECT, { op: "image", sheet: "cat/heist", portrait: true, count: 1 });
    expect(look.jobs[0]!.request.refs).toEqual(["cat-portrait"]);
    expect(look.jobs[0]!.request.sent).toMatch(/The first reference picture is the cat's chosen portrait: keep the cat's face, hair and features exactly\. In this portrait: a tiny black eye mask\.$/);
    await make.driveJobs(PROJECT);
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.variants![0]!.portrait).toBe("cat-heist-portrait");
  });

  it("makes a character's sheet from its chosen portrait and its wardrobe, and says which picture is which", () => {
    store.updateFile(PROJECT, (d) => {
      d.assets.push({ id: "cat-portrait", kind: "image", path: d.assets[0]!.path, tags: ["portrait"] }, { id: "cape", kind: "image", path: d.assets[0]!.path });
      Object.assign(d.cast!.find((m) => m.id === "cat")!, { portrait: "cat-portrait", wardrobe: ["cape"], wears: "a red velvet cape" });
    });
    const { jobs } = make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    expect(jobs[0]!.request.refs).toEqual(["cat-portrait", "cape"]);
    expect(jobs[0]!.request.sent).toMatch(/^A photographic reference sheet of the cat \(orange tabby, white chest; a red velvet cape\) in three panels/);
    expect(jobs[0]!.request.sent).toMatch(
      /The first reference picture is the cat's chosen portrait: keep the cat's face, hair and features exactly\. The next reference picture shows the clothes to dress the cat in: copy the garments, colors, patterns and fit exactly, and take nothing else from it, not a face and not a place\.$/,
    );
  });

  it("cuts the clothes out of a photo below the face, into a look's wardrobe", async () => {
    const { wardrobeFrom } = await import("../src/castfrom.ts");
    const { projectDir } = await import("../src/paths.ts");
    const file = join(projectDir(PROJECT), "william.jpg");
    writeFileSync(file, await sharp({ create: { width: 200, height: 300, channels: 3, background: "#806040" } }).jpeg().toBuffer());
    store.updateFile(PROJECT, (d) =>
      void d.assets.push({ id: "william", kind: "image", path: file, subjects: [{ id: "face-1", kind: "face", label: "face", samples: [[0, 0.4, 0.1, 0.2, 0.2]] }] }),
    );
    expect(await wardrobeFrom(PROJECT, { asset: "william", look: "cat/heist" })).toEqual({ asset: "cat-heist-wardrobe", cropped: true });
    const made = store.loadProject(PROJECT).project.assets.find((a) => a.id === "cat-heist-wardrobe")!;
    expect(made).toMatchObject({ tags: ["wardrobe"], provenance: { source: "capture", refs: ["william"] } });
    // From just below the face (10% down, 20% tall, and a little room) to the bottom.
    expect(await sharp(made.path).metadata()).toMatchObject({ width: 200, height: 204 });
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.variants![0]!.wardrobe).toEqual(["cat-heist-wardrobe"]);
  });

  it("makes portraits only of characters", () => {
    expect(() => make.startMake(PROJECT, { op: "image", sheet: "alley", portrait: true })).toThrow("A portrait is of a character; @alley is a place");
  });

  it("makes the first sheet the chosen one and puts the next beside it, to choose between", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    make.startMake(PROJECT, { op: "image", sheet: "cat", count: 1 });
    await make.driveJobs(PROJECT);
    const cat = store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!;
    expect(cat.sheet).toBe("cat-sheet");
    expect(cat.sheets).toEqual(["cat-sheet-2"]);
  });
});

describe("roughs, finals and whole passes", () => {
  it("makes a final from the board with Kling 3, without its own sound, and the final replaces the rough", async () => {
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", count: 1 });
    await make.driveJobs(PROJECT);
    expect(shot("s2")).toMatchObject({ fidelity: "rough", content: { take: "s2-take-2" } });

    const { fit } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", quality: "final", model: "kling-3", count: 1 });
    expect(fit).toMatchObject({ model: "kling-3", seconds: 5, usd: 0.56 });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)!.input).toEqual({ prompt: "The cat strolls down the alley like it owns it", duration: "5", start_image_url: `${base}/out/uploaded-2.jpg`, generate_audio: false });
    // The board is still where the clips start from, after a rough took its place.
    expect(shot("s2")).toMatchObject({ fidelity: "final", content: { take: "s2-take-3", start: "s2-take" } });
  });

  it("copies the movement in a clip on fal: cuts the stretch to follow, and sends it with the board to Kling's motion control", async () => {
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x480:r=25:d=6", "-pix_fmt", "yuv420p", join(dir, "fight.mp4")]);
    store.updateFile(PROJECT, (d) => void d.assets.push({ id: "fight", kind: "video", path: join(dir, "fight.mp4"), width: 640, height: 480, duration: 6 }));
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    // Without the graphics card for SCAIL-2 or Wan 2.2 Animate, fal's is the one ready.
    const { fit, jobs } = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", drive: { asset: "fight", from: 1, to: 4 }, count: 1 });
    expect(fit).toMatchObject({ model: "kling-motion", route: "fal", endpoint: "fal-ai/kling-video/v3/pro/motion-control", seconds: 4, usd: 0.672 });
    await make.driveJobs(PROJECT);

    expect(seen.submits.at(-1)!.input).toEqual({ prompt: "The cat strolls down the alley like it owns it", image_url: `${base}/out/uploaded-1.jpg`, video_url: `${base}/out/uploaded-2.jpg`, character_orientation: "video", keep_original_sound: false });
    // The stretch, half a second wider either side, at 720p in the clip's own shape and 30 frames a second.
    const cut = join(dir, ".cache", "drive", `${jobs[0]!.id}.mp4`);
    expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames", "-of", "csv=p=0", cut], { encoding: "utf8" }).trim()).toBe("960,720,120");
    expect(shot("s2")).toMatchObject({ fidelity: "rough", content: { take: "s2-take-2", in: 0.5 } });
  });

  it("makes the board say the line heard while the shot plays, lined up with it and silent, then redoes the mouths in that clip", async () => {
    const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
    // A line voiced in the cat's voice, heard from 3s to 4.5s, while s2 plays (2.5s to 5.7s).
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=1.5", join(dir, "boast.wav")]);
    store.updateProject(PROJECT, (p) => void (p.voice = { leadIn: 3, defaultGap: 0.5, tail: 1, lines: [{ id: "boast", text: "Nobody owns this alley but me.", file: join(dir, "boast.wav"), duration: 1.5, words: [], speaker: "cat" }] }));
    make.startMake(PROJECT, { op: "image", shot: "s2", count: 1 });
    await make.driveJobs(PROJECT);
    // Nothing but a lip sync model can say it, and Auto's is H3 Max Lip Sync: its shortest take, 5 seconds at 480p.
    const talk = make.startMake(PROJECT, { op: "video", shot: "s2", start: "board", speech: {}, count: 1 });
    expect(talk.fit).toMatchObject({ model: "minimax-h3-max-lipsync", endpoint: "minimax/h3-max/lip-sync/image-to-video", seconds: 5, usd: 0.25 });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)).toEqual({
      endpoint: "minimax/h3-max/lip-sync/image-to-video",
      input: { image_url: `${base}/out/uploaded-1.jpg`, audio_url: `${base}/out/uploaded-2.jpg`, resolution: "480P", seed: talk.jobs[0]!.request.seed },
    });
    // What it said: the shot widened by 0.9s either side, so the line starts 1.4s in.
    const said = execFileSync("ffmpeg", ["-v", "error", "-i", join(dir, ".cache", "speech", `${talk.jobs[0]!.id}.wav`), "-f", "s16le", "-ac", "1", "-ar", "8000", "-"]);
    const s = Array.from(new Int16Array(said.buffer, said.byteOffset, said.length / 2));
    const peak = (from: number, to: number) => Math.max(0, ...s.slice(from * 8000, to * 8000).map(Math.abs));
    expect(s.length / 8000).toBeCloseTo(5, 2);
    expect([peak(0, 1.3), peak(1.5, 2.8) > 1000, peak(3, 5)]).toEqual([0, true, 0]);
    // The take shows from where the shot starts in it, silent; the shot remembers what it says.
    expect(shot("s2")).toMatchObject({ fidelity: "rough", content: { take: "s2-take-2", start: "s2-take", speech: { lines: ["boast"] }, in: 0.9, model: "minimax-h3-max-lipsync" } });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "s2-take-2")!;
    expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", take.path], { encoding: "utf8" }).trim()).toBe("");

    // A final with the mouths redone in that clip: sync-3, sent the stretch the shot plays and half a second either side, in step with the line.
    const dub = make.startMake(PROJECT, { op: "video", shot: "s2", clip: "take", quality: "final", count: 1 });
    expect(dub.fit).toMatchObject({ model: "sync-3", endpoint: "fal-ai/sync-lipsync/v3", seconds: 4.2, usd: 0.56 });
    expect(dub.jobs[0]!.request).toMatchObject({ clip: { asset: "s2-take-2", from: 0.9, to: 4.1 }, speech: { lines: ["boast"], from: 2.5, to: 5.7 } });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)!.input).toEqual({ video_url: `${base}/out/uploaded-3.jpg`, audio_url: `${base}/out/uploaded-4.jpg`, sync_mode: "cut_off" });
    const cut = join(dir, ".cache", "dub", `${dub.jobs[0]!.id}.mp4`);
    expect(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", cut], { encoding: "utf8" }))).toBeCloseTo(4.2, 1);
    // It takes the place of the clip it was made from, and keeps the board that clip came from.
    expect(shot("s2")).toMatchObject({ fidelity: "final", content: { take: "s2-take-3", start: "s2-take", speech: { lines: ["boast"] }, in: 0.5, model: "sync-3" } });

    // A rough redo goes to Kling's lip sync, which takes a clip only 720 pixels or more a side.
    store.updateFile(PROJECT, (d) => void Object.assign(d.assets.find((a) => a.id === "s2-take-3")!, { width: 540, height: 960 }));
    const rough = make.startMake(PROJECT, { op: "video", shot: "s2", clip: "take", count: 1 });
    expect(rough.fit).toMatchObject({ model: "kling-lipsync", seconds: 4.2 });
    await make.driveJobs(PROJECT);
    expect(seen.submits.at(-1)!.endpoint).toBe("fal-ai/kling-video/lipsync/audio-to-video");
    expect(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(dir, ".cache", "dub", `${rough.jobs[0]!.id}.mp4`)], { encoding: "utf8" }).trim()).toBe("720,1280");
  });

  it("says a shot has no board yet when asked to start from one", () => {
    expect(() => make.startMake(PROJECT, { op: "video", shot: "s1", start: "board" })).toThrow('Shot "s1" has no board yet');
  });

  it("checks a whole pass against what may be spent before starting any of it", () => {
    const asks = ["s1", "s2"].map((shot) => ({ op: "image" as const, shot, count: 2 }));
    expect(make.estimate(PROJECT, asks).rows.find((r) => r.model === "nano-banana-2.1")).toMatchObject({ usd: 0.16, made: 2, unfit: [] });
    // With each shot's Auto pick (Nano Banana 2.1 here, the first ready one).
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
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.variants![0]!.sheet).toBe("cat-heist-sheet");
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
    expect(fit).toMatchObject({ route: "chatgpt", where: "ChatGPT plan", usd: 0, also: [{ route: "openai", usd: 0.03 }, { route: "fal", usd: 0.03 }] });
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
    expect(make.listJobs(PROJECT)[0]!.request.prompt).toMatch(/^A photographic reference sheet of @marmalade in three panels/);
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", sheet: "marmalade", asset: "marmalade-sheet" });
    expect(store.loadFile(PROJECT).doc.cast!.find((m) => m.id === "marmalade")!.sheet).toBe("marmalade-sheet");
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

  it("makes Nano Banana on a Gemini key, with the pictures inline and the shape in imageConfig", async () => {
    settings.services = { gemini: { addedAt: "2026-10-29" } };
    const { fit } = make.startMake(PROJECT, { op: "image", sheet: "cat", model: "nano-banana", count: 1 });
    expect(fit).toMatchObject({ route: "gemini", where: "Google Gemini", endpoint: "gemini-2.5-flash-image", usd: 0.039 });
    await make.driveJobs(PROJECT);
    expect(seen.direct[0]!.url).toBe("/gemini/models/gemini-2.5-flash-image:generateContent");
    const sent = JSON.parse(seen.direct[0]!.body) as { contents: { parts: Record<string, unknown>[] }[]; generationConfig: unknown };
    expect(sent.contents[0]!.parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: Buffer.from("the cat").toString("base64") } });
    expect(sent.generationConfig).toEqual({ responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } });
    // 300 tokens in at $0.30 a million and 1,290 out at $30.
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", route: "gemini", usd: 0.0388, asset: "cat-sheet" });

    // A key with no allowance for pictures says so once, rather than trying again and again.
    make.startMake(PROJECT, { op: "image", prompt: "the free tier", model: "nano-banana", count: 1 });
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[1]).toMatchObject({ status: "failed", error: expect.stringContaining("limit: 0") });
    expect(seen.direct).toHaveLength(2);
  });

  it("gives Muse Image the cast's pictures as data in JSON, and GPT Image as files in a form", async () => {
    make.startMake(PROJECT, { op: "image", sheet: "cat", model: "muse-image", count: 1 });
    await make.driveJobs(PROJECT);
    expect(seen.direct[0]!.url).toBe("/direct/meta/images/edits");
    const sent = JSON.parse(seen.direct[0]!.body) as Record<string, unknown>;
    expect(sent).toMatchObject({ model: "muse-image-1.0", size: "1536x864", response_format: "b64_json", images: [{ image_url: `data:image/jpeg;base64,${Buffer.from("the cat").toString("base64")}` }] });
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "done", usd: 0.01 });
    expect(store.loadProject(PROJECT).project.cast!.find((m) => m.id === "cat")!.sheet).toBe("cat-sheet");

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
