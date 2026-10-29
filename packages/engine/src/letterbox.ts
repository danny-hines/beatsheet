/**
 * Image models sometimes letterbox a picture: the shot in a band, with black above and below. A board like that makes
 * a clip with the bars in it (the video model animates them too), so they're taken off when a still comes in: the rows
 * and columns of pure black at the edges are found, and the picture between them fills the frame again, at the same
 * size, losing a little off the sides. Only pure black counts, so a dark night sky stays where it is.
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

export type Bars = { top: number; bottom: number; left: number; right: number; width: number; height: number };

/** How dark a pixel can be and still be part of a bar, and how much of a row must be that dark. */
const BLACK = 12;
const COVER = 0.995;

/** The rows of black at the top and bottom of a picture, and the columns at its sides. */
export async function blackBars(file: string): Promise<Bars> {
  // From a copy in memory: on Windows sharp keeps a file it reads open, and the file is written back to.
  const { data, info } = await sharp(readFileSync(file)).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x: number, y: number) => data[(y * width + x) * channels]!;
  const row = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x++) if (at(x, y) <= BLACK) n++;
    return n >= width * COVER;
  };
  const col = (x: number) => {
    let n = 0;
    for (let y = 0; y < height; y++) if (at(x, y) <= BLACK) n++;
    return n >= height * COVER;
  };
  let top = 0, bottom = 0, left = 0, right = 0;
  while (top < height / 2 && row(top)) top++;
  while (bottom < height / 2 - top && row(height - 1 - bottom)) bottom++;
  while (left < width / 2 && col(left)) left++;
  while (right < width / 2 - left && col(width - 1 - right)) right++;
  return { top, bottom, left, right, width, height };
}

/**
 * Takes the black bars off a still, in place and at the same size. Says what it took off, or nothing when the bars
 * were too thin to matter (under `min` of the height or width).
 */
export async function unletterbox(file: string, min = 0.02): Promise<Bars | undefined> {
  const b = await blackBars(file);
  if ((b.top + b.bottom) / b.height < min && (b.left + b.right) / b.width < min) return undefined;
  const region = { left: b.left, top: b.top, width: b.width - b.left - b.right, height: b.height - b.top - b.bottom };
  if (region.width < 16 || region.height < 16) return undefined;
  const out = await sharp(readFileSync(file)).extract(region).resize(b.width, b.height, { fit: "cover", position: "centre" }).toBuffer();
  writeFileSync(file, out);
  return b;
}
