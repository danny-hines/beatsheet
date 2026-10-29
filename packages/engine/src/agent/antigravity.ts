/**
 * Antigravity, hosted through Google's own ACP server (agy_acp_server, the Agent Client Protocol) on the person's
 * Google sign-in: a free account, Google AI Pro or Ultra. beatsheet's tools come in as an MCP server on each session;
 * AGENTS.md and the recipes in .agents/skills come from the workspace. Every tool that isn't a plain read or edit in
 * the workspace asks first, so beatsheet answers for the person when they let it work freely, never about keys.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RUNTIME } from "../agents.ts";
import { inRepo, REPO } from "../paths.ts";
import { replaceFile } from "../platform.ts";
import { readSettings } from "../settings.ts";
import { antigravityServer } from "./antigravity-server.ts";
import { CHROME_DEVTOOLS, cliEnv, MCP_SERVER } from "./cli.ts";
import { StdioRpc, type RpcId } from "./rpc.ts";
import { AgentAdapter, message, readStudioMessage, studioSession, touchesKeys, type AgentApproval, type AgentCheck, type AgentItem, type AgentModel, type AgentSessionSummary } from "./session.ts";

type Content = { type: string; text?: string };
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
type Update = { sessionUpdate: string; content?: Content } & Partial<ToolCall>;
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

/**
 * The sessions beatsheet started, with their first message (which names the project and cut) and model: the server
 * lists its sessions by id alone. `probe` is the one empty session beatsheet opens to check the sign-in and read the
 * models, so checking doesn't leave a new one behind each time.
 */
type Index = { probe?: string; sessions: Record<string, { prompt?: string; model?: string }> };
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

const text = (c?: Content) => (c?.type === "text" ? (c.text ?? "") : "");
const contentText = (call: ToolCall) =>
  (call.content ?? [])
    .map((c) => (c.type === "content" ? text(c.content) : ""))
    .filter(Boolean)
    .join("\n");
const paths = (call: ToolCall) => [...new Set((call.locations ?? []).map((l) => l.path))].map(inRepo);
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

/**
 * What "for this session" covers, as beatsheet remembers it (the server only offers once or for good): the same
 * command, the same MCP tool, or any edit.
 */
export function scope(call: ToolCall): string {
  const named = toolName(call);
  if (named.server) return `mcp:${named.server}/${named.tool}`;
  if (call.kind === "execute") return `run:${named.detail}`;
  return `${call.kind}:${call.kind === "edit" ? "" : (named.detail ?? "")}`;
}

const picked = (optionId?: string) => (optionId ? { outcome: { outcome: "selected", optionId } } : { outcome: { outcome: "cancelled" } });

export class AntigravityAdapter extends AgentAdapter {
  readonly id = "antigravity" as const;
  private rpc?: StdioRpc;
  private starting?: Promise<StdioRpc>;
  /** Permission requests waiting on the person, with the option each choice sends back. */
  private waiting = new Map<string, { rpcId: RpcId; answers: Record<string, string | undefined>; scope: string }>();
  /** What the person allowed for the rest of this session. */
  private allowed = new Set<string>();
  /** The message or thinking streaming in now; the next chunk of the same kind adds to it. */
  private open?: { id: string; kind: "assistant" | "reasoning" };
  private seq = 0;
  /** Messages sent while a turn runs go in after it. */
  private queue: string[] = [];

  private async host(): Promise<StdioRpc> {
    if (this.rpc && !this.rpc.closed) return this.rpc;
    this.starting ??= (async () => {
      const server = antigravityServer();
      if (!server) throw new Error("Antigravity isn't installed. Install it from Settings → Agent.");
      const rpc = new StdioRpc("Antigravity");
      rpc.on("notification", (m: string, p: Record<string, unknown>) => this.onEvent(m, p));
      rpc.on("request", (id: RpcId, m: string, p: Record<string, unknown>) => this.onRequest(id, m, p));
      rpc.on("closed", (err: Error) => this.rpc === rpc && err.message !== "closed" && this.fail(err));
      rpc.spawn(server.command, server.args, { cwd: REPO, env: await cliEnv() });
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
   * the models the account offers.
   */
  private async probe(): Promise<Opened> {
    const rpc = await this.host();
    const probe = readIndex().probe;
    if (probe && existsSync(conversation(probe))) {
      try {
        return await rpc.request<Opened>("session/load", { sessionId: probe, cwd: REPO, mcpServers: [] }, 120_000);
      } catch (err) {
        if (signedOut(err)) throw err;
      }
    }
    const r = await rpc.request<Opened>("session/new", { cwd: REPO, mcpServers: [] }, 120_000);
    updateIndex((x) => void (x.probe = r.sessionId));
    return r;
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

  async check(): Promise<AgentCheck> {
    try {
      await this.probe();
    } catch (err) {
      return { ok: false, detail: signedOut(err) ? "Not signed in" : message(err) };
    }
    return { ok: true, detail: "Signed in with Google" };
  }

  /** Google's sign-in in the browser. It runs until the person finishes there; Check again picks it up. */
  async signIn() {
    const rpc = await this.host();
    void rpc.request("authenticate", { methodId: "oauth-personal" }, 15 * 60_000).catch(() => {});
  }

  async sessions(): Promise<AgentSessionSummary[]> {
    return indexedSessions();
  }

  async start(opts: { model?: string; project?: string; cut?: string }) {
    this.replace({ status: "starting", project: opts.project, cut: opts.cut, model: opts.model });
    this.reset();
    try {
      const rpc = await this.host();
      const r = await rpc.request<Opened>("session/new", { cwd: REPO, mcpServers: mcpServers() }, 120_000);
      const sessionId = r.sessionId!;
      let model = modelsOf(r).find((m) => m.default)?.id;
      if (opts.model && opts.model !== "default" && opts.model !== model) {
        await rpc.request("session/set_config_option", { sessionId, configId: "model", value: opts.model });
        model = opts.model;
      }
      updateIndex((x) => void (x.sessions[sessionId] = { model }));
      this.set({ status: "idle", sessionId, model });
    } catch (err) {
      this.fail(signedOut(err) ? new Error("Antigravity isn't signed in. Sign in from Settings → Agent.") : err);
    }
  }

  async resume(sessionId: string, project?: string, cut?: string) {
    // The history streams in as updates to this session before the answer, so the view takes its id first.
    this.replace({ status: "starting", sessionId, project, cut, model: readIndex().sessions[sessionId]?.model });
    this.reset();
    try {
      const rpc = await this.host();
      const r = await rpc.request<Opened>("session/load", { sessionId, cwd: REPO, mcpServers: mcpServers() }, 120_000);
      this.finish();
      this.set({ status: "idle", model: modelsOf(r).find((m) => m.default)?.id ?? this.view.model });
    } catch (err) {
      this.fail(err);
    }
  }

  async send(text: string) {
    const sessionId = this.view.sessionId;
    if (!sessionId) throw new Error("No Antigravity session open");
    if (this.view.status === "running") {
      this.queue.push(text);
      return;
    }
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
    const next = this.queue.shift();
    if (next) void this.send(next).catch((err) => this.set({ error: message(err) }));
  }

  async interrupt() {
    this.queue = [];
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
    // On Windows this ends the whole tree: the server starts a second copy of itself and its harness.
    rpc?.close();
    this.queue = [];
    this.reset();
    this.replace({ status: "off" });
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
    // beatsheet's own tools are what the session is for.
    if (call._meta?.mcp?.server === "beatsheet") return rpc.respond(rpcId, picked(answers.accept));
    // Allowed for the session already, or working without asking: beatsheet says yes itself, except to anything that
    // reads keys.
    const keys = touchesKeys([call.title, shown.detail, JSON.stringify(input(call))].join("\n"));
    if (answers.accept && !keys && (this.allowed.has(key) || readSettings().autonomy === "free")) return rpc.respond(rpcId, picked(answers.accept));
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
