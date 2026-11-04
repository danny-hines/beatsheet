# Hosted AI video generation models, as of 2026-11-02

All pages were opened on 2026-11-02, so every price below is "seen 2026-11-02" unless another date is given. fal prices come from each model's `https://fal.ai/models/<endpoint-id>/llms.txt` page, which is more detailed (and sometimes different) than the summary table at fal.ai/pricing (see the landscape section). "s" means per second of output video.

---

## Landscape: what is current, what is gone, and who ranks where

### Takeaway
The field moved a lot in 2026. Sora is gone: the Sora 2 API was removed on 2026-09-24. The Veo 3.1 *preview* models are shut down in the Gemini API, and Google now steers developers to Gemini Omni Flash 1.1. The top of the independent leaderboards now holds Gemini Omni Flash, Seedance 2.5/2.0, Wan 3.0, MiniMax H3 (and fal's H3 Max), FLUX 3 / FLUX 3 Max, Grok Imagine 1.5, HappyHorse, HeyGen Video 1 and P-Video-2-Pro. Kling 3.x, Veo 3.1, Runway Gen-4.5, Luma Ray, Vidu, PixVerse and LTX are now mid-table. Kling 4.0 (October 2026) is on fal but not yet ranked.

### Cited Findings
- **Arena text-to-video board (snapshot 2026-09-21, 718,577 votes, 48 models):** 1 Gemini Omni 1.1 Flash 1516; 2 gemini-omni-flash 1513; 3 FLUX 3 Video 1493; 4 Grok Imagine Video 1.5 1492; 5 Seedance 2.0 (720p) 1479; 6 Wan 3.0 1476; 7 Seedance 2.5 (720p) 1474; 8 MiniMax H3 1460; 9 Meta Muse Video 1456; 10 HappyHorse 1.0 1427; 11 Sora 2 Pro 1368; 12–15 Veo 3.1 variants 1358–1364; 20 Wan 2.7 1337; 26 PixVerse V5.6 1240; 27 Runway Gen-4.5 1225; 28 Kling 2.5 Turbo 1080p 1220; 29 Kling 2.6 Pro 1216; 31 Luma Ray3 1206; 32 Hailuo 2.3 1206; 33 Kling O1 Pro 1205; 41 LTX-2 19B 1154; 42 Wan 2.2 A14B 1132; 47 Pika 2.2 1009. FLUX 3 Video and Grok 1.5 are flagged "Preliminary". — [Arena](https://arena.ai/leaderboard/video/text-to-video)
- **Artificial Analysis text-to-video board (Elo; price = the creator's API cost for one minute, at 1080p where offered):** 1 Wan 3.0 1175 (Aug 2026, $12.00/min); 2 Utopai X 1166 (Sep 2026, no API); 3 MiniMax H3 768p 1161 (Jul 2026, $4.80); 4 Seedance 2.5 1157 (Jul 2026, $34.12); 5 FLUX 3 Max 1157 (Oct 2026, $4.35); 6 HeyGen Video 1 1156 (Oct 2026, $2.40); 7 MiniMax H3 Max (fal) 1149 (Aug 2026, $9.60); 8 FLUX 3 1144 (Jul 2026, $17.40); 9 Seedance 2.0 1136 (Mar 2026, $22.45); 10 Gemini Omni Flash 1.1 1128 (Aug 2026, $9.12); 11 P-Video-2-Pro 1125 (Sep 2026, $5.70); 13 Grok Imagine Video 1.5 1059 (May 2026, $15.00); 14 HappyHorse-1.1 1050 (Jun 2026, $10.80); 15 MAGI-2 Preview (Sand.ai) 1044 (Sep 2026, "coming soon"); 16 Wan2.7 1037; 17 HappyHorse-1.0 1032 (Apr 2026); 18 Kling 3.0 Omni 1080p Pro 1023 (Feb 2026, $8.40); 19 Kling 3.0 1080p Pro 1000 (the anchor; $10.08); 20 Grok 1.5 Lite 991 (Aug 2026, $8.40); 21 PixVerse V6 984 (Mar 2026, $6.90); 22 Veo 3.1 962 (Jan 2026, $24.00); 23 Veo 3.1 Fast 958 ($7.20); 24 Veo 3.1 Lite 953 (Mar 2026, $4.80); 25 LTX-2.5 Fast 947 (Aug 2026, $7.80); 26 LTX-2.5 Pro 944 ($10.20); 27 Vidu Q3 Pro 936 (Jan 2026, $7.20); 28 Vidu Q3 Turbo 916 (Feb 2026, $3.90). — [Artificial Analysis T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video)
- **Artificial Analysis image-to-video board (with audio by default):** 1 Seedance 2.5 1153; 2 Utopai X 1146 (no API); 3 Seedance 2.0 1136; 4 MiniMax H3 768p 1128; 5 Hyperflow H3 (Video Rebirth, Sep 2026, $9.00/min) 1124; 6 HeyGen Video 1 1120; 7 P-Video-2-Pro 1119; 8 H3 Max (fal) 1117; 9 Wan 3.0 1111; 10 Agnes-Video-2.5 (Sapiens AI, $2.40/min) 1100; 11 FLUX 3 1071; 12 FLUX 3 Max 1064; 13 Grok 1.5 1052; 14 Gemini Omni Flash 1.1 1046; 15 HappyHorse-1.1 1037; 16 HappyHorse-1.0 1027; 17–18 Kling 3.0 Pro and Kling 3.0 Omni Pro 1000; 19 Grok 1.5 Lite 999; 20 PixVerse V6 959; 21 Veo 3.1 957; 22 Veo 3.1 Fast 937; 23 Vidu Q3 Pro 930; 24 Veo 3.1 Lite 929; 25 LTX-2.5 Fast 918; 26 LTX-2.5 Pro 910; 27 Vidu Q3 Turbo 899. A filter switches between "With Audio" and "No Audio" results. — [Artificial Analysis I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)
- An independent October 2026 overview (published 2026-10-13, prices checked the week of 2026-10-08) says the text-to-video board "was reset to a new version this summer", so spring 2026 scores are on a different scale. — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- **fal's video catalog (featured and new, 2026-11-02):** FLUX 3 Max (t2v, i2v, keyframes-to-video), Kling 4.0 (`kling/v4/image-to-video`, `kling/v4/text-to-video`), MiniMax H3 Max (t2v, i2v, reference-to-video, recast, director, reference-director, relight, lip-sync/image-to-video, extend-video), H3 Max Turbo (i2v, t2v, reference-to-video), Seedance 2.5 US (t2v, i2v, reference-to-video), MiniMax H3, FLUX 3, Wan 3.0 Prime, LTX 2.5, Grok Imagine 1.5, plus "world models" (`robbyant/lingbot-world-2`, `alibaba/abot-world-0`). — [fal models list](https://fal.ai/models?categories=text-to-video)
- **The fal.ai/pricing summary table disagrees with the model pages** for several models. It lists Kling v3 Standard and Pro both at "$0.14 per seconds", Grok Imagine 1.5 i2v at "$0.01 per seconds", PixVerse V6 at "$0.005 per seconds" and H3 Max at "$0.05". The model pages give tiered prices (below). Trust the per-model llms.txt pages. — [fal pricing](https://fal.ai/pricing)
- **The Runway API resells many third-party models** at per-second prices: Kling 3.0/O3/4.0, Seedance 2.0/2.5, Wan 3, Grok 1.5, MiniMax H3/H3 Max, HappyHorse, Veo 3.1, Gemini Omni Flash. It is a second route to most of them (prices in each section). — [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/)

### Inferences
- For a "what's best now" ranking, the strongest independent signals are Artificial Analysis (both boards, opened 2026-11-02) and Arena (2026-09-21 snapshot). The two disagree on Kling and Gemini Omni, so use both and weigh image-to-video more heavily, since beatsheet mostly animates boards.
- Kling 4.0, FLUX 3 Max (I2V Elo is preliminary) and Seedance 2.5 on fal are the newest additions. Their quality claims are mostly the vendor's own so far.

### Gaps
- No ranking for Kling 4.0 on either board yet.
- Utopai X, Hyperflow H3, Agnes-Video-2.5 and MAGI-2 rank highly but were not researched further (Utopai X has no API per AA; MAGI-2 is "coming soon"). Whether Hyperflow H3 or Agnes are on fal: unknown.

---

## Google: Gemini Omni Flash (1.0 and 1.1)

### Takeaway
Gemini Omni Flash 1.1 is Google's current video model and tops Arena text-to-video. On fal it is cheap and flexible: $0.03/s at 360p up to $0.30/s at 4K, with text, image (first and last frame), reference and edit endpoints, and native audio. It is short (up to 10 s per call) and 16:9 or 9:16 only. Its likeness filter blocks real people, even in the person's own footage.

### Cited Findings
- **fal endpoints:** `google/gemini-omni-flash/v1.1/text-to-video`, `google/gemini-omni-flash/v1.1/image-to-video`, `google/gemini-omni-flash/v1.1/edit`, `google/gemini-omni-flash/v1.1/reference-to-video`. — [fal guide, updated 2026-09-06](https://fal.ai/learn/tools/how-to-use-gemini-omni-flash-1-1)
- **fal price (same on all four endpoints, per second of output):** 360p $0.03, 720p $0.10, 1080p $0.15, 4K $0.30. There is no separate audio charge. Edit is billed on the length of the returned video. — [fal t2v](https://fal.ai/models/google/gemini-omni-flash/v1.1/text-to-video/llms.txt); [fal guide](https://fal.ai/learn/tools/how-to-use-gemini-omni-flash-1-1)
- **Text-to-video inputs on fal:** `prompt`; `aspect_ratio` 16:9 (default) or 9:16; `resolution` 360p/720p (default)/1080p/4k; `duration` integer 3–10 s, default 8. — [fal t2v](https://fal.ai/models/google/gemini-omni-flash/v1.1/text-to-video/llms.txt)
- **Image-to-video:** `image_url` is the first frame. The optional `end_image_url` makes it first-to-last-frame interpolation. **Reference-to-video:** `image_urls` plus `reference_video_urls`, named in the prompt by position as `<IMAGE_REF_0>`, `<IMAGE_REF_1>`, `<VIDEO_REF_0>`. It takes up to 3 reference videos of at most 3 s each; no image maximum is stated. **Edit:** only `prompt`, `video_url` and `resolution`; it can't change length or aspect ratio. fal's guide does not say whether audio can be turned off. — [fal guide](https://fal.ai/learn/tools/how-to-use-gemini-omni-flash-1-1)
- **Gemini API (vendor):** model `gemini-omni-1.1-flash`. Paid tier only (not on the free tier). Video output costs $17.50 per 1M tokens, at 5,792 tokens per second of 720p, which is about $0.10/s. Input costs $1.50 per 1M tokens (text, image, video, audio). The page lists no 1080p or 4K rate. — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- **Vendor docs:** Omni Flash accepts text, images, audio and video at the same time, and supports multi-turn editing (element replacement, perspective changes) through the Interactions API. Google claims coherence, character consistency and factual accuracy. The page recommends Omni Flash over Veo 3.1 Preview. — [Gemini API video docs](https://ai.google.dev/gemini-api/docs/video)
- **Runway resells it:** Omni Flash 1.1 at 360p $0.034, 720p $0.10, 1080p $0.15, 4K $0.30 per s, plus $0.01 per reference image and $0.01 per input-video second. The older Omni Flash (1.0) costs $0.10/s for t2v, $0.10/s + $0.01 for i2v, and $0.11 per input second (10 s cap) for video-to-video. — [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/)
- **Release:** announced at I/O in May 2026, public preview from June, replaced Veo in the Gemini app and Flow (consumer plan route). — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026). AA dates Omni Flash 1.1 to Aug 2026. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video)
- **Moderation, real people:** a developer on an allowlisted `gemini-omni-flash-preview` project reported that every request using their own marketing footage of their founder failed with "Input blocked: Sorry, we can't create videos with real people's names or likenesses." The post (2026-08-24) had no staff reply. A related thread is titled "Omni 1.1 Flash: authorized self-likeness blocked after 3 successful jobs". — [Google AI forum](https://discuss.ai.google.dev/t/real-peoples-names-or-likenesses-block-on-own-footage-gemini-omni-flash-preview-skyhill-hq/179433)
- **Independent tester (Exemplary):** cheap, fast, multimodal input; good for drafts and social variations. But it is short (10 s, 720p in Flow), so the reviewer calls it "a draft and social model, not a master". — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- **Leaderboards:** Arena T2V #1 (1516). AA T2V #10 (1128). AA I2V #14 (1046). — [Arena](https://arena.ai/leaderboard/video/text-to-video); [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)

### Inferences
- Omni Flash is a poor fit for shots built on a real person's photo (beatsheet's "likeness from real photos" rule) because of the likeness block. It suits invented characters, quick drafts and edits of generated clips.
- Its 4K at $0.30/s is among the cheapest 4K outputs seen. LTX-2.5 Fast 4K is also $0.30/s, and H3's "4K" is cheaper at $0.16/s but is an upscale of 768p. Veo 3.1 4K is $0.60/s with audio on fal.

### Gaps
- Generation time, fps, the maximum number of reference images, and whether audio can be turned off were not found.
- Google's own policy page for Omni Flash (people, minors, public figures) was not found. The forum post is a user report.

---

## Google: Veo 3.1 (Standard, Fast, Lite)

### Takeaway
Veo 3.1 is still sold on fal and Runway, but Google's own Gemini API shut down the Veo 3.1 Preview models and points developers to Omni Flash, or to "GA Veo 3.1 models on the Gemini Enterprise Agent Platform". It is 4/6/8-second clips at 720p/1080p/4K, with native audio that can be turned off, which halves the price. It now ranks well below the leaders.

### Cited Findings
- **Gemini API status:** `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` and `veo-3.1-lite-generate-preview` are shut down in the Gemini API. A warning on the same page gives a shutdown date of 2026-10-22, so the page is inconsistent. Migration path: Gemini Omni Flash, or GA Veo 3.1 on the Gemini Enterprise Agent Platform. — [Gemini API video docs](https://ai.google.dev/gemini-api/docs/video)
- **fal Veo 3.1 Standard** `fal-ai/veo3.1` (t2v): 720p/1080p $0.20/s with audio off, $0.40/s with audio on; 4K $0.40 off, $0.60 on. Duration "4s"/"6s"/"8s" (default 8s). Aspect 16:9/9:16. Inputs: `generate_audio` (default true), `negative_prompt`, `seed`, `auto_fix` (default true, rewrites prompts that fail policy) and `safety_tolerance` "1"–"6" (default "4", 1 strictest). — [fal veo3.1](https://fal.ai/models/fal-ai/veo3.1/llms.txt)
- **fal `fal-ai/veo3.1/first-last-frame-to-video`:** `first_frame_url` and `last_frame_url` are required. Same prices as Standard, 4/6/8 s, aspect auto/16:9/9:16. — [fal flf](https://fal.ai/models/fal-ai/veo3.1/first-last-frame-to-video/llms.txt)
- **fal `fal-ai/veo3.1/reference-to-video`:** `image_urls` is required (the examples use 3; no maximum stated). Standard prices; 16:9/9:16; 720p/1080p/4k. — [fal r2v](https://fal.ai/models/fal-ai/veo3.1/reference-to-video/llms.txt)
- **fal Veo 3.1 Fast** `fal-ai/veo3.1/fast/image-to-video`: 720p/1080p $0.10 off, $0.15 on; 4K $0.30 off, $0.35 on. Input image should be 720p or larger; images that aren't 16:9 or 9:16 are cropped. 4/6/8 s. `auto_fix` defaults to false. — [fal fast i2v](https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video/llms.txt)
- **fal Veo 3.1 Lite** `fal-ai/veo3.1/lite/image-to-video`: 720p $0.03 off, $0.05 on; 1080p $0.05 off, $0.08 on. No 4K, no end-frame input, 4/6/8 s. — [fal lite i2v](https://fal.ai/models/fal-ai/veo3.1/lite/image-to-video/llms.txt)
- **Runway:** Veo 3.1 $0.40 (audio) / $0.20 (no audio) per s; Veo 3.1 Fast $0.15 / $0.10. — [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/)
- **Release (AA):** Veo 3.1 and 3.1 Fast Jan 2026, Lite Mar 2026. AA T2V Elo 962/958/953; I2V 957/937/929. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)
- **Independent tester:** cinematic look, depth of field, synced audio, native 4K. On the minus side: short base clips (8 s; extended clips drop to 720p), the most expensive Standard tier, weaker prompt adherence than newer Chinese models, and invented text on a watch dial (say "no text"). — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- **Successor:** none called Veo 4 is announced. Google calls Omni Flash its recommended video model. — [Gemini API video docs](https://ai.google.dev/gemini-api/docs/video)

### Inferences
- Veo 3.1 Lite at $0.03/s (720p, silent) is one of the cheapest named-brand i2v options, useful for roughs.
- The "Gemini Enterprise Agent Platform" seems to be the renamed Vertex AI: the Vertex pricing URL's page title now reads "Agent Platform Pricing | Google Cloud". This is unconfirmed.

### Gaps
- Google Cloud's own GA Veo 3.1 prices: the pricing page didn't render. Google's person-generation settings (e.g., adults-only defaults) were not verified on an opened Google page.
- fal's Veo 3.1 extend and Lite text-to-video endpoints were not checked.

---

## OpenAI: Sora 2 / Sora 2 Pro (discontinued)

### Takeaway
Don't add Sora. The Videos API and every Sora 2 alias (`sora-2`, `sora-2-pro` and their dated snapshots) were removed from the OpenAI API on 2026-09-24, with no replacement named.

### Cited Findings
- OpenAI's deprecations page has an entry dated 2026-03-24: developers were notified that the Videos API and Sora 2 aliases and snapshots would be removed "from the API on September 24, 2026". The replacement column is "---" for the Videos API, `sora-2` and `sora-2-pro`. — [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations)
- The Sora app closed on 2026-04-26 and the API on 2026-09-24, with no successor announced. — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- Arena still lists Sora 2 Pro (#11, 1368) and Sora 2 (#17, 1343) from past votes. — [Arena](https://arena.ai/leaderboard/video/text-to-video)

### Inferences
- If beatsheet has any Sora route through fal or a reseller, it is dead too, because the upstream API is gone.

### Gaps
- None material.

---

## Kling (Kuaishou): 4.0, 3.0, O3, 2.6, 2.5 Turbo, Avatar

### Takeaway
Kling 4.0 (launched October 2026) is on fal at $0.157/s (720p) or $0.235/s (1080p). It makes 3–30 s clips with up to 8 middle keyframes and multi-shot prompts, but fal's schema doesn't yet expose audio or references. Kling 3.0 and O3 remain the fal workhorses: start and end frames, `@Element` references and multi-shot, with audio that can be turned off. The vendor claims for 4.0 (4K, HDR, stereo audio, lip-sync in 8+ languages, 15 references) are not yet in fal's API.

### Cited Findings
- **Kling 4.0 on fal:** `kling/v4/image-to-video` and `kling/v4/text-to-video`. Price per second: 720p $0.157, 1080p $0.235 (a default 5 s 1080p clip is about $1.18).
  - i2v inputs: `start_image_url` (required; ≥300×300, aspect 0.40–2.50), `end_image_url`, `middle_image_urls` (ordered keyframes, max 8), `prompt` or `multi_prompt` (list of shots; total length is the sum), `duration` integer 3–30 (default 5), `resolution` 720p/1080p (default 1080p).
  - t2v adds `aspect_ratio` 16:9/9:16/1:1/21:9.
  - Neither page lists an audio toggle, reference images, negative prompt or seed.
  - — [fal Kling 4 i2v](https://fal.ai/models/kling/v4/image-to-video/llms.txt); [fal Kling 4 t2v](https://fal.ai/models/kling/v4/text-to-video/llms.txt)
- **Kling 4.0 vendor claims (fal pre-launch article dated 2026-09-30):**
  - 3–30 s (Flash: 3–20 s, 720p, 8-bit SDR); 720p/1080p/4K; 21:9/16:9/1:1/9:16/Auto.
  - Up to 10 keyframes. Up to 10 reference images, 5 reference videos (30 s combined), voice reference, 7 elements, 15 references in total.
  - Video editing (up to 5 clips, 30 s combined). Extension to 2 min and 10-bit HDR are "coming soon".
  - Stereo audio; dialogue in Chinese, English, Japanese, Korean, Spanish, Portuguese, German and French; on-screen text in those languages; prompts up to 8,000 tokens.
  - Kling 4.0 Flash entered limited early access on 2026-09-28. — [fal Kling 4 article](https://fal.ai/learn/tools/what-is-kling-4-0)
- **Kling 4.0 on Runway:** 720p list $0.157/s, 1080p $0.235/s, 20% off through 2026-11-30 ($0.1256 / $0.188). With an input video: 7.52/11.28 credits per output second plus the same rate on the longer of input or output. Inputs: text, frames, image or video references, video edit; 3–30 s; 720p or 1080p. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/); [Runway models](https://docs.dev.runwayml.com/guides/models/)
- **Kling 3.0 Pro on fal** `fal-ai/kling-video/v3/pro/image-to-video` (also `/v3/pro/text-to-video`): audio off $0.112/s, audio on $0.168/s, audio with voice control $0.196/s.
  - Inputs: `start_image_url` (required), `end_image_url`, `prompt` or `multi_prompt` (multi-shot), `shot_type` customize/intelligent, `duration` "3"–"15" (default "5"), `generate_audio` (default true; Chinese and English voice, other languages translated to English), `negative_prompt`, `cfg_scale` 0–1.
  - `elements`: an image set (`frontal_image_url` + `reference_image_urls`) or a `video_url`, referenced in the prompt as `@Element1`, `@Element2`.
  - Safety checker on by default; turning it off needs account authorization. — [fal v3 pro i2v](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/llms.txt)
- **Kling 3.0 Standard on fal** `fal-ai/kling-video/v3/standard/image-to-video` (also t2v): audio off $0.084/s, on $0.126/s, voice control $0.154/s; 3–15 s. — [fal v3 std i2v](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/llms.txt)
- **Kling O3 (Omni) on fal:** `fal-ai/kling-video/o3/{pro,standard}/{image-to-video,reference-to-video,text-to-video,video-to-video/edit}` (endpoint list from the pricing table). — [fal pricing](https://fal.ai/pricing)
  - O3 Pro reference-to-video: audio off $0.112/s, on $0.14/s.
  - Inputs: `start_image_url`, `end_image_url`, `image_urls` (style or appearance, named `@Image1`…), `elements` (named `@Element1`…), `multi_prompt`, `shot_type`, `duration` "3"–"15", `aspect_ratio` 16:9/9:16/1:1, `generate_audio` (default **false**).
  - Elements plus reference images may total at most 4 when a video is used. — [fal O3 pro r2v](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/llms.txt)
- **Older on fal:** `fal-ai/kling-video/v2.6/pro/{image-to-video,text-to-video}` and `fal-ai/kling-video/v2.5-turbo/pro/image-to-video`, both listed at $0.07/s. — [fal pricing](https://fal.ai/pricing)
- **Kling AI Avatar v2 Pro on fal** `fal-ai/kling-video/ai-avatar/v2/pro`: $0.115/s. Inputs: `image_url` and `audio_url` (both required), optional `prompt`. Safety checker on by default. — [fal Kling avatar](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro/llms.txt)
- **Runway's Kling prices:**
  - 3.0 Standard $0.09 (no audio) / $0.13 (audio), 720p, 3–15 s
  - 3.0 Pro $0.12 / $0.17, 1080p
  - 3.0 4K $0.43
  - O3 Standard $0.13, Pro $0.17, 4K $0.43
  - 2.5 Turbo Pro $0.12 (5 or 10 s, optional last frame)
  - — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/); [Runway models](https://docs.dev.runwayml.com/guides/models/)
- **Release:** Kling 3.0 announced Feb 2026, global rollout Mar 2026. The reviewer says Kling claims 15 s per shot, native 4K at up to 60 fps, lip-synced dialogue in five languages, and multi-shot (up to six scenes) with a persistent character. Price is about $0.08–0.17/s, cheaper on Kling's own platform. — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- **Independent view:** good for narrative and explainers thanks to multi-shot consistency, but it "scores below Seedance and Wan on raw text-to-video" and needs structured prompts. — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026). AA: Kling 3.0 Pro is the 1000 anchor on both boards, and Kling 3.0 Omni Pro scores 1023 on T2V. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video)

### Inferences
- beatsheet's catalog price for Kling 3 Pro i2v ($0.112/s) is the **audio-off** rate. With `generate_audio` left at its default (true) the cost is $0.168/s, so the catalog should show both.
- For start-plus-end-frame and keyframed shots, Kling 4.0 (up to 8 middle keyframes, 30 s) is now the most keyframe-capable fal model after Luma Ray 3.2 (which takes 64 keyframe slots).

### Gaps
- Kling 4.0 launch day: secondary sources say 2026-10-15, but Kuaishou's own release could not be opened. Kling's official API price list didn't render (JS page). Kling 3.0 Turbo (reported June 2026) was not verified.
- Kling's policy on real-person photos and public figures: nothing found.
- fal's Kling 4.0 audio behaviour (is audio generated? can it be off?) is undocumented on the model pages.

---

## ByteDance Seedance: 2.5, 2.0 (Standard, Fast, Mini), 1.x, OmniHuman

### Takeaway
Seedance 2.5 (released 2026-07-31) is #1 on AA image-to-video. It makes 4–30 s clips at up to 1080p, takes up to 30 images, 10 videos and 10 audio clips (`@Image1`, `@Video1`, `@Audio1`), and can edit or extend video. On fal it is expensive ($0.47/s at 720p, $1.16/s at 1080p on the "US" endpoints) and slow (fal measured 278 s for a 10 s clip). Runway sells it cheaper ($0.30/s at 720p). Seedance 2.0 (Standard, Fast, Mini) is cheaper and goes to 4K. Audio is on by default and costs the same on or off. ByteDance's own API blocks real human faces in reference images (secondhand reports).

### Cited Findings
- **Seedance 2.5 on fal:** `bytedance/seedance-2.5/us/text-to-video`, `/us/image-to-video`, `/us/reference-to-video`, described as "US-hosted ByteDance Seedance 2.5". — [fal models list](https://fal.ai/models?categories=text-to-video); [fal SD2.5 i2v](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video/llms.txt)
  - **Price:** 480p ≈ $0.2205/s, 720p ≈ $0.4730/s, 1080p ≈ $1.164/s. That is $0.0214 per 1K tokens (480p/720p) or ≈ $0.0234 (1080p), with tokens ≈ h×w×(input + output duration)×24/1024. Audio on or off costs the same. With video inputs, the price is ×0.6 but input video is billed too (720p ≈ $0.2838 per generated second). — [fal SD2.5 i2v](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video/llms.txt); [fal SD2.5 r2v](https://fal.ai/models/bytedance/seedance-2.5/us/reference-to-video/llms.txt)
  - **i2v inputs:** `image_url`, optional `end_image_url`, `resolution` 480p/720p (default)/1080p, `duration` auto or 4–30, aspect always auto, `generate_audio` (default true: sound effects, ambience, lip-synced speech), `bitrate_mode`, `codec` H264/H265.
    - `draft`: a 480p preview that returns a `draft_id`, which can be completed at 1080p within 14 days. — [fal SD2.5 i2v](https://fal.ai/models/bytedance/seedance-2.5/us/image-to-video/llms.txt)
  - **r2v inputs:** `task` auto/reference/editing/extension.
    - Up to 30 `image_urls` (`@Image1`…).
    - Up to 10 `video_urls` (`@Video1`…; each 1.8–30.2 s, ≤30.2 s combined, 24–60 fps).
    - Up to 10 `audio_urls` (`@Audio1`…; ≤30.2 s combined); 50 files in total.
    - Aspect auto/21:9/16:9/4:3/1:1/3:4/9:16; `seed`. — [fal SD2.5 r2v](https://fal.ai/models/bytedance/seedance-2.5/us/reference-to-video/llms.txt)
- **Seedance 2.5 on Runway:** 480p $0.20/s, 720p $0.30/s, 1080p $0.68/s, plus $0.10/$0.15/$0.34 per input-video second (80-credit minimum). Up to 30 s. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/); [Runway models](https://docs.dev.runwayml.com/guides/models/)
- **Release:** ByteDance released Seedance 2.5 on 2026-07-31 (30 s in one run, multi-turn extension, up to 30 images + 10 videos + 10 audio). It rolled out to Jimeng AI and Doubao Pro (consumer routes), and the article said a Volcano Engine Ark API was "expected soon". — [TechNode](https://technode.com/2026/07/31/bytedance-launches-seedance-2-5-video-generation-model/)
- **Independent tester:** strong prompt adherence (7 of 8 shots matched on the first render) and a large reference budget. But access depends on resellers with inconsistent pricing, small subjects in wide frames came out tiny (state the camera distance), and "ByteDance's own API is not offered in the US". — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- **Speed:** fal's benchmark has Seedance 2.5 taking 277.80 s for a 10 s video (fal's claim, from a competitor's launch release). — [fal FLUX 3 Max PR](https://www.prnewswire.com/news-releases/fal-launches-flux-3-max-delivering-1-tier-image-to-video-quality-at-industry-leading-speeds-302913033.html)
- **Seedance 2.0 on fal:** `bytedance/seedance-2.0/{text-to-video,image-to-video,reference-to-video}`.
  - **Price:** $0.014 per 1K tokens at 480p/720p/1080p, $0.008 at 4K. The i2v page states 720p $0.3034/s and 1080p $0.682/s. Audio on or off costs the same. — [fal SD2.0 i2v](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/llms.txt)
  - **i2v:** `image_url`, `end_image_url`, 480p/720p/1080p/4k, duration auto or 4–15, aspect auto/21:9/16:9/4:3/1:1/3:4/9:16. — [fal SD2.0 i2v](https://fal.ai/models/bytedance/seedance-2.0/image-to-video/llms.txt)
  - **r2v:**
    - Up to 9 images (`@Image1`).
    - Up to 3 videos (`@Video1`; 2–15 s combined, ~480p–720p).
    - Up to 3 audio clips (`@Audio1`; ≤15 s; needs at least one image or video); 12 files in total.
    - With video references the rate is $0.0086016 per 1K tokens. — [fal SD2.0 r2v](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/llms.txt)
- **Seedance 2.0 Fast on fal:** `bytedance/seedance-2.0/fast/{text-to-video,image-to-video,reference-to-video}`. $0.0112 per 1K tokens, about $0.2419/s at 720p. 480p or 720p only; 4–15 s; end frame supported; audio default on, same cost. — [fal SD2.0 fast i2v](https://fal.ai/models/bytedance/seedance-2.0/fast/image-to-video/llms.txt)
- **Seedance 2.0 Mini on fal:** `bytedance/seedance-2.0/mini/{text-to-video,image-to-video,reference-to-video}` at $0.007 per 1K tokens. **Older on fal:** `fal-ai/bytedance/seedance/v1.5/pro/{image-to-video,text-to-video}` ($1.2 per 1M tokens) and `fal-ai/bytedance/seedance/v1/pro/fast/image-to-video` ($1 per 1M tokens). — [fal pricing](https://fal.ai/pricing)
- **Runway's Seedance 2.0 prices:** 480p $0.14, 720p $0.30, 1080p $0.40, 4K $1.50 per s. Fast 480p $0.11, 720p $0.24. Mini 480p $0.07, 720p $0.15. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/)
- **OmniHuman v2 (ByteDance talking-person) on fal** `bytedance/omnihuman/v2`: $0.105/s. Takes an image plus audio (wav/mp3, 4–300 s) and an optional prompt (zh, en, ja, ko, es-MX, id). The page says nothing on real-face policy. — [fal OmniHuman v2](https://fal.ai/models/bytedance/omnihuman/v2/llms.txt)
- **fal pages on faces:** none of the Seedance llms.txt pages mention moderation or real-face rules. — [fal SD2.0 r2v](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/llms.txt); [fal SD2.5 r2v](https://fal.ai/models/bytedance/seedance-2.5/us/reference-to-video/llms.txt)

### Inferences
- **Mini, 720p:** about $0.15/s ($0.007/$0.014 × $0.3034; my calculation, which matches Runway's $0.15).
- **Seedance 2.0 at 4K:** about $1.55/s (3840×2160×24/1024 = 194,400 tokens/s × $0.008/1K; my calculation, close to Runway's $1.50).
- **Price gap:** for Seedance 2.5, Runway at $0.30/s (720p) is about 37% cheaper than fal's US endpoint at $0.47/s, and fal's 1080p ($1.16/s) is about 1.7× Runway's ($0.68/s). Worth offering both routes.
- **Real faces:** expect real-person photos to be refused on ByteDance's own API. Through fal's US endpoint, behavior is undocumented and needs testing, consistent with the beatsheet note that "Seedance blocks these".

### Gaps
- **Face block, unverified:** secondary sources report that BytePlus ModelArk rejects reference images or videos with real human faces (HTTP 400 `InputImageSensitiveContentDetected.PrivacyInformation`), and that the only route for real people is a verified "asset" workflow. I could not open BytePlus's official docs (the page rendered only navigation).
- **BytePlus prices:** reported as about $7 per 1M tokens at 480p/720p without video input. This comes from secondary sources and is unverified. Volcengine's Seedance 2.5 API date was not confirmed.
- Seedance 2.5 Fast or Lite tiers: none found.

---

## Alibaba Wan 3.0 / Wan 3.0 Prime (and Wan 2.7/2.6)

### Takeaway
Wan 3.0 (Aug 2026) is #1 on AA text-to-video. On fal it costs $0.05/$0.10/$0.20 per s (480/720/1080p), or $0.068/$0.14/$0.28 for the faster Prime tier. Clips run 2–30 s with audio (can be turned off) and up to 10 image, 5 video and 5 audio references, named by position ("Image 1"). It is API-only, with no open weights.

### Cited Findings
- **fal endpoints:** `alibaba/wan-3.0/{text-to-video,image-to-video,reference-to-video}` and `alibaba/wan-3.0-prime/{text-to-video,image-to-video,reference-to-video}`. Both tiers share parameters; Prime is faster and costs more. — [fal Wan 3 guide, 2026-08-25](https://fal.ai/learn/tools/how-to-use-wan-3)
- **fal price per s, audio included:** Standard 480p $0.05, 720p $0.10, 1080p $0.20. Prime $0.068 / $0.14 / $0.28. Reference-to-video bills input reference videos in addition to output. — [fal Wan 3 guide](https://fal.ai/learn/tools/how-to-use-wan-3); [fal Wan 3 r2v](https://fal.ai/models/alibaba/wan-3.0/reference-to-video/llms.txt); [fal Wan 3 Prime i2v](https://fal.ai/models/alibaba/wan-3.0-prime/image-to-video/llms.txt)
- **i2v inputs (Prime page):** `start_image_url` (required), `end_image_url`, `prompt`, `resolution` 480p/720p/1080p (default 1080p), `aspect_ratio` adaptive/16:9/4:3/1:1/3:4/9:16, `duration` 2–30 (null = the model chooses), `audio` (default true), `enable_prompt_expansion` (default true; off saves about 20–60 s), `enable_thinking`, `seed`, `enable_safety_checker` (default true; checks input and output; turning it off needs authorization). — [fal Wan 3 Prime i2v](https://fal.ai/models/alibaba/wan-3.0-prime/image-to-video/llms.txt)
- **r2v inputs:** up to 10 `reference_image_urls`; up to 5 `reference_video_urls` (≤15 s total, ≥16 fps); up to 5 `reference_audio_urls` (≤15 s total); `file_url` (document) and `web_url` (public page), which need `enable_thinking`. The prompt refers to media by position, e.g., "the subject in Image 1 walks past Video 1". — [fal Wan 3 r2v](https://fal.ai/models/alibaba/wan-3.0/reference-to-video/llms.txt)
- **Audio:** spoken lines go in double quotes in the prompt, and silence can be requested. If the prompt says nothing about audio, the model picks a soundtrack. Lip-sync is not mentioned. **Weaknesses** (fal's guide): prompt rewriting can drop details; on-screen text and numbers need checking frame by frame. Not open-weight; Alibaba's open weights stop at Wan 2.2. — [fal Wan 3 guide](https://fal.ai/learn/tools/how-to-use-wan-3)
- **Alibaba Cloud Model Studio (vendor):**
  - `wan3.0-video-prime` (Singapore): $0.068/$0.14/$0.28 per s.
  - `wan3.0-video` (Singapore): $0.05/$0.10/$0.20, marked as limited-time 30% off, with a 30 s free quota.
  - China/Global regions (incl. US) are cheaper: Prime $0.0636/$0.1272/$0.2544; Standard $0.0413/$0.0825/$0.1650.
  - Wan 3.0 bills input and output video duration.
  - Wan 2.7 i2v/t2v $0.10 (720p) / $0.15 (1080p).
  - Wan 2.6 i2v-flash $0.05 with audio, $0.025 silent (720p). — [Alibaba Cloud pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- **Runway:** Wan 3 $0.05/$0.10/$0.20; Wan 3 Prime $0.068/$0.14/$0.28; image, video and audio references; 2–30 s; native audio. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/); [Runway models](https://docs.dev.runwayml.com/guides/models/)
- **Leaderboards:** AA T2V #1 (1175), AA I2V #9 (1111), Arena T2V #6 (1476). — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video); [Arena](https://arena.ai/leaderboard/video/text-to-video)
- **Independent view:** strong motion and physics, thinner English documentation (the reviewer did not test it). — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)

### Inferences
- Wan 3.0 Standard at 720p ($0.10/s, 30 s, audio) is one of the best value-per-quality options for long single takes and text-to-video establishing shots.
- The default prompt expansion may fight beatsheet's carefully written prompts. Test with it off.

### Gaps
- Generation time in seconds, fps, and Wan 3's policy on real faces were not found. No Wan 3 edit endpoint exists on fal.

---

## Alibaba HappyHorse 1.0 / 1.1

### Takeaway
HappyHorse is an Alibaba-ATH model with native audio and multilingual lip-sync. 1.0 is on fal for i2v at $0.14/s (720p) or $0.28/s (1080p), 3–15 s. 1.1 (June 2026) ranks a little higher and is cheaper on Alibaba Cloud.

### Cited Findings
- **fal** `alibaba/happy-horse/image-to-video` (1.0): 720p $0.14/s, 1080p $0.28/s. `image_url` (≥300 px, aspect 1:2.5–2.5:1, ≤10 MB), `prompt` ≤2,500 characters, `resolution` (default 1080p), `duration` 3–15 (default 5), `seed`, safety checker (default on; turning it off needs authorization). The page says it generates "synchronized native audio and multilingual lip-sync" but lists no audio parameters. — [fal HappyHorse i2v](https://fal.ai/models/alibaba/happy-horse/image-to-video/llms.txt)
- **Alibaba Cloud:**
  - happyhorse-1.1 (t2v, i2v, r2v), Singapore: 480p $0.07, 720p $0.14, 1080p $0.18.
  - happyhorse-1.0: 720p $0.14, 1080p $0.24.
  - happyhorse-1.0-video-edit: $0.14 / $0.24, billing input and output.
  - Global/US regions are lower (1.1: $0.0619/$0.1238/$0.1650). — [Alibaba Cloud pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing)
- **Runway:** HappyHorse 1.0 720p $0.15, 1080p $0.30; 3–15 s; ten output ratios; native audio. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/); [Runway models](https://docs.dev.runwayml.com/guides/models/)
- **Leaderboards:** AA T2V 1.1 = 1050, 1.0 = 1032; AA I2V 1.1 = 1037, 1.0 = 1027; Arena T2V 1.0 #10 (1427). 1.0 released Apr 2026, 1.1 Jun 2026 (AA). — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [Arena](https://arena.ai/leaderboard/video/text-to-video)

### Inferences
- HappyHorse is dominated by Wan 3.0 Standard on fal for price and rank. It is worth listing only as a lip-sync-capable alternative.

### Gaps
- fal's text-to-video, reference-to-video, video-edit and 1.1 endpoints were not verified (a fal press release mentions four HappyHorse 1.0 endpoints, but it was not opened).

---

## MiniMax: H3 family (H3, Highspeed, Lite) and fal's H3 Max / H3 Max Turbo, plus Hailuo 2.3 (legacy)

### Takeaway
MiniMax H3 (open weights) has replaced Hailuo. fal's post-trained H3 Max is very fast (fal claims about 3 s of wall time for a 5 s clip) and cheap, and it has a full toolset: reference, director, recast, relight, lip-sync, extend. fal's H3 Max promo ends 2026-11-15. The standard prices from 2026-11-16 are $0.05/$0.08/$0.16 per s (480p/768p/1080p). Hailuo 2.3 is now listed by MiniMax as "legacy".

### Cited Findings
- **fal `minimax/h3/image-to-video`:** 480p $0.05/s, 768p $0.06/s, 2K $0.13/s, 4K $0.16/s. 480P and 768P are native; 2K and 4K are upscales of a 768P result.
  - `duration` 5–15 (default 5).
  - `image_url` (canvas follows it; with no image it is t2v at 16:9) and `end_image_url` (can be used alone).
  - `target_audio_url` (≥2 s; replaces the generated soundtrack).
  - `prompt_expansion_mode` disabled/fast/balanced/quality (quality takes up to about 30 s); safety checker on by default.
  - No aspect-ratio parameter, no audio toggle, no reference images documented. — [fal H3 i2v](https://fal.ai/models/minimax/h3/image-to-video/llms.txt)
- **fal `minimax/h3-max/image-to-video` (also t2v):** price per s by date:

  | Resolution | through 2026-10-31 | 2026-11-01 to 11-15 (30% off) | from 2026-11-16 |
  |---|---|---|---|
  | 480p | $0.0325 | $0.035 | $0.05 |
  | 768p | $0.052 | $0.056 | $0.08 |
  | 1080p (latent refinement of 768p) | $0.104 | $0.112 | $0.16 |

  - `duration` float 0.92–15 (output may run about 0.7 s longer); `end_image_url` (also alone); `target_audio_url`; `prompt_expansion_mode`.
  - No audio toggle or reference input on this endpoint. — [fal H3 Max i2v](https://fal.ai/models/minimax/h3-max/image-to-video/llms.txt)
- **Other H3 Max endpoints on fal:** reference-to-video, recast, director, reference-director, relight, lip-sync/image-to-video, extend-video. Also H3 Max Turbo `minimax/h3-max-turbo/{image-to-video,text-to-video,reference-to-video}`. — [fal models list](https://fal.ai/models?categories=text-to-video). The fal pricing table lists H3 Max Turbo at "$0.025 per seconds" and H3 Max at "$0.05". — [fal pricing](https://fal.ai/pricing)
- **fal `minimax/h3-max/lip-sync/image-to-video`:** 480p $0.05, 768p $0.08, 1080p $0.16, 2K $0.32 per s, ×1.2 over 15 s. Takes `image_url` plus `audio_url` (5 s to 15 min); output length follows the audio. — [fal H3 Max lip-sync](https://fal.ai/models/minimax/h3-max/lip-sync/image-to-video/llms.txt)
- **H3 Max launch (2026-09-01, fal):** post-trained by fal Research on the open-weights MiniMax H3. A 5 s video takes about 3 s of wall time, which fal says is about 35× the throughput of the official MiniMax H3 endpoint (fal's own test). The launch standard was $0.08/s at 768p. fal claims #1 on Design Arena I2V (1,341) and on AA I2V with audio (as of 2026-08-26). — [fal H3 Max PR](https://www.prnewswire.com/news-releases/fal-launches-h3-max-a-new-post-trained-video-model-with-frontier-quality-and-faster-than-real-time-generation-302866462.html). A later fal release lists H3 Max at 3.49 s in its latency table. — [fal FLUX 3 Max PR](https://www.prnewswire.com/news-releases/fal-launches-flux-3-max-delivering-1-tier-image-to-video-quality-at-industry-leading-speeds-302913033.html)
- **MiniMax's own API, per s:**
  - MiniMax-H3: 2K $0.13, 768P $0.08 (input video billed at the same rate).
  - MiniMax-H3-Highspeed: 768P $0.06, 480P $0.04.
  - MiniMax-H3-Lite: 768P $0.04, 480P $0.025.
  - MiniMax-H3-Max: 768P $0.08 (input video $0.143), 480P $0.05.
  - Extra images beyond the free quota: $0.04 (H3), $0.074 (Max); H3 includes 5 free images per task, Max 2. Audio input is free. H3 768P-to-2K regeneration costs $0.05/s.
  - **Legacy Hailuo:** 2.3 at 768P 6 s $0.28, 10 s $0.56, 1080P 6 s $0.49; 2.3-Fast 768P 6 s $0.19, 1080P 6 s $0.33; Hailuo-02 512P 6 s $0.10. — [MiniMax pricing](https://platform.minimax.io/docs/guides/pricing)
- **Runway:** MiniMax H3 (`hailuo3`) 768p $0.10, 2K $0.15, plus $0.02 per reference image or keyframe; takes text, image, video and audio references. H3 Max 480p $0.05, 768p $0.08; first and last frames; native audio. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/); [Runway models](https://docs.dev.runwayml.com/guides/models/)
- **fal Hailuo 2.3 Pro** `fal-ai/minimax/hailuo-2.3/pro/image-to-video`: $0.49 per video (1080p). Takes `prompt`, `image_url`, `prompt_optimizer`; no duration or end-frame input documented. — [fal Hailuo 2.3](https://fal.ai/models/fal-ai/minimax/hailuo-2.3/pro/image-to-video/llms.txt)
- **Open weights:** Arena lists MiniMax H3's license as "minimax-h3-community-license-agreement". — [Arena](https://arena.ai/leaderboard/video/text-to-video). Specs per Exemplary: 33B parameters, 15 s, up to 2K, native stereo audio; a community licence that allows commercial use. — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- **Leaderboards:** AA T2V H3 #3 (1161), H3 Max #7 (1149); AA I2V H3 #4 (1128), H3 Max #8 (1117); Arena T2V H3 #8 (1460). — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)

### Inferences
- beatsheet's catalog H3 Max price ($0.16/s at 1080p) matches the standard rate from 2026-11-16. The 768p standard rate is $0.08 (not $0.06; $0.06 is plain H3 at 768p).
- The catalog's H3 Max Turbo price ($0.04/s) differs from fal's pricing table ($0.025). Check the Turbo model page before shipping.
- "MiniMax-H3-Max" also appears on MiniMax's own price list while fal calls itself the creator of H3 Max. The two may be the same weights or different builds. Unclear.

### Gaps
- H3 Max Turbo's model page, resolutions and promo dates were not opened.
- H3's native audio content (speech or lip-sync quality) and whether it can be turned off on fal are undocumented. MiniMax's moderation policy for real faces was not found.

---

## FLUX 3 Video (Black Forest Labs) and FLUX 3 Max (fal)

### Takeaway
FLUX 3 Video (generally available on the BFL API around 2026-08-04/05) makes 5–20 s clips with native audio (dialogue, effects, ambience, lip-sync in 14+ languages) at up to 4K on fal ($0.17–0.47/s). fal's post-trained FLUX 3 Max (2026-10-19) is the speed story: fal measured 11 s for a 10 s clip. It is on a 75%-off promo until 2026-11-07 ($0.0425/s at 720p), then $0.17/s at 720p or $0.29/s at 1080p.

### Cited Findings
- **FLUX 3 Max on fal:** `blackforestlabs/flux-3-max/image-to-video`, `/text-to-video`, `/keyframes-to-video`. — [fal models list](https://fal.ai/models?categories=text-to-video)
  - **Price per s:** promo (2026-10-15 to 11-07) 720p $0.0425, 1080p $0.0725; afterwards 720p $0.17, 1080p $0.29. No separate audio price.
  - **i2v inputs:** `prompt`, `image_url` (both required), `end_image_url`, `duration` 5–20 (default 5), `resolution` 720p (default)/1080p, `aspect_ratio` auto/21:9/2:1/16:9/4:3/1:1/3:4/9:16, `reasoning_level` low/high (default high; expands the prompt), `generate_audio` (default true), `seed`. No reference images.
  - **Output:** the example is 1280×704 at 24 fps; a `timings` field is returned. — [fal FLUX 3 Max i2v](https://fal.ai/models/blackforestlabs/flux-3-max/image-to-video/llms.txt)
  - **Launch (fal, 2026-10-19):** 10.95 s to generate a 10 s video, against 126.44 s for FLUX 3 and 277.80 s for Seedance 2.5 (fal benchmarks). 1,139 I2V Elo from 4,868 votes on the AA arena ("preliminary"). — [fal FLUX 3 Max PR](https://www.prnewswire.com/news-releases/fal-launches-flux-3-max-delivering-1-tier-image-to-video-quality-at-industry-leading-speeds-302913033.html). AA now shows FLUX 3 Max at T2V 1157 (#5) and I2V 1064 (#12). — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)
- **FLUX 3 on fal:** `blackforestlabs/flux-3/image-to-video`.
  - **Price per s:** 720p $0.17, 1080p $0.29, 1440p $0.32, 2160p $0.47. Resolutions above 720p are made by a video upsampler.
  - **Inputs:** duration auto or 5–20; aspect auto/21:9/2:1/16:9/4:3/1:1/3:4/9:16; `generate_audio` (default true); `safety_tolerance` 0–4 (default 2, 0 strictest). No end-frame or reference inputs are listed. — [fal FLUX 3 i2v](https://fal.ai/models/blackforestlabs/flux-3/image-to-video/llms.txt)
- **BFL API (vendor), per The Decoder 2026-08-05:**
  - General availability through the BFL API and select partners; HD and Full HD; up to 20 s; native audio incl. dialogue, effects and ambience; lip-sync in 14+ languages.
  - Text-to-video, image-to-video, keyframes and video continuation; several scenes or camera angles in one clip; on-screen typography.
  - **Price per s, audio included:** Draft (HD) $0.06 t2v/i2v, $0.12 v2v; HD $0.17 / $0.41; Full HD $0.29 / $0.53.
  - BFL's own tests claim #1 in T2V (1,135) and I2V (1,051). — [The Decoder](https://the-decoder.com/black-forest-labs-makes-flux-3-video-generally-available-and-claims-it-beats-seedance-2-0/)
- **Leaderboards:** Arena T2V FLUX 3 Video #3 (1493, preliminary). AA FLUX 3: T2V 1144, I2V 1071 (Jul 2026). — [Arena](https://arena.ai/leaderboard/video/text-to-video); [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video)

### Inferences
- Until 2026-11-07, FLUX 3 Max at $0.0425/s with audio is the cheapest near-frontier model seen. After that it costs the same as FLUX 3 ($0.17/$0.29) but is about 11× faster, which makes it a strong default for iterative "roughs".

### Gaps
- FLUX 3 Max keyframes-to-video limits (number of keyframes) were not opened. BFL's moderation policy (real people) was not found.

---

## xAI Grok Imagine Video (1.0, 1.5, 1.5 Lite)

### Takeaway
Grok Imagine Video 1.5 (May 2026) ranks #4 on Arena T2V. It makes 1–15 s clips with audio and takes up to 7 reference images on fal (`<IMAGE_0>`) or 14 references plus 3 voice references on xAI's own API. fal charges $0.08/$0.14/$0.25 per s (480/720/1080p); xAI lists $0.08/s for 1.5 and $0.02/s for 1.5 Lite.

### Cited Findings
- **fal `xai/grok-imagine-video/v1.5/image-to-video`:** 480p $0.08/s, 720p $0.14/s, 1080p $0.25/s; reference images $0.01 each (1–7); reference audio included. Inputs: `prompt`, `image_url`, `duration` 1–15 (default 6), `resolution`, `enable_safety_checker` (default true; "authorized callers may set false to request relaxed screening"). Example output: 1280×720 at 24 fps. — [fal Grok 1.5 i2v](https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video/llms.txt)
- **fal `xai/grok-imagine-video/v1.5/reference-to-video`:** 480p $0.08, 720p $0.14, plus $0.01 per reference. 1–7 `reference_image_urls` named `<IMAGE_0>`, `<IMAGE_1>`…; `duration` 1–15 (default 8); 480p (default) or 720p only; aspect 16:9/4:3/3:2/1:1/2:3/3:4/9:16. No voice or audio parameter is documented despite the pricing note. — [fal Grok 1.5 r2v](https://fal.ai/models/xai/grok-imagine-video/v1.5/reference-to-video/llms.txt)
- **Older fal endpoints:** `xai/grok-imagine-video/{image-to-video,text-to-video,reference-to-video}` (1.0) at $0.05/s. — [fal pricing](https://fal.ai/pricing)
- **xAI API (vendor):** `grok-imagine-video-1.5-lite` $0.020/s, `grok-imagine-video` $0.050/s, `grok-imagine-video-1.5` $0.080/s (recommended). — [xAI models](https://docs.x.ai/docs/models)
  - Up to 15 s. Reference-to-video on 1.5 takes up to 14 reference images and 3 voice references, and can pin first, last and mid-video frames.
  - Editing a video with text on `grok-imagine-video`; extension continues from the last frame.
  - Requests are async (poll by id). Output is subject to content-policy review and not used for training. — [xAI video guide](https://docs.x.ai/docs/guides/video-generations)
- **Runway:** Grok 1.5 at 480p $0.10, 720p $0.16, 1080p $0.29 plus $0.01 per image or audio reference. 1.5 Lite at $0.02/$0.03/$0.14 plus $0.01 per start frame. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/)
- **Leaderboards:** Arena T2V #4 (1492, preliminary); Grok Imagine Video 720p (1.0) #18 (1343). AA T2V 1.5 = 1059, 1.5 Lite = 991 (Aug 2026); AA I2V 1.5 = 1052, Lite = 999. The creator is listed as "SpaceXAI". — [Arena](https://arena.ai/leaderboard/video/text-to-video); [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)

### Inferences
- xAI's own price for 1.5 ($0.08/s, resolution unspecified) is well below fal's 720p/1080p rates, so a direct xAI key route could be cheaper. (beatsheet currently uses OpenAI, Gemini and Meta keys, not xAI.)
- 1.5 Lite at $0.02–0.03/s (480/720p) is among the cheapest audio-capable drafting options, if it is on fal (not verified).

### Gaps
- xAI's policy on real-person photos and public figures was not found on an xAI page (secondary blogs say real-person likeness needs consent). Grok 1.5 Lite on fal was not verified. Generation times were not found.

---

## Runway: Gen-4.5, Gen-4 Turbo, Aleph 2, Act-Two

### Takeaway
Runway's own models are not on fal (no fal endpoint found). Gen-4.5 (Dec 2025) costs $0.12/s and Aleph 2 (video editing) $0.28/s through the Runway API, and they now rank a tier below the leaders. Runway's API matters more as a second route to Kling 4.0, Seedance 2.5, Wan 3 and Veo, often at a lower price than fal.

### Cited Findings
- **Runway API (1 credit = $0.01):**
  - Gen-4.5 `gen4.5` $0.12/s: text and image input, Runway's flagship t2v/i2v model.
  - Gen-4 Turbo `gen4_turbo` $0.05/s: image only, the fastest.
  - Aleph 2 `aleph2` $0.28/s with a 56-credit minimum: in-context video editing with keyframe-guided control.
  - Act-Two `act_two` $0.05/s: motion capture.
  - ProRes or PNG-sequence output adds $0.05/s; HDR/10-bit adds $0.20/s ($0.40 above 4 MP), Gen-4.5 and Aleph 2 only. — [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/); [Runway models](https://docs.dev.runwayml.com/guides/models/)
- **Release and view:** Gen-4.5 dates from December 2025 and is still the flagship; about $0.12–0.25/s; 10 s presets, 1080p. Its launch leaderboard score was "self-reported on a scale since retired", and the reviewer puts it a tier behind the leaders. Aleph 2 supports video-to-video editing. — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)
- **Arena T2V:** Runway Gen-4.5 #27 (1225). — [Arena](https://arena.ai/leaderboard/video/text-to-video)

### Inferences
- Add Runway as a provider route rather than a model family: its third-party prices undercut fal for Seedance 2.5 (720p $0.30 vs $0.47) and Kling 4.0 (20% off until 2026-11-30).

### Gaps
- Gen-4.5's durations, resolutions, reference limits and audio support are not on the API docs pages opened. Secondary reports that native audio and Aleph 2's 30 s at 1080p were added are unverified. No Runway moderation details were found.

---

## Luma Ray 3.2 (and Ray 2)

### Takeaway
Ray 3.2 (2026-06-09) is the first Ray model with a full API and is on fal. It is the keyframe and HDR specialist: up to 64 keyframe slots on fal (16 per Luma's announcement), HDR and 16-bit EXR, and Modify Video and Reframe. Clips are 5 s or 10 s on fal, 24 fps, with no native audio documented. It is cheap at 540p and expensive at 1080p.

### Cited Findings
- **fal `luma/agent/ray/v3.2/image-to-video`:**
  - **Price per 5 s clip:** 540p $0.15, 720p $0.30, 1080p $1.20. HDR $0.60 (720p) / $2.40 (1080p); HDR + EXR $0.90 / $3.60.
  - **Inputs:**
    - `image_url` or `end_image_url` (start or end frame), or `keyframes` (1–64 URLs) plus `keyframe_indexes` (frame positions 0–120 for 5 s, 0–240 for 10 s, at 24 fps).
    - `aspect_ratio` 3:4/4:3/1:1/9:16/16:9/21:9; `resolution` 540p (default)/720p/1080p; `duration` 5s/10s (10 s requires keyframes).
    - `loop`; `hdr` (needs HDR access and 720p+); `exr_export`; safety checker on by default.
  - No audio parameter. The page conflicts with itself on 10 s availability. — [fal Ray 3.2 i2v](https://fal.ai/models/luma/agent/ray/v3.2/image-to-video/llms.txt)
- **Other fal endpoints** (seen in fal search results; pages not opened): `luma/agent/ray/v3.2/text-to-video`, `/video-to-video`, `/reframe`.
- **Luma API pricing (vendor), per clip:**
  - T2V/I2V 5 s: 540p $0.15, 720p $0.30, 1080p $1.20. 10 s: $0.45 / $0.90 / $3.60.
  - Modify (V2V) 5 s: $0.72 / $1.44 / $2.16. 10 s: $1.08 / $2.16 / $4.32.
  - Reframe: $0.06 / $0.12 / $0.36 per s.
  - HDR is 2× SDR; HDR + EXR is 3×. Billing is per 5 s block. V2V runs 10/15/20 s on sources of up to 30 s. A FAQ on the page gives conflicting HDR figures. — [Luma API pricing](https://lumalabs.ai/api/pricing)
- **Luma's claims (2026-06-09):** up to 16 keyframes per clip; performance and face transfer (skeletal posture, gestures, expressions of up to 8 faces at once); native HDR; 16-bit EXR; Reframe (aspect change, extend frame, replace background); clips up to 20 s at 1080p. Consumer route: lumalabs.ai/ray. — [Luma news](https://lumalabs.ai/news/introducing-ray-3-2)
- **Ray 2 on fal** `fal-ai/luma-dream-machine/ray-2` (superseded): $0.50 per 5 s at 540p; 720p ×2, 1080p ×4; 5 s or 9 s. — [fal Ray 2](https://fal.ai/models/fal-ai/luma-dream-machine/ray-2/llms.txt)
- **Arena T2V:** Luma Ray3 #31 (1206); Ray2 #46 (1065). Ray 3.2 is not ranked. — [Arena](https://arena.ai/leaderboard/video/text-to-video)

### Inferences
- Ray 3.2 is the pick for shots that must hit exact poses or frames over time (many keyframes) or that need HDR/EXR for grading. Pair it with separate sound, since there is no native audio.

### Gaps
- No independent quality ranking for Ray 3.2. Generation time and moderation policy were not found.

---

## Pika (2.2)

### Takeaway
Pika is effectively legacy for this purpose. fal hosts Pika 2.2 ($0.20 for 5 s at 720p, $0.45 for 5 s at 1080p; 5 or 10 s, no audio documented), and it ranks second-to-last on Arena. No Pika 2.5 or newer on fal was confirmed.

### Cited Findings
- **fal `fal-ai/pika/v2.2/image-to-video`:** 720p 5 s $0.20; 1080p 5 s $0.45; `duration` 5 or 10; `negative_prompt`, `seed`. No audio or moderation info. — [fal Pika 2.2](https://fal.ai/models/fal-ai/pika/v2.2/image-to-video/llms.txt)
- **Arena T2V:** Pika 2.2 #47 of 48 (1009). — [Arena](https://arena.ai/leaderboard/video/text-to-video)

### Inferences
- Not worth adding except for nostalgia or stylized effects.

### Gaps
- Pika 2.5 (reported early 2026) and Pika's own API status are unverified.

---

## PixVerse V6

### Takeaway
PixVerse V6 (Mar 2026) is a cheap, fast-iterating mid-tier model on fal. Prices run from $0.025/s (360p, silent) to $0.115/s (1080p with audio). Clips are 1–15 s with optional audio (BGM, effects, dialogue), multi-clip camera changes and style presets.

### Cited Findings
- **fal `fal-ai/pixverse/v6/image-to-video`** (also `/text-to-video`, `/extend`):
  - **Price per s, without / with audio:** 360p $0.025 / $0.035; 540p $0.035 / $0.045; 720p $0.045 / $0.060; 1080p $0.090 / $0.115.
  - **Inputs:** `image_url`, `prompt` (≤2048 bytes), `resolution`, `duration` 1–15 (default 5), `negative_prompt`, `style` anime/3d_animation/clay/comic/cyberpunk, `seed`, `generate_audio_switch` (default false), `generate_multi_clip_switch`, `thinking_type`, safety checker (default on). No end frame or aspect parameter on i2v. — [fal PixVerse V6 i2v](https://fal.ai/models/fal-ai/pixverse/v6/image-to-video/llms.txt); [fal pricing](https://fal.ai/pricing)
- **Leaderboards:** AA T2V 984, I2V 959 (Mar 2026); Arena has PixVerse V5.6 at #26. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [Arena](https://arena.ai/leaderboard/video/text-to-video)

### Inferences
- A good "stylized" (anime, clay, comic) option and one of the cheapest 1080p-with-audio routes.

### Gaps
- PixVerse's vendor API prices, generation time and real-face policy were not found.

---

## Vidu Q3 (Q3, Q3 Pro, Q3 Turbo)

### Takeaway
Vidu Q3 is mid-table (AA Elo about 900–936). On fal it costs $0.07/s at 360/540p and 2.2× that at 720/1080p (about $0.154/s). Clips are 1–16 s, with start and end frames and audio on by default (dialogue and effects).

### Cited Findings
- **fal `fal-ai/vidu/q3/image-to-video`** (also `/q3/text-to-video`, `/q3/image-to-video/turbo`, `/q3/text-to-video/turbo`):
  - **Price per s:** 360p and 540p $0.07; 720p and 1080p 2.2× (about $0.154, my calculation).
  - **Inputs:** `image_url`, `end_image_url` (360p not available with an end frame), `prompt` ≤2,000 characters, `duration` 1–16 (default 5), `resolution` 360p/540p/720p (default)/1080p, `audio` (default true; dialogue and effects), `seed`, safety checker (default on; turning it off needs authorization). — [fal Vidu Q3 i2v](https://fal.ai/models/fal-ai/vidu/q3/image-to-video/llms.txt)
- **Leaderboards:** AA T2V Q3 Pro 936 (Jan 2026, $7.20/min), Q3 Turbo 916 (Feb 2026, $3.90/min); I2V 930 / 899. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)

### Inferences
- Vidu is not competitive on price per quality against Wan 3.0 or H3 Max at 720p. It is a candidate only for anime or stylized work, where it has a reputation (not verified here).

### Gaps
- Turbo prices and the Turbo reference-to-video limits (a snippet said 1–4 images) were not opened. Vendor API prices were not found.

---

## Moonvalley Marey (Realism v1.5)

### Takeaway
Marey's selling point is training "exclusively on fully licensed data" (commercially safe). On fal it costs $1.50 per 5 s or $3.00 per 10 s ($0.30/s) at 1080p dimensions, with no audio. It doesn't appear on the current leaderboards.

### Cited Findings
- **fal `moonvalley/marey/i2v`:** $1.50 for 5 s, $3.00 for 10 s. `dimensions` 1920x1080 (default), 1080x1920, 1152x1152, 1536x1152, 1152x1536; `duration` 5s/10s; `negative_prompt` (long default); `seed`; `guidance_scale` 0–20. No audio. The page states it is "trained exclusively on fully licensed data". — [fal Marey i2v](https://fal.ai/models/moonvalley/marey/i2v/llms.txt)
- **Other fal endpoint** (seen in fal search results, page not opened): `moonvalley/marey/motion-transfer` (video-to-video).
- Marey is absent from the Arena and AA lists fetched. — [Arena](https://arena.ai/leaderboard/video/text-to-video); [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video)

### Inferences
- Offer Marey only as a "licensed-data" option for clients who need provenance assurances.

### Gaps
- No newer Marey version than Realism v1.5 was found. Moonvalley's direct API prices were not found.

---

## Lightricks LTX-2.5 (hosted Fast and Pro)

### Takeaway
LTX-2.5 (Aug 2026) is mid-table on quality but very flexible on output. On fal's Fast tier: up to 4K, 24/25/48/50 fps, 6–20 s, audio on by default, camera-motion presets, $0.09/s (720p) to $0.30/s (4K). It also has open weights, which matters for the 4090.

### Cited Findings
- **fal `lightricks/ltx-2.5/image-to-video/fast`:**
  - **Price per s, audio included:** 720p $0.09, 1080p $0.13, 1440p $0.19, 4K $0.30.
  - **Inputs:** `image_url`, `prompt`, `end_image_url`, `duration` 6/8/…/20 or "auto", `resolution` 720p/1080p (default)/1440p/2160p, `aspect_ratio` auto/16:9/9:16, `fps` 24/25 (default)/48/50, `generate_audio` (default true), `camera_motion` dolly_in/out/left/right, jib_up/down, static, focus_shift.
  - **Limits:** 720p/1080p at 24–25 fps up to 20 s; at 48–50 fps up to 10 s; 1440p and 4K up to 10 s. No moderation notes. — [fal LTX-2.5 fast i2v](https://fal.ai/models/lightricks/ltx-2.5/image-to-video/fast/llms.txt)
- **Leaderboards:** AA T2V LTX-2.5 Fast 947, Pro 944 (Aug 2026; $7.80 and $10.20 per min); I2V 918 / 910. Arena: LTX-2 19B #41. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video); [Arena](https://arena.ai/leaderboard/video/text-to-video)
- **Weights:** LTX-2.5 is 19B parameters with native audio. Open weights are free for organizations under $10M annual revenue. — [Exemplary](https://exemplary.ai/blog/ai-video-generation-models-2026)

### Inferences
- LTX-2.5 is the only hosted model seen with selectable 48/50 fps, and one of the few with a 1440p tier, so it suits slow-motion and high-frame-rate shots. Its open weights make a ComfyUI route on the 4090 plausible (separate research needed).

### Gaps
- fal's LTX-2.5 Pro endpoint id and prices: a secondary source says $0.12 (720p) / $0.17 (1080p) per s, unverified. Lightricks' own API prices were not opened.

---

## Others worth knowing (ranked highly, mostly not on fal)

### Takeaway
Several leaderboard leaders have no fal route or no API at all: Meta Muse Video (no official API), Utopai X (no API), HeyGen Video 1 (HeyGen API; built on MiniMax H3 per secondary sources), P-Video-2-Pro (Pruna), Hyperflow H3, Agnes-Video-2.5 and MAGI-2 (coming soon).

### Cited Findings
- **Meta Muse Video:** Arena T2V #9 (1456, "Proprietary"). — [Arena](https://arena.ai/leaderboard/video/text-to-video)
- **HeyGen Video 1:** AA T2V #6 (1156), I2V #6 (1120), released Oct 2026, $2.40/min (about $0.04/s) on the creator's API. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)
- **P-Video-2-Pro (Pruna AI):** AA T2V 1125, I2V 1119 (#7), Sep 2026, $5.70/min (about $0.095/s). — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)
- **Utopai X (Utopai Studios):** AA T2V #2 (1166), I2V #2 (1146), "No API available". **MAGI-2 Preview (Sand.ai):** T2V 1044, "Coming soon". **Hyperflow H3 (Video Rebirth):** I2V #5 (1124), $9.00/min. **Agnes-Video-2.5 (Sapiens AI):** T2V 1068, I2V 1100, $2.40/min. — [AA T2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/text-to-video); [AA I2V](https://artificialanalysis.ai/embed/text-to-video-leaderboard/leaderboard/image-to-video)
- **fal-hosted "world models":** `robbyant/lingbot-world-2`, `alibaba/abot-world-0`. — [fal models list](https://fal.ai/models?categories=text-to-video)

### Inferences
- HeyGen Video 1 (about $0.04/s, top-6 on both AA boards) and P-Video-2-Pro look like strong value models, but would need a non-fal integration.

### Gaps
- **Meta Muse Video:** secondary sources say Meta has no official Muse Video API (only Muse Image, Spark and others on Meta's Model API), and a reseller claims access. Neither was verified on Meta's pages. This matters because beatsheet has a Meta key.
- **HeyGen Video 1:** specs (480p/768p, 5–15 s, up to 9 images, 3 videos and 3 audio as references; built on MiniMax H3; launch discount through October) come from secondary pages that were not opened.
- **P-Video-2-Pro:** fal availability and modes ("Cost"/"Quality", Avatar) unverified.

---

## Cross-cutting: moderation and real faces, by route

### Takeaway
On fal, most third-party endpoints have `enable_safety_checker` on by default, and only authorized accounts can relax it. Google models on fal instead expose `safety_tolerance` (Veo 1–6, default 4) and FLUX 3 exposes 0–4 (default 2). The vendor-level likeness blocks are the ones to plan around: Gemini Omni Flash (real people's likenesses, even one's own footage) and Seedance on BytePlus (real faces in references; secondhand). No real-face policy text was found for Kling, Wan, H3, Grok or Luma.

### Cited Findings
- **Turning the safety checker off needs account authorization** ("unauthorized requests are always checked", or "authorized callers may set false to request relaxed screening") on: Kling v3 Pro, Kling O3, Kling Avatar, Wan 3.0, HappyHorse, PixVerse V6, Vidu Q3, Grok 1.5, Luma Ray 3.2, Hailuo 2.3. — [fal Kling v3 pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/llms.txt); [fal Wan 3 Prime](https://fal.ai/models/alibaba/wan-3.0-prime/image-to-video/llms.txt); [fal HappyHorse](https://fal.ai/models/alibaba/happy-horse/image-to-video/llms.txt); [fal PixVerse](https://fal.ai/models/fal-ai/pixverse/v6/image-to-video/llms.txt); [fal Vidu](https://fal.ai/models/fal-ai/vidu/q3/image-to-video/llms.txt); [fal Grok 1.5](https://fal.ai/models/xai/grok-imagine-video/v1.5/image-to-video/llms.txt); [fal Ray 3.2](https://fal.ai/models/luma/agent/ray/v3.2/image-to-video/llms.txt); [fal Hailuo 2.3](https://fal.ai/models/fal-ai/minimax/hailuo-2.3/pro/image-to-video/llms.txt)
- **Veo 3.1 on fal:** `safety_tolerance` "1"–"6" (default "4"), plus `auto_fix`, which rewrites prompts that fail policy. — [fal veo3.1](https://fal.ai/models/fal-ai/veo3.1/llms.txt). **FLUX 3 on fal:** `safety_tolerance` 0–4 (default 2). — [fal FLUX 3](https://fal.ai/models/blackforestlabs/flux-3/image-to-video/llms.txt)
- **Gemini Omni Flash:** the "real people's names or likenesses" block was reported on a user's own footage. — [Google AI forum](https://discuss.ai.google.dev/t/real-peoples-names-or-likenesses-block-on-own-footage-gemini-omni-flash-preview-skyhill-hq/179433)
- **xAI:** generated media is subject to content-policy review. — [xAI video guide](https://docs.x.ai/docs/guides/video-generations)

### Inferences
- For shots that animate a real person's photo, the most promising fal routes are Kling 3/O3/4, Wan 3, H3/H3 Max, Grok 1.5, FLUX 3 and Veo 3.1 (adjustable tolerance). All are untested here, so test before relying on any of them. Avoid Gemini Omni Flash and Seedance (vendor API) for real-person references.

### Gaps
- Official per-vendor policies on public figures, minors, violence, blood and weapons were not found for any model in this pass. fal's own acceptable-use policy was not opened.
