/**
 * Codex, hosted with `codex app-server` and the person's own ChatGPT sign-in. beatsheet's tools come in as an MCP server
 * in the thread's config; AGENTS.md comes from the workspace.
 */
import { inRepo, REPO } from "../paths.ts";
import { readSettings } from "../settings.ts";
import { CHROME_DEVTOOLS, cliEnv, codexHasChrome, findCli, MCP_SERVER } from "./cli.ts";
import { StdioRpc, uuid7, type RpcId } from "./rpc.ts";
import { AgentAdapter, message, planName, readStudioMessage, signedIn, studioSession, touchesKeys, type AgentApproval, type AgentCheck, type AgentItem, type AgentModel, type AgentSessionSummary } from "./session.ts";

type CodexItem = { type: string; id: string; [k: string]: unknown };
type Turn = { id: string; items: CodexItem[]; status: string; error: { message: string } | null };
type Thread = { id: string; preview: string; name: string | null; model: string | null; updatedAt: number; turns?: Turn[] };
/** ChatGPT's plan ids, as OpenAI names the plans. */
const PLANS: Record<string, string> = { free: "Free", go: "Go", plus: "Plus", pro: "Pro", prolite: "Pro Lite", team: "Team", business: "Business", enterprise: "Enterprise", edu: "Edu" };
/**
 * A request from Codex waiting on the person, with what answering each choice sends back (or, for one of several
 * questions, what to do with the answer).
 */
type Waiting = { rpcId: RpcId; card: AgentApproval; answers: Record<string, unknown>; then?: (answer: unknown) => void };
/** A question Codex asks the person mid-turn (request_user_input), with the options to pick from. */
type Question = { id: string; header: string; question: string; isOther: boolean; isSecret: boolean; options: { label: string; description: string }[] | null };

const STATUS: Record<string, AgentItem["status"]> = { inProgress: "running", completed: "done", failed: "failed", declined: "stopped" };

/** Codex wraps provider errors as JSON in the message; pull out the readable part. */
function readable(msg: string): string {
  try {
    const inner = JSON.parse(msg) as { error?: { message?: string } };
    return inner.error?.message ?? msg;
  } catch {
    return msg;
  }
}

function toItem(x: CodexItem): AgentItem | undefined {
  const status = STATUS[x.status as string] ?? "done";
  switch (x.type) {
    case "userMessage": {
      const text = (x.content as { type: string; text?: string }[]).flatMap((c) => (c.type === "text" && c.text ? [c.text] : [])).join("\n");
      return { id: x.id, kind: "user", status: "done", ...readStudioMessage(text) };
    }
    case "agentMessage":
      return { id: x.id, kind: "assistant", status: "done", text: x.text as string };
    case "reasoning": {
      const summary = x.summary as string[];
      return { id: x.id, kind: "reasoning", status: "done", summary: summary.length ? summary : undefined, text: (x.content as string[]).join("\n") || undefined };
    }
    case "plan":
      return { id: x.id, kind: "notice", status: "done", text: x.text as string };
    case "commandExecution":
      return { id: x.id, kind: "tool", tool: "shell", status, detail: x.command as string };
    case "fileChange":
      return { id: x.id, kind: "tool", tool: "edit files", status, detail: (x.changes as { path: string }[]).map((c) => inRepo(c.path)).join(", ") };
    case "mcpToolCall":
      return { id: x.id, kind: "tool", status, server: x.server as string, tool: x.tool as string, args: x.arguments, error: (x.error as { message: string } | null)?.message };
    case "webSearch":
      return { id: x.id, kind: "tool", tool: "web search", status, detail: x.query as string };
    case "imageGeneration":
      return { id: x.id, kind: "tool", tool: "image generation", status };
    default:
      return undefined;
  }
}

const choice = (id: string, label: string, primary = false) => ({ id, label, primary });

export class CodexAdapter extends AgentAdapter {
  readonly id = "codex" as const;
  private rpc?: StdioRpc;
  private starting?: Promise<StdioRpc>;
  private waiting = new Map<string, Waiting>();
  private turnId?: string;
  /** Messages sent while a turn runs go in after it. */
  private queue: string[] = [];

  private async host(): Promise<StdioRpc> {
    if (this.rpc && !this.rpc.closed) return this.rpc;
    this.starting ??= (async () => {
      const codex = await findCli("codex");
      if (!codex) throw new Error('Codex isn\'t installed (no "codex" command found)');
      const rpc = new StdioRpc("Codex");
      rpc.on("notification", (m: string, p: Record<string, unknown>) => this.onEvent(m, p));
      rpc.on("request", (id: RpcId, m: string, p: Record<string, unknown>) => this.onRequest(id, m, p));
      rpc.on("closed", (err: Error) => this.rpc === rpc && err.message !== "closed" && this.fail(err));
      rpc.spawn(codex, ["app-server"], { cwd: REPO, env: await cliEnv() });
      await rpc.request("initialize", { clientInfo: { name: "beatsheet_studio", title: "beatsheet studio", version: "0.1.0" }, capabilities: null });
      rpc.notify("initialized");
      this.rpc = rpc;
      return rpc;
    })().finally(() => (this.starting = undefined));
    return this.starting;
  }

  /**
   * What every thread gets: the workspace, beatsheet's tools, and edits allowed inside the workspace only. With autonomy
   * "free" it never stops to ask, staying inside that sandbox. With "Use my Chrome" on, Codex reaches the person's Chrome
   * through OpenAI's Chrome plugin when it has it, else through Chrome DevTools MCP.
   */
  private threadOptions(model?: string) {
    return {
      ...(model ? { model } : {}),
      cwd: REPO,
      approvalPolicy: readSettings().autonomy === "free" ? "never" : "on-request",
      sandbox: "workspace-write",
      config: { mcp_servers: { beatsheet: MCP_SERVER, ...(readSettings().chrome && !codexHasChrome() ? { "chrome-devtools": CHROME_DEVTOOLS } : {}) } },
    };
  }

  async models(): Promise<AgentModel[]> {
    const rpc = await this.host();
    const r = await rpc.request<{ data: { id: string; displayName: string; description: string; hidden: boolean; isDefault: boolean }[] }>("model/list", {});
    return r.data.filter((m) => !m.hidden).map((m) => ({ id: m.id, label: m.displayName, hint: m.description || undefined, default: m.isDefault }));
  }

  async check(): Promise<AgentCheck> {
    const rpc = await this.host();
    const r = await rpc.request<{ account: { type: string; email?: string; planType?: string } | null; requiresOpenaiAuth: boolean }>("account/read", { refreshToken: false });
    if (!r.account) return { ok: !r.requiresOpenaiAuth, detail: r.requiresOpenaiAuth ? "Not signed in" : "Ready" };
    const plan = r.account.type === "chatgpt" ? (r.account.planType ? `ChatGPT ${planName(r.account.planType, PLANS)}` : "ChatGPT") : "API key";
    return { ok: true, detail: signedIn(plan) };
  }

  async sessions(): Promise<AgentSessionSummary[]> {
    const rpc = await this.host();
    const r = await rpc.request<{ data: Thread[] }>("thread/list", { cwd: REPO, limit: 40, sourceKinds: ["appServer", "cli", "vscode", "exec"] });
    return r.data.flatMap(
      (t) => studioSession({ id: t.id, updatedAt: new Date(t.updatedAt * 1000).toISOString(), name: t.name ?? undefined, model: t.model ?? undefined, prompt: t.preview }) ?? [],
    );
  }

  async start(opts: { model?: string; project?: string; cut?: string }) {
    this.replace({ status: "starting", project: opts.project, cut: opts.cut, model: opts.model });
    try {
      const rpc = await this.host();
      // Codex falls back to the model in ~/.codex/config.toml, which the person's plan may not offer; pick from its own list.
      const model = opts.model ?? (await this.models()).find((m) => m.default)?.id;
      const r = await rpc.request<{ thread: Thread; model: string }>("thread/start", this.threadOptions(model));
      this.set({ status: "idle", sessionId: r.thread.id, name: r.thread.name ?? undefined, model: r.model });
    } catch (err) {
      this.fail(err);
    }
  }

  async resume(threadId: string, project?: string, cut?: string) {
    this.replace({ status: "starting", project, cut });
    try {
      const rpc = await this.host();
      const r = await rpc.request<{ thread: Thread; model: string }>("thread/resume", { threadId, ...this.threadOptions() }, 120_000);
      let raw = (r.thread.turns ?? []).flatMap((t) => t.items);
      if (!raw.length) raw = (await rpc.request<{ data: CodexItem[] }>("thread/items/list", { threadId, limit: 500 }).catch(() => ({ data: [] }))).data;
      this.replace({ status: "idle", sessionId: r.thread.id, name: r.thread.name ?? undefined, model: r.model, project, cut, items: raw.flatMap((x) => toItem(x) ?? []) });
    } catch (err) {
      this.fail(err);
    }
  }

  async send(text: string) {
    if (!this.view.sessionId) throw new Error("No Codex session open");
    if (this.view.status === "running") {
      this.queue.push(text);
      return;
    }
    const rpc = await this.host();
    this.set({ status: "running", error: undefined });
    try {
      const r = await rpc.request<{ turn: Turn }>("turn/start", { threadId: this.view.sessionId, clientUserMessageId: uuid7(), input: [{ type: "text", text, text_elements: [] }] });
      this.turnId = r.turn.id;
    } catch (err) {
      this.set({ status: "idle", error: message(err) });
      throw err;
    }
  }

  async interrupt() {
    this.queue = [];
    if (this.rpc && this.view.sessionId && this.turnId) await this.rpc.request("turn/interrupt", { threadId: this.view.sessionId, turnId: this.turnId });
  }

  async decide(approvalId: string, choiceId: string) {
    const w = this.waiting.get(approvalId);
    if (!w || !this.rpc) return;
    this.settle(approvalId);
    if (w.then) w.then(w.answers[choiceId]);
    else this.rpc.respond(w.rpcId, w.answers[choiceId]);
  }

  stop() {
    const rpc = this.rpc;
    this.rpc = undefined;
    rpc?.close();
    this.waiting.clear();
    this.queue = [];
    this.replace({ status: "off" });
  }

  private settle(approvalId: string) {
    if (!this.waiting.delete(approvalId)) return;
    this.set({ approvals: this.view.approvals.filter((a) => a.id !== approvalId) });
  }

  private ask(rpcId: RpcId, card: Omit<AgentApproval, "id">, answers: Record<string, unknown>, always = false) {
    // Working without asking: beatsheet says yes for the session itself, except to anything that reads keys, and to
    // what must always be the person's call.
    if (!always && readSettings().autonomy === "free" && !touchesKeys(card.detail) && (answers.session ?? answers.accept) !== undefined) return this.rpc!.respond(rpcId, answers.session ?? answers.accept);
    const id = String(rpcId);
    this.waiting.set(id, { rpcId, card: { id, ...card }, answers });
    this.set({ approvals: [...this.view.approvals.filter((a) => a.id !== id), { id, ...card }] });
  }

  /**
   * Codex asking the person something mid-turn, often to confirm a step in the browser or on the screen: each question
   * with options becomes a card, one after another, and the answers go back together. These are never answered for the
   * person, even when it works without asking. Secrets aren't typed in here, and open questions are sent back to chat.
   */
  private askQuestions(rpcId: RpcId, qs: Question[], got: Record<string, { answers: string[] }> = {}): void {
    const next = qs.find((q) => !got[q.id]);
    if (!next) {
      this.rpc?.respond(rpcId, { answers: got });
      return;
    }
    if (next.isSecret || !next.options?.length) {
      const why = next.isSecret ? "The person doesn't type secrets in here." : "The person can only pick from options here.";
      return this.askQuestions(rpcId, qs, { ...got, [next.id]: { answers: [`${why} Ask it in your reply instead.`] } });
    }
    const id = `${String(rpcId)}#${next.id}`;
    const card: AgentApproval = {
      id,
      title: next.header || "Codex is asking",
      detail: [next.question, ...next.options.map((o) => (o.description ? `${o.label}: ${o.description}` : ""))].filter(Boolean).join("\n"),
      choices: next.options.map((o, i) => ({ id: String(i), label: o.label, primary: i === 0 })),
    };
    const answers = Object.fromEntries(next.options.map((o, i) => [String(i), o.label]));
    this.waiting.set(id, { rpcId, card, answers, then: (label) => this.askQuestions(rpcId, qs, { ...got, [next.id]: { answers: [String(label)] } }) });
    this.set({ approvals: [...this.view.approvals.filter((a) => a.id !== id), card] });
  }

  private onRequest(rpcId: RpcId, method: string, p: Record<string, unknown>) {
    const rpc = this.rpc!;
    const decisions = (accept: unknown, session: unknown, decline: unknown) => ({ accept, session, decline });
    switch (method) {
      case "item/tool/requestUserInput":
        return this.askQuestions(rpcId, (p.questions as Question[] | undefined) ?? []);
      case "mcpServer/elicitation/request": {
        const meta = p._meta as { codex_approval_kind?: string; tool_params?: unknown } | null;
        const accept = (persist?: string) => ({ action: "accept", content: null, _meta: persist ? { persist } : null });
        // beatsheet's own tools are what the session is for; allow them for the session without asking.
        if (meta?.codex_approval_kind === "mcp_tool_call" && p.serverName === "beatsheet") return rpc.respond(rpcId, accept("session"));
        // Its browser and computer use (in the person's own Chrome, on their screen) asks the person about each site,
        // as Claude in Chrome does, even when it otherwise works without asking.
        const always = /^(node_repl|cua_repl|computer-use)$/.test(String(p.serverName)) || /\b(browser|computer) use\b/i.test(String(p.message ?? ""));
        return this.ask(
          rpcId,
          { title: String(p.message ?? `${p.serverName} is asking`), detail: meta?.tool_params ? JSON.stringify(meta.tool_params) : undefined, choices: [choice("accept", "Allow", true), choice("session", "Allow for this session"), choice("decline", "Decline")] },
          decisions(accept(), accept("session"), { action: "decline", content: null, _meta: null }),
          always,
        );
      }
      case "item/commandExecution/requestApproval":
        return this.ask(
          rpcId,
          { title: "Codex wants to run", detail: (p.command as string | undefined) ?? (p.reason as string | undefined), choices: [choice("accept", "Run", true), choice("session", "Allow for this session"), choice("decline", "Don't run")] },
          decisions({ decision: "accept" }, { decision: "acceptForSession" }, { decision: "decline" }),
        );
      case "item/fileChange/requestApproval":
        return this.ask(
          rpcId,
          { title: "Codex wants to change files", detail: (p.reason as string | undefined) ?? undefined, choices: [choice("accept", "Allow", true), choice("session", "Allow for this session"), choice("decline", "Decline")] },
          decisions({ decision: "accept" }, { decision: "acceptForSession" }, { decision: "decline" }),
        );
      case "item/permissions/requestApproval":
        return this.ask(
          rpcId,
          { title: "Codex wants more access", detail: (p.reason as string | null) ?? undefined, choices: [choice("accept", "Allow for this turn", true), choice("decline", "Decline")] },
          { accept: { permissions: p.permissions, scope: "turn" }, decline: { permissions: {}, scope: "turn" } },
        );
      default:
        return rpc.refuse(rpcId);
    }
  }

  private onEvent(method: string, p: Record<string, unknown>) {
    if (p.threadId && p.threadId !== this.view.sessionId) return;
    this.heard();
    switch (method) {
      case "item/started":
      case "item/completed": {
        const item = toItem(p.item as CodexItem);
        if (!item) return;
        // Messages and reasoning stream in; until they complete they're still being written.
        this.upsert(method === "item/started" && item.kind !== "user" ? { ...item, status: "running" } : item);
        return;
      }
      case "item/agentMessage/delta":
        return this.append(p.itemId as string, "text", p.delta as string);
      case "item/reasoning/summaryTextDelta":
        return this.append(p.itemId as string, `summary.${p.summaryIndex as number}`, p.delta as string);
      case "turn/started":
        this.turnId = (p.turn as Turn).id;
        return this.set({ status: "running" });
      case "turn/completed": {
        const turn = p.turn as Turn;
        this.turnId = undefined;
        this.set({ status: "idle", error: turn.status === "failed" ? readable(turn.error?.message ?? "The turn failed") : undefined });
        const next = this.queue.shift();
        if (next) void this.send(next).catch((err) => this.set({ error: message(err) }));
        return;
      }
      case "error":
        if (!p.willRetry) this.set({ error: readable((p.error as { message: string }).message) });
        return;
      case "thread/name/updated":
        return this.set({ name: p.threadName as string | undefined });
      case "serverRequest/resolved":
        return this.settle(String(p.requestId));
    }
  }
}
