/**
 * Multicam: lining several cameras' recordings of one event up by their sound, and working out which camera hears
 * each speaker best. Their sound is reduced to a loudness envelope (500 a second) and cross-correlated (by FFT) against
 * the first camera's; the peak is how far apart they started.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { anglesOf, slugify, speakerAngles, type Asset } from "@beatsheet/schema";
import { makePeaks } from "./media.ts";
import { assetPath, cachePaths } from "./paths.ts";
import { loadProject, updateFile } from "./store.ts";
import { readTranscript } from "./transcribe.ts";

const RATE = 500;

/** How loud a file is, RATE times a second, with its slow swells taken out so the onsets of words and claps stand out. */
export async function envelope(file: string): Promise<Float64Array> {
  const sr = 8000, per = sr / RATE;
  const raw: number[] = [];
  let sum = 0, n = 0, odd: number | undefined;
  await new Promise<void>((done, fail) => {
    const p = spawn("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", String(sr), "-f", "s16le", "-"]);
    const take = (v: number) => {
      sum += Math.abs(v);
      if (++n >= per) {
        raw.push(sum / n);
        sum = 0;
        n = 0;
      }
    };
    p.stdout.on("data", (chunk: Buffer) => {
      let i = 0;
      if (odd !== undefined) {
        take((((chunk[0]! << 8) | odd) << 16) >> 16);
        odd = undefined;
        i = 1;
      }
      for (; i + 1 < chunk.length; i += 2) take(chunk.readInt16LE(i));
      if (i < chunk.length) odd = chunk[i];
    });
    p.on("error", fail);
    p.on("close", () => done());
  });
  // Less a moving average (a quarter second), so it's the changes that line up, not how loud each camera is overall.
  const w = Math.round(RATE / 4);
  const out = new Float64Array(raw.length);
  let acc = 0;
  for (let i = 0; i < raw.length; i++) {
    acc += raw[i]!;
    if (i >= w) acc -= raw[i - w]!;
    out[i] = raw[i]! - acc / Math.min(i + 1, w);
  }
  return out;
}

/** An in-place radix-2 FFT (length a power of two); `invert` for the inverse, unscaled. */
function fft(re: Float64Array, im: Float64Array, invert: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b]! * cr - im[b]! * ci, xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/**
 * How many seconds after `ref` started `other` did (negative: before), and how sure: the best match against the next
 * best that isn't right beside it (3 and up is clear).
 */
export function lagOf(ref: Float64Array, other: Float64Array, rate = RATE): { seconds: number; confidence: number } {
  let n = 1;
  while (n < ref.length + other.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(ref);
  br.set(other);
  fft(ar, ai, false);
  fft(br, bi, false);
  // ref times the conjugate of other: c[k] = Σ ref[i + k] · other[i].
  for (let i = 0; i < n; i++) {
    const r = ar[i]! * br[i]! + ai[i]! * bi[i]!;
    const im = ai[i]! * br[i]! - ar[i]! * bi[i]!;
    ar[i] = r;
    ai[i] = im;
  }
  fft(ar, ai, true);
  const lagAt = (k: number) => (k < n / 2 ? k : k - n);
  let best = 0, bestV = -Infinity;
  for (let k = 0; k < n; k++) {
    const lag = lagAt(k);
    if (lag > ref.length - 1 || lag < -(other.length - 1)) continue;
    if (ar[k]! > bestV) (bestV = ar[k]!), (best = k);
  }
  const apart = Math.round(rate * 0.25);
  let second = 0;
  for (let k = 0; k < n; k++) {
    const lag = lagAt(k);
    if (lag > ref.length - 1 || lag < -(other.length - 1) || Math.abs(lag - lagAt(best)) < apart) continue;
    if (ar[k]! > second) second = ar[k]!;
  }
  return { seconds: lagAt(best) / rate, confidence: second > 0 ? bestV / second : Infinity };
}

/**
 * Lines up recordings of one event from several cameras (by their sound) into one group, so shots can switch between
 * them in step: each gets `angle: { group, offset }`, the earliest starting at 0. A recording that won't line up
 * (no sound in common) is left out and said.
 */
export async function syncAngles(projectId: string, assetIds: string[], onProgress?: (f: number) => void): Promise<{ group: string; angles: { asset: string; offset: number; confidence: number }[]; left: { asset: string; why: string }[] }> {
  const { project, dir } = loadProject(projectId);
  const assets = assetIds.map((id) => {
    const a = project.assets.find((x) => x.id === id);
    if (!a) throw new Error(`No asset "${id}"`);
    if (a.kind !== "video" && a.kind !== "audio") throw new Error(`"${a.label ?? id}" has no sound to line up by`);
    return a;
  });
  if (assets.length < 2) throw new Error("It takes two or more recordings to line up");
  const envs: Float64Array[] = [];
  for (const [k, a] of assets.entries()) {
    envs.push(await envelope(assetPath(project, dir, a)));
    onProgress?.((k + 1) / (assets.length + 1));
  }
  const found = assets.map((a, k) => ({ asset: a.id, ...(k ? lagOf(envs[0]!, envs[k]!) : { seconds: 0, confidence: Infinity }) }));
  const kept = found.filter((f) => f.confidence >= 1.5);
  const left = found.filter((f) => f.confidence < 1.5).map((f) => ({ asset: f.asset, why: "its sound doesn't match the first recording's anywhere clearly" }));
  // Group time starts with whichever began first.
  const first = Math.min(...kept.map((f) => f.seconds));
  const existing = assets.find((a) => a.angle)?.angle?.group;
  let group = existing ?? slugify(assets[0]!.label ?? "angles").slice(0, 24) ?? "angles";
  if (!existing) {
    const taken = new Set(project.assets.map((a) => a.angle?.group).filter(Boolean));
    for (let n = 2; taken.has(group); n++) group = `${group.replace(/-\d+$/, "")}-${n}`;
  }
  const angles = kept.map((f) => ({ asset: f.asset, offset: Math.round((f.seconds - first) * 1000) / 1000, confidence: Math.round(Math.min(99, f.confidence) * 10) / 10 }));
  updateFile(projectId, (d) => {
    for (const x of angles) {
      const a = d.assets.find((y) => y.id === x.asset);
      if (a) a.angle = { group, offset: x.offset };
    }
  });
  onProgress?.(1);
  return { group, angles, left };
}

/**
 * Which angle has each speaker in a group, by which camera hears them loudest (see speakerAngles), and the words
 * that decides it by: the transcript of the group's angle with the most words (its speakers, one name each).
 */
export async function speakersOfGroup(projectId: string, group: string): Promise<{ master?: string; words: { w: string; s: number; e: number; speaker?: string }[]; angles: Record<string, string> }> {
  const { project, dir } = loadProject(projectId);
  const angles = anglesOf(project, group);
  const transcribed = angles.filter((a) => a.transcript).sort((a, b) => (b.transcript!.words ?? 0) - (a.transcript!.words ?? 0));
  const master = transcribed[0];
  if (!master) return { words: [], angles: {} };
  const words = readTranscript(projectId, master.id)?.words ?? [];
  const peaks = new Map<string, { rate: number; data: Buffer }>();
  for (const a of angles) {
    const out = cachePaths(dir, a.id).peaks;
    if (a.cleaned || !existsSync(out)) await makePeaks(assetPath(project, dir, a), a.cleaned ? out.replace(/\.json$/, "-own.json") : out);
    const file = a.cleaned ? out.replace(/\.json$/, "-own.json") : out;
    const j = JSON.parse(readFileSync(file, "utf8")) as { rate: number; peaks: string };
    peaks.set(a.id, { rate: j.rate, data: Buffer.from(j.peaks, "base64") });
  }
  const loudness = (asset: string, t0: number, t1: number) => {
    const p = peaks.get(asset);
    if (!p) return undefined;
    const a = Math.max(0, Math.floor(t0 * p.rate)), b = Math.min(p.data.length, Math.ceil(t1 * p.rate));
    if (b <= a) return undefined;
    let sum = 0;
    for (let i = a; i < b; i++) sum += p.data[i]!;
    return sum / (b - a);
  };
  const off = master.angle?.offset ?? 0;
  const inGroup = words.map((w) => ({ ...w, s: w.s + off, e: w.e + off }));
  return { master: master.id, words, angles: speakerAngles(inGroup, angles, loudness) };
}


/**
 * How loud each clip shot in a cut plays what's said (integrated loudness, EBU R128, of the stretch of its sound it
 * plays), and the volume that brings each to the others' middle: so a quiet interview answer and a loud question
 * sit together. Shots with nothing much to hear are left alone.
 */
export async function evenOut(projectId: string, cut?: string): Promise<{ shot: string; lufs: number; volume: number }[]> {
  const { project, dir } = loadProject(projectId, cut);
  const { resolveTimeline } = await import("@beatsheet/schema");
  const { soundFile } = await import("./clean.ts");
  const tl = resolveTimeline(project);
  const measured: { shot: string; lufs: number }[] = [];
  for (const r of tl.shots) {
    const s = project.shots.find((x) => x.id === r.id);
    const c = s?.content;
    if (c?.kind !== "clip" || c.volume === 0 || c.freeze || !Number.isFinite(r.start)) continue;
    const a = project.assets.find((x) => x.id === c.asset);
    if (!a || a.kind !== "video" || a.cutout) continue;
    const from = r.sourceIn ?? c.in ?? 0, seconds = (r.end - r.start) * (c.speed ?? 1);
    if (seconds < 0.4) continue;
    const lufs = await loudness(soundFile(project, dir, a), from, seconds);
    if (lufs !== undefined && lufs > -50) measured.push({ shot: r.id, lufs });
  }
  if (!measured.length) return [];
  const sorted = measured.map((m) => m.lufs).sort((x, y) => x - y);
  const middle = sorted[Math.floor(sorted.length / 2)]!;
  return measured.map((m) => ({ ...m, volume: Math.round(Math.min(4, Math.max(0.25, Math.pow(10, (middle - m.lufs) / 20))) * 100) / 100 }));
}

/** A stretch of a file's integrated loudness in LUFS (EBU R128), or nothing when it can't be measured. */
function loudness(file: string, from: number, seconds: number): Promise<number | undefined> {
  return new Promise((done) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(from), "-t", String(seconds), "-i", file, "-vn", "-af", "ebur128", "-f", "null", "-"]);
    let err = "";
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", () => done(undefined));
    p.on("close", () => {
      // The summary at the end: "I: -23.4 LUFS".
      const m = [...err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1);
      done(m ? Number(m[1]) : undefined);
    });
  });
}
