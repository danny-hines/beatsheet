/**
 * OpenRouter's media APIs (openrouter.ai/openapi.json, read 26 November 2026):
 * - Stills (`POST /api/v1/images`) answer in one synchronous request with base64 bytes (or a signed URL) and exact
 *   `usage.cost`. There's no remote job to resume after a restart, so the caller saves the picture the moment it arrives.
 * - Video (`POST /api/v1/videos`) starts an async job (`202 Accepted`), followed via `GET /api/v1/videos/{id}` until it
 *   finishes. Output comes back as a signed URL (`urls[0]`) or authenticated content endpoint (`/videos/{id}/content`),
 *   with exact `usage.cost` replacing the catalog's estimate.
 *
 * OpenRouter has no video/audio upload endpoint: local pictures go inline as base64 data URLs in `frame_images` or
 * `input_references`, while `video_url` and `audio_url` require public HTTPS URLs (staged temporarily via a connected
 * provider's CDN in `make.ts`). The key is read inside the engine and never passes through the agent.
 *
 * What to know about it:
 * - There is no `Idempotency-Key` on `POST /api/v1/videos`: a submit that timed out waiting for an answer isn't retried
 *   on a guess, since it may have started and been charged.
 * - There is no remote cancel endpoint on `/api/v1/videos/{id}`: cancelling stops tracking locally, and a running job
 *   may still finish on OpenRouter.
 * - Failed and expired video jobs release credit holds, except upstream moderation blocks that report billable usage;
 *   `usage.cost` says what was actually charged.
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { audioLine, cameraLine, FalError, whole, type FalAsk, type FalRequest } from "./fal.ts";
import type { DirectOut } from "./direct.ts";

const API = process.env.BEATSHEET_OPENROUTER ?? "https://openrouter.ai/api/v1";

type Body = Record<string, unknown>;

const APP_HEADERS = { "HTTP-Referer": "https://beatsheet.app", "X-OpenRouter-Title": "beatsheet" };

/** OpenRouter's words for a refused request, including the upstream provider's raw error when it adds detail. */
function said(body: Body, status: number): string {
  const err = body.error;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object") {
    const { message, metadata } = err as { message?: unknown; metadata?: { raw?: unknown; provider_name?: unknown } };
    const msg = typeof message === "string" ? message : "";
    const raw = typeof metadata?.raw === "string" && metadata.raw && !msg.includes(metadata.raw) ? metadata.raw : "";
    const combined = [msg, raw].filter(Boolean).join(": ");
    if (combined) return combined;
  }
  return `OpenRouter answered ${status}`;
}

/** A failure as the person should read it. Whether another try could go differently is the caller's to say. */
function problem(body: Body, status: number): FalError {
  const message = said(body, status);
  if (status === 401) return new FalError("OpenRouter refused the key. The person can check it in Settings → Media services.", true);
  if (status === 402) return new FalError(`OpenRouter is out of credits (${message}). The person can add more at openrouter.ai/settings/credits.`, true, true);
  if (status === 403 && /\b(credit|limit|budget|balance)\b/i.test(message))
    return new FalError(`OpenRouter wouldn't run this: ${message}. The person can check their key limit at openrouter.ai/settings/keys.`, true, true);
  if (status === 403) return new FalError(`OpenRouter wouldn't run this: ${message}`, true);
  if (status === 413) return new FalError(`OpenRouter refused this because the attached files were too large (${message}). A shorter clip or fewer references would do.`, true);
  if (status === 429 || status >= 500) return new FalError(`OpenRouter is busy (${message}); trying again`, false);
  return new FalError(message, true);
}

/** `starts`: a request that starts a billable job without an idempotency key, so a timeout is never retried blindly. */
async function call(key: string, path: string, init: RequestInit = {}, opts: { starts?: boolean; timeoutMs?: number } = {}): Promise<Body> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...APP_HEADERS, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });
  } catch (err) {
    const unanswered = opts.starts && err instanceof Error && err.name === "TimeoutError";
    if (unanswered)
      throw new FalError("OpenRouter didn't answer when asked to start this, so it may have started (and been charged) all the same. Look at openrouter.ai/activity before trying it again.", true);
    throw new FalError(`Couldn't reach OpenRouter (${err instanceof Error ? err.message : String(err)})`, false);
  }
  const body = (await res.json().catch(() => ({}))) as Body;
  if (res.ok) return body;
  throw problem(body, res.status);
}

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};
const typeOf = (file: string) => TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";

/** Encodes a local picture as a base64 data URL for OpenRouter's inline image inputs. */
export const openrouterDataUrl = (file: string) => `data:${typeOf(file)};base64,${readFileSync(file).toString("base64")}`;

/** Exact cost in USD from OpenRouter's `usage` object when present. */
function costOf(usage: unknown): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as { cost?: unknown; total_cost?: unknown };
  const raw = typeof u.cost === "number" ? u.cost : typeof u.total_cost === "number" ? u.total_cost : undefined;
  return raw !== undefined && Number.isFinite(raw) && raw >= 0 ? Math.round(raw * 10000) / 10000 : undefined;
}

const imageRef = (url: string) => ({ type: "image_url", image_url: { url } });

/**
 * Turns a still request into OpenRouter's `POST /api/v1/images` body for a model family (`shape`). `refs` are already
 * data URLs (or stand-in tags for `planTake`).
 */
export function openrouterImageInput(shape: string, model: string, ask: FalAsk): Record<string, unknown> {
  const base: Record<string, unknown> = {
    model,
    prompt: ask.prompt,
    response_format: "b64_json",
    ...(ask.aspect ? { aspect_ratio: ask.aspect } : {}),
    ...(ask.refs?.length ? { input_references: ask.refs.map(imageRef) } : {}),
  };
  switch (shape) {
    case "openrouter-image":
      // Models without resolution or output_format knobs (Gemini 2.5 Flash Image).
      return base;
    case "openrouter-image-1k":
      // 1K tier without output_format (Nano Banana 2.1).
      return { ...base, resolution: "1K" };
    case "openrouter-image-jpeg":
      // Flat JPEG output without resolution tier (Muse Image).
      return { ...base, output_format: "jpeg" };
    case "openrouter-image-1k-jpeg":
      // 1K JPEG with optional seed (FLUX 3 Image Klein, Seedream 5.5).
      return { ...base, resolution: "1K", output_format: "jpeg", ...(ask.seed !== undefined ? { seed: ask.seed } : {}) };
    case "openrouter-image-1k-jpeg-plain":
      // 1K JPEG without seed (MiniMax H3 Image).
      return { ...base, resolution: "1K", output_format: "jpeg" };
    case "openrouter-gpt-image":
      // GPT Image 2.6 at medium quality, matching the OpenAI and fal routes.
      return { ...base, quality: "medium", output_format: "jpeg", output_compression: 92 };
    default:
      throw new Error(`beatsheet has no way to ask OpenRouter for "${shape}" still models yet`);
  }
}

/** Makes one still synchronously through `POST /api/v1/images` and returns the bytes, type and exact spend. */
export async function openrouterImage(shape: string, model: string, key: string, ask: FalAsk): Promise<DirectOut> {
  const body = openrouterImageInput(shape, model, ask);
  const r = await call(key, "/images", { method: "POST", body: JSON.stringify(body) }, { timeoutMs: 5 * 60_000 });
  const out = (r.data as { b64_json?: unknown; url?: unknown; media_type?: unknown }[] | undefined)?.[0];
  let bytes: Buffer | undefined;
  let downloadedType: string | undefined;
  if (typeof out?.b64_json === "string" && out.b64_json) {
    bytes = Buffer.from(out.b64_json, "base64");
  } else if (typeof out?.url === "string" && out.url) {
    const res = await fetch(out.url, { signal: AbortSignal.timeout(60_000) }).catch(() => undefined);
    if (!res?.ok) throw new FalError("Couldn't download the picture OpenRouter made", true);
    downloadedType = res.headers.get("content-type")?.split(";")[0]?.trim();
    bytes = Buffer.from(await res.arrayBuffer());
  }
  if (!bytes?.length) throw new FalError("OpenRouter finished but didn't send a picture", true);
  const fallbackType = body.output_format === "jpeg" ? "image/jpeg" : "image/png";
  const contentType = typeof out?.media_type === "string" && out.media_type ? out.media_type : (downloadedType || fallbackType);
  return { bytes, contentType, usd: costOf(r.usage) };
}

/**
 * Turns a video request into OpenRouter's `POST /api/v1/videos` body for a model family (`shape`).
 * OpenRouter gives `frame_images` precedence when both `frame_images` and `input_references` are sent, so for standard
 * video models references are sent only when there is no start frame (matching Runway, Tein and Higgsfield).
 */
export function openrouterVideoInput(shape: string, model: string, ask: FalAsk): Record<string, unknown> {
  const final = ask.quality === "final";
  const refs = ask.start ? undefined : ask.refs;
  const hasExplicitRoles = /Reference pictures, in order:\s*Image \d+ is\b/.test(ask.prompt);
  const shown = refs?.length && !hasExplicitRoles ? ` ${refs.length === 1 ? "The reference picture shows" : `The ${refs.length} reference pictures show`} who and what is in it.` : "";
  const imgRefs = refs?.length ? refs.map(imageRef) : [];
  const audioRefs = ask.start ? undefined : ask.audioRefs;
  const audio = audioLine(audioRefs, (n, total) => (total === 1 ? "The reference audio" : `Audio ${n}`));
  const audioInputs = audioRefs?.length ? audioRefs.map((a) => ({ type: "audio_url", audio_url: { url: a.url } })) : [];
  const frames = ask.start
    ? [
        { ...imageRef(ask.start), frame_type: "first_frame" },
        ...(ask.end ? [{ ...imageRef(ask.end), frame_type: "last_frame" }] : []),
      ]
    : undefined;
  // Omitting aspect_ratio when starting from a picture lets adaptive models keep the board's shape.
  const shaped = !ask.start && ask.aspect ? { aspect_ratio: ask.aspect } : {};
  switch (shape) {
    case "openrouter-wan-3":
      // Wan 3.0: 480p roughs, 1080p finals, whole seconds, with sound and optional seed.
      return {
        model,
        prompt: `${ask.prompt}${shown}`,
        duration: whole(ask.seconds),
        resolution: final ? "1080p" : "480p",
        generate_audio: true,
        ...shaped,
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
        ...(frames ? { frame_images: frames } : imgRefs.length ? { input_references: imgRefs } : {}),
      };
    case "openrouter-seedance-2.5":
    case "openrouter-seedance-2.5-flash": {
      // Seedance 2.5 (480p rough / 1080p final) and 2.5 Flash (480p rough / 720p final): whole seconds, native sound,
      // references, optional reference video for keeping a blockout's camera, and optional reference audio.
      const videoRefs = ask.camera ? [{ type: "video_url", video_url: { url: ask.camera.url } }] : [];
      const allRefs = [...imgRefs, ...videoRefs, ...audioInputs];
      return {
        model,
        prompt: `${ask.prompt}${shown}${cameraLine(ask.camera, "The reference video")}${audio}`,
        duration: whole(ask.seconds),
        resolution: shape === "openrouter-seedance-2.5-flash" ? (final ? "720p" : "480p") : final ? "1080p" : "480p",
        generate_audio: true,
        ...shaped,
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
        ...(frames ? { frame_images: frames } : allRefs.length ? { input_references: allRefs } : {}),
      };
    }
    case "openrouter-gemini-omni": {
      // Gemini Omni 1.1 / 1.2 Flash: 360p roughs, 1080p finals, wide or tall only even from a board.
      const [w, h] = (ask.aspect ?? "16:9").split(":").map(Number) as [number, number];
      return {
        model,
        prompt: ask.prompt,
        duration: whole(ask.seconds),
        resolution: final ? "1080p" : "360p",
        aspect_ratio: h > w ? "9:16" : "16:9",
        generate_audio: true,
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
        ...(frames ? { frame_images: frames } : {}),
      };
    }
    case "openrouter-hailuo-3":
      // MiniMax H3 on OpenRouter: 2K only, native sound, start/end frames or reference pictures.
      return {
        model,
        prompt: `${ask.prompt}${shown}`,
        duration: whole(ask.seconds),
        resolution: "2K",
        generate_audio: true,
        ...shaped,
        ...(frames ? { frame_images: frames } : imgRefs.length ? { input_references: imgRefs } : {}),
      };
    case "openrouter-heygen-video":
      // HeyGen Video 1: 480p roughs, 1080p finals, first frame only, native sound without a generate_audio flag.
      return {
        model,
        prompt: ask.prompt,
        duration: whole(ask.seconds),
        resolution: final ? "1080p" : "480p",
        ...shaped,
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
        ...(frames ? { frame_images: frames.slice(0, 1) } : {}),
      };
    case "openrouter-happyhorse":
      // Alibaba HappyHorse 1.1: 720p roughs, 1080p finals, first frame or references, native sound (no toggle), seed.
      return {
        model,
        prompt: `${ask.prompt}${shown}`,
        duration: whole(ask.seconds),
        resolution: final ? "1080p" : "720p",
        ...shaped,
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
        ...(frames ? { frame_images: frames.slice(0, 1) } : imgRefs.length ? { input_references: imgRefs } : {}),
      };
    case "openrouter-grok-video":
      // Grok Imagine Video 1.5 / 1.5 Lite: 1 to 15 seconds, 480p roughs, 1080p finals, native sound, no seed.
      return {
        model,
        prompt: ask.prompt,
        duration: whole(ask.seconds),
        resolution: final ? "1080p" : "480p",
        generate_audio: true,
        ...shaped,
        ...(frames ? { frame_images: frames } : {}),
      };
    case "openrouter-heygen-avatar":
      // HeyGen Avatar 6 / Avatar 6 Turbo: lip-sync from a board photo and a driving voice track; duration follows audio.
      return {
        model,
        ...(ask.prompt ? { prompt: ask.prompt } : {}),
        resolution: "1080p",
        input_references: [
          ...(ask.start ? [imageRef(ask.start)] : []),
          ...(ask.audio ? [{ type: "audio_url", audio_url: { url: ask.audio } }] : []),
        ],
      };
    default:
      throw new Error(`beatsheet has no way to ask OpenRouter for "${shape}" video models yet`);
  }
}

/** Starts an async video job on OpenRouter. Never retried on timeout since there is no idempotency key. */
export async function openrouterSubmit(key: string, body: Record<string, unknown>): Promise<FalRequest> {
  const r = await call(key, "/videos", { method: "POST", body: JSON.stringify(body) }, { starts: true, timeoutMs: 120_000 });
  if (typeof r.id !== "string")
    throw new FalError("OpenRouter took the request but didn't say which job it started. Look at openrouter.ai/activity before trying it again.", true);
  const url = `${API}/videos/${r.id}`;
  return { id: r.id, status: url, response: `${url}/content`, cancel: "" };
}

export type OpenRouterStatus =
  | { state: "queued" }
  | { state: "running" }
  | { state: "done"; error?: string; url?: string; auth?: boolean; usd?: number };

/**
 * Checks where a video job is, and once it finishes returns the download URL (preferring the pre-signed URL, falling
 * back to the authenticated `/videos/{id}/content` stream) and exact `usage.cost`.
 */
export async function openrouterStatus(key: string, req: FalRequest): Promise<OpenRouterStatus> {
  const r = await call(key, `/videos/${req.id}`);
  if (r.status === "pending") return { state: "queued" };
  if (r.status === "in_progress" || r.status === "processing") return { state: "running" };
  const usd = costOf(r.usage);
  if (r.status === "completed") {
    const signed = (r.urls as unknown[] | undefined)?.find((u): u is string => typeof u === "string" && !!u);
    if (signed) return { state: "done", url: signed, usd };
    const unsigned = (r.unsigned_urls as unknown[] | undefined)?.find((u): u is string => typeof u === "string" && !!u);
    // Always stream authenticated content through API's own `/videos/{id}/content` so the key never leaves OpenRouter.
    if (unsigned || r.generation_id || r.id) return { state: "done", url: `${API}/videos/${req.id}/content`, auth: true, usd };
    return { state: "done", usd };
  }
  if (r.status === "failed" || r.status === "cancelled" || r.status === "expired") {
    const msg = typeof r.error === "string" && r.error ? r.error : `OpenRouter says the job ${r.status === "failed" ? "failed" : r.status === "expired" ? "expired" : "was cancelled"}`;
    return { state: "done", error: msg, usd };
  }
  throw new FalError(`OpenRouter said the job is ${String(r.status)}`, false);
}
