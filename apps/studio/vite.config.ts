import react from "@vitejs/plugin-react";
import { watch } from "node:fs";
import { basename, dirname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { beatsheetHandler, currentVersion, ROOTS } from "../../packages/engine/src/index.ts";

/**
 * Mounts the engine's project API and media server in the dev server, and tells the page when a project file changes
 * on disk (an agent's edit, say) so it can reload instead of overwriting it.
 */
function beatsheet(): Plugin {
  return {
    name: "beatsheet-engine",
    configureServer(server) {
      const handler = beatsheetHandler();
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/api/") || req.url?.startsWith("/media/")) return void handler(req, res, next);
        next();
      });
      const timers = new Map<string, ReturnType<typeof setTimeout>>();
      for (const root of [ROOTS.projects, ROOTS.examples]) {
        try {
          watch(root, { recursive: true }, (_event, file) => {
            if (!file || basename(file) !== "project.json") return;
            const id = basename(dirname(join(root, file)));
            clearTimeout(timers.get(id));
            timers.set(
              id,
              setTimeout(() => {
                try {
                  server.ws.send({ type: "custom", event: "beatsheet:changed", data: { id, version: currentVersion(id) } });
                } catch {
                  // Mid-write or removed; the next event will report it.
                }
              }, 120),
            );
          });
        } catch {
          // The folder doesn't exist yet (no projects imported).
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), beatsheet()],
  server: { port: 5180, strictPort: true },
});
