import { describe, expect, it } from "vitest";
import { zoomAnchor, zoomScrollLeft } from "../src/zoom.ts";

describe("timeline zoom anchor", () => {
  it("keeps a visible playhead at the same relative position in the viewport when zooming in or out", () => {
    const viewW = 800;
    const playhead = 20;
    const oldZ = 10;
    const oldScroll = 100; // viewport shows 10s..90s; playhead at 20s is 100px from left (12.5%)

    const anchor = zoomAnchor(oldScroll, viewW, oldZ, playhead)!;
    expect(anchor).toEqual({ t: 20, at: 0.125 });

    const newZIn = oldZ * 1.5;
    const scrollIn = zoomScrollLeft(anchor, newZIn, viewW);
    expect(scrollIn).toBe(200);
    expect((playhead * newZIn - scrollIn) / viewW).toBeCloseTo(0.125);

    const newZOut = oldZ / 1.5;
    const scrollOut = zoomScrollLeft(anchor, newZOut, viewW);
    expect((playhead * newZOut - scrollOut) / viewW).toBeCloseTo(0.125);
  });

  it("keeps the playhead pinned at the left or right edge of the viewport", () => {
    const viewW = 800;
    // Playhead at t = 0 with scrollLeft = 0 stays at the left edge instead of being pushed out of view.
    const atStart = zoomAnchor(0, viewW, 10, 0)!;
    expect(atStart).toEqual({ t: 0, at: 0 });
    expect(zoomScrollLeft(atStart, 40, viewW)).toBe(0);

    // Playhead right at the right edge of the viewport stays at the right edge.
    const atRight = zoomAnchor(100, viewW, 10, 90)!;
    expect(atRight).toEqual({ t: 90, at: 1 });
    expect(zoomScrollLeft(atRight, 20, viewW)).toBe(1000);
  });

  it("tolerates 1px edge rounding for the 2px playhead line and clamps the relative position", () => {
    const viewW = 800;
    // 0.5px past the left edge due to integer scrollLeft rounding
    expect(zoomAnchor(200, viewW, 10, 19.95)).toEqual({ t: 19.95, at: 0 });
    // 0.5px past the right edge
    expect(zoomAnchor(100, viewW, 10, 90.05)).toEqual({ t: 90.05, at: 1 });
  });

  it("falls back to the middle of the viewport when the playhead is scrolled out of view", () => {
    const viewW = 800;
    // Viewport covers 30s..50s (centre 40s), playhead is off-screen to the left at 5s.
    const left = zoomAnchor(1200, viewW, 40, 5)!;
    expect(left).toEqual({ t: 40, at: 0.5 });
    expect(zoomScrollLeft(left, 60, viewW)).toBe(2000);

    // Playhead is off-screen to the right at 70s.
    const right = zoomAnchor(1200, viewW, 40, 70)!;
    expect(right).toEqual({ t: 40, at: 0.5 });
  });

  it("clamps scrollLeft at 0 when zooming out near the start of the timeline", () => {
    const viewW = 800;
    const anchor = zoomAnchor(0, viewW, 20, 5)!; // px = 100, at = 0.125
    expect(zoomScrollLeft(anchor, 10, viewW)).toBe(0);
  });

  it("returns null when the viewport or scale is not positive", () => {
    expect(zoomAnchor(0, 0, 10, 5)).toBeNull();
    expect(zoomAnchor(0, 800, 0, 5)).toBeNull();
  });
});
