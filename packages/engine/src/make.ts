/**
 * Making new footage with the person's services. A request becomes one job per take, each saved in the project's
 * jobs/ folder before anything is sent, so a restart or a closed agent session loses only the waiting, never the take:
 * the service keeps it under the request id the job records. Whichever engine process is running drives the
 * unfinished jobs, and a lock file beside each stops two processes driving the same one. A finished take is added like
 * any other asset and, when the job was for a shot, becomes one of that shot's takes.
 */
import { randomInt } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import {
  aspectOf,
  CATALOG,
  castOf,
  castPictures,
  castPrompt,
  chooseModels,
  FIDELITY,
  fitModel,
  HANDLE,
  shapeOf,
  shotNeeds,
  type Asset,
  type CastMember,
  type Choices,
  type FitOk,
  type MakeOp,
  type MakeRequest,
  type Project,
  type Quality,
  type ServiceState,
  type Shot,
  type ShotContent,
} from "@beatsheet/schema";
import { falCancel, FalError, falInput, falOutput, falResult, falStatus, falSubmit, falUpload, takesSeed, type FalRequest } from "./fal.ts";
import { addAsset } from "./ingest.ts";
import { assetPath, projectDir } from "./paths.ts";
import { replaceFile } from "./platform.ts";
import { SERVICES } from "./services.ts";
import { getSecret, readSettings } from "./settings.ts";
import { loadFile, loadProject, updateFile, updateProject } from "./store.ts";

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
  /** Place in the service's queue, while waiting. */
  position?: number;
  error?: string;
  /** The take it made. */
  asset?: string;
  createdAt: string;
  updatedAt: string;
};

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

function saveJob(projectId: string, job: MakeJob): MakeJob {
  const next = { ...job, updatedAt: new Date().toISOString() };
  mkdirSync(jobsDir(projectId), { recursive: true });
  const file = jobFile(projectId, job.id);
  writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2));
  replaceFile(`${file}.tmp`, file);
  return next;
}

// ---- What can make what, with the services there are.

/** Every service's state for the fit check: a key in the Keychain counts as ready (checking it costs a request). */
export function serviceStates(): Record<string, ServiceState> {
  const saved = readSettings().services;
  return Object.fromEntries(SERVICES.map((s) => [s.id, saved[s.id] ? { label: s.label, state: "ready" } : { label: s.label, state: "missing" }]));
}

/** Something to make, as the agent's tools and the studio ask for it. */
export type MakeAsk = Partial<Omit<MakeRequest, "op" | "start">> & {
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
      ? `A wide establishing view of @${id}, empty of people, nothing else in the picture, in the style of @${style}.`
      : `A wide establishing photograph of @${id} in even daylight, empty of people, nothing else in the picture.`;
  return style
    ? `A reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, nothing else in the picture, in the style of @${style}.`
    : `A photographic reference sheet of @${id}: front, three-quarter and side views and a full-length view, side by side on a plain light gray background, soft even studio light, realistic and photographed rather than drawn, nothing else in the picture.`;
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
 * given their pictures (a sheet with no pictures yet, the photos it was made from). A clip from a board doesn't need
 * them: they're in the board.
 */
export function requestFor(projectId: string, ask: MakeAsk): FullRequest {
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

  let refs = ask.refs?.length ? ask.refs : undefined;
  let sent = castPrompt(prompt, uses);
  if (!refs && ask.op === "image") {
    const photos = member && !member.images?.length ? (member.seen ?? []).map((s) => s.asset).filter((id) => project.assets.find((a) => a.id === id)?.kind === "image") : [];
    if (photos.length) {
      refs = photos.slice(0, 4);
      // What to keep from the photos, whatever the style: a drawn cat is still this cat.
      const keep = member!.kind === "place" ? "its layout, colors and details" : `${member!.name}'s features, markings, colors and shape`;
      sent = `${sent.replace(/[.!?]?\s*$/, ".")} The reference photos show ${member!.name}: keep ${keep} exactly.`;
    } else {
      const pictures = castPictures(uses);
      if (pictures.length) {
        refs = pictures.map((p) => p.asset);
        sent = castPrompt(prompt, uses, pictures.map((p) => p.use));
      }
    }
  }
  const sheetAspect = member && (member.kind === "character" || member.kind === "prop") ? "16:9" : undefined;
  return {
    op: ask.op,
    prompt,
    sent,
    cast: [...new Set([...(ask.sheet ? [ask.sheet] : []), ...uses.map((u) => u.id)])],
    quality: ask.quality ?? (ask.op === "video" ? "rough" : undefined),
    start,
    end: ask.end,
    refs,
    seconds: ask.seconds ?? (ask.op === "video" ? needs?.seconds : undefined),
    aspect: ask.aspect ?? sheetAspect ?? aspectOf(format.width, format.height),
    count: ask.count,
  };
}

/** The models for a request, sorted for a picker, with Auto first among the ready ones. */
export function makeChoices(projectId: string, ask: MakeAsk): { req: FullRequest; choices: Choices } {
  const req = requestFor(projectId, ask);
  return { req, choices: chooseModels(CATALOG, req, serviceStates(), readSettings().make?.ranking?.[req.op] ?? []) };
}

/** What the agent's jobs have cost so far in its current turn (nothing when it isn't the agent's turn). */
export function spentThisTurn(projectId: string): number {
  const turn = loadFile(projectId).doc.turn;
  if (turn?.who !== "agent") return 0;
  const spent = listJobs(projectId)
    .filter((j) => j.createdAt >= turn.since && j.status !== "failed" && j.status !== "canceled")
    .reduce((sum, j) => sum + (j.usd ?? 0), 0);
  return Math.round(spent * 1000) / 1000;
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
  const route = CATALOG.find((m) => m.id === fit.model)!.routes.find((r) => r.via === fit.route && r.endpoints[shapeOf(req)] === fit.endpoint)!;
  return { ask, req, fit, shape: route.shape };
}

/** What a set of requests would cost, by model, without starting them: for a whole pass over a cut's shots. */
export function estimate(
  projectId: string,
  asks: MakeAsk[],
): { rows: { model: string; label: string; usd: number; made: number; unfit: { shot?: string; reason: string }[] }[]; problems: { shot?: string; reason: string }[] } {
  const out = new Map<string, { model: string; label: string; usd: number; made: number; unfit: { shot?: string; reason: string }[] }>();
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
    for (const f of [...choices.ready, ...choices.setup, ...choices.unfit]) {
      const row = out.get(f.model) ?? { model: f.model, label: f.label, usd: 0, made: 0, unfit: [] };
      if (f.ok) {
        row.usd = Math.round((row.usd + (f.usd ?? 0)) * 1000) / 1000;
        row.made++;
      } else row.unfit.push({ shot: ask.shot, reason: f.why.reason });
      out.set(f.model, row);
    }
  }
  return { rows: [...out.values()], problems };
}

/**
 * Starts the takes requests ask for: checks every one first (so a pass over many shots starts all or nothing), then
 * saves a job for each take and sets them going. Returns at once; the takes land in the project as they finish. With
 * `spendable`, requests estimated to cost more than that in all are refused before anything is sent.
 */
export function startMakeAll(projectId: string, asks: MakeAsk[], opts: { spendable?: number } = {}): { plans: (Plan & { jobs: MakeJob[] })[]; usd: number } {
  const plans = asks.map((ask) => plan(projectId, ask));
  const usd = Math.round(plans.reduce((sum, p) => sum + (p.fit.usd ?? 0), 0) * 1000) / 1000;
  if (opts.spendable !== undefined && usd > opts.spendable + 1e-9)
    throw new Error(
      `This is about $${usd.toFixed(2)}, and only $${Math.max(0, opts.spendable).toFixed(2)} more can be spent this turn without asking (the person allows $${turnBudget().toFixed(2)} a turn). Ask first: a choose hand-off that says what it would cost.`,
    );
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
  const key = await getSecret("fal");
  const out: MakeJob[] = [];
  for (const id of ids) {
    const job = readJob(projectId, id);
    if (!job || !isOpen(job)) continue;
    if (job.remote && key) await falCancel(key, job.remote);
    out.push(saveJob(projectId, { ...job, status: "canceled" }));
  }
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
    const key = await getSecret("fal");
    await Promise.all(
      mine.map(async (job) => {
        try {
          await step(projectId, job, key);
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
  if (job.route !== "fal") throw new FalError(`beatsheet can't run ${job.route} jobs yet`, true);
  if (!key) throw new FalError("Making this needs a fal key. The person can add one in Settings → Media services.", true);
  if (!job.remote) {
    const { project, dir } = loadProject(projectId, job.cut);
    const upload = (id: string) => {
      const a = project.assets.find((x) => x.id === id);
      if (!a) throw new FalError(`The picture "${id}" isn't in the project any more`, true);
      return falUpload(key, assetPath(project, dir, a));
    };
    const r = job.request;
    const input = falInput(job.shape, {
      prompt: r.sent ?? r.prompt,
      seconds: r.seconds,
      aspect: r.aspect,
      seed: r.seed,
      start: r.start && (await upload(r.start)),
      end: r.end && (await upload(r.end)),
      refs: r.refs && (await Promise.all(r.refs.map(upload))),
    });
    const remote = await falSubmit(key, job.endpoint, input);
    saveJob(projectId, { ...job, status: "running", remote });
    return;
  }
  const s = await falStatus(key, job.remote);
  if (s.state !== "done") {
    const position = s.state === "queued" ? s.position : undefined;
    if (position !== job.position || job.status !== "running") saveJob(projectId, { ...job, status: "running", position });
    return;
  }
  if (s.error) throw new FalError(s.error, true);
  const out = falOutput(await falResult(key, job.remote));
  if (!out) throw new FalError("fal finished but didn't send a file", true);
  const asset = await bringIn(projectId, job, out);
  attach(projectId, job, asset);
  saveJob(projectId, { ...job, status: "done", position: undefined, asset: asset.id });
}

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "video/quicktime": ".mov" };

/** Downloads the take into made/takes/ and adds it as an asset, once: a job picked up again after a crash finds its own. */
async function bringIn(projectId: string, job: MakeJob, out: { url: string; contentType?: string; seed?: number }): Promise<Asset> {
  const have = loadProject(projectId, job.cut).project.assets.find((a) => a.provenance?.job === job.id);
  if (have) return have;
  const res = await fetch(out.url, { signal: AbortSignal.timeout(10 * 60_000) }).catch((err: unknown) => {
    throw new FalError(`Couldn't download the take (${err instanceof Error ? err.message : String(err)})`, false);
  });
  if (!res.ok) throw new FalError(`Couldn't download the take (${res.status})`, res.status === 404 || res.status === 410);
  const ext = EXT[(out.contentType ?? res.headers.get("content-type") ?? "").split(";")[0]!.trim()] ?? (extname(new URL(out.url).pathname) || (job.op === "image" ? ".jpg" : ".mp4"));
  const dir = join(projectDir(projectId), "made", "takes");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${job.id}${ext}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
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
      ...(r.start || r.end || r.refs?.length ? { refs: [r.start, r.end, ...(r.refs ?? [])].filter((x): x is string => !!x) } : {}),
      costUsd: job.usd,
      createdAt: new Date().toISOString(),
      op: job.op,
      params: { model: job.model, ...(r.seconds !== undefined ? { seconds: r.seconds } : {}), ...(r.aspect ? { aspect: r.aspect } : {}), ...(job.quality ? { quality: job.quality } : {}) },
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
        const spare = asset.kind === "video" && asset.duration && r.shotSeconds ? Math.min(HANDLE, Math.max(0, (asset.duration - r.shotSeconds) / 2)) : 0;
        const { start: _s, end: _e, in: _i, refs: _r, ...rest } = g;
        Object.assign(rest, {
          take: asset.id,
          prompt: r.prompt,
          provider: job.route,
          model: job.model,
          ...(r.start ? { start: r.start } : {}),
          ...(r.end ? { end: r.end } : {}),
          ...(r.refs?.length ? { refs: r.refs } : {}),
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
  const what = [j.shot ? `shot ${j.shot}` : j.sheet ? `sheet for @${j.sheet}` : j.op, model, j.quality ?? "", j.request.seconds ? `${j.request.seconds}s` : "", j.request.aspect ?? ""].filter(Boolean).join(" · ");
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
              ? `waiting, ${j.position + 1} in fal's queue`
              : "being made";
  return `${j.id} (${what}): ${where}`;
}
