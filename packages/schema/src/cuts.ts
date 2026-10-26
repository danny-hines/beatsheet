/**
 * Cuts: moving between the project file and one cut's view of it, branching new cuts, and upgrading files written
 * before cuts existed. Everything that edits a project edits a view and writes it back with `withCut`.
 */
import { SCHEMA_V1, SCHEMA_VERSION, type Cut, type Origin, type Project, type ProjectFile } from "./types.ts";

type Obj = Record<string, unknown>;
const defined = (o: Obj) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * A file from before cuts (one cut, one media folder) in today's shape: its cut becomes "Main cut", its media folder
 * the first source, and the length and platforms move from the brief to the cut. Anything else passes through.
 */
export function upgrade(input: unknown): unknown {
  const p = input as Obj | null;
  if (!p || typeof p !== "object" || p.schema !== SCHEMA_V1) return input;
  const { platforms, targetLength, maxLength, ...brief } = (p.brief ?? {}) as Obj;
  return defined({
    schema: SCHEMA_VERSION,
    id: p.id,
    title: p.title,
    sources: typeof p.mediaRoot === "string" ? [{ id: "footage", path: p.mediaRoot }] : [],
    codeRoot: p.codeRoot,
    brief,
    assets: p.assets,
    cuts: [
      defined({
        id: "main",
        name: "Main cut",
        recipe: p.recipe,
        spec: defined({ platforms, targetLength, maxLength }),
        formats: p.formats,
        stages: p.stages,
        spine: p.spine,
        voice: p.voice,
        music: p.music,
        tracks: p.tracks,
        shots: p.shots,
        markers: p.markers,
        notes: p.notes,
        end: p.end,
      }),
    ],
  });
}

export const cutOf = (file: ProjectFile, cutId?: string): Cut => file.cuts.find((c) => c.id === cutId) ?? file.cuts[0]!;

/** One cut seen with the shared material. An unknown id falls back to the first cut. */
export function cutView(file: ProjectFile, cutId?: string): Project {
  const { id, name, origin, ...body } = cutOf(file, cutId);
  const { schema: _schema, cuts: _cuts, turn: _turn, ...shared } = file;
  return { ...shared, cut: defined({ id, name, origin }) as Project["cut"], ...body };
}

/** Writes a cut's view back into the file: its shared parts over the file's, its own parts over that cut. */
export function withCut(file: ProjectFile, view: Project): ProjectFile {
  const { cut, id, title, sources, codeRoot, look, brief, assets, ...body } = view;
  const next = defined({ id: cut.id, name: cut.name, origin: cut.origin, ...body }) as Cut;
  const i = file.cuts.findIndex((c) => c.id === cut.id);
  return defined({
    schema: file.schema,
    id,
    title,
    sources,
    codeRoot,
    look,
    brief,
    assets,
    cuts: i < 0 ? [...file.cuts, next] : file.cuts.map((c, j) => (j === i ? next : c)),
    turn: file.turn,
  }) as ProjectFile;
}

/** A cut id from its name that no other cut in the file uses: "Bouncy take" → "bouncy-take". */
export function cutIdFor(file: ProjectFile, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "cut";
  let id = base;
  for (let n = 2; file.cuts.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * A new cut copied from another: same shots, music and formats, its own name, spec and history. Notes don't come
 * along; they were about the other cut.
 */
export function branchCut(file: ProjectFile, from: string, opts: { name: string; id?: string; spec?: Cut["spec"]; origin: Omit<Origin, "from"> }): { file: ProjectFile; cut: Cut } {
  const source = file.cuts.find((c) => c.id === from);
  if (!source) throw new Error(`No cut "${from}"`);
  const cut: Cut = {
    ...structuredClone(source),
    id: opts.id && !file.cuts.some((c) => c.id === opts.id) ? opts.id : cutIdFor(file, opts.name),
    name: opts.name,
    spec: { ...source.spec, ...opts.spec },
    origin: { ...opts.origin, from, at: opts.origin.at ?? new Date().toISOString() },
    notes: [],
  };
  return { file: { ...file, cuts: [...file.cuts, cut] }, cut };
}

/**
 * A new cut built from scratch: another roll from the same footage, or the same footage at another length or shape.
 * It takes the recipe and tracks of the cut it sits beside (`like`), but none of its shots, music, voice or notes, and
 * its stages after the material start over.
 */
export function freshCut(
  file: ProjectFile,
  like: string,
  opts: { name: string; id?: string; formats: Cut["formats"]; spec: Cut["spec"]; origin: Omit<Origin, "from"> },
): { file: ProjectFile; cut: Cut } {
  const model = file.cuts.find((c) => c.id === like);
  if (!model) throw new Error(`No cut "${like}"`);
  const stages = Object.fromEntries(
    Object.entries(model.stages).map(([id, s]) => [id, id === "brief" || id === "material" || s.status === "skipped" ? s : { status: "todo" as const }]),
  ) as Cut["stages"];
  const cut: Cut = {
    id: opts.id && !file.cuts.some((c) => c.id === opts.id) ? opts.id : cutIdFor(file, opts.name),
    name: opts.name,
    origin: { ...opts.origin, at: opts.origin.at ?? new Date().toISOString() },
    recipe: model.recipe,
    spec: opts.spec,
    formats: opts.formats,
    stages,
    spine: model.spine,
    music: { cues: [] },
    tracks: structuredClone(model.tracks),
    shots: [],
    notes: [],
  };
  return { file: { ...file, cuts: [...file.cuts, cut] }, cut };
}
