/** Loading and integrity checks: schema validation plus the cross-references a schema can't express. */
import { Project, type Anchor } from "./types.ts";

export type CheckIssue = { path: string; message: string };

export function parseProject(input: unknown): { ok: true; project: Project } | { ok: false; issues: CheckIssue[] } {
  const r = Project.safeParse(input);
  if (!r.success) {
    return { ok: false, issues: r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) };
  }
  return { ok: true, project: r.data };
}

/** Every id a project refers to must exist. Returns problems; an empty list means the project is consistent. */
export function checkReferences(p: Project): CheckIssue[] {
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
      formats(`${path}.content.reframe`, Object.keys(c.reframe ?? {}));
    }
    if (c.kind === "generated") {
      for (const a of [...(c.takes ?? []), ...(c.take ? [c.take] : []), ...(c.refs ?? [])])
        if (!ids.assets.has(a)) add(path, `unknown asset "${a}"`);
      if (c.take && c.takes && !c.takes.includes(c.take)) add(path, `take "${c.take}" is not in takes`);
    }
  });
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
