/**
 * Derived media: small H.264 copies of videos for smooth scrubbing (keyframe every half second), screen-sized JPEGs of
 * photos, posters and filmstrips for thumbnails, and an average colour for placeholders. Renders use the originals.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

const ensureDir = (file: string) => mkdirSync(dirname(file), { recursive: true });
const tmpFor = (file: string) => file.replace(/(\.\w+)$/, `.tmp$1`);

async function ffmpeg(args: string[]) {
  await run("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 16 * 1024 * 1024 });
}

/** Short side 720, 30 fps, keyframe every 15 frames. Hardware encode, with a software fallback. */
export async function makeVideoProxy(src: string, out: string): Promise<void> {
  if (existsSync(out)) return;
  ensureDir(out);
  const tmp = tmpFor(out);
  const scale = "fps=30,scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'";
  const audio = ["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart"];
  try {
    await ffmpeg(["-hwaccel", "videotoolbox", "-i", src, "-vf", scale, "-c:v", "h264_videotoolbox", "-b:v", "3M", "-g", "15", ...audio, tmp]);
  } catch {
    await ffmpeg(["-i", src, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-g", "15", "-keyint_min", "15", "-sc_threshold", "0", ...audio, tmp]);
  }
  renameSync(tmp, out);
}

/** A screen-sized, upright JPEG of a photo (browsers can't show HEIC, and 50 MP photos scrub badly). */
export async function makeImageProxy(src: string, out: string): Promise<void> {
  if (existsSync(out)) return;
  ensureDir(out);
  const tmp = tmpFor(out);
  await sharp(src).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(tmp);
  renameSync(tmp, out);
}

export async function makePoster(src: string, out: string, kind: "video" | "image", duration?: number): Promise<void> {
  if (existsSync(out)) return;
  ensureDir(out);
  const tmp = tmpFor(out);
  if (kind === "image") await sharp(src).rotate().resize({ width: 480, height: 480, fit: "inside" }).jpeg({ quality: 78 }).toFile(tmp);
  else await ffmpeg(["-ss", String(Math.max(0, (duration ?? 1) * 0.4)), "-i", src, "-frames:v", "1", "-vf", "scale=-2:360", "-q:v", "4", tmp]);
  renameSync(tmp, out);
}

/** Eight evenly spaced frames side by side: what the agent looks at to log a clip without watching it. */
export async function makeStrip(src: string, out: string, duration: number, frames = 8): Promise<void> {
  if (existsSync(out)) return;
  ensureDir(out);
  const tmp = tmpFor(out);
  const step = Math.max(0.1, duration / frames);
  await ffmpeg(["-i", src, "-vf", `fps=1/${step.toFixed(3)},scale=-2:180,tile=${frames}x1`, "-frames:v", "1", "-q:v", "5", tmp]);
  renameSync(tmp, out);
}

export async function averageColor(image: string): Promise<string> {
  const { dominant } = await sharp(image).stats();
  const hex = (n: number) => Math.round(n * 0.85).toString(16).padStart(2, "0");
  return `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
}

/** Runs async jobs with at most `limit` at once, reporting each as it finishes. */
export async function pool<T>(items: T[], limit: number, job: (item: T) => Promise<void>, onDone?: (n: number) => void) {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await job(item);
      onDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
