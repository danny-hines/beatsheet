/**
 * Making new footage with the person's services. A request becomes one job per take, each saved in the project's
 * jobs/ folder before anything is sent, so a restart or a closed agent session loses only the waiting, never the take:
 * the service keeps it under the request id the job records. Whichever engine process is running drives the
 * unfinished jobs, and a lock file beside each stops two processes driving the same one. A finished take is added like
 * any other asset and, when the job was for a shot, becomes one of that shot's takes.
 */
import { randomInt, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import {
  aspectOf,
  CATALOG,
  castOf,
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
  missingFromFrames,
  realPeople,
  resolveTimeline,
  shapeOf,
  shotNeeds,
  speechOnShot,
  speechWindow,
  takeLead,
  type Asset,
  type CastMember,
  type Choices,
  type Drive,
  type FitOk,
  type MakeOp,
  type MakeRequest,
  type Project,
  type Quality,
  type ServiceState,
  type Shot,
  type ShotContent,
  type Speech,
  type Stretch,
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
import { falCancel, FalError, falInput, falOutput, falResult, falStatus, falSubmit, falUpload, takesSeed, type FalRequest } from "./fal.ts";
import { addAsset } from "./ingest.ts";
import { unletterbox } from "./letterbox.ts";
import { assetPath, cachePaths, cleanPath, mediaPath, projectDir } from "./paths.ts";
import { replaceFile } from "./platform.ts";
import { SERVICES } from "./services.ts";
import { ledgerSince } from "./spend.ts";
import { refFile } from "./refcut.ts";
import { getSecret, readSettings } from "./settings.ts";
import { listProjects, loadFile, loadProject, updateFile, updateProject } from "./store.ts";

export type MakeJob = {
  id: string;
  /** Takes asked for together share this. */
  batch: string;
  cut?: string;
  shot?: string;
  /** The cast member (or variant) it's a sheet for. */
  sheet?: string;
  /** A portrait of them rather than a sheet. */
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
    /** The stretch of a clip a take that copies movement follows (the take is made a little wider where the clip has room: driveWindow). */
    drive?: Drive;
    /** What a take that lip-syncs says, and the clip whose mouths it changes, when it changes one (both widened together: speechWindow). */
    speech?: Speech;
    clip?: Stretch;
    seconds?: number;
    aspect?: string;
    seed?: number;
    shotSeconds?: number;
  };
  /** Estimated cost of this take, in US dollars. */
  usd?: number;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  /** The service's request, once it's been sent. */
  remote?: FalRequest;
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
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${randomInt(36 ** 3).toString(36).padStart(3, "0")}`;

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
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
 * Every service's state for the fit check: a key in the Keychain counts as ready (checking it costs a request), and so
 * does a plan the person's agent CLI is signed in on.
 */
export function serviceStates(): Record<string, ServiceState> {
  const saved = readSettings().services;
  return {
    ...Object.fromEntries(SERVICES.map((s) => [s.id, saved[s.id] ? { label: s.label, state: "ready" } : { label: s.label, state: "missing" }])),
    ...planStates(),
    // ComfyUI counts as ready once it's connected (in Settings → Making), as a key does, and says which workflows can't run there and why.
    comfy: comfyState(),
  };
}

/** Routes that run on the person's own machines rather than a service with a key. */
const LOCAL_ROUTES = ["comfy"];

/** Something to make, as the agent's tools and the studio ask for it. */
export type MakeAsk = Partial<Omit<MakeRequest, "op" | "start" | "end" | "drive" | "speech" | "clip">> & {
  op: MakeOp;
  cut?: string;
  /** A placeholder or generated shot it's for: its length, the cut's shape and its description fill in what's missing, and the takes land on it. */
  shot?: string;
  /** A cast member (or variant: cat/heist) it's a sheet for: the stills join its pictures. */
  sheet?: string;
  /**
   * With `sheet`, for a character: a head-and-shoulders portrait instead, from their own photos when they have some.
   * It settles how the face looks (in a variant's fake beard, hat or makeup) before the sheet is made from it.
   */
  portrait?: boolean;
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
  model?: string;
};

/** A request in full, with what goes to the model: the prompt with its cast described, and the cast it names. */
export type FullRequest = MakeRequest & {
  sent: string;
  cast: string[];
  /** For a clip: the characters it's about that its pictures aren't known to show, by name (missingFromFrames). */
  absent?: string[];
};

/**
 * The prompt a sheet is made from when none is given: clean views of one cast member, to give models later, in its
 * style (its own, else the look's). Without a style, a photograph, said in so many words: "reference sheet" alone
 * gets a drawing, and the boards made from a drawn sheet come out drawn too. A character's sheet shows the face once:
 * a close-up, then the body front (cropped at the neck) and back, so a model isn't given several faces to choose
 * between. A portrait is the face alone, in whatever the character wears on it.
 */
function sheetPrompt(member: CastMember, id: string, style: string | undefined, portrait = false): string {
  if (member.kind === "style") return `A single still that shows the look of @${id}.`;
  if (member.kind === "place")
    return style
      ? `A wide establishing view of @${id}, empty of people, nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A wide establishing photograph of @${id} in even daylight, empty of people, nothing else in the picture and no text or labels.`;
  if (member.kind === "prop")
    return style
      ? `A reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A photographic reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
  if (portrait)
    return style
      ? `A head-and-shoulders portrait of @${id} facing the camera, with anything worn on the head or face, on a plain light gray background, nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A photographic head-and-shoulders portrait of @${id} facing the camera, with anything worn on the head or face, on a plain light gray background, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
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
 * What a character's portrait or sheet is made from, in order, and the words that say which picture is which. The
 * face comes first: for a portrait, the look's face photos (by default the person's own photos, or for a variant the
 * plain look's chosen picture, so a face already settled stays settled); for a sheet, the look's chosen portrait (or
 * the plain one's). Then the pictures of what it wears, and the style's picture when there's room.
 */
function lookRefs(project: Project, member: CastMember, variantId: string | undefined, portrait: boolean, pictures: number, styled: string | undefined): { refs: string[]; words: string } {
  const variant = variantId ? member.variants?.find((v) => v.id === variantId) : undefined;
  const look = variant ?? member;
  const asset = (id: string | undefined) => (id ? project.assets.find((a) => a.id === id && a.kind === "image") : undefined);
  const settled = variant ? [member.portrait, member.sheet, ...(member.images ?? [])].find(asset) : undefined;
  const chosen = portrait ? undefined : [look.portrait, settled].find(asset);
  const faces = (chosen ? [chosen] : (look.faces ?? (portrait && settled ? [settled] : ownPhotos(project, member)))).filter(asset);
  const wardrobe = ((variant?.wardrobe?.length ? variant.wardrobe : member.wardrobe) ?? []).filter(asset);
  const stylePic = styled ? project.cast?.find((m) => m.id === styled)?.images?.[0] : undefined;
  const w = wardrobe.slice(0, Math.max(0, pictures - 1));
  const f = faces.slice(0, Math.max(1, pictures - w.length - (stylePic ? 1 : 0)));
  const withStyle = !!stylePic && f.length + w.length < pictures;
  const who = member.name;
  const words: string[] = [];
  // Named by its role, not its tags: a photo brought in can be tagged "portrait" for its shape.
  const made = !f[0] ? undefined : [look.portrait, member.portrait].includes(f[0]) ? "portrait" : [look.sheet, member.sheet].includes(f[0]) ? "sheet" : undefined;
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

/** The still a shot's clips start from: the take showing when it's a still, else the one its clip was made from. */
function boardOf(project: Project, shot: Shot | undefined): string | undefined {
  const c = shot?.content;
  if (c?.kind !== "generated") return undefined;
  return project.assets.find((a) => a.id === c.take)?.kind === "image" ? c.take : c.start;
}

/**
 * The request in full. A shot fills in its length (for video), the cut's shape and its description; a sheet, a
 * prompt for clean views of its cast member, and a portrait one for its face. Cast named with @ are described in what
 * the model reads, and stills are given their pictures (a character's portrait and sheet, its look's face and wardrobe,
 * as lookRefs says; anything else's sheet with no pictures yet, the photos it was made from; either, its style's
 * picture when there's room): as many as `pictures`, which is what every still model takes until one is picked. A clip
 * from a board doesn't need them: they're in the board.
 */
export function requestFor(projectId: string, ask: MakeAsk, pictures = fewestStillRefs(CATALOG)): FullRequest {
  const { project } = loadProject(projectId, ask.cut);
  const shot = ask.shot ? project.shots.find((s) => s.id === ask.shot) : undefined;
  if (ask.shot && !shot) throw new Error(`No shot "${ask.shot}" in this cut`);
  const [castId, variantId] = (ask.sheet ?? "").split("/");
  const member = ask.sheet ? project.cast?.find((m) => m.id === castId) : undefined;
  if (ask.sheet && (!member || (variantId && !member.variants?.some((v) => v.id === variantId)))) throw new Error(`No cast member "${ask.sheet}"`);
  const portrait = !!member && !!ask.portrait;
  if (portrait && member.kind !== "character") throw new Error(`A portrait is of a character; @${castId} is a ${member.kind}`);
  const needs = shot ? shotNeeds(project, shot.id, ask.op) : undefined;
  const format = project.formats[0]!;
  // The style made shots are drawn in; a sheet takes its member's own when it has one, and names it in its prompt.
  const style = (id: string | undefined) => (id && project.cast?.some((m) => m.id === id && m.kind === "style") ? id : undefined);
  const lookStyle = style(project.look?.style);
  const prompt = (ask.prompt ?? needs?.prompt ?? (member ? sheetPrompt(member, ask.sheet!, style(member.style) ?? lookStyle, portrait) : "")).trim();
  const shotCast = shot?.content.kind === "generated" ? (shot.content.cast ?? []) : [];
  const uses = castOf(prompt, project.cast, [...(ask.cast ?? []), ...shotCast, ...(!member && lookStyle ? [lookStyle] : [])]);
  const start = ask.start === "board" ? boardOf(project, shot) : ask.start;
  if (ask.start === "board" && !start) throw new Error(`Shot "${ask.shot}" has no board yet: make stills for it first`);
  const drive = ask.op === "video" ? driveFor(project, ask.drive === undefined && shot?.content.kind === "generated" ? shot.content.drive : ask.drive, needs?.seconds) : undefined;
  const clip = ask.op === "video" ? clipFor(project, shot, ask.clip, needs?.seconds) : undefined;
  const said = ask.speech !== undefined ? ask.speech : shot?.content.kind === "generated" && shot.content.speech ? shot.content.speech : clip ? {} : undefined;
  const speech =
    ask.op === "video" && said
      ? speechFor(project, shot, said, clip ? clip.to - clip.from : needs?.seconds, uses.filter((u) => u.member.kind === "character").map((u) => u.member.id))
      : undefined;

  let refs = ask.refs?.length ? ask.refs : undefined;
  let sent = castPrompt(prompt, uses);
  if (!refs && ask.op === "image" && member?.kind === "character") {
    // A character's portrait and sheet come from its look's steps: the face, then the wardrobe.
    const made = lookRefs(project, member, variantId, portrait, pictures, style(member.style) ?? lookStyle);
    if (made.refs.length) {
      refs = made.refs;
      sent = `${sent.replace(/[.!?]?\s*$/, ".")} ${made.words}`;
    }
  } else if (!refs && ask.op === "image") {
    // A sheet with no pictures yet starts from the photos it was made from.
    const photos =
      member && !member.images?.length ? (member.seen ?? []).map((s) => s.asset).filter((id) => project.assets.find((a) => a.id === id)?.kind === "image") : [];
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
      // As many pictures as the model takes, characters first; the rest are described in words.
      const pictured = castPictures(uses, pictures);
      if (pictured.length) {
        refs = pictured.map((p) => p.asset);
        sent = castPrompt(prompt, uses, pictured.map((p) => p.use));
        // Given a sheet of views, a model can copy its layout and give back a grid of the scene (Muse Image did).
        if (!member) sent += " The picture is one single frame of the scene, not a sheet, a grid or panels.";
      }
    }
  }
  // A variant's sheet starts from the plain one, which models copy view for view; the difference has to be in all of them.
  // A variant's portrait starts from photos in other clothes, so it says what's different too.
  const variant = member && variantId ? member.variants?.find((v) => v.id === variantId) : undefined;
  if (variant && !ask.prompt) sent = `${sent.replace(/[.!?]?\s*$/, ".")} ${portrait ? "In this portrait" : "In every view"}: ${variant.about}.`;
  const sheetAspect = portrait ? "4:5" : member && (member.kind === "character" || member.kind === "prop") ? "16:9" : undefined;
  const people = realPeople(uses, project.assets);
  const along = clip ?? drive ?? speech;
  // A clip that ended on a frame ends on it again; one that copies movement or says a line doesn't take one.
  const lastEnd = ask.op === "video" && start && !along && shot?.content.kind === "generated" ? shot.content.end : undefined;
  const end = ask.end === undefined ? lastEnd : (ask.end ?? undefined);
  const absent = ask.op === "video" && !clip ? missingFromFrames(project, [...(start ? [start] : []), ...(end ? [end] : []), ...(refs ?? [])], uses, [prompt, shot?.intent ?? ""]) : [];
  return {
    op: ask.op,
    prompt,
    sent,
    cast: [...new Set([...(ask.sheet ? [ask.sheet] : []), ...uses.map((u) => u.id)])],
    // Some services won't draw real people, so they're ruled out for a shot with one in it.
    ...(people.length ? { realPeople: people } : {}),
    quality: ask.quality ?? (ask.op === "video" ? "rough" : undefined),
    // A clip whose mouths are changed is the picture; it doesn't start from another.
    start: clip ? undefined : start,
    end,
    refs,
    ...(absent.length ? { absent } : {}),
    ...(drive ? { drive } : {}),
    ...(speech ? { speech } : {}),
    ...(clip ? { clip } : {}),
    // A take that follows a clip is as long as the stretch it follows, and one that lip-syncs as what it says.
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
  return { req, choices: chooseModels(CATALOG, req, serviceStates(), readSettings().make?.ranking?.[req.op] ?? []) };
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
      `This is about $${usd.toFixed(2)}, and only $${Math.max(0, opts.spendable).toFixed(2)} more can be spent this turn without asking (the person allows $${turnBudget().toFixed(2)} a turn). Ask first: a choose hand-off that says what it would cost.`,
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
  for (const id of [req.start, req.end, ...(req.refs ?? [])].filter((x): x is string => !!x)) {
    const a = project.assets.find((x) => x.id === id);
    if (!a) throw new Error(`${where}no asset "${id}"`);
    if (a.kind !== "image") throw new Error(`${where}"${id}" is a ${a.kind}; start frames, end frames and references are pictures`);
  }
  if (ask.shot) {
    const c = project.shots.find((s) => s.id === ask.shot)!.content;
    if (c.kind !== "placeholder" && c.kind !== "generated") throw new Error(`Shot "${ask.shot}" is a ${c.kind} shot; takes are for placeholder and generated shots`);
  }
  let fit: FitOk | undefined;
  if (ask.model) {
    const model = CATALOG.find((m) => m.id === ask.model);
    if (!model) throw new Error(`No model "${ask.model}"; list_models names them`);
    const f = fitModel(model, req, serviceStates());
    if (!f.ok) throw new Error(`${where}${model.label} can't make this: ${f.why.reason}`);
    fit = f;
  } else {
    fit = choices.auto;
    if (!fit) {
      const why = [...choices.setup, ...choices.unfit].map((f) => (f.ok ? "" : `${f.label}: ${f.why.reason}`)).filter(Boolean);
      throw new Error(why.length ? `${where}nothing can make this now. ${why.join(". ")}.` : `No model makes ${req.op === "image" ? "images" : "video"}`);
    }
  }
  // Picked: a model that takes more pictures than every still model does is given more of the cast's.
  let full = req;
  const model = CATALOG.find((m) => m.id === fit!.model)!;
  if (req.op === "image" && !ask.refs?.length && (model.takes.refs ?? 0) > fewestStillRefs(CATALOG)) {
    const more = requestFor(projectId, ask, model.takes.refs);
    const f = fitModel(model, { ...more, via: fit!.route }, serviceStates());
    if ((more.refs?.length ?? 0) > (req.refs?.length ?? 0) && f.ok) [full, fit] = [more, f];
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
    const jobs = Array.from({ length: count }, () =>
      saveJob(projectId, {
        id: newId("j"),
        batch,
        cut: p.ask.cut ?? cut,
        shot: p.ask.shot,
        sheet: p.ask.sheet,
        ...(p.ask.sheet && p.ask.portrait ? { portrait: true as const } : {}),
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
          ...(p.req.drive ? { drive: p.req.drive } : {}),
          ...(p.req.speech ? { speech: p.req.speech } : {}),
          ...(p.req.clip ? { clip: p.req.clip } : {}),
          seconds: p.fit.seconds,
          aspect: p.fit.aspect,
          seed: takesSeed(p.shape) ? randomInt(2 ** 31) : undefined,
          shotSeconds: p.req.seconds,
        },
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

/** Starts the takes one request asks for (see startMakeAll). */
export function startMake(projectId: string, ask: MakeAsk, opts: { spendable?: number } = {}): { fit: FitOk; jobs: MakeJob[] } {
  const { plans } = startMakeAll(projectId, [ask], opts);
  return { fit: plans[0]!.fit, jobs: plans[0]!.jobs };
}

/** Stops jobs that haven't finished. The service is asked to drop them too; one already running may still bill. */
export async function cancelJobs(projectId: string, ids: string[]): Promise<MakeJob[]> {
  const jobs = ids.map((id) => readJob(projectId, id)).filter((j): j is MakeJob => !!j && isOpen(j));
  const key = jobs.some((j) => j.remote) ? await getSecret("fal") : undefined;
  const out: MakeJob[] = [];
  for (const job of jobs) {
    if (job.remote && key) await falCancel(key, job.remote);
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
    if (sheet === job.sheet && prompt === job.request.prompt && cast?.join() === job.request.cast?.join()) continue;
    // Read again just before writing: the job may have moved on since the list was read.
    const now = readJob(projectId, job.id) ?? job;
    saveJob(projectId, { ...now, ...(sheet ? { sheet } : {}), request: { ...now.request, prompt, ...(cast ? { cast } : {}) } });
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
    const again = kept ? { ...job, status: "running" as const } : { ...job, status: "queued" as const, remote: undefined, comfy: undefined, file: undefined, charged: undefined };
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

/** One step of a job: send it, or ask where it is, or bring in what it made. */
async function step(projectId: string, job: MakeJob, key: string | undefined) {
  if (job.route === "comfy") return stepComfy(projectId, job);
  const plan = PLAN_ROUTES.includes(job.route);
  if (!key && !job.file && !plan) {
    const name = SERVICES.find((s) => s.id === job.route)?.label ?? job.route;
    throw new FalError(`Making this needs a ${name} key. The person can add one in Settings → Media services.`, true);
  }
  if (DIRECT.includes(job.route) || plan) return stepDirect(projectId, job, key);
  if (job.route !== "fal" || !key) throw new FalError(`beatsheet can't run ${job.route} jobs yet`, true);
  if (!job.remote) {
    const { project, dir } = loadProject(projectId, job.cut);
    const upload = (id: string) => {
      const a = project.assets.find((x) => x.id === id);
      if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return falUpload(key, assetPath(project, dir, a));
    };
    const r = job.request;
    // A cast member's own photos go cut out, when that can be done here.
    const uploadRef = async (id: string) => {
      if (!project.assets.some((x) => x.id === id)) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return falUpload(key, await refFile(project, dir, id, r.cast));
    };
    const input = falInput(job.shape, {
      prompt: r.sent ?? r.prompt,
      quality: job.quality,
      seconds: r.seconds,
      aspect: r.aspect,
      seed: r.seed,
      start: r.start && (await upload(r.start)),
      end: r.end && (await upload(r.end)),
      refs: r.refs && (await Promise.all(r.refs.map(uploadRef))),
      video: r.drive ? await falUpload(key, await driveClip(project, dir, job)) : r.clip && (await falUpload(key, await dubClip(project, dir, job))),
      audio: r.speech && (await falUpload(key, await speechSound(project, dir, job, join(dir, ".cache", "speech", `${job.id}.wav`)))),
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
  const fileOf = (id: string) => {
    const a = project.assets.find((x) => x.id === id);
    if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
    return assetPath(project, dir, a);
  };
  const r = job.request;
  for (const id of r.refs ?? []) fileOf(id);
  const refs = r.refs && (await Promise.all(r.refs.map((id) => refFile(project, dir, id, r.cast))));
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
      const refs = r.refs ?? [];
      const most = refsIn(loaded);
      if (refs.length > most) throw new FalError(`The ${spec.label} workflow takes ${most} reference picture${most === 1 ? "" : "s"}; this has ${refs.length}`, true);
      // The nodes for pictures it isn't given come out.
      let workflow = loaded;
      for (let k = refs.length + 1; k <= most; k++) workflow = without(workflow, `STUDIO_REF_IMAGE_${k}`);
      const [w, h] = (r.aspect ?? "1:1").split(":").map(Number);
      const size = fitSize(w || 1, h || 1, spec.area[profile], spec.multiple);
      const values: Record<string, unknown> = { STUDIO_SEED: r.seed ?? randomInt(2 ** 31), STUDIO_WIDTH: size.width, STUDIO_HEIGHT: size.height, STUDIO_PROMPT: r.sent ?? r.prompt };
      for (const [i, id] of refs.entries()) {
        if (!project.assets.some((a) => a.id === id)) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
        const file = join(work, `ref${i + 1}.png`);
        // A photo the picture library can't read (a phone's HEIC) goes as its upright preview instead.
        await fitReference(await refFile(project, dir, id, r.cast), file).catch(() => fitReference(cachePaths(dir, id).image, file));
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
      attach(projectId, job, asset);
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
async function download(projectId: string, job: MakeJob, out: { url: string; contentType?: string }): Promise<string> {
  const res = await fetch(out.url, { signal: AbortSignal.timeout(10 * 60_000) }).catch((err: unknown) => {
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
type Taken = { url: string; contentType?: string; seed?: number } | { file: string; seed?: undefined };

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
  // One that lip-syncs comes back saying its line, which the cut's voice plays already (ComfyUI's takes are trimmed
  // silent); a file that won't read is left as it is.
  if (r.speech && !("file" in out)) await silence(file).catch(() => undefined);
  const from = [r.start, r.end, ...(r.refs ?? []), r.drive?.asset, r.clip?.asset, r.speech && "asset" in r.speech ? r.speech.asset : undefined].filter((x): x is string => !!x);
  return addAsset(projectId, file, {
    id: job.sheet ? `${job.sheet.replace("/", "-")}-${job.portrait ? "portrait" : "sheet"}` : `${job.shot ?? job.op}-take`,
    label: r.prompt.length > 60 ? `${r.prompt.slice(0, 57).trimEnd()}…` : r.prompt,
    tags: [job.sheet ? (job.portrait ? "portrait" : "sheet") : "take"],
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
      op: job.op,
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
function attach(projectId: string, job: MakeJob, asset: Asset) {
  if (job.sheet) {
    const [id, variant] = job.sheet.split("/");
    updateFile(projectId, (d) => {
      const m = d.cast?.find((x) => x.id === id);
      const target = variant ? m?.variants?.find((v) => v.id === variant) : m;
      if (!m || !target || lookAssets(target).includes(asset.id)) return;
      if (m.kind === "character") {
        const [one, many] = job.portrait ? (["portrait", "portraits"] as const) : (["sheet", "sheets"] as const);
        if (target[one]) target[many] = [...(target[many] ?? []), asset.id];
        else target[one] = asset.id;
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
        const { start: _s, end: _e, in: _i, refs: _r, drive: _d, speech: _p, ...rest } = g;
        Object.assign(rest, {
          take: asset.id,
          ...(asset.kind === "video" ? { clipPrompt: r.prompt } : { prompt: r.prompt }),
          provider: job.route,
          model: job.model,
          ...(made.start ? { start: made.start } : {}),
          ...(made.end ? { end: made.end } : {}),
          ...(made.refs?.length ? { refs: made.refs } : {}),
          ...(made.drive ? { drive: made.drive } : {}),
          ...(r.speech ? { speech: speechOnShot(r.speech) } : {}),
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
  const what = [
    j.shot ? `shot ${j.shot}` : j.sheet ? `sheet for @${j.sheet}` : j.op,
    model,
    j.quality ?? "",
    j.request.seconds ? `${j.request.seconds}s` : "",
    j.request.aspect ?? "",
    d ? `following ${d.asset} ${d.from}–${d.to}s` : "",
    s ? `saying ${"lines" in s ? `line${s.lines.length === 1 ? "" : "s"} ${s.lines.join(", ")}` : `${s.asset} ${s.from}–${s.to}s`}` : "",
    c ? `with the mouths changed in ${c.asset} ${c.from}–${c.to}s` : "",
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
