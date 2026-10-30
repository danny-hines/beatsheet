---
name: montage
description: Make or improve a beat-synced montage (vacation reel, event recap, Reels/TikTok/Shorts) in beatsheet. Use when it's your turn on a montage project, when someone asks for a montage, reel, recap or highlight video from a folder of clips and photos, asks to log footage, or asks you to handle their beatsheet notes on a montage project.
---

# Montage recipe

A montage's timing hangs off the music: cuts land on beats, and the song's energy sets the pace. You work through the `beatsheet` MCP tools; the person watches in the beatsheet studio, where every change shows up live.

beatsheet is turn-based. When it's your turn, do everything you can on your own; the person isn't approving each step. End every turn with `hand_off`, asking for exactly one thing: a pick (`choose`), a look at a playable cut (`review`), or something only they have (`provide`, like a song). Keep hand-off messages short and concrete.

A project has shared footage and a brief, and one or more cuts (versions with their own length, formats, music and shots). Tools that work on a cut take `cut`; `get_project` lists the cuts.

## Turn 1: a new project

The person has just dropped in a folder. Before asking them anything:

1. **Read it.** `get_project`. Note the brief (often just a title and a one-line goal), what's in the footage, and any references: each can say what it is or what to do with it ("match this pacing", "our logo for the end card"), so follow that. Look at links and folders the person points to when it helps.
2. **Log everything.** Logging is what makes the cut good. Clips where people talk (a toast, a kid's first words, an interview) are worth transcribing first (`transcribe`, then `transcript` to read or search it), so a cut can land on what's said. Work through `list_assets` (filter `unrated`) in groups of up to 12 with `look_at_assets`. A video comes back as 8 frames with the time of each; a photo as a thumbnail. For each, `log_assets`:
   - **rating**: 5 for the best moments, 3 for usable, 1 for filler, -1 to reject (blurry, accidental, pocket shots, near-duplicates of something better).
   - **label**: a few words saying what it is ("Kids at the parade", "Sparklers in the driveway").
   - **tags**: people, place, activity, time of day.
   - **moments** (videos): seconds into the source worth landing on a beat (a jump, a burst, a laugh, a wave crashing), estimated from the frame times, scored 0–1.
   Keep labels to what's visible. Don't guess names.
3. **Sharpen the brief** from what you saw: `edit_project` on `/brief/goal`, `/brief/audience`, `/brief/tone` when the person left them blank. One honest sentence for the goal.
4. **Find the look.** Titles, captions and the footage's grade draw with the project's look (`/look`), so give it one that belongs to this footage rather than leaving beatsheet's plain neutrals (the `motion` skill has the details):
   - **With a brand** (the references point at a site or a logo): its colours and fonts, from the site's CSS.
   - **Otherwise, from the footage and the occasion.** `palette` reads the footage's own colours. A Pacific beach in the mist is greys, driftwood and dune grass; a Greek island is whitewash and turquoise; a birthday party is balloons and candlelight.
   - **Make 2–3 looks** that fit and differ in feel (misty and calm, golden and nostalgic, bright and playful). Each has colours, a display font that suits it (`add_font` for any Google font) and a grade (`/look/grade`: warmth, saturation, fade).
   - **Draw them with `preview_looks`** on the project's own footage. If the person already said what feel they're after, or there's a brand, skip the choice: set the one that fits.
5. **Propose directions.** `hand_off` with kind `choose`, `multiple: true`, and 2–3 options that differ in idea, not just tempo. Each is a few words plus a sentence: the feel, the length, the format, the kind of music. For example "Sweet family recap · 45s · gentle acoustic", "Bouncy highlights · 30s · upbeat pop", "The day in order · 60s · build to the fireworks". When the project is a thing to show or explain (a product, a build, an event with a story), make one option narrated, and build it with the `story` recipe. Give each option `assets`: 3–4 of the clips it would use, in order (opening, the big moment, the ending), so it reads like a storyboard. The looks go on the same card as a second question: `questions: [{ "id": "look", "message": "And which look?", "options": [{ "id": "misty", "label": "Misty coast", "detail": "…", "image": "made/looks/misty-….jpg" }, …] }]`. Set the picked one on `/look` before building; if they leave it, choose yourself.

## Building what they picked

For each pick (the first goes in the existing cut; each further pick gets `create_cut` with `fresh: true`, its name, `purpose`, `targetLength` and `formats`):

1. **Music.** The cut needs a song with a beat grid. If the project already has a fitting one, `set_song` on that cut. If not, `hand_off` with kind `provide`, `need: "song"`, describing the song that fits; the person can choose one or ask you to make it. When they ask you to make one (or already said to), `generate_music` with genre, mood, instruments and tempo, a few seconds longer than the cut. It spends their ElevenLabs credits, so make one, not several.
2. **First cut.** `first_cut` with the cut's id, `include` set to the keepers in story order (usually the order they were shot), and `targetLength` from the cut's spec. It lands the song's first drop early, cuts every bar in builds and every 2 beats in drops, and puts each clip's best moment early in its shot.
3. **Make it good.** A first cut is a starting point, not the answer. Look with `frame` (at the drop, at section changes, at a few random shots), then refine with `edit_project`:
   - **Land moments on beats**: set a clip's `content.sync` to `{ "moment": "<moment id>", "at": { "kind": "beat", "n": 0, "from": "drop" } }` (the big moment on the drop is the classic).
   - **Pace**: hold the strongest shots longer by removing the next cut, or by moving a shot's `start` to a later beat. Keep 2-beat cuts for high-energy runs.
   - **Framing for vertical**: landscape footage gets `content.reframe.<format> = { x, y, zoom }`. Point `x`,`y` (0–1) at the subject.
   - **Story**: open on a wide or establishing shot, put the best moment on the drop, end on people (a group shot or a calm wide shot).
   - **Designed moments**: the montage gets better with a few shots that aren't footage, designed for this project (the `motion` skill: a design system from the brand first, then the scenes). Examples:
     - a hook in big type over the opening clip;
     - a stat ("12 styles from 1 photo");
     - a before/after;
     - the photos as a wall pulling back;
     - an end card in the project's look (the place and the date on a postcard, say).

     Write the hook and the end card as the project's own scenes (`write_scene`); the kit (`kit:Words`, `kit:Stat`, `kit:Split`, `kit:Grid`) is fine for the quick ones. Keep type short and big, and land it on a beat.
   - **Movement**: no picture sits still. Give photos `content.motion` (a push in, a drift), and cut sooner where nothing happens.
   - **Sound**: `/sfx` cues on the big moments (a `whoosh` into the drop, `impact` on the hit, `tick` on fast cuts, `shutter` on a photo). The built-in sounds are free; `list_kit` lists them.
   - **New material**: when a shot needs a file the footage doesn't have (a slowed or reversed clip, a still), make it in `projects/<id>/made/` (never in a footage folder) and register it with `add_asset`, saying how it was made (`source`, and `provider`, `model` and `prompt`). Then use it like any other clip. A picture or clip nobody shot (the missing establishing shot, a sky for the title) comes from `generate` on a placeholder shot: see the `make` skill.
   Address shots by id in patches: `/shots/id=s07/start`. Keep timing as anchors (beats, bars, sections, moments).
4. **A touch of polish** (when it suits the brief; not every cut needs it). `find_subjects` on the clips you're using, then:
   - **Landscape footage in a vertical cut**: `content.reframe.vertical.follow` = the subject to keep in frame.
   - **Strangers' faces** in a cut meant for the public: `content.effects: [{ "kind": "blur", "subject": "face-3" }]`. If a face is found only briefly, `frame` the clip, box the face, and `track_subject` it.
   - **Who's who** in a family recap: `{ "kind": "label", "subject": "person-2", "text": "Grandpa" }`. Use names from the brief or notes only; never guess a name. Rename the subject too.
   - **Title behind someone** for the opener: `cut_out` the photo or clip, put the title on the text track and the cut-out on an overlay track after it (tracks draw in order). Use text style `title-huge`.
   - **Piece by piece on the drop**: the photo with `look: "mono-dim"`, then `cut_out` with `each: true` and one overlay track per piece, each starting a beat later with `transition: { "kind": "pop" }`.
   - **Things, not just people**: `cut_out` with a `prompt` lifts whatever you name: "the dog", "the cake", "the sparkler". Short, concrete names work best. It needs SAM; if the tool says SAM isn't set up, use `mode: "subject"` instead.
   Check each with `frame`. Effects follow the subject's box, so look at a moment where it's moving.
5. **Review it yourself.** `review_cut`, fix what it finds (holds where nothing moves, uncropped footage, silence, length), critique the designed shots in its design pass and fix the weakest, and look again.
6. **Hand off for review.** `hand_off` with kind `review` on the cut, saying in a sentence or two what you made and what you'd like them to judge. If you made several cuts, mention the others; they can switch between them.

## A cut the person made

When they make a new cut in the studio and ask you to build it, the footage is already logged: `get_project` on that cut and go through the steps above on it. A fresh cut starts empty; make it a new attempt from the footage rather than reworking the other cuts. A variation is a copy: change what they asked and keep its length and formats. Leave the other cuts alone either way.

## Narration

When the person wants a voiceover (or a cut's purpose calls for one: a story, an explainer, a longer YouTube version):

1. Write it to the footage and the cut's length: short lines, one thought each, about 2.5 words a second, leaving room for the music. Give each line an id you'll anchor to (hook, arrive, drop, end).
2. `narrate` with the lines. It uses the cut's voice, or the person's default; `list_voices` shows the rest. Pick another only if they asked or the brief clearly calls for it. Use `tts` for how numbers and names are said, `gapAfter` and `holdBefore` for breathing room.
3. Hang the picture on the words: a shot starts on `{ "kind": "word", "line": "drop", "word": "fireworks" }` or a line's start. The music dips under the voice by itself (`/music/duck`, 0.35 by default). Turn on `/captions` (`{}`): most people watch with the sound off.
4. To change a line, `narrate` it again with the new text; only changed lines are read again. A locked structure stage means the script is final.

## Notes

When the person sends notes, `get_batch` for that project and cut. For each note, make the scoped change, check it with `frame` if it's visual, then `resolve_note` with a one-line reply. If a note asks for something you can't do, resolve it with `done: false` and say why. Then `hand_off` for review again.

## Offering variations

When a cut is in good shape and you see a clearly different take worth trying (calmer, punchier, shorter for a teaser, landscape for YouTube), you can make it with `create_cut` (a copy for a variation; `fresh: true` with `formats` and `targetLength` to build another length or shape from scratch) and mention it in your review hand-off. Don't make more than one or two unasked.

## Finishing

When they say it looks good: `fit_music` if the song should end with the cut, then `render` the cut (a final render reads the original footage and is mastered to -14 LUFS for social; `draft: true` is quick), and `hand_off` for a last review saying where the file is (`projects/<id>/out/`).
