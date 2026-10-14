import react from "@vitejs/plugin-react";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { checkReferences, parseProject } from "../../packages/schema/src/index.ts";

/**
 * Stand-in for the engine until step 3: lists, loads and saves the project files under examples/.
 * Saves are validated the same way the engine will validate them, so a bad edit never reaches disk.
 */
function projectsApi(dir: string): Plugin {
  const fileFor = (id: string) => join(dir, id, "project.json");
  const send = (res: ServerResponse, status: number, body: unknown) => {
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

  return {
    name: "beatsheet-projects-api",
    configureServer(server) {
      server.middlewares.use("/api/projects", async (req, res) => {
        const id = decodeURIComponent((req.url ?? "/").replace(/^\/+|\/+$/g, ""));
        try {
          if (!id && req.method === "GET") {
            const list = readdirSync(dir, { withFileTypes: true })
              .filter((d) => d.isDirectory() && existsSync(fileFor(d.name)))
              .map((d) => {
                const p = JSON.parse(readFileSync(fileFor(d.name), "utf8"));
                return { id: d.name, title: p.title ?? d.name, recipe: p.recipe ?? "" };
              });
            return send(res, 200, list);
          }
          if (!/^[\w-]+$/.test(id) || !existsSync(fileFor(id))) return send(res, 404, { error: `no project ${id}` });
          if (req.method === "GET") return send(res, 200, JSON.parse(readFileSync(fileFor(id), "utf8")));
          if (req.method === "PUT") {
            const parsed = parseProject(JSON.parse(await readBody(req)));
            if (!parsed.ok) return send(res, 400, { issues: parsed.issues });
            const refs = checkReferences(parsed.project);
            if (refs.length) return send(res, 400, { issues: refs });
            writeFileSync(fileFor(id), JSON.stringify(parsed.project, null, 2) + "\n");
            return send(res, 200, { ok: true });
          }
          return send(res, 405, { error: "method not allowed" });
        } catch (err) {
          return send(res, 500, { error: String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), projectsApi(join(import.meta.dirname, "..", "..", "examples"))],
  server: { port: 5180, strictPort: true },
});
