import { describe, expect, it } from "vitest";
import { initial, markFile } from "../src/marks.ts";

describe("service marks", () => {
  const files = { "./marks/openai.svg": "/openai.svg", "./marks/fal.png": "/fal.png", "./marks/codex.svg": "/codex.svg", "./marks/elevenlabs.mask.svg": "/eleven.svg" };

  it("finds a service's own mark by its id, shown as it is", () => {
    expect(markFile("fal", files)).toEqual({ url: "/fal.png", shape: false });
  });

  it("knows a shape that's meant to be tinted from a picture", () => {
    expect(markFile("elevenlabs", files)).toMatchObject({ url: "/eleven.svg", shape: true });
  });

  it("gives a plan or a hosted model the mark of what it runs on", () => {
    expect(markFile("chatgpt", files)?.url).toBe("/openai.svg");
    expect(markFile("openai-whisper", files)?.url).toBe("/openai.svg");
    expect(markFile("seedvr", files)?.url).toBe("/fal.png");
    expect(markFile("scribe", files)?.url).toBe("/eleven.svg");
  });

  it("draws a file that's mostly clear space larger, for everything that goes by it", () => {
    expect(markFile("openai", files)).toEqual({ url: "/openai.svg", shape: false, scale: 1.9 });
    expect(markFile("chatgpt", files)?.scale).toBe(1.9);
    expect(markFile("scribe", files)).toEqual({ url: "/eleven.svg", shape: true, scale: 2.7 });
    expect(markFile("fal", files)?.scale).toBeUndefined();
  });

  it("prefers a mark of its own when there is one", () => {
    expect(markFile("codex", files)?.url).toBe("/codex.svg");
  });

  it("has nothing for a service we ship no mark for, which gets its initial instead", () => {
    expect(markFile("tein", files)).toBeUndefined();
    expect(markFile("muse", files)).toBeUndefined();
    expect(initial(" fal")).toBe("F");
    expect(initial("")).toBe("?");
  });

  it("ships the marks its README lists", () => {
    // Read here rather than through marks.ts: vitest keeps a module's list of files until the module itself changes.
    const found = import.meta.glob<string>("../src/marks/*.{svg,png}", { eager: true, query: "?url", import: "default" });
    const shipped = Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace("../src/", "./"), url]));
    for (const id of ["antigravity", "comfyui", "elevenlabs", "fal", "gemini", "higgsfield", "openai", "openrouter", "replicate", "tein"]) expect(markFile(id, shipped), id).toBeDefined();
    for (const id of ["codex", "chatgpt", "openai-whisper"]) expect(markFile(id, shipped), id).toEqual(markFile("openai", shipped));
    // Held until their owners say yes (marks/README.md).
    for (const id of ["claude", "muse", "muse-code", "meta", "runway"]) expect(markFile(id, shipped), id).toBeUndefined();
  });
});
