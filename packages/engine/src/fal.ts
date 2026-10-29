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

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime" };

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

/** A request in the terms every adapter understands; pictures are already URLs fal can fetch. */
export type FalAsk = { prompt: string; seconds?: number; aspect?: string; seed?: number; start?: string; end?: string; refs?: string[] };

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
    default:
      throw new Error(`beatsheet has no way to ask fal for "${shape}" models yet`);
  }
}

/** Whether a family of models takes a seed, so one can be chosen and recorded for each take. */
export const takesSeed = (shape: string) => shape === "nano-banana" || shape === "wan";

/** The file a finished request made: the first picture, or the video. */
export function falOutput(result: Record<string, unknown>): { url: string; contentType?: string; seed?: number } | undefined {
  const images = result.images as { url?: string; content_type?: string }[] | undefined;
  const video = result.video as { url?: string; content_type?: string } | undefined;
  const file = images?.[0] ?? video;
  if (!file?.url) return undefined;
  return { url: file.url, contentType: file.content_type, seed: typeof result.seed === "number" ? result.seed : undefined };
}
