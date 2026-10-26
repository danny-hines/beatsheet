import { describe, expect, it } from "vitest";
import { centreOn, cover, subjectAt, subjectFocus } from "../src/index.ts";

const track = {
  samples: [
    [1, 0.1, 0.2, 0.2, 0.2],
    [2, 0.3, 0.2, 0.2, 0.2],
    [5, 0.7, 0.4, 0.2, 0.2],
  ],
};

describe("subjectAt", () => {
  it("interpolates between samples", () => {
    expect(subjectAt(track, 1.5)!.x).toBeCloseTo(0.2);
  });
  it("is off screen well outside its samples", () => {
    expect(subjectAt(track, 0.5)).toBeUndefined();
    expect(subjectAt(track, 5.5)).toBeUndefined();
    expect(subjectAt(track, 0.8)!.x).toBeCloseTo(0.1);
  });
  it("treats a long gap as lost rather than gliding across it", () => {
    expect(subjectAt(track, 3.5)).toBeUndefined();
    expect(subjectAt(track, 2.2)!.x).toBeCloseTo(0.3 + 0.4 * (0.2 / 3));
  });
  it("holds a photo's single sample forever", () => {
    expect(subjectAt({ samples: [[0, 0.5, 0.5, 0.1, 0.1]] }, 12)!.x).toBe(0.5);
  });
  it("averages the focus over a second", () => {
    expect(subjectFocus(track, 1.5)!.x).toBeCloseTo(0.3);
  });
});

describe("cover", () => {
  // A landscape 1920x1080 clip in a 1080x1920 vertical frame: scaled by 1920/1080, 3413 wide.
  const src = { width: 1920, height: 1080 }, out = { width: 1080, height: 1920 };
  it("maps the source centre to the frame centre when centred", () => {
    const p = cover(src, out, { x: 0.5, y: 0.5 }).point(0.5, 0.5);
    expect(p.x).toBeCloseTo(540);
    expect(p.y).toBeCloseTo(960);
  });
  it("follows object-position", () => {
    expect(cover(src, out, { x: 0, y: 0.5 }).point(0, 0.5).x).toBeCloseTo(0);
    expect(cover(src, out, { x: 1, y: 0.5 }).point(1, 0.5).x).toBeCloseTo(1080);
  });
  it("zooms about the object-position point", () => {
    const c = cover(src, out, { x: 0.5, y: 0.5 }, 2);
    expect(c.point(0.5, 0.5).x).toBeCloseTo(540);
    expect(c.rect({ x: 0.45, y: 0.45, w: 0.1, h: 0.1 }).w).toBeCloseTo(0.1 * 3413.33 * 2, 0);
  });
  it("centres on a subject as far as the crop allows", () => {
    const pos = centreOn(src, out, { x: 0.3, y: 0.5 });
    expect(cover(src, out, pos).point(0.3, 0.5).x).toBeCloseTo(540);
    expect(centreOn(src, out, { x: 0.02, y: 0.5 }).x).toBe(0);
    expect(centreOn(src, out, { x: 0.3, y: 0.9 }).y).toBe(0.5);
  });
});
