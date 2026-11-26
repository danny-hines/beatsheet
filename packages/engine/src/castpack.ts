/**
 * Procedural cast-sheet packaging: materializes composite face+outfit reference sheets on disk via sharp when a model's
 * strategy or reference cap packs a character's decoupled ingredients into one image. Cached by content hash under
 * `.cache/castpack/` so repeated takes and retries reuse the exact same file in milliseconds at zero API cost.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { PackedRef, Project } from "@beatsheet/schema";
import { pictureBytes } from "./media.ts";
import { assetPath, cachePaths } from "./paths.ts";
import { replaceFile } from "./platform.ts";
import { refFile } from "./refcut.ts";

/** Neutral mid-gray canvas matching beatsheet's face and outfit turnaround sheets. */
const CANVAS_BG = { r: 140, g: 140, b: 140 };
const DIVIDER_BG = { r: 106, g: 106, b: 106 };
const WIDTH = 1536;
const HEIGHT = 864;
const PAD = 24;
const GAP = 16;

/** All unique real project asset ids represented by a packed reference list (unpacking composites into face + outfit). */
export function packedRefAssets(packed: PackedRef[] | undefined, fallbackRefs?: string[]): string[] {
  if (!packed?.length) return fallbackRefs ? [...new Set(fallbackRefs)] : [];
  return [...new Set(packed.flatMap((r) => (r.kind === "composite" ? [r.face, r.outfit] : [r.asset])))];
}

/**
 * Composites a character's face ingredient (`portrait` or `faceSheet`) beside its `outfitSheet` onto a clean 16:9
 * neutral mid-gray card, cached by SHA-256 of the source bytes and layout mode under `.cache/castpack/`.
 */
export async function compositeSheet(
  project: Pick<Project, "sources" | "assets">,
  dir: string,
  spec: { face: string; outfit: string; mode: "portrait-outfit" | "face360-outfit" },
): Promise<string> {
  const resolveFile = (id: string) => {
    const a = project.assets.find((x) => x.id === id);
    if (!a) throw new Error(`The picture "${id}" isn't in the project any more`);
    const cached = cachePaths(dir, a.id).image;
    return existsSync(cached) ? cached : assetPath(project, dir, a);
  };
  const facePath = resolveFile(spec.face);
  const outfitPath = resolveFile(spec.outfit);
  const [faceBytes, outfitBytes] = await Promise.all([pictureBytes(facePath), pictureBytes(outfitPath)]);
  const hash = createHash("sha256")
    .update("castpack-v1:")
    .update(spec.mode)
    .update(":")
    .update(faceBytes)
    .update(":")
    .update(outfitBytes)
    .digest("hex")
    .slice(0, 20);
  const folder = join(dir, ".cache", "castpack");
  const out = join(folder, `${hash}.jpg`);
  if (existsSync(out)) return out;
  mkdirSync(folder, { recursive: true });

  const innerH = HEIGHT - PAD * 2;
  const innerW = WIDTH - PAD * 2 - GAP;
  const leftW = spec.mode === "face360-outfit" ? Math.floor(innerW * 0.5) : Math.floor(innerW * 0.4);
  const rightW = innerW - leftW;

  const [leftBuf, rightBuf, dividerBuf] = await Promise.all([
    sharp(faceBytes).rotate().resize(leftW, innerH, { fit: "contain", background: CANVAS_BG }).jpeg({ quality: 95 }).toBuffer(),
    sharp(outfitBytes).rotate().resize(rightW, innerH, { fit: "contain", background: CANVAS_BG }).jpeg({ quality: 95 }).toBuffer(),
    sharp({ create: { width: 2, height: innerH, channels: 3, background: DIVIDER_BG } }).png().toBuffer(),
  ]);

  const tmp = `${out}.${process.pid}.tmp`;
  await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: CANVAS_BG } })
    .composite([
      { input: leftBuf, left: PAD, top: PAD },
      { input: dividerBuf, left: PAD + leftW + Math.floor((GAP - 2) / 2), top: PAD },
      { input: rightBuf, left: PAD + leftW + GAP, top: PAD },
    ])
    .jpeg({ quality: 92 })
    .toFile(tmp);
  replaceFile(tmp, out);
  return out;
}

/**
 * Resolves one packed reference slot to a local image path ready for upload: either composites face + outfit via sharp
 * or delegates to `refFile` (which applies SAM background cutouts to a cast member's own raw photos when available).
 */
export async function resolvePackedRef(
  project: Pick<Project, "sources" | "assets" | "cast">,
  dir: string,
  ref: PackedRef,
  cast?: string[],
): Promise<string> {
  if (ref.kind === "composite") return compositeSheet(project, dir, ref);
  return refFile(project, dir, ref.asset, cast);
}

/** Helper to read bytes for tests or inline data URLs without duplicating sharp error handling. */
export const readPackedBytes = (file: string) => readFileSync(file);
