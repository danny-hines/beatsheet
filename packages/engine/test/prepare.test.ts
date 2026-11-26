import { describe, expect, it } from "vitest";
import { pickFastModel } from "../src/agent/fast.ts";
import { parseJsonObject } from "../src/prepare.ts";

describe("fast agent model selection", () => {
  it("picks the lightweight model tier for each provider from its live model list", () => {
    expect(
      pickFastModel("claude", [
        { id: "default", label: "Default", default: true },
        { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
        { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
        { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
      ]),
    ).toBe("claude-haiku-5-5");

    expect(
      pickFastModel("codex", [
        { id: "gpt-5.4", label: "GPT-5.4", default: true },
        { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      ]),
    ).toBe("gpt-5.4-mini");

    expect(
      pickFastModel("antigravity", [
        { id: "gemini-pro", label: "Gemini Pro", default: true },
        { id: "gemini-flash", label: "Gemini Flash" },
        { id: "gemini-flash-lite", label: "Gemini Flash Lite" },
      ]),
    ).toBe("gemini-flash-lite");

    expect(
      pickFastModel("muse", [
        { id: "muse-wonder-full-1.0", label: "Muse Wonder Full 1.0", default: true },
        { id: "muse-wonder-fast-1.0", label: "Muse Wonder Fast 1.0" },
      ]),
    ).toBe("muse-wonder-fast-1.0");
  });

  it("extracts JSON objects cleanly even when wrapped in markdown fences", () => {
    expect(parseJsonObject('```json\n{"rationale":"ok","draft":{"op":"image"}}\n```')).toEqual({
      rationale: "ok",
      draft: { op: "image" },
    });
    expect(parseJsonObject('Sure! Here you go: {"a": 1} thanks.')).toEqual({ a: 1 });
    expect(parseJsonObject("not json")).toBeUndefined();
  });
});
