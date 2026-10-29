import { describe, expect, it } from "vitest";
import { lineState, lineVoice, spokenText, voiceKey, voiceProvider } from "@beatsheet/schema";

describe("voiced lines", () => {
  const line = { text: "It wants your face.", tts: undefined as string | undefined };
  const voice = "mac:com.apple.voice.compact.en-US.Samantha";

  it("fingerprints the voice and the words it reads", () => {
    expect(voiceKey(voice, line)).toMatch(/^[0-9a-f]{8}$/);
    expect(voiceKey(voice, line)).toBe(voiceKey(voice, { ...line }));
    expect(voiceKey(voice, line)).not.toBe(voiceKey("kokoro:af_heart", line));
    // What's read is the spoken form when there is one.
    expect(spokenText({ text: "2026", tts: "twenty twenty-six" })).toBe("twenty twenty-six");
    expect(voiceKey(voice, { text: "2026", tts: "twenty twenty-six" })).not.toBe(voiceKey(voice, { text: "2026" }));
  });

  it("tells voiced lines from changed and silent ones", () => {
    const file = `/p/vo/main/hook-${voiceKey(voice, line)}.wav`;
    expect(lineState(voice, { ...line, file })).toBe("voiced");
    expect(lineState(voice, { text: "It wants your smile.", file })).toBe("changed");
    expect(lineState("kokoro:af_heart", { ...line, file })).toBe("changed");
    expect(lineState(voice, line)).toBe("silent");
    // Audio made elsewhere carries no fingerprint and counts as voiced.
    expect(lineState(voice, { ...line, file: "vo/hookA.wav" })).toBe("voiced");
  });

  it("reads a character's line in its voice, and the rest in the cut's", () => {
    const cast = [
      { id: "cat", voice: "kokoro:bm_lewis" },
      { id: "dog" },
    ];
    expect(lineVoice(voice, { speaker: "cat" }, cast)).toBe("kokoro:bm_lewis");
    expect(lineVoice(voice, { speaker: "dog" }, cast)).toBe(voice);
    expect(lineVoice(voice, { speaker: "ghost" }, cast)).toBe(voice);
    expect(lineVoice(voice, {}, cast)).toBe(voice);
    // A voice change for the cat leaves the narrator's lines voiced.
    const said = { ...line, speaker: "cat", file: `/p/vo/main/a-${voiceKey("kokoro:bm_lewis", line)}.wav` };
    expect(lineState(lineVoice(voice, said, cast), said)).toBe("voiced");
    expect(lineState(lineVoice(voice, said, [{ id: "cat", voice: "kokoro:am_puck" }]), said)).toBe("changed");
  });

  it("knows which provider a voice id is", () => {
    expect(voiceProvider("elevenlabs:21m00Tcm4TlvDq8ikWAM")).toBe("elevenlabs");
    expect(voiceProvider("kokoro:af_heart")).toBe("kokoro");
    expect(voiceProvider("mac:com.apple.voice.premium.en-US.Zoe")).toBe("mac");
    expect(voiceProvider("windows:Microsoft Zira Desktop")).toBe("windows");
    expect(voiceProvider("Danny (ElevenLabs eleven_v4)")).toBeUndefined();
  });
});
