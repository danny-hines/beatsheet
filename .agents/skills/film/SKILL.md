---
name: film
description: Make a video from nothing in beatsheet, in shots that are made rather than filmed. A short film, a skit, a day in the secret life of a pet, a fake trailer, a story with characters and places. Use when the brief describes something to make rather than footage to cut, when the person wants characters, places or shots generated, when a cut's recipe is "film", or when they ask for boards, roughs or finals.
---

# Film recipe

A film here is written before anything is made, and made cheapest first. The shot list is the spine: each beat is a placeholder shot with its length and what it's for, and every picture is made for its place in the cut. Cast and sets keep the same characters and places in every shot. The `make` skill has the craft for each request (prompts, models, takes, money); this is the order to do it in.

What separates a great one from a pile of pretty clips:

- **An idea with a turn.** The cat's double life the family never sees; the heist that's for a sardine. Everything serves it.
- **The same characters and places in every shot,** on-model, from their pictures.
- **Shots, not illustrations.** Each has a size, an angle, light and one action, and they cut together: eyelines, direction of travel, the time of day moving forward.
- **Cheap before expensive.** Stills settle the story, the cast and the framing; roughs judge the motion and the cut; finals come last, for the shots that stay.
- **Sound sells it.** A score with the genre's feel, and an effect on every hit.

## Turn 1: pictures and directions

1. `get_project`. Read the brief and the references.
2. **Pictures first, if needed.** When the film stars someone or something real (their cat, themselves, their street) and the project has no photos of them, `hand_off` with kind `provide`, `need: "cast"`, saying exactly whom and what helps: a few clear photos, the face and the whole body, in good light. The directions come next turn.
3. **Directions.** `hand_off` with kind `choose`: 2–3 takes on the story that differ in angle (genre, tone, who tells it), not just pace. For each:
   - a label like `Noir heist · 60s · the cat narrates`;
   - the logline and the arc in two or three sentences.

   They don't need pictures yet. `multiple: true` lets the person try two as separate cuts.

## Turn 2: the structure

1. **The cut.** `recipe: "film"`, `spine: "shots"`, the length in `/spec`.
2. **Beats as placeholder shots.** 12–16 for 60 seconds, 2–6 seconds each, in acts (for the cat: morning, the job, home). Each shot:
   - a short id that names it (`flap`, `alley`, `vault`);
   - its `duration`;
   - `intent`: what it does in the story ("the cat leaves for work");
   - `content.description`: the moment as a camera would see it, with the cast by @id, then what moves ("Low angle: @cat squeezes through the cat flap at dawn, golden light; it trots off down the path, camera holding low").

   Write `BEATS.md` with `write_scene` too, so the person (and you, next turn) can read the plan. Include a short **Scene Continuity** block per scene in `BEATS.md` pinning recurring objects (exact colors/materials/which hand), key background details, lighting direction and time of day, and screen direction.
3. **Cast and sets from the beats.** Every character, place and prop that recurs across 2+ shots (not just hero props — any visible object or vehicle whose color/design would jar if it changed between cuts), plus a style: add them to `/cast` with `about` written from the person's photos (`look_at_assets`) or from the story, and `seen` for the photos they're in. Ids are what prompts call them: short and lowercase.
4. `hand_off` with kind `review`: the cards play in time, so the person can judge the pacing and leave notes before anything is made. Ask what each shot is meant to show, not only its timing: it's free to fix here, and it's most of what first boards get wrong. For a remake, old footage won't tell you the joke or even what's happening, so write what you think happens in each shot and let the person correct it.

## Turn 3: cast and sets

1. **The style, first.** Sheets and boards are drawn in the project's style (`/look/style`, naming a style entry in `/cast`), and photographs without one. If the person has said (photographic, hand-drawn, stop-motion…), add it and set it. If not, make one beat as a board in 2–3 styles (a style entry each, named in the prompt) and ask. A character drawn unlike the world gets its own `style`.
2. **Sheets (decoupled face + wardrobe).** Lock each character's likeness with `sheetKind: "portrait"` first (`models`, `count: 1` or `2`); show the person the portraits in a `choose` hand-off and set `portrait` to their pick. From the chosen portrait, generate a 360° 6-panel bare-shoulders `faceSheet` (`sheetKind: "face-sheet"`) and a separate headless front+back `outfitSheet` (`sheetKind: "outfit-sheet"` — or link a reusable `kind: "wardrobe"` entry via `outfit` for shared uniforms/cloaks). Set `headwear` to `"ghost"` for hats/hoods/masks on the outfit sheet or `"face"` for tightly fitted headwear/beards/wimple/facial damage on the face sheet. beatsheet packages these canonical ingredients automatically for each model (`split-360`, `split-single`, or procedural composite when ref slots are tight). Also generate clean views for key props and places. Look at every sheet (`look_at_assets`) before boarding.
3. `hand_off` with kind `choose` where there's a real decision (a character's look, the style), each option's `assets` the pictures; otherwise go straight on. A real person's likeness is always a real decision: the person making the film picks each portrait before any board is made.

## Turn 4: boards

1. **A sample first.** Board one scene, `hand_off` with kind `review`, and go on only when the person says the cast, costumes and look are right. Boards made before that get thrown away. Boards can capture the hero/middle moment of each beat when their clips will use them as scene references (`refs: ["board"], includeCastRefs: true`); only shots that need a pixel-locked frame 1 need a pre-action board.
2. **Anchor board first per scene, then chain.** Don't batch every shot of a shared location blindly in parallel — settle each scene's master/establishing board first, then chain adjacent boards in that location using `refs: [anchorBoard], includeCastRefs: true` (keeping the exact room, wall color, props and lighting while changing angle/action), and repeat the scene's exact background/prop tokens in close-ups where `@place` is omitted. Estimate with `list_models` (`op: "image"`, `count: 2`), then generate. A board pass for 16 shots is about $1.30. Take fights and blood out of a GPT Image pass first (the `make` skill).
3. `jobs` with `wait`. Look at every scene's boards together in shot order (`look_at_assets`, or a contact sheet of them): the cast on-model, the framing the beat needs, **shot-to-shot continuity** (prop colors, background landmarks, wardrobe state, lighting, eyelines), and no words printed in the picture. Pick each shot's take; fix continuity slips right here with targeted board edits (`refs: [badBoard, anchorBoard], includeCastRefs: true`) before spending video tokens. A close shot that came back wide named its place with @: say where in words instead while repeating the scene's concrete background details (the `make` skill).
4. **Music.** `set_song` if the person gave one; otherwise, if they asked, `generate_music` with the genre's feel (a heist wants pizzicato and brushed drums), instrumental, a few seconds longer than the cut; then `fit_music`, which jumps the song on a bar line so its own ending lands on the last shot.
5. **Titles.** A title over the opening and a line over the last shot (text shots on the text track, `title-bold` and `handwritten`) are often all the designed shots a film needs.
6. `hand_off` with kind `review`: the board plays as an animatic.

## Turn 5: roughs

1. **Choose the directing mode per shot, then estimate.** Don't run a blanket `start: "board"` pass over every shot: boards usually capture the middle of the action (which makes a locked start frame start awkwardly), and start-frame-only clips get no character sheets so likeness drifts easily. Group shots by what they actually need and price each group with `list_models`:
   - **References + `@cast` sheets (`refs: ["board"], includeCastRefs: true` — or `includeCastRefs: true` alone with a detailed shot prompt and no board):** the default for most action, character, multi-beat, and likeness-sensitive shots. Passes the board as a visual/scene reference (setting, lighting, mood, composition — *not* a locked frame 1) alongside every `@mentioned` character's face and outfit sheets. Write a complete start-to-finish shot description in `prompt` / `clipPrompt` (framing, setting, lighting, full action progression, camera move, sound). Works across MAGI-2, Wan 3.0, Seedance 2.5 (and Flash / 2.0 Mini), Kling 4.0, MiniMax H3, and HappyHorse 1.1.
   - **3D Blockout + references (`set_blockout`, inline review, then `camera: "blockout"`, `includeCastRefs: true`, optionally `refs: ["board"]`):** when a specific camera move (orbit, push-in to close-up, dolly-zoom, crane, whip pan), spatial staging, or beat-synced cut timing matters. Attach the blockout 1:1 to the shot (never create a separate blockout cut), hand off `review` with `shot` + `blockout: true` first, then generate in video mode (MAGI-2 / Seedance 2.5) or 16-frame contact-sheet mode (`mode: "sheet"`, across Wan 3.0, MiniMax H3, HappyHorse 1.1, Seedance). Every generated take saves a content-addressed blockout snapshot for permanent side-by-side / wipe comparison.
   - **Locked start frame (`start: "board"` or `start: <still>`, + optional `end`):** reserve for shots where frame 1 (or frame 1 → payoff pose) genuinely needs to be pixel-locked — continuing seamlessly from the previous clip's last frame (`still_from_clip`), calm/establishing/product/lettered shots with subtle motion, exact A→B transitions (`start` drawn pre-action + `end` payoff), motion copy (`drive`), or dedicated lip sync (`speech`). When a locked start frame still needs character sheets to hold likeness, use **Kling 4.0** (`start: "board"`, `includeCastRefs: true`).
   - If the whole pass is more than the turn may spend, ask first: a `choose` hand-off whose options say what they'd cost (all the shots, or the key ones first).
2. `generate` with the chosen modes (`count: 1`, or 2 for the shots that carry the film). `jobs` with `wait`; clips take a few minutes.
   - **Carry finished clip frames across adjacent cuts in the same scene:** when shot B immediately follows shot A in the same location, extract a clean frame from shot A's chosen clip (`still_from_clip`) and pass it either as `start` (for a seamless continuation) or as a secondary reference (`refs: ["board", prevClipFrame], includeCastRefs: true`) so shot B matches what shot A's video model actually rendered (prop color, set details, light).
   - **Action a prompt won't carry** (a fight, people grabbing each other, a dance, a stunt): every model softens these, so plan for it before the pass. When there's footage of it, the original film or the person's friends acting it out on a phone, copy its movement instead (`drive`, SCAIL-2: the make skill's "Copying movement"). With no footage yet, a `provide` hand-off asks for it: "Film yourselves doing the swing and the fall, about five seconds each, camera still, and bring it in."
   - **A subtle facial performance a prompt won't nail:** ask the person to act it out (`Record → Camera`), then use `transfer_performance` to extract 52 ARKit blendshapes, strip their identity into a neutral `kit:ClayHead` mask, and drive the character's board.
   - **Consistent lighting across real and made footage:** use `relight_clip` with one of 24 built-in 3D lighting sphere presets (or `extract_light_sphere` from a key board) saved to `/look/lightSphere`.
3. `review_cut` and `frame` what matters (pass `from`/`to` or `shots` on a long film to inspect one scene at a time; if your runtime can read video files, watch the preview MP4 `review_cut` saves to judge real motion, continuity and sound). **Inspect `review_cut`'s Continuity pass** (its side-by-side `OUT → IN` cut-pairs sheet and any same-place lighting warnings) across all 6 continuity axes (props/colors, background elements, wardrobe state, lighting, screen direction/eyelines, action handoff). Make weak shots again or fix continuity breaks surgically (board edit + re-roll with `[fixedBoard, prevClipFrame]`, `relight_clip` for lighting jumps, `swap_character` for face/wardrobe drift, or handle trims — proposing paid re-rolls via `hand_off` `choose` with `make` when spend is meaningful). If a start-locked clip starts awkwardly mid-action or drops likeness, switch it to References mode (`refs: ["board"], includeCastRefs: true` or `includeCastRefs: true` with a detailed prompt) rather than retrying the same locked start frame.
4. **Sound.** `/sfx` cues on every action and hit (whooshes on moves, impacts on landings, a riser into the reveal); `generate_sfx` for anything specific (a cat flap's clack). If the characters speak, give each a `voice` in `/cast` (`list_voices`) and pass their lines to `narrate` with `speaker`; a line without one is the narrator's.
5. `hand_off` with kind `review`.

## Turn 6: finals

Once the person says the rough holds: estimate the finals (`quality: "final"`, `count: 1`, keeping each shot's directing mode — References + `@cast`, blockout + refs, or locked start/end), ask with the cost if it's over the turn's budget, then make them. A final replaces the rough on its shot by itself. It renders the shot again, so it can change what was approved: make finals where the difference shows, and let the person leave the rest as roughs (a shot under a heavy look may not need one). `review_cut`, fix, and `hand_off` with kind `review`.

## A long film

Past a few minutes, don't run each turn over the whole film. Boards drawn long before their clips mostly get redrawn: on a 13-minute remake, over half the clips in the cut needed a new board first. So make one cheap pass of boards for the animatic (`count: 1`, on a free route when there is one), then take the film a scene at a time: that scene's boards, its clips and sound, its notes, and what you learned carried into the next. Finals come last, over the whole cut.

## Before you hand off: the taste check

- Does the first shot hook, and does the turn land?
- Did `review_cut`'s `OUT → IN` cut-pairs continuity sheet pass cleanly: no flipped prop colors, vanishing/altered background landmarks, costume/damage resets, sudden lighting shifts, or broken eyelines across adjacent generated shots?
- Does each shot have one clear action, and do they cut together: eyelines, direction of travel, light and time of day?
- Does every clip start naturally before its action rather than awkwardly mid-gesture (using References mode with `refs: ["board"], includeCastRefs: true` or a detailed prompt + `@cast` sheets when a board captures mid-action, rather than locking it as frame 1)?
- Does something change every second or two, with no shot held still too long?
- Is there sound on every hit, and does the score's feel match the genre?
- Is it the person's: their cat, their street, their family's in-jokes from the brief?

## Notes from the person

`get_batch`, make each change (a sharper prompt and a new take, a re-cut, a new beat), look at it, `resolve_note` with a line saying what changed, then `hand_off` for another review. A note on one shot's look usually means its board; make the board again before its clip.
