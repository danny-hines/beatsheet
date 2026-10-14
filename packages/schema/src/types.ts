/**
 * The beatsheet project file: one JSON document that every stage, the studio UI and the agent read and write.
 *
 * The rule the whole format follows: nothing is placed at a fixed time unless it has to be. Shots, music and
 * overlays hang off anchors (a word, a beat, a section, a moment in a clip, another shot), so re-recording a
 * line or swapping the song re-times everything that depends on it.
 */
import { z } from "zod";

export const SCHEMA_VERSION = "beatsheet/0.1";

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

export const Brief = z.object({
  goal: z.string(),
  audience: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  targetLength: z.number().positive().optional().describe("Seconds"),
  maxLength: z.number().positive().optional().describe("Seconds"),
  tone: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
  notes: z.string().optional(),
});
export type Brief = z.infer<typeof Brief>;

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
});
export type Provenance = z.infer<typeof Provenance>;

export const Asset = z.object({
  id: z.string(),
  kind: z.enum(["video", "image", "audio", "music", "voice", "sfx", "other"]),
  path: z.string().describe("Relative to the project's mediaRoot"),
  label: z.string().optional(),
  duration: z.number().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  rating: z.number().int().min(-1).max(5).optional().describe("-1 rejected, 0 unrated, 1-5 stars"),
  moments: z.array(Moment).optional(),
  grid: BeatGrid.optional(),
  sections: z.array(MusicSection).optional(),
  provenance: Provenance.optional(),
  color: z.string().optional().describe("Stand-in swatch when no thumbnail exists yet"),
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
  voice: z.string().optional(),
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

export const Music = z.object({ cues: z.array(MusicCue) });
export type Music = z.infer<typeof Music>;

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
});

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
    look: z.string().optional(),
    volume: z.number().optional(),
  }),
  z.object({
    kind: z.literal("generated"),
    prompt: z.string(),
    take: z.string().optional().describe("Asset id of the chosen take"),
    takes: z.array(z.string()).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    refs: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal("coded"),
    component: z.string().describe("Source file and export, e.g. src/scenes/Payoff.tsx#Ready"),
    props: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({ kind: z.literal("text"), text: z.string(), style: z.string().optional() }),
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
  transition: z.object({ kind: z.string(), duration: z.number().optional() }).optional(),
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
]);
export type NoteTarget = z.infer<typeof NoteTarget>;

export const NOTE_STATUSES = ["open", "queued", "working", "done", "dismissed"] as const;
export const Note = z.object({
  id: z.string(),
  text: z.string(),
  status: z.enum(NOTE_STATUSES).describe("open: still drafting; queued: in the next batch; working: agent has it"),
  target: NoteTarget,
  at: z.number().optional().describe("Playhead (s) when the note was made"),
  region: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .optional()
    .describe("Normalised area of the frame the note points at"),
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
// The project
// ---------------------------------------------------------------------------------------------------------------

export const Project = z.object({
  schema: z.literal(SCHEMA_VERSION),
  id: z.string(),
  title: z.string(),
  recipe: z.string().describe("Which recipe skill drives this project, e.g. montage, narrated, cinematic"),
  mediaRoot: z.string().optional().describe("Folder asset paths are relative to; ~ allowed"),
  codeRoot: z.string().optional().describe("Folder coded shots' component paths are relative to; ~ allowed"),
  brief: Brief,
  formats: z.array(Format).min(1),
  stages: z.record(StageId, StageState),
  spine: Spine,
  assets: z.array(Asset),
  voice: Voice.optional(),
  music: Music.optional(),
  tracks: z.array(Track),
  shots: z.array(Shot),
  markers: z.array(Marker).optional(),
  notes: z.array(Note),
  end: Anchor.optional().describe("Default: voice tail after the last line, else the last music cue, else the last shot"),
});
export type Project = z.infer<typeof Project>;
/** What a project file looks like on disk before defaults are applied. */
export type ProjectInput = z.input<typeof Project>;
