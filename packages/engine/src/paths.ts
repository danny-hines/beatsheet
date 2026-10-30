import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { Asset, Source } from "@beatsheet/schema";

/** The beatsheet folder: projects, examples, recipes and the MCP server live under it. The Mac app sets it explicitly. */
export const REPO = process.env.BEATSHEET_REPO ?? resolve(import.meta.dirname, "..", "..", "..");
/** Real projects live outside git; examples ship with the repo. */
export const ROOTS = {
  projects: process.env.BEATSHEET_PROJECTS ?? join(REPO, "projects"),
  examples: join(REPO, "examples"),
};

export const expandHome = (p: string) => (p === "~" || p.startsWith("~/") || (process.platform === "win32" && p.startsWith("~\\")) ? join(homedir(), p.slice(1)) : p);

/** Whether two resolved paths name the same file or folder (Windows doesn't mind the case). */
export const samePath = (a: string, b: string) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

/** A path inside the beatsheet folder as the folder's own, for showing (whichever slash it uses). */
export const inRepo = (p: string) => p.replace(`${REPO}/`, "").replace(`${REPO}\\`, "");

export const isProjectId = (id: string) => /^[a-z0-9][a-z0-9-]*$/i.test(id);

export class NoProjectError extends Error {}

/** The folder holding a project's project.json: projects/ first, then examples/. */
export function projectDir(id: string): string {
  if (!isProjectId(id)) throw new Error(`Invalid project id "${id}"`);
  for (const root of [ROOTS.projects, ROOTS.examples]) {
    const dir = join(root, id);
    if (existsSync(join(dir, "project.json"))) return dir;
  }
  throw new NoProjectError(`No project "${id}"`);
}

export const cacheDir = (id: string) => join(projectDir(id), ".cache");

type HasSources = { sources: Source[] };

/** The folder a source's files live in; the project folder when the project has no sources. */
export function sourceRoot(project: HasSources, dir: string, source?: string): string {
  const s = project.sources.find((x) => x.id === source) ?? project.sources[0];
  return s ? resolve(dir, expandHome(s.path)) : dir;
}

/** Absolute path of a file named in a project: absolute and ~ paths as they are, others under their source folder. */
export function mediaPath(project: HasSources, dir: string, path: string, source?: string): string {
  const p = expandHome(path);
  return isAbsolute(p) ? p : resolve(sourceRoot(project, dir, source), p);
}

/** Where beatsheet keeps the playable copy of old video (deinterlaced, square pixels, H.264). */
export const playablePath = (dir: string, assetId: string) => join(dir, "media", `${assetId}.mp4`);

/** The file to read for an asset: its playable copy once there is one (old video), else the file itself. */
export const assetPath = (project: HasSources, dir: string, a: Asset) => {
  const copy = a.playable ? playablePath(dir, a.id) : undefined;
  return copy && existsSync(copy) ? copy : mediaPath(project, dir, a.path, a.source);
};

/**
 * An asset's sound with everything but the voices taken out, at full strength, by what cleaned it (48 kHz mono WAV):
 * the slow or paid part, kept so changing how much of it is used doesn't clean it again.
 */
export const voicesPath = (dir: string, assetId: string, by: string) => join(dir, "media", `${assetId}.voices-${by}.wav`);

/** The sound an asset's clips play once it's cleaned: the voices mixed back with the original, as asked. */
export const cleanPath = (dir: string, a: Asset) => (a.cleaned ? join(dir, "media", `${a.id}.clean-${Date.parse(a.cleaned.at).toString(36)}.m4a`) : undefined);

/** The file itself, never a copy: where it came from. */
export const originalPath = (project: HasSources, dir: string, a: Asset) => mediaPath(project, dir, a.path, a.source);

/** Derived files for an asset, all under the project's .cache folder. */
export function cachePaths(dir: string, assetId: string) {
  const c = join(dir, ".cache");
  return {
    proxy: join(c, "proxy", `${assetId}.mp4`),
    image: join(c, "image", `${assetId}.jpg`),
    poster: join(c, "poster", `${assetId}.jpg`),
    strip: join(c, "strip", `${assetId}.jpg`),
  };
}
