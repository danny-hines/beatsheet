/**
 * HTTP for the studio and for rendering: the project API and media files (with byte ranges, which video seeking
 * needs). The studio mounts this inside Vite; renders and the MCP server start it standalone.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { ConflictError, InvalidProjectError, listProjects, loadProject, readRaw, saveProject } from "./store.ts";
import { assetPath, cachePaths, expandHome, mediaPath } from "./paths.ts";

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

export type RenderJob = { id: string; project: string; format: string; status: "running" | "done" | "error"; progress: number; output?: string; error?: string };
const jobs = new Map<string, RenderJob>();

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
    const job: RenderJob = { id: `r${Date.now().toString(36)}`, project: id, format: body.format ?? "", status: "running", progress: 0 };
    jobs.set(job.id, job);
    import("./render.ts")
      .then(({ renderProject }) => renderProject(id, { format: body.format, quality: body.quality, onProgress: (p) => (job.progress = p) }))
      .then((out) => Object.assign(job, { status: "done", progress: 1, output: out }))
      .catch((err) => Object.assign(job, { status: "error", error: err instanceof Error ? err.message : String(err) }));
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
