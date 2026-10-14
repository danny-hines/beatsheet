#!/usr/bin/env node
/**
 * beatsheet's MCP server: how Muse Code works on a project. It reads and writes the same project files as the studio
 * (which reloads when they change), and every write is validated and version-checked.
 *
 * Muse Code loads it from .mcp.json when the beatsheet folder is trusted; the studio's launcher starts Muse with
 * --trust-workspace. Any other MCP client can run it with `node packages/engine/src/mcp.ts`.
 */
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  autoAssemble,
  buildBatch,
  describeAnchor,
  formatTime,
  resolveTimeline,
  shotContentSummary,
  STAGE_IDS,
  type Asset,
  type Project,
} from "@beatsheet/schema";
import { presenceFromEnv, removePresence, writePresence, type Presence } from "./agents.ts";
import { addSong } from "./ingest.ts";
import { cachePaths } from "./paths.ts";
import { listProjects, loadProject, saveProject, updateProject } from "./store.ts";

const INSTRUCTIONS = `beatsheet is a video editor whose projects are JSON files (one project.json per video) that a person edits in the beatsheet studio while you edit them here. Start with get_project.

Rules for edits:
- Timing is anchors, never raw timecodes: a shot starts on a word, a beat or bar counted from a music section ({"kind":"beat","unit":"bar","n":2,"from":"drop"}), a section, a moment in a clip, or another shot, plus an optional offset. Bars and beats count from 0.
- Shots on a track chain in array order: a shot without "end" runs until the next shot starts. Keep shots in time order.
- Don't change anything a locked stage owns.
- Every write is validated; a bad edit is refused with the reason, and nothing is written.

Notes: the person pins notes in the studio and sends them as a batch. Call get_batch, handle each note with scoped edits, look at the result with frame when it's visual, then resolve_note with a one-line reply saying what changed.

When a message arrives saying the person sent beatsheet notes, they just pressed Send in the studio: call get_batch for that project and handle the notes right away.`;

const server = new McpServer({ name: "beatsheet", version: "0.1.0" }, { instructions: INSTRUCTIONS });

// ---- Presence: tells the studio this session is connected, and what it last did.
let presence: Presence | undefined;
server.server.oninitialized = () => {
  presence = { pid: process.pid, startedAt: new Date().toISOString(), ...presenceFromEnv(server.server.getClientVersion()) };
  writePresence(presence);
};
const track = (tool: string, project?: string) => {
  if (!presence) return;
  presence.activity = { tool, project, at: new Date().toISOString() };
  writePresence(presence);
};
const forget = () => removePresence(process.pid);
process.on("exit", forget);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => process.exit(0));
server.server.onclose = () => process.exit(0);

// Every tool call counts as activity.
const register = server.registerTool.bind(server);
server.registerTool = ((name: string, config: unknown, cb: (...args: unknown[]) => unknown) =>
  register(name, config as never, (async (...args: unknown[]) => {
    track(name, (args[0] as { project?: string } | undefined)?.project);
    return cb(...args);
  }) as never)) as unknown as typeof server.registerTool;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const projectArg = z.string().describe("Project id, from list_projects");

server.registerTool(
  "list_projects",
  { description: "Projects and examples, with their recipe (montage, narrated, …)." },
  async () => text(listProjects().map((p) => `${p.id}: ${p.title} (${p.recipe}${p.where === "examples" ? ", example" : ""})`).join("\n") || "No projects yet."),
);

server.registerTool(
  "get_project",
  {
    description: "Overview of a project: brief, stages, music and its sections, every shot with its time and anchor, open notes, and timing problems. Start here.",
    inputSchema: { project: projectArg, format: z.string().optional().describe("Format id; default the first") },
  },
  async ({ project: id, format }) => text(overview(id, format)),
);

server.registerTool(
  "list_assets",
  {
    description: "The footage, photos and music in a project: id, length, orientation, rating, tags, logged moments, and which shots use it.",
    inputSchema: {
      project: projectArg,
      filter: z.enum(["all", "unrated", "keepers", "rejected", "used", "unused"]).optional(),
    },
  },
  async ({ project: id, filter = "all" }) => {
    const { project } = loadProject(id);
    const used = usage(project);
    const rows = project.assets
      .filter((a) => {
        if (filter === "unrated") return !a.rating && a.kind !== "music";
        if (filter === "keepers") return (a.rating ?? 0) >= 3;
        if (filter === "rejected") return a.rating === -1;
        if (filter === "used") return used.has(a.id);
        if (filter === "unused") return !used.has(a.id) && a.kind !== "music";
        return true;
      })
      .map((a) => assetLine(a, used.get(a.id)));
    return text(rows.length ? rows.join("\n") : "Nothing matches.");
  },
);

server.registerTool(
  "look_at_assets",
  {
    description: "See footage without watching it: an 8-frame filmstrip of each video (frames evenly spaced across the clip) or a thumbnail of each photo. Up to 12 at a time. Use this to log what's in a clip before rating it or picking moments.",
    inputSchema: { project: projectArg, ids: z.array(z.string()).min(1).max(12) },
  },
  async ({ project: id, ids }) => {
    const { project, dir } = loadProject(id);
    const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [];
    for (const assetId of ids) {
      const a = project.assets.find((x) => x.id === assetId);
      if (!a) {
        content.push({ type: "text", text: `${assetId}: no such asset` });
        continue;
      }
      const c = cachePaths(dir, a.id);
      const file = a.kind === "video" ? c.strip : c.poster;
      try {
        const data = readFileSync(file).toString("base64");
        const span = a.kind === "video" && a.duration ? ` (frames at ${Array.from({ length: 8 }, (_, i) => ((i + 0.5) * a.duration! / 8).toFixed(1)).join(", ")}s)` : "";
        content.push({ type: "text", text: `${assetLine(a)}${span}` });
        content.push({ type: "image", data, mimeType: "image/jpeg" });
      } catch {
        content.push({ type: "text", text: `${assetId}: no thumbnail yet (run \`npm run beatsheet -- cache ${id}\`)` });
      }
    }
    return { content };
  },
);

server.registerTool(
  "log_assets",
  {
    description: "Record what you saw: ratings (-1 reject, 1-5 stars), tags, a better label, and moments (a time in the source file worth landing on a beat, like a jump, a laugh or a firework burst).",
    inputSchema: {
      project: projectArg,
      updates: z
        .array(
          z.object({
            id: z.string(),
            rating: z.number().int().min(-1).max(5).optional(),
            label: z.string().optional(),
            tags: z.array(z.string()).optional().describe("Replaces the existing tags"),
            moments: z
              .array(z.object({ id: z.string().optional(), t: z.number(), label: z.string(), score: z.number().min(0).max(1).optional() }))
              .optional()
              .describe("Replaces the existing moments; t is seconds into the source file"),
          }),
        )
        .min(1),
    },
  },
  async ({ project: id, updates }) => {
    const missing: string[] = [];
    updateProject(id, (p) => {
      for (const u of updates) {
        const a = p.assets.find((x) => x.id === u.id);
        if (!a) {
          missing.push(u.id);
          continue;
        }
        if (u.rating !== undefined) a.rating = u.rating;
        if (u.label !== undefined) a.label = u.label;
        if (u.tags !== undefined) a.tags = u.tags;
        if (u.moments !== undefined)
          a.moments = u.moments.map((m, i) => ({ id: m.id ?? slug(m.label, i), t: m.t, label: m.label, score: m.score }));
      }
      const logged = p.assets.filter((a) => a.kind !== "music" && (a.rating || a.moments?.length)).length;
      const total = p.assets.filter((a) => a.kind !== "music").length;
      p.stages.material = { ...p.stages.material, summary: `${logged} of ${total} logged` };
    });
    return text(`Logged ${updates.length - missing.length} assets.${missing.length ? ` Unknown ids: ${missing.join(", ")}` : ""}`);
  },
);

server.registerTool(
  "first_cut",
  {
    description: "Deterministic first cut on the beat: picks the stretch of the song around its first drop, cuts faster where the music is louder, and fills the cuts with footage in the order it was shot (skipping rejects, landing logged moments early in their shots). Replaces the shots on the picture and text tracks. Improve on it afterwards with edit_project.",
    inputSchema: {
      project: projectArg,
      targetLength: z.number().positive().optional().describe("Seconds; default the brief's target"),
      startSection: z.string().optional().describe("Music section id to start in"),
      include: z.array(z.string()).optional().describe("Asset ids to use, in this order"),
      beatsPerCut: z.object({ low: z.number().optional(), mid: z.number().optional(), high: z.number().optional() }).optional(),
      title: z.union([z.string(), z.literal(false)]).optional().describe("Title card text, or false for none"),
    },
  },
  async ({ project: id, ...opts }) => {
    const { project, version } = loadProject(id);
    const { project: next, summary } = autoAssemble(project, opts);
    saveProject(id, next, version);
    return text(`${summary.join("\n")}\n\n${overview(id)}`);
  },
);

server.registerTool(
  "set_song",
  {
    description: "Use a song file as the music: copies it into the project, finds its beat grid and sections (Intro, Build, Drop, …). Run first_cut afterwards to recut to it.",
    inputSchema: { project: projectArg, file: z.string().describe("Path to an audio file") },
  },
  async ({ project: id, file }) => {
    const a = await addSong(id, file);
    return text(`${a.label}: ${a.grid?.bpm} BPM, sections ${a.sections?.map((s) => `${s.label} (${s.id}) at ${formatTime(s.start)}`).join(", ")}`);
  },
);

server.registerTool(
  "edit_project",
  {
    description:
      'Change a project with JSON Patch operations (add, remove, replace, move, copy, test) on project.json. Array elements can be addressed by id instead of index: "/shots/id=s07/start". Validated before writing; refused edits change nothing. Returns the resulting timing.',
    inputSchema: {
      project: projectArg,
      ops: z
        .array(
          z.object({
            op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
            path: z.string(),
            value: z.unknown().optional(),
            from: z.string().optional(),
          }),
        )
        .min(1),
    },
  },
  async ({ project: id, ops }) => {
    const { project, version } = loadProject(id);
    const doc = structuredClone(project) as unknown;
    for (const op of ops) applyOp(doc, op);
    const saved = saveProject(id, doc, version);
    const tl = resolveTimeline(saved.project);
    return text(
      `Saved. ${formatTime(tl.duration)} long, ${tl.shots.length} shots.` +
        (tl.diagnostics.length ? `\nTiming problems:\n${tl.diagnostics.map((d) => `- ${d.where}: ${d.message}`).join("\n")}` : ""),
    );
  },
);

server.registerTool(
  "get_batch",
  {
    description: "The notes the person sent you, each with the shot, line or frame region it points at already resolved. If nothing was sent, picks up the notes waiting in the next batch and marks them as yours.",
    inputSchema: { project: projectArg },
  },
  async ({ project: id }) => {
    const loaded = loadProject(id);
    let notes = loaded.project.notes.filter((n) => n.status === "working");
    if (!notes.length) {
      const queued = new Set(loaded.project.notes.filter((n) => n.status === "queued" && n.text.trim()).map((n) => n.id));
      if (!queued.size) return text("No notes waiting.");
      const batch = `b${Date.now().toString(36)}`;
      updateProject(id, (p) => p.notes.forEach((n) => queued.has(n.id) && Object.assign(n, { status: "working", batch })));
      notes = loadProject(id).project.notes.filter((n) => queued.has(n.id));
    }
    const where = listProjects().find((p) => p.id === id)?.where ?? "projects";
    return text(JSON.stringify(buildBatch(loaded.project, notes, { file: `${where}/${id}/project.json` }), null, 2));
  },
);

server.registerTool(
  "resolve_note",
  {
    description: "Close a note with a one-line reply saying what changed, or hand it back open with the reason you couldn't do it.",
    inputSchema: { project: projectArg, note: z.string(), reply: z.string(), done: z.boolean().optional().describe("Default true") },
  },
  async ({ project: id, note, reply, done = true }) => {
    let found = false;
    updateProject(id, (p) => {
      const n = p.notes.find((x) => x.id === note);
      if (!n) return;
      found = true;
      n.status = done ? "done" : "open";
      n.reply = reply;
    });
    return text(found ? `Note ${note} ${done ? "done" : "handed back"}.` : `No note ${note}.`);
  },
);

server.registerTool(
  "frame",
  {
    description: "See the cut: a still of the composed frame (picture, crop, text) at a time or in the middle of a shot. The first call takes ~20 s while the renderer warms up.",
    inputSchema: {
      project: projectArg,
      t: z.number().optional().describe("Seconds into the cut"),
      shot: z.string().optional().describe("Shot id; uses its midpoint"),
      format: z.string().optional(),
    },
  },
  async ({ project: id, t, shot, format }) => {
    const { project } = loadProject(id);
    const tl = resolveTimeline(project, format);
    let time = t ?? 0;
    if (shot) {
      const r = tl.shots.find((s) => s.id === shot);
      if (!r) return text(`No shot ${shot} in this format.`);
      time = (r.start + r.end) / 2;
    }
    const { renderFrame } = await import("./render.ts");
    const jpg = await renderFrame(id, { format, t: time });
    return { content: [{ type: "text" as const, text: `${id} at ${formatTime(time)}` }, { type: "image" as const, data: jpg.toString("base64"), mimeType: "image/jpeg" }] };
  },
);

server.registerTool(
  "render",
  {
    description: "Export the cut as an MP4. Drafts use the small preview copies and take seconds; final renders read the original footage.",
    inputSchema: { project: projectArg, format: z.string().optional(), draft: z.boolean().optional() },
  },
  async ({ project: id, format, draft }) => {
    const { renderProject } = await import("./render.ts");
    const out = await renderProject(id, { format, quality: draft ? "proxy" : "original" });
    return text(`Wrote ${out}`);
  },
);

// ---------------------------------------------------------------------------------------------------------------
function overview(id: string, format?: string): string {
  const { project: p, version } = loadProject(id);
  const fmt = p.formats.find((f) => f.id === format) ?? p.formats[0]!;
  const tl = resolveTimeline(p, fmt.id);
  const lines: string[] = [];
  lines.push(`# ${p.title} (${p.id}, ${p.recipe}, version ${version})`);
  lines.push(`Goal: ${p.brief.goal}${p.brief.targetLength ? ` · target ${p.brief.targetLength}s` : ""}${p.brief.tone?.length ? ` · ${p.brief.tone.join(", ")}` : ""}`);
  lines.push(`Formats: ${p.formats.map((f) => `${f.id} ${f.width}×${f.height}`).join(", ")} · showing ${fmt.id}: ${formatTime(tl.duration)}`);
  lines.push(`Stages: ${STAGE_IDS.map((s) => `${s} ${p.stages[s].status}${p.stages[s].locked ? " (locked)" : ""}`).join(" · ")}`);
  const kinds = new Map<string, number>();
  p.assets.forEach((a) => kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1));
  const logged = p.assets.filter((a) => a.kind !== "music" && (a.rating || a.moments?.length)).length;
  lines.push(`Assets: ${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ")} · ${logged} logged (list_assets for details)`);
  if (tl.cues.length) {
    const songs = tl.cues.map((c) => {
      const a = p.assets.find((x) => x.id === c.asset);
      return `${a?.label ?? c.asset} ${a?.grid ? `${a.grid.bpm} BPM ` : ""}from ${formatTime(c.trackFrom)} of the track, ${formatTime(c.start)}–${formatTime(c.end)} in the cut`;
    });
    lines.push(`Music: ${songs.join("; ")}`);
    lines.push(`Sections in the cut: ${tl.sections.map((s) => `${s.label} [${s.id}] ${formatTime(s.start)}–${formatTime(s.end)}`).join(", ")}`);
    const allSections = p.assets.find((a) => a.id === tl.cues[0]!.asset)?.sections;
    if (allSections) lines.push(`Whole song: ${allSections.map((s) => `${s.label} [${s.id}] ${formatTime(s.start)}${s.level ? ` ${s.level}` : ""}`).join(", ")}`);
  }
  if (tl.lines.length) lines.push(`Voice: ${tl.lines.length} lines, ${formatTime(tl.lines[0]!.start)}–${formatTime(tl.lines.at(-1)!.end)}`);
  lines.push("");
  lines.push("Shots (id · track · plays · starts on · content · fidelity):");
  for (const r of tl.shots) {
    const s = p.shots.find((x) => x.id === r.id)!;
    const clipIn = s.content.kind === "clip" && r.sourceIn !== undefined ? ` from ${r.sourceIn.toFixed(2)}s` : "";
    lines.push(
      `- ${s.id} · ${s.track} · ${formatTime(r.start)}–${formatTime(r.end)} · ${s.start ? describeAnchor(s.start, p) : "after previous"} · ${shotContentSummary(s, p)}${clipIn} · ${s.fidelity}${s.label ? ` · "${s.label}"` : ""}`,
    );
  }
  const waiting = p.notes.filter((n) => n.status === "queued" || n.status === "working");
  if (waiting.length) lines.push(`\n${waiting.length} notes waiting (get_batch).`);
  if (tl.diagnostics.length) lines.push(`\nTiming problems:\n${tl.diagnostics.map((d) => `- ${d.where}: ${d.message}`).join("\n")}`);
  return lines.join("\n");
}

function usage(p: Project): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const add = (a: string, by: string) => used.set(a, [...(used.get(a) ?? []), by]);
  for (const s of p.shots) {
    if (s.content.kind === "clip") add(s.content.asset, s.id);
    if (s.content.kind === "generated" && s.content.take) add(s.content.take, s.id);
  }
  for (const c of p.music?.cues ?? []) add(c.asset, c.id);
  return used;
}

function assetLine(a: Asset, usedBy?: string[]): string {
  const orient = a.width && a.height ? (a.height > a.width ? "portrait" : "landscape") : "";
  const bits = [
    a.id,
    a.kind,
    a.duration ? `${a.duration.toFixed(1)}s` : "",
    orient,
    a.capturedAt ? a.capturedAt.slice(0, 16).replace("T", " ") : "",
    a.rating === -1 ? "REJECTED" : a.rating ? `${a.rating}★` : "unrated",
    a.label && !/^(Photo|Video \d+s) ·/.test(a.label) ? `"${a.label}"` : "",
    a.tags?.length ? `tags: ${a.tags.join(", ")}` : "",
    a.moments?.length ? `moments: ${a.moments.map((m) => `${m.id}@${m.t}s "${m.label}"`).join(", ")}` : "",
    usedBy?.length ? `used in ${usedBy.join(", ")}` : "",
  ];
  return bits.filter(Boolean).join(" · ");
}

const slug = (label: string, i: number) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || `m${i + 1}`;

// ---- JSON Patch (RFC 6902), plus "id=<value>" path segments that pick an array element by its id.
type Op = { op: string; path: string; value?: unknown; from?: string };

function parsePath(doc: unknown, path: string): { parent: unknown; key: string | number } {
  if (!path.startsWith("/")) throw new Error(`Path must start with "/": ${path}`);
  const segs = path.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let node = doc as Record<string, unknown> | unknown[];
  for (let i = 0; i < segs.length - 1; i++) node = step(node, segs[i]!, path) as typeof node;
  const last = segs.at(-1)!;
  if (Array.isArray(node)) {
    if (last === "-") return { parent: node, key: node.length };
    if (last.startsWith("id=")) return { parent: node, key: indexById(node, last.slice(3), path) };
    return { parent: node, key: Number(last) };
  }
  return { parent: node, key: last };
}

function step(node: unknown, seg: string, path: string): unknown {
  if (Array.isArray(node)) {
    const i = seg.startsWith("id=") ? indexById(node, seg.slice(3), path) : Number(seg);
    if (!(i in node)) throw new Error(`Nothing at ${seg} in ${path}`);
    return node[i];
  }
  if (node && typeof node === "object" && seg in node) return (node as Record<string, unknown>)[seg];
  throw new Error(`Nothing at "${seg}" in ${path}`);
}

function indexById(arr: unknown[], id: string, path: string): number {
  const i = arr.findIndex((x) => (x as { id?: unknown })?.id === id);
  if (i < 0) throw new Error(`No element with id "${id}" in ${path}`);
  return i;
}

function get(doc: unknown, path: string): unknown {
  const { parent, key } = parsePath(doc, path);
  return (parent as Record<string | number, unknown>)[key];
}

function applyOp(doc: unknown, op: Op) {
  const { parent, key } = parsePath(doc, op.path);
  const isArray = Array.isArray(parent);
  const put = (value: unknown, insert: boolean) => {
    if (isArray) (parent as unknown[]).splice(key as number, insert ? 0 : 1, value);
    else (parent as Record<string, unknown>)[key as string] = value;
  };
  switch (op.op) {
    case "add":
      return put(structuredClone(op.value), true);
    case "replace":
      return put(structuredClone(op.value), false);
    case "remove":
      if (isArray) (parent as unknown[]).splice(key as number, 1);
      else delete (parent as Record<string, unknown>)[key as string];
      return;
    case "copy":
    case "move": {
      if (!op.from) throw new Error(`${op.op} needs "from"`);
      const value = structuredClone(get(doc, op.from));
      if (op.op === "move") applyOp(doc, { op: "remove", path: op.from });
      return applyOp(doc, { op: "add", path: op.path, value });
    }
    case "test":
      if (JSON.stringify((parent as Record<string | number, unknown>)[key]) !== JSON.stringify(op.value)) throw new Error(`Test failed at ${op.path}`);
      return;
    default:
      throw new Error(`Unknown op ${op.op}`);
  }
}

await server.connect(new StdioServerTransport());
