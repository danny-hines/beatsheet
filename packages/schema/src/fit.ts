/**
 * Fitting a song to a cut: rather than fading out wherever the cut stops, play from the top, then jump (on a bar line)
 * to the stretch of the song that leads into its own ending, so the last chord lands on the last frame. Both ends of
 * the jump are bar lines, so it's on the beat; the cut comes out within half a bar of the length asked for.
 */
import type { BeatGrid } from "./types.ts";

export type SongFit = {
  /** Play the song from `from` up to `headEnd`… */
  headEnd: number;
  /** …then from `tailStart` to the song's end. */
  tailStart: number;
  /** How long that runs, in seconds of the cut. */
  total: number;
  /** No jump needed: the song (from `from`) fits as it is. */
  whole: boolean;
};

/** Bar lines of a song: the downbeat and every bar from it, inside the song. */
export function barLines(grid: BeatGrid, duration: number): number[] {
  const bar = (grid.beatsPerBar * 60) / grid.bpm;
  const first = grid.downbeat - Math.floor(grid.downbeat / bar) * bar;
  const out: number[] = [];
  for (let t = first; t < duration - 1e-6; t += bar) out.push(Math.round(t * 1000) / 1000);
  return out;
}

/**
 * Plans the jump for a cut of `length` seconds starting at `from` in the song. Prefers an ending of about six bars (a
 * real phrase, not just the last chord), and at least two bars of the song's top.
 */
export function fitSong(song: { grid: BeatGrid; duration: number }, length: number, from = 0): SongFit {
  const bars = barLines(song.grid, song.duration);
  const bar = (song.grid.beatsPerBar * 60) / song.grid.bpm;
  if (song.duration - from <= length + bar / 2 || bars.length < 6) return { headEnd: song.duration, tailStart: song.duration, total: song.duration - from, whole: true };
  let best: { headEnd: number; tailStart: number; total: number; score: number } | undefined;
  for (const h of bars) {
    if (h < from + 2 * bar - 1e-3) continue;
    const head = h - from;
    if (head > length) break;
    for (const j of bars) {
      if (j < h + bar - 1e-3) continue;
      const tail = song.duration - j;
      if (tail < 2 * bar - 1e-3) break;
      const total = head + tail;
      const tailBars = tail / bar;
      const score = Math.abs(total - length) + 0.05 * Math.abs(tailBars - 6);
      if (!best || score < best.score) best = { headEnd: h, tailStart: j, total, score };
    }
  }
  if (!best) return { headEnd: song.duration, tailStart: song.duration, total: song.duration - from, whole: true };
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return { headEnd: r3(best.headEnd), tailStart: r3(best.tailStart), total: r3(best.total), whole: false };
}
