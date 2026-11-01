/**
 * Several cameras on one event (multicam): their files lined up by sound into one group's time (`asset.angle`), so a
 * clip shot can show any of them at the same moment. Switching a shot's angle keeps it in step; a stretch can be cut
 * to whoever is talking, each speaker on the camera that has them.
 */
import { frozen, splitAt } from "./edit.ts";
import { resolveTimeline, type Timeline } from "./resolve.ts";
import type { CutWord } from "./script.ts";
import type { Asset, Project, Shot } from "./types.ts";

/** The angles of a group, in the order they were added to the project: angle 1, 2, 3… */
export function anglesOf(p: Pick<Project, "assets">, group: string): Asset[] {
  return p.assets.filter((a) => a.angle?.group === group);
}

/** The moment in `to` that's the same as `t` seconds into `from`, when both are angles of one group. */
export function sameMoment(from: Asset, t: number, to: Asset): number | undefined {
  if (!from.angle || !to.angle || from.angle.group !== to.angle.group) return undefined;
  return t + from.angle.offset - to.angle.offset;
}

/**
 * Shows another angle in a clip shot, from the same moment: its footage changes and its timing doesn't. Effects
 * and a crop that followed someone found in the old file go (they were found there, not here). Returns false when
 * the other camera wasn't rolling for all of the shot.
 */
export function switchAngle(p: Project, tl: Timeline, id: string, to: string): boolean {
  const s = p.shots.find((x) => x.id === id);
  const r = tl.shots.find((x) => x.id === id);
  if (!s || !r || frozen(p, s) || s.content.kind !== "clip") return false;
  const c = s.content;
  const from = p.assets.find((a) => a.id === c.asset);
  const dest = p.assets.find((a) => a.id === to);
  if (!from || !dest || from.id === dest.id) return false;
  const speed = c.speed ?? 1;
  const at = sameMoment(from, r.sourceIn ?? c.in ?? 0, dest);
  if (at === undefined) return false;
  const length = (r.end - r.start) * speed;
  if (at < -0.02 || (dest.duration !== undefined && at + length > dest.duration + 0.05)) return false;
  const next: Extract<Shot["content"], { kind: "clip" }> = { kind: "clip", asset: dest.id, in: Math.max(0, Math.round(at * 1000) / 1000) };
  for (const k of ["speed", "look", "volume", "fadeIn", "fadeOut", "motion"] as const) if (c[k] !== undefined) (next as Record<string, unknown>)[k] = c[k];
  // A fixed crop carries over; one following someone in the old file can't.
  if (c.reframe) {
    const kept = Object.fromEntries(Object.entries(c.reframe).filter(([, rf]) => !rf.follow));
    if (Object.keys(kept).length) next.reframe = kept;
  }
  s.content = next;
  return true;
}

/**
 * Cuts to an angle at `t` on the picture: the shot playing there is split (unless `t` is already a cut) and what
 * follows shows angle `to`. Returns the shot now showing it.
 */
export function cutToAngle(p: Project, tl: Timeline, t: number, to: string, track?: string): string | undefined {
  const pic = track ?? p.tracks.find((x) => x.kind === "picture")?.id;
  if (!pic) return;
  const work = splitAt(p, tl, pic, [{ t }]);
  const r = work.shots.find((x) => x.track === pic && t >= x.start - 1e-3 && t < x.end - 1e-3);
  if (!r) return;
  return switchAngle(p, work, r.id, to) ? r.id : undefined;
}

/**
 * Who should be on screen through a stretch of the cut: the angle of whoever is talking, held through pauses, never
 * changing more often than every `least` seconds (a short interjection stays on the speaker before). Returns the
 * stretches, in cut time, each with its angle.
 */
export function speakerCuts(words: CutWord[], from: number, to: number, angleOf: (speaker: string) => string | undefined, opts: { least?: number; start?: string } = {}): { s: number; e: number; asset: string }[] {
  const least = opts.least ?? 1.5;
  const out: { s: number; e: number; asset: string }[] = [];
  let current = opts.start;
  let since = from;
  for (const w of words) {
    if (w.e <= from || w.s >= to || !w.speaker) continue;
    const want = angleOf(w.speaker);
    if (!want || want === current) continue;
    // A cut lands a moment before the new voice, so the face is there when the words start.
    const at = Math.max(from, w.s - 0.15);
    if (current && at - since < least) continue;
    if (current) out.push({ s: since, e: at, asset: current });
    current = want;
    since = at;
  }
  if (current) out.push({ s: since, e: to, asset: current });
  // Too short to hold at the end: it joins the stretch before.
  const last = out.at(-1), before = out.at(-2);
  if (last && before && last.e - last.s < least / 2) {
    before.e = last.e;
    out.pop();
  }
  return out;
}

/**
 * Cuts the clip shots of a group between `from` and `to` to whoever is talking (see speakerCuts): splits them where
 * the speaker changes and shows each stretch from that speaker's angle. Returns how many times the picture now changes angle.
 */
export function cutToSpeakers(p: Project, tl: Timeline, words: CutWord[], from: number, to: number, angleOf: (speaker: string) => string | undefined, opts: { least?: number } = {}): number {
  const pic = p.tracks.find((x) => x.kind === "picture")?.id;
  if (!pic) return 0;
  const first = tl.shots.find((r) => r.track === pic && from >= r.start - 1e-3 && from < r.end);
  const startAsset = first ? (p.shots.find((s) => s.id === first.id)?.content as { asset?: string } | undefined)?.asset : undefined;
  const plan = speakerCuts(words, from, to, angleOf, { least: opts.least, start: startAsset });
  let work = splitAt(p, tl, pic, plan.map((x) => ({ t: x.s })).filter((x) => x.t > from + 1e-3));
  let switched = 0;
  for (const stretch of plan) {
    const pieces = work.shots.filter((r) => r.track === pic && r.start >= stretch.s - 1e-3 && r.start < stretch.e - 1e-3);
    for (const r of pieces) {
      const s = p.shots.find((x) => x.id === r.id);
      if (s?.content.kind !== "clip" || s.content.asset === stretch.asset) continue;
      if (switchAngle(p, work, r.id, stretch.asset)) switched++;
    }
    work = resolveTimeline(p, tl.format);
  }
  return switched ? plan.length - 1 : 0;
}

/**
 * Which angle has each speaker, from how loud each camera hears them: a camera close to someone hears them loudest
 * (against how loud it hears everyone). `loudness(asset, t0, t1)` is a camera's average level over a stretch of its
 * own time; words are in group time.
 */
export function speakerAngles(words: { s: number; e: number; speaker?: string }[], angles: Asset[], loudness: (asset: string, t0: number, t1: number) => number | undefined): Record<string, string> {
  const by: Record<string, Record<string, number[]>> = {};
  for (const w of words) {
    if (!w.speaker) continue;
    for (const a of angles) {
      const off = a.angle?.offset ?? 0;
      const v = loudness(a.id, w.s - off, w.e - off);
      if (v === undefined) continue;
      ((by[w.speaker] ??= {})[a.id] ??= []).push(v);
    }
  }
  // Each camera's level for everyone, so a hot microphone doesn't win every speaker.
  const overall: Record<string, number> = {};
  for (const a of angles) {
    const all = Object.values(by).flatMap((x) => x[a.id] ?? []);
    overall[a.id] = all.length ? all.reduce((x, y) => x + y, 0) / all.length : 1;
  }
  const out: Record<string, string> = {};
  for (const [speaker, levels] of Object.entries(by)) {
    let best: string | undefined, score = -Infinity;
    for (const [asset, vs] of Object.entries(levels)) {
      const v = vs.reduce((x, y) => x + y, 0) / vs.length / Math.max(1e-6, overall[asset] ?? 1);
      if (v > score) (score = v), (best = asset);
    }
    if (best) out[speaker] = best;
  }
  return out;
}

/**
 * The words said through a stretch of the cut as one angle heard them (`master`, the one transcribed), whichever
 * angle each shot shows: speakers then keep one name throughout, as they wouldn't across separate transcripts.
 */
export function groupWords(p: Project, tl: Timeline, master: Asset, words: { w: string; s: number; e: number; speaker?: string }[], from = 0, to = Infinity): CutWord[] {
  const pic = p.tracks.find((x) => x.kind === "picture")?.id;
  const out: CutWord[] = [];
  for (const r of tl.shots) {
    if (r.track !== pic || r.end <= from || r.start >= to || !Number.isFinite(r.start)) continue;
    const c = p.shots.find((s) => s.id === r.id)?.content;
    if (c?.kind !== "clip") continue;
    const a = p.assets.find((x) => x.id === c.asset);
    if (!a?.angle || a.angle.group !== master.angle?.group) continue;
    const speed = c.speed ?? 1;
    const inFile = r.sourceIn ?? c.in ?? 0;
    // The shot's stretch in the master's own time.
    const m0 = inFile + a.angle.offset - master.angle.offset;
    const m1 = m0 + (r.end - r.start) * speed;
    words.forEach((w, i) => {
      const mid = (w.s + w.e) / 2;
      if (mid < m0 || mid >= m1) return;
      out.push({ w: w.w, s: r.start + (w.s - m0) / speed, e: r.start + (w.e - m0) / speed, shot: r.id, asset: master.id, i, ...(w.speaker ? { speaker: w.speaker } : {}) });
    });
  }
  return out.sort((x, y) => x.s - y.s);
}
