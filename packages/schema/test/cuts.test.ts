import { describe, expect, it } from "vitest";
import { branchCut, checkReferences, cutView, freshCut, parseFile, SCHEMA_V1, SCHEMA_VERSION, STAGE_IDS, withCut } from "../src/index.ts";

// A project as written before cuts: one cut, one media folder, length in the brief.
const v1 = {
  schema: SCHEMA_V1,
  id: "trip",
  title: "Beach trip",
  recipe: "montage",
  mediaRoot: "~/Movies/trip",
  brief: { goal: "reel", targetLength: 30, platforms: ["Instagram"], references: ["https://example.com/inspo", "~/Movies/last-year", "warm, golden-hour"] },
  formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
  stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
  spine: "music",
  assets: [{ id: "v1", kind: "video", path: "a.mp4", duration: 10 }],
  tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
  shots: [{ id: "s1", track: "pic", content: { kind: "clip", asset: "v1" }, fidelity: "rough" }],
  notes: [{ id: "n1", text: "tighter", status: "open", target: { kind: "shot", shot: "s1" }, author: "you", createdAt: "2026-10-24" }],
};

const load = () => {
  const r = parseFile(v1);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.file;
};

describe("files from before cuts", () => {
  it("become one Main cut with the media folder as the first source", () => {
    const f = load();
    expect(f.schema).toBe(SCHEMA_VERSION);
    expect(f.sources).toEqual([{ id: "footage", path: "~/Movies/trip" }]);
    expect(f.cuts.map((c) => [c.id, c.name])).toEqual([["main", "Main cut"]]);
    expect(f.cuts[0]!.spec).toEqual({ targetLength: 30, platforms: ["Instagram"] });
    expect(f.cuts[0]!.shots).toHaveLength(1);
    expect(checkReferences(f)).toEqual([]);
  });

  it("turn plain-text references into links, folders and notes", () => {
    expect(load().brief.references).toEqual([
      { kind: "url", value: "https://example.com/inspo" },
      { kind: "folder", value: "~/Movies/last-year" },
      { kind: "note", value: "warm, golden-hour" },
    ]);
  });
});

describe("cut views", () => {
  it("round-trip: a view written back changes only that cut and the shared parts", () => {
    const f = load();
    const view = cutView(f, "main");
    expect(view.cut).toEqual({ id: "main", name: "Main cut" });
    expect(view.spec.targetLength).toBe(30);
    view.shots[0]!.fidelity = "final";
    view.assets[0]!.rating = 5;
    const back = withCut(f, view);
    expect(back.cuts[0]!.shots[0]!.fidelity).toBe("final");
    expect(back.assets[0]!.rating).toBe(5);
    expect(back.cuts).toHaveLength(1);
    expect(parseFile(back).ok).toBe(true);
  });

  it("branch: a new cut copies the shots but not the notes, and says where it came from", () => {
    const { file, cut } = branchCut(load(), "main", { name: "Bouncy take", spec: { targetLength: 20 }, origin: { by: "agent", note: "more energy" } });
    expect(cut.id).toBe("bouncy-take");
    expect(cut.shots).toHaveLength(1);
    expect(cut.notes).toEqual([]);
    expect(cut.spec).toEqual({ targetLength: 20, platforms: ["Instagram"] });
    expect(cut.origin).toMatchObject({ by: "agent", from: "main", note: "more energy" });
    expect(file.cuts.map((c) => c.id)).toEqual(["main", "bouncy-take"]);
    expect(checkReferences(file)).toEqual([]);
    expect(cutView(file, "bouncy-take").spec.targetLength).toBe(20);
  });

  it("references are checked in every cut", () => {
    const { file } = branchCut(load(), "main", { name: "B", origin: { by: "you" } });
    file.cuts[1]!.shots[0]!.track = "nope";
    expect(checkReferences(file)).toEqual([{ path: "cuts.1.shots.0", message: 'unknown track "nope"' }]);
  });

  it("fresh: a new cut starts empty, in its own formats, with the stages after the material to do again", () => {
    const f = load();
    f.cuts[0]!.stages.material = { status: "done" };
    f.cuts[0]!.stages.assemble = { status: "done", locked: true };
    f.cuts[0]!.stages.board = { status: "skipped" };
    const landscape = { id: "landscape", label: "16:9", width: 1920, height: 1080, fps: 30 };
    const { file, cut } = freshCut(f, "main", { name: "YouTube", formats: [landscape], spec: { targetLength: 120 }, origin: { by: "you" } });
    expect(cut).toMatchObject({ id: "youtube", recipe: "montage", spine: "music", formats: [landscape], spec: { targetLength: 120 }, shots: [], notes: [], music: { cues: [] } });
    expect(cut.origin?.from).toBeUndefined();
    expect(cut.tracks).toEqual(f.cuts[0]!.tracks);
    expect([cut.stages.material.status, cut.stages.board.status, cut.stages.assemble]).toEqual(["done", "skipped", { status: "todo" }]);
    expect(file.cuts[0]!.shots).toHaveLength(1);
    expect(parseFile(file).ok).toBe(true);
    expect(checkReferences(file)).toEqual([]);
  });
});
