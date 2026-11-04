# What AI video tutorials teach, checked against other sources

How this was made (2026-11-02): six popular tutorials on making AI video, published in September and October 2026, were read through their transcripts, and what could be checked was compared with documentation and other written sources. The tutorials aren't named or linked here, because what matters is the craft and not who showed it. So a point taken from a tutorial has no citation, and a link means another source was checked. The prompts shown on screen weren't read, so exact wording comes only from what was spoken.

---

## How far to trust them

### Takeaway
All six earn money from a generation platform or reseller, through sponsorship, affiliate links or a product of their own, and most also gate templates or a community. Only one says "sponsored" aloud, and none carried YouTube's paid-promotion label. The workflow they share holds up. Their model rankings are opinions, usually from one prompt.

### Findings
- Seedance 2.5 is the hero video model in all six, across several platforms, so that pick is less likely to be sponsor-driven.
- Bias shows most in praise for platform-only features, in "this platform does it all" framing, and in prices given as credits, which can't be compared across platforms.
- Income claims and "perfect on the first try" claims weren't verified. The tutorials that left failed takes in taught the most.
- Model-level and prompt-level techniques repeated across tutorials with different sponsors deserve the most weight.

---

## Model picks, by kind of shot

These are the tutorials' opinions unless a link says otherwise.

- **Hero video model: Seedance 2.5.** It makes 4 to 30 s clips, takes up to 30 images, 10 videos and 10 audio references, has native dialogue with lip sync, and supports multi-shot timelines with per-block shot size and camera. — [ComfyUI blog](https://blog.comfy.org/p/seedance-25-is-now-available-via), [useapi.net](https://useapi.net/blog/260807)
- **Alternatives named:** Kling 4, MiniMax H3 Max and FLUX 3. The tutorials say the ranking will keep changing, and advise against locking into a single-model subscription.
- **One found-footage prompt with no references:** Seedance 2.5 at 1080p was best but expensive, its 480p draft came close, FLUX 3 gave roughly 80 to 90% of the result for much less, and H3 Max was much worse.
- **People and character sheets:** GPT Image 2.5 Sunburst or GPT Image 2, called the most photorealistic. Seedream 5.0 Pro is named as the cheap, good option.
- **Accurate products and props:** GPT Image 2.5 Sunburst or Flare, or Nano Banana 2.1.
- **Locations:** Nano Banana Pro or 2.1, or GPT Image 2.5, tested against each other. Put camera framing in the prompt (e.g. "three-quarter wide-angle view"); leaving it out gave a very different shot.
- **Look development:** Midjourney, with a reference frame as both style reference and image prompt. An LLM writes the prompt from the frame and carries over the camera body and lens.
- **Regrading a real location photo:** Nano Banana Pro, told to keep composition and geometry, match a reference grade and add 35mm grain.
- **Raw-photo realism stills:** Flux 2 Pro and Higgsfield Soul 2, with GPT Image 2.5 Flare as the all-rounder. FLUX 3 looked "plastic" for stills. Soul 2 and Flux 2 Pro failed to render a requested date stamp, and Flux 2 Pro ignored a specific hand gesture.
- **Look research:** ShotDeck frames, which come with camera body, lens, film stock, location and color data.
- **Voices, best first:** a real recorded performance, then ElevenLabs, then a voice made in a Seedance draft for an invented character.
- **Splitting takes:** Premiere's Scene Edit Detection cuts a generated clip at its internal cuts.

---

## Techniques

### Stills before video
- Stills are cheap and video is expensive, so iterate on the stills first. Trying a still across several image models teaches more than any ranking of them.
- Use reference-to-video rather than text-to-video, because it gives more control. The order is ideas, assets, video, edit.
- A character sheet is one horizontal image split into three equal vertical panels of the same person. Make a portrait first, then make the sheet with the portrait attached and tagged at the start of the prompt.
- Show the face only once: a close-up, a headless front full-body view and a back full-body view. That way the video model isn't offered several faces to choose from.
- Use a mid-gray background. White tends to overexpose when the sheet is used as a reference.

### Still prompts
- Write them in this order: camera (format, lens, angle, framing, motion blur), tone, subject with its action and place, lighting, then texture (physical material details).
- Style keywords change the whole look: skate-cam, intimate documentary, motion-blurred photo dump, low curbside, disposable camera with flash, concealed observation, phone snapshot, low-quality camcorder, iPhone selfie.
- Choose a low resolution on purpose for a camcorder look, because imperfection reads as real.
- Give an LLM a prompt and the image it produced, and ask for a reusable style file.
- Build ideas by adding contrast: a subject in its normal place, then an unexpected situation, then unexpected styling or attitude, then feeling.

### Video prompts
- Use these sections in order: goal, references (what each one is), scene (location, light), timed stages, visual style, audio (exact dialogue, SFX, music), and a closing line asking for consistency.
- Keep that structure in a reusable file so an LLM can write each prompt from it. Dictate the idea, then iterate with long lists of what to change.
- Number the references, give each a role, and match the upload order. Open each prompt block with a key to that order. When the order slips, characters swap roles.
- Repeat a fixed look block (camera body, lens, format) in every prompt. Continuity comes from using the same camera and lens across shots.
- Keep prompt blocks to 30 s at most, to fit Seedance 2.5's cap. Give each shot a start time to the second, a duration and its own block.
- Set the clip length to the last shot's end plus 2 s of padding.
- Write the script as on-set direction: where the camera is, where the characters are, how long each beat holds, and the ambient sound.
- Describe acting at the level of micro-expressions (brows, eyes, a lip quiver, shoulders dropping), and say how each line is delivered.
- Name the surface so the sound is right: a phone thrown onto grass thuds, it doesn't clack.
- Give each character a specific regional accent and repeat it in every prompt.
- Left and right positions swap between takes, so ask for them explicitly or reroll.
- Be fully literal. The model has no common sense.
- For feedback, watch a take muted while dictating timestamped notes to the LLM, then regenerate.
- For music, give an LLM the prompt's timecodes so it can write a music prompt whose hits land on the key moments.

### Camera behaviors that read as filmed by a person
Combine several in one prompt:
- handheld micro-shake that reacts to the action
- crash zoom
- voyeuristic framing
- whip pan to an event
- an operator walking backwards with uneven steps
- someone walking in front of the lens and blocking the frame
- exposure adjusting from inside to outside
- focus hunting

### Draft, then final
- Generate at 480p, expect two or three tries or more, then make the 1080p version of the take you like.
- Draft output can suit a realistic, found-footage look, so "realistic" shouldn't automatically mean the highest resolution.
- Complete a draft by its task ID. Downloading a draft and uploading it again is a new request, which keeps none of the settings and gives no guarantee of the same video.

### Long takes
- One 30 s generation with internal cuts keeps character positions and acting continuous across the cuts, while separate 6 s clips drift. This is a claim from experience and hasn't been tested directly.
- Keep only the best moments of each take and cut the dead pauses.
- A script that doesn't fit makes the take fall apart: a minute of dialogue in one 30 s prompt went haywire. Dialogue that speeds up is the sign of too many words for the duration.

### Voice
- Recording quality carries straight through. A phone recording gave a worse take and the voice drifted late in the clip, while a good mic held up.
- Attach the recorded lines as references, and after each line of dialogue tell the model to match that character's reference.
- Several tutorials wrap audio references as black-screen MP4s rather than MP3s (see the checked claims below).
- A short sample of one voice saying a few phrases in different emotions can voice an invented character. It failed for a real person: a sample of the presenter's own voice couldn't make convincing new lines. Synthetic voices are forgiving because nobody knows how they should sound. Record the real lines whenever you can.

### Lip-sync failures and fixes
- Too much action alongside dialogue loses the lip sync completely. Simplify the action.
- Dialogue that is too long drifts out of sync toward the end and repeats words. Shorten the reference.
- A reference under about 3 s produced strange output. Upload a longer clip and trim the extra in the edit.
- Quotation marks used for emphasis elsewhere in the prompt made the character say that word aloud. Use quotes only around dialogue, and state the lines clearly at the start.

### Control videos for drive shots
One tutorial builds a control video for motion transfer and sends it to Seedance 2.5 with identity references. It is a single demo with no comparison against other drive models. Its parts are:
- **Depth Anything (video),** on Hugging Face, Replicate or fal, which keeps how near things are but not what they look like.
- **SAM 3 cut-outs** of the people on every frame.
- **MediaPipe Face Landmarker** for one centered person talking to camera, with a mesh drawn on every frame. With two people moving, the depth version is the better fit.

What it shows:
- **A control video carries no set.** A depth-only clip came back gray. Describe the place from a still of the source, leaving the people out, or composite the control over the real plate.
- **A silhouette fixes the body shape.** When the new character's hair or build differs from the performer's, the output keeps the performer's body. Laying the cut-out depth people over the original plate fixed it in the demo, though why isn't known.
- **Vocals in the control clip help with lip timing.** A clip with no audio still generates, but the audio helps match the words. The model's own audio can be thrown away and the chosen soundtrack laid back on in the edit.

### Spending gates
- A person watches the whole control mask, checking for holes in bodies, hair and hands, before any paid draft.
- A person approves before the 1080p finish, which costs extra.
- Paid requests shouldn't be retried automatically after a timeout.
- An agent can run a whole pipeline against raw APIs rather than only writing prompts for a platform, which is why these gates matter.

---

## Claims checked

- **A single continuous 30 s Seedance 2.5 clip, with image, video and audio references in one run: true.** — [ComfyUI blog](https://blog.comfy.org/p/seedance-25-is-now-available-via)
- **"Upscale" is the wrong word for the 1080p pass.** One guide (citing Volcano Engine docs) says the draft is 854x480 and costs about one fifth of a 1080p render. The 1080p version reuses the draft's prompt, inputs and seed and is rendered natively, so fine detail can differ. — [Flick](https://flick.art/es/blog/seedance-2-5-draft-mode)
- **A draft is tied to its task ID: confirmed, but the expiry depends on the provider.**
  - A request with `draft: true` returns a `draft_task_id`, the final request sends only the model and that ID, and it is valid for 7 days. — [Oxen docs](https://docs.oxen.ai/inference-api/reference/models/walkthroughs/seedance_2_5_draft_mode)
  - The final references `content[].draft_task.id`, draft and final are billed separately, and the ID is valid for 7 days (search summary). — [APIYI](https://docs.apiyi.com/en/live/2026-10/seedance2-draft-mode)
  - fal's `draft/complete` endpoint takes only `draft_id` plus optional resolution and codec, outputs 1080p only, and says the draft is valid for 14 days and only for the original caller. — [fal llms.txt](https://fal.ai/models/bytedance/seedance-2.5/draft/complete/llms.txt)
- **fal's price for the 1080p completion** is about $1.164 per second of video, multiplied by 0.6 when video inputs are provided. — [fal llms.txt](https://fal.ai/models/bytedance/seedance-2.5/draft/complete/llms.txt)
- **Another price point:** one API reseller lists Seedance 2.5 at US $0.113 to $0.300 per second, depending on 480p or 720p and on whether a reference video is supplied. — [useapi.net](https://useapi.net/blog/260807)
- **"Kling 4 is about to launch" was out of date by late October.** Kling 4.0 Flash went to some subscribers on Sept 28, and reports put the full launch around Oct 15 to 19, 2026. — [AI Weekly](https://aiweekly.co/alerts/kuaishous-kling-ships-kling-40-flash-to-annual-subscribers-30-second-4khdr-ai), [innFactory](https://innfactory.ai/en/ai-models/kuaishou-kling/), [Bernama](https://bernama.com/en/press/news.php?id=2622471)
- **FLUX 3 is real, and the 80 to 90% figure is a single-prompt impression.** It is Black Forest Labs' first video model, with early access on July 23, 2026 and API availability on Aug 4. It makes clips of about 20 s at about 720p with native audio and has a draft mode. BFL's claim that it beats Seedance 2.0 comes from internal evaluation. — [The Decoder](https://the-decoder.com/black-forest-labs-makes-flux-3-video-generally-available-and-claims-it-beats-seedance-2-0/), [Decrypt](https://decrypt.co/374189)
- **GPT Image 2.5 Flare and Sunburst are real (Sept 8, 2026).** Flare is the speed model and Sunburst the quality and edit-precision model, which fits using Sunburst for accurate products. No independent benchmark specific to people was found. — [CometAPI](https://www.cometapi.com/gpt-image-2-5-vs-gpt-image-2/), [Grida](https://grida.co/docs/models/gpt-image-2.5)
- **A 10,000-character prompt limit: contradicted.** One API reseller lists 15,000 characters for Seedance 2.5 (4,000 for 2.0). — [useapi.net](https://useapi.net/blog/260807)
- **"The Chinese version of Seedance has fewer restrictions": vendor claim only.** No official documentation was found.
- **A reseller as the "official API", cheaper and with no data training: not verified.** One guide names Volcano Engine and BytePlus as the first-party channels (search summary). — [Atlas Cloud](https://www.atlascloud.ai/hi/blog/guides/best-seedance-2-5-api-providers-compared)
- **Phonetic pangrams are real, but one short pangram isn't enough data to generate speech from,** which matches the failed real-voice test above. — [Kith](https://www.kith.org/words/2026/07/11/phonetic-pangrams/), [Omniglot](https://www.omniglot.com/bloggle/?p=24417)
- **MP4 over MP3 for voice references: undocumented.** Seedance 2.5 natively takes up to 10 audio references. For Seedance 2.0, a third-party spec lists audio references as MP3, WAV, M4A or AAC, at most 15 s in total, and only alongside an image or video reference. Nothing found explains why a black MP4 would work better, so treat it as untested folk practice. — [ComfyUI blog](https://blog.comfy.org/p/seedance-25-is-now-available-via), [useapi.net](https://useapi.net/blog/260807), [seedance2.so](https://seedance2.so/blog/seedance-2-consistent-voice)
- **Seedance 2.5 blocks real faces: supported in kind, by vendor sources only.**
  - 2.5 keeps the filters added in 2.0, and recognizable real faces and copyrighted characters are blocked at the model level (search summary). — [Runware](https://runware.ai/seedance-2-5)
  - For Seedance 2.0 on Dreamina, a face-detection classifier rejects high-confidence real faces before generation. — [useapi.net](https://useapi.net/blog/260415)
  - A developer FAQ describes registering a real person as a verified asset for Seedance 2.0 (search summary). — [APIYI FAQ](https://docs.apiyi.com/en/faq/seedance2-asset-face-reference)
- **Music as a trigger for Seedance's block: not confirmed** by any source.
- **How hosted motion-transfer products work: undisclosed.** Higgsfield's Genjutsu post doesn't say which model powers it or how it handles real faces, so a control-video pipeline is a plausible equivalent and not evidence of what they do. — [Higgsfield blog](https://higgsfield.ai/blog/higgsfield-genjutsu)
- **478 face landmarks per frame: confirmed.** MediaPipe Face Landmarker has a VIDEO mode and can output 52 expression blendshapes. `num_faces` defaults to 1 but can be raised, so "one centered speaker" isn't a hard limit of the model. — [Google AI Edge docs](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)
- **Income claims: not verified.**

---

## What it means for beatsheet

- **Pick models by shot type, not one global best.** Seedance 2.5 reference-to-video suits dialogue, multi-character and multi-shot scenes up to 30 s. FLUX 3 Video and Kling 4.0 are cheaper or alternative candidates. The tutorials' rankings are single-sample anecdotes.
- **Make draft-then-render the default way to spend.** Iterate prompts at 480p and render 1080p only for the chosen take. Because the final reuses the seed and prompt, every prompt fix has to happen at the draft stage.
- **Store the draft task ID with each take** and complete it by ID. Track each provider's expiry (7 or 14 days).
- **Build prompts from sections:**
  1. references, numbered, with roles, in the same order as the uploads
  2. a timed shot list (start, duration, shot size, camera, blocking, left and right positions)
  3. performance notes (micro-expressions, delivery)
  4. audio, with dialogue only in quotes, a voice-reference tag after each line, accents and sound surfaces
  5. one fixed per-cut look block (camera body, lens, format, grade, grain), repeated verbatim in every prompt, which maps onto the project's shared `look`
  6. a closing consistency line
- **Check before spending credits:**
  - Do the dialogue words per second fit the duration, with about 2 s of slack?
  - Is there heavy action during dialogue?
  - Are voice references between about 3 s and about 15 s?
  - Are there stray quotation marks outside the dialogue?
  - Does the reference order match the prompt?
- **Prefer one long take, then split.** One long multi-shot generation per scene, split at its internal cuts, fits `split_at_cuts`. Test this before relying on it.
- **Use a voiced line per take, not one generic sample,** for any recognizable human voice. Short emotion samples are acceptable only for invented characters. The black-MP4 wrapper is cheap to support but should be tested before it becomes the default.
- **Treat the control video as an asset of its own** (depth, cut-out over the plate, face mesh), made from the person's own footage. `cut_out` already covers the cut-out part. Depth video and face-mesh overlays would be new.
- **Show the control video before a paid drive generation,** in a `choose` or `review` hand-off. This fits beatsheet's turns and its spending limit.
- **Seedance 2.5 could sit beside SCAIL-2 and Wan Animate for drive shots,** but there is one demo and no comparison.

---

## Don't adopt

- Getting past a provider's IP or likeness filter, by any route: renaming trademarked props, hiding faces, altering voices, or choosing a reseller for being "uncensored".
- Motion transfer from other people's footage, whether celebrity clips or viral videos. Film the performance yourself.
- For a person's own likeness, use provider-sanctioned routes where they exist, or the local drive models.

---

## Gaps

- No independent benchmark checks the tutorials' model rankings for realism (Seedance, FLUX 3, Kling 4, H3 Max) or for sheets (Sunburst, GPT Image 2, Nano Banana).
- Seedance 2.5's official prompt-length limit, its maximum audio-reference length, and the question of 480p/720p against 1080p weren't confirmed against ByteDance or BytePlus primary docs. API docs list 480p and 720p, while platforms offer 1080p finals. — [useapi.net](https://useapi.net/blog/260807), [Flick](https://flick.art/es/blog/seedance-2-5-draft-mode)
- Whether a black-MP4 audio reference beats an MP3 is untested anywhere found.
- There is no evidence on whether Seedance 2.5 drive output beats SCAIL-2 or Wan 2.2 Animate for identity hold, lip sync or body shape.
- Whether a control video is needed at all for a person's own consented performance is untested. Seedance's face filter appears to judge how a face looks, not consent, so it may block your own face too.
- No official documentation was found on whether Seedance 2.5 offers a consented real-person route.
