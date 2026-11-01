/**
 * Exports and stills, through Remotion. The composition bundle is built once per process and reused. Scenes can use
 * WebGL (three.js), so Chrome renders with a GPU-backed context; finished exports are mastered for social loudness.
 */
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { EXPORT_KINDS, type ExportKind, type Project } from "@beatsheet/schema";
import type { MediaQuality, VideoProps } from "@beatsheet/video";
import { startServer } from "./http.ts";
import { REPO } from "./paths.ts";
import { loadProject } from "./store.ts";
import { wordsInCut } from "./transcribe.ts";

const run = promisify(execFile);
/** WebGL for three.js scenes, in headless Chrome. */
const chromiumOptions = { gl: "angle" as const };

let serveUrl: Promise<string> | undefined;
const getBundle = () => (serveUrl ??= bundle({ entryPoint: join(REPO, "packages", "video", "src", "root.tsx") }));

/** The composition for a cut, or for `override`: a stand-in cut made from the project's material (a look's preview, say). */
async function prepare(id: string, cut: string | undefined, format: string | undefined, quality: MediaQuality, override?: Project, transparent?: boolean) {
  const loaded = loadProject(id, cut);
  const project = override ?? loaded.project;
  const dir = loaded.dir;
  const fmt = project.formats.find((f) => f.id === format) ?? project.formats[0]!;
  const [url, origin] = await Promise.all([getBundle(), startServer()]);
  const inputProps: VideoProps = { project, format: fmt.id, mediaBase: `${origin}/media/${id}`, quality, words: wordsInCut(id, project), ...(transparent ? { transparent } : {}) };
  const composition = await selectComposition({ serveUrl: url, id: "beatsheet", inputProps, chromiumOptions });
  return { project, dir, fmt, url, inputProps, composition };
}

export async function renderProject(
  id: string,
  opts: {
    cut?: string;
    format?: string;
    quality?: MediaQuality;
    onProgress?: (p: number) => void;
    out?: string;
    scale?: number;
    master?: boolean;
    saveAs?: string;
    /** What kind of file (see EXPORT_KINDS); default an H.264 MP4. */
    kind?: ExportKind;
    /** Only this stretch of the cut, in seconds. */
    range?: { from: number; to: number };
  } = {},
): Promise<string> {
  const quality = opts.quality ?? "original";
  const kind = opts.kind ?? "mp4";
  const { project, dir, fmt, url, inputProps, composition } = await prepare(id, opts.cut, opts.format, quality, undefined, kind === "alpha");
  mkdirSync(join(dir, "out"), { recursive: true });
  // Each cut renders to its own file; the first cut keeps the plain name.
  const cutPart = project.cut.id === "main" ? "" : `-${project.cut.id}`;
  const rangePart = opts.range ? `-${Math.round(opts.range.from)}s-${Math.round(opts.range.to)}s` : "";
  const out = opts.out ?? join(dir, "out", `${project.id}${cutPart}-${fmt.id}${rangePart}${quality === "proxy" ? "-draft" : ""}${kind === "alpha" ? "-alpha" : kind === "hevc" ? "-hevc" : ""}.${EXPORT_KINDS[kind].ext}`);
  const frameRange = opts.range ? ([Math.max(0, Math.round(opts.range.from * fmt.fps)), Math.max(0, Math.min(composition.durationInFrames, Math.round(opts.range.to * fmt.fps)) - 1)] as [number, number]) : undefined;
  const codec = { mp4: "h264", hevc: "h265", prores: "prores", alpha: "prores", webm: "vp9", gif: "gif", wav: "wav", mp3: "mp3" } as const;
  await renderMedia({
    composition,
    serveUrl: url,
    codec: codec[kind],
    ...(kind === "mp4" || kind === "hevc" ? { crf: quality === "original" ? (kind === "hevc" ? 20 : 16) : undefined } : {}),
    ...(kind === "prores" ? { proResProfile: "hq" as const } : {}),
    ...(kind === "alpha" ? { proResProfile: "4444" as const, imageFormat: "png" as const, pixelFormat: "yuva444p10le" as const } : {}),
    // A GIF at most 480 wide and every other frame: small enough to send.
    ...(kind === "gif" ? { everyNthFrame: 2, scale: Math.min(1, 480 / fmt.width) } : { scale: opts.scale }),
    frameRange,
    outputLocation: out,
    inputProps,
    chromiumOptions,
    onProgress: ({ progress }) => opts.onProgress?.(progress * (opts.master === false ? 1 : 0.95)),
  });
  if (opts.master !== false && EXPORT_KINDS[kind].audio) await master(out, kind);
  // Rendered and mastered in the project first, so the place the person chose only ever gets the finished file.
  if (opts.saveAs) {
    try {
      renameSync(out, opts.saveAs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
      copyFileSync(out, opts.saveAs);
      rmSync(out, { force: true });
    }
    return opts.saveAs;
  }
  return out;
}

/**
 * Loudness for social: two passes of EBU R128 normalisation to -14 LUFS with true peaks held under -1 dBTP, the picture
 * copied untouched. A video without sound is left as it is.
 */
export async function master(file: string, kind: ExportKind = "mp4"): Promise<{ lufs: number; peak: number } | undefined> {
  const measure = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { maxBuffer: 1 << 24 }).catch(
    (err: { stderr?: string }) => ({ stderr: err.stderr ?? "" }),
  );
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(measure.stderr)?.[0];
  if (!json) return undefined;
  const m = JSON.parse(json) as Record<string, string>;
  if (!Number.isFinite(Number(m.input_i)) || Number(m.input_i) < -70) return undefined; // silent
  const tmp = file.replace(/(\.\w+)$/, ".mastering$1");
  const af =
    `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,` +
    "aresample=192000,alimiter=limit=0.84:attack=1:release=60:level=false,aresample=48000";
  // The picture as it was; the sound in what suits the container.
  const audio = { mp4: ["-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart"], hevc: ["-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart"], prores: ["-c:a", "pcm_s24le"], alpha: ["-c:a", "pcm_s24le"], webm: ["-c:a", "libopus", "-b:a", "192k"], gif: [], wav: ["-c:a", "pcm_s24le"], mp3: ["-c:a", "libmp3lame", "-b:a", "320k"] }[kind];
  await run("ffmpeg", ["-y", "-v", "error", "-i", file, ...(EXPORT_KINDS[kind].video ? ["-c:v", "copy"] : ["-vn"]), "-af", af, ...audio, tmp], { maxBuffer: 1 << 24 });
  renameSync(tmp, file);
  const after = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { maxBuffer: 1 << 24 }).catch((err: { stderr?: string }) => ({ stderr: err.stderr ?? "" }));
  const summary = after.stderr.slice(after.stderr.lastIndexOf("Summary"));
  return { lufs: Number(/I:\s*(-?[\d.]+)/.exec(summary)?.[1]), peak: Number(/Peak:\s*(-?[\d.]+)/.exec(summary)?.[1]) };
}

/** Several stills of a cut (or of `project`, a stand-in cut) in one go, as JPEG files in `dir`, in order. */
export async function renderStills(id: string, opts: { cut?: string; format?: string; times: number[]; scale?: number; dir: string; project?: Project }): Promise<string[]> {
  const { url, inputProps, composition } = await prepare(id, opts.cut, opts.format, "proxy", opts.project);
  const files: string[] = [];
  for (const [i, t] of opts.times.entries()) {
    const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(t * composition.fps)));
    const file = join(opts.dir, `still-${String(i).padStart(3, "0")}.jpg`);
    await renderStill({ composition, serveUrl: url, frame, output: file, inputProps, imageFormat: "jpeg", jpegQuality: 80, scale: opts.scale ?? 0.35, chromiumOptions });
    files.push(file);
  }
  return files;
}

/** A JPEG of the cut at time t, for the agent to look at its own work. */
export async function renderFrame(id: string, opts: { cut?: string; format?: string; t: number; scale?: number }): Promise<Buffer> {
  const { url, inputProps, composition } = await prepare(id, opts.cut, opts.format, "proxy");
  const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(opts.t * composition.fps)));
  const dir = join(tmpdir(), "beatsheet-stills");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}-${frame}-${Date.now()}.jpg`);
  await renderStill({ composition, serveUrl: url, frame, output: file, inputProps, imageFormat: "jpeg", jpegQuality: 80, scale: opts.scale ?? 0.4, chromiumOptions });
  const buf = readFileSync(file);
  rmSync(file, { force: true });
  return buf;
}

/** A full-size picture of the cut at time t (a thumbnail, a poster), from the original footage, as a PNG in out/. */
export async function renderPoster(id: string, opts: { cut?: string; format?: string; t: number; saveAs?: string }): Promise<string> {
  const { project, dir, fmt, url, inputProps, composition } = await prepare(id, opts.cut, opts.format, "original");
  const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(opts.t * composition.fps)));
  mkdirSync(join(dir, "out"), { recursive: true });
  const cutPart = project.cut.id === "main" ? "" : `-${project.cut.id}`;
  const out = opts.saveAs ?? join(dir, "out", `${project.id}${cutPart}-${fmt.id}-${(frame / composition.fps).toFixed(2).replace(".", "s")}.png`);
  await renderStill({ composition, serveUrl: url, frame, output: out, inputProps, imageFormat: "png", chromiumOptions });
  return out;
}

/**
 * The cut as a timeline file another editor opens, pointing at the original footage: OpenTimelineIO (.otio, for
 * DaVinci Resolve) or Final Cut Pro 7 XML (.xml, for Premiere Pro). Written to out/; returns its path.
 */
export async function timelineFile(id: string, opts: { cut?: string; format?: string; kind: "otio" | "xml" }): Promise<string> {
  const { project, dir } = loadProject(id, opts.cut);
  const { exportLanes, resolveTimeline, toOtio, toXmeml } = await import("@beatsheet/schema");
  const { originalPath, mediaPath } = await import("./paths.ts");
  const fmt = project.formats.find((f) => f.id === opts.format) ?? project.formats[0]!;
  const tl = resolveTimeline(project, fmt.id);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const fileOf = (assetId: string) => {
    const a = assets.get(assetId);
    if (!a || (a.kind !== "video" && a.kind !== "image" && a.kind !== "music" && a.kind !== "audio" && a.kind !== "voice")) return undefined;
    return { path: originalPath(project, dir, a), duration: a.duration, fps: a.fps, width: a.width, height: a.height, audio: a.kind !== "image" };
  };
  const lineFile = (path: string) => ({ path: mediaPath(project, dir, path), audio: true });
  const lanes = exportLanes(project, tl, fileOf, lineFile);
  const name = project.cut.id === "main" ? project.title : `${project.title} - ${project.cut.name}`;
  const text = opts.kind === "otio" ? toOtio(name, lanes, tl.duration, fmt.fps) : toXmeml(name, lanes, tl.duration, fmt);
  mkdirSync(join(dir, "out"), { recursive: true });
  const cutPart = project.cut.id === "main" ? "" : `-${project.cut.id}`;
  const out = join(dir, "out", `${project.id}${cutPart}-${fmt.id}.${opts.kind}`);
  writeFileSync(out, text);
  return out;
}
