/**
 * Making new footage with the person's services. A request becomes one job per take, each saved in the project's
 * jobs/ folder before anything is sent, so a restart or a closed agent session loses only the waiting, never the take:
 * the service keeps it under the request id the job records. Whichever engine process is running drives the
 * unfinished jobs, and a lock file beside each stops two processes driving the same one. A finished take is added like
 * any other asset and, when the job was for a shot, becomes one of that shot's takes.
 */
import { execFile } from "node:child_process";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import {
  aspectOf,
  blockoutDuration,
  blockoutProject,
  blockoutStretch,
  cameraOfTake,
  cameraOnShot,
  CATALOG,
  castOf,
  castPackFor,
  castPictures,
  castRenaming,
  lookAssets,
  lookMerging,
  castPrompt,
  fewestStillRefs,
  chooseModels,
  driveWindow,
  FIDELITY,
  fitModel,
  hasTimelineAudioRef,
  isCameraBlockout,
  isCameraSheet,
  missingFromFrames,
  OWN_HARDWARE,
  packCastPictures,
  preferredOf,
  providersOf,
  realPeople,
  resolveTimeline,
  resolveWardrobe,
  shapeOf,
  shotNeeds,
  speechOnShot,
  speechWindow,
  takeLead,
  type Asset,
  type AudioRef,
  type AudioRefRole,
  type Camera,
  type CastMember,
  type CastPackStrategy,
  type Choices,
  type CutStretch,
  type Drive,
  type FitOk,
  type HeadwearMode,
  type MakeOp,
  type MakeRequest,
  type PackedRef,
  type PlannedTake,
  type Project,
  type Quality,
  type ServiceState,
  type Shot,
  type ShotContent,
  type Speech,
  type Stretch,
  type Transcript,
} from "@beatsheet/schema";
import {
  chunksFor,
  chunksIn,
  comfyAhead,
  comfyCancel,
  comfyDownload,
  comfyJob,
  comfyMissing,
  comfySubmit,
  comfyState,
  comfyUpload,
  comfySaved,
  comfyUrl,
  cutClip,
  describeMissing,
  fill,
  fitClip,
  fitPicture,
  fitReference,
  fitSize,
  framesFor,
  laySound,
  loadWorkflow,
  nodesTitled,
  outputMarker,
  OWN_WORKFLOWS,
  profileFor,
  refsIn,
  silence,
  trimTake,
  without,
  workflowPath,
  WORKFLOWS,
  type ComfyPrompt,
} from "./comfy.ts";
import { DIRECT, directImage } from "./direct.ts";
import { PLAN_ROUTES, planImage, planStates } from "./plans.ts";
import { falCancel, FalError, falInput, falOutput, falResult, falStatus, falSubmit, falUpload, SHEET_LINE, takesSeed, type CameraKind, type FalAudioRef, type FalRequest } from "./fal.ts";
import { teinCancel, teinInput, teinStatus, teinSubmit, teinUpload } from "./tein.ts";
import { runwayCancel, runwayInput, runwayStatus, runwaySubmit, runwayUpload } from "./runway.ts";
import { higgsfieldCancel, higgsfieldEstimate, higgsfieldInput, higgsfieldStatus, higgsfieldSubmit, higgsfieldUpload } from "./higgsfield.ts";
import { openrouterDataUrl, openrouterImage, openrouterImageInput, openrouterStatus, openrouterSubmit, openrouterVideoInput } from "./openrouter.ts";
import { addAsset } from "./ingest.ts";
import { unletterbox } from "./letterbox.ts";
import { assetPath, cachePaths, cleanPath, mediaPath, projectDir } from "./paths.ts";
import { replaceFile } from "./platform.ts";
import { probe } from "./probe.ts";
import { SERVICES } from "./services.ts";
import { ledgerSince } from "./spend.ts";
import { packedRefAssets, resolvePackedRef } from "./castpack.ts";
import { getSecret, readSettings, updateSettings } from "./settings.ts";
import { listProjects, loadFile, loadProject, updateFile, updateProject } from "./store.ts";

/** Which kind of cast reference still a sheet job makes. */
export type SheetKind = "portrait" | "face-sheet" | "outfit-sheet" | "sheet";

export type MakeJob = {
  id: string;
  /** Takes asked for together share this. */
  batch: string;
  cut?: string;
  shot?: string;
  /** The cast member (or variant) it's a sheet for. */
  sheet?: string;
  /** Which kind of cast picture it's making (portrait, 360° face sheet, headless outfit turnaround, or legacy combined sheet). */
  sheetKind?: SheetKind;
  /** Legacy flag: true when making a portrait rather than a sheet. */
  portrait?: true;
  op: MakeOp;
  quality?: Quality;
  /** The catalog model, and where it runs: the service, its endpoint, and which adapter fills in the inputs. */
  model: string;
  route: string;
  endpoint: string;
  shape: string;
  /**
   * What was asked, as written (`prompt`, with its @cast) and as the model reads it (`sent`, when that's different);
   * pictures by asset id, the length and aspect to make, and the shot's own length.
   */
  request: {
    prompt: string;
    sent?: string;
    cast?: string[];
    start?: string;
    end?: string;
    refs?: string[];
    /** Model-packed reference slots (direct assets or procedural face+outfit composites). */
    packedRefs?: PackedRef[];
    /** The stretch of a clip a take that copies movement follows (the take is made a little wider where the clip has room: driveWindow). */
    drive?: Drive;
    /** What a take that lip-syncs says, and the clip whose mouths it changes, when it changes one (both widened together: speechWindow). */
    speech?: Speech;
    clip?: Stretch;
    /** What a take keeps the camera of: a stretch of a clip, or of a cut (a blockout) that's rendered when the take is made. */
    camera?: Camera;
    /** Conditioning role of the reference video: clip camera, 3D blockout, relight, character swap, or clay facial performance. */
    cameraKind?: CameraKind;
    /** Local pre-processed conditioning video file (e.g. swap mesh/depth composite or clay face mask) sent in place of the raw clip. */
    cameraFile?: string;
    /** Multimodal reference audio clips sent on reference-to-video (music beat, voiced lines, character voice timbre, or an audio clip). */
    audioRefs?: AudioRef[];
    seconds?: number;
    aspect?: string;
    seed?: number;
    shotSeconds?: number;
  };
  /** When set, the finished video is saved as a version of this clip stretch (with original or supplied sound muxed back). */
  versionOf?: {
    asset: string;
    from: number;
    to: number;
    use?: boolean;
    keepAudio?: boolean;
    audioFile?: string;
    tag?: string;
    label?: string;
    op?: string;
    params?: Record<string, unknown>;
  };
  /** Estimated cost of this take, in US dollars. */
  usd?: number;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  /** The service's request, once it's been sent. */
  remote?: FalRequest;
  /**
   * The idempotency key a request to Tein goes with, saved before it's sent: sent again after a crash or a lost
   * answer, Tein gives the first request's job, not a second one to pay for.
   */
  once?: string;
  /**
   * A job on ComfyUI, saved before it's sent: our own prompt id, the server, the output nodes, a clip's frames to keep
   * and at what rate, the workflow profile, and the filled prompt itself, to send again if ComfyUI restarts and forgets it.
   */
  comfy?: { id: string; url: string; outputs: string[]; frames?: number; fps?: number; profile: string; prompt: ComfyPrompt };
  /** The take, saved the moment it arrived from a service that answers in one request and doesn't keep it (GPT Image). */
  file?: string;
  /** Place in the service's queue, while waiting. */
  position?: number;
  error?: string;
  /** The service finished it, so it's paid for, even if bringing it into the project then went wrong. */
  charged?: boolean;
  /** The take it made. */
  asset?: string;
  createdAt: string;
  updatedAt: string;
};

/** Whether a job's cost counts: everything asked for, except what failed or was stopped before the service made it. */
const counts = (j: MakeJob) => j.charged || (j.status !== "failed" && j.status !== "canceled");

const POLL_MS = Number(process.env.BEATSHEET_MAKE_POLL_MS ?? 3000);
/** A lock nobody has touched for this long belongs to a process that stopped. */
const STALE_MS = 60_000;
/** Network trouble is tried again; this many times in a row and the job gives up. */
const MAX_TRIES = 20;

export const isOpen = (j: MakeJob) => j.status === "queued" || j.status === "running";
const jobsDir = (projectId: string) => join(projectDir(projectId), "jobs");
const jobFile = (projectId: string, id: string) => join(jobsDir(projectId), `${id}.json`);
const lockFile = (projectId: string, id: string) => join(jobsDir(projectId), `${id}.lock`);
let lastId = { ms: 0, n: 0 };
/**
 * An id that sorts after the ones made before it here: the time, then three characters that start somewhere random
 * (another process may be making ids in the same millisecond) and count up for as long as the millisecond lasts.
 */
const newId = (prefix: string) => {
  const ms = Date.now();
  lastId = { ms, n: ms === lastId.ms ? lastId.n + 1 : randomInt(36 ** 3 - 1000) };
  return `${prefix}${ms.toString(36)}${lastId.n.toString(36).padStart(3, "0")}`;
};

/** A project's jobs, oldest first. Those asked for together were made at the same moment, and keep the order of their ids. */
export function listJobs(projectId: string): MakeJob[] {
  const dir = jobsDir(projectId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(join(dir, f), "utf8")) as MakeJob];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function readJob(projectId: string, id: string): MakeJob | undefined {
  try {
    return JSON.parse(readFileSync(jobFile(projectId, id), "utf8")) as MakeJob;
  } catch {
    return undefined;
  }
}

/**
 * Changes a few things about a job as it is on disk now, not as it was when `job` was read: what it's for may have
 * moved on meanwhile (a cast member renamed, see renameInJobs).
 */
function updateJob(projectId: string, job: MakeJob, patch: Partial<MakeJob>): MakeJob {
  return saveJob(projectId, { ...(readJob(projectId, job.id) ?? job), ...patch });
}

function saveJob(projectId: string, job: MakeJob): MakeJob {
  const next = { ...job, updatedAt: new Date().toISOString() };
  mkdirSync(jobsDir(projectId), { recursive: true });
  const file = jobFile(projectId, job.id);
  writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  replaceFile(`${file}.tmp`, file);
  return next;
}

// ---- What can make what, with the services there are.

/**
 * Every service's state, whichever is in use: a key in the Keychain counts as ready (checking it costs a request), and
 * so does a plan the person's agent CLI is signed in on.
 */
export function connectedStates(): Record<string, ServiceState> {
  const saved = readSettings().services;
  return {
    ...Object.fromEntries(SERVICES.map((s) => [s.id, saved[s.id] ? { label: s.label, state: "ready" } : { label: s.label, state: "missing" }])),
    ...planStates(),
    // ComfyUI counts as ready once it's connected (in Settings → Making), as a key does, and says which workflows can't run there and why.
    comfy: comfyState(),
  };
}

/**
 * The service the person chose to prefer for stills or for video (Settings → Making), while it's still connected.
 * Undefined when they haven't chosen one (or disconnected it): every connected service is usable either way, and Auto
 * picks the best model and cheapest or free route across all of them.
 */
export function preferredProvider(op: MakeOp, states = connectedStates()): string | undefined {
  return preferredOf(CATALOG, op, states, readSettings().make?.provider?.[op]);
}

/** A service stills or video can be made on, for Settings → Making and first launch. */
export type ProviderRow = {
  id: string;
  label: string;
  /** A plan the person's agent CLI is signed in on, or a service with a key. */
  kind: "plan" | "key";
  state: ServiceState["state"];
  /** What checking it said: the balance on a key, or why a plan can't be used. */
  detail?: string;
  /** The models it offers. */
  models: string[];
  /** Where to get a key. */
  keyUrl?: string;
  /** Whether the person chose this service as their preferred one for Auto and shared models. */
  preferred: boolean;
};

/** Every service stills or video could come from, by name, with what each offers and whether it's preferred. */
export function providerRows(op: MakeOp): ProviderRow[] {
  const states = connectedStates();
  const pref = preferredProvider(op, states);
  const saved = readSettings().services;
  return providersOf(CATALOG, op)
    .map(({ id, models }): ProviderRow => {
      const s = states[id] ?? { label: id, state: "missing" as const };
      const detail = s.state === "failing" ? s.detail : saved[id]?.detail;
      return { id, label: s.label, kind: PLAN_ROUTES.includes(id) ? "plan" : "key", state: s.state, ...(detail ? { detail } : {}), models, keyUrl: SERVICES.find((x) => x.id === id)?.keyUrl, preferred: id === pref };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Sets or clears the preferred service for stills or for video (null means no preference: any connected service). */
export function chooseProvider(op: MakeOp, id: string | null) {
  if (id !== null && !providersOf(CATALOG, op).some((p) => p.id === id)) throw new Error(`"${id}" doesn't make ${op === "image" ? "stills" : "video"}`);
  updateSettings((s) => {
    const provider = ((s.make ??= {}).provider ??= {});
    if (id === null) delete provider[op];
    else provider[op] = id;
  });
}

/** Routes that run on the person's own machines rather than a service with a key. */
const LOCAL_ROUTES = OWN_HARDWARE;

/** Multimodal reference audio as the tools and studio ask for it (shorthands or explicit stretches). */
export type AudioRefAsk =
  | AudioRef
  | "music"
  | "speech"
  | { kind: "music"; from?: number; to?: number; label?: string }
  | { kind: "speech"; lines?: string[]; from?: number; to?: number; label?: string }
  | { kind: "voice"; cast: string; asset?: string; from?: number; to?: number; label?: string }
  | { kind: "asset"; asset: string; from?: number; to?: number; role?: AudioRefRole; label?: string };

/** Something to make, as the agent's tools and the studio ask for it. */
export type MakeAsk = Partial<Omit<MakeRequest, "op" | "start" | "end" | "drive" | "speech" | "clip" | "camera" | "audioRefs">> & {
  op: MakeOp;
  cut?: string;
  /** A placeholder or generated shot it's for: its length, the cut's shape and its description fill in what's missing, and the takes land on it. */
  shot?: string;
  /** A cast member (or variant: cat/heist) it's a sheet for: the stills join its pictures. */
  sheet?: string;
  /**
   * With `sheet`: which kind of cast sheet to make ("portrait", "face-sheet" for a 360° 6-panel face turnaround,
   * "outfit-sheet" for a headless/ghost-mannequin front+back outfit turnaround, or "sheet" for a combined sheet).
   */
  sheetKind?: SheetKind;
  /**
   * With `sheet`, for a character: a head-and-shoulders portrait instead (shorthand for `sheetKind: "portrait"`).
   */
  portrait?: boolean;
  /** Optional override for how decoupled character face + outfit ingredients are packaged for the model. */
  castPack?: CastPackStrategy;
  /** Cast and sets in it beyond the ones the prompt names. */
  cast?: string[];
  /** Asset id of the picture a clip starts from, or "board": the shot's chosen still. */
  start?: string;
  /** Asset id of the picture a clip ends on. Without it, a generated shot whose clips ended on a frame ends on it again; null for none. */
  end?: string | null;
  /**
   * For a clip that copies movement: the clip to follow, from a second of it (default 0) to another (default the shot's
   * length later). Without it, a generated shot's clips follow what its takes followed before; null for none.
   */
  drive?: { asset: string; from?: number; to?: number } | null;
  /**
   * For a clip that lip-syncs: what it says. The cut's voice lines heard while the shot plays (`lines`, or by default
   * the ones said by the cast in it, else all of them), or a stretch of a file's sound (`asset`, from a second of it,
   * default 0, to another, default the shot's length later). Without it, a generated shot whose takes said something
   * says it again, and a clip to change (`clip`) says the shot's lines; null for none.
   */
  speech?: { lines?: string[]; asset?: string; from?: number; to?: number } | null;
  /**
   * For a clip that lip-syncs by changing the mouths in a clip rather than making the start picture talk: "take", the
   * clip the shot shows (where the shot plays it), or a clip from a second of it to another.
   */
  clip?: "take" | { asset: string; from?: number; to?: number };
  /**
   * For a clip that keeps another's camera (its move, its framing, where its cuts fall): "blockout" (or `{ blockout: true }`)
   * follows this shot's own 3D blockout (`shot.blockout`), a legacy `{ cut }` follows a cut stretch, or `{ asset }` follows
   * a stretch of a clip. The take is as long as the stretch. A picture to start from goes as a reference instead, and there's
   * no end frame. Without it, a generated shot whose takes kept a camera keeps it again unless this take copies movement or
   * lip-syncs instead; null for none.
   */
  camera?: "blockout" | { blockout: true; mode?: "video" | "sheet" } | { cut: string; shots?: string[]; mode?: "video" | "sheet" } | { asset: string; from?: number; to?: number } | null;
  /** Conditioning role of the reference video (defaults to "blockout" for cuts and "clip" for assets). */
  cameraKind?: CameraKind;
  /** Local pre-processed conditioning video file sent in place of the raw asset stretch. */
  cameraFile?: string;
  /**
   * Multimodal reference audio clips sent on reference-to-video (MAGI-2, Seedance 2.5, Wan 3.0, MiniMax H3 on Runway).
   * Combines with reference pictures and 3D camera blockouts; any start frame is promoted to a reference picture.
   * Without it, a generated shot whose takes used audioRefs keeps them unless this take copies movement or lip-syncs; null for none.
   */
  audioRefs?: AudioRefAsk[] | null;
  /** Save the finished clip as a version of an existing clip stretch (relight, swap, etc.). */
  versionOf?: MakeJob["versionOf"];
  model?: string;
};

/** A request in full, with what goes to the model: the prompt with its cast described, and the cast it names. */
export type FullRequest = MakeRequest & {
  sent: string;
  cast: string[];
  /** For a clip: the characters it's about that its pictures aren't known to show, by name (missingFromFrames). */
  absent?: string[];
};

/** Resolves which kind of cast reference still a `sheet` request asks for. */
function effectiveSheetKind(member: CastMember, ask: Pick<MakeAsk, "sheetKind" | "portrait">): SheetKind {
  if (ask.sheetKind) return ask.sheetKind;
  if (ask.portrait) return "portrait";
  if (member.kind === "wardrobe") return "outfit-sheet";
  return "sheet";
}

/**
 * The prompt a cast sheet is made from when none is given: clean views of one cast member, to give models later, in
 * its style (its own, else the look's). Without a style, a photograph, said in so many words: "reference sheet" alone
 * gets a drawing, and the boards made from a drawn sheet come out drawn too.
 *
 * - `"portrait"`: head-and-shoulders frontal shot to lock likeness first.
 * - `"face-sheet"`: 360° symmetrical 3×2 six-panel face turnaround (profiles, front, 3/4 views, back of head) on
 *   neutral mid-gray — bare neck/shoulders unless `headwear === "face"`.
 * - `"outfit-sheet"`: headless (or ghost-mannequin when `headwear === "ghost"`) full-body front + back turnaround on
 *   neutral mid-gray, with zero real-person face in frame.
 * - `"sheet"`: legacy 3-panel combined character sheet (close-up face, front body cropped at neck, back view).
 */
function sheetPrompt(
  member: CastMember,
  id: string,
  style: string | undefined,
  kind: SheetKind,
  variant?: NonNullable<CastMember["variants"]>[number],
  allCast?: CastMember[],
): string {
  if (member.kind === "style") return `A single still that shows the look of @${id}.`;
  if (member.kind === "place")
    return style
      ? `A wide establishing view of @${id}, empty of people, nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A wide establishing photograph of @${id} in even daylight, empty of people, nothing else in the picture and no text or labels.`;
  if (member.kind === "prop")
    return style
      ? `A reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A photographic reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;

  if (member.kind === "character" && member.nonHuman) {
    if (kind === "portrait") {
      return style
        ? `A clean full-figure hero study of @${id} from a three-quarter front angle on a seamless neutral mid-gray studio background, showing full proportions, markings, colors and details clearly, nothing else in the picture and no text or labels, in the style of @${style}.`
        : `A photographic full-figure hero study of @${id} from a three-quarter front angle on a seamless neutral mid-gray studio background, showing full proportions, markings, colors and details clearly, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
    }
    const views =
      "arranged cleanly side by side on a seamless neutral mid-gray studio background: front view, three-quarter view, side profile, and back view, keeping identical proportions, silhouette, markings, colors and details across every view";
    return style
      ? `A multi-angle full-body character turnaround sheet of @${id}, ${views}. Nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A photographic multi-angle full-body character turnaround sheet of @${id}, ${views}. Soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
  }

  const headwear: HeadwearMode | undefined =
    variant?.headwear ?? member.headwear ?? (member.kind === "character" ? resolveWardrobe(variant?.outfit ?? member.outfit, allCast)?.headwear : undefined);

  if (kind === "outfit-sheet" || member.kind === "wardrobe") {
    const linkedAbout = member.kind === "character" ? resolveWardrobe(variant?.outfit ?? member.outfit, allCast)?.about : undefined;
    const outfitDesc =
      member.kind === "wardrobe"
        ? [member.about, member.wears, variant?.about].filter(Boolean).join("; ")
        : [member.wears, linkedAbout, variant?.about].filter(Boolean).join("; ");
    const subject = outfitDesc ? `the outfit (${outfitDesc})` : `the outfit for ${member.name || member.id}`;
    const headClause =
      headwear === "ghost"
        ? "The costume includes its headwear (hat, hood, veil, helmet or mask) holding its natural 3D shape in position above the collar over an empty neutral-gray void — completely faceless with no head, no mannequin and no skin inside."
        : "Displayed as a standalone costume on an invisible ghost mannequin: completely headless, the collar ends cleanly at the neck with empty neutral-gray background above it, no head, no face and no skin.";
    const layout = `a two-panel turnaround sheet arranged side by side against a seamless neutral mid-gray studio background: left panel shows a full-body frontal view in a neutral standing pose; right panel shows a full-body rear view (back profile) in the identical neutral standing pose. ${headClause}`;
    return style
      ? `An outfit turnaround sheet of ${subject}: ${layout} Nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A photographic outfit turnaround sheet of ${subject}: ${layout} Soft even studio light, realistic fabric and textures, photographed rather than drawn, nothing else in the picture and no text or labels.`;
  }

  if (kind === "face-sheet") {
    const faceWear =
      headwear === "face"
        ? ", keeping anything worn directly on the head or face consistently across every angle"
        : ", bare neck and shoulders with no clothes or headwear";
    const grid = `presented as a single, perfectly symmetrical 3x2 grid (three columns, two rows) of six identical-sized head-and-shoulders panels separated by thin clean dark gutter lines against a seamless neutral mid-gray studio background, neutral relaxed expression${faceWear}. Top row left: full left side profile; top row middle: direct frontal view facing the camera; top row right: full right side profile; bottom row left: left three-quarter view; bottom row middle: direct back of head view; bottom row right: right three-quarter view. Identical hair, skin, features and proportions across all six panels`;
    return style
      ? `A 360-degree multi-panel character face study of @${id}, ${grid}. Nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A hyper-realistic multi-panel photographic character face study of @${id}, ${grid}. Soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
  }

  if (kind === "portrait") {
    if (headwear === "none" || headwear === "ghost") {
      return style
        ? `A head-and-shoulders portrait of @${id} facing the camera with a neutral relaxed expression, bare neck and shoulders, no hat or costume on the head, on a plain neutral mid-gray background, nothing else in the picture and no text or labels, in the style of @${style}.`
        : `A photographic head-and-shoulders portrait of @${id} facing the camera with a neutral relaxed expression, bare neck and shoulders, no hat or costume on the head, on a plain neutral mid-gray background, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
    }
    return style
      ? `A head-and-shoulders portrait of @${id} facing the camera, with anything worn on the head or face, on a plain light gray background, nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A photographic head-and-shoulders portrait of @${id} facing the camera, with anything worn on the head or face, on a plain light gray background, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
  }

  const panels =
    "in three panels side by side on a plain light gray background: a close-up of the head and face, with anything worn on them; a full-length front view cropped at the neck, so the face shows only once; and a full-length back view";
  return style
    ? `A reference sheet of @${id} ${panels}. Nothing else in the picture and no text or labels, in the style of @${style}.`
    : `A photographic reference sheet of @${id} ${panels}. Soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
}

/** A character's or prop's own photos (brought in, recorded, or a still from their footage), not anything made of them. */
function ownPhotos(project: Project, member: CastMember): string[] {
  const ids = [...new Set([...(member.images ?? []), ...(member.kept ?? []), ...(member.seen ?? []).map((s) => s.asset)])];
  return ids.filter((id) => {
    const a = project.assets.find((x) => x.id === id);
    return a?.kind === "image" && !a.cutout && ["import", "capture", "recorded", undefined].includes(a.provenance?.source);
  });
}

/**
 * What a character's or wardrobe's portrait, 360° face sheet, outfit turnaround, or combined sheet is made from, in
 * order, and the words that say which picture is which.
 */
function lookRefs(
  project: Project,
  member: CastMember,
  variantId: string | undefined,
  kind: SheetKind,
  pictures: number,
  styled: string | undefined,
): { refs: string[]; words: string } {
  const variant = variantId ? member.variants?.find((v) => v.id === variantId) : undefined;
  const look = variant ?? member;
  const asset = (id: string | undefined) => (id ? project.assets.find((a) => a.id === id && a.kind === "image") : undefined);
  const stylePic = styled ? project.cast?.find((m) => m.id === styled)?.images?.[0] : undefined;
  const who = member.name || member.id;

  if (member.kind === "character" && member.nonHuman) {
    const portrait = kind === "portrait";
    const settled = variant ? [member.sheet, member.portrait, ...(member.images ?? [])].find(asset) : undefined;
    const anchor = portrait ? (variant ? settled : undefined) : [look.portrait, settled].find(asset);
    const extras = (look.faces ?? (variant ? [] : ownPhotos(project, member))).filter((id) => asset(id) && id !== anchor);
    const maxRefs = Math.max(1, pictures - (stylePic ? 1 : 0));
    const refs = [...(anchor ? [anchor] : []), ...extras].slice(0, maxRefs);
    const withStyle = !!stylePic && refs.length < pictures;
    const words: string[] = [];
    if (anchor) {
      const role = [look.sheet, member.sheet].includes(anchor) ? "turnaround sheet" : "hero still";
      if (refs.length > 1) {
        words.push(
          `The first reference picture is ${who}'s chosen ${role}, and the next ${refs.length - 1 === 1 ? "picture is another photo" : `${refs.length - 1} pictures are additional photos`} of ${who}: keep ${who}'s exact proportions, silhouette, markings, colors and details across every view.`,
        );
      } else {
        words.push(`The first reference picture is ${who}'s chosen ${role}: keep ${who}'s exact proportions, silhouette, markings, colors and details across every view.`);
      }
    } else if (refs.length) {
      words.push(`The reference photos show ${who}: keep ${who}'s exact proportions, silhouette, markings, colors and details across every view.`);
    }
    if (withStyle) words.push("The last reference picture shows the style to draw it in, not who or what it is.");
    return { refs: [...refs, ...(withStyle ? [stylePic!] : [])], words: words.join(" ") };
  }

  if (kind === "outfit-sheet" || member.kind === "wardrobe") {
    // Outfit turnarounds NEVER pull in face photos: clean garments only (and for variants, edit directly from the base outfitSheet!).
    const baseOutfit = variant ? [member.outfitSheet, member.sheet].find(asset) : undefined;
    const rawWardrobe = (
      variant
        ? (variant.wardrobe?.length ? variant.wardrobe : baseOutfit ? [] : (member.wardrobe ?? []))
        : (member.wardrobe?.length ? member.wardrobe : member.kind === "wardrobe" ? ownPhotos(project, member) : [])
    ).filter(asset);
    const baseList = baseOutfit ? [baseOutfit] : [];
    const room = Math.max(0, pictures - baseList.length - (stylePic ? 1 : 0));
    const w = rawWardrobe.filter((id) => id !== baseOutfit).slice(0, room);
    const withStyle = !!stylePic && baseList.length + w.length < pictures;
    const words: string[] = [];
    if (baseOutfit) {
      words.push("The first reference picture is the base outfit turnaround sheet: keep the exact same garments, seams, silhouette, neutral standing pose and neutral gray background, changing only what is different in this look.");
    }
    if (w.length) {
      words.push(
        `The ${baseOutfit ? "next" : "first"} ${w.length === 1 ? "reference picture shows" : `${w.length} reference pictures show`} the clothes to turn into a clean turnaround: copy the garments, colors, patterns and fit exactly, and take nothing else from ${w.length === 1 ? "it" : "them"}, not a face and not a place.`,
      );
    }
    if (withStyle) words.push("The last reference picture shows the style to draw it in, not who or what it is.");
    return { refs: [...baseList, ...w, ...(withStyle ? [stylePic!] : [])], words: words.join(" ") };
  }

  if (kind === "face-sheet") {
    // 360° face turnaround: anchor on the chosen portrait (or base faceSheet for a variant), plus extra raw face photos
    // from other angles when available so side/3/4 geometry is grounded in reality. Never pull in wardrobe photos!
    const settled = variant ? [member.faceSheet, member.portrait, member.sheet, ...(member.images ?? [])].find(asset) : undefined;
    const anchor = [look.portrait, settled].find(asset);
    const extraFaces = (look.faces ?? (variant ? [] : ownPhotos(project, member))).filter((id) => asset(id) && id !== anchor);
    const maxFaces = Math.max(1, pictures - (stylePic ? 1 : 0));
    const faces = [...(anchor ? [anchor] : []), ...extraFaces].slice(0, maxFaces);
    const withStyle = !!stylePic && faces.length < pictures;
    const words: string[] = [];
    if (anchor) {
      const role = [look.faceSheet, member.faceSheet].includes(anchor) ? "360-degree face sheet" : [look.portrait, member.portrait].includes(anchor) ? "portrait" : "sheet";
      if (faces.length > 1) {
        words.push(
          `The first reference picture is ${who}'s chosen ${role}, and the next ${faces.length - 1 === 1 ? "picture is another photo" : `${faces.length - 1} pictures are additional photos`} of ${who} from other angles: keep ${who}'s exact face, hair, skin, bone structure and proportions across all six panels.`,
        );
      } else {
        words.push(`The first reference picture is ${who}'s chosen ${role}: keep ${who}'s exact face, hair, skin and features across all six panels.`);
      }
    } else if (faces.length) {
      words.push(`The reference photos show ${who}: keep ${who}'s exact face, hair, skin, features and proportions across all six panels.`);
    }
    if (withStyle) words.push("The last reference picture shows the style to draw it in, not who or what it is.");
    return { refs: [...faces, ...(withStyle ? [stylePic!] : [])], words: words.join(" ") };
  }

  const portrait = kind === "portrait";
  const headwear: HeadwearMode | undefined = variant?.headwear ?? member.headwear;
  const barePortrait = portrait && (headwear === "none" || headwear === "ghost");
  const settled = variant ? [member.portrait, member.faceSheet, member.sheet, ...(member.images ?? [])].find(asset) : undefined;
  const chosen = portrait ? undefined : [look.portrait, settled].find(asset);
  const faces = (chosen ? [chosen] : (look.faces ?? (portrait && settled ? [settled] : ownPhotos(project, member)))).filter(asset);
  const wardrobe = barePortrait ? [] : ((variant?.wardrobe?.length ? variant.wardrobe : member.wardrobe) ?? []).filter(asset);
  const w = wardrobe.slice(0, Math.max(0, pictures - 1));
  const f = faces.slice(0, Math.max(1, pictures - w.length - (stylePic ? 1 : 0)));
  const withStyle = !!stylePic && f.length + w.length < pictures;
  const words: string[] = [];
  // Named by its role, not its tags: a photo brought in can be tagged "portrait" for its shape.
  const made = !f[0] ? undefined : [look.portrait, member.portrait].includes(f[0]) ? "portrait" : [look.faceSheet, member.faceSheet].includes(f[0]) ? "360-degree face sheet" : [look.sheet, member.sheet].includes(f[0]) ? "sheet" : undefined;
  if (made) words.push(`The first reference picture is ${who}'s chosen ${made}: keep ${who}'s face, hair and features exactly.`);
  else if (f.length)
    words.push(
      w.length
        ? `The first ${f.length === 1 ? "reference picture shows" : `${f.length} reference pictures show`} ${who}: keep ${who}'s features, markings, colors and shape exactly.`
        : `The reference photos show ${who}: keep ${who}'s features, markings, colors and shape exactly.`,
    );
  if (w.length)
    words.push(
      `The ${f.length ? "next" : "first"} ${w.length === 1 ? "reference picture shows" : `${w.length} show`} the clothes to dress ${who} in: copy the garments, colors, patterns and fit exactly, and take nothing else from ${w.length === 1 ? "it" : "them"}, not a face and not a place.`,
    );
  if (withStyle) words.push("The last reference picture shows the style to draw it in, not who or what it is.");
  return { refs: [...f, ...w, ...(withStyle ? [stylePic!] : [])], words: words.join(" ") };
}

/** The still a shot's clips start from: the take showing when it's a still, else the one its clip was made from (start, image ref, or latest still take). */
function boardOf(project: Project, shot: Shot | undefined): string | undefined {
  const c = shot?.content;
  if (c?.kind !== "generated") return undefined;
  const isImg = (id: string | undefined) => !!id && project.assets.find((a) => a.id === id)?.kind === "image";
  if (isImg(c.take)) return c.take;
  if (isImg(c.start)) return c.start;
  return c.refs?.find(isImg) ?? [...(c.takes ?? [])].reverse().find(isImg);
}

/** Options controlling how `requestFor` packs cast references for a target model. */
export type RequestPackOpts = { pictures?: number; strategy?: CastPackStrategy; videoAutoRefs?: boolean };

/**
 * The request in full. A shot fills in its length (for video), the cut's shape and its description; a sheet, a
 * prompt for clean views of its cast member (portrait, 360° face turnaround, headless outfit turnaround, or combined
 * sheet). Cast named with @ are described in what the model reads, and stills (plus reference-to-video / camera-blockout
 * requests without a start frame) receive their cast pictures packaged for the target model's strategy and ref budget.
 */
export function requestFor(projectId: string, ask: MakeAsk, pack: number | RequestPackOpts = fewestStillRefs(CATALOG)): FullRequest {
  const pictures = typeof pack === "number" ? pack : (pack.pictures ?? fewestStillRefs(CATALOG));
  const strategy: CastPackStrategy = (typeof pack === "number" ? undefined : pack.strategy) ?? ask.castPack ?? "split-360";
  const videoAutoRefs = typeof pack === "number" ? false : !!pack.videoAutoRefs;

  const { project } = loadProject(projectId, ask.cut);
  const shot = ask.shot ? project.shots.find((s) => s.id === ask.shot) : undefined;
  if (ask.shot && !shot) throw new Error(`No shot "${ask.shot}" in this cut`);
  const [castId, variantId] = (ask.sheet ?? "").split("/");
  const member = ask.sheet ? project.cast?.find((m) => m.id === castId) : undefined;
  if (ask.sheet && (!member || (variantId && !member.variants?.some((v) => v.id === variantId)))) throw new Error(`No cast member "${ask.sheet}"`);
  const sheetKind = member ? effectiveSheetKind(member, ask) : undefined;
  if (member && (sheetKind === "portrait" || sheetKind === "face-sheet") && member.kind !== "character") {
    throw new Error(`A ${sheetKind === "portrait" ? "portrait" : "face sheet"} is of a character; @${castId} is a ${member.kind}`);
  }
  if (member && sheetKind === "outfit-sheet" && member.kind !== "character" && member.kind !== "wardrobe") {
    throw new Error(`An outfit sheet is of a character or wardrobe; @${castId} is a ${member.kind}`);
  }
  if (member?.kind === "character" && member.nonHuman && (sheetKind === "face-sheet" || sheetKind === "outfit-sheet")) {
    throw new Error(`@${castId} is a non-human character and uses a full-body turnaround sheet ("sheet") or hero still ("portrait"), not ${sheetKind}`);
  }
  const variant = member && variantId ? member.variants?.find((v) => v.id === variantId) : undefined;
  const needs = shot ? shotNeeds(project, shot.id, ask.op) : undefined;
  const format = project.formats[0]!;
  // The style made shots are drawn in; a sheet takes its member's own when it has one, and names it in its prompt.
  const style = (id: string | undefined) => (id && project.cast?.some((m) => m.id === id && m.kind === "style") ? id : undefined);
  const lookStyle = style(project.look?.style);
  const prompt = (ask.prompt ?? needs?.prompt ?? (member ? sheetPrompt(member, ask.sheet!, style(member.style) ?? lookStyle, sheetKind!, variant, project.cast) : "")).trim();
  const shotCast = shot?.content.kind === "generated" ? (shot.content.cast ?? []) : [];
  const uses = castOf(prompt, project.cast, [...(ask.cast ?? []), ...shotCast, ...(!member && lookStyle ? [lookStyle] : [])]);
  const start = ask.start === "board" ? boardOf(project, shot) : ask.start;
  if (ask.start === "board" && !start) throw new Error(`Shot "${ask.shot}" has no board yet: make stills for it first`);
  // A take asked to keep a camera doesn't also copy the movement the shot's takes copied before.
  const drive = ask.op === "video" ? driveFor(project, ask.drive === undefined && shot?.content.kind === "generated" && !ask.camera ? shot.content.drive : ask.drive, needs?.seconds) : undefined;
  const clip = ask.op === "video" ? clipFor(project, shot, ask.clip, needs?.seconds) : undefined;
  // The camera the shot's takes kept is kept again, unless this one is asked to follow or say something instead.
  // A shot from before shots kept it says nothing, so the take it shows is asked what it kept.
  const shown = shot?.content.kind === "generated" ? shot.content : undefined;
  const lastCamera = shown && !ask.drive && !ask.speech && !ask.clip ? (shown.camera ?? cameraOfTake(project.assets.find((a) => a.id === shown.take))) : undefined;
  const keeps = ask.camera === undefined ? lastCamera : ask.camera;
  const camera = ask.op === "video" && keeps ? cameraFor(projectId, project, shot, keeps, needs?.seconds, ask.aspect) : undefined;
  const said = ask.speech !== undefined ? ask.speech : shot?.content.kind === "generated" && shot.content.speech ? shot.content.speech : clip ? {} : undefined;
  const speech =
    ask.op === "video" && said
      ? speechFor(project, shot, said, clip ? clip.to - clip.from : needs?.seconds, uses.filter((u) => u.member.kind === "character").map((u) => u.member.id))
      : undefined;
  const keptAudio = ask.audioRefs === undefined ? (shown && !ask.drive && !ask.speech && !ask.clip ? shown.audioRefs : undefined) : ask.audioRefs ?? undefined;
  const audioRefs =
    ask.op === "video" && keptAudio?.length
      ? audioRefsFor(projectId, project, shot, keptAudio, needs?.seconds, uses.filter((u) => u.member.kind === "character").map((u) => u.member.id))
      : undefined;

  let refs = ask.refs?.length ? ask.refs : undefined;
  let packedRefs: PackedRef[] | undefined;
  // One that keeps a clip's camera or uses reference audio runs on reference-to-video, so a start frame goes first among its refs.
  if ((camera || audioRefs?.length) && start) refs = [...new Set([start, ...(refs ?? [])])];

  // For a bare 360° face sheet or bare portrait (headwear !== "face"), scrub body clothing from the @mention expansion
  // so the face study stays collarless/unclothed rather than dressing the portrait.
  const memberHeadwear = member ? (variant?.headwear ?? member.headwear) : undefined;
  const bareFaceSheet = !!member && !member.nonHuman && (sheetKind === "face-sheet" || (sheetKind === "portrait" && (memberHeadwear === "none" || memberHeadwear === "ghost"))) && memberHeadwear !== "face";
  const promptUses = bareFaceSheet
    ? uses.map((u) =>
        u.member.id === member!.id
          ? { ...u, member: { ...u.member, wears: undefined, outfit: undefined }, ...(u.variant ? { variant: { ...u.variant, outfit: undefined } } : {}) }
          : u,
      )
    : uses;
  let sent = castPrompt(prompt, promptUses, [], project.cast);

  if (!refs && ask.op === "image" && member && (member.kind === "character" || member.kind === "wardrobe")) {
    // A character's portrait, 360° face sheet, outfit turnaround, or combined sheet comes from its look's steps.
    const made = lookRefs(project, member, variantId, sheetKind!, pictures, style(member.style) ?? lookStyle);
    if (made.refs.length) {
      refs = made.refs;
      sent = `${sent.replace(/[.!?]?\s*$/, ".")} ${made.words}`;
    }
  } else if (!refs && (ask.op === "image" || (ask.op === "video" && videoAutoRefs && !start && !clip && !drive && !speech))) {
    // A non-character sheet with no pictures yet starts from the photos it was made from.
    const photos =
      ask.op === "image" && member && !member.images?.length
        ? (member.seen ?? []).map((s) => s.asset).filter((id) => project.assets.find((a) => a.id === id)?.kind === "image")
        : [];
    if (photos.length) {
      // A style's picture goes last, when there's room for it after the photos.
      const styled = style(member!.style) ?? lookStyle;
      const stylePic = styled ? project.cast?.find((m) => m.id === styled)?.images?.[0] : undefined;
      const room = stylePic ? pictures - 1 : pictures;
      refs = photos.slice(0, Math.max(1, room));
      // What to keep from the photos, whatever the style: a drawn cat is still this cat.
      const keep = member!.kind === "place" ? "its layout, colors and details" : `${member!.name}'s features, markings, colors and shape`;
      sent = `${sent.replace(/[.!?]?\s*$/, ".")} The reference photos show ${member!.name}: keep ${keep} exactly.`;
      if (stylePic && refs.length < pictures) {
        refs = [...refs, stylePic];
        sent += " The last reference picture shows the style to draw it in, not who or what it is.";
      }
    } else {
      // Package cast references for the model's strategy and ref cap (separate face + outfit, single face + outfit, or procedural composite).
      const pictured = packCastPictures(uses, { max: pictures, strategy, cast: project.cast });
      if (pictured.length) {
        packedRefs = pictured.map((p): PackedRef =>
          p.composite
            ? { kind: "composite", face: p.composite.face, outfit: p.composite.outfit, mode: p.composite.mode, role: "composite", label: `${p.use.member.name} (face + outfit)` }
            : { kind: "asset", asset: p.asset, role: p.role, label: p.use.member.name },
        );
        refs = packedRefAssets(packedRefs);
        sent = castPrompt(prompt, uses, pictured, project.cast, { refOffset: isCameraSheet(camera) ? 1 : 0 });
        // Given a sheet of views, a model can copy its layout and give back a grid of the scene (Muse Image did).
        if (ask.op === "image" && !member) sent += " The picture is one single frame of the scene, not a sheet, a grid or panels.";
      }
    }
  }
  // A variant's sheet starts from the base one, which models copy view for view; the difference has to be in all of them.
  // A variant's portrait starts from photos in other clothes, so it says what's different too.
  if (variant && !ask.prompt) {
    const scope =
      sheetKind === "portrait"
        ? "In this portrait"
        : sheetKind === "face-sheet"
          ? "Across every angle"
          : sheetKind === "outfit-sheet"
            ? "In this outfit variant (both front and back views)"
            : "In every view";
    sent = `${sent.replace(/[.!?]?\s*$/, ".")} ${scope}: ${variant.about}.`;
  }
  const sheetAspect =
    sheetKind === "portrait"
      ? member?.nonHuman
        ? "1:1"
        : "4:5"
      : sheetKind === "face-sheet"
        ? "3:2"
        : sheetKind === "outfit-sheet"
          ? "1:1"
          : member && (member.kind === "character" || member.kind === "prop")
            ? "16:9"
            : undefined;
  // A headless outfit turnaround contains no real person's face, so real-person filters don't apply to it.
  const people = sheetKind === "outfit-sheet" ? [] : realPeople(uses, project.assets);
  const timelineAudio = audioRefs?.find((a) => a.kind === "music" || a.kind === "speech");
  const along = clip ?? drive ?? speech ?? camera ?? timelineAudio;
  // A clip that ended on a frame ends on it again; one that copies movement, says a line, keeps a camera or uses audioRefs doesn't take one.
  const lastEnd = ask.op === "video" && start && !along && !audioRefs?.length && shot?.content.kind === "generated" ? shot.content.end : undefined;
  const end = camera || audioRefs?.length ? undefined : ask.end === undefined ? lastEnd : (ask.end ?? undefined);
  const absent =
    ask.op === "video" && !clip
      ? missingFromFrames(project, [...(start && !camera && !audioRefs?.length ? [start] : []), ...(end ? [end] : []), ...(refs ?? [])], uses, [prompt, shot?.intent ?? ""])
      : [];
  return {
    op: ask.op,
    prompt,
    sent,
    cast: [...new Set([...(ask.sheet ? [ask.sheet] : []), ...uses.map((u) => u.id)])],
    // Some services won't draw real people, so they're ruled out for a shot with one in it.
    ...(people.length ? { realPeople: people } : {}),
    quality: ask.quality ?? (ask.op === "video" ? "rough" : undefined),
    // A clip whose mouths are changed is the picture; it doesn't start from another. Nor does one made from camera/audio references.
    start: clip || camera || audioRefs?.length ? undefined : start,
    end,
    refs,
    ...(packedRefs?.length ? { packedRefs } : {}),
    ...(absent.length ? { absent } : {}),
    ...(drive ? { drive } : {}),
    ...(speech ? { speech } : {}),
    ...(clip ? { clip } : {}),
    ...(camera ? { camera } : {}),
    ...(audioRefs?.length ? { audioRefs } : {}),
    // A take that follows a clip is as long as the stretch it follows, and one that lip-syncs or syncs to music/speech as its span.
    seconds: along ? Math.round((along.to - along.from) * 1000) / 1000 : (ask.seconds ?? (ask.op === "video" ? needs?.seconds : undefined)),
    aspect: ask.aspect ?? sheetAspect ?? aspectOf(format.width, format.height),
    count: ask.count,
    ...(ask.via ? { via: ask.via } : {}),
  };
}

/**
 * The stretch of a clip a take follows, in full: from a second of it (default its start) to another (default the
 * shot's length later, else the clip's end), within the clip. Says what's wrong with one that can't be followed.
 */
function driveFor(project: Project, ask: { asset: string; from?: number; to?: number } | null | undefined, shotSeconds: number | undefined): Drive | undefined {
  if (!ask) return undefined;
  const clip = project.assets.find((a) => a.id === ask.asset);
  if (!clip) throw new Error(`No clip "${ask.asset}" to follow`);
  if (clip.kind !== "video") throw new Error(`"${ask.asset}" is a ${clip.kind}; the movement to copy comes from a clip`);
  const end = clip.duration ?? Infinity;
  const from = Math.max(0, ask.from ?? 0);
  const to = Math.min(end, ask.to ?? (shotSeconds !== undefined ? from + shotSeconds : end));
  if (!Number.isFinite(to)) throw new Error(`Say where to stop following "${clip.id}" (its length isn't known)`);
  if (!(to - from >= 0.1)) throw new Error(`Nothing to follow in "${clip.id}" between ${from}s and ${to}s${from >= end ? ` (it's ${end}s long)` : ""}`);
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { asset: clip.id, from: r(from), to: r(to) };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * What a take keeps the camera of, in full. "blockout" / `{ blockout: true }` follows this shot's own `shot.blockout`.
 * `{ asset }` follows a stretch of a clip. Legacy `{ cut }` follows a stretch of another cut.
 */
function cameraFor(
  projectId: string,
  project: Project,
  shot: Shot | undefined,
  ask: NonNullable<MakeAsk["camera"]>,
  shotSeconds: number | undefined,
  aspect: string | undefined,
): Camera {
  if (ask === "blockout" || (typeof ask === "object" && "blockout" in ask)) {
    if (!shot) throw new Error('Say which shot\'s blockout to follow (camera "blockout" uses a shot\'s own blockout)');
    if (!shot.blockout?.beats.length) throw new Error(`Shot "${shot.id}" has no blockout yet: set one with set_blockout first`);
    const dur = blockoutDuration(shot.blockout);
    if (!(dur >= 0.1)) throw new Error(`Shot "${shot.id}"'s blockout has no duration`);
    const mode = (typeof ask === "object" ? ask.mode : undefined) ?? shot.blockout.mode;
    return { blockout: true, shot: shot.id, cut: project.cut.id, from: 0, to: r3(dur), ...(mode ? { mode } : {}) };
  }
  if ("asset" in ask) return driveFor(project, ask, shotSeconds)!;
  let blockout: Project;
  try {
    blockout = loadProject(projectId, ask.cut).project;
  } catch {
    throw new Error(`No cut "${ask.cut}" to take the blockout from`);
  }
  if (blockout.cut.id !== ask.cut) throw new Error(`No cut "${ask.cut}" to take the blockout from`);
  const { format, from, to, missing, has } = blockoutStretch(blockout, ask.shots, aspect ?? aspectOf(project.formats[0]!.width, project.formats[0]!.height));
  if (missing.length) throw new Error(`No shot ${missing.map((id) => `"${id}"`).join(", ")} in cut "${ask.cut}" (${format.label}); it has ${has.join(", ")}`);
  if (!(to - from >= 0.1)) throw new Error(`Nothing to follow in cut "${ask.cut}"${ask.shots?.length ? ` across ${ask.shots.join(", ")}` : ""}`);
  return { cut: ask.cut, format: format.id, from: r3(from), to: r3(to), ...(ask.shots?.length ? { shots: ask.shots } : {}), ...(ask.mode ? { mode: ask.mode } : {}) };
}

/**
 * The clip a take that lip-syncs changes the mouths in: the take the shot shows, where the shot plays it (from the
 * second it starts in, for as long as the shot lasts), or a stretch of another clip.
 */
function clipFor(project: Project, shot: Shot | undefined, ask: MakeAsk["clip"], shotSeconds: number | undefined): Stretch | undefined {
  if (!ask) return undefined;
  if (ask === "take") {
    const c = shot?.content;
    if (!shot || c?.kind !== "generated") throw new Error(shot ? `Shot "${shot.id}" has no takes yet to change the mouths in` : 'Say which shot\'s take to change (clip "take" is the take a shot shows)');
    const take = project.assets.find((a) => a.id === c.take);
    if (take?.kind !== "video") throw new Error(`Shot "${shot.id}" shows a still, not a clip: make its still talk instead, or make a clip first`);
    const from = c.in ?? 0;
    const to = Math.min(take.duration ?? Infinity, shotSeconds !== undefined ? from + shotSeconds : (take.duration ?? Infinity));
    if (!Number.isFinite(to) || !(to - from >= 0.1)) throw new Error(`Can't tell how much of "${take.id}" shot "${shot.id}" plays`);
    return { asset: take.id, from: r3(from), to: r3(to) };
  }
  const a = project.assets.find((x) => x.id === ask.asset);
  if (!a) throw new Error(`No clip "${ask.asset}" to change the mouths in`);
  if (a.kind !== "video") throw new Error(`"${ask.asset}" is a ${a.kind}; mouths are changed in a clip (a still is made to talk from its board instead)`);
  const end = a.duration ?? Infinity;
  const from = Math.max(0, ask.from ?? 0);
  const to = Math.min(end, ask.to ?? (shotSeconds !== undefined ? from + shotSeconds : end));
  if (!Number.isFinite(to)) throw new Error(`Say where to stop in "${a.id}" (its length isn't known)`);
  if (!(to - from >= 0.1)) throw new Error(`Nothing to change in "${a.id}" between ${from}s and ${to}s`);
  return { asset: a.id, from: r3(from), to: r3(to) };
}

/**
 * What a take that lip-syncs says, in full. From a file: a stretch of its sound, from a second of it (default its
 * start) for as long as the take (`seconds`: the shot, or the clip whose mouths change). Else the cut's voice lines
 * heard while the shot plays, between its start and end: the ones asked for, or the ones said by the characters in it
 * (`cast`), or when none of them speaks, all of them. Without a shot, from the first line asked for to the end of the
 * last. Says what's wrong with one that can't be said: no line heard then, or one not voiced yet.
 */
function speechFor(project: Project, shot: Shot | undefined, ask: NonNullable<MakeAsk["speech"]>, seconds: number | undefined, cast: string[]): Speech {
  if (ask.asset) {
    const a = project.assets.find((x) => x.id === ask.asset);
    if (!a) throw new Error(`No file "${ask.asset}" to take what's said from`);
    if (!["video", "audio", "voice"].includes(a.kind)) throw new Error(`"${ask.asset}" is a ${a.kind}; what's said comes from a recording or a clip's sound`);
    const end = a.duration ?? Infinity;
    const from = Math.max(0, ask.from ?? 0);
    const to = Math.min(end, ask.to ?? (seconds !== undefined ? from + seconds : end));
    if (!Number.isFinite(to)) throw new Error(`Say where to stop in "${a.id}" (its length isn't known)`);
    if (!(to - from >= 0.1)) throw new Error(`Nothing to say in "${a.id}" between ${from}s and ${to}s`);
    return { asset: a.id, from: r3(from), to: r3(to) };
  }
  const voiced = project.voice?.lines ?? [];
  const unknown = (ask.lines ?? []).filter((id) => !voiced.some((l) => l.id === id));
  if (unknown.length) throw new Error(`No line ${unknown.map((id) => `"${id}"`).join(", ")} in this cut's voice`);
  const tl = resolveTimeline(project, project.formats[0]!.id);
  const span = shot && tl.shots.find((s) => s.id === shot.id);
  const asked = tl.lines.filter((l) => ask.lines?.includes(l.id));
  let from: number, to: number;
  if (span && Number.isFinite(span.start) && Number.isFinite(span.end)) [from, to] = [span.start, span.end];
  else if (!shot && asked.length) [from, to] = [Math.min(...asked.map((l) => l.start)), Math.max(...asked.map((l) => l.end))];
  else throw new Error(shot ? `Can't tell when shot "${shot.id}" plays, so not what's heard then` : "Say which lines it says, or the shot it's for (it says the lines heard while the shot plays)");
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new Error("Can't tell when those lines are heard");
  const heard = tl.lines.filter((l) => l.end > from + 1e-6 && l.start < to - 1e-6);
  const theirs = heard.filter((l) => cast.includes(voiced.find((v) => v.id === l.id)?.speaker ?? ""));
  const lines = ask.lines?.length ? heard.filter((l) => ask.lines!.includes(l.id)) : theirs.length ? theirs : heard;
  if (!lines.length)
    throw new Error(ask.lines?.length ? `${ask.lines.length === 1 ? "That line isn't" : "Those lines aren't"} heard while shot "${shot!.id}" plays` : `No voice line is heard while shot "${shot!.id}" plays: write its line and voice it first`);
  const silent = lines.filter((l) => !voiced.find((v) => v.id === l.id)?.file);
  if (silent.length) throw new Error(`${silent.map((l) => `"${l.id}"`).join(", ")} ${silent.length === 1 ? "isn't" : "aren't"} voiced yet: narrate it first`);
  return { lines: lines.map((l) => l.id), from: r3(from), to: r3(to) };
}

const AUDIO_ASSET_KINDS = ["audio", "music", "voice", "sfx", "video"];

/** Best contiguous spoken stretch (up to 10s) of a labeled speaker inside a transcribed asset, for voice-timbre references. */
function speakerSpan(projectId: string, assetId: string, speaker: string): { from: number; to: number } | undefined {
  let t: Transcript | undefined;
  try {
    t = JSON.parse(readFileSync(join(projectDir(projectId), "transcripts", `${assetId}.json`), "utf8")) as Transcript;
  } catch {
    return undefined;
  }
  const runs: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | undefined;
  for (const w of t?.words ?? []) {
    if (w.speaker !== speaker) {
      cur = undefined;
      continue;
    }
    if (cur && w.s - cur.to <= 1.5 && w.e - cur.from <= 10) cur.to = w.e;
    else {
      cur = { from: w.s, to: Math.min(w.e, w.s + 10) };
      runs.push(cur);
    }
  }
  if (!runs.length) return undefined;
  const best = runs.reduce((a, b) => (b.to - b.from > a.to - a.from ? b : a));
  return { from: r3(Math.max(0, best.from - 0.1)), to: r3(best.to + 0.1) };
}

/**
 * Resolves user/agent audio reference asks (shorthands like "music", "speech", { kind: "voice", cast }, or explicit
 * asset stretches) into concrete `AudioRef` entries with exact `[from, to]` seconds so `fitModel` can validate limits.
 */
function audioRefsFor(
  projectId: string,
  project: Project,
  shot: Shot | undefined,
  asks: AudioRefAsk[],
  shotSeconds: number | undefined,
  cast: string[],
): AudioRef[] {
  const tl = resolveTimeline(project, project.formats[0]!.id);
  const span = shot && tl.shots.find((s) => s.id === shot.id);
  const out: AudioRef[] = [];
  for (const raw of asks) {
    const item = raw === "music" ? { kind: "music" as const } : raw === "speech" ? { kind: "speech" as const } : raw;
    if (item.kind === "music") {
      if (!project.music?.cues.length || !tl.cues.length) throw new Error("This cut has no music cues yet: add a song first");
      let from: number, to: number;
      if (item.from !== undefined && item.to !== undefined) [from, to] = [item.from, item.to];
      else if (span && Number.isFinite(span.start) && Number.isFinite(span.end)) [from, to] = [item.from ?? span.start, item.to ?? span.end];
      else {
        const first = tl.cues[0]!;
        from = item.from ?? first.start;
        to = item.to ?? Math.min(first.end, from + (shotSeconds ?? 5));
      }
      if (!Number.isFinite(from) || !Number.isFinite(to) || !(to - from >= 0.1)) throw new Error("Can't tell which stretch of music to follow: pick a shot or pass from/to seconds");
      const hits = tl.cues.filter((c) => c.end > from + 1e-6 && c.start < to - 1e-6);
      if (!hits.length) throw new Error(`No music plays between ${r3(from)}s and ${r3(to)}s`);
      const label = item.label ?? (project.assets.find((a) => a.id === hits[0]!.asset)?.label || "music");
      out.push({ kind: "music", from: r3(from), to: r3(to), ...(label ? { label } : {}) });
    } else if (item.kind === "speech") {
      const voiced = project.voice?.lines ?? [];
      if (item.lines?.length && item.from !== undefined && item.to !== undefined) {
        const unknown = item.lines.filter((id) => !voiced.some((l) => l.id === id));
        if (unknown.length) throw new Error(`No line ${unknown.map((id) => `"${id}"`).join(", ")} in this cut's voice`);
        const silent = item.lines.filter((id) => !voiced.find((l) => l.id === id)?.file);
        if (silent.length) throw new Error(`${silent.map((id) => `"${id}"`).join(", ")} ${silent.length === 1 ? "isn't" : "aren't"} voiced yet: narrate it first`);
        if (!(item.to - item.from >= 0.1)) throw new Error(`Reference speech stretch between ${item.from}s and ${item.to}s is empty`);
        const label = item.label ?? (item.lines.length === 1 ? `line ${item.lines[0]}` : `${item.lines.length} voiced lines`);
        out.push({ kind: "speech", lines: item.lines, from: r3(item.from), to: r3(item.to), label });
      } else {
        const resolved = speechFor(project, shot, { ...(item.lines ? { lines: item.lines } : {}) }, shotSeconds, cast);
        if (!("lines" in resolved)) throw new Error("Expected voice lines for speech audio reference");
        const from = item.from ?? resolved.from;
        const to = item.to ?? resolved.to;
        if (!(to - from >= 0.1)) throw new Error(`Reference speech stretch between ${from}s and ${to}s is empty`);
        const label = item.label ?? (resolved.lines.length === 1 ? `line ${resolved.lines[0]}` : `${resolved.lines.length} voiced lines`);
        out.push({ kind: "speech", lines: resolved.lines, from: r3(from), to: r3(to), label });
      }
    } else if (item.kind === "voice") {
      const m = project.cast?.find((x) => x.id === item.cast);
      if (!m) throw new Error(`No cast member "${item.cast}" for voice reference`);
      let assetId = item.asset ?? m.voiceSample;
      let fallbackSpan: { from: number; to: number } | undefined;
      if (!assetId && m.heard?.length) {
        for (const h of m.heard) {
          const a = project.assets.find((x) => x.id === h.asset && AUDIO_ASSET_KINDS.includes(x.kind));
          if (!a) continue;
          const sp = speakerSpan(projectId, a.id, h.speaker);
          assetId = a.id;
          fallbackSpan = sp;
          if (sp) break;
        }
      }
      if (!assetId) throw new Error(`@${m.id} has no voice sample yet: set voiceSample on the cast member, transcribe a clip where they speak, or pass an asset`);
      const a = project.assets.find((x) => x.id === assetId);
      if (!a) throw new Error(`No file "${assetId}" for @${m.id}'s voice reference`);
      if (!AUDIO_ASSET_KINDS.includes(a.kind)) throw new Error(`"${assetId}" is a ${a.kind}; a voice reference must be audio or video`);
      const end = a.duration ?? Infinity;
      const from = Math.max(0, item.from ?? fallbackSpan?.from ?? 0);
      const to = Math.min(end, item.to ?? fallbackSpan?.to ?? Math.min(end, from + 10));
      if (!Number.isFinite(to)) throw new Error(`Say where to stop in "${a.id}" (its length isn't known)`);
      if (!(to - from >= 0.1)) throw new Error(`Nothing to sample in "${a.id}" between ${from}s and ${to}s`);
      const label = item.label ?? `${m.name}'s voice`;
      out.push({ kind: "voice", cast: m.id, asset: a.id, from: r3(from), to: r3(to), label });
    } else {
      const a = project.assets.find((x) => x.id === item.asset);
      if (!a) throw new Error(`No file "${item.asset}" for audio reference`);
      if (!AUDIO_ASSET_KINDS.includes(a.kind)) throw new Error(`"${item.asset}" is a ${a.kind}; an audio reference must be audio or video`);
      const end = a.duration ?? Infinity;
      const from = Math.max(0, item.from ?? 0);
      const to = Math.min(end, item.to ?? (shotSeconds !== undefined ? from + shotSeconds : Math.min(end, from + 10)));
      if (!Number.isFinite(to)) throw new Error(`Say where to stop in "${a.id}" (its length isn't known)`);
      if (!(to - from >= 0.1)) throw new Error(`Nothing to sample in "${a.id}" between ${from}s and ${to}s`);
      const role = item.role ?? (a.kind === "voice" ? "voice" : a.kind === "music" ? "music" : undefined);
      const label = item.label ?? a.label ?? a.id;
      out.push({ kind: "asset", asset: a.id, from: r3(from), to: r3(to), ...(role ? { role } : {}), ...(label ? { label } : {}) });
    }
  }
  return out;
}

/** The clips among some requests that would have a model make someone up, and who. One that can't be made says so when it's started. */
export function absentFrom(projectId: string, asks: MakeAsk[]): { shot?: string; who: string[] }[] {
  return asks.flatMap((ask) => {
    try {
      const who = requestFor(projectId, ask).absent;
      return who?.length ? [{ shot: ask.shot, who }] : [];
    } catch {
      return [];
    }
  });
}

/** The models for a request, sorted for a picker, with Auto first among the ready ones. */
export function makeChoices(projectId: string, ask: MakeAsk): { req: FullRequest; choices: Choices } {
  const req = requestFor(projectId, ask);
  const states = connectedStates();
  return { req, choices: chooseModels(CATALOG, req, states, [], preferredProvider(req.op, states)) };
}

/** What the agent's jobs (and the services its tools used) have cost so far in its current turn (nothing when it isn't the agent's turn). */
export function spentThisTurn(projectId: string): number {
  const turn = loadFile(projectId).doc.turn;
  if (turn?.who !== "agent") return 0;
  const spent = listJobs(projectId)
    .filter((j) => j.createdAt >= turn.since && counts(j))
    .reduce((sum, j) => sum + (j.usd ?? 0), 0);
  return Math.round((spent + ledgerSince(turn.since, projectId)) * 1000) / 1000;
}

/**
 * What making has cost since a time, in every project: the estimates of the takes asked for, less the ones that failed
 * or were stopped before they were made, and what other services cost (cleaning sound, restoring, transcribing).
 */
export function spentSince(since: string): number {
  const spent = listProjects()
    .flatMap((p) => listJobs(p.id))
    .filter((j) => j.createdAt >= since && counts(j))
    .reduce((sum, j) => sum + (j.usd ?? 0), 0);
  return Math.round((spent + ledgerSince(since)) * 1000) / 1000;
}

/**
 * Refuses something that would cost `usd` when it'd go over the spending limit, or (with `spendable`) over what the
 * agent may still spend this turn without asking.
 */
export function assertSpendable(usd: number, opts: { spendable?: number } = {}) {
  const limit = readSettings().make?.limit;
  if (limit) {
    const spent = spentSince(limit.since);
    if (spent + usd > limit.usd + 1e-9)
      throw new Error(
        `This is about $${usd.toFixed(2)}, and $${spent.toFixed(2)} of the $${limit.usd.toFixed(2)} spending limit (since ${limit.since.slice(0, 16).replace("T", " ")}) is already spent. The person can raise it in Settings.`,
      );
  }
  if (opts.spendable !== undefined && usd > opts.spendable + 1e-9)
    throw new Error(
      `This is about $${usd.toFixed(2)}, and only $${Math.max(0, opts.spendable).toFixed(2)} more can be spent this turn without asking (the person allows $${turnBudget().toFixed(2)} a turn). Ask first: a choose hand-off whose option carries this request as make, so the card shows what it sends and costs.`,
    );
}

/** How much the agent may spend in a turn before asking. */
export const turnBudget = () => readSettings().make?.turnBudgetUsd ?? 5;

/** A request checked and ready to start: what it asks, the model it goes to, and where that runs. */
type Plan = { ask: MakeAsk; req: FullRequest; fit: FitOk; shape: string };

/** Checks a request and picks its model (the one asked for, else Auto), without starting anything. */
function plan(projectId: string, ask: MakeAsk): Plan {
  const { req, choices } = makeChoices(projectId, ask);
  const where = ask.shot ? `Shot "${ask.shot}": ` : "";
  if (!req.prompt) throw new Error(`${where}say what to make: a prompt, or a shot whose description says it`);
  const { project } = loadProject(projectId, ask.cut);
  for (const id of [req.start, req.end, ...packedRefAssets(req.packedRefs, req.refs)].filter((x): x is string => !!x)) {
    const a = project.assets.find((x) => x.id === id);
    if (!a) throw new Error(`${where}no asset "${id}"`);
    if (a.kind !== "image") throw new Error(`${where}"${id}" is a ${a.kind}; start frames, end frames and references are pictures`);
  }
  if (ask.shot) {
    const c = project.shots.find((s) => s.id === ask.shot)!.content;
    if (c.kind !== "placeholder" && c.kind !== "generated") throw new Error(`Shot "${ask.shot}" is a ${c.kind} shot; takes are for placeholder and generated shots`);
  }
  const states = connectedStates();
  const preferred = preferredProvider(req.op, states);
  let full = req;
  let fit: FitOk | undefined;
  if (ask.model) {
    const model = CATALOG.find((m) => m.id === ask.model);
    if (!model) throw new Error(`No model "${ask.model}"; list_models names them`);
    let f = fitModel(model, full, states, preferred);
    // If a route has a tighter ref cap than the initial pack (e.g. Antigravity's 3-ref cap with 2 decoupled characters),
    // re-pack into procedural composites for that model/route before rejecting.
    if (!f.ok && f.why.kind === "fit" && full.op === "image" && !ask.refs?.length && (full.packedRefs?.length ?? 0) > 1) {
      const matchRoute = ask.via ? model.routes.find((r) => r.via === ask.via) : model.routes.find((r) => states[r.via]?.state === "ready");
      const cap = matchRoute?.takes?.refs ?? model.takes.refs ?? 0;
      if (cap > 0) {
        const compressed = requestFor(projectId, ask, { pictures: cap, strategy: ask.castPack ?? castPackFor(model, matchRoute) });
        const retry = fitModel(model, compressed, states, preferred);
        if (retry.ok) [full, f] = [compressed, retry];
      }
    }
    if (!f.ok) throw new Error(`${where}${model.label} can't make this: ${f.why.reason}`);
    fit = f;
  } else {
    fit = choices.auto;
    if (!fit && full.op === "image" && !ask.refs?.length && (full.packedRefs?.length ?? 0) > 1) {
      // Check if a tight-cap ready route (e.g. 3-ref plan) can run once decoupled characters are composited.
      const compressed = requestFor(projectId, ask, { pictures: 3 });
      const retryChoices = chooseModels(CATALOG, compressed, states, [], preferred);
      if (retryChoices.auto) [full, fit] = [compressed, retryChoices.auto];
    }
    if (!fit) {
      const why = [...choices.setup, ...choices.unfit].map((f) => (f.ok ? "" : `${f.label}: ${f.why.reason}`)).filter(Boolean);
      throw new Error(why.length ? `${where}nothing can make this now. ${why.join(". ")}.` : `No model makes ${req.op === "image" ? "images" : "video"}`);
    }
  }
  // Picked: tailor cast reference packaging to this exact model + route's strategy and ref cap (separate face + outfit,
  // single portrait + outfit for grid-sensitive models, or procedural composite when ref slots are tight).
  const model = CATALOG.find((m) => m.id === fit!.model)!;
  const pickedRoute = model.routes.find((r) => r.via === fit!.route && r.endpoints[shapeOf(full)] === fit!.endpoint);
  const routeCap = pickedRoute?.takes?.refs ?? model.takes.refs ?? 0;
  const strategy = ask.castPack ?? castPackFor(model, pickedRoute);
  if (full.op === "image" && !ask.refs?.length && routeCap > 0) {
    const tailored = requestFor(projectId, ask, { pictures: routeCap, strategy });
    const f = fitModel(model, { ...tailored, via: fit!.route }, states, preferred);
    if (f.ok && (tailored.sent !== full.sent || JSON.stringify(tailored.packedRefs ?? tailored.refs) !== JSON.stringify(full.packedRefs ?? full.refs))) {
      [full, fit] = [tailored, f];
    }
  } else if (
    full.op === "video" &&
    !ask.refs?.length &&
    !full.start &&
    !full.clip &&
    !full.drive &&
    !full.speech &&
    !full.refs?.length &&
    routeCap > 0 &&
    (!!pickedRoute?.endpoints.refs || !!pickedRoute?.endpoints.camera) &&
    (!!full.camera || !!full.audioRefs?.length || !!ask.model)
  ) {
    // Reference-to-video & camera blockouts without a start frame automatically receive packed cast refs (face + outfit).
    const room = Math.max(0, routeCap - (isCameraSheet(full.camera) ? 1 : 0));
    if (room > 0) {
      const withCast = requestFor(projectId, ask, { pictures: room, strategy, videoAutoRefs: true });
      if (withCast.packedRefs?.length) {
        const f = fitModel(model, { ...withCast, via: fit!.route }, states, preferred);
        if (f.ok) [full, fit] = [withCast, f];
      }
    }
  }
  const route = model.routes.find((r) => r.via === fit!.route && r.endpoints[shapeOf(full)] === fit!.endpoint)!;
  return { ask, req: full, fit, shape: route.shape };
}

/**
 * What a set of requests would cost, by model, without starting them: for a whole pass over a cut's shots. `auto` is
 * what it'd cost with each shot's Auto pick.
 */
export function estimate(
  projectId: string,
  asks: MakeAsk[],
): {
  rows: { model: string; label: string; usd: number; made: number; unfit: { shot?: string; reason: string }[] }[];
  auto: { usd: number; made: number };
  problems: { shot?: string; reason: string }[];
} {
  const out = new Map<string, { model: string; label: string; usd: number; made: number; unfit: { shot?: string; reason: string }[] }>();
  const auto = { usd: 0, made: 0 };
  // A shot that can't be asked for at all (no board yet to start from) is a problem with that shot, not the pass.
  const problems: { shot?: string; reason: string }[] = [];
  for (const ask of asks) {
    let choices: Choices;
    try {
      choices = makeChoices(projectId, ask).choices;
    } catch (err) {
      problems.push({ shot: ask.shot, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (choices.auto) {
      auto.usd = Math.round((auto.usd + (choices.auto.usd ?? 0)) * 1000) / 1000;
      auto.made++;
    }
    for (const f of [...choices.ready, ...choices.setup, ...choices.unfit]) {
      const row = out.get(f.model) ?? { model: f.model, label: f.label, usd: 0, made: 0, unfit: [] };
      if (f.ok) {
        row.usd = Math.round((row.usd + (f.usd ?? 0)) * 1000) / 1000;
        row.made++;
      } else row.unfit.push({ shot: ask.shot, reason: f.why.reason });
      out.set(f.model, row);
    }
  }
  return { rows: [...out.values()], auto, problems };
}

/**
 * Starts the takes requests ask for: checks every one first (so a pass over many shots starts all or nothing), then
 * saves a job for each take and sets them going. Returns at once; the takes land in the project as they finish. With
 * `spendable`, requests estimated to cost more than that in all are refused before anything is sent.
 */
export function startMakeAll(projectId: string, asks: MakeAsk[], opts: { spendable?: number } = {}): { plans: (Plan & { jobs: MakeJob[] })[]; usd: number } {
  const plans = asks.map((ask) => plan(projectId, ask));
  const usd = Math.round(plans.reduce((sum, p) => sum + (p.fit.usd ?? 0), 0) * 1000) / 1000;
  assertSpendable(usd, opts);
  const cut = loadProject(projectId, asks[0]?.cut).project.cut.id;
  const now = new Date().toISOString();
  const started = plans.map((p) => {
    const count = Math.max(1, p.req.count ?? 1);
    const batch = newId("b");
    const sheetMember = p.ask.sheet ? loadProject(projectId, p.ask.cut).project.cast?.find((m) => m.id === p.ask.sheet!.split("/")[0]) : undefined;
    const sheetKind = sheetMember ? effectiveSheetKind(sheetMember, p.ask) : undefined;
    const jobs = Array.from({ length: count }, () =>
      saveJob(projectId, {
        id: newId("j"),
        batch,
        cut: p.ask.cut ?? cut,
        shot: p.ask.shot,
        sheet: p.ask.sheet,
        ...(sheetKind ? { sheetKind } : {}),
        ...(sheetKind === "portrait" ? { portrait: true as const } : {}),
        op: p.req.op,
        quality: p.req.op === "video" ? p.req.quality : undefined,
        model: p.fit.model,
        route: p.fit.route,
        endpoint: p.fit.endpoint,
        shape: p.shape,
        request: {
          prompt: p.req.prompt,
          sent: p.req.sent !== p.req.prompt ? p.req.sent : undefined,
          cast: p.req.cast.length ? p.req.cast : undefined,
          start: p.req.start,
          end: p.req.end,
          refs: p.req.refs,
          ...(p.req.packedRefs?.length ? { packedRefs: p.req.packedRefs } : {}),
          ...(p.req.drive ? { drive: p.req.drive } : {}),
          ...(p.req.speech ? { speech: p.req.speech } : {}),
          ...(p.req.clip ? { clip: p.req.clip } : {}),
          ...(p.req.camera ? { camera: p.req.camera } : {}),
          ...(p.ask.cameraKind ? { cameraKind: p.ask.cameraKind } : {}),
          ...(p.ask.cameraFile ? { cameraFile: p.ask.cameraFile } : {}),
          ...(p.req.audioRefs?.length ? { audioRefs: p.req.audioRefs } : {}),
          seconds: p.fit.seconds,
          aspect: p.fit.aspect,
          seed: takesSeed(p.shape) ? randomInt(2 ** 31) : undefined,
          shotSeconds: p.req.seconds,
        },
        ...(p.ask.versionOf ? { versionOf: p.ask.versionOf } : {}),
        usd: p.fit.usd === undefined ? undefined : Math.round((p.fit.usd / count) * 1000) / 1000,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      }),
    );
    return { ...p, jobs };
  });
  void driveJobs(projectId);
  return { plans: started, usd };
}

/**
 * What a request would send, without sending anything: checked as generate checks it (so one that can't be made says
 * why), with the model it goes to, where that runs and what it costs, every picture that goes with it named for its
 * part, the blockout or clip it follows, and the words as that service gets them. A hand-off option carries this, so
 * the person can look it over before it's paid for; picking it starts the same request (startPlanned).
 */
export function planTake(projectId: string, ask: MakeAsk): PlannedTake {
  const { req: r, fit, shape } = plan(projectId, ask);
  // The request is built for its service as it would be when sent, with each picture standing in for where it'd be
  // uploaded: the pictures found in it are the ones that go (a start frame and references don't go together on some),
  // and its words are the ones the service reads, with what's added about the pictures and the blockout.
  const tag = (id: string) => `beatsheet:${id}`;
  const packedTag = (p: PackedRef) => (p.kind === "composite" ? `beatsheet:composite:${p.face}:${p.outfit}` : tag(p.asset));
  const refTags = r.packedRefs?.length ? r.packedRefs.map(packedTag) : r.refs?.map(tag);
  const sheet = isCameraSheet(r.camera);
  const stand = {
    prompt: `${r.sent ?? r.prompt}${sheet ? SHEET_LINE : ""}`,
    quality: r.quality,
    seconds: fit.seconds,
    aspect: fit.aspect,
    start: r.start && tag(r.start),
    end: r.end && tag(r.end),
    refs: sheet ? ["beatsheet:camera-sheet", ...(refTags ?? [])] : refTags,
    camera: r.camera && !sheet ? { url: "beatsheet:camera", blockout: isCameraBlockout(r.camera), ...(ask.cameraKind ? { kind: ask.cameraKind } : {}) } : undefined,
    video: r.drive || r.clip ? "beatsheet:clip" : undefined,
    audio: r.speech ? "beatsheet:sound" : undefined,
    audioRefs: r.audioRefs?.map((a, i) => ({ url: `beatsheet:audio-${i}`, role: audioRefRole(a), label: a.label })),
    muteAudio: hasTimelineAudioRef(r.audioRefs) || undefined,
  };
  let built: Record<string, unknown> | undefined;
  try {
    if (fit.route === "tein") built = teinInput(shape, fit.endpoint, stand);
    else if (fit.route === "fal") built = falInput(shape, stand);
    else if (fit.route === "runway") built = runwayInput(shape, fit.endpoint, { ...stand, refs: r.op === "video" && r.start ? undefined : stand.refs }).body;
    else if (fit.route === "higgsfield") built = higgsfieldInput(shape, fit.endpoint, { ...stand, refs: r.start ? undefined : stand.refs }).body;
    else if (fit.route === "openrouter")
      built =
        r.op === "image"
          ? openrouterImageInput(shape, fit.endpoint, stand)
          : openrouterVideoInput(shape, fit.endpoint, { ...stand, refs: r.start ? undefined : stand.refs });
  } catch {
    // A shape built some other way: the request as asked for.
  }
  const sent = built && JSON.stringify(built);
  const refParts = r.packedRefs?.length
    ? r.packedRefs.map((p) =>
        p.kind === "composite"
          ? {
              asset: p.face,
              as: "ref" as const,
              role: p.role,
              composite: { face: p.face, outfit: p.outfit, mode: p.mode },
              _tag: packedTag(p),
            }
          : { asset: p.asset, as: "ref" as const, ...(p.role ? { role: p.role } : {}), _tag: packedTag(p) },
      )
    : (r.refs ?? []).map((asset) => ({ asset, as: "ref" as const, _tag: tag(asset) }));
  const parts = [
    ...(r.start ? [{ asset: r.start, as: "start" as const, _tag: tag(r.start) }] : []),
    ...(r.end ? [{ asset: r.end, as: "end" as const, _tag: tag(r.end) }] : []),
    ...refParts,
  ];
  const told = built && [built.prompt, built.promptText, built.text].find((x): x is string => typeof x === "string");
  const free = PLAN_ROUTES.includes(fit.route) || fit.route === "comfy";
  return {
    ask: ask as Record<string, unknown>,
    op: r.op,
    cut: loadProject(projectId, ask.cut).project.cut.id,
    ...(ask.shot ? { shot: ask.shot } : {}),
    ...(ask.sheet ? { sheet: ask.sheet } : {}),
    model: fit.model,
    label: fit.label,
    where: fit.where,
    ...(free ? { usd: 0 } : fit.usd !== undefined ? { usd: fit.usd } : {}),
    count: Math.max(1, r.count ?? 1),
    ...(fit.seconds !== undefined ? { seconds: fit.seconds } : {}),
    ...(fit.aspect ? { aspect: fit.aspect } : {}),
    pictures: (sent ? parts.filter((p) => sent.includes(JSON.stringify(p._tag))) : parts).map(({ _tag: _drop, ...p }) => p),
    ...(r.camera ? { camera: r.camera } : {}),
    ...(r.drive ? { drive: r.drive } : {}),
    ...(r.clip ? { clip: r.clip } : {}),
    ...(r.speech ? { speech: r.speech } : {}),
    ...(r.audioRefs?.length ? { audioRefs: r.audioRefs } : {}),
    told: told ?? r.sent ?? r.prompt,
  };
}

/** What two plans of a take would send differs in: a few words for each difference, none when they're the same. */
export function planChanges(was: PlannedTake, now: PlannedTake): string[] {
  const out: string[] = [];
  if (was.model !== now.model || was.where !== now.where) out.push(`it would go to ${now.label} on ${now.where}, not ${was.label} on ${was.where}`);
  const pics = (p: PlannedTake) =>
    p.pictures
      .map((x) => `${x.as}:${x.composite ? `${x.composite.mode}:${x.composite.face}+${x.composite.outfit}` : x.asset}${x.role ? `(${x.role})` : ""}`)
      .join(",");
  if (pics(was) !== pics(now)) out.push(`its pictures would be ${now.pictures.map((x) => x.asset).join(", ") || "none"}`);
  if (was.told !== now.told) out.push("its words changed");
  const along = (p: PlannedTake) => JSON.stringify([p.camera, p.drive, p.clip, p.speech, p.audioRefs]);
  if (along(was) !== along(now)) out.push("the stretch it follows changed");
  if (was.seconds !== now.seconds || was.aspect !== now.aspect || was.count !== now.count) out.push(`it would be ${now.count} × ${now.seconds ?? "?"}s at ${now.aspect ?? "its own shape"}`);
  return out;
}

/**
 * Starts the take a hand-off option planned, now that the person picked it: the same request, planned again first so
 * that what starts is what the card showed. One whose plan has changed since (an asset gone, the shot or the cast
 * changed) isn't started, and says what changed. The person's pick is their go-ahead, so the turn's own budget doesn't
 * apply; the spending limit does.
 */
export function startPlanned(projectId: string, planned: PlannedTake): { jobs: MakeJob[]; usd: number } {
  const ask = planned.ask as MakeAsk;
  const changed = planChanges(planned, planTake(projectId, ask));
  if (changed.length) throw new Error(`What it would send changed since the card was made: ${changed.join("; ")}`);
  const { plans, usd } = startMakeAll(projectId, [ask]);
  return { jobs: plans[0]!.jobs, usd };
}

/** What picking an option that planned a take did: started it (or had already), left it to the agent, or couldn't. */
export type PickStarted = { option: string; label: string } & ({ planned: PlannedTake; jobs: string[]; usd: number; before?: true } | { waiting: true } | { error: string });

/**
 * Starts the takes the picked options planned (their `make`), before the agent hears the answer, so what starts is
 * what the card showed. Not when the person said more than the pick (they may want it changed, and the agent starts
 * it), and never twice: the jobs go on the option, and one picked again says it was already started.
 */
export function startPicked(projectId: string, a: { picks?: string[]; also?: Record<string, string[]>; text?: string }): PickStarted[] {
  const ask = loadFile(projectId).doc.turn?.ask;
  if (ask?.kind !== "choose") return [];
  const picked = [
    ...ask.options.filter((o) => a.picks?.includes(o.id)).map((o) => ({ o, q: undefined as string | undefined })),
    ...(ask.questions ?? []).flatMap((q) => q.options.filter((o) => a.also?.[q.id]?.includes(o.id)).map((o) => ({ o, q: q.id }))),
  ].filter(({ o }) => o.make);
  return picked.map(({ o, q }): PickStarted => {
    const make = o.make!;
    const was = { option: o.id, label: o.label };
    if (make.started?.length) return { ...was, planned: make, jobs: make.started, usd: make.usd ?? 0, before: true };
    if (a.text?.trim()) return { ...was, waiting: true };
    try {
      const { jobs, usd } = startPlanned(projectId, make);
      const ids = jobs.map((j) => j.id);
      updateFile(projectId, (d) => {
        const now = d.turn?.ask;
        if (now?.kind !== "choose") return;
        const options = q ? now.questions?.find((x) => x.id === q)?.options : now.options;
        const made = options?.find((x) => x.id === o.id)?.make;
        if (made) made.started = ids;
      });
      return { ...was, planned: make, jobs: ids, usd };
    } catch (err) {
      return { ...was, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/** Starts the takes one request asks for (see startMakeAll). */
export function startMake(projectId: string, ask: MakeAsk, opts: { spendable?: number } = {}): { fit: FitOk; jobs: MakeJob[] } {
  const { plans } = startMakeAll(projectId, [ask], opts);
  return { fit: plans[0]!.fit, jobs: plans[0]!.jobs };
}

/** Stops jobs that haven't finished. The service is asked to drop them too; one already running may still bill. */
export async function cancelJobs(projectId: string, ids: string[]): Promise<MakeJob[]> {
  const jobs = ids.map((id) => readJob(projectId, id)).filter((j): j is MakeJob => !!j && isOpen(j));
  const keys = new Map<string, string | undefined>();
  for (const route of new Set(jobs.filter((j) => j.remote).map((j) => j.route))) keys.set(route, await getSecret(route));
  const out: MakeJob[] = [];
  for (const job of jobs) {
    const key = keys.get(job.route);
    // OpenRouter has no remote video cancel endpoint; stop tracking locally.
    if (job.remote && key && job.route !== "openrouter")
      await (job.route === "tein" ? teinCancel : job.route === "runway" ? runwayCancel : job.route === "higgsfield" ? higgsfieldCancel : falCancel)(key, job.remote);
    if (job.comfy) await comfyCancel(job.comfy.url, job.comfy.id);
    out.push(saveJob(projectId, { ...job, status: "canceled" }));
  }
  return out;
}

/**
 * Moves the jobs still being made along with a cast member (or variant) that was renamed: a sheet comes in as the
 * renamed one's picture, and takes say who's in them by the new id.
 */
export function renameInJobs(projectId: string, from: string, to: string): number {
  return remapJobs(projectId, castRenaming(from, to));
}

/** Jobs still being made for a look ("cat/heist") that's been merged into the plain one come in as the plain one's. */
export function mergeInJobs(projectId: string, look: string): number {
  return remapJobs(projectId, lookMerging(look));
}

function remapJobs(projectId: string, { key, text }: { key: (key: string) => string; text: (text: string) => string }): number {
  let moved = 0;
  for (const job of listJobs(projectId).filter(isOpen)) {
    const sheet = job.sheet && key(job.sheet);
    const cast = job.request.cast?.map(key);
    const prompt = text(job.request.prompt);
    const audioRefs = job.request.audioRefs?.map((a) => (a.kind === "voice" ? { ...a, cast: key(a.cast) } : a));
    const audioChanged = JSON.stringify(audioRefs) !== JSON.stringify(job.request.audioRefs);
    if (sheet === job.sheet && prompt === job.request.prompt && cast?.join() === job.request.cast?.join() && !audioChanged) continue;
    // Read again just before writing: the job may have moved on since the list was read.
    const now = readJob(projectId, job.id) ?? job;
    saveJob(projectId, { ...now, ...(sheet ? { sheet } : {}), request: { ...now.request, prompt, ...(cast ? { cast } : {}), ...(audioRefs ? { audioRefs } : {}) } });
    moved++;
  }
  return moved;
}

/**
 * Tries failed jobs again. One the service had finished is fetched again (results are kept for a while), not made
 * again; one it never made is sent again, and costs again.
 */
export function retryJobs(projectId: string, ids: string[]): MakeJob[] {
  const out: MakeJob[] = [];
  for (const id of ids) {
    const job = readJob(projectId, id);
    if (!job || job.status !== "failed") continue;
    const kept = job.charged && (job.remote || job.comfy || (job.file && existsSync(job.file)));
    const again = kept ? { ...job, status: "running" as const } : { ...job, status: "queued" as const, remote: undefined, once: undefined, comfy: undefined, file: undefined, charged: undefined };
    out.push(saveJob(projectId, { ...again, error: undefined }));
  }
  if (out.length) void driveJobs(projectId);
  return out;
}

// ---- Driving the jobs.

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** Takes a job for this process, unless another process that's still running has it. */
function claim(projectId: string, id: string): boolean {
  const lock = lockFile(projectId, id);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, "wx");
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      let pid = 0, age = 0;
      try {
        pid = Number(readFileSync(lock, "utf8"));
        age = Date.now() - statSync(lock).mtimeMs;
      } catch {
        continue;
      }
      if (pid === process.pid) return true;
      // An empty lock is one being written right now.
      if (!pid || (alive(pid) && age < STALE_MS)) return false;
      try {
        unlinkSync(lock);
      } catch {
        // Someone else cleared it first.
      }
    }
  }
  return false;
}

function release(projectId: string, id: string) {
  try {
    if (Number(readFileSync(lockFile(projectId, id), "utf8")) === process.pid) unlinkSync(lockFile(projectId, id));
  } catch {
    // Already gone.
  }
}

const driving = new Map<string, Promise<void>>();
const again = new Set<string>();

/**
 * Drives a project's unfinished jobs until they're done: sends what hasn't been sent, follows what has, and brings in
 * what's finished. Safe to call often (the studio does on every open, the tools on every call): one driver per
 * project per process, and jobs another live process has are left to it.
 */
export function driveJobs(projectId: string): Promise<void> {
  const running = driving.get(projectId);
  if (running) {
    again.add(projectId);
    return running;
  }
  const p = drive(projectId)
    .catch((err) => console.error(`beatsheet: making for ${projectId} stopped: ${err instanceof Error ? err.message : String(err)}`))
    .finally(() => {
      driving.delete(projectId);
      if (again.delete(projectId)) void driveJobs(projectId);
    });
  driving.set(projectId, p);
  return p;
}

async function drive(projectId: string) {
  const tries = new Map<string, number>();
  for (;;) {
    const mine = listJobs(projectId).filter((j) => isOpen(j) && claim(projectId, j.id));
    if (!mine.length) return;
    const keys = new Map<string, Promise<string | undefined>>();
    const keyFor = (route: string) => keys.get(route) ?? keys.set(route, getSecret(route)).get(route)!;
    await Promise.all(
      mine.map(async (job) => {
        try {
          await step(projectId, job, LOCAL_ROUTES.includes(job.route) ? undefined : await keyFor(job.route));
          tries.delete(job.id);
        } catch (err) {
          const n = (tries.get(job.id) ?? 0) + 1;
          tries.set(job.id, n);
          const final = !(err instanceof FalError) || err.final || n >= MAX_TRIES;
          if (final) saveJob(projectId, { ...(readJob(projectId, job.id) ?? job), status: "failed", error: err instanceof Error ? err.message : String(err) });
        }
        const now = readJob(projectId, job.id);
        if (!now || !isOpen(now)) release(projectId, job.id);
        else utimesSync(lockFile(projectId, job.id), new Date(), new Date());
      }),
    );
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/**
 * Resolves a job's reference pictures (supporting decoupled face/outfit sheets and procedural composites) into ready
 * local files, validates every referenced asset still exists in the project, and transforms each file (upload, data
 * URL, or file path).
 */
async function prepareJobRefs<T>(
  project: Project,
  dir: string,
  r: MakeJob["request"],
  transform: (file: string, ref: PackedRef, index: number) => Promise<T> | T,
): Promise<T[] | undefined> {
  const packed: PackedRef[] = r.packedRefs?.length
    ? r.packedRefs
    : (r.refs ?? []).map((asset) => ({ kind: "asset" as const, asset }));
  if (!packed.length) return undefined;
  for (const id of packedRefAssets(r.packedRefs, r.refs)) {
    if (!project.assets.some((x) => x.id === id)) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
  }
  return Promise.all(
    packed.map(async (p, i) => {
      const file = await resolvePackedRef(project, dir, p, r.cast);
      return transform(file, p, i);
    }),
  );
}

/** One step of a job: send it, or ask where it is, or bring in what it made. */
async function step(projectId: string, job: MakeJob, key: string | undefined) {
  if (job.route === "comfy") return stepComfy(projectId, job);
  const plan = PLAN_ROUTES.includes(job.route);
  if (!key && !job.file && !plan) {
    const name = SERVICES.find((s) => s.id === job.route)?.label ?? job.route;
    throw new FalError(`Making this needs a ${name} key. The person can add one in Settings → Media services.`, true);
  }
  if (DIRECT.includes(job.route) || plan) return stepDirect(projectId, job, key);
  if (job.route === "tein" && key) return stepTein(projectId, job, key);
  if (job.route === "runway" && key) return stepRunway(projectId, job, key);
  if (job.route === "higgsfield" && key) return stepHiggsfield(projectId, job, key);
  if (job.route === "openrouter" && key) return stepOpenRouter(projectId, job, key);
  if (job.route !== "fal" || !key) throw new FalError(`beatsheet can't run ${job.route} jobs yet`, true);
  if (!job.remote) {
    const { project, dir } = loadProject(projectId, job.cut);
    const upload = (id: string) => {
      const a = project.assets.find((x) => x.id === id);
      if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return falUpload(key, assetPath(project, dir, a));
    };
    const r = job.request;
    // A cast member's own photos go cut out, and decoupled face+outfit pairs composite procedurally when packed that way.
    const baseRefs = await prepareJobRefs(project, dir, r, (file) => falUpload(key, file));
    const cam = await cameraArgs(projectId, project, dir, job, (f) => falUpload(key, f), baseRefs);
    const aud = await audioRefArgs(project, dir, job, (f) => falUpload(key, f), ".wav");
    const input = falInput(job.shape, {
      prompt: cam.prompt,
      quality: job.quality,
      seconds: r.seconds,
      aspect: r.aspect,
      seed: r.seed,
      start: r.start && (await upload(r.start)),
      end: r.end && (await upload(r.end)),
      refs: cam.refs,
      video: r.drive ? await falUpload(key, await driveClip(project, dir, job)) : r.clip && (await falUpload(key, await dubClip(project, dir, job))),
      audio: r.speech && (await falUpload(key, await speechSound(project, dir, job, join(dir, ".cache", "speech", `${job.id}.wav`)))),
      audioRefs: aud.audioRefs,
      muteAudio: aud.muteAudio,
      camera: cam.camera,
    });
    const remote = await falSubmit(key, job.endpoint, input);
    updateJob(projectId, job, { status: "running", remote });
    return;
  }
  const s = await falStatus(key, job.remote);
  if (s.state !== "done") {
    const position = s.state === "queued" ? s.position : undefined;
    if (position !== job.position || job.status !== "running") updateJob(projectId, job, { status: "running", position });
    return;
  }
  if (s.error) throw new FalError(s.error, true);
  if (!job.charged) job = updateJob(projectId, job, { charged: true });
  const out = falOutput(await falResult(key, job.remote!));
  if (!out) throw new FalError("fal finished but didn't send a file", true);
  await finish(projectId, job, out);
}

/**
 * A job on Tein (tein.ts): its pictures sent up and the request sent under a key saved first, then followed until it's
 * done. Tein says what the take really cost, which replaces the estimate.
 */
async function stepTein(projectId: string, job: MakeJob, key: string) {
  if (!job.remote) {
    const { project, dir } = loadProject(projectId, job.cut);
    const r = job.request;
    const upload = (id: string) => {
      const a = project.assets.find((x) => x.id === id);
      if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return teinUpload(key, assetPath(project, dir, a));
    };
    // References don't go with a start frame there (teinInput), so they aren't sent up either.
    const baseRefs = r.start ? undefined : await prepareJobRefs(project, dir, r, (file) => teinUpload(key, file));
    const cam = await cameraArgs(projectId, project, dir, job, (f) => teinUpload(key, f), baseRefs);
    const input = teinInput(job.shape, job.endpoint, {
      prompt: cam.prompt,
      quality: job.quality,
      seconds: r.seconds,
      aspect: r.aspect,
      start: r.start && (await upload(r.start)),
      end: r.end && (await upload(r.end)),
      refs: cam.refs,
      camera: cam.camera,
    });
    if (!job.once) job = updateJob(projectId, job, { once: randomUUID() });
    const remote = await teinSubmit(key, input, job.once!);
    updateJob(projectId, job, { status: "running", remote });
    return;
  }
  const s = await teinStatus(key, job.remote);
  if (s.state !== "done") {
    if (job.status !== "running" || job.position !== undefined) updateJob(projectId, job, { status: "running", position: undefined });
    return;
  }
  if (s.error) throw new FalError(s.error, true);
  if (!s.url) throw new FalError("Tein finished but didn't send a file", true);
  if (!job.charged || (s.usd !== undefined && s.usd !== job.usd)) job = updateJob(projectId, job, { charged: true, ...(s.usd !== undefined ? { usd: s.usd } : {}) });
  await finish(projectId, job, { url: s.url });
}

/**
 * A job on Runway (runway.ts): its pictures sent up and the task started, then followed until it's done. Runway says
 * the most a task may cost when it starts and what it did cost when it ends, which replace the estimate. A task its
 * moderation turned down is charged all the same, so it's kept as paid for: trying it again asks after the same task,
 * not for another.
 */
async function stepRunway(projectId: string, job: MakeJob, key: string) {
  if (!job.remote) {
    const { project, dir } = loadProject(projectId, job.cut);
    const r = job.request;
    const picture = (id: string) => {
      const a = project.assets.find((x) => x.id === id);
      if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return a;
    };
    const upload = (id: string) => runwayUpload(key, assetPath(project, dir, picture(id)));
    // A clip from a picture comes out the picture's shape. Where Runway wants a size said even so, it's the one
    // nearest the picture's (the cut's, when the picture's isn't known), so little is cropped.
    const first = r.start ? picture(r.start) : undefined;
    const format = project.formats[0]!;
    const shape = first && (first.width && first.height ? aspectOf(first.width, first.height) : aspectOf(format.width, format.height));
    // A clip's references don't go with a start frame there (runwayInput), so they aren't sent up either.
    const baseRefs = job.op === "video" && r.start ? undefined : await prepareJobRefs(project, dir, r, (file) => runwayUpload(key, file));
    const cam = await cameraArgs(projectId, project, dir, job, (f) => runwayUpload(key, f), baseRefs);
    const aud = await audioRefArgs(project, dir, job, (f) => runwayUpload(key, f), ".wav");
    const input = runwayInput(job.shape, job.endpoint, {
      prompt: cam.prompt,
      quality: job.quality,
      seconds: r.seconds,
      aspect: r.aspect ?? shape,
      start: r.start && (await upload(r.start)),
      end: r.end && (await upload(r.end)),
      refs: cam.refs,
      audioRefs: aud.audioRefs,
      muteAudio: aud.muteAudio,
      camera: cam.camera,
    });
    const { remote, usd } = await runwaySubmit(key, input);
    updateJob(projectId, job, { status: "running", remote, ...(usd !== undefined ? { usd } : {}) });
    return;
  }
  const s = await runwayStatus(key, job.remote);
  if (s.state !== "done") {
    if (job.status !== "running" || job.position !== undefined) updateJob(projectId, job, { status: "running", position: undefined });
    return;
  }
  // What it cost counts whether or not it made anything.
  if (s.usd !== undefined && (s.usd > 0 || !s.error) && (!job.charged || s.usd !== job.usd)) job = updateJob(projectId, job, { charged: true, usd: s.usd });
  if (s.error) throw new FalError(s.error, true);
  if (!s.url) throw new FalError("Runway finished but didn't send a file", true);
  if (!job.charged) job = updateJob(projectId, job, { charged: true });
  await finish(projectId, job, { url: s.url });
}

/**
 * A job on Higgsfield (higgsfield.ts): its pictures sent up and the job started under the job's own key (so sending it
 * again after a dropped answer starts nothing new), then followed until it's done. A job there doesn't say what it
 * cost, so what Higgsfield says the request will cost this account is asked as it's sent, and replaces the estimate.
 * Nothing is charged for one that fails or that its moderation turns down.
 */
async function stepHiggsfield(projectId: string, job: MakeJob, key: string) {
  if (!job.remote) {
    const { project, dir } = loadProject(projectId, job.cut);
    const r = job.request;
    const picture = (id: string) => {
      const a = project.assets.find((x) => x.id === id);
      if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return a;
    };
    const upload = (id: string) => higgsfieldUpload(key, assetPath(project, dir, picture(id)));
    // Give models whose image-to-video defaults to 16:9 (MAGI-2) the board's own shape when aspect was left to the start frame.
    const first = r.start ? picture(r.start) : undefined;
    const format = project.formats[0]!;
    const boardAspect = first && (first.width && first.height ? aspectOf(first.width, first.height) : aspectOf(format.width, format.height));
    // A clip's references don't go with a start frame there (higgsfieldInput), so they aren't sent up either.
    const baseRefs = r.start ? undefined : await prepareJobRefs(project, dir, r, (file) => higgsfieldUpload(key, file));
    const cam = await cameraArgs(projectId, project, dir, job, (f) => higgsfieldUpload(key, f), baseRefs);
    const aud = await audioRefArgs(project, dir, job, (f) => higgsfieldUpload(key, f), ".wav");
    const input = higgsfieldInput(job.shape, job.endpoint, {
      prompt: cam.prompt,
      quality: job.quality,
      seconds: r.seconds,
      aspect: r.aspect ?? boardAspect,
      seed: r.seed,
      start: r.start && (await upload(r.start)),
      end: r.end && (await upload(r.end)),
      refs: cam.refs,
      audioRefs: aud.audioRefs,
      muteAudio: aud.muteAudio,
      camera: cam.camera,
      // The clip whose movement a take copies (Kling's motion control).
      video: r.drive && (await higgsfieldUpload(key, await driveClip(project, dir, job))),
    });
    if (!job.once) job = updateJob(projectId, job, { once: randomUUID() });
    const usd = await higgsfieldEstimate(key, input);
    const remote = await higgsfieldSubmit(key, input, job.once!);
    updateJob(projectId, job, { status: "running", remote, ...(usd !== undefined ? { usd } : {}) });
    return;
  }
  const s = await higgsfieldStatus(key, job.remote);
  if (s.state !== "done") {
    if (job.status !== "running" || job.position !== undefined) updateJob(projectId, job, { status: "running", position: undefined });
    return;
  }
  if (s.error) throw new FalError(s.error, true);
  if (!s.url) throw new FalError("Higgsfield finished but didn't send a file", true);
  if (!job.charged) job = updateJob(projectId, job, { charged: true });
  await finish(projectId, job, { url: s.url });
}

/**
 * A job on OpenRouter (openrouter.ts): stills answer synchronously in one request (saved immediately like direct.ts),
 * while video starts an async job followed until completion. Local inputs go inline as base64 data URLs, and
 * OpenRouter's exact `usage.cost` replaces the catalog estimate.
 */
async function stepOpenRouter(projectId: string, job: MakeJob, key: string) {
  if (job.op === "image") {
    if (job.file) return finish(projectId, job, { file: job.file });
    if (job.status === "running") {
      updateJob(projectId, job, { charged: true });
      throw new FalError("The engine stopped while this was being made, so the picture was lost (and may have been charged). Try again to make it again.", true);
    }
    const { project, dir } = loadProject(projectId, job.cut);
    const r = job.request;
    const refs = await prepareJobRefs(project, dir, r, (file) => openrouterDataUrl(file));
    job = updateJob(projectId, job, { status: "running" });
    const beat = setInterval(() => {
      try {
        utimesSync(lockFile(projectId, job.id), new Date(), new Date());
      } catch {
        // The lock is gone; the job's own save says what happened.
      }
    }, 10_000);
    let out: { bytes: Buffer; contentType: string; usd?: number };
    try {
      out = await openrouterImage(job.shape, job.endpoint, key, { prompt: r.sent ?? r.prompt, aspect: r.aspect, seed: r.seed, refs });
    } catch (err) {
      const now = readJob(projectId, job.id) ?? job;
      if (now.status === "running") saveJob(projectId, { ...now, status: "queued" });
      throw err;
    } finally {
      clearInterval(beat);
    }
    const folder = join(projectDir(projectId), "made", "takes");
    mkdirSync(folder, { recursive: true });
    const file = join(folder, `${job.id}${EXT[out.contentType] ?? ".jpg"}`);
    writeFileSync(file, out.bytes);
    const now = readJob(projectId, job.id) ?? job;
    job = saveJob(projectId, { ...now, file, charged: true, ...(out.usd !== undefined ? { usd: out.usd } : {}) });
    if (now.status === "canceled") return;
    await finish(projectId, job, { file });
    return;
  }
  if (!job.remote) {
    const { project, dir } = loadProject(projectId, job.cut);
    const r = job.request;
    const picture = (id: string) => {
      const a = project.assets.find((x) => x.id === id);
      if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return a;
    };
    const encode = (id: string) => openrouterDataUrl(assetPath(project, dir, picture(id)));
    // Give wide/tall-only models (Gemini Omni) the board's orientation even when aspect was left to the start frame.
    const first = r.start ? picture(r.start) : undefined;
    const format = project.formats[0]!;
    const boardAspect = first && (first.width && first.height ? aspectOf(first.width, first.height) : aspectOf(format.width, format.height));
    // Standard video models drop references when a start frame is present (frame_images takes precedence on OpenRouter).
    const baseRefs = r.start ? undefined : await prepareJobRefs(project, dir, r, (file) => openrouterDataUrl(file));
    const cam = await cameraArgs(projectId, project, dir, job, (f) => openrouterDataUrl(f), baseRefs);
    const aud = await audioRefArgs(project, dir, job, (f) => openrouterDataUrl(f), ".mp3");
    const body = openrouterVideoInput(job.shape, job.endpoint, {
      prompt: cam.prompt,
      quality: job.quality,
      seconds: r.seconds,
      aspect: r.aspect ?? boardAspect,
      seed: r.seed,
      start: r.start && encode(r.start),
      end: r.end && encode(r.end),
      refs: cam.refs,
      audio: r.speech && openrouterDataUrl(await speechSound(project, dir, job, join(dir, ".cache", "speech", `${job.id}.mp3`))),
      audioRefs: aud.audioRefs,
      muteAudio: aud.muteAudio,
      camera: cam.camera,
    });
    const remote = await openrouterSubmit(key, body);
    updateJob(projectId, job, { status: "running", remote });
    return;
  }
  const s = await openrouterStatus(key, job.remote);
  if (s.state !== "done") {
    if (job.status !== "running" || job.position !== undefined) updateJob(projectId, job, { status: "running", position: undefined });
    return;
  }
  if (s.usd !== undefined && (s.usd > 0 || !s.error) && (!job.charged || s.usd !== job.usd)) job = updateJob(projectId, job, { charged: true, usd: s.usd });
  if (s.error) throw new FalError(s.error, true);
  if (!s.url) throw new FalError("OpenRouter finished but didn't send a file", true);
  if (!job.charged) job = updateJob(projectId, job, { charged: true });
  await finish(projectId, job, { url: s.url, ...(s.auth ? { headers: { Authorization: `Bearer ${key}` } } : {}) });
}

const exec = promisify(execFile);

/**
 * The most a clip to follow may weigh: Tein's API carries about 6 MB in a request, and fal and Runway take a reference
 * video up to 200 MB (Higgsfield doesn't say, and is sent no more than that).
 */
const CAMERA_BYTES: Record<string, { most: number; said: string }> = {
  tein: { most: 5.5 * 1024 * 1024, said: "Tein's API carries" },
  fal: { most: 200 * 1024 * 1024, said: "fal takes" },
  runway: { most: 200 * 1024 * 1024, said: "Runway takes" },
  // Higgsfield's pages give no limit for a reference video; this is the most its other video inputs are said to take.
  higgsfield: { most: 200 * 1024 * 1024, said: "beatsheet sends Higgsfield" },
  // OpenRouter takes inline base64 data URLs in JSON; keep clips compact to stay under its request size limit.
  openrouter: { most: 5.5 * 1024 * 1024, said: "beatsheet sends OpenRouter" },
};
/** The fewest pixels Seedance takes in a reference video, and the frame rates it takes. */
const CAMERA_PIXELS = 407_696;
const CAMERA_FPS = { min: 24, max: 60 };

/**
 * The size to send a clip whose camera a take keeps: its own shape, no longer than 1280 on its long side and no
 * smaller than Seedance takes, in even numbers.
 */
export function cameraSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.max(Math.min(1, 1280 / Math.max(width, height)), Math.sqrt(CAMERA_PIXELS / (width * height)) * 1.01);
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/**
 * Persists a rendered blockout MP4 or 4×4 contact-sheet JPEG under `made/blockouts/<sha256>.<ext>` (content-addressed,
 * deduplicated across takes rolled from the same blockout) and records the immutable snapshot path on the job so every
 * generated take remembers the exact blockout that created it even if the shot's working blockout changes later.
 */
function persistBlockoutSnapshot(projectId: string, dir: string, job: MakeJob, srcFile: string, kind: "video" | "image"): string {
  const ext = kind === "video" ? ".mp4" : ".jpg";
  const hash = createHash("sha256").update(readFileSync(srcFile)).digest("hex").slice(0, 16);
  const folder = join(dir, "made", "blockouts");
  mkdirSync(folder, { recursive: true });
  const rel = `made/blockouts/${hash}${ext}`;
  const abs = join(folder, `${hash}${ext}`);
  if (!existsSync(abs)) copyFileSync(srcFile, abs);
  const cam = job.request.camera;
  if (cam && isCameraBlockout(cam)) {
    const nextCam = { ...cam, snapshot: rel, snapshotKind: kind };
    job.request.camera = nextCam;
    updateJob(projectId, job, { request: { ...(readJob(projectId, job.id)?.request ?? job.request), camera: nextCam } });
  }
  return abs;
}

/** Prepares camera/conditioning video or 4×4 16-frame contact sheet for any video provider. */
async function cameraArgs(
  projectId: string,
  project: Project,
  dir: string,
  job: MakeJob,
  upload: (file: string) => Promise<string> | string,
  refs: string[] | undefined,
): Promise<{ prompt: string; refs: string[] | undefined; camera: { url: string; blockout: boolean; kind?: CameraKind } | undefined }> {
  const r = job.request;
  const basePrompt = r.sent ?? r.prompt;
  if (!r.camera) return { prompt: basePrompt, refs, camera: undefined };
  if (isCameraSheet(r.camera)) {
    const sheetUrl = await upload(await blockoutSheet(projectId, dir, job));
    return { prompt: `${basePrompt}${SHEET_LINE}`, refs: [sheetUrl, ...(refs ?? [])], camera: undefined };
  }
  const clipUrl = await upload(await cameraClip(projectId, project, dir, job));
  return { prompt: basePrompt, refs, camera: { url: clipUrl, blockout: isCameraBlockout(r.camera), ...(r.cameraKind ? { kind: r.cameraKind } : {}) } };
}

/**
 * The clip a take keeps the camera of (or a pre-built conditioning video), as a file to upload. A blockout (shot-owned
 * or legacy cut) is rendered first, transcoded to what Seedance takes (H.264 MP4, 24–60 fps, silent, within size
 * limits), and saved as a content-addressed snapshot in `made/blockouts/<hash>.mp4` with temp cache files cleaned up.
 */
async function cameraClip(projectId: string, project: Project, dir: string, job: MakeJob): Promise<string> {
  const c = job.request.camera!;
  const work = join(dir, ".cache", "camera");
  mkdirSync(work, { recursive: true });
  let src: string;
  let renderedTemp = false;
  let from = c.from;
  let to = c.to;
  if (job.request.cameraFile) {
    if (!existsSync(job.request.cameraFile)) throw new FalError("The conditioning video prepared for this job isn't on disk any more", true);
    src = job.request.cameraFile;
    const info = await probe(src);
    [from, to] = [0, Math.min(info.duration ?? c.to - c.from, c.to - c.from)];
  } else if ("blockout" in c) {
    const owner = loadProject(projectId, c.cut).project;
    const shot = owner.shots.find((s) => s.id === c.shot);
    if (!shot?.blockout?.beats.length) throw new FalError(`Shot "${c.shot}" no longer has a blockout to render`, true);
    const bp = blockoutProject(owner, shot.id, shot.blockout, job.request.aspect);
    src = join(work, `${job.id}-blockout.mp4`);
    renderedTemp = true;
    try {
      await renderStretch(projectId, { cut: c.cut, format: bp.format.id, range: { from: 0, to: bp.duration }, out: src, project: bp.project });
    } catch (err) {
      throw new FalError(`Shot "${c.shot}"'s blockout couldn't be rendered: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    [from, to] = [0, bp.duration];
  } else if ("cut" in c) {
    src = join(work, `${job.id}-blockout.mp4`);
    renderedTemp = true;
    try {
      await renderStretch(projectId, { cut: c.cut, format: c.format, range: { from: c.from, to: c.to }, out: src });
    } catch (err) {
      throw new FalError(`The blockout (cut "${c.cut}") couldn't be rendered: ${err instanceof Error ? err.message : String(err)}`, true);
    }
    [from, to] = [0, c.to - c.from];
  } else {
    const clip = project.assets.find((a) => a.id === c.asset);
    if (!clip) throw new FalError("The clip this take was asked to follow isn't in the project any more", true);
    src = assetPath(project, dir, clip);
  }
  const info = await probe(src);
  if (info.kind !== "video" || !info.width || !info.height) throw new FalError("What this take was asked to follow isn't a clip that can be read", true);
  const size = cameraSize(info.width, info.height);
  const fps = Math.min(CAMERA_FPS.max, Math.max(CAMERA_FPS.min, Math.round(info.fps ?? 30)));
  const file = join(work, `${job.id}.mp4`);
  const { most, said } = CAMERA_BYTES[job.route] ?? CAMERA_BYTES.tein!;
  try {
    for (const crf of [20, 28, 34]) {
      await exec("ffmpeg", ["-v", "error", "-y", "-ss", from.toFixed(3), "-t", (to - from).toFixed(3), "-i", src, "-an", "-vf", `scale=${size.width}:${size.height}:flags=lanczos,fps=${fps}`, "-c:v", "libx264", "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", file]);
      if (statSync(file).size <= most) {
        if (isCameraBlockout(c) && !job.request.cameraFile) {
          const snap = persistBlockoutSnapshot(projectId, dir, job, file, "video");
          rmSync(file, { force: true });
          return snap;
        }
        return file;
      }
    }
    throw new FalError(`The clip to follow is ${(statSync(file).size / 1024 / 1024).toFixed(1)} MB even made small, more than ${said}. A shorter stretch would do.`, true);
  } finally {
    if (renderedTemp) rmSync(src, { force: true });
  }
}

/**
 * Renders 16 evenly spaced frames of a blockout (shot-owned or legacy cut) and tiles them into a 4×4 storyboard
 * contact sheet JPEG, saved as a deduplicated snapshot in `made/blockouts/<hash>.jpg` and sent as the first reference.
 */
async function blockoutSheet(projectId: string, dir: string, job: MakeJob): Promise<string> {
  const c = job.request.camera;
  if (!c || !isCameraBlockout(c)) throw new FalError("A contact sheet needs a blockout", true);
  const work = join(dir, ".cache", "camera", `${job.id}-sheet`);
  mkdirSync(work, { recursive: true });
  const out = join(dir, ".cache", "camera", `${job.id}-sheet.jpg`);
  try {
    if ("blockout" in c) {
      const owner = loadProject(projectId, c.cut).project;
      const shot = owner.shots.find((s) => s.id === c.shot);
      if (!shot?.blockout?.beats.length) throw new FalError(`Shot "${c.shot}" no longer has a blockout to render`, true);
      const bp = blockoutProject(owner, shot.id, shot.blockout, job.request.aspect);
      const span = Math.max(0.05, bp.duration);
      const times = Array.from({ length: 16 }, (_, i) => (span * i) / 15);
      await renderBlockoutStills(projectId, { cut: c.cut, format: bp.format.id, times, scale: 0.35, dir: work, project: bp.project });
    } else {
      const span = Math.max(0.05, c.to - c.from);
      const times = Array.from({ length: 16 }, (_, i) => c.from + (span * i) / 15);
      await renderBlockoutStills(projectId, { cut: c.cut, format: c.format, times, scale: 0.35, dir: work });
    }
    await exec("ffmpeg", ["-v", "error", "-y", "-i", join(work, "still-%03d.jpg"), "-vf", "tile=4x4:padding=4:color=white", "-frames:v", "1", "-q:v", "3", out]);
    return persistBlockoutSnapshot(projectId, dir, job, out, "image");
  } catch (err) {
    if (err instanceof FalError) throw err;
    throw new FalError(`The blockout sheet couldn't be rendered: ${err instanceof Error ? err.message : String(err)}`, true);
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(out, { force: true });
  }
}

/** Renders a stretch of a cut (or stand-in `project`) to a file, without the sound pass (set by tests to stand in for the renderer). */
let renderStretch = async (projectId: string, opts: { cut: string; format: string; range: { from: number; to: number }; out: string; project?: Project }): Promise<void> => {
  const { renderProject } = await import("./render.ts");
  await renderProject(projectId, { ...opts, quality: "original", master: false });
};
export const setRenderStretch = (fn: typeof renderStretch) => void (renderStretch = fn);

/** Renders stills of a blockout (cut or stand-in `project`) for 4×4 contact-sheet mode (set by tests to stand in for the renderer). */
let renderBlockoutStills = async (projectId: string, opts: { cut: string; format: string; times: number[]; scale: number; dir: string; project?: Project }): Promise<string[]> => {
  const { renderStills } = await import("./render.ts");
  return renderStills(projectId, opts);
};
export const setRenderBlockoutStills = (fn: typeof renderBlockoutStills) => void (renderBlockoutStills = fn);

/**
 * The stretch of the clip a take that copies movement follows, cut to a file to upload: the window driveWindow gives,
 * in the clip's own shape at about 720p and 30 frames a second, without its sound.
 */
async function driveClip(project: Project, dir: string, job: MakeJob): Promise<string> {
  const r = job.request;
  const clip = r.drive && project.assets.find((a) => a.id === r.drive!.asset);
  if (!clip) throw new FalError("The clip this take was asked to follow isn't in the project any more", true);
  const win = driveWindow(r.drive!, r.seconds ?? r.drive!.to - r.drive!.from, clip.duration);
  const scale = 720 / Math.min(clip.width ?? 1280, clip.height ?? 720);
  const even = (n: number) => Math.round((n * scale) / 2) * 2;
  const file = join(dir, ".cache", "drive", `${job.id}.mp4`);
  await fitClip(assetPath(project, dir, clip), file, win.from, win.to, even(clip.width ?? 1280), even(clip.height ?? 720), 30, Math.max(1, Math.round((win.to - win.from) * 30)));
  return file;
}

/** A take that lip-syncs: the stretch it says (and of the clip it changes), widened to its length as speechWindow says. */
function speechWindowOf(project: Project, job: MakeJob) {
  const r = job.request;
  const s = r.speech!;
  const clip = r.clip && project.assets.find((a) => a.id === r.clip!.asset);
  if (r.clip && !clip) throw new FalError("The clip this take was asked to change isn't in the project any more", true);
  const sound = "asset" in s ? project.assets.find((a) => a.id === s.asset) : undefined;
  if ("asset" in s && !sound) throw new FalError("The file this take was asked to say isn't in the project any more", true);
  const along = r.clip ?? s;
  return speechWindow(s, r.clip, r.seconds ?? along.to - along.from, clip ? clip.duration : sound?.duration);
}

/**
 * The sound a take that lip-syncs says, as a file to send: its stretch of the cut's voice (each line it says where it's
 * heard, silence around them) or of a file's sound (its cleaned voices, when they've been cleaned), widened to the
 * take's length, and held out with silence to `seconds` when a workflow makes more (whole chunks).
 */
async function speechSound(project: Project, dir: string, job: MakeJob, dest: string, seconds?: number): Promise<string> {
  const s = job.request.speech!;
  const w = speechWindowOf(project, job);
  let pieces: { file: string; from: number; at: number }[];
  if ("asset" in s) {
    const a = project.assets.find((x) => x.id === s.asset)!;
    const clean = cleanPath(dir, a);
    pieces = [{ file: clean && existsSync(clean) ? clean : assetPath(project, dir, a), from: Math.max(0, w.from), at: Math.max(0, -w.from) }];
  } else {
    const at = new Map(resolveTimeline(project, project.formats[0]!.id).lines.map((l) => [l.id, l.start]));
    pieces = s.lines.flatMap((id) => {
      const line = project.voice?.lines.find((l) => l.id === id);
      const start = at.get(id);
      if (!line?.file || start === undefined || !Number.isFinite(start)) throw new FalError(`The line "${id}" isn't voiced in this cut any more`, true);
      const offset = start - w.from;
      return offset < w.to - w.from ? [{ file: mediaPath(project, dir, line.file), from: Math.max(0, -offset), at: Math.max(0, offset) }] : [];
    });
  }
  await laySound(pieces, Math.max(seconds ?? 0, w.to - w.from), dest);
  return dest;
}

/** Semantic prompt role for a resolved `AudioRef`. */
function audioRefRole(a: AudioRef): AudioRefRole | undefined {
  if (a.kind === "music") return "music";
  if (a.kind === "speech") return "dialogue";
  if (a.kind === "voice") return "voice";
  return a.role;
}

/**
 * Prepares and uploads multimodal reference audio files for a video job:
 * - `music`: lays overlapping cut music cues over `[from, to]`;
 * - `speech`: lays the cut's voiced lines over `[from, to]`;
 * - `voice` / `asset`: trims `[from, to]` (using cleaned voices when available for voice/dialogue roles).
 * Each clip is padded with trailing silence up to the route's `minSeconds` (default 2s) so short clips never fail API checks.
 */
async function audioRefArgs(
  project: Project,
  dir: string,
  job: MakeJob,
  upload: (file: string) => Promise<string> | string,
  ext: ".wav" | ".mp3" = ".wav",
): Promise<{ audioRefs?: FalAudioRef[]; muteAudio?: boolean }> {
  const list = job.request.audioRefs;
  if (!list?.length) return {};
  const model = CATALOG.find((m) => m.id === job.model);
  const route = model?.routes.find((r) => r.via === job.route && r.endpoints[shapeOf(job.request)] === job.endpoint);
  const routeAudio = route?.takes?.audio;
  const minSeconds = (routeAudio && typeof routeAudio === "object" ? routeAudio.minSeconds : model?.takes.audio?.minSeconds) ?? 2;
  const work = join(dir, ".cache", "audioref");
  mkdirSync(work, { recursive: true });
  const tl = list.some((a) => a.kind === "music" || a.kind === "speech") ? resolveTimeline(project, project.formats[0]!.id) : undefined;
  const out: FalAudioRef[] = [];
  for (const [i, ar] of list.entries()) {
    const dest = join(work, `${job.id}-${i}${ext}`);
    const span = Math.max(0.1, ar.to - ar.from);
    const dur = Math.max(minSeconds, span);
    let pieces: { file: string; from: number; at: number; duration?: number }[];
    if (ar.kind === "music") {
      const hits = (tl?.cues ?? []).filter((c) => c.end > ar.from + 1e-6 && c.start < ar.to - 1e-6);
      if (!hits.length) throw new FalError("The music cue this take was asked to follow isn't in this stretch any more", true);
      pieces = hits.map((m) => {
        const a = project.assets.find((x) => x.id === m.asset);
        if (!a) throw new FalError(`The music track "${m.asset}" isn't in the project any more`, true);
        const s0 = Math.max(ar.from, m.start);
        const s1 = Math.min(ar.to, m.end);
        return { file: assetPath(project, dir, a), from: Math.max(0, m.trackFrom + (s0 - m.start)), at: s0 - ar.from, duration: Math.max(0.05, s1 - s0) };
      });
    } else if (ar.kind === "speech") {
      const at = new Map((tl?.lines ?? []).map((l) => [l.id, l.start]));
      pieces = ar.lines.flatMap((id) => {
        const line = project.voice?.lines.find((l) => l.id === id);
        const start = at.get(id);
        if (!line?.file || start === undefined || !Number.isFinite(start)) throw new FalError(`The line "${id}" isn't voiced in this cut any more`, true);
        const offset = start - ar.from;
        if (offset >= span) return [];
        const pieceFrom = Math.max(0, -offset);
        const pieceAt = Math.max(0, offset);
        const avail = Math.min(Math.max(0.05, line.duration - pieceFrom), Math.max(0.05, span - pieceAt));
        return [{ file: mediaPath(project, dir, line.file), from: pieceFrom, at: pieceAt, duration: avail }];
      });
      if (!pieces.length) throw new FalError("None of the referenced voice lines fall in this stretch any more", true);
    } else {
      const a = project.assets.find((x) => x.id === ar.asset);
      if (!a) throw new FalError(`The audio reference "${ar.asset}" isn't in the project any more`, true);
      const preferClean = ar.kind === "voice" || ar.role === "voice" || ar.role === "dialogue";
      const clean = preferClean ? cleanPath(dir, a) : undefined;
      const file = clean && existsSync(clean) ? clean : assetPath(project, dir, a);
      pieces = [{ file, from: Math.max(0, ar.from), at: 0, duration: span }];
    }
    await laySound(pieces, dur, dest);
    out.push({ url: await upload(dest), role: audioRefRole(ar), ...(ar.label ? { label: ar.label } : {}) });
  }
  return { audioRefs: out, muteAudio: hasTimelineAudioRef(list) || undefined };
}

/** The sides a service takes a clip to dub at, when it's particular: Kling's lip sync, 720 to 1920 pixels. */
const DUB_SIDES: Record<string, { min: number; max: number }> = { "kling-lipsync": { min: 720, max: 1920 } };

/**
 * The stretch of the clip a take that lip-syncs changes the mouths in, widened with what it says, as a file to send:
 * without its sound, and at its own size unless the service takes only some (scaled into them, its shape kept).
 */
async function dubClip(project: Project, dir: string, job: MakeJob): Promise<string> {
  const w = speechWindowOf(project, job);
  const clip = project.assets.find((a) => a.id === job.request.clip!.asset)!;
  const file = join(dir, ".cache", "dub", `${job.id}.mp4`);
  const sides = DUB_SIDES[job.shape];
  let size: { width: number; height: number } | undefined;
  if (sides && clip.width && clip.height) {
    const short = Math.min(clip.width, clip.height), long = Math.max(clip.width, clip.height);
    const k = short < sides.min ? sides.min / short : long > sides.max ? sides.max / long : 1;
    const even = (n: number) => Math.round((n * k) / 2) * 2;
    if (k !== 1) size = { width: even(clip.width), height: even(clip.height) };
  }
  await cutClip(assetPath(project, dir, clip), file, w.clip!.from, w.clip!.to, size);
  return file;
}

/**
 * A job on a service that answers in one request (see direct.ts), or on a plan (plans.ts): sent and answered in this
 * step, and the picture saved before anything else, since the service won't give it again. The lock is kept fresh
 * while it waits, so another process doesn't take the job for one that stopped.
 */
async function stepDirect(projectId: string, job: MakeJob, key: string | undefined) {
  if (job.file) return finish(projectId, job, { file: job.file });
  const plan = PLAN_ROUTES.includes(job.route);
  // Sent by a process that stopped before the answer came: the picture is lost, and may have been paid for (a plan's comes out of its allowance).
  if (job.status === "running") {
    if (!plan) updateJob(projectId, job, { charged: true });
    throw new FalError(`The engine stopped while this was being made, so the picture was lost${plan ? "" : " (and may have been charged)"}. Try again to make it again.`, true);
  }
  const { project, dir } = loadProject(projectId, job.cut);
  const r = job.request;
  const refs = await prepareJobRefs(project, dir, r, (file) => file);
  job = updateJob(projectId, job, { status: "running" });
  const beat = setInterval(() => {
    try {
      utimesSync(lockFile(projectId, job.id), new Date(), new Date());
    } catch {
      // The lock is gone; the job's own save says what happened.
    }
  }, 10_000);
  let out: { bytes: Buffer; contentType: string; usd?: number };
  try {
    const ask = { prompt: r.sent ?? r.prompt, aspect: r.aspect, refs };
    out = plan ? await planImage(job.route, ask) : await directImage(job.route, job.endpoint, key!, ask);
  } catch (err) {
    // Nothing came back, so nothing was made: it can be sent again.
    const now = readJob(projectId, job.id) ?? job;
    if (now.status === "running") saveJob(projectId, { ...now, status: "queued" });
    throw err;
  } finally {
    clearInterval(beat);
  }
  const folder = join(projectDir(projectId), "made", "takes");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${job.id}${EXT[out.contentType] ?? ".jpg"}`);
  writeFileSync(file, out.bytes);
  const now = readJob(projectId, job.id) ?? job;
  job = saveJob(projectId, { ...now, file, charged: true, ...(out.usd !== undefined ? { usd: out.usd } : {}) });
  // Stopped while it was being made: it's paid for and kept, but not added.
  if (now.status === "canceled") return;
  await finish(projectId, job, { file });
}

/**
 * A job on ComfyUI (comfy.ts). First the picture (and, for a workflow that follows a clip, the stretch of it; for one
 * that makes it talk, what it says) is fitted to the size the workflow makes for this quality (the picture's shape,
 * smaller for a rough), the clip or the sound padded out to whole chunks, sent up and the workflow filled in; the job
 * is saved with its prompt id before the prompt is sent. A
 * still is made in the shape asked for, from its reference pictures (cut out, as for any model). After that each step
 * asks where it is, and once it's done the take is fetched, a clip trimmed to its length, and brought in. A ComfyUI
 * that restarted (and so forgot its queue) is sent the saved prompt again.
 */
async function stepComfy(projectId: string, job: MakeJob) {
  // Canceled since this round of steps began: nothing more to do (cancelJobs stopped it in ComfyUI).
  const now = readJob(projectId, job.id);
  if (now && !isOpen(now)) return;
  if (job.file) return finish(projectId, job, { file: job.file });
  const url = job.comfy?.url ?? comfyUrl();
  if (!url) throw new FalError("ComfyUI isn't connected. The person can connect it in Settings → Making.", true);
  const still = WORKFLOWS[job.endpoint]?.still;
  if (!job.comfy) {
    const spec = WORKFLOWS[job.endpoint];
    if (!spec) throw new FalError(`beatsheet doesn't know the ComfyUI workflow "${job.endpoint}"`, true);
    const profile = profileFor(job.endpoint, job.quality);
    if (!profile) throw new FalError(`There's no ${spec.label} workflow here: export one from ComfyUI (File → Export (API)) as ${job.endpoint}.full.api.json into ${OWN_WORKFLOWS}`, true);
    const loaded = loadWorkflow(workflowPath(job.endpoint, profile)!);
    const { project, dir } = loadProject(projectId, job.cut);
    const r = job.request;
    const work = join(dir, ".cache", "comfy", job.id);
    // Filled in, checked against what the server has, and saved with our own prompt id before it's sent.
    const send = async (workflow: ComfyPrompt, values: Record<string, unknown>, marker: string, clip?: { frames: number; fps: number }) => {
      values[marker] = `beatsheet/${job.id}`;
      const prompt = fill(workflow, values);
      const missing = describeMissing(await comfyMissing(url, prompt));
      if (missing.length) throw new FalError(`ComfyUI is missing what the ${spec.label} workflow needs: ${missing.join("; ")}. Settings → Making can fetch the model files.`, true);
      job = updateJob(projectId, job, { status: "running", comfy: { id: randomUUID(), url, outputs: nodesTitled(prompt, marker), ...clip, profile, prompt } });
      await comfySubmit(url, prompt, job.comfy!.id, job.comfy!.outputs);
    };
    if (spec.still) {
      const packed: PackedRef[] = r.packedRefs?.length ? r.packedRefs : (r.refs ?? []).map((asset) => ({ kind: "asset" as const, asset }));
      const most = refsIn(loaded);
      if (packed.length > most) throw new FalError(`The ${spec.label} workflow takes ${most} reference picture${most === 1 ? "" : "s"}; this has ${packed.length}`, true);
      // The nodes for pictures it isn't given come out.
      let workflow = loaded;
      for (let k = packed.length + 1; k <= most; k++) workflow = without(workflow, `STUDIO_REF_IMAGE_${k}`);
      const [w, h] = (r.aspect ?? "1:1").split(":").map(Number);
      const size = fitSize(w || 1, h || 1, spec.area[profile], spec.multiple);
      const values: Record<string, unknown> = { STUDIO_SEED: r.seed ?? randomInt(2 ** 31), STUDIO_WIDTH: size.width, STUDIO_HEIGHT: size.height, STUDIO_PROMPT: r.sent ?? r.prompt };
      for (const id of packedRefAssets(r.packedRefs, r.refs)) {
        if (!project.assets.some((a) => a.id === id)) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      }
      for (const [i, ref] of packed.entries()) {
        const file = join(work, `ref${i + 1}.png`);
        const src = await resolvePackedRef(project, dir, ref, r.cast);
        // A photo the picture library can't read (a phone's HEIC) goes as its upright preview instead.
        await fitReference(src, file).catch((err) => {
          if (ref.kind === "asset") return fitReference(cachePaths(dir, ref.asset).image, file);
          throw err;
        });
        values[`STUDIO_REF_IMAGE_${i + 1}`] = await comfyUpload(url, file, `${job.id}_ref${i + 1}.png`);
      }
      return send(workflow, values, "STUDIO_OUTPUT");
    }
    const picture = project.assets.find((a) => a.id === r.start);
    if (!picture) throw new FalError("The picture this take was asked from isn't in the project any more", true);
    const ends = nodesTitled(loaded, "STUDIO_END_IMAGE").length > 0;
    if (r.end && !ends) throw new FalError(`The ${spec.label} workflow doesn't take an end frame`, true);
    // Without an end frame, the node that would load one comes out.
    const workflow = r.end ? loaded : without(loaded, "STUDIO_END_IMAGE");
    const size = fitSize(picture.width ?? 1280, picture.height ?? 720, spec.area[profile], spec.multiple);
    const fps = spec.fps!;
    const ref = join(work, "ref.png");
    await fitPicture(assetPath(project, dir, picture), ref, size.width, size.height);
    const values: Record<string, unknown> = {
      STUDIO_REF_IMAGE: await comfyUpload(url, ref, `${job.id}_ref.png`),
      STUDIO_SEED: r.seed ?? randomInt(2 ** 31),
      STUDIO_WIDTH: size.width,
      STUDIO_HEIGHT: size.height,
      STUDIO_FPS: fps,
      STUDIO_PROMPT: r.sent ?? r.prompt,
    };
    let frames: number;
    let marker = "STUDIO_OUTPUT";
    if (spec.drive) {
      // The stretch of the clip, at the workflow's rate, held out to whole chunks.
      const clip = r.drive && project.assets.find((a) => a.id === r.drive!.asset);
      if (!clip) throw new FalError("The clip this take was asked to follow isn't in the project any more", true);
      const win = driveWindow(r.drive!, r.seconds ?? r.drive!.to - r.drive!.from, clip.duration);
      frames = Math.max(1, Math.round((win.to - win.from) * fps));
      const { chunks, capacity } = chunksFor(frames, spec.first!, spec.extend!);
      const most = chunksIn(workflow);
      if (chunks > most) throw new FalError(`The ${spec.label} workflow makes up to ${((spec.first! + spec.extend! * (most - 1)) / fps).toFixed(1)}s; this is ${(frames / fps).toFixed(1)}s. Split the shot in two`, true);
      const drive = join(work, "drive.mp4");
      await fitClip(assetPath(project, dir, clip), drive, win.from, win.to, size.width, size.height, fps, capacity);
      values.STUDIO_DRIVING_VIDEO = await comfyUpload(url, drive, `${job.id}_drive.mp4`);
      marker = outputMarker(workflow, chunks);
    } else if (spec.speech) {
      // What it says, held out with silence to whole chunks at the workflow's rate.
      if (!r.speech) throw new FalError(`The ${spec.label} workflow makes a picture say something, and this take wasn't given anything to say`, true);
      const w = speechWindowOf(project, job);
      frames = Math.max(1, Math.round((w.to - w.from) * fps));
      const { chunks, capacity } = chunksFor(frames, spec.first!, spec.extend!);
      const most = chunksIn(workflow);
      if (chunks > most) throw new FalError(`The ${spec.label} workflow makes up to ${((spec.first! + spec.extend! * (most - 1)) / fps).toFixed(1)}s; this is ${(frames / fps).toFixed(1)}s. Split the shot in two`, true);
      const sound = await speechSound(project, dir, job, join(work, "speech.wav"), capacity / fps);
      values.STUDIO_AUDIO = await comfyUpload(url, sound, `${job.id}_speech.wav`);
      marker = outputMarker(workflow, chunks);
    } else {
      frames = framesFor(r.seconds ?? 5, fps, spec.maxFrames!, spec.grid);
      values.STUDIO_FRAMES = frames;
      if (r.end) {
        const end = project.assets.find((a) => a.id === r.end);
        if (!end) throw new FalError("The picture this take was asked to end on isn't in the project any more", true);
        const file = join(work, "end.png");
        await fitPicture(assetPath(project, dir, end), file, size.width, size.height);
        values.STUDIO_END_IMAGE = await comfyUpload(url, file, `${job.id}_end.png`);
      }
    }
    return send(workflow, values, marker, { frames, fps });
  }
  const c = job.comfy;
  const s = await comfyJob(c.url, c.id);
  // ComfyUI restarted (it keeps its queue in memory), or the prompt never got there: it's sent again.
  if (!s) return comfySubmit(c.url, c.prompt, c.id, c.outputs);
  if (s.status === "cancelled") throw new FalError("It was stopped in ComfyUI", true);
  if (s.status === "failed") {
    const e = s.execution_error ?? {};
    const said = [e.node_type && `${e.node_type} (#${e.node_id})`, [e.exception_type, e.exception_message].filter(Boolean).join(": ")].filter(Boolean).join(": ") || "it failed";
    const less = still ? "fewer reference pictures need less" : "a shorter stretch, or a rough rather than a final, needs less";
    throw new FalError(`ComfyUI couldn't make it: ${said.trim()}${/out of memory/i.test(said) ? ` (${less})` : ""}`.slice(0, 1500), true);
  }
  if (s.status !== "completed") {
    const position = s.status === "pending" ? await comfyAhead(c.url, c.id).catch(() => undefined) : undefined;
    if (position !== job.position || job.status !== "running") updateJob(projectId, job, job.status === "running" ? { position } : { status: "running", position });
    return;
  }
  if (!job.charged) job = updateJob(projectId, job, { charged: true });
  const saved = await comfySaved(c.url, c.id, c.outputs, still);
  if (!saved) throw new FalError(`ComfyUI finished but didn't save ${still ? "a picture" : "a video"}`, true);
  const takes = join(projectDir(projectId), "made", "takes");
  let file: string;
  if (still) {
    // A still comes in as it was saved.
    file = join(takes, `${job.id}${extname(saved.filename).toLowerCase()}`);
    await comfyDownload(c.url, saved, file);
  } else {
    const raw = join(projectDir(projectId), ".cache", "comfy", job.id, "raw.mp4");
    await comfyDownload(c.url, saved, raw);
    file = join(takes, `${job.id}.mp4`);
    await trimTake(raw, file, c.fps!, c.frames!, WORKFLOWS[job.endpoint]?.sound);
  }
  job = updateJob(projectId, job, { file, position: undefined });
  await finish(projectId, job, { file });
}

/**
 * Brings a finished take in and puts it where it was asked for. Takes come in one at a time, so two finishing together
 * don't take the same id or write the same preview. What goes wrong here is the project's side (a file in use, a write
 * that clashed): the take is still at the service (or saved), so it's tried again.
 */
function finish(projectId: string, job: MakeJob, out: Taken) {
  return oneAtATime(projectId, async () => {
    try {
      // Who it's for as the job says now: a cast member renamed while it was made has moved it along (renameInJobs).
      const now = readJob(projectId, job.id);
      if (now) job = { ...job, sheet: now.sheet, request: now.request };
      const asset = await bringIn(projectId, job, out);
      await attach(projectId, job, asset);
      updateJob(projectId, job, { status: "done", position: undefined, asset: asset.id });
    } catch (err) {
      throw err instanceof FalError ? err : new FalError(`Couldn't bring the take in: ${err instanceof Error ? err.message : String(err)}`, false);
    }
  });
}

const intake = new Map<string, Promise<unknown>>();
/** Runs `fn` after whatever is already bringing takes into this project. */
function oneAtATime(projectId: string, fn: () => Promise<void>): Promise<void> {
  const next = (intake.get(projectId) ?? Promise.resolve()).catch(() => undefined).then(fn);
  intake.set(projectId, next);
  return next;
}

/** Downloads a take from where the service has it into made/takes/. */
async function download(projectId: string, job: MakeJob, out: { url: string; contentType?: string; headers?: Record<string, string> }): Promise<string> {
  const res = await fetch(out.url, { headers: out.headers, signal: AbortSignal.timeout(10 * 60_000) }).catch((err: unknown) => {
    throw new FalError(`Couldn't download the take (${err instanceof Error ? err.message : String(err)})`, false);
  });
  if (!res.ok) throw new FalError(`Couldn't download the take (${res.status})`, res.status === 404 || res.status === 410);
  const ext = EXT[(out.contentType ?? res.headers.get("content-type") ?? "").split(";")[0]!.trim()] ?? (extname(new URL(out.url).pathname) || (job.op === "image" ? ".jpg" : ".mp4"));
  const dir = join(projectDir(projectId), "made", "takes");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${job.id}${ext}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "video/quicktime": ".mov" };

/** A finished take: where the service has it, or the file it was already saved to. */
type Taken = { url: string; contentType?: string; headers?: Record<string, string>; seed?: number } | { file: string; seed?: undefined };

/**
 * Downloads the take into made/takes/ (unless it's there already) and adds it as an asset, once: a job picked up again
 * after a crash finds its own.
 */
async function bringIn(projectId: string, job: MakeJob, out: Taken): Promise<Asset> {
  const have = loadProject(projectId, job.cut).project.assets.find((a) => a.provenance?.job === job.id);
  if (have) return have;
  const file = "file" in out ? out.file : await download(projectId, job, out);
  // A still that came back letterboxed would make a clip with the bars in it; a file that won't read is left as it is.
  const bars = job.op === "image" ? await unletterbox(file).catch(() => undefined) : undefined;
  const r = job.request;
  // One that lip-syncs or follows timeline-synced music/speech comes back with audio the cut's own mix already plays
  // (ComfyUI's takes are trimmed silent); strip its track to prevent echo. A file that won't read is left as it is.
  if ((r.speech || hasTimelineAudioRef(r.audioRefs)) && !("file" in out)) await silence(file).catch(() => undefined);
  const v = job.versionOf;
  if (v && (v.keepAudio || v.audioFile)) {
    const { project, dir } = loadProject(projectId, job.cut);
    const { soundFile } = await import("./clean.ts");
    const orig = project.assets.find((a) => a.id === v.asset);
    const audioSrc = v.audioFile && existsSync(v.audioFile) ? v.audioFile : orig ? soundFile(project, dir, orig) : undefined;
    if (audioSrc && existsSync(audioSrc)) {
      const muxed = `${file}.muxed.mp4`;
      const args = v.audioFile
        ? ["-v", "error", "-y", "-i", file, "-i", audioSrc, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", muxed]
        : ["-v", "error", "-y", "-i", file, "-ss", v.from.toFixed(4), "-to", v.to.toFixed(4), "-i", audioSrc, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", muxed];
      await exec("ffmpeg", args).then(() => replaceFile(muxed, file)).catch(() => undefined);
    }
  }
  const sk: SheetKind | undefined = job.sheet ? (job.sheetKind ?? (job.portrait ? "portrait" : "sheet")) : undefined;
  const followed = r.camera && "asset" in r.camera ? r.camera.asset : undefined;
  const audioAssets = (r.audioRefs ?? []).flatMap((a) => ("asset" in a ? [a.asset] : []));
  const from = [r.start, r.end, ...packedRefAssets(r.packedRefs, r.refs), r.drive?.asset, r.clip?.asset, followed, v?.asset, r.speech && "asset" in r.speech ? r.speech.asset : undefined, ...audioAssets].filter((x): x is string => !!x);
  return addAsset(projectId, file, {
    id: v ? `${v.asset}-${v.tag ?? "version"}` : job.sheet ? `${job.sheet.replace("/", "-")}-${sk}` : `${job.shot ?? job.op}-take`,
    label: v?.label ?? (r.prompt.length > 60 ? `${r.prompt.slice(0, 57).trimEnd()}…` : r.prompt),
    tags: [v?.tag ?? (sk ?? "take")],
    ...(v ? { version: { of: v.asset, from: Math.round(v.from * 10000) / 10000 } } : {}),
    provenance: {
      source: "generated",
      provider: job.route,
      model: job.endpoint,
      prompt: r.sent ?? r.prompt,
      ...(r.cast?.length ? { cast: r.cast } : {}),
      seed: out.seed ?? r.seed,
      ...(from.length ? { refs: [...new Set(from)] } : {}),
      costUsd: job.usd,
      createdAt: new Date().toISOString(),
      op: v?.op ?? job.op,
      params: {
        model: job.model,
        prompt: r.prompt,
        ...(r.start ? { start: r.start } : {}),
        ...(r.end ? { end: r.end } : {}),
        ...(r.seconds !== undefined ? { seconds: r.seconds } : {}),
        ...(r.shotSeconds !== undefined ? { shotSeconds: r.shotSeconds } : {}),
        ...(r.aspect ? { aspect: r.aspect } : {}),
        ...(job.quality ? { quality: job.quality } : {}),
        ...(r.drive ? { drive: r.drive } : {}),
        ...(r.speech ? { speech: r.speech } : {}),
        ...(r.clip ? { clip: r.clip } : {}),
        ...(r.camera ? { camera: r.camera } : {}),
        ...(r.cameraKind ? { cameraKind: r.cameraKind } : {}),
        ...(r.audioRefs?.length ? { audioRefs: r.audioRefs } : {}),
        ...(v?.params ?? {}),
        ...(job.comfy ? { workflow: `${job.endpoint}.${job.comfy.profile}` } : {}),
        ...(bars ? { letterbox: `removed ${bars.top + bars.bottom}px of bars` } : {}),
      },
      job: job.id,
    },
  });
}

type Generated = Extract<ShotContent, { kind: "generated" }>;

/** The quality a take was made at: a final, a rough, or neither (a still, or made before there were tiers). */
const qualityOf = (a: Asset | undefined) => a?.provenance?.params?.quality as Quality | undefined;

/**
 * Puts what a job made where it was asked for. A character's portrait or sheet becomes its look's chosen one when it
 * has none yet, so it works straight away, and after that joins the others made for that step, for the person to
 * choose between. Anything else's sheet becomes its picture when it has none, and is kept beside it after that. A take
 * joins its shot's takes: the first is the one the shot shows, and so is the first clip over a board (a still) and the
 * first final over a rough, starting where takeLead says. The shot's fidelity moves up to match.
 */
async function attach(projectId: string, job: MakeJob, asset: Asset) {
  if (job.versionOf?.use) {
    const { useVersion } = await import("./restore.ts");
    try {
      useVersion(projectId, asset.id, { cut: job.cut });
    } catch {
      // Shot or clip may have been removed while the job was running.
    }
  }
  if (job.sheet) {
    const [id, variant] = job.sheet.split("/");
    const sk: SheetKind = job.sheetKind ?? (job.portrait ? "portrait" : "sheet");
    updateFile(projectId, (d) => {
      const m = d.cast?.find((x) => x.id === id);
      const target = variant ? m?.variants?.find((v) => v.id === variant) : m;
      if (!m || !target || lookAssets(target).includes(asset.id)) return;
      if (m.kind === "character") {
        const [one, many] =
          sk === "portrait"
            ? (["portrait", "portraits"] as const)
            : sk === "face-sheet"
              ? (["faceSheet", "faceSheets"] as const)
              : sk === "outfit-sheet"
                ? (["outfitSheet", "outfitSheets"] as const)
                : (["sheet", "sheets"] as const);
        if (target[one]) target[many] = [...(target[many] ?? []), asset.id];
        else target[one] = asset.id;
      } else if (m.kind === "wardrobe") {
        if (target.outfitSheet) target.outfitSheets = [...(target.outfitSheets ?? []), asset.id];
        else target.outfitSheet = asset.id;
      } else if (target.images?.length) target.kept = [...(target.kept ?? []), asset.id];
      else target.images = [asset.id];
    });
  }
  if (!job.shot) return;
  updateProject(
    projectId,
    (p) => {
      const s = p.shots.find((x) => x.id === job.shot);
      // The shot may have gone, or become footage, while the take was being made.
      if (!s || (s.content.kind !== "placeholder" && s.content.kind !== "generated")) return;
      const g: Generated = s.content.kind === "generated" ? s.content : { kind: "generated", prompt: job.request.prompt };
      if (g.takes?.includes(asset.id)) return;
      g.takes = [...(g.takes ?? []), asset.id];
      const showing = g.take ? p.assets.find((a) => a.id === g.take) : undefined;
      const r = job.request;
      // A take with its mouths changed is the clip it was made from, made better.
      const dubbed = !!r.clip && r.clip.asset === showing?.id;
      const better = asset.kind === "video" && (showing?.kind === "image" || dubbed || (job.quality === "final" && qualityOf(showing) !== "final"));
      if (!showing || better) {
        const spare = takeLead(r, asset.kind === "video" ? asset.duration : undefined, (id) => p.assets.find((a) => a.id === id)?.duration);
        // What it was made from: the clip's own board and movement, for one whose mouths were changed.
        const made = dubbed ? g : r;
        const { start: _s, end: _e, in: _i, refs: _r, drive: _d, camera: kept, speech: _p, audioRefs: keptAudio, ...rest } = g;
        Object.assign(rest, {
          take: asset.id,
          ...(asset.kind === "video" ? { clipPrompt: r.prompt } : { prompt: r.prompt }),
          provider: job.route,
          model: job.model,
          ...(made.start ? { start: made.start } : {}),
          ...(made.end ? { end: made.end } : {}),
          ...(made.refs?.length ? { refs: made.refs } : {}),
          ...(made.drive ? { drive: made.drive } : {}),
          // The camera and audio references this take kept; one with its mouths changed is still the clip that kept them.
          ...(dubbed ? (kept ? { camera: kept } : {}) : r.camera ? { camera: cameraOnShot(r.camera) } : {}),
          ...(r.speech ? { speech: speechOnShot(r.speech) } : {}),
          ...(dubbed ? (keptAudio?.length ? { audioRefs: keptAudio } : {}) : r.audioRefs?.length ? { audioRefs: r.audioRefs } : {}),
          ...(spare > 0 ? { in: Math.round(spare * 1000) / 1000 } : {}),
        });
        s.content = rest;
      } else s.content = g;
      const level = asset.kind === "video" ? (job.quality === "final" ? "final" : "rough") : "board";
      if (FIDELITY.indexOf(s.fidelity) < FIDELITY.indexOf(level)) s.fidelity = level;
    },
    job.cut,
  );
}

// ---- Saying where things are.

/** One line about a job, for the agent's tools. */
export function describeJob(j: MakeJob): string {
  const model = CATALOG.find((m) => m.id === j.model)?.label ?? j.model;
  const d = j.request.drive;
  const s = j.request.speech;
  const c = j.request.clip;
  const ar = j.request.audioRefs;
  const sheetDesc =
    j.sheetKind === "face-sheet"
      ? "360° face sheet"
      : j.sheetKind === "outfit-sheet"
        ? "outfit sheet"
        : j.sheetKind === "portrait" || j.portrait
          ? "portrait"
          : "sheet";
  const what = [
    j.shot ? `shot ${j.shot}` : j.sheet ? `${sheetDesc} for @${j.sheet}` : j.op,
    model,
    j.quality ?? "",
    j.request.seconds ? `${j.request.seconds}s` : "",
    j.request.aspect ?? "",
    d ? `following ${d.asset} ${d.from}–${d.to}s` : "",
    s ? `saying ${"lines" in s ? `line${s.lines.length === 1 ? "" : "s"} ${s.lines.join(", ")}` : `${s.asset} ${s.from}–${s.to}s`}` : "",
    c ? `with the mouths changed in ${c.asset} ${c.from}–${c.to}s` : "",
    ar?.length ? `with ${ar.length} audio ref${ar.length === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const queue = j.route === "comfy" ? "ComfyUI's" : "fal's";
  const where =
    j.status === "done"
      ? `done: ${j.asset}`
      : j.status === "failed"
        ? `failed: ${j.error}`
        : j.status === "canceled"
          ? "canceled"
          : j.status === "queued"
            ? "about to be sent"
            : j.position !== undefined
              ? `waiting, ${j.position + 1} in ${queue} queue`
              : "being made";
  return `${j.id} (${what}): ${where}`;
}
