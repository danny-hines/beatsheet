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

/** Whether a line's audio matches its words and the cut's voice: voiced, changed since, or not voiced at all. */
export function lineState(voice: string | undefined, line: { text: string; tts?: string; file?: string }): LineState {
  if (!line.file) return "silent";
  const key = keyIn(line.file);
  if (!key || !voice) return "voiced";
  return key === voiceKey(voice, line) ? "voiced" : "changed";
}

/** Which provider a voice id belongs to: elevenlabs:…, kokoro:… or mac:…; anything else was named by hand. */
export function voiceProvider(id: string | undefined): "elevenlabs" | "kokoro" | "mac" | undefined {
  const p = id?.split(":")[0];
  return p === "elevenlabs" || p === "kokoro" || p === "mac" ? p : undefined;
}
