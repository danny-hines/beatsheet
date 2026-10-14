/**
 * Reading and writing project files. Every write is validated and versioned: a writer says which version it read,
 * and a write against a stale version is refused, so the studio and an agent editing the same project never silently
 * overwrite each other.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkReferences, parseProject, type CheckIssue, type Project } from "@beatsheet/schema";
import { projectDir, ROOTS } from "./paths.ts";

export type ProjectSummary = { id: string; title: string; recipe: string; where: "projects" | "examples" };
export type Loaded = { id: string; dir: string; file: string; project: Project; version: string };

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
const serialize = (p: Project) => JSON.stringify(p, null, 2) + "\n";

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
        out.push({ id: d.name, title: p.title ?? d.name, recipe: p.recipe ?? "", where });
      } catch {
        out.push({ id: d.name, title: `${d.name} (unreadable)`, recipe: "", where });
      }
    }
  }
  return out;
}

export function readRaw(id: string): { json: unknown; version: string; file: string; dir: string } {
  const dir = projectDir(id);
  const file = join(dir, "project.json");
  const text = readFileSync(file, "utf8");
  return { json: JSON.parse(text), version: versionOf(text), file, dir };
}

export function loadProject(id: string): Loaded {
  const raw = readRaw(id);
  const parsed = parseProject(raw.json);
  if (!parsed.ok) throw new InvalidProjectError(parsed.issues);
  return { id, dir: raw.dir, file: raw.file, project: parsed.project, version: raw.version };
}

export function currentVersion(id: string): string {
  return versionOf(readFileSync(join(projectDir(id), "project.json"), "utf8"));
}

/** Validates and writes a project. With `baseVersion`, refuses if the file changed since that version was read. */
export function saveProject(id: string, input: unknown, baseVersion?: string): { version: string; project: Project } {
  const parsed = parseProject(input);
  if (!parsed.ok) throw new InvalidProjectError(parsed.issues);
  const refs = checkReferences(parsed.project);
  if (refs.length) throw new InvalidProjectError(refs);
  const dir = projectDir(id);
  const file = join(dir, "project.json");
  if (baseVersion) {
    const now = currentVersion(id);
    if (now !== baseVersion) throw new ConflictError(now);
  }
  const text = serialize(parsed.project);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
  return { version: versionOf(text), project: parsed.project };
}

/** Creates a new project folder under projects/. */
export function createProject(id: string, project: Project): Loaded {
  const dir = join(ROOTS.projects, id);
  if (existsSync(join(dir, "project.json"))) throw new Error(`Project "${id}" already exists`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.json"), serialize(project));
  return loadProject(id);
}

/** Read, change, validate, write; retries once if someone else wrote in between. */
export function updateProject(id: string, change: (draft: Project) => void): { version: string; project: Project } {
  for (let attempt = 0; ; attempt++) {
    const { project, version } = loadProject(id);
    const draft = structuredClone(project);
    change(draft);
    try {
      return saveProject(id, draft, version);
    } catch (err) {
      if (!(err instanceof ConflictError) || attempt > 0) throw err;
    }
  }
}
