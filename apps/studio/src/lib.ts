import type { AgentId, AgentInfo, AgentItem, AgentView } from "@beatsheet/engine";
import type { Asset, Fidelity, Note, NoteTarget, Project, ResolvedShot, Shot, ShotKind, Timeline } from "@beatsheet/schema";
import { shortcut, splitPath, words } from "./os";
import { actions, getState, timelineFor, type Selection } from "./store";

export const KIND_LABEL: Record<ShotKind, string> = {
  clip: "Clip",
  coded: "Designed",
  generated: "Generated",
  text: "Text",
  placeholder: "Placeholder",
};

export const FIDELITY_LABEL: Record<Fidelity, string> = { idea: "Idea", board: "Board", rough: "Rough", final: "Final" };

export const assetMap = (p: Project) => new Map<string, Asset>(p.assets.map((a) => [a.id, a]));

/** Thumbnail URLs, served from the project's .cache (missing for projects that were never imported). */
export const posterUrl = (projectId: string, assetId: string) => `/media/${projectId}/asset/${assetId}/poster`;
/** A file in the project's folder (a look's preview the agent made, say). */
export const projectFileUrl = (projectId: string, path: string) => `/media/${projectId}/project-file/${path.split("/").map(encodeURIComponent).join("/")}`;
export const stripUrl = (projectId: string, assetId: string) => `/media/${projectId}/asset/${assetId}/strip`;
/** The clip itself, as its small preview copy (the original when there is none). */
export const proxyUrl = (projectId: string, assetId: string) => `/media/${projectId}/asset/${assetId}/proxy`;
export function shotAsset(shot: Shot): string | undefined {
  const c = shot.content;
  return c.kind === "clip" ? c.asset : c.kind === "generated" ? c.take : undefined;
}
/** Hides an <img> whose thumbnail doesn't exist, so the colour swatch behind it shows instead. */
export const hideBroken = (e: { currentTarget: HTMLImageElement }) => {
  e.currentTarget.style.display = "none";
};

/** A colour that stands in for a shot's picture until real thumbnails exist. */
export function shotSwatch(shot: Shot, assets: Map<string, Asset>): string {
  const c = shot.content;
  if (c.kind === "clip") return assets.get(c.asset)?.color ?? "#4f6f80";
  if (c.kind === "generated") return (c.take && assets.get(c.take)?.color) || "#8a6d2c";
  if (c.kind === "coded") return hueFrom(shot.id);
  if (c.kind === "text") return "#333";
  return "#2a2d33";
}

function hueFrom(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 38% 34%)`;
}

export function shotSummary(shot: Shot, assets: Map<string, Asset>): string {
  const c = shot.content;
  switch (c.kind) {
    case "clip":
      return assets.get(c.asset)?.label ?? c.asset;
    case "generated":
      return c.take ? `${assets.get(c.take)?.label ?? c.take}` : "no take chosen";
    case "coded": {
      // kit:Title → Title: "This camera…"; scenes/Hook.tsx#Hook → Hook
      const name = c.component.startsWith("kit:") ? c.component.slice(4) : (c.component.split("#")[1] ?? c.component.split("/").pop() ?? c.component);
      const words = (c.props?.text ?? c.props?.label ?? c.props?.title) as string | undefined;
      return typeof words === "string" && words ? `${name}: "${words.split(/\n|\\n/)[0]}"` : name;
    }
    case "text":
      return `"${c.text}"`;
    case "placeholder":
      return c.description;
  }
}

/** The shots playing on a track at time t (normally one). */
export function shotsAt(tl: Timeline, track: string, t: number): ResolvedShot[] {
  return tl.shots.filter((s) => s.track === track && t >= s.start - 1e-6 && t < s.end - 1e-6);
}

export function pictureTrack(p: Project): string | undefined {
  return p.tracks.find((t) => t.kind === "picture")?.id;
}

/**
 * What a new note points at: the selection if it's on screen at the playhead (or isn't about time, like an asset),
 * otherwise whatever is playing, since a note made while watching is about what's on screen.
 */
export function targetFromSelection(sel: Selection | undefined, p: Project, tl: Timeline, t: number): NoteTarget {
  const covers = (span: { start: number; end: number } | undefined) => !!span && t >= span.start - 1e-3 && t < span.end + 1e-3;
  if (sel?.kind === "asset") return { kind: "asset", asset: sel.id };
  if (sel?.kind === "shot" && covers(tl.shots.find((s) => s.id === sel.id))) return { kind: "shot", shot: sel.id };
  if (sel?.kind === "line" && covers(tl.lines.find((l) => l.id === sel.id))) return { kind: "line", line: sel.id };
  if (sel?.kind === "cue" && covers(tl.cues.find((c) => c.id === sel.id))) return { kind: "cue", cue: sel.id };
  const pic = pictureTrack(p);
  const shot = pic ? shotsAt(tl, pic, t)[0] : undefined;
  return shot ? { kind: "shot", shot: shot.id } : { kind: "time", t: round2(t) };
}

export const round2 = (x: number) => Math.round(x * 100) / 100;

/** What a picture dragged from the Library (or the board) carries: its asset id. */
export const ASSET_DRAG = "application/x-beatsheet-asset";
/** What a marked stretch of a clip dragged from its viewer carries: { asset, in, out }. */
export const RANGE_DRAG = "application/x-beatsheet-range";
export { dropAsset, putInShot } from "./place";

export function nextId(prefix: string, existing: { id: string }[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((x) => x.id));
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}


export function noteMatches(n: Note, sel: Selection | undefined): boolean {
  if (!sel) return false;
  const t = n.target;
  return (
    (sel.kind === "shot" && t.kind === "shot" && t.shot === sel.id) ||
    (sel.kind === "asset" && t.kind === "asset" && t.asset === sel.id) ||
    (sel.kind === "line" && (t.kind === "line" || t.kind === "word") && t.line === sel.id) ||
    (sel.kind === "cue" && t.kind === "cue" && t.cue === sel.id)
  );
}

/** Where a note points in the cut, for seeking to it. */
export function noteTime(n: Note, tl: Timeline): number | undefined {
  if (n.at !== undefined) return n.at;
  const t = n.target;
  if (t.kind === "time") return t.t;
  if (t.kind === "range") return t.from;
  if (t.kind === "shot") return tl.shots.find((s) => s.id === t.shot)?.start;
  if (t.kind === "line" || t.kind === "word") return tl.lines.find((l) => l.id === t.line)?.start;
  if (t.kind === "cue") return tl.cues.find((c) => c.id === t.cue)?.start;
  if (t.kind === "section") return tl.sections.find((s) => s.id === t.section)?.start;
  return undefined;
}

export function selectionForTarget(t: NoteTarget): Selection | undefined {
  if (t.kind === "shot") return { kind: "shot", id: t.shot };
  if (t.kind === "asset") return { kind: "asset", id: t.asset };
  if (t.kind === "line" || t.kind === "word") return { kind: "line", id: t.line };
  if (t.kind === "cue") return { kind: "cue", id: t.cue };
  return undefined;
}

/** What each media service adds; the engine's list, repeated here because the page only takes types from the engine. */
export const CAPABILITY_LABELS = {
  images: "Generate images",
  video: "Generate video",
  music: "Generate music",
  voice: "Voiceover",
  sfx: "Sound effects",
  transcribe: "Transcribe speech",
  stock: "Stock footage",
  segment: "Cut out anything you describe",
} as const;

/** What the Mac app adds when the studio runs inside it (see apps/desktop/src/preload.ts). */
type Desktop = {
  desktop: true;
  /** "darwin" or "win32". */
  platform?: string;
  pick: (kind: PickKind) => Promise<string | null>;
  pathFor: (file: File) => string;
  /** Photos and videos, a folder of them, or several of either (on Windows, files or a folder: `kind`). */
  pickFootage?: (kind?: "files" | "folder") => Promise<string[] | null>;
  onMenu: (fn: (command: string) => void) => () => void;
  /** Asks macOS for the camera or microphone; resolves to granted, denied, restricted or not-determined. */
  mediaAccess?: (kind: "camera" | "microphone") => Promise<string>;
  /** Opens System Settings at the privacy pane for the camera, the microphone or screen recording. */
  openPrivacy?: (kind: "camera" | "microphone" | "screen") => void;
  /** The save dialog for an export: where it goes and what it's called. Null if they cancel. */
  saveVideo?: (opts: { name: string; dir?: string }) => Promise<string | null>;
  /** Shows a file in Finder, or opens it in its app. */
  reveal?: (path: string) => void;
  openFile?: (path: string) => Promise<string>;
};
export const desktop = (window as unknown as { beatsheet?: Desktop }).beatsheet;

/** Windows, where the studio (and the engine beside it) runs on a PC: the app says, or the browser does. */
export const WINDOWS = desktop?.platform ? desktop.platform === "win32" : /win/i.test(navigator.platform || navigator.userAgent);
/** Words for the computer beatsheet runs on (see os.ts). */
export const OS = words(WINDOWS);
/** A shortcut as the Mac writes it ("⇧⌘O"), or on Windows as Windows does ("Ctrl+Shift+O"). */
export const keys = (mac: string) => shortcut(mac, WINDOWS);
/** The Windows app's footage picker chooses files or a folder, not both, so folders get a way in of their own. */
export const FOLDERS_APART = !!desktop?.pickFootage && WINDOWS;
/** A path split into its folders and name (on Windows either slash separates them). */
export const pathParts = (path: string) => splitPath(path, WINDOWS);

/** What the pickers choose: a folder, a song or other audio, or any file. */
export type PickKind = "folder" | "audio" | "file";
/** A folder or file from the person: the Mac app's own picker, or the engine's when the studio runs in a browser. */
export async function pickPath(kind: PickKind): Promise<string | null> {
  if (desktop) return desktop.pick(kind);
  const res = await fetch("/api/pick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
  return ((await res.json()) as { path: string | null }).path;
}

/**
 * Footage to add: files and folders in the Mac app (one picker does both), files or a folder (`kind`) in the Windows
 * app, a folder when the studio runs in a browser.
 */
export async function pickFootage(kind?: "files" | "folder"): Promise<string[] | null> {
  if (desktop?.pickFootage) return desktop.pickFootage(kind);
  const folder = await pickPath("folder");
  return folder ? [folder] : null;
}

export const AGENT_NAMES: Record<string, string> = { muse: "Muse Code", codex: "Codex", claude: "Claude Code", antigravity: "Antigravity", other: "Agent" };
/** The agents the studio can host, in the engine's order (AGENT_IDS), for showing them before the list arrives. */
export const AGENT_ORDER: AgentId[] = ["muse", "codex", "claude", "antigravity"];

/** A model's name for display, from the agent's own list when it's loaded. */
export function modelName(list: AgentInfo[] | undefined, agent: AgentId | undefined, id?: string): string | undefined {
  if (!id) return undefined;
  return list?.find((a) => a.id === agent)?.models?.find((m) => m.id === id)?.label ?? id;
}

const TOOL_WORDS: Record<string, string> = {
  list_projects: "looking around",
  get_project: "reading the project",
  list_assets: "going through footage",
  look_at_assets: "watching footage",
  log_assets: "logging footage",
  first_cut: "making a first cut",
  set_song: "setting the song",
  edit_project: "editing",
  get_batch: "reading your notes",
  resolve_note: "closing a note",
  frame: "checking a frame",
  render: "rendering",
  create_cut: "making a new cut",
  add_asset: "adding a file",
  find_subjects: "finding people",
  track_subject: "following something",
  cut_out: "making a cut-out",
  hand_off: "handing over to you",
  "received batch": "got your notes",
};

/** The agents' own tools (Claude Code's, Codex's, Muse's, Antigravity's), in words. */
const OWN_TOOL_WORDS: Record<string, string> = {
  shell: "ran",
  Bash: "ran",
  bash: "ran",
  "edit files": "edited",
  Edit: "edited",
  MultiEdit: "edited",
  Write: "wrote",
  Read: "read",
  read_file: "read",
  Grep: "searched",
  Glob: "looked for files",
  search: "searched",
  WebFetch: "fetched",
  WebSearch: "searched the web",
  "web search": "searched the web",
  TodoWrite: "updated its plan",
  Task: "asked a helper",
  helper: "asked a helper",
  read_skill: "read the recipe",
  Skill: "read the recipe",
  "image generation": "generated an image",
};

/** What an agent in a terminal last did, in words: "editing july-4". */
export function agentActivity(a: { activity?: { tool: string; project?: string } }): string {
  if (!a.activity) return "";
  const what = TOOL_WORDS[a.activity.tool] ?? a.activity.tool;
  return a.activity.project ? `${what} ${a.activity.project}` : what;
}

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** A tool call in words, for the transcript: "Editing july-4 · 1 change", "Ran npm test". */
export function toolCallWords(item: AgentItem): { title: string; detail?: string } {
  const tool = item.tool ?? "tool";
  const args = (item.args && typeof item.args === "object" ? item.args : {}) as Record<string, unknown>;
  const words = item.server === "beatsheet" ? TOOL_WORDS[tool] : undefined;
  if (words) {
    const project = typeof args.project === "string" ? args.project : undefined;
    const ops = Array.isArray(args.ops) ? args.ops.length : 0;
    const ids = Array.isArray(args.ids) ? args.ids.length : 0;
    const where = typeof args.shot === "string" ? `shot ${args.shot}` : typeof args.t === "number" ? `${args.t}s` : undefined;
    const detail =
      tool === "frame" && where
        ? `${project ?? ""} · ${where}`
        : tool === "edit_project" && ops
          ? `${project ?? ""} · ${ops} change${ops === 1 ? "" : "s"}`
          : tool === "look_at_assets" && ids
            ? `${ids} clip${ids === 1 ? "" : "s"}`
            : tool === "resolve_note" && typeof args.reply === "string"
              ? args.reply
              : project;
    return { title: capital(words), detail };
  }
  // Agents often read the recipe or the project file with a shell command; say what they read.
  if ((tool === "shell" || tool === "Bash" || tool === "bash") && typeof (item.detail ?? args.command) === "string") {
    const cmd = String(item.detail ?? args.command);
    if (/SKILL\.md/.test(cmd)) return { title: "Read the recipe" };
    if (/project\.json/.test(cmd) && /\b(cat|head|sed|jq|less)\b/.test(cmd)) return { title: "Read the project file" };
  }
  const own = OWN_TOOL_WORDS[tool];
  const detail =
    item.detail ?? (["command", "cmd", "file_path", "path", "pattern", "query", "url", "prompt"].map((k) => args[k]).find((v) => typeof v === "string") as string | undefined);
  return { title: own ? capital(own) : item.server ? `${item.server} · ${tool.replace(/_/g, " ")}` : capital(tool.replace(/_/g, " ")), detail };
}

/** What the hosted agent is up to, for the top bar: "editing july-4", "thinking", "ready". */
export function sessionActivity(view: AgentView): string {
  if (view.status === "starting") return "starting";
  if (view.status === "error") return "stopped";
  if (view.approvals.length) return "needs your OK";
  if (view.status !== "running") return "ready";
  const last = view.items.at(-1);
  if (last?.kind === "tool" && last.status === "running") {
    const { title, detail } = toolCallWords(last);
    return `${title.toLowerCase()}${detail && detail.length < 24 ? ` ${detail}` : ""}`;
  }
  if (last?.kind === "assistant" && last.status === "running") return "writing";
  return "thinking";
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 48 * 3600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export type EngineJob = { id: string; status: "running" | "done" | "error"; progress: number; log: string[]; output?: string; error?: string };
/** Starts an engine job and waits for it, reporting progress; resolves to its output, or throws its error. */
export async function runJob(url: string, body: unknown, onProgress?: (fraction: number) => void): Promise<string | undefined> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let j = (await res.json()) as EngineJob & { error?: string };
  if (!res.ok) throw new Error(j.error ?? `${res.status}`);
  while (j.status === "running") {
    onProgress?.(j.progress);
    await new Promise((r) => setTimeout(r, 400));
    j = (await (await fetch(`/api/jobs/${j.id}`)).json()) as EngineJob;
  }
  if (j.status === "error") throw new Error(j.error ?? "It stopped");
  return j.output;
}

/** Where a picture of `aspect` (w/h) is drawn inside a w×h box with object-fit: contain, as fractions of the box. */
export function containRect(aspect: number, boxW: number, boxH: number) {
  const boxAspect = boxW / boxH;
  return aspect > boxAspect ? { x: 0, y: (1 - boxAspect / aspect) / 2, w: 1, h: boxAspect / aspect } : { x: (1 - aspect / boxAspect) / 2, y: 0, w: aspect / boxAspect, h: 1 };
}

/** A note on what's selected, or on the shot under the playhead, written right over the player (N). */
export function noteHere() {
  const s = getState();
  if (!s.project) return;
  const frame = document.querySelector(".frame")?.getBoundingClientRect();
  const target = targetFromSelection(s.selection, s.project, timelineFor(s.project, s.format), s.playhead);
  actions.noteOn(target, frame ? { x: frame.left + frame.width / 2, y: frame.top + frame.height * 0.6 } : { x: innerWidth / 2, y: innerHeight / 2 });
}

/** Writes an error to the studio's log (.beatsheet/studio.log), so a crash in the Mac app can be looked into later. */
export function reportError(where: string, err: unknown) {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`beatsheet ${where}:`, e);
  void fetch("/api/log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ where, message: e.message, stack: e.stack?.split("\n").slice(0, 12).join("\n"), url: location.hash }),
  }).catch(() => {});
}
