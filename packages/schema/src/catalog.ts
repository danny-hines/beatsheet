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
