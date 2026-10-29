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

   Write `BEATS.md` with `write_scene` too, so the person (and you, next turn) can read the plan.
3. **Cast and sets from the beats.** Every character, place and prop that recurs, and a style: add them to `/cast` with `about` written from the person's photos (`look_at_assets`) or from the story, and `seen` for the photos they're in. Ids are what prompts call them: short and lowercase.
4. `hand_off` with kind `review`: the cards play in time, so the person can judge the pacing and leave notes before anything is made.

## Turn 3: cast and sets

1. **The style, first.** Sheets and boards are drawn in the project's style (`/look/style`, naming a style entry in `/cast`), and photographs without one. If the person has said (photographic, hand-drawn, stop-motion…), add it and set it. If not, make one beat as a board in 2–3 styles (a style entry each, named in the prompt) and ask. A character drawn unlike the world gets its own `style`.
2. **Sheets.** `generate` with `sheet` for each character and key prop (`count: 2`), and a view or two of each place. Look at them (`look_at_assets`): the right subject, on-model with the photos, in the style, on a clean background. Keep the good ones in `images`, best first.
3. `hand_off` with kind `choose` where there's a real decision (a character's look, the style), each option's `assets` the pictures; otherwise go straight on.

## Turn 4: boards

1. **Estimate,** then make: `list_models` with every shot (`op: "image"`, `count: 2`), then `generate` with the same. A board pass for 16 shots is about $1.30.
2. `jobs` with `wait`. Look at every board: the cast on-model, the framing the beat needs, continuity from shot to shot. Pick each shot's take; make the weak ones again with sharper prompts.
3. **Music.** `set_song` if the person gave one; otherwise, if they asked, `generate_music` with the genre's feel (a heist wants pizzicato and brushed drums), instrumental, a few seconds longer than the cut; then `fit_music`.
4. `hand_off` with kind `review`: the board plays as an animatic.

## Turn 5: roughs

1. **Estimate:** `list_models` with every shot, `op: "video"`, `start: "board"`. If it's more than the turn may spend, ask first: a `choose` hand-off whose options say what they'd cost (all the shots, or the key ones first).
2. `generate` with the same (`count: 1`, or 2 for the shots that carry the film). `jobs` with `wait`; clips take a few minutes.
3. `review_cut` and `frame` what matters. Make the weak shots again on their own, with a clearer action or camera move.
4. **Sound.** `/sfx` cues on every action and hit (whooshes on moves, impacts on landings, a riser into the reveal); `generate_sfx` for anything specific (a cat flap's clack).
5. `hand_off` with kind `review`.

## Turn 6: finals

Once the person says the rough holds: estimate the finals (`quality: "final"`, `start: "board"`, `count: 1`), ask with the cost if it's over the turn's budget, then make them. A final replaces the rough on its shot by itself. `review_cut`, fix, and `hand_off` with kind `review`.

## Before you hand off: the taste check

- Does the first shot hook, and does the turn land?
- Is every character the same character in every shot? Every place the same place?
- Does each shot have one clear action, and do they cut together: eyelines, direction of travel, light and time of day?
- Does something change every second or two, with no shot held still too long?
- Is there sound on every hit, and does the score's feel match the genre?
- Is it the person's: their cat, their street, their family's in-jokes from the brief?

## Notes from the person

`get_batch`, make each change (a sharper prompt and a new take, a re-cut, a new beat), look at it, `resolve_note` with a line saying what changed, then `hand_off` for another review. A note on one shot's look usually means its board; make the board again before its clip.
