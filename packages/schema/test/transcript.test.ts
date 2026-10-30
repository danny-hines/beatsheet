import { describe, expect, it } from "vitest";
import { chooseTranscriber, linesOf, type TranscriberState } from "@beatsheet/schema";

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
    expect(c.setup.find((x) => x.id === "whisper")).toMatchObject({ ok: false, kind: "speakers", why: "Can't tell who's speaking" });
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
