// Validates every examples/*/project.json: schema, references, and a timeline pass per format.
// Run with `node scripts/validate-examples.ts`; exits non-zero if anything fails.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkReferences, formatTime, parseProject, resolveTimeline } from "../packages/schema/src/index.ts";

const root = join(import.meta.dirname, "..", "examples");
let failed = false;

for (const dir of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const file = join(root, dir.name, "project.json");
  const parsed = parseProject(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.ok) {
    failed = true;
    console.log(`✗ ${dir.name}: schema`);
    for (const i of parsed.issues) console.log(`    ${i.path}: ${i.message}`);
    continue;
  }
  const p = parsed.project;
  const refs = checkReferences(p);
  for (const i of refs) console.log(`    ${i.path}: ${i.message}`);
  if (refs.length) failed = true;
  for (const f of p.formats) {
    const tl = resolveTimeline(p, f.id);
    const ok = tl.diagnostics.length === 0;
    if (!ok) failed = true;
    console.log(
      `${ok && !refs.length ? "✓" : "✗"} ${dir.name} [${f.label}] ${formatTime(tl.duration)} · ` +
        `${tl.lines.length} lines · ${tl.shots.length} shots · ${tl.cues.length} cues · ${tl.beats.length} beats`,
    );
    for (const d of tl.diagnostics) console.log(`    ${d.where}: ${d.message}`);
  }
}
process.exit(failed ? 1 : 0);
