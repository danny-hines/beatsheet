import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type Asset, type ProjectFile } from "@beatsheet/schema";

// Where projects live is read when the engine loads, so it's imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-frames-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

// Adding an asset probes it and makes previews; here it only records it.
vi.mock("../src/ingest.ts", async () => {
  const { loadFile, updateFile } = await import("../src/store.ts");
  return {
    addAsset: async (id: string, file: string, meta: { id?: string; label?: string; tags?: string[]; provenance?: Asset["provenance"] }) => {
      const used = new Set(loadFile(id).doc.assets.map((a) => a.id));
      let aid = meta.id ?? "still";
      for (let n = 2; used.has(aid); n++) aid = `${meta.id}-${n}`;
      const asset: Asset = { id: aid, kind: "image", path: file, label: meta.label, tags: meta.tags, provenance: meta.provenance };
      updateFile(id, (d) => void d.assets.push(asset));
      return asset;
    },
  };
});

let stillFromClip: typeof import("../src/frames.ts").stillFromClip;
const dir = join(process.env.BEATSHEET_PROJECTS!, "walk");

beforeAll(async () => {
  ({ stillFromClip } = await import("../src/frames.ts"));
  mkdirSync(dir, { recursive: true });
  // Two seconds: red for the first, blue for the second.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=red:s=64x36:r=25:d=1", "-f", "lavfi", "-i", "color=blue:s=64x36:r=25:d=1", "-filter_complex", "[0][1]concat=n=2:v=1", "-pix_fmt", "yuv420p", join(dir, "walk.mp4")]);
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "walk",
    title: "A walk",
    sources: [],
    brief: { goal: "test" },
    assets: [
      { id: "walk", kind: "video", path: join(dir, "walk.mp4"), duration: 2, width: 64, height: 36, label: "The cat walks off" },
      { id: "photo", kind: "image", path: join(dir, "walk.mp4") },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "film",
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

const colorOf = async (file: string) => {
  const { dominant } = await sharp(readFileSync(file)).stats();
  return dominant.b > dominant.r ? "blue" : "red";
};

describe("a still from a clip", () => {
  it("cuts the last frame, to carry on from, and gives the same one back when asked again", async () => {
    const still = await stillFromClip("walk", "walk");
    expect(still).toMatchObject({ id: "walk-end", kind: "image", label: "Last frame of The cat walks off", provenance: { source: "capture", refs: ["walk"], params: { frame: "last" } } });
    expect(await colorOf(still.path)).toBe("blue");
    expect((await stillFromClip("walk", "walk")).id).toBe("walk-end");
  });

  it("cuts a moment, and refuses what isn't a clip or a time past its end", async () => {
    const still = await stillFromClip("walk", "walk", 0.5);
    expect(still).toMatchObject({ id: "walk-frame", label: "Frame at 0.50s of The cat walks off" });
    expect(await colorOf(still.path)).toBe("red");
    await expect(stillFromClip("walk", "photo")).rejects.toThrow("not a clip");
    await expect(stillFromClip("walk", "walk", 3)).rejects.toThrow("there's no frame at 3s");
  });
});
