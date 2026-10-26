/**
 * Muse Code, hosted with `muse serve` and spoken to over the Muse Session Protocol. A trusted workspace loads
 * beatsheet's tools from .mcp.json, plus AGENTS.md and the recipes in .agents/skills.
 */
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { REPO } from "../paths.ts";
import { readSettings } from "../settings.ts";
import { CHROME_DEVTOOLS, findCli } from "./cli.ts";
import { StdioRpc, uuid7 } from "./rpc.ts";
import { AgentAdapter, message, readStudioMessage, studioSession, touchesKeys, type AgentApproval, type AgentCheck, type AgentItem, type AgentModel, type AgentSessionSummary } from "./session.ts";

type MspItem = {
  itemId: string;
  kind: string;
  status: string;
  revision: number;
  text?: string;
  summary?: string[];
  tool?: string;
  args?: string;
  displayText?: string;
  fallbackText?: string;
  failureReason?: string;
  objective?: string;
  commandText?: string;
};
type MspApproval = {
  approvalId: string;
  currentRequirementId: unknown;
  toolName: string;
  subject: { kind: string; toolName?: string; command?: string; path?: string; target?: string };
  availableChoices: { choiceId: string; label: string; decision: string }[];
};

/** Muse's own housekeeping (reminders, hooks) that the studio doesn't show. */
const HIDDEN = new Set(["reminderChild", "hookRun"]);
const STATUS: Record<string, AgentItem["status"]> = { inProgress: "running", completed: "done", failed: "failed" };

function toItem(x: MspItem): AgentItem | undefined {
  if (HIDDEN.has(x.kind)) return undefined;
  const base = { id: x.itemId, rev: x.revision, status: STATUS[x.status] ?? "stopped", error: x.status === "completed" ? undefined : x.failureReason };
  switch (x.kind) {
    case "userMessage":
      // The studio's own label isn't kept in Muse's history; read it from the message either way.
      return { ...base, kind: "user", ...readStudioMessage(x.text ?? "") };
    case "agentMessage":
      return { ...base, kind: "assistant", text: x.text };
    case "reasoning":
      return { ...base, kind: "reasoning", text: x.text, summary: x.summary };
    case "toolCall": {
      const m = x.tool?.match(/^mcp__(.+?)__(.+)$/);
      let args: unknown = x.args;
      try {
        args = JSON.parse(x.args ?? "");
      } catch {
        // Muse passes the model's arguments verbatim; they aren't always JSON.
      }
      return { ...base, kind: "tool", tool: m ? m[2] : x.tool, server: m?.[1], args };
    }
    case "userShell":
      return { ...base, kind: "tool", tool: "shell", detail: x.commandText };
    case "subagent":
      return { ...base, kind: "tool", tool: "helper", detail: x.objective };
    default:
      return x.fallbackText ? { ...base, kind: "notice", text: x.fallbackText } : undefined;
  }
}

function toApproval(a: MspApproval): AgentApproval {
  const s = a.subject;
  const verb = s.kind === "shell" ? "run" : s.kind === "fileAccess" ? "use a file" : s.kind === "network" ? "go online" : "use";
  return {
    id: a.approvalId,
    title: `Muse wants to ${verb}`,
    detail: s.command ?? s.path ?? s.target ?? s.toolName ?? a.toolName,
    choices: a.availableChoices.map((c) => ({ id: c.choiceId, label: c.label, primary: c.decision === "approved" })),
  };
}

/** "muse-wonder-full-1.0" → "Muse Wonder Full 1.0". */
const modelLabel = (id: string) =>
  "Muse " +
  id
    .replace(/^muse-/, "")
    .split("-")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");

/**
 * Tools a session gets beyond beatsheet's own (which come from the workspace's .mcp.json): with "Use my Chrome" on,
 * Chrome DevTools MCP attached to the person's running Chrome. Optional, so a Chrome that isn't set up for it doesn't
 * stop the session starting.
 */
function sessionConfig() {
  if (!readSettings().chrome) return undefined;
  return { mcpServers: { "chrome-devtools": { transport: "stdio" as const, command: CHROME_DEVTOOLS.command, args: CHROME_DEVTOOLS.args, mode: "optional" as const } } };
}

export class MuseAdapter extends AgentAdapter {
  readonly id = "muse" as const;
  private rpc?: StdioRpc;
  private starting?: Promise<StdioRpc>;
  /** The raw approvals behind the cards, for the requirement id `approval/decide` wants. */
  private pending = new Map<string, MspApproval>();
  private named = false;

  private async host(): Promise<StdioRpc> {
    if (this.rpc && !this.rpc.closed) return this.rpc;
    this.starting ??= (async () => {
      const muse = await findCli("muse");
      if (!muse) throw new Error('Muse Code isn\'t installed (no "muse" command found)');
      const rpc = new StdioRpc("Muse");
      rpc.on("notification", (m: string, p: Record<string, unknown>) => this.onEvent(m, p));
      // Approvals and input prompts arrive as requests but are answered with commands; refuse anything else.
      rpc.on("request", (id, method: string) => !["approval/request", "userInput/request"].includes(method) && rpc.refuse(id));
      rpc.on("closed", (err: Error) => this.rpc === rpc && err.message !== "closed" && this.fail(err));
      rpc.spawn(muse, ["serve", "--trust-workspace"], { cwd: REPO });
      await rpc.request("initialize", { clientInfo: { name: "beatsheet_studio", title: "beatsheet studio", version: "0.1.0" }, capabilities: { requestedCapabilities: ["sessionMcp"] } });
      rpc.notify("initialized", {});
      this.rpc = rpc;
      return rpc;
    })().finally(() => (this.starting = undefined));
    return this.starting;
  }

  async models(): Promise<AgentModel[]> {
    const rpc = await this.host();
    const r = await rpc.request<{ models: { modelId: string; isDefault?: boolean; releaseDate?: string }[] }>("model/list", {});
    return r.models.map((m) => ({ id: m.modelId, label: modelLabel(m.modelId), default: m.isDefault }));
  }

  async check(): Promise<AgentCheck> {
    const rpc = await this.host();
    const used = async () => (await rpc.request<{ usage?: { window?: { usedPercent: number } } }>("usage/read", {})).usage;
    // Usage is only known once this host has talked to the model, so first time round ask for one word, in a scratch
    // session outside the project so it doesn't show up as a beatsheet session. (Muse refuses a workspace that is a
    // symlink, and /tmp is one, so the real path.)
    let usage = await used();
    if (!usage) {
      const r = await rpc.request<{ session: { sessionId: string } }>("session/start", { commandId: uuid7(), workspaceRoot: realpathSync(tmpdir()) });
      const id = r.session.sessionId;
      const done = new Promise<{ terminal?: string; error?: { message?: string } }>((resolve) => {
        const on = (m: string, p: Record<string, unknown>) => {
          if (m !== "turn/completed" || p.sessionId !== id) return;
          rpc.off("notification", on);
          resolve(p as { terminal?: string; error?: { message?: string } });
        };
        rpc.on("notification", on);
      });
      await rpc.request("turn/start", { commandId: uuid7(), sessionId: id, input: [{ type: "text", text: "Reply with just the word OK." }] });
      const end = await Promise.race([done, new Promise<{ terminal: string; error: { message: string } }>((r) => setTimeout(() => r({ terminal: "failed", error: { message: "Muse didn't answer in time" } }), 60_000))]);
      if (end.terminal !== "completed") return { ok: false, detail: /auth|login|sign|token|credential/i.test(end.error?.message ?? "") ? "Not signed in" : (end.error?.message ?? "Muse couldn't answer") };
      usage = await used();
    }
    return { ok: true, detail: usage?.window ? `Signed in · ${usage.window.usedPercent}% of your current usage window used` : "Signed in" };
  }

  async sessions(): Promise<AgentSessionSummary[]> {
    const rpc = await this.host();
    const r = await rpc.request<{ sessions: { sessionId: string; name?: string; firstUserPrompt?: string; modelId?: string | null; lastActivityAt?: string; updatedAt?: string }[] }>(
      "session/list",
      { workspaceRoot: REPO, limit: 40 },
    );
    return r.sessions.flatMap((s) => studioSession({ id: s.sessionId, updatedAt: s.lastActivityAt ?? s.updatedAt ?? "", name: s.name, model: s.modelId ?? undefined, prompt: s.firstUserPrompt }) ?? []);
  }

  async start(opts: { model?: string; project?: string; cut?: string }) {
    this.replace({ status: "starting", project: opts.project, cut: opts.cut, model: opts.model });
    try {
      const rpc = await this.host();
      const r = await rpc.request<{ session: { sessionId: string; name?: string; modelId?: string | null } }>("session/start", { commandId: uuid7(), modelId: opts.model, workspaceRoot: REPO, config: sessionConfig() });
      this.named = !!r.session.name;
      this.set({ status: "idle", sessionId: r.session.sessionId, name: r.session.name, model: r.session.modelId ?? opts.model });
    } catch (err) {
      this.fail(err);
    }
  }

  async resume(sessionId: string, project?: string, cut?: string) {
    this.replace({ status: "starting", project, cut });
    try {
      const rpc = await this.host();
      const r = await rpc.request<{ session: { sessionId: string; name?: string; modelId?: string | null; status?: string }; history: { items: MspItem[] | null } }>(
        "session/resume",
        { commandId: uuid7(), sessionId, history: "inline", config: sessionConfig() },
        120_000,
      );
      this.named = !!r.session.name;
      this.replace({
        status: r.session.status === "running" ? "running" : "idle",
        sessionId: r.session.sessionId,
        name: r.session.name,
        model: r.session.modelId ?? undefined,
        project,
        cut,
        items: (r.history.items ?? []).flatMap((x) => toItem(x) ?? []),
      });
      await this.syncApprovals();
    } catch (err) {
      this.fail(err);
    }
  }

  async send(text: string) {
    const rpc = await this.host();
    if (!this.view.sessionId) throw new Error("No Muse session open");
    await rpc.request("turn/start", { commandId: uuid7(), sessionId: this.view.sessionId, input: [{ type: "text", text }], displayText: readStudioMessage(text).display, ifBusy: "queue" });
  }

  async interrupt() {
    if (this.rpc && this.view.sessionId) await this.rpc.request("turn/interrupt", { commandId: uuid7(), sessionId: this.view.sessionId });
  }

  async decide(approvalId: string, choiceId: string) {
    const a = this.pending.get(approvalId);
    if (!a || !this.rpc || !this.view.sessionId) return;
    await this.rpc.request("approval/decide", { commandId: uuid7(), sessionId: this.view.sessionId, approvalId, choiceId, requirementId: a.currentRequirementId });
  }

  stop() {
    const rpc = this.rpc;
    this.rpc = undefined;
    rpc?.close();
    this.pending.clear();
    this.replace({ status: "off" });
  }

  /** Muse's reviewer settles most approvals itself; the pending list holds only the ones waiting on a person. */
  private async syncApprovals() {
    const sessionId = this.view.sessionId;
    if (!this.rpc || !sessionId) return;
    const r = await this.rpc.request<{ approvals?: MspApproval[] }>("approval/listPending", { sessionId }).catch(() => undefined);
    if (!r || this.view.sessionId !== sessionId) return;
    // Working without asking (Settings → Agent): beatsheet says yes for the person, never to anything that reads keys.
    const free = readSettings().autonomy === "free";
    const list: MspApproval[] = [];
    for (const a of r.approvals ?? []) {
      // Taking control of another app (its computer use) is always the person's call, like each site in their Chrome.
      const control = a.subject?.kind === "process" || /computer|cua|screen/i.test(a.subject?.toolName ?? "");
      if (free && !control && !touchesKeys(a.subject)) void this.approve(a);
      else list.push(a);
    }
    this.pending = new Map(list.map((a) => [a.approvalId, a]));
    if (list.map((a) => a.approvalId).join() !== this.view.approvals.map((a) => a.id).join()) this.set({ approvals: list.map(toApproval) });
  }

  /**
   * beatsheet's own tools are what the session is for, and every write through them is validated and versioned, so
   * the studio allows each one for the session the first time it comes up. (Muse's reviewer still finishes first.)
   */
  private async allowOwnTool(a: MspApproval) {
    if (a.subject?.toolName?.startsWith("mcp__beatsheet__")) await this.approve(a);
  }

  /** Says yes to an approval, for the rest of the session where Muse offers that. */
  private async approve(a: MspApproval) {
    if (!this.rpc || !this.view.sessionId) return;
    const choice = a.availableChoices.find((c) => c.decision === "approvedForSession") ?? a.availableChoices.find((c) => c.decision === "approved");
    if (!choice) return;
    await this.rpc
      .request("approval/decide", { commandId: uuid7(), sessionId: this.view.sessionId, approvalId: a.approvalId, choiceId: choice.choiceId, requirementId: a.currentRequirementId })
      .catch(() => undefined); // the reviewer got there first
  }

  /** Muse names a session after it starts; pick the name up from the session list. */
  private async fetchName() {
    const id = this.view.sessionId;
    const rpc = this.rpc;
    if (!rpc || !id) return;
    const r = await rpc.request<{ sessions: { sessionId: string; name?: string }[] }>("session/list", { workspaceRoot: REPO, limit: 10 }).catch(() => undefined);
    const name = r?.sessions.find((x) => x.sessionId === id)?.name;
    if (name && this.view.sessionId === id) {
      this.named = true;
      this.set({ name });
    }
  }

  private onEvent(method: string, p: Record<string, unknown>) {
    if (p.sessionId && p.sessionId !== this.view.sessionId) return;
    this.heard();
    switch (method) {
      case "item/started":
      case "item/updated":
      case "item/completed": {
        const item = toItem(p.item as MspItem);
        if (item) this.upsert(item);
        return;
      }
      case "item/delta":
        return this.append(p.itemId as string, (p.field as string | undefined) ?? "text", p.delta as string);
      case "turn/started":
        return this.set({ status: "running" });
      case "turn/completed":
        if (!this.named) void this.fetchName();
        return this.set({ status: "idle", error: p.terminal === "failed" ? String((p.error as { message?: string } | undefined)?.message ?? "The turn failed") : undefined });
      case "session/statusChanged":
        if (p.status === "running" || p.status === "idle") this.set({ status: p.status });
        return;
      case "session/nameChanged":
        this.named = true;
        return this.set({ name: p.name as string });
      case "session/modelChanged":
        return this.set({ model: (p.modelId as string) ?? this.view.model });
      case "approval/request":
      case "approval/requested":
      case "approval/updated":
      case "approval/resolved":
        if (method === "approval/updated" && (p.change as { kind?: string } | undefined)?.kind === "reviewStarted") void this.allowOwnTool(p as unknown as MspApproval);
        void this.syncApprovals().catch((err) => this.set({ error: message(err) }));
        return;
    }
  }
}
