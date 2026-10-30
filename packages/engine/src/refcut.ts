/**
 * A cast member's own photos, cut out before they go to a model as references: the person (or pet, or thing) alone on
 * a plain background and cropped to them, so a sheet is made of them and not of the sofa they sat on. SAM on this
 * computer does it when it's installed, for nothing; without it the photo goes whole, as before. Each cut-out is made
 * once, in the project's .cache/refcut.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { Asset, CastMember, Project } from "@beatsheet/schema";
import { assetPath, cachePaths } from "./paths.ts";
import { samReady, samSegment } from "./sam.ts";

const ANIMALS = /\b(cat|kitten|dog|puppy|rabbit|bunny|hamster|guinea pig|bird|parrot|horse|pony|goat|chicken|duck|turtle|tortoise|lizard|fish)\b/i;

/** What to ask SAM for: a person, the animal a character's description names, or a prop by its name. */
export function refPrompt(m: Pick<CastMember, "kind" | "name" | "about">): string {
  if (m.kind === "prop") return m.name || "the object";
  return ANIMALS.exec(`${m.about ?? ""} ${m.name ?? ""}`)?.[1]?.toLowerCase() ?? "person";
}

/** How much two boxes (0..1) overlap, as a share of the smaller. */
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.h, b.w * b.h) : 0;
};

/**
 * The file to send for a reference picture in a request made with `cast`: a cut-out when it's one of a character's
 * or prop's own photos and SAM is here, else the picture itself.
 */
export async function refFile(project: Pick<Project, "sources" | "assets" | "cast">, dir: string, id: string, cast: string[] = [], log: (l: string) => void = () => {}): Promise<string> {
  const a = project.assets.find((x) => x.id === id);
  if (!a) throw new Error(`The picture "${id}" isn't in the project any more`);
  const whole = assetPath(project, dir, a);
  const own = (a: Asset) => a.kind === "image" && !a.cutout && ["import", "capture", "recorded", undefined].includes(a.provenance?.source);
  const member = own(a) ? project.cast?.find((m) => cast.includes(m.id) && (m.kind === "character" || m.kind === "prop") && m.seen?.some((s) => s.asset === id)) : undefined;
  if (!member || !samReady()) return whole;
  const out = join(dir, ".cache", "refcut", `${a.id}-${member.id}.jpg`);
  if (existsSync(out)) return out;
  try {
    // The screen-sized, upright copy (a phone's HEIC and its rotation are already taken care of there).
    const image = cachePaths(dir, a.id).image;
    const photo = existsSync(image) ? image : whole;
    mkdirSync(join(dir, ".cache", "refcut"), { recursive: true });
    const base = join(dir, ".cache", "refcut", `${a.id}-${member.id}-sam`);
    const found = await samSegment(photo, refPrompt(member), base, { each: true });
    // The one they were found as, when a subject says where; else the largest.
    const subject = member.seen?.find((s) => s.asset === id)?.subject;
    const at = subject ? a.subjects?.find((s) => s.id === subject)?.samples[0] : undefined;
    const pick = at ? [...found].sort((p, q) => overlap(q.box, { x: at[1]!, y: at[2]!, w: at[3]!, h: at[4]! }) - overlap(p.box, { x: at[1]!, y: at[2]!, w: at[3]!, h: at[4]! }))[0] : found[0];
    if (!pick) return whole;
    const cut = sharp(pick.file);
    const { width = 1, height = 1 } = await cut.metadata();
    // Cropped to them with a little room, on light grey.
    const pad = 0.08;
    const left = Math.max(0, Math.floor((pick.box.x - pad * pick.box.w) * width)), top = Math.max(0, Math.floor((pick.box.y - pad * pick.box.h) * height));
    const right = Math.min(width, Math.ceil((pick.box.x + pick.box.w * (1 + pad)) * width)), bottom = Math.min(height, Math.ceil((pick.box.y + pick.box.h * (1 + pad)) * height));
    const piece = await sharp(pick.file).extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }).png().toBuffer();
    await sharp({ create: { width: Math.max(1, right - left), height: Math.max(1, bottom - top), channels: 3, background: "#e4e4e4" } })
      .composite([{ input: piece }])
      .jpeg({ quality: 92 })
      .toFile(out);
    for (const f of found) rmSync(f.file, { force: true });
    log(`Cut ${member.name || member.id} out of ${a.label ?? a.id}`);
    return out;
  } catch (err) {
    log(`Sent ${a.label ?? a.id} whole: ${err instanceof Error ? err.message : String(err)}`);
    return whole;
  }
}
