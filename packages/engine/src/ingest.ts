/**
 * Importing: a folder of footage (and optionally a song) becomes a project. The footage stays where it is; the project
 * folder holds project.json, a copy of the song, and a .cache of small preview copies and thumbnails.
 */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readSync, rmSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { autoAssemble, formatPreset, SCHEMA_VERSION, STAGE_IDS, type Asset, type Brief, type Cut, type CutSpec, type Format, type Project, type ProjectFile } from "@beatsheet/schema";
import { averageColor, makeImageProxy, makePoster, makeStrip, makeVideoProxy, pool } from "./media.ts";
import { analyzeMusic } from "./music.ts";
import { assetPath, cachePaths, expandHome, ROOTS } from "./paths.ts";
import { kindOf, probe } from "./probe.ts";
import { createProject, loadFile, loadProject, saveProject, updateFile } from "./store.ts";

export type ImportOptions = {
  /** Footage folder; a project can also start empty. */
  folder?: string;
  id: string;
  title?: string;
  song?: string;
  brief?: Partial<Brief>;
  /** The first cut's length and platforms. */
  spec?: Partial<CutSpec>;
  /** Format preset ids; default vertical. */
  formats?: string[];
  /** Make a first cut as soon as the footage and song are in. */
  firstCut?: boolean;
  log?: (msg: string) => void;
  /** Fraction done, 0..1, across reading, the song and the preview copies. */
  onProgress?: (fraction: number) => void;
};

/** Photos and videos directly inside a folder (not subfolders), as import sees them. */
export function scanFolder(folder: string): { files: string[]; videos: number; photos: number } {
  const dir = resolve(expandHome(folder));
  const files = readdirSync(dir)
    .filter((f) => !f.startsWith(".") && kindOf(f) && kindOf(f) !== "audio")
    .sort();
  return { files, videos: files.filter((f) => kindOf(f) === "video").length, photos: files.filter((f) => kindOf(f) === "image").length };
}

export async function importFolder(opts: ImportOptions): Promise<Project> {
  const log = opts.log ?? (() => {});
  const progress = opts.onProgress ?? (() => {});
  const folder = opts.folder ? resolve(expandHome(opts.folder)) : undefined;
  const assets = folder ? await readFolder(folder, "footage", new Set(), log) : [];
  progress(0.08);

  const title = opts.title ?? (folder ? basename(folder).replace(/^\d{4}[_-]/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : opts.id);
  const formats: Format[] = (opts.formats?.length ? opts.formats : ["vertical"]).map((id) => {
    const f = formatPreset(id);
    if (!f) throw new Error(`Unknown format "${id}"`);
    return f;
  });
  const given = <T extends object>(o: T | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)));
  const stages = Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as Cut["stages"];
  stages.brief = { status: "done" };
  stages.material = assets.length ? { status: "active", summary: `${assets.length} files imported; not logged yet` } : { status: "todo", summary: "No footage yet" };
  stages.board = { status: "skipped", summary: "Montages go straight from music to assembly" };
  const doc: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: opts.id,
    title,
    sources: folder ? [{ id: "footage", path: folder }] : [],
    brief: { goal: `A short reel of ${title} to share`, ...given(opts.brief) },
    assets,
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "montage",
        spec: { platforms: [...new Set(formats.flatMap((f) => f.platforms ?? []))], targetLength: 30, maxLength: 60, ...given(opts.spec) },
        formats,
        stages,
        spine: "music",
        music: { cues: [] },
        tracks: [
          { id: "pic", kind: "picture", label: "Picture" },
          { id: "txt", kind: "text", label: "Text" },
        ],
        shots: [],
        notes: [],
      },
    ],
  };
  createProject(opts.id, doc);

  if (opts.song) {
    await addSong(opts.id, opts.song, log);
    progress(0.15);
  }
  await buildCache(opts.id, log, (f) => progress(0.15 + f * 0.82));
  if (opts.firstCut && opts.song && assets.length) {
    const loaded = loadProject(opts.id);
    const { project: cut, summary } = autoAssemble(loaded.project);
    saveProject(opts.id, cut, loaded.version);
    summary.forEach((line) => log(line));
  }
  progress(1);
  return loadProject(opts.id).project;
}

/** A folder's photos and videos as assets from source `source`, in the order they were shot. */
async function readFolder(folder: string, source: string, used: Set<string>, log: (msg: string) => void): Promise<Asset[]> {
  const files = scanFolder(folder).files;
  if (!files.length) throw new Error(`No photos or videos in ${folder}`);
  return readFiles(folder, files, source, used, log);
}

/** Some of a folder's files as assets from source `source`, in the order they were shot. */
async function readFiles(folder: string, files: string[], source: string, used: Set<string>, log: (msg: string) => void): Promise<Asset[]> {
  log(`Reading ${files.length} file${files.length === 1 ? "" : "s"} from ${folder}`);
  const assets: Asset[] = [];
  await pool(files, 8, async (file) => {
    const info = await probe(join(folder, file));
    const kind = info.kind === "image" ? "image" : "video";
    assets.push({
      id: assetId(file, kind, info.capturedAt, used),
      kind,
      source,
      path: file,
      label: labelFor(kind, info.capturedAt, info.duration),
      duration: info.duration,
      width: info.width,
      height: info.height,
      fps: info.fps,
      capturedAt: info.capturedAt,
      tags: tagsFor(file, info),
      provenance: { source: "import" },
    });
  });
  return assets.sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? "") || a.path.localeCompare(b.path));
}

/**
 * Adds footage to a project: whole folders, or single photos and videos from anywhere. Each folder becomes a source
 * (a file's own folder, holding just the files chosen from it); a folder the project already has gets only the files
 * that are new in it, so adding it again picks up what's been added since. Files already in the project are skipped.
 */
export async function addFootage(
  id: string,
  given: string | string[],
  log: (msg: string) => void = () => {},
  onProgress?: (fraction: number) => void,
): Promise<{ added: number; sources: string[] }> {
  const { doc, dir: projectFolder } = loadFile(id);
  const paths = (Array.isArray(given) ? given : [given]).map((p) => resolve(expandHome(p)));
  const byFolder = new Map<string, string[]>();
  const take = (folder: string, files: string[]) => byFolder.set(folder, [...(byFolder.get(folder) ?? []), ...files]);
  for (const p of paths) {
    if (!existsSync(p)) throw new Error(`There's nothing at ${p}`);
    if (statSync(p).isDirectory()) {
      const files = scanFolder(p).files;
      if (!files.length && paths.length === 1) throw new Error(`No photos or videos in ${p}`);
      take(p, files);
    } else {
      const kind = kindOf(p);
      if (!kind || kind === "audio") throw new Error(`${basename(p)} isn't a photo or a video`);
      take(dirname(p), [basename(p)]);
    }
  }
  const used = new Set(doc.assets.map((a) => a.id));
  const sources = [...doc.sources];
  const made: Project["sources"] = [];
  const assets: Asset[] = [];
  for (const [folder, files] of byFolder) {
    let source = sources.find((s) => resolve(projectFolder, expandHome(s.path)) === folder);
    if (!source) {
      let sid = "footage";
      for (let n = 2; sources.some((s) => s.id === sid); n++) sid = `footage-${n}`;
      source = { id: sid, path: folder, label: basename(folder) };
      sources.push(source);
      made.push(source);
    }
    const have = new Set(doc.assets.filter((a) => (a.source ?? doc.sources[0]?.id) === source!.id).map((a) => a.path));
    const fresh = [...new Set(files)].filter((f) => !have.has(f));
    if (fresh.length) assets.push(...(await readFiles(folder, fresh, source.id, used, log)));
  }
  if (!assets.length) throw new Error(paths.length === 1 && statSync(paths[0]!).isDirectory() ? "Everything in that folder is already in this project" : "That's all in this project already");
  updateFile(id, (d) => {
    for (const s of made) if (!d.sources.some((x) => x.id === s.id)) d.sources.push(s);
    d.assets.push(...assets);
  });
  await buildCache(id, log, onProgress);
  return { added: assets.length, sources: made.map((s) => s.id) };
}

/** A photo or video already in the project, as `duplicateOf` compares it. `hash` is `quickHash`, when it was needed. */
export type Seen = { id: string; name: string; kind: string; size?: number; capturedAt?: string; duration?: number; width?: number; height?: number; hash?: string };

/** A fingerprint of a file's bytes that's quick for big videos: its size, first and last megabyte. */
export function quickHash(file: string): string {
  const size = statSync(file).size;
  const chunk = Math.min(size, 1 << 20);
  const fd = openSync(file, "r");
  try {
    const head = Buffer.alloc(chunk);
    const tail = Buffer.alloc(chunk);
    readSync(fd, head, 0, chunk, 0);
    readSync(fd, tail, 0, chunk, size - chunk);
    return createHash("sha1").update(String(size)).update(head).update(tail).digest("hex");
  } finally {
    closeSync(fd);
  }
}

/**
 * The footage a new file duplicates, if any: the same name (ignoring the extension, and a browser's " (1)") with the
 * same size or capture time; or, renamed as downloads often are, the very same bytes shot at the same second, or a
 * video shot at the same second with the same length and size of picture. Photos from a burst share a second but
 * not their bytes, so they all come in.
 */
export function duplicateOf(f: Omit<Seen, "id">, seen: Seen[]): Seen | undefined {
  const stem = (n: string) => n.toLowerCase().replace(/\.[^.]+$/, "").replace(/\s*\(\d+\)$/, "");
  const sameSecond = (a?: string, b?: string) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < 1000;
  return seen.find(
    (s) =>
      (stem(s.name) === stem(f.name) && ((s.size !== undefined && s.size === f.size) || sameSecond(s.capturedAt, f.capturedAt))) ||
      (s.kind === f.kind && s.size !== undefined && s.size === f.size && (sameSecond(s.capturedAt, f.capturedAt) || (!!s.hash && s.hash === f.hash))) ||
      (f.kind === "video" && s.kind === "video" && sameSecond(s.capturedAt, f.capturedAt) && Math.abs((s.duration ?? 0) - (f.duration ?? 0)) < 0.1 && s.width === f.width && s.height === f.height),
  );
}

/**
 * Brings in photos and videos from files, folders or .zip archives somewhere else (a Google Photos download in
 * ~/Downloads, say): what the project doesn't have yet is copied into its own imported/ folder, so the originals can
 * be deleted, and added as footage from a source of its own. Files it already has, by `duplicateOf`, are skipped.
 */
export async function importMedia(
  id: string,
  given: string[],
  opts: { label?: string; from?: string } = {},
  log: (msg: string) => void = () => {},
): Promise<{ added: Asset[]; skipped: { file: string; asset: string }[] }> {
  const { doc, dir } = loadFile(id);
  const work = join(dir, "imported", ".incoming", randomUUID());
  const files: string[] = [];
  const zips: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) !f.startsWith(".") && walk(join(p, f));
    else if (extname(p).toLowerCase() === ".zip") zips.push(p);
    else if (kindOf(p) === "image" || kindOf(p) === "video") files.push(p);
  };
  try {
    for (const raw of given) {
      const p = resolve(expandHome(raw));
      if (!existsSync(p)) throw new Error(`There's nothing at ${p}`);
      walk(p);
    }
    // Archives (a Google Photos download of several) are unpacked and read like folders, a zip inside a zip too.
    for (let i = 0; i < zips.length; i++) {
      const out = join(work, String(i));
      mkdirSync(out, { recursive: true });
      log(`Unpacking ${basename(zips[i]!)}`);
      await promisify(execFile)("ditto", ["-x", "-k", zips[i]!, out]);
      walk(out);
    }
    const where = new Map<string, string>();
    const seen: Seen[] = doc.assets
      .filter((a) => (a.kind === "video" || a.kind === "image") && !a.cutout)
      .map((a) => {
        const file = assetPath({ sources: doc.sources }, dir, a);
        where.set(a.id, file);
        return { id: a.id, name: basename(a.path), kind: a.kind, size: existsSync(file) ? statSync(file).size : undefined, capturedAt: a.capturedAt, duration: a.duration, width: a.width, height: a.height };
      });
    const day = new Date().toISOString().slice(0, 10);
    const slug = (opts.label ?? (opts.from ? new URL(opts.from).hostname.replace(/^www\./, "") : "downloads")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "downloads";
    let batch = join(dir, "imported", `${day}-${slug}`);
    for (let n = 2; existsSync(batch); n++) batch = join(dir, "imported", `${day}-${slug}-${n}`);
    const skipped: { file: string; asset: string }[] = [];
    let copied = 0;
    for (const file of files) {
      const info = await probe(file);
      const kind = info.kind === "image" ? "image" : "video";
      const size = statSync(file).size;
      // Bytes are compared only between files of the same size, so most files are never read twice.
      const twins = seen.filter((s) => s.size === size);
      for (const s of twins) if (!s.hash && where.has(s.id)) s.hash = quickHash(where.get(s.id)!);
      const me = { name: basename(file), kind, size, capturedAt: info.capturedAt, duration: info.duration, width: info.width, height: info.height, hash: twins.length ? quickHash(file) : undefined };
      const dup = duplicateOf(me, seen);
      if (dup) {
        skipped.push({ file: basename(file), asset: dup.id });
        continue;
      }
      mkdirSync(batch, { recursive: true });
      let name = basename(file);
      for (let n = 2; existsSync(join(batch, name)); n++) name = `${basename(file, extname(file))}-${n}${extname(file)}`;
      copyFileSync(file, join(batch, name));
      // Later files in this batch are compared with it too (a zip and its loose copies, say).
      seen.push({ id: `${basename(batch)}/${name}`, ...me, name, hash: me.hash ?? quickHash(file) });
      copied++;
    }
    if (!copied) return { added: [], skipped };
    log(`Copied ${copied} new file${copied === 1 ? "" : "s"} into ${basename(batch)}`);
    const before = new Set(doc.assets.map((a) => a.id));
    const { sources } = await addFootage(id, batch, log);
    const label = opts.label ?? (opts.from ? new URL(opts.from).hostname.replace(/^www\./, "") : "Downloads");
    updateFile(id, (d) => void d.sources.forEach((s) => sources.includes(s.id) && (s.label = label)));
    return { added: loadFile(id).doc.assets.filter((a) => !before.has(a.id)), skipped };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Copies a song into the project, analyses its beats and sections, and makes it a cut's music (the first cut unless
 * named). With `use: false` it's only added to the project's music; `provenance` says where it came from (a generated
 * song, say).
 */
export async function addSong(
  id: string,
  song: string,
  log: (msg: string) => void = () => {},
  cut?: string,
  opts: { use?: boolean; label?: string; provenance?: Asset["provenance"] } = {},
): Promise<Asset> {
  const { project, dir, version } = loadProject(id, cut);
  const src = resolve(expandHome(song));
  const dest = join(dir, "music", basename(src));
  mkdirSync(join(dir, "music"), { recursive: true });
  if (!existsSync(dest)) copyFileSync(src, dest);
  log(`Analysing ${basename(src)}`);
  const a = await analyzeMusic(dest);
  log(`  ${a.grid.bpm} BPM · ${a.sections.map((s) => s.label).join(" → ")}`);
  const asset: Asset = {
    id: "song-" + basename(src, extname(src)).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32),
    kind: "music",
    path: dest,
    label: opts.label ?? basename(src, extname(src)),
    duration: a.duration,
    grid: a.grid,
    sections: a.sections,
    provenance: opts.provenance ?? { source: "import" },
    color: "#6b4f8f",
  };
  project.assets = [...project.assets.filter((x) => x.id !== asset.id), asset];
  if (opts.use !== false) project.music = { cues: [{ id: "m1", asset: asset.id }] };
  saveProject(id, project, version);
  return asset;
}

/** Makes every missing preview copy, poster and filmstrip. Safe to run again; finished files are skipped. */
/** One file's preview copy, poster and (for video) filmstrip; anything already made is kept. */
export async function ensureCached(project: { sources: Project["sources"] }, dir: string, a: Asset): Promise<void> {
  const src = assetPath(project, dir, a);
  const c = cachePaths(dir, a.id);
  // Cut-outs keep their transparency: the file itself plays (it's small already), and only thumbnails are made.
  if (a.cutout) {
    await makePoster(src, c.poster, a.kind === "video" ? "video" : "image", a.duration);
    if (a.kind === "video") await makeStrip(src, c.strip, a.duration ?? 1);
    return;
  }
  if (a.kind === "video") {
    await makeVideoProxy(src, c.proxy);
    await makePoster(c.proxy, c.poster, "video", a.duration);
    await makeStrip(c.proxy, c.strip, a.duration ?? 1);
  } else if (a.kind === "image") {
    await makeImageProxy(src, c.image);
    await makePoster(c.image, c.poster, "image");
  }
}

/**
 * Registers a file the agent made or found (a derived clip, a generated image, a voiceover) as an asset: reads what it
 * is, records where it came from, and makes its previews.
 */
export async function addAsset(
  id: string,
  file: string,
  meta: { id?: string; label?: string; tags?: string[]; rating?: number; provenance?: Asset["provenance"]; cutout?: Asset["cutout"]; capturedAt?: string } = {},
): Promise<Asset> {
  const path = resolve(expandHome(file));
  if (!existsSync(path)) throw new Error(`No file at ${path}`);
  const info = await probe(path);
  const kind: Asset["kind"] = info.kind === "image" ? "image" : info.kind === "video" ? "video" : meta.tags?.includes("voice") ? "voice" : meta.tags?.includes("sfx") ? "sfx" : "audio";
  const { doc, dir } = loadFile(id);
  const asset: Asset = {
    id: meta.id ? freeAssetId(meta.id, new Set(doc.assets.map((a) => a.id))) : assetId(basename(path), kind, info.capturedAt, new Set(doc.assets.map((a) => a.id))),
    kind,
    path,
    label: meta.label ?? basename(path, extname(path)),
    duration: info.duration,
    width: info.width,
    height: info.height,
    fps: info.fps,
    capturedAt: meta.capturedAt,
    tags: meta.tags,
    rating: meta.rating,
    provenance: meta.provenance ?? { source: "generated", createdAt: new Date().toISOString() },
    cutout: meta.cutout,
  };
  await ensureCached({ sources: doc.sources }, dir, asset);
  updateFile(id, (d) => void d.assets.push(asset));
  return asset;
}

export async function buildCache(id: string, log: (msg: string) => void = () => {}, onProgress?: (fraction: number) => void): Promise<void> {
  const { project, dir } = loadProject(id);
  const media = project.assets.filter((a) => a.kind === "video" || a.kind === "image");
  const colors = new Map<string, string>();
  const started = Date.now();
  log(`Making preview copies and thumbnails for ${media.length} files`);
  await pool(
    media,
    3,
    async (a) => {
      await ensureCached(project, dir, a);
      colors.set(a.id, await averageColor(cachePaths(dir, a.id).poster));
    },
    (n) => {
      onProgress?.(n / media.length);
      if (n % 5 === 0 || n === media.length) log(`  ${n}/${media.length} (${Math.round((Date.now() - started) / 1000)}s)`);
    },
  );
  // Store swatch colours so the UI has something to show even without thumbnails.
  const fresh = loadProject(id);
  for (const a of fresh.project.assets) if (colors.has(a.id) && !a.color) a.color = colors.get(a.id);
  saveProject(id, fresh.project, fresh.version);
}

function freeAssetId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

function assetId(file: string, kind: string, capturedAt: string | undefined, used: Set<string>): string {
  const m = capturedAt?.match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  const base = (kind === "image" ? "p-" : "v-") + (m ? `${m[1]}${m[2]}-${m[3]}${m[4]}${m[5]}` : basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24));
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

function labelFor(kind: string, capturedAt: string | undefined, duration: number | undefined): string {
  const when = capturedAt
    ? new Date(capturedAt.length === 19 ? capturedAt : capturedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
  const what = kind === "image" ? "Photo" : `Video ${Math.round(duration ?? 0)}s`;
  return when ? `${what} · ${when}` : what;
}

function tagsFor(file: string, info: { width?: number; height?: number; fps?: number; duration?: number }): string[] {
  const tags: string[] = [];
  if (info.width && info.height) tags.push(info.height > info.width ? "portrait" : info.width > info.height ? "landscape" : "square");
  if ((info.fps ?? 0) >= 100) tags.push("high frame rate");
  if (/^dji/i.test(file)) tags.push("drone");
  if ((info.duration ?? 0) > 60) tags.push("long");
  return tags;
}

export { ROOTS };
