/**
 * Describing a cast member from its pictures, for the words every prompt that names it carries: looks at its reference
 * photos (or sheet) and says what it looks like, as specifics an image model can draw.
 *
 * Uses any connected agent CLI (Antigravity, Claude Code, Codex, or Muse Code via fast multimodal `quickAsk`) first so
 * no extra API key is needed, falling back to a connected Gemini, OpenRouter, or OpenAI vision key when no agent CLI
 * is signed in or available.
 */
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import sharp from "sharp";
import type { Asset, CastMember, Project } from "@beatsheet/schema";
import { quickAsk, resolveFastAgents, type QuickAskImage } from "./agent/fast.ts";
import { pictureBytes } from "./media.ts";
import { assetPath, cachePaths } from "./paths.ts";
import { getSecret, readSettings } from "./settings.ts";
import { loadProject } from "./store.ts";

/** Google's alias for its current Flash first; a model this key can't use gets the next. */
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-3.8-flash"];
const OPENROUTER_MODELS = ["google/gemini-2.5-flash", "openai/gpt-4o-mini"];
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/jpeg",
  ".heif": "image/jpeg",
};

/** What to say about each kind of cast member: the specifics that keep it the same from shot to shot. */
const WHAT: Record<CastMember["kind"], string> = {
  character:
    "for a person: apparent age, build, hair, natural facial hair (beard, goatee, mustache, or stubble if visible), skin, face and anything distinctive (omit clothing); for an animal: species or breed, size, colors, markings and anything distinctive",
  wardrobe: "the garments, silhouette, fabric textures, colors, fastenings, footwear, headwear or mask, and any wear or damage",
  place: "the layout, the materials, the colors, the light and anything distinctive",
  prop: "its shape, size, materials, colors, wear and anything distinctive",
  style: "the medium, the rendering, the palette, the light and the texture",
};

const NON_HUMAN_WHAT = "species, type or creature design, size, silhouette, colors, markings, coat or materials, and anything distinctive";
const MASKED_WHAT = "mask or helmet shape and material, hood or headwear, robe or armor silhouette, fabric colors and textures, gloves, belt, footwear, and anything distinctive (never describe an unmasked human face)";

const SYSTEM =
  "You write terse, objective visual descriptions of reference photos for image generation prompts. " +
  "Output ONLY the comma-separated descriptive phrases on a single line — no preamble, no quotes, no markdown, no bullet points, no trailing period.";

/** Strips wrappers/punctuation an LLM occasionally adds around a single-line description. */
export function cleanDescription(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:\w+)?\s*|\s*```$/g, "")
    .replace(/^(?:description|appearance)\s*:\s*/i, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\.$/, "")
    .trim() ?? "";
}

/**
 * Picks up to 3 best pictures to describe a cast member from. For a human character, raw face reference photos come
 * first so the description captures their real face and natural facial hair rather than a costumed or drifted sheet.
 */
export function pickDescribePictures(project: Project, member: CastMember): Asset[] {
  const seenAssets = (member.seen ?? []).map((s) => s.asset);
  const rawIds =
    member.kind === "wardrobe"
      ? [member.outfitSheet, ...(member.wardrobe ?? []), ...(member.images ?? []), ...seenAssets]
      : member.kind === "character" && (member.nonHuman || member.masked)
        ? [...(member.faces ?? []), ...seenAssets, member.sheet, member.portrait, ...(member.images ?? [])]
        : member.kind === "character"
          ? [...(member.faces ?? []), ...seenAssets, member.faceSheet, member.portrait, member.sheet, ...(member.images ?? [])]
          : [...(member.images ?? []), ...seenAssets];
  const ids = [...new Set(rawIds.filter((x): x is string => !!x))];
  return ids
    .map((id) => project.assets.find((a) => a.id === id))
    .filter((a): a is Asset => a?.kind === "image" && !!TYPES[extname(a.path).toLowerCase()])
    .slice(0, 3);
}

/** Loads images for vision models; downscales large real photos to ≤1024px JPEG when `compact` is true. */
async function loadPictures(project: Project, dir: string, pictures: Asset[], compact: boolean): Promise<QuickAskImage[]> {
  return Promise.all(
    pictures.map(async (a) => {
      const orig = assetPath(project, dir, a);
      const ext = extname(a.path).toLowerCase();
      const fallbackMime = TYPES[ext] ?? "image/jpeg";
      if (!compact && ext !== ".heic" && ext !== ".heif") {
        return { data: readFileSync(orig), mimeType: fallbackMime };
      }
      const cached = cachePaths(dir, a.id).image;
      const src = existsSync(cached) ? cached : orig;
      try {
        const bytes = await pictureBytes(src);
        const jpeg = await sharp(bytes).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
        return { data: jpeg, mimeType: "image/jpeg" };
      } catch {
        return { data: readFileSync(orig), mimeType: fallbackMime };
      }
    }),
  );
}

async function describeWithGemini(key: string, prompt: string, images: QuickAskImage[]): Promise<string> {
  const base = process.env.BEATSHEET_GEMINI ?? "https://generativelanguage.googleapis.com/v1beta";
  const parts = [{ text: prompt }, ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data.toString("base64") } }))];
  let problem = "";
  // Each model, and a second try of the first when a reply stops on its length limit partway through a phrase.
  for (const model of [GEMINI_MODELS[0]!, ...GEMINI_MODELS]) {
    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      // Room for the model's thinking as well as the short answer: thinking counts against the same allowance, and
      // newer models can't turn it off.
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; error?: { message?: string } };
    if (res.ok) {
      const answer = body.candidates?.[0];
      const text = answer?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      const cleaned = text ? cleanDescription(text) : "";
      if (cleaned && answer?.finishReason !== "MAX_TOKENS") return cleaned;
      problem = text ? "Gemini stopped partway through" : "Gemini answered without a description";
      continue;
    }
    problem = body.error?.message ?? `Gemini answered ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new Error(`Gemini refused the key: ${problem}`);
    // Only a model this key can't reach is worth another try.
    if (res.status !== 404) break;
  }
  throw new Error(`Gemini couldn't describe it: ${problem}`);
}

async function describeWithChatCompletions(
  endpoint: string,
  key: string,
  models: string[],
  label: string,
  prompt: string,
  images: QuickAskImage[],
): Promise<string> {
  const content = [
    { type: "text", text: prompt },
    ...images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data.toString("base64")}` } })),
  ];
  let problem = "";
  for (const model of models) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
      error?: { message?: string };
    };
    if (res.ok) {
      const raw = body.choices?.[0]?.message?.content;
      const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((c) => c.text ?? "").join("") : "";
      const cleaned = cleanDescription(text);
      if (cleaned) return cleaned;
      problem = `${label} answered without a description`;
      continue;
    }
    problem = body.error?.message ?? `${label} answered ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new Error(`${label} refused the key: ${problem}`);
    if (res.status !== 404) break;
  }
  throw new Error(`${label} couldn't describe it: ${problem}`);
}

/** A description of a cast member written from its pictures: 10 to 25 words of what it looks like. */
export async function describeCast(projectId: string, castId: string): Promise<string> {
  const { project, dir } = loadProject(projectId);
  const member = project.cast?.find((m) => m.id === castId);
  if (!member) throw new Error(`No cast member "${castId}"`);
  const pictures = pickDescribePictures(project, member);
  if (!pictures.length) throw new Error(`${member.name || "It"} has no pictures to describe yet: make a sheet, or add a photo of it`);

  const what =
    member.kind === "character" && member.masked
      ? MASKED_WHAT
      : member.kind === "character" && member.nonHuman
        ? NON_HUMAN_WHAT
        : WHAT[member.kind];
  const prompt =
    `These pictures show one ${member.kind}${member.name ? ` called ${member.name}` : ""}. Describe what it looks like in 10 to 25 words, ` +
    `as specifics an image model can draw: ${what}. Comma-separated phrases, no names, no story, nothing about the background of the pictures.`;

  const settings = readSettings();

  // Explicit Gemini override (e.g. unit tests with a local stand-in server) goes straight to Gemini.
  if (process.env.BEATSHEET_GEMINI) {
    const key = settings.services.gemini ? await getSecret("gemini") : undefined;
    if (!key) throw new Error("The Gemini key isn't in the Keychain any more. Add it again in Settings → Media services.");
    const raw = await loadPictures(project, dir, pictures, false);
    return describeWithGemini(key, prompt, raw);
  }

  const errors: string[] = [];
  let compact: QuickAskImage[] | undefined;
  const getCompact = async () => (compact ??= await loadPictures(project, dir, pictures, true));

  // 1. Try any connected / installed agent CLI (Antigravity, Claude Code, Codex, Muse Code) — no extra API key needed.
  const agents = await resolveFastAgents().catch(() => []);
  for (const agent of agents) {
    try {
      const res = await quickAsk({ system: SYSTEM, prompt, images: await getCompact(), agent, timeoutMs: 60_000 });
      const cleaned = cleanDescription(res.text);
      if (cleaned) return cleaned;
      errors.push(`${agent.agent} answered without a description`);
    } catch (err) {
      errors.push(`${agent.agent}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Fallback to any connected vision-capable API key (Gemini, OpenRouter, OpenAI).
  if (settings.services.gemini) {
    const key = await getSecret("gemini");
    if (key) {
      try {
        return await describeWithGemini(key, prompt, await loadPictures(project, dir, pictures, false));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  if (settings.services.openrouter) {
    const key = await getSecret("openrouter");
    if (key) {
      try {
        const base = process.env.BEATSHEET_OPENROUTER ?? "https://openrouter.ai/api/v1";
        return await describeWithChatCompletions(`${base}/chat/completions`, key, OPENROUTER_MODELS, "OpenRouter", prompt, await getCompact());
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }
  if (settings.services.openai) {
    const key = await getSecret("openai");
    if (key) {
      try {
        const base = process.env.BEATSHEET_OPENAI ?? "https://api.openai.com/v1";
        return await describeWithChatCompletions(`${base}/chat/completions`, key, ["gpt-4o-mini"], "OpenAI", prompt, await getCompact());
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  if (errors.length) throw new Error(`Couldn't describe it (${errors[0]})`);
  throw new Error("Describing needs a signed-in agent (Claude Code, Codex, Antigravity, or Muse Code) or a Gemini, OpenRouter, or OpenAI key in Settings.");
}
