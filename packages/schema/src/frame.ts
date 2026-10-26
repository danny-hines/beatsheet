/**
 * Where things in a source picture end up in the frame: subject tracks over time, and the "cover" crop every clip is
 * drawn with (scaled to fill the format, positioned by its reframe, then zoomed). Shared by the composition, which
 * draws effects that follow subjects, and the studio, which shows them.
 */
import type { Rect, SubjectTrack } from "./types.ts";

/** A subject's box at `t` seconds into its file, interpolated; undefined when it isn't on screen then. */
export function subjectAt(track: Pick<SubjectTrack, "samples">, t: number, slack = 0.3): Rect | undefined {
  const s = track.samples;
  if (!s.length) return undefined;
  const first = s[0]!, last = s[s.length - 1]!;
  if (s.length === 1) return { x: first[1]!, y: first[2]!, w: first[3]!, h: first[4]! };
  if (t < first[0]! - slack || t > last[0]! + slack) return undefined;
  if (t <= first[0]!) return { x: first[1]!, y: first[2]!, w: first[3]!, h: first[4]! };
  if (t >= last[0]!) return { x: last[1]!, y: last[2]!, w: last[3]!, h: last[4]! };
  // Binary search for the pair around t.
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]![0]! <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo]!, b = s[hi]!;
  // A long gap between samples means it was lost in between, not that it glided across.
  if (b[0]! - a[0]! > 1.5 && t - a[0]! > slack && b[0]! - t > slack) return undefined;
  const k = b[0]! > a[0]! ? (t - a[0]!) / (b[0]! - a[0]!) : 0;
  const mix = (i: number) => a[i]! + (b[i]! - a[i]!) * k;
  return { x: mix(1), y: mix(2), w: mix(3), h: mix(4) };
}

/** The subject's centre around `t`, averaged over a second so a reframe that follows it glides instead of jittering. */
export function subjectFocus(track: Pick<SubjectTrack, "samples">, t: number): { x: number; y: number } | undefined {
  let x = 0, y = 0, n = 0;
  for (const dt of [-0.5, -0.25, 0, 0.25, 0.5]) {
    const r = subjectAt(track, t + dt);
    if (!r) continue;
    x += r.x + r.w / 2;
    y += r.y + r.h / 2;
    n++;
  }
  return n ? { x: x / n, y: y / n } : undefined;
}

export type Cover = {
  /** CSS object-position, 0..1 on each axis. */
  pos: { x: number; y: number };
  zoom: number;
  /** A point in the source (0..1) to pixels in the frame. */
  point(u: number, v: number): { x: number; y: number };
  /** A source rect to a rect of frame pixels. */
  rect(r: Rect): { x: number; y: number; w: number; h: number };
};

/**
 * The crop a clip is drawn with: scaled to cover a w×h frame, placed by object-position `pos`, then zoomed about that
 * same point (how the composition draws every clip).
 */
export function cover(src: { width: number; height: number }, out: { width: number; height: number }, pos: { x: number; y: number }, zoom = 1): Cover {
  const s = Math.max(out.width / src.width, out.height / src.height);
  const dw = src.width * s, dh = src.height * s;
  const ox = (out.width - dw) * pos.x, oy = (out.height - dh) * pos.y;
  const cx = out.width * pos.x, cy = out.height * pos.y;
  const point = (u: number, v: number) => ({ x: cx + (ox + u * dw - cx) * zoom, y: cy + (oy + v * dh - cy) * zoom });
  return {
    pos,
    zoom,
    point,
    rect(r) {
      const a = point(r.x, r.y), b = point(r.x + r.w, r.y + r.h);
      return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
    },
  };
}

/** The object-position that puts a source point (0..1) as near the middle of the frame as the crop allows. */
export function centreOn(src: { width: number; height: number }, out: { width: number; height: number }, at: { x: number; y: number }) {
  const s = Math.max(out.width / src.width, out.height / src.height);
  const dw = src.width * s, dh = src.height * s;
  const axis = (frame: number, drawn: number, u: number) => (Math.abs(frame - drawn) < 0.5 ? 0.5 : Math.min(1, Math.max(0, (frame / 2 - u * drawn) / (frame - drawn))));
  return { x: axis(out.width, dw, at.x), y: axis(out.height, dh, at.y) };
}
