/**
 * Making media with the person's services, inside the engine: keys stay in the Keychain and never pass through the
 * agent. Music comes from ElevenLabs for now; a made song is analysed for its beats like any other.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify, type Asset } from "@beatsheet/schema";
import { addSong } from "./ingest.ts";
import { projectDir } from "./paths.ts";
import { getSecret, readSettings } from "./settings.ts";

export type MusicRequest = {
  /** Genre, mood, instruments, tempo, structure: "punchy synth-pop, 124 BPM, big drop at 8s, bright and upbeat". */
  prompt: string;
  /** Length in seconds (3 to 600). Default: the model's choice. */
  seconds?: number;
  /** No vocals (the default: a montage's song shouldn't fight a voiceover or captions). */
  instrumental?: boolean;
  /** The cut whose music it becomes (default the first), unless `use` is false. */
  cut?: string;
  use?: boolean;
  label?: string;
};

/** The newest model first; an account or plan that can't use it gets the next. */
const MODELS = ["music_v2_5", "music_v1"];

/** Makes a song with ElevenLabs, saves it in the project's music folder, finds its beats and (unless told not to) makes it the cut's music. */
export async function generateMusic(projectId: string, req: MusicRequest, log: (msg: string) => void = () => {}): Promise<Asset> {
  if (!readSettings().services.elevenlabs) throw new Error("Making music needs an ElevenLabs key. The person can add one in Settings → Media services.");
  const key = await getSecret("elevenlabs");
  if (!key) throw new Error("The ElevenLabs key isn't in the Keychain any more. The person can add it again in Settings → Media services.");
  const prompt = req.prompt.trim();
  if (!prompt) throw new Error("Describe the song: genre, mood, tempo, instruments");
  const seconds = req.seconds === undefined ? undefined : Math.round(Math.min(600, Math.max(3, req.seconds)));

  let audio: Buffer | undefined, model = "", problem = "";
  for (const m of MODELS) {
    log(`Making ${seconds ? `${seconds}s of ` : "a song: "}${prompt} (${m})`);
    const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ prompt, model_id: m, force_instrumental: req.instrumental !== false, ...(seconds ? { music_length_ms: seconds * 1000 } : {}) }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (res.ok) {
      audio = Buffer.from(await res.arrayBuffer());
      model = m;
      break;
    }
    const body = (await res.json().catch(() => ({}))) as { detail?: { message?: string } | { msg?: string }[] | string };
    const d = body.detail;
    problem = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join("; ") : (d?.message ?? `ElevenLabs answered ${res.status}`);
    if (res.status === 401) throw new Error("ElevenLabs refused the key. The person can check it in Settings → Media services.");
    // Only a model this account can't use is worth another try; anything else (credits, the prompt) won't change.
    if (!/model/i.test(problem)) break;
  }
  if (!audio) throw new Error(`ElevenLabs couldn't make the song: ${problem}`);

  const dir = join(projectDir(projectId), "music");
  mkdirSync(dir, { recursive: true });
  const base = slugify(req.label ?? prompt.split(/[,.;]/)[0]!).slice(0, 40) || "song";
  let file = join(dir, `${base}.mp3`);
  for (let n = 2; existsSync(file); n++) file = join(dir, `${base}-${n}.mp3`);
  writeFileSync(file, audio);
  log("Finding its beats and sections");
  return addSong(projectId, file, log, req.cut, {
    use: req.use,
    label: req.label?.trim() || prompt.split(/[,.;]/)[0]!.trim().replace(/^\w/, (c) => c.toUpperCase()).slice(0, 60),
    provenance: { source: "generated", provider: "elevenlabs", model, prompt, createdAt: new Date().toISOString() },
  });
}
