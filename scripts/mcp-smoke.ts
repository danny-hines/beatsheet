// Drives the beatsheet MCP server the way Claude Code or Codex would, over stdio.
// Usage: node scripts/mcp-smoke.ts <project under projects/> [--frame]
// (changes one label and puts it back; branches a cut, edits it, then removes it)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { updateFile } from "../packages/engine/src/store.ts";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const project = process.argv[2] ?? "july-4";
const withFrame = process.argv.includes("--frame");
const client = new Client({ name: "smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: [join(import.meta.dirname, "..", "packages/engine/src/mcp.ts")] }));

type Result = { content: { type: string; text?: string; data?: string }[]; isError?: boolean };
const call = async (name: string, args: Record<string, unknown>) => {
  const r = (await client.callTool({ name, arguments: args })) as Result;
  const texts = r.content.filter((c) => c.type === "text").map((c) => c.text!);
  const images = r.content.filter((c) => c.type === "image").map((c) => `[image ${Math.round((c.data!.length * 3) / 4 / 1024)} KB]`);
  return { error: !!r.isError, text: texts.join("\n"), images };
};
const show = (label: string, r: { error: boolean; text: string; images: string[] }, lines = 8) =>
  console.log(`\n== ${label}${r.error ? " (ERROR)" : ""}\n${r.text.split("\n").slice(0, lines).join("\n")}${r.images.length ? `\n${r.images.join(" ")}` : ""}`);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
show("get_project", await call("get_project", { project }), 14);
const assets = await call("list_assets", { project, filter: "unrated" });
show("list_assets unrated", assets, 4);
const ids = assets.text.split("\n").slice(0, 3).map((l) => l.split(" · ")[0]!);
show("look_at_assets", await call("look_at_assets", { project, ids }), 6);
const original =
  (JSON.parse(readFileSync(join(import.meta.dirname, "..", "projects", project, "project.json"), "utf8")) as { cuts: { shots: { id: string; label?: string }[] }[] }).cuts[0]!.shots.find(
    (s) => s.id === "s01",
  )?.label ?? "";
const before = await call("edit_project", { project, ops: [{ op: "test", path: "/shots/id=s01/id", value: "s01" }, { op: "replace", path: "/shots/id=s01/label", value: "SMOKE TEST" }] });
show("edit_project by id", before, 3);
show("bad edit is refused", await call("edit_project", { project, ops: [{ op: "replace", path: "/shots/id=s01/track", value: "nope" }] }), 3);
show("revert", await call("edit_project", { project, ops: [{ op: "replace", path: "/shots/id=s01/label", value: original }] }), 2);
show("get_batch", await call("get_batch", { project }), 4);

// Cuts: branch one, change only it, then take it away again.
const made = await call("create_cut", { project, name: "Smoke test cut", targetLength: 15, why: "checking cuts" });
show("create_cut", made, 6);
const cut = made.text.match(/Made cut "([^"]+)"/)?.[1];
if (cut) {
  show("edit the new cut", await call("edit_project", { project, cut, ops: [{ op: "replace", path: "/shots/id=s01/label", value: "ONLY IN THE NEW CUT" }] }), 2);
  const doc = JSON.parse(readFileSync(join(import.meta.dirname, "..", "projects", project, "project.json"), "utf8")) as { cuts: { id: string; shots: { id: string; label?: string }[] }[] };
  const labels = doc.cuts.map((c) => `${c.id}: ${c.shots.find((s) => s.id === "s01")?.label ?? "(none)"}`);
  console.log(`   s01 label per cut → ${labels.join(" | ")}`);
  updateFile(project, (d) => void (d.cuts = d.cuts.filter((c) => c.id !== cut)));
  console.log(`   removed ${cut}`);
}
if (withFrame) {
  const t0 = Date.now();
  show("frame", await call("frame", { project, shot: "s03" }), 2);
  console.log(`   frame took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await client.close();
