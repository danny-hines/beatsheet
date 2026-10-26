import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { turnEnded } from "../src/agent/claude.ts";

const transcript = (...lines: object[]) => {
  const file = join(mkdtempSync(join(tmpdir(), "bs-turn-")), "s.jsonl");
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
};
const user = (text: string) => ({ type: "user", message: { role: "user", content: text } });
const reply = (stop_reason: string) => ({ type: "assistant", message: { role: "assistant", stop_reason, content: [{ type: "text", text: "…" }] } });
const toolResult = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } };

describe("reading from a Claude Code transcript whether its turn is over", () => {
  it("is over after a finished reply, whatever bookkeeping follows", () => {
    expect(turnEnded(transcript(user("go"), reply("tool_use"), toolResult, reply("end_turn"), { type: "last-prompt", lastPrompt: "go" }, { type: "mode", mode: "normal" }))).toBe(true);
  });

  it("isn't while a tool's result waits for the model, or a message is queued", () => {
    expect(turnEnded(transcript(user("go"), reply("tool_use"), toolResult))).toBe(false);
    expect(turnEnded(transcript(user("go"), reply("end_turn"), { type: "queue-operation", operation: "enqueue", content: "and another thing" }))).toBe(false);
    expect(turnEnded(transcript(user("go")))).toBe(false);
  });

  it("ignores a subagent's replies", () => {
    expect(turnEnded(transcript(user("go"), reply("tool_use"), { ...reply("end_turn"), isSidechain: true }))).toBe(false);
  });
});
