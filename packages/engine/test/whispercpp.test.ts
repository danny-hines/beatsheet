import { describe, expect, it } from "vitest";
import { readTurns, speakersPlan } from "../src/speakers.ts";
import { planFor, readWhisperJson, speedWords } from "../src/whispercpp.ts";

describe("Whisper on whatever computer it's on", () => {
  it("plans the build and model for each kind of machine", () => {
    const strip = (p: ReturnType<typeof planFor>) => ("why" in p ? p : { builds: p.builds.map((b) => b.id), brew: p.brew, where: p.where, model: p.model, mb: Math.round(p.bytes / 1e6) });
    // A PC with an NVIDIA card: the CUDA build, the processor build to fall back on, and the large model.
    expect(strip(planFor({ platform: "win32", arch: "x64", nvidia: "NVIDIA GeForce RTX 4090" }))).toEqual({ builds: ["windows-cuda", "windows-cpu"], brew: undefined, where: "NVIDIA GeForce RTX 4090", model: "best", mb: 1260 });
    // A laptop without one: the processor build and a smaller model, about 200 MB in all.
    expect(strip(planFor({ platform: "win32", arch: "x64" }))).toEqual({ builds: ["windows-cpu"], brew: undefined, where: "the processor", model: "good", mb: 200 });
    expect(strip(planFor({ platform: "win32", arch: "arm64" }))).toMatchObject({ builds: ["windows-arm"], model: "good" });
    // A Mac: Homebrew's build, which uses Metal on Apple silicon.
    expect(strip(planFor({ platform: "darwin", arch: "arm64" }))).toEqual({ builds: [], brew: true, where: "Apple silicon", model: "best", mb: 575 });
    expect(strip(planFor({ platform: "darwin", arch: "x64" }))).toMatchObject({ brew: true, where: "the processor", model: "good" });
    expect(strip(planFor({ platform: "linux", arch: "x64", nvidia: "RTX 3060" }))).toMatchObject({ builds: ["linux-x64"], where: "the processor", model: "good" });
    // The person's choice of model wins.
    expect(strip(planFor({ platform: "win32", arch: "x64" }, "fast"))).toMatchObject({ model: "fast", mb: 70 });
    expect(planFor({ platform: "freebsd", arch: "x64" })).toEqual({ why: "whisper.cpp has no build for freebsd x64" });
  });

  it("reads whisper.cpp's words, leaving out its marks for what isn't speech", () => {
    const json = JSON.stringify({
      result: { language: "en" },
      transcription: [
        { offsets: { from: 190, to: 290 }, text: "" },
        { offsets: { from: 200, to: 800 }, text: " Happy" },
        { offsets: { from: 800, to: 2750 }, text: " Birthday," },
        { offsets: { from: 3000, to: 5000 }, text: " [Music]" },
        { offsets: { from: 5000, to: 5400 }, text: " (laughs)" },
      ],
    });
    expect(readWhisperJson(json)).toEqual({ language: "en", words: [{ w: "Happy", s: 0.2, e: 0.8 }, { w: "Birthday,", s: 0.8, e: 2.75 }] });
  });

  it("has a speaker labeller for each system, about 60 MB with its models", () => {
    for (const m of [
      { platform: "win32" as const, arch: "x64" },
      { platform: "win32" as const, arch: "arm64" },
      { platform: "darwin" as const, arch: "arm64" },
      { platform: "darwin" as const, arch: "x64" },
      { platform: "linux" as const, arch: "x64" },
      { platform: "linux" as const, arch: "arm64" },
    ]) {
      const p = speakersPlan(m)!;
      expect(p.build.url).toContain("/v2.0.1/");
      expect(Math.round(p.bytes / 1e6)).toBeGreaterThan(50);
      expect(Math.round(p.bytes / 1e6)).toBeLessThan(65);
    }
    expect(speakersPlan({ platform: "freebsd", arch: "x64" })).toBeUndefined();
  });

  it("reads the labeller's turns", () => {
    const out = "Started\n0.031 -- 3.406 speaker_00\n4.807 -- 6.764 speaker_01\nElapsed seconds: 0.500 s\n";
    expect(readTurns(out)).toEqual([
      { s: 0.031, e: 3.406, speaker: "speaker_00" },
      { s: 4.807, e: 6.764, speaker: "speaker_01" },
    ]);
  });

  it("says how quick it is in words", () => {
    expect([speedWords(0.04), speedWords(0.4), speedWords(1), speedWords(2), speedWords(3.4)]).toEqual([
      "about 25 times faster than it plays",
      "about 3 times faster than it plays",
      "about as long as it plays",
      "about twice as long as it plays",
      "about 3.4 times as long as it plays",
    ]);
  });
});
