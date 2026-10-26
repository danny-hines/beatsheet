/** Loading and integrity checks: schema validation plus the cross-references a schema can't express. */
import { cutView, upgrade } from "./cuts.ts";
import { ProjectFile, SFX_SOUNDS, type Anchor, type Project } from "./types.ts";

export type CheckIssue = { path: string; message: string };

/** Reads a project file, upgrading one from before cuts. */
export function parseFile(input: unknown): { ok: true; file: ProjectFile } | { ok: false; issues: CheckIssue[] } {
  const r = ProjectFile.safeParse(upgrade(input));
  if (!r.success) {
    return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
  }
  return { ok: true, file: r.data };
}

/** Every id the project refers to must exist, in the shared material and in every cut. An empty list means it's consistent. */
export function checkReferences(file: ProjectFile): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const seen = new Set<string>();
  for (const c of file.cuts) {
    if (seen.has(c.id)) issues.push({ path: "cuts", message: `duplicate cut id "${c.id}"` });
    seen.add(c.id);
  }
  const sources = new Set(file.sources.map((s) => s.id));
  file.assets.forEach((a, i) => a.source && !sources.has(a.source) && issues.push({ path: `assets.${i}.source`, message: `unknown source "${a.source}"` }));
  const assetIds = new Set(file.assets.map((a) => a.id));
  file.assets.forEach((a, i) => a.cutout && !assetIds.has(a.cutout.of) && issues.push({ path: `assets.${i}.cutout.of`, message: `unknown asset "${a.cutout.of}"` }));
  file.cuts.forEach((c, i) => {
    for (const issue of checkCut(cutView(file, c.id))) {
      // Shared parts are checked once, with the first cut.
      if (i > 0 && (issue.path === "assets" || issue.path.startsWith("assets."))) continue;
      issues.push({ ...issue, path: issue.path.startsWith("assets") ? issue.path : `cuts.${i}.${issue.path}` });
    }
  });
  return issues;
}

/** The references inside one cut (with the shared assets it points at). */
export function checkCut(p: Project): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const ids = {
    formats: new Set(p.formats.map((f) => f.id)),
    assets: new Set(p.assets.map((a) => a.id)),
    tracks: new Set(p.tracks.map((t) => t.id)),
    shots: new Set(p.shots.map((s) => s.id)),
    lines: new Set(p.voice?.lines.map((l) => l.id) ?? []),
    cues: new Set(p.music?.cues.map((c) => c.id) ?? []),
    markers: new Set(p.markers?.map((m) => m.id) ?? []),
    sections: new Set(p.assets.flatMap((a) => a.sections ?? []).map((s) => s.id)),
  };
  const dupes = (name: string, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const x of list) {
      if (seen.has(x.id)) add(name, `duplicate id "${x.id}"`);
      seen.add(x.id);
    }
  };
  dupes("formats", p.formats);
  dupes("assets", p.assets);
  dupes("tracks", p.tracks);
  dupes("shots", p.shots);
  dupes("voice.lines", p.voice?.lines ?? []);
  dupes("music.cues", p.music?.cues ?? []);
  dupes("notes", p.notes);
  dupes("markers", p.markers ?? []);
  dupes("sfx", p.sfx ?? []);

  const formats = (path: string, list: string[] | undefined) => {
    for (const f of list ?? []) if (!ids.formats.has(f)) add(path, `unknown format "${f}"`);
  };
  const anchor = (path: string, a: Anchor | undefined) => {
    if (!a) return;
    if ((a.kind === "line" || a.kind === "word") && !ids.lines.has(a.line)) add(path, `unknown line "${a.line}"`);
    if ((a.kind === "shot" || a.kind === "moment") && !ids.shots.has(a.shot)) add(path, `unknown shot "${a.shot}"`);
    if (a.kind === "section" && !ids.sections.has(a.section)) add(path, `unknown section "${a.section}"`);
    if (a.kind === "beat" && a.from && !ids.sections.has(a.from)) add(path, `unknown section "${a.from}"`);
    if (a.kind === "marker" && !ids.markers.has(a.marker)) add(path, `unknown marker "${a.marker}"`);
  };

  p.voice?.lines.forEach((l, i) => {
    formats(`voice.lines.${i}.only`, l.only);
    formats(`voice.lines.${i}.gaps`, Object.keys(l.gaps ?? {}));
  });
  p.music?.cues.forEach((c, i) => {
    const path = `music.cues.${i}`;
    if (!ids.assets.has(c.asset)) add(path, `unknown asset "${c.asset}"`);
    formats(`${path}.only`, c.only);
    anchor(`${path}.sync.at`, c.sync?.at);
    anchor(`${path}.start`, c.start);
    anchor(`${path}.end`, c.end);
  });
  p.shots.forEach((s, i) => {
    const path = `shots.${i}`;
    if (!ids.tracks.has(s.track)) add(path, `unknown track "${s.track}"`);
    formats(`${path}.only`, s.only);
    anchor(`${path}.start`, s.start);
    anchor(`${path}.end`, s.end);
    const c = s.content;
    if (c.kind === "clip") {
      if (!ids.assets.has(c.asset)) add(path, `unknown asset "${c.asset}"`);
      anchor(`${path}.content.sync.at`, c.sync?.at);
      // Effects and reframes that follow a subject need it found on that clip first (find_subjects or track_subject).
      const subjects = new Set(p.assets.find((a) => a.id === c.asset)?.subjects?.map((x) => x.id) ?? []);
      c.effects?.forEach((e, j) => subjects.has(e.subject) || add(`${path}.content.effects.${j}.subject`, `"${c.asset}" has no subject "${e.subject}"`));
      for (const [fmt, r] of Object.entries(c.reframe ?? {}))
        if (r.follow && !subjects.has(r.follow)) add(`${path}.content.reframe.${fmt}.follow`, `"${c.asset}" has no subject "${r.follow}"`);
      formats(`${path}.content.reframe`, Object.keys(c.reframe ?? {}));
    }
    if (c.kind === "generated") {
      for (const a of [...(c.takes ?? []), ...(c.take ? [c.take] : []), ...(c.refs ?? [])])
        if (!ids.assets.has(a)) add(path, `unknown asset "${a}"`);
      if (c.take && c.takes && !c.takes.includes(c.take)) add(path, `take "${c.take}" is not in takes`);
    }
  });
  p.sfx?.forEach((c, i) => {
    if (!(SFX_SOUNDS as readonly string[]).includes(c.sound) && !ids.assets.has(c.sound)) add(`sfx.${i}.sound`, `"${c.sound}" is neither a built-in sound nor an asset`);
    formats(`sfx.${i}.only`, c.only);
    anchor(`sfx.${i}.at`, c.at);
  });
  if (p.look?.logo && !ids.assets.has(p.look.logo)) add("look.logo", `unknown asset "${p.look.logo}"`);
  p.markers?.forEach((m, i) => anchor(`markers.${i}.at`, m.at));
  anchor("end", p.end);
  p.notes.forEach((n, i) => {
    const t = n.target;
    const path = `notes.${i}.target`;
    if (t.kind === "shot" && !ids.shots.has(t.shot)) add(path, `unknown shot "${t.shot}"`);
    if ((t.kind === "line" || t.kind === "word") && !ids.lines.has(t.line)) add(path, `unknown line "${t.line}"`);
    if (t.kind === "asset" && !ids.assets.has(t.asset)) add(path, `unknown asset "${t.asset}"`);
    if (t.kind === "cue" && !ids.cues.has(t.cue)) add(path, `unknown cue "${t.cue}"`);
    if (t.kind === "section" && !ids.sections.has(t.section)) add(path, `unknown section "${t.section}"`);
  });
  return issues;
}
