// Makes apps/desktop/release/beatsheet-win32-x64: Electron for Windows with beatsheet's name and icon, running this
// repo's build, and a Start menu shortcut to it (skip that with --no-shortcut). Like the Mac's beatsheet.app, it's a
// personal build linked to this folder: it uses the projects here and the agent CLIs installed on this PC. Rebuild
// after pulling changes. (The .exe keeps Electron's own icon in File Explorer; the window, the taskbar and the
// shortcut show beatsheet's.)
//
// Usage: node apps/desktop/scripts/make-app.mjs (on Windows it runs this)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { iconPng, writeIco } from "./icon.mjs";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(desktop, "..", "..");
// npm is npm.cmd on Windows, which only a shell can start.
const run = (cmd, args) => execFileSync(cmd, args, { cwd: repo, stdio: "inherit", shell: cmd === "npm" });

console.log("Building the studio and the main process…");
run("npm", ["run", "build", "-w", "@beatsheet/studio"]);
run(process.execPath, [join(desktop, "scripts", "build.mjs")]);

const electron = join(repo, "node_modules", "electron", "dist");
if (!existsSync(join(electron, "electron.exe"))) throw new Error("Electron for Windows isn't installed; run npm install first.");
const out = join(desktop, "release", "beatsheet-win32-x64");
rmSync(out, { recursive: true, force: true });
mkdirSync(dirname(out), { recursive: true });
cpSync(electron, out, { recursive: true });
const exe = join(out, "beatsheet.exe");
renameSync(join(out, "electron.exe"), exe);
// Electron's own welcome app isn't wanted; resources\app is what runs.
rmSync(join(out, "resources", "default_app.asar"), { force: true });

// The app's code is this repo's build: resources\app just loads it, so its own folder (and node_modules) are the repo's.
const appDir = join(out, "resources", "app");
mkdirSync(appDir, { recursive: true });
writeFileSync(join(appDir, "package.json"), JSON.stringify({ name: "beatsheet", productName: "beatsheet", version: "0.1.0", main: "index.js" }, null, 2));
writeFileSync(join(appDir, "index.js"), `require(${JSON.stringify(join(desktop, "dist", "main.cjs"))});\n`);

console.log("Drawing the icon…");
const ico = join(out, "beatsheet.ico");
await writeIco(ico);
writeFileSync(join(desktop, "dist", "icon.png"), await iconPng(256));

if (!process.argv.includes("--no-shortcut")) {
  console.log("Adding beatsheet to the Start menu…");
  const lnk = join(process.env.APPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "beatsheet.lnk");
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut(${q(lnk)})`,
    `$s.TargetPath = ${q(exe)}`,
    `$s.WorkingDirectory = ${q(repo)}`,
    `$s.IconLocation = ${q(`${ico},0`)}`,
    "$s.Description = 'beatsheet'",
    "$s.Save()",
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { stdio: "inherit" });
}
console.log(`\nMade ${exe}\nOpen it, or find beatsheet in the Start menu.`);
