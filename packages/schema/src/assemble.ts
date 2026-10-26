/**
 * A deterministic first cut for a montage: picks the stretch of the song around its first drop, cuts on beats at a
 * pace set by each section's energy, and fills the cuts with footage in the order it was shot. It costs no tokens and
 * runs in milliseconds; the agent's job is to improve on it (better picks, moments, framing), not to start from zero.
 */
import { resolveTimeline } from "./resolve.ts";
import type { Anchor, Asset, MusicSection, Note, Project, Shot } from "./types.ts";

export type AssembleOptions = {
  /** Seconds; default the brief's target length, else 30. */
  targetLength?: number;
  /** Format to assemble against; default the first. */
  format?: string;
  /** Music asset id; default the cut's own song, else the project's first. */
  music?: string;
  /** Section to start the song in; default up to 8 bars before the first drop. */
  startSection?: string;
  /** Beats per cut by section energy. */
  beatsPerCut?: Partial<Record<"low" | "mid" | "high", number>>;
  /** Asset ids to use, in order; default every video and photo that isn't rejected, in the order shot. */
  include?: string[];
  /** Title card text, or false for none; default the project title. */
  title?: string | false;
};

export type AssembleResult = { project: Project; summary: string[] };

const PACE = { low: 8, mid: 4, high: 2 };

export function autoAssemble(input: Project, opts: AssembleOptions = {}): AssembleResult {
  const p: Project = structuredClone(input);
  const summary: string[] = [];
  const format = opts.format ?? p.formats[0]!.id;
  const fmt = p.formats.find((f) => f.id === format)!;
  const own = p.music?.cues[0]?.asset;
  const music = p.assets.find((a) => a.kind === "music" && a.id === (opts.music ?? own)) ?? (opts.music ? undefined : p.assets.find((a) => a.kind === "music"));
  if (!music?.grid || !music.duration) throw new Error("Assembling needs a music asset with a beat grid and duration");
  const bar = (music.grid.beatsPerBar * 60) / music.grid.bpm;
  const sections = [...(music.sections ?? [])].sort((a, b) => a.start - b.start);

  // ---- Where the song starts: the chosen section, or up to 8 bars before the first drop, on a downbeat.
  let from = 0;
  const chosen = opts.startSection ? sections.find((s) => s.id === opts.startSection) : undefined;
  if (chosen) from = chosen.start;
  else {
    const drop = sections.findIndex((s) => s.level === "high");
    if (drop > 0) {
      const prev = sections[drop - 1]!;
      const barsBefore = Math.min(8, Math.round((sections[drop]!.start - prev.start) / bar));
      from = Math.max(0, sections[drop]!.start - barsBefore * bar);
    } else if (sections[1]) from = sections[1].start;
  }
  const firstSection = [...sections].reverse().find((s) => s.start <= from + 1e-3) ?? sections[0];
  const target = opts.targetLength ?? p.spec.targetLength ?? 30;
  const available = Math.floor((music.duration - from) / bar);
  const bars = Math.max(2, Math.min(available, Math.round(target / bar)));
  const endAnchor: Anchor = firstSection
    ? { kind: "beat", unit: "bar", n: bars, from: firstSection.id }
    : { kind: "time", t: bars * bar };
  p.music = { cues: [{ id: "m1", asset: music.id, from: round(from), end: endAnchor, fadeOut: 0.6 }] };
  summary.push(`${music.label ?? music.id}: ${bars} bars from ${firstSection?.label ?? "the start"} (${(bars * bar).toFixed(1)}s)`);

  // ---- Tracks.
  const pic = ensureTrack(p, "picture", "pic", "Picture");
  const txt = ensureTrack(p, "text", "txt", "Text");
  const kept = p.shots.filter((s) => s.track !== pic && s.track !== txt);
  p.shots = kept;

  // ---- Cut points: each section in the cut, every N beats by its energy.
  const tl = resolveTimeline(p, format);
  if (tl.diagnostics.length) throw new Error(`Music doesn't resolve: ${tl.diagnostics[0]!.message}`);
  const pace = { ...PACE, ...opts.beatsPerCut };
  const levelOf = (id: string) => sections.find((s: MusicSection) => s.id === id)?.level ?? "mid";
  const cuts: { t: number; anchor?: Anchor }[] = [];
  for (const sec of tl.sections) {
    const base = tl.beats.findIndex((b) => b.t >= sec.start - 1e-3);
    if (base < 0) continue;
    const every = pace[levelOf(sec.id)];
    for (let j = 0; ; j += every) {
      const beat = tl.beats[base + j];
      if (!beat || beat.t >= sec.end - 1e-3 || beat.t >= tl.duration - 0.5) break;
      if (cuts.length && beat.t - cuts[cuts.length - 1]!.t < 0.25) continue;
      const anchor: Anchor | undefined =
        beat.t < 1e-3 ? undefined : j % 4 === 0 ? { kind: "beat", unit: "bar", n: j / 4, from: sec.id } : { kind: "beat", n: j, from: sec.id };
      cuts.push({ t: beat.t, anchor });
    }
  }
  if (!cuts.length || cuts[0]!.t > 1e-3) cuts.unshift({ t: 0 });

  // ---- Footage, in the order it was shot. Long clips can fill several cuts with different parts.
  const pool = (opts.include ? opts.include.map((id) => p.assets.find((a) => a.id === id)).filter((a): a is Asset => !!a) : p.assets)
    .filter((a) => (a.kind === "video" || a.kind === "image") && a.rating !== -1)
    .sort((a, b) => (opts.include ? 0 : (a.capturedAt ?? a.path).localeCompare(b.capturedAt ?? b.path)));
  if (!pool.length) throw new Error("No usable footage: every video and photo is rejected or missing");
  const uses: { asset: Asset; part: number; parts: number }[] = [];
  for (const a of pool) {
    const parts = a.kind === "video" && a.duration ? Math.max(1, Math.min(4, Math.floor(a.duration / 6))) : 1;
    for (let k = 0; k < parts; k++) uses.push({ asset: a, part: k, parts });
  }
  const picks = spread(uses, cuts.length, pool.length);

  const portrait = fmt.height > fmt.width;
  cuts.forEach((cut, i) => {
    const use = picks[i]!;
    const a = use.asset;
    const slot = (cuts[i + 1]?.t ?? tl.duration) - cut.t;
    const shot: Shot = {
      id: `s${String(i + 1).padStart(2, "0")}`,
      track: pic,
      label: a.label ?? a.id,
      fidelity: "rough",
      content: { kind: "clip", asset: a.id },
    };
    if (cut.anchor) shot.start = cut.anchor;
    if (shot.content.kind === "clip" && a.kind === "video" && a.duration) {
      const best = [...(a.moments ?? [])].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))[0];
      const centre = use.parts === 1 && best ? best.t : ((use.part + 0.5) * a.duration) / use.parts;
      const lead = best && use.parts === 1 ? Math.min(0.4, slot / 2) : slot / 2;
      shot.content.in = round(Math.max(0, Math.min(a.duration - slot - 0.05, centre - lead)));
    }
    const sourcePortrait = (a.height ?? 0) > (a.width ?? 0);
    if (shot.content.kind === "clip" && a.width && sourcePortrait !== portrait) {
      shot.content.reframe = { [format]: { x: 0.5, y: 0.5, zoom: 1 } };
    }
    p.shots.push(shot);
  });
  summary.push(`${cuts.length} cuts from ${new Set(picks.map((u) => u.asset.id)).size} of ${pool.length} clips and photos`);

  if (opts.title !== false && firstSection) {
    p.shots.push({
      id: "t1",
      track: txt,
      label: "Title",
      start: { kind: "time", t: 0 },
      end: { kind: "beat", unit: "bar", n: 2, from: firstSection.id },
      fidelity: "rough",
      content: { kind: "text", text: opts.title ?? p.title, style: "title-bold" },
    });
  }

  // Notes on shots that no longer exist keep their place in the cut instead.
  const ids = new Set(p.shots.map((s) => s.id));
  p.notes = p.notes.map((n): Note => (n.target.kind === "shot" && !ids.has(n.target.shot) ? { ...n, target: { kind: "time", t: n.at ?? 0 } } : n));
  p.stages.structure = { ...p.stages.structure, status: "done", summary: summary[0] };
  if (p.stages.assemble.status !== "done") p.stages.assemble = { ...p.stages.assemble, status: "active" };
  return { project: p, summary };
}

function ensureTrack(p: Project, kind: "picture" | "text", id: string, label: string): string {
  const t = p.tracks.find((x) => x.kind === kind);
  if (t) return t.id;
  p.tracks.push({ id, kind, label });
  return id;
}

/**
 * `count` picks from `uses`, in order. With enough material, one part per clip, spread across the whole shoot;
 * otherwise every part of every clip, each used about evenly.
 */
function spread<T extends { part: number }>(uses: T[], count: number, clips: number): T[] {
  const firstParts = uses.filter((u) => u.part === 0);
  const source = clips >= count ? firstParts : uses;
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(source[Math.floor(((i + 0.5) * source.length) / count) % source.length]!);
  return out;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
