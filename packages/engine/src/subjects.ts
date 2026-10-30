/**
 * Subjects in the footage: finding faces and people and following them through a clip, following anything someone
 * boxes, and lifting subjects out of the picture as transparent cut-outs. These feed the effects that follow a subject
 * (a blurred face, a name tag, a spotlight, a reframe that keeps someone in a vertical crop) and cut-out shots (a
 * subject popping in, a title tucked behind someone).
 *
 * Apple's Vision framework does the work on this Mac through a small Swift helper (`native/vision.swift`), built with
 * the Xcode command line tools the first time it's needed. SAM can lift subjects out by description instead ("the dog",
 * "the red kite"): SAM 3 on this Mac once it's installed in Settings (`sam.ts`), or SAM 3.1 through fal with a key.
 *
 * On Windows, SAM 3.1 on the PC's NVIDIA card does all of it, clips included, with OpenCV finding faces and people
 * until it's installed (`subjects-windows.ts`).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import sharp from "sharp";
import { slugify, type Asset, type Rect, type SubjectTrack } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { alphaWebm } from "./media.ts";
import { swiftHelper } from "./native.ts";
import { assetPath, cachePaths } from "./paths.ts";
import { samReady, samSegment } from "./sam.ts";
import { getSecret } from "./settings.ts";
import { loadFile, updateFile } from "./store.ts";
import { toPng, windowsCutoutStill, windowsCutoutVideo, windowsFinder, windowsSubjects, windowsTrack, windowsVisionStatus } from "./subjects-windows.ts";

const run = promisify(execFile);
const WINDOWS = process.platform === "win32";
/** What finds subjects by itself (rather than someone boxing or joining them): found again, they're replaced. */
const FINDERS = new Set(["apple-vision", "sam-3.1", "opencv"]);

/** The Vision helper, built from source on first use (and again whenever the source changes). */
export const visionHelper = () => swiftHelper("vision");

/** Whether subjects and cut-outs are available here, without building anything. */
export async function visionStatus(): Promise<{ ok: boolean; detail: string }> {
  if (WINDOWS) return windowsVisionStatus();
  if (process.platform !== "darwin") return { ok: false, detail: "Needs a Mac" };
  try {
    await run("xcrun", ["--find", "swiftc"]);
    return { ok: true, detail: "Built in: Apple Vision on this Mac" };
  } catch {
    return { ok: false, detail: "Needs the Xcode Command Line Tools (xcode-select --install)" };
  }
}

type Progress = (fraction: number) => void;

/** Runs a helper command; resolves to its JSON output. Progress lines on stderr are passed on. */
async function helper<T>(args: string[], onProgress?: Progress): Promise<T> {
  const bin = await visionHelper();
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", lastError = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => {
      err += d;
      const lines = err.split("\n");
      err = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("progress ")) onProgress?.(Number(line.slice(9)));
        else if (line.startsWith("error ")) lastError = line.slice(6);
      }
    });
    p.on("close", (code) => {
      if (code !== 0) return fail(new Error(lastError || `the Vision helper stopped (${code})`));
      try {
        ok(JSON.parse(out) as T);
      } catch {
        fail(new Error("the Vision helper said something unreadable"));
      }
    });
  });
}

/** What the helper analyses: a video's small preview copy (same picture, much faster), or a photo itself. */
function analysable(id: string, a: Asset): string {
  const { doc, dir } = loadFile(id);
  const proxy = cachePaths(dir, a.id).proxy;
  return a.kind === "video" && existsSync(proxy) ? proxy : assetPath(doc, dir, a);
}

function assetOf(id: string, assetId: string): Asset {
  const a = loadFile(id).doc.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}" in ${id}`);
  if (a.kind !== "video" && a.kind !== "image") throw new Error(`"${assetId}" is ${a.kind}, not a picture`);
  return a;
}

const freeId = (base: string, taken: Set<string>) => {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
};

/**
 * Finds the faces and people in a clip or photo and follows each through the clip. Replaces what an earlier search
 * found (keeping their names where the same subject turns up again) and keeps subjects someone tracked by hand.
 */
export async function findSubjects(id: string, assetId: string, onProgress?: Progress): Promise<SubjectTrack[]> {
  const a = assetOf(id, assetId);
  const found = WINDOWS ? await windowsSubjects(analysable(id, a), a, onProgress) : await helper<{ tracks: { kind: "face" | "person"; samples: number[][] }[] }>(["subjects", analysable(id, a)], onProgress);
  const by = WINDOWS ? windowsFinder() : "apple-vision";
  let result: SubjectTrack[] = [];
  updateFile(id, (doc) => {
    const asset = doc.assets.find((x) => x.id === assetId)!;
    const kept = (asset.subjects ?? []).filter((s) => !FINDERS.has(s.by ?? ""));
    const old = (asset.subjects ?? []).filter((s) => !kept.includes(s));
    const taken = new Set(kept.map((s) => s.id));
    // Someone already followed by hand (boxed, or joined from pieces) isn't found again as a duplicate.
    found.tracks = found.tracks.filter((t) => !kept.some((k) => k.kind === t.kind && overlap(t.samples, k.samples) > 0.5));
    // A subject found again keeps its id and name, so effects and reframes that point at it still do.
    const matched = new Map<number, SubjectTrack>();
    found.tracks.forEach((t, i) => {
      const same = old.find((o) => o.kind === t.kind && !taken.has(o.id) && overlap(o.samples, t.samples) > 0.5);
      if (same) {
        matched.set(i, same);
        taken.add(same.id);
      }
    });
    // New ones take the lowest free number: Face 1, Face 2…
    const next = (kind: "face" | "person") => {
      let n = 1;
      while (taken.has(`${kind}-${n}`)) n++;
      taken.add(`${kind}-${n}`);
      return n;
    };
    const fresh = found.tracks.map((t, i): SubjectTrack => {
      const same = matched.get(i);
      if (same) return { ...same, by, samples: t.samples };
      const n = next(t.kind);
      return { id: `${t.kind}-${n}`, label: `${t.kind === "face" ? "Face" : "Person"} ${n}`, kind: t.kind, by, samples: t.samples };
    });
    asset.subjects = [...kept, ...fresh];
    if (!asset.subjects.length) delete asset.subjects;
    result = fresh;
  });
  // Faces in a clip whose voices are named (or the other way round) are the same people.
  const { followPeople } = await import("./heard.ts");
  await followPeople(id, [assetId]).catch(() => undefined);
  return result;
}

/**
 * Joins tracks of the same person or thing (someone who left the frame and came back) into one subject, keeping the
 * first one's id and name. Effects and reframes in every cut that pointed at the others point at it instead.
 */
export function joinSubjects(id: string, assetId: string, keep: string, others: string[]): SubjectTrack {
  let joined!: SubjectTrack;
  updateFile(id, (doc) => {
    const asset = doc.assets.find((x) => x.id === assetId);
    const k = asset?.subjects?.find((s) => s.id === keep);
    if (!asset || !k) throw new Error(`"${assetId}" has no subject "${keep}"`);
    const gone = asset.subjects!.filter((s) => others.includes(s.id) && s.id !== keep);
    if (!gone.length) throw new Error(`Nothing to join to "${keep}"`);
    // Where they overlap in time, the kept one's boxes win.
    const samples = [...k.samples];
    for (const g of gone) for (const x of g.samples) if (!samples.some((y) => Math.abs(y[0]! - x[0]!) < 0.05)) samples.push(x);
    k.samples = samples.sort((a, b) => a[0]! - b[0]!);
    // Joined by hand, so a new search leaves it be.
    if (FINDERS.has(k.by ?? "")) k.by = "joined";
    const ids = new Set(gone.map((g) => g.id));
    asset.subjects = asset.subjects!.filter((s) => !ids.has(s.id));
    for (const cut of doc.cuts)
      for (const s of cut.shots) {
        if (s.content.kind !== "clip" || s.content.asset !== assetId) continue;
        for (const e of s.content.effects ?? []) if (ids.has(e.subject)) e.subject = keep;
        for (const r of Object.values(s.content.reframe ?? {})) if (r.follow && ids.has(r.follow)) r.follow = keep;
      }
    joined = k;
  });
  return joined;
}

/** How much two tracks agree where they overlap in time: the share of samples whose boxes mostly coincide. */
function overlap(a: number[][], b: number[][]): number {
  let hits = 0, n = 0;
  for (const s of a) {
    const near = b.find((x) => Math.abs(x[0]! - s[0]!) < 0.15);
    if (!near) continue;
    n++;
    const ix = Math.max(0, Math.min(s[1]! + s[3]!, near[1]! + near[3]!) - Math.max(s[1]!, near[1]!));
    const iy = Math.max(0, Math.min(s[2]! + s[4]!, near[2]! + near[4]!) - Math.max(s[2]!, near[2]!));
    const inter = ix * iy, union = s[3]! * s[4]! + near[3]! * near[4]! - inter;
    if (union > 0 && inter / union > 0.4) hits++;
  }
  return n ? hits / n : 0;
}

/** Follows something boxed at `at` seconds through the clip, both ways, and keeps it as a subject (a new search leaves it be). */
export async function trackSubject(id: string, assetId: string, opts: { at: number; box: Rect; label: string; kind?: SubjectTrack["kind"] }, onProgress?: Progress): Promise<SubjectTrack> {
  const a = assetOf(id, assetId);
  const b = opts.box;
  let samples: number[][];
  if (a.kind === "image") samples = [[0, b.x, b.y, b.w, b.h]];
  else if (WINDOWS) samples = (await windowsTrack(analysable(id, a), a, opts.at, b, onProgress)).samples;
  else {
    const r = await helper<{ samples: number[][] }>(["track", analysable(id, a), "--at", String(opts.at), "--box", [b.x, b.y, b.w, b.h].join(",")], onProgress);
    samples = r.samples;
  }
  let track!: SubjectTrack;
  updateFile(id, (doc) => {
    const asset = doc.assets.find((x) => x.id === assetId)!;
    const taken = new Set((asset.subjects ?? []).map((s) => s.id));
    track = { id: freeId(slugify(opts.label) || "subject", taken), label: opts.label, kind: opts.kind ?? "object", by: "boxed", samples };
    asset.subjects = [...(asset.subjects ?? []), track];
  });
  return track;
}

export type CutOutOptions = {
  /** Who to lift: "people" (each person or everyone), or "subject" (whatever stands out: people, pets, things). */
  mode?: "people" | "subject";
  /** Lift just this subject (a subject id on the asset); for a clip, it's followed frame by frame. */
  subject?: string;
  /** For a photo or a still from a clip: lift what's at this point (0..1). */
  point?: { x: number; y: number };
  /** One cut-out per person or thing, largest first: the pieces for a piece-by-piece build. */
  each?: boolean;
  /** For a clip: a still cut-out of the frame at this second, instead of a cut-out clip. */
  still?: number;
  /** For a clip: the stretch to lift, in seconds of the source (default the whole clip, up to 30 seconds). */
  from?: number;
  to?: number;
  /**
   * Describe what to lift ("the dog", "the kids"), for a photo or a still from a clip (`still`). Uses SAM 3 on this Mac
   * when it's installed, otherwise SAM 3.1 through fal (photos only, needs a key).
   */
  prompt?: string;
};

/**
 * Lifts subjects out of a photo or clip into new transparent assets (PNG for pictures, WebM with alpha for clips),
 * saved in the project's `made/cutouts` folder. Each remembers what it was lifted from and where, so a cut-out shot
 * lines up over its source.
 */
export async function cutOut(id: string, assetId: string, opts: CutOutOptions = {}, onProgress?: Progress): Promise<Asset[]> {
  const a = assetOf(id, assetId);
  const { doc, dir } = loadFile(id);
  const original = assetPath(doc, dir, a);
  const out = join(dir, "made", "cutouts");
  mkdirSync(out, { recursive: true });
  const subject = opts.subject ? a.subjects?.find((s) => s.id === opts.subject) : undefined;
  if (opts.subject && !subject) throw new Error(`"${assetId}" has no subject "${opts.subject}"; find_subjects or track_subject first`);
  const mode = opts.mode ?? (subject ? (subject.kind === "object" ? "subject" : "people") : "people");
  const stamp = Date.now().toString(36);
  const name = `${assetId}-${subject ? subject.id : mode}-${stamp}`;
  const made = (label: string) =>
    WINDOWS
      ? { source: "synth" as const, provider: "sam-3.1", model: "sam3.1-multiplex", refs: [assetId], createdAt: new Date().toISOString(), prompt: label }
      : { source: "synth" as const, provider: "apple-vision", model: mode === "people" ? "person masks" : "foreground masks", refs: [assetId], createdAt: new Date().toISOString(), prompt: label };

  // By description: SAM on this Mac, or through fal.
  if (opts.prompt) {
    const prompt = opts.prompt.trim();
    // SAM 3.1 on a PC follows what it's told through a clip too: a moving cut-out by description.
    if (WINDOWS && samReady() && a.kind === "video" && opts.still === undefined) return clipCutOut(id, a, original, join(out, `${assetId}-${slugify(prompt).slice(0, 24) || "described"}-${stamp}.webm`), { mode, prompt, from: opts.from, to: opts.to, label: prompt }, made, onProgress);
    if (a.kind !== "image" && opts.still === undefined) throw new Error("Cut-outs by description work on photos and stills from a clip (pass `still`); for a moving cut-out, track the subject and cut that out.");
    if (samReady()) return localSamCutOut(id, a, original, join(out, `${assetId}-${slugify(prompt).slice(0, 24) || "described"}-${stamp}`), prompt, opts, onProgress);
    if (a.kind !== "image") throw new Error("Cut-outs by description from a clip need SAM 3 on this Mac: install it in Settings.");
    return samCutOut(id, a, original, join(out, name), prompt, !!opts.each);
  }

  // A photo, or one frame of a clip.
  if (a.kind === "image" || opts.still !== undefined) {
    if (WINDOWS) {
      const at = opts.still ?? 0;
      const box = opts.point || !subject ? undefined : subjectBox(subject, at);
      const r = await windowsCutoutStill(original, a.kind === "video" ? "video" : "image", { out: join(out, name), at, mode, point: opts.point, box, each: opts.each }, onProgress);
      return addCutouts(id, a, r.cutouts, subject?.label, made);
    }
    const args = ["cutout", original, "--out", join(out, name), "--mode", mode];
    if (opts.still !== undefined) args.push("--at", String(opts.still));
    const at = opts.still ?? 0;
    const box = subject ? subjectBox(subject, at) : undefined;
    if (opts.point) args.push("--point", `${opts.point.x},${opts.point.y}`);
    else if (box) args.push("--box", [box.x, box.y, box.w, box.h].join(","));
    else if (opts.each) args.push("--each");
    const r = await helper<{ cutouts: { file: string; box: Rect }[] }>(args, onProgress);
    const made_: Asset[] = [];
    for (const [i, c] of r.cutouts.entries()) {
      const label = `${subject?.label ?? a.label ?? a.id}${r.cutouts.length > 1 ? ` · piece ${i + 1}` : ""} (cut out)`;
      made_.push(await addAsset(id, c.file, { id: `${a.id}-cut`, label, tags: ["cutout", ...(a.tags ?? []).filter((t) => t !== "cutout")], provenance: made(label), cutout: { of: a.id, box: c.box } }));
    }
    return made_;
  }

  if (WINDOWS) return clipCutOut(id, a, original, join(out, `${name}.webm`), { mode, follow: subject && subject.samples.length > 1 ? subject.samples : undefined, from: opts.from, to: opts.to, label: subject?.label ?? a.label ?? a.id }, made, onProgress);

  // A clip: every frame, streamed from the helper straight into a VP9 encoder that keeps the alpha.
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(a.duration ?? Infinity, opts.to ?? from + 30);
  const file = join(out, `${name}.webm`);
  const args = ["cutout-video", original, "--mode", mode, "--from", String(from), "--to", String(to)];
  let followFile: string | undefined;
  if (subject && subject.samples.length > 1) {
    followFile = join(tmpdir(), `beatsheet-follow-${process.pid}-${stamp}.json`);
    writeFileSync(followFile, JSON.stringify(subject.samples));
    args.push("--follow", followFile);
  }
  try {
    const result = await encodeCutout(await visionHelper(), args, file, onProgress);
    const label = `${subject?.label ?? a.label ?? a.id} (cut out)`;
    return [await addAsset(id, file, { id: `${a.id}-cut`, label, tags: ["cutout", ...(a.tags ?? []).filter((t) => t !== "cutout")], provenance: made(label), cutout: { of: a.id, box: result.box, from } })];
  } finally {
    if (followFile) rmSync(followFile, { force: true });
  }
}

/** Cut-outs made on Windows, added as assets the way the Mac's are. */
async function addCutouts(id: string, a: Asset, cutouts: { file: string; box: Rect }[], subjectLabel: string | undefined, made: (label: string) => Asset["provenance"]): Promise<Asset[]> {
  const added: Asset[] = [];
  for (const [i, c] of cutouts.entries()) {
    const label = `${subjectLabel ?? a.label ?? a.id}${cutouts.length > 1 ? ` · piece ${i + 1}` : ""} (cut out)`;
    added.push(await addAsset(id, c.file, { id: `${a.id}-cut`, label, tags: ["cutout", ...(a.tags ?? []).filter((t) => t !== "cutout")], provenance: made(label), cutout: { of: a.id, box: c.box } }));
  }
  return added;
}

/** A moving cut-out on Windows, by SAM 3.1: someone followed before, what a prompt describes, or people. */
async function clipCutOut(
  id: string,
  a: Asset,
  original: string,
  file: string,
  opts: { mode: "people" | "subject"; follow?: number[][]; prompt?: string; from?: number; to?: number; label: string },
  made: (label: string) => Asset["provenance"],
  onProgress?: Progress,
): Promise<Asset[]> {
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(a.duration ?? Infinity, opts.to ?? from + 30);
  const result = await windowsCutoutVideo(original, a, { file, from, to, mode: opts.mode, follow: opts.follow, prompt: opts.prompt }, onProgress);
  const label = `${opts.label} (cut out)`;
  return [await addAsset(id, file, { id: `${a.id}-cut`, label, tags: ["cutout", ...(a.tags ?? []).filter((t) => t !== "cutout")], provenance: made(label), cutout: { of: a.id, box: result.box, from } })];
}

function subjectBox(s: SubjectTrack, t: number): Rect | undefined {
  let best: number[] | undefined;
  for (const x of s.samples) if (!best || Math.abs(x[0]! - t) < Math.abs(best[0]! - t)) best = x;
  return best ? { x: best[1]!, y: best[2]!, w: best[3]!, h: best[4]! } : undefined;
}

/** helper (raw RGBA on stdout) → ffmpeg (VP9 with alpha). Resolves to the helper's summary. */
function encodeCutout(bin: string, args: string[], file: string, onProgress?: Progress): Promise<{ box?: Rect; frames: number }> {
  return new Promise((ok, fail) => {
    const tmp = `${file}.part.webm`;
    const h = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let enc: ReturnType<typeof spawn> | undefined;
    let buf = "", lastError = "", result: { box?: Rect; frames: number } | undefined;
    let encErr = "";
    h.stderr.on("data", (d) => {
      buf += d;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("progress ")) onProgress?.(Number(line.slice(9)) * 0.98);
        else if (line.startsWith("error ")) lastError = line.slice(6);
        else if (line.startsWith("result ")) {
          const r = JSON.parse(line.slice(7)) as { box: Partial<Rect>; frames: number };
          result = { box: r.box.x !== undefined ? (r.box as Rect) : undefined, frames: r.frames };
        } else if (line.startsWith("size ")) {
          const [wh, fps] = line.slice(5).split(" ");
          const [ffmpeg, ...encode] = alphaWebm(wh!, fps!, tmp);
          enc = spawn(ffmpeg!, encode, {
            stdio: ["pipe", "ignore", "pipe"],
          });
          enc.stderr!.on("data", (e) => (encErr += e));
          h.stdout.pipe(enc.stdin!);
        }
      }
    });
    h.on("close", (code) => {
      if (code !== 0) {
        enc?.kill();
        rmSync(tmp, { force: true });
        return fail(new Error(lastError || `the Vision helper stopped (${code})`));
      }
      if (!enc) return fail(new Error("nothing to cut out in that stretch"));
      enc.on("close", (ecode) => {
        if (ecode !== 0 || !result?.frames) {
          rmSync(tmp, { force: true });
          return fail(new Error(encErr.trim().split("\n").pop() || "encoding the cut-out failed"));
        }
        renameSync(tmp, file);
        onProgress?.(1);
        ok(result);
      });
    });
  });
}

/** Picture formats the SAM worker reads as they are; anything else (HEIC, RAW) is converted first. */
const READABLE = /\.(jpe?g|png|webp|tiff?|bmp)$/i;

/**
 * SAM 3 on this Mac: cuts out what the prompt describes from a photo, or from one frame of a clip (taken from the
 * original file at full quality). Each piece is the full picture's size, so it lines up over its source.
 */
async function localSamCutOut(id: string, a: Asset, original: string, outBase: string, prompt: string, opts: CutOutOptions, onProgress?: Progress): Promise<Asset[]> {
  const tmp = join(tmpdir(), `beatsheet-sam-${process.pid}-${Date.now().toString(36)}.png`);
  try {
    let picture = original;
    if (a.kind === "video") {
      await run("ffmpeg", ["-v", "error", "-y", "-ss", String(opts.still ?? 0), "-i", original, "-frames:v", "1", tmp]);
      picture = tmp;
    } else if (!READABLE.test(original)) {
      if (WINDOWS) await toPng(original, tmp);
      else await run("sips", ["-s", "format", "png", original, "--out", tmp]);
      picture = tmp;
    }
    onProgress?.(0.1);
    const pieces = await samSegment(picture, prompt, outBase, { each: opts.each });
    onProgress?.(0.9);
    if (!pieces.length) throw new Error(`SAM didn't find anything matching "${prompt}"${a.kind === "video" ? ` at ${opts.still ?? 0}s` : ""}. Try describing it another way.`);
    const made: Asset[] = [];
    for (const [i, c] of pieces.entries()) {
      const label = `${prompt}${pieces.length > 1 ? ` · piece ${i + 1}` : ""} (cut out)`;
      made.push(
        await addAsset(id, c.file, {
          id: `${a.id}-cut`,
          label,
          tags: ["cutout", ...(a.tags ?? []).filter((t) => t !== "cutout")],
          provenance: { source: "synth", provider: WINDOWS ? "sam-3.1" : "sam-3-mlx", model: WINDOWS ? "sam3.1-multiplex" : "sam3-image", prompt, refs: [a.id], createdAt: new Date().toISOString() },
          cutout: { of: a.id, box: c.box },
        }),
      );
    }
    return made;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * SAM 3.1 through fal (untested without a key here): segments a photo from a text prompt, then each mask becomes the
 * alpha of the photo.
 */
async function samCutOut(id: string, a: Asset, original: string, outBase: string, prompt: string, each: boolean): Promise<Asset[]> {
  const key = await getSecret("fal");
  if (!key) throw new Error("Cut-outs by description use SAM 3.1 through fal: add a fal key in Settings.");
  const photo = await sharp(original).rotate().resize({ width: 1536, height: 1536, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
  const meta = await sharp(photo).metadata();
  const res = await fetch("https://fal.run/fal-ai/sam-3/image", {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      image_url: `data:image/jpeg;base64,${photo.toString("base64")}`,
      prompt,
      apply_mask: false,
      return_multiple_masks: each,
      max_masks: each ? 8 : 1,
      include_boxes: true,
      output_format: "png",
      sync_mode: true,
    }),
  });
  if (!res.ok) throw new Error(`fal said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { masks?: { url: string }[]; boxes?: number[][] };
  if (!body.masks?.length) throw new Error(`SAM found nothing matching "${prompt}"`);
  const made: Asset[] = [];
  for (const [i, m] of body.masks.entries()) {
    const maskBuf = m.url.startsWith("data:") ? Buffer.from(m.url.split(",")[1]!, "base64") : Buffer.from(await (await fetch(m.url)).arrayBuffer());
    const alpha = await sharp(maskBuf).resize(meta.width, meta.height).greyscale().extractChannel(0).toBuffer();
    const file = `${outBase}${body.masks.length > 1 ? `-${i + 1}` : ""}.png`;
    await sharp(photo).ensureAlpha().joinChannel(alpha).png().toFile(file);
    // fal gives boxes as normalized centre x, centre y, width, height.
    const b = body.boxes?.[i];
    const box = b && b.length === 4 ? { x: b[0]! - b[2]! / 2, y: b[1]! - b[3]! / 2, w: b[2]!, h: b[3]! } : undefined;
    const label = `${prompt}${body.masks.length > 1 ? ` ${i + 1}` : ""} (cut out)`;
    made.push(await addAsset(id, file, { id: `${a.id}-cut`, label, tags: ["cutout"], provenance: { source: "synth", provider: "fal", model: "sam-3", prompt, refs: [a.id], createdAt: new Date().toISOString() }, cutout: { of: a.id, box } }));
  }
  return made;
}
