/**
 * Claude Code, hosted by running the person's own `claude` CLI headless (stream-json in and out) under their own
 * sign-in. The studio never reads or stores their credentials. beatsheet's tools come in with --mcp-config;
 * CLAUDE.md and the recipes in .claude/skills come from the workspace.
 */
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { inRepo, REPO } from "../paths.ts";
import { IS_WINDOWS } from "../platform.ts";
import { readSettings } from "../settings.ts";
import { cliEnv, findCli, MCP_SERVER, spawnCli } from "./cli.ts";
import { AgentAdapter, message, readStudioMessage, studioSession, touchesKeys, type AgentApproval, type AgentCheck, type AgentItem, type AgentModel, type AgentSessionSummary } from "./session.ts";

/** Claude Code keeps each workspace's transcripts in a folder named after its path. */
const TRANSCRIPTS = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects", REPO.replace(/[^a-zA-Z0-9]/g, "-"));

const MODELS: AgentModel[] = [
  { id: "default", label: "Default", hint: "Whatever your Claude Code settings pick", default: true },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
];

type Block = { type: string; id?: string; name?: string; input?: unknown; text?: string; thinking?: string; tool_use_id?: string; is_error?: boolean; content?: unknown };
type Line = {
  type: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  message?: { id?: string; role?: string; content?: string | Block[]; model?: string };
  event?: { type: string; index?: number; message?: { id: string }; content_block?: Block; delta?: { type: string; text?: string; thinking?: string; partial_json?: string } };
  request_id?: string;
  request?: { subtype: string; tool_name?: string; input?: Record<string, unknown>; tool_use_id?: string; title?: string; description?: string; decision_reason?: string };
  response?: { subtype: string; request_id: string };
  result?: string;
  is_error?: boolean;
  mcp_servers?: { name: string; status: string }[];
  isMeta?: boolean;
  isSidechain?: boolean;
  timestamp?: string;
};

/** "mcp__beatsheet__edit_project" → tool and server. */
const splitTool = (name = "") => {
  const m = name.match(/^mcp__(.+?)__(.+)$/);
  return m ? { server: m[1], tool: m[2] } : { tool: name };
};
const blockText = (content: unknown): string =>
  typeof content === "string" ? content : Array.isArray(content) ? content.flatMap((b: Block) => (b.type === "text" && b.text ? [b.text] : [])).join("\n") : "";
/** A one-line summary for Claude Code's own tools. */
const detailFor = (input: unknown) => {
  const i = (input ?? {}) as Record<string, unknown>;
  const v = i.command ?? i.file_path ?? i.path ?? i.pattern ?? i.url ?? i.description;
  return typeof v === "string" ? inRepo(v) : undefined;
};

/**
 * What the session may do without asking. beatsheet's own tools are what it's for (every write through them is
 * validated and versioned), and looking around (listing folders, reading a file's media details) is harmless. With
 * autonomy "free" it also runs commands, edits files and reads the web on its own. Either way it never reads keys: the
 * Keychain is beatsheet's, and services are used through beatsheet's tools.
 */
export function permissionArgs(autonomy: "ask" | "free" = "ask", chrome = false, windows = IS_WINDOWS): string[] {
  const looking = ["ls", "pwd", "which", "file", "stat", "du", "wc", "ffprobe", "mdls"].flatMap((c) => [`Bash(${c})`, `Bash(${c} *)`]);
  const free = autonomy === "free" ? ["Bash", "Edit", "Write", "WebFetch", "WebSearch"] : [];
  // The person turned on working in their Chrome; the extension asks them before acting on each site.
  if (chrome) free.push("mcp__claude-in-chrome");
  // However it's spelled (/usr/bin/security, inside $(…)), reading a password out of the Keychain is refused.
  const keys = ["Bash(security *)", "Bash(*find-generic-password*)", "Bash(*find-internet-password*)", "Bash(*dump-keychain*)"];
  if (windows) {
    // Claude Code on Windows has a PowerShell tool beside Bash, with rules of the same shape.
    looking.push("PowerShell(ffprobe)", "PowerShell(ffprobe *)");
    if (autonomy === "free") free.push("PowerShell");
    // The keys are in Credential Manager: beatsheet's own helper, and the ways PowerShell reads it.
    keys.push(...WINDOWS_KEY_READERS.flatMap((k) => [`Bash(*${k}*)`, `PowerShell(*${k}*)`]));
  }
  return [
    ...(autonomy === "free" ? ["--permission-mode", "acceptEdits"] : []),
    "--allowedTools",
    ["mcp__beatsheet", ...looking, ...free].join(","),
    "--disallowedTools",
    keys.join(","),
  ];
}

/** What reads keys out of Windows Credential Manager. */
const WINDOWS_KEY_READERS = ["beatsheet-credentials", "CredRead", "CredEnumerate", "PasswordVault", "Get-StoredCredential", "vaultcmd"];

export class ClaudeAdapter extends AgentAdapter {
  readonly id = "claude" as const;
  private child?: ChildProcess;
  private buffer = "";
  private stderr = "";
  private watchdog?: ReturnType<typeof setInterval>;
  /** Streamed blocks by index within the current message, and the message they belong to. */
  private streamMsg?: string;
  private streamItems = new Map<number, { id: string; json?: string }>();
  private streamed = new Set<string>();
  /** Permission prompts waiting on the person: the CLI's request and the tool input to hand back. */
  private waiting = new Map<string, { requestId: string; toolName: string; input: Record<string, unknown> }>();
  private controlSeq = 0;

  async models() {
    return MODELS;
  }

  /** The CLI has no status call, so ask it for one word; a signed-out CLI answers with what to do instead. */
  async check(): Promise<AgentCheck> {
    const claude = await findCli("claude");
    if (!claude) return { ok: false, detail: "Not installed" };
    const env = await cliEnv();
    const out = await new Promise<string>((resolve, reject) => {
      const child = spawnCli(claude, ["-p", "Reply with just the word OK.", "--output-format", "json", "--max-turns", "1", "--strict-mcp-config"], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
      let text = "";
      child.stdout!.on("data", (d) => (text += d));
      child.stderr!.on("data", (d) => (text += d));
      const timer = setTimeout(() => child.kill(), 90_000);
      child.on("error", reject);
      child.on("close", () => (clearTimeout(timer), resolve(text)));
    });
    try {
      const r = JSON.parse(out.slice(out.indexOf("{"))) as { is_error?: boolean; result?: string };
      if (r.is_error) return { ok: false, detail: /login|log in|sign in|api key|auth/i.test(r.result ?? "") ? "Not signed in" : (r.result ?? "Claude Code couldn't answer") };
      return { ok: true, detail: "Signed in" };
    } catch {
      return { ok: false, detail: out.trim().split("\n").pop() || "Claude Code couldn't answer" };
    }
  }

  async sessions(): Promise<AgentSessionSummary[]> {
    if (!existsSync(TRANSCRIPTS)) return [];
    const files = readdirSync(TRANSCRIPTS)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ f, mtime: statSync(join(TRANSCRIPTS, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 60);
    const out: AgentSessionSummary[] = [];
    for (const { f, mtime } of files) {
      const { prompt, model } = transcriptHead(join(TRANSCRIPTS, f));
      const s = studioSession({ id: f.slice(0, -6), updatedAt: new Date(mtime).toISOString(), model, prompt });
      if (s) out.push(s);
      if (out.length >= 12) break;
    }
    return out;
  }

  async start(opts: { model?: string; project?: string; cut?: string }) {
    const sessionId = randomUUID();
    this.replace({ status: "starting", project: opts.project, cut: opts.cut });
    try {
      await this.launch(["--session-id", sessionId, ...(opts.model && opts.model !== "default" ? ["--model", opts.model] : [])]);
      this.set({ status: "idle", sessionId, model: opts.model === "default" ? undefined : opts.model });
    } catch (err) {
      this.fail(err);
    }
  }

  async resume(sessionId: string, project?: string, cut?: string) {
    this.replace({ status: "starting", project, cut });
    try {
      const file = join(TRANSCRIPTS, `${sessionId}.jsonl`);
      const items = existsSync(file) ? transcriptItems(file) : [];
      await this.launch(["--resume", sessionId]);
      this.replace({ status: "idle", sessionId, project, cut, items, model: transcriptHead(file).model });
    } catch (err) {
      this.fail(err);
    }
  }

  private async launch(extra: string[]) {
    this.close();
    const claude = await findCli("claude");
    if (!claude) throw new Error('Claude Code isn\'t installed (no "claude" command found)');
    const env = await cliEnv();
    const args = [
      "-p",
      "--input-format=stream-json",
      "--output-format=stream-json",
      "--verbose",
      "--include-partial-messages",
      // Summaries of its thinking stream in, so a long think shows what it's weighing instead of a blank wait.
      ...((await canSummarizeThinking(claude, env)) ? ["--thinking-display", "summarized"] : []),
      "--permission-prompt-tool=stdio",
      "--mcp-config",
      JSON.stringify({ mcpServers: { beatsheet: MCP_SERVER } }),
      "--strict-mcp-config",
      ...(readSettings().chrome ? ["--chrome"] : ["--no-chrome"]),
      ...permissionArgs(readSettings().autonomy, readSettings().chrome),
      ...extra,
    ];
    const child = spawnCli(claude, args, { cwd: REPO, env, stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    this.buffer = "";
    this.stderr = "";
    this.watchdog = setInterval(() => this.checkQuiet(), 30_000);
    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => this.consume(chunk));
    child.stderr!.on("data", (d: Buffer) => (this.stderr = (this.stderr + d.toString()).slice(-4000)));
    child.on("error", (err) => this.child === child && this.fail(new Error(`Couldn't start Claude Code: ${err.message}`)));
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = undefined;
      const why = this.stderr.trim().split("\n").pop();
      this.fail(new Error(`Claude Code stopped (${signal ?? code})${why ? `: ${why}` : ""}`));
    });
  }

  async send(text: string) {
    if (!this.child) throw new Error("No Claude Code session open");
    this.upsert({ id: randomUUID(), kind: "user", status: "done", ...readStudioMessage(text) });
    this.set({ status: "running", error: undefined });
    this.heard();
    this.write({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, session_id: this.view.sessionId ?? "" });
  }

  async interrupt() {
    if (this.child) this.write({ type: "control_request", request_id: `beatsheet-${++this.controlSeq}`, request: { subtype: "interrupt" } });
  }

  async decide(approvalId: string, choiceId: string) {
    const w = this.waiting.get(approvalId);
    if (!w) return;
    const allow = { behavior: "allow", updatedInput: w.input, toolUseID: approvalId };
    const response =
      choiceId === "deny"
        ? { behavior: "deny", message: "The person declined this in the studio.", toolUseID: approvalId }
        : choiceId === "session"
          ? { ...allow, updatedPermissions: [{ type: "addRules", rules: [{ toolName: w.toolName }], behavior: "allow", destination: "session" }] }
          : allow;
    this.write({ type: "control_response", response: { subtype: "success", request_id: w.requestId, response } });
    this.waiting.delete(approvalId);
    this.set({ approvals: this.view.approvals.filter((a) => a.id !== approvalId) });
  }

  stop() {
    this.close();
    this.replace({ status: "off" });
  }

  private close() {
    const child = this.child;
    this.child = undefined;
    clearInterval(this.watchdog);
    child?.kill();
    this.waiting.clear();
    this.streamItems.clear();
  }

  private write(obj: unknown) {
    this.child?.stdin?.write(JSON.stringify(obj) + "\n");
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    this.heard();
    let end: number;
    while ((end = this.buffer.indexOf("\n")) !== -1) {
      const raw = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 1);
      if (!raw) continue;
      try {
        this.onLine(JSON.parse(raw) as Line);
      } catch (err) {
        if (!(err instanceof SyntaxError)) this.set({ error: message(err) });
      }
    }
  }

  private onLine(l: Line) {
    switch (l.type) {
      case "system":
        if (l.subtype === "init") {
          const broken = l.mcp_servers?.find((s) => s.name === "beatsheet" && s.status !== "connected");
          const chrome = readSettings().chrome ? l.mcp_servers?.find((s) => s.name === "claude-in-chrome") : undefined;
          const noChrome =
            readSettings().chrome && (!chrome || chrome.status !== "connected")
              ? `Your Chrome isn't connected (${chrome?.status ?? "not found"}): open Chrome with the Claude in Chrome extension signed in, then start a new session.`
              : undefined;
          this.set({ sessionId: l.session_id ?? this.view.sessionId, model: l.model ?? this.view.model, error: broken ? `beatsheet's tools didn't load (${broken.status})` : noChrome });
        }
        return;
      case "stream_event":
        this.working();
        return this.onStream(l.event!);
      case "assistant":
        this.working();
        return this.onAssistant(l.message!);
      case "user":
        return this.onToolResults(l.message?.content);
      case "result":
        // The CLI's turn is over. Messages sent while it worked were either folded into that turn or start the next
        // one, which shows up as new output (see working), so there's nothing to count.
        for (const item of this.view.items) if (item.status === "running" && item.kind !== "tool") this.upsert({ ...item, status: "done" });
        this.set({ status: "idle", error: l.is_error || l.subtype?.startsWith("error") ? (l.result ?? l.subtype ?? "The turn failed") : undefined });
        return;
      case "control_request":
        return this.onControl(l);
    }
  }

  /** Output means a turn is under way, including one for a message the CLI had queued. */
  private working() {
    if (this.view.status === "idle") this.set({ status: "running", error: undefined });
  }

  /**
   * A safety net for a turn the studio thinks is still going after a quiet minute: if the session's own transcript
   * says the turn ended (and nothing is queued after it), it did.
   */
  private checkQuiet() {
    if (this.view.status !== "running" || this.view.approvals.length || Date.now() - this.lastHeard < 60_000 || !this.view.sessionId) return;
    if (this.view.items.some((x) => x.kind === "tool" && x.status === "running")) return;
    const file = join(TRANSCRIPTS, `${this.view.sessionId}.jsonl`);
    if (existsSync(file) && turnEnded(file)) {
      for (const item of this.view.items) if (item.status === "running") this.upsert({ ...item, status: "done" });
      this.set({ status: "idle" });
    }
  }

  private onStream(e: NonNullable<Line["event"]>) {
    if (e.type === "message_start") {
      this.streamMsg = e.message!.id;
      this.streamed.add(this.streamMsg);
      this.streamItems.clear();
      return;
    }
    const at = this.streamItems.get(e.index ?? -1);
    if (e.type === "content_block_start") {
      const b = e.content_block!;
      const id = b.type === "tool_use" ? b.id! : `${this.streamMsg}#${e.index}`;
      this.streamItems.set(e.index!, { id, json: b.type === "tool_use" ? "" : undefined });
      if (b.type === "text") this.upsert({ id, kind: "assistant", status: "running", text: "" });
      else if (b.type === "thinking") this.upsert({ id, kind: "reasoning", status: "running", text: "" });
      else if (b.type === "tool_use") this.upsert({ id, kind: "tool", status: "running", ...splitTool(b.name) });
      return;
    }
    if (!at) return;
    if (e.type === "content_block_delta") {
      const d = e.delta!;
      if (d.type === "text_delta") this.append(at.id, "text", d.text ?? "");
      else if (d.type === "thinking_delta") this.append(at.id, "text", d.thinking ?? "");
      else if (d.type === "input_json_delta") at.json = (at.json ?? "") + (d.partial_json ?? "");
      return;
    }
    if (e.type === "content_block_stop") {
      const item = this.view.items.find((x) => x.id === at.id);
      if (!item) return;
      if (item.kind === "tool") {
        let args: unknown;
        try {
          args = JSON.parse(at.json || "{}");
        } catch {
          args = at.json;
        }
        this.upsert({ ...item, args, detail: item.server ? undefined : detailFor(args) });
      } else this.upsert({ ...item, status: "done" });
    }
  }

  /** Whole messages: authoritative tool inputs, and text the stream didn't carry. */
  private onAssistant(m: NonNullable<Line["message"]>) {
    const blocks = Array.isArray(m.content) ? m.content : [];
    blocks.forEach((b, i) => {
      if (b.type === "tool_use") {
        const prev = this.view.items.find((x) => x.id === b.id);
        this.upsert({ id: b.id!, kind: "tool", status: prev?.status ?? "running", ...splitTool(b.name), args: b.input, detail: b.name?.startsWith("mcp__") ? undefined : detailFor(b.input) });
      } else if (!this.streamed.has(m.id ?? "")) {
        if (b.type === "text") this.upsert({ id: `${m.id}#t${i}`, kind: "assistant", status: "done", text: b.text });
        else if (b.type === "thinking") this.upsert({ id: `${m.id}#t${i}`, kind: "reasoning", status: "done", text: b.thinking });
      }
    });
  }

  private onToolResults(content: unknown) {
    if (!Array.isArray(content)) return;
    for (const b of content as Block[]) {
      if (b.type !== "tool_result" || !b.tool_use_id) continue;
      const item = this.view.items.find((x) => x.id === b.tool_use_id);
      if (item) this.upsert({ ...item, status: b.is_error ? "failed" : "done", error: b.is_error ? blockText(b.content).slice(0, 300) : undefined });
    }
  }

  private onControl(l: Line) {
    const r = l.request!;
    if (r.subtype !== "can_use_tool") {
      // Nothing else is ours to answer; say so rather than leave the CLI waiting.
      this.write({ type: "control_response", response: { subtype: "error", request_id: l.request_id, error: `beatsheet doesn't handle ${r.subtype}` } });
      return;
    }
    const id = r.tool_use_id ?? l.request_id!;
    // Working without asking (set in Settings, maybe after this session started): beatsheet says yes itself, and to
    // the rest of the tool's uses this session. Never to anything that reads keys.
    if (readSettings().autonomy === "free" && !touchesKeys(r.input)) {
      const rules = [{ type: "addRules", rules: [{ toolName: r.tool_name }], behavior: "allow", destination: "session" }];
      this.write({ type: "control_response", response: { subtype: "success", request_id: l.request_id, response: { behavior: "allow", updatedInput: r.input ?? {}, toolUseID: id, updatedPermissions: rules } } });
      return;
    }
    const { tool, server } = splitTool(r.tool_name);
    const card: AgentApproval = {
      id,
      title: r.title ?? `Claude wants to use ${server ? `${server}'s ${tool}` : tool}`,
      detail: detailFor(r.input) ?? r.description ?? r.decision_reason,
      choices: [
        { id: "allow", label: "Allow", primary: true },
        { id: "session", label: "Allow for this session" },
        { id: "deny", label: "Deny" },
      ],
    };
    this.waiting.set(id, { requestId: l.request_id!, toolName: r.tool_name!, input: r.input ?? {} });
    this.set({ approvals: [...this.view.approvals.filter((a) => a.id !== id), card] });
  }
}

/** Whether this CLI takes --thinking-display (a hidden flag), asked without a model call: it fails fast either way. */
const thinkingFlag = new Map<string, Promise<boolean>>();
function canSummarizeThinking(claude: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  let known = thinkingFlag.get(claude);
  if (!known) {
    known = new Promise((resolve) => {
      const child = spawnCli(claude, ["-p", "--thinking-display", "summarized"], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      child.stdout!.on("data", (d) => (out += d));
      child.stderr!.on("data", (d) => (out += d));
      const timer = setTimeout(() => child.kill(), 15_000);
      child.on("error", () => resolve(false));
      child.on("close", () => (clearTimeout(timer), resolve(/input must be provided/i.test(out) && !/unknown option|invalid/i.test(out))));
    });
    thinkingFlag.set(claude, known);
  }
  return known;
}

/** The session's transcript ends on a finished reply, with no message queued after it. */
export function turnEnded(file: string): boolean {
  const lines = readTail(file).split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let l: Line;
    try {
      l = JSON.parse(lines[i]!) as typeof l;
    } catch {
      continue;
    }
    if (l.isSidechain || l.isMeta) continue;
    // A message queued, taken up, or a tool's result after the last reply: there's more to come.
    if (l.type === "queue-operation" || l.type === "user") return false;
    if (l.type === "assistant") return (l.message as { stop_reason?: string } | undefined)?.stop_reason === "end_turn";
  }
  return false;
}

// ---- Transcripts on disk, for "resume".
function readTail(file: string, bytes = 256 * 1024): string {
  const fd = openSync(file, "r");
  try {
    const size = statSync(file).size;
    const buf = Buffer.alloc(Math.min(bytes, size));
    return buf.subarray(0, readSync(fd, buf, 0, buf.length, size - buf.length)).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function readHead(file: string, bytes = 256 * 1024): string {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    return buf.subarray(0, readSync(fd, buf, 0, bytes, 0)).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function transcriptHead(file: string): { prompt?: string; model?: string } {
  if (!existsSync(file)) return {};
  const out: { prompt?: string; model?: string } = {};
  for (const raw of readHead(file).split("\n")) {
    try {
      const l = JSON.parse(raw) as Line;
      if (l.type === "user" && !l.isMeta && !out.prompt) {
        const text = blockText(l.message?.content);
        if (text && !text.startsWith("<")) out.prompt = text;
      }
      if (l.type === "assistant") out.model ??= l.message?.model;
    } catch {
      // a line cut off at the read boundary
    }
    if (out.prompt && out.model) break;
  }
  return out;
}

function transcriptItems(file: string): AgentItem[] {
  const items: AgentItem[] = [];
  const tools = new Map<string, AgentItem>();
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    let l: Line;
    try {
      l = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    if (l.isMeta || l.isSidechain || !l.message) continue;
    const content = l.message.content;
    if (l.type === "user") {
      if (typeof content === "string" || (Array.isArray(content) && content.some((b) => b.type === "text"))) {
        const text = blockText(content);
        if (text && !text.startsWith("<")) items.push({ id: randomUUID(), kind: "user", status: "done", ...readStudioMessage(text) });
      }
      for (const b of Array.isArray(content) ? content : []) {
        const t = b.type === "tool_result" ? tools.get(b.tool_use_id!) : undefined;
        if (t) Object.assign(t, { status: b.is_error ? "failed" : "done", error: b.is_error ? blockText(b.content).slice(0, 300) : undefined });
      }
    } else if (l.type === "assistant" && Array.isArray(content)) {
      for (const b of content) {
        if (b.type === "text" && b.text) items.push({ id: randomUUID(), kind: "assistant", status: "done", text: b.text });
        else if (b.type === "thinking" && b.thinking) items.push({ id: randomUUID(), kind: "reasoning", status: "done", text: b.thinking });
        else if (b.type === "tool_use") {
          const t: AgentItem = { id: b.id!, kind: "tool", status: "stopped", ...splitTool(b.name), args: b.input, detail: b.name?.startsWith("mcp__") ? undefined : detailFor(b.input) };
          tools.set(b.id!, t);
          items.push(t);
        }
      }
    }
  }
  return items;
}
