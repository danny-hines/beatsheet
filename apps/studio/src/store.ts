/**
 * App state: the open project plus everything about the view of it. Every change to the project goes through
 * `edit`, which records undo history and schedules a save, so nothing the user does is lost or unrecoverable.
 */
import type { AgentChange, AgentInfo, AgentView, Capability, Presence, ProjectSummary, SamStatus, ServiceInfo, Settings } from "@beatsheet/engine";
import {
  branchCut,
  cutOf,
  cutView,
  freshCut,
  parseFile,
  resolveTimeline,
  withCut,
  type CutSpec,
  type Format,
  type Note,
  type NoteTarget,
  type Project,
  type ProjectFile,
  type Timeline,
} from "@beatsheet/schema";
import { useSyncExternalStore } from "react";

export type Selection =
  | { kind: "shot"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "line"; id: string }
  | { kind: "cue"; id: string }
  | { kind: "note"; id: string }
  | { kind: "cast"; id: string };

export type { ProjectSummary };

/** The live player, when one is on screen. While it exists it is the clock: play, pause and seeks go through it. */
export type PlayerHandle = { play(): void; pause(): void; toggle(): void; seekTo(frame: number): void; fps: number };
let player: PlayerHandle | undefined;
export function registerPlayer(p: PlayerHandle | undefined) {
  player = p;
}
export const hasPlayer = () => !!player;

export type State = {
  list: ProjectSummary[];
  /** The project list has loaded at least once (an empty list then means there are no projects). */
  listed: boolean;
  projectId?: string;
  /** The whole project file: every cut plus the shared footage and brief. */
  doc?: ProjectFile;
  /** The cut on screen. */
  cutId?: string;
  /** Editing the cut, or making stills and clips for it (the hash carries it: #project/cut/make). */
  mode: "edit" | "make";
  /** The cut on screen together with the shared material; what views and edits work on. Always `cutView(doc, cutId)`. */
  project?: Project;
  /** Version of the file the open project came from; saves are refused if the file moved on. */
  version?: string;
  /** A short message about something that happened behind the user's back, like an agent's edit. */
  notice?: string;
  /** A word about an edit that just happened (or couldn't), shown for a moment in the timeline's toolbar. */
  hint?: string;
  loadError?: string[];
  /** Earlier and later versions of the whole file, for undo and redo. */
  past: ProjectFile[];
  future: ProjectFile[];
  save: "saved" | "dirty" | "saving" | "error";
  saveError?: string;
  format: string;
  selection?: Selection;
  /** More shots selected with the one in `selection` (⇧-click for a run on a track, ⌘-click for one more). */
  also: string[];
  playhead: number;
  playing: boolean;
  /** How fast the player plays: 1, faster with L, backwards with J. */
  rate: number;
  /** In and out points marked on the cut (I and O): a stretch to take out, note or export. */
  marks: { in?: number; out?: number };
  /** In and out points marked on a clip in the Library (I and O while it's open), for putting that stretch in the cut. */
  source?: { asset: string; in?: number; out?: number };
  /** Timeline zoom in pixels per second; 0 means fit to width on next layout. */
  zoom: number;
  side: "inspect" | "notes" | "agent";
  /** Agent sessions that have beatsheet's tools loaded right now, hosted here or running in a terminal. */
  agents: Presence[];
  /** The agent session the studio hosts: its transcript, approvals and whether it's working. */
  agent: AgentView;
  /** The agent CLIs: which are installed and the models each offers. Loaded when first needed. */
  agentList?: AgentInfo[];
  newProjectOpen: boolean;
  /** How the new project starts, when that's already chosen: from a folder (picked, or dropped on the window), or empty. */
  newProjectStart?: { folder: string } | "scratch";
  /** The person's setup: default agent, services with keys, and what those let the agent do. */
  setup?: { settings: Settings; services: ServiceInfo[]; capabilities: Capability[]; vision?: { ok: boolean; detail: string }; sam?: SamStatus };
  /** The settings have been asked for once (whether or not that worked), so first launch can be told apart. */
  settingsLoaded: boolean;
  /** The Settings dialog. First launch has a screen of its own instead. */
  settingsOpen: boolean;
  /** Which pane Settings opens on, when something asked for one (e.g. "voices"). */
  settingsPane?: string;
  /** Bumped when the open project's scene code changes, so the player reloads its scenes. */
  codeVersion?: string;
  /** The note being written (or edited), and where on screen its editor sits. */
  noteDraft?: NoteDraft;
};

/** A note in the making: what it's about, and for a new one when and where in the frame. */
export type NoteDraft = { id?: string; target: NoteTarget; at?: number; region?: Note["region"]; text: string; x: number; y: number };

let state: State = {
  list: [],
  listed: false,
  past: [],
  future: [],
  save: "saved",
  format: "",
  mode: "edit",
  also: [],
  playhead: 0,
  playing: false,
  rate: 1,
  marks: {},
  zoom: 0,
  side: "agent",
  agents: [],
  agent: { status: "off", items: [], approvals: [] },
  newProjectOpen: false,
  settingsLoaded: false,
  settingsOpen: false,
};
const listeners = new Set<() => void>();

export const getState = () => state;
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  for (const l of listeners) l();
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Subscribe to one slice. The selector must return something stable (a field, not a new object). */
export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

// ---- Timeline, resolved once per project version and format.
let tlCache: { project?: Project; format?: string; tl?: Timeline } = {};
export function timelineFor(project: Project, format: string): Timeline {
  if (tlCache.project !== project || tlCache.format !== format || !tlCache.tl) {
    tlCache = { project, format, tl: resolveTimeline(project, format) };
  }
  return tlCache.tl!;
}
export function useProject(): Project {
  const p = useStore((s) => s.project);
  if (!p) throw new Error("no project open");
  return p;
}
export function useTimeline(): Timeline {
  const project = useProject();
  const format = useStore((s) => s.format);
  return timelineFor(project, format);
}

// ---- Saving.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
}
async function saveNow() {
  const { doc, projectId } = state;
  if (!doc || !projectId) return;
  setState({ save: "saving" });
  try {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project: doc, version: state.version }),
    });
    if (res.status === 409) {
      await actions.reload("This project changed on disk (probably the agent), so your last edit wasn't saved. Reloaded the latest version.");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("\n");
      throw new Error(msg || body.error || `save failed (${res.status})`);
    }
    const { version } = (await res.json()) as { version: string };
    setState(state.doc === doc ? { save: "saved", saveError: undefined, version } : { version });
  } catch (err) {
    setState({ save: "error", saveError: String(err instanceof Error ? err.message : err) });
  }
}

/** Folds one streamed change into the agent view. A view change carries every field but the transcript. */
function applyAgentChange(v: AgentView, c: AgentChange): AgentView {
  if (c.type === "view") return { ...c.view, items: c.view.items ?? v.items, approvals: c.view.approvals ?? v.approvals };
  if (c.type === "item") {
    const i = v.items.findIndex((x) => x.id === c.item.id);
    return { ...v, items: i < 0 ? [...v.items, c.item] : v.items.map((x, j) => (j === i ? c.item : x)) };
  }
  return {
    ...v,
    items: v.items.map((x) => {
      if (x.id !== c.itemId) return x;
      if (c.field === "text") return { ...x, text: (x.text ?? "") + c.delta };
      if (!c.field.startsWith("summary.")) return x;
      const n = Number(c.field.slice(8));
      const summary = [...(x.summary ?? [])];
      summary[n] = (summary[n] ?? "") + c.delta;
      return { ...x, summary };
    }),
  };
}

/** The cut to show for a project: the one asked for, else the one last looked at there, else the first. */
const rememberedCut = (id: string) => {
  try {
    return localStorage.getItem(`beatsheet.cut.${id}`) ?? undefined;
  } catch {
    return undefined;
  }
};
/**
 * Each cut has its own conversation: on opening one, its last conversation comes back (after a restart, say), unless
 * the agent is busy elsewhere or it's already open.
 */
function pickUpCut(project: string, cut: string) {
  const a = state.agent;
  const busy = a.status === "running" || a.status === "starting";
  if (busy || (a.project === project && a.cut === cut && a.status !== "off" && a.status !== "error")) return;
  void fetch("/api/agent/pickup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project, cut }) }).catch(() => {});
}

const showCut = (projectId: string, cutId: string) => {
  try {
    localStorage.setItem(`beatsheet.cut.${projectId}`, cutId);
  } catch {
    // private window; it just won't remember
  }
  history.replaceState(null, "", `#${projectId}/${cutId}${state.mode === "make" ? "/make" : ""}`);
};

/** Puts a new version of the file on screen, keeping the cut and format when they still exist. */
function showDoc(doc: ProjectFile, patch: Partial<State> = {}): Partial<State> {
  const cutId = cutOf(doc, patch.cutId ?? state.cutId).id;
  const project = cutView(doc, cutId);
  const format = project.formats.some((f) => f.id === (patch.format ?? state.format)) ? (patch.format ?? state.format) : project.formats[0]!.id;
  return { ...patch, doc, cutId, project, format };
}

// ---- Actions.
/** Engine jobs the studio started that change the project; see actions.quietly. */
let quiet = 0;

export const actions = {
  async loadAgents() {
    const res = await fetch("/api/agents");
    if (res.ok) setState({ agents: (await res.json()) as Presence[] });
  },
  setAgents(agents: Presence[]) {
    setState({ agents });
  },
  async loadAgent() {
    const res = await fetch("/api/agent");
    if (res.ok) setState({ agent: (await res.json()) as AgentView });
  },
  /**
   * Checks which agent CLIs are installed, then what models they offer. The first answer comes at once; the models
   * follow, since starting each CLI to ask takes a moment.
   */
  async loadAgentList() {
    for (const path of ["/api/agent/list?quick", "/api/agent/list"]) {
      const res = await fetch(path);
      if (res.ok) setState({ agentList: (await res.json()) as AgentInfo[] });
    }
  },
  applyAgent(change: AgentChange) {
    setState((s) => ({ agent: applyAgentChange(s.agent, change) }));
  },
  /** Asks the hosted agent to do something; what happens shows up through `applyAgent`. */
  async agentCommand(command: "start" | "resume" | "send" | "interrupt" | "approval" | "stop", body: Record<string, unknown> = {}) {
    const res = await fetch(`/api/agent/${command}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ notice: `Agent: ${out.error ?? "that didn't go through"}` });
    }
  },
  async loadSettings() {
    const res = await fetch("/api/settings").catch(() => undefined);
    if (!res?.ok) return setState({ settingsLoaded: true });
    setState({ setup: (await res.json()) as NonNullable<State["setup"]>, settingsLoaded: true });
  },
  setSettingsOpen(open: boolean, pane?: string) {
    setState({ settingsOpen: open, settingsPane: open ? pane : undefined });
    if (open) void actions.loadSettings();
  },
  setNewProjectOpen(open: boolean, start?: State["newProjectStart"]) {
    setState({ newProjectOpen: open, newProjectStart: open ? start : undefined });
  },
  /** Saves now instead of waiting for the debounce, so the server sees every edit before acting on the project. */
  async flushSave() {
    if (state.save === "dirty") {
      clearTimeout(saveTimer);
      await saveNow();
    }
  },
  async loadList() {
    const res = await fetch("/api/projects");
    setState({ list: await res.json(), listed: true });
  },

  async open(id: string, cut?: string, mode: State["mode"] = "edit") {
    clearTimeout(saveTimer);
    const res = await fetch(`/api/projects/${id}`);
    // Gone since it was linked (deleted, or renamed on disk): stay on the list.
    if (res.status === 404) return actions.goHome();
    const body = (await res.json()) as { project: unknown; version: string };
    const parsed = parseFile(body.project);
    if (!parsed.ok) {
      setState({ projectId: id, doc: undefined, project: undefined, loadError: parsed.issues.map((i) => `${i.path}: ${i.message}`) });
      return;
    }
    const doc = parsed.file;
    const cutId = cutOf(doc, cut ?? rememberedCut(id)).id;
    const p = cutView(doc, cutId);
    setState({
      projectId: id,
      doc,
      cutId,
      project: p,
      version: body.version,
      notice: undefined,
      loadError: undefined,
      past: [],
      future: [],
      save: "saved",
      format: p.formats[0]!.id,
      selection: undefined,
      also: [],
      marks: {},
      source: undefined,
      playhead: 0,
      playing: false,
      rate: 1,
      zoom: 0,
      mode,
    });
    showCut(id, cutId);
    pickUpCut(id, cutId);
  },

  /** Back to the list of projects. A hosted agent keeps working on its project meanwhile. */
  async goHome() {
    await actions.flushSave();
    if (state.save === "error" && !window.confirm(`Your last changes couldn't be saved${state.saveError ? ` (${state.saveError})` : ""}. Leave the project anyway?`)) return;
    player?.pause();
    setState({
      projectId: undefined,
      doc: undefined,
      cutId: undefined,
      project: undefined,
      version: undefined,
      loadError: undefined,
      notice: undefined,
      past: [],
      future: [],
      save: "saved",
      saveError: undefined,
      selection: undefined,
      playing: false,
      playhead: 0,
      noteDraft: undefined,
    });
    history.replaceState(null, "", location.pathname + location.search);
    await actions.loadList();
  },

  /** Moves a project's folder to the Trash (its footage stays where it is). Returns why, if it couldn't. */
  async trashProject(id: string): Promise<string | undefined> {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't move it to the Trash";
    await actions.loadList();
  },

  /** Edit the cut, or make stills and clips for it. */
  setMode(mode: State["mode"]) {
    if (mode === state.mode || !state.projectId) return;
    if (mode === "make") player?.pause();
    setState({ mode, playing: false });
    showCut(state.projectId, state.cutId!);
  },
  /** Shows another cut of the open project. */
  setCut(cutId: string) {
    const { doc, projectId } = state;
    if (!doc || !projectId || cutId === state.cutId) return;
    player?.pause();
    setState(showDoc(doc, { cutId, selection: undefined, also: [], marks: {}, playhead: 0, playing: false, zoom: 0 }));
    showCut(projectId, state.cutId!);
    pickUpCut(projectId, state.cutId!);
  },
  /** Opens the note editor about `target` near (x, y), or on an existing note to change its text. */
  noteOn(target: NoteTarget, pos: { x: number; y: number }, extra: { id?: string; at?: number; region?: Note["region"]; text?: string } = {}) {
    setState({ noteDraft: { target, text: extra.text ?? "", x: pos.x, y: pos.y, id: extra.id, at: extra.at, region: extra.region } });
  },
  closeNote() {
    setState({ noteDraft: undefined });
  },
  /**
   * Keeps the note: attached to the next message (it goes when the person sends), not sent on its own. Notes on the
   * timeline remember the playhead and format they were made at.
   */
  saveNote(text: string) {
    const d = state.noteDraft;
    if (!d) return;
    setState({ noteDraft: undefined });
    if (!text.trim()) return;
    actions.edit((p) => {
      if (d.id) {
        const n = p.notes.find((x) => x.id === d.id);
        if (n) n.text = text.trim();
        return;
      }
      let k = p.notes.length + 1;
      while (p.notes.some((x) => x.id === `n${k}`)) k++;
      const onTimeline = d.target.kind !== "asset" && d.target.kind !== "project";
      p.notes.push({
        id: `n${k}`,
        text: text.trim(),
        status: "queued",
        target: d.target,
        at: d.at ?? (onTimeline ? Math.round(state.playhead * 100) / 100 : undefined),
        region: d.region,
        format: onTimeline ? state.format : undefined,
        author: "you",
        createdAt: new Date().toISOString(),
      });
    });
  },
  removeNote(id: string) {
    actions.edit((p) => void (p.notes = p.notes.filter((n) => n.id !== id)));
  },

  /** A new cut copied from another (the one on screen unless `from` says), which then shows. Returns its id. */
  branchCut(name: string, opts: { from?: string; spec?: CutSpec; note?: string } = {}): string | undefined {
    const { doc, cutId, projectId } = state;
    if (!doc || !cutId || !projectId) return;
    const r = branchCut(doc, opts.from ?? cutId, { name, spec: opts.spec, origin: { by: "you", note: opts.note } });
    setState({ ...showDoc(r.file, { cutId: r.cut.id, selection: undefined, playhead: 0, playing: false, zoom: 0 }), past: [...state.past.slice(-99), doc], future: [], save: "dirty" });
    showCut(projectId, r.cut.id);
    scheduleSave();
    return r.cut.id;
  },
  /**
   * A new cut from scratch beside the one on screen, which then shows: no shots and no music, a blank slate for the
   * agent (or the person) to choose footage and a song for. Returns its id.
   */
  freshCut(name: string, opts: { formats: Format[]; spec: CutSpec; note?: string }): string | undefined {
    const { doc, cutId, projectId } = state;
    if (!doc || !cutId || !projectId) return;
    const r = freshCut(doc, cutId, { name, formats: opts.formats, spec: opts.spec, origin: { by: "you", note: opts.note } });
    setState({ ...showDoc(r.file, { cutId: r.cut.id, selection: undefined, playhead: 0, playing: false, zoom: 0 }), past: [...state.past.slice(-99), doc], future: [], save: "dirty" });
    showCut(projectId, r.cut.id);
    scheduleSave();
    return r.cut.id;
  },
  /** Renames any cut, not just the one on screen. */
  renameCut(cutId: string, name: string) {
    const { doc } = state;
    if (!doc || !name.trim()) return;
    const next = { ...doc, cuts: doc.cuts.map((c) => (c.id === cutId ? { ...c, name: name.trim() } : c)) };
    setState({ ...showDoc(next), past: [...state.past.slice(-99), doc], future: [], save: "dirty" });
    scheduleSave();
  },
  /** Removes a cut (never the last one); its notes go with it. Undo brings it back. */
  deleteCut(cutId: string) {
    const { doc, projectId } = state;
    if (!doc || !projectId || doc.cuts.length < 2) return;
    const next = { ...doc, cuts: doc.cuts.filter((c) => c.id !== cutId) };
    setState({ ...showDoc(next, cutId === state.cutId ? { cutId: next.cuts[0]!.id, selection: undefined, playhead: 0 } : {}), past: [...state.past.slice(-99), doc], future: [], save: "dirty" });
    showCut(projectId, state.cutId!);
    scheduleSave();
  },

  /** Re-reads the open project from disk, keeping the view (format, stage, selection, playhead). */
  async reload(notice?: string) {
    const id = state.projectId;
    if (!id) return;
    clearTimeout(saveTimer);
    const res = await fetch(`/api/projects/${id}`);
    const body = (await res.json()) as { project: unknown; version: string };
    const parsed = parseFile(body.project);
    if (!parsed.ok) {
      setState({ loadError: parsed.issues.map((i) => `${i.path}: ${i.message}`) });
      return;
    }
    setState(showDoc(parsed.file, { version: body.version, past: [], future: [], save: "saved", saveError: undefined, notice }));
  },
  /**
   * Runs something the studio asked the engine to do to the project (save a recording, voice the narration): the
   * change it makes on disk reloads quietly, without saying the project changed outside the studio.
   */
  async quietly<T>(fn: () => Promise<T>): Promise<T> {
    quiet++;
    try {
      return await fn();
    } finally {
      setTimeout(() => quiet--, 2000);
    }
  },
  /** Called when a project file changes on disk; ignores our own saves. */
  externalChange(id: string, version: string) {
    // On the project list, the cards show turns and footage, so any project changing refreshes them.
    if (!state.projectId) return void actions.loadList();
    if (id !== state.projectId || version === state.version) return;
    if (state.save === "dirty" || state.save === "saving") return; // our pending save will hit the conflict and reload
    // The agent working in the studio is expected to change things; say so only if its tab isn't already showing that.
    const working = state.agent.status === "running";
    if (quiet) return void actions.reload();
    void actions.reload(working ? (state.side === "agent" ? undefined : "The agent changed the project.") : "Updated from disk: the project was changed outside the studio.");
  },
  dismissNotice() {
    setState({ notice: undefined });
  },

  /** The one way to change the project: mutate a copy of the cut on screen, keep the old file for undo, save soon. */
  edit(fn: (draft: Project) => void) {
    const { doc, project } = state;
    if (!doc || !project) return;
    const draft = structuredClone(project);
    fn(draft);
    setState({ ...showDoc(withCut(doc, draft)), past: [...state.past.slice(-99), doc], future: [], save: "dirty" });
    scheduleSave();
  },
  /** Like edit, for a change that reaches every cut (a cast id their prompts use). */
  editFile(fn: (draft: ProjectFile) => void) {
    const { doc } = state;
    if (!doc) return;
    const draft = structuredClone(doc);
    fn(draft);
    setState({ ...showDoc(draft), past: [...state.past.slice(-99), doc], future: [], save: "dirty" });
    scheduleSave();
  },
  undo() {
    const prev = state.past.at(-1);
    if (!prev || !state.doc) return;
    setState({ ...showDoc(prev), past: state.past.slice(0, -1), future: [state.doc, ...state.future], save: "dirty" });
    scheduleSave();
  },
  redo() {
    const next = state.future[0];
    if (!next || !state.doc) return;
    setState({ ...showDoc(next), past: [...state.past, state.doc], future: state.future.slice(1), save: "dirty" });
    scheduleSave();
  },

  select(selection: Selection | undefined) {
    setState({ selection, also: [], side: selection && selection.kind !== "note" ? "inspect" : state.side });
  },
  /** Adds a shot to the selection or takes it out (⌘-click), or selects the run from the selected one to it (⇧-click). */
  selectMore(id: string, how: "toggle" | "run") {
    const sel = state.selection;
    if (sel?.kind !== "shot") return actions.select({ kind: "shot", id });
    if (how === "toggle") {
      if (sel.id === id) {
        const [next, ...rest] = state.also;
        return setState(next ? { selection: { kind: "shot", id: next }, also: rest } : { selection: undefined, also: [] });
      }
      return setState({ also: state.also.includes(id) ? state.also.filter((x) => x !== id) : [...state.also, id] });
    }
    const p = state.project;
    const a = p?.shots.find((s) => s.id === sel.id);
    const b = p?.shots.find((s) => s.id === id);
    if (!p || !a || !b || a.track !== b.track) return actions.select({ kind: "shot", id });
    const tl = timelineFor(p, state.format);
    const at = (x: string) => tl.shots.find((r) => r.id === x)?.start ?? NaN;
    const [lo, hi] = [Math.min(at(a.id), at(b.id)), Math.max(at(a.id), at(b.id))];
    setState({ also: tl.shots.filter((r) => r.track === a.track && r.id !== a.id && r.start >= lo - 1e-3 && r.start <= hi + 1e-3).map((r) => r.id) });
  },
  /** Plays at a speed (negative plays backwards); 0 pauses. */
  shuttle(rate: number) {
    if (!rate) {
      setState({ rate: 1 });
      if (state.playing) actions.togglePlay();
      return;
    }
    setState({ rate });
    if (!state.playing) actions.togglePlay();
  },
  seek(t: number) {
    const p = state.project;
    const max = p ? timelineFor(p, state.format).duration : 0;
    const playhead = Math.max(0, Math.min(Number.isFinite(max) ? max : t, t));
    setState({ playhead });
    player?.seekTo(Math.round(playhead * player.fps));
  },
  togglePlay() {
    const p = state.project;
    if (!p) return;
    if (player) {
      const end = timelineFor(p, state.format).duration;
      if (!state.playing && state.playhead >= end - 0.05) actions.seek(0);
      player.toggle();
      return;
    }
    const end = timelineFor(p, state.format).duration;
    if (!state.playing && state.playhead >= end - 0.01) setState({ playhead: 0 });
    setState({ playing: !state.playing });
  },
  /** Switches format and keeps the playhead on the same moment: same line (or music section) and offset into it. */
  setFormat(format: string) {
    const p = state.project;
    if (!p) return;
    const from = timelineFor(p, state.format);
    const to = timelineFor(p, format);
    const t = state.playhead;
    let next = Math.min(t, to.duration);
    const line = [...from.lines].reverse().find((l) => l.start <= t);
    const sec = [...from.sections].reverse().find((s) => s.start <= t);
    const sameLine = line && to.lines.find((l) => l.id === line.id);
    const sameSec = sec && to.sections.find((s) => s.id === sec.id);
    if (line && sameLine) next = sameLine.start + (t - line.start);
    else if (sec && sameSec) next = sameSec.start + (t - sec.start);
    setState({ format, zoom: 0, playhead: Math.max(0, Math.min(next, to.duration)) });
  },
  setZoom(zoom: number) {
    setState({ zoom: Math.max(4, Math.min(600, zoom)) });
  },
  setSide(side: State["side"]) {
    setState({ side });
  },
};
