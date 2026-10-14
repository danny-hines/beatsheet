import type { Format } from "./types.ts";

/** Output formats a new project can pick from. */
export const FORMAT_PRESETS: (Format & { hint: string })[] = [
  { id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30, platforms: ["Instagram Reels", "TikTok", "YouTube Shorts"], hint: "Reels, TikTok, Shorts" },
  { id: "landscape", label: "16:9", width: 1920, height: 1080, fps: 30, platforms: ["YouTube", "LinkedIn", "X"], hint: "YouTube, LinkedIn" },
  { id: "square", label: "1:1", width: 1080, height: 1080, fps: 30, platforms: ["Instagram feed", "Facebook"], hint: "Instagram and Facebook feed" },
  { id: "portrait", label: "4:5", width: 1080, height: 1350, fps: 30, platforms: ["Instagram feed"], hint: "Instagram feed, taller" },
];

export function formatPreset(id: string): Format | undefined {
  const p = FORMAT_PRESETS.find((f) => f.id === id);
  if (!p) return undefined;
  const { hint: _hint, ...format } = p;
  return format;
}

/** A project id from a title: lowercase words joined by dashes. */
export const slugify = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project";
