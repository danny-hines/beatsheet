/**
 * "Act It Yourself" Facial Performance Transfer (`perform`): captures your own webcam or reference-clip facial
 * performance (52 ARKit blendshapes + 3D head pitch/yaw/roll via Apache-2.0 MediaPipe Face Landmarker), renders
 * an identity-stripped matte-grey 3D clay head mask via `kit:ClayHead` (100% commercial-safe Three.js, zero
 * FLAME/SPECTRE research weights), and drives any `@cast` character, portrait, or shot board through beatsheet's
 * Seedance 2.5 reference-video pipeline (`cameraKind: "perform"`).
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { aspectOf, castOf, castPictures, STAGE_IDS, type Asset, type FacePerformanceTrack, type Project } from "@beatsheet/schema";
import { makeChoices, startMake, type MakeAsk, type MakeJob } from "./make.ts";
import { assetPath, faceTrackPath, projectDir, RESOURCES } from "./paths.ts";
import { loadProject } from "./store.ts";
import { faceLandmarkerModel, visionPrepReady, visionPython } from "./visiontools.ts";

const exec = promisify(execFile);
const WORKER = join(RESOURCES, "packages", "engine", "native", "face-track.py");

export type FaceTrackerRunner = (args: { input: string; output: string; from?: number; to?: number }) => Promise<FacePerformanceTrack>;
export type ClayMaskRenderer = (args: { projectId: string; track: FacePerformanceTrack; out: string; width: number; height: number; fps: number; intensity: number }) => Promise<string>;

export type TrackFaceOpts = {
  from?: number;
  to?: number;
  again?: boolean;
  /** Injectable tracker for unit tests. */
  tracker?: FaceTrackerRunner;
};

export type PerformOpts = {
  cut?: string;
  /** Driver video asset id (e.g. a Record → Camera take or performance clip). */
  driver: string;
  from?: number;
  to?: number;
  /** Target shot id to land takes on (uses its board + cast automatically). */
  shot?: string;
  /** Target cast member id (e.g. "cat" or "hero") when not targeting a shot, or to force a specific character. */
  cast?: string;
  /** Explicit target portrait / board asset id (overrides default cast/board still). */
  start?: string;
  /** Optional scene, framing or emotional direction prompt. */
  prompt?: string;
  /** Expression & head-motion intensity multiplier (default 1.0). */
  intensity?: number;
  /** Temporal smoothing window in seconds (default 0.05). */
  smooth?: number;
  quality?: "rough" | "final";
  model?: string;
  via?: string;
  count?: number;
  spendable?: number;
  /** Injectable face tracker for unit tests. */
  tracker?: FaceTrackerRunner;
  /** Injectable clay mask renderer for unit tests. */
  renderer?: ClayMaskRenderer;
};

function clampPerformRange(a: Asset, from?: number, to?: number): { from: number; to: number; seconds: number } {
  const dur = a.duration ?? 0;
  const start = Math.max(0, from ?? 0);
  const maxEnd = dur > 0 ? Math.min(dur, start + 15) : start + 6;
  const end = Math.min(maxEnd, to ?? Math.min(dur || 6, start + 8));
  const seconds = Math.max(2, Math.min(15, Math.round((end - start) * 10) / 10));
  if (dur > 0 && end <= start + 0.5) throw new Error(`Pick a stretch of at least 1s inside ${a.id} (it runs ${dur.toFixed(1)}s)`);
  return { from: start, to: start + seconds, seconds };
}

/**
 * Extracts 52 ARKit blendshapes + 3D head pose from a video clip via local Apache-2.0 MediaPipe Face Landmarker.
 * Caches full-clip tracks in `media/<assetId>.face.json` so subsequent takes don't re-track.
 */
export async function trackFacePerformance(
  projectId: string,
  assetId: string,
  opts: TrackFaceOpts = {},
): Promise<{ track: FacePerformanceTrack; file: string; reused: boolean }> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind !== "video") throw new Error(`"${assetId}" is a ${a.kind}; face tracking needs a video clip`);

  const ranged = (opts.from !== undefined && opts.from > 0.05) || (opts.to !== undefined && a.duration && opts.to < a.duration - 0.05);
  const out = ranged
    ? join(dir, ".cache", "perform", `${a.id}-${Math.round((opts.from ?? 0) * 10)}-${Math.round((opts.to ?? a.duration ?? 0) * 10)}.face.json`)
    : faceTrackPath(dir, a.id);

  if (!opts.again && existsSync(out)) {
    const cached = JSON.parse(readFileSync(out, "utf8")) as FacePerformanceTrack;
    if (cached.frames?.length) return { track: cached, file: out, reused: true };
  }

  const src = assetPath(project, dir, a);
  if (!existsSync(src)) throw new Error(`Clip file missing: ${src}`);
  mkdirSync(join(out, ".."), { recursive: true });

  if (opts.tracker) {
    const track = await opts.tracker({ input: src, output: out, from: opts.from, to: opts.to });
    writeFileSync(out, JSON.stringify({ ...track, source: a.id }));
    return { track: { ...track, source: a.id }, file: out, reused: false };
  }

  if (!visionPrepReady()) {
    throw new Error("MediaPipe vision prep isn't installed yet. Install it in Settings → Restoring.");
  }
  const cli = [
    "-I",
    "-B",
    WORKER,
    "--input",
    src,
    "--output",
    out,
    "--face-model",
    faceLandmarkerModel(),
    ...(opts.from !== undefined ? ["--from", String(opts.from)] : []),
    ...(opts.to !== undefined ? ["--to", String(opts.to)] : []),
  ];
  await exec(visionPython(), cli, { maxBuffer: 16 * 1024 * 1024, timeout: 10 * 60_000 });
  const track = JSON.parse(readFileSync(out, "utf8")) as FacePerformanceTrack;
  track.source = a.id;
  writeFileSync(out, JSON.stringify(track));
  return { track, file: out, reused: false };
}

/** Renders an identity-stripped matte-grey 3D clay head conditioning MP4 using `kit:ClayHead` + Remotion. */
export async function renderClayMaskVideo(
  projectId: string,
  track: FacePerformanceTrack,
  opts: { out: string; width?: number; height?: number; fps?: number; intensity?: number; smooth?: number; renderer?: ClayMaskRenderer },
): Promise<string> {
  const width = opts.width ?? 512;
  const height = opts.height ?? 512;
  const fps = Math.round(opts.fps ?? (track.fps || 24));
  const intensity = opts.intensity ?? 1;
  mkdirSync(join(opts.out, ".."), { recursive: true });

  if (opts.renderer) {
    return opts.renderer({ projectId, track, out: opts.out, width, height, fps, intensity });
  }

  const { project } = loadProject(projectId);
  const duration = Math.max(1, track.duration || 4);
  const synthetic: Project = {
    ...project,
    cut: { id: "clay-mask", name: "Clay mask" },
    spine: "shots",
    formats: [{ id: "clay", label: `${width}x${height}`, width, height, fps }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "done" }])) as Project["stages"],
    music: undefined,
    voice: undefined,
    captions: undefined,
    sfx: undefined,
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [
      {
        id: "clay",
        track: "pic",
        fidelity: "final",
        start: { kind: "time", t: 0 },
        duration,
        content: {
          kind: "coded",
          component: "kit:ClayHead",
          props: { track, intensity, smooth: opts.smooth ?? 0.05 },
        },
      },
    ],
    notes: [],
  };
  const { renderProject } = await import("./render.ts");
  return renderProject(projectId, { project: synthetic, format: "clay", quality: "proxy", out: opts.out, master: false });
}

/** Plans a facial performance transfer: resolves driver stretch, target character/shot references, and model choices. */
export function performPlan(projectId: string, opts: PerformOpts) {
  const { project } = loadProject(projectId, opts.cut);
  const driver = project.assets.find((a) => a.id === opts.driver);
  if (!driver) throw new Error(`No driver clip "${opts.driver}"`);
  if (driver.kind !== "video") throw new Error(`"${opts.driver}" is a ${driver.kind}; pick a video clip to act from`);

  const { from, to, seconds } = clampPerformRange(driver, opts.from, opts.to);
  const refs: string[] = [];
  const castIds: string[] = [];
  let targetLabel = "";

  if (opts.start) {
    if (!project.assets.some((a) => a.id === opts.start && a.kind === "image")) throw new Error(`No image asset "${opts.start}"`);
    refs.push(opts.start);
    targetLabel = opts.start;
  }
  if (opts.shot) {
    const s = project.shots.find((x) => x.id === opts.shot);
    if (!s) throw new Error(`No shot "${opts.shot}"`);
    if (s.content.kind === "generated") {
      const isImg = (aid?: string) => !!aid && project.assets.some((a) => a.id === aid && a.kind === "image");
      const board = isImg(s.content.take) ? s.content.take : s.content.takes?.find((aid) => isImg(aid));
      if (board && !refs.includes(board)) refs.push(board);
      for (const c of s.content.cast ?? []) if (!castIds.includes(c)) castIds.push(c);
    }
    targetLabel ||= `shot ${s.id}`;
  }
  if (opts.cast) {
    const clean = opts.cast.replace(/^@/, "");
    const uses = castOf("", project.cast, [clean]);
    if (!uses.length) throw new Error(`No cast member "@${clean}"`);
    if (!castIds.includes(clean)) castIds.push(clean);
    for (const p of castPictures(uses, { cast: project.cast })) if (!refs.includes(p.asset)) refs.push(p.asset);
    targetLabel = uses[0]!.member.name;
  }
  if (!refs.length) {
    throw new Error("Pass a target cast member (`cast`), portrait/board still (`start`), or shot with a board (`shot`) to transfer the facial performance onto.");
  }

  const fmt = project.formats[0];
  const aspect = fmt ? aspectOf(fmt.width, fmt.height) : driver.width && driver.height ? aspectOf(driver.width, driver.height) : "16:9";
  const who = castIds.length ? castIds.map((c) => `@${c}`).join(" and ") : "the character in the reference image";
  const prompt = [
    `Close-up performance of ${who} matching every micro-expression, eyebrow tension, eye gaze, blink, mouth articulation and head movement of the neutral clay head in the reference video.`,
    opts.prompt?.trim(),
    "Keep the character's exact identity, skin texture, hair, wardrobe and lighting from the reference image; no grey clay texture in the finished video.",
  ]
    .filter(Boolean)
    .join(" ");

  const ask: MakeAsk = {
    cut: project.cut.id,
    op: "video",
    ...(opts.shot ? { shot: opts.shot } : {}),
    prompt,
    cast: castIds.length ? castIds : undefined,
    refs,
    camera: { asset: driver.id, from, to },
    cameraKind: "perform",
    seconds,
    aspect,
    quality: opts.quality ?? "rough",
    count: opts.count ?? 1,
    model: opts.model,
    via: opts.via,
  };
  const { req, choices } = makeChoices(projectId, ask);
  return { driver, from, to, seconds, targetLabel, refs, castIds, prompt, ask, req, choices, visionReady: visionPrepReady() };
}

/**
 * Runs the full "Act it yourself" facial performance transfer pipeline:
 * 1. Tracks 52 ARKit blendshapes + 3D head pose from `driver` via Apache-2.0 MediaPipe.
 * 2. Renders an identity-stripped neutral grey 3D clay mask MP4 via `kit:ClayHead`.
 * 3. Submits a Seedance 2.5 reference-video job (`cameraKind: "perform"`) targeting the chosen character, still, or shot.
 */
export async function transferPerformance(
  projectId: string,
  opts: PerformOpts,
): Promise<{
  fit: ReturnType<typeof startMake>["fit"];
  jobs: MakeJob[];
  clayVideo: string;
  trackFile: string;
  frames: number;
  from: number;
  to: number;
}> {
  const plan = performPlan(projectId, opts);
  const tracked = await trackFacePerformance(projectId, plan.driver.id, { from: plan.from, to: plan.to, tracker: opts.tracker });
  const perfDir = join(projectDir(projectId), ".cache", "perform");
  mkdirSync(perfDir, { recursive: true });
  const clayVideo = join(perfDir, `${plan.driver.id}-clay-${Date.now().toString(36)}.mp4`);
  await renderClayMaskVideo(projectId, tracked.track, {
    out: clayVideo,
    width: 512,
    height: 512,
    fps: tracked.track.fps || 24,
    intensity: opts.intensity ?? 1,
    smooth: opts.smooth ?? 0.05,
    renderer: opts.renderer,
  });
  const { fit, jobs } = startMake(
    projectId,
    {
      ...plan.ask,
      cameraKind: "perform",
      cameraFile: clayVideo,
    },
    { spendable: opts.spendable },
  );
  return { fit, jobs, clayVideo, trackFile: tracked.file, frames: tracked.track.frames.length, from: plan.from, to: plan.to };
}
