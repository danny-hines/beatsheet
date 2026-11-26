import { describe, expect, it } from "vitest";
import { ARKIT_BLENDSHAPES, EMOTION_PRESETS, faceFrameAt, type FacePerformanceTrack } from "../src/index.ts";

describe("ARKit blendshape performance track & smoothing", () => {
  it("defines all 52 standard ARKit blendshapes and built-in emotion presets", () => {
    expect(ARKIT_BLENDSHAPES).toHaveLength(52);
    expect(ARKIT_BLENDSHAPES).toContain("jawOpen");
    expect(ARKIT_BLENDSHAPES).toContain("eyeBlinkLeft");
    expect(ARKIT_BLENDSHAPES).toContain("browInnerUp");
    expect(Object.keys(EMOTION_PRESETS)).toEqual(expect.arrayContaining(["neutral", "joy", "surprise", "anger", "sadness", "skeptical", "smirk", "focus"]));
  });

  it("interpolates head pose & blendshapes smoothly and scales intensity without exceeding [0, 1]", () => {
    const track: FacePerformanceTrack = {
      version: 1,
      fps: 30,
      duration: 1,
      frames: [
        { t: 0, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: { mouthSmileLeft: 0, jawOpen: 0 } },
        { t: 0.5, pose: { pitch: 0.2, yaw: 0.4, roll: 0.1 }, shapes: { mouthSmileLeft: 0.8, jawOpen: 0.5 } },
        { t: 1.0, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: { mouthSmileLeft: 0, jawOpen: 0 } },
      ],
    };
    const exactMid = faceFrameAt(track, 0.25, { smoothWindow: 0 });
    expect(exactMid.pose.yaw).toBeCloseTo(0.2, 3);
    expect(exactMid.shapes.mouthSmileLeft).toBeCloseTo(0.4, 3);

    // Intensity scaling clamps blendshapes cleanly to 1.0.
    const boosted = faceFrameAt(track, 0.5, { smoothWindow: 0, intensity: 1.5 });
    expect(boosted.shapes.mouthSmileLeft).toBe(1);
    expect(boosted.shapes.jawOpen).toBeCloseTo(0.75, 3);
    expect(boosted.pose.yaw).toBeCloseTo(0.6, 3);

    // Temporal smoothing suppresses a single-frame jitter spike.
    const jitter: FacePerformanceTrack = {
      version: 1,
      fps: 30,
      duration: 0.4,
      frames: [
        { t: 0.0, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: { eyeBlinkLeft: 0 } },
        { t: 0.1, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: { eyeBlinkLeft: 0 } },
        { t: 0.2, pose: { pitch: 0, yaw: 0.8, roll: 0 }, shapes: { eyeBlinkLeft: 1.0 } },
        { t: 0.3, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: { eyeBlinkLeft: 0 } },
        { t: 0.4, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: { eyeBlinkLeft: 0 } },
      ],
    };
    const smoothed = faceFrameAt(jitter, 0.2, { smoothWindow: 0.08 });
    expect(smoothed.pose.yaw).toBeLessThan(0.55);
    expect(smoothed.pose.yaw).toBeGreaterThan(0.15);
  });
});
