/**
 * Derived media: small H.264 copies of videos for smooth scrubbing (keyframe every half second), screen-sized JPEGs of
 * photos, posters and filmstrips for thumbnails, and an average colour for placeholders. Renders use the originals.
 */
import { execFile, spawn } from "node:child_process";
import { filmFrames, PEAK_RATE } from "@beatsheet/schema";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { replaceFile } from "./platform.ts";

const run = promisify(execFile);

/**
 * Makes `out` in a temporary file of its own and moves it into place, so nothing sees it half-made. One job per file at
 * a time: the import and the studio asking for a poster can both want the same preview, and two ffmpegs writing one file
 * spoil it. Another process (the CLI, an agent's tools) can still get there first; then its file stands.
 */
const making = new Map<string, Promise<void>>();
let jobs = 0;
export function makeOnce(out: string, make: (tmp: string) => Promise<void>): Promise<void> {
  if (existsSync(out)) return Promise.resolve();
  const running = making.get(out);
  if (running) return running;
  const job = (async () => {
    mkdirSync(dirname(out), { recursive: true });
    // The extension stays last: ffmpeg and sharp choose the format from it.
    const tmp = out.replace(/(\.\w+)$/, `.${process.pid}-${++jobs}.tmp$1`);
    try {
      await make(tmp);
      if (!existsSync(out)) replaceFile(tmp, out);
    } finally {
      rmSync(tmp, { force: true });
    }
  })().finally(() => making.delete(out));
  making.set(out, job);
  return job;
}

async function ffmpeg(args: string[]) {
  await run("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 16 * 1024 * 1024 });
}

/** ffmpeg turning raw RGBA frames on its stdin into VP9 with alpha in a WebM: a moving cut-out. */
export const alphaWebm = (size: string, fps: string, out: string) =>
  ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", size, "-r", fps, "-i", "-", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", "-f", "webm", out];

/**
 * The hardware decoder and H.264 encoder to try first: VideoToolbox on the Mac, NVIDIA's on a PC (8-bit, which browsers
 * play, whatever the phone shot).
 */
export function hardwareProxy(platform: NodeJS.Platform = process.platform): { decode: string[]; encode: string[] } {
  if (platform === "win32") return { decode: ["-hwaccel", "cuda"], encode: ["-c:v", "h264_nvenc", "-preset", "p4", "-pix_fmt", "yuv420p", "-b:v", "3M", "-g", "15"] };
  return { decode: ["-hwaccel", "videotoolbox"], encode: ["-c:v", "h264_videotoolbox", "-b:v", "3M", "-g", "15"] };
}

/** Short side 720, 30 fps, keyframe every 15 frames. Hardware encode, with a software fallback. */
export function makeVideoProxy(src: string, out: string): Promise<void> {
  const scale = "fps=30,scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'";
  const audio = ["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart"];
  return makeOnce(out, async (tmp) => {
    try {
      const hw = hardwareProxy();
      await ffmpeg([...hw.decode, "-i", src, "-vf", scale, ...hw.encode, ...audio, tmp]);
    } catch {
      await ffmpeg(["-i", src, "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-g", "15", "-keyint_min", "15", "-sc_threshold", "0", ...audio, tmp]);
    }
  });
}

/**
 * A copy of old video that plays like new: each interlaced field made a frame (bwdif, so motion stays as smooth as on
 * the tape, at twice the frame rate), pixels made square, in H.264 at a quality that keeps what tape has.
 */
export function makePlayable(src: string, out: string, how: { deinterlace?: boolean; sar?: number }): Promise<void> {
  const vf = [...(how.deinterlace ? ["bwdif=mode=send_field:deint=all"] : []), ...(how.sar ? [`scale=trunc(iw*${how.sar}/2)*2:ih`] : []), "setsar=1", "format=yuv420p"].join(",");
  return makeOnce(out, (tmp) => ffmpeg(["-i", src, "-vf", vf, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp]));
}

/** A screen-sized, upright JPEG of a photo (browsers can't show HEIC, and 50 MP photos scrub badly). */
export function makeImageProxy(src: string, out: string): Promise<void> {
  return makeOnce(out, async (tmp) => void (await sharp(src).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(tmp)));
}

export function makePoster(src: string, out: string, kind: "video" | "image", duration?: number): Promise<void> {
  return makeOnce(out, async (tmp) => {
    if (kind === "image") await sharp(src).rotate().resize({ width: 480, height: 480, fit: "inside" }).jpeg({ quality: 78 }).toFile(tmp);
    else await ffmpeg(["-ss", String(Math.max(0, (duration ?? 1) * 0.4)), "-i", src, "-frames:v", "1", "-vf", "scale=-2:360", "-q:v", "4", tmp]);
  });
}

/** Eight evenly spaced frames side by side: what the agent looks at to log a clip without watching it. */
export function makeStrip(src: string, out: string, duration: number, frames = 8): Promise<void> {
  const step = Math.max(0.1, duration / frames);
  return makeOnce(out, (tmp) => ffmpeg(["-i", src, "-vf", `fps=1/${step.toFixed(3)},scale=-2:180,tile=${frames}x1`, "-frames:v", "1", "-q:v", "5", tmp]));
}

/** The timeline's filmstrip: a small frame every few seconds (filmFrames says how often), side by side. */
export function makeFrames(src: string, out: string, duration: number): Promise<void> {
  const { step, count } = filmFrames(duration);
  return makeOnce(out, (tmp) => ffmpeg(["-i", src, "-vf", `fps=1/${step},scale=-2:72,tile=${count}x1`, "-frames:v", "1", "-q:v", "6", tmp]));
}

/**
 * A waveform: how loud the sound is, PEAK_RATE times a second (the loudest sample in each stretch, 0..255), as JSON
 * with the values in base64. A file without sound has none.
 */
export function makePeaks(src: string, out: string): Promise<void> {
  return makeOnce(out, async (tmp) => {
    const sr = 8000;
    const per = sr / PEAK_RATE;
    const peaks: number[] = [];
    let max = 0, n = 0, odd: number | undefined;
    await new Promise<void>((done, fail) => {
      const p = spawn("ffmpeg", ["-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", String(sr), "-f", "s16le", "-"]);
      p.stdout.on("data", (chunk: Buffer) => {
        let i = 0;
        // A sample split across two chunks.
        if (odd !== undefined) {
          take(Math.abs((((chunk[0]! << 8) | odd) << 16) >> 16));
          odd = undefined;
          i = 1;
        }
        for (; i + 1 < chunk.length; i += 2) take(Math.abs(chunk.readInt16LE(i)));
        if (i < chunk.length) odd = chunk[i];
      });
      p.on("error", fail);
      // No sound at all is a waveform of nothing, not a failure.
      p.on("close", () => done());
    });
    function take(v: number) {
      if (v > max) max = v;
      if (++n >= per) {
        peaks.push(Math.min(255, Math.round((max / 32768) * 255)));
        max = 0;
        n = 0;
      }
    }
    if (n) peaks.push(Math.min(255, Math.round((max / 32768) * 255)));
    writeFileSync(tmp, JSON.stringify({ rate: PEAK_RATE, peaks: Buffer.from(peaks).toString("base64") }));
  });
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
