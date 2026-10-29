import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pickBuild, platformKey } from "../src/agent/antigravity-server.ts";
import { AntigravityAdapter, housekeeping, indexedSessions, modelsOf, scope, toolName, type ToolCall } from "../src/agent/antigravity.ts";
import { touchesKeys } from "../src/agent/session.ts";

/** An Antigravity adapter on a session, wired to a fake ACP server, to see what reaches the person and what goes back. */
function harness(Adapter = AntigravityAdapter) {
  const a = new Adapter();
  const sent: { id: unknown; result: unknown }[] = [];
  const inner = a as unknown as { rpc: unknown; onRequest(id: unknown, method: string, p: Record<string, unknown>): void; onEvent(method: string, p: Record<string, unknown>): void };
  inner.rpc = { respond: (id: unknown, result: unknown) => sent.push({ id, result }), refuse: () => {}, notify: () => {} };
  a.view = { ...a.view, status: "running", sessionId: "s1" };
  const update = (update: Record<string, unknown>, sessionId = "s1") => inner.onEvent("session/update", { sessionId, update });
  const ask = (id: number, toolCall: ToolCall) => inner.onRequest(id, "session/request_permission", { sessionId: "s1", toolCall, options: OPTIONS });
  return { a, sent, update, ask };
}

/** The adapter as it is with the person's autonomy setting at `level` (settings are read from BEATSHEET_HOME). */
async function withAutonomy(level: "ask" | "free") {
  const home = mkdtempSync(join(tmpdir(), "beatsheet-agy-"));
  writeFileSync(join(home, "settings.json"), JSON.stringify({ autonomy: level, services: {}, checks: {} }));
  process.env.BEATSHEET_HOME = home;
  vi.resetModules();
  const { AntigravityAdapter: Fresh } = await import("../src/agent/antigravity.ts");
  delete process.env.BEATSHEET_HOME;
  return harness(Fresh);
}

// As agy_acp_server 1.4.4 sent them.
const OPTIONS = [
  { optionId: "allow_always", name: "Allow Always (risky)", kind: "allow_always" },
  { optionId: "allow", name: "Allow", kind: "allow_once" },
  { optionId: "deny", name: "Deny", kind: "reject_once" },
];
const LIST_PROJECTS: ToolCall = {
  toolCallId: "1dd863b52ebc4b0080a12834acc30aba",
  title: "beatsheet_list_projects",
  kind: "other",
  status: "pending",
  rawInput: { arguments: {} },
  _meta: { mcp: { tool: "list_projects", server: "beatsheet" } },
};
const run = (id: string, command: string): ToolCall => ({ toolCallId: id, title: command, kind: "execute", status: "pending", rawInput: { CommandLine: command, Cwd: "C:\\Users\\me\\beatsheet" } });
const chunk = (sessionUpdate: string, text: string) => ({ sessionUpdate, content: { type: "text", text } });

describe("what a hosted Antigravity may do without asking", () => {
  it("runs beatsheet's tools without a card, once at a time, never for good", () => {
    const { a, sent, ask } = harness();
    ask(0, LIST_PROJECTS);
    expect(sent).toEqual([{ id: 0, result: { outcome: { outcome: "selected", optionId: "allow" } } }]);
    expect(a.view.approvals).toEqual([]);
  });

  it("asks before a command, and remembers 'for this session' itself", async () => {
    const { a, sent, ask } = await withAutonomy("ask");
    ask(1, run("c1", "npm install left-pad"));
    expect(sent).toEqual([]);
    expect(a.view.approvals).toEqual([
      {
        id: "1",
        title: "Antigravity wants to run",
        detail: "npm install left-pad",
        choices: [
          { id: "accept", label: "Run", primary: true },
          { id: "session", label: "Allow for this session" },
          { id: "decline", label: "Don't run" },
        ],
      },
    ]);
    await a.decide("1", "session");
    expect(sent).toEqual([{ id: 1, result: { outcome: { outcome: "selected", optionId: "allow" } } }]);
    // The same command again goes through; another one still asks.
    ask(2, run("c2", "npm install left-pad"));
    expect(sent).toHaveLength(2);
    ask(3, run("c3", "rm -rf out"));
    expect(sent).toHaveLength(2);
    await a.decide("3", "decline");
    expect(sent[2]).toEqual({ id: 3, result: { outcome: { outcome: "selected", optionId: "deny" } } });
  });

  it("says yes itself when the person lets it work without asking, but never to keys", async () => {
    const { a, sent, ask } = await withAutonomy("free");
    ask(4, run("c4", "ffmpeg -i in.mov out.mp4"));
    expect(sent).toEqual([{ id: 4, result: { outcome: { outcome: "selected", optionId: "allow" } } }]);
    ask(5, run("c5", "Get-Content $env:USERPROFILE\\.gemini\\antigravity-acp\\acp_token.json"));
    expect(sent).toHaveLength(1);
    expect(a.view.approvals.map((x) => [x.id, x.choices.map((c) => c.id)])).toEqual([["5", ["accept", "decline"]]]);
  });

  it("cancels what's waiting when the turn is stopped", async () => {
    const { a, sent, ask } = await withAutonomy("ask");
    ask(6, run("c6", "npm test"));
    await a.interrupt();
    expect(a.view.approvals).toEqual([]);
    expect(sent).toEqual([{ id: 6, result: { outcome: { outcome: "cancelled" } } }]);
  });

  it("knows Antigravity's sign-in is a key", () => {
    expect(touchesKeys({ AbsolutePath: "C:\\Users\\me\\.gemini\\antigravity-acp\\acp_token.json" }, true)).toBe(true);
    expect(touchesKeys({ CommandLine: "cat ~/.gemini/antigravity-acp/acp_token.json" })).toBe(true);
    expect(touchesKeys({ CommandLine: "cat ~/.gemini/antigravity-acp/settings.json" })).toBe(false);
  });
});

describe("Antigravity's stream, as the studio shows it", () => {
  it("names tools, joins message chunks, and closes a message at a tool call", () => {
    const { a, update } = harness();
    update(chunk("agent_thought_chunk", "Listing the projects first."));
    update({ ...LIST_PROJECTS, sessionUpdate: "tool_call" });
    update({ toolCallId: LIST_PROJECTS.toolCallId, status: "completed", content: [{ type: "content", content: { type: "text", text: "kids-room: Kids' Room (story)" } }], sessionUpdate: "tool_call_update" });
    update({ ...run("c7", "echo hello"), sessionUpdate: "tool_call" });
    update({ toolCallId: "c7", status: "failed", content: [{ type: "content", content: { type: "text", text: "exit 1" } }], sessionUpdate: "tool_call_update" });
    update(chunk("agent_message_chunk", "There are "));
    update(chunk("agent_message_chunk", "**5** projects."));
    const items = a.view.items.map(({ kind, status, text, tool, server, detail, args, error }) => ({ kind, status, text, tool, server, detail, args, error }));
    expect(items).toEqual([
      { kind: "reasoning", status: "done", text: "Listing the projects first.", tool: undefined, server: undefined, detail: undefined, args: undefined, error: undefined },
      { kind: "tool", status: "done", text: undefined, tool: "list_projects", server: "beatsheet", detail: undefined, args: {}, error: undefined },
      { kind: "tool", status: "failed", text: undefined, tool: "shell", server: undefined, detail: "echo hello", args: undefined, error: "exit 1" },
      { kind: "assistant", status: "running", text: "There are **5** projects.", tool: undefined, server: undefined, detail: undefined, args: undefined, error: undefined },
    ]);
  });

  it("skips its housekeeping, and reads a history's arguments, which come as JSON text", () => {
    const { a, update } = harness();
    const schema: ToolCall = {
      toolCallId: "call_76662",
      title: "Running view_file",
      kind: "read",
      status: "completed",
      locations: [{ path: "C:\\Users\\me\\.gemini\\antigravity-acp\\brain\\3201d2b7\\mcp\\beatsheet\\list_projects.json" }],
      rawInput: '{"AbsolutePath":"C:\\\\Users\\\\me\\\\.gemini\\\\antigravity-acp\\\\brain\\\\3201d2b7\\\\mcp\\\\beatsheet\\\\list_projects.json","toolAction":"Reading tool schema"}',
    };
    expect(housekeeping(schema)).toBe(true);
    const saved = (path: string): ToolCall => ({ toolCallId: "r", title: "Read", kind: "read", locations: [{ path }] });
    expect(housekeeping(saved("C:\\Users\\me\\.gemini\\antigravity-acp\\brain\\0e4e64a2\\.system_generated\\steps\\10\\output.txt"))).toBe(true);
    expect(housekeeping(saved("C:\\Users\\me\\beatsheet\\projects\\muse-cam\\project.json"))).toBe(false);
    update({ ...schema, sessionUpdate: "tool_call" });
    update({ toolCallId: "call_76662", status: "completed", sessionUpdate: "tool_call_update" });
    expect(a.view.items).toEqual([]);
    expect(toolName({ toolCallId: "call_59441", title: "echo hello", kind: "execute", rawInput: '{"CommandLine":"echo hello","Cwd":"C:\\\\x"}' })).toEqual({ tool: "shell", detail: "echo hello" });
  });

  it("ignores other sessions' updates", () => {
    const { a, update } = harness();
    update(chunk("agent_message_chunk", "not ours"), "s2");
    expect(a.view.items).toEqual([]);
  });

  it("scopes 'for this session' to the command, the MCP tool, or edits", () => {
    expect(scope(run("x", "npm test"))).toBe("run:npm test");
    expect(scope(LIST_PROJECTS)).toBe("mcp:beatsheet/list_projects");
    expect(scope({ toolCallId: "x", kind: "edit", title: "Edit a.ts", locations: [{ path: "a.ts" }] })).toBe(scope({ toolCallId: "y", kind: "edit", title: "Edit b.ts", locations: [{ path: "b.ts" }] }));
  });

  it("reads the models from a session's config", () => {
    const opened = {
      configOptions: [
        { id: "model", currentValue: "gemini-3.8-flash", options: [{ value: "gemini-4-argon", name: "Gemini 4 Argon" }, { value: "gemini-3.8-flash", name: "Gemini 3.8 Flash" }] },
        { id: "thinking_level", currentValue: "high", options: [{ value: "low", name: "Low" }] },
      ],
    };
    expect(modelsOf(opened)).toEqual([
      { id: "gemini-4-argon", label: "Gemini 4 Argon", hint: undefined, default: false },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: undefined, default: true },
    ]);
  });
});

describe("Antigravity's earlier sessions", () => {
  it("lists the studio's own, by their first message, newest first, leaving out the probe and ones gone from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "beatsheet-agy-db-"));
    mkdirSync(dir, { recursive: true });
    const db = (id: string) => join(dir, `${id}.db`);
    const opening = (cut: string) => `We're working on the beatsheet project "July 4th" (id july-4), on its cut "${cut}" (cut ${cut}). This conversation is about that cut.`;
    writeFileSync(db("old"), "");
    writeFileSync(db("probe"), "");
    writeFileSync(db("other"), "");
    const sessions = indexedSessions(
      { probe: "probe", sessions: { old: { prompt: opening("main"), model: "gemini-4-argon" }, gone: { prompt: opening("teaser") }, probe: {}, other: { prompt: "hello" } } },
      db,
    );
    expect(sessions.map((s) => [s.id, s.project, s.cut, s.model])).toEqual([["old", "july-4", "main", "gemini-4-argon"]]);
  });
});

describe("installing Google's ACP server", () => {
  const entry = {
    version: "1.4.4",
    distribution: {
      binary: {
        "windows-x86_64": { archive: "https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.4.4-windows-x86_64.zip", cmd: "./agy_acp_server.exe", sha256: "4b68e5936a3d7a60b520aa1ee9479c8be58c43e015f026dc41e7ad17ec54d427" },
        "linux-x86_64": { archive: "https://example.com/agy.zip", cmd: "./agy_acp_server.par", sha256: "b".repeat(64) },
      },
    },
  };

  it("takes this machine's build, from Google, with its checksum", () => {
    expect(platformKey("win32", "x64")).toBe("windows-x86_64");
    expect(platformKey("darwin", "arm64")).toBe("darwin-aarch64");
    expect(pickBuild(entry, "windows-x86_64")).toMatchObject({ version: "1.4.4", cmd: "./agy_acp_server.exe" });
  });

  it("refuses a download from anywhere else, and a platform with no build", () => {
    expect(() => pickBuild(entry, "linux-x86_64")).toThrow(/isn't from Google/);
    expect(() => pickBuild(entry, "darwin-aarch64")).toThrow(/no build/);
  });
});
