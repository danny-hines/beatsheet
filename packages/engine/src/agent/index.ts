/**
 * The agent the studio hosts: Muse Code, Codex, Claude Code or Antigravity, one at a time, each on the person's own CLI and sign-in.
 * Whichever is running, the studio sees the same view and changes.
 */
import { EventEmitter } from "node:events";
import { openingPrompt } from "../agents.ts";
import { readSettings } from "../settings.ts";
import { loadFile } from "../store.ts";
import { agentsTurn, currentTurn, yourTurn } from "../turns.ts";
import { AntigravityAdapter } from "./antigravity.ts";
import { ClaudeAdapter } from "./claude.ts";
import { cliVersions, findCli, installCli, openSignIn, SETUP, updateCli } from "./cli.ts";
import { CodexAdapter } from "./codex.ts";
import { MuseAdapter } from "./muse.ts";
import { AGENT_LABELS, brief, message, offView, touchesKeys, type AgentAdapter, type AgentChange, type AgentCheck, type AgentId, type AgentModel, type AgentSessionSummary, type AgentView } from "./session.ts";

export * from "./session.ts";
export { uuid7 } from "./rpc.ts";

export const AGENT_IDS: AgentId[] = ["muse", "codex", "claude", "antigravity"];
/** An agent CLI: whether it's here, how to get it working, and its models once it is. */
export type AgentInfo = {
  id: AgentId;
  label: string;
  installed: boolean;
  installCommand?: string;
  signInCommand: string;
  models?: AgentModel[];
  error?: string;
  /** The CLI's version, and a later one when beatsheet can update it to that. */
  version?: string;
  latest?: string;
};

const make = (id: AgentId): AgentAdapter =>
  id === "muse" ? new MuseAdapter() : id === "codex" ? new CodexAdapter() : id === "antigravity" ? new AntigravityAdapter() : new ClaudeAdapter();

export class AgentStudio extends EventEmitter {
  private adapters = new Map<AgentId, AgentAdapter>();
  /** Reopen the Claude Code session when it's next idle, so it starts with the current permission flags. */
  private relaunch = false;
  private current?: AgentAdapter;
  /** Each CLI's models, asked once: the answer, or the asking still under way. */
  private models = new Map<AgentId, Promise<AgentModel[]>>();
  /** Each CLI's version and whether there's a later one, likewise. */
  private versions = new Map<AgentId, Promise<{ version?: string; latest?: string }>>();
  /** A version an update didn't reach (the CLI's own channel is behind npm's): not offered again. */
  private unreached = new Map<AgentId, string>();

  get view(): AgentView {
    return this.current?.view ?? offView();
  }

  private adapter(id: AgentId): AgentAdapter {
    let a = this.adapters.get(id);
    if (!a) {
      const made = make(id);
      let was = made.view.status;
      made.on("change", (c: AgentChange) => {
        if (made !== this.current) return;
        this.emit("change", c);
        if (c.type !== "view") return;
        // A hosted agent that stops without handing off still gives the turn back.
        if (was === "running" && c.view.status === "idle" && c.view.project) this.turnBack(c.view.project);
        // A permissions change that came mid-turn: reopen the conversation with the new flags once it's done.
        if (this.relaunch && c.view.status === "idle" && made.view.sessionId) {
          this.relaunch = false;
          void this.resume(id, made.view.sessionId, made.view.project, made.view.cut);
        }
        was = c.view.status;
      });
      this.adapters.set(id, made);
      a = made;
    }
    return a;
  }

  private turnBack(project: string) {
    try {
      if (currentTurn(project)?.who === "agent") yourTurn(project);
    } catch {
      // the project went away
    }
  }

  /** Something was handed to the agent on this project: its turn now, on this conversation's cut. */
  private handed() {
    const a = this.current;
    const project = a?.view.project;
    if (!a || !project) return;
    try {
      agentsTurn(project, a.view.cut ?? currentTurn(project)?.cut, a.view.sessionId ? { agent: a.id, id: a.view.sessionId } : undefined);
    } catch {
      // the project went away
    }
  }

  /**
   * The person changed how much the agent does without asking. Letting it work freely settles what's waiting now
   * (anything but keys); a Claude Code session reopens with the matching flags straight away if it's idle, otherwise as
   * soon as its turn ends.
   */
  async autonomyChanged(level: "ask" | "free") {
    const a = this.current;
    if (!a || a.view.status === "off") return;
    if (level === "free") {
      for (const ap of a.view.approvals) {
        const yes = ap.choices.find((c) => c.id === "session") ?? ap.choices.find((c) => c.primary);
        if (yes && !touchesKeys(ap.detail)) await a.decide(ap.id, yes.id).catch(() => {});
      }
    }
    await this.reopenSession();
  }

  /** The person turned working in their Chrome on or off: the open session reopens with the tools to match. */
  async chromeChanged() {
    await this.reopenSession(true);
  }

  /**
   * Reopens an open session with the current flags and tools: now if it's idle, else when its turn ends. Only Claude
   * Code takes its permissions at launch; every agent takes its tools then.
   */
  private async reopenSession(anyAgent = false) {
    const a = this.current;
    if (!a || (a.id !== "claude" && !anyAgent) || a.view.status === "off" || !a.view.sessionId) return;
    if (a.view.status === "idle") await this.resume(a.id, a.view.sessionId, a.view.project, a.view.cut);
    else this.relaunch = true;
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
   * Opens a cut's conversation again (after the app restarts, or on switching to the cut), so its history shows and
   * messages go to the same thread. Leaves alone a session that's busy, and one already open here. With "continue",
   * an unfinished turn is carried on (in a new conversation if the old one is gone); with "takeback", the turn comes
   * back to the person. Without a cut, it's the cut the project's turn is on.
   */
  async pickup(project: string, cutId?: string, then?: "continue" | "takeback"): Promise<{ resumed: boolean }> {
    if (then === "takeback") {
      if (currentTurn(project)?.who === "agent") yourTurn(project);
      return { resumed: false };
    }
    const cut = this.cutOf(project, cutId);
    const busy = this.view.status === "running" || this.view.status === "starting";
    if (busy && !this.openOn(project, cut)) {
      if (then) throw new Error(`${AGENT_LABELS[this.view.agent ?? "claude"]} is busy on ${this.view.project === project ? "another cut" : "another project"}`);
      return { resumed: false };
    }
    let resumed = false;
    if (!this.openOn(project, cut) && !busy) {
      const last = await this.lastSession(project, cut);
      if (last) {
        await this.resume(last.agent, last.id, project, cut);
        resumed = this.openOn(project, cut);
      }
    }
    if (then === "continue") {
      if (this.openOn(project, cut)) await this.send(CARRY_ON);
      else {
        const preferred = readSettings().agent;
        if (!preferred) throw new Error("No agent is set up yet. Pick one in Settings.");
        await this.start(preferred.id, { model: preferred.model, project, cut, then: CARRY_ON });
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
        let asking = this.models.get(id);
        if (!asking) {
          const started = this.adapter(id).models();
          this.models.set(id, started);
          // A failed ask is forgotten, so the next one asks again.
          started.catch(() => this.models.get(id) === started && this.models.delete(id));
          asking = started;
        }
        try {
          info.models = await (quick ? Promise.race([asking, new Promise<undefined>((r) => setTimeout(r, 250))]) : asking);
        } catch (err) {
          info.error = message(err);
        }
        return info;
      }),
    );
  }

  /** Installed and signed in? Runs the CLI, so it takes a few seconds. */
  async check(id: AgentId): Promise<AgentCheck> {
    if (!(await findCli(id))) return { ok: false, detail: "Not installed" };
    // Checking again looks again at everything: unless a session is open on it, the CLI is started afresh, and its
    // models and version are asked for anew (Muse Code's list, for one, is read when its server starts).
    if (this.current?.id !== id || this.view.status === "off") {
      this.adapters.get(id)?.stop();
      this.models.delete(id);
      this.versions.delete(id);
    }
    try {
      const check = await this.adapter(id).check();
      return { ...check, detail: brief(check.detail) };
    } catch (err) {
      return { ok: false, detail: brief(message(err)) };
    }
  }

  install(id: AgentId, onLine: (line: string) => void) {
    this.models.delete(id);
    this.versions.delete(id);
    return installCli(id, onLine);
  }

  /**
   * Updates a CLI with its own updater. Its models are asked for again afterwards, from the new version; a session
   * that's open on it has to be let go first, since it's running the version being replaced.
   */
  async update(id: AgentId, onLine: (line: string) => void) {
    if (this.current?.id === id && this.view.status !== "off") throw new Error(`${AGENT_LABELS[id]} has a session open. Stop it from the top bar, then update.`);
    const offered = (await this.versions.get(id))?.latest;
    this.adapters.get(id)?.stop();
    await updateCli(id, onLine);
    this.models.delete(id);
    const now = cliVersions(id).catch(() => ({}));
    this.versions.set(id, now);
    const after: { version?: string; latest?: string } = await now;
    if (after.latest && after.latest === offered) this.unreached.set(id, after.latest);
    onLine(after.version ? `${AGENT_LABELS[id]} is on ${after.version}` : "Updated");
  }

  signIn(id: AgentId) {
    this.models.delete(id);
    const a = this.adapter(id);
    return a.signIn ? a.signIn() : openSignIn(id);
  }

  /**
   * Earlier sessions on `project`, and with `cut` just those on that cut (each session belongs to the cut it was
   * started on; ones from before cuts had their own belong to every cut).
   */
  async sessions(id: AgentId, project?: string, cut?: string): Promise<AgentSessionSummary[]> {
    const all = await this.adapter(id).sessions();
    return all.filter((s) => (!project || s.project === project) && (!cut || !s.cut || s.cut === cut));
  }

  /** Switches to `id`, letting any other agent go. */
  private use(id: AgentId): AgentAdapter {
    if (this.current && this.current.id !== id) this.current.stop();
    this.current = this.adapter(id);
    return this.current;
  }

  /** A new session; its first message points it at the project's cut, with `then` (an answer, say) to act on. */
  async start(id: AgentId, opts: { model?: string; project?: string; cut?: string; then?: string }) {
    const cut = opts.project ? this.cutOf(opts.project, opts.cut) : undefined;
    const a = this.use(id);
    await a.start({ ...opts, cut });
    if (a.view.status === "error") return;
    this.handed();
    await a.send(openingPrompt(opts.project, opts.then, cut)).catch((err) => a.fail(err));
  }

  async resume(id: AgentId, sessionId: string, project?: string, cut?: string) {
    await this.use(id).resume(sessionId, project, project ? this.cutOf(project, cut) : undefined);
  }

  /** Whether there's a session to talk to about `project` (and, given one, that cut of it). */
  openOn(project: string, cut?: string) {
    return !!this.current && this.view.status !== "off" && this.view.status !== "error" && this.view.project === project && (!cut || this.view.cut === cut);
  }

  /** Working on something other than this cut of this project, so a new conversation here would cut it off. */
  busyElsewhere(project: string, cut?: string) {
    return (this.view.status === "running" || this.view.status === "starting") && !this.openOn(project, cut);
  }

  async send(text: string) {
    if (!this.current) throw new Error("No agent is connected");
    this.handed();
    await this.current.send(text);
  }

  async interrupt() {
    await this.current?.interrupt();
  }

  async decide(approvalId: string, choiceId: string) {
    await this.current?.decide(approvalId, choiceId);
  }

  stop() {
    const a = this.current;
    this.current = undefined;
    a?.stop();
    this.emit("change", { type: "view", view: offView() } satisfies AgentChange);
  }

  /** Stops every CLI, for when the studio shuts down. */
  close() {
    for (const a of this.adapters.values()) a.stop();
    this.current = undefined;
  }
}

/** What an interrupted agent is told when the person asks it to carry on. */
const CARRY_ON =
  "beatsheet was closed (or you stopped) partway through your turn on this project, so anything you were waiting on, like a command needing approval, didn't happen. Check where the project stands with get_project, carry on from there, and end the turn with hand_off.";

let studio: AgentStudio | undefined;
/** The one agent session the studio hosts, created on first use. */
export const agentStudio = () => (studio ??= new AgentStudio());
