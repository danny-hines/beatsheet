/**
 * The timeline's editing commands: split, delete, copy and paste, nudge and slip, marks, and putting a marked stretch
 * of a clip into the cut. Each is one undoable edit, made with the schema's edit operations on the cut on screen.
 */
import {
  anchorAt,
  copyShots,
  frozen,
  placeAt,
  overwrite,
  pasteShots,
  removeRange,
  removeShots,
  resolveTimeline,
  slipShot,
  splitShot,
  trimStart,
  type Anchor,
  type Clipboard,
  type Timeline,
} from "@beatsheet/schema";
import { pictureTrack } from "./lib";
import { actions, getState, setState, timelineFor } from "./store";

const LOCKED = "That's locked: unlock the shot (in the inspector) or its track (L beside the track's name) to change it.";

let clipboard: Clipboard | undefined;

/** Where the clip open in the Library is playing, so I and O mark it there. */
export const sourceClock = { t: 0 };

const view = () => {
  const s = getState();
  if (!s.project) return undefined;
  const fps = s.project.formats.find((f) => f.id === s.format)?.fps ?? 30;
  return { s, p: s.project, tl: timelineFor(s.project, s.format), fps };
};

/** The shots selected, the one in the inspector first. */
export function selectedShots(): string[] {
  const s = getState();
  const first = s.selection?.kind === "shot" ? [s.selection.id] : [];
  return [...new Set([...first, ...s.also])].filter((id) => s.project?.shots.some((x) => x.id === id));
}

/**
 * The playhead as a place in the cut: the word or beat it's on (within half a frame) and that word's or beat's own
 * time, else the nearest of them plus an offset.
 */
const here = (tl: Timeline, t: number, fps: number) => placeAt(tl, t, 0.5 / fps);

/** Splits the selected shots under the playhead, or else whatever plays on the picture there. */
export function splitHere() {
  const v = view();
  if (!v) return;
  const { anchor: at, t } = here(v.tl, v.s.playhead, v.fps);
  const under = (id: string) => {
    const r = v.tl.shots.find((x) => x.id === id);
    return !!r && t > r.start && t < r.end;
  };
  let ids = selectedShots().filter(under);
  if (!ids.length) {
    const pic = pictureTrack(v.p);
    ids = v.tl.shots.filter((r) => r.track === pic && t > r.start && t < r.end).map((r) => r.id);
  }
  if (!ids.length) return say("Nothing to split under the playhead.");
  const free = ids.filter((id) => !frozen(v.p, v.p.shots.find((s) => s.id === id)!));
  if (!free.length) return say(LOCKED);
  ids = free;
  actions.edit((d) => {
    for (const id of ids) splitShot(d, resolveTimeline(d, v.s.format), id, t, { at });
  });
}

/**
 * Deletes the selected shots, or the marked stretch of the picture when nothing's selected. Rippling closes the gap
 * (what's placed by time moves up); without it, the shot before holds on.
 */
export function deleteSelected(ripple: boolean) {
  const v = view();
  if (!v) return;
  const ids = selectedShots();
  const { in: from, out: to } = v.s.marks;
  if (ids.length) {
    const locked = ids.filter((id) => frozen(v.p, v.p.shots.find((s) => s.id === id)!));
    if (locked.length === ids.length) return say(LOCKED);
    actions.edit((d) => removeShots(d, v.tl, ids, { ripple }));
    actions.select(undefined);
    return;
  }
  const pic = pictureTrack(v.p);
  if (pic && from !== undefined && to !== undefined && to > from) {
    actions.edit((d) => removeRange(d, v.tl, pic, from, to, { ripple }));
    setState({ marks: ripple ? {} : v.s.marks });
  }
}

export function copySelected(): boolean {
  const v = view();
  const ids = selectedShots();
  if (!v || !ids.length) return false;
  clipboard = copyShots(v.p, v.tl, ids);
  if (clipboard) say(ids.length === 1 ? "Copied the shot." : `Copied ${ids.length} shots.`);
  return !!clipboard;
}

export function cutSelected() {
  if (copySelected()) deleteSelected(false);
}

/** Pastes what was copied at the playhead, over what's there, on the selected shot's track if it's the same kind. */
export function paste() {
  const v = view();
  if (!v || !clipboard) return;
  const sel = v.s.selection?.kind === "shot" ? v.p.shots.find((s) => s.id === v.s.selection!.id) : undefined;
  const clip = clipboard;
  let ids: string[] = [];
  const at = here(v.tl, v.s.playhead, v.fps);
  actions.edit((d) => void (ids = pasteShots(d, v.tl, clip, at.t, sel?.track, at.anchor)));
  if (ids[0]) setState({ selection: { kind: "shot", id: ids[0] }, also: ids.slice(1), side: "inspect" });
}

/** A copy of the selected shots straight after them. */
export function duplicate() {
  const v = view();
  const ids = selectedShots();
  if (!v || !ids.length) return;
  const clip = copyShots(v.p, v.tl, ids);
  if (!clip) return;
  const end = Math.max(...ids.map((id) => v.tl.shots.find((r) => r.id === id)?.end ?? 0));
  let made: string[] = [];
  actions.edit((d) => void (made = pasteShots(d, v.tl, clip, end)));
  if (made[0]) setState({ selection: { kind: "shot", id: made[0] }, also: made.slice(1) });
}

/** Everything on the selected shot's track (the picture's, when nothing is selected). */
export function selectTrack() {
  const v = view();
  if (!v) return;
  const sel = v.s.selection?.kind === "shot" ? v.p.shots.find((s) => s.id === v.s.selection!.id) : undefined;
  const track = sel?.track ?? pictureTrack(v.p);
  const ids = v.tl.shots.filter((r) => r.track === track && Number.isFinite(r.start)).map((r) => r.id);
  if (ids[0]) setState({ selection: { kind: "shot", id: sel?.id ?? ids[0] }, also: ids.filter((x) => x !== (sel?.id ?? ids[0])), side: "inspect" });
}

const shift = (a: Anchor, d: number): Anchor => (a.kind === "time" ? { ...a, t: round3(a.t + d) } : { ...a, offset: round3((a.offset ?? 0) + d) });
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Nudges the selected shot by whole frames. A picture shot's cut moves (the shot before takes up the difference) and
 * keeps what it's anchored to, with an offset; anything else moves bodily.
 */
export function nudge(frames: number) {
  const v = view();
  const id = selectedShots()[0];
  if (!v || !id) return;
  const s = v.p.shots.find((x) => x.id === id);
  const r = v.tl.shots.find((x) => x.id === id);
  if (!s || !r) return;
  if (frozen(v.p, s)) return say(LOCKED);
  const d = frames / v.fps;
  const kind = v.p.tracks.find((t) => t.id === s.track)?.kind;
  actions.edit((draft) => {
    const x = draft.shots.find((y) => y.id === id)!;
    const start = x.start ?? anchorAt(v.tl, r.start);
    if (kind === "picture") trimStart(draft, v.tl, id, shift(start, d), r.start + d);
    else {
      x.start = shift(start, d);
      if (x.end) x.end = shift(x.end, d);
    }
  });
}

/** Slides the selected shot's footage under it by whole frames. */
export function slip(frames: number) {
  const v = view();
  const id = selectedShots()[0];
  if (!v || !id) return;
  let moved = 0;
  actions.edit((d) => void (moved = slipShot(d, v.tl, id, frames / v.fps)));
  if (!moved) say("It can't slip any further that way.");
}

/** I and O: marks on the cut, or on the clip open in the Library. */
export function mark(which: "in" | "out", at?: number) {
  const s = getState();
  if (s.selection?.kind === "asset" && at !== undefined) {
    const prev = s.source?.asset === s.selection.id ? s.source : { asset: s.selection.id };
    const next = { ...prev, [which]: round3(at) };
    if (next.in !== undefined && next.out !== undefined && next.out <= next.in) delete next[which === "in" ? "out" : "in"];
    return setState({ source: next });
  }
  const next = { ...s.marks, [which]: round3(s.playhead) };
  if (next.in !== undefined && next.out !== undefined && next.out <= next.in) delete next[which === "in" ? "out" : "in"];
  setState({ marks: next });
}
export const clearMarks = () => setState({ marks: {} });

/**
 * Puts the marked stretch of a clip into the cut at `t` on `track` (the picture, by default), over what's there: a
 * three-point edit. Without marks, from the clip's start for as long as the clip runs (8 seconds at most).
 */
export function putSource(asset: string, t?: number, track?: string, at?: Anchor): string | undefined {
  const v = view();
  if (!v) return;
  const a = v.p.assets.find((x) => x.id === asset);
  const dest = track ?? pictureTrack(v.p);
  if (!a || !dest) return;
  const src = v.s.source?.asset === asset ? v.s.source : undefined;
  const from = src?.in ?? 0;
  const length = a.kind === "video" ? (src?.out !== undefined ? src.out - from : Math.min(8, (a.duration ?? 4) - from)) : 3;
  if (length <= 0.04) return;
  const place = t === undefined ? here(v.tl, v.s.playhead, v.fps) : { t, anchor: at ?? anchorAt(v.tl, t) };
  const when = place.t;
  let id: string | undefined;
  actions.edit((d) => void (id = overwrite(d, v.tl, dest, when, round3(length), { content: { kind: "clip", asset, ...(a.kind === "video" && from ? { in: from } : {}) }, fidelity: "rough" }, { at: place.anchor })));
  if (id) setState({ selection: { kind: "shot", id }, also: [], side: "inspect" });
  return id;
}

/** J, K and L: backwards (faster each press), stop, forwards (faster each press). */
export function shuttleKey(key: "j" | "k" | "l") {
  const s = getState();
  if (key === "k") return actions.shuttle(0);
  const dir = key === "l" ? 1 : -1;
  const same = s.playing && Math.sign(s.rate) === dir;
  const speed = same ? Math.min(4, Math.abs(s.rate) * 2) : 1;
  actions.shuttle(dir * speed);
}

/** A word about what just happened, in the timeline's toolbar for a moment. */
let hintTimer: ReturnType<typeof setTimeout> | undefined;
function say(hint: string) {
  clearTimeout(hintTimer);
  setState({ hint });
  hintTimer = setTimeout(() => setState({ hint: undefined }), 2600);
}
