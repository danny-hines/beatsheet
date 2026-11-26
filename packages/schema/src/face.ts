/**
 * Commercial-safe facial performance data (`FacePerformanceTrack`): 52 standard ARKit blendshapes + 3D Euler head pose
 * extracted locally via Apache-2.0 MediaPipe Face Landmarker. Drives `kit:ClayHead` to produce identity-stripped neutral
 * 3D clay expression masks for "Act it yourself" facial performance transfer (zero FLAME/SPECTRE research weights).
 * Pure TypeScript — shared across schema, video, engine and studio.
 */

export const ARKIT_BLENDSHAPES = [
  "browDownLeft",
  "browDownRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekPuff",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "eyeWideLeft",
  "eyeWideRight",
  "jawForward",
  "jawLeft",
  "jawOpen",
  "jawRight",
  "mouthClose",
  "mouthDimpleLeft",
  "mouthDimpleRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "mouthFunnel",
  "mouthLeft",
  "mouthLowerDownLeft",
  "mouthLowerDownRight",
  "mouthPressLeft",
  "mouthPressRight",
  "mouthPucker",
  "mouthRight",
  "mouthRollLower",
  "mouthRollUpper",
  "mouthShrugLower",
  "mouthShrugUpper",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthStretchLeft",
  "mouthStretchRight",
  "mouthUpperUpLeft",
  "mouthUpperUpRight",
  "noseSneerLeft",
  "noseSneerRight",
  "tongueOut",
] as const;

export type ArkitBlendshape = (typeof ARKIT_BLENDSHAPES)[number];

/** Head orientation in radians (pitch: nod up/down, yaw: turn left/right, roll: tilt) plus optional translation. */
export type FacePose = {
  pitch: number;
  yaw: number;
  roll: number;
  tx?: number;
  ty?: number;
  tz?: number;
};

export type FaceFrame = {
  /** Seconds from the start of the performance clip. */
  t: number;
  pose: FacePose;
  shapes: Partial<Record<ArkitBlendshape, number>>;
};

export type FacePerformanceTrack = {
  version: 1;
  source?: string;
  fps: number;
  duration: number;
  frames: FaceFrame[];
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Built-in static emotion presets for previewing or animating `kit:ClayHead` without a recorded driver clip. */
export const EMOTION_PRESETS: Record<string, { label: string; pose: FacePose; shapes: Partial<Record<ArkitBlendshape, number>> }> = {
  neutral: { label: "Neutral", pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: {} },
  joy: {
    label: "Warm smile",
    pose: { pitch: -0.04, yaw: 0.05, roll: 0.04 },
    shapes: { mouthSmileLeft: 0.82, mouthSmileRight: 0.82, cheekSquintLeft: 0.55, cheekSquintRight: 0.55, eyeSquintLeft: 0.35, eyeSquintRight: 0.35, jawOpen: 0.14, browOuterUpLeft: 0.2, browOuterUpRight: 0.2 },
  },
  surprise: {
    label: "Surprise",
    pose: { pitch: -0.06, yaw: 0, roll: 0 },
    shapes: { browInnerUp: 0.85, browOuterUpLeft: 0.78, browOuterUpRight: 0.78, eyeWideLeft: 0.85, eyeWideRight: 0.85, jawOpen: 0.58, mouthFunnel: 0.35 },
  },
  anger: {
    label: "Intense anger",
    pose: { pitch: 0.08, yaw: 0, roll: -0.03 },
    shapes: { browDownLeft: 0.9, browDownRight: 0.9, eyeSquintLeft: 0.55, eyeSquintRight: 0.55, noseSneerLeft: 0.65, noseSneerRight: 0.65, mouthFrownLeft: 0.6, mouthFrownRight: 0.6, mouthPressLeft: 0.5, mouthPressRight: 0.5, jawForward: 0.25 },
  },
  sadness: {
    label: "Quiet sadness",
    pose: { pitch: 0.1, yaw: -0.06, roll: -0.07 },
    shapes: { browInnerUp: 0.78, browDownLeft: 0.25, browDownRight: 0.25, mouthFrownLeft: 0.68, mouthFrownRight: 0.68, mouthShrugLower: 0.35, eyeLookDownLeft: 0.35, eyeLookDownRight: 0.35 },
  },
  skeptical: {
    label: "Skeptical",
    pose: { pitch: -0.02, yaw: -0.1, roll: 0.06 },
    shapes: { browOuterUpLeft: 0.75, browDownRight: 0.62, eyeSquintRight: 0.4, mouthLeft: 0.35, mouthPressLeft: 0.35, mouthPressRight: 0.35 },
  },
  smirk: {
    label: "Knowing smirk",
    pose: { pitch: 0.02, yaw: 0.08, roll: -0.04 },
    shapes: { mouthSmileRight: 0.72, mouthDimpleRight: 0.45, browOuterUpRight: 0.35, eyeSquintRight: 0.28 },
  },
  focus: {
    label: "Deep focus",
    pose: { pitch: 0.04, yaw: 0, roll: 0 },
    shapes: { browDownLeft: 0.38, browDownRight: 0.38, eyeSquintLeft: 0.25, eyeSquintRight: 0.25, mouthPressLeft: 0.25, mouthPressRight: 0.25 },
  },
};

function lerpFrame(a: FaceFrame, b: FaceFrame, f: number): FaceFrame {
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const shapes: Partial<Record<ArkitBlendshape, number>> = {};
  const keys = new Set([...Object.keys(a.shapes), ...Object.keys(b.shapes)]) as Set<ArkitBlendshape>;
  for (const k of keys) {
    const v = lerp(a.shapes[k] ?? 0, b.shapes[k] ?? 0);
    if (v > 0.001) shapes[k] = clamp01(v);
  }
  return {
    t: lerp(a.t, b.t),
    pose: {
      pitch: lerp(a.pose.pitch, b.pose.pitch),
      yaw: lerp(a.pose.yaw, b.pose.yaw),
      roll: lerp(a.pose.roll, b.pose.roll),
      tx: lerp(a.pose.tx ?? 0, b.pose.tx ?? 0),
      ty: lerp(a.pose.ty ?? 0, b.pose.ty ?? 0),
      tz: lerp(a.pose.tz ?? 0, b.pose.tz ?? 0),
    },
    shapes,
  };
}

/** Exact linear sample of a `FacePerformanceTrack` at time `t` (clamped at ends). */
function rawFrameAt(track: FacePerformanceTrack, t: number): FaceFrame {
  const frames = track.frames;
  if (!frames.length) return { t, pose: { pitch: 0, yaw: 0, roll: 0 }, shapes: {} };
  if (t <= frames[0]!.t) return frames[0]!;
  if (t >= frames[frames.length - 1]!.t) return frames[frames.length - 1]!;
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo]!;
  const b = frames[hi]!;
  const dt = Math.max(1e-6, b.t - a.t);
  return lerpFrame(a, b, (t - a.t) / dt);
}

/**
 * Samples a `FacePerformanceTrack` at time `t` with optional Gaussian temporal smoothing (`smoothWindow` in seconds,
 * default 0.05s) and intensity scaling (`intensity`, default 1.0) so webcam jitter disappears while crisp blinks and
 * mouth plosives stay snappy.
 */
export function faceFrameAt(track: FacePerformanceTrack, t: number, opts: { smoothWindow?: number; intensity?: number } = {}): FaceFrame {
  const win = opts.smoothWindow ?? 0.05;
  const intensity = opts.intensity ?? 1;
  let base: FaceFrame;
  if (win <= 0.005 || track.frames.length < 3) {
    base = rawFrameAt(track, t);
  } else {
    // 5-tap Gaussian kernel over [t - win, t + win]
    const offsets = [-1, -0.5, 0, 0.5, 1];
    const weights = [0.1, 0.22, 0.36, 0.22, 0.1];
    let pitch = 0, yaw = 0, roll = 0, tx = 0, ty = 0, tz = 0;
    const acc = new Map<ArkitBlendshape, number>();
    for (let i = 0; i < offsets.length; i++) {
      const s = rawFrameAt(track, t + offsets[i]! * win);
      const w = weights[i]!;
      pitch += s.pose.pitch * w;
      yaw += s.pose.yaw * w;
      roll += s.pose.roll * w;
      tx += (s.pose.tx ?? 0) * w;
      ty += (s.pose.ty ?? 0) * w;
      tz += (s.pose.tz ?? 0) * w;
      for (const [k, v] of Object.entries(s.shapes) as [ArkitBlendshape, number][]) {
        acc.set(k, (acc.get(k) ?? 0) + v * w);
      }
    }
    const shapes: Partial<Record<ArkitBlendshape, number>> = {};
    for (const [k, v] of acc) if (v > 0.001) shapes[k] = clamp01(v);
    base = { t, pose: { pitch, yaw, roll, tx, ty, tz }, shapes };
  }
  if (Math.abs(intensity - 1) < 0.001) return base;
  const scaled: Partial<Record<ArkitBlendshape, number>> = {};
  for (const [k, v] of Object.entries(base.shapes) as [ArkitBlendshape, number][]) {
    scaled[k] = clamp01(v * intensity);
  }
  return {
    t: base.t,
    pose: {
      pitch: base.pose.pitch * intensity,
      yaw: base.pose.yaw * intensity,
      roll: base.pose.roll * intensity,
      tx: base.pose.tx,
      ty: base.pose.ty,
      tz: base.pose.tz,
    },
    shapes: scaled,
  };
}
