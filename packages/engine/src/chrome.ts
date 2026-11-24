/**
 * The headless Chrome that Remotion renders with (and capture.ts photographs pages with). Remotion fetches it on first
 * use and keeps it under whatever folder the process happens to be working in: the nearest package.json's
 * node_modules/.remotion, else ./.remotion. In a checkout that's right, because the app and every agent's MCP server
 * work in the repository and share one copy.
 *
 * An installed app's processes work in different folders (the app in one, each agent's server in the person's
 * workspace), so each would fetch its own 570 MB copy, one of them into the folder with the person's projects. There
 * beatsheet keeps a single copy in its own folder and names it to Remotion outright.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onNode } from "./agent/cli.ts";
import { RESOURCES, samePath, WORKSPACE } from "./paths.ts";
import { SETTINGS_DIR } from "./settings.ts";

/** Where an installed app keeps the browser. Its package.json is what makes Remotion stop here when it looks for a place. */
export const CHROME_HOME = join(SETTINGS_DIR, "chrome");

/** The browser's path from what native/chrome.mjs printed: the last BROWSER line. */
export function browserFrom(stdout: string): string | undefined {
  const line = stdout.split("\n").reverse().find((l) => l.startsWith("BROWSER "));
  if (!line) return undefined;
  try {
    const status = JSON.parse(line.slice("BROWSER ".length)) as { path?: unknown };
    return typeof status.path === "string" && status.path ? status.path : undefined;
  } catch {
    return undefined;
  }
}

function fetchBrowser(): Promise<string> {
  mkdirSync(CHROME_HOME, { recursive: true });
  const stub = join(CHROME_HOME, "package.json");
  if (!existsSync(stub)) writeFileSync(stub, `${JSON.stringify({ private: true, description: "beatsheet keeps the browser it renders with here" }, null, 2)}\n`);
  const c = onNode(join(RESOURCES, "packages", "engine", "native", "chrome.mjs"));
  return new Promise((resolve, reject) => {
    // The first time it's a download of a hundred megabytes or so; after that it only looks.
    const child = execFile(c.command, c.args, { cwd: CHROME_HOME, env: { ...process.env, ...c.env }, timeout: 30 * 60_000, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      const path = browserFrom(stdout);
      if (path) return resolve(path);
      const why = (stderr || (err as Error | null)?.message || "").split("\n").filter((l) => l && !l.startsWith("PROGRESS ")).pop();
      reject(new Error(`Couldn't get the browser beatsheet renders with${why ? `: ${why}` : ""}`));
    });
    child.stderr?.on("data", (d: Buffer) => {
      const percent = /PROGRESS (\d+)/.exec(String(d))?.[1];
      if (percent) console.error(`beatsheet: fetching the browser it renders with… ${percent}%`);
    });
  });
}

let found: Promise<string> | undefined;

/**
 * The browser to name to Remotion (`browserExecutable`), or null to leave it to Remotion: in a checkout, where its own
 * place is the right one. Found once per process; a failure is tried again next time.
 */
export function renderBrowser(): Promise<string | null> {
  if (samePath(RESOURCES, WORKSPACE)) return Promise.resolve(null);
  return (found ??= fetchBrowser().catch((err) => {
    found = undefined;
    throw err;
  }));
}
