/**
 * Cast members from the project's own footage: someone found in a clip or a photo (a face, a person, a thing) becomes a
 * character or a prop, seen there. Models need a picture, not a clip, so a still of them is cut from the frame where
 * they're largest (the clearest look), with room around a face for the head and shoulders, and added beside the clip.
 * Sheets and descriptions are made from that still.
 */
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { slugify, type CastMember } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { assetPath, projectDir } from "./paths.ts";
import { loadProject, updateFile } from "./store.ts";

const run = promisify(execFile);
/** The name a found subject has until someone gives it one. */
const GENERIC = /^(face|person|object|thing|subject)\s*\d*$/i;

/** A still of a subject into `out`: the frame where it's largest, cropped around it with some room. Returns when it was. */
export async function stillOfSubject(file: string, video: boolean, samples: number[][], kind: string, out: string): Promise<{ at: number }> {
  const [at, x, y, w, h] = samples.reduce((best, s) => (s[3]! * s[4]! > best[3]! * best[4]! ? s : best)) as [number, number, number, number, number];
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
 * Makes a cast member from a subject found in an asset, or adds the subject to one (`into`): it's seen there, and in
 * a still cut from there. Returns the member's id and the still's.
 */
export async function castFromSubject(projectId: string, ask: { asset: string; subject: string; into?: string }): Promise<{ member: string; still: string }> {
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
  const out = join(folder, `${a.id}-${s.id}.jpg`);
  const { at } = await stillOfSubject(assetPath(project, dir, a), a.kind === "video", s.samples, s.kind, out);
  const still = await addAsset(projectId, out, {
    id: `${slugify(named ? s.label : (into?.id ?? s.kind)) || "subject"}-still`,
    label: `${named ? s.label : (into?.name ?? s.label)}, from ${a.label ?? a.id}`,
    tags: ["still"],
    provenance: { source: "capture", refs: [a.id], params: { subject: s.id, at }, createdAt: new Date().toISOString() },
  });

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
    for (const add of [{ asset: a.id, subject: s.id }, { asset: still.id }])
      if (!seen.some((x) => x.asset === add.asset && x.subject === add.subject)) seen.push(add);
    m.seen = seen;
  });
  return { member, still: still.id };
}
