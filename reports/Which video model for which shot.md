# Route every shot to its best model

As of 2 November 2026, no single video model is best. On every blind leaderboard the top six sit inside each other's confidence intervals. What separates them for beatsheet is price, whether the shot starts from a board or from text, how long it runs, and what each model refuses. beatsheet should build its catalog around three fal families plus one specialist. **MiniMax H3** is the value core: H3 Max Turbo makes roughs at about **$0.20 per 5 s**, and H3 at 768p or H3 Max at 1080p makes finals at **$0.30–0.80**. It ranks fourth among all models on image-to-video and first on the public image-to-video arena. **Wan 3.0** costs **$0.25 per 5 s at 480p and $1.00 at 1080p**. It leads text-to-video, runs to 30 s, and animated a photoreal speaker that Seedance refused, which makes it the default for shots of real people. **Seedance 2.5** leads image-to-video, dialogue and human motion, so it is the final for dialogue, action, contact, closeups and physics with invented characters. It costs **$5.82 per 5 s at 1080p on fal ($3.40 on Runway)** and refuses real faces. **Kling 4.0** ($1.18) is the pick when the camera must orbit or a 30 s take must hit timed beats. In the catalog, replace Nano Banana with Nano Banana 2.1, move GPT Image to 2.5, drop Kling 2.5 Turbo and fal's Wan 2.2, demote Kling 3 Pro, and gate local H3. Its license excludes the US, EU, UK and South Korea. Popular tutorials get the workflow right: sheets, references with roles, a draft before 1080p, dialogue that fits the clip. They are wrong to make Seedance the answer to every shot. The evidence is thinnest where beatsheet's users will push hardest: real likeness, contact, animals, long takes, vertical and mature content. Eight side-by-side tests at the end close those gaps for about $300–350.

## The top six are tied, so price, input and refusals decide

Artificial Analysis (AA) runs blind pairwise votes by validated private evaluators. On its text-to-video board with sound, **Wan 3.0 (1175), Utopai X (1166), MiniMax H3 at 768p (1161), Seedance 2.5 (1157), FLUX 3 Max (1157) and HeyGen Video 1 (1156)** all fall within roughly ±15 of each other ([AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video)). The real gaps are between tiers. Kling 3.0 Pro is AA's fixed anchor at 1000 and Veo 3.1 scores 962, so Wan 3.0 would be preferred to Kling 3.0 about 73% of the time and to Veo 3.1 about 77%. The image-to-video board matters more to beatsheet, which mostly animates boards, and it reorders the leaders. **Seedance 2.5 (1153), Utopai X, Seedance 2.0 and H3 (1128)** lead there. Wan 3.0 drops to ninth (1111), FLUX 3 Max to twelfth (1064) and Gemini Omni Flash 1.1 to fourteenth (1046) ([AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video)).

The two public-vote arenas disagree with AA in one important place. **Gemini Omni Flash is first with public voters** on arena.ai and Design Arena, but only tenth and fourteenth with AA's private evaluators. Design Arena credits Omni's lead to prompt adherence (81% against a 63% average) rather than to polish ([arena.ai I2V](https://arena.ai/leaderboard/video/image-to-video); [Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/)). On arena.ai's image-to-video board, **plain MiniMax H3 is first at 1495 from 57,000 votes**. On Design Arena's, H3 Max (1321) edges Kling 4.0 (1319). Kling 4.0 isn't on AA or arena.ai yet ([Design Arena I2V](https://www.designarena.ai/leaderboard?tab=video&section=video&board=image-to-video)).

AA's 20 category boards (10 use cases, 10 capabilities) are the closest thing to per-shot evidence. Treat them as a direction, not a verdict. Category intervals run ±40–65 Elo, and **no category leader's interval clears the second-placed model**. Every AA test is a 10-second, 16:9, 1080p clip with no reference person and no adult content ([AA methodology](https://artificialanalysis.ai/methodology/video)). As a result, four of beatsheet's 18 kinds of shot (long, likeness, mature, vertical) have no blind evidence at all. Four more (crowd, animals, establishing, closeup) have only a proxy.

Price per quality has collapsed at the top. AA prices one minute on each maker's API at **$2.40 for HeyGen Video 1, $4.35 for FLUX 3 Max, $4.80 for MiniMax H3, $12.00 for Wan 3.0 and $34.12 for Seedance 2.5**. That puts Seedance at 7–14 times the cost of models it is statistically tied with on text-to-video ([AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video)). Three of the top six text-to-video entries are built on the same open model, MiniMax H3: H3 itself, Utopai X and HeyGen Video 1, with fal's H3 Max just below ([AA on X](https://x.com/ArtificialAnlys/status/2105343643251032304)).

| Model | AA text-to-video | AA image-to-video | arena.ai image-to-video | Cheapest 1080p final, $/5 s |
|---|---|---|---|---|
| Wan 3.0 | #1 (1175) | #9 (1111) | #3 (1480) | fal $1.00 |
| Utopai X | #2 (1166) | #2 (1146) | not listed | no API |
| MiniMax H3 (768p) | #3 (1161) | #4 (1128) | #1 (1495) | fal $0.30 (768p), $0.65 (2K) |
| Seedance 2.5 | #4 (1157) | #1 (1153) | #4 (1477) | Runway $3.40, fal $5.82 |
| FLUX 3 Max | #5 (1157, provisional) | #12 (1064) | not listed | fal $1.45 after 7 Nov |
| HeyGen Video 1 | #6 (1156) | #6 (1120) | not listed | HeyGen API, about $0.20 |
| MiniMax H3 Max | #7 (1149) | #8 (1117) | not listed (Design Arena I2V #1) | fal $0.80 from 16 Nov |
| Seedance 2.0 | #9 (1136) | #3 (1136) | #5 (1475) | fal $3.41 |
| Gemini Omni Flash 1.1 | #10 (1128) | #14 (1046) | #2 (1488) | fal $0.75 |
| Kling 4.0 | not rated | not rated | not rated (Design Arena I2V #2) | fal $1.18 |
| Kling 3.0 Pro | #19 (1000, anchor) | #17 (1000) | #19 (1354) | fal $0.56 silent |
| Veo 3.1 | #22 (962) | #21 (957) | #13–17 | fal $2.00 with sound |
| Kling 2.5 Turbo | not rated | not rated | #27 (1276) | fal $0.35 |

Sources: [AA T2V](https://artificialanalysis.ai/video/leaderboard/text-to-video), [AA I2V](https://artificialanalysis.ai/video/leaderboard/image-to-video), [arena.ai I2V](https://arena.ai/leaderboard/video/image-to-video), [Design Arena I2V](https://www.designarena.ai/leaderboard?tab=video&section=video&board=image-to-video), fal and Runway price pages cited in the fact sheets.

## Shot by shot: ranked picks for roughs and finals

How to read the tables. **"$/5 s"** is the list price read on 2 November 2026 for five seconds at the resolution named. It uses standard rates after the current promotions end: H3 Max and H3 Max Turbo from 16 November, FLUX 3 Max from 8 November. A **rough** is a cheap draft. Wherever possible it comes from the same family as the final, so the take the person picks survives the upgrade. Seedance 2.5's draft completes into the same shot at 1080p; Wan 3.0 and H3 Max can be re-run at a higher resolution with the same seed. Cross-family roughs are for blocking only. **Confidence** is *high* when a blind category board and independent hands-on tests agree. It is *medium* with one strong source and no serious contradiction. It is *low* when the case rests on a proxy category, specs, policy text, vendor claims or a single test. Nearly every hands-on comparison behind these tables used **one seed per model**.

| Kind | Rough pick, $/5 s | Final #1, $/5 s | Final #2 | Confidence |
|---|---|---|---|---|
| dialogue | H3 Max Turbo 768p, $0.20 | Seedance 2.5 (invented speakers), $5.82 | H3 Max or its lip-sync (real people), $0.80 | Medium |
| action | Wan 3.0 480p, $0.25 | Seedance 2.5, $5.82 | Kling 4.0, $1.18 | High for #1 |
| contact | Seedance 2.5 draft, $1.10 | Drive from a filmed performance, $0 local / $0.84 | Seedance 2.5 | Low |
| crowd | Wan 3.0 480p, $0.25 | Seedance 2.5, $5.82 | Wan 3.0 1080p, $1.00 | Low |
| animals | Wan 3.0 480p, $0.25 | Seedance 2.5, $5.82 | Kling 4.0, $1.18 | Low |
| product | Wan 3.0 480p, $0.25 | Seedance 2.5 with references, $5.82 | Wan 3.0 1080p, $1.00 | Medium |
| establishing | H3 Max Turbo 768p, $0.20 | H3 768p/2K or H3 Max 1080p, $0.30–0.80 | Wan 3.0 1080p, $1.00 | Medium-low |
| stylized | Wan 3.0 480p, $0.25 | Seedance 2.5 from a styled board, $5.82 | HeyGen Video 1, about $0.20 | Medium (anime/3D) |
| text | Coded overlay, $0 | Coded overlay; else H3 from a lettered board, $0.30 | Omni Flash 1.1, $0.75 | Medium |
| camera | H3 Max Turbo 768p, $0.20 | Seedance 2.5 with a move reference, $5.82 | Kling 4.0, $1.18 | Medium |
| long | Wan 3.0 480p, $1.50 per 30 s | Kling 4.0, $7.05 per 30 s | Wan 3.0 1080p, $6.00 per 30 s | Low |
| consistency | H3 Max Turbo with references, $0.20 | H3 Max with references, about $0.80 | Seedance 2.5 (invented) / Wan 3.0 (real) | Low-medium |
| likeness | Wan 2.2 on the 4090, $0 | Wan 3.0 1080p, $1.00 | Drive from the person's own performance, $0 | Low |
| closeup | Seedance 2.5 draft, $1.10 | Seedance 2.5, $5.82 | Wan 3.0 (real faces), $1.00 | Low-medium |
| physics | Wan 3.0 480p, $0.25 | Seedance 2.5 (2.0 for destruction), $5.82 | Wan 3.0 1080p, $1.00 | Medium |
| sound | Omni Flash 1.1 360p, $0.15 | Seedance 2.0/2.5 from a still, $3.41–5.82 | Omni Flash 1.1 from text, $0.75 | Medium |
| mature | Wan 2.2 on the 4090, $0 | Wan 3.0 (implied violence), $1.00 | Local Wan 2.2 / LTX-2.5 for blood, $0 | Low |
| vertical | H3 Max Turbo from a 9:16 board, $0.20 | Seedance 2.5 from a 9:16 board, $5.82 | H3 Max 1080p, $0.80 | Low |

### Dialogue: Seedance for invented speakers, H3 Max for real ones

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | H3 Max Turbo, 768p (fal) | $0.20 | Native dialogue in 11 languages; cheapest rough with sound |
| Rough | 2 | Seedance 2.5 draft, 480p (fal) | $1.10 | Only when the final is Seedance; completes by `draft_id` |
| Final | 1 | Seedance 2.5, 1080p (fal; Runway) | $5.82 ($3.40) | #1 on AA Dialogue & Lip Sync from text and from a still; invented characters only |
| Final | 2 | H3 Max 1080p, or H3 Max lip-sync on beatsheet's narrated line (fal) | $0.80 ($0.40 at 768p) | #2 on image-to-video dialogue; can take a real person's board |
| Final | 3 | Wan 3.0, 1080p (fal) | $1.00 | Clean sync in a 30 s test; animated a photoreal speaker; only #13 on image-to-video dialogue |

**Confidence: medium.** Seedance 2.5 leads AA's Dialogue & Lip Sync board from text (1196 ±43) and from a still (**1217 ±52, one of the few category leads with a rank range of 1–2**). Atlas Cloud's 30-second dialogue scene scored its voice and lip sync 8.0 against Wan 3.0's 7.5 and Kling 4.0's 7.0, and Kling's "voices change mid-scene" ([AA I2V dialogue](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=dialogue-and-lip-sync); [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). The catch is that Seedance refuses photos of real people. A dialogue shot of the person or their friends therefore goes to H3 Max, second on image-to-video dialogue at 1166, or to Wan 3.0, which delivered a line from a photoreal start frame that Seedance refused ([Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5)). beatsheet already makes its voices with `narrate`, so the most controllable final is often **H3 Max's lip-sync endpoint**. It takes a portrait and 5 s to 15 min of audio for $0.08/s at 768p ([fal H3 Max lip-sync](https://fal.ai/models/minimax/h3-max/lip-sync/image-to-video/llms.txt)). In the one measured two-speaker test, native H3 dialogue had a 0% character error rate against 9.52% for LTX-2.5 (n=1) ([ai-muninn](https://ai-muninn.com/en/blog/ltx25-vs-minimax-h3-rtx5090)). Kling stays off the list because of the voice drift above and Curious Refuge's finding that Kling 3.0's lip sync "doesn't always hit the mark" ([Curious Refuge](https://curiousrefuge.com/blog/kling-3-ai-video-generator-review)). Test 1 checks whether H3 Max and Wan 3.0 accept and hold a real face while it speaks.

### Action: Seedance carries the weight, Kling moves the camera around it

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 3.0, 480p (fal) | $0.25 | Covers every beat; carries over to a Wan final |
| Rough | 2 | Seedance 2.5 draft, 480p (fal) | $1.10 | Carries over to the Seedance final |
| Final | 1 | Seedance 2.5, 1080p (fal; Runway) | $5.82 ($3.40) | #1 on AA Human Anatomy from text and from a still; most weight in hands-on tests |
| Final | 2 | Kling 4.0, 1080p (fal) | $1.18 | The only model that orbited a moving subject on request |
| Final | 3 | Drive: Wan-Animate-2 or SCAIL-2 on the 4090; Kling v3 Motion Control (fal) | $0 / $0.84 | Exact choreography from a filmed performance |

**Confidence: high for the first pick, low below it.** AA's Human Anatomy category covers gait, acrobatics, grasping and human interaction. It puts **Seedance 2.5 first from text (1188) and from a still (1125, rank range 1–2)** ([AA I2V anatomy](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=human-anatomy)). Hands-on testers agree. Curious Refuge found Seedance's running and falling "believable rather than floaty", and Atlas scored fight impact 7.5 for Seedance 2.5, 6.5 for Kling 4.0 and 5.5 for Wan 3.0 ([Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review); [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). Kling 4.0 is the camera specialist. In SandBase's skateboard test it was "the only model whose camera visibly orbited the rider", though it added two unexplained shadows, while Seedance 2.5 smeared the rider's arms with motion blur ([SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/)). Avoid MiniMax H3 for large action; Curious Refuge saw "artifacts and movement that broke the illusion". Avoid FLUX 3 Max too, which falls to 16th on image-to-video Human Anatomy ([Curious Refuge H3](https://curiousrefuge.com/blog/minimaxh3-review)). The tutorials all send action to Seedance 2.5, and the blind data backs them. None of them tested a drive route against it.

### Contact: no model lands a hug on its own, so drive it

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Seedance 2.5 draft, 480p (fal) | $1.10 | Least-bad weight in prompt-only tests |
| Rough | 2 | SCAIL-2 at 512p on the 4090 | $0 | Blocks the contact from the person's own filmed reference |
| Final | 1 | Wan-Animate-2 or SCAIL-2 (4090); Kling v3 Motion Control (fal) | $0 / $0.84 | Copies real contact instead of guessing it |
| Final | 2 | Seedance 2.5, 1080p | $5.82 | Leads AA Human Anatomy, which includes "human interaction" |
| Final | 3 | Kling 4.0, 1080p | $1.18 | Softer contact, better character hold |

**Confidence: low.** Contact between people is the least-tested kind of shot. In Atlas's fight scene every model softened it. Kling 4.0's "lamp-room clash lacks weight", Wan 3.0's "hits lack weight", and Seedance 2.5 skipped two clashes outright ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). In January's dance tests no model performed the prompted moves, and "too many limbs" was among the failures ([CalMatters](https://calmatters.org/economy/technology/2026/01/ai-sucks-at-dancing-tests-show/)). The reliable route is to copy a real performance. Wan-Animate-2 (Apache 2.0, released 7 August 2026) adds a text-driven camera viewpoint on top of the driving clip, and Kling v3 Motion Control accepts a driving clip of up to 30 s ([Wan-Animate-2](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B); [fal Kling Motion Control](https://fal.ai/kling-motion-control)). The control-video lessons from the tutorials apply here. A depth-only control clip gave a gray world and the performer's body, and compositing the control over the real plate fixed it. Test 3 compares prompted contact against driven contact.

### Crowd: render at native 1080p and trust nobody's 720p

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 3.0, 480p (fal) | $0.25 | #1 on AA text-to-video Complex Composition |
| Rough | 2 | H3 Max Turbo, 768p (fal) | $0.20 | Cheapest |
| Final | 1 | Seedance 2.5, 1080p | $5.82 | Seedance 2.0 and 2.5 hold #1–2 on image-to-video Complex Composition |
| Final | 2 | Wan 3.0, 1080p | $1.00 | Text-to-video leader at a sixth of the price |
| Final | 3 | H3 Max, 1080p | $0.80 | Cheapest native-1080p option |

**Confidence: low.** AA has no crowd category. Its nearest proxy is Complex Composition (multi-object interaction, counting, spatial relationships), led by Wan 3.0 from text (1180) and by Seedance 2.0 (1159) and 2.5 (1144) from a still ([AA I2V composition](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=complex-composition)). The direct tests are dated. A February comparison put Veo 3 and then Seedance ahead of Wan 2.2 and MiniMax, which it found "too static, noisy" ([Pulze](https://www.pulze.io/blog/ai-video-model-comparison)). Curious Refuge found that Seedance 2.0's crowds at 720p "lack detail and would be hard for an upscaler to fix" ([Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review)). The rule that follows is to render crowds at native 1080p. Whether background extras stay distinct people across a clip is untested.

### Animals: a gap that beatsheet has to fill itself

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 3.0, 480p (fal) | $0.25 | Cheap, same family as a Wan final |
| Rough | 2 | H3 Max Turbo, 768p (fal) | $0.20 | Cheapest |
| Final | 1 | Seedance 2.5, 1080p | $5.82 | Seedance leads image-to-video Lighting & Materials, which covers "hair and fur" |
| Final | 2 | Kling 4.0, 1080p | $1.18 | Best character fidelity in the only test with a creature |
| Final | 3 | Wan 3.0, 1080p | $1.00 | Value |

**Confidence: low.** No independent comparison of animals reached a verdict. EmpirioLabs ran Seedance 2.5, Kling 3.0 Turbo, H3 and Wan 3.0 on the same snow-leopard leap and declined to name a winner ([EmpirioLabs](https://empiriolabs.ai/blog/seedance-2-5-kling-minimax-h3-wan-3-0-image-to-video-test)). Atlas saw Seedance 2.5 drift a costumed pony "closer to a toy pony" while Kling 4.0 kept it on model ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). The nearest blind proxy is AA's Lighting & Materials, which includes "cloth, hair and fur". From a still it is led by Seedance 2.0 (1163), Utopai X and Seedance 2.5 ([AA I2V lighting](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=lighting-and-materials)). A person's own pet is a likeness problem, and Test 6 covers it cheaply.

### Product: Seedance references, Wan literalness, composited small print

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 3.0, 480p (fal) | $0.25 | Literal about product instructions |
| Rough | 2 | H3 Max Turbo, 768p (fal) | $0.20 | Cheapest |
| Final | 1 | Seedance 2.5 reference-to-video, 1080p | $5.82 | Up to 30 product photos; top-ranked on AA Retail & Ecommerce from text and from a still |
| Final | 2 | Wan 3.0, 1080p | $1.00 | Held the label in a head-to-head with Seedance |
| Final | 3 | H3 Max, 1080p | $0.80 | #4 on image-to-video Retail |

**Confidence: medium.** Seedance 2.5 is the top-ranked model on AA's Retail & Ecommerce board from text (1160) and from a still (1145). HeyGen Video 1 (1141), Utopai X and H3 Max follow within the interval ([AA I2V retail](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=retail-and-ecommerce)). In Fuser's bottle push-in, **Seedance 2.5 and Wan 3.0 tied: both kept the main label sharp and both garbled the smallest print** ([Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5)). Veo 3.1 Fast invented lettering on a watch dial, and Seedance 2.5 rendered a small sneaker tiny in an empty frame unless the camera distance was stated ([Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)). Legal text and fine print therefore belong in a composited packshot or a kit overlay. Make the board with GPT Image 2.5 Sunburst, which the tutorials recommend for accurate products and which tops all four image leaderboards ([arena.ai T2I](https://arena.ai/leaderboard/text-to-image)).

### Establishing: H3 and Wan beat Veo's 4K reputation

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | H3 Max Turbo, 768p (fal) | $0.20 | Same family as the final |
| Rough | 2 | Wan 3.0, 480p (fal) | $0.25 | Strong from text |
| Final | 1 | H3 768p or 2K, or H3 Max 1080p (fal) | $0.30 / $0.65 / $0.80 | #2 from text and the top-ranked model from a still on AA Architecture |
| Final | 2 | Wan 3.0, 1080p | $1.00 | #3 from text on Architecture |
| Final | 3 | Seedance 2.5, 1080p | $5.82 | Within the interval of the leaders |

**Confidence: medium-low.** AA's Architecture & Real Estate category (exterior flythroughs, interior walkthroughs) is the nearest blind proxy. From text it is led by Utopai X, which has no API, and **MiniMax H3 768p (1134)**. From a still it is led by **H3 768p (1137, the top-ranked model)** and Seedance 2.5 (1134) ([AA I2V architecture](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=architecture-and-real-estate)). That contradicts the blog consensus that Veo 3.1 is the hero model for establishing shots because of 4K and materials ([Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)). Veo 3.1 sits 20th–27th in the same category. Gemini Omni Flash is the one to avoid: Design Arena measured its win rate falling 14.5 points on landscape prompts, which "look more animated than picturesque" ([Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/)). For 4K delivery, rendering at 1080p and upscaling should be cheaper than any native-4K model. Non-generative Topaz Precision on fal costs $0.60 per 10 s to 4K, and SeedVR2 runs free on the 4090 ([fal Topaz](https://fal.ai/models/topaz/upscale/video/precision); [ComfyUI SeedVR2](https://docs.comfy.org/tutorials/utility/seedvr2.md)). That is an inference beatsheet hasn't tested.

### Stylized: put the style in the board, then animate

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 3.0, 480p (fal) | $0.25 | #2 on text-to-video Animation & Gaming |
| Rough | 2 | Wan 2.2 A14B plus a style LoRA on the 4090 | $0 | A house style that can be trained |
| Final | 1 | Seedance 2.5 from a styled board, 1080p | $5.82 | #1 on image-to-video Animation & Gaming |
| Final | 2 | HeyGen Video 1 (HeyGen API) | about $0.20 | #1 on text-to-video Animation & Gaming; needs a new integration |
| Final | 3 | Wan 3.0, 1080p | $1.00 | Value |

**Confidence: medium for anime and 3D, low for claymation and painterly.** AA's Animation & Gaming board is led from text by **HeyGen Video 1 (1225) and Wan 3.0 (1220)**, and from a still by **Seedance 2.5 (1179) and 2.0 (1163)** ([AA T2V animation](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=animation-and-gaming); [AA I2V animation](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=animation-and-gaming)). Reseller and competitor roundups agree on Seedance for anime and on Wan 2.7 for keeping "line work inked, shading flat" ([OpenArt](https://openart.ai/blog/best-ai-video-generators-for-anime/); [Luma](https://lumalabs.ai/news/ai-anime-video-generators-creators)). AA tags prompts with eight styles, claymation among them, but it publishes no per-style board and says "most prompts are photorealistic" ([AA methodology](https://artificialanalysis.ai/methodology/video)). So clay, painterly and flat 2D have no blind evidence. The working rule is to put the style into the board, where image models are strong, and animate it with image-to-video. This also guards against Seedance pulling a character "more cartoonish", as it did in Atlas's test. For kinetic type and motion graphics, beatsheet's coded scenes beat any generator.

### Text: write it in code, or letter the board and animate gently

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough and final | 1 | beatsheet overlay (`kit:Title`, a scene) | $0 | Exact, editable, never garbled |
| Rough | 2 | H3 Max Turbo from a GPT Image 2.5 lettered board | $0.20 + ~$0.04 | Cheap check that the lettering survives motion |
| Final | 2 | H3 768p or H3 Max 1080p from that board | $0.30 / $0.80 | #1 on AA image-to-video Text Rendering (H3) |
| Final | 3 | Gemini Omni Flash 1.1, from text | $0.75 | #1 on AA text-to-video UI/UX & Motion Design; invented scenes only |

**Confidence: medium.** Text that matters should not come from a video model. In hands-on tests, Kling 4.0 and Wan 3.0 rendered neon signs as "pseudo-Chinese text", Seedance 2.5 and Wan 3.0 garbled small label print, and Veo 3.1 invented lettering ([SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/); [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5); [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)). When lettering has to live in the world, such as a shop sign or a label, put it on the board with GPT Image 2.5. GPT Image 2 won both lettering rounds in Decrypt's test ([Decrypt](https://decrypt.co/366408/openai-gpt-image-2-vs-google-nano-banana-2-review)). Then animate the board with the model that best keeps its text: **MiniMax H3 768p is first on AA's image-to-video Text Rendering board (1213 ±55)** ([AA I2V text](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=text-rendering)). Every other plate should be prompted for "no readable text". Seedance 2.5 obeyed that on neon signs ([Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)).

### Camera: blind boards favor Seedance and Wan; only Kling orbited

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | H3 Max Turbo, 768p (fal) | $0.20 | H3 Max is #2 on image-to-video Camera Control |
| Rough | 2 | Wan 3.0, 480p (fal) | $0.25 | #1 on text-to-video Camera Control |
| Final | 1 | Seedance 2.5, 1080p, with a reference clip of the move | $5.82 | #1 on image-to-video Camera Control |
| Final | 2 | Kling 4.0, 1080p | $1.18 | Orbits, up to 8 middle keyframes, hit four timed beats |
| Final | 3 | H3 Max, 1080p | $0.80 | Close second from a still |

**Confidence: medium; blind and hands-on evidence disagree.** AA's Camera Control category covers close-up, aerial, POV, tracking, dolly, orbit, crane, crash zoom, whip pan and rack focus. It is led by **Wan 3.0 from text (1153)** and by **Seedance 2.5 (1184) and H3 Max (1164) from a still** ([AA I2V camera](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=camera-control)). SandBase's single-seed test tells a different story. Seedance 2.5 "stayed frontal", Wan 3.0 swapped a requested orbit for a side track, and **only Kling 4.0 orbited**. In a 30-second handheld take, Kling hit all four timed camera beats while Wan was late on two ([SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/)). Kling 4.0 isn't on AA yet, so it can't be placed in the blind ranking. The prompting guides agree on one move per shot with a pace word and explicit holds. Wan 2.2 ignored a 360° orbit in 5 s and dropped the second of two stacked moves, so orbits should stay at 90–180° in short clips ([aistudynow](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/)). When a move must be exact, keyframes or a reference video beat words: Kling 4.0 takes up to 8 middle frames and Luma Ray 3.2 up to 64 keyframes, at $0.30 per 5 s at 720p ([fal Ray 3.2](https://fal.ai/models/luma/agent/ray/v3.2/image-to-video/llms.txt)). Test 4 settles the disagreement.

### Long: three models do 30 seconds; only Kling kept time

| Stage | Rank | Model and route | Cost per 30 s ($/5 s) | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 3.0, 480p (fal) | $1.50 ($0.25) | Broadest shot coverage; carries over to a Wan final |
| Rough | 2 | Seedance 2.5 draft, 480p (fal) | $6.62 ($1.10) | Completes into the final |
| Final | 1 | Kling 4.0, 1080p (fal) | $7.05 ($1.18) | Hit all four timed beats in 30 s |
| Final | 2 | Wan 3.0, 1080p (fal) | $6.00 ($1.00) | Loose timing, cheaper |
| Final | 3 | Seedance 2.5, 1080p | $34.92 fal, $20.40 Runway | Skipped beats; a 30 s ad reportedly lost coherence |

**Confidence: low.** AA tests every clip at 10 s, so there is no blind evidence on length. Specs decide who can even try. **Seedance 2.5, Wan 3.0 and Kling 4.0 make 30 s in one take**; FLUX 3 and LTX-2.5 make 20 s; H3, HeyGen and Kling 3.0 make 15 s; Omni makes 10 s and Veo 3.1 8 s ([SandBase](https://blog.sandbase.ai/kling-4-0-vs-seedance-2-5-veo-3-1-2026/)). In the only timed 30-second test, **Kling 4.0 hit its beats for $4.71 at 720p after about 8 minutes, and Wan 3.0 ran late on two beats for $1.95 after about 14 minutes**. In Atlas's 11-shot sequence, Wan had "the broadest shot coverage", Kling ran about two seconds early and Seedance skipped beats ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). The strongest craft claim for long takes comes from a tutorial: one 30-second generation with internal cuts keeps positions and acting continuous, while separate 6-second clips drift. The best moments are then kept in the edit, and beatsheet's `split_at_cuts` already does that step. The claim is untested, and Test 5 tests it.

### Consistency: blind boards like H3, hands-on testers like Kling and Wan

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | H3 Max Turbo reference-to-video (fal) | $0.20 | Same reference syntax as H3 Max |
| Rough | 2 | Wan 3.0 reference-to-video, 480p (fal) | $0.25 | 10 image references, real faces allowed |
| Final | 1 | H3 Max reference-to-video, 1080p (fal) | about $0.80 (reference price unconfirmed) | #1 on AA image-to-video Spatio-Temporal Consistency |
| Final | 2 | Seedance 2.5 reference-to-video, 1080p | $5.82 | #1 on Design Arena Multi-Image; 30 references; invented characters only |
| Final | 3 | Wan 3.0 reference-to-video, 1080p | $1.00 | Kept a prop across a cut; scored 8.5 for character consistency |

**Confidence: low-medium; the sources pull in different directions.** Blind boards favor the H3 family. **H3 Max tops AA's image-to-video Spatio-Temporal Consistency (1194)**, and plain H3 is second on Design Arena's Multi-Image board (1335), behind Seedance 2.5 (1352) ([AA I2V consistency](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=spatio-temporal-consistency); [Design Arena multi-image](https://www.designarena.ai/leaderboard?tab=video&section=video&board=multi-to-video)). Hands-on tests favor Kling and Wan. Atlas scored character consistency at **9.0 for Kling 4.0, 8.5 for Wan 3.0 and 7.5 for Seedance 2.5**. Fuser watched Seedance turn "a low, open pot" into "a tall cylinder" across a cut while Wan kept the vase ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test); [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5)). Curious Refuge found H3's "continuity broke down more often than with Seedance" ([Curious Refuge H3](https://curiousrefuge.com/blog/minimaxh3-review)). Kling 4.0 won the hands-on test, but fal doesn't expose its references yet; until it does, Kling 3.0 Pro with `@Element` references ($0.56 per 5 s, silent) is the Kling route. What every source agrees on is that references beat prompts and each reference needs a stated role. In beatsheet, consistency is mostly a stills problem. Make each sheet once and restart every board from the original sheet rather than from the last board, because every image model drifts on repeated edits ([fal GPT Image 2.5](https://fal.ai/learn/devs/gpt-image-2-5-vs-gpt-image-2)).

### Likeness: two leaders refuse real people, so Wan and drive carry it

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 2.2 A14B image-to-video on the 4090 | $0 | Apache 2.0, private, no remote filter |
| Rough | 2 | Wan 3.0, 480p (fal) | $0.25 | Same family as the final |
| Final | 1 | Wan 3.0, 1080p (fal) | $1.00 | Animated a photoreal speaker Seedance refused |
| Final | 2 | Drive from the person's own performance: Wan-Animate-2 or SCAIL-2 (4090) | $0 | The person supplies their own face and movement |
| Final | 3 | Kling 3.0 Pro with an Element, or Kling 4.0 (fal) | $0.56 / $1.18 | No refusals reported; facial drift seen |
| Excluded | | Seedance 2.5 and 2.0; Gemini Omni Flash. Untested: H3 Max | | Policy blocks on real faces |

**Confidence: low.** Two frontier models are ruled out by policy. ByteDance stopped real-face uploads for Seedance 2.0 a day after it went viral, and Seedance 2.5 refused a photoreal start frame as "possible likenesses of real people" ([Trivium China](https://triviumchina.com/2026/02/10/bytedance-stops-uploads-of-human-photos-for-seedance-2-0/); [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5)). Gemini Omni Flash blocked a developer's own founder footage with "we can't create videos with real people's names or likenesses" ([Google AI forum](https://discuss.ai.google.dev/t/real-peoples-names-or-likenesses-block-on-own-footage-gemini-omni-flash-preview-skyhill-hq/179433)). Wan 3.0 animated the frame Seedance refused, though Fuser doesn't say whether it was a real person's photo. No vendor publishes a real-face rule for Wan, Kling, H3 or Grok. Local open weights have no remote filter. That makes Wan 2.2 the free rough and the drive models the most faithful final, since the person supplies their own performance. Boards follow beatsheet's existing rule: only the person's own photos as references, GPT Image first. That rule matches the one independent test, where GPT Image 2 kept a reference face's hair, eyes and mole and Nano Banana 2 did not ([AI blew my mind](https://aiblewmymind.substack.com/p/nano-banana-2-vs-gpt-images-2)). Pipelines that hide faces and alter voices exist to slip celebrity footage past exactly this filter, and beatsheet should not ship them.

### Closeup: faces are still the weak spot everywhere

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Seedance 2.5 draft, 480p | $1.10 | When the final is Seedance |
| Rough | 2 | Wan 3.0, 480p | $0.25 | Real faces |
| Final | 1 | Seedance 2.5, 1080p | $5.82 | Leads Human Anatomy, which includes facial expression; invented faces |
| Final | 2 | Wan 3.0, 1080p | $1.00 | Real faces |
| Final | 3 | Kling 4.0, 1080p | $1.18 | No evidence either way |

**Confidence: low-medium.** Subtle acting remains weak in every model. Curious Refuge called Seedance 2.0's delivery "super robotic", with weak micro-expressions and "soft edges, warping faces" when cropped in at 720p. Its reviewer reportedly found 2.5's skin "more natural" ([Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review); [DomoAI](https://domoai.app/zh-hant/blog/seedance-2-5-vs-2-0)). Atlas saw Seedance 2.5 keep smiling through a beat meant to fade, and Wan 3.0 play an emotion "the reverse of the brief" ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). Design Arena found that Omni Flash "tends to exaggerate emotions", and Curious Refuge saw facial distortion and texture instability in H3 ([Design Arena notes](https://notes.designarena.ai/gemini-omni-flash-a-video-model-for-directors/); [Curious Refuge H3](https://curiousrefuge.com/blog/minimaxh3-review)). Two prompting habits apply to every model: direction at the level of brows, a lip quiver and dropping shoulders, and LTX's advice to show emotion as a physical cue rather than name it ([deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)). Upscale faces with a non-generative tool such as Topaz Precision, never a generative one.

### Physics: Seedance's weight is the one thing everyone agrees on

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 3.0, 480p (fal) | $0.25 | Ranked #4 on image-to-video Physics |
| Rough | 2 | H3 Max Turbo, 768p (fal) | $0.20 | H3 Max tops text-to-video Physics on early votes |
| Final | 1 | Seedance 2.5, 1080p; Seedance 2.0 for destruction | $5.82 / $3.41 | #2 behind Utopai X (no API) from a still; best weight in hands-on tests |
| Final | 2 | Wan 3.0, 1080p | $1.00 | Within the interval |
| Final | 3 | H3 Max, 1080p | $0.80 | From text |

**Confidence: medium.** On AA's Physics category from a still, **Utopai X leads (1153) but has no API, followed by Seedance 2.5 (1117), Seedance 2.0 (1115) and Wan 3.0 (1108)**. From text, H3 Max (1154) and FLUX 3 Max top the table on fewer than 500 votes each, and HeyGen (1133) is the top-ranked model ([AA I2V physics](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=physics); [AA T2V physics](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=physics)). Hands-on evidence agrees on Seedance's weight. Curious Refuge called physics "a clear strength", and Atlas's water test scored Seedance 2.5 at 9.0 against 8.5 for Kling 4.0 and Wan 3.0, whose wave was "a smaller splash rather than a crashing wall" ([Curious Refuge](https://curiousrefuge.com/blog/seedance-2-review); [Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). The same reviewer reportedly preferred 2.0 over 2.5 for destruction ([DomoAI](https://domoai.app/zh-hant/blog/seedance-2-5-vs-2-0)). Avoid Grok Imagine 1.5: its explosions and meteor impacts were "not production-ready" ([Curious Refuge Grok](https://curiousrefuge.com/blog/grokimagine15-review)). Write the contact points and consequences into the prompt (leaves scatter, a mug tips) so the physics has something to resolve ([fal Seedance guide](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)).

### Sound: generated audio is a temp track in beatsheet

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Gemini Omni Flash 1.1, 360p (fal or the person's Gemini key) | $0.15 | #1 on AA text-to-video Audio Synchronization; invented subjects only |
| Rough | 2 | H3 Max Turbo, 768p (fal) | $0.20 | Cheap stereo dialogue and effects |
| Final | 1 | Seedance 2.0 or 2.5 from a still, 1080p | $3.41 / $5.82 | #1 and #3 on image-to-video Audio Synchronization |
| Final | 2 | Gemini Omni Flash 1.1 from text, 1080p | $0.75 | Text-to-video leader |
| Final | 3 | Wan 3.0, 1080p | $1.00 | "Clean, in sync, and consistent"; mix runs hot |

**Confidence: medium.** AA's Audio Synchronization category covers diegetic effects, music and score, and on- and off-screen sound. It is led from text by **Gemini Omni Flash 1.1 (1189)** and from a still by **Seedance 2.0 (1143)**, Utopai X and Seedance 2.5 ([AA T2V audio sync](https://artificialanalysis.ai/video/leaderboard/text-to-video?category=audio-synchronization); [AA I2V audio sync](https://artificialanalysis.ai/video/leaderboard/image-to-video?category=audio-synchronization)). HeyGen Video 1 shows how much sound reorders the field: it is first on silent text-to-video and tenth on audio sync. H3 Max is only 13th on image-to-video audio sync. In hands-on tests, Wan 3.0's audio was clean and in sync and Seedance 2.5's room tone "very quiet". Wan's mix runs near 0 dBFS, while H3's sits far lower (−25.1 LUFS against LTX-2.5's −10.4) ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test); [Fuser](https://fuser.studio/articles/wan-3-0-vs-seedance-2-5); [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/); [ai-muninn](https://ai-muninn.com/en/blog/ltx25-vs-minimax-h3-rtx5090)). In beatsheet the cut's song and its sfx cues are the real soundtrack. Ask clips for "diegetic sound only, no score", normalize loudness, and turn generation off where it saves money: by a third on Kling 3.0 and by half on Veo. On Seedance and Wan it saves nothing ([fal Kling 3.0](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/llms.txt); [fal Seedance 2.5](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video/llms.txt)).

### Mature: implied violence passes, gore stays local

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | Wan 2.2 A14B on the 4090 | $0 | No remote filter |
| Rough | 2 | LTX-2.5 on the 4090 | $0 | Free under $10M revenue; has sound |
| Final | 1 | Wan 3.0, 1080p (fal) | $1.00 | A trident fight passed without refusal |
| Final | 2 | Kling 4.0, 1080p (fal) | $1.18 | Same test, no refusal, softened contact |
| Final | 3 | Local Wan 2.2 / LTX-2.5 for blood; Grok Imagine 1.5 (fal) as a hosted fallback | $0 / $1.25 | Grok aims for an "R-rated" standard but moderates erratically |

**Confidence: low; this rests on policies, not tests.** A policy survey finds that implied and action violence generally pass on hosted models and explicit gore is refused. Runway defines graphic violence anatomically and its moderation can't be switched off. Seedance and Dreamina allow fiction but block the "gratuitously shocking". Kling bans violence under a broad "sole judgment" clause. Grok targets "R-rated" ([GraiLogic](https://grailogic.com/articles/ai-video-censorship-2026/)). Atlas's Halloween fight with a trident ran on Kling 4.0, Seedance 2.5 and Wan 3.0 with no reported refusal, but all three softened the hits ([Atlas Cloud](https://www.atlascloud.ai/blog/tips/kling-4-vs-seedance-2-5-vs-wan-3-halloween-fight-test)). On fal, most safety checkers can be relaxed only by authorized accounts. Veo exposes a `safety_tolerance` of 1–6 and FLUX 3 one of 0–4 ([fal Veo 3.1](https://fal.ai/models/fal-ai/veo3.1/llms.txt); [fal FLUX 3](https://fal.ai/models/blackforestlabs/flux-3/image-to-video/llms.txt)). Expect softened contact rather than refusals for action, and refusals for gore everywhere hosted. Picking a reseller for being less restricted and renaming a trademarked prop to get it through both appear in tutorials, and beatsheet shouldn't copy either. Test 7 builds the refusal map beatsheet needs.

### Vertical: frame the board tall, since nothing measures 9:16

| Stage | Rank | Model and route | $/5 s | Why |
|---|---|---|---|---|
| Rough | 1 | H3 Max Turbo from a 9:16 board (fal) | $0.20 | The canvas follows the frame |
| Rough | 2 | Wan 3.0, 480p, 9:16 (fal) | $0.25 | Native 9:16 |
| Final | 1 | Seedance 2.5 from a 9:16 board, 1080p | $5.82 | Top image-to-video model |
| Final | 2 | H3 Max, 1080p | $0.80 | Value |
| Final | 3 | Wan 3.0, 1080p | $1.00 | Value |

**Confidence: low.** Every AA test clip is "16:9 horizontal", so no blind board measures vertical, and no hands-on comparison has judged 9:16 quality ([AA methodology](https://artificialanalysis.ai/methodology/video)). What is known is support. Seedance 2.5, Wan 3.0, Kling 4.0, FLUX 3, LTX-2.5, Omni and Veo all accept 9:16, and H3 and Seedance image-to-video simply take the board's shape ([fal H3](https://fal.ai/models/minimax/h3/image-to-video/llms.txt); [fal Seedance 2.5](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video/llms.txt)). That makes the board the lever. Make it 9:16 so the subject is framed for the tall format: Nano Banana 2.1 lists 9:16 natively and GPT Image takes custom sizes up to a 3:1 ratio ([fal Nano Banana 2.1](https://fal.ai/models/google/nano-banana-2.1/edit/llms.txt)). For a cut that also needs 16:9, the alternative is beatsheet's subject-following vertical reframe of a 16:9 render, and Test 2 compares the two.

## Fact sheets: where each model runs, what it costs, what it takes

beatsheet can reach only API routes: fal, the person's own OpenAI, Gemini and Meta keys, potentially Runway or HeyGen keys, and ComfyUI on the 4090. Consumer plans (Higgsfield, OpenArt, ArtCraft, Dreamina, Flow) can't be driven from beatsheet. Prices were read on 2 November 2026. "$/5 s" multiplies the per-second rate by five even where a model's minimum is longer.

### Seedance 2.5 and 2.0 (ByteDance)

| | |
|---|---|
| Runs on | fal: `bytedance/seedance-2.5/us/{text,image,reference}-to-video` and `bytedance/seedance-2.5/draft/complete`; 2.0 at `bytedance/seedance-2.0/…` with `/fast` and `/mini` tiers. Runway API. Not local. |
| $/5 s | 2.5 on fal: **$1.10 (480p), $2.37 (720p), $5.82 (1080p)**; with video inputs the rate is ×0.6, but the input video is billed too. Runway: $1.00 / $1.50 / $3.40. 2.0 on fal: $1.52 (720p), $3.41 (1080p); Fast $1.21 (720p); Mini about $0.34 (480p) and $0.76 (720p), from fal's token rate. Sound on or off costs the same. |
| Takes | Start frame plus optional end frame. Reference-to-video takes **up to 30 images, 10 videos and 10 audio clips** (50 files; video and audio each ≤30.2 s in total), with `task` set to auto, reference, editing or extension, plus `seed`. 2.0 takes 9 images, 3 videos and 3 audio clips. `draft: true` returns a `draft_id` that completes at 1080p within 14 days on fal (7 days at other providers), for the original caller only. |
| Makes | 4–30 s (2.0: 4–15 s), 480p–1080p (2.0 up to 4K); 7 aspect ratios on reference-to-video, while image-to-video follows the frame. Native sound including lip-synced speech in 11 languages. A 10 s clip took 278 s in fal's benchmark. |
| Moderation | Refuses photos of real people; synthetic characters are sometimes refused too. fal's pages say nothing about faces. Violence is allowed in fiction; gore is blocked. |
| Standing | AA image-to-video #1 (1153), text-to-video #4 (1157); #1 on Dialogue & Lip Sync and Human Anatomy for both inputs; Design Arena Multi-Image #1. Drifted a character and changed a prop's shape in two hands-on tests. |

Sources: [fal 2.5 i2v](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video/llms.txt), [fal 2.5 r2v](https://fal.ai/models/bytedance/seedance-2.5/us/reference-to-video/llms.txt), [fal draft complete](https://fal.ai/models/bytedance/seedance-2.5/draft/complete/llms.txt), [fal 2.0 i2v](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/llms.txt), [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/), [fal FLUX 3 Max release (speed)](https://www.prnewswire.com/news-releases/fal-launches-flux-3-max-delivering-1-tier-image-to-video-quality-at-industry-leading-speeds-302913033.html), [Trivium China](https://triviumchina.com/2026/02/10/bytedance-stops-uploads-of-human-photos-for-seedance-2-0/).

### Wan 3.0 and Wan 3.0 Prime (Alibaba)

| | |
|---|---|
| Runs on | fal: `alibaba/wan-3.0/{text,image,reference}-to-video` and `alibaba/wan-3.0-prime/…`. Runway. Alibaba Model Studio, where the US region is about 17% cheaper. **Closed weights**: ComfyUI's "WAN3-Prime" node is a hosted partner node, not a local model. |
| $/5 s | **$0.25 (480p), $0.50 (720p), $1.00 (1080p)**, sound included; Prime (faster) $0.34 / $0.70 / $1.40. A 30 s take at 1080p costs $6.00. Alibaba labels its matching price a limited-time 30% discount, so fal's price may rise. |
| Takes | Start frame (required on image-to-video) and end frame. Reference-to-video takes 10 images, 5 videos (≤15 s) and 5 audio clips (≤15 s), plus a document or web page with `enable_thinking`. Also `seed`, `enable_prompt_expansion` (on by default; turning it off saves 20–60 s) and `audio` (on by default; turning it off saves nothing). Resolution defaults to 1080p, so set 480p explicitly for roughs. |
| Makes | 2–30 s, 480p–1080p, 30 fps; adaptive, 16:9, 4:3, 1:1, 3:4 or 9:16. Spoken lines go in double quotes. Unprompted, it picks its own soundtrack. A 30 s take rendered in 854 s. |
| Moderation | Safety checker on by default for input and output; switching it off needs fal authorization. No published real-face rule, but it animated the photoreal frame Seedance refused. |
| Standing | **AA text-to-video #1 (1175)**, image-to-video #9 (1111). #1 from text on Camera Control, Complex Composition and Multi-Scene; only #13 on image-to-video Dialogue. Literal about products, soft on impacts, late on timed beats. |

Sources: [fal Wan 3 guide](https://fal.ai/learn/tools/how-to-use-wan-3), [fal Wan 3 Prime i2v](https://fal.ai/models/alibaba/wan-3.0-prime/image-to-video/llms.txt), [fal Wan 3 r2v](https://fal.ai/models/alibaba/wan-3.0/reference-to-video/llms.txt), [Alibaba Cloud pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing), [ComfyUI Wan 3 partner node](https://docs.comfy.org/es/tutorials/partner-nodes/wan/wan3-0.md).

### MiniMax H3, H3 Max and H3 Max Turbo

| | |
|---|---|
| Runs on | Open weights through ComfyUI on the 4090. There are two checkpoints, FL2VA (text or first/last frame) and Ref2VA (references), each about 21 GB in int8; the working set is about 42.5 GB, so a 24 GB card offloads. fal: `minimax/h3/*`, `minimax/h3-max/*` (image, text, reference, recast, director, reference-director, relight, lip-sync, extend) and `minimax/h3-max-turbo/{image,text,reference}-to-video`. Also MiniMax's own API and Runway. |
| $/5 s | H3 on fal: $0.25 (480p), **$0.30 (768p)**, $0.65 (2K upscale). **H3 Max from 16 Nov: $0.25 / $0.40 / $0.80** (480p / 768p / 1080p); 30% off until 15 Nov. **H3 Max Turbo from 16 Nov: $0.125 / $0.20 / $0.40**. Local: no fee; 81–95 s per clip of about 5 s on a 5090 (n=1). |
| Takes | Start and/or end frame; `target_audio_url` replaces the soundtrack. Reference-to-video takes 9 images, 3 videos and 3 audio clips (12 files; each 2–15 s, ≤15 s in total). `prompt_expansion_mode` is disabled, fast, balanced or quality; Turbo defaults to balanced. On fal, references are named "Image 1", "Video 1" and "Audio 1" in the prompt. |
| Makes | 5–15 s (H3 Max from 0.92 s), 24 fps, native 480p or 768p. H3 Max's 1080p is a latent refinement and H3's 2K/4K are upscales. 32 kHz stereo with dialogue in 11 languages. There is no aspect parameter: the canvas follows the frame. H3 Max takes about 3 s of wall time per 5 s clip (fal's claim). |
| License and moderation | **The open-weight license grants rights "solely within the Applicable Territory": worldwide excluding the EU, the UK, South Korea and the US.** A product using it must display "MiniMax H3", outputs may not train other models, and revenue above $20M a year needs written permission. Comfy says commercial use of locally generated output needs a MiniMax license bought through Comfy. On fal the safety checker is on by default; no real-face policy was found. |
| Standing | H3 768p: **AA text-to-video #3 (1161), image-to-video #4 (1128), arena.ai image-to-video #1 (1495)**. H3 Max: AA #7 and #8, Design Arena image-to-video #1. #1 on image-to-video Spatio-Temporal Consistency (H3 Max) and Text Rendering (H3); #2 on image-to-video Dialogue and Camera Control (H3 Max). Weak on large action and facial stability. |

Sources: [MiniMax H3 license](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE), [Comfy H3 tutorial](https://docs.comfy.org/tutorials/video/minimax/minimax-h3), [H3 model card](https://huggingface.co/MiniMaxAI/MiniMax-H3), [fal H3 i2v](https://fal.ai/models/minimax/h3/image-to-video/llms.txt), [fal H3 Max i2v](https://fal.ai/models/minimax/h3-max/image-to-video/llms.txt), [fal H3 Max release](https://www.prnewswire.com/news-releases/fal-launches-h3-max-a-new-post-trained-video-model-with-frontier-quality-and-faster-than-real-time-generation-302866462.html), [ai-muninn](https://ai-muninn.com/en/blog/ltx25-vs-minimax-h3-rtx5090). H3 Max Turbo's price and default, and fal's reference naming, come from beatsheet's own check of fal's pages on 2 November 2026.

### Kling 4.0, 3.0 and O3 (Kuaishou)

| | |
|---|---|
| Runs on | fal: `kling/v4/{image,text}-to-video`, `kling/v4/video-to-video/edit`, `fal-ai/kling-video/v3/{pro,standard}/…`, `…/o3/…`, motion control and avatar. Runway: Kling 4.0 is 20% off through 30 November. |
| $/5 s | **4.0: $0.79 (720p), $1.18 (1080p)**; Runway $0.63 / $0.94 during its promotion. 4.0 edits bill at least twice the output length. 3.0 Pro: $0.56 silent, $0.84 with sound, $0.98 with voice control; 3.0 Standard $0.42 silent. O3 Pro references: $0.56 silent, $0.70 with sound. 2.5 Turbo Pro: $0.35. |
| Takes | 4.0 on fal: start frame (required on image-to-video), end frame, **up to 8 ordered middle keyframes**, and `prompt` or `multi_prompt`. It exposes no references, sound switch, negative prompt or seed, though the vendor announced 10 reference images and voice references. 3.0: start and end frames, `multi_prompt` (≤6 shots), `elements` named `@Element1` (a frontal image plus angles, or a video), `negative_prompt`, `cfg_scale` and `generate_audio` (on by default). |
| Makes | 4.0: **3–30 s**, 720p or 1080p; text-to-video at 16:9, 9:16, 1:1 or 21:9. 3.0: 3–15 s. A 30 s 4.0 take took 498 s. |
| Moderation | Safety checker on by default. Kling's policy bans violence under a broad "sole judgment" clause. No real-face rule found. |
| Standing | 4.0 is not yet on AA or arena.ai; Design Arena image-to-video #2 (1319). The only model to orbit on request; changed voices mid-scene. 3.0 Pro is AA's anchor at 1000, 17th–19th overall. 2.5 Turbo is arena.ai #27–28. |

Sources: [fal Kling 4 i2v](https://fal.ai/models/kling/v4/image-to-video/llms.txt), [fal Kling 4 t2v](https://fal.ai/models/kling/v4/text-to-video/llms.txt), [fal Kling 4 article](https://fal.ai/learn/tools/what-is-kling-4-0), [fal Kling 3 Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/llms.txt), [fal Kling O3](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/llms.txt), [fal Kling 4 edit](https://fal.ai/models/kling/v4/video-to-video/edit/llms.txt), [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/).

### Gemini Omni Flash 1.1 (Google)

| | |
|---|---|
| Runs on | The person's Gemini API key (paid tier, `gemini-omni-1.1-flash`, about $0.10/s at 720p); fal `google/gemini-omni-flash/v1.1/{text-to-video,image-to-video,reference-to-video,edit}`; Runway. |
| $/5 s | fal: **$0.15 (360p), $0.50 (720p), $0.75 (1080p), $1.50 (4K)**; 1080p and 4K are upscaled. |
| Takes | First frame and last frame; reference images plus up to 3 reference videos of ≤3 s; an edit endpoint (video in, same length and aspect). |
| Makes | 3–10 s, extendable to 40 s on the Gemini API; 16:9 or 9:16; native sound. |
| Moderation | **Blocks real people's likenesses, including a developer's own footage**; SynthID on all output. |
| Standing | arena.ai text-to-video #1 and image-to-video #2, but AA #10 and #14. #1 on AA text-to-video UI/UX & Motion Design (1309) and Audio Synchronization (1189). Follows prompts in 81% of generations; weak on landscapes; exaggerates emotion. |

Sources: [fal Omni guide](https://fal.ai/learn/tools/how-to-use-gemini-omni-flash-1-1), [fal Omni t2v](https://fal.ai/models/google/gemini-omni-flash/v1.1/text-to-video/llms.txt), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini Omni docs](https://ai.google.dev/gemini-api/docs/omni), [Google AI forum](https://discuss.ai.google.dev/t/real-peoples-names-or-likenesses-block-on-own-footage-gemini-omni-flash-preview-skyhill-hq/179433).

### FLUX 3 and FLUX 3 Max (Black Forest Labs)

| | |
|---|---|
| Runs on | fal: `blackforestlabs/flux-3/image-to-video` and `blackforestlabs/flux-3-max/{image,text,keyframes}-to-video`; BFL's own API. |
| $/5 s | Max: $0.21 (720p) and $0.36 (1080p) on promotion until 7 Nov, then **$0.85 and $1.45**. FLUX 3: $0.85 / $1.45 / $1.60 / $2.35 (720p / 1080p / 1440p / 2160p); everything above 720p is upsampled. BFL's own Draft (HD) tier is $0.30. |
| Takes | Start frame; end frame (Max); a keyframes endpoint. `reasoning_level` defaults to high, which rewrites the prompt. `generate_audio` (on by default), `seed`, and `safety_tolerance` 0–4 (FLUX 3, default 2). No reference images. |
| Makes | 5–20 s; 8 aspect ratios including 21:9 and 9:16; 24 fps; sound with lip sync in 14+ languages, per BFL. Max made a 10 s clip in 11 s in fal's benchmark. |
| Standing | Max: AA text-to-video #5 (provisional) but **image-to-video #12 and 16th on image-to-video Human Anatomy**. FLUX 3: #2 on text-to-video Dialogue (1176); arena.ai text-to-video #3. |

Sources: [fal FLUX 3 Max i2v](https://fal.ai/models/blackforestlabs/flux-3-max/image-to-video/llms.txt), [fal FLUX 3 i2v](https://fal.ai/models/blackforestlabs/flux-3/image-to-video/llms.txt), [The Decoder](https://the-decoder.com/black-forest-labs-makes-flux-3-video-generally-available-and-claims-it-beats-seedance-2-0/), [fal FLUX 3 Max release](https://www.prnewswire.com/news-releases/fal-launches-flux-3-max-delivering-1-tier-image-to-video-quality-at-industry-leading-speeds-302913033.html).

### HeyGen Video 1, LTX-2.5, Wan 2.2, Veo 3.1 and Grok Imagine 1.5

| Model | Runs on | $/5 s | Takes and makes | Moderation | Standing and role |
|---|---|---|---|---|---|
| HeyGen Video 1 | HeyGen API only; built on MiniMax H3, per secondary sources | about $0.20 (AA's $2.40/min) | 5–15 s, 480p–2K; dialogue, room tone and effects in one pass (unverified specs) | Unknown | AA text-to-video #6 (#1 silent), image-to-video #6; #1 text-to-video Animation & Gaming. Value candidate pending integration |
| LTX-2.5 | **4090 through ComfyUI** (22B; int8/NVFP4 distilled fits 5 s clips at about 22.7 GB; 10 s runs out of memory at decode); fal Fast/Pro | fal Fast $0.45 (720p), $0.65 (1080p), $1.50 (4K), 6 s minimum; local free | Images at any frame index, first/last frame, video-to-video, audio-to-video; 6–20 s, 24–50 fps, native sound; `camera_motion` presets on fal | License free under $10M revenue | AA 947 / 918 (mid-low); the license-clean local model with sound |
| Wan 2.2 A14B / 5B | **4090 through ComfyUI** (Apache 2.0; 4-step Lightning LoRAs; 5B fits 8 GB); fal | fal A14B $0.20 (480p), $0.40 (720p); 5B $0.15 a clip; local free | About 5 s, 480p/720p, silent; Fun-Camera, Uni3C, VACE, Animate, SCAIL-2 ecosystem | No remote filter | arena.ai text-to-video #42; the free, private, trainable workhorse |
| Veo 3.1 | fal; the Gemini API's preview IDs are shut down; GA on Vertex | Lite $0.15–0.25 (720p); Fast $0.50–0.75 (1080p); Standard $1.00–2.00 (1080p) | 4, 6 or 8 s only; 16:9/9:16; 4K | `safety_tolerance` 1–6 on fal | AA 21st–24th; never in any AA category's top 10. Not recommended |
| Grok Imagine 1.5 | fal; xAI API ($0.08/s) | fal $0.40 (480p), $0.70 (720p), $1.25 (1080p) | 1–15 s; up to 7 references on fal (`<IMAGE_0>`), 14 plus 3 voices on xAI | "R-rated" target, erratic | AA 1059 / 1052; physics and action weakest. Hosted fallback for mature fiction only |

Sources: [orcarouter (HeyGen)](https://www.orcarouter.ai/blog/heygen-video-1-launch), [fal LTX-2.5 Fast](https://fal.ai/models/lightricks/ltx-2.5/image-to-video/fast/llms.txt), [LTX-2.5 card](https://huggingface.co/Lightricks/LTX-2.5), [runaihome (4090 VRAM)](https://runaihome.com/blog/ltx-2-5-local-ai-video-hardware-guide-2026/), [Wan 2.2](https://github.com/Wan-Video/Wan2.2), [fal Wan 2.2](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video), [fal Veo 3.1](https://fal.ai/models/fal-ai/veo3.1/llms.txt), [Gemini video docs](https://ai.google.dev/gemini-api/docs/video), [fal Grok 1.5](https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video/llms.txt), [xAI models](https://docs.x.ai/docs/models).

### Specialists: lip sync, drive, keyframes and upscaling

| Job | Pick | Route | $/5 s | Notes |
|---|---|---|---|---|
| A narrated line onto a board | **H3 Max lip-sync** | fal `minimax/h3-max/lip-sync/image-to-video` | $0.25 (480p), $0.40 (768p), $0.80 (1080p) | Audio 5 s–15 min; ×1.2 over 15 s; closed eyes in the portrait stay closed |
| Dubbing existing footage | **sync-3** | fal `fal-ai/sync-lipsync/v3` | $0.67 | Whole shot, 4K face, handles occlusion and profiles; picks one speaker by coordinates |
| Cheap still plus audio | Kling AI Avatar v2 Standard | fal | $0.28 | Pro $0.58 |
| Two people talking from a still | InfiniteTalk (multi) | 4090 | $0 | Apache 2.0; image-to-video drifts in color after about a minute |
| Copying movement | **SCAIL-2, Wan-Animate-2** | 4090 | $0 | SCAIL-2 works in 81-frame segments; Animate-2 adds a text-driven camera viewpoint |
| Copying movement without the 4090 | Kling v3 Motion Control | fal | $0.84 Pro, $0.63 Standard | Driving clip ≤30 s |
| Exact keyframes, HDR, EXR | Luma Ray 3.2 | fal | $0.15 (540p) to $1.20 (1080p) | Up to 64 keyframes on fal; no native sound |
| Upscaling real faces | Topaz Precision | fal | about $0.10 to 1080p | Non-generative |
| Cheap upscaling | SeedVR2 | 4090 or fal | $0 / about $0.25 | Batches of 5+ for temporal consistency; large batches exceed 24 GB |

Sources: [fal H3 Max lip-sync](https://fal.ai/models/minimax/h3-max/lip-sync/image-to-video/llms.txt), [sync-3](https://sync.so/docs/models/sync-3), [fal sync v3](https://fal.ai/models/fal-ai/sync-lipsync/v3/llms.txt), [fal Kling Avatar](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro), [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk), [ComfyUI SCAIL-2](https://docs.comfy.org/tutorials/video/zai/scail2), [Wan-Animate-2](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B), [fal Kling Motion Control](https://fal.ai/kling-motion-control), [fal Ray 3.2](https://fal.ai/models/luma/agent/ray/v3.2/image-to-video/llms.txt), [fal Topaz](https://fal.ai/models/topaz/upscale/video/precision), [fal SeedVR](https://fal.ai/models/fal-ai/seedvr/upscale/video).

### Stills for boards and sheets

| Model | Runs on | $/image | Takes | Moderation | Standing and role |
|---|---|---|---|---|---|
| **GPT Image 2.5 Sunburst** | OpenAI key or fal `openai/gpt-image-2.5/sunburst/*` | $0.013 medium, $0.053 high (1024²) | 16 references; up to 3840 px long edge, ratio ≤3:1; transparent backgrounds | Strictest on wardrobe (GPT Image 2 refused 4 of 4 swimwear and boudoir prompts); real-person edits need consent | **#1 on all four image boards**; sheets, products, likeness |
| **GPT Image 2.5 Flare** | OpenAI key or fal `…/flare/*` | Same price, faster | Same | Same | #2; fast boards and lettering |
| **Nano Banana 2.1** | Gemini key ($0.034 at 1K, $0.050 at 2K, $0.113 at 4K) or fal (about $0.040) | As listed | 14 references including 4 characters; 14 aspect ratios including 9:16 and 21:9 | `safety_tolerance` 1–6 on fal; Nano Banana 2 reportedly added limits on public figures and real-person face or outfit swaps; SynthID | arena.ai #5, AA #4; photographic boards, locations, vertical |
| Muse Image | fal `meta/muse-image/*` | **$0.01** | 1–10 references; fixed at about 2.5 MP | No safety options on fal | AA #8 at $10 per 1,000 images; rough boards |
| Seedream 5.0 Pro | fal `bytedance/seedream/v5/pro/*` | $0.0675 (tentative) | 10 references | Checker on by default | AA #16 (edit #9); a second opinion on face structure |
| Nano Banana Pro | Gemini key or fal | $0.134–0.15 | 6 objects, 5 characters, 3 style references | — | AA #11; warm cast on edits; boards with more than 4 recurring characters |
| Nano Banana (2.5 Flash Image) | Gemini key or fal | $0.039 | — | — | **arena.ai #36, AA #59; shuts down 15 March 2027** |

Sources: [arena.ai T2I](https://arena.ai/leaderboard/text-to-image), [arena.ai edit](https://arena.ai/leaderboard/image-edit), [AA T2I](https://artificialanalysis.ai/image/leaderboard/text-to-image), [AA editing](https://artificialanalysis.ai/image/leaderboard/editing), [fal GPT Image 2.5](https://fal.ai/learn/devs/gpt-image-2-5-vs-gpt-image-2), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini deprecations](https://ai.google.dev/gemini-api/docs/deprecations), [Gemini image docs](https://ai.google.dev/gemini-api/docs/image-generation), [fal Muse](https://fal.ai/models/meta/muse-image/edit/llms.txt), [fal Seedream 5 Pro](https://fal.ai/models/bytedance/seedream/v5/pro/edit/llms.txt), [Dream Pixel Forge](https://www.dreampixelforge.com/blog/ai-image-generator-censorship-map).

## Prompting recipes: write once, render in each model's dialect

A handful of rules hold across every model. **From a board, describe what moves, not what the board shows.** Runway's host guide says re-describing the still produces "near-static loops", and LTX's guidance says it causes identity drift ([Runware](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion); [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)). MiniMax H3 is the exception, because its text encoder never sees the pictures. Give **one camera move per shot with a pace word**, and state holds positively ("locked-off camera", "the subject holds still"); without a direction Kling defaults to "mostly static or slightly drifting" ([fal Kling 3.0](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)). Budget **about one beat per two seconds and at most 2.5 spoken words per second**, minus a little slack. Dialogue that speeds up means too many words for the duration, and padding a clip by 2 s gives it room. Use quotation marks only around dialogue, because quotes used for emphasis can make a character say the word aloud. Say **"one continuous shot, no cuts"** on models that cut on their own (Omni, Wan 3.0, Seedance), because beatsheet makes the cuts ([Gemini Omni docs](https://ai.google.dev/gemini-api/docs/omni)). Give every reference a numbered name and a role in the upload order, because characters swap roles when the order slips. Repeat a fixed look block (camera body, lens, format, grade) in every prompt. In beatsheet it should come from the project's shared `look`. Finally, turn off the model's own prompt rewriting whenever beatsheet writes a full prompt.

The default sound line for a clip should be "diegetic sound only, no score, no on-screen text", phrased as what is there rather than what isn't where the model dislikes negation. The cut's song and narration live in beatsheet. On Seedance the guidance conflicts: fal's guide recommends "no music", while community testers say "no X" can produce X ([fal Seedance guide](https://fal.ai/learn/tools/seedance-2-0-prompting-guide); [BigMotion](https://www.bigmotion.ai/user-guide/seedance-2-0-tips-troubleshooting)). Writing the soundtrack positively ("room tone and footsteps only") satisfies both.

| Model | Prompt shape | Reference names | Settings to change |
|---|---|---|---|
| Seedance 2.5 / 2.0 | Subject and action in the first 20–30 words; one action and one move per shot; "cut to" or timed shots | `@Image1`, `@Video1`, `@Audio1`, each with a stated role | `draft: true`, then complete by `draft_id`; `seed` on reference-to-video |
| Wan 3.0 | An overall line, then either "one continuous shot" or numbered, timed shots; shot size plus one move | "Image 1", "Video 1", "Audio 1" by position | `enable_prompt_expansion: false` above about 60 words; `resolution` set explicitly |
| H3 / H3 Max / Turbo | Three fields: `integrated_multimodal_description` (`[Shot N]`, `mm:ss.mmm` cut times), `overall_soundscape`, `non_diegetic_music` | fal: "Image 1", "Video 1", "Audio 1"; other hosts document `<Picture 1>` | `prompt_expansion_mode: disabled` |
| Kling 4.0 | 2–5 sentences per shot in `multi_prompt`; keyframes in `middle_image_urls` | None on fal (frames only) | None exposed |
| Kling 3.0 / O3 | 2–5 sentences; up to 6 labeled shots in 15 s | `@Element1` (3.0); `@Image1`, `@Element1` (O3) | `generate_audio: false`; `cfg_scale` 0.5, or 0.7 for precision; default negative prompt plus named artifacts |
| Gemini Omni Flash 1.1 | Camera first; `[0-3s]` timecodes | `<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>`, `<VIDEO_REF_0>` (from 0) | None; exclusions go in the prompt |
| FLUX 3 / Max | A prose shot brief | None | `reasoning_level: low` when the prompt is complete (to test) |
| LTX-2.5 | One present-tense paragraph, action first, 4–8 sentences, under 200 words | — | `enhance_prompt` off; no negatives (CFG 1) |
| Wan 2.2 (local) | 80–120 words in camera order; one shot size and one move; about 5 s | — | Prompt extension off; keep the default negative prompt |
| GPT Image 2.5 | Scene, subject, details, constraints; state the use | "Image 1: …", up to 16 | `quality` medium for boards, high for text, faces and likeness |
| Nano Banana 2.1 | Full sentences, briefed like an artist | "Image 1" with a role; 4 character slots of 14 | Thinking `minimal` for fast passes; 2K and the aspect ratio set explicitly |

**Seedance 2.5 and 2.0.** The first 20–30 words carry the most weight, so open with the subject and the core action and cut stacked adjectives to one strong word ([invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)). Give every file a job: "@Image1 is the first frame; @Image2 is Mia's face and wardrobe; @Video1 is the camera move; @Audio1 is Mia's voice." Quote every spoken line with a speaker label and a tone note. Dialogue written as plain prose reportedly comes back as burned-in subtitles ([ofox](https://ofox.ai/blog/how-to-use-seedance-2-0-prompt-guide-fixes-free-access-2026/)). State the camera distance for small subjects. Describe contact points and their consequences. Iterate in draft mode and complete the chosen take by its `draft_id` within 14 days on fal; re-uploading a downloaded draft starts a new, unrelated generation ([fal draft complete](https://fal.ai/models/bytedance/seedance-2.5/draft/complete/llms.txt)). There is no negative-prompt field.

**Wan 3.0.** Turn `enable_prompt_expansion` off for detailed prompts. It rewrites the prompt and can drop details, and seeds reproduce less reliably when it is on ([fal Wan 3 guide](https://fal.ai/learn/tools/how-to-use-wan-3); [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)). Ask for one continuous shot: **a four-word prompt was auto-cut into five shots in five seconds**. For deliberate coverage, write an overall line and then numbered shots with time ranges, keeping the character description in the shared opening. Name a shot size with the move ("medium close-up, slight low angle, slow push in"), and name the face if it should appear. Refer to references by position ("the woman in Image 1 walks past the bus in Video 1"). Quote lines with emotion, tone, speed and accent, at about two short sentences per 5 s. State the sound you want, because silence about sound gets a soundtrack. Normalize loudness afterwards, since the mix runs near 0 dBFS.

**MiniMax H3, H3 Max and Turbo.** This family's text encoder never sees the images. Describe the board at 0.00 (style, subject, composition) and then move forward in time ([H3 prompt guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md); [Sogni](https://docs.sogni.ai/models/minimax-h3/)). Use the three official fields. Shot 1 has no timestamp; later shots open with strictly increasing `mm:ss.mmm` cut times, and each cut must add new information. `overall_soundscape` is 1–4 sentences that never repeat the dialogue. `non_diegetic_music` describes instruments, tempo and dynamics, or is "N/A", which in beatsheet it usually should be. Give speakers stable IDs (S1) and describe each voice on first appearance. Keep identity and action outside the dialogue tag, which holds only the language tag and the exact words. For voiceover, say it is off-screen and the lips stay closed. With first and last frames, describe the path between them in a single shot. Write camera moves as natural actions in the sentence, not labels tacked on the end. On fal, name references "Image 1", "Video 1" and "Audio 1", give each a job, and say which wins when two conflict. Set `prompt_expansion_mode` to disabled whenever beatsheet writes the structured prompt. Community users report poor prompt adherence from loose prompts and advise having a strong LLM write the structured fields ([HF discussion](https://huggingface.co/MiniMaxAI/MiniMax-H3/discussions/83)).

**Kling 4.0 and 3.0.** Write 2–5 short sentences per shot: subject, motion, camera, atmosphere. From a board, write motion and camera only, and always name a move ([fal Kling 3.0](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)). On 4.0, put timed shots in `multi_prompt` and keyframes in `middle_image_urls`, and describe the path between keyframes. With no seed exposed, expect variance and budget extra takes. On 3.0, use `@Element1` for cast members. Use unique speaker labels, put the action before each line, and write "Immediately" at speaker switches, or the speech merges ([fal blog](https://blog.fal.ai/kling-3-0-prompting-guide/)). Keep the default negative prompt and add the specific artifacts you see. Clips of 3–6 s hold together better than longer ones.

**Gemini Omni Flash 1.1.** Open with the camera, then subject, action, setting and light. Tag inputs (`<FIRST_FRAME>`, `<IMAGE_REF_0>`) and say whether each picture is a frame or a reference ([Gemini Omni docs](https://ai.google.dev/gemini-api/docs/omni)). Use `[0-3s]` timecodes to place beats on the music. Exclusions can be written plainly ("no dialogue"), and quoted on-screen text renders readably. For edits, keep the instruction short and add "keep everything else the same". Never give it a real person.

**LTX-2.5, Wan 2.2 and FLUX 3 Max.** LTX wants one chronological paragraph that starts with the action. It ignores shot lists, labels like "Camera:" and negatives. Name light as a physical source with a direction, give one camera move and what the frame looks like after it, and describe only the change on image-to-video, ending in a final state ([LTX-2 README](https://github.com/Lightricks/LTX-2); [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)). Wan 2.2 locally wants 80–120 words in the order the camera sees things, one shot size and one move, and about 5 s. Describing foreground against background motion gives parallax, and an empty prompt animates a board ([aistudynow](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/); [Wan 2.2](https://github.com/Wan-Video/Wan2.2)). No official FLUX 3 video prompting guide was found. Turning `reasoning_level` down when beatsheet's prompt is complete is an inference to test.

**Boards and sheets.** For GPT Image 2.5, order the prompt as background, subject, details, then constraints. State the use ("a storyboard frame for a 9:16 video"), label inputs "Image 1: Mia's face", and repeat a preserve list on every edit ([OpenAI image prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)). For Nano Banana, write full sentences as if briefing an artist, lock identity by naming the image to keep, and edit rather than re-roll ([Nano Banana Pro guide](https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n)). Two sheet details from tutorials are worth testing against beatsheet's current sheet prompt, which uses front, three-quarter and side views on light gray. One recommends a **mid-gray** background because white overexposes when the sheet is used as a reference. Another recommends showing the **face only once**, with a headless full-body view, so the video model isn't offered several faces to choose from.

## Tutorials: right about the workflow, wrong about one answer

Six popular tutorials were read for this report. They aren't named here, so their points carry no citation. All six are monetized by a generation platform or reseller, only one says "sponsored" aloud, and YouTube's paid-promotion flag was empty on all six. **Seedance 2.5 is the hero model in all six**, across four different platforms, so the pick is less likely to be sponsor-driven. But none of the six compared it against H3 or Wan 3.0 with references, and none animated a real person through a sanctioned route.

What they add holds up well and maps onto beatsheet directly. The pipeline is sheets first, then reference-to-video with numbered references in upload order, then a long structured prompt written by an LLM "skill", then a draft at 480p, then 1080p. That is beatsheet's boards, roughs and finals with an agent in the middle. The most transferable lesson is to write the script as on-set direction: camera position, blocking, how long each beat holds, micro-expressions, delivery, accents, and the surface a sound lands on, so a phone thrown on grass thuds instead of clacking. The most useful result is a negative one: a short sample of a presenter's own voice couldn't produce convincing new lines in that voice. The lip-sync failure modes are heavy action during speech, lines too long, references under about 3 s, and stray quotation marks. That supports beatsheet's own approach of a real or TTS line per take. Motion transfer adds the drive lessons and two spending gates. A human reviews the control mask before any paid draft and approves before the 1080p finish, which fits beatsheet's `choose` and `review` hand-offs and its spending limit. The realism vocabulary is reusable: handheld micro-shake, crash zoom, focus hunting, exposure that adjusts between inside and outside, and deliberately low resolution for found footage.

| Claim | Verdict |
|---|---|
| Seedance 2.5 is the best video model | **Partly.** #1 on AA image-to-video, dialogue and human anatomy; tied on text-to-video; costs 7–14× H3 or HeyGen per minute; refuses real people |
| Draft at 480p, then "upscale" | **Wrong word.** The 1080p pass is a native re-render reusing the draft's prompt, inputs and seed, so details change ([Flick](https://flick.art/es/blog/seedance-2-5-draft-mode)). Complete by task ID; never re-upload |
| Drafts stay valid for 7 days | **Depends on the host.** 14 days on fal, 7 elsewhere ([Oxen](https://docs.oxen.ai/inference-api/reference/models/walkthroughs/seedance_2_5_draft_mode)) |
| Kling 4 is "about to launch" | **Out of date.** Flash shipped 28 Sep and the full model mid-October; it is on fal now |
| FLUX 3 gives 80–90% of Seedance for much less | **True from text, not from a still.** FLUX 3 Max ties Seedance 2.5 at 1157 on text-to-video but is 12th on image-to-video |
| H3 Max is much worse for realism without references | **One action-heavy prompt.** H3 is weak at big action, but H3 Max is #2 on silent text-to-video |
| Seedance 2.5 takes 10,000 characters | **Low.** A reseller lists 15,000 ([useapi.net](https://useapi.net/blog/260807)) |
| Wrap voice references as black MP4s, not MP3s | **Untested folk practice.** Nothing documents it; Test 1 checks it |
| One pangram or emotion sample locks a voice | **Contradicted by a tutorial's own test** for known human voices; record the real lines |
| Music is one of two things that trigger Seedance's block | **Unconfirmed** by any source |
| The Chinese Seedance has fewer restrictions; one reseller is the "official" API | **Vendor claims only** |
| Rename a trademarked prop, or hide faces and alter voices, to get past the filter | **Filter evasion.** Don't adopt |
| GPT Image 2.5 Sunburst (or GPT Image 2) for people and products | **Supported.** #1 on all four image leaderboards |

## Catalog changes: add Wan 3.0, Seedance 2.5 and Kling 4.0; gate local H3

Two structural changes matter more than any single model. First, offer models as **families with a rough tier and a final tier**: Seedance 2.5 draft to final, Wan 3.0 at 480p to 1080p, H3 Max Turbo to H3 Max. That way the take the person approves at $0.20–1.10 survives into the final. Second, run an **eligibility check before ranking**. Does the shot contain a real person (no Seedance, no Omni)? Where is the person (no local H3 in the US, EU, UK or South Korea)? Is it mature (local first)? Does it need more than 15 s (Seedance, Wan or Kling 4.0 only)? Refusals and licenses remove more candidates than quality does.

| Change | Model | Route | Why |
|---|---|---|---|
| Replace | Nano Banana (2.5 Flash Image) → **Nano Banana 2.1** | Gemini key or fal | Shuts down 15 Mar 2027; rises from arena.ai #36 to #5 at about the same price; 14 references, 9:16 and 21:9 |
| Upgrade | GPT Image → **GPT Image 2.5** (Flare for boards, Sunburst for sheets, products and likeness) | OpenAI key or fal | #1–2 on all four image boards; 16 references; medium quality ($0.013) is under the catalog's "about 3¢" |
| Keep | Muse Image | fal | $0.01, AA #8: the rough-board model |
| Add | **Wan 3.0** (480p rough, 1080p final, references) | fal | AA text-to-video #1; animated a photoreal speaker; 30 s; $0.25–1.00 per 5 s |
| Add | **Seedance 2.5** with draft and complete, plus 2.0 for destruction and sound | fal US; Runway as a cheaper second route | AA image-to-video, dialogue and anatomy #1; invented characters only; store `draft_id` with the take |
| Add | **Kling 4.0** | fal (Runway 20% off to 30 Nov) | Orbits, 8 middle keyframes, timed 30 s takes |
| Keep | H3 Max (final), H3 Max Turbo (rough), H3 768p (value final) | fal | Top cluster at the lowest prices. The H3 Max 768p rate is $0.08, not H3's $0.06; the catalog's $0.16 (1080p) and Turbo's $0.04 (768p) apply from 16 Nov |
| Gate | **MiniMax H3 on ComfyUI** | 4090 | License excludes the US, EU, UK and South Korea; the UI must show "MiniMax H3"; Comfy sells the commercial license for local output |
| Add | **LTX-2.5** on ComfyUI | 4090 | The license-clean local model with sound (free under $10M revenue); 48/50 fps for slow motion |
| Add | H3 Max lip-sync; sync-3 | fal | Puts beatsheet's narrated voice on a board; dubs existing footage |
| Upgrade | Wan 2.2 Animate → **Wan-Animate-2**; add Kling v3 Motion Control | 4090; fal | Apache 2.0 with a camera viewpoint; drive for machines without the 4090, up to 30 s |
| Demote | Kling 3 Pro | fal | Mid-pack everywhere on AA; keep it only for `@Element` references and Motion Control until Kling 4.0 exposes references |
| Remove | Kling 2.5 Turbo Pro | fal | arena.ai #27–28, absent from AA; H3 Max Turbo is cheaper ($0.20 against $0.35 per 5 s) and the H3 family ranks far higher |
| Remove | Wan 2.2 A14B on fal | fal | Wan 3.0 at 480p costs about the same, has sound and ranks first; keep Wan 2.2 locally |
| Keep | Wan 2.2 A14B and 5B locally | 4090; smaller GPUs | Free, private, no remote filter, LoRAs; 5B fits 8 GB |
| Optional | Gemini Omni Flash 1.1 | Gemini key or fal | Text-to-video sound and motion-design roughs at $0.15; never for real people |
| Watch | HeyGen Video 1, FLUX 3 Max, P-Video-2-Pro | HeyGen API, fal | Cheap members of the top cluster; FLUX 3 Max is weak from a still; HeyGen and P-Video need integration or confirmation |
| Don't add | Veo 3.1, Sora, Runway Gen-4.5, Pika 2.2, Hailuo 2.3, Kling O1 | — | Sora's API closed 24 Sep 2026; the rest sit 100–300 Elo below the top |

The H3 gate deserves care. The license grants rights "solely within the Applicable Territory" and bars using outputs outside it, which is hard to square with publishing a video online. Comfy's tutorial says "commercial use of locally generated outputs requires a MiniMax commercial license from Comfy" ([MiniMax H3 license](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE); [Comfy H3 tutorial](https://docs.comfy.org/tutorials/video/minimax/minimax-h3)). For a person in an excluded territory, beatsheet should default the H3 route to fal and show why. fal's own terms for H3 and its post-trained H3 Max weren't read, so beatsheet should confirm that fal's terms cover output used in the US before treating that route as fully clear. Two fal endpoints beatsheet should not wire are deprecated on 5 November 2026: Luma Ray 2 Modify and Decart Lucy Edit Pro ([fal Ray 2 Modify](https://fal.ai/models/fal-ai/luma-dream-machine/ray-2/modify); [fal Lucy Edit](https://fal.ai/models/decart/lucy-edit/pro)).

## Eight side-by-side tests to run before trusting the ranks

Every hands-on comparison above used one seed, and AA doesn't test vertical, long, real-person, animal or mature shots. beatsheet is also unusually well placed to run its own arena. Run each test with **3 seeds or takes per model**. Write the prompt once and render it through each model's dialect, with prompt rewriting off, plus one run with it on for Wan 3.0 and H3 to measure the difference. Show the results in a `choose` hand-off with model names hidden, and log cost and wall-clock time to `spent.jsonl`. Promotions affect timing: H3 Max is 30% off until 15 November, and FLUX 3 Max is 75% off until 7 November if it joins a test. The eight tests below cost roughly **$300–350 at today's list prices**.

| # | Shots | Models | What to measure | Approx. cost |
|---|---|---|---|---|
| 1 | **Real person speaks one line.** Boards from the person's own photos (GPT Image 2.5 Sunburst and Nano Banana 2.1); a 6 s locked medium close-up with a 12-word line | Wan 3.0 720p; H3 Max 768p; Kling 4.0; Kling 3.0 Pro with an Element; H3 Max lip-sync with the line from `narrate`; one Seedance 2.5 run to see whether fal's US endpoint refuses. On H3 reference-to-video, the voice as WAV against a black MP4 | Refusal, identity hold (blind pick), lip sync, word errors | $15 |
| 2 | **Does the rough survive the final?** Three boards (product push-in, walk-and-talk, street establishing), each at 16:9 and 9:16 | Seedance 2.5 draft → complete; Wan 3.0 480p → 1080p, same seed; H3 Max Turbo 768p → H3 Max 1080p, same seed; plus beatsheet's vertical reframe of the 16:9 final against native 9:16 | Whether the picked rough's framing, motion and timing carry over; cost per kept shot; native 9:16 against reframed | $50–75 |
| 3 | **Contact and action.** A hug, a handshake, a shove that lands, a fall; 5 s each | Seedance 2.5 720p, Kling 4.0, Wan 3.0, H3 Max, against drive from a self-filmed reference with Wan-Animate-2 and SCAIL-2 (local) and Kling v3 Motion Control | Limb count, weight, whether contact lands; prompted against driven | $55 |
| 4 | **Camera moves.** On one board: a 180° orbit, a crane up, a whip pan, a slow push-in timed to a bar, a handheld follow | Kling 4.0 (with middle keyframes for the orbit), Seedance 2.5 draft from text and with a reference clip of the move, Wan 3.0, H3 Max, Luma Ray 3.2 keyframes at 540p | Move executed or substituted; timing error in frames against the bar | $65 |
| 5 | **One long take against stitched clips.** A 30 s two-person scene with four timed beats and three lines | Kling 4.0 720p, Wan 3.0 720p, Seedance 2.5 draft, each as one take split with `split_at_cuts`, against six 5 s H3 Max and Wan 3.0 clips | Beat timing, continuity of positions and wardrobe, dialogue pacing (the long-take claim from the tutorials) | $40 |
| 6 | **Animals and a specific pet.** Boards from the person's pet photos; a dog running at the camera, a cat jumping onto a counter, a horse trotting | Seedance 2.5 720p, Kling 4.0, Wan 3.0, H3 Max | Gait, fur, whether the pet still looks like itself | $35 |
| 7 | **Mature refusal map.** 12 prompts graded from a shove to stage blood to a wound to a horror creature; 5 s at 480p | Wan 3.0, Kling 4.0, Seedance 2.5, H3 Max, Grok 1.5 on fal; Wan 2.2 and LTX-2.5 locally | Pass, soften or refuse per prompt; whether refusals are billed | $35 |
| 8 | **Text that must survive motion.** A GPT Image 2.5 board of a product with a 3-word label and a 10-word ingredient line, plus a shop sign; 5 s push-in | H3 768p, H3 Max, Wan 3.0, Seedance 2.5, Kling 3.0 Pro; Omni Flash 1.1 from text | Legibility (OCR) on the first, middle and last frames | $15 |

Run Tests 1 and 2 first. Test 1 decides who handles real people, which is the eligibility question most likely to change the catalog. Test 2 decides whether the rough-then-final economics in the ranked tables work at all.

## Conclusion

The leaderboards no longer reward picking a winner. They reward routing. Three findings change how beatsheet should think about its catalog. First, the value frontier has moved to models derived from one open checkpoint: H3, H3 Max, HeyGen Video 1 and Utopai X all sit in the top cluster, and more post-trains will follow. A catalog built around families with a cheap rough tier and a final tier will absorb them more easily than one built around brand names. Second, **refusals and licenses now decide more picks than quality does**. Seedance's face filter, Omni's likeness block and H3's territorial license each remove a top-tier model from whole classes of shot. An eligibility check per route (real person, territory, mature, length) belongs ahead of any ranking, and it is cheap to build because beatsheet already knows which cast members came from real photos.

Third, the evidence gap is an opportunity. The public boards test 10-second horizontal clips of invented scenes. beatsheet's people make vertical cuts, long takes and shots of themselves and their pets, and they already pick between takes in `choose` hand-offs. Logged with the model hidden, those picks form a blind, per-shot arena that no public board has. After the eight tests above, beatsheet's own data should outrank everything in this report for the shots its people actually make.
