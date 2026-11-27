import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFile, SCHEMA_V1, STAGE_IDS } from "@beatsheet/schema";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AgentStudio as AgentStudioType } from "../src/agent/index.ts";
import { AgentAdapter, type AgentApproval, type AgentChange, type AgentCheck, type AgentId, type AgentModel, type AgentSessionSummary } from "../src/agent/session.ts";

/** In-memory adapter tracking its own lifecycle so multi-project isolation can be asserted directly. */
class MultiFakeAdapter extends AgentAdapter {
  readonly id: AgentId;
  sent: string[] = [];
  decided: { approvalId: string; choiceId: string }[] = [];
  resumed: { sessionId: string; project?: string; cut?: string }[] = [];
  knownSessions: AgentSessionSummary[] = [];
  interrupts = 0;
  stopped = 0;

  constructor(id: AgentId) {
    super();
    this.id = id;
  }

  async models(): Promise<AgentModel[]> {
    return [];
  }
  async check(): Promise<AgentCheck> {
    return { ok: true, detail: "Signed in" };
  }
  async sessions(): Promise<AgentSessionSummary[]> {
    return this.knownSessions;
  }
  async start(opts: { model?: string; thinking?: string; project?: string; cut?: string }) {
    this.replace({ status: "idle", sessionId: `${this.id}-${opts.project ?? "none"}`, project: opts.project, cut: opts.cut });
  }
  async resume(sessionId: string, project?: string, cut?: string) {
    this.resumed.push({ sessionId, project, cut });
    this.replace({ status: "idle", sessionId, project, cut });
  }
  async send(text: string) {
    this.sent.push(text);
    this.set({ status: "running", error: undefined });
  }
  async interrupt() {
    this.interrupts++;
  }
  async decide(approvalId: string, choiceId: string) {
    this.decided.push({ approvalId, choiceId });
    this.set({ approvals: this.view.approvals.filter((a) => a.id !== approvalId) });
  }
  stop() {
    this.stopped++;
    this.replace({ status: "off" });
  }

  ask(approval: AgentApproval) {
    this.set({ approvals: [...this.view.approvals, approval] });
  }
  finishTurn(error?: string) {
    this.set({ status: "idle", error });
  }
}

let projectsRoot = "";
let FreshStudio: typeof AgentStudioType;
let currentTurn: typeof import("../src/turns.ts").currentTurn;

function writeFixtureProject(id: string, cuts = ["main"]) {
  const dir = join(projectsRoot, id);
  mkdirSync(dir, { recursive: true });
  const parsed = parseFile({
    schema: SCHEMA_V1,
    id,
    title: id,
    recipe: "montage",
    brief: { goal: `Video for ${id}` },
    formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "music",
    assets: [],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [],
    notes: [],
  });
  if (!parsed.ok) throw new Error(`bad fixture for ${id}`);
  for (const extra of cuts.slice(1)) {
    parsed.file.cuts.push({ ...structuredClone(parsed.file.cuts[0]!), id: extra, name: extra });
  }
  writeFileSync(join(dir, "project.json"), JSON.stringify(parsed.file));
}

function makeMultiStudio(maxIdle = 3, knownSessions: AgentSessionSummary[] = []) {
  const created: MultiFakeAdapter[] = [];
  const studio = new FreshStudio((id) => {
    const a = new MultiFakeAdapter(id);
    a.knownSessions = knownSessions;
    created.push(a);
    return a;
  }, maxIdle);
  const changes: AgentChange[] = [];
  studio.on("change", (c: AgentChange) => changes.push(c));
  return { studio, created, changes };
}

beforeAll(async () => {
  projectsRoot = mkdtempSync(join(tmpdir(), "beatsheet-multi-proj-"));
  for (const id of ["alpha", "beta", "gamma", "p1", "p2", "p3", "p4", "p5", "idle-proj", "busy-proj", "codex-proj"]) {
    writeFixtureProject(id, id === "alpha" ? ["main", "alt"] : id === "beta" ? ["main", "teaser"] : ["main"]);
  }
  process.env.BEATSHEET_PROJECTS = projectsRoot;
  vi.resetModules();
  ({ AgentStudio: FreshStudio } = await import("../src/agent/index.ts"));
  ({ currentTurn } = await import("../src/turns.ts"));
  delete process.env.BEATSHEET_PROJECTS;
});

afterAll(() => {
  if (projectsRoot) rmSync(projectsRoot, { recursive: true, force: true });
});

describe("multi-project concurrent agents in AgentStudio", () => {
  it("runs independent sessions, turns, queues, approvals, interrupts and stops per project simultaneously", async () => {
    const { studio, created, changes } = makeMultiStudio();

    await studio.start("claude", { project: "alpha", cut: "main" });
    await studio.start("antigravity", { project: "beta", cut: "teaser" });

    const [alpha, beta] = created as [MultiFakeAdapter, MultiFakeAdapter];
    expect(alpha.stopped).toBe(0);
    expect(beta.stopped).toBe(0);
    expect(studio.viewFor("alpha").status).toBe("running");
    expect(studio.viewFor("beta").status).toBe("running");
    expect(currentTurn("alpha")?.who).toBe("agent");
    expect(currentTurn("beta")?.who).toBe("agent");
    expect(Object.keys(studio.views()).sort()).toEqual(["alpha", "beta"]);

    // Same-project other cut is busyElsewhere, but another project is never blocked.
    expect(studio.openOn("alpha", "main")).toBe(true);
    expect(studio.busyElsewhere("alpha", "alt")).toBe(true);
    expect(studio.busyElsewhere("beta", "teaser")).toBe(false);
    expect(studio.busyElsewhere("gamma", "main")).toBe(false);

    // Messages queue independently per project.
    expect(await studio.send("warm up alpha", undefined, "alpha")).toBe(true);
    expect(await studio.send("tighten beta", undefined, "beta")).toBe(true);
    expect(studio.viewFor("alpha").queued.map((q) => q.text)).toEqual(["warm up alpha"]);
    expect(studio.viewFor("beta").queued.map((q) => q.text)).toEqual(["tighten beta"]);

    // Finishing alpha's turn dispatches only alpha's queued message, leaving beta untouched.
    alpha.finishTurn();
    expect(alpha.sent.at(-1)).toBe("warm up alpha");
    expect(studio.viewFor("alpha").queued).toEqual([]);
    expect(studio.viewFor("beta").queued.map((q) => q.text)).toEqual(["tighten beta"]);
    expect(beta.sent).toHaveLength(1);

    // Finishing alpha again hands alpha's turn back to the person while beta stays on agent's turn.
    alpha.finishTurn();
    expect(currentTurn("alpha")?.who).toBe("you");
    expect(currentTurn("beta")?.who).toBe("agent");

    // Every emitted change carries its project key.
    expect(changes.some((c) => c.project === "alpha")).toBe(true);
    expect(changes.some((c) => c.project === "beta")).toBe(true);

    // Interrupting and stopping alpha leaves beta running cleanly.
    await studio.interrupt("alpha");
    expect(alpha.interrupts).toBe(1);
    expect(beta.interrupts).toBe(0);

    studio.stop("alpha");
    expect(alpha.stopped).toBe(1);
    expect(beta.stopped).toBe(0);
    expect(studio.viewFor("alpha").status).toBe("off");
    expect(studio.viewFor("beta").status).toBe("running");
    expect(Object.keys(studio.views())).toEqual(["beta"]);

    // Finishing beta still dispatches beta's queued message.
    beta.finishTurn();
    expect(beta.sent.at(-1)).toBe("tighten beta");
  });

  it("resumes one project via pickup without disturbing a running agent on another project", async () => {
    const saved: AgentSessionSummary[] = [{ id: "prev-gamma", updatedAt: "2026-11-27T00:00:00Z", project: "gamma", cut: "main" }];
    const { studio, created } = makeMultiStudio(3, saved);

    // Start alpha running, then pick up gamma's previous session (seeded on gamma's turn).
    await studio.start("claude", { project: "alpha", cut: "main" });
    const alpha = created[0]!;
    await studio.resume("claude", "prev-gamma", "gamma", "main");
    await studio.send("initial", undefined, "gamma");
    created[1]!.finishTurn();
    studio.stop("gamma");

    // Now alpha is still running while gamma has no open slot; pickup("gamma") resumes gamma without touching alpha.
    const r = await studio.pickup("gamma", "main");
    expect(r.resumed).toBe(true);
    expect(alpha.stopped).toBe(0);
    expect(studio.viewFor("alpha").status).toBe("running");
    expect(studio.viewFor("gamma").sessionId).toBe("prev-gamma");
    expect(studio.viewFor("gamma").status).toBe("idle");
  });

  it("never evicts running, approval-waiting, queued or errored sessions, and LRU-evicts oldest idle sessions beyond maxIdle", async () => {
    const { studio, created } = makeMultiStudio(2);

    // Start 4 concurrent projects: none should be evicted while running.
    await studio.start("claude", { project: "p1", cut: "main" });
    await studio.start("claude", { project: "p2", cut: "main" });
    await studio.start("claude", { project: "p3", cut: "main" });
    await studio.start("claude", { project: "p4", cut: "main" });

    const [p1, p2, p3, p4] = created as [MultiFakeAdapter, MultiFakeAdapter, MultiFakeAdapter, MultiFakeAdapter];
    expect(Object.keys(studio.views()).sort()).toEqual(["p1", "p2", "p3", "p4"]);

    // Put a pending approval on p1, error on p2, finish p3 and p4 to idle: p1 (approval) and p2 (error) are protected.
    p1.ask({ id: "ap1", title: "Run command", detail: "echo hi", choices: [{ id: "allow", label: "Allow", primary: true }] });
    p1.finishTurn();
    p2.fail(new Error("Rate limit"));
    p3.finishTurn();
    p4.finishTurn();
    expect(p1.stopped).toBe(0);
    expect(p2.stopped).toBe(0);
    expect(p3.stopped).toBe(0);
    expect(p4.stopped).toBe(0);

    // Resolve p1's approval -> p1 becomes idle (and freshly touched); start p5 and let it finish to idle.
    await studio.decide("ap1", "allow", "p1");
    await studio.start("claude", { project: "p5", cut: "main" });
    const p5 = created[4]!;
    expect(p3.stopped).toBe(0); // p5 is running, so p3 isn't evicted until p5 settles.
    p5.finishTurn();

    // Now 4 idle slots existed (p1, p3, p4, p5), so the 2 oldest idle (p3, p4) are evicted while p1 (touched) and p5 stay warm, and p2 (error) stays visible.
    expect(p3.stopped).toBe(1);
    expect(p4.stopped).toBe(1);
    expect(p1.stopped).toBe(0);
    expect(p2.stopped).toBe(0);
    expect(p5.stopped).toBe(0);
    expect(studio.viewFor("p3").status).toBe("off");
    expect(studio.viewFor("p4").status).toBe("off");
    expect(studio.viewFor("p1").status).toBe("idle");
    expect(studio.viewFor("p2").status).toBe("error");
    expect(studio.viewFor("p5").status).toBe("idle");
  });

  it("fans out autonomy and chrome changes across every open session and keeps CLI updates guarded across all projects", async () => {
    const { studio, created } = makeMultiStudio();

    await studio.start("claude", { project: "idle-proj", cut: "main" });
    await studio.start("claude", { project: "busy-proj", cut: "main" });
    await studio.start("codex", { project: "codex-proj", cut: "main" });

    const [idleProj, busyProj, codexProj] = created as [MultiFakeAdapter, MultiFakeAdapter, MultiFakeAdapter];
    idleProj.finishTurn();
    busyProj.ask({ id: "safe", title: "Run", detail: "ls -la", choices: [{ id: "session", label: "Allow", primary: true }] });
    busyProj.ask({ id: "secret", title: "Run", detail: "security find-generic-password -s fal", choices: [{ id: "session", label: "Allow", primary: true }] });
    codexProj.ask({ id: "codex-safe", title: "Run", detail: "ffprobe a.mp4", choices: [{ id: "accept", label: "Run", primary: true }] });

    await studio.autonomyChanged("free");

    // Non-key approvals across BOTH busy projects were settled; the Keychain prompt was left waiting.
    expect(busyProj.decided).toEqual([{ approvalId: "safe", choiceId: "session" }]);
    expect(busyProj.view.approvals.map((a) => a.id)).toEqual(["secret"]);
    expect(codexProj.decided).toEqual([{ approvalId: "codex-safe", choiceId: "accept" }]);

    // Idle Claude session relaunched immediately; busy Claude session relaunches when its turn finishes; Codex does not relaunch for autonomy.
    expect(idleProj.resumed).toHaveLength(1);
    expect(busyProj.resumed).toHaveLength(0);
    expect(codexProj.resumed).toHaveLength(0);

    busyProj.finishTurn();
    await Promise.resolve();
    expect(busyProj.resumed).toHaveLength(1);

    // Chrome toggle relaunches every open agent (Claude and Codex alike).
    codexProj.finishTurn();
    await studio.chromeChanged();
    expect(idleProj.resumed).toHaveLength(2);
    expect(busyProj.resumed).toHaveLength(2);
    expect(codexProj.resumed).toHaveLength(1);

    // Updating a CLI with open sessions refuses; disconnecting only one still blocks while another uses it, and Codex stays untouched.
    await expect(studio.update("claude", () => {})).rejects.toThrow(/2 sessions open/);
    studio.stop("idle-proj");
    await expect(studio.update("claude", () => {})).rejects.toThrow(/a session open/);
    expect(codexProj.stopped).toBe(0);
  });
});
