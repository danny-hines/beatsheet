// Rewrites project files from before cuts in the current shape. Examples are rewritten in place (git has the old
// ones); projects keep the original beside them as project.v1.json. Usage: node scripts/upgrade-projects.ts
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkReferences, parseFile, SCHEMA_V1 } from "../packages/schema/src/index.ts";

const repo = join(import.meta.dirname, "..");
for (const where of ["examples", "projects"]) {
  const root = join(repo, where);
  if (!existsSync(root)) continue;
  for (const d of readdirSync(root, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const file = join(root, d.name, "project.json");
    if (!existsSync(file)) continue;
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (raw.schema !== SCHEMA_V1) continue;
    const parsed = parseFile(raw);
    if (!parsed.ok || checkReferences(parsed.file).length) {
      console.log(`✗ ${where}/${d.name}: doesn't upgrade cleanly, left as it is`);
      continue;
    }
    if (where === "projects") copyFileSync(file, join(root, d.name, "project.v1.json"));
    writeFileSync(file, JSON.stringify(parsed.file, null, 2) + "\n");
    console.log(`✓ ${where}/${d.name}`);
  }
}
