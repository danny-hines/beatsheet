/** What a media file is: kind, size as displayed (rotation applied), length, frame rate, and when it was shot. */
import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import { basename, extname } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const run = promisify(execFile);

export type Probe = {
  kind: "video" | "image" | "audio";
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  hasAudio?: boolean;
  capturedAt?: string;
};

export const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);
export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"]);
export const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff"]);

export function kindOf(file: string): Probe["kind"] | undefined {
  const ext = extname(file).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  return undefined;
}

/** Phone and camera names like 20260704_121555 or dji_fly_20260628_141242 carry the local capture time. */
export function timeFromName(file: string): string | undefined {
  const m = basename(file).match(/(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

const rate = (r: string | undefined) => {
  if (!r) return undefined;
  const [a, b] = r.split("/").map(Number);
  return b ? Math.round((a! / b) * 1000) / 1000 : a;
};

export async function probe(file: string): Promise<Probe> {
  const kind = kindOf(file);
  if (!kind) throw new Error(`Not a media file: ${file}`);
  const fallbackTime = () => timeFromName(file) ?? statSync(file).mtime.toISOString();

  if (kind === "image") {
    const m = await sharp(file).metadata();
    const swap = (m.orientation ?? 1) >= 5;
    return { kind, width: swap ? m.height : m.width, height: swap ? m.width : m.height, capturedAt: fallbackTime() };
  }

  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout) as {
    format?: { duration?: string; tags?: Record<string, string> };
    streams?: { codec_type: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; tags?: Record<string, string>; side_data_list?: { rotation?: number }[] }[];
  };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const hasAudio = !!j.streams?.some((s) => s.codec_type === "audio");
  const duration = j.format?.duration ? Math.round(Number(j.format.duration) * 1000) / 1000 : undefined;
  const capturedAt = timeFromName(file) ?? j.format?.tags?.creation_time ?? fallbackTime();
  if (kind === "audio" || !v) return { kind: "audio", duration, hasAudio, capturedAt };
  const rotation = Math.abs(Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0)) % 180;
  return {
    kind,
    duration,
    width: rotation === 90 ? v.height : v.width,
    height: rotation === 90 ? v.width : v.height,
    fps: rate(v.r_frame_rate),
    codec: v.codec_name,
    hasAudio,
    capturedAt,
  };
}
