/**
 * Whisper on this computer, through whisper.cpp: one small program that runs on any machine, using what it has. On a
 * PC with an NVIDIA card, its CUDA build; on a Mac with Apple silicon, Homebrew's build, which uses Metal; anywhere
 * else, the processor, with a smaller model. Settings installs it inside beatsheet's own folder (Homebrew on a Mac),
 * then checks it on a few seconds of speech and times it: that measured speed is what Auto weighs against the
 * services, so a slow laptop with a key sends its audio out and a quick PC keeps it here. A CUDA build that won't run
 * on this card falls back to the processor build by itself. A whisper-cli already on the computer is used as it is.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SaidWord } from "@beatsheet/schema";
import { cliEnv } from "./agent/cli.ts";
import { REPO } from "./paths.ts";
import { findOnPath, HERE, IS_WINDOWS, pathKey, run as runLaunch, systemExe, unzipCommand, untarCommand } from "./platform.ts";
import { download, du, stream, type Download } from "./pyenv.ts";
import { readSettings, SETTINGS_DIR } from "./settings.ts";
import { installSpeakers, speakersPlan, speakersReady } from "./speakers.ts";

const exec = promisify(execFile);

export const WHISPER_DIR = join(SETTINGS_DIR, "whisper");
const paths = { ready: join(WHISPER_DIR, "ready.json"), models: join(WHISPER_DIR, "models") };
const CHECK = join(REPO, "packages", "engine", "native", "whisper-check.mp3");

/** whisper.cpp's build b5454, pinned so an install today matches one next month. */
const RELEASE = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454";
type Build = { id: string; label: string; file: Download & { name: string }; gpu?: boolean };
const build = (id: string, label: string, name: string, bytes: number, sha256: string, gpu = false): Build => ({ id, label, file: { name, url: `${RELEASE}/${name}`, bytes, sha256 }, gpu });
const BUILDS = {
  windowsCuda: build("windows-cuda", "the NVIDIA card", "whisper-bin-win-cuda-12.4.0-x64.zip", 684_913_404, "afef0b881c500958921c3f5523b50e59ee2ec9b6f5cbd25b324c51ed308a957a", true),
  windowsCpu: build("windows-cpu", "the processor", "whisper-bin-x64.zip", 8_928_640, "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb"),
  windowsArm: build("windows-arm", "the processor", "whisper-bin-win-cpu-arm64.zip", 4_371_193, "28c37e7b598c3d9bbfef94f3bd67f2ee6f12b7c86f3da5edcf5e4308d615ff6d"),
  linuxX64: build("linux-x64", "the processor", "whisper-bin-ubuntu-x64.tar.gz", 10_364_195, "a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c"),
  linuxArm: build("linux-arm", "the processor", "whisper-bin-ubuntu-arm64.tar.gz", 4_608_377, "6b95ebfc60447df48e70ef00a73bdc3f41679ed2d01ef465827206a2ff325149"),
};

const HF = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
/** Three sizes of model: the large one where there's a graphics card to run it, smaller ones for a processor. */
export const MODELS = {
  fast: { label: "Fast (base)", name: "ggml-base-q5_1.bin", url: `${HF}/ggml-base-q5_1.bin`, bytes: 59_707_625, sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898" },
  good: { label: "Good (small)", name: "ggml-small-q5_1.bin", url: `${HF}/ggml-small-q5_1.bin`, bytes: 190_085_487, sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb" },
  best: { label: "Best (large v3 turbo)", name: "ggml-large-v3-turbo-q5_0.bin", url: `${HF}/ggml-large-v3-turbo-q5_0.bin`, bytes: 574_041_195, sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2" },
};
export type ModelSize = keyof typeof MODELS;
/** Silero's voice detector: Whisper only hears the stretches with speech, so it doesn't invent words over silence and music. */
const VAD = { name: "ggml-silero-v5.1.2.bin", url: "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin", bytes: 885_098, sha256: "29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf" };

type Ready = { binary: string; build: string; where: string; model: ModelSize; speed: number; at: string; bytes: number };

/** What this machine has: an NVIDIA card (by name), Apple silicon, or neither. */
export type Machine = { platform: NodeJS.Platform; arch: string; nvidia?: string };

let machine: Promise<Machine> | undefined;
export function thisMachine(): Promise<Machine> {
  return (machine ??= (async () => {
    const m: Machine = { platform: process.platform, arch: process.arch };
    if (m.platform === "darwin") return m;
    try {
      const cmd = IS_WINDOWS && existsSync(systemExe("nvidia-smi.exe")) ? systemExe("nvidia-smi.exe") : "nvidia-smi";
      const { stdout } = await exec(cmd, ["--query-gpu=name", "--format=csv,noheader"], { timeout: 10_000, windowsHide: true });
      const name = stdout.split(/\r?\n/)[0]?.trim();
      if (name) m.nvidia = name;
    } catch {
      // no NVIDIA card, or no driver for one
    }
    return m;
  })());
}

/** What an install here would be: which build, what it runs on, and the model it'd start with. Undefined when there's no way. */
export function planFor(m: Machine, model?: ModelSize): { builds: Build[]; brew?: boolean; where: string; model: ModelSize; bytes: number } | { why: string } {
  const quick = (m.platform === "win32" && m.arch === "x64" && !!m.nvidia) || (m.platform === "darwin" && m.arch === "arm64");
  const size = model ?? (quick ? "best" : "good");
  const plus = MODELS[size].bytes + VAD.bytes;
  if (m.platform === "darwin") return { builds: [], brew: true, where: m.arch === "arm64" ? "Apple silicon" : "the processor", model: size, bytes: plus };
  if (m.platform === "win32" && m.arch === "x64")
    return m.nvidia
      ? { builds: [BUILDS.windowsCuda, BUILDS.windowsCpu], where: m.nvidia, model: size, bytes: BUILDS.windowsCuda.file.bytes + plus }
      : { builds: [BUILDS.windowsCpu], where: "the processor", model: size, bytes: BUILDS.windowsCpu.file.bytes + plus };
  if (m.platform === "win32" && m.arch === "arm64") return { builds: [BUILDS.windowsArm], where: "the processor", model: size, bytes: BUILDS.windowsArm.file.bytes + plus };
  if (m.platform === "linux") {
    const b = m.arch === "arm64" ? BUILDS.linuxArm : BUILDS.linuxX64;
    return { builds: [b], where: "the processor", model: size, bytes: b.file.bytes + plus };
  }
  return { why: `whisper.cpp has no build for ${m.platform} ${m.arch}` };
}

export type WhisperStatus = {
  state: "unsupported" | "missing" | "installing" | "ready" | "error";
  detail: string;
  /** What an install would download (who's speaking included), and what it'd run on. */
  plan?: { where: string; model: ModelSize; bytes: number; brew?: boolean };
  ready?: Ready;
  /** Telling speakers apart, installed with Whisper: there, or what adding it would download, or no build for this machine. */
  speakers: { state: "ready" } | { state: "missing"; bytes: number } | { state: "unsupported" };
  stage?: string;
  progress?: number;
  log?: string[];
};

function readReady(): Ready | undefined {
  try {
    const r = JSON.parse(readFileSync(paths.ready, "utf8")) as Ready;
    return existsSync(r.binary) && existsSync(join(paths.models, MODELS[r.model].name)) ? r : undefined;
  } catch {
    return undefined;
  }
}

/** Ready to transcribe: the program, a model, and how quick it was here. */
export const whisperReady = (): Ready | undefined => readReady();

type Install = { stage: string; progress: number; log: string[]; error?: string; abort: AbortController; done?: boolean };
let install: Install | undefined;

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

export async function whisperStatus(): Promise<WhisperStatus> {
  const m = await thisMachine();
  const sp = speakersPlan(m);
  const speakers: WhisperStatus["speakers"] = speakersReady() ? { state: "ready" } : sp ? { state: "missing", bytes: sp.bytes } : { state: "unsupported" };
  const plan = planFor(m, readSettings().transcribe?.whisperModel);
  if ("why" in plan) return { state: "unsupported", detail: plan.why, speakers };
  const p = { where: plan.where, model: plan.model, bytes: plan.bytes + (sp?.bytes ?? 0), ...(plan.brew ? { brew: true } : {}) };
  if (install && !install.done) return { state: "installing", detail: install.stage, stage: install.stage, progress: install.progress, log: install.log.slice(-6), plan: p, speakers };
  const ready = readReady();
  if (ready) return { state: "ready", detail: `On ${ready.where}, ${speedWords(ready.speed)}`, ready, plan: p, speakers };
  if (install?.error) return { state: "error", detail: install.error, log: install.log.slice(-6), plan: p, speakers };
  return { state: "missing", detail: plan.brew ? `Installs with Homebrew, then about ${mb(p.bytes)}` : `About ${mb(p.bytes)} to download, for ${plan.where}`, plan: p, speakers };
}

/** "about 25 times faster than it plays" or "about twice as long as it plays". */
export function speedWords(speed: number): string {
  if (speed <= 0) return "quick";
  if (speed < 1) return `about ${Math.max(2, Math.round(1 / speed))} times faster than it plays`;
  const x = Math.round(speed * 10) / 10;
  return x <= 1.1 ? "about as long as it plays" : `about ${x === 2 ? "twice" : `${x} times`} as long as it plays`;
}

/** Installs whisper.cpp and a model for this machine in the background; whisperStatus() follows along. */
export async function installWhisper(model?: ModelSize): Promise<WhisperStatus> {
  if (install && !install.done) return whisperStatus();
  const m = await thisMachine();
  const plan = planFor(m, model ?? readSettings().transcribe?.whisperModel);
  if ("why" in plan) throw new Error(plan.why);
  const job: Install = { stage: "Starting", progress: 0, log: [], abort: new AbortController() };
  install = job;
  const log = (line: string) => {
    job.log.push(line);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  void (async () => {
    try {
      mkdirSync(paths.models, { recursive: true });
      const free = statfsSync(WHISPER_DIR);
      const need = plan.bytes * 2.5;
      if (free.bavail * free.bsize < need) throw new Error(`Needs about ${mb(need)} free; ${HERE} has ${mb(free.bavail * free.bsize)}`);
      rmSync(paths.ready, { force: true });

      const model = MODELS[plan.model];
      job.stage = `Downloading the ${model.label.toLowerCase()} model (${mb(model.bytes)})`;
      await download(model, join(paths.models, model.name), job.abort.signal, (f) => (job.progress = f * 0.3));
      await download(VAD, join(paths.models, VAD.name), job.abort.signal, () => {});
      log(`Model: ${model.name}`);

      // The program: one already here, Homebrew's on a Mac, or the build for this machine (its graphics card first).
      const candidates: { binary: string; build: string; where: string }[] = [];
      const own = await onPath();
      if (own) candidates.push({ binary: own, build: "found", where: plan.where });
      if (plan.brew && !own) candidates.push({ binary: await brewInstall(job, log), build: "homebrew", where: plan.where });
      let tried = 0;
      for (const b of plan.builds) {
        candidates.push({ binary: "", build: b.id, where: b.label === "the NVIDIA card" ? (m.nvidia ?? b.label) : b.label });
      }
      for (const c of candidates) {
        try {
          if (!c.binary) {
            const b = plan.builds.find((x) => x.id === c.build)!;
            job.stage = `Downloading whisper.cpp for ${c.where} (${mb(b.file.bytes)})`;
            c.binary = await fetchBuild(b, job, log, 0.3 + tried * 0.25);
          }
          job.stage = `Checking it on ${c.where}`;
          const speed = await selfCheck(c.binary, plan.model, log);
          const bytes = await du(WHISPER_DIR);
          writeFileSync(paths.ready, JSON.stringify({ binary: c.binary, build: c.build, where: c.where, model: plan.model, speed, at: new Date().toISOString(), bytes } satisfies Ready, null, 2));
          log(`Ready on ${c.where}: ${speedWords(speed)}.`);
          await addSpeakers(m, job, log);
          job.progress = 1;
          return;
        } catch (err) {
          if (job.abort.signal.aborted) throw err;
          tried++;
          log(`${c.where}: ${err instanceof Error ? err.message : String(err)}`);
          if (candidates.indexOf(c) < candidates.length - 1) log("Trying the next way…");
          else throw err;
        }
      }
    } catch (err) {
      job.error = job.abort.signal.aborted ? "Stopped. Install again to pick up where it left off." : err instanceof Error ? err.message : String(err);
      log(job.error);
    } finally {
      job.done = true;
    }
  })();
  return whisperStatus();
}

/**
 * Who's speaking, beside Whisper. Whisper works without it, so if it won't install here that's said in the log and
 * Settings offers to add it again.
 */
async function addSpeakers(m: Machine, job: Install, log: (l: string) => void) {
  const sp = speakersPlan(m);
  if (!sp || speakersReady()) return;
  job.stage = `Adding who's speaking (${mb(sp.bytes)})`;
  try {
    await installSpeakers(m, job.abort.signal, log, (f) => (job.progress = Math.max(job.progress, 0.85 + f * 0.15)));
  } catch (err) {
    if (job.abort.signal.aborted) throw err;
    log(`Who's speaking didn't install: ${err instanceof Error ? err.message : String(err)}. Whisper works without it; add it again from Settings.`);
  }
}

/** Adds who's speaking to a Whisper installed before it; whisperStatus() follows along. */
export async function installWhisperSpeakers(): Promise<WhisperStatus> {
  if (install && !install.done) return whisperStatus();
  if (!readReady()) throw new Error("Install Whisper first");
  const m = await thisMachine();
  if (!speakersPlan(m)) throw new Error(`There's no speaker labeller for ${m.platform} ${m.arch}`);
  const job: Install = { stage: "Starting", progress: 0, log: [], abort: new AbortController() };
  install = job;
  const log = (line: string) => void job.log.push(line);
  void (async () => {
    try {
      job.stage = "Adding who's speaking";
      await installSpeakers(m, job.abort.signal, log, (f) => (job.progress = f));
    } catch (err) {
      job.error = job.abort.signal.aborted ? "Stopped." : `Who's speaking didn't install: ${err instanceof Error ? err.message : String(err)}`;
      log(job.error);
    } finally {
      job.done = true;
    }
  })();
  return whisperStatus();
}

export function cancelWhisperInstall() {
  install?.abort.abort();
}

/** Deletes everything the install put on this computer (Homebrew's whisper-cpp is left to Homebrew). */
export function removeWhisper() {
  if (install && !install.done) throw new Error("It's still installing; stop it first");
  rmSync(WHISPER_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  install = undefined;
}

/** A whisper-cli already on this computer's PATH. */
async function onPath(): Promise<string | undefined> {
  const env = await cliEnv();
  return findOnPath(IS_WINDOWS ? "whisper-cli.exe" : "whisper-cli", env[pathKey(env)] ?? "");
}

/** Homebrew's whisper-cpp, which uses Metal on Apple silicon. */
async function brewInstall(job: Install, log: (l: string) => void): Promise<string> {
  const env = await cliEnv();
  const brew = findOnPath("brew", env[pathKey(env)] ?? "") ?? ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].find((p) => existsSync(p));
  if (!brew) throw new Error("On a Mac, whisper.cpp comes from Homebrew, which isn't installed. Get it at brew.sh, then install again.");
  job.stage = "Installing whisper.cpp with Homebrew";
  log("$ brew install whisper-cpp");
  await stream(brew, ["install", "whisper-cpp"], { env, signal: job.abort.signal, onLine: log });
  const prefix = (await exec(brew, ["--prefix"], { env })).stdout.trim();
  const binary = join(prefix, "bin", "whisper-cli");
  if (!existsSync(binary)) throw new Error("Homebrew installed whisper-cpp, but there's no whisper-cli in it");
  return binary;
}

/** Downloads and unpacks a build, and finds its whisper-cli. */
async function fetchBuild(b: Build, job: Install, log: (l: string) => void, from: number): Promise<string> {
  const archive = join(WHISPER_DIR, b.file.name);
  await download(b.file, archive, job.abort.signal, (f) => (job.progress = from + f * 0.25));
  const out = join(WHISPER_DIR, b.id);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  log(`Unpacking ${b.file.name}`);
  await runLaunch(b.file.name.endsWith(".zip") ? unzipCommand(archive, out) : untarCommand(archive, out), { timeout: 10 * 60_000 });
  rmSync(archive, { force: true });
  const binary = find(out, IS_WINDOWS ? "whisper-cli.exe" : "whisper-cli");
  if (!binary) throw new Error(`There's no whisper-cli in ${b.file.name}`);
  return binary;
}

function find(dir: string, name: string): string | undefined {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) {
      const hit = find(p, name);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** The voice detector and model files for a size. */
const modelFiles = (size: ModelSize) => ({ model: join(paths.models, MODELS[size].name), vad: join(paths.models, VAD.name) });

/**
 * Transcribes the check clip (padded to Whisper's 30-second window, so a whole window's work is timed) and says how
 * long it takes per second of audio, not counting loading the model. Throws when it can't run here or hears nothing.
 */
async function selfCheck(binary: string, size: ModelSize, log: (l: string) => void): Promise<number> {
  const wav = join(tmpdir(), `beatsheet-whisper-check-${process.pid}.wav`);
  await exec("ffmpeg", ["-v", "error", "-y", "-i", CHECK, "-af", "apad=whole_dur=30", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
  try {
    const { words, err } = await runWhisper(binary, wav, { size, vad: false });
    const load = Number(/load time =\s*([\d.]+) ms/.exec(err)?.[1] ?? 0);
    const total = Number(/total time =\s*([\d.]+) ms/.exec(err)?.[1] ?? NaN);
    const backend = /using (\w+) backend/.exec(err)?.[1];
    log(`Heard: "${words.map((w) => w.w).join(" ").slice(0, 80)}"${backend ? ` (${backend})` : ""}`);
    if (!/whisper|computer|word/i.test(words.map((w) => w.w).join(" "))) throw new Error("It ran, but didn't hear the check clip right");
    if (!Number.isFinite(total)) throw new Error("It ran, but didn't say how long it took");
    return Math.round(((total - load) / 1000 / 30) * 1000) / 1000;
  } finally {
    rmSync(wav, { force: true });
  }
}

/**
 * Runs whisper-cli on a 16 kHz mono WAV: a word at a time, with their times, the language it heard, and (with `vad`)
 * only the stretches with speech. `onProgress` gets 0..1.
 */
export async function runWhisper(
  binary: string,
  wav: string,
  opts: { size: ModelSize; vad?: boolean; language?: string; signal?: AbortSignal; onProgress?: (f: number) => void },
): Promise<{ words: SaidWord[]; language?: string; err: string }> {
  const { model, vad } = modelFiles(opts.size);
  const out = join(tmpdir(), `beatsheet-whisper-${process.pid}-${Date.now().toString(36)}`);
  const threads = String(Math.max(1, Math.min(8, cpus().length - 1)));
  const args = ["-m", model, "-f", wav, "-l", opts.language ?? "auto", "-oj", "-of", out, "-ml", "1", "-sow", "-pp", "-t", threads, ...(opts.vad !== false ? ["--vad", "-vm", vad] : [])];
  let err = "";
  await stream(binary, args, {
    env: process.env,
    signal: opts.signal ?? new AbortController().signal,
    onLine: (l) => {
      err += `${l}\n`;
      const p = /progress =\s*(\d+)%/.exec(l);
      if (p) opts.onProgress?.(Number(p[1]) / 100);
    },
  });
  try {
    return { ...readWhisperJson(readFileSync(`${out}.json`, "utf8")), err };
  } finally {
    rmSync(`${out}.json`, { force: true });
  }
}

/** whisper-cli's JSON (one segment a word, with -ml 1 -sow) as words in seconds. */
export function readWhisperJson(json: string): { words: SaidWord[]; language?: string } {
  const j = JSON.parse(json) as { result?: { language?: string }; transcription?: { offsets: { from: number; to: number }; text: string }[] };
  const words = (j.transcription ?? [])
    .map((s) => ({ w: s.text.trim(), s: s.offsets.from / 1000, e: s.offsets.to / 1000 }))
    // Whisper's own marks for what isn't speech ([Music], (laughs)) aren't words.
    .filter((x) => x.w && !/^[[(].*[\])]$/.test(x.w));
  return { words, language: j.result?.language };
}

/** How much the install takes now (for Settings). */
export function whisperBytes(): number | undefined {
  try {
    return statSync(WHISPER_DIR).isDirectory() ? readReady()?.bytes : undefined;
  } catch {
    return undefined;
  }
}
