import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

// Where projects live is read when the engine loads, so it's imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-lookagain-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

let ingest: typeof import("../src/ingest.ts");
let probe: typeof import("../src/probe.ts");
let store: typeof import("../src/store.ts");
const dir = join(process.env.BEATSHEET_PROJECTS!, "tapes");
const footage = join(root, "footage");
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

beforeAll(async () => {
  ingest = await import("../src/ingest.ts");
  probe = await import("../src/probe.ts");
  store = await import("../src/store.ts");
  mkdirSync(dir, { recursive: true });
  mkdirSync(footage, { recursive: true });
  // A tape brought in before beatsheet made playable copies (interlaced PAL DV), and a phone clip that never needs one.
  ff("-f", "lavfi", "-i", "testsrc2=s=720x576:r=50:d=1", "-f", "lavfi", "-i", "sine=d=1", "-vf", "interlace=scan=bff", "-target", "pal-dv", join(footage, "tape.dv"));
  ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(footage, "phone.mp4"));
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "tapes",
    title: "Tapes",
    sources: [{ id: "footage", path: footage }],
    brief: { goal: "test" },
    assets: [
      { id: "tape", kind: "video", path: "tape.dv", duration: 1, width: 720, height: 576, fps: 25, provenance: { source: "import" } },
      { id: "phone", kind: "video", path: "phone.mp4", duration: 1, width: 640, height: 360, fps: 30, provenance: { source: "import" } },
    ],
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

describe("footage brought in before playable copies", () => {
  it("is looked at once: old video gets its copy and the facts of the copy, and the rest is left as it is", async () => {
    expect(await ingest.lookAgain("tapes")).toEqual(["tape"]);
    const [tape, phone] = store.loadFile("tapes").doc.assets;
    expect(tape).toMatchObject({ playable: { deinterlace: true, sar: 1.0667 }, width: 768, height: 576, fps: 50, tags: ["interlaced"] });
    expect(phone!.playable).toBeUndefined();
    expect(existsSync(join(dir, "media", "tape.mp4"))).toBe(true);
    expect(existsSync(join(dir, ".cache", "proxy", "tape.mp4"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, ".cache", "looked.json"), "utf8")).sort()).toEqual(["phone", "tape"]);
    // Not again.
    expect(await ingest.lookAgain("tapes")).toEqual([]);
  });

  it("reads an MPEG-1 file's frame rate as its frames come, not as its header says", () => {
    expect(probe.frameRate(59.94, 29.97)).toBe(29.97);
    expect(probe.frameRate(120, 29.9)).toBe(29.9);
    expect(probe.frameRate(30, 29.97)).toBe(30);
    expect(probe.frameRate(undefined, 25)).toBe(25);
  });
});
