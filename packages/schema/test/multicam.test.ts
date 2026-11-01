import { describe, expect, it } from "vitest";
import { checkCut, cutToAngle, cutToSpeakers, cutWords, groupWords, Project, resolveTimeline, SCHEMA_VERSION, speakerAngles, speakerCuts, STAGE_IDS, switchAngle, type CutWord, type ProjectInput } from "../src/index.ts";

// Two cameras on an interview: A rolled first; B started 2 seconds later.
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
      { id: "camA", kind: "video", path: "a.mp4", duration: 60, angle: { group: "chat", offset: 0 }, transcript: { by: "whisper", at: "2026-11-01T00:00:00Z", words: 4 }, subjects: [{ id: "face1", label: "Ana", kind: "face", samples: [[0, 0.4, 0.3, 0.2, 0.3]] }] },
      { id: "camB", kind: "video", path: "b.mp4", duration: 50, angle: { group: "chat", offset: 2 } },
      { id: "other", kind: "video", path: "o.mp4", duration: 30 },
    ],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [{ id: "s1", track: "pic", duration: 20, content: { kind: "clip", asset: "camA", in: 10, reframe: { land: { x: 0.5, y: 0.5, zoom: 1.2, follow: "face1" } } }, fidelity: "rough" }],
    notes: [],
    ...over,
  });
const spans = (p: Project) => resolveTimeline(p).shots.map((r) => `${r.id} ${+r.start.toFixed(3)}-${+r.end.toFixed(3)} ${(p.shots.find((s) => s.id === r.id)!.content as { asset: string }).asset}@${+(r.sourceIn ?? 0).toFixed(3)}`);

describe("switching angles", () => {
  it("shows the other camera from the same moment, leaving a crop that followed someone in the old file", () => {
    const p = make();
    expect(switchAngle(p, resolveTimeline(p), "s1", "camB")).toBe(true);
    expect(spans(p)).toEqual(["s1 0-20 camB@8"]);
    expect(p.shots[0]!.content).toEqual({ kind: "clip", asset: "camB", in: 8 });
  });

  it("won't switch to a camera that wasn't rolling for all of the shot, or one from another event", () => {
    const p = make({ shots: [{ id: "s1", track: "pic", duration: 5, content: { kind: "clip", asset: "camA", in: 1 }, fidelity: "rough" }] });
    expect(switchAngle(p, resolveTimeline(p), "s1", "camB")).toBe(false);
    expect(switchAngle(p, resolveTimeline(p), "s1", "other")).toBe(false);
  });

  it("cuts to an angle at the playhead, splitting the shot there", () => {
    const p = make();
    expect(cutToAngle(p, resolveTimeline(p), 6, "camB")).toBe("s1-2");
    expect(spans(p)).toEqual(["s1 0-6 camA@10", "s1-2 6-20 camB@14"]);
    expect(checkCut(p)).toEqual([]);
  });
});

describe("cutting to whoever's talking", () => {
  const w = (word: string, s: number, e: number, speaker: string): CutWord => ({ w: word, s, e, speaker, shot: "s1", asset: "camA", i: 0 });
  const words = [w("So", 0.5, 0.8, "speaker_0"), w("tell", 1, 1.3, "speaker_0"), w("me.", 1.4, 1.8, "speaker_0"), w("Well,", 3, 3.4, "speaker_1"), w("yes.", 3.5, 3.9, "speaker_1"), w("Mm.", 4.2, 4.4, "speaker_0"), w("And", 4.6, 4.8, "speaker_1"), w("then…", 5, 9, "speaker_1"), w("Right.", 12, 12.5, "speaker_0")];
  const angleOf = (sp: string) => (sp === "speaker_0" ? "camA" : "camB");

  it("follows the speaker, holds through pauses, and doesn't cut away for a short interjection", () => {
    expect(speakerCuts(words, 0, 20, angleOf, { start: "camA" })).toEqual([
      { s: 0, e: 2.85, asset: "camA" },
      { s: 2.85, e: 11.85, asset: "camB" },
      { s: 11.85, e: 20, asset: "camA" },
    ]);
  });

  it("cuts the shots of the stretch that way", () => {
    const p = make();
    expect(cutToSpeakers(p, resolveTimeline(p), words, 0, 20, angleOf)).toBe(2);
    expect(spans(p)).toEqual(["s1 0-2.85 camA@10", "s1-2 2.85-11.85 camB@10.85", "s1-3 11.85-20 camA@21.85"]);
    expect(checkCut(p)).toEqual([]);
  });

  it("reads the words through one camera's transcript, whichever angle each shot shows", () => {
    const p = make();
    cutToAngle(p, resolveTimeline(p), 6, "camB");
    const said = [
      { w: "a", s: 11, e: 11.5, speaker: "speaker_0" },
      { w: "b", s: 17, e: 17.5, speaker: "speaker_1" },
    ];
    const got = groupWords(p, resolveTimeline(p), p.assets[0]!, said);
    expect(got.map((x) => `${x.w}@${+x.s.toFixed(3)} ${x.shot}`)).toEqual(["a@1 s1", "b@7 s1-2"]);
  });

  it("gives each speaker the camera that hears them loudest, against how loud it hears everyone", () => {
    const p = make();
    const angles = p.assets.filter((a) => a.angle);
    // camA is louder for everything (a hot microphone), but much louder for speaker 0.
    const loud = (asset: string, t0: number) => (asset === "camA" ? (t0 < 10 ? 200 : 120) : t0 + 2 < 10 ? 40 : 90);
    const said = [
      { s: 1, e: 2, speaker: "speaker_0" },
      { s: 12, e: 13, speaker: "speaker_1" },
    ];
    expect(speakerAngles(said, angles, loud)).toEqual({ speaker_0: "camA", speaker_1: "camB" });
  });
});

describe("hearing one camera through another", () => {
  it("gives a camera without a transcript the words another camera on the event heard, in its own time", () => {
    const p = make({ shots: [{ id: "s1", track: "pic", duration: 10, content: { kind: "clip", asset: "camB", in: 8 }, fidelity: "rough" }] });
    const said = { camA: [{ w: "hello", s: 11, e: 11.5, speaker: "speaker_0" }] } as Record<string, { w: string; s: number; e: number; speaker?: string }[]>;
    const got = cutWords(p, resolveTimeline(p), (id) => said[id]);
    // camB's 8 s is camA's 10 s: "hello" at camA's 11 s plays 1 s into the shot.
    expect(got).toEqual([{ w: "hello", s: 1, e: 1.5, shot: "s1", asset: "camA", i: 0, speaker: "speaker_0" }]);
  });
});
