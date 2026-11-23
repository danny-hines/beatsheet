/**
 * An installed beatsheet's workspace: the person's own folder, where their projects live and agents run. Agents find
 * their instructions (CLAUDE.md, AGENTS.md), the recipes (.agents/skills, .claude/skills) and beatsheet's tools
 * (.mcp.json) in the folder they work in, and the instructions point at files to read (the project format, the kit),
 * so beatsheet puts copies of all of it there when it starts and brings them up to date when they change.
 *
 * In a checkout the repository is the workspace already, and nothing here runs.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { MCP_COMMAND } from "./agent/cli.ts";
import { RESOURCES, ROOTS, samePath, WORKSPACE } from "./paths.ts";

/** A file beatsheet keeps in the workspace: where (with forward slashes, from the workspace) and what. */
export type SeedFile = { path: string; data: Buffer };

/** What the instructions and recipes tell agents to read, beyond themselves: files, or folders taken whole. */
export const REFERENCE = ["docs/MODELS.md", "packages/schema/src", "packages/video/src"];

const CHECKOUT_ONLY = /<!-- checkout -->[\s\S]*?<!-- \/checkout -->[ \t]*\n?/g;

const INSTALLED = [
  "This is the person's beatsheet folder: their projects are in `projects/`. beatsheet itself is an installed app, so its",
  "own code isn't here. Paths under `packages/engine` name that code, and what they describe is reached through the",
  "`beatsheet` tools. `packages/schema/src` (the project format), `packages/video/src` (the kit and the scene runtime),",
  "`docs/` and the recipes are copies to read: beatsheet rewrites them when it starts, so don't change them, and there's",
  "nothing to run with `npm` or `node` here.",
].join("\n");

/**
 * The instructions as an installed workspace gets them: without what's only true in a checkout (marked
 * `<!-- checkout -->…<!-- /checkout -->` in CLAUDE.md: running the checks, the CLI, working on beatsheet's own code),
 * and saying under the title what kind of folder this is.
 */
export function installedInstructions(text: string): string {
  const kept = text.replace(CHECKOUT_ONLY, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  const title = /^# .*\n/.exec(kept);
  return title ? `${title[0]}\n${INSTALLED}\n${kept.slice(title[0].length)}` : `${INSTALLED}\n\n${kept}`;
}

/** Every file under `dir`, as paths from it with forward slashes. Links and dot-files (.DS_Store) are left out. */
function filesUnder(dir: string, base = ""): string[] {
  return readdirSync(join(dir, base), { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? filesUnder(dir, `${base}${e.name}/`) : e.isFile() ? [`${base}${e.name}`] : []));
}

/**
 * What an installed workspace holds, from what beatsheet ships with: the instructions under both names agents look
 * for, the recipes in both places, the files they point at, and beatsheet's tools as a command with its folders.
 * Real copies throughout, so nothing depends on links (Windows makes them only in Developer Mode).
 */
export function seedFiles(resources: string, mcp: { command: string; args: string[]; env: Record<string, string> }): SeedFile[] {
  const read = (path: string) => readFileSync(join(resources, ...path.split("/")));
  const instructions = Buffer.from(installedInstructions(read("CLAUDE.md").toString("utf8")));
  const recipes = filesUnder(join(resources, ".agents", "skills")).map((f) => ({ f, data: read(`.agents/skills/${f}`) }));
  const reference = REFERENCE.flatMap((p) => (statSync(join(resources, ...p.split("/"))).isDirectory() ? filesUnder(join(resources, ...p.split("/"))).map((f) => `${p}/${f}`) : [p]));
  return [
    { path: "CLAUDE.md", data: instructions },
    { path: "AGENTS.md", data: instructions },
    ...recipes.flatMap(({ f, data }) => [
      { path: `.agents/skills/${f}`, data },
      { path: `.claude/skills/${f}`, data },
    ]),
    ...reference.map((path) => ({ path, data: read(path) })),
    { path: ".mcp.json", data: Buffer.from(`${JSON.stringify({ mcpServers: { beatsheet: mcp } }, null, 2)}\n`) },
  ];
}

export type Seeded = { wrote: string[]; kept: string[]; removed: string[] };

const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/**
 * Brings the workspace's copies up to date. It remembers what it wrote (.beatsheet/seeded.json), so it can tell its
 * own files from the person's: a file they changed (or one of theirs with the same name) is put aside in
 * .beatsheet/kept/<when>/ before it's replaced, and a file beatsheet no longer ships is removed only if it's still as
 * beatsheet wrote it. Nothing is written when everything is already current.
 */
export function seedWorkspace(workspace: string, files: SeedFile[], now = new Date()): Seeded {
  const at = (path: string) => join(workspace, ...path.split("/"));
  const record = at(".beatsheet/seeded.json");
  let before: Record<string, string> = {};
  try {
    before = (JSON.parse(readFileSync(record, "utf8")) as { files?: Record<string, string> }).files ?? {};
  } catch {
    // first time here, or the record is unreadable: every file already there counts as the person's
  }
  const kept = join(workspace, ".beatsheet", "kept", now.toISOString().replace(/[:.]/g, "-"));
  const out: Seeded = { wrote: [], kept: [], removed: [] };
  const after: Record<string, string> = {};
  for (const f of files) {
    const hash = (after[f.path] = sha(f.data));
    const target = at(f.path);
    const current = existsSync(target) ? readFileSync(target) : undefined;
    if (current && sha(current) === hash) continue;
    if (current && sha(current) !== before[f.path]) {
      const aside = join(kept, ...f.path.split("/"));
      mkdirSync(dirname(aside), { recursive: true });
      writeFileSync(aside, current);
      out.kept.push(f.path);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, f.data);
    out.wrote.push(f.path);
  }
  for (const [path, hash] of Object.entries(before)) {
    if (path in after || isAbsolute(path) || path.split("/").includes("..")) continue;
    const target = at(path);
    if (!existsSync(target) || sha(readFileSync(target)) !== hash) continue;
    rmSync(target);
    out.removed.push(path);
  }
  if (!existsSync(record) || JSON.stringify(Object.entries(before).sort()) !== JSON.stringify(Object.entries(after).sort())) {
    mkdirSync(dirname(record), { recursive: true });
    writeFileSync(record, `${JSON.stringify({ files: after }, null, 1)}\n`);
  }
  return out;
}

/**
 * Makes the workspace ready for agents as the app starts. A problem (a folder that can't be written, say) is reported
 * and the app carries on: the projects still open, and the agent panel will say what it's missing.
 */
export function prepareWorkspace(): Seeded | undefined {
  if (samePath(RESOURCES, WORKSPACE)) return undefined;
  try {
    mkdirSync(ROOTS.projects, { recursive: true });
    const seeded = seedWorkspace(WORKSPACE, seedFiles(RESOURCES, MCP_COMMAND));
    if (seeded.wrote.length || seeded.removed.length) {
      const moved = seeded.kept.length ? ` (${seeded.kept.length} changed by hand, kept in .beatsheet/kept)` : "";
      console.log(`beatsheet: workspace at ${WORKSPACE}: ${seeded.wrote.length} files written${moved}${seeded.removed.length ? `, ${seeded.removed.length} removed` : ""}`);
    }
    return seeded;
  } catch (err) {
    console.error(`beatsheet: couldn't set up the workspace at ${WORKSPACE}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}
