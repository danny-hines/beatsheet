/**
 * Narration: a cut's script read aloud. Lines go in as text; each is voiced into the project's vo/ folder with the time
 * of every word, so the resolver can place it and shots can start on a word. A line is voiced again only when its words
 * or the cut's voice change (its file name carries a fingerprint of both), and earlier files are kept, so undoing a turn
 * still has the audio it points at.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cutOf, lineState, lineVoice, slugify, spokenText, voiceKey, type Line, type ProjectFile, type Voice, type Word } from "@beatsheet/schema";
import { loadFile, updateFile } from "./store.ts";
import { resolveVoice, speak } from "./voices.ts";

export type LineInput = { id?: string; text: string; tts?: string; gapAfter?: number; holdBefore?: number; only?: string[]; speaker?: string };
export type NarrateOptions = {
  cut?: string;
  /** Lines to write (new ids are added after the others, in order). Without them, the cut's lines are voiced as they are. */
  lines?: LineInput[];
  /** Make the script exactly `lines`, dropping the rest. */
  replace?: boolean;
  /** Only these line ids (default: every line that needs it). */
  only?: string[];
  /** A voice id; it becomes the cut's voice. Default: the cut's, else the person's default. */
  voice?: string;
  /** Voice lines again even when nothing changed. */
  force?: boolean;
  onProgress?: (fraction: number, line: string) => void;
};
export type NarrateResult = { cut: string; voice: string; voiced: { id: string; duration: number }[]; kept: string[]; lines: Line[] };

/** The cut's lines with `input` written in: changed text replaces, new lines go on the end (or the script is just `input`). */
function writeLines(existing: Line[], input: LineInput[] | undefined, replace?: boolean): Line[] {
  if (!input) return existing;
  const taken = new Set(existing.map((l) => l.id));
  const out = replace ? [] : existing.map((l) => ({ ...l }));
  for (const given of input) {
    let id = given.id?.trim();
    if (!id) {
      const base = slugify(given.text.split(/\s+/).slice(0, 3).join(" ")).slice(0, 24) || "line";
      id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    }
    taken.add(id);
    const was = existing.find((l) => l.id === id);
    const line: Line = {
      ...(was ?? { duration: 0, words: [] }),
      id,
      text: given.text.trim(),
      tts: given.tts?.trim() || undefined,
      ...(given.gapAfter !== undefined ? { gapAfter: given.gapAfter } : {}),
      ...(given.holdBefore !== undefined ? { holdBefore: given.holdBefore } : {}),
      ...(given.only ? { only: given.only } : {}),
      // "" goes back to the narrator.
      ...(given.speaker !== undefined ? { speaker: given.speaker || undefined } : {}),
    };
    const at = out.findIndex((l) => l.id === id);
    if (at >= 0) out[at] = line;
    else out.push(line);
  }
  return out;
}

const KEEP_VOICE = { leadIn: 0.3, defaultGap: 0.5, tail: 1 };

/** Writes and voices a cut's narration. Refuses when the cut's script is locked. */
export async function narrate(projectId: string, opts: NarrateOptions = {}): Promise<NarrateResult> {
  const { doc, dir } = loadFile(projectId);
  const cut = cutOf(doc, opts.cut);
  if (opts.cut && cut.id !== opts.cut) throw new Error(`No cut "${opts.cut}"`);
  if (cut.stages.structure?.locked) throw new Error(`The script for "${cut.name}" is locked (its structure stage). Unlock it to change the narration.`);
  if (opts.lines?.some((l) => !l.text?.trim())) throw new Error("Every line needs some text");
  const voice = await resolveVoice(opts.voice ?? cut.voice?.voice);
  const lines = writeLines(cut.voice?.lines ?? [], opts.lines, opts.replace);
  if (!lines.length) throw new Error("There's nothing to read yet: pass the lines to voice.");
  // A character's lines are read in its own voice, when it has one; the rest (and any whose speaker has gone) in the cut's.
  const voices = new Map<string, string>([[voice, voice]]);
  for (const l of lines) {
    const own = lineVoice(undefined, l, doc.cast);
    if (own && !voices.has(own)) voices.set(own, await resolveVoice(own));
  }
  const voiceOf = (l: Line) => voices.get(lineVoice(voice, l, doc.cast)!) ?? voice;

  const todo = lines.filter((l) => (!opts.only || opts.only.includes(l.id)) && (opts.force || lineState(voiceOf(l), l) !== "voiced" || !l.file || !l.words.length));
  const voiced = new Map<string, { file: string; duration: number; words: Word[]; spoken: string }>();
  for (const [i, l] of todo.entries()) {
    opts.onProgress?.(i / todo.length, l.id);
    const lv = voiceOf(l);
    const base = join(dir, "vo", cut.id, `${l.id}-${voiceKey(lv, l)}`);
    // The same words in the same voice were read before (an undone turn, say): use that.
    const sidecar = `${base}.json`;
    const before = existsSync(sidecar) ? (JSON.parse(readFileSync(sidecar, "utf8")) as { file: string; duration: number; words: Word[] }) : undefined;
    const r = before && existsSync(before.file) && !opts.force ? before : await speak(lv, spokenText(l), base);
    writeFileSync(sidecar, JSON.stringify(r));
    // Captions show the line as written, so words come from the text when it reads the same number of words.
    const written = l.text.split(/\s+/).filter(Boolean);
    const words = l.tts && written.length === r.words.length ? r.words.map((w, k) => ({ ...w, w: written[k]! })) : r.words;
    voiced.set(l.id, { file: r.file, duration: r.duration, words, spoken: spokenText(l) });
  }
  opts.onProgress?.(1, "");

  // Written into the file as it is now, so anything changed meanwhile (in the studio, say) is kept.
  let saved: Line[] = [];
  updateFile(projectId, (d: ProjectFile) => {
    const c = d.cuts.find((x) => x.id === cut.id);
    if (!c) throw new Error(`The cut "${cut.name}" was deleted while its narration was being read`);
    const now = writeLines(c.voice?.lines ?? [], opts.lines, opts.replace).map((l) => {
      const v = voiced.get(l.id);
      return v && v.spoken === spokenText(l) ? { ...l, file: v.file, duration: v.duration, words: v.words } : l;
    });
    c.voice = { ...KEEP_VOICE, ...(c.voice ?? {}), voice, lines: now } satisfies Voice;
    saved = now;
  });
  return { cut: cut.id, voice, voiced: [...voiced].map(([id, v]) => ({ id, duration: v.duration })), kept: lines.filter((l) => !voiced.has(l.id)).map((l) => l.id), lines: saved };
}
