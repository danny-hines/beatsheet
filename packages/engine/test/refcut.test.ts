import { mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Asset, CastMember } from "@beatsheet/schema";

// SAM here or not, as a test says; "finding" two people, the larger first: one on the left, one on the right.
const sam = vi.hoisted(() => ({ ready: true, asked: [] as string[] }));
vi.mock("../src/sam.ts", () => ({
  samReady: () => sam.ready,
  samSegment: async (_image: string, prompt: string, out: string) => {
    sam.asked.push(prompt);
    const piece = async (file: string, left: number) => {
      const shape = Buffer.from(`<svg width="200" height="100"><rect x="${left}" y="20" width="60" height="70" fill="red"/></svg>`);
      await sharp(shape).png().toFile(file);
      return file;
    };
    return [
      { file: await piece(`${out}-1.png`, 20), box: { x: 0.1, y: 0.2, w: 0.3, h: 0.7 }, score: 0.9 },
      { file: await piece(`${out}-2.png`, 130), box: { x: 0.65, y: 0.2, w: 0.3, h: 0.7 }, score: 0.8 },
    ];
  },
}));

let refcut: typeof import("../src/refcut.ts");
const dir = mkdtempSync(join(tmpdir(), "beatsheet-refcut-"));

beforeAll(async () => {
  refcut = await import("../src/refcut.ts");
  mkdirSync(join(dir, "photos"), { recursive: true });
  await sharp({ create: { width: 200, height: 100, channels: 3, background: "#3a6" } }).jpeg().toFile(join(dir, "photos", "sofa.jpg"));
});

const photo: Asset = { id: "sofa", kind: "image", path: "sofa.jpg", provenance: { source: "import" }, subjects: [{ id: "face-2", label: "Lily", kind: "face", samples: [[0, 0.7, 0.25, 0.2, 0.3]] }] };
const project = (cast: CastMember[], assets: Asset[] = [photo]) => ({ sources: [{ id: "photos", path: join(dir, "photos") }], assets, cast });

describe("a cast member's photos as references", () => {
  it("asks for a person, the animal a description names, or a prop by its name", () => {
    expect(refcut.refPrompt({ kind: "character", name: "Grandpa" })).toBe("person");
    expect(refcut.refPrompt({ kind: "character", name: "Mochi", about: "orange tabby cat, white paws" })).toBe("cat");
    expect(refcut.refPrompt({ kind: "prop", name: "the red bike" })).toBe("the red bike");
  });

  it("goes cut out and cropped to the one they were found as, once", async () => {
    const lily: CastMember = { id: "lily", name: "Lily", kind: "character", seen: [{ asset: "sofa", subject: "face-2" }] };
    const out = await refcut.refFile(project([lily]), dir, "sofa", ["lily"]);
    expect(out).toBe(join(dir, ".cache", "refcut", "sofa-lily.jpg"));
    // The one on the right (where her face was found), not the larger one on the left.
    const { width, height } = await sharp(out).metadata();
    expect([width, height]).toEqual([70, 82]);
    const { dominant } = await sharp(out).stats();
    expect(dominant.r).toBeGreaterThan(200);
    expect(await refcut.refFile(project([lily]), dir, "sofa", ["lily"])).toBe(out);
    expect(sam.asked).toEqual(["person"]);
  });

  it("goes whole when it isn't the member's own photo, the member isn't in the request, or SAM isn't here", async () => {
    const whole = join(dir, "photos", "sofa.jpg");
    const grandpa: CastMember = { id: "grandpa", name: "Grandpa", kind: "character", seen: [{ asset: "sofa" }] };
    expect(await refcut.refFile(project([grandpa]), dir, "sofa", [])).toBe(whole);
    const sheet: Asset = { ...photo, id: "sheet", provenance: { source: "generated" } };
    expect(await refcut.refFile(project([{ ...grandpa, seen: [{ asset: "sheet" }] }], [photo, sheet]), dir, "sheet", ["grandpa"])).toBe(join(dir, "photos", "sofa.jpg"));
    sam.ready = false;
    expect(await refcut.refFile(project([grandpa]), dir, "sofa", ["grandpa"])).toBe(whole);
    expect(existsSync(join(dir, ".cache", "refcut", "sofa-grandpa.jpg"))).toBe(false);
  });
});
