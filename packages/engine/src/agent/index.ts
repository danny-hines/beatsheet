/**
 * The agents the studio hosts: Muse Code, Codex, Claude Code or Antigravity, up to one live session per project, each
 * on the person's own CLI and sign-in. Whichever is running, the studio sees the same view and changes per project.
 */
import { EventEmitter } from "node:events";
import { openingPrompt } from "../agents.ts";
import { readSettings } from "../settings.ts";
import { loadFile } from "../store.ts";
import { agentsTurn, currentTurn, restoreNotes, yourTurn } from "../turns.ts";
import { AntigravityAdapter } from "./antigravity.ts";
import { ClaudeAdapter } from "./claude.ts";
import { cliVersions, findCli, installCli, openSignIn, SETUP, updateCli } from "./cli.ts";
import { CodexAdapter } from "./codex.ts";
import { MuseAdapter } from "./muse.ts";
import { uuid7 } from "./rpc.ts";
import { AGENT_LABELS, brief, message, offView, readStudioMessage, touchesKeys, type AgentAdapter, type AgentChange, type AgentCheck, type AgentId, type AgentModel, type AgentOption, type AgentQueued, type AgentSessionSummary, type AgentView } from "./session.ts";

export * from "./session.ts";
export { uuid7 } from "./rpc.ts";

/** Attached notes carried by a queued message, so removing it before it runs puts those notes back in the composer. */
export type QueuedNotes = { project: string; cut?: string; batch: string };
type QueuedEntry = { id: string; raw: string; shown: AgentQueued; notes?: QueuedNotes };

type SessionSlot = {
  /** Project id, or "" for a projectless session. */
  key: string;
  project?: string;
  adapter: AgentAdapter;
  unsubscribe: () => void;
  /** Reopen this session when it's next idle, so it starts with the current permission flags or tools. */
  relaunch: boolean;
  /** Messages sent while a turn is running, shown in the conversation until they go next or are removed. */
  queue: QueuedEntry[];
  /** Queued item promoted by "Send now" while waiting for the active turn to cancel. */
  pendingSendNow?: string;
  /** True after an explicit Stop (or removing a "Send now" item mid-cancel), so queued items pause instead of auto-running. */
  interrupted: boolean;
  /** True while a native mid-turn steer RPC is in flight, deferring idle auto-dispatch until it settles. */
  steering: boolean;
  /** Last interaction time, used to evict older idle sessions while keeping active ones alive. */
  touchedAt: number;
};

export const AGENT_IDS: AgentId[] = ["muse", "codex", "claude", "antigravity"];
/** An agent CLI: whether it's here, how to get it working, and its models once it is. */
export type AgentInfo = {
  id: AgentId;
  label: string;
  installed: boolean;
  installCommand?: string;
  signInCommand: string;
  models?: AgentModel[];
  thinkingLevels?: AgentOption[];
  error?: string;
  /** The CLI's version, and a later one when it can be updated to that. */
  version?: string;
  latest?: string;
};

const make = (id: AgentId): AgentAdapter =>
  id === "muse" ? new MuseAdapter() : id === "codex" ? new CodexAdapter() : id === "antigravity" ? new AntigravityAdapter() : new ClaudeAdapter();

const keyOf = (project?: string) => project ?? "";

/** Idle sessions kept warm in memory at once; older idle ones disconnect cleanly and stay on disk to resume. */
const DEFAULT_MAX_IDLE = 3;

export class AgentStudio extends EventEmitter {
  /** Live sessions, at most one per project (keyed by project id, or "" when projectless). */
  private slots = new Map<string, SessionSlot>();
  /** Separate per-CLI adapters used only for metadata (models, check, sessions, sign-in), so probing never disturbs a project's session. */
  private probes = new Map<AgentId, AgentAdapter>();
  /** Most recently active slot key, used as the fallback when a caller omits `project`. */
  private lastKey?: string;
  /** Strictly increasing sequence for LRU idle eviction, independent of clock resolution. */
  private touchSeq = 0;
  /** Projects with a `pickup` resume currently looking up sessions on disk, to avoid double-resuming on quick clicks. */
  private pickingUp = new Set<string>();
  /** Each CLI's models, asked once: the answer, or the asking still under way. */
  private models = new Map<AgentId, Promise<AgentModel[]>>();
  /** Each CLI's thinking / reasoning levels, when it exposes a separate choice. */
  private thinking = new Map<AgentId, Promise<AgentOption[]>>();
  /** Each CLI's version and whether there's a later one, likewise. */
  private versions = new Map<AgentId, Promise<{ version?: string; latest?: string }>>();
  /** A version an update didn't reach (the CLI's own channel is behind npm's): not offered again. */
  private unreached = new Map<AgentId, string>();

  constructor(
    private makeAdapter: (id: AgentId) => AgentAdapter = make,
    private maxIdle = DEFAULT_MAX_IDLE,
  ) {
    super();
  }

  /** View of the most recently active session (or off), for callers that don't name a project. */
  get view(): AgentView {
    return this.viewFor();
  }

  /** View of `project`'s hosted session (or off when none is open on it). */
  viewFor(project?: string): AgentView {
    const slot = this.resolveSlot(project);
    return slot ? this.slotView(slot) : offView();
  }

  /** Every active hosted session, keyed by project id (or "" for a projectless session). */
  views(): Record<string, AgentView> {
    const out: Record<string, AgentView> = {};
    for (const slot of this.slots.values()) {
      const v = this.slotView(slot);
      if (v.status === "off" && !v.items.length && !v.approvals.length && !v.queued.length) continue;
      out[slot.key] = v;
    }
    return out;
  }

  private slotView(slot: SessionSlot): AgentView {
    const base = slot.adapter.view;
    return { ...base, ...(slot.project ? { project: slot.project } : {}), queued: this.queuedView(slot) };
  }

  private queuedView(slot: SessionSlot): AgentQueued[] {
    return slot.queue.map((q) => ({ ...q.shown }));
  }

  private resolveSlot(project?: string): SessionSlot | undefined {
    if (project !== undefined) return this.slots.get(project);
    if (this.lastKey !== undefined) {
      const last = this.slots.get(this.lastKey);
      if (last) return last;
    }
    return this.slots.get("") ?? this.slots.values().next().value;
  }

  private slotByQueued(id: string): SessionSlot | undefined {
    for (const slot of this.slots.values()) if (slot.queue.some((q) => q.id === id)) return slot;
    return undefined;
  }

  private slotByApproval(approvalId: string): SessionSlot | undefined {
    for (const slot of this.slots.values()) if (slot.adapter.view.approvals.some((a) => a.id === approvalId)) return slot;
    return undefined;
  }

  private emitSlotView(slot: SessionSlot) {
    const { items: _items, ...rest } = this.slotView(slot);
    this.emit("change", { type: "view", ...(slot.project !== undefined ? { project: slot.project } : {}), view: rest } satisfies AgentChange);
  }

  private clearQueue(slot: SessionSlot, restore: boolean) {
    const dropped = slot.queue.splice(0);
    slot.pendingSendNow = undefined;
    slot.interrupted = false;
    if (restore) {
      for (const q of dropped) if (q.notes) restoreNotes(q.notes.project, q.notes.batch, q.notes.cut);
    }
  }

  private probe(id: AgentId): AgentAdapter {
    let a = this.probes.get(id);
    if (!a) {
      a = this.makeAdapter(id);
      this.probes.set(id, a);
    }
    return a;
  }

  /** Replaces `project`'s slot with a fresh adapter for `id`, leaving every other project's session untouched. */
  private attachSlot(id: AgentId, project?: string): SessionSlot {
    const key = keyOf(project);
    const prev = this.slots.get(key);
    if (prev) {
      this.clearQueue(prev, true);
      prev.unsubscribe();
      this.slots.delete(key);
      prev.adapter.stop();
    }
    const made = this.makeAdapter(id);
    const slot: SessionSlot = {
      key,
      project,
      adapter: made,
      unsubscribe: () => {},
      relaunch: false,
      queue: [],
      interrupted: false,
      steering: false,
      touchedAt: ++this.touchSeq,
    };
    let was = made.view.status;
    const onChange = (c: AgentChange) => {
      if (this.slots.get(key) !== slot) return;
      if (c.type !== "view") {
        this.emit("change", slot.project !== undefined ? { ...c, project: slot.project } : c);
        return;
      }
      const prevStatus = was;
      was = c.view.status;
      const view = { ...c.view, ...(slot.project ? { project: slot.project } : {}), queued: this.queuedView(slot) };
      this.emit("change", { type: "view", ...(slot.project !== undefined ? { project: slot.project } : {}), view });
      this.onStatusChange(slot, prevStatus, c.view.status, c.view.error);
    };
    made.on("change", onChange);
    slot.unsubscribe = () => made.off("change", onChange);
    this.slots.set(key, slot);
    this.lastKey = key;
    return slot;
  }

  /** Stops and removes one slot, emitting an off view so the studio clears it cleanly. */
  private dropSlot(slot: SessionSlot, restore: boolean) {
    this.clearQueue(slot, restore);
    slot.unsubscribe();
    this.slots.delete(slot.key);
    if (this.lastKey === slot.key) this.lastKey = this.slots.keys().next().value;
    slot.adapter.stop();
    const view: AgentView = { ...offView(), ...(slot.project ? { project: slot.project } : {}) };
    this.emit("change", { type: "view", ...(slot.project !== undefined ? { project: slot.project } : {}), view } satisfies AgentChange);
  }

  /**
   * Disconnects the oldest idle sessions once more than `maxIdle` sit warm, so browsing across many projects doesn't
   * leave CLI + MCP processes accumulating in memory. Running, starting, queued and approval-waiting sessions are never
   * evicted.
   */
  private evictIdle(keepKey?: string) {
    const isIdle = (s: SessionSlot) =>
      (s.adapter.view.status === "idle" || s.adapter.view.status === "off") &&
      !s.adapter.view.approvals.length &&
      !s.queue.length &&
      !s.relaunch;
    const idle = [...this.slots.values()].filter(isIdle);
    const excess = idle.length - this.maxIdle;
    if (excess <= 0) return;
    const candidates = idle.filter((s) => s.key !== keepKey).sort((a, b) => a.touchedAt - b.touchedAt);
    for (const victim of candidates.slice(0, excess)) this.dropSlot(victim, false);
  }

  private onStatusChange(slot: SessionSlot, prev: AgentView["status"], status: AgentView["status"], error?: string) {
    if (prev !== "running" || status !== "idle") return;
    if (slot.steering) return;
    const made = slot.adapter;
    const forced = slot.pendingSendNow ? slot.queue.findIndex((q) => q.id === slot.pendingSendNow) : -1;
    const shouldDispatch = forced >= 0 || (!slot.interrupted && !error && slot.queue.length > 0);
    // A permissions or Chrome change that came mid-turn: reopen the conversation with the new flags once it's done.
    if (slot.relaunch && made.view.sessionId) {
      slot.relaunch = false;
      if (!shouldDispatch && slot.project) this.turnBack(slot.project);
      void this.relaunchSlot(slot, made.view.sessionId, made.view.cut, shouldDispatch, forced >= 0);
      return;
    }
    if (shouldDispatch) {
      this.dispatchNext(slot, forced >= 0);
      return;
    }
    slot.interrupted = false;
    slot.pendingSendNow = undefined;
    // A hosted agent that stops without handing off still gives the turn back.
    if (slot.project) this.turnBack(slot.project);
    this.evictIdle(slot.key);
  }

  private async relaunchSlot(slot: SessionSlot, sessionId: string, cut?: string, dispatch = false, forced = false) {
    const { project, adapter } = slot;
    await adapter.resume(sessionId, project, project ? this.cutOf(project, cut) : undefined);
    if (this.slots.get(slot.key) !== slot) return;
    if (dispatch && adapter.view.status === "idle") this.dispatchNext(slot, forced);
  }

  private dispatchNext(slot: SessionSlot, forced = false) {
    const a = slot.adapter;
    if (this.slots.get(slot.key) !== slot || a.view.status !== "idle") return;
    const idx = forced && slot.pendingSendNow ? slot.queue.findIndex((q) => q.id === slot.pendingSendNow) : 0;
    if (idx < 0 || idx >= slot.queue.length) {
      slot.pendingSendNow = undefined;
      return;
    }
    const [next] = slot.queue.splice(idx, 1);
    slot.pendingSendNow = undefined;
    slot.interrupted = false;
    slot.touchedAt = ++this.touchSeq;
    this.emitSlotView(slot);
    this.handed(slot);
    void a.send(next!.raw).catch((err) => {
      if (!a.view.error) a.fail(err);
      if (slot.project) this.turnBack(slot.project);
    });
  }

  private turnBack(project: string) {
    try {
      if (currentTurn(project)?.who === "agent") yourTurn(project);
    } catch {
      // the project went away
    }
  }

  /** Something was handed to the agent on this project: its turn now, on this conversation's cut. */
  private handed(slot: SessionSlot) {
    const a = slot.adapter;
    const project = slot.project;
    if (!project) return;
    try {
      agentsTurn(project, a.view.cut ?? currentTurn(project)?.cut, a.view.sessionId ? { agent: a.id, id: a.view.sessionId } : undefined);
    } catch {
      // the project went away
    }
  }

  /**
   * The person changed how much the agent does without asking. Letting it work freely settles what's waiting now across
   * every open session (anything but keys); Claude Code sessions reopen with the matching flags straight away if idle,
   * otherwise as soon as their turn ends.
   */
  async autonomyChanged(level: "ask" | "free") {
    const active = [...this.slots.values()].filter((s) => s.adapter.view.status !== "off");
    if (level === "free") {
      await Promise.all(
        active.map(async (slot) => {
          for (const ap of slot.adapter.view.approvals) {
            const yes = ap.choices.find((c) => c.id === "session") ?? ap.choices.find((c) => c.primary);
            if (yes && !touchesKeys(ap.detail)) await slot.adapter.decide(ap.id, yes.id).catch(() => {});
          }
        }),
      );
    }
    await this.reopenSessions(false);
  }

  /** The person turned working in their Chrome on or off: every open session reopens with the tools to match. */
  async chromeChanged() {
    await this.reopenSessions(true);
  }

  /**
   * Reopens every open session with the current flags and tools: now if it's idle, else when its turn ends. Only Claude
   * Code takes its permissions at launch; every agent takes its tools then.
   */
  private async reopenSessions(anyAgent = false) {
    const tasks: Promise<void>[] = [];
    for (const slot of [...this.slots.values()]) {
      const a = slot.adapter;
      if ((a.id !== "claude" && !anyAgent) || a.view.status === "off" || !a.view.sessionId) continue;
      if (a.view.status === "idle") tasks.push(this.relaunchSlot(slot, a.view.sessionId, a.view.cut));
      else slot.relaunch = true;
    }
    await Promise.all(tasks);
  }

  /**
   * The conversation `cut` was last in: the one that took the project's turn on it if it's still on disk (it may have
   * started on another cut and made this one), else the default agent's latest on that cut. Sessions from before cuts
   * had conversations of their own come back only through the turn.
   */
  private async lastSession(project: string, cut: string): Promise<{ agent: AgentId; id: string } | undefined> {
    const turn = currentTurn(project);
    const known = turn?.session;
    if (known && turn.cut === cut && AGENT_IDS.includes(known.agent as AgentId)) {
      const list = await this.sessions(known.agent as AgentId, project).catch(() => []);
      if (list.some((x) => x.id === known.id)) return { agent: known.agent as AgentId, id: known.id };
    }
    const preferred = readSettings().agent?.id;
    if (!preferred) return undefined;
    const latest = (await this.sessions(preferred, project, cut).catch(() => [])).find((s) => s.cut === cut);
    return latest && { agent: preferred, id: latest.id };
  }

  /** The cut a request is about: the one named, else the one the project's turn is on, else the first. */
  private cutOf(project: string, cut?: string): string {
    if (cut) return cut;
    try {
      const { doc } = loadFile(project);
      const turnCut = currentTurn(project)?.cut;
      return (doc.cuts.find((c) => c.id === turnCut) ?? doc.cuts[0]!).id;
    } catch {
      return "main";
    }
  }

  /**
   * Opens a cut's conversation again (after the app restarts, or on switching to the project/cut), so its history shows
   * and messages go to the same thread. Leaves alone a session that's busy on another cut of this project, and one
   * already open here; other projects' sessions are unaffected. With "continue", an unfinished turn is carried on (in a
   * new conversation if the old one is gone); with "takeback", the turn comes back to the person. Without a cut, it's
   * the cut the project's turn is on.
   */
  async pickup(project: string, cutId?: string, then?: "continue" | "takeback"): Promise<{ resumed: boolean }> {
    if (then === "takeback") {
      if (currentTurn(project)?.who === "agent") yourTurn(project);
      return { resumed: false };
    }
    const cut = this.cutOf(project, cutId);
    const existing = this.slots.get(project);
    const v = existing ? this.slotView(existing) : offView();
    const busy = v.status === "running" || v.status === "starting";
    if (busy && !this.openOn(project, cut)) {
      if (then) throw new Error(`${AGENT_LABELS[v.agent ?? "claude"]} is busy on another cut`);
      return { resumed: false };
    }
    if (existing && this.openOn(project, cut)) {
      existing.touchedAt = ++this.touchSeq;
      this.lastKey = existing.key;
    }
    let resumed = false;
    if (!this.openOn(project, cut) && !busy && (!this.pickingUp.has(project) || !!then)) {
      this.pickingUp.add(project);
      try {
        const last = await this.lastSession(project, cut);
        // Re-check after awaiting disk/CLI lookup in case a session started meanwhile.
        if (last && !this.openOn(project, cut) && !this.busyElsewhere(project, cut)) {
          await this.resume(last.agent, last.id, project, cut);
          resumed = this.openOn(project, cut);
        }
      } finally {
        this.pickingUp.delete(project);
      }
    }
    if (then === "continue") {
      if (this.openOn(project, cut)) await this.send(CARRY_ON, undefined, project);
      else {
        const preferred = readSettings().agent;
        if (!preferred) throw new Error("No agent is set up yet. Pick one in Settings.");
        await this.start(preferred.id, { model: preferred.model, thinking: preferred.thinking, project, cut, then: CARRY_ON });
      }
    }
    return { resumed };
  }

  /**
   * Which CLIs are installed, and the models each offers (asked once, then remembered). Asking starts each CLI, which
   * takes a while (Antigravity's server most of all), so `quick` answers at once, with only the models that came
   * straight away; the rest are still being asked for, and the next full answer has them.
   */
  async agents(quick = false): Promise<AgentInfo[]> {
    return Promise.all(
      AGENT_IDS.map(async (id) => {
        const info: AgentInfo = { id, label: AGENT_LABELS[id], installed: !!(await findCli(id)), installCommand: SETUP[id].install, signInCommand: SETUP[id].signIn };
        if (!info.installed) return info;
        let versions = this.versions.get(id);
        if (!versions) this.versions.set(id, (versions = cliVersions(id).catch(() => ({}))));
        const v = await (quick ? Promise.race([versions, new Promise<undefined>((r) => setTimeout(r, 250))]) : versions);
        info.version = v?.version;
        info.latest = v?.latest && v.latest !== this.unreached.get(id) ? v.latest : undefined;
        const adapter = this.probe(id);
        let asking = this.models.get(id);
        if (!asking) {
          const started = adapter.models();
          this.models.set(id, started);
          // A failed ask is forgotten, so the next one asks again.
          started.catch(() => this.models.get(id) === started && this.models.delete(id));
          asking = started;
        }
        let askingThinking = this.thinking.get(id);
        if (!askingThinking && adapter.thinkingLevels) {
          const started = adapter.thinkingLevels();
          this.thinking.set(id, started);
          started.catch(() => this.thinking.get(id) === started && this.thinking.delete(id));
          askingThinking = started;
        }
        try {
          info.models = await (quick ? Promise.race([asking, new Promise<undefined>((r) => setTimeout(r, 250))]) : asking);
          if (askingThinking) {
            const levels = await (quick ? Promise.race([askingThinking, new Promise<undefined>((r) => setTimeout(r, 50))]) : askingThinking);
            if (levels?.length) info.thinkingLevels = levels;
          }
        } catch (err) {
          info.error = message(err);
        }
        return info;
      }),
    );
  }

  /** Installed and signed in? Runs the CLI on its probe adapter, so live project sessions stay untouched. */
  async check(id: AgentId): Promise<AgentCheck> {
    if (!(await findCli(id))) return { ok: false, detail: "Not installed" };
    // Checking again looks again at everything: the probe CLI is started afresh, and its models and version are asked
    // for anew (Muse Code's list, for one, is read when its server starts).
    this.probes.get(id)?.stop();
    this.models.delete(id);
    this.thinking.delete(id);
    this.versions.delete(id);
    try {
      const check = await this.probe(id).check();
      return { ...check, detail: brief(check.detail) };
    } catch (err) {
      return { ok: false, detail: brief(message(err)) };
    }
  }

  install(id: AgentId, onLine: (line: string) => void) {
    this.models.delete(id);
    this.thinking.delete(id);
    this.versions.delete(id);
    return installCli(id, onLine);
  }

  /**
   * Updates a CLI with its own updater. Its models are asked for again afterwards, from the new version; any open
   * sessions on it have to be let go first, since they're running the version being replaced.
   */
  async update(id: AgentId, onLine: (line: string) => void) {
    const open = [...this.slots.values()].filter((s) => s.adapter.id === id && s.adapter.view.status !== "off");
    if (open.length) {
      throw new Error(
        `${AGENT_LABELS[id]} has ${open.length === 1 ? "a session" : `${open.length} sessions`} open. Disconnect ${open.length === 1 ? "it" : "them"} in the Agent tab, then update.`,
      );
    }
    const offered = (await this.versions.get(id))?.latest;
    this.probes.get(id)?.stop();
    await updateCli(id, onLine);
    this.models.delete(id);
    this.thinking.delete(id);
    const now = cliVersions(id).catch(() => ({}));
    this.versions.set(id, now);
    const after: { version?: string; latest?: string } = await now;
    if (after.latest && after.latest === offered) this.unreached.set(id, after.latest);
    onLine(after.version ? `${AGENT_LABELS[id]} is on ${after.version}` : "Updated");
  }

  signIn(id: AgentId) {
    this.models.delete(id);
    this.thinking.delete(id);
    const a = this.probe(id);
    return a.signIn ? a.signIn() : openSignIn(id);
  }

  /**
   * Earlier sessions on `project`, and with `cut` just those on that cut (each session belongs to the cut it was
   * started on; ones from before cuts had their own belong to every cut).
   */
  async sessions(id: AgentId, project?: string, cut?: string): Promise<AgentSessionSummary[]> {
    const all = await this.probe(id).sessions();
    return all.filter((s) => (!project || s.project === project) && (!cut || !s.cut || s.cut === cut));
  }

  /** A new session on `opts.project`; its first message points it at the project's cut, with `then` (an answer, say) to act on. */
  async start(id: AgentId, opts: { model?: string; thinking?: string; project?: string; cut?: string; then?: string }) {
    const cut = opts.project ? this.cutOf(opts.project, opts.cut) : undefined;
    const slot = this.attachSlot(id, opts.project);
    const a = slot.adapter;
    await a.start({ ...opts, cut });
    if (this.slots.get(slot.key) !== slot) return;
    if (a.view.status === "error") {
      this.evictIdle(slot.key);
      return;
    }
    this.handed(slot);
    await a.send(openingPrompt(opts.project, opts.then, cut)).catch((err) => a.fail(err));
  }

  async resume(id: AgentId, sessionId: string, project?: string, cut?: string) {
    const slot = this.attachSlot(id, project);
    await slot.adapter.resume(sessionId, project, project ? this.cutOf(project, cut) : undefined);
    if (this.slots.get(slot.key) === slot) this.evictIdle(slot.key);
  }

  /** Whether there's a session to talk to about `project` (and, given one, that cut of it). */
  openOn(project: string, cut?: string) {
    const slot = this.slots.get(project);
    if (!slot) return false;
    const v = slot.adapter.view;
    return v.status !== "off" && v.status !== "error" && (!cut || v.cut === cut);
  }

  /** Working on another cut of this same project, so a new conversation here would cut it off. Other projects don't conflict. */
  busyElsewhere(project: string, cut?: string) {
    const slot = this.slots.get(project);
    if (!slot) return false;
    const s = slot.adapter.view.status;
    return (s === "running" || s === "starting") && !this.openOn(project, cut);
  }

  /**
   * Sends a message to `project`'s open session, or queues it while the agent is busy so it stays visible in the
   * conversation and runs next once the current turn finishes. Returns true when queued.
   */
  async send(text: string, notes?: QueuedNotes, project?: string): Promise<boolean> {
    const slot = this.resolveSlot(project ?? notes?.project);
    if (!slot) throw new Error("No agent is connected");
    slot.touchedAt = ++this.touchSeq;
    this.lastKey = slot.key;
    const a = slot.adapter;
    if (a.view.status === "running" || a.view.status === "starting") {
      const id = uuid7();
      slot.queue.push({ id, raw: text, shown: { id, ...readStudioMessage(text) }, notes });
      this.emitSlotView(slot);
      return true;
    }
    slot.interrupted = false;
    this.handed(slot);
    await a.send(text);
    return false;
  }

  /**
   * Sends a queued message right away: immediately if idle, via native mid-turn steer when supported, or by stopping
   * the current turn and starting this message as soon as it cancels.
   */
  async sendQueued(id: string, project?: string) {
    const slot = project !== undefined ? this.slots.get(project) : (this.slotByQueued(id) ?? this.resolveSlot());
    if (!slot) return;
    const idx = slot.queue.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const a = slot.adapter;
    slot.touchedAt = ++this.touchSeq;
    // Re-read status through a helper because `a.view` can transition across `await` boundaries.
    const statusOf = (): AgentView["status"] => a.view.status;
    if (statusOf() === "idle") {
      const [item] = slot.queue.splice(idx, 1);
      slot.pendingSendNow = undefined;
      slot.interrupted = false;
      this.emitSlotView(slot);
      this.handed(slot);
      await a.send(item!.raw);
      return;
    }
    if (statusOf() !== "running") return;
    if (a.steer) {
      const [item] = slot.queue.splice(idx, 1);
      this.emitSlotView(slot);
      slot.steering = true;
      let ok = false;
      try {
        ok = await a.steer(item!.raw).catch(() => false);
      } finally {
        slot.steering = false;
      }
      if (ok) {
        slot.interrupted = false;
        if (this.slots.get(slot.key) === slot && statusOf() === "idle") this.onStatusChange(slot, "running", "idle", a.view.error);
        return;
      }
      if (this.slots.get(slot.key) !== slot) return;
      if (statusOf() === "idle") {
        slot.interrupted = false;
        this.handed(slot);
        await a.send(item!.raw);
        return;
      }
      slot.queue.unshift(item!);
    } else if (idx > 0) {
      const [item] = slot.queue.splice(idx, 1);
      slot.queue.unshift(item!);
    }
    const target = slot.queue[0]!;
    for (const q of slot.queue) q.shown.sending = q.id === target.id ? true : undefined;
    slot.pendingSendNow = target.id;
    slot.interrupted = false;
    this.emitSlotView(slot);
    await a.interrupt();
    if (this.slots.get(slot.key) === slot && statusOf() === "idle" && slot.pendingSendNow === target.id) {
      this.dispatchNext(slot, true);
    }
  }

  /** Removes a queued message before it runs, putting any attached notes back in the composer. */
  removeQueued(id: string, project?: string) {
    const slot = project !== undefined ? this.slots.get(project) : (this.slotByQueued(id) ?? this.resolveSlot());
    if (!slot) return;
    const idx = slot.queue.findIndex((q) => q.id === id);
    if (idx < 0) return;
    const [removed] = slot.queue.splice(idx, 1);
    if (removed!.notes) restoreNotes(removed!.notes.project, removed!.notes.batch, removed!.notes.cut);
    if (slot.pendingSendNow === id) {
      slot.pendingSendNow = undefined;
      slot.interrupted = true;
    }
    this.emitSlotView(slot);
  }

  async interrupt(project?: string) {
    const slot = this.resolveSlot(project);
    if (!slot) return;
    let changed = false;
    for (const q of slot.queue) {
      if (q.shown.sending) {
        q.shown.sending = undefined;
        changed = true;
      }
    }
    slot.pendingSendNow = undefined;
    slot.interrupted = true;
    if (changed) this.emitSlotView(slot);
    await slot.adapter.interrupt();
  }

  async decide(approvalId: string, choiceId: string, project?: string) {
    const slot = project !== undefined ? this.slots.get(project) : (this.slotByApproval(approvalId) ?? this.resolveSlot());
    if (!slot) return;
    slot.touchedAt = ++this.touchSeq;
    slot.adapter.markHeard();
    await slot.adapter.decide(approvalId, choiceId);
  }

  stop(project?: string) {
    const slot = this.resolveSlot(project);
    if (!slot) return;
    this.dropSlot(slot, true);
  }

  /** Stops every CLI (all project sessions and probes), for when the studio shuts down. */
  close() {
    for (const slot of [...this.slots.values()]) {
      this.clearQueue(slot, false);
      slot.unsubscribe();
      slot.adapter.stop();
    }
    this.slots.clear();
    this.lastKey = undefined;
    for (const a of this.probes.values()) a.stop();
    this.probes.clear();
  }
}

/** What an interrupted agent is told when the person asks it to carry on. */
const CARRY_ON =
  "beatsheet was closed (or you stopped) partway through your turn on this project, so anything you were waiting on, like a command needing approval, didn't happen. Check where the project stands with get_project, carry on from there, and end the turn with hand_off.";

let studio: AgentStudio | undefined;
/** The studio's hosted agent sessions (up to one per project), created on first use. */
export const agentStudio = () => (studio ??= new AgentStudio());
