import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

// Where projects live (and settings) is read when the engine's modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-restore-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

// A spending limit, and keys for ElevenLabs and fal, unless a test changes them.
const settings = vi.hoisted(() => ({ limit: undefined as { usd: number; since: string } | undefined }));
vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return {
    ...real,
    getSecret: async () => "test-key",
    readSettings: () => ({ services: { elevenlabs: { addedAt: "2026-10-30" }, fal: { addedAt: "2026-10-30" } }, checks: {}, ...(settings.limit ? { make: { limit: settings.limit } } : {}) }),
  };
});
// DeepFilterNet "installed": it gives back the sound at a quarter of its loudness, as though it were all hiss.
vi.mock("../src/fixtools.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/fixtools.ts")>();
  const ready = { binary: "deep-filter", where: "the processor", speed: 0.07, at: "", bytes: 0 };
  return {
    ...real,
    toolReady: (id: string) => (id === "deepfilter" ? ready : undefined),
    toolStatus: (id: string) => (id === "deepfilter" ? { id, label: "DeepFilterNet", state: "ready", detail: "", ready } : { id, label: id, state: "missing", detail: "About 45 MB to download" }),
    runDeepFilter: async (_r: unknown, wav: string, outDir: string) => {
      mkdirSync(outDir, { recursive: true });
      const out = join(outDir, "clean.wav");
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-af", "volume=0.25", out]);
      return out;
    },
  };
});

let restore: typeof import("../src/restore.ts");
let clean: typeof import("../src/clean.ts");
let spend: typeof import("../src/spend.ts");
let make: typeof import("../src/make.ts");
let store: typeof import("../src/store.ts");
const dir = join(process.env.BEATSHEET_PROJECTS!, "tape");

beforeAll(async () => {
  restore = await import("../src/restore.ts");
  clean = await import("../src/clean.ts");
  spend = await import("../src/spend.ts");
  make = await import("../src/make.ts");
  store = await import("../src/store.ts");
  mkdirSync(dir, { recursive: true });
  // A tape with two shots (a test card, then a moving pattern) and a steady tone on it, at 25 frames a second.
  const part = (src: string, name: string) =>
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `${src}=s=160x120:r=25:d=3`, "-f", "lavfi", "-i", "sine=f=440:d=3", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, name)]);
  part("smptebars", "a.mp4");
  part("testsrc2", "b.mp4");
  writeFileSync(join(dir, "list.txt"), ["a.mp4", "b.mp4"].map((f) => `file '${f}'`).join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-c", "copy", join(dir, "tape.mp4")]);
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "tape",
    title: "The tape",
    sources: [],
    brief: { goal: "test" },
    assets: [{ id: "tape", kind: "video", path: join(dir, "tape.mp4"), duration: 6, width: 160, height: 120, fps: 25, moments: [{ id: "shot-1", t: 0, end: 3, label: "Shot 1" }, { id: "shot-2", t: 3, end: 6, label: "Shot 2" }] }],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "montage",
        spec: {},
        formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [
          { id: "early", track: "pic", fidelity: "final", start: { kind: "time", t: 0 }, end: { kind: "time", t: 1 }, content: { kind: "clip", asset: "tape", in: 0.2 } },
          { id: "inside", track: "pic", fidelity: "final", start: { kind: "time", t: 1 }, end: { kind: "time", t: 2 }, content: { kind: "clip", asset: "tape", in: 2.5 } },
        ],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

const frames = (file: string) => Number(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file]).toString().trim());

describe("restoring a stretch of a clip", () => {
  it("works a shot at a time when steadying, and in pieces of no more than 20 seconds otherwise", () => {
    expect(restore.piecesOf(10, 50, [5, 30, 70], true)).toEqual([
      [10, 30],
      [30, 50],
    ]);
    expect(restore.piecesOf(0, 50, [], false)).toEqual([
      [0, 50 / 3],
      [50 / 3, 100 / 3],
      [100 / 3, 50],
    ]);
  });

  it("makes a version, frame for frame, steadied a shot at a time, and puts it in the shots it covers", async () => {
    const r = await restore.restoreClip("tape", "tape", { from: 1.6, to: 5, steps: { denoise: "light", steady: true }, use: {} });
    const v = r.asset;
    // 1.6s to 5s at 25 a second, across the cut at 3s: every frame there, none twice.
    expect(v.version).toEqual({ of: "tape", from: 1.6 });
    expect(frames(v.path)).toBe(85);
    expect(v.provenance).toMatchObject({ source: "restored", op: "restore", refs: ["tape"], params: { denoise: "light", steady: true, from: 1.6, to: 5 } });
    expect(v.label).toBe("tape 0:01–0:05 · restored");
    // The shot inside the stretch shows it; the one that starts before it doesn't.
    expect(r.shots).toEqual(["inside"]);
    const shots = store.loadProject("tape").project.shots;
    expect(shots.map((s) => (s.content.kind === "clip" ? s.content.version : undefined))).toEqual([undefined, v.id]);
    expect(restore.useVersion("tape", v.id, { off: true })).toEqual(["inside"]);
  });

  it("refuses a restore with nothing to do, or of a version", async () => {
    await expect(restore.restorePlan("tape", "tape", { steps: {} })).rejects.toThrow("Say what to do");
    const v = store.loadProject("tape").project.assets.find((a) => a.version)!;
    await expect(restore.restorePlan("tape", v.id, { steps: { denoise: "light" } })).rejects.toThrow("already a version");
  });

  it("says what upscaling on fal would cost, and won't go over the spending limit", async () => {
    const plan = await restore.restorePlan("tape", "tape", { steps: { upscale: 4 }, upscaleWith: "seedvr" });
    // 6s at 25 a second, 640×480 made: 46 megapixels.
    expect(plan.usd).toBeCloseTo(0.046, 3);
    settings.limit = { usd: 1, since: "2026-01-01T00:00:00Z" };
    spend.recordSpend("tape", { what: "earlier", by: "test", usd: 0.98 });
    expect(make.spentSince("2026-01-01T00:00:00Z")).toBeCloseTo(0.98, 3);
    await expect(restore.restoreClip("tape", "tape", { steps: { upscale: 4 }, upscaleWith: "seedvr" })).rejects.toThrow("spending limit");
    settings.limit = undefined;
  });
});

describe("cleaning the voices", () => {
  it("mixes the cleaned voices in where they're asked for, keeping a little of the room when it's light", () => {
    const tmp = mkdtempSync(join(tmpdir(), "beatsheet-mix-"));
    const samples = (v: number) => {
      const b = Buffer.alloc(48_000 * 2 * 2);
      for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(v, i * 2);
      return b;
    };
    writeFileSync(join(tmp, "orig.raw"), samples(1000));
    writeFileSync(join(tmp, "voices.raw"), samples(0));
    // Cleaned for the first second only.
    const curve = new Float32Array(201).map((_, i) => (i < 100 ? 1 : 0));
    clean.mixRaw(join(tmp, "orig.raw"), join(tmp, "voices.raw"), join(tmp, "light.raw"), curve, 0.25);
    clean.mixRaw(join(tmp, "orig.raw"), join(tmp, "voices.raw"), join(tmp, "full.raw"), curve, 0);
    const at = (f: string, s: number) => readFileSync(join(tmp, f)).readInt16LE(Math.round(s * 48_000) * 2);
    expect([at("light.raw", 0.5), at("full.raw", 0.5), at("full.raw", 1.5)]).toEqual([250, 0, 1000]);
  });

  it("cleans only where people talk once it's transcribed, and goes back to its own sound", async () => {
    mkdirSync(join(dir, "transcripts"), { recursive: true });
    writeFileSync(join(dir, "transcripts", "tape.json"), JSON.stringify({ by: "whisper", at: "2026-10-30", words: [{ w: "Hello", s: 1, e: 1.5 }] }));
    const r = await clean.cleanSound("tape", "tape", { strength: "full" });
    expect(r).toMatchObject({ choice: { id: "deepfilter" }, spans: 1, reused: false });
    const { project } = store.loadProject("tape");
    const a = project.assets.find((x) => x.id === "tape")!;
    expect(a.cleaned).toMatchObject({ by: "deepfilter", strength: "full", only: "speech" });
    const file = clean.soundFile(project, dir, a);
    expect(file).toMatch(/tape\.clean-[a-z0-9]+\.m4a$/);
    // Quieter where it was cleaned (a quarter, as the stand-in cleaner gives it), as it was elsewhere.
    const loud = (from: number) => Number(/mean_volume:\s*(-?[\d.]+)/.exec(spawnSync("ffmpeg", ["-hide_banner", "-ss", String(from), "-t", "0.5", "-i", file, "-af", "volumedetect", "-f", "null", "-"]).stderr.toString())?.[1]);
    expect(loud(1) - loud(4)).toBeLessThan(-10);
    // Again, lighter: the cleaned voices are mixed again rather than cleaned again.
    expect((await clean.cleanSound("tape", "tape", { strength: "light" })).reused).toBe(true);
    clean.uncleanSound("tape", "tape");
    const back = store.loadProject("tape").project.assets.find((x) => x.id === "tape")!;
    expect(back.cleaned).toBeUndefined();
    expect(existsSync(file)).toBe(false);
  });
});

describe("spending outside making", () => {
  it("counts what services cost in the turn and against the limit", () => {
    copyFileSync(join(dir, "project.json"), join(dir, "project.backup.json"));
    settings.limit = { usd: 2, since: "2026-01-01T00:00:00Z" };
    const before = make.spentSince("2026-01-01T00:00:00Z");
    spend.recordSpend("tape", { what: "Cleaned the voices", by: "elevenlabs:audio-isolation", usd: 0.5 });
    expect(make.spentSince("2026-01-01T00:00:00Z")).toBeCloseTo(before + 0.5, 3);
    expect(() => make.assertSpendable(1)).toThrow("spending limit");
    expect(() => make.assertSpendable(0.1, { spendable: 0.05 })).toThrow("Ask first");
    expect(() => make.assertSpendable(0.1)).not.toThrow();
    settings.limit = undefined;
  });
});
