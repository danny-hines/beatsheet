/**
 * Voices for narration, from whatever this Mac has: ElevenLabs with a key (its library, voices designed from a
 * description, the person's own cloned voice), Kokoro once it's installed in Settings, and always the Mac's own voices
 * (on Windows, Windows' own). Voice ids carry their provider: `elevenlabs:<voice id>`, `kokoro:af_heart`,
 * `mac:com.apple.voice.premium.en-US.Zoe`, `windows:Microsoft Zira Desktop`.
 *
 * `speak` reads a line into an audio file and says when each word starts and ends, which is what lets shots and cuts
 * hang off words.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { voiceProvider, type Word } from "@beatsheet/schema";
import { KOKORO_VOICES, kokoroReady, kokoroSpeak, kokoroStatus, type KokoroStatus } from "./kokoro.ts";
import { swiftHelper, windowsHelper } from "./native.ts";
import { HERE, IS_WINDOWS } from "./platform.ts";
import { probe } from "./probe.ts";
import { getSecret, readSettings, SETTINGS_DIR, updateSettings } from "./settings.ts";

export type VoiceInfo = {
  id: string;
  provider: "elevenlabs" | "kokoro" | "mac" | "windows";
  name: string;
  /** Accent, gender, character: a few words. */
  detail?: string;
  language?: string;
  /** How natural it sounds, for the Mac's voices: basic (compact), good (enhanced), best (premium). */
  quality?: "basic" | "good" | "best";
  /** One of the person's own ElevenLabs voices. */
  own?: "cloned" | "designed";
  /** A sample to play without making one. */
  previewUrl?: string;
};

export const ELEVEN_MODELS = [
  { id: "eleven_v4", label: "Eleven v4: the most natural" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2: steady, 29 languages" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5: quick, half the credits" },
];
const DEFAULT_MODEL = "eleven_v4";

export type VoicesInfo = {
  voices: VoiceInfo[];
  /** The person's chosen narration voice, if they've picked one. */
  default?: string;
  /** What narration uses when a cut hasn't picked a voice: the default, or the best voice available. */
  fallback?: string;
  model: string;
  models: typeof ELEVEN_MODELS;
  elevenlabs: { configured: boolean; error?: string };
  kokoro: KokoroStatus;
  /** This computer's own voices: the Mac's, or on Windows, Windows'. */
  mac: { ok: boolean; detail?: string; language?: string };
};

const VOICES_DIR = join(SETTINGS_DIR, "voices");
const SAMPLE = "Here's how I sound reading your video. Every cut lands right on the beat.";

// ---- The Mac's voices (on Windows, Windows' own, through a helper that answers the same way)

/** Which provider this computer's own voices are. */
const SYSTEM = IS_WINDOWS ? "windows" : "mac";

type MacVoice = { id: string; name: string; language: string; quality: "default" | "enhanced" | "premium"; gender: string; novelty: boolean; personal: boolean };

/** Runs the speech helper; resolves to its JSON answer. */
async function speechHelper<T>(args: string[]): Promise<T> {
  const bin = await (IS_WINDOWS ? windowsHelper("speech") : swiftHelper("speech"));
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", fail);
    p.on("close", (code) => {
      if (code !== 0) return fail(new Error(/^error (.*)$/m.exec(err)?.[1] ?? `the speech helper stopped (${code})`));
      try {
        ok(JSON.parse(out) as T);
      } catch {
        fail(new Error("the speech helper said something unreadable"));
      }
    });
  });
}

let macCache: { at: number; language: string; voices: MacVoice[] } | undefined;
/** The Mac's voices, asked for at most once a minute (they change only when someone downloads one). */
async function macVoices(): Promise<{ language: string; voices: MacVoice[] }> {
  if (macCache && Date.now() - macCache.at < 60_000) return macCache;
  const r = await speechHelper<{ language: string; voices: MacVoice[] }>(["voices"]);
  macCache = { at: Date.now(), ...r };
  return r;
}

const QUALITY = { default: "basic", enhanced: "good", premium: "best" } as const;
const RANK = { best: 0, good: 1, basic: 2 } as const;
const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code.replace("_", "-")) ?? code;
  } catch {
    return code;
  }
};

function macInfo(v: MacVoice): VoiceInfo {
  // Eloquence voices (Eddy, Flo, Reed…) are the old synthesized kind; Apple's own read far better. Windows' are all
  // of that kind.
  const old = IS_WINDOWS || v.id.includes(".eloquence.") || v.id.includes(".speech.synthesis.");
  return {
    id: `${SYSTEM}:${v.id}`,
    provider: SYSTEM,
    name: v.personal ? `${v.name} (your Personal Voice)` : v.name,
    detail: [languageName(v.language), v.gender, old ? "robotic" : ""].filter(Boolean).join(" · "),
    language: v.language,
    quality: old ? "basic" : QUALITY[v.quality],
  };
}

// ---- ElevenLabs

async function elevenKey(): Promise<string> {
  if (!readSettings().services.elevenlabs) throw new Error("Add an ElevenLabs key in Settings → Media services first.");
  const key = await getSecret("elevenlabs");
  if (!key) throw new Error("The ElevenLabs key isn't in the Keychain any more. Add it again in Settings → Media services.");
  return key;
}

/** Calls ElevenLabs; errors come back as what ElevenLabs said, in a sentence. */
async function eleven(path: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const key = await elevenKey();
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    ...init,
    headers: { "xi-api-key": key, ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}), ...init.headers },
    signal: AbortSignal.timeout(init.timeout ?? 60_000),
  });
  if (res.ok) return res;
  const body = (await res.json().catch(() => ({}))) as { detail?: { message?: string; status?: string } | { msg?: string; loc?: unknown[] }[] | string };
  const d = body.detail;
  const said = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).filter(Boolean).join("; ") : d?.message;
  if (res.status === 401) throw new Error("ElevenLabs refused the key. Check it in Settings → Media services.");
  throw new Error(`ElevenLabs: ${said || `answered ${res.status}`}`);
}

type ElevenVoice = { voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string | null; preview_url?: string | null };
let elevenCache: { at: number; voices: ElevenVoice[] } | undefined;

async function elevenVoices(fresh = false): Promise<ElevenVoice[]> {
  if (!fresh && elevenCache && Date.now() - elevenCache.at < 5 * 60_000) return elevenCache.voices;
  const voices: ElevenVoice[] = [];
  let token: string | undefined;
  // A few pages is the whole of anyone's voices; the shared community library isn't included.
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ page_size: "100", sort: "name", sort_direction: "asc", ...(token ? { next_page_token: token } : {}) });
    const r = (await (await eleven(`/v2/voices?${q}`)).json()) as { voices: ElevenVoice[]; has_more?: boolean; next_page_token?: string | null };
    voices.push(...r.voices);
    if (!r.has_more || !r.next_page_token) break;
    token = r.next_page_token;
  }
  elevenCache = { at: Date.now(), voices };
  return voices;
}

function elevenInfo(v: ElevenVoice): VoiceInfo {
  const l = v.labels ?? {};
  const own = v.category === "cloned" || v.category === "professional" ? "cloned" : v.category === "generated" ? "designed" : undefined;
  const words = [l.accent, l.gender, l.age, l.descriptive ?? l.description, l.use_case ?? l.use_cases].filter((x) => x && typeof x === "string") as string[];
  return {
    id: `elevenlabs:${v.voice_id}`,
    provider: "elevenlabs",
    name: v.name.replace(/\s+-\s+.*$/, ""),
    detail: words.length ? words.map((w) => w.replace(/_/g, " ")).join(" · ") : (v.description ?? undefined)?.slice(0, 80),
    language: l.language,
    own,
    previewUrl: v.preview_url ?? undefined,
  };
}

const elevenModel = () => readSettings().voice?.model ?? DEFAULT_MODEL;

// ---- Listing and choosing

export async function listVoices(): Promise<VoicesInfo> {
  const settings = readSettings();
  const voices: VoiceInfo[] = [];
  const configured = !!settings.services.elevenlabs;
  let elevenError: string | undefined;
  if (configured) {
    try {
      voices.push(...(await elevenVoices()).map(elevenInfo).sort((a, b) => Number(!a.own) - Number(!b.own)));
    } catch (err) {
      elevenError = err instanceof Error ? err.message : String(err);
    }
  }
  if (kokoroReady()) voices.push(...KOKORO_VOICES.map((v) => ({ id: `kokoro:${v.id}`, provider: "kokoro" as const, name: v.name, detail: v.detail, language: v.id[0] === "b" ? "en-GB" : "en-US" })));
  let mac: VoicesInfo["mac"] = { ok: false };
  try {
    const m = await macVoices();
    // Best first; the old robotic voices last.
    const rank = (v: VoiceInfo) => RANK[v.quality!] * 2 + Number(!!v.detail?.endsWith("robotic"));
    voices.push(...m.voices.filter((v) => !v.novelty).map(macInfo).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)));
    mac = { ok: true, language: m.language };
  } catch (err) {
    mac = { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
  return {
    voices,
    default: settings.voice?.default,
    fallback: pickFrom(voices, settings.voice?.default, mac.language),
    model: elevenModel(),
    models: ELEVEN_MODELS,
    elevenlabs: { configured, error: elevenError },
    kokoro: kokoroStatus(),
    mac,
  };
}

/** The voice to use when none is named: the person's default if it's still there, else the best on hand. */
function pickFrom(voices: VoiceInfo[], preferred: string | undefined, language = "en-US"): string | undefined {
  if (preferred && (voices.some((v) => v.id === preferred) || !voiceProvider(preferred))) return preferred;
  const eleven = voices.filter((v) => v.provider === "elevenlabs");
  // ElevenLabs' own library voices are the safe pick; someone's clone is theirs to choose.
  const library = eleven.find((v) => !v.own && /^(George|Sarah|Rachel|Brian|Alice)$/.test(v.name)) ?? eleven.find((v) => !v.own);
  if (library) return library.id;
  if (voices.some((v) => v.id === "kokoro:af_heart")) return "kokoro:af_heart";
  const lang = language.split(/[-_]/)[0];
  const mac = voices.filter((v) => v.provider === SYSTEM && (v.language ?? "").startsWith(lang!));
  const best = mac.find((v) => v.language === language) ?? mac[0];
  return best?.id;
}

/** Narration's voice: `wanted` if given, else the default (or the best on hand). */
export async function resolveVoice(wanted?: string): Promise<string> {
  if (wanted) {
    const p = voiceProvider(wanted);
    if (!p) throw new Error(`"${wanted}" isn't a voice beatsheet can read with. Use one from list_voices (elevenlabs:…, kokoro:… or ${SYSTEM}:…).`);
    if ((p === "mac" || p === "windows") && p !== SYSTEM) throw new Error(`That's one of ${p === "mac" ? "the Mac's" : "Windows'"} own voices, which ${HERE} doesn't have. Pick another voice (list_voices).`);
    if (p === "kokoro" && !kokoroReady()) throw new Error("That's a Kokoro voice, and Kokoro isn't installed. Install it in Settings → Voices, or pick another voice.");
    if (p === "elevenlabs" && !readSettings().services.elevenlabs) throw new Error("That's an ElevenLabs voice, and there's no ElevenLabs key. Add one in Settings → Media services, or pick another voice.");
    return wanted;
  }
  const info = await listVoices();
  if (!info.fallback) throw new Error(`There's no voice to read with on ${HERE}. Add an ElevenLabs key or install Kokoro in Settings → Voices.`);
  return info.fallback;
}

export function setVoiceSettings(patch: { default?: string | null; model?: string }) {
  updateSettings((s) => {
    s.voice ??= {};
    if (patch.default !== undefined) s.voice.default = patch.default ?? undefined;
    if (patch.model) s.voice.model = patch.model;
  });
}

/** A voice's name for people ("Rachel · ElevenLabs"), from the lists when they're on hand. */
export async function voiceName(id: string): Promise<string> {
  const info = await listVoices().catch(() => undefined);
  const v = info?.voices.find((x) => x.id === id);
  const p = voiceProvider(id);
  return v ? `${v.name} (${p === "elevenlabs" ? "ElevenLabs" : p === "kokoro" ? "Kokoro" : p === "windows" ? "Windows" : "Mac"})` : id;
}

// ---- Speaking

export type Spoken = { file: string; duration: number; words: Word[] };

/**
 * Reads `text` in `voice` into `${out}.wav` (or `.mp3` from ElevenLabs), with every word's start and end in seconds.
 * Words keep their punctuation, as written.
 */
export async function speak(voice: string, text: string, out: string): Promise<Spoken> {
  const provider = voiceProvider(voice);
  const id = voice.slice(voice.indexOf(":") + 1);
  mkdirSync(join(out, ".."), { recursive: true });
  if (provider === "mac" || provider === "windows") {
    const file = `${out}.wav`;
    const textFile = join(tmpdir(), `beatsheet-say-${process.pid}-${Date.now().toString(36)}.txt`);
    writeFileSync(textFile, text);
    try {
      const r = await speechHelper<{ duration: number; words: Word[] }>(["speak", id, textFile, file]);
      return { file, duration: r.duration, words: tidy(r.words, r.duration) };
    } finally {
      rmSync(textFile, { force: true });
    }
  }
  if (provider === "kokoro") {
    const file = `${out}.wav`;
    const r = await kokoroSpeak(text, id, file);
    return { file, duration: r.duration, words: tidy(r.words, r.duration) };
  }
  if (provider === "elevenlabs") return elevenSpeak(id, text, out);
  throw new Error(`"${voice}" isn't a voice beatsheet can read with`);
}

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

async function elevenSpeak(voiceId: string, text: string, out: string): Promise<Spoken> {
  const file = `${out}.mp3`;
  const ask = (model: string) =>
    eleven(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      body: JSON.stringify({ text, model_id: model }),
      timeout: 120_000,
    });
  let res: Response;
  try {
    res = await ask(elevenModel());
  } catch (err) {
    // A model this voice or plan can't use: the steady one works everywhere.
    if (elevenModel() === "eleven_multilingual_v2" || !/model/i.test(String(err))) throw err;
    res = await ask("eleven_multilingual_v2");
  }
  const r = (await res.json()) as { audio_base64: string; alignment?: Alignment | null; normalized_alignment?: Alignment | null };
  writeFileSync(file, Buffer.from(r.audio_base64, "base64"));
  const duration = (await probe(file)).duration ?? r.alignment?.character_end_times_seconds.at(-1) ?? 0;
  const words = r.alignment ? wordsFromAlignment(r.alignment) : estimateWords(text, duration);
  return { file, duration, words: tidy(words.length ? words : estimateWords(text, duration), duration) };
}

/** ElevenLabs times every character; words are the runs between spaces, timed from their first letter to their last. */
export function wordsFromAlignment(a: Alignment): Word[] {
  const words: Word[] = [];
  let w = "", s = 0, e = 0, started = false;
  const flush = () => {
    if (w.trim() && started) words.push({ w: w.trim(), s, e });
    w = "";
    started = false;
  };
  a.characters.forEach((c, i) => {
    if (/\s/.test(c)) return flush();
    w += c;
    // Punctuation is written with the word but doesn't stretch its time (a full stop's time is mostly the pause).
    if (/[\p{L}\p{N}]/u.test(c)) {
      if (!started) s = a.character_start_times_seconds[i] ?? 0;
      started = true;
      e = a.character_end_times_seconds[i] ?? e;
    }
  });
  flush();
  return words;
}

/** Without timings, a fair guess: time shared out by letters, with a breath at punctuation. */
export function estimateWords(text: string, duration: number): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const weight = (p: string) => p.replace(/[^\p{L}\p{N}]/gu, "").length + 1 + (/[,;:]$/.test(p) ? 3 : /[.!?]$/.test(p) ? 5 : 0);
  const total = parts.reduce((n, p) => n + weight(p), 0) || 1;
  const from = Math.min(0.05, duration * 0.05), span = Math.max(0, duration - from - 0.1);
  let t = from;
  return parts.map((p) => {
    const len = (weight(p) / total) * span;
    const pause = /[,;:]$/.test(p) ? 3 : /[.!?]$/.test(p) ? 5 : 0;
    const word = { w: p, s: t, e: t + len * ((weight(p) - pause) / weight(p)) };
    t += len;
    return word;
  });
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
/** In order, inside the audio, never backwards, to the millisecond. */
function tidy(words: Word[], duration: number): Word[] {
  let last = 0;
  return words.map((w) => {
    const s = Math.min(Math.max(w.s, last), duration);
    const e = Math.min(Math.max(w.e, s), duration);
    last = s;
    return { w: w.w, s: r3(s), e: r3(e) };
  });
}

// ---- Samples to listen to

/** A short sample of a voice, made once and kept: ElevenLabs' own sample when it has one, else read here. */
export async function previewFile(voice: string): Promise<string> {
  const dir = join(VOICES_DIR, "previews");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, createHash("sha1").update(voice).digest("hex").slice(0, 16));
  const made = [".wav", ".mp3"].map((x) => base + x).find((f) => existsSync(f) && statSync(f).size > 0);
  if (made) return made;
  if (voiceProvider(voice) === "elevenlabs") {
    const v = (await elevenVoices()).find((x) => `elevenlabs:${x.voice_id}` === voice);
    if (v?.preview_url) {
      const res = await fetch(v.preview_url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        writeFileSync(`${base}.mp3`, Buffer.from(await res.arrayBuffer()));
        return `${base}.mp3`;
      }
    }
  }
  return (await speak(voice, SAMPLE, base)).file;
}

// ---- Making voices (ElevenLabs)

export type DesignPreview = { generatedId: string; audio: string; duration: number };

/** Three takes on a voice described in words; keep one with saveDesignedVoice. */
export async function designVoice(description: string, text?: string): Promise<{ previews: DesignPreview[]; text: string }> {
  const sample = text?.trim();
  const res = await eleven("/v1/text-to-voice/design?output_format=mp3_44100_128", {
    method: "POST",
    // The sample must be 100 to 1000 characters; anything shorter, ElevenLabs writes one to suit the voice.
    body: JSON.stringify({ voice_description: description.trim(), model_id: "eleven_ttv_v3", ...(sample && sample.length >= 100 ? { text: sample.slice(0, 1000) } : { auto_generate_text: true }) }),
    timeout: 180_000,
  });
  const r = (await res.json()) as { previews: { audio_base_64: string; generated_voice_id: string; media_type?: string; duration_secs?: number }[]; text: string };
  return {
    text: r.text,
    previews: r.previews.map((p) => ({ generatedId: p.generated_voice_id, audio: `data:${p.media_type ?? "audio/mpeg"};base64,${p.audio_base_64}`, duration: p.duration_secs ?? 0 })),
  };
}

export async function saveDesignedVoice(generatedId: string, name: string, description: string): Promise<VoiceInfo> {
  const res = await eleven("/v1/text-to-voice", { method: "POST", body: JSON.stringify({ voice_name: name.trim(), voice_description: description.trim(), generated_voice_id: generatedId }) });
  const v = (await res.json()) as ElevenVoice;
  elevenCache = undefined;
  return elevenInfo({ ...v, name: v.name ?? name, category: "generated" });
}

/** Recordings of the person's voice, kept only until they're cloned. */
const SAMPLES = join(VOICES_DIR, "samples");
const AUDIO_TYPES: Record<string, string> = { "audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "video/webm": ".webm", "video/mp4": ".m4a" };

export function saveSample(data: Buffer, type: string): { id: string; bytes: number } {
  mkdirSync(SAMPLES, { recursive: true });
  // Anything left from an earlier try that wasn't cloned goes after a day.
  for (const f of readdirSync(SAMPLES)) if (Date.now() - statSync(join(SAMPLES, f)).mtimeMs > 86_400_000) rmSync(join(SAMPLES, f), { force: true });
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  writeFileSync(join(SAMPLES, id + (AUDIO_TYPES[type.split(";")[0]!.trim()] ?? ".webm")), data);
  return { id, bytes: data.length };
}

const sampleFile = (id: string) => (/^s[a-z0-9]+$/.test(id) ? readdirSync(SAMPLES).find((f) => f.startsWith(`${id}.`)) : undefined);

/**
 * The person's own voice, cloned from recordings (Instant Voice Cloning: a minute or two of clear speech is plenty).
 * `samples` are recordings saved with saveSample, or audio files on this Mac. Recordings are deleted once it's made.
 */
export async function cloneVoice(name: string, opts: { samples?: string[]; files?: string[]; description?: string; removeNoise?: boolean }): Promise<VoiceInfo> {
  const form = new FormData();
  form.set("name", name.trim());
  if (opts.description?.trim()) form.set("description", opts.description.trim());
  if (opts.removeNoise) form.set("remove_background_noise", "true");
  const recorded = (opts.samples ?? []).map((id) => {
    const f = existsSync(SAMPLES) ? sampleFile(id) : undefined;
    if (!f) throw new Error("A recording for the clone has gone missing; record it again.");
    return join(SAMPLES, f);
  });
  const files = [...recorded, ...(opts.files ?? [])];
  if (!files.length) throw new Error("Record yourself or choose a recording first.");
  for (const f of files) {
    if (!existsSync(f)) throw new Error(`No file at ${f}`);
    form.append("files", new Blob([readFileSync(f)]), basename(f) || `sample${extname(f)}`);
  }
  let r: { voice_id: string; requires_verification?: boolean };
  try {
    r = (await (await eleven("/v1/voices/add", { method: "POST", body: form, timeout: 180_000 })).json()) as typeof r;
  } finally {
    // The person's recordings aren't kept, whether or not it worked (trying again sends them again).
    for (const f of recorded) rmSync(f, { force: true });
  }
  elevenCache = undefined;
  return { id: `elevenlabs:${r.voice_id}`, provider: "elevenlabs", name: name.trim(), own: "cloned", detail: r.requires_verification ? "Needs verifying on elevenlabs.io before it can be used" : "Your voice" };
}

/** Deletes one of the person's own ElevenLabs voices (never a library voice). */
export async function removeVoice(voice: string) {
  if (voiceProvider(voice) !== "elevenlabs") throw new Error("Only your own ElevenLabs voices can be removed here");
  const id = voice.slice("elevenlabs:".length);
  const v = (await elevenVoices()).find((x) => x.voice_id === id);
  if (!v || !elevenInfo(v).own) throw new Error("That isn't one of your own voices");
  await eleven(`/v1/voices/${encodeURIComponent(id)}`, { method: "DELETE" });
  elevenCache = undefined;
  if (readSettings().voice?.default === voice) setVoiceSettings({ default: null });
}
