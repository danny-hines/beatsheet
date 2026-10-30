/**
 * Old footage at its best without making anything new: its voices cleaned of hiss, wind and hum, and its picture
 * restored (less noise, a steadier camera, more detail, smoother motion). Like transcribing, each step runs on the
 * computer when it can (free, and nothing leaves it) or by a service with the person's key, whichever suits the
 * machine: a PC with a graphics card upscales here, a thin laptop sends it out. Pure, so the studio and the agent's
 * tools give the same answer.
 */

export type FixerJob = "clean" | "upscale" | "frames";

export type Fixer = {
  id: string;
  label: string;
  by: string;
  /** One line on what it's for. */
  note: string;
  does: FixerJob;
  /** On this computer, or a service. */
  runs: "here" | "service";
  /** What it needs: an install ("deepfilter") or a service's key ("elevenlabs"). */
  needs: string;
  /** US dollars a minute of sound, for a sound cleaner. */
  perMinute?: number;
  /** US dollars a megapixel of picture made (width × height × frames), for an upscaler. */
  perMegapixel?: number;
};

export const FIXERS: Fixer[] = [
  {
    id: "deepfilter",
    label: "DeepFilterNet",
    by: "run on this computer",
    note: "Free, and the sound never leaves this computer. Runs on the processor of any computer, many times faster than the clip plays.",
    does: "clean",
    runs: "here",
    needs: "deepfilter",
  },
  {
    id: "isolator",
    label: "Voice Isolator",
    by: "ElevenLabs",
    note: "Takes out everything but the voices, music included. Uses your ElevenLabs credits.",
    does: "clean",
    runs: "service",
    needs: "elevenlabs",
    // elevenlabs.io/pricing/api: Voice Isolator, $0.12 a minute.
    perMinute: 0.12,
  },
  {
    id: "realesrgan",
    label: "Real-ESRGAN",
    by: "run on this computer",
    note: "Free. Sharpens and upscales each frame on the graphics card (NVIDIA, AMD, Intel or Apple); slow without one.",
    does: "upscale",
    runs: "here",
    needs: "realesrgan",
  },
  {
    id: "seedvr",
    label: "SeedVR2",
    by: "ByteDance, on fal",
    note: "Restores as it upscales, frames together rather than one at a time, so detail holds still. Priced by the picture it makes.",
    does: "upscale",
    runs: "service",
    needs: "fal",
    // fal.ai/models/fal-ai/seedvr/upscale/video: $0.001 a megapixel of video made.
    perMegapixel: 0.001,
  },
  {
    id: "rife",
    label: "RIFE",
    by: "run on this computer",
    note: "Free. Makes the frames in between, for smoother motion from jerky or low frame-rate video, on the graphics card.",
    does: "frames",
    runs: "here",
    needs: "rife",
  },
];

/**
 * Whether a fixer can be used on this machine now. `speed` is seconds of work for a second of sound (a cleaner) or
 * for a megapixel of picture it takes in (an upscaler, or making frames), measured here when it was set up.
 */
export type FixerState =
  | { state: "ready"; speed?: number; where?: string }
  | { state: "install"; detail: string }
  | { state: "key"; detail: string }
  | { state: "unfit"; detail: string };

export type FixerChoice = {
  id: string;
  label: string;
  ok: boolean;
  /** Why it can't be used now, and what would let it. */
  why?: string;
  kind?: "install" | "key" | "unfit";
  where?: string;
  /** For the clip asked about: about how long (seconds) and what it would cost (US dollars). */
  seconds?: number;
  usd?: number;
};

/** A clip, or the stretch of one, to fix: how long it is and its picture. */
export type FixAsk = { seconds: number; width?: number; height?: number; fps?: number; upscale?: number };

/** Megapixels of picture a stretch has (in) and an upscaler would make (out): width × height × frames. */
export function megapixels(ask: FixAsk): { in: number; out: number } {
  const frames = ask.seconds * (ask.fps ?? 30);
  const inMp = ((ask.width ?? 640) * (ask.height ?? 480) * frames) / 1e6;
  return { in: inMp, out: inMp * (ask.upscale ?? 2) ** 2 };
}

/** On this computer, a cleaner slower than a quarter of the clip's length, or a picture step slower than ten times it, is slow enough that a service is the better pick. */
export const SLOW_SOUND = 0.25;
export const SLOW_PICTURE = 10;

/**
 * The fixers that do one job for a clip, with Auto first: the person's own order when they've set one; otherwise the
 * one here when this machine is quick at it, then the services cheapest first, then the one here even though it's slow.
 */
export function chooseFixer(
  does: FixerJob,
  states: Record<string, FixerState>,
  ask: FixAsk,
  ranking: string[] = [],
  catalog: Fixer[] = FIXERS,
): { auto?: FixerChoice; ready: FixerChoice[]; setup: FixerChoice[] } {
  const mp = megapixels(ask);
  const costOf = (f: Fixer) =>
    f.perMinute !== undefined ? Math.round((ask.seconds / 60) * f.perMinute * 1000) / 1000 : f.perMegapixel !== undefined ? Math.round(mp.out * f.perMegapixel * 1000) / 1000 : undefined;
  const workOf = (f: Fixer, speed?: number) => (speed === undefined ? undefined : Math.round(f.does === "clean" ? ask.seconds * speed : mp.in * speed));
  const all = catalog
    .filter((f) => f.does === does)
    .map((f): FixerChoice => {
      const s = states[f.id] ?? { state: "unfit", detail: "Not available here" };
      const base = { id: f.id, label: f.label };
      if (s.state !== "ready") return { ...base, ok: false, kind: s.state, why: s.detail };
      const seconds = workOf(f, s.speed);
      const usd = costOf(f);
      return { ...base, ok: true, ...(s.where ? { where: s.where } : {}), ...(seconds !== undefined ? { seconds } : {}), ...(usd !== undefined ? { usd } : {}) };
    });
  const rankOf = (c: FixerChoice) => {
    const i = ranking.indexOf(c.id);
    if (i !== -1) return i;
    const f = catalog.find((x) => x.id === c.id)!;
    const slow = f.runs === "here" && c.seconds !== undefined && c.seconds > ask.seconds * (does === "clean" ? SLOW_SOUND : SLOW_PICTURE);
    return ranking.length + (f.runs === "here" ? (slow ? 2000 : 0) : 1000 + (c.usd ?? 0));
  };
  const ready = all.filter((c) => c.ok).sort((a, b) => rankOf(a) - rankOf(b));
  return { auto: ready[0], ready, setup: all.filter((c) => !c.ok) };
}

/** Light cleaning keeps this much of what was taken out (about 12 dB down), so a room still sounds like a room. */
export const LIGHT_KEEP = 0.25;

/**
 * The stretches where people talk, from a transcript's words: words closer than `join` seconds run together, and each
 * stretch starts `before` seconds ahead of its first word and ends `after` past its last, so a breath and the tail of
 * a word are cleaned with it.
 */
export function speechSpans(words: { s: number; e: number }[], opts: { join?: number; before?: number; after?: number } = {}): [number, number][] {
  const join = opts.join ?? 0.8, before = opts.before ?? 0.2, after = opts.after ?? 0.3;
  const sorted = [...words].filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e)).sort((a, b) => a.s - b.s);
  const spans: [number, number][] = [];
  for (const w of sorted) {
    const last = spans[spans.length - 1];
    if (last && w.s - before <= last[1] + join) last[1] = Math.max(last[1], w.e + after);
    else spans.push([Math.max(0, w.s - before), w.e + after]);
  }
  return spans;
}

/**
 * How much of the cleaned sound to use through a clip, `rate` times a second: 1 inside the spans, 0 outside, easing
 * in and out over `ramp` seconds at each span's edges so the change isn't heard. No spans means everywhere.
 */
export function cleanCurve(spans: [number, number][] | undefined, seconds: number, rate = 100, ramp = 0.08): Float32Array {
  const n = Math.max(1, Math.ceil(seconds * rate) + 1);
  const out = new Float32Array(n);
  if (!spans) return out.fill(1);
  for (const [s, e] of spans) {
    const from = Math.max(0, Math.floor((s - ramp) * rate)), to = Math.min(n - 1, Math.ceil((e + ramp) * rate));
    for (let i = from; i <= to; i++) {
      const t = i / rate;
      const g = t < s ? 1 - (s - t) / ramp : t > e ? 1 - (t - e) / ramp : 1;
      out[i] = Math.max(out[i]!, Math.min(1, Math.max(0, g)));
    }
  }
  return out;
}

/** How a stretch of clip is restored. Every step is optional; the ones asked for run in this order. */
export type RestoreSteps = {
  /** Less tape noise and grain. */
  denoise?: "light" | "strong";
  /** The camera steadied, each shot on its own (a cut starts it over). */
  steady?: boolean;
  /** Bigger: 2 or 4 times as wide and tall. */
  upscale?: 2 | 4;
  /** More frames: this many a second, made in between the ones there are (at most twice as many). */
  fps?: number;
};

/** What a restore makes from a clip: its size and frame rate after the steps. */
export function restoredSize(clip: { width?: number; height?: number; fps?: number }, steps: RestoreSteps): { width?: number; height?: number; fps?: number } {
  const k = steps.upscale ?? 1;
  const even = (n: number) => Math.round(n / 2) * 2;
  const fps = steps.fps && clip.fps && steps.fps > clip.fps ? Math.min(steps.fps, clip.fps * 2) : clip.fps;
  return { width: clip.width && even(clip.width * k), height: clip.height && even(clip.height * k), fps };
}

/** "denoised, steadied, 4× bigger, 48 fps": the steps as a person reads them. */
export function restoreWords(steps: RestoreSteps): string {
  return [
    steps.denoise && (steps.denoise === "strong" ? "noise taken out" : "denoised"),
    steps.steady && "steadied",
    steps.upscale && `${steps.upscale}× bigger`,
    steps.fps && `${steps.fps} fps`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The version of a clip a shot shows, when it has one that covers the stretch it plays (with a little to spare):
 * where to start in the version's own file. Otherwise the clip itself plays.
 */
export function versionAt(version: { duration?: number; version?: { of: string; from: number } } | undefined, clip: string, sourceIn: number, sourceOut: number): number | undefined {
  const v = version?.version;
  if (!v || v.of !== clip) return undefined;
  const end = v.from + (version!.duration ?? Infinity);
  return sourceIn >= v.from - 0.05 && sourceOut <= end + 0.5 ? Math.max(0, sourceIn - v.from) : undefined;
}
