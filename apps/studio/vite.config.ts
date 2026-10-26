import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { agentStudio, beatsheetHandler, startEvents } from "../../packages/engine/src/index.ts";

/**
 * Mounts the engine in the dev server: the project API, media, and the live event stream the studio listens to
 * (project files changed on disk, agents, the hosted agent's progress). The Mac app serves the same thing itself.
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
      const stopEvents = startEvents();
      server.httpServer?.once("close", () => {
        stopEvents();
        agentStudio().close();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), beatsheet()],
  server: { port: 5180, strictPort: true },
});
