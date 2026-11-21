/**
 * Tein's API: one endpoint takes every request and answers at once with a job, which is then followed until it's done.
 * Tein keeps the job under its id, so a job saved with that id can be picked up by another process after a restart.
 * Pictures a request needs (a start frame, references) go up to Tein's own storage first. The key is read inside the
 * engine and never passes through the agent.
 *
 * What makes Tein worth its own route: its Seedance keeps the real faces in the pictures it's given (`pass_faces`, on
 * unless it's turned off), where Seedance elsewhere refuses them. Its Creative mode is left off: it costs more, its
 * requests may be read by Tein's staff, and faces come through without it.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { cameraLine, FalError, type FalAsk, type FalRequest } from "./fal.ts";

const API = process.env.BEATSHEET_TEIN ?? "https://api.tein.ai/v1";

type Body = Record<string, unknown>;

/** Tein's code and words for a failure. Its errors are nested under `error`, except being out of credits, which is flat. */
function said(body: Body, status: number): { code: string; message: string } {
  const e = body.error;
  if (e && typeof e === "object") {
    const { code, message } = e as { code?: unknown; message?: unknown };
    return { code: typeof code === "string" ? code : "", message: typeof message === "string" ? message : `Tein answered ${status}` };
  }
  return { code: typeof body.code === "string" ? body.code : "", message: typeof e === "string" ? e : `Tein answered ${status}` };
}

const dollars = (n: unknown) => (typeof n === "number" ? `$${n.toFixed(2)}` : undefined);

/** A failure as the person should read it. Whether another try could go differently is the caller's to say. */
function problem(body: Body, status: number): FalError {
  const { code, message } = said(body, status);
  if (status === 401) return new FalError("Tein refused the key. The person can check it in Settings → Media services.", true);
  if (code === "insufficient_credits") {
    const need = dollars(body.required), have = dollars(body.balance);
    return new FalError(`Tein is out of credits${need && have ? `: this needs ${need} and the balance is ${have}` : ""}. The person can add more at app.tein.ai.`, true, true);
  }
  if (code === "key_limit_reached") return new FalError(`The Tein key has reached its own spending limit. The person can raise it at app.tein.ai. (${message})`, true, true);
  // Still being accepted under the same idempotency key, too many at once, or trouble on Tein's side: all pass.
  if (code === "request_in_progress" || status === 429 || status >= 500) return new FalError(`Tein is busy (${message}); trying again`, false);
  return new FalError(message, true);
}

async function call(key: string, path: string, init: RequestInit = {}): Promise<Body> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, ...(typeof init.body === "string" ? { "content-type": "application/json" } : {}), ...init.headers }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new FalError(`Couldn't reach Tein (${err instanceof Error ? err.message : String(err)})`, false);
  }
  const body = (await res.json().catch(() => ({}))) as Body;
  if (res.ok) return body;
  throw problem(body, res.status);
}

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };

/** Puts a picture (or a short clip) in Tein's storage and gives its URL, for inputs like a start frame. */
export async function teinUpload(key: string, file: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)], { type: TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" }), basename(file));
  const r = await call(key, "/uploads", { method: "POST", body: form });
  if (typeof r.url !== "string") throw new FalError(`Tein didn't say where it put ${basename(file)}`, false);
  return r.url;
}

/** Whole seconds, which is all Seedance makes. */
const whole = (seconds: number | undefined) => Math.ceil((seconds ?? 5) - 1e-6);

/**
 * Turns a request into a family of models' own inputs on Tein (from each model's API page there). `model` is Tein's id
 * for it, the route's endpoint.
 */
export function teinInput(shape: string, model: string, ask: FalAsk): Record<string, unknown> {
  switch (shape) {
    case "seedance-2.5": {
      // Seedance 2.5: roughs at 480p, finals at 1080p, whole seconds, with its own sound. A start frame (and an end
      // frame) can't be mixed with references there, and the board a take starts from already shows who's in it, so
      // references go only when there's no start frame. From a picture the clip keeps the picture's shape, and Tein
      // takes no other ratio then. Faces are kept (pass_faces) and Creative mode is off, both by leaving them unsaid.
      const refs = ask.start ? undefined : ask.refs;
      const shown = refs?.length ? ` ${refs.length === 1 ? "The reference picture shows" : `The ${refs.length} reference pictures show`} who and what is in it.` : "";
      const followed = cameraLine(ask.camera, "The reference video");
      return {
        model,
        prompt: `${ask.prompt}${shown}${followed}`,
        ...(ask.camera ? { reference_video: [ask.camera.url] } : {}),
        duration: whole(ask.seconds),
        resolution: ask.quality === "final" ? "1080p" : "480p",
        ratio: ask.start ? "adaptive" : (ask.aspect ?? "adaptive"),
        ...(ask.start ? { first_frame: ask.start } : {}),
        ...(ask.start && ask.end ? { last_frame: ask.end } : {}),
        ...(refs?.length ? { reference_image: refs } : {}),
      };
    }
    default:
      throw new Error(`beatsheet has no way to ask Tein for "${shape}" models yet`);
  }
}

/**
 * Sends a request. `once` (the job's own id) is its idempotency key: sent again after a crash or a dropped answer, Tein
 * gives the first request's job rather than making, and charging for, another. The job is kept in the shape fal's
 * requests are (the URLs to follow it by), so a saved job reads the same whichever service has it.
 */
export async function teinSubmit(key: string, input: Record<string, unknown>, once: string): Promise<FalRequest> {
  const r = await call(key, "/generate", { method: "POST", body: JSON.stringify({ ...input, idempotency_key: once }) });
  if (typeof r.id !== "string") throw new FalError("Tein didn't say which job it started", false);
  const url = `${API}/jobs/${r.id}`;
  return { id: r.id, status: url, response: url, cancel: url };
}

export type TeinStatus = { state: "queued" } | { state: "running" } | { state: "done"; error?: string; url?: string; usd?: number };

/** Where a job is, and once it's done what it made and what it cost (failed, expired and cancelled jobs cost nothing). */
export async function teinStatus(key: string, req: FalRequest): Promise<TeinStatus> {
  const r = await call(key, `/jobs/${req.id}`);
  if (r.status === "queued") return { state: "queued" };
  if (r.status === "running") return { state: "running" };
  if (r.status === "succeeded") {
    const file = (r.data as { url?: string }[] | undefined)?.[0];
    const cost = (r.usage as { cost?: unknown } | undefined)?.cost;
    return { state: "done", url: file?.url, usd: typeof cost === "number" ? cost : undefined };
  }
  if (r.status === "failed" || r.status === "expired" || r.status === "cancelled") {
    const { message } = said(r, 0);
    return { state: "done", error: r.error ? message : `Tein says the job ${r.status === "failed" ? "failed" : r.status === "expired" ? "ran out of time" : "was cancelled"}` };
  }
  throw new FalError(`Tein said the job is ${String(r.status)}`, false);
}

/** Drops a job that hasn't started. One that has started finishes and is billed, and Tein says so; that's left as it is. */
export async function teinCancel(key: string, req: FalRequest): Promise<void> {
  await call(key, `/jobs/${req.id}`, { method: "DELETE" }).catch(() => undefined);
}
