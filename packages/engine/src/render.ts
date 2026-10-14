/** Exports and stills, through Remotion. The composition bundle is built once per process and reused. */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { MediaQuality, VideoProps } from "@beatsheet/video";
import { startServer } from "./http.ts";
import { REPO } from "./paths.ts";
import { loadProject } from "./store.ts";

let serveUrl: Promise<string> | undefined;
const getBundle = () => (serveUrl ??= bundle({ entryPoint: join(REPO, "packages", "video", "src", "root.tsx") }));

async function prepare(id: string, format: string | undefined, quality: MediaQuality) {
  const { project, dir } = loadProject(id);
  const fmt = project.formats.find((f) => f.id === format) ?? project.formats[0]!;
  const [url, origin] = await Promise.all([getBundle(), startServer()]);
  const inputProps: VideoProps = { project, format: fmt.id, mediaBase: `${origin}/media/${id}`, quality };
  const composition = await selectComposition({ serveUrl: url, id: "beatsheet", inputProps });
  return { project, dir, fmt, url, inputProps, composition };
}

export async function renderProject(
  id: string,
  opts: { format?: string; quality?: MediaQuality; onProgress?: (p: number) => void } = {},
): Promise<string> {
  const quality = opts.quality ?? "original";
  const { project, dir, fmt, url, inputProps, composition } = await prepare(id, opts.format, quality);
  mkdirSync(join(dir, "out"), { recursive: true });
  const out = join(dir, "out", `${project.id}-${fmt.id}${quality === "proxy" ? "-draft" : ""}.mp4`);
  await renderMedia({
    composition,
    serveUrl: url,
    codec: "h264",
    outputLocation: out,
    inputProps,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });
  return out;
}

/** A JPEG of the cut at time t, for the agent to look at its own work. */
export async function renderFrame(id: string, opts: { format?: string; t: number; scale?: number }): Promise<Buffer> {
  const { url, inputProps, composition } = await prepare(id, opts.format, "proxy");
  const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(opts.t * composition.fps)));
  const dir = join(tmpdir(), "beatsheet-stills");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}-${frame}-${Date.now()}.jpg`);
  await renderStill({ composition, serveUrl: url, frame, output: file, inputProps, imageFormat: "jpeg", jpegQuality: 80, scale: opts.scale ?? 0.4 });
  const buf = readFileSync(file);
  rmSync(file, { force: true });
  return buf;
}
