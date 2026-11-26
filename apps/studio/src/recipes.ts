import type { Spine } from "@beatsheet/schema";

export type RecipeCategoryId = "featured" | "films" | "recaps" | "launches" | "talking";

export type RecipeTemplate = {
  id: string;
  title: string;
  subtitle: string;
  category: Exclude<RecipeCategoryId, "featured">;
  featured?: boolean;
  /** Underlying beatsheet skill (`film`, `montage`, `story`, `motion`). */
  recipe: "film" | "montage" | "story" | "motion";
  spine: Spine;
  /** Short badge on the card, e.g. "16:9 · FILM". */
  tag: string;
  defaultFormats: string[];
  defaultStyle?: string;
  defaultMoods?: string[];
  /** Expand More options (audience, song, references) automatically when this recipe is picked. */
  expandMore?: boolean;
  titlePlaceholder: string;
  goalPlaceholder: string;
  /** Optional procedural fallback key when no bundled .mp4 preview exists yet. */
  artwork: string;
};

export const RECIPE_CATEGORIES: { id: RecipeCategoryId; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "films", label: "Stories & Films" },
  { id: "recaps", label: "Recaps & Reels" },
  { id: "launches", label: "Launches & Explainers" },
  { id: "talking", label: "Talking & Clips" },
];

export const RECIPES: RecipeTemplate[] = [
  {
    id: "short-film",
    title: "Short film / Skit",
    subtitle: "Cast, boards, roughs & finals from a story idea",
    category: "films",
    featured: true,
    recipe: "film",
    spine: "shots",
    tag: "16:9 · FILM",
    defaultFormats: ["landscape"],
    defaultStyle: "Cinematic film",
    defaultMoods: ["Cinematic"],
    titlePlaceholder: "The Midnight Heist",
    goalPlaceholder: "Describe the story, characters, or paste a script or outline. Mention any real people or pets you want to cast…",
    artwork: "film",
  },
  {
    id: "trip-recap",
    title: "Trip / Event recap",
    subtitle: "Beat-synced highlights from your clips & photos",
    category: "recaps",
    featured: true,
    recipe: "montage",
    spine: "music",
    tag: "9:16 · BEAT-SYNC",
    defaultFormats: ["vertical"],
    defaultMoods: ["Warm", "Upbeat"],
    titlePlaceholder: "Seabrook weekend",
    goalPlaceholder: "What happened on this trip or event? Any favorite moments, songs, or people the cut should build toward?",
    artwork: "trip",
  },
  {
    id: "product-launch",
    title: "Product launch",
    subtitle: "Narrated showcase with real UI, stats & callouts",
    category: "launches",
    featured: true,
    recipe: "story",
    spine: "voice",
    tag: "16:9 · STORY",
    defaultFormats: ["landscape", "vertical"],
    defaultStyle: "Motion graphics",
    defaultMoods: ["Punchy"],
    expandMore: true,
    titlePlaceholder: "Introducing v2.0",
    goalPlaceholder: "What does the product do, what's the surprising hook, and who is it for? Drop a URL or repo in References below.",
    artwork: "launch",
  },
  {
    id: "concept-explainer",
    title: "Concept explainer",
    subtitle: "Voiceover essay with custom animated diagrams",
    category: "launches",
    featured: true,
    recipe: "story",
    spine: "voice",
    tag: "16:9 · EXPLAINER",
    defaultFormats: ["landscape"],
    defaultStyle: "Motion graphics",
    defaultMoods: ["Minimal", "Warm"],
    expandMore: true,
    titlePlaceholder: "How Photosynthesis Works",
    goalPlaceholder: "What concept are you explaining? Paste an outline, script, or lesson notes here…",
    artwork: "explainer",
  },
  {
    id: "talking-head",
    title: "Talking-head edit",
    subtitle: "Cut ums & pauses by transcript, add b-roll & captions",
    category: "talking",
    featured: true,
    recipe: "story",
    spine: "transcript",
    tag: "9:16 · SCRIPT",
    defaultFormats: ["vertical"],
    defaultMoods: ["Punchy"],
    titlePlaceholder: "Founder update",
    goalPlaceholder: "What's the main takeaway? Say whether to tighten pauses aggressively, add b-roll, or style captions.",
    artwork: "talking",
  },
  {
    id: "fake-trailer",
    title: "Fake trailer / Parody",
    subtitle: "Dramatic beats, title cards, epic score & VO",
    category: "films",
    featured: true,
    recipe: "film",
    spine: "shots",
    tag: "16:9 · FILM",
    defaultFormats: ["landscape"],
    defaultStyle: "Cinematic film",
    defaultMoods: ["Dramatic", "Witty"],
    titlePlaceholder: "One Last Ride",
    goalPlaceholder: "What's the parody premise or joke? Who stars in it, and what genre trailer should it spoof?",
    artwork: "trailer",
  },
  {
    id: "secret-pet",
    title: "Secret life of a pet",
    subtitle: "Turn photos of your pet into a mini movie",
    category: "films",
    recipe: "film",
    spine: "shots",
    tag: "16:9 · FILM",
    defaultFormats: ["landscape"],
    defaultStyle: "Photorealistic",
    defaultMoods: ["Playful", "Cinematic"],
    titlePlaceholder: "Milo's Double Life",
    goalPlaceholder: "Tell us your pet's name, personality, and the secret job or adventure they go on when you leave the house…",
    artwork: "pet",
  },
  {
    id: "scene-remake",
    title: "Scene remake",
    subtitle: "Reimagine a scene or clip in a new visual world",
    category: "films",
    recipe: "film",
    spine: "shots",
    tag: "16:9 · FILM",
    defaultFormats: ["landscape"],
    defaultStyle: "Stop-motion",
    defaultMoods: ["Cinematic"],
    titlePlaceholder: "Claymation Diner Scene",
    goalPlaceholder: "Which scene are we remaking, what stays faithful, and what style or twist are we giving it?",
    artwork: "remake",
  },
  {
    id: "birthday-tribute",
    title: "Birthday / Tribute",
    subtitle: "Personal story mixing photos, clips & custom titles",
    category: "recaps",
    recipe: "montage",
    spine: "music",
    tag: "9:16 · REEL",
    defaultFormats: ["vertical"],
    defaultMoods: ["Warm", "Nostalgic"],
    titlePlaceholder: "Happy 40th!",
    goalPlaceholder: "Who is this for, what memories or inside jokes should shine, and what vibe fits them best?",
    artwork: "tribute",
  },
  {
    id: "photo-reel",
    title: "Photo dump to motion",
    subtitle: "Turn still photos into a kinetic polaroid wall",
    category: "recaps",
    recipe: "montage",
    spine: "music",
    tag: "9:16 · MOTION",
    defaultFormats: ["vertical"],
    defaultMoods: ["Nostalgic", "Upbeat"],
    titlePlaceholder: "Summer Film Roll",
    goalPlaceholder: "Drop a folder of photos—tell us the story, trip, or theme to weave them together.",
    artwork: "photo",
  },
  {
    id: "restore-tape",
    title: "Restore & cut old tape",
    subtitle: "Clean audio, upscale home video & cut highlights",
    category: "recaps",
    recipe: "montage",
    spine: "music",
    tag: "16:9 · RESTORE",
    defaultFormats: ["landscape"],
    defaultMoods: ["Warm", "Nostalgic"],
    titlePlaceholder: "Christmas 1998 Tape",
    goalPlaceholder: "Tell us what's on the tape and which moments to pull out, clean up, and restore.",
    artwork: "restore",
  },
  {
    id: "build-log",
    title: "Build log / How it's made",
    subtitle: "Turn a repo, CAD, or build photos into a story",
    category: "launches",
    recipe: "story",
    spine: "voice",
    tag: "16:9 · STORY",
    defaultFormats: ["landscape"],
    defaultStyle: "Documentary",
    defaultMoods: ["Warm", "Punchy"],
    expandMore: true,
    titlePlaceholder: "Building a Pocket Camera",
    goalPlaceholder: "What did you build, what broke along the way, and what's the coolest part to reveal? Link your repo or build folder in References.",
    artwork: "build",
  },
  {
    id: "social-promo",
    title: "Social promo / Ad",
    subtitle: "Fast hook, bold kinetic type & sharp CTA",
    category: "launches",
    recipe: "story",
    spine: "voice",
    tag: "9:16 · PROMO",
    defaultFormats: ["vertical"],
    defaultStyle: "Motion graphics",
    defaultMoods: ["Punchy", "Upbeat"],
    expandMore: true,
    titlePlaceholder: "Launch Teaser",
    goalPlaceholder: "What's the hook in the first 2 seconds, the key benefit, and the call to action?",
    artwork: "promo",
  },
  {
    id: "podcast-clip",
    title: "Podcast / Multicam clip",
    subtitle: "Sync angles, auto-cut to speakers & caption",
    category: "talking",
    recipe: "story",
    spine: "transcript",
    tag: "9:16 · MULTICAM",
    defaultFormats: ["vertical"],
    defaultMoods: ["Punchy"],
    titlePlaceholder: "Episode 14 Highlight",
    goalPlaceholder: "Which moment or topic should we pull out into a tight social clip?",
    artwork: "multicam",
  },
  {
    id: "title-sequence",
    title: "Title sequence / Motion gfx",
    subtitle: "Pure designed typography, scenes & sound design",
    category: "talking",
    recipe: "motion",
    spine: "music",
    tag: "16:9 · MOTION",
    defaultFormats: ["landscape"],
    defaultStyle: "Motion graphics",
    defaultMoods: ["Cinematic", "Minimal"],
    titlePlaceholder: "Opening Titles",
    goalPlaceholder: "List the title text, credits, or key visual motif you want designed.",
    artwork: "titles",
  },
];

export const VISUAL_STYLES = [
  "Photorealistic",
  "Cinematic film",
  "2D Cartoon",
  "Anime",
  "Stop-motion",
  "3D Stylized",
  "Motion graphics",
  "Documentary",
] as const;

export const MOOD_PRESETS = [
  "Warm",
  "Cinematic",
  "Playful",
  "Punchy",
  "Dramatic",
  "Minimal",
  "Nostalgic",
  "Upbeat",
  "Witty",
  "Calm",
] as const;

export const LENGTH_PRESETS = [
  { id: "", label: "Flexible" },
  { id: "15", label: "~15s" },
  { id: "30", label: "~30s" },
  { id: "60", label: "~60s" },
  { id: "120", label: "~2 min" },
] as const;

export const recipeById = (id?: string) => (id ? RECIPES.find((r) => r.id === id) : undefined);

/**
 * Bundled looping preview videos dropped into `src/assets/recipes/<recipe-id>.mp4`. Vite discovers whatever exists at
 * build/dev time with zero 404s for recipes that still use their procedural card artwork.
 */
const previewModules = import.meta.glob<string>("./assets/recipes/*.mp4", { eager: true, import: "default" });
const previewById: Record<string, string> = {};
for (const [path, url] of Object.entries(previewModules)) {
  const id = path.split("/").pop()?.replace(/\.mp4$/i, "");
  if (id) previewById[id] = url;
}

export const recipePreviewUrl = (id: string): string | undefined => previewById[id];
