import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { lineState, lineVoice, SCHEMA_VERSION, STAGE_IDS, voiceKey, type ProjectFile } from "@beatsheet/schema";

// Where projects live is read when the engine's modules load, so they're imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-narrate-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

// Every voice is one beatsheet can read with, and reading a line only says who read it.
const read = vi.hoisted(() => ({ by: [] as { voice: string; text: string }[] }));
vi.mock("../src/voices.ts", () => ({
  resolveVoice: async (wanted?: string) => wanted ?? "kokoro:af_heart",
  speak: async (voice: string, text: string, out: string) => {
    read.by.push({ voice, text });
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(out, ".."), { recursive: true });
    writeFileSync(`${out}.wav`, "");
    return { file: `${out}.wav`, duration: 1, words: text.split(" ").map((w, i) => ({ w, s: i * 0.2, e: i * 0.2 + 0.2 })) };
  },
}));

let narrate: typeof import("../src/narrate.ts").narrate;
let store: typeof import("../src/store.ts");

beforeAll(async () => {
  ({ narrate } = await import("../src/narrate.ts"));
  store = await import("../src/store.ts");
  const dir = join(process.env.BEATSHEET_PROJECTS!, "tale");
  mkdirSync(dir, { recursive: true });
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "tale",
    title: "The cat's tale",
    sources: [],
    brief: { goal: "A cat tells it in its own words" },
    assets: [],
    cast: [
      { id: "cat", name: "Marmalade", kind: "character", voice: "kokoro:bm_lewis" },
      { id: "dog", name: "Biscuit", kind: "character" },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "story",
        spec: {},
        formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "voice",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
});

describe("lines said by the cast", () => {
  it("reads a character's lines in its own voice, and the narrator's and the voiceless one's in the cut's", async () => {
    await narrate("tale", {
      voice: "kokoro:af_heart",
      lines: [
        { id: "open", text: "Every night the house sleeps." },
        { id: "cat", text: "Except me.", speaker: "cat" },
        { id: "dog", text: "And me.", speaker: "dog" },
      ],
    });
    expect(read.by).toEqual([
      { voice: "kokoro:af_heart", text: "Every night the house sleeps." },
      { voice: "kokoro:bm_lewis", text: "Except me." },
      { voice: "kokoro:af_heart", text: "And me." },
    ]);
    const { doc } = store.loadFile("tale");
    const cut = doc.cuts[0]!;
    expect(cut.voice?.voice).toBe("kokoro:af_heart");
    const cat = cut.voice!.lines.find((l) => l.id === "cat")!;
    expect(cat).toMatchObject({ speaker: "cat" });
    expect(cat.file).toContain(voiceKey("kokoro:bm_lewis", cat));
    expect(cut.voice!.lines.map((l) => lineState(lineVoice(cut.voice!.voice, l, doc.cast), l))).toEqual(["voiced", "voiced", "voiced"]);
  });

  it("reads only the lines whose voice changed when a character gets one, and gives a line back to the narrator", async () => {
    store.updateFile("tale", (d) => void (d.cast![1]!.voice = "kokoro:am_puck"));
    read.by = [];
    await narrate("tale", {});
    expect(read.by).toEqual([{ voice: "kokoro:am_puck", text: "And me." }]);

    read.by = [];
    await narrate("tale", { lines: [{ id: "cat", text: "Except me.", speaker: "" }] });
    expect(read.by).toEqual([{ voice: "kokoro:af_heart", text: "Except me." }]);
    expect(store.loadFile("tale").doc.cuts[0]!.voice!.lines.find((l) => l.id === "cat")!.speaker).toBeUndefined();
  });
});
