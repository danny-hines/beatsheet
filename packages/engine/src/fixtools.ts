/**
 * The programs that clean sound and restore picture on this computer, each a small download of its own, installed in
 * beatsheet's folder from Settings → Restoring and then checked and timed here, so Auto can weigh them against the
 * services on what this machine actually does, not on a guess. DeepFilterNet cleans voices on the processor of any
 * computer. Real-ESRGAN (upscaling) and RIFE (frames in between) run on the graphics card through Vulkan, any make of
 * card, and fall back to the processor (slowly) where there's none.
 */
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REPO } from "./paths.ts";
import { HERE, IS_WINDOWS, run as runLaunch, unzipCommand } from "./platform.ts";
import { download, du, stream, type Download } from "./pyenv.ts";
import { SETTINGS_DIR } from "./settings.ts";

const exec = promisify(execFile);

export const FIX_DIR = join(SETTINGS_DIR, "fix");
export type ToolId = "deepfilter" | "realesrgan" | "rife";

type File = Download & { name: string };
const gh = (repo: string, tag: string, name: string, bytes: number, sha256: string): File => ({ name, url: `https://github.com/${repo}/releases/download/${tag}/${name}`, bytes, sha256 });

/**
 * Pinned builds for each system, by platform-arch. The projects publish no checksums; these are of the files as
 * downloaded on 2026-10-30. Windows on ARM runs the x64 builds.
 */
const BUILDS: Record<ToolId, Record<string, File>> = {
  deepfilter: {
    "win32-x64": gh("Rikorose/DeepFilterNet", "v0.5.6", "deep-filter-0.5.6-x86_64-pc-windows-msvc.exe", 26_912_256, "75e11fa16445f560cb6b021521ddb89e89270d13b83089705d98776f58fd7915"),
    "darwin-arm64": gh("Rikorose/DeepFilterNet", "v0.5.6", "deep-filter-0.5.6-aarch64-apple-darwin", 27_877_081, "4601e7f4e4c03e59a4c5b5000216ef3add3e808799cfccd95e14e83ea4611081"),
    "darwin-x64": gh("Rikorose/DeepFilterNet", "v0.5.6", "deep-filter-0.5.6-x86_64-apple-darwin", 29_933_512, "d3be84003acb7c23e738ad7f70a158ec779a8d233a82e7fa3e717d112eb5b50f"),
    "linux-x64": gh("Rikorose/DeepFilterNet", "v0.5.6", "deep-filter-0.5.6-x86_64-unknown-linux-musl", 36_417_296, "70775e251eee44c0f2451a1e833326cf8bcbbe304d3e7cd12851e6fce72ef7da"),
    "linux-arm64": gh("Rikorose/DeepFilterNet", "v0.5.6", "deep-filter-0.5.6-aarch64-unknown-linux-gnu", 39_238_496, "14e02a1c0028f3ca0bdf83b62b3336e56ba0556894ef295a95e8573f06557166"),
  },
  realesrgan: {
    "win32-x64": gh("xinntao/Real-ESRGAN", "v0.2.5.0", "realesrgan-ncnn-vulkan-20220424-windows.zip", 45_474_481, "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d"),
    "darwin-arm64": gh("xinntao/Real-ESRGAN", "v0.2.5.0", "realesrgan-ncnn-vulkan-20220424-macos.zip", 51_817_124, "e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a"),
    "darwin-x64": gh("xinntao/Real-ESRGAN", "v0.2.5.0", "realesrgan-ncnn-vulkan-20220424-macos.zip", 51_817_124, "e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a"),
    "linux-x64": gh("xinntao/Real-ESRGAN", "v0.2.5.0", "realesrgan-ncnn-vulkan-20220424-ubuntu.zip", 46_931_474, "e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96"),
  },
  rife: {
    "win32-x64": gh("nihui/rife-ncnn-vulkan", "20221029", "rife-ncnn-vulkan-20221029-windows.zip", 431_540_241, "d8e4d772d26cd8006ef0ad0bc82eb191b53c68677d1ae2f42506d74cbbbea606"),
    "darwin-arm64": gh("nihui/rife-ncnn-vulkan", "20221029", "rife-ncnn-vulkan-20221029-macos.zip", 436_537_917, "4a63a1f3c9c715773c57d2ee51df1b315ed20cd6c63103e45c483ecc4400b595"),
    "darwin-x64": gh("nihui/rife-ncnn-vulkan", "20221029", "rife-ncnn-vulkan-20221029-macos.zip", 436_537_917, "4a63a1f3c9c715773c57d2ee51df1b315ed20cd6c63103e45c483ecc4400b595"),
    "linux-x64": gh("nihui/rife-ncnn-vulkan", "20221029", "rife-ncnn-vulkan-20221029-ubuntu.zip", 431_302_796, "1e2c7ee7fa7daa326542d50622f0afedc80cf6f1858bda411d16385ffa5cdf68"),
  },
};

const PROGRAM: Record<ToolId, string> = { deepfilter: "deep-filter", realesrgan: "realesrgan-ncnn-vulkan", rife: "rife-ncnn-vulkan" };
const LABEL: Record<ToolId, string> = { deepfilter: "DeepFilterNet", realesrgan: "Real-ESRGAN", rife: "RIFE" };
/** RIFE's download carries a dozen models; only this one is kept. */
const RIFE_MODEL = "rife-v4.6";

/** What's installed: the program, what it runs on, and how quick it was here (seconds a second of sound, or a megapixel of picture taken in). */
export type ToolReady = { binary: string; where: string; speed: number; cpu?: boolean; at: string; bytes: number };

export type ToolStatus = {
  id: ToolId;
  label: string;
  state: "unsupported" | "missing" | "installing" | "ready" | "error";
  detail: string;
  /** What an install would download. */
  bytes?: number;
  ready?: ToolReady;
  stage?: string;
  progress?: number;
  log?: string[];
};

const dirOf = (id: ToolId) => join(FIX_DIR, id);
const readyFile = (id: ToolId) => join(dirOf(id), "ready.json");

/** The build for this machine, if there's one. */
export function buildFor(id: ToolId, platform: string = process.platform, arch: string = process.arch): File | undefined {
  const b = BUILDS[id];
  return b[`${platform}-${arch}`] ?? (platform === "win32" && arch === "arm64" ? b["win32-x64"] : undefined);
}

export function toolReady(id: ToolId): ToolReady | undefined {
  try {
    const r = JSON.parse(readFileSync(readyFile(id), "utf8")) as ToolReady;
    return existsSync(r.binary) ? r : undefined;
  } catch {
    return undefined;
  }
}

type Install = { stage: string; progress: number; log: string[]; error?: string; abort: AbortController; done?: boolean };
const installs = new Map<ToolId, Install>();

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);

/** "about 15 times faster than it plays" for sound; "about 2 minutes a minute of 480p" for picture. */
export function toolSpeedWords(id: ToolId, speed: number): string {
  if (id === "deepfilter") return speed < 1 ? `about ${Math.max(2, Math.round(1 / speed))} times faster than it plays` : `about ${Math.round(speed * 10) / 10} times as long as it plays`;
  // A minute of 640×480 at 30 frames a second is 553 megapixels taken in.
  const perMinute = speed * 553;
  return perMinute < 90 ? `about ${Math.max(1, Math.round(perMinute))} seconds a minute of 480p` : `about ${Math.round(perMinute / 60)} minutes a minute of 480p`;
}

export function toolStatus(id: ToolId): ToolStatus {
  const base = { id, label: LABEL[id] };
  const b = buildFor(id);
  if (!b) return { ...base, state: "unsupported", detail: `${LABEL[id]} has no build for ${process.platform} ${process.arch}` };
  const job = installs.get(id);
  if (job && !job.done) return { ...base, state: "installing", detail: job.stage, stage: job.stage, progress: job.progress, log: job.log.slice(-6), bytes: b.bytes };
  const ready = toolReady(id);
  if (ready) return { ...base, state: "ready", detail: `On ${ready.where}, ${toolSpeedWords(id, ready.speed)}`, ready, bytes: b.bytes };
  if (job?.error) return { ...base, state: "error", detail: job.error, log: job.log.slice(-6), bytes: b.bytes };
  return { ...base, state: "missing", detail: `About ${mb(b.bytes)} to download`, bytes: b.bytes };
}

/** Installs a tool in the background; toolStatus() follows along. */
export function installTool(id: ToolId): ToolStatus {
  const running = installs.get(id);
  if (running && !running.done) return toolStatus(id);
  const b = buildFor(id);
  if (!b) throw new Error(`${LABEL[id]} has no build for ${process.platform} ${process.arch}`);
  const job: Install = { stage: "Starting", progress: 0, log: [], abort: new AbortController() };
  installs.set(id, job);
  const log = (line: string) => {
    job.log.push(line);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  void (async () => {
    try {
      const dir = dirOf(id);
      mkdirSync(dir, { recursive: true });
      const free = statfsSync(dir);
      if (free.bavail * free.bsize < b.bytes * 2.5) throw new Error(`Needs about ${mb(b.bytes * 2.5)} free; ${HERE} has ${mb(free.bavail * free.bsize)}`);
      rmSync(readyFile(id), { force: true });
      job.stage = `Downloading ${LABEL[id]} (${mb(b.bytes)})`;
      const file = join(dir, b.name);
      await download(b, file, job.abort.signal, (f) => (job.progress = f * 0.8));
      const binary = await unpack(id, file, log);
      job.stage = `Checking it ${HERE === "this PC" ? "on this PC" : "on this Mac"}`;
      const checked = await selfCheck(id, binary, log);
      const ready: ToolReady = { binary, ...checked, at: new Date().toISOString(), bytes: await du(dir) };
      writeFileSync(readyFile(id), JSON.stringify(ready, null, 2));
      log(`Ready on ${ready.where}: ${toolSpeedWords(id, ready.speed)}.`);
      job.progress = 1;
    } catch (err) {
      job.error = job.abort.signal.aborted ? "Stopped. Install again to pick up where it left off." : err instanceof Error ? err.message : String(err);
      log(job.error);
    } finally {
      job.done = true;
    }
  })();
  return toolStatus(id);
}

export function cancelToolInstall(id: ToolId) {
  installs.get(id)?.abort.abort();
}

export function removeTool(id: ToolId) {
  const job = installs.get(id);
  if (job && !job.done) throw new Error("It's still installing; stop it first");
  rmSync(dirOf(id), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  installs.delete(id);
}

/** Puts the download where it runs from and finds the program in it. */
async function unpack(id: ToolId, file: string, log: (l: string) => void): Promise<string> {
  const dir = dirOf(id);
  const exe = `${PROGRAM[id]}${IS_WINDOWS ? ".exe" : ""}`;
  if (!file.endsWith(".zip")) {
    // DeepFilterNet is one program, its model inside.
    const binary = join(dir, exe);
    rmSync(binary, { force: true });
    writeFileSync(binary, readFileSync(file));
    rmSync(file, { force: true });
    if (!IS_WINDOWS) chmodSync(binary, 0o755);
    return binary;
  }
  const out = join(dir, "bin");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  log(`Unpacking ${basename(file)}`);
  await runLaunch(unzipCommand(file, out), { timeout: 10 * 60_000 });
  rmSync(file, { force: true });
  const binary = find(out, exe);
  if (!binary) throw new Error(`There's no ${exe} in ${basename(file)}`);
  if (!IS_WINDOWS) chmodSync(binary, 0o755);
  // The demos aren't needed, nor RIFE's other models (most of its download).
  for (const e of readdirSync(dirname(binary), { withFileTypes: true })) {
    const p = join(dirname(binary), e.name);
    if (e.isFile() && /\.(mp4|jpg|png|md)$/i.test(e.name)) rmSync(p, { force: true });
    if (id === "rife" && e.isDirectory() && e.name.startsWith("rife") && e.name !== RIFE_MODEL) rmSync(p, { recursive: true, force: true });
  }
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

const scratch = (what: string) => {
  const d = join(tmpdir(), `beatsheet-${what}-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(d, { recursive: true });
  return d;
};

/** The graphics card a Vulkan program said it found: "[0 NVIDIA GeForce RTX 4090]  queueC=…". */
const vulkanDevice = (err: string) => /^\[0 ([^\]]+)\]/m.exec(err)?.[1]?.trim();

/**
 * Runs the tool on something small it should handle and times it. Vulkan tools are tried on the graphics card first,
 * then the processor.
 */
async function selfCheck(id: ToolId, binary: string, log: (l: string) => void): Promise<{ where: string; speed: number; cpu?: boolean }> {
  const dir = scratch(`${id}-check`);
  try {
    if (id === "deepfilter") {
      // The check clip with tape-like hiss under it, padded to half a minute so loading the model isn't most of the time.
      const noisy = join(dir, "noisy.wav");
      const voice = join(REPO, "packages", "engine", "native", "whisper-check.mp3");
      await exec("ffmpeg", ["-v", "error", "-y", "-i", voice, "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.08:sample_rate=48000", "-filter_complex", "[0]aresample=48000,apad=whole_dur=30[v];[v][1]amix=inputs=2:duration=first:normalize=0", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", noisy]);
      const t = Date.now();
      const out = await runDeepFilter({ binary }, noisy, join(dir, "out"));
      const seconds = (Date.now() - t) / 1000;
      // Where there's only hiss (after the voice), it should be much quieter.
      const [before, after] = [await loudness(noisy, 15), await loudness(out, 15)];
      log(`The hiss is ${Math.round(before - after)} dB quieter`);
      if (!(before - after > 10)) throw new Error("It ran, but didn't take the hiss out of the check clip");
      return { where: "the processor", speed: Math.round((seconds / 30) * 1000) / 1000 };
    }
    // Thirty frames of a test picture the size of a VHS or DV frame.
    const frames = join(dir, "in");
    mkdirSync(frames);
    await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=352x240:rate=30", "-frames:v", "30", join(frames, "%08d.png")]);
    const megapixels = (352 * 240 * 30) / 1e6;
    let lastErr: unknown;
    for (const cpu of [false, true]) {
      const out = join(dir, cpu ? "out-cpu" : "out");
      try {
        const t = Date.now();
        const err = id === "realesrgan" ? await runUpscale({ binary, cpu }, frames, out) : await runFrames({ binary, cpu }, frames, out);
        const seconds = (Date.now() - t) / 1000;
        const made = readdirSync(out).filter((f) => f.endsWith(".png")).length;
        if (made !== (id === "realesrgan" ? 30 : 60)) throw new Error(`It made ${made} frames from 30`);
        const where = cpu ? "the processor" : (vulkanDevice(err) ?? "the graphics card");
        log(`Ran on ${where}: ${seconds.toFixed(1)}s for 30 frames`);
        return { where, speed: Math.round((seconds / megapixels) * 1000) / 1000, ...(cpu ? { cpu: true } : {}) };
      } catch (err) {
        lastErr = err;
        log(`${cpu ? "On the processor" : "On the graphics card"}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** Mean loudness of a sound file (from a second on), in dB. */
async function loudness(file: string, from = 0): Promise<number> {
  const { stderr } = await exec("ffmpeg", ["-hide_banner", "-ss", String(from), "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1] ?? NaN);
}

const noSignal = () => new AbortController().signal;

/** Cleans a 48 kHz WAV of everything but voices, in step with it (its delay taken back out). Returns the cleaned file. */
export async function runDeepFilter(r: Pick<ToolReady, "binary">, wav: string, outDir: string, signal = noSignal()): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  await stream(r.binary, ["-D", "-o", outDir, wav], { env: process.env, signal, onLine: () => {} });
  const out = join(outDir, basename(wav));
  if (!existsSync(out)) throw new Error("DeepFilterNet didn't write the cleaned sound");
  return out;
}

/** Four times bigger, every PNG in a folder, into another. Returns what it said (which card it ran on). */
export async function runUpscale(r: Pick<ToolReady, "binary" | "cpu">, inDir: string, outDir: string, signal = noSignal()): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  let said = "";
  await stream(r.binary, ["-i", inDir, "-o", outDir, "-n", "realesrgan-x4plus", "-s", "4", "-f", "png", ...(r.cpu ? ["-g", "-1"] : [])], {
    cwd: dirname(r.binary),
    env: process.env,
    signal,
    onLine: (l) => (said += `${l}\n`),
  });
  return said;
}

/** Twice the frames (or `count` of them), every PNG in a folder, into another, named in order. */
export async function runFrames(r: Pick<ToolReady, "binary" | "cpu">, inDir: string, outDir: string, opts: { count?: number; signal?: AbortSignal } = {}): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  let said = "";
  await stream(r.binary, ["-i", inDir, "-o", outDir, "-m", RIFE_MODEL, "-f", "%08d.png", ...(opts.count ? ["-n", String(opts.count)] : []), ...(r.cpu ? ["-g", "-1"] : [])], {
    cwd: dirname(r.binary),
    env: process.env,
    signal: opts.signal ?? noSignal(),
    onLine: (l) => (said += `${l}\n`),
  });
  return said;
}

/** How much the tools take now (for Settings). */
export const toolBytes = (id: ToolId) => toolReady(id)?.bytes;
