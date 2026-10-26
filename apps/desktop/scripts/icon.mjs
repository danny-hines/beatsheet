// beatsheet's icon: beat bars on a warm square, drawn here so there's nothing to download. The Mac's app build makes
// an .icns of it; on Windows the build makes an .ico, and the window shows a PNG of it.
import { writeFileSync } from "node:fs";
import sharp from "sharp";

export const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2210"/><stop offset="1" stop-color="#121317"/></linearGradient></defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="none" stroke="#f2b544" stroke-opacity="0.35" stroke-width="8"/>
  ${[0.35, 0.6, 0.85, 0.5, 0.95, 0.65, 0.4]
    .map((h, i) => {
      const w = 64;
      const gap = 40;
      const x = 512 - (7 * w + 6 * gap) / 2 + i * (w + gap);
      const height = 520 * h;
      return `<rect x="${x}" y="${512 + 40 - height / 2}" width="${w}" height="${height}" rx="32" fill="${i === 4 ? "#f2b544" : "#e6e8ec"}" fill-opacity="${i === 4 ? 1 : 0.85}"/>`;
    })
    .join("\n  ")}
  <circle cx="512" cy="${512 + 40 + 300}" r="18" fill="#f2b544"/>
</svg>`;

/** A PNG of the icon, `size` pixels square. */
export const iconPng = (size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

/** A Windows .ico holding the icon at the sizes Windows asks for (PNG inside, as Vista and later read). */
export async function writeIco(file) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(sizes.map(iconPng));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size === 256 ? 0 : size, at);
    head.writeUInt8(size === 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(pngs[i].length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += pngs[i].length;
  });
  writeFileSync(file, Buffer.concat([head, ...pngs]));
}
