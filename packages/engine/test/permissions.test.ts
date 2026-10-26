import { describe, expect, it } from "vitest";
import { permissionArgs } from "../src/agent/claude.ts";

const flag = (args: string[], name: string) => (args[args.indexOf(name) + 1] ?? "").split(",");

describe("what a hosted Claude Code session may do without asking", () => {
  it("asks before anything beyond beatsheet's tools and looking around", () => {
    const args = permissionArgs("ask");
    expect(flag(args, "--allowedTools")).toEqual(expect.arrayContaining(["mcp__beatsheet", "Bash(ls *)", "Bash(ffprobe *)"]));
    expect(flag(args, "--allowedTools")).not.toContain("Bash");
    expect(args).not.toContain("--permission-mode");
  });

  it("runs commands and edits on its own when the person lets it", () => {
    const args = permissionArgs("free");
    expect(flag(args, "--allowedTools")).toEqual(expect.arrayContaining(["Bash", "Edit", "Write"]));
    expect(args.slice(args.indexOf("--permission-mode"), args.indexOf("--permission-mode") + 2)).toEqual(["--permission-mode", "acceptEdits"]);
  });

  it("never reads keys from the Keychain, however it's spelled", () => {
    for (const level of ["ask", "free"] as const) {
      const denied = flag(permissionArgs(level), "--disallowedTools");
      expect(denied).toEqual(expect.arrayContaining(["Bash(security *)", "Bash(*find-generic-password*)"]));
    }
  });
});

describe("approving on the person's behalf", () => {
  it("knows a request that reads keys, however it's put", async () => {
    const { touchesKeys } = await import("../src/agent/session.ts");
    expect(touchesKeys({ command: "KEY=$(/usr/bin/security find-generic-password -s beatsheet -a elevenlabs -w) && curl …" })).toBe(true);
    expect(touchesKeys({ command: "security dump-keychain" })).toBe(true);
    expect(touchesKeys({ file_path: "/Users/me/.config/muse/auth.json" })).toBe(true);
    expect(touchesKeys({ command: "mkdir -p /tmp/mc-scripts && cat > /tmp/mc-scripts/ctx.py <<'EOF'\nimport sys\nEOF" })).toBe(false);
    expect(touchesKeys({ command: "ffmpeg -i in.mov -vf reverse out.mp4" })).toBe(false);
  });

  it("says yes itself when the person lets it work without asking, mid-session too, but never to keys", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const home = mkdtempSync(join(tmpdir(), "beatsheet-perm-"));
    writeFileSync(join(home, "settings.json"), JSON.stringify({ autonomy: "free", services: {}, checks: {} }));
    process.env.BEATSHEET_HOME = home;
    const { vi } = await import("vitest");
    vi.resetModules();
    const { ClaudeAdapter } = await import("../src/agent/claude.ts");
    const a = new ClaudeAdapter() as unknown as { child: unknown; onControl: (l: unknown) => void; view: { approvals: unknown[] } };
    const sent: { response: { response: { behavior: string; updatedPermissions?: unknown[] } } }[] = [];
    a.child = { stdin: { write: (s: string) => sent.push(JSON.parse(s)) } };
    const ask = (id: string, command: string) =>
      a.onControl({ type: "control_request", request_id: id, request: { subtype: "can_use_tool", tool_name: "Bash", tool_use_id: `t-${id}`, input: { command } } });

    ask("1", "mkdir -p /tmp/mc-scripts && cat > /tmp/mc-scripts/ctx.py <<'EOF'\nEOF");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.response.response.behavior).toBe("allow");
    expect(sent[0]!.response.response.updatedPermissions).toHaveLength(1);
    expect(a.view.approvals).toHaveLength(0);

    ask("2", "/usr/bin/security find-generic-password -s beatsheet -a fal -w");
    expect(sent).toHaveLength(1);
    expect(a.view.approvals).toHaveLength(1);
    delete process.env.BEATSHEET_HOME;
  });
});

describe("working in the person's Chrome", () => {
  it("lets the session use the Chrome extension's tools only when it's turned on", () => {
    expect(flag(permissionArgs("ask", true), "--allowedTools")).toContain("mcp__claude-in-chrome");
    expect(flag(permissionArgs("ask"), "--allowedTools")).not.toContain("mcp__claude-in-chrome");
    expect(flag(permissionArgs("free", true), "--disallowedTools")).toContain("Bash(security *)");
  });
});
