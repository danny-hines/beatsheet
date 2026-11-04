# Open video models (local, through ComfyUI) and specialized video tools, as of 2026-11-02

Scope: (A) open-weights video generators that run locally through ComfyUI; (B) specialized tools, hosted or open, for lip sync, motion transfer, video editing, and upscaling or interpolation. All fal prices were read on fal model pages on **2026-11-02** unless another date is given.

Method: web research with WebSearch and WebFetch. The shared web-search budget ran out partway through, so some later items rest on direct page fetches only. Where that left something unverified, it is listed under Gaps. Reddit-style reports are labelled as anecdotes.

---

## A. Which open-weights video models run locally through ComfyUI, and how do they compare?

### Takeaway
As of November 2026, **MiniMax H3** (33B, open since 31 Jul 2026) is the only open model in the same league as the hosted leaders: #1 open and #4 overall on Artificial Analysis image-to-video. Its licence excludes the **US, EU, UK and South Korea**, and Comfy says commercial use of locally generated output needs a licence bought through Comfy.

**LTX-2.5** (22B, 11 Aug 2026) is the clear #2 open model: native audio, first/last frame, up to 4K/50 fps, and int8/NVFP4 builds that run 5-second clips on a 24 GB 4090. Its licence is free under $10M revenue.

**Wan 2.2** (Apache 2.0) is still the newest Wan with downloadable weights. Wan 2.5, 2.6, 2.7 and 3.0 are API-only. Wan 2.2 has the richest add-on ecosystem: 4-step lightx2v LoRAs, Animate/Animate-2, Dancer, VACE and SCAIL-2.

HunyuanVideo 1.5, Kandinsky 5, SkyReels V3, LongCat-Video, Mochi and CogVideoX trail. None of them appears on the current AA leaderboard.

### Cited Findings

#### Rankings and what ComfyUI supports natively
- **AA image-to-video, open-weights board (v2.1, no snapshot date shown):** [Source](https://artificialanalysis.ai/video/leaderboard/image-to-video/open-weights)
  - #1 MiniMax H3 (768p), Elo 1128 (CI 1112–1144), released Jul 2026.
  - LTX-2.5 Fast 918; LTX-2.5 Pro 910 (both Aug 2026).
  - LTX-2.3 Pro 837; LTX-2.3 Fast 829 (both Mar 2026).
- **AA text-to-video, open-weights board:** [Source](https://artificialanalysis.ai/video/leaderboard/text-to-video/open-weights)
  - #1 MiniMax H3 (768p), 1161 ±14.
  - LTX-2.5 Fast 947; LTX-2.5 Pro 944.
  - LTX-2.3 Pro 885; LTX-2.3 Fast 838.
- **AA image-to-video, all models.** H3 at 768p ranks #4 overall. Wan 2.2 and HunyuanVideo 1.5 are not on the v2.1 board. Confidence intervals are about ±16–19, so neighbouring ranks may not differ meaningfully. [Source](https://artificialanalysis.ai/video/leaderboard/image-to-video)

  | Rank | Model | Elo |
  |---|---|---|
  | 1 | Seedance 2.5 | 1153 |
  | 2 | Utopai X | 1146 |
  | 3 | Seedance 2.0 | 1136 |
  | 4 | **MiniMax H3 768p (open)** | 1128 |
  | 5 | Hyperflow H3 | 1124 |
  | 6 | HeyGen Video 1 | 1120 |
  | 7 | Pruna P-Video-2-Pro | 1119 |
  | 8 | MiniMax H3 Max (fal) | 1117 |
  | 9 | Wan 3.0 | 1111 |
  | 11 | FLUX 3 | 1071 |
  | 14 | Gemini Omni Flash 1.1 | 1046 |
  | 15 | HappyHorse-1.1 | 1037 |
  | 17 | Kling 3.0 Pro 1080p | 1000 |

- **A third-party board disagrees.** It ranks FLUX 3 first for T2V (1,091, note dated 27 Oct 2026) and LTX-2.5 Fast first for I2V (1,215, 22 Oct 2026). This comes from a search-result summary; I did not open the page. AA does not flag FLUX 3 as open. [Source](https://theopenweights.com/leaderboards)
- **When ComfyUI added each open model natively (changelog):** [Source](https://docs.comfy.org/changelog)

  | Version | Date | Added |
  |---|---|---|
  | v0.3.60 | 23 Sep 2025 | Wan 2.2 Animate; HuMo |
  | v0.3.71 | 21 Nov 2025 | HunyuanVideo 1.5 |
  | v0.4.0 | 10 Dec 2025 | Kandinsky 5.0 |
  | v0.5.0 | 17 Dec 2025 | WanMove |
  | v0.8.0 | 7 Jan 2026 | LTXV 2 |
  | v0.11.0 | 27 Jan 2026 | LTX2 tiny VAE; Multi/InfiniteTalk for LTXV |
  | v0.13.0 | 10 Feb 2026 | EasyCache for LTX2 |
  | v0.16.0 | 5 Mar 2026 | LTXAV 2.3; SCAIL WanVideo |
  | v0.19.0 | 13 Apr 2026 | LTX2 reference audio (ID-LoRA) |
  | v0.21.0 | 11 May 2026 | CogVideoX; Wan-Dancer |
  | v0.22.0 | 20 May 2026 | LTX 2.3 memory reduction |
  | v0.25.0 | 16 Jun 2026 | Bernini-R (Wan); SCAIL-2 |
  | v0.26.0 | 23 Jun 2026 | SCAIL-2 multireference; LTX2 context windows |
  | v0.29.0 | 29 Jul 2026 | Uni3C ControlNet for Wan |
  | v0.29.2 | 31 Jul 2026 | MiniMax-H3 |
  | v0.30.0 | 3 Aug 2026 | H3 audio-video |
  | v0.31.0 | 7 Aug 2026 | Wan-Animate2 |
  | v0.32.0 | 11 Aug 2026 | LTX 2.5 |
  | v0.35.0 | 9 Sep 2026 | H3 PDD LoRA; H3 Fun Union |
  | v0.36.0 | 15 Sep 2026 | FastVideo FastH3 |
  | v0.38.0 | 29 Sep 2026 | ID-V2V; H3 Fun ControlNet Union 2.0 |
  | v0.40.0 | 13 Oct 2026 | LTX-2.5 DFR I2V template |

- **"WAN3-Prime" in ComfyUI is a hosted partner model** (`wan3.0-video-prime`), not open weights. [Source](https://docs.comfy.org/es/tutorials/partner-nodes/wan/wan3-0.md)

#### Wan (Alibaba): 2.2 is the last open release
- **Open-weights status by version:** [Source](https://howaiworks.ai/blog/alibaba-wan-open-weights-stopped-at-2-2)
  - Wan 2.1 (Feb 2025) and Wan 2.2 (28 Jul 2025) are open, Apache 2.0.
  - No weights for Wan 2.5-Preview (24 Sep 2025), 2.6 (16 Dec 2025), 2.7 (Apr 2026) or 3.0 (public beta Aug 2026).
  - As of 10 Aug 2026, the Wan-AI Hugging Face org had 27 repos, all Wan 2.1/2.2 variants plus Wan-Dancer-14B and Wan-Animate-2. SEO pages claiming 2.6 or 2.7 are open are contradicted.
- **Closed Wan 3.0:** 2–30 s, 480p/720p/1080p, 30 fps, audio on by default [Source](https://howaiworks.ai/blog/alibaba-wan-open-weights-stopped-at-2-2). AA I2V Elo 1111 [Source](https://artificialanalysis.ai/video/leaderboard/image-to-video).
- **Wan 2.2 models and licence:** [Source](https://github.com/Wan-Video/Wan2.2)
  - Licence: Apache 2.0.
  - T2V-A14B and I2V-A14B: MoE, 480p/720p.
  - TI2V-5B: 720p (1280×704), 24 fps.
  - Also S2V-14B (speech-to-video) and Animate-14B.
  - Reference code needs 80 GB for the 14B models on one GPU. The 5B runs on a 24 GB 4090 with offload and makes a 5 s 720p clip in "under 9 minutes on a single consumer-grade GPU".
- **ComfyUI templates:** `video_wan2_2_5B_ti2v`, `video_wan2_2_14B_t2v`, `video_wan2_2_14B_i2v`, `video_wan2_2_14B_flf2v` (first/last frame). [Source](https://docs.comfy.org/tutorials/video/wan/wan2_2)
  - Files: high/low-noise 14B in fp8_scaled (T2V) or fp16 (I2V), plus `umt5_xxl_fp8_e4m3fn_scaled`.
  - The 5B "should fit on 8GB VRAM" with ComfyUI's native offloading.
- **No native sound.** Open Wan 2.2 clips are silent, about 5 s. [Source](https://howaiworks.ai/blog/alibaba-wan-open-weights-stopped-at-2-2)
- **lightx2v Wan2.2-Lightning speed-up LoRAs:** [Source](https://huggingface.co/lightx2v/Wan2.2-Lightning)
  - Releases: T2V-A14B-NFE4 V1 (4 Aug 2025), V1.1 (7 Aug), I2V-A14B-NFE4-V1 (7 Aug). Native ComfyUI workflows followed on 8 Aug 2025.
  - 4 steps with no CFG; the card claims a 20× speed-up.
  - Known limits: artifacts with extremely large motion, and vehicle direction is sometimes reversed.
  - Apache 2.0.
- **Anecdote, RTX 4060 8 GB with 32 GB RAM:** Phr00t's Wan2.2-14B-Rapid-AllInOne distilled checkpoint. [Source](https://lilting.ch/en/articles/wan22-comfyui-rtx4060-i2v)
  - Settings: 480×480, 33 frames, 4 steps, CFG 1.
  - Result: 111 s per clip, about 4.6 GB on the GPU and about 11 GB offloaded with `--lowvram`.
- **Anecdote, Apple silicon (M2 Max 64 GB, ComfyUI on MPS, Aug 2025):** [Source](https://papayabytes.substack.com/p/guide-comfyui-and-wan-22-image-to)
  - The default Wan 2.2 14B I2V files failed in KSamplerAdvanced.
  - It worked with QuantStack GGUF Q5_K_M high/low-noise files through ComfyUI-GGUF, but only at 320×320 (640×640 gave black video).
  - No time was reported.
- **fal endpoints:**
  - `fal-ai/wan/v2.2-a14b/image-to-video`: $0.08/s at 720p, $0.06 at 580p, $0.04 at 480p. Video seconds are counted at 16 fps. Takes an end image. [Source](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video)
  - `fal-ai/wan/v2.2-a14b/image-to-video/lora`: $0.10/s. [Source](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/lora)
  - `fal-ai/wan/v2.2-5b/image-to-video`: $0.15 per video, 720p, 24 fps, up to 5 s. [Source](https://fal.ai/models/fal-ai/wan/v2.2-5b/image-to-video)
- **Quality, community view (unverified):** [Source](https://runaihome.com/blog/ltx-2-5-local-ai-video-hardware-guide-2026/)
  - Wan 2.2+ renders more photoreal humans than LTX-2.5.
  - Hunyuan handles complex physics better.
  - LTX-2.5 is 3–4× faster than both.

#### LTX-2.3 and LTX-2.5 (Lightricks)
- **LTX-2.5 release:** 22B, with Gemma 4 12B as text encoder. Released with day-one ComfyUI support, reported 11 Aug 2026 [Source](https://comfyui-wiki.com/en/news/2026-08-11-ltx-2-5-open-weights-release). ComfyUI v0.32.0 is dated 11 Aug 2026 [Source](https://docs.comfy.org/changelog).
- **Licence: LTX-2.x Community License Agreement.** [Source](https://huggingface.co/Lightricks/LTX-2.5); [Source](https://fal.ai/ltx-2.5)
  - Free for commercial use under $10M annual revenue, counted across the whole entity including affiliates. A paid agreement is needed above that.
  - Not an OSI licence, and it bars training competing models.
  - The HF repo is gated with automatic approval.
- **Inputs:** [Source](https://huggingface.co/Lightricks/LTX-2.5); [Source](https://comfyui-wiki.com/en/news/2026-08-11-ltx-2-5-open-weights-release)
  - Text.
  - One or more images at any frame index, with a strength (frame 0 is the first frame).
  - First/last frame.
  - Video-to-video, audio-to-video and text-to-audio.
  - IC-LoRA control in ComfyUI-LTXVideo: inpaint/outpaint, motion tracking, union control.
  - Most LTX-2.3 LoRAs work on 2.5.
- **Output:** [Source](https://huggingface.co/Lightricks/LTX-2.5); [Source](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5)
  - Synchronized audio from an audio VAE and vocoder.
  - Native 4K HDR at up to 50 fps; frames must be 8n+1.
  - Stage 1 renders 960×544 and stage 2 doubles it; DFR reaches 3840×2176.
  - Native multishot, and auto duration that predicts length from the described action.
- **Length limits (vendor spec, quoted by a guide):** up to 20 s. Clips over 10 s drop to 720p/1080p at 24/25 fps. 48/50 fps output is capped at 10 s. [Source](https://runaihome.com/blog/ltx-2-5-local-ai-video-hardware-guide-2026/)
- **Checkpoints:** [Source](https://huggingface.co/Lightricks/LTX-2.5)
  - dev (bf16), distilled (bf16).
  - ComfyUI int8 "convrot" builds of both, and distilled NVFP4.
  - FP8 is only an on-the-fly cast; no GGUF is mentioned.
  - Distilled runs a fixed 8 steps at CFG 1.
  - Extras: distilled LoRA, duration-head patch, Pixel Spatial Upscaler IC-LoRA.
- **ComfyUI templates:** "LTX-2.5 T2V", "LTX-2.5 I2V", "LTX-2.5 FLF2V", "DFR". [Source](https://docs.comfy.org/tutorials/video/ltx/ltx-2-5)
  - Files: `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot`, `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot`, video and audio VAEs, x2 latent spatial upscaler.
  - The optional prompt enhancer is about 5 GB and adds 1–2 minutes.
- **File sizes:** [Source](https://ai-muninn.com/en/blog/ltx25-vs-minimax-h3-rtx5090)
  - Distilled int8 transformer 21.5 GB; NVFP4 18.7 GB.
  - Gemma 4 12B int8 14.32 GiB.
  - Conv VAE 1.35 GiB; audio VAE 0.34 GiB; x2 upscaler 0.93 GiB.
- **VRAM on a 4090 (community reports):** [Source](https://runaihome.com/blog/ltx-2-5-local-ai-video-hardware-guide-2026/)
  - With the int8 template, 5 s clips complete at 22.67 GiB resident; 10 s clips run out of memory at VAE decode.
  - RTX 3090, int8 distilled: about 2.5 min per 5 s clip.
  - A 6 GB card with 44 GB RAM works when heavily offloaded.
  - The bf16 transformer is about 42 GB.
  - The author calls 32 GB of system RAM the floor for offloading.
- **Measured on an RTX 5090 (32 GB), one blogger, n=1:** [Source](https://ai-muninn.com/en/blog/ltx25-vs-minimax-h3-rtx5090)

  | Model, case | Settings | Sampling | Whole flow | Peak VRAM |
  |---|---|---|---|---|
  | LTX-2.5 int8 | 1280×704, 121 frames, 8+3 steps | 14.3 s | 28.7 s | about 31.7 GB |
  | LTX-2.5 NVFP4 | same | – | 28.8 s | – |
  | MiniMax H3, one speaker | 1344×768, 124 frames, 14 steps with Spectrum (9 real passes) | – | 81 s | – |
  | MiniMax H3, two speakers | same | – | 95 s | – |

  - Two-speaker dialogue: character error rate 9.52% for LTX-2.5 against 0% for H3.
  - Loudness: LTX audio −10.4 LUFS; H3 −25.1 LUFS.
- **Vendor speed:** a 10 s clip in 6.8 s on 2× GB200. NVIDIA's guide gives about 25 s for 4 s at 720p on a 5090. [Source](https://runaihome.com/blog/ltx-2-5-local-ai-video-hardware-guide-2026/)
- **LTX-2.3:** [Source](https://huggingface.co/Lightricks/LTX-2.3); [Source](https://docs.comfy.org/changelog)
  - 22B (ltx-2.3-22b-dev), LTX-2 Community License.
  - Distilled v1.0/v1.1 run 8 steps at CFG 1; there is a distilled LoRA 384.
  - Spatial upscalers x2 and x1.5; temporal upscaler x2.
  - Tasks: T2V, I2V, V2V, A2V, T2AV, I2AV, V2A.
  - Native in ComfyUI since v0.16.0 (5 Mar 2026).
- **LTX templates on comfy.org:** [Source](https://comfy.org/workflows/model/ltx/)
  - Control: Canny/Depth/Pose to Video, IC-LoRA Union Control, Cameraman IC-LoRA.
  - Editing: "Remove an object from a video", "Expand a video's frame", "Restore archival footage", EditAnything, Cleanplate.
  - Audio and identity: "Make your character talk", Lipdub LoRA + Voice Clone, Audio-Reactive LoRA, ID LoRA.
- **fal endpoints, LTX-2.5:** [Source](https://fal.ai/ltx-2.5); [Source](https://fal.ai/models/lightricks/ltx-2.5/image-to-video/fast)
  - `lightricks/ltx-2.5/image-to-video/fast` and `/text-to-video/fast`: $0.09/s at 720p, $0.13 at 1080p, $0.19 at 1440p, $0.30 at 4K. Up to 20 s; 24/25/48/50 fps; optional end frame.
  - `lightricks/ltx-2.5/image-to-video/pro` and `/text-to-video/pro`: $0.12/s at 720p, $0.17 at 1080p. 6, 8 or 10 s.
  - `lightricks/ltx-2.5/audio-to-video/pro`: $0.17 per second of input audio. `/fast`: $0.13.
  - Duration defaults to "auto".
- **fal endpoint, LTX-2.3:** `fal-ai/ltx-2.3/image-to-video`. Up to 20 s, 24/48 fps, end frame. [Source](https://fal.ai/models/fal-ai/ltx-2.3/image-to-video)
  - The page shows two conflicting rate sets:

    | Resolution | Rate A | Rate B |
    |---|---|---|
    | 1080p | $0.08/s | $0.06/s |
    | 1440p | $0.16/s | $0.12/s |
    | 4K | $0.32/s | $0.24/s |

#### MiniMax H3 open variants
- **Release.** The model launched 31 Jul 2026 and its weights were confirmed open on HF (MiniMaxAI/MiniMax-H3). ComfyUI supported it the same day. [Source](https://dev.to/routeai_official/minimax-h3-is-open-weight-now-heres-whats-actually-downloadable-vs-api-only-441k); [Source](https://docs.comfy.org/changelog)
- **Architecture and what is open:** [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3)
  - 33B dense single-stream transformer; encoder is Qwen3-VL-32B (Apache 2.0).
  - Open checkpoints:
    - **Base FL2VA**: text-to-audio-video, plus first/last frame (0, 1 or 2 images).
    - **Base Ref2VA**: reference-to-audio-video.
  - Not open: H3-Context-IR (hosted preprocessing) and H3-Regenerate-2K (2K upscaling).
- **Output:** 4–15 s at 24 fps; short side 768 px by default; 32 kHz stereo audio; stable dialogue in 11 languages. [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- **Ref2VA limits:** up to 9 images, up to 3 videos and up to 3 audio clips, 12 files at most. [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3); [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3); [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)
  - Each video or audio clip is 2–15 s, with a combined total of 15 s or less.
  - Reference video must be 23.976–60 fps and is read as 24 fps.
  - Audio needs an image or video to anchor it.
  - References only take effect in the R2V template.
- **ComfyUI templates:** `video_minimax_h3_t2v`, `_i2v`, `_r2v`, `_multiframe_reference`, `_fun_controlnet_union`. [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3)
  - Minimum ComfyUI versions: T2V/I2V/R2V 0.30.0; multiframe 0.34.0; Fun Union 0.35.0 (Union 2.0 needs 0.38.0); sparse attention 0.35.0.
  - FastH3 (FastVideo sparse-attention checkpoints, 0.36.0) adds speed-focused workflows.
- **Model files:** [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)
  - Diffusion: `minimax_h3_fl2va_pruned_int8_convrot` and `minimax_h3_ref2va_pruned_int8_convrot`.
  - Text encoder: `qwen3vl_32b_minimax_h3_nvfp4_awq`.
  - VAEs: int8 video VAE, fp32 audio VAE.
  - Turbo LoRAs: FL2V 8-step v1.0, Ref2V 4-step v0.1.
- **Settings:** [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)
  - Default 20 steps; about 25 is suggested for motion.
  - The R2V 4-step turbo is weaker on reference and audio fidelity.
  - Native 16:9 is 1344×768; frame counts are 17k+5.
- **Advanced nodes** (same doc): `MiniMaxH3AddGuide` anchors an image or audio guide at any frame; latent noise masks handle inpainting, removal and extension.
- **Sizes:** each checkpoint is about 21 GB in its smallest quantized form, against about 123.6 GB at full precision. The smallest working set is about 42.5 GB. A 12 GB card with CPU offload works but slowly. [Source](https://dev.to/routeai_official/minimax-h3-is-open-weight-now-heres-whats-actually-downloadable-vs-api-only-441k)
- **Fun ControlNet Union (Alibaba PAI, 24 Aug 2026):** Canny, Depth, HED, MLSD and Pose control, plus mask inpainting. 5–15 s at 24 fps; keep guidance_scale at 1.0; an optional 4-step turbo LoRA. [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fun-controlnet)
- **Licence: MiniMax H3 Community License Agreement, dated 2 Aug 2026.** [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE)
  - **Territory:** "worldwide excluding the European Union, the United Kingdom, the Republic of Korea, and the United States". Use and display outside the territory are not authorized.
  - **Commercial use:** allowed within the territory. Revenue above US$20M a year needs written authorization.
  - **Attribution:** the UI must "prominently display 'MiniMax H3'".
  - **Outputs:** may not be used to improve other models, nor used outside the territory.
  - **Law:** Hong Kong.
  - The HF card says users in the USA, EU, UK or South Korea must fill in an application form. [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- **Comfy's licensing statement:** "Commercial use of locally generated outputs requires a MiniMax commercial license from Comfy," which it calls the only official reseller. Comfy Cloud generations already include commercial rights. [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3)
- **fal endpoints:**
  - Day-0 endpoints `minimax/h3/text-to-video`, `minimax/h3/image-to-video` and `minimax/h3/reference-to-video`. 5–15 s, 24 fps, stereo audio. The landing page shows no prices. [Source](https://fal.ai/minimax-h3)
  - `minimax/h3-max/image-to-video` (released 27 Aug 2026), with first and end image. [Source](https://fal.ai/models/minimax/h3-max/image-to-video)

    | Period | 480p | 768p | 1080p |
    |---|---|---|---|
    | Standard, from 16 Nov 2026 | $0.05/s | $0.08/s | $0.16/s |
    | 1–15 Nov 2026 (30% off) | $0.035/s | $0.056/s | $0.112/s |

  - fal's FAQ describes H3 Max as post-trained for prompt adherence and aesthetics, rendering at 768p, with a 5 s clip in under 3 s. [Source](https://fal.ai/minimax-h3)
- **Quality:**
  - #1 among open models on AA in both T2V and I2V; #4 overall in I2V. [Source](https://artificialanalysis.ai/video/leaderboard/image-to-video)
  - Per a reseller post, AA in July 2026 ranked it #1 in video editing and top 3 in T2V and I2V. [Source](https://dev.to/routeai_official/minimax-h3-is-open-weight-now-heres-whats-actually-downloadable-vs-api-only-441k)

#### HunyuanVideo 1.5 (Tencent)
- **Model card:** [Source](https://huggingface.co/tencent/HunyuanVideo-1.5)
  - Released 20 Nov 2025; 8.3B DiT; licence "tencent-hunyuan-community".
  - T2V and I2V, with no end-frame mode.
  - 480p/720p, with a distilled step to 1080p; 121 frames by default, 24 fps; no audio.
  - Needs at least 14 GB VRAM with offload.
- **Speed-ups:** [Source](https://huggingface.co/tencent/HunyuanVideo-1.5)
  - Step-distilled 480p I2V at 8 or 12 steps: about 75 s per video on one 4090 (vendor claim, 75% faster). 4 steps also works with slightly lower quality.
  - CFG-distilled: about 2×.
  - Sparse attention needs H-series GPUs.
  - The card lists LightX2V and Wan2GP among supported tools.
- **ComfyUI:** native since v0.3.71 (21 Nov 2025) [Source](https://docs.comfy.org/changelog). [Source](https://docs.comfy.org/tutorials/video/hunyuan/hunyuan-video-1-5)
  - Templates `video_hunyuan_video_1.5_720p_t2v` and `video_hunyuan_video_1.5_720p_i2v`.
  - Files: fp16, a 1080p SR distilled model, `qwen_2.5_vl_7b_fp8_scaled` and `byt5_small_glyphxl`.
  - The doc says it runs on 24 GB consumer GPUs, for 5–10 s clips.
- **fal:** `fal-ai/hunyuan-video-v1.5/image-to-video` costs $0.075/s. Resolution isn't stated; the sample file is 480p. [Source](https://fal.ai/models/fal-ai/hunyuan-video-v1.5/image-to-video)
- **Quality:** not on the AA v2.1 board. [Source](https://artificialanalysis.ai/video/leaderboard/image-to-video)

#### SkyReels V3 (Skywork)
- Weights released 29 Jan 2026, licence "skywork-license". Three models: [Source](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B)
  - **R2V-14B:** 720p from 1–4 reference images; 5 s recommended; 24 fps.
  - **V2V-14B:** extends a clip by 5–30 s.
  - **A2V-19B:** talking avatar from a portrait plus up to 200 s of audio, 720p at 24 fps, with multi-character dialogue.
- `--low_vram` (fp8 weight-only plus block offload) is offered for GPUs under 24 GB. ComfyUI is not mentioned. The card credits Wan 2.1 and MultiTalk. [Source](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B)

#### Kandinsky 5.0 (Kandinsky Lab)
- **Models and licence:** MIT. [Source](https://github.com/kandinskylab/kandinsky-5)
  - Video Pro 19B: T2V and I2V, 5 s or 10 s.
  - Video Lite 2B: T2V including a 16-step distilled version, plus I2V.
  - No audio.
  - Lite 5 s runs on 12 GB; the full pipeline needs 24 GB with offload.
- **H100 timings:** Lite distilled takes 35 s for 5 s of video; Pro SFT SD takes 560 s for 5 s. [Source](https://github.com/kandinskylab/kandinsky-5)
- **Release and ranking:** Pro was open-sourced 20 Nov 2025. The authors claim it was the #1 open T2V model on LMArena on 12 Dec 2025. [Source](https://github.com/kandinskylab/kandinsky-5)
- **ComfyUI:** native since v0.4.0 (10 Dec 2025). [Source](https://docs.comfy.org/changelog)

#### LongCat-Video (Meituan)
- MIT, 13.6B dense. Does T2V, I2V, video continuation and minutes-long video at 720p, 30 fps. No audio. The card gives no VRAM figure and doesn't mention ComfyUI. The paper is dated 25 Oct 2025. A "LongCat-Video-Avatar-1.5" Space exists. [Source](https://huggingface.co/meituan-longcat/LongCat-Video)

#### Mochi 1 and CogVideoX (legacy)
- **Mochi 1:** [Source](https://github.com/genmoai/mochi)
  - Apache 2.0, 10B, 480p, text-to-video only.
  - About 60 GB on one GPU in the reference code; ComfyUI runs it in under 20 GB.
  - The newest item is the LoRA trainer from Nov 2024.
- **CogVideoX:** [Source](https://github.com/zai-org/CogVideo)
  - Newest models: CogVideoX1.5-5B and 5B-I2V (8 Nov 2024), 1360×768, 16 fps, 5 or 10 s.
  - Licences: 2B is Apache; 5B uses the CogVideoX licence.
  - Diffusers runs it from about 10 GB (BF16) or 7 GB (INT8).
  - About 550 s per 5 s clip on an H100 (1.5-5B, 50 steps).
- **ComfyUI added CogVideoX natively in v0.21.0** (11 May 2026). [Source](https://docs.comfy.org/changelog)

#### HappyHorse (Alibaba-ATH): open-weights status in conflict
- A reseller (Atlas Cloud) says it was announced 9 Apr 2026 as "fully open-source", 15B, about 38 s on one H100 for 5 s at 1080p, with joint audio. [Source](https://www.atlascloud.ai/blog/tips/happyHorse-hits-1-api-coming-soon)
- **Contradicted:** AA lists HappyHorse 1.0 (1027) and 1.1 (1037) without an open-weights flag [Source](https://artificialanalysis.ai/video/leaderboard/image-to-video), and ComfyUI added it only as an API partner node (v0.20.1) [Source](https://docs.comfy.org/changelog).

### Inferences
- **On the 4090 (24 GB):**
  - LTX-2.5 int8 or NVFP4 distilled is the best fit for open text/image-to-video with sound. It is fast (about 30 s per clip on a 5090 at about 720p) and has first/last frame, but expect a ceiling of about 5–8 s per clip before VAE decode runs out of memory. Tiled decode or the conv VAE may help, unverified.
  - MiniMax H3 is higher quality but about 3× slower and roughly at the 24 GB limit (it peaks at about 32 GB on a 5090). The user already runs it.
  - Wan 2.2 14B with Lightning LoRAs is still the best-supported route for LoRAs and the Wan add-ons, but it is silent.
- **MiniMax H3's licence is a real blocker for a US-based product or user.** The excluded territory covers the US, EU, UK and South Korea; the UI must say "MiniMax H3"; and Comfy says local commercial output needs a licence bought through Comfy. For those users, the fal H3 or H3 Max endpoints, or Comfy Cloud, are the clean path. beatsheet should show this where it offers local H3.
- **Apple silicon:** the int8 "convrot", NVFP4 and fp8 builds that LTX-2.5 and H3 ship for ComfyUI target NVIDIA tensor cores (int8 convrot is also said to run on Turing and newer RTX). The only Mac evidence found is Wan 2.2 14B as GGUF at very low resolution. Realistic Mac options are probably Wan 2.2 5B, Kandinsky Lite or GGUF builds; H3 and LTX-2.5 should be treated as NVIDIA-only until a Mac-specific report appears. The laptop with no GPU should use fal.
- **Native audio among open models:** only H3 and LTX-2.x generate sound. Wan 2.2, Hunyuan 1.5, Kandinsky, LongCat, Mochi and CogVideoX are silent, apart from Wan S2V and SkyReels A2V, which take audio in.
- **Cost:** on fal, the cheapest good-enough open-model route per second is Wan 2.2 at 480p ($0.04) or H3 Max at 480p ($0.05 from 16 Nov). LTX-2.5 Fast at 720p ($0.09) includes audio.

### Gaps
- **Measured 4090 timings:** none found for Wan 2.2 14B with lightx2v at 720p, for MiniMax H3 int8, or for LTX-2.5. The search budget ran out before Reddit-specific searches. The only figures are the 5090 blog, community 3090/4060 reports, and vendor claims.
- **VRAM and quality claims:**
  - Official per-quantization VRAM for H3 and LTX-2.5 isn't published.
  - The "convrot int8 runs on Turing+" claim is from one guide.
- **Apple silicon:** no Mac reports found for LTX-2.5, H3, HunyuanVideo 1.5 or Kandinsky 5. Draw Things' site lists no specific video models.
- **Small H3 features:** what the H3 "PDD LoRA" (ComfyUI v0.35.0) does, and FastH3's measured speed-up.
- **Licences not fully checked:**
  - HunyuanVideo 1.5: the card only names "tencent-hunyuan-community". Earlier Hunyuan licences excluded the EU, UK and South Korea, but that is from memory and not checked for 1.5.
  - SkyReels V3: the terms of "skywork-license" weren't read.
- **Unidentified or unconfirmed models:**
  - Bernini-R (Wan-based, ComfyUI v0.25.0): no details found.
  - HunyuanVideo 2.0: none found.
  - Gemini Omni Flash "open weights": an unverified claim, not on the AA open board.
- **Price conflicts and missing prices:**
  - The two rate sets on the LTX-2.3 fal page.
  - The price of fal's base `minimax/h3/*` endpoints.
- **Wan 2.7 nodes (ComfyUI v0.19.0):** probably API-only, given that no weights exist, but not confirmed.

---

## B1. Lip sync and talking heads: what each takes, limits, fal price, quality, two speakers

### Takeaway
- **Dubbing an existing shot:** sync.so's **sync-3** is the strongest hosted option. It is whole-shot and 4K-native and handles occlusions and profiles. It costs $0.133/s on fal (`fal-ai/sync-lipsync/v3`); lipsync-2-pro is $0.083/s.
- **A still plus audio:** the hosted choices are Kling AI Avatar v2 ($0.056–0.115/s), OmniHuman 1.5 ($0.16/s), VEED Fabric 1.0 ($0.08–0.15/s) and MiniMax H3 Max lip sync. H3 Max is the cheapest at 480p ($0.05/s) and the only one with a published 15-minute limit.
- **Open, on the 4090:** InfiniteTalk (Apache, video or image input, multiple people, streaming long) is the main tool. H3 and LTX-2.x generate dialogue natively from a prompt or a reference.

### Cited Findings
#### Sync.so (sync-3, lipsync-2-pro, lipsync-2)
- **Inputs and how it works:** [Source](https://sync.so/docs/models/sync-3)
  - Video + audio, video + text (TTS), image + audio or image + text. Only sync-3 accepts an image.
  - sync-3 renders the face natively at 4K and processes the whole shot at once. The lipsync-2 models work in 2 s chunks with a 512×512 face crop.
  - sync-3 handles close-ups, extreme angles, and hands or mics in front of the mouth, and covers 95+ languages.
- **Prices on sync.so at 25 fps:** sync-3 $0.107–0.133/s; lipsync-2-pro $0.067–0.083/s; lipsync-2 $0.04–0.05/s. The free tier caps a generation at 15 s. [Source](https://sync.so/docs/models/sync-3)
- **Several speakers:** pick one by `coordinates` on frame 0. Auto-detect doesn't work for image input. [Source](https://sync.so/docs/models/sync-3)
- **fal `fal-ai/sync-lipsync/v3`:** $8/min (about $0.133/s). Video + audio only, with no image field. `sync_mode` is cut_off, loop, bounce, silence or remap. [Source](https://fal.ai/models/fal-ai/sync-lipsync/v3/llms.txt)
- **fal `fal-ai/sync-lipsync/v2/pro`:** $5/min (about $0.083/s), video + audio. [Source](https://fal.ai/models/fal-ai/sync-lipsync/v2/pro)
- **ComfyUI:** added a sync.so sync-3 partner node in v0.28.0 (15 Jul 2026). [Source](https://docs.comfy.org/changelog) Sync's own ComfyUI plugin docs, dated May 2026, predate sync-3. [Source](https://sync.so/docs/plugins-and-extensions/comfy-ui)
- **Weights:** closed.

#### ByteDance OmniHuman 1.5 / 2.0
- **fal `fal-ai/bytedance/omnihuman/v1.5`:** $0.16/s for an image + audio, with an optional prompt. [Source](https://fal.ai/models/fal-ai/bytedance/omnihuman/v1.5)
- **Output and length:** 720p or 1080p, with a turbo mode. Audio up to 60 s at 720p. The original OmniHuman was $0.14/s. (fal article, updated Jan 2026) [Source](https://fal.ai/learn/biz/omnihuman-15-vs-omnihuman-comparison)
- **Several people:** a mask index picks which person to drive; one audio track doesn't drive several performances. (third-party) [Source](https://inference.sh/blog/tools-omnihuman-avatar-generation)
- **OmniHuman 2.0 is unverified.** An aggregator lists `bytedance/omnihuman/v2` on fal at $0.105/s, Oct 2026, with multiple people, 720p and 30–300 s. [Source](https://www.llmreference.com/model/omnihuman-2.0/fal-api)

#### Kling AI Avatar v2 and Kling lip sync
- **AI Avatar v2 on fal:** `fal-ai/kling-video/ai-avatar/v2/pro` $0.115/s and `.../v2/standard` $0.0562/s. Image + audio with an optional prompt; output runs as long as the audio. [Source](https://fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro)
- **Lip sync on fal:** `fal-ai/kling-video/lipsync/audio-to-video` is $0.014 per input-video second, rounded up to 5 s. [Source](https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video)
  - Video: 2–10 s, 100 MB or less, 720–1920 px.
  - Audio: 2–60 s.
- **ComfyUI:** KlingAvatar partner node since v0.15.0 (24 Feb 2026). [Source](https://docs.comfy.org/changelog)
- **KlingAvatar 2.0 tech report (Dec 2025):** up to 5 min, with per-character masks and audio. Not confirmed as a product. [Source](https://www.emergentmind.com/papers/2512.13313)
- **Vendor comparison (PiAPI):** Kling Avatar had more accurate mouths; OmniHuman 1.5 had steadier motion. [Source](https://piapi.ai/en/blogs/omnihuman-1-5-vs-kling-ai-avatar)

#### MiniMax H3 Max lip sync (fal)
- **Endpoint:** `minimax/h3-max/lip-sync/image-to-video`. Prices from fal's guide of 21 Oct 2026; clips over 15 s cost 1.2×. [Source](https://fal.ai/learn/tools/how-to-lip-sync-ai-videos-with-audio-using-an-api)

  | 480p | 768p | 1080p | 2K |
  |---|---|---|---|
  | $0.05/s | $0.08/s | $0.16/s | $0.32/s |

- **Inputs and limits:** a portrait + audio of 5 s to 15 min, with an optional transcription. Image aspect ratio 0.4–2.5. Closed eyes in the portrait stay closed for the whole clip. [Source](https://fal.ai/learn/tools/how-to-lip-sync-ai-videos-with-audio-using-an-api)

#### VEED Fabric 1.0 and VEED Lipsync
- **`veed/fabric-1.0`:** $0.08/s at 480p, $0.15/s at 720p, for an image + audio. A `/fast` variant exists, with no price shown. [Source](https://fal.ai/models/veed/fabric-1.0)
- **`veed/lipsync`:** $0.40/min for video + audio. The researcher flagged this price as implausibly low; verify it. [Source](https://fal.ai/models/veed/lipsync)
- **ComfyUI:** added VEED Fabric 1.0, VEED Lipsync 2.0 and VEED Dubbing as partner nodes (v0.42.4 on 22 Oct 2026; v0.43.1 on 28 Oct 2026). [Source](https://docs.comfy.org/changelog)
- **VEED's own test:** Fabric ranked first against Kling V2 Pro, HeyGen, OmniHuman 1.5 and Hedra. This is a vendor test, and sync-3 was not included. [Source](https://www.veed.io/learn/best-lipsync-api)

#### InfiniteTalk and MultiTalk (open, MeiGen)
- **InfiniteTalk:** Apache-2.0, built on Wan2.1-I2V-14B-480P, released 19 Aug 2025. [Source](https://github.com/MeiGen-AI/InfiniteTalk)
  - Works video-to-video (dubbing) and image-to-video; a separate checkpoint handles several people.
  - 480p or 720p.
  - Default 1000 frames (40 s). Streaming has no length limit, but image-to-video drifts in colour after about a minute.
  - fp8 build and low-VRAM flags; ComfyUI through Kijai's WanVideoWrapper.
- **ComfyUI added Multi/InfiniteTalk for LTXV natively** in v0.11.0 (27 Jan 2026). [Source](https://docs.comfy.org/changelog)
- **Prices:**
  - fal `fal-ai/infinitetalk` exists, but no price was visible. [Source](https://fal.ai/models/fal-ai/infinitetalk)
  - WaveSpeed's multi-person version: $0.03/s at 480p, $0.06/s at 720p, 5 s minimum. [Source](https://wavespeed.ai/docs/docs-api/wavespeed-ai/infinitetalk-multi)
- **MultiTalk** runs 480p on a single 4090 in low-VRAM mode. [Source](https://huggingface.co/spaces/erizotesla4000/Meigen-MultiTalk/blob/main/ORIGINAL_README.md)

#### HuMo (ByteDance, open)
- **Model:** Apache-2.0. Takes text + image, text + audio, or text + image + audio. Comes in 1.7B and 17B; uses Whisper Large V3 for audio. [Source](https://comfyui-wiki.com/en/models/humo/humo)
- **Files on Comfy-Org:** 1.7B fp16 is 3.48 GB; 17B fp16 is 34.1 GB; 17B fp8 is 17.1 GB. [Source](https://huggingface.co/Comfy-Org/HuMo_ComfyUI/tree/main)
- **ComfyUI:** native since v0.3.60 (23 Sep 2025). [Source](https://docs.comfy.org/changelog)
- **Output:** 480p/720p, up to 97 frames at 25 fps (about 3.9 s). [Source](https://www.producthunt.com/products/humo-human-centric-video-generation/launches)

#### SkyReels V3 A2V-19B (open)
- Portrait + up to 200 s of audio, 720p at 24 fps, multi-character dialogue, `--low_vram` mode. [Source](https://huggingface.co/Skywork/SkyReels-V3-A2V-19B)

#### Native dialogue in open generators
- **MiniMax H3:** 32 kHz stereo audio with dialogue in 11 languages. Ref2VA takes up to 3 audio clips as voice references. [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- **Measured two-speaker test (5090, n=1):** H3 had a 0% character error rate; LTX-2.5 had 9.52%, dropping two characters. [Source](https://ai-muninn.com/en/blog/ltx25-vs-minimax-h3-rtx5090)
- **LTX-2.5 audio-to-video on fal:** video driven by supplied audio. [Source](https://fal.ai/ltx-2.5)
  - `lightricks/ltx-2.5/audio-to-video/pro`: $0.17 per second of input audio.
  - `/fast`: $0.13 per second.
- **LTX-2.3 LipDub IC-LoRA** (`Lightricks/LTX-2.3-22b-IC-LoRA-LipDub`) re-dubs footage with new dialogue from a text prompt. It keeps identity and head motion and does not translate. [Source](https://www.runcomfy.com/comfyui-workflows/ltx-2-3-iclora-lipdub-in-comfyui-precise-lip-sync-video-creation)
- Lightricks distinguishes LipDub from "lipsync", which makes new video to fit given audio. [Source](https://ltx.io/blog/lipsync-vs-lipdub)

#### Hedra Character-3 and HeyGen
- **Hedra:** no fal endpoint found. About 6 credits per second on Hedra; Avatar and Omnia were merged into Character-3 in Jul 2026. [Source](https://dailyaifixs.com/blog/hedra-pricing-2026-credits-burn-by-the-second); [Source](https://www.usagepricing.com/blueprint/activity/hedra-2026-07-29-character-3-hailuo-lineup)
- **HeyGen API (third-party prices; HeyGen's own pricing page returned 404):** Avatar IV about $0.05/s; Avatar V and Digital Twin about $0.0667/s. Not on fal. [Source](https://www.g2.com/articles/heygen-api-pricing)
- **HeyGen in ComfyUI:** partner nodes for avatar, talking photo and translation since v0.28.1 (17 Jul 2026). [Source](https://docs.comfy.org/changelog)
- **Independent paper (Avatar V, Jun 2026):** Kling O3 Pro had worse lip sync (Sync-D 10.07, lower is better) than OmniHuman 1.5 (8.25). [Source](https://arxiv.org/pdf/2606.13872)

### Inferences
- **Dubbing an existing clip:** use sync-3 on fal for hard shots (close-ups, occlusion, profile), lipsync-2-pro for easy ones, and Kling lipsync for cheap clips of 10 s or less.
- **A still plus audio:** H3 Max lip sync at 480p/768p or Kling Avatar v2 standard are the cheapest; OmniHuman 1.5 is a premium alternative.
- **Two speakers:** InfiniteTalk multi (open) and SkyReels A2V (open) are built for it. Otherwise generate the dialogue natively with H3 (0% error rate in the one test) rather than lip-syncing afterwards. Sync.so handles several faces only one speaker at a time, chosen by coordinates.
- **Hardware:** none of the open lip-sync models is realistic on the GPU-less laptop, and the 14B and 19B ones are likely impractical on the Mac.

### Gaps
- **Veo and Sora dialogue:** native dialogue in Veo 3.x and Sora 2 (quality, limits, fal ids, price) was not researched.
- **Missing fal prices:** `fal-ai/infinitetalk`, `fal-ai/sync-lipsync/v2` (plain) and `veed/fabric-1.0/fast`.
- **No fal endpoint found** for HuMo, MultiTalk, SkyReels A2V, Hedra or HeyGen.
- **Unverified products and features:**
  - OmniHuman 2.0 on fal: aggregator only.
  - Kling 3.0's three-person dialogue lip sync: third-party claim.
  - LongCat-Video-Avatar-1.5: a Space exists, but no details found.
- **No 4090 VRAM or timing figures** for InfiniteTalk multi or SkyReels A2V.

---

## B2. Motion transfer and character swap

### Takeaway
- **Locally:** SCAIL-2 (native in ComfyUI since June 2026, animate and replace modes) and **Wan-Animate-2** (Apache, 7 Aug 2026, native since v0.31.0, with a new text-driven camera viewpoint) cover the 4090.
- **Hosted:** Wan 2.2 Animate on fal is cheapest ($0.04–0.08 per 16-frame "second"). Kling v3 Motion Control ($0.126–0.168/s) handles driving clips up to 30 s. Higgsfield Genjutsu and Runway Act-Two are not on fal.

### Cited Findings
- **SCAIL-2 (zai-org):** built on Wan2.1 14B. It drives the character end to end, without skeleton maps, and handles several characters. [Source](https://comfyui-wiki.com/en/news/2026-06-09-scail-2-character-animation); [Source](https://docs.comfy.org/changelog)
  - Native ComfyUI support merged 9 Jun 2026; ComfyUI v0.25.0 came 16 Jun.
  - Multi-reference arrived in v0.26.0.
- **SCAIL-2 nodes and settings:** `WanSCAILToVideo`, `SCAIL2ColoredMask` and SAM3 tracking. [Source](https://docs.comfy.org/tutorials/video/zai/scail2)
  - `replace_mode` true means replace (the default); false means animate.
  - Segments are 81 frames with a stride of 76, and each extension has to be queued by hand.
  - **Conflict on dimensions:** the wiki says 512p/704p with sides divisible by 32 [Source](https://comfyui-wiki.com/en/news/2026-06-09-scail-2-character-animation); the docs say divisible by 16, with an 896×512 example [Source](https://docs.comfy.org/tutorials/video/zai/scail2).
- **SCAIL-2 quantized and hosted:**
  - A community GGUF at Q4_K_M is 11.5 GB. [Source](https://huggingface.co/Abiray/SCAIL-2-GGUF)
  - No fal endpoint. WaveSpeed hosts `wavespeed-ai/scail-2` [Source](https://wavespeed.ai/models/wavespeed-ai/scail-2/llms.txt). RunComfy says "from $0.04/video-second", 480p/720p, up to 120 s [Source](https://www.runcomfy.com/models/zai-org/scail).
- **Wan 2.2 Animate on fal:** [Source](https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/move); [Source](https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace)
  - Endpoints: `fal-ai/wan/v2.2-14b/animate/move` (animate) and `.../animate/replace` (puts the character into the video, matching its light and colour). Each takes a video + image + prompt and has a turbo option.
  - Price per "second", where a second is 16 frames: $0.08 at 720p, $0.06 at 580p, $0.04 at 480p.
  - So a 5 s clip at 60 fps bills as 18.75 s, or $1.50 at 720p.
- **Wan-Animate-2 (Wan2.2-Animate-2-14B):** released 7 Aug 2026, Apache-2.0. [Source](https://huggingface.co/Wan-AI/Wan2.2-Animate-2-14B)
  - Base and distilled weights; the distilled one runs 10 steps without CFG.
  - Inputs: reference image + driving video + prompt.
  - Adds a text-driven camera viewpoint, separate from the driving video's.
  - Targets 720p (480p also tested); defaults are tuned for 8×A800.
  - A real-time "Lite" model is described, without weights.
- **Wan-Animate-2 in ComfyUI:** native in v0.31.0 (7 Aug 2026) [Source](https://docs.comfy.org/changelog), with repackaged files at Comfy-Org/Wan-Animate-2 [Source](https://huggingface.co/Comfy-Org/Wan-Animate-2). The HF card still lists ComfyUI as a to-do.
- **Kling Motion Control on fal:** [Source](https://fal.ai/kling-motion-control)

  | Endpoint | Price |
  |---|---|
  | `fal-ai/kling-video/v3/pro/motion-control` | $0.168/s |
  | `fal-ai/kling-video/v3/standard/motion-control` | $0.126/s |
  | `fal-ai/kling-video/v2.6/standard/motion-control` | $0.07/s |

  - Inputs: character image + driving video + prompt.
  - Driving video up to 30 s when orientation comes from the video, 10 s when it comes from the image.
  - The ComfyUI partner node has existed since v0.7.0 (31 Dec 2025). [Source](https://docs.comfy.org/changelog)
- **Runway Act-Two:** moves a performer's face, body and speech onto a still image or a reference video. About 5 credits/s, roughly $0.05/s, per a third party (2026-10-18). Not on fal. [Source](https://www.developersdigest.tech/models/video-generation/runway)
- **Higgsfield Genjutsu:**
  - Two modes: Motion Transfer (new cast and location, same motion and camera) and Object Swap. The source clip must be 4–30 s. [Source](https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-genjutsu)
  - ComfyUI partner node `HiggsfieldMotionTransferNode` since v0.40.0: 1–8 reference images, 480p/720p/1080p, keeps the source audio. No price found, and not on fal. [Source](https://docs.comfy.org/tutorials/partner-nodes/higgsfield/genjutsu-motion-transfer)
- **Viggle:** about $0.01/s through the API, from secondary sources only. Not on fal. [Source](https://tooliverse.ai/tools/viggle)
- **Wan-Dancer-14B (music to dance):** Apache-2.0, reference image + music to dance up to about 1 minute. [Source](https://comfyui-wiki.com/en/news/2026-07-13-wan-dancer-14b-music-to-dance)
  - Official ComfyUI workflow with `wan2.2_dancer_14b_global/local_fp8_scaled` and the lightx2v LoRA; samples 149 frames at once. [Source](https://docs.comfy.org/tutorials/video/wan/wan-dancer)
  - **Date conflict:** weights were reported released 13 Jul 2026 [Source](https://comfyui-wiki.com/en/news/2026-07-13-wan-dancer-14b-music-to-dance), but ComfyUI's changelog lists "Wan-Dancer" in v0.21.0 on 11 May 2026 [Source](https://docs.comfy.org/changelog).
- **Related open control for Wan in ComfyUI:** WanMove, trajectory motion (v0.5.0, 17 Dec 2025); Uni3C camera ControlNet (v0.29.0, 29 Jul 2026). [Source](https://docs.comfy.org/changelog)

### Inferences
- **Locally:** SCAIL-2 and Wan-Animate-2 are the two to support. Wan-Animate-2's separate camera viewpoint is new and useful for a "same performance, new angle" shot.
- **Hosted billing:** Wan 2.2 Animate on fal bills per 16 frames, so a 24 fps source costs 1.5× the headline rate.
- **For drives longer than about 10 s,** Kling v3 Motion Control (30 s) or Genjutsu (30 s) avoids stitching segments.

### Gaps
- **No fal endpoint found** for SCAIL-2, Wan-Animate-2, Act-Two, Viggle or Genjutsu.
- **Missing figures:**
  - Genjutsu's price.
  - Kling Motion Control's output resolution.
  - Wan-Animate-2's length limits, VRAM and animate/replace modes.
  - 4090 timings for SCAIL-2, Wan-Animate-2 and Wan-Dancer.
- **SCAIL-2's licence** wasn't confirmed on its model card.

---

## B3. Video editing and restyling (video in, edited video out)

### Takeaway
Hosted edit models multiplied in 2026. Notable ones on fal:
- Kling O3 edit ($0.168/s, 3–10 s) and Kling O3 4K edit ($0.42/s).
- Kling 4.0 edit (3–30 s, $0.094–0.141/s, but billed on at least twice the output).
- Luma Ray 3.2 video-to-video ($0.72–4.32 per 5 s).
- Wan 2.7 edit ($0.10–0.15/s).
- Gemini Omni Flash 1.1 edit ($0.03–0.30/s).
- HappyHorse edit and Bria Video Eraser.

Runway Aleph 2 (about $0.28/s, 30 s) is not on fal. **Two fal endpoints are deprecated on 2026-11-05**: Luma Ray 2 Modify and Decart Lucy Edit Pro.

Open options on the 4090: Wan VACE, the LTX-2.3/2.5 IC-LoRAs (clean plate, outpaint, relight), MiniMax H3 Fun ControlNet and masks, and ID-V2V.

### Cited Findings
- **Runway Aleph 2:**
  - Restyle, relight, add or remove things, and change the viewpoint while keeping motion and timing. No masks needed. [Source](https://comfy.icu/node/RunwayAleph2VideoToVideoNode)
  - ComfyUI node: 2–30 s input at 30 fps or below; output matches input resolution; up to 5 keyframes or 5 prompt images. [Source](https://comfy.icu/node/RunwayAleph2VideoToVideoNode)
  - Price: about $0.28/s on Runway's API and OpenRouter (`runway/aleph-2`) [Source](https://openrouter.ai/compare/black-forest-labs/flux-video-edit/runway/aleph-2); the ComfyUI node badge shows about $0.40/s. **Conflict.**
  - ComfyUI added the node in v0.25.0 (16 Jun 2026). [Source](https://docs.comfy.org/changelog) No fal endpoint found.
- **Kling O3 edit on fal:**
  - `fal-ai/kling-video/o3/pro/video-to-video/edit`: $0.168 per generated second. Source clip 3–10 s at 720–2160 px; prompts refer to `@Video1`, `@Image1` and `@Element1`; keeps the original audio. [Source](https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit); [Source](https://fal.ai/learn/tools/how-to-edit-videos-with-ai)
  - `fal-ai/kling-video/o3/4k/video-to-video/edit`: $0.42/s, native 4K. Input 3–15 s, up to 200 MB; up to 4 references or elements. [Source](https://fal.ai/models/fal-ai/kling-video/o3/4k/video-to-video/edit/llms.txt)
  - Kling O1 edit is at `fal-ai/kling-video/o1/video-to-video/edit`. [Source](https://fal.ai/docs/model-api-reference/video-generation-api/kling-video-o1-video-to-video.md)
- **Kling 4.0 edit on fal (`kling/v4/video-to-video/edit`):** [Source](https://fal.ai/models/kling/v4/video-to-video/edit/llms.txt)
  - Input 3–30 s, 700–4553 px, 24–60 fps.
  - Output 720p or 1080p.
  - Up to 4 reference videos, 7 elements and 3 voice ids.
  - $0.094/s at 720p, $0.141/s at 1080p. Billed seconds are input plus output, never less than twice the output.
  - Launched 15 Oct 2026; API from 21 Oct. [Source](https://aireiter.com/ja/blog/kling-4-0-api-pricing-fal-cost-vs-seedance-vidu)
- **Luma:**
  - `fal-ai/luma-dream-machine/ray-2/modify`: $0.35/s, **deprecated 2026-11-05**. [Source](https://fal.ai/models/fal-ai/luma-dream-machine/ray-2/modify)
  - `luma/agent/ray/v3.2/video-to-video`: `edit_strength` has adhere, flex and reimagine bands; it can condition on pose, depth, normals, trajectory or face; up to 64 keyframes; 5 s or 10 s output. [Source](https://fal.ai/models/luma/agent/ray/v3.2/video-to-video/llms.txt)

    | Length | 540p | 720p | 1080p | HDR 1080p |
    |---|---|---|---|---|
    | 5 s | $0.72 | $1.08 | $2.16 | $4.32 |
    | 10 s | $1.44 | $2.16 | $4.32 | $8.64 |

- **Wan VACE (open):**
  - fal `fal-ai/wan-vace-14b`: $0.08/s at 720p, $0.06 at 580p, $0.04 at 480p, counted at 16 fps. [Source](https://fal.ai/models/fal-ai/wan-vace-14b)
  - ComfyUI native template with `wan2.1_vace_14B_fp16`: masked replacement and extension. [Source](https://docs.comfy.org/ja/tutorials/video/wan/vace.md)
  - Anecdotes: 24 GB or more for the full 14B [Source](https://www.promptus.ai/blog/comfyui-wan-video-ai-generation-guide); GGUF builds on 8 GB cards [Source](https://reddit.birdcat.cafe/r/StableDiffusion/comments/1koefcg/new_wan21vace14bggufs).
- **Wan 2.7 edit on fal (`fal-ai/wan/v2.7/edit-video`):** [Source](https://fal.ai/models/fal-ai/wan/v2.7/edit-video/llms.txt)
  - Input 2–10 s; output 720p or 1080p; optional reference image; keep or regenerate the audio.
  - $0.10/s at 720p, $0.15/s at 1080p. The model page's FAQ says $0.10/s flat, which conflicts.
- **HappyHorse 1.0 edit on fal (`alibaba/happy-horse/video-edit`):** [Source](https://fal.ai/models/alibaba/happy-horse/video-edit)
  - Global edits (style, season, light) and local swaps.
  - Input 3–60 s, but output is capped at 15 s; up to 5 references.
  - **The page gives two prices:** $0.14/$0.28 per second at 720p/1080p, or double that if billed on input plus output.
- **Gemini Omni Flash 1.1 edit on fal (`google/gemini-omni-flash/v1.1/edit`):** instruction-based, consistent across successive edits. [Source](https://fal.ai/models/google/gemini-omni-flash/v1.1/edit)

  | 360p | 720p | 1080p | 4K |
  |---|---|---|---|
  | $0.03/s | $0.10/s | $0.15/s | $0.30/s |

- **FLUX Video Edit (BFL, 10 Sep 2026):** changes one thing per clip and leaves length, framing and audio alone. About $0.03/s per news and OpenRouter. The fal page (`blackforestlabs/flux-video-edit`) shows no price. [Source](https://hermes-ai.net/news/black-forest-labs-flux-video-edit-surgically-changes-clips-for-0-03-a-second/); [Source](https://fal.ai/models/blackforestlabs/flux-video-edit) ComfyUI node since v0.35.2. [Source](https://docs.comfy.org/changelog)
- **Decart Lucy Edit Pro (`decart/lucy-edit/pro`):** $0.15/s at 720p, $0.10/s at 480p. **Deprecated 2026-11-05.** [Source](https://fal.ai/models/decart/lucy-edit/pro) The open Lucy-Edit-Dev is built on Wan 2.2 5B. [Source](https://huggingface.co/decart-ai/Lucy-Edit-Dev/blob/main/README.md)
- **LTX-2.3 "Creative Lab" IC-LoRAs (open, 22B):** in/outpainting, Clean-Plate (removal), Relight, Day-to-Night, Colorization, Deblur, Decompression, Pixel-Spatial-Upscaler, Ingredients, Foley-V2A. No restyle LoRA. [Source](https://huggingface.co/collections/Lightricks/ltx-23-creative-lab) "EditAnything" is a community LoRA. [Source](https://huggingface.co/Alissonerdx/EditAnything)
- **Bria Video Eraser on fal:**
  - `bria/bria_video_eraser/erase/mask`: video + mask, both under 5 s; $0.14/s. [Source](https://fal.ai/models/bria/bria_video_eraser/erase/mask/llms.txt)
  - Prompt and keypoint variants also exist. [Source](https://fal.ai/models/bria/bria_video_eraser/erase/prompt/llms.txt)
- **MiniMax H3 for editing (open):**
  - Fun ControlNet Union handles control and mask inpainting. [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-fun-controlnet)
  - Native latent noise masks handle inpainting, removal and extension. [Source](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native)
  - Reportedly #1 in video editing on AA (Jul 2026). [Source](https://dev.to/routeai_official/minimax-h3-is-open-weight-now-heres-whats-actually-downloadable-vs-api-only-441k)
- **ID-V2V (Eyeline/Netflix, open):** restyles from a stylized keyframe while keeping each person's likeness; built on Wan 2.1 I2V + VACE. [Source](https://huggingface.co/gubernac/ID-V2V)
  - Supported through Kijai's ComfyUI PR, with int8 weights and about 16 GB or more (secondary report). [Source](https://comfyui-wiki.com/en/news/2026-07-29-id-v2v-comfyui-support)
  - ComfyUI v0.38.0. [Source](https://docs.comfy.org/changelog)

### Inferences
- **Don't hard-code** `ray-2/modify` or `lucy-edit/pro`; both go away on 2026-11-05.
- **Kling 4.0's real cost** is about $0.19 (720p) to $0.28/s (1080p) once the twice-the-output minimum is applied.
- **Cheapest draft edits:** Gemini Omni at 360p, or FLUX Video Edit (about $0.03/s).
- **Clips of 15–30 s:** Aleph 2 or Kling 4.0; the others need chunking.
- **Locally on the 4090:** LTX IC-LoRAs (clean plate, outpaint, relight) and H3 masks cover removal and extension; VACE or ID-V2V cover restyling.

### Gaps
- No fal endpoint for Runway Aleph or Aleph 2.
- FLUX Video Edit's fal price and limits.
- Kling O3 standard and O1 edit prices.
- Gemini Omni input length limits.
- Licences and VRAM for the LTX IC-LoRAs and H3 ControlNet.
- Whether Kling 4.0 edit keeps the original audio.

---

## B4. Upscaling and frame interpolation

### Takeaway
- **Locally on the 4090:** ComfyUI now runs **SeedVR2** natively (v0.28.0, Jul 2026) and **RIFE/FILM** natively (v0.20.1, Apr 2026), so upscaling and interpolation are effectively free. LTX-2.5 and HunyuanVideo 1.5 also ship their own latent or SR upscalers.
- **On fal, cheapest:** FlashVSR ($0.0005/MP) and SeedVR2 ($0.001/MP).
- **On fal, conservative (no invented detail):** Topaz Precision/Proteus ($0.10–0.60 per 10 s).
- **On fal, generative:** Topaz Starlight/Astra and FLUX Video Upscale. These invent detail, so avoid them on likeness-critical shots.

### Cited Findings
- **Topaz on fal:**
  - **Starlight (`topaz/upscale/video/generative`):** models Precise 2.6, HQ, Mini, Sharp and Fast 2; 1–4×; `target_fps` 16–60 interpolates. Per 10 s: [Source](https://fal.ai/models/topaz/upscale/video/generative/llms.txt)

    | Model | 30 fps, up to 1080p | 30 fps, 4K | 60 fps, up to 1080p | 60 fps, 4K |
    |---|---|---|---|---|
    | Precise 2.6, HQ, Mini, Sharp | $1.20 | $2.60 | $2.40 | $5.10 |
    | Fast 2 | $0.60 | $1.30 | $1.20 | $2.60 |

  - **Precision (`topaz/upscale/video/precision`):** Proteus, Artemis, Iris and others. $0.10 per 10 s at 720p, $0.20 at 1080p, $0.60 at 4K. [Source](https://fal.ai/models/topaz/upscale/video/precision)
  - **Creative, Astra 2 (`topaz/upscale/video/creative`):** $3–10 per 10 s. [Source](https://fal.ai/models/topaz/upscale/video/creative)
  - Sources can be up to 5 min long. [Source](https://fal.ai/learn/tools/video-to-video-upscalers)
- **SeedVR2 (ByteDance, Apache-2.0):**
  - Native in ComfyUI v0.28.0 (15 Jul 2026). [Source](https://comfyui-wiki.com/en/news/2026-07-15-comfyui-v0-28-0)
  - Templates: "SeedVR2 3B Int8: Upscale Video" plus 3B and 7B image templates. Checkpoints in fp16, fp8 and int8_convrot. [Source](https://docs.comfy.org/tutorials/utility/seedvr2.md)
  - Known issue: int8 with FlashAttention can give black frames (seen on a 3090). [Source](https://docs.comfy.org/tutorials/utility/seedvr2.md)
  - Custom-node README, on a 4090: 3B FP8 from 854×480 to 1080p at batch 5 takes about 82 s. Batch 5 or more is needed for temporal consistency, and larger batches need more than 24 GB. [Source](https://huggingface.co/numz/SeedVR2_comfyUI/blob/b77d5dd95dba3f25e3a28064b76e6028a5152368/README.md)
  - fal `fal-ai/seedvr/upscale/video`: $0.001 per megapixel; a 1080p, 121-frame output is about $0.25. [Source](https://fal.ai/models/fal-ai/seedvr/upscale/video)
- **FlashVSR:**
  - fal `fal-ai/flashvsr/upscale/video`: $0.0005/MP; a 1080p, 121-frame output is $0.125. [Source](https://fal.ai/models/fal-ai/flashvsr/upscale/video)
  - Open repo: one-step 4×, about 17 fps at 768×1408 on an A100. It needs Block-Sparse-Attention; some ComfyUI ports fall back to dense attention and lose quality. [Source](https://www.sourcepulse.org/projects/17134939)
- **FLUX Video Upscale (`blackforestlabs/flux-video-upscale`):** [Source](https://fal.ai/models/blackforestlabs/flux-video-upscale)

  | Mode | 1080p | 2K | 4K |
  |---|---|---|---|
  | Precise | $0.084/s | $0.15/s | $0.33/s |
  | Creative | $0.12/s | $0.21/s | $0.474/s |

  - fal's article of 24 Aug 2026 listed higher prices (Precise $0.14/$0.25/$0.55) and an input limit of MP4, 20 s or less, 50 MB or less. [Source](https://fal.ai/learn/tools/video-to-video-upscalers)
- **Clarity Crystal (`clarityai/crystal-video-upscaler`):** $0.10 per megapixel per second; 2× above 30 fps, 3× up to 90 fps. Output within 5K. [Source](https://fal.ai/models/clarityai/crystal-video-upscaler)
- **ByteDance upscaler:**
  - fal `fal-ai/bytedance-upscaler/upscale/video` (standard tier): $0.0072/s at 1080p, $0.0144 at 2K, $0.0288 at 4K. 60 fps doubles these; Pro is 10×. [Source](https://fal.ai/learn/tools/video-to-video-upscalers)
  - ComfyUI vCube node: input up to 2560×1440, output 720p–8K, interpolation to 120 fps. [Source](https://docs.comfy.org/built-in-nodes/ByteDanceVideoEnhanceNode.md)
- **Other fal upscalers:**
  - Bria `bria/video/increase-resolution`: $0.14/s, 2× or 4×, up to 8K, input under 30 s. [Source](https://fal.ai/learn/tools/video-to-video-upscalers)
  - Real-ESRGAN `fal-ai/video-upscaler`: $0.0008/MP, frame by frame. [Source](https://fal.ai/learn/tools/video-to-video-upscalers)
- **Magnific:** own API only, billed per frame; no rates published. [Source](https://docs.magnific.com/api-reference/video/video-upscaler/overview)
- **RIFE/FILM:**
  - ComfyUI added native RIFE and FILM frame interpolation in v0.20.1 (27 Apr 2026). [Source](https://docs.comfy.org/changelog)
  - The `FrameInterpolate` node multiplies by 2–16; output frames = (input − 1) × multiplier + 1. [Source](https://docs.comfy.org/built-in-nodes/FrameInterpolate.md)
  - The custom Fannovel16 pack adds GMFSS, IFRNet and AMT. [Source](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation)
- **Upscalers built into the generators:**
  - LTX-2.5: x2 latent spatial and x2 latent temporal upscalers, plus a Pixel Spatial Upscaler IC-LoRA (DFR, up to 4K). [Source](https://comfyui-wiki.com/en/news/2026-08-11-ltx-2-5-open-weights-release)
  - HunyuanVideo 1.5: a 1080p SR distilled model. [Source](https://docs.comfy.org/tutorials/video/hunyuan/hunyuan-video-1-5)
  - H3's 2K pass is API-only. [Source](https://huggingface.co/MiniMaxAI/MiniMax-H3)

### Inferences
- **Locally:** SeedVR2 3B int8 for upscaling plus native RIFE for frame rate.
- **On fal:** FlashVSR or SeedVR2 for cheap passes; Topaz Precision for faces of real people, since it is not generative.
- **Expect flicker** from Real-ESRGAN, because it treats each frame independently.

### Gaps
- No VRAM figures for native SeedVR2 3B and 7B.
- No confirmed Apple-silicon support for SeedVR2, FlashVSR or RIFE in ComfyUI.
- Topaz's maximum input resolution on fal.
- Absolute prices for vCube.
- fal model-page prices for the ByteDance, Bria and Real-ESRGAN upscalers; those prices come only from fal's August 2026 article.
