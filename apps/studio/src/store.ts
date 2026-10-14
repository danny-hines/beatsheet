/**
 * App state: the open project plus everything about the view of it. Every change to the project goes through
 * `edit`, which records undo history and schedules a save, so nothing the user does is lost or unrecoverable.
 */
import { parseProject, resolveTimeline, type Project, type StageId, type Timeline } from "@beatsheet/schema";
import { useSyncExternalStore } from "react";

export type Selection =
  | { kind: "shot"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "line"; id: string }
  | { kind: "cue"; id: string }
  | { kind: "note"; id: string };

export type ProjectSummary = { id: string; title: string; recipe: string };

export type State = {
  list: ProjectSummary[];
  projectId?: string;
  project?: Project;
  loadError?: string[];
  past: Project[];
  future: Project[];
  save: "saved" | "dirty" | "saving" | "error";
  saveError?: string;
  format: string;
  stage: StageId;
  selection?: Selection;
  playhead: number;
  playing: boolean;
  /** Timeline zoom in pixels per second; 0 means fit to width on next layout. */
  zoom: number;
  side: "inspect" | "notes";
  /** Bumped to ask the note composer to take focus. */
  compose: number;
  /** A note whose text field should open focused. */
  focusNote?: string;
};

let state: State = {
  list: [],
  past: [],
  future: [],
  save: "saved",
  format: "",
  stage: "assemble",
  playhead: 0,
  playing: false,
  zoom: 0,
  side: "notes",
  compose: 0,
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
  const { project, projectId } = state;
  if (!project || !projectId) return;
  setState({ save: "saving" });
  try {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(project),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("\n");
      throw new Error(msg || body.error || `save failed (${res.status})`);
    }
    if (state.project === project) setState({ save: "saved", saveError: undefined });
  } catch (err) {
    setState({ save: "error", saveError: String(err instanceof Error ? err.message : err) });
  }
}

// ---- Actions.
export const actions = {
  async loadList() {
    const res = await fetch("/api/projects");
    setState({ list: await res.json() });
  },

  async open(id: string) {
    clearTimeout(saveTimer);
    const res = await fetch(`/api/projects/${id}`);
    const parsed = parseProject(await res.json());
    if (!parsed.ok) {
      setState({ projectId: id, project: undefined, loadError: parsed.issues.map((i) => `${i.path}: ${i.message}`) });
      return;
    }
    const p = parsed.project;
    const active = (Object.entries(p.stages) as [StageId, { status: string }][]).find(([, s]) => s.status === "active");
    setState({
      projectId: id,
      project: p,
      loadError: undefined,
      past: [],
      future: [],
      save: "saved",
      format: p.formats[0]!.id,
      stage: active?.[0] ?? "assemble",
      selection: undefined,
      playhead: 0,
      playing: false,
      zoom: 0,
    });
    history.replaceState(null, "", `#${id}`);
  },

  /** The one way to change the project: mutate a copy, keep the old one for undo, save soon. */
  edit(fn: (draft: Project) => void) {
    const p = state.project;
    if (!p) return;
    const draft = structuredClone(p);
    fn(draft);
    setState({ project: draft, past: [...state.past.slice(-99), p], future: [], save: "dirty" });
    scheduleSave();
  },
  undo() {
    const prev = state.past.at(-1);
    if (!prev || !state.project) return;
    setState({ project: prev, past: state.past.slice(0, -1), future: [state.project, ...state.future], save: "dirty" });
    scheduleSave();
  },
  redo() {
    const next = state.future[0];
    if (!next || !state.project) return;
    setState({ project: next, past: [...state.past, state.project], future: state.future.slice(1), save: "dirty" });
    scheduleSave();
  },

  select(selection: Selection | undefined) {
    setState({ selection, side: selection && selection.kind !== "note" ? "inspect" : state.side });
  },
  seek(t: number) {
    const p = state.project;
    const max = p ? timelineFor(p, state.format).duration : 0;
    setState({ playhead: Math.max(0, Math.min(Number.isFinite(max) ? max : t, t)) });
  },
  togglePlay() {
    const p = state.project;
    if (!p) return;
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
  setStage(stage: StageId) {
    setState({ stage });
  },
  setZoom(zoom: number) {
    setState({ zoom: Math.max(4, Math.min(600, zoom)) });
  },
  setSide(side: State["side"]) {
    setState({ side });
  },
  compose() {
    setState({ side: "notes", compose: state.compose + 1 });
  },
};
