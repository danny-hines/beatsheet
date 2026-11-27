/**
 * Higgsfield's API (docs.higgsfield.ai, the model pages at dash.higgsfield.ai and the terms at open.higgsfield.ai, read
 * 21 November 2026): a request to a model's own address starts a job, which is then followed until it's done.
 * Higgsfield keeps the job under its id, so a job saved with that id can be picked up by another process after a
 * restart. Pictures and clips a request needs go up to Higgsfield's storage first (it says where to PUT each, and the
 * public address to name it by; they're deleted within a week). The key is read inside the engine and never passes
 * through the agent.
 *
 * Higgsfield sells its own models and other makers' on one key, video and stills, from a prepaid balance in dollars. A model's id is
 * the path its requests go to ("kling-video/v4.0/image-to-video"), and each has its own fields: `higgsfieldInput` is
 * the adapter for each family the catalog names (its routes' `shape`).
 *
 * What to know about it:
 * - The key is two parts, an id and a secret, kept and sent as one: `id:secret`.
 * - A request can be sent again under the same `Idempotency-Key` and starts nothing new, so one whose answer was lost
 *   is simply sent again.
 * - Nothing is charged for a job that failed, that its moderation turned down (`nsfw`), or that was cancelled while it
 *   waited. A job that has started can't be cancelled.
 * - A job doesn't say what it cost. What Higgsfield says the request will cost this account (`/estimate`) is asked
 *   when it's sent, and kept in place of the catalog's estimate.
 * - What it makes is kept for a week, then deleted.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { audioLine, cameraLine, FalError, whole, type FalAsk, type FalRequest } from "./fal.ts";

const API = process.env.BEATSHEET_HIGGSFIELD ?? "https://api.higgsfield.ai";

type Body = Record<string, unknown>;

/**
 * Higgsfield's words for a refused request. `detail` is a sentence, or a code with a message, or (a body it couldn't
 * read) a list of the fields it didn't like.
 */
function said(body: Body, status: number): { code: string; message: string } {
  const d = body.detail;
  const code = typeof body.code === "string" ? body.code : d && typeof d === "object" && !Array.isArray(d) && typeof (d as Body).code === "string" ? ((d as Body).code as string) : "";
  if (typeof d === "string") return { code, message: d };
  if (Array.isArray(d)) {
    const fields = (d as { loc?: unknown[]; msg?: string }[]).map((i) => [i.loc?.filter((p) => p !== "body").join("."), i.msg].filter(Boolean).join(": ")).filter(Boolean);
    if (fields.length) return { code, message: fields.join("; ") };
  }
  if (d && typeof d === "object" && typeof (d as Body).message === "string") return { code, message: (d as Body).message as string };
  const other = body.message ?? body.error;
  return { code, message: typeof other === "string" ? other : `Higgsfield answered ${status}` };
}

/** A failure as the person should read it. Whether another try could go differently is the caller's to say. */
function problem(body: Body, status: number, model?: string): FalError {
  const { code, message } = said(body, status);
  if (status === 401) return new FalError("Higgsfield refused the key. The person can check it in Settings → Media services.", true);
  if (code === "api_key_expired" || code === "api_key_disabled") return new FalError(`The Higgsfield key ${code === "api_key_expired" ? "has expired" : "is turned off"}. The person can make another at open.higgsfield.ai.`, true);
  if (status === 403 && (code === "model_unavailable" || message === "model_unavailable")) {
    return new FalError(`Higgsfield says ${model ?? "this model"} isn't available to this API key right now (model_unavailable). Check model access at open.higgsfield.ai or pick another model.`, true, true);
  }
  // A request the balance can't pay for is refused with 403, like a key that may not use the model.
  if (status === 403) return new FalError(`Higgsfield wouldn't start this: its balance is too low, or the key isn't allowed this model (${message}). The person can look at open.higgsfield.ai.`, true, true);
  if (status === 404 && model) return new FalError(`Higgsfield doesn't offer ${model} to this account (${message})`, true);
  // Too many waiting at once, a model that's paused for now, or trouble on Higgsfield's side: all pass.
  if (status === 429 || status === 423 || status >= 500) return new FalError(`Higgsfield is busy (${message}); trying again`, false);
  return new FalError(message, true);
}

/**
 * `to` is a path here, or an address Higgsfield gave for a job. The key goes only to Higgsfield's own addresses: one
 * that leads anywhere else is refused rather than followed.
 */
async function call(key: string, to: string, init: RequestInit = {}, model?: string): Promise<Body> {
  const url = to.startsWith("/") ? `${API}${to}` : to;
  if (!url.startsWith(`${API}/`)) throw new FalError(`Higgsfield gave an address that isn't its own (${url.slice(0, 80)})`, true);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Key ${key}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new FalError(`Couldn't reach Higgsfield (${err instanceof Error ? err.message : String(err)})`, false);
  }
  const body = (await res.json().catch(() => ({}))) as Body;
  if (res.ok) return body;
  throw problem(body, res.status, model);
}

/** The kinds of file Higgsfield's storage takes. */
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };

/**
 * Puts a picture or a clip in Higgsfield's storage and gives its public address, for inputs like a start frame:
 * Higgsfield says where to PUT the file and with which headers (the address is good for an hour), and the file goes
 * there, without the key.
 */
export async function higgsfieldUpload(key: string, file: string): Promise<string> {
  const type = TYPES[extname(file).toLowerCase()];
  if (!type) throw new FalError(`Higgsfield takes JPEG, PNG, WebP and GIF pictures, WAV and MP3 sound and MP4 video, and ${basename(file)} is none of them`, true);
  const r = await call(key, "/files/generate-upload-url", { method: "POST", body: JSON.stringify({ content_type: type }) });
  if (typeof r.upload_url !== "string" || typeof r.public_url !== "string") throw new FalError(`Higgsfield didn't say where to put ${basename(file)}`, false);
  const headers = { "Content-Type": type, ...((r.upload_headers as Record<string, string> | undefined) ?? {}) };
  const put = await fetch(r.upload_url, { method: "PUT", headers, body: readFileSync(file), signal: AbortSignal.timeout(5 * 60_000) }).catch((err: unknown) => {
    throw new FalError(`Couldn't upload ${basename(file)} to Higgsfield (${err instanceof Error ? err.message : String(err)})`, false);
  });
  if (!put.ok) throw new FalError(`Higgsfield didn't take ${basename(file)} (${put.status})`, put.status < 500);
  return r.public_url;
}

/** A request as Higgsfield takes it: the model's id, which is where it's sent, and its fields. */
export type HiggsfieldAsk = { model: string; body: Record<string, unknown> };

/**
 * What Higgsfield says a request will cost this account, in dollars, without making anything. Not knowing is fine: the
 * catalog's estimate stands.
 */
export async function higgsfieldEstimate(key: string, ask: HiggsfieldAsk): Promise<number | undefined> {
  const r = await call(key, `/estimate/${ask.model}`, { method: "POST", body: JSON.stringify(ask.body) }).catch(() => undefined);
  const usd = Number(r?.usd);
  return r?.usd !== undefined && r.usd !== null && Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 10000) / 10000 : undefined;
}

/**
 * Starts a job. `once` (the job's own id here) is its idempotency key: sent again after a crash or a dropped answer,
 * Higgsfield gives the first request's job rather than making, and charging for, another. The job is kept in the shape
 * fal's requests are (the addresses to follow it by, which are Higgsfield's own for it), so a saved job reads the same
 * whichever service has it.
 */
export async function higgsfieldSubmit(key: string, ask: HiggsfieldAsk, once: string): Promise<FalRequest> {
  const r = await call(key, `/${ask.model}`, { method: "POST", body: JSON.stringify(ask.body), headers: { "Idempotency-Key": once } }, ask.model);
  if (typeof r.request_id !== "string") throw new FalError("Higgsfield didn't say which job it started", false);
  const status = typeof r.status_url === "string" ? r.status_url : `${API}/requests/${r.request_id}/status`;
  const cancel = typeof r.cancel_url === "string" ? r.cancel_url : `${API}/requests/${r.request_id}/cancel`;
  return { id: r.request_id, status, response: status, cancel };
}

export type HiggsfieldStatus = { state: "queued" } | { state: "running" } | { state: "done"; error?: string; url?: string };

/** Where a job is, and once it's done what it made. One that failed, was turned down or was cancelled cost nothing. */
export async function higgsfieldStatus(key: string, req: FalRequest): Promise<HiggsfieldStatus> {
  const r = await call(key, req.status);
  if (r.status === "queued") return { state: "queued" };
  if (r.status === "in_progress") return { state: "running" };
  if (r.status === "completed") {
    const url = (r.video as { url?: unknown } | undefined)?.url ?? (r.images as { url?: unknown }[] | undefined)?.[0]?.url;
    return { state: "done", url: typeof url === "string" ? url : undefined };
  }
  if (r.status === "nsfw") return { state: "done", error: "Higgsfield's moderation turned this down (what it was asked or given, or what it made). Nothing is charged for it." };
  if (r.status === "failed") return { state: "done", error: typeof r.error === "string" && r.error ? `Higgsfield says it failed: ${r.error}` : "Higgsfield says it failed" };
  if (r.status === "canceled") return { state: "done", error: "Higgsfield says it was cancelled" };
  throw new FalError(`Higgsfield said the job is ${String(r.status)}`, false);
}

/** Drops a job that's still waiting. One that has started can't be stopped: it finishes and is charged, which is left as it is. */
export async function higgsfieldCancel(key: string, req: FalRequest): Promise<void> {
  await call(key, req.cancel, { method: "POST" }).catch(() => undefined);
}

/** The shapes models with a fixed aspect list make; the nearest to what's wanted is asked for. */
const SHAPES: Record<string, string[]> = {
  "gpt-image-2.5": ["21:9", "16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"],
  "soul-2": ["16:9", "3:2", "4:3", "1:1", "3:4", "2:3", "9:16"],
  "magi-2": ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
};
const ratio = (aspect: string) => {
  const [w, h] = aspect.split(":").map(Number);
  return Math.log(w! / h!);
};
/** Of the shapes a model makes, the one closest to `aspect` ("4:5" is asked for as "3:4"). */
const nearest = (shape: string, aspect: string | undefined) => {
  const want = aspect && Number.isFinite(ratio(aspect)) ? ratio(aspect) : undefined;
  return want === undefined ? undefined : SHAPES[shape]!.reduce((best, s) => (Math.abs(ratio(s) - want) < Math.abs(ratio(best) - want) ? s : best));
};

/**
 * Turns a request into one family of models' own fields on Higgsfield (from each model's page). `model` is the id the
 * request goes to, the route's endpoint, and says which kind of request it is: from words, from a picture
 * (".../image-to-video"), or from references (".../reference-to-video"). Seconds are whole numbers everywhere. A clip
 * from a picture keeps the picture's shape, and no shape is asked for then.
 *
 * Nothing on Higgsfield's pages says how a prompt should name a reference, so it's told in plain words what they are.
 */
export function higgsfieldInput(shape: string, model: string, ask: FalAsk): HiggsfieldAsk {
  const final = ask.quality === "final";
  const fromPicture = model.endsWith("/image-to-video");
  const fromReferences = model.endsWith("/reference-to-video");
  // The board a take starts from shows who's in it: where a request takes only references, it goes as the one picture.
  const pictures = fromReferences ? (ask.refs?.length ? ask.refs : ask.start ? [ask.start] : []) : [];
  const hasExplicitRoles = /Reference pictures, in order:\s*Image \d+ is\b/.test(ask.prompt);
  const shown = pictures.length && !hasExplicitRoles ? ` ${pictures.length === 1 ? "The reference picture shows" : `The ${pictures.length} reference pictures show`} who and what is in it.` : "";
  const audio = fromReferences ? audioLine(ask.audioRefs, (n, total) => (total === 1 ? "The reference audio" : `Audio ${n}`)) : "";
  const audioUrls = fromReferences && ask.audioRefs?.length ? { audio_urls: ask.audioRefs.map((a) => a.url) } : {};
  const shaped = ask.aspect ? { aspect_ratio: ask.aspect } : {};
  const body = ((): Record<string, unknown> => {
    switch (shape) {
      case "magi-2": {
        // Sand.ai MAGI-2: 1080p only (25 fps), 4 to 30 seconds, native audio on by default, optional integer seed.
        // Its image-to-video endpoint defaults aspect_ratio to 16:9 when omitted, so send the nearest supported ratio when known.
        // audio_urls is accepted even when generate_audio is false (e.g. timeline-synced music or speech).
        const aspect = nearest(shape, ask.aspect);
        const base = {
          duration: whole(ask.seconds),
          resolution: "1080p",
          ...(aspect ? { aspect_ratio: aspect } : {}),
          ...(ask.seed !== undefined ? { seed: ask.seed } : {}),
        };
        if (fromPicture) return { prompt: ask.prompt, image_url: ask.start, ...(ask.end ? { end_image_url: ask.end } : {}), ...base };
        if (!fromReferences) return { prompt: ask.prompt, ...base };
        return {
          prompt: `${ask.prompt}${shown}${cameraLine(ask.camera, "The reference video")}${audio}`,
          ...base,
          ...(ask.muteAudio ? { generate_audio: false } : {}),
          ...(pictures.length ? { image_urls: pictures } : {}),
          ...(ask.camera ? { video_urls: [ask.camera.url] } : {}),
          ...audioUrls,
        };
      }
      case "seedance-2.5": {
        // Seedance 2.5: roughs at 480p, finals at 1080p, 4 to 30 seconds, with its own sound (on unless turned off). A
        // clip whose camera it keeps goes as a reference video beside the pictures, at the dearer rate; the clip's own
        // seconds aren't billed.
        const size = { duration: whole(ask.seconds), resolution: final ? "1080p" : "480p" };
        if (fromPicture) return { prompt: ask.prompt, image_url: ask.start, ...(ask.end ? { end_image_url: ask.end } : {}), ...size };
        if (!fromReferences) return { prompt: ask.prompt, ...size, ...shaped };
        return {
          prompt: `${ask.prompt}${shown}${cameraLine(ask.camera, "The reference video")}${audio}`,
          ...size,
          ...shaped,
          ...(pictures.length ? { image_urls: pictures } : {}),
          ...(ask.camera ? { video_urls: [ask.camera.url] } : {}),
          ...audioUrls,
        };
      }
      case "kling-v4.0": {
        // Kling 4.0: roughs at 720p, finals at 1080p (it makes 4K too), 3 to 30 seconds. reference-to-video accepts
        // image_url + end_image_url alongside image_urls (up to 10 images total) and video_urls.
        const base = { duration: whole(ask.seconds), resolution: final ? "1080p" : "720p" };
        if (fromReferences) {
          const refPics = ask.refs ?? [];
          const refShown = refPics.length && !hasExplicitRoles ? ` ${refPics.length === 1 ? "The reference picture shows" : `The ${refPics.length} reference pictures show`} who and what is in it.` : "";
          return {
            prompt: `${ask.prompt}${refShown}${cameraLine(ask.camera, "The reference video")}`,
            ...base,
            ...(ask.start ? { image_url: ask.start } : shaped),
            ...(ask.end ? { end_image_url: ask.end } : {}),
            ...(refPics.length ? { image_urls: refPics } : {}),
            ...(ask.camera ? { video_urls: [ask.camera.url] } : {}),
          };
        }
        return {
          prompt: ask.prompt,
          ...(fromPicture ? { image_url: ask.start, ...(ask.end ? { end_image_url: ask.end } : {}) } : shaped),
          ...base,
        };
      }
      case "kling-v3.0":
        // Kling 3 Pro, at 1080p, 3 to 15 seconds. Its own sound is off: a cut's sound comes from its music, voice and effects.
        return {
          prompt: ask.prompt,
          ...(fromPicture ? { image_url: ask.start, ...(ask.end ? { last_image_url: ask.end } : {}) } : shaped),
          duration: whole(ask.seconds),
          sound: "off",
        };
      case "kling-v2.5-turbo":
        // Kling 2.5 Turbo Pro: 5 or 10 seconds, from a picture (from words alone it can't be asked for a shape here).
        return { prompt: ask.prompt, image_url: ask.start, duration: whole(ask.seconds) };
      case "wan-3.0": {
        // Wan 3.0: roughs at 480p, finals at 1080p, 2 to 30 seconds, with its own sound (on unless turned off). From a
        // picture it keeps the picture's shape ("adaptive", which is what it does unless told).
        const size = { duration: whole(ask.seconds), resolution: final ? "1080p" : "480p", ...(ask.seed ? { seed: ask.seed } : {}) };
        if (fromPicture) return { prompt: ask.prompt, image_url: ask.start, ...(ask.end ? { end_image_url: ask.end } : {}), ...size };
        return { prompt: `${ask.prompt}${shown}${audio}`, ...size, ...shaped, ...(pictures.length ? { image_urls: pictures } : {}), ...audioUrls };
      }
      case "gpt-image-2.5": {
        // GPT Image 2.5 (Flare or Sunburst, by the model's address), which Higgsfield sells as Marketing Studio Image:
        // at medium quality and 1K as on its other routes (left unsaid it draws at high and 2K, for several times the
        // price), with the pictures it's given as references.
        const aspect = nearest(shape, ask.aspect);
        return { prompt: ask.prompt, quality: "medium", resolution: "1k", ...(aspect ? { aspect_ratio: aspect } : {}), ...(ask.refs?.length ? { image_urls: ask.refs } : {}) };
      }
      case "soul-2": {
        // Soul 2, Higgsfield's own, from words alone, at 1080p. The prompt is beatsheet's and is left as written (its
        // docs and its console disagree on whether it's rewritten unless told).
        const aspect = nearest(shape, ask.aspect);
        return { prompt: ask.prompt, resolution: "1080p", ...(aspect ? { aspect_ratio: aspect } : {}), enhance_prompt: false };
      }
      case "kling-motion-control":
        // Kling's motion control: the people in the board move as the people in the clip do, framed as the clip is,
        // without the clip's own sound.
        return { prompt: ask.prompt, image_url: ask.start, video_url: ask.video, character_orientation: "video", keep_original_sound: "no" };
      default:
        throw new Error(`beatsheet has no way to ask Higgsfield for "${shape}" models yet`);
    }
  })();
  return { model, body };
}
