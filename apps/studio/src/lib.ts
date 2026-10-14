import type { Asset, Fidelity, Note, NoteTarget, Project, ResolvedShot, Shot, ShotKind, StageId, Timeline } from "@beatsheet/schema";
import type { Selection } from "./store";

export const STAGE_LABELS: Record<StageId, { title: string; blurb: string }> = {
  brief: { title: "Brief", blurb: "What this video is for, who it's for, and where it goes" },
  material: { title: "Material", blurb: "Footage, photos, captures and generated assets, logged and rated" },
  structure: { title: "Structure", blurb: "The spine: the script and voice, or the music and its sections" },
  board: { title: "Board", blurb: "One card per shot, from idea to final" },
  assemble: { title: "Assemble", blurb: "The cut, playing live; drag cuts and they snap to words and beats" },
  craft: { title: "Craft", blurb: "Polish one shot at a time: values, takes, framing" },
  sound: { title: "Sound", blurb: "Voice, music edits and levels" },
  finish: { title: "Finish", blurb: "Formats, checks and export" },
};

export const KIND_LABEL: Record<ShotKind, string> = {
  clip: "Clip",
  coded: "Coded",
  generated: "Generated",
  text: "Text",
  placeholder: "Placeholder",
};

export const FIDELITY_LABEL: Record<Fidelity, string> = { idea: "Idea", board: "Board", rough: "Rough", final: "Final" };

export const assetMap = (p: Project) => new Map<string, Asset>(p.assets.map((a) => [a.id, a]));

/** Thumbnail URLs, served from the project's .cache (missing for projects that were never imported). */
export const posterUrl = (projectId: string, assetId: string) => `/media/${projectId}/asset/${assetId}/poster`;
export const stripUrl = (projectId: string, assetId: string) => `/media/${projectId}/asset/${assetId}/strip`;
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
    case "coded":
      return c.component.split("/").pop() ?? c.component;
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

export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};
