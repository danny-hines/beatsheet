import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { RESOURCES } from "../src/paths.ts";
import { installedInstructions, seedFiles, seedWorkspace, type SeedFile } from "../src/workspace.ts";

const root = mkdtempSync(join(tmpdir(), "beatsheet-workspace-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const MCP = { command: "node", args: ["/app/mcp.js"], env: { BEATSHEET_WORKSPACE: "/home/beatsheet" } };
const file = (path: string, text: string): SeedFile => ({ path, data: Buffer.from(text) });
const read = (dir: string, path: string) => readFileSync(join(dir, ...path.split("/")), "utf8");

describe("the instructions an installed workspace gets", () => {
  it("leave out what's marked for a checkout, inline or as whole lines", () => {
    const text = [
      "# Working in beatsheet",
      "",
      "Projects are files. <!-- checkout -->Run the checks after editing one.<!-- /checkout -->",
      "",
      "- Use the tools.",
      "<!-- checkout -->",
      "- CLI: `npm run beatsheet`.",
      "<!-- /checkout -->",
      "- Scenes name a component.",
      "",
      "<!-- checkout -->",
      "## Code",
      "",
      "- TypeScript throughout.",
      "<!-- /checkout -->",
      "",
    ].join("\n");
    const out = installedInstructions(text);
    expect(out).not.toMatch(/checkout -->|Run the checks|npm run|## Code|TypeScript/);
    expect(out).toContain("Projects are files.\n");
    expect(out).toContain("- Use the tools.\n- Scenes name a component.\n");
    expect(out.endsWith("- Scenes name a component.\n")).toBe(true);
  });

  it("say what kind of folder this is, straight under the title", () => {
    const out = installedInstructions("# Working in beatsheet\n\n## Turns\n\nEnd with hand_off.\n");
    expect(out).toMatch(/^# Working in beatsheet\n\nThis is the person's beatsheet folder[\s\S]+\n\n## Turns\n\nEnd with hand_off\.\n$/);
  });

  it("from the real CLAUDE.md, keep how to work and drop how to develop beatsheet", () => {
    const out = installedInstructions(readFileSync(join(RESOURCES, "CLAUDE.md"), "utf8"));
    expect(out).toContain("## Turns");
    expect(out).toContain("## Addressing a batch of notes");
    expect(out).toContain("Prefer the `beatsheet` MCP tools");
    expect(out).not.toMatch(/npm run|node scripts|## Code|<!--/);
  });
});

describe("what an installed workspace holds", () => {
  const files = seedFiles(RESOURCES, MCP);
  const paths = new Set(files.map((f) => f.path));

  it("has the instructions under both names, and every recipe in both places, as real copies", () => {
    const text = (path: string) => files.find((f) => f.path === path)!.data.toString("utf8");
    expect(text("AGENTS.md")).toBe(text("CLAUDE.md"));
    const recipes = readdirSync(join(RESOURCES, ".agents", "skills")).filter((n) => !n.startsWith("."));
    expect(recipes.length).toBeGreaterThan(3);
    for (const r of recipes) {
      expect(paths.has(`.agents/skills/${r}/SKILL.md`), r).toBe(true);
      expect(text(`.claude/skills/${r}/SKILL.md`)).toBe(text(`.agents/skills/${r}/SKILL.md`));
    }
  });

  it("has beatsheet's tools as a command with its folders", () => {
    expect(JSON.parse(files.find((f) => f.path === ".mcp.json")!.data.toString("utf8"))).toEqual({ mcpServers: { beatsheet: MCP } });
  });

  it("has every file the instructions and recipes point at, outside beatsheet's own code", () => {
    // Paths under packages/engine name the app's code, which the instructions say isn't in the folder.
    const named = files
      .filter((f) => f.path.endsWith(".md"))
      .flatMap((f) => [...f.data.toString("utf8").matchAll(/`((?:docs|packages\/(?:schema|video)|scripts|examples|apps)\/[A-Za-z0-9_./-]*[A-Za-z0-9_-])`/g)].map((m) => m[1]!));
    expect(named).toContain("packages/schema/src/types.ts");
    expect(named).toContain("docs/MODELS.md");
    const missing = [...new Set(named)].filter((p) => !paths.has(p) && ![...paths].some((have) => have.startsWith(`${p}/`)));
    expect(missing).toEqual([]);
  });
});

describe("keeping the workspace's copies up to date", () => {
  it("writes everything the first time, and nothing when it's all current", () => {
    const dir = join(root, "fresh");
    const files = seedFiles(RESOURCES, MCP);
    const first = seedWorkspace(dir, files);
    expect(first.wrote).toHaveLength(files.length);
    expect(first.kept).toEqual([]);
    expect(read(dir, "CLAUDE.md")).toContain("This is the person's beatsheet folder");
    expect(existsSync(join(dir, ".claude", "skills", "montage", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dir, "packages", "schema", "src", "types.ts"))).toBe(true);
    expect(seedWorkspace(dir, files)).toEqual({ wrote: [], kept: [], removed: [] });
  });

  it("replaces a copy that's out of date without fuss", () => {
    const dir = join(root, "update");
    seedWorkspace(dir, [file("CLAUDE.md", "one\n"), file("docs/MODELS.md", "models\n")]);
    const r = seedWorkspace(dir, [file("CLAUDE.md", "two\n"), file("docs/MODELS.md", "models\n")]);
    expect(r).toEqual({ wrote: ["CLAUDE.md"], kept: [], removed: [] });
    expect(read(dir, "CLAUDE.md")).toBe("two\n");
  });

  it("puts aside a file the person changed, or one of theirs that was already there, before replacing it", () => {
    const dir = join(root, "theirs");
    seedWorkspace(dir, [file("CLAUDE.md", "one\n")]);
    writeFileSync(join(dir, "CLAUDE.md"), "one, and my own rule\n");
    writeFileSync(join(dir, "AGENTS.md"), "mine from before\n");
    const r = seedWorkspace(dir, [file("CLAUDE.md", "two\n"), file("AGENTS.md", "two\n")], new Date("2026-11-23T10:00:00.000Z"));
    expect(r.kept.sort()).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(read(dir, "CLAUDE.md")).toBe("two\n");
    expect(read(dir, ".beatsheet/kept/2026-11-23T10-00-00-000Z/CLAUDE.md")).toBe("one, and my own rule\n");
    expect(read(dir, ".beatsheet/kept/2026-11-23T10-00-00-000Z/AGENTS.md")).toBe("mine from before\n");
    // Changing it back to what beatsheet wrote isn't a change to keep.
    writeFileSync(join(dir, "CLAUDE.md"), "edited again\n");
    writeFileSync(join(dir, "CLAUDE.md"), "two\n");
    expect(seedWorkspace(dir, [file("CLAUDE.md", "two\n"), file("AGENTS.md", "two\n")])).toEqual({ wrote: [], kept: [], removed: [] });
  });

  it("removes what beatsheet no longer ships, unless the person changed it", () => {
    const dir = join(root, "dropped");
    seedWorkspace(dir, [file("CLAUDE.md", "one\n"), file(".agents/skills/old/SKILL.md", "old\n"), file(".agents/skills/tuned/SKILL.md", "tuned\n")]);
    writeFileSync(join(dir, ".agents", "skills", "tuned", "SKILL.md"), "tuned by hand\n");
    const r = seedWorkspace(dir, [file("CLAUDE.md", "one\n")]);
    expect(r).toEqual({ wrote: [], kept: [], removed: [".agents/skills/old/SKILL.md"] });
    expect(existsSync(join(dir, ".agents", "skills", "old", "SKILL.md"))).toBe(false);
    expect(read(dir, ".agents/skills/tuned/SKILL.md")).toBe("tuned by hand\n");
    // Forgotten after that: it's the person's file now.
    expect(seedWorkspace(dir, [file("CLAUDE.md", "one\n")])).toEqual({ wrote: [], kept: [], removed: [] });
  });

  it("never touches the person's projects or anything else of theirs", () => {
    const dir = join(root, "projects");
    seedWorkspace(dir, [file("CLAUDE.md", "one\n")]);
    writeFileSync(join(dir, "notes.txt"), "my notes\n");
    seedWorkspace(dir, [file("CLAUDE.md", "two\n")]);
    expect(read(dir, "notes.txt")).toBe("my notes\n");
  });
});
