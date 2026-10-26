/**
 * Live updates for the studio: a project file changed on disk (an agent's edit), agent sessions came or went, the
 * hosted agent did something. One stream, Server-Sent Events at /api/events, the same in the dev server and the app.
 */
import { EventEmitter } from "node:events";
import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { agentStudio, type AgentChange } from "./agent/index.ts";
import { AGENTS_DIR, listAgents } from "./agents.ts";
import { ROOTS } from "./paths.ts";
import { currentVersion } from "./store.ts";

export type StudioEvent =
  | { event: "changed"; data: { id: string; version: string } }
  | { event: "code"; data: { id: string; version: string } }
  | { event: "agents"; data: ReturnType<typeof listAgents> }
  | { event: "agent"; data: AgentChange };

const bus = new EventEmitter();
bus.setMaxListeners(100);
let started: (() => void) | undefined;

/** Starts watching (once): project files, agent presence, the hosted agent. Returns a function that stops it all. */
export function startEvents(): () => void {
  if (started) return started;
  const watchers: FSWatcher[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  const emit = (e: StudioEvent) => bus.emit("event", e);

  // Agent sessions come and go; say so whenever the list changes.
  let lastAgents = "";
  const pushAgents = () => {
    const agents = listAgents();
    const json = JSON.stringify(agents);
    if (json === lastAgents) return;
    lastAgents = json;
    emit({ event: "agents", data: agents });
  };
  mkdirSync(AGENTS_DIR, { recursive: true });
  let agentTimer: ReturnType<typeof setTimeout> | undefined;
  watchers.push(
    watch(AGENTS_DIR, () => {
      clearTimeout(agentTimer);
      agentTimer = setTimeout(pushAgents, 100);
    }),
  );
  const poll = setInterval(pushAgents, 4000); // also notices sessions that quit without saying so
  poll.unref();

  // A project file written by anyone else (an agent's edit, the CLI) means the studio should reload it.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  for (const root of [ROOTS.projects, ROOTS.examples]) {
    try {
      mkdirSync(root, { recursive: true });
      watchers.push(
        watch(root, { recursive: true }, (_event, file) => {
          if (!file) return;
          // A scene file written (by the agent's write_scene, say): the studio reloads that project's scenes.
          const parts = file.split(/[\\/]/);
          if (parts[1] === "scenes" && parts[0]) {
            const sid = parts[0];
            clearTimeout(pending.get(`code:${sid}`));
            pending.set(`code:${sid}`, setTimeout(() => emit({ event: "code", data: { id: sid, version: String(Date.now()) } }), 150));
            return;
          }
          if (basename(file) !== "project.json") return;
          const id = basename(dirname(join(root, file)));
          clearTimeout(pending.get(id));
          pending.set(
            id,
            setTimeout(() => {
              try {
                emit({ event: "changed", data: { id, version: currentVersion(id) } });
              } catch {
                // Mid-write or removed; the next event will report it.
              }
            }, 120),
          );
        }),
      );
    } catch {
      // Not watchable here; the studio still reloads on focus.
    }
  }

  // The agent the studio hosts streams every change.
  const agent = agentStudio();
  const onAgent = (change: AgentChange) => emit({ event: "agent", data: change });
  agent.on("change", onAgent);

  started = () => {
    for (const w of watchers) w.close();
    for (const t of [...timers, ...pending.values()]) clearTimeout(t);
    clearInterval(poll);
    agent.off("change", onAgent);
    started = undefined;
  };
  return started;
}

/** GET /api/events: the stream. Each event is a named SSE event with JSON data. */
export function streamEvents(req: IncomingMessage, res: ServerResponse) {
  startEvents();
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.write(": beatsheet\n\n");
  const send = (e: StudioEvent) => res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
  bus.on("event", send);
  // Keeps proxies and the browser from timing the stream out.
  const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    clearInterval(ping);
    bus.off("event", send);
  });
}
