/**
 * Importing: a folder of footage (and optionally a song) becomes a project. The footage stays where it is; the project
 * folder holds project.json, a copy of the song, and a .cache of small preview copies and thumbnails.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { SCHEMA_VERSION, STAGE_IDS, type Asset, type Project } from "@beatsheet/schema";
import { averageColor, makeImageProxy, makePoster, makeStrip, makeVideoProxy, pool } from "./media.ts";
import { analyzeMusic } from "./music.ts";
import { assetPath, cachePaths, expandHome, ROOTS } from "./paths.ts";
import { kindOf, probe } from "./probe.ts";
import { createProject, loadProject, saveProject } from "./store.ts";

export type ImportOptions = {
  folder: string;
  id: string;
  title?: string;
  song?: string;
  log?: (msg: string) => void;
};

const VERTICAL = { id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30, platforms: ["Instagram Reels", "TikTok", "YouTube Shorts"] };

export async function importFolder(opts: ImportOptions): Promise<Project> {
  const log = opts.log ?? (() => {});
  const folder = resolve(expandHome(opts.folder));
  const files = readdirSync(folder)
    .filter((f) => !f.startsWith(".") && kindOf(f) && kindOf(f) !== "audio")
    .sort();
  if (!files.length) throw new Error(`No photos or videos in ${folder}`);
  log(`Reading ${files.length} files from ${folder}`);

  const assets: Asset[] = [];
  const used = new Set<string>();
  await pool(files, 8, async (file) => {
    const info = await probe(join(folder, file));
    const kind = info.kind === "image" ? "image" : "video";
    assets.push({
      id: assetId(file, kind, info.capturedAt, used),
      kind,
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
  assets.sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? "") || a.path.localeCompare(b.path));

  const title = opts.title ?? basename(folder).replace(/^\d{4}[_-]/, "").replace(/[_-]+/g, " ");
  const project: Project = {
    schema: SCHEMA_VERSION,
    id: opts.id,
    title: title.replace(/\b\w/g, (c) => c.toUpperCase()),
    recipe: "montage",
    mediaRoot: folder,
    brief: { goal: `A short reel of ${title} to share`, platforms: VERTICAL.platforms, targetLength: 30, maxLength: 60 },
    formats: [VERTICAL],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as Project["stages"],
    spine: "music",
    assets,
    music: { cues: [] },
    tracks: [
      { id: "pic", kind: "picture", label: "Picture" },
      { id: "txt", kind: "text", label: "Text" },
    ],
    shots: [],
    notes: [],
  };
  project.stages.brief = { status: "active" };
  project.stages.material = { status: "active", summary: `${assets.length} files imported; not logged yet` };
  project.stages.board = { status: "skipped", summary: "Montages go straight from music to assembly" };
  const { dir } = createProject(opts.id, project);

  if (opts.song) await addSong(opts.id, opts.song, log);
  await buildCache(opts.id, log);
  return loadProject(opts.id).project;
}

/** Copies a song into the project, analyses its beats and sections, and makes it the music. */
export async function addSong(id: string, song: string, log: (msg: string) => void = () => {}): Promise<Asset> {
  const { project, dir, version } = loadProject(id);
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
    label: basename(src, extname(src)),
    duration: a.duration,
    grid: a.grid,
    sections: a.sections,
    provenance: { source: "import" },
    color: "#6b4f8f",
  };
  project.assets = [...project.assets.filter((x) => x.id !== asset.id), asset];
  project.music = { cues: [{ id: "m1", asset: asset.id }] };
  saveProject(id, project, version);
  return asset;
}

/** Makes every missing preview copy, poster and filmstrip. Safe to run again; finished files are skipped. */
export async function buildCache(id: string, log: (msg: string) => void = () => {}): Promise<void> {
  const { project, dir } = loadProject(id);
  const media = project.assets.filter((a) => a.kind === "video" || a.kind === "image");
  const colors = new Map<string, string>();
  const started = Date.now();
  log(`Making preview copies and thumbnails for ${media.length} files`);
  await pool(
    media,
    3,
    async (a) => {
      const src = assetPath(project, dir, a);
      const c = cachePaths(dir, a.id);
      if (a.kind === "video") {
        await makeVideoProxy(src, c.proxy);
        await makePoster(c.proxy, c.poster, "video", a.duration);
        await makeStrip(c.proxy, c.strip, a.duration ?? 1);
      } else {
        await makeImageProxy(src, c.image);
        await makePoster(c.image, c.poster, "image");
      }
      colors.set(a.id, await averageColor(c.poster));
    },
    (n) => {
      if (n % 5 === 0 || n === media.length) log(`  ${n}/${media.length} (${Math.round((Date.now() - started) / 1000)}s)`);
    },
  );
  // Store swatch colours so the UI has something to show even without thumbnails.
  const fresh = loadProject(id);
  for (const a of fresh.project.assets) if (colors.has(a.id) && !a.color) a.color = colors.get(a.id);
  saveProject(id, fresh.project, fresh.version);
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
