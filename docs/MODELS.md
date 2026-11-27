# Which model for which shot

What we know about the image and video models beatsheet could use, and what we think about each kind of shot, so the catalog (`packages/schema/src/catalog.ts`), Auto's ranking and the make skill can follow. Read on 2 November 2026; prices and leaderboards move monthly, so check a model's own page before you change its entry. The craft of prompting each model is in the make skill's [models.md](../.agents/skills/make/models.md).

What beatsheet offers today is the catalog. This page is the field around it and our opinions, marked with how sure we are. Our own side-by-side tests (at the end) haven't been run yet; when they are, their results outrank everything below. The first evidence from a real project is in [From real work](#from-real-work).

## How to pick

1. **Rule out before ranking.** Refusals and licenses remove more models than quality does.
   - A real person in the shot (a cast member made from their own photos): not Seedance on fal (refuses real faces by policy since February 2026) and not Gemini Omni Flash (blocked a developer's own footage). Seedance 2.5 through Tein does take them: Tein keeps the faces in the pictures it's given (`pass_faces`), and a selfie came through as a start frame and as a reference on 19 November 2026 (two 4-second 480p takes, one photo; nothing longer or at 1080p was tried). Tein's terms want each real person's consent.
   - Where the person is: MiniMax H3's open weights aren't licensed in the US, EU, UK or South Korea (see Licenses).
   - Mature content: hosted models soften implied violence and refuse gore; blood stays on the person's own card (Wan 2.2, LTX-2.5). For stills, GPT Image refuses fights and blood with people from real photos.
   - Length: past 15 seconds in one take, only MAGI-2, Seedance 2.5, Wan 3.0 and Kling 4.0 (all to 30 s).
   - Directing mode (References vs. locked start frame vs. text): rankings differ (Wan 3.0 is first from text, ninth from a locked still; Seedance 2.5 and MAGI-2 tie #1 on I2V and also excel at multi-reference R2V). For most character and action shots, **References mode** (`refs: ["board"], includeCastRefs: true` — or `includeCastRefs: true` with a detailed prompt and no locked start frame) outperforms start-frame-only I2V because mid-action stills aren't frozen as frame 1 and decoupled `@cast` face/outfit sheets anchor likeness throughout motion (supported on MAGI-2, Wan 3.0, Seedance 2.5 / Flash / 2.0 Mini, Kling 4.0, MiniMax H3, HappyHorse 1.1). Reserve locked `start` frames for seamless clip continuations (`still_from_clip`), calm/establishing/lettered shots, exact A→B transitions (`start` + `end`), `drive`, or `speech` — and use Kling 4.0 when a shot needs *both* a locked `start` (+ `end`) and `includeCastRefs: true`.
2. **Rank by the kind of shot** (the table below).
3. **Rough and final from one family**, so the take the person picked survives: Seedance 2.5's draft completes into its 1080p final; Wan 3.0 at 480p then 1080p with the same seed; H3 Max Turbo then H3 Max. A rough from another family only blocks the shot out.
4. **Text and sound aren't the model's job.** Words that must read go in as a coded overlay (`kit:Title`, a scene); a sign in the world goes on the board and is animated gently. A clip's own sound is a temp track: the cut's song, voice and sfx are the real soundtrack, so ask clips for "diegetic sound only, no score".

## Where the leaders stand

Blind votes on [Artificial Analysis](https://artificialanalysis.ai/video/leaderboard/image-to-video) (AA) and public votes on [arena.ai](https://arena.ai/leaderboard/video/image-to-video), read 2 November 2026. The top six on each AA board sit inside each other's confidence intervals: a tie. The gap that's real is between that cluster and the next tier (Kling 3.0, Veo 3.1), 100–250 points below.

| Model | AA text-to-video | AA image-to-video | arena.ai image-to-video | Final, per 5 s | In beatsheet |
|---|---|---|---|---|---|
| MAGI-2 | #7 (1150, 26 Nov) | #1 (1163, 26 Nov) | Higgsfield #2 (1146) | Higgsfield $0.40 (1080p) | yes |
| Wan 3.0 | #1 (1175) | #9 (1111) | #3 | fal $1.00 (1080p) | yes |
| MiniMax H3 (768p) | #3 (1161) | #4 (1128) | #1 (1495) | fal $0.30 | yes |
| Seedance 2.5 | #4 (1157) | #1 (1153) | #4 | fal $5.82, Tein $3.83, Runway $3.40, OpenRouter $2.91 (1080p) | yes |
| FLUX 3 Max | #5 (provisional) | #12 (1064) | — | fal $1.45 after 7 Nov | no |
| HeyGen Video 1 | #6 (1156) | #6 (1120) | — | OpenRouter $0.50 (1080p), $0.10 rough | yes |
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
| dialogue | H3 Max Turbo, $0.20 | Seedance 2.5 (made-up speakers), $5.82 | H3 Max, or a `narrate` line lip-synced (real people): H3 Max Lip Sync on the board $0.80, or sync-3 on a take $0.67 (see Lip sync) | medium |
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
| consistency (one character across shots) | Wan 3.0 480p or MiniMax H3 with `refs` + `includeCastRefs` | Seedance 2.5 or MAGI-2 with `refs` + `includeCastRefs` | Kling 4.0 (`refs` or locked `start` + `includeCastRefs`), Wan 3.0 1080p (real people) | medium |
| likeness (a real person) | Wan 3.0 480p (`refs` + `includeCastRefs`) or Wan 2.2 on the card ($0) | Seedance 2.5 on Tein (`refs` + `includeCastRefs`) or Wan 3.0 1080p | Kling 4.0 (`start` + `includeCastRefs`), or copy the person's own performance | low-medium |
| closeup (acting) | Seedance 2.5 draft | Seedance 2.5 | Wan 3.0 (real faces) | low-medium |
| physics (water, cloth, things breaking) | Wan 3.0 480p | Seedance 2.5 (2.0 for destruction) | Wan 3.0 1080p | medium |
| sound | Omni Flash 1.1 360p, $0.15 | Seedance 2.0 or 2.5 from a still | Omni Flash 1.1 from text | medium |
| mature | Wan 2.2 on the card | Wan 3.0 (implied violence) | Wan 2.2 or LTX-2.5 on the card for blood | low |
| vertical | H3 Max Turbo from a 9:16 board | Seedance 2.5 from a 9:16 board | H3 Max | low |

What's behind the picks:

- **MAGI-2** (Sand.ai, 480B / 28B active MoE, released 24 November 2026) ties Seedance 2.5 at the top of AA's image-to-video board (1163 vs 1158) and leads AA on silent I2V, text rendering, UI/UX, audio sync and spatio-temporal consistency, at a flat $0.08/s for 1080p / 25 fps (4–30 s, including blockout video references and sound) — cheaper than Seedance 2.5's 480p roughs. On Higgsfield's own blind director board Seedance 2.5 still beats MAGI-2 61%–39% (and still edges it on AA dialogue/lip-sync, human anatomy, live-action film and camera control). Sand.ai notes shimmer/artifacts on extreme high-speed motion and over-smoothed wide 2D animation; real-face handling and striped-pill blockout fidelity on Higgsfield haven't been smoke-tested here yet.
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
| Upgrade | GPT Image → GPT Image 2.5 (Flare for boards, Sunburst for sheets, products and likeness) | #1–2 on all four image boards; 16 references; medium quality is 1.3¢ at 1024² | On 2.6 since 21 November 2026, on an OpenAI key and on fal: Flare is GPT Image, Sunburst its own model (`gpt-image-sunburst`). 2.6 draws medium quality with about 3.3 times the tokens, so a 1024×1536 picture is about 3.4¢ out. Neither 2.6 flavour has made a take for real yet |
| Keep | Muse Image | 1¢, AA #8: the rough-board model | |
| Add | Wan 3.0 (480p rough, 1080p final, references) | First from text; real faces; 30 s; $0.25–1.00 per 5 s | Added (fal's prompt expansion left on) |
| Add | Seedance 2.5 (draft, then complete by `draft_id`) | First from a still, for dialogue and bodies; made-up characters only; Runway's API is a cheaper second route | Added on fal, Tein and (21 November 2026) Runway, 480p roughs and 1080p finals made separately; finishing a draft isn't wired |
| Add | Kling 4.0 | Orbits, up to 8 middle keyframes, timed 30 s takes | Added, without keyframes or `multi_prompt` |
| Add | Gemini Omni Flash 1.1 | Sound and motion design from a prompt, 360p roughs at 15¢; never for real people | Added on fal (not on a Gemini key), without references |
| Keep | H3, H3 Max, H3 Max Turbo on fal | The top cluster at the lowest prices | Now Auto: H3 Max Turbo for roughs, H3 Max for finals |
| Gate | MiniMax H3 on ComfyUI | Its license excludes the US, EU, UK and South Korea | Kept in Auto at the person's choice; the menu labels it "not for commercial use" |
| Add | LTX-2.5 on ComfyUI | The local model with sound whose license allows US use (free under $10M revenue); 5 s clips fit a 4090, 10 s run out of memory | Not yet: needs its workflow and about 25 GB of files |
| Add | H3 Max lip sync; sync-3 | A `narrate` line onto a board; dubbing existing footage | Added with the rest of lip sync (below): a request now carries what's said (`speech`) |
| Upgrade | Wan 2.2 Animate → Wan-Animate-2; add Kling v3 Motion Control on fal | A text-set camera angle; copying movement without the card, up to 30 s | Kling Motion Control added; Wan-Animate-2 not yet |
| Demote | Kling 3 Pro | Mid-pack everywhere; keep for `@Element` references until Kling 4.0 takes them on fal | Moved below the new finals |
| Remove | Kling 2.5 Turbo, Wan 2.2 on fal | Ranked far below; H3 Max Turbo and Wan 3.0 480p cost the same or less, with sound | Kept at the end of the list, for takes already made with them |
| Add | Runway as a provider of video and stills | Creators already pay for it, and its API sells models the catalog has: Kling 4.0, 3 Pro and 2.5 Turbo, Seedance 2.5, Wan 3.0, MiniMax H3, Gemini Omni Flash 1.1, both Nano Bananas, Muse Image and GPT Image 2.6 | Added on 21 November 2026 from its docs and openapi.json; no take has been made there for real yet. Its own Gen-4.5 and Gen-4 Image stay out (below), and its H3 Max (480p and 768p) isn't taken to be fal's tuning |
| Add | MAGI-2 (Higgsfield) | Tied #1 on AA image-to-video (1163), 4–30 s at 1080p / 25 fps with sound, up to 10 image refs + blockout video refs + up to 5 reference audio clips, flat $0.08/s (Sand.ai's direct API top-up is paused) | Added on 26 November 2026 on Higgsfield (`sand/magi-2/{text,image,reference}-to-video`) from its model pages and `llms.txt` schemas, including `audioRefs` (`audio_urls`, with `generate_audio: false` for timeline-synced music/speech); no take has been made for real yet |
| Add | Higgsfield as a provider of video and stills | Creators already pay for it, and its API sells models the catalog has, most for less than fal: MAGI-2, Seedance 2.5 (with a clip's camera, billed on the take's seconds only), Kling 4.0, Kling 3 Pro, Kling 2.5 Turbo, Wan 3.0 and Kling Motion Control | Added on 21 November 2026 from docs.higgsfield.ai, its model pages and pricing page (MAGI-2 added 26 November 2026); no take has been made there for real yet. Its stills are GPT Image 2.5 (the version before the catalog's, routed under GPT Image and GPT Image Sunburst and priced by the token, with no price for a picture at medium quality published) and its own Soul 2 (`soul-2`, from a prompt only, 0.57¢ at 1080p by its pricing page; not compared in blind votes). Left out: Seedream 5 Pro and Kling Image 4.0 (in its console only, and not compared), Cinema Studio and Genjutsu, MiniMax H3 (in its docs but not its console), Kling 4.0's middle frames and references, and Soul's trained characters (Soul ID) |
| Add | OpenRouter as a provider of video and stills | One key at upstream list prices (0% inference markup) covering most catalog stills (including FLUX 3 Image Klein hosted for 0.9¢), cheaper Seedance 2.5 (half of fal's rate) + Seedance 2.5 Flash & 2.0 Mini, Wan 3.0, MiniMax H3 (2K), Gemini Omni 1.1 & 1.2 Flash, HeyGen Video 1 (#6 on AA), HappyHorse 1.1, Grok Imagine Video 1.5 / Lite (down to 1s), HeyGen Avatar 6 / Avatar 6 Turbo lip sync, MiniMax H3 Image, MAI-Image-2.7, FLUX 3 Image and Seedream 5.5 | Added on 26 November 2026 from openrouter.ai/openapi.json, `/api/v1/images/models` and `/api/v1/videos/models`; no take has been made there for real yet. Curated rather than mirroring all 71 image and 30 video models: left out superseded generations (GPT Image 1/2/2.5, Seedream 4.5/5.0, FLUX.2, Seedance 2.0 full/fast, Hailuo 2.3, Veo 3.1, Runway Gen-4.5, HeyGen Avatar IV), non-fal silent H3 Max (480p/768p), vector/panorama/edit/upscale-only models (Recraft SVG, HY-World Panorama, FLUX Video Edit/Upscale, Runway Aleph 2.0), and unranked or higher-priced overlap (FLUX 3 Video, Wan 3.0 Prime, Qwen/Riverflow/Krea stills) |
| Don't add | Veo 3.1, Runway Gen-4.5, Pika, Hailuo 2.3 | 100–300 points below the top; Sora's API closed on 24 September 2026 | |
Two structural changes matter more than any one model: **families with a rough and a final tier**, so a picked rough survives into the final, and **an eligibility check per route** (real person, territory, mature, length) ahead of the ranking. The real-person check is in: a character made from the person's own photos (unless they show it's a pet or a thing) rules out Seedance and Gemini Omni Flash (`refusesRealPeople`). Territory and mature aren't checked.

Stills, by job: GPT Image 2.5 Sunburst for people, sheets, products and lettering; Nano Banana 2.1 for photographic boards, places and tall frames; Muse Image for cheap rough boards; Nano Banana Pro when a board has more than four recurring characters.

## Lip sync

Two jobs: **talk** (a board made to say a line, as a new clip) and **dub** (the mouths in a clip changed to say it, everything else kept). What's said is the cut's voiced line where the shot plays, so the take lines up with it. Research of 2 November 2026 in `research_notes/Lip sync/notes.md`. No independent blind comparison of lip sync exists yet: every study is a vendor's or a model's own authors', so the order is price and the vendors' consensus, to be changed by what the person keeps.

| Job | Rough (Auto) | Final (Auto) | Also in beatsheet | Confidence |
|---|---|---|---|---|
| talk | H3 Max Lip Sync 480p, $0.05/s (5 s at least) | H3 Max Lip Sync 1080p, $0.16/s | HeyGen Avatar 6 Turbo (OpenRouter 1080p, $0.05/s), HeyGen Avatar 6 (OpenRouter 1080p, $0.10/s), sync-3 ($0.133/s), Kling Avatar 2 Pro ($0.115/s), OmniHuman 2 ($0.105/s), VEED Fabric 1.0 ($0.08–0.15/s), LongCat Avatar ($0.15–0.30/s, in steps of 5 s; commercial use unclear), InfiniteTalk (on the card $0, on fal $0.20/s) | low |
| dub | Kling Lip Sync, $0.014/s (2–10 s, 720p or more, 5 s at least billed); past 10 s, LatentSync, $0.20 a take up to 40 s | sync-3, $0.133/s | Lipsync 2 Pro ($0.083/s) | medium for sync-3 |

- **sync-3** is the vendors' pick for dubbing: the whole shot at once, natively up to 4K, close-ups, profiles, hands or a mic in front of the mouth. It alone can pick one face among several (by a point, boxes or a face picture), which beatsheet doesn't use yet.
- **H3 Max Lip Sync** is the cheapest way to make a board talk and the longest (5 s to 15 min, 1.2× past 15 s). Its eyes stay as the board has them: a board with closed eyes keeps them closed.
- **Kling Avatar** had more accurate mouths and **OmniHuman 1.5** steadier motion in one vendor's test (PiAPI); another vendor saw OmniHuman 1.5 drift after about 10 s. OmniHuman 2's output size isn't published.
- **InfiniteTalk** (Apache 2.0) is the one open model on ComfyUI's own nodes, so it runs on the 4090 with no custom pack: Wan 2.1 at 480p, 25 fps, carried on in chunks. The one 4090 report is an anecdote (about 70 s at 480p, 4 steps, length not given).

Not added, and why:

| Model | Why not yet |
|---|---|
| LatentSync 1.6 on your own card | Added on fal (it repaints only the mouth, so the clip keeps its sharpness). On the card it needs a custom ComfyUI pack (`GuardSkill/ComfyUI-LatentSyncEnhanced`, node `LatentSyncEnhanced`) that imports InsightFace without listing it, which ComfyUI's Python 3.13 on Windows has no ready-built wheel for; and its face detector would make it "not for commercial use" there |
| H3 Max lip sync, video to video ($0.10–0.20/s) | Redraws the whole frame at 480p or 768p and makes it 24 fps; sync-3 keeps the clip as it is |
| HeyGen Lipsync (speed $0.05/s, precision $0.10/s), VEED Lipsync 2 ($0.07/s) | New on fal, no evidence yet; worth a place in the list once there is |
| LTX-2.3 from a picture and sound (ComfyUI's own template) | 720p where InfiniteTalk is 480p, but about 41 GB of files and mixed reports on its mouths |
| Wan 2.2 S2V, HuMo | On ComfyUI's own nodes, but S2V needs 20 steps (its 4-step LoRA ruins it) and HuMo makes about 3.9 s with no way to carry on |
| MuseTalk 1.5 | The only one a Mac or the laptop could run (256×256 face, the lowest quality); no ComfyUI pack loads 1.5 |
| LongCat-Avatar on your own card, Hunyuan-Avatar | Custom packs (LongCat on fal is added); Hunyuan-Avatar isn't on fal and is very slow |
| Wav2Lip, JoyGen | Superseded, and lower quality than what's here (both are non-commercial too) |
| TBDub, X-Dub (2026 research) | Best measured dubbing in their authors' own studies, but Linux Python with no ComfyUI pack: a worker of their own, as SAM has |

Two people talking in one shot: MultiTalk on fal and InfiniteTalk's two-speaker mode take a voice each, but which voice goes to which face isn't documented on fal, so beatsheet says one person's lines per take for now.

### Reference audio (`audioRefs`)

Alongside dedicated lip-sync (`speech`), multimodal video models on `reference-to-video` accept reference audio clips (`audioRefs`: cut music slice, voiced lines, character voice timbre from `cast.voiceSample`/`cast.heard`, or any audio/video asset slice) combined with reference pictures and 3D camera blockouts:

- **MAGI-2 (Higgsfield):** `audio_urls` — up to 5 clips, 2–30 s each, ≤30 s combined, flat $0.08/s. Accepts `audio_urls` even with `generate_audio: false`, which beatsheet sets automatically for timeline-synced `"music"` and `"speech"` references.
- **Seedance 2.5:** up to 10 clips / ≤30 s on fal (`audio_urls`, `@Audio1`…) and Higgsfield (`audio_urls`); up to 3 clips / ≤15 s on Runway (`referenceAudio`) and OpenRouter (`input_references` `audio_url`, also Seedance 2.5 Flash & 2.0 Mini). Not enabled on Tein (`takes.audio: false`). No extra surcharge for audio-only references without video input.
- **Wan 3.0:** up to 5 clips / ≤30 s on Higgsfield (`audio_urls`), up to 5 clips / ≤15 s on fal (`reference_audio_urls`), and up to 3 clips / ≤15 s on Runway (`referenceAudio`). Not enabled on OpenRouter.
- **MiniMax H3:** up to 3 clips / ≤15 s on Runway (`referenceAudio` on `hailuo3`). Not available on fal, OpenRouter or ComfyUI.

## Licenses and refusals

**Commercial use.** Models aren't left out for their licenses: beatsheet is for whatever the person makes, and making for fun or to learn is fine under all of them. Instead each route says when what it makes there isn't simply free to use commercially (`commercial` on a catalog route), and the model menu, Settings' ranking and `list_models` show it: "not for commercial use", "commercial use limited" or "commercial use unclear", with why. Auto doesn't skip them. fal marks every model in the catalog for commercial use (its page data, `licenseType: "commercial"`, read on 3 November 2026), as do the Gemini, OpenAI and Meta APIs and the plans, so the labels fall on what runs on your own card under its own license, and on one fal model whose makers say otherwise:

| Route | Commercial use | Why |
|---|---|---|
| MiniMax H3 on ComfyUI | no | Its license grants nothing in the US, EU, UK or South Korea, and output made locally needs a license bought through Comfy |
| FLUX 3 Image Klein on ComfyUI | limited | FLUX Kommunity License: yes for people and companies making under $5M a year |
| LongCat Avatar on fal | unclear | fal sells it for commercial use; LongCat-Video-Avatar's own page says what it makes is for academic use only |
| SCAIL-2, Wan 2.2 (14B, 5B, Animate), InfiniteTalk on ComfyUI | yes | MIT and Apache 2.0 |

A model added later that runs somewhere under a restricting license gets its label with it (LatentSync on your own card would be "no": its InsightFace face detector is for non-commercial research).

- **MiniMax H3's open weights.** The [MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) grants rights "solely within the Applicable Territory": worldwide excluding the EU, the UK, South Korea and the US. A commercial product using it must show "MiniMax H3"; above $20M a year needs MiniMax's written permission. [Comfy's H3 tutorial](https://docs.comfy.org/tutorials/video/minimax/minimax-h3) says commercial use of output made locally needs a MiniMax license bought through Comfy. H3 on fal is MiniMax's model served as a paid API, which fal marks for commercial use.
- **Seedance:** refuses photos of real people; made-up people are sometimes refused too. Through Tein it keeps real faces (its `pass_faces`, on by default); Tein bans accounts that use a real person's face without their documented consent.
- **Gemini Omni Flash:** blocks real people's likenesses, even someone's own footage.
- **GPT Image:** edits of real people need their consent; strictest on wardrobe. It refused 45 of 46 fight shots on a key, and the ChatGPT plan does the same more slowly (see From real work).
- **Violence:** implied and action violence pass on hosted models with the contact softened; gore is refused. fal's safety checkers can only be relaxed by authorized accounts. Veo (`safety_tolerance` 1–6) and FLUX 3 (0–4) expose a level.
- A refusal is part of the ranking: rule that model out for that kind of shot, up front where we know it, and use one whose rules allow the shot, or rephrase what's in it. Don't disguise a shot to get it past a filter. Creator videos that rename trademarked props or hide faces and pitch-shift voices to do that aren't a model for beatsheet.

## Prompting, across models

The per-model recipes are in [models.md](../.agents/skills/make/models.md). What holds everywhere:

- Match prompting to directing mode: from a locked `start` frame, say what moves rather than restating frame 1 (MiniMax H3 is the exception: anchor on the board, then move forward in time); in References mode (`refs` + `includeCastRefs: true`) or with a blockout, describe the whole shot in detail from start to finish (framing, setting, lighting, full action progression, camera move, sound) since no frame is pixel-locked.
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

## From real work

The first long film made here: a 13-minute remake of a home movie, 1 to 5 November 2026, about 1,000 requests and $45 by the engine's estimates. The person's picks are the evidence. It's one project, no take was blind, and models weren't given the same shots, so none of this moves Auto yet.

| Clips | Made | In the cut | Per second | Median wait |
|---|---|---|---|---|
| Wan 3.0, 480p | 49 | 31 | $0.05 | 1.7 min |
| Kling 4.0, 720p | 12 | 7 | $0.157 | 4.6 min (one in ten over 15) |
| H3 Max Turbo | 13 | 3 | $0.04 | 12 s |
| H3 Max | 1 | 1 | $0.16 | 22 s |

| Stills | Made | Failed | Median wait |
|---|---|---|---|
| GPT Image, ChatGPT plan | 405 | 34 | 96 s (one in ten over 11 min) |
| GPT Image, OpenAI key | 42 | 55 | 16 s |
| Nano Banana 2.1 | 90 | 0 | 21 s |
| Nano Banana | 104 | 4 | 12 s |
| FLUX 3 Image Klein, on the card | 123 | 0 | 85 s |
| Muse Image | 28 | 4 | 34 s |

- **Kling 4.0 against Wan 3.0:** of the five shots both made, Kling was kept on three (a pan matching the original's direction, a figure who had to keep a likeness, two faces and a closed book). Wan was kept on two: a bat swing into an end frame, where Kling's bat bounced back out, and a catch where Kling's take had no picture of the character, so it wasn't a fair loss.
- **H3 Max Turbo's** count isn't a fair score: its takes were the person's own quick retries on shots already in trouble, 7 of them worded as a board rather than as what moves. Coming back in 12 seconds is what made it the model to retry with.
- **GPT Image's failures** on a key are the fight shots sent there after the plan stalled on them for 38 minutes: 45 of 46 refused. Most of the plan's 34 were fights too, and 23 came back saying only "done".
- **Where the money went:** 35 of 77 clips went unused ($14.42 of $34.18). By the person's notes, that was staging ($5.74), their own retries ($3.03), likeness ($2.54), trying camera moves and lengths ($2.12) and clips starting mid-action ($1.00). All 305 boards made before the portraits were picked went unused, against 85 of the 116 made after. What changed in the process is in the make and film skills.
- **Finals:** one take of all 126 shots would be about $187 with Wan 3.0 or $219 with Kling 4.0, and only one final has been made, so whether a picked rough survives is still test 2. A picked rough can't be upscaled on the card today: `restore` only shows on clip shots, so a final that renders again is the only way to 1080p.

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
