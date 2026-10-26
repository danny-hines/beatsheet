/**
 * SAM 3 on this Mac: Meta's Segment Anything 3 through its MLX port, so the person can cut out anything they describe
 * ("the dog", "the kids") without a key or an upload. Settings installs it in one go, all inside beatsheet's own folder:
 * uv (only if it isn't on the Mac already), a Python of its own, the port's locked packages, and the 3.4 GB of weights,
 * then checks it works. Remove deletes the folder.
 *
 * A small Python worker (`native/sam-worker.py`) does the cutting; it loads the model once and stays up for a few minutes
 * after the last request, so a run of cut-outs doesn't reload it each time.
 *
 * On Windows it's SAM 3.1 instead, Meta's own code on the PC's NVIDIA card, which does video too: `sam-cuda.ts`. Each
 * function here hands over to it there.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { cliEnv } from "./agent/cli.ts";
import { REPO } from "./paths.ts";
import { download, du, findUv, stream } from "./pyenv.ts";
import * as cuda from "./sam-cuda.ts";
import { SETTINGS_DIR } from "./settings.ts";

/** SAM on the PC's NVIDIA card (Windows) rather than this Mac's GPU. */
const CUDA = process.platform === "win32";

const run = promisify(execFile);

/** The port, pinned: its lock file fixes every package version, so an install today matches one next month. */
const CODE = { repo: "Deekshith-Dade/mlx_sam3", commit: "9eacae749049e2b864fe63f90f3dd17c689bee03" };
/** The weights, converted for MLX by the mlx-community, pinned and checked byte for byte. */
const WEIGHTS = {
  url: "https://huggingface.co/mlx-community/sam3-image/resolve/b72a14d8127e17e6f2a3d2e075bbbf4307ba146e/model.safetensors",
  bytes: 3_402_867_661,
  sha256: "0ad4c3f42ecf706c4cda63cf58d621699491ed65012b3999284ea370984f7173",
};
/** About what an install takes on disk, with room to unpack. */
const NEEDS_GB = 6;

export const SAM_DIR = join(SETTINGS_DIR, "sam3");
const paths = {
  code: join(SAM_DIR, "code"),
  venv: join(SAM_DIR, "venv"),
  python: join(SAM_DIR, "venv", "bin", "python"),
  weights: join(SAM_DIR, "weights", "model.safetensors"),
  ready: join(SAM_DIR, "ready.json"),
  uv: join(SAM_DIR, "bin", "uv"),
};
const WORKER = join(REPO, "packages", "engine", "native", "sam-worker.py");

type Ready = { commit: string; at: string; loadSeconds: number; checkSeconds: number; bytes: number };
export type SamStatus = {
  /** "token" (Windows): it needs a Hugging Face token with access to Meta's model before it can install. */
  state: "unsupported" | "token" | "missing" | "installing" | "ready" | "error";
  detail: string;
  /** Which SAM: "sam3" (the MLX port, on a Mac) or "sam3.1" (Meta's own, on an NVIDIA card). */
  model?: "sam3" | "sam3.1";
  /** The graphics card it runs on (Windows). */
  gpu?: string;
  /** Where to ask Meta for the model, and to make a token (Windows). */
  links?: { access: string; token: string };
  /** While installing: what it's doing now, how far along, and the job the page can follow. */
  stage?: string;
  progress?: number;
  log?: string[];
  /** On disk, once installed. */
  bytes?: number;
  at?: string;
};

function supported(): string | undefined {
  if (process.platform !== "darwin") return "Needs a Mac";
  if (process.arch !== "arm64") return "Needs a Mac with Apple silicon (M1 or later)";
  // Darwin 22 is macOS 13, the oldest MLX runs on.
  if (Number(release().split(".")[0]) < 22) return "Needs macOS 13 or later";
}

function readReady(): Ready | undefined {
  try {
    const r = JSON.parse(readFileSync(paths.ready, "utf8")) as Ready;
    return existsSync(paths.python) && existsSync(paths.weights) ? r : undefined;
  } catch {
    return undefined;
  }
}

export const samReady = () => (CUDA ? cuda.samReady() : !supported() && !!readReady());

type Install = { stage: string; progress: number; log: string[]; error?: string; abort: AbortController; done?: boolean };
let install: Install | undefined;

export function samStatus(): SamStatus {
  if (CUDA) return cuda.samStatus();
  const why = supported();
  if (why) return { state: "unsupported", detail: why };
  if (install && !install.done) return { state: "installing", detail: install.stage, stage: install.stage, progress: install.progress, log: install.log.slice(-6) };
  const ready = readReady();
  if (ready) return { state: "ready", detail: `Ready · about ${Math.max(1, Math.round(ready.checkSeconds))}s a cut-out, once it's loaded`, bytes: ready.bytes, at: ready.at };
  if (install?.error) return { state: "error", detail: install.error, log: install.log.slice(-6) };
  return { state: "missing", detail: "Not installed" };
}

/**
 * Installs SAM 3 for this Mac, start to finish. Runs in the background; samStatus() follows along. Downloads resume
 * where they left off, so trying again after a dropped connection doesn't start over.
 */
export function installSam(): SamStatus {
  if (CUDA) return cuda.installSam();
  const why = supported();
  if (why) throw new Error(why);
  if (install && !install.done) return samStatus();
  const job: Install = { stage: "Starting", progress: 0, log: [], abort: new AbortController() };
  install = job;
  const log = (line: string) => {
    job.log.push(line);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  void (async () => {
    try {
      mkdirSync(SAM_DIR, { recursive: true });
      const free = statfsSync(SAM_DIR);
      const gb = (free.bavail * free.bsize) / 1e9;
      if (gb < NEEDS_GB) throw new Error(`Needs about ${NEEDS_GB} GB free; this Mac has ${gb.toFixed(1)} GB`);
      stopSam();
      rmSync(paths.ready, { force: true });

      // The packages and the weights download at the same time; the weights are most of the wait.
      let envDone = 0, weightsDone = 0;
      const update = () => {
        job.progress = Math.min(0.97, envDone * 0.25 + weightsDone * 0.7);
        const parts = [envDone < 1 ? "Setting up Python" : "", weightsDone < 1 ? `Downloading the model (${((weightsDone * WEIGHTS.bytes) / 1e9).toFixed(1)} of ${(WEIGHTS.bytes / 1e9).toFixed(1)} GB)` : ""];
        job.stage = parts.filter(Boolean).join(" · ") || "Checking it works";
      };
      const env = (async () => {
        const uv = await findUv(log, job.abort.signal);
        envDone = 0.1;
        await getCode(log, job.abort.signal);
        envDone = 0.2;
        await syncEnv(uv, log, job.abort.signal, (f) => {
          envDone = 0.2 + f * 0.8;
          update();
        });
        envDone = 1;
        update();
      })();
      const weights = download(WEIGHTS, paths.weights, job.abort.signal, (f) => {
        weightsDone = f;
        update();
      });
      update();
      await Promise.all([env, weights]);
      weightsDone = 1;

      job.stage = "Checking it works";
      job.progress = 0.97;
      const check = await selfCheck(log);
      // What uv downloaded is in the environment now.
      rmSync(join(SAM_DIR, "cache"), { recursive: true, force: true });
      const bytes = await du(SAM_DIR);
      writeFileSync(paths.ready, JSON.stringify({ commit: CODE.commit, at: new Date().toISOString(), loadSeconds: check.load, checkSeconds: check.segment, bytes } satisfies Ready, null, 2));
      job.progress = 1;
      log(`Ready: the model loads in ${check.load.toFixed(1)}s and cut out ${check.found} thing${check.found === 1 ? "" : "s"} in ${check.segment.toFixed(1)}s.`);
    } catch (err) {
      job.error = job.abort.signal.aborted ? "Stopped. Install again to pick up where it left off." : err instanceof Error ? err.message : String(err);
      log(job.error);
    } finally {
      job.done = true;
      rmSync(join(SAM_DIR, "cache"), { recursive: true, force: true });
    }
  })();
  return samStatus();
}

export function cancelSamInstall() {
  if (CUDA) return cuda.cancelSamInstall();
  install?.abort.abort();
}

/** Deletes everything the install put on this Mac. */
export function removeSam() {
  if (CUDA) return cuda.removeSam();
  if (install && !install.done) throw new Error("It's still installing; stop it first");
  stopSam();
  rmSync(SAM_DIR, { recursive: true, force: true });
  install = undefined;
}

// ---- Installing

/** The port's source at the pinned commit (it brings the tokenizer vocabulary and the lock file). */
async function getCode(log: (l: string) => void, signal: AbortSignal) {
  const marker = join(paths.code, ".commit");
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() === CODE.commit) return;
  const url = `https://codeload.github.com/${CODE.repo}/tar.gz/${CODE.commit}`;
  log(`Downloading ${CODE.repo} at ${CODE.commit.slice(0, 7)}`);
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Couldn't download the SAM 3 code (GitHub answered ${res.status})`);
  const tgz = join(SAM_DIR, "code.tar.gz");
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(tgz), { signal });
  rmSync(paths.code, { recursive: true, force: true });
  mkdirSync(paths.code, { recursive: true });
  await run("tar", ["-xzf", tgz, "-C", paths.code, "--strip-components", "1"]);
  rmSync(tgz, { force: true });
  writeFileSync(marker, CODE.commit);
}

/** The port's packages at the versions its lock file names, in an environment of our own on a Python of our own. */
async function syncEnv(uv: string, log: (l: string) => void, signal: AbortSignal, onProgress: (f: number) => void) {
  const env = {
    ...(await cliEnv()),
    UV_PROJECT_ENVIRONMENT: paths.venv,
    UV_PYTHON_INSTALL_DIR: join(SAM_DIR, "python"),
    UV_CACHE_DIR: join(SAM_DIR, "cache"),
    // Its own Python, so a Homebrew upgrade can't break it.
    UV_PYTHON_PREFERENCE: "only-managed",
    NO_COLOR: "1",
  };
  log("$ uv sync --frozen");
  let seen = 0;
  await stream(uv, ["sync", "--frozen", "--no-dev"], {
    cwd: paths.code,
    env,
    signal,
    onLine: (line) => {
      log(line);
      // uv names each step; enough to move the bar along.
      if (/^(Using|Downloading|Downloaded|Prepared|Installed|Creating|Resolved|Audited)/i.test(line.trim())) onProgress(Math.min(0.95, ++seen / 12));
    },
  });
  if (!existsSync(paths.python)) throw new Error("uv finished, but the Python environment isn't there");
  onProgress(1);
}

/** Loads the model and cuts out the car in one of the port's own demo pictures. */
async function selfCheck(log: (l: string) => void): Promise<{ load: number; segment: number; found: number }> {
  const out = join(SAM_DIR, "check");
  mkdirSync(out, { recursive: true });
  try {
    const t = Date.now();
    const w = await worker();
    const load = (Date.now() - t) / 1000;
    log(`The model loaded in ${load.toFixed(1)}s`);
    const r = await w.ask<{ cutouts: unknown[]; seconds: number }>({ op: "segment", image: join(paths.code, "assets", "images", "appdemo.png"), prompt: "car", out: join(out, "car") });
    return { load, segment: r.seconds, found: r.cutouts.length };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// ---- The worker

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void };
type Worker = { proc: ChildProcess; ask: <T>(req: Record<string, unknown>) => Promise<T> };

let current: Promise<Worker> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
/** The model takes ~4 GB of memory; let it go when nobody's cutting anything out. */
const IDLE_MS = 3 * 60_000;

function worker(): Promise<Worker> {
  current ??= new Promise<Worker>((resolve, reject) => {
    // Isolated (-I): only the environment's own packages, never something that happens to share a name in a nearby
    // folder. -B: no bytecode files left in the repo.
    const proc = spawn(paths.python, ["-I", "-B", WORKER, paths.code, paths.weights], { stdio: ["pipe", "pipe", "pipe"] });
    const pending = new Map<number, Pending>();
    let next = 1, buf = "", err = "", ready = false;
    const fail = (e: Error) => {
      current = undefined;
      for (const p of pending.values()) p.reject(e);
      pending.clear();
      if (!ready) reject(e);
    };
    proc.stderr!.on("data", (d) => (err = (err + d).slice(-4000)));
    proc.stdout!.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        let msg: { id?: number; ready?: boolean; ok?: boolean; error?: string };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.ready !== undefined) {
          if (!msg.ready) return fail(new Error(`SAM 3 couldn't start: ${msg.error}`));
          ready = true;
          resolve({
            proc,
            ask: <T>(req: Record<string, unknown>) =>
              new Promise<T>((ok, no) => {
                if (idle) clearTimeout(idle);
                const id = next++;
                pending.set(id, {
                  resolve: (v) => {
                    idle = setTimeout(stopSam, IDLE_MS);
                    ok(v as T);
                  },
                  reject: no,
                });
                proc.stdin!.write(JSON.stringify({ ...req, id }) + "\n");
              }),
          });
        } else if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.ok) p?.resolve(msg as Record<string, unknown>);
          else p?.reject(new Error(`SAM 3: ${msg.error}`));
        }
      }
    });
    proc.on("error", (e) => fail(e));
    proc.on("close", (code) => fail(new Error(`SAM 3 stopped (${code ?? "killed"})${err.trim() ? `: ${err.trim().split("\n").pop()}` : ""}`)));
  });
  return current;
}

export function stopSam() {
  if (CUDA) return cuda.stopSam();
  if (idle) clearTimeout(idle);
  const w = current;
  current = undefined;
  void w?.then((x) => x.proc.kill()).catch(() => {});
}

export type SamCutout = { file: string; box: { x: number; y: number; w: number; h: number }; score: number };

/**
 * Cuts out what `prompt` describes from a picture (anything PIL reads: JPEG, PNG, WebP, TIFF). One cut-out of
 * everything that matches, or with `each` one per match, largest first. Files are `${out}.png` or `${out}-1.png`, `-2`…
 */
export async function samSegment(image: string, prompt: string, out: string, opts: { each?: boolean; threshold?: number } = {}): Promise<SamCutout[]> {
  if (CUDA) return cuda.samSegment(image, prompt, out, opts);
  if (!samReady()) throw new Error("SAM 3 isn't installed on this Mac. Install it in Settings → On this Mac.");
  const w = await worker();
  const r = await w.ask<{ cutouts: SamCutout[] }>({ op: "segment", image, prompt, out, each: !!opts.each, threshold: opts.threshold ?? 0.5 });
  return r.cutouts;
}

/** Where what `prompt` describes is in a picture, best match first, without cutting anything out. */
export async function samFind(image: string, prompt: string, threshold = 0.5): Promise<{ box: SamCutout["box"]; score: number }[]> {
  if (CUDA) return cuda.samFind(image, prompt, threshold);
  if (!samReady()) throw new Error("SAM 3 isn't installed on this Mac. Install it in Settings → On this Mac.");
  const w = await worker();
  return (await w.ask<{ found: { box: SamCutout["box"]; score: number }[] }>({ op: "find", image, prompt, threshold })).found;
}
