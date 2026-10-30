/**
 * Cleaning the voices in a clip's sound: tape hiss, wind and hum taken out, by DeepFilterNet on this computer or
 * ElevenLabs' Voice Isolator with the person's key, whichever suits the machine (fixerStates feeds the schema's
 * chooseFixer). Both take out everything that isn't a voice, the film's own music too, so by default only the
 * stretches where people talk are cleaned (from the clip's transcript) and the rest stays as it was. The cleaned
 * voices are kept at full strength (media/<id>.voices-<by>.wav); what clips play is mixed from them and the original
 * as asked (media/<id>.clean-*.m4a). The original file is never touched.
 */
import { execFile } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chooseFixer, cleanCurve, FIXERS, LIGHT_KEEP, speechSpans, type Asset, type FixAsk, type FixerChoice, type FixerJob, type FixerState } from "@beatsheet/schema";
import { runDeepFilter, toolReady, toolStatus, type ToolId } from "./fixtools.ts";
import { assertSpendable } from "./make.ts";
import { assetPath, cleanPath, originalPath, voicesPath } from "./paths.ts";
import { getSecret, readSettings } from "./settings.ts";
import { recordSpend } from "./spend.ts";
import { loadProject, updateFile } from "./store.ts";
import { readTranscript } from "./transcribe.ts";

const exec = promisify(execFile);
const ELEVENLABS = process.env.BEATSHEET_ELEVENLABS ?? "https://api.elevenlabs.io/v1";
const RATE = 48_000;

/** Whether each fixer can be used here now, and if not, what would let it. */
export async function fixerStates(): Promise<Record<string, FixerState>> {
  const saved = readSettings().services;
  const local = (id: ToolId): FixerState => {
    const s = toolStatus(id);
    if (s.state === "ready") return { state: "ready", speed: s.ready!.speed, where: `on ${s.ready!.where}` };
    if (s.state === "unsupported") return { state: "unfit", detail: s.detail };
    return { state: "install", detail: s.state === "installing" ? `Installing: ${s.detail}` : `Install it in Settings → Restoring (${s.detail.charAt(0).toLowerCase()}${s.detail.slice(1)})` };
  };
  return {
    deepfilter: local("deepfilter"),
    isolator: saved.elevenlabs ? { state: "ready" } : { state: "key", detail: "Needs an ElevenLabs key (Settings → Media services)" },
    realesrgan: local("realesrgan"),
    seedvr: saved.fal ? { state: "ready" } : { state: "key", detail: "Needs a fal key (Settings → Media services)" },
    rife: local("rife"),
  };
}

/** The fixers for one job on a clip, Auto first, in the person's order when they've set one. */
export async function fixChoices(does: FixerJob, ask: FixAsk) {
  return chooseFixer(does, await fixerStates(), ask, readSettings().restore?.ranking?.[does] ?? []);
}

/** The fixer asked for, else Auto's pick; or why nothing can do it. */
export async function pickFixer(does: FixerJob, ask: FixAsk, wanted?: string): Promise<FixerChoice> {
  const { auto, ready, setup } = await fixChoices(does, ask);
  const choice = wanted ? ready.find((c) => c.id === wanted) : auto;
  if (choice) return choice;
  const known = FIXERS.filter((f) => f.does === does);
  if (wanted && !known.some((f) => f.id === wanted)) throw new Error(`No "${wanted}"; there's ${known.map((f) => f.id).join(", ")}`);
  const why = setup.filter((c) => !wanted || c.id === wanted).map((c) => `${c.label}: ${c.why}`);
  throw new Error(`Nothing can do it here now. ${why.join(". ")}.`);
}

/** Seconds the sound starts after the picture (an MPEG file's streams can start apart); 0 for a sound file. */
async function soundLead(file: string): Promise<number> {
  try {
    const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,start_time", "-of", "json", file]);
    const s = (JSON.parse(stdout) as { streams?: { codec_type: string; start_time?: string }[] }).streams ?? [];
    const v = Number(s.find((x) => x.codec_type === "video")?.start_time);
    const a = Number(s.find((x) => x.codec_type === "audio")?.start_time);
    return Number.isFinite(v) && Number.isFinite(a) ? a - v : 0;
  } catch {
    return 0;
  }
}

/** A file's sound as 48 kHz mono WAV, in step with its picture: sound that starts late is padded, early is trimmed. */
export async function soundInStep(file: string, out: string): Promise<void> {
  const lead = await soundLead(file);
  const af = lead > 0.001 ? ["-af", `adelay=${Math.round(lead * 1000)}`] : lead < -0.001 ? ["-af", `atrim=start=${-lead},asetpts=PTS-STARTPTS`] : [];
  try {
    await exec("ffmpeg", ["-v", "error", "-y", "-i", file, "-vn", ...af, "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", out], { maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not contain any stream|matches no streams|Output file .* does not contain/i.test(msg)) throw new Error("It has no sound to clean");
    throw err;
  }
}

/** The Voice Isolator takes an hour at a time: a long clip goes in pieces of 50 minutes, put back together. */
const PIECE = 50 * 60;

async function isolate(wav: string, out: string, seconds: number, work: string): Promise<void> {
  const key = await getSecret("elevenlabs");
  if (!key) throw new Error("There's no ElevenLabs key (Settings → Media services)");
  const pieces = Math.max(1, Math.ceil(seconds / PIECE));
  const parts: string[] = [];
  for (let i = 0; i < pieces; i++) {
    const flac = join(work, `piece-${i}.flac`);
    await exec("ffmpeg", ["-v", "error", "-y", ...(pieces > 1 ? ["-ss", String(i * PIECE), "-t", String(PIECE)] : []), "-i", wav, "-c:a", "flac", flac]);
    const form = new FormData();
    form.append("audio", new Blob([readFileSync(flac)], { type: "audio/flac" }), "sound.flac");
    const res = await fetch(`${ELEVENLABS}/audio-isolation`, { method: "POST", headers: { "xi-api-key": key }, body: form, signal: AbortSignal.timeout(30 * 60_000) });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
      const detail = typeof body.detail === "string" ? body.detail : (body.detail as { message?: string } | undefined)?.message;
      if (res.status === 401) throw new Error("ElevenLabs refused the key. Check it in Settings → Media services.");
      throw new Error(`ElevenLabs couldn't clean it${detail ? `: ${detail}` : ` (it answered ${res.status})`}`);
    }
    const type = res.headers.get("content-type") ?? "";
    const got = join(work, `isolated-${i}.${/wav/.test(type) ? "wav" : /flac/.test(type) ? "flac" : "mp3"}`);
    writeFileSync(got, Buffer.from(await res.arrayBuffer()));
    const part = join(work, `isolated-${i}.wav`);
    await exec("ffmpeg", ["-v", "error", "-y", "-i", got, "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", part]);
    parts.push(part);
  }
  if (parts.length === 1) return void writeFileSync(out, readFileSync(parts[0]!));
  const list = join(work, "pieces.txt");
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "pcm_s16le", out]);
}

/**
 * Four seconds of a file's sound from `from`, as 16-bit mono samples at 48 kHz, with only what's above 1.5 kHz: the
 * edges of consonants line up sharply, where the low hum of music under a voice would blur where they match.
 */
async function samplesOf(file: string, from: number): Promise<Int16Array> {
  const { stdout } = await exec("ffmpeg", ["-v", "error", "-ss", String(from), "-t", "4", "-i", file, "-ac", "1", "-ar", String(RATE), "-af", "highpass=f=1500,highpass=f=1500", "-f", "s16le", "-"], {
    encoding: "buffer",
    maxBuffer: 1e8,
  });
  return new Int16Array(stdout.buffer, stdout.byteOffset, stdout.length >> 1);
}

/** Where two sounds match best, `a` against `b` moved by each lag in [from, to], every `step`th sample compared. */
function bestLag(a: Int16Array, b: Int16Array, from: number, to: number, step: number): number {
  let best = -Infinity, lag = 0;
  for (let k = from; k <= to; k++) {
    let s = 0;
    for (let i = Math.max(0, -k); i < a.length && i + k < b.length; i += step) s += a[i]! * b[i + k]!;
    if (s > best) [best, lag] = [s, k];
  }
  return lag;
}

/**
 * How many samples (at 48 kHz) the cleaned voices come after the sound as recorded (less than none: before): a service
 * can hand them back a few milliseconds off, and mixed with the original that sounds hollow. Measured where people
 * talk (`at`: a few times, seconds into it), within 50 ms either way, and the middle answer taken.
 */
export async function lagOf(orig: string, voices: string, at: number[] = [0]): Promise<number> {
  const lags: number[] = [];
  for (const t of at) lags.push(bestLag(await samplesOf(orig, t), await samplesOf(voices, t), -2400, 2400, 3));
  return lags.sort((x, y) => x - y)[Math.floor(lags.length / 2)]!;
}

/** A WAV's samples as 16-bit mono at 48 kHz, in a raw file. */
const toRaw = (wav: string, raw: string) => exec("ffmpeg", ["-v", "error", "-y", "-i", wav, "-f", "s16le", "-ac", "1", "-ar", String(RATE), raw]);

/**
 * The sound clips play: the original, with the cleaned voices in its place where `curve` says (100 times a second),
 * keeping `keep` of what was taken out. Read and written a few seconds at a time, so an hour of tape fits in memory.
 */
export function mixRaw(origRaw: string, voicesRaw: string, outRaw: string, curve: Float32Array, keep: number) {
  const block = RATE * 5;
  const [o, v, w] = [openSync(origRaw, "r"), openSync(voicesRaw, "r"), openSync(outRaw, "w")];
  try {
    const ob = Buffer.alloc(block * 2), vb = Buffer.alloc(block * 2);
    for (let at = 0; ; at += block) {
      const no = readSync(o, ob, 0, ob.length, at * 2) >> 1;
      if (!no) break;
      vb.fill(0);
      const nv = readSync(v, vb, 0, vb.length, at * 2) >> 1;
      const out = Buffer.alloc(no * 2);
      for (let i = 0; i < no; i++) {
        const t = ((at + i) / RATE) * 100;
        const k = Math.min(curve.length - 1, Math.floor(t));
        const g = curve[k]! + (curve[Math.min(curve.length - 1, k + 1)]! - curve[k]!) * (t - k);
        const a = ob.readInt16LE(i * 2), b = i < nv ? vb.readInt16LE(i * 2) : a;
        out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(a + g * (1 - keep) * (b - a)))), i * 2);
      }
      writeSync(w, out);
    }
  } finally {
    [o, v, w].forEach((fd) => closeSync(fd));
  }
}

const scratch = () => {
  const d = join(tmpdir(), `beatsheet-clean-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(d, { recursive: true });
  return d;
};

/**
 * Cleans the voices in a clip (or sound file) with the cleaner asked for, else Auto's pick here, and has its clips
 * play the cleaned sound. Only where people talk, when it has a transcript (unless `everywhere`); light (the default,
 * with DeepFilterNet) leaves a little of the room. Cleaning it again with the same cleaner only mixes again, unless
 * `again`.
 */
export async function cleanSound(
  projectId: string,
  assetId: string,
  opts: { with?: string; strength?: "light" | "full"; everywhere?: boolean; again?: boolean; spendable?: number; onProgress?: (f: number) => void } = {},
): Promise<{ asset: Asset; choice: FixerChoice; spans?: number; reused: boolean; costUsd?: number }> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind === "image") throw new Error(`"${assetId}" is a photo; there's no sound to clean`);
  const seconds = a.duration ?? 0;
  const choice = await pickFixer("clean", { seconds }, opts.with);
  const onProgress = opts.onProgress ?? (() => {});
  const src = originalPath(project, dir, a);
  if (!existsSync(src)) throw new Error(`Its file isn't there: ${src}`);
  const work = scratch();
  try {
    const orig = join(work, "orig.wav");
    await soundInStep(src, orig);
    onProgress(0.05);
    const voices = voicesPath(dir, a.id, choice.id);
    const reused = existsSync(voices) && !opts.again;
    let costUsd: number | undefined;
    if (!reused) {
      mkdirSync(join(dir, "media"), { recursive: true });
      if (choice.id === "deepfilter") {
        const ready = toolReady("deepfilter");
        if (!ready) throw new Error("DeepFilterNet isn't installed on this computer (Settings → Restoring)");
        // It says nothing as it goes; the bar moves by how long it took here on the check clip.
        const started = Date.now(), expect = Math.max(1, seconds * ready.speed);
        const tick = setInterval(() => onProgress(0.05 + 0.8 * Math.min(0.95, (Date.now() - started) / 1000 / expect)), 500);
        try {
          const out = await runDeepFilter(ready, orig, join(work, "clean"));
          await exec("ffmpeg", ["-v", "error", "-y", "-i", out, "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", voices]);
        } finally {
          clearInterval(tick);
        }
      } else {
        costUsd = choice.usd ?? 0;
        assertSpendable(costUsd, { spendable: opts.spendable });
        const back = join(work, "isolated.wav");
        await isolate(orig, back, seconds, work);
        recordSpend(projectId, { what: `Cleaned the voices in ${a.label ?? a.id}`, by: "elevenlabs:audio-isolation", usd: costUsd });
        // Put back in step with the picture, measured where it talks.
        const said = speechSpans(readTranscript(projectId, a.id)?.words ?? []);
        const talk: [number, number][] = said.length ? said : [[0, seconds]];
        const total = talk.reduce((n, [s, e]) => n + e - s, 0);
        const at = [0.2, 0.5, 0.8].map((f) => {
          let left = f * total;
          for (const [s, e] of talk) {
            if (left <= e - s) return Math.max(0, Math.min(s + left, seconds - 4));
            left -= e - s;
          }
          return 0;
        });
        const lag = await lagOf(orig, back, at);
        const shift = lag > 1 ? ["-af", `atrim=start_sample=${lag},asetpts=PTS-STARTPTS`] : lag < -1 ? ["-af", `adelay=${-lag}S`] : [];
        await exec("ffmpeg", ["-v", "error", "-y", "-i", back, ...shift, "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", voices]);
      }
    }
    onProgress(0.88);
    // Only where people talk, when there's a transcript to say where that is.
    const t = !opts.everywhere ? readTranscript(projectId, a.id) : undefined;
    const spans = t?.words.length ? speechSpans(t.words) : undefined;
    const [origRaw, voicesRaw, mixed] = [join(work, "orig.raw"), join(work, "voices.raw"), join(work, "mix.raw")];
    await toRaw(orig, origRaw);
    await toRaw(voices, voicesRaw);
    // The Voice Isolator makes the voices anew rather than filtering them, so they're never quite in phase with the
    // original: the two mixed sound hollow. It's used on its own where people talk.
    const strength = choice.id === "isolator" ? "full" : (opts.strength ?? "light");
    mixRaw(origRaw, voicesRaw, mixed, cleanCurve(spans, statSync(origRaw).size / 2 / RATE), strength === "light" ? LIGHT_KEEP : 0);
    const cleaned: NonNullable<Asset["cleaned"]> = { by: choice.id, strength, ...(spans ? { only: "speech" as const } : {}), at: new Date().toISOString(), ...(costUsd ? { costUsd } : {}) };
    const out = cleanPath(dir, { ...a, cleaned })!;
    await exec("ffmpeg", ["-v", "error", "-y", "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", mixed, "-c:a", "aac", "-b:a", "160k", out]);
    // The mix it replaces goes; the cleaned voices stay, for mixing again.
    for (const f of readdirSync(join(dir, "media"))) if (f.startsWith(`${a.id}.clean-`) && join(dir, "media", f) !== out) rmSync(join(dir, "media", f), { force: true });
    updateFile(projectId, (d) => {
      const x = d.assets.find((y) => y.id === a.id);
      if (x) x.cleaned = cleaned;
    });
    onProgress(1);
    return { asset: { ...a, cleaned }, choice, ...(spans ? { spans: spans.length } : {}), reused, ...(costUsd ? { costUsd } : {}) };
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** Back to the clip's own sound. The cleaned voices are kept, so cleaning it again is quick. */
export function uncleanSound(projectId: string, assetId: string) {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  const file = cleanPath(dir, a);
  if (file) rmSync(file, { force: true });
  updateFile(projectId, (d) => {
    const x = d.assets.find((y) => y.id === assetId);
    if (x) delete x.cleaned;
  });
}

/** The file a clip's sound comes from: its cleaned sound once there is one, else the file it plays. */
export function soundFile(project: Parameters<typeof assetPath>[0], dir: string, a: Asset): string {
  const clean = cleanPath(dir, a);
  return clean && existsSync(clean) ? clean : assetPath(project, dir, a);
}
