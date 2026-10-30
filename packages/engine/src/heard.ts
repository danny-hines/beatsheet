/**
 * Who's who in what's said: a speaker in a clip's transcript named as someone in the cast (a new one, like Grandpa,
 * when they aren't there yet), and the same person found in the project's other clips by their voice. Each named
 * person keeps a sample of their voice, cut from the lines they've been named in; to look for them in a clip, the
 * samples go in front of the clip and the speaker labeller groups it all in one run (voicesFromTurns in the schema).
 * It runs where who's speaking is installed beside Whisper, whoever transcribed the clip.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { slugify, voicesFromTurns, voiceSample, type CastMember, type Project } from "@beatsheet/schema";
import { assetPath } from "./paths.ts";
import { runSpeakers, speakersReady } from "./speakers.ts";
import { loadProject, updateFile } from "./store.ts";
import { readTranscript } from "./transcribe.ts";

const exec = promisify(execFile);
const ff = (args: string[]) => exec("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 16 * 1024 * 1024 });
const seconds = async (file: string) => Number((await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])).stdout.trim());

/**
 * Names a speaker in a clip's transcript: as a cast member already there (`cast`), or as someone new (`name`, made a
 * character). `null` for both takes the name off. A speaker is one person in a clip, so naming moves them from
 * whoever had them. Returns the member's id.
 */
export function nameSpeaker(projectId: string, asset: string, speaker: string, who: { cast?: string; name?: string }): string | undefined {
  let member: string | undefined;
  updateFile(projectId, (d) => {
    const a = d.assets.find((x) => x.id === asset);
    if (!a?.transcript) throw new Error(`"${asset}" hasn't been transcribed`);
    const cast = (d.cast ??= []);
    for (const m of cast) if (m.heard) m.heard = m.heard.filter((h) => !(h.asset === asset && h.speaker === speaker));
    if (who.cast) {
      const m = cast.find((x) => x.id === who.cast);
      if (!m || m.kind === "style") throw new Error(`No one called @${who.cast} in the cast`);
      member = m.id;
    } else if (who.name?.trim()) {
      const name = who.name.trim();
      const same = cast.find((x) => x.kind === "character" && x.name.toLowerCase() === name.toLowerCase());
      if (same) member = same.id;
      else {
        const base = slugify(name);
        let id = base;
        for (let n = 2; cast.some((x) => x.id === id); n++) id = `${base}-${n}`;
        cast.push({ id, name, kind: "character" });
        member = id;
      }
    }
    if (member) {
      const m = cast.find((x) => x.id === member)!;
      m.heard = [...(m.heard ?? []), { asset, speaker }];
    }
    for (const m of cast) if (m.heard && !m.heard.length) delete m.heard;
  });
  return member;
}

type Found = { asset: string; speaker: string; member: string };

/**
 * Looks for the named people in clips: every transcribed clip with speakers (or the ones asked about), for everyone
 * heard somewhere (or the ones asked about). Speakers found are named; ones already named are left as they are.
 * Says why when it can't look (no speaker labeller here, or nobody named yet).
 */
export async function findVoices(projectId: string, opts: { assets?: string[]; members?: string[] } = {}): Promise<{ found: Found[]; why?: string }> {
  const labeller = speakersReady();
  if (!labeller) return { found: [], why: "Who's speaking isn't installed with Whisper on this computer (Settings → Transcription), so voices can't be matched" };
  const { project, dir } = loadProject(projectId);
  const people = (project.cast ?? []).filter((m) => m.heard?.length && (!opts.members || opts.members.includes(m.id)));
  if (!people.length) return { found: [], why: "Nobody has been named in a transcript yet" };
  const targets = project.assets.filter((a) => a.transcript?.speakers && (!opts.assets || opts.assets.includes(a.id)));
  const work = mkdtempSync(join(tmpdir(), "beatsheet-voices-"));
  const found: Found[] = [];
  try {
    for (const target of targets) {
      const t = readTranscript(projectId, target.id);
      if (!t) continue;
      const named = new Set((project.cast ?? []).flatMap((m) => (m.heard ?? []).filter((h) => h.asset === target.id).map((h) => h.speaker)));
      const open = [...new Set(t.words.map((w) => w.speaker).filter((s): s is string => !!s && !named.has(s)))];
      if (!open.length) continue;
      // Each person's sample from their other clips: matching a clip against itself proves nothing.
      const samples: { who: string; file: string }[] = [];
      for (const m of people) {
        const file = await sampleOf(projectId, dir, project, m, target.id, work);
        if (file) samples.push({ who: m.id, file });
      }
      if (!samples.length) continue;
      const matched = await matchIn(labeller, samples, assetPath(project, dir, target), t.words, work);
      for (const [speaker, member] of Object.entries(matched)) if (open.includes(speaker)) found.push({ asset: target.id, speaker, member });
    }
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  if (found.length)
    updateFile(projectId, (d) => {
      for (const f of found) {
        const m = d.cast?.find((x) => x.id === f.member);
        if (m && !d.cast!.some((x) => x.heard?.some((h) => h.asset === f.asset && h.speaker === f.speaker))) m.heard = [...(m.heard ?? []), { asset: f.asset, speaker: f.speaker }];
      }
    });
  return { found };
}

/** A person's voice from the clips they're named in (not `except`), as one 16 kHz WAV of up to 12 seconds. */
async function sampleOf(projectId: string, dir: string, project: Project, m: CastMember, except: string, work: string): Promise<string | undefined> {
  const pieces: string[] = [];
  let left = 12;
  for (const h of m.heard ?? []) {
    if (h.asset === except || left <= 0.5) continue;
    const a = project.assets.find((x) => x.id === h.asset);
    const t = a && readTranscript(projectId, a.id);
    if (!a || !t) continue;
    const file = assetPath(project, dir, a);
    if (!existsSync(file)) continue;
    for (const span of voiceSample(t, h.speaker, left)) {
      const out = join(work, `${m.id}-${pieces.length}.wav`);
      await ff(["-ss", String(span.s), "-to", String(span.e), "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out]);
      pieces.push(out);
      left -= span.e - span.s;
    }
  }
  if (!pieces.length) return undefined;
  const out = join(work, `${m.id}.wav`);
  await joinWavs(pieces, out, work, 0.3);
  return out;
}

/** WAVs one after another with `gap` seconds of silence between, as one 16 kHz mono WAV. */
async function joinWavs(files: string[], out: string, work: string, gap: number) {
  const silence = join(work, `silence-${gap}.wav`);
  if (!existsSync(silence)) await ff(["-f", "lavfi", "-i", `anullsrc=r=16000:cl=mono`, "-t", String(gap), "-c:a", "pcm_s16le", silence]);
  const list = join(work, `list-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.txt`);
  writeFileSync(list, files.flatMap((f, i) => [...(i ? [silence] : []), f]).map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  await ff(["-f", "concat", "-safe", "0", "-i", list, "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1", out]);
}

/** One labelling run over the samples and then the clip; which of the clip's speakers each person is. */
async function matchIn(labeller: NonNullable<ReturnType<typeof speakersReady>>, samples: { who: string; file: string }[], clip: string, words: Parameters<typeof voicesFromTurns>[2], work: string): Promise<Record<string, string>> {
  const clipWav = join(work, `clip-${Date.now().toString(36)}.wav`);
  await ff(["-i", clip, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", clipWav]);
  const gap = 1.5;
  const spans: { who: string; s: number; e: number }[] = [];
  let at = 0;
  for (const x of samples) {
    const d = await seconds(x.file);
    spans.push({ who: x.who, s: at, e: at + d });
    at += d + gap;
  }
  const all = join(work, `all-${Date.now().toString(36)}.wav`);
  await joinWavs([...samples.map((x) => x.file), clipWav], all, work, gap);
  const turns = await runSpeakers(labeller, all);
  return voicesFromTurns(turns, spans, words, at);
}
