import { describe, expect, it } from "vitest";
import { checkReferences, chooseFixer, cleanCurve, megapixels, parseFile, restoredSize, restoreWords, SCHEMA_VERSION, speechSpans, STAGE_IDS, versionAt, type FixerState, type ProjectFile } from "../src/index.ts";

const ready = (speed?: number, where?: string): FixerState => ({ state: "ready", ...(speed !== undefined ? { speed } : {}), ...(where ? { where } : {}) });

describe("choosing a fixer", () => {
  // Fighting.mpg: 6:49 of 322×240 at 29.97 fps.
  const film = { seconds: 409, width: 322, height: 240, fps: 29.97, upscale: 4 as const };

  it("cleans here when this computer is quick at it, and says what the service would cost", () => {
    const r = chooseFixer("clean", { deepfilter: ready(0.069, "on the processor"), isolator: ready() }, { seconds: 409 });
    expect(r.auto?.id).toBe("deepfilter");
    expect(r.auto).toMatchObject({ seconds: 28, where: "on the processor" });
    expect(r.ready.find((c) => c.id === "isolator")?.usd).toBeCloseTo(0.818, 3);
  });

  it("sends the sound out when this computer is slow at it, and keeps it here when there's no key", () => {
    expect(chooseFixer("clean", { deepfilter: ready(0.6), isolator: ready() }, { seconds: 60 }).auto?.id).toBe("isolator");
    const noKey = chooseFixer("clean", { deepfilter: ready(0.6), isolator: { state: "key", detail: "Needs an ElevenLabs key" } }, { seconds: 60 });
    expect(noKey.auto?.id).toBe("deepfilter");
    expect(noKey.setup).toEqual([{ id: "isolator", label: "Voice Isolator", ok: false, kind: "key", why: "Needs an ElevenLabs key" }]);
  });

  it("upscales on a quick graphics card, and prices fal by the picture it makes", () => {
    // The 4090 here: 2.24 seconds a megapixel taken in.
    const r = chooseFixer("upscale", { realesrgan: ready(2.243, "on NVIDIA GeForce RTX 4090"), seedvr: ready() }, film);
    expect(r.auto?.id).toBe("realesrgan");
    expect(megapixels(film).in).toBeCloseTo(947.3, 0);
    expect(r.auto?.seconds).toBe(2125);
    expect(r.ready[1]).toMatchObject({ id: "seedvr", usd: 15.156 });
  });

  it("sends a laptop's upscaling out when it would take more than ten times the footage, unless told otherwise", () => {
    const slow = { realesrgan: ready(60), seedvr: ready() };
    expect(chooseFixer("upscale", slow, film).auto?.id).toBe("seedvr");
    expect(chooseFixer("upscale", slow, film, ["realesrgan"]).auto?.id).toBe("realesrgan");
  });
});

describe("cleaning only where people talk", () => {
  it("runs words that are close together into one stretch, with a breath either side", () => {
    const words = [
      { s: 1, e: 1.4 },
      { s: 1.5, e: 2 },
      { s: 2.6, e: 3 },
      { s: 10, e: 10.5 },
    ];
    expect(speechSpans(words)).toEqual([
      [0.8, 3.3],
      [9.8, 10.8],
    ]);
  });

  it("eases the cleaned sound in and out at each stretch's edges, and uses it everywhere without stretches", () => {
    const c = cleanCurve([[1, 2]], 3, 100, 0.1);
    expect(c[50]).toBe(0);
    expect(c[95]).toBeCloseTo(0.5, 5);
    expect(c[150]).toBe(1);
    expect(c[205]).toBeCloseTo(0.5, 5);
    expect(c[250]).toBe(0);
    expect([...cleanCurve(undefined, 1)].every((g) => g === 1)).toBe(true);
  });
});

describe("restoring", () => {
  it("says what a restore makes: bigger, and at most twice the frames", () => {
    expect(restoredSize({ width: 322, height: 240, fps: 29.97 }, { upscale: 4 })).toEqual({ width: 1288, height: 960, fps: 29.97 });
    expect(restoredSize({ width: 352, height: 240, fps: 15 }, { fps: 60 })).toEqual({ width: 352, height: 240, fps: 30 });
    expect(restoreWords({ denoise: "light", steady: true, upscale: 4 })).toBe("denoised, steadied, 4× bigger");
  });

  it("shows a version only where it covers what the shot plays", () => {
    const v = { duration: 20, version: { of: "fight", from: 200 } };
    expect(versionAt(v, "fight", 205, 215)).toBe(5);
    expect(versionAt(v, "fight", 205, 220.3)).toBe(5);
    expect(versionAt(v, "fight", 195, 205)).toBeUndefined();
    expect(versionAt(v, "fight", 215, 225)).toBeUndefined();
    expect(versionAt(v, "galileo", 205, 215)).toBeUndefined();
  });

  it("checks that a shot's version is a version of its clip", () => {
    const stages = Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }]));
    const file = {
      schema: SCHEMA_VERSION,
      id: "old",
      title: "Old",
      sources: [],
      brief: { goal: "Restore the fight film" },
      assets: [
        { id: "fight", kind: "video", path: "Fighting.mpg", duration: 409 },
        { id: "galileo", kind: "video", path: "Galileo.avi", duration: 950 },
        { id: "fight-restored", kind: "video", path: "r.mp4", duration: 20, version: { of: "fight", from: 200 } },
        { id: "stray", kind: "video", path: "s.mp4", version: { of: "gone", from: 0 } },
      ],
      cuts: [
        {
          id: "main",
          name: "Main",
          recipe: "montage",
          spec: {},
          formats: [{ id: "landscape", label: "16:9", width: 1920, height: 1080, fps: 30 }],
          stages,
          spine: "shots",
          tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
          shots: [
            { id: "a", track: "pic", fidelity: "final", start: { kind: "time", t: 0 }, end: { kind: "time", t: 5 }, content: { kind: "clip", asset: "fight", in: 205, version: "fight-restored" } },
            { id: "b", track: "pic", fidelity: "final", start: { kind: "time", t: 5 }, end: { kind: "time", t: 10 }, content: { kind: "clip", asset: "galileo", version: "fight-restored" } },
          ],
          notes: [],
        },
      ],
    };
    const parsed = parseFile(file);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    expect(checkReferences(parsed.file as ProjectFile)).toEqual([
      { path: "assets.3.version.of", message: 'unknown asset "gone"' },
      { path: "cuts.0.shots.1.content.version", message: '"fight-restored" isn\'t a version of "galileo"' },
    ]);
  });
});
