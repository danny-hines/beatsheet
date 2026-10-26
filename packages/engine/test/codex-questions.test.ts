import { describe, expect, it } from "vitest";
import { CodexAdapter } from "../src/agent/codex.ts";

/** A Codex adapter wired to a fake app server, to see what reaches the person and what goes back. */
function harness() {
  const a = new CodexAdapter();
  const sent: { id: unknown; result: unknown }[] = [];
  const inner = a as unknown as { rpc: unknown; onRequest(id: unknown, method: string, p: Record<string, unknown>): void };
  inner.rpc = { respond: (id: unknown, result: unknown) => sent.push({ id, result }), refuse: () => {} };
  return { a, sent, request: (id: number, method: string, p: Record<string, unknown>) => inner.onRequest(id, method, p) };
}

const confirm = (id: string, options: string[]) => ({ id, header: "Confirm", question: `Go ahead with ${id}?`, isOther: false, isSecret: false, options: options.map((label) => ({ label, description: "" })) });

describe("Codex asking the person something mid-turn", () => {
  it("shows each question as a card, in turn, and sends the answers back together", async () => {
    const { a, sent, request } = harness();
    request(7, "item/tool/requestUserInput", { threadId: "t", turnId: "u", itemId: "i", isBlocking: true, questions: [confirm("download", ["Download", "Skip"]), confirm("close", ["Close the tab", "Leave it"])] });
    expect(a.view.approvals.map((x) => x.choices.map((c) => c.label))).toEqual([["Download", "Skip"]]);
    await a.decide(a.view.approvals[0]!.id, "0");
    expect(a.view.approvals.map((x) => x.choices.map((c) => c.label))).toEqual([["Close the tab", "Leave it"]]);
    expect(sent).toEqual([]);
    await a.decide(a.view.approvals[0]!.id, "1");
    expect(a.view.approvals).toEqual([]);
    expect(sent).toEqual([{ id: 7, result: { answers: { download: { answers: ["Download"] }, close: { answers: ["Leave it"] } } } }]);
  });

  it("never asks for a secret, and sends open questions back to chat", () => {
    const { a, sent, request } = harness();
    request(8, "item/tool/requestUserInput", { questions: [{ id: "pw", header: "Sign in", question: "Password?", isOther: false, isSecret: true, options: null }] });
    expect(a.view.approvals).toEqual([]);
    expect(String((sent[0]!.result as { answers: Record<string, { answers: string[] }> }).answers.pw!.answers[0])).toMatch(/doesn't type secrets/);
  });
});
