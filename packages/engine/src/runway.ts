/**
 * Runway's API (docs.dev.runwayml.com and its openapi.json, read 21 November 2026): a request starts a task, which is
 * then followed until it's done. Runway keeps the task under its id, so a job saved with that id can be picked up by
 * another process after a restart. Pictures and clips a request needs go up to Runway's own storage first (an
 * "ephemeral upload", kept 24 hours), and are named by the `runway://` address it gives. The key is read inside the
 * engine and never passes through the agent.
 *
 * Runway sells its own models and other makers' on one key, billed in credits of a cent each. One endpoint for each
 * kind of request (from words, from a picture, a still) takes every model, and the model named decides which fields
 * the request may have: `runwayInput` is the adapter for each one the catalog names (its routes' `shape`, Runway's own
 * id for the model).
 *
 * What to know about it:
 * - A task says what it will cost at most when it starts and what it did cost when it ends, so a take records what was
 *   charged.
 * - A task its moderation turns down is charged as if it had been made (and an account with many of them is
 *   suspended), so one isn't sent again by itself.
 * - There's no key to send a request again under: one sent twice is made, and charged, twice. So a request that
 *   timed out waiting for the answer isn't tried again.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { audioLine, cameraLine, FalError, whole, type FalAsk, type FalRequest } from "./fal.ts";

const API = process.env.BEATSHEET_RUNWAY ?? "https://api.dev.runwayml.com/v1";
/** The version of the API every request names; Runway has had the one since it opened. */
const VERSION = "2024-11-06";

type Body = Record<string, unknown>;

/** Runway's words for a refused request: `error`, and each field it didn't like (`issues`). */
function said(body: Body, status: number): string {
  const issues = Array.isArray(body.issues) ? (body.issues as { path?: unknown[]; message?: string }[]).map((i) => [i.path?.join("."), i.message].filter(Boolean).join(": ")).filter(Boolean) : [];
  const error = typeof body.error === "string" ? body.error : "";
  return [error, ...issues].filter(Boolean).join("; ") || `Runway answered ${status}`;
}

/** A failure as the person should read it. Whether another try could go differently is the caller's to say. */
function problem(body: Body, status: number): FalError {
  const message = said(body, status);
  if (status === 401) return new FalError("Runway refused the key. The person can check it in Settings → Media services.", true);
  // Its docs don't say how being out of credits is answered; it's taken to be a refusal that says so.
  if (status < 500 && status !== 429 && /\bcredits?\b/i.test(message)) return new FalError(`Runway is out of credits (${message}). The person can add more at dev.runway.com.`, true, true);
  // Too many at once, or Runway shedding load: both pass.
  if (status === 429 || status >= 500) return new FalError(`Runway is busy (${message}); trying again`, false);
  return new FalError(message, true);
}

/** `starts`: the request starts a task that's charged for, so it's never sent twice on a guess. */
async function call(key: string, path: string, init: RequestInit = {}, starts = false): Promise<Body> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "X-Runway-Version": VERSION, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    const unanswered = starts && err instanceof Error && err.name === "TimeoutError";
    if (unanswered) throw new FalError("Runway didn't answer when asked to start this, so it may have started (and been charged) all the same. Look at dev.runway.com before trying it again.", true);
    throw new FalError(`Couldn't reach Runway (${err instanceof Error ? err.message : String(err)})`, false);
  }
  const body = (await res.json().catch(() => ({}))) as Body;
  if (res.ok) return body;
  throw problem(body, res.status);
}

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".wav": "audio/wav", ".mp3": "audio/mpeg" };

/**
 * Puts a picture or a clip in Runway's storage and gives its `runway://` address, for inputs like a start frame: Runway
 * says where to send the file and with which form fields, and the file goes there. Up to 200 MB, and no less than 512
 * bytes.
 */
export async function runwayUpload(key: string, file: string): Promise<string> {
  const r = await call(key, "/uploads", { method: "POST", body: JSON.stringify({ filename: basename(file), type: "ephemeral" }) });
  if (typeof r.uploadUrl !== "string" || typeof r.runwayUri !== "string") throw new FalError(`Runway didn't say where to put ${basename(file)}`, false);
  const form = new FormData();
  for (const [name, value] of Object.entries((r.fields as Record<string, unknown> | undefined) ?? {})) form.append(name, String(value));
  // The file goes last: storage that takes a form reads the fields before it.
  form.append("file", new Blob([readFileSync(file)], { type: TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" }), basename(file));
  const put = await fetch(r.uploadUrl, { method: "POST", body: form, signal: AbortSignal.timeout(5 * 60_000) }).catch((err: unknown) => {
    throw new FalError(`Couldn't upload ${basename(file)} to Runway (${err instanceof Error ? err.message : String(err)})`, false);
  });
  if (!put.ok) throw new FalError(`Runway didn't take ${basename(file)} (${put.status})`, put.status < 500);
  return r.runwayUri;
}

/**
 * The sizes Runway takes for each model ("width:height"), a rough's and a final's where the model makes both; the one
 * closest in shape to what's wanted is asked for. MiniMax H3 is asked by shape alone.
 */
const SIZES: Record<string, { rough: string[]; final?: string[] }> = {
  // 480p and 1080p (it makes 720p and 4K too).
  seedance2_5: { rough: ["992:432", "854:480", "752:560", "640:640", "560:752", "480:854"], final: ["2206:946", "1920:1080", "1664:1248", "1440:1440", "1248:1664", "1080:1920"] },
  // 720p and 1080p.
  kling_4: { rough: ["1280:720", "1460:624", "940:940", "720:1280"], final: ["1920:1080", "2200:940", "1440:1440", "1080:1920"] },
  // One price whatever the size, so the largest.
  "kling2.5_turbo_pro": { rough: ["1920:1080", "1440:1440", "1080:1920"] },
  "kling3.0": { rough: ["1920:1080", "1440:1440", "1080:1920"] },
  // 480p and 1080p (720p between them).
  wan3: { rough: ["832:480", "720:544", "624:624", "544:720", "480:832"], final: ["1920:1080", "1648:1248", "1440:1440", "1248:1648", "1080:1920"] },
  hailuo3: { rough: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] },
  // 360p and 1080p, wide or tall only.
  "gemini_omni_flash_1.1": { rough: ["640:360", "360:640"], final: ["1920:1080", "1080:1920"] },
  // Stills, at each model's 1K.
  "nano_banana_2.1": { rough: ["1584:672", "1376:768", "1264:848", "1200:896", "1152:928", "1024:1024", "928:1152", "896:1200", "848:1264", "768:1376"] },
  "gemini_2.5_flash": { rough: ["1536:672", "1344:768", "1248:832", "1184:864", "1152:896", "1024:1024", "896:1152", "864:1184", "832:1248", "768:1344"] },
  muse_image: { rough: ["2352:1008", "2016:1152", "1920:1280", "1792:1344", "1600:1600", "1344:1792", "1280:1920", "1152:2016"] },
  gpt_image_2_6: { rough: ["2048:880", "1920:1088", "1920:1280", "1920:1440", "1920:1536", "1920:1920", "1536:1920", "1440:1920", "1280:1920", "1088:1920"] },
};

const shapeOf = (size: string) => {
  const [w, h] = size.split(":").map(Number);
  return Math.log(w! / h!);
};

/** The size a model is asked for: of the tier's, the one closest in shape to `aspect` ("9:16"); its first with none wanted. */
function sized(shape: string, ask: FalAsk): string {
  const sizes = (ask.quality === "final" ? SIZES[shape]!.final : undefined) ?? SIZES[shape]!.rough;
  if (!ask.aspect) return sizes[0]!;
  const want = shapeOf(ask.aspect);
  return sizes.reduce((best, s) => (Math.abs(shapeOf(s) - want) < Math.abs(shapeOf(best) - want) ? s : best));
}

/** A request as Runway takes it: which of its endpoints, and the body. */
export type RunwayAsk = { path: "text_to_video" | "image_to_video" | "text_to_image"; body: Record<string, unknown> };

/**
 * Turns a request into one model's own inputs on Runway (from its openapi.json). `model` is Runway's id for it, the
 * route's endpoint. A clip that starts from a picture goes to image_to_video with the picture as its first frame (and
 * the end frame as its last); anything else to text_to_video, with any reference pictures. The two can't be mixed
 * there, and the board a take starts from already shows who's in it, so references go only when nothing starts it.
 * `aspect` is the shape wanted, or the start frame's own shape: where a model wants a size said even from a picture,
 * Runway crops the picture to it.
 */
export function runwayInput(shape: string, model: string, ask: FalAsk): RunwayAsk {
  const final = ask.quality === "final";
  const refs = ask.start ? undefined : ask.refs;
  const shown = refs?.length ? ` ${refs.length === 1 ? "The reference picture shows" : `The ${refs.length} reference pictures show`} who and what is in it.` : "";
  const references = refs?.length ? { references: refs.map((uri) => ({ uri })) } : {};
  const audioRefs = ask.start ? undefined : ask.audioRefs;
  const audio = audioLine(audioRefs, (n, total) => (total === 1 ? "The reference audio" : `Audio ${n}`));
  const referenceAudio = audioRefs?.length ? { referenceAudio: audioRefs.map((a) => ({ type: "audio", uri: a.url })) } : {};
  const video = (body: Record<string, unknown>): RunwayAsk =>
    ask.start
      ? { path: "image_to_video", body: { model, promptImage: [{ uri: ask.start, position: "first" }, ...(ask.end ? [{ uri: ask.end, position: "last" }] : [])], ...body } }
      : { path: "text_to_video", body: { model, ...body } };
  const still = (body: Record<string, unknown>): RunwayAsk => ({
    path: "text_to_image",
    body: { model, promptText: ask.prompt, ratio: sized(shape, ask), ...(ask.refs?.length ? { referenceImages: ask.refs.map((uri) => ({ uri })) } : {}), ...body },
  });
  switch (shape) {
    case "seedance2_5":
      // Seedance 2.5: roughs at 480p, finals at 1080p, whole seconds, with its own sound (on unless turned off). A
      // clip whose camera it keeps goes as a reference video, beside the reference pictures and reference audio.
      return video({
        promptText: `${ask.prompt}${shown}${cameraLine(ask.camera, "The reference video")}${audio}`,
        ratio: sized(shape, ask),
        duration: whole(ask.seconds),
        ...references,
        ...(ask.camera ? { referenceVideos: [{ type: "video", uri: ask.camera.url }] } : {}),
        ...referenceAudio,
      });
    case "kling_4":
      // Kling 4.0: roughs at 720p, finals at 1080p, whole seconds, always with its own sound. From a picture it keeps
      // the picture's shape, and only the size is said.
      return video({ promptText: ask.prompt, ratio: ask.start ? (final ? "auto_1080p" : "auto_720p") : sized(shape, ask), duration: whole(ask.seconds) });
    case "kling2.5_turbo_pro":
      // Kling 2.5 Turbo Pro: 5 or 10 seconds. From a picture it keeps the picture's shape and takes no size.
      return video({ promptText: ask.prompt, duration: whole(ask.seconds), ...(ask.start ? {} : { ratio: sized(shape, ask) }) });
    case "kling3.0":
      // Kling 3.0 Pro, at 1080p. Its own sound is off: a cut's sound comes from its music, voice and effects, and
      // Runway charges less without it.
      return video({ promptText: ask.prompt, duration: whole(ask.seconds), audio: false, ...(ask.start ? {} : { ratio: sized(shape, ask) }) });
    case "wan3":
      // Wan 3.0: roughs at 480p, finals at 1080p, whole seconds, with its own sound and optional referenceAudio.
      return video({
        promptText: `${ask.prompt}${shown}${audio}`,
        ratio: ask.start ? (final ? "auto_1080p" : "auto_480p") : sized(shape, ask),
        duration: whole(ask.seconds),
        audio: true,
        ...references,
        ...referenceAudio,
      });
    case "hailuo3":
      // MiniMax H3: 768p (it makes 2K unless told), whole seconds, always with its own sound, optional referenceAudio.
      return video({
        promptText: `${ask.prompt}${shown}${audio}`,
        resolution: "768P",
        ratio: sized(shape, ask),
        duration: whole(ask.seconds),
        ...references,
        ...referenceAudio,
      });
    case "gemini_omni_flash_1.1":
      // Gemini Omni Flash 1.1: roughs at 360p, finals at 1080p, whole seconds, wide or tall only, even from a picture.
      return video({ promptText: ask.prompt, ratio: sized(shape, ask), duration: whole(ask.seconds) });
    case "nano_banana_2.1":
    case "gemini_2.5_flash":
      return still({});
    case "muse_image":
      return still({ outputFormat: "jpeg" });
    case "gpt_image_2_6":
      // GPT Image 2.6, at medium quality as on its other routes (Runway's own default is high, at up to three times the price).
      return still({ quality: "medium", outputFormat: "jpeg" });
    default:
      throw new Error(`beatsheet has no way to ask Runway for "${shape}" models yet`);
  }
}

/** Credits are a cent each. */
const usdOf = (cost: unknown): number | undefined => {
  const credits = (cost as { credits?: unknown } | undefined)?.credits;
  return typeof credits === "number" ? Math.round(credits * 100) / 10000 : undefined;
};

/**
 * Starts a task, and says the most it may cost. The task is kept in the shape fal's requests are (the URLs to follow
 * it by), so a saved job reads the same whichever service has it.
 */
export async function runwaySubmit(key: string, ask: RunwayAsk): Promise<{ remote: FalRequest; usd?: number }> {
  const r = await call(key, `/${ask.path}`, { method: "POST", body: JSON.stringify(ask.body) }, true);
  // Asked again, it would start (and charge for) another.
  if (typeof r.id !== "string") throw new FalError("Runway took the request but didn't say which task it started. Look at dev.runway.com before trying it again.", true);
  const url = `${API}/tasks/${r.id}`;
  return { remote: { id: r.id, status: url, response: url, cancel: url }, usd: usdOf(r.estimatedCost) };
}

/** Why a task failed, from Runway's code for it and its own words (which it says not to show bare). */
function failed(r: Body): string {
  const code = typeof r.failureCode === "string" ? r.failureCode : "";
  const what = /^(SAFETY\.INPUT|INPUT_PREPROCESSING\.SAFETY)/.test(code)
    ? "Runway's moderation turned down what it was asked or given, and charges for the take all the same"
    : code.startsWith("SAFETY.")
      ? "Runway's moderation turned down what it made"
      : code === "ASSET.INVALID"
        ? "Runway couldn't use one of the files it was given (its size, length or format)"
        : code.startsWith("THIRD_PARTY.")
          ? "The model's own service couldn't make it just now; it may later"
          : "Runway says the task failed";
  return typeof r.failure === "string" && r.failure ? `${what}: ${r.failure}` : what;
}

export type RunwayStatus = { state: "queued" } | { state: "running" } | { state: "done"; error?: string; url?: string; usd?: number };

/**
 * Where a task is, and once it's done what it made (the address is good for a day or two) and what it cost. A failed
 * one says what it cost too: nothing, unless moderation turned it down.
 */
export async function runwayStatus(key: string, req: FalRequest): Promise<RunwayStatus> {
  const r = await call(key, `/tasks/${req.id}`);
  // Held back by the account's limit on tasks at once (THROTTLED) is waiting like any other.
  if (r.status === "PENDING" || r.status === "THROTTLED") return { state: "queued" };
  if (r.status === "RUNNING") return { state: "running" };
  const usd = usdOf(r.cost);
  if (r.status === "SUCCEEDED") return { state: "done", url: (r.output as unknown[] | undefined)?.find((u): u is string => typeof u === "string"), usd };
  if (r.status === "FAILED") return { state: "done", error: failed(r), usd };
  if (r.status === "CANCELLED") return { state: "done", error: "Runway says the task was cancelled", usd };
  throw new FalError(`Runway said the task is ${String(r.status)}`, false);
}

/** Stops a task. One still waiting is refunded; one already running may finish and is charged, which is left as it is. */
export async function runwayCancel(key: string, req: FalRequest): Promise<void> {
  await call(key, `/tasks/${req.id}`, { method: "DELETE" }).catch(() => undefined);
}
