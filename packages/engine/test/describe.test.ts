import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";
import { keepLoopTurning } from "./standin.ts";

// Where projects live is read when the engine loads, so it's imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-describe-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

let mockServices: Record<string, { addedAt: string }> = { gemini: { addedAt: "2026-10-29" } };
let mockSecrets: Record<string, string> = { gemini: "test-key" };
let mockAgents: { agent: "claude" | "codex" | "antigravity" | "muse"; model?: string }[] = [];
const quickAsked: { system: string; prompt: string; imageCount: number; agent: string }[] = [];
let quickReply: (() => Promise<{ text: string; agent: "claude" | "codex" | "antigravity" | "muse" }>) | undefined;

vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return { ...real, getSecret: async (id: string) => mockSecrets[id], readSettings: () => ({ services: mockServices, checks: {} }) };
});

vi.mock("../src/agent/fast.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/agent/fast.ts")>();
  return {
    ...real,
    resolveFastAgents: async () => mockAgents,
    quickAsk: async (opts: { system: string; prompt: string; images?: unknown[]; agent?: { agent: string } }) => {
      quickAsked.push({ system: opts.system, prompt: opts.prompt, imageCount: opts.images?.length ?? 0, agent: opts.agent?.agent ?? "auto" });
      if (!quickReply) throw new Error("unexpected quickAsk");
      return quickReply();
    },
  };
});

// A stand-in for Gemini & OpenRouter: answers from a queue, and keeps what it was asked.
let answers: unknown[] = [];
const asked: { url: string; model: string; body: Record<string, unknown> }[] = [];
let server: Server;
let describeCast: typeof import("../src/describe.ts").describeCast;
let pickDescribePictures: typeof import("../src/describe.ts").pickDescribePictures;
let cleanDescription: typeof import("../src/describe.ts").cleanDescription;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const url = req.url ?? "";
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const model = url.includes("/models/") ? url.split("/models/")[1]!.split(":")[0]! : String(parsed.model ?? "");
      asked.push({ url, model, body: parsed });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answers.shift() ?? {}));
    });
  });
  keepLoopTurning();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.BEATSHEET_GEMINI = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  ({ describeCast, pickDescribePictures, cleanDescription } = await import("../src/describe.ts"));

  const dir = join(process.env.BEATSHEET_PROJECTS!, "cat");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "dad.jpg"), "a picture of dad");
  writeFileSync(join(dir, "will-real.jpg"), "real photo of will");
  writeFileSync(join(dir, "will-costumed.jpg"), "fake beard portrait");
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "cat",
    title: "test",
    sources: [],
    brief: { goal: "test" },
    assets: [
      { id: "dad-sheet", kind: "image", path: join(dir, "dad.jpg") },
      { id: "will-real", kind: "image", path: join(dir, "will-real.jpg") },
      { id: "will-costumed", kind: "image", path: join(dir, "will-costumed.jpg") },
    ],
    cast: [
      { id: "dad", name: "Dad", kind: "character", images: ["dad-sheet"] },
      { id: "will", name: "William", kind: "character", faces: ["will-real"], portrait: "will-costumed", seen: [{ asset: "will-real" }] },
      { id: "mom", name: "Mom", kind: "character" },
    ],
    cuts: [
      {
        id: "main",
        name: "Main cut",
        recipe: "film",
        spec: {},
        formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
        stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as ProjectFile["cuts"][number]["stages"],
        spine: "shots",
        tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
        shots: [],
        notes: [],
      },
    ],
  };
  writeFileSync(join(dir, "project.json"), JSON.stringify(file));
});

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const reply = (text: string, finishReason = "STOP") => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });

describe("describing a cast member from its pictures", () => {
  it("sends its pictures and what to say about a character, and gives back the words", async () => {
    answers = [reply("Man in his forties, short sandy hair, neat beard, navy flannel shirt.")];
    expect(await describeCast("cat", "dad")).toBe("Man in his forties, short sandy hair, neat beard, navy flannel shirt");
    const contents = asked.at(-1)!.body.contents as { parts: { text?: string; inline_data?: unknown }[] }[];
    const parts = contents[0]!.parts;
    expect(parts[0]!.text).toMatch(/^These pictures show one character called Dad\. .*apparent age, build, hair/);
    expect(parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: Buffer.from("a picture of dad").toString("base64") } });
  });

  it("asks again when an answer stops partway through", async () => {
    asked.length = 0;
    answers = [reply("Man in his forties, short", "MAX_TOKENS"), reply("Man in his forties, short sandy hair")];
    expect(await describeCast("cat", "dad")).toBe("Man in his forties, short sandy hair");
    expect(asked).toHaveLength(2);
  });

  it("prefers raw face photos over a costumed portrait for human characters", async () => {
    const { loadProject } = await import("../src/store.ts");
    const { project } = loadProject("cat");
    const will = project.cast!.find((c) => c.id === "will")!;
    expect(pickDescribePictures(project, will).map((a) => a.id)).toEqual(["will-real", "will-costumed"]);
    expect(cleanDescription('```text\nDescription: "Ginger-haired teen, freckles, light ginger goatee."\n```')).toBe("Ginger-haired teen, freckles, light ginger goatee");
  });

  it("uses any connected agent via multimodal quickAsk without requiring a Gemini key", async () => {
    const savedGemini = process.env.BEATSHEET_GEMINI;
    delete process.env.BEATSHEET_GEMINI;
    mockServices = {};
    mockSecrets = {};
    mockAgents = [{ agent: "antigravity", model: "gemini-flash" }];
    quickAsked.length = 0;
    quickReply = async () => ({ text: '"Teenage boy, shoulder-length ginger hair, pale freckled skin, light ginger goatee."', agent: "antigravity" });
    try {
      expect(await describeCast("cat", "will")).toBe("Teenage boy, shoulder-length ginger hair, pale freckled skin, light ginger goatee");
      expect(quickAsked).toHaveLength(1);
      expect(quickAsked[0]).toMatchObject({ agent: "antigravity", imageCount: 2 });
    } finally {
      process.env.BEATSHEET_GEMINI = savedGemini;
      mockServices = { gemini: { addedAt: "2026-10-29" } };
      mockSecrets = { gemini: "test-key" };
      mockAgents = [];
      quickReply = undefined;
    }
  });

  it("falls back to OpenRouter when no agent CLI is connected and no Gemini key is set", async () => {
    const savedGemini = process.env.BEATSHEET_GEMINI;
    const base = savedGemini!;
    delete process.env.BEATSHEET_GEMINI;
    process.env.BEATSHEET_OPENROUTER = base;
    mockServices = { openrouter: { addedAt: "2026-10-29" } };
    mockSecrets = { openrouter: "or-test-key" };
    mockAgents = [];
    asked.length = 0;
    answers = [{ choices: [{ message: { content: "Young man, long ginger hair, freckles, light chin beard." } }] }];
    try {
      expect(await describeCast("cat", "will")).toBe("Young man, long ginger hair, freckles, light chin beard");
      expect(asked).toHaveLength(1);
      expect(asked[0]!.url).toBe("/chat/completions");
    } finally {
      delete process.env.BEATSHEET_OPENROUTER;
      process.env.BEATSHEET_GEMINI = savedGemini;
      mockServices = { gemini: { addedAt: "2026-10-29" } };
      mockSecrets = { gemini: "test-key" };
    }
  });

  it("says when there's nothing to look at yet", async () => {
    await expect(describeCast("cat", "mom")).rejects.toThrow("Mom has no pictures to describe yet");
  });
});
