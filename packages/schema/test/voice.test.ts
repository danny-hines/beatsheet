import { describe, expect, it } from "vitest";
import { lineState, spokenText, voiceKey, voiceProvider } from "@beatsheet/schema";

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

  it("knows which provider a voice id is", () => {
    expect(voiceProvider("elevenlabs:21m00Tcm4TlvDq8ikWAM")).toBe("elevenlabs");
    expect(voiceProvider("kokoro:af_heart")).toBe("kokoro");
    expect(voiceProvider("mac:com.apple.voice.premium.en-US.Zoe")).toBe("mac");
    expect(voiceProvider("windows:Microsoft Zira Desktop")).toBe("windows");
    expect(voiceProvider("Danny (ElevenLabs eleven_v4)")).toBeUndefined();
  });
});
