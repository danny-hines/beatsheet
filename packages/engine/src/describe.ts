/**
 * Describing a cast member from its pictures, for the words every prompt that names it carries: a vision model looks
 * at its sheet (or the photos it's seen in) and says what it looks like, as specifics an image model can draw. Gemini,
 * with the person's key, read inside the engine.
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import type { CastMember } from "@beatsheet/schema";
import { assetPath } from "./paths.ts";
import { getSecret, readSettings } from "./settings.ts";
import { loadProject } from "./store.ts";

const GEMINI = process.env.BEATSHEET_GEMINI ?? "https://generativelanguage.googleapis.com/v1beta";
/** Google's alias for its current Flash first; a model this key can't use gets the next. */
const MODELS = ["gemini-flash-latest", "gemini-3.8-flash"];
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

/** What to say about each kind of cast member: the specifics that keep it the same from shot to shot. */
const WHAT: Record<CastMember["kind"], string> = {
  character: "for a person: apparent age, build, hair, skin, face, clothes and anything distinctive; for an animal: species or breed, size, colors, markings and anything distinctive",
  place: "the layout, the materials, the colors, the light and anything distinctive",
  prop: "its shape, size, materials, colors, wear and anything distinctive",
  style: "the medium, the rendering, the palette, the light and the texture",
};

/** A description of a cast member written from its pictures: 10 to 25 words of what it looks like. */
export async function describeCast(projectId: string, castId: string): Promise<string> {
  const { project, dir } = loadProject(projectId);
  const member = project.cast?.find((m) => m.id === castId);
  if (!member) throw new Error(`No cast member "${castId}"`);
  const ids = member.images?.length ? member.images : (member.seen ?? []).map((s) => s.asset);
  const pictures = ids
    .map((id) => project.assets.find((a) => a.id === id))
    .filter((a) => a?.kind === "image" && TYPES[extname(a.path).toLowerCase()])
    .slice(0, 3);
  if (!pictures.length) throw new Error(`${member.name || "It"} has no pictures to describe yet: make a sheet, or add a photo of it`);
  if (!readSettings().services.gemini) throw new Error("Describing needs a Gemini key. Add one in Settings → Media services.");
  const key = await getSecret("gemini");
  if (!key) throw new Error("The Gemini key isn't in the Keychain any more. Add it again in Settings → Media services.");

  const prompt =
    `These pictures show one ${member.kind}${member.name ? ` called ${member.name}` : ""}. Describe what it looks like in 10 to 25 words, ` +
    `as specifics an image model can draw: ${WHAT[member.kind]}. Comma-separated phrases, no names, no story, nothing about the background of the pictures.`;
  const parts = [{ text: prompt }, ...pictures.map((a) => ({ inline_data: { mime_type: TYPES[extname(a!.path).toLowerCase()]!, data: readFileSync(assetPath(project, dir, a!)).toString("base64") } }))];
  let problem = "";
  // Each model, and a second try of the first when a reply stops on its length limit partway through a phrase.
  for (const model of [MODELS[0]!, ...MODELS]) {
    const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
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
      if (text && answer?.finishReason !== "MAX_TOKENS") return text.replace(/^["']|["']$/g, "").replace(/\.$/, "").trim();
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
