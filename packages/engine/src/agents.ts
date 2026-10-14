/**
 * Muse Code: which sessions are connected, starting or resuming one in Terminal from the studio, and getting a batch
 * of notes into a session that's already open.
 *
 * Presence comes from the MCP server itself: every Muse session that loads beatsheet's tools (started from the studio
 * or by hand in this folder) writes a small file under .beatsheet/agents while it's alive.
 */
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { REPO } from "./paths.ts";
import { loadProject, updateProject } from "./store.ts";

const run = promisify(execFile);

export const RUNTIME = join(REPO, ".beatsheet");
export const AGENTS_DIR = join(RUNTIME, "agents");
const LAUNCH_DIR = join(RUNTIME, "launch");
const SESSIONS_DIR = join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "muse", "sessions");

/** Muse's cross-session messaging is behind these switches; both the sender and the receiving session need them. */
const MESSAGING_ENV = { MUSE_EXPERIMENTAL_EXTERNAL_AGENT_INGRESS: "1", MUSE_EXPERIMENTAL_LOCAL_SESSION_MESSAGING: "1" };

export type AgentKind = "muse" | "other";
export type Presence = {
  pid: number;
  kind: AgentKind;
  /** The MCP client's own name and version. */
  client: string;
  version?: string;
  startedAt: string;
  /** The Muse session id (Muse passes it to MCP servers), so the studio can message the session. */
  museSession?: string;
  /** Model the session runs on, read from Muse's session log (Muse doesn't pass other environment through). */
  model?: string;
  activity?: { tool: string; project?: string; at: string };
};

/** What the MCP server knows about the session that started it. */
export function presenceFromEnv(client: { name?: string; version?: string } | undefined): Omit<Presence, "pid" | "startedAt"> {
  const museSession = process.env.MUSE_SESSION_ID ?? process.env.MUSE_THREAD_ID;
  const kind: AgentKind = museSession || /muse/i.test(client?.name ?? "") ? "muse" : "other";
  return { kind, client: client?.name ?? "unknown", version: client?.version, museSession };
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

// ---- The Muse Code CLI. The studio may run without the user's login PATH, so ask a login shell, then look where it installs.
let found: { at: number; path: string | null } | undefined;
export async function findMuse(): Promise<string | null> {
  if (found && Date.now() - found.at < 60_000) return found.path;
  let path: string | null = null;
  try {
    const { stdout } = await run("/bin/zsh", ["-lc", "command -v muse"], { timeout: 8000 });
    const p = stdout.trim().split("\n").pop();
    if (p?.startsWith("/")) path = p;
  } catch {
    // not on the login PATH
  }
  path ??= [join(homedir(), ".local/bin/muse"), "/opt/homebrew/bin/muse", "/usr/local/bin/muse"].find((g) => existsSync(g)) ?? null;
  found = { at: Date.now(), path };
  return path;
}

export type MuseSession = { id: string; updatedAt: string; model?: string; prompt?: string; project?: string; title?: string };

/** The first message the studio sends a new session; resume lists only sessions that started this way. */
const OPENING = /^We're working (?:on the beatsheet project "(.+?)" \(id ([\w-]+)\)|in beatsheet)/;

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

function sessionHead(file: string): { workspace?: string; model?: string; prompt?: string } {
  const out: { workspace?: string; model?: string; prompt?: string } = {};
  for (const line of head(file, 256 * 1024).split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      const rec = JSON.parse(line) as { payload_type?: string; payload?: Record<string, unknown> };
      const p = rec.payload ?? {};
      const kind = p.kind ?? p.type;
      const record = p.record as { workspace_root?: string; model_id?: string } | undefined;
      if (rec.payload_type === "runtime.user_intent.accepted") out.prompt ??= (p.refill_blocks as { text?: string }[] | undefined)?.[0]?.text;
      if (kind === "metadata" || kind === "workspace_branch_observed") out.workspace ??= record?.workspace_root;
      if (kind === "metadata") out.model ??= record?.model_id;
      if (kind === "run_model_configured") out.model ??= p.model_id as string | undefined;
      if (kind === "turn_input_user" || kind === "run_started") out.prompt ??= p.prompt as string | undefined;
    } catch {
      // a line cut off at the read boundary
    }
    if (out.workspace && out.model && out.prompt) break;
  }
  return out;
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

/** Recent Muse sessions started from the studio, newest first, for "resume". */
export function listMuseSessions(limit = 8): MuseSession[] {
  if (!existsSync(SESSIONS_DIR)) return [];
  const dirs: { dir: string; mtime: number }[] = [];
  const desc = (p: string) => (existsSync(p) ? readdirSync(p).filter((d) => /^\d+$/.test(d)).sort().reverse() : []);
  for (const y of desc(SESSIONS_DIR))
    for (const m of desc(join(SESSIONS_DIR, y)))
      for (const d of desc(join(SESSIONS_DIR, y, m))) {
        const day = join(SESSIONS_DIR, y, m, d);
        for (const id of readdirSync(day)) {
          const file = join(day, id, "session.jsonl");
          if (existsSync(file)) dirs.push({ dir: join(day, id), mtime: statSync(file).mtimeMs });
        }
        if (dirs.length > 200) break;
      }
  dirs.sort((a, b) => b.mtime - a.mtime);
  const out: MuseSession[] = [];
  for (const { dir, mtime } of dirs) {
    if (out.length >= limit) break;
    const { workspace, model, prompt } = sessionHead(join(dir, "session.jsonl"));
    const opening = prompt?.match(OPENING);
    if (workspace !== REPO || !opening) continue;
    out.push({ id: dir.split("/").pop()!, updatedAt: new Date(mtime).toISOString(), model, prompt: prompt?.slice(0, 160), title: opening[1], project: opening[2] });
  }
  return out;
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Opens Terminal with Muse Code in the beatsheet folder: trusted (so it loads beatsheet's tools, AGENTS.md and the
 * recipes), with session messaging on (so Send can reach it), and for a new session a first message pointing it at
 * the project.
 */
export async function launchMuse(opts: { session?: string; model?: string; project?: string }): Promise<{ launchId: string; command: string; startedAt: string }> {
  const muse = await findMuse();
  if (!muse) throw new Error('Muse Code isn\'t installed (no "muse" command found)');
  if (opts.model && !/^muse-[a-z0-9.-]+$/.test(opts.model)) throw new Error(`Unknown model "${opts.model}"`);
  if (opts.session && !/^[\w-]+$/.test(opts.session)) throw new Error(`Bad session id "${opts.session}"`);
  const launchId = randomUUID().slice(0, 8);
  let prompt: string | undefined;
  if (!opts.session) {
    const title = opts.project ? loadProject(opts.project).project.title : undefined;
    prompt = opts.project
      ? `We're working on the beatsheet project "${title}" (id ${opts.project}). Call get_project for an overview, tell me in two or three sentences where it stands, then wait. I'll send notes from the studio.`
      : "We're working in beatsheet. Call list_projects, tell me what's there, then wait for instructions.";
  }
  const args = [
    muse,
    ...(opts.session ? ["resume", opts.session] : []),
    "--trust-workspace",
    ...(opts.model && !opts.session ? ["--model", opts.model] : []),
    "-c",
    "local_session_messaging.enabled=true",
    ...(prompt ? [prompt] : []),
  ];
  const command = args.map(quote).join(" ");
  mkdirSync(LAUNCH_DIR, { recursive: true });
  const script = join(LAUNCH_DIR, `muse-${launchId}.command`);
  writeFileSync(
    script,
    [
      "#!/bin/zsh -l",
      `cd ${quote(REPO)}`,
      ...Object.entries(MESSAGING_ENV).map(([k, v]) => `export ${k}=${v}`),
      `printf '\\e]0;beatsheet · Muse Code\\a'`,
      `exec ${command}`,
      "",
    ].join("\n"),
  );
  chmodSync(script, 0o755);
  const startedAt = new Date().toISOString();
  await run("open", ["-a", "Terminal", script]);
  return { launchId, command, startedAt };
}

export const batchMessage = (id: string, title: string, n: number) =>
  `I sent ${n} beatsheet note${n === 1 ? "" : "s"} on "${title}" (project ${id}). Call get_batch for project ${id}, handle each note, check visual changes with frame, and close each one with resolve_note.`;

/** Delivers text into a running Muse session with `muse session-message send`. */
async function messageSession(muse: string, session: string, body: string): Promise<void> {
  await new Promise<void>((ok, fail) => {
    const child = spawn(muse, ["session-message", "send", "--target", session, "--json"], {
      env: { ...process.env, ...MESSAGING_ENV },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(out.trim() || `muse session-message exited ${code}`))));
    child.stdin.end(body);
  });
}

/**
 * Marks the queued notes as sent and delivers them to a connected Muse session that has messaging on. Without one, the
 * notes wait for the person to say "handle my beatsheet notes".
 */
export async function sendBatch(project: string): Promise<{ count: number; delivered: "muse" | "none"; agent?: Presence; message: string; error?: string }> {
  const batch = `b${Date.now().toString(36)}`;
  let count = 0;
  updateProject(project, (p) => {
    for (const n of p.notes) {
      if (n.status === "queued" && n.text.trim()) {
        n.status = "working";
        n.batch = batch;
        count++;
      }
    }
  });
  const { project: p } = loadProject(project);
  const pending = p.notes.filter((n) => n.status === "working").length;
  const message = batchMessage(project, p.title, pending);
  const agents = listAgents();
  const ranked = [...agents].sort((a, b) => Number(b.activity?.project === project) - Number(a.activity?.project === project));
  // Sessions started from the studio have messaging on; one started by hand may not, and then sending fails cleanly.
  const target = ranked.find((a) => a.kind === "muse" && a.museSession);
  const muse = await findMuse();
  if (target?.museSession && muse) {
    try {
      await messageSession(muse, target.museSession, message);
      return { count, delivered: "muse", agent: target, message };
    } catch (err) {
      return { count, delivered: "none", agent: target, message, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { count, delivered: "none", agent: ranked[0], message };
}
