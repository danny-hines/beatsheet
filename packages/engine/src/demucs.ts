/**
 * Demucs (htdemucs, MIT-licensed) on this computer: separates voices from music & ambience (`two-stem`: vocals +
 * no_vocals) or into 4 stems (`four-stem`: vocals, drums, bass, other). Settings installs it inside beatsheet's
 * own folder with uv + a managed Python 3.12 venv; Remove deletes the folder.
 *
 * Used by:
 * - `separate_stems`: splits any clip or song into lossless WAV stems (and optional audio assets).
 * - `clean_sound` (`keepMusic: true`): cleans ONLY the separated vocal stem and remixes the original music & ambience.
 * - `shift_audio` (`keepMusic: true`) & `swap_character`: pitch-shifts ONLY the vocal stem while keeping music in tune.
 */
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import type { Asset } from "@beatsheet/schema";
import { cliEnv } from "./agent/cli.ts";
import { addAsset } from "./ingest.ts";
import { originalPath, stemPath } from "./paths.ts";
import { containerTrouble, HERE, inContainer, venvPython } from "./platform.ts";
import { dropCache, du, findUv, stream } from "./pyenv.ts";
import { SETTINGS_DIR } from "./settings.ts";
import { loadProject, updateFile } from "./store.ts";

const exec = promisify(execFile);

const PYTHON = "3.12";
const NEEDS_GB = 4;
const PACKAGES = ["demucs==4.0.1", "soundfile==0.13.1"];

export const DEMUCS_DIR = join(SETTINGS_DIR, "demucs");
const paths = {
  venv: join(DEMUCS_DIR, "venv"),
  python: venvPython(join(DEMUCS_DIR, "venv")),
  torch: join(DEMUCS_DIR, "torch"),
  ready: join(DEMUCS_DIR, "ready.json"),
};

export type StemMode = "two-stem" | "four-stem";
export type StemName = "vocals" | "no_vocals" | "drums" | "bass" | "other";

export const STEMS_FOR: Record<StemMode, StemName[]> = {
  "two-stem": ["vocals", "no_vocals"],
  "four-stem": ["vocals", "drums", "bass", "other"],
};

type Ready = { version: string; at: string; speed: number; where: string; bytes: number };
export type DemucsStatus = {
  state: "unsupported" | "missing" | "installing" | "ready" | "error";
  detail: string;
  stage?: string;
  progress?: number;
  log?: string[];
  bytes?: number;
  at?: string;
  ready?: Ready;
};

function supported(): string | undefined {
  if (process.platform === "win32") return process.arch === "x64" ? undefined : "Needs a 64-bit Intel or AMD PC";
  if (process.platform === "darwin") return process.arch === "arm64" || process.arch === "x64" ? undefined : "Unsupported Mac architecture";
  if (process.platform === "linux") return undefined;
  return `Unsupported platform (${process.platform})`;
}

export function demucsReadReady(): Ready | undefined {
  try {
    const r = JSON.parse(readFileSync(paths.ready, "utf8")) as Ready;
    return existsSync(paths.python) ? r : undefined;
  } catch {
    return undefined;
  }
}

export const demucsReady = () => !supported() && !!demucsReadReady();

type Install = { stage: string; progress: number; log: string[]; error?: string; abort: AbortController; done?: boolean };
let install: Install | undefined;

export function demucsStatus(): DemucsStatus {
  const why = supported();
  if (why) return { state: "unsupported", detail: why };
  if (install && !install.done) return { state: "installing", detail: install.stage, stage: install.stage, progress: install.progress, log: install.log.slice(-6) };
  const ready = demucsReadReady();
  if (ready) return { state: "ready", detail: `Ready on ${ready.where} · ${ready.speed.toFixed(2)}× real time`, bytes: ready.bytes, at: ready.at, ready };
  if (install?.error) return { state: "error", detail: install.error, log: install.log.slice(-6) };
  return { state: "missing", detail: "Not installed (~2.5 GB with PyTorch & htdemucs weights)" };
}

const uvEnv = async () => ({
  ...(await cliEnv()),
  UV_PYTHON_INSTALL_DIR: join(DEMUCS_DIR, "python"),
  UV_CACHE_DIR: join(DEMUCS_DIR, "cache"),
  UV_PYTHON_PREFERENCE: "only-managed",
  NO_COLOR: "1",
});

/** Installs Demucs (htdemucs) in the background; demucsStatus() reports progress. */
export function installDemucs(): DemucsStatus {
  const why = supported();
  if (why) throw new Error(why);
  if (install && !install.done) return demucsStatus();
  const job: Install = { stage: "Starting", progress: 0, log: [], abort: new AbortController() };
  install = job;
  const log = (line: string) => {
    job.log.push(line);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  void (async () => {
    try {
      mkdirSync(DEMUCS_DIR, { recursive: true });
      const boxed = inContainer(DEMUCS_DIR);
      if (boxed) throw new Error(containerTrouble(boxed));
      const free = statfsSync(DEMUCS_DIR);
      const gb = (free.bavail * free.bsize) / 1e9;
      if (gb < NEEDS_GB) throw new Error(`Needs about ${NEEDS_GB} GB free; ${HERE} has ${gb.toFixed(1)} GB`);
      rmSync(paths.ready, { force: true });

      job.stage = "Setting up Python";
      const uv = await findUv(log, job.abort.signal, DEMUCS_DIR);
      job.progress = 0.06;
      const e = await uvEnv();
      if (!existsSync(paths.python)) {
        log(`$ uv venv --python ${PYTHON}`);
        await stream(uv, ["venv", "--python", PYTHON, paths.venv], { env: e, signal: job.abort.signal, onLine: log });
      }
      job.progress = 0.16;
      job.stage = "Installing Demucs (PyTorch + htdemucs)";
      log("$ uv pip install demucs soundfile");
      let seen = 0;
      await stream(uv, ["pip", "install", "--python", paths.python, ...PACKAGES], {
        env: e,
        signal: job.abort.signal,
        onLine: (line) => {
          log(line);
          if (/^(Resolved|Downloading|Downloaded|Prepared|Installed|Built|Audited)/i.test(line.trim())) job.progress = Math.min(0.65, 0.16 + ++seen * 0.04);
        },
      });
      job.progress = 0.68;
      dropCache(join(DEMUCS_DIR, "cache"), log);

      job.stage = "Downloading htdemucs weights (~84 MB) and timing a short clip";
      const check = await selfCheck(log, job.abort.signal);
      const bytes = await du(DEMUCS_DIR);
      writeFileSync(
        paths.ready,
        JSON.stringify({ version: PACKAGES[0]!, at: new Date().toISOString(), speed: check.speed, where: check.where, bytes } satisfies Ready, null, 2),
      );
      job.progress = 1;
      log(`Ready on ${check.where}: 2s check clip separated in ${(check.speed * 2).toFixed(1)}s.`);
    } catch (err) {
      job.error = job.abort.signal.aborted ? "Stopped. Install again to pick up where it left off." : err instanceof Error ? err.message : String(err);
      log(job.error);
    } finally {
      job.done = true;
      dropCache(join(DEMUCS_DIR, "cache"), log);
    }
  })();
  return demucsStatus();
}

export function cancelDemucsInstall() {
  install?.abort.abort();
}

export function removeDemucs() {
  if (install && !install.done) throw new Error("It's still installing; stop it first");
  rmSync(DEMUCS_DIR, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  install = undefined;
}

async function selfCheck(log: (l: string) => void, signal?: AbortSignal): Promise<{ speed: number; where: string }> {
  const work = join(tmpdir(), `beatsheet-demucs-check-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });
  try {
    const sample = join(work, "check.wav");
    await exec("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2", "-ac", "2", "-c:a", "pcm_s16le", sample]);
    const t0 = Date.now();
    const { where } = await runDemucs(sample, join(work, "out"), "two-stem", { signal, onLine: log });
    const elapsed = Math.max(0.1, (Date.now() - t0) / 1000);
    return { speed: Math.round((elapsed / 2) * 100) / 100, where };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export type DemucsRunner = (inWav: string, outDir: string, mode: StemMode) => Promise<Record<string, string>>;

/** Runs local htdemucs to separate `inWav` into lossless WAV stems inside `outDir`. */
export async function runDemucs(
  inWav: string,
  outDir: string,
  mode: StemMode = "two-stem",
  opts: { signal?: AbortSignal; onLine?: (line: string) => void } = {},
): Promise<{ stems: Record<string, string>; where: string }> {
  if (!existsSync(paths.python)) throw new Error("Demucs isn't installed on this computer (Settings → Restoring)");
  mkdirSync(outDir, { recursive: true });
  mkdirSync(paths.torch, { recursive: true });
  // Prefer MPS on Apple Silicon when PyTorch supports it, otherwise CPU.
  const device = process.platform === "darwin" && process.arch === "arm64" ? "mps" : "cpu";
  const baseArgs = ["-I", "-B", "-m", "demucs.separate", "-n", "htdemucs", ...(mode === "two-stem" ? ["--two-stems", "vocals"] : []), "-o", outDir];
  const env = { ...process.env, TORCH_HOME: paths.torch, PYTORCH_ENABLE_MPS_FALLBACK: "1" };

  const signal = opts.signal ?? new AbortController().signal;
  let used = device;
  try {
    await stream(paths.python, [...baseArgs, "-d", device, inWav], { env, signal, onLine: opts.onLine ?? (() => {}) });
  } catch (err) {
    if (device !== "cpu" && !signal.aborted) {
      used = "cpu";
      await stream(paths.python, [...baseArgs, "-d", "cpu", inWav], { env, signal, onLine: opts.onLine ?? (() => {}) });
    } else {
      throw err;
    }
  }

  const stemName = basename(inWav, extname(inWav));
  const folder = join(outDir, "htdemucs", stemName);
  const stems: Record<string, string> = {};
  for (const name of STEMS_FOR[mode]) {
    const file = join(folder, `${name}.wav`);
    if (existsSync(file)) stems[name] = file;
  }
  if (!Object.keys(stems).length) throw new Error(`Demucs finished without producing stems in ${folder}`);
  return { stems, where: used === "mps" ? "Apple silicon" : "CPU" };
}

/**
 * Separates an asset's audio into lossless stems (`media/<id>.stem-<name>.wav`). Reuses existing stems unless `again`
 * is true. With `addAssets: true`, also encodes `.m4a` copies in `made/stems/` and registers them as project audio assets.
 */
export async function separateStems(
  projectId: string,
  assetId: string,
  opts: { mode?: StemMode; addAssets?: boolean; again?: boolean; onProgress?: (f: number) => void; runner?: DemucsRunner } = {},
): Promise<{ asset: Asset; stems: Record<string, string>; reused: boolean; added: Asset[] }> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind === "image") throw new Error(`"${assetId}" is a photo; it has no audio to separate`);
  const mode: StemMode = opts.mode ?? "two-stem";
  const wanted = STEMS_FOR[mode];
  const existing = Object.fromEntries(wanted.map((s) => [s, stemPath(dir, a.id, s)] as const).filter(([, p]) => existsSync(p)));
  const reused = !opts.again && wanted.every((s) => !!existing[s]);

  const onProgress = opts.onProgress ?? (() => {});
  let stems: Record<string, string> = existing;

  if (!reused) {
    if (!opts.runner && !demucsReady()) throw new Error("Demucs (htdemucs) isn't installed on this computer. Install it in Settings → Restoring.");
    const src = originalPath(project, dir, a);
    if (!existsSync(src)) throw new Error(`Its file isn't there: ${src}`);
    const work = join(tmpdir(), `beatsheet-stems-${process.pid}-${Date.now().toString(36)}`);
    mkdirSync(work, { recursive: true });
    try {
      onProgress(0.08);
      const wav = join(work, "source.wav");
      await exec("ffmpeg", ["-v", "error", "-y", "-i", src, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav], { maxBuffer: 16 * 1024 * 1024 });
      onProgress(0.2);
      const produced = opts.runner ? await opts.runner(wav, join(work, "out"), mode) : (await runDemucs(wav, join(work, "out"), mode)).stems;
      onProgress(0.82);
      mkdirSync(join(dir, "media"), { recursive: true });
      stems = {};
      for (const name of wanted) {
        const made = produced[name];
        if (!made || !existsSync(made)) continue;
        const dest = stemPath(dir, a.id, name);
        copyFileSync(made, dest);
        stems[name] = dest;
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }

  const tracks = wanted.filter((s) => !!stems[s]);
  const meta: NonNullable<Asset["stems"]> = { by: "demucs", mode, tracks, at: new Date().toISOString() };
  updateFile(projectId, (d) => {
    const x = d.assets.find((y) => y.id === a.id);
    if (x) x.stems = meta;
  });

  const added: Asset[] = [];
  if (opts.addAssets) {
    const stemDir = join(dir, "made", "stems");
    mkdirSync(stemDir, { recursive: true });
    for (const name of tracks) {
      const m4a = join(stemDir, `${a.id}-${name}.m4a`);
      await exec("ffmpeg", ["-v", "error", "-y", "-i", stems[name]!, "-c:a", "aac", "-b:a", "192k", m4a]);
      const asset = await addAsset(projectId, m4a, {
        label: `${a.label ?? a.id} · ${name.replace("_", " ")}`,
        tags: ["stem", name],
        provenance: { source: "synth", provider: "demucs", model: "htdemucs", refs: [a.id], op: "stems", params: { mode, stem: name }, createdAt: meta.at },
      });
      added.push(asset);
    }
  }
  onProgress(1);
  return { asset: { ...a, stems: meta }, stems, reused, added };
}
