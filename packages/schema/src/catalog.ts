/**
 * The models beatsheet can ask for pictures and video, best first. A short list, curated by hand, not everything a
 * service offers: each entry says what the model takes and makes, and where it runs at what price. Prices are from
 * each service's own model page and only estimates; check them again when adding or changing an entry.
 */
import type { CatalogModel } from "./make.ts";

export const CATALOG: CatalogModel[] = [
  {
    id: "nano-banana",
    label: "Nano Banana",
    by: "Google",
    note: "Stills and boards; keeps a character from reference pictures.",
    ops: ["image"],
    takes: { refs: 4 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    wait: 15,
    // fal.ai/models/fal-ai/nano-banana: $0.0398 an image. On the Gemini API it's gemini-2.5-flash-image: 1,290 tokens
    // out at $30 a million, about $0.039.
    routes: [
      { via: "fal", shape: "nano-banana", endpoints: { text: "fal-ai/nano-banana", refs: "fal-ai/nano-banana/edit" }, price: { perImage: 0.0398 } },
      { via: "gemini", shape: "gemini-image", endpoints: { text: "gemini-2.5-flash-image", refs: "gemini-2.5-flash-image" }, price: { perImage: 0.039 } },
    ],
  },
  {
    id: "muse-image",
    label: "Muse Image",
    by: "Meta",
    note: "Cheap stills and boards; keeps a character from reference pictures.",
    ops: ["image"],
    takes: { refs: 10 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    wait: 20,
    // dev.meta.ai/docs/image-generation: $0.01 an image, whatever its size. Muse Code's own image tool makes it on the
    // person's plan instead, where Meta has turned that tool on for them.
    routes: [
      { via: "meta", shape: "images-api", endpoints: { text: "muse-image-1.0", refs: "muse-image-1.0" }, price: { perImage: 0.01 } },
      { via: "muse-code", shape: "plan", endpoints: { text: "muse-image-1.0", refs: "muse-image-1.0" }, price: { perImage: 0 } },
    ],
  },
  {
    id: "gpt-image",
    label: "GPT Image",
    by: "OpenAI",
    note: "Follows long, exact prompts and draws legible text; slower.",
    ops: ["image"],
    // Its edits take up to 16 pictures.
    takes: { refs: 10 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    wait: 60,
    // developers.openai.com/api/docs/guides/image-generation: billed by the token ($5 a million in, $8 for pictures
    // in, $30 out). At medium quality a 9:16 board from one picture cost 1.7¢; 3¢ leaves room for more pictures and
    // wider shapes. The take records what it actually cost. Codex makes it on the person's ChatGPT plan instead,
    // from its allowance rather than by the token.
    routes: [
      { via: "openai", shape: "images-api", endpoints: { text: "gpt-image-2.5-flare", refs: "gpt-image-2.5-flare" }, price: { perImage: 0.03 } },
      { via: "chatgpt", shape: "plan", endpoints: { text: "gpt-image", refs: "gpt-image" }, price: { perImage: 0 } },
    ],
  },
  {
    id: "kling-2.5-turbo",
    label: "Kling 2.5 Turbo",
    by: "Kuaishou",
    note: "Lively, believable motion; starts from a picture and can end on another.",
    ops: ["video"],
    tier: "rough",
    takes: { start: true, end: true },
    lengths: [5, 10],
    aspects: ["16:9", "9:16", "1:1"],
    wait: 120,
    // fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro: $0.35 for 5 seconds, $0.07 a second after.
    routes: [
      {
        via: "fal",
        shape: "kling",
        endpoints: { text: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video", start: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video" },
        price: { perSecond: 0.07 },
      },
    ],
  },
  {
    id: "wan-2.2",
    label: "Wan 2.2",
    by: "Alibaba",
    note: "Open weights, cheaper; any length up to 10 seconds on fal, or up to 5 from a board on your own graphics card through ComfyUI.",
    ops: ["video"],
    tier: "rough",
    takes: { start: true, end: true },
    lengths: { min: 1.1, max: 10 },
    aspects: ["16:9", "9:16", "1:1"],
    wait: 150,
    routes: [
      // fal.ai/models/fal-ai/wan/v2.2-a14b: $0.08 a second at 720p, counted at 16 frames a second.
      {
        via: "fal",
        shape: "wan",
        endpoints: { text: "fal-ai/wan/v2.2-a14b/text-to-video", start: "fal-ai/wan/v2.2-a14b/image-to-video" },
        price: { perSecond: 0.08 },
      },
      // The 14B's two halves (fp8) and their 4-step LoRAs, from a board: 81 frames at 16 a second at most (comfy.ts).
      // A 3-second rough (832×480) took 38 seconds on an RTX 4090.
      { via: "comfy", shape: "wan-i2v", endpoints: { start: "wan22-i2v" }, price: { perSecond: 0 }, lengths: { min: 1.1, max: 5 }, wait: 60 },
    ],
  },
  {
    id: "wan-2.2-5b",
    label: "Wan 2.2 5B",
    by: "Alibaba",
    note: "The small Wan 2.2, from a board: runs on a Mac's own chip or a smaller graphics card, through ComfyUI. Softer and slower for its size than the 14B.",
    ops: ["video"],
    tier: "rough",
    takes: { start: true },
    // 121 frames at 24 a second at most.
    lengths: { min: 1, max: 5 },
    aspects: ["any"],
    // A 3-second rough (1248×704, 12 steps) took a minute on an RTX 4090; on a Mac's chip, many times that (not measured).
    wait: 120,
    routes: [{ via: "comfy", shape: "wan-i2v", endpoints: { start: "wan22-ti2v-5b" }, price: { perSecond: 0 } }],
  },
  {
    id: "kling-3",
    label: "Kling 3 Pro",
    by: "Kuaishou",
    note: "For finals: the best motion here, from a board, 3 to 15 seconds.",
    ops: ["video"],
    tier: "final",
    takes: { start: true, end: true },
    lengths: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspects: ["16:9", "9:16", "1:1"],
    wait: 180,
    // fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video: $0.112 a second with its own sound off. Only from a picture.
    routes: [{ via: "fal", shape: "kling-3", endpoints: { start: "fal-ai/kling-video/v3/pro/image-to-video" }, price: { perSecond: 0.112 } }],
  },
  {
    id: "scail-2",
    label: "SCAIL-2",
    by: "Z.ai",
    note: "Copies the movement in a clip onto the people in a board: a fight, a dance or a stunt acted out by anyone, two people at once. On your own graphics card, through ComfyUI.",
    ops: ["video"],
    // No tier: it's the one model that follows a clip, for roughs (its fast workflow) and finals (its full one) alike.
    takes: { start: true, drive: true },
    // Its workflow chains 81 frames at 30 a second, then 76 more for each of two extensions: 233 frames, 7.8 seconds.
    // Shorter stretches are padded out with their last frame and trimmed back.
    lengths: { min: 1, max: 7.7 },
    aspects: ["any"],
    // A 3-second rough (two chunks, the fast workflow at 1248×704) took 13 minutes on an RTX 4090, about a minute a
    // step. The full workflow's 40 steps at cfg 5 will take hours.
    wait: 800,
    // huggingface.co/zai-org/SCAIL-2 (MIT). The endpoint is the workflow's name in the ComfyUI folder (comfy.ts).
    routes: [{ via: "comfy", shape: "scail-2", endpoints: { drive: "scail2-animation" }, price: { perSecond: 0 } }],
  },
  {
    id: "wan-2.2-animate",
    label: "Wan 2.2 Animate",
    by: "Alibaba",
    note: "Copies one person's movement and face from a clip onto the person in a board: good for a solo move or a close-up, and anyone else in the board stays put. Not for two people moving together. On your own graphics card, through ComfyUI.",
    ops: ["video"],
    takes: { start: true, drive: true },
    // 77 frames at 30 a second, then 72 more for each of three extensions: 293 frames, 9.8 seconds.
    lengths: { min: 1, max: 9.7 },
    aspects: ["any"],
    // A 3-second rough (two chunks, the fast workflow at 832×480) took 4 minutes on an RTX 4090.
    wait: 300,
    // huggingface.co/Wan-AI/Wan2.2-Animate-14B, in move mode (the person's movement, the board's look).
    routes: [{ via: "comfy", shape: "wan-animate", endpoints: { drive: "wan-animate-move" }, price: { perSecond: 0 } }],
  },
];
