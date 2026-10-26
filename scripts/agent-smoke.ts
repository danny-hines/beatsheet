// End-to-end check of a hosted agent: start a session on the person's own CLI, ask for one beatsheet tool call, print
// what streams back. Usage: node scripts/agent-smoke.ts <muse|codex|claude> [model] [--project <id>] (july-4 by default)
import { AgentStudio, type AgentChange, type AgentId } from "../packages/engine/src/agent/index.ts";

const args = process.argv.slice(2);
const flag = args.indexOf("--project");
const project = flag >= 0 ? args.splice(flag, 2)[1]! : "july-4";
const [which = "codex", model] = args as [AgentId, string?];
const studio = new AgentStudio();
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
let turns = 0;
let last = "off";
studio.on("change", (c: AgentChange) => {
  if (c.type === "delta" && c.field === "text") return void process.stdout.write(c.delta);
  if (c.type === "item" && c.item.kind === "tool") console.log(`\n[${at()}] tool ${c.item.server ? `${c.item.server}.` : ""}${c.item.tool} ${c.item.status}${c.item.error ? ` (${c.item.error})` : ""}`);
  if (c.type !== "view") return;
  if (c.view.approvals.length) console.log(`\n[${at()}] waiting on approval:`, c.view.approvals.map((a) => `${a.title} ${a.detail ?? ""}`));
  if (c.view.error) console.log(`\n[${at()}] error: ${c.view.error}`);
  const was = last;
  last = c.view.status;
  if (was === "running" && last === "idle" && ++turns === 1) void studio.send(`Call the beatsheet list_assets tool for ${project}, then reply with just the number of assets.`);
  else if (was === "running" && last === "idle") finish(0);
  if (last === "error") finish(1);
});
const finish = (code: number) => {
  console.log(`\n[${at()}] ${code ? "failed" : "done"}`);
  studio.close();
  process.exit(code);
};
const [info] = (await studio.agents()).filter((a) => a.id === which);
console.log(`${info?.label}: ${info?.installed ? `models ${info.models?.map((m) => m.id).join(", ")}` : `not installed. ${info?.install}`}`);
if (!info?.installed) process.exit(1);
await studio.start(which, { model, project });
setTimeout(() => finish(1), 240_000);
