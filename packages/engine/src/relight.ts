/**
 * Light Sphere Relighting (`edit-video` / Relight): gives existing footage a new lighting setup using a lit reference
 * sphere, first-frame lighting prompt adaptation, and beatsheet's Seedance 2.5 reference-video pipeline.
 *
 * Built-in presets render their 3D calibration sphere locally with sharp in ~30ms for $0; any reference film still can
 * also be turned into a custom lighting sphere via `extractLightSphere`. Results land as a clip `version` (`version:
 * { of, from }`) with the clip's own (or cleaned) sound muxed back in, keeping original timing, transcript and subjects.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import {
  aspectOf,
  RELIGHT_BY_ID,
  relightPromptFor,
  type Asset,
  type RelightLight,
  type RelightPreset,
} from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { makeChoices, startMake, type MakeAsk, type MakeJob } from "./make.ts";
import { assetPath, projectDir } from "./paths.ts";
import { getSecret, readSettings } from "./settings.ts";
import { loadProject, updateFile } from "./store.ts";

const exec = promisify(execFile);
const GEMINI = process.env.BEATSHEET_GEMINI ?? "https://generativelanguage.googleapis.com/v1beta";
const VISION_MODELS = ["gemini-flash-latest", "gemini-3.8-flash"];

const norm = ([x, y, z]: [number, number, number]): [number, number, number] => {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
};

const clamp255 = (x: number) => Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, Math.min(1, x)), 1 / 2.2) * 255)));

/**
 * Physically shades a 3D matte-satin lighting calibration sphere for `preset` and writes a crisp PNG to `outPath`.
 * Zero external API calls, deterministic, and fast (~30ms at 512×512).
 */
export async function renderLightSpherePng(preset: RelightPreset, outPath: string, size = 512): Promise<string> {
  const { bg, ambient, key, fill, rim, specular = 0.25 } = preset.sphere;
  const lights: { dir: [number, number, number]; color: [number, number, number]; intensity: number; softness: number; isRim: boolean }[] = [
    { dir: norm(key.dir), color: key.color, intensity: key.intensity, softness: key.softness ?? 0.25, isRim: false },
    ...(fill ? [{ dir: norm(fill.dir), color: fill.color, intensity: fill.intensity, softness: fill.softness ?? 0.55, isRim: false }] : []),
    ...(rim ? [{ dir: norm(rim.dir), color: rim.color, intensity: rim.intensity, softness: rim.softness ?? 0.2, isRim: true }] : []),
  ];

  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size * 0.48;
  const rad = size * 0.34;
  // Base neutral grey matte-satin albedo (18% middle-grey lifted slightly so colors read accurately).
  const albedo = 0.58;
  const specPow = 28;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = (x + 0.5 - cx) / rad;
      const dy = (cy - (y + 0.5)) / rad; // +Y up
      const r2 = dx * dx + dy * dy;

      if (r2 <= 1) {
        const nz = Math.sqrt(Math.max(0, 1 - r2));
        const nx = dx;
        const ny = dy;
        let r = ambient[0] * albedo;
        let g = ambient[1] * albedo;
        let b = ambient[2] * albedo;

        for (const l of lights) {
          const ndotl = nx * l.dir[0] + ny * l.dir[1] + nz * l.dir[2];
          // Wrapped Lambertian diffuse for softbox softness.
          const wrap = l.softness;
          const diff = Math.max(0, (ndotl + wrap) / (1 + wrap));
          const fresnel = l.isRim ? Math.pow(1 - nz, 2.2) : 1;
          const contrib = diff * l.intensity * (l.isRim ? 0.35 + 1.35 * fresnel : 1);
          r += l.color[0] * albedo * contrib;
          g += l.color[1] * albedo * contrib;
          b += l.color[2] * albedo * contrib;

          // Blinn-Phong specular highlight (view vector = [0, 0, 1]).
          if (ndotl > 0 && specular > 0) {
            const [hx, hy, hz] = norm([l.dir[0], l.dir[1], l.dir[2] + 1]);
            const ndoth = Math.max(0, nx * hx + ny * hy + nz * hz);
            const sp = Math.pow(ndoth, specPow) * specular * l.intensity;
            r += l.color[0] * sp;
            g += l.color[1] * sp;
            b += l.color[2] * sp;
          }
        }
        // Subtle anti-aliasing at the sphere silhouette edge.
        const edge = Math.min(1, (1 - Math.sqrt(r2)) * rad * 0.7);
        const bgVig = 0.65 + 0.35 * Math.max(0, 1 - Math.hypot((x - cx) / size, (y - cy) / size) * 1.35);
        const br = bg[0] * bgVig;
        const bgc = bg[1] * bgVig;
        const bb = bg[2] * bgVig;
        buf[idx] = clamp255(br + (r - br) * edge);
        buf[idx + 1] = clamp255(bgc + (g - bgc) * edge);
        buf[idx + 2] = clamp255(bb + (b - bb) * edge);
        buf[idx + 3] = 255;
      } else {
        // Studio backdrop with subtle radial gradient and soft floor drop shadow beneath the sphere.
        const dist = Math.hypot((x - cx) / size, (y - cy) / size);
        let vig = 0.65 + 0.35 * Math.max(0, 1 - dist * 1.35);
        const sx = (x - cx) / (rad * 0.95);
        const sy = (y - (cy + rad * 1.08)) / (rad * 0.16);
        const sh = sx * sx + sy * sy;
        if (sh < 1.5) vig *= 0.42 + 0.58 * Math.min(1, sh / 1.5);
        buf[idx] = clamp255(bg[0] * vig);
        buf[idx + 1] = clamp255(bg[1] * vig);
        buf[idx + 2] = clamp255(bg[2] * vig);
        buf[idx + 3] = 255;
      }
    }
  }

  mkdirSync(join(outPath, ".."), { recursive: true });
  await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png().toFile(outPath);
  return outPath;
}

/** Ensures a built-in lighting preset's calibration sphere exists as an asset in the project (reusing it if present). */
export async function ensurePresetSphere(projectId: string, presetId: string): Promise<Asset> {
  const preset = RELIGHT_BY_ID.get(presetId);
  if (!preset) throw new Error(`No relight preset "${presetId}". Pick one of: ${[...RELIGHT_BY_ID.keys()].join(", ")}`);
  const { project } = loadProject(projectId);
  const id = `sphere-${preset.id}`;
  const existing = project.assets.find((a) => a.id === id);
  if (existing && existsSync(assetPath(project, projectDir(projectId), existing))) return existing;
  const folder = join(projectDir(projectId), "made", "spheres");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${id}.png`);
  await renderLightSpherePng(preset, file);
  return addAsset(projectId, file, {
    id,
    label: `Light sphere · ${preset.label}`,
    tags: ["light-sphere", preset.category, preset.id],
    provenance: { source: "synth", op: "light-sphere", params: { preset: preset.id }, createdAt: new Date().toISOString() },
  });
}

/**
 * Generates a custom lit calibration sphere from a reference photo or film still using beatsheet's image models.
 * Returns the started job(s) so the studio/agent can follow them with `jobs` and set `/look/lightSphere` once done.
 */
export function extractLightSphere(
  projectId: string,
  opts: {
    asset: string;
    prompt?: string;
    model?: string;
    via?: string;
    count?: number;
    spendable?: number;
  },
) {
  const { project } = loadProject(projectId);
  const ref = project.assets.find((a) => a.id === opts.asset);
  if (!ref) throw new Error(`No asset "${opts.asset}"`);
  if (ref.kind !== "image") throw new Error(`"${opts.asset}" is a ${ref.kind}; extract a light sphere from a reference photo or still`);
  const prompt =
    `A smooth matte-grey 3D calibration sphere centered on a neutral studio backdrop, reproducing the exact lighting setup, key/fill/rim light directions, shadow hardness, and color temperature of the reference picture.${opts.prompt ? ` ${opts.prompt.trim()}` : ""} Show only the lit sphere on the plain backdrop; nothing else from the scene, no people, no text.`;
  return startMake(
    projectId,
    {
      op: "image",
      prompt,
      refs: [opts.asset],
      aspect: "1:1",
      count: opts.count ?? 1,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.via ? { via: opts.via } : {}),
    },
    { spendable: opts.spendable },
  );
}

/**
 * Reads the clip's first frame and adapts the lighting prompt to its actual subjects, surfaces and setting using Gemini
 * Flash when a Gemini key is connected; otherwise returns the crisp deterministic prompt without failing.
 */
export async function adaptRelightPrompt(
  projectId: string,
  assetId: string,
  from: number,
  preset: RelightPreset | undefined,
  extraPrompt?: string,
): Promise<{ prompt: string; adapted: boolean }> {
  const fallback = relightPromptFor(preset, extraPrompt);
  if (!readSettings().services.gemini) return { prompt: fallback, adapted: false };
  const key = await getSecret("gemini");
  if (!key) return { prompt: fallback, adapted: false };
  const { project, dir } = loadProject(projectId);
  const clip = project.assets.find((a) => a.id === assetId);
  if (!clip) return { prompt: fallback, adapted: false };
  const src = assetPath(project, dir, clip);
  if (!existsSync(src)) return { prompt: fallback, adapted: false };

  const work = join(tmpdir(), `beatsheet-relight-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });
  try {
    const frame = join(work, "first.jpg");
    await exec("ffmpeg", ["-v", "error", "-y", "-ss", Math.max(0, from).toFixed(3), "-i", src, "-frames:v", "1", "-vf", "scale='min(768,iw)':-2", "-q:v", "3", frame]);
    if (!existsSync(frame)) return { prompt: fallback, adapted: false };
    const goal = [preset?.label && `Preset "${preset.label}": ${preset.prompt}`, extraPrompt?.trim()].filter(Boolean).join(" ");
    const ask =
      `This is the first frame of a video clip to relight. Target lighting: ${goal}. ` +
      `Write one concise 30 to 55 word relighting prompt tailored to the exact subjects, clothing, faces and background visible in this frame. ` +
      `Describe how the new key light, fill, rim and shadows fall across those specific elements. Never change camera motion, framing, objects or outfits.`;
    const parts = [{ text: ask }, { inline_data: { mime_type: "image/jpeg", data: readFileSync(frame).toString("base64") } }];
    for (const model of VISION_MODELS) {
      const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.25, maxOutputTokens: 1024 } }),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => undefined);
      if (!res?.ok) continue;
      const body = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      if (text) return { prompt: relightPromptFor(preset, extraPrompt, text.replace(/^["']|["']$/g, "")), adapted: true };
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return { prompt: fallback, adapted: false };
}

export type RelightOpts = {
  cut?: string;
  from?: number;
  to?: number;
  /** Built-in preset id from RELIGHT_PRESETS (e.g. "blue-amber", "chiaroscuro", "day-for-night"). */
  preset?: string;
  /** Existing lighting sphere asset id (overrides preset; falls back to /look/lightSphere or /look/lightPreset). */
  sphere?: string;
  /** Optional custom lighting instructions on top of (or instead of) a preset. */
  prompt?: string;
  quality?: "rough" | "final";
  model?: string;
  via?: string;
  /** Show the relit version in matching clip shots of the cut once finished. */
  use?: boolean;
  /** Also save this lighting preset/sphere as the project's /look default. */
  saveToLook?: boolean;
  /** Skip Gemini first-frame adaptation (tests or fast offline planning). */
  adapt?: boolean;
  spendable?: number;
};

/** Resolves the stretch, preset, sphere id and model choices for relighting a clip without starting a job. */
export function relightPlan(projectId: string, assetId: string, opts: RelightOpts = {}) {
  const { project } = loadProject(projectId, opts.cut);
  const clip = project.assets.find((a) => a.id === assetId);
  if (!clip) throw new Error(`No asset "${assetId}"`);
  if (clip.kind !== "video" || !clip.duration) throw new Error(`"${assetId}" isn't a clip with a known length`);
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(clip.duration, opts.to ?? Math.min(clip.duration, from + 10));
  if (!(to - from >= 0.5)) throw new Error(`Nothing to relight between ${from}s and ${to}s`);
  const presetId = opts.preset ?? (!opts.sphere && !project.look?.lightSphere ? project.look?.lightPreset : undefined);
  const preset = presetId ? RELIGHT_BY_ID.get(presetId) : undefined;
  if (presetId && !preset) throw new Error(`No relight preset "${presetId}"`);
  const sphereId = opts.sphere ?? (!opts.preset ? project.look?.lightSphere : undefined);
  if (sphereId && !project.assets.some((a) => a.id === sphereId && a.kind === "image")) throw new Error(`Lighting sphere "${sphereId}" isn't an image asset in this project`);
  if (!preset && !sphereId && !opts.prompt?.trim()) throw new Error("Pick a lighting preset, a lighting sphere asset, or describe the lighting setup");

  const prompt = relightPromptFor(preset, opts.prompt);
  const aspect = clip.width && clip.height ? aspectOf(clip.width, clip.height) : undefined;
  const ask: MakeAsk = {
    op: "video",
    cut: opts.cut,
    prompt,
    quality: opts.quality ?? "rough",
    camera: { asset: assetId, from, to },
    cameraKind: "relight",
    ...(sphereId ? { refs: [sphereId] } : {}),
    ...(aspect ? { aspect } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.via ? { via: opts.via } : {}),
    count: 1,
  };
  const { choices } = makeChoices(projectId, ask);
  return { clip, from, to, seconds: Math.round((to - from) * 1000) / 1000, preset, sphereId, prompt, aspect, choices };
}

/**
 * Relights a stretch of a clip using a lit calibration sphere + first-frame-adapted prompt through Seedance 2.5's
 * reference-video route. Saves the result as a `version` of the clip with the clip's own (or cleaned) sound muxed back.
 */
export async function relightClip(
  projectId: string,
  assetId: string,
  opts: RelightOpts = {},
): Promise<{ jobs: MakeJob[]; fit: ReturnType<typeof startMake>["fit"]; sphere?: string; prompt: string; adapted: boolean; from: number; to: number }> {
  const plan = relightPlan(projectId, assetId, opts);
  let sphereId = plan.sphereId;
  if (!sphereId && plan.preset) {
    const made = await ensurePresetSphere(projectId, plan.preset.id);
    sphereId = made.id;
  }
  if (opts.saveToLook && (sphereId || plan.preset)) {
    updateFile(projectId, (d) => {
      const look = (d.look ??= {});
      if (sphereId) look.lightSphere = sphereId;
      if (plan.preset) look.lightPreset = plan.preset.id;
    });
  }
  const { prompt, adapted } = opts.adapt === false ? { prompt: plan.prompt, adapted: false } : await adaptRelightPrompt(projectId, assetId, plan.from, plan.preset, opts.prompt);
  const label = `${plan.clip.label ?? plan.clip.id} · relit (${plan.preset?.label ?? "custom"})`;
  const { fit, jobs } = startMake(
    projectId,
    {
      op: "video",
      cut: opts.cut,
      prompt,
      quality: opts.quality ?? "rough",
      camera: { asset: assetId, from: plan.from, to: plan.to },
      cameraKind: "relight",
      ...(sphereId ? { refs: [sphereId] } : {}),
      ...(plan.aspect ? { aspect: plan.aspect } : {}),
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.via ? { via: opts.via } : {}),
      count: 1,
      versionOf: {
        asset: assetId,
        from: plan.from,
        to: plan.to,
        use: opts.use,
        keepAudio: true,
        tag: "relight",
        label,
        op: "relight",
        params: { ...(plan.preset ? { preset: plan.preset.id } : {}), ...(sphereId ? { sphere: sphereId } : {}), from: plan.from, to: plan.to },
      },
    },
    { spendable: opts.spendable },
  );
  return { jobs, fit, sphere: sphereId, prompt, adapted, from: plan.from, to: plan.to };
}
