/**
 * Editing by hand: split, delete, ripple, move, slip, trim and overwrite, the way a person does them on a timeline.
 * Each one changes a draft of the cut in place (as the studio's `edit` hands it over) against the timeline the cut had
 * before, and keeps timing as anchors: a cut that has to stay where it is gets the nearest word, beat or bar (and an
 * offset) rather than a timecode, and anything that pointed at a shot that's going away is pointed at the same moment
 * another way. Pure, so the studio and the agent share them and they're tested on their own.
 */
import { anchorForTime, snapPoints } from "./snap.ts";
import { resolveTimeline, type ResolvedShot, type Timeline } from "./resolve.ts";
import type { Anchor, Motion, Project, Shot } from "./types.ts";

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round2 = (x: number) => Math.round(x * 100) / 100;
/** Two times this close are the same cut. */
const SAME = 1e-3;
/** Shortest a piece of a shot can be (about a frame). */
export const SHORTEST = 0.04;

/** Every anchor in a cut, with a way to replace it in place, and the shot it belongs to if any. */
export function eachAnchor(p: Project, fn: (a: Anchor, set: (b: Anchor) => void, owner?: string) => void) {
  for (const s of p.shots) {
    if (s.start) fn(s.start, (b) => (s.start = b), s.id);
    if (s.end) fn(s.end, (b) => (s.end = b), s.id);
    const c = s.content;
    if (c.kind === "clip" && c.sync) {
      const sync = c.sync;
      fn(sync.at, (b) => (sync.at = b), s.id);
    }
  }
  for (const m of p.markers ?? []) fn(m.at, (b) => (m.at = b));
  for (const x of p.sfx ?? []) fn(x.at, (b) => (x.at = b));
  for (const c of p.music?.cues ?? []) {
    if (c.sync) {
      const sync = c.sync;
      fn(sync.at, (b) => (sync.at = b));
    }
    if (c.start) fn(c.start, (b) => (c.start = b));
    if (c.end) fn(c.end, (b) => (c.end = b));
  }
  if (p.end) fn(p.end, (b) => (p.end = b));
}

/** Whether an anchor depends on one of these shots. */
const points = (a: Anchor, shots: Set<string>) => (a.kind === "shot" || a.kind === "moment") && shots.has(a.shot);

/**
 * The anchor for a moment in the cut that has to stay put: a word, line, beat, bar or section within `tolerance`
 * seconds, else the nearest of those plus an offset, else a time. Never another shot or the end of the cut, so it
 * can't end up depending on what it's placing.
 */
export function anchorAt(tl: Timeline, t: number, tolerance = SAME): Anchor {
  return placeAt(tl, t, tolerance).anchor;
}

/** Like `anchorAt`, with the time it lands on: the word's or beat's own time when it snapped to one. */
export function placeAt(tl: Timeline, t: number, tolerance = SAME): { anchor: Anchor; t: number } {
  const pts = snapPoints(tl).filter((x) => x.kind !== "shot" && x.kind !== "end");
  const r = anchorForTime(t, pts, tolerance);
  return { anchor: r.anchor, t: r.snapped && r.point ? r.point.t : t };
}

/** The cut's timeline again after a step of an edit, in the same format. */
const again = (p: Project, tl: Timeline) => resolveTimeline(p, tl.format);
const resolved = (tl: Timeline, id: string) => tl.shots.find((r) => r.id === id);
const onTrack = (p: Project, track: string) => p.shots.filter((s) => s.track === track);
const speedOf = (s: Shot) => (s.content.kind === "clip" ? s.content.speed ?? 1 : 1);
/** Whether a shot's picture plays through time (footage or a video take) rather than holding (a still, a card). */
const plays = (p: Project, s: Shot) => {
  const c = s.content;
  const id = c.kind === "clip" ? c.asset : c.kind === "generated" ? c.take : undefined;
  return !!id && p.assets.find((a) => a.id === id)?.kind === "video";
};
/** Seconds into the source a shot's picture starts, before any edit. */
const sourceIn = (s: Shot, r: ResolvedShot | undefined) => r?.sourceIn ?? (s.content.kind === "clip" || s.content.kind === "generated" ? s.content.in ?? 0 : 0);

/** A free id for a piece of `id`: s07-2, s07-3… */
export function pieceId(p: Project, id: string): string {
  const base = id.replace(/-\d+$/, "");
  const taken = new Set(p.shots.map((s) => s.id));
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** A free id for a new shot: shot1, shot2… */
export function freeShotId(p: Project, prefix = "shot"): string {
  const taken = new Set(p.shots.map((s) => s.id));
  let n = p.shots.length + 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Where a shot starts as an anchor of its own (its own when it has one, else where the chain puts it now). */
function startOf(tl: Timeline, s: Shot, gone: Set<string>): Anchor {
  return s.start && !points(s.start, gone) ? s.start : anchorAt(tl, resolved(tl, s.id)?.start ?? 0);
}
function endOf(tl: Timeline, s: Shot, gone: Set<string>): Anchor {
  return s.end && !points(s.end, gone) ? s.end : anchorAt(tl, resolved(tl, s.id)?.end ?? 0);
}

const EASE: Record<string, (x: number) => number> = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  "in-out": (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
};
/** A move through a shot cut in two at `f` (0..1): where the picture is there, and how each half eases. */
function splitMotion(m: Motion, f: number): [Motion, Motion] {
  const ease = m.ease ?? "in-out";
  const k = (EASE[ease] ?? EASE["in-out"]!)(f);
  const a = m.from ?? {}, b = m.to ?? {};
  const mix = (x: number | undefined, y: number | undefined, d: number) => round3((x ?? d) + ((y ?? d) - (x ?? d)) * k);
  const mid = { scale: mix(a.scale, b.scale, 1), x: mix(a.x, b.x, 0), y: mix(a.y, b.y, 0), rotate: mix(a.rotate, b.rotate, 0) };
  const halves: Record<string, [Motion["ease"], Motion["ease"]]> = { "in-out": ["in", "out"], in: ["in", "in"], out: ["out", "out"], linear: ["linear", "linear"] };
  const [e1, e2] = halves[ease] ?? ["linear", "linear"];
  return [
    { ...m, to: mid, ease: e1 },
    { ...m, from: mid, ease: e2 },
  ];
}

/**
 * Cuts a shot in two at `t`. The second piece starts there (on `at`, else the nearest word or beat), carries on from
 * the same frame of its footage, and keeps the shot's end; anything that started on the shot's end now starts on
 * the second piece's. Returns the second piece's id, or nothing when `t` isn't inside the shot.
 */
export function splitShot(p: Project, tl: Timeline, id: string, t: number, opts: { at?: Anchor; id?: string } = {}): string | undefined {
  const s = p.shots.find((x) => x.id === id);
  const r = resolved(tl, id);
  if (!s || !r || s.locked || !(t > r.start + SHORTEST - SAME && t < r.end - SHORTEST + SAME)) return;
  const second: Shot = structuredClone(s);
  second.id = opts.id ?? pieceId(p, s.id);
  second.start = opts.at ?? anchorAt(tl, t);
  delete second.transition;
  if (s.end) delete s.end;
  if (s.duration !== undefined) {
    second.duration = round3(r.end - t);
    delete s.duration;
  }
  const c = second.content;
  const into = (t - r.start) * speedOf(s);
  if ((c.kind === "clip" && !c.sync) || (c.kind === "generated" && plays(p, s))) c.in = round3(sourceIn(s, r) + into);
  const first = s.content;
  if ((first.kind === "clip" || first.kind === "generated") && first.motion && (c.kind === "clip" || c.kind === "generated")) {
    [first.motion, c.motion] = splitMotion(first.motion, (t - r.start) / Math.max(SAME, r.end - r.start));
  }
  eachAnchor(p, (a, set, owner) => owner !== s.id && a.kind === "shot" && a.shot === s.id && a.edge === "end" && set({ ...a, shot: second.id }));
  p.shots.splice(p.shots.indexOf(s) + 1, 0, second);
  return second.id;
}

/** Splits whatever's on a track at each time (on its anchor, if given), returning the timeline as it now stands. */
export function splitAt(p: Project, tl: Timeline, track: string, cuts: { t: number; at?: Anchor }[]): Timeline {
  let work = tl;
  for (const { t, at } of cuts) {
    const under = work.shots.find((r) => r.track === track && Number.isFinite(r.start) && t > r.start + SAME && t < r.end - SAME);
    if (under && splitShot(p, work, under.id, t, { at })) work = again(p, tl);
  }
  return work;
}

export type RemoveOpts = {
  /**
   * Close the gap: what's placed by time after it moves up by its length (a shot that simply follows the one before
   * comes straight after). Anything on a word or a beat stays with it, and the shot before holds on to meet it.
   */
  ripple?: boolean;
};

/**
 * Takes shots out of the cut. On a picture track the shot before holds on through the time they had, so there's no
 * black; on other tracks the time is left empty. What started on one of them is re-anchored to the same moment, and
 * a note on one moves to the stretch of the cut it covered.
 */
export function removeShots(p: Project, tl: Timeline, ids: string[], opts: RemoveOpts = {}) {
  const gone = new Set(ids.filter((id) => p.shots.some((s) => s.id === id && !s.locked)));
  if (!gone.size) return;
  const picture = new Set(p.tracks.filter((t) => t.kind === "picture").map((t) => t.id));
  // The cut's end comes from its picture when nothing else gives it one; then the last shot must keep a length.
  const ownEnd = !!p.end || !!p.voice?.lines.length || !!p.music?.cues.length;

  // Anything that pointed at a shot that's going: the same moment, another way.
  eachAnchor(p, (a, set, owner) => {
    if (points(a, gone) && !(owner && gone.has(owner))) set(anchorAt(tl, timeOf(p, tl, a)));
  });
  for (const n of p.notes) {
    const t = n.target;
    if (t.kind !== "shot" || !gone.has(t.shot)) continue;
    const r = resolved(tl, t.shot);
    n.target = r && Number.isFinite(r.start) ? { kind: "range", from: round2(r.start), to: round2(r.end) } : { kind: "project" };
  }

  for (const id of gone) {
    const s = p.shots.find((x) => x.id === id)!;
    const r = resolved(tl, id);
    const list = onTrack(p, s.track);
    const i = list.indexOf(s);
    const prev = list.slice(0, i).reverse().find((x) => !gone.has(x.id));
    const next = list.slice(i + 1).find((x) => !gone.has(x.id));
    const chainedIn = !s.start;
    // A shot that followed this one starts where this one ended; rippling, where it started (or it stays chained).
    if (next && !next.start && !(opts.ripple && chainedIn)) next.start = opts.ripple ? startOf(tl, s, gone) : endOf(tl, s, gone);
    if (!prev || !r) continue;
    const pr = resolved(tl, prev.id);
    const touching = !!pr && Math.abs(pr.end - r.start) < SAME;
    // The shot before can only hold on to something with a time of its own: the next shot's start, or the cut's end.
    const fill = picture.has(s.track) && (next ? !!next.start : ownEnd);
    if (fill && touching && (prev.end || prev.duration !== undefined)) {
      delete prev.end;
      delete prev.duration;
    } else if (!fill && !prev.end && prev.duration === undefined) {
      // It ran until this one started; it still does.
      prev.end = chainedIn ? anchorAt(tl, r.start) : startOf(tl, s, gone);
    }
  }

  if (opts.ripple) {
    // The stretches the picture lost, merged, so overlapping removals count once.
    const spans = [...gone]
      .filter((id) => picture.has(p.shots.find((s) => s.id === id)!.track))
      .map((id) => resolved(tl, id))
      .filter((r): r is ResolvedShot => !!r && Number.isFinite(r.start) && Number.isFinite(r.end))
      .map((r) => [r.start, r.end] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const sp of spans) {
      const last = merged.at(-1);
      if (last && sp[0] <= last[1] + SAME) last[1] = Math.max(last[1], sp[1]);
      else merged.push([...sp]);
    }
    const lost = (t: number) => merged.reduce((sum, [a, b]) => sum + (t >= b - SAME ? b - a : 0), 0);
    eachAnchor(p, (a, set, owner) => {
      if (a.kind !== "time" || (owner && gone.has(owner))) return;
      const d = lost(a.t + (a.offset ?? 0));
      if (d > 0) set({ ...a, t: round3(a.t - d) });
    });
    for (const n of p.notes) {
      if (n.at !== undefined) n.at = round2(n.at - lost(n.at));
      if (n.target.kind === "time") n.target = { ...n.target, t: round2(n.target.t - lost(n.target.t)) };
      if (n.target.kind === "range") n.target = { ...n.target, from: round2(n.target.from - lost(n.target.from)), to: round2(n.target.to - lost(n.target.to)) };
    }
  }

  p.shots = p.shots.filter((s) => !gone.has(s.id));
}

/** The time an anchor that points at a shot resolves to, read from the timeline before the edit. */
function timeOf(p: Project, tl: Timeline, a: Anchor): number {
  const off = a.offset ?? 0;
  if (a.kind === "shot") {
    const r = resolved(tl, a.shot);
    return (a.edge === "end" ? r?.end ?? 0 : r?.start ?? 0) + off;
  }
  if (a.kind === "moment") {
    const s = p.shots.find((x) => x.id === a.shot);
    const r = resolved(tl, a.shot);
    if (!s || !r || s.content.kind !== "clip") return (r?.start ?? 0) + off;
    const asset = s.content.asset;
    const m = typeof a.moment === "number" ? a.moment : (p.assets.find((x) => x.id === asset)?.moments?.find((x) => x.id === a.moment)?.t ?? 0);
    return r.start + (m - (r.sourceIn ?? 0)) / speedOf(s) + off;
  }
  return 0;
}

/** Cuts a stretch of a track out: the shots inside go, and the ones across its edges are split there first. */
export function removeRange(p: Project, tl: Timeline, track: string, from: number, to: number, opts: RemoveOpts = {}) {
  const work = splitAt(p, tl, track, [{ t: from }, { t: to }]);
  const inside = work.shots.filter((r) => r.track === track && r.start >= from - SAME && r.end <= to + SAME).map((r) => r.id);
  removeShots(p, work, inside, opts);
}

/** A shot to put in the cut, without its place (which an overwrite or a paste gives it). */
export type ShotBody = Omit<Shot, "id" | "track" | "start" | "end" | "duration">;

/**
 * Puts a shot in over whatever plays on a track from `t` for `length` seconds (an overwrite edit): what was there is
 * split at both ends and the middle replaced, so the cuts either side keep their timing. On an empty stretch it
 * simply goes in, stopping where the next begins. Returns the new shot's id.
 */
export function overwrite(p: Project, tl: Timeline, track: string, t: number, length: number, body: ShotBody, opts: { at?: Anchor; id?: string } = {}): string | undefined {
  const id = opts.id ?? freeShotId(p);
  const until = t + length;
  let work = splitAt(p, tl, track, [{ t, at: opts.at }, { t: until }]);
  const fresh = { ...structuredClone(body), id, track } as Shot;
  const inside = work.shots.filter((r) => r.track === track && Number.isFinite(r.start) && r.start >= t - SAME && r.start < until - SAME);
  const first = inside[0] && Math.abs(inside[0].start - t) < SAME ? p.shots.find((s) => s.id === inside[0]!.id) : undefined;
  if (first && !first.locked) {
    // Takes the place of the first piece in the stretch, timing and all; the rest of the stretch goes after.
    for (const k of ["start", "end", "duration"] as const) if (first[k] !== undefined) (fresh as Record<string, unknown>)[k] = first[k];
    const was = new Set([first.id]);
    eachAnchor(p, (a, set) => {
      if (a.kind === "shot" && a.shot === first.id) set({ ...a, shot: id });
      else if (points(a, was)) set(anchorAt(work, timeOf(p, work, a)));
    });
    for (const n of p.notes) if (n.target.kind === "shot" && n.target.shot === first.id) n.target = { kind: "range", from: round2(inside[0]!.start), to: round2(inside[0]!.end) };
    p.shots[p.shots.indexOf(first)] = fresh;
    work = again(p, tl);
    removeShots(p, work, inside.slice(1).map((r) => r.id));
    // It ends at `until` (where the piece after it starts), or keeps its length when nothing follows it.
    const after = onTrack(p, track).slice(onTrack(p, track).indexOf(fresh) + 1);
    if (!after.length) {
      delete fresh.end;
      fresh.duration = round3(length);
    }
    return id;
  }
  // An empty stretch: in it goes, in time order, for as long as there's room.
  const later = work.shots.filter((r) => r.track === track && Number.isFinite(r.start) && r.start >= t - SAME).sort((a, b) => a.start - b.start)[0];
  fresh.start = opts.at ?? anchorAt(work, t);
  fresh.duration = round3(later ? Math.min(length, later.start - t) : length);
  const nextShot = later && p.shots.find((s) => s.id === later.id);
  if (nextShot && !nextShot.start) nextShot.start = anchorAt(work, later.start);
  const last = onTrack(p, track).at(-1);
  const i = nextShot ? p.shots.indexOf(nextShot) : last ? p.shots.indexOf(last) + 1 : p.shots.length;
  p.shots.splice(i, 0, fresh);
  return id;
}

/**
 * Moves where a shot starts (its left edge), keeping its footage where it was in the cut: the frames after the cut
 * stay put and the head is trimmed or lengthened. A shot with a length of its own keeps its end. The shot before, if
 * it ran up to this one, still does. Returns false when it can't (locked, or past either end of the shot before).
 */
export function trimStart(p: Project, tl: Timeline, id: string, at: Anchor, t: number): boolean {
  const s = p.shots.find((x) => x.id === id);
  const r = resolved(tl, id);
  if (!s || !r || s.locked || t >= r.end - SHORTEST) return false;
  const list = onTrack(p, s.track);
  const prev = list[list.indexOf(s) - 1];
  const pr = prev && resolved(tl, prev.id);
  const touching = !!pr && Math.abs(pr.end - r.start) < SAME;
  if (touching && pr && t <= pr.start + SHORTEST) return false;
  const delta = t - r.start;
  const c = s.content;
  if ((c.kind === "clip" && !c.sync) || (c.kind === "generated" && plays(p, s))) c.in = round3(Math.max(0, sourceIn(s, r) + delta * speedOf(s)));
  if (prev && touching && (prev.end || prev.duration !== undefined) && !prev.locked) {
    delete prev.end;
    delete prev.duration;
  }
  s.start = at;
  if (s.duration !== undefined) s.duration = round3(r.end - t);
  return true;
}

/** Moves where a shot ends (its right edge); the shot after, if it followed this one, starts there instead. */
export function trimEnd(p: Project, tl: Timeline, id: string, at: Anchor, t: number): boolean {
  const s = p.shots.find((x) => x.id === id);
  const r = resolved(tl, id);
  if (!s || !r || s.locked || t <= r.start + SHORTEST) return false;
  const list = onTrack(p, s.track);
  const next = list[list.indexOf(s) + 1];
  const nr = next && !next.start ? resolved(tl, next.id) : undefined;
  if (nr && t >= nr.end - SHORTEST) return false;
  s.end = at;
  delete s.duration;
  return true;
}

/**
 * Slides a shot's footage under it by `delta` seconds of source (a slip): the cut stays where it is and a later or
 * earlier stretch of the clip plays. A clip landed on a moment keeps landing, on a point `delta` along. Returns the
 * slip it could make (it stops at either end of the file).
 */
export function slipShot(p: Project, tl: Timeline, id: string, delta: number): number {
  const s = p.shots.find((x) => x.id === id);
  const r = resolved(tl, id);
  if (!s || !r || s.locked || !plays(p, s)) return 0;
  const c = s.content;
  const len = (r.end - r.start) * speedOf(s);
  const assetId = c.kind === "clip" ? c.asset : c.kind === "generated" ? c.take : undefined;
  const fileLen = p.assets.find((a) => a.id === assetId)?.duration;
  const from = sourceIn(s, r);
  const most = fileLen !== undefined ? Math.max(from, fileLen - len) : Infinity;
  const d = round3(Math.min(most, Math.max(0, from + delta)) - from);
  if (!d) return 0;
  if (c.kind === "clip" && c.sync) {
    const m = c.sync.moment;
    const t0 = typeof m === "number" ? m : (p.assets.find((a) => a.id === c.asset)?.moments?.find((x) => x.id === m)?.t ?? 0);
    c.sync = { ...c.sync, moment: round3(t0 + d) };
  } else if (c.kind === "clip" || c.kind === "generated") c.in = round3(from + d);
  return d;
}

/**
 * Moves a shot to `t` (on `at`) on `track`. On a picture track, where shots sit one after another, it takes the place
 * of the one there and those between shift along by one: on a cut timed by words or beats, the cuts stay where they
 * are and the footage is reordered; on one where each shot simply has a length, the shots move with their lengths.
 * Elsewhere a shot moves freely, keeping its length.
 */
export function moveShot(p: Project, tl: Timeline, id: string, t: number, at: Anchor, track?: string): boolean {
  const s = p.shots.find((x) => x.id === id);
  const r = resolved(tl, id);
  if (!s || !r || s.locked) return false;
  const to = track ?? s.track;
  const kind = p.tracks.find((x) => x.id === to)?.kind;
  if (!kind || kind !== p.tracks.find((x) => x.id === s.track)?.kind) return false;
  if (kind === "picture" && to === s.track) return reorder(p, tl, s, t);
  const gone = new Set([s.id]);
  // Off its place: what ran up to it, and what followed it, keep their times.
  const list = onTrack(p, s.track);
  const i = list.indexOf(s);
  const prev = list[i - 1], next = list[i + 1];
  if (next && !next.start) next.start = endOf(tl, s, gone);
  if (prev && !prev.end && prev.duration === undefined) prev.end = s.start ?? anchorAt(tl, r.start);
  const length = round3(r.end - r.start);
  delete s.end;
  s.duration = length;
  s.start = at;
  s.track = to;
  // Into place on its track, in time order; a shot it lands before keeps its own start.
  p.shots.splice(p.shots.indexOf(s), 1);
  const after = onTrack(p, to)
    .map((x) => ({ x, r: resolved(tl, x.id) }))
    .find((y) => y.r && y.r.start > t + SAME);
  if (after && !after.x.start) after.x.start = anchorAt(tl, after.r!.start);
  const last = onTrack(p, to).at(-1);
  const index = after ? p.shots.indexOf(after.x) : last ? p.shots.indexOf(last) + 1 : p.shots.length;
  p.shots.splice(index, 0, s);
  return true;
}

/** A picture shot moved along its track to where `t` is: the shots between shift by one place. */
function reorder(p: Project, tl: Timeline, s: Shot, t: number): boolean {
  const list = onTrack(p, s.track).filter((x) => Number.isFinite(resolved(tl, x.id)?.start));
  const from = list.indexOf(s);
  let to = list.findIndex((x) => {
    const r = resolved(tl, x.id)!;
    return t >= r.start - SAME && t < r.end - SAME;
  });
  if (to < 0) to = t < resolved(tl, list[0]!.id)!.start ? 0 : list.length - 1;
  if (from < 0 || to === from) return false;
  const [lo, hi] = [Math.min(from, to), Math.max(from, to)];
  const span = list.slice(lo, hi + 1);
  if (span.some((x) => x.locked)) return false;
  const moved = [...span];
  moved.splice(to - lo, 0, ...moved.splice(from - lo, 1));
  // A clip that landed a moment on a beat lands it no longer: it plays from where it did.
  for (const x of span) {
    const c = x.content;
    if (c.kind === "clip" && c.sync) {
      c.in = round3(resolved(tl, x.id)?.sourceIn ?? 0);
      delete c.sync;
    }
  }
  // Shots that simply follow one another, each with its length: they move with their lengths, and whichever comes
  // first takes the first one's start.
  const chain = span.slice(1).every((x) => !x.start) && span.every((x) => x.duration !== undefined || x.end);
  if (chain) {
    const head = span[0]!.start;
    for (const x of span) delete x.start;
    if (head) moved[0]!.start = head;
  } else {
    // Each place keeps its timing, made independent of the shots that are moving so none ends up timed by itself.
    const ids = new Set(span.map((x) => x.id));
    const places = span.map((x, k) => ({
      start: x.start && !points(x.start, ids) ? x.start : k === 0 && lo === 0 && !x.start ? undefined : anchorAt(tl, resolved(tl, x.id)!.start),
      end: x.end ? (points(x.end, ids) ? anchorAt(tl, resolved(tl, x.id)!.end) : x.end) : undefined,
      duration: x.duration,
      transition: x.transition,
    }));
    moved.forEach((x, k) => {
      const pl = places[k]!;
      for (const key of ["start", "end", "duration", "transition"] as const) {
        if (pl[key] === undefined) delete x[key];
        else (x as Record<string, unknown>)[key] = pl[key];
      }
    });
  }
  // The array holds the track's shots in their new order, in the same slots as before.
  const slots = span.map((x) => p.shots.indexOf(x)).sort((a, b) => a - b);
  slots.forEach((slot, k) => (p.shots[slot] = moved[k]!));
  return true;
}

/** Shots copied for pasting: their content and look, with times kept relative to the first of them. */
export type Clipboard = { shots: { shot: Shot; offset: number; length: number }[] };

export function copyShots(p: Project, tl: Timeline, ids: string[]): Clipboard | undefined {
  const picked = ids
    .map((id) => ({ s: p.shots.find((x) => x.id === id), r: resolved(tl, id) }))
    .filter((x): x is { s: Shot; r: ResolvedShot } => !!x.s && !!x.r && Number.isFinite(x.r.start) && Number.isFinite(x.r.end))
    .sort((a, b) => a.r.start - b.r.start);
  if (!picked.length) return;
  const t0 = picked[0]!.r.start;
  return {
    shots: picked.map(({ s, r }) => {
      const shot = structuredClone(s);
      const c = shot.content;
      // A copy plays from where the original did, wherever it's pasted.
      if (c.kind === "clip" && c.sync) delete c.sync;
      if (c.kind === "clip" || (c.kind === "generated" && plays(p, s))) c.in = round3(sourceIn(s, r));
      delete shot.locked;
      return { shot, offset: round3(r.start - t0), length: round3(r.end - r.start) };
    }),
  };
}

/**
 * Pastes copied shots at `t`, keeping their arrangement, each on the track it came from (or on `track`, if that's of
 * the same kind): over what's there, as an overwrite. Returns the new shots' ids.
 */
export function pasteShots(p: Project, tl: Timeline, clip: Clipboard, t: number, track?: string, at?: Anchor): string[] {
  const out: string[] = [];
  const kindOf = (id: string) => p.tracks.find((x) => x.id === id)?.kind;
  let work = tl;
  clip.shots.forEach(({ shot, offset, length }, k) => {
    const dest = track && kindOf(track) === kindOf(shot.track) ? track : kindOf(shot.track) ? shot.track : undefined;
    if (!dest) return;
    const { id: _id, track: _track, start: _s, end: _e, duration: _d, ...body } = shot;
    const id = overwrite(p, work, dest, t + offset, length, body, { at: k === 0 ? at : undefined });
    if (id) out.push(id);
    work = again(p, tl);
  });
  return out;
}
