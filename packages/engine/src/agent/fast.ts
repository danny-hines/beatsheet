/**
 * Lightweight, single-turn agent calls using each provider's fast model tier (Haiku, mini/nano, Flash, fast Muse).
 * Runs tool-free in an isolated temp folder so quick UI decisions (like Make's Smart Prep) finish in seconds without
 * touching the cut's main conversation or turn state.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSettings } from "../settings.ts";
import { antigravityServer } from "./antigravity-server.ts";
import { thinkingOf } from "./antigravity.ts";
import { cliEnv, findCli, spawnCli } from "./cli.ts";
import { agentStudio, AGENT_IDS } from "./index.ts";
import { StdioRpc, uuid7, type RpcId } from "./rpc.ts";
import type { AgentId, AgentModel } from "./session.ts";

/** Picks the lightweight/fast model for a provider from its discovered model list. */
export function pickFastModel(agentId: AgentId, models: AgentModel[] = []): string | undefined {
  const real = models.filter((m) => m.id && m.id !== "default");
  const find = (re: RegExp) => real.find((m) => re.test(m.id) || re.test(m.label))?.id;
  switch (agentId) {
    case "claude":
      return find(/haiku/i) ?? find(/sonnet/i) ?? "claude-haiku-5-5";
    case "codex":
      return find(/nano|mini|spark|flash|lite/i) ?? real.find((m) => m.default)?.id;
    case "antigravity":
      return find(/flash[-_ ]?lite/i) ?? find(/flash/i) ?? find(/lite/i) ?? real.find((m) => m.default)?.id;
    case "muse":
      return find(/fast|lite|mini|flash|small/i) ?? real.find((m) => m.default)?.id;
  }
}

/** Resolves which agent and fast model to use for lightweight decisions. */
export async function resolveFastAgent(): Promise<{ agent: AgentId; model?: string } | undefined> {
  const settings = readSettings();
  const preferred = settings.agent?.id;
  const candidates: AgentId[] = preferred ? [preferred, ...AGENT_IDS.filter((id) => id !== preferred)] : [...AGENT_IDS];
  let chosen: AgentId | undefined;
  for (const id of candidates) {
    if (settings.checks[id]?.ok && (await findCli(id))) {
      chosen = id;
      break;
    }
  }
  if (!chosen) {
    for (const id of candidates) {
      if (await findCli(id)) {
        chosen = id;
        break;
      }
    }
  }
  if (!chosen) return undefined;
  if (chosen === preferred && settings.agent?.fastModel) return { agent: chosen, model: settings.agent.fastModel };
  const infos = await agentStudio().agents(true).catch(() => []);
  const info = infos.find((x) => x.id === chosen);
  return { agent: chosen, model: pickFastModel(chosen, info?.models) };
}

export type QuickAskResult = { text: string; agent: AgentId; model?: string };

/**
 * Runs a single-turn, tool-free prompt on the user's configured fast agent model.
 * Throws if no agent CLI is ready or if the call times out.
 */
export async function quickAsk(opts: { system: string; prompt: string; timeoutMs?: number }): Promise<QuickAskResult> {
  const resolved = await resolveFastAgent();
  if (!resolved) throw new Error("No agent CLI is installed or signed in.");
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const work = realpathSync(mkdtempSync(join(tmpdir(), "beatsheet-quick-")));
  try {
    const text =
      resolved.agent === "claude"
        ? await askClaude(work, resolved.model, opts.system, opts.prompt, timeoutMs)
        : resolved.agent === "codex"
          ? await askCodex(work, resolved.model, opts.system, opts.prompt, timeoutMs)
          : resolved.agent === "antigravity"
            ? await askAntigravity(work, resolved.model, opts.system, opts.prompt, timeoutMs)
            : await askMuse(work, resolved.model, opts.system, opts.prompt, timeoutMs);
    return { text, agent: resolved.agent, model: resolved.model };
  } finally {
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      // OS temp cleanup handles locked dirs on Windows
    }
  }
}

async function askClaude(work: string, model: string | undefined, system: string, prompt: string, timeoutMs: number): Promise<string> {
  const cli = await findCli("claude");
  if (!cli) throw new Error("Claude Code CLI not found");
  const args = ["-p", "--output-format", "json", "--no-session-persistence", "--tools", "", "--system-prompt", system, ...(model && model !== "default" ? ["--model", model] : [])];
  const env = await cliEnv();
  return new Promise<string>((resolve, reject) => {
    const child = spawnCli(cli, args, { cwd: work, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Fast model timed out"));
    }, timeoutMs);
    child.stdout!.on("data", (d) => (out += d));
    child.stderr!.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(err.trim() || `Claude exited with ${code}`));
      try {
        const parsed = JSON.parse(out) as { result?: string; is_error?: boolean };
        if (parsed.is_error) return reject(new Error(parsed.result || "Claude returned an error"));
        resolve(parsed.result ?? out);
      } catch {
        resolve(out.trim());
      }
    });
    child.stdin!.end(prompt);
  });
}

function waitRpc<T>(rpc: StdioRpc, done: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error("Fast model timed out")), timeoutMs)));
  const closed = new Promise<never>((_, reject) => rpc.once("closed", (err: Error) => reject(err)));
  return Promise.race([done, late, closed]).finally(() => {
    clearTimeout(timer);
    rpc.close();
  });
}

async function askCodex(work: string, model: string | undefined, system: string, prompt: string, timeoutMs: number): Promise<string> {
  const cli = await findCli("codex");
  if (!cli) throw new Error("Codex CLI not found");
  const rpc = new StdioRpc("CodexQuick");
  let said = "";
  const done = new Promise<string>((resolve, reject) => {
    rpc.on("notification", (m: string, p: { item?: { type: string; text?: string }; turn?: { status: string; error?: { message: string } | null } }) => {
      if (m === "item/completed" && p.item?.type === "agentMessage" && p.item.text) said = p.item.text;
      if (m === "turn/completed") {
        if (p.turn?.error?.message) return reject(new Error(p.turn.error.message));
        resolve(said);
      }
    });
    rpc.on("request", (id: RpcId) => rpc.respond(id, { decision: "decline" }));
  });
  return waitRpc(
    rpc,
    (async () => {
      rpc.spawn(cli, ["app-server"], { cwd: work, env: await cliEnv() });
      await rpc.request("initialize", { clientInfo: { name: "beatsheet_quick", title: "beatsheet quick", version: "0.1.0" }, capabilities: null });
      rpc.notify("initialized");
      const { thread } = await rpc.request<{ thread: { id: string } }>("thread/start", {
        ...(model && model !== "default" ? { model } : {}),
        cwd: work,
        approvalPolicy: "never",
        sandbox: "read-only",
        developerInstructions: system,
        config: { mcp_servers: {} },
      });
      await rpc.request("turn/start", { threadId: thread.id, input: [{ type: "text", text: prompt, text_elements: [] }] });
      return done;
    })(),
    timeoutMs,
  );
}

async function askAntigravity(work: string, model: string | undefined, system: string, prompt: string, timeoutMs: number): Promise<string> {
  const server = antigravityServer();
  if (!server) throw new Error("Antigravity server not installed");
  const rpc = new StdioRpc("AntigravityQuick");
  let said = "";
  rpc.on("notification", (m: string, p: { update?: { sessionUpdate?: string; content?: { type?: string; text?: string } } }) => {
    if (m === "session/update" && p.update?.sessionUpdate === "agent_message_chunk" && p.update.content?.text) said += p.update.content.text;
  });
  rpc.on("request", (id: RpcId) => rpc.respond(id, { outcome: { outcome: "cancelled" } }));
  return waitRpc(
    rpc,
    (async () => {
      rpc.spawn(server.command, server.args, { cwd: work, env: await cliEnv() });
      await rpc.request("initialize", { protocolVersion: 1, clientInfo: { name: "beatsheet_quick", version: "0.1.0" }, clientCapabilities: {} });
      const opened = await rpc.request<{ sessionId: string; configOptions?: { id: string; currentValue: string; options: { value: string; name: string; description?: string }[] }[] }>("session/new", {
        cwd: work,
        mcpServers: [],
      });
      if (model && model !== "default") {
        await rpc.request("session/set_config_option", { sessionId: opened.sessionId, configId: "model", value: model }).catch(() => {});
      }
      const levels = thinkingOf(opened);
      const low = levels.find((l) => /off|none|low|min/i.test(l.id) || /off|none|low|min/i.test(l.label));
      if (low) {
        const cfgId = opened.configOptions?.find((c) => /think|reason/i.test(c.id))?.id;
        if (cfgId) await rpc.request("session/set_config_option", { sessionId: opened.sessionId, configId: cfgId, value: low.id }).catch(() => {});
      }
      await rpc.request("session/prompt", { sessionId: opened.sessionId, prompt: [{ type: "text", text: `${system}\n\n${prompt}` }] });
      return said;
    })(),
    timeoutMs,
  );
}

async function askMuse(work: string, model: string | undefined, system: string, prompt: string, timeoutMs: number): Promise<string> {
  const cli = await findCli("muse");
  if (!cli) throw new Error("Muse Code CLI not found");
  const rpc = new StdioRpc("MuseQuick");
  let said = "";
  const done = new Promise<string>((resolve, reject) => {
    rpc.on("notification", (m: string, p: { item?: { kind?: string; text?: string }; error?: { message?: string } }) => {
      if (m === "item/completed" && p.item?.kind === "agentMessage" && p.item.text) said = p.item.text;
      if (m === "turn/completed") resolve(said);
      if (m === "turn/failed") reject(new Error(p.error?.message ?? "Muse fast turn failed"));
    });
    rpc.on("request", (id: RpcId) => rpc.respond(id, { decision: "denied" }));
  });
  return waitRpc(
    rpc,
    (async () => {
      rpc.spawn(cli, ["serve"], { cwd: work, env: await cliEnv() });
      await rpc.request("initialize", { protocolVersion: 1, clientInfo: { name: "beatsheet_quick", version: "0.1.0" } });
      const { sessionId } = await rpc.request<{ sessionId: string }>("session/create", {
        cwd: work,
        ...(model && model !== "default" ? { modelId: model } : {}),
      });
      await rpc.request("turn/start", { sessionId, requestId: uuid7(), input: `${system}\n\n${prompt}` });
      return done;
    })(),
    timeoutMs,
  );
}
