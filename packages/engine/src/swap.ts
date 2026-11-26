/**
 * Character Replacement (`swap`, inspired by Tein's Genjustsu Fast & Advanced workflows): replaces a person in
 * existing footage with a `@cast` character (keeping body motion, expression, camera and real background) via
 * beatsheet's Seedance 2.5 reference-video pipeline, without requiring a 24 GB local GPU.
 *
 * - `fast` mode: draws a high-contrast MediaPipe 478-landmark face mesh over the original person's face.
 * - `advanced` mode: uses a tracked subject / SAM 3 cut-out silhouette matte + temporally smoothed depth map +
 *   MediaPipe face mesh, replacing only the masked person while leaving the real background untouched.
 *
 * Optionally pairs with Demucs + Rubber Band (`pitchShift` + `keepMusic`) to match the swapped character's voice
 * pitch while keeping original background music and ambience intact. Results land as a clip `version` (`version:
 * { of, from }`) that matching clip shots show cleanly.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { aspectOf, castOf, castPictures, type Asset, type CastMember, type SubjectTrack } from "@beatsheet/schema";
import { shiftAudio } from "./audio.ts";
import type { DemucsRunner } from "./demucs.ts";
import { makeChoices, startMake, type MakeAsk, type MakeJob } from "./make.ts";
import { assetPath, projectDir, RESOURCES } from "./paths.ts";
import { loadProject } from "./store.ts";
import { depthModelPath, faceLandmarkerModel, visionPrepReady, visionPython } from "./visiontools.ts";

const exec = promisify(execFile);
const WORKER = join(RESOURCES, "packages", "engine", "native", "swap-worker.py");

export type SwapMode = "fast" | "advanced";

export type SwapWorkerArgs = {
  input: string;
  output: string;
  mode: SwapMode;
  subjectJson?: string;
  matte?: string;
};
export type SwapWorkerRunner = (args: SwapWorkerArgs) => Promise<void>;

export type SwapOpts = {
  cut?: string;
  from?: number;
  to?: number;
  /** fast: MediaPipe face mesh on original body; advanced: silhouette matte + depth map + face mesh for big shape/costume changes. */
  mode?: SwapMode;
  /** Target cast member id (e.g. "hero" or "hero/heist"). */
  cast: string;
  /** Optional subject id on the clip (from find_subjects/track_subject) specifying which person to replace. */
  subject?: string;
  /** Optional SAM 3 / Apple Vision cut-out asset id to use as the exact silhouette matte in advanced mode. */
  matteAsset?: string;
  /** Optional extra prompt direction (wardrobe, lighting match, performance detail). */
  prompt?: string;
  quality?: "rough" | "final";
  model?: string;
  via?: string;
  /** Show the swapped version in matching clip shots once finished (default true). */
  use?: boolean;
  /** Optional voice pitch shift in semitones (-12..+12) via Rubber Band to match the new character's voice. */
  pitchShift?: number;
  /** When pitchShift is set, shift ONLY the vocals via Demucs so background music stays in tune. */
  keepMusic?: boolean;
  spendable?: number;
  /** Injectable worker runner for unit tests. */
  worker?: SwapWorkerRunner;
  /** Injectable Demucs runner for unit tests. */
  demucsRunner?: DemucsRunner;
};

function clampSwapRange(a: Asset, from?: number, to?: number): { from: number; to: number; seconds: number } {
  const dur = a.duration ?? 0;
  const start = Math.max(0, from ?? 0);
  const maxEnd = dur > 0 ? Math.min(dur, start + 15) : start + 8;
  const end = Math.min(maxEnd, to ?? Math.min(dur || 8, start + 8));
  const seconds = Math.max(2, Math.min(15, Math.round((end - start) * 10) / 10));
  if (dur > 0 && end <= start + 0.5) throw new Error(`Pick a stretch of at least 1s inside ${a.id} (it runs ${dur.toFixed(1)}s)`);
  return { from: start, to: start + seconds, seconds };
}

function buildSwapPrompt(member: CastMember, mode: SwapMode, extra?: string): string {
  const base =
    mode === "advanced"
      ? `Replace the depth-mapped, face-meshed silhouette in the reference video with @${member.id}, matching the character's exact face, proportions, hair and wardrobe from the reference image.`
      : `Replace the face-meshed person in the reference video with @${member.id}, matching the character's exact face, likeness and hair from the reference image while keeping the original body pose, gestures, eye gaze, lip movement and lighting.`;
  const tail = "Keep the entire real background, camera movement, timing, props and lighting completely unchanged. No mesh lines, no depth colors, photorealistic seamless composite.";
  return [base, extra?.trim(), tail].filter(Boolean).join(" ");
}

/** Plans a character swap: resolves range, cast references, subject, realPeople routing, and model/cost choices. */
export function swapPlan(projectId: string, assetId: string, opts: SwapOpts) {
  const { project } = loadProject(projectId, opts.cut);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind !== "video") throw new Error(`"${assetId}" is a ${a.kind}; swap_character needs a video clip`);
  const cleanId = opts.cast.replace(/^@/, "");
  const uses = castOf("", project.cast, [cleanId]);
  const found = uses[0];
  if (!found) throw new Error(`No cast member "@${cleanId}". Add them to /cast first.`);
  const pics = castPictures(uses, { cast: project.cast }).map((p) => p.asset);
  if (!pics.length) throw new Error(`@${cleanId} has no reference pictures yet. Add a photo or make their portrait/sheet first.`);

  const mode: SwapMode = opts.mode ?? "fast";
  const { from, to, seconds } = clampSwapRange(a, opts.from, opts.to);
  const subject: SubjectTrack | undefined = opts.subject ? a.subjects?.find((s) => s.id === opts.subject) : a.subjects?.[0];
  const prompt = buildSwapPrompt(found.member, mode, opts.prompt);
  const aspect = a.width && a.height ? aspectOf(a.width, a.height) : undefined;
  const ask: MakeAsk = {
    cut: project.cut.id,
    op: "video",
    prompt,
    cast: [opts.cast],
    refs: pics,
    camera: { asset: a.id, from, to },
    cameraKind: "swap",
    seconds,
    aspect,
    quality: opts.quality ?? "rough",
    count: 1,
    model: opts.model,
    via: opts.via,
  };
  const { req, choices } = makeChoices(projectId, ask);
  return { from, to, seconds, mode, member: found.member, pics, subject, prompt, ask, req, choices, visionReady: visionPrepReady() };
}

async function runDefaultSwapWorker(args: SwapWorkerArgs): Promise<void> {
  if (!visionPrepReady()) {
    throw new Error("Vision prep (MediaPipe + OpenCV) isn't installed yet. Install it in Settings → Restoring.");
  }
  const depth = depthModelPath();
  const cli = [
    "-I",
    "-B",
    WORKER,
    "--input",
    args.input,
    "--output",
    args.output,
    "--mode",
    args.mode,
    "--face-model",
    faceLandmarkerModel(),
    ...(depth ? ["--depth-model", depth] : []),
    ...(args.subjectJson ? ["--subject-json", args.subjectJson] : []),
    ...(args.matte ? ["--matte", args.matte] : []),
  ];
  await exec(visionPython(), cli, { maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60_000 });
}

/**
 * Prepares the Fast (face mesh) or Advanced (silhouette + depth + face mesh) conditioning video, optionally shifts
 * the clip's voice pitch via Rubber Band (+ Demucs), and submits a Seedance 2.5 character-swap job that lands as
 * a clip `version` (`version: { of, from }`).
 */
export async function swapCharacter(
  projectId: string,
  assetId: string,
  opts: SwapOpts,
): Promise<{
  fit: ReturnType<typeof startMake>["fit"];
  jobs: MakeJob[];
  mode: SwapMode;
  conditioning: string;
  from: number;
  to: number;
  pitchShifted?: boolean;
}> {
  const plan = swapPlan(projectId, assetId, opts);
  const { project, dir } = loadProject(projectId, opts.cut);
  const a = project.assets.find((x) => x.id === assetId)!;
  const src = assetPath(project, dir, a);
  if (!existsSync(src)) throw new Error(`Clip file missing: ${src}`);

  const swapDir = join(projectDir(projectId), ".cache", "swap");
  mkdirSync(swapDir, { recursive: true });
  const stamp = Date.now().toString(36);
  const work = join(tmpdir(), `beatsheet-swap-${process.pid}-${stamp}`);
  mkdirSync(work, { recursive: true });

  try {
    // 1. Cut the exact stretch from the source clip.
    const trimmed = join(work, "stretch.mp4");
    await exec("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-ss",
      String(plan.from),
      "-t",
      String(plan.seconds),
      "-i",
      src,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      trimmed,
    ]);

    // 2. Write shifted subject boxes if a subject track is available.
    let subjectJson: string | undefined;
    if (plan.subject?.samples.length) {
      const shifted = plan.subject.samples
        .filter((s) => s[0]! >= plan.from - 0.5 && s[0]! <= plan.to + 0.5)
        .map((s) => [Math.max(0, s[0]! - plan.from), s[1]!, s[2]!, s[3]!, s[4]!]);
      if (shifted.length) {
        subjectJson = join(work, "subject.json");
        writeFileSync(subjectJson, JSON.stringify({ id: plan.subject.id, samples: shifted }));
      }
    }

    // 3. Extract alpha matte from a SAM 3 / Apple Vision cut-out video if one matches in advanced mode.
    let matte: string | undefined;
    if (plan.mode === "advanced") {
      const cutout = opts.matteAsset
        ? project.assets.find((x) => x.id === opts.matteAsset)
        : project.assets.find((x) => x.kind === "video" && x.cutout?.of === a.id && Math.abs((x.cutout.from ?? 0) - plan.from) < 1.5);
      if (cutout) {
        const cPath = assetPath(project, dir, cutout);
        if (existsSync(cPath)) {
          const matteOut = join(work, "matte.mp4");
          const cOffset = Math.max(0, plan.from - (cutout.cutout?.from ?? 0));
          await exec("ffmpeg", [
            "-y",
            "-v",
            "error",
            "-ss",
            String(cOffset),
            "-t",
            String(plan.seconds),
            "-i",
            cPath,
            "-vf",
            "alphaextract,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            matteOut,
          ]).catch(() => undefined);
          if (existsSync(matteOut)) matte = matteOut;
        }
      }
    }

    // 4. Build the conditioning video (face mesh or depth+silhouette+mesh).
    const conditioning = join(swapDir, `${a.id}-${plan.mode}-${stamp}.mp4`);
    const runWorker = opts.worker ?? runDefaultSwapWorker;
    await runWorker({ input: trimmed, output: conditioning, mode: plan.mode, subjectJson, matte });
    if (!existsSync(conditioning)) throw new Error("Swap conditioning worker didn't produce an output video");

    // 5. Optional voice pitch shift via Rubber Band (+ Demucs vocal-only separation).
    let audioFile: string | undefined;
    if (opts.pitchShift && Math.abs(opts.pitchShift) >= 0.05) {
      audioFile = join(swapDir, `${a.id}-audio-${stamp}.m4a`);
      await shiftAudio(projectId, assetId, {
        semitones: opts.pitchShift,
        keepMusic: opts.keepMusic,
        from: plan.from,
        to: plan.to,
        outFile: audioFile,
        demucsRunner: opts.demucsRunner,
      });
    }

    // 6. Start Seedance 2.5 reference-video job with cameraKind: "swap" & versionOf.
    const label = `${a.label ?? a.id} · swapped to ${plan.member.name}`;
    const { fit, jobs } = startMake(
      projectId,
      {
        ...plan.ask,
        cameraKind: "swap",
        cameraFile: conditioning,
        versionOf: {
          asset: a.id,
          from: plan.from,
          to: plan.to,
          use: opts.use ?? true,
          keepAudio: true,
          audioFile,
          label,
          tag: "swap",
          op: "swap",
          params: {
            mode: plan.mode,
            cast: opts.cast,
            ...(plan.subject ? { subject: plan.subject.id } : {}),
            ...(opts.pitchShift ? { pitchShift: opts.pitchShift, keepMusic: !!opts.keepMusic } : {}),
          },
        },
      },
      { spendable: opts.spendable },
    );
    return { fit, jobs, mode: plan.mode, conditioning, from: plan.from, to: plan.to, ...(audioFile ? { pitchShifted: true } : {}) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
