import { describe, expect, it } from "vitest";
import { barLines, fitSong } from "@beatsheet/schema";

// 120 BPM in 4/4: a bar every 2 seconds, the downbeat at 0.5s, a 3-minute song.
const song = { grid: { bpm: 120, downbeat: 0.5, beatsPerBar: 4 }, duration: 180 };

describe("fitting a song to a cut", () => {
  it("lists the bar lines", () => {
    const bars = barLines(song.grid, song.duration);
    expect(bars.slice(0, 3)).toEqual([0.5, 2.5, 4.5]);
    expect(bars.at(-1)).toBe(178.5);
  });

  it("jumps on bar lines so the song's own ending lands at the end of the cut", () => {
    const fit = fitSong(song, 60);
    expect(fit.whole).toBe(false);
    expect(Math.abs(fit.total - 60)).toBeLessThanOrEqual(1);
    // Both ends of the jump are bar lines, the head plays from the top, and the tail runs to the song's end.
    const bars = barLines(song.grid, song.duration);
    expect(bars).toContain(fit.headEnd);
    expect(bars).toContain(fit.tailStart);
    expect(fit.headEnd + (song.duration - fit.tailStart)).toBeCloseTo(fit.total, 3);
    // About six bars of ending: a phrase, not just the last chord.
    expect((song.duration - fit.tailStart) / 2).toBeGreaterThanOrEqual(4);
  });

  it("starts partway in when asked, and leaves a song that already fits alone", () => {
    const fit = fitSong(song, 45, 30.5);
    expect(fit.headEnd).toBeGreaterThan(30.5);
    expect(Math.abs(fit.total - 45)).toBeLessThanOrEqual(1);
    expect(fitSong({ ...song, duration: 40 }, 60).whole).toBe(true);
  });
});

import { checkCut, cutView, parseFile, resolveTimeline, SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

describe("designed shots, the look, captions and sound cues in the format", () => {
  const file = (): ProjectFile => {
    const r = parseFile({
      schema: SCHEMA_VERSION,
      id: "p",
      title: "P",
      brief: { goal: "g" },
      look: { colors: { paper: "#f4f0e8", accent: "#d7ff42" }, fonts: { display: "Arial Black" }, grain: 0.05 },
      assets: [{ id: "photo", kind: "image", path: "a.jpg" }],
      cuts: [
        {
          id: "main",
          name: "Main",
          recipe: "story",
          formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
          stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
          spine: "shots",
          captions: {},
          sfx: [
            { id: "x1", sound: "whoosh", at: { kind: "shot", shot: "s2" } },
            { id: "x2", sound: "photo", at: { kind: "time", t: 1 } },
          ],
          tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
          shots: [
            { id: "s1", track: "pic", fidelity: "rough", duration: 2, content: { kind: "coded", component: "kit:Title", props: { text: "Hello" } }, captions: false },
            { id: "s2", track: "pic", fidelity: "rough", duration: 3, content: { kind: "clip", asset: "photo", motion: { from: { scale: 1 }, to: { scale: 1.15, x: 0.02 } } }, transition: { kind: "whip" } },
          ],
          notes: [],
        },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.file;
  };

  it("keeps the look, captions, sound cues and motion through parsing", () => {
    const p = cutView(file());
    expect(p.look?.fonts?.display).toBe("Arial Black");
    expect(p.captions).toEqual({});
    expect(p.shots[0]!.captions).toBe(false);
    expect(p.shots[1]!.content.kind === "clip" && p.shots[1]!.content.motion?.to?.scale).toBe(1.15);
    expect(checkCut(p)).toEqual([]);
  });

  it("times sound cues from their anchors, and names a sound that's neither built in nor an asset", () => {
    const p = cutView(file());
    const tl = resolveTimeline(p);
    expect(tl.sfx.map((x) => [x.id, x.t])).toEqual([["x1", 2], ["x2", 1]]);
    expect(tl.sfx[0]!.gain).toBe(0.5);
    p.sfx![0]!.sound = "kazoo";
    expect(checkCut(p).map((i) => i.path)).toContain("sfx.0.sound");
  });
});
