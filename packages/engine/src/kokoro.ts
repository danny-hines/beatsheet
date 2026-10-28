/**
 * Kokoro on this Mac: an open voice model (82M parameters, Apache-licensed) that reads narration far more naturally than
 * the Mac's own voices, free and offline. Settings installs it in one go, all inside beatsheet's own folder: uv (only if
 * it isn't on the Mac already), a Python of its own, Kokoro's packages, and the model (about 330 MB from Hugging Face),
 * then checks it speaks. Remove deletes the folder.
 *
 * A small Python worker (`native/kokoro-worker.py`) does the speaking; it loads the model once and stays up for a few
 * minutes after the last line, so voicing a script doesn't reload it for every line.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliEnv } from "./agent/cli.ts";
import { REPO } from "./paths.ts";
import { containerTrouble, HERE, inContainer, venvPython } from "./platform.ts";
import { dropCache, du, findUv, stream } from "./pyenv.ts";
import { SETTINGS_DIR } from "./settings.ts";

/** Pinned, so an install today matches one next month. Kokoro needs Python 3.10–3.12. */
const PACKAGES = [
  "kokoro==0.9.4",
  "soundfile==0.13.1",
  // Misaki (Kokoro's English reader) wants spaCy's small English model, and would otherwise try to pip it in at run time.
  "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
];
const PYTHON = "3.12";
const NEEDS_GB = 3;

export const KOKORO_DIR = join(SETTINGS_DIR, "kokoro");
const paths = {
  venv: join(KOKORO_DIR, "venv"),
  python: venvPython(join(KOKORO_DIR, "venv")),
  /** Hugging Face's cache, where the model lands. */
  hf: join(KOKORO_DIR, "hf"),
  ready: join(KOKORO_DIR, "ready.json"),
};
const WORKER = join(REPO, "packages", "engine", "native", "kokoro-worker.py");

/**
 * The voices worth offering, best first (Kokoro's own grades), with the language each speaks. The name's first letter
 * is its language (a: American, b: British) and the second its gender.
 */
export const KOKORO_VOICES: { id: string; name: string; detail: string }[] = [
  { id: "af_heart", name: "Heart", detail: "American · female · warm" },
  { id: "af_bella", name: "Bella", detail: "American · female · bright" },
  { id: "af_nicole", name: "Nicole", detail: "American · female · soft, close to the mic" },
  { id: "af_aoede", name: "Aoede", detail: "American · female" },
  { id: "af_kore", name: "Kore", detail: "American · female" },
  { id: "af_sarah", name: "Sarah", detail: "American · female" },
  { id: "am_michael", name: "Michael", detail: "American · male" },
  { id: "am_fenrir", name: "Fenrir", detail: "American · male · deep" },
  { id: "am_puck", name: "Puck", detail: "American · male · lively" },
  { id: "bf_emma", name: "Emma", detail: "British · female" },
  { id: "bf_isabella", name: "Isabella", detail: "British · female" },
  { id: "bm_george", name: "George", detail: "British · male" },
  { id: "bm_fable", name: "Fable", detail: "British · male" },
];

type Ready = { version: string; at: string; loadSeconds: number; checkSeconds: number; bytes: number };
export type KokoroStatus = {
  state: "unsupported" | "missing" | "installing" | "ready" | "error";
  detail: string;
  stage?: string;
  progress?: number;
  log?: string[];
  bytes?: number;
  at?: string;
};

function supported(): string | undefined {
  // On Windows it runs on the processor (PyTorch from PyPI): quick enough for a voice this small, and no 2 GB download.
  if (process.platform === "win32") return process.arch === "x64" ? undefined : "Needs a 64-bit Intel or AMD PC";
  if (process.platform !== "darwin") return "Needs a Mac";
  if (process.arch !== "arm64") return "Needs a Mac with Apple silicon (M1 or later)";
}

function readReady(): Ready | undefined {
  try {
    const r = JSON.parse(readFileSync(paths.ready, "utf8")) as Ready;
    return existsSync(paths.python) ? r : undefined;
  } catch {
    return undefined;
  }
}

export const kokoroReady = () => !supported() && !!readReady();

type Install = { stage: string; progress: number; log: string[]; error?: string; abort: AbortController; done?: boolean };
let install: Install | undefined;

export function kokoroStatus(): KokoroStatus {
  const why = supported();
  if (why) return { state: "unsupported", detail: why };
  if (install && !install.done) return { state: "installing", detail: install.stage, stage: install.stage, progress: install.progress, log: install.log.slice(-6) };
  const ready = readReady();
  if (ready) return { state: "ready", detail: `Ready · a line takes about ${Math.max(1, Math.round(ready.checkSeconds))}s once it's loaded`, bytes: ready.bytes, at: ready.at };
  if (install?.error) return { state: "error", detail: install.error, log: install.log.slice(-6) };
  return { state: "missing", detail: "Not installed" };
}

const env = async () => ({
  ...(await cliEnv()),
  UV_PYTHON_INSTALL_DIR: join(KOKORO_DIR, "python"),
  UV_CACHE_DIR: join(KOKORO_DIR, "cache"),
  // Its own Python, so a Homebrew upgrade can't break it.
  UV_PYTHON_PREFERENCE: "only-managed",
  NO_COLOR: "1",
});

/** Installs Kokoro for this Mac, start to finish, in the background; kokoroStatus() follows along. */
export function installKokoro(): KokoroStatus {
  const why = supported();
  if (why) throw new Error(why);
  if (install && !install.done) return kokoroStatus();
  const job: Install = { stage: "Starting", progress: 0, log: [], abort: new AbortController() };
  install = job;
  const log = (line: string) => {
    job.log.push(line);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  void (async () => {
    try {
      mkdirSync(KOKORO_DIR, { recursive: true });
      const boxed = inContainer(KOKORO_DIR);
      if (boxed) throw new Error(containerTrouble(boxed));
      const free = statfsSync(KOKORO_DIR);
      const gb = (free.bavail * free.bsize) / 1e9;
      if (gb < NEEDS_GB) throw new Error(`Needs about ${NEEDS_GB} GB free; ${HERE} has ${gb.toFixed(1)} GB`);
      stopKokoro();
      rmSync(paths.ready, { force: true });

      job.stage = "Setting up Python";
      const uv = await findUv(log, job.abort.signal, KOKORO_DIR);
      job.progress = 0.05;
      const e = await env();
      if (!existsSync(paths.python)) {
        log(`$ uv venv --python ${PYTHON}`);
        await stream(uv, ["venv", "--python", PYTHON, paths.venv], { env: e, signal: job.abort.signal, onLine: log });
      }
      job.progress = 0.15;
      job.stage = "Installing Kokoro (PyTorch is most of it)";
      log("$ uv pip install kokoro soundfile en_core_web_sm");
      let seen = 0;
      await stream(uv, ["pip", "install", "--python", paths.python, ...PACKAGES], {
        env: e,
        signal: job.abort.signal,
        onLine: (line) => {
          log(line);
          if (/^(Resolved|Downloading|Downloaded|Prepared|Installed|Built|Audited)/i.test(line.trim())) job.progress = Math.min(0.6, 0.15 + ++seen * 0.04);
        },
      });
      job.progress = 0.6;
      dropCache(join(KOKORO_DIR, "cache"), log);
      job.stage = "Downloading the voice model (about 330 MB) and checking it speaks";
      const check = await selfCheck(log);
      const bytes = await du(KOKORO_DIR);
      writeFileSync(paths.ready, JSON.stringify({ version: PACKAGES[0]!, at: new Date().toISOString(), loadSeconds: check.load, checkSeconds: check.speak, bytes } satisfies Ready, null, 2));
      job.progress = 1;
      log(`Ready: the model loads in ${check.load.toFixed(1)}s and read a line in ${check.speak.toFixed(1)}s.`);
    } catch (err) {
      job.error = job.abort.signal.aborted ? "Stopped. Install again to pick up where it left off." : err instanceof Error ? err.message : String(err);
      log(job.error);
    } finally {
      job.done = true;
      dropCache(join(KOKORO_DIR, "cache"), log);
    }
  })();
  return kokoroStatus();
}

export function cancelKokoroInstall() {
  install?.abort.abort();
  stopKokoro();
}

/** Deletes everything the install put on this Mac. */
export async function removeKokoro() {
  if (install && !install.done) throw new Error("It's still installing; stop it first");
  if (process.platform === "win32") {
    // Windows won't delete a running Python's files: the worker goes first.
    const w = await current?.catch(() => undefined);
    stopKokoro();
    if (w && w.proc.exitCode === null && w.proc.signalCode === null) await new Promise((done) => w.proc.once("exit", done));
    rmSync(KOKORO_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    install = undefined;
    return;
  }
  stopKokoro();
  rmSync(KOKORO_DIR, { recursive: true, force: true });
  install = undefined;
}

/** Loads the model (downloading it the first time) and reads one line. */
async function selfCheck(log: (l: string) => void): Promise<{ load: number; speak: number }> {
  const out = join(KOKORO_DIR, "check.wav");
  try {
    const t = Date.now();
    const w = await worker();
    const load = (Date.now() - t) / 1000;
    log(`The model loaded in ${load.toFixed(1)}s`);
    const r = await w.ask<{ seconds: number; words: unknown[] }>({ op: "speak", text: `Hello! This is Kokoro, reading on your ${HERE === "this PC" ? "PC" : "Mac"}.`, voice: "af_heart", out });
    if (!r.words.length) log("It spoke, but without word timings");
    return { load, speak: r.seconds };
  } finally {
    rmSync(out, { force: true });
  }
}

// ---- The worker

type Pending = { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void };
type Worker = { proc: ChildProcess; ask: <T>(req: Record<string, unknown>) => Promise<T> };

let current: Promise<Worker> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
const IDLE_MS = 3 * 60_000;

function worker(): Promise<Worker> {
  current ??= new Promise<Worker>((resolve, reject) => {
    // Isolated (-I) and no bytecode (-B), as for SAM. The model comes from (and is kept in) our own Hugging Face cache.
    // On Windows, -X utf8 too: its Python reads pipes in the old code page otherwise (and -I ignores PYTHONUTF8).
    const proc = spawn(paths.python, ["-I", "-B", ...(process.platform === "win32" ? ["-X", "utf8"] : []), WORKER], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        HF_HOME: paths.hf,
        HF_HUB_DISABLE_TELEMETRY: "1",
        TOKENIZERS_PARALLELISM: "false",
        PYTORCH_ENABLE_MPS_FALLBACK: "1",
      },
    });
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
          if (!msg.ready) return fail(new Error(`Kokoro couldn't start: ${msg.error}`));
          ready = true;
          resolve({
            proc,
            ask: <T>(req: Record<string, unknown>) =>
              new Promise<T>((ok, no) => {
                if (idle) clearTimeout(idle);
                const id = next++;
                pending.set(id, {
                  resolve: (v) => {
                    idle = setTimeout(stopKokoro, IDLE_MS);
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
          else p?.reject(new Error(`Kokoro: ${msg.error}`));
        }
      }
    });
    proc.on("error", (e) => fail(e));
    proc.on("close", (code) => fail(new Error(`Kokoro stopped (${code ?? "killed"})${err.trim() ? `: ${err.trim().split("\n").pop()}` : ""}`)));
  });
  return current;
}

export function stopKokoro() {
  if (idle) clearTimeout(idle);
  const w = current;
  current = undefined;
  void w?.then((x) => x.proc.kill()).catch(() => {});
}

/** Reads `text` in one of Kokoro's voices into a WAV file, with each word's time. */
export async function kokoroSpeak(text: string, voice: string, out: string, speed = 1): Promise<{ duration: number; words: { w: string; s: number; e: number }[] }> {
  if (!kokoroReady()) throw new Error(`Kokoro isn't installed on ${HERE}. Install it in Settings → Voices.`);
  const w = await worker();
  return w.ask({ op: "speak", text, voice, out, speed });
}
