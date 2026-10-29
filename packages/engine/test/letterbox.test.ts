import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { blackBars, unletterbox } from "../src/letterbox.ts";

const dir = mkdtempSync(join(tmpdir(), "beatsheet-letterbox-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A 90×160 picture: a band of color between black bars of `bar` rows, or a dark scene with no bars at all. */
async function picture(name: string, bar: number, color = { r: 200, g: 120, b: 40 }): Promise<string> {
  const file = join(dir, name);
  const band = await sharp({ create: { width: 90, height: 160 - 2 * bar, channels: 3, background: color } }).png().toBuffer();
  await sharp({ create: { width: 90, height: 160, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: band, top: bar, left: 0 }])
    .jpeg({ quality: 95 })
    .toFile(file);
  return file;
}

describe("taking letterbox bars off a still", () => {
  it("finds the black rows above and below the picture", async () => {
    const b = await blackBars(await picture("bars.jpg", 20));
    expect(b.width).toBe(90);
    expect(b.height).toBe(160);
    expect(Math.abs(b.top - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(b.bottom - 20)).toBeLessThanOrEqual(1);
    expect(b.left + b.right).toBe(0);
  });

  it("fills the frame with the picture again, at the same size, with no black left at the edges", async () => {
    const file = await picture("fill.jpg", 24);
    expect(await unletterbox(file)).toBeTruthy();
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height]).toEqual([90, 160]);
    const after = await blackBars(file);
    expect(after.top + after.bottom).toBe(0);
  });

  it("leaves a dark picture with no bars alone", async () => {
    const file = await picture("night.jpg", 0, { r: 20, g: 22, b: 30 });
    expect(await unletterbox(file)).toBeUndefined();
  });
});
