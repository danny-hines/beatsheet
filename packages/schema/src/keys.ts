/**
 * Values that change through a shot: its keys (scale, position, rotation, opacity, volume over time) and a speed that
 * ramps. Pure, so the player, the renderer and the studio's controls agree on every frame.
 */
import type { Key, Keyed, Shot } from "./types.ts";

const EASE: Record<string, (x: number) => number> = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  "in-out": (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  hold: () => 0,
};
export const ease = (name: string | undefined, x: number) => (EASE[name ?? "in-out"] ?? EASE["in-out"]!)(Math.min(1, Math.max(0, x)));

/** A keyed value `t` seconds into a shot: eased between the keys that give it, held before the first and after the last. */
export function keyValue(keys: Key[] | undefined, prop: Keyed, t: number, fallback: number): number {
  const ks = (keys ?? []).filter((k) => k[prop] !== undefined).sort((a, b) => a.t - b.t);
  if (!ks.length) return fallback;
  if (t <= ks[0]!.t) return ks[0]![prop]!;
  const last = ks[ks.length - 1]!;
  if (t >= last.t) return last[prop]!;
  const i = ks.findIndex((k) => k.t > t) - 1;
  const a = ks[i]!, b = ks[i + 1]!;
  const k = ease(a.ease, (t - a.t) / Math.max(1e-6, b.t - a.t));
  return a[prop]! + (b[prop]! - a[prop]!) * k;
}

/** Whether a shot has keys for a value at all. */
export const keyed = (keys: Key[] | undefined, prop: Keyed) => !!keys?.some((k) => k[prop] !== undefined);

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Sets a value at `t` seconds into a shot: on the key there (within `near` seconds, a frame or so), else a new key.
 * Without keys for that value yet, it's a value that stays put (one key at the start).
 */
export function setKey(shot: Shot, prop: Keyed, t: number, value: number, near = 0.02) {
  const keys = (shot.keys ??= []);
  const there = keys.find((k) => Math.abs(k.t - t) <= near);
  if (!keyed(keys, prop)) {
    const first = keys.find((k) => k.t === 0) ?? keys[keys.push({ t: 0 }) - 1]!;
    first[prop] = r3(value);
  } else if (there) there[prop] = r3(value);
  else keys.push({ t: r3(t), [prop]: r3(value) });
  keys.sort((a, b) => a.t - b.t);
}

/** Adds a key at `t` holding each of the values it has there now (◆), so they can move from here. */
export function addKeyAt(shot: Shot, t: number, props: readonly Keyed[], defaults: Record<Keyed, number>, near = 0.02) {
  const keys = (shot.keys ??= []);
  let k = keys.find((x) => Math.abs(x.t - t) <= near);
  if (!k) keys.push((k = { t: r3(t) }));
  for (const prop of props) if (k[prop] === undefined) k[prop] = r3(keyValue(keys.filter((x) => x !== k), prop, t, defaults[prop]));
  keys.sort((a, b) => a.t - b.t);
}

/** Takes out the key at `t` (all its values, or just `prop`), and the keys left empty. */
export function removeKey(shot: Shot, t: number, prop?: Keyed, near = 0.02) {
  if (!shot.keys) return;
  for (const k of shot.keys) if (Math.abs(k.t - t) <= near) prop ? delete k[prop] : (shot.keys = shot.keys.filter((x) => x !== k));
  shot.keys = shot.keys.filter((k) => Object.keys(k).some((x) => x !== "t" && x !== "ease"));
  if (!shot.keys.length) delete shot.keys;
}

/** The value of each keyed thing a shot shows when nothing's keyed. */
export const KEY_DEFAULTS: Record<Keyed, number> = { scale: 1, x: 0, y: 0, rotate: 0, opacity: 1, volume: 1 };

/**
 * Speed through a shot that ramps from `from` to `to` over `seconds`: how fast it plays `t` seconds in, and how far
 * into its footage it is by then (the speed added up).
 */
export function rampAt(from: number, to: number, seconds: number, t: number, how?: string): { speed: number; source: number } {
  const steps = 64;
  const at = (x: number) => from + (to - from) * ease(how ?? "in-out", x / Math.max(1e-6, seconds));
  let source = 0;
  const dt = Math.min(t, seconds) / steps;
  for (let i = 0; i < steps; i++) source += at((i + 0.5) * dt) * dt;
  return { speed: at(Math.min(t, seconds)), source };
}

/**
 * A ramp as a few stretches of steady speed, which players can play: each from `t` for `seconds` at `speed`, starting
 * `source` seconds into the shot's footage.
 */
export function rampSteps(from: number, to: number, seconds: number, how?: string, count = 8): { t: number; seconds: number; speed: number; source: number }[] {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t0 = (seconds * i) / count, t1 = (seconds * (i + 1)) / count;
    const a = rampAt(from, to, seconds, t0, how).source, b = rampAt(from, to, seconds, t1, how).source;
    out.push({ t: t0, seconds: t1 - t0, speed: (b - a) / (t1 - t0), source: a });
  }
  return out;
}
