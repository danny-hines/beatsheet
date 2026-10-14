#!/usr/bin/env node
// beatsheet command line. Run with `npm run beatsheet -- <command>` from the repo.
import { parseArgs } from "node:util";
import { autoAssemble, formatTime, resolveTimeline } from "@beatsheet/schema";
import { addSong, buildCache, importFolder } from "./ingest.ts";
import { analyzeMusic } from "./music.ts";
import { listProjects, loadProject, saveProject } from "./store.ts";

const USAGE = `beatsheet <command>

  import <folder> --id <id> [--title <title>] [--song <file>]   new project from a folder of footage
  song <project> <file>                                          set the music (analyses beats and sections)
  assemble <project> [--length <seconds>]                        deterministic first cut on the beat
  cache <project>                                                make any missing preview copies and thumbnails
  render <project> [--format <id>] [--draft]                     export an MP4
  analyze <file>                                                 print a song's beat grid and sections
  list                                                           projects and examples`;

const log = (m: string) => console.log(m);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: { id: { type: "string" }, title: { type: "string" }, song: { type: "string" }, length: { type: "string" }, format: { type: "string" }, draft: { type: "boolean" } },
  });
  switch (cmd) {
    case "import": {
      const folder = positionals[0];
      if (!folder || !values.id) throw new Error("import needs a folder and --id");
      await importFolder({ folder, id: values.id, title: values.title, song: values.song, log });
      log(`Created project ${values.id}`);
      break;
    }
    case "song":
      await addSong(need(positionals[0]), need(positionals[1]), log);
      break;
    case "assemble": {
      const id = need(positionals[0]);
      const { project, version } = loadProject(id);
      const { project: next, summary } = autoAssemble(project, { targetLength: values.length ? Number(values.length) : undefined });
      saveProject(id, next, version);
      summary.forEach((s) => log(s));
      const tl = resolveTimeline(next);
      log(`First cut: ${formatTime(tl.duration)}, ${tl.shots.length} shots${tl.diagnostics.length ? `, ${tl.diagnostics.length} timing problems` : ""}`);
      break;
    }
    case "cache":
      await buildCache(need(positionals[0]), log);
      break;
    case "render": {
      const { renderProject } = await import("./render.ts");
      const out = await renderProject(need(positionals[0]), { format: values.format, quality: values.draft ? "proxy" : "original", onProgress: (p) => process.stdout.write(`\r  ${Math.round(p * 100)}%`) });
      log(`\nWrote ${out}`);
      break;
    }
    case "analyze":
      log(JSON.stringify(await analyzeMusic(need(positionals[0])), null, 2));
      break;
    case "list":
      for (const p of listProjects()) log(`${p.id.padEnd(24)} ${p.recipe.padEnd(10)} ${p.title}${p.where === "examples" ? "  (example)" : ""}`);
      break;
    default:
      log(USAGE);
      if (cmd) process.exitCode = 1;
  }
}

function need(v: string | undefined): string {
  if (!v) {
    console.error(USAGE);
    process.exit(1);
  }
  return v;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
