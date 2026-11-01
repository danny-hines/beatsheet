import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

// ComfyUI is connected at the stand-in's address unless a test says it isn't; no keys.
const settings = vi.hoisted(() => ({ comfy: undefined as undefined | { url: string; addedAt: string } }));
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return { ...real, getSecret: async () => undefined, readSettings: () => ({ services: {}, checks: {}, comfy: settings.comfy }) };
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
      const asset: Asset = { id: aid, kind: "video", path: file, label: meta.label, tags: meta.tags, provenance: meta.provenance, width: 1280, height: 704, duration: 3 };
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
// done), the history and the file it saved. It can forget its jobs, as a restart does, and be missing a model.
type Seen = { uploads: string[]; prompts: { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }>; prompt_id: string; partial_execution_targets: string[] }[]; cancels: string[] };
let seen: Seen;
let missing: Set<string>;
let forget = false;
let server: Server;
let base = "";
let made = "";
const polls = new Map<string, number>();

beforeAll(async () => {
  comfy = await import("../src/comfy.ts");
  // Every model file the workflow that ships names, so a test can take one away.
  const shipped = comfy.loadWorkflow(comfy.workflowPath("scail2-animation", "fast")!);
  const models = [...new Set(Object.values(shipped).flatMap((n) => (/Loader/.test(n.class_type) ? Object.values(n.inputs).filter((v): v is string => typeof v === "string" && v.endsWith(".safetensors")) : [])))];
  made = join(root, "made.mp4");
  ff("-f", "lavfi", "-i", "testsrc2=s=1280x704:r=30", "-frames:v", "160", "-pix_fmt", "yuv420p", made);

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
      if (url.startsWith("/models/")) return send(200, models.filter((m) => !missing.has(m)));
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
        return send(200, { [history[1]!]: { outputs: { [p.partial_execution_targets[0]!]: { images: [{ filename: "take_00001_.mp4", subfolder: "beatsheet", type: "output" }], animated: [true] } } } });
      }
      if (url.startsWith("/view?")) return send(200, readFileSync(made));
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
  polls.clear();
  settings.comfy = { url: base, addedAt: "2026-11-01" };
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

describe("ComfyUI workflows", () => {
  it("ships SCAIL-2's fast and full workflows, each beatsheet can fill, in up to three chunks", () => {
    for (const profile of comfy.PROFILES) {
      const w = comfy.loadWorkflow(comfy.workflowPath("scail2-animation", profile)!);
      expect(comfy.checkWorkflow(w)).toEqual([]);
      expect(comfy.chunksIn(w)).toBe(3);
    }
    expect(comfy.chunksFor(90, 81, 76)).toEqual({ chunks: 2, capacity: 157 });
    expect(comfy.chunksFor(81, 81, 76)).toEqual({ chunks: 1, capacity: 81 });
    expect(comfy.fitSize(640, 480, 704 * 1280, 32)).toEqual({ width: 1088, height: 832 });
  });

  it("won't fill an input that's wired to another node, or a node it doesn't know", () => {
    const w = { "1": { class_type: "PrimitiveInt", inputs: { value: ["2", 0] }, _meta: { title: "STUDIO_SEED" } }, "2": { class_type: "Mystery", inputs: {}, _meta: { title: "STUDIO_WIDTH" } } };
    expect(() => comfy.fill(w, { STUDIO_SEED: 7 })).toThrow(/wired to another node/);
    expect(() => comfy.fill(w, { STUDIO_WIDTH: 640 })).toThrow(/Mystery node/);
    expect(comfy.checkWorkflow(w)).toEqual(expect.arrayContaining(["needs exactly one node titled STUDIO_REF_IMAGE", "needs a SaveVideo titled STUDIO_OUTPUT"]));
  });

  it("connects only a server that runs on a graphics card, and keeps its address without the trailing slash", async () => {
    const check = await comfy.checkComfy(base);
    expect(check).toMatchObject({ ok: true, detail: "NVIDIA GeForce RTX 4090 · 24 GB · ComfyUI 0.39.0", gpu: "NVIDIA GeForce RTX 4090" });
    expect(check.workflows.map((w) => [w.profile, w.problems])).toEqual([
      ["full", []],
      ["fast", []],
    ]);
    expect(await comfy.connectComfy("not an address")).toMatchObject({ ok: false, detail: expect.stringContaining("doesn't look like ComfyUI's address") });
  });
});
