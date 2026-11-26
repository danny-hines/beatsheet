/**
 * Voiced lines. A line voiced by beatsheet has a file named with a fingerprint of the voice and the words it read
 * (`hook-1a2b3c4d.wav`), so anyone can tell when the text or the cut's voice has changed since: the line needs voicing
 * again. Files made elsewhere (recorded, or from before) carry no fingerprint and count as voiced.
 */

/** FNV-1a: small, stable, and the same in the studio and the engine. Not for security. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** What a line says, as the voice reads it. */
export const spokenText = (line: { text: string; tts?: string }) => (line.tts ?? line.text).trim();

/** The fingerprint a line's file carries once `voice` has read it. */
export const voiceKey = (voice: string, line: { text: string; tts?: string }) => fnv(`${voice}\n${spokenText(line)}`);

const keyIn = (file: string) => /-([0-9a-f]{8})\.[a-z0-9]+$/i.exec(file)?.[1];

export type LineState = "voiced" | "changed" | "silent";

/** The voice a line is read in: its speaker's, when the cast gives them one, else the cut's. */
export const lineVoice = (cutVoice: string | undefined, line: { speaker?: string }, cast?: { id: string; voice?: string }[]) =>
  (line.speaker ? cast?.find((m) => m.id === line.speaker)?.voice : undefined) ?? cutVoice;

/** Whether a line's audio matches its words and the voice that reads it: voiced, changed since, or not voiced at all. */
export function lineState(voice: string | undefined, line: { text: string; tts?: string; file?: string }): LineState {
  if (!line.file) return "silent";
  const key = keyIn(line.file);
  if (!key || !voice) return "voiced";
  return key === voiceKey(voice, line) ? "voiced" : "changed";
}

/**
 * Which provider a voice id belongs to: elevenlabs:…, kokoro:…, mac:… or windows:… (each computer's own voices);
 * anything else was named by hand.
 */
export function voiceProvider(id: string | undefined): "elevenlabs" | "kokoro" | "mac" | "windows" | undefined {
  const p = id?.split(":")[0];
  return p === "elevenlabs" || p === "kokoro" || p === "mac" || p === "windows" ? p : undefined;
}

/** Shifts and clamps a line's word timestamps after dead leading/trailing silence has been trimmed off its audio. */
export function tightenLineTiming<W extends { w: string; s: number; e: number }>(
  words: W[],
  duration: number,
  trimStart: number,
  trimEnd: number,
): { duration: number; words: W[] } {
  const start = Math.max(0, trimStart);
  const end = Math.max(start + 0.05, Math.min(duration, trimEnd));
  const nextDuration = Math.round((end - start) * 1000) / 1000;
  let cursor = 0;
  const shifted = words.map((word) => {
    const s = Math.max(cursor, Math.min(nextDuration, Math.round((word.s - start) * 1000) / 1000));
    const e = Math.max(s, Math.min(nextDuration, Math.round((word.e - start) * 1000) / 1000));
    cursor = s;
    return { ...word, s, e };
  });
  return { duration: nextDuration, words: shifted };
}

/** Tightens excessive pauses between narrated lines for brisker social/explainer pacing. */
export function tightenLineGaps<L extends { gapAfter?: number; holdBefore?: number }>(
  lines: L[],
  opts: { maxGap?: number; minGap?: number; maxHold?: number } = {},
): L[] {
  const maxGap = opts.maxGap ?? 0.25;
  const minGap = opts.minGap ?? 0.08;
  const maxHold = opts.maxHold ?? 0.35;
  return lines.map((line) => {
    const next = { ...line };
    if (next.gapAfter !== undefined) next.gapAfter = Math.round(Math.max(minGap, Math.min(maxGap, next.gapAfter)) * 1000) / 1000;
    if (next.holdBefore !== undefined && next.holdBefore > maxHold) next.holdBefore = maxHold;
    return next;
  });
}
