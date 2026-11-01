import { describe, expect, it } from "vitest";
import {
  checkCut,
  copyShots,
  moveShot,
  overwrite,
  pasteShots,
  Project,
  removeRange,
  removeShots,
  resolveTimeline,
  SCHEMA_VERSION,
  slipShot,
  splitShot,
  STAGE_IDS,
  trimStart,
  type Anchor,
  type ProjectInput,
} from "../src/index.ts";

const words = (...ws: [string, number, number][]) => ws.map(([w, s, e]) => ({ w, s, e }));

const make = (over: Partial<ProjectInput> = {}): Project =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "t",
    title: "test",
    recipe: "test",
    brief: { goal: "test" },
    formats: [{ id: "land", label: "16:9", width: 1920, height: 1080, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "shots",
    assets: [
      { id: "a", kind: "video", path: "a.mp4", duration: 30, moments: [{ id: "jump", t: 12, label: "the jump" }] },
      { id: "b", kind: "video", path: "b.mp4", duration: 30 },
      { id: "c", kind: "video", path: "c.mp4", duration: 30 },
      { id: "photo", kind: "image", path: "p.jpg" },
    ],
    tracks: [
      { id: "pic", kind: "picture", label: "Picture" },
      { id: "txt", kind: "text", label: "Text" },
    ],
    shots: [],
    notes: [],
    ...over,
  });
const clip = (asset: string, extra: Record<string, unknown> = {}) => ({ kind: "clip" as const, asset, ...extra });
const spans = (p: Project, track = "pic") =>
  resolveTimeline(p)
    .shots.filter((r) => r.track === track)
    .map((r) => `${r.id} ${+r.start.toFixed(3)}-${+r.end.toFixed(3)}${r.sourceIn !== undefined ? ` @${+r.sourceIn.toFixed(3)}` : ""}`);
const ok = (p: Project) => {
  expect(checkCut(p)).toEqual([]);
  expect(resolveTimeline(p).diagnostics).toEqual([]);
};

// Three clips one after another, each with its own length: a cut timed by its shots.
const chain = () =>
  make({
    shots: [
      { id: "s1", track: "pic", duration: 4, content: clip("a", { in: 2 }), fidelity: "rough" },
      { id: "s2", track: "pic", duration: 3, content: clip("b"), fidelity: "rough" },
      { id: "s3", track: "pic", duration: 5, content: clip("c", { in: 1 }), fidelity: "rough" },
    ],
  });

// Narration timing the cuts: each shot starts on a word.
const voiced = () =>
  make({
    spine: "voice",
    voice: {
      leadIn: 0,
      defaultGap: 0,
      tail: 0,
      lines: [{ id: "L1", text: "one two three four", duration: 8, words: words(["one", 0, 1], ["two", 2, 3], ["three", 4, 5], ["four", 6, 7]) }],
    },
    shots: [
      { id: "s1", track: "pic", start: { kind: "word", line: "L1", word: "one" }, content: clip("a"), fidelity: "rough" },
      { id: "s2", track: "pic", start: { kind: "word", line: "L1", word: "two" }, content: clip("b", { in: 5 }), fidelity: "rough" },
      { id: "s3", track: "pic", start: { kind: "word", line: "L1", word: "four" }, content: clip("c"), fidelity: "rough" },
      { id: "t1", track: "txt", start: { kind: "shot", shot: "s2" }, end: { kind: "shot", shot: "s2", edge: "end" }, content: { kind: "text", text: "hi" }, fidelity: "final" },
    ],
  });

describe("splitting a shot", () => {
  it("cuts it in two at the playhead, the second piece carrying on from the same frame", () => {
    const p = chain();
    const id = splitShot(p, resolveTimeline(p), "s1", 1.5);
    expect(id).toBe("s1-2");
    expect(spans(p)).toEqual(["s1 0-1.5 @2", "s1-2 1.5-4 @3.5", "s2 4-7 @0", "s3 7-12 @1"]);
    ok(p);
  });

  it("goes on a word when the playhead is on one, and hands over what started on its end", () => {
    const p = voiced();
    p.shots.push({ id: "t2", track: "txt", start: { kind: "shot", shot: "s2", edge: "end" }, duration: 1, content: { kind: "text", text: "after" }, fidelity: "final" });
    splitShot(p, resolveTimeline(p), "s2", 4);
    expect(p.shots.find((s) => s.id === "s2-2")!.start).toEqual({ kind: "word", line: "L1", word: "three" });
    expect(p.shots.find((s) => s.id === "t1")!.end).toEqual({ kind: "shot", shot: "s2-2", edge: "end" });
    expect(p.shots.find((s) => s.id === "t2")!.start).toEqual({ kind: "shot", shot: "s2-2", edge: "end" });
    expect(spans(p)).toEqual(["s1 0-2 @0", "s2 2-4 @5", "s2-2 4-6 @7", "s3 6-8 @0"]);
    expect(spans(p, "txt")[0]).toBe("t1 2-6");
    ok(p);
  });

  it("splits a move through the shot where it is at the cut, and won't split at its very edge", () => {
    const p = chain();
    const s1 = p.shots[0]!;
    if (s1.content.kind === "clip") s1.content.motion = { from: { scale: 1 }, to: { scale: 1.2 }, ease: "linear" };
    expect(splitShot(p, resolveTimeline(p), "s1", 0.01)).toBeUndefined();
    splitShot(p, resolveTimeline(p), "s1", 2);
    const [a, b] = p.shots.map((s) => (s.content.kind === "clip" ? s.content.motion : undefined));
    expect(a).toEqual({ from: { scale: 1 }, to: { scale: 1.1, x: 0, y: 0, rotate: 0 }, ease: "linear" });
    expect(b).toEqual({ from: { scale: 1.1, x: 0, y: 0, rotate: 0 }, to: { scale: 1.2 }, ease: "linear" });
  });
});

describe("taking shots out", () => {
  it("on the picture, the shot before holds on through the time it had", () => {
    const p = voiced();
    removeShots(p, resolveTimeline(p), ["s2"]);
    expect(spans(p)).toEqual(["s1 0-6 @0", "s3 6-8 @0"]);
    // The title that sat on it keeps its moment.
    expect(spans(p, "txt")).toEqual(["t1 2-6"]);
    expect(p.shots.find((s) => s.id === "t1")!.start).toEqual({ kind: "word", line: "L1", word: "two" });
    ok(p);
  });

  it("a note on it moves to the stretch of the cut it covered", () => {
    const p = voiced();
    p.notes.push({ id: "n1", text: "too dark", status: "queued", target: { kind: "shot", shot: "s2" }, author: "you", createdAt: "2026-11-01T00:00:00Z" });
    removeShots(p, resolveTimeline(p), ["s2"]);
    expect(p.notes[0]!.target).toEqual({ kind: "range", from: 2, to: 6 });
    ok(p);
  });

  it("in a chain, the next shot starts where it ended, leaving the shot before to hold on", () => {
    const p = chain();
    removeShots(p, resolveTimeline(p), ["s2"]);
    expect(spans(p)).toEqual(["s1 0-7 @2", "s3 7-12 @1"]);
    ok(p);
  });

  it("rippling closes the gap: a chain just carries on", () => {
    const p = chain();
    removeShots(p, resolveTimeline(p), ["s2"], { ripple: true });
    expect(spans(p)).toEqual(["s1 0-4 @2", "s3 4-9 @1"]);
    ok(p);
  });

  it("rippling moves what's placed by time, but not what's on a word", () => {
    const p = make({
      voice: { leadIn: 0, defaultGap: 0, tail: 0, lines: [{ id: "L1", text: "a b", duration: 12, words: words(["a", 0, 1], ["b", 9, 10]) }] },
      shots: [
        { id: "s1", track: "pic", start: { kind: "time", t: 0 }, content: clip("a"), fidelity: "rough" },
        { id: "s2", track: "pic", start: { kind: "time", t: 3 }, content: clip("b"), fidelity: "rough" },
        { id: "s3", track: "pic", start: { kind: "time", t: 5 }, content: clip("c"), fidelity: "rough" },
        { id: "t1", track: "txt", start: { kind: "time", t: 6 }, duration: 1, content: { kind: "text", text: "by time" }, fidelity: "final" },
        { id: "t2", track: "txt", start: { kind: "word", line: "L1", word: "b" }, duration: 1, content: { kind: "text", text: "on a word" }, fidelity: "final" },
      ],
    });
    removeShots(p, resolveTimeline(p), ["s2"], { ripple: true });
    expect(spans(p)).toEqual(["s1 0-3 @0", "s3 3-12 @0"]);
    expect(spans(p, "txt")).toEqual(["t1 4-5", "t2 9-10"]);
    ok(p);
  });

  it("on a text track, leaves the time empty", () => {
    const p = make({
      shots: [
        { id: "s1", track: "pic", duration: 10, content: clip("a"), fidelity: "rough" },
        { id: "t1", track: "txt", start: { kind: "time", t: 0 }, content: { kind: "text", text: "one" }, fidelity: "final" },
        { id: "t2", track: "txt", start: { kind: "time", t: 2 }, content: { kind: "text", text: "two" }, fidelity: "final" },
        { id: "t3", track: "txt", start: { kind: "time", t: 5 }, duration: 1, content: { kind: "text", text: "three" }, fidelity: "final" },
      ],
    });
    removeShots(p, resolveTimeline(p), ["t2"]);
    expect(spans(p, "txt")).toEqual(["t1 0-2", "t3 5-6"]);
    ok(p);
  });

  it("taking the last shot of a cut timed by its shots keeps the one before its length", () => {
    const p = make({
      shots: [
        { id: "s1", track: "pic", start: { kind: "time", t: 0 }, content: clip("a"), fidelity: "rough" },
        { id: "s2", track: "pic", start: { kind: "time", t: 3 }, duration: 2, content: clip("b"), fidelity: "rough" },
      ],
    });
    removeShots(p, resolveTimeline(p), ["s2"]);
    expect(spans(p)).toEqual(["s1 0-3 @0"]);
    ok(p);
  });

  it("a stretch comes out with the shots across its edges split there", () => {
    const p = chain();
    removeRange(p, resolveTimeline(p), "pic", 3, 8, { ripple: true });
    expect(spans(p)).toEqual(["s1 0-3 @2", "s3-2 3-7 @2"]);
    ok(p);
  });
});

describe("overwriting", () => {
  it("puts a clip in over the middle of a shot, the cuts either side staying put", () => {
    const p = chain();
    const id = overwrite(p, resolveTimeline(p), "pic", 1, 2, { content: clip("photo"), fidelity: "rough" });
    expect(spans(p)).toEqual(["s1 0-1 @2", `${id} 1-3 @0`, "s1-3 3-4 @5", "s2 4-7 @0", "s3 7-12 @1"]);
    ok(p);
  });

  it("over several shots, takes the whole stretch", () => {
    const p = voiced();
    const id = overwrite(p, resolveTimeline(p), "pic", 1, 6, { content: clip("photo"), fidelity: "rough" });
    expect(spans(p)).toEqual(["s1 0-1 @0", `${id} 1-7 @0`, "s3-2 7-8 @1"]);
    ok(p);
  });

  it("past the end of a track, simply goes on after", () => {
    const p = chain();
    const id = overwrite(p, resolveTimeline(p), "pic", 12, 2, { content: clip("photo"), fidelity: "rough" });
    expect(spans(p).at(-1)).toBe(`${id} 12-14 @0`);
    ok(p);
  });
});

describe("trimming and slipping", () => {
  it("moving a cut keeps the footage where it was, and the shot before follows", () => {
    const p = chain();
    const tl = resolveTimeline(p);
    expect(trimStart(p, tl, "s2", { kind: "time", t: 5 }, 5)).toBe(true);
    expect(spans(p)).toEqual(["s1 0-5 @2", "s2 5-7 @1", "s3 7-12 @1"]);
    ok(p);
  });

  it("won't move a cut past the start of the shot before", () => {
    const p = chain();
    expect(trimStart(p, resolveTimeline(p), "s2", { kind: "time", t: 0 }, 0)).toBe(false);
  });

  it("slips the footage under a shot, and stops at either end of the file", () => {
    const p = chain();
    expect(slipShot(p, resolveTimeline(p), "s2", 1.5)).toBe(1.5);
    expect(spans(p)[1]).toBe("s2 4-7 @1.5");
    expect(slipShot(p, resolveTimeline(p), "s2", -10)).toBe(-1.5);
    expect(slipShot(p, resolveTimeline(p), "s2", 100)).toBe(27);
    expect(spans(p)[1]).toBe("s2 4-7 @27");
  });

  it("a clip landed on a moment keeps landing, a little further along", () => {
    const p = chain();
    const s1 = p.shots[0]!;
    s1.content = clip("a", { sync: { moment: "jump", at: { kind: "time", t: 1 } } });
    expect(spans(p)[0]).toBe("s1 0-4 @11");
    slipShot(p, resolveTimeline(p), "s1", 2);
    expect(s1.content).toMatchObject({ sync: { moment: 14 } });
    expect(spans(p)[0]).toBe("s1 0-4 @13");
  });
});

describe("moving shots", () => {
  it("on a cut timed by words, the footage is reordered and the cuts stay on their words", () => {
    const p = voiced();
    moveShot(p, resolveTimeline(p), "s3", 0.5, { kind: "time", t: 0.5 });
    expect(spans(p)).toEqual(["s3 0-2 @0", "s1 2-6 @0", "s2 6-8 @5"]);
    expect(p.shots.find((s) => s.id === "s1")!.start).toEqual({ kind: "word", line: "L1", word: "two" });
    ok(p);
  });

  it("in a chain, shots move with their lengths", () => {
    const p = chain();
    moveShot(p, resolveTimeline(p), "s1", 8, { kind: "time", t: 8 });
    expect(spans(p)).toEqual(["s2 0-3 @0", "s3 3-8 @1", "s1 8-12 @2"]);
    ok(p);
  });

  it("a title moves freely, keeping its length, and its neighbours keep their times", () => {
    const p = make({
      shots: [
        { id: "s1", track: "pic", duration: 10, content: clip("a"), fidelity: "rough" },
        { id: "t1", track: "txt", start: { kind: "time", t: 0 }, content: { kind: "text", text: "one" }, fidelity: "final" },
        { id: "t2", track: "txt", start: { kind: "time", t: 2 }, duration: 2, content: { kind: "text", text: "two" }, fidelity: "final" },
        { id: "t3", track: "txt", content: { kind: "text", text: "three" }, duration: 1, fidelity: "final" },
      ],
    });
    const at: Anchor = { kind: "time", t: 7 };
    moveShot(p, resolveTimeline(p), "t2", 7, at);
    expect(spans(p, "txt")).toEqual(["t1 0-2", "t3 4-5", "t2 7-9"]);
    ok(p);
  });
});

describe("copy and paste", () => {
  it("pastes a copy over what's at the playhead, playing from where the original did", () => {
    const p = chain();
    const clipboard = copyShots(p, resolveTimeline(p), ["s1"])!;
    const [id] = pasteShots(p, resolveTimeline(p), clipboard, 8);
    expect(spans(p)).toEqual(["s1 0-4 @2", "s2 4-7 @0", "s3 7-8 @1", `${id} 8-12 @2`]);
    ok(p);
  });
});
