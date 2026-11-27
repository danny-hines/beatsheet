/**
 * Programmatic cut review checks: structured PASS / WARN / FAIL verdicts across layout geometry (clipped text,
 * caption safe-zone clashes, overlapping text, scene runtime errors, broken media), video/motion health (blank
 * frames, frozen holds, strobe spikes), audio levels, timing diagnostics and design polish.
 * Pure TypeScript — shared between engine, MCP tools, studio and tests.
 */

import { castOf } from "./make.ts";
import type { Project } from "./types.ts";
import type { Timeline } from "./resolve.ts";

export type ReviewStatus = "PASS" | "WARN" | "FAIL";

export type ReviewCategory = "layout" | "motion" | "audio" | "timing" | "design" | "media" | "continuity";

export type ReviewCheck = {
  id: string;
  category: ReviewCategory;
  status: ReviewStatus;
  shot?: string;
  at?: number;
  summary: string;
  detail?: string;
};

/** One rendered DOM box sampled from a composed frame in composition pixels (origin top-left). */
export type LayoutBox = {
  kind: "text" | "media" | "error" | "caption";
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when an image/video failed to load (e.g. naturalWidth === 0). */
  broken?: boolean;
  /** True when the container clipped overflowing content (scrollWidth/Height > clientWidth/Height). */
  clipped?: boolean;
};

export type LayoutFrameSpec = {
  width: number;
  height: number;
  shot?: string;
  at?: number;
  /** Whether captions are active on this shot (enables caption safe-zone checks). */
  captions?: boolean;
  /** Caption position; default "bottom". */
  captionPosition?: "bottom" | "middle" | "top";
  /** Minimum margin from frame edges for text boxes, in px; default 3% of the short edge. */
  safeMargin?: number;
};

const clipText = (s?: string, max = 42) => {
  const clean = (s ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const ERROR_TEXT = /crashed|three\.js:|couldn't load the scene|couldn't play|referenceerror|typeerror|syntaxerror/i;

/** Intersection area between two axis-aligned boxes. */
function overlapArea(a: LayoutBox, b: LayoutBox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

/**
 * Audits rendered DOM boxes from one frame of a shot for hard layout defects:
 * - `scene-error`: runtime/compile error banner or crashed WebGL scene
 * - `missing-media`: broken image or unloaded media element
 * - `edge-clip`: text extending past the frame boundary or clipped inside its container, or crowding the safe margin
 * - `caption-safe-zone`: designed text colliding with the active caption band
 * - `text-overlap`: two distinct text elements overlapping more than 18% of the smaller box
 */
export function auditLayoutBoxes(boxes: LayoutBox[], frame: LayoutFrameSpec): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const { width, height, shot, at } = frame;
  const margin = frame.safeMargin ?? Math.round(Math.min(width, height) * 0.03);
  const vertical = height > width;
  const where = shot ? `Shot ${shot}` : "Frame";
  const timeNote = at !== undefined ? ` at ${at.toFixed(1)}s` : "";

  // 1. Runtime or compile errors in coded scenes.
  const errors = boxes.filter((b) => b.kind === "error" || (b.kind === "text" && b.text && ERROR_TEXT.test(b.text)));
  if (errors.length) {
    checks.push({
      id: "scene-error",
      category: "layout",
      status: "FAIL",
      shot,
      at,
      summary: `${where}${timeNote} shows a scene error overlay`,
      detail: errors.map((e) => clipText(e.text, 80)).filter(Boolean).join(" · ") || "SceneProblem overlay visible",
    });
  }

  // 2. Broken media elements.
  const broken = boxes.filter((b) => b.kind === "media" && b.broken);
  if (broken.length) {
    checks.push({
      id: "missing-media",
      category: "media",
      status: "FAIL",
      shot,
      at,
      summary: `${where}${timeNote} has ${broken.length} unloaded or broken media element${broken.length === 1 ? "" : "s"}`,
      detail: broken.map((b) => clipText(b.text, 60)).filter(Boolean).join(", ") || undefined,
    });
  }

  const textBoxes = boxes.filter((b) => b.kind === "text" && b.w > 4 && b.h > 4);

  // 3. Edge clipping and safe-margin crowding.
  const clippedOut: string[] = [];
  const nearEdge: string[] = [];
  for (const b of textBoxes) {
    const label = clipText(b.text) || `${Math.round(b.w)}×${Math.round(b.h)}`;
    const out = b.clipped || b.x < -2 || b.y < -2 || b.x + b.w > width + 2 || b.y + b.h > height + 2;
    if (out) {
      clippedOut.push(`"${label}" (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)})`);
    } else if (b.x < margin || b.y < margin || b.x + b.w > width - margin || b.y + b.h > height - margin) {
      nearEdge.push(`"${label}"`);
    }
  }
  if (clippedOut.length) {
    checks.push({
      id: "edge-clip",
      category: "layout",
      status: "FAIL",
      shot,
      at,
      summary: `${where}${timeNote} clips text past the ${width}×${height} frame`,
      detail: clippedOut.slice(0, 3).join(", "),
    });
  } else if (nearEdge.length) {
    checks.push({
      id: "safe-margin",
      category: "layout",
      status: "WARN",
      shot,
      at,
      summary: `${where}${timeNote} crowds the ${margin}px safe margin`,
      detail: nearEdge.slice(0, 3).join(", "),
    });
  }

  // 4. Caption safe-zone collision (when captions are enabled on this shot).
  if (frame.captions) {
    const pos = frame.captionPosition ?? "bottom";
    const bandTop = pos === "bottom" ? height * (vertical ? 0.76 : 0.84) : pos === "top" ? 0 : height * 0.42;
    const bandBottom = pos === "bottom" ? height : pos === "top" ? height * 0.2 : height * 0.58;
    const clashing = textBoxes.filter((b) => b.y + b.h > bandTop && b.y < bandBottom);
    if (clashing.length) {
      checks.push({
        id: "caption-safe-zone",
        category: "layout",
        status: "FAIL",
        shot,
        at,
        summary: `${where}${timeNote} puts text inside the ${pos} caption safe zone`,
        detail: clashing.slice(0, 3).map((b) => `"${clipText(b.text)}" (y=${Math.round(b.y)}–${Math.round(b.y + b.h)})`).join(", "),
      });
    }
  }

  // 5. Text-on-text overlap.
  const overlaps: string[] = [];
  for (let i = 0; i < textBoxes.length; i++) {
    const a = textBoxes[i]!;
    const areaA = a.w * a.h;
    for (let j = i + 1; j < textBoxes.length; j++) {
      const b = textBoxes[j]!;
      const areaB = b.w * b.h;
      const small = Math.min(areaA, areaB);
      if (small <= 0) continue;
      const ratio = overlapArea(a, b) / small;
      // Ignore near-identical duplicate shadow/stroke layers at the same coordinates.
      const samePos = Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4 && (a.text ?? "").trim() === (b.text ?? "").trim();
      if (ratio > 0.18 && !samePos) {
        overlaps.push(`"${clipText(a.text, 24)}" × "${clipText(b.text, 24)}" (${Math.round(ratio * 100)}%)`);
      }
    }
  }
  if (overlaps.length) {
    checks.push({
      id: "text-overlap",
      category: "layout",
      status: "FAIL",
      shot,
      at,
      summary: `${where}${timeNote} has overlapping text elements`,
      detail: overlaps.slice(0, 3).join("; "),
    });
  }

  return checks;
}

export type ReviewSummary = {
  passed: boolean;
  failCount: number;
  warnCount: number;
  passCount: number;
  headline: string;
};

/** Rolls up structured review checks into a single PASS / FAIL verdict. */
export function summarizeReviewChecks(checks: ReviewCheck[]): ReviewSummary {
  const failCount = checks.filter((c) => c.status === "FAIL").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  const passCount = checks.filter((c) => c.status === "PASS").length;
  const passed = failCount === 0;
  const headline = passed
    ? warnCount
      ? `PASS (${warnCount} warning${warnCount === 1 ? "" : "s"}, ${passCount} passed)`
      : `PASS (${passCount} check${passCount === 1 ? "" : "s"} passed)`
    : `FAIL (${failCount} failure${failCount === 1 ? "" : "s"}${warnCount ? `, ${warnCount} warning${warnCount === 1 ? "" : "s"}` : ""})`;
  return { passed, failCount, warnCount, passCount, headline };
}

/** Formats checks as a compact, agent-friendly PASS/FAIL checklist table. */
export function formatReviewReport(checks: ReviewCheck[]): string {
  const s = summarizeReviewChecks(checks);
  const lines = [`Verification: ${s.headline}`];
  const ordered = [
    ...checks.filter((c) => c.status === "FAIL"),
    ...checks.filter((c) => c.status === "WARN"),
    ...checks.filter((c) => c.status === "PASS"),
  ];
  for (const c of ordered) {
    lines.push(`- [${c.status}] (${c.id}) ${c.summary}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  return lines.join("\n");
}

/** One adjacent cut boundary between two AI-generated shots on a picture track. */
export type ContinuityPair = {
  /** Outgoing shot id. */
  from: string;
  /** Incoming shot id. */
  to: string;
  /** Timeline second where the cut occurs. */
  cutAt: number;
  /** Sample timestamp just before the cut inside `from`. */
  outAt: number;
  /** Sample timestamp just after the cut inside `to`. */
  inAt: number;
  /** Shared `@place` cast ids present in both shots (indicates same physical location). */
  sharedPlaces: string[];
  /** Shared character/prop/wardrobe cast ids present in both shots. */
  sharedCast: string[];
};

/** Average brightness and RGB channel means (0..255) of a rendered frame. */
export type FrameTone = { luma: number; r: number; g: number; b: number };

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Finds adjacent AI-generated shot pairs on picture tracks (skipping footage-only cuts, empty placeholders with no
 * take yet, and gaps > 0.5s) along with their shared `@place` and `@cast` entries so `review_cut` can render a
 * side-by-side `OUT -> IN` continuity contact sheet and audit same-location lighting/color jumps.
 */
export function adjacentGeneratedPairs(
  project: Pick<Project, "tracks" | "shots" | "cast">,
  tl: Timeline,
  range?: { from: number; to: number },
): ContinuityPair[] {
  const pictureTracks = new Set(project.tracks.filter((t) => t.kind === "picture").map((t) => t.id));
  const shotsById = new Map(project.shots.map((s) => [s.id, s]));
  const byTrack = new Map<string, Timeline["shots"]>();
  for (const r of tl.shots) {
    if (!pictureTracks.has(r.track) || !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.end <= r.start) continue;
    if (range && (r.end <= range.from + 1e-6 || r.start >= range.to - 1e-6)) continue;
    const list = byTrack.get(r.track) ?? [];
    list.push(r);
    byTrack.set(r.track, list);
  }

  const castIdsOf = (shotId: string) => {
    const s = shotsById.get(shotId);
    if (!s || s.content.kind !== "generated") return { places: new Set<string>(), other: new Set<string>() };
    const text = [s.content.prompt, s.content.clipPrompt].filter(Boolean).join(" ");
    const uses = castOf(text, project.cast, s.content.cast ?? []);
    const places = new Set<string>();
    const other = new Set<string>();
    for (const u of uses) {
      if (u.member.kind === "place") places.add(u.member.id);
      else if (u.member.kind !== "style") other.add(u.member.id);
    }
    return { places, other };
  };

  const pairs: ContinuityPair[] = [];
  for (const list of byTrack.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      if (b.start - a.end > 0.5) continue;
      const sa = shotsById.get(a.id);
      const sb = shotsById.get(b.id);
      if (sa?.content.kind !== "generated" || sb?.content.kind !== "generated") continue;
      if (!sa.content.take || !sb.content.take) continue;
      const durA = a.end - a.start;
      const durB = b.end - b.start;
      const insetA = Math.min(0.15, durA * 0.2);
      const insetB = Math.min(0.15, durB * 0.2);
      const outAt = r3(Math.max(a.start, a.end - Math.max(0.02, insetA)));
      const inAt = r3(Math.min(b.end, b.start + Math.max(0.02, insetB)));
      // When reviewing a sub-range, only include cuts whose boundary sits inside the rendered range.
      if (range && (outAt < range.from - 1e-6 || inAt > range.to + 1e-6)) continue;
      const ca = castIdsOf(a.id);
      const cb = castIdsOf(b.id);
      const sharedPlaces = [...ca.places].filter((id) => cb.places.has(id));
      const sharedCast = [...ca.other].filter((id) => cb.other.has(id));
      pairs.push({ from: a.id, to: b.id, cutAt: r3(b.start), outAt, inAt, sharedPlaces, sharedCast });
    }
  }
  return pairs.sort((x, y) => x.cutAt - y.cutAt);
}

/**
 * Flags sharp brightness or color-temperature/tint jumps across a cut between two generated shots that share the same
 * `@place` location. Leaves intentional location changes alone so scene transitions don't produce false positives.
 */
export function checkContinuityToneJump(pair: ContinuityPair, outTone: FrameTone, inTone: FrameTone): ReviewCheck | undefined {
  if (!pair.sharedPlaces.length) return undefined;
  const reasons: string[] = [];
  const lumaDiff = Math.abs(outTone.luma - inTone.luma);
  if (lumaDiff >= 48) {
    const dir = inTone.luma > outTone.luma ? "brighter" : "darker";
    reasons.push(`exposure jumps ${Math.round(lumaDiff)} luma (${dir})`);
  }
  const sumOut = outTone.r + outTone.g + outTone.b;
  const sumIn = inTone.r + inTone.g + inTone.b;
  // Skip chromaticity comparison on very dark frames where channel ratios are noisy.
  if (sumOut >= 45 && sumIn >= 45) {
    const warmOut = (outTone.r - outTone.b) / sumOut;
    const warmIn = (inTone.r - inTone.b) / sumIn;
    const warmDiff = warmIn - warmOut;
    if (Math.abs(warmDiff) >= 0.14) {
      reasons.push(`color temperature shifts ${warmDiff > 0 ? "warmer" : "cooler"}`);
    }
    const tintOut = (outTone.g - (outTone.r + outTone.b) / 2) / sumOut;
    const tintIn = (inTone.g - (inTone.r + inTone.b) / 2) / sumIn;
    const tintDiff = tintIn - tintOut;
    if (Math.abs(tintDiff) >= 0.12) {
      reasons.push(`color tint shifts toward ${tintDiff > 0 ? "green" : "magenta"}`);
    }
  }
  if (!reasons.length) return undefined;
  const places = pair.sharedPlaces.map((id) => `@${id}`).join(", ");
  return {
    id: "continuity-lighting",
    category: "continuity",
    status: "WARN",
    shot: pair.to,
    at: pair.cutAt,
    summary: `Lighting/color jump across ${pair.from} → ${pair.to} (both in ${places})`,
    detail: `${reasons.join("; ")} — inspect cut pair and consider relight_clip or matching board lighting`,
  };
}
