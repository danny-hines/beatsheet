// Starts Electron on this folder's build. With --dev it opens the studio's Vite dev server (BEATSHEET_DEV_URL, by
// default http://localhost:5180) instead of the built studio. A script rather than `VAR=… electron .` in package.json,
// so it works the same in Windows' shells.
//
// Usage: node apps/desktop/scripts/electron.mjs [--dev]
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
if (process.argv.includes("--dev")) env.BEATSHEET_DEV_URL ??= "http://localhost:5180";
const child = spawn(electron, ["."], { cwd: desktop, env, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
