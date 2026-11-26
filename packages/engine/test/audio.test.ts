import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseFixer, SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

const root = mkdtempSync(join(tmpdir(), "beatsheet-audio-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

let audio: typeof import("../src/audio.ts");
let demucs: typeof import("../src/demucs.ts");
let clean: typeof import("../src/clean.ts");
let store: typeof import("../src/store.ts");

function probeDuration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(out.trim());
}

/** Synthesizes a short test clip (video + 440 Hz tone audio). */
function makeClip(file: string, freq = 440, seconds = 2) {
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=#334455:s=160x90:r=15:d=${seconds}`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${freq}:sample_rate=48000:duration=${seconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    file,
  ]);
}

beforeAll(async () => {
  audio = await import("../src/audio.ts");
  demucs = await import("../src/demucs.ts");
  clean = await import("../src/clean.ts");
  store = await import("../src/store.ts");

  const dir = join(process.env.BEATSHEET_PROJECTS!, "sound-demo");
  mkdirSync(join(dir, "footage"), { recursive: true });
  makeClip(join(dir, "footage", "clip.mp4"), 440, 2);

  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "sound-demo",
    title: "Sound demo",
    sources: [{ id: "src", path: "footage" }],
    brief: { goal: "Test stems and pitch shifting" },
    assets: [{ id: "a1", kind: "video", source: "src", path: "clip.mp4", label: "Interview clip", duration: 2, width: 160, height: 90, fps: 15 }],
    cuts: [
      {
        id: "main",
        name: "Main",
        recipe: "story",
        spec: {},
        formats: [{ id: "wide", label: "16:9", width: 1280, height: 720, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("Rubber Band pitch shifting & pitch-preserving time stretch", () => {
  it("builds valid chained ffmpeg atempo filters for extreme speeds", () => {
    expect(audio.atempoChain(4)).toBe("atempo=2,atempo=2");
    expect(audio.atempoChain(0.25)).toBe("atempo=0.5,atempo=0.5");
    expect(audio.atempoChain(1.5)).toBe("atempo=1.5");
  });

  it("pitch-shifts and time-stretches WAVs with Rubber Band (or ffmpeg fallback) keeping exact target duration", async () => {
    const work = join(root, "wav-test");
    mkdirSync(work, { recursive: true });
    const src = join(work, "tone.wav");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", "-ac", "2", "-c:a", "pcm_s16le", src]);

    // Pitch shift +4 semitones should preserve the 2.0s duration.
    const pitched = join(work, "pitched.wav");
    const r1 = await audio.processAudio(src, pitched, { semitones: 4, formantPreserve: true });
    expect(["rubberband", "ffmpeg"]).toContain(r1.engine);
    expect(probeDuration(pitched)).toBeCloseTo(2.0, 1);

    // Speed 1.5x should produce ~1.33s duration.
    const fast = join(work, "fast.wav");
    await audio.processAudio(src, fast, { speed: 1.5 });
    expect(probeDuration(fast)).toBeCloseTo(2.0 / 1.5, 1);

    // Explicit ffmpeg fallback path should also preserve duration accurately.
    const ffPitched = join(work, "ff-pitched.wav");
    const r2 = await audio.processAudio(src, ffPitched, { semitones: -3, forceFfmpeg: true });
    expect(r2.engine).toBe("ffmpeg");
    expect(probeDuration(ffPitched)).toBeCloseTo(2.0, 1);
  });
});

describe("Demucs stem separation & vocal-only pitch shifting", () => {
  const mockDemucs: import("../src/demucs.ts").DemucsRunner = async (inWav, outDir, mode) => {
    mkdirSync(outDir, { recursive: true });
    const tracks = demucs.STEMS_FOR[mode];
    const out: Record<string, string> = {};
    for (const name of tracks) {
      const f = join(outDir, `${name}.wav`);
      copyFileSync(inWav, f);
      out[name] = f;
    }
    return out;
  };

  it("includes Demucs in the fixer catalog under stems", () => {
    const pick = chooseFixer("stems", { demucs: { state: "ready", speed: 0.2, where: "on Apple silicon" } }, { seconds: 60 });
    expect(pick.auto?.id).toBe("demucs");
    expect(pick.auto?.seconds).toBe(12);
  });

  it("separates stems, caches them, optionally registers audio assets, and supports vocal-only pitch shift + reset", async () => {
    const sep = await demucs.separateStems("sound-demo", "a1", { mode: "two-stem", addAssets: true, runner: mockDemucs });
    expect(sep.reused).toBe(false);
    expect(sep.asset.stems?.tracks).toEqual(["vocals", "no_vocals"]);
    expect(sep.added).toHaveLength(2);
    expect(existsSync(sep.stems.vocals!)).toBe(true);
    expect(existsSync(sep.stems.no_vocals!)).toBe(true);

    // Second call reuses cached stems without calling runner.
    const again = await demucs.separateStems("sound-demo", "a1", { mode: "two-stem" });
    expect(again.reused).toBe(true);

    // Shift vocals only (-3 semitones) while keeping music untouched.
    const shifted = await audio.shiftAudio("sound-demo", "a1", { semitones: -3, keepMusic: true });
    expect(shifted.keepMusic).toBe(true);
    expect(existsSync(shifted.file)).toBe(true);
    const loaded = store.loadProject("sound-demo");
    const a1 = loaded.project.assets.find((x) => x.id === "a1")!;
    expect(a1.pitch?.semitones).toBe(-3);
    expect(a1.pitch?.keepMusic).toBe(true);
    // soundFile now points directly at the pitch-shifted audio!
    expect(clean.soundFile(loaded.project, loaded.dir, a1)).toBe(shifted.file);

    // Resetting pitch restores original soundFile.
    audio.unpitchAudio("sound-demo", "a1");
    const reset = store.loadProject("sound-demo");
    const a1Reset = reset.project.assets.find((x) => x.id === "a1")!;
    expect(a1Reset.pitch).toBeUndefined();
    expect(clean.soundFile(reset.project, reset.dir, a1Reset)).toContain("clip.mp4");
  });
});
