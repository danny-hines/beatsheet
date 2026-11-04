# Lip sync: hosted (fal) and local (ComfyUI on the 4090), as of 2026-11-02

Scope: two jobs.
- **Dub:** an existing clip (real footage or a generated take) + a speech audio file → the same clip with the mouth matching the audio.
- **Talk:** a still (a character's board or portrait) + a speech audio file → a clip of them saying it.

Covered: (A) fal endpoints with exact field names, limits and prices; (B) open-weights models on the person's RTX 4090 through ComfyUI 0.43.2, plus what could run on the MacBook or the laptop with no NVIDIA card; (C) 2026 comparisons.

This builds on section B1 of `research_notes/Which video model for which shot/open_models_and_tools.md` and corrects it in places (see the last section).

Method: web research with WebSearch and WebFetch on 2026-11-02. Nothing was run, installed or paid for. Field names come from each endpoint's `llms.txt` or fal's OpenAPI schema (`https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<id>`).

**Important method note:** `https://fal.ai/models/<id>` renders a page for any id, even a made-up one. A model page loading proves nothing, so existence was judged by `llms.txt` and the OpenAPI schema (a 404 means the route doesn't exist). Forum and Reddit numbers are labelled ANECDOTE. Anything not confirmed on a primary page is marked UNVERIFIED.

---

## A. Hosted on fal: endpoints, inputs, limits, prices

### Takeaway
- **Dub:**
  - **Hard shots:** sync-3 (`fal-ai/sync-lipsync/v3`, $8/min) is still the pick. It is the only fal dub route that can pick a speaker when several faces are in frame (`options.active_speaker_detection`).
  - **Cheaper:** lipsync-2 (`fal-ai/sync-lipsync/v2`, $3/min), lipsync-2-pro ($5/min) and HeyGen's new v3 lipsync (`fal-ai/heygen/v3/lipsync/speed` $0.05/s, `/precision` $0.10/s). HeyGen's routes can re-sync just a time range (`start_time`/`end_time`).
  - **New since mid-2026:** VEED Lipsync v2 (`veed/lipsync/v2`, $0.07/s) and MiniMax H3 Max video-to-video lip sync (`minimax/h3-max/lip-sync/video-to-video`, $0.10/s at 480p, $0.20/s at 768p, clips up to 15 min). H3 Max can't pick a speaker, and its output is capped at 768p and normalized to 24 fps.
  - **Cheapest:** `fal-ai/latentsync` ($0.20 for up to 40 s) and Kling lipsync ($0.014 per input second, but only 2–10 s video).
- **Talk:**
  - **Cheapest:** MiniMax H3 Max lip sync from an image ($0.05/s at 480p, up to 15 min audio) and Kling AI Avatar v2 Standard ($0.0562/s).
  - **OmniHuman v2 is real** (`bytedance/omnihuman/v2`, $0.105/s, 4–300 s audio). It is cheaper than OmniHuman 1.5 ($0.16/s) and takes 5× longer audio.
  - **New since mid-2026:** sync-3 from an image (`fal-ai/sync-lipsync/v3/image-to-video`, $0.1333/s) and HeyGen Photo Avatar 4 (`fal-ai/heygen/avatar4/image-to-video`, $0.10/s).
  - **Open models hosted on fal:** InfiniteTalk is `fal-ai/infinitalk` (sic) at $0.20/s, doubled at 720p.
- **Every route returns `video`** (a File with `url`). Some also return `duration`, `seed`, `timings` or `caption_file`.

### Cited Findings

#### Dub: sync.so on fal
- **`fal-ai/sync-lipsync/v3` (sync-3):** [Source](https://fal.ai/models/fal-ai/sync-lipsync/v3/api)

  | field | type | req | default / enum | notes |
  |---|---|---|---|---|
  | `video_url` | string | yes | | |
  | `audio_url` | string | yes | | |
  | `sync_mode` | enum | no | `cut_off`; `cut_off`,`loop`,`bounce`,`silence`,`remap` | what to do when audio and video lengths differ |
  | `enable_safety_checker` | bool | no | `true` | |
  | `options` | object\|null | no | | `options.sync_mode` overrides the top-level one |
  | `options.model_mode` | enum | no | `lips`,`face`,`head`,`lipsync`,`emotion`,`talking_head` | "primarily used by react-1" |
  | `options.prompt` | enum | no | `happy`,`sad`,`angry`,`disgusted`,`surprised`,`neutral` | react-1 |
  | `options.temperature`, `options.occlusion_detection_enabled` | | no | | "ignored by sync-3" |
  | `options.active_speaker_detection` | object | no | | for several people: `auto_detect` (bool), `v3` (bool), `use_v2` (deprecated), `frame_number` (int), `coordinates` ([x, y] on the speaker's face in `frame_number`), `bounding_boxes` (per-frame `[x1,y1,x2,y2]`), `bounding_boxes_url` (JSON), `face_image` (base64) |

  - **Limits on fal:** fal states no length, size or resolution limits. Accepted types: video mp4/mov/webm/m4v/gif; audio mp3/ogg/wav/m4a/aac. [Source](https://fal.ai/models/fal-ai/sync-lipsync/v3)
  - **Sync.so's own limits** (not confirmed for fal): over 4096×2160 is rejected, files up to 5 GiB, constant 24/25/30 fps recommended. [Source](https://sync.so/docs/compatibility-and-tips/media-formats-support.md)
  - **What the sync modes do:**
    - `cut_off` uses the shorter input.
    - `loop` restarts the video until the audio ends.
    - `bounce` plays the video forward, then in reverse.
    - `silence` pads with silence when the audio is shorter.
    - `remap` changes playback speed so the lengths match. [Source](https://sync.so/docs/developer-guides/sync-mode.md)
  - **Speaker selection:**
    - `coordinates` are pixels in the frame.
    - `bounding_boxes` needs one entry per frame (an entry can be `null`).
    - `auto_detect` defaults to false. [Source](https://sync.so/docs/developer-guides/speaker-selection.md)
  - **Output:** `video: File { url, content_type, file_name, file_size }`. [Source](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/sync-lipsync/v3)
  - **Price:** "$8 per minute". The page doesn't say whether input or output minutes are billed, or how they're rounded. [Source](https://fal.ai/models/fal-ai/sync-lipsync/v3)
- **`fal-ai/sync-lipsync/v2/pro`:**
  - Fields: `video_url`, `audio_url`, `sync_mode` (same five values, default `cut_off`), `enable_safety_checker`.
  - No speaker selection. Output `video`. **$5/min.** [Source](https://fal.ai/models/fal-ai/sync-lipsync/v2/pro)
- **`fal-ai/sync-lipsync/v2`:** the same fields plus `model` (`lipsync-2` default, or `lipsync-2-pro`). **$3 per minute of video**, and pro costs about 1.67× that. [Source](https://fal.ai/models/fal-ai/sync-lipsync/v2/llms.txt)
- **`fal-ai/sync-lipsync` (v1, beta):** `model` is `lipsync-1.9.0-beta` (default), `lipsync-1.8.0` or `lipsync-1.7.1`. $0.70/min. fal describes `silence` here as "extends with frozen frames". [Source](https://fal.ai/models/fal-ai/sync-lipsync)
- **`fal-ai/sync-lipsync/react-1`** (an emotion and performance edit, not plain lip sync): [Source](https://fal.ai/models/fal-ai/sync-lipsync/react-1/llms.txt)
  - Video and audio must each be 15 s or shorter.
  - `emotion` is **required** (`happy`, `sad`, `angry`, `disgusted`, `surprised`, `neutral`).
  - `model_mode` is `face` by default (`lips`, `face`, `head`).
  - The length-mismatch field is **`lipsync_mode`** here (default `bounce`), not `sync_mode`.
  - `temperature` defaults to 0.5.
  - Output `video` also carries width, height, fps, duration and num_frames.
  - $10/min.

#### Dub: other vendors on fal
- **`fal-ai/kling-video/lipsync/audio-to-video`:** [Source](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/lipsync/audio-to-video)
  - `video_url` (required): .mp4/.mov, ≤100 MB, **2–10 s**, 720p/1080p only, each side 720–1920 px.
  - `audio_url` (required): 2–60 s, **≤5 MB**.
  - `enable_safety_checker`.
  - There is no field for a length mismatch, and the page doesn't say how one is handled.
  - Price: $0.014 per input-video second, rounded up to the next 5 s. [Source](https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video)
- **`fal-ai/kling-video/lipsync/text-to-video`:** text in, not audio. [Source](https://fal.ai/models/fal-ai/kling-video/lipsync/text-to-video/llms.txt)
  - `video_url`, 2–60 s.
  - `text`, up to 120 characters.
  - `voice_id`, required, one of 46 Kling voices.
  - `voice_language` (`en` or `zh`) and `voice_speed` (0.8–2).
  - Same price.
- **`veed/lipsync/v2`** (new; "VEED's most advanced model yet"): `video_url`, `audio_url` (URIs, 1–2083 characters). No limits stated. Output `video`. **$0.07 per second of output video.** [Source](https://fal.ai/models/veed/lipsync/v2)
- **`veed/lipsync`:** the same two fields. "$0.4 per minute" is the real listed price. [Source](https://fal.ai/models/veed/lipsync)
- **`veed/dubbing`, `veed/dubbing/pro`:** these translate and re-voice, and take no audio input. [Source](https://fal.ai/models/veed/dubbing/llms.txt); [Source](https://fal.ai/models/veed/dubbing/pro/llms.txt)
  - Fields: `video_url` (up to 10 min), `target_language`, `source_language`, `keyterms`.
  - Pro adds `voice_cloning_strength` (0–10, default 7) and "supports multiple speakers".
  - Price per second of input: $0.11, or $0.18 for pro.
- **`fal-ai/heygen/v3/lipsync/precision`** (new): [Source](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/heygen/v3/lipsync/precision)
  - Required: `video_url`, `audio_url`.
  - Optional: `title`, `enable_caption` (false), `enable_dynamic_duration` (true; "Allow duration adjustment to match the new audio"), `disable_music_track` (false), `enable_speech_enhancement` (false), `start_time` and `end_time` (seconds, "for partial lipsync").
  - Output `video` + `caption_file`.
  - $0.10 per second of output.
- **`fal-ai/heygen/v3/lipsync/speed`** (new): the same fields; $0.05 per second of output. [Source](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/heygen/v3/lipsync/speed)
- **`minimax/h3-max/lip-sync/video-to-video`:** [Source](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=minimax/h3-max/lip-sync/video-to-video)
  - `video_url` (required): 5 s to 15 min, displayed aspect ratio 0.4–2.5. Its own audio is replaced.
  - `audio_url` (required): 0.1 s to 15 min.
  - `duration_mode`: `cut_off` (default), `loop`, `bounce` or `silence`. There is no `remap`, and `silence` rejects audio longer than the video.
  - `resolution`: `768P` (default) or `480P`.
  - `seed` and `enable_safety_checker`.
  - The schema has `additionalProperties: false`, so unknown fields are refused.
  - Output: `video`, `seed`, `duration`, `timings`.
  - Output is normalized to 24 fps at the supported aspect ratio nearest the source. [Source](https://fal.ai/models/minimax/h3-max/lip-sync/video-to-video)
  - Price per second of generated video: $0.10 at 480p, $0.20 at 768p. [Source](https://fal.ai/models/minimax/h3-max/lip-sync/video-to-video/llms.txt)
  - It can't pick a speaker ("the visible speaker").
  - The page's Python sample calls `fal-ai/minimax-h3-max-lipsync-v2v`, not the endpoint id.
- **`fal-ai/latentsync`:** [Source](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/latentsync)
  - Fields: `video_url`, `audio_url`, `guidance_scale` (1–2, default 1), `seed`, `loop_mode` (`pingpong` or `loop`, for audio longer than the video), `enable_safety_checker`.
  - Price: $0.20 for videos up to 40 s, then $0.005 per second of output. [Source](https://fal.ai/models/fal-ai/latentsync)
- **`fal-ai/musetalk`:** fields `source_video_url` (note the name) and `audio_url`. Keeps the source resolution and frame rate. The page shows "$0 per compute second", which looks like a page error, so the price is UNVERIFIED. [Source](https://fal.ai/models/fal-ai/musetalk)
- **`fal-ai/pixverse/lipsync`:** [Source](https://fal.ai/models/fal-ai/pixverse/lipsync)
  - Fields: `video_url`, `audio_url` (optional; falls back to TTS), `voice_id` (default `Auto`), `text`.
  - Price: $0.04 per second of output; TTS costs $0.24 per 100 characters.
- **`creatify/lipsync`** (no `fal-ai/` prefix): `video_url`, `audio_url`, `loop` (default true). $1/min. [Source](https://fal.ai/models/creatify/lipsync)
- **`fal-ai/infinitalk/video-to-video`:** deprecated ("no longer supported"). [Source](https://fal.ai/models/fal-ai/infinitalk/video-to-video)
- **Not on fal:**
  - `fal-ai/tavus/hummingbird-lipsync/v0` (404; it was announced in Apr 2025). [Source](https://blog.fal.ai/hummingbird-0-ai-lip-sync-model-by-tavus-now-available-on-fal)
  - Any LTX LipDub / Dub-It route.
  - A non-Max `minimax/h3/lip-sync/*`.

#### Talk: image + audio on fal
- **`minimax/h3-max/lip-sync/image-to-video`:** [Source](https://fal.ai/models/minimax/h3-max/lip-sync/image-to-video/llms.txt)
  - `image_url` (required; aspect ratio 0.4–2.5).
  - `audio_url` (required; at least 5 s, up to 15 min).
  - `resolution`: `480P`, `768P` (default), `1080P` or `2K`. The playground preselects 1080P.
  - `enable_transcription` (default true; turn it off for singing, laughter or noise).
  - `seed` and `enable_safety_checker`.
  - Output: `video`, `seed`, `duration`, `timings`. The video matches the audio length.
  - Price per second: $0.05 at 480p, $0.08 at 768p, $0.16 at 1080p, $0.32 at 2K. Over 15 s costs 1.2×.
  - A turbo route and a non-Max route are both 404. [Source](https://fal.ai/explore/search?q=minimax%20lip)
- **`fal-ai/kling-video/ai-avatar/v2/standard`** and **`/v2/pro`:** [Source](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/standard/llms.txt); [Source](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro)
  - Fields: `image_url`, `audio_url`, `prompt` (default `"."`), `enable_safety_checker`.
  - Output: `video`, `duration`. The length follows the audio; no maximum is stated.
  - Price: $0.0562/s (Standard), $0.115/s (Pro).
  - Works for "realistic humans, animals, cartoons, or stylized characters".
  - The v1 routes `fal-ai/kling-video/v1/{standard,pro}/ai-avatar` are still live at the same prices.
- **`bytedance/omnihuman/v2`** (also served as `fal-ai/bytedance/omnihuman/v2`): [Source](https://fal.ai/models/bytedance/omnihuman/v2/llms.txt); [Source](https://fal.ai/models/bytedance/omnihuman/v2)
  - `image_url` (required): ≤30 MB, aspect 0.4–2.5, 300–6000 px per side.
  - `audio_url` (required): wav/mp3, ≤15 MB, **4–300 s**.
  - `prompt` (optional; zh/en/ja/ko/es-MX/id).
  - Output: `video`, `duration`.
  - **$0.105 per second.**
  - Output resolution and multi-person support are not on fal's pages (UNVERIFIED).
- **`fal-ai/bytedance/omnihuman/v1.5`:** [Source](https://fal.ai/models/fal-ai/bytedance/omnihuman/v1.5/llms.txt)
  - `image_url`, `audio_url`: under 30 s for 1080p, under 60 s for 720p.
  - `prompt`.
  - `mask_url`: "Only the person in the white area of the mask will speak".
  - `turbo_mode` (default false).
  - `resolution`: `1080p` (default) or `720p`. The page says 720p is "faster and higher in quality".
  - Output: `video`, `duration`.
  - $0.16/s.
- **`fal-ai/bytedance/omnihuman`** (v1): `image_url`, `audio_url` (under 30 s, hard limit); $0.14/s. [Source](https://fal.ai/models/fal-ai/bytedance/omnihuman)
- **`veed/fabric-1.0`:** [Source](https://fal.ai/models/veed/fabric-1.0/llms.txt); [Source](https://fal.ai/models/veed/fabric-1.0)
  - Fields: `image_url`, `audio_url`, and `resolution`, which is **required** with no default (`720p` or `480p`).
  - Output: `video` only, with no `duration`.
  - Price: $0.08/s at 480p, $0.15/s at 720p.
- **`veed/fabric-1.0/fast`:** the same fields. **$0.10/s at 480p, $0.20/s at 720p**, so it costs more than the standard route. [Source](https://fal.ai/models/veed/fabric-1.0/fast)
- **`veed/fabric-1.0/text`:** `image_url`, `text`, `voice_description` (optional), `resolution`. Same price as standard Fabric. [Source](https://fal.ai/models/veed/fabric-1.0/text/llms.txt)
- **`fal-ai/sync-lipsync/v3/image-to-video`** (new): `image_url` (JPEG/PNG/WebP), `audio_url` (the output matches its length), `enable_safety_checker`. $0.1333 per output second. Pitched as working "with any illustration or animated frame". [Source](https://fal.ai/models/fal-ai/sync-lipsync/v3/image-to-video/llms.txt)
- **`fal-ai/heygen/avatar4/image-to-video`:** [Source](https://fal.ai/models/fal-ai/heygen/avatar4/image-to-video/llms.txt)
  - `image_url` (required).
  - `audio_url` (optional; overrides `prompt` and `voice`).
  - `prompt` and `voice` (for text input).
  - `talking_style`: `stable` (default) or `expressive`.
  - `expression`, `background`.
  - `resolution`: `360p`–`1080p`, default `720p`.
  - `aspect_ratio`: `16:9` (default), `9:16`, `4:5`, `5:4`, `1:1` or `auto`.
  - `caption`.
  - $0.10 per output second.
- **`fal-ai/creatify/aurora`:** [Source](https://fal.ai/models/fal-ai/creatify/aurora/llms.txt)
  - Fields: `image_url`, `audio_url`, `prompt`, `guidance_scale` (1), `audio_guidance_scale` (2), `resolution` (`480p` or `720p`, default `720p`).
  - Price: $0.07/s at 480p, $0.14/s at 720p, rounded up to whole seconds.
- **`fal-ai/infinitalk`** (InfiniteTalk; note the spelling): [Source](https://fal.ai/models/fal-ai/infinitalk/llms.txt); [Source](https://fal.ai/models/fal-ai/infinitalk)
  - Required: `image_url`, `audio_url`, `prompt`.
  - Optional:
    - `num_frames` (default 145, range 41–721). At 25 fps that is about 1.6–28.8 s, so **length is set by frames, not by the audio**.
    - `resolution` (`480p` or `720p`).
    - `seed` (42).
    - `acceleration` (`none`, `regular` (default) or `high`).
  - Output: `video`, `seed`.
  - **$0.20/s; "For 720p price will be doubled."**
  - `fal-ai/infinitalk/single-text` has the same shape with `text_input` + `voice` (20 ElevenLabs-style names), at $0.20/s. [Source](https://fal.ai/models/fal-ai/infinitalk/single-text/llms.txt)
- **`fal-ai/ai-avatar/multi`** (MultiTalk, two people): [Source](https://fal.ai/models/fal-ai/ai-avatar/multi/llms.txt)
  - Fields: `image_url`, `first_audio_url` (required, "Person 1"), `second_audio_url` (optional), `prompt` (required), `num_frames` (default 181), `resolution`, `seed` (81), `use_only_first_audio`, `acceleration`.
  - Price: $0.20/s, doubled at 720p, and 1.25× billing units over 81 frames.
  - **The page doesn't say how Person 1 and Person 2 map onto the people in the picture.**
  - `fal-ai/ai-avatar/multi-text` takes two texts with `voice1` and `voice2`.
  - `fal-ai/ai-avatar` (single) is deprecated.
- **`fal-ai/longcat-single-avatar/image-audio-to-video`:** [Source](https://fal.ai/models/fal-ai/longcat-single-avatar/image-audio-to-video/llms.txt)
  - Fields: `image_url`, `audio_url`, `prompt`, `negative_prompt`, `num_inference_steps` (50), `text_guidance_scale` (4), `audio_guidance_scale` (4), `resolution` (`480p` or `720p`), `num_segments` (1–10).
  - **Length comes from `num_segments`:** about 5.8 s for the first segment, then 5 s each, up to about 51 s.
  - Price: $0.15/s at 480p, $0.30/s at 720p.
- **`fal-ai/wan/v2.2-14b/speech-to-video`:** [Source](https://fal.ai/models/fal-ai/wan/v2.2-14b/speech-to-video/llms.txt)
  - Fields: `prompt` (required), `image_url`, `audio_url`, `num_frames` (40–120, default 80), `frames_per_second` (16), `resolution` (`480p`, `580p` or `720p`), `num_inference_steps` (27), `guidance_scale` (3.5), `shift` (5).
  - **Maximum 120 frames**, so about 7.5 s at 16 fps.
  - Price: $0.10, $0.15 or $0.20 per second (480p, 580p, 720p), counted at 16 fps.
- **`fal-ai/echomimic-v3`:** `image_url`, `audio_url`, `prompt` (required), `num_frames_per_generation` (49–161). $0.20 per second of input-audio length. [Source](https://fal.ai/models/fal-ai/echomimic-v3)
- **`lightricks/ltx-2.5/audio-to-video/pro`** and **`/fast`:** [Source](https://fal.ai/models/lightricks/ltx-2.5/audio-to-video/pro/llms.txt); [Source](https://fal.ai/models/lightricks/ltx-2.5/audio-to-video/fast/llms.txt)
  - `audio_url`: 2–20 s, and "pro models support a maximum of 10 seconds".
  - `image_url` (optional first frame) and `prompt` (required if there is no image).
  - `aspect_ratio`: `auto`, `16:9` or `9:16`.
  - Price per second of input audio at 1080p: $0.17 (pro), $0.13 (fast).
  - Neither page promises lip sync.
- **`fal-ai/ltx-2.3/audio-to-video`:** $0.10/s, audio 2–20 s. There are also megapixel-priced `fal-ai/ltx-2.3-quality/audio-to-video` and `fal-ai/ltx-2.3-22b/audio-to-video`. [Source](https://fal.ai/models/fal-ai/ltx-2.3/audio-to-video/llms.txt)
- **Not on fal** (404 and no search hits): `fal-ai/infinitetalk` (the id is `infinitalk`), `fal-ai/stable-avatar`, `fal-ai/hunyuan-avatar`, HuMo, Hedra, and a LongCat multi-avatar route. [Source](https://fal.ai/explore/search?q=avatar)

#### Several faces on fal
- **sync-3:** pick the speaker by `coordinates` + `frame_number`, by per-frame `bounding_boxes`, by a `face_image`, or with `auto_detect`. [Source](https://fal.ai/models/fal-ai/sync-lipsync/v3/api)
- **OmniHuman 1.5:** `mask_url`; one speaker per call. [Source](https://fal.ai/models/fal-ai/bytedance/omnihuman/v1.5/llms.txt)
- **MultiTalk (`fal-ai/ai-avatar/multi`):** two audio fields; the mapping to faces is undocumented. [Source](https://fal.ai/models/fal-ai/ai-avatar/multi/llms.txt)
- **Every other route:** no way to pick a speaker. H3 Max video-to-video says only "the visible speaker". [Source](https://fal.ai/models/minimax/h3-max/lip-sync/video-to-video)

### Inferences
- **Dub routing:**
  - Default: `fal-ai/sync-lipsync/v2` with `model: "lipsync-2"` ($3/min).
  - Up-route to sync-3 ($8/min) for close-ups, profiles, occlusion, or when there are several faces (it is the only one with speaker selection).
  - Use HeyGen speed or precision when only part of a clip needs re-syncing (`start_time`/`end_time`).
  - Use `fal-ai/latentsync` as the bargain route for clips up to 40 s ($0.20 flat).
- **Talk routing:**
  - Drafts: H3 Max lip sync at 480p ($0.05/s) or Kling Avatar v2 Standard ($0.0562/s).
  - Long monologues: OmniHuman v2 ($0.105/s, up to 300 s).
  - Stylized or illustrated characters: sync-3 image-to-video.
  - Two people in one picture: `fal-ai/ai-avatar/multi`.
- **beatsheet has to handle mismatched lengths.** Some routes take a mode (`sync_mode`, `duration_mode`, `lipsync_mode`, `loop_mode`, `loop`). Kling, VEED and HeyGen take none. InfiniteTalk, Wan S2V and LongCat need a length in frames or segments computed from the audio.

### Gaps
- **Billing details:** whether sync's per-minute prices bill input or output minutes, and how they round.
- **Output fps and resolution:** not stated for most talk routes.
- **Limits:** none published for VEED, HeyGen, PixVerse, Creatify, LatentSync or MuseTalk.
- **MuseTalk's real price** on fal.
- **OmniHuman v2:** output resolution and multi-person support.
- **MultiTalk:** how speakers map to faces.

---

## B. Local on the 4090 (24 GB) through ComfyUI 0.43.2

### Takeaway
- **Talk:** **InfiniteTalk** is the one open lip-sync model with **native core nodes** that also handles two speakers.
  - Nodes: `WanInfiniteTalkToVideo` + `ModelPatchLoader`, since ComfyUI v0.11.0 (27 Jan 2026).
  - Apache-2.0, Comfy-Org repackaged files, 480p at 25 fps, extended by chaining windows.
  - Other native options:
    - Wan 2.2 S2V: Apache, but slow, because the speed LoRA hurts it.
    - HuMo: Apache, about 4 s at most.
    - LTX-2.3 image + audio: native template `video_ltx2_3_ia2v`, 720p at 24 fps; LTX licence; mixed lip-sync reports.
- **Dub:** **no open dub model has native nodes.** ComfyUI's core lip-sync nodes are all paid partner APIs.
  - **LatentSync 1.6** (custom pack): edits only the mouth area and pastes it back, so the rest of the frame keeps its resolution. Needs about 18 GB. Its face detector's weights (InsightFace) are non-commercial.
  - **InfiniteTalk video-to-video** (Kijai's WanVideoWrapper): Apache throughout, but it regenerates the whole frame at 480p/720p and changes details when the camera moves.
  - **Best measured, not yet practical:** TBDub (Apache, Sep 2026) and X-Dub (Apache) score best in 2026 studies, but they are Linux-only Python, not ComfyUI.
  - **LTX-2.3 Dub-It** (formerly LipDub) is text-driven and doesn't take your audio file.
- **Mac or a laptop with no NVIDIA card:**
  - MuseTalk 1.5: MIT; an MLX port exists and the code falls back to CPU.
  - LTX-2.3 audio-to-video through `ltx-2-mlx`: 16–32 GB RAM, minutes per clip.
  - Nothing else.

### Cited Findings

#### What ComfyUI core has
- **Audio encoders:** `AudioEncoderLoader` (reads `models/audio_encoders`) and `AudioEncoderEncode`. [Source](https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/comfy_extras/nodes_audio_encoder.py)
  - The native wav2vec2 encoder and a work-in-progress Wan 2.2 S2V arrived in v0.3.53 (28 Aug 2025). [Source](https://docs.comfy.org/changelog)
- **Wan nodes in `comfy_extras/nodes_wan.py`:** `WanSoundImageToVideo`, `WanSoundImageToVideoExtend`, `WanHuMoImageToVideo`, `WanInfiniteTalkToVideo`. `ModelPatchLoader` is in `nodes_model_patch.py`. [Source](https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/comfy_extras/nodes_wan.py); [Source](https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/comfy_extras/nodes_model_patch.py)
- **The v0.11.0 changelog line "Multi/InfiniteTalk … for LTXV" is mislabelled.** The release lists kijai's PR #10179, "Support Multi/InfiniteTalk", merged 22 Jan 2026. It patches the Wan model (`comfy/ldm/wan/model_multitalk.py`) and never touches LTXV. [Source](https://github.com/comfyanonymous/ComfyUI/releases/tag/v0.11.0); [Source](https://github.com/comfyanonymous/ComfyUI/pull/10179)
- **LTX audio nodes:** `LTXVAudioVAELoader`, `LTXVAudioVAEEncode`, `LTXVAudioVAEDecode`, `LTXVEmptyLatentAudio`, `LTXAVTextEncoderLoader`, plus `LTXVConcatAVLatent` and `LTXVSeparateAVLatent`. [Source](https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/comfy_extras/nodes_lt_audio.py)
- **Every core lip-sync or dubbing node is a paid partner API:** Kling lip sync, KlingAvatar (v0.15.0), sync.so sync-3 (v0.28.0), HeyGen (v0.28.1), VEED Fabric and Lipsync 2.0 (v0.42.4), VEED Dubbing (v0.43.1). The changelog shown stops at v0.43.1 (28 Oct 2026). [Source](https://docs.comfy.org/changelog)

#### Talk: InfiniteTalk / MultiTalk (MeiGen), native
- **Model:** Apache-2.0, built on Wan2.1-I2V-14B-480P with chinese-wav2vec2-base. [Source](https://github.com/MeiGen-AI/InfiniteTalk)
  - Image-to-video is good to about a minute; colors drift after that.
  - Video-to-video has no length limit, and the camera only approximates the source.
  - Defaults: `--max_frame_num` 1000 (40 s), streaming mode, 480p or 720p.
- **Native node `WanInfiniteTalkToVideo`:** [Source](https://docs.comfy.org/built-in-nodes/WanInfiniteTalkToVideo)
  - `mode` is `single_speaker` or `two_speakers`; two speakers adds `audio_encoder_output_2`, `mask_1` and `mask_2`.
  - Inputs: `model`, `model_patch`, `start_image`, `clip_vision_output` (optional), `audio_encoder_output_1`, `motion_frame_count` (9, range 1–33), `audio_scale`, `previous_frames`.
  - Outputs: model, positive, negative, latent, `trim_image`.
  - **There is no source-video input, so native is talk only.**
- **Template `video_wan2_1_infinitetalk`:** [Source](https://docs.comfy.org/tutorials/video/wan/wan-infinitetalk); [Source](https://www.comfy.org/workflows/video_wan2_1_infinitetalk-b95499a55c9f/)
  - Defaults: 832×480, 81 frames, 25 fps.
  - You lengthen a clip by copying the "Video Extend" group and wiring `previous_frames`; each copy adds about 3.24 s.
  - Two speakers: draw a mask per character and use one Load Audio per character.
- **Files:**

  | Folder | File | Size | Source |
  |---|---|---|---|
  | `diffusion_models` | `wan2.1_i2v_480p_14B_fp8_scaled.safetensors` (or Kijai's `Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ`, 16.6 GB, which the template names) | 16.4 GB | [Source](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/diffusion_models) |
  | `model_patches` | `wan2.1_infiniteTalk_single_fp16.safetensors` | 5.13 GB | [Source](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/model_patches) |
  | `model_patches` | `wan2.1_infiniteTalk_multi_fp16.safetensors` | 5.12 GB | same |
  | `audio_encoders` | `wav2vec2-chinese-base_fp16.safetensors` (Kijai/wav2vec2_safetensors) | 190 MB | [Source](https://huggingface.co/Kijai/wav2vec2_safetensors/tree/main) |
  | `text_encoders` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | 6.74 GB | [Source](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/text_encoders) |
  | `vae` | `wan_2.1_vae.safetensors` | 254 MB | [Source](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/vae) |
  | `loras` | `lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors` (Kijai/WanVideo_comfy/Lightx2v) | 738 MB | [Source](https://huggingface.co/Kijai/WanVideo_comfy/tree/main/Lightx2v) |
  | `clip_vision` (optional) | `clip_vision_h.safetensors` | 1.26 GB | [Source](https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/tree/main/split_files/clip_vision) |

  - Smaller InfiniteTalk patches from Kijai: fp8 scaled 2.71 GB [Source](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled/tree/main/InfiniteTalk); GGUF Q4_K_M 1.4 GB to Q8 2.65 GB [Source](https://huggingface.co/Kijai/WanVideo_comfy_GGUF/tree/main/InfiniteTalk).
- **VRAM and speed:** no official 4090 figure.
  - Kijai's wrapper README: about 16 GB for 512×512×81 with 20 of 40 blocks offloaded. [Source](https://github.com/kijai/ComfyUI-WanVideoWrapper)
  - ANECDOTE (Oct 2025): about 70 s on an RTX 4090 at 480×832, 4 steps with the lightx2v LoRA; clip length not given. [Source](https://www.divyarthinfotech.com/blog/how-to-create-video-to-video-lip-sync-with-infinitetalk-in-comfyui)
- **Quality:**
  - The authors warn that the FusionX LoRA worsens color shift and identity. [Source](https://github.com/MeiGen-AI/InfiniteTalk)
  - Community notes recommend a static camera for dubbing. [Source](https://wanx-troopers.github.io/infinite-talk.html)
  - ANECDOTE: "infinitetalk only static camera"; LTX 2.3 handled camera movement better. [Source](https://reddit.sentinel-team.org/posts/1sy5acj/snapshots/2026-05-02T01%3A00%3A24.534079Z)
- **MultiTalk:** the predecessor, 480p only, about 15 s at most. The README cites low-VRAM 480p on one 4090. It has been replaced in practice; native `ModelPatchLoader` reads its weights but leaves out its long mode. [Source](https://github.com/MeiGen-AI/MultiTalk); [Source](https://github.com/comfyanonymous/ComfyUI/pull/10179)

#### Dub: InfiniteTalk video-to-video (custom pack)
- **Needs Kijai's `ComfyUI-WanVideoWrapper`** (Apache-2.0). [Source](https://github.com/kijai/ComfyUI-WanVideoWrapper)
  - Example workflow: `wanvideo_2_1_14B_V2V_InfiniteTalk_example_02.json`.
  - Nodes: `VHS_LoadVideo` (VideoHelperSuite), `MultiTalkModelLoader`, `WanVideoImageToVideoMultiTalk`, `MultiTalkWav2VecEmbeds`.
  - Settings: 25 fps, 4 steps, cfg 1.
  - "If audio is longer than the video, the result will extend from the last video frame". [Source](https://raw.githubusercontent.com/kijai/ComfyUI-WanVideoWrapper/main/example_workflows/wanvideo_2_1_14B_V2V_InfiniteTalk_example_02.json)
- **Speakers:** the wrapper takes up to 4 audio tracks, assigned left to right, all the same length (community notes). [Source](https://wanx-troopers.github.io/infinite-talk.html)
- **It regenerates the whole frame** at the model's 480p/720p and changes source details when the camera moves. [Source](https://wanx-troopers.github.io/infinite-talk.html)

#### Talk: Wan 2.2 S2V-14B, native
- **Model:** Apache-2.0. Image + audio, with an optional pose video. Multiple people aren't mentioned. 480P and 720P, following the image's aspect ratio. [Source](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B)
- **Nodes:** `WanSoundImageToVideo` (positive, negative, vae, width 832, height 480, length 77 in steps of 4, batch_size; optional `audio_encoder_output`, `ref_image`, `control_video`, `ref_motion`) and `WanSoundImageToVideoExtend` (adds `video_latent`). [Source](https://raw.githubusercontent.com/comfyanonymous/ComfyUI/master/comfy_extras/nodes_wan.py)
  - The Extend node came in v0.3.55 (29 Aug 2025). [Source](https://docs.comfy.org/changelog)
- **Template `video_wan2_2_14B_s2v`:** [Source](https://docs.comfy.org/tutorials/video/wan/wan2-2-s2v)
  - 16 fps in 77-frame chunks of about 4.81 s.
  - One Extend per extra chunk: ceil(seconds × 16 / 77) chunks in all.
  - **The 4-step lightx2v LoRA "causes significant dynamic and quality loss"** because it wasn't trained for S2V. The fallback is 20 steps at CFG 6.
- **Files:** [Source](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models); [Source](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/audio_encoders)
  - `wan2.2_s2v_14B_fp8_scaled.safetensors`, 16.4 GB (bf16 is 32.6 GB).
  - `wav2vec2_large_english_fp16.safetensors`, 631 MB.
  - Plus `wan_2.1_vae` and umt5 fp8.
- **VRAM:** the official single-GPU command needs 80 GB. No measured ComfyUI or 4090 figure found. [Source](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B)
- **Quality:**
  - The authors claim it beats Hunyuan-Avatar and OmniHuman (self-reported). [Source](https://huggingface.co/Wan-AI/Wan2.2-S2V-14B)
  - ANECDOTE: one user moved from S2V and SkyReels V3 to LTX 2.3. [Source](https://reddit.sentinel-team.org/posts/1s1j5mn/snapshots/2026-03-27T22%3A16%3A10.082755Z)

#### Talk: HuMo (ByteDance), native
- **Model:** Apache-2.0. Text + image + audio, with Whisper-large-v3 for audio. Trained on 97 frames at 25 fps (about 3.9 s). [Source](https://github.com/Phantom-video/HuMo)
  - "HuMo-Longer" is still not released, and there's no extend node.
  - 720P is "much better" than 480P.
  - The 1.7B makes 480P in 8 min on a 32 GB GPU.
- **Template "HuMo Video Generation":** [Source](https://comfy.org/workflows/video_humo-f6bf65f974c0/)
  - Nodes: `UNETLoader`, `AudioEncoderLoader`, `AudioEncoderEncode`, `WanHuMoImageToVideo`, `KSampler`, `CreateVideo`.
  - Settings: 6 steps, CFG 1, shift 8, 97 frames, 25 fps, 640×640.
  - `WanHuMoImageToVideo` has been native since v0.3.60 (23 Sep 2025). [Source](https://docs.comfy.org/changelog)
- **Files** (`Comfy-Org/HuMo_ComfyUI/split_files/`): [Source](https://huggingface.co/Comfy-Org/HuMo_ComfyUI/tree/main/split_files/diffusion_models); [Source](https://huggingface.co/Comfy-Org/HuMo_ComfyUI/tree/main/split_files/audio_encoders)
  - `humo_17B_fp8_e4m3fn.safetensors` 17.1 GB, `humo_1.7B_fp16.safetensors` 3.48 GB.
  - `whisper_large_v3_fp16.safetensors` 3.09 GB.
  - Plus the lightx2v I2V LoRA, umt5 and the VAE.
- **Quality:** good single-person lip sync, the mouth stays still in silence, and SageAttention degrades lip sync. This comes from a secondary, AI-compiled knowledge base. [Source](https://nathanshipley.github.io/banodoco-kb/kb/wan/index.html)

#### Talk: LTX-2.3 / LTX-2.5 with audio (Lightricks)
- **LTX-2.3 image + audio is native.** Template `video_ltx2_3_ia2v`, "Upload an image and an audio file to generate a high-quality video with synchronized lip movements." [Source](https://docs.comfy.org/tutorials/video/ltx/ltx-2-3)
  - Audio path: `LoadAudio` → `TrimAudioDuration` → `LTXVAudioVAEEncode`.
  - Defaults: 1280×720, 24 fps. [Source](https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/video_ltx2_3_ia2v.json)
  - Files: [Source](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_ltx2_3_ia2v.json); [Source](https://huggingface.co/Comfy-Org/ltx-2/tree/main/split_files/text_encoders)
    - `ltx-2.3-22b-dev-fp8.safetensors`, 27.14 GB (Lightricks/LTX-2.3-fp8).
    - `ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors`, 2.55 GB.
    - `gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors`, 599 MB.
    - `ltx-2.3-spatial-upscaler-x2-1.1.safetensors`, 950 MB.
    - `gemma_3_12B_it_fp4_mixed.safetensors`, 9.45 GB.
  - ANECDOTE (RTX 4090): the LTX-2.3 built-in template (not image + audio) at 1920×1088, 7 s, took 413 s cold and 289 s warm. [Source](https://reddit.sentinel-team.org/posts/1rqowbe/snapshots/2026-03-14T00%3A06%3A20.529354Z)
- **Licenses:** [Source](https://raw.githubusercontent.com/Lightricks/LTX-2/main/LICENSE-2); [Source](https://raw.githubusercontent.com/Lightricks/LTX-2/main/LICENSE-2_x)
  - LTX-2 Community License: a paid licence is needed at $10M+ annual revenue; worldwide apart from sanctioned countries; no claim on outputs.
  - The 2.x licence adds disclosure of machine-generated content when published.
- **LTX-2.5 has no native audio-to-video template** (only t2v, i2v, flf2v and DFR). [Source](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5)
  - ANECDOTE: with outside audio it is "practically unusable so far". [Source](https://huggingface.co/Lightricks/LTX-2.5/discussions/37)
  - ANECDOTE: 2.3 is "significantly better" than 2.5 for singing avatars. [Source](https://huggingface.co/Lightricks/LTX-2.5/discussions/57)
- **Quality (ANECDOTES):**
  - Good at medium shots and close-ups, poor when the character is far away; putting the transcript in the prompt helps.
  - Another user called it "pretty bad" next to InfiniteTalk. [Source](https://reddit.sentinel-team.org/posts/1s1j5mn/snapshots/2026-03-27T22%3A16%3A10.082755Z)

#### Dub: LTX-2.3 Dub-It IC-LoRA (formerly LipDub)
- **The repo was renamed to `Lightricks/LTX-2.3-22b-IC-LoRA-DubIt`.** [Source](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-LipDub/tree/main)
  - The file is now `ltx-2.3-22b-ic-lora-dubit-0.9.safetensors`, 2.47 GB, gated with a click-through.
  - Lightricks' docs write it as `…dub-it-0.9`.
- **It is text-driven: you give the source video plus the new dialogue as text, and it generates the speech.** [Source](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta)
  - The source audio only sets the voice.
  - Single speaker; EN/FR/ES/DE/RU; validated on 2.3 only; it can change facial motion beyond the lips.
  - `DubItPipeline` has no target-audio argument. [Source](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/src/ltx_pipelines/dubit.py)
  - Lightricks' own blog says LipDub is "text-driven". [Source](https://ltx.io/blog/lipsync-vs-lipdub)
- **Needs the `Lightricks/ComfyUI-LTXVideo` pack** (`LTXICLoRALoaderModelOnly`, `LTXAddVideoICLoRAGuide`) and asks for "32GB+ VRAM". [Source](https://github.com/Lightricks/ComfyUI-LTXVideo)
- **Using your own audio is not supported:** one user's report of feeding custom audio in as the "original" is an untested ANECDOTE. [Source](https://huggingface.co/RuneXX/LTX-2.3-Workflows/discussions/141)

#### Dub: LatentSync 1.6 (ByteDance), custom pack
- **Versions:** 1.6 (11 Jun 2025) was retrained at 512×512 to fix blurry teeth and lips. Last commit 20 Jun 2025; no newer release. [Source](https://github.com/bytedance/LatentSync); [Source](https://huggingface.co/ByteDance/LatentSync-1.6)
- **License:**
  - Code is Apache-2.0 [Source](https://github.com/bytedance/LatentSync/blob/main/LICENSE); the HF weights are tagged `openrail++`.
  - **Face detection uses InsightFace `FaceAnalysis`** with no pack name, so it loads the default (buffalo_l). [Source](https://raw.githubusercontent.com/bytedance/LatentSync/main/latentsync/utils/face_detector.py)
  - InsightFace says its pretrained models are "for non-commercial research only". [Source](https://github.com/deepinsight/insightface/tree/master/python-package)
  - The audio.cpp repack spells it out: Apache on LatentSync "does not override those terms". [Source](https://huggingface.co/audio-cpp/LatentSync-1.6-GGUF)
- **How it works:** [Source](https://github.com/bytedance/LatentSync/blob/main/latentsync/pipelines/lipsync_pipeline.py)
  - Mouth-masked inpainting in a 512 face crop (256 for 1.5), pasted back into the original frame.
  - Video is resampled to 25 fps and audio to 16 kHz.
  - Works in 16-frame windows with no length limit. If the audio is longer, the video ping-pong loops; if it's shorter, the video is cut.
  - The code hardcodes `device="cuda"`.
- **VRAM:** 18 GB for 1.6 (8 GB for 1.5). [Source](https://github.com/bytedance/LatentSync)
- **ComfyUI packs:**
  - **`GuardSkill/ComfyUI-LatentSyncEnhanced`** (registry v1.0.5, 2 Apr 2026, Apache): [Source](https://github.com/GuardSkill/ComfyUI-LatentSyncEnhanced); [Source](https://api.comfy.org/nodes/search?search=latentsync)
    - `chunk_frames`: 80 for 24 GB, 48 for 16 GB, 32 for 12 GB, 16 for 8 GB.
    - Defaults: 20 steps, `lips_expression` 1.5.
    - Frames with no face pass through; if there is no face at all, the original is returned.
    - Files go in `models/checkpoints/LatentSync-1.6/`.
  - **`ShmuelRonen/ComfyUI-LatentSyncWrapper`:** [Source](https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper/blob/main/nodes.py); [Source](https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper/issues?q=is%3Aissue)
    - Nodes `LatentSyncNode` and `VideoLengthAdjuster`; last code commit 14 Jun 2025.
    - No chunking; hardcodes a `D:\ComfyUI_windows\temp` path.
    - Known breakages: insightface/mediapipe installs, Python 3.13 portable, ONNX, torch 2.6 `weights_only`, torchvision 0.22. A missing VAE silently gives noisy mouths.
- **Files:** [Source](https://huggingface.co/ByteDance/LatentSync-1.6/tree/main); [Source](https://huggingface.co/ByteDance/LatentSync-1.6/tree/main/auxiliary)
  - `latentsync_unet.pt` 5.07 GB, `whisper/tiny.pt` about 72 MB, VAE about 320 MB, plus InsightFace's pack.
  - The 2.88 GB `auxiliary/` folder holds training and evaluation models. GuardSkill doesn't list it as needed, and HF flags `i3d_torchscript.pt` there as suspicious, so don't fetch it.
- **Speed:** no 4090 PyTorch figure.
  - Replicate on an L40S typically takes about 105 s. [Source](https://replicate.com/bytedance/latentsync)
  - audio.cpp GGUF on a 5090, 9.68 s at 1080×1920: 133 s with DeepCache (Q8). [Source](https://huggingface.co/audio-cpp/LatentSync-1.6-GGUF)
- **Quality:**
  - Highest lip-sync accuracy (3.52/5) in UniSync's 2026 user study (see C), but weaker on image quality.
  - Ranked last in TBDub's 2026 MOS study.
  - X-Dub's paper: lip leakage, side-view distortion and identity drift; "often fail on stylized or non-human characters". [Source](https://arxiv.org/html/2512.25066)
  - The wrapper says it "works best with clear, frontal face videos". [Source](https://github.com/ShmuelRonen/ComfyUI-LatentSyncWrapper)

#### Dub: MuseTalk 1.5 (Tencent Music), no working ComfyUI pack
- **License:** code MIT, "no limitation for both academic and commercial usage"; the weights are usable "for any purpose, even commercially". [Source](https://raw.githubusercontent.com/TMElyralab/MuseTalk/main/README.md)
  - Caveat: the face-parsing weights were trained on CelebAMask-HQ, which is "non-commercial research purposes only". [Source](https://github.com/switchablenorms/CelebAMask-HQ)
- **What it is:** a 256×256 face region pasted back, at 25 fps, any length (frames cycle forward then back), batch size 8. [Source](https://github.com/TMElyralab/MuseTalk)
  - "30fps+ on an NVIDIA Tesla V100" in realtime mode; tested on a 4 GB RTX 3050 Ti laptop.
  - The README admits mustache, lip shape and color are "not well preserved", plus some jitter.
  - Files: `musetalkV15/unet.pth` 3.4 GB. [Source](https://huggingface.co/TMElyralab/MuseTalk/tree/main/musetalkV15)
- **ComfyUI:** every pack loads 1.0 and dates from 2024: kijai/ComfyUI-MuseTalk-KJ, chaojie/ComfyUI-MuseTalk, AIFSH/ComfyUI-MuseTalk_FSH. [Source](https://github.com/kijai/ComfyUI-MuseTalk-KJ/blob/main/nodes.py); [Source](https://api.comfy.org/nodes/search?search=musetalk)
- **Mac:** an MLX port, `mlx-community/MuseTalk-1.5-fp16` (1.88 GB; q8 1.64 GB, MIT), does about 34 faces/s at batch 8 on an unnamed M-series GPU, with about 7 GB peak. [Source](https://huggingface.co/mlx-community/MuseTalk-1.5-fp16)
- **CPU:** `inference.py` falls back to CPU without CUDA; no timing given. [Source](https://github.com/TMElyralab/MuseTalk/blob/main/scripts/inference.py)

#### Dub: newer research models (2026), not ComfyUI-native
- **TBDub (Alibaba Taobao/Tmall, arXiv 5 Sep 2026):** [Source](https://github.com/TaoLiveAIGC/TBDub); [Source](https://huggingface.co/TaoLiveAIGC/TBDub/tree/main); [Source](https://arxiv.org/html/2609.06144v1)
  - License: Apache-2.0 for code and weights. Dependencies: Wan2.2 VAE, HuBERT-large (Apache) and MediaPipe. No InsightFace.
  - Video + audio, mask-free.
  - Size: the 2-step "Student" is 12.6 GB.
  - VRAM: about 15 GB with `--cpu-offload`, about 28 GiB without.
  - Speed: 15 s of audio in 63 s (82 s with offload) on an RTX PRO 5000 72 GB; the README says it is "not an RTX 4090 hardware test".
  - Output: 512 crops in 77-frame segments, single person.
  - Platform: Linux, NVIDIA, Python 3.10; no ComfyUI.
- **X-Dub (Kling + Tsinghua, ICML 2026):** [Source](https://github.com/KlingAIResearch/X-Dub); [Source](https://huggingface.co/KlingTeam/X-Dub/tree/main)
  - License: Apache-2.0.
  - The public model is built on Wan2.2-TI2V-5B (the paper's model is internal).
  - Requirements: about 21 GB VRAM, 30.2 GB of files, OpenMMLab dependencies.
  - Output: a 512 crop, single person.
  - Known problems: flicker, and about 2% of frames badly noisy.
  - ComfyUI: `DarkNoah/comfyui-x-dub`, Linux + NVIDIA only, with its own venv. [Source](https://github.com/DarkNoah/comfyui-x-dub)
- **KeySync (Imperial):** code Apache; SVD base, whose licence may carry over (UNVERIFIED); 24.6 GB; Linux; no ComfyUI. [Source](https://github.com/antonibigata/keysync)
- **LipForcing (KAIST, Jul 2026):** 14B, about 37 GB peak, so it doesn't fit a 4090; uses InsightFace buffalo_l. [Source](https://github.com/cvlab-kaist/LipForcing)

#### Not usable (license, or no weights)
- **License blocks:**
  - Wav2Lip: non-commercial (LRS2). [Source](https://github.com/Rudrabha/Wav2Lip)
  - JoyGen: Basel Face Model and nvdiffrast are non-commercial. [Source](https://github.com/JOY-MM/JoyGen)
- **Stale:** VideoReTalking is Apache but last committed Nov 2023 and loses identity. [Source](https://github.com/OpenTalker/video-retalking)
- **No weights:** OmniSync (Kling, "All rights reserved") [Source](https://ziqiaopeng.github.io/OmniSync); StableDub [Source](https://stabledub.github.io); UniSync (Mango TV) [Source](https://arxiv.org/html/2603.03882v1).

#### Talk: LongCat-Video-Avatar 1.0 / 1.5 (Meituan), custom packs
- **License conflict:** the weights are MIT [Source](https://huggingface.co/meituan-longcat/LongCat-Video-Avatar-1.5), but the 1.5 project page says generated content is for academic use and "commercial use is not permitted". [Source](https://meigen-ai.github.io/LongCat-Video-Avatar-1.5-Page/)
- **Versions:** 1.5 came out 21 May 2026 with Whisper-Large and 8-step distillation. Talk only. 1.0 has single and multi checkpoints. [Source](https://github.com/meituan-longcat/LongCat-Video)
- **ComfyUI:** not native.
  - 1.0 runs in Kijai's wrapper; `LongCat-Avatar-single_fp8_e4m3fn_scaled_mixed_KJ.safetensors` is 16.9 GB. [Source](https://huggingface.co/Kijai/LongCat-Video_comfy/tree/main/Avatar)
  - 1.5 runs in `rookiestar28/ComfyUI-LongCat-Avatar` (MIT). [Source](https://github.com/rookiestar28/ComfyUI-LongCat-Avatar)
    - Inputs `left_audio`, `audio` and `p_box` person boxes.
    - Output 480×832 or 768×1280 at 25 fps.
    - The first window is 93 frames, plus 80 per continuation.
    - On Windows only startup was tested.
- **ANECDOTE (VisionStory, a competing vendor):** an A800 at 40 GB with INT8 and 8 steps took 3,586 s for 82 s of video, about 44 s of compute per second of output. [Source](https://www.visionstory.ai/open-source/longcat-video-avatar)

#### Talk: other open models (brief)
- **SkyReels V3 A2V-19B:** [Source](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B); [Source](https://raw.githubusercontent.com/SkyworkAI/SkyReels-V3/main/LICENSE.txt)
  - License: the Skywork Community License allows commercial use under its terms.
  - One audio track; 720p at 24 fps; audio up to 200 s.
  - Kijai's wrapper only (`WanVideoImageToVideoSkyreelsv3_audio`), with a 19.1 GB fp8 file and a 4-step distill. [Source](https://huggingface.co/Kijai/WanVideo_comfy_fp8_scaled/tree/main/SkyReelsV3)
  - A vendor tutorial runs 500 frames (about 20 s) on a 4090 at 480×832. [Source](https://www.nextdiffusion.ai/tutorials/create-talking-avatars-with-skyreels-v3-in-comfyui)
- **StableAvatar:** [Source](https://github.com/Francis-Rings/StableAvatar)
  - Code MIT; the weights' licence isn't stated.
  - Wan2.1-1.3B; 480×832 at 25 fps.
  - Officially about 18 GB and about 3 min per 5 s on a 4090.
  - ComfyUI through `smthemex/ComfyUI_StableAvatar`.
- **FantasyTalking:** Apache; Wan2.1-I2V-14B-720P; Kijai's wrapper. [Source](https://github.com/Fantasy-AMAP/fantasy-talking)
- **OmniAvatar:** Apache; 480p; no ComfyUI. [Source](https://github.com/Omni-Avatar/OmniAvatar)
- **EchoMimic V3:** Apache; 1.3B; the Flash version needs 12 GB, up to 768×768. [Source](https://github.com/antgroup/echomimic_v3)
- **HunyuanVideo-Avatar:** the licence **excludes the EU, UK and South Korea**; 24 GB minimum and "very slow". [Source](https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo-Avatar/main/LICENSE)
- **MiniMax H3 (open):** not a lip-sync tool from given audio. [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3); [Source](https://github.com/MiniMax-AI/MiniMax-H3)
  - Ref2VA takes up to 3 audio clips of 2–15 s (15 s in total), documented as voice timbre or music references.
  - Dialogue is written in the prompt as `<d>…</d>`.
  - Its licence excludes the US, EU, UK and South Korea.
- **Nothing newer found:** no InfiniteTalk 2, S2V 2 or HuMo 2. MeiGen's last update was Sep 2025 and Wan-AI's S2V Sep 2025. [Source](https://huggingface.co/MeiGen-AI); [Source](https://huggingface.co/Wan-AI)
  - Search-only leads, unconfirmed: Avatar-Forever (Aug 2026, real-time, on LTX 2.3) [Source](https://arxiv.org/pdf/2608.12107), daVinci-MagiHuman, AVTR-1, Kandinsky 6.0.

#### Apple-silicon Mac and the laptop with no NVIDIA card
- **MuseTalk 1.5 MLX:** about 7 GB peak, MIT. [Source](https://huggingface.co/mlx-community/MuseTalk-1.5-fp16)
- **LTX-2.3 audio-to-video through `dgrauet/ltx-2-mlx`** (MIT): [Source](https://github.com/dgrauet/ltx-2-mlx)
  - It has an `a2v` command.
  - Memory: 16 GB minimum (int4), 32 GB+ recommended (int8).
  - Speed: an M1 Max takes about 9–12 min for 576×1024 × 241 frames on 2.5 q8; the README gives 563 s and 701 s for different modes.
  - Dub-It is experimental, on 2.3 only.
- **LatentSync:** the code hardcodes CUDA. [Source](https://github.com/bytedance/LatentSync/blob/main/latentsync/pipelines/lipsync_pipeline.py)
- **LongCat 1.5 pack:** a `macOS-MLX` test branch only. [Source](https://github.com/rookiestar28/ComfyUI-LongCat-Avatar)
- **Wan-14B talk models** (InfiniteTalk, S2V, HuMo 17B, SkyReels): no Mac or non-NVIDIA reports found.
- **Laptop:** only MuseTalk's CPU fallback, with no timing.

### Inferences
- **Speed estimate for InfiniteTalk on this 4090 (inference, not measured):**
  - The person's 4090 made a 3 s Wan 2.2 14B rough at 832×480 with the 4-step LoRAs in 38 s (beatsheet memory, 2026-11-02).
  - InfiniteTalk is the same size class (Wan 2.1 14B + a 5 GB patch) at the same 4 steps, so expect roughly 40–80 s per 81-frame (3.2 s) window at 480p.
  - So about 15–25 s of compute per second of output. That is consistent with the ~70 s anecdote.
- **Wan S2V will be slow without its LoRA.** 20 steps at CFG 6 is about 10× the passes of a 4-step CFG-1 run, so expect several minutes per 4.8 s chunk at 480p. That probably rules it out as a default.
- **Real footage vs generated takes:**
  - InfiniteTalk dubbing and LTX regenerate the whole frame at 480p or 720p. A 1080p or 4K real clip would come back blurrier and changed.
  - Mask-and-paste models (LatentSync, MuseTalk, TBDub, X-Dub) keep the source frame outside the face crop.
  - For real footage that settles it in favour of mask-and-paste; for generated takes (already 480–720p) InfiniteTalk dubbing is fine.
- **Licensing:**
  - Clean: InfiniteTalk, Wan S2V, HuMo, MuseTalk's main weights, TBDub and X-Dub.
  - Conditional: LTX (under $10M, disclosure rule on 2.x), SkyReels (Skywork terms).
  - Blocked or unclear: LatentSync (InsightFace), LongCat (output clause), Hunyuan (territories), H3 (territories), Wav2Lip and JoyGen.
- **Downloads beyond the person's current ComfyUI**, which already has Wan 2.2 14B, umt5 fp8 and the Wan 2.1 VAE:
  - InfiniteTalk native needs about 22.5 GB new: Wan 2.1 I2V 480p fp8 16.4, single patch 5.13, wav2vec2 0.19, lightx2v LoRA 0.74. The multi patch is another 5.12 GB.
  - LatentSync needs about 5.5–6 GB.
  - LTX-2.3 image + audio needs about 41 GB.

### Gaps
- **No measured 4090 timings** for native InfiniteTalk (only one anecdote without a clip length), LatentSync 1.6, Wan S2V, HuMo 17B, LTX-2.3 image + audio, TBDub or X-Dub.
- **LatentSync packs:** whether `GuardSkill/ComfyUI-LatentSyncEnhanced` also loads InsightFace (likely, since it wraps the same pipeline, but UNVERIFIED), and its node class names.
- **Windows support** for TBDub, X-Dub and KeySync (Linux-only docs).
- **LTX-2.3 image + audio:** the maximum length per run, and the "Set Audio Video Mask By Time" node (the ltx.io page wouldn't load).
- **Real people vs stylized characters:** no measured split for any local model.
- **ComfyUI 0.43.2** isn't in the changelog (it stops at 0.43.1); nothing lip-sync-related is expected there.

---

## C. Comparisons from 2026

### Takeaway
- **There is no independent, blind lip-sync arena.** Artificial Analysis has no lip-sync or avatar board. OpenArt's "Lip Sync" board ranks native-audio generators, not lip-sync tools, and OpenArt says it isn't independent.
- **Dub, among open models:** the authors' own user studies agree only that MuseTalk is weakest. LatentSync wins raw lip-sync accuracy in one (UniSync, Mar 2026) and comes last in another (TBDub, Sep 2026), where TBDub > X-Dub > KeySync.
- **Dub, hosted:** vendor-run reviews consistently put sync-3 first for real footage.
- **Talk:** LongCat-Video-Avatar 1.5's own study claims a win over Kling Avatar 2.0, OmniHuman 1.5 and HeyGen. Vendor tests give Kling Avatar more accurate mouths and OmniHuman 1.5 steadier motion that fades after about 10 s.

### Cited Findings

#### Arenas and leaderboards
- **Artificial Analysis:** the video boards are text-to-video, image-to-video and video editing only. There is no lip-sync or avatar board, and `/video/leaderboard/lip-sync` is 404. [Source](https://artificialanalysis.ai/video/leaderboard/image-to-video)
- **OpenArt Arena "Lip Sync" ranking (24 Sep 2026):** [Source](https://openart.ai/blog/openart-arena-lip-sync-ranking/)
  - It ranks native-audio video generators on a composite: general capabilities 30%, and talking, singing, multi-character and multilingual 17.5% each.
  - Scores are anchored to MiniMax H3 = 1000: Seedance 2.5 1123, Seedance 2.0 1060, Seedance 2.0 Mini 1054, MiniMax H3 1000, Wan 3.0 923.
  - OpenArt says it "should not be described as an independent third party", and that the composite "does not establish which model leads each lip sync criterion".

#### Dub
- **UniSync paper (Mango TV, arXiv 4 Mar 2026):** [Source](https://arxiv.org/html/2603.03882v1); [Source](https://sota2.com/research/sota/video-dubbing-on-realworld-lipsync)
  - User study with 50 participants on a 1–5 scale; the authors' own benchmark; UniSync has no weights.

    | Method | Lip-sync accuracy | Identity | Timing stability | Image quality | Realism |
    |---|---|---|---|---|---|
    | LatentSync | **3.52** | 3.12 | 3.14 | 3.07 | 2.99 |
    | UniSync | 3.49 | **3.83** | **3.68** | **4.12** | **3.86** |
    | OmniSync | 3.37 | 3.62 | 3.64 | 3.68 | 3.46 |
    | MuseTalk | 2.44 | 2.30 | 2.28 | 2.08 | 2.14 |

  - On RealWorld-LipSync (faces and stylized avatars), LatentSync had the best identity score (CSIM 0.927) and MuseTalk the second-best success rate (86.5% vs LatentSync 77.8%).
- **TBDub paper (Alibaba, Sep 2026):** MOS on 38 TalkVid clips, scored as lip-sync / identity / visual quality. These are the authors' own scores. [Source](https://arxiv.org/html/2609.06144v1)

  | Method | Lip-sync | Identity | Visual quality |
  |---|---|---|---|
  | TBDub Student | 3.85 | 3.72 | 3.80 |
  | TBDub Teacher | 3.71 | 3.78 | 3.78 |
  | X-Dub | 3.57 | 2.83 | 2.88 |
  | KeySync | 2.75 | 2.40 | 2.33 |
  | LipForcing | 2.18 | 2.88 | 2.52 |
  | LatentSync | 1.91 | 2.23 | 1.87 |

  - It was also tested on MiniMax H3-generated videos (qualitatively).
- **X-Dub paper (Dec 2025):** the internal model succeeded 96.36% of the time on X-DubBench, vs LatentSync 59.77% and MuseTalk 60%. The public 5B model is weaker than the internal one. [Source](https://arxiv.org/html/2512.25066)
- **KeySync paper:** LipLeak 0.16 vs LatentSync 0.33 (lower is better). [Source](https://arxiv.org/html/2505.00497v1)
- **Maxfusion (28 Jul 2026; its co-founder sells access to these models):**
  - Observations from live ad pipelines, not blind, no clip count.
  - It ranks sync-3 the best "fix" model, with Sync 2 Pro and VEED's lipsync API about equal.
  - React-1 is a performance-redirect specialist.
  - Verdict: "No single model wins." [Source](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)
- **invideo (6 Aug 2026; hosts the models; no testing):** "HeyGen Precision is the pick when the redub has to survive close viewing." [Source](https://invideo.io/blog/ai-lipsync-models/)
- **each::labs (22 Oct 2026; hosts the models; no testing):** sync-3 for real footage; Sync v2 Pro when lengths differ. [Source](https://www.eachlabs.ai/blog/best-ai-lip-sync-models-2026)

#### Talk
- **LongCat-Video-Avatar 1.5 report (Meituan, 26 May 2026):** [Source](https://arxiv.org/html/2605.26486v1)
  - Setup: 508 image-audio cases, including more than 50 stylized ones; 770 crowd raters gave 13,240 judgments; 10 experts scored lip sync at 0.5× speed.
  - In A/B tests LongCat 1.5 was preferred by a majority over Kling Avatar 2.0 (largest margin), OmniHuman 1.5 and HeyGen. **No percentages are given**, and these are the authors' own results.
  - Its human-likeness scores: 3.39 single-person and 2.68 multi-person, so multi-person is clearly weaker.
- **PiAPI (vendor) comparison:** Kling AI Avatar had stronger lip-sync accuracy and clearer articulation; OmniHuman 1.5 had steadier motion and identity. [Source](https://piapi.ai/en/blogs/omnihuman-1-5-vs-kling-ai-avatar)
- **Maxfusion:** OmniHuman 1.5 is good early on and degrades by about 10–11 s. RIZZ is the most realistic audio-driven model, with vowel-dependent slips. [Source](https://maxfusion.ai/blog/ai-video-models-lip-sync-2026)
- **VEED's own test:** Fabric 1.0 first over Kling V2 Pro, HeyGen, OmniHuman 1.5 and Hedra (vendor). [Source](https://www.veed.io/learn/best-lipsync-api)
- **Avatar V paper (arXiv 11 Jun 2026):** compares against Seedance 2.0, Kling O3 Pro, Veo 3.1 and OmniHuman 1.5. [Source](https://arxiv.org/abs/2606.13872)
  - Avatar V is HeyGen's product name: fal lists `fal-ai/heygen/avatar5/digital-twin` as "HeyGen Avatar V digital twin". [Source](https://fal.ai/explore/search?q=avatar)
  - So the paper is most likely HeyGen's own, not independent. The arXiv page shows no affiliation.
- **Two speakers, native dialogue (n=1, RTX 5090):** MiniMax H3 had a 0% character error rate vs LTX-2.5's 9.52%. [Source](https://ai-muninn.com/en/blog/ltx25-vs-minimax-h3-rtx5090)

### Inferences
- **The two dub studies disagree on LatentSync because they test different things.** UniSync's study rewards mouth accuracy, where LatentSync's SyncNet supervision shines. TBDub's MOS weighs identity and visual quality, where 512-crop inpainting shows blur and leakage. For beatsheet, LatentSync is a good-mouth, soft-detail baseline; TBDub and X-Dub are the quality ceiling for open dubbing.
- **Nothing ranks InfiniteTalk against sync-3, or local models against hosted ones, on the same clips.** beatsheet's own A/B on real project clips would be the first such comparison. Per the "test through real work" rule, do it on real jobs, not a paid bake-off.

### Gaps
- **No blind or third-party study** covering sync-3, lipsync-2, HeyGen v3 lipsync, VEED Lipsync v2 and H3 Max lip sync together.
- **No study splitting results** by real footage vs generated characters.
- **Magic Hour's "Best AI Lip Sync 2026" benchmark** (vendor; 20 stress-test clips): the press release returned 403. [Source](https://pressat.co.uk/releases/magic-hour-research-publishes-best-ai-lip-sync-2026-benchmark-accuracy-and-naturalness-scorecards-3c306a36e6616c510fb73aa1bbe31015/)

---

## Corrections to B1 (open_models_and_tools.md)
- **fal InfiniteTalk id:** it is `fal-ai/infinitalk`, not `fal-ai/infinitetalk`, at $0.20/s and doubled at 720p. The B1 page "existed" only because fal renders a page for any id.
- **Missing prices now found:**
  - `fal-ai/sync-lipsync/v2`: $3/min.
  - `veed/fabric-1.0/fast`: $0.10/s at 480p, $0.20/s at 720p, more than standard.
  - `veed/lipsync`: $0.40/min confirmed. `veed/lipsync/v2` is new, at $0.07/s.
- **OmniHuman 2.0 exists:** `bytedance/omnihuman/v2`, $0.105/s, audio 4–300 s (not 30–300). Its 720p and multi-person claims remain unverified.
- **Kling lip sync audio** is also capped at 5 MB.
- **ComfyUI v0.11.0's "Multi/InfiniteTalk for LTXV"** is native Wan 2.1 InfiniteTalk/MultiTalk (PR #10179). Native nodes do talk only; dubbing needs Kijai's wrapper.
- **LTX-2.3 LipDub was renamed Dub-It.** It is text-driven and doesn't take a given audio file.
- **The "independent" Avatar V paper** is most likely HeyGen's own.
