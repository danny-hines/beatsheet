/**
 * Turns a project's anchors into times for one format. Pure: same project in, same timeline out.
 *
 * Problems never throw. Each one becomes a diagnostic and the affected item gets NaN times, so the studio can draw
 * everything that does resolve and flag what doesn't.
 */
import type { Anchor, Asset, Line, MusicCue, Project, Shot } from "./types.ts";

export type Diagnostic = { where: string; message: string };
export type ResolvedWord = { w: string; s: number; e: number };
export type ResolvedLine = { id: string; text: string; start: number; end: number; words: ResolvedWord[] };
export type ResolvedCue = {
  id: string;
  asset: string;
  start: number;
  end: number;
  trackFrom: number;
  fadeIn: number;
  fadeOut: number;
  gain: number;
};
export type ResolvedBeat = { t: number; bar: boolean };
export type ResolvedSection = { id: string; label: string; start: number; end: number; cue: string };
export type ResolvedShot = { id: string; track: string; start: number; end: number; sourceIn?: number };
export type ResolvedMarker = { id: string; label: string; t: number };
export type ResolvedSfx = { id: string; sound: string; t: number; gain: number };

export type Timeline = {
  format: string;
  duration: number;
  lines: ResolvedLine[];
  cues: ResolvedCue[];
  beats: ResolvedBeat[];
  sections: ResolvedSection[];
  shots: ResolvedShot[];
  markers: ResolvedMarker[];
  sfx: ResolvedSfx[];
  diagnostics: Diagnostic[];
};

const EPS = 1e-6;
/** Times within a millisecond are the same time. */
const TOL = 1e-3;

class ResolveError extends Error {}

/** Loose word match used everywhere a word is named: case and punctuation don't count. */
export const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

export function resolveTimeline(project: Project, formatId?: string): Timeline {
  const format = formatId ?? project.formats[0]!.id;
  const inFormat = (x: { only?: string[] }) => !x.only || x.only.includes(format);
  const diagnostics: Diagnostic[] = [];
  const assets = new Map<string, Asset>(project.assets.map((a) => [a.id, a]));

  // ---- Voice: placed in reading order, so it never depends on anything else.
  const lines: ResolvedLine[] = [];
  const lineById = new Map<string, ResolvedLine>();
  let voiceTail = project.voice?.tail ?? 1;
  if (project.voice) {
    const v = project.voice;
    const placed = v.lines.filter(inFormat);
    const last = placed[placed.length - 1];
    if (last) voiceTail = last.gaps?.[format] ?? last.gapAfter ?? v.tail;
    let t = v.leadIn;
    for (const line of placed) {
      t += line.holdBefore ?? 0;
      const r: ResolvedLine = {
        id: line.id,
        text: line.text,
        start: t,
        end: t + line.duration,
        words: line.words.map((w) => ({ w: w.w, s: t + w.s, e: t + w.e })),
      };
      lines.push(r);
      lineById.set(line.id, r);
      t = r.end + gapAfter(line, format, v.defaultGap);
    }
  }

  // ---- Memoised lazy resolution with cycle detection.
  const cache = new Map<string, number>();
  const visiting = new Set<string>();
  const memo = (key: string, compute: () => number): number => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    if (visiting.has(key)) throw new ResolveError(`circular timing through ${key}`);
    visiting.add(key);
    try {
      const value = compute();
      if (!Number.isFinite(value)) throw new ResolveError(`${key} did not resolve to a time`);
      cache.set(key, value);
      return value;
    } finally {
      visiting.delete(key);
    }
  };

  const cues = (project.music?.cues ?? []).filter(inFormat);
  const shots = project.shots.filter(inFormat);
  const shotById = new Map(shots.map((s) => [s.id, s]));
  const shotsOnTrack = (track: string) => shots.filter((s) => s.track === track);

  const trackDuration = (cue: MusicCue) => {
    const d = assets.get(cue.asset)?.duration;
    if (d === undefined) throw new ResolveError(`music asset ${cue.asset} needs a duration`);
    return d;
  };

  // A cue's raw start can be negative (the track begins before the cut); the cut only plays from 0.
  const cueRawStart = (cue: MusicCue) =>
    memo(`cue:${cue.id}:raw`, () =>
      cue.sync ? anchor(cue.sync.at) - (cue.sync.track - (cue.from ?? 0)) : anchor(cue.start ?? { kind: "time", t: 0 }),
    );
  const cueStart = (cue: MusicCue) => memo(`cue:${cue.id}:start`, () => Math.max(0, cueRawStart(cue)));
  const cueTrackFrom = (cue: MusicCue) => (cue.from ?? 0) + (cueStart(cue) - cueRawStart(cue));
  const nextCue = (cue: MusicCue) => cues[cues.indexOf(cue) + 1];
  /** Where the next cue takes over or the cue's track runs out. Never reads `end`, so `end` may use beats. */
  const cueBoundary = (cue: MusicCue) => {
    const next = nextCue(cue);
    const runOut = cueStart(cue) + ((cue.to ?? trackDuration(cue)) - cueTrackFrom(cue));
    return next ? Math.min(cueStart(next), runOut) : runOut;
  };
  const cueEnd = (cue: MusicCue) =>
    memo(`cue:${cue.id}:end`, () => (cue.end ? anchor(cue.end) : cueBoundary(cue)));

  // ---- Beat grid and sections, mapped from track time into the cut.
  let grid: ResolvedBeat[] | undefined;
  let gridBusy = false;
  const getGrid = (): ResolvedBeat[] => {
    if (grid) return grid;
    if (gridBusy) throw new ResolveError("circular timing through the beat grid");
    gridBusy = true;
    try {
      const out: ResolvedBeat[] = [];
      for (const cue of cues) {
        const g = assets.get(cue.asset)?.grid;
        if (!g) continue;
        const start = cueStart(cue);
        const from = cueTrackFrom(cue);
        const span = cueBoundary(cue) - start;
        const len = 60 / g.bpm;
        const bpb = g.beatsPerBar ?? 4;
        // A beat within TOL of the cue's start counts as on it: section times are stored rounded.
        for (let k = Math.ceil((from - TOL - g.downbeat) / len); ; k++) {
          const trackT = g.downbeat + k * len;
          if (trackT - from >= span - TOL) break;
          const t = Math.max(start, start + (trackT - from));
          if (out.length && Math.abs(out[out.length - 1]!.t - t) < TOL) continue;
          out.push({ t, bar: ((k % bpb) + bpb) % bpb === 0 });
        }
      }
      out.sort((a, b) => a.t - b.t);
      grid = out;
      return out;
    } finally {
      gridBusy = false;
    }
  };

  let sectionList: ResolvedSection[] | undefined;
  const getSections = (): ResolvedSection[] => {
    if (sectionList) return sectionList;
    const out: ResolvedSection[] = [];
    for (const cue of cues) {
      const secs = assets.get(cue.asset)?.sections ?? [];
      const start = cueStart(cue);
      const from = cueTrackFrom(cue);
      const boundary = cueBoundary(cue);
      const ordered = [...secs].sort((a, b) => a.start - b.start);
      ordered.forEach((s, i) => {
        if (out.some((o) => o.id === s.id)) return;
        const trackEnd = s.end ?? ordered[i + 1]?.start ?? Infinity;
        if (trackEnd <= from + EPS) return; // over before this cue plays
        const t0 = start + (Math.max(s.start, from) - from); // a section already playing starts with the cue
        if (t0 >= boundary - EPS) return;
        const t1 = Math.min(boundary, start + (trackEnd - from));
        out.push({ id: s.id, label: s.label, start: t0, end: t1, cue: cue.id });
      });
    }
    out.sort((a, b) => a.start - b.start);
    sectionList = out;
    return out;
  };
  const section = (id: string) => {
    const s = getSections().find((x) => x.id === id);
    if (!s) throw new ResolveError(`no music section "${id}" plays in this cut`);
    return s;
  };

  // ---- Shots.
  const shotStart = (s: Shot): number =>
    memo(`shot:${s.id}:start`, () => {
      if (s.start) return anchor(s.start);
      const list = shotsOnTrack(s.track);
      const prev = list[list.indexOf(s) - 1];
      return prev ? shotEnd(prev) : 0;
    });
  const shotEnd = (s: Shot): number =>
    memo(`shot:${s.id}:end`, () => {
      if (s.end) return anchor(s.end);
      if (s.duration !== undefined) return shotStart(s) + s.duration;
      const list = shotsOnTrack(s.track);
      const next = list[list.indexOf(s) + 1];
      return next ? shotStart(next) : cutEnd();
    });
  const momentTime = (assetId: string, moment: string | number) => {
    if (typeof moment === "number") return moment;
    const m = assets.get(assetId)?.moments?.find((x) => x.id === moment);
    if (!m) throw new ResolveError(`asset ${assetId} has no moment "${moment}"`);
    return m.t;
  };
  const sourceIn = (s: Shot): number =>
    memo(`shot:${s.id}:in`, () => {
      const c = s.content;
      if (c.kind !== "clip") return 0;
      if (!c.sync) return c.in ?? 0;
      return momentTime(c.asset, c.sync.moment) - (anchor(c.sync.at) - shotStart(s)) * (c.speed ?? 1);
    });

  const cutEnd = (): number =>
    memo("cut:end", () => {
      if (project.end) return anchor(project.end);
      if (lines.length) return lines[lines.length - 1]!.end + voiceTail;
      if (cues.length) return Math.max(...cues.map(cueEnd));
      const picture = project.tracks.find((t) => t.kind === "picture");
      const list = picture ? shotsOnTrack(picture.id) : [];
      if (!list.length) return 0;
      return shotEnd(list[list.length - 1]!);
    });

  // ---- Anchors.
  const line = (id: string) => {
    const l = lineById.get(id);
    if (!l) throw new ResolveError(`no line "${id}" in the ${format} cut`);
    return l;
  };
  const anchor = (a: Anchor): number => {
    const base = ((): number => {
      switch (a.kind) {
        case "time":
          return a.t;
        case "line": {
          const l = line(a.line);
          return a.edge === "end" ? l.end : l.start;
        }
        case "word": {
          const l = line(a.line);
          const target = cleanWord(a.word);
          const hits = l.words.filter((w) => cleanWord(w.w) === target);
          const hit = hits[a.nth ?? 0];
          if (!hit) throw new ResolveError(`word "${a.word}"${a.nth ? ` #${a.nth}` : ""} is not in line "${a.line}"`);
          return a.edge === "end" ? hit.e : hit.s;
        }
        case "beat": {
          const all = getGrid();
          const list = a.unit === "bar" ? all.filter((b) => b.bar) : all;
          let baseIndex = 0;
          if (a.from) {
            const s0 = section(a.from).start;
            baseIndex = list.findIndex((b) => b.t >= s0 - 1e-3);
            if (baseIndex < 0) throw new ResolveError(`no ${a.unit ?? "beat"} at or after section "${a.from}"`);
          }
          const pos = baseIndex + a.n;
          const lo = list[Math.floor(pos + EPS)];
          const hi = list[Math.ceil(pos - EPS)];
          if (!lo || !hi) throw new ResolveError(`${a.unit ?? "beat"} ${a.n}${a.from ? ` of "${a.from}"` : ""} is past the music`);
          return lo.t + (hi.t - lo.t) * (pos - Math.floor(pos + EPS));
        }
        case "section": {
          const s = section(a.section);
          return a.edge === "end" ? s.end : s.start;
        }
        case "moment": {
          const s = shotById.get(a.shot);
          if (!s || s.content.kind !== "clip") throw new ResolveError(`moment anchor needs clip shot "${a.shot}"`);
          const m = momentTime(s.content.asset, a.moment);
          return shotStart(s) + (m - sourceIn(s)) / (s.content.speed ?? 1);
        }
        case "shot": {
          const s = shotById.get(a.shot);
          if (!s) throw new ResolveError(`no shot "${a.shot}" in the ${format} cut`);
          return a.edge === "end" ? shotEnd(s) : shotStart(s);
        }
        case "marker": {
          const m = project.markers?.find((x) => x.id === a.marker);
          if (!m) throw new ResolveError(`no marker "${a.marker}"`);
          return memo(`marker:${m.id}`, () => anchor(m.at));
        }
        case "end":
          return cutEnd();
      }
    })();
    return base + (a.offset ?? 0);
  };

  /** Runs one resolution, turning a failure into a diagnostic and NaN. */
  const attempt = (where: string, fn: () => number): number => {
    try {
      return fn();
    } catch (err) {
      if (!(err instanceof ResolveError)) throw err;
      diagnostics.push({ where, message: err.message });
      return NaN;
    }
  };

  const duration = attempt("cut end", cutEnd);
  const resolvedCues: ResolvedCue[] = cues.map((c) => ({
    id: c.id,
    asset: c.asset,
    start: attempt(`music cue ${c.id}`, () => cueStart(c)),
    end: attempt(`music cue ${c.id}`, () => cueEnd(c)),
    trackFrom: attempt(`music cue ${c.id}`, () => cueTrackFrom(c)),
    fadeIn: c.fadeIn ?? 0,
    fadeOut: c.fadeOut ?? 0,
    gain: c.gain ?? 1,
  }));
  let beats: ResolvedBeat[] = [];
  let sections: ResolvedSection[] = [];
  try {
    const playing = (t: number) => resolvedCues.some((c) => t >= c.start - 1e-3 && t < c.end - 1e-3);
    const limit = Number.isFinite(duration) ? duration : Infinity;
    beats = getGrid().filter((b) => b.t < limit - 1e-3 && playing(b.t));
    sections = getSections()
      .filter((s) => s.start < limit - 1e-3)
      .map((s) => {
        const cue = resolvedCues.find((c) => c.id === s.cue);
        return { ...s, end: Math.min(s.end, cue?.end ?? s.end, limit) };
      });
  } catch (err) {
    if (!(err instanceof ResolveError)) throw err;
    diagnostics.push({ where: "music", message: err.message });
  }
  const resolvedShots: ResolvedShot[] = shots.map((s) => {
    const r: ResolvedShot = {
      id: s.id,
      track: s.track,
      start: attempt(`shot ${s.id} start`, () => shotStart(s)),
      end: attempt(`shot ${s.id} end`, () => shotEnd(s)),
    };
    if (s.content.kind === "clip") r.sourceIn = attempt(`shot ${s.id} source`, () => sourceIn(s));
    if (r.end < r.start - EPS) diagnostics.push({ where: `shot ${s.id}`, message: "ends before it starts" });
    return r;
  });
  const markers: ResolvedMarker[] = (project.markers ?? []).map((m) => ({
    id: m.id,
    label: m.label,
    t: attempt(`marker ${m.id}`, () => anchor(m.at)),
  }));
  const sfx: ResolvedSfx[] = (project.sfx ?? []).filter(inFormat).map((c) => ({
    id: c.id,
    sound: c.sound,
    t: attempt(`sound ${c.id}`, () => anchor(c.at)),
    gain: c.gain ?? 0.5,
  }));

  return {
    format,
    duration,
    lines,
    cues: resolvedCues,
    beats,
    sections,
    shots: resolvedShots,
    markers,
    sfx,
    diagnostics: dedupe(diagnostics),
  };
}

/** Resolves one anchor against a project, outside a full timeline pass. */
export function resolveAnchor(project: Project, a: Anchor, formatId?: string): number {
  const probe: Project = { ...project, markers: [...(project.markers ?? []), { id: "__probe", label: "", at: a }] };
  return resolveTimeline(probe, formatId).markers.find((m) => m.id === "__probe")!.t;
}

function gapAfter(line: Line, format: string, fallback: number) {
  return line.gaps?.[format] ?? line.gapAfter ?? fallback;
}

function dedupe(list: Diagnostic[]) {
  const seen = new Set<string>();
  return list.filter((d) => {
    const k = `${d.where}|${d.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
