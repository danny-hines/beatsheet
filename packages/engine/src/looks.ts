/**
 * Looks from the footage. `footagePalette` reads the colours a set of pictures is made of (the sand, the sea, the
 * towels) and suggests a look's colours from them; `previewLooks` draws a few candidate looks on the project's own
 * footage, side by side, so the person can pick one by eye.
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { lookColorsFrom, paletteOf, type Asset, type FootageMood, type Look, type LookColors, type Project, type Shot, type Swatch } from "@beatsheet/schema";
import { cachePaths } from "./paths.ts";
import { loadProject } from "./store.ts";

export type FootagePalette = { swatches: Swatch[]; vivid: Swatch[]; mood: FootageMood; colors: LookColors; assets: string[]; image: Buffer };

const isPicture = (a: Asset | undefined): a is Asset => !!a && (a.kind === "video" || a.kind === "image") && !a.cutout;

/** The pictures a look should come from: the ones asked for, else the cut's, else the keepers, else all but rejects. */
function picturesFor(p: Project, ids?: string[]): Asset[] {
  const byId = new Map(p.assets.map((a) => [a.id, a]));
  if (ids?.length) return ids.map((id) => byId.get(id)).filter(isPicture);
  const inCut = [...new Set(p.shots.flatMap((s) => (s.content.kind === "clip" ? [s.content.asset] : [])))].map((id) => byId.get(id)).filter(isPicture);
  if (inCut.length >= 3) return inCut;
  const keepers = p.assets.filter((a) => (a.rating ?? 0) >= 3 && isPicture(a));
  if (keepers.length >= 3) return keepers;
  return p.assets.filter((a) => a.rating !== -1 && isPicture(a));
}

/** `n` of `xs`, spread evenly from first to last. */
const spread = <T>(xs: T[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]!));

export async function footagePalette(id: string, opts: { cut?: string; assets?: string[] } = {}): Promise<FootagePalette> {
  const { project, dir } = loadProject(id, opts.cut);
  const chunks: Buffer[] = [];
  const used: string[] = [];
  for (const a of spread(picturesFor(project, opts.assets), 48)) {
    const c = cachePaths(dir, a.id);
    try {
      // A clip's 8-frame strip or a photo's poster, squeezed to a couple of thousand pixels: plenty for colour.
      const [w, h] = a.kind === "video" ? [128, 16] : [44, 44];
      chunks.push(await sharp(a.kind === "video" ? c.strip : c.poster).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer());
      used.push(a.id);
    } catch {
      // No preview made yet; the rest will do.
    }
  }
  if (!used.length) throw new Error(`None of these pictures has a preview yet: run \`npm run beatsheet -- cache ${id}\` first.`);
  const { swatches, vivid, mood } = paletteOf(new Uint8Array(Buffer.concat(chunks)));
  const colors = lookColorsFrom({ swatches, vivid });
  return { swatches, vivid, mood, colors, assets: used, image: await paletteImage(swatches, vivid, colors) };
}

/**
 * Three bands: the footage's colours by how much of it each is, its vivid colours (however small), and the look's
 * colours suggested from them.
 */
async function paletteImage(swatches: Swatch[], vivid: Swatch[], colors: LookColors): Promise<Buffer> {
  const W = 900, top = 90, gap = 8, mid = 40, H = top + gap + mid + gap + 60;
  const px = Buffer.alloc(W * H * 3, 0x24);
  const fill = (x0: number, x1: number, y0: number, y1: number, hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let y = y0; y < y1; y++)
      for (let x = Math.round(x0); x < Math.min(W, Math.round(x1)); x++) px.set([r!, g!, b!], (y * W + x) * 3);
  };
  const total = swatches.reduce((s, w) => s + w.share, 0) || 1;
  let x = 0;
  for (const s of swatches) {
    const w = (s.share / total) * W;
    fill(x, x + w, 0, top, s.hex);
    x += w;
  }
  const vividTotal = vivid.reduce((s, w) => s + w.share, 0);
  x = 0;
  for (const s of vivid) {
    const w = (s.share / vividTotal) * W;
    fill(x, x + w, top + gap, top + gap + mid, s.hex);
    x += w;
  }
  Object.values(colors).forEach((hex, i, all) => fill((i * W) / all.length, ((i + 1) * W) / all.length, top + gap + mid + gap, H, hex));
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

export type LookOption = { id: string; label?: string; look: Look };

/** The picture to show the looks on: the one asked for, else the best-rated picture in the cut, else in the project. */
function heroOf(p: Project, asked?: string): Asset {
  const byId = new Map(p.assets.map((a) => [a.id, a]));
  if (asked) {
    const a = byId.get(asked);
    if (!isPicture(a)) throw new Error(`${asked} isn't a photo or clip in this project`);
    return a;
  }
  const best = (xs: Asset[]) => [...xs].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
  const inCut = p.shots.flatMap((s) => (s.content.kind === "clip" ? [byId.get(s.content.asset)] : [])).filter(isPicture);
  const hero = best(inCut) ?? best(p.assets.filter((a) => a.rating !== -1 && isPicture(a)));
  if (!hero) throw new Error("The project has no photos or clips to show a look on yet.");
  return hero;
}

/**
 * A six-second stand-in cut in one look: the hero picture graded, with a title over it, then a designed card (the
 * kit's title, or a scene of the project's own) on the look's paper.
 */
function sampleOf(p: Project, look: Look, hero: Asset, o: { title: string; subtitle?: string; scene?: { component: string; props?: Record<string, unknown> } }): Project {
  const used = p.shots.find((s) => s.content.kind === "clip" && s.content.asset === hero.id);
  const moment = [...(hero.moments ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const shots: Shot[] = [
    {
      id: "look-footage",
      track: "pic",
      fidelity: "final",
      start: { kind: "time", t: 0 },
      content: { kind: "clip", asset: hero.id, in: moment ? Math.max(0, moment.t - 2) : undefined, reframe: used?.content.kind === "clip" ? used.content.reframe : undefined },
    },
    {
      id: "look-card",
      track: "pic",
      fidelity: "final",
      start: { kind: "time", t: 3 },
      content: o.scene ? { kind: "coded", component: o.scene.component, props: o.scene.props } : { kind: "coded", component: "kit:Title", props: { text: o.title, kicker: o.subtitle } },
    },
    { id: "look-title", track: "text", fidelity: "final", start: { kind: "time", t: 0.2 }, end: { kind: "time", t: 3 }, content: { kind: "text", text: o.title, style: "title-bold" } },
  ];
  return {
    ...p,
    look,
    tracks: [
      { id: "pic", kind: "picture", label: "Picture" },
      { id: "text", kind: "text", label: "Text" },
    ],
    shots,
    voice: undefined,
    music: undefined,
    captions: undefined,
    sfx: undefined,
    markers: undefined,
    notes: [],
    end: { kind: "time", t: 6 },
  };
}

/**
 * Each look drawn on the project's own footage: the hero picture in its grade with a title over it, then a designed
 * card, then its colours. One JPEG per look in the project's made/looks/ (for a choose hand-off's `image`), and all of
 * them side by side for the agent to compare.
 */
export async function previewLooks(
  id: string,
  opts: { cut?: string; format?: string; looks: LookOption[]; asset?: string; title?: string; subtitle?: string; scene?: { component: string; props?: Record<string, unknown> } },
): Promise<{ files: string[]; sheet: Buffer; hero: string }> {
  const { project, dir } = loadProject(id, opts.cut);
  const fmt = project.formats.find((f) => f.id === opts.format) ?? project.formats[0]!;
  const hero = heroOf(project, opts.asset);
  const { renderStills } = await import("./render.ts");
  const out = join(dir, "made", "looks");
  mkdirSync(out, { recursive: true });
  const work = join(tmpdir(), `beatsheet-looks-${process.pid}-${Date.now().toString(36)}`);
  const stamp = Date.now().toString(36);
  const files: string[] = [];
  const panels: Buffer[] = [];
  try {
    for (const [i, option] of opts.looks.entries()) {
      const sample = sampleOf(project, option.look, hero, { title: opts.title ?? project.title, subtitle: opts.subtitle, scene: opts.scene });
      const stillsDir = join(work, String(i));
      mkdirSync(stillsDir, { recursive: true });
      const stills = await renderStills(id, { project: sample, format: fmt.id, times: [2.4, 5.6], scale: fmt.height > fmt.width ? 0.3 : 0.25, dir: stillsDir });
      const panel = await sidePanel(stills, option.look);
      const file = join(out, `${option.id.replace(/[^\w-]+/g, "-")}-${stamp}.jpg`);
      await sharp(panel).jpeg({ quality: 86 }).toFile(file);
      files.push(file);
      panels.push(panel);
    }
    return { files, sheet: await sideBySide(panels, 24, "#1b1c20"), hero: hero.id };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** One look's preview: its two stills side by side, with a strip of its colours under them. */
async function sidePanel(stills: string[], look: Look): Promise<Buffer> {
  const row = await sideBySide(await Promise.all(stills.map((s) => sharp(s).toBuffer())), 8, "#1b1c20");
  const { width = 0 } = await sharp(row).metadata();
  const c = look.colors ?? {};
  const colors = [c.paper, c.ink, c.accent, c.accent2, c.accent3].filter((x): x is string => !!x && /^#[0-9a-f]{6}$/i.test(x));
  if (!colors.length) return row;
  const strip = await Promise.all(colors.map((hex) => sharp({ create: { width: Math.floor(width / colors.length), height: 28, channels: 3, background: hex } }).png().toBuffer()));
  return stack([row, await sideBySide(strip, 0, "#1b1c20")], 8, "#1b1c20");
}

async function sideBySide(images: Buffer[], gap: number, background: string): Promise<Buffer> {
  const sizes = await Promise.all(images.map((b) => sharp(b).metadata()));
  const width = sizes.reduce((s, m) => s + (m.width ?? 0), 0) + gap * (images.length - 1);
  const height = Math.max(...sizes.map((m) => m.height ?? 0));
  let x = 0;
  const layers = images.map((input, i) => {
    const left = x;
    x += (sizes[i]!.width ?? 0) + gap;
    return { input, left, top: 0 };
  });
  return sharp({ create: { width, height, channels: 3, background } }).composite(layers).png().toBuffer();
}

async function stack(images: Buffer[], gap: number, background: string): Promise<Buffer> {
  const sizes = await Promise.all(images.map((b) => sharp(b).metadata()));
  const width = Math.max(...sizes.map((m) => m.width ?? 0));
  const height = sizes.reduce((s, m) => s + (m.height ?? 0), 0) + gap * (images.length - 1);
  let y = 0;
  const layers = images.map((input, i) => {
    const top = y;
    y += (sizes[i]!.height ?? 0) + gap;
    return { input, left: 0, top };
  });
  return sharp({ create: { width, height, channels: 3, background } }).composite(layers).png().toBuffer();
}
