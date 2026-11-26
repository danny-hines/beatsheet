/**
 * Local commercial-safe computer-vision prep tools (`SETTINGS_DIR/vision-prep`): Apache-2.0 MediaPipe Face Landmarker
 * (478 landmarks + 52 ARKit blendshapes + 3D head pose), OpenCV, NumPy, and ONNX Runtime (plus optional Depth Anything
 * V2 Small ONNX). Runs on CPU on Mac, Windows and Linux with zero GPU required.
 *
 * Powers both:
 * - Character Swap (`swap.ts` / `native/swap-worker.py`): Fast face-mesh & Advanced depth+silhouette+mesh conditioning.
 * - Facial Performance Transfer (`perform.ts` / `native/face-track.py`): 52 ARKit blendshape + head-pose extraction.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cliEnv } from "./agent/cli.ts";
import { containerTrouble, HERE, inContainer, venvPython } from "./platform.ts";
import { dropCache, du, findUv, stream } from "./pyenv.ts";
import { SETTINGS_DIR } from "./settings.ts";

const PYTHON = "3.12";
const NEEDS_GB = 1.5;
const PACKAGES = [
  "mediapipe==0.10.21",
  "opencv-python-headless==4.11.0.86",
  "numpy==1.26.4",
  "pillow==11.1.0",
  "onnxruntime==1.20.1",
];
/** Google's official Apache-2.0 Face Landmarker task bundle (~3.8 MB). */
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

export const VISION_DIR = join(SETTINGS_DIR, "vision-prep");
const paths = {
  venv: join(VISION_DIR, "venv"),
  python: venvPython(join(VISION_DIR, "venv")),
  models: join(VISION_DIR, "models"),
  faceModel: join(VISION_DIR, "models", "face_landmarker.task"),
  depthModel: join(VISION_DIR, "models", "depth_anything_v2_vits.onnx"),
  ready: join(VISION_DIR, "ready.json"),
};

export const visionPython = () => paths.python;
export const faceLandmarkerModel = () => paths.faceModel;
export const depthModelPath = () => (existsSync(paths.depthModel) ? paths.depthModel : undefined);

type Ready = { version: string; at: string; bytes: number; hasDepth?: boolean };
export type VisionPrepStatus = {
  state: "unsupported" | "missing" | "installing" | "ready" | "error";
  detail: string;
  stage?: string;
  progress?: number;
  log?: string[];
  bytes?: number;
  at?: string;
  hasDepth?: boolean;
};

function supported(): string | undefined {
  if (process.platform === "win32") return process.arch === "x64" ? undefined : "Needs a 64-bit Intel or AMD PC";
  if (process.platform === "darwin" || process.platform === "linux") return undefined;
  return `Unsupported platform (${process.platform})`;
}

function readReady(): Ready | undefined {
  try {
    const r = JSON.parse(readFileSync(paths.ready, "utf8")) as Ready;
    return existsSync(paths.python) && existsSync(paths.faceModel) ? r : undefined;
  } catch {
    return undefined;
  }
}

export const visionPrepReady = () => !supported() && !!readReady();

type Install = { stage: string; progress: number; log: string[]; error?: string; abort: AbortController; done?: boolean };
let install: Install | undefined;

export function visionPrepStatus(): VisionPrepStatus {
  const why = supported();
  if (why) return { state: "unsupported", detail: why };
  if (install && !install.done) return { state: "installing", detail: install.stage, stage: install.stage, progress: install.progress, log: install.log.slice(-6) };
  const ready = readReady();
  if (ready) {
    return {
      state: "ready",
      detail: `Ready · MediaPipe Face Landmarker (Apache 2.0) + OpenCV${existsSync(paths.depthModel) ? " + Depth Anything V2" : ""}`,
      bytes: ready.bytes,
      at: ready.at,
      hasDepth: existsSync(paths.depthModel),
    };
  }
  if (install?.error) return { state: "error", detail: install.error, log: install.log.slice(-6) };
  return { state: "missing", detail: "Not installed (~400 MB: MediaPipe, OpenCV, ONNX Runtime)" };
}

const uvEnv = async () => ({
  ...(await cliEnv()),
  UV_PYTHON_INSTALL_DIR: join(VISION_DIR, "python"),
  UV_CACHE_DIR: join(VISION_DIR, "cache"),
  UV_PYTHON_PREFERENCE: "only-managed",
  NO_COLOR: "1",
});

/** Installs MediaPipe + OpenCV + ONNX Runtime + Face Landmarker model in the background. */
export function installVisionPrep(): VisionPrepStatus {
  const why = supported();
  if (why) throw new Error(why);
  if (install && !install.done) return visionPrepStatus();
  const job: Install = { stage: "Starting", progress: 0, log: [], abort: new AbortController() };
  install = job;
  const log = (line: string) => {
    job.log.push(line);
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  void (async () => {
    try {
      mkdirSync(paths.models, { recursive: true });
      const boxed = inContainer(VISION_DIR);
      if (boxed) throw new Error(containerTrouble(boxed));
      const free = statfsSync(VISION_DIR);
      const gb = (free.bavail * free.bsize) / 1e9;
      if (gb < NEEDS_GB) throw new Error(`Needs about ${NEEDS_GB} GB free; ${HERE} has ${gb.toFixed(1)} GB`);
      rmSync(paths.ready, { force: true });

      job.stage = "Setting up Python";
      const uv = await findUv(log, job.abort.signal, VISION_DIR);
      job.progress = 0.08;
      const e = await uvEnv();
      if (!existsSync(paths.python)) {
        log(`$ uv venv --python ${PYTHON}`);
        await stream(uv, ["venv", "--python", PYTHON, paths.venv], { env: e, signal: job.abort.signal, onLine: log });
      }
      job.progress = 0.2;
      job.stage = "Installing MediaPipe, OpenCV and ONNX Runtime";
      log("$ uv pip install mediapipe opencv-python-headless numpy pillow onnxruntime");
      let seen = 0;
      await stream(uv, ["pip", "install", "--python", paths.python, ...PACKAGES], {
        env: e,
        signal: job.abort.signal,
        onLine: (line) => {
          log(line);
          if (/^(Resolved|Downloading|Downloaded|Prepared|Installed|Built|Audited)/i.test(line.trim())) job.progress = Math.min(0.75, 0.2 + ++seen * 0.06);
        },
      });
      dropCache(join(VISION_DIR, "cache"), log);

      job.progress = 0.8;
      job.stage = "Downloading MediaPipe Face Landmarker model (~4 MB)";
      const res = await fetch(FACE_MODEL_URL, { signal: job.abort.signal });
      if (!res.ok) throw new Error(`Couldn't fetch MediaPipe Face Landmarker (${res.status})`);
      writeFileSync(paths.faceModel, Buffer.from(await res.arrayBuffer()));

      job.progress = 0.92;
      job.stage = "Verifying imports";
      await stream(paths.python, ["-I", "-B", "-c", "import mediapipe, cv2, numpy, onnxruntime; print('ok')"], {
        env: process.env,
        signal: job.abort.signal,
        onLine: log,
      });

      const bytes = await du(VISION_DIR);
      writeFileSync(
        paths.ready,
        JSON.stringify({ version: PACKAGES[0]!, at: new Date().toISOString(), bytes, hasDepth: existsSync(paths.depthModel) } satisfies Ready, null, 2),
      );
      job.progress = 1;
      log("Vision prep ready.");
    } catch (err) {
      job.error = job.abort.signal.aborted ? "Stopped. Install again to pick up where it left off." : err instanceof Error ? err.message : String(err);
      log(job.error);
    } finally {
      job.done = true;
      dropCache(join(VISION_DIR, "cache"), log);
    }
  })();
  return visionPrepStatus();
}

export function cancelVisionPrepInstall() {
  install?.abort.abort();
}

export function removeVisionPrep() {
  if (install && !install.done) throw new Error("It's still installing; stop it first");
  rmSync(VISION_DIR, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
  install = undefined;
}
