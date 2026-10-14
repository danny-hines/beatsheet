import { describe, expect, it } from "vitest";
import { autoAssemble, checkReferences, Project, resolveTimeline, SCHEMA_VERSION, STAGE_IDS } from "../src/index.ts";

const make = () =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "trip",
    title: "Beach trip",
    recipe: "montage",
    brief: { goal: "reel", targetLength: 30 },
    formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "music",
    assets: [
      {
        id: "song", kind: "music", path: "song.mp3", duration: 120,
        grid: { bpm: 120, downbeat: 0, beatsPerBar: 4 },
        sections: [
          { id: "intro", label: "Intro", start: 0, level: "low" },
          { id: "build", label: "Build", start: 16, level: "mid" },
          { id: "drop", label: "Drop", start: 32, level: "high" },
          { id: "outro", label: "Outro", start: 64, level: "low" },
        ],
      },
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `v${i}`, kind: "video" as const, path: `v${i}.mp4`, duration: 14, width: 1920, height: 1080, capturedAt: `2026-07-04T1${i}:00:00` })),
      { id: "p1", kind: "image" as const, path: "p1.jpg", width: 3000, height: 4000, capturedAt: "2026-07-04T10:30:00" },
      { id: "bad", kind: "video" as const, path: "bad.mp4", duration: 10, rating: -1, capturedAt: "2026-07-04T09:00:00" },
    ],
    tracks: [],
    shots: [],
    notes: [{ id: "n1", text: "x", status: "queued", target: { kind: "shot", shot: "old" }, at: 3, author: "you", createdAt: "2026-07-05" }],
  });

describe("autoAssemble", () => {
  const { project, summary } = autoAssemble(make());
  const tl = resolveTimeline(project);

  it("starts 8 bars before the drop and runs the target length on a bar", () => {
    expect(project.music!.cues[0]!.from).toBe(16);
    expect(tl.duration).toBe(30);
    expect(tl.sections.find((s) => s.id === "drop")!.start).toBe(16);
    expect(summary[0]).toContain("15 bars");
  });

  it("cuts every bar in the build and every two beats in the drop", () => {
    const pics = tl.shots.filter((s) => s.track === "pic");
    const starts = pics.map((s) => s.start);
    expect(starts.slice(0, 9)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16]);
    expect(starts.slice(8, 12)).toEqual([16, 17, 18, 19]);
    expect(pics.at(-1)!.end).toBe(30);
    expect(tl.diagnostics).toEqual([]);
  });

  it("uses footage in the order it was shot, never rejected clips, reframing landscape for vertical", () => {
    const clips = project.shots.filter((s) => s.content.kind === "clip").map((s) => (s.content.kind === "clip" ? s.content.asset : ""));
    expect(clips).not.toContain("bad");
    expect(clips[0]).toBe("v0");
    expect(clips.indexOf("p1")).toBeGreaterThan(clips.indexOf("v0"));
    const v = project.shots.find((s) => s.content.kind === "clip" && s.content.asset.startsWith("v"))!;
    expect(v.content.kind === "clip" && v.content.reframe?.vertical).toBeTruthy();
  });

  it("adds a title, keeps references valid and re-points notes on removed shots", () => {
    expect(project.shots.find((s) => s.id === "t1")!.content).toMatchObject({ kind: "text", text: "Beach trip" });
    expect(checkReferences(project)).toEqual([]);
    expect(project.notes[0]!.target).toEqual({ kind: "time", t: 3 });
  });
});
