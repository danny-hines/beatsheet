/**
 * HTTP for the studio and for rendering: the project API and media files (with byte ranges, which video seeking
 * needs). The studio mounts this inside Vite; renders and the MCP server start it standalone.
 */
import { execFile } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { SFX_SOUNDS, slugify, type Brief, type CutSpec, type FixerJob, type Rect, type RestoreSteps } from "@beatsheet/schema";
import { cancelToolInstall, installTool, removeTool, toolStatus, type ToolId } from "./fixtools.ts";

const TOOLS: ToolId[] = ["deepfilter", "realesrgan", "rife"];
import { agentStudio, AGENT_IDS, AGENT_LABELS, type AgentId } from "./agent/index.ts";
import { listAgents, RUNTIME } from "./agents.ts";
import { PLANS, planStates } from "./plans.ts";
import { readTranscript, transcribeAsset, transcribeChoices, transcriberStates, transcriptLines } from "./transcribe.ts";
import { cancelWhisperInstall, installWhisper, installWhisperSpeakers, MODELS, removeWhisper, whisperStatus, type ModelSize } from "./whispercpp.ts";
import { addServiceKey, capabilities, findSavedKeys, listServices, recheckService, removeServiceKey } from "./services.ts";
import { readSettings, updateSettings } from "./settings.ts";
import { answerMessage, currentTurn, keepProposals, skipAsk, takeNotes, undoAgentTurn, type Answer } from "./turns.ts";
import { streamEvents } from "./events.ts";
import { cancelSamInstall, installSam, removeSam, samStatus } from "./sam.ts";
import { setSamToken } from "./sam-cuda.ts";
import { cancelKokoroInstall, installKokoro, kokoroStatus, removeKokoro } from "./kokoro.ts";
import { narrate } from "./narrate.ts";
import { castFromSubject } from "./castfrom.ts";
import { stillFromClip } from "./frames.ts";
import { describeCast } from "./describe.ts";
import { cancelJobs, driveJobs, estimate, listJobs, makeChoices, renameInJobs, retryJobs, spentSince, startMake, startMakeAll, turnBudget, type MakeAsk } from "./make.ts";
import { codeRoot, compileScene, sceneFile } from "./scenes.ts";
import { SFX_DIR } from "./sounds.ts";
import { addRecording, incomingPath, type RecordingKind } from "./record.ts";
import { cloneVoice, designVoice, listVoices, previewFile, removeVoice, saveDesignedVoice, saveSample, setVoiceSettings } from "./voices.ts";
import { cutOut, findSubjects, joinSubjects, trackSubject, visionStatus, type CutOutOptions } from "./subjects.ts";
import { addFootage, addSong, ensureCached, importFolder, scanFolder } from "./ingest.ts";
import { assetPath, cachePaths, isProjectId, mediaPath, NoProjectError, projectDir, sourceRoot } from "./paths.ts";
import { IS_WINDOWS, pickerCommand, revealCommand, run as runLaunch } from "./platform.ts";
import { ConflictError, InvalidProjectError, listProjects, loadFile, loadProject, readRaw, saveFile, trashPlan, trashProject } from "./store.ts";

const run = promisify(execFile);

type Next = (err?: unknown) => void;

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".aiff": "audio/aiff", ".flac": "audio/flac",
  ".svg": "image/svg+xml", ".json": "application/json", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".stl": "model/stl", ".obj": "text/plain",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
};

/** Appends to .beatsheet/studio.log, keeping the newest half when it passes half a megabyte. */
function appendStudioLog(entry: string) {
  const file = join(RUNTIME, "studio.log");
  mkdirSync(RUNTIME, { recursive: true });
  const old = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeFileSync(file, (old.length > 512 * 1024 ? old.slice(-256 * 1024) : old) + entry + "\n");
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

/** A request's body as bytes (a recording of the person's voice for cloning, say), up to `limit`. */
const readBytes = (req: IncomingMessage, limit = 100 * 2 ** 20) =>
  new Promise<Buffer>((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        fail(new Error("That's too big to send"));
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });

const readBody = (req: IncomingMessage) =>
  new Promise<string>((ok, fail) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => ok(data));
    req.on("error", fail);
  });

/** Streams a file, honouring Range requests. */
export function sendFile(req: IncomingMessage, res: ServerResponse, file: string) {
  if (!existsSync(file)) return json(res, 404, { error: "not found" });
  const size = statSync(file).size;
  res.setHeader("content-type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
  res.setHeader("accept-ranges", "bytes");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("access-control-allow-origin", "*");
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size) {
      res.statusCode = 416;
      res.setHeader("content-range", `bytes */${size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("content-range", `bytes ${start}-${end}/${size}`);
    res.setHeader("content-length", end - start + 1);
    if (req.method === "HEAD") return res.end();
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader("content-length", size);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

export type Job = {
  id: string;
  kind: "render" | "import" | "install" | "subjects" | "record" | "narrate" | "transcribe" | "clean" | "restore";
  project: string;
  format?: string;
  status: "running" | "done" | "error";
  progress: number;
  log: string[];
  output?: string;
  error?: string;
};
const JOB_WORDS: Record<Job["kind"], string> = {
  render: "exporting",
  import: "bringing in footage",
  install: "installing",
  subjects: "finding people",
  record: "saving a recording",
  narrate: "voicing the narration",
  transcribe: "transcribing",
  clean: "cleaning the sound",
  restore: "restoring",
};
/** Kept for older imports. */
export type RenderJob = Job;
const jobs = new Map<string, Job>();

function startJob(kind: Job["kind"], project: string, work: (job: Job) => Promise<string | void>, extra: Partial<Job> = {}): Job {
  const job: Job = { id: `${kind[0]}${Date.now().toString(36)}`, kind, project, status: "running", progress: 0, log: [], ...extra };
  jobs.set(job.id, job);
  work(job)
    .then((out) => Object.assign(job, { status: "done", progress: 1, output: out ?? undefined }))
    .catch((err) => Object.assign(job, { status: "error", error: said(err) }));
  return job;
}

/** An error as a person should read it; a missing tool says how to get it. */
function said(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const tool = /spawn (ffmpeg|ffprobe|uv)\b.*ENOENT/.exec(msg)?.[1];
  if (IS_WINDOWS && (tool === "ffmpeg" || tool === "ffprobe")) return "beatsheet needs ffmpeg to read and convert video, and it isn't on this PC. Install it (winget install Gyan.FFmpeg in a terminal), then restart beatsheet.";
  if (IS_WINDOWS && tool === "uv") return "beatsheet needs uv (a Python tool) to analyse songs. Install it (winget install astral-sh.uv in a terminal), then try again.";
  if (tool === "ffmpeg" || tool === "ffprobe") return "beatsheet needs ffmpeg to read and convert video, and it isn't on this Mac. Install it with Homebrew (brew install ffmpeg), then try again.";
  if (tool === "uv") return "beatsheet needs uv (a Python tool) to analyse songs. Install it (brew install uv), then try again.";
  return msg;
}

export type NewProjectRequest = {
  title: string;
  id?: string;
  folder?: string;
  song?: string;
  formats?: string[];
  brief?: Partial<Brief>;
  spec?: Partial<CutSpec>;
  firstCut?: boolean;
};

/** A free project id based on the title: trip, trip-2, trip-3… */
export function freeId(title: string): string {
  const base = slugify(title);
  const taken = new Set(listProjects().map((p) => p.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** macOS (or Windows) file and folder pickers, so the studio gets real paths. */
async function pick(kind: "folder" | "audio" | "file"): Promise<string | null> {
  if (IS_WINDOWS) {
    const r = await runLaunch(pickerCommand(kind), { timeout: 10 * 60_000 }).catch(() => undefined);
    return r?.out.trim() || null;
  }
  const choose =
    kind === "folder"
      ? 'POSIX path of (choose folder with prompt "Choose a folder")'
      : kind === "file"
        ? 'POSIX path of (choose file with prompt "Choose a file")'
        : 'POSIX path of (choose file with prompt "Choose a song or recording" of type {"public.audio"})';
  try {
    const { stdout } = await run("osascript", ["-e", "activate", "-e", choose], { timeout: 10 * 60_000 });
    return stdout.trim().replace(/\/$/, "") || null;
  } catch {
    return null; // cancelled
  }
}

/** Shows a file in Finder (on Windows, File Explorer), selected. */
async function reveal(path: string) {
  const l = revealCommand(path);
  // File Explorer answers 1 even when it worked, so only a failure to start counts.
  if (IS_WINDOWS) await runLaunch(l);
  else await run(l.command, l.args);
}

/** Connect-style handler for /api/* and /media/*; anything else goes to `next`. */
/**
 * Requests from this machine's studio only. The host must be the loopback name the server was opened on (which stops
 * a web page from reaching it through a DNS trick), and anything that changes something must carry the studio's
 * header, which a page on another site can't add without the server's permission (never given).
 */
function trusted(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return false;
  return req.method === "GET" || req.method === "HEAD" || req.headers["x-beatsheet"] === "1";
}

export function beatsheetHandler() {
  return async (req: IncomingMessage, res: ServerResponse, next?: Next) => {
    const url = new URL(req.url ?? "/", "http://local");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    try {
      if ((parts[0] === "api" || parts[0] === "media") && !trusted(req)) return json(res, 403, { error: "Not from the studio" });
      if (parts[0] === "api" && parts[1] === "events" && req.method === "GET") return streamEvents(req, res);
      if (parts[0] === "api") return await api(req, res, parts.slice(1));
      if (parts[0] === "media") return await media(req, res, parts.slice(1));
      if (next) return next();
      json(res, 404, { error: "not found" });
    } catch (err) {
      if (err instanceof ConflictError) return json(res, 409, { error: err.message, version: err.current });
      if (err instanceof InvalidProjectError) return json(res, 400, { error: err.message, issues: err.issues });
      if (err instanceof NoProjectError) return json(res, 404, { error: err.message });
      json(res, 500, { error: said(err) });
    }
  };
}

async function api(req: IncomingMessage, res: ServerResponse, parts: string[]) {
  const [section, id, action] = parts;
  if (section === "projects" && !id && req.method === "GET") return json(res, 200, listProjects());
  if (section === "projects" && !id && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as NewProjectRequest;
    if (!body.title?.trim()) return json(res, 400, { error: "A title is required" });
    const projectId = body.id?.trim() || freeId(body.title);
    if (!isProjectId(projectId)) return json(res, 400, { error: `"${projectId}" can't be a project id: use letters, numbers and dashes` });
    if (listProjects().some((p) => p.id === projectId)) return json(res, 409, { error: `There's already a project called ${projectId}` });
    const job = startJob("import", projectId, async (j) => {
      await importFolder({
        id: projectId,
        title: body.title.trim(),
        folder: body.folder?.trim() || undefined,
        song: body.song?.trim() || undefined,
        formats: body.formats,
        brief: body.brief,
        spec: body.spec,
        firstCut: body.firstCut,
        log: (m) => j.log.push(m),
        onProgress: (f) => (j.progress = f),
      });
    });
    return json(res, 202, job);
  }
  if (section === "pick" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { kind?: "folder" | "audio" | "file" };
    return json(res, 200, { path: await pick(body.kind === "audio" || body.kind === "file" ? body.kind : "folder") });
  }
  // Shows a project's file in Finder: the footage stays where it is, so this is how you get back to it. Without an
  // asset, the project's own folder.
  if (section === "reveal" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { project?: string; asset?: string };
    if (!body.project || !isProjectId(body.project)) return json(res, 400, { error: "Which project?" });
    if (!body.asset) {
      await reveal(projectDir(body.project));
      return json(res, 200, { ok: true });
    }
    const { project, dir } = loadProject(body.project);
    const a = project.assets.find((x) => x.id === body.asset);
    if (!a) return json(res, 404, { error: `no asset ${body.asset}` });
    const path = assetPath(project, dir, a);
    if (!existsSync(path)) return json(res, 404, { error: `${path} isn't there any more` });
    await reveal(path);
    return json(res, 200, { ok: true });
  }
  if (section === "scan" && req.method === "GET") {
    const path = new URL(req.url ?? "", "http://local").searchParams.get("path") ?? "";
    try {
      const { videos, photos } = scanFolder(path);
      return json(res, 200, { ok: true, videos, photos });
    } catch {
      return json(res, 200, { ok: false, videos: 0, photos: 0 });
    }
  }
  if (section === "agents" && !id && req.method === "GET") return json(res, 200, listAgents());
  if (section === "turn" && id === "undo" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { project?: string };
    if (!body.project || !isProjectId(body.project)) return json(res, 400, { error: "Which project?" });
    const r = undoAgentTurn(body.project);
    return json(res, r.restored ? 200 : 409, r.restored ? { ok: true } : { error: r.reason });
  }
  if (section === "turn" && id === "skip" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { project?: string };
    if (!body.project || !isProjectId(body.project)) return json(res, 400, { error: "Which project?" });
    skipAsk(body.project);
    return json(res, 200, { ok: true });
  }
  // The person's answer to the agent's hand-off becomes the agent's next message, with the notes they attached. Each
  // cut has its own conversation: with none open on this cut, their default agent starts one and gets the answer with
  // its opening (unless the agent is busy elsewhere, which a new conversation would cut off). "ask" is a request the
  // studio words for the person (Find the cast in my photos), delivered the same way.
  if (section === "turn" && (id === "answer" || id === "ask") && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as Omit<Answer, "notes"> & { project?: string; cut?: string; notes?: boolean };
    if (!body.project || !isProjectId(body.project)) return json(res, 400, { error: "Which project?" });
    const agent = agentStudio();
    const open = agent.openOn(body.project, body.cut);
    if (!open && agent.busyElsewhere(body.project, body.cut)) {
      const v = agent.view;
      const where = v.project === body.project ? `the cut "${v.cut ? (loadFile(body.project).doc.cuts.find((c) => c.id === v.cut)?.name ?? v.cut) : "another cut"}"` : "another project";
      return json(res, 423, { error: `${AGENT_LABELS[v.agent ?? "claude"]} is still working on ${where}. Wait for it to hand back, or stop it, then send this again.` });
    }
    const preferred = readSettings().agent;
    if (!open && !preferred) return json(res, 409, { error: "No agent is set up yet. Pick one in Settings." });
    // Only once it's sure to be delivered: the notes it takes, and the cast members kept, would otherwise go twice.
    if (id === "ask" && !body.text?.trim()) return json(res, 400, { error: "Ask what?" });
    const notes = body.notes ? takeNotes(body.project, body.cut).line : undefined;
    const message =
      id === "ask"
        ? `On project ${body.project}${body.cut ? `, cut ${body.cut}` : ""}: ${body.text!.trim()}`
        : answerMessage(body.project, currentTurn(body.project), { ...body, notes }, keepProposals(body.project, { keep: body.keep }));
    if (open) {
      await agent.send(message);
      return json(res, 200, { delivered: "session" });
    }
    void agent.start(preferred!.id, { model: preferred!.model, project: body.project, cut: body.cut, then: message });
    return json(res, 200, { delivered: "started", agent: preferred!.id });
  }
  // What went wrong in the studio page, kept where it can be read later (the Mac app has no console to open).
  if (section === "log" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { where?: string; message?: string; stack?: string; url?: string };
    appendStudioLog(`${new Date().toISOString()} ${body.where ?? "?"} ${body.url ?? ""}\n${body.message ?? ""}\n${body.stack ?? ""}\n`);
    return json(res, 200, { ok: true });
  }
  if (section === "settings") {
    const body = req.method === "POST" ? (JSON.parse((await readBody(req)) || "{}") as { id?: string; model?: string; key?: string; level?: string; on?: boolean }) : {};
    if (!id && req.method === "GET") {
      await findSavedKeys();
      return json(res, 200, { settings: readSettings(), services: listServices(), capabilities: capabilities(), vision: await visionStatus(), sam: samStatus() });
    }
    // SAM 3 on this Mac: installed in the background; the page follows along by asking for the status.
    if (id === "sam" && req.method === "GET") return json(res, 200, samStatus());
    if (id === "sam" && action === "install" && req.method === "POST") return json(res, 202, installSam());
    // Windows: the Hugging Face token Meta's SAM 3.1 downloads with, checked before it's kept.
    if (id === "sam" && action === "token" && req.method === "POST") {
      if (!IS_WINDOWS) return json(res, 400, { error: "This Mac's SAM 3 doesn't need a token" });
      try {
        return json(res, 200, await setSamToken(body.key ?? ""));
      } catch (err) {
        return json(res, 400, { error: said(err) });
      }
    }
    if (id === "sam" && action === "cancel" && req.method === "POST") {
      cancelSamInstall();
      return json(res, 200, samStatus());
    }
    if (id === "sam" && !action && req.method === "DELETE") {
      await removeSam();
      return json(res, 200, samStatus());
    }
    // Kokoro on this Mac, installed and removed like SAM 3.
    // Transcribing: Whisper on this computer (its install, sized for this machine), the order Auto tries transcribers
    // in, and the size of Whisper's model.
    if (id === "transcribe" && req.method === "GET") {
      const t = readSettings().transcribe ?? {};
      return json(res, 200, { whisper: await whisperStatus(), states: await transcriberStates(), ranking: t.ranking ?? [], whisperModel: t.whisperModel });
    }
    if (id === "transcribe" && req.method === "POST") {
      const change = body as unknown as { ranking?: string[]; whisperModel?: ModelSize | null };
      updateSettings((s) => {
        const t = (s.transcribe ??= {});
        if (change.ranking) t.ranking = change.ranking;
        if (change.whisperModel === null) delete t.whisperModel;
        else if (change.whisperModel && change.whisperModel in MODELS) t.whisperModel = change.whisperModel;
      });
      const t = readSettings().transcribe ?? {};
      return json(res, 200, { whisper: await whisperStatus(), states: await transcriberStates(), ranking: t.ranking ?? [], whisperModel: t.whisperModel });
    }
    if (id === "whisper" && action === "install" && req.method === "POST") return json(res, 202, await installWhisper((body as { model?: ModelSize }).model));
    if (id === "whisper" && action === "speakers" && req.method === "POST") return json(res, 202, await installWhisperSpeakers());
    if (id === "whisper" && action === "cancel" && req.method === "POST") {
      cancelWhisperInstall();
      return json(res, 200, await whisperStatus());
    }
    if (id === "whisper" && !action && req.method === "DELETE") {
      removeWhisper();
      return json(res, 200, await whisperStatus());
    }
    // Restoring: the programs that clean sound and restore picture here, and the order Auto tries fixers in for each job.
    if (id === "restore" && (req.method === "GET" || req.method === "POST")) {
      if (req.method === "POST") {
        const change = body as unknown as { ranking?: Partial<Record<FixerJob, string[]>> };
        updateSettings((s) => {
          const r = (s.restore ??= {});
          if (change.ranking) r.ranking = { ...r.ranking, ...change.ranking };
        });
      }
      const { fixerStates } = await import("./clean.ts");
      return json(res, 200, { tools: Object.fromEntries(TOOLS.map((t) => [t, toolStatus(t)])), states: await fixerStates(), ranking: readSettings().restore?.ranking ?? {} });
    }
    if (id === "fix" && action && (TOOLS as string[]).includes(action)) {
      const tool = action as ToolId;
      if (parts[3] === "install" && req.method === "POST") return json(res, 202, installTool(tool));
      if (parts[3] === "cancel" && req.method === "POST") {
        cancelToolInstall(tool);
        return json(res, 200, toolStatus(tool));
      }
      if (!parts[3] && req.method === "DELETE") {
        removeTool(tool);
        return json(res, 200, toolStatus(tool));
      }
      if (!parts[3] && req.method === "GET") return json(res, 200, toolStatus(tool));
    }
    if (id === "kokoro" && req.method === "GET") return json(res, 200, kokoroStatus());
    if (id === "kokoro" && action === "install" && req.method === "POST") return json(res, 202, installKokoro());
    if (id === "kokoro" && action === "cancel" && req.method === "POST") {
      cancelKokoroInstall();
      return json(res, 200, kokoroStatus());
    }
    if (id === "kokoro" && !action && req.method === "DELETE") {
      await removeKokoro();
      return json(res, 200, kokoroStatus());
    }
    if (id === "agent" && req.method === "POST") {
      if (!AGENT_IDS.includes(body.id as AgentId)) return json(res, 400, { error: "Which agent?" });
      return json(res, 200, updateSettings((s) => void (s.agent = { id: body.id as AgentId, model: body.model })));
    }
    if (id === "done" && req.method === "POST") return json(res, 200, updateSettings((s) => void (s.setupDone = true)));
    // How much the agent does without asking. It applies to the session that's open now, mid-turn included.
    if (id === "autonomy" && req.method === "POST") {
      const level = body.level === "free" ? "free" : "ask";
      const saved = updateSettings((s) => void (s.autonomy = level));
      await agentStudio().autonomyChanged(level);
      return json(res, 200, saved);
    }
    // Claude Code in the person's own Chrome, for pages they're signed in to.
    if (id === "chrome" && req.method === "POST") {
      const saved = updateSettings((s) => void (s.chrome = !!body.on));
      await agentStudio().chromeChanged();
      return json(res, 200, saved);
    }
    // Making: the spending limit (and what's been spent under it), what the agent may spend in a turn, the order
    // Auto tries models in, and the plans that make stills without a key.
    const plans = () => {
      const states = planStates();
      return PLANS.map((p) => ({ id: p.id, ...states[p.id]! }));
    };
    if (id === "make" && req.method === "GET") {
      const make = readSettings().make ?? {};
      return json(res, 200, { ...make, turnBudgetUsd: turnBudget(), spent: make.limit ? spentSince(make.limit.since) : undefined, plans: plans() });
    }
    if (id === "make" && req.method === "POST") {
      const change = body as unknown as { limit?: { usd: number; since?: string } | null; turnBudgetUsd?: number; ranking?: Record<string, string[]> };
      const saved = updateSettings((s) => {
        const make = (s.make ??= {});
        if (change.limit === null) delete make.limit;
        else if (change.limit && change.limit.usd > 0) make.limit = { usd: change.limit.usd, since: change.limit.since ?? make.limit?.since ?? new Date().toISOString() };
        if (change.turnBudgetUsd !== undefined && change.turnBudgetUsd >= 0) make.turnBudgetUsd = change.turnBudgetUsd;
        if (change.ranking) make.ranking = { ...(make.ranking ?? {}), ...change.ranking };
      });
      const make = saved.make ?? {};
      return json(res, 200, { ...make, turnBudgetUsd: turnBudget(), spent: make.limit ? spentSince(make.limit.since) : undefined, plans: plans() });
    }
    if (id === "service" && action && req.method === "POST") return json(res, 200, body.key ? await addServiceKey(action, body.key) : await recheckService(action));
    if (id === "service" && action && req.method === "DELETE") {
      await removeServiceKey(action);
      return json(res, 200, { ok: true });
    }
  }
  if (section === "agent") {
    const agent = agentStudio();
    if (!id && req.method === "GET") return json(res, 200, agent.view);
    if (id === "list" && req.method === "GET") return json(res, 200, await agent.agents(new URL(req.url ?? "", "http://local").searchParams.has("quick")));
    if (id === "sessions" && req.method === "GET") {
      const params = new URL(req.url ?? "", "http://local").searchParams;
      const which = params.get("agent") as AgentId;
      if (!AGENT_IDS.includes(which)) return json(res, 400, { error: "Which agent?" });
      return json(res, 200, await agent.sessions(which, params.get("project") ?? undefined, params.get("cut") ?? undefined));
    }
    if (req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { agent?: AgentId; model?: string; project?: string; cut?: string; session?: string; text?: string; approvalId?: string; choiceId?: string; then?: string };
      if (["start", "resume", "check", "install", "signin"].includes(id ?? "") && !AGENT_IDS.includes(body.agent!)) return json(res, 400, { error: "Which agent?" });
      // Installing runs the CLI's official installer; the page follows the job's log, then checks the agent.
      if (id === "install") {
        const which = body.agent!;
        return json(
          res,
          202,
          startJob("install", "", async (j) => {
            await agent.install(which, (line) => j.log.push(line));
            const check = await agent.check(which);
            updateSettings((s) => void (s.checks[which] = { ...check, at: new Date().toISOString() }));
          }),
        );
      }
      // Reopens a project's conversation; with `then`, carries on an interrupted turn or hands it back to the person.
      if (id === "pickup") {
        if (!body.project || !isProjectId(body.project)) return json(res, 400, { error: "Which project?" });
        return json(res, 200, await agent.pickup(body.project, body.cut, body.then === "continue" || body.then === "takeback" ? body.then : undefined));
      }
      if (id === "signin") {
        await agent.signIn(body.agent!);
        return json(res, 200, { ok: true });
      }
      if (id === "check") {
        const check = await agent.check(body.agent!);
        updateSettings((s) => void (s.checks[body.agent!] = { ...check, at: new Date().toISOString() }));
        return json(res, 200, check);
      }
      if (body.model && !/^[\w.:/-]+$/.test(body.model)) return json(res, 400, { error: `Unknown model "${body.model}"` });
      // Starting takes a while (the CLI boots, then the first message); the page follows along through change events.
      if (id === "start") void agent.start(body.agent!, { model: body.model, project: body.project, cut: body.cut });
      else if (id === "resume" && body.session) void agent.resume(body.agent!, body.session, body.project, body.cut);
      else if (id === "send" && body.text?.trim()) await agent.send(body.text.trim());
      else if (id === "interrupt") await agent.interrupt();
      else if (id === "approval" && body.approvalId && body.choiceId) await agent.decide(body.approvalId, body.choiceId);
      else if (id === "stop") agent.stop();
      else return json(res, 400, { error: "Bad agent request" });
      return json(res, 200, { ok: true });
    }
  }
  if (section === "projects" && id && !action) {
    if (req.method === "GET") {
      // Takes still being made when the engine last stopped are picked up again.
      void driveJobs(id);
      const raw = readRaw(id);
      return json(res, 200, { project: raw.json, version: raw.version });
    }
    if (req.method === "PUT") {
      const body = JSON.parse(await readBody(req)) as { project: unknown; version?: string };
      // The studio sends the whole file: every cut, plus the shared material.
      const saved = saveFile(id, body.project, body.version);
      return json(res, 200, { version: saved.version });
    }
    // To the Trash: the project's own folder only, never its footage (see trashPlan).
    if (req.method === "DELETE") {
      const busy = [...jobs.values()].find((j) => j.project === id && j.status === "running");
      if (busy) return json(res, 409, { error: `It's still ${JOB_WORDS[busy.kind]}. Try again when that's done.` });
      const agent = agentStudio();
      if (agent.view.project === id) agent.stop();
      await trashProject(id);
      return json(res, 200, { ok: true });
    }
  }
  if (section === "projects" && id && action === "trash" && req.method === "GET") return json(res, 200, trashPlan(id));
  // Making takes from the studio: which models could make one (and why the others can't), making them, and the jobs.
  // The person asks here themselves, so there's no turn budget; each button says what it costs.
  if (section === "projects" && id && action === "make" && req.method === "GET") {
    const q = new URL(req.url ?? "", "http://local").searchParams;
    const op = q.get("op") === "video" ? "video" : "image";
    const seconds = Number(q.get("seconds"));
    const quality = q.get("quality");
    try {
      return json(
        res,
        200,
        makeChoices(id, {
          op,
          cut: q.get("cut") ?? undefined,
          shot: q.get("shot") ?? undefined,
          sheet: q.get("sheet") ?? undefined,
          start: q.get("start") ?? undefined,
          prompt: q.get("prompt") ?? undefined,
          aspect: q.get("aspect") ?? undefined,
          count: Number(q.get("count")) || undefined,
          via: q.get("via") ?? undefined,
          ...(quality === "rough" || quality === "final" ? { quality } : {}),
          ...(seconds > 0 ? { seconds } : {}),
        }),
      );
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
  }
  // A pass over many shots: what it would cost with each model, then making it (all or nothing).
  if (section === "projects" && id && action === "make" && parts[3] === "estimate" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asks?: MakeAsk[] };
    if (!body.asks?.length) return json(res, 400, { error: "Estimate what?" });
    return json(res, 200, estimate(id, body.asks));
  }
  if (section === "projects" && id && action === "make" && !parts[3] && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as MakeAsk & { asks?: MakeAsk[] };
    const asks = body.asks ?? [body];
    if (!asks.length || asks.some((a) => a.op !== "image" && a.op !== "video")) return json(res, 400, { error: "Make a still or a video?" });
    try {
      if (!body.asks) return json(res, 200, startMake(id, body));
      const { plans, usd } = startMakeAll(id, asks);
      return json(res, 200, { jobs: plans.flatMap((p) => p.jobs), usd });
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
  }
  if (section === "projects" && id && action === "jobs" && req.method === "GET") {
    void driveJobs(id);
    return json(res, 200, listJobs(id));
  }
  if (section === "projects" && id && action === "jobs" && parts[3] === "cancel" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { ids?: string[] };
    return json(res, 200, await cancelJobs(id, body.ids ?? []));
  }
  // Someone found in a clip or photo becomes a cast member (or joins one), with a still of them cut from it.
  // A cast member (or variant) was renamed in the studio: the jobs still being made follow it.
  if (section === "projects" && id && action === "jobs" && parts[3] === "rename" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { from?: string; to?: string };
    if (!body.from || !body.to) return json(res, 400, { error: "Renamed from what, to what?" });
    return json(res, 200, { moved: renameInJobs(id, body.from, body.to) });
  }
  // What was said in a clip: who could transcribe it here and for how much, then doing it (a job), then reading it.
  if (section === "projects" && id && action === "transcribe" && req.method === "GET") {
    const q = new URL(req.url ?? "", "http://local").searchParams;
    const a = loadProject(id).project.assets.find((x) => x.id === q.get("asset"));
    return json(res, 200, await transcribeChoices(a?.duration, q.get("speakers") === "1"));
  }
  if (section === "projects" && id && action === "transcribe" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; with?: string; speakers?: boolean; people?: number };
    if (!body.asset) return json(res, 400, { error: "Transcribe which clip?" });
    const job = startJob("transcribe", id, async (j) => {
      const r = await transcribeAsset(id, body.asset!, { with: body.with, speakers: body.speakers, people: body.people, onProgress: (f) => (j.progress = f * 0.95) });
      return `${r.transcript.words.length}`;
    });
    return json(res, 202, job);
  }
  // Who a speaker in a transcript is (a cast member, or someone new), then the same voice looked for in the other
  // clips; or just the looking.
  if (section === "projects" && id && action === "speakers" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; speaker?: string; cast?: string; name?: string };
    if (!body.asset || !body.speaker) return json(res, 400, { error: "Which speaker, in which clip?" });
    const { nameSpeaker, findVoices } = await import("./heard.ts");
    const member = nameSpeaker(id, body.asset, body.speaker, { cast: body.cast, name: body.name });
    if (!member) return json(res, 200, { member: null, found: [] });
    const job = startJob("transcribe", id, async () => {
      const r = await findVoices(id, { members: [member] });
      // Their face, wherever their voice is now known.
      const { followPeople } = await import("./heard.ts");
      const more = await followPeople(id, [body.asset!, ...r.found.map((f) => f.asset)]);
      return JSON.stringify({ member, found: [...r.found, ...more.found], joined: more.joined, why: r.why });
    });
    return json(res, 202, job);
  }
  if (section === "projects" && id && action === "transcripts" && parts[3] && req.method === "GET") {
    const t = readTranscript(id, parts[3]);
    if (!t) return json(res, 404, { error: "It hasn't been transcribed" });
    return json(res, 200, { ...t, lines: transcriptLines(t) });
  }
  // Its voices cleaned of hiss and hum: who could do it here and for how much, then doing it (a job), or undoing it.
  if (section === "projects" && id && action === "clean" && req.method === "GET") {
    const q = new URL(req.url ?? "", "http://local").searchParams;
    const a = loadProject(id).project.assets.find((x) => x.id === q.get("asset"));
    const { fixChoices } = await import("./clean.ts");
    return json(res, 200, await fixChoices("clean", { seconds: a?.duration ?? 0 }));
  }
  if (section === "projects" && id && action === "clean" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; with?: string; strength?: "light" | "full"; everywhere?: boolean; again?: boolean };
    if (!body.asset) return json(res, 400, { error: "Clean which clip?" });
    const { cleanSound } = await import("./clean.ts");
    const job = startJob("clean", id, async (j) => {
      const r = await cleanSound(id, body.asset!, { ...body, onProgress: (f) => (j.progress = f * 0.98) });
      return JSON.stringify({ by: r.choice.label, spans: r.spans, reused: r.reused, costUsd: r.costUsd });
    });
    return json(res, 202, job);
  }
  if (section === "projects" && id && action === "clean" && req.method === "DELETE") {
    const q = new URL(req.url ?? "", "http://local").searchParams;
    const { uncleanSound } = await import("./clean.ts");
    uncleanSound(id, q.get("asset") ?? "");
    return json(res, 200, { ok: true });
  }
  // A stretch of a clip restored (less noise, steadier, bigger, smoother): what it'd take, then doing it (a job).
  if (section === "projects" && id && action === "restore" && req.method === "GET") {
    const q = new URL(req.url ?? "", "http://local").searchParams;
    const a = loadProject(id).project.assets.find((x) => x.id === q.get("asset"));
    const { fixChoices } = await import("./clean.ts");
    const { restoredSize } = await import("@beatsheet/schema");
    const seconds = Number(q.get("to") ?? a?.duration ?? 0) - Number(q.get("from") ?? 0);
    const upscale = Number(q.get("upscale") ?? 2);
    const fps = q.get("fps") ? Number(q.get("fps")) : undefined;
    const ask = { seconds, width: a?.width, height: a?.height, fps: restoredSize(a ?? {}, { fps }).fps ?? a?.fps, upscale };
    return json(res, 200, { upscale: await fixChoices("upscale", ask), frames: await fixChoices("frames", { ...ask, fps: a?.fps }) });
  }
  if (section === "projects" && id && action === "restore" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; from?: number; to?: number; steps?: RestoreSteps; upscaleWith?: string; use?: boolean; cut?: string };
    if (!body.asset || !body.steps) return json(res, 400, { error: "Restore which clip, and how?" });
    const { restoreClip, restorePlan } = await import("./restore.ts");
    // Asked about first, so a request that can't run says why at once rather than as a failed job.
    try {
      await restorePlan(id, body.asset, { from: body.from, to: body.to, steps: body.steps, upscaleWith: body.upscaleWith });
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
    const job = startJob("restore", id, async (j) => {
      const r = await restoreClip(id, body.asset!, {
        from: body.from,
        to: body.to,
        steps: body.steps!,
        upscaleWith: body.upscaleWith,
        ...(body.use ? { use: { cut: body.cut } } : {}),
        onProgress: (f, stage) => {
          j.progress = f * 0.99;
          if (stage && j.log.at(-1) !== stage) j.log.push(stage);
        },
      });
      return JSON.stringify({ asset: r.asset.id, shots: r.shots, costUsd: r.costUsd, seconds: r.seconds });
    });
    return json(res, 202, job);
  }
  // Shots of a clip showing one of its versions, or back to the clip.
  if (section === "projects" && id && action === "version" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { version?: string; cut?: string; shots?: string[]; off?: boolean };
    if (!body.version) return json(res, 400, { error: "Which version?" });
    const { useVersion } = await import("./restore.ts");
    try {
      return json(res, 200, { shots: useVersion(id, body.version, { cut: body.cut, shots: body.shots, off: body.off }) });
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
  }
  // A long file (a tape, a DVD) split into its shots, as moments.
  if (section === "projects" && id && action === "split" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; threshold?: number };
    if (!body.asset) return json(res, 400, { error: "Split which clip?" });
    try {
      const { splitAtCuts } = await import("./shotsplit.ts");
      return json(res, 200, { shots: await splitAtCuts(id, body.asset, { threshold: body.threshold }) });
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
  }
  // A still of a clip's last frame (or of a moment in it), to start the next clip from.
  if (section === "projects" && id && action === "frame" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; at?: number };
    if (!body.asset) return json(res, 400, { error: "From which clip?" });
    try {
      return json(res, 200, await stillFromClip(id, body.asset, typeof body.at === "number" ? body.at : undefined));
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
  }
  if (section === "projects" && id && action === "cast" && parts[3] === "from-subject" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; subject?: string; into?: string };
    if (!body.asset || !body.subject) return json(res, 400, { error: "Which asset, and which subject in it?" });
    try {
      return json(res, 200, await castFromSubject(id, { asset: body.asset, subject: body.subject, into: body.into }));
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
  }
  // A cast member's description, written from its pictures by a vision model; the studio puts it in the field to edit.
  if (section === "projects" && id && action === "cast" && parts[3] && parts[4] === "describe" && req.method === "POST") {
    try {
      return json(res, 200, { about: await describeCast(id, parts[3]) });
    } catch (err) {
      return json(res, 400, { error: said(err) });
    }
  }
  if (section === "projects" && id && action === "jobs" && parts[3] === "retry" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { ids?: string[] };
    return json(res, 200, retryJobs(id, body.ids ?? []));
  }
  if (section === "projects" && id && action === "footage" && req.method === "POST") {
    // Folders, single files, or both (what was picked or dropped).
    const body = JSON.parse((await readBody(req)) || "{}") as { folder?: string; paths?: string[] };
    const paths = body.paths?.length ? body.paths : body.folder ? [body.folder] : [];
    if (!paths.length) return json(res, 400, { error: "Which files or folder?" });
    const job = startJob("import", id, async (j) => {
      const r = await addFootage(id, paths, (m) => j.log.push(m), (f) => (j.progress = f));
      return `${r.added}`;
    });
    return json(res, 202, job);
  }
  if (section === "projects" && id && action === "subjects" && parts[3] === "join" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; keep?: string; others?: string[] };
    if (!body.asset || !body.keep || !body.others?.length) return json(res, 400, { error: "Which subjects?" });
    const t = joinSubjects(id, body.asset, body.keep, body.others);
    return json(res, 200, { id: t.id, label: t.label });
  }
  // Subjects and cut-outs (Apple Vision on this Mac): find faces and people, follow a boxed thing, lift a subject out.
  if (section === "projects" && id && (action === "subjects" || action === "track" || action === "cutout") && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { asset?: string; at?: number; box?: Rect; label?: string } & CutOutOptions;
    if (!body.asset) return json(res, 400, { error: "Which asset?" });
    const asset = body.asset;
    if (action === "track" && (body.at === undefined || !body.box)) return json(res, 400, { error: "Box something first" });
    const job = startJob("subjects", id, async (j) => {
      const progress = (f: number) => (j.progress = f);
      if (action === "subjects") {
        const found = await findSubjects(id, asset, progress);
        return `${found.length}`;
      }
      if (action === "track") {
        const t = await trackSubject(id, asset, { at: body.at!, box: body.box!, label: body.label?.trim() || "Subject" }, progress);
        return t.id;
      }
      const made = await cutOut(id, asset, body, progress);
      return made.map((a) => a.id).join(",");
    });
    return json(res, 202, job);
  }
  // Narration voices: what's on hand, a sample of each, the default, and making new ones with ElevenLabs.
  if (section === "voices") {
    if (!id && req.method === "GET") return json(res, 200, await listVoices());
    if (id === "preview" && req.method === "GET") {
      const voice = new URL(req.url ?? "", "http://local").searchParams.get("voice");
      if (!voice) return json(res, 400, { error: "Which voice?" });
      return sendFile(req, res, await previewFile(voice));
    }
    if (id === "settings" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { default?: string | null; model?: string };
      setVoiceSettings(body);
      return json(res, 200, { ok: true });
    }
    if (id === "design" && !action && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { description?: string; text?: string };
      if (!body.description?.trim()) return json(res, 400, { error: "Describe the voice first" });
      return json(res, 200, await designVoice(body.description, body.text));
    }
    if (id === "design" && action === "save" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { generatedId?: string; name?: string; description?: string };
      if (!body.generatedId || !body.name?.trim()) return json(res, 400, { error: "Name the voice first" });
      return json(res, 200, await saveDesignedVoice(body.generatedId, body.name, body.description ?? body.name));
    }
    // A recording of the person reading, sent as it is; it waits for the clone and goes once that's made.
    if (id === "samples" && req.method === "POST") return json(res, 200, saveSample(await readBytes(req), String(req.headers["content-type"] ?? "audio/webm")));
    if (id === "clone" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { name?: string; samples?: string[]; files?: string[]; description?: string; removeNoise?: boolean; consent?: boolean };
      if (!body.consent) return json(res, 400, { error: "Only clone your own voice, or one you have permission to use" });
      if (!body.name?.trim()) return json(res, 400, { error: "Name the voice first" });
      return json(res, 200, await cloneVoice(body.name, body));
    }
    if (id && req.method === "DELETE") {
      await removeVoice(id);
      return json(res, 200, { ok: true });
    }
  }
  // A recording from the studio: the bytes stream straight to disk (a screen recording can be big), then it's tidied
  // into an MP4 or M4A and added to the media in the background.
  if (section === "projects" && id && action === "recordings" && req.method === "POST") {
    const params = new URL(req.url ?? "", "http://local").searchParams;
    const kind = params.get("kind") as RecordingKind;
    if (!["screen", "camera", "voice"].includes(kind)) return json(res, 400, { error: "What kind of recording?" });
    const type = String(req.headers["content-type"] ?? "");
    const upload = incomingPath(id, type);
    await new Promise<void>((ok, fail) => {
      const out = createWriteStream(upload);
      req.pipe(out);
      out.on("finish", ok);
      out.on("error", fail);
      req.on("error", fail);
    });
    const at = Number(params.get("at")) || Date.now();
    const job = startJob("record", id, async () => (await addRecording(id, upload, { kind, label: params.get("label") ?? undefined, at: new Date(at) })).id);
    return json(res, 202, job);
  }
  // Voices a cut's lines (all that need it, or the ones named) in its voice, or in a new one.
  if (section === "projects" && id && action === "narrate" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { cut?: string; voice?: string; lines?: string[]; force?: boolean };
    const job = startJob("narrate", id, async (j) => {
      const r = await narrate(id, { cut: body.cut, voice: body.voice, only: body.lines, force: body.force, onProgress: (f, line) => ((j.progress = f), line && j.log.push(line)) });
      return `${r.voiced.length}`;
    });
    return json(res, 202, job);
  }
  if (section === "projects" && id && action === "song" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { file?: string; cut?: string };
    if (!body.file) return json(res, 400, { error: "Which song?" });
    const a = await addSong(id, body.file, () => {}, body.cut);
    return json(res, 200, { asset: a.id, label: a.label, bpm: a.grid?.bpm });
  }
  if (section === "projects" && id && action === "render" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { cut?: string; format?: string; quality?: "proxy" | "original"; saveAs?: string };
    // Where the person chose in the save dialog: an .mp4 in a folder that exists.
    if (body.saveAs !== undefined && (!isAbsolute(body.saveAs) || !/\.mp4$/i.test(body.saveAs) || !existsSync(dirname(body.saveAs))))
      return json(res, 400, { error: "Save the video as an .mp4 in a folder that exists" });
    const job = startJob(
      "render",
      id,
      async (j) => {
        const { renderProject } = await import("./render.ts");
        return renderProject(id, { cut: body.cut, format: body.format, quality: body.quality, saveAs: body.saveAs, onProgress: (p) => (j.progress = p) });
      },
      { format: body.format },
    );
    return json(res, 202, job);
  }
  if (section === "jobs" && id && req.method === "GET") {
    const job = jobs.get(id);
    return job ? json(res, 200, job) : json(res, 404, { error: "no such job" });
  }
  json(res, 404, { error: "not found" });
}

/** One preview job per file at a time, however many requests ask for it. */
const caching = new Map<string, Promise<void>>();
function cacheOnce(key: string, job: () => Promise<void>): Promise<void> {
  let p = caching.get(key);
  if (!p) {
    p = job()
      .catch(() => {})
      .finally(() => caching.delete(key));
    caching.set(key, p);
  }
  return p;
}

async function media(req: IncomingMessage, res: ServerResponse, parts: string[]) {
  const [id, what, ...rest] = parts;
  const { project, dir } = loadProject(id!);
  if (what === "asset") {
    const [assetId, kind] = rest;
    const a = project.assets.find((x) => x.id === assetId);
    if (!a) return json(res, 404, { error: `no asset ${assetId}` });
    const c = cachePaths(dir, a.id);
    const original = assetPath(project, dir, a);
    // Files added after import (by an agent, say) get their previews the first time one is asked for.
    const missing = (kind === "poster" && !existsSync(c.poster)) || (kind === "strip" && a.kind === "video" && !existsSync(c.strip));
    if (missing && existsSync(original)) await cacheOnce(`${id}/${a.id}`, () => ensureCached(project, dir, a));
    if (kind === "sound") {
      const { soundFile } = await import("./clean.ts");
      return sendFile(req, res, soundFile(project, dir, a));
    }
    const pick =
      kind === "proxy" ? (existsSync(c.proxy) ? c.proxy : original)
      : kind === "image" ? (existsSync(c.image) ? c.image : original)
      : kind === "poster" ? c.poster
      : kind === "strip" ? c.strip
      : original;
    return sendFile(req, res, pick);
  }
  if (what === "file") {
    // Only files inside one of the project's footage folders or the project folder itself.
    const path = mediaPath(project, dir, rest.join("/"));
    const roots = [...project.sources.map((s) => sourceRoot(project, dir, s.id)), dir].map((r) => r + sep);
    if (!roots.some((r) => path.startsWith(r))) return json(res, 403, { error: "outside the project" });
    return sendFile(req, res, path);
  }
  if (what === "out") return sendFile(req, res, join(dir, "out", rest.join("/")));
  // A scene's code, compiled for the page (React, Remotion, three and the kit come from the page itself).
  if (what === "code") {
    const file = sceneFile(id!, rest.join("/"));
    const compiled = await compileScene(file, [join(codeRoot(id!), "node_modules")]);
    res.setHeader("cache-control", "no-cache");
    res.setHeader("access-control-allow-origin", "*");
    if ("error" in compiled) {
      res.statusCode = 422;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      return res.end(compiled.error);
    }
    res.setHeader("content-type", "text/javascript; charset=utf-8");
    return res.end(`/*bs-hosts:${JSON.stringify(compiled.hosts)}*/\n${compiled.code}`);
  }
  // Files scenes load (models, SVGs, data) from the code folder, and the look's fonts from the project folder.
  if (what === "scene-file") return sendFile(req, res, sceneFile(id!, rest.join("/")));
  if (what === "project-file") {
    const path = resolve(dir, rest.join("/"));
    if (!(path + sep).startsWith(dir + sep)) return json(res, 403, { error: "outside the project" });
    return sendFile(req, res, path);
  }
  // beatsheet's own sound effects.
  if (what === "sfx") {
    const name = rest[0] ?? "";
    if (!(SFX_SOUNDS as readonly string[]).includes(name)) return json(res, 404, { error: `no sound "${name}"` });
    return sendFile(req, res, join(SFX_DIR, `${name}.wav`));
  }
  json(res, 404, { error: "not found" });
}

let standalone: Promise<string> | undefined;
/** Starts the handler on a free local port once per process; resolves to its origin. */
export function startServer(): Promise<string> {
  return (standalone ??= new Promise((ok) => {
    const server = createServer((req, res) => void beatsheetHandler()(req, res));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      ok(`http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`);
    });
    server.unref();
  }));
}
