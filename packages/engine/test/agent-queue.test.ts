import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFile, SCHEMA_V1, STAGE_IDS } from "@beatsheet/schema";
import { describe, expect, it, vi } from "vitest";
import { AgentStudio } from "../src/agent/index.ts";
import { AgentAdapter, type AgentChange, type AgentCheck, type AgentId, type AgentModel, type AgentSessionSummary } from "../src/agent/session.ts";

/** A minimal in-memory adapter to exercise AgentStudio's queueing, steering, interrupt, and error transitions. */
class FakeAdapter extends AgentAdapter {
  readonly id: AgentId;
  sent: string[] = [];
  steered: string[] = [];
  interrupts = 0;
  steerImpl?: (text: string) => Promise<boolean>;

  constructor(id: AgentId, withSteer = false) {
    super();
    this.id = id;
    if (withSteer) {
      this.steer = async (text: string) => {
        if (this.steerImpl) return this.steerImpl(text);
        this.steered.push(text);
        return true;
      };
    }
  }

  async models(): Promise<AgentModel[]> {
    return [];
  }
  async check(): Promise<AgentCheck> {
    return { ok: true, detail: "ok" };
  }
  async sessions(): Promise<AgentSessionSummary[]> {
    return [];
  }
  async start(opts: { model?: string; thinking?: string; project?: string; cut?: string }) {
    this.replace({ status: "idle", sessionId: "s1", project: opts.project, cut: opts.cut });
  }
  async resume(sessionId: string, project?: string, cut?: string) {
    this.replace({ status: "idle", sessionId, project, cut });
  }
  async send(text: string) {
    this.sent.push(text);
    this.set({ status: "running", error: undefined });
  }
  async interrupt() {
    this.interrupts++;
  }
  async decide() {}
  stop() {
    this.replace({ status: "off" });
  }

  /** Simulates the active turn finishing cleanly or with an error. */
  finishTurn(error?: string) {
    this.set({ status: "idle", error });
  }
}

function makeStudio(id: AgentId, withSteer = false) {
  const adapter = new FakeAdapter(id, withSteer);
  const studio = new AgentStudio(() => adapter);
  const views: AgentChange[] = [];
  studio.on("change", (c: AgentChange) => views.push(c));
  return { studio, adapter, views };
}

describe("queued messages in AgentStudio", () => {
  it("shows messages sent while busy in view.queued and dispatches them in FIFO order as turns finish", async () => {
    const { studio, adapter } = makeStudio("antigravity");
    await studio.start("antigravity", {});
    expect(adapter.sent).toHaveLength(1);
    expect(studio.view.status).toBe("running");

    expect(await studio.send("make shot 2 warmer")).toBe(true);
    expect(await studio.send("trim the intro by a bar")).toBe(true);
    expect(studio.view.queued.map((q) => q.text)).toEqual(["make shot 2 warmer", "trim the intro by a bar"]);
    expect(adapter.sent).toHaveLength(1);

    // First turn finishes -> first queued message automatically starts.
    adapter.finishTurn();
    expect(adapter.sent).toHaveLength(2);
    expect(adapter.sent[1]).toBe("make shot 2 warmer");
    expect(studio.view.status).toBe("running");
    expect(studio.view.queued.map((q) => q.text)).toEqual(["trim the intro by a bar"]);

    // Second turn finishes -> second queued message starts.
    adapter.finishTurn();
    expect(adapter.sent).toHaveLength(3);
    expect(adapter.sent[2]).toBe("trim the intro by a bar");
    expect(studio.view.queued).toEqual([]);

    // Third turn finishes -> idle.
    adapter.finishTurn();
    expect(studio.view.status).toBe("idle");
  });

  it("removes a queued message so it is never sent", async () => {
    const { studio, adapter } = makeStudio("antigravity");
    await studio.start("antigravity", {});
    await studio.send("first follow-up");
    await studio.send("second follow-up");

    const firstId = studio.view.queued[0]!.id;
    studio.removeQueued(firstId);
    expect(studio.view.queued.map((q) => q.text)).toEqual(["second follow-up"]);

    adapter.finishTurn();
    expect(adapter.sent.at(-1)).toBe("second follow-up");
    expect(studio.view.queued).toEqual([]);
  });

  it("uses native mid-turn steer for Send now when the adapter supports it", async () => {
    const { studio, adapter } = makeStudio("codex", true);
    await studio.start("codex", {});
    await studio.send("steer me now");
    await studio.send("wait until after");

    const steerId = studio.view.queued[0]!.id;
    await studio.sendQueued(steerId);

    expect(adapter.steered).toEqual(["steer me now"]);
    expect(adapter.interrupts).toBe(0);
    expect(studio.view.queued.map((q) => q.text)).toEqual(["wait until after"]);

    adapter.finishTurn();
    expect(adapter.sent.at(-1)).toBe("wait until after");
  });

  it("handles steer racing with turn completion without dispatching later queued messages ahead of it", async () => {
    const { studio, adapter } = makeStudio("codex", true);
    await studio.start("codex", {});
    await studio.send("urgent");
    await studio.send("later");

    // Simulate the active turn completing while turn/steer is in flight and rejecting.
    adapter.steerImpl = async () => {
      adapter.finishTurn();
      return false;
    };

    const urgentId = studio.view.queued[0]!.id;
    await studio.sendQueued(urgentId);

    expect(adapter.sent.at(-1)).toBe("urgent");
    expect(studio.view.status).toBe("running");
    expect(studio.view.queued.map((q) => q.text)).toEqual(["later"]);
  });

  it("falls back to interrupt-and-send when native steer declines while still running", async () => {
    const { studio, adapter } = makeStudio("codex", true);
    await studio.start("codex", {});
    await studio.send("first");
    await studio.send("jump ahead");

    adapter.steerImpl = async () => false;
    const secondId = studio.view.queued[1]!.id;
    await studio.sendQueued(secondId);

    expect(adapter.interrupts).toBe(1);
    expect(studio.view.queued.map((q) => [q.text, !!q.sending])).toEqual([
      ["jump ahead", true],
      ["first", false],
    ]);

    // Once the cancelled turn settles to idle, the promoted item sends first.
    adapter.finishTurn();
    expect(adapter.sent.at(-1)).toBe("jump ahead");
    expect(studio.view.queued.map((q) => q.text)).toEqual(["first"]);
  });

  it("interrupts and immediately sends the chosen queued item on adapters without native steer", async () => {
    const { studio, adapter } = makeStudio("antigravity", false);
    await studio.start("antigravity", {});
    await studio.send("later");
    await studio.send("do this instead");

    const secondId = studio.view.queued[1]!.id;
    await studio.sendQueued(secondId);

    expect(adapter.interrupts).toBe(1);
    expect(studio.view.queued.map((q) => [q.text, !!q.sending])).toEqual([
      ["do this instead", true],
      ["later", false],
    ]);

    // Even if cancellation carries an error message, Send now proceeds cleanly.
    adapter.finishTurn("cancelled");
    expect(adapter.sent.at(-1)).toBe("do this instead");
    expect(studio.view.status).toBe("running");
    expect(studio.view.queued.map((q) => q.text)).toEqual(["later"]);
  });

  it("pauses queued messages instead of dropping them on explicit Stop or turn error, and lets Send now run while idle", async () => {
    const { studio, adapter } = makeStudio("antigravity");
    await studio.start("antigravity", {});
    await studio.send("keep this around");

    await studio.interrupt();
    adapter.finishTurn();
    expect(studio.view.status).toBe("idle");
    expect(adapter.sent).toHaveLength(1);
    expect(studio.view.queued.map((q) => q.text)).toEqual(["keep this around"]);

    // Send now while idle immediately starts it.
    await studio.sendQueued(studio.view.queued[0]!.id);
    expect(adapter.sent.at(-1)).toBe("keep this around");
    expect(studio.view.status).toBe("running");
    expect(studio.view.queued).toEqual([]);

    // If a turn ends with an error, queued items also pause rather than firing into the error.
    await studio.send("after error");
    adapter.finishTurn("Rate limit exceeded");
    expect(studio.view.status).toBe("idle");
    expect(studio.view.queued.map((q) => q.text)).toEqual(["after error"]);
  });

  it("pauses remaining queued items if a mid-cancel Send now item is removed", async () => {
    const { studio, adapter } = makeStudio("antigravity");
    await studio.start("antigravity", {});
    await studio.send("first");
    await studio.send("second");

    const firstId = studio.view.queued[0]!.id;
    await studio.sendQueued(firstId);
    expect(studio.view.queued[0]!.sending).toBe(true);

    studio.removeQueued(firstId);
    expect(studio.view.queued.map((q) => q.text)).toEqual(["second"]);

    // When the cancel settles, "second" should pause rather than auto-sending unexpectedly.
    adapter.finishTurn();
    expect(studio.view.status).toBe("idle");
    expect(adapter.sent).toHaveLength(1);
    expect(studio.view.queued.map((q) => q.text)).toEqual(["second"]);
  });

  it("clears the queue on disconnect", async () => {
    const { studio } = makeStudio("antigravity");
    await studio.start("antigravity", {});
    await studio.send("pending");
    expect(studio.view.queued).toHaveLength(1);

    studio.stop();
    expect(studio.view.status).toBe("off");
    expect(studio.view.queued).toEqual([]);
  });

  it("restores attached notes back to queued when a queued message is removed", async () => {
    const projectsRoot = mkdtempSync(join(tmpdir(), "beatsheet-queue-proj-"));
    const projDir = join(projectsRoot, "demo");
    mkdirSync(projDir, { recursive: true });
    const parsed = parseFile({
      schema: SCHEMA_V1,
      id: "demo",
      title: "Demo",
      recipe: "montage",
      brief: { goal: "reel" },
      formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
      stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
      spine: "music",
      assets: [],
      tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
      shots: [],
      notes: [{ id: "n1", text: "brighter", status: "queued", target: { kind: "project" }, author: "you", createdAt: "2026-11-27T00:00:00Z" }],
    });
    if (!parsed.ok) throw new Error("bad fixture");
    writeFileSync(join(projDir, "project.json"), JSON.stringify(parsed.file));

    process.env.BEATSHEET_PROJECTS = projectsRoot;
    vi.resetModules();
    const { AgentStudio: FreshStudio } = await import("../src/agent/index.ts");
    const { takeNotes } = await import("../src/turns.ts");
    const { loadProject } = await import("../src/store.ts");
    delete process.env.BEATSHEET_PROJECTS;

    const adapter = new FakeAdapter("antigravity");
    const studio = new FreshStudio(() => adapter);
    await studio.start("antigravity", { project: "demo", cut: "main" });

    const taken = takeNotes("demo", "main");
    expect(taken.count).toBe(1);
    expect(taken.batch).toBeTruthy();
    expect(loadProject("demo", "main").project.notes[0]!.status).toBe("working");

    await studio.send(`fix this\n\n${taken.line}`, { project: "demo", cut: "main", batch: taken.batch! });
    expect(studio.view.queued).toHaveLength(1);
    expect(studio.view.queued[0]!.notes).toBe(1);

    studio.removeQueued(studio.view.queued[0]!.id);
    expect(studio.view.queued).toEqual([]);
    const after = loadProject("demo", "main").project.notes[0]!;
    expect(after.status).toBe("queued");
    expect(after.batch).toBeUndefined();
  });
});
