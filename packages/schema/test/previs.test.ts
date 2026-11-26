import { describe, expect, it } from "vitest";
import {
  CATALOG,
  fitModel,
  isCameraSheet,
  lensToFov,
  PREVIS_BY_ID,
  PREVIS_MOVES,
  previsCameraAt,
  previsSubjectAt,
  rampProgress,
  shapeOf,
  type ServiceState,
} from "../src/index.ts";

describe("previs camera-move presets", () => {
  it("exposes a curated library of unique camera moves across families", () => {
    expect(PREVIS_MOVES.length).toBeGreaterThanOrEqual(24);
    const ids = PREVIS_MOVES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PREVIS_BY_ID.get("orbit")?.family).toBe("people");
    expect(PREVIS_BY_ID.get("bullet-time")?.family).toBe("action");
    expect(PREVIS_BY_ID.get("product-spin")?.family).toBe("objects");
  });

  it("converts focal length to vertical FOV sensibly", () => {
    expect(lensToFov(24)).toBeGreaterThan(lensToFov(50));
    expect(lensToFov(50)).toBeGreaterThan(lensToFov(85));
    expect(lensToFov(35)).toBeCloseTo(37.85, 1);
  });

  it("produces a strictly monotonic speed-ramp curve anchored at 0 and 1", () => {
    const ramp = { at: 0.5, slow: 0.2, width: 0.2 };
    expect(rampProgress(0, ramp)).toBe(0);
    expect(rampProgress(1, ramp)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = rampProgress(i / 20, ramp);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Midpoint moves slower than the edges.
    const midStep = rampProgress(0.55, ramp) - rampProgress(0.45, ramp);
    const startStep = rampProgress(0.1, ramp) - rampProgress(0, ramp);
    expect(midStep).toBeLessThan(startStep);
  });

  it("evaluates finite, moving camera poses for every preset", () => {
    for (const preset of PREVIS_MOVES) {
      const a = previsCameraAt(preset.id, 0);
      const mid = previsCameraAt(preset.id, 0.5);
      const b = previsCameraAt(preset.id, 1);
      for (const s of [a, mid, b]) {
        expect(s.pos.every(Number.isFinite)).toBe(true);
        expect(s.target.every(Number.isFinite)).toBe(true);
        expect(s.fov).toBeGreaterThan(5);
        expect(s.fov).toBeLessThan(120);
      }
      // Every move changes camera position, target, or fov across the shot.
      const moved =
        Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) +
        Math.hypot(mid.pos[0] - a.pos[0], mid.pos[1] - a.pos[1], mid.pos[2] - a.pos[2]) +
        Math.hypot(b.target[0] - a.target[0], b.target[1] - a.target[1], b.target[2] - a.target[2]) +
        Math.abs(b.fov - a.fov);
      expect(moved, preset.id).toBeGreaterThan(0.05);
    }
  });

  it("interpolates moving stand-ins between start and moveTo", () => {
    const s = { x: -1, z: 2, moveTo: [1, -2] as [number, number] };
    expect(previsSubjectAt(s, 0)).toEqual({ x: -1, z: 2 });
    expect(previsSubjectAt(s, 0.5)).toEqual({ x: 0, z: 0 });
    expect(previsSubjectAt(s, 1)).toEqual({ x: 1, z: -2 });
  });
});

describe("blockout 16-frame contact-sheet mode", () => {
  const services: Record<string, ServiceState> = {
    fal: { label: "fal", state: "ready" },
    tein: { label: "Tein", state: "ready" },
  };
  const sheetCam = { cut: "blockout", format: "wide", from: 0, to: 5, mode: "sheet" as const };
  const videoCam = { cut: "blockout", format: "wide", from: 0, to: 5, mode: "video" as const };

  it("uses the refs shape for sheet mode and the camera shape for video mode", () => {
    expect(isCameraSheet(sheetCam)).toBe(true);
    expect(isCameraSheet(videoCam)).toBe(false);
    expect(shapeOf({ camera: sheetCam })).toBe("refs");
    expect(shapeOf({ camera: videoCam })).toBe("camera");
  });

  it("allows multi-ref video models like Wan 3.0 to follow a 16-frame sheet without video-input billing", () => {
    const wan = CATALOG.find((m) => m.id === "wan-3")!;
    const onVideo = fitModel(wan, { op: "video", prompt: "hero", seconds: 5, aspect: "16:9", camera: videoCam }, services);
    expect(onVideo.ok).toBe(false);
    const onSheet = fitModel(wan, { op: "video", prompt: "hero", seconds: 5, aspect: "16:9", camera: sheetCam }, services);
    expect(onSheet.ok).toBe(true);
    if (onSheet.ok) {
      expect(onSheet.endpoint).toBe("alibaba/wan-3.0/reference-to-video");
      expect(onSheet.usd).toBeCloseTo(0.25, 2);
    }
  });

  it("avoids Seedance double-billed reference-video duration when using sheet mode", () => {
    const seedance = CATALOG.find((m) => m.id === "seedance-2.5")!;
    const vid = fitModel(seedance, { op: "video", prompt: "orbit", seconds: 6, aspect: "16:9", camera: { cut: "b", format: "wide", from: 0, to: 6 }, via: "tein" }, services);
    const sht = fitModel(seedance, { op: "video", prompt: "orbit", seconds: 6, aspect: "16:9", camera: { cut: "b", format: "wide", from: 0, to: 6, mode: "sheet" }, via: "tein" }, services);
    expect(vid.ok && sht.ok).toBe(true);
    if (vid.ok && sht.ok) expect(sht.usd!).toBeLessThan(vid.usd!);
  });
});
