/**
 * Colour from footage: the palette a set of pictures is made of, and a look's colours drawn from it. Colours are
 * compared in OKLab, where distances match what people see, so a palette groups the sand, the sea and the towels rather
 * than a hundred near-identical blues.
 */

export type Swatch = {
  hex: string;
  /** How much of the picture is this colour, 0..1. */
  share: number;
  /** OKLCH: lightness 0..1, chroma (0 grey, about 0.3 at most), hue in degrees. */
  l: number;
  c: number;
  h: number;
};

export type FootageMood = {
  /** Mean lightness, 0..1. */
  light: number;
  /** Mean warmth: OKLab b, below 0 blue, above 0 yellow; 0.02 already reads warm. */
  warmth: number;
  /** Mean chroma: under 0.04 muted, over 0.08 colourful. */
  colour: number;
};

export type LookColors = { paper: string; ink: string; accent: string; accent2: string; accent3: string };

type Lab = [number, number, number];

const toLinear = (v: number) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const fromLinear = (x: number) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

export function oklab(r: number, g: number, b: number): Lab {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** Linear sRGB for an OKLab colour; may fall outside 0..1. */
function linearOf([L, a, b]: Lab): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** An OKLCH colour as hex, its chroma reduced until it fits in sRGB. */
export function oklchHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  let lo = 0, hi = c;
  let rgb = linearOf([l, c * Math.cos(rad), c * Math.sin(rad)]);
  if (!inGamut(rgb)) {
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(linearOf([l, mid * Math.cos(rad), mid * Math.sin(rad)]))) lo = mid;
      else hi = mid;
    }
    rgb = linearOf([l, lo * Math.cos(rad), lo * Math.sin(rad)]);
  }
  return `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, fromLinear(Math.min(1, Math.max(0, v)))))).toString(16).padStart(2, "0")).join("")}`;
}

const lch = ([L, a, b]: Lab) => ({ l: L, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 });
const dist2 = (p: Lab, q: Lab) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** A small deterministic generator, so the same pictures always give the same palette. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** k-means in OKLab (k-means++ seeding, a dozen rounds), with clusters too close to tell apart merged; largest first. */
function clusters(pts: Lab[], k: number): { c: Lab; n: number }[] {
  if (!pts.length) return [];
  const rand = seeded(pts.length * 7919 + k);
  const centres: Lab[] = [pts[Math.floor(rand() * pts.length)]!];
  const near = new Float64Array(pts.length).fill(Infinity);
  while (centres.length < Math.min(k, pts.length)) {
    let total = 0;
    for (const [i, p] of pts.entries()) total += near[i] = Math.min(near[i]!, dist2(p, centres.at(-1)!));
    let r = rand() * total;
    let pick = 0;
    for (; pick < pts.length - 1 && (r -= near[pick]!) > 0; pick++);
    centres.push(pts[pick]!);
  }
  const owner = new Int32Array(pts.length);
  for (let round = 0; round < 12; round++) {
    for (const [i, p] of pts.entries()) {
      let best = 0;
      for (let j = 1; j < centres.length; j++) if (dist2(p, centres[j]!) < dist2(p, centres[best]!)) best = j;
      owner[i] = best;
    }
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const [i, p] of pts.entries()) {
      const s = sum[owner[i]!]!;
      s[0]! += p[0];
      s[1]! += p[1];
      s[2]! += p[2];
      s[3]! += 1;
    }
    for (const [j, s] of sum.entries()) if (s[3]) centres[j] = [s[0]! / s[3], s[1]! / s[3], s[2]! / s[3]];
  }
  const out = centres.map((c, j) => ({ c, n: owner.reduce((m, o) => m + (o === j ? 1 : 0), 0) })).filter((x) => x.n > 0);
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!, b = out[j]!;
        if (dist2(a.c, b.c) < 0.045 ** 2) {
          const n2 = a.n + b.n;
          out[i] = { c: [(a.c[0] * a.n + b.c[0] * b.n) / n2, (a.c[1] * a.n + b.c[1] * b.n) / n2, (a.c[2] * a.n + b.c[2] * b.n) / n2], n: n2 };
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
  }
  return out.sort((a, b) => b.n - a.n);
}

export type Palette = {
  /** The colours the pictures are made of, most of them first. */
  swatches: Swatch[];
  /** The vivid colours among them, however little of the picture they cover (a red bucket on a grey beach). */
  vivid: Swatch[];
  mood: FootageMood;
};

/** The colours `pixels` (RGB triples) are made of. Pixels are sampled down to about 24k, so any number of pictures is quick. */
export function paletteOf(pixels: Uint8Array): Palette {
  const n = Math.floor(pixels.length / 3);
  const step = Math.max(1, Math.floor(n / 24000));
  const pts: Lab[] = [];
  for (let i = 0; i < n; i += step) pts.push(oklab(pixels[i * 3]!, pixels[i * 3 + 1]!, pixels[i * 3 + 2]!));
  if (!pts.length) return { swatches: [], vivid: [], mood: { light: 0, warmth: 0, colour: 0 } };
  const mood = {
    light: pts.reduce((s, p) => s + p[0], 0) / pts.length,
    warmth: pts.reduce((s, p) => s + p[2], 0) / pts.length,
    colour: pts.reduce((s, p) => s + Math.hypot(p[1], p[2]), 0) / pts.length,
  };
  const swatch = ({ c, n }: { c: Lab; n: number }) => {
    const { l, c: chroma, h } = lch(c);
    return { hex: oklchHex(l, chroma, h), share: n / pts.length, l, c: chroma, h };
  };
  return {
    swatches: clusters(pts, 8).map(swatch),
    vivid: clusters(pts.filter((p) => Math.hypot(p[1], p[2]) >= 0.05), 6).map(swatch),
    mood,
  };
}

/**
 * A look's colours from footage: paper a soft tint of its light tones, ink a deep shade of its dark ones, and accents
 * from its vivid colours (the most prominent first), lifted so they read as highlights. Footage with too few vivid
 * colours gets accents around its own hue: its complement, then a third between.
 */
export function lookColorsFrom({ swatches, vivid }: Pick<Palette, "swatches" | "vivid">): LookColors {
  const main = swatches.filter((s) => s.share >= 0.015);
  const pool = main.length ? main : swatches;
  const first = pool[0] ?? { l: 0.6, c: 0, h: 220, share: 1, hex: "#999999" };
  // The light tone with the most area and the least colour.
  const soft = (s: Swatch) => s.share * (1 - Math.min(1, s.c * 5));
  const light = pool.filter((s) => s.l >= 0.7).sort((a, b) => soft(b) - soft(a))[0] ?? first;
  const dark = [...pool].sort((a, b) => a.l - b.l)[0] ?? first;
  const picks: Swatch[] = [];
  for (const s of vivid.filter((v) => v.share >= 0.002).sort((a, b) => b.share * b.c - a.share * a.c)) if (picks.length < 3 && picks.every((p) => hueGap(p.h, s.h) >= 40)) picks.push(s);
  const hues = picks.map((p) => p.h);
  if (!hues.length) hues.push([...pool].sort((a, b) => b.c - a.c)[0]?.h ?? 220);
  for (const turn of [180, 120, 240, 60, 300]) if (hues.length < 3 && hues.every((h) => hueGap(h, (hues[0]! + turn) % 360) >= 45)) hues.push((hues[0]! + turn) % 360);
  const accent = (h: number, l: number) => {
    const s = picks.find((x) => x.h === h);
    return oklchHex(Math.min(0.76, Math.max(0.56, s?.l ?? l)), Math.max(0.12, s?.c ?? 0.13), h);
  };
  return {
    paper: oklchHex(Math.max(0.94, light.l), Math.min(light.c, 0.025), light.h),
    ink: oklchHex(0.21, Math.min(dark.c, 0.03), dark.h),
    accent: accent(hues[0]!, 0.68),
    accent2: accent(hues[1]!, 0.62),
    accent3: accent(hues[2]!, 0.7),
  };
}
