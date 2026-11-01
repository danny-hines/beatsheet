import { describe, expect, it } from "vitest";
import {
  captionPhrases,
  checkCut,
  cutWords,
  fillerSpans,
  pauseSpans,
  Project,
  removeSpans,
  resolveTimeline,
  SCHEMA_VERSION,
  spanOf,
  STAGE_IDS,
  subtitles,
  type ProjectInput,
  type SaidWord,
} from "../src/index.ts";

const said = (...ws: [string, number, number, string?][]): SaidWord[] => ws.map(([w, s, e, speaker]) => ({ w, s, e, ...(speaker ? { speaker } : {}) }));

// Someone talking to camera, transcribed: "So, um, today we're making bread. ... (a long pause) ... First, flour."
const talk = said(["So,", 1, 1.3, "speaker_0"], ["um,", 1.6, 1.9, "speaker_0"], ["today", 2.2, 2.5, "speaker_0"], ["we're", 2.55, 2.8, "speaker_0"], ["making", 2.85, 3.2, "speaker_0"], ["bread.", 3.25, 3.7, "speaker_0"], ["First,", 6.2, 6.5, "speaker_0"], ["flour.", 6.6, 7.0, "speaker_0"]);
const words = (id: string) => (id === "talk" ? talk : undefined);

const make = (over: Partial<ProjectInput> = {}): Project =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "t",
    title: "test",
    recipe: "story",
    brief: { goal: "test" },
    formats: [{ id: "land", label: "16:9", width: 1920, height: 1080, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "transcript",
    assets: [
      { id: "talk", kind: "video", path: "talk.mp4", duration: 20, transcript: { by: "whisper", at: "2026-11-01T00:00:00Z", words: talk.length } },
      { id: "broll", kind: "video", path: "broll.mp4", duration: 20 },
    ],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [
      { id: "s1", track: "pic", duration: 8, content: { kind: "clip", asset: "talk", in: 0.5 }, fidelity: "rough" },
      { id: "s2", track: "pic", duration: 3, content: { kind: "clip", asset: "broll" }, fidelity: "rough" },
    ],
    notes: [],
    ...over,
  });

describe("the cut's words", () => {
  it("lays each clip's words out where they're heard in the cut", () => {
    const p = make();
    const w = cutWords(p, resolveTimeline(p), words);
    expect(w.map((x) => `${x.w}@${+x.s.toFixed(3)}`)).toEqual(["So,@0.5", "um,@1.1", "today@1.7", "we're@2.05", "making@2.35", "bread.@2.75", "First,@5.7", "flour.@6.1"]);
    expect(w[0]).toMatchObject({ shot: "s1", asset: "talk", i: 0, speaker: "speaker_0" });
  });

  it("leaves out what the shot doesn't play, and follows its speed", () => {
    const p = make({ shots: [{ id: "s1", track: "pic", duration: 2, content: { kind: "clip", asset: "talk", in: 2, speed: 2 }, fidelity: "rough" }] });
    const w = cutWords(p, resolveTimeline(p), words);
    expect(w.map((x) => `${x.w}@${+x.s.toFixed(3)}`)).toEqual(["today@0.1", "we're@0.275", "making@0.425", "bread.@0.625"]);
  });

  it("takes out a word with half of each pause around it, leaving a natural pause", () => {
    const p = make();
    const w = cutWords(p, resolveTimeline(p), words);
    expect(spanOf(w, 1, 1).map((x) => +x.toFixed(3))).toEqual([0.95, 1.55]);
    expect(fillerSpans(w).map((sp) => sp.map((x) => +x.toFixed(3)))).toEqual([[0.95, 1.55]]);
  });

  it("finds pauses longer than it should keep, and shortens each to what it keeps", () => {
    const p = make();
    const w = cutWords(p, resolveTimeline(p), words);
    expect(pauseSpans(w, { longest: 0.7, keep: 0.4 }).map((sp) => sp.map((x) => +x.toFixed(3)))).toEqual([[3.4, 5.5]]);
  });

  it("taking them out closes the gaps, and the shots after come up", () => {
    const p = make();
    const tl = resolveTimeline(p);
    const w = cutWords(p, tl, words);
    const removed = removeSpans(p, tl, [...fillerSpans(w), ...pauseSpans(w, { longest: 0.7, keep: 0.4 })]);
    expect(+removed.toFixed(3)).toBe(2.7);
    const after = resolveTimeline(p);
    expect(after.diagnostics).toEqual([]);
    expect(checkCut(p)).toEqual([]);
    expect(+after.duration.toFixed(3)).toBe(8.3);
    const again = cutWords(p, after, words);
    expect(again.map((x) => x.w)).toEqual(["So,", "today", "we're", "making", "bread.", "First,", "flour."]);
    // The pause after "bread." is the 0.4 kept.
    expect(+(again[5]!.s - again[4]!.e).toFixed(3)).toBe(0.4);
  });
});

describe("captions and subtitles", () => {
  it("cuts what's said into short phrases, breaking at punctuation and pauses", () => {
    const p = make();
    const tl = resolveTimeline(p);
    const phrases = captionPhrases(tl, cutWords(p, tl, words));
    expect(phrases.map((ph) => ph.words.map((x) => x.w).join(" "))).toEqual(["So,", "um,", "today we're making", "bread.", "First,", "flour."]);
    expect(phrases[0]!.speaker).toBe("speaker_0");
    // Each stays up until the next starts.
    expect(phrases[0]!.until).toBeLessThanOrEqual(phrases[1]!.from);
  });

  it("writes them as SubRip and WebVTT, a line at a time", () => {
    const p = make();
    const tl = resolveTimeline(p);
    const phrases = captionPhrases(tl, cutWords(p, tl, words));
    const srt = subtitles(phrases, "srt");
    expect(srt.split("\n\n")[0]).toBe("1\n00:00:00,460 --> 00:00:03,550\nSo, um, today we're making bread.");
    expect(srt).toContain("2\n00:00:05,660 --> 00:00:06,850\nFirst, flour.");
    expect(subtitles(phrases, "vtt").startsWith("WEBVTT\n\n00:00:00.460 --> 00:00:03.550\n")).toBe(true);
  });
});

describe("a word said across a cut", () => {
  it("is heard once, in the shot that plays its middle", () => {
    const p = make({
      shots: [
        { id: "s1", track: "pic", duration: 2.4, content: { kind: "clip", asset: "talk", in: 0.5 }, fidelity: "rough" },
        { id: "s2", track: "pic", duration: 5.6, content: { kind: "clip", asset: "talk", in: 2.9 }, fidelity: "rough" },
      ],
    });
    const w = cutWords(p, resolveTimeline(p), words);
    // "making" (2.85–3.2 in the clip) is cut at 2.9: its middle plays in s2.
    expect(w.filter((x) => x.w === "making").map((x) => x.shot)).toEqual(["s2"]);
    expect(w.map((x) => x.w)).toEqual(["So,", "um,", "today", "we're", "making", "bread.", "First,", "flour."]);
  });
});
