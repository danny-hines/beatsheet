/**
 * The cut as what's said in it: the words of the footage its picture plays (from each clip's transcript), laid out in
 * cut time. Editing the words edits the cut: deleting a sentence takes that stretch out and closes the gap, and the
 * ums and the long pauses come out in one go. The same words make captions for what's said on camera, and subtitle
 * files.
 */
import { removeRange } from "./edit.ts";
import { resolveTimeline, type Timeline } from "./resolve.ts";
import type { SaidWord } from "./transcript.ts";
import type { Project } from "./types.ts";

/** A word said in the cut: where it plays (s, e in cut seconds), which shot and clip it's from, and its place in the clip's transcript. */
export type CutWord = { w: string; s: number; e: number; shot: string; asset: string; i: number; speaker?: string };

/** The words a clip's transcript has, by asset id; undefined when it hasn't been transcribed. */
export type WordsOf = (asset: string) => SaidWord[] | undefined;

/**
 * Every word the picture plays, in cut order: each clip shot's words that fall inside the stretch of the clip it
 * plays, at the time they're heard in the cut (a word cut off by the shot's end is left out).
 */
export function cutWords(p: Project, tl: Timeline, wordsOf: WordsOf, track?: string): CutWord[] {
  const pic = track ?? p.tracks.find((t) => t.kind === "picture")?.id;
  const shots = new Map(p.shots.map((s) => [s.id, s]));
  const out: CutWord[] = [];
  for (const r of tl.shots) {
    if (r.track !== pic || !Number.isFinite(r.start) || !Number.isFinite(r.end)) continue;
    const c = shots.get(r.id)?.content;
    if (c?.kind !== "clip") continue;
    // A camera without a transcript of its own hears what another camera on the same event did, shifted into its time.
    let heard = c.asset;
    let words = wordsOf(c.asset);
    let shift = 0;
    const own = p.assets.find((a) => a.id === c.asset);
    if (!words?.length && own?.angle) {
      const other = p.assets.find((a) => a.angle?.group === own.angle!.group && a.id !== own.id && wordsOf(a.id)?.length);
      if (other) {
        heard = other.id;
        words = wordsOf(other.id);
        shift = own.angle.offset - other.angle!.offset;
      }
    }
    if (!words?.length) continue;
    const speed = c.speed ?? 1;
    const from = r.sourceIn ?? c.in ?? 0;
    const to = from + (r.end - r.start) * speed;
    words.forEach((w, i) => {
      const s = w.s - shift, e = w.e - shift;
      // A word belongs to the shot that plays its middle, so one said across a cut is still heard once.
      const mid = (s + e) / 2;
      if (mid < from || mid >= to || !w.w.trim()) return;
      out.push({ w: w.w.trim(), s: r.start + (s - from) / speed, e: r.start + (e - from) / speed, shot: r.id, asset: heard, i, ...(w.speaker ? { speaker: w.speaker } : {}) });
    });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** Sounds people make between words, which come out without changing what's said. */
export const FILLERS = ["um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "hmm", "mm", "mmm"];
export const isFiller = (w: string) => FILLERS.includes(w.toLowerCase().replace(/[^a-z]/g, ""));

/**
 * The stretch of the cut to take out to remove words `i` to `j` (inclusive): from halfway through the pause before
 * them to halfway through the pause after, so what's left keeps a natural pause where they were.
 */
export function spanOf(words: CutWord[], i: number, j: number): [number, number] {
  const a = words[i]!, b = words[j]!;
  const prev = words[i - 1], next = words[j + 1];
  const from = prev && prev.e <= a.s ? prev.e + (a.s - prev.e) / 2 : a.s;
  const to = next && next.s >= b.e ? b.e + (next.s - b.e) / 2 : b.e;
  return [from, to];
}

/** Every filler on its own (a run of them together comes out as one stretch). */
export function fillerSpans(words: CutWord[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < words.length; i++) {
    if (!isFiller(words[i]!.w)) continue;
    let j = i;
    while (j + 1 < words.length && isFiller(words[j + 1]!.w)) j++;
    out.push(spanOf(words, i, j));
    i = j;
  }
  return out;
}

/**
 * Pauses longer than `longest` seconds between words, shortened to `keep`: the middle of each comes out. A pause at
 * the very start or end of the words is left alone (it's the cut's own breathing room).
 */
export function pauseSpans(words: CutWord[], opts: { longest?: number; keep?: number } = {}): [number, number][] {
  const longest = opts.longest ?? 0.7;
  const keep = Math.min(opts.keep ?? 0.3, longest);
  const out: [number, number][] = [];
  for (let k = 1; k < words.length; k++) {
    const gap = words[k]!.s - words[k - 1]!.e;
    if (gap > longest) out.push([words[k - 1]!.e + keep / 2, words[k]!.s - keep / 2]);
  }
  return out;
}

/**
 * Takes stretches out of the picture and closes the gaps (a ripple each), the latest first so the earlier ones'
 * times still hold. Overlapping stretches count once; ones shorter than a frame are skipped.
 */
export function removeSpans(p: Project, tl: Timeline, spans: [number, number][], opts: { track?: string; ripple?: boolean } = {}): number {
  const track = opts.track ?? p.tracks.find((t) => t.kind === "picture")?.id;
  if (!track) return 0;
  const merged: [number, number][] = [];
  for (const sp of [...spans].filter(([a, b]) => b - a > 0.03).sort((x, y) => x[0] - y[0])) {
    const last = merged.at(-1);
    if (last && sp[0] <= last[1] + 1e-3) last[1] = Math.max(last[1], sp[1]);
    else merged.push([...sp]);
  }
  let work = tl;
  for (const [a, b] of [...merged].reverse()) {
    removeRange(p, work, track, a, b, { ripple: opts.ripple ?? true });
    work = resolveTimeline(p, tl.format);
  }
  return merged.reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** A caption on screen: from its first word to the next phrase, the words in it timed so the spoken one can light up. */
export type Phrase = { from: number; until: number; words: { w: string; s: number; e: number }[]; speaker?: string };

/**
 * What's said, cut into short phrases for captions: a few words at a time, breaking at punctuation, a pause or a new
 * speaker. Narration and the footage's own words together, in time order.
 */
export function captionPhrases(tl: Timeline, footage: CutWord[] = [], opts: { most?: number; chars?: number } = {}): Phrase[] {
  const most = opts.most ?? 3;
  const chars = opts.chars ?? 16;
  const runs: { w: string; s: number; e: number; speaker?: string; run: string }[][] = [];
  for (const line of tl.lines) if (Number.isFinite(line.start)) runs.push(line.words.map((w) => ({ ...w, run: line.id })));
  if (footage.length) runs.push(footage.map((w) => ({ w: w.w, s: w.s, e: w.e, speaker: w.speaker, run: w.shot })));
  const out: Phrase[] = [];
  for (const words of runs) {
    let cur: Phrase["words"] = [];
    let who: string | undefined;
    const flush = () => {
      if (!cur.length) return;
      out.push({ from: cur[0]!.s - 0.04, until: cur[cur.length - 1]!.e + 0.35, words: cur, ...(who ? { speaker: who } : {}) });
      cur = [];
    };
    words.forEach((w, k) => {
      const prev = words[k - 1];
      if (prev && (w.s - prev.e > 0.6 || w.speaker !== prev.speaker)) flush();
      if (!cur.length) who = w.speaker;
      cur.push({ w: w.w, s: w.s, e: w.e });
      const len = cur.reduce((n, x) => n + x.w.length + 1, 0);
      if (/[,.;:!?]$/.test(w.w) || cur.length >= most || len > chars) flush();
    });
    flush();
  }
  out.sort((a, b) => a.from - b.from);
  // A phrase stays up until the next one starts, but not past its own words by much.
  return out.map((ph, k) => ({ ...ph, until: Math.min(ph.until, out[k + 1]?.from ?? Infinity) }));
}

/** Subtitles as a file: SubRip (.srt) or WebVTT (.vtt), a sentence or so per cue rather than three words. */
export function subtitles(phrases: Phrase[], kind: "srt" | "vtt"): string {
  // Captions are short for the screen; subtitles read better a line at a time, so phrases close together join up.
  const cues: { from: number; until: number; text: string }[] = [];
  for (const ph of phrases) {
    const text = ph.words.map((w) => w.w).join(" ");
    const last = cues.at(-1);
    if (last && ph.from - last.until < 0.3 && (last.text + " " + text).length <= 84 && !/[.!?]$/.test(last.text)) {
      last.text += " " + text;
      last.until = ph.until;
    } else cues.push({ from: Math.max(0, ph.from), until: ph.until, text });
  }
  const stamp = (t: number, sep: string) => {
    const ms = Math.max(0, Math.round(t * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    const two = (n: number) => String(n).padStart(2, "0");
    return `${two(h)}:${two(m)}:${two(s)}${sep}${String(ms % 1000).padStart(3, "0")}`;
  };
  const wrap = (text: string) => {
    if (text.length <= 42) return text;
    // Two lines, broken at the space nearest the middle.
    const mid = text.length / 2;
    let at = -1;
    for (let i = 0; i < text.length; i++) if (text[i] === " " && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i;
    return at < 0 ? text : `${text.slice(0, at)}\n${text.slice(at + 1)}`;
  };
  if (kind === "vtt") return `WEBVTT\n\n${cues.map((c) => `${stamp(c.from, ".")} --> ${stamp(c.until, ".")}\n${wrap(c.text)}`).join("\n\n")}\n`;
  return `${cues.map((c, k) => `${k + 1}\n${stamp(c.from, ",")} --> ${stamp(c.until, ",")}\n${wrap(c.text)}`).join("\n\n")}\n`;
}
