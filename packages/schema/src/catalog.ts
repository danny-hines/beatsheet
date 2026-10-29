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
    // fal.ai/models/fal-ai/nano-banana: $0.0398 an image.
    routes: [{ via: "fal", shape: "nano-banana", endpoints: { text: "fal-ai/nano-banana", refs: "fal-ai/nano-banana/edit" }, price: { perImage: 0.0398 } }],
  },
  {
    id: "muse-image",
    label: "Muse Image",
    by: "Meta",
    note: "Cheap stills and boards; keeps a character from reference pictures.",
    ops: ["image"],
    // It takes up to 10; 4 like the others, since a request gives every still model the same pictures.
    takes: { refs: 4 },
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
    takes: { refs: 4 },
    aspects: ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"],
    wait: 60,
    // developers.openai.com/api/docs/guides/image-generation: billed by the token, about 4 to 5¢ a picture at medium
    // quality; the take records what it actually cost. Codex makes it on the person's ChatGPT plan instead, from its
    // allowance rather than by the token.
    routes: [
      { via: "openai", shape: "images-api", endpoints: { text: "gpt-image-2.5-flare", refs: "gpt-image-2.5-flare" }, price: { perImage: 0.053 } },
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
    note: "Open weights, cheaper; any length up to 10 seconds.",
    ops: ["video"],
    tier: "rough",
    takes: { start: true, end: true },
    lengths: { min: 1.1, max: 10 },
    aspects: ["16:9", "9:16", "1:1"],
    wait: 150,
    // fal.ai/models/fal-ai/wan/v2.2-a14b: $0.08 a second at 720p, counted at 16 frames a second.
    routes: [
      {
        via: "fal",
        shape: "wan",
        endpoints: { text: "fal-ai/wan/v2.2-a14b/text-to-video", start: "fal-ai/wan/v2.2-a14b/image-to-video" },
        price: { perSecond: 0.08 },
      },
    ],
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
];
