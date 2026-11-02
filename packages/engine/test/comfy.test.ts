import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type Asset, type ProjectFile } from "@beatsheet/schema";

// The engine reads where projects live (and settings) when its modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-comfy-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");
process.env.BEATSHEET_MAKE_POLL_MS = "5";
// This computer, as far as the engine can tell: the PC with the 4090, unless a test says it's another.
const PC = JSON.stringify({ type: "cuda", name: "NVIDIA GeForce RTX 4090", memoryGb: 24 });
process.env.BEATSHEET_MACHINE = PC;

// ComfyUI is connected at the stand-in's address unless a test says it isn't, with what its last check found; no keys
// unless a test adds one.
type Connected = { url: string; addedAt: string; ok?: boolean; detail?: string; device?: { type: string; name: string; memoryGb?: number }; workflows?: Record<string, string[]> };
const settings = vi.hoisted(() => ({ comfy: undefined as undefined | Connected, secrets: {} as Record<string, string> }));
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return {
    ...real,
    getSecret: async (id: string) => settings.secrets[id],
    readSettings: () => ({ services: {}, checks: {}, comfy: settings.comfy }),
    updateSettings: (fn: (s: { services: object; checks: object; comfy?: Connected }) => void) => {
      const s = { services: {}, checks: {}, comfy: settings.comfy };
      fn(s);
      settings.comfy = s.comfy;
      return s;
    },
  };
});
// Fetching a model file writes a stand-in for it, and says what it fetched (and with what token).
const fetched = vi.hoisted(() => [] as string[]);
const sentHeaders = vi.hoisted(() => [] as (Record<string, string> | undefined)[]);
vi.mock("../src/pyenv.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/pyenv.ts")>();
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  return {
    ...real,
    download: async (what: { url: string; headers?: Record<string, string> }, file: string, _signal: AbortSignal, onProgress: (f: number) => void) => {
      fetched.push(what.url);
      sentHeaders.push(what.headers);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "weights");
      onProgress(1);
    },
  };
});
vi.mock("../src/plans.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/plans.ts")>();
  return { ...real, planStates: () => ({}) };
});
// Adding an asset only records it (the real one probes it and makes previews).
vi.mock("../src/ingest.ts", async () => {
  const { loadFile, updateFile } = await import("../src/store.ts");
  return {
    addAsset: async (id: string, file: string, meta: { id?: string; label?: string; tags?: string[]; provenance?: Asset["provenance"] }) => {
      const used = new Set(loadFile(id).doc.assets.map((a) => a.id));
      let aid = meta.id ?? "take";
      for (let n = 2; used.has(aid); n++) aid = `${meta.id}-${n}`;
      const asset: Asset = /\.png$/.test(file)
        ? { id: aid, kind: "image", path: file, label: meta.label, tags: meta.tags, provenance: meta.provenance, width: 1680, height: 944 }
        : { id: aid, kind: "video", path: file, label: meta.label, tags: meta.tags, provenance: meta.provenance, width: 1280, height: 704, duration: 3 };
      updateFile(id, (d) => void d.assets.push(asset));
      return asset;
    },
  };
});

type Make = typeof import("../src/make.ts");
let make: Make;
let store: typeof import("../src/store.ts");
let comfy: typeof import("../src/comfy.ts");

const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const probe = (file: string) => {
  const s = (JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames", "-of", "json", file], { encoding: "utf8" })) as { streams: { width: number; height: number; nb_read_frames: string }[] }).streams[0]!;
  return { width: s.width, height: s.height, frames: Number(s.nb_read_frames) };
};

// ---- A stand-in for ComfyUI: what it runs on, its nodes and models, uploads, the queue (waiting, then running, then
// done), the history and the file it saved (a clip, or a picture from a SaveImage). It can forget its jobs, as a
// restart does, and be missing a model.
type Seen = { uploads: string[]; prompts: { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>; prompt_id: string; partial_execution_targets: string[] }[]; cancels: string[] };
let seen: Seen;
let missing: Set<string>;
let forget = false;
let elsewhere = false;
let server: Server;
let base = "";
let made = "";
let madeStill = "";
const polls = new Map<string, number>();

// Where the stand-in keeps its models, as a ComfyUI on this computer would say.
const modelsDir = join(root, "ComfyUI", "models");

beforeAll(async () => {
  comfy = await import("../src/comfy.ts");
  // Every model file the shipped workflows name (so a test can take one away), and their folders here.
  const folders = ["diffusion_models", "loras", "text_encoders", "clip_vision", "vae", "checkpoints"];
  const models = () => Object.keys(comfy.MODEL_FILES).filter((m) => !missing.has(m) || folders.some((f) => existsSync(join(modelsDir, f, m))));
  for (const f of folders) mkdirSync(join(modelsDir, f), { recursive: true });
  made = join(root, "made.mp4");
  ff("-f", "lavfi", "-i", "testsrc2=s=1280x704:r=30", "-frames:v", "160", "-pix_fmt", "yuv420p", made);
  madeStill = join(root, "made.png");
  ff("-f", "lavfi", "-i", "testsrc2=s=1680x944", "-frames:v", "1", madeStill);

  server = createServer((req, res) => {
    const url = req.url ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (d: Buffer) => chunks.push(d));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { "content-type": Buffer.isBuffer(data) ? "video/mp4" : "application/json" });
        res.end(Buffer.isBuffer(data) ? data : JSON.stringify(data));
      };
      if (url === "/system_stats") return send(200, { system: { comfyui_version: "0.39.0" }, devices: [{ name: "cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync", type: "cuda", vram_total: 24 * 2 ** 30 }] });
      const info = url.match(/^\/object_info\/(.+)$/);
      if (info) return send(200, { [decodeURIComponent(info[1]!)]: {} });
      if (url.startsWith("/models/")) return send(200, models());
      // Its folders: here, or (as a ComfyUI on another computer would say) somewhere that isn't on this one.
      if (url === "/internal/folder_paths")
        return send(200, Object.fromEntries(folders.map((f) => [f, elsewhere ? [`Z:/elsewhere/models/${f}`] : [join(modelsDir, f), join(root, "ComfyUI", "output", f)]])));
      if (url === "/upload/image" && req.method === "POST") {
        const name = /filename="([^"]+)"/.exec(body.toString("latin1"))![1]!;
        seen.uploads.push(name);
        return send(200, { name, subfolder: "beatsheet", type: "input" });
      }
      if (url === "/prompt" && req.method === "POST") {
        const p = JSON.parse(body.toString("utf8")) as Seen["prompts"][number];
        seen.prompts.push(p);
        polls.set(p.prompt_id, 0);
        return send(200, { prompt_id: p.prompt_id, number: seen.prompts.length, node_errors: {} });
      }
      const cancel = url.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
      if (cancel) {
        seen.cancels.push(cancel[1]!);
        return send(200, { cancelled: true });
      }
      const job = url.match(/^\/api\/jobs\/([^/]+)$/);
      if (job) {
        const id = job[1]!;
        if (!polls.has(id)) return send(404, { error: "Job not found" });
        // A restart: it forgets the job, once.
        if (forget) {
          forget = false;
          polls.delete(id);
          return send(404, { error: "Job not found" });
        }
        const n = polls.get(id)! + 1;
        polls.set(id, n);
        return send(200, { id, status: n === 1 ? "pending" : n === 2 ? "in_progress" : "completed" });
      }
      if (url === "/queue") return send(200, { queue_running: [], queue_pending: [...polls.keys()].map((id, i) => [i + 1, id]) });
      const history = url.match(/^\/history\/([^/]+)$/);
      if (history) {
        const p = seen.prompts.find((x) => x.prompt_id === history[1])!;
        const target = p.partial_execution_targets[0]!;
        const still = p.prompt[target]!.class_type === "SaveImage";
        return send(200, { [history[1]!]: { outputs: { [target]: { images: [{ filename: still ? "take_00001_.png" : "take_00001_.mp4", subfolder: "beatsheet", type: "output" }], animated: [!still] } } } });
      }
      if (url.startsWith("/view?")) return send(200, readFileSync(/\.png&/.test(url) ? madeStill : made));
      send(404, { error: `nothing at ${url}` });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  make = await import("../src/make.ts");
  store = await import("../src/store.ts");
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

// A 16:9 cut with one shot that has a board, and a clip of the fight as it was first filmed (4:3, 25 a second).
const PROJECT = "galileo";
beforeEach(() => {
  seen = { uploads: [], prompts: [], cancels: [] };
  missing = new Set();
  forget = false;
  elsewhere = false;
  polls.clear();
  fetched.length = 0;
  sentHeaders.length = 0;
  process.env.BEATSHEET_MACHINE = PC;
  settings.comfy = { url: base, addedAt: "2026-11-01" };
  settings.secrets = {};
  const dir = join(process.env.BEATSHEET_PROJECTS!, PROJECT);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  ff("-f", "lavfi", "-i", "color=red:s=1280x720", "-frames:v", "1", join(dir, "board.png"));
  ff("-f", "lavfi", "-i", "testsrc2=s=640x480:r=25:d=6", "-pix_fmt", "yuv420p", join(dir, "fight.mp4"));
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: PROJECT,
    title: "Galileo",
    sources: [],
    brief: { goal: "The duel, made again" },
    assets: [
      { id: "board", kind: "image", path: join(dir, "board.png"), width: 1280, height: 720, provenance: { source: "generated" } },
      { id: "fight", kind: "video", path: join(dir, "fight.mp4"), width: 640, height: 480, fps: 25, duration: 6 },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "film",
        spec: {},
        formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [{ id: "duel", track: "pic", duration: 2, content: { kind: "generated", prompt: "Galileo and the Inquisitor fight with candlesticks in a stone hall, static camera", take: "board", takes: ["board"] }, fidelity: "board" }],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

const shot = () => store.loadProject(PROJECT).project.shots.find((s) => s.id === "duel")!;

describe("copying movement from a clip on ComfyUI", () => {
  it("fits the board and the stretch to the workflow's size, pads the clip to whole chunks, fills the workflow, and trims the take back", async () => {
    const { fit, jobs } = make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "fight", from: 2, to: 4 }, count: 1 });
    // Two seconds of fight, with half a second either side: 3 seconds, at no charge.
    expect(fit).toMatchObject({ model: "scail-2", route: "comfy", endpoint: "scail2-animation", seconds: 3, usd: 0 });
    await make.driveJobs(PROJECT);
    const [job] = make.listJobs(PROJECT);
    expect(job).toMatchObject({ status: "done", comfy: { profile: "fast", frames: 90, fps: 30 } });

    expect(seen.uploads).toEqual([`${jobs[0]!.id}_ref.png`, `${jobs[0]!.id}_drive.mp4`]);
    // 90 frames need the first chunk and one more, so only that output (and what it needs) runs.
    const [sent] = seen.prompts;
    expect(sent!.prompt_id).toBe(job!.comfy!.id);
    expect(sent!.partial_execution_targets).toEqual(["271"]);
    const p = sent!.prompt;
    expect(p["30"]!.inputs.image).toBe(`beatsheet/${job!.id}_ref.png`);
    expect(p["155"]!.inputs.file).toBe(`beatsheet/${job!.id}_drive.mp4`);
    expect(p["271"]!.inputs.filename_prefix).toBe(`beatsheet/${job!.id}`);
    expect(p["324"]!.inputs.value).toBe(job!.request.seed);
    expect(p["323"]!.inputs.value).toBe("Galileo and the Inquisitor fight with candlesticks in a stone hall, static camera");
    // The board's shape at about 704×1280, in 32s; every chunk's size is set.
    for (const id of ["213:178", "262:236", "322:236"]) expect(p[id]!.inputs.value).toBe(1280);
    for (const id of ["213:179", "262:237", "322:237"]) expect(p[id]!.inputs.value).toBe(704);

    // What went up: the board at that size, and the stretch at 30 a second held out to the two chunks' 157 frames.
    const work = join(process.env.BEATSHEET_PROJECTS!, PROJECT, ".cache", "comfy", job!.id);
    expect(probe(join(work, "drive.mp4"))).toEqual({ width: 1280, height: 704, frames: 157 });
    expect(probe(join(work, "ref.png"))).toMatchObject({ width: 1280, height: 704 });
    // What came back is trimmed to the 3-second stretch.
    expect(probe(job!.file!)).toEqual({ width: 1280, height: 704, frames: 90 });

    // The shot shows it from where the asked-for stretch starts, and remembers what it followed.
    const s = shot();
    expect(s.fidelity).toBe("rough");
    expect(s.content).toMatchObject({ kind: "generated", take: "duel-take", start: "board", drive: { asset: "fight", from: 2, to: 4 }, in: 0.5, model: "scail-2", provider: "comfy" });
    const take = store.loadProject(PROJECT).project.assets.find((a) => a.id === "duel-take")!;
    expect(take.provenance).toMatchObject({ provider: "comfy", model: "scail2-animation", refs: ["board", "fight"], params: { drive: { asset: "fight", from: 2, to: 4 }, workflow: "scail2-animation.fast" } });
  });

  it("makes a final with the full workflow, following what the shot's takes followed", async () => {
    make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "fight", from: 2, to: 4 }, count: 1 });
    await make.driveJobs(PROJECT);
    const { fit } = make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", quality: "final", count: 1 });
    expect(fit.model).toBe("scail-2");
    await make.driveJobs(PROJECT);
    const final = make.listJobs(PROJECT).at(-1)!;
    expect(final).toMatchObject({ quality: "final", request: { drive: { asset: "fight", from: 2, to: 4 } }, comfy: { profile: "full" } });
    expect(shot().content).toMatchObject({ take: "duel-take-2" });
    // Asked for without one, it's an ordinary clip again.
    expect(make.makeChoices(PROJECT, { op: "video", shot: "duel", start: "board", drive: null }).req.drive).toBeUndefined();
  });

  it("follows the same render after a restart, and sends the saved prompt again when ComfyUI has forgotten it", async () => {
    make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "fight", from: 0, to: 2 }, count: 1 });
    forget = true;
    await make.driveJobs(PROJECT);
    expect(seen.prompts).toHaveLength(2);
    expect(seen.prompts[1]!.prompt_id).toBe(seen.prompts[0]!.prompt_id);
    expect(seen.uploads).toHaveLength(2);
    expect(make.listJobs(PROJECT)[0]!.status).toBe("done");
  });

  it("says what ComfyUI is missing before sending anything", async () => {
    missing.add("wan2.1_14B_SCAIL_2_fp8_scaled.safetensors");
    make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "fight", from: 2, to: 4 }, count: 1 });
    await make.driveJobs(PROJECT);
    expect(seen.prompts).toHaveLength(0);
    expect(make.listJobs(PROJECT)[0]).toMatchObject({ status: "failed", error: expect.stringContaining("model diffusion_models/wan2.1_14B_SCAIL_2_fp8_scaled.safetensors is missing") });
  });

  it("stops a job in ComfyUI when it's canceled", async () => {
    const { jobs } = make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "fight", from: 2, to: 4 }, count: 1 });
    // Sent, but not yet finished.
    let job = make.listJobs(PROJECT)[0]!;
    for (let i = 0; i < 200 && !job.comfy; i++) {
      await new Promise((r) => setTimeout(r, 20));
      job = make.listJobs(PROJECT)[0]!;
    }
    await make.cancelJobs(PROJECT, [jobs[0]!.id]);
    expect(seen.cancels).toEqual([job.comfy!.id]);
    await make.driveJobs(PROJECT);
    expect(make.listJobs(PROJECT)[0]!.status).toBe("canceled");
  });

  it("refuses a stretch that isn't there, and says ComfyUI needs connecting when it isn't", () => {
    expect(() => make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "fight", from: 7 } })).toThrow(/Nothing to follow in "fight" between 7s and 6s/);
    expect(() => make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "board", from: 0 } })).toThrow(/the movement to copy comes from a clip/);
    settings.comfy = undefined;
    expect(() => make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: { asset: "fight", from: 2, to: 4 } })).toThrow(/SCAIL-2: Runs on ComfyUI/);
  });
});

describe("Wan 2.2 from a board on ComfyUI", () => {
  it("makes a rough at the small size, a whole number of fours plus one frames at 16 a second, with no clip to follow", async () => {
    const { fit } = make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: null, model: "wan-2.2", via: "comfy", count: 1 });
    // The 2-second shot with half a second either side: 3 seconds, at no charge.
    expect(fit).toMatchObject({ model: "wan-2.2", route: "comfy", endpoint: "wan22-i2v", seconds: 3, usd: 0 });
    await make.driveJobs(PROJECT);
    const [job] = make.listJobs(PROJECT);
    expect(job).toMatchObject({ status: "done", comfy: { profile: "fast", frames: 49, fps: 16 } });
    expect(seen.uploads).toEqual([`${job!.id}_ref.png`]);
    const p = seen.prompts[0]!.prompt;
    expect(seen.prompts[0]!.partial_execution_targets).toEqual(["32"]);
    expect([p["3"]!.inputs.value, p["4"]!.inputs.value, p["5"]!.inputs.value, p["31"]!.inputs.fps]).toEqual([848, 480, 49, 16]);
    // The 4-step LoRAs make it quick.
    expect(p["13"]!.inputs.lora_name).toBe("wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors");
    expect(probe(job!.file!).frames).toBe(49);
    expect(shot().content).toMatchObject({ take: "duel-take", model: "wan-2.2", provider: "comfy" });
    expect((shot().content as { drive?: unknown }).drive).toBeUndefined();
  });

  it("keeps a final to 5 seconds on the card, and makes it at the full size with the full workflow", () => {
    const { fit } = make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: null, model: "wan-2.2", via: "comfy", quality: "final", seconds: 4.8, count: 1 });
    expect(fit).toMatchObject({ seconds: 5 });
    expect(comfy.profileFor("wan22-i2v", "final")).toBe("full");
    expect(comfy.framesFor(5, 16, 81)).toBe(81);
    expect(() => make.startMake(PROJECT, { op: "video", shot: "duel", start: "board", drive: null, model: "wan-2.2", via: "comfy", seconds: 7 })).toThrow(/Makes up to 5s; this shot is 7s/);
  });
});

describe("MiniMax H3 from a board on ComfyUI", () => {
  // Its own job and what was sent for it (a job a test before left queued may be driven alongside).
  const made = async (ask: Parameters<Make["startMake"]>[1]) => {
    const { fit, jobs } = make.startMake(PROJECT, ask);
    await make.driveJobs(PROJECT);
    const job = make.listJobs(PROJECT).find((j) => j.id === jobs[0]!.id)!;
    return { fit, job, p: seen.prompts.find((x) => x.prompt_id === job.comfy?.id)?.prompt ?? {}, uploads: seen.uploads.filter((u) => u.startsWith(job.id)) };
  };

  it("makes at least 5 seconds on its 17k+5 grid at 24 a second, and takes out the end frame it wasn't given", async () => {
    const { fit, job, p, uploads } = await made({ op: "video", shot: "duel", start: "board", drive: null, model: "minimax-h3", via: "comfy", count: 1 });
    // The 2-second shot comes out at the model's shortest, at no charge.
    expect(fit).toMatchObject({ model: "minimax-h3", route: "comfy", endpoint: "minimax-h3-i2v", seconds: 5, usd: 0 });
    expect(job).toMatchObject({ status: "done", comfy: { profile: "fast", frames: 124, fps: 24 } });
    expect([p["3"]!.inputs.value, p["4"]!.inputs.value, p["5"]!.inputs.value, p["32"]!.inputs.fps]).toEqual([832, 480, 124, 24]);
    expect(p["7"]).toBeUndefined();
    expect(p["20"]!.inputs.last_frame).toBeUndefined();
    expect(p["20"]!.inputs.first_frame).toEqual(["2", 0]);
    expect(uploads).toEqual([`${job.id}_ref.png`]);
  });

  it("ends on the picture it's given", async () => {
    const { job, p, uploads } = await made({ op: "video", shot: "duel", start: "board", end: "board", drive: null, model: "minimax-h3", via: "comfy", seconds: 6, count: 1 });
    // 6 seconds with half a second either side, rounded up to the grid.
    expect(job).toMatchObject({ status: "done", comfy: { frames: 175 } });
    expect(p["7"]!.inputs.image).toBe(`beatsheet/${job.id}_end.png`);
    expect(p["20"]!.inputs.last_frame).toEqual(["7", 0]);
    expect(uploads).toEqual([`${job.id}_ref.png`, `${job.id}_end.png`]);
    expect(comfy.framesFor(15, 24, 362, { step: 17, offset: 5 })).toBe(362);
  });
});

describe("FLUX 3 Image Klein's stills on ComfyUI", () => {
  const made = async (ask: Parameters<Make["startMake"]>[1]) => {
    const { fit, jobs } = make.startMake(PROJECT, ask);
    await make.driveJobs(PROJECT);
    const job = make.listJobs(PROJECT).find((j) => j.id === jobs[0]!.id)!;
    return { fit, job, p: seen.prompts.find((x) => x.prompt_id === job.comfy?.id)!.prompt, uploads: seen.uploads.filter((u) => u.startsWith(job.id)) };
  };

  it("makes a still in the shape asked for from its reference pictures, taking out the nodes for the ones it isn't given", async () => {
    // With only ComfyUI to make stills, Auto makes them there.
    expect(make.makeChoices(PROJECT, { op: "image", prompt: "Galileo at his telescope" }).choices.auto?.model).toBe("flux3-klein");
    const prompt = "Galileo at his telescope on a balcony at night, as in the picture";
    const { fit, job, p, uploads } = await made({ op: "image", prompt, refs: ["board"], aspect: "16:9", model: "flux3-klein", count: 1 });
    expect(fit).toMatchObject({ model: "flux3-klein", route: "comfy", endpoint: "flux3-klein", aspect: "16:9", usd: 0 });
    expect(job).toMatchObject({ status: "done", comfy: { profile: "full" } });
    expect(job.comfy!.frames).toBeUndefined();
    expect(seen.prompts.find((x) => x.prompt_id === job.comfy!.id)!.partial_execution_targets).toEqual(["46"]);
    // About 1536×1024's pixels, in 16:9 and in 16s.
    expect([p["3"]!.inputs.value, p["4"]!.inputs.value]).toEqual([1680, 944]);
    expect(p["1"]!.inputs.value).toBe(prompt);
    expect(p["6"]!.inputs.value).toBe(job.request.seed);
    expect(p["11"]!.inputs.image).toBe(`beatsheet/${job.id}_ref1.png`);
    for (let k = 12; k <= 20; k++) expect(p[String(k)], `node ${k}`).toBeUndefined();
    expect(Object.keys(p["42"]!.inputs).filter((k) => k.startsWith("images."))).toEqual(["images.image0"]);
    expect(uploads).toEqual([`${job.id}_ref1.png`]);
    // The board went up whole: a reference isn't cropped to the shape.
    expect(probe(join(process.env.BEATSHEET_PROJECTS!, PROJECT, ".cache", "comfy", job.id, "ref1.png"))).toMatchObject({ width: 1280, height: 720 });
    // The picture it saved comes in as a take, as it was.
    expect(job.file).toMatch(/\.png$/);
    expect(store.loadProject(PROJECT).project.assets.find((a) => a.id === job.asset)).toMatchObject({
      kind: "image",
      provenance: { provider: "comfy", model: "flux3-klein", refs: ["board"], params: { workflow: "flux3-klein.full", aspect: "16:9" } },
    });
  });

  it("makes one from the prompt alone, with no picture to load", async () => {
    const { p, uploads } = await made({ op: "image", prompt: "An empty stone hall at dawn", aspect: "9:16", model: "flux3-klein", count: 1 });
    expect([p["3"]!.inputs.value, p["4"]!.inputs.value]).toEqual([944, 1680]);
    expect(Object.values(p).filter((n) => n.class_type === "LoadImage")).toEqual([]);
    expect(Object.keys(p["42"]!.inputs).some((k) => k.startsWith("images."))).toBe(false);
    expect(uploads).toEqual([]);
  });
});

describe("what each machine can run", () => {
  const drive = { op: "video" as const, shot: "duel", start: "board", drive: { asset: "fight", from: 2, to: 4 } };
  const board = { op: "video" as const, shot: "duel", start: "board", drive: null };
  const reason = (choices: ReturnType<typeof make.makeChoices>["choices"], model: string) => {
    const f = [...choices.setup, ...choices.unfit].find((x) => x.model === model);
    return f && !f.ok ? f.why : undefined;
  };

  it("on a laptop with no graphics card it could use, says so and points at a ComfyUI on another computer", () => {
    process.env.BEATSHEET_MACHINE = JSON.stringify({ type: "cpu", name: "Intel(R) UHD Graphics 620" });
    settings.comfy = undefined;
    const { choices } = make.makeChoices(PROJECT, drive);
    expect(reason(choices, "scail-2")).toEqual({
      kind: "connect",
      services: ["comfy"],
      reason:
        "Runs on ComfyUI. Needs an NVIDIA graphics card (its fp8 weights don't run on Apple's chips or a processor), and this computer has only Intel(R) UHD Graphics 620, no graphics card ComfyUI can use: connect a ComfyUI on a computer that can, by its address (Settings → Making)",
    });
  });

  it("connected to a Mac's own ComfyUI, offers the small Wan 2.2 and says the others need an NVIDIA card", () => {
    settings.comfy = { url: "http://127.0.0.1:8188", addedAt: "2026-11-01", ok: true, device: { type: "mps", name: "Apple M3 Pro", memoryGb: 36 } };
    const follow = make.makeChoices(PROJECT, drive).choices;
    expect(follow.auto).toBeUndefined();
    expect(reason(follow, "scail-2")).toEqual({ kind: "machine", service: "comfy", reason: "Needs an NVIDIA graphics card (its fp8 weights don't run on Apple's chips or a processor), and this computer has Apple M3 Pro" });
    const fromBoard = make.makeChoices(PROJECT, board).choices;
    expect(fromBoard.auto?.model).toBe("wan-2.2-5b");
    expect(reason(make.makeChoices(PROJECT, { op: "image", prompt: "A stone hall" }).choices, "flux3-klein")).toMatchObject({ kind: "machine", reason: expect.stringContaining("its INT8 weights don't run on Apple's chips") });
    // A Mac with too little memory for even that.
    settings.comfy.device = { type: "mps", name: "Apple M2", memoryGb: 16 };
    expect(reason(make.makeChoices(PROJECT, board).choices, "wan-2.2-5b")).toMatchObject({ kind: "machine", reason: "Needs about 32 GB of memory, and this computer's Apple M2 has 16 GB" });
  });

  it("from the Mac, runs everything on the PC's ComfyUI over the network", () => {
    process.env.BEATSHEET_MACHINE = JSON.stringify({ type: "mps", name: "Apple M3 Pro", memoryGb: 36 });
    settings.comfy = { url: "http://192.168.1.50:8188", addedAt: "2026-11-01", ok: true, device: { type: "cuda", name: "NVIDIA GeForce RTX 4090", memoryGb: 24 } };
    expect(make.makeChoices(PROJECT, drive).choices.auto?.model).toBe("scail-2");
    settings.comfy.device = { type: "cuda", name: "NVIDIA GeForce RTX 3060", memoryGb: 12 };
    expect(reason(make.makeChoices(PROJECT, drive).choices, "scail-2")).toMatchObject({ kind: "machine", reason: "Needs about 16 GB of graphics memory, and the ComfyUI at 192.168.1.50's NVIDIA GeForce RTX 3060 has 12 GB" });
  });

  it("says what the connected ComfyUI is missing, and fetches the model files into its own folders when it's on this computer", async () => {
    for (const f of ["wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"]) missing.add(f);
    const connected = await comfy.connectComfy(base);
    expect(connected.local).toBe(true);
    const fast = connected.workflows.find((w) => w.name === "wan22-i2v" && w.profile === "fast")!;
    expect(fast.problems).toEqual(["model diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors is missing (14 GB)", "model loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors is missing (1.2 GB)"]);
    // Neither of Wan 2.2's workflows has all it needs, so it's something to install.
    expect(reason(make.makeChoices(PROJECT, { ...board, model: undefined, via: "comfy" }).choices, "wan-2.2")).toMatchObject({ kind: "install", service: "comfy" });

    expect(await comfy.installModels(["wan22-i2v"])).toMatchObject({ state: "installing", files: ["wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"] });
    for (let i = 0; i < 100 && comfy.installStatus().state === "installing"; i++) await new Promise((r) => setTimeout(r, 20));
    expect(comfy.installStatus()).toMatchObject({ state: "done" });
    expect(fetched).toEqual([comfy.MODEL_FILES["wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"]!.url, comfy.MODEL_FILES["wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"]!.url]);
    expect(existsSync(join(modelsDir, "diffusion_models", "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"))).toBe(true);
    // Checked again afterwards: it has all it needs now.
    expect(settings.comfy!.workflows!["wan22-i2v.fast"]).toEqual([]);
    rmSync(join(modelsDir, "diffusion_models", "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"));
    rmSync(join(modelsDir, "loras", "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"));
  });

  it("fetches files shared only once their license is accepted with the person's Hugging Face token, and says what to do first", async () => {
    const klein = { "flux3-image-klein-int8-convrot.safetensors": "diffusion_models", "qwen3vl_4b_int8_convrot.safetensors": "text_encoders", "flux2-vae.safetensors": "vae" };
    for (const f of Object.keys(klein)) missing.add(f);
    // Hugging Face, as it answers a token: refused until its owner accepts the license, then sent on to the file.
    let access = 403;
    const realFetch = globalThis.fetch.bind(globalThis);
    const hf = vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith("https://huggingface.co/") ? Promise.resolve(new Response(null, { status: access })) : realFetch(input, init),
    );
    try {
      const connected = await comfy.connectComfy(base);
      const gated = "black-forest-labs/flux-3-image-klein-comfy";
      expect(connected.workflows.find((w) => w.name === "flux3-klein")!.fetch).toEqual([
        { name: "flux3-image-klein-int8-convrot.safetensors", bytes: 5827874779, gated },
        { name: "qwen3vl_4b_int8_convrot.safetensors", bytes: 4858559240, gated },
        { name: "flux2-vae.safetensors", bytes: 336211292 },
      ]);
      expect(await comfy.installModels(["flux3-klein"])).toMatchObject({ state: "error", detail: expect.stringContaining(`accept it at https://huggingface.co/${gated} (signed in to Hugging Face), then add a Hugging Face token`) });
      settings.secrets.huggingface = "hf_test";
      expect(await comfy.installModels(["flux3-klein"])).toMatchObject({ state: "error", detail: expect.stringContaining(`can't fetch ${gated}'s files yet`) });
      expect(fetched).toEqual([]);
      access = 302;
      expect(await comfy.installModels(["flux3-klein"])).toMatchObject({ state: "installing" });
      for (let i = 0; i < 100 && comfy.installStatus().state === "installing"; i++) await new Promise((r) => setTimeout(r, 20));
      expect(comfy.installStatus()).toMatchObject({ state: "done" });
      // The gated two with the token; FLUX.2's VAE from Comfy-Org's open copy, without it.
      expect(fetched).toEqual(Object.keys(klein).map((f) => comfy.MODEL_FILES[f]!.url));
      expect(sentHeaders).toEqual([{ Authorization: "Bearer hf_test" }, { Authorization: "Bearer hf_test" }, undefined]);
    } finally {
      hf.mockRestore();
      for (const [f, folder] of Object.entries(klein)) rmSync(join(modelsDir, folder, f), { force: true });
    }
  });

  it("won't put files in a ComfyUI on another computer", async () => {
    elsewhere = true;
    missing.add("wan2.2_vae.safetensors");
    expect((await comfy.connectComfy(base)).local).toBe(false);
    expect(await comfy.installModels()).toMatchObject({ state: "error", detail: expect.stringContaining("isn't on this computer") });
    expect(fetched).toEqual([]);
  });
});

describe("ComfyUI workflows", () => {
  it("ships each clip's workflow fast and full and each still's full, each one beatsheet can fill, naming only model files it knows where to get", () => {
    for (const [name, spec] of Object.entries(comfy.WORKFLOWS)) {
      for (const profile of spec.still ? (["full"] as const) : comfy.PROFILES) {
        const w = comfy.loadWorkflow(comfy.workflowPath(name, profile)!);
        expect(comfy.checkWorkflow(w, spec), `${name}.${profile}`).toEqual([]);
        const files = Object.values(w).flatMap((n) => (/Loader/.test(n.class_type) ? Object.values(n.inputs).filter((v): v is string => typeof v === "string" && v.endsWith(".safetensors")) : []));
        expect(files.filter((f) => !comfy.MODEL_FILES[f]), `${name}.${profile}`).toEqual([]);
      }
    }
    expect(comfy.chunksIn(comfy.loadWorkflow(comfy.workflowPath("scail2-animation", "fast")!))).toBe(3);
    expect(comfy.chunksIn(comfy.loadWorkflow(comfy.workflowPath("wan-animate-move", "fast")!))).toBe(4);
    expect(comfy.refsIn(comfy.loadWorkflow(comfy.workflowPath("flux3-klein", "full")!))).toBe(10);
    // A still has no rough: it's made with the full workflow either way.
    expect(comfy.profileFor("flux3-klein", undefined)).toBe("full");
    expect(comfy.chunksFor(90, 81, 76)).toEqual({ chunks: 2, capacity: 157 });
    expect(comfy.chunksFor(81, 81, 76)).toEqual({ chunks: 1, capacity: 81 });
    expect(comfy.fitSize(640, 480, 704 * 1280, 32)).toEqual({ width: 1088, height: 832 });
  });

  it("won't fill an input that's wired to another node, or a node it doesn't know", () => {
    const w = { "1": { class_type: "PrimitiveInt", inputs: { value: ["2", 0] }, _meta: { title: "STUDIO_SEED" } }, "2": { class_type: "Mystery", inputs: {}, _meta: { title: "STUDIO_WIDTH" } } };
    expect(() => comfy.fill(w, { STUDIO_SEED: 7 })).toThrow(/wired to another node/);
    expect(() => comfy.fill(w, { STUDIO_WIDTH: 640 })).toThrow(/Mystery node/);
    expect(comfy.checkWorkflow(w)).toEqual(expect.arrayContaining(["needs exactly one node titled STUDIO_REF_IMAGE", "needs a SaveVideo titled STUDIO_OUTPUT"]));
    expect(comfy.checkWorkflow(w, { drive: false, still: true })).toEqual(expect.arrayContaining(["needs exactly one node titled STUDIO_PROMPT", "needs a SaveImage titled STUDIO_OUTPUT"]));
  });

  it("connects a server that answers, keeping what it runs on and that it has all each workflow needs", async () => {
    const check = await comfy.connectComfy(`${base}/`);
    expect(check).toMatchObject({ ok: true, detail: "NVIDIA GeForce RTX 4090 · 24 GB · ComfyUI 0.39.0", device: { type: "cuda", name: "NVIDIA GeForce RTX 4090", memoryGb: 24 } });
    expect(check.workflows.filter((w) => w.problems.length || w.machine)).toEqual([]);
    expect(settings.comfy).toMatchObject({ url: base, ok: true, device: { type: "cuda" }, workflows: { "scail2-animation.fast": [], "wan22-ti2v-5b.full": [] } });
    expect(await comfy.connectComfy("not an address")).toMatchObject({ ok: false, detail: expect.stringContaining("doesn't look like ComfyUI's address") });
  });
});
