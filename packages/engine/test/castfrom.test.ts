import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type Asset, type ProjectFile } from "@beatsheet/schema";

// Where projects live is read when the engine loads, so it's imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-castfrom-"));
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

let castFromSubject: typeof import("../src/castfrom.ts").castFromSubject;
let momentsOf: typeof import("../src/castfrom.ts").momentsOf;
let store: typeof import("../src/store.ts");
const dir = join(process.env.BEATSHEET_PROJECTS!, "family");

beforeAll(async () => {
  ({ castFromSubject, momentsOf } = await import("../src/castfrom.ts"));
  store = await import("../src/store.ts");
  mkdirSync(dir, { recursive: true });
  // A 1000×500 photo of two people: Theo's face at the left, and someone not named yet at the right.
  writeFileSync(join(dir, "beach.jpg"), await sharp({ create: { width: 1000, height: 500, channels: 3, background: "#4a90c0" } }).jpeg().toBuffer());
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "family",
    title: "Summer",
    sources: [],
    brief: { goal: "test" },
    assets: [
      {
        id: "beach",
        kind: "image",
        path: join(dir, "beach.jpg"),
        subjects: [
          { id: "face-1", label: "Theo", kind: "face", samples: [[0, 0.2, 0.2, 0.1, 0.2]] },
          { id: "face-2", label: "Face 2", kind: "face", samples: [[0, 0.7, 0.3, 0.08, 0.16]] },
        ],
      },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "film",
        spec: {},
        formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("cast from someone found in the footage", () => {
  it("makes a character named for them, seen in the photo and in a still of their head and shoulders", async () => {
    expect(await castFromSubject("family", { asset: "beach", subject: "face-1" })).toEqual({ member: "theo", still: "theo-still", stills: ["theo-still"] });
    const { project } = store.loadProject("family");
    expect(project.cast).toEqual([{ id: "theo", name: "Theo", kind: "character", seen: [{ asset: "beach", subject: "face-1" }, { asset: "theo-still" }] }]);
    const still = project.assets.find((a) => a.id === "theo-still")!;
    expect(still).toMatchObject({ label: "Theo, from beach", tags: ["still"], provenance: { source: "capture", refs: ["beach"], params: { subject: "face-1", at: 0 } } });
    // The face is 100×100; with its head and shoulders the still is 340 wide and as tall as the photo lets it be.
    const size = await sharp(readFileSync(still.path)).metadata();
    expect([size.width, size.height]).toEqual([340, 391]);
  });

  it("gives someone not named yet an id to rename, and adds a second sighting to the same member", async () => {
    expect(await castFromSubject("family", { asset: "beach", subject: "face-2" })).toMatchObject({ member: "character" });
    expect(await castFromSubject("family", { asset: "beach", subject: "face-2", into: "theo" })).toMatchObject({ member: "theo" });
    const cast = store.loadProject("family").project.cast!;
    expect(cast.find((m) => m.id === "character")).toMatchObject({ name: "", kind: "character" });
    expect(cast.find((m) => m.id === "theo")!.seen).toHaveLength(4);
    await expect(castFromSubject("family", { asset: "beach", subject: "face-9" })).rejects.toThrow('"beach" has no subject "face-9"');
  });

  it("picks where they're largest, then a couple more moments apart where they're nearly as large", () => {
    const samples = [
      [0, 0.1, 0.1, 0.2, 0.2],
      [0.5, 0.1, 0.1, 0.3, 0.3],
      [1.0, 0.1, 0.1, 0.32, 0.32],
      [2.6, 0.5, 0.1, 0.28, 0.28],
      [3.0, 0.5, 0.1, 0.1, 0.1],
      [4.5, 0.2, 0.1, 0.25, 0.25],
    ];
    // The largest (1.0s); 0.5s is too close to it; 2.6s and 4.5s are far enough and nearly as large; 3.0s is too small.
    expect(momentsOf(samples).map((s) => s[0])).toEqual([1.0, 2.6, 4.5]);
    expect(momentsOf(samples, 1).map((s) => s[0])).toEqual([1.0]);
  });

  it("cuts three stills from a clip, a few moments apart", async () => {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=320x180:r=25:d=5", "-pix_fmt", "yuv420p", join(dir, "walk.mp4")]);
    store.updateFile("family", (d) =>
      void d.assets.push({
        id: "walk",
        kind: "video",
        path: join(dir, "walk.mp4"),
        duration: 5,
        label: "the walk",
        subjects: [{ id: "person-1", label: "Mia", kind: "person", samples: [[0.4, 0.2, 0.2, 0.3, 0.6], [1.0, 0.25, 0.2, 0.3, 0.6], [2.5, 0.4, 0.2, 0.3, 0.6], [4.2, 0.5, 0.2, 0.3, 0.6]] }],
      }),
    );
    expect(await castFromSubject("family", { asset: "walk", subject: "person-1" })).toEqual({ member: "mia", still: "mia-still", stills: ["mia-still", "mia-still-2", "mia-still-3"] });
    const { project } = store.loadProject("family");
    expect(project.cast!.find((m) => m.id === "mia")!.seen).toEqual([{ asset: "walk", subject: "person-1" }, { asset: "mia-still" }, { asset: "mia-still-2" }, { asset: "mia-still-3" }]);
    expect(project.assets.filter((a) => a.id.startsWith("mia-still")).map((a) => a.provenance?.params?.at)).toEqual([0.4, 2.5, 4.2]);
  });
});
