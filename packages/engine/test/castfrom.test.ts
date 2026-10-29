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
let store: typeof import("../src/store.ts");
const dir = join(process.env.BEATSHEET_PROJECTS!, "family");

beforeAll(async () => {
  ({ castFromSubject } = await import("../src/castfrom.ts"));
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
    expect(await castFromSubject("family", { asset: "beach", subject: "face-1" })).toEqual({ member: "theo", still: "theo-still" });
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
});
