// beatsheet's icon: a lowercase b made of a bar line and a beat, on a ruled baseline, drawn here so there's nothing to
// download. The studio draws the same mark (Mark in apps/studio/src/components/ui.tsx) with the same colours
// (--panel, --line-2, --text and --accent in its styles.css). The Mac's app build makes an .icns of it; on Windows the
// build makes an .ico, and the window shows a PNG of it.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

export const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="64" y="64" width="896" height="896" rx="200" fill="#191816"/>
  <rect x="68" y="68" width="888" height="888" rx="196" fill="none" stroke="#423e37" stroke-width="8"/>
  <path d="M192 888h640" stroke="#423e37" stroke-width="12"/>
  <rect x="304" y="208" width="112" height="608" fill="#ede8dd"/>
  <circle cx="608" cy="640" r="176" fill="#ffcb3d"/>
</svg>`;

/** A PNG of the icon, `size` pixels square. */
export const iconPng = (size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

/** The Mac's .icns of the icon, at every size macOS asks for (made with its own iconutil). */
export async function writeIcns(file) {
  const iconset = file.replace(/\.icns$/, ".iconset");
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${iconset}/icon_${size}x${size}.png`);
    await sharp(Buffer.from(svg)).resize(size * 2, size * 2).png().toFile(`${iconset}/icon_${size}x${size}@2x.png`);
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", file], { stdio: "inherit" });
  rmSync(iconset, { recursive: true, force: true });
}

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
