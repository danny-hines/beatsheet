# Which video model for which shot: evidence by kind of shot (as of 2026-11-02)

Notes for the report writer:
- All leaderboard readings below were taken on 2026-11-02 unless a different date is given. Each board shows its own "as of" date.
- **Source labels.** [indep-bench] = independent benchmark or arena. [indep-review] = hands-on reviewer with no vendor sponsorship disclosed. Curious Refuge sells AI filmmaking courses but discloses no sponsorship on the reviews cited. [reseller] = a platform that sells access to several models: no stake in any one model, but a stake in "use many models". [vendor] = the model maker or a competing model maker. [vendor-adjacent] = an SEO or listicle page whose publisher sells something related.
- Nearly every hands-on comparison found was **one seed per model per prompt**. Treat every per-shot ranking as a tendency, not a measurement.
- **New models since mid-2026** that the brief didn't name: Gemini Omni Flash / Omni 1.1 Flash (Google; Veo was folded into it), Wan 3.0 (Alibaba; proprietary, unlike Wan 2.x), MiniMax H3 / H3 Max (open weights at 768p), Utopai X and HeyGen Video 1 (both post-trains of MiniMax H3), FLUX 3 / FLUX 3 Max video (Black Forest Labs), Seedance 2.5, Kling 4.0 (rolling out in October 2026), Grok Imagine Video 1.5 (listed under "SpaceXAI"), HappyHorse 1.0/1.1 (Alibaba-ATH), P-Video-2-Pro (Pruna), Agnes-Video-2.5, Hyperflow H3, MAGI-2 Preview, Muse Video (Meta), HiDream-O1-Video, Pika H3 Flex, LTX-2.5.
- **Sora is gone.** OpenAI announced on 2026-03-24 that it would discontinue Sora. The app closed on 2026-04-26 and the API on 2026-09-24 ([Engadget](https://engadget.com/ai/openai-is-shutting-down-its-sora-video-generation-app-211023358.html); [Neowin](https://www.neowin.net/amp/openai-to-shut-down-sora-app-and-apis-as-it-shifts-focus-to-coding-ai/); dates restated by [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026) and [invideo](https://invideo.io/blog/best-ai-video-model/)). Its leaderboard scores are history only.

---

## Overall leaderboards

### Takeaway
On every board, the top 5–8 models are statistically tied. Artificial Analysis (AA) puts Wan 3.0, Utopai X, MiniMax H3, Seedance 2.5, FLUX 3 Max and HeyGen Video 1 within each other's confidence intervals. The public-vote arenas (LMArena/arena.ai and Design Arena) put Gemini Omni Flash / 1.1 Flash first. AA puts Omni 1.1 Flash only 9th–11th in text-to-video and 14th in image-to-video, which is the biggest disagreement between boards. On every board, Veo 3.1, Kling 3.0, PixVerse, Vidu, LTX, Runway and Luma now sit a clear tier below.

### Cited Findings

**Artificial Analysis, text-to-video with audio (AA-Video-T2V v2.1, read 2026-11-02)** [indep-bench]. Elo comes from blind pairwise votes by "validated private evaluators". Kling 3.0 1080p Pro is anchored at 1000. Confidence intervals are 95%, roughly ±14–18. Price is per minute of video on the maker's API at benchmark settings (1080p where offered) — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video):

| Rank range | Model | Elo (95% CI) | $/min (≈$/s) |
|---|---|---|---|
| 1–3 | Wan 3.0 (Alibaba) | 1175 (1161–1189) | $12.00 (0.20) |
| 1–5 | Utopai X | 1166 (1151–1181) | No API |
| 2–6 | MiniMax H3 768p (open weights) | 1161 (1147–1175) | $4.80 (0.08) |
| 2–7 | Seedance 2.5 | 1157 (1143–1171) | $34.12 (0.57) |
| 2–8 | FLUX 3 Max (fal/BFL) | 1157 (1140–1174) | $4.35 (0.07) |
| 2–8 | HeyGen Video 1 | 1156 (1142–1170) | $2.40 (0.04) |
| 3–9 | MiniMax H3 Max (fal) | 1149 | $9.60 (0.16) |
| 6–9 | FLUX 3 | 1144 | $17.40 (0.29) |
| 7–11 | Seedance 2.0 | 1136 | $22.45 (0.37) |
| 9–11 | Gemini Omni Flash 1.1 | 1128 | $9.12 (0.15) |
| 9–11 | P-Video-2-Pro (Pruna) | 1125 | $5.70 (0.10) |
| 12–13 | Agnes-Video-2.5 | 1068 | $2.40 |
| 12–14 | Grok Imagine Video 1.5 | 1059 | $15.00 (0.25) |
| 13–16 | HappyHorse-1.1 | 1050 | $10.80 |
| 14–17 | MAGI-2 Preview (Sand.ai) | 1044 | — |
| 14–18 | Wan 2.7 | 1037 | $9.00 |
| 17–18 | Kling 3.0 Omni 1080p Pro | 1023 | $8.40 (0.14) |
| 19–20 | Kling 3.0 1080p Pro (anchor) | 1000 | $10.08 (0.17) |
| 19–21 | Grok Imagine 1.5 Lite | 991 | $8.40 |
| 20–21 | PixVerse V6 | 984 | $6.90 |
| 22–25 | Veo 3.1 / Veo 3.1 Fast | 962 / 958 | $24.00 (0.40) / $7.20 (0.12) |
| 22–26 | Veo 3.1 Lite | 953 | $4.80 |
| 23–27 | LTX-2.5 Fast / Pro (open) | 947 / 944 | $7.80 / $10.20 |
| 25–27 | Vidu Q3 Pro | 936 | $7.20 |
| 28–31 | Vidu Q3 Turbo; LTX-2.3 Pro/Fast; Boreal | 916; 885/838; 833 | $3.90; $4.80/$3.60; $2.69 |

- **AA text-to-video, silent (top five only; the FAQ text gives no full table).** HeyGen Video 1 1143, MiniMax H3 Max 1140, FLUX 3 Max 1135, Wan 3.0 1133, Utopai X 1130. Best open weights: MiniMax H3 768p 1120, LTX-2.5 Fast 929 — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video).
- **AA image-to-video with audio (AA-Video-I2V v2.1, read 2026-11-02)** — [AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video):
  - Seedance 2.5: 1153 (1136–1170), ranks 1–2
  - Utopai X: 1146, ranks 1–3
  - Seedance 2.0: 1136, ranks 2–5
  - MiniMax H3 768p: 1128
  - Hyperflow H3: 1124 ($9.00/min)
  - HeyGen Video 1: 1120
  - P-Video-2-Pro: 1119
  - MiniMax H3 Max: 1117
  - Wan 3.0: 1111
  - Agnes-Video-2.5: 1100
  - FLUX 3: 1071
  - FLUX 3 Max: 1064
  - Grok Imagine 1.5: 1052
  - Gemini Omni Flash 1.1: 1046
  - HappyHorse-1.1: 1037
  - Kling 3.0 Pro: 1000 (anchor)
  - Kling 3.0 Omni: 1000
  - PixVerse V6: 959
  - Veo 3.1: 957
  - Veo 3.1 Fast: 937
  - Vidu Q3 Pro: 930
  - Veo 3.1 Lite: 929
  - LTX-2.5 Fast: 918
- **AA image-to-video, silent (top five only).** Utopai X 1155, Seedance 2.5 1128, MiniMax H3 Max 1122, Bach 1.0 Pro 1120, Hyperflow H3 1118 — [AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video).
- **AA video editing.** Wan 3.0 leads at 1196 Elo — [AA video editing](https://artificialanalysis.ai/video/leaderboard/video-editing); [AA on X](https://x.com/ArtificialAnlys/status/2095349174799888760?lang=en).
- **AA per-category boards exist.** AA's "refreshed Text to Video taxonomy measures 10 capabilities and 10 use cases, each with its own leaderboard." In AA's 2026-09-30 launch analysis, Utopai X came "first in Audio Synchronization and Physics, and second in Lighting & Materials and Camera Control" — [AA on X](https://x.com/ArtificialAnlys/status/2105343646325428384). Secondary coverage says the Audio Synchronization lead was narrow, ahead of Gemini Omni Flash 1.1 and Seedance 2.5, and that dialogue and lip sync are scored as a separate category — [Utopai blog](https://www.utopaistudios.com/en/blog/utopai-x-ai-video-model-filmmaking) [vendor]. I could not read the per-category tables themselves (see Gaps).
- **AA rescaled its boards in summer 2026.** Older readings, such as invideo's August figures (Omni Flash 1245, MiniMax H3 1242, Seedance 2.0 1225, Kling 3.0 1113, Veo 3.1 1098), are on a different scale and can't be compared with v2.1 numbers — [invideo](https://invideo.io/blog/best-ai-video-model/) [reseller]; "arena rankings were reset in summer 2026" — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026) [vendor-adjacent]. Invideo also notes that in August Omni Flash and MiniMax H3 were three points apart, "within weekly noise".

**LMArena (now arena.ai), text-to-video (page date 2026-09-21; 718,577 votes; 48 models)** [indep-bench]. Public crowd votes. The page doesn't say what confidence level its ± intervals use — [arena.ai T2V](https://arena.ai/leaderboard/text-to-video):
- 1: Gemini Omni 1.1 Flash, 1516 ±15 (rank spread 1–4)
- 2: gemini-omni-flash, 1513 ±9
- 3: FLUX 3 Video, 1493 ±17 (preliminary)
- 4: Grok Imagine Video 1.5, 1492 ±18 (preliminary)
- 5: Seedance 2.0 720p, 1479 ±8
- 6: Wan 3.0, 1476 ±13
- 7: Seedance 2.5 720p, 1474 ±9
- 8: MiniMax H3, 1460 ±9
- 9: Muse Video (Meta), 1456 ±15
- 10: HappyHorse 1.0, 1427
- 11: Sora 2 Pro, 1368 (discontinued)
- 12–15: Veo 3.1 variants, 1358–1364
- 17: Sora 2, 1343
- 18: Grok Imagine Video 720p, 1342
- 20: Wan 2.7, 1337
- 21: Wan 2.6, 1327
- 26: PixVerse V5.6, 1240
- 27: Runway Gen-4.5, 1225
- 28: Kling 2.5 Turbo, 1220
- 29: Kling 2.6 Pro, 1216
- 31: Luma Ray3, 1206
- 32: Hailuo 2.3, 1206
- 33: Kling O1 Pro, 1205
- 38: HunyuanVideo 1.5, 1169
- 41: LTX-2 19B, 1154
- 42: Wan 2.2 A14B, 1132

Kling 3.0 does not appear on this text-to-video board.

**LMArena image-to-video (page date 2026-09-21; 2.08M votes)** — [arena.ai I2V](https://arena.ai/leaderboard/image-to-video):
- 1: MiniMax H3, 1495 ±5 (57k votes)
- 2: Gemini Omni 1.1 Flash, 1488 ±11
- 3: Wan 3.0, 1480 ±11
- 4: Seedance 2.5, 1477 ±7
- 5: Seedance 2.0, 1475 ±7
- 6: gemini-omni-flash, 1465 ±6
- 7: HiDream-O1-Video-1.0, 1456 (preliminary)
- 8: Grok Imagine 1.5, 1456 ±4
- 9: FLUX 3 Video, 1449
- 10: HappyHorse 1.0, 1442
- 11: Wan 2.7, 1428
- 13–17: Veo 3.1 variants, 1372–1398
- 18: Vidu Q3 Pro, 1363
- 19: Kling 3.0 Pro, 1354
- 25: PixVerse V5.6, 1299
- 37: Luma Ray3, 1226
- 40: HunyuanVideo 1.5, 1198
- 45: LTX-2 19B, 1159
- 47: Runway Gen-4 Turbo, 1052

**Design Arena video board (updated 2026-11-02 08:07 UTC; top 15 of 36 visible)** [indep-bench] — [Design Arena](https://www.designarena.ai/leaderboard/video):
- 1: Gemini Omni 1.1 Flash, 1360 (3,993 battles)
- 2: Gemini Omni Flash, 1342
- 3: HeyGen Video 1.0 1080p Ultraquality, 1334 (858 battles, ±3.1%)
- 4: Wan 3.0, 1321
- 5: P-Video-2-Pro, 1310
- 6: FLUX 3 Max, 1301
- 7: Pika H3 Flex, 1288
- 8: Kling 4.0, 1287 (1,035 battles)
- 9: FLUX 3 Video, 1285
- 10: MiniMax H3 Max, 1277
- 11: MiniMax H3, 1276
- 12: Seedance 2.5, 1254
- 13–15: Seedance 2.0 / 2.0 Fast / 2.0 Mini, 1250 each

**Design Arena's own write-up on Omni Flash** — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/):
- When it took #1, it led "by 102 Elo points".
- About $0.10/s against about $0.30/s for Seedance 2.0, and about 2.5× faster.
- It follows prompts on 81% of generations, against a 63% average across models.

**LLM Stats (as of 2026-10-08).** Lists Kling v3 first in text-to-video at 1934, then Happy Horse 1.0 at 1816 and Seedance 2.0 Fast at 1747. This scale and ordering don't match any primary board, so treat it as unreliable — [LLM Stats](https://llm-stats.com/leaderboards/best-ai-for-video-creation).

**Academic benchmarks** [indep-bench, research]:
- VBench-2.0 is a 2025 paper. It found Sora strong on human fidelity and creativity but weak on controllability and physics. I found no 2026 update covering current commercial models — [VBench-2.0](https://arxiv.org/pdf/2503.21755).
- The Physics-IQ boards in late 2026 are led by research and world models (Cosmos3-Super, Magi-1), not by the commercial generators above. The "Verified" variant reshuffles ranks — [Physics-IQ](https://github.com/google-deepmind/physics-iq-benchmark); [Cosmos 3 paper](https://arxiv.org/pdf/2606.02800).

**Model status:**
- **Kling 4.0.** Rolled out in stages: Flash first, the full model during October 2026. Announced features (not verified) are 3–30 s clips, up to ten keyframes, 4K, and stereo audio with lip sync — [gradually.ai](https://www.gradually.ai/en/ai-models/kling-4-0/); [PixVerse blog](https://pixverse.ai/en/blog/kling-4-release-date) [vendor]. Not yet on AA or LMArena; on Design Arena only.
- **Veo and Omni.** Veo was folded into Gemini Omni, and Veo 3.1 remains on the Gemini API and Vertex — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026). Curious Refuge says Omni "is not Veo 4" — [Curious Refuge](https://curiousrefuge.com/blog/google-omni-review) (search snippet only; the page didn't load in full).
- **Shared base.** HeyGen Video 1 and Utopai X are both post-trains of MiniMax H3 — [orcarouter](https://www.orcarouter.ai/blog/heygen-video-1-launch) [reseller]; [AA on X](https://x.com/ArtificialAnlys/status/2105343643251032304).

### Inferences
- **The top of the AA board is a statistical tie.** On AA T2V, Wan 3.0 (1175) and the #6 model, HeyGen Video 1 (1156), differ by 19 Elo, about a 53/47 head-to-head preference, and their CIs overlap. Any ranking among the top six should be treated as a tie. The real gaps are tiers:
  - Wan 3.0 against Kling 3.0 (175 points) is about a 73% expected win rate.
  - Wan 3.0 against Veo 3.1 (213 points) is about 77%.
  - (These win rates come from the Elo formula E = 1/(1+10^(-d/400)).)
- **Who ranks Omni depends on who votes.** Gemini Omni Flash is #1 with public voters (LMArena, Design Arena), but only 9th–11th with AA's validated private evaluators in T2V and 14th in I2V. Design Arena's own analysis credits Omni's lead to prompt adherence and fundamentals rather than raw polish. A ranking for beatsheet should treat Omni as top-tier for prompt adherence and drafts, not as the best-looking final.
- **Three of the top six AA T2V entries derive from MiniMax H3** (MiniMax H3, Utopai X, HeyGen Video 1, plus H3 Max just below). So the H3 base itself is frontier-level, and HeyGen's post-train gives about the same quality at $0.04/s.
- **Older names have fallen behind.** Veo 3.1, Kling 3.0, Runway Gen-4.5, Luma Ray3, PixVerse and Vidu are no longer at the frontier on any blind board. Their remaining case is specific features: 4K, camera presets, speed, multi-shot.

### Gaps
- I couldn't read AA's per-category leaderboards (10 capabilities × 10 use cases); only the Utopai X launch post's partial placements were visible. These boards would give direct, blind, per-shot-type rankings (Physics, Audio Sync, Camera Control, Lighting & Materials, dialogue and lip sync, and probably anime and product use cases). **That is the single most valuable next fetch**, probably by browsing AA with the category filter, since WebFetch only returned the "Overall" view.
- I couldn't get the full silent T2V and I2V tables from AA (top five only), Design Arena's ranks 16–36 or its I2V and multi-image boards, or a dated 2026 VBench or VideoPhy-2 board covering commercial models.
- Kling 4.0 has no AA or LMArena score yet. Sora's scores are historical.

---

## dialogue

### Takeaway
No blind board for lip sync was accessible. The hands-on evidence is thin and conflicting. Seedance (2.0 more than 2.5) and Wan 3.0 come out best in head-to-head tests. Purpose-built options are HeyGen Video 1 (dialogue generated in the same pass, very cheap) and HappyHorse 1.1 (multilingual). Kling 3.0 is marketed as the dialogue leader, but independent testers find its lip sync inconsistent.

### Cited Findings
- **Atlas Cloud, 30-second dialogue-and-fight scene, test date 2026-10-26** [reseller; ±0.5 per score]. "Voice and lip sync" scores: Seedance 2.5 8.0, Wan 3.0 7.5, Kling 4.0 7.0. Failures seen:
  - Kling 4.0: "Voices change mid-scene."
  - Seedance 2.5: misheard "Trick" as "Trip".
  - Wan 3.0: dialogue "clean, in sync, and consistent".
  
  Source: [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Fuser, 2026-10-02** [reseller]. Wan 3.0 and Seedance 2.5 each delivered a spoken line in one take in the potter test. In the photoreal-woman start-frame test, Wan delivered the line at 2.9–4.2 s, while Seedance refused the image as a possible real person — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **Curious Refuge on Seedance 2.0 (Feb 2026)** [indep-review]. Lip sync is built in, but "super robotic", with weak micro-expressions. It still beat Kling 3.0 on lip sync — [Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review).
- **Curious Refuge on Seedance 2.5** (reported second-hand by DomoAI, which sells a competing integration). The reviewer reportedly preferred 2.0 for lip sync and called 2.5 "a 0.5 bump" — [DomoAI](https://domoai.app/zh-hant/blog/seedance-2-5-vs-2-0).
- **Curious Refuge on Kling 3.0** [indep-review]. Lip sync "doesn't always hit the mark", facial likeness drifted, and it feels "more like an R&D tool" — [Curious Refuge Kling 3.0](https://curiousrefuge.com/blog/kling-3-ai-video-generator-review) (via search summary). Vendor-style pages make the opposite claim: three or more speakers, five languages — [ugcvids/higgsfield-type listicles via search](https://higgsfield.ai/blog/5-Best-AI-Video-Models-2026-Tested-Compared) [reseller].
- **Curious Refuge on Grok Imagine 1.5 (Aug 2026)** [indep-review]. Dialogue timing "doesn't always make sense". Performances were less expressive than Seedance's, and voice references sounded like audiobook narration — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review).
- **HeyGen Video 1 (launched late Sept/Oct 2026)** [vendor/reseller]. Generates dialogue, room tone and effects in the same pass as the picture, in 5–15 s scenes at 480p–2K, "from $0.01 a second". It is built on MiniMax H3 — [orcarouter](https://www.orcarouter.ai/blog/heygen-video-1-launch). Sources disagree on the launch date: HeyGen's help page says 2026-09-30, Dealroom says it was announced 2026-10-22 — [Dealroom](https://dealroom.co/news/165591-heygens-first-general-purpose-video-model-tops-artificial-analysis-silen/).
- **HappyHorse 1.1.** Lip-synced speech in seven languages "per most reporting" (EN, Mandarin, Cantonese, JA, KO, DE, FR). invideo calls it best for multilingual dialogue, though 1.0 looks better silent — [invideo](https://invideo.io/blog/best-ai-video-model/) [reseller].
- **Veo 3.1** is "weak on short speech segments (per Google)" — [invideo](https://invideo.io/blog/best-ai-video-model/).
- **Seedance 2.5** lists 11 speech languages — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5). **MiniMax H3** generates dialogue in up to 11 languages — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review).

### Inferences
Ranked shortlist (provisional):
1. Wan 3.0: clean, in sync, accepts photoreal people, cheap ([Atlas](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test), [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5)).
2. Seedance 2.5 / 2.0: best scored, but refuses real faces and is expensive.
3. HeyGen Video 1: purpose-built and $0.04/s on AA, but no independent lip-sync test found.
4. HappyHorse 1.1: for non-English.
5. Kling 4.0 / 3.0: multi-speaker syntax, but drifting voices and lip sync.

Grok 1.5 and Veo 3.1 rank lower.

For a still of a real person who must talk, Seedance is out (see likeness). Wan 3.0 or HeyGen are the default candidates.

### Gaps
- No blind lip-sync leaderboard was readable; AA scores dialogue and lip sync as a separate category, but I couldn't get the table.
- No independent test of HeyGen Video 1, HappyHorse 1.1 or Omni Flash on lip sync.
- No test of audio-driven lip sync (supplying your own voice file) across models.

---

## action

### Takeaway
Seedance (2.0 and 2.5) is the consistent winner on believable fast motion and impact. Kling 4.0 is the one that moves the camera around the action. Wan 3.0 covers the beats but hits lack weight. MiniMax H3 and Grok Imagine 1.5 are weakest on large action.

### Cited Findings
- **SandBase, skateboard ollie with tracking and half orbit, 2026-10-23** [reseller; one seed]. Kling 4.0 was "the only model whose camera visibly orbited the rider". Kling 4.0, Kling 3.0 Pro, Seedance 2.5 and Wan 3.0 all landed the ollie; Veo 3.1 didn't. Failures:
  - Seedance 2.5: ollie late (about 3.5 s), no orbit, "heavy motion blur appeared on the rider's arms".
  - Kling 4.0: "two unexplained human shadows" entered the frame.
  - Kling 3.0 Pro: a green lens-flare blob.
  - Veo 3.1: rode along the curb instead of jumping.
  
  Source: [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Atlas Cloud fight test** [reseller]. "Fight impact" scores: Seedance 2.5 7.5, Kling 4.0 6.5, Wan 3.0 5.5. Failures:
  - Kling 4.0: soft fight contact; trident lunge mostly skipped; door fight compressed.
  - Seedance 2.5: dropped the stair brawl and the lamp-room clash.
  - Wan 3.0: plenty of sparks but hits lack weight.
  
  Source: [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Curious Refuge on Seedance 2.0** [indep-review]. Movement "feel[s] believable rather than floaty"; running, driving and falling read with weight — [Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review).
- **Curious Refuge on MiniMax H3** [indep-review]. Action was its weakest area: "large-scale action produced artifacts and movement that broke the illusion" — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review).
- **Curious Refuge on Grok Imagine 1.5** [indep-review]. "Strange movement and unrealistic interactions"; Seedance was better "across nearly every action test" — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review).
- **Design Arena's Omni Flash analysis.** Generations flagged as jerky won 65.9% against 71.1% for smooth ones. Their framing is that Omni is strong on motion fundamentals — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/).
- **Kling 3.0 Motion Control** is recommended for choreographed action because it copies movement from a reference video you film yourself — [Screenweaver](https://screenweaver.ai/blog/best-ai-video-model-anime) [vendor-adjacent].

### Inferences
Ranked shortlist:
1. Seedance 2.5 / 2.0: weight and impact; watch for arm motion blur and skipped beats.
2. Kling 4.0: when the camera must orbit or track; slow, with occasional stray figures.
3. Kling 3.0 Pro: the value pick for follow-cam, 15 s max.
4. Wan 3.0: covers every beat cheaply, but soft impacts.

Avoid MiniMax H3, Grok 1.5 and Veo 3.1 for big action. For choreography that has to be exact, Kling Motion Control or a "drive" route (copying movement from a real clip, as beatsheet's SCAIL-2 and Wan Animate do) beats prompting.

### Gaps
- No blind action-category board was read.
- No multi-seed test, and no test of FLUX 3, HeyGen Video 1, Utopai X or Omni on action.
- The brief's example failure ("Kling 2.5 smears fast limbs") applies to an outdated model; the current equivalent observed was Seedance 2.5's arm motion blur.

---

## contact

### Takeaway
Physical contact between people is the least-tested category. The only evidence is from fight scenes, where every model softened contact, and older dance tests, where none could perform the prompted dance. Seedance is the least bad on weight; Kling 4.0 and Wan 3.0 produce "soft" contact.

### Cited Findings
- **Atlas fight test.** Kling 4.0's "lamp-room clash lacks weight" and the "trident lunge… is mostly skipped". Wan 3.0's "hits lack weight". Seedance 2.5 skipped two clashes entirely — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test) [reseller].
- **Curious Refuge on MiniMax H3.** Trails Seedance "in believable motion and physical interaction" — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review).
- **Curious Refuge on Grok Imagine 1.5.** "Unrealistic interactions" — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review).
- **CalMatters and The Markup, January 2026** (Sora, Veo, MiniMax, Kling; now older versions) [indep-review, journalism]. Videos looked lifelike, but none performed the prompted dance. Problems included inconsistent appearance from frame to frame, abnormal movement, and "too many limbs" — [CalMatters](https://calmatters.org/economy/technology/2026/01/ai-sucks-at-dancing-tests-show/); [The Markup method](https://themarkup.org/show-your-work/2026/01/21/how-we-tested-ai-generated-dance-videos).

### Inferences
Provisional ranking: (1) Seedance 2.5 / 2.0; (2) Kling 4.0; (3) Wan 3.0; then MiniMax H3 and Grok 1.5. For hugs, handshakes or a punch that lands, a drive or motion-copy route from a real reference clip is likely more reliable than any text prompt. That is an inference from the weakness of prompt-only results.

### Gaps
No test of hugs, handshakes or couple dances on current models (Omni, Wan 3.0, FLUX 3, HeyGen, Kling 4.0) was found. This needs beatsheet's own tests.

---

## crowd

### Takeaway
The evidence is thin and dated. An early-2026 test favoured Veo 3 and then Seedance for crowd behaviour. Seedance 2.0 at 720p loses detail in crowds. No current-generation crowd test was found.

### Cited Findings
- **Pulze, Feb 2026, ten models** [vendor-adjacent]. Veo 3 was the most convincing for crowd behaviour, with Seedance second. Runway Gen 4, Wan 2.2, MiniMax, Vidu Q1 and Luma Ray 2 were "too static, noisy, or cinematic" or distorted figures — [Pulze](https://www.pulze.io/blog/ai-video-model-comparison).
- **Curious Refuge on Seedance 2.0.** "At 720p, crowds lack detail and would be hard for an upscaler to fix"; background characters had little detail — [Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review).
- **Artlist-based test (breakdancing-nun prompt).** Sora 2's crowd reacted naturally but "in near-perfect unison" — [aitoolssme](https://www.aitoolssme.com/blogs/best-ai-video-models-2026) [vendor-adjacent; Sora now discontinued].
- **SandBase.** Kling 4.0 added "two unexplained human shadows" in an action shot — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/). The 30-second night-market take included a queue and a crowd; Kling 4.0 hit its beats, while Wan 3.0 was late.

### Inferences
Provisional: favour models with native 1080p–2K output for crowds (Wan 3.0 1080p, MiniMax H3 / HeyGen up to 2K, Veo 3.1 4K) over 720p-capped Seedance on Dreamina. That is an inference from Curious Refuge's resolution point, not a crowd test.

### Gaps
No 2026-H2 crowd comparison. AA's use-case boards may include a relevant category; not read.

---

## animals

### Takeaway
No independent comparison with a verdict was found. One image-to-video test (snow leopard leap) published clips without declaring a winner. This needs beatsheet's own tests.

### Cited Findings
- **EmpirioLabs, 2026-10-05** [reseller]. Seedance 2.5, Kling 3.0 Turbo, MiniMax H3 and Wan 3.0 animated the same 9:16 snow-leopard-leap frame. The author declares no winner and lists what to watch: how the leopard lands and keeps its shape — [EmpirioLabs](https://empiriolabs.ai/blog/seedance-2-5-kling-minimax-h3-wan-3-0-image-to-video-test).
- **Atlas fight test.** Seedance 2.5 drifted a costumed pony character "rounder and more cartoonish, closer to a toy pony", while Kling 4.0 had the best character fidelity — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).

### Inferences
Until tested, rank animals by the general physics and consistency evidence: Seedance and Utopai X for motion, Kling 4.0 for keeping a specific pet's look. Low confidence.

### Gaps
No pet- or creature-specific test with results.

---

## product

### Takeaway
For keeping shape, label and logo, image-to-video from a product photo is the norm. Seedance 2.5 and Wan 3.0 tie on keeping the main label sharp, and both garble the smallest print. Kling 3.0 shows slight lettering distortion. Veo 3.1 invents lettering. Omni's prompt adherence suits product prompts, and Seedance 2.5's large reference capacity suits multi-angle products.

### Cited Findings
- **Fuser** [reseller]:
  - Test 3, hand-wash bottle start frame: a tie. Both held the push-in and kept the label sharp; both garbled the smallest print.
  - Test 1, vase dolly-in: Wan narrowly; Seedance made a bolder push-in but lost the dust.
  
  Source: [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **MindStudio** [reseller; search snippet, not read in full]. Seedance 2.5 gave the cleanest people and product shots; Kling 3.0 was close at a lower price, with slight lettering distortion — [MindStudio](https://www.mindstudio.ai/blog/seedance-kling-minimax-video-model-comparison).
- **Exemplary AI, five product clips on Veo 3.1 Fast** [vendor-adjacent]. Good reflections and full-size subjects, but "a watch came back with invented lettering on the dial"; state "no text" explicitly. They recommend Seedance 2.5 with product photos as references, and Veo 3.1 for 4K product shots. Seedance 2.5 put a small sneaker tiny in an empty frame, so state the camera distance — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026).
- **Separate review summary.** Wan 3.0 "followed product image-to-video instructions more closely" than Seedance 2.5 — [gptproto](https://gptproto.com/blog/wan-3-0-vs-seedance-2-5) (search summary) [vendor-adjacent].
- **Design Arena.** Omni Flash's prompt adherence (81% against a 63% average) is linked to strong results in "product-focused" videos — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/).
- **Reference capacity:**
  - Seedance 2.5: up to 30 images, 10 videos, 10 audio
  - Wan 3.0: 10 images, 5 videos, 5 audio
  - MiniMax H3: 9 images, 3 videos, 3 audio
  
  Sources: [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5); [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review).
- **Higgsfield's claim** that Hailuo 2.3 keeps logos and on-screen text sharp is the vendor's own and concerns an older model — [Higgsfield](https://higgsfield.ai/blog/5-Best-AI-Video-Models-2026-Tested-Compared) [reseller].

### Inferences
Ranked shortlist:
1. Wan 3.0: label held, literal, cheap.
2. Seedance 2.5: best polish and most references; expensive.
3. Gemini Omni Flash: prompt adherence; 720p in Flow.
4. Kling 3.0: value, minor lettering drift.
5. Veo 3.1: reflections and 4K, but invents text.

Small print will be garbled by everything, so plan a composited label or packshot plate for legal text.

### Gaps
No multi-seed logo-fidelity test, and no test of FLUX 3, HeyGen or Utopai X on products.

---

## establishing

### Takeaway
There is little direct evidence. Design Arena found Omni Flash notably weak on landscapes. Veo 3.1 (4K, reflections and material detail) is the usual "hero / cinematic" recommendation. Utopai X placed second in AA's Lighting & Materials category.

### Cited Findings
- **Design Arena on Omni Flash.** Win rate drops 14.5 percentage points on landscape prompts (3.5% of prompts); scenes "look more animated than picturesque" — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/).
- **Exemplary AI** recommends Veo 3.1 for cinematic and hero shots and 4K, and praises it for reflections and material detail — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026) [vendor-adjacent].
- **AA category result.** Utopai X was second in Lighting & Materials — [AA on X](https://x.com/ArtificialAnlys/status/2105343646325428384).
- **SandBase.** Veo 3.1 was 3–7× faster than the others and offers 4K, but is capped at 8 s. Wan 3.0 rendered "late afternoon rather than sunset" — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Resolution:**
  - MiniMax H3: native 2K
  - Veo 3.1: 4K ($0.60/s per invideo)
  - Seedance 2.5 on Dreamina: reportedly capped at 720p
  
  Sources: [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review); [invideo](https://invideo.io/blog/best-ai-video-model/); [DomoAI](https://domoai.app/zh-hant/blog/seedance-2-5-vs-2-0).

### Inferences
Provisional ranking:
1. Veo 3.1: 4K, materials; it doesn't need people or action, which is where it's weak.
2. Utopai X (no API) or Seedance 2.5.
3. MiniMax H3 / H3 Max: native 2K.
4. Wan 3.0.

Avoid Omni Flash for landscapes. Drone and establishing shots are also where 4K and 2K matter most, which favours Veo 3.1 and MiniMax H3.

### Gaps
No direct landscape, city or drone comparison found. AA's use-case leaderboards likely contain one.

---

## stylized

### Takeaway
Nearly all the evidence is vendor or affiliate blogs. The recurring picks are Seedance 2.0/2.5 for anime look and shot-plan adherence, Wan 2.7 (and probably 3.0) for keeping line work flat and inked, and Kling 3.0 for anime action. Veo leans photoreal. Omni Flash handles stylized 3D animation, per Design Arena.

### Cited Findings
- **Seedance.** Seedance 2.0 is called "the fast anime choice" — [OpenArt](https://openart.ai/blog/best-ai-video-generators-for-anime/) [reseller]. It is also called "the strongest mainstream pick for anime aesthetics" — [Cinemagiq](https://cinemagiq.com/resources/ai-video-generator-anime) [vendor-adjacent]. Seedance 2.5 shows "strong anime style with good shot-plan adherence" — [Piclumen](https://www.piclumen.com/blog/4-best-ai-animation-models/) [vendor-adjacent].
- **Wan.** Wan 2.7 "most reliably keeps anime looking like anime" — [OpenArt](https://openart.ai/blog/best-ai-video-generators-for-anime/). It keeps "line work inked, shading flat" — [Luma blog](https://lumalabs.ai/news/ai-anime-video-generators-creators) [vendor, a competitor]. Open weights allow fine-tuning to a house style.
- **Kling 3.0** offers "the smoothest sakuga action, camera orbits, impact frames"; it was ranked the strongest overall anime pick in April 2026 — [Infer](https://tryinfer.com/best/ai-models-for-anime-video) [vendor-adjacent].
- **Veo 3.1** leans photorealistic rather than traditional anime — [Luma blog](https://lumalabs.ai/news/ai-anime-video-generators-creators) [vendor].
- **PixVerse V4.5** is named best for anime and 2D by one listicle, though it ranks low on AA — [Techsy](https://techsy.io/en/blog/best-ai-video-models) [vendor-adjacent].
- **Design Arena.** Omni Flash "handles everything from photorealistic footage to stylized 3D animation without losing prompt detail" — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/).
- **Atlas.** Seedance 2.5 pushed a costume character toward cartoonish, which is unwanted drift — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Moderation false positive.** A creator reports that an anime duel was flagged as "graphic violence" (headline only, not read) — [HackerNoon](https://hackernoon.com/ai-video-generators-flagged-my-anime-duel-as-graphic-violence-it-was-a-cartoon).

### Inferences
Provisional ranking:
1. Seedance 2.5 / 2.0: anime.
2. Wan 3.0 / 2.7: flat 2D and house style, with fine-tuning via open Wan 2.x.
3. Kling 3.0 / 4.0: anime action.
4. Omni Flash: stylized 3D.

Claymation and painterly styles: no evidence found. Best practice per these sources is a styled keyframe plus image-to-video.

### Gaps
No independent blind anime or 2D board was read (AA likely has an "animation" use case). Claymation and painterly styles are untested.

---

## text

### Takeaway
Legible text in frame is still unreliable everywhere. Gemini Omni Flash is the only model with positive independent evidence (Design Arena). Veo 3.1 invents lettering. Kling 3.0 distorts lettering slightly. Seedance 2.5 and Wan 3.0 garble small print. Kling 4.0 and Wan 3.0 render background signs as nonsense glyphs.

### Cited Findings
- **Design Arena.** Omni Flash text "stays readable where other models produce smeared or shifting letterforms" — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/).
- **SandBase.** In both 30-second clips (Kling 4.0 and Wan 3.0), "neon signs were mostly pseudo-Chinese text that a reader would recognize as nonsense" — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Fuser.** Seedance 2.5 and Wan 3.0 both garbled the smallest label print — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **Veo 3.1 Fast** invented lettering on a watch dial — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026). On-screen text "often comes out wrong" for Veo 3.1, and OpenArt recommends adding titles in an editor — [OpenArt](https://openart.ai/blog/best-ai-video-generators/) [reseller].
- **Seedance.** On-screen text was unreliable before 2.5 — [invideo](https://invideo.io/blog/best-ai-video-model/). Seedance 2.5 respected "no readable text" on neon signs — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026).
- **Kling 3.0** shows slight lettering distortion — [MindStudio](https://www.mindstudio.ai/blog/seedance-kling-minimax-video-model-comparison) (snippet).
- **Academic.** The AVGen-Bench paper reports low text-rendering scores for text-to-audio-video models (per-model results not checked) — [AVGen-Bench](https://arxiv.org/pdf/2604.08540).

### Inferences
Ranked shortlist: (1) Gemini Omni Flash / 1.1 Flash; (2) Seedance 2.5, which at least obeys "no text"; then everything else. For beatsheet: render text as a coded overlay (kit:Title or a scene) rather than asking a video model for it, and prompt "no readable text" on generated plates. That matches the advice from Exemplary and OpenArt.

### Gaps
No legibility test of FLUX 3 video (BFL's image models are known for text, but I found no video evidence), Wan 3.0 or HeyGen with deliberate text.

---

## camera

### Takeaway
Kling 4.0 is the only model shown to perform a requested orbit, and it hit timed camera beats in a 30-second take. Seedance makes bolder push-ins but defaults to frontal framing. Utopai X placed second in AA's Camera Control category; the leader was not visible. PixVerse sells preset camera controls. Veo 3.1 and Wan 3.0 ignored a requested orbit.

### Cited Findings
- **SandBase.** Kling 4.0 was "the only model whose camera visibly orbited the rider". Seedance 2.5's camera "stayed frontal"; Veo 3.1 followed from behind; Wan 3.0 gave a side track; Kling 3.0 Pro had no orbit. In the 30-second handheld take with four timed camera beats, Kling 4.0 hit all four (slightly early); Wan 3.0 was late on two — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Fuser.** Seedance 2.5 "made a bolder push-in" in the dolly test, and the article recommends it "when a bolder camera move matters most" — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **AA category.** Utopai X was second in Camera Control — [AA on X](https://x.com/ArtificialAnlys/status/2105343646325428384).
- **PixVerse V6** offers "20+ camera controls" (vendor feature); it is weak with audio — [invideo](https://invideo.io/blog/best-ai-video-model/).
- **Video-reference camera copying.** MiniMax H3 can take "camera movement from a video" reference — [search summary of H3 reviews](https://www.virse.ai/blog/minimax-h3-reddit-review) [vendor-adjacent]. Seedance has video-reference style replication — [invideo](https://invideo.io/blog/best-ai-video-model/).
- **Curious Refuge** found multi-shot transitions "unnatural" in Grok 1.5 — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review). MiniMax H3's edits felt less natural than Seedance's — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review).

### Inferences
Ranked shortlist:
1. Kling 4.0: orbits and timed moves.
2. Utopai X: second on AA, but no API.
3. Seedance 2.5: push-ins, plus a reference video for the move.
4. MiniMax H3: camera from a reference video.
5. Kling 3.0 Pro: cheap tracking.

Wan 3.0 and Veo 3.1 tend to substitute a simpler move. Whip pans, cranes and handheld: no specific evidence.

### Gaps
AA's Camera Control leader is unknown. There's no test of whip pans or crane moves, and no multi-seed camera test.

---

## long

### Takeaway
Single takes of 30 seconds now exist from Kling 4.0, Wan 3.0 and Seedance 2.5. FLUX 3 makes 20 s; Kling 3.0, MiniMax H3 and HeyGen make 15 s; Veo 3.1 makes 8 s. In the only timed 30-second test, Kling 4.0 hit its beats and Wan 3.0 was late but cheaper. A 30-second Seedance 2.5 ad reportedly lost coherence.

### Cited Findings
- **SandBase.** Kling 4.0 30-second single take: zero cuts, all four timed beats hit, $4.71, about 498 s wait. Wan 3.0 30 s: zero cuts, late on two beats, $1.95, 854 s wait. Seedance 2.5 was skipped for budget. Durations:
  - Kling 4.0: 3–30 s
  - Seedance 2.5: 4–30 s
  - Wan 3.0: 2–30 s
  - Kling 3.0 Pro: 3–15 s
  - Veo 3.1: 4/6/8 s
  
  List price for 30 s at 1080p: Wan 3.0 $6.00, Kling 4.0 $7.05, Seedance 2.5 $27.00 — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Atlas, 30-second, 11-shot sequence.** Wan 3.0 had "the broadest shot coverage". Kling 4.0's timeline "runs about two seconds early". Seedance skipped beats — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Seedance 2.5's 30-second ad.** Curious Refuge's attempt reportedly "failed in terms of semantic coherence" (second-hand) — [DomoAI](https://domoai.app/zh-hant/blog/seedance-2-5-vs-2-0).
- **Extension.** Kling 3.0 allows up to six labelled shots in a 15-second generation and extension to about 3 minutes (paid), with drift reported past 2 minutes — [invideo](https://invideo.io/blog/best-ai-video-model/). Veo 3.1 can be extended but drops to 720p when extended — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026).
- **FLUX 3** is documented as making 20-second clips with audio — [invideo](https://invideo.io/blog/best-ai-video-model/). **MiniMax H3**: 15 s at 2K — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review). **HeyGen Video 1**: 5–15 s — [orcarouter](https://www.orcarouter.ai/blog/heygen-video-1-launch).

### Inferences
Ranked shortlist:
1. Kling 4.0: timed beats over 30 s; slow, and audio can't be turned off on some hosts.
2. Wan 3.0: the budget 30-second take, with loose timing.
3. Seedance 2.5: 30 s at a premium, with coherence risk.
4. FLUX 3: 20 s.

Extend or chain only where the ranks above can't do it. Veo 3.1 isn't suitable for long takes.

### Gaps
No test of FLUX 3's 20-second mode, and no multi-seed long-take test.

---

## consistency

### Takeaway
On holding one character across shots, Kling 4.0 led the only scored test, with Wan 3.0 close. Seedance has the biggest reference capacity, but it drifted the character in two tests and changed an object's shape across a cut. MiniMax H3 and Grok 1.5 break continuity in multi-shot work.

### Cited Findings
- **Atlas fight test.** "Character consistency" scores: Kling 4.0 9.0, Wan 3.0 8.5, Seedance 2.5 7.5 (character drifted toward a toy pony) — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Fuser test 5, two-shot storyboard.** Wan "kept the tall vase across the cut". In Seedance, the close-up showed "a low, open pot, which became a tall cylinder" — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **Curious Refuge on Seedance 2.0.** Better multi-shot continuity than Kling 3.0, with "some room to grow" — [Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review). On MiniMax H3, "continuity broke down more often than with Seedance" — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review). On Grok 1.5, image references held likeness "fairly convincing[ly]", but "continuity frequently broke down in multi-shot scenes" — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review).
- **Kling 3.0 Elements** "nailed consistency across cuts", for example a jacket and its colours — [Vizard](https://vizard.ai/blog/vizard-now-supports-kling-3-0-the-most-cinematic-ai-video-model-yet) [reseller]. Curious Refuge, by contrast, saw facial likeness drift — [Curious Refuge Kling 3.0](https://curiousrefuge.com/blog/kling-3-ai-video-generator-review) (search summary).
- **Wan 2.7** is credited with stronger character consistency than Kling 3.0 — [invideo](https://invideo.io/blog/best-ai-video-model/).
- **Reference inputs:**
  - Seedance 2.5: 30 images, 10 videos, 10 audio (50 files total per invideo)
  - Wan 3.0: 10 / 5 / 5
  - MiniMax H3: 9 / 3 / 3
  - Grok Imagine 1.5: up to 7 images, with persistent "@" references
  - Kling 4.0: up to ten keyframes (announced)
  
  Sources: [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5); [invideo](https://invideo.io/blog/best-ai-video-model/); [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review); [gradually.ai](https://www.gradually.ai/en/ai-models/kling-4-0/).
- **Design Arena** says Omni Flash "maintains creative consistency" — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/). The Verge hands-on (second-hand) found better character consistency than earlier Google tools, but also "inconsistent objects, and unwanted changes" — [aidirectory](https://aidirectory.com/news/google-gemini-omni-convincing-deepfake-ai-video).

### Inferences
Ranked shortlist:
1. Kling 4.0, or Kling 3.0 with Elements.
2. Wan 3.0.
3. Seedance 2.5: references help, but it drifts.
4. Gemini Omni Flash.
5. MiniMax H3 / Grok 1.5.

For start and end frames, Kling 4.0's ten keyframes (announced) is the strongest spec; no test was found.

### Gaps
No test of start-to-end-frame interpolation across current models. Kling 4.0's keyframe controls weren't exposed in SandBase's schema, so they're untested.

---

## likeness

### Takeaway
Seedance 2.0 and 2.5 refuse uploads of real human faces by policy (since Feb 2026), confirmed by a test refusal. Wan 3.0 accepted a photoreal person start frame. Grok 1.5 holds likeness from image references fairly well. Kling 3.0 Omni is the vendor-blog favourite for likeness. Omni Flash can make convincing clips from a selfie video, and every output carries SynthID. Veo gates people generation by region. Sora (cameos) is gone.

### Cited Findings
- **Seedance refuses real faces.** ByteDance stopped uploads of real human photos for Seedance 2.0 one day after it went viral — [Trivium China, 2026-02-10](https://triviumchina.com/2026/02/10/bytedance-stops-uploads-of-human-photos-for-seedance-2-0/). It also suspended the feature that turned facial photos into personal voices — [TechNode, 2026-02-10](https://technode.com/2026/02/10/bytedance-suspends-seedance-2-0-feature-that-turns-facial-photos-into-personal-voices-over-potential-risks/).
- **Fuser.** Seedance 2.5 refused a photoreal woman start frame with a "possible likenesses of real people" message. Wan 3.0 animated the same frame, delivering the line at 2.9–4.2 s — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **Seedance false positives and the sanctioned route.** Synthetic characters have been rejected as "may contain real person" (Reddit, via search) — [search result](https://reddit.sentinel-team.org/posts/1se1e69/snapshots/2026-04-09T19%3A20%3A08.323703Z). A sanctioned route exists: liveness-verified face assets — [apiyi docs](https://docs.apiyi.com/en/faq/seedance2-face-asset-whitelist.md) [reseller; verify against BytePlus]. A tester found the face filter runs before the text filter — [The Source](https://thesource.com/2026/04/15/seedance/).
- **Grok Imagine 1.5.** "With image references alone (no voice), Grok kept a fairly convincing likeness across new environments." Whether the faces were real people's is not stated — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review). Grok restricts images of real people in revealing clothing — [GraiLogic](https://grailogic.com/articles/ai-video-censorship-2026/).
- **Gemini Omni Flash.** A Verge hands-on (summarised second-hand) found it "can produce realistic fake clips from a selfie video", with odd mistakes. SynthID is on all outputs, and creators can opt out of remixing — [aidirectory](https://aidirectory.com/news/google-gemini-omni-convincing-deepfake-ai-video).
- **Veo** controls people generation via `personGeneration`. `allow_all` is unavailable in the EU, UK, Switzerland and MENA — [GraiLogic](https://grailogic.com/articles/ai-video-censorship-2026/) (from Google developer docs).
- **Kling 3.0 Omni** "uses the reference image to maintain subject consistency, which matters for real people"; no refusals reported — [cinevva / search summary](https://app.cinevva.com/guides/long-reference-video-models) [vendor-adjacent]. Curious Refuge saw Kling 3.0 facial likeness drift — [Curious Refuge Kling 3.0](https://curiousrefuge.com/blog/kling-3-ai-video-generator-review).
- **Higgsfield** says Veo 3.1 is "softer on close-up human faces" — [Higgsfield](https://higgsfield.ai/blog/5-Best-AI-Video-Models-2026-Tested-Compared) [reseller].
- **Runway** requires permission to use another person's image — [GraiLogic](https://grailogic.com/articles/ai-video-censorship-2026/). **Sora**'s consent-based cameos are discontinued — [GraiLogic](https://grailogic.com/articles/ai-video-censorship-2026/).

### Inferences
Ranked shortlist for a non-famous person from their own photos:
1. Wan 3.0: accepts photoreal faces.
2. Kling 3.0 Omni / 4.0: reference-driven; watch for drift.
3. Grok Imagine 1.5: good image-reference likeness; 1080p needs a $100/month plan.
4. Gemini Omni Flash: works from selfie video; region rules and SynthID apply.
5. HeyGen Video 1: HeyGen's avatar business suggests face support, but no evidence for the Video 1 model.

Seedance is excluded unless the person completes ByteDance's liveness-verified asset route. Local open weights (Wan 2.2, MiniMax H3) have no remote filter.

### Gaps
- No controlled fidelity test of a real non-famous face across current models.
- No primary policy text from Kling, Alibaba (Wan 3.0 hosted), xAI or HeyGen on uploading real faces. Whether Wan 3.0's test image was a real person's photo isn't stated.

---

## closeup

### Takeaway
Subtle facial acting remains weak. Seedance 2.0's delivery was "robotic" with weak micro-expressions, though 2.5 reportedly improved skin and emotional weight. Omni Flash tends to exaggerate emotion. Seedance 2.0 at 720p shows soft, warping faces when cropped in. Veo 3.1 is reported soft on close-up faces.

### Cited Findings
- **Curious Refuge on Seedance 2.0.** Subtle emotion and micro-expressions are weak; zoomed-in faces show "soft edges, warping faces, and compression artifacts" — [Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review).
- **Curious Refuge on Seedance 2.5** (second-hand). "Skin looks more natural in 2.5 than 2.0"; "you can feel the weight of a lot of emotion" — [DomoAI](https://domoai.app/zh-hant/blog/seedance-2-5-vs-2-0).
- **Design Arena.** Omni Flash "tends to exaggerate emotions, which can make videos look 'uncanny'" — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/).
- **Curious Refuge on MiniMax H3.** Facial distortions and texture instability; characters less expressive than Seedance's — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review). **On Grok 1.5:** performances less expressive than Seedance's — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review).
- **Atlas.** Seedance 2.5's character "keeps smiling through the ending" (missed a fading-smile beat). Wan 3.0 went "from disappointed to delighted, the reverse of the brief" — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Veo 3.1** is "softer on close-up human faces" — [Higgsfield](https://higgsfield.ai/blog/5-Best-AI-Video-Models-2026-Tested-Compared) [reseller].

### Inferences
Provisional ranking:
1. Seedance 2.5: best emotional weight and skin, but missed a specific expression beat.
2. Kling 4.0: no evidence either way.
3. Wan 3.0: reversed an emotion beat.
4. MiniMax H3 / Grok 1.5: less expressive.

Avoid Omni Flash for subtle acting. For close-ups, also prefer native 1080p or above over 720p outputs.

### Gaps
No dedicated close-up or emotion comparison. AA's dialogue and lip-sync category might partially cover it.

---

## physics

### Takeaway
On AA's blind Physics category, Utopai X is first, narrowly ahead of Seedance 2.5. Hands-on testers consistently find Seedance's weight and gravity the most believable among the models they test. Design Arena credits Omni Flash with strong physics and temporal consistency. MiniMax H3 and Grok 1.5 trail. Seedance 2.5 may be less dynamic than 2.0 on destruction.

### Cited Findings
- **AA category.** Utopai X was first in Physics (mechanics, thermal effects, material interaction, fracture, deformation, optics, cause and effect) — [AA on X](https://x.com/ArtificialAnlys/status/2105343646325428384). The lead over Seedance 2.5 is described as narrow by secondary coverage — [Utopai blog](https://www.utopaistudios.com/en/blog/utopai-x-ai-video-model-filmmaking) [vendor].
- **Curious Refuge on Seedance 2.0.** Physics is "a clear strength"; weight and gravity read well — [Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review). On Seedance 2.5 (second-hand), the reviewer preferred 2.0 for destruction physics and called 2.5 "not the most dynamic physics" in an asteroid test — [DomoAI](https://domoai.app/zh-hant/blog/seedance-2-5-vs-2-0).
- **Curious Refuge on MiniMax H3:** trails Seedance on physics. **On Grok 1.5:** physics was "the biggest weakness"; explosions and meteor impacts were "not production-ready" — [Curious Refuge H3](https://curiousrefuge.com/blog/minimaxh3-review); [Curious Refuge Grok](https://curiousrefuge.com/blog/grokimagine15-review).
- **Atlas "water physics."** Seedance 2.5 9.0, Kling 4.0 8.5, Wan 3.0 8.5; Wan's wave was "a smaller splash rather than a crashing wall" — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Design Arena.** Omni Flash's objects "move with realistic weight". Generations with temporal breaks won 65.4% against 72.4% for clean ones — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/).
- **SandBase.** Hair and jacket in the wind were prompted, but no per-model cloth findings were reported — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Other.** Wan has "focused on correct motion since 2.5"; Veo is praised for reflections and material detail — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026) [vendor-adjacent].

### Inferences
Ranked shortlist:
1. Utopai X: AA's blind #1, but no API.
2. Seedance 2.5 / 2.0: use 2.0 for destruction.
3. Gemini Omni Flash.
4. Kling 4.0 / Wan 3.0.
5. MiniMax H3.
6. Grok 1.5.

HeyGen Video 1 and MiniMax H3 Max share Utopai X's base, so they may inherit some of its strength. That's unverified.

### Gaps
No per-material tests (cloth, hair, liquids, destruction) across current models. Academic physics boards don't cover these commercial models.

---

## sound

### Takeaway
On AA's blind Audio Synchronization category, Utopai X is first, narrowly ahead of Gemini Omni Flash 1.1 and Seedance 2.5. Wan 3.0 ranks higher with audio than silent, which suggests its audio helps it win votes. Veo 3.1 has the best reputation for cinematic ambience in non-blind blogs. Kling 4.0 changed voices mid-scene. Grok's voice references sound like narration. Music generation is untested everywhere.

### Cited Findings
- **AA category.** Utopai X was first in Audio Synchronization, which covers diegetic effects, music, score and on- and off-screen sound; dialogue is scored separately — [AA on X](https://x.com/ArtificialAnlys/status/2105343646325428384). Its narrow lead was over Omni Flash 1.1 and Seedance 2.5 — [Utopai blog](https://www.utopaistudios.com/en/blog/utopai-x-ai-video-model-filmmaking) [vendor].
- **AA with-audio against silent T2V.**
  - Wan 3.0: 1175 with audio (#1), 1133 silent (#4).
  - HeyGen Video 1: 1156 with audio, 1143 silent (#1 silent).
  - MiniMax H3 Max: 1149 with audio, 1140 silent (#2 silent).
  
  Source: [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video). (The two scales may not be directly comparable; see Inferences.)
- **Atlas.** Kling 4.0 "voices change mid-scene"; Seedance 2.5 mis-said a word; Wan 3.0 audio was "clean, in sync, and consistent" — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Fuser.** Wan 3.0 had louder ambience; Seedance 2.5's room tone was "very quiet". Turning audio off doesn't lower the price on either model — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **SandBase.** Kling 4.0's audio can't be turned off on SandBase. Veo 3.1 costs half with audio off — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Veo 3.1 reputation.** Called "the best cinematic soundscapes and spatial audio" and audio that "matched the high cinematic quality of the video". Seedance 2.0 audio is "functional and consistent rather than cinematic" — [Atlas native-audio guide](https://www.atlascloud.ai/blog/guides/ai-video-models-native-audio-compared) [reseller]; others via the same search.
- **Grok Imagine 1.5.** Voice references "often sounded like audiobook narration" — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review). Its sound "doesn't always match what the user wants" — [Lanta AI](https://www.lantaai.com/blog/grok-ai-video-generation-review) (search summary).
- **Conflict on Wan 3.0 audio.** ZoopFizz says Wan 3.0 is "silent at every resolution" — [dev.to/ZoopFizz](https://dev.to/zoopfizz/comparing-ai-video-models-on-the-same-prompt-veo-31-kling-30-seedance-2x-and-wan-30-43i1) [reseller]. AA ranks it on the with-audio boards, and Fuser and Atlas both received audio from it. The ZoopFizz claim is probably wrong or specific to their catalogue entry.
- **MiniMax H3** generates stereo audio with picture, plus dialogue, effects and music in 11 languages — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review). **HeyGen Video 1** generates room tone and effects in the same pass — [orcarouter](https://www.orcarouter.ai/blog/heygen-video-1-launch). **HunyuanVideo 1.5** has no audio — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026).

### Inferences
Ranked shortlist:
1. Utopai X (no API).
2. Gemini Omni Flash 1.1.
3. Seedance 2.5: but very quiet room tone in one test.
4. Wan 3.0: audio lifts its rank.
5. Veo 3.1: reputation, not blind data.
6. Kling 4.0: voice drift.

For beatsheet, generated audio is best treated as guide or temp. Dialogue still benefits from a separate voice (`narrate`) and a lip-sync step where the model lacks it.

### Gaps
No blind audio-only listening test. Nothing on generated music quality. AA's separate dialogue and lip-sync category table wasn't read.

---

## mature

### Takeaway
There is almost no tested evidence; policy documents dominate. In the mainstream hosted models, implied or action violence generally passes and explicit gore is refused. Veo and Runway define the limits most strictly. Grok targets "R-rated". Seedance and Dreamina allow fictional and artistic context but block gratuitous gore. Open-weight models run locally have no remote filter. A three-way fight test (Kling 4.0, Seedance 2.5, Wan 3.0) ran without refusals, but all three softened the contact.

### Cited Findings
- **GraiLogic policy survey (checked 2026-08-30; affiliate links disclosed; based on policy documents, not tests)** — [GraiLogic](https://grailogic.com/articles/ai-video-censorship-2026/):
  - **Veo/Google:** bans "gratuitous" violence; context matters, with exceptions for educational, documentary and artistic work. People generation is regionally limited.
  - **Runway:** bans graphic violence, defined anatomically (dismemberment, decapitation, exposed organs and bones); blood is listed. Moderation cannot be disabled.
  - **Seedance/Dreamina:** bans "gratuitously shocking, graphic, sadistic, or gruesome" material, with exceptions for fictional and artistic work.
  - **Kling:** violence is prohibited, plus a broad "sole judgment" clause.
  - **Grok Imagine:** an "R-rated target" with "cinema-derived" standards; an age-gated "Spicy" tier for nudity, narrowed since January 2026.
  - **Luma, MiniMax/Hailuo:** violence listed as prohibited, with no detail.
  - **PixVerse:** restricts "excessive" violence.
  - **Open weights (Wan 2.2, LTX, Hunyuan):** governed by the model and the user; "open-weight does not mean uncensored".
  - **Sora 2 System Card:** 97% "not_overrefuse" on violence and gore (now discontinued).
- **Atlas** ran a Halloween fight with a trident and brawls on Kling 4.0, Seedance 2.5 and Wan 3.0, with no refusals reported. All softened impact: Kling's "soft fight contact", Wan's "hits lack weight", Seedance skipped two clashes — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **A creator reports** an anime duel flagged as "graphic violence" (headline only) — [HackerNoon](https://hackernoon.com/ai-video-generators-flagged-my-anime-duel-as-graphic-violence-it-was-a-cartoon). Another blog reports implied violence passing where literal injury language was rejected — via [search summary](https://grailogic.com/articles/ai-video-censorship-2026/).
- **Grok moderation** has blocked standard commercial imagery, according to a Chinese-language review, second-hand — [search summary of Grok reviews](https://tenbin.ai/media/ai_news/grok-imagine-video-1-5).
- **Veo** was called "the strictest content filters of the six" by a vendor-style review — via [search summary](https://grailogic.com/articles/ai-video-censorship-2026/) (low confidence).

### Inferences
Expected permissiveness for violence, blood and horror (inferred from policy, not tested):
1. Local open weights: Wan 2.2, MiniMax H3 base, LTX.
2. Grok Imagine 1.5: R-rated target, but erratic moderation.
3. Seedance 2.5 and Kling: fiction exception; action passes, gore doesn't.
4. Gemini Omni / Veo.
5. Runway: strictest and anatomically defined.

beatsheet should expect softened contact rather than outright refusals for action, and refusals for explicit gore everywhere hosted.

### Gaps
No systematic refusal-rate test across current models for blood, weapons or horror. Omni Flash, Wan 3.0 hosted, HeyGen and FLUX 3 policies weren't found. This needs beatsheet's own probe set.

---

## vertical

### Takeaway
All the frontier models tested support 9:16 natively: Seedance 2.5, Wan 3.0, Kling 3.0, MiniMax H3, Veo 3.1 and Omni. No comparison of quality specifically in vertical was found. PixVerse V6 and Omni Flash are the "social" picks, on cost, speed and templates rather than measured vertical quality.

### Cited Findings
- **EmpirioLabs** ran all four of Seedance 2.5, Kling 3.0 Turbo, MiniMax H3 and Wan 3.0 at 9:16 from the same vertical frame, with no verdict — [EmpirioLabs](https://empiriolabs.ai/blog/seedance-2-5-kling-minimax-h3-wan-3-0-image-to-video-test).
- **Aspect ratios.** Veo 3.1 Fast offers 16:9 and 9:16. Seedance 2.5 offers seven ratios including 21:9; Wan 3.0 offers five — [dev.to/ZoopFizz](https://dev.to/zoopfizz/comparing-ai-video-models-on-the-same-prompt-veo-31-kling-30-seedance-2x-and-wan-30-43i1). MiniMax H3 offers 16:9, 21:9 and 9:16 — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review).
- **PixVerse V6** is recommended for social formats, with per-second billing (1–15 s) and a template engine; it is weak with audio — [invideo](https://invideo.io/blog/best-ai-video-model/). **Gemini Omni Flash** is recommended for social variations and drafts — [Exemplary AI](https://exemplary.ai/blog/ai-video-generation-models-2026).

### Inferences
Rank vertical by the general boards: Wan 3.0, Seedance 2.5, MiniMax H3 / HeyGen Video 1, Omni Flash. Cheap high-volume social: HeyGen Video 1 ($0.04/s on AA), Omni Flash (about $0.10–0.15/s), PixVerse V6. Generating native 9:16 is likely better than cropping 16:9, because subjects get framed for the tall format. That is an inference, untested.

### Gaps
No vertical-specific quality comparison.

---

## Price-to-quality: roughs against finals

### Takeaway
Quality per dollar has collapsed at the top. HeyGen Video 1 ($0.04/s), MiniMax H3 768p ($0.08/s) and FLUX 3 Max ($0.07/s) are statistically tied with Wan 3.0 ($0.20/s) and Seedance 2.5 ($0.57/s) on AA text-to-video. Those three are the obvious roughs, and often good enough for finals. Seedance 2.5 is worth its premium mainly for heavy reference work and physics-weighted image-to-video finals, and it offers a 480p draft that upgrades without re-rolling. Veo 3.1 Standard ($0.40/s) is poor value except for 4K or its speed.

### Cited Findings
- **AA prices per minute** (≈ per second): HeyGen Video 1 $2.40 (0.04), Agnes-Video-2.5 $2.40 (0.04), FLUX 3 Max $4.35 (0.07), MiniMax H3 768p $4.80 (0.08), Veo 3.1 Lite $4.80 (0.08), P-Video-2-Pro $5.70 (0.095), MiniMax H3 Max $9.60 (0.16), Omni Flash 1.1 $9.12 (0.15), Wan 3.0 $12.00 (0.20), Grok 1.5 $15.00 (0.25), FLUX 3 $17.40 (0.29), Seedance 2.0 $22.45 (0.37), Veo 3.1 $24.00 (0.40), Seedance 2.5 $34.12 (0.57) — [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video).
- **SandBase list prices at 1080p:** Kling 3.0 Pro $0.112/s, Wan 3.0 $0.20, Veo 3.1 $0.20 (half with audio off), Kling 4.0 $0.235, Seedance 2.5 $0.90. Seedance 2.5 480p draft is $0.18/s and can be upgraded to 1080p with `draft_id` "without re-rolling the shot". Veo 3.1 was 3–7× faster — [SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/).
- **Atlas 30-second runs:** Kling 4.0 $6.41, Wan 3.0 $7.56, Seedance 2.5 $17.76. Score per dollar: Kling 1.18, Wan 0.98, Seedance 0.45. The author says the price gap was larger than the quality gap — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test).
- **Fuser.** Seedance 2.5 costs about 4.6× Wan 3.0 at 720p and about 5.7× at 1080p — [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5).
- **MiniMax H3 hosted 2K** is about $0.13/s, about $1.95 per 15 s, "roughly 60% cheaper than Seedance" — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review). **Grok 1.5 at 1080p** is about $0.25/s and needs a $100/month SuperGrok plan — [Curious Refuge](https://curiousrefuge.com/blog/grokimagine15-review).
- **Speed and draft tools.** P-Video has a 2.5-second draft mode at $0.02–0.04/s. LTX-2.3 is $0.06–0.32/s with open weights. Veo 3.1 4K is $0.60/s — [invideo](https://invideo.io/blog/best-ai-video-model/). Omni Flash is about $0.10/s and 2.5× faster than Seedance 2.0 — [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/). Omni 1.1 Flash is reportedly 10 cents per 720p clip — [MindStudio](https://www.mindstudio.ai/blog/gemini-omni-1-1-flash-video-model) (search snippet).
- **Seedance tier spread.** About 125× between the cheapest and dearest Seedance tiers (1.5 Pro 480p against 2.5 1080p); Seedance 2.0 Mini and Fast exist — [dev.to/ZoopFizz](https://dev.to/zoopfizz/comparing-ai-video-models-on-the-same-prompt-veo-31-kling-30-seedance-2x-and-wan-30-43i1). Design Arena scores Seedance 2.0, 2.0 Fast and 2.0 Mini identically at 1250 — [Design Arena](https://www.designarena.ai/leaderboard/video).
- **MiniMax H3 open-weight licence.** Reportedly restricts creators in the US, EU, UK and South Korea from distributing generated videos — [Curious Refuge](https://curiousrefuge.com/blog/minimaxh3-review). The HunyuanVideo 1.5 licence excludes the EU, UK and South Korea — [GraiLogic](https://grailogic.com/articles/ai-video-censorship-2026/).

### Inferences
**Roughs and drafts:**
- HeyGen Video 1, at $0.04/s, is statistically tied for #2–8 on AA.
- Gemini Omni Flash is fast and prompt-faithful.
- MiniMax H3 768p / FLUX 3 Max cost about $0.07–0.08/s.
- Seedance 2.0 Mini is tied with full 2.0 on Design Arena.
- Seedance 2.5's 480p draft at $0.18/s is the only true upgrade-in-place path.
- P-Video for near-instant blocking.
- Local MiniMax H3 / Wan 2.2 cost nothing per clip, but check the H3 licence before distributing anything.

**Finals:**
- Wan 3.0 is the default: top on AA T2V, accepts real faces, 30 s, $0.20/s.
- Seedance 2.5 for physics, weight and reference-heavy image-to-video, when no real faces are involved.
- Kling 4.0 for camera moves, timed long takes and character fidelity.
- Veo 3.1 only for 4K or establishing shots.

Veo 3.1 Standard and Grok 1.5 are poor value against their board placement.

### Gaps
- Prices vary by reseller and change with promotions; SandBase saw 20–35% discounts on the day. AA's per-minute prices are the most consistent reference.
- No source measured how often a cheap draft's look carries over to the final model's render.
