/**
 * What an agent receives for a batch of notes: each note with the shot, line or region it points at, already
 * resolved, so the agent opens only what it needs instead of re-reading the whole project.
 */
import { describeAnchor, describeTarget, formatTime } from "./describe.ts";
import { resolveTimeline, type ResolvedShot, type Timeline } from "./resolve.ts";
import { noteShots, type Note, type Project, type Shot } from "./types.ts";

export type BatchShot = { id: string; label?: string; kind: string; fidelity: string; plays?: string; startsOn: string; content: string; intent?: string };

export type BatchNote = {
  id: string;
  note: string;
  on: string;
  at?: string;
  format: string;
  stage?: string;
  shot?: BatchShot;
  /** For a note left on several shots at once: each of them, in the order they play. */
  shots?: BatchShot[];
  line?: { id: string; text?: string; plays?: string };
  /** For a note on a stretch of the cut: the shots that play in it. */
  range?: { from: string; to: string; shots: string[] };
  region?: { x: number; y: number; w: number; h: number };
};

export type Batch = {
  project: { id: string; title: string; cut: string; file?: string; recipe: string; codeRoot?: string; sources: string[] };
  notes: BatchNote[];
};

export function shotContentSummary(s: Shot, p: Project): string {
  const c = s.content;
  const label = (id: string) => p.assets.find((a) => a.id === id)?.label ?? id;
  switch (c.kind) {
    case "clip":
      return `${label(c.asset)} (${c.asset})`;
    case "generated":
      return c.take ? `${label(c.take)} (${c.take})` : `generated, no take chosen: ${c.prompt}`;
    case "coded":
      return c.component;
    case "text":
      return `text "${c.text}"`;
    case "placeholder":
      return `placeholder: ${c.description}`;
  }
}

export function buildBatch(p: Project, notes: Note[], opts: { file?: string } = {}): Batch {
  const timelines = new Map<string, Timeline>();
  const tlFor = (format: string) => {
    if (!timelines.has(format)) timelines.set(format, resolveTimeline(p, format));
    return timelines.get(format)!;
  };
  return {
    project: { id: p.id, title: p.title, cut: p.cut.id, file: opts.file, recipe: p.recipe, codeRoot: p.codeRoot, sources: p.sources.map((x) => x.path) },
    notes: notes.map((n) => {
      const format = n.format ?? p.formats[0]!.id;
      const tl = tlFor(format);
      const out: BatchNote = { id: n.id, note: n.text, on: describeTarget(n.target, p), format, stage: n.stage };
      if (n.at !== undefined) out.at = formatTime(n.at);
      const t = n.target;
      const shots = noteShots(t)
        .map((id) => ({ s: p.shots.find((x) => x.id === id), r: tl.shots.find((x) => x.id === id) }))
        .filter((x): x is { s: Shot; r: ResolvedShot | undefined } => !!x.s)
        .sort((a, b) => (a.r?.start ?? Infinity) - (b.r?.start ?? Infinity))
        .map(({ s, r }): BatchShot => ({
          id: s.id,
          label: s.label,
          kind: s.content.kind,
          fidelity: s.fidelity,
          plays: r ? `${formatTime(r.start)}–${formatTime(r.end)}` : undefined,
          startsOn: s.start ? describeAnchor(s.start, p) : "end of previous shot",
          content: shotContentSummary(s, p),
          intent: s.intent,
        }));
      if (shots.length > 1) out.shots = shots;
      else if (shots[0]) out.shot = shots[0];
      if (t.kind === "line" || t.kind === "word") {
        const r = tl.lines.find((l) => l.id === t.line);
        out.line = { id: t.line, text: r?.text, plays: r ? `${formatTime(r.start)}–${formatTime(r.end)}` : undefined };
      }
      if (t.kind === "range") {
        const inside = tl.shots.filter((r) => r.end > t.from + 1e-3 && r.start < t.to - 1e-3).map((r) => r.id);
        out.range = { from: formatTime(t.from), to: formatTime(t.to), shots: inside };
      }
      if (n.region) out.region = n.region;
      return out;
    }),
  };
}
