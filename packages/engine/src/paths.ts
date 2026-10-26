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

export const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p);

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

export const assetPath = (project: HasSources, dir: string, a: Asset) => mediaPath(project, dir, a.path, a.source);

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
