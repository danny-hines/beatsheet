# Prompting recipes for AI video and board-image models (as of 2026-11-02)

Source labels used throughout:
- **[Official]** = the model's maker (Google, OpenAI, Kuaishou/Kling, ByteDance/BytePlus, MiniMax, Runway, Luma, Alibaba/Wan, Lightricks, Black Forest Labs).
- **[Host]** = a platform that serves the model (fal, Runware, Sogni, WaveSpeed, Morphic). Their advice is tested on that model but isn't the maker's.
- **[Community]** = independent guides, blogs and forum posts.
- "(via search snippet)" = the page itself would not load (403/404/blank). The claim comes from the search engine's excerpt of that page, so it's less certain.

---

## 1. Recommended structure, ideal length and element order (plus which models are still current)

### Takeaway
Most makers now want **prose that reads like a shot brief, not keyword lists**. Google's Veo formula puts the camera first (cinematography → subject → action → context → style/ambiance). LTX wants the **action first** in one flowing paragraph of under 200 words. Sora's guide splits prose, cinematography, actions and dialogue into blocks. MiniMax H3 is the outlier: it uses a **fixed-field structured prompt**. Since September, two models that were current have gone: **Sora's API shut down on 2026-09-24**, and the **Veo 3.1 preview models on the Gemini API shut down on 2026-10-22**, with Google pointing developers to **Gemini Omni Flash**.

### Cited Findings

**Model status (affects which recipes matter)**
- [Official, via Wikipedia citing OpenAI] OpenAI announced on 2026-03-24 that it was discontinuing Sora. The app shut down on 2026-04-26 and the API on 2026-09-24. No Sora 3 has been announced. — [Wikipedia: Sora](https://en.wikipedia.org/wiki/Sora_(text-to-video_model)); speculation pieces about "Sora 3" are unconfirmed — [WaveSpeed](https://wavespeed.ai/blog/posts/openai-sora-3-what-to-expect-from-the-next-generation-video-model)
- [Official] The Gemini API video page says `veo-3.1-generate-preview`, `-fast-` and `-lite-` were shut down on 2026-10-22. It recommends migrating to Gemini Omni Flash (`gemini-omni-1.1-flash`) or to GA Veo models on Google's enterprise platform. — [Gemini API: video](https://ai.google.dev/gemini-api/docs/video)
- [Official, via Vertex reference] `veo-3.1-generate-001` (GA, not preview) is still listed on Vertex AI, with `lastFrame` support. — [Vertex Veo API reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation) (via search snippet)
- [Press] Google unveiled Gemini Omni at I/O on 2026-05-19. It takes text, image, audio and video as references, outputs roughly 10-second clips and supports conversational editing. Google describes it as going beyond Veo 3.1. — [Engadget](https://engadget.com/2176590/googles-gemini-omni-can-generate-anything-from-any-input-starting-with-video); [BusinessWorld](https://www.bworldonline.com/technology/2026/05/20/751019/google-launches-gemini-omni-capable-of-chat-based-video-generation-editing/)
- No official "Veo 4" exists. Pre-I/O speculation suggested the next model might ship under a different name, and it did ship as Omni. — [PixVerse blog](https://pixverse.ai/en/blog/veo-4-release) [Community]
- [Host/Community] Seedance 2.5 was unveiled on 2026-06-23 and shipped on 2026-07-31, per Atlas Cloud. It is claimed to do 30 s in one pass, up to 50 references and 4K. Sources conflict on the dates. — [Atlas Cloud](https://www.atlascloud.ai/blog/tips/why-is-seedance-2-5-delayed); [Renderforest](https://www.renderforest.com/blog/how-to-use-seedance-2-5)
- [Official] BytePlus has a "Dreamina Seedance 2.0 series prompt guide" (zh-CN page updated 2026-09-28), and its sidebar lists a separate "Seedance 2.5 prompt guide". The body text would not render for fetching. — [BytePlus EN](https://docs.byteplus.com/en/docs/ModelArk/2222480); [BytePlus zh-CN](https://docs.byteplus.com/zh-CN/docs/modelark/seedance-2-0-prompt-guide)
- [Official, via search snippet] Runway's help center lists Gen-4.5 as its most advanced text-to-video and image-to-video model. Gen-4 and Gen-4 Turbo are older, cheaper and faster. — [Runway help: Gen-4.5 section](https://help.runwayml.com/hc/en-us/sections/47297541368595-Gen-4-5)
- [Official] Luma released Ray3.2 on 2026-06-09: up to 16 keyframes per clip, up to 20 s at 1080p, native HDR with 16-bit EXR, and performance transfer for up to 8 faces. — [Luma news](https://lumalabs.ai/news/introducing-ray-3-2)
- [Community] A Segmind article (2026-09-10) describes "Wan 3" (`wan3.0-video`, 2–30 s, audio, `last_frame`). No Alibaba page confirming it was found. — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Official] The LTX-2 GitHub README names **LTX-2.5** as the recommended model. LTX-2.3 also runs every pipeline. — [Lightricks/LTX-2](https://github.com/Lightricks/LTX-2)
- [Community] MiniMax H3 launched on 2026-07-31 (4–15 s, 768P or 2K), per OrcaRouter (via search snippet). Hailuo 02 now sits under MiniMax's legacy video models, with Hailuo 2.3 as the newer one. — [OrcaRouter](https://www.orcarouter.ai/blog/how-to-use-minimax-h3); [minimax-ai.chat](https://minimax-ai.chat/models/minimax-hailuo-23)

**Google Veo 3.1**
- [Official] Formula: **[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]**, with the camera and shot first. — [Google Cloud blog: Ultimate prompting guide for Veo 3.1](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Official] The Vertex guide lists these elements: subject, action, scene/context, camera angles, camera movement, lens/optics, visual style, temporal elements, audio, cinematic terms and negative prompt. Not every prompt needs all of them, and no strict order is prescribed. Being specific about subjects avoids generic output. — [Vertex Veo prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide)
- [Official] Google suggests using Gemini to expand a simple prompt into cinematic language. It also suggests making frames or references with an image model first, then animating them in Veo, as more controllable than one long prompt. — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)

**Gemini Omni Flash**
- [Official] Describe the scene, camera movement, lighting and mood. Meta-requests for detail, realism or costume/environment design are allowed. — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)

**OpenAI Sora 2 (discontinued; its guide is still the clearest general template)**
- [Official] Separate the information into blocks: prose scene description, then cinematography (shot and mood), then a list of actions, then dialogue. Leave out what doesn't matter. Establish the style (decade, film stock, production type) early. Prefer concrete visible details to adjectives like "beautiful". Name 3–5 palette colors and reuse them across shots. Detailed prompts constrain more but may be followed less reliably. Model, size and seconds are API parameters, so writing them into the prompt does nothing. — [OpenAI Cookbook: Sora 2 prompting guide](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)

**Kling (2.5 Turbo, 3.0, O1)**
- [Host] Write scene direction, not object lists. Define core subjects early and describe them the same way across shots. — [fal blog: Kling 3.0 prompting guide](https://blog.fal.ai/kling-3-0-prompting-guide/)
- [Host] Aim for **2–5 short sentences**, one each for subject, motion, camera and atmosphere. Lists of comma-separated style tags don't help. — [fal: How to use Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Official] Kling O1 text-to-video structure: subject, movement, scene, then cinematic language, lighting and atmosphere. Image/element-reference structure: element descriptions, then interactions between elements, then environment, then visual direction. — [Kling VIDEO O1 user guide](https://kling.ai/quickstart/klingai-video-o1-user-guide)

**Seedance 2.0 / 2.5**
- [Community] Suggested order: reference assignment, scene, action/motion, camera, timing/sequence, then audio or emotional intent. — [RunDiffusion](https://www.rundiffusion.com/seedance-2-0-prompt-guide)
- [Host] Start with subject and motion, then add environment, look, camera and audio as needed. Mood words like "cinematic" produce generic results. — [fal: Seedance 2.0 prompting guide](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)
- [Community] The first **20–30 words** carry the most weight, so lead with subject and core action and cut stacked adjectives to one strong word. Prompts are capped at 3,000 characters. — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)
- [Community] Seedance 2.5: subject, action, environment, camera movement, mood/style (written before the 2.5 API opened, so unverified). — [Renderforest](https://www.renderforest.com/blog/how-to-use-seedance-2-5)

**MiniMax Hailuo 2.3 / 02**
- [Official] Prompts can be up to 2,000 characters. Bracketed camera commands are more precise than natural language. — [MiniMax API: video generation I2V](https://platform.minimax.io/docs/api-reference/video-generation-i2v)

**MiniMax H3**
- [Official] The core fields go in a fixed order: `integrated_multimodal_description` (visuals, shot by shot), `overall_soundscape`, `non_diegetic_music`. Image-conditioned modes start with a one-line instruction about the reference images, then a blank line, then the fields. Open Shot 1 with the visual style (live-action, 2D, 3D CG, claymation…) and the opening composition. For keyframe tasks, take the style from the image. Durations are written with two decimals. — [MiniMax H3 VIDEO_PROMPT_WRITING_GUIDE (Hugging Face)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Host] Reference-to-video uses six fields: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`. — [Sogni docs: MiniMax H3](https://docs.sogni.ai/models/minimax-h3/)
- [Community] Users report poor prompt adherence. They advise running the idea through the repo's `h3-prompt-writing` agent skill with a strong LLM. — [HF discussion](https://huggingface.co/MiniMaxAI/MiniMax-H3/discussions/83) (via search snippet); [Oxen](https://ghost.oxen.ai/minimax-h3/)

**Runway Gen-4.5 / Gen-4 / Aleph**
- [Host] For image-to-video, the prompt describes only how the frame changes. Separate subject motion from camera motion. — [Runware: Gen-4.5 directing motion](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)
- [Community] Starter pattern: "The camera [motion] as the subject [action]." — [ImagineArt](https://www.imagine.art/blogs/runway-gen-4-5-prompt-guide)
- [Official, via search snippet] Aleph prompts need an action verb that sets the scope of the change (add, remove, change, replace, re-light, re-style) plus a description of the target transformation. Simplicity is encouraged. — [Runway help: Aleph](https://help.runwayml.com/hc/en-us/articles/43176400374419)

**Luma Ray3 / Ray3.2**
- [Official, via search snippet] Ray3 benefits from comprehensive, multi-layered prompts covering camera, action, physics, lighting and mood, whereas Ray2 preferred shorter directive prompts. The same style works in Draft and Hi-Fi. — [Luma help: Ray3 prompting](https://lumaai-help.freshdesk.com/support/solutions/articles/151000223059-how-do-i-use-ray3-prompting-effectively-); contradicted by an older Luma help article that recommends shorter directive commands for Ray2/Ray3 — [Luma help: Ray1.6 → Ray2/Ray3](https://lumaai-help.freshdesk.com/support/solutions/articles/151000222545-how-do-i-transition-from-ray1-6-to-ray2-ray3-for-video-generation-)
- [Official] Ray3.2's launch post says to direct story beats, motion and visual progression. — [Luma news](https://lumalabs.ai/news/introducing-ray-3-2)
- [Official, via search snippet] The more specific the physics description, the better Ray3 simulates it. — [Luma help](https://lumaai-help.freshdesk.com/support/solutions/articles/151000223059-how-do-i-use-ray3-prompting-effectively-)

**Wan 2.2 (and 2.6 / "3")**
- [Community, consistent across guides] Basic formula: subject + scene + motion. Advanced formula adds aesthetic control (light source, lighting, shot size, angle, lens, camera move) and stylization. Image-to-video formula: motion + camera movement. — [ImagineArt: Wan 2.2](https://help.imagine.art/ai-models/video-models/wan-2.2); [MimicPC](https://www.mimicpc.com/learn/how-to-craft-wan22-ai-video-prompts)
- [Official] Wan2.2's training data was labeled for lighting, composition, contrast and color tone, so those words steer the look. Prompt extension (Qwen) is optional but recommended because it adds detail. — [Wan2.2 GitHub](https://github.com/Wan-Video/Wan2.2)
- [Community] **80–120 words**. Order the description as the camera sees it: what's first, what the camera does, what is revealed. Under-specified prompts get the model's own cinematic defaults, such as unwanted lens flares and zooms. — [aistudynow (tested in ComfyUI)](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/)
- [Community] "Wan 3" formulas, which the article attributes to Alibaba's Model Studio guide without a URL: basic (entity, scene, motion); advanced (+ aesthetic control, stylization); sound (+ sound description); multi-shot (overall description + shot number + timestamp + content); reference-to-video (reference id, action, scene, lines, BGM). — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Official] Wan 2.6 text-to-video allows up to 1,500 characters of prompt (500 for `negative_prompt`, per EvoLink). — [Alibaba Model Studio T2V API reference](https://alibabacloud.com/help/en/model-studio/text-to-video-api-reference) (via search snippet); [EvoLink](https://evolink.ai/blog/wan-2-6-api-guide)

**LTX-2 / 2.3 / 2.5**
- [Official] Write one flowing paragraph that opens with the main action in a single sentence. Then cover, roughly in order: movements and gestures, appearance, background and environment, camera angles and movement, lighting and colors, and any sudden events. Keep it chronological and literal, think like a cinematographer writing a shot list, and stay **under 200 words**. — [Lightricks/LTX-2 README](https://github.com/Lightricks/LTX-2)
- [Community] For LTX-2.5: **4–8 present-tense sentences**. Labeled fields like "Camera:" produce stilted results. Name light as a physical source with a direction. Name one camera move and what the frame looks like after it. Express emotion through physical cues. Words like "8K" or "masterpiece" do nothing. — [deAPI LTX-2.5 guide](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)

**Board image models**
- [Official] Nano Banana Pro: write full sentences as if briefing a human artist (subject, setting, lighting, mood, materials). Say who or what the image is for. Avoid tag lists. "Edit, don't re-roll". — [Google AI (dev.to): Nano Banana Pro prompting guide](https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n)
- [Official] GPT Image (gpt-image-2, released 2026-04-21): order is background/scene, then subject, then key details, then constraints. State the intended use. Use labeled segments for complex requests. — [OpenAI Cookbook: GPT image models prompting guide](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Official] FLUX.2: subject → action → style → context, front-loading what matters most because earlier words weigh more. 30–80 words is usually ideal. JSON prompts are supported. — [BFL: FLUX.2 prompting guide](https://docs.bfl.ai/guides/prompting_guide_flux2)
- [Host, citing BytePlus] Seedream 4.5: put exact text in double quotes and keep prompts under 600 words. — [Hedra: Seedream 4.5](https://www.hedra.com/models/image/bytedance/seedream-45) (via search snippet)

### Inferences
- **Draft per-model recipe (synthesized from all sections below):**
  - **Veo 3.1 (Vertex GA) / Gemini Omni Flash:** Start with the camera ("Medium shot, slow dolly in…"), then subject, action, setting, style and light. Put audio in separate labeled sentences (dialogue in quotes with the speaker; "SFX:"; "Ambient noise:"). Describe what you want instead of using "no X". On Omni, tag inputs (`<FIRST_FRAME>`, `<IMAGE_REF_0>`), say "one continuous shot, no cuts" when you want one, and use `[0-3s]` timecodes for beats.
  - **Kling 3.x / 2.5 Turbo:** Write 2–5 sentences that describe only the motion and camera when a board is given. Name @Element1… for elements. Use labeled shots with durations for multi-shot. For dialogue, use unique speaker labels, put the action before the line, and add a tone tag. Leave the default negative prompt (blur, distortion, low quality) and add specific artifacts. Leave cfg 0.5.
  - **Kling O1:** Use templates: "Take [@Image1] as the start frame, take [@Image2] as the end frame, [change]". 3–10 s. No audio documented.
  - **Seedance 2.x:** Assign every reference a role (@image1 as first frame, @video1 for camera movement). Put the subject and action in the first 20–30 words, one action and one camera instruction per shot, "cut to" between shots, dialogue in quotes with a tone note, and short lines. Say what audio should be there (for example "room tone and footsteps only"). Test at 5 s 720p.
  - **Hailuo 2.3:** Write natural prose plus bracketed camera commands (`[Push in]`, at most 3 per bracket), and set `prompt_optimizer: false` when precise wording matters.
  - **MiniMax H3:** Use the three-field structured prompt (visuals with `[Shot N]` blocks and cut times, soundscape, music or N/A). Use speaker IDs (S1) and the dialogue tag. Describe what each keyframe shows in words, because the text encoder doesn't see the images.
  - **Runway Gen-4.5:** Describe motion only, in two channels (camera, subject) with pacing words. Phrase holds positively ("locked camera", "the subject stays still").
  - **Runway Aleph:** Write a verb plus the transformation, for example "Re-light the scene as golden hour", keep it short, and work in ≤5 s segments.
  - **Luma Ray3.2:** Write rich layered prose (camera, action, physics, light, mood) and use keyframes for structure. There's no native audio in T2V/I2V.
  - **Wan 2.2:** Write 80–120 words (subject, scene, motion, aesthetic control). Use one camera move per clip, keep the default negative prompt, keep clips ~5 s, and use the Fun-Camera model for hard camera control.
  - **LTX-2.x:** Write one present-tense paragraph that starts with the action, under 200 words. Describe only the change on image-to-video, quote dialogue at ~2.5 words/s, and don't use negative prompts.
  - **Boards (Nano Banana Pro, GPT Image, FLUX.2, Seedream):** Write full sentences, number the reference images ("Image 1: …") and give each a role. Lock identity explicitly and repeat a preserve list on every edit. Put text in quotes.
- Because Sora's API is gone and the Veo preview IDs on the Gemini API are gone, beatsheet's "Veo" route should either use Vertex GA `veo-3.1-generate-001` or move to Omni Flash, which has a different reference syntax.
- Prompt length guidance clusters around **40–120 words for video** (Kling 2–5 sentences, LTX 4–8 sentences/<200 words, Wan 80–120). H3's structured fields and Ray3's layered prose are the main exceptions that reward longer prompts.

### Gaps
- The bodies of BytePlus's official Seedance 2.0 and 2.5 prompt guides couldn't be retrieved, so Seedance advice here is host and community.
- Runway's help center (Gen-4/4.5 prompting guides, Camera Terms, Aleph guide) returned 403. Runway's official wording comes only from search snippets.
- Lightricks' official docs.ltx.video prompting guide (403) and ltx.io blog posts (header error) couldn't be read. Only the GitHub README is first-hand official.
- Luma's Ray3.2 "Prompting, Outputs & Controls" learning-center article returned 404 when fetched.
- No official Kling 3.0 user guide page was retrieved. Kling 3.x advice comes from fal (host) and community sources.
- The existence and official docs of "Wan 3", "Wan 2.7" and "Kling O3" (named in a third-party doc title, [Pletor](https://docs.pletor.ai/ai-model-library/video-models/kling-o3-o1)) weren't verified.

---

## 2. Camera-move vocabulary each model understands, and how reliably

### Takeaway
Standard cinematography terms (dolly, truck, pan, tilt, pedestal, crane, arc/orbit, tracking, zoom, static/locked-off, handheld) are understood across the board. **MiniMax Hailuo is the only one with an official bracket-command list.** The reliable patterns everywhere: **one camera move per shot, add a pacing word, and say explicitly when the camera holds.** Combined moves (dolly + tilt) and full 360° orbits in 5 s are commonly dropped.

### Cited Findings
- [Official] Veo/Vertex defines: static; pan (horizontal rotation); tilt (vertical rotation); dolly (moves toward or away); truck (sideways); pedestal (up/down, level); zoom (focal length, not a dolly); crane, aerial/drone, handheld, whip pan, arc. Some advanced angles and lenses aren't officially supported, so results vary. — [Vertex Veo prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide)
- [Official] Veo 3.1 guide examples cover movement (dolly, tracking, crane, aerial, slow pan, POV), composition (wide, close-up, ECU, low angle, two-shot) and lens (shallow DOF, wide-angle, soft focus, macro, deep focus). — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Community] Veo 3.1 responds well to cinematography language (dolly, shallow DOF, crane) for controlling tone. — [DEV: Veo 3.1 developer guide](https://dev.to/akaranjkar08/veo-31-developer-guide-timestamp-prompting-multi-shot-video-and-full-api-june-2026-3l5i) (via search snippet)
- [Official] Sora: keep each shot to **one clear camera move**. Framing examples include wide establishing shot at eye level, aerial wide with slight downward angle, and medium close-up from slightly behind. Motion examples include slow tilt and handheld ENG-style. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)
- [Official] MiniMax camera commands (Hailuo 2.3, 2.3-Fast, 02, I2V-01-Director): `[Truck left]`, `[Truck right]`, `[Pan left]`, `[Pan right]`, `[Push in]`, `[Pull out]`, `[Pedestal up]`, `[Pedestal down]`, `[Tilt up]`, `[Tilt down]`, `[Zoom in]`, `[Zoom out]`, `[Shake]`, `[Tracking shot]`, `[Static shot]`. Simultaneous moves go in one bracket, comma-separated (`[Pan left,Pedestal up]`), with a recommended max of 3. For sequential moves, write them in order through the prompt. Natural language is accepted, but commands are more accurate. — [MiniMax API docs](https://platform.minimax.io/docs/api-reference/video-generation-i2v)
- [Official] MiniMax H3 motion types: zoom, push in/pull out, pan, truck, tilt, pedestal, arc, tracking, static, shake, POV, roll. Add amplitude (small/large) and speed (slow/fast) only when they matter. Write camera motion as a natural action inside the sentence, not as labels tacked on the end. — [H3 prompt guide (HF)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Host] Kling 3.0: use real camera terms (push-in, tracking, close-up, wide angle, dolly zoom, rack focus). **Without a camera direction, the shot defaults to mostly static or slightly drifting.** — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Host] Kling 3.0 understands profile shots, macro close-ups, tracking, POV and shot-reverse-shot. Describe how the camera reacts over time, for example when the subject pauses or resumes. — [fal blog](https://blog.fal.ai/kling-3-0-prompting-guide/)
- [Host] Runway Gen-4.5: push-in, pull-back, pan, tilt, dolly left/right, orbit, crane up/down. Explicit names beat vague directions. Add a pacing word (slow, gradual, steady, subtle, rapid, sudden, continuous), or the result comes out "average". — [Runware: Gen-4.5](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)
- [Host] Seedance 2.0: dolly, pan, tilt, crane, push-in, rack focus, locked-off, handheld and lens notes are read more reliably than vague directions like "epic camera". — [fal: Seedance 2.0](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)
- [Community] Seedance: build camera direction from shot size, angle, movement and lens. Text conveys camera moves less reliably than a reference video does. — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)
- [Community] Wan 2.2 tested: pan left/right (including direction swaps), dolly out, tilt up, tracking, crash zoom, camera roll and pull back worked. A combined dolly-back + tilt-up failed. A 360° orbit in 5 s was ignored. Stacked moves: the first is followed and the rest fade. — [aistudynow](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/)
- [Community] Wan 2.2: pick one shot type and one camera movement, and don't mix aerial with close-up. — [wan27.org](https://www.wan27.org/blog/wan-2-2-prompt-guide) (via search snippet)
- [Official, PAI/Comfy] For exact camera paths on Wan, the separate Wan2.2-Fun-Camera-Control model takes explicit camera parameters (WanCameraEmbedding node). — [ComfyUI docs](https://docs.comfy.org/tutorials/video/wan/wan2-2-fun-camera)
- [Community] "Wan 3": naming a shot size plus a move ("medium close-up, slight low angle, slow push in") stops it from cutting the shot into a montage on its own. A locked-off camera held for the full clip. — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Community] LTX-2.5: name **one** camera move relative to the subject and what the frame looks like after it. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [Official] Ray3.2 controls camera paths through keyframes (up to 16 per clip at launch). — [Luma news](https://lumalabs.ai/news/introducing-ray-3-2)

### Inferences
- A shared camera vocabulary for beatsheet: **static/locked-off, push in, pull out, dolly in/out, truck left/right, pan left/right, tilt up/down, pedestal up/down, crane up/down, arc/orbit left/right, tracking/follow, handheld, zoom in/out, whip pan, rack focus**, each with an optional pace word (slow/steady/rapid). For Hailuo, map these to its bracket tokens.
- Always state the camera, even if it's "locked-off". Kling, Runway and LTX all drift or go static without it.
- Keep orbits partial (a 90°–180° arc) in clips of 5 s or less.

### Gaps
- No maker publishes measured reliability per move. The reliability notes come from community tests (Wan 2.2) and host guidance.
- Runway's official "Camera Terms, Prompts & Examples" page couldn't be retrieved (403).
- I found no evidence that Hailuo bracket commands work in H3, or that they survive `prompt_optimizer: true`. A community source suspects the optimizer may rewrite them — [minimax-ai.chat](https://minimax-ai.chat/models/minimax-hailuo-23) (via search snippet).

---

## 3. Starting from a picture (board): describe only the motion, or restate the scene?

### Takeaway
There's a strong consensus: **describe the motion, camera and change, not what the image already shows.** Runway, Kling (fal), LTX, Seedance and Wan sources all say restating the scene either does nothing (near-static loops) or fights the image (identity drift). The exceptions are **MiniMax H3**, whose text encoder doesn't see the image, so its guide wants the image's subject, style and composition described at 0.00 s, and **Sora**, whose guide treats the image as the first frame and the prompt as "what happens next".

### Cited Findings
- [Official, via search snippet] Runway: for Image to Video, the prompt should focus on the desired motion, and you don't need to describe the image's contents. — [Runway help: Generate Videos](https://help.runwayml.com/hc/en-us/sections/20193397970323-Generate-Videos)
- [Host] Runway Gen-4.5: delete any sentence describing what the still already shows. Re-describing gives the model nothing to do and tends to produce **near-static loops**. Name motion in each channel (camera, subject, environment). — [Runware](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)
- [Host] Kling 3.0: the image anchors identity, layout and text. Describe subtle movement, camera motion or environmental change, not the image contents. — [fal blog](https://blog.fal.ai/kling-3-0-prompting-guide/); [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Official] Sora 2: `input_reference` anchors the first frame (character, wardrobe, set, aesthetic), and the text describes what happens next. The image must match the target size. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)
- [Community] LTX-2.5: don't re-caption the source image. Re-describing pushes the model to regenerate it, causing identity drift. Describe only what changes, give the motion an end state, and add "gentle" or "slow motion" to fluids, hair and smoke. The article attributes to Lightricks the advice to describe what happens because the model already knows what the scene looks like. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [Community] Seedance 2.0: skip re-describing what the image shows. Spend the words on movement and camera, and **state what should stay unchanged** (subject shape, setting). — [Magic Hour](https://magichour.ai/blog/how-to-use-seedance-20)
- [Community] Seedance: with a reference frame, keep the prompt shorter. Specify style, identity, camera intent and pacing. — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)
- [Community] Wan 2.2 image-to-video formula = motion + camera movement. — [ImagineArt](https://help.imagine.art/ai-models/video-models/wan-2.2)
- [Community] "Wan 3": with a first frame, describe only motion and camera. Re-describing the subject or lighting conflicted with the image. — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Official] Wan2.2 image-to-video accepts an **empty prompt** and can generate from the image alone. Prompt extension can write a prompt from the image (Qwen-VL). — [Wan2.2 GitHub](https://github.com/Wan-Video/Wan2.2)
- [Official] Gemini Omni: for image-to-video, use high-resolution images and detailed motion or camera description. "Make it move" gives weak results. Tell the model whether an image is a frame or a reference. — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)
- [Official] Veo 3.1 animates a source image with stronger prompt adherence. Google's guide doesn't say whether to restate the scene. — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Community] Veo 3.1: crop input images to the target aspect before the call. The first frame is respected strongly. — [DEV: Veo 3.1 developer guide](https://dev.to/akaranjkar08/veo-31-developer-guide-timestamp-prompting-multi-shot-video-and-full-api-june-2026-3l5i) (via search snippet)
- [Official] MiniMax H3 I2VA: tie the image to 0.00 s and Shot 1, start with the image's subject, style and composition, then move forward in time. — [H3 guide (HF)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Host] H3: the text encoder **never sees the images**, so the words must carry their appearance. — [Sogni](https://docs.sogni.ai/models/minimax-h3/)
- [Official] Kling O1: "Take [@Image1] as the start frame, [describe changes]". — [Kling O1 guide](https://kling.ai/quickstart/klingai-video-o1-user-guide)
- [Host] Runway: a requested action that needs things missing from the frame (a full-body move from a head-and-shoulders board) gets dropped or degraded. Use a wider board or ask only for motion the frame can show. — [Runware](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)

### Inferences
- Default image-to-video template for beatsheet (all models except H3): `[camera move + pace]. [subject action with beats and end state]. [environment motion]. [what stays still]. [audio lines].` Skip appearance, wardrobe and setting unless a reference needs disambiguating.
- For H3, describe the board briefly at 0.00 (style, subject, composition) and then the motion, because the encoder is blind to pixels.
- Boards should be framed for the motion asked of them (full body for full-body action), cropped to the output aspect ratio before upload.

### Gaps
- Google publishes no explicit rule for Veo image-to-video on restating vs. motion-only.
- No controlled A/B study was found. The "near-static loop" and "identity drift" effects are host and community observations.

---

## 4. How end frames and reference images are referred to in the prompt

### Takeaway
Syntax differs a lot by model, and the agent must switch per model. **Seedance: `@image1`/`@video1`/`@audio1`. Kling O1: `[@Image1]`, `@Element`, `[@Video]`. Kling 3.0 elements: `@Element1`. Gemini Omni: `<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>`, `<VIDEO_REF_0>` (0-indexed). MiniMax H3: `<Picture 1>`/`<Video 1>`/`<Audio 1>` (1-based). Veo 3.1: refer to references by role in plain words. Image models: "Image 1", "Image 2" plus a role.** Everywhere, the advice is the same: **state each input's job**, because an uploaded file with no role assigned is often ignored.

### Cited Findings
**Gemini Omni Flash**
- [Official] Tags bind media to roles: `<FIRST_FRAME>`, `<LAST_FRAME>` (needs a first frame), `<IMAGE_REF_N>`, `<VIDEO_REF_N>`, with indexing from 0. In complex cases, open with `[# Sources ...]` or `[# References ...]` blocks that map tags to uploaded files, then end with an instruction saying how each input is used. A **source** is edited or extended, while a **reference** supplies a character, object or style. The same image as first and last frame makes a loop. Video references work best for likeness (up to 3 clips of ≤3 s, audio ignored). Don't reference several videos in one prompt. — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)

**Veo 3.1**
- [Official] First + last frame: describe the transition (for example, an arc around the subject ending on a POV from behind). Ingredients/references: refer to them by role ("using the provided images for the detective, the woman, and the office"), and reuse the same set across prompts for consistency. — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Official, via search snippet] `referenceImages`: up to 3 asset images or 1 style image, and the duration must be 8 s when used. `lastFrame` is supported on `veo-3.1-generate-001` (GA) and the preview models. — [Vertex Veo API reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Community] Veo treats the last frame as a guide rather than a hard constraint. — [DEV](https://dev.to/akaranjkar08/veo-31-developer-guide-timestamp-prompting-multi-shot-video-and-full-api-june-2026-3l5i) (via search snippet)

**Kling**
- [Official] Kling O1 tokens: `@Image`, `@Image1`, `[@Image 1]`, `@Video`, `@Element` (casing and spacing vary on the page). Start+end: "Take [@Image1] as the start frame, take [@Image2] as the end frame, [describe changes]". An end frame alone isn't supported. Camera from video: "Take [@Image] as the start frame. Generate a new video following the camera movement of the [@Video]". Motion transfer: "Animate the character in [@Image 1] with the same motion as the character in the [@Video]". Limits: up to 7 images/elements without a video and 4 with one. An element is up to 4 angle images. 3–10 s. — [Kling O1 user guide](https://kling.ai/quickstart/klingai-video-o1-user-guide)
- [Host] Kling 3.0: elements are a `frontal_image_url` plus optional `reference_image_urls` or `video_url`, referenced as **@Element1, @Element2**. They stay consistent across shots, including 3+ characters without blending. `end_image_url` animates toward a target final frame (for transitions, loops, and steering a camera to an endpoint). Elements raise the per-second cost. — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Host] Kling 2.5 Turbo Pro image-to-video on fal has an optional "Tail Image Url" (end frame). — [fal model page](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video)
- [Community] Match color, lighting and style between start and end frames. Identical frames give a loop. Keep frame-to-frame prompts short. — [Atlabs](https://www.atlabs.ai/blog/kling-3-0-prompting-guide-master-ai-video-generation) (via search snippet)

**Seedance 2.0**
- [Community] Use `@image1`, `@video1`, `@audio1` (type @ in the box). Always state each file's purpose (appearance, camera movement, background music), for example "@image1 as the first frame" or "@video1 for camera movement reference". Limits: 9 images, 3 videos (2–15 s total), 3 audio files (≤15 s), 12 files max. — [RunDiffusion](https://www.rundiffusion.com/seedance-2-0-prompt-guide)
- [Community, Luma learning center] Uploading isn't enough. Vague wording like "use the uploaded image" gives weaker results than naming each file and its use. — [Luma: How to prompt Seedance 2.0](https://lumalabs.ai/learning-center/articles/how-to-prompt-seedance-2.0) (via search snippet)
- [Community] Use the label the host actually creates, or the reference may be ignored. A reference image (guides the scene) differs from a first frame (sets the opening image). — [Magic Hour](https://magichour.ai/blog/how-to-use-seedance-20)
- [Community] Let each input do one job: images lock identity, video locks motion, text locks style. — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)

**MiniMax H3**
- [Host] Use 1-based per-type labels: `<Picture N>`, `<Video N>`, `<Audio N>`. Give each one a job (identity, wardrobe, environment, camera, voice) and **say which wins when two conflict**. References are loose guidance, not locked frames. A reference video's own soundtrack takes the next `<Audio N>` number. Keyframes are numbered in time order after the job's own pictures. The alignment line lists each picture at its timestamp, and the shot where a keyframe lands says it corresponds to that picture and describes it. — [Sogni](https://docs.sogni.ai/models/minimax-h3/)
- [Official] FL2VA: map the first image to 0.00 and the last to the end time, then describe the **motion path between them**, not two static descriptions, in a single shot unless asked otherwise. L2VA (last frame only): the image belongs to the final shot, so invent a plausible earlier state that converges on it. — [H3 guide (HF)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Host] Refer to each Omni Reference image by its index to lock a character, product or style. — [Runware: MiniMax H3](https://runware.ai/docs/models/minimax-h3/guides)

**Hailuo 2.3**
- [Official] The documented I2V page has only `first_frame_image`, with no last-frame parameter on that page. — [MiniMax API](https://platform.minimax.io/docs/api-reference/video-generation-i2v)

**LTX-2.5**
- [Community] With first + last frame, describe the journey between them, not the endpoints. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)

**Runway Aleph**
- [Community] Describe the change, not the final state, because you're modifying an existing clip. — [Cliprise](https://www.cliprise.app/learn/guides/model-guides/runway-aleph-complete-guide) (via search snippet)

**Luma Ray3.2**
- [Official, via search snippet] Modify accepts up to 64 keyframes at arbitrary source-frame indexes (versus start/end in Ray3.14). You can use a prompt alone, keyframes alone, or both. — [Luma learning center: Ray3.2 intro](https://lumalabs.ai/learning-center/articles/ray-3-2-introduction-and-core-concepts); conflicts with launch post's "up to 16 keyframes" — [Luma news](https://lumalabs.ai/news/introducing-ray-3-2)

**Wan**
- [Community] "Wan 3" has `reference_images` and `last_frame` parameters. The article shows no in-prompt token syntax. — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)

**Board image models**
- [Official] Nano Banana Pro: up to 14 reference images (6 at high fidelity). Refer to them as "Image 1" etc. with a role (identity, style, layout, subject). Identity locking means telling it to keep the face and attire of a named image, then describing only the change in pose, angle or expression. With groups, each character appears once. — [Google AI (dev.to)](https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n)
- [Official] GPT Image: label inputs by index and description ("Image 1: product photo") and say how they interact. For compositing, say exactly which element goes where. Lock face, features, pose and proportions, and allow changes only to the target. Restate key traits in each new prompt for consistency. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Official] FLUX.2: no special token. Describe each input's role in plain language (subject from one, style from another). [pro] takes up to 8 references at 1 MP output and 7 at 2 MP. [flex] takes about 10 and [dev] about 6. — [BFL](https://docs.bfl.ai/guides/prompting_guide_flux2)
- [Host] Seedream 4.5: multiple references blend styles and characters with high subject fidelity. The "image 1" syntax is unconfirmed. — [Hedra](https://www.hedra.com/models/image/bytedance/seedream-45) (via search snippet)

### Inferences
- beatsheet should keep a **per-model reference-token adapter**: the agent writes roles once ("board = first frame; Mia = identity ref; end = last frame") and the adapter renders `@image1 as the first frame` (Seedance), `[@Image1]` (Kling O1), `@Element1` (Kling 3), `<FIRST_FRAME>`/`<IMAGE_REF_0>` (Omni), `<Picture 1>` (H3), or plain role sentences (Veo, Runway, image models).
- For end frames, every source agrees on describing the **path/transition**, not two still descriptions, and on matching the light and color of both frames.
- H3 and Omni both separate "frame" from "reference" explicitly. Other models blur the two, so the agent should say which role a picture has.

### Gaps
- Seedance's exact first/last frame phrasing in its official guide isn't confirmed. It probably also depends on the host UI's label names.
- How fal exposes Kling O1 tokens versus Kling's own UI wasn't confirmed. Third-party sources disagree (`@Image1` vs `@image_1`) — [Kling O1 Prompt Guide (third-party)](https://41-klingo1.pages.dev/guide) (via search snippet).
- I found no reference syntax for Runway Gen-4.5 image-to-video beyond one image plus prose.

---

## 5. Prompting sound: dialogue, tone, ambience, music, and stopping unwanted music or subtitles

### Takeaway
Spoken lines go **in double quotes with an attributed speaker** on every audio-native model (Veo, Omni, Sora, Kling 3, Seedance, LTX, Wan). Add a **tone/voice descriptor**, and keep lines short (~2.5 words/s). Veo wants audio in **separate sentences with labels** ("SFX:", "Ambient noise:"). H3 has dedicated `overall_soundscape` and `non_diegetic_music` fields (set music to `N/A`). To avoid unwanted music, say what the soundtrack *is* ("room tone and footsteps only"). Omni and fal-Seedance accept "no music"/"no dialogue", but some community sources say negation backfires on Seedance. Burned-in subtitles reportedly come from unstructured dialogue prose (Seedance, community).

### Cited Findings
**Veo / Omni**
- [Official] Dialogue goes in quotes with attribution (a woman says "…"). Sound effects take an "SFX:" label and ambience an "Ambient noise:" label. The guide's timestamp example puts a score cue under SFX. — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Official] Say clearly whether you want audio, and put audio descriptions in **separate sentences** from visuals. Dialogue can carry tone or accent. — [Vertex Veo prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide)
- [Official] Omni generates audio by default. Describe music style, ambience and background radio. To remove sound, use phrasing like "no dialogue" or "no extra sound effects". New dialogue works only when extending generated videos, not uploaded ones. There's no voice editing or audio reference. English is fully supported. Quote exact on-screen text, which Omni renders readably. — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)

**Sora 2 (historical)**
- [Official] Put dialogue in a separate block below the prose. Label speakers consistently and alternate turns. A 4 s clip fits 1–2 short exchanges and 8 s a few more. Long speeches sync poorly. For silent shots, one sound cue can set rhythm. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)

**Kling 3.0**
- [Host] Use **unique speaker labels** ("Black-suited Agent", not "Man" or pronouns). Put the action before the line so the model knows who acts. Give each character a specific tone ("raspy, deep voice"). Use linking words like "Immediately" at speaker switches, or speech may merge. Quote the lines. Describe ambience and music on separate lines. — [fal blog](https://blog.fal.ai/kling-3-0-prompting-guide/)
- [Host] `generate_audio` is on by default (SFX, dialogue, lip sync). Turning it off cuts cost by about a third, which is useful if you'll score it yourself. — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Official] Kling O1's guide doesn't mention audio. — [Kling O1 guide](https://kling.ai/quickstart/klingai-video-o1-user-guide); a community doc says O1 has no native audio — [Pletor](https://docs.pletor.ai/ai-model-library/video-models/kling-o3-o1) (via search snippet)

**Seedance 2.x**
- [Host] Use double quotes for voiced and lip-synced lines. Keep lines short, splitting long speech across cuts. Add a tone note (dry, tired, proud). Name the sounds in the mix (room tone, footsteps, wind). **Say "no music" or "no voiceover" explicitly**, or you may get unwanted scoring. For captions, describe a voiceover and ask for text along the bottom timed to it. For titles, give the wording, position and style. — [fal: Seedance 2.0](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)
- [Community] Seedance doesn't support negative prompts, and "no X" can produce X. Phrase the desired state positively ("silent room tone", "dialogue only"). — [BigMotion](https://www.bigmotion.ai/user-guide/seedance-2-0-tips-troubleshooting) (via search snippet); this **conflicts** with fal's advice above
- [Community] Writing dialogue as plain prose is why clips come back with the words **burned in as on-screen subtitles**. Use a labeled format, with music marked in parentheses. — [ofox.ai](https://ofox.ai/blog/how-to-use-seedance-2-0-prompt-guide-fixes-free-access-2026/) (via search snippet)
- [Community] State the mix intent (for example "music leads, ambient secondary, no dialogue"), or the layers compete at equal volume and dialogue loses clarity. — [cutout.pro](https://www.cutout.pro/learn/blog-seedance-2-0-audio-guide/) (via search snippet)
- [Community] Overlapping music or chatter causes jittery mouth movement. For a clean lip-sync test, use a 5 s medium close-up with a locked camera, one speaker, a dry voice, and no music or subtitles. — [Crepal](https://crepal.ai/blog/aivideo/blog-seedance-2-0-lip-sync-voiceover-fix/); [seedance.tv (2.5)](https://www.seedance.tv/blog/seedance-2-5-lip-sync-issues) (via search snippets)
- [Community] Seedance audio works best when described explicitly (room tone plus one sharp tap). Audio references can be given a role (rhythm, mood). — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)

**MiniMax H3**
- [Official] Give speakers stable IDs (S1), or compound IDs (S1,S2) for unison. On first appearance, establish identity (age, gender, voice quality, pitch, pace, accent). Keep identity and action **outside** the dialogue tag, and inside it only the language tag and the exact words, untranslated. For voiceover, say it's an off-screen voiceover and that the on-screen character's lips stay closed. When a line crosses a cut, mark both sides and say the audio continues. `overall_soundscape`: 1–4 sentences of ambience, action sounds and non-verbal sounds, never repeating dialogue (N/A only for total silence). `non_diegetic_music`: 1–3 sentences on instruments, tempo and dynamics, with no abstract mood words, and **N/A when there's no score**. Music characters can hear belongs in the description. Include on-screen text only when it's actually visible, in quotes and verbatim. — [H3 guide (HF)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Host] Dialogue tag format: `<d>[Language] words</d>`. Audio is generated with the video (32 kHz stereo, 24 fps). — [Sogni](https://docs.sogni.ai/models/minimax-h3/)

**Hailuo 2.3**
- [Official] The I2V API page documents no audio parameters. — [MiniMax API](https://platform.minimax.io/docs/api-reference/video-generation-i2v)

**LTX-2.x**
- [Official] The README example writes sounds and quoted speech, with the voice and tone, inline in the same paragraph. — [LTX-2 README](https://github.com/Lightricks/LTX-2)
- [Official, via search snippet] LTX-2.3's text connector reads acting direction phrase by phrase, so **split dialogue into short phrases plus cues** rather than full quoted sentences. LTX-2 prompts work unchanged on 2.3. — [LTX blog: Directing dialogue and acting](https://ltx.io/blog/directing-dialogue-and-acting)
- [Community] Quote the dialogue and name the language. Budget **~2.5 words/s** with a short silence at each end (10 s ≈ 25 words). Ambience without speech is the most reliable default. Name close, concrete, visible sound sources. Add music only when needed, by genre and tempo. In audio-to-video, quote supplied dialogue exactly and keep the camera still. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [Community] Users report trouble with LTX-2.3 dialogue. — [HF forum](https://discuss.huggingface.co/t/ltx-2-3-problem-with-dialogs/176649) (via search snippet)

**Wan**
- [Official, via search snippet] Wan 2.6: if no `audio_url` is given, the model **automatically generates background music or SFX** to match the video. — [Alibaba Model Studio T2V API](https://alibabacloud.com/help/en/model-studio/text-to-video-api-reference)
- [Community] "Wan 3": put the line in quotes with emotion, tone, speed and accent. Budget about 2.5 s of speech per 5 s clip, which fits two short sentences, while a paragraph gets rushed or truncated. The audio mix runs hot (near 0 dBFS). — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)

**Runway / Luma**
- [Community] Aleph doesn't add or modify audio. — [Cliprise](https://www.cliprise.app/learn/guides/model-guides/runway-aleph-complete-guide) (via search snippet)
- [Community] Ray3.2 has no audio for text- or image-to-video. Audio is kept in Modify and Reframe. — [OrcaRouter](https://www.orcarouter.ai/de/blog/odyssey-3-vs-luma-ray-3-2) (via search snippet)
- [Community] Runway Gen-4: instead of "no talking", write a positive statement like the character staying silent. — [Runway community moderator (Reddit mirror)](https://redlib.hbubli.cc/user/Runway_Helper) (via search snippet)

### Inferences
- A cross-model audio template: `Dialogue: <Speaker label, voice/tone>: "short line."` / `SFX: …` / `Ambience: …` / `Music: none — only diegetic sound` (or a positive "room tone only"). Render it per model: Veo labels, H3 fields, Kling speaker labels with "Immediately" between turns, LTX inline prose in phrases.
- For beatsheet, where music is usually the cut's own song and voice is often narrated separately, the default for clips should be **"diegetic sound only, no score, no on-screen text"**, written positively. Turn generated audio off when the model allows it (Kling `generate_audio: false`, Veo `generateAudio`) to avoid scoring and save cost. Narration should stay in beatsheet's own `voice`.
- Lines should be budgeted at ~2–2.5 words per second of clip.

### Gaps
- Veo's official guide doesn't explain how to stop unwanted music or burned-in subtitles.
- There's no official Seedance statement on negation for audio. The fal and BigMotion advice conflicts.
- No official Hailuo 2.3 audio guidance was found. H3 is MiniMax's audio-native model.

---

## 6. Negative prompts

### Takeaway
There's a split. **Parameter-based negatives exist on Veo (Vertex `negativePrompt`), Kling (default "blur, distortion, low quality") and Wan (2.2 local; 2.6 API ≤500 chars).** They are **not supported** on FLUX.2, LTX distilled (CFG 1), Gemini Omni (exclusions go in the prompt), MiniMax H3 (no field), Seedance (per community) or Runway (negation may backfire). Google's own advice is to describe exclusions as nouns, not "no/don't".

### Cited Findings
- [Official] Veo: describe what you want rather than what to exclude (for example, a desolate landscape with no buildings rather than "no man-made structures"). — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Official] Vertex: avoid "no" and "don't". List unwanted elements as descriptive terms. — [Vertex Veo prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide)
- [Official, via search snippet] Vertex has a `negativePrompt` string parameter (examples: bright overhead lighting, multiple cars). — [Vertex Veo API reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Official] Omni has no dedicated negative prompt. Write exclusions into the prompt ("do not show X"). — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)
- [Host] Kling: `negative_prompt` defaults to blur, distortion, low quality. Keep the default and add specific artifacts you see (warped faces, jittery camera). — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Community] Kling negatives list: motion blur, face distortion, warping, morphing, inconsistent physics, floating objects, unnatural movements, extra limbs, background shifting. — [Atlabs](https://www.atlabs.ai/blog/kling-3-0-prompting-guide-master-ai-video-generation) (via search snippet)
- [Community] Runway Gen-4 doesn't support negative prompts and may produce the opposite. Use "Locked camera" instead of "No camera movement". — [pxz.ai](https://pxz.ai/blog/runway-gen-4-prompts); [veo3gen](https://www.veo3gen.app/blog/runway-gen-4-says-negative-prompts-dont-work-how-to-rewrite-your-dont-lines-for-) (via search snippets)
- [Host] Runway Gen-4.5: state what holds still ("the subject holds still"), which locks that channel. — [Runware](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)
- [Host] H3 has no negative-prompt field, so put avoid-direction inside the structured prompt. — [Sogni](https://docs.sogni.ai/models/minimax-h3/); the official guide has no negative section — [H3 guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Community] LTX-2.5 distilled has no negative prompt (CFG 1), so negatives are ignored. State the positive end state instead. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [Community] Wan 2.2 follows negative prompts better than 2.1. Keep a long default negative for realism and shorten it for stylized work. — [aistudynow](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/)
- [Community] Wan 2.6 `negative_prompt` is limited to 500 characters. — [EvoLink](https://evolink.ai/blog/wan-2-6-api-guide) (via search snippet)
- [Official] FLUX.2 doesn't support negative prompts. Describe the positive ("sharp focus" rather than "no blur"). — [BFL](https://docs.bfl.ai/guides/prompting_guide_flux2)
- [Official] GPT Image: put exclusions and invariants in the prompt ("no watermarks, no extra text, no logos"), and add "no new elements" for unwanted additions. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Community] Seedance has no negative prompts, and "no blur" can produce blur. — [BigMotion](https://www.bigmotion.ai/user-guide/seedance-2-0-tips-troubleshooting) (via search snippet); though fal recommends "no music" for audio — [fal](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)

### Inferences
- Default policy for the agent: **write exclusions as positive states in the prompt** ("locked-off camera", "the hands stay still", "empty street"). Use a negative-prompt field only where the model has one (Veo Vertex, Kling, Wan), filled with artifact nouns (morphing, warping, extra limbs, flicker, text, watermark, subtitles). Don't use "no/don't" in the main prompt, except on Omni and GPT Image, whose official docs allow it.

### Gaps
- The official default negative prompt for Wan 2.2 (the repo's sampling config) wasn't confirmed. The README fetched doesn't describe it.
- Runway's official position on negation couldn't be read first-hand (403).

---

## 7. Multi-shot and timed prompts within one clip

### Takeaway
Timed or labeled shots are now first-class on several models. **Veo/Omni use `[00:00-00:02]` / `[0-3s]` timecodes. Kling 3.0 uses labeled shots with durations (up to 6 shots, 15 s, `multi_prompt` on fal). H3 uses `[Shot N]` blocks with `mm:ss.mmm` cut times. Wan 2.6 has `shot_type: "multi"`. Seedance uses "cut to" or labeled shots.** **LTX-2.5 ignores shot lists** and needs cuts described in prose. Conversely, **Omni and "Wan 3" may cut on their own** unless told it's one continuous shot.

### Cited Findings
- [Official] Veo 3.1 timestamp prompting: `[00:00-00:02] …`, `[00:02-00:04] …` blocks, each with shot type, action, SFX and emotion. — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Official] Omni: use timecodes like `[0-3s]`, `[3-6s]` or natural language ("after 3 seconds") for cuts, rhythmic sequences and timed text overlays. **For a single continuous clip, say it's one unbroken shot with no cuts**, or several shots may be added. In extensions, timestamps count from the new section. — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)
- [Official] Sora: several shots per prompt are valid, each with one camera setup, one action and one lighting recipe. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)
- [Host] Kling 3.0: up to 6 shots and 15 s per generation. Label each shot with framing, subject and motion. Examples give per-shot durations as "(Duration: 5 seconds)". — [fal blog](https://blog.fal.ai/kling-3-0-prompting-guide/)
- [Host] Kling 3.0 via fal's `multi_prompt`: each shot has its own prompt and duration (1–15 s), and the total is the sum. — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Host] Kling 3.0 Turbo numbered format: "shot 1, 3s, …; shot 2, 2s, …". — [Morphic](https://morphic.com/resources/how-to/kling-3-0-turbo-guide) (via search snippet)
- [Community] Kling 3.0: one primary action per shot. — [VEED](https://www.veed.io/learn/kling-3-0-prompts) (via search snippet)
- [Official] H3: Shot 1 has no timestamp. Later shots start with a cut time in `mm:ss.mmm`, strictly increasing. Use plain cuts, keeping dissolves, fades and wipes for explicit requests. **Each cut must add new information**, so if only distance or angle changes, use camera motion instead. FL2VA stays a single shot unless asked. — [H3 guide (HF)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Host] H3: if a keyframe changes framing or lighting, write a hard cut at that time, because two differing keyframes inside one continuous shot tend to cross-fade. — [Sogni](https://docs.sogni.ai/models/minimax-h3/)
- [Official, via search snippet] Wan 2.6: only `wan2.6-t2v` supports multi-shot. Enable it with `prompt_extend: true` and `shot_type: "multi"`. The subject stays consistent across shot changes. — [Alibaba Model Studio T2V API](https://alibabacloud.com/help/en/model-studio/text-to-video-api-reference)
- [Community] Wan 2.6: write it like a shot list, keep the subject description consistent, and specify transitions only when needed. — [EvoLink](https://evolink.ai/blog/wan-2-6-api-guide) (via search snippet)
- [Community] "Wan 3": write an "Overall" description, then numbered shots with time ranges. Put the character description in the shared prefix, not in each shot. **A four-word prompt was auto-cut into five shots in five seconds.** — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Host] Seedance: write cuts with "cut to" or "then the camera moves to". Listing shots in order is more reliable than letting the model invent the sequence. — [fal: Seedance](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)
- [Community] Seedance: label each shot, with one main action and one camera instruction per shot. Arrow-separated beats work for movement within a shot. — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)
- [Community] Seedance 2.5: the phrase "lens switch" triggers multi-shot. — [Renderforest](https://www.renderforest.com/blog/how-to-use-seedance-2-5) (unverified)
- [Community] LTX-2.5 has no multi-shot parameter, and **shot lists, numbered beats and sluglines are ignored**. Write one chronological paragraph and, at each cut, name the transition, re-establish scale, angle, who's in frame and lighting, reuse a visual tag for returning characters, and say what the sound does. Use 2–4 shots with ~3 s each (faster cuts look like a slideshow). Stay single-shot for lip-sync. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)

### Inferences
- For beatsheet, where the editor makes the cuts, the agent should usually ask for **one continuous shot** and say so explicitly ("one continuous shot, no cuts") on models that cut on their own (Omni, Wan 3/2.6 with prompt extension, Seedance). Use in-clip multi-shot only when the person wants a sequence from one generation (dialogue coverage, a montage beat).
- Timed beats (`[0-2s]`) are useful even inside one shot on Veo and Omni to place actions on the music.

### Gaps
- There's no official Seedance cut syntax beyond host and community phrasing.
- The exact `multi_prompt` JSON schema on fal for Kling 3.0 isn't shown on the page.

---

## 8. Common failures and the prompt fixes that work

### Takeaway
The recurring failures and fixes are:
- **Frozen or near-static clips:** the prompt re-describes the board or has no action verb. Fix it by describing motion with an end state and naming a camera move.
- **Face/identity drift:** re-captioning the image, too many people, or long clips. Fix it by describing only the change, using ≤2 people, locking identity with references, and keeping clips shorter.
- **Morphing/warping:** add Kling or Wan negatives and simplify the motion.
- **Camera ignored or drifting:** stacked moves, or no hold instruction. Fix it with one move, a pace word and an explicit "locked-off".
- **Merged dialogue:** use unique speaker labels and switch cues.
- **Generic look:** be specific about subjects and use cinematography words, not quality buzzwords.

### Cited Findings
- [Official] Sora: if a shot keeps failing, simplify by freezing the camera, reducing the action and clearing the background, then add complexity back. Small phrasing changes shift identity, so reuse the same character phrasing across shots and avoid conflicting traits. Iterate one change at a time. Higher resolution reduces softness and artifacts. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)
- [Official] Veo: generic output means you should be more specific. Events that take a long time don't fit short clips, so use subtler changes. — [Vertex Veo prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide)
- [Host] Runway: static or looping output means the prompt re-describes the scene, so remove those sentences. For unwanted subject motion, lock it ("holds still"). Motion that needs things missing from the frame gets dropped. Physically implausible motion fails. — [Runware](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)
- [Host] Kling: a static shot needs motion verbs and a camera move. Add specific artifacts to the negative prompt. For drift over long clips, shorten or split. For motion control, the reference character should fill >5% of the frame with little occlusion. — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Host] Kling dialogue: an unclear speaker needs unique labels. Merged speech needs a switch cue. The wrong actor speaking means the action must be bound before the line. Flat delivery needs tone descriptors. — [fal blog](https://blog.fal.ai/kling-3-0-prompting-guide/)
- [Community] LTX-2.5: naming an emotion makes the face go neutral, so describe a physical cue. Opening with a noun phrase gives a near-static clip, so open with the action. Re-captioning the source causes identity drift. More than 2 people merges faces. No end state means drift or looping. Long on-screen text gets misspelled. "8K, masterpiece" does nothing. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [Community] Wan 2.2: an ignored camera move means shortening the clip or separating combined moves. Timing goes mushy past ~5 s. Multi-subject choreography needs explicit line-by-line prompting. Whip-pan transitions stay soft. — [aistudynow](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/)
- [Community] Wan 2.2: describing foreground versus background motion ("X moves; Y stays still") creates parallax and avoids uniform motion. — [aistudynow](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/)
- [Community] "Wan 3": the face is missing unless the prompt names it, and default prompt extension adds details you didn't write. — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Host] H3: if a Balanced render drifts, warps or loses its subject, try `shift` 12 with the same seed. — [Sogni](https://docs.sogni.ai/models/minimax-h3/)
- [Official] H3 implicit errors to avoid: timestamping Shot 1, non-increasing cut times, multi-shot FL2VA without being asked, describing FL2VA images as static stills, putting the L2VA image in Shot 1, translating dialogue, mood words in the music field, omitting closed lips on voiceover, and stacking camera labels at sentence ends. — [H3 guide (HF)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [Community] Seedance: common failures are too many style adjectives, unclear reference roles and low-quality source clips. Fix them with short tests, fewer and cleaner references, and debugging one element at a time. — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)
- [Community] Seedance: a reference is ignored when the prompt doesn't use the host's actual label. A policy block on real faces needs changed inputs, not a resubmit. — [Magic Hour](https://magichour.ai/blog/how-to-use-seedance-20)
- [Community] Seedance 2.0 blocks realistic identifiable faces. Restyle the subject as stylized, or use another model (Seedance 1.5 Pro, Kling, Veo) for people. — [RunDiffusion](https://www.rundiffusion.com/seedance-2-0-prompt-guide); [Luma learning center](https://lumalabs.ai/learning-center/articles/how-to-prompt-seedance-2.0) (via search snippet)
- [Host] Seedance: describe contact points and consequences (leaves scatter on impact, a mug tips) so physics resolves. — [fal: Seedance](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)
- [Community] Aleph: often only a couple of seconds are usable before it "gets weird". In one test, Aleph didn't follow the prompt. — [DataCamp](https://www.datacamp.com/ko/tutorial/runway-aleph) (via search snippet)
- [Official] Omni edits: keep edit prompts simple, because overly detailed edits cause unintended changes. Add "keep everything else the same". — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)
- [Official] GPT Image edit drift: repeat the preserve list each iteration and add "do not change" constraints. A pasted-on look in composites needs matching light, shadows, perspective and scale. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Official] Nano Banana Pro: when an image is mostly right, edit it rather than re-rolling. Avoid keyword lists. — [Google AI (dev.to)](https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n)

### Inferences
- Failure → fix table for the agent:
  - **Frozen subject:** lead with the action verb, give it an end state, remove restated scene text, add a camera move.
  - **Morphing or extra limbs:** simplify to one action, shorten the clip, add negatives (Kling/Wan), use a wider board that shows the limbs.
  - **Face changes:** describe only the change, keep ≤2 people, add an identity reference (element / @image / Image 1), keep 3–6 s, and on Kling raise cfg slightly.
  - **Camera drift:** name one move with a pace word, or "locked-off camera" and "the subject stays centered".
  - **Unwanted cuts:** "one continuous shot".
  - **Unwanted music or subtitles:** describe the exact soundtrack positively, turn audio off where possible, and keep dialogue in quotes with speaker labels.

### Gaps
- No official source quantifies how often extra limbs or morphing happen. The fixes come from host and community reports.
- Ray3.2 and Hailuo 2.3 failure guidance wasn't found.

---

## 9. Length guidance: what happens when the action is too much for the clip

### Takeaway
Over-stuffed prompts get **rushed, truncated, ignored or auto-cut** into a montage. The safe budgets are **one main action (and one camera move) per shot, ~3 s or more per shot, and ~2–2.5 spoken words per second**. Shorter clips (3–6 s) hold consistency better, and several short generations edited together beat one long one.

### Cited Findings
- [Official] Sora follows instructions more reliably in shorter clips, and two 4 s clips stitched may beat one 8 s clip. Too much dialogue or action for the length means shortening or splitting. Durations: 4/8/12/16/20 s. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)
- [Official] Veo: keep clip length in mind for long events, and use subtler changes in short clips. Veo 3.x durations are 4/6/8 s (default 8). — [Vertex Veo prompt guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide); [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
- [Official] Omni extends generated videos ~10 s per turn up to 40 s total. Extensions of uploaded videos run 3–10 s. — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)
- [Host] Kling 3.0: 3–15 s per call. 3–6 s clips hold motion consistency better, and longer clips drift more. — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Official] Kling O1: 3–10 s. — [Kling O1 guide](https://kling.ai/quickstart/klingai-video-o1-user-guide)
- [Community] Seedance: 4–15 s (or auto). Start at 5 s. — [Magic Hour](https://magichour.ai/blog/how-to-use-seedance-20); [fal](https://fal.ai/learn/tools/seedance-2-0-prompting-guide)
- [Official] Hailuo 2.3: 6 or 10 s at 768P, and 6 s only at 1080P. — [MiniMax API](https://platform.minimax.io/docs/api-reference/video-generation-i2v)
- [Host] H3: 124–362 frames on a 124 + n×17 grid at 24 fps (~5.17–15.08 s), snapping to the nearest value (6 s → 141 frames). — [Sogni](https://docs.sogni.ai/models/minimax-h3/)
- [Host] Runway Gen-4.5: 5, 8 or 10 s (default 10). — [Runware](https://runware.ai/docs/models/runway-gen-4-5/guides/directing-motion)
- [Community] Aleph: process clips over 5 s in 5 s segments with identical prompts. — [Cliprise](https://www.cliprise.app/learn/guides/model-guides/runway-aleph-complete-guide) (via search snippet)
- [Official] Ray3.2: up to 20 s at 1080p. — [Luma news](https://lumalabs.ai/news/introducing-ray-3-2)
- [Community] Wan 2.2: ~5 s (≈120 frames at 24 fps). Past that, timing gets mushy and camera moves lose force. A 360° orbit in 5 s was ignored. — [aistudynow](https://aistudynow.com/how-to-write-better-wan-2-2-prompts-tested-in-comfyui/)
- [Community] "Wan 3": two short sentences of dialogue fit a 5 s clip, and a paragraph is rushed or truncated. A too-short prompt gets auto-cut into many shots. Durations 2–30 s. — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Community] LTX-2.5: ~2.5 words/s of speech. ~3 s per shot, because faster cuts look like a slideshow. 49–241 frames at 24 fps (~2–10 s). — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [Community] Seedance: avoid multiple actions in one shot. — [invideo](https://invideo.io/blog/seedance-2-0-prompt-guide/)

### Inferences
- Rule of thumb for the agent: **beats ≤ seconds ÷ 2** (a 6 s clip gets about 3 beats: start, main action, settle). Dialogue words ≤ 2.5 × seconds − 1. Use ≤1 camera move per shot and ≤1 primary action per shot. When the board's action needs more, split it into two generations and let beatsheet cut between them.

### Gaps
- No maker documents exactly what the model does with surplus action (drops it, compresses it, or cuts). The behavior described is community observation.

---

## 10. Settings worth changing (cfg, motion strength, "enhance prompt", optimizers)

### Takeaway
The prompt-rewriting switches matter most for an agent that writes careful prompts: **MiniMax `prompt_optimizer` (default on), Wan `prompt_extend` (default on in the API), Veo `enhancePrompt`, LTX `enhance_prompt`, FLUX `prompt_upsampling`.** Turn them **off** when the agent writes detailed prompts, so its wording (camera tokens, dialogue) isn't rewritten. Leave them on for very short prompts. Kling's `cfg_scale` (default 0.5) and H3's `shift` are the main fidelity knobs.

### Cited Findings
- [Official] MiniMax `prompt_optimizer` defaults to true. Set it to false for more precise control. `fast_pretreatment` shortens optimization time (Hailuo 2.3/02 only). — [MiniMax API](https://platform.minimax.io/docs/api-reference/video-generation-i2v)
- [Community] The optimizer may rewrite or drop bracketed camera commands (suspected, untested). — [minimax-ai.chat](https://minimax-ai.chat/models/minimax-hailuo-23) (via search snippet)
- [Community] "Wan 3" `prompt_extend` defaults on and rewrites the prompt. Keep it on for prompts under ~20 words and turn it off for detailed ones (over ~60 words). Seeds are less reproducible when the prompt is rewritten. Renders take ~4–5 min, so long timeouts are needed. — [Segmind](https://blog.segmind.com/wan-3-prompt-guide-alibabas-official-formulas-tested/)
- [Official, via search snippet] Wan 2.6 multi-shot **requires** `prompt_extend: true` with `shot_type: "multi"`. — [Alibaba Model Studio T2V API](https://alibabacloud.com/help/en/model-studio/text-to-video-api-reference)
- [Official] Wan2.2 local prompt extension uses Qwen through Dashscope or a local model. It's recommended for richer detail. — [Wan2.2 GitHub](https://github.com/Wan-Video/Wan2.2)
- [Official, via search snippet] Veo `enhancePrompt`: the English Vertex reference marks it "Veo 2 models only", while the Chinese and German pages and Vercel's gateway say it defaults to true and uses Gemini to enhance prompts, so the sources **conflict**. `generateAudio` is a parameter. — [Vertex Veo API reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation); [Vercel AI Gateway: veo-3.1-generate-001](https://vercel.com/ai-gateway/models/veo-3.1-generate-001/api)
- [Official] Omni: set `task` in `video_config` only when prompting alone fails, because it adds constraints. Resolution can be 360p, 720p (default), 1080p or 4K, with the last two upscaled. Synchronous mode (`background`/`store`/`stream` false) disables later editing. — [Gemini API: Omni](https://ai.google.dev/gemini-api/docs/omni)
- [Host] Kling `cfg_scale` defaults to 0.5. Use ~0.3 for more freedom and ~0.7 to follow the prompt more tightly, raising it only for very specific spatial requirements. Keep the default negative prompt. `generate_audio: false` saves ~1/3. — [fal: Kling 3.0 Pro](https://fal.ai/learn/tools/how-to-use-kling-3-0-pro)
- [Official] LTX pipelines support `enhance_prompt`. — [LTX-2 README](https://github.com/Lightricks/LTX-2)
- [Community] On deAPI, LTX `enhance_prompt` is an optional boost fee. There's no negative prompt (CFG 1). Test at 768×768 first. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [Host] H3 Balanced mode: `shift` 12 (same seed) spends more steps on layout and motion when renders drift or warp. — [Sogni](https://docs.sogni.ai/models/minimax-h3/)
- [Community] Ray3.2 Modify has motion and structure controls on a 1–9 scale, from a mild restyle to a radical change. — [YesPress](https://yespress.io/luma-ai) (via search snippet)
- [Host] Ray3.2 video edit: iterate at 540p and render finals at 720p/1080p. — [WaveSpeed](https://wavespeed.ai/docs/docs-api/luma/luma-ray-3.2-video-edit) (via search snippet)
- [Official] FLUX.2: `prompt_upsampling` expands short prompts. `guidance` on [flex] runs 1.5–10 (e.g. 4.5) and `steps` up to 50. Keep to 2 MP or less for most uses. — [BFL](https://docs.bfl.ai/guides/prompting_guide_flux2)
- [Official] GPT Image: `quality` low is often enough on gpt-image-2. Use medium or high for small text, close-up portraits and identity-sensitive edits. `input_fidelity` (low/high) helps likeness on gpt-image-1.5/1 but is described as disabled on gpt-image-2, though examples conflict. Sizes need a max edge under 3840 px and multiples of 16, and anything above 2560×1440 is experimental. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Official] Nano Banana Pro: 1K–4K native output. Request 2K/4K explicitly and state the aspect ratio. Thinking is on by default. — [Google AI (dev.to)](https://dev.to/googleai/nano-banana-pro-prompting-guide-strategies-1h9n)
- [Official] Sora (historical): API parameters were model, size, seconds and characters. Writing them in the prompt did nothing. — [OpenAI Cookbook](https://developers.openai.com/cookbook/examples/sora/sora2_prompting_guide)

### Inferences
- Defaults for beatsheet's agent:
  - Set `prompt_optimizer: false` (Hailuo) and `prompt_extend: false` (Wan, except Wan 2.6 multi-shot) whenever the agent writes a full prompt with camera or dialogue tokens.
  - Turn `enhance_prompt` off for LTX/Veo when the prompt is already 60+ words.
  - Leave Kling cfg at 0.5 and nudge it toward 0.7 for identity or spatial precision.
  - Set the generated-audio flag off when the cut uses its own song or voice.
  - Make roughs at low resolution and short duration, and finals at full.

### Gaps
- No official recommended cfg, motion-strength or guidance values were found for Veo, Seedance, Hailuo or Runway. Several don't expose them.
- Whether Veo 3.1 GA honors `enhancePrompt` couldn't be confirmed from the official page (the sources conflict).
