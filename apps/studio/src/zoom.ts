/**
 * Keeping the timeline steady while zooming: anchor on the playhead at its relative spot in the viewport when it's
 * visible, otherwise on whatever time sits at the middle of the view. Pure (no DOM), so it's tested on its own.
 */

export type ZoomAnchor = {
  /** Time on the timeline (seconds) to keep pinned in place. */
  t: number;
  /** Position across the visible viewport as a fraction of its width (0 = left edge, 0.5 = middle, 1 = right edge). */
  at: number;
};

/**
 * Picks the time and relative viewport position to hold steady across a zoom change.
 * When the playhead is visible in the viewport (allowing 1px for the 2px playhead line and subpixel scroll rounding),
 * it keeps the playhead at its current relative position; otherwise it keeps the centre of the viewport fixed.
 */
export function zoomAnchor(scrollLeft: number, viewWidth: number, z: number, playhead: number): ZoomAnchor | null {
  if (viewWidth <= 0 || z <= 0) return null;
  const px = playhead * z;
  if (px >= scrollLeft - 1 && px <= scrollLeft + viewWidth + 1) {
    const offset = Math.max(0, Math.min(viewWidth, px - scrollLeft));
    return { t: playhead, at: offset / viewWidth };
  }
  return { t: (scrollLeft + viewWidth / 2) / z, at: 0.5 };
}

/** The scrollLeft that puts `anchor.t` back at `anchor.at` of the viewport at scale `z`. */
export function zoomScrollLeft(anchor: ZoomAnchor, z: number, viewWidth: number): number {
  return Math.max(0, anchor.t * z - anchor.at * viewWidth);
}
