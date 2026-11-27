import { describe, expect, it } from "vitest";
import {
  adjacentGeneratedPairs,
  auditLayoutBoxes,
  checkContinuityToneJump,
  formatReviewReport,
  resolveTimeline,
  SCHEMA_VERSION,
  STAGE_IDS,
  summarizeReviewChecks,
  tightenLineGaps,
  tightenLineTiming,
  type LayoutBox,
  type Project,
} from "../src/index.ts";

describe("programmatic layout auditing (auditLayoutBoxes)", () => {
  const vertical = { width: 1080, height: 1920, shot: "s02", at: 4.5, captions: true as const };

  it("passes clean, well-spaced layout boxes inside the safe zone", () => {
    const boxes: LayoutBox[] = [
      { kind: "text", text: "Built to last", x: 100, y: 260, w: 880, h: 120 },
      { kind: "text", text: "0.2 mm tolerance", x: 100, y: 430, w: 620, h: 64 },
      { kind: "media", text: "hero.jpg", x: 80, y: 560, w: 920, h: 720, broken: false },
    ];
    expect(auditLayoutBoxes(boxes, vertical)).toEqual([]);
  });

  it("flags edge clipping, caption safe-zone clashes, text overlaps, broken media and scene errors as FAIL", () => {
    const boxes: LayoutBox[] = [
      { kind: "error", text: "scenes/Hero.tsx crashed: TypeError", x: 24, y: 24, w: 700, h: 120 },
      { kind: "media", text: "logo.png", x: 100, y: 200, w: 200, h: 80, broken: true },
      { kind: "text", text: "Overflowing headline that goes offscreen", x: 90, y: 400, w: 1050, h: 90 },
      { kind: "text", text: "Bottom CTA inside captions", x: 140, y: 1560, w: 800, h: 110 },
      { kind: "text", text: "Badge A", x: 200, y: 800, w: 300, h: 100 },
      { kind: "text", text: "Badge B", x: 250, y: 820, w: 300, h: 100 },
    ];
    const checks = auditLayoutBoxes(boxes, vertical);
    const ids = new Map(checks.map((c) => [c.id, c.status]));
    expect(ids.get("scene-error")).toBe("FAIL");
    expect(ids.get("missing-media")).toBe("FAIL");
    expect(ids.get("edge-clip")).toBe("FAIL");
    expect(ids.get("caption-safe-zone")).toBe("FAIL");
    expect(ids.get("text-overlap")).toBe("FAIL");

    const summary = summarizeReviewChecks(checks);
    expect(summary.passed).toBe(false);
    expect(summary.failCount).toBe(5);
    expect(formatReviewReport(checks)).toMatch(/^Verification: FAIL \(5 failures\)/);
  });

  it("warns without failing when text stays inside the frame but crowds the safe margin", () => {
    const boxes: LayoutBox[] = [{ kind: "text", text: "Too close to edge", x: 10, y: 300, w: 500, h: 80 }];
    const checks = auditLayoutBoxes(boxes, { ...vertical, captions: false });
    expect(checks).toHaveLength(1);
    expect(checks[0]!.id).toBe("safe-margin");
    expect(checks[0]!.status).toBe("WARN");
    expect(summarizeReviewChecks(checks).passed).toBe(true);
  });
});

describe("voiceover pacing tightening helpers", () => {
  it("shifts and clamps word timings accurately after trimming dead leading/trailing silence", () => {
    const words = [
      { w: "Hello", s: 0.4, e: 0.7 },
      { w: "world", s: 0.75, e: 1.1 },
    ];
    const r = tightenLineTiming(words, 1.8, 0.35, 1.18);
    expect(r.duration).toBeCloseTo(0.83, 2);
    expect(r.words[0]).toEqual({ w: "Hello", s: 0.05, e: 0.35 });
    expect(r.words[1]).toEqual({ w: "world", s: 0.4, e: 0.75 });
  });

  it("clamps oversized inter-line pauses without crushing short natural gaps", () => {
    const lines = [
      { id: "a", gapAfter: 0.9, holdBefore: 1.2 },
      { id: "b", gapAfter: 0.15 },
      { id: "c", gapAfter: 0.02 },
    ];
    expect(tightenLineGaps(lines)).toEqual([
      { id: "a", gapAfter: 0.25, holdBefore: 0.35 },
      { id: "b", gapAfter: 0.15 },
      { id: "c", gapAfter: 0.08 },
    ]);
  });
});

describe("AI-generated shot-to-shot continuity helpers", () => {
  const proj = (shots: Project["shots"]): Project => ({
    id: "film",
    title: "Film",
    sources: [],
    brief: { goal: "story" },
    assets: [],
    cast: [
      { id: "cat", name: "Cat", kind: "character" },
      { id: "mug", name: "Blue Mug", kind: "prop" },
      { id: "kitchen", name: "Kitchen", kind: "place" },
      { id: "alley", name: "Alley", kind: "place" },
      { id: "noir", name: "Noir", kind: "style" },
    ],
    cut: { id: "main", name: "Main" },
    recipe: "film",
    spec: {},
    formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as Project["stages"],
    spine: "shots",
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots,
    notes: [],
  });

  it("pairs only adjacent generated shots with takes, skipping footage clips, empty placeholders and large gaps", () => {
    const p = proj([
      { id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 3, content: { kind: "generated", prompt: "@cat holds @mug in @kitchen", take: "a1" } },
      { id: "s2", track: "pic", fidelity: "rough", start: { kind: "time", t: 3 }, duration: 4, content: { kind: "generated", prompt: "Close-up of @cat sipping @mug in @kitchen", take: "a2" } },
      { id: "s3", track: "pic", fidelity: "rough", start: { kind: "time", t: 7 }, duration: 3, content: { kind: "clip", asset: "real-clip" } },
      { id: "s4", track: "pic", fidelity: "rough", start: { kind: "time", t: 10 }, duration: 3, content: { kind: "generated", prompt: "@cat in @alley", take: "a4" } },
      { id: "s5", track: "pic", fidelity: "rough", start: { kind: "time", t: 13 }, duration: 2, content: { kind: "generated", prompt: "@cat runs in @alley" } }, // no take yet
      { id: "s6", track: "pic", fidelity: "rough", start: { kind: "time", t: 18 }, duration: 3, content: { kind: "generated", prompt: "@cat stops in @alley", take: "a6" } },
    ]);
    const tl = resolveTimeline(p);
    expect(adjacentGeneratedPairs(p, tl)).toEqual([
      { from: "s1", to: "s2", cutAt: 3, outAt: 2.85, inAt: 3.15, sharedPlaces: ["kitchen"], sharedCast: ["cat", "mug"] },
    ]);
    expect(adjacentGeneratedPairs(p, tl, { from: 4, to: 10 })).toEqual([]);
  });

  it("flags sharp exposure and color-cast shifts on same-place cuts while ignoring matching frames or different locations", () => {
    const samePlace = { from: "s1", to: "s2", cutAt: 3, outAt: 2.85, inAt: 3.15, sharedPlaces: ["kitchen"], sharedCast: ["cat"] };
    const diffPlace = { ...samePlace, sharedPlaces: [] };
    // Matching tones -> clean
    expect(checkContinuityToneJump(samePlace, { luma: 120, r: 135, g: 120, b: 100 }, { luma: 128, r: 142, g: 126, b: 106 })).toBeUndefined();
    // Large exposure drop -> WARN
    const exp = checkContinuityToneJump(samePlace, { luma: 180, r: 180, g: 180, b: 180 }, { luma: 95, r: 95, g: 95, b: 95 });
    expect(exp).toMatchObject({ id: "continuity-lighting", category: "continuity", status: "WARN", shot: "s2" });
    expect(exp?.detail).toContain("exposure jumps");
    // Warm-to-cool shift at similar luma -> WARN
    const temp = checkContinuityToneJump(samePlace, { luma: 125, r: 180, g: 120, b: 70 }, { luma: 125, r: 75, g: 125, b: 185 });
    expect(temp?.detail).toContain("color temperature shifts cooler");
    // Different location -> ignored even on big shift
    expect(checkContinuityToneJump(diffPlace, { luma: 180, r: 180, g: 120, b: 70 }, { luma: 60, r: 40, g: 60, b: 110 })).toBeUndefined();
    // Unused constant check kept clean
    expect(SCHEMA_VERSION).toBeTruthy();
  });
});
