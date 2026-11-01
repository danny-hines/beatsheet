/**
 * ComfyUI, on this computer or another one on the network: workflows beatsheet runs on the person's own graphics card
 * (SCAIL-2, which copies the movement in a clip onto the people in a picture). A workflow is ComfyUI's API export
 * (File → Export (API)) with the nodes beatsheet fills titled STUDIO_*: the picture, the clip to follow, the seed, the
 * size, the prompt and the output. The ones that ship are in packages/engine/comfy; the person's own exports, in the
 * comfy folder beside beatsheet's settings, take their place.
 *
 * beatsheet makes the prompt id itself and saves it on the job before sending, so a restarted engine follows the same
 * render rather than queueing another, and a restarted ComfyUI (which forgets its queue) is sent the saved prompt
 * again. Written against ComfyUI 0.39's own API: /prompt, /api/jobs, /history, /queue, /view and /upload/image.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Quality } from "@beatsheet/schema";
import { FalError } from "./fal.ts";
import { REPO } from "./paths.ts";
import { SETTINGS_DIR, readSettings, updateSettings } from "./settings.ts";

const exec = promisify(execFile);

/** Where ComfyUI is when nobody has said otherwise: its own default, on this computer. */
export const COMFY_DEFAULT = "http://127.0.0.1:8188";

/** The workflows that ship with beatsheet, and the person's own exports, which take their place. */
const BUILT_IN = join(REPO, "packages", "engine", "comfy");
export const OWN_WORKFLOWS = join(SETTINGS_DIR, "comfy");

/**
 * Each workflow beatsheet knows, by the catalog endpoint that names it: the size it makes (about this many pixels, both
 * sides a multiple of `multiple`), and how its frames go, `first` in the first chunk and `extend` more in each after.
 */
export const WORKFLOWS: Record<string, { label: string; area: number; multiple: number; first: number; extend: number; fps: number }> = {
  "scail2-animation": { label: "SCAIL-2", area: 704 * 1280, multiple: 32, first: 81, extend: 76, fps: 30 },
};

/** full: no distill LoRA and more steps, for finals; fast: a few steps, for roughs. */
export const PROFILES = ["full", "fast"] as const;
export type Profile = (typeof PROFILES)[number];

/** Marker title → { node class: the input beatsheet sets }. A marker may sit on several nodes; every one is set. */
const MARKERS: Record<string, Record<string, string>> = {
  STUDIO_REF_IMAGE: { LoadImage: "image" },
  STUDIO_DRIVING_VIDEO: { LoadVideo: "file", VHS_LoadVideo: "video" },
  STUDIO_SEED: { PrimitiveInt: "value", KSampler: "seed", SamplerCustom: "noise_seed", RandomNoise: "noise_seed" },
  STUDIO_STEPS: { PrimitiveInt: "value", KSampler: "steps", BasicScheduler: "steps" },
  STUDIO_CFG: { PrimitiveFloat: "value", KSampler: "cfg", SamplerCustom: "cfg" },
  STUDIO_PROMPT: { PrimitiveStringMultiline: "value", PrimitiveString: "value", CLIPTextEncode: "text" },
  STUDIO_WIDTH: { PrimitiveInt: "value" },
  STUDIO_HEIGHT: { PrimitiveInt: "value" },
  STUDIO_FPS: { PrimitiveFloat: "value", PrimitiveInt: "value", CreateVideo: "fps" },
  STUDIO_OUTPUT: { SaveVideo: "filename_prefix", VHS_VideoCombine: "filename_prefix" },
};

/** Loader inputs that name a model file, and the /models folder that has to list it. */
const LOADER_FOLDERS: Record<string, string> = {
  "UNETLoader.unet_name": "diffusion_models",
  "LoraLoaderModelOnly.lora_name": "loras",
  "LoraLoader.lora_name": "loras",
  "CLIPLoader.clip_name": "text_encoders",
  "CLIPVisionLoader.clip_name": "clip_vision",
  "VAELoader.vae_name": "vae",
  "CheckpointLoaderSimple.ckpt_name": "checkpoints",
};

export type ComfyNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
export type ComfyPrompt = Record<string, ComfyNode>;

// ---- Workflows.

/** The workflow file for a profile: the person's own export first, then the one that ships. */
export function workflowPath(name: string, profile: Profile): string | undefined {
  for (const dir of [OWN_WORKFLOWS, BUILT_IN]) {
    const file = join(dir, `${name}.${profile}.api.json`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

/** The profile a take of this quality is made with: fast for roughs and full for finals, else whichever there is. */
export function profileFor(name: string, quality: Quality | undefined): Profile | undefined {
  const order: Profile[] = quality === "final" ? ["full", "fast"] : ["fast", "full"];
  return order.find((p) => workflowPath(name, p));
}

export function loadWorkflow(file: string): ComfyPrompt {
  const w = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if ("nodes" in w && "links" in w) throw new FalError(`${basename(file)} is a ComfyUI workflow in its UI format; export it with File → Export (API)`, true);
  return w as ComfyPrompt;
}

export const nodesTitled = (prompt: ComfyPrompt, title: string) => Object.keys(prompt).filter((id) => prompt[id]!._meta?.title === title);

/** How many chunks a workflow can make: its STUDIO_OUTPUT_<k> outputs, or one for a single STUDIO_OUTPUT. */
export function chunksIn(prompt: ComfyPrompt): number {
  const ks = Object.values(prompt).flatMap((n) => {
    const m = /^STUDIO_OUTPUT_(\d+)$/.exec(n._meta?.title ?? "");
    return m ? [Number(m[1])] : [];
  });
  return ks.length ? Math.max(...ks) : 1;
}

/** The output marker for a clip of `chunks` chunks: STUDIO_OUTPUT_<k> where the workflow has one, else STUDIO_OUTPUT. */
export const outputMarker = (prompt: ComfyPrompt, chunks: number) => (nodesTitled(prompt, `STUDIO_OUTPUT_${chunks}`).length ? `STUDIO_OUTPUT_${chunks}` : "STUDIO_OUTPUT");

/** How many chunks a clip of `frames` frames needs, and the frames they hold (the clip is padded out to that). */
export function chunksFor(frames: number, first: number, extend: number): { chunks: number; capacity: number } {
  const chunks = 1 + Math.max(0, Math.ceil((frames - first) / extend));
  return { chunks, capacity: first + extend * (chunks - 1) };
}

const isLink = (v: unknown) => Array.isArray(v) && v.length === 2 && typeof v[0] === "string";
const baseOf = (marker: string) => (marker.startsWith("STUDIO_OUTPUT") ? "STUDIO_OUTPUT" : marker);

/**
 * A copy of the workflow with every marked node set. Markers the workflow doesn't have are skipped; a marker on a node
 * beatsheet can't fill, or on an input wired to another node, is refused.
 */
export function fill(workflow: ComfyPrompt, values: Record<string, unknown>): ComfyPrompt {
  const prompt = structuredClone(workflow);
  for (const [marker, value] of Object.entries(values)) {
    for (const id of nodesTitled(prompt, marker)) {
      const node = prompt[id]!;
      const input = MARKERS[baseOf(marker)]?.[node.class_type];
      if (!input) throw new FalError(`The workflow's ${marker} is on a ${node.class_type} node (#${id}), which beatsheet can't fill`, true);
      if (isLink(node.inputs[input])) throw new FalError(`The workflow's ${marker} (#${id}) is wired to another node; title the node it comes from instead`, true);
      node.inputs[input] = value;
    }
  }
  return prompt;
}

/** What's wrong with an exported workflow for beatsheet, if anything. */
export function checkWorkflow(prompt: ComfyPrompt): string[] {
  const problems: string[] = [];
  for (const marker of ["STUDIO_REF_IMAGE", "STUDIO_DRIVING_VIDEO"]) if (nodesTitled(prompt, marker).length !== 1) problems.push(`needs exactly one node titled ${marker}`);
  if (!Object.values(prompt).some((n) => n._meta?.title?.startsWith("STUDIO_OUTPUT"))) problems.push("needs a SaveVideo titled STUDIO_OUTPUT");
  for (const [id, n] of Object.entries(prompt)) {
    const title = n._meta?.title ?? "";
    if (!title.startsWith("STUDIO_")) continue;
    const input = MARKERS[baseOf(title)]?.[n.class_type];
    if (!input) problems.push(`${title} is on a ${n.class_type} node (#${id}), which beatsheet can't fill`);
    else if (isLink(n.inputs[input])) problems.push(`${title} (#${id}) is wired to another node; title the node it comes from instead`);
  }
  return problems;
}

/** Node types and model files the server doesn't have. `hasNode` and `files` answer from it; undefined is "couldn't tell". */
export async function missingOn(prompt: ComfyPrompt, hasNode: (cls: string) => Promise<boolean | undefined>, files: (folder: string) => Promise<Set<string> | undefined>): Promise<string[]> {
  const problems: string[] = [];
  for (const cls of [...new Set(Object.values(prompt).map((n) => n.class_type))].sort()) if ((await hasNode(cls)) === false) problems.push(`node type ${cls} isn't installed`);
  const seen = new Set<string>();
  for (const n of Object.values(prompt)) {
    for (const [name, value] of Object.entries(n.inputs)) {
      const folder = LOADER_FOLDERS[`${n.class_type}.${name}`];
      if (!folder || typeof value !== "string" || seen.has(`${folder}/${value}`)) continue;
      seen.add(`${folder}/${value}`);
      const have = await files(folder);
      // Windows lists a model in a subfolder with a backslash; compare them the same way.
      if (have && !have.has(value.replaceAll("\\", "/"))) problems.push(`model ${folder}/${value} is missing`);
    }
  }
  return problems;
}

// ---- The server.

/** The address the person connected, or none. */
export const comfyUrl = () => readSettings().comfy?.url;

async function call(base: string, path: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  try {
    return await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(init.timeout ?? 30_000) });
  } catch (err) {
    throw new FalError(`ComfyUI at ${base} isn't answering: is it running? (${err instanceof Error ? err.message : String(err)})`, false);
  }
}

async function json<T>(base: string, path: string, init?: RequestInit & { timeout?: number }): Promise<T> {
  const res = await call(base, path, init);
  if (!res.ok) throw new FalError(`ComfyUI answered ${res.status} to ${path}`, res.status < 500);
  return (await res.json()) as T;
}

export type ComfyHealth = { ok: boolean; detail: string; gpu?: string; vramGb?: number; version?: string };

/** What it runs on: a graphics card (and which), or only the processor, which SCAIL-2 can't use. */
export async function comfyHealth(base: string): Promise<ComfyHealth> {
  const j = await json<{ system?: { comfyui_version?: string }; devices?: { name?: string; type?: string; vram_total?: number }[] }>(base, "/system_stats", { timeout: 5000 });
  const dev = j.devices?.[0];
  const gpu = (dev?.name ?? "").replace(/^cuda:\d+\s*/, "").split(" : ")[0]!.trim();
  const vramGb = dev?.vram_total ? Math.round((dev.vram_total / 2 ** 30) * 10) / 10 : undefined;
  const version = j.system?.comfyui_version;
  const parts = [gpu, vramGb && `${vramGb} GB`, version && `ComfyUI ${version}`].filter(Boolean).join(" · ");
  if (dev?.type !== "cuda") return { ok: false, detail: `ComfyUI is running on the processor, not a graphics card${parts ? ` (${parts})` : ""}`, gpu, vramGb, version };
  return { ok: true, detail: parts, gpu, vramGb, version };
}

/** What the server is missing for a filled workflow, checked before sending so a missing model reads as that. */
export async function comfyMissing(base: string, prompt: ComfyPrompt): Promise<string[]> {
  const listed = new Map<string, Promise<Set<string> | undefined>>();
  return missingOn(
    prompt,
    async (cls) => {
      const res = await call(base, `/object_info/${encodeURIComponent(cls)}`);
      return res.ok ? cls in ((await res.json()) as Record<string, unknown>) : undefined;
    },
    (folder) => {
      if (!listed.has(folder))
        listed.set(
          folder,
          call(base, `/models/${folder}`).then(async (r) => (r.ok ? new Set(((await r.json()) as string[]).map((f) => f.replaceAll("\\", "/"))) : undefined)),
        );
      return listed.get(folder)!;
    },
  );
}

/** Puts a picture or a clip in ComfyUI's input folder (both go through /upload/image); gives the name nodes load it by. */
export async function comfyUpload(base: string, file: string, name: string): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([readFileSync(file)]), name);
  form.append("type", "input");
  form.append("subfolder", "beatsheet");
  form.append("overwrite", "true");
  const res = await call(base, "/upload/image", { method: "POST", body: form, timeout: 5 * 60_000 });
  if (res.status === 413) throw new FalError(`${name} is bigger than ComfyUI takes (start it with a larger --max-upload-size)`, true);
  if (!res.ok) throw new FalError(`ComfyUI didn't take ${name} (${res.status})`, res.status < 500);
  const j = (await res.json()) as { name: string; subfolder?: string };
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

/** Queues a filled workflow under our own id; only the `targets` outputs (and what they need) run. */
export async function comfySubmit(base: string, prompt: ComfyPrompt, id: string, targets: string[]): Promise<void> {
  const res = await call(base, "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, prompt_id: id, client_id: "beatsheet", partial_execution_targets: targets }) });
  const j = (await res.json().catch(() => ({}))) as { error?: { type?: string; message?: string; details?: string }; node_errors?: Record<string, { class_type?: string; errors?: { message?: string; details?: string }[] }> };
  const nodeErrors = Object.entries(j.node_errors ?? {});
  if (res.ok && !nodeErrors.length) return;
  if (res.status >= 500) throw new FalError(`ComfyUI answered ${res.status}; trying again`, false);
  const said = [
    j.error && [j.error.message, j.error.details].filter(Boolean).join(": "),
    ...nodeErrors.flatMap(([nid, e]) => (e.errors ?? []).map((x) => `node ${nid} (${e.class_type}): ${[x.message, x.details].filter(Boolean).join(": ")}`)),
  ].filter(Boolean);
  throw new FalError(`ComfyUI refused the workflow: ${said.join("; ").slice(0, 1200) || res.status}`, true);
}

export type ComfyJob = { status: "pending" | "in_progress" | "completed" | "failed" | "cancelled"; execution_error?: { node_type?: string; node_id?: string; exception_type?: string; exception_message?: string } };

/** Where a job is, or undefined when ComfyUI doesn't know it (it restarted, or it was never sent). */
export async function comfyJob(base: string, id: string): Promise<ComfyJob | undefined> {
  const res = await call(base, `/api/jobs/${id}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new FalError(`ComfyUI answered ${res.status} about the job`, false);
  return (await res.json()) as ComfyJob;
}

/** How many jobs are ahead of this one: the one running, and those queued before it. */
export async function comfyAhead(base: string, id: string): Promise<number | undefined> {
  const q = await json<{ queue_running?: unknown[][]; queue_pending?: unknown[][] }>(base, "/queue");
  const pending = [...(q.queue_pending ?? [])].sort((a, b) => Number(a[0]) - Number(b[0])).map((x) => x[1]);
  const i = pending.indexOf(id);
  return i === -1 ? undefined : i + (q.queue_running?.length ?? 0);
}

/** Dequeues the job, or stops it if it's the one running; never anything else. */
export async function comfyCancel(base: string, id: string): Promise<void> {
  const res = await call(base, `/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => undefined);
  if (res?.status !== 404) return;
  // A server older than its jobs API.
  await call(base, "/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delete: [id] }) }).catch(() => undefined);
  await call(base, "/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt_id: id }) }).catch(() => undefined);
}

type SavedFile = { filename: string; subfolder?: string; type?: string };

/** The video a finished job saved on the given output nodes: SaveVideo lists it under images, VHS under gifs. */
export async function comfyVideo(base: string, id: string, outputs: string[]): Promise<SavedFile | undefined> {
  const h = await json<Record<string, { outputs?: Record<string, Record<string, unknown>> }>>(base, `/history/${id}`);
  const found = outputs.flatMap((nid) =>
    Object.values(h[id]?.outputs?.[nid] ?? {}).flatMap((items) => (Array.isArray(items) ? (items as SavedFile[]).filter((x) => /\.(mp4|webm|mov|mkv)$/i.test(x?.filename ?? "") && (x.type ?? "output") === "output") : [])),
  );
  return found.at(-1);
}

export async function comfyDownload(base: string, file: SavedFile, dest: string): Promise<void> {
  const q = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" });
  const res = await call(base, `/view?${q}`, { timeout: 10 * 60_000 });
  if (!res.ok) throw new FalError(`Couldn't fetch the take from ComfyUI (${res.status})`, res.status === 404);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(`${dest}.part`, Buffer.from(await res.arrayBuffer()));
  renameSync(`${dest}.part`, dest);
}

// ---- Checking the server against the workflows, for Settings.

export type ComfyCheck = ComfyHealth & { workflows: { name: string; label: string; profile: Profile; own: boolean; problems: string[] }[] };

/** The workflows there are here, each with what the server would be missing to run it (when it can be asked). */
export async function checkComfy(base: string | undefined): Promise<ComfyCheck> {
  const health = base ? await comfyHealth(base).catch((err: unknown) => ({ ok: false, detail: err instanceof Error ? err.message : String(err) })) : { ok: false, detail: "Not connected" };
  const workflows: ComfyCheck["workflows"] = [];
  for (const [name, spec] of Object.entries(WORKFLOWS)) {
    for (const profile of PROFILES) {
      const file = workflowPath(name, profile);
      if (!file) continue;
      let problems: string[];
      try {
        const w = loadWorkflow(file);
        problems = checkWorkflow(w);
        if (!problems.length && base && health.ok) problems = await comfyMissing(base, w);
      } catch (err) {
        problems = [err instanceof Error ? err.message : String(err)];
      }
      workflows.push({ name, label: spec.label, profile, own: file.startsWith(OWN_WORKFLOWS), problems });
    }
  }
  return { ...health, workflows };
}

/** Checks a server and, only if it answers from a graphics card, keeps its address. */
export async function connectComfy(url: string): Promise<ComfyCheck> {
  const base = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(base)) return { ok: false, detail: `That doesn't look like ComfyUI's address (${COMFY_DEFAULT})`, workflows: [] };
  const check = await checkComfy(base);
  if (check.ok) updateSettings((s) => void (s.comfy = { url: base, addedAt: new Date().toISOString(), detail: check.detail, ok: true }));
  return check;
}

/** Checks the connected server again, and keeps what it said. */
export async function recheckComfy(): Promise<ComfyCheck> {
  const check = await checkComfy(comfyUrl());
  updateSettings((s) => s.comfy && Object.assign(s.comfy, { detail: check.detail, ok: check.ok }));
  return check;
}

export const disconnectComfy = () => updateSettings((s) => void delete s.comfy);

// ---- Fitting what goes in, and trimming what comes out.

/** The size to make: the picture's shape at about `area` pixels, both sides a multiple of `multiple`. */
export function fitSize(width: number, height: number, area: number, multiple: number): { width: number; height: number } {
  const k = Math.sqrt(area / (width * height));
  const side = (x: number) => Math.max(multiple, Math.round((x * k) / multiple) * multiple);
  return { width: side(width), height: side(height) };
}

const cover = (w: number, h: number) => `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`;

/** The picture, scaled to cover the size and cropped to it. */
export async function fitPicture(src: string, dest: string, w: number, h: number): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  await exec("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", cover(w, h), "-frames:v", "1", dest]);
}

/**
 * A stretch of a clip at the size and frame rate the workflow makes, its last frame held out to `frames` so no chunk
 * runs short (the take is trimmed back afterwards). No sound.
 */
export async function fitClip(src: string, dest: string, from: number, to: number, w: number, h: number, fps: number, frames: number): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const vf = `${cover(w, h)},fps=${fps},tpad=stop_mode=clone:stop=${frames}`;
  // The stretch is cut from what's read (-t before -i), so the padding after it isn't cut off too.
  await exec("ffmpeg", ["-v", "error", "-y", "-ss", from.toFixed(3), "-t", (to - from).toFixed(3), "-i", src, "-vf", vf, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", dest]);
}

/** The take back to the stretch's own length: padding and the last chunk's overshoot come off the end. */
export async function trimTake(src: string, dest: string, fps: number, frames: number): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  await exec("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", `fps=${fps}`, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${dest}.tmp.mp4`]);
  renameSync(`${dest}.tmp.mp4`, dest);
}
