/**
 * HTTP for the studio and for rendering: the project API and media files (with byte ranges, which video seeking
 * needs). The studio mounts this inside Vite; renders and the MCP server start it standalone.
 */
import { execFile } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { slugify, type Brief } from "@beatsheet/schema";
import { findMuse, launchMuse, listAgents, listMuseSessions, sendBatch } from "./agents.ts";
import { importFolder, scanFolder } from "./ingest.ts";
import { assetPath, cachePaths, expandHome, isProjectId, mediaPath } from "./paths.ts";
import { ConflictError, InvalidProjectError, listProjects, loadProject, readRaw, saveProject } from "./store.ts";

const run = promisify(execFile);

type Next = (err?: unknown) => void;

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".aiff": "audio/aiff", ".flac": "audio/flac",
};

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

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
  kind: "render" | "import";
  project: string;
  format?: string;
  status: "running" | "done" | "error";
  progress: number;
  log: string[];
  output?: string;
  error?: string;
};
/** Kept for older imports. */
export type RenderJob = Job;
const jobs = new Map<string, Job>();

function startJob(kind: Job["kind"], project: string, work: (job: Job) => Promise<string | void>, extra: Partial<Job> = {}): Job {
  const job: Job = { id: `${kind[0]}${Date.now().toString(36)}`, kind, project, status: "running", progress: 0, log: [], ...extra };
  jobs.set(job.id, job);
  work(job)
    .then((out) => Object.assign(job, { status: "done", progress: 1, output: out ?? undefined }))
    .catch((err) => Object.assign(job, { status: "error", error: err instanceof Error ? err.message : String(err) }));
  return job;
}

export type NewProjectRequest = {
  title: string;
  id?: string;
  folder?: string;
  song?: string;
  formats?: string[];
  brief?: Partial<Brief>;
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

/** macOS file and folder pickers, so the studio gets real paths. */
async function pick(kind: "folder" | "audio"): Promise<string | null> {
  const choose =
    kind === "folder"
      ? 'POSIX path of (choose folder with prompt "Choose the folder of photos and videos")'
      : 'POSIX path of (choose file with prompt "Choose a song" of type {"public.audio"})';
  try {
    const { stdout } = await run("osascript", ["-e", "activate", "-e", choose], { timeout: 10 * 60_000 });
    return stdout.trim().replace(/\/$/, "") || null;
  } catch {
    return null; // cancelled
  }
}

/** Connect-style handler for /api/* and /media/*; anything else goes to `next`. */
export function beatsheetHandler() {
  return async (req: IncomingMessage, res: ServerResponse, next?: Next) => {
    const url = new URL(req.url ?? "/", "http://local");
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    try {
      if (parts[0] === "api") return await api(req, res, parts.slice(1));
      if (parts[0] === "media") return media(req, res, parts.slice(1));
      if (next) return next();
      json(res, 404, { error: "not found" });
    } catch (err) {
      if (err instanceof ConflictError) return json(res, 409, { error: err.message, version: err.current });
      if (err instanceof InvalidProjectError) return json(res, 400, { error: err.message, issues: err.issues });
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
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
        firstCut: body.firstCut,
        log: (m) => j.log.push(m),
        onProgress: (f) => (j.progress = f),
      });
    });
    return json(res, 202, job);
  }
  if (section === "pick" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { kind?: "folder" | "audio" };
    return json(res, 200, { path: await pick(body.kind === "audio" ? "audio" : "folder") });
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
  if (section === "agents" && !id && req.method === "GET") return json(res, 200, { agents: listAgents(), muse: await findMuse() });
  if (section === "agents" && id === "sessions" && req.method === "GET") return json(res, 200, listMuseSessions());
  if (section === "agents" && id === "launch" && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as { model?: string; session?: string; project?: string };
    return json(res, 200, await launchMuse(body));
  }
  if (section === "agents" && id === "send" && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as { project: string };
    return json(res, 200, await sendBatch(body.project));
  }
  if (section === "projects" && id && !action) {
    if (req.method === "GET") {
      const raw = readRaw(id);
      return json(res, 200, { project: raw.json, version: raw.version });
    }
    if (req.method === "PUT") {
      const body = JSON.parse(await readBody(req)) as { project: unknown; version?: string };
      const saved = saveProject(id, body.project, body.version);
      return json(res, 200, { version: saved.version });
    }
  }
  if (section === "projects" && id && action === "render" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}") as { format?: string; quality?: "proxy" | "original" };
    const job = startJob(
      "render",
      id,
      async (j) => {
        const { renderProject } = await import("./render.ts");
        return renderProject(id, { format: body.format, quality: body.quality, onProgress: (p) => (j.progress = p) });
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

function media(req: IncomingMessage, res: ServerResponse, parts: string[]) {
  const [id, what, ...rest] = parts;
  const { project, dir } = loadProject(id!);
  if (what === "asset") {
    const [assetId, kind] = rest;
    const a = project.assets.find((x) => x.id === assetId);
    if (!a) return json(res, 404, { error: `no asset ${assetId}` });
    const c = cachePaths(dir, a.id);
    const original = assetPath(project, dir, a);
    const pick =
      kind === "proxy" ? (existsSync(c.proxy) ? c.proxy : original)
      : kind === "image" ? (existsSync(c.image) ? c.image : original)
      : kind === "poster" ? c.poster
      : kind === "strip" ? c.strip
      : original;
    return sendFile(req, res, pick);
  }
  if (what === "file") {
    // Only files inside the project's media folder or the project folder itself.
    const path = mediaPath(project, dir, rest.join("/"));
    const roots = [resolve(dir, expandHome(project.mediaRoot ?? ".")), dir].map((r) => r + sep);
    if (!roots.some((r) => path.startsWith(r))) return json(res, 403, { error: "outside the project" });
    return sendFile(req, res, path);
  }
  if (what === "out") return sendFile(req, res, join(dir, "out", rest.join("/")));
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
