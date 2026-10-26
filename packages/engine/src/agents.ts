/**
 * Agent sessions with beatsheet's tools loaded, wherever they run, and handing over a batch of notes. (The session the
 * studio hosts itself is in agent/.)
 *
 * Presence comes from the MCP server itself: every agent that loads beatsheet's tools (hosted by the studio or started
 * by hand in a terminal) writes a small file under .beatsheet/agents while it's alive.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { REPO } from "./paths.ts";
import { loadFile } from "./store.ts";


export const RUNTIME = join(REPO, ".beatsheet");
export const AGENTS_DIR = join(RUNTIME, "agents");
const SESSIONS_DIR = join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "muse", "sessions");

export type AgentKind = "muse" | "codex" | "claude" | "other";
export type Presence = {
  pid: number;
  kind: AgentKind;
  /** The MCP client's own name and version. */
  client: string;
  version?: string;
  startedAt: string;
  /** The Muse session id (Muse passes it to MCP servers). */
  museSession?: string;
  /** Started by the session the studio hosts, which the studio already shows. */
  hosted?: boolean;
  /** Model the session runs on, read from Muse's session log (Muse doesn't pass other environment through). */
  model?: string;
  activity?: { tool: string; project?: string; at: string };
};

/** What the MCP server knows about the session that started it. */
export function presenceFromEnv(client: { name?: string; version?: string } | undefined): Omit<Presence, "pid" | "startedAt"> {
  const museSession = process.env.MUSE_SESSION_ID ?? process.env.MUSE_THREAD_ID;
  const name = client?.name ?? "";
  const kind: AgentKind = museSession || /muse|^tbh$/i.test(name) ? "muse" : /codex/i.test(name) ? "codex" : /claude/i.test(name) ? "claude" : "other";
  return { kind, client: name || "unknown", version: client?.version, museSession, hosted: process.env.BEATSHEET_HOSTED === "1" || undefined };
}

export function writePresence(p: Presence) {
  mkdirSync(AGENTS_DIR, { recursive: true });
  const file = join(AGENTS_DIR, `${p.pid}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(p));
  renameSync(`${file}.tmp`, file);
}

export function removePresence(pid: number) {
  rmSync(join(AGENTS_DIR, `${pid}.json`), { force: true });
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** Connected sessions, newest activity first. Forgets sessions whose process has gone. */
export function listAgents(): Presence[] {
  if (!existsSync(AGENTS_DIR)) return [];
  const out: Presence[] = [];
  for (const f of readdirSync(AGENTS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const p = JSON.parse(readFileSync(join(AGENTS_DIR, f), "utf8")) as Presence;
      if (p.museSession) p.model ??= sessionModel(p.museSession);
      if (alive(p.pid)) out.push(p);
      else rmSync(join(AGENTS_DIR, f), { force: true });
    } catch {
      // half-written; the next read will see it
    }
  }
  const last = (p: Presence) => p.activity?.at ?? p.startedAt;
  return out.sort((a, b) => last(b).localeCompare(last(a)));
}


/**
 * The first message the studio sends a new session; resume lists only sessions that started this way. A session is
 * about one cut of the project (sessions from before cuts had their own name none, and belong to the whole project).
 */
export const OPENING = /^We're working (?:on the beatsheet project "(.+?)" \(id ([\w-]+)\)(?:, on its cut "(.*?)" \(cut ([\w-]+)\))?|in beatsheet)/;

/** Where a session's log lives: sessions/YYYY/MM/DD/<id>/session.jsonl. */
function sessionFile(id: string): string | undefined {
  if (!existsSync(SESSIONS_DIR)) return undefined;
  const desc = (p: string) => (existsSync(p) ? readdirSync(p).filter((d) => /^\d+$/.test(d)).sort().reverse() : []);
  let looked = 0;
  for (const y of desc(SESSIONS_DIR))
    for (const m of desc(join(SESSIONS_DIR, y)))
      for (const d of desc(join(SESSIONS_DIR, y, m))) {
        const f = join(SESSIONS_DIR, y, m, d, id, "session.jsonl");
        if (existsSync(f)) return f;
        if (++looked > 60) return undefined; // sessions shown as connected are recent
      }
  return undefined;
}

const models = new Map<string, string | undefined>();
/** The model a session was started on, from its log (cached; it doesn't change). */
export function sessionModel(id: string): string | undefined {
  if (models.has(id)) return models.get(id);
  const f = sessionFile(id);
  const model = f ? sessionHead(f).model : undefined;
  if (model || f) models.set(id, model);
  return model;
}

function sessionHead(file: string): { model?: string } {
  for (const line of head(file, 256 * 1024).split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      type Rec = { payload?: Record<string, unknown>; children?: { record_json: string }[] };
      const outer = JSON.parse(line) as Rec;
      // Sessions started over `muse serve` wrap records in transactions.
      for (const rec of outer.children ? outer.children.map((c) => JSON.parse(c.record_json) as Rec) : [outer]) {
        const p = rec.payload ?? {};
        const kind = p.kind ?? p.type;
        if (kind === "metadata") return { model: (p.record as { model_id?: string } | undefined)?.model_id };
        if (kind === "run_model_configured") return { model: p.model_id as string | undefined };
      }
    } catch {
      // a line cut off at the read boundary
    }
  }
  return {};
}

/** Reads the start of a file, enough for a session's opening records. */
function head(file: string, bytes: number): string {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * A session's first message, about one cut of a project. On a new project the agent takes the first turn (log the
 * footage, sharpen the brief, propose directions); otherwise it reads where things stand and carries on, with `then`
 * (an answer, say) to act on.
 */
export function openingPrompt(project?: string, then?: string, cutId?: string): string {
  if (!project) return "We're working in beatsheet. Call list_projects, tell me what's there, then wait for instructions.";
  const { doc } = loadFile(project);
  const cut = doc.cuts.find((c) => c.id === cutId) ?? doc.cuts[0]!;
  const others = doc.cuts.filter((c) => c.id !== cut.id);
  const head =
    `We're working on the beatsheet project "${doc.title}" (id ${project}), on its cut "${cut.name}" (cut ${cut.id}).` +
    ` This conversation is about that cut: pass cut "${cut.id}" to the cut-level tools.` +
    (others.length ? ` The project's other cuts (${others.map((c) => `"${c.name}"`).join(", ")}) have conversations of their own; leave them as they are unless I ask.` : "") +
    " The footage and its logs, the brief and the look are shared by every cut.";
  const fresh = !doc.turn && !doc.assets.some((a) => a.rating || a.moments?.length) && doc.cuts.every((c) => !c.shots.length);
  if (fresh && !then) {
    return `${head} It's new, and it's your turn: follow the recipe's first turn (look at and log all the footage, read the references properly, sharpen the brief), then hand_off with a few directions for me to choose from. The montage skill covers videos cut to music, the story skill narrated ones (showcases, explainers, launches), and the motion skill designed scenes for either.`;
  }
  return `${head} Call get_project to see where it stands.${
    then ? `\n\n${then}` : " Then do what the turn calls for and end with hand_off. If it's my turn and nothing new has been asked of you, say where things stand in two sentences and hand_off again with the same ask."
  }`;
}
