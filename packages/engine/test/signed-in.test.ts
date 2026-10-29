import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AntigravityAdapter, authType } from "../src/agent/antigravity.ts";
import { planOf } from "../src/agent/claude.ts";
import { CodexAdapter } from "../src/agent/codex.ts";
import { planOf as musePlan } from "../src/agent/muse.ts";
import { planName, signedIn } from "../src/agent/session.ts";

/** An adapter whose CLI answers `method` with `result`, without starting anything. */
function answering<T extends object>(a: T, result: (method: string) => unknown): T {
  const rpc = { request: async (method: string) => result(method) };
  Object.assign(a, { rpc, host: async () => rpc, probe: async () => ({}) });
  return a;
}

describe("what an agent's card says once it's signed in", () => {
  it("is the plan and nothing about who", () => {
    expect(signedIn("Claude Max")).toBe("Signed in · Claude Max");
    expect(signedIn()).toBe("Signed in");
    expect(planName("prolite", { prolite: "Pro Lite" })).toBe("Pro Lite");
    expect(planName("business_plus", {})).toBe("Business Plus");
  });

  it("names Claude's plan from `claude auth status`, leaving the email out", () => {
    const status = { loggedIn: true, authMethod: "claude.ai", email: "me@example.com", orgName: "me@example.com's Organization", subscriptionType: "max" };
    expect(signedIn(planOf(JSON.stringify(status)))).toBe("Signed in · Claude Max");
    expect(planOf(JSON.stringify({ loggedIn: true, authMethod: "apiKey" }))).toBe("API key");
    expect(planOf(JSON.stringify({ loggedIn: false }))).toBeUndefined();
    expect(planOf("not json")).toBeUndefined();
  });

  it("names Muse Code's plan from `muse usage`, not the protocol's id for it", () => {
    const usage = { schemaVersion: 1, allowance: { tier: "Muse Code Power Usage", window: { usedPercent: 0, resetsAtMs: 1793264038000 }, weekly: { usedPercent: 0 }, source: "mint" }, reason: null, hint: null };
    expect(signedIn(musePlan(JSON.stringify(usage)))).toBe("Signed in · Muse Code Power Usage");
    expect(musePlan(JSON.stringify({ schemaVersion: 1, allowance: null, reason: "signed_out" }))).toBeUndefined();
  });

  it("names Codex's ChatGPT plan, leaving the email out", async () => {
    const codex = answering(new CodexAdapter(), () => ({ account: { type: "chatgpt", email: "me@example.com", planType: "prolite" }, requiresOpenaiAuth: true }));
    expect(await codex.check()).toEqual({ ok: true, detail: "Signed in · ChatGPT Pro Lite" });
    const keyed = answering(new CodexAdapter(), () => ({ account: { type: "apiKey" }, requiresOpenaiAuth: true }));
    expect(await keyed.check()).toEqual({ ok: true, detail: "Signed in · API key" });
  });

  it("names Antigravity's Google plan, or how it signs in otherwise", async () => {
    const home = mkdtempSync(join(tmpdir(), "beatsheet-gemini-home-"));
    mkdirSync(join(home, "antigravity-acp"));
    const settings = (type: string) => writeFileSync(join(home, "antigravity-acp", "settings.json"), JSON.stringify({ auth: { type } }));
    process.env.GEMINI_HOME = home;
    try {
      settings("oauth-personal");
      expect(authType()).toBe("oauth-personal");
      const google = answering(new AntigravityAdapter(), (m) => (m === "authenticate" ? { _meta: { antigravity: { tier: { name: "Google AI Ultra", id: "g1-ultra-lite-tier" } } } } : {}));
      expect(await google.check()).toEqual({ ok: true, detail: "Signed in · Google AI Ultra" });
      settings("gemini-api-key");
      expect(await answering(new AntigravityAdapter(), () => ({})).check()).toEqual({ ok: true, detail: "Signed in · Gemini API key" });
    } finally {
      delete process.env.GEMINI_HOME;
    }
  });
});
