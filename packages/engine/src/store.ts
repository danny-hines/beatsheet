/**
 * Reading and writing project files. Every write is validated and versioned: a writer says which version it read,
 * and a write against a stale version is refused, so the studio and an agent editing the same project never silently
 * overwrite each other.
 *
 * Most code works on one cut at a time (a `Project` is a cut with the shared material); `saveProject` writes that cut
 * back into the file. Files from before cuts are upgraded when read and written in the new shape, with the original
 * kept beside it as project.v1.json.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { recycleCommand, run as runLaunch } from "./platform.ts";
import { promisify } from "node:util";
import { checkReferences, cutView, parseFile, SCHEMA_V1, withCut, type CheckIssue, type Project, type ProjectFile, type Source, type Turn } from "@beatsheet/schema";
import { expandHome, mediaPath, projectDir, ROOTS } from "./paths.ts";

export type ProjectSummary = {
  id: string;
  title: string;
  recipe: string;
  where: "projects" | "examples";
  cuts: number;
  /** When the project file last changed. */
  edited?: string;
  /** Footage brought in (not cut-outs or anything generated). */
  videos?: number;
  photos?: number;
  /** A few pictures of what it is: from the first cut's shots, else the best-rated footage. `color` stands in without a thumbnail. */
  posters?: { asset: string; color?: string }[];
  /** Whose move it is, and what the agent asked for. */
  turn?: Pick<Turn, "who" | "since" | "ask">;
};
/** A project as read: the whole file (`doc`) and one cut's view of it (`project`). */
export type Loaded = { id: string; dir: string; file: string; doc: ProjectFile; project: Project; version: string };

export class InvalidProjectError extends Error {
  issues: CheckIssue[];
  constructor(issues: CheckIssue[]) {
    super(`Project is invalid: ${issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join("; ")}`);
    this.issues = issues;
  }
}
export class ConflictError extends Error {
  current: string;
  constructor(current: string) {
    super("The project changed since it was read; reload and try again");
    this.current = current;
  }
}

const versionOf = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 12);
const serialize = (doc: ProjectFile) => JSON.stringify(doc, null, 2) + "\n";

export function listProjects(): ProjectSummary[] {
  const out: ProjectSummary[] = [];
  for (const where of ["projects", "examples"] as const) {
    const root = ROOTS[where];
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root, { withFileTypes: true })) {
      const file = join(root, d.name, "project.json");
      if (!d.isDirectory() || !existsSync(file) || out.some((p) => p.id === d.name)) continue;
      try {
        const p = JSON.parse(readFileSync(file, "utf8"));
        const footage = ((p.assets ?? []) as RawAsset[]).filter(isFootage);
        out.push({
          id: d.name,
          title: p.title ?? d.name,
          recipe: p.cuts?.[0]?.recipe ?? p.recipe ?? "",
          where,
          cuts: p.cuts?.length ?? 1,
          edited: statSync(file).mtime.toISOString(),
          videos: footage.filter((a) => a.kind === "video").length,
          photos: footage.filter((a) => a.kind === "image").length,
          posters: postersOf(p),
          turn: p.turn ? { who: p.turn.who, since: p.turn.since, ask: p.turn.ask } : undefined,
        });
      } catch {
        out.push({ id: d.name, title: `${d.name} (unreadable)`, recipe: "", where, cuts: 0 });
      }
    }
  }
  return out;
}

type RawAsset = { id: string; kind: string; path?: string; source?: string; rating?: number; color?: string; cutout?: unknown; provenance?: { source: string } };
/** Footage: brought in from a folder or recorded in beatsheet, as opposed to cut out or made for the project. */
const isFootage = (a: RawAsset) => !a.cutout && (!a.provenance || ["import", "capture", "recorded"].includes(a.provenance.source));
/** Recorded in beatsheet (screen, camera, microphone); kept in the project's own recordings/ folder. */
const isRecording = (a: RawAsset) => a.provenance?.source === "recorded";

/** Up to three pictures spread across the first cut (the file may be from before cuts), topped up with the best-rated footage. */
function postersOf(p: { assets?: RawAsset[]; shots?: { content?: { asset?: string } }[]; cuts?: { shots?: { content?: { asset?: string } }[] }[] }) {
  const pictures = new Map((p.assets ?? []).filter((a) => (a.kind === "video" || a.kind === "image") && !a.cutout && (a.rating ?? 0) >= 0).map((a) => [a.id, a]));
  const used = [...new Set((p.cuts?.[0]?.shots ?? p.shots ?? []).flatMap((s) => (s.content?.asset && pictures.has(s.content.asset) ? [s.content.asset] : [])))];
  const picked = used.length <= 3 ? used : [0, 0.5, 1].map((f) => used[Math.round(f * (used.length - 1))]!);
  for (const a of [...pictures.values()].sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0))) {
    if (picked.length >= 3) break;
    if (!picked.includes(a.id)) picked.push(a.id);
  }
  return picked.map((id) => ({ asset: id, color: pictures.get(id)?.color }));
}

export function readRaw(id: string): { json: unknown; version: string; file: string; dir: string } {
  const dir = projectDir(id);
  const file = join(dir, "project.json");
  const text = readFileSync(file, "utf8");
  return { json: JSON.parse(text), version: versionOf(text), file, dir };
}

/** The whole project file, upgraded if it's from before cuts. */
export function loadFile(id: string): Omit<Loaded, "project"> {
  const raw = readRaw(id);
  const parsed = parseFile(raw.json);
  if (!parsed.ok) throw new InvalidProjectError(parsed.issues);
  return { id, dir: raw.dir, file: raw.file, doc: parsed.file, version: raw.version };
}

/** A project seen through one cut; the first cut unless `cut` names another. */
export function loadProject(id: string, cut?: string): Loaded {
  const loaded = loadFile(id);
  return { ...loaded, project: cutView(loaded.doc, cut) };
}

export function currentVersion(id: string): string {
  return versionOf(readFileSync(join(projectDir(id), "project.json"), "utf8"));
}

/** Validates and writes a whole project file. With `baseVersion`, refuses if the file changed since that version was read. */
export function saveFile(id: string, input: unknown, baseVersion?: string): { version: string; doc: ProjectFile } {
  const parsed = parseFile(input);
  if (!parsed.ok) throw new InvalidProjectError(parsed.issues);
  const refs = checkReferences(parsed.file);
  if (refs.length) throw new InvalidProjectError(refs);
  const dir = projectDir(id);
  const file = join(dir, "project.json");
  if (baseVersion) {
    const now = currentVersion(id);
    if (now !== baseVersion) throw new ConflictError(now);
  }
  // The first time a file from before cuts is rewritten, keep the original.
  const backup = join(dir, "project.v1.json");
  if (existsSync(file) && !existsSync(backup) && (JSON.parse(readFileSync(file, "utf8")) as { schema?: string }).schema === SCHEMA_V1) copyFileSync(file, backup);
  const text = serialize(parsed.file);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  return { version: versionOf(text), doc: parsed.file };
}

/** Writes one cut's view back into the project file (the cut it names, plus the shared material). */
export function saveProject(id: string, view: Project, baseVersion?: string): { version: string; project: Project } {
  const { doc, version } = loadFile(id);
  if (baseVersion && baseVersion !== version) throw new ConflictError(version);
  const saved = saveFile(id, withCut(doc, view), version);
  return { version: saved.version, project: cutView(saved.doc, view.cut.id) };
}

/** Creates a new project folder under projects/. */
export function createProject(id: string, doc: ProjectFile): Loaded {
  const dir = join(ROOTS.projects, id);
  if (existsSync(join(dir, "project.json"))) throw new Error(`Project "${id}" already exists`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.json"), serialize(doc));
  return loadProject(id);
}

/** Read, change, validate, write one cut (the first unless named); retries once if someone else wrote in between. */
export function updateProject(id: string, change: (draft: Project) => void, cut?: string): { version: string; project: Project } {
  for (let attempt = 0; ; attempt++) {
    const { project, version } = loadProject(id, cut);
    const draft = structuredClone(project);
    change(draft);
    try {
      return saveProject(id, draft, version);
    } catch (err) {
      if (!(err instanceof ConflictError) || attempt > 0) throw err;
    }
  }
}

/** Read, change, validate, write the whole file (adding or removing cuts, say); retries once on a conflict. */
export function updateFile(id: string, change: (draft: ProjectFile) => void): { version: string; doc: ProjectFile } {
  for (let attempt = 0; ; attempt++) {
    const { doc, version } = loadFile(id);
    const draft = structuredClone(doc);
    change(draft);
    try {
      return saveFile(id, draft, version);
    } catch (err) {
      if (!(err instanceof ConflictError) || attempt > 0) throw err;
    }
  }
}

/**
 * What moving a project to the Trash takes and what it leaves. Its folder goes: the project file, previews, songs,
 * renders, turn snapshots and anything made for it (`made` counts those). The footage folders it points at (`keeps`)
 * aren't touched. `blocked` says why it can't go: it's an example, or some footage lives inside the project folder.
 */
export type TrashPlan = { folder: string; bytes: number; keeps: string[]; made: number; recordings: number; blocked?: string };

export function trashPlan(id: string): TrashPlan {
  const dir = projectDir(id);
  if (dir === join(ROOTS.examples, id)) return { folder: dir, bytes: 0, keeps: [], made: 0, recordings: 0, blocked: "Examples come with beatsheet, so they can't be deleted." };
  const raw = readRaw(id).json as { sources?: Source[]; mediaRoot?: unknown; assets?: RawAsset[] };
  // Files from before cuts name one footage folder, as the upgrade reads them.
  const sources = raw.sources ?? (typeof raw.mediaRoot === "string" ? [{ id: "footage", path: raw.mediaRoot }] : []);
  const inside = (p: string) => p === dir || p.startsWith(dir + sep);
  const where = (a: RawAsset) => (a.path ? mediaPath({ sources }, dir, a.path, a.source) : "");
  const assets = raw.assets ?? [];
  // Songs are copied into music/ when they're added; the originals stay where they were.
  const copy = (p: string) => p.startsWith(join(dir, "music") + sep);
  const stuck = assets.filter((a) => isFootage(a) && !isRecording(a) && inside(where(a)) && !copy(where(a))).length;
  return {
    folder: dir,
    bytes: sizeOf(dir),
    keeps: [...new Set(sources.map((s) => resolve(dir, expandHome(s.path))))].filter((k) => !inside(k)),
    made: assets.filter((a) => !isFootage(a) && inside(where(a))).length,
    recordings: assets.filter((a) => isRecording(a) && inside(where(a))).length,
    blocked: stuck
      ? `${stuck === 1 ? "One footage file is" : `${stuck} footage files are`} inside the project folder and would go to the Trash with it. Move ${stuck === 1 ? "it" : "them"} somewhere else first.`
      : undefined,
  };
}

/** Bytes in a folder, not following links. */
function sizeOf(path: string): number {
  const s = lstatSync(path);
  return s.isDirectory() ? readdirSync(path).reduce((n, f) => n + sizeOf(join(path, f)), 0) : s.size;
}

const run = promisify(execFile);

/**
 * Moves a project's folder to the Trash, where Finder can put it back (on Windows, the Recycle Bin, where Restore does).
 * Refuses whatever `trashPlan` blocks.
 */
export async function trashProject(id: string): Promise<void> {
  const plan = trashPlan(id);
  if (plan.blocked) throw new Error(plan.blocked);
  if (process.platform === "win32") {
    const r = await runLaunch(recycleCommand(plan.folder), { timeout: 120_000 });
    if (r.code !== 0) throw new Error(`Couldn't move it to the Recycle Bin: ${r.err.trim().split("\n")[0] || `exit ${r.code}`}`);
    return;
  }
  // macOS 15's trash does what dragging to the Trash does, so Put Back works.
  if (!existsSync("/usr/bin/trash")) throw new Error("Moving to the Trash needs macOS 15 or later. Drag the project's folder to the Trash in Finder instead.");
  try {
    await run("/usr/bin/trash", ["-s", plan.folder]);
  } catch (err) {
    const why = /Code=\d+ "([^"]+)"/.exec(String((err as { stderr?: string }).stderr ?? ""))?.[1];
    throw new Error(`Couldn't move it to the Trash${why ? `: ${why}` : ""}`);
  }
}
