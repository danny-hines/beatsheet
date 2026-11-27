/**
 * The agent's look at its own cut before handing it over: a quick low-resolution render, a contact sheet of it (one
 * frame every second or two, read row by row), programmatic PASS/WARN/FAIL verification across layout geometry,
 * video/motion health, audio loudness, timing and design, and the problems a person would notice first.
 *
 * Then the design pass, for the shots that are designed rather than footage: each one larger, as it enters, midway and
 * settled, with DOM bounding-box verification (clipped text, safe margins, caption safe-zone clashes, overlapping text,
 * broken media, runtime scene errors) and blank-frame checks.
 */
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import sharp, { type OverlayOptions } from "sharp";
import {
  adjacentGeneratedPairs,
  auditLayoutBoxes,
  checkContinuityToneJump,
  formatReviewReport,
  formatTime,
  resolveTimeline,
  summarizeReviewChecks,
  type ContinuityPair,
  type FrameTone,
  type LayoutBox,
  type Project,
  type ReviewCheck,
  type Timeline,
} from "@beatsheet/schema";
import { replaceFile } from "./platform.ts";
import { loadProject } from "./store.ts";

const run = promisify(execFile);
const ffmpegLog = (args: string[]) => run("ffmpeg", ["-hide_banner", "-nostats", ...args], { maxBuffer: 1 << 25 }).then((r) => r.stderr, (err: { stderr?: string }) => err.stderr ?? "");
const safeSlug = (s: string) => s.replace(/[^a-z0-9_-]+/gi, "-") || "cut";
const stamp = (s: number) => `${Math.round(s * 10) / 10}s`.replace(".", "_");

/** Resolves an optional time range or shot list against a timeline, clamped to the cut. */
export function reviewRange(tl: Timeline, opts: { from?: number; to?: number; shots?: string[] } = {}): { from: number; to: number; ranged: boolean } {
  const dur = Number.isFinite(tl.duration) && tl.duration > 0 ? tl.duration : 0;
  let from = opts.from;
  let to = opts.to;
  if (opts.shots?.length) {
    const picked = opts.shots.map((id) => {
      const r = tl.shots.find((s) => s.id === id);
      if (!r || !Number.isFinite(r.start) || !Number.isFinite(r.end)) throw new Error(`Shot "${id}" isn't in this format or has unresolved timing`);
      return r;
    });
    from ??= Math.min(...picked.map((r) => r.start));
    to ??= Math.max(...picked.map((r) => r.end));
  }
  if (from === undefined && to === undefined) return { from: 0, to: dur, ranged: false };
  const start = Math.max(0, from ?? 0);
  const end = Math.min(dur, to ?? dur);
  if (end <= start) throw new Error(`Nothing to review between ${formatTime(start)} and ${formatTime(end)} (cut runs ${formatTime(dur)})`);
  return { from: start, to: end, ranged: start > 0.05 || end < dur - 0.05 };
}

/** Where review_cut keeps its latest low-res preview video and contact sheets inside the project's .cache/. */
export function reviewPaths(projectDir: string, cutId: string, formatId: string, range?: { from: number; to: number }) {
  const base = join(projectDir, ".cache", "review");
  const span = range ? `-${stamp(range.from)}-${stamp(range.to)}` : "";
  const stem = `${safeSlug(cutId)}-${safeSlug(formatId)}${span}`;
  return {
    video: join(base, `${stem}.mp4`),
    sheet: join(base, `${stem}-sheet.jpg`),
    designs: join(base, `${stem}-designs.jpg`),
    continuity: join(base, `${stem}-continuity.jpg`),
  };
}

/** Copies a rendered file into the project cache atomically, working across volumes (tmpdir → workspace). */
function keepFile(src: string, dest: string) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.tmp`;
  try {
    copyFileSync(src, tmp);
    replaceFile(tmp, dest);
  } finally {
    rmSync(tmp, { force: true });
  }
}

export type Review = {
  sheet: Buffer;
  every: number;
  columns: number;
  notes: string[];
  duration: number;
  /** The stretch reviewed, in seconds into the cut (0..duration for a full review). */
  from: number;
  to: number;
  ranged: boolean;
  /** The low-res preview MP4 (with sound) kept in the project's .cache/review/, for agents that can watch video. */
  videoFile: string;
  /** The contact sheet saved beside the preview MP4. */
  sheetFile: string;
  /** The designed shots, a row each (as `designRows` lists them): entering, midway and settled. */
  designs?: Buffer;
  designsFile?: string;
  designRows?: string[];
  /** What the project says about its design, for the design pass. */
  designNotes: string[];
  /** Side-by-side OUT → IN cut-boundary contact sheet for adjacent AI-generated shots. */
  continuity?: Buffer;
  continuityFile?: string;
  continuityRows?: string[];
  continuityNotes: string[];
  /** True when zero checks failed (warnings are allowed). */
  passed: boolean;
  /** Structured PASS / WARN / FAIL checks across layout, motion, audio, timing and design. */
  checks: ReviewCheck[];
  /** Formatted PASS/FAIL summary table. */
  report: string;
};

/**
 * Runs ffmpeg signal analysis on a rendered preview MP4: frozen holds, unintentional black/blank frames,
 * rapid flash/strobe spikes, silence spans, and EBU R128 loudness + true peak clipping.
 */
export async function analyzeReviewVideo(
  video: string,
  opts: { from: number; span: number; tl: Timeline; project: Project },
): Promise<{ notes: string[]; checks: ReviewCheck[] }> {
  const { from, span, tl, project } = opts;
  const notes: string[] = [];
  const checks: ReviewCheck[] = [];

  // 1. Frozen holds (picture static for >= 2s).
  const freeze = await ffmpegLog(["-i", video, "-vf", "freezedetect=n=0.004:d=2", "-an", "-f", "null", "-"]);
  const starts = [...freeze.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const lengths = [...freeze.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
  if (starts.length) {
    for (const [i, s] of starts.entries()) {
      const cutAt = from + s;
      const len = lengths[i] ?? span - s;
      const shots = tl.shots.filter((r) => r.start < cutAt + len && r.end > cutAt && project.tracks.find((t) => t.id === r.track)?.kind === "picture").map((r) => r.id);
      const msg = `Nothing moves for ${len.toFixed(1)}s at ${formatTime(cutAt)}${shots.length ? ` (${shots.join(", ")})` : ""}: cut sooner, add motion (content.motion), or put something on top.`;
      notes.push(msg);
      checks.push({ id: "freeze-hold", category: "motion", status: "WARN", shot: shots[0], at: cutAt, summary: `Static frame for ${len.toFixed(1)}s at ${formatTime(cutAt)}`, detail: shots.join(", ") || undefined });
    }
  } else {
    checks.push({ id: "freeze-hold", category: "motion", status: "PASS", summary: "No static freezes ≥ 2s" });
  }

  // 2. Unintentional blank/black gaps (>= 0.4s inside the cut; ignores brief <0.5s fade at start/end).
  const black = await ffmpegLog(["-i", video, "-vf", "blackdetect=d=0.4:pix_th=0.08", "-an", "-f", "null", "-"]);
  const blacks = [...black.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)]
    .map((m) => ({ start: Number(m[1]), end: Number(m[2]), dur: Number(m[3]) }))
    .filter((b) => !(b.start < 0.05 && b.dur < 0.6) && !(b.end > span - 0.05 && b.dur < 0.6));
  if (blacks.length) {
    for (const b of blacks) {
      const cutAt = from + b.start;
      const shot = tl.shots.find((r) => r.start <= cutAt + b.dur / 2 && r.end >= cutAt + b.dur / 2 && project.tracks.find((t) => t.id === r.track)?.kind === "picture")?.id;
      notes.push(`Blank black gap for ${b.dur.toFixed(1)}s at ${formatTime(cutAt)}${shot ? ` (${shot})` : ""}: check missing media, gaps between shots, or crashed scenes.`);
      checks.push({ id: "blank-frames", category: "motion", status: "FAIL", shot, at: cutAt, summary: `Black/blank stretch of ${b.dur.toFixed(1)}s at ${formatTime(cutAt)}` });
    }
  } else {
    checks.push({ id: "blank-frames", category: "motion", status: "PASS", summary: "No unintentional blank/black gaps" });
  }

  // 3. Strobe / excessive rapid flash spikes (> 4 hard scene jumps in any 1s window).
  const sc = await ffmpegLog(["-i", video, "-vf", "select='gt(scene,0.55)',showinfo", "-an", "-f", "null", "-"]);
  const jumps = [...sc.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
  let strobeAt: number | undefined;
  let strobeCount = 0;
  for (let i = 0; i < jumps.length; i++) {
    let j = i;
    while (j < jumps.length && jumps[j]! - jumps[i]! <= 1.0) j++;
    if (j - i > strobeCount) {
      strobeCount = j - i;
      if (strobeCount >= 5) strobeAt = from + jumps[i]!;
    }
  }
  if (strobeAt !== undefined) {
    notes.push(`Rapid flashing/strobe detected (${strobeCount} hard visual jumps within 1s at ${formatTime(strobeAt)}).`);
    checks.push({ id: "motion-strobe", category: "motion", status: "WARN", at: strobeAt, summary: `${strobeCount} hard visual jumps in 1s at ${formatTime(strobeAt)}` });
  } else {
    checks.push({ id: "motion-strobe", category: "motion", status: "PASS", summary: "No rapid strobe spikes detected" });
  }

  // 4. Audio silence & loudness / peak clipping.
  const quiet = await ffmpegLog(["-i", video, "-af", "silencedetect=noise=-45dB:d=1.2", "-vn", "-f", "null", "-"]);
  const silences = [...quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)];
  if (silences.length) {
    for (const m of silences) {
      const cutAt = from + Number(m[1]);
      const dur = Number(m[2]);
      notes.push(`Silent for ${dur.toFixed(1)}s at ${formatTime(cutAt)}.`);
      checks.push({ id: "audio-silence", category: "audio", status: "WARN", at: cutAt, summary: `Silent for ${dur.toFixed(1)}s at ${formatTime(cutAt)}` });
    }
  } else {
    checks.push({ id: "audio-silence", category: "audio", status: "PASS", summary: "No dead silence gaps ≥ 1.2s" });
  }

  const loud = await ffmpegLog(["-i", video, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const summary = loud.slice(loud.lastIndexOf("Summary"));
  const lufs = Number(/I:\s*(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const peak = Number(/Peak:\s*(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (Number.isFinite(lufs)) {
    notes.push(`Mix loudness ${lufs.toFixed(1)} LUFS before mastering (exports are mastered to -14).`);
    if (Number.isFinite(peak) && peak > -0.1) {
      checks.push({ id: "audio-loudness", category: "audio", status: "WARN", summary: `Mix peaks at ${peak.toFixed(1)} dBFS (${lufs.toFixed(1)} LUFS)`, detail: "Check track gains before mastering" });
    } else if (lufs < -38 && (tl.lines.length || tl.cues.length)) {
      checks.push({ id: "audio-loudness", category: "audio", status: "WARN", summary: `Very quiet mix (${lufs.toFixed(1)} LUFS)`, detail: "Narration or music may be muted or too low" });
    } else {
      checks.push({ id: "audio-loudness", category: "audio", status: "PASS", summary: `Mix loudness ${lufs.toFixed(1)} LUFS${Number.isFinite(peak) ? `, peak ${peak.toFixed(1)} dBFS` : ""}` });
    }
  }

  return { notes, checks };
}

/** Checks a rendered still JPEG for an empty solid-black frame (e.g. a scene that rendered nothing). */
export async function isStillBlank(file: string): Promise<boolean> {
  try {
    const stats = await sharp(file).stats();
    const ch = stats.channels.slice(0, 3);
    return ch.every((c) => c.mean < 6 && c.stdev < 1.5);
  } catch {
    return false;
  }
}

const MAX_CONTINUITY_PAIRS = 16;
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function frameTone(file: string): Promise<FrameTone> {
  const stats = await sharp(file).stats();
  const r = stats.channels[0]?.mean ?? 0;
  const g = stats.channels[1]?.mean ?? r;
  const b = stats.channels[2]?.mean ?? r;
  return { r, g, b, luma: 0.2126 * r + 0.7152 * g + 0.0722 * b };
}

/**
 * Extracts outgoing (`OUT`) and incoming (`IN`) boundary frames for adjacent AI-generated shot pairs from an already-
 * rendered review MP4, composites them side-by-side with clear cut labels into a continuity contact sheet, and flags
 * sharp exposure or color-cast jumps across cuts sharing the same `@place`.
 */
export async function buildContinuitySheet(
  video: string,
  pairs: ContinuityPair[],
  opts: { from: number; vertical: boolean; dir: string },
): Promise<{ sheet: Buffer; file: string; rows: string[]; notes: string[]; checks: ReviewCheck[] }> {
  const shown = pairs.slice(0, MAX_CONTINUITY_PAIRS);
  const pairCols = shown.length > 6 ? 2 : 1;
  const pairRows = Math.ceil(shown.length / pairCols);
  const tileW = opts.vertical ? (pairCols === 2 ? 162 : 216) : pairCols === 2 ? 304 : 384;
  const tileH = opts.vertical ? (pairCols === 2 ? 288 : 384) : pairCols === 2 ? 171 : 216;
  const innerGap = 4;
  const pairGap = 14;
  const headerH = 26;
  const cellW = tileW * 2 + innerGap;
  const cellH = headerH + tileH;
  const canvasW = pairGap + pairCols * (cellW + pairGap);
  const canvasH = pairGap + pairRows * (cellH + pairGap);
  const scalePad = `scale=${tileW}:${tileH}:force_original_aspect_ratio=decrease,pad=${tileW}:${tileH}:(ow-iw)/2:(oh-ih)/2:color=#111111`;

  const framesDir = join(opts.dir, "continuity");
  mkdirSync(framesDir, { recursive: true });
  const composites: OverlayOptions[] = [];
  const rows: string[] = [];
  const notes: string[] = [];
  const checks: ReviewCheck[] = [];
  let samePlaceChecked = 0;
  let lightingWarns = 0;

  for (const [idx, pair] of shown.entries()) {
    const outFile = join(framesDir, `p${idx}-out.jpg`);
    const inFile = join(framesDir, `p${idx}-in.jpg`);
    const outSeek = Math.max(0, pair.outAt - opts.from).toFixed(3);
    const inSeek = Math.max(0, pair.inAt - opts.from).toFixed(3);
    await Promise.all([
      run("ffmpeg", ["-v", "error", "-y", "-ss", outSeek, "-i", video, "-frames:v", "1", "-vf", scalePad, "-q:v", "3", outFile]),
      run("ffmpeg", ["-v", "error", "-y", "-ss", inSeek, "-i", video, "-frames:v", "1", "-vf", scalePad, "-q:v", "3", inFile]),
    ]);
    const [outTone, inTone] = await Promise.all([frameTone(outFile), frameTone(inFile)]);
    if (pair.sharedPlaces.length) samePlaceChecked++;
    const jump = checkContinuityToneJump(pair, outTone, inTone);
    if (jump) {
      lightingWarns++;
      checks.push(jump);
      notes.push(`${jump.summary}${jump.detail ? `: ${jump.detail}` : ""}`);
    }

    const col = idx % pairCols;
    const row = Math.floor(idx / pairCols);
    const left = pairGap + col * (cellW + pairGap);
    const top = pairGap + row * (cellH + pairGap);
    const rawTitle = `#${idx + 1}  ${pair.from} OUT → ${pair.to} IN  ·  ${formatTime(pair.cutAt)}`;
    const maxChars = Math.max(22, Math.floor((cellW - 20) / 7));
    const label = rawTitle.length > maxChars ? `${rawTitle.slice(0, maxChars - 1)}…` : rawTitle;
    const accent = jump ? "#f59e0b" : "#3f3f46";
    const headerSvg = Buffer.from(
      `<svg width="${cellW}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${cellW}" height="${headerH}" fill="#27272a"/>` +
        `<rect width="4" height="${headerH}" fill="${accent}"/>` +
        `<text x="10" y="17" fill="#f4f4f5" font-family="sans-serif" font-size="12" font-weight="600">${escapeXml(label)}</text>` +
        `</svg>`,
    );
    composites.push(
      { input: headerSvg, left, top },
      { input: outFile, left, top: top + headerH },
      { input: inFile, left: left + tileW + innerGap, top: top + headerH },
    );

    const ctxParts: string[] = [];
    if (pair.sharedPlaces.length) ctxParts.push(`same place: ${pair.sharedPlaces.map((id) => `@${id}`).join(", ")}`);
    if (pair.sharedCast.length) ctxParts.push(`shared: ${pair.sharedCast.map((id) => `@${id}`).join(", ")}`);
    rows.push(`${pair.from} → ${pair.to} at ${formatTime(pair.cutAt)}${ctxParts.length ? ` (${ctxParts.join("; ")})` : ""}${jump ? " [lighting/color WARN]" : ""}`);
  }

  if (samePlaceChecked > 0 && lightingWarns === 0) {
    checks.push({
      id: "continuity-lighting",
      category: "continuity",
      status: "PASS",
      summary: `No sharp lighting/color jumps across ${samePlaceChecked} same-place generated cut${samePlaceChecked === 1 ? "" : "s"}`,
    });
  }
  if (pairs.length > MAX_CONTINUITY_PAIRS) {
    notes.push(`Showing the first ${MAX_CONTINUITY_PAIRS} of ${pairs.length} generated cut pairs — pass shots or from/to to audit the rest scene by scene.`);
  }

  const outPath = join(opts.dir, "continuity.jpg");
  const sheet = await sharp({
    create: { width: canvasW, height: canvasH, channels: 3, background: { r: 24, g: 24, b: 27 } },
  })
    .composite(composites)
    .jpeg({ quality: 88 })
    .toFile(outPath)
    .then(() => readFileSync(outPath));
  return { sheet, file: outPath, rows, notes, checks };
}

export async function reviewCut(projectId: string, opts: { cut?: string; format?: string; from?: number; to?: number; shots?: string[] } = {}): Promise<Review> {
  const { project, dir: projDir } = loadProject(projectId, opts.cut);
  const fmt = project.formats.find((f) => f.id === opts.format) ?? project.formats[0]!;
  const tl = resolveTimeline(project, fmt.id);
  const { from, to, ranged } = reviewRange(tl, opts);
  const kept = reviewPaths(projDir, project.cut.id, fmt.id, ranged ? { from, to } : undefined);
  const dir = join(tmpdir(), `beatsheet-review-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(dir, { recursive: true });
  try {
    const { renderProject } = await import("./render.ts");
    const video = await renderProject(projectId, {
      cut: project.cut.id,
      format: fmt.id,
      quality: "proxy",
      scale: 0.3,
      out: join(dir, "review.mp4"),
      master: false,
      ...(ranged ? { range: { from, to } } : {}),
    });
    const duration = tl.duration;
    const span = Math.max(0.5, to - from);
    const every = span > 90 ? 2 : ranged && span <= 15 ? 0.5 : 1;
    const vertical = fmt.height > fmt.width;
    const columns = vertical ? 10 : 6;
    const tile = vertical ? "216:384" : "320:180";
    const frames = Math.max(1, Math.ceil(span / every));
    const rows = Math.max(1, Math.ceil(frames / columns));
    const sheetFile = join(dir, "sheet.jpg");
    await run("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `fps=1/${every},scale=${tile},tile=${columns}x${rows}:padding=4:color=gray`, "-frames:v", "1", "-q:v", "4", sheetFile], { maxBuffer: 1 << 24 });

    const videoAudit = await analyzeReviewVideo(video, { from, span, tl, project });
    const structural = projectChecks(project, tl, fmt.id, fmt.width, fmt.height, ranged ? { from, to } : undefined);
    const notes = [...videoAudit.notes, ...structural.notes];
    const allChecks: ReviewCheck[] = [...videoAudit.checks, ...structural.checks];

    // The designed shots, bigger: the picture track's first, then overlays, longest first, up to ten.
    const tracks = new Map(project.tracks.map((t) => [t.id, t]));
    const shots = new Map(project.shots.map((s) => [s.id, s]));
    const designed = tl.shots
      .filter((r) => shots.get(r.id)?.content.kind === "coded" && Number.isFinite(r.start) && r.end > r.start && (!ranged || (r.end > from && r.start < to)))
      .sort((a, b) => Number(tracks.get(b.track)?.kind === "picture") - Number(tracks.get(a.track)?.kind === "picture") || b.end - b.start - (a.end - a.start))
      .slice(0, 10)
      .sort((a, b) => a.start - b.start);
    let designs: Buffer | undefined;
    let designsFile: string | undefined;
    const designRows: string[] = [];
    if (designed.length) {
      const { renderStills } = await import("./render.ts");
      const sampleMeta = designed.flatMap((r) => [0.2, 0.55, 0.92].map((f) => ({ shot: r.id, at: r.start + (r.end - r.start) * f, frac: f })));
      const times = sampleMeta.map((m) => m.at);
      const stills = join(dir, "designs");
      mkdirSync(stills, { recursive: true });
      const layoutSamples = new Map<number, LayoutBox[]>();
      const stillFiles = await renderStills(projectId, {
        cut: project.cut.id,
        format: fmt.id,
        times,
        scale: vertical ? 0.3 : 0.25,
        dir: stills,
        onLayout: (idx, boxes) => {
          layoutSamples.set(idx, boxes);
        },
      });
      // Programmatic DOM layout & blank-still checks on each designed shot.
      const layoutIssues: ReviewCheck[] = [];
      let auditedFrames = 0;
      for (const [idx, meta] of sampleMeta.entries()) {
        const s = shots.get(meta.shot)!;
        const boxes = layoutSamples.get(idx);
        if (boxes) {
          auditedFrames++;
          const found = auditLayoutBoxes(boxes, {
            width: fmt.width,
            height: fmt.height,
            shot: meta.shot,
            at: meta.at,
            captions: !!project.captions && s.captions !== false,
            captionPosition: project.captions?.position,
          });
          // Deduplicate per (shot, check id) keeping the first sample that hit it.
          for (const c of found) {
            if (!layoutIssues.some((x) => x.shot === c.shot && x.id === c.id)) layoutIssues.push(c);
          }
        }
        // Check midway frame for a completely blank black render.
        if (meta.frac === 0.55 && stillFiles[idx] && (await isStillBlank(stillFiles[idx]!))) {
          layoutIssues.push({
            id: "blank-scene",
            category: "layout",
            status: "FAIL",
            shot: meta.shot,
            at: meta.at,
            summary: `Designed shot ${meta.shot} rendered completely blank at midway (${formatTime(meta.at)})`,
          });
        }
      }
      if (layoutIssues.length) {
        allChecks.push(...layoutIssues);
      } else if (auditedFrames > 0) {
        allChecks.push({
          id: "layout-verified",
          category: "layout",
          status: "PASS",
          summary: `Verified ${auditedFrames} designed frame${auditedFrames === 1 ? "" : "s"} across ${designed.length} shot${designed.length === 1 ? "" : "s"} (no clipping, overlap, safe-zone clash or errors)`,
        });
      }

      const designFile = join(dir, "designs.jpg");
      await run("ffmpeg", ["-v", "error", "-y", "-i", join(stills, "still-%03d.jpg"), "-vf", `tile=3x${designed.length}:padding=6:color=gray`, "-frames:v", "1", "-q:v", "3", designFile], { maxBuffer: 1 << 24 });
      designs = readFileSync(designFile);
      keepFile(designFile, kept.designs);
      designsFile = kept.designs;
      for (const r of designed) {
        const s = shots.get(r.id)!;
        const c = s.content.kind === "coded" ? s.content.component : "";
        designRows.push(`${r.id} (${c}${s.label ? `, "${s.label}"` : ""}) ${formatTime(r.start)}–${formatTime(r.end)}`);
      }
    } else {
      rmSync(kept.designs, { force: true });
    }
    const designNotes = designChecks(project);
    for (const dn of designNotes) allChecks.push({ id: "design-polish", category: "design", status: "WARN", summary: dn.split(":")[0] ?? dn, detail: dn });

    // Continuity pass for cuts with adjacent AI-generated shots: side-by-side OUT → IN cut-pairs sheet + same-place lighting jump check.
    const genPairs = adjacentGeneratedPairs(project, tl, ranged ? { from, to } : undefined);
    let continuity: Buffer | undefined;
    let continuityFile: string | undefined;
    let continuityRows: string[] | undefined;
    const continuityNotes: string[] = [];
    if (genPairs.length) {
      const built = await buildContinuitySheet(video, genPairs, { from, vertical, dir });
      continuity = built.sheet;
      keepFile(built.file, kept.continuity);
      continuityFile = kept.continuity;
      continuityRows = built.rows;
      continuityNotes.push(...built.notes);
      allChecks.push(...built.checks);
    } else {
      rmSync(kept.continuity, { force: true });
    }

    const { passed } = summarizeReviewChecks(allChecks);
    const report = formatReviewReport(allChecks);
    keepFile(video, kept.video);
    keepFile(sheetFile, kept.sheet);
    return {
      sheet: readFileSync(sheetFile),
      every,
      columns,
      notes,
      duration,
      from,
      to,
      ranged,
      videoFile: kept.video,
      sheetFile: kept.sheet,
      designs,
      designsFile,
      designRows,
      designNotes,
      continuity,
      continuityFile,
      continuityRows,
      continuityNotes,
      passed,
      checks: allChecks,
      report,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What the project itself says about the design of its designed shots. */
export function designChecks(p: Project): string[] {
  const out: string[] = [];
  const coded = p.shots.filter((s) => s.content.kind === "coded");
  const titled = coded.length || p.shots.some((s) => s.content.kind === "text") || !!p.captions;
  if (titled && (!p.look?.colors || !Object.keys(p.look.colors).length))
    out.push(
      "There's no /look: titles and designed shots draw in beatsheet's plain neutrals. Give the project a look of its own: the brand's colours and fonts when there is one (its site's CSS, its logo), else one from the footage and the occasion (palette for its colours, a font that suits the mood, a grade), offered as a choice with preview_looks if the person hasn't said what they're after.",
    );
  if (!coded.length) return out;
  const component = (s: (typeof coded)[number]) => (s.content.kind === "coded" ? s.content.component : "");
  const own = coded.filter((s) => !component(s).startsWith("kit:"));
  if (coded.length >= 3 && !own.length)
    out.push(`All ${coded.length} designed shots are stock kit scenes. The moments that carry the video (the hook, the reveal, the end card) should be scenes written for this project with write_scene, in its own design system; keep the kit for quick utility shots.`);
  const uses = new Map<string, string[]>();
  for (const s of coded) if (component(s).startsWith("kit:")) uses.set(component(s), [...(uses.get(component(s)) ?? []), s.id]);
  for (const [name, ids] of uses)
    if (ids.length >= 3) out.push(`${name} is used ${ids.length} times (${ids.join(", ")}): vary them, or make it a deliberate recurring device in the project's own style.`);
  const loud = p.shots.filter((s) => ["slam", "glitch", "flash", "whip"].includes(s.transition?.kind ?? "")).map((s) => s.id);
  if (loud.length >= 3 && loud.length > p.shots.length / 5)
    out.push(`${loud.length} shots come in with a slam, glitch, flash or whip (${loud.join(", ")}): keep hard hits for the one or two moments that earn them; most cuts read better clean.`);
  return out;
}

/** What's worth fixing, from the project itself, returned as both readable notes and structured PASS/WARN/FAIL checks. */
export function projectChecks(
  p: Project,
  tl: ReturnType<typeof resolveTimeline>,
  format: string,
  width: number,
  height: number,
  range?: { from: number; to: number },
): { notes: string[]; checks: ReviewCheck[] } {
  const notes: string[] = [];
  const checks: ReviewCheck[] = [];
  const shots = new Map(p.shots.map((s) => [s.id, s]));
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  if (!range) {
    if (p.spec.targetLength && Math.abs(tl.duration - p.spec.targetLength) > Math.max(3, p.spec.targetLength * 0.15)) {
      const msg = `It runs ${formatTime(tl.duration)}; the target is ${p.spec.targetLength}s.`;
      notes.push(msg);
      checks.push({ id: "target-length", category: "timing", status: "WARN", summary: msg });
    }
    if (p.spec.maxLength) {
      if (tl.duration > p.spec.maxLength) {
        const msg = `It's over the ${p.spec.maxLength}s limit.`;
        notes.push(msg);
        checks.push({ id: "max-length", category: "timing", status: "FAIL", summary: `Cut (${formatTime(tl.duration)}) exceeds ${p.spec.maxLength}s maxLength` });
      } else {
        checks.push({ id: "max-length", category: "timing", status: "PASS", summary: `Within ${p.spec.maxLength}s limit (${formatTime(tl.duration)})` });
      }
    }
    if (tl.lines.length && !p.captions) {
      notes.push("There's narration but no captions: most people watch with the sound off. Turn them on with /captions.");
      checks.push({ id: "captions", category: "design", status: "WARN", summary: "Narration present with captions disabled" });
    }
    if (!tl.sfx.length && tl.shots.length > 6) {
      notes.push("No sound effects: a whoosh or pop on the big cuts, a shutter or tick where something happens, makes it feel made.");
      checks.push({ id: "sfx", category: "audio", status: "WARN", summary: "No sound effects cues in cut" });
    }
  }
  const frameAspect = width / height;
  let aspectBad = 0;
  for (const r of tl.shots) {
    if (range && (r.end <= range.from || r.start >= range.to)) continue;
    const s = shots.get(r.id);
    if (!s || s.content.kind !== "clip") continue;
    const a = assets.get(s.content.asset);
    if (!a?.width || !a?.height || a.cutout) continue;
    const aspect = a.width / a.height;
    const mismatch = aspect / frameAspect;
    if ((mismatch > 1.4 || mismatch < 0.7) && !s.content.reframe?.[format] && !s.content.motion) {
      aspectBad++;
      notes.push(`${r.id} is ${aspect > 1 ? "landscape" : "portrait"} footage in a ${width}×${height} frame with no reframe: set content.reframe.${format} (or follow a subject) so the crop keeps what matters.`);
      checks.push({ id: "aspect-reframe", category: "media", status: "WARN", shot: r.id, at: r.start, summary: `${r.id} has uncropped aspect mismatch in ${width}×${height}` });
    }
    if (a.kind === "image" && r.end - r.start > 3.5 && !s.content.motion) {
      notes.push(`${r.id} holds a photo for ${(r.end - r.start).toFixed(1)}s: give it motion or cut sooner.`);
      checks.push({ id: "static-photo", category: "motion", status: "WARN", shot: r.id, at: r.start, summary: `${r.id} holds a still photo for ${(r.end - r.start).toFixed(1)}s without motion` });
    }
  }
  if (!aspectBad) checks.push({ id: "aspect-reframe", category: "media", status: "PASS", summary: "All clip orientations match or reframe cleanly" });

  const designed = p.shots.filter((s) => s.content.kind === "coded").length;
  if (!range && tl.duration > 20 && designed === 0) notes.push("Every shot is footage: a designed scene or two (a title, a stat, a before/after, labelled parts) would lift it.");
  if (tl.diagnostics.length) {
    const detail = tl.diagnostics.map((d) => `${d.where}: ${d.message}`).join("; ");
    notes.push(`Timing problems: ${detail}`);
    checks.push({ id: "timeline-diagnostics", category: "timing", status: "FAIL", summary: `${tl.diagnostics.length} unresolved timeline diagnostic${tl.diagnostics.length === 1 ? "" : "s"}`, detail });
  } else {
    checks.push({ id: "timeline-diagnostics", category: "timing", status: "PASS", summary: "Timeline resolves cleanly with zero timing diagnostics" });
  }
  return { notes, checks };
}
