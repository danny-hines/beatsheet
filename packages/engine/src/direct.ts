/**
 * Stills from services that answer in one request instead of a queue: GPT Image on OpenAI and Muse Image on Meta's
 * Model API. Both take OpenAI's Images API: a prompt to /images/generations, or a prompt and pictures to /images/edits,
 * and the picture comes back in the answer. There's no request to pick up again after a restart, so the caller saves
 * the picture the moment it arrives. The key is read inside the engine and never passes through the agent.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { FalError } from "./fal.ts";

const BASES: Record<string, string> = {
  openai: process.env.BEATSHEET_OPENAI ?? "https://api.openai.com/v1",
  meta: process.env.BEATSHEET_META ?? "https://api.meta.ai/v1",
};
const NAMES: Record<string, string> = { openai: "OpenAI", meta: "Meta" };
/** The routes this module runs. */
export const DIRECT = Object.keys(BASES);

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const typeOf = (file: string) => TYPES[extname(file).toLowerCase()] ?? "image/jpeg";

/**
 * A size in the aspect asked for, about 1.3 megapixels, in steps of 16: GPT Image makes any such size between 1:3 and
 * 3:1, and Muse Image reads only its shape.
 */
export function sizeFor(aspect = "1:1"): string {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  const ratio = w / h;
  const px = 1536 * 864;
  const step = (n: number) => Math.round(n / 16) * 16;
  return `${step(Math.sqrt(px * ratio))}x${step(Math.sqrt(px / ratio))}`;
}

// OpenAI bills GPT Image by the token, per million: text in, pictures in, the picture out.
const OPENAI_RATES = { text: 5, imageIn: 8, imageOut: 30 };
type Usage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };

/** What a still cost, from the service's own count when it gives one. */
function costOf(route: string, usage: Usage | undefined): number | undefined {
  if (route === "meta") return 0.01;
  if (!usage?.output_tokens) return undefined;
  const text = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0;
  const pictures = usage.input_tokens_details?.image_tokens ?? 0;
  const usd = (text * OPENAI_RATES.text + pictures * OPENAI_RATES.imageIn + usage.output_tokens * OPENAI_RATES.imageOut) / 1e6;
  return Math.round(usd * 10000) / 10000;
}

export type DirectAsk = { prompt: string; aspect?: string; refs?: string[] };
export type DirectOut = { bytes: Buffer; contentType: string; usd?: number };

/**
 * Makes one still on `route` with `model`: from the prompt alone, or from reference pictures (files) when there are
 * some. Takes as long as the service does (a minute or two for GPT Image).
 */
export async function directImage(route: string, model: string, key: string, ask: DirectAsk): Promise<DirectOut> {
  const base = BASES[route];
  if (!base) throw new FalError(`beatsheet can't run ${route} jobs`, true);
  const name = NAMES[route]!;
  const size = sizeFor(ask.aspect);
  // GPT Image takes options Muse Image refuses (it answers 400 to fields it doesn't know).
  const extra = route === "openai" ? { quality: "medium", output_compression: 92 } : { response_format: "b64_json" };
  const refs = ask.refs ?? [];
  let init: RequestInit;
  if (!refs.length) {
    init = { headers: { "content-type": "application/json" }, body: JSON.stringify({ model, prompt: ask.prompt, n: 1, size, output_format: "jpeg", ...extra }) };
  } else if (route === "openai") {
    // OpenAI's edits take the pictures as files in a form.
    const form = new FormData();
    for (const [k, v] of Object.entries({ model, prompt: ask.prompt, n: "1", size, output_format: "jpeg", quality: "medium", output_compression: "92" })) form.append(k, v);
    for (const file of refs) form.append("image[]", new Blob([readFileSync(file)], { type: typeOf(file) }), basename(file));
    init = { body: form };
  } else {
    // Meta's take them as data URLs in JSON.
    const images = refs.map((file) => ({ image_url: `data:${typeOf(file)};base64,${readFileSync(file).toString("base64")}` }));
    init = { headers: { "content-type": "application/json" }, body: JSON.stringify({ model, prompt: ask.prompt, images, n: 1, size, output_format: "jpeg", ...extra }) };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/images/${refs.length ? "edits" : "generations"}`, {
      ...init,
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, ...init.headers },
      signal: AbortSignal.timeout(5 * 60_000),
    });
  } catch (err) {
    throw new FalError(`Couldn't reach ${name} (${err instanceof Error ? err.message : String(err)})`, false);
  }
  const body = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string; url?: string }[]; usage?: Usage; error?: { message?: string; code?: string; type?: string } };
  if (!res.ok) {
    const said = body.error?.message ?? `${name} answered ${res.status}`;
    if (res.status === 401) throw new FalError(`${name} refused the key. The person can check it in Settings → Media services.`, true);
    if (res.status === 403) throw new FalError(`${name} won't let this key make images: ${said}`, true);
    // A rate limit or an outage passes; nothing was made, so nothing was charged.
    if (res.status === 429 || res.status >= 500) throw new FalError(`${name} couldn't make it right now: ${said}`, res.status === 500 && route === "meta");
    throw new FalError(said, true);
  }
  const out = body.data?.[0];
  const bytes = out?.b64_json ? Buffer.from(out.b64_json, "base64") : out?.url ? await download(out.url, name) : undefined;
  if (!bytes?.length) throw new FalError(`${name} finished but didn't send a picture`, true);
  return { bytes, contentType: "image/jpeg", usd: costOf(route, body.usage) };
}

async function download(url: string, name: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) }).catch(() => undefined);
  if (!res?.ok) throw new FalError(`Couldn't download the picture ${name} made`, true);
  return Buffer.from(await res.arrayBuffer());
}
