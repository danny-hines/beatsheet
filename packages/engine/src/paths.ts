import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { Asset, Source } from "@beatsheet/schema";

export type Roots = {
  /** What ships with beatsheet and is only read: helper sources, workers, sounds, workflows, examples, its own code. Laid out like the repository. */
  resources: string;
  /** The person's beatsheet folder: their projects, and the instructions and recipes agents work from. Agents run in it. */
  workspace: string;
  /** beatsheet's scratch: its log, which agents are connected, sign-in scripts. */
  runtime: string;
  projects: string;
  examples: string;
};

/**
 * beatsheet's folders, from the environment. In a checkout they're all the repository (`checkout`, asked for only when
 * something isn't set); an installed app sets BEATSHEET_RESOURCES and BEATSHEET_WORKSPACE, because what it ships with
 * can't be written to and the person's projects can't live inside it.
 */
export function rootsFrom(env: Record<string, string | undefined>, checkout: () => string): Roots {
  const resources = env.BEATSHEET_RESOURCES || checkout();
  const workspace = env.BEATSHEET_WORKSPACE || checkout();
  return {
    resources,
    workspace,
    runtime: env.BEATSHEET_RUNTIME || join(workspace, ".beatsheet"),
    projects: env.BEATSHEET_PROJECTS || join(workspace, "projects"),
    examples: join(resources, "examples"),
  };
}

/** The same folders as a child process should be told them (the MCP server an agent starts may not inherit this environment). */
export const rootsEnv = (r: Roots): Record<string, string> => ({
  BEATSHEET_RESOURCES: r.resources,
  BEATSHEET_WORKSPACE: r.workspace,
  BEATSHEET_RUNTIME: r.runtime,
  BEATSHEET_PROJECTS: r.projects,
});

// The desktop app sets BEATSHEET_REPO: bundled into one file, this code can't tell where the repository is.
const roots = rootsFrom(process.env, () => process.env.BEATSHEET_REPO ?? resolve(import.meta.dirname, "..", "..", ".."));
export const RESOURCES = roots.resources;
export const WORKSPACE = roots.workspace;
export const RUNTIME = roots.runtime;
/** Real projects live outside git; examples ship with beatsheet. */
export const ROOTS = { projects: roots.projects, examples: roots.examples };
/**
 * What the desktop app built ahead, to run in place of the source: beatsheet's MCP server as one file (run on the app's
 * own runtime, so nobody needs Node installed), the video composition's bundle (so nothing is bundled when the first
 * frame is rendered), and a folder of programs it carries (the Swift helpers ready-made, so nobody needs Xcode's tools;
 * ffmpeg and ffprobe when the build includes them), which go ahead of the PATH. Only the app sets these, for the build
 * it is itself part of; from a terminal the source runs, so a build left over from before a change is never picked up.
 */
export const BUILT = { mcp: process.env.BEATSHEET_MCP || undefined, video: process.env.BEATSHEET_VIDEO || undefined, bin: process.env.BEATSHEET_BIN || undefined };
/** What a process beatsheet starts needs in its environment to use the same folders and the same built pieces. */
export const ROOTS_ENV: Record<string, string> = {
  ...rootsEnv(roots),
  ...(BUILT.mcp ? { BEATSHEET_MCP: BUILT.mcp } : {}),
  ...(BUILT.video ? { BEATSHEET_VIDEO: BUILT.video } : {}),
  ...(BUILT.bin ? { BEATSHEET_BIN: BUILT.bin } : {}),
  // beatsheet's own folder (settings, what it fetched), when it isn't the usual one.
  ...(process.env.BEATSHEET_HOME ? { BEATSHEET_HOME: process.env.BEATSHEET_HOME } : {}),
};

export const expandHome = (p: string) => (p === "~" || p.startsWith("~/") || (process.platform === "win32" && p.startsWith("~\\")) ? join(homedir(), p.slice(1)) : p);

/** Whether two resolved paths name the same file or folder (Windows doesn't mind the case). */
export const samePath = (a: string, b: string) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

/** A path inside the person's beatsheet folder as the folder's own, for showing (whichever slash it uses). */
export const inWorkspace = (p: string) => p.replace(`${WORKSPACE}/`, "").replace(`${WORKSPACE}\\`, "");

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
    /** A full-size JPEG of a photo browsers can't show (HEIC), for finished exports. */
    full: join(c, "full", `${assetId}.jpg`),
    poster: join(c, "poster", `${assetId}.jpg`),
    strip: join(c, "strip", `${assetId}.jpg`),
    frames: join(c, "frames", `${assetId}.jpg`),
    peaks: join(c, "peaks", `${assetId}.json`),
  };
}
