import { describe, expect, it } from "vitest";
import { Project, resolveTimeline, SCHEMA_VERSION, STAGE_IDS, type Anchor, type Asset, type ProjectInput } from "@beatsheet/schema";
import { dropAsset, putInShot } from "../src/place.ts";

const take: Asset = { id: "take1", kind: "video", path: "made/takes/j1.mp4", duration: 6, provenance: { source: "generated", provider: "fal", refs: ["board1"], params: { model: "kling-3", quality: "final" } } };
const still: Asset = { id: "board1", kind: "image", path: "made/takes/j0.jpg", provenance: { source: "generated", provider: "meta", params: { model: "muse-image" } } };
const footage: Asset = { id: "beach", kind: "video", path: "beach.mp4", duration: 42 };

const make = (shots: ProjectInput["shots"]): Project =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "t",
    title: "test",
    recipe: "film",
    brief: { goal: "test" },
    formats: [{ id: "port", label: "9:16", width: 1080, height: 1920, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "shots",
    assets: [take, still, footage, { id: "a", kind: "video", path: "a.mp4", duration: 20 }, { id: "b", kind: "video", path: "b.mp4", duration: 20 }],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots,
    notes: [],
  });
const at = (t: number): Anchor => ({ kind: "time", t });
const drop = (p: Project, t: number, a: Asset) => {
  const id = dropAsset(p, resolveTimeline(p), "pic", t, at(t), a);
  return { id, tl: resolveTimeline(p) };
};
const spans = (tl: ReturnType<typeof resolveTimeline>) => tl.shots.map((s) => `${s.id} ${s.start}-${s.end}`);

describe("putting a take in a shot", () => {
  it("makes a placeholder a made shot showing it, and a final clip remembers the board it started from", () => {
    const p = make([{ id: "s1", track: "pic", duration: 3, content: { kind: "placeholder", description: "the cat wakes" }, fidelity: "idea" }]);
    putInShot(p, "s1", still);
    expect(p.shots[0]).toMatchObject({ fidelity: "board", content: { kind: "generated", prompt: "the cat wakes", take: "board1", takes: ["board1"], provider: "meta", model: "muse-image" } });
    putInShot(p, "s1", take);
    expect(p.shots[0]).toMatchObject({ fidelity: "final", content: { take: "take1", takes: ["board1", "take1"], start: "board1" } });
  });
});

describe("dropping a picture on the timeline", () => {
  it("goes into a placeholder it's dropped on", () => {
    const p = make([
      { id: "s1", track: "pic", duration: 3, content: { kind: "clip", asset: "a" }, fidelity: "rough" },
      { id: "s2", track: "pic", duration: 3, content: { kind: "placeholder", description: "the cat wakes" }, fidelity: "idea" },
    ]);
    expect(drop(p, 4, still).id).toBe("s2");
    expect(p.shots).toHaveLength(2);
    expect(p.shots[1]!.content).toMatchObject({ kind: "generated", take: "board1" });
  });

  it("follows a shot with a length of its own, pushing the ones after it along", () => {
    const p = make([
      { id: "s1", track: "pic", duration: 3, content: { kind: "clip", asset: "a" }, fidelity: "rough" },
      { id: "s2", track: "pic", duration: 3, content: { kind: "clip", asset: "b" }, fidelity: "rough" },
    ]);
    const { id, tl } = drop(p, 1, footage);
    expect(id).toBe("shot3");
    // Long footage comes in at 8 seconds, to be trimmed.
    expect(spans(tl)).toEqual(["s1 0-3", "shot3 3-11", "s2 11-14"]);
    expect(p.shots[1]).toEqual({ id: "shot3", track: "pic", duration: 8, content: { kind: "clip", asset: "beach" }, fidelity: "rough" });
  });

  it("splits a shot that runs until the next one starts, where it was dropped", () => {
    const p = make([
      { id: "s1", track: "pic", start: at(0), content: { kind: "clip", asset: "a" }, fidelity: "rough" },
      { id: "s2", track: "pic", start: at(6), content: { kind: "clip", asset: "b" }, fidelity: "rough" },
      { id: "end", track: "pic", start: at(10), duration: 2, content: { kind: "clip", asset: "b" }, fidelity: "rough" },
    ]);
    const { tl } = drop(p, 2.5, still);
    expect(spans(tl)).toEqual(["s1 0-2.5", "shot4 2.5-6", "s2 6-10", "end 10-12"]);
  });

  it("goes at the end when dropped past the last shot, and before the first when dropped ahead of it, up to where it starts", () => {
    const p = make([{ id: "s1", track: "pic", start: at(2), duration: 3, content: { kind: "clip", asset: "a" }, fidelity: "rough" }]);
    expect(spans(drop(p, 9, take).tl)).toEqual(["s1 2-5", "shot2 5-11"]);
    expect(spans(drop(p, 0.5, still).tl)).toEqual(["shot3 0.5-2", "s1 2-5", "shot2 5-11"]);
  });
});
