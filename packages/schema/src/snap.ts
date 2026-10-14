/**
 * Snapping: turns a time someone dragged to back into an anchor, so direct edits in the UI keep the cut
 * re-timeable instead of writing timecodes.
 */
import { cleanWord, type Timeline } from "./resolve.ts";
import type { Anchor } from "./types.ts";

export type SnapKind = "start" | "end" | "line" | "word" | "section" | "bar" | "beat" | "shot" | "marker";
export type SnapPoint = { t: number; kind: SnapKind; anchor: Anchor; label: string };

export function snapPoints(tl: Timeline, opts: { excludeShot?: string } = {}): SnapPoint[] {
  const pts: SnapPoint[] = [{ t: 0, kind: "start", anchor: { kind: "time", t: 0 }, label: "start of cut" }];
  if (Number.isFinite(tl.duration)) pts.push({ t: tl.duration, kind: "end", anchor: { kind: "end" }, label: "end of cut" });

  for (const l of tl.lines) {
    pts.push({ t: l.start, kind: "line", anchor: { kind: "line", line: l.id }, label: `line ${l.id}` });
    pts.push({ t: l.end, kind: "line", anchor: { kind: "line", line: l.id, edge: "end" }, label: `end of ${l.id}` });
    const seen = new Map<string, number>();
    for (const w of l.words) {
      const word = cleanWord(w.w);
      if (!word) continue;
      const nth = seen.get(word) ?? 0;
      seen.set(word, nth + 1);
      const anchor: Anchor = nth ? { kind: "word", line: l.id, word, nth } : { kind: "word", line: l.id, word };
      pts.push({ t: w.s, kind: "word", anchor, label: `"${w.w}"` });
    }
  }

  for (const s of tl.sections) {
    pts.push({ t: s.start, kind: "section", anchor: { kind: "section", section: s.id }, label: `${s.label} starts` });
  }
  // Beats count from the section they fall in, so they stay put if earlier sections change length.
  const sectionAt = (t: number) => [...tl.sections].reverse().find((s) => t >= s.start - 1e-3);
  tl.beats.forEach((b, i) => {
    const sec = sectionAt(b.t);
    const base = sec ? tl.beats.findIndex((x) => x.t >= sec.start - 1e-3) : 0;
    if (b.bar) {
      const n = tl.beats.slice(base, i).filter((x) => x.bar).length;
      const anchor: Anchor = sec ? { kind: "beat", unit: "bar", n, from: sec.id } : { kind: "beat", unit: "bar", n };
      pts.push({ t: b.t, kind: "bar", anchor, label: sec ? `bar ${n + 1} of ${sec.label}` : `bar ${n + 1}` });
    } else {
      const n = i - base;
      const anchor: Anchor = sec ? { kind: "beat", n, from: sec.id } : { kind: "beat", n };
      pts.push({ t: b.t, kind: "beat", anchor, label: sec ? `beat ${n + 1} of ${sec.label}` : `beat ${n + 1}` });
    }
  });

  for (const s of tl.shots) {
    if (s.id === opts.excludeShot) continue;
    if (Number.isFinite(s.start)) pts.push({ t: s.start, kind: "shot", anchor: { kind: "shot", shot: s.id }, label: `${s.id} starts` });
    if (Number.isFinite(s.end))
      pts.push({ t: s.end, kind: "shot", anchor: { kind: "shot", shot: s.id, edge: "end" }, label: `${s.id} ends` });
  }
  for (const m of tl.markers) {
    if (Number.isFinite(m.t)) pts.push({ t: m.t, kind: "marker", anchor: { kind: "marker", marker: m.id }, label: m.label });
  }
  return pts.sort((a, b) => a.t - b.t);
}

/** Kinds that make good structural anchors when nothing is close enough to snap to. */
const STRUCTURAL: SnapKind[] = ["line", "word", "section", "bar", "beat", "start"];

/**
 * The anchor for a time: the snap point within `tolerance` seconds if there is one, else the nearest structural
 * point plus an offset. Returns the point used, so the UI can say what it snapped to.
 */
export function anchorForTime(
  t: number,
  points: SnapPoint[],
  tolerance: number,
): { anchor: Anchor; point: SnapPoint | undefined; snapped: boolean } {
  let best: SnapPoint | undefined;
  for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  if (best && Math.abs(best.t - t) <= tolerance) return { anchor: best.anchor, point: best, snapped: true };

  let base: SnapPoint | undefined;
  for (const p of points) {
    if (!STRUCTURAL.includes(p.kind)) continue;
    if (!base || Math.abs(p.t - t) < Math.abs(base.t - t)) base = p;
  }
  if (!base) return { anchor: { kind: "time", t: round(t) }, point: undefined, snapped: false };
  const off = round(t - base.t);
  const anchor: Anchor = base.anchor.kind === "time" ? { kind: "time", t: round(t) } : { ...base.anchor, offset: off };
  return { anchor, point: base, snapped: false };
}

const round = (x: number) => Math.round(x * 1000) / 1000;
