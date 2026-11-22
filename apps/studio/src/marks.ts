/**
 * The marks of the services and agents beatsheet connects to, for the rows where a person picks or connects one.
 * A mark is a file in `marks/`, named for the service's id: `<id>.svg` or `<id>.png` is shown exactly as its owner
 * made it; `<id>.mask.svg` is a one-colour shape its owner means to be tinted, drawn in the text colour. A service
 * without a file gets a tile with its initial. The marks are their owners' trademarks; marks/README.md says where
 * each came from and why some services have none.
 */
const FILES = import.meta.glob<string>("./marks/*.{svg,png}", { eager: true, query: "?url", import: "default" });

/** What goes by another's mark: a plan or a CLI by its maker's, a model offered as a service by that service's. */
const SAME_AS: Record<string, string> = {
  chatgpt: "openai",
  codex: "openai",
  "openai-whisper": "openai",
  "muse-code": "meta",
  muse: "meta",
  scribe: "elevenlabs",
  isolator: "elevenlabs",
  seedvr: "fal",
  comfy: "comfyui",
};

/**
 * Files that carry their owner's clear space inside them, so the mark is only part of the picture: how much larger to
 * draw the file so the mark itself is the size of the others. The file isn't touched; its empty margin spills past the
 * slot. OpenAI's Blossom is the middle 51% of its file; ElevenLabs' two bars are a third of theirs in height.
 */
const LARGER: Record<string, number> = { openai: 1.9, elevenlabs: 2.7 };

/** A mark's file, whether it's a shape to tint rather than a picture to show as it is, and how much larger to draw it. */
export type MarkFile = { url: string; shape: boolean; scale?: number };

const KINDS = [
  { ext: ".svg", shape: false },
  { ext: ".png", shape: false },
  { ext: ".mask.svg", shape: true },
];

/** The file a mark is drawn from: the id's own, or the one it goes by. Nothing when we don't ship one. */
export function markFile(id: string, files: Record<string, string> = FILES): MarkFile | undefined {
  for (const name of new Set([id, SAME_AS[id] ?? id])) {
    for (const { ext, shape } of KINDS) {
      const url = files[`./marks/${name}${ext}`];
      if (url) return { url, shape, ...(LARGER[name] ? { scale: LARGER[name] } : {}) };
    }
  }
  return undefined;
}

/** The letter on the tile of a service without a mark. */
export const initial = (label: string) => ([...label.trim()][0] ?? "?").toUpperCase();
