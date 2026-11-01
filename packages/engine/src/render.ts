/**
 * Exports and stills, through Remotion. The composition bundle is built once per process and reused. Scenes can use
 * WebGL (three.js), so Chrome renders with a GPU-backed context; finished exports are mastered for social loudness.
 */
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { Project } from "@beatsheet/schema";
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
async function prepare(id: string, cut: string | undefined, format: string | undefined, quality: MediaQuality, override?: Project) {
  const loaded = loadProject(id, cut);
  const project = override ?? loaded.project;
  const dir = loaded.dir;
  const fmt = project.formats.find((f) => f.id === format) ?? project.formats[0]!;
  const [url, origin] = await Promise.all([getBundle(), startServer()]);
  const inputProps: VideoProps = { project, format: fmt.id, mediaBase: `${origin}/media/${id}`, quality, words: wordsInCut(id, project) };
  const composition = await selectComposition({ serveUrl: url, id: "beatsheet", inputProps, chromiumOptions });
  return { project, dir, fmt, url, inputProps, composition };
}

export async function renderProject(
  id: string,
  opts: { cut?: string; format?: string; quality?: MediaQuality; onProgress?: (p: number) => void; out?: string; scale?: number; master?: boolean; saveAs?: string } = {},
): Promise<string> {
  const quality = opts.quality ?? "original";
  const { project, dir, fmt, url, inputProps, composition } = await prepare(id, opts.cut, opts.format, quality);
  mkdirSync(join(dir, "out"), { recursive: true });
  // Each cut renders to its own file; the first cut keeps the plain name.
  const cutPart = project.cut.id === "main" ? "" : `-${project.cut.id}`;
  const out = opts.out ?? join(dir, "out", `${project.id}${cutPart}-${fmt.id}${quality === "proxy" ? "-draft" : ""}.mp4`);
  await renderMedia({
    composition,
    serveUrl: url,
    codec: "h264",
    crf: quality === "original" ? 16 : undefined,
    outputLocation: out,
    inputProps,
    chromiumOptions,
    scale: opts.scale,
    onProgress: ({ progress }) => opts.onProgress?.(progress * (opts.master === false ? 1 : 0.95)),
  });
  if (opts.master !== false) await master(out);
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
export async function master(file: string): Promise<{ lufs: number; peak: number } | undefined> {
  const measure = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { maxBuffer: 1 << 24 }).catch(
    (err: { stderr?: string }) => ({ stderr: err.stderr ?? "" }),
  );
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(measure.stderr)?.[0];
  if (!json) return undefined;
  const m = JSON.parse(json) as Record<string, string>;
  if (!Number.isFinite(Number(m.input_i)) || Number(m.input_i) < -70) return undefined; // silent
  const tmp = file.replace(/\.mp4$/, ".mastering.mp4");
  const af =
    `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,` +
    "aresample=192000,alimiter=limit=0.84:attack=1:release=60:level=false,aresample=48000";
  await run("ffmpeg", ["-y", "-v", "error", "-i", file, "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", tmp], { maxBuffer: 1 << 24 });
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
