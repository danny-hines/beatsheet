import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SCHEMA_VERSION, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";

// Where projects live is read when the engine loads, so it's imported after this is set.
const root = mkdtempSync(join(tmpdir(), "beatsheet-describe-"));
process.env.BEATSHEET_PROJECTS = join(root, "projects");
process.env.BEATSHEET_HOME = join(root, "home");

vi.mock("../src/settings.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/settings.ts")>();
  return { ...real, getSecret: async (id: string) => (id === "gemini" ? "test-key" : undefined), readSettings: () => ({ services: { gemini: { addedAt: "2026-10-29" } }, checks: {} }) };
});

// A stand-in for Gemini: answers from a queue, and keeps what it was asked.
let answers: unknown[] = [];
const asked: { model: string; body: { contents: { parts: { text?: string; inline_data?: unknown }[] }[] } }[] = [];
let server: Server;
let describeCast: typeof import("../src/describe.ts").describeCast;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      asked.push({ model: (req.url ?? "").split("/models/")[1]!.split(":")[0]!, body: JSON.parse(body) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answers.shift() ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.BEATSHEET_GEMINI = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  ({ describeCast } = await import("../src/describe.ts"));

  const dir = join(process.env.BEATSHEET_PROJECTS!, "cat");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "dad.jpg"), "a picture of dad");
  const file: ProjectFile = {
    schema: SCHEMA_VERSION,
    id: "cat",
    title: "test",
    sources: [],
    brief: { goal: "test" },
    assets: [{ id: "dad-sheet", kind: "image", path: join(dir, "dad.jpg") }],
    cast: [
      { id: "dad", name: "Dad", kind: "character", images: ["dad-sheet"] },
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
    const parts = asked.at(-1)!.body.contents[0]!.parts;
    expect(parts[0]!.text).toMatch(/^These pictures show one character called Dad\. .*apparent age, build, hair/);
    expect(parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: Buffer.from("a picture of dad").toString("base64") } });
  });

  it("asks again when an answer stops partway through", async () => {
    asked.length = 0;
    answers = [reply("Man in his forties, short", "MAX_TOKENS"), reply("Man in his forties, short sandy hair")];
    expect(await describeCast("cat", "dad")).toBe("Man in his forties, short sandy hair");
    expect(asked).toHaveLength(2);
  });

  it("says when there's nothing to look at yet", async () => {
    await expect(describeCast("cat", "mom")).rejects.toThrow("Mom has no pictures to describe yet");
  });
});
