/**
 * Recordings made in the studio (the screen, a camera, the microphone) become footage like any imported file. The
 * browser's recording is tidied into an ordinary MP4 (or M4A for sound alone) that seeks and plays everywhere, kept in
 * the project's own recordings/ folder (they go with the project if it's moved to the Trash), and added to the media.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Asset } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { projectDir } from "./paths.ts";

const run = promisify(execFile);

export type RecordingKind = "screen" | "camera" | "voice";
const WORDS: Record<RecordingKind, { label: string; tag: string; file: string }> = {
  screen: { label: "Screen recording", tag: "screen recording", file: "Screen recording" },
  camera: { label: "Camera", tag: "camera", file: "Camera recording" },
  voice: { label: "Voice recording", tag: "voice recording", file: "Voice recording" },
};

/** Where an upload waits while it's tidied: in the recordings folder, hidden. */
export function incomingPath(projectId: string, type: string): string {
  const dir = join(projectDir(projectId), "recordings");
  mkdirSync(dir, { recursive: true });
  const ext = /mp4/.test(type) ? ".mp4" : /ogg/.test(type) ? ".ogg" : ".webm";
  return join(dir, `.incoming-${Date.now().toString(36)}${ext}`);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Streams in the file: their codecs, and the picture's size. */
async function streams(file: string): Promise<{ video?: { codec: string; width: number; height: number }; audio?: string }> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", file]);
  const s = (JSON.parse(stdout) as { streams?: { codec_type: string; codec_name: string; width?: number; height?: number }[] }).streams ?? [];
  const v = s.find((x) => x.codec_type === "video");
  return { video: v && { codec: v.codec_name, width: v.width ?? 0, height: v.height ?? 0 }, audio: s.find((x) => x.codec_type === "audio")?.codec_name };
}

/**
 * Turns an upload into a recording in the project: an MP4 (H.264 and AAC, the index at the front so it plays straight
 * away) or, for sound alone, an M4A. H.264 from the browser is kept as it is; anything else is encoded.
 */
export async function addRecording(projectId: string, upload: string, opts: { kind: RecordingKind; label?: string; at?: Date }): Promise<Asset> {
  const w = WORDS[opts.kind];
  const at = opts.at ?? new Date();
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} at ${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}`;
  const dir = join(projectDir(projectId), "recordings");
  try {
    const s = await streams(upload);
    const sound = opts.kind === "voice" || !s.video;
    if (sound && !s.audio) throw new Error("The recording has no sound in it");
    let out = join(dir, `${w.file} ${stamp}${sound ? ".m4a" : ".mp4"}`);
    for (let n = 2; existsSync(out); n++) out = join(dir, `${w.file} ${stamp} ${n}${sound ? ".m4a" : ".mp4"}`);
    const tmp = `${out}.part${sound ? ".m4a" : ".mp4"}`;
    const audio = s.audio ? (s.audio === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k"]) : ["-an"];
    const video = !s.video || sound
      ? ["-vn"]
      : s.video.codec === "h264" && s.video.width % 2 === 0 && s.video.height % 2 === 0
        ? ["-c:v", "copy"]
        : // Even sizes for 4:2:0; screens are often odd once a window is picked.
          ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];
    try {
      await run("ffmpeg", ["-v", "error", "-y", "-i", upload, ...video, ...audio, "-movflags", "+faststart", tmp], { maxBuffer: 1 << 24 });
    } catch (err) {
      rmSync(tmp, { force: true });
      throw new Error(`Couldn't save the recording: ${String((err as { stderr?: string }).stderr ?? (err as Error).message).trim().split("\n").pop()}`);
    }
    renameSync(tmp, out);
    const when = at.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const id = `${opts.kind === "voice" ? "mic" : opts.kind}-${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
    return await addAsset(projectId, out, {
      id,
      label: opts.label?.trim() || `${w.label} · ${when}`,
      tags: [w.tag],
      capturedAt: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`,
      provenance: { source: "recorded", provider: opts.kind, createdAt: at.toISOString() },
    });
  } finally {
    rmSync(upload, { force: true });
  }
}
