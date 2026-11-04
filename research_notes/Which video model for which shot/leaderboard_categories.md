# Per-category video leaderboards (Artificial Analysis, arena.ai/LMArena, Design Arena), read 2026-11-02

All numbers below were read in the built-in browser on 2026-11-02 and copied as the pages showed them. Artificial Analysis (AA) states its ratings are "recomputed hourly", so a later reading can differ by a few points.

## What categories exist, what they cover, and how to read the tables

### Takeaway
Artificial Analysis has 20 categories plus "Overall": 10 use cases and 10 capabilities. They are the same on all four video-generation boards: text-to-video and image-to-video, each with and without audio. The two audio categories (Audio Synchronization, Dialogue & Lip Sync) can't be selected on the silent boards. Every test clip is 10 s, 16:9 horizontal and 1080p, so nothing on these boards measures vertical or long output. Neither arena.ai (LMArena) nor Design Arena has capability or use-case categories for video.

### Cited Findings
- **Four boards.** AA-Video-T2V v2.1 (text to video with audio), AA-Video-T2V-Silent v2.1, AA-Video-I2V v2.1 (image to video with audio) and AA-Video-I2V-Silent v2.1. A "With Audio / No Audio" toggle switches between them (`?audio-output=false`). Each benchmark has its own Elo pool, so silent and audio outputs are never compared directly. — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video); [AA methodology](https://artificialanalysis.ai/methodology/video)
- **Category selector.** The selector reads "Category: Overall". Overall is described as "All use cases and capabilities, each weighted equally".
  - USE CASES are described as "The real-world work the video is for, grounded in how consumers and enterprises use video generation."
  - CAPABILITIES are described as "The model skill the prompt is written to test, grounded in lab research and academic benchmarks."
  - The selector gives no description for individual categories. Those come from the methodology page (next bullet). The URL parameter is `?category=<slug>`. — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video)
- **Exact category names, slugs and the methodology's example tasks.** — [AA methodology](https://artificialanalysis.ai/methodology/video)
  - Use cases:
    - **Marketing & Advertising** (`marketing-and-advertising`): animated posters, logo stings, brand films, hero product spots, launch videos.
    - **Retail & Ecommerce** (`retail-and-ecommerce`; the methodology spells it "Retail & E-commerce"): studio product shots, product demos, apparel and fashion movement, creator-style testimonials, outfit try-ons.
    - **Live-Action Film** (`live-action-film`): cinematic shots, microdrama episodes, previsualization.
    - **Animation & Gaming** (`animation-and-gaming`): animated scenes, game trailers, previsualization for animation and games.
    - **Architecture & Real Estate** (`architecture-and-real-estate`): exterior flythroughs, interior walkthroughs, virtual staging.
    - **Productivity & Knowledge Work** (`productivity-and-knowledge-work`): explainers, educational and training videos, animated data visualizations, scenario simulations.
    - **UIUX & Motion Design** (`uiux-design`; "UI/UX & Motion Design" in the methodology): kinetic typography, UI motion demos across devices, abstract motion graphics.
    - **Consumer** (`consumer`): selfies, personal moments, everyday stock footage and b-roll.
    - **Social Media & Creator Content** (`social-media-and-creator-content`): talking heads, podcast clips, ASMR and satisfying videos, dance, vlogs, trending formats.
    - **Frontier** (`frontier`): "Capabilities at and beyond the current frontier".
  - Capabilities:
    - **Physics** (`physics`): mechanics, thermal effects, material interactions, fracture and deformation, optics, cause and effect, counterfactual physics.
    - **Complex Composition** (`complex-composition`): attribute binding, spatial relationships, multi-object interaction, counting, temporal ordering.
    - **Human Anatomy** (`human-anatomy`): gait and locomotion, fine motor movement, facial expression, acrobatic motion, object grasping, human interaction.
    - **Lighting & Materials** (`lighting-and-materials`): lighting, exposure, shadows, color temperature, texture, cloth, hair and fur.
    - **Multi-Scene & Narrative** (`multi-scene-and-narrative`): multi-event stories, shot transitions, montage, identity consistency across shots.
    - **Camera Control** (`camera-control`): shot types such as close-up, aerial, POV and low angle, and moves such as tracking, dolly, orbit, crane, crash zoom, whip pan and rack focus.
    - **Text Rendering** (`text-rendering`): short and long text, 2D layout, non-lexical strings, text on deforming surfaces.
    - **Spatio-Temporal Consistency** (`spatio-temporal-consistency`): spatial coherence, time lapses, occlusion and re-entry, single-shot stories.
    - **Audio Synchronization** (`audio-synchronization`): diegetic sound effects, background music and score, on- and off-screen sound.
    - **Dialogue & Lip Sync** (`dialogue-and-lip-sync`): single- and multi-speaker dialogue, voiceover vs on-screen speech.
- **Audio categories on silent boards.** On both silent boards the "Audio Synchronization" and "Dialogue & Lip Sync" buttons are disabled. — [AA T2V silent](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false); [AA I2V silent](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false)
- **Prompts.** Every prompt is tagged with one use case and one capability, plus one of eight visual styles: Photorealistic, 3D Render/CGI, Cartoon and Anime, Flat Design, Hand-drawn/Illustration, Stop-Motion/Claymation, Lo-Fi, Mixed Styles. "Styles are not sampled evenly, and most prompts are photorealistic." No style leaderboard is published in the selector.
  - Prompt set sizes: 1,000 for T2V and I2V with audio, 500 for each silent board.
  - Image-to-video uses the same taxonomy. For I2V-Silent, "each matchup draws a prompt at random from the full set", rather than sampling evenly across categories. — [AA methodology](https://artificialanalysis.ai/methodology/video)
- **Generation settings.** 1080p (or closest), 24 FPS, 10 seconds, "16:9 horizontal", seed 42. I2V starting images are 1920×1080 PNG. — [AA methodology](https://artificialanalysis.ai/methodology/video)
- **Votes and ratings.**
  - Ratings use a Bradley-Terry model on an Elo scale, anchored on "Kling 3.0 1080p (Pro) = 1000".
  - Votes come from "validated private evaluators", and public arena votes do not count.
  - Confidence intervals "treat each vote as independent, so they may be slightly narrow".
  - Category leaderboards are "the same calculation restricted to prompts tagged with a given use case or capability".
  - On category views, the Range column is "the range implied by each model's confidence interval". On the overall board it "comes from simulating the full leaderboard". — [AA methodology](https://artificialanalysis.ai/methodology/video)
- **Badges in the tables.**
  - A row with "–" in the rank and Range columns has a warning icon whose tooltip reads "Lower confidence ranking … This model has fewer than 500 appearances in the arena, so its ranking has lower confidence."
  - An amber badge reads "Provisional result: this model was added to the leaderboard recently. Score and rank may change as we collect and verify more votes."
  - The Range header tooltip reads "The range of plausible rankings based on this model's Elo confidence interval." — [AA T2V Physics](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=physics)
- **arena.ai (LMArena).** The text-to-video and image-to-video boards have only License Type, Score Range, Models and Labs filters, with no capability or use-case categories. Both were last updated "Sep 21, 2026":
  - T2V: 718,577 votes, 48 models.
  - I2V: 2,081,953 votes, 48 models. — [arena.ai T2V](https://arena.ai/leaderboard/video/text-to-video); [arena.ai I2V](https://arena.ai/leaderboard/video/image-to-video)
- **Design Arena.** Video boards are split by input type, not by category: Text to Video (`board=video`), Image to Video, Multi-Image to Video, Multimodal to Video, and Video Editing. The video tab has no category chips, although its code boards do. It was "Updated Nov 2, 2026, 12:07 AM PST". — [Design Arena video](https://www.designarena.ai/leaderboard?tab=video&section=video&board=video)

### Inferences
- **How to read the tables.**
  - "Pos" is the order the page lists rows in, which is descending Elo.
  - "AA rank (range)" is AA's own rank. On category views, only models with 500 or more appearances in that category get a rank.
  - On the silent use-case views, often only 1–2 models clear 500. So "rank 1" there means first among the few ranked models, not first overall.
  - Every interval I extracted equals Elo ± the shown value. My script checked this on every row and found no mismatch, so the tables give only the ± value.
- **Per-category samples are thin.** Typical category intervals are ±40–65 Elo. The four overall boards have ±14–19.

### Gaps
- AA publishes no per-category description in the leaderboard UI. The descriptions above are the methodology's example tasks.
- Style tags are not exposed as leaderboards, so there is no per-style ranking (anime, claymation and so on).
- I did not read AA's Video Editing board categories (out of scope), and did not test the "Hide derived models" filter. "Hide research previews" is on by default; on I2V, turning it off added no models.

## Which models lead each category, and how far ahead are they?

### Takeaway
No category has a leader whose 95% interval clears the second-placed model. Each category's top is a cluster of 4–8 models within roughly 30–60 Elo of each other.

- **Most often in that cluster:** Wan 3.0, Utopai X, MiniMax H3 (768p), MiniMax H3 Max, Dreamina Seedance 2.5 and 2.0, HeyGen Video 1, FLUX 3 and FLUX 3 Max, and on image-to-video, Hyperflow H3.
- **Clearest single-model leads by AA's Range column:**
  - Seedance 2.5 on I2V Dialogue & Lip Sync (1217 ±52, range 1-2) and I2V Human Anatomy (1125 ±55, range 1-2).
  - Utopai X on I2V-Silent Overall (1155 ±19, range 1).
  - MiniMax H3 (768p) on T2V-Silent Complex Composition (1151 ±46, range 1-2).
  - HeyGen Video 1 on T2V-Silent Camera Control (1086 ±41, range 1-2).
- **Category specialists that differ from Overall:**
  - Gemini Omni Flash 1.1 is #10 overall on T2V but #1 on T2V UIUX & Motion Design (1309) and Audio Synchronization (1189).
  - Seedance 2.5 leads Dialogue & Lip Sync and Human Anatomy on both T2V and I2V.
  - FLUX 3 (not Max) leads T2V Social Media (1191).
- **Gap to the mid-pack is large.** The gap between that top cluster and Kling 3.0 / Veo 3.1 is usually 100–250 Elo, well outside the intervals.

### Cited Findings

#### Leaders summary (top by Elo; "†" = fewer than 500 appearances, so AA gives no rank. The top AA-ranked model follows in brackets.)

| Category | T2V + audio | T2V silent | I2V + audio | I2V silent |
|---|---|---|---|---|
| Overall | Wan 3.0 1175 ±14 (1-3) | HeyGen Video 1 1143 ±16 (1-4) | Seedance 2.5 1153 ±17 (1-2) | Utopai X 1155 ±19 (1) |
| Marketing & Advertising | Utopai X 1175 ±43 (1-5) | Bach 1.0 Pro 1155 ±59 † [HeyGen Video 1 1150 ±48] | Seedance 2.5 1163 ±50 (1-7) | Utopai X 1186 ±64 † [none ranked] |
| Retail & Ecommerce | FLUX 3 Max 1161 ±56 † [Seedance 2.5 1160 ±43] | MiniMax H3 Max 1172 ±60 † [HeyGen 1108 ±48] | Seedance 2.5 1145 ±51 (1-8) | Utopai X 1159 ±65 † [none ranked] |
| Live-Action Film | MiniMax H3 (768p) 1121 ±42 (1-5) | MiniMax H3 Max 1148 ±69 † [none ranked] | Seedance 2.5 1152 ±50 (1-4) | Seedance 2.0 1100 ±63 † [HeyGen 1071 ±54] |
| Animation & Gaming | HeyGen Video 1 1225 ±46 (1-3) | HeyGen Video 1 1174 ±48 (1-2) | Seedance 2.5 1179 ±52 (1-3) | Seedance 2.5 1186 ±59 † [HeyGen 1097 ±52] |
| Architecture & Real Estate | Utopai X 1147 ±43 (1-4) | Utopai X 1125 ±58 † [HeyGen 1110 ±48] | P-Video-2-Pro 1138 ±59 † [MiniMax H3 (768p) 1137 ±49] | Utopai X 1169 ±61 † [HeyGen 1079 ±50] |
| Productivity & Knowledge Work | Utopai X 1163 ±42 (1-6) | MiniMax H3 Max 1187 ±62 † [HeyGen 1178 ±50] | Utopai X 1144 ±52 (1-6) | P-Video-2-Pro 1121 ±65 † [none ranked] |
| UIUX & Motion Design | Gemini Omni Flash 1.1 1309 ±45 (1-3) | Wan 3.0 1240 ±50 † [HeyGen 1239 ±48] | Utopai X 1267 ±53 (1-4) | Utopai X 1176 ±60 † [HeyGen 1115 ±50] |
| Consumer | MiniMax H3 Max 1212 ±55 † [Wan 3.0 1184 ±43] | Utopai X 1064 ±64 † [HeyGen 1044 ±51] | Seedance 2.5 1128 ±52 (1-7) | Seedance 2.5 1210 ±62 † [HeyGen 1158 ±55] |
| Social Media & Creator Content | FLUX 3 1191 ±44 (1-6) | Wan 3.0 1181 ±53 † [only MAGI-2 Preview ranked] | Seedance 2.5 1202 ±54 (1-5) | Utopai X 1223 ±64 † [none ranked] |
| Frontier | Wan 3.0 1191 ±44 (1-5) | FLUX 3 Max 1216 ±60 † [HeyGen 1176 ±47] | Utopai X 1147 ±51 (1-5) | Utopai X 1153 ±63 † [HeyGen 1114 ±54] |
| Physics | MiniMax H3 Max 1154 ±53 † [HeyGen 1133 ±45] | MiniMax H3 Max 1160 ±55 † [HeyGen 1105 ±44] | Utopai X 1153 ±50 (1-4) | Utopai X 1160 ±58 † [HeyGen 1106 ±51] |
| Complex Composition | Wan 3.0 1180 ±42 (1-5) | MiniMax H3 (768p) 1151 ±46 (1-2) | Seedance 2.0 1159 ±51 (1-7) | Utopai X 1124 ±53 † [HeyGen 1106 ±45] |
| Human Anatomy | Seedance 2.5 1188 ±44 (1-6) | MiniMax H3 Max 1096 ±61 † [Wan 3.0 1079 ±49] | Seedance 2.5 1125 ±55 (1-2) | Seedance 2.5 1091 ±63 † [HeyGen 990 ±55] |
| Lighting & Materials | HeyGen Video 1 1189 ±45 (1-6) | Wan 3.0 1163 ±44 (1-3) | Seedance 2.0 1163 ±50 (1-6) | Utopai X 1145 ±53 † [MiniMax H3 (768p) 1104 ±49] |
| Multi-Scene & Narrative | Wan 3.0 1186 ±43 (1-4) | Wan 3.0 1179 ±47 (1-4) | Utopai X 1207 ±52 (1-5) | Utopai X 1147 ±54 † [HeyGen 1062 ±46] |
| Camera Control | Wan 3.0 1153 ±42 (1-3) | HeyGen Video 1 1086 ±41 (1-2) | Seedance 2.5 1184 ±51 (1-6) | Seedance 2.5 1126 ±50 (1-2) |
| Text Rendering | P-Video-2-Pro 1363 ±66 † [Utopai X 1359 ±49] | FLUX 3 Max 1383 ±67 † [HeyGen 1358 ±53] | MiniMax H3 (768p) 1213 ±55 (1-8) | Utopai X 1376 ±62 † [HeyGen 1281 ±54] |
| Spatio-Temporal Consistency | Utopai X 1145 ±43 (1-6) | HeyGen Video 1 1153 ±43 (1-3) | MiniMax H3 Max 1194 ±52 (1-6) | Utopai X 1166 ±55 † [Seedance 2.5 1143 ±51] |
| Audio Synchronization | Gemini Omni Flash 1.1 1189 ±42 (1-3) | (disabled) | Seedance 2.0 1143 ±50 (1-7) | (disabled) |
| Dialogue & Lip Sync | Seedance 2.5 1196 ±43 (1-5) | (disabled) | Seedance 2.5 1217 ±52 (1-2) | (disabled) |

Sources: the per-category tables below, each linked in its heading.

#### How to read the full tables
- **Columns:** Pos = order on page (descending Elo); ± = the 95% interval half-width shown (the interval is Elo − ± to Elo + ±); n = samples; AA rank (range) as shown, "–" = fewer than 500 appearances.
- **[P]** = "Provisional result" badge.
- **"Further down"** gives Kling, Veo and any cheap models listed in the brief that fall outside the top 10, as position / rank / Elo ±.
- **Prices** are AA's "cost to generate 1 minute of video on the model creator's API at the settings we benchmark (1080p where offered)".
  - T2V with audio: Wan 3.0 $12.00, Utopai X "No API available", MiniMax H3 (768p) $4.80, Seedance 2.5 $34.12, FLUX 3 Max $4.35, HeyGen Video 1 $2.40, MiniMax H3 Max $9.60, FLUX 3 $17.40, Seedance 2.0 $22.45, Gemini Omni Flash 1.1 $9.12, P-Video-2-Pro $5.70, Agnes-Video-2.5 $2.40, Kling 3.0 1080p (Pro) $10.08, Kling 3.0 Omni $8.40, Veo 3.1 $24.00, Veo 3.1 Fast $7.20, Veo 3.1 Lite $4.80.
  - Silent boards: Kling 3.0 (both) $6.72, Veo 3.1 $12.00, Veo 3.1 Fast $6.00, Veo 3.1 Lite $3.00, Bach 1.0 Pro $7.20.
  - I2V: Hyperflow H3 $9.00; the other models cost the same as on T2V. — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video)

---

### A. AA-Video-T2V v2.1 (text to video, with audio), 31 models

#### Overall — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1175 | ±14 | 6,860 | 1 (1-3) |
| 2 | Utopai X | 1166 | ±15 | 6,316 | 2 (1-5) |
| 3 | MiniMax H3 (768p) | 1161 | ±14 | 7,005 | 3 (2-6) |
| 4 | Dreamina Seedance 2.5 | 1157 | ±14 | 6,987 | 4 (2-7) |
| 5 | FLUX 3 Max [P] | 1157 | ±17 | 3,290 | 5 (2-8) |
| 6 | HeyGen Video 1 [P] | 1156 | ±14 | 6,043 | 6 (2-8) |
| 7 | MiniMax H3 Max [P] | 1149 | ±17 | 3,333 | 7 (3-9) |
| 8 | FLUX 3 | 1144 | ±14 | 6,021 | 8 (6-9) |
| 9 | Dreamina Seedance 2.0 | 1136 | ±14 | 6,006 | 9 (7-11) |
| 10 | Gemini Omni Flash 1.1 | 1128 | ±14 | 7,337 | 10 (9-11) |

Further down: P-Video-2-Pro 11 (9-11) 1125 ±17; Agnes-Video-2.5 12 (12-13) 1068 ±15; Kling 3.0 Omni 1080p (Pro) 18 (17-18) 1023 ±15; Kling 3.0 1080p (Pro) 19 (19-20) 1000 (anchor); Veo 3.1 22 (22-25) 962 ±16; Veo 3.1 Fast 23 (22-25) 958 ±15; Veo 3.1 Lite 24 (22-26) 953 ±16.

#### Marketing & Advertising — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=marketing-and-advertising)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1175 | ±43 | 639 | 1 (1-5) |
| 2 | Dreamina Seedance 2.5 | 1171 | ±42 | 733 | 2 (1-5) |
| 3 | MiniMax H3 (768p) | 1164 | ±41 | 754 | 3 (1-5) |
| 4 | Wan 3.0 | 1158 | ±42 | 671 | 4 (1-6) |
| 5 | FLUX 3 Max [P] | 1145 | ±53 | 326 | – |
| 6 | HeyGen Video 1 [P] | 1145 | ±43 | 626 | 5 (1-8) |
| 7 | MiniMax H3 Max [P] | 1129 | ±53 | 326 | – |
| 8 | P-Video-2-Pro [P] | 1123 | ±55 | 290 | – |
| 9 | Dreamina Seedance 2.0 | 1116 | ±43 | 629 | 6 (4-10) |
| 10 | Gemini Omni Flash 1.1 | 1116 | ±40 | 757 | 7 (5-9) |

Further down: Kling 3.0 Omni pos 17, –, 1005 ±46; Kling 3.0 (Pro) pos 19, rank 13, 1000; Veo 3.1 pos 20, –, 992 ±49; Veo 3.1 Fast pos 23, rank 15 (12-15), 969 ±45; Veo 3.1 Lite pos 27, –, 938 ±50.

#### Retail & Ecommerce — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=retail-and-ecommerce)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | FLUX 3 Max [P] | 1161 | ±56 | 314 | – |
| 2 | Dreamina Seedance 2.5 | 1160 | ±43 | 651 | 1 (1-7) |
| 3 | Utopai X | 1137 | ±43 | 630 | 2 (1-7) |
| 4 | Wan 3.0 | 1134 | ±42 | 677 | 3 (1-7) |
| 5 | HeyGen Video 1 [P] | 1127 | ±45 | 554 | 4 (1-8) |
| 6 | FLUX 3 | 1125 | ±43 | 590 | 5 (1-8) |
| 7 | Dreamina Seedance 2.0 | 1121 | ±44 | 565 | 6 (1-8) |
| 8 | MiniMax H3 (768p) | 1120 | ±43 | 639 | 7 (1-8) |
| 9 | Gemini Omni Flash 1.1 | 1089 | ±40 | 764 | 8 (4-8) |
| 10 | P-Video-2-Pro [P] | 1085 | ±53 | 315 | – |

Further down: MiniMax H3 Max pos 11, –, 1059 ±51; Kling 3.0 Omni pos 12, –, 1051 ±47; Kling 3.0 (Pro) pos 15, rank 10, 1000; Veo 3.1 Lite pos 19, –, 974 ±49; Veo 3.1 pos 22, –, 956 ±48; Veo 3.1 Fast pos 25, rank 14 (13-14), 910 ±46.

#### Live-Action Film — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=live-action-film)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 (768p) | 1121 | ±42 | 728 | 1 (1-5) |
| 2 | Wan 3.0 | 1115 | ±42 | 701 | 2 (1-6) |
| 3 | Dreamina Seedance 2.5 | 1115 | ±43 | 672 | 3 (1-6) |
| 4 | Utopai X | 1108 | ±42 | 635 | 4 (1-6) |
| 5 | FLUX 3 Max [P] | 1104 | ±53 | 330 | – |
| 6 | FLUX 3 | 1100 | ±43 | 613 | 5 (1-6) |
| 7 | MiniMax H3 Max [P] | 1077 | ±53 | 325 | – |
| 8 | Dreamina Seedance 2.0 | 1074 | ±43 | 605 | 6 (2-8) |
| 9 | Gemini Omni Flash 1.1 | 1055 | ±41 | 697 | 7 (6-8) |
| 10 | HeyGen Video 1 [P] | 1053 | ±42 | 631 | 8 (6-8) |

Further down: Kling 3.0 (Pro) pos 13, rank 9, 1000; Kling 3.0 Omni pos 17, –, 973 ±47; Veo 3.1 Lite pos 24, –, 858 ±50; Veo 3.1 Fast pos 26, –, 843 ±47; Veo 3.1 pos 28, –, 835 ±51.

#### Animation & Gaming — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=animation-and-gaming)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | HeyGen Video 1 [P] | 1225 | ±46 | 604 | 1 (1-3) |
| 2 | Wan 3.0 | 1220 | ±43 | 684 | 2 (1-3) |
| 3 | Utopai X | 1195 | ±44 | 602 | 3 (1-6) |
| 4 | MiniMax H3 Max [P] | 1188 | ±55 | 327 | – |
| 5 | Dreamina Seedance 2.5 | 1165 | ±42 | 707 | 4 (3-8) |
| 6 | Dreamina Seedance 2.0 | 1164 | ±44 | 573 | 5 (3-8) |
| 7 | P-Video-2-Pro [P] | 1162 | ±54 | 325 | – |
| 8 | FLUX 3 Max [P] | 1159 | ±53 | 329 | – |
| 9 | Gemini Omni Flash 1.1 | 1153 | ±42 | 759 | 6 (4-8) |
| 10 | MiniMax H3 (768p) | 1149 | ±42 | 679 | 7 (4-8) |

Further down: Kling 3.0 Omni pos 19, –, 1021 ±48; Kling 3.0 (Pro) pos 21, rank 14, 1000; Veo 3.1 pos 22, –, 983 ±51; Veo 3.1 Fast pos 26, –, 961 ±48; Veo 3.1 Lite pos 27, –, 959 ±50.

#### Architecture & Real Estate — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=architecture-and-real-estate)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1147 | ±43 | 647 | 1 (1-4) |
| 2 | MiniMax H3 (768p) | 1134 | ±42 | 686 | 2 (1-4) |
| 3 | Wan 3.0 | 1122 | ±42 | 692 | 3 (1-6) |
| 4 | Dreamina Seedance 2.5 | 1121 | ±42 | 669 | 4 (1-6) |
| 5 | P-Video-2-Pro [P] | 1113 | ±57 | 255 | – |
| 6 | MiniMax H3 Max [P] | 1109 | ±53 | 331 | – |
| 7 | FLUX 3 Max [P] | 1106 | ±51 | 330 | – |
| 8 | FLUX 3 | 1090 | ±44 | 558 | 5 (3-8) |
| 9 | Dreamina Seedance 2.0 | 1088 | ±44 | 587 | 6 (3-8) |
| 10 | Gemini Omni Flash 1.1 | 1074 | ±41 | 700 | 7 (5-10) |

Further down: HeyGen Video 1 pos 11, rank 8 (5-11), 1070 ±44; Kling 3.0 Omni pos 16, –, 1024 ±47; Kling 3.0 (Pro) pos 19, rank 12, 1000; Veo 3.1 Fast pos 20, –, 977 ±46; Veo 3.1 pos 23, –, 959 ±48; Veo 3.1 Lite pos 27, –, 917 ±50.

#### Productivity & Knowledge Work — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=productivity-and-knowledge-work)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1163 | ±42 | 656 | 1 (1-6) |
| 2 | Dreamina Seedance 2.5 | 1153 | ±42 | 739 | 2 (1-7) |
| 3 | FLUX 3 Max [P] | 1150 | ±52 | 336 | – |
| 4 | MiniMax H3 (768p) | 1148 | ±42 | 724 | 3 (1-7) |
| 5 | FLUX 3 | 1146 | ±43 | 598 | 4 (1-7) |
| 6 | Wan 3.0 | 1142 | ±42 | 709 | 5 (1-7) |
| 7 | HeyGen Video 1 [P] | 1134 | ±43 | 618 | 6 (1-8) |
| 8 | MiniMax H3 Max [P] | 1121 | ±52 | 334 | – |
| 9 | Gemini Omni Flash 1.1 | 1120 | ±41 | 746 | 7 (2-8) |
| 10 | P-Video-2-Pro [P] | 1105 | ±53 | 302 | – |

Further down: Kling 3.0 (Pro) pos 17, rank 14, 1000; Kling 3.0 Omni pos 18, –, 999 ±47; Veo 3.1 Lite pos 22, –, 947 ±50; Veo 3.1 Fast pos 24, rank 16 (15-17), 938 ±46; Veo 3.1 pos 26, –, 926 ±47.

#### UIUX & Motion Design — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=uiux-design)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Gemini Omni Flash 1.1 | 1309 | ±45 | 783 | 1 (1-3) |
| 2 | HeyGen Video 1 [P] | 1301 | ±48 | 636 | 2 (1-3) |
| 3 | FLUX 3 Max [P] | 1296 | ±56 | 354 | – |
| 4 | Wan 3.0 | 1282 | ±45 | 706 | 3 (1-7) |
| 5 | P-Video-2-Pro [P] | 1273 | ±59 | 273 | – |
| 6 | MiniMax H3 Max [P] | 1267 | ±56 | 339 | – |
| 7 | Dreamina Seedance 2.5 | 1253 | ±45 | 688 | 4 (3-8) |
| 8 | FLUX 3 | 1249 | ±46 | 630 | 5 (3-8) |
| 9 | Utopai X | 1249 | ±46 | 645 | 6 (3-8) |
| 10 | MiniMax H3 (768p) | 1240 | ±45 | 722 | 7 (3-8) |

Further down: Veo 3.1 pos 19, –, 1106 ±52; Veo 3.1 Lite pos 20, –, 1104 ±51; Veo 3.1 Fast pos 21, –, 1099 ±50; Kling 3.0 Omni pos 24, –, 1056 ±52; Kling 3.0 (Pro) pos 26, rank 13, 1000.

#### Consumer — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=consumer)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1212 | ±55 | 331 | – |
| 2 | Wan 3.0 | 1184 | ±43 | 668 | 1 (1-6) |
| 3 | MiniMax H3 (768p) | 1177 | ±44 | 684 | 2 (1-7) |
| 4 | Dreamina Seedance 2.0 | 1169 | ±45 | 569 | 3 (1-8) |
| 5 | FLUX 3 Max [P] | 1168 | ±55 | 314 | – |
| 6 | FLUX 3 | 1156 | ±45 | 581 | 4 (1-8) |
| 7 | Utopai X | 1155 | ±44 | 616 | 5 (1-8) |
| 8 | HeyGen Video 1 [P] | 1154 | ±45 | 592 | 6 (1-8) |
| 9 | Gemini Omni Flash 1.1 | 1137 | ±43 | 706 | 7 (2-8) |
| 10 | Dreamina Seedance 2.5 | 1132 | ±42 | 716 | 8 (3-8) |

Further down: Kling 3.0 Omni pos 18, –, 1031 ±49; Kling 3.0 (Pro) pos 19, rank 13, 1000; Veo 3.1 pos 24, –, 962 ±49; Veo 3.1 Lite pos 25, –, 950 ±51; Veo 3.1 Fast pos 27, rank 15, 931 ±48.

#### Social Media & Creator Content — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=social-media-and-creator-content)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | FLUX 3 | 1191 | ±44 | 624 | 1 (1-6) |
| 2 | Utopai X | 1186 | ±43 | 615 | 2 (1-7) |
| 3 | Dreamina Seedance 2.5 | 1186 | ±43 | 684 | 3 (1-7) |
| 4 | HeyGen Video 1 [P] | 1184 | ±44 | 601 | 4 (1-7) |
| 5 | Wan 3.0 | 1178 | ±42 | 699 | 5 (1-7) |
| 6 | P-Video-2-Pro [P] | 1173 | ±59 | 264 | – |
| 7 | MiniMax H3 (768p) | 1167 | ±43 | 680 | 6 (1-7) |
| 8 | MiniMax H3 Max [P] | 1167 | ±53 | 337 | – |
| 9 | Dreamina Seedance 2.0 | 1145 | ±43 | 624 | 7 (2-7) |
| 10 | FLUX 3 Max [P] | 1140 | ±52 | 354 | – |

Further down: Kling 3.0 Omni pos 15, –, 1037 ±47; Kling 3.0 (Pro) pos 20, rank 14, 1000; Veo 3.1 Fast pos 21, rank 15 (12-16), 977 ±45; Veo 3.1 pos 25, –, 940 ±48; Veo 3.1 Lite pos 27, –, 910 ±50.

#### Frontier — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=frontier)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1191 | ±44 | 653 | 1 (1-5) |
| 2 | MiniMax H3 (768p) | 1187 | ±42 | 709 | 2 (1-5) |
| 3 | Utopai X | 1178 | ±43 | 631 | 3 (1-6) |
| 4 | HeyGen Video 1 [P] | 1169 | ±45 | 602 | 4 (1-7) |
| 5 | Dreamina Seedance 2.0 | 1159 | ±44 | 628 | 5 (1-7) |
| 6 | MiniMax H3 Max [P] | 1151 | ±51 | 359 | – |
| 7 | Dreamina Seedance 2.5 | 1143 | ±42 | 728 | 6 (3-7) |
| 8 | FLUX 3 Max [P] | 1133 | ±55 | 303 | – |
| 9 | FLUX 3 | 1125 | ±43 | 598 | 7 (5-10) |
| 10 | P-Video-2-Pro [P] | 1099 | ±52 | 319 | – |

Further down: Kling 3.0 Omni pos 18, –, 1018 ±46; Kling 3.0 (Pro) pos 19, rank 13, 1000; Veo 3.1 Lite pos 23, –, 942 ±49; Veo 3.1 Fast pos 25, rank 15 (14-15), 941 ±46; Veo 3.1 pos 26, –, 938 ±51.

#### Physics — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=physics)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1154 | ±53 | 353 | – |
| 2 | FLUX 3 Max [P] | 1140 | ±54 | 328 | – |
| 3 | HeyGen Video 1 [P] | 1133 | ±45 | 574 | 1 (1-7) |
| 4 | Dreamina Seedance 2.5 | 1127 | ±41 | 718 | 2 (1-7) |
| 5 | MiniMax H3 (768p) | 1125 | ±42 | 712 | 3 (1-7) |
| 6 | Utopai X | 1122 | ±42 | 666 | 4 (1-7) |
| 7 | FLUX 3 | 1114 | ±43 | 595 | 5 (1-7) |
| 8 | Wan 3.0 | 1103 | ±41 | 713 | 6 (1-8) |
| 9 | Dreamina Seedance 2.0 | 1096 | ±43 | 600 | 7 (1-8) |
| 10 | P-Video-2-Pro [P] | 1073 | ±53 | 306 | – |

Further down: Kling 3.0 Omni pos 12, –, 1037 ±46; Kling 3.0 (Pro) pos 15, rank 10, 1000; Veo 3.1 Fast pos 22, rank 15 (12-15), 951 ±45; Veo 3.1 pos 24, –, 927 ±49; Veo 3.1 Lite pos 28, –, 897 ±49.

#### Complex Composition — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=complex-composition)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1180 | ±42 | 675 | 1 (1-5) |
| 2 | Dreamina Seedance 2.5 | 1167 | ±42 | 679 | 2 (1-6) |
| 3 | Utopai X | 1155 | ±42 | 614 | 3 (1-6) |
| 4 | Dreamina Seedance 2.0 | 1147 | ±43 | 609 | 4 (1-8) |
| 5 | HeyGen Video 1 [P] | 1142 | ±43 | 620 | 5 (1-8) |
| 6 | MiniMax H3 (768p) | 1130 | ±41 | 723 | 6 (2-8) |
| 7 | MiniMax H3 Max [P] | 1129 | ±52 | 315 | – |
| 8 | P-Video-2-Pro [P] | 1126 | ±53 | 303 | – |
| 9 | FLUX 3 Max [P] | 1124 | ±52 | 337 | – |
| 10 | FLUX 3 | 1111 | ±43 | 610 | 7 (4-9) |

Further down: Kling 3.0 Omni pos 16, –, 1017 ±47; Kling 3.0 (Pro) pos 20, rank 12, 1000; Veo 3.1 pos 21, –, 986 ±49; Veo 3.1 Lite pos 27, –, 918 ±51; Veo 3.1 Fast pos 28, rank 14, 906 ±47.

#### Human Anatomy — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=human-anatomy)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 | 1188 | ±44 | 680 | 1 (1-6) |
| 2 | Wan 3.0 | 1173 | ±44 | 667 | 2 (1-7) |
| 3 | MiniMax H3 (768p) | 1164 | ±43 | 732 | 3 (1-7) |
| 4 | HeyGen Video 1 [P] | 1158 | ±46 | 581 | 4 (1-7) |
| 5 | Utopai X | 1152 | ±43 | 624 | 5 (1-7) |
| 6 | FLUX 3 Max [P] | 1151 | ±54 | 355 | – |
| 7 | Dreamina Seedance 2.0 | 1148 | ±44 | 608 | 6 (1-7) |
| 8 | FLUX 3 | 1132 | ±44 | 616 | 7 (2-8) |
| 9 | MiniMax H3 Max [P] | 1127 | ±54 | 307 | – |
| 10 | Gemini Omni Flash 1.1 | 1097 | ±41 | 747 | 8 (7-8) |

Further down: Kling 3.0 Omni pos 14, –, 1035 ±47; Kling 3.0 (Pro) pos 18, rank 12, 1000; Veo 3.1 Lite pos 23, –, 909 ±52; Veo 3.1 pos 25, –, 888 ±51; Veo 3.1 Fast pos 27, –, 865 ±49.

#### Lighting & Materials — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=lighting-and-materials)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | HeyGen Video 1 [P] | 1189 | ±45 | 603 | 1 (1-6) |
| 2 | Wan 3.0 | 1188 | ±42 | 707 | 2 (1-5) |
| 3 | Utopai X | 1181 | ±43 | 646 | 3 (1-6) |
| 4 | MiniMax H3 (768p) | 1162 | ±42 | 710 | 4 (1-7) |
| 5 | FLUX 3 Max [P] | 1158 | ±53 | 331 | – |
| 6 | Dreamina Seedance 2.5 | 1147 | ±42 | 714 | 5 (1-9) |
| 7 | Dreamina Seedance 2.0 | 1144 | ±44 | 592 | 6 (3-10) |
| 8 | MiniMax H3 Max [P] | 1139 | ±51 | 361 | – |
| 9 | Wan2.7-260612 | 1123 | ±45 | 555 | 7 (4-10) |
| 10 | P-Video-2-Pro [P] | 1122 | ±54 | 284 | – |

Further down: Kling 3.0 Omni pos 15, –, 1059 ±47; Veo 3.1 Fast pos 21, rank 14 (13-15), 1008 ±46; Kling 3.0 (Pro) pos 22, rank 15, 1000; Veo 3.1 pos 23, –, 994 ±48; Veo 3.1 Lite pos 25, –, 975 ±49.

#### Multi-Scene & Narrative — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=multi-scene-and-narrative)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1186 | ±43 | 689 | 1 (1-4) |
| 2 | MiniMax H3 (768p) | 1168 | ±42 | 704 | 2 (1-6) |
| 3 | HeyGen Video 1 [P] | 1162 | ±44 | 600 | 3 (1-8) |
| 4 | FLUX 3 Max [P] | 1159 | ±55 | 322 | – |
| 5 | FLUX 3 | 1159 | ±43 | 614 | 4 (1-8) |
| 6 | MiniMax H3 Max [P] | 1142 | ±51 | 377 | – |
| 7 | Dreamina Seedance 2.5 | 1137 | ±42 | 675 | 5 (2-8) |
| 8 | Utopai X | 1133 | ±42 | 638 | 6 (2-8) |
| 9 | Gemini Omni Flash 1.1 | 1124 | ±42 | 654 | 7 (3-8) |
| 10 | Dreamina Seedance 2.0 | 1120 | ±44 | 593 | 8 (3-8) |

Further down: Kling 3.0 (Pro) pos 18, rank 13, 1000; Kling 3.0 Omni pos 19, –, 993 ±46; Veo 3.1 Fast pos 22, rank 15 (13-15), 955 ±46; Veo 3.1 pos 23, –, 933 ±49; Veo 3.1 Lite pos 24, –, 915 ±49.

#### Camera Control — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=camera-control)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1153 | ±42 | 643 | 1 (1-3) |
| 2 | Utopai X | 1151 | ±43 | 607 | 2 (1-4) |
| 3 | Dreamina Seedance 2.5 | 1115 | ±41 | 727 | 3 (1-7) |
| 4 | HeyGen Video 1 [P] | 1111 | ±43 | 601 | 4 (1-7) |
| 5 | FLUX 3 Max [P] | 1105 | ±52 | 321 | – |
| 6 | FLUX 3 | 1095 | ±42 | 602 | 5 (3-8) |
| 7 | Dreamina Seedance 2.0 | 1094 | ±42 | 595 | 6 (3-8) |
| 8 | MiniMax H3 (768p) | 1094 | ±40 | 710 | 7 (3-8) |
| 9 | P-Video-2-Pro [P] | 1086 | ±53 | 274 | – |
| 10 | MiniMax H3 Max [P] | 1073 | ±52 | 310 | – |

Further down: Kling 3.0 Omni pos 18, –, 1000 ±46; Kling 3.0 (Pro) pos 19, rank 11, 1000; Veo 3.1 Fast pos 22, rank 14 (11-14), 957 ±45; Veo 3.1 Lite pos 24, –, 950 ±47; Veo 3.1 pos 27, –, 923 ±49.

#### Text Rendering — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=text-rendering)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | P-Video-2-Pro [P] | 1363 | ±66 | 280 | – |
| 2 | Utopai X | 1359 | ±49 | 672 | 1 (1-4) |
| 3 | MiniMax H3 (768p) | 1336 | ±49 | 689 | 2 (1-7) |
| 4 | Wan 3.0 | 1334 | ±48 | 712 | 3 (1-7) |
| 5 | MiniMax H3 Max [P] | 1319 | ±59 | 342 | – |
| 6 | HeyGen Video 1 [P] | 1315 | ±50 | 631 | 4 (1-7) |
| 7 | FLUX 3 | 1307 | ±50 | 567 | 5 (2-7) |
| 8 | Gemini Omni Flash 1.1 | 1297 | ±47 | 781 | 6 (2-8) |
| 9 | Dreamina Seedance 2.5 | 1288 | ±48 | 674 | 7 (2-8) |
| 10 | FLUX 3 Max [P] | 1281 | ±59 | 325 | – |

Further down: Veo 3.1 Lite pos 19, –, 1117 ±55; Veo 3.1 pos 20, –, 1069 ±53; Veo 3.1 Fast pos 21, –, 1066 ±53; Kling 3.0 Omni pos 23, –, 1020 ±56; Kling 3.0 (Pro) pos 24, rank 13, 1000.

#### Spatio-Temporal Consistency — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=spatio-temporal-consistency)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1145 | ±43 | 626 | 1 (1-6) |
| 2 | MiniMax H3 (768p) | 1144 | ±42 | 680 | 2 (1-6) |
| 3 | HeyGen Video 1 [P] | 1131 | ±44 | 601 | 3 (1-7) |
| 4 | Wan 3.0 | 1129 | ±43 | 667 | 4 (1-7) |
| 5 | Dreamina Seedance 2.5 | 1126 | ±42 | 709 | 5 (1-7) |
| 6 | FLUX 3 Max [P] | 1126 | ±53 | 307 | – |
| 7 | FLUX 3 | 1113 | ±43 | 638 | 6 (1-8) |
| 8 | P-Video-2-Pro [P] | 1101 | ±54 | 308 | – |
| 9 | MiniMax H3 Max [P] | 1095 | ±54 | 310 | – |
| 10 | Dreamina Seedance 2.0 | 1092 | ±43 | 649 | 7 (3-8) |

Further down: Kling 3.0 Omni pos 17, –, 1010 ±47; Kling 3.0 (Pro) pos 20, rank 12, 1000; Veo 3.1 pos 21, –, 968 ±49; Veo 3.1 Lite pos 24, –, 947 ±50; Veo 3.1 Fast pos 25, rank 14 (13-14), 946 ±46.

#### Audio Synchronization — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=audio-synchronization)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Gemini Omni Flash 1.1 | 1189 | ±42 | 710 | 1 (1-3) |
| 2 | FLUX 3 Max [P] | 1168 | ±54 | 308 | – |
| 3 | Utopai X | 1157 | ±43 | 596 | 2 (1-8) |
| 4 | MiniMax H3 Max [P] | 1155 | ±52 | 336 | – |
| 5 | Dreamina Seedance 2.0 | 1153 | ±43 | 592 | 3 (1-8) |
| 6 | Wan 3.0 | 1142 | ±42 | 695 | 4 (2-8) |
| 7 | MiniMax H3 (768p) | 1140 | ±42 | 682 | 5 (2-8) |
| 8 | FLUX 3 | 1128 | ±43 | 606 | 6 (2-8) |
| 9 | Dreamina Seedance 2.5 | 1123 | ±41 | 699 | 7 (2-8) |
| 10 | HeyGen Video 1 [P] | 1122 | ±42 | 642 | 8 (2-8) |

Further down: Kling 3.0 Omni pos 13, –, 1040 ±48; Veo 3.1 pos 18, –, 1021 ±48; Kling 3.0 (Pro) pos 20, rank 14, 1000; Veo 3.1 Lite pos 22, –, 988 ±49; Veo 3.1 Fast pos 24, –, 979 ±47.

#### Dialogue & Lip Sync — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=dialogue-and-lip-sync)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 | 1196 | ±43 | 712 | 1 (1-5) |
| 2 | FLUX 3 | 1176 | ±44 | 613 | 2 (1-6) |
| 3 | FLUX 3 Max [P] | 1163 | ±53 | 356 | – |
| 4 | MiniMax H3 (768p) | 1162 | ±43 | 663 | 3 (1-7) |
| 5 | MiniMax H3 Max [P] | 1159 | ±53 | 322 | – |
| 6 | Wan 3.0 | 1159 | ±42 | 692 | 4 (1-8) |
| 7 | Utopai X | 1154 | ±44 | 627 | 5 (1-8) |
| 8 | Dreamina Seedance 2.0 | 1133 | ±44 | 596 | 6 (2-8) |
| 9 | Gemini Omni Flash 1.1 | 1127 | ±41 | 734 | 7 (3-8) |
| 10 | HeyGen Video 1 [P] | 1118 | ±44 | 590 | 8 (4-9) |

Further down: Kling 3.0 (Pro) pos 17, rank 11, 1000; Kling 3.0 Omni pos 18, –, 994 ±48; Veo 3.1 Fast pos 27, –, 912 ±47; Veo 3.1 Lite pos 28, –, 907 ±50; Veo 3.1 pos 29, –, 889 ±51.

---

### B. AA-Video-T2V-Silent v2.1 (text to video, no audio), 36 models

This board also lists Bach 1.0 Pro, Runway Gen-4.5 (720p), Pika 2.5, P-Video and Kling O1 Pro (January), which are not on the audio board. Audio Synchronization and Dialogue & Lip Sync are disabled here.

#### Overall — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | HeyGen Video 1 [P] | 1143 | ±16 | 5,570 | 1 (1-4) |
| 2 | MiniMax H3 Max [P] | 1140 | ±19 | 2,934 | 2 (1-5) |
| 3 | FLUX 3 Max [P] | 1135 | ±19 | 2,998 | 3 (1-6) |
| 4 | Wan 3.0 | 1133 | ±17 | 4,515 | 4 (1-6) |
| 5 | Utopai X [P] | 1130 | ±18 | 2,967 | 5 (1-6) |
| 6 | MiniMax H3 (768p) | 1120 | ±17 | 4,411 | 6 (4-7) |
| 7 | Bach 1.0 Pro [P] | 1109 | ±18 | 2,993 | 7 (6-9) |
| 8 | P-Video-2-Pro [P] | 1103 | ±18 | 2,977 | 8 (6-10) |
| 9 | Dreamina Seedance 2.5 | 1101 | ±17 | 4,602 | 9 (7-10) |
| 10 | FLUX 3 | 1092 | ±17 | 3,737 | 10 (8-11) |

Further down: Kling 3.0 (Pro) 19 (18-20) 1000; Kling 3.0 Omni 21 (19-22) 984 ±17; Veo 3.1 23 (22-24) 960 ±17; Veo 3.1 Fast 24 (23-25) 959 ±17; Veo 3.1 Lite 25 (24-26) 943 ±17; Kling O1 Pro (January) 31 (29-31) 890 ±18.

#### Marketing & Advertising — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=marketing-and-advertising)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Bach 1.0 Pro [P] | 1155 | ±59 | 294 | – |
| 2 | Wan 3.0 | 1150 | ±51 | 455 | – |
| 3 | HeyGen Video 1 [P] | 1150 | ±48 | 585 | 1 (1) |
| 4 | Utopai X [P] | 1148 | ±57 | 310 | – |
| 5 | MiniMax H3 Max [P] | 1145 | ±57 | 309 | – |
| 6 | Dreamina Seedance 2.5 | 1131 | ±49 | 499 | – |
| 7 | FLUX 3 Max [P] | 1126 | ±57 | 317 | – |
| 8 | P-Video-2-Pro [P] | 1118 | ±56 | 319 | – |
| 9 | Dreamina Seedance 2.0 | 1096 | ±53 | 376 | – |
| 10 | Gemini Omni Flash 1.1 | 1093 | ±50 | 462 | – |

Further down: MiniMax H3 (768p) pos 12, 1091 ±49; Kling 3.0 (Pro) pos 18, 1000; Veo 3.1 pos 19, 989 ±54; Kling 3.0 Omni pos 21, 971 ±52; Veo 3.1 Lite pos 24, 957 ±52; Veo 3.1 Fast pos 26, 944 ±49; Kling O1 Pro pos 32, 869 ±56 (all unranked).

#### Retail & Ecommerce — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=retail-and-ecommerce)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1172 | ±60 | 312 | – |
| 2 | Bach 1.0 Pro [P] | 1147 | ±58 | 316 | – |
| 3 | Utopai X [P] | 1130 | ±56 | 328 | – |
| 4 | Wan 3.0 | 1126 | ±51 | 471 | – |
| 5 | FLUX 3 Max [P] | 1122 | ±57 | 304 | – |
| 6 | HeyGen Video 1 [P] | 1108 | ±48 | 593 | 1 (1) |
| 7 | MiniMax H3 (768p) | 1097 | ±52 | 413 | – |
| 8 | Dreamina Seedance 2.5 | 1086 | ±51 | 424 | – |
| 9 | FLUX 3 | 1081 | ±52 | 384 | – |
| 10 | Dreamina Seedance 2.0 | 1071 | ±52 | 393 | – |

Further down: Kling 3.0 Omni pos 12, 1043 ±52; Kling 3.0 (Pro) pos 20, 1000; Veo 3.1 Lite pos 22, 957 ±53; Veo 3.1 Fast pos 23, 954 ±51; Veo 3.1 pos 25, 927 ±52; Kling O1 Pro pos 27, 923 ±56 (all unranked).

#### Live-Action Film — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=live-action-film) (no model reached 500 appearances; none ranked)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1148 | ±69 | 212 | – |
| 2 | FLUX 3 Max [P] | 1141 | ±66 | 238 | – |
| 3 | MiniMax H3 (768p) | 1119 | ±54 | 413 | – |
| 4 | Wan 3.0 | 1100 | ±55 | 387 | – |
| 5 | FLUX 3 | 1082 | ±56 | 334 | – |
| 6 | Dreamina Seedance 2.0 | 1079 | ±57 | 352 | – |
| 7 | Utopai X [P] | 1079 | ±65 | 214 | – |
| 8 | HeyGen Video 1 [P] | 1051 | ±54 | 390 | – |
| 9 | Dreamina Seedance 2.5 | 1047 | ±53 | 381 | – |
| 10 | P-Video-2-Pro [P] | 1044 | ±63 | 227 | – |

Further down: Kling 3.0 (Pro) pos 17, 1000; Kling 3.0 Omni pos 19, 989 ±58; Veo 3.1 Fast pos 24, 912 ±54; Veo 3.1 pos 25, 907 ±55; Veo 3.1 Lite pos 27, 891 ±57; Kling O1 Pro pos 28, 862 ±58.

#### Animation & Gaming — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=animation-and-gaming)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | HeyGen Video 1 [P] | 1174 | ±48 | 627 | 1 (1-2) |
| 2 | MiniMax H3 Max [P] | 1156 | ±57 | 319 | – |
| 3 | Bach 1.0 Pro [P] | 1145 | ±55 | 356 | – |
| 4 | P-Video-2-Pro [P] | 1133 | ±56 | 317 | – |
| 5 | Utopai X [P] | 1129 | ±57 | 315 | – |
| 6 | Wan 3.0 | 1129 | ±50 | 505 | 2 (1-2) |
| 7 | FLUX 3 Max [P] | 1123 | ±56 | 336 | – |
| 8 | MiniMax H3 (768p) | 1104 | ±50 | 460 | – |
| 9 | Agnes-Video-2.5 | 1084 | ±55 | 343 | – |
| 10 | Dreamina Seedance 2.0 | 1081 | ±53 | 354 | – |

Further down: Kling 3.0 (Pro) pos 19, 1000; Veo 3.1 pos 22, 969 ±53; Kling 3.0 Omni pos 24, 948 ±52; Veo 3.1 Fast pos 25, 934 ±49; Veo 3.1 Lite pos 26, 933 ±53; Kling O1 Pro pos 31, 875 ±57 (all unranked).

#### Architecture & Real Estate — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=architecture-and-real-estate)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1125 | ±58 | 304 | – |
| 2 | HeyGen Video 1 [P] | 1110 | ±48 | 566 | 1 (1) |
| 3 | Wan 3.0 | 1109 | ±49 | 487 | – |
| 4 | MiniMax H3 (768p) | 1108 | ±53 | 403 | – |
| 5 | FLUX 3 Max [P] | 1104 | ±58 | 295 | – |
| 6 | P-Video-2-Pro [P] | 1088 | ±56 | 322 | – |
| 7 | MiniMax H3 Max [P] | 1084 | ±56 | 314 | – |
| 8 | Dreamina Seedance 2.5 | 1071 | ±50 | 460 | – |
| 9 | Grok Imagine Video 1.5 | 1052 | ±52 | 393 | – |
| 10 | Agnes-Video-2.5 | 1050 | ±53 | 393 | – |

Further down: Kling 3.0 (Pro) pos 17, 1000; Kling 3.0 Omni pos 21, 974 ±52; Veo 3.1 pos 24, 938 ±52; Veo 3.1 Fast pos 25, 932 ±50; Veo 3.1 Lite pos 27, 914 ±55; Kling O1 Pro pos 29, 877 ±56 (all unranked).

#### Productivity & Knowledge Work — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=productivity-and-knowledge-work)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1187 | ±62 | 277 | – |
| 2 | HeyGen Video 1 [P] | 1178 | ±50 | 556 | 1 (1) |
| 3 | Utopai X [P] | 1153 | ±58 | 303 | – |
| 4 | MiniMax H3 (768p) | 1124 | ±51 | 441 | – |
| 5 | Bach 1.0 Pro [P] | 1112 | ±59 | 276 | – |
| 6 | Wan 3.0 | 1108 | ±52 | 412 | – |
| 7 | FLUX 3 Max [P] | 1104 | ±58 | 295 | – |
| 8 | Dreamina Seedance 2.5 | 1100 | ±51 | 440 | – |
| 9 | P-Video-2-Pro [P] | 1094 | ±57 | 303 | – |
| 10 | FLUX 3 | 1094 | ±53 | 363 | – |

Further down: Kling 3.0 Omni pos 17, 1012 ±53; Kling 3.0 (Pro) pos 19, 1000; Veo 3.1 pos 23, 960 ±54; Veo 3.1 Lite pos 26, 940 ±52; Veo 3.1 Fast pos 27, 940 ±50; Kling O1 Pro pos 29, 925 ±56 (all unranked).

#### UIUX & Motion Design — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=uiux-design)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1240 | ±50 | 478 | – |
| 2 | HeyGen Video 1 [P] | 1239 | ±48 | 656 | 1 (1) |
| 3 | MiniMax H3 (768p) | 1226 | ±52 | 434 | – |
| 4 | P-Video-2-Pro [P] | 1214 | ±56 | 339 | – |
| 5 | FLUX 3 | 1201 | ±54 | 373 | – |
| 6 | FLUX 3 Max [P] | 1200 | ±54 | 362 | – |
| 7 | Utopai X [P] | 1190 | ±54 | 350 | – |
| 8 | Dreamina Seedance 2.5 | 1187 | ±49 | 513 | 2 (2) |
| 9 | Bach 1.0 Pro [P] | 1184 | ±55 | 349 | – |
| 10 | Dreamina Seedance 2.0 | 1180 | ±53 | 380 | – |

Further down: MiniMax H3 Max pos 11, 1177 ±57; Veo 3.1 pos 15, 1110 ±52; Veo 3.1 Fast pos 21, 1064 ±50; Veo 3.1 Lite pos 22, 1062 ±54; Kling 3.0 (Pro) pos 25, 1000; Kling 3.0 Omni pos 30, 964 ±56; Kling O1 Pro pos 33, 840 ±61 (all unranked).

#### Consumer — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=consumer)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1064 | ±64 | 259 | – |
| 2 | MiniMax H3 Max [P] | 1058 | ±61 | 290 | – |
| 3 | HeyGen Video 1 [P] | 1044 | ±51 | 543 | 1 (1) |
| 4 | Dreamina Seedance 2.5 | 1041 | ±53 | 481 | – |
| 5 | FLUX 3 Max [P] | 1037 | ±62 | 265 | – |
| 6 | Wan 3.0 | 1034 | ±54 | 411 | – |
| 7 | Dreamina Seedance 2.0 | 1034 | ±55 | 379 | – |
| 8 | MiniMax H3 (768p) | 1031 | ±53 | 435 | – |
| 9 | Gemini Omni Flash 1.1 | 1018 | ±52 | 483 | – |
| 10 | FLUX 3 | 1018 | ±55 | 394 | – |

Further down: Kling 3.0 (Pro) pos 12, 1000; Kling 3.0 Omni pos 19, 924 ±57; Veo 3.1 Lite pos 24, 875 ±55; Veo 3.1 Fast pos 25, 873 ±55; Veo 3.1 pos 26, 865 ±56; Kling O1 Pro pos 28, 864 ±57 (all unranked).

#### Social Media & Creator Content — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=social-media-and-creator-content)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1181 | ±53 | 434 | – |
| 2 | Bach 1.0 Pro [P] | 1157 | ±61 | 247 | – |
| 3 | FLUX 3 Max [P] | 1149 | ±61 | 263 | – |
| 4 | HeyGen Video 1 [P] | 1148 | ±52 | 439 | – |
| 5 | Dreamina Seedance 2.5 | 1133 | ±51 | 469 | – |
| 6 | P-Video-2-Pro [P] | 1121 | ±63 | 231 | – |
| 7 | MiniMax H3 Max [P] | 1120 | ±60 | 252 | – |
| 8 | MiniMax H3 (768p) | 1114 | ±51 | 472 | – |
| 9 | Utopai X [P] | 1095 | ±62 | 231 | – |
| 10 | Dreamina Seedance 2.0 | 1093 | ±55 | 324 | – |

Further down: MAGI-2 Preview pos 16, rank 1 (1), 1033 ±48 (the only ranked model); Kling 3.0 (Pro) pos 21, 1000; Veo 3.1 Fast pos 22, 992 ±52; Veo 3.1 pos 24, 965 ±52; Kling 3.0 Omni pos 25, 957 ±53; Veo 3.1 Lite pos 27, 949 ±53; Kling O1 Pro pos 29, 909 ±55.

#### Frontier — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=frontier)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | FLUX 3 Max [P] | 1216 | ±60 | 319 | – |
| 2 | HeyGen Video 1 [P] | 1176 | ±47 | 610 | 1 (1) |
| 3 | MiniMax H3 (768p) | 1167 | ±51 | 458 | – |
| 4 | MiniMax H3 Max [P] | 1156 | ±56 | 334 | – |
| 5 | Utopai X [P] | 1154 | ±55 | 342 | – |
| 6 | P-Video-2-Pro [P] | 1135 | ±56 | 326 | – |
| 7 | Wan 3.0 | 1130 | ±50 | 468 | – |
| 8 | Gemini Omni Flash 1.1 | 1112 | ±49 | 467 | – |
| 9 | FLUX 3 | 1111 | ±52 | 392 | – |
| 10 | Bach 1.0 Pro [P] | 1108 | ±55 | 344 | – |

Further down: Kling 3.0 Omni pos 19, 1007 ±53; Kling 3.0 (Pro) pos 22, 1000; Veo 3.1 Fast pos 23, 977 ±49; Veo 3.1 pos 27, 924 ±53; Kling O1 Pro pos 30, 906 ±54; Veo 3.1 Lite pos 31, 899 ±54 (all unranked).

#### Physics — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=physics)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1160 | ±55 | 385 | – |
| 2 | FLUX 3 Max [P] | 1105 | ±52 | 382 | – |
| 3 | HeyGen Video 1 [P] | 1105 | ±44 | 703 | 1 (1-3) |
| 4 | P-Video-2-Pro [P] | 1104 | ±54 | 327 | – |
| 5 | Utopai X [P] | 1094 | ±53 | 353 | – |
| 6 | MiniMax H3 (768p) | 1087 | ±47 | 528 | 2 (1-4) |
| 7 | Wan 3.0 | 1070 | ±46 | 569 | 3 (1-5) |
| 8 | FLUX 3 | 1064 | ±48 | 445 | – |
| 9 | Bach 1.0 Pro [P] | 1059 | ±52 | 353 | – |
| 10 | Dreamina Seedance 2.5 | 1050 | ±45 | 582 | 4 (2-5) |

Further down: Kling 3.0 (Pro) pos 13, rank 6 (6), 1000; Kling 3.0 Omni pos 22, –, 943 ±49; Veo 3.1 pos 24, –, 920 ±48; Veo 3.1 Fast pos 27, rank 12 (11-13), 887 ±47; Veo 3.1 Lite pos 28, –, 879 ±48; Kling O1 Pro pos 30, –, 858 ±50.

#### Complex Composition — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=complex-composition)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 (768p) | 1151 | ±46 | 568 | 1 (1-2) |
| 2 | MiniMax H3 Max [P] | 1132 | ±51 | 425 | – |
| 3 | Utopai X [P] | 1123 | ±50 | 425 | – |
| 4 | P-Video-2-Pro [P] | 1119 | ±50 | 419 | – |
| 5 | HeyGen Video 1 [P] | 1118 | ±42 | 822 | 2 (1-5) |
| 6 | Bach 1.0 Pro [P] | 1108 | ±51 | 392 | – |
| 7 | FLUX 3 Max [P] | 1108 | ±48 | 451 | – |
| 8 | Dreamina Seedance 2.5 | 1080 | ±44 | 595 | 3 (2-6) |
| 9 | Wan 3.0 | 1079 | ±44 | 601 | 4 (2-6) |
| 10 | Dreamina Seedance 2.0 | 1079 | ±46 | 518 | 5 (2-6) |

Further down: Kling 3.0 (Pro) pos 18, rank 9 (9), 1000; Kling 3.0 Omni pos 21, –, 975 ±48; Veo 3.1 pos 23, rank 12 (10-16), 933 ±46; Veo 3.1 Fast pos 24, rank 13 (11-16), 921 ±45; Veo 3.1 Lite pos 25, rank 14 (12-16), 908 ±47; Kling O1 Pro pos 31, –, 873 ±50.

#### Human Anatomy — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=human-anatomy)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1096 | ±61 | 272 | – |
| 2 | Bach 1.0 Pro [P] | 1090 | ±59 | 308 | – |
| 3 | Wan 3.0 | 1079 | ±49 | 544 | 1 (1-3) |
| 4 | Utopai X [P] | 1074 | ±60 | 277 | – |
| 5 | MiniMax H3 (768p) | 1072 | ±50 | 525 | 2 (1-3) |
| 6 | HeyGen Video 1 [P] | 1063 | ±50 | 491 | – |
| 7 | Dreamina Seedance 2.5 | 1057 | ±49 | 541 | 3 (1-3) |
| 8 | FLUX 3 Max [P] | 1054 | ±58 | 304 | – |
| 9 | Dreamina Seedance 2.0 | 1047 | ±52 | 452 | – |
| 10 | P-Video-2-Pro [P] | 1014 | ±58 | 280 | – |

Further down: Kling 3.0 (Pro) pos 12, rank 4 (4), 1000; Kling 3.0 Omni pos 18, –, 934 ±50; Kling O1 Pro pos 20, –, 878 ±51; Veo 3.1 pos 24, –, 840 ±50; Veo 3.1 Fast pos 28, rank 9 (9), 809 ±49; Veo 3.1 Lite pos 30, –, 797 ±51.

#### Lighting & Materials — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=lighting-and-materials)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1163 | ±44 | 578 | 1 (1-3) |
| 2 | HeyGen Video 1 [P] | 1160 | ±42 | 759 | 2 (1-3) |
| 3 | FLUX 3 Max [P] | 1157 | ±48 | 407 | – |
| 4 | MiniMax H3 (768p) | 1157 | ±44 | 575 | 3 (1-4) |
| 5 | Utopai X [P] | 1155 | ±47 | 443 | – |
| 6 | MiniMax H3 Max [P] | 1154 | ±49 | 415 | – |
| 7 | P-Video-2-Pro [P] | 1123 | ±47 | 453 | – |
| 8 | Bach 1.0 Pro [P] | 1117 | ±48 | 415 | – |
| 9 | FLUX 3 | 1114 | ±45 | 514 | 4 (3-6) |
| 10 | Dreamina Seedance 2.0 | 1112 | ±47 | 439 | – |

Further down: Veo 3.1 pos 19, –, 1031 ±46; Kling 3.0 Omni pos 21, rank 11 (7-14), 1021 ±45; Veo 3.1 Lite pos 22, –, 1016 ±47; Veo 3.1 Fast pos 24, rank 12 (9-14), 1001 ±44; Kling 3.0 (Pro) pos 25, rank 13, 1000; Kling O1 Pro pos 29, –, 966 ±47.

#### Multi-Scene & Narrative — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=multi-scene-and-narrative)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Wan 3.0 | 1179 | ±47 | 534 | 1 (1-4) |
| 2 | FLUX 3 Max [P] | 1166 | ±57 | 322 | – |
| 3 | MiniMax H3 Max [P] | 1154 | ±53 | 368 | – |
| 4 | HeyGen Video 1 [P] | 1146 | ±45 | 649 | 2 (1-5) |
| 5 | Bach 1.0 Pro [P] | 1146 | ±52 | 395 | – |
| 6 | Dreamina Seedance 2.5 | 1145 | ±47 | 533 | 3 (1-5) |
| 7 | Gemini Omni Flash 1.1 | 1132 | ±46 | 577 | 4 (2-5) |
| 8 | MiniMax H3 (768p) | 1124 | ±46 | 530 | 5 (2-5) |
| 9 | FLUX 3 | 1121 | ±50 | 419 | – |
| 10 | Utopai X [P] | 1116 | ±52 | 357 | – |

Further down: Kling 3.0 Omni pos 19, –, 1002 ±48; Kling 3.0 (Pro) pos 20, rank 9, 1000; Veo 3.1 Fast pos 22, rank 10 (6-11), 988 ±45; Veo 3.1 pos 24, –, 977 ±48; Veo 3.1 Lite pos 25, –, 975 ±49; Kling O1 Pro pos 31, –, 856 ±53.

#### Camera Control — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=camera-control)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | HeyGen Video 1 [P] | 1086 | ±41 | 835 | 1 (1-2) |
| 2 | FLUX 3 Max [P] | 1064 | ±47 | 459 | – |
| 3 | Wan 3.0 | 1058 | ±44 | 577 | 2 (1-3) |
| 4 | Utopai X [P] | 1052 | ±48 | 432 | – |
| 5 | Dreamina Seedance 2.5 | 1042 | ±43 | 590 | 3 (2-6) |
| 6 | MiniMax H3 Max [P] | 1030 | ±48 | 421 | – |
| 7 | Dreamina Seedance 2.0 | 1027 | ±46 | 457 | – |
| 8 | P-Video-2-Pro [P] | 1023 | ±47 | 462 | – |
| 9 | FLUX 3 | 1012 | ±44 | 514 | 4 (3-8) |
| 10 | MiniMax H3 (768p) | 1003 | ±43 | 590 | 5 (3-8) |

Further down: Kling 3.0 (Pro) pos 11, rank 6, 1000; Kling 3.0 Omni pos 21, –, 941 ±45; Veo 3.1 Fast pos 23, rank 11 (9-14), 918 ±44; Veo 3.1 Lite pos 26, –, 903 ±46; Veo 3.1 pos 27, –, 891 ±46; Kling O1 Pro pos 30, –, 849 ±48.

#### Text Rendering — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=text-rendering)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | FLUX 3 Max [P] | 1383 | ±67 | 279 | – |
| 2 | HeyGen Video 1 [P] | 1358 | ±53 | 553 | 1 (1-4) |
| 3 | Utopai X [P] | 1344 | ±64 | 278 | – |
| 4 | MiniMax H3 Max [P] | 1343 | ±66 | 271 | – |
| 5 | P-Video-2-Pro [P] | 1336 | ±65 | 278 | – |
| 6 | Wan 3.0 | 1328 | ±54 | 503 | 2 (1-4) |
| 7 | Gemini Omni Flash 1.1 | 1328 | ±51 | 580 | 3 (1-4) |
| 8 | MiniMax H3 (768p) | 1317 | ±53 | 521 | 4 (1-4) |
| 9 | FLUX 3 | 1315 | ±56 | 443 | – |
| 10 | Bach 1.0 Pro [P] | 1292 | ±63 | 286 | – |

Further down: Veo 3.1 Fast pos 21, rank 10 (9-10), 1117 ±50; Veo 3.1 Lite pos 22, –, 1087 ±54; Veo 3.1 pos 23, –, 1085 ±55; Kling 3.0 Omni pos 26, –, 1014 ±56; Kling 3.0 (Pro) pos 27, rank 12, 1000; Kling O1 Pro pos 36, –, 794 ±67.

#### Spatio-Temporal Consistency — [link](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false&category=spatio-temporal-consistency)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | HeyGen Video 1 [P] | 1153 | ±43 | 758 | 1 (1-3) |
| 2 | Wan 3.0 | 1151 | ±45 | 609 | 2 (1-3) |
| 3 | Utopai X [P] | 1142 | ±49 | 402 | – |
| 4 | MiniMax H3 Max [P] | 1128 | ±51 | 377 | – |
| 5 | Dreamina Seedance 2.5 | 1120 | ±45 | 561 | 3 (1-5) |
| 6 | FLUX 3 Max [P] | 1117 | ±50 | 394 | – |
| 7 | Bach 1.0 Pro [P] | 1116 | ±50 | 390 | – |
| 8 | P-Video-2-Pro [P] | 1090 | ±50 | 383 | – |
| 9 | Dreamina Seedance 2.0 | 1089 | ±46 | 505 | 4 (3-6) |
| 10 | MiniMax H3 (768p) | 1088 | ±44 | 574 | 5 (3-6) |

Further down: Kling 3.0 Omni pos 19, –, 1006 ±47; Kling 3.0 (Pro) pos 20, rank 10, 1000; Veo 3.1 pos 22, –, 991 ±46; Veo 3.1 Fast pos 24, rank 11 (8-12), 988 ±44; Veo 3.1 Lite pos 25, –, 972 ±46; Kling O1 Pro pos 27, –, 958 ±47.

---

### C. AA-Video-I2V v2.1 (image to video, with audio), 29 models

#### Overall — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1153 | ±17 | 5,459 | 1 (1-2) |
| 2 | Utopai X | 1146 | ±16 | 5,735 | 2 (1-3) |
| 3 | Dreamina Seedance 2.0 | 1136 | ±17 | 5,485 | 3 (2-5) |
| 4 | MiniMax H3 (768p) [P] | 1128 | ±16 | 5,443 | 4 (3-7) |
| 5 | Hyperflow H3 [P] | 1124 | ±16 | 5,627 | 5 (3-8) |
| 6 | HeyGen Video 1 | 1120 | ±16 | 5,370 | 6 (4-9) |
| 7 | P-Video-2-Pro [P] | 1119 | ±18 | 2,952 | 7 (4-9) |
| 8 | MiniMax H3 Max [P] | 1117 | ±16 | 5,438 | 8 (4-9) |
| 9 | Wan 3.0 | 1111 | ±16 | 5,527 | 9 (6-10) |
| 10 | Agnes-Video-2.5 | 1100 | ±18 | 2,936 | 10 (8-10) |

Further down: FLUX 3 Max 12 (11-13) 1064 ±16; Kling 3.0 (Pro) 17 (17-19) 1000; Kling 3.0 Omni 18 (17-19) 1000 ±17; Veo 3.1 21 (20-21) 957 ±17; Veo 3.1 Fast 22 (22-24) 937 ±17; Veo 3.1 Lite 24 (22-25) 929 ±18. All 29 models: Dreamina Seedance 2.5, Utopai X, Dreamina Seedance 2.0, MiniMax H3 (768p), Hyperflow H3, HeyGen Video 1, P-Video-2-Pro, MiniMax H3 Max, Wan 3.0, Agnes-Video-2.5, FLUX 3, FLUX 3 Max, Grok Imagine Video 1.5, Gemini Omni Flash 1.1, HappyHorse-1.1, HappyHorse-1.0, Kling 3.0 1080p (Pro), Kling 3.0 Omni 1080p (Pro), Grok Imagine Video 1.5 Lite, PixVerse V6, Veo 3.1, Veo 3.1 Fast, Vidu Q3 Pro, Veo 3.1 Lite, LTX-2.5 Fast, LTX-2.5 Pro, Vidu Q3 Turbo, LTX-2.3 Pro, LTX-2.3 Fast.

#### Marketing & Advertising — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=marketing-and-advertising)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1163 | ±50 | 548 | 1 (1-7) |
| 2 | MiniMax H3 (768p) [P] | 1155 | ±50 | 558 | 2 (1-7) |
| 3 | P-Video-2-Pro [P] | 1152 | ±59 | 298 | – |
| 4 | Utopai X | 1151 | ±50 | 567 | 3 (1-7) |
| 5 | Hyperflow H3 [P] | 1144 | ±51 | 523 | 4 (1-7) |
| 6 | Dreamina Seedance 2.0 | 1143 | ±51 | 525 | 5 (1-7) |
| 7 | MiniMax H3 Max [P] | 1131 | ±51 | 513 | 6 (1-8) |
| 8 | Agnes-Video-2.5 | 1125 | ±57 | 331 | – |
| 9 | Wan 3.0 | 1122 | ±50 | 530 | 7 (1-10) |
| 10 | HeyGen Video 1 | 1088 | ±49 | 549 | 8 (6-13) |

Further down: FLUX 3 Max pos 14, rank 12 (8-13), 1060 ±49; Kling 3.0 (Pro) pos 18, –, 1000; Veo 3.1 pos 20, –, 992 ±55; Veo 3.1 Fast pos 21, –, 962 ±55; Veo 3.1 Lite pos 23, –, 955 ±55; Kling 3.0 Omni pos 24, –, 936 ±56.

#### Retail & Ecommerce — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=retail-and-ecommerce)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1145 | ±51 | 556 | 1 (1-8) |
| 2 | HeyGen Video 1 | 1141 | ±50 | 544 | 2 (1-8) |
| 3 | Utopai X | 1138 | ±49 | 598 | 3 (1-8) |
| 4 | MiniMax H3 Max [P] | 1122 | ±51 | 520 | 4 (1-8) |
| 5 | Dreamina Seedance 2.0 | 1117 | ±50 | 590 | 5 (1-8) |
| 6 | MiniMax H3 (768p) [P] | 1115 | ±51 | 502 | 6 (1-9) |
| 7 | Hyperflow H3 [P] | 1112 | ±50 | 572 | 7 (1-9) |
| 8 | Wan 3.0 | 1105 | ±50 | 572 | 8 (1-9) |
| 9 | Agnes-Video-2.5 | 1101 | ±59 | 302 | – |
| 10 | P-Video-2-Pro [P] | 1091 | ±59 | 271 | – |

Further down: FLUX 3 Max pos 14, rank 12 (9-13), 1030 ±50; Kling 3.0 Omni pos 16, –, 1014 ±55; Kling 3.0 (Pro) pos 19, –, 1000; Veo 3.1 Fast pos 21, –, 928 ±56; Veo 3.1 pos 22, –, 927 ±54; Veo 3.1 Lite pos 24, –, 908 ±55.

#### Live-Action Film — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=live-action-film)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1152 | ±50 | 571 | 1 (1-4) |
| 2 | Hyperflow H3 [P] | 1133 | ±50 | 570 | 2 (1-6) |
| 3 | Dreamina Seedance 2.0 | 1122 | ±51 | 527 | 3 (1-8) |
| 4 | HeyGen Video 1 | 1116 | ±49 | 526 | 4 (1-9) |
| 5 | Agnes-Video-2.5 | 1100 | ±59 | 274 | – |
| 6 | MiniMax H3 (768p) [P] | 1094 | ±50 | 537 | 5 (2-10) |
| 7 | Utopai X | 1089 | ±49 | 582 | 6 (2-10) |
| 8 | P-Video-2-Pro [P] | 1082 | ±57 | 303 | – |
| 9 | FLUX 3 Max [P] | 1080 | ±49 | 584 | 7 (3-11) |
| 10 | Wan 3.0 | 1073 | ±49 | 569 | 8 (3-12) |

Further down: MiniMax H3 Max pos 11, rank 9 (4-12), 1068 ±50; Kling 3.0 Omni pos 15, –, 1024 ±53; Kling 3.0 (Pro) pos 19, –, 1000; Veo 3.1 pos 21, –, 957 ±54; Veo 3.1 Fast pos 22, –, 923 ±55; Veo 3.1 Lite pos 24, –, 919 ±56.

#### Animation & Gaming — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=animation-and-gaming)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1179 | ±52 | 544 | 1 (1-3) |
| 2 | Dreamina Seedance 2.0 | 1163 | ±51 | 566 | 2 (1-5) |
| 3 | Utopai X | 1146 | ±50 | 581 | 3 (1-6) |
| 4 | HeyGen Video 1 | 1118 | ±51 | 518 | 4 (2-8) |
| 5 | Wan 3.0 | 1118 | ±50 | 534 | 5 (2-8) |
| 6 | Hyperflow H3 [P] | 1110 | ±50 | 551 | 6 (3-8) |
| 7 | P-Video-2-Pro [P] | 1104 | ±61 | 261 | – |
| 8 | MiniMax H3 (768p) [P] | 1090 | ±51 | 530 | 7 (4-9) |
| 9 | MiniMax H3 Max [P] | 1089 | ±50 | 565 | 8 (4-9) |
| 10 | Agnes-Video-2.5 | 1073 | ±58 | 289 | – |

Further down: FLUX 3 Max pos 11, rank 9 (7-13), 1053 ±50; Kling 3.0 Omni pos 16, –, 1005 ±53; Kling 3.0 (Pro) pos 17, –, 1000; Veo 3.1 Fast pos 21, –, 917 ±55; Veo 3.1 pos 22, –, 917 ±55; Veo 3.1 Lite pos 25, –, 891 ±56.

#### Architecture & Real Estate — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=architecture-and-real-estate)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | P-Video-2-Pro [P] | 1138 | ±59 | 282 | – |
| 2 | MiniMax H3 (768p) [P] | 1137 | ±49 | 551 | 1 (1-8) |
| 3 | Dreamina Seedance 2.5 [P] | 1134 | ±50 | 539 | 2 (1-8) |
| 4 | Hyperflow H3 [P] | 1116 | ±48 | 570 | 3 (1-9) |
| 5 | Utopai X | 1116 | ±49 | 538 | 4 (1-9) |
| 6 | HeyGen Video 1 | 1105 | ±49 | 537 | 5 (1-9) |
| 7 | Dreamina Seedance 2.0 | 1102 | ±48 | 587 | 6 (1-9) |
| 8 | Agnes-Video-2.5 | 1095 | ±56 | 327 | – |
| 9 | Wan 3.0 | 1094 | ±49 | 572 | 7 (1-11) |
| 10 | MiniMax H3 Max [P] | 1092 | ±49 | 555 | 8 (1-11) |

Further down: Kling 3.0 Omni pos 15, –, 1048 ±53; FLUX 3 Max pos 17, rank 12 (9-13), 1032 ±48; Kling 3.0 (Pro) pos 19, –, 1000; Veo 3.1 pos 21, –, 978 ±53; Veo 3.1 Fast pos 22, –, 972 ±52; Veo 3.1 Lite pos 23, –, 962 ±55.

#### Productivity & Knowledge Work — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=productivity-and-knowledge-work)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1144 | ±52 | 539 | 1 (1-6) |
| 2 | Dreamina Seedance 2.5 [P] | 1132 | ±52 | 550 | 2 (1-7) |
| 3 | Hyperflow H3 [P] | 1115 | ±52 | 574 | 3 (1-9) |
| 4 | MiniMax H3 (768p) [P] | 1112 | ±51 | 585 | 4 (1-10) |
| 5 | Wan 3.0 | 1108 | ±51 | 560 | 5 (1-10) |
| 6 | MiniMax H3 Max [P] | 1104 | ±52 | 505 | 6 (1-10) |
| 7 | P-Video-2-Pro [P] | 1099 | ±59 | 329 | – |
| 8 | Dreamina Seedance 2.0 | 1087 | ±52 | 518 | 7 (2-10) |
| 9 | HeyGen Video 1 | 1078 | ±51 | 562 | 8 (3-10) |
| 10 | FLUX 3 Max [P] | 1067 | ±51 | 579 | 9 (3-11) |

Further down: Kling 3.0 (Pro) pos 17, –, 1000; Kling 3.0 Omni pos 19, –, 970 ±56; Veo 3.1 pos 20, –, 954 ±57; Veo 3.1 Lite pos 21, –, 952 ±56; Veo 3.1 Fast pos 23, –, 914 ±56.

#### UIUX & Motion Design — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=uiux-design)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1267 | ±53 | 611 | 1 (1-4) |
| 2 | MiniMax H3 Max [P] | 1252 | ±52 | 589 | 2 (1-6) |
| 3 | HeyGen Video 1 | 1244 | ±54 | 520 | 3 (1-7) |
| 4 | P-Video-2-Pro [P] | 1239 | ±61 | 303 | – |
| 5 | MiniMax H3 (768p) [P] | 1236 | ±53 | 552 | 4 (1-8) |
| 6 | Dreamina Seedance 2.0 | 1212 | ±51 | 572 | 5 (2-9) |
| 7 | Hyperflow H3 [P] | 1201 | ±52 | 566 | 6 (2-10) |
| 8 | Dreamina Seedance 2.5 [P] | 1194 | ±52 | 520 | 7 (3-10) |
| 9 | Wan 3.0 | 1188 | ±51 | 560 | 8 (4-11) |
| 10 | Agnes-Video-2.5 | 1181 | ±63 | 242 | – |

Further down: FLUX 3 Max pos 13, rank 11 (8-13), 1138 ±51; Veo 3.1 pos 18, –, 1043 ±57; Veo 3.1 Fast pos 19, –, 1025 ±57; Veo 3.1 Lite pos 20, –, 1017 ±57; Kling 3.0 Omni pos 21, –, 1011 ±57; Kling 3.0 (Pro) pos 23, –, 1000.

#### Consumer — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=consumer)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1128 | ±52 | 538 | 1 (1-7) |
| 2 | Utopai X | 1120 | ±51 | 606 | 2 (1-8) |
| 3 | MiniMax H3 (768p) [P] | 1118 | ±52 | 544 | 3 (1-8) |
| 4 | Dreamina Seedance 2.0 | 1112 | ±52 | 523 | 4 (1-8) |
| 5 | Hyperflow H3 [P] | 1102 | ±51 | 585 | 5 (1-8) |
| 6 | Wan 3.0 | 1094 | ±52 | 521 | 6 (1-8) |
| 7 | HeyGen Video 1 | 1093 | ±52 | 533 | 7 (1-8) |
| 8 | MiniMax H3 Max [P] | 1075 | ±51 | 583 | 8 (2-10) |
| 9 | Agnes-Video-2.5 | 1071 | ±60 | 283 | – |
| 10 | P-Video-2-Pro [P] | 1050 | ±59 | 303 | – |

Further down: FLUX 3 Max pos 14, rank 12 (9-13), 1019 ±51; Kling 3.0 (Pro) pos 16, –, 1000; Kling 3.0 Omni pos 17, –, 982 ±56; Veo 3.1 Fast pos 20, –, 920 ±57; Veo 3.1 pos 22, –, 911 ±55; Veo 3.1 Lite pos 27, –, 796 ±62.

#### Social Media & Creator Content — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=social-media-and-creator-content)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1202 | ±54 | 529 | 1 (1-5) |
| 2 | Dreamina Seedance 2.0 | 1199 | ±53 | 560 | 2 (1-5) |
| 3 | MiniMax H3 Max [P] | 1165 | ±54 | 511 | 3 (1-9) |
| 4 | Utopai X | 1161 | ±53 | 550 | 4 (1-9) |
| 5 | MiniMax H3 (768p) [P] | 1160 | ±53 | 539 | 5 (1-9) |
| 6 | Hyperflow H3 [P] | 1139 | ±52 | 549 | 6 (3-10) |
| 7 | P-Video-2-Pro [P] | 1130 | ±60 | 307 | – |
| 8 | HeyGen Video 1 | 1130 | ±52 | 539 | 7 (3-10) |
| 9 | Wan 3.0 | 1129 | ±53 | 538 | 8 (3-10) |
| 10 | Agnes-Video-2.5 | 1125 | ±60 | 300 | – |

Further down: FLUX 3 Max pos 12, rank 10 (6-13), 1094 ±53; Kling 3.0 (Pro) pos 18, –, 1000; Kling 3.0 Omni pos 19, –, 979 ±58; Veo 3.1 pos 20, –, 968 ±56; Veo 3.1 Lite pos 21, –, 957 ±58; Veo 3.1 Fast pos 25, –, 939 ±59.

#### Frontier — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=frontier)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1147 | ±51 | 563 | 1 (1-5) |
| 2 | Dreamina Seedance 2.5 [P] | 1138 | ±51 | 564 | 2 (1-5) |
| 3 | Dreamina Seedance 2.0 | 1134 | ±52 | 517 | 3 (1-7) |
| 4 | P-Video-2-Pro [P] | 1129 | ±59 | 295 | – |
| 5 | HeyGen Video 1 | 1112 | ±51 | 542 | 4 (1-8) |
| 6 | MiniMax H3 Max [P] | 1101 | ±50 | 560 | 5 (1-9) |
| 7 | Wan 3.0 | 1085 | ±50 | 571 | 6 (3-10) |
| 8 | Hyperflow H3 [P] | 1083 | ±50 | 567 | 7 (4-10) |
| 9 | MiniMax H3 (768p) [P] | 1070 | ±50 | 545 | 8 (4-12) |
| 10 | Agnes-Video-2.5 | 1060 | ±58 | 294 | – |

Further down: FLUX 3 Max pos 11, rank 9 (5-13), 1058 ±50; Kling 3.0 Omni pos 15, –, 1026 ±55; Kling 3.0 (Pro) pos 17, –, 1000; Veo 3.1 pos 22, –, 925 ±57; Veo 3.1 Lite pos 23, –, 918 ±56; Veo 3.1 Fast pos 26, –, 887 ±58.

#### Physics — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=physics)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1153 | ±50 | 585 | 1 (1-4) |
| 2 | Dreamina Seedance 2.5 [P] | 1117 | ±51 | 515 | 2 (1-8) |
| 3 | Dreamina Seedance 2.0 | 1115 | ±51 | 537 | 3 (1-8) |
| 4 | Agnes-Video-2.5 | 1114 | ±60 | 275 | – |
| 5 | Wan 3.0 | 1108 | ±50 | 541 | 4 (1-8) |
| 6 | HeyGen Video 1 | 1095 | ±51 | 524 | 5 (2-9) |
| 7 | MiniMax H3 (768p) [P] | 1091 | ±50 | 551 | 6 (2-9) |
| 8 | Hyperflow H3 [P] | 1079 | ±50 | 541 | 7 (2-9) |
| 9 | P-Video-2-Pro [P] | 1076 | ±58 | 302 | – |
| 10 | MiniMax H3 Max [P] | 1067 | ±50 | 530 | 8 (2-11) |

Further down: FLUX 3 Max pos 11, rank 9 (5-11), 1047 ±50; Kling 3.0 (Pro) pos 15, –, 1000; Kling 3.0 Omni pos 16, –, 988 ±56; Veo 3.1 pos 22, –, 958 ±54; Veo 3.1 Fast pos 24, –, 928 ±55; Veo 3.1 Lite pos 27, –, 883 ±57.

#### Complex Composition — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=complex-composition)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.0 | 1159 | ±51 | 557 | 1 (1-7) |
| 2 | Dreamina Seedance 2.5 [P] | 1144 | ±52 | 515 | 2 (1-7) |
| 3 | Hyperflow H3 [P] | 1131 | ±50 | 611 | 3 (1-8) |
| 4 | HeyGen Video 1 | 1126 | ±51 | 537 | 4 (1-8) |
| 5 | Utopai X | 1121 | ±51 | 575 | 5 (1-9) |
| 6 | MiniMax H3 (768p) [P] | 1117 | ±51 | 549 | 6 (1-9) |
| 7 | P-Video-2-Pro [P] | 1110 | ±59 | 291 | – |
| 8 | Wan 3.0 | 1109 | ±51 | 544 | 7 (1-10) |
| 9 | MiniMax H3 Max [P] | 1086 | ±51 | 541 | 8 (3-10) |
| 10 | Agnes-Video-2.5 | 1075 | ±59 | 301 | – |

Further down: FLUX 3 Max pos 12, rank 10 (7-11), 1062 ±49; Kling 3.0 (Pro) pos 16, –, 1000; Kling 3.0 Omni pos 17, –, 992 ±55; Veo 3.1 pos 21, –, 911 ±57; Veo 3.1 Fast pos 22, –, 910 ±56; Veo 3.1 Lite pos 23, –, 899 ±56.

#### Human Anatomy — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=human-anatomy)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1125 | ±55 | 563 | 1 (1-2) |
| 2 | Dreamina Seedance 2.0 | 1089 | ±54 | 512 | 2 (1-5) |
| 3 | Utopai X | 1063 | ±52 | 618 | 3 (2-7) |
| 4 | Wan 3.0 | 1055 | ±53 | 534 | 4 (2-8) |
| 5 | MiniMax H3 Max [P] | 1044 | ±52 | 584 | 5 (2-8) |
| 6 | P-Video-2-Pro [P] | 1041 | ±61 | 314 | – |
| 7 | MiniMax H3 (768p) [P] | 1027 | ±53 | 559 | 6 (3-8) |
| 8 | HeyGen Video 1 | 1018 | ±53 | 527 | 7 (3-8) |
| 9 | Agnes-Video-2.5 | 1007 | ±62 | 274 | – |
| 10 | Hyperflow H3 [P] | 1002 | ±53 | 548 | 8 (4-9) |

Further down: Kling 3.0 (Pro) pos 11, –, 1000; Kling 3.0 Omni pos 12, –, 976 ±56; FLUX 3 Max pos 16, rank 11 (9-12), 918 ±53; Veo 3.1 pos 22, –, 857 ±58; Veo 3.1 Lite pos 24, –, 826 ±59; Veo 3.1 Fast pos 25, –, 822 ±58.

#### Lighting & Materials — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=lighting-and-materials)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.0 | 1163 | ±50 | 558 | 1 (1-6) |
| 2 | Utopai X | 1142 | ±48 | 601 | 2 (1-8) |
| 3 | Dreamina Seedance 2.5 [P] | 1135 | ±50 | 543 | 3 (1-9) |
| 4 | MiniMax H3 (768p) [P] | 1125 | ±50 | 517 | 4 (1-9) |
| 5 | Hyperflow H3 [P] | 1118 | ±48 | 578 | 5 (1-10) |
| 6 | MiniMax H3 Max [P] | 1115 | ±49 | 533 | 6 (1-10) |
| 7 | Agnes-Video-2.5 | 1107 | ±58 | 284 | – |
| 8 | HeyGen Video 1 | 1098 | ±48 | 541 | 7 (2-10) |
| 9 | P-Video-2-Pro [P] | 1097 | ±58 | 275 | – |
| 10 | Wan 3.0 | 1096 | ±49 | 526 | 8 (2-11) |

Further down: Kling 3.0 Omni pos 15, –, 1032 ±54; FLUX 3 Max pos 16, rank 12 (10-13), 1031 ±48; Veo 3.1 Lite pos 18, –, 1022 ±54; Veo 3.1 Fast pos 21, –, 1010 ±53; Kling 3.0 (Pro) pos 22, –, 1000; Veo 3.1 pos 23, –, 995 ±53.

#### Multi-Scene & Narrative — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=multi-scene-and-narrative)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X | 1207 | ±52 | 556 | 1 (1-5) |
| 2 | Hyperflow H3 [P] | 1189 | ±53 | 532 | 2 (1-7) |
| 3 | MiniMax H3 (768p) [P] | 1188 | ±52 | 531 | 3 (1-7) |
| 4 | Dreamina Seedance 2.5 [P] | 1182 | ±51 | 555 | 4 (1-8) |
| 5 | Dreamina Seedance 2.0 | 1169 | ±52 | 535 | 5 (1-8) |
| 6 | P-Video-2-Pro [P] | 1159 | ±60 | 287 | – |
| 7 | Wan 3.0 | 1151 | ±50 | 562 | 6 (2-9) |
| 8 | MiniMax H3 Max [P] | 1138 | ±51 | 542 | 7 (2-11) |
| 9 | HeyGen Video 1 | 1135 | ±52 | 507 | 8 (4-12) |
| 10 | HappyHorse-1.1 | 1103 | ±50 | 548 | 9 (6-13) |

Further down: FLUX 3 Max pos 14, rank 12 (9-13), 1083 ±50; Kling 3.0 Omni pos 18, –, 1023 ±56; Kling 3.0 (Pro) pos 19, –, 1000; Veo 3.1 Fast pos 20, –, 990 ±55; Veo 3.1 pos 22, –, 980 ±56; Veo 3.1 Lite pos 26, –, 918 ±57.

#### Camera Control — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=camera-control)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1184 | ±51 | 552 | 1 (1-6) |
| 2 | MiniMax H3 Max [P] | 1164 | ±50 | 548 | 2 (1-8) |
| 3 | Dreamina Seedance 2.0 | 1145 | ±51 | 543 | 3 (1-9) |
| 4 | MiniMax H3 (768p) [P] | 1141 | ±50 | 561 | 4 (1-9) |
| 5 | HeyGen Video 1 | 1138 | ±50 | 553 | 5 (1-10) |
| 6 | Utopai X | 1133 | ±50 | 576 | 6 (2-10) |
| 7 | Hyperflow H3 [P] | 1131 | ±50 | 587 | 7 (2-10) |
| 8 | Wan 3.0 | 1127 | ±50 | 583 | 8 (2-10) |
| 9 | P-Video-2-Pro [P] | 1124 | ±58 | 297 | – |
| 10 | Agnes-Video-2.5 | 1113 | ±58 | 293 | – |

Further down: FLUX 3 Max pos 13, rank 11 (9-13), 1071 ±50; Kling 3.0 (Pro) pos 17, –, 1000; Kling 3.0 Omni pos 18, –, 996 ±56; Veo 3.1 pos 21, –, 984 ±55; Veo 3.1 Fast pos 22, –, 949 ±56; Veo 3.1 Lite pos 24, –, 941 ±56.

#### Text Rendering — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=text-rendering)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 (768p) [P] | 1213 | ±55 | 531 | 1 (1-8) |
| 2 | Utopai X | 1200 | ±54 | 584 | 2 (1-10) |
| 3 | P-Video-2-Pro [P] | 1200 | ±65 | 285 | – |
| 4 | Hyperflow H3 [P] | 1182 | ±55 | 528 | 3 (1-10) |
| 5 | HeyGen Video 1 | 1173 | ±55 | 545 | 4 (1-12) |
| 6 | Dreamina Seedance 2.5 [P] | 1172 | ±53 | 560 | 5 (1-11) |
| 7 | MiniMax H3 Max [P] | 1172 | ±55 | 534 | 6 (1-12) |
| 8 | Wan 3.0 | 1171 | ±53 | 578 | 7 (1-12) |
| 9 | FLUX 3 | 1162 | ±53 | 605 | 8 (1-12) |
| 10 | Grok Imagine Video 1.5 | 1155 | ±54 | 566 | 9 (2-12) |

Further down: FLUX 3 Max pos 11, rank 10 (2-12), 1153 ±54; Veo 3.1 pos 18, –, 1003 ±58; Kling 3.0 (Pro) pos 19, –, 1000; Veo 3.1 Lite pos 20, –, 962 ±59; Veo 3.1 Fast pos 21, –, 948 ±60; Kling 3.0 Omni pos 22, –, 933 ±60.

#### Spatio-Temporal Consistency — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=spatio-temporal-consistency)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | MiniMax H3 Max [P] | 1194 | ±52 | 552 | 1 (1-6) |
| 2 | P-Video-2-Pro [P] | 1173 | ±60 | 294 | – |
| 3 | HeyGen Video 1 | 1172 | ±52 | 536 | 2 (1-7) |
| 4 | Utopai X | 1170 | ±52 | 549 | 3 (1-8) |
| 5 | Hyperflow H3 [P] | 1169 | ±52 | 551 | 4 (1-8) |
| 6 | Dreamina Seedance 2.5 [P] | 1169 | ±52 | 553 | 5 (1-8) |
| 7 | MiniMax H3 (768p) [P] | 1147 | ±52 | 519 | 6 (1-9) |
| 8 | Dreamina Seedance 2.0 | 1141 | ±51 | 559 | 7 (2-11) |
| 9 | Wan 3.0 | 1120 | ±51 | 522 | 8 (3-12) |
| 10 | HappyHorse-1.0 | 1109 | ±56 | 359 | – |

Further down: FLUX 3 Max pos 14, rank 11 (7-13), 1093 ±52; Veo 3.1 pos 19, –, 1016 ±55; Kling 3.0 (Pro) pos 21, –, 1000; Kling 3.0 Omni pos 23, –, 982 ±57; Veo 3.1 Fast pos 24, –, 970 ±58; Veo 3.1 Lite pos 26, –, 938 ±56.

#### Audio Synchronization — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=audio-synchronization)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.0 | 1143 | ±50 | 567 | 1 (1-7) |
| 2 | Utopai X | 1141 | ±51 | 537 | 2 (1-8) |
| 3 | P-Video-2-Pro [P] | 1132 | ±59 | 307 | – |
| 4 | Dreamina Seedance 2.5 [P] | 1129 | ±50 | 554 | 3 (1-8) |
| 5 | Hyperflow H3 [P] | 1121 | ±49 | 583 | 4 (1-8) |
| 6 | HeyGen Video 1 | 1112 | ±49 | 565 | 5 (1-8) |
| 7 | Gemini Omni Flash 1.1 | 1102 | ±51 | 532 | 6 (1-10) |
| 8 | MiniMax H3 (768p) [P] | 1102 | ±49 | 576 | 7 (1-10) |
| 9 | Agnes-Video-2.5 | 1095 | ±58 | 308 | – |
| 10 | Wan 3.0 | 1093 | ±50 | 594 | 8 (2-11) |

Further down: FLUX 3 Max pos 11, rank 9 (6-12), 1062 ±49; MiniMax H3 Max pos 13, rank 11 (8-13), 1050 ±50; Kling 3.0 (Pro) pos 17, –, 1000; Veo 3.1 Lite pos 18, –, 987 ±56; Veo 3.1 Fast pos 20, –, 976 ±55; Kling 3.0 Omni pos 21, –, 963 ±54; Veo 3.1 pos 22, –, 957 ±54.

#### Dialogue & Lip Sync — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=dialogue-and-lip-sync)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1217 | ±52 | 549 | 1 (1-2) |
| 2 | MiniMax H3 Max [P] | 1166 | ±51 | 539 | 2 (1-8) |
| 3 | Utopai X | 1152 | ±51 | 554 | 3 (2-9) |
| 4 | Dreamina Seedance 2.0 | 1151 | ±50 | 543 | 4 (2-9) |
| 5 | HeyGen Video 1 | 1147 | ±50 | 535 | 5 (2-9) |
| 6 | Agnes-Video-2.5 | 1144 | ±58 | 325 | – |
| 7 | MiniMax H3 (768p) [P] | 1134 | ±50 | 549 | 6 (2-10) |
| 8 | Hyperflow H3 [P] | 1133 | ±50 | 568 | 7 (2-10) |
| 9 | FLUX 3 | 1129 | ±49 | 586 | 8 (2-10) |
| 10 | FLUX 3 Max [P] | 1112 | ±49 | 573 | 9 (3-11) |

Further down: Kling 3.0 Omni pos 12, –, 1097 ±54; Wan 3.0 pos 13, rank 10 (6-11), 1086 ±50; Kling 3.0 (Pro) pos 19, –, 1000; Veo 3.1 Lite pos 24, –, 921 ±56; Veo 3.1 pos 27, –, 890 ±56; Veo 3.1 Fast pos 29, –, 868 ±59.

---

### D. AA-Video-I2V-Silent v2.1 (image to video, no audio), 33 models

This board draws prompts at random rather than evenly by category, so most category cells have fewer than 500 appearances. Audio Synchronization and Dialogue & Lip Sync are disabled here.

#### Overall — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1155 | ±19 | 3,046 | 1 (1) |
| 2 | Dreamina Seedance 2.5 [P] | 1128 | ±18 | 3,650 | 2 (2-6) |
| 3 | MiniMax H3 Max [P] | 1122 | ±18 | 3,352 | 3 (2-7) |
| 4 | Bach 1.0 Pro | 1120 | ±19 | 3,330 | 4 (2-8) |
| 5 | Hyperflow H3 [P] | 1118 | ±19 | 2,960 | 5 (2-8) |
| 6 | Agnes-Video-2.5 [P] | 1114 | ±19 | 3,264 | 6 (2-9) |
| 7 | MiniMax H3 (768p) [P] | 1111 | ±18 | 3,421 | 7 (3-9) |
| 8 | HeyGen Video 1 | 1103 | ±17 | 5,135 | 8 (6-10) |
| 9 | P-Video-2-Pro [P] | 1102 | ±19 | 3,262 | 9 (5-10) |
| 10 | Dreamina Seedance 2.0 | 1093 | ±19 | 2,905 | 10 (7-11) |

Further down: Wan 3.0 11 (9-11) 1085 ±18; FLUX 3 Max 12 (12-14) 1056 ±18; Kling 3.0 Omni 17 (15-18) 1019 ±18; Kling 3.0 (Pro) 19 (18-20) 1000; Veo 3.1 22 (21-22) 953 ±18; Veo 3.1 Fast 23 (23-26) 932 ±18; Veo 3.1 Lite 24 (23-27) 924 ±18; Kling O1 Pro (January) 30 (30-31) 866 ±19.

#### Marketing & Advertising — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=marketing-and-advertising) (none ranked)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1186 | ±64 | 301 | – |
| 2 | Dreamina Seedance 2.5 [P] | 1172 | ±59 | 376 | – |
| 3 | Dreamina Seedance 2.0 | 1167 | ±66 | 282 | – |
| 4 | Bach 1.0 Pro | 1149 | ±59 | 357 | – |
| 5 | MiniMax H3 (768p) [P] | 1146 | ±59 | 342 | – |
| 6 | MiniMax H3 Max [P] | 1146 | ±59 | 362 | – |
| 7 | P-Video-2-Pro [P] | 1139 | ±60 | 344 | – |
| 8 | Hyperflow H3 [P] | 1139 | ±64 | 264 | – |
| 9 | Agnes-Video-2.5 [P] | 1131 | ±61 | 311 | – |
| 10 | HeyGen Video 1 | 1130 | ±55 | 496 | – |

Further down: Wan 3.0 pos 11, 1114 ±61; FLUX 3 Max pos 15, 1081 ±58; Kling 3.0 Omni pos 18, 1028 ±58; Kling 3.0 (Pro) pos 21, 1000; Veo 3.1 pos 23, 974 ±58; Veo 3.1 Lite pos 25, 950 ±59; Veo 3.1 Fast pos 26, 939 ±58; Kling O1 Pro pos 30, 862 ±63.

#### Retail & Ecommerce — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=retail-and-ecommerce) (none ranked)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1159 | ±65 | 304 | – |
| 2 | MiniMax H3 (768p) [P] | 1133 | ±63 | 319 | – |
| 3 | HeyGen Video 1 | 1124 | ±57 | 483 | – |
| 4 | Dreamina Seedance 2.5 [P] | 1118 | ±61 | 352 | – |
| 5 | Hyperflow H3 [P] | 1111 | ±64 | 298 | – |
| 6 | Bach 1.0 Pro | 1105 | ±63 | 307 | – |
| 7 | HappyHorse-1.1 | 1079 | ±63 | 288 | – |
| 8 | P-Video-2-Pro [P] | 1068 | ±63 | 301 | – |
| 9 | Dreamina Seedance 2.0 | 1064 | ±64 | 275 | – |
| 10 | Kling 3.0 Omni 1080p (Pro) | 1055 | ±61 | 335 | – |

Further down: MiniMax H3 Max pos 11, 1051 ±60; Wan 3.0 pos 12, 1050 ±61; FLUX 3 Max pos 17, 1007 ±60; Kling 3.0 (Pro) pos 18, 1000; Veo 3.1 Fast pos 21, 935 ±63; Veo 3.1 Lite pos 24, 912 ±63; Veo 3.1 pos 25, 900 ±61; Kling O1 Pro pos 29, 873 ±64.

#### Live-Action Film — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=live-action-film)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.0 | 1100 | ±63 | 290 | – |
| 2 | Dreamina Seedance 2.5 [P] | 1086 | ±60 | 371 | – |
| 3 | Utopai X [P] | 1075 | ±62 | 306 | – |
| 4 | HeyGen Video 1 | 1071 | ±54 | 539 | 1 (1) |
| 5 | MiniMax H3 Max [P] | 1064 | ±60 | 329 | – |
| 6 | Agnes-Video-2.5 [P] | 1058 | ±61 | 325 | – |
| 7 | MiniMax H3 (768p) [P] | 1058 | ±59 | 365 | – |
| 8 | Grok Imagine Video 1.5 | 1055 | ±59 | 342 | – |
| 9 | P-Video-2-Pro [P] | 1051 | ±61 | 314 | – |
| 10 | Hyperflow H3 [P] | 1034 | ±60 | 314 | – |

Further down: FLUX 3 Max pos 11, 1033 ±60; Wan 3.0 pos 13, 1019 ±59; Kling 3.0 (Pro) pos 14, 1000; Kling 3.0 Omni pos 15, 975 ±59; Veo 3.1 pos 22, 914 ±59; Veo 3.1 Lite pos 23, 876 ±59; Veo 3.1 Fast pos 24, 870 ±60; Kling O1 Pro pos 26, 855 ±62 (all unranked).

#### Animation & Gaming — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=animation-and-gaming)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1186 | ±59 | 368 | – |
| 2 | Utopai X [P] | 1183 | ±60 | 315 | – |
| 3 | Bach 1.0 Pro | 1138 | ±58 | 355 | – |
| 4 | Hyperflow H3 [P] | 1131 | ±60 | 314 | – |
| 5 | MiniMax H3 (768p) [P] | 1125 | ±57 | 359 | – |
| 6 | MiniMax H3 Max [P] | 1124 | ±57 | 357 | – |
| 7 | Agnes-Video-2.5 [P] | 1124 | ±57 | 350 | – |
| 8 | Dreamina Seedance 2.0 | 1122 | ±61 | 288 | – |
| 9 | FLUX 3 Max [P] | 1117 | ±58 | 332 | – |
| 10 | Wan 3.0 | 1103 | ±58 | 342 | – |

Further down: HeyGen Video 1 pos 11, rank 1 (1), 1097 ±52; Kling 3.0 Omni pos 17, 1008 ±55; Kling 3.0 (Pro) pos 19, 1000; Veo 3.1 Lite pos 24, 914 ±58; Veo 3.1 pos 27, 903 ±58; Veo 3.1 Fast pos 28, 890 ±58; Kling O1 Pro pos 32, 856 ±60.

#### Architecture & Real Estate — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=architecture-and-real-estate)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1169 | ±61 | 308 | – |
| 2 | MiniMax H3 Max [P] | 1136 | ±58 | 330 | – |
| 3 | Bach 1.0 Pro | 1130 | ±59 | 330 | – |
| 4 | Hyperflow H3 [P] | 1127 | ±60 | 293 | – |
| 5 | Dreamina Seedance 2.5 [P] | 1110 | ±54 | 407 | – |
| 6 | Agnes-Video-2.5 [P] | 1104 | ±55 | 387 | – |
| 7 | Wan 3.0 | 1091 | ±55 | 362 | – |
| 8 | FLUX 3 Max [P] | 1084 | ±55 | 351 | – |
| 9 | Dreamina Seedance 2.0 | 1080 | ±57 | 317 | – |
| 10 | HeyGen Video 1 | 1079 | ±50 | 542 | 1 (1) |

Further down: MiniMax H3 (768p) pos 11, 1079 ±57; Kling 3.0 Omni pos 16, 1031 ±54; Veo 3.1 pos 18, 1002 ±55; Kling 3.0 (Pro) pos 19, 1000; Veo 3.1 Fast pos 27, 966 ±54; Veo 3.1 Lite pos 28, 962 ±56; Kling O1 Pro pos 30, 905 ±56 (all unranked).

#### Productivity & Knowledge Work — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=productivity-and-knowledge-work) (none ranked)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | P-Video-2-Pro [P] | 1121 | ±65 | 305 | – |
| 2 | Bach 1.0 Pro | 1099 | ±63 | 330 | – |
| 3 | Hyperflow H3 [P] | 1071 | ±65 | 270 | – |
| 4 | MiniMax H3 Max [P] | 1070 | ±63 | 300 | – |
| 5 | Dreamina Seedance 2.0 | 1063 | ±64 | 276 | – |
| 6 | Dreamina Seedance 2.5 [P] | 1058 | ±62 | 299 | – |
| 7 | HeyGen Video 1 | 1046 | ±57 | 445 | – |
| 8 | Agnes-Video-2.5 [P] | 1043 | ±61 | 290 | – |
| 9 | Utopai X [P] | 1031 | ±62 | 299 | – |
| 10 | MiniMax H3 (768p) [P] | 1029 | ±61 | 325 | – |

Further down: Kling 3.0 Omni pos 11, 1011 ±60; Wan 3.0 pos 12, 1008 ±60; Kling 3.0 (Pro) pos 13, 1000; FLUX 3 Max pos 14, 986 ±59; Veo 3.1 Fast pos 22, 882 ±61; Veo 3.1 pos 23, 876 ±63; Kling O1 Pro pos 26, 850 ±63; Veo 3.1 Lite pos 27, 839 ±63.

#### UIUX & Motion Design — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=uiux-design)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1176 | ±60 | 325 | – |
| 2 | MiniMax H3 Max [P] | 1145 | ±58 | 367 | – |
| 3 | MiniMax H3 (768p) [P] | 1136 | ±57 | 371 | – |
| 4 | Agnes-Video-2.5 [P] | 1131 | ±59 | 337 | – |
| 5 | Dreamina Seedance 2.5 [P] | 1130 | ±55 | 400 | – |
| 6 | Wan 3.0 | 1128 | ±55 | 371 | – |
| 7 | Bach 1.0 Pro | 1119 | ±57 | 366 | – |
| 8 | P-Video-2-Pro [P] | 1118 | ±58 | 332 | – |
| 9 | HeyGen Video 1 | 1115 | ±50 | 610 | 1 (1) |
| 10 | Hyperflow H3 [P] | 1102 | ±58 | 316 | – |

Further down: FLUX 3 Max pos 14, 1050 ±56; Kling 3.0 (Pro) pos 19, 1000; Kling 3.0 Omni pos 20, 984 ±55; Veo 3.1 Fast pos 21, 967 ±55; Veo 3.1 pos 22, 965 ±54; Veo 3.1 Lite pos 26, 927 ±56; Kling O1 Pro pos 31, 839 ±58 (all unranked).

#### Consumer — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=consumer)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1210 | ±62 | 366 | – |
| 2 | MiniMax H3 Max [P] | 1209 | ±64 | 304 | – |
| 3 | Bach 1.0 Pro | 1208 | ±63 | 332 | – |
| 4 | Utopai X [P] | 1197 | ±63 | 295 | – |
| 5 | Hyperflow H3 [P] | 1196 | ±64 | 286 | – |
| 6 | Agnes-Video-2.5 [P] | 1183 | ±63 | 301 | – |
| 7 | P-Video-2-Pro [P] | 1180 | ±61 | 354 | – |
| 8 | HeyGen Video 1 | 1158 | ±55 | 511 | 1 (1) |
| 9 | Gemini Omni Flash 1.1 | 1139 | ±60 | 346 | – |
| 10 | Wan 3.0 | 1138 | ±61 | 337 | – |

Further down: MiniMax H3 (768p) pos 11, 1134 ±61; Kling 3.0 Omni pos 16, 1075 ±61; FLUX 3 Max pos 17, 1066 ±59; Veo 3.1 pos 19, 1028 ±58; Kling 3.0 (Pro) pos 22, 1000; Veo 3.1 Lite pos 23, 998 ±61; Veo 3.1 Fast pos 25, 967 ±60; Kling O1 Pro pos 29, 923 ±61 (all unranked).

#### Social Media & Creator Content — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=social-media-and-creator-content) (none ranked)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1223 | ±64 | 296 | – |
| 2 | Agnes-Video-2.5 [P] | 1175 | ±60 | 317 | – |
| 3 | MiniMax H3 Max [P] | 1165 | ±60 | 321 | – |
| 4 | Hyperflow H3 [P] | 1152 | ±60 | 305 | – |
| 5 | MiniMax H3 (768p) [P] | 1145 | ±58 | 325 | – |
| 6 | Dreamina Seedance 2.5 [P] | 1145 | ±58 | 344 | – |
| 7 | P-Video-2-Pro [P] | 1133 | ±61 | 292 | – |
| 8 | Bach 1.0 Pro | 1130 | ±59 | 321 | – |
| 9 | HeyGen Video 1 | 1113 | ±52 | 494 | – |
| 10 | Wan 3.0 | 1105 | ±58 | 325 | – |

Further down: FLUX 3 Max pos 14, 1058 ±57; Kling 3.0 Omni pos 17, 1025 ±56; Kling 3.0 (Pro) pos 20, 1000; Veo 3.1 Fast pos 23, 970 ±58; Veo 3.1 pos 24, 964 ±58; Veo 3.1 Lite pos 25, 955 ±57; Kling O1 Pro pos 32, 859 ±60.

#### Frontier — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=frontier)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1153 | ±63 | 297 | – |
| 2 | Agnes-Video-2.5 [P] | 1139 | ±58 | 351 | – |
| 3 | MiniMax H3 Max [P] | 1135 | ±60 | 331 | – |
| 4 | MiniMax H3 (768p) [P] | 1135 | ±59 | 362 | – |
| 5 | Hyperflow H3 [P] | 1132 | ±62 | 300 | – |
| 6 | Bach 1.0 Pro | 1123 | ±61 | 308 | – |
| 7 | HeyGen Video 1 | 1114 | ±54 | 507 | 1 (1) |
| 8 | Dreamina Seedance 2.0 | 1093 | ±63 | 268 | – |
| 9 | Wan 3.0 | 1093 | ±59 | 334 | – |
| 10 | Dreamina Seedance 2.5 [P] | 1089 | ±57 | 367 | – |

Further down: FLUX 3 Max pos 12, 1077 ±58; Kling 3.0 Omni pos 17, 1005 ±59; Kling 3.0 (Pro) pos 18, 1000; Veo 3.1 pos 20, 987 ±59; Veo 3.1 Fast pos 25, 923 ±59; Veo 3.1 Lite pos 29, 894 ±58; Kling O1 Pro pos 31, 824 ±62 (all unranked).

#### Physics — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=physics)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1160 | ±58 | 341 | – |
| 2 | Dreamina Seedance 2.5 [P] | 1155 | ±54 | 440 | – |
| 3 | MiniMax H3 Max [P] | 1152 | ±56 | 388 | – |
| 4 | MiniMax H3 (768p) [P] | 1149 | ±55 | 410 | – |
| 5 | Bach 1.0 Pro | 1139 | ±55 | 389 | – |
| 6 | Dreamina Seedance 2.0 | 1128 | ±57 | 330 | – |
| 7 | Agnes-Video-2.5 [P] | 1123 | ±56 | 361 | – |
| 8 | Hyperflow H3 [P] | 1119 | ±57 | 346 | – |
| 9 | P-Video-2-Pro [P] | 1114 | ±55 | 377 | – |
| 10 | HeyGen Video 1 | 1106 | ±51 | 554 | 1 (1) |

Further down: Wan 3.0 pos 11, 1090 ±55; FLUX 3 Max pos 13, 1062 ±54; Kling 3.0 Omni pos 14, 1060 ±54; Kling 3.0 (Pro) pos 20, 1000; Veo 3.1 Lite pos 23, 972 ±53; Veo 3.1 Fast pos 24, 942 ±53; Veo 3.1 pos 26, 938 ±52; Kling O1 Pro pos 30, 903 ±56 (all unranked).

#### Complex Composition — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=complex-composition)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1124 | ±53 | 411 | – |
| 2 | HeyGen Video 1 | 1106 | ±45 | 676 | 1 (1-2) |
| 3 | Bach 1.0 Pro | 1101 | ±52 | 433 | – |
| 4 | Dreamina Seedance 2.5 [P] | 1096 | ±49 | 501 | 2 (1-2) |
| 5 | Agnes-Video-2.5 [P] | 1092 | ±49 | 471 | – |
| 6 | Hyperflow H3 [P] | 1088 | ±51 | 401 | – |
| 7 | MiniMax H3 Max [P] | 1087 | ±50 | 461 | – |
| 8 | P-Video-2-Pro [P] | 1079 | ±51 | 419 | – |
| 9 | MiniMax H3 (768p) [P] | 1066 | ±51 | 412 | – |
| 10 | Dreamina Seedance 2.0 | 1060 | ±52 | 390 | – |

Further down: Wan 3.0 pos 11, 1049 ±50; FLUX 3 Max pos 13, 1005 ±49; Kling 3.0 (Pro) pos 15, 1000; Kling 3.0 Omni pos 16, 998 ±50; Veo 3.1 pos 24, 890 ±49; Veo 3.1 Fast pos 26, 842 ±52; Veo 3.1 Lite pos 28, 837 ±53; Kling O1 Pro pos 29, 818 ±52 (all unranked).

#### Human Anatomy — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=human-anatomy)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1091 | ±63 | 335 | – |
| 2 | Utopai X [P] | 1071 | ±65 | 280 | – |
| 3 | Hyperflow H3 [P] | 1060 | ±64 | 283 | – |
| 4 | Agnes-Video-2.5 [P] | 1060 | ±63 | 295 | – |
| 5 | Wan 3.0 | 1040 | ±60 | 354 | – |
| 6 | P-Video-2-Pro [P] | 1029 | ±60 | 330 | – |
| 7 | MiniMax H3 Max [P] | 1022 | ±61 | 314 | – |
| 8 | MiniMax H3 (768p) [P] | 1022 | ±62 | 293 | – |
| 9 | Dreamina Seedance 2.0 | 1018 | ±64 | 272 | – |
| 10 | Bach 1.0 Pro | 1005 | ±59 | 342 | – |

Further down: Kling 3.0 (Pro) pos 11, 1000; Kling 3.0 Omni pos 12, 997 ±59; HeyGen Video 1 pos 14, rank 1 (1), 990 ±55; FLUX 3 Max pos 19, 911 ±59; Kling O1 Pro pos 22, 833 ±60; Veo 3.1 Fast pos 23, 825 ±61; Veo 3.1 pos 25, 817 ±62; Veo 3.1 Lite pos 27, 805 ±62.

#### Lighting & Materials — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=lighting-and-materials)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1145 | ±53 | 406 | – |
| 2 | MiniMax H3 Max [P] | 1141 | ±51 | 486 | – |
| 3 | Bach 1.0 Pro | 1136 | ±52 | 453 | – |
| 4 | Agnes-Video-2.5 [P] | 1111 | ±51 | 458 | – |
| 5 | P-Video-2-Pro [P] | 1106 | ±51 | 448 | – |
| 6 | Hyperflow H3 [P] | 1105 | ±52 | 398 | – |
| 7 | MiniMax H3 (768p) [P] | 1104 | ±49 | 506 | 1 (1-2) |
| 8 | HeyGen Video 1 | 1094 | ±46 | 705 | 2 (1-2) |
| 9 | Dreamina Seedance 2.0 | 1073 | ±52 | 393 | – |
| 10 | Dreamina Seedance 2.5 [P] | 1065 | ±50 | 444 | – |

Further down: Wan 3.0 pos 11, 1055 ±51; FLUX 3 Max pos 12, 1044 ±49; Kling 3.0 Omni pos 15, 1027 ±49; Kling 3.0 (Pro) pos 19, 1000; Veo 3.1 pos 20, 996 ±49; Veo 3.1 Fast pos 22, 984 ±50; Veo 3.1 Lite pos 24, 967 ±50; Kling O1 Pro pos 27, 936 ±51 (all unranked).

#### Multi-Scene & Narrative — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=multi-scene-and-narrative)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1147 | ±54 | 421 | – |
| 2 | Hyperflow H3 [P] | 1109 | ±55 | 380 | – |
| 3 | Dreamina Seedance 2.5 [P] | 1105 | ±51 | 493 | – |
| 4 | Bach 1.0 Pro | 1099 | ±52 | 458 | – |
| 5 | P-Video-2-Pro [P] | 1098 | ±53 | 443 | – |
| 6 | MiniMax H3 Max [P] | 1097 | ±52 | 435 | – |
| 7 | Wan 3.0 | 1089 | ±52 | 441 | – |
| 8 | Agnes-Video-2.5 [P] | 1089 | ±52 | 436 | – |
| 9 | MiniMax H3 (768p) [P] | 1087 | ±52 | 442 | – |
| 10 | HeyGen Video 1 | 1062 | ±46 | 715 | 1 (1) |

Further down: FLUX 3 Max pos 12, 1040 ±50; Kling 3.0 (Pro) pos 16, 1000; Kling 3.0 Omni pos 18, 986 ±50; Veo 3.1 Fast pos 21, 932 ±50; Veo 3.1 pos 22, 928 ±52; Veo 3.1 Lite pos 27, 859 ±52; Kling O1 Pro pos 31, 769 ±55 (all unranked).

#### Camera Control — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=camera-control)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Dreamina Seedance 2.5 [P] | 1126 | ±50 | 509 | 1 (1-2) |
| 2 | Dreamina Seedance 2.0 | 1114 | ±54 | 383 | – |
| 3 | MiniMax H3 Max [P] | 1113 | ±52 | 425 | – |
| 4 | Agnes-Video-2.5 [P] | 1105 | ±51 | 429 | – |
| 5 | Utopai X [P] | 1086 | ±51 | 430 | – |
| 6 | HeyGen Video 1 | 1081 | ±45 | 688 | 2 (1-2) |
| 7 | Bach 1.0 Pro | 1077 | ±51 | 424 | – |
| 8 | Hyperflow H3 [P] | 1076 | ±51 | 416 | – |
| 9 | Wan 3.0 | 1072 | ±50 | 438 | – |
| 10 | Grok Imagine Video 1.5 | 1067 | ±50 | 456 | – |

Further down: MiniMax H3 (768p) pos 11, 1061 ±49; FLUX 3 Max pos 13, 1059 ±49; Kling 3.0 (Pro) pos 19, 1000; Kling 3.0 Omni pos 21, 975 ±49; Veo 3.1 pos 24, 932 ±50; Veo 3.1 Lite pos 25, 918 ±49; Kling O1 Pro pos 28, 904 ±50; Veo 3.1 Fast pos 30, 898 ±49 (all unranked).

#### Text Rendering — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=text-rendering)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1376 | ±62 | 371 | – |
| 2 | Hyperflow H3 [P] | 1314 | ±61 | 367 | – |
| 3 | MiniMax H3 Max [P] | 1313 | ±60 | 407 | – |
| 4 | Bach 1.0 Pro | 1308 | ±60 | 383 | – |
| 5 | MiniMax H3 (768p) [P] | 1296 | ±58 | 438 | – |
| 6 | P-Video-2-Pro [P] | 1296 | ±60 | 393 | – |
| 7 | Agnes-Video-2.5 [P] | 1290 | ±59 | 385 | – |
| 8 | FLUX 3 Max [P] | 1286 | ±58 | 399 | – |
| 9 | Dreamina Seedance 2.5 [P] | 1283 | ±58 | 416 | – |
| 10 | HeyGen Video 1 | 1281 | ±54 | 606 | 1 (1) |

Further down: Wan 3.0 pos 11, 1278 ±58; Veo 3.1 pos 19, 1130 ±57; Kling 3.0 Omni pos 20, 1105 ±59; Veo 3.1 Fast pos 21, 1101 ±58; Veo 3.1 Lite pos 23, 1072 ±58; Kling 3.0 (Pro) pos 28, 1000; Kling O1 Pro pos 32, 872 ±65 (all unranked).

#### Spatio-Temporal Consistency — [link](https://artificialanalysis.ai/video/leaderboard/image-to-video?audio-output=false&category=spatio-temporal-consistency)
| Pos | Model | Elo | ± | n | AA rank (range) |
|---|---|---|---|---|---|
| 1 | Utopai X [P] | 1166 | ±55 | 386 | – |
| 2 | Dreamina Seedance 2.5 [P] | 1143 | ±51 | 512 | 1 (1-2) |
| 3 | HeyGen Video 1 | 1133 | ±46 | 685 | 2 (1-2) |
| 4 | MiniMax H3 (768p) [P] | 1133 | ±53 | 443 | – |
| 5 | Bach 1.0 Pro | 1126 | ±52 | 448 | – |
| 6 | Hyperflow H3 [P] | 1120 | ±54 | 369 | – |
| 7 | Dreamina Seedance 2.0 | 1101 | ±54 | 377 | – |
| 8 | MiniMax H3 Max [P] | 1083 | ±51 | 436 | – |
| 9 | Agnes-Video-2.5 [P] | 1073 | ±51 | 429 | – |
| 10 | P-Video-2-Pro [P] | 1071 | ±52 | 428 | – |

Further down: FLUX 3 Max pos 11, 1053 ±50; Wan 3.0 pos 12, 1050 ±49; Kling 3.0 Omni pos 14, 1021 ±50; Kling 3.0 (Pro) pos 17, 1000; Veo 3.1 pos 20, 982 ±51; Veo 3.1 Lite pos 24, 941 ±52; Veo 3.1 Fast pos 27, 931 ±51; Kling O1 Pro pos 32, 857 ±54 (all unranked).

---

#### Other boards (no categories), for cross-checking
- **arena.ai Text-to-Video**, top 10 (score ±, votes):
  1. Gemini Omni 1.1 Flash 1516 ±15 (1,784)
  2. gemini-omni-flash 1513 ±9 (26,576)
  3. FLUX 3 Video 1493 ±17 Preliminary (1,302)
  4. Grok Imagine Video 1.5 1492 ±18 Preliminary (1,218)
  5. Dreamina Seedance 2.0 (720p) 1479 ±8 (56,318)
  6. Wan 3.0 1476 ±13 (2,598)
  7. Dreamina Seedance 2.5 (720p) 1474 ±9 (8,001)
  8. MiniMax H3 1460 ±9 (11,417)
  9. Muse Video 1456 ±15 (2,188)
  10. HappyHorse 1.0 1427 ±13 (22,264)

  [arena.ai T2V](https://arena.ai/leaderboard/video/text-to-video)
- **arena.ai Image-to-Video**, top 10:
  1. MiniMax H3 1495 ±5 (57,112)
  2. Gemini Omni 1.1 Flash 1488 ±11 (3,734)
  3. Wan 3.0 1480 ±11 (3,442)
  4. Dreamina Seedance 2.5 (720p) 1477 ±7 (15,729)
  5. Dreamina Seedance 2.0 (720p) 1475 ±7 (121,427)
  6. gemini-omni-flash 1465 ±6 (87,155)
  7. HiDream-O1-Video-1.0 1456 ±8 Preliminary (6,488)
  8. Grok Imagine Video 1.5 (720p) 1456 ±4 (137,459)
  9. FLUX 3 Video (20260811) 1449 ±5 (37,042)
  10. HappyHorse 1.0 1442 ±10 (70,640)

  [arena.ai I2V](https://arena.ai/leaderboard/video/image-to-video)
- **Design Arena Text to Video** (Elo; win rate; MoE; battles):
  1. Gemini Omni 1.1 Flash 1360 (68.2%, ±1.4%, 3,993)
  2. Gemini Omni Flash 1342
  3. HeyGen Video 1.0 (1080p, Ultraquality) 1334 (67.5%, ±3.1%, 858)
  4. Wan 3.0 1321
  5. P-Video-2-Pro (Cost) 1310
  6. FLUX 3 Max 1301
  7. Pika H3 Flex 1288
  8. Kling 4.0 1287 (59.4%, ±3.0%, 1,035)
  9. FLUX 3 Video 1285
  10. MiniMax H3 Max 1277
  11. MiniMax H3 1276

  [Design Arena T2V](https://www.designarena.ai/leaderboard?tab=video&section=video&board=video)
- **Design Arena Image to Video:**
  1. MiniMax H3 Max 1321 (36,482 battles)
  2. Kling 4.0 1319 (59.8%, ±1.5%, 3,982)
  3. P-Video-2-Pro (Speed) 1318
  4. HeyGen Video 1.0 (1080p, Ultraquality) 1316
  5. Wan 3.0 1304
  6. FLUX 3 Max 1297
  7. MiniMax H3 1296
  8. Seedance 2.5 1282
  9. Grok Imagine Video 1.5 Preview 1272
  10. Seedance 2.0 1262

  [Design Arena I2V](https://www.designarena.ai/leaderboard?tab=video&section=video&board=image-to-video)
- **Design Arena Multi-Image to Video** (reference-image consistency):
  1. Seedance 2.5 1352
  2. MiniMax H3 1335
  3. Seedance 2.0 1312
  4. Seedance 2.0 Fast 1307
  5. MiniMax H3 Max 1296
  6. Seedance 2.0 Mini 1292
  7. Kling 4.0 1278 (62.3%, ±3.7%, 649)
  8. Gemini Omni 1.1 Flash 1265
  9. Happy Horse 1.1 1250
  10. Gemini Omni Flash 1231

  [Design Arena multi-image](https://www.designarena.ai/leaderboard?tab=video&section=video&board=multi-to-video)
- **Design Arena Multimodal to Video:**
  1. Seedance 2.5 1372
  2. Seedance 2.0 Fast 1332
  3. Seedance 2.0 1327
  4. MiniMax H3 1301 (229 battles, ±6.0%)
  5. Seedance 2.0 Mini 1282
  6. MiniMax H3 Max 1236
  7. HeyGen Video 1.0 (1080p, Ultraquality) 1188
  8. Happy Horse 1.0 1180
  9. Happy Horse 1.1 1154
  10. Kling O1 Edit 1122

  [Design Arena multimodal](https://www.designarena.ai/leaderboard?tab=video&section=video&board=multimodal-to-video)
- **Design Arena scale.** Its Elo is "starting at 1200" (Bradley-Terry), and its MoE is described as "±standard error from the Bradley-Terry model". It is displayed as a percentage next to the win rate. — [Design Arena T2V](https://www.designarena.ai/leaderboard?tab=video&section=video&board=video)

### Inferences
- **Category leads are not statistically separated.** Even AA's most decisive category lead (Seedance 2.5 on I2V Dialogue & Lip Sync, 1165–1269) overlaps #2 MiniMax H3 Max (1115–1217). For ranking within the top cluster, per-category boards give a direction, not a verdict. For separating the cluster from Kling 3.0 / Veo 3.1 / LTX, they are decisive.
- **Elo gaps as win rates.** On the Elo scale, a 100-point gap is about a 64% expected preference, 50 points about 57%, 200 points about 76% (standard Elo formula; AA reports Bradley-Terry fits "on an Elo scale").
  - Gemini Omni Flash 1.1's UIUX lead over Veo 3.1 (1309 vs 1106) means it would be preferred roughly 3 times in 4.
- **Text vs image input changes the order.** Seedance 2.5 and Seedance 2.0 rank higher on image-to-video than text-to-video. FLUX 3 Max and Wan 3.0 rank lower on image-to-video (FLUX 3 Max #12 overall I2V, #5 T2V). So beatsheet should keep separate rankings for "from a board/still" and "from text".
- **Audio changes the order.** HeyGen Video 1 is #1 on T2V-Silent but #6 with audio, and #10 on Dialogue & Lip Sync and Audio Synchronization. Its video quality ranks higher than its sound.
- **Provisional models.** Provisional and under-500 models (FLUX 3 Max, MiniMax H3 Max, P-Video-2-Pro, Bach 1.0 Pro, Utopai X on the silent boards) often top category tables with ±55–69 intervals. Treat them as promising but unconfirmed.

### Gaps
- The Elo numbers are not comparable across the four AA boards or across AA, arena.ai and Design Arena, which use separate pools and anchors.
- I did not check which base model "Hyperflow H3", "Utopai X", "Bach 1.0 Pro" or "Agnes-Video-2.5" derive from. The MiniMax H3 Max row carries a "Based on MiniMax H3" marker; I did not check whether Hyperflow H3 carries one.

## Are there categories where a cheap model ranks near the top?

### Takeaway
Yes, often. HeyGen Video 1 ($2.40/min on AA) and MiniMax H3 (768p) ($4.80/min) sit in or near the top 3 of many categories, especially on text-to-video. FLUX 3 Max ($4.35/min) tops several text-to-video categories, but on provisional, under-500-sample data, and it is mid-pack on image-to-video. Wan 3.0 costs $12.00/min on AA but leads T2V-with-audio Overall and 5 capability/use-case categories. Veo 3.1 Lite and Fast never reach the top 10 of any AA category, and Kling 2.5 Turbo is not on AA at all.

### Cited Findings
- **AA per-minute prices** (model creator's API, 1080p where offered):
  - HeyGen Video 1 $2.40, Agnes-Video-2.5 $2.40, FLUX 3 Max $4.35, MiniMax H3 (768p) $4.80, P-Video-2-Pro $5.70, MiniMax H3 Max $9.60, Wan 3.0 $12.00.
  - Veo 3.1 Lite $4.80 with audio / $3.00 silent; Veo 3.1 Fast $7.20 / $6.00; Veo 3.1 $24.00 / $12.00.
  - Kling 3.0 1080p (Pro) $10.08 / $6.72; Kling 3.0 Omni $8.40 / $6.72.
  - Seedance 2.5 $34.12, Seedance 2.0 $22.45, FLUX 3 $17.40, Gemini Omni Flash 1.1 $9.12, Hyperflow H3 $9.00.
  - Utopai X "No API available". — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video)
- **HeyGen Video 1 ($2.40/min):**
  - #1 on T2V-Silent Overall (1143 ±16).
  - On T2V with audio, #1 in Animation & Gaming (1225 ±46) and Lighting & Materials (1189 ±45), #2 in UIUX & Motion Design (1301 ±48).
  - Top-3 by position in 6 of 21 T2V-audio views and 13 of 19 T2V-silent views.
  - Weaker on T2V with audio: pos 10 in Live-Action Film (1053), Dialogue & Lip Sync (1118) and Audio Synchronization (1122); pos 11 in Architecture (1070).
  - On I2V with audio: #6 overall (1120 ±16), #2 Retail & Ecommerce (1141 ±50), #3 UIUX (1244 ±54) and Spatio-Temporal (1172 ±52).
  - Design Arena lists "HeyGen Video 1.0 (1080p, Ultraquality)" #3 on Text to Video (1334) and #4 on Image to Video (1316). — tables above; [AA T2V silent](https://artificialanalysis.ai/video/leaderboard/text-to-video?audio-output=false); [Design Arena](https://www.designarena.ai/leaderboard?tab=video&section=video&board=video)
- **MiniMax H3 (768p) ($4.80/min):**
  - #3 overall on T2V with audio (1161 ±14). Top 3 in 9 of 21 T2V-audio views, including #1 Live-Action Film (1121 ±42) and #2 in Architecture, Frontier, Multi-Scene and Spatio-Temporal.
  - #1 on T2V-Silent Complex Composition (1151 ±46, range 1-2).
  - #1 on I2V Text Rendering (1213 ±55).
  - #1 on arena.ai Image-to-Video (1495 ±5, 57,112 votes) and #8 on arena.ai Text-to-Video (1460 ±9).
  - #2 on Design Arena Multi-Image to Video (1335). — tables above; [arena.ai I2V](https://arena.ai/leaderboard/video/image-to-video); [Design Arena multi-image](https://www.designarena.ai/leaderboard?tab=video&section=video&board=multi-to-video)
- **FLUX 3 Max ($4.35/min, provisional):**
  - #5 overall on T2V with audio (1157 ±17) and #3 on T2V-Silent (1135 ±19).
  - Tops T2V-audio Retail (1161 ±56, 314 samples), T2V-Silent Text Rendering (1383 ±67, 279) and T2V-Silent Frontier (1216 ±60, 319).
  - On I2V it is #12 overall (1064 ±16) and pos 16 on I2V Human Anatomy (918 ±53).
  - #6 on Design Arena T2V (1301) and I2V (1297). — tables above
- **MiniMax H3 Max ($9.60/min, provisional):** #1 on I2V Spatio-Temporal Consistency (1194 ±52), #2 on I2V Camera Control (1164) and I2V Dialogue & Lip Sync (1166). #1 by position in several T2V categories with under 500 samples: Physics (1154), Consumer (1212), Silent Productivity (1187), Silent Retail (1172). — tables above
- **Agnes-Video-2.5 ($2.40/min):** #10 on I2V Overall (1100 ±18) and #6 on I2V-Silent Overall (1114 ±19). Pos 2 on I2V-Silent Social Media (1175 ±60, 317 samples) and Frontier (1139 ±58). — tables above
- **P-Video-2-Pro ($5.70/min, provisional):** pos 1 on T2V-audio Text Rendering (1363 ±66, 280 samples), I2V Architecture (1138 ±59, 282) and I2V-Silent Productivity (1121 ±65, 305). — tables above
- **Veo 3.1 Lite and Fast:**
  - Never in an AA top 10. Best AA positions: Veo 3.1 Lite pos 18 on I2V Lighting & Materials (1022 ±54) and pos 19 on T2V Text Rendering (1117 ±55); Veo 3.1 Fast pos 21 on T2V Lighting (1008 ±46) and T2V-Silent Text Rendering (1117 ±50).
  - Veo 3.1 (full) reaches pos 15 on T2V-Silent UIUX (1110 ±52).
  - Overall positions: T2V audio 23 (Fast) and 24 (Lite) of 31; I2V 22 (Fast) and 24 (Lite) of 29.
  - On arena.ai, Veo 3.1 Fast (Audio) is #14 on T2V (1362 ±10) and #15 on I2V (1385 ±9). On Design Arena, Veo 3.1 Lite is #20 on T2V (1173) and #21 on I2V (1181). — tables above; [arena.ai T2V](https://arena.ai/leaderboard/video/text-to-video); [Design Arena](https://www.designarena.ai/leaderboard?tab=video&section=video&board=video)

### Inferences
- **On preference evidence alone, HeyGen Video 1 and MiniMax H3 (768p) are the value picks** for most kinds of shot. Each is within the top cluster's intervals in most categories, at 7–14× less per minute than Seedance 2.5.
  - HeyGen's weak spots are sound-led categories (dialogue, audio sync) and image-to-video human anatomy.
  - MiniMax H3 (768p) is tested at 768p, below the 1080p default, and still ranks near the top.
- **FLUX 3 Max** is a strong cheap candidate for text-led and designed T2V shots (text, frontier, retail). The provisional status and low category samples mean it should be re-checked before being made a default.
- **Veo 3.1 Lite/Fast** are cheap but rank 100–300 Elo below the top cluster in most AA categories.

### Gaps
- AA prices are per minute on the creator's API. Prices on fal or other hosts, or at other resolutions, were not checked here.
- Kling 2.5 Turbo has no AA data. Its only category-less data is on arena.ai (below).

## Where does Kling 3.0, 2.5 Turbo or 4.0 rank by category?

### Takeaway
On AA, Kling 3.0 1080p (Pro) is the fixed 1000-Elo anchor. It sits mid-board in every category: position 11–28, typically 120–200 Elo below the leaders. Its best relative showings are Human Anatomy on I2V (pos 11, both boards), T2V-Silent Camera Control (pos 11, AA rank 6) and Consumer (pos 12).

Kling 3.0 Omni 1080p (Pro) is within about ±60 of 1000 in every category. Its best showing is I2V Dialogue & Lip Sync (pos 12, 1097 ±54, under 500 samples) and I2V-Silent Retail (pos 10, 1055 ±61, under 500 samples).

Kling 4.0 and Kling 2.5 Turbo are not on any AA board. Kling 4.0 appears only on Design Arena, where it ranks high: #2 on Image to Video at 1319, #8 Text to Video, #7 Multi-Image. Kling 2.5 Turbo appears only on arena.ai, in the high 20s on both boards.

### Cited Findings
- **Models AA lists.** AA's video models page lists only three Kling entries: "Kling 3.0 1080p (Pro)", "Kling 3.0 Omni 1080p (Pro)" and "Kling O1 Pro (January)". There is no Kling 4.0 or Kling 2.5 Turbo. With "Hide research previews" turned off, the I2V board gained no new models. — [AA video models](https://artificialanalysis.ai/video/models); [AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video?models=all)
- **v2.1 roster rule.** AA's v2.1 note says "Votes only count between models on the v2.1 roster, so a few models leave the leaderboard." — [AA methodology](https://artificialanalysis.ai/methodology/video)
- **Kling 3.0 1080p (Pro)** (anchor, Elo 1000) by category, position on the page (board size in brackets):

| Category | T2V+audio (31) | T2V silent (36) | I2V+audio (29) | I2V silent (33) |
|---|---|---|---|---|
| Overall | 19 (rank 19-20) | 19 (18-20) | 17 (17-19) | 19 (18-20) |
| Marketing & Advertising | 19 | 18 | 18 | 21 |
| Retail & Ecommerce | 15 | 20 | 19 | 18 |
| Live-Action Film | 13 | 17 | 19 | 14 |
| Animation & Gaming | 21 | 19 | 17 | 19 |
| Architecture & Real Estate | 19 | 17 | 19 | 19 |
| Productivity & Knowledge Work | 17 | 19 | 17 | 13 |
| UIUX & Motion Design | 26 | 25 | 23 | 19 |
| Consumer | 19 | 12 | 16 | 22 |
| Social Media & Creator Content | 20 | 21 | 18 | 20 |
| Frontier | 19 | 22 | 17 | 18 |
| Physics | 15 | 13 | 15 | 20 |
| Complex Composition | 20 | 18 | 16 | 15 |
| Human Anatomy | 18 | 12 | 11 | 11 |
| Lighting & Materials | 22 | 25 | 22 | 19 |
| Multi-Scene & Narrative | 18 | 20 | 19 | 16 |
| Camera Control | 19 | 11 | 17 | 19 |
| Text Rendering | 24 | 27 | 19 | 28 |
| Spatio-Temporal Consistency | 20 | 20 | 21 | 17 |
| Audio Synchronization | 20 | – | 17 | – |
| Dialogue & Lip Sync | 17 | – | 19 | – |

  Source: the category tables above.
- **Kling 3.0 Omni 1080p (Pro)** (Elo, page position):
  - T2V with audio: Overall 1023 ±15 (18); best Lighting & Materials 1059 ±47 (15), UIUX 1056 ±52 (24), Retail 1051 ±47 (12), Audio Sync 1040 ±48 (13); worst Live-Action 973 ±47 (17).
  - T2V silent: Overall 984 ±17 (21); best Retail 1043 ±52 (12), Lighting 1021 ±45 (21, AA rank 11 (7-14)); worst Consumer 924 ±57 (19).
  - I2V with audio: Overall 1000 ±17 (18); best Dialogue & Lip Sync 1097 ±54 (12), Architecture 1048 ±53 (15); worst Text Rendering 933 ±60 (22), Marketing 936 ±56 (24).
  - I2V silent: Overall 1019 ±18 (17); best Text Rendering 1105 ±59 (20), Consumer 1075 ±61 (16), Physics 1060 ±54 (14), Retail 1055 ±61 (10). — tables above
- **Kling O1 Pro (January)** is only on the silent boards, near the bottom: T2V-Silent Overall 890 ±18 (pos 31 of 36) and I2V-Silent Overall 866 ±19 (pos 30 of 33). By category it is pos 20–36; lowest is T2V-Silent Text Rendering 794 ±67 (pos 36). — tables above
- **Kling 4.0** is on Design Arena only:
  - Text to Video #8, 1287 (615W / 420L, 59.4%, ±3.0%, 1,035 battles).
  - Image to Video #2, 1319 (2382W / 1600L, 59.8%, ±1.5%, 3,982 battles), one point behind MiniMax H3 Max at 1321.
  - Multi-Image to Video #7, 1278 (404W / 245L, ±3.7%, 649 battles).
  - In the same Design Arena boards: Kling v3 Pro is #25 on T2V (1162), Kling O3 (Omni) #31 T2V (1126) and #20 I2V (1181), and Kling v2.6 Pro #34 T2V (1088) and #27 I2V (1138). — [Design Arena T2V](https://www.designarena.ai/leaderboard?tab=video&section=video&board=video); [Design Arena I2V](https://www.designarena.ai/leaderboard?tab=video&section=video&board=image-to-video); [Design Arena multi-image](https://www.designarena.ai/leaderboard?tab=video&section=video&board=multi-to-video)
- **Kling 2.5 Turbo** is on arena.ai only:
  - Text-to-Video: "Kling 2.5 Turbo (1080p)" #28 of 48, 1220 ±17, 2,111 votes, rank spread 24–34. Kling 2.6 Pro is #29 (1216 ±7) and Kling O1 Pro #33 (1205 ±27).
  - Image-to-Video: #27 of 48, 1276 ±13, 3,795 votes, spread 26–31. Kling 3.0 Pro is #19 (1354 ±6) and Kling 2.6 Pro #26 (1294 ±8).
  - arena.ai has no Kling 4.0 entry. — [arena.ai T2V](https://arena.ai/leaderboard/video/text-to-video); [arena.ai I2V](https://arena.ai/leaderboard/video/image-to-video)

### Inferences
- **On AA, Kling 3.0 is mid-pack everywhere and beats the top cluster in no category.** Its relative strength is human anatomy and motion. It is pos 11–12 on Human Anatomy in three of four boards and AA rank 4 on T2V-Silent Human Anatomy. Its relative weakness is text and UI/motion design (pos 19–28).
- **Kling 4.0 has a single board as evidence.** Its Design Arena results (#2 I2V) suggest it belongs in the top cluster for image-to-video. Design Arena has no categories and uses its own pool, so it can't be placed per kind of shot from public preference data.
- **Kling 2.5 Turbo** sits well below the leaders on arena.ai (about 200–275 points under #1 on both boards). There is no category evidence for it.

### Gaps
- No per-category public data exists for Kling 4.0 or Kling 2.5 Turbo on the three sites checked.
- I could not confirm whether Kling 2.5 Turbo was on an earlier AA version (v2.0) and dropped at v2.1. AA only says "a few models leave the leaderboard".

## How do the categories map to beatsheet's kinds of shot?

### Takeaway
Ten of the 18 kinds have a reasonably direct AA category: dialogue, action, contact, product, text, camera, physics, sound, consistency and stylized. Four have only a partial or proxy match: crowd, establishing, closeup and animals. Four have no matching category: long, likeness, mature and vertical. Every AA test is a 10 s, 16:9 horizontal clip with no reference-person input or adult content.

### Cited Findings
Category definitions are from the [AA methodology](https://artificialanalysis.ai/methodology/video); test format (10 s, 16:9 horizontal) from the same page.

| beatsheet kind | Closest AA category | Match | Why (AA's own wording) |
|---|---|---|---|
| dialogue | Dialogue & Lip Sync (audio boards only); secondary: Social Media & Creator Content | Direct | "Single- and multi-speaker dialogue, voiceover vs on-screen speech"; Social includes "Talking heads, podcast clips" |
| action | Human Anatomy; secondary: Physics | Direct | "Gait and locomotion … acrobatic motion" |
| contact | Human Anatomy; secondary: Complex Composition, Physics | Direct/partial | "object grasping, human interaction"; "multi-object interaction"; "material interactions" |
| crowd | Complex Composition | Partial | "multi-object interaction, counting, spatial relationships". Nothing specific to many people |
| animals | (none); Lighting & Materials mentions "hair and fur" | None / weak proxy | No animal-specific category |
| product | Retail & Ecommerce; secondary: Marketing & Advertising | Direct | "Studio product shots, product demos"; "hero product spots" |
| establishing | Architecture & Real Estate; secondary: Camera Control | Partial | "Exterior flythroughs"; "aerial" shots |
| stylized | Animation & Gaming; secondary: UIUX & Motion Design | Direct/partial | "Animated scenes, game trailers"; "abstract motion graphics". Style tags exist but have no leaderboard |
| text | Text Rendering; secondary: UIUX & Motion Design | Direct | "Short and long text, 2D layout … text on deforming surfaces"; "Kinetic typography" |
| camera | Camera Control | Direct | "close-up, aerial, POV … tracking, dolly, orbit, crane, crash zoom, whip pan and rack focus" |
| long | (none); Multi-Scene & Narrative is the nearest | None | All clips are 10 s. Multi-Scene tests "Multi-event stories, shot transitions" within a clip, not length |
| consistency | Spatio-Temporal Consistency; secondary: Multi-Scene & Narrative; I2V Overall | Direct | "Spatial coherence … occlusion and re-entry"; "identity consistency across shots"; I2V judges keeping "the people, objects, and setting of the starting image consistent" |
| likeness | (none) | None | No reference-person or real-likeness test. I2V starting-image fidelity and Design Arena "Multi-Image to Video" are the nearest public proxies |
| closeup | Camera Control (close-up shot types); secondary: Human Anatomy (facial expression) | Partial | "Shot types such as close-up"; "facial expression" |
| physics | Physics | Direct | "Mechanics, thermal effects, material interactions, fracture and deformation …" |
| sound | Audio Synchronization (audio boards only) | Direct | "Diegetic sound effects, background music and score, on- and off-screen sound" |
| mature | (none) | None | No category |
| vertical | (none) | None | Generation settings are "16:9 horizontal". Social Media is a content type, not an aspect ratio |

- **Use cases with no single beatsheet kind.** Live-Action Film ("Cinematic shots, microdrama episodes"), Consumer ("everyday stock footage and b-roll"), Productivity & Knowledge Work and Frontier don't map to one kind. They are useful as tie-breakers for a cut's overall purpose. — [AA methodology](https://artificialanalysis.ai/methodology/video)

### Inferences
- **Leaders per kind** from the tables above (T2V audio / I2V audio):
  - dialogue: Seedance 2.5 on both.
  - action and contact (Human Anatomy): Seedance 2.5 on both.
  - physics: HeyGen Video 1 is the top-ranked model on T2V (MiniMax H3 Max and FLUX 3 Max are higher but under 500 samples); Utopai X on I2V.
  - product (Retail): Seedance 2.5 is the top-ranked model on T2V (FLUX 3 Max is higher but under 500 samples); Seedance 2.5 on I2V.
  - text: Utopai X on T2V; MiniMax H3 (768p) on I2V.
  - camera: Wan 3.0 on T2V; Seedance 2.5 on I2V.
  - consistency (Spatio-Temporal): Utopai X on T2V; MiniMax H3 Max on I2V.
  - sound (Audio Sync): Gemini Omni Flash 1.1 on T2V; Seedance 2.0 on I2V.
  - stylized (Animation): HeyGen Video 1 on T2V; Seedance 2.5 on I2V.
  - establishing (Architecture): Utopai X on T2V; MiniMax H3 (768p) is the top-ranked model on I2V (P-Video-2-Pro is higher but under 500 samples).
  - crowd (Complex Composition): Wan 3.0 on T2V; Seedance 2.0 on I2V.
- **Kinds that need other evidence.** For long, vertical, likeness, mature and animals, beatsheet's ranking will have to rest on other evidence, such as model specs (max duration, aspect ratios), its own tests, or Design Arena's multi-image board for likeness.

### Gaps
- AA's per-category descriptions are example lists. The exact prompts in each category are not public, so how well "Complex Composition" stands in for crowds, or "Architecture" for establishing shots, can't be verified.
- No public board found that tests vertical (9:16) output, clips longer than 10 s, animals, real-person likeness, or mature content.
