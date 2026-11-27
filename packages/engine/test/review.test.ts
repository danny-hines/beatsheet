import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { adjacentGeneratedPairs, cutView, parseFile, resolveTimeline, SCHEMA_V1, STAGE_IDS, type Project, type Shot } from "@beatsheet/schema";
import { analyzeReviewVideo, buildContinuitySheet, designChecks, isStillBlank, projectChecks, reviewPaths, reviewRange } from "../src/review.ts";
import { trimLineSilence } from "../src/narrate.ts";

const project = (shots: Shot[], look?: Project["look"]): Project => {
  const r = parseFile({
    schema: SCHEMA_V1,
    id: "demo",
    title: "Demo",
    recipe: "story",
    brief: { goal: "launch" },
    formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "voice",
    assets: [],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [],
    notes: [],
  });
  if (!r.ok) throw new Error("bad fixture");
  return { ...cutView(r.file, "main"), shots, look };
};
const kit = (id: string, component: string, transition?: string): Shot => ({
  id,
  track: "pic",
  fidelity: "rough",
  content: { kind: "coded", component },
  ...(transition ? { transition: { kind: transition } } : {}),
});
const brand = { colors: { paper: "#fff", ink: "#000", accent: "#f60" } };

describe("the design pass's notes on a cut", () => {
  it("asks for the brand's look, scenes of its own, variety and restraint", () => {
    const notes = designChecks(project([kit("a", "kit:Title", "slam"), kit("b", "kit:Title", "glitch"), kit("c", "kit:Title", "flash"), kit("d", "kit:Stat")]));
    expect(notes.join("\n")).toMatch(/no \/look/);
    expect(notes.join("\n")).toMatch(/All 4 designed shots are stock kit scenes/);
    expect(notes.join("\n")).toMatch(/kit:Title is used 3 times \(a, b, c\)/);
    expect(notes.join("\n")).toMatch(/3 shots come in with a slam, glitch, flash or whip/);
  });

  it("asks for a look when there are titles but no designed shots", () => {
    const title: Shot = { id: "t", track: "pic", fidelity: "rough", content: { kind: "text", text: "Seabrook" } };
    expect(designChecks(project([title])).join("\n")).toMatch(/from the footage and the occasion/);
    expect(designChecks(project([title], brand))).toEqual([]);
  });

  it("is quiet about a branded cut whose hero moments are its own", () => {
    expect(designChecks(project([kit("a", "scenes/Hook.tsx#Hook"), kit("b", "kit:Stat"), kit("c", "scenes/End.tsx#End", "slam")], brand))).toEqual([]);
    expect(designChecks(project([]))).toEqual([]);
  });
});

describe("where review_cut keeps its preview video and sheets", () => {
  it("keeps them under .cache/review named by cut and format, sanitizing odd ids", () => {
    const p = reviewPaths("/ws/projects/demo", "teaser", "vertical");
    expect(p.video).toBe("/ws/projects/demo/.cache/review/teaser-vertical.mp4");
    expect(p.sheet).toBe("/ws/projects/demo/.cache/review/teaser-vertical-sheet.jpg");
    expect(p.designs).toBe("/ws/projects/demo/.cache/review/teaser-vertical-designs.jpg");
    expect(p.continuity).toBe("/ws/projects/demo/.cache/review/teaser-vertical-continuity.jpg");
    expect(reviewPaths("/ws/projects/demo", "../bad cut", "9:16").video).toBe("/ws/projects/demo/.cache/review/-bad-cut-9-16.mp4");
    expect(reviewPaths("/ws/projects/demo", "main", "wide", { from: 60, to: 74.8 }).video).toBe("/ws/projects/demo/.cache/review/main-wide-60s-74_8s.mp4");
  });
});

describe("reviewRange", () => {
  const timed = () =>
    resolveTimeline(
      project([
        { id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 5, content: { kind: "text", text: "One" } },
        { id: "s2", track: "pic", fidelity: "rough", start: { kind: "time", t: 5 }, duration: 8, content: { kind: "text", text: "Two" } },
        { id: "s3", track: "pic", fidelity: "rough", start: { kind: "time", t: 13 }, duration: 7, content: { kind: "text", text: "Three" } },
      ]),
    );

  it("defaults to the full cut and resolves explicit times or shot lists", () => {
    const tl = timed();
    expect(reviewRange(tl)).toEqual({ from: 0, to: 20, ranged: false });
    expect(reviewRange(tl, { from: 12, to: 25 })).toEqual({ from: 12, to: 20, ranged: true });
    expect(reviewRange(tl, { shots: ["s2", "s3"] })).toEqual({ from: 5, to: 20, ranged: true });
    expect(reviewRange(tl, { shots: ["s1", "s3"] })).toEqual({ from: 0, to: 20, ranged: false });
  });

  it("refuses unknown shots or an empty range", () => {
    const tl = timed();
    expect(() => reviewRange(tl, { shots: ["nope"] })).toThrow(/nope/);
    expect(() => reviewRange(tl, { from: 15, to: 10 })).toThrow(/Nothing to review/);
    expect(() => reviewRange(tl, { from: 25 })).toThrow(/Nothing to review/);
  });
});

describe("programmatic video, still and voiceover verification", () => {
  it("flags maxLength violations and timeline diagnostics as FAIL in projectChecks", () => {
    const p = project([
      { id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 12, content: { kind: "text", text: "Long" } },
    ]);
    p.spec.maxLength = 10;
    const tl = resolveTimeline(p);
    const { checks } = projectChecks(p, tl, "vertical", 1080, 1920);
    expect(checks.find((c) => c.id === "max-length")?.status).toBe("FAIL");
    expect(checks.find((c) => c.id === "timeline-diagnostics")?.status).toBe("PASS");
  });

  it("detects blank black stretches and solid-black stills while passing healthy motion clips", async () => {
    const dir = mkdtempSync(join(tmpdir(), "beatsheet-review-vid-"));
    try {
      const blankVid = join(dir, "blank.mp4");
      // 1s color + 1s pure black in the middle + 1s color, with a steady sine tone.
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=160x90:rate=15:duration=1",
          "-f",
          "lavfi",
          "-i",
          "color=c=black:s=160x90:r=15:d=1",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=160x90:rate=15:duration=1",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=3",
          "-filter_complex",
          "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
          "-map",
          "[v]",
          "-map",
          "3:a",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          blankVid,
        ],
      );
      const p = project([{ id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 3, content: { kind: "text", text: "Test" } }]);
      const tl = resolveTimeline(p);
      const audit = await analyzeReviewVideo(blankVid, { from: 0, span: 3, tl, project: p });
      expect(audit.checks.find((c) => c.id === "blank-frames")?.status).toBe("FAIL");
      expect(audit.checks.find((c) => c.id === "audio-silence")?.status).toBe("PASS");

      const blackJpg = join(dir, "black.jpg");
      const litJpg = join(dir, "lit.jpg");
      await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } } }).jpeg().toFile(blackJpg);
      await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 180, g: 120, b: 60 } } }).jpeg().toFile(litJpg);
      expect(await isStillBlank(blackJpg)).toBe(true);
      expect(await isStillBlank(litJpg)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("trims dead leading and trailing silence from voiced audio and shifts word timestamps cleanly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "beatsheet-vo-tight-"));
    try {
      const wav = join(dir, "line.wav");
      // 0.4s silence + 0.6s 440Hz tone + 0.5s silence = 1.5s total
      execFileSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono:d=0.4",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=24000:duration=0.6",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono:d=0.5",
        "-filter_complex",
        "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
        "-map",
        "[a]",
        "-c:a",
        "pcm_s16le",
        wav,
      ]);
      const words = [
        { w: "Fast", s: 0.42, e: 0.68 },
        { w: "cut", s: 0.72, e: 0.98 },
      ];
      const r = await trimLineSilence(wav, words, 1.5, { pad: 0.05 });
      expect(r.trimmed).toBe(true);
      expect(r.duration).toBeLessThan(0.9);
      expect(r.duration).toBeGreaterThan(0.6);
      expect(r.words[0]!.s).toBeLessThan(0.15);
      expect(r.words[1]!.e).toBeLessThanOrEqual(r.duration);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("renders a labeled side-by-side OUT -> IN continuity sheet and flags same-place lighting/color jumps while ignoring scene changes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "beatsheet-review-cont-"));
    try {
      const vid = join(dir, "cut.mp4");
      // 3 adjacent 2s generated shots: warm kitchen (0-2s) -> cold blue kitchen (2-4s, jump!) -> bright exterior alley (4-6s, different place -> no jump warn).
      execFileSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0xc88246:s=320x180:r=15:d=2",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x2850aa:s=320x180:r=15:d=2",
        "-f",
        "lavfi",
        "-i",
        "color=c=0xe6e6dc:s=320x180:r=15:d=2",
        "-filter_complex",
        "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
        "-map",
        "[v]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        vid,
      ]);
      const p: Project = {
        ...project([
          { id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 2, content: { kind: "generated", prompt: "@cat in @kitchen", take: "t1" } },
          { id: "s2", track: "pic", fidelity: "rough", start: { kind: "time", t: 2 }, duration: 2, content: { kind: "generated", prompt: "@cat leaps in @kitchen", take: "t2" } },
          { id: "s3", track: "pic", fidelity: "rough", start: { kind: "time", t: 4 }, duration: 2, content: { kind: "generated", prompt: "@cat runs in @alley", take: "t3" } },
        ]),
        cast: [
          { id: "cat", name: "Cat", kind: "character" },
          { id: "kitchen", name: "Kitchen", kind: "place" },
          { id: "alley", name: "Alley", kind: "place" },
        ],
      };
      const tl = resolveTimeline(p);
      const pairs = adjacentGeneratedPairs(p, tl);
      expect(pairs).toHaveLength(2);
      expect(pairs[0]).toMatchObject({ from: "s1", to: "s2", sharedPlaces: ["kitchen"], sharedCast: ["cat"] });
      expect(pairs[1]).toMatchObject({ from: "s2", to: "s3", sharedPlaces: [], sharedCast: ["cat"] });

      const built = await buildContinuitySheet(vid, pairs, { from: 0, vertical: false, dir });
      const meta = await sharp(built.sheet).metadata();
      expect(meta.width).toBeGreaterThan(700);
      expect(meta.height).toBeGreaterThan(400);
      expect(built.rows).toHaveLength(2);
      expect(built.rows[0]).toContain("s1 → s2");
      expect(built.rows[0]).toContain("same place: @kitchen");
      expect(built.rows[0]).toContain("[lighting/color WARN]");
      expect(built.rows[1]).toContain("s2 → s3");
      expect(built.rows[1]).not.toContain("[lighting/color WARN]");
      // Only the same-place jump fires a lighting warning; the kitchen -> alley transition does not.
      expect(built.checks).toHaveLength(1);
      expect(built.checks[0]).toMatchObject({ id: "continuity-lighting", category: "continuity", status: "WARN", shot: "s2" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
