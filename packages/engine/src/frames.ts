/**
 * A still cut from a clip, added to the project beside it: its last frame, to start the next clip from (so it carries
 * on from where this one ends), or any moment, to animate or give a sheet. Video models start from a picture, not a
 * clip, so this is how a clip is continued.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Asset } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { makeOnce, makeStrip } from "./media.ts";
import { assetPath, cachePaths, projectDir } from "./paths.ts";
import { loadProject } from "./store.ts";

const run = promisify(execFile);
const MAX_PREVIEW_SECONDS = 60;
const DEFAULT_PREVIEW_SECONDS = 30;
const safeSlug = (s: string) => s.replace(/[^a-z0-9_-]+/gi, "-") || "clip";
const stamp = (s: number) => `${Math.round(s * 10) / 10}s`.replace(".", "_");

export type ClipPreview = {
  file: string;
  strip?: string;
  from: number;
  to: number;
  duration: number;
  kind: "video" | "audio";
};

/**
 * Slices a compact, watchable low-res MP4 (or M4A for audio/music) of a stretch of an asset into .cache/preview/,
 * without adding it to the project's assets. Lets video/audio-capable agents inspect exact moments of long tapes,
 * interviews or songs without loading a full-length file (and also makes an 8-frame zoomed strip for video).
 */
export async function clipPreview(projectId: string, assetId: string, opts: { from?: number; to?: number } = {}): Promise<ClipPreview> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  const isVideo = a.kind === "video";
  const isAudio = a.kind === "audio" || a.kind === "music" || a.kind === "voice" || a.kind === "sfx";
  if (!isVideo && !isAudio) throw new Error(`"${assetId}" is a ${a.kind}, not a video or audio clip`);
  const total = a.duration;
  const from = Math.max(0, opts.from ?? 0);
  if (total !== undefined && from >= total) throw new Error(`"${assetId}" is ${total.toFixed(1)}s long; start (${from}s) is past its end`);
  const rawTo = opts.to ?? (total !== undefined ? Math.min(total, from + DEFAULT_PREVIEW_SECONDS) : from + DEFAULT_PREVIEW_SECONDS);
  const to = total !== undefined ? Math.min(total, rawTo) : rawTo;
  if (to <= from) throw new Error(`End (${to}s) must be after start (${from}s)`);
  const span = to - from;
  if (span > MAX_PREVIEW_SECONDS + 0.05) throw new Error(`Ask for at most ${MAX_PREVIEW_SECONDS} seconds at a time (got ${span.toFixed(1)}s)`);

  const c = cachePaths(dir, a.id);
  const src = isVideo && existsSync(c.proxy) ? c.proxy : assetPath(project, dir, a);
  if (!existsSync(src)) throw new Error(`File for "${assetId}" isn't on disk`);

  const folder = join(dir, ".cache", "preview");
  const stem = `${safeSlug(a.id)}-${stamp(from)}-${stamp(to)}`;
  const file = join(folder, `${stem}.${isVideo ? "mp4" : "m4a"}`);
  const strip = isVideo ? join(folder, `${stem}-strip.jpg`) : undefined;

  await makeOnce(file, async (tmp) => {
    if (isVideo) {
      const scale = "scale='if(gt(iw,ih),-2,trunc(min(480,iw)/2)*2)':'if(gt(iw,ih),trunc(min(480,ih)/2)*2,-2)'";
      await run(
        "ffmpeg",
        [
          "-v", "error", "-y",
          "-ss", String(from), "-i", src, "-t", String(span),
          "-vf", `fps=24,${scale}`,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "96k", "-ac", "2",
          "-movflags", "+faststart",
          tmp,
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      );
    } else {
      await run(
        "ffmpeg",
        ["-v", "error", "-y", "-ss", String(from), "-i", src, "-t", String(span), "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", tmp],
        { maxBuffer: 16 * 1024 * 1024 },
      );
    }
  });
  if (strip && !existsSync(strip)) await makeStrip(file, strip, span).catch(() => undefined);
  return { file, strip: strip && existsSync(strip) ? strip : undefined, from, to, duration: span, kind: isVideo ? "video" : "audio" };
}

/**
 * Cuts the frame at `at` seconds (the last frame when it's left out) from a clip into a new still asset, or finds the
 * one already cut there. Returns the still.
 */
export async function stillFromClip(projectId: string, assetId: string, at?: number): Promise<Asset> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind !== "video") throw new Error(`"${assetId}" is a ${a.kind}, not a clip`);
  if (at !== undefined && (at < 0 || (a.duration !== undefined && at > a.duration))) throw new Error(`"${assetId}" is ${a.duration?.toFixed(1)}s long; there's no frame at ${at}s`);
  const when = at === undefined ? "last" : at.toFixed(2);
  const have = project.assets.find((x) => x.provenance?.refs?.[0] === assetId && x.provenance.params?.frame === when);
  if (have) return have;
  const folder = join(projectDir(projectId), "made", "frames");
  mkdirSync(folder, { recursive: true });
  const out = join(folder, `${assetId}-${when.replace(".", "_")}.jpg`);
  const file = assetPath(project, dir, a);
  // The last frame: read the final half second and keep overwriting the one picture, so what's left is the end.
  const args = at === undefined ? ["-sseof", "-0.5", "-i", file, "-update", "1", "-q:v", "2", out] : ["-ss", String(at), "-i", file, "-frames:v", "1", "-q:v", "2", out];
  rmSync(out, { force: true });
  await run("ffmpeg", ["-v", "error", "-y", ...args]);
  if (!existsSync(out)) throw new Error(`Couldn't cut a frame from "${assetId}"`);
  const name = a.label ?? a.id;
  return addAsset(projectId, out, {
    id: `${assetId}-${at === undefined ? "end" : "frame"}`,
    label: `${at === undefined ? "Last frame" : `Frame at ${when}s`} of ${name.length > 40 ? `${name.slice(0, 37).trimEnd()}…` : name}`,
    tags: ["still"],
    provenance: { source: "capture", refs: [assetId], params: { frame: when }, createdAt: new Date().toISOString() },
  });
}
