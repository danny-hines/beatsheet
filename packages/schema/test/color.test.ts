import { describe, expect, it } from "vitest";
import { lookColorsFrom, oklab, oklchHex, paletteOf } from "../src/color.ts";

/** Pixels in the given proportions, as RGB triples. */
function pixels(parts: [number, [number, number, number]][]): Uint8Array {
  const total = 10000;
  const out: number[] = [];
  for (const [share, rgb] of parts) for (let i = 0; i < Math.round(share * total); i++) out.push(...rgb);
  return new Uint8Array(out);
}
const hueOf = (hex: string) => {
  const [, a, b] = oklab(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]));
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};
const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("a palette from footage", () => {
  // An overcast beach: grey sky, wet sand, dark rocks, and one red bucket.
  const beach = pixels([
    [0.45, [200, 208, 214]],
    [0.35, [128, 124, 112]],
    [0.17, [40, 42, 46]],
    [0.03, [210, 40, 30]],
  ]);

  it("finds its colours by area, and the small vivid ones too", () => {
    const p = paletteOf(beach);
    expect(p.swatches[0]!.share).toBeCloseTo(0.45, 1);
    expect(p.swatches.map((s) => s.share).reduce((a, b) => a + b)).toBeCloseTo(1, 5);
    expect(p.vivid).toHaveLength(1);
    expect(p.vivid[0]!.share).toBeCloseTo(0.03, 2);
    expect(p.mood.colour).toBeLessThan(0.05);
  });

  it("suggests paper and ink from its light and dark tones, and the accent from what's vivid in it", () => {
    const c = lookColorsFrom(paletteOf(beach));
    expect(oklab(...([1, 3, 5].map((i) => parseInt(c.paper.slice(i, i + 2), 16)) as [number, number, number]))[0]).toBeGreaterThan(0.93);
    expect(oklab(...([1, 3, 5].map((i) => parseInt(c.ink.slice(i, i + 2), 16)) as [number, number, number]))[0]).toBeLessThan(0.25);
    expect(gap(hueOf(c.accent), hueOf("#d2281e"))).toBeLessThan(10);
  });

  it("gives footage with nothing vivid three different accents around its own hue", () => {
    const grey = pixels([
      [0.6, [190, 200, 210]],
      [0.4, [70, 76, 84]],
    ]);
    const c = lookColorsFrom(paletteOf(grey));
    const hues = [c.accent, c.accent2, c.accent3].map(hueOf);
    expect(gap(hues[0]!, hueOf("#bec8d2"))).toBeLessThan(25);
    expect(gap(hues[0]!, hues[1]!)).toBeGreaterThan(40);
    expect(gap(hues[1]!, hues[2]!)).toBeGreaterThan(40);
    expect(gap(hues[0]!, hues[2]!)).toBeGreaterThan(40);
  });

  it("keeps colours it lifts inside sRGB", () => {
    expect(oklchHex(0.7, 0.4, 145)).toMatch(/^#[0-9a-f]{6}$/);
    expect(oklchHex(1, 0, 0)).toBe("#ffffff");
  });
});
