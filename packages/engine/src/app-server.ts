/**
 * The desktop app's server: the API, media, live events and the built studio, on a local port only this machine can
 * reach. In development the Vite dev server plays this part instead.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { agentStudio } from "./agent/index.ts";
import { useLoginPath } from "./agent/cli.ts";
import { startEvents } from "./events.ts";
import { beatsheetHandler } from "./http.ts";

const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/** Files from the built studio; anything that isn't a file gets the app (it routes with the URL hash). */
function serveStudio(dir: string, req: IncomingMessage, res: ServerResponse) {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
  let file = normalize(join(dir, path));
  if (!file.startsWith(dir + sep) && file !== dir) {
    res.statusCode = 403;
    return res.end();
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
  res.setHeader("content-type", STATIC_TYPES[extname(file)] ?? "application/octet-stream");
  // The built assets have hashed names; the page itself always comes fresh.
  res.setHeader("cache-control", file.endsWith("index.html") ? "no-cache" : "max-age=31536000, immutable");
  createReadStream(file).pipe(res);
}

/**
 * Starts the app's server on 127.0.0.1: on `port` when it's free, else on any free port. The page keeps what it
 * remembers (the last cut of each project, the export folder) per address, so a steady port keeps it across launches.
 */
export async function serveApp(opts: { studioDir: string; port?: number }): Promise<{ origin: string; close: () => void }> {
  // Opened from Finder, the app has a bare PATH; ffmpeg and friends are on the login shell's.
  await useLoginPath();
  const api = beatsheetHandler();
  const stopEvents = startEvents();
  const server = createServer((req, res) => {
    const path = req.url ?? "/";
    if (path.startsWith("/api/") || path.startsWith("/media/")) return void api(req, res);
    serveStudio(opts.studioDir, req, res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EADDRINUSE" || !opts.port) return reject(err);
      // Another beatsheet (or something else) has it: any free port, this time.
      server.listen(0, "127.0.0.1");
    });
    server.once("listening", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => {
          stopEvents();
          agentStudio().close();
          server.close();
        },
      });
    });
    server.listen(opts.port ?? 0, "127.0.0.1");
  });
}
