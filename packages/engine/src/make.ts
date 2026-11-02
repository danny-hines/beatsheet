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
  castPrompt,
  fewestStillRefs,
  chooseModels,
  driveWindow,
  FIDELITY,
  fitModel,
  HANDLE,
  shapeOf,
  shotNeeds,
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
  comfyUrl,
  comfyVideo,
  describeMissing,
  fill,
  fitClip,
  fitPicture,
  fitSize,
  framesFor,
  loadWorkflow,
  nodesTitled,
  outputMarker,
  OWN_WORKFLOWS,
  profileFor,
  trimTake,
  workflowPath,
  WORKFLOWS,
  type ComfyPrompt,
} from "./comfy.ts";
import { DIRECT, directImage } from "./direct.ts";
import { PLAN_ROUTES, planImage, planStates } from "./plans.ts";
import { falCancel, FalError, falInput, falOutput, falResult, falStatus, falSubmit, falUpload, takesSeed, type FalRequest } from "./fal.ts";
import { addAsset } from "./ingest.ts";
import { unletterbox } from "./letterbox.ts";
import { assetPath, projectDir } from "./paths.ts";
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
   * A job on ComfyUI, saved before it's sent: our own prompt id, the server, the output nodes, the frames to keep and
   * at what rate, the workflow profile, and the filled prompt itself, to send again if ComfyUI restarts and forgets it.
   */
  comfy?: { id: string; url: string; outputs: string[]; frames: number; fps: number; profile: string; prompt: ComfyPrompt };
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
export type MakeAsk = Partial<Omit<MakeRequest, "op" | "start" | "drive">> & {
  op: MakeOp;
  cut?: string;
  /** A placeholder or generated shot it's for: its length, the cut's shape and its description fill in what's missing, and the takes land on it. */
  shot?: string;
  /** A cast member (or variant: cat/heist) it's a sheet for: the stills join its pictures. */
  sheet?: string;
  /** Cast and sets in it beyond the ones the prompt names. */
  cast?: string[];
  /** Asset id of the picture a clip starts from, or "board": the shot's chosen still. */
  start?: string;
  /**
   * For a clip that copies movement: the clip to follow, from a second of it (default 0) to another (default the shot's
   * length later). Without it, a generated shot's clips follow what its takes followed before; null for none.
   */
  drive?: { asset: string; from?: number; to?: number } | null;
  model?: string;
};

/** A request in full, with what goes to the model: the prompt with its cast described, and the cast it names. */
export type FullRequest = MakeRequest & { sent: string; cast: string[] };

/**
 * The prompt a sheet is made from when none is given: clean views of one cast member, to give models later, in its
 * style (its own, else the look's). Without a style, a photograph, said in so many words: "reference sheet" alone
 * gets a drawing, and the boards made from a drawn sheet come out drawn too.
 */
function sheetPrompt(member: CastMember, id: string, style: string | undefined): string {
  if (member.kind === "style") return `A single still that shows the look of @${id}.`;
  if (member.kind === "place")
    return style
      ? `A wide establishing view of @${id}, empty of people, nothing else in the picture and no text or labels, in the style of @${style}.`
      : `A wide establishing photograph of @${id} in even daylight, empty of people, nothing else in the picture and no text or labels.`;
  return style
    ? `A reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, nothing else in the picture and no text or labels, in the style of @${style}.`
    : `A photographic reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture and no text or labels.`;
}

/** The still a shot's clips start from: the take showing when it's a still, else the one its clip was made from. */
function boardOf(project: Project, shot: Shot | undefined): string | undefined {
  const c = shot?.content;
  if (c?.kind !== "generated") return undefined;
  return project.assets.find((a) => a.id === c.take)?.kind === "image" ? c.take : c.start;
}

/**
 * The request in full. A shot fills in its length (for video), the cut's shape and its description; a sheet, a
 * prompt for clean views of its cast member. Cast named with @ are described in what the model reads, and stills are
 * given their pictures (a sheet with no pictures yet, the photos it was made from, and its style's picture when there's
 * room): as many as `pictures`, which is what every still model takes until one is picked. A clip from a board doesn't
 * need them: they're in the board.
 */
export function requestFor(projectId: string, ask: MakeAsk, pictures = fewestStillRefs(CATALOG)): FullRequest {
  const { project } = loadProject(projectId, ask.cut);
  const shot = ask.shot ? project.shots.find((s) => s.id === ask.shot) : undefined;
  if (ask.shot && !shot) throw new Error(`No shot "${ask.shot}" in this cut`);
  const [castId, variantId] = (ask.sheet ?? "").split("/");
  const member = ask.sheet ? project.cast?.find((m) => m.id === castId) : undefined;
  if (ask.sheet && (!member || (variantId && !member.variants?.some((v) => v.id === variantId)))) throw new Error(`No cast member "${ask.sheet}"`);
  const needs = shot ? shotNeeds(project, shot.id) : undefined;
  const format = project.formats[0]!;
  // The style made shots are drawn in; a sheet takes its member's own when it has one, and names it in its prompt.
  const style = (id: string | undefined) => (id && project.cast?.some((m) => m.id === id && m.kind === "style") ? id : undefined);
  const lookStyle = style(project.look?.style);
  const prompt = (ask.prompt ?? needs?.prompt ?? (member ? sheetPrompt(member, ask.sheet!, style(member.style) ?? lookStyle) : "")).trim();
  const shotCast = shot?.content.kind === "generated" ? (shot.content.cast ?? []) : [];
  const uses = castOf(prompt, project.cast, [...(ask.cast ?? []), ...shotCast, ...(!member && lookStyle ? [lookStyle] : [])]);
  const start = ask.start === "board" ? boardOf(project, shot) : ask.start;
  if (ask.start === "board" && !start) throw new Error(`Shot "${ask.shot}" has no board yet: make stills for it first`);
  const drive = ask.op === "video" ? driveFor(project, ask.drive === undefined && shot?.content.kind === "generated" ? shot.content.drive : ask.drive, needs?.seconds) : undefined;

  let refs = ask.refs?.length ? ask.refs : undefined;
  let sent = castPrompt(prompt, uses);
  if (!refs && ask.op === "image") {
    const photos = member && !member.images?.length ? (member.seen ?? []).map((s) => s.asset).filter((id) => project.assets.find((a) => a.id === id)?.kind === "image") : [];
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
  const variant = member && variantId ? member.variants?.find((v) => v.id === variantId) : undefined;
  if (variant && !ask.prompt) sent = `${sent.replace(/[.!?]?\s*$/, ".")} In every view: ${variant.about}.`;
  const sheetAspect = member &&(member.kind === "character" || member.kind === "prop") ? "16:9" : undefined;
  return {
    op: ask.op,
    prompt,
    sent,
    cast: [...new Set([...(ask.sheet ? [ask.sheet] : []), ...uses.map((u) => u.id)])],
    quality: ask.quality ?? (ask.op === "video" ? "rough" : undefined),
    start,
    end: ask.end,
    refs,
    ...(drive ? { drive } : {}),
    // A take that follows a clip is as long as the stretch it follows.
    seconds: drive ? Math.round((drive.to - drive.from) * 1000) / 1000 : (ask.seconds ?? (ask.op === "video" ? needs?.seconds : undefined)),
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
  const { key, text } = castRenaming(from, to);
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
      seconds: r.seconds,
      aspect: r.aspect,
      seed: r.seed,
      start: r.start && (await upload(r.start)),
      end: r.end && (await upload(r.end)),
      refs: r.refs && (await Promise.all(r.refs.map(uploadRef))),
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
 * A job on ComfyUI (comfy.ts). First the picture (and, for a workflow that follows a clip, the stretch of it) is fitted
 * to the size the workflow makes for this quality (the picture's shape, smaller for a rough), the clip padded out to
 * whole chunks, sent up and the workflow filled in; the job is saved with its prompt id before the prompt is sent.
 * After that each step asks where it is, and once it's done the take is fetched, trimmed to its length and brought in.
 * A ComfyUI that restarted (and so forgot its queue) is sent the saved prompt again.
 */
async function stepComfy(projectId: string, job: MakeJob) {
  // Canceled since this round of steps began: nothing more to do (cancelJobs stopped it in ComfyUI).
  const now = readJob(projectId, job.id);
  if (now && !isOpen(now)) return;
  if (job.file) return finish(projectId, job, { file: job.file });
  const url = job.comfy?.url ?? comfyUrl();
  if (!url) throw new FalError("ComfyUI isn't connected. The person can connect it in Settings → Making.", true);
  if (!job.comfy) {
    const spec = WORKFLOWS[job.endpoint];
    if (!spec) throw new FalError(`beatsheet doesn't know the ComfyUI workflow "${job.endpoint}"`, true);
    const profile = profileFor(job.endpoint, job.quality);
    if (!profile) throw new FalError(`There's no ${spec.label} workflow here: export one from ComfyUI (File → Export (API)) as ${job.endpoint}.full.api.json into ${OWN_WORKFLOWS}`, true);
    const workflow = loadWorkflow(workflowPath(job.endpoint, profile)!);
    const { project, dir } = loadProject(projectId, job.cut);
    const r = job.request;
    const picture = project.assets.find((a) => a.id === r.start);
    if (!picture) throw new FalError("The picture this take was asked from isn't in the project any more", true);
    const size = fitSize(picture.width ?? 1280, picture.height ?? 720, spec.area[profile], spec.multiple);
    const work = join(dir, ".cache", "comfy", job.id);
    const ref = join(work, "ref.png");
    await fitPicture(assetPath(project, dir, picture), ref, size.width, size.height);
    const values: Record<string, unknown> = {
      STUDIO_REF_IMAGE: await comfyUpload(url, ref, `${job.id}_ref.png`),
      STUDIO_SEED: r.seed ?? randomInt(2 ** 31),
      STUDIO_WIDTH: size.width,
      STUDIO_HEIGHT: size.height,
      STUDIO_FPS: spec.fps,
      STUDIO_PROMPT: r.sent ?? r.prompt,
    };
    let frames: number;
    let marker = "STUDIO_OUTPUT";
    if (spec.drive) {
      // The stretch of the clip, at the workflow's rate, held out to whole chunks.
      const clip = r.drive && project.assets.find((a) => a.id === r.drive!.asset);
      if (!clip) throw new FalError("The clip this take was asked to follow isn't in the project any more", true);
      const win = driveWindow(r.drive!, r.seconds ?? r.drive!.to - r.drive!.from, clip.duration);
      frames = Math.max(1, Math.round((win.to - win.from) * spec.fps));
      const { chunks, capacity } = chunksFor(frames, spec.first!, spec.extend!);
      const most = chunksIn(workflow);
      if (chunks > most) throw new FalError(`The ${spec.label} workflow makes up to ${((spec.first! + spec.extend! * (most - 1)) / spec.fps).toFixed(1)}s; this is ${(frames / spec.fps).toFixed(1)}s. Split the shot in two`, true);
      const drive = join(work, "drive.mp4");
      await fitClip(assetPath(project, dir, clip), drive, win.from, win.to, size.width, size.height, spec.fps, capacity);
      values.STUDIO_DRIVING_VIDEO = await comfyUpload(url, drive, `${job.id}_drive.mp4`);
      marker = outputMarker(workflow, chunks);
    } else {
      frames = framesFor(r.seconds ?? 5, spec.fps, spec.maxFrames!);
      values.STUDIO_FRAMES = frames;
    }
    values[marker] = `beatsheet/${job.id}`;
    const prompt = fill(workflow, values);
    const missing = describeMissing(await comfyMissing(url, prompt));
    if (missing.length) throw new FalError(`ComfyUI is missing what the ${spec.label} workflow needs: ${missing.join("; ")}. Settings → Making can fetch the model files.`, true);
    job = updateJob(projectId, job, { status: "running", comfy: { id: randomUUID(), url, outputs: nodesTitled(prompt, marker), frames, fps: spec.fps, profile, prompt } });
    await comfySubmit(url, prompt, job.comfy!.id, job.comfy!.outputs);
    return;
  }
  const c = job.comfy;
  const s = await comfyJob(c.url, c.id);
  // ComfyUI restarted (it keeps its queue in memory), or the prompt never got there: it's sent again.
  if (!s) return comfySubmit(c.url, c.prompt, c.id, c.outputs);
  if (s.status === "cancelled") throw new FalError("It was stopped in ComfyUI", true);
  if (s.status === "failed") {
    const e = s.execution_error ?? {};
    const said = [e.node_type && `${e.node_type} (#${e.node_id})`, [e.exception_type, e.exception_message].filter(Boolean).join(": ")].filter(Boolean).join(": ") || "it failed";
    throw new FalError(`ComfyUI couldn't make it: ${said.trim()}${/out of memory/i.test(said) ? " (a shorter stretch, or a rough rather than a final, needs less)" : ""}`.slice(0, 1500), true);
  }
  if (s.status !== "completed") {
    const position = s.status === "pending" ? await comfyAhead(c.url, c.id).catch(() => undefined) : undefined;
    if (position !== job.position || job.status !== "running") updateJob(projectId, job, job.status === "running" ? { position } : { status: "running", position });
    return;
  }
  if (!job.charged) job = updateJob(projectId, job, { charged: true });
  const video = await comfyVideo(c.url, c.id, c.outputs);
  if (!video) throw new FalError("ComfyUI finished but didn't save a video", true);
  const raw = join(projectDir(projectId), ".cache", "comfy", job.id, "raw.mp4");
  await comfyDownload(c.url, video, raw);
  const file = join(projectDir(projectId), "made", "takes", `${job.id}.mp4`);
  await trimTake(raw, file, c.fps, c.frames);
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
  return addAsset(projectId, file, {
    id: job.sheet ? `${job.sheet.replace("/", "-")}-sheet` : `${job.shot ?? job.op}-take`,
    label: r.prompt.length > 60 ? `${r.prompt.slice(0, 57).trimEnd()}…` : r.prompt,
    tags: [job.sheet ? "sheet" : "take"],
    provenance: {
      source: "generated",
      provider: job.route,
      model: job.endpoint,
      prompt: r.sent ?? r.prompt,
      ...(r.cast?.length ? { cast: r.cast } : {}),
      seed: out.seed ?? r.seed,
      ...(r.start || r.end || r.refs?.length || r.drive ? { refs: [r.start, r.end, ...(r.refs ?? []), r.drive?.asset].filter((x): x is string => !!x) } : {}),
      costUsd: job.usd,
      createdAt: new Date().toISOString(),
      op: job.op,
      params: {
        model: job.model,
        ...(r.seconds !== undefined ? { seconds: r.seconds } : {}),
        ...(r.aspect ? { aspect: r.aspect } : {}),
        ...(job.quality ? { quality: job.quality } : {}),
        ...(r.drive ? { drive: r.drive } : {}),
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
 * Puts what a job made where it was asked for. A sheet joins its cast member's pictures (the first becomes the main
 * one). A take joins its shot's takes: the first is the one the shot shows, and so is the first clip over a board (a
 * still) and the first final over a rough, trimmed to the middle of the little extra it was made with. The shot's
 * fidelity moves up to match.
 */
function attach(projectId: string, job: MakeJob, asset: Asset) {
  if (job.sheet) {
    const [id, variant] = job.sheet.split("/");
    updateFile(projectId, (d) => {
      const m = d.cast?.find((x) => x.id === id);
      const target = variant ? m?.variants?.find((v) => v.id === variant) : m;
      if (target && !target.images?.includes(asset.id)) target.images = [...(target.images ?? []), asset.id];
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
      const better = asset.kind === "video" && (showing?.kind === "image" || (job.quality === "final" && qualityOf(showing) !== "final"));
      if (!showing || better) {
        const r = job.request;
        // A take that follows a clip starts where the stretch asked for does; others have their spare evenly either side.
        const clip = r.drive && p.assets.find((a) => a.id === r.drive!.asset);
        const spare = r.drive
          ? driveWindow(r.drive, r.seconds ?? r.drive.to - r.drive.from, clip ? clip.duration : undefined).lead
          : asset.kind === "video" && asset.duration && r.shotSeconds
            ? Math.min(HANDLE, Math.max(0, (asset.duration - r.shotSeconds) / 2))
            : 0;
        const { start: _s, end: _e, in: _i, refs: _r, drive: _d, ...rest } = g;
        Object.assign(rest, {
          take: asset.id,
          prompt: r.prompt,
          provider: job.route,
          model: job.model,
          ...(r.start ? { start: r.start } : {}),
          ...(r.end ? { end: r.end } : {}),
          ...(r.refs?.length ? { refs: r.refs } : {}),
          ...(r.drive ? { drive: r.drive } : {}),
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
  const what = [
    j.shot ? `shot ${j.shot}` : j.sheet ? `sheet for @${j.sheet}` : j.op,
    model,
    j.quality ?? "",
    j.request.seconds ? `${j.request.seconds}s` : "",
    j.request.aspect ?? "",
    d ? `following ${d.asset} ${d.from}–${d.to}s` : "",
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
