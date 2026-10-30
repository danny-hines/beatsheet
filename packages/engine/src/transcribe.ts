/**
 * Transcribing what's said in a clip, with whichever transcriber suits this machine: Whisper here (whispercpp.ts) or a
 * service with the person's key (ElevenLabs Scribe, OpenAI's Whisper). Which can be used, and which Auto picks, is
 * the schema's chooseTranscriber, fed with what this machine has. The transcript (every word, its time and, when the
 * transcriber can tell, who said it) is kept beside the project in transcripts/<asset id>.json, and the asset notes
 * that it has one. Keys are read inside the engine and never pass through the agent.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assignSpeakers, chooseTranscriber, linesOf, TRANSCRIBERS, type SaidWord, type Transcript, type TranscriberChoice, type TranscriberState } from "@beatsheet/schema";
import { assetPath, projectDir } from "./paths.ts";
import { getSecret, readSettings } from "./settings.ts";
import { loadProject, updateFile } from "./store.ts";
import { runSpeakers, speakersReady } from "./speakers.ts";
import { runWhisper, whisperReady, whisperStatus } from "./whispercpp.ts";

const exec = promisify(execFile);

const BASES = {
  elevenlabs: process.env.BEATSHEET_ELEVENLABS ?? "https://api.elevenlabs.io/v1",
  openai: process.env.BEATSHEET_OPENAI ?? "https://api.openai.com/v1",
};

/** Whether each transcriber can be used on this machine now, and if not, what would let it. */
export async function transcriberStates(): Promise<Record<string, TranscriberState>> {
  const saved = readSettings().services;
  const w = await whisperStatus();
  const ready = whisperReady();
  const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`);
  const whisper: TranscriberState =
    ready && w.state === "ready"
      ? { state: "ready", speed: ready.speed, where: `on ${ready.where}`, ...(speakersReady() ? { speakers: true } : {}) }
      : w.state === "unsupported"
        ? { state: "unfit", detail: w.detail }
        : w.state === "installing"
          ? { state: "install", detail: `Installing: ${w.detail}` }
          : { state: "install", detail: `Install it in Settings → Transcription${w.plan ? ` (${w.plan.brew ? "with Homebrew, then " : ""}about ${mb(w.plan.bytes)}, for ${w.plan.where})` : ""}` };
  return {
    whisper,
    scribe: saved.elevenlabs ? { state: "ready" } : { state: "key", detail: "Needs an ElevenLabs key (Settings → Media services)" },
    "openai-whisper": saved.openai ? { state: "ready" } : { state: "key", detail: "Needs an OpenAI key (Settings → Media services)" },
  };
}

/** The transcribers for a clip of this length, Auto first, in the person's order when they've set one. */
export async function transcribeChoices(seconds: number | undefined, speakers = false) {
  return chooseTranscriber(await transcriberStates(), { seconds, speakers }, readSettings().transcribe?.ranking ?? []);
}

export const transcriptFile = (projectId: string, assetId: string) => join(projectDir(projectId), "transcripts", `${assetId}.json`);

/** An asset's transcript, when it has one. */
export function readTranscript(projectId: string, assetId: string): Transcript | undefined {
  try {
    return JSON.parse(readFileSync(transcriptFile(projectId, assetId), "utf8")) as Transcript;
  } catch {
    return undefined;
  }
}

/** The clip's sound as a file a transcriber takes: 16 kHz mono WAV for Whisper here, small MP3 to send to a service. */
async function soundOf(file: string, kind: "wav" | "mp3", from?: number, seconds?: number): Promise<string> {
  const out = join(tmpdir(), `beatsheet-said-${process.pid}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${kind}`);
  const range = [...(from !== undefined ? ["-ss", String(from)] : []), ...(seconds !== undefined ? ["-t", String(seconds)] : [])];
  const codec = kind === "wav" ? ["-c:a", "pcm_s16le"] : ["-c:a", "libmp3lame", "-b:a", "48k"];
  try {
    await exec("ffmpeg", ["-v", "error", "-y", ...range, "-i", file, "-vn", "-ac", "1", "-ar", "16000", ...codec, out], { maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not contain any stream|matches no streams|Output file .* does not contain/i.test(msg)) throw new Error("It has no sound to transcribe");
    throw err;
  }
  return out;
}

type Run = { words: SaidWord[]; language?: string; model?: string; events?: Transcript["events"]; costUsd?: number };

/**
 * Whisper here: the whole clip in one go, the speech-only stretches heard; then, when who's speaking is installed
 * beside it, each word given the speaker whose turn it falls in.
 */
async function onWhisper(file: string, onProgress: (f: number) => void, people?: number): Promise<Run> {
  const ready = whisperReady();
  if (!ready) throw new Error("Whisper isn't installed on this computer (Settings → Transcription)");
  const wav = await soundOf(file, "wav");
  try {
    const speakers = speakersReady();
    const r = await runWhisper(ready.binary, wav, { size: ready.model, onProgress: (f) => onProgress(speakers ? f * 0.7 : f) });
    if (!speakers || !r.words.length) return { words: r.words, language: r.language, model: ready.model };
    const turns = await runSpeakers(speakers, wav, { people });
    onProgress(1);
    return { words: assignSpeakers(r.words, turns), language: r.language, model: ready.model };
  } finally {
    rmSync(wav, { force: true });
  }
}

const said = (what: string, res: Response, body: { detail?: unknown; error?: { message?: string } }) => {
  const detail = typeof body.detail === "string" ? body.detail : ((body.detail as { message?: string } | undefined)?.message ?? body.error?.message);
  if (res.status === 401) return `${what} refused the key. Check it in Settings → Media services.`;
  return `${what} couldn't transcribe it${detail ? `: ${detail}` : ` (it answered ${res.status})`}`;
};

/** ElevenLabs Scribe: words with times, who said them, and laughter, applause and the like. */
async function onScribe(file: string, seconds: number | undefined, people?: number): Promise<Run> {
  const key = await getSecret("elevenlabs");
  if (!key) throw new Error("There's no ElevenLabs key (Settings → Media services)");
  const mp3 = await soundOf(file, "mp3");
  try {
    const form = new FormData();
    form.append("model_id", "scribe_v2");
    form.append("file", new Blob([readFileSync(mp3)], { type: "audio/mpeg" }), "sound.mp3");
    form.append("diarize", "true");
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "true");
    if (people) form.append("num_speakers", String(people));
    const res = await fetch(`${BASES.elevenlabs}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(30 * 60_000) });
    const body = (await res.json().catch(() => ({}))) as {
      language_code?: string;
      words?: { text: string; start: number | null; end: number | null; type: string; speaker_id?: string | null }[];
      detail?: unknown;
    };
    if (!res.ok) throw new Error(said("ElevenLabs", res, body));
    const words: SaidWord[] = [];
    const events: NonNullable<Transcript["events"]> = [];
    for (const w of body.words ?? []) {
      if (w.start === null || w.end === null) continue;
      if (w.type === "word") words.push({ w: w.text.trim(), s: w.start, e: w.end, ...(w.speaker_id ? { speaker: w.speaker_id } : {}) });
      else if (w.type === "audio_event") events.push({ s: w.start, e: w.end, label: w.text.replace(/^[([]|[)\]]$/g, "").trim() });
    }
    const t = TRANSCRIBERS.find((x) => x.id === "scribe")!;
    return { words, language: body.language_code, model: "scribe_v2", ...(events.length ? { events } : {}), ...(seconds ? { costUsd: Math.round((seconds / 3600) * t.perHour! * 1000) / 1000 } : {}) };
  } finally {
    rmSync(mp3, { force: true });
  }
}

/** OpenAI's Whisper takes 25 MB at a time: a long clip goes in half-hour pieces, each one's words moved to its place. */
const PIECE = 30 * 60;

async function onOpenAI(file: string, seconds: number | undefined, onProgress: (f: number) => void): Promise<Run> {
  const key = await getSecret("openai");
  if (!key) throw new Error("There's no OpenAI key (Settings → Media services)");
  const pieces = Math.max(1, Math.ceil((seconds ?? 1) / PIECE));
  const words: SaidWord[] = [];
  let language: string | undefined;
  for (let i = 0; i < pieces; i++) {
    const mp3 = await soundOf(file, "mp3", pieces > 1 ? i * PIECE : undefined, pieces > 1 ? PIECE : undefined);
    try {
      const form = new FormData();
      form.append("model", "whisper-1");
      form.append("file", new Blob([readFileSync(mp3)], { type: "audio/mpeg" }), "sound.mp3");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      const res = await fetch(`${BASES.openai}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(15 * 60_000) });
      const body = (await res.json().catch(() => ({}))) as { language?: string; words?: { word: string; start: number; end: number }[]; error?: { message?: string } };
      if (!res.ok) throw new Error(said("OpenAI", res, body));
      language ??= body.language;
      for (const w of body.words ?? []) words.push({ w: w.word.trim(), s: w.start + i * PIECE, e: w.end + i * PIECE });
    } finally {
      rmSync(mp3, { force: true });
    }
    onProgress((i + 1) / pieces);
  }
  const t = TRANSCRIBERS.find((x) => x.id === "openai-whisper")!;
  return { words: words.filter((w) => w.w), language, model: "whisper-1", ...(seconds ? { costUsd: Math.round((seconds / 3600) * t.perHour! * 1000) / 1000 } : {}) };
}

/**
 * Transcribes a clip (or a sound file) with the transcriber asked for, else Auto's pick for this machine, saves it, and
 * notes on the asset that it has one. Wanting speakers leaves only transcribers that can tell people apart.
 */
export async function transcribeAsset(
  projectId: string,
  assetId: string,
  opts: { with?: string; speakers?: boolean; people?: number; onProgress?: (f: number) => void } = {},
): Promise<{ transcript: Transcript; choice: TranscriberChoice }> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind === "image") throw new Error(`"${assetId}" is a photo; there's nothing to hear`);
  const { auto, ready, setup } = await transcribeChoices(a.duration, opts.speakers);
  const choice = opts.with ? ready.find((c) => c.id === opts.with) : auto;
  if (!choice) {
    const t = opts.with ? TRANSCRIBERS.find((x) => x.id === opts.with) : undefined;
    if (opts.with && !t) throw new Error(`No transcriber "${opts.with}"; there's ${TRANSCRIBERS.map((x) => x.id).join(", ")}`);
    const why = setup.filter((c) => !opts.with || c.id === opts.with).map((c) => `${c.label}: ${c.why}`);
    throw new Error(`Nothing can transcribe it here now. ${why.join(". ")}.`);
  }
  const file = assetPath(project, dir, a);
  if (!existsSync(file)) throw new Error(`Its file isn't there: ${file}`);
  const onProgress = opts.onProgress ?? (() => {});
  const r =
    choice.id === "whisper" ? await onWhisper(file, onProgress, opts.people) : choice.id === "scribe" ? await onScribe(file, a.duration, opts.people) : await onOpenAI(file, a.duration, onProgress);
  const transcript: Transcript = { by: choice.id, ...(r.model ? { model: r.model } : {}), ...(r.language ? { language: r.language } : {}), at: new Date().toISOString(), words: r.words, ...(r.events ? { events: r.events } : {}), ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}) };
  const out = transcriptFile(projectId, assetId);
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(transcript));
  const speakers = new Set(r.words.map((w) => w.speaker).filter(Boolean)).size;
  updateFile(projectId, (d) => {
    const x = d.assets.find((y) => y.id === assetId);
    if (x) x.transcript = { by: choice.id, ...(r.language ? { language: r.language } : {}), at: transcript.at, words: r.words.length, ...(speakers ? { speakers } : {}) };
  });
  return { transcript, choice };
}

/** A transcript as lines a person (or the agent) reads: when, who, what; or just the lines that say `search`. */
export function transcriptLines(t: Transcript, opts: { from?: number; to?: number; search?: string } = {}) {
  const words = opts.search?.toLowerCase().split(/\s+/).filter(Boolean);
  return linesOf(t).filter((l) => (opts.from === undefined || l.e >= opts.from) && (opts.to === undefined || l.s <= opts.to) && (!words?.length || words.every((w) => l.text.toLowerCase().includes(w))));
}
