/**
 * Ready-made 3D camera-blocking presets (`kit:Previs`): height-accurate striped pills on a coarse grey set, moved by
 * deterministic mathematical camera paths. Pure TypeScript so the schema, the kit component (`packages/video`), the
 * studio and tests all share the same catalog and camera math.
 */

export const PREVIS_FAMILIES = ["people", "objects", "action", "famous", "scenes"] as const;
export type PrevisFamily = (typeof PREVIS_FAMILIES)[number];

/** How the blockout is drawn: classic striped pills, drawn sketches, high-contrast ink, soft ghosts, or an empty set. */
export const PREVIS_LOOKS = ["pills", "sketch", "ink", "ghosts", "empty"] as const;
export type PrevisLook = (typeof PREVIS_LOOKS)[number];

/** Coarse matte-grey set geometry so parallax and camera speed read clearly without dictating surface detail. */
export const PREVIS_SETS = ["studio", "street", "room", "alley", "corridor", "clearing"] as const;
export type PrevisSet = (typeof PREVIS_SETS)[number];

/** One stand-in on the stage: a striped pill (person) or block (prop), sized and facing without limbs to copy. */
export type PrevisSubject = {
  color?: string;
  /** Height in metres; default 1.75 for a person, 0.6 for a prop. */
  height?: number;
  /** Starting position on the floor, in metres. */
  x?: number;
  z?: number;
  /** Direction the white eye-dot faces, in degrees (0 = toward +Z camera, 90 = +X right, 180 = -Z away). */
  facing?: number;
  /** Optional ending floor position `[x, z]` in metres when the stand-in moves through the shot. */
  moveTo?: [number, number];
  kind?: "person" | "box" | "prop";
  label?: string;
};

/** A speed dip or surge inside the move: slows down around `at` (0..1) by factor `slow` (e.g. 0.2 = 5× slower). */
export type PrevisSpeedRamp = {
  /** Normalized time (0..1) where the ramp centres; default 0.5. */
  at?: number;
  /** Relative speed at the centre (0.1..2.5); values < 1 slow down (bullet-time), > 1 surge. Default 0.25. */
  slow?: number;
  /** Width of the affected zone (0.05..0.6); default 0.22. */
  width?: number;
};

export type PrevisPreset = {
  id: string;
  label: string;
  family: PrevisFamily;
  summary: string;
  defaultSet: PrevisSet;
  defaultLens: number;
  defaultSubjects: PrevisSubject[];
  /** Normalized progress (0..1) for the resting thumbnail frame; defaults to 0.42. */
  thumbAt?: number;
  /** True for continuous moves (360° spins, handheld) that loop smoothly without a start/end hold. */
  seamlessLoop?: boolean;
};

const SOLO: PrevisSubject[] = [{ color: "#e5484d", height: 1.75, x: 0, z: 0, facing: 0, kind: "person" }];
const PAIR: PrevisSubject[] = [
  { color: "#e5484d", height: 1.78, x: -0.75, z: 0.15, facing: 75, kind: "person" },
  { color: "#2563eb", height: 1.68, x: 0.75, z: -0.15, facing: -105, kind: "person" },
];
const WALK_SOLO: PrevisSubject[] = [{ color: "#e5484d", height: 1.75, x: 0, z: 2.2, facing: 180, moveTo: [0, -2.6], kind: "person" }];
const SPRINT_SOLO: PrevisSubject[] = [{ color: "#e5484d", height: 1.75, x: 0, z: -2.5, facing: 0, moveTo: [0, 2.5], kind: "person" }];
const PROP_HERO: PrevisSubject[] = [{ color: "#f59e0b", height: 0.55, x: 0, z: 0, facing: 0, kind: "prop" }];
const CLASH: PrevisSubject[] = [
  { color: "#e5484d", height: 1.8, x: -1.1, z: 0, facing: 90, moveTo: [-0.35, 0], kind: "person" },
  { color: "#2563eb", height: 1.75, x: 1.1, z: 0, facing: -90, moveTo: [0.35, 0], kind: "person" },
];

/** Curated 3D camera-move presets inspired by standard cinematography blocking. */
export const PREVIS_MOVES: PrevisPreset[] = [
  // People
  { id: "push-in", label: "Push in", family: "people", summary: "Steady dolly forward from medium to close-up.", defaultSet: "room", defaultLens: 42, defaultSubjects: SOLO, thumbAt: 0.42 },
  { id: "pull-out", label: "Pull out (reveal)", family: "people", summary: "Pulls back from close framing to reveal the space.", defaultSet: "street", defaultLens: 35, defaultSubjects: SOLO, thumbAt: 0.68 },
  { id: "orbit", label: "Orbit", family: "people", summary: "Smooth 120° arc around the subject at eye height.", defaultSet: "studio", defaultLens: 40, defaultSubjects: SOLO, thumbAt: 0.35 },
  { id: "low-arc", label: "Low hero arc", family: "people", summary: "Low-angle sweeping arc looking slightly up at the subject.", defaultSet: "alley", defaultLens: 28, defaultSubjects: SOLO, thumbAt: 0.35 },
  { id: "crane-up", label: "Crane up", family: "people", summary: "Rises from eye level to a high wide angle looking down.", defaultSet: "street", defaultLens: 32, defaultSubjects: SOLO, thumbAt: 0.65 },
  { id: "crane-down", label: "Crane down (arrival)", family: "people", summary: "Descends from overhead into an intimate eye-level frame.", defaultSet: "clearing", defaultLens: 35, defaultSubjects: SOLO, thumbAt: 0.35 },
  { id: "dolly-zoom", label: "Dolly zoom (vertigo)", family: "people", summary: "Pulls back while zooming in so the subject stays the same size as the background warps.", defaultSet: "corridor", defaultLens: 35, defaultSubjects: SOLO, thumbAt: 0.4 },
  { id: "whip-pan", label: "Whip pan", family: "people", summary: "Fast horizontal whip from one subject to another with a quick settle.", defaultSet: "room", defaultLens: 45, defaultSubjects: PAIR, thumbAt: 0.45 },
  { id: "steadicam-follow", label: "Steadicam follow", family: "people", summary: "Glides behind a walking subject down the set.", defaultSet: "street", defaultLens: 32, defaultSubjects: WALK_SOLO, thumbAt: 0.45 },
  { id: "steadicam-lead", label: "Steadicam lead", family: "people", summary: "Backs up ahead of a subject moving toward camera.", defaultSet: "corridor", defaultLens: 35, defaultSubjects: SPRINT_SOLO, thumbAt: 0.45 },
  { id: "over-the-shoulder", label: "Over the shoulder", family: "people", summary: "Slow push past one shoulder onto the listener in a two-person scene.", defaultSet: "room", defaultLens: 55, defaultSubjects: PAIR, thumbAt: 0.5 },
  { id: "handheld", label: "Handheld", family: "people", summary: "Subtle documentary breathing and organic micro-sway on a medium shot.", defaultSet: "alley", defaultLens: 40, defaultSubjects: SOLO, thumbAt: 0.4, seamlessLoop: true },
  { id: "truck-right", label: "Truck right (parallax)", family: "people", summary: "Lateral tracking slide showing foreground-to-background parallax.", defaultSet: "street", defaultLens: 38, defaultSubjects: SOLO, thumbAt: 0.35 },

  // Action & aerial
  { id: "bullet-time", label: "Bullet-time orbit", family: "action", summary: "Fast 220° orbit with a dramatic mid-shot slow-motion ramp.", defaultSet: "alley", defaultLens: 35, defaultSubjects: CLASH, thumbAt: 0.38 },
  { id: "snorricam", label: "Snorricam", family: "action", summary: "Locked tightly to the moving subject's face while the world slides past behind them.", defaultSet: "corridor", defaultLens: 24, defaultSubjects: SPRINT_SOLO, thumbAt: 0.45 },
  { id: "crash-zoom", label: "Crash zoom", family: "action", summary: "Aggressive punch-in from wide to tight close-up with an emphatic snap.", defaultSet: "room", defaultLens: 35, defaultSubjects: SOLO, thumbAt: 0.52 },
  { id: "chase-drone", label: "Chase drone", family: "action", summary: "Banked swooping pursuit behind and above a moving target.", defaultSet: "street", defaultLens: 24, defaultSubjects: WALK_SOLO, thumbAt: 0.4 },
  { id: "aerial-spiral", label: "Aerial spiral", family: "action", summary: "High rising corkscrew looking straight down over the scene.", defaultSet: "clearing", defaultLens: 26, defaultSubjects: SOLO, thumbAt: 0.58 },
  { id: "aerial-pullback", label: "Aerial pullback", family: "action", summary: "Sweeping crane-and-drone pullback revealing the entire location.", defaultSet: "clearing", defaultLens: 26, defaultSubjects: SOLO, thumbAt: 0.65 },

  // Objects & product
  { id: "product-spin", label: "Product spin", family: "objects", summary: "Clean 360° tabletop hero sweep around an object.", defaultSet: "studio", defaultLens: 55, defaultSubjects: PROP_HERO, thumbAt: 0.12, seamlessLoop: true },
  { id: "hero-orbit", label: "Hero object orbit", family: "objects", summary: "Rising 140° studio reveal on a product or prop.", defaultSet: "studio", defaultLens: 50, defaultSubjects: PROP_HERO, thumbAt: 0.58 },
  { id: "top-down", label: "Top-down (god's eye)", family: "objects", summary: "Overhead perpendicular look-down with slow rotation and rise.", defaultSet: "studio", defaultLens: 40, defaultSubjects: PROP_HERO, thumbAt: 0.4 },
  { id: "macro-slider", label: "Macro slider", family: "objects", summary: "Tight low lateral glide across a product silhouette.", defaultSet: "studio", defaultLens: 85, defaultSubjects: PROP_HERO, thumbAt: 0.3 },
  { id: "wipe-reveal", label: "Wipe reveal", family: "objects", summary: "Slides out from behind a foreground wall/pillar to reveal the subject.", defaultSet: "corridor", defaultLens: 40, defaultSubjects: SOLO, thumbAt: 0.72 },

  // Famous & scenes
  { id: "bay-360", label: "360° hero spin", family: "famous", summary: "Low-angle full 360° hero orbit around two figures.", defaultSet: "street", defaultLens: 28, defaultSubjects: PAIR, thumbAt: 0.14, seamlessLoop: true },
  { id: "trunk-shot", label: "Trunk shot", family: "famous", summary: "Extreme low-angle look-up from ground level as two figures lean in.", defaultSet: "alley", defaultLens: 24, defaultSubjects: PAIR, thumbAt: 0.5 },
];

export const PREVIS_BY_ID = new Map(PREVIS_MOVES.map((m) => [m.id, m]));

/** Normalized progress (0..1) for a preset's resting thumbnail frame. */
export function previsThumbAt(preset: PrevisPreset | string): number {
  const p = typeof preset === "string" ? PREVIS_BY_ID.get(preset) : preset;
  return p?.thumbAt ?? 0.42;
}

/** Vertical field of view (degrees) for a full-frame 35mm focal length (24mm sensor height). */
export function lensToFov(mm = 35): number {
  const clamped = Math.max(12, Math.min(200, Number.isFinite(mm) ? mm : 35));
  return (2 * Math.atan(12 / clamped) * 180) / Math.PI;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
const easeInOutCubic = (x: number) => {
  const c = clamp01(x);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

/**
 * Remaps linear shot progress `u` (0..1) through an optional speed ramp, returning a strictly monotonic 0..1 curve
 * integrated over 64 steps so the camera slows smoothly through the ramp centre and still reaches 1 at the end.
 */
export function rampProgress(u: number, ramp?: PrevisSpeedRamp): number {
  const x = clamp01(u);
  if (!ramp) return x;
  const at = clamp01(ramp.at ?? 0.5);
  const slow = Math.max(0.08, Math.min(3, ramp.slow ?? 0.25));
  const width = Math.max(0.05, Math.min(0.6, ramp.width ?? 0.22));
  const steps = 64;
  const speedAt = (s: number) => {
    const d = (s - at) / width;
    const bell = Math.exp(-0.5 * d * d);
    return 1 + (slow - 1) * bell;
  };
  let total = 0;
  let partial = 0;
  const dt = 1 / steps;
  for (let i = 0; i < steps; i++) {
    const mid = (i + 0.5) * dt;
    const v = speedAt(mid) * dt;
    total += v;
    const segStart = i * dt;
    const segEnd = (i + 1) * dt;
    if (x >= segEnd) partial += v;
    else if (x > segStart) partial += v * ((x - segStart) / dt);
  }
  return total > 0 ? clamp01(partial / total) : x;
}

export type PrevisCameraState = {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Roll in radians (used for drone banks / dynamic action). */
  roll: number;
};

export type PrevisCameraOpts = {
  lens?: number;
  /** Scales default camera distance (1 = preset default). */
  distance?: number;
  /** Offset added to default camera height, in metres. */
  height?: number;
  /** Azimuth rotation offset around the stage, in degrees. */
  angle?: number;
  speedRamp?: PrevisSpeedRamp;
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const rotY = ([x, y, z]: [number, number, number], rad: number): [number, number, number] => [
  x * Math.cos(rad) + z * Math.sin(rad),
  y,
  -x * Math.sin(rad) + z * Math.cos(rad),
];

/**
 * Evaluates a preset camera pose at normalized progress `u` (0..1). Unknown move ids fall back to `"push-in"`.
 */
export function previsCameraAt(moveId: string, u: number, opts: PrevisCameraOpts = {}): PrevisCameraState {
  const preset = PREVIS_BY_ID.get(moveId) ?? PREVIS_BY_ID.get("push-in")!;
  const p = rampProgress(u, opts.speedRamp);
  const e = easeInOutCubic(p);
  const baseLens = opts.lens ?? preset.defaultLens;
  const distScale = Math.max(0.3, Math.min(3, opts.distance ?? 1));
  const yOff = opts.height ?? 0;
  const yaw = ((opts.angle ?? 0) * Math.PI) / 180;

  let pos: [number, number, number] = [0, 1.5, 4.2];
  let target: [number, number, number] = [0, 1.35, 0];
  let fov = lensToFov(baseLens);
  let roll = 0;

  switch (preset.id) {
    case "push-in":
      pos = [0, 1.48, mix(4.6, 1.85, e)];
      target = [0, 1.45, 0];
      break;
    case "pull-out":
      pos = [0, mix(1.5, 1.9, e), mix(1.75, 6.2, e)];
      target = [0, mix(1.48, 1.25, e), 0];
      break;
    case "orbit": {
      const a = mix(-Math.PI * 0.35, Math.PI * 0.35, e);
      pos = [Math.sin(a) * 3.8, 1.48, Math.cos(a) * 3.8];
      target = [0, 1.35, 0];
      break;
    }
    case "low-arc": {
      const a = mix(-Math.PI * 0.4, Math.PI * 0.32, e);
      pos = [Math.sin(a) * 3.2, mix(0.55, 0.95, e), Math.cos(a) * 3.2];
      target = [0, 1.45, 0];
      break;
    }
    case "crane-up":
      pos = [mix(0, 0.6, e), mix(1.3, 5.2, e), mix(3.4, 5.4, e)];
      target = [0, mix(1.4, 0.9, e), 0];
      break;
    case "crane-down":
      pos = [mix(-0.5, 0, e), mix(5.4, 1.45, e), mix(5.2, 2.8, e)];
      target = [0, mix(0.8, 1.42, e), 0];
      break;
    case "dolly-zoom": {
      // Keeps apparent subject height constant while lens zooms from wide (22mm) to telephoto (95mm).
      const lens = mix(22, 95, e);
      fov = lensToFov(lens);
      const halfSpan = 1.1;
      const dist = halfSpan / Math.tan(((fov * Math.PI) / 180) / 2);
      pos = [0, 1.45, dist];
      target = [0, 1.42, 0];
      break;
    }
    case "whip-pan": {
      // Holds on left figure, whips across quickly between 0.35..0.55, settles on right figure.
      const whip = smoothstep((p - 0.34) / 0.22);
      pos = [mix(-0.2, 0.2, whip), 1.48, 3.0];
      target = [mix(-0.75, 0.75, whip), 1.45, mix(0.15, -0.15, whip)];
      roll = Math.sin(whip * Math.PI) * 0.06;
      break;
    }
    case "steadicam-follow": {
      const sz = mix(2.2, -2.6, p);
      pos = [Math.sin(p * Math.PI * 3) * 0.08, 1.52 + Math.sin(p * Math.PI * 6) * 0.03, sz + 2.4];
      target = [0, 1.42, sz];
      break;
    }
    case "steadicam-lead": {
      const sz = mix(-2.5, 2.5, p);
      pos = [Math.sin(p * Math.PI * 3) * 0.07, 1.48 + Math.cos(p * Math.PI * 6) * 0.025, sz + 2.1];
      target = [0, 1.46, sz];
      break;
    }
    case "over-the-shoulder":
      pos = [mix(-1.35, -1.05, e), 1.56, mix(1.45, 0.95, e)];
      target = [0.72, 1.44, -0.15];
      break;
    case "handheld":
      pos = [
        Math.sin(p * Math.PI * 4.3) * 0.12 + Math.sin(p * Math.PI * 11.7) * 0.03,
        1.48 + Math.cos(p * Math.PI * 5.1) * 0.06,
        mix(3.2, 2.75, e) + Math.sin(p * Math.PI * 3.1) * 0.05,
      ];
      target = [Math.sin(p * Math.PI * 3.7) * 0.05, 1.42 + Math.sin(p * Math.PI * 6.3) * 0.03, 0];
      roll = Math.sin(p * Math.PI * 4.9) * 0.02;
      break;
    case "truck-right":
      pos = [mix(-2.6, 2.6, e), 1.45, 3.6];
      target = [mix(-0.4, 0.4, e), 1.35, 0];
      break;
    case "bullet-time": {
      const bp = rampProgress(u, opts.speedRamp ?? { at: 0.5, slow: 0.2, width: 0.25 });
      const a = mix(-Math.PI * 0.65, Math.PI * 0.65, bp);
      pos = [Math.sin(a) * 3.4, mix(1.25, 1.55, Math.sin(bp * Math.PI)), Math.cos(a) * 3.4];
      target = [0, 1.25, 0];
      roll = Math.sin(bp * Math.PI) * 0.05;
      break;
    }
    case "snorricam": {
      const sz = mix(-2.5, 2.5, p);
      pos = [Math.sin(p * Math.PI * 12) * 0.02, 1.48 + Math.abs(Math.sin(p * Math.PI * 12)) * 0.025, sz + 1.05];
      target = [0, 1.48, sz];
      break;
    }
    case "crash-zoom": {
      const snap = smoothstep((p - 0.15) / 0.45);
      const lens = mix(24, 105, snap);
      fov = lensToFov(lens);
      pos = [0, 1.48, mix(5.0, 3.2, snap)];
      target = [0, 1.5, 0];
      break;
    }
    case "chase-drone": {
      const sz = mix(2.2, -2.6, p);
      pos = [Math.sin(p * Math.PI) * 1.4, mix(3.4, 1.7, e), sz + mix(4.2, 2.2, e)];
      target = [0, 1.35, sz - 0.5];
      roll = -Math.cos(p * Math.PI) * 0.14;
      break;
    }
    case "aerial-spiral": {
      const a = p * Math.PI * 1.5;
      const r = mix(1.4, 4.4, e);
      pos = [Math.sin(a) * r, mix(2.6, 8.5, e), Math.cos(a) * r];
      target = [0, 0.8, 0];
      break;
    }
    case "aerial-pullback":
      pos = [mix(0, 1.2, e), mix(1.6, 7.5, e), mix(2.6, 10.5, e)];
      target = [0, mix(1.4, 0.5, e), 0];
      break;
    case "product-spin": {
      const a = p * Math.PI * 2;
      pos = [Math.sin(a) * 1.9, 0.72, Math.cos(a) * 1.9];
      target = [0, 0.34, 0];
      break;
    }
    case "hero-orbit": {
      const a = mix(-Math.PI * 0.45, Math.PI * 0.35, e);
      pos = [Math.sin(a) * 1.85, mix(0.35, 1.05, e), Math.cos(a) * 1.85];
      target = [0, 0.32, 0];
      break;
    }
    case "top-down": {
      const a = p * Math.PI * 0.6;
      const r = 0.08;
      pos = [Math.sin(a) * r, mix(2.1, 3.6, e), Math.cos(a) * r];
      target = [0, 0.2, 0];
      roll = a;
      break;
    }
    case "macro-slider":
      pos = [mix(-1.1, 1.1, e), 0.38, 1.25];
      target = [mix(-0.15, 0.15, e), 0.32, 0];
      break;
    case "wipe-reveal":
      pos = [mix(-1.95, 0.35, e), 1.48, mix(2.8, 3.1, e)];
      target = [0, 1.4, 0];
      break;
    case "bay-360": {
      const a = p * Math.PI * 2;
      pos = [Math.sin(a) * 3.3, 0.72, Math.cos(a) * 3.3];
      target = [0, 1.42, 0];
      break;
    }
    case "trunk-shot":
      pos = [mix(-0.2, 0.2, e), 0.22, mix(1.2, 0.95, e)];
      target = [0, 1.65, 0];
      break;
    default:
      pos = [0, 1.48, mix(4.4, 2.0, e)];
      target = [0, 1.45, 0];
  }

  // Apply distance scale relative to target, height offset, and stage azimuth rotation.
  const rel: [number, number, number] = [
    (pos[0] - target[0]) * distScale,
    (pos[1] - target[1]) * distScale + yOff,
    (pos[2] - target[2]) * distScale,
  ];
  const rPos = yaw ? rotY(rel, yaw) : rel;
  const rTarget = yaw ? rotY(target, yaw) : target;
  return {
    pos: [rTarget[0] + rPos[0], Math.max(0.12, rTarget[1] + rPos[1]), rTarget[2] + rPos[2]],
    target: rTarget,
    fov,
    roll,
  };
}

/** Floor position of a stand-in at normalized progress `u` (0..1). */
export function previsSubjectAt(s: PrevisSubject, u: number): { x: number; z: number } {
  const x0 = s.x ?? 0;
  const z0 = s.z ?? 0;
  if (!s.moveTo) return { x: x0, z: z0 };
  const t = clamp01(u);
  return { x: mix(x0, s.moveTo[0], t), z: mix(z0, s.moveTo[1], t) };
}
