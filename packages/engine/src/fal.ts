/**
 * fal's queue: a request is submitted, its status followed, and its result fetched once it's done. fal keeps the
 * request under its id, so a job saved with that id can be picked up by another process after a restart. Pictures a
 * request needs (a start frame, references) go up to fal's storage first. The key is read inside the engine and never
 * passes through the agent.
 *
 * Each family of models takes its own inputs; `falInput` is the adapter for each family the catalog names (its
 * routes' `shape`), so a new model that takes the same inputs as one already here is a catalog entry, not code.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import type { AudioRefRole, Quality } from "@beatsheet/schema";
import { sizeFor } from "./direct.ts";

const QUEUE = process.env.BEATSHEET_FAL_QUEUE ?? "https://queue.fal.run";
const REST = process.env.BEATSHEET_FAL_REST ?? "https://rest.fal.ai";

/** A submitted request, by the URLs fal gave for it (its docs say to use these rather than build them). */
export type FalRequest = { id: string; status: string; response: string; cancel: string };

/** What fal said went wrong. `final` errors won't change on a retry (the key, the credits, the inputs). */
export class FalError extends Error {
  readonly final: boolean;
  readonly funds: boolean;
  constructor(message: string, final: boolean, funds = false) {
    super(message);
    this.final = final;
    this.funds = funds;
  }
}

/** fal's own words for a failure, from whichever shape its error body has. */
function said(body: unknown, status: number): string {
  const b = body as { detail?: unknown; error?: unknown; message?: unknown } | undefined;
  const d = b?.detail ?? b?.error ?? b?.message;
  if (typeof d === "string") return d;
  // A validation error lists each field it didn't like: [{ loc: ["body", "duration"], msg: "…" }].
  if (Array.isArray(d)) return (d as { loc?: unknown[]; msg?: string }[]).map((x) => [x.loc?.slice(1).join("."), x.msg].filter(Boolean).join(": ")).join("; ");
  return `fal answered ${status}`;
}

async function call(key: string, url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Key ${key}`, "content-type": "application/json", ...init.headers }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new FalError(`Couldn't reach fal (${err instanceof Error ? err.message : String(err)})`, false);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return body;
  const message = said(body, res.status);
  if (res.status === 401) throw new FalError("fal refused the key. The person can check it in Settings → Media services.", true);
  if (res.status === 403 && /balance|credit|locked|billing/i.test(message)) throw new FalError(`fal is out of credits: ${message}. The person can add more at fal.ai/dashboard/billing.`, true, true);
  if (res.status === 429 || res.status >= 500) throw new FalError(`fal is busy (${message}); trying again`, false);
  throw new FalError(message, true);
}

export async function falSubmit(key: string, endpoint: string, input: Record<string, unknown>): Promise<FalRequest> {
  const r = await call(key, `${QUEUE}/${endpoint}`, { method: "POST", body: JSON.stringify(input) });
  if (typeof r.request_id !== "string") throw new FalError("fal didn't say which request it queued", false);
  // The status and result live under the app (owner/name), not the endpoint's full path.
  const app = `${QUEUE}/${endpoint.split("/").slice(0, 2).join("/")}/requests/${r.request_id}`;
  return { id: r.request_id, status: (r.status_url as string) ?? `${app}/status`, response: (r.response_url as string) ?? app, cancel: (r.cancel_url as string) ?? `${app}/cancel` };
}

export type FalStatus = { state: "queued"; position?: number } | { state: "running" } | { state: "done"; error?: string };

/** Where a request is. A finished one that failed says so in `error`; fal marks both as COMPLETED. */
export async function falStatus(key: string, req: FalRequest): Promise<FalStatus> {
  const r = await call(key, req.status);
  if (r.status === "IN_QUEUE") return { state: "queued", position: typeof r.queue_position === "number" ? r.queue_position : undefined };
  if (r.status === "IN_PROGRESS") return { state: "running" };
  if (r.status === "COMPLETED") return { state: "done", error: r.error ? String(r.error) : undefined };
  throw new FalError(`fal said the request is ${String(r.status)}`, false);
}

export const falResult = (key: string, req: FalRequest) => call(key, req.response);

export async function falCancel(key: string, req: FalRequest): Promise<void> {
  await call(key, req.cancel, { method: "PUT" }).catch(() => undefined);
}

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

/** Puts a file in fal's storage and gives its URL, for inputs like a start frame. */
export async function falUpload(key: string, file: string): Promise<string> {
  const contentType = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  const r = await call(key, `${REST}/storage/upload/initiate?storage_type=fal-cdn-v3`, { method: "POST", body: JSON.stringify({ content_type: contentType, file_name: basename(file) }) });
  if (typeof r.upload_url !== "string" || typeof r.file_url !== "string") throw new FalError("fal didn't say where to upload", false);
  const put = await fetch(r.upload_url, { method: "PUT", body: readFileSync(file), headers: { "content-type": contentType }, signal: AbortSignal.timeout(5 * 60_000) }).catch((err: unknown) => {
    throw new FalError(`Couldn't upload ${basename(file)} to fal (${err instanceof Error ? err.message : String(err)})`, false);
  });
  if (!put.ok) throw new FalError(`fal didn't take ${basename(file)} (${put.status})`, put.status < 500);
  return r.file_url;
}

/** What a reference video guides: a raw clip's camera, a 3D blockout, a clip being relit, a character swap, or a clay facial performance. */
export type CameraKind = "clip" | "blockout" | "relight" | "swap" | "perform";

/** A multimodal reference audio clip sent alongside reference pictures/videos (e.g. music rhythm, spoken lines, voice timbre, ambience). */
export type FalAudioRef = { url: string; role?: AudioRefRole; label?: string };

/**
 * A request in the terms every adapter understands; pictures, the stretch of a clip a take follows or changes the
 * mouths in (`video`), and what it says (`audio`) are already URLs fal can fetch. A model that makes roughs and finals
 * both makes a final larger.
 */
export type FalAsk = {
  prompt: string;
  quality?: Quality;
  seconds?: number;
  aspect?: string;
  seed?: number;
  start?: string;
  end?: string;
  refs?: string[];
  video?: string;
  audio?: string;
  /** Multimodal reference audio clips sent on reference-to-video endpoints. */
  audioRefs?: FalAudioRef[];
  /** Turn off native audio output when the model supports it (e.g. MAGI-2 guided by timeline-synced music or speech). */
  muteAudio?: boolean;
  /** A clip whose camera/lighting/performance/swap conditioning the take keeps, and what kind of guide it is. */
  camera?: { url: string; blockout: boolean; kind?: CameraKind };
};

/** Instruction added when a 4×4 16-frame blockout contact sheet is sent as the first reference picture instead of a reference video. */
export const SHEET_LINE =
  " The first reference picture is a 4×4 storyboard contact sheet (16 sequential frames, left to right, top to bottom) showing the exact camera move, framing, staging and cut timing to follow. Follow that camera progression across the shot; none of the grid borders, grey set geometry or striped stand-ins appears in the finished video.";

/** The prompt with a line saying which reference picture is which, in the model's own names for them ("Image 1", "@Image1"). */
const withRefs = (ask: FalAsk, name: (n: number) => string) => {
  if (!ask.refs?.length) return ask.prompt;
  // When castPrompt already assigned explicit numbered roles ("Reference pictures, in order: Image 1 is ..."),
  // rewrite "Image N" into this model's reference syntax (@Image1 on Seedance) instead of appending a generic line.
  if (/Reference pictures, in order:\s*Image \d+ is\b/.test(ask.prompt)) {
    return ask.prompt.replace(/\bImage (\d+)\b/g, (_, n) => name(Number(n)));
  }
  return `${ask.prompt} ${ask.refs.length === 1 ? `${name(1)} is a reference` : `${name(1)} to ${name(ask.refs.length)} are references`} for who and what is in it.`;
};

/**
 * What's said of a reference video a take follows, called what the service calls it ("The reference video", "@Video1").
 * A reference video is copied in everything it shows, so the model is told exactly what to keep and what to replace.
 */
export const cameraLine = (camera: FalAsk["camera"], name: string) => {
  if (!camera) return "";
  const kind: CameraKind = camera.kind ?? (camera.blockout ? "blockout" : "clip");
  if (kind === "blockout")
    return ` ${name} is a blockout: keep its camera exactly (the move, the framing, the timing and where the cuts fall). Its grey set and its striped stand-ins only mark where things are and how big; none of them appears in the result.`;
  if (kind === "relight")
    return ` ${name} is the source footage to relight: keep its exact framing, subjects, movement, textures and timing unchanged, and replace only its lighting, shadows and color atmosphere to match the reference lighting sphere and prompt. The lighting sphere itself never appears in the video.`;
  if (kind === "swap")
    return ` ${name} is the source scene with a tracked mesh or mask marking the person to replace: keep the exact camera, background, lighting, body pose, timing and expression, replace the marked person with the character in the reference pictures, and remove every mesh line, mask and depth color in the finished video.`;
  if (kind === "perform")
    return ` ${name} is a neutral 3D clay facial-performance guide carrying exact head motion, eye blinks, brow movement and mouth expressions: transfer every expression and head turn onto the character in the reference picture with photorealistic skin and detail; none of the grey clay sculpt appears in the finished video.`;
  return ` ${name} sets the camera: keep its move, its framing, its timing and where its cuts fall.`;
};

/**
 * What's said of reference audio clips a take follows, naming each as the service calls it (`@Audio1` on fal Seedance 2.5,
 * or "The reference audio" / "Audio 1" elsewhere) with clear instructions for its role (music beat, spoken dialogue,
 * character voice timbre, or ambience).
 */
export const audioLine = (refs: FalAsk["audioRefs"], name: (n: number, total: number) => string): string => {
  if (!refs?.length) return "";
  const parts = refs.map((a, i) => {
    const tag = name(i + 1, refs.length);
    const who = a.label ? ` (${a.label})` : "";
    if (a.role === "music") return `${tag}${who} is the music track: sync the movement, pacing, gestures and cuts to its beat and rhythm.`;
    if (a.role === "dialogue") return `${tag}${who} is the spoken dialogue: match the character's lip movements, facial expressions and timing to it.`;
    if (a.role === "voice") return `${tag}${who} is the voice reference: match its speaker's voice timbre, tone and cadence when speaking.`;
    if (a.role === "ambience") return `${tag}${who} is the ambience reference: match its sonic atmosphere and soundscape.`;
    return `${tag}${who} is an audio reference to follow in timing, mood and sound.`;
  });
  return ` ${parts.join(" ")}`;
};

/** Whole seconds, for models that only make those. */
export const whole = (seconds: number | undefined) => Math.ceil((seconds ?? 5) - 1e-6);

/** Frames Wan makes for `seconds` at 16 a second: a whole number of fours plus one, between 17 and 161. */
export const wanFrames = (seconds: number) => Math.min(161, Math.max(17, Math.ceil((seconds * 16 - 1) / 4) * 4 + 1));

/** Turns a request into a family of models' own inputs (from each model's page on fal). */
export function falInput(shape: string, ask: FalAsk): Record<string, unknown> {
  switch (shape) {
    case "nano-banana":
      return {
        prompt: ask.prompt,
        num_images: 1,
        output_format: "jpeg",
        ...(ask.aspect ? { aspect_ratio: ask.aspect } : {}),
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
        ...(ask.refs?.length ? { image_urls: ask.refs } : {}),
      };
    case "kling":
      return {
        prompt: ask.prompt,
        duration: String(ask.seconds ?? 5),
        // Starting from a picture, the picture's shape decides.
        ...(ask.start ? { image_url: ask.start } : ask.aspect ? { aspect_ratio: ask.aspect } : {}),
        ...(ask.end ? { tail_image_url: ask.end } : {}),
      };
    case "kling-3":
      // Its own sound is off: a cut's sound comes from its music, voice and effects.
      return {
        prompt: ask.prompt,
        duration: String(ask.seconds ?? 5),
        start_image_url: ask.start,
        ...(ask.end ? { end_image_url: ask.end } : {}),
        generate_audio: false,
      };
    case "wan":
      return {
        prompt: ask.prompt,
        num_frames: wanFrames(ask.seconds ?? 5),
        frames_per_second: 16,
        resolution: "720p",
        aspect_ratio: ask.start ? "auto" : (ask.aspect ?? "16:9"),
        ...(ask.start ? { image_url: ask.start } : {}),
        ...(ask.end ? { end_image_url: ask.end } : {}),
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
      };
    case "minimax-h3":
    case "minimax-h3-max":
    case "minimax-h3-max-turbo": {
      // MiniMax H3 and fal's tunings of it: 768p natively (H3 Max refines to 1080p for finals), always with its own
      // sound. Base H3 counts whole seconds; the tunings take any length. References are "Image 1", "Image 2"… to it.
      const seconds = ask.seconds ?? 5;
      return {
        prompt: withRefs(ask, (n) => `Image ${n}`),
        duration: shape === "minimax-h3" ? whole(seconds) : seconds,
        resolution: shape === "minimax-h3-max" ? "1080P" : "768P",
        ...(ask.refs?.length ? { reference_image_urls: ask.refs } : {}),
        // Starting from a picture, the picture's shape decides.
        ...(ask.start ? { image_url: ask.start } : ask.aspect ? { aspect_ratio: ask.aspect } : {}),
        ...(ask.end ? { end_image_url: ask.end } : {}),
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
      };
    }
    case "wan-3": {
      // Wan 3.0: roughs at 480p, finals at 1080p (it defaults to 1080p), whole seconds, with its own sound. Its prompt
      // expansion is left on, as fal recommends. Reference audio goes in reference_audio_urls (up to 5 clips, ≤15s total).
      const audio = audioLine(ask.audioRefs, (n, total) => (total === 1 ? "The reference audio" : `Audio ${n}`));
      return {
        prompt: `${withRefs(ask, (n) => `Image ${n}`)}${audio}`,
        duration: whole(ask.seconds),
        resolution: ask.quality === "final" ? "1080p" : "480p",
        ...(ask.refs?.length ? { reference_image_urls: ask.refs } : {}),
        ...(ask.audioRefs?.length ? { reference_audio_urls: ask.audioRefs.map((a) => a.url) } : {}),
        ...(ask.start ? { start_image_url: ask.start } : ask.aspect ? { aspect_ratio: ask.aspect } : {}),
        ...(ask.end ? { end_image_url: ask.end } : {}),
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
      };
    }
    case "seedance-2.5": {
      // Seedance 2.5: roughs at 480p, finals at 1080p, whole seconds as a string, with its own sound (the same price
      // either way). References are @Image1, @Image2… to it, a clip whose camera it keeps is @Video1, and reference
      // audio clips are @Audio1, @Audio2… (audio_urls, up to 10 clips, ≤30s combined).
      const audio = audioLine(ask.audioRefs, (n) => `@Audio${n}`);
      return {
        prompt: `${withRefs(ask, (n) => `@Image${n}`)}${cameraLine(ask.camera, "@Video1")}${audio}`,
        duration: String(whole(ask.seconds)),
        resolution: ask.quality === "final" ? "1080p" : "480p",
        ...(ask.refs?.length ? { image_urls: ask.refs } : {}),
        ...(ask.camera ? { video_urls: [ask.camera.url] } : {}),
        ...(ask.audioRefs?.length ? { audio_urls: ask.audioRefs.map((a) => a.url) } : {}),
        ...(ask.start ? { image_url: ask.start } : ask.aspect ? { aspect_ratio: ask.aspect } : {}),
        ...(ask.end ? { end_image_url: ask.end } : {}),
      };
    }
    case "kling-4":
      // Kling 4.0: roughs at 720p, finals at 1080p, whole seconds. fal takes no seed, sound switch or negative prompt for it.
      return {
        prompt: ask.prompt,
        duration: whole(ask.seconds),
        resolution: ask.quality === "final" ? "1080p" : "720p",
        ...(ask.start ? { start_image_url: ask.start } : ask.aspect ? { aspect_ratio: ask.aspect } : {}),
        ...(ask.end ? { end_image_url: ask.end } : {}),
      };
    case "gemini-omni": {
      // Gemini Omni Flash: roughs at 360p, finals at 1080p (upscaled from 720p), whole seconds, wide or tall only, even
      // from a picture.
      const [w, h] = (ask.aspect ?? "16:9").split(":").map(Number) as [number, number];
      return {
        prompt: ask.prompt,
        duration: whole(ask.seconds),
        resolution: ask.quality === "final" ? "1080p" : "360p",
        aspect_ratio: h > w ? "9:16" : "16:9",
        ...(ask.start ? { image_url: ask.start } : {}),
        ...(ask.end ? { end_image_url: ask.end } : {}),
      };
    }
    case "kling-motion":
      // Kling's motion control: the people in the board move as the people in the clip do, framed as the clip is (up to
      // 30 seconds that way), without the clip's own sound.
      return { prompt: ask.prompt, image_url: ask.start, video_url: ask.video, character_orientation: "video", keep_original_sound: false };
    // ---- Lip sync: what's said (`audio`) is as long as the take, and so is the clip whose mouths change (`video`).
    case "h3-max-lipsync":
      // MiniMax H3 Max's lip sync from a board: as long as what it says, at 480p for a rough and 1080p for a final.
      return { image_url: ask.start, audio_url: ask.audio, resolution: ask.quality === "final" ? "1080P" : "480P", ...(ask.seed !== undefined ? { seed: ask.seed } : {}) };
    case "sync":
      // sync.so: the mouths in a clip changed (sync-3, Lipsync 2 Pro), or sync-3 making a board talk. The two are the
      // same length, so the shorter isn't cut short.
      return ask.video ? { video_url: ask.video, audio_url: ask.audio, sync_mode: "cut_off" } : { image_url: ask.start, audio_url: ask.audio };
    case "kling-lipsync":
      return { video_url: ask.video, audio_url: ask.audio };
    case "latentsync":
      return { video_url: ask.video, audio_url: ask.audio, ...(ask.seed !== undefined ? { seed: ask.seed } : {}) };
    case "longcat-avatar":
      // LongCat makes about 5.8 seconds and then 5 for each segment after, up to 10, however long the sound; 480p for a
      // rough and 720p for a final.
      return {
        image_url: ask.start,
        audio_url: ask.audio,
        prompt: ask.prompt,
        num_segments: Math.min(10, Math.max(1, 1 + Math.ceil(((ask.seconds ?? 5.8) - 5.8) / 5 - 1e-6))),
        resolution: ask.quality === "final" ? "720p" : "480p",
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
      };
    case "kling-avatar":
    case "omnihuman":
      // A board made to talk, with the prompt for how they move and look as they do.
      return { image_url: ask.start, audio_url: ask.audio, prompt: ask.prompt };
    case "veed-fabric":
      return { image_url: ask.start, audio_url: ask.audio, resolution: ask.quality === "final" ? "720p" : "480p" };
    case "infinitalk":
      // InfiniteTalk on fal makes as many frames as it's asked, at 25 a second (a whole number of fours plus one), not as
      // many as the sound lasts.
      return {
        image_url: ask.start,
        audio_url: ask.audio,
        prompt: ask.prompt,
        num_frames: Math.min(721, Math.max(41, Math.ceil(((ask.seconds ?? 5) * 25 - 1) / 4) * 4 + 1)),
        resolution: "480p",
        ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
      };
    case "gpt-image": {
      // GPT Image on fal, at medium quality and the size the OpenAI route asks for.
      const [width, height] = sizeFor(ask.aspect).split("x").map(Number);
      return { prompt: ask.prompt, image_size: { width, height }, quality: "medium", output_format: "jpeg", ...(ask.refs?.length ? { image_urls: ask.refs } : {}) };
    }
    default:
      throw new Error(`beatsheet has no way to ask fal for "${shape}" models yet`);
  }
}

/** Whether a family of models takes a seed, so one can be chosen and recorded for each take. */
export const takesSeed = (shape: string) =>
  [
    "nano-banana",
    "wan",
    "wan-3",
    "magi-2",
    "scail-2",
    "minimax-h3",
    "minimax-h3-max",
    "minimax-h3-max-turbo",
    "flux3-klein",
    "infinitetalk",
    "infinitalk",
    "h3-max-lipsync",
    "latentsync",
    "longcat-avatar",
    "openrouter-image-1k-jpeg",
    "openrouter-wan-3",
    "openrouter-seedance-2.5",
    "openrouter-seedance-2.5-flash",
    "openrouter-gemini-omni",
    "openrouter-heygen-video",
    "openrouter-happyhorse",
  ].includes(shape);

/** The file a finished request made: the first picture, or the video. */
export function falOutput(result: Record<string, unknown>): { url: string; contentType?: string; seed?: number } | undefined {
  const images = result.images as { url?: string; content_type?: string }[] | undefined;
  const video = result.video as { url?: string; content_type?: string } | undefined;
  const file = images?.[0] ?? video;
  if (!file?.url) return undefined;
  return { url: file.url, contentType: file.content_type, seed: typeof result.seed === "number" ? result.seed : undefined };
}
