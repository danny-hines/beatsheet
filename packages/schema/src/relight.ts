/**
 * Light Sphere Relighting presets: 24 curated lighting setups across Cinematic, Lighting Techniques and Neutral Studio.
 * Each preset carries physical directional light parameters so the engine can render a deterministic 3D calibration
 * lighting sphere locally at zero cost, plus a lighting prompt that adapts to a clip's first frame.
 */

export const RELIGHT_CATEGORIES = ["cinematic", "technique", "neutral"] as const;
export type RelightCategory = (typeof RELIGHT_CATEGORIES)[number];

export type RelightLight = {
  /** Normalized direction vector `[x, y, z]` toward the light source (+X right, +Y up, +Z toward camera). */
  dir: [number, number, number];
  /** RGB tint, 0..1 each. */
  color: [number, number, number];
  /** Relative brightness. */
  intensity: number;
  /** Wrap/softness factor (0 = hard edge, 0.8 = very soft wrap). */
  softness?: number;
};

export type RelightPreset = {
  id: string;
  label: string;
  category: RelightCategory;
  summary: string;
  prompt: string;
  /** CSS radial-gradient preview for compact UI swatches. */
  swatch: string;
  sphere: {
    bg: [number, number, number];
    ambient: [number, number, number];
    key: RelightLight;
    fill?: RelightLight;
    rim?: RelightLight;
    specular?: number;
  };
};

export const RELIGHT_PRESETS: RelightPreset[] = [
  // ---- Cinematic
  {
    id: "blue-amber",
    label: "Blue & Amber",
    category: "cinematic",
    summary: "Warm tungsten key from screen right balanced against cool steel-blue shadow fill.",
    prompt: "Cinematic tungsten-amber key light from the right casting warm highlights across skin and surfaces, with deep cool steel-blue ambient fill in the shadows.",
    swatch: "radial-gradient(circle at 72% 34%, #ffbe6b 0%, #c46a2c 42%, #1d3557 82%, #0d1829 100%)",
    sphere: {
      bg: [0.06, 0.09, 0.14],
      ambient: [0.1, 0.16, 0.28],
      key: { dir: [0.75, 0.45, 0.48], color: [1.0, 0.68, 0.34], intensity: 1.25, softness: 0.25 },
      fill: { dir: [-0.8, 0.1, 0.4], color: [0.28, 0.56, 0.95], intensity: 0.55, softness: 0.55 },
      rim: { dir: [-0.45, 0.6, -0.65], color: [0.42, 0.72, 1.0], intensity: 0.65 },
      specular: 0.28,
    },
  },
  {
    id: "neon-noir",
    label: "Neon Noir",
    category: "cinematic",
    summary: "Electric cyan key with hot magenta edge rim and inky night shadows.",
    prompt: "Nighttime cyberpunk neon lighting: crisp electric cyan light from the left, saturated magenta rim light catching edges from behind right, and deep glossy dark shadows.",
    swatch: "radial-gradient(circle at 28% 36%, #5cf2ff 0%, #1978a5 44%, #6a1358 80%, #12091c 100%)",
    sphere: {
      bg: [0.05, 0.04, 0.09],
      ambient: [0.07, 0.05, 0.14],
      key: { dir: [-0.78, 0.32, 0.54], color: [0.2, 0.92, 1.0], intensity: 1.2, softness: 0.2 },
      fill: { dir: [0.4, -0.2, 0.6], color: [0.25, 0.15, 0.5], intensity: 0.3, softness: 0.5 },
      rim: { dir: [0.75, 0.42, -0.5], color: [1.0, 0.18, 0.72], intensity: 1.15 },
      specular: 0.45,
    },
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    category: "cinematic",
    summary: "Low raking late-afternoon sunlight with warm honey glow and soft lavender sky fill.",
    prompt: "Warm low-angle golden hour sunlight raking from the side, long soft shadows, luminous honey-gold highlights and gentle cool sky fill on the shadow side.",
    swatch: "radial-gradient(circle at 78% 48%, #ffe19c 0%, #e88e38 44%, #6b4e71 84%, #261f33 100%)",
    sphere: {
      bg: [0.14, 0.11, 0.16],
      ambient: [0.24, 0.2, 0.3],
      key: { dir: [0.88, 0.18, 0.42], color: [1.0, 0.72, 0.36], intensity: 1.35, softness: 0.35 },
      fill: { dir: [-0.6, 0.55, 0.55], color: [0.58, 0.62, 0.85], intensity: 0.42, softness: 0.65 },
      rim: { dir: [0.7, 0.25, -0.66], color: [1.0, 0.8, 0.48], intensity: 0.7 },
      specular: 0.22,
    },
  },
  {
    id: "moonlit-silver",
    label: "Moonlit Silver",
    category: "cinematic",
    summary: "Crisp high silver-blue moonlight with deep indigo shadows.",
    prompt: "Cool silver-blue moonlight from high behind and to the left, crisp pale rim highlights, deep velvety indigo shadows and quiet nocturnal atmosphere.",
    swatch: "radial-gradient(circle at 32% 24%, #dceeff 0%, #6d92b8 40%, #1b2a47 78%, #0a101d 100%)",
    sphere: {
      bg: [0.04, 0.06, 0.11],
      ambient: [0.09, 0.13, 0.22],
      key: { dir: [-0.55, 0.76, 0.34], color: [0.74, 0.87, 1.0], intensity: 1.15, softness: 0.2 },
      fill: { dir: [0.6, -0.1, 0.5], color: [0.16, 0.24, 0.42], intensity: 0.3, softness: 0.6 },
      rim: { dir: [-0.45, 0.65, -0.6], color: [0.85, 0.94, 1.0], intensity: 0.85 },
      specular: 0.32,
    },
  },
  {
    id: "green-noir-cab",
    label: "Green Noir Cab",
    category: "cinematic",
    summary: "Fluorescent jade-green overhead wash with warm sodium street accents.",
    prompt: "Moody late-night Wong Kar-wai fluorescent green overhead light with subtle warm amber streetlights glancing off edges and rich emerald shadows.",
    swatch: "radial-gradient(circle at 50% 24%, #9cf2be 0%, #2a8a63 45%, #12362a 82%, #081712 100%)",
    sphere: {
      bg: [0.04, 0.09, 0.07],
      ambient: [0.09, 0.2, 0.15],
      key: { dir: [0.1, 0.85, 0.5], color: [0.46, 0.95, 0.68], intensity: 1.1, softness: 0.35 },
      fill: { dir: [-0.7, -0.1, 0.5], color: [0.14, 0.42, 0.34], intensity: 0.4, softness: 0.55 },
      rim: { dir: [0.8, 0.2, -0.55], color: [1.0, 0.62, 0.22], intensity: 0.7 },
      specular: 0.3,
    },
  },
  {
    id: "teal-fashion",
    label: "Teal Fashion",
    category: "cinematic",
    summary: "Editorial crisp white beauty key with saturated aqua-teal bounce and backdrop.",
    prompt: "High-fashion editorial studio lighting: clean soft directional white key light on the subject with crisp aqua-teal color wash filling the shadows and edges.",
    swatch: "radial-gradient(circle at 60% 30%, #f4ffff 0%, #48c9d4 44%, #106373 80%, #092c36 100%)",
    sphere: {
      bg: [0.05, 0.2, 0.24],
      ambient: [0.14, 0.34, 0.38],
      key: { dir: [0.45, 0.55, 0.7], color: [0.98, 1.0, 1.0], intensity: 1.15, softness: 0.45 },
      fill: { dir: [-0.8, 0.05, 0.45], color: [0.12, 0.78, 0.85], intensity: 0.75, softness: 0.6 },
      rim: { dir: [0.0, 0.75, -0.65], color: [0.5, 0.95, 1.0], intensity: 0.65 },
      specular: 0.35,
    },
  },
  {
    id: "sodium-street",
    label: "Sodium Streetlight",
    category: "cinematic",
    summary: "Overhead orange-gold sodium vapor pool falling off into dark night.",
    prompt: "Gritty night exterior lit by an overhead sodium-vapor streetlamp casting warm orange-gold light from directly above with rapid falloff into deep slate-black shadows.",
    swatch: "radial-gradient(circle at 50% 20%, #ffd275 0%, #d9771e 42%, #47250e 78%, #120b08 100%)",
    sphere: {
      bg: [0.06, 0.05, 0.05],
      ambient: [0.12, 0.08, 0.06],
      key: { dir: [0.08, 0.92, 0.36], color: [1.0, 0.6, 0.18], intensity: 1.35, softness: 0.2 },
      fill: { dir: [-0.4, -0.3, 0.6], color: [0.22, 0.2, 0.26], intensity: 0.25, softness: 0.5 },
      specular: 0.26,
    },
  },
  {
    id: "warm-tungsten",
    label: "Warm Tungsten",
    category: "cinematic",
    summary: "Cozy practical table-lamp warmth from low left with soft dark room falloff.",
    prompt: "Intimate interior lit by a warm practical tungsten lamp low on the left, gentle amber pools on faces and furniture, soft dark shadows across the room.",
    swatch: "radial-gradient(circle at 26% 62%, #ffe3ad 0%, #c97b36 45%, #3d2414 82%, #140d09 100%)",
    sphere: {
      bg: [0.07, 0.05, 0.04],
      ambient: [0.14, 0.09, 0.06],
      key: { dir: [-0.82, -0.18, 0.54], color: [1.0, 0.72, 0.38], intensity: 1.25, softness: 0.45 },
      fill: { dir: [0.6, 0.35, 0.5], color: [0.35, 0.26, 0.2], intensity: 0.3, softness: 0.65 },
      specular: 0.2,
    },
  },
  {
    id: "overcast-nordic",
    label: "Overcast Nordic",
    category: "cinematic",
    summary: "Soft diffused cool daylight from above with gentle slate shadows and muted contrast.",
    prompt: "Soft overcast northern daylight diffused evenly from a cloudy sky overhead, clean cool-neutral whites, low contrast and gentle slate-grey shadow transitions.",
    swatch: "radial-gradient(circle at 50% 24%, #e8eff5 0%, #a5b5c4 48%, #5b6a78 85%, #313b45 100%)",
    sphere: {
      bg: [0.22, 0.26, 0.3],
      ambient: [0.38, 0.43, 0.48],
      key: { dir: [0.05, 0.88, 0.46], color: [0.88, 0.93, 0.98], intensity: 0.9, softness: 0.75 },
      fill: { dir: [-0.5, 0.2, 0.6], color: [0.65, 0.72, 0.8], intensity: 0.45, softness: 0.8 },
      specular: 0.12,
    },
  },
  {
    id: "desert-dusk",
    label: "Desert Dusk",
    category: "cinematic",
    summary: "Coral-magenta horizon glow against deep twilight cobalt above.",
    prompt: "Twilight magic-hour lighting: soft dusty-rose and coral horizon light grazing low from the left against deep cobalt-violet twilight falling from above.",
    swatch: "radial-gradient(circle at 24% 55%, #ff9982 0%, #a84d6b 46%, #2f2b5e 82%, #13112b 100%)",
    sphere: {
      bg: [0.09, 0.08, 0.18],
      ambient: [0.18, 0.15, 0.32],
      key: { dir: [-0.88, 0.08, 0.45], color: [1.0, 0.56, 0.46], intensity: 1.15, softness: 0.45 },
      fill: { dir: [0.3, 0.85, 0.3], color: [0.32, 0.38, 0.78], intensity: 0.6, softness: 0.7 },
      rim: { dir: [0.75, 0.2, -0.6], color: [0.95, 0.45, 0.65], intensity: 0.55 },
      specular: 0.2,
    },
  },

  // ---- Lighting techniques
  {
    id: "chiaroscuro",
    label: "Chiaroscuro",
    category: "technique",
    summary: "Hard dramatic single side key carving stark highlights out of near-black shadow.",
    prompt: "Dramatic Renaissance chiaroscuro lighting: a single hard warm-white key light from high left carving crisp sculptural highlights while the opposite side falls into near-total darkness.",
    swatch: "radial-gradient(circle at 26% 30%, #fff6e5 0%, #998975 34%, #1a1715 68%, #070606 100%)",
    sphere: {
      bg: [0.03, 0.03, 0.03],
      ambient: [0.04, 0.04, 0.045],
      key: { dir: [-0.78, 0.52, 0.34], color: [1.0, 0.94, 0.84], intensity: 1.45, softness: 0.06 },
      specular: 0.3,
    },
  },
  {
    id: "rembrandt",
    label: "Rembrandt",
    category: "technique",
    summary: "Classic 45° elevated portrait key leaving a soft triangle of light on the far cheek.",
    prompt: "Classic Rembrandt portrait lighting: directional warm-neutral key light at 45 degrees above and to the left, sculpted cheekbones, gentle fill and rich painterly shadow falloff.",
    swatch: "radial-gradient(circle at 30% 28%, #fff1dc 0%, #b59472 42%, #2e241d 78%, #120e0b 100%)",
    sphere: {
      bg: [0.07, 0.06, 0.05],
      ambient: [0.1, 0.09, 0.08],
      key: { dir: [-0.65, 0.58, 0.48], color: [1.0, 0.92, 0.8], intensity: 1.3, softness: 0.22 },
      fill: { dir: [0.7, 0.1, 0.5], color: [0.32, 0.28, 0.25], intensity: 0.22, softness: 0.6 },
      specular: 0.22,
    },
  },
  {
    id: "butterfly",
    label: "Butterfly (Paramount)",
    category: "technique",
    summary: "High front-center beauty key with soft reflector fill directly beneath.",
    prompt: "Glamour butterfly lighting: soft flattering key light high and directly in front of the subject with a gentle warm fill bounce from below lifting under-eye shadows.",
    swatch: "radial-gradient(circle at 50% 26%, #ffffff 0%, #d4c9be 48%, #635c55 86%, #2c2825 100%)",
    sphere: {
      bg: [0.14, 0.13, 0.13],
      ambient: [0.22, 0.21, 0.2],
      key: { dir: [0.0, 0.62, 0.78], color: [1.0, 0.97, 0.94], intensity: 1.2, softness: 0.48 },
      fill: { dir: [0.0, -0.75, 0.65], color: [0.85, 0.8, 0.75], intensity: 0.42, softness: 0.75 },
      specular: 0.25,
    },
  },
  {
    id: "split-light",
    label: "Split Light",
    category: "technique",
    summary: "90° perpendicular side light dividing the subject cleanly into bright and dark halves.",
    prompt: "Bold split lighting from exactly 90 degrees to the right, cleanly illuminating one half of every subject and leaving the opposite half in crisp deep shadow.",
    swatch: "radial-gradient(circle at 88% 50%, #f5f7ff 0%, #8e96a8 38%, #181b22 65%, #07080b 100%)",
    sphere: {
      bg: [0.04, 0.045, 0.06],
      ambient: [0.05, 0.055, 0.07],
      key: { dir: [0.98, 0.08, 0.16], color: [0.96, 0.97, 1.0], intensity: 1.4, softness: 0.08 },
      specular: 0.28,
    },
  },
  {
    id: "day-for-night",
    label: "Day for Night",
    category: "technique",
    summary: "Underexposed cool moonlight grade turning daytime footage into believable night.",
    prompt: "Day-for-night conversion: transform bright daylight into deep midnight blue darkness, soft cool moonlight catching upper edges and highlights, muted low-contrast shadows.",
    swatch: "radial-gradient(circle at 42% 24%, #8bb4e6 0%, #2a4773 42%, #0e192e 78%, #050912 100%)",
    sphere: {
      bg: [0.02, 0.04, 0.08],
      ambient: [0.05, 0.09, 0.18],
      key: { dir: [-0.35, 0.8, 0.45], color: [0.48, 0.68, 0.98], intensity: 0.95, softness: 0.25 },
      rim: { dir: [0.4, 0.6, -0.68], color: [0.62, 0.8, 1.0], intensity: 0.65 },
      specular: 0.2,
    },
  },
  {
    id: "firelight",
    label: "Firelight",
    category: "technique",
    summary: "Low flickering hearth-orange uplight against dark smoky shadows.",
    prompt: "Warm low-angle firelight glowing upward from a campfire or hearth below frame, vivid orange-amber highlights, warm skin tones and deep soot-dark background shadows.",
    swatch: "radial-gradient(circle at 46% 78%, #ffda7a 0%, #e85d1a 42%, #4a170a 78%, #120605 100%)",
    sphere: {
      bg: [0.05, 0.02, 0.02],
      ambient: [0.1, 0.04, 0.03],
      key: { dir: [-0.15, -0.78, 0.6], color: [1.0, 0.46, 0.14], intensity: 1.4, softness: 0.35 },
      fill: { dir: [0.5, -0.4, 0.5], color: [0.95, 0.32, 0.1], intensity: 0.45, softness: 0.55 },
      specular: 0.24,
    },
  },
  {
    id: "volumetric-godrays",
    label: "Volumetric Beams",
    category: "technique",
    summary: "Atmospheric angled sunbeams cutting through haze from high back-right.",
    prompt: "Atmospheric volumetric lighting: bright angled shafts of warm dusty light streaming down through haze from high back-right, glowing rim highlights and lifted misty shadows.",
    swatch: "radial-gradient(circle at 78% 18%, #fff7db 0%, #c9b48a 42%, #4f4a40 78%, #1e1d1a 100%)",
    sphere: {
      bg: [0.12, 0.12, 0.11],
      ambient: [0.22, 0.21, 0.19],
      key: { dir: [0.7, 0.68, -0.18], color: [1.0, 0.93, 0.78], intensity: 1.35, softness: 0.22 },
      fill: { dir: [-0.3, 0.2, 0.85], color: [0.46, 0.45, 0.42], intensity: 0.42, softness: 0.75 },
      rim: { dir: [0.65, 0.62, -0.45], color: [1.0, 0.96, 0.86], intensity: 1.1 },
      specular: 0.32,
    },
  },
  {
    id: "rim-backlight",
    label: "Silhouette Backlight",
    category: "technique",
    summary: "Strong luminous halo edge from directly behind with moody darkened front.",
    prompt: "Dramatic high-contrast rim backlighting: strong bright light directly behind the subjects creating crisp glowing edge halos around hair and shoulders while fronts sit in soft dark shadow.",
    swatch: "radial-gradient(circle at 50% 50%, #1c2029 0%, #262c38 56%, #b8d0f0 84%, #ffffff 100%)",
    sphere: {
      bg: [0.06, 0.07, 0.1],
      ambient: [0.1, 0.12, 0.16],
      key: { dir: [0.0, 0.25, 0.95], color: [0.35, 0.4, 0.5], intensity: 0.32, softness: 0.7 },
      rim: { dir: [0.0, 0.45, -0.88], color: [1.0, 0.96, 0.9], intensity: 1.65 },
      specular: 0.4,
    },
  },
  {
    id: "window-blinds",
    label: "Noir Window Blinds",
    category: "technique",
    summary: "Hard slatted daylight shafts raking across a dim interior room.",
    prompt: "Classic film noir venetian-blind lighting: crisp hard raking slats of bright daylight cutting diagonally from the left across faces and walls inside a dimly lit room.",
    swatch: "repeating-linear-gradient(12deg, #e8e2d5 0 10%, #1d1e22 10% 24%)",
    sphere: {
      bg: [0.06, 0.06, 0.07],
      ambient: [0.09, 0.09, 0.1],
      key: { dir: [-0.86, 0.34, 0.38], color: [0.98, 0.95, 0.88], intensity: 1.4, softness: 0.05 },
      fill: { dir: [0.6, 0.1, 0.5], color: [0.22, 0.24, 0.28], intensity: 0.2, softness: 0.5 },
      specular: 0.22,
    },
  },
  {
    id: "candlelight",
    label: "Candlelight",
    category: "technique",
    summary: "Soft intimate warm gold glow close to center-front with rapid falloff.",
    prompt: "Soft intimate candlelight: gentle warm golden-amber glow close to the subject from slightly below eye level, velvety soft skin highlights and deep warm-black background falloff.",
    swatch: "radial-gradient(circle at 50% 66%, #ffedb8 0%, #cf8438 40%, #3b2010 78%, #100805 100%)",
    sphere: {
      bg: [0.05, 0.03, 0.02],
      ambient: [0.09, 0.05, 0.03],
      key: { dir: [0.06, -0.35, 0.92], color: [1.0, 0.68, 0.3], intensity: 1.25, softness: 0.48 },
      specular: 0.18,
    },
  },

  // ---- Neutral studio
  {
    id: "soft-flat",
    label: "Soft Flat Studio",
    category: "neutral",
    summary: "Even shadowless front softbox illumination for clean commercial clarity.",
    prompt: "Clean even commercial softbox lighting from directly in front, balanced neutral daylight color temperature, soft open shadows and crisp natural skin tones.",
    swatch: "radial-gradient(circle at 50% 42%, #fafafa 0%, #cfcfd4 55%, #8f9199 95%, #72757d 100%)",
    sphere: {
      bg: [0.38, 0.39, 0.41],
      ambient: [0.46, 0.46, 0.48],
      key: { dir: [0.05, 0.22, 0.97], color: [1.0, 1.0, 1.0], intensity: 0.72, softness: 0.85 },
      fill: { dir: [-0.5, 0.1, 0.7], color: [0.95, 0.96, 0.98], intensity: 0.35, softness: 0.85 },
      specular: 0.12,
    },
  },
  {
    id: "high-key",
    label: "High Key Bright",
    category: "neutral",
    summary: "Airy, luminous bright studio wrap with clean white bounce all around.",
    prompt: "Bright airy high-key daylight studio lighting: abundant soft wrap-around white light from above and both sides, minimal shadows, fresh luminous highlights.",
    swatch: "radial-gradient(circle at 46% 32%, #ffffff 0%, #ebedf2 55%, #b8bec9 92%, #979eab 100%)",
    sphere: {
      bg: [0.68, 0.7, 0.74],
      ambient: [0.62, 0.63, 0.66],
      key: { dir: [-0.25, 0.55, 0.78], color: [1.0, 1.0, 1.0], intensity: 0.88, softness: 0.85 },
      fill: { dir: [0.65, 0.25, 0.7], color: [0.98, 0.99, 1.0], intensity: 0.58, softness: 0.85 },
      specular: 0.16,
    },
  },
  {
    id: "low-key",
    label: "Low Key Studio",
    category: "neutral",
    summary: "Controlled moody studio key with dark charcoal background and subtle separation.",
    prompt: "Controlled low-key studio lighting: soft directional neutral-white key light from 45 degrees right, dark charcoal shadows, and a crisp subtle rim separating subject from background.",
    swatch: "radial-gradient(circle at 68% 32%, #e8eaef 0%, #6d727d 40%, #1d2026 78%, #0b0c10 100%)",
    sphere: {
      bg: [0.05, 0.055, 0.07],
      ambient: [0.08, 0.085, 0.1],
      key: { dir: [0.68, 0.48, 0.55], color: [0.97, 0.98, 1.0], intensity: 1.25, softness: 0.28 },
      rim: { dir: [-0.65, 0.52, -0.55], color: [0.85, 0.9, 1.0], intensity: 0.65 },
      specular: 0.26,
    },
  },
  {
    id: "three-point",
    label: "Classic Three-Point",
    category: "neutral",
    summary: "Balanced interview lighting: soft key, gentle fill and clean hair rim.",
    prompt: "Clean documentary three-point lighting: soft neutral daylight key from 40 degrees left, gentle 2:1 fill from the right, and a subtle rim light separating hair and shoulders from the background.",
    swatch: "radial-gradient(circle at 36% 32%, #ffffff 0%, #c6c9cf 46%, #575b66 84%, #252830 100%)",
    sphere: {
      bg: [0.16, 0.17, 0.2],
      ambient: [0.22, 0.23, 0.26],
      key: { dir: [-0.6, 0.5, 0.62], color: [1.0, 0.98, 0.96], intensity: 1.1, softness: 0.45 },
      fill: { dir: [0.72, 0.18, 0.66], color: [0.85, 0.9, 0.98], intensity: 0.48, softness: 0.7 },
      rim: { dir: [0.42, 0.65, -0.62], color: [1.0, 1.0, 1.0], intensity: 0.7 },
      specular: 0.22,
    },
  },
];

export const RELIGHT_BY_ID = new Map(RELIGHT_PRESETS.map((p) => [p.id, p]));

/** Builds the deterministic lighting prompt from a preset, optional user direction, and optional first-frame description. */
export function relightPromptFor(preset: RelightPreset | undefined, extraPrompt?: string, frameAdapted?: string): string {
  if (frameAdapted?.trim()) return extraPrompt?.trim() ? `${frameAdapted.trim()} ${extraPrompt.trim()}` : frameAdapted.trim();
  const parts = [
    preset?.prompt,
    extraPrompt?.trim(),
    "Match the exact light direction, shadow softness and color palette shown on the reference lighting sphere while keeping the footage's subjects, motion, framing and details unchanged.",
  ].filter(Boolean);
  return parts.join(" ");
}
