/**
 * SAM 3.1 on a PC's NVIDIA card: Meta's own Segment Anything 3.1 (facebookresearch/sam3) with its video model, so the
 * person can find, follow and cut out anything they name, in photos and clips alike. Settings installs it in one go,
 * inside beatsheet's own folder (%LOCALAPPDATA%\beatsheet\sam3): uv (only if it isn't there already), a Python of its
 * own, PyTorch for CUDA 12.8, Triton for Windows, Meta's code at a pinned commit, and the 3.5 GB model. Meta gates the
 * model, so first the person asks for access on Hugging Face and gives beatsheet a token, kept in Credential Manager.
 *
 * One worker (`native/sam-cuda-worker.py`) loads the model once and stays up for a few minutes after the last request,
 * like the Mac's. Cards with less than 16 GB (an RTX 5070's 12 GB) work on smaller clips and keep frames in the
 * computer's memory. The Mac's SAM is in sam.ts, which hands over to this file on Windows.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { cliEnv } from "./agent/cli.ts";
import { REPO } from "./paths.ts";
import { containerTrouble, inContainer, run as runLaunch, systemExe, untarCommand, venvPython } from "./platform.ts";
import { download, du, findUv, stream } from "./pyenv.ts";
import type { SamCutout, SamStatus } from "./sam.ts";
import { getSecret, readSettings, setSecret, SETTINGS_DIR, updateSettings } from "./settings.ts";

/** Meta's code, pinned. SAM 3.1 came out in the same repository as SAM 3. */
export const CODE = { repo: "facebookresearch/sam3", commit: "f1647e8d0c1d280991f4d1b7d974c2704537fe66" };
/** The model, pinned to a revision of Meta's gated repository; its SHA-256 comes from Hugging Face with the token. */
export const MODEL = { repo: "facebook/sam3.1", revision: "daa63191845a41281374e725f4c9e51c7a824460", file: "sam3.1_multiplex.pt", bytes: 3_502_755_717 };
const PYTHON = "3.12";
/** PyTorch built for CUDA 12.8, which covers RTX 30, 40 and 50 cards (the 5070's Blackwell needs 12.8). */
const TORCH = { index: "https://download.pytorch.org/whl/cu128", packages: ["torch==2.10.0", "torchvision==0.25.0"] };
/**
 * What Meta's code needs beside PyTorch, pinned where it matters: numpy below 2 (as Meta's code asks), and an OpenCV
 * that still takes it; Triton 3.6 is the one for PyTorch 2.10; setuptools before 81 still has pkg_resources.
 */
const PACKAGES = [
  "triton-windows>=3.6,<3.7",
  "numpy>=1.26,<2",
  "opencv-python-headless==4.10.0.84",
  "scikit-image>=0.24,<0.26",
  "scipy>=1.13,<1.16",
  "pycocotools>=2.0.8",
  "setuptools<81",
  "timm>=1.0.17",
  "ftfy==6.1.1",
  "iopath>=0.1.10",
  "einops",
  "psutil",
  "regex",
  "tqdm",
  "typing_extensions",
  "huggingface_hub",
  "pillow",
];
/** About what an install takes on disk (PyTorch for CUDA is most of it), with room to unpack. */
const NEEDS_GB = 14;
/** The card it needs: CUDA 12.8 wants driver 570 or later, and Triton an RTX 30 (compute 8.0) or newer. */
const MIN_DRIVER = 570;
const MIN_COMPUTE = 8.0;
const LINKS = { access: `https://huggingface.co/${MODEL.repo}`, token: "https://huggingface.co/settings/tokens" };

export const SAM_DIR = join(SETTINGS_DIR, "sam3");
const paths = {
  code: join(SAM_DIR, "code"),
  venv: join(SAM_DIR, "venv"),
  python: venvPython(join(SAM_DIR, "venv")),
  weights: join(SAM_DIR, "weights", MODEL.file),
  ready: join(SAM_DIR, "ready.json"),
};
const WORKER = join(REPO, "packages", "engine", "native", "sam-cuda-worker.py");

type Ready = { commit: string; model: string; at: string; loadSeconds: number; checkSeconds: number; bytes: number; gpu: string; triton: string };

// ---- The card

export type Gpu = { name: string; memoryMb: number; driver: number; compute: number };

/** What `nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader,nounits` says. */
export function parseGpus(csv: string): Gpu[] {
  return csv
    .split(/\r?\n/)
    .map((l) => l.split(",").map((x) => x.trim()))
    .filter((f) => f.length >= 4 && f[0])
    .map(([name, mem, driver, compute]) => ({ name: name!, memoryMb: Number(mem), driver: Number(driver!.split(".")[0]), compute: Number(compute) }));
}

let gpuCache: { gpu?: Gpu; why?: string } | undefined;
/** The NVIDIA card (the biggest, if there are several), asked once: the driver installs nvidia-smi. */
export function gpu(): { gpu?: Gpu; why?: string } {
  if (gpuCache) return gpuCache;
  try {
    const csv = execFileSync(systemExe("nvidia-smi.exe"), ["--query-gpu=name,memory.total,driver_version,compute_cap", "--format=csv,noheader,nounits"], { timeout: 8000, windowsHide: true }).toString();
    const best = parseGpus(csv).sort((a, b) => b.memoryMb - a.memoryMb)[0];
    gpuCache = best ? { gpu: best } : { why: "Needs an NVIDIA graphics card" };
  } catch {
    gpuCache = { why: "Needs an NVIDIA graphics card (and its driver: nvidia-smi didn't answer)" };
  }
  return gpuCache;
}

/** Why this PC can't run it, if it can't. */
export function unsupported(g = gpu(), platform: NodeJS.Platform = process.platform, arch = process.arch): string | undefined {
  if (platform !== "win32" || arch !== "x64") return "Needs Windows on a 64-bit PC";
  if (!g.gpu) return g.why;
  if (g.gpu.compute && g.gpu.compute < MIN_COMPUTE) return `Needs an RTX 30-series card or newer (this one is ${g.gpu.name})`;
  if (g.gpu.driver && g.gpu.driver < MIN_DRIVER) return `Update the NVIDIA driver to ${MIN_DRIVER} or later (this one is ${g.gpu.driver}), then restart beatsheet`;
}

/**
 * How big a clip this card takes: frames this long on their long side, and how much of a clip at once. A 4090's 24 GB
 * does full HD; a 5070's 12 GB, 1280.
 */
export function videoLimits(g = gpu().gpu): { maxSide: number; maxSeconds: number; low: boolean } {
  const low = !g || g.memoryMb < 16_000;
  return low ? { maxSide: 1280, maxSeconds: 20, low } : { maxSide: 1920, maxSeconds: 30, low };
}

// ---- Status and install

function readReady(): Ready | undefined {
  try {
    const r = JSON.parse(readFileSync(paths.ready, "utf8")) as Ready;
    return existsSync(paths.python) && existsSync(paths.weights) ? r : undefined;
  } catch {
    return undefined;
  }
}

export const samReady = () => !unsupported() && !!readReady();

type Install = { stage: string; progress: number; log: string[]; error?: string; abort: AbortController; done?: boolean };
let install: Install | undefined;

export function samStatus(): SamStatus {
  const g = gpu().gpu;
  const base = { model: "sam3.1" as const, gpu: g ? `${g.name} · ${Math.round(g.memoryMb / 1024)} GB` : undefined, links: LINKS };
  const why = unsupported();
  if (why) return { ...base, state: "unsupported", detail: why };
  if (install && !install.done) return { ...base, state: "installing", detail: install.stage, stage: install.stage, progress: install.progress, log: install.log.slice(-6) };
  const ready = readReady();
  if (ready) return { ...base, state: "ready", detail: `Ready · about ${Math.max(1, Math.round(ready.checkSeconds))}s a cut-out, once it's loaded`, bytes: ready.bytes, at: ready.at };
  if (install?.error) return { ...base, state: "error", detail: install.error, log: install.log.slice(-6) };
  if (!readSettings().huggingface) return { ...base, state: "token", detail: "Meta shares the model with people who ask: ask for access, then add a Hugging Face token" };
  return { ...base, state: "missing", detail: `Not installed${readSettings().huggingface?.name ? ` · Hugging Face: ${readSettings().huggingface!.name}` : ""}` };
}

const hf = (path: string, token: string, init: RequestInit = {}) =>
  fetch(`https://huggingface.co${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(20_000) });

/**
 * Checks a Hugging Face token can download the model (it's signed in, and Meta has said yes to its owner), then keeps
 * it in Credential Manager. Nothing is downloaded yet.
 */
export async function setSamToken(token: string): Promise<SamStatus> {
  token = token.trim();
  if (!/^hf_\w{20,}$/.test(token)) throw new Error("That doesn't look like a Hugging Face token (they start with hf_)");
  const who = await hf("/api/whoami-v2", token).catch((err: Error) => {
    throw new Error(`Couldn't reach Hugging Face (${err.message})`);
  });
  if (who.status === 401) throw new Error("Hugging Face refused that token");
  if (!who.ok) throw new Error(`Hugging Face answered ${who.status}; try again shortly`);
  const name = ((await who.json()) as { name?: string }).name;
  const access = await hf(`/${MODEL.repo}/resolve/${MODEL.revision}/config.json`, token, { method: "HEAD", redirect: "manual" });
  if (access.status === 401 || access.status === 403)
    throw new Error(`The token works${name ? ` (${name})` : ""}, but Meta hasn't given you access to SAM 3.1 yet. Ask on its page (${LINKS.access}); it's usually a few minutes to an hour. Then add the token again.`);
  if (access.status >= 400) throw new Error(`Hugging Face answered ${access.status} for the model; try again shortly`);
  await setSecret("huggingface", token);
  updateSettings((s) => void (s.huggingface = { name, addedAt: new Date().toISOString() }));
  return samStatus();
}

/** The model's SHA-256, as Hugging Face has it for the pinned revision (it shows only to people with access). */
async function modelHash(token: string): Promise<string> {
  const res = await hf(`/api/models/${MODEL.repo}/tree/${MODEL.revision}`, token);
  if (!res.ok) throw new Error(`Couldn't ask Hugging Face about the model (it answered ${res.status})`);
  const files = (await res.json()) as { path: string; size: number; lfs?: { oid: string; size: number } }[];
  const f = files.find((x) => x.path === MODEL.file);
  if (!f?.lfs?.oid || !/^[0-9a-f]{64}$/.test(f.lfs.oid)) throw new Error("Hugging Face didn't say what the model should be (no checksum); check your access, then try again");
  if (f.lfs.size !== MODEL.bytes) throw new Error("The model on Hugging Face isn't the one beatsheet expects");
  return f.lfs.oid;
}

/**
 * Installs SAM 3.1, start to finish, in the background; samStatus() follows along. The packages and the model download
 * at the same time; the model resumes where it left off.
 */
export function installSam(): SamStatus {
  const why = unsupported();
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
      const token = await getSecret("huggingface");
      if (!token) throw new Error("Add a Hugging Face token first (one with access to SAM 3.1)");
      mkdirSync(SAM_DIR, { recursive: true });
      const boxed = inContainer(SAM_DIR);
      if (boxed) throw new Error(containerTrouble(boxed));
      const free = statfsSync(SAM_DIR);
      const gb = (free.bavail * free.bsize) / 1e9;
      if (gb < NEEDS_GB) throw new Error(`Needs about ${NEEDS_GB} GB free; this PC has ${gb.toFixed(1)} GB on that drive`);
      for (const dll of ["vcruntime140.dll", "msvcp140.dll"])
        if (!existsSync(systemExe(dll))) throw new Error("PyTorch needs Microsoft's Visual C++ runtime. Install it (winget install Microsoft.VCRedist.2015+.x64 in a terminal), then try again.");
      stopSam();
      rmSync(paths.ready, { force: true });

      let envDone = 0, weightsDone = 0;
      const update = () => {
        job.progress = Math.min(0.97, envDone * 0.45 + weightsDone * 0.5);
        const parts = [envDone < 1 ? "Setting up Python and PyTorch for CUDA" : "", weightsDone < 1 ? `Downloading the model (${((weightsDone * MODEL.bytes) / 1e9).toFixed(1)} of ${(MODEL.bytes / 1e9).toFixed(1)} GB)` : ""];
        job.stage = parts.filter(Boolean).join(" · ") || "Checking it works";
      };
      const env = (async () => {
        const uv = await findUv(log, job.abort.signal, SAM_DIR);
        envDone = 0.05;
        await getCode(log, job.abort.signal);
        envDone = 0.1;
        await makeEnv(uv, log, job.abort.signal, (f) => {
          envDone = 0.1 + f * 0.9;
          update();
        });
        envDone = 1;
        update();
      })();
      const weights = (async () => {
        const sha256 = await modelHash(token);
        const url = `https://huggingface.co/${MODEL.repo}/resolve/${MODEL.revision}/${MODEL.file}`;
        log(`Downloading ${MODEL.repo}/${MODEL.file}`);
        await download({ url, bytes: MODEL.bytes, sha256, headers: { Authorization: `Bearer ${token}` } }, paths.weights, job.abort.signal, (f) => {
          weightsDone = f;
          update();
        });
      })();
      update();
      // Both finish (or fail) before going on, so a failed download doesn't leave the packages half-installed.
      const settled = await Promise.allSettled([env, weights]);
      for (const r of settled) if (r.status === "rejected") throw r.reason;
      weightsDone = 1;

      job.stage = "Checking it works on the card";
      job.progress = 0.97;
      const check = await selfCheck(log);
      rmSync(join(SAM_DIR, "cache"), { recursive: true, force: true });
      const bytes = await du(SAM_DIR);
      writeFileSync(
        paths.ready,
        JSON.stringify({ commit: CODE.commit, model: MODEL.revision, at: new Date().toISOString(), loadSeconds: check.load, checkSeconds: check.segment, bytes, gpu: check.gpu, triton: check.triton } satisfies Ready, null, 2),
      );
      job.progress = 1;
      log(`Ready on the ${check.gpu}: the model loads in ${check.load.toFixed(1)}s and cut out ${check.found} thing${check.found === 1 ? "" : "s"} in ${check.segment.toFixed(1)}s. Triton: ${check.triton}.`);
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
  install?.abort.abort();
}

/**
 * Deletes everything the install put on this PC, once the worker has let go of its files (Windows won't delete a
 * running Python's). The token stays, for installing again.
 */
export async function removeSam() {
  if (install && !install.done) throw new Error("It's still installing; stop it first");
  await stopSam();
  rmSync(SAM_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  install = undefined;
}

/** Meta's code at the pinned commit (it brings the tokenizer vocabulary, and the demo picture the check uses). */
async function getCode(log: (l: string) => void, signal: AbortSignal) {
  const marker = join(paths.code, ".commit");
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() === CODE.commit) return;
  const url = `https://codeload.github.com/${CODE.repo}/tar.gz/${CODE.commit}`;
  log(`Downloading ${CODE.repo} at ${CODE.commit.slice(0, 7)}`);
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`Couldn't download Meta's SAM code (GitHub answered ${res.status})`);
  const tgz = join(SAM_DIR, "code.tar.gz");
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(tgz), { signal });
  rmSync(paths.code, { recursive: true, force: true });
  mkdirSync(paths.code, { recursive: true });
  const untar = untarCommand(tgz, paths.code);
  const r = await runLaunch(untar);
  if (r.code !== 0) throw new Error(`Couldn't unpack Meta's SAM code: ${r.err.trim().split("\n").pop()}`);
  rmSync(tgz, { force: true });
  writeFileSync(marker, CODE.commit);
}

/** A Python of its own, PyTorch for CUDA from PyTorch's index, then the rest from PyPI, then Meta's code itself. */
async function makeEnv(uv: string, log: (l: string) => void, signal: AbortSignal, onProgress: (f: number) => void) {
  const env = {
    ...(await cliEnv()),
    UV_PYTHON_INSTALL_DIR: join(SAM_DIR, "python"),
    UV_CACHE_DIR: join(SAM_DIR, "cache"),
    // Its own Python, so another install on the PC can't break it.
    UV_PYTHON_PREFERENCE: "only-managed",
    // PyTorch for CUDA is one 2.5 GB file; give it time.
    UV_HTTP_TIMEOUT: "300",
    NO_COLOR: "1",
  };
  let seen = 0;
  const onLine = (line: string) => {
    log(line);
    if (/^(Using|Downloading|Downloaded|Prepared|Installed|Creating|Resolved|Audited|Built)/i.test(line.trim())) onProgress(Math.min(0.95, ++seen / 40));
  };
  if (!existsSync(paths.python)) {
    log(`> uv venv --python ${PYTHON}`);
    await stream(uv, ["venv", "--python", PYTHON, paths.venv], { env, signal, onLine });
  }
  log(`> uv pip install ${TORCH.packages.join(" ")} (CUDA 12.8)`);
  await stream(uv, ["pip", "install", "--python", paths.python, "--index-url", TORCH.index, ...TORCH.packages], { env, signal, onLine });
  log("> uv pip install triton-windows and what Meta's code needs");
  await stream(uv, ["pip", "install", "--python", paths.python, ...PACKAGES], { env, signal, onLine });
  log(`> uv pip install sam3 (${CODE.commit.slice(0, 7)})`);
  await stream(uv, ["pip", "install", "--python", paths.python, "--no-deps", paths.code], { env, signal, onLine });
  onProgress(1);
}

/** Loads the model on the card and cuts out the truck in one of Meta's own demo pictures. */
async function selfCheck(log: (l: string) => void): Promise<{ load: number; segment: number; found: number; gpu: string; triton: string }> {
  const out = join(SAM_DIR, "check");
  mkdirSync(out, { recursive: true });
  try {
    const t = Date.now();
    const w = await worker();
    const load = (Date.now() - t) / 1000;
    log(`The model loaded in ${load.toFixed(1)}s on the ${w.info.gpu} (${w.info.vramGb} GB). Triton: ${w.info.triton}`);
    const image = [join(paths.code, "assets", "images", "truck.jpg"), join(paths.code, "assets", "images", "test_image.jpg")].find((p) => existsSync(p));
    if (!image) return { load, segment: 0, found: 0, gpu: w.info.gpu, triton: w.info.triton };
    const r = await w.ask<{ cutouts: unknown[]; seconds: number }>({ op: "segment", image, prompt: "truck", out: join(out, "check") });
    return { load, segment: r.seconds, found: r.cutouts.length, gpu: w.info.gpu, triton: w.info.triton };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// ---- The worker

type Info = { gpu: string; vramGb: number; low: boolean; triton: string };
type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void; onProgress?: (f: number) => void };
type Worker = { proc: ChildProcess; info: Info; ask: <T>(req: Record<string, unknown>, onProgress?: (f: number) => void) => Promise<T> };

let current: Promise<Worker> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
/** The model takes several GB of the card's memory; let it go when nobody's using it. */
const IDLE_MS = 3 * 60_000;

function worker(): Promise<Worker> {
  if (current) return current;
  const mine: Promise<Worker> = new Promise<Worker>((resolve, reject) => {
    // Isolated (-I) and no bytecode (-B), as on the Mac; UTF-8 pipes (-X utf8, which -I still honours), since Windows'
    // Python would read them in the old code page. The model never reaches for the network once it's here.
    const proc = spawn(paths.python, ["-I", "-B", "-X", "utf8", WORKER, paths.weights], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, HF_HUB_OFFLINE: "1", HF_HUB_DISABLE_TELEMETRY: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTORCH_CUDA_ALLOC_CONF: "expandable_segments:True", ...(videoLimits().low ? { BEATSHEET_SAM_LOW: "1" } : {}) },
    });
    const pending = new Map<number, Pending>();
    let next = 1, buf = "", err = "", ready = false;
    const fail = (e: Error) => {
      // A worker that stops after another has taken its place leaves the new one be.
      if (current === mine) current = undefined;
      for (const p of pending.values()) p.reject(e);
      pending.clear();
      if (!ready) reject(e);
    };
    proc.stderr!.on("data", (d) => (err = (err + d).slice(-4000)));
    proc.stdout!.on("data", (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        let msg: { id?: number; ready?: boolean; ok?: boolean; error?: string; progress?: number } & Partial<Info>;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.ready !== undefined) {
          if (!msg.ready) return fail(new Error(`SAM 3.1 couldn't start: ${msg.error}`));
          ready = true;
          resolve({
            proc,
            info: { gpu: msg.gpu ?? "graphics card", vramGb: msg.vramGb ?? 0, low: !!msg.low, triton: msg.triton ?? "unknown" },
            ask: <T>(req: Record<string, unknown>, onProgress?: (f: number) => void) =>
              new Promise<T>((ok, no) => {
                if (idle) clearTimeout(idle);
                const id = next++;
                pending.set(id, {
                  resolve: (v) => {
                    idle = setTimeout(stopSam, IDLE_MS);
                    ok(v as T);
                  },
                  reject: no,
                  onProgress,
                });
                proc.stdin!.write(JSON.stringify({ ...req, id }) + "\n");
              }),
          });
        } else if (msg.id !== undefined && msg.progress !== undefined && msg.ok === undefined) {
          pending.get(msg.id)?.onProgress?.(msg.progress);
        } else if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.ok) p?.resolve(msg as Record<string, unknown>);
          else p?.reject(new Error(`SAM 3.1: ${msg.error}`));
        }
      }
    });
    proc.on("error", (e) => fail(e));
    proc.on("close", (code) => fail(new Error(`SAM 3.1 stopped (${code ?? "killed"})${err.trim() ? `: ${err.trim().split("\n").pop()}` : ""}`)));
    // Writing to a worker that has just died mustn't take the engine with it.
    proc.stdin!.on("error", (e) => fail(e));
  });
  current = mine;
  return mine;
}

/** Stops the worker; resolves once its process has gone (and let go of its files). */
export function stopSam(): Promise<void> {
  if (idle) clearTimeout(idle);
  const w = current;
  current = undefined;
  return (w ?? Promise.reject(new Error("none")))
    .then(
      (x) =>
        new Promise<void>((done) => {
          if (x.proc.exitCode !== null || x.proc.signalCode !== null) return done();
          x.proc.once("exit", () => done());
          x.proc.kill();
        }),
    )
    .catch(() => {});
}

async function ready(): Promise<Worker> {
  if (!samReady()) throw new Error("SAM 3.1 isn't installed on this PC. Install it in Settings → On this PC.");
  return worker();
}

// ---- What it does

/**
 * Cuts out what `prompt` describes from a picture, or the one thing under `point` or in `box`. One cut-out of
 * everything that matches, or with `each` one per match, largest first. Files are `${out}.png` or `${out}-1.png`, `-2`…
 */
export async function samSegment(image: string, prompt: string | undefined, out: string, opts: { each?: boolean; threshold?: number; point?: { x: number; y: number }; box?: SamCutout["box"] } = {}): Promise<SamCutout[]> {
  const w = await ready();
  const r = await w.ask<{ cutouts: SamCutout[] }>({ op: "segment", image, prompt: prompt || undefined, point: opts.point, box: opts.box, out, each: !!opts.each, threshold: opts.threshold ?? 0.5 });
  return r.cutouts;
}

/** Where what `prompt` describes is in a picture, best match first, without cutting anything out. */
export async function samFind(image: string, prompt: string, threshold = 0.5): Promise<{ box: SamCutout["box"]; score: number }[]> {
  const w = await ready();
  return (await w.ask<{ found: { box: SamCutout["box"]; score: number }[] }>({ op: "find", image, prompt, threshold })).found;
}

/** Faces and people in a clip (cut to `fps` frames a second, starting `from` seconds into the original) or a photo. */
export async function samSubjects(video: string, fps: number, from: number, onProgress?: (f: number) => void): Promise<{ tracks: { kind: "face" | "person"; samples: number[][] }[] }> {
  const w = await ready();
  return w.ask({ op: "subjects", video, fps, from }, onProgress);
}

/** Follows what's in `box` at `at` seconds both ways through the clip. */
export async function samTrack(video: string, fps: number, from: number, at: number, box: SamCutout["box"], onProgress?: (f: number) => void): Promise<{ samples: number[][] }> {
  const w = await ready();
  return w.ask({ op: "track", video, fps, from, at, box }, onProgress);
}

/**
 * Every frame of a clip with only the subject left in it, piped to `encoder` (an ffmpeg command line in which `{size}`
 * and `{fps}` are filled in). The subject is what `prompt` describes, what's in `box` at `at`, or someone followed
 * before (`follow`, their samples).
 */
export async function samCutoutVideo(
  video: string,
  opts: { fps: number; from: number; encoder: string[]; prompt?: string; box?: SamCutout["box"]; at?: number; follow?: number[][] },
  onProgress?: (f: number) => void,
): Promise<{ frames: number; box?: SamCutout["box"]; width: number; height: number }> {
  const w = await ready();
  const r = await w.ask<{ frames: number; box: Partial<SamCutout["box"]>; width: number; height: number }>({ op: "cutout-video", video, ...opts }, onProgress);
  return { ...r, box: r.box.x !== undefined ? (r.box as SamCutout["box"]) : undefined };
}
