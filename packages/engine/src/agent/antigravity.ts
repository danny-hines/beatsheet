/**
 * Antigravity, hosted through Google's own ACP server (agy_acp_server, the Agent Client Protocol) on the person's
 * Google sign-in: a free account, Google AI Pro or Ultra. beatsheet's tools come in as an MCP server on each session;
 * AGENTS.md and the recipes in .agents/skills come from the workspace. Every tool that isn't a plain read or edit in
 * the workspace asks first, so beatsheet answers for the person when they let it work freely, never about keys.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expandHome, inWorkspace, RUNTIME, WORKSPACE } from "../paths.ts";
import { replaceFile } from "../platform.ts";
import { readSettings } from "../settings.ts";
import { loadFile } from "../store.ts";
import { antigravityServer } from "./antigravity-server.ts";
import { CHROME_DEVTOOLS, cliEnv, MCP_SERVER } from "./cli.ts";
import { StdioRpc, type RpcId } from "./rpc.ts";
import { AgentAdapter, message, readStudioMessage, signedIn, studioSession, touchesKeys, type AgentApproval, type AgentCheck, type AgentItem, type AgentModel, type AgentOption, type AgentSessionSummary } from "./session.ts";

type Content = { type: string; text?: string };
type PlanEntry = { content: string; status?: string };
/** A tool call as the server describes it (`tool_call`, `tool_call_update`, and in a permission request). */
export type ToolCall = {
  toolCallId: string;
  title?: string;
  kind?: string;
  status?: string;
  content?: { type: string; content?: Content; path?: string }[];
  locations?: { path: string }[];
  /** An object live, the same as a JSON string when a session's history comes back. */
  rawInput?: unknown;
  _meta?: { mcp?: { server?: string; tool?: string } };
};
type Update = { sessionUpdate: string; content?: Content; entries?: PlanEntry[]; configOptions?: ConfigOption[] } & Partial<ToolCall>;
type PermissionOption = { optionId: string; name: string; kind: string };
type ConfigOption = { id: string; currentValue: string; options: { value: string; name: string; description?: string }[] };
type Opened = { sessionId?: string; configOptions?: ConfigOption[] };

const STATUS: Record<string, AgentItem["status"]> = { pending: "running", in_progress: "running", completed: "done", failed: "failed" };
/** Why a turn ended early, for the ones that aren't the person's doing. */
const STOPPED: Record<string, string> = {
  max_tokens: "Antigravity ran out of room in this conversation",
  max_turn_requests: "Antigravity stopped after too many steps in one turn",
  refusal: "Antigravity wouldn't carry on with this",
};
/** Antigravity's own tools by what they do (ACP's kinds), named as the studio words them. */
const KINDS: Record<string, string> = { execute: "shell", edit: "edit files", delete: "edit files", move: "edit files", read: "read_file", search: "search", fetch: "WebFetch", think: "helper" };
/** A turn runs as long as it takes; the answer to session/prompt comes when it's over. */
const TURN_MS = 12 * 60 * 60 * 1000;

/** Antigravity's folder (GEMINI_HOME moves it, as the server allows), where it keeps its conversations. */
const geminiHome = () => process.env.GEMINI_HOME ?? join(homedir(), ".gemini");
const conversation = (id: string) => join(geminiHome(), "antigravity-acp", "conversations", `${id}.db`);

/** How the server signs in, from its settings: oauth-personal for a Google account, gemini-api-key… */
export function authType(home = geminiHome()): string | undefined {
  try {
    return (JSON.parse(readFileSync(join(home, "antigravity-acp", "settings.json"), "utf8")) as { auth?: { type?: string } }).auth?.type;
  } catch {
    return undefined;
  }
}
/** What the other ways in are, as a plan. */
const KEYED: Record<string, string> = { "gemini-api-key": "Gemini API key", "oauth-business": "Gemini Enterprise", "agent-platform": "Gemini Enterprise Agent Platform" };

/**
 * The sessions beatsheet started, with their first message (which names the project and cut) and model: the server
 * lists its sessions by id alone. `probe` is the one empty session beatsheet opens to check the sign-in and read the
 * models, so checking doesn't leave a new one behind each time.
 */
type Index = { probe?: string; sessions: Record<string, { prompt?: string; model?: string; thinking?: string }> };
const INDEX = join(RUNTIME, "antigravity.json");

function readIndex(file = INDEX): Index {
  try {
    return { sessions: {}, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Index>) };
  } catch {
    return { sessions: {} };
  }
}

function updateIndex(fn: (x: Index) => void, file = INDEX) {
  const x = readIndex(file);
  fn(x);
  mkdirSync(RUNTIME, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(x, null, 2));
  replaceFile(`${file}.tmp`, file);
}

/** Earlier sessions the studio started, newest first, from the index and the server's own files. */
export function indexedSessions(index = readIndex(), db = conversation): AgentSessionSummary[] {
  const out: AgentSessionSummary[] = [];
  for (const [id, s] of Object.entries(index.sessions)) {
    if (id === index.probe || !existsSync(db(id))) continue;
    const found = studioSession({ id, updatedAt: statSync(db(id)).mtime.toISOString(), model: s.model, prompt: s.prompt });
    if (found) out.push(found);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
}

const signedOut = (err: unknown) => /authenticat|sign in|log in|login/i.test(message(err));

/** beatsheet's tools, as ACP lists a session's MCP servers, and Chrome DevTools MCP with "Use my Chrome" on. */
export function mcpServers(chrome = !!readSettings().chrome) {
  const stdio = (name: string, s: { command: string; args: string[]; env?: Record<string, string> }) => ({
    name,
    command: s.command,
    args: s.args,
    env: Object.entries(s.env ?? {}).map(([k, value]) => ({ name: k, value })),
  });
  return [stdio("beatsheet", MCP_SERVER), ...(chrome ? [stdio("chrome-devtools", CHROME_DEVTOOLS)] : [])];
}

/** The model choices from a session's config, the current one marked default. */
export function modelsOf(opened: Opened): AgentModel[] {
  const o = opened.configOptions?.find((c) => c.id === "model");
  return (o?.options ?? []).map((m) => ({ id: m.value, label: m.name, hint: m.description || undefined, default: m.value === o!.currentValue }));
}

/** The thinking / reasoning levels from a session's config, when the server exposes one. */
export function thinkingOf(opened: Opened): AgentOption[] {
  const o = opened.configOptions?.find((c) => c.id === "thinking_level");
  return (o?.options ?? []).map((m) => ({ id: m.value, label: m.name, hint: m.description || undefined, default: m.value === o!.currentValue }));
}

const text = (c?: Content) => (c?.type === "text" ? (c.text ?? "") : "");
const contentText = (call: ToolCall) =>
  (call.content ?? [])
    .map((c) => (c.type === "content" ? text(c.content) : ""))
    .filter(Boolean)
    .join("\n");
const paths = (call: ToolCall) => [...new Set((call.locations ?? []).map((l) => l.path))].map(inWorkspace);
const input = (call: ToolCall): Record<string, unknown> => {
  if (typeof call.rawInput === "string") {
    try {
      return JSON.parse(call.rawInput) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (call.rawInput as Record<string, unknown> | undefined) ?? {};
};

/**
 * Antigravity reading its own folder: an MCP tool's schema before calling it, or a long tool result it saved there.
 * Housekeeping the studio skips.
 */
export const housekeeping = (call: ToolCall) =>
  input(call).toolAction === "Reading tool schema" || (call.kind === "read" && !!call.locations?.length && call.locations.every((l) => /[\\/]antigravity-acp[\\/]brain[\\/]/.test(l.path)));

/** Which tool a call is, from what the server says about it. */
export function toolName(call: ToolCall): Pick<AgentItem, "tool" | "server" | "detail" | "args"> {
  const mcp = call._meta?.mcp;
  if (mcp?.tool) return { server: mcp.server, tool: mcp.tool, args: input(call).arguments };
  const own = call.kind && KINDS[call.kind];
  const title = call.title ?? "";
  if (own === "shell") return { tool: own, detail: (input(call).CommandLine as string | undefined) ?? title };
  if (own) return { tool: own, detail: own === "edit files" || own === "read_file" ? paths(call).join(", ") || title : title };
  return { tool: title || "tool" };
}

/** What a permission request shows the person. */
function card(call: ToolCall): Omit<AgentApproval, "id" | "choices"> {
  const named = toolName(call);
  if (call.kind === "execute") return { title: "Antigravity wants to run", detail: named.detail };
  if (call.kind === "edit" || call.kind === "delete" || call.kind === "move") return { title: "Antigravity wants to change files", detail: paths(call).join("\n") || call.title };
  if (call.kind === "read") return { title: "Antigravity wants to read", detail: paths(call).join("\n") || call.title };
  if (call.kind === "fetch") return { title: "Antigravity wants to go online", detail: call.title };
  if (named.server) return { title: `Antigravity wants to use ${named.server}`, detail: [named.tool, named.args ? JSON.stringify(named.args) : ""].filter(Boolean).join(" ") };
  return { title: call.title || "Antigravity is asking", detail: contentText(call) || undefined };
}

/** Read-only commands allowed without asking (matches Claude Code's "looking around" allowlist). */
const SAFE_COMMANDS = new Set(["ls", "pwd", "which", "file", "stat", "du", "wc", "ffprobe", "mdls"]);
/** Shell chaining, redirection, subshells or newlines disqualify a command from auto-approval. */
const SHELL_META = /[;&|`$><\r\n()]/;

/** Whether a shell command is a single, harmless read-only inspection command. */
export function isSafeReadCommand(command?: string): boolean {
  const text = command?.trim();
  if (!text || SHELL_META.test(text)) return false;
  const first = text.split(/\s+/)[0]!;
  const bin = first.replace(/^["']|["']$/g, "");
  const name = bin.includes("/") || bin.includes("\\") ? bin.split(/[\\/]/).pop() ?? "" : bin;
  return SAFE_COMMANDS.has(name.toLowerCase().replace(/\.exe$/, ""));
}

/** All file or folder paths a read/search tool call points at (locations first, then common input keys). */
function rawPaths(call: ToolCall): string[] {
  const fromLocs = (call.locations ?? []).map((l) => l.path).filter(Boolean);
  if (fromLocs.length) return [...new Set(fromLocs)];
  const inp = input(call);
  const found: string[] = [];
  for (const k of ["Path", "AbsolutePath", "DirectoryPath", "SearchPath", "TargetFile", "path", "file_path"]) {
    const v = inp[k];
    if (typeof v === "string" && v.trim()) found.push(v.trim());
  }
  return [...new Set(found)];
}

/** Parent directory of a path, preserving Windows or POSIX separators even when tested cross-platform. */
function parentDir(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (slash <= 0) return dirname(p);
  return trimmed.slice(0, slash);
}

/** Whether `target` sits inside `root` (case-insensitive on Windows). */
function isUnder(target: string, root: string, workspace: string, windows: boolean): boolean {
  const norm = (s: string) => {
    const expanded = expandHome(s);
    const full = /^[a-zA-Z]:[\\/]/.test(expanded) ? expanded : resolve(workspace, expanded);
    const unified = full.replace(/\\/g, "/").replace(/\/+$/, "");
    return windows ? unified.toLowerCase() : unified;
  };
  const a = norm(root);
  const b = norm(target);
  if (a === b) return true;
  if (!b.startsWith(`${a}/`)) return false;
  // Reject ".." traversal segments if the path wasn't normalized (e.g. Windows path tested on macOS).
  const rel = b.slice(a.length + 1);
  return !rel.split("/").includes("..");
}

/**
 * What "for this session" covers, as beatsheet remembers it (the server only offers once or for good): the same
 * command, the same MCP tool, any edit, or for reads the parent directory (so allowing a footage folder doesn't ask
 * for every clip in it).
 */
export function scope(call: ToolCall): string {
  const named = toolName(call);
  if (named.server) return `mcp:${named.server}/${named.tool}`;
  if (call.kind === "execute") return `run:${named.detail}`;
  if (call.kind === "read") {
    const p = rawPaths(call)[0];
    return `read:${p ? parentDir(p) : (named.detail ?? "")}`;
  }
  return `${call.kind}:${call.kind === "edit" ? "" : (named.detail ?? "")}`;
}

/**
 * Whether beatsheet approves a permission request without popping a card. Always refuses keys; always approves
 * beatsheet's own MCP tools; in "ask" mode also approves safe inspection inside the workspace or active project's
 * footage folders, harmless read-only commands, and subagent/thinking helpers.
 */
export function autoApprove(
  call: ToolCall,
  opts: { autonomy: "ask" | "free"; allowed: ReadonlySet<string>; workspace: string; roots?: readonly string[]; windows?: boolean },
): { approve: boolean; keys: boolean } {
  if (call._meta?.mcp?.server === "beatsheet") return { approve: true, keys: false };
  const shown = card(call);
  const windows = opts.windows ?? process.platform === "win32";
  const keys = touchesKeys([call.title, shown.detail, JSON.stringify(input(call))].join("\n"), windows);
  if (keys) return { approve: false, keys: true };
  if (opts.autonomy === "free" || opts.allowed.has(scope(call))) return { approve: true, keys: false };
  if (call.kind === "think") return { approve: true, keys: false };
  if (call.kind === "read" || call.kind === "search") {
    const targets = rawPaths(call);
    const allowedRoots = [opts.workspace, ...(opts.roots ?? [])];
    if (targets.length && targets.every((t) => allowedRoots.some((r) => isUnder(t, r, opts.workspace, windows)))) return { approve: true, keys: false };
  }
  if (call.kind === "execute" && isSafeReadCommand(shown.detail)) return { approve: true, keys: false };
  return { approve: false, keys: false };
}

/** Formats ACP `plan` entries into a compact notice for the transcript. */
function formatPlan(entries?: PlanEntry[]): string | undefined {
  if (!entries?.length) return undefined;
  const mark = (s?: string) => (s === "completed" ? "✓" : s === "in_progress" ? "▸" : "·");
  return entries.map((e) => `${mark(e.status)} ${e.content}`).join("\n");
}

const picked = (optionId?: string) => (optionId ? { outcome: { outcome: "selected", optionId } } : { outcome: { outcome: "cancelled" } });

export class AntigravityAdapter extends AgentAdapter {
  readonly id = "antigravity" as const;
  private rpc?: StdioRpc;
  private starting?: Promise<StdioRpc>;
  /** Last probe result, shared by models() and thinkingLevels() while this server runs. */
  private probed?: Promise<Opened>;
  /** Permission requests waiting on the person, with the option each choice sends back. */
  private waiting = new Map<string, { rpcId: RpcId; answers: Record<string, string | undefined>; scope: string }>();
  /** What the person allowed for the rest of this session. */
  private allowed = new Set<string>();
  /** The message or thinking streaming in now; the next chunk of the same kind adds to it. */
  private open?: { id: string; kind: "assistant" | "reasoning" };
  private seq = 0;

  private async host(): Promise<StdioRpc> {
    if (this.rpc && !this.rpc.closed) return this.rpc;
    this.starting ??= (async () => {
      const server = antigravityServer();
      if (!server) throw new Error("Antigravity isn't installed. Install it from Settings → Agent.");
      const rpc = new StdioRpc("Antigravity");
      rpc.on("notification", (m: string, p: Record<string, unknown>) => this.onEvent(m, p));
      rpc.on("request", (id: RpcId, m: string, p: Record<string, unknown>) => this.onRequest(id, m, p));
      rpc.on("closed", (err: Error) => {
        if (this.rpc !== rpc) return;
        this.probed = undefined;
        if (err.message !== "closed") this.fail(err);
      });
      rpc.spawn(server.command, server.args, { cwd: WORKSPACE, env: await cliEnv() });
      await rpc.request(
        "initialize",
        { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "beatsheet_studio", title: "beatsheet studio", version: "0.1.0" } },
        120_000,
      );
      this.rpc = rpc;
      return rpc;
    })().finally(() => (this.starting = undefined));
    return this.starting;
  }

  /**
   * beatsheet's one empty session, opened again: it proves the sign-in (the server refuses without one) and carries
   * the models and thinking levels the account offers.
   */
  private probe(fresh = false): Promise<Opened> {
    if (!fresh && this.probed) return this.probed;
    const p = (async () => {
      const rpc = await this.host();
      const probe = readIndex().probe;
      if (probe && existsSync(conversation(probe))) {
        try {
          return await rpc.request<Opened>("session/load", { sessionId: probe, cwd: WORKSPACE, mcpServers: [] }, 120_000);
        } catch (err) {
          if (signedOut(err)) throw err;
        }
      }
      const r = await rpc.request<Opened>("session/new", { cwd: WORKSPACE, mcpServers: [] }, 120_000);
      updateIndex((x) => void (x.probe = r.sessionId));
      return r;
    })();
    this.probed = p;
    p.catch(() => this.probed === p && (this.probed = undefined));
    return p;
  }

  async models(): Promise<AgentModel[]> {
    let r: Opened;
    try {
      r = await this.probe();
    } catch (err) {
      throw signedOut(err) ? new Error("Not signed in. Sign in from Settings → Agent.") : err;
    }
    const list = modelsOf(r);
    return list.length ? list : [{ id: "default", label: "Default", hint: "Whatever Antigravity picks", default: true }];
  }

  async thinkingLevels(): Promise<AgentOption[]> {
    try {
      return thinkingOf(await this.probe());
    } catch {
      return [];
    }
  }

  async check(): Promise<AgentCheck> {
    try {
      await this.probe(true);
    } catch (err) {
      return { ok: false, detail: signedOut(err) ? "Not signed in" : message(err) };
    }
    return { ok: true, detail: signedIn(await this.plan()) };
  }

  /**
   * The plan a Google account is on ("Google AI Ultra"). The server names it when asked to sign in again the way it
   * already is, which opens nothing once the probe has shown the sign-in works.
   */
  private async plan(): Promise<string | undefined> {
    const how = authType();
    if (how !== "oauth-personal") return how && KEYED[how];
    try {
      const r = await this.rpc!.request<{ _meta?: { antigravity?: { tier?: { name?: string } } } }>("authenticate", { methodId: how }, 30_000);
      return r._meta?.antigravity?.tier?.name;
    } catch {
      return undefined;
    }
  }

  /** Google's sign-in in the browser. It runs until the person finishes there; Check again picks it up. */
  async signIn() {
    const rpc = await this.host();
    void rpc.request("authenticate", { methodId: "oauth-personal" }, 15 * 60_000).catch(() => {});
  }

  async sessions(): Promise<AgentSessionSummary[]> {
    return indexedSessions();
  }

  async start(opts: { model?: string; thinking?: string; project?: string; cut?: string }) {
    this.replace({ status: "starting", project: opts.project, cut: opts.cut, model: opts.model, thinking: opts.thinking });
    this.reset();
    try {
      const rpc = await this.host();
      const r = await rpc.request<Opened>("session/new", { cwd: WORKSPACE, mcpServers: mcpServers() }, 120_000);
      const sessionId = r.sessionId!;
      let config = r.configOptions;
      let model = modelsOf({ configOptions: config }).find((m) => m.default)?.id;
      if (opts.model && opts.model !== "default" && opts.model !== model) {
        const res = await rpc.request<Opened | undefined>("session/set_config_option", { sessionId, configId: "model", value: opts.model });
        if (res?.configOptions) config = res.configOptions;
        model = opts.model;
      }
      let thinking = thinkingOf({ configOptions: config }).find((t) => t.default)?.id;
      if (opts.thinking && opts.thinking !== "default" && opts.thinking !== thinking) {
        try {
          await rpc.request("session/set_config_option", { sessionId, configId: "thinking_level", value: opts.thinking });
          thinking = opts.thinking;
        } catch {
          // The chosen model may not expose this thinking level; carry on with its default.
        }
      }
      updateIndex((x) => void (x.sessions[sessionId] = { model, thinking }));
      this.set({ status: "idle", sessionId, model, thinking });
    } catch (err) {
      this.fail(signedOut(err) ? new Error("Antigravity isn't signed in. Sign in from Settings → Agent.") : err);
    }
  }

  async resume(sessionId: string, project?: string, cut?: string) {
    // The history streams in as updates to this session before the answer, so the view takes its id first.
    const saved = readIndex().sessions[sessionId];
    this.replace({ status: "starting", sessionId, project, cut, model: saved?.model, thinking: saved?.thinking });
    this.reset();
    try {
      const rpc = await this.host();
      const r = await rpc.request<Opened>("session/load", { sessionId, cwd: WORKSPACE, mcpServers: mcpServers() }, 120_000);
      this.finish();
      this.set({
        status: "idle",
        model: modelsOf(r).find((m) => m.default)?.id ?? this.view.model,
        thinking: thinkingOf(r).find((t) => t.default)?.id ?? this.view.thinking,
      });
    } catch (err) {
      this.fail(err);
    }
  }

  async send(text: string) {
    const sessionId = this.view.sessionId;
    if (!sessionId) throw new Error("No Antigravity session open");
    const rpc = await this.host();
    // The first message names the project and cut, which is how the session is found again.
    if (!readIndex().sessions[sessionId]?.prompt) updateIndex((x) => void (x.sessions[sessionId] = { ...x.sessions[sessionId], prompt: text }));
    this.finish();
    // The server doesn't echo the person's message back while it works, only when a session is loaded again.
    this.upsert({ id: `user-${++this.seq}`, kind: "user", status: "done", ...readStudioMessage(text) });
    this.set({ status: "running", error: undefined });
    void rpc.request<{ stopReason: string }>("session/prompt", { sessionId, prompt: [{ type: "text", text }] }, TURN_MS).then(
      (r) => this.turnOver(sessionId, STOPPED[r.stopReason]),
      (err) => this.turnOver(sessionId, message(err)),
    );
  }

  private turnOver(sessionId: string, error?: string) {
    if (this.view.sessionId !== sessionId || this.view.status !== "running") return;
    this.finish();
    this.set({ status: "idle", error });
  }

  async interrupt() {
    if (!this.rpc || !this.view.sessionId) return;
    // Anything still waiting on the person goes back cancelled, as the protocol asks.
    for (const [id, w] of [...this.waiting]) {
      this.settle(id);
      this.rpc.respond(w.rpcId, picked());
    }
    this.rpc.notify("session/cancel", { sessionId: this.view.sessionId });
  }

  async decide(approvalId: string, choiceId: string) {
    const w = this.waiting.get(approvalId);
    if (!w || !this.rpc) return;
    this.settle(approvalId);
    if (choiceId === "session") this.allowed.add(w.scope);
    this.rpc.respond(w.rpcId, picked(w.answers[choiceId]));
  }

  stop() {
    const rpc = this.rpc;
    this.rpc = undefined;
    this.probed = undefined;
    // On Windows this ends the whole tree: the server starts a second copy of itself and its harness.
    rpc?.close();
    this.reset();
    this.replace({ status: "off" });
  }

  /** The active project's declared footage folders, so Antigravity can read media in them without approval spam. */
  private projectRoots(): string[] {
    if (!this.view.project) return [];
    try {
      const { doc, dir } = loadFile(this.view.project);
      return doc.sources.map((s) => resolve(dir, expandHome(s.path)));
    } catch {
      return [];
    }
  }

  private reset() {
    this.waiting.clear();
    this.allowed.clear();
    this.open = undefined;
  }

  private settle(approvalId: string) {
    if (!this.waiting.delete(approvalId)) return;
    this.set({ approvals: this.view.approvals.filter((a) => a.id !== approvalId) });
  }

  private onRequest(rpcId: RpcId, method: string, p: Record<string, unknown>) {
    const rpc = this.rpc!;
    if (method !== "session/request_permission") return rpc.refuse(rpcId);
    this.heard();
    const call = p.toolCall as ToolCall;
    const options = (p.options as PermissionOption[] | undefined) ?? [];
    // "For good" isn't offered: it would be written into the person's own Antigravity settings.
    const answers = { accept: options.find((o) => o.kind === "allow_once")?.optionId, decline: options.find((o) => o.kind === "reject_once")?.optionId };
    const shown = card(call);
    const key = scope(call);
    const { approve, keys } = autoApprove(call, {
      autonomy: readSettings().autonomy === "free" ? "free" : "ask",
      allowed: this.allowed,
      workspace: WORKSPACE,
      roots: this.projectRoots(),
    });
    if (answers.accept && approve) return rpc.respond(rpcId, picked(answers.accept));
    const id = String(rpcId);
    const choices = [
      ...(answers.accept ? [{ id: "accept", label: call.kind === "execute" ? "Run" : "Allow", primary: true }] : []),
      ...(answers.accept && !keys ? [{ id: "session", label: "Allow for this session" }] : []),
      { id: "decline", label: call.kind === "execute" ? "Don't run" : "Decline" },
    ];
    this.waiting.set(id, { rpcId, answers: { ...answers, session: answers.accept }, scope: key });
    this.set({ approvals: [...this.view.approvals.filter((a) => a.id !== id), { id, ...shown, choices }] });
  }

  private onEvent(method: string, p: Record<string, unknown>) {
    if (method !== "session/update" || p.sessionId !== this.view.sessionId) return;
    this.heard();
    const u = p.update as Update;
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
        return this.stream("assistant", text(u.content));
      case "agent_thought_chunk":
        return this.stream("reasoning", text(u.content));
      case "user_message_chunk":
        this.finish();
        return this.upsert({ id: `user-${++this.seq}`, kind: "user", status: "done", ...readStudioMessage(text(u.content)) });
      case "tool_call":
        if (housekeeping(u as ToolCall)) return;
        this.finish();
        return this.upsert(this.toolItem(u as ToolCall));
      case "tool_call_update":
        // An update to a call the studio skipped stays skipped.
        if (!this.view.items.some((x) => x.id === u.toolCallId)) return;
        return this.upsert(this.toolItem(u as ToolCall));
      case "plan": {
        const summary = formatPlan(u.entries);
        if (!summary) return;
        this.finish();
        return this.upsert({ id: "plan", kind: "notice", status: "done", text: summary });
      }
      case "config_option_update": {
        if (!u.configOptions?.length) return;
        const model = modelsOf({ configOptions: u.configOptions }).find((m) => m.default)?.id;
        const thinking = thinkingOf({ configOptions: u.configOptions }).find((t) => t.default)?.id;
        if (model || thinking) this.set({ ...(model ? { model } : {}), ...(thinking ? { thinking } : {}) });
        return;
      }
    }
  }

  /**
   * A chunk of a message or of its thinking: more of the one open, or the start of the next. Outside a turn (a
   * history coming back), items are done as they arrive.
   */
  private stream(kind: "assistant" | "reasoning", chunk: string) {
    if (!chunk) return;
    const open = this.open && this.view.items.find((x) => x.id === this.open!.id);
    if (open && this.open!.kind === kind) return this.append(open.id, "text", chunk);
    this.finish();
    const id = `${kind}-${++this.seq}`;
    this.open = { id, kind };
    this.upsert({ id, kind, status: this.view.status === "running" ? "running" : "done", text: chunk });
  }

  /** The open message or thinking is complete. */
  private finish() {
    const open = this.open && this.view.items.find((x) => x.id === this.open!.id);
    this.open = undefined;
    if (open?.status === "running") this.upsert({ ...open, status: "done" });
  }

  private toolItem(call: ToolCall): AgentItem {
    const was = this.view.items.find((x) => x.id === call.toolCallId);
    const status = call.status ? (STATUS[call.status] ?? "done") : (was?.status ?? "running");
    // An update that only reports the result keeps what the call was.
    const named = call.title || call._meta?.mcp || !was ? toolName(call) : {};
    return { ...was, id: call.toolCallId, kind: "tool", status, ...named, error: status === "failed" ? contentText(call) || "Failed" : undefined };
  }
}
