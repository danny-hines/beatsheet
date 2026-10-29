import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

// Where projects live is read when the engine loads, so it's imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-split-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

let split: typeof import("../src/shotsplit.ts");
let store: typeof import("../src/store.ts");
const dir = join(process.env.BEATSHEET_PROJECTS!, "tape");

beforeAll(async () => {
  split = await import("../src/shotsplit.ts");
  store = await import("../src/store.ts");
  mkdirSync(dir, { recursive: true });
  // A tape with three shots: a test card for 2 seconds, then plain red for 2, then a moving pattern for 2.
  const part = (src: string, name: string) => execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `${src}${src.includes("=") ? ":" : "="}s=320x240:r=25:d=2`, "-pix_fmt", "yuv420p", join(dir, name)]);
  part("smptebars", "a.mp4");
  part("color=c=red", "b.mp4");
  part("testsrc2", "c.mp4");
  writeFileSync(join(dir, "list.txt"), ["a.mp4", "b.mp4", "c.mp4"].map((f) => `file '${f}'`).join("\n"));
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-c", "copy", join(dir, "tape.mp4")]);
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "tape",
    title: "The tape",
    sources: [],
    brief: { goal: "test" },
    assets: [{ id: "tape", kind: "video", path: join(dir, "tape.mp4"), duration: 6, moments: [{ id: "laugh", t: 4.5, label: "Grandpa laughs" }] }],
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
        shots: [],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

describe("splitting a long file at its cuts", () => {
  it("leaves out a flicker shorter than a shot, at either end too", () => {
    expect(split.shotsBetween([2, 2.3, 4, 9.6], 10)).toEqual([
      { t: 0, end: 2 },
      { t: 2, end: 4 },
      { t: 4, end: 10 },
    ]);
    expect(split.shotsBetween([], 7.5)).toEqual([{ t: 0, end: 7.5 }]);
  });

  it("marks each shot as a moment, keeps the ones marked by hand, and replaces its own when split again", async () => {
    const shots = await split.splitAtCuts("tape", "tape");
    expect(shots.map((s) => [s.id, s.t, s.end])).toEqual([
      ["shot-1", 0, 2],
      ["shot-2", 2, 4],
      ["shot-3", 4, 6],
    ]);
    expect(store.loadFile("tape").doc.assets[0]!.moments!.map((m) => m.id)).toEqual(["shot-1", "shot-2", "shot-3", "laugh"]);
    await split.splitAtCuts("tape", "tape", { threshold: 0.9 });
    expect(store.loadFile("tape").doc.assets[0]!.moments!.map((m) => m.id)).toEqual(["shot-1", "laugh"]);
  });
});
