/**
 * Sound effects: beatsheet's own kit (synthesized by py/make_sfx.py, in sfx/), which every cut can use by name, and new
 * ones made from a description with the person's ElevenLabs key ("a camera shutter, crisp", "crowd cheering").
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugify, type Asset } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { projectDir, REPO } from "./paths.ts";
import { getSecret, readSettings } from "./settings.ts";

export const SFX_DIR = join(REPO, "packages", "engine", "sfx");

/** Makes a sound effect with ElevenLabs and adds it to the project's assets (kind sfx), for sfx cues to use by id. */
export async function generateSfx(projectId: string, req: { prompt: string; seconds?: number; label?: string; loop?: boolean }): Promise<Asset> {
  if (!readSettings().services.elevenlabs) throw new Error("Making sound effects needs an ElevenLabs key; the person can add one in Settings → Media services. The built-in sounds work without one.");
  const key = await getSecret("elevenlabs");
  if (!key) throw new Error("The ElevenLabs key isn't in the Keychain any more. The person can add it again in Settings → Media services.");
  const seconds = req.seconds === undefined ? undefined : Math.min(30, Math.max(0.5, req.seconds));
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: req.prompt, ...(seconds ? { duration_seconds: seconds } : {}), ...(req.loop ? { loop: true } : {}), prompt_influence: 0.5 }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: { message?: string } | { msg?: string }[] | string };
    const d = body.detail;
    throw new Error(`ElevenLabs couldn't make the sound: ${typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join("; ") : (d?.message ?? res.status)}`);
  }
  const dir = join(projectDir(projectId), "sfx");
  mkdirSync(dir, { recursive: true });
  const base = slugify(req.label ?? req.prompt).slice(0, 36) || "sound";
  let file = join(dir, `${base}.mp3`);
  for (let n = 2; existsSync(file); n++) file = join(dir, `${base}-${n}.mp3`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return addAsset(projectId, file, {
    id: `sfx-${base}`,
    label: req.label ?? req.prompt.slice(0, 60),
    tags: ["sfx"],
    provenance: { source: "generated", provider: "elevenlabs", model: "eleven_text_to_sound_v2", prompt: req.prompt, createdAt: new Date().toISOString() },
  });
}
