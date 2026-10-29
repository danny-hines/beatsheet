# Making new footage

Design notes for making footage that doesn't exist yet (characters, places, clips, voices and sounds), for changing footage you already have, and for how all of it reaches the timeline. None of it is built beyond what [Today](#today) lists. The reasoning behind beatsheet as a whole is in [DESIGN.md](DESIGN.md).

## The problem

beatsheet can take a folder of footage and cut it to music or a voice. The next step is footage nobody shot: a character you described, the same place from another angle, a clip that runs two seconds longer than the camera did, someone in your footage replaced by someone else.

Most AI video tools start from generating. You write a prompt, get a grid of clips, and only then work out where they go and whether they fit together. Nothing in the tool knows that a clip is the third shot of a 60-second video, that it has to last 3.2 seconds, carry on from the shot before and keep the same cat.

beatsheet starts from the video. You describe it, the agent works out the story with you, and the cut fills with placeholders: one per shot, each with its length, its place and what it's for. Generating is filling those in. Every shot already knows its exact length (from its anchors), its formats, the shots either side, the line it covers and the project's look, so a request aimed at a shot can use all of that, and the result lands where it's needed.

## Principles

1. **The video comes first.** A brief and a structure come before any generating, so every piece is made for a place in the cut.
2. **The shot is the way in.** Most generating starts from a shot on the timeline: a placeholder, a generated shot that needs another take, or a clip that needs changing. The request carries the shot's context, and the results come back as its takes.
3. **Cheap before expensive.** Each shot climbs the fidelity ladder the format already has: idea (a card), board (a still), rough (a fast video model), final (the best one). Stills cost cents and video costs dollars, so the story, the cast and the framing are settled on stills.
4. **Make mode for what isn't one shot.** Characters and places, open-ended exploring and batches get their own mode beside Edit. Both share the Library, the Agent and the same composer.
5. **What you attach decides what you're making.** There's no choosing "image to video" before you start. A prompt alone makes a clip; add a picture and it animates the picture; add the frame before and it continues from it; add a character and it keeps them.
6. **Generated takes are footage.** They're assets like any other, and the look's grade, reframes, effects and cut-outs apply to them the same way. Where they came from is in their provenance.
7. **Changing footage never loses it.** Extending, relighting or replacing someone makes a new version of the shot. The original stays, one click away.
8. **Show every model, and say why one can't be used.** Grayed out with a reason and a way to fix it, never hidden. The studio's picker and the agent's tools read the same catalog, with the same reasons and costs.
9. **Spending is visible.** Every Make button says what it'll cost. The agent works within a budget and asks before going over it.

## A video from nothing

The example: *a 60-second day in the life of my cat, who leaves the house in the morning, lives a life of crime, and comes home to a family with no idea.* An empty project, and no footage.

1. **Brief.** The person writes that in the Brief. The agent asks for what only they have, with a `provide` hand-off: pictures of the cat, and of the family if they're to look like themselves.
2. **Directions.** A `choose` hand-off with two or three takes on the story that differ in angle: a noir heist told in the cat's inner monologue, a silent caper scored like a spy film, a nature documentary that slowly realizes what it's filming. Each is a logline and the arc in a few sentences; the options don't need pictures yet. With `multiple`, each pick becomes its own cut, so two can be tried side by side.
3. **Structure.** The agent writes the beats (12 to 16 for 60 seconds, in acts: morning, the job, home) straight onto the timeline as placeholder shots. Each has its `intent`, a description of what's on screen, a length, and the cast and sets in it (`@cat`, `@kitchen`). It plays as a run of cards, so the pacing can be judged before anything is made. The person reorders and retimes on the timeline and leaves notes ("the crimes should escalate", "lose the bank, it's too much"), and the agent works through them. Locking `structure` says the story is settled.
4. **Cast & sets.** The cast came out of the beats as names and descriptions, with no pictures yet: the cat, the family, an accomplice, the house, the alley, the fish market. In Make, the cat's sheet is built from the person's photos, and the agent makes sheets for the rest, handing off a `choose` for each one that needs a decision. A style entry (photoreal, stop-motion, noir black and white) settles how everything is drawn, shown as the same beat in each style.
5. **Boards.** The agent makes a still for every shot from its cast and sets, at cents each, and the cut plays as an animatic. A note on a shot ("she should be wearing the tiny mask here") gets its still made again. The stills become the start frames for video, so consistency is settled where it's cheap.
6. **Rough, then final.** Each board is animated with a fast, cheap model, and the cut is reviewed as a whole. Then the shots that stay are made again with the best model. The estimate for the whole pass is shown before it starts ("16 shots, 2 takes each, about $14"). The preview always uses the best version of each shot, so the cut is watchable at every step.
7. **Sound.** A score made to fit the structure (or a song the person brings, which can come first instead), with the shots anchored to its bars as a montage's are; sound effects on the hits; and voices for the characters, if they speak.

The person works where it suits them: the story and its timing in Edit, the cast and sets (and any one shot they want to make by hand) in Make. The agent drives the batches between hand-offs, so nobody has to visit every shot.

The stages run in a different order from a footage project's: `material` (the cast and sets) comes after `structure`, because the cast comes out of the story.

## Prior art

- **Pages over shared media.** DaVinci Resolve splits the work into pages (Media, Cut, Edit, Fusion, Color, Fairlight, Deliver), and the media pool is the same on every page. That's the model for Edit and Make.
- **Story before video.** LTX Studio turns a script into a storyboard of stills before making video, and pulls the characters and objects out of it as Elements that each shot is tagged with. Kling's Elements and Google Flow's Ingredients are reusable references too.
- **Generating inside the edit.** Premiere's Generative Extend: drag a clip's edge past the end of its footage and it makes the missing frames. There's no prompt; it's an edit, not a request.
- **Prompted edits to real footage.** Runway Aleph (new angles, relighting, adding and removing things), Luma's Modify and Kling O1 change a clip from an instruction. Wan 2.2 Animate replaces a character and keeps the motion.
- **Node canvases.** Figma Weave (once Weavy), Freepik Spaces, Krea Nodes and ComfyUI wire models together as a graph. In beatsheet the agent wires the steps together, so there's no graph.
- **Many models in one picker.** Krea and Higgsfield put dozens of models in one picker, some of them gated by plan and credits.

## Today

What there is to build on:

- **A generated shot.** `ShotContent` has `kind: "generated"` with `prompt`, `take`, `takes`, `provider`, `model` and `refs` ([types.ts](../packages/schema/src/types.ts)). It's validated, and it plays its take through the same picture path as footage, with the project's grade. Nothing makes one yet. [examples/lisbon-montage](../examples/lisbon-montage/project.json) shows the intended shape, with two Kling takes from fal.
- **Provenance.** Every asset has `provenance`: `source`, `provider`, `model`, `prompt`, `seed`, `refs`, `costUsd` and `createdAt`. Nothing sets `seed` or `costUsd` yet.
- **Services.** [services.ts](../packages/engine/src/services.ts) checks keys for fal, ElevenLabs, Gemini, Meta, Runway, OpenAI, Replicate and Pexels, and says which capabilities each one unlocks. Only voices, music and sound effects (ElevenLabs, Kokoro, the system's own voices) and cut-outs (SAM, Apple Vision) are actually made today.
- **Gray with a reason.** Settings → What it can do (`Abilities` in [Setup.tsx](../apps/studio/src/components/Setup.tsx)) dims the capabilities that aren't set up and says what would unlock each. Elsewhere, unavailable things are hidden instead.
- **Install cards.** The SAM and Kokoro cards (install, progress, log, ready or why not) and the agent cards are the pattern for anything that runs locally.
- **Subjects.** Faces, people and things found in a clip, with stable ids, followed by effects and reframes. Joining only works within one file.
- **Jobs.** A map in memory in [http.ts](../packages/engine/src/http.ts), with progress the studio polls. It's lost on restart. MCP tools run to the end before they return.

Gaps that matter here: the agent can't see what's connected (no tool lists services or capabilities), there's no way from the Library to the timeline except through the agent, and nothing identifies the same person across files.

## Two ways in

### From a shot, in Edit

Select a placeholder or generated shot and Inspect shows:

- its takes, as a strip of thumbnails that play on hover; clicking one makes it the shot's `take`
- the prompt, with characters and places as chips
- the model: Auto, or one you picked
- **Make 2 more · ~$1.40**
- **Open in Make**, which takes the shot along as the target

A placeholder becomes a generated shot when its first take is made, and its `description` is the first prompt.

From the shot, the request knows:

- **Length.** The resolved duration plus a short handle each side (half a second), rounded up to a length the model makes, so the shot can be retimed later (a re-read line, a moved beat) without another take. The shot trims the take with `in`, like a clip.
- **Format.** The cut's first format by default. The other formats reframe the take the way they reframe footage. Per-format takes are an option when a reframe loses too much.
- **Continuity.** The last frame of the shot before can be the start frame, and the first frame of the shot after can be the end frame.
- **Words.** The narration line or lyric the shot covers, offered as a starting prompt.
- **The look.** Its colors and description, as a hint. The grade is applied afterwards, as it is to footage.

Clip shots get a **Change it** menu instead (see [Changing footage](#changing-footage)).

### Make mode

A switcher in the top bar, beside the cut menu: **Edit · Make**. The hash carries it (`#project/cut/make`).

- **Left:** the Library as it is, with **Cast & sets** at the top.
- **Middle:** the board. Each request is a row of takes, and anything made from a take (a variation, a still animated, an extension) nests under it, so you can always see what made what. Cards play on hover and show the model, cost and length. A card's actions: Vary, Animate, Extend, Use as start frame, Add to cast, Put in a shot.
- **Right:** the composer, with the Agent tab a click away.
- **Bottom:** the queue: what's running, its progress, and what's been spent today and in this project.

Opened from a shot, the composer shows its target ("For shot 7 · 3.2s · 9:16 and 16:9") and results go to that shot's takes as well as the board. Clearing the target makes things for the Library only. Put in a shot, and dragging from the Library onto the timeline (which Edit needs anyway), is how loose results get used.

## Cast & sets

Characters, places, props and styles that every cut shares, like the footage and the look. ("Scene" already means a designed, coded shot in beatsheet, so places are sets.) A set is one place a shot happens in, so the house might be three: the kitchen, the porch, the cat flap.

### Ways to start one

Every way leads to the same kind of entry. The only difference is what it starts with.

- **Right-click a photo or clip in the Library:** Make a character, Make a set, Make a prop, or Add to one that exists (`@cat`, `@kitchen`…). On a clip it uses the frame under the playhead, or frames from across the clip: a slow walk around the kitchen gives a set many angles at once.
- **Right-click a subject** (a face, a person or a boxed thing, in Inspect's subjects or on the picture): Make a character from it, or Add to `@cat`. This links the subject to the entry, which is also how someone is the same person across files: each file's subject links to the entry, rather than tracks being joined across files.
- **Right-click the picture in the player:** Make a set from this frame.
- **From the story.** When the agent writes the structure, everyone and everywhere in it becomes an entry with a name and a description, and no pictures yet.
- **New, in Cast & sets:** from a description alone, or by picking references from the Library.
- **Ask the agent** to make the cast from your photos. It looks through the Library, groups what it finds (14 photos of a cat, 6 of you, 9 of the house, 4 of the street) and hands off a `choose` with the entries it proposes, any of which you keep.

The Library has no right-click menu yet and selects one thing at a time; the timeline's note menus are the pattern for one. Starting from one photo and using Add to on the others works without selecting several at once, which can come later.

### What making one does

Make a character makes the entry straight away, with no dialog in the way, and opens it: in Inspect when you're in Edit, so you stay on the timeline, and full size in Make. Then, in the background:

1. **Finds the subject.** In a photo of you holding the cat, the subjects found in it show as boxes and you click the one you meant. With SAM set up, a prompt ("the cat") does it. A set takes the whole picture, or a box drawn on it.
2. **Cuts it out.** Each reference becomes a cut-out of just the subject (`cut_out`), so a model isn't handed the sofa along with the cat. A set can have its people taken out instead, so it's an empty place.
3. **Describes it.** A short, specific description written from the pictures: "orange tabby, white chest and paws, green eyes, a notch in the left ear". It goes into every prompt, so it's worth being exact, and you can edit it. It's a single call to a vision model (Gemini or OpenAI, with their key), or a note for the agent.
4. **Offers a sheet.** A clean set of views on a plain background, made by an image model from the references: front, three-quarter, side and full length for a character; a few angles and the details that matter for a set. Video models keep a character best from a sheet like that. The button shows the cost ("Make a sheet · ~$0.15"). Use the photos as they are skips it, which is cheaper and sometimes more faithful for real people and places.

From scratch is the same with no references: the description makes three candidate main images, you pick one, and the rest of the sheet is made from it, so the pick becomes the reference for everything after.

References and a description together ("my cat, as a noir detective") make a **variant**: the same character in another outfit or state (a tiny mask, soaked from the rain), or the same set at another time (the kitchen at night). A variant keeps its entry's references and adds to the description, so `@cat` and `@cat/heist` stay the same cat.

### The entry

```jsonc
"cast": [
  {
    "id": "cat",
    "name": "The cat",
    "kind": "character",                                     // character | place | prop | style
    "about": "Orange tabby, white chest and paws, green eyes, a notch in the left ear",
    "seen": [                                                // where it is in the project's own media
      { "asset": "IMG_0412", "subject": "object-1" },
      { "asset": "IMG_0419" },                               // the whole picture
      { "asset": "garden.mov", "subject": "object-2" }
    ],
    "images": ["cat-front", "cat-side", "cat-full"],         // the sheet (or the cut-outs): what models get; the first is the main one
    "variants": [{ "id": "heist", "about": "Wearing a tiny black eye mask", "images": ["cat-heist"] }],
    "voice": "elevenlabs:…"                                  // characters only
  },
  { "id": "me", "name": "Me", "kind": "character", "seen": [{ "asset": "IMG_0920", "subject": "face-1" }] },
  { "id": "kitchen", "name": "The kitchen", "kind": "place", "seen": [{ "asset": "kitchen-walk.mov" }] }
]
```

The sheet and the cut-outs are assets like any other, with provenance pointing at the references they came from. A Library item an entry uses says so ("In @cat"), the way a subject used by an effect already does.

### Real and made, together

Because `seen` points at real media, the agent can use real footage where there is some and make only what's missing. The cat on the porch is a clip you shot; the cat breaking into the fish market is made from a sheet built from the same cat, so they match. A made shot can start from the last frame of a real one (`start: "prev"`), and the grade goes over both. A set made from photos of your street means the cat walks down your street, not just any street.

### In prompts

In a prompt a cast member is `@cat` (or `@cat/heist` for a variant), shown as a chip. Models take references differently: some take four images, some one, some none. When a model can't take the references, Auto goes through a start frame: an image model makes a still with the cast in it, and the video model animates that. Then any model that can animate a picture keeps the character.

A character's `voice` reads their lines. `Line` gets `speaker` (a cast id): that character's voice reads the line, and lines without one use the cut's voice. A line's fingerprint (`lineState`) uses the voice it resolves to, so changing a character's voice re-reads only their lines.

Making a character from a real person, or putting someone into footage, is for people who've agreed to it. Each service's own rules apply on top, and a model that won't take pictures of real people shows that as its reason for being grayed out.

## The composer

One composer, compact in Inspect and full in Make. What's attached decides what it makes:

| Attached | Makes |
|---|---|
| A prompt alone | A clip from the prompt (or a still, when making images) |
| A picture | That picture, animated |
| The frame before or after | A clip that starts or ends there |
| Cast and sets | A clip that keeps them |
| A clip | That clip, changed |
| A clip and a voice line | That clip, lip-synced |

The model list then shows what can do it.

Also: how many (2 by default), length and format, and under More, seed and resolution. The Make button shows the estimate: "Make 2 · ~$1.40 · ~2 min".

## Changing footage

Verbs on a clip shot, from Inspect's Change it menu and from the timeline:

- **Extend.** Drag a clip shot's end (or start) past its footage. The missing part shows hatched, with **Extend with AI**. The anchors already say exactly how much is missing. The extension is its own asset, made from the frames next to it, and the shot plays the footage and then the extension: `extend: { after: "<asset id>" }` on the clip. Removing the field puts it back.
- **Relight, new angle, restyle, remove.** A short prompt each, sent to a model that edits video. A note with a frame region drawn on it ("take this sign out") is already the right request for a removal, so the agent can do these from a batch.
- **Replace someone.** Pick a tracked subject, then a cast member. The subject's boxes are what swap models want as a mask.
- **Lip-sync.** A shot of a character and the voice line it covers.

Each makes a derived asset (its provenance `from` says which footage and which range), and the clip shot plays it in place of its footage: `version: "<asset id>"`. Clearing `version` goes back to the original. The derived asset covers the same source time, so moments and `sync` still line up. Effects that follow a subject keep working after a relight or a restyle (the picture's geometry is the same), but need the subject found again after a new angle or a replacement.

Models that edit video take limited lengths. When a shot is longer, the reason says so and offers to split it.

## Models

### Operations

A short, fixed list of what can be asked for. The verbs above are presets of these (a prompt template and a preferred model), not more operations.

- `image`: a still, from a prompt and references
- `edit-image`: a still, changed by an instruction
- `video`: a clip, from a prompt, start and end frames, and references
- `extend`: more of a clip, before or after
- `edit-video`: a clip, changed by an instruction (relight, angle, restyle, remove)
- `swap`: a clip with a subject replaced by a cast member
- `lipsync`: a clip made to speak a voice line
- `upscale`
- and the ones there are already: `voice`, `music`, `sfx`, `segment`

### The catalog

Data, curated by hand: a short list of good models for each operation, not a mirror of everything a service offers. Each entry says what the model takes, what it makes, and which routes run it:

```ts
{
  id: "kling-3",
  label: "Kling 3",
  ops: ["video", "extend"],
  takes: { start: true, end: true, refs: 4 },
  lengths: [5, 10],                  // seconds it makes
  aspects: ["16:9", "9:16", "1:1"],
  sound: true,
  routes: [
    { via: "fal", model: "…", usdPerSecond: 0.07 },
    { via: "kling", model: "…" },
  ],
}
```

(The ids and prices are placeholders.)

A route is where a model runs: fal, Replicate, Runway, Gemini, OpenAI, ElevenLabs, or `local` (a worker on the machine's own GPU, installed from Settings like SAM). A model is available when any of its routes is. fal comes first: one key covers most video and image models, and its queue suits jobs that outlive a process. Each route has an adapter per input shape, so a new model that takes the same inputs as one already there is a catalog entry, not code.

The catalog and the fit check are pure, so they live in `packages/schema`, shared by the studio, the engine and the MCP server, with tests like the resolver's. Routes, keys, balances and adapters belong to the engine.

### Why a model can't be used

For a given request (an operation, its inputs and the target shot), each model gets one answer:

```ts
type Fit =
  | { ok: true; route: string; usd?: number; seconds?: number }
  | { ok: false; why: Why };

type Why =
  | { kind: "fit"; reason: string; fix?: "split" | "drop-refs" | "via-start-frame" } // "Makes up to 10s; this shot is 12.4s"
  | { kind: "connect"; services: string[] }                // "Runs on fal or Replicate"
  | { kind: "install"; what: string }                      // "Install Wan for your RTX card"
  | { kind: "funds"; balanceUsd: number; needUsd: number } // "fal has $0.40; this is about $1.20"
  | { kind: "policy"; detail: string }                     // "Won't take pictures of real people"
  | { kind: "failing"; detail: string };                   // key refused, service down
```

Fit is checked first, because connecting a service won't help a model that can't make the shot. Each reason has a button when there's something to do: Add a key opens Settings → Media services, Install opens the install card, Split splits the shot.

The picker groups them:

1. **Ready:** fits, and can run now.
2. **Needs a key or an install:** fits; collapsed, with the reason on each.
3. **Doesn't fit this:** collapsed, with the reason on each.

### Auto, and choosing

Auto is the default: the first ready model in a ranking for each operation, which you reorder in Settings → What it can do. Picking a model overrides Auto for that request. A project can pin a model for an operation, since mixing models across shots changes how they look, and the agent keeps to the pin. Every take records its model, so "Try this in Veo" on a take is one click.

## Jobs

Video takes minutes and costs money, so a job can't live in one process's memory.

- One file per job in `projects/<id>/jobs/`: the operation, inputs, model and route, the service's request id, status (queued, running, done, failed, canceled), progress, cost, the target (cut and shot), and the assets it made.
- Whichever engine process is running polls the unfinished jobs, and a lock in the file (process and heartbeat) stops two from doing it at once. The studio's engine picks them up again when it starts.
- The MCP tool starts a job and returns its id at once. A closed agent session or a restarted studio loses only the polling, never the result, because the service keeps it under the request id.
- A job aimed at a shot adds its takes as pending straight away ("2 coming · about a minute"), so the shot shows what's on the way.
- Results go into `project.json` through the same validated, version-checked writes the tools use, so they never clobber an edit made in the meantime.
- Cancel, where the service allows it.

## Provenance

New optional fields:

- `op`: the operation (`video`, `extend`, `edit-video`…)
- `from`: `{ asset, in, out }`, the footage it was made from
- `cast`: the cast ids it used
- `params`: enough to run it again (length, aspect, preset, strength)
- `job`: the job id

With these, the Library can show what each asset was made from, and Regenerate can run the same request again, with the same model or another.

## Shots

- `generated` gains `cast`, `start` and `end` (`"prev"`, `"next"` or an asset id), `params`, and the picture fields a clip has (`in`, `reframe`, `effects`, `motion`), so a take trims, reframes and carries effects like footage.
- A generated shot's takes can be stills (its board) as well as clips (rough and final). `fidelity` says which stage it's at, and a clip's start frame is usually the chosen still.
- `clip` gains `extend: { before?, after? }` and `version`.

Both keep their anchors; nothing about time changes.

## The agent

- **`list_models`**: what's connected, and the catalog with fit and reasons for a given request or shot. The agent can't see any of this today.
- **`generate`**: an operation, inputs, a model or Auto, how many, and an optional target shot. Returns job ids at once.
- **`jobs`**: the status of jobs, with an optional `wait` in seconds, so the agent can wait without owning the job.
- Cast edits go through `edit_project`.
- A **budget** (in Settings). Spending within it goes ahead; a pass that would go over it is asked for in `hand_off`, with its estimate, and `generate` refuses past it and says why. A `choose` option can show what it would cost.
- `provide` gets a `cast` need: pictures of someone or somewhere that only the person has.
- A **film recipe** (`.agents/skills/film`) for videos made from nothing, beside montage and story: directions, beats as placeholders, cast and sets from the beats, boards, rough, final, as in [A video from nothing](#a-video-from-nothing). This is the cinematic recipe [DESIGN.md](DESIGN.md) plans for.
- A **make skill** that every recipe uses: when to make footage and when to use what's there, how to write prompts for image and video models, keeping to one model per project, and making two or three takes a shot, then handing off a `choose` with their key frames.

## Order

1. **The pipeline, on one shot.** The catalog and fit check (in schema, with tests), fal as the first route for images and video, jobs on disk, the new provenance fields, the take strip in Inspect, and `list_models`, `generate` and `jobs`. Done when Make 2 on a placeholder with Auto gives two takes through fal, a studio restart in the middle doesn't lose them, and the agent can do the same and hand off a choice.
2. **A video from nothing.** Cast & sets from the story, from a description and from photos (the Library's right-click menu with Make a character, Make a set and Add to), with cut-outs, descriptions, sheets and variants in Make; references through a start frame; boards, rough and final; estimates for a whole pass; the `cast` need; and the film recipe. Done when the cat video goes from a brief to a watchable rough cut with the agent driving and the person only answering hand-offs and leaving notes.
3. **The rest of Make mode.** The board of loose takes, the queue, the full composer, cast from subjects and clips, the agent grouping the Library into a cast, selecting several things at once, speakers on lines, and dragging from the Library onto the timeline.
4. **Changing footage.** Extend by dragging, relight, new angle, restyle, remove, replace someone.
5. **More routes.** Local models on the NVIDIA card (Wan, LTX) through a worker like SAM's, Runway and Gemini directly, and lip-sync.

## Open questions

- Make as a full mode from the start, or a wide panel first? (A mode, I think: the board needs the middle of the screen, which Edit gives to the player and timeline.)
- Should a project pin the model it made its first take with, by default?
- Are prices curated in the catalog, or read from each service where it publishes them? Either way the estimate is "about".
- How much handle is worth paying for.
- A budget per turn, per project, or both?
- Does a video made from nothing time its shots by their own lengths (the `shots` spine) until there's music, then move to `music`?
- Names: Make or Generate; Cast & sets; the film recipe.

## Sources

- [LTX: Elements and the storyboard update](https://ltx.io/blog/ltx-storyboard-generator-update)
- [TV Tech: Generative Extend launches in Premiere Pro](https://www.tvtechnology.com/news/nab-show-adobe-launches-generative-extend-ai-for-premiere-pro)
- [PetaPixel: Runway Aleph](https://petapixel.com/2025/07/29/runways-new-model-can-transform-existing-video-footage-using-just-a-prompt)
