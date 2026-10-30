#!/usr/bin/env node
/**
 * beatsheet's MCP server: how an agent works on a project. It reads and writes the same project files as the studio
 * (which reloads when they change), and every write is validated and version-checked.
 *
 * The agents the studio hosts get it in their session config; an agent in a terminal loads it from .mcp.json. Any
 * other MCP client can run it with `node packages/engine/src/mcp.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  autoAssemble,
  branchCut,
  buildBatch,
  CATALOG,
  cutOf,
  CAST_ID,
  describeAnchor,
  formatPreset,
  formatTime,
  fitSong,
  freshCut,
  lineState,
  lineVoice,
  whoSpeaks,
  MAKE_OPS,
  SFX_SOUNDS,
  resolveTimeline,
  shotContentSummary,
  slugify,
  STAGE_IDS,
  Look,
  type Asset,
  type Fit,
  type Project,
  type SubjectTrack,
} from "@beatsheet/schema";
import { castFromSubject } from "./castfrom.ts";
import { PLAN_ROUTES } from "./plans.ts";
import { presenceFromEnv, removePresence, writePresence, type Presence } from "./agents.ts";
import { addAsset, addSong, importMedia } from "./ingest.ts";
import { KIT_PROPS } from "@beatsheet/video/catalog";
import { generateMusic } from "./generate.ts";
import { cancelJobs, describeJob, driveJobs, estimate, isOpen, listJobs, makeChoices, retryJobs, spentThisTurn, startMakeAll, turnBudget, type MakeAsk } from "./make.ts";
import { reviewCut } from "./review.ts";
import { addFont } from "./fonts.ts";
import { footagePalette, previewLooks } from "./looks.ts";
import { importSceneFile, listScenes, writeScene } from "./scenes.ts";
import { generateSfx } from "./sounds.ts";
import { narrate } from "./narrate.ts";
import { cutOut, findSubjects, joinSubjects, trackSubject } from "./subjects.ts";
import { listVoices, voiceName } from "./voices.ts";
import { IS_WINDOWS } from "./platform.ts";
import { cachePaths } from "./paths.ts";
import { listProjects, loadProject, saveProject, updateFile, updateProject } from "./store.ts";
import { yourTurn } from "./turns.ts";

/** What add_font says about the fonts this computer already has. They draw only here; a Google font draws everywhere. */
const SYSTEM_FONTS = IS_WINDOWS
  ? "Windows' own fonts need nothing, but only draw on a PC, so prefer a Google font for anything the cut should look the same on everywhere (Segoe UI, Bahnschrift, Georgia, Cambria, Constantia, Corbel, Candara, Sitka, Gabriola, Ink Free, Segoe Print, Segoe Script, Impact…)."
  : "The Mac's own fonts need nothing (Avenir Next, Futura, Gill Sans, Didot, Baskerville, American Typewriter, Rockwell, Marker Felt, Noteworthy, Snell Roundhand…).";

const INSTRUCTIONS = `beatsheet is a video editor whose projects are JSON files that a person edits in the beatsheet studio while you edit them here. Start with get_project.

A project holds what every version shares (the footage and its logs, and the brief) and one or more cuts: versions of the video with their own length, formats, music, shots and notes (a 30s sizzle, a narrated long version, a softer take). Tools that work on a cut take "cut"; without it they use the first cut. create_cut makes another: a copy to try a variation on, or with fresh: true an empty one to build again from the footage (another attempt, or another length or shape).

Rules for edits:
- Timing is anchors, never raw timecodes: a shot starts on a word, a beat or bar counted from a music section ({"kind":"beat","unit":"bar","n":2,"from":"drop"}), a section, a moment in a clip, or another shot, plus an optional offset. Bars and beats count from 0.
- Shots on a track chain in array order: a shot without "end" runs until the next shot starts. Keep shots in time order.
- Don't change anything a locked stage owns.
- Every write is validated; a bad edit is refused with the reason, and nothing is written.

Turns: the studio shows whose move it is. When you're given something to do it's your turn; work through it on your own (the person isn't watching every step) and end the turn with hand_off, saying exactly what you need from them: a pick between a few directions (kind "choose"), a look at a cut you've made playable (kind "review"), or something only they can provide like a song (kind "provide"). Don't ask questions in chat when hand_off can ask them, and don't hand off just to report progress. Their answer arrives as your next message.

Subjects and effects: find_subjects finds the faces and people in a clip and follows them; track_subject follows anything you box. A clip shot can then carry effects that follow a subject (content.effects: {kind: "blur", subject} to hide a stranger's face, {kind: "label", subject, text} for a name tag, {kind: "spotlight", subject}), and a reframe can follow one (content.reframe.vertical.follow) to keep a person in a vertical crop of landscape footage. cut_out lifts people or things out of the picture as transparent assets for layered shots (with a prompt like "the dog", anything you can name, when SAM is set up); any shot can come in with transition {kind: "pop" | "fade" | "slide-up" | "zoom"}. Tracks draw in their array order, so put overlay tracks for cut-outs after the text track when the text should sit behind someone.

The look (/look): the colours, fonts, grain and grade that titles, captions, scenes and footage draw with, shared by every cut. Give every project one of its own before you add titles or designed shots; without it they draw in plain neutrals. When there's a brand, take it from the brand (its site's CSS, its logo). When it's personal footage (a family beach trip, a wedding, a birthday), take it from the footage and the occasion: palette reads the footage's own colours and suggests a look from them; pick type that suits the mood (add_font gets any Google font); grade the footage to suit (/look/grade: sunny and warm for the beach, soft and faded for nostalgia). If the person hasn't said what vibe they're after, make 2-3 looks that fit the footage and differ in feel, show them with preview_looks, and let the person pick: a choose hand-off with each option's image, or a second question on the card that asks for the directions (questions). If they have said, or there's a brand, set it and go.

Designed scenes: a shot doesn't have to be footage. Coded shots draw anything: kinetic type, a stat that counts up, cards, a before/after split, a phone showing the site, labelled callouts on a picture, a 3D model exploding into its parts. Design them for this project: first a design system from its look (a motif from the product, or from what's in the footage: a postcard, a horizon line, a film strip; a motion character), then the moments that carry the video (the hook, the reveal, the end card) as React components written for it with write_scene, from its real parts, numbers and screens (the motion skill has the API, the process and a checklist). Ready-made kit scenes need no code ({"kind":"coded","component":"kit:Title","props":{...}}; list_kit shows them) and suit quick utility shots; a video made mostly of them looks like every other. With narration, turn on /captions; put sound effects on moments with /sfx cues (built-in sounds by name, or generate_sfx). Before handing a cut back, run review_cut, fix what it finds, and critique its design pass.

Pages behind a login (a Google Photos album, a dashboard, a private doc): the person's Chrome is signed in, so use it when you can reach it: the claude-in-chrome tools (Claude Code), your own browser tool's chrome backend (Codex), or the chrome-devtools tools (attached to their running Chrome; if they can't connect, ask the person to turn on remote debugging once at chrome://inspect/#remote-debugging and allow the connection Chrome asks about). The person is asked before you act on each site. To bring media in from there, download it in Chrome (it lands in ~/Downloads; Google Photos zips a multi-photo download) and pass the files or zip to import_media, which skips what the project already has: compare with list_assets first rather than downloading everything. Without those tools, your own browsers aren't signed in to anything: hand_off with kind "provide" and need "chrome", saying what you'll do there; the card gives the person a button that lets you use their Chrome (or they can download the files and tell you where they are). Never read a browser's saved logins or cookies.

Making media: generate_music makes a song (with the person's ElevenLabs key) and sets it as a cut's music. generate makes pictures and video (with the person's fal key): give it a placeholder or generated shot (or several, with shots) and it makes takes for them, with each shot's length, the cut's shape and the shot's description filling in whatever you don't say. Make stills first (op "image") to settle each shot cheaply as a board, then rough clips from each shot's chosen board (op "video", start "board"), then finals with the best model once the cut holds (quality "final"). Cast and sets (/cast: characters, places, props, styles) keep made shots consistent: name them in prompts with @id (@cat, @cat/heist for a variant) and they're described to the model, and stills are given their pictures. Make a cast member's pictures with generate's sheet (from the photos it's seen in, or from its description), and ask for photos only the person has with a provide hand-off (need "cast"). list_models says which models could make something, about what each costs, and why the others can't; with shots, what a whole pass would cost. generate returns at once and the takes land as they finish; jobs says where they are, and can wait for them. It spends the person's money: a few dollars a turn without asking (the person sets how much); for more, ask first in a choose hand-off that says what it would cost. The film recipe skill is the whole process for a video made from nothing. Services are used only through beatsheet's tools, which hold the keys: never read API keys (the Keychain, settings) or call a service's API yourself. If beatsheet has no tool for what's needed, say so in hand_off rather than working around it.

Narration: narrate writes a cut's voiceover lines and reads them aloud (ElevenLabs, Kokoro or ${IS_WINDOWS ? "Windows'" : "the Mac's"} own voices, whichever the person has; list_voices shows them), timing every word. The lines play in order from the start of the cut, and shots can start on a word ({"kind":"word","line":"hook","word":"face"}) or a line. Use the cut's voice, or the person's default, unless they asked for another.

Notes: the person pins notes on a cut and sends them as a batch. Call get_batch, handle each note with scoped edits, look at the result with frame when it's visual, resolve_note with a one-line reply saying what changed, then hand_off for a review.

When a message arrives saying the person sent beatsheet notes, they just pressed Send in the studio: call get_batch for that project and cut and handle the notes right away.`;

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
/** A choose hand-off's option. */
const OPTION = z.object({
  id: z.string().optional(),
  label: z.string(),
  detail: z.string().optional(),
  cut: z.string().optional().describe("A cut that already shows this option"),
  asset: z.string().optional().describe("An asset that shows this option"),
  assets: z.array(z.string()).max(6).optional().describe("3-4 key frames (asset ids) that sketch this option in order, like a storyboard"),
  image: z.string().optional().describe("A picture made for it, relative to the project folder: a look's preview from preview_looks"),
});
const projectArg = z.string().describe("Project id, from list_projects");
const cutArg = z.string().optional().describe("Cut id; default the project's first cut (get_project lists them)");

server.registerTool(
  "list_projects",
  { description: "Projects and examples, with their recipe (montage, narrated, …)." },
  async () => text(listProjects().map((p) => `${p.id}: ${p.title} (${p.recipe}${p.where === "examples" ? ", example" : ""})`).join("\n") || "No projects yet."),
);

server.registerTool(
  "get_project",
  {
    description:
      "Overview of a project: its cuts, the brief, and for one cut its stages, music and sections, every shot with its time and anchor, open notes, and timing problems. Start here.",
    inputSchema: { project: projectArg, cut: cutArg, format: z.string().optional().describe("Format id; default the cut's first") },
  },
  async ({ project: id, cut, format }) => text(overview(id, cut, format)),
);

server.registerTool(
  "list_assets",
  {
    description: "The footage, photos and music in a project (shared by all its cuts): id, length, orientation, rating, tags, logged moments, and which shots of the cut use it.",
    inputSchema: {
      project: projectArg,
      cut: cutArg,
      filter: z.enum(["all", "unrated", "keepers", "rejected", "used", "unused"]).optional().describe("used and unused are about the cut"),
    },
  },
  async ({ project: id, cut, filter = "all" }) => {
    const { project } = loadProject(id, cut);
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
    // The footage is shared, so this updates every cut's picture of it.
    updateFile(id, (p) => {
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
      for (const c of p.cuts) c.stages.material = { ...c.stages.material, summary: `${logged} of ${total} logged` };
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
      cut: cutArg,
      targetLength: z.number().positive().optional().describe("Seconds; default the cut's target"),
      music: z.string().optional().describe("Song (music asset id); default the cut's own, else the project's first"),
      startSection: z.string().optional().describe("Music section id to start in"),
      include: z.array(z.string()).optional().describe("Asset ids to use, in this order"),
      beatsPerCut: z.object({ low: z.number().optional(), mid: z.number().optional(), high: z.number().optional() }).optional(),
      title: z.union([z.string(), z.literal(false)]).optional().describe("Title card text, or false for none"),
    },
  },
  async ({ project: id, cut, ...opts }) => {
    const { project, version } = loadProject(id, cut);
    const { project: next, summary } = autoAssemble(project, opts);
    saveProject(id, next, version);
    return text(`${summary.join("\n")}\n\n${overview(id, project.cut.id)}`);
  },
);

server.registerTool(
  "set_song",
  {
    description: "Use a song file as a cut's music: copies it into the project, finds its beat grid and sections (Intro, Build, Drop, …). Run first_cut afterwards to recut to it.",
    inputSchema: { project: projectArg, cut: cutArg, file: z.string().describe("Path to an audio file") },
  },
  async ({ project: id, cut, file }) => {
    const a = await addSong(id, file, () => {}, cut);
    return text(`${a.label}: ${a.grid?.bpm} BPM, sections ${a.sections?.map((s) => `${s.label} (${s.id}) at ${formatTime(s.start)}`).join(", ")}`);
  },
);

server.registerTool(
  "list_kit",
  {
    description: "The ready-made designed scenes a coded shot can use without writing code (component \"kit:<Name>\", props from this list), and what each takes. `at` is seconds into the shot or a spoken word. Good for quick utility shots; the moments that carry a video deserve scenes written for the project (write_scene). Also lists the built-in sounds.",
    inputSchema: {},
  },
  async () =>
    text(
      `Built-in sounds for /sfx cues: ${SFX_SOUNDS.join(", ")}.\n\nKit scenes (component "kit:<Name>"):\n${Object.entries(KIT_PROPS)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")}\n\nThe same pieces (and Slam, Rise, Pop, Chip, Stamp, Flash, Shake, Viewfinder, ThreeCanvas, useScene…) can be imported from "@beatsheet/motion" in a scene you write.`,
    ),
);

server.registerTool(
  "write_scene",
  {
    description:
      'Write a designed scene: a React component (TSX) the cut can show as a coded shot ({"kind":"coded","component":"scenes/<file>#<Export>","props":{...}}). It\'s saved in the project\'s scenes/ folder and compiled straight away; you get its exports or the compile errors. Import from "react", "remotion", "three" and "@beatsheet/motion" (useScene() for time, size, look, the narration\'s words and the beats; Slam, Title, Callouts, Split, Grid, Phone, ThreeCanvas and more). Read the motion skill first. Check it with frame.',
    inputSchema: {
      project: projectArg,
      file: z.string().describe("e.g. Hook.tsx or parts/Exploded.tsx"),
      code: z.string().describe("The whole file"),
    },
  },
  async ({ project: id, file, code }) => {
    const r = await writeScene(id, file, code);
    if ("error" in r.result) return { content: [{ type: "text" as const, text: `Saved ${r.path}, but it doesn't compile:\n${r.result.error}` }], isError: true };
    return text(`Saved and compiled ${r.path}. Exports: ${r.result.exports.join(", ") || "(none)"}. Use it as {"kind":"coded","component":"${r.path}#${r.result.exports.find((e) => e !== "default") ?? "default"}"}.`);
  },
);

server.registerTool(
  "import_file",
  {
    description:
      "Copy a file a scene needs into the project (a 3D model .stl/.glb from the person's repo, an SVG logo, a font, a JSON of data). It lands in scenes/files/; a scene loads it with useScene().file(<the path this returns>), e.g. \"scenes/files/body.stl\". Footage and photos go through the media library instead.",
    inputSchema: { project: projectArg, path: z.string().describe("Absolute path, ~ allowed"), as: z.string().optional().describe("Name to give it") },
  },
  async ({ project: id, path, as }) => text(`Copied to ${importSceneFile(id, path, as)}.`),
);

server.registerTool(
  "capture_page",
  {
    description:
      "Take a picture of a public web page (the product's site, a launch post, a gallery) and add it to the media, for a scene to show: on a phone (kit:Phone, scrolling with fullPage), in a card, or full screen. Phone-sized by default. Its browser isn't signed in to anything; for a page behind a login, use the person's Chrome (the claude-in-chrome tools) if you have it.",
    inputSchema: {
      project: projectArg,
      url: z.string(),
      width: z.number().optional().describe("Window width: 390 for a phone (default), 1440 for a desktop"),
      height: z.number().optional(),
      fullPage: z.boolean().optional().describe("The whole page top to bottom, to scroll through"),
      wait: z.number().optional().describe("Seconds to let it settle; default 1.5"),
      label: z.string().optional(),
    },
  },
  async ({ project: id, url, width, height, fullPage, wait, label }) => {
    const { capturePage } = await import("./capture.ts");
    const a = await capturePage(id, url, { width, height, fullPage, wait, label });
    return text(`Added ${a.id}: ${a.width}×${a.height} picture of ${url}.`);
  },
);

server.registerTool(
  "import_media",
  {
    description:
      "Bring photos and videos into the project's footage from files you downloaded or were pointed at: files, folders or .zip archives (a Google Photos download in ~/Downloads, say). What the project doesn't have yet is copied into the project (so the downloads can be deleted) and gets previews; anything it already has (the same file, or the same shot under another name) is skipped and listed. Log the new ones afterwards like any footage.",
    inputSchema: {
      project: projectArg,
      paths: z.array(z.string()).min(1).describe("Absolute paths, ~ allowed"),
      label: z.string().optional().describe("Where they came from, shown as the media folder's name: e.g. Google Photos · Lisbon album"),
      from: z.string().optional().describe("The page they were downloaded from"),
    },
  },
  async ({ project: id, paths, label, from }) => {
    const r = await importMedia(id, paths, { label, from });
    const skipped = r.skipped.length ? ` Skipped ${r.skipped.length} the project already has: ${r.skipped.map((s) => `${s.file} (= ${s.asset})`).join(", ")}.` : "";
    if (!r.added.length) return text(`Nothing new.${skipped}`);
    return text(`Added ${r.added.length}: ${r.added.map((a) => `${a.id} (${assetLine(a)})`).join("; ")}.${skipped}`);
  },
);

server.registerTool(
  "generate_sfx",
  {
    description:
      "Make a sound effect from a description with the person's ElevenLabs key (\"crowd cheering in a small office\", \"3D printer nozzle whirring\"), added as an asset for /sfx cues. The built-in sounds (list_kit) cover whooshes, pops, ticks, impacts and the like without spending anything.",
    inputSchema: { project: projectArg, prompt: z.string(), seconds: z.number().min(0.5).max(30).optional(), label: z.string().optional() },
  },
  async ({ project: id, prompt, seconds, label }) => {
    const a = await generateSfx(id, { prompt, seconds, label });
    return text(`Made ${a.id} (${a.duration?.toFixed(1)}s). Use it as {"id":"…","sound":"${a.id}","at":{…}} in /sfx.`);
  },
);

server.registerTool(
  "fit_music",
  {
    description:
      "Fit the cut's song so its own ending lands on the cut's last frame: it plays from the top, jumps on a bar line to the stretch that leads into the song's real ending, and the cut ends with the last chord. Run it once the cut's length is settled (after the narration). Writes the music cues and the cut's end.",
    inputSchema: {
      project: projectArg,
      cut: cutArg,
      length: z.number().optional().describe("Seconds; default how long the cut runs now"),
      from: z.number().optional().describe("Seconds into the song to start from; default the first cue's"),
    },
  },
  async ({ project: id, cut, length, from }) => {
    let summary = "";
    updateProject(
      id,
      (p) => {
        const cue = p.music?.cues[0];
        const song = p.assets.find((a) => a.id === cue?.asset);
        if (!cue || !song?.grid || !song.duration) throw new Error("The cut needs a song with a beat grid first (set_song or generate_music)");
        // A cut timed by its shots runs as long as its picture, not as long as the song now under it.
        const tl = resolveTimeline(p);
        const picture = p.tracks.find((t) => t.kind === "picture")?.id;
        const lastShot = Math.max(0, ...tl.shots.filter((s) => s.track === picture && Number.isFinite(s.end)).map((s) => s.end));
        const want = length ?? (p.spine === "shots" && lastShot > 0 ? lastShot : tl.duration);
        const start = from ?? cue.from ?? 0;
        const fit = fitSong({ grid: song.grid, duration: song.duration }, want, start);
        p.music = {
          ...p.music!,
          cues: fit.whole
            ? [{ id: "m1", asset: song.id, from: start, fadeOut: 0.5 }]
            : [
                { id: "m1", asset: song.id, from: start, to: fit.headEnd, fadeOut: 0.04 },
                { id: "m2", asset: song.id, from: fit.tailStart, start: { kind: "time", t: Math.round((fit.headEnd - start) * 1000) / 1000 }, fadeIn: 0.04 },
              ],
        };
        p.end = { kind: "time", t: fit.total };
        summary = fit.whole
          ? `The song fits as it is from ${formatTime(start)}: the cut ends with it at ${formatTime(fit.total)}.`
          : `Plays ${formatTime(start)}–${formatTime(fit.headEnd)} of the song, then jumps to ${formatTime(fit.tailStart)} so its ending lands at ${formatTime(fit.total)} (asked for ${formatTime(want)}). The cut now ends there.`;
      },
      cut,
    );
    return text(summary);
  },
);

server.registerTool(
  "review_cut",
  {
    description:
      "Look over the whole cut before handing it back: a contact sheet (one frame every second or two, read left to right, row by row) and what a viewer would notice: pictures that sit still too long, silence, uncropped footage, narration without captions, no sound design, the length. Then the design pass: the designed shots larger (entering, midway, settled) to critique as a design lead would. Takes a minute or two. Fix what matters, then hand off.",
    inputSchema: { project: projectArg, cut: cutArg, format: z.string().optional() },
  },
  async ({ project: id, cut, format }) => {
    const r = await reviewCut(id, { cut, format });
    const head = `Contact sheet: one frame every ${r.every}s, ${r.columns} to a row (the first row is 0:00–${formatTime(r.every * r.columns)}). The cut runs ${formatTime(r.duration)}.`;
    const content: ({ type: "image"; data: string; mimeType: string } | { type: "text"; text: string })[] = [
      { type: "image", data: r.sheet.toString("base64"), mimeType: "image/jpeg" },
      { type: "text", text: `${head}\n${r.notes.length ? r.notes.map((n) => `- ${n}`).join("\n") : "Nothing stands out."}` },
    ];
    if (r.designs) {
      content.push({ type: "image", data: r.designs.toString("base64"), mimeType: "image/jpeg" });
      content.push({ type: "text", text: [`Design pass: the designed shots, a row each, entering, midway and settled:`, ...r.designRows!.map((d, i) => `${i + 1}. ${d}`), ...r.designNotes.map((n) => `- ${n}`), DESIGN_CRITIQUE].join("\n") });
    }
    return { content };
  },
);

/** How to judge the designed shots: what a design lead looks for before a client sees them. */
const DESIGN_CRITIQUE = `Critique these as a design lead would before a client sees them, row by row:
- Is it unmistakably this brand and this product, or could it be anyone's video? Real names, numbers, photos, parts and screens beat generic shapes.
- One focal point per frame, and a clear order to read things in.
- Type: big size contrast between levels, short lines, generous margins, nothing cramped, clipped or fighting the captions.
- Colour: the look's palette, one highlight used sparingly.
- Motion: lands on the word or beat, eased to suit the brand (precise, playful, calm); no effect for its own sake.
- Craft: the detail that makes it feel made (lines that draw on, depth and light, texture, alignment to a grid), not default boxes.
Name the three weakest things and fix them, then look again with frame. If you can start a subagent, have it look at these shots with frame and the brand's references and name the three weakest things without your reasoning: a fresh eye is harsher.`;

const tone = (w: { l: number; c: number }) => `${w.l > 0.75 ? "light" : w.l < 0.35 ? "dark" : "mid"}, ${w.c < 0.04 ? "muted" : w.c > 0.1 ? "vivid" : "soft"}`;
const MOOD = (m: { light: number; warmth: number; colour: number }) =>
  [m.light > 0.68 ? "bright" : m.light < 0.45 ? "dark" : "mid-toned", m.warmth > 0.012 ? "warm" : m.warmth < -0.012 ? "cool" : "neutral in temperature", m.colour > 0.085 ? "colourful" : m.colour < 0.045 ? "muted" : "moderately colourful"].join(", ");

server.registerTool(
  "palette",
  {
    description:
      "The footage's own colours, for a look that comes from it (a beach trip in its sand, sea and towel colours rather than anyone's brand): its main colours by how much of the footage each is, its vivid colours however small (a red bucket on a grey beach), how light, warm and colourful it is overall, and a look's colours suggested from it (paper and ink from its light and dark tones, accents from its most vivid colours, lifted to read as highlights). From the cut's pictures, else the keepers, else all; or name the assets (the shots of one place, say).",
    inputSchema: { project: projectArg, cut: cutArg, assets: z.array(z.string()).optional().describe("The pictures to read; default the cut's, else the keepers") },
  },
  async ({ project: id, cut, assets }) => {
    const p = await footagePalette(id, { cut, assets });
    const lines = [
      `From ${p.assets.length} pictures. Overall it's ${MOOD(p.mood)} (lightness ${p.mood.light.toFixed(2)}, warmth ${p.mood.warmth.toFixed(3)}, colour ${p.mood.colour.toFixed(3)}).`,
      "Its colours, most of the footage first (the top band of the picture):",
      ...p.swatches.map((w) => `- ${w.hex} ${(w.share * 100).toFixed(0)}% · ${tone(w)}`),
      p.vivid.length ? `Its vivid colours, however small (the middle band): ${p.vivid.map((w) => `${w.hex} ${(w.share * 100).toFixed(1)}%`).join(", ")}` : "Nothing in it is vivid.",
      `A look's colours from it (the bottom band): ${JSON.stringify(p.colors)}`,
      "Start there and shift them to the mood you're after (warmer, softer, bolder); keep the accent for the few things that should catch the eye.",
    ];
    return { content: [{ type: "image" as const, data: p.image.toString("base64"), mimeType: "image/png" }, { type: "text" as const, text: lines.join("\n") }] };
  },
);

server.registerTool(
  "preview_looks",
  {
    description:
      "See candidate looks on the project's own footage before choosing: for each, the hero picture in its grade with a title over it, then a designed card in its colours and fonts (the kit's title, or a scene of yours), then its colours. Saves one image per look in the project (made/looks/) to give a choose hand-off's options as `image`, and shows them all side by side. Nothing in the cut changes; set the chosen one with edit_project on /look.",
    inputSchema: {
      project: projectArg,
      cut: cutArg,
      format: z.string().optional(),
      looks: z.array(z.object({ id: z.string().describe("Short, e.g. sunny"), label: z.string().optional(), look: Look })).min(1).max(4),
      asset: z.string().optional().describe("The picture to show them on; default the best-rated one in the cut"),
      title: z.string().optional().describe("The title to set in each look; default the project's"),
      subtitle: z.string().optional().describe("A line above it on the card, e.g. the place and the year"),
      scene: z.object({ component: z.string(), props: z.record(z.string(), z.unknown()).optional() }).optional().describe("Your own title scene to show instead of the kit's"),
    },
  },
  async ({ project: id, cut, format, looks, asset, title, subtitle, scene }) => {
    const { dir } = loadProject(id, cut);
    const r = await previewLooks(id, { cut, format, looks, asset, title, subtitle, scene });
    const rel = r.files.map((f) => relative(dir, f));
    const say = [
      `Left to right: ${looks.map((l, i) => `${l.label ?? l.id} (${rel[i]})`).join(", ")}. Each is the footage (${r.hero}) in the look's grade with a title, then a card, then its colours.`,
      'Look hard before offering them: is each one right for this footage and this occasion, and are they really different from each other? Then hand_off kind "choose" with each option\'s image set to its file, or set the one that clearly fits.',
    ].join("\n");
    return { content: [{ type: "image" as const, data: r.sheet.toString("base64"), mimeType: "image/png" }, { type: "text" as const, text: say }] };
  },
);

server.registerTool(
  "add_font",
  {
    description:
      "Get a font from Google Fonts for the look (any family on fonts.google.com: Fredoka or Nunito for round and friendly, Caveat or Kalam for handwriting, Playfair Display or DM Serif Display for elegant, Bricolage Grotesque or Space Grotesk for modern, Bebas Neue or Anton for tall and loud). It's saved in the project's fonts/ folder; put the entries it returns in the look's fontFiles and the family in fonts.display or fonts.body. " + SYSTEM_FONTS,
    inputSchema: {
      project: projectArg,
      family: z.string().describe("As Google Fonts names it, e.g. Playfair Display"),
      weights: z.array(z.number().int().min(100).max(900)).optional().describe("Default 400 and 700"),
      italic: z.boolean().optional(),
    },
  },
  async ({ project: id, family, weights, italic }) => {
    const files = await addFont(id, family, { weights, italic });
    return text(`Saved ${files.length} file${files.length === 1 ? "" : "s"}. Add to the look's fontFiles: ${JSON.stringify(files)}, and use "${family}" in fonts.display or fonts.body (with a fallback, e.g. "${family}, Helvetica Neue, sans-serif").`);
  },
);

server.registerTool(
  "generate_music",
  {
    description:
      "Make a song for a cut with the person's ElevenLabs key: describe genre, mood, instruments and tempo (\"punchy synth-pop, 124 BPM, bright, a big drop around 8s\"), and give a length a few seconds over the cut's. It's saved in the project, analysed for beats and sections like any song, and becomes the cut's music (use: false to only add it). Takes a minute or two and spends the person's ElevenLabs credits, so make one song unless asked for options. Run first_cut afterwards.",
    inputSchema: {
      project: projectArg,
      cut: cutArg,
      prompt: z.string().describe("Genre, mood, instruments, tempo, structure"),
      seconds: z.number().min(3).max(600).optional().describe("Length; default the model's choice"),
      instrumental: z.boolean().optional().describe("Default true: no vocals"),
      label: z.string().optional().describe("A name for it"),
      use: z.boolean().optional().describe("Make it the cut's music (default true)"),
    },
  },
  async ({ project: id, cut, prompt, seconds, instrumental, label, use }) => {
    const a = await generateMusic(id, { prompt, seconds, instrumental, label, cut, use });
    return text(
      `Made "${a.label}" (${a.id}): ${a.duration ? formatTime(a.duration) : "?"}, ${a.grid?.bpm} BPM, sections ${a.sections?.map((s) => `${s.label} (${s.id}) at ${formatTime(s.start)}`).join(", ")}.${
        use === false
          ? " Added to the project's music."
          : // A cut timed by its own shots keeps them; first_cut would rebuild it from footage.
            loadProject(id, cut).project.spine === "shots"
            ? " It's the cut's music now; run fit_music so its ending lands on the last shot."
            : " It's the cut's music now; run first_cut to cut to it."
      }`,
    );
  },
);

// ---- Making pictures and video: what could make something, making it, and where it's got to.
const makeArgs = {
  project: projectArg,
  cut: cutArg,
  op: z.enum(MAKE_OPS).describe("image: a still (a shot's board, a cast member's sheet); video: a clip"),
  shot: z
    .string()
    .optional()
    .describe("A placeholder or generated shot to make it for: the shot's length, the cut's shape and the shot's description fill in what isn't given, and the takes land on the shot"),
  shots: z.array(z.string()).optional().describe("Several shots at once, the same request for each: a pass of boards, or clips from each one's board (start: \"board\")"),
  sheet: z.string().optional().describe("A cast member (cat, or cat/heist for a variant) to make a reference sheet for: the stills join its pictures. Without a prompt, clean views of it"),
  prompt: z.string().optional().describe("What to make; default the shot's description. Name cast and sets with @id (@cat, @cat/heist): they're described to the model, and stills are given their pictures. For video, say what moves and how the camera does"),
  cast: z.array(z.string()).optional().describe("Cast and sets in it that the prompt doesn't name"),
  quality: z.enum(["rough", "final"]).optional().describe("For video: rough (default; fast and cheap, to judge the cut) or final (the best model, once the cut holds)"),
  start: z.string().optional().describe('The picture a video starts from: an asset id, or "board" for each shot\'s chosen still'),
  end: z.string().optional().describe("Asset id of a picture a video ends on"),
  refs: z.array(z.string()).optional().describe("Asset ids of reference pictures, instead of the cast's own"),
  seconds: z.number().positive().optional().describe("How long it has to play; default the shot's length"),
  aspect: z.string().optional().describe('Its shape, like "9:16"; default the cut\'s first format'),
};
type MakeToolArgs = { cut?: string; op: (typeof MAKE_OPS)[number]; shot?: string; shots?: string[]; sheet?: string; prompt?: string; cast?: string[]; quality?: "rough" | "final"; start?: string; end?: string; refs?: string[]; seconds?: number; aspect?: string; count?: number; model?: string; via?: string };
/** One request per shot when there are several, else the one. */
const asksFor = ({ shots, ...ask }: MakeToolArgs): MakeAsk[] => (shots?.length ? shots.map((shot) => ({ ...ask, shot })) : [ask]);
const usd = (x?: number) => (x === undefined ? "" : `about $${x.toFixed(2)}`);
const minutes = (s?: number) => (s === undefined ? "" : s < 90 ? `about ${Math.round(s / 10) * 10 || 10} seconds` : `about ${Math.round(s / 60)} minutes`);
/** What it costs where it runs: nothing extra on a plan. */
const costAt = (x: { route: string; usd?: number }) => (PLAN_ROUTES.includes(x.route) ? "no charge, from the plan's allowance" : usd(x.usd));
const fitLine = (f: Fit) => {
  const note = CATALOG.find((m) => m.id === f.model)?.note;
  if (!f.ok) return `- ${f.label} (${f.model}): ${f.why.reason}`;
  const also = f.also?.length ? ` Also on ${f.also.map((x) => `${x.where} (via "${x.route}", ${costAt(x)})`).join(" and ")}.` : "";
  return `- ${f.label} (${f.model}) on ${f.where} (via "${f.route}"): ${[f.seconds && `${f.seconds}s`, f.aspect, costAt(f), minutes(f.wait)].filter(Boolean).join(", ")}.${also} ${note ?? ""}`.trimEnd();
};

server.registerTool(
  "list_models",
  {
    description:
      "Which models could make a picture or a clip (for a shot, a sheet, or as described), checked against the person's services: the ones ready to use with what each would cost and how long it takes, the ones that need a key the person hasn't added, and the ones that can't make this (too short, the wrong shape, no start frame) with why. With shots, what a whole pass would cost with each model. generate uses the first ready one unless you name another.",
    inputSchema: { ...makeArgs, count: z.number().int().min(1).max(4).optional().describe("How many takes, for the estimate (default 1)") },
  },
  async ({ project: id, ...args }) => {
    const asks = asksFor(args);
    if (asks.length > 1) {
      const { rows, problems } = estimate(id, asks);
      const can = asks.length - problems.length;
      const all = (n: number) => (n === can ? (n === 2 ? "both" : `all ${n}`) : `${n} of them`);
      return text(
        [
          `For ${asks.length} shots, ${args.count ?? 1} take${(args.count ?? 1) === 1 ? "" : "s"} each${args.op === "video" ? `, ${args.quality ?? "rough"}` : ""}:`,
          ...rows
            .sort((a, b) => b.made - a.made || a.usd - b.usd)
            .map((r) => `- ${r.label} (${r.model}): ${r.made ? `${usd(r.usd)} for ${all(r.made)}` : "none of them"}${r.unfit.length ? `; can't make ${r.unfit.map((u) => `${u.shot} (${u.reason})`).join(", ")}` : ""}`),
          ...(problems.length ? ["Not counted:", ...problems.map((p) => `- ${p.reason}`)] : []),
        ].join("\n"),
      );
    }
    const { req, choices } = makeChoices(id, asks[0]!);
    const out = [
      `For ${req.op === "image" ? "a still" : `a ${req.quality ?? "rough"} clip`}${req.seconds ? ` to fill ${req.seconds}s` : ""}, ${req.start ? "from a start frame" : req.aspect}${req.count && req.count > 1 ? `, ${req.count} takes` : ""}${req.cast.length ? `, with @${req.cast.join(", @")}` : ""}: ${choices.auto ? `Auto would use ${choices.auto.label}.` : "nothing can make this now."}`,
    ];
    if (choices.ready.length) out.push("Ready:", ...choices.ready.map(fitLine));
    if (choices.setup.length) out.push("Needs something the person has to set up (Settings → Media services):", ...choices.setup.map(fitLine));
    if (choices.unfit.length) out.push("Can't make this:", ...choices.unfit.map(fitLine));
    return text(out.join("\n"));
  },
);

server.registerTool(
  "generate",
  {
    description:
      "Make pictures or video with the person's services: takes for a shot (or several shots at once), or a reference sheet for a cast member. A placeholder shot becomes a generated shot as its first take lands; the first take is the one it shows, then the first clip over a still, then the first final over a rough. The usual way: boards for every shot first (op image, cents each), then rough clips from each shot's chosen board (op video, start \"board\"), then finals with the best model once the cut holds (quality \"final\"). Makes 2 takes unless you say otherwise. Returns at once; stills land in seconds and clips in a few minutes, and jobs says where they are. Spends the person's money: refused past what a turn may spend without asking, and a pass over many shots starts all or nothing.",
    inputSchema: {
      ...makeArgs,
      count: z.number().int().min(1).max(4).optional().describe("How many takes (default 2; 1 is usual for a sheet or a final)"),
      model: z.string().optional().describe("A model id from list_models; default Auto, the first ready one of the quality asked for"),
      via: z.string().optional().describe('Where to make it, when list_models says a model runs in more than one place (a plan like "chatgpt" or a key like "openai"); default the cheapest ready one'),
    },
  },
  async ({ project: id, ...args }) => {
    const spendable = turnBudget() - spentThisTurn(id);
    const { plans, usd: total } = startMakeAll(id, asksFor({ ...args, count: args.count ?? 2 }), { spendable });
    const what = (p: (typeof plans)[number]) => (p.ask.shot ? `shot ${p.ask.shot}` : p.ask.sheet ? `a sheet for @${p.ask.sheet}` : args.op === "image" ? "a still" : "a clip");
    const lines = plans.map(
      (p) =>
        `- ${p.jobs.length} take${p.jobs.length === 1 ? "" : "s"} of ${what(p)} with ${p.fit.label}: ${[p.fit.seconds && `${p.fit.seconds}s`, p.fit.aspect, usd(p.fit.usd)].filter(Boolean).join(", ")}. Jobs ${p.jobs.map((j) => j.id).join(", ")}.`,
    );
    const where = args.sheet ? "They join its pictures as they finish." : args.shot || args.shots?.length ? "They land on the shots as their takes as they finish." : "They land in the project's assets as they finish.";
    return text([`Making ${usd(total) || "it"} in all, ${minutes(Math.max(...plans.map((p) => p.fit.wait ?? 0)))}:`, ...lines, `${where} Call jobs with wait to see them come in.`].join("\n"));
  },
);

server.registerTool(
  "jobs",
  {
    description:
      "Where the pictures and clips being made have got to: waiting in the service's queue, being made, done (with the take's asset id) or failed (with why). Without ids, the unfinished ones and those from the last hour. wait holds until the ones listed are finished or that many seconds pass. cancel stops the ones listed.",
    inputSchema: {
      project: projectArg,
      ids: z.array(z.string()).optional().describe("Job ids, or the id that takes asked for together share"),
      wait: z.number().min(0).max(300).optional().describe("Seconds to wait for them to finish"),
      cancel: z.boolean().optional().describe("Stop them (one already being made may still be charged)"),
      retry: z.boolean().optional().describe("Try the failed ones again: one the service had made is fetched again for free; one it never made is sent again, and costs again"),
    },
  },
  async ({ project: id, ids, wait, cancel, retry }) => {
    void driveJobs(id);
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const pick = () => {
      const all = listJobs(id);
      return ids?.length ? all.filter((j) => ids.includes(j.id) || ids.includes(j.batch)) : all.filter((j) => isOpen(j) || j.updatedAt >= hourAgo).slice(-20);
    };
    if (cancel) await cancelJobs(id, pick().map((j) => j.id));
    if (retry) retryJobs(id, pick().map((j) => j.id));
    const until = Date.now() + (wait ?? 0) * 1000;
    while (Date.now() < until && pick().some(isOpen)) await new Promise((r) => setTimeout(r, 2000));
    const list = pick();
    if (!list.length) return text(ids?.length ? `No jobs ${ids.join(", ")} in this project.` : "Nothing is being made, and nothing was in the last hour.");
    const open = list.filter(isOpen).length;
    return text([...list.map(describeJob), open ? `${open} still going.` : "All finished."].join("\n"));
  },
);

server.registerTool(
  "edit_project",
  {
    description:
      'Change a cut with JSON Patch operations (add, remove, replace, move, copy, test). Paths are into the cut as get_project shows it: its own parts (/shots, /music, /voice, /captions, /sfx, /formats, /stages, /notes, /spec, /end) and the shared ones (/assets, /brief, /title, /look, /cast). Array elements can be addressed by id instead of index: "/shots/id=s07/start". Validated before writing; refused edits change nothing. Returns the resulting timing.',
    inputSchema: {
      project: projectArg,
      cut: cutArg,
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
  async ({ project: id, cut, ops }) => {
    const { project, version } = loadProject(id, cut);
    const doc = structuredClone(project);
    for (const op of ops) applyOp(doc, op);
    // The cut it names is the one written, whatever the ops did to `cut`.
    const saved = saveProject(id, { ...doc, cut: { ...doc.cut, id: project.cut.id } }, version);
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
    inputSchema: { project: projectArg, cut: cutArg },
  },
  async ({ project: id, cut }) => {
    const loaded = loadProject(id, cut);
    let notes = loaded.project.notes.filter((n) => n.status === "working");
    if (!notes.length) {
      const queued = new Set(loaded.project.notes.filter((n) => n.status === "queued" && n.text.trim()).map((n) => n.id));
      if (!queued.size) return text("No notes waiting.");
      const batch = `b${Date.now().toString(36)}`;
      updateProject(id, (p) => p.notes.forEach((n) => queued.has(n.id) && Object.assign(n, { status: "working", batch })), loaded.project.cut.id);
      notes = loadProject(id, loaded.project.cut.id).project.notes.filter((n) => queued.has(n.id));
    }
    const where = listProjects().find((p) => p.id === id)?.where ?? "projects";
    return text(JSON.stringify(buildBatch(loaded.project, notes, { file: `${where}/${id}/project.json` }), null, 2));
  },
);

server.registerTool(
  "resolve_note",
  {
    description: "Close a note with a one-line reply saying what changed, or hand it back open with the reason you couldn't do it.",
    inputSchema: { project: projectArg, cut: cutArg, note: z.string(), reply: z.string(), done: z.boolean().optional().describe("Default true") },
  },
  async ({ project: id, cut, note, reply, done = true }) => {
    let found = false;
    updateProject(
      id,
      (p) => {
        const n = p.notes.find((x) => x.id === note);
        if (!n) return;
        found = true;
        n.status = done ? "done" : "open";
        n.reply = reply;
      },
      cut,
    );
    return text(found ? `Note ${note} ${done ? "done" : "handed back"}.` : `No note ${note}.`);
  },
);

server.registerTool(
  "frame",
  {
    description: "See the cut: a still of the composed frame (picture, crop, text) at a time or in the middle of a shot. The first call takes ~20 s while the renderer warms up.",
    inputSchema: {
      project: projectArg,
      cut: cutArg,
      t: z.number().optional().describe("Seconds into the cut"),
      shot: z.string().optional().describe("Shot id; uses its midpoint"),
      format: z.string().optional(),
    },
  },
  async ({ project: id, cut, t, shot, format }) => {
    const { project } = loadProject(id, cut);
    const tl = resolveTimeline(project, format);
    let time = t ?? 0;
    if (shot) {
      const r = tl.shots.find((s) => s.id === shot);
      if (!r) return text(`No shot ${shot} in this format.`);
      time = (r.start + r.end) / 2;
    }
    const { renderFrame } = await import("./render.ts");
    const jpg = await renderFrame(id, { cut: project.cut.id, format, t: time });
    return { content: [{ type: "text" as const, text: `${id} · ${project.cut.name} at ${formatTime(time)}` }, { type: "image" as const, data: jpg.toString("base64"), mimeType: "image/jpeg" }] };
  },
);

server.registerTool(
  "render",
  {
    description: "Export the cut as an MP4. Drafts use the small preview copies and take seconds; final renders read the original footage.",
    inputSchema: { project: projectArg, cut: cutArg, format: z.string().optional(), draft: z.boolean().optional() },
  },
  async ({ project: id, cut, format, draft }) => {
    const { renderProject } = await import("./render.ts");
    const out = await renderProject(id, { cut, format, quality: draft ? "proxy" : "original" });
    return text(`Wrote ${out}`);
  },
);

server.registerTool(
  "create_cut",
  {
    description:
      "Make a new cut. By default it's a copy of an existing cut (shots, music and formats, without the notes) to try a variation: a bouncier take, a calmer one, another song. With fresh: true it starts empty instead, for a new attempt from the footage that doesn't lean on the other cut, or the footage at another length or shape (a 2-minute landscape version for YouTube); build it with first_cut and edit_project. Pass the new cut's id to later tools. The person can switch between cuts in the studio.",
    inputSchema: {
      project: projectArg,
      from: cutArg.describe("Cut to copy, or for a fresh cut the one whose recipe and tracks it takes; default the first"),
      name: z.string().describe('Short name the person sees, e.g. "Bouncy take"'),
      fresh: z.boolean().optional().describe("Start empty instead of copying"),
      formats: z.array(z.enum(["vertical", "landscape", "square", "portrait"])).optional().describe("Formats instead of the other cut's: vertical 9:16, landscape 16:9, square 1:1, portrait 4:5"),
      purpose: z.string().optional().describe("What this cut is for, in a line"),
      audience: z.string().optional(),
      tone: z.array(z.string()).optional(),
      targetLength: z.number().positive().optional().describe("Seconds"),
      maxLength: z.number().positive().optional(),
      why: z.string().optional().describe("Why you made it, shown with the cut"),
    },
  },
  async ({ project: id, from, name, why, fresh, formats: presets, ...spec }) => {
    let made = "";
    updateFile(id, (doc) => {
      const base = cutOf(doc, from);
      const given = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined));
      const formats = presets?.map((f) => formatPreset(f)!) ?? structuredClone(base.formats);
      const platforms = presets ? { platforms: [...new Set(formats.flatMap((f) => f.platforms ?? []))] } : {};
      const origin = { by: "agent" as const, note: why };
      const r = fresh
        ? freshCut(doc, base.id, { name, formats, spec: { platforms: base.spec.platforms, ...platforms, ...given }, origin })
        : branchCut(doc, base.id, { name, spec: { ...platforms, ...given }, origin });
      if (presets) r.cut.formats = formats;
      doc.cuts = r.file.cuts;
      made = r.cut.id;
    });
    return text(`Made cut "${made}" (${name}). Pass cut: "${made}" to work on it.\n\n${overview(id, made)}`);
  },
);

server.registerTool(
  "add_asset",
  {
    description:
      "Add a file you made or found to the project's footage: a clip you derived with ffmpeg, a generated image or video, a voiceover, a sound effect. Save it inside the project folder (projects/<id>/generated/ or derived/), then add it here with where it came from. It gets previews like imported footage and can be used in shots.",
    inputSchema: {
      project: projectArg,
      file: z.string().describe("Absolute path to the file"),
      label: z.string().optional().describe("A few words saying what it is"),
      tags: z.array(z.string()).optional(),
      rating: z.number().int().min(-1).max(5).optional(),
      source: z.enum(["generated", "synth", "recorded", "import"]).optional().describe("generated: an AI model made it; synth: you made it from other assets (ffmpeg, code)"),
      provider: z.string().optional().describe("e.g. ffmpeg, fal, elevenlabs"),
      model: z.string().optional(),
      prompt: z.string().optional().describe("The prompt, or what you did to make it"),
      refs: z.array(z.string()).optional().describe("Asset ids it was made from"),
      costUsd: z.number().optional(),
    },
  },
  async ({ project: id, file, label, tags, rating, source, provider, model, prompt, refs, costUsd }) => {
    const a = await addAsset(id, file, {
      label,
      tags,
      rating,
      provenance: { source: source ?? "generated", provider, model, prompt, refs, costUsd, createdAt: new Date().toISOString() },
    });
    return text(`Added ${a.id}: ${assetLine(a)}`);
  },
);

server.registerTool(
  "list_voices",
  {
    description:
      IS_WINDOWS
        ? "The voices narration can use on this PC, best first: ElevenLabs (with the person's key: its library and their own designed or cloned voices), Kokoro (if installed) and Windows' own (robotic; use them only when there's nothing else). Each with its id, what it sounds like, and which is the person's default."
        : "The voices narration can use on this Mac, best first: ElevenLabs (with the person's key: its library and their own designed or cloned voices), Kokoro (if installed) and the Mac's own. Each with its id, what it sounds like, and which is the person's default.",
    inputSchema: {},
  },
  async () => {
    const v = await listVoices();
    const rows = v.voices
      .filter((x) => x.provider !== "mac" || !v.mac.language || (x.language ?? "").startsWith(v.mac.language.split("-")[0]!))
      .map((x) => `- ${x.id} · ${x.name}${x.own ? ` (their own, ${x.own})` : ""}${x.detail ? ` · ${x.detail}` : ""}${x.quality ? ` · ${x.quality} quality` : ""}${x.id === v.default ? " · DEFAULT" : ""}`);
    const notes = [
      v.default ? `The person's default: ${v.default}.` : v.fallback ? `No default picked; narration uses ${v.fallback} unless you name another.` : "No voice is available.",
      v.elevenlabs.configured ? (v.elevenlabs.error ? `ElevenLabs: ${v.elevenlabs.error}` : `ElevenLabs model: ${v.model}.`) : "No ElevenLabs key (the person can add one in Settings).",
      v.kokoro.state === "ready" ? "" : "Kokoro isn't installed (Settings → Voices).",
    ].filter(Boolean);
    return text(`${notes.join(" ")}\n${rows.join("\n")}`);
  },
);

server.registerTool(
  "narrate",
  {
    description:
      "Write and voice a cut's narration. Pass the lines (id and text; ids name them for word anchors) and they're read aloud, each word timed, and placed in order from the start of the cut (leadIn, then each line with its gapAfter). Lines you don't pass are kept; replace: true makes the script exactly what you pass. Without lines, it voices the cut's lines that need it (new, changed, or in a new voice). Only changed lines are read again. Refused while the cut's structure stage is locked.",
    inputSchema: {
      project: projectArg,
      cut: cutArg,
      lines: z
        .array(
          z.object({
            id: z.string().optional().describe("Short, e.g. hook, intro, end; existing ids are rewritten"),
            text: z.string().describe("As captions show it"),
            tts: z.string().optional().describe("How to say it, when it differs (numbers, names: \"twenty twenty-six\")"),
            gapAfter: z.number().optional().describe("Seconds of quiet after it; default the cut's (0.5)"),
            holdBefore: z.number().optional().describe("Extra quiet before it, e.g. to let a title breathe"),
            only: z.array(z.string()).optional().describe("Format ids it's in; default all"),
            speaker: z.string().optional().describe('Who says it: a character\'s cast id, read in that character\'s voice (its cast entry\'s voice); "" for the narrator. Default: the narrator, in the cut\'s voice'),
          }),
        )
        .optional(),
      replace: z.boolean().optional(),
      voice: z.string().optional().describe("A voice id from list_voices; it becomes the cut's voice"),
      force: z.boolean().optional().describe("Read every line again, even unchanged ones"),
    },
  },
  async ({ project: id, cut, lines, replace, voice, force }) => {
    const r = await narrate(id, { cut, lines, replace, voice, force });
    const { project } = loadProject(id, r.cut);
    const tl = resolveTimeline(project, project.formats[0]!.id);
    const rows = tl.lines.map((l) => `- ${l.id} · ${formatTime(l.start)}–${formatTime(l.end)} · ${l.words.length} words`);
    return text(
      `Voiced ${r.voiced.length} line${r.voiced.length === 1 ? "" : "s"}${r.kept.length ? ` (${r.kept.length} unchanged)` : ""} with ${await voiceName(r.voice)} in cut ${r.cut}. The voice runs ${tl.lines.length ? `${formatTime(tl.lines[0]!.start)}–${formatTime(tl.lines.at(-1)!.end)}` : "nowhere in this format"}; the cut is ${formatTime(tl.duration)}.\n${rows.join("\n")}`,
    );
  },
);

server.registerTool(
  "find_subjects",
  {
    description:
      "Find the faces and people in clips or photos and follow each through the clip (" +
      (IS_WINDOWS ? "SAM 3.1 on this PC's graphics card, or OpenCV before it's installed" : "Apple Vision, on this Mac; about a second per clip") +
      "). Each becomes a subject on the asset (face-1, person-2…) with its box over time. Use them for effects that follow someone (blur a face, a name tag, a spotlight), a vertical reframe that keeps someone in frame (reframe.<format>.follow), or a cut-out of just them. Rename subjects with edit_project once you know who they are.",
    inputSchema: { project: projectArg, assets: z.array(z.string()).min(1).max(12) },
  },
  async ({ project: id, assets }) => {
    const lines: string[] = [];
    for (const assetId of assets) {
      const found = await findSubjects(id, assetId);
      lines.push(`${assetId}: ${found.length ? found.map(subjectLine).join(", ") : "no faces or people"}`);
    }
    return text(lines.join("\n"));
  },
);

server.registerTool(
  "track_subject",
  {
    description:
      "Follow anything through a clip, starting from a box around it at one moment (look with frame first to place the box): a dog, a ball, a car, a face find_subjects missed. It's followed both ways from there until it leaves the frame, and kept as a subject on the asset.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      at: z.number().describe("Seconds into the file where the box is right"),
      box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).describe("0..1 of the picture as displayed, origin top-left"),
      label: z.string().describe("What it is, e.g. \"Biscuit the dog\""),
      kind: z.enum(["face", "person", "object"]).optional(),
    },
  },
  async ({ project: id, asset, at, box, label, kind }) => {
    const t = await trackSubject(id, asset, { at, box, label, kind });
    return text(t.samples.length > 1 ? `Following ${subjectLine(t)}` : `Kept ${subjectLine(t)} (a photo, so one box)`);
  },
);

server.registerTool(
  "join_subjects",
  {
    description:
      "Join subjects that are the same person or thing seen at different times (someone who left the frame and came back, or a face found in two pieces) into one, keeping the first one's id and name. Effects and reframes in every cut that followed the others follow it instead.",
    inputSchema: { project: projectArg, asset: z.string(), keep: z.string().describe("Subject id to keep"), others: z.array(z.string()).min(1) },
  },
  async ({ project: id, asset, keep, others }) => {
    const t = joinSubjects(id, asset, keep, others);
    return text(`Joined into ${subjectLine(t)}`);
  },
);

server.registerTool(
  "cast_from_subject",
  {
    description:
      "Put someone (or something) found in a clip or photo into the cast: a new character (a prop for a thing), or more of one already there (`into`). Stills of them are cut where they're largest (from a clip, up to three moments apart, for other angles), with room around a face, and the member is seen in the clip and the stills, so sheets and boards keep them. Find them first with find_subjects (or track_subject), and name the subject if you know who it is: a named subject gives the member its name and @id.",
    inputSchema: { project: projectArg, asset: z.string(), subject: z.string().describe("Subject id in the asset"), into: z.string().optional().describe("A cast member's id to add them to, instead of making a new one") },
  },
  async ({ project: id, asset, subject, into }) => {
    const r = await castFromSubject(id, { asset, subject, into });
    return text(
      `@${r.member} is seen in ${asset} and in ${r.stills.length === 1 ? `the still ${r.still}` : `${r.stills.length} stills from moments apart (${r.stills.join(", ")})`}.${r.voice ? ` They're the one talking while they're on screen (${r.voice} in its transcript), so that voice is theirs too.` : ""} Describe them in /cast (about), then make their sheet with generate (sheet: "${r.member}").`,
    );
  },
);

server.registerTool(
  "transcribe",
  {
    description:
      "Transcribe what's said in a clip or sound file: every word with its time, and who said it when the transcriber can tell. Auto picks what suits this computer: Whisper here when it's installed and quick (and it tells speakers apart too when Who's speaking is installed with it, keeping a family tape private), otherwise a service with the person's key (ElevenLabs Scribe, which tells speakers apart and marks laughter and applause; OpenAI's Whisper). Without `with`, say what you need: speakers: true when it matters who said what (a family tape, an interview). Services cost a little (about 22¢ to 36¢ an hour of audio). Read it back with transcript.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      with: z.enum(["whisper", "scribe", "openai-whisper"]).optional().describe("A transcriber; default Auto, the best this computer can use now"),
      speakers: z.boolean().optional().describe("Only a transcriber that tells speakers apart"),
      people: z.number().int().min(1).max(32).optional().describe("How many people speak in it, when you know (it helps tell them apart)"),
    },
  },
  async ({ project: id, asset, with: by, speakers, people }) => {
    const { transcribeAsset, transcriptLines } = await import("./transcribe.ts");
    const { transcript: t, choice } = await transcribeAsset(id, asset, { with: by, speakers, people, spendable: turnBudget() - spentThisTurn(id) });
    const lines = transcriptLines(t);
    const voices = new Set(t.words.map((w) => w.speaker).filter(Boolean)).size;
    return text(
      [
        `${asset}: ${t.words.length} words in ${lines.length} lines${t.language ? `, in ${t.language}` : ""}${voices ? `, ${voices} speaker${voices === 1 ? "" : "s"}` : ""}, by ${choice.label}${choice.where ? ` ${choice.where}` : ""}${t.costUsd ? ` (about $${t.costUsd.toFixed(2)})` : ""}.`,
        ...lines.slice(0, 12).map((l) => `- ${formatTime(l.s)}${l.speaker ? ` ${l.speaker}` : ""}: ${l.text}`),
        ...(lines.length > 12 ? [`… transcript has the rest (search it, or ask for a stretch with from/to).`] : []),
      ].join("\n"),
    );
  },
);

server.registerTool(
  "transcript",
  {
    description:
      "What was said in a transcribed clip, a line at a time: when, who (a cast member when the speaker has been named, @grandpa, else speaker_0…) and the words. Narrow it to a stretch (from, to, in seconds), to the lines that have every word of `search`, or to what one person said (`who`: a cast id or a speaker label), to find a line that fits.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      from: z.number().optional(),
      to: z.number().optional(),
      search: z.string().optional(),
      who: z.string().optional().describe("Only this person's lines: a cast id (grandpa) or a speaker label (speaker_1)"),
    },
  },
  async ({ project: id, asset, from, to, search, who }) => {
    const { readTranscript, transcriptLines } = await import("./transcribe.ts");
    const t = readTranscript(id, asset);
    if (!t) return text(`${asset} hasn't been transcribed; transcribe it first.`);
    const { project } = loadProject(id);
    const name = (speaker?: string) => {
      if (!speaker) return "";
      const m = whoSpeaks(project.cast, asset, speaker);
      return m ? ` @${m.id}` : ` ${speaker}`;
    };
    const lines = transcriptLines(t, { from, to, search }).filter((l) => !who || l.speaker === who || whoSpeaks(project.cast, asset, l.speaker ?? "")?.id === who.replace(/^@/, ""));
    if (!lines.length) return text(search || who ? `Nothing in ${asset} matches.` : "Nothing said in that stretch.");
    const shown = lines.slice(0, 200);
    return text([...shown.map((l) => `- ${formatTime(l.s)}–${formatTime(l.e)}${name(l.speaker)}: ${l.text}`), ...(lines.length > shown.length ? [`(${lines.length - shown.length} more; narrow it with from/to)`] : [])].join("\n"));
  },
);

server.registerTool(
  "name_speaker",
  {
    description:
      "Say who a speaker in a clip's transcript is: someone in the cast (cast), or someone new (name), who's added to the cast as a character. Then the same voice is looked for in the project's other transcribed clips and named there too (where who's speaking is installed beside Whisper on this computer). Use it when the person tells you who's who, or when it's plain from what's said (\"Happy birthday, Grandpa!\"). Pass neither to take a name off.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      speaker: z.string().describe("The speaker's label in the transcript: speaker_0"),
      cast: z.string().optional().describe("A cast member's id"),
      name: z.string().optional().describe("Someone not in the cast yet: Grandpa"),
    },
  },
  async ({ project: id, asset, speaker, cast, name }) => {
    const { nameSpeaker, findVoices, followPeople } = await import("./heard.ts");
    const member = nameSpeaker(id, asset, speaker, { cast, name });
    if (!member) return text(`${speaker} in ${asset} has no name now.`);
    const r = await findVoices(id, { members: [member] });
    const more = await followPeople(id, [asset, ...r.found.map((f) => f.asset)]);
    const where = [...r.found, ...more.found].map((f) => `${f.asset} (${f.speaker})`);
    const faces = more.joined.filter((j) => j.member === member && j.by === "voice").map((j) => `${j.subject} in ${j.asset}`);
    return text(
      `${speaker} in ${asset} is @${member}.${where.length ? ` Heard them in ${where.join(", ")} too.` : r.why ? ` (${r.why}.)` : " Not heard in any other transcribed clip."}${faces.length ? ` Their face: ${faces.join(", ")}.` : ""}`,
    );
  },
);

server.registerTool(
  "split_at_cuts",
  {
    description:
      "Find the shots inside one long clip (a tape transferred whole, a DVD, an old film): where the picture changes all at once is a cut, and each stretch between cuts becomes a moment on the clip, shot-1, shot-2… Splitting again replaces those and keeps moments marked by hand. Log each shot like a file of its own (look_at_assets shows the clip; label the moments), and start clip shots on them with moment anchors.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      threshold: z.number().min(0.05).max(0.9).optional().describe("How sudden a change counts as a cut, 0..1; default 0.3. Lower finds more (soft cuts, dissolves), higher fewer (noisy tape)"),
    },
  },
  async ({ project: id, asset, threshold }) => {
    const { splitAtCuts } = await import("./shotsplit.ts");
    const shots = await splitAtCuts(id, asset, { threshold });
    return text(`${shots.length} shot${shots.length === 1 ? "" : "s"} in ${asset}:\n${shots.map((s) => `- ${s.id}: ${formatTime(s.t)}–${formatTime(s.end!)}`).join("\n")}`);
  },
);

server.registerTool(
  "clean_sound",
  {
    description:
      "Clean the voices in a clip's sound (tape hiss, wind, hum): clips of it play the cleaned sound from then on, and the file itself stays as it was. Auto picks what suits this computer: DeepFilterNet here (free, on the processor, many times faster than the clip plays) once it's installed in Settings → Restoring, else ElevenLabs' Voice Isolator with the person's key (12¢ a minute). Both take out everything that isn't a voice, the film's music too, so transcribe the clip first: then only the stretches where people talk are cleaned, and music and sounds between the lines stay. light (the default) keeps a little of the room; full takes out everything but the voices (the Voice Isolator is always full). Cleaning again with the same cleaner only mixes again (quick); off: true goes back to the clip's own sound.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      with: z.enum(["deepfilter", "isolator"]).optional().describe("A cleaner; default Auto"),
      strength: z.enum(["light", "full"]).optional(),
      everywhere: z.boolean().optional().describe("Clean all of it, not just where people talk (it has no music, or it's all talk)"),
      again: z.boolean().optional().describe("Clean the voices again rather than reuse the ones cleaned before"),
      off: z.boolean().optional().describe("Back to the clip's own sound"),
    },
  },
  async ({ project: id, asset, with: by, strength, everywhere, again, off }) => {
    const { cleanSound, uncleanSound } = await import("./clean.ts");
    if (off) {
      uncleanSound(id, asset);
      return text(`${asset} plays its own sound again (the cleaned voices are kept, so cleaning it again is quick).`);
    }
    const r = await cleanSound(id, asset, { with: by, strength, everywhere, again, spendable: turnBudget() - spentThisTurn(id) });
    return text(
      `${asset}'s voices are cleaned (${r.asset.cleaned!.strength}) by ${r.choice.label}${r.choice.where ? ` ${r.choice.where}` : ""}${r.reused ? " (the voices cleaned before, mixed again)" : ""}${r.costUsd ? `, about $${r.costUsd.toFixed(2)}` : ""}: ${r.spans ? `only where people talk (${r.spans} stretch${r.spans === 1 ? "" : "es"}), the rest as it was` : "all of it (transcribe it first to clean only where people talk)"}. Its clips play the cleaned sound now.`,
    );
  },
);

server.registerTool(
  "restore",
  {
    description:
      "Restore a stretch of old footage (a tape, a DVD, a camcorder file), faithfully: the same frames, made cleaner (denoise), steadier (steady: each shot on its own, a cut starts it over; it zooms in a little to hide the edges), smoother (fps: frames made in between, at most twice as many, by RIFE here) and bigger (upscale 2 or 4: Real-ESRGAN on this computer's graphics card, free, or SeedVR2 on fal, which restores detail better and costs $0.001 a megapixel made, so about $2 a minute of 240p footage at 4×). It makes a version of the clip, in step with it: with use: true the cut's clip shots of the clip that it covers show it (content.version), keeping the clip's own sound, subjects and words. Restore what the cut uses (from/to), not a whole tape: on this PC 4× takes about five times as long as the stretch plays. estimate: true says what it would take without doing it.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      from: z.number().nonnegative().optional().describe("Seconds into the clip; default its start"),
      to: z.number().positive().optional().describe("Seconds into the clip; default its end"),
      denoise: z.enum(["light", "strong"]).optional(),
      steady: z.boolean().optional(),
      upscale: z.union([z.literal(2), z.literal(4)]).optional(),
      fps: z.number().positive().optional().describe("Frames a second to make it, e.g. 30 from 15, or 60 from 30"),
      with: z.enum(["realesrgan", "seedvr"]).optional().describe("The upscaler; default Auto"),
      use: z.boolean().optional().describe("Show it in the cut's clip shots it covers"),
      cut: cutArg,
      estimate: z.boolean().optional(),
    },
  },
  async ({ project: id, asset, from, to, denoise, steady, upscale, fps, with: by, use, cut, estimate: only }) => {
    const { restoreClip, restorePlan } = await import("./restore.ts");
    const { restoreWords } = await import("@beatsheet/schema");
    const steps = { ...(denoise ? { denoise } : {}), ...(steady ? { steady } : {}), ...(upscale ? { upscale } : {}), ...(fps ? { fps } : {}) };
    const plan = await restorePlan(id, asset, { from, to, steps, upscaleWith: by });
    const takes = [plan.upscaler, plan.frames].filter((c) => c?.seconds).reduce((s, c) => s + c!.seconds!, 0);
    const what = `${formatTime(plan.from)}–${formatTime(plan.to)} of ${asset}, ${restoreWords(steps)}${plan.size.width ? ` (${plan.size.width}×${plan.size.height}${plan.size.fps ? ` at ${plan.size.fps} fps` : ""})` : ""}`;
    const how = `${plan.upscaler ? `${plan.upscaler.label}${plan.upscaler.where ? ` ${plan.upscaler.where}` : ""}` : "ffmpeg"}${takes ? `, about ${Math.max(1, Math.round(takes / 60))} min` : ""}${plan.usd ? `, about $${plan.usd.toFixed(2)}` : ", free"}`;
    if (only) return text(`Restoring ${what}: ${how}.`);
    const r = await restoreClip(id, asset, { from, to, steps, upscaleWith: by, ...(use ? { use: { cut } } : {}), spendable: turnBudget() - spentThisTurn(id) });
    return text(
      `${r.asset.id} is ${what}, a version of ${asset} (${how}; took ${r.seconds < 90 ? `${r.seconds}s` : `${Math.round(r.seconds / 60)} min`}).${r.shots.length ? ` Shown in ${r.shots.join(", ")}.` : use ? " No clip shot of it in the cut is inside that stretch." : ` Show it in a clip shot of ${asset} with content.version: "${r.asset.id}" (or restore with use: true).`}`,
    );
  },
);

server.registerTool(
  "still_from_clip",
  {
    description:
      "Cut a still from a clip into the project: its last frame (to carry a clip on, start the next one from it with generate's start), or a moment in it (at) to animate or give a sheet. Asked twice for the same frame, it gives back the still it already made.",
    inputSchema: { project: projectArg, asset: z.string().describe("The clip"), at: z.number().nonnegative().optional().describe("Seconds into the clip; default its last frame") },
  },
  async ({ project: id, asset, at }) => {
    const { stillFromClip } = await import("./frames.ts");
    const still = await stillFromClip(id, asset, at);
    return text(`${still.id}: ${still.label}. Start a clip from it with generate (op "video", start "${still.id}").`);
  },
);

server.registerTool(
  "cut_out",
  {
    description:
      "Lift subjects out of a photo or clip into new transparent assets (" +
      (IS_WINDOWS ? "SAM 3.1 on this PC's graphics card: people, a subject, a point, or with `prompt` anything you describe, in photos and clips alike" : "Apple Vision on this Mac; with `prompt`, anything you describe, through SAM") +
      "), saved in the project and added to the footage. A cut-out lines up exactly over its source when both are on screen, which makes these possible: a title tucked behind someone (picture: the clip; text: the title; an overlay track above: the cut-out), pieces of a photo popping in one by one on the beat (the photo on the picture track, then each piece on its own overlay track with transition {kind: \"pop\"}), or a person popping out of a freeze frame. For clips the cut-out is a clip (up to 30s; pick the stretch with from/to); a still of one moment of a clip with `still`.",
    inputSchema: {
      project: projectArg,
      asset: z.string(),
      mode: z.enum(["people", "subject"]).optional().describe("people: people only (default); subject: whatever stands out, people, pets or things"),
      subject: z.string().optional().describe("Only this subject (from find_subjects or track_subject); followed frame by frame in a clip"),
      each: z.boolean().optional().describe("Photos and stills: one cut-out per person or thing, largest first"),
      point: z.object({ x: z.number(), y: z.number() }).optional().describe("Photos and stills: lift what's at this point"),
      still: z.number().optional().describe("Clips: a still cut-out of the frame at this second"),
      from: z.number().optional().describe("Clips: start, seconds into the file"),
      to: z.number().optional(),
      prompt: z
        .string()
        .optional()
        .describe(
          IS_WINDOWS
            ? "Describe what to lift (SAM 3.1), e.g. \"the red kite\" or \"the kids\". Photos, stills, or a moving cut-out of a clip. Needs SAM 3.1 installed on this PC (Settings), or a fal key for photos"
            : "Describe what to lift (SAM), e.g. \"the red kite\" or \"the kids\". Photos, or a clip with `still`. Needs SAM 3 installed on this Mac (Settings), or a fal key for photos",
        ),
    },
  },
  async ({ project: id, asset, ...opts }) => {
    const made = await cutOut(id, asset, opts);
    return text(`Made ${made.length} cut-out${made.length === 1 ? "" : "s"}:\n${made.map((a) => `- ${assetLine(a)}`).join("\n")}\nUse them in clip shots like any asset; they line up over ${asset} when it's on screen.`);
  },
);

server.registerTool(
  "hand_off",
  {
    description:
      'End your turn and hand it to the person, with exactly what you need from them. "choose": 2-6 options (directions, takes, songs, looks), each a few words plus a sentence; set multiple when they may pick several, and point an option at a cut, assets or an image that shows it. A second question that belongs with the first (the look to go with the directions) goes in questions, on the same card. "review": a cut is playable and you want their notes. "provide": you need something only they have (a song, more footage, some text, or their signed-in Chrome for a page behind a login). "cast": you\'ve sorted the Library into who and what recurs (the cat in 14 photos, the house in 9); each proposal is a cast member with the pictures it\'s in, and the ones they keep are in the cast before their answer reaches you. Call it last; their answer comes back as your next message.',
    inputSchema: {
      project: projectArg,
      cut: cutArg,
      kind: z.enum(["choose", "review", "provide", "cast"]),
      message: z.string().describe("What you're asking, in a sentence or two"),
      options: z.array(OPTION).optional().describe('For "choose"'),
      multiple: z.boolean().optional().describe('For "choose": they may pick more than one'),
      questions: z
        .array(z.object({ id: z.string(), message: z.string(), options: z.array(OPTION).min(2).max(6), multiple: z.boolean().optional() }))
        .max(2)
        .optional()
        .describe('For "choose": more questions on the same card, answered together, e.g. {id: "look", message: "And which look?", options: [...each with image]}'),
      need: z
        .enum(["song", "footage", "text", "chrome", "cast"])
        .optional()
        .describe('For "provide". "chrome" puts a button on the card that lets you use their Chrome; say what you\'ll do there. "cast": pictures of someone or somewhere only they have (their cat, themselves, their street); say whom'),
      proposals: z
        .array(
          z.object({
            id: z.string().describe("The cast id it'd have (cat); an id already in the cast gets these pictures added to it"),
            kind: z.enum(["character", "place", "prop"]),
            name: z.string(),
            about: z.string().optional().describe("What it looks like, from the pictures: orange tabby, white chest and paws, green eyes"),
            assets: z.array(z.string()).min(1).describe("Asset ids of the photos and clips it's in, the clearest first"),
          }),
        )
        .max(12)
        .optional()
        .describe('For "cast": who and what you found, each with the pictures it\'s in'),
    },
  },
  async ({ project: id, cut, kind, message, options, multiple, questions, need, proposals }) => {
    const { project, dir } = loadProject(id, cut);
    if (kind === "choose" && (!options || options.length < 2)) return text('A "choose" hand-off needs at least two options.');
    if (kind === "cast") {
      if (!proposals?.length) return text('A "cast" hand-off needs proposals: who or what, with the pictures each is in.');
      const unknown = [...new Set(proposals.flatMap((p) => p.assets))].filter((a) => !project.assets.some((x) => x.id === a));
      if (unknown.length) return text(`No such asset: ${unknown.join(", ")}. list_assets has the ids.`);
      // An id has to follow an @: "Aunt Rosa" is proposed as aunt-rosa.
      proposals = proposals.map((p) => ({ ...p, id: CAST_ID.test(p.id) ? p.id : slugify(p.name) }));
      const ids = proposals.map((p) => p.id);
      const twice = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
      if (twice.length) return text(`Each proposal needs its own id; ${twice.join(", ")} is used more than once.`);
      yourTurn(id, { kind, message, proposals }, project.cut.id);
      return text("Handed over: it's the person's turn now. The ones they keep will be in the cast when their answer comes as your next message. Stop here.");
    }
    if (kind === "provide" && !need) return text('A "provide" hand-off needs "need": song, footage, text or chrome.');
    // Pictures made for options are kept relative to the project, where the studio can show them.
    const missing: string[] = [];
    const withIds = (os: z.infer<typeof OPTION>[], prefix: string) =>
      os.map((o, i) => {
        let image = o.image;
        if (image) {
          const full = resolve(dir, image);
          image = relative(dir, full);
          if (image.startsWith("..") || isAbsolute(image) || !existsSync(full)) missing.push(o.image!);
        }
        return { ...o, id: o.id ?? `${prefix}${i + 1}`, ...(image ? { image } : {}) };
      });
    const ask =
      kind === "choose"
        ? { kind, message, multiple, options: withIds(options!, "o"), ...(questions?.length ? { questions: questions.map((q) => ({ ...q, options: withIds(q.options, `${q.id}-`) })) } : {}) }
        : kind === "provide"
          ? { kind, message, need: need! }
          : { kind, message, cut: project.cut.id };
    if (missing.length) return text(`No such picture in the project: ${missing.join(", ")}. Use the paths preview_looks gave (made/looks/…).`);
    yourTurn(id, ask as Parameters<typeof yourTurn>[1], project.cut.id);
    return text("Handed over: it's the person's turn now. Stop here; their answer comes as your next message.");
  },
);

// ---------------------------------------------------------------------------------------------------------------
function overview(id: string, cut?: string, format?: string): string {
  const { project: p, version, doc } = loadProject(id, cut);
  const fmt = p.formats.find((f) => f.id === format) ?? p.formats[0]!;
  const tl = resolveTimeline(p, fmt.id);
  const lines: string[] = [];
  lines.push(`# ${p.title} (${p.id}, version ${version})`);
  if (doc.turn) lines.push(`Turn: ${doc.turn.who === "agent" ? "yours (the agent's)" : `the person's${doc.turn.ask ? `; you asked them to ${doc.turn.ask.kind}: ${doc.turn.ask.message}` : ""}`}`);
  lines.push(`Brief: ${p.brief.goal}${p.brief.audience ? ` · for ${p.brief.audience}` : ""}${p.brief.tone?.length ? ` · ${p.brief.tone.join(", ")}` : ""}`);
  if (p.brief.references?.length) {
    lines.push("References (with what the person said about each):");
    for (const r of p.brief.references) lines.push(`- ${r.kind} ${r.label ? `"${r.label}" ` : ""}${r.value}${r.note ? ` — ${r.note}` : ""}`);
  }
  if (p.cast?.length) {
    lines.push("Cast & sets (name them in prompts with @id):");
    for (const m of p.cast)
      lines.push(
        `- @${m.id} "${m.name}" (${m.kind})${m.about ? `: ${m.about}` : " (no description yet)"} · ${m.images?.length ? `pictures ${m.images.join(", ")}` : "no pictures yet"}${m.style ? ` · in its own style @${m.style}` : ""}${m.variants?.length ? ` · variants ${m.variants.map((v) => `@${m.id}/${v.id} (${v.about})`).join(", ")}` : ""}`,
      );
  }
  if (p.cast?.length || p.look?.style) lines.push(`Made shots are drawn ${p.look?.style ? `in the style @${p.look.style} (/look/style)` : "as photographs (no /look/style set)"}`);
  const specLine = (c: { spec: typeof p.spec }) =>
    [c.spec.purpose, c.spec.targetLength ? `target ${c.spec.targetLength}s` : "", c.spec.audience ? `for ${c.spec.audience}` : "", c.spec.tone?.join(", ")].filter(Boolean).join(" · ");
  lines.push(`Cuts: ${doc.cuts.map((c) => `${c.id} "${c.name}"${c.id === p.cut.id ? " (shown below)" : ""}${specLine(c) ? ` [${specLine(c)}]` : ""}${c.origin?.from ? ` branched from ${c.origin.from}${c.origin.note ? `: ${c.origin.note}` : ""}` : ""}`).join("; ")}`);
  lines.push("");
  lines.push(`## Cut ${p.cut.id}: ${p.cut.name} (${p.recipe})`);
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
  if (p.look) lines.push(`Look: ${JSON.stringify(p.look)}`);
  else lines.push("Look: none yet (set /look: from the brand when there is one, else from the footage and the occasion; palette and preview_looks help)");
  lines.push(`Captions: ${p.captions ? JSON.stringify(p.captions) : "off"} · Sound effects: ${p.sfx?.length ?? 0}${p.music?.duck !== undefined ? ` · Music under narration: ${p.music.duck}` : ""}`);
  const scenes = listScenes(id);
  if (scenes.length) lines.push(`Scene files: ${scenes.join(", ")}`);
  if (p.voice?.lines.length) {
    lines.push(`Voice${p.voice.voice ? ` (${p.voice.voice})` : ""}: ${p.voice.lines.length} lines${tl.lines.length ? `, ${formatTime(tl.lines[0]!.start)}–${formatTime(tl.lines.at(-1)!.end)}` : ""}`);
    for (const l of p.voice.lines) {
      const r = tl.lines.find((x) => x.id === l.id);
      const state = lineState(lineVoice(p.voice.voice, l, p.cast), l);
      lines.push(`- ${l.id}${l.speaker ? ` (@${l.speaker})` : ""} · ${r ? `${formatTime(r.start)}–${formatTime(r.end)}` : "not in this format"} · "${l.text}"${state === "voiced" ? "" : state === "changed" ? " (changed since it was voiced: narrate again)" : " (not voiced yet)"}`);
    }
  }
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
    a.subjects?.length ? `subjects: ${a.subjects.map(subjectLine).join(", ")}` : "",
    a.cutout ? `cut-out of ${a.cutout.of}${a.cutout.from ? ` from ${a.cutout.from}s` : ""}` : "",
    usedBy?.length ? `used in ${usedBy.join(", ")}` : "",
  ];
  return bits.filter(Boolean).join(" · ");
}

function subjectLine(s: SubjectTrack): string {
  const first = s.samples[0], last = s.samples[s.samples.length - 1];
  const when = first && last && last[0]! > first[0]! ? ` ${first[0]}-${last[0]}s` : "";
  const mid = s.samples[Math.floor(s.samples.length / 2)];
  const where = mid ? ` around x${mid[1]!.toFixed(2)} y${mid[2]!.toFixed(2)} w${mid[3]!.toFixed(2)}` : "";
  return `${s.id} (${s.kind} "${s.label}"${when}${where})`;
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
