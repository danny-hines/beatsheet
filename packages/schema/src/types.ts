/**
 * The beatsheet project file: one JSON document that the studio UI and the agent read and write. A project holds
 * what every version of the video shares (the footage, its logs, the brief) and any number of cuts: a 30s sizzle,
 * a narrated long version, a softer take the agent tried. Each cut has its own formats, music, shots and notes.
 *
 * The rule the whole format follows: nothing is placed at a fixed time unless it has to be. Shots, music and
 * overlays hang off anchors (a word, a beat, a section, a moment in a clip, another shot), so re-recording a
 * line or swapping the song re-times everything that depends on it.
 */
import { z } from "zod";

export const SCHEMA_VERSION = "beatsheet/0.2";
/** The first format: one cut, one media folder. Still read, and upgraded when written. */
export const SCHEMA_V1 = "beatsheet/0.1";

// ---------------------------------------------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------------------------------------------

const offset = z.number().optional().describe("Seconds added after the anchor resolves (negative = earlier)");
const edge = z.enum(["start", "end"]).optional().describe("Which edge of the referenced span; default start");

/** A point in the cut, described by what it's attached to rather than by a timecode. */
export const Anchor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("time"), t: z.number().describe("Seconds from the start of the cut"), offset }),
  z.object({ kind: z.literal("line"), line: z.string(), edge, offset }),
  z.object({
    kind: z.literal("word"),
    line: z.string(),
    word: z.string().describe("Matched loosely: case and punctuation are ignored"),
    nth: z.number().int().min(0).optional().describe("Which occurrence of the word in the line; default 0"),
    edge,
    offset,
  }),
  z.object({
    kind: z.literal("beat"),
    n: z.number().describe("Count of units from the base; fractions interpolate between beats"),
    unit: z.enum(["beat", "bar"]).optional().describe("Default beat"),
    from: z.string().optional().describe("Music section id to count from; default the first downbeat in the cut"),
    offset,
  }),
  z.object({ kind: z.literal("section"), section: z.string(), edge, offset }),
  z.object({
    kind: z.literal("moment"),
    shot: z.string().describe("A clip shot whose source asset has the moment"),
    moment: z.string().describe("Moment id on that asset"),
    offset,
  }),
  z.object({ kind: z.literal("shot"), shot: z.string(), edge, offset }),
  z.object({ kind: z.literal("marker"), marker: z.string(), offset }),
  z.object({ kind: z.literal("end"), offset }),
]);
export type Anchor = z.infer<typeof Anchor>;
export type AnchorKind = Anchor["kind"];

// ---------------------------------------------------------------------------------------------------------------
// Project-level pieces
// ---------------------------------------------------------------------------------------------------------------

export const Format = z.object({
  id: z.string(),
  label: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  platforms: z.array(z.string()).optional(),
});
export type Format = z.infer<typeof Format>;

/** Something the person points at for inspiration or context. */
export const Reference = z.object({
  kind: z.enum(["folder", "file", "url", "note", "asset"]),
  value: z.string().describe("The path, URL, note text, or asset id"),
  label: z.string().optional(),
  note: z.string().optional().describe("What it is, or what the person wants done with it, e.g. match this pacing"),
});
export type Reference = z.infer<typeof Reference>;

/** Plain-text references from older files: a link, a path, or a note. */
export const referenceFrom = (s: string): Reference =>
  /^https?:\/\//i.test(s) ? { kind: "url", value: s } : /^[~/]/.test(s) ? { kind: /\.[a-z0-9]{2,5}$/i.test(s) ? "file" : "folder", value: s } : { kind: "note", value: s };

/** What the project is for, shared by every cut. */
export const Brief = z.object({
  goal: z.string(),
  audience: z.string().optional(),
  tone: z.array(z.string()).optional(),
  references: z.array(z.union([Reference, z.string().transform(referenceFrom)])).optional(),
  notes: z.string().optional(),
});
export type Brief = z.infer<typeof Brief>;

/** What one cut is: its purpose and length, and anything it does differently from the brief. */
export const CutSpec = z.object({
  purpose: z.string().optional().describe("The cut in a line, e.g. 30s sizzle for Instagram"),
  audience: z.string().optional().describe("Overrides the brief's audience for this cut"),
  tone: z.array(z.string()).optional().describe("Overrides the brief's tone for this cut"),
  platforms: z.array(z.string()).optional(),
  targetLength: z.number().positive().optional().describe("Seconds"),
  maxLength: z.number().positive().optional().describe("Seconds"),
});
export type CutSpec = z.infer<typeof CutSpec>;

/** Where a cut came from: made from scratch, or branched from another by the person or the agent. */
export const Origin = z.object({
  by: z.enum(["you", "agent"]),
  from: z.string().optional().describe("The cut it was branched from"),
  note: z.string().optional().describe("Why, e.g. a bouncier take"),
  at: z.string().optional(),
});
export type Origin = z.infer<typeof Origin>;

/**
 * How the footage is coloured across the whole video, the way a colourist grades a film: warm and bright for a beach
 * day, cool and faded for a winter morning. Applies to every clip and photo (not to designed scenes' own drawing).
 */
export const Grade = z.object({
  warmth: z.number().min(-1).max(1).optional().describe("-1 cool and blue … 1 warm and golden; 0.3 is a sunny afternoon"),
  tint: z.number().min(-1).max(1).optional().describe("-1 green … 1 magenta; small amounts"),
  saturation: z.number().min(0).max(2).optional().describe("1 as shot; 1.15 lively, 0.8 muted, 0 black and white"),
  contrast: z.number().min(0).max(2).optional().describe("1 as shot; 1.1 punchy, 0.9 soft"),
  brightness: z.number().min(0).max(2).optional().describe("1 as shot"),
  fade: z.number().min(0).max(1).optional().describe("Lifted blacks, like film or a faded print; 0.3 is gentle"),
  vignette: z.number().min(0).max(1).optional().describe("Darker corners; 0.3 is gentle"),
});
export type Grade = z.infer<typeof Grade>;

/**
 * The project's visual identity: colours, type, texture and grade that titles, captions, scenes and footage draw with.
 * From the brand when there is one (a site's CSS, a logo); for personal footage, from the footage itself and the
 * occasion (the sand and sea of a beach trip, the candlelight of a wedding), in the mood the person is after.
 */
export const Look = z.object({
  name: z.string().optional().describe("A few words, e.g. Sun-bleached postcard"),
  note: z.string().optional().describe("Where it comes from and how it should feel, e.g. the sand, sea and towels of the footage; soft and sunny, nothing harsh"),
  colors: z
    .record(z.string(), z.string())
    .optional()
    .describe("Named colours, e.g. {paper:'#f4f0e8', ink:'#151515', accent:'#d7ff42', violet:'#6657de'}. paper and ink are the default background and text; accent highlights (the spoken word in captions, key words)"),
  fonts: z
    .object({
      display: z.string().optional().describe("Big type: titles, kinetic words, captions, e.g. Arial Black"),
      displayWeight: z.number().int().min(100).max(1000).optional().describe("The display font's weight, e.g. 800 for Inter's heavy headings; default bold"),
      caps: z.boolean().optional().describe("Big type in capitals (default true); false for a script, handwritten or rounded face that reads better as written"),
      body: z.string().optional(),
      mono: z.string().optional(),
    })
    .optional()
    .describe("Font families: installed on this Mac, or loaded from fontFiles"),
  fontFiles: z
    .array(z.object({ family: z.string(), path: z.string().describe("A .woff2, .ttf or .otf, relative to the project folder"), weight: z.string().optional(), style: z.string().optional() }))
    .optional(),
  grain: z.number().min(0).max(1).optional().describe("Film grain over the whole picture; 0.06 is subtle"),
  grade: Grade.optional(),
  logo: z.string().optional().describe("Asset id of the logo"),
  style: z
    .string()
    .optional()
    .describe("The style made shots are drawn in: the id of a style in the cast (@hand-drawn). Sheets and boards follow it unless a cast member has its own; without one, they're photographs"),
});
export type Look = z.infer<typeof Look>;

/** A folder of footage. Asset paths are relative to their source. */
export const Source = z.object({
  id: z.string(),
  path: z.string().describe("The folder; ~ allowed; relative paths are from the project folder"),
  label: z.string().optional(),
});
export type Source = z.infer<typeof Source>;

export const STAGE_IDS = ["brief", "material", "structure", "board", "assemble", "craft", "sound", "finish"] as const;
export const StageId = z.enum(STAGE_IDS);
export type StageId = z.infer<typeof StageId>;

export const StageState = z.object({
  status: z.enum(["todo", "active", "done", "skipped"]),
  locked: z.boolean().optional().describe("Locked stages are off limits to edits, including the agent's"),
  summary: z.string().optional(),
});
export type StageState = z.infer<typeof StageState>;

export const Spine = z.enum(["voice", "music", "shots", "transcript"]).describe("What the cut's timing hangs off");
export type Spine = z.infer<typeof Spine>;

// ---------------------------------------------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------------------------------------------

export const Moment = z.object({
  id: z.string(),
  t: z.number().describe("Seconds into the source file"),
  end: z.number().optional(),
  label: z.string(),
  score: z.number().min(0).max(1).optional().describe("How strong the moment is, from logging"),
});
export type Moment = z.infer<typeof Moment>;

export const BeatGrid = z.object({
  bpm: z.number().positive(),
  downbeat: z.number().describe("Seconds into the track of a bar's first beat"),
  beatsPerBar: z.number().int().positive().default(4),
});
export type BeatGrid = z.infer<typeof BeatGrid>;

export const MusicSection = z.object({
  id: z.string(),
  label: z.string(),
  start: z.number().describe("Seconds into the track"),
  end: z.number().optional(),
  level: z.enum(["low", "mid", "high"]).optional().describe("Energy, from analysis; sets how fast a montage cuts"),
});
export type MusicSection = z.infer<typeof MusicSection>;

export const Provenance = z.object({
  source: z.enum(["import", "capture", "generated", "recorded", "synth"]),
  provider: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  seed: z.union([z.number(), z.string()]).optional(),
  refs: z.array(z.string()).optional().describe("Asset ids used as references"),
  costUsd: z.number().optional(),
  createdAt: z.string().optional(),
  op: z.string().optional().describe("What was asked for: image, video"),
  params: z.record(z.string(), z.unknown()).optional().describe("Enough to ask again: the catalog model, length, aspect"),
  job: z.string().optional().describe("The job that made it"),
  cast: z.array(z.string()).optional().describe("The cast and sets it was made with"),
});
export type Provenance = z.infer<typeof Provenance>;

/** An area of the picture in 0..1 of its width and height as displayed (after rotation), origin top-left. */
export const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
export type Rect = z.infer<typeof Rect>;

export const SUBJECT_KINDS = ["face", "person", "object"] as const;
export const SubjectTrack = z.object({
  id: z.string(),
  label: z.string().describe("Who or what it is: \"Face 1\" until someone names it, e.g. \"Theo\""),
  kind: z.enum(SUBJECT_KINDS),
  by: z.string().optional().describe("What found it: apple-vision, sam-3.1"),
  samples: z
    .array(z.array(z.number()).length(5))
    .describe("[t, x, y, w, h]: seconds into the file, and its box in 0..1 of the picture as displayed, origin top-left"),
});
export type SubjectTrack = z.infer<typeof SubjectTrack>;

export const Asset = z.object({
  id: z.string(),
  kind: z.enum(["video", "image", "audio", "music", "voice", "sfx", "other"]),
  source: z.string().optional().describe("Source folder id; default the first source"),
  path: z.string().describe("Relative to its source folder, or absolute"),
  label: z.string().optional(),
  duration: z.number().optional(),
  width: z.number().int().optional().describe("As displayed, after rotation"),
  height: z.number().int().optional(),
  fps: z.number().optional(),
  capturedAt: z.string().optional().describe("When it was shot, ISO 8601"),
  tags: z.array(z.string()).optional(),
  rating: z.number().int().min(-1).max(5).optional().describe("-1 rejected, 0 unrated, 1-5 stars"),
  moments: z.array(Moment).optional(),
  grid: BeatGrid.optional(),
  sections: z.array(MusicSection).optional(),
  provenance: Provenance.optional(),
  color: z.string().optional().describe("Stand-in swatch when no thumbnail exists yet"),
  subjects: z.array(SubjectTrack).optional().describe("Faces, people and things found or followed in it, for effects that follow them"),
  cutout: z
    .object({
      of: z.string().describe("The asset it was lifted from"),
      box: Rect.optional().describe("Where the subject sits in the frame"),
      from: z.number().optional().describe("For a clip: the second of the source it starts at"),
    })
    .optional()
    .describe("A transparent cut-out of a subject from another asset; it lines up over its source when both are on screen"),
});
export type Asset = z.infer<typeof Asset>;

// ---------------------------------------------------------------------------------------------------------------
// Voice and music
// ---------------------------------------------------------------------------------------------------------------

export const Word = z.object({ w: z.string(), s: z.number(), e: z.number() });
export type Word = z.infer<typeof Word>;

export const Line = z.object({
  id: z.string(),
  text: z.string().describe("What appears in captions"),
  tts: z.string().optional().describe("Spoken form, when it differs from text"),
  file: z.string().optional(),
  duration: z.number().nonnegative(),
  words: z.array(Word).describe("Times relative to the line's start"),
  gapAfter: z.number().optional().describe("Pause after this line; default voice.defaultGap (voice.tail if last)"),
  gaps: z.record(z.string(), z.number()).optional().describe("Per-format pause overrides, by format id"),
  holdBefore: z.number().optional().describe("Extra time before the line (title cards, breathers)"),
  only: z.array(z.string()).optional().describe("Format ids this line appears in; default all"),
});
export type Line = z.infer<typeof Line>;

export const Voice = z.object({
  voice: z.string().optional().describe("Who reads the lines: elevenlabs:<voice id>, kokoro:<voice> or mac:<identifier>"),
  leadIn: z.number().default(0.3),
  defaultGap: z.number().default(0.5),
  tail: z.number().default(1).describe("Seconds after the last line before the cut ends, unless that line sets its own gap"),
  lines: z.array(Line),
});
export type Voice = z.infer<typeof Voice>;

export const MusicCue = z.object({
  id: z.string(),
  asset: z.string(),
  from: z.number().optional().describe("Seconds into the track where this cue begins; default 0"),
  sync: z
    .object({ track: z.number().describe("Seconds into the track"), at: Anchor })
    .optional()
    .describe("Lands a point in the track on an anchor, e.g. the drop on the title line"),
  start: Anchor.optional().describe("Used only without sync; default the start of the cut"),
  to: z.number().optional().describe("Seconds into the track where this cue stops; default the end of the file"),
  end: Anchor.optional().describe("Default: where `to` is reached or the next cue starts, whichever is first"),
  fadeIn: z.number().optional(),
  fadeOut: z.number().optional(),
  gain: z.number().optional(),
  only: z.array(z.string()).optional(),
});
export type MusicCue = z.infer<typeof MusicCue>;

export const Music = z.object({
  cues: z.array(MusicCue),
  duck: z.number().min(0).max(1).optional().describe("How loud the music plays under narration, as a fraction of its level; default 0.35 when there's narration, 1 turns ducking off"),
});
export type Music = z.infer<typeof Music>;

/** The sounds that come with beatsheet (synthesized for it, free to use). */
export const SFX_SOUNDS = ["whoosh", "whoosh-short", "swish", "pop", "pop-high", "pop-low", "tick", "click", "typing", "impact", "boom", "riser", "shimmer", "glitch", "shutter", "success", "ding"] as const;
/** How long each built-in sound lasts, in seconds (packages/engine/sfx; make_sfx.py makes them). */
export const SFX_SECONDS: Record<(typeof SFX_SOUNDS)[number], number> = {
  whoosh: 0.7, "whoosh-short": 0.32, swish: 0.22, pop: 0.12, "pop-high": 0.09, "pop-low": 0.16, tick: 0.035, click: 0.06, typing: 1.1,
  impact: 0.7, boom: 1.4, riser: 1.6, shimmer: 1.3, glitch: 0.35, shutter: 0.19, success: 0.95, ding: 1.1,
};

/** A sound effect on a moment of the cut: a whoosh on a cut, a pop when a card lands, the shutter on "click". */
export const SfxCue = z.object({
  id: z.string(),
  sound: z.string().describe("A built-in sound (whoosh, whoosh-short, swish, pop, pop-high, pop-low, tick, click, typing, impact, boom, riser, shimmer, glitch, shutter, success, ding) or an asset id"),
  at: Anchor,
  gain: z.number().optional().describe("Default 0.5"),
  only: z.array(z.string()).optional(),
});
export type SfxCue = z.infer<typeof SfxCue>;

/** Narration shown as words on screen, phrase by phrase, the spoken word highlighted. */
export const Captions = z.object({
  style: z.enum(["words", "phrases"]).optional().describe("words: the spoken word highlighted in its phrase (default); phrases: no highlight"),
  position: z.enum(["bottom", "middle", "top"]).optional().describe("Default bottom, clear of the platforms' buttons"),
  size: z.number().positive().optional().describe("Scale, default 1"),
  uppercase: z.boolean().optional().describe("Default: as the look sets its big type (fonts.caps), capitals unless it says otherwise"),
});
export type Captions = z.infer<typeof Captions>;

// ---------------------------------------------------------------------------------------------------------------
// Tracks and shots
// ---------------------------------------------------------------------------------------------------------------

export const Track = z.object({
  id: z.string(),
  kind: z.enum(["picture", "overlay", "text", "audio", "sfx"]),
  label: z.string(),
});
export type Track = z.infer<typeof Track>;

export const Reframe = z.object({
  x: z.number().min(0).max(1).describe("Focus point, 0..1 across the source"),
  y: z.number().min(0).max(1),
  zoom: z.number().positive().default(1),
  follow: z.string().optional().describe("Subject id on the asset: the focus point follows it (x, y are where it is when it isn't found)"),
});

/** Where the picture is at one end of a shot: zoomed, nudged across the frame, turned. */
const Pose = z.object({
  scale: z.number().positive().optional().describe("1 fills the frame"),
  x: z.number().optional().describe("Shift across, as a fraction of the frame's width (0.1 = a tenth to the right)"),
  y: z.number().optional().describe("Shift down, as a fraction of the frame's height"),
  rotate: z.number().optional().describe("Degrees"),
});
export const Motion = z.object({
  from: Pose.optional(),
  to: Pose.optional(),
  ease: z.enum(["linear", "in", "out", "in-out"]).optional().describe("Default in-out"),
});
export type Motion = z.infer<typeof Motion>;

export const ClipEffect = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("blur"),
    subject: z.string().describe("Subject id on the clip's asset"),
    amount: z.number().min(0).max(1).optional().describe("0..1, default 0.6"),
    shape: z.enum(["ellipse", "box"]).optional(),
  }),
  z.object({
    kind: z.literal("label"),
    subject: z.string(),
    text: z.string().describe("A name tag that follows the subject"),
    place: z.enum(["above", "below"]).optional(),
  }),
  z.object({
    kind: z.literal("spotlight"),
    subject: z.string(),
    amount: z.number().min(0).max(1).optional().describe("How dark the rest gets, default 0.55"),
  }),
]);
export type ClipEffect = z.infer<typeof ClipEffect>;

export const ShotContent = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("placeholder"), description: z.string() }),
  z.object({
    kind: z.literal("clip"),
    asset: z.string(),
    in: z.number().optional().describe("Seconds into the source; ignored when sync is set"),
    sync: z
      .object({ moment: z.union([z.string(), z.number()]).describe("Moment id or source seconds"), at: Anchor })
      .optional()
      .describe("Slides the clip so this moment plays at the anchor, e.g. the jump on the drop"),
    speed: z.number().positive().optional(),
    reframe: z.record(z.string(), Reframe).optional().describe("Per format id"),
    look: z.string().optional().describe("mono, dim, blur, mono-dim, warm, cool or faded"),
    volume: z.number().optional(),
    effects: z.array(ClipEffect).optional().describe("Drawn on the clip and following a subject: blur a face, a name tag, a spotlight"),
    motion: Motion.optional().describe("Moves the picture through the shot: a push in, a pull out, a pan, a tilt. Photos without it get a slow push in"),
  }),
  z.object({
    kind: z.literal("generated"),
    prompt: z.string(),
    take: z.string().optional().describe("Asset id of the chosen take"),
    takes: z.array(z.string()).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    refs: z.array(z.string()).optional(),
    cast: z.array(z.string()).optional().describe("Cast and sets in it beyond the ones its prompt names (@cat): cat, or cat/heist for a variant"),
    start: z.string().optional().describe("Asset id of the picture a video take starts from (usually the shot's board)"),
    end: z.string().optional().describe("Asset id of the picture a video take ends on"),
    in: z.number().optional().describe("Seconds into the take: takes are made a little longer than the shot, so it can be retimed"),
  }),
  z.object({
    kind: z.literal("coded"),
    component: z
      .string()
      .describe("A scene written for this project, file#export relative to the project's code folder (scenes/Hook.tsx#Hook), or a ready-made one: kit:Slam, kit:Split, kit:Callouts…"),
    props: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({ kind: z.literal("text"), text: z.string(), style: z.string().optional().describe("title-bold, title-huge (big enough to tuck behind a cut-out) or handwritten") }),
]);
export type ShotContent = z.infer<typeof ShotContent>;
export type ShotKind = ShotContent["kind"];

export const FIDELITY = ["idea", "board", "rough", "final"] as const;
export const Fidelity = z.enum(FIDELITY).describe("How far along this one shot is, independent of the rest");
export type Fidelity = z.infer<typeof Fidelity>;

export const Knob = z.object({
  value: z.union([z.number(), z.string(), z.boolean()]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  label: z.string().optional(),
});
export type Knob = z.infer<typeof Knob>;

export const Shot = z.object({
  id: z.string(),
  track: z.string(),
  label: z.string().optional(),
  intent: z.string().optional().describe("What the shot is for; the brief for anyone building it"),
  start: Anchor.optional().describe("Default: the previous shot's end on this track, else 0"),
  end: Anchor.optional().describe("Default: start + duration, else the next shot's start, else the end of the cut"),
  duration: z.number().positive().optional(),
  content: ShotContent,
  fidelity: Fidelity,
  transition: z
    .object({
      kind: z.string().describe("How it comes in: pop, fade, slide-up, zoom, whip, flash, wipe, glitch, blur or slam (with a shake)"),
      duration: z.number().optional().describe("Seconds, default 0.35"),
    })
    .optional(),
  captions: z.boolean().optional().describe("false hides the narration captions while this shot plays (when it already shows the same words)"),
  knobs: z.record(z.string(), Knob).optional().describe("Named values the UI exposes as controls"),
  only: z.array(z.string()).optional(),
  locked: z.boolean().optional(),
});
export type Shot = z.infer<typeof Shot>;

export const Marker = z.object({ id: z.string(), label: z.string(), at: Anchor });
export type Marker = z.infer<typeof Marker>;

// ---------------------------------------------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------------------------------------------

export const NoteTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project") }),
  z.object({ kind: z.literal("shot"), shot: z.string() }),
  z.object({ kind: z.literal("line"), line: z.string() }),
  z.object({ kind: z.literal("word"), line: z.string(), word: z.string(), nth: z.number().int().optional() }),
  z.object({ kind: z.literal("asset"), asset: z.string() }),
  z.object({ kind: z.literal("cue"), cue: z.string() }),
  z.object({ kind: z.literal("section"), section: z.string() }),
  z.object({ kind: z.literal("time"), t: z.number() }),
  z.object({ kind: z.literal("range"), from: z.number(), to: z.number() }).describe("A stretch of the cut, in seconds"),
]);
export type NoteTarget = z.infer<typeof NoteTarget>;

export const NOTE_STATUSES = ["open", "queued", "working", "done", "dismissed"] as const;
export const Note = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(NOTE_STATUSES).describe("open: still drafting; queued: in the next batch; working: agent has it"),
  target: NoteTarget,
  at: z.number().optional().describe("Playhead (s) when the note was made"),
  region: Rect.optional().describe("Normalised area of the frame the note points at"),
  format: z.string().optional(),
  stage: StageId.optional(),
  author: z.enum(["you", "agent"]),
  createdAt: z.string(),
  reply: z.string().optional(),
  batch: z.string().optional(),
});
export type Note = z.infer<typeof Note>;
export type NoteStatus = Note["status"];

// ---------------------------------------------------------------------------------------------------------------
// Cuts and the project
// ---------------------------------------------------------------------------------------------------------------

/** Everything that differs between versions of the video. */
const cutBody = {
  recipe: z.string().describe("Which recipe skill drives this cut, e.g. montage, narrated, cinematic"),
  spec: CutSpec.default({}),
  formats: z.array(Format).min(1),
  stages: z.record(StageId, StageState),
  spine: Spine,
  voice: Voice.optional(),
  music: Music.optional(),
  captions: Captions.optional().describe("Narration as words on screen; present means on"),
  sfx: z.array(SfxCue).optional(),
  tracks: z.array(Track),
  shots: z.array(Shot),
  markers: z.array(Marker).optional(),
  notes: z.array(Note),
  end: Anchor.optional().describe("Default: voice tail after the last line, else the last music cue, else the last shot"),
};

export const Cut = z.object({ id: z.string(), name: z.string(), origin: Origin.optional(), ...cutBody });
export type Cut = z.infer<typeof Cut>;

/**
 * What the agent needs from the person when it hands the turn over: a pick between a few directions, a look at a cut,
 * or something only they can provide (a song, more footage).
 */
const ChooseOption = z.object({
  id: z.string(),
  label: z.string().describe("A few words, e.g. Sweet family recap · 45s"),
  detail: z.string().optional().describe("One or two sentences on what it would be"),
  asset: z.string().optional().describe("An asset that shows the idea"),
  assets: z.array(z.string()).max(6).optional().describe("Key frames that sketch it, in order, like a storyboard"),
  image: z.string().optional().describe("A picture made for the option (a look's preview from preview_looks), relative to the project folder"),
  cut: z.string().optional().describe("A cut that already shows the idea"),
});
export type ChooseOption = z.infer<typeof ChooseOption>;

export const HandOff = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("choose"),
    message: z.string().describe("The question, in a sentence"),
    options: z.array(ChooseOption).min(2).max(6),
    multiple: z.boolean().optional().describe("The person may pick more than one (each becomes its own cut)"),
    questions: z
      .array(
        z.object({
          id: z.string(),
          message: z.string(),
          options: z.array(ChooseOption).min(2).max(6),
          multiple: z.boolean().optional(),
        }),
      )
      .max(2)
      .optional()
      .describe("More questions on the same card, answered together: the look to go with the directions, say"),
  }),
  z.object({ kind: z.literal("review"), message: z.string(), cut: z.string().optional().describe("The cut to watch; default the one on screen") }),
  z.object({
    kind: z.literal("provide"),
    message: z.string(),
    need: z
      .enum(["song", "footage", "text", "chrome", "cast"])
      .describe("chrome: the person's own signed-in Chrome, which they let the agent use with one click; cast: pictures of someone or somewhere only they have"),
  }),
]);
export type HandOff = z.infer<typeof HandOff>;

/** Whose move it is. The agent's turn runs until it hands off; then it's the person's until they answer. */
export const Turn = z.object({
  who: z.enum(["agent", "you"]),
  since: z.string(),
  ask: HandOff.optional().describe("What the agent asked for, when it's the person's turn"),
  cut: z.string().optional().describe("The cut the turn is about"),
  before: z.string().optional().describe("Snapshot of the project from when the agent's turn began, for undoing it"),
  changes: z.array(z.string()).optional().describe("What the agent's last turn changed, in a few short lines"),
  session: z
    .object({ agent: z.string(), id: z.string() })
    .optional()
    .describe("The hosted agent session that took the turn, so the studio can reopen that conversation (after a restart, say)"),
});
export type Turn = z.infer<typeof Turn>;

/**
 * A character, place, prop or style that made shots keep the same from shot to shot: who or what it is, in words that
 * go into every prompt that names it (@cat), and pictures that models are given to match. Shared by every cut.
 */
export const CastMember = z.object({
  id: z.string().describe("What prompts call it: @cat"),
  name: z.string(),
  kind: z.enum(["character", "place", "prop", "style"]),
  about: z.string().optional().describe("A short, specific description: orange tabby, white chest and paws, green eyes, a notch in the left ear"),
  seen: z
    .array(z.object({ asset: z.string(), subject: z.string().optional().describe("Which of the asset's subjects it is; default the whole picture") }))
    .optional()
    .describe("Where it is in the project's own media: the photos and clips it was made from"),
  images: z.array(z.string()).optional().describe("Asset ids of the pictures models are given (its sheet, or cut-outs); the first is the main one"),
  variants: z
    .array(z.object({ id: z.string(), about: z.string().describe("What's different: wearing a tiny black eye mask"), images: z.array(z.string()).optional() }))
    .optional()
    .describe("The same one in another outfit, state or time of day: @cat/heist"),
  voice: z.string().optional().describe("For a character: the voice that reads its lines"),
  style: z.string().optional().describe("For one drawn unlike the rest (a cartoon cat in a photographed street): the id of a style in the cast. Default the look's"),
});
export type CastMember = z.infer<typeof CastMember>;

/** What every cut shares. */
const shared = {
  id: z.string(),
  title: z.string(),
  sources: z.array(Source).default([]),
  codeRoot: z.string().optional().describe("Folder coded shots' component paths are relative to; ~ allowed. Default the project folder"),
  look: Look.optional(),
  brief: Brief,
  assets: z.array(Asset),
  cast: z.array(CastMember).optional().describe("Cast and sets: the characters, places, props and styles made shots keep"),
};

/** The file on disk. */
export const ProjectFile = z.object({ schema: z.literal(SCHEMA_VERSION), ...shared, cuts: z.array(Cut).min(1), turn: Turn.optional() });
export type ProjectFile = z.infer<typeof ProjectFile>;
export type ProjectFileInput = z.input<typeof ProjectFile>;

/**
 * One cut together with the project's shared material: what the resolver, the player, the renderer and edits work
 * on. `cut` says which cut it is; everything else reads like a single-cut project.
 */
export const Project = z.object({
  ...shared,
  cut: z.object({ id: z.string(), name: z.string(), origin: Origin.optional() }).default({ id: "main", name: "Main cut" }),
  ...cutBody,
});
export type Project = z.infer<typeof Project>;
export type ProjectInput = z.input<typeof Project>;
