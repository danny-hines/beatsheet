import { describe, expect, it } from "vitest";
import { estimateWords, wordsFromAlignment } from "../src/voices.ts";

describe("word timings", () => {
  it("turns ElevenLabs' character times into written words, punctuation kept but not timed", () => {
    const text = "Hi, you there.";
    const chars = [...text];
    const start = chars.map((_, i) => i * 0.1);
    const end = chars.map((_, i) => i * 0.1 + 0.1);
    // The full stop holds for a long pause, which shouldn't stretch "there."
    end[end.length - 1] = 2;
    expect(wordsFromAlignment({ characters: chars, character_start_times_seconds: start, character_end_times_seconds: end })).toEqual([
      { w: "Hi,", s: 0, e: 0.2 },
      { w: "you", s: expect.closeTo(0.4, 5), e: expect.closeTo(0.7, 5) },
      { w: "there.", s: expect.closeTo(0.8, 5), e: expect.closeTo(1.3, 5) },
    ]);
  });

  it("guesses fairly without timings: in order, inside the line, longer words longer", () => {
    const words = estimateWords("A wonderful day, friends.", 3);
    expect(words.map((w) => w.w)).toEqual(["A", "wonderful", "day,", "friends."]);
    words.forEach((w, i) => {
      expect(w.e).toBeGreaterThan(w.s);
      if (i) expect(w.s).toBeGreaterThanOrEqual(words[i - 1]!.e);
    });
    expect(words.at(-1)!.e).toBeLessThanOrEqual(3);
    expect(words[1]!.e - words[1]!.s).toBeGreaterThan(words[0]!.e - words[0]!.s);
  });
});
