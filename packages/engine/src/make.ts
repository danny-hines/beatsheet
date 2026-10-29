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
  chooseModels,
  FIDELITY,
  fitModel,
  HANDLE,
  shapeOf,
  shotNeeds,
  type Asset,
  type Choices,
  type FitOk,
  type MakeOp,
  type MakeRequest,
  type ServiceState,
  type ShotContent,
} from "@beatsheet/schema";
import { falCancel, FalError, falInput, falOutput, falResult, falStatus, falSubmit, falUpload, takesSeed, type FalRequest } from "./fal.ts";
import { addAsset } from "./ingest.ts";
import { assetPath, projectDir } from "./paths.ts";
import { replaceFile } from "./platform.ts";
import { SERVICES } from "./services.ts";
import { getSecret, readSettings } from "./settings.ts";
import { loadFile, loadProject, updateProject } from "./store.ts";

export type MakeJob = {
  id: string;
  /** Takes asked for together share this. */
  batch: string;
  cut?: string;
  shot?: string;
  op: MakeOp;
  /** The catalog model, and where it runs: the service, its endpoint, and which adapter fills in the inputs. */
  model: string;
  route: string;
  endpoint: string;
  shape: string;
  /** What was asked: pictures by asset id, the length and aspect to make, and the shot's own length. */
  request: { prompt: string; start?: string; end?: string; refs?: string[]; seconds?: number; aspect?: string; seed?: number; shotSeconds?: number };
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

/** Something to make, as the agent's tools and the studio ask for it: a shot to make it for fills in what's missing. */
export type MakeAsk = Partial<Omit<MakeRequest, "op">> & { op: MakeOp; cut?: string; shot?: string; model?: string };

/** The request in full: the shot's length (for video), the cut's shape and the shot's description, unless given. */
export function requestFor(projectId: string, ask: MakeAsk): MakeRequest {
  const { project } = loadProject(projectId, ask.cut);
  const needs = ask.shot ? shotNeeds(project, ask.shot) : undefined;
  if (ask.shot && !project.shots.some((s) => s.id === ask.shot)) throw new Error(`No shot "${ask.shot}" in this cut`);
  const format = project.formats[0]!;
  return {
    op: ask.op,
    prompt: (ask.prompt ?? needs?.prompt ?? "").trim(),
    start: ask.start,
    end: ask.end,
    refs: ask.refs?.length ? ask.refs : undefined,
    seconds: ask.seconds ?? (ask.op === "video" ? needs?.seconds : undefined),
    aspect: ask.aspect ?? aspectOf(format.width, format.height),
    count: ask.count,
  };
}

/** The models for a request, sorted for a picker, with Auto first among the ready ones. */
export function makeChoices(projectId: string, ask: MakeAsk): { req: MakeRequest; choices: Choices } {
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

/**
 * Starts the takes a request asks for: checks it, picks the model (the one asked for, else Auto), saves a job for each
 * take and sets them going. Returns at once; the takes land in the project as they finish. With `spendable`, a
 * request estimated to cost more than that is refused before anything is sent.
 */
export function startMake(projectId: string, ask: MakeAsk, opts: { spendable?: number } = {}): { fit: FitOk; jobs: MakeJob[] } {
  const { req, choices } = makeChoices(projectId, ask);
  if (!req.prompt) throw new Error("Say what to make: a prompt, or a shot whose description says it");
  const { project } = loadProject(projectId, ask.cut);
  for (const id of [req.start, req.end, ...(req.refs ?? [])].filter((x): x is string => !!x)) {
    const a = project.assets.find((x) => x.id === id);
    if (!a) throw new Error(`No asset "${id}"`);
    if (a.kind !== "image") throw new Error(`"${id}" is a ${a.kind}; start frames, end frames and references are pictures`);
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
    if (!f.ok) throw new Error(`${model.label} can't make this: ${f.why.reason}`);
    fit = f;
  } else {
    fit = choices.auto;
    if (!fit) {
      const why = [...choices.setup, ...choices.unfit].map((f) => (f.ok ? "" : `${f.label}: ${f.why.reason}`)).filter(Boolean);
      throw new Error(why.length ? `Nothing can make this now. ${why.join(". ")}.` : `No model makes ${req.op === "image" ? "images" : "video"}`);
    }
  }
  if (opts.spendable !== undefined && fit.usd !== undefined && fit.usd > opts.spendable + 1e-9)
    throw new Error(
      `This is about $${fit.usd.toFixed(2)}, and only $${Math.max(0, opts.spendable).toFixed(2)} more can be spent this turn without asking (the person allows $${turnBudget().toFixed(2)} a turn). Ask first: a choose hand-off that says what it would cost.`,
    );
  const route = CATALOG.find((m) => m.id === fit.model)!.routes.find((r) => r.via === fit.route && r.endpoints[shapeOf(req)] === fit.endpoint)!;
  const count = Math.max(1, req.count ?? 1);
  const batch = newId("b");
  const now = new Date().toISOString();
  const jobs = Array.from({ length: count }, () =>
    saveJob(projectId, {
      id: newId("j"),
      batch,
      cut: project.cut.id,
      shot: ask.shot,
      op: req.op,
      model: fit.model,
      route: fit.route,
      endpoint: fit.endpoint,
      shape: route.shape,
      request: {
        prompt: req.prompt,
        start: req.start,
        end: req.end,
        refs: req.refs,
        seconds: fit.seconds,
        aspect: fit.aspect,
        seed: takesSeed(route.shape) ? randomInt(2 ** 31) : undefined,
        shotSeconds: req.seconds,
      },
      usd: fit.usd === undefined ? undefined : Math.round((fit.usd / count) * 1000) / 1000,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    }),
  );
  void driveJobs(projectId);
  return { fit, jobs };
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
      prompt: r.prompt,
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
    id: `${job.shot ?? job.op}-take`,
    label: r.prompt.length > 60 ? `${r.prompt.slice(0, 57).trimEnd()}…` : r.prompt,
    tags: ["take"],
    provenance: {
      source: "generated",
      provider: job.route,
      model: job.endpoint,
      prompt: r.prompt,
      seed: out.seed ?? r.seed,
      ...(r.start || r.end || r.refs?.length ? { refs: [r.start, r.end, ...(r.refs ?? [])].filter((x): x is string => !!x) } : {}),
      costUsd: job.usd,
      createdAt: new Date().toISOString(),
      op: job.op,
      params: { model: job.model, ...(r.seconds !== undefined ? { seconds: r.seconds } : {}), ...(r.aspect ? { aspect: r.aspect } : {}) },
      job: job.id,
    },
  });
}

type Generated = Extract<ShotContent, { kind: "generated" }>;

/**
 * Makes the take one of its shot's takes. The first take is the one the shot shows, and so is the first video over a
 * board (a still), trimmed to the middle of the little extra it was made with. The shot's fidelity moves up to match.
 */
function attach(projectId: string, job: MakeJob, asset: Asset) {
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
      if (!showing || (asset.kind === "video" && showing.kind === "image")) {
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
      const level = asset.kind === "video" ? "rough" : "board";
      if (FIDELITY.indexOf(s.fidelity) < FIDELITY.indexOf(level)) s.fidelity = level;
    },
    job.cut,
  );
}

// ---- Saying where things are.

/** One line about a job, for the agent's tools. */
export function describeJob(j: MakeJob): string {
  const model = CATALOG.find((m) => m.id === j.model)?.label ?? j.model;
  const what = [j.shot ? `shot ${j.shot}` : j.op, model, j.request.seconds ? `${j.request.seconds}s` : "", j.request.aspect ?? ""].filter(Boolean).join(" · ");
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
