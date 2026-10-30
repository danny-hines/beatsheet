import { describe, expect, it } from "vitest";
import { assignSpeakers, chooseTranscriber, linesOf, remapSpeakers, speakerLabel, voicesFromTurns, voiceSample, whoSpeaks, type TranscriberState } from "@beatsheet/schema";

const keys: Record<string, TranscriberState> = {
  scribe: { state: "ready" },
  "openai-whisper": { state: "ready" },
};

describe("choosing a transcriber for the machine it's on", () => {
  it("uses Whisper here when this machine is quick at it, with how long it'd take and no charge", () => {
    const pc = { ...keys, whisper: { state: "ready" as const, speed: 0.04, where: "on the NVIDIA card" } };
    const c = chooseTranscriber(pc, { seconds: 3600 });
    expect(c.auto).toEqual({ id: "whisper", label: "Whisper", ok: true, where: "on the NVIDIA card", seconds: 144 });
    expect(c.ready.map((x) => [x.id, x.usd])).toEqual([
      ["whisper", undefined],
      ["scribe", 0.22],
      ["openai-whisper", 0.36],
    ]);
  });

  it("puts a service first on a machine that's slow at it, and Whisper here last", () => {
    const laptop = { ...keys, whisper: { state: "ready" as const, speed: 1.6, where: "on the processor" } };
    expect(chooseTranscriber(laptop, { seconds: 600 }).ready.map((x) => x.id)).toEqual(["scribe", "openai-whisper", "whisper"]);
    // With no key, slow is still better than nothing.
    expect(chooseTranscriber({ whisper: laptop.whisper }, {}).auto?.id).toBe("whisper");
  });

  it("follows the person's own order, and leaves out what can't tell speakers apart when that's wanted", () => {
    const pc = { ...keys, whisper: { state: "ready" as const, speed: 0.04 } };
    expect(chooseTranscriber(pc, {}, ["openai-whisper"]).auto?.id).toBe("openai-whisper");
    const c = chooseTranscriber(pc, { speakers: true });
    expect(c.ready.map((x) => x.id)).toEqual(["scribe"]);
    expect(c.setup.find((x) => x.id === "whisper")).toMatchObject({ ok: false, kind: "speakers", why: "Needs Who's speaking installed with it (Settings → Transcription)" });
    expect(c.setup.find((x) => x.id === "openai-whisper")).toMatchObject({ ok: false, kind: "speakers", why: "Can't tell who's speaking" });
  });

  it("says what each one that can't be used needs", () => {
    const c = chooseTranscriber({ whisper: { state: "install", detail: "Install it in Settings: 590 MB" }, scribe: { state: "key", detail: "Needs an ElevenLabs key" } }, {});
    expect(c.auto).toBeUndefined();
    expect(c.setup.map((x) => [x.id, x.kind, x.why])).toEqual([
      ["whisper", "install", "Install it in Settings: 590 MB"],
      ["scribe", "key", "Needs an ElevenLabs key"],
      ["openai-whisper", "unfit", "Not available here"],
    ]);
  });
});

describe("who said each word", () => {
  it("is the turn a word falls in most, then the nearest close by, named in the order people first speak", () => {
    const words = [
      { w: "Happy", s: 0.2, e: 0.8 },
      { w: "birthday,", s: 0.8, e: 1.4 },
      { w: "Okay", s: 4.9, e: 5.2 },
      { w: "everyone.", s: 6.6, e: 7.0 },
      { w: "Cake?", s: 13.0, e: 13.4 },
      { w: "Hm.", s: 20, e: 20.2, speaker: "speaker_9" },
    ];
    const turns = [
      { s: 0.1, e: 2.0, speaker: "speaker_03" },
      { s: 4.8, e: 6.76, speaker: "speaker_01" },
      { s: 13.5, e: 15.4, speaker: "speaker_03" },
    ];
    expect(assignSpeakers(words, turns).map((w) => [w.w, w.speaker])).toEqual([
      ["Happy", "speaker_0"],
      ["birthday,", "speaker_0"],
      ["Okay", "speaker_1"],
      // Just after the turn ends: still theirs.
      ["everyone.", "speaker_1"],
      ["Cake?", "speaker_0"],
      // Nowhere near anyone's turn: nobody's (and not what it said before).
      ["Hm.", undefined],
    ]);
  });

  it("lets Whisper here answer for speakers once it can label them", () => {
    const states = { whisper: { state: "ready" as const, speed: 0.01, speakers: true }, scribe: { state: "ready" as const } };
    expect(chooseTranscriber(states, { speakers: true }).auto?.id).toBe("whisper");
    expect(chooseTranscriber({ ...states, whisper: { state: "ready", speed: 0.01 } }, { speakers: true }).setup.find((c) => c.id === "whisper")?.why).toBe(
      "Needs Who's speaking installed with it (Settings → Transcription)",
    );
  });
});

describe("knowing who's who across clips", () => {
  // Lily's sample (0–5s), Grandpa's (6.5–11s), then the clip from 12.5s: its speaker_0 sounds like Grandpa, speaker_1 like nobody known.
  const samples = [
    { who: "lily", s: 0, e: 5 },
    { who: "grandpa", s: 6.5, e: 11 },
  ];
  const words = [
    { w: "Pass", s: 0.5, e: 0.9, speaker: "speaker_0" },
    { w: "the", s: 0.9, e: 1.0, speaker: "speaker_0" },
    { w: "salt.", s: 1.0, e: 1.5, speaker: "speaker_0" },
    { w: "Sure!", s: 3.0, e: 3.6, speaker: "speaker_1" },
  ];

  it("names a clip's speaker after the one known voice their group holds", () => {
    const turns = [
      { s: 0.1, e: 4.9, speaker: "speaker_02" },
      { s: 6.6, e: 10.9, speaker: "speaker_00" },
      { s: 12.9, e: 14.1, speaker: "speaker_00" },
      { s: 15.4, e: 16.2, speaker: "speaker_01" },
    ];
    expect(voicesFromTurns(turns, samples, words, 12.5)).toEqual({ speaker_0: "grandpa" });
  });

  it("decides nothing when two people's samples land in one group, or a sample is split", () => {
    const merged = [
      { s: 0.1, e: 10.9, speaker: "speaker_00" },
      { s: 12.9, e: 14.1, speaker: "speaker_00" },
    ];
    expect(voicesFromTurns(merged, samples, words, 12.5)).toEqual({});
    const split = [
      { s: 0.1, e: 2.5, speaker: "speaker_00" },
      { s: 2.5, e: 4.9, speaker: "speaker_01" },
      { s: 12.9, e: 14.1, speaker: "speaker_00" },
    ];
    expect(voicesFromTurns(split, [samples[0]!], words, 12.5)).toEqual({});
  });

  it("samples someone's longest lines, up to a few seconds in all", () => {
    const t = {
      words: [
        { w: "Hi.", s: 0, e: 0.3, speaker: "speaker_0" },
        { w: "A", s: 2, e: 2.5, speaker: "speaker_0" },
        { w: "long", s: 2.5, e: 3.5, speaker: "speaker_0" },
        { w: "story.", s: 3.5, e: 6, speaker: "speaker_0" },
        { w: "Yes.", s: 7, e: 8, speaker: "speaker_1" },
        { w: "And", s: 10, e: 10.5, speaker: "speaker_0" },
        { w: "then.", s: 10.5, e: 11.5, speaker: "speaker_0" },
      ],
    };
    expect(voiceSample(t, "speaker_0", 5)).toEqual([
      { s: 2, e: 6 },
      { s: 10, e: 11 },
    ]);
  });

  it("carries names over when a clip is transcribed again with new labels, and says who a speaker is", () => {
    const before = [
      { w: "Hi", s: 0, e: 1, speaker: "speaker_0" },
      { w: "there", s: 2, e: 3, speaker: "speaker_1" },
    ];
    const after = [
      { w: "Hi", s: 0.1, e: 1, speaker: "speaker_1" },
      { w: "there", s: 2, e: 3.1, speaker: "speaker_0" },
    ];
    expect(remapSpeakers(before, after)).toEqual({ speaker_0: "speaker_1", speaker_1: "speaker_0" });
    const cast = [{ id: "grandpa", heard: [{ asset: "tape", speaker: "speaker_1" }] }];
    expect(whoSpeaks(cast, "tape", "speaker_1")?.id).toBe("grandpa");
    expect(whoSpeaks(cast, "tape", "speaker_0")).toBeUndefined();
    expect([speakerLabel("speaker_0"), speakerLabel("speaker_11"), speakerLabel("Mom")]).toEqual(["Speaker 1", "Speaker 12", "Mom"]);
  });
});

describe("a transcript's lines", () => {
  it("breaks at a pause, a new speaker, and the end of a long sentence", () => {
    const words = [
      { w: "Happy", s: 0.2, e: 0.8, speaker: "a" },
      { w: "birthday,", s: 0.8, e: 1.4, speaker: "a" },
      { w: "Lily.", s: 1.4, e: 1.9, speaker: "a" },
      { w: "Thank", s: 2.0, e: 2.2, speaker: "b" },
      { w: "you!", s: 2.2, e: 2.5, speaker: "b" },
      { w: "Sing", s: 5.0, e: 5.3, speaker: "b" },
    ];
    expect(linesOf({ words })).toEqual([
      { s: 0.2, e: 1.9, text: "Happy birthday, Lily.", speaker: "a" },
      { s: 2.0, e: 2.5, text: "Thank you!", speaker: "b" },
      { s: 5.0, e: 5.3, text: "Sing", speaker: "b" },
    ]);
  });
});
