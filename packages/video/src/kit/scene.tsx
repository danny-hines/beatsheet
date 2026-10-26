/**
 * What a scene knows about where it is: the shot's length and the frame's size, the project's look, the narration's
 * words and the music's beats (in the shot's own seconds), and how to reach the project's files. Scenes read it with
 * useScene(); everything in the kit does too, so a title lands on a spoken word and draws in the brand's colours.
 */
import { cleanWord, type Asset, type Look } from "@beatsheet/schema";
import { createContext, useContext } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

export type SceneWord = { w: string; s: number; e: number; line: string };
export type SceneBeat = { t: number; bar: boolean };

export type SceneInfo = {
  /** When the shot starts in the cut, and how long it plays, in seconds. */
  start: number;
  duration: number;
  format: string;
  look: Look;
  /** The narration's words, timed from the shot's start (negative before it). */
  words: SceneWord[];
  /** The music's beats, timed from the shot's start. */
  beats: SceneBeat[];
  /** The project's assets by id, and a URL for each (a preview copy in the studio, the original when rendering). */
  assets: Map<string, Asset>;
  assetUrl: (id: string) => string;
  /** A URL for a file in the project's code folder, e.g. file("files/camera.stl"). */
  fileUrl: (path: string) => string;
  props: Record<string, unknown>;
};

export const SceneContext = createContext<SceneInfo | null>(null);

const fallback: SceneInfo = { start: 0, duration: 5, format: "", look: {}, words: [], beats: [], assets: new Map(), assetUrl: (id) => id, fileUrl: (p) => p, props: {} };

/**
 * Where the scene is now: `t` seconds into the shot (and `frame`), the frame's size, `u` (one unit at 1080 pixels on
 * the frame's short side, so sizes hold up in any format), and the scene's context.
 */
export function useScene() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const info = useContext(SceneContext) ?? fallback;
  return {
    ...info,
    t: frame / fps,
    frame,
    fps,
    width,
    height,
    u: Math.min(width, height) / 1080,
    vertical: height > width,
    asset: info.assetUrl,
    file: info.fileUrl,
    /** When a spoken word starts, from the shot's start (its nth occurrence in the shot, else anywhere). */
    word: (word: string, nth = 0) => wordTime(info.words, word, nth, info.duration),
    /** The nth beat (or bar) from the shot's start. */
    beat: (n: number, unit: "beat" | "bar" = "beat") => {
      const list = info.beats.filter((b) => b.t >= -1e-3 && (unit === "beat" || b.bar));
      return list[Math.max(0, Math.floor(n))]?.t;
    },
  };
}

export type Scene = ReturnType<typeof useScene>;

export function wordTime(words: SceneWord[], word: string, nth = 0, duration = Infinity): number | undefined {
  const target = cleanWord(word);
  const within = words.filter((w) => cleanWord(w.w) === target && w.s >= -0.05 && w.s < duration);
  const any = words.filter((w) => cleanWord(w.w) === target);
  return (within[nth] ?? any[nth])?.s;
}

/** A moment in a scene: seconds into the shot, or a spoken word ("chunky"), or "word#2" for its third time. */
export type At = number | string;

/** Seconds into the shot for `at`; `fallback` when it's not given or the word isn't spoken. */
export function useAt(at: At | undefined, fallbackAt = 0): number {
  const s = useScene();
  if (at === undefined) return fallbackAt;
  if (typeof at === "number") return at;
  const [w, n] = at.split("#");
  return s.word(w!, n ? Number(n) : 0) ?? fallbackAt;
}

// ---- Easing and timing

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ease = {
  linear: (x: number) => x,
  in: (x: number) => x * x * x,
  out: (x: number) => 1 - Math.pow(1 - x, 3),
  inOut: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  /** Overshoots a little and settles: things that land. */
  back: (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2),
  expo: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
};

/** 0 → 1 over `dur` seconds from `at`, eased. */
export const prog = (t: number, at: number, dur: number, e: (x: number) => number = ease.out) => e(clamp01((t - at) / Math.max(1e-4, dur)));

/** A damped spring from 0 to 1 starting at `at`: lively, settles by about 0.8s. */
export function springAt(t: number, at: number, opts: { stiffness?: number; damping?: number } = {}) {
  const x = t - at;
  if (x <= 0) return 0;
  const k = opts.stiffness ?? 170, c = opts.damping ?? 14;
  const w = Math.sqrt(k), z = c / (2 * w);
  if (z >= 1) return 1 - Math.exp(-w * x) * (1 + w * x);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
}

/** A camera-shake offset in pixels that hits at `at` and dies away. */
export function shakeAt(t: number, at: number, amount = 14, decay = 9) {
  const x = t - at;
  if (x < 0 || x > 1) return { x: 0, y: 0 };
  const k = amount * Math.exp(-decay * x);
  return { x: k * Math.sin(x * 83), y: k * Math.cos(x * 71) };
}

/** What a project without a look draws in: near-white, near-black and one plain blue. */
export const NEUTRAL = { paper: "#f6f6f4", ink: "#141414", accent: "#2563eb", accent2: "#6b7280", accent3: "#e5484d" };

/** A repeatable pseudo-random number in 0..1 for a seed: scatter that doesn't change between frames. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// ---- The look, with sensible fallbacks

export function useLook() {
  const { look, u } = useScene();
  const c = look.colors ?? {};
  // Without a look of its own a project draws in plain neutrals, never another brand's colours; review_cut says so.
  return {
    paper: c.paper ?? c.background ?? NEUTRAL.paper,
    ink: c.ink ?? c.text ?? NEUTRAL.ink,
    accent: c.accent ?? c.primary ?? NEUTRAL.accent,
    accent2: c.accent2 ?? c.secondary ?? c.violet ?? NEUTRAL.accent2,
    accent3: c.accent3 ?? c.coral ?? NEUTRAL.accent3,
    color: (name: string | undefined, or: string) => (name ? (c[name] ?? name) : or),
    display: look.fonts?.display ?? "Helvetica Neue, Arial, sans-serif",
    /** Big type's weight: the look's, else bold (a heavy face like Arial Black is heavy whatever it's asked for). */
    displayWeight: look.fonts?.displayWeight ?? 700,
    /** Whether big type is set in capitals: yes, unless the look's display face reads better as written. */
    caps: look.fonts?.caps ?? true,
    body: look.fonts?.body ?? "Helvetica Neue, Arial, sans-serif",
    mono: look.fonts?.mono ?? "SF Mono, Menlo, ui-monospace, monospace",
    u,
  };
}
