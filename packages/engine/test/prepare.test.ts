import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

const root = mkdtempSync(join(tmpdir(), "beatsheet-prepare-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return {
    ...real,
    readSettings: () => ({ services: { fal: { addedAt: "2026-11-01" } }, checks: {} }),
  };
});

const { pickFastModel } = await import("../src/agent/fast.ts");
const { heuristicMakePlan, parseJsonObject } = await import("../src/prepare.ts");

afterAll(() => rmSync(root, { recursive: true, force: true }));

function seedProject(id: string, shots: ProjectFile["cuts"][number]["shots"]) {
  const dir = join(process.env.BEATSHEET_PROJECTS!, id);
  mkdirSync(dir, { recursive: true });
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id,
    title: "Prep test",
    sources: [],
    brief: { goal: "Test" },
    assets: [
      { id: "hero-face", kind: "image", path: join(dir, "face.jpg"), provenance: { source: "generated" } },
      { id: "hero-outfit", kind: "image", path: join(dir, "outfit.jpg"), provenance: { source: "generated" } },
      { id: "mid-board", kind: "image", path: join(dir, "board.jpg"), provenance: { source: "generated", cast: ["hero"] } },
      { id: "prev-clip", kind: "video", path: join(dir, "clip.mp4"), duration: 5, provenance: { source: "generated" } },
    ],
    cast: [{ id: "hero", name: "Hero", kind: "character", about: "young runner", faceSheet: "hero-face", outfitSheet: "hero-outfit" }],
    cuts: [
      {
        id: "main",
        name: "Main",
        recipe: "film",
        spec: {},
        formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots,
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file, null, 2));
}

describe("fast agent model selection", () => {
  it("picks the lightweight model tier for each provider from its live model list", () => {
    expect(
      pickFastModel("claude", [
        { id: "default", label: "Default", default: true },
        { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
        { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
        { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
      ]),
    ).toBe("claude-haiku-5-5");

    expect(
      pickFastModel("codex", [
        { id: "gpt-5.4", label: "GPT-5.4", default: true },
        { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      ]),
    ).toBe("gpt-5.4-mini");

    expect(
      pickFastModel("antigravity", [
        { id: "gemini-pro", label: "Gemini Pro", default: true },
        { id: "gemini-flash", label: "Gemini Flash" },
        { id: "gemini-flash-lite", label: "Gemini Flash Lite" },
      ]),
    ).toBe("gemini-flash-lite");

    expect(
      pickFastModel("muse", [
        { id: "muse-wonder-full-1.0", label: "Muse Wonder Full 1.0", default: true },
        { id: "muse-wonder-fast-1.0", label: "Muse Wonder Fast 1.0" },
      ]),
    ).toBe("muse-wonder-fast-1.0");
  });

  it("extracts JSON objects cleanly even when wrapped in markdown fences", () => {
    expect(parseJsonObject('```json\n{"rationale":"ok","draft":{"op":"image"}}\n```')).toEqual({
      rationale: "ok",
      draft: { op: "image" },
    });
    expect(parseJsonObject('Sure! Here you go: {"a": 1} thanks.')).toEqual({ a: 1 });
    expect(parseJsonObject("not json")).toBeUndefined();
  });
});

describe("heuristicMakePlan directing mode", () => {
  it("prefers References mode (board as visual ref, no locked start) for character/action shots and locked start for establishing/continuation shots", () => {
    seedProject("prep-modes", [
      { id: "s1", track: "pic", duration: 5, content: { kind: "generated", prompt: "@hero leaps over the wall", take: "mid-board", takes: ["mid-board"] }, fidelity: "board" },
      { id: "s2", track: "pic", duration: 5, content: { kind: "generated", prompt: "@hero runs", take: "prev-clip", takes: ["prev-clip"], refs: ["hero-face", "hero-outfit"] }, fidelity: "rough" },
    ]);

    const action = heuristicMakePlan("prep-modes", { shot: "s1", intent: "@hero sprints up to the stone wall and leaps over it" });
    expect(action.draft).toMatchObject({ op: "video", inputMode: "refs", refs: ["mid-board"] });
    expect(action.draft.start).toBeUndefined();

    const establishing = heuristicMakePlan("prep-modes", { shot: "s1", intent: "Static establishing shot of the quiet courtyard at dawn" });
    expect(establishing.draft).toMatchObject({ op: "video", inputMode: "board", start: "mid-board" });
    expect(establishing.draft.refs).toBeUndefined();

    // A shot whose only image refs are cast sheets does not mistake hero-face for a settled board still.
    const noBoard = heuristicMakePlan("prep-modes", { shot: "s2", intent: "@hero darts into the alley" });
    expect(noBoard.steps).toHaveLength(2);
    expect(noBoard.steps![1]!.draft).toMatchObject({ op: "video", inputMode: "refs" });
    expect(noBoard.steps![1]!.draft.refs).toBeUndefined();
  });
});
