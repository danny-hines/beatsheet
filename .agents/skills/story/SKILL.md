---
name: story
description: Make a narrated video in beatsheet. A product or project showcase, a launch, an explainer, a how-it's-made, a build log, a recap told in voiceover, a promo for social. Use when the brief wants to show or explain something rather than set footage to music, when the person asks for a script, narration or voiceover, or when a cut's recipe is "story".
---

# Story recipe

A story video is written before it's cut. The voiceover carries it, and every line gets a picture worth looking at: footage that proves it's real, or a designed scene that explains it (the `motion` skill).

What separates a great one from an edit anyone could do in 20 minutes:

- **An idea, not a sequence.** One line that makes someone stop scrolling ("This camera can't take a normal photo."), then everything serves it.
- **The project's own material.** Read everything the references point at:
  - the repo: README, build guide, parts list, CAD files, UI code, config;
  - the site, the galleries, the posts.

  Real names, numbers, dates, quotes, screenshots and photos make it specific, and specific is what makes it good. An exploded view of the product's real CAD with each part labelled beats any stock shot. A stat counting up to the real number beats an adjective.
- **Designed scenes between the footage,** often half the shots: kinetic type on the hook, cards for a timeline, a before/after for a transformation, labelled parts for "what's inside", a phone showing the site. The ones that carry the video are written for this project, not taken from the kit.
- **A design system and a motif.** The project's colours and type everywhere (`/look`: the brand's, or for a personal story one from its footage and the occasion), and one recurring visual idea that comes from the subject itself (a camera's viewfinder, a printer's bed, a terminal; a postcard for a trip) tying the scenes together. The `motion` skill shows how.
- **Everything lands on something.** Pictures change on the line's turn, labels on the word that names them, cuts on bars, and a sound on every hit.

## Turn 1: a new story project (or a new story cut)

1. `get_project`. If the footage isn't logged, log it as the montage recipe does.
2. **Research.** Read the references properly:
   - **Folders:** READMEs, docs, the parts list and build guide, CAD, product copy, UI and copy in the code, data files.
   - **Links:** fetch them, and `capture_page` anything you might show (phone width by default; `fullPage` for a scroll).

   Keep a list of facts (with numbers), names, dates, quotes, before/after pairs, and the single most surprising thing about the project.
3. **The design system.** Set `/look` from the brand: colours from the site's CSS (paper, ink, accent, and any others), the display font and how heavy its headings are (`fonts.displayWeight`; any font installed on this computer works by name, any Google font through `add_font`, and a Google font is the one that looks the same on a Mac and a PC), a grade for the footage (`/look/grade`) and a little grain if it suits. Without a brand (a family story, a trip), make the look from the footage and the occasion (`palette`), and when the person hasn't said what feel they want, show 2–3 with `preview_looks` and let them pick (the `motion` skill). Decide the motif and the motion character, and write them as `DESIGN.md` with `write_scene` (the `motion` skill). Fill in `/brief/goal` if it's blank.
4. **Directions.** `hand_off` with kind `choose`: 2–3 concepts that differ in angle, not just pace. Typical angles: the result first; the build story; the problem it solves; the people using it. For each:
   - a label like `Results first · 60s · narrated`;
   - the hook line, and the arc in a sentence or two;
   - `assets`: key frames that sketch it.

## Building it

1. **Beat sheet.** Before any shots, plan 10–16 beats for 60–90 s. Each beat is a line, what's on screen, how it moves, and the sound. The usual arc:
   - the **hook** in the first 2 s, a promise or a surprise;
   - the **title or payoff** early, within the first ~10%;
   - **how it works**;
   - **what's inside or how it was made**;
   - the **proof** (real use, people, numbers);
   - the **call to action**;
   - a tagline over the end card.

   Save it with `write_scene` as `BEATS.md` (beside the scenes) so the person, and you on the next turn, can read the plan.
2. **Script.**
   - Short spoken lines, one thought each, about 2.5 words a second.
   - Concrete nouns and real numbers. Say it out loud in your head and cut what doesn't earn its place.
   - Spell out numbers and names in `tts` ("five thousand milliamp-hour").
3. **Voice.** `narrate` the lines, in the person's default voice unless they asked for another.
4. **Music.**
   - `set_song` if they gave one. Otherwise, if they asked, `generate_music`: instrumental, its energy matched to the arc, a few seconds longer than the narration.
   - Then `fit_music`, so the song's own ending lands on the last frame.
   - It dips under the voice by itself (`/music/duck` to change how much).
5. **Pictures.** For each beat, a shot:
   - **Footage:** a clip with `content.motion` or a `reframe`.
   - **Designed:** for the hook, the reveal, the payoff and the end card, a scene written for this project with `write_scene`, in its design system; `kit:…` for the quick ones.
   - Start shots on words (`{"kind":"word","line":"how","word":"transforms"}`) so the picture turns with the sentence.
   - Each designed scene carries one idea, its parts timed to words.
   - Vary them: never three of the same kind in a row.
6. **Captions.** `/captions` `{}`. Set `captions: false` on shots whose type already says the words.
7. **Sound.** `/sfx` cues, 20–60 for a 60–90 s video, gain 0.3–0.6 so they sit under the voice:
   - `whoosh` into scene changes;
   - `pop` or `tick` as cards and labels land;
   - `impact` or `boom` on reveals;
   - `shutter` or `click` on product actions;
   - `riser` into the title;
   - `success` on a payoff;
   - `typing` under typed text.

   `generate_sfx` for anything specific, like the product's own sound.
8. **Check.**
   - `frame` each designed scene: before, mid-move and settled. Critique each hero scene against the `motion` skill's checklist and revise it at least once.
   - `review_cut` the whole thing, and fix the holds, the uncropped footage, the silences, anything cut off.
   - In its design pass, critique the designed shots as a design lead would and fix the three weakest things. If you can start a subagent, have it do that critique cold, with `frame` and the brand's references.
   - `review_cut` again until it's clean.
9. **Hand off** with kind `review`: what you made, the choices worth a second opinion, and what to judge.

## Talking footage

When the story is told by people on camera (an interview, a vlog, a how-to) rather than by narration, the footage's own words are the spine. Transcribe the clips (with who's speaking when there's more than one person), then read the cut with `edit_by_words` and nothing else: it lists what's said, by speaker, with times. Take out what doesn't serve the story by phrase (`remove`), then `fillers: true` and `pauses` to tighten it; keep a breath before a punchline. With several cameras on one event, `sync_angles` lines them up and `cut_to_speakers` puts whoever's talking on screen; then cut away to b-roll over the words with clips on an overlay track. `even_out` sets the shots to one level. Captions of what's said on camera: `captions: { source: "footage" }`; `subtitles` writes the .srt.

## Before you hand off: the taste check

- Would the first 2 seconds make you stop scrolling?
- Is there a moment that makes someone say "oh, cool"? (the model coming apart, the transformation, the number)
- Does every line have a picture that shows something, not one that repeats what's said?
- Does something change every second or so, with nothing still for 2 s?
- Is type big and short (about six words at once, captions aside), with one highlight colour?
- Do the designed scenes look like this brand's, built around something from the product, or like a template? Would a motion designer be happy to put their name on them?
- Is it real throughout: real names, numbers, screenshots, quotes, photos, the product's own sounds?
- Are strangers' faces blurred, and nothing private on screen?
- Does it end on a clear call to action and the brand?

## Notes from the person

`get_batch`, make each change, `frame` or `review_cut` it, `resolve_note` with a line saying what changed, then `hand_off` for another review. Keep the look and the motif consistent as things change.
