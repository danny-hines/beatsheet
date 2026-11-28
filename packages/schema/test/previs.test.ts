import { describe, expect, it } from "vitest";
import {
  blockoutDuration,
  blockoutProject,
  cameraOnShot,
  CATALOG,
  classifyGeneratedAssets,
  fitModel,
  isCameraBlockout,
  isCameraSheet,
  lensToFov,
  PREVIS_BY_ID,
  PREVIS_MOVES,
  previsCameraAt,
  previsSubjectAt,
  previsThumbAt,
  ProjectFile,
  rampProgress,
  resolveTimeline,
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

  it("provides a valid resting thumbnail progress for every preset", () => {
    for (const preset of PREVIS_MOVES) {
      const u = previsThumbAt(preset);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
    expect(previsThumbAt("wipe-reveal")).toBeGreaterThan(0.5);
    expect(previsThumbAt("unknown-id")).toBeCloseTo(0.42, 2);
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

describe("shot-owned blockouts and asset classification", () => {
  const services: Record<string, ServiceState> = {
    fal: { label: "fal", state: "ready" },
    tein: { label: "Tein", state: "ready" },
  };

  it("synthesizes a playable 1-track Project from shot.blockout matching the requested aspect", () => {
    const doc = ProjectFile.parse({
      schema: "beatsheet/0.2",
      id: "demo",
      title: "Demo",
      brief: { goal: "Test" },
      assets: [],
      cuts: [
        {
          id: "main",
          name: "Main",
          recipe: "film",
          formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
          stages: {
            brief: { status: "done" },
            material: { status: "done" },
            structure: { status: "done" },
            board: { status: "active" },
            assemble: { status: "todo" },
            craft: { status: "todo" },
            sound: { status: "todo" },
            finish: { status: "todo" },
          },
          spine: "shots",
          tracks: [{ id: "v", kind: "picture", label: "Video" }],
          shots: [
            {
              id: "orbit-1",
              track: "v",
              duration: 6,
              content: { kind: "placeholder", description: "Orbit around @cat" },
              blockout: {
                beats: [
                  { id: "b1", label: "Orbit", duration: 3.5, component: "kit:Previs", props: { move: "orbit" } },
                  { id: "b2", label: "Push", duration: 2.5, component: "kit:Previs", props: { move: "push-in" } },
                ],
                mode: "video",
                note: "Orbit into push-in",
              },
              fidelity: "idea",
            },
          ],
          notes: [],
        },
      ],
    });
    const b = doc.cuts[0]!.shots[0]!.blockout!;
    expect(blockoutDuration(b)).toBe(6);
    const wide = blockoutProject({ ...doc, formats: doc.cuts[0]!.formats }, "orbit-1", b, "16:9");
    expect(wide.duration).toBe(6);
    expect(wide.format.id).toBe("wide");
    const tl = resolveTimeline(wide.project, wide.format.id);
    expect(tl.duration).toBeCloseTo(6, 2);
    expect(tl.shots.map((s) => s.id)).toEqual(["b1", "b2"]);

    // Requesting a vertical shape synthesizes a vertical format automatically.
    const tall = blockoutProject({ ...doc, formats: doc.cuts[0]!.formats }, "orbit-1", b, "9:16");
    expect(tall.format.height).toBeGreaterThan(tall.format.width);
  });

  it("handles shot-owned blockouts in shapeOf, fitModel and cameraOnShot with snapshot preservation", () => {
    const cam = { blockout: true as const, shot: "orbit-1", cut: "main", from: 0, to: 6, snapshot: "made/blockouts/abc123.mp4", snapshotKind: "video" as const };
    expect(isCameraBlockout(cam)).toBe(true);
    expect(isCameraSheet(cam)).toBe(false);
    expect(shapeOf({ camera: cam })).toBe("camera");
    expect(cameraOnShot(cam)).toEqual({ blockout: true, snapshot: "made/blockouts/abc123.mp4", snapshotKind: "video" });

    const seedance = CATALOG.find((m) => m.id === "seedance-2.5")!;
    const fit = fitModel(seedance, { op: "video", prompt: "orbit", seconds: 6, aspect: "16:9", camera: cam, via: "tein" }, services);
    expect(fit.ok).toBe(true);
  });

  it("classifies generated assets into chosen clips/boards, shot intermediates, alt clips, cast and standalone", () => {
    const doc = ProjectFile.parse({
      schema: "beatsheet/0.2",
      id: "demo",
      title: "Demo",
      brief: { goal: "Test" },
      cast: [{ id: "cat", name: "Cat", kind: "character", portrait: "cat-p1", portraits: ["cat-p2"] }],
      assets: [
        { id: "cat-p1", kind: "image", path: "p1.jpg", provenance: { source: "generated" } },
        { id: "cat-p2", kind: "image", path: "p2.jpg", provenance: { source: "generated" } },
        { id: "cat-old-sheet", kind: "image", path: "s0.jpg", tags: ["sheet"], provenance: { source: "generated" } },
        { id: "s1-b1", kind: "image", path: "b1.jpg", provenance: { source: "generated" } },
        { id: "s1-b2", kind: "image", path: "b2.jpg", provenance: { source: "generated" } },
        { id: "s1-v1", kind: "video", path: "v1.mp4", provenance: { source: "generated", params: { start: "s1-b1" } } },
        { id: "s1-v2", kind: "video", path: "v2.mp4", provenance: { source: "generated", params: { start: "s1-b1" } } },
        { id: "s2-b1", kind: "image", path: "s2b1.jpg", provenance: { source: "generated" } },
        { id: "s2-b2", kind: "image", path: "s2b2.jpg", provenance: { source: "generated" } },
        { id: "loose-1", kind: "image", path: "l1.jpg", provenance: { source: "generated" } },
      ],
      cuts: [
        {
          id: "main",
          name: "Main",
          recipe: "film",
          formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
          stages: {
            brief: { status: "done" },
            material: { status: "done" },
            structure: { status: "done" },
            board: { status: "active" },
            assemble: { status: "todo" },
            craft: { status: "todo" },
            sound: { status: "todo" },
            finish: { status: "todo" },
          },
          spine: "shots",
          tracks: [{ id: "v", kind: "picture", label: "Video" }],
          shots: [
            {
              id: "s1",
              track: "v",
              duration: 5,
              content: { kind: "generated", prompt: "x", take: "s1-v2", start: "s1-b1", takes: ["s1-b1", "s1-b2", "s1-v1", "s1-v2"] },
              fidelity: "rough",
            },
            {
              id: "s2",
              track: "v",
              duration: 5,
              content: { kind: "generated", prompt: "y", take: "s2-b2", takes: ["s2-b1", "s2-b2"] },
              fidelity: "board",
            },
          ],
          notes: [],
        },
      ],
    });
    const map = classifyGeneratedAssets(doc, "main");
    expect(map.get("cat-p1")).toEqual({ role: "cast", intermediate: true, owner: { kind: "cast", member: "cat" } });
    expect(map.get("cat-old-sheet")).toEqual({ role: "cast", intermediate: true, owner: { kind: "cast", member: "cat" } });
    expect(map.get("s1-v2")).toEqual({ role: "chosen-clip", intermediate: false, owner: { kind: "shot", cut: "main", shot: "s1" } });
    expect(map.get("s1-v1")).toEqual({ role: "shot-alt-clip", intermediate: true, owner: { kind: "shot", cut: "main", shot: "s1" } });
    expect(map.get("s1-b1")).toEqual({ role: "shot-intermediate", intermediate: true, owner: { kind: "shot", cut: "main", shot: "s1" } });
    expect(map.get("s1-b2")).toEqual({ role: "shot-intermediate", intermediate: true, owner: { kind: "shot", cut: "main", shot: "s1" } });
    expect(map.get("s2-b2")).toEqual({ role: "chosen-board", intermediate: false, owner: { kind: "shot", cut: "main", shot: "s2" } });
    expect(map.get("s2-b1")).toEqual({ role: "shot-intermediate", intermediate: true, owner: { kind: "shot", cut: "main", shot: "s2" } });
    expect(map.get("loose-1")).toEqual({ role: "standalone", intermediate: false });
  });
});
