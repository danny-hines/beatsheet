/**
 * Cast members from the project's own footage: someone found in a clip or a photo (a face, a person, a thing) becomes a
 * character or a prop, seen there. Models need pictures, not a clip, so stills of them are cut from a few moments
 * apart where they're large (the clearest looks, and different angles as they move), with room around a face for the
 * head and shoulders, and added beside the clip. Sheets and descriptions are made from those stills.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { slugify, type Asset, type CastMember } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { assetPath, cachePaths, projectDir } from "./paths.ts";
import { loadProject, updateFile } from "./store.ts";

const run = promisify(execFile);
/** The name a found subject has until someone gives it one. */
const GENERIC = /^(face|person|object|thing|subject)\s*\d*$/i;

/**
 * The moments to cut stills of a subject from: where it's largest, then up to `max - 1` more where it's nearly as
 * large, each at least `gap` seconds from the others, so they show it from other sides as it moves.
 */
export function momentsOf(samples: number[][], max = 3, gap = 1.5): number[][] {
  const area = (s: number[]) => s[3]! * s[4]!;
  const sorted = [...samples].sort((a, b) => area(b) - area(a));
  const out: number[][] = [];
  for (const s of sorted) {
    if (out.length >= max || area(s) < area(sorted[0]!) * 0.5) break;
    if (out.every((o) => Math.abs(o[0]! - s[0]!) >= gap)) out.push(s);
  }
  return out.sort((a, b) => a[0]! - b[0]!);
}

/** A still of a subject into `out`, from one of its samples, cropped around it with some room. Returns when it was. */
export async function stillOfSubject(file: string, video: boolean, sample: number[], kind: string, out: string): Promise<{ at: number }> {
  const [at, x, y, w, h] = sample as [number, number, number, number, number];
  let frame: Buffer;
  if (video) {
    const tmp = join(tmpdir(), `beatsheet-still-${process.pid}-${Date.now()}.png`);
    // ffmpeg turns the frame the way it's shown, which is how the boxes were measured.
    await run("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", file, "-frames:v", "1", tmp]);
    frame = readFileSync(tmp);
    rmSync(tmp, { force: true });
  } else {
    // Read into memory first: on Windows sharp keeps a file it opened locked.
    frame = await sharp(readFileSync(file)).rotate().toBuffer();
  }
  const { width: W = 0, height: H = 0 } = await sharp(frame).metadata();
  // A face gets its head and shoulders (the box is only the face); a person or a thing, a margin.
  const grow = kind === "face" ? 1.2 : 0.12;
  const cx = (x + w / 2) * W;
  const cy = (y + h / 2 + (kind === "face" ? h * 0.35 : 0)) * H;
  const bw = Math.min(W, w * W * (1 + 2 * grow));
  const bh = Math.min(H, h * H * (1 + 2 * grow) * (kind === "face" ? 1.15 : 1));
  const left = Math.round(Math.max(0, Math.min(W - bw, cx - bw / 2)));
  const top = Math.round(Math.max(0, Math.min(H - bh, cy - bh / 2)));
  const crop = { left, top, width: Math.max(1, Math.min(W - left, Math.round(bw))), height: Math.max(1, Math.min(H - top, Math.round(bh))) };
  writeFileSync(out, await sharp(frame).extract(crop).jpeg({ quality: 92 }).toBuffer());
  return { at };
}

/**
 * What someone wears in one of their photos, as a picture of its own: the photo cut below their face (and to them,
 * when they were found as a person), so a portrait or sheet is given the clothes without a second face to copy. It
 * joins the look's wardrobe ("galileo", or "galileo/old" for a variant). A photo no face is found in is used whole,
 * and `cropped` says so. Faces are looked for first when the photo never was.
 */
export async function wardrobeFrom(projectId: string, ask: { asset: string; look: string }): Promise<{ asset: string; cropped: boolean }> {
  const [memberId, variantId] = ask.look.split("/") as [string, string?];
  const read = () => {
    const { project, dir } = loadProject(projectId);
    const m = project.cast?.find((x) => x.id === memberId);
    if (!m || (variantId && !m.variants?.some((v) => v.id === variantId))) throw new Error(`No cast member "${ask.look}"`);
    const a = project.assets.find((x) => x.id === ask.asset);
    if (a?.kind !== "image") throw new Error(`"${ask.asset}" isn't a photo in the project`);
    return { project, dir, m, a };
  };
  let { project, dir, m, a } = read();
  if (!a.subjects?.length) {
    const { findSubjects } = await import("./subjects.ts");
    await findSubjects(projectId, a.id).catch(() => {});
    ({ project, dir, m, a } = read());
  }
  // Their face: the one they were found as, else the largest found.
  const area = (s: { samples: number[][] }) => s.samples[0]![3]! * s.samples[0]![4]!;
  const named = m.seen?.find((s) => s.asset === a.id && s.subject)?.subject;
  const faces = (a.subjects ?? []).filter((s) => s.kind === "face" && s.samples.length);
  const face = faces.find((s) => s.id === named) ?? [...faces].sort((p, q) => area(q) - area(p))[0];
  const cached = cachePaths(dir, a.id).image;
  // Read into memory first: on Windows sharp keeps a file it opened locked.
  const frame = await sharp(readFileSync(existsSync(cached) ? cached : assetPath(project, dir, a))).rotate().toBuffer();
  const { width: W = 0, height: H = 0 } = await sharp(frame).metadata();
  let box = { left: 0, top: 0, width: W, height: H };
  if (face) {
    const [, fx, fy, fw, fh] = face.samples[0] as [number, number, number, number, number];
    // The person whose face it is, to cut the sides to; else the photo's width.
    const person = (a.subjects ?? []).find((s) => s.kind === "person" && s.samples[0] && s.samples[0][1]! <= fx + fw / 2 && fx + fw / 2 <= s.samples[0][1]! + s.samples[0][3]!);
    const p = person?.samples[0];
    const [px, py, pw, ph] = p ? [p[1]!, p[2]!, p[3]!, p[4]!] : [0, 0, 1, 1];
    const top = Math.round(Math.min(1, fy + fh * 1.1) * H);
    const bottom = Math.round(Math.min(1, py + ph) * H);
    const left = Math.round(Math.max(0, px - pw * 0.05) * W);
    const right = Math.round(Math.min(1, px + pw * 1.05) * W);
    if (bottom - top > H * 0.15 && right - left > W * 0.1) box = { left, top, width: right - left, height: bottom - top };
  }
  const cropped = box.height < H;
  const folder = join(projectDir(projectId), "made", "wardrobe");
  mkdirSync(folder, { recursive: true });
  const out = join(folder, `${a.id}-${slugify(ask.look)}.jpg`);
  writeFileSync(out, await sharp(frame).extract(box).jpeg({ quality: 92 }).toBuffer());
  const made = await addAsset(projectId, out, {
    id: `${slugify(ask.look)}-wardrobe`,
    label: `What ${m.name || m.id} wears in ${a.label ?? a.id}`,
    tags: ["wardrobe"],
    provenance: { source: "capture", refs: [a.id], params: { crop: box, below: face?.id }, createdAt: new Date().toISOString() },
  });
  updateFile(projectId, (d) => {
    const member = d.cast?.find((x) => x.id === memberId);
    const target = variantId ? member?.variants?.find((v) => v.id === variantId) : member;
    if (target && !target.wardrobe?.includes(made.id)) target.wardrobe = [...(target.wardrobe ?? []), made.id];
  });
  return { asset: made.id, cropped };
}

/**
 * Makes a cast member from a subject found in an asset, or adds the subject to one (`into`): it's seen there, and in
 * the stills cut from there (one from a photo, up to three from a clip). Returns the member's id and the stills'.
 */
export async function castFromSubject(projectId: string, ask: { asset: string; subject: string; into?: string }): Promise<{ member: string; still: string; stills: string[]; voice?: string }> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === ask.asset);
  if (!a) throw new Error(`No asset "${ask.asset}"`);
  const s = a.subjects?.find((x) => x.id === ask.subject);
  if (!s?.samples.length) throw new Error(`"${a.id}" has no subject "${ask.subject}"`);
  if (a.kind !== "video" && a.kind !== "image") throw new Error(`"${a.id}" isn't a picture or a clip`);
  const into = ask.into ? project.cast?.find((m) => m.id === ask.into) : undefined;
  if (ask.into && !into) throw new Error(`No cast member "${ask.into}"`);

  const named = !GENERIC.test(s.label.trim());
  const folder = join(projectDir(projectId), "made", "stills");
  mkdirSync(folder, { recursive: true });
  const moments = a.kind === "video" ? momentsOf(s.samples) : [s.samples[0]!];
  const stills: Asset[] = [];
  for (const [i, sample] of moments.entries()) {
    const out = join(folder, `${a.id}-${s.id}${i ? `-${i + 1}` : ""}.jpg`);
    const { at } = await stillOfSubject(assetPath(project, dir, a), a.kind === "video", sample, s.kind, out);
    stills.push(
      await addAsset(projectId, out, {
        id: `${slugify(named ? s.label : (into?.id ?? s.kind)) || "subject"}-still`,
        label: `${named ? s.label : (into?.name ?? s.label)}, from ${a.label ?? a.id}${moments.length > 1 ? ` at ${at.toFixed(1)}s` : ""}`,
        tags: ["still"],
        provenance: { source: "capture", refs: [a.id], params: { subject: s.id, at }, createdAt: new Date().toISOString() },
      }),
    );
  }

  let member = into?.id ?? "";
  updateFile(projectId, (d) => {
    const cast = (d.cast ??= []);
    let m = member ? cast.find((x) => x.id === member) : undefined;
    if (!m) {
      const kind: CastMember["kind"] = s.kind === "object" ? "prop" : "character";
      // Unnamed, it takes an id like the studio's new members do, and gets a proper one when it's named.
      const base = (named && slugify(s.label)) || kind;
      member = base;
      for (let n = 2; cast.some((x) => x.id === member); n++) member = `${base}-${n}`;
      m = { id: member, name: named ? s.label : "", kind };
      cast.push(m);
    }
    const seen = m.seen ?? [];
    for (const add of [{ asset: a.id, subject: s.id }, ...stills.map((x) => ({ asset: x.id, subject: undefined }))])
      if (!seen.some((x) => x.asset === add.asset && x.subject === add.subject)) seen.push(add);
    m.seen = seen;
  });
  // Their voice, if they're the one talking while they're on screen, and then the other clips it's heard in.
  const { followPeople } = await import("./heard.ts");
  const { joined } = await followPeople(projectId, [a.id]).catch(() => ({ joined: [] as { member: string; by: string; speaker: string }[] }));
  const voice = joined.find((j) => j.member === member && j.by === "face")?.speaker;
  return { member, still: stills[0]!.id, stills: stills.map((x) => x.id), ...(voice ? { voice } : {}) };
}
