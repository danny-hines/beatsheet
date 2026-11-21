import { describe, expect, it } from "vitest";
import { checkAnswer, modelsFrom as claudeModels } from "../src/agent/claude.ts";
import { modelsFrom as museModels } from "../src/agent/muse.ts";
import { newer, versionIn } from "../src/agent/cli.ts";
import { brief } from "../src/agent/session.ts";

// Claude Code 2.1.311's answer to the check, cut down to what's read, and the warning it printed alongside.
const RESULT = JSON.stringify({ duration_api_ms: 845, stop_reason: "end_turn", usage: { input_tokens: 2 }, is_error: false, subtype: "success", result: "OK", type: "result" });
const WARNING = '[claude-code:unrecognized_model] {"model":"claude-fable-5-2","query_source":"sdk"}';

describe("reading Claude Code's answer to the check", () => {
  it("is signed in when the answer is fine, whatever the CLI warned about", () => {
    expect(checkAnswer(`${RESULT}\n`, `${WARNING}\n`)).toEqual({ ok: true });
    // A CLI that prints its warning on the same stream as the answer.
    expect(checkAnswer(`${WARNING}\n${RESULT}\n`, "")).toEqual({ ok: true });
  });

  it("says to sign in when the answer is that it can't", () => {
    expect(checkAnswer(JSON.stringify({ type: "result", is_error: true, result: "Invalid API key · Please run /login" }), "")).toEqual({ ok: false, detail: "Not signed in" });
    expect(checkAnswer(JSON.stringify({ type: "result", is_error: true, result: "Credit balance is too low" }), "")).toEqual({ ok: false, detail: "Credit balance is too low" });
  });

  it("shows what the CLI said when there's no answer, and never the answer itself as the reason", () => {
    expect(checkAnswer("", "error: unknown option '--strict-mcp-config'\n")).toEqual({ ok: false, detail: "error: unknown option '--strict-mcp-config'" });
    expect(checkAnswer("", "")).toEqual({ ok: false, detail: "Claude Code couldn't answer" });
  });
});

describe("Claude Code's models, from its own list", () => {
  // The shape of 2.1.311's list: a default, short names, and one model under two names.
  const listed = [
    { value: "default", resolvedModel: "claude-fable-5-2", displayName: "Default (recommended)", description: "Fable 5.2" },
    { value: "opus", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5" },
    { value: "claude-fable-5-2", resolvedModel: "claude-fable-5-2", displayName: "Fable 5.2" },
    { value: "fable", resolvedModel: "claude-fable-5-1", displayName: "Fable 5.1" },
    { value: "claude-opus-5-5", resolvedModel: "claude-opus-5-5", displayName: "Opus 5.5" },
  ];

  it("goes by full ids, so a choice saved before still matches, and lists each model once", () => {
    expect(claudeModels(listed).map((m) => [m.id, m.label])).toEqual([
      ["default", "Default"],
      ["claude-opus-5-5", "Claude Opus 5.5"],
      ["claude-fable-5-2", "Claude Fable 5.2"],
      ["claude-fable-5-1", "Claude Fable 5.1"],
    ]);
  });

  it("says which model the default is today", () => {
    const [first] = claudeModels(listed);
    expect(first).toMatchObject({ default: true, hint: "Whatever your Claude Code settings pick (Fable 5.2 today)" });
    expect(claudeModels([{ value: "default" }])[0]!.hint).toBe("Whatever your Claude Code settings pick");
  });
});

describe("Muse Code's models", () => {
  it("are its list", () => {
    expect(museModels([{ modelId: "muse-wonder-full-1.0", isDefault: true }, { modelId: "muse-spark-1.3" }])).toEqual([
      { id: "muse-wonder-full-1.0", label: "Muse Wonder Full 1.0", default: true },
      { id: "muse-spark-1.3", label: "Muse Spark 1.3", default: undefined },
    ]);
  });

  it("leave the pick to Muse Code when it lists none, as 1.4.25 does", () => {
    expect(museModels([])).toEqual([{ id: "default", label: "Default", hint: "Whichever model Muse Code picks", default: true }]);
  });
});

describe("a check's detail", () => {
  it("is kept to a line that fits the card", () => {
    expect(brief("Signed in · Claude Max")).toBe("Signed in · Claude Max");
    expect(brief("first\nsecond")).toBe("first");
    const long = brief(RESULT.repeat(20));
    expect(long).toHaveLength(160);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("a CLI's version", () => {
  it("is read from what each prints for --version", () => {
    expect(versionIn("codex-cli 0.164.0\n")).toBe("0.164.0");
    expect(versionIn("2.1.311 (Claude Code)")).toBe("2.1.311");
    expect(versionIn("Muse Code 1.4.25 (1.4.25-R9361.1)")).toBe("1.4.25");
    expect(versionIn("command not found")).toBeUndefined();
  });

  it("is later by its numbers, not its spelling", () => {
    expect(newer("0.171.0", "0.164.0")).toBe(true);
    expect(newer("2.1.330", "2.1.311")).toBe(true);
    expect(newer("2.1.9", "2.1.10")).toBe(false);
    expect(newer("2.10.0", "2.9.9")).toBe(true);
    expect(newer("1.4.25", "1.4.25")).toBe(false);
  });
});
