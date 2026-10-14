import { describe, expect, it } from "vitest";
import {
  anchorForTime,
  checkReferences,
  Project,
  resolveAnchor,
  resolveTimeline,
  SCHEMA_VERSION,
  snapPoints,
  STAGE_IDS,
  type ProjectInput,
} from "../src/index.ts";

const make = (over: Partial<ProjectInput> = {}): Project =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "t",
    title: "test",
    recipe: "test",
    brief: { goal: "test" },
    formats: [
      { id: "land", label: "16:9", width: 1920, height: 1080, fps: 30 },
      { id: "port", label: "9:16", width: 1080, height: 1920, fps: 30 },
    ],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "voice",
    assets: [],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [],
    notes: [],
    ...over,
  });

const words = (...ws: [string, number, number][]) => ws.map(([w, s, e]) => ({ w, s, e }));

// The first three lines of the Sparkade social cut, with its real durations and pauses.
const sparkadeVoice = {
  leadIn: 0.3,
  lines: [
    { id: "hookA", text: "Hook A", duration: 3.79, gapAfter: 0.35, words: words(["What", 0, 0.3]) },
    { id: "hookB", text: "Hook B", duration: 4.02, gapAfter: 0.55, words: words(["Ready", 0, 0.4], ["ready", 1, 1.4]) },
    { id: "title", text: "This is Sparkade.", duration: 1.59, gapAfter: 0.9, words: words(["This", 0, 0.2], ["is", 0.2, 0.4], ["Sparkade.", 0.4, 1.5]) },
    { id: "tag", text: "Tag", duration: 3.47, holdBefore: 81.52, words: words(["Make", 0, 0.3]) },
  ],
};
const musicA = {
  id: "musicA",
  kind: "music" as const,
  path: "audio/musicA.mp3",
  duration: 116.82,
  grid: { bpm: 120, downbeat: 1.1001, beatsPerBar: 4 },
  sections: [
    { id: "intro", label: "Intro", start: 0 },
    { id: "groove", label: "Groove", start: 7.1001 },
    { id: "chorus", label: "Chorus", start: 75.1101 },
    { id: "outro", label: "Last bar", start: 107.1101 },
  ],
};

describe("voice placement", () => {
  it("places lines in order with lead-in, pauses, holds and per-format overrides", () => {
    const p = make({
      voice: {
        leadIn: 0.5,
        defaultGap: 0.25,
        lines: [
          { id: "a", text: "a", duration: 2, words: [], gaps: { port: 1 } },
          { id: "b", text: "b", duration: 1, words: [], only: ["land"] },
          { id: "c", text: "c", duration: 1, words: [], holdBefore: 2 },
        ],
      },
    });
    const land = resolveTimeline(p, "land");
    expect(land.lines.map((l) => [l.id, l.start])).toEqual([["a", 0.5], ["b", 2.75], ["c", 6]]);
    const port = resolveTimeline(p, "port");
    expect(port.lines.map((l) => [l.id, l.start])).toEqual([["a", 0.5], ["c", 5.5]]);
    expect(land.duration).toBeCloseTo(7 + 1); // last line end + default tail
  });

  it("matches the Sparkade social cut's real line starts", () => {
    const tl = resolveTimeline(make({ voice: sparkadeVoice }), "land");
    expect(tl.lines.map((l) => +l.start.toFixed(2))).toEqual([0.3, 4.44, 9.01, 93.02]);
  });
});

describe("anchors and shots", () => {
  it("chains shots: start from anchors, end at the next shot, the last one at the end of the cut", () => {
    const p = make({
      voice: sparkadeVoice,
      shots: [
        { id: "s1", track: "pic", content: { kind: "placeholder", description: "" }, fidelity: "idea" },
        { id: "s2", track: "pic", start: { kind: "word", line: "hookB", word: "ready", nth: 1, offset: -0.1 }, content: { kind: "placeholder", description: "" }, fidelity: "idea" },
        { id: "s3", track: "pic", start: { kind: "line", line: "title", offset: -0.12 }, content: { kind: "placeholder", description: "" }, fidelity: "idea" },
      ],
    });
    const tl = resolveTimeline(p, "land");
    const s = Object.fromEntries(tl.shots.map((x) => [x.id, x]));
    expect(s.s1!.start).toBe(0);
    expect(s.s1!.end).toBeCloseTo(4.44 + 1 - 0.1);
    expect(s.s2!.end).toBeCloseTo(9.01 - 0.12);
    expect(s.s3!.end).toBeCloseTo(tl.duration);
    expect(tl.diagnostics).toEqual([]);
  });

  it("reports cycles instead of throwing", () => {
    const p = make({
      shots: [
        { id: "a", track: "pic", start: { kind: "shot", shot: "b" }, duration: 1, content: { kind: "placeholder", description: "" }, fidelity: "idea" },
        { id: "b", track: "pic", start: { kind: "shot", shot: "a" }, duration: 1, content: { kind: "placeholder", description: "" }, fidelity: "idea" },
      ],
    });
    const tl = resolveTimeline(p);
    expect(tl.shots.every((s) => Number.isNaN(s.start))).toBe(true);
    expect(tl.diagnostics.some((d) => d.message.includes("circular"))).toBe(true);
  });

  it("reports a missing word with the line it looked in", () => {
    const p = make({
      voice: sparkadeVoice,
      shots: [{ id: "a", track: "pic", start: { kind: "word", line: "title", word: "arcade" }, content: { kind: "placeholder", description: "" }, fidelity: "idea" }],
    });
    expect(resolveTimeline(p, "land").diagnostics[0]!.message).toBe('word "arcade" is not in line "title"');
  });
});

describe("music", () => {
  it("lands the drop on the title and splices to the last bar on the tagline (Sparkade 16:9)", () => {
    const p = make({
      voice: sparkadeVoice,
      assets: [musicA],
      music: {
        cues: [
          { id: "m1", asset: "musicA", sync: { track: 7.1001, at: { kind: "line", line: "title" } } },
          { id: "m2", asset: "musicA", from: 107.1101, to: 110.9, sync: { track: 107.1101, at: { kind: "line", line: "tag" } }, fadeOut: 1.6 },
        ],
      },
    });
    const tl = resolveTimeline(p, "land");
    const [m1, m2] = tl.cues;
    expect(m1!.start).toBeCloseTo(1.9099, 3);
    expect(m1!.trackFrom).toBe(0);
    expect(m1!.end).toBeCloseTo(93.02, 2);
    expect(m2!.start).toBeCloseTo(93.02, 2);
    expect(m2!.end).toBeCloseTo(96.81, 2);
    // The groove section starts exactly on the title line.
    expect(tl.sections.find((s) => s.id === "groove")!.start).toBeCloseTo(9.01, 2);
  });

  it("clamps a track that would start before the cut (Sparkade 9:16)", () => {
    const p = make({
      voice: sparkadeVoice,
      assets: [{ ...musicA, id: "musicB", grid: { bpm: 120, downbeat: 1.564, beatsPerBar: 4 }, duration: 116.6, sections: [] }],
      music: { cues: [{ id: "m1", asset: "musicB", sync: { track: 9.564, at: { kind: "line", line: "title" } } }] },
    });
    const [m1] = resolveTimeline(p, "land").cues;
    expect(m1!.start).toBe(0);
    expect(m1!.trackFrom).toBeCloseTo(0.554, 3);
  });

  it("counts bars from a section, interpolates half beats, and lets the music end on a bar", () => {
    const p = make({
      spine: "music",
      assets: [{ ...musicA, grid: { bpm: 120, downbeat: 0, beatsPerBar: 4 }, sections: [{ id: "intro", label: "Intro", start: 0 }, { id: "drop", label: "Drop", start: 16 }] }],
      music: { cues: [{ id: "m1", asset: "musicA", end: { kind: "beat", unit: "bar", n: 4, from: "drop" } }] },
      shots: [
        { id: "a", track: "pic", start: { kind: "beat", unit: "bar", n: 1, from: "drop" }, content: { kind: "placeholder", description: "" }, fidelity: "idea" },
        { id: "b", track: "pic", start: { kind: "beat", n: 6.5, from: "drop" }, content: { kind: "placeholder", description: "" }, fidelity: "idea" },
      ],
    });
    const tl = resolveTimeline(p);
    expect(tl.diagnostics).toEqual([]);
    expect(tl.duration).toBe(24); // 4 bars of 2 s after the drop at 16 s
    expect(tl.shots.map((s) => s.start)).toEqual([18, 19.25]);
    expect(tl.beats.at(-1)!.t).toBe(23.5);
  });

  it("keeps a downbeat that a rounded section start lands just after", () => {
    const p = make({
      spine: "music",
      assets: [{ ...musicA, grid: { bpm: 124, downbeat: 0.35, beatsPerBar: 4 }, sections: [{ id: "build", label: "Build", start: 15.8339 }] }],
      music: { cues: [{ id: "m1", asset: "musicA", from: 15.8339 }] },
      shots: [{ id: "a", track: "pic", start: { kind: "beat", unit: "bar", n: 1, from: "build" }, content: { kind: "placeholder", description: "" }, fidelity: "idea" }],
    });
    const tl = resolveTimeline(p);
    expect(tl.beats[0]).toEqual({ t: 0, bar: true });
    expect(tl.shots[0]!.start).toBeCloseTo(240 / 124, 3);
  });
});

describe("clips and moments", () => {
  it("slides a clip so its moment lands on a beat, and a moment anchor finds it again", () => {
    const p = make({
      spine: "music",
      assets: [
        { ...musicA, grid: { bpm: 120, downbeat: 0, beatsPerBar: 4 }, sections: [{ id: "drop", label: "Drop", start: 8 }] },
        { id: "cliff", kind: "video", path: "cliff.mp4", duration: 20, moments: [{ id: "jump", t: 12.4, label: "Jump" }] },
      ],
      music: { cues: [{ id: "m1", asset: "musicA" }] },
      shots: [
        { id: "a", track: "pic", start: { kind: "time", t: 6 }, duration: 4, content: { kind: "clip", asset: "cliff", sync: { moment: "jump", at: { kind: "section", section: "drop" } } }, fidelity: "rough" },
        { id: "b", track: "pic", start: { kind: "moment", shot: "a", moment: "jump", offset: 0.5 }, duration: 1, content: { kind: "placeholder", description: "" }, fidelity: "idea" },
      ],
    });
    const tl = resolveTimeline(p);
    const a = tl.shots.find((s) => s.id === "a")!;
    expect(a.sourceIn).toBeCloseTo(10.4); // 12.4 plays 2 s after the shot starts, at the drop
    expect(tl.shots.find((s) => s.id === "b")!.start).toBeCloseTo(8.5);
  });
});

describe("snapping", () => {
  const p = make({
    voice: sparkadeVoice,
    assets: [musicA],
    music: { cues: [{ id: "m1", asset: "musicA", sync: { track: 7.1001, at: { kind: "line", line: "title" } } }] },
    shots: [{ id: "s1", track: "pic", content: { kind: "placeholder", description: "" }, fidelity: "idea" }],
  });
  const tl = resolveTimeline(p, "land");
  const points = snapPoints(tl);

  it("every snap point's anchor resolves back to the same time", () => {
    const sample = points.filter((_, i) => i % 7 === 0);
    for (const pt of sample) expect(resolveAnchor(p, pt.anchor, "land")).toBeCloseTo(pt.t, 6);
  });

  it("snaps when close, otherwise keeps an offset from the nearest structural point", () => {
    const groove = tl.sections.find((s) => s.id === "groove")!.start;
    expect(anchorForTime(groove + 0.02, points, 0.05).snapped).toBe(true);
    const loose = anchorForTime(5.3, points, 0.01);
    expect(loose.snapped).toBe(false);
    expect(resolveAnchor(p, loose.anchor, "land")).toBeCloseTo(5.3, 3);
  });
});

describe("references", () => {
  it("catches ids that point nowhere", () => {
    const p = make({
      shots: [{ id: "a", track: "nope", start: { kind: "line", line: "ghost" }, content: { kind: "clip", asset: "missing" }, fidelity: "idea" }],
      notes: [{ id: "n1", text: "x", status: "open", target: { kind: "shot", shot: "zzz" }, author: "you", createdAt: "2026-10-13" }],
    });
    expect(checkReferences(p).map((i) => i.message)).toEqual([
      'unknown track "nope"',
      'unknown line "ghost"',
      'unknown asset "missing"',
      'unknown shot "zzz"',
    ]);
  });
});
