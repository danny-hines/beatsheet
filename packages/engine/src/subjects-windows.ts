/**
 * Subjects and cut-outs on Windows, where there's no Apple Vision. SAM 3.1 on the PC's NVIDIA card, once it's installed
 * (sam-cuda.ts), finds and follows faces, people and anything boxed, and cuts out photos, stills and clips. Before that,
 * OpenCV finds faces and people and follows a box (`native/subjects-lite.py`, run with uv, which brings OpenCV), and
 * cut-outs wait for SAM. Each answers the way the Mac's Vision helper does, so subjects.ts reads them alike.
 *
 * SAM reads clips cut down first with ffmpeg into a folder of frames: just the stretch wanted, at a frame rate and size
 * the card can take.
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Rect } from "@beatsheet/schema";
import { cliEnv } from "./agent/cli.ts";
import { alphaWebm } from "./media.ts";
import { REPO } from "./paths.ts";
import { findOnPath, pathKey } from "./platform.ts";
import { findUv } from "./pyenv.ts";
import { samReady } from "./sam.ts";
import { samCutoutVideo, samSegment, samSubjects, samTrack, videoLimits } from "./sam-cuda.ts";
import { SETTINGS_DIR } from "./settings.ts";

const exec = promisify(execFile);
/** ffmpeg and the rest, without a console window flashing up from the app. */
const run = (cmd: string, args: string[], opts: { maxBuffer?: number } = {}) => exec(cmd, args, { ...opts, windowsHide: true });
type Progress = (fraction: number) => void;
export type Found = { tracks: { kind: "face" | "person"; samples: number[][] }[] };

/** What a subject found here says found it (`SubjectTrack.by`). */
export const windowsFinder = () => (samReady() ? "sam-3.1" : "opencv");

export async function windowsVisionStatus(): Promise<{ ok: boolean; detail: string }> {
  if (samReady()) return { ok: true, detail: "Built in: SAM 3.1 on this PC's graphics card" };
  const env = await cliEnv();
  return findOnPath("uv", env[pathKey(env)] ?? "")
    ? { ok: true, detail: "Faces and people with OpenCV. Install SAM 3.1 (below) to cut things out and to find anything you name" }
    : { ok: true, detail: "Faces and people with OpenCV (beatsheet fetches uv for it the first time). Install SAM 3.1 (below) to cut things out" };
}

// ---- Getting pictures ready

/** Picture formats SAM reads as they are; anything else (HEIC, RAW) is converted first. */
const READABLE = /\.(jpe?g|png|webp|tiff?|bmp)$/i;
const temp = (ext: string) => join(tmpdir(), `beatsheet-sam-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${ext}`);

/** A picture as a PNG (ffmpeg reads HEIC where the Mac would use sips). */
export async function toPng(src: string, out: string): Promise<void> {
  await run("ffmpeg", ["-v", "error", "-y", "-i", src, "-frames:v", "1", out]);
}

/** A file SAM can read: the picture itself, or a PNG of it, or of a clip's frame at `at` seconds. */
async function picture(original: string, kind: "image" | "video", at = 0): Promise<{ file: string; done: () => void }> {
  if (kind === "image" && READABLE.test(original)) return { file: original, done: () => {} };
  const file = temp("png");
  if (kind === "video") await run("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", original, "-frames:v", "1", file]);
  else await toPng(original, file);
  return { file, done: () => rmSync(file, { force: true }) };
}

/** Even sizes no longer than `maxSide`, keeping the shape. */
export function fitSize(width: number, height: number, maxSide: number): { width: number; height: number } {
  const k = Math.min(1, maxSide / Math.max(width, height));
  const even = (v: number) => Math.max(2, 2 * Math.round((v * k) / 2));
  return { width: even(width), height: even(height) };
}

/**
 * Just the stretch wanted, at `fps` frames a second and no bigger than `maxSide`, as a folder of frames (0.jpg, 1.jpg…)
 * for SAM to read. (Meta's .mp4 reader leaves pixels unscaled and frames at full float32; its folder reader doesn't.)
 */
async function workClip(src: string, opts: { from?: number; to?: number; fps: number; maxSide: number; width?: number; height?: number }): Promise<string> {
  const folder = mkdtempSync(join(tmpdir(), "beatsheet-sam-"));
  const size = opts.width && opts.height ? fitSize(opts.width, opts.height, opts.maxSide) : undefined;
  const scale = size ? `scale=${size.width}:${size.height}` : `scale='if(gt(iw,ih),min(${opts.maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${opts.maxSide},ih))'`;
  const span = opts.to !== undefined && Number.isFinite(opts.to) ? ["-t", String(Math.max(0.1, opts.to - (opts.from ?? 0)))] : [];
  try {
    await run("ffmpeg", ["-v", "error", "-y", ...(opts.from ? ["-ss", String(opts.from)] : []), "-i", src, ...span, "-vf", `fps=${opts.fps},${scale}`, "-an", "-q:v", "2", "-start_number", "0", join(folder, "%d.jpg")], { maxBuffer: 1 << 24 });
  } catch (err) {
    rmSync(folder, { recursive: true, force: true });
    throw err;
  }
  return folder;
}

/** Frames a second to read a clip at: up to `most`, fewer for a long one, so SAM looks at no more than ~1200 frames. */
export const readRate = (duration: number | undefined, most: number, least = 1) => Math.max(least, Math.min(most, Math.floor(1200 / Math.max(1, duration ?? 1))));

// ---- Without SAM: OpenCV, through uv

const LITE = join(REPO, "packages", "engine", "native", "subjects-lite.py");
const OPENCV = ["opencv-contrib-python-headless==4.10.0.84", "numpy<2"];
/** OpenCV's face finder (YuNet, 230 KB), pinned and checked. */
const FACE_MODEL = {
  url: "https://github.com/opencv/opencv_zoo/raw/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
  sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
};

async function faceModel(): Promise<string> {
  const file = join(SETTINGS_DIR, "models", "face_detection_yunet_2023mar.onnx");
  if (existsSync(file)) return file;
  const res = await fetch(FACE_MODEL.url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Couldn't download OpenCV's face finder (GitHub answered ${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== FACE_MODEL.sha256) throw new Error("OpenCV's face finder came down damaged; try again");
  mkdirSync(join(SETTINGS_DIR, "models"), { recursive: true });
  writeFileSync(`${file}.tmp`, bytes);
  renameSync(`${file}.tmp`, file);
  return file;
}

/** Runs the OpenCV helper with uv; resolves to its JSON output. Progress lines on stderr are passed on. */
async function lite<T>(args: string[], onProgress?: Progress): Promise<T> {
  const uv = await findUv(() => {}, AbortSignal.timeout(5 * 60_000), join(SETTINGS_DIR, "uv"));
  const env = { ...(await cliEnv()), NO_COLOR: "1" };
  return new Promise((ok, fail) => {
    const p = spawn(uv, ["run", "--quiet", "--no-project", "--python", "3.12", ...OPENCV.flatMap((x) => ["--with", x]), "python", "-I", LITE, ...args], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "", lastError = "", rest = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      const lines = (rest + d).split(/\r?\n/);
      rest = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("progress ")) onProgress?.(Number(line.slice(9)));
        else if (line.startsWith("error ")) lastError = line.slice(6);
        else if (line.trim()) err = line;
      }
    });
    p.on("error", fail);
    p.on("close", (code) => {
      if (code !== 0) return fail(new Error(lastError || err || `the OpenCV helper stopped (${code})`));
      try {
        ok(JSON.parse(out) as T);
      } catch {
        fail(new Error("the OpenCV helper said something unreadable"));
      }
    });
  });
}

// ---- What subjects.ts asks for

/** Faces and people in a clip (`file`, its preview copy) or a photo, each followed through the clip. */
export async function windowsSubjects(file: string, a: { kind: string; duration?: number }, onProgress?: Progress): Promise<Found> {
  if (!samReady()) return lite<Found>(["subjects", file, "--face-model", await faceModel()], onProgress);
  if (a.kind === "image") {
    const pic = await picture(file, "image");
    try {
      return await samSubjects(pic.file, 1, 0, onProgress);
    } finally {
      pic.done();
    }
  }
  // Every 0.2 s, as the Mac looks.
  const fps = readRate(a.duration, 5);
  const clip = await workClip(file, { fps, maxSide: 1280 });
  try {
    return await samSubjects(clip, fps, 0, onProgress);
  } finally {
    rmSync(clip, { recursive: true, force: true });
  }
}

/** Follows what's in `box` at `at` seconds through a clip, both ways. */
export async function windowsTrack(file: string, a: { duration?: number }, at: number, box: Rect, onProgress?: Progress): Promise<{ samples: number[][] }> {
  if (!samReady()) return lite(["track", file, "--at", String(at), "--box", [box.x, box.y, box.w, box.h].join(",")], onProgress);
  const fps = readRate(a.duration, 10, 2);
  const clip = await workClip(file, { fps, maxSide: 1280 });
  try {
    return await samTrack(clip, fps, 0, at, box, onProgress);
  } finally {
    rmSync(clip, { recursive: true, force: true });
  }
}

const NEEDS_SAM = "Cut-outs on this PC need SAM 3.1: install it in Settings → On this PC. (With a fal key, a photo can be cut out by description meanwhile.)";

/**
 * A cut-out of a photo, or of a clip's frame at `at`: what's under `point`, what's in `box` (a subject there), or
 * people. SAM needs telling what the subject is, so "whatever stands out" needs a prompt, a point or a subject here.
 */
export async function windowsCutoutStill(original: string, kind: "image" | "video", opts: { out: string; at?: number; mode: "people" | "subject"; point?: { x: number; y: number }; box?: Rect; each?: boolean }, onProgress?: Progress): Promise<{ cutouts: { file: string; box: Rect }[] }> {
  if (!samReady()) throw new Error(NEEDS_SAM);
  if (!opts.point && !opts.box && opts.mode !== "people") throw new Error("Say what to cut out: a prompt (\"the dog\"), a subject, or a point on it.");
  const pic = await picture(original, kind, opts.at ?? 0);
  try {
    onProgress?.(0.1);
    const cutouts = opts.point
      ? await samSegment(pic.file, undefined, opts.out, { point: opts.point })
      : opts.box
        ? await samSegment(pic.file, undefined, opts.out, { box: opts.box })
        : await samSegment(pic.file, "person", opts.out, { each: opts.each });
    if (!cutouts.length) throw new Error(opts.mode === "people" && !opts.box && !opts.point ? "no people found" : "nothing to lift there");
    onProgress?.(0.9);
    return { cutouts };
  } finally {
    pic.done();
  }
}

/**
 * A clip's cut-out (VP9 with alpha in `file`): someone followed before (`follow`), what `prompt` describes, or people.
 * The clip is read at up to 30 fps and the size this card can take; a stretch longer than it can hold is shortened.
 */
export async function windowsCutoutVideo(
  original: string,
  a: { fps?: number; width?: number; height?: number },
  opts: { file: string; from: number; to: number; mode: "people" | "subject"; follow?: number[][]; prompt?: string },
  onProgress?: Progress,
): Promise<{ box?: Rect; frames: number; to: number }> {
  if (!samReady()) throw new Error(NEEDS_SAM);
  if (!opts.follow && !opts.prompt && opts.mode !== "people") throw new Error("Say what to cut out of the clip: a prompt (\"the dog\") or a subject (find_subjects, track_subject).");
  const limits = videoLimits();
  const to = Math.min(opts.to, opts.from + limits.maxSeconds);
  const fps = Math.min(30, Math.round(a.fps ?? 30));
  const clip = await workClip(original, { from: opts.from, to, fps, maxSide: limits.maxSide, width: a.width, height: a.height });
  const tmp = `${opts.file}.part.webm`;
  try {
    onProgress?.(0.02);
    const r = await samCutoutVideo(clip, { fps, from: opts.from, encoder: alphaWebm("{size}", "{fps}", tmp), prompt: opts.follow ? undefined : (opts.prompt ?? "person"), follow: opts.follow }, (f) => onProgress?.(0.02 + f * 0.96));
    if (!r.frames) throw new Error("nothing to cut out in that stretch");
    renameSync(tmp, opts.file);
    onProgress?.(1);
    return { box: r.box, frames: r.frames, to };
  } finally {
    rmSync(clip, { recursive: true, force: true });
    rmSync(tmp, { force: true });
  }
}
