/**
 * The models beatsheet can ask for pictures and video, best first. A short list, curated by hand, not everything a
 * service offers: each entry says what the model takes and makes, and where it runs at what price. Prices are from
 * each service's own model page and only estimates; check them again when adding or changing an entry. A route whose
 * takes aren't simply free to use commercially says so (`commercial`): fal marks every model here for commercial use,
 * so it's the models run on your own card, under their own licenses, that mostly do.
 */
import type { CatalogModel } from "./make.ts";

export const CATALOG: CatalogModel[] = [
  {
    id: "nano-banana-2.1",
    label: "Nano Banana 2.1",
    by: "Google",
    note: "Stills and boards: the newer Nano Banana, far higher in blind votes for about the same price; keeps a character from reference pictures.",
    ops: ["image"],
    // Up to 14 pictures, 4 of them people or characters.
    takes: { refs: 14 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    wait: 20,
    // fal.ai/models/google/nano-banana-2.1 and its /edit: billed by the token, about $0.04 an image at 1K. On the Gemini
    // API it's gemini-nano-banana-2.1, about $0.034 at 1K.
    routes: [
      { via: "fal", shape: "nano-banana", endpoints: { text: "google/nano-banana-2.1", refs: "google/nano-banana-2.1/edit" }, price: { perImage: 0.04 } },
      { via: "gemini", shape: "gemini-image", endpoints: { text: "gemini-nano-banana-2.1", refs: "gemini-nano-banana-2.1" }, price: { perImage: 0.034 } },
    ],
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    by: "Google",
    note: "The first Nano Banana: stills and boards, keeps a character from reference pictures. Google retires it on March 15, 2027.",
    ops: ["image"],
    takes: { refs: 4 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    wait: 15,
    // fal.ai/models/fal-ai/nano-banana: $0.0398 an image. On the Gemini API it's gemini-2.5-flash-image: 1,290 tokens
    // out at $30 a million, about $0.039. Google shuts gemini-2.5-flash-image down on March 15, 2027.
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
    note: "First in blind votes for stills: follows long, exact prompts, keeps a real face from its photos and draws legible text; slower.",
    ops: ["image"],
    // Its edits take up to 16 pictures.
    takes: { refs: 10 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    wait: 60,
    // developers.openai.com/api/docs/guides/image-generation: billed by the token ($5 a million in, $8 for pictures
    // in, $30 out). At medium quality a 9:16 board from one picture cost 1.7¢; 3¢ leaves room for more pictures and
    // wider shapes. The take records what it actually cost. Codex makes it on the person's ChatGPT plan instead,
    // from its allowance rather than by the token. fal sells the same model by the token at the same rates.
    routes: [
      { via: "openai", shape: "images-api", endpoints: { text: "gpt-image-2.5-flare", refs: "gpt-image-2.5-flare" }, price: { perImage: 0.03 } },
      { via: "chatgpt", shape: "plan", endpoints: { text: "gpt-image", refs: "gpt-image" }, price: { perImage: 0 } },
      { via: "fal", shape: "gpt-image", endpoints: { text: "openai/gpt-image-2.5/flare/text-to-image", refs: "openai/gpt-image-2.5/flare/edit" }, price: { perImage: 0.03 } },
    ],
  },
  {
    id: "flux3-klein",
    label: "FLUX 3 Image Klein",
    by: "Black Forest Labs",
    note: "Open weights: stills and boards on your own graphics card through ComfyUI, in seconds and for nothing; keeps a character from reference pictures.",
    ops: ["image"],
    takes: { refs: 10 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    // On an RTX 4090, through beatsheet: a 944×1680 board of a cast member from its sheet took 15 seconds with the model
    // loading, a 1680×944 still from the prompt alone 9 once it was loaded.
    wait: 15,
    // huggingface.co/black-forest-labs/flux-3-image-klein: 5.6B, distilled to 16 steps, up to 10 references. The FLUX
    // Kommunity License lets people and companies under $5M a year use what it makes commercially. The endpoint is the
    // workflow's name in the ComfyUI folder (comfy.ts).
    routes: [
      {
        via: "comfy",
        shape: "flux3-klein",
        endpoints: { text: "flux3-klein", refs: "flux3-klein" },
        price: { perImage: 0 },
        commercial: { use: "limited", why: "The FLUX Kommunity License allows commercial use of what it makes for people and companies making under $5M a year" },
      },
    ],
  },
  {
    id: "minimax-h3-max-turbo",
    label: "H3 Max Turbo",
    by: "MiniMax, tuned by fal",
    note: "A cheap rough from the best-value family in blind votes: fal's quickest tuning of MiniMax H3, from a board or a prompt, 5 to 15 seconds, with its own sound.",
    ops: ["video"],
    tier: "rough",
    takes: { start: true, end: true },
    lengths: { min: 5, max: 15 },
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    sound: true,
    wait: 60,
    // fal.ai/models/minimax/h3-max-turbo: half of H3 Max's $0.08 a second at 768p (its standard rate from November 16, 2026).
    routes: [
      {
        via: "fal",
        shape: "minimax-h3-max-turbo",
        endpoints: { text: "minimax/h3-max-turbo/text-to-video", start: "minimax/h3-max-turbo/image-to-video" },
        price: { perSecond: 0.04 },
      },
    ],
  },
  {
    id: "minimax-h3-max",
    label: "H3 Max",
    by: "MiniMax, tuned by fal",
    note: "MiniMax H3 tuned by fal for following the prompt, the look and the sound, at 1080p: from a board or a prompt, 5 to 15 seconds, with its own sound.",
    ops: ["video"],
    tier: "final",
    takes: { start: true, end: true },
    lengths: { min: 5, max: 15 },
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    sound: true,
    wait: 150,
    // fal.ai/models/minimax/h3-max: $0.16 a second at 1080p (refined from its 768p), its standard rate from November 16, 2026.
    routes: [
      {
        via: "fal",
        shape: "minimax-h3-max",
        endpoints: { text: "minimax/h3-max/text-to-video", start: "minimax/h3-max/image-to-video" },
        price: { perSecond: 0.16 },
      },
    ],
  },
  {
    id: "wan-3",
    label: "Wan 3.0",
    by: "Alibaba",
    note: "First in blind votes from a prompt; roughs at 480p and finals at 1080p, 2 to 30 seconds in one take, with its own sound. Animates real people some others refuse.",
    ops: ["video"],
    // No tier: the same model makes both, roughs smaller (fal.ts), so the final is the rough's model made larger.
    takes: { start: true, end: true, refs: 10 },
    lengths: Array.from({ length: 29 }, (_, i) => i + 2),
    aspects: ["16:9", "4:3", "1:1", "3:4", "9:16"],
    sound: true,
    // A 30-second take at 1080p took about 14 minutes in one test.
    wait: 180,
    // fal.ai/models/alibaba/wan-3.0/image-to-video: $0.05 a second at 480p, $0.20 at 1080p, sound included. Closed
    // weights, unlike Wan 2.2.
    routes: [
      {
        via: "fal",
        shape: "wan-3",
        endpoints: { text: "alibaba/wan-3.0/text-to-video", start: "alibaba/wan-3.0/image-to-video", refs: "alibaba/wan-3.0/reference-to-video" },
        price: { perSecond: 0.05, finalPerSecond: 0.2 },
      },
    ],
  },
  {
    id: "minimax-h3",
    label: "MiniMax H3",
    by: "MiniMax",
    note: "Open weights: 5 to 15 seconds with its own sound, from a board, a prompt, or up to 9 reference pictures. On fal, or from a board on your own graphics card through ComfyUI, where its license leaves out the US, EU, UK and South Korea.",
    ops: ["video"],
    tier: "rough",
    takes: { start: true, end: true, refs: 9 },
    lengths: { min: 5, max: 15 },
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    sound: true,
    wait: 120,
    routes: [
      // fal.ai/models/minimax/h3: $0.06 a second at 768p (made natively; 2K and 4K are upscaled from it). The first 5
      // reference pictures are free, $0.08 for each after.
      {
        via: "fal",
        shape: "minimax-h3",
        endpoints: { text: "minimax/h3/text-to-video", start: "minimax/h3/image-to-video", refs: "minimax/h3/reference-to-video" },
        price: { perSecond: 0.06 },
      },
      // The open weights (pruned INT8, with the NVFP4 text encoder) from a board, and an end frame if there is one:
      // 124 to 362 frames at 24 a second (comfy.ts). The MiniMax H3 Community License grants rights only outside the
      // EU, UK, South Korea and US; Comfy sells the commercial license for output made locally (docs/MODELS.md).
      {
        via: "comfy",
        shape: "minimax-h3",
        endpoints: { start: "minimax-h3-i2v" },
        price: { perSecond: 0 },
        takes: { refs: 0 },
        wait: 900,
        commercial: { use: "no", why: "The MiniMax H3 Community License grants nothing in the US, EU, UK or South Korea, and commercial use of what it makes needs a license bought through Comfy (fal's H3 has no such limit)" },
      },
    ],
  },
  {
    id: "kling-4",
    label: "Kling 4.0",
    by: "Kuaishou",
    note: "Follows camera moves best (the only one that orbited on request) and keeps time in long takes: 3 to 30 seconds, roughs at 720p, finals at 1080p.",
    ops: ["video"],
    takes: { start: true, end: true },
    lengths: Array.from({ length: 28 }, (_, i) => i + 3),
    aspects: ["16:9", "21:9", "1:1", "9:16"],
    // Kling says it makes its own sound; fal has no switch for it.
    sound: true,
    // A 30-second take took about 8 minutes in one test.
    wait: 180,
    // fal.ai/models/kling/v4/image-to-video: $0.157 a second at 720p, $0.235 at 1080p.
    routes: [
      {
        via: "fal",
        shape: "kling-4",
        endpoints: { text: "kling/v4/text-to-video", start: "kling/v4/image-to-video" },
        price: { perSecond: 0.157, finalPerSecond: 0.235 },
      },
    ],
  },
  {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    by: "ByteDance",
    note: "First in blind votes from a board, and for dialogue, bodies in motion and weight: 4 to 30 seconds with its own sound, up to 30 reference pictures. The dearest here, and it won't draw real people.",
    ops: ["video"],
    takes: { start: true, end: true, refs: 30 },
    lengths: Array.from({ length: 27 }, (_, i) => i + 4),
    aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
    sound: true,
    refusesRealPeople: true,
    // fal measured a 10-second take at 278 seconds.
    wait: 240,
    // fal.ai/models/bytedance/seedance-2.5/us/image-to-video: about $0.22 a second at 480p, $1.16 at 1080p, sound or not.
    // Runway's API sells it for less ($0.68 a second at 1080p); its 480p draft can be finished at 1080p by its draft_id,
    // which beatsheet doesn't do yet.
    routes: [
      {
        via: "fal",
        shape: "seedance-2.5",
        endpoints: { text: "bytedance/seedance-2.5/us/text-to-video", start: "bytedance/seedance-2.5/us/image-to-video", refs: "bytedance/seedance-2.5/us/reference-to-video" },
        price: { perSecond: 0.2205, finalPerSecond: 1.164 },
      },
    ],
  },
  {
    id: "gemini-omni-flash",
    label: "Gemini Omni Flash",
    by: "Google",
    note: "First with public voters and for sound from a prompt; 3 to 10 seconds, wide or tall, roughs at 360p for pennies. It won't draw real people.",
    ops: ["video"],
    takes: { start: true, end: true },
    lengths: [3, 4, 5, 6, 7, 8, 9, 10],
    aspects: ["16:9", "9:16"],
    sound: true,
    refusesRealPeople: true,
    wait: 120,
    // fal.ai/models/google/gemini-omni-flash/v1.1/image-to-video: $0.03 a second at 360p, $0.15 at 1080p (upscaled).
    routes: [
      {
        via: "fal",
        shape: "gemini-omni",
        endpoints: { text: "google/gemini-omni-flash/v1.1/text-to-video", start: "google/gemini-omni-flash/v1.1/image-to-video" },
        price: { perSecond: 0.03, finalPerSecond: 0.15 },
      },
    ],
  },
  {
    id: "wan-2.2",
    label: "Wan 2.2",
    by: "Alibaba",
    note: "Open weights: up to 10 seconds on fal, or up to 5 from a board on your own graphics card through ComfyUI, free, private and with nothing softened. No sound.",
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
      { via: "comfy", shape: "wan-i2v", endpoints: { start: "wan22-i2v" }, price: { perSecond: 0 }, lengths: { min: 1.1, max: 5 }, wait: 60, takes: { end: false } },
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
    note: "For finals from a board, 3 to 15 seconds, without its own sound. Blind votes now put H3 Max ahead of it.",
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
    id: "kling-2.5-turbo",
    label: "Kling 2.5 Turbo",
    by: "Kuaishou",
    note: "Lively motion; starts from a picture and can end on another. Ranked well below the newer models now, and H3 Max Turbo costs less.",
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
  {
    id: "kling-motion",
    label: "Kling Motion Control",
    by: "Kuaishou",
    note: "Copies the movement in a clip onto the people in a board, on fal: no graphics card needed, up to 30 seconds.",
    ops: ["video"],
    takes: { start: true, drive: true },
    lengths: { min: 3, max: 30 },
    aspects: ["any"],
    wait: 300,
    // fal.ai/models/fal-ai/kling-video/v3/pro/motion-control: $0.168 a second, framed as the clip is.
    routes: [{ via: "fal", shape: "kling-motion", endpoints: { drive: "fal-ai/kling-video/v3/pro/motion-control" }, price: { perSecond: 0.168 } }],
  },

  // ---- Lip sync: a board made to say a line ("talk"), or the mouths in a clip changed to say it ("dub"). What's said
  // is the cut's voice where the shot plays (make.ts), so the take lines up with the line; it comes in silent. Research
  // in research_notes/Lip sync/notes.md: no blind comparison exists yet, so the order follows price and the vendors'
  // consensus (sync-3 first for dubbing).
  {
    id: "minimax-h3-max-lipsync",
    label: "H3 Max Lip Sync",
    by: "MiniMax, tuned by fal",
    note: "Makes a board say a line: the cheapest that does, and the longest (5 seconds to 15 minutes); 480p roughs, 1080p finals. Takes real people.",
    ops: ["video"],
    // No tier: roughs smaller, as for H3 Max itself.
    takes: { start: true, speech: true },
    lengths: { min: 5, max: 900 },
    aspects: ["any"],
    wait: 120,
    // fal.ai/models/minimax/h3-max/lip-sync/image-to-video: $0.05 a second at 480p, $0.16 at 1080p, as long as what it
    // says; past 15 seconds it's 1.2 times that, which the estimate leaves out.
    routes: [{ via: "fal", shape: "h3-max-lipsync", endpoints: { talk: "minimax/h3-max/lip-sync/image-to-video" }, price: { perSecond: 0.05, finalPerSecond: 0.16 } }],
  },
  {
    id: "sync-3",
    label: "sync-3",
    by: "sync.",
    note: "Changes the mouths in a clip to say a line, keeping everything else: the vendors' pick for dubbing, whole shot at once, close-ups, profiles and hands in front of the mouth. Also makes a board talk.",
    ops: ["video"],
    tier: "final",
    takes: { start: true, clip: true, speech: true },
    // fal states no limits; sync.so's own refuses more than 4096×2160.
    lengths: { min: 1, max: 300 },
    aspects: ["any"],
    wait: 120,
    // fal.ai/models/fal-ai/sync-lipsync/v3 and its /image-to-video: $8 a minute, about $0.133 a second.
    routes: [{ via: "fal", shape: "sync", endpoints: { dub: "fal-ai/sync-lipsync/v3", talk: "fal-ai/sync-lipsync/v3/image-to-video" }, price: { perSecond: 0.1333 } }],
  },
  {
    id: "lipsync-2-pro",
    label: "Lipsync 2 Pro",
    by: "sync.",
    note: "sync.'s earlier dubbing model, for easy shots (a face toward the camera, nothing in front of the mouth) at about two thirds of sync-3's price.",
    ops: ["video"],
    tier: "final",
    takes: { clip: true, speech: true },
    lengths: { min: 1, max: 300 },
    aspects: ["any"],
    wait: 120,
    // fal.ai/models/fal-ai/sync-lipsync/v2/pro: $5 a minute, about $0.083 a second.
    routes: [{ via: "fal", shape: "sync", endpoints: { dub: "fal-ai/sync-lipsync/v2/pro" }, price: { perSecond: 0.0833 } }],
  },
  {
    id: "kling-lipsync",
    label: "Kling Lip Sync",
    by: "Kuaishou",
    note: "Changes the mouths in a clip for next to nothing, to judge the cut: 2 to 10 seconds of clip (sent at 720p or more).",
    ops: ["video"],
    tier: "rough",
    takes: { clip: true, speech: true },
    lengths: { min: 2, max: 10 },
    aspects: ["any"],
    wait: 120,
    // fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video: $0.014 a second of clip, rounded up to 5 seconds. The
    // clip has to be 720 to 1920 pixels a side (make.ts sends it so).
    routes: [{ via: "fal", shape: "kling-lipsync", endpoints: { dub: "fal-ai/kling-video/lipsync/audio-to-video" }, price: { perSecond: 0.014, minimum: 0.07 } }],
  },
  {
    id: "latentsync",
    label: "LatentSync 1.6",
    by: "ByteDance",
    note: "Changes the mouths in a clip by repainting only the mouth and pasting it back, so the rest keeps its size and sharpness: the open model for real footage (first on mouth accuracy in one 2026 study, last overall in another). Best on faces toward the camera.",
    ops: ["video"],
    takes: { clip: true, speech: true },
    lengths: { min: 1, max: 300 },
    aspects: ["any"],
    wait: 120,
    // fal.ai/models/fal-ai/latentsync: $0.20 a take up to 40 seconds, then $0.005 a second, which fal sells for
    // commercial use. Run anywhere else, its InsightFace face detector is for non-commercial research only.
    routes: [{ via: "fal", shape: "latentsync", endpoints: { dub: "fal-ai/latentsync" }, price: { perSecond: 0.005, minimum: 0.2 } }],
  },
  {
    id: "kling-avatar-2-pro",
    label: "Kling Avatar 2 Pro",
    by: "Kuaishou",
    note: "Makes a board talk, people, animals or cartoons; more accurate mouths than OmniHuman in one vendor's test, less steady.",
    ops: ["video"],
    tier: "final",
    takes: { start: true, speech: true },
    // fal states no maximum; a minute keeps it to what's been seen to work.
    lengths: { min: 2, max: 60 },
    aspects: ["any"],
    wait: 180,
    // fal.ai/models/fal-ai/kling-video/ai-avatar/v2/pro: $0.115 a second, as long as what it says.
    routes: [{ via: "fal", shape: "kling-avatar", endpoints: { talk: "fal-ai/kling-video/ai-avatar/v2/pro" }, price: { perSecond: 0.115 } }],
  },
  {
    id: "omnihuman-2",
    label: "OmniHuman 2",
    by: "ByteDance",
    note: "Makes a board talk with the whole body acting to the voice; 4 seconds to 5 minutes. Its size isn't published.",
    ops: ["video"],
    takes: { start: true, speech: true },
    lengths: { min: 4, max: 300 },
    aspects: ["any"],
    wait: 180,
    // fal.ai/models/bytedance/omnihuman/v2: $0.105 a second; what it says as WAV or MP3 up to 15 MB.
    routes: [{ via: "fal", shape: "omnihuman", endpoints: { talk: "bytedance/omnihuman/v2" }, price: { perSecond: 0.105 } }],
  },
  {
    id: "longcat-avatar",
    label: "LongCat Avatar",
    by: "Meituan",
    note: "Makes a board talk, the whole body acting to the voice, in steps of about 5 seconds up to 50; 480p roughs, 720p finals. Its makers' own study put version 1.5 ahead of Kling Avatar 2.0 and OmniHuman 1.5; fal doesn't say which version it runs.",
    ops: ["video"],
    takes: { start: true, speech: true },
    // Its length is set in segments, not by the sound: about 5.8 seconds for the first and 5 for each after, up to 10.
    lengths: Array.from({ length: 10 }, (_, i) => Math.round((5.8 + 5 * i) * 10) / 10),
    aspects: ["any"],
    wait: 300,
    // fal.ai/models/fal-ai/longcat-single-avatar/image-audio-to-video: $0.15 a second at 480p, $0.30 at 720p. fal
    // doesn't say whether it's LongCat-Video-Avatar 1.0 or 1.5.
    routes: [
      {
        via: "fal",
        shape: "longcat-avatar",
        endpoints: { talk: "fal-ai/longcat-single-avatar/image-audio-to-video" },
        price: { perSecond: 0.15, finalPerSecond: 0.3 },
        commercial: { use: "unclear", why: "fal sells it for commercial use, but LongCat-Video-Avatar's own page says what it makes is for academic use only" },
      },
    ],
  },
  {
    id: "veed-fabric",
    label: "VEED Fabric 1.0",
    by: "VEED",
    note: "Makes a board talk: 480p roughs, 720p finals. First in VEED's own test (which left sync-3 out).",
    ops: ["video"],
    takes: { start: true, speech: true },
    // fal states no limits; a minute keeps it to what's been seen to work.
    lengths: { min: 1, max: 60 },
    aspects: ["any"],
    wait: 120,
    // fal.ai/models/veed/fabric-1.0: $0.08 a second at 480p, $0.15 at 720p. Its /fast route costs more.
    routes: [{ via: "fal", shape: "veed-fabric", endpoints: { talk: "veed/fabric-1.0" }, price: { perSecond: 0.08, finalPerSecond: 0.15 } }],
  },
  {
    id: "infinitetalk",
    label: "InfiniteTalk",
    by: "MeiGen",
    note: "Makes a board say a line, with the head and body moving to it: open (Apache 2.0), on Wan 2.1 at 480p. On your own graphics card through ComfyUI, or on fal.",
    ops: ["video"],
    takes: { start: true, speech: true },
    lengths: { min: 1, max: 28.8 },
    aspects: ["any"],
    wait: 300,
    routes: [
      // github.com/MeiGen-AI/InfiniteTalk, through ComfyUI's own WanInfiniteTalkToVideo node; the endpoint is the
      // workflow's name in the ComfyUI folder (comfy.ts). 81 frames at 25 a second, then 72 more for each of four
      // chunks after: 369 frames, 14.76 seconds. Not run here yet; about a minute a chunk on an RTX 4090 is a guess.
      { via: "comfy", shape: "infinitetalk", endpoints: { talk: "infinitetalk" }, price: { perSecond: 0 }, lengths: { min: 1, max: 14.7 } },
      // fal.ai/models/fal-ai/infinitalk (spelled so): $0.20 a second at 480p, 41 to 721 frames at 25 a second.
      { via: "fal", shape: "infinitalk", endpoints: { talk: "fal-ai/infinitalk" }, price: { perSecond: 0.2 }, lengths: { min: 1.7, max: 28.8 }, wait: 180 },
    ],
  },
];
