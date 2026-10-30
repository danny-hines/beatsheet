/**
 * Restoring a stretch of old footage, faithfully: the same frames made cleaner, steadier, sharper and smoother, never
 * made up. Each step is optional: less noise (ffmpeg), a steadier camera (ffmpeg's vid.stab, each shot steadied on its
 * own so a cut starts it over), frames made in between (RIFE here), and bigger (Real-ESRGAN here, or SeedVR2 on fal).
 * It works a piece at a time (a shot, or 20 seconds of one) in the project's .cache, so a restore stopped by a
 * restart picks up where it was. What it makes is a version of the clip (`version: { of, from }`), in step with it:
 * a clip shot can show it in the clip's place (content.version) and keeps the clip's sound, subjects and words.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { resolveTimeline, restoredSize, restoreWords, versionAt, type Asset, type FixerChoice, type RestoreSteps } from "@beatsheet/schema";
import { soundFile } from "./clean.ts";
import { pickFixer } from "./clean.ts";
import { FalError, falResult, falStatus, falSubmit, falUpload, type FalRequest } from "./fal.ts";
import { runFrames, runUpscale, toolReady } from "./fixtools.ts";
import { addAsset } from "./ingest.ts";
import { assertSpendable } from "./make.ts";
import { assetPath, projectDir } from "./paths.ts";
import { getSecret } from "./settings.ts";
import { cutsIn } from "./shotsplit.ts";
import { recordSpend } from "./spend.ts";
import { loadProject, updateProject } from "./store.ts";

const exec = promisify(execFile);
const SEEDVR = "fal-ai/seedvr/upscale/video";

/** A piece no longer than this, unless steadying needs the whole shot in one. */
const LONGEST = 20;

let stab: Promise<boolean> | undefined;
/** Whether this ffmpeg has vid.stab (two passes, much steadier); otherwise its own deshake does it in one. */
const hasVidstab = () => (stab ??= exec("ffmpeg", ["-hide_banner", "-filters"]).then((r) => /vidstabdetect/.test(r.stdout), () => false));

const DENOISE = { light: "hqdn3d=2:1.5:3:2.5", strong: "nlmeans=s=3:p=7:r=15" } as const;

/** The pieces of a stretch: at its cuts (moments from split_at_cuts, else found now), and no longer than LONGEST unless steadying. */
export function piecesOf(from: number, to: number, cuts: number[], steady: boolean): [number, number][] {
  const inside = [...new Set(cuts)].filter((c) => c > from + 0.2 && c < to - 0.2).sort((a, b) => a - b);
  const bounds = [from, ...inside, to];
  const out: [number, number][] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const [s, e] = [bounds[i]!, bounds[i + 1]!];
    const n = steady ? 1 : Math.max(1, Math.ceil((e - s) / LONGEST));
    for (let k = 0; k < n; k++) out.push([s + ((e - s) * k) / n, s + ((e - s) * (k + 1)) / n]);
  }
  return out;
}

export type RestoreOpts = {
  /** The stretch of the clip, in seconds; default all of it. */
  from?: number;
  to?: number;
  steps: RestoreSteps;
  /** realesrgan or seedvr; default Auto. */
  upscaleWith?: string;
  /** Show it in the cut's clip shots of this clip that it covers. */
  use?: { cut?: string };
  spendable?: number;
  onProgress?: (f: number, stage?: string) => void;
  signal?: AbortSignal;
};

/** What a restore would make and cost, without starting it. */
export async function restorePlan(projectId: string, assetId: string, opts: Omit<RestoreOpts, "onProgress" | "signal" | "use">) {
  const { project } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind !== "video" || !a.duration) throw new Error(`"${assetId}" isn't a clip`);
  if (a.version) throw new Error(`"${assetId}" is already a version of "${a.version.of}"; restore that clip instead`);
  const steps = opts.steps;
  if (!steps.denoise && !steps.steady && !steps.upscale && !steps.fps) throw new Error("Say what to do: denoise, steady, upscale or fps");
  const from = Math.max(0, opts.from ?? 0), to = Math.min(a.duration, opts.to ?? a.duration);
  if (!(to - from > 0.1)) throw new Error(`Nothing to restore between ${from}s and ${to}s`);
  const seconds = to - from;
  const out = restoredSize(a, steps);
  const ask = { seconds, width: a.width, height: a.height, fps: out.fps ?? a.fps, upscale: steps.upscale };
  const upscaler = steps.upscale ? await pickFixer("upscale", ask, opts.upscaleWith) : undefined;
  const frames = steps.fps && a.fps && steps.fps > a.fps ? await pickFixer("frames", { seconds, width: a.width, height: a.height, fps: a.fps }) : undefined;
  return { asset: a, from, to, seconds, steps, size: out, upscaler, frames, usd: upscaler?.usd ?? 0 };
}

/**
 * Restores a stretch of a clip (all of it by default) and adds it as a version of the clip. With `use`, the cut's clip
 * shots of it that the stretch covers show it from then on.
 */
export async function restoreClip(projectId: string, assetId: string, opts: RestoreOpts): Promise<{ asset: Asset; shots: string[]; upscaler?: FixerChoice; costUsd?: number; seconds: number }> {
  const started = Date.now();
  const plan = await restorePlan(projectId, assetId, opts);
  const { asset: a, from, to, steps } = plan;
  if (plan.usd) assertSpendable(plan.usd, { spendable: opts.spendable });
  const { project, dir } = loadProject(projectId);
  const src = assetPath(project, dir, a);
  if (!existsSync(src)) throw new Error(`Its file isn't there: ${src}`);
  const progress = opts.onProgress ?? (() => {});
  const signal = opts.signal ?? new AbortController().signal;

  // A folder for this exact restore, so stopping and starting again picks up the pieces already done.
  const key = createHash("sha256").update(JSON.stringify([a.id, from, to, steps, plan.upscaler?.id, plan.frames?.id])).digest("hex").slice(0, 12);
  const work = join(dir, ".cache", "restore", `${a.id}-${key}`);
  mkdirSync(work, { recursive: true });

  const shotCuts = (a.moments ?? []).filter((m) => /^shot-\d+$/.test(m.id)).map((m) => m.t);
  const cuts = shotCuts.length ? shotCuts : steps.steady ? await cutsIn(src, 0.3) : [];
  const pieces = piecesOf(from, to, cuts, !!steps.steady);
  const fps = a.fps ?? 30;
  const outFps = plan.size.fps ?? fps;
  const here = plan.upscaler?.id === "realesrgan" ? toolReady("realesrgan") : undefined;
  const rife = plan.frames ? toolReady("rife") : undefined;
  if (plan.upscaler?.id === "realesrgan" && !here) throw new Error("Real-ESRGAN isn't installed on this computer (Settings → Restoring)");
  if (plan.frames && !rife) throw new Error("RIFE isn't installed on this computer (Settings → Restoring)");
  const stabilize = steps.steady ? await hasVidstab() : false;
  // Bigger here means four times, then down to two when two was asked for.
  const size = plan.size.width && plan.size.height ? `${plan.size.width}:${plan.size.height}` : undefined;
  const local = steps.upscale && here;

  // Pieces meet frame to frame: each is a whole number of the clip's frames, read from half a frame before its first
  // (so seeking lands on it) for exactly that many, then timed afresh. Otherwise a frame can go missing at every join,
  // and over a film's hundred pieces the version would drift out of step.
  const frameOf = (t: number) => Math.round(t * fps);
  const first = frameOf(from), last = frameOf(to);
  for (const [i, [s, e]] of pieces.entries()) {
    if (signal.aborted) throw new Error("Stopped");
    const done = join(work, `piece-${String(i).padStart(4, "0")}.mp4`);
    const share = (k: number) => progress(0.02 + (0.88 * (i + k)) / pieces.length, `Piece ${i + 1} of ${pieces.length}`);
    if (existsSync(done)) continue;
    share(0);
    const [k0, k1] = [i === 0 ? first : frameOf(s), i === pieces.length - 1 ? last : frameOf(e)];
    const count = k1 - k0;
    if (count < 1) continue;
    const range = ["-ss", Math.max(0, (k0 - 0.5) / fps).toFixed(4), "-i", src];
    const exactly = ["-frames:v", String(count)];
    const retime = `setpts=N/(${fps}*TB)`;
    const clean: string[] = steps.denoise ? [DENOISE[steps.denoise]] : [];
    let vf = [...clean];
    if (steps.steady) {
      if (stabilize) {
        // Two passes: how the camera moved, then the frames moved back along a smoothed path (zoomed in a little to hide the edges).
        await exec("ffmpeg", ["-v", "error", "-y", ...range, "-vf", [...clean, "vidstabdetect=shakiness=6:accuracy=15:result=motion.trf"].join(","), ...exactly, "-f", "null", "-"], { cwd: work });
        vf = [...clean, "vidstabtransform=input=motion.trf:smoothing=12:optzoom=1:zoomspeed=0.2:interpol=bicubic"];
      } else vf = [...clean, "deshake"];
    }
    const encode = (input: string[], filters: string[], frames: number, rate: number) =>
      exec(
        "ffmpeg",
        ["-v", "error", "-y", ...input, "-vf", [...filters, `setpts=N/(${rate}*TB)`].join(","), "-frames:v", String(frames), "-r", String(rate), "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", `${done}.part.mp4`],
        { cwd: work, maxBuffer: 16 * 1024 * 1024 },
      );
    if (!local && !rife) {
      await encode(range, vf, count, fps);
    } else {
      // Frame by frame: out to pictures, through RIFE (on the small frames, where it's cheap) and Real-ESRGAN, and back.
      const dirs = { in: join(work, "in"), mid: join(work, "mid"), up: join(work, "up") };
      for (const d of Object.values(dirs)) rmSync(d, { recursive: true, force: true });
      mkdirSync(dirs.in);
      await exec("ffmpeg", ["-v", "error", "-y", ...range, "-vf", [...vf, retime].join(","), ...exactly, "-fps_mode", "passthrough", join(dirs.in, "%08d.png")], { cwd: work });
      let frames = dirs.in;
      if (rife && count > 1) {
        const want = Math.round(count * (outFps / fps));
        await runFrames(rife, dirs.in, dirs.mid, { count: want, signal });
        frames = dirs.mid;
      }
      share(0.3);
      if (local) {
        await runUpscale(here, frames, dirs.up, signal);
        frames = dirs.up;
      }
      share(0.9);
      const made = readdirSync(frames).filter((f) => f.endsWith(".png")).length;
      const rate = rife ? (made / count) * fps : fps;
      await encode(["-framerate", String(rate), "-i", join(frames, "%08d.png")], local && size ? [`scale=${size}:flags=lanczos`] : [], made, rate);
      for (const d of Object.values(dirs)) rmSync(d, { recursive: true, force: true });
    }
    renameSync(`${done}.part.mp4`, done);
    rmSync(join(work, "motion.trf"), { force: true });
  }

  // The pieces as one picture, then (on fal) made bigger there.
  progress(0.9, "Putting the pieces together");
  const done = readdirSync(work).filter((f) => /^piece-\d+\.mp4$/.test(f)).sort();
  writeFileSync(join(work, "pieces.txt"), done.map((f) => `file '${f}'`).join("\n"));
  let picture = join(work, "picture.mp4");
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "pieces.txt", "-c", "copy", picture], { cwd: work });
  let costUsd: number | undefined;
  if (steps.upscale && plan.upscaler?.id === "seedvr") {
    progress(0.91, "Upscaling on fal");
    const upscaled = join(work, "seedvr.mp4");
    if (!existsSync(upscaled)) await onFal(picture, upscaled, { width: plan.size.width!, height: plan.size.height!, fps: outFps }, join(work, "fal.json"), signal);
    costUsd = plan.usd;
    if (!existsSync(join(work, "charged"))) {
      recordSpend(projectId, { what: `Restored ${a.label ?? a.id} (${restoreWords(steps)})`, by: `fal:${SEEDVR}`, usd: costUsd });
      writeFileSync(join(work, "charged"), "");
    }
    picture = upscaled;
  }

  // With the clip's own sound (cleaned, when it is) for that stretch, so the version plays right on its own too.
  progress(0.96, "Adding the sound");
  const folder = join(projectDir(projectId), "made", "restored");
  mkdirSync(folder, { recursive: true });
  const name = `${a.id}-${Math.round(from)}-${Math.round(to)}-${key.slice(0, 6)}.mp4`;
  const out = join(folder, name);
  const sound = soundFile(project, dir, a);
  const [start, end] = [first / fps, last / fps];
  await exec("ffmpeg", ["-v", "error", "-y", "-i", picture, "-ss", start.toFixed(4), "-to", end.toFixed(4), "-i", sound, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
  const label = `${a.label ?? a.id}${from > 0 || to < (a.duration ?? to) ? ` ${clock(from)}–${clock(to)}` : ""} · restored`;
  const made = await addAsset(projectId, out, {
    label,
    tags: ["restored"],
    capturedAt: a.capturedAt,
    version: { of: a.id, from: Math.round(start * 10000) / 10000 },
    provenance: {
      source: "restored",
      ...(plan.upscaler ? { provider: plan.upscaler.id === "seedvr" ? "fal" : "here", model: plan.upscaler.id === "seedvr" ? SEEDVR : "realesrgan-x4plus" } : {}),
      refs: [a.id],
      ...(costUsd ? { costUsd } : {}),
      createdAt: new Date().toISOString(),
      op: "restore",
      params: { ...steps, from, to, ...(plan.upscaler ? { upscaler: plan.upscaler.id } : {}), ...(plan.frames ? { frames: plan.frames.id } : {}) },
    },
  });
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const shots = opts.use ? useVersion(projectId, made.id, opts.use) : [];
  progress(1);
  return { asset: made, shots, upscaler: plan.upscaler, ...(costUsd ? { costUsd } : {}), seconds: Math.round((Date.now() - started) / 1000) };
}

/** "1:05" */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** SeedVR2 takes nothing smaller than this either way. */
const SEEDVR_LEAST = 256;

/**
 * SeedVR2 on fal: the picture goes up, comes back `size`. Tape smaller than it takes is enlarged just enough first, and
 * asked for the rest. The request is kept in `state`, so a restart waits for it rather than paying again.
 */
async function onFal(file: string, out: string, size: { width: number; height: number; fps: number }, state: string, signal: AbortSignal) {
  const key = await getSecret("fal");
  if (!key) throw new Error("There's no fal key (Settings → Media services)");
  const { stdout } = await exec("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
  const [w, h] = stdout.trim().split(",").map(Number) as [number, number];
  const pre = Math.max(1, SEEDVR_LEAST / Math.min(w, h));
  let send = file;
  if (pre > 1) {
    send = join(dirname(file), "enlarged.mp4");
    const even = (n: number) => Math.ceil(n / 2) * 2;
    await exec("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `scale=${even(w * pre)}:${even(h * pre)}:flags=lanczos`, "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", send]);
  }
  const factor = Math.round((size.width / (w * pre)) * 1000) / 1000;
  // A request fal turned away is forgotten, so trying again sends a new one; it's waited for again only while it's running.
  const refused = (why: string) => {
    rmSync(state, { force: true });
    return new Error(/content checker|flagged/i.test(why) ? "fal's content checker wouldn't take this stretch (it turns away things like a home movie's fake blood). Upscale it with Real-ESRGAN on this computer instead, which has no such check." : `fal couldn't upscale it: ${why}`);
  };
  let req: FalRequest;
  try {
    req = JSON.parse(readFileSync(state, "utf8")) as FalRequest;
  } catch {
    const url = await falUpload(key, send);
    try {
      req = await falSubmit(key, SEEDVR, { video_url: url, upscale_mode: "factor", upscale_factor: factor, output_format: "X264 (.mp4)", output_quality: "high" });
    } catch (err) {
      // fal's content checker turns away what it takes for gore, a home movie's fake blood included.
      if (/content checker|flagged/i.test(err instanceof Error ? err.message : "")) throw refused(err instanceof Error ? err.message : "");
      throw err;
    }
    writeFileSync(state, JSON.stringify(req));
  }
  let r: Record<string, unknown>;
  try {
    for (;;) {
      if (signal.aborted) throw new Error("Stopped (fal goes on with it; restoring again picks it up)");
      const s = await falStatus(key, req);
      if (s.state === "done") {
        if (s.error) throw refused(s.error);
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    r = await falResult(key, req);
  } catch (err) {
    if (err instanceof FalError && err.final) throw refused(err.message);
    throw err;
  }
  const url = (r.video as { url?: string } | undefined)?.url;
  if (!url) throw new Error("fal finished, but didn't give the video");
  const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) throw new Error(`Couldn't download the upscaled video (${res.status})`);
  writeFileSync(`${out}.part.mp4`, Buffer.from(await res.arrayBuffer()));
  // Exactly the size asked for (its factor can land a pixel off), and the clip's own rate (fal rounds 29.97 to 30),
  // frame for frame.
  await exec("ffmpeg", ["-v", "error", "-y", "-i", `${out}.part.mp4`, "-vf", `scale=${size.width}:${size.height}:flags=lanczos,setpts=N/(${size.fps}*TB)`, "-r", String(size.fps), "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", out]);
  rmSync(`${out}.part.mp4`, { force: true });
}

/**
 * Has a cut's clip shots of a clip show one of its versions, where the version covers what the shot plays (or just
 * the shots named). Returns the shots it changed.
 */
export function useVersion(projectId: string, versionId: string, opts: { cut?: string; shots?: string[]; off?: boolean } = {}): string[] {
  const { project } = loadProject(projectId, opts.cut);
  const v = project.assets.find((x) => x.id === versionId);
  if (!v?.version) throw new Error(`"${versionId}" isn't a version of a clip`);
  const of = v.version.of;
  const tl = resolveTimeline(project, project.formats[0]!.id);
  const changed: string[] = [];
  for (const s of project.shots) {
    const c = s.content;
    if (c.kind !== "clip" || c.asset !== of || (opts.shots && !opts.shots.includes(s.id))) continue;
    if (opts.off) {
      if (c.version === versionId) changed.push(s.id);
      continue;
    }
    const r = tl.shots.find((x) => x.id === s.id);
    if (!r || !Number.isFinite(r.start) || !Number.isFinite(r.end)) continue;
    const sourceIn = r.sourceIn ?? 0;
    const sourceOut = sourceIn + (r.end - r.start) * (c.speed ?? 1);
    if (versionAt(v, of, sourceIn, sourceOut) !== undefined && c.version !== versionId) changed.push(s.id);
  }
  if (changed.length)
    updateProject(
      projectId,
      (d) => {
        for (const s of d.shots) if (changed.includes(s.id) && s.content.kind === "clip") opts.off ? delete s.content.version : (s.content.version = versionId);
      },
      opts.cut,
    );
  return changed;
}
