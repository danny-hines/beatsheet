import { describe, expect, it } from "vitest";
import { auditLayoutBoxes, formatReviewReport, summarizeReviewChecks, tightenLineGaps, tightenLineTiming, type LayoutBox } from "../src/index.ts";

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
