/**
 * Checks subjects and cut-outs end to end through the MCP server, on a real project with footage:
 * find_subjects on a clip, track_subject from a box, and cut_out of a photo (removed again afterwards). With a
 * description, it also cuts that out of the photo and of a still from the clip (SAM: installed on this Mac, or fal).
 *
 *   node scripts/subjects-smoke.ts <project> <clip asset> <photo asset> ["the kids"]
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cachePaths } from "../packages/engine/src/paths.ts";
import { loadFile, updateFile } from "../packages/engine/src/store.ts";

const [project, clip, photo, prompt] = process.argv.slice(2);
if (!project || !clip || !photo) throw new Error('usage: subjects-smoke.ts <project> <clip asset> <photo asset> ["the kids"]');

const client = new Client({ name: "subjects-smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: "node", args: [join(import.meta.dirname, "..", "packages/engine/src/mcp.ts")] }));
type Result = { content: { type: string; text?: string }[]; isError?: boolean };
const call = async (name: string, args: Record<string, unknown>) => {
  const t = Date.now();
  const r = (await client.callTool({ name, arguments: args })) as Result;
  const out = r.content.map((c) => c.text ?? "").join("\n");
  console.log(`\n== ${name} (${Date.now() - t}ms)${r.isError ? " ERROR" : ""}\n${out.slice(0, 600)}`);
  if (r.isError) process.exitCode = 1;
  return out;
};

await call("find_subjects", { project, assets: [clip] });
await call("track_subject", { project, asset: clip, at: 1, box: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, label: "Smoke test box" });
let made = await call("cut_out", { project, asset: photo, mode: "subject" });
if (prompt) {
  made += "\n" + (await call("cut_out", { project, asset: photo, prompt, each: true }));
  made += "\n" + (await call("cut_out", { project, asset: clip, prompt, still: 1 }));
}

// Put things back: the smoke subject and the cut-outs.
const ids = [...made.matchAll(/^- (\S+)/gm)].map((m) => m[1]!);
updateFile(project, (doc) => {
  const a = doc.assets.find((x) => x.id === clip)!;
  a.subjects = a.subjects?.filter((s) => s.label !== "Smoke test box");
  for (const id of ids) {
    const gone = doc.assets.find((x) => x.id === id);
    if (gone?.path) rmSync(gone.path, { force: true });
    // Its previews too, or a later cut-out given the same id would show these.
    for (const f of Object.values(cachePaths(loadFile(project).dir, id))) rmSync(f, { force: true });
  }
  doc.assets = doc.assets.filter((x) => !ids.includes(x.id));
});
console.log(`\nCleaned up: the smoke subject and ${ids.length} cut-out(s).`);
await client.close();
