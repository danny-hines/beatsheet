import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { Asset, Project } from "@beatsheet/schema";

export const REPO = resolve(import.meta.dirname, "..", "..", "..");
/** Real projects live outside git; examples ship with the repo. */
export const ROOTS = {
  projects: process.env.BEATSHEET_PROJECTS ?? join(REPO, "projects"),
  examples: join(REPO, "examples"),
};

export const expandHome = (p: string) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p);

export const isProjectId = (id: string) => /^[a-z0-9][a-z0-9-]*$/i.test(id);

/** The folder holding a project's project.json: projects/ first, then examples/. */
export function projectDir(id: string): string {
  if (!isProjectId(id)) throw new Error(`Invalid project id "${id}"`);
  for (const root of [ROOTS.projects, ROOTS.examples]) {
    const dir = join(root, id);
    if (existsSync(join(dir, "project.json"))) return dir;
  }
  throw new Error(`No project "${id}"`);
}

export const cacheDir = (id: string) => join(projectDir(id), ".cache");

/** Absolute path of a file named in a project: absolute and ~ paths as they are, others under mediaRoot. */
export function mediaPath(project: Project, dir: string, path: string): string {
  const p = expandHome(path);
  if (isAbsolute(p)) return p;
  const root = expandHome(project.mediaRoot ?? ".");
  return resolve(dir, root, p);
}

export const assetPath = (project: Project, dir: string, a: Asset) => mediaPath(project, dir, a.path);

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
