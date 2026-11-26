/**
 * ComfyUI, on this computer or another one on the network: workflows beatsheet runs on the person's own hardware
 * (SCAIL-2 and Wan 2.2 Animate, which copy the movement in a clip onto the people in a picture, Wan 2.2 and MiniMax
 * H3 from a picture alone, InfiniteTalk, which makes a picture say a line, and FLUX 3 Image Klein's stills). A workflow
 * is ComfyUI's API export (File → Export (API)) with the nodes beatsheet fills titled STUDIO_*: the picture (and one to
 * end on), a still's reference pictures (STUDIO_REF_IMAGE_1, _2…), the clip to follow, the sound to say, the seed, the
 * size, the length, the prompt and the output. A
 * STUDIO_END_IMAGE left empty is taken out, with the inputs it fed, and so are the reference pictures a still isn't
 * given. The ones that ship are in packages/engine/comfy; the person's own exports, in the comfy folder beside
 * beatsheet's settings, take their place.
 *
 * Each workflow says what it needs to run: an NVIDIA card for fp8 weights, or Apple silicon too for the small Wan, and
 * about how much memory. The ComfyUI that's connected is checked against that (from what it says it runs on) and for
 * the nodes and model files its workflows name, which beatsheet can fetch into a ComfyUI on this computer (with the
 * person's Hugging Face token, for files shared only once their license is accepted). With none connected, this
 * computer is checked instead, so a laptop that couldn't run any of it says so and points at another.
 *
 * beatsheet makes the prompt id itself and saves it on the job before sending, so a restarted engine follows the same
 * render rather than queueing another, and a restarted ComfyUI (which forgets its queue) is sent the saved prompt
 * again. Written against ComfyUI 0.39's own API: /prompt, /api/jobs, /history, /queue, /view, /upload/image,
 * /system_stats, /object_info, /models and /internal/folder_paths.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { Quality, ServiceState, Unusable } from "@beatsheet/schema";
import { FalError } from "./fal.ts";
import { pictureBytes } from "./media.ts";
import { RESOURCES } from "./paths.ts";
import { download, type Download } from "./pyenv.ts";
import { gpu } from "./sam-cuda.ts";
import { SETTINGS_DIR, getSecret, readSettings, updateSettings } from "./settings.ts";

const exec = promisify(execFile);

/** Where ComfyUI is when nobody has said otherwise: its own default, on this computer. */
export const COMFY_DEFAULT = "http://127.0.0.1:8188";

/** The workflows that ship with beatsheet, and the person's own exports, which take their place. */
const BUILT_IN = join(RESOURCES, "packages", "engine", "comfy");
export const OWN_WORKFLOWS = join(SETTINGS_DIR, "comfy");

/** full: no distill LoRA and more steps, for finals; fast: a few steps, for roughs. */
export const PROFILES = ["full", "fast"] as const;
export type Profile = (typeof PROFILES)[number];

/** What runs a workflow, by ComfyUI's own name for the device: "cuda" (NVIDIA, or AMD on Linux), "mps" (Apple silicon). */
export type DeviceKind = "cuda" | "mps";
/** A machine's graphics: the kind ComfyUI calls it ("cpu" when there's none it can use), its name, and its memory. */
export type Device = { type: string; name: string; memoryGb?: number };

type Workflow = {
  label: string;
  /**
   * It makes a still, from the prompt and as many reference pictures as it has STUDIO_REF_IMAGE_<k> nodes, in the
   * shape asked for. It ships in one profile, full: a still is no rough.
   */
  still?: true;
  /** It follows a clip: the picture and the clip go in, the clip in chunks. Else it's made from a picture alone. */
  drive: boolean;
  /** It makes the picture say something: the picture and the sound go in, the sound in chunks (`first`, `extend`). */
  speech?: true;
  /** About this many pixels for each profile (roughs smaller, so they're quicker), both sides a multiple of `multiple`. */
  area: Record<Profile, number>;
  multiple: number;
  /** A clip's frame rate. */
  fps?: number;
  /** Following a clip or saying a sound: frames in the first chunk, and in each one after. */
  first?: number;
  extend?: number;
  /** From a picture alone: the most frames it makes, on its grid (default a whole number of fours, plus one). */
  maxFrames?: number;
  grid?: { step: number; offset: number };
  /** It makes its own sound, which the take keeps. */
  sound?: boolean;
  /** The profiles it ships in, when not both (a still ships full, as it is no rough). */
  profiles?: Profile[];
  /** What it runs on, the memory that takes on each, and why not on others. */
  needs: { devices: DeviceKind[]; memoryGb: Partial<Record<DeviceKind, number>>; why?: string };
};

/** Each workflow beatsheet knows, by the catalog endpoint that names it. */
export const WORKFLOWS: Record<string, Workflow> = {
  "scail2-animation": {
    label: "SCAIL-2",
    drive: true,
    area: { full: 704 * 1280, fast: 704 * 1280 },
    multiple: 32,
    fps: 30,
    first: 81,
    extend: 76,
    needs: { devices: ["cuda"], memoryGb: { cuda: 16 }, why: "its fp8 weights don't run on Apple's chips or a processor" },
  },
  "wan-animate-move": {
    label: "Wan 2.2 Animate",
    drive: true,
    area: { full: 720 * 1280, fast: 480 * 832 },
    multiple: 16,
    fps: 30,
    first: 77,
    extend: 72,
    needs: { devices: ["cuda"], memoryGb: { cuda: 16 }, why: "its fp8 weights don't run on Apple's chips or a processor" },
  },
  "wan22-i2v": {
    label: "Wan 2.2",
    drive: false,
    area: { full: 704 * 1280, fast: 480 * 832 },
    multiple: 16,
    fps: 16,
    maxFrames: 81,
    needs: { devices: ["cuda"], memoryGb: { cuda: 16 }, why: "its fp8 weights don't run on Apple's chips or a processor" },
  },
  "wan22-ti2v-5b": {
    label: "Wan 2.2 5B",
    drive: false,
    area: { full: 704 * 1280, fast: 704 * 1280 },
    multiple: 32,
    fps: 24,
    maxFrames: 121,
    needs: { devices: ["cuda", "mps"], memoryGb: { cuda: 12, mps: 32 } },
  },
  // ComfyUI's own nodes (comfy_extras/nodes_minimax_h3.py): 17k+5 frames at 24 a second, trained on 124 to 362.
  "minimax-h3-i2v": {
    label: "MiniMax H3",
    drive: false,
    area: { full: 768 * 1344, fast: 480 * 832 },
    multiple: 32,
    fps: 24,
    maxFrames: 362,
    grid: { step: 17, offset: 5 },
    sound: true,
    needs: { devices: ["cuda"], memoryGb: { cuda: 24 }, why: "its INT8 and FP4 weights don't run on Apple's chips or a processor" },
  },
  // BFL's distilled 5.6B in INT8, 16 steps, each reference at about a megapixel (ComfyUI's own template). Stills at
  // GPT Image's 1536×1024 or so, in the shape asked for.
  "flux3-klein": {
    label: "FLUX 3 Image Klein",
    still: true,
    drive: false,
    area: { full: 1536 * 1024, fast: 1536 * 1024 },
    multiple: 16,
    needs: { devices: ["cuda"], memoryGb: { cuda: 12 }, why: "its INT8 weights don't run on Apple's chips or a processor" },
  },
  // ComfyUI's own nodes (WanInfiniteTalkToVideo, from its InfiniteTalk template): Wan 2.1's 480p image-to-video with
  // InfiniteTalk's patch and a 6-step LoRA, 81 frames at 25 a second, then 72 more for each chunk after, each one
  // carrying on from the last 9 frames of what came before (which it makes again, so they come off before joining).
  infinitetalk: {
    label: "InfiniteTalk",
    speech: true,
    drive: false,
    area: { full: 480 * 832, fast: 480 * 832 },
    multiple: 16,
    fps: 25,
    first: 81,
    extend: 72,
    // The 480p model with its distill LoRA is how ComfyUI ships it; there's no slower one to make finals with.
    profiles: ["fast"],
    needs: { devices: ["cuda"], memoryGb: { cuda: 16 }, why: "its fp8 weights don't run on Apple's chips or a processor" },
  },
};

/** Marker title → { node class: the input beatsheet sets }. A marker may sit on several nodes; every one is set. */
const MARKERS: Record<string, Record<string, string>> = {
  STUDIO_REF_IMAGE: { LoadImage: "image" },
  STUDIO_END_IMAGE: { LoadImage: "image" },
  STUDIO_DRIVING_VIDEO: { LoadVideo: "file", VHS_LoadVideo: "video" },
  STUDIO_AUDIO: { LoadAudio: "audio" },
  STUDIO_SEED: { PrimitiveInt: "value", KSampler: "seed", SamplerCustom: "noise_seed", RandomNoise: "noise_seed" },
  STUDIO_STEPS: { PrimitiveInt: "value", KSampler: "steps", BasicScheduler: "steps" },
  STUDIO_CFG: { PrimitiveFloat: "value", KSampler: "cfg", SamplerCustom: "cfg" },
  STUDIO_PROMPT: { PrimitiveStringMultiline: "value", PrimitiveString: "value", CLIPTextEncode: "text" },
  STUDIO_WIDTH: { PrimitiveInt: "value" },
  STUDIO_HEIGHT: { PrimitiveInt: "value" },
  STUDIO_FRAMES: { PrimitiveInt: "value" },
  STUDIO_FPS: { PrimitiveFloat: "value", PrimitiveInt: "value", CreateVideo: "fps" },
  STUDIO_OUTPUT: { SaveVideo: "filename_prefix", VHS_VideoCombine: "filename_prefix", SaveImage: "filename_prefix" },
};

/** Loader inputs that name a model file, and the /models folder that has to list it. */
const LOADER_FOLDERS: Record<string, string> = {
  "UNETLoader.unet_name": "diffusion_models",
  "LoraLoaderModelOnly.lora_name": "loras",
  "LoraLoader.lora_name": "loras",
  "CLIPLoader.clip_name": "text_encoders",
  "CLIPVisionLoader.clip_name": "clip_vision",
  "VAELoader.vae_name": "vae",
  "CheckpointLoaderSimple.ckpt_name": "checkpoints",
  "ModelPatchLoader.name": "model_patches",
  "AudioEncoderLoader.audio_encoder_name": "audio_encoders",
};

const hf = (repo: string, path: string) => `https://huggingface.co/${repo}/resolve/main/${path}`;
/**
 * Where each model file the shipped workflows name comes from, its size and its SHA-256 (from Hugging Face's own
 * listing). `gated`: the Hugging Face repo that shares it only with people who've accepted its license there.
 */
export const MODEL_FILES: Record<string, Download & { gated?: string }> = {
  "umt5_xxl_fp8_e4m3fn_scaled.safetensors": { url: hf("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors"), bytes: 6735906897, sha256: "c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68" },
  "clip_vision_h.safetensors": { url: hf("Comfy-Org/Wan_2.1_ComfyUI_repackaged", "split_files/clip_vision/clip_vision_h.safetensors"), bytes: 1264219396, sha256: "64a7ef761bfccbadbaa3da77366aac4185a6c58fa5de5f589b42a65bcc21f161" },
  "wan_2.1_vae.safetensors": { url: hf("Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/vae/wan_2.1_vae.safetensors"), bytes: 253815318, sha256: "2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b" },
  "wan2.2_vae.safetensors": { url: hf("Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/vae/wan2.2_vae.safetensors"), bytes: 1409400960, sha256: "e40321bd36b9709991dae2530eb4ac303dd168276980d3e9bc4b6e2b75fed156" },
  "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors": { url: hf("Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors"), bytes: 14294742832, sha256: "6122e79d55e0f235698d11d657f3b196c5273c830da00b2b013c5a048d5e6a42" },
  "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors": { url: hf("Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors"), bytes: 14294742832, sha256: "5471a457b6ac404202a5fbe6c11595a3d5641fc766b00f38763f72303fffc21e" },
  "wan2.2_ti2v_5B_fp16.safetensors": { url: hf("Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors"), bytes: 9999658848, sha256: "456f901338bd9eadbded3828b819109a9b68e8a525ca5cf8d0049a69fcfeca1e" },
  "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors": { url: hf("Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors"), bytes: 1226977424, sha256: "d176c808d6fc461999b68e321efcb7501b20b8c3797523ed0df14f7d1deff11e" },
  "wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors": { url: hf("Comfy-Org/Wan_2.2_ComfyUI_Repackaged", "split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors"), bytes: 1226977424, sha256: "024f21de095bc8fad9809ded3e9e49a2e170dcf27075da8145ba7d60d8aab7f9" },
  "Wan2_1_VAE_bf16.safetensors": { url: hf("Kijai/WanVideo_comfy", "Wan2_1_VAE_bf16.safetensors"), bytes: 253806278, sha256: "1ab9a32cc2c740f6e39d80d367ce5dcc28db8c71b79b28670546b8973e9d75f9" },
  "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors": { url: hf("Kijai/WanVideo_comfy", "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"), bytes: 738005744, sha256: "85c4a61c30e0497aa44b91d93a893b624708461a56fe5485183b28fa07e2dfb3" },
  "WanAnimate_relight_lora_fp16.safetensors": { url: hf("Kijai/WanVideo_comfy", "LoRAs/Wan22_relight/WanAnimate_relight_lora_fp16.safetensors"), bytes: 1436672440, sha256: "fc646c74c73f4b251f5fd9bc440ef21b03b27305f499966c68b2b3aa31498561" },
  "Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors": { url: hf("Kijai/WanVideo_comfy_fp8_scaled", "Wan22Animate/Wan2_2-Animate-14B_fp8_scaled_e4m3fn_KJ_v2.safetensors"), bytes: 17317143060, sha256: "b1cd5a67e968e5bb38fcf84dab58f2fb551e0889fd463acb2a657259a70bbbf6" },
  "wan2.1_14B_SCAIL_2_fp8_scaled.safetensors": { url: hf("Comfy-Org/SCAIL-2", "diffusion_models/wan2.1_14B_SCAIL_2_fp8_scaled.safetensors"), bytes: 17694586857, sha256: "11513b4697ecf566de0cb74660c478f301fb6699a62b10369e91a6ed0fd6b083" },
  "wan2.1_SCAIL_2_DPO_lora_bf16.safetensors": { url: hf("Comfy-Org/SCAIL-2", "loras/wan2.1_SCAIL_2_DPO_lora_bf16.safetensors"), bytes: 1226936552, sha256: "b106522036f64e50f5f8ae3b808973515ff442cc2fac27b65d875eafb95b89e2" },
  "sam3.1_multiplex_fp16.safetensors": { url: hf("Comfy-Org/sam3.1", "checkpoints/sam3.1_multiplex_fp16.safetensors"), bytes: 1745546848, sha256: "9ba99c92703c2e8b4f47de2d34a539bb8e18923049e238b780d70dbe6368eb03" },
  "minimax_h3_fl2va_pruned_int8_convrot.safetensors": { url: hf("Comfy-Org/MiniMax-H3", "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors"), bytes: 20970379616, sha256: "e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a" },
  "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors": { url: hf("Comfy-Org/MiniMax-H3", "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"), bytes: 15687142551, sha256: "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6" },
  "minimax_h3_video_vae_fp16.safetensors": { url: hf("Comfy-Org/MiniMax-H3", "vae/minimax_h3_video_vae_fp16.safetensors"), bytes: 5207808496, sha256: "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522" },
  "minimax_h3_audio_vae_fp32.safetensors": { url: hf("Comfy-Org/MiniMax-H3", "vae/minimax_h3_audio_vae_fp32.safetensors"), bytes: 605254808, sha256: "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48" },
  "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors": { url: hf("Comfy-Org/MiniMax-H3", "loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors"), bytes: 1956193000, sha256: "2339acdf19bfe123f46b971ea35d367a84adb85de43627e1eceafa5a5b2b111e" },
  // FLUX 3 Image Klein under the FLUX Kommunity License, which Black Forest Labs asks people to accept first. Its VAE is
  // FLUX.2's, the same file in Comfy-Org's open Klein 4B.
  "flux3-image-klein-int8-convrot.safetensors": { url: hf("black-forest-labs/flux-3-image-klein-comfy", "diffusion_models/flux3-image-klein-int8-convrot.safetensors"), bytes: 5827874779, sha256: "847d8933548afd93df4af2cac2498e70891bf28d9dae06d695f536992e168fe2", gated: "black-forest-labs/flux-3-image-klein-comfy" },
  "qwen3vl_4b_int8_convrot.safetensors": { url: hf("black-forest-labs/flux-3-image-klein-comfy", "text_encoders/qwen3vl_4b_int8_convrot.safetensors"), bytes: 4858559240, sha256: "32de113cbf8282b02cbff0794b637b9d6676da09314a1db5a30bcea9bf4ee01c", gated: "black-forest-labs/flux-3-image-klein-comfy" },
  "flux2-vae.safetensors": { url: hf("Comfy-Org/Flux-2-Klein-4B", "split_files/vae/flux2-vae.safetensors"), bytes: 336211292, sha256: "868fe7b343cc8f3a19dbcfcafbc3d5f888802be3f89bd81b65b3621a066ce8f3" },
  // InfiniteTalk (Apache 2.0) on Wan 2.1's 480p image-to-video, as ComfyUI's own template has them; its single-speaker patch.
  "Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ.safetensors": { url: hf("Kijai/WanVideo_comfy_fp8_scaled", "I2V/Wan2_1-I2V-14B-480p_fp8_e4m3fn_scaled_KJ.safetensors"), bytes: 16643349018, sha256: "2ff922282cd84589702e6e8c26e083d1160bfc2b217dd44e1ae2688441dc495d" },
  "wan2.1_infiniteTalk_single_fp16.safetensors": { url: hf("Comfy-Org/Wan-2.1", "split_files/model_patches/wan2.1_infiniteTalk_single_fp16.safetensors"), bytes: 5125258232, sha256: "bf212c5c647eaf1c019b2158d2edf4a360d97e38b746c4bac994fee485e09fc3" },
  "wav2vec2-chinese-base_fp16.safetensors": { url: hf("Kijai/wav2vec2_safetensors", "wav2vec2-chinese-base_fp16.safetensors"), bytes: 190115368, sha256: "000813e441020f18cff844c969d2d5d4adc2a5ce46b2db1f23950b05d88805b4" },
};

/** Nodes that aren't ComfyUI's own, and the pack that has them (ComfyUI Manager installs a pack by name). */
const NODE_PACKS: Record<string, string> = { DWPreprocessor: "comfyui_controlnet_aux" };
/** ComfyUI's own nodes that came after 0.39, and the version that has them: an older ComfyUI needs updating. */
const NODE_VERSIONS: Record<string, string> = { ReferenceMultiLatent: "0.41" };

export type ComfyNode = { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } };
export type ComfyPrompt = Record<string, ComfyNode>;

// ---- Workflows.

/** The workflow file for a profile: the person's own export first, then the one that ships. */
export function workflowPath(name: string, profile: Profile): string | undefined {
  for (const dir of [OWN_WORKFLOWS, BUILT_IN]) {
    const file = join(dir, `${name}.${profile}.api.json`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

/**
 * The profile a take of this quality is made with: fast for roughs and full for finals, else whichever there is, and
 * one the connected ComfyUI has everything for ahead of one it doesn't.
 */
export function profileFor(name: string, quality: Quality | undefined): Profile | undefined {
  const order: Profile[] = quality === "final" ? ["full", "fast"] : ["fast", "full"];
  const there = order.filter((p) => workflowPath(name, p));
  const problems = readSettings().comfy?.workflows;
  return there.find((p) => !problems?.[`${name}.${p}`]?.length) ?? there[0];
}

export function loadWorkflow(file: string): ComfyPrompt {
  const w = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if ("nodes" in w && "links" in w) throw new FalError(`${basename(file)} is a ComfyUI workflow in its UI format; export it with File → Export (API)`, true);
  return w as ComfyPrompt;
}

export const nodesTitled = (prompt: ComfyPrompt, title: string) => Object.keys(prompt).filter((id) => prompt[id]!._meta?.title === title);

/** How many chunks a workflow can make: its STUDIO_OUTPUT_<k> outputs, or one for a single STUDIO_OUTPUT. */
export function chunksIn(prompt: ComfyPrompt): number {
  const ks = Object.values(prompt).flatMap((n) => {
    const m = /^STUDIO_OUTPUT_(\d+)$/.exec(n._meta?.title ?? "");
    return m ? [Number(m[1])] : [];
  });
  return ks.length ? Math.max(...ks) : 1;
}

/** The output marker for a clip of `chunks` chunks: STUDIO_OUTPUT_<k> where the workflow has one, else STUDIO_OUTPUT. */
export const outputMarker = (prompt: ComfyPrompt, chunks: number) => (nodesTitled(prompt, `STUDIO_OUTPUT_${chunks}`).length ? `STUDIO_OUTPUT_${chunks}` : "STUDIO_OUTPUT");

/** How many chunks a clip of `frames` frames needs, and the frames they hold (the clip is padded out to that). */
export function chunksFor(frames: number, first: number, extend: number): { chunks: number; capacity: number } {
  const chunks = 1 + Math.max(0, Math.ceil((frames - first) / extend));
  return { chunks, capacity: first + extend * (chunks - 1) };
}

/**
 * Frames a picture-alone workflow makes for `seconds`: at least that many, on its grid (a whole number of `step`s plus
 * `offset`: Wan's fours plus one by default), at most `max`.
 */
export function framesFor(seconds: number, fps: number, max: number, grid = { step: 4, offset: 1 }): number {
  const need = Math.max(grid.offset + grid.step, Math.ceil(seconds * fps - 1e-6));
  return Math.min(max, grid.offset + Math.ceil((need - grid.offset) / grid.step) * grid.step);
}

/** How many reference pictures a still's workflow takes: its STUDIO_REF_IMAGE_<k> nodes, numbered from 1. */
export function refsIn(prompt: ComfyPrompt): number {
  let k = 0;
  while (nodesTitled(prompt, `STUDIO_REF_IMAGE_${k + 1}`).length) k++;
  return k;
}

const isLink = (v: unknown) => Array.isArray(v) && v.length === 2 && typeof v[0] === "string";
const baseOf = (marker: string) => (marker.startsWith("STUDIO_OUTPUT") ? "STUDIO_OUTPUT" : /^STUDIO_REF_IMAGE_\d+$/.test(marker) ? "STUDIO_REF_IMAGE" : marker);

/**
 * A copy of the workflow with every marked node set. Markers the workflow doesn't have are skipped; a marker on a node
 * beatsheet can't fill, or on an input wired to another node, is refused.
 */
export function fill(workflow: ComfyPrompt, values: Record<string, unknown>): ComfyPrompt {
  const prompt = structuredClone(workflow);
  for (const [marker, value] of Object.entries(values)) {
    for (const id of nodesTitled(prompt, marker)) {
      const node = prompt[id]!;
      const input = MARKERS[baseOf(marker)]?.[node.class_type];
      if (!input) throw new FalError(`The workflow's ${marker} is on a ${node.class_type} node (#${id}), which beatsheet can't fill`, true);
      if (isLink(node.inputs[input])) throw new FalError(`The workflow's ${marker} (#${id}) is wired to another node; title the node it comes from instead`, true);
      node.inputs[input] = value;
    }
  }
  return prompt;
}

/** A copy of the workflow without the nodes titled `marker`, and without the inputs they fed (which have to be optional). */
export function without(workflow: ComfyPrompt, marker: string): ComfyPrompt {
  const gone = new Set(nodesTitled(workflow, marker));
  const prompt: ComfyPrompt = {};
  for (const [id, n] of Object.entries(workflow)) {
    if (gone.has(id)) continue;
    prompt[id] = { ...n, inputs: Object.fromEntries(Object.entries(n.inputs).filter(([, v]) => !(isLink(v) && gone.has((v as [string, number])[0])))) };
  }
  return prompt;
}

/**
 * What's wrong with an exported workflow for beatsheet, if anything: one that follows a clip needs a clip to load, one
 * that says something a sound to load, and a still needs its prompt and its size.
 */
export function checkWorkflow(prompt: ComfyPrompt, spec: Pick<Workflow, "drive" | "still" | "speech"> = { drive: true }): string[] {
  const problems: string[] = [];
  const markers = spec.still
    ? ["STUDIO_PROMPT", "STUDIO_WIDTH", "STUDIO_HEIGHT"]
    : spec.drive
      ? ["STUDIO_REF_IMAGE", "STUDIO_DRIVING_VIDEO"]
      : spec.speech
        ? ["STUDIO_REF_IMAGE", "STUDIO_AUDIO"]
        : ["STUDIO_REF_IMAGE", "STUDIO_FRAMES"];
  for (const marker of markers) if (nodesTitled(prompt, marker).length !== 1) problems.push(`needs exactly one node titled ${marker}`);
  if (!Object.values(prompt).some((n) => n._meta?.title?.startsWith("STUDIO_OUTPUT"))) problems.push(`needs a ${spec.still ? "SaveImage" : "SaveVideo"} titled STUDIO_OUTPUT`);
  for (const [id, n] of Object.entries(prompt)) {
    const title = n._meta?.title ?? "";
    if (!title.startsWith("STUDIO_")) continue;
    const input = MARKERS[baseOf(title)]?.[n.class_type];
    if (!input) problems.push(`${title} is on a ${n.class_type} node (#${id}), which beatsheet can't fill`);
    else if (isLink(n.inputs[input])) problems.push(`${title} (#${id}) is wired to another node; title the node it comes from instead`);
  }
  return problems;
}

/** What a server is missing for a workflow: node types (with the pack that has them) and model files (with their folder). */
export type Missing = { nodes: string[]; files: { folder: string; name: string }[] };

/** Node types and model files the server doesn't have. `hasNode` and `files` answer from it; undefined is "couldn't tell". */
export async function missingOn(prompt: ComfyPrompt, hasNode: (cls: string) => Promise<boolean | undefined>, files: (folder: string) => Promise<Set<string> | undefined>): Promise<Missing> {
  const out: Missing = { nodes: [], files: [] };
  for (const cls of [...new Set(Object.values(prompt).map((n) => n.class_type))].sort()) if ((await hasNode(cls)) === false) out.nodes.push(cls);
  for (const n of Object.values(prompt)) {
    for (const [name, value] of Object.entries(n.inputs)) {
      const folder = LOADER_FOLDERS[`${n.class_type}.${name}`];
      if (!folder || typeof value !== "string" || out.files.some((f) => f.folder === folder && f.name === value)) continue;
      const have = await files(folder);
      // Windows lists a model in a subfolder with a backslash; compare them the same way.
      if (have && !have.has(value.replaceAll("\\", "/"))) out.files.push({ folder, name: value });
    }
  }
  return out;
}

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(bytes < 1e10 ? 1 : 0)} GB`;

/** What's missing, in words: each node with its pack, and each file with its size where beatsheet knows where to get it. */
export function describeMissing(m: Missing): string[] {
  return [
    ...m.nodes.map(
      (cls) =>
        `node type ${cls} isn't installed${NODE_PACKS[cls] ? ` (it comes with ${NODE_PACKS[cls]}; ComfyUI Manager installs it)` : NODE_VERSIONS[cls] ? ` (it comes with ComfyUI ${NODE_VERSIONS[cls]} and later: update ComfyUI)` : ""}`,
    ),
    ...m.files.map((f) => `model ${f.folder}/${f.name} is missing${MODEL_FILES[f.name] ? ` (${gb(MODEL_FILES[f.name]!.bytes)})` : ""}`),
  ];
}

// ---- Machines.

const DEVICE_WORDS: Record<string, string> = { cuda: "an NVIDIA graphics card", mps: "a Mac with Apple silicon" };

/**
 * Why a workflow can't run on a device, if it can't: the wrong kind of chip, or too little memory. `where` names the
 * machine for people: "this computer", "the ComfyUI at 192.168.1.50".
 */
export function machineProblem(needs: Workflow["needs"], device: Device, where: string): string | undefined {
  const kind = device.type as DeviceKind;
  if (!needs.devices.includes(kind)) {
    const has = device.type === "cpu" ? `only ${device.name ? `${device.name}, ` : ""}no graphics card ComfyUI can use` : device.name;
    return `Needs ${needs.devices.map((d) => DEVICE_WORDS[d] ?? d).join(" or ")}${needs.why ? ` (${needs.why})` : ""}, and ${where} has ${has}`;
  }
  const min = needs.memoryGb[kind];
  if (min && device.memoryGb !== undefined && device.memoryGb < min - 0.5)
    return `Needs about ${min} GB of ${kind === "mps" ? "memory" : "graphics memory"}, and ${where}'s ${device.name} has ${Math.round(device.memoryGb)} GB`;
  return undefined;
}

let here: Device | undefined;
/**
 * This computer's graphics, asked once: an NVIDIA card (nvidia-smi), Apple silicon (its chip and memory), or neither
 * (then the graphics there are, by name, so a reason can say what this laptop has). BEATSHEET_MACHINE (JSON) stands in
 * for it in tests.
 */
export function thisDevice(): Device {
  if (process.env.BEATSHEET_MACHINE) return JSON.parse(process.env.BEATSHEET_MACHINE) as Device;
  if (here) return here;
  if (process.platform === "darwin")
    return (here = process.arch === "arm64" ? { type: "mps", name: cpus()[0]?.model ?? "Apple silicon", memoryGb: Math.round(totalmem() / 2 ** 30) } : { type: "cpu", name: "an Intel Mac" });
  const nvidia = process.platform === "win32" ? gpu().gpu : linuxNvidia();
  if (nvidia) return (here = { type: "cuda", name: nvidia.name, memoryGb: Math.round(nvidia.memoryMb / 1024) });
  return (here = { type: "cpu", name: graphicsName() ?? "" });
}

function linuxNvidia(): { name: string; memoryMb: number } | undefined {
  try {
    const [name, mem] = execFileSync("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"], { timeout: 8000 }).toString().split(/\r?\n/)[0]!.split(",").map((x) => x.trim());
    return name ? { name, memoryMb: Number(mem) } : undefined;
  } catch {
    return undefined;
  }
}

/** The graphics a Windows PC without an NVIDIA card has (Intel UHD Graphics 620), for saying what it is. */
function graphicsName(): string | undefined {
  if (process.platform !== "win32") return undefined;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_VideoController).Name"], { timeout: 10_000, windowsHide: true }).toString();
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
  } catch {
    return undefined;
  }
}

// ---- What can run where, for the fit check.

/**
 * ComfyUI as the fit check sees it: ready once it's connected (as a key is), failing when the last check failed, and
 * for each workflow that can't be used there, why: what it's missing (to install) or what its machine can't do. With
 * none connected, the workflows this computer couldn't run either say so, so the person connects one that can.
 */
export function comfyState(): ServiceState {
  const c = readSettings().comfy;
  const endpoints: Record<string, Unusable> = {};
  for (const [name, spec] of Object.entries(WORKFLOWS)) {
    const u = c ? unusableOn(name, spec, c) : unusableHere(spec);
    if (u) endpoints[name] = u;
  }
  const label = "ComfyUI";
  if (!c) return { label, state: "missing", endpoints };
  if (c.ok === false) return { label, state: "failing", detail: c.detail ?? "It didn't answer last time", endpoints };
  return { label, state: "ready", endpoints };
}

type Connected = NonNullable<ReturnType<typeof readSettings>["comfy"]>;

function unusableOn(name: string, spec: Workflow, c: Connected): Unusable | undefined {
  if (c.device) {
    const machine = machineProblem(spec.needs, c.device, whereIs(c.url));
    if (machine) return { kind: "machine", reason: machine };
  }
  const profiles = PROFILES.filter((p) => workflowPath(name, p));
  if (!profiles.length) return { kind: "install", reason: `There's no ${spec.label} workflow here: export one from ComfyUI (File → Export (API)) as ${name}.full.api.json into ${OWN_WORKFLOWS}` };
  const checked = profiles.map((p) => c.workflows?.[`${name}.${p}`]);
  // Checked before this workflow came with beatsheet: what it needs there isn't known until it's checked again.
  if (c.workflows && checked.every((x) => x === undefined))
    return { kind: "install", reason: `ComfyUI hasn't been checked for ${spec.label} yet: Settings → Making checks it, and fetches the model files it's missing` };
  const problems = checked.map((x) => x ?? []);
  if (problems.some((x) => !x.length)) return undefined;
  const fewest = problems.sort((a, b) => a.length - b.length)[0]!;
  return { kind: "install", reason: `ComfyUI is missing what ${spec.label} needs: ${fewest.join("; ")} (Settings → Making)` };
}

function unusableHere(spec: Workflow): Unusable | undefined {
  const problem = machineProblem(spec.needs, thisDevice(), "this computer");
  return problem ? { kind: "machine", reason: `${problem}: connect a ComfyUI on a computer that can, by its address (Settings → Making)` } : undefined;
}

/** The machine a ComfyUI runs on, for people: "this computer", or "the ComfyUI at 192.168.1.50". */
const whereIs = (url: string) => {
  try {
    const h = new URL(url).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "[::1]" ? "this computer" : `the ComfyUI at ${h}`;
  } catch {
    return `the ComfyUI at ${url}`;
  }
};

// ---- The server.

/** The address the person connected, or none. */
export const comfyUrl = () => readSettings().comfy?.url;

async function call(base: string, path: string, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
  try {
    return await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(init.timeout ?? 30_000) });
  } catch (err) {
    throw new FalError(`ComfyUI at ${base} isn't answering: is it running? (${err instanceof Error ? err.message : String(err)})`, false);
  }
}

async function json<T>(base: string, path: string, init?: RequestInit & { timeout?: number }): Promise<T> {
  const res = await call(base, path, init);
  if (!res.ok) throw new FalError(`ComfyUI answered ${res.status} to ${path}`, res.status < 500);
  return (await res.json()) as T;
}

export type ComfyHealth = { ok: boolean; detail: string; device?: Device; version?: string };

/** What it runs on (and so what it can run), and whether it answers at all. */
export async function comfyHealth(base: string): Promise<ComfyHealth> {
  const j = await json<{ system?: { comfyui_version?: string; ram_total?: number }; devices?: { name?: string; type?: string; vram_total?: number }[] }>(base, "/system_stats", { timeout: 5000 });
  const dev = j.devices?.[0];
  const type = dev?.type ?? "cpu";
  const name = (dev?.name ?? "").replace(/^\w+:\d+\s*/, "").split(" : ")[0]!.trim() || (type === "mps" ? "Apple silicon" : type);
  // On a Mac the graphics share the computer's memory, which is what ComfyUI says for it.
  const bytes = type === "mps" ? (j.system?.ram_total ?? dev?.vram_total) : dev?.vram_total;
  const device: Device = { type, name, ...(bytes ? { memoryGb: Math.round((bytes / 2 ** 30) * 10) / 10 } : {}) };
  const version = j.system?.comfyui_version;
  const detail = [device.name, device.memoryGb && `${Math.round(device.memoryGb)} GB`, version && `ComfyUI ${version}`].filter(Boolean).join(" · ");
  return { ok: true, detail, device, version };
}

/** What the server is missing for a filled workflow, checked before sending so a missing model reads as that. */
export async function comfyMissing(base: string, prompt: ComfyPrompt): Promise<Missing> {
  const listed = new Map<string, Promise<Set<string> | undefined>>();
  return missingOn(
    prompt,
    async (cls) => {
      const res = await call(base, `/object_info/${encodeURIComponent(cls)}`);
      return res.ok ? cls in ((await res.json()) as Record<string, unknown>) : undefined;
    },
    (folder) => {
      if (!listed.has(folder))
        listed.set(
          folder,
          call(base, `/models/${folder}`).then(async (r) => (r.ok ? new Set(((await r.json()) as string[]).map((f) => f.replaceAll("\\", "/"))) : undefined)),
        );
      return listed.get(folder)!;
    },
  );
}

/** Puts a picture or a clip in ComfyUI's input folder (both go through /upload/image); gives the name nodes load it by. */
export async function comfyUpload(base: string, file: string, name: string): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([readFileSync(file)]), name);
  form.append("type", "input");
  form.append("subfolder", "beatsheet");
  form.append("overwrite", "true");
  const res = await call(base, "/upload/image", { method: "POST", body: form, timeout: 5 * 60_000 });
  if (res.status === 413) throw new FalError(`${name} is bigger than ComfyUI takes (start it with a larger --max-upload-size)`, true);
  if (!res.ok) throw new FalError(`ComfyUI didn't take ${name} (${res.status})`, res.status < 500);
  const j = (await res.json()) as { name: string; subfolder?: string };
  return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
}

/** Queues a filled workflow under our own id; only the `targets` outputs (and what they need) run. */
export async function comfySubmit(base: string, prompt: ComfyPrompt, id: string, targets: string[]): Promise<void> {
  const res = await call(base, "/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, prompt_id: id, client_id: "beatsheet", partial_execution_targets: targets }) });
  const j = (await res.json().catch(() => ({}))) as { error?: { type?: string; message?: string; details?: string }; node_errors?: Record<string, { class_type?: string; errors?: { message?: string; details?: string }[] }> };
  const nodeErrors = Object.entries(j.node_errors ?? {});
  if (res.ok && !nodeErrors.length) return;
  if (res.status >= 500) throw new FalError(`ComfyUI answered ${res.status}; trying again`, false);
  const said = [
    j.error && [j.error.message, j.error.details].filter(Boolean).join(": "),
    ...nodeErrors.flatMap(([nid, e]) => (e.errors ?? []).map((x) => `node ${nid} (${e.class_type}): ${[x.message, x.details].filter(Boolean).join(": ")}`)),
  ].filter(Boolean);
  throw new FalError(`ComfyUI refused the workflow: ${said.join("; ").slice(0, 1200) || res.status}`, true);
}

export type ComfyJob = { status: "pending" | "in_progress" | "completed" | "failed" | "cancelled"; execution_error?: { node_type?: string; node_id?: string; exception_type?: string; exception_message?: string } };

/** Where a job is, or undefined when ComfyUI doesn't know it (it restarted, or it was never sent). */
export async function comfyJob(base: string, id: string): Promise<ComfyJob | undefined> {
  const res = await call(base, `/api/jobs/${id}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new FalError(`ComfyUI answered ${res.status} about the job`, false);
  return (await res.json()) as ComfyJob;
}

/** How many jobs are ahead of this one: the one running, and those queued before it. */
export async function comfyAhead(base: string, id: string): Promise<number | undefined> {
  const q = await json<{ queue_running?: unknown[][]; queue_pending?: unknown[][] }>(base, "/queue");
  const pending = [...(q.queue_pending ?? [])].sort((a, b) => Number(a[0]) - Number(b[0])).map((x) => x[1]);
  const i = pending.indexOf(id);
  return i === -1 ? undefined : i + (q.queue_running?.length ?? 0);
}

/** Dequeues the job, or stops it if it's the one running; never anything else. */
export async function comfyCancel(base: string, id: string): Promise<void> {
  const res = await call(base, `/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => undefined);
  if (res?.status !== 404) return;
  // A server older than its jobs API.
  await call(base, "/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delete: [id] }) }).catch(() => undefined);
  await call(base, "/interrupt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt_id: id }) }).catch(() => undefined);
}

type SavedFile = { filename: string; subfolder?: string; type?: string };

/**
 * The video (or, for a still, the picture) a finished job saved on the given output nodes: SaveVideo and SaveImage list
 * theirs under images, VHS under gifs.
 */
export async function comfySaved(base: string, id: string, outputs: string[], still = false): Promise<SavedFile | undefined> {
  const h = await json<Record<string, { outputs?: Record<string, Record<string, unknown>> }>>(base, `/history/${id}`);
  const kind = still ? /\.(png|jpe?g|webp)$/i : /\.(mp4|webm|mov|mkv)$/i;
  const found = outputs.flatMap((nid) =>
    Object.values(h[id]?.outputs?.[nid] ?? {}).flatMap((items) => (Array.isArray(items) ? (items as SavedFile[]).filter((x) => kind.test(x?.filename ?? "") && (x.type ?? "output") === "output") : [])),
  );
  return found.at(-1);
}

export async function comfyDownload(base: string, file: SavedFile, dest: string): Promise<void> {
  const q = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" });
  const res = await call(base, `/view?${q}`, { timeout: 10 * 60_000 });
  if (!res.ok) throw new FalError(`Couldn't fetch the take from ComfyUI (${res.status})`, res.status === 404);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(`${dest}.part`, Buffer.from(await res.arrayBuffer()));
  renameSync(`${dest}.part`, dest);
}

// ---- Checking the server against the workflows, for Settings.

export type ComfyCheck = ComfyHealth & {
  /** Each workflow there is, with what stops it running there, and the missing model files beatsheet could fetch (and their size). */
  workflows: { name: string; label: string; profile: Profile; own: boolean; problems: string[]; machine?: string; missing?: Missing; fetch?: { name: string; bytes: number; gated?: string }[] }[];
  /** This computer's graphics, and whether model files can be fetched into the connected ComfyUI from here. */
  here: Device;
  local: boolean;
};

/** The workflows there are here, each with what would stop it running on the server (when it can be asked). */
export async function checkComfy(base: string | undefined): Promise<ComfyCheck> {
  const health: ComfyHealth = base ? await comfyHealth(base).catch((err: unknown) => ({ ok: false, detail: err instanceof Error ? err.message : String(err) })) : { ok: false, detail: "Not connected" };
  const workflows: ComfyCheck["workflows"] = [];
  for (const [name, spec] of Object.entries(WORKFLOWS)) {
    for (const profile of PROFILES) {
      const file = workflowPath(name, profile);
      if (!file) continue;
      const device = health.device ?? (base ? undefined : thisDevice());
      const machine = device ? machineProblem(spec.needs, device, health.device ? whereIs(base!) : "this computer") : undefined;
      let problems: string[];
      let missing: Missing | undefined;
      try {
        const w = loadWorkflow(file);
        problems = checkWorkflow(w, spec);
        if (!problems.length && base && health.ok && !machine) {
          missing = await comfyMissing(base, w);
          problems = describeMissing(missing);
        }
      } catch (err) {
        problems = [err instanceof Error ? err.message : String(err)];
      }
      const fetch = (missing?.files ?? []).flatMap((f) => {
        const known = MODEL_FILES[f.name];
        return known ? [{ name: f.name, bytes: known.bytes, ...(known.gated ? { gated: known.gated } : {}) }] : [];
      });
      workflows.push({ name, label: spec.label, profile, own: file.startsWith(OWN_WORKFLOWS), problems, ...(machine ? { machine } : {}), ...(missing ? { missing } : {}), ...(fetch.length ? { fetch } : {}) });
    }
  }
  return { ...health, workflows, here: thisDevice(), local: base ? (await foldersHere(base)) !== undefined : false };
}

/** Keeps what a check found, so the fit check can say what can run there without asking the server each time. */
function remember(base: string, check: ComfyCheck, connecting: boolean) {
  updateSettings((s) => {
    if (!connecting && !s.comfy) return;
    s.comfy = {
      url: base,
      addedAt: s.comfy?.addedAt ?? new Date().toISOString(),
      detail: check.detail,
      ok: check.ok,
      ...(check.device ? { device: check.device } : s.comfy?.device ? { device: s.comfy.device } : {}),
      workflows: Object.fromEntries(check.workflows.map((w) => [`${w.name}.${w.profile}`, w.problems])),
    };
  });
}

/** Checks a server and, only if it answers, keeps its address and what it can run. */
export async function connectComfy(url: string): Promise<ComfyCheck> {
  const base = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(base)) return { ok: false, detail: `That doesn't look like ComfyUI's address (${COMFY_DEFAULT})`, workflows: [], here: thisDevice(), local: false };
  const check = await checkComfy(base);
  if (check.ok) remember(base, check, true);
  return check;
}

/** Checks the connected server again, and keeps what it said. */
export async function recheckComfy(): Promise<ComfyCheck> {
  const base = comfyUrl();
  const check = await checkComfy(base);
  if (base) remember(base, check, false);
  return check;
}

export const disconnectComfy = () => updateSettings((s) => void delete s.comfy);

// ---- Fetching what a workflow is missing into a ComfyUI on this computer.

/**
 * Where a ComfyUI keeps each kind of model, when that's on this computer (its own answer, checked against the disk), so
 * beatsheet can put files there. Undefined for one on another machine.
 */
async function foldersHere(base: string): Promise<Record<string, string> | undefined> {
  try {
    const res = await call(base, "/internal/folder_paths", { timeout: 5000 });
    if (!res.ok) return undefined;
    const paths = (await res.json()) as Record<string, string | string[] | [string[], unknown]>;
    const out: Record<string, string> = {};
    for (const [folder, v] of Object.entries(paths)) {
      const list = (Array.isArray(v) ? (Array.isArray(v[0]) ? v[0] : v) : [v]) as string[];
      // models/<folder> where there is one (diffusion_models also answers to models/unet), else the first.
      const pick = list.find((p) => typeof p === "string" && p.replaceAll("\\", "/").endsWith(`models/${folder}`)) ?? list.find((p) => typeof p === "string" && !/[\\/]output[\\/]/.test(p));
      if (pick && existsSync(pick)) out[folder] = pick;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

export type InstallStatus =
  | { state: "idle" }
  | { state: "installing"; files: string[]; file: string; done: number; bytes: number; progress: number }
  | { state: "done"; files: string[] }
  | { state: "error"; detail: string };

let install: InstallStatus = { state: "idle" };
let stop: AbortController | undefined;
export const installStatus = () => install;
export const cancelInstall = () => stop?.abort();

/**
 * Why the person's Hugging Face token can't fetch these gated files, if it can't: there's none (SAM 3.1 takes one in
 * Settings), or its owner hasn't accepted the license yet. Asked of Hugging Face, one file per repo.
 */
async function gatedProblem(names: string[], token: string | undefined): Promise<string | undefined> {
  const repos = [...new Set(names.flatMap((n) => MODEL_FILES[n]?.gated ?? []))];
  if (!repos.length) return undefined;
  const pages = joined(repos.map((r) => `https://huggingface.co/${r}`));
  if (!token)
    return `Some of these files are shared only with people who've accepted their license: accept it at ${pages} (signed in to Hugging Face), then add a Hugging Face token in Settings → People and cut-outs, where SAM 3.1 takes one`;
  const who = readSettings().huggingface?.name;
  for (const repo of repos) {
    const file = MODEL_FILES[names.find((n) => MODEL_FILES[n]?.gated === repo)!]!;
    const res = await fetch(file.url, { method: "HEAD", redirect: "manual", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
    if (!res) return "Couldn't reach Hugging Face; try again shortly";
    if (res.status === 401 || res.status === 403)
      return `Your Hugging Face token${who ? ` (${who})` : ""} can't fetch ${repo}'s files yet: accept the license at https://huggingface.co/${repo}, signed in as its owner, then try again`;
  }
  return undefined;
}

const joined = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * Fetches the model files the connected ComfyUI is missing for these workflows (all of them by default) into its own
 * folders, when it's on this computer: each checked against its SHA-256, resuming where a stopped one left off, and
 * the gated ones with the person's Hugging Face token. Node packs aren't fetched (they need ComfyUI restarted, which
 * ComfyUI Manager does). Returns at once; installStatus says how it's going.
 */
export async function installModels(names = Object.keys(WORKFLOWS)): Promise<InstallStatus> {
  if (install.state === "installing") return install;
  const base = comfyUrl();
  if (!base) return (install = { state: "error", detail: "Connect ComfyUI first" });
  const folders = await foldersHere(base);
  if (!folders) return (install = { state: "error", detail: "That ComfyUI isn't on this computer, so beatsheet can't put files in its folders. Fetch them on that computer." });
  const check = await checkComfy(base);
  const want = new Map<string, { folder: string; name: string }>();
  for (const w of check.workflows) if (names.includes(w.name) && !w.machine) for (const f of w.missing?.files ?? []) want.set(f.name, f);
  const unknown = [...want.values()].filter((f) => !MODEL_FILES[f.name]);
  if (unknown.length) return (install = { state: "error", detail: `beatsheet doesn't know where to get ${unknown.map((f) => f.name).join(", ")}` });
  const noFolder = [...want.values()].filter((f) => !folders[f.folder]);
  if (noFolder.length) return (install = { state: "error", detail: `ComfyUI didn't say where its ${[...new Set(noFolder.map((f) => f.folder))].join(", ")} folder is` });
  const files = [...want.values()];
  if (!files.length) return (install = { state: "done", files: [] });
  const token = files.some((f) => MODEL_FILES[f.name]!.gated) ? await getSecret("huggingface") : undefined;
  const gated = await gatedProblem(files.map((f) => f.name), token);
  if (gated) return (install = { state: "error", detail: gated });
  const total = files.reduce((n, f) => n + MODEL_FILES[f.name]!.bytes, 0);
  stop = new AbortController();
  const signal = stop.signal;
  install = { state: "installing", files: files.map((f) => f.name), file: files[0]!.name, done: 0, bytes: total, progress: 0 };
  void (async () => {
    let done = 0;
    try {
      for (const f of files) {
        const what = MODEL_FILES[f.name]!;
        install = { state: "installing", files: files.map((x) => x.name), file: f.name, done, bytes: total, progress: done / total };
        await download(what.gated ? { ...what, headers: { Authorization: `Bearer ${token}` } } : what, join(folders[f.folder]!, f.name), signal, (p) => {
          if (install.state === "installing") install = { ...install, progress: (done + p * what.bytes) / total };
        });
        done += what.bytes;
      }
      // Done once the server's been asked again, so what's shown (and what the fit check knows) says so too.
      await recheckComfy();
      install = { state: "done", files: files.map((f) => f.name) };
    } catch (err) {
      install = { state: "error", detail: signal.aborted ? "Stopped. Start it again to carry on from where it was." : err instanceof Error ? err.message : String(err) };
    } finally {
      stop = undefined;
    }
  })();
  return install;
}

// ---- Fitting what goes in, and trimming what comes out.

/** The size to make: the picture's shape at about `area` pixels, both sides a multiple of `multiple`. */
export function fitSize(width: number, height: number, area: number, multiple: number): { width: number; height: number } {
  const k = Math.sqrt(area / (width * height));
  const side = (x: number) => Math.max(multiple, Math.round((x * k) / multiple) * multiple);
  return { width: side(width), height: side(height) };
}

const cover = (w: number, h: number) => `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`;

/**
 * A reference picture for a still: upright, its transparency on light gray (ComfyUI's loader would make it black), and
 * no bigger than about 2 megapixels (the workflow takes each at one), so nothing is cut off.
 */
export async function fitReference(src: string, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(await pictureBytes(src)).rotate().flatten({ background: "#e4e4e4" }).resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).png().toFile(dest);
}

/** The picture, scaled to cover the size and cropped to it. */
export async function fitPicture(src: string, dest: string, w: number, h: number): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  await exec("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", cover(w, h), "-frames:v", "1", dest]);
}

/**
 * A stretch of a clip at the size and frame rate the workflow makes, its last frame held out to `frames` so no chunk
 * runs short (the take is trimmed back afterwards). No sound.
 */
export async function fitClip(src: string, dest: string, from: number, to: number, w: number, h: number, fps: number, frames: number): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const vf = `${cover(w, h)},fps=${fps},tpad=stop_mode=clone:stop=${frames}`;
  // The stretch is cut from what's read (-t before -i), so the padding after it isn't cut off too.
  await exec("ffmpeg", ["-v", "error", "-y", "-ss", from.toFixed(3), "-t", (to - from).toFixed(3), "-i", src, "-vf", vf, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", dest]);
}

/** A stretch of a clip at its own frame rate, and its own size unless given one, without its sound. */
export async function cutClip(src: string, dest: string, from: number, to: number, size?: { width: number; height: number }): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const scale = size ? ["-vf", `scale=${size.width}:${size.height}:flags=lanczos`] : [];
  await exec("ffmpeg", ["-v", "error", "-y", "-ss", from.toFixed(3), "-t", (to - from).toFixed(3), "-i", src, ...scale, "-an", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dest]);
}

/**
 * Sound laid on `seconds` of silence, as mono WAV: each piece a file's sound from a second of it (`from`), starting
 * `at` seconds in and running until the next thing it meets is the end.
 */
export async function laySound(pieces: { file: string; from: number; at: number }[], seconds: number, dest: string): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const chains = pieces.map(
    (p, i) => `[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=mono,atrim=start=${p.from.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(p.at * 1000)}:all=1[s${i}]`,
  );
  const mix = `[0:a]${pieces.map((_, i) => `[s${i}]`).join("")}amix=inputs=${pieces.length + 1}:duration=first:normalize=0[out]`;
  const inputs = pieces.flatMap((p) => ["-i", p.file]);
  const codec = dest.endsWith(".mp3") ? ["-c:a", "libmp3lame", "-b:a", "128k"] : ["-c:a", "pcm_s16le"];
  await exec("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-t", seconds.toFixed(3), "-i", "anullsrc=r=44100:cl=mono", ...inputs, "-filter_complex", [...chains, mix].join(";"), "-map", "[out]", ...codec, dest]);
}

/** A take without its sound: one that lip-syncs comes back saying the line, which the cut's voice already plays. */
export async function silence(file: string): Promise<void> {
  await exec("ffmpeg", ["-v", "error", "-y", "-i", file, "-map", "0:v", "-c", "copy", "-movflags", "+faststart", `${file}.tmp.mp4`]);
  renameSync(`${file}.tmp.mp4`, file);
}

/**
 * The take back to the stretch's own length: padding and the last chunk's overshoot come off the end. Its sound, from
 * a workflow that makes some, is kept to the same length.
 */
export async function trimTake(src: string, dest: string, fps: number, frames: number, sound = false): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true });
  const audio = sound ? ["-c:a", "aac", "-b:a", "192k", "-t", (frames / fps).toFixed(3)] : ["-an"];
  await exec("ffmpeg", ["-v", "error", "-y", "-i", src, "-vf", `fps=${fps}`, "-frames:v", String(frames), ...audio, "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${dest}.tmp.mp4`]);
  renameSync(`${dest}.tmp.mp4`, dest);
}
