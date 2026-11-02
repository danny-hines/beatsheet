# Which model for which shot

What we know about the image and video models beatsheet could use, and what we think about each kind of shot, so the catalog (`packages/schema/src/catalog.ts`), Auto's ranking and the make skill can follow. Read on 2 November 2026; prices and leaderboards move monthly, so check a model's own page before you change its entry. The craft of prompting each model is in the make skill's [models.md](../.agents/skills/make/models.md).

What beatsheet offers today is the catalog. This page is the field around it and our opinions, marked with how sure we are. Our own side-by-side tests (at the end) haven't been run yet; when they are, their results outrank everything below.

## How to pick

1. **Rule out before ranking.** Refusals and licenses remove more models than quality does.
   - A real person in the shot (a cast member made from their own photos): not Seedance (refuses real faces by policy since February 2026) and not Gemini Omni Flash (blocked a developer's own footage).
   - Where the person is: MiniMax H3's open weights aren't licensed in the US, EU, UK or South Korea (see Licenses).
   - Mature content: hosted models soften implied violence and refuse gore; blood stays on the person's own card (Wan 2.2, LTX-2.5).
   - Length: past 15 seconds in one take, only Seedance 2.5, Wan 3.0 and Kling 4.0 (all to 30 s).
   - From a board or from words: the rankings differ (Wan 3.0 is first from text, ninth from a still; FLUX 3 Max fifth and twelfth). beatsheet mostly animates boards, so the image-to-video board counts most.
2. **Rank by the kind of shot** (the table below).
3. **Rough and final from one family**, so the take the person picked survives: Seedance 2.5's draft completes into its 1080p final; Wan 3.0 at 480p then 1080p with the same seed; H3 Max Turbo then H3 Max. A rough from another family only blocks the shot out.
4. **Text and sound aren't the model's job.** Words that must read go in as a coded overlay (`kit:Title`, a scene); a sign in the world goes on the board and is animated gently. A clip's own sound is a temp track: the cut's song, voice and sfx are the real soundtrack, so ask clips for "diegetic sound only, no score".

## Where the leaders stand

Blind votes on [Artificial Analysis](https://artificialanalysis.ai/video/leaderboard/image-to-video) (AA) and public votes on [arena.ai](https://arena.ai/leaderboard/video/image-to-video), read 2 November 2026. The top six on each AA board sit inside each other's confidence intervals: a tie. The gap that's real is between that cluster and the next tier (Kling 3.0, Veo 3.1), 100–250 points below.

| Model | AA text-to-video | AA image-to-video | arena.ai image-to-video | Final, per 5 s | In beatsheet |
|---|---|---|---|---|---|
| Wan 3.0 | #1 (1175) | #9 (1111) | #3 | fal $1.00 (1080p) | yes |
| MiniMax H3 (768p) | #3 (1161) | #4 (1128) | #1 (1495) | fal $0.30 | yes |
| Seedance 2.5 | #4 (1157) | #1 (1153) | #4 | fal $5.82, Runway $3.40 (1080p) | yes |
| FLUX 3 Max | #5 (provisional) | #12 (1064) | — | fal $1.45 after 7 Nov | no |
| HeyGen Video 1 | #6 (1156) | #6 (1120) | — | HeyGen API, about $0.20 | no |
| H3 Max | #7 (1149) | #8 (1117) | Design Arena #1 | fal $0.80 (1080p) | yes |
| Gemini Omni Flash 1.1 | #10 | #14 | #2 | fal $0.75 | yes |
| Kling 4.0 | not rated | not rated | Design Arena #2 | fal $1.18 (1080p) | yes |
| Kling 3.0 Pro | #19 (1000, the anchor) | #17 | #19 | fal $0.56 silent | yes |
| Veo 3.1 | #22 | #21 | #13–17 | fal $2.00 with sound | no |
| Kling 2.5 Turbo | not rated | not rated | #27 | fal $0.35 | yes |

Utopai X (#2 on both AA boards) has no API. Three of the top six are built on MiniMax H3's open weights (H3, Utopai X, HeyGen Video 1), with fal's H3 Max just below.

## By kind of shot

Rough is a cheap take to judge motion and the cut; final is the shot that stays. Per 5 seconds at standard prices (H3 Max and Turbo from 16 November, FLUX 3 Max from 8 November). Confidence: **high** when a blind category board and hands-on tests agree, **medium** with one strong source, **low** when it rests on a proxy, a policy page, a vendor's claim or one take. Nearly every hands-on comparison behind these used one seed per model.

| Kind | Rough | Final | Also | Confidence |
|---|---|---|---|---|
| dialogue | H3 Max Turbo, $0.20 | Seedance 2.5 (made-up speakers), $5.82 | H3 Max, or its lip sync on a `narrate` line (real people), $0.80 | medium |
| action | Wan 3.0 480p, $0.25 | Seedance 2.5, $5.82 | Kling 4.0, $1.18 | high for Seedance |
| contact (a hug, a punch landing) | Seedance 2.5 draft, $1.10 | Copy a filmed performance (SCAIL-2 on the card, Kling Motion Control on fal $0.84) | Seedance 2.5 | low |
| crowd | Wan 3.0 480p | Seedance 2.5 | Wan 3.0 1080p, $1.00 | low |
| animals | Wan 3.0 480p | Seedance 2.5 | Kling 4.0 | low |
| product | Wan 3.0 480p | Seedance 2.5 with product photos as references | Wan 3.0 1080p | medium |
| establishing | H3 Max Turbo | H3 (768p, 2K) or H3 Max, $0.30–0.80 | Wan 3.0 1080p | medium-low |
| stylized | Wan 3.0 480p | Seedance 2.5 from a styled board | HeyGen Video 1 | medium (anime, 3D) |
| text | a coded overlay, $0 | the overlay; else H3 from a lettered board | Omni Flash 1.1 | medium |
| camera (orbit, crane, whip pan) | H3 Max Turbo | Seedance 2.5 with a clip of the move | Kling 4.0 (the only one that orbited on request) | medium |
| long (over 10 s) | Wan 3.0 480p, $1.50 per 30 s | Kling 4.0, $7.05 per 30 s | Wan 3.0 1080p, $6.00 per 30 s | low |
| consistency (one character across shots) | H3 Max Turbo with references | H3 Max with references | Seedance 2.5 (made-up) or Wan 3.0 (real) | low-medium |
| likeness (a real person) | Wan 2.2 on the card, $0 | Wan 3.0 1080p | Copy the person's own performance | low |
| closeup (acting) | Seedance 2.5 draft | Seedance 2.5 | Wan 3.0 (real faces) | low-medium |
| physics (water, cloth, things breaking) | Wan 3.0 480p | Seedance 2.5 (2.0 for destruction) | Wan 3.0 1080p | medium |
| sound | Omni Flash 1.1 360p, $0.15 | Seedance 2.0 or 2.5 from a still | Omni Flash 1.1 from text | medium |
| mature | Wan 2.2 on the card | Wan 3.0 (implied violence) | Wan 2.2 or LTX-2.5 on the card for blood | low |
| vertical | H3 Max Turbo from a 9:16 board | Seedance 2.5 from a 9:16 board | H3 Max | low |

What's behind the picks:

- **Seedance 2.5** leads AA's image-to-video board and its Dialogue & Lip Sync and Human Anatomy categories from text and from a still; testers agree on its weight and impact. But it costs 7–14 times what the models it ties with on text-to-video cost, it's slow (278 s for 10 s on fal), it drifted a character and reshaped a prop across a cut in two tests, and it refuses real people.
- **MiniMax H3 / H3 Max** are the value: top cluster at a fraction of the price, first on image-to-video Spatio-Temporal Consistency (H3 Max) and Text Rendering (H3), second on Dialogue and Camera Control (H3 Max). Weak at big action and steady faces.
- **Wan 3.0** is first from text and in the Camera Control, Complex Composition and Multi-Scene categories, runs to 30 s, and animated a photoreal start frame Seedance refused. Soft on impacts, late on timed beats, and it cuts on its own unless told "one continuous shot".
- **Kling 4.0** isn't on AA yet. In hands-on tests it was the only model to orbit on request, hit four timed beats in a 30 s take, and kept a character best; its voices changed mid-scene.
- **Contact** is where every model fails on its own (all softened a fight; no model danced the prompted moves). Copying a filmed performance is the dependable route.
- **Text:** video models garble small print and invent lettering. Letter the board with GPT Image (it won lettering tests) and animate with H3, or overlay it.
- **Establishing:** H3 tops AA's Architecture & Real Estate from a still, against the blog consensus for Veo 3.1 (20th–27th there). Render at 1080p and upscale for 4K.
- **Long, likeness, mature and vertical** have no blind evidence at all: AA tests 10-second, 16:9 clips with no real person. Crowds, animals, establishing shots and close-ups only have stand-in categories.

## The catalog: what to change

The research's recommendations, and where each stands (2 November 2026). The fal models added send what fal's published schemas ask for, checked field by field; none has made a take for real yet.

| Change | Model | Why | Done |
|---|---|---|---|
| Replace | Nano Banana (2.5 Flash Image) → Nano Banana 2.1 | Google shuts the old one down on 15 March 2027; arena.ai #36 → #5 at about the same price; 14 references, 9:16 and 21:9 | Added on fal and a Gemini key, ahead of the old one (Auto's still); the old one stays until March |
| Upgrade | GPT Image → GPT Image 2.5 (Flare for boards, Sunburst for sheets, products and likeness) | #1–2 on all four image boards; 16 references; medium quality is 1.3¢ at 1024² | Already 2.5 Flare on an OpenAI key; now on fal too. Sunburst isn't offered |
| Keep | Muse Image | 1¢, AA #8: the rough-board model | |
| Add | Wan 3.0 (480p rough, 1080p final, references) | First from text; real faces; 30 s; $0.25–1.00 per 5 s | Added (fal's prompt expansion left on) |
| Add | Seedance 2.5 (draft, then complete by `draft_id`) | First from a still, for dialogue and bodies; made-up characters only; Runway's API is a cheaper second route | Added on fal, 480p roughs and 1080p finals made separately; finishing a draft and Runway aren't wired |
| Add | Kling 4.0 | Orbits, up to 8 middle keyframes, timed 30 s takes | Added, without keyframes or `multi_prompt` |
| Add | Gemini Omni Flash 1.1 | Sound and motion design from a prompt, 360p roughs at 15¢; never for real people | Added on fal (not on a Gemini key), without references |
| Keep | H3, H3 Max, H3 Max Turbo on fal | The top cluster at the lowest prices | Now Auto: H3 Max Turbo for roughs, H3 Max for finals |
| Gate | MiniMax H3 on ComfyUI | Its license excludes the US, EU, UK and South Korea | Kept in Auto at the person's choice; the menu note says so |
| Add | LTX-2.5 on ComfyUI | The local model with sound whose license allows US use (free under $10M revenue); 5 s clips fit a 4090, 10 s run out of memory | Not yet: needs its workflow and about 25 GB of files |
| Add | H3 Max lip sync; sync-3 | A `narrate` line onto a board; dubbing existing footage | Not yet: needs a request that carries a voice line |
| Upgrade | Wan 2.2 Animate → Wan-Animate-2; add Kling v3 Motion Control on fal | A text-set camera angle; copying movement without the card, up to 30 s | Kling Motion Control added; Wan-Animate-2 not yet |
| Demote | Kling 3 Pro | Mid-pack everywhere; keep for `@Element` references until Kling 4.0 takes them on fal | Moved below the new finals |
| Remove | Kling 2.5 Turbo, Wan 2.2 on fal | Ranked far below; H3 Max Turbo and Wan 3.0 480p cost the same or less, with sound | Kept at the end of the list, for takes already made with them |
| Don't add | Veo 3.1, Runway Gen-4.5, Pika, Hailuo 2.3 | 100–300 points below the top; Sora's API closed on 24 September 2026 | |
Two structural changes matter more than any one model: **families with a rough and a final tier**, so a picked rough survives into the final, and **an eligibility check per route** (real person, territory, mature, length) ahead of the ranking. The real-person check is in: a character made from the person's own photos (unless they show it's a pet or a thing) rules out Seedance and Gemini Omni Flash (`refusesRealPeople`). Territory and mature aren't checked.

Stills, by job: GPT Image 2.5 Sunburst for people, sheets, products and lettering; Nano Banana 2.1 for photographic boards, places and tall frames; Muse Image for cheap rough boards; Nano Banana Pro when a board has more than four recurring characters.

## Licenses and refusals

- **MiniMax H3's open weights.** The [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) grants rights "solely within the Applicable Territory": worldwide excluding the EU, the UK, South Korea and the US. A commercial product using it must show "MiniMax H3"; above $20M a year needs MiniMax's written permission. [Comfy's H3 tutorial](https://docs.comfy.org/tutorials/video/minimax/minimax-h3) says commercial use of output made locally needs a MiniMax license bought through Comfy. H3 on fal is MiniMax's model served as a paid API; fal's own terms for it haven't been read yet.
- **Seedance:** refuses photos of real people; made-up people are sometimes refused too.
- **Gemini Omni Flash:** blocks real people's likenesses, even someone's own footage.
- **GPT Image:** edits of real people need their consent; strictest on wardrobe.
- **Violence:** implied and action violence pass on hosted models with the contact softened; gore is refused. fal's safety checkers can only be relaxed by authorized accounts. Veo (`safety_tolerance` 1–6) and FLUX 3 (0–4) expose a level.
- When a service refuses a shot, rephrase what's in it; don't route around the filter. Creator videos that rename trademarked props or hide faces and pitch-shift voices to get past a filter aren't a model for beatsheet.

## Prompting, across models

The per-model recipes are in [models.md](../.agents/skills/make/models.md). What holds everywhere:

- From a board, say what moves, not what the board shows (restating it gives near-static clips or a drifting face). MiniMax H3 is the exception: anchor the prompt on the board, then move forward in time.
- One camera move per shot, with a pace word; say "locked-off camera" when it shouldn't move. Orbits of 90–180° in a short clip, not 360°.
- About one beat per two seconds, and at most 2.5 spoken words a second.
- Quotation marks only around dialogue (quoted emphasis gets spoken); each line with a speaker and a tone.
- "One continuous shot, no cuts" on models that cut on their own (Wan 3.0, Seedance, Omni): beatsheet makes the cuts.
- Every reference picture with a number and a job, in upload order; references with no job get ignored and roles swap when the order slips.
- The same look block (camera, lens, format, grade) in every prompt of a cut, from the project's `look`.
- Turn off the model's own prompt rewriting when beatsheet writes a full prompt (Wan's `enable_prompt_expansion`, H3's `prompt_expansion_mode`, LTX's `enhance_prompt`). Untested for us; part of test 2.

## The creator videos

Six popular YouTube tutorials were checked against the research. All six make money from the platform they demo, and none carried YouTube's paid-promotion label.

- **Right:** the workflow. Sheets first; numbered references with roles; a long structured prompt written by an LLM; a 480p draft before 1080p; dialogue sized to the clip; the person's real voice lines; one long take mined for its cuts (`split_at_cuts`); a person approving before money is spent.
- **Wrong:** Seedance as the answer to every shot (it's tied on text-to-video at many times the price, and refuses real people). The 1080p pass isn't an upscale: it renders again from the draft's seed, so details change.
- **Untested:** voice references wrapped as black-screen MP4s; one long take holding together better than stitched clips.

## Our own tests

Not run yet. Each with three takes per model, the prompt written once and put in each model's form, the takes shown in a `choose` hand-off with model names hidden, and cost and time logged. About $300–350 in all at list prices; tests 1 and 2 first.

| # | Shots | Models | Measures | About |
|---|---|---|---|---|
| 1 | A real person says one 12-word line, 6 s, locked medium close-up, boards from their own photos | Wan 3.0, H3 Max, Kling 4.0, Kling 3 Pro with an element, H3 Max lip sync on a `narrate` line; one Seedance 2.5 to see if it refuses | refusal, whether it's still them, lip sync | $15 |
| 2 | Does the rough survive the final? A product push-in, a walk-and-talk and a street establishing shot, at 16:9 and 9:16 | Seedance 2.5 draft → complete; Wan 3.0 480p → 1080p; H3 Max Turbo → H3 Max; native 9:16 against beatsheet's reframe | framing, motion and timing carried over; cost per kept shot | $50–75 |
| 3 | A hug, a handshake, a shove that lands, a fall | Seedance 2.5, Kling 4.0, Wan 3.0, H3 Max, against SCAIL-2 and Kling Motion Control from a filmed take | limbs, weight, whether contact lands | $55 |
| 4 | A 180° orbit, a crane up, a whip pan, a push-in timed to a bar, a handheld follow | Kling 4.0 (keyframes for the orbit), Seedance 2.5, Wan 3.0, H3 Max, Luma Ray 3.2 | move done or swapped; timing against the bar | $65 |
| 5 | A 30 s two-person scene with four beats and three lines, as one take against six 5 s clips | Kling 4.0, Wan 3.0, Seedance 2.5 draft; H3 Max and Wan 3.0 stitched | beat timing, continuity, pacing | $40 |
| 6 | The person's own pet running, a cat jumping onto a counter, a horse trotting | Seedance 2.5, Kling 4.0, Wan 3.0, H3 Max | gait, fur, still their pet | $35 |
| 7 | 12 prompts from a shove to stage blood to a wound to a horror creature, 480p | Wan 3.0, Kling 4.0, Seedance 2.5, H3 Max, Grok Imagine 1.5; Wan 2.2 and LTX-2.5 on the card | pass, softened or refused; whether refusals are billed | $35 |
| 8 | A product label and a shop sign lettered on the board, 5 s push-in | H3, H3 Max, Wan 3.0, Seedance 2.5, Kling 3 Pro; Omni Flash from text | legibility on the first, middle and last frames | $15 |

Longer term, every `choose` between takes is a blind vote for one model over another on a real shot. Logged with the model hidden, they become a per-shot arena no public board has.

## Sources

The leaderboards and their categories: [AA text-to-video](https://artificialanalysis.ai/video/leaderboard/text-to-video), [AA image-to-video](https://artificialanalysis.ai/video/leaderboard/image-to-video), [AA methodology](https://artificialanalysis.ai/methodology/video), [arena.ai](https://arena.ai/leaderboard/video/image-to-video), [Design Arena](https://www.designarena.ai/leaderboard?tab=video&section=video&board=image-to-video). Hands-on comparisons, one take each: [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test), [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/), [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5), [Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review). Prices: each model's page on fal (`fal.ai/models/<endpoint>/llms.txt`) and [Runway's API pricing](https://docs.dev.runwayml.com/guides/pricing/). Policies: [Seedance's face block](https://triviumchina.com/2026/02/10/bytedance-stops-uploads-of-human-photos-for-seedance-2-0/), [Omni's likeness block](https://discuss.ai.google.dev/t/real-peoples-names-or-likenesses-block-on-own-footage-gemini-omni-flash-preview-skyhill-hq/179433), [Nano Banana's shutdown date](https://ai.google.dev/gemini-api/docs/deprecations).
