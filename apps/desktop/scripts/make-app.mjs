// Makes apps/desktop/release/beatsheet.app: Electron's app bundle with beatsheet's name and icon, running this repo's
// build. It's a personal build, linked to this folder: it uses the projects here and the agent CLIs installed on this
// Mac. Drag it to Applications if you like; rebuild after pulling changes.
//
// Usage: node apps/desktop/scripts/make-app.mjs
//
// On Windows it makes a folder with beatsheet.exe instead (make-windows.mjs).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeIcns } from "./icon.mjs";

if (process.platform === "win32") {
  await import("./make-windows.mjs");
  process.exit(0);
}

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(desktop, "..", "..");
const run = (cmd, args, cwd = repo) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

console.log("Building the studio and the main process…");
run("npm", ["run", "build", "-w", "@beatsheet/studio"]);
run("node", [join(desktop, "scripts", "build.mjs")]);

const electronApp = join(repo, "node_modules", "electron", "dist", "Electron.app");
if (!existsSync(electronApp)) throw new Error("Electron isn't installed; run npm install first.");
const out = join(desktop, "release", "beatsheet.app");
rmSync(out, { recursive: true, force: true });
mkdirSync(dirname(out), { recursive: true });
cpSync(electronApp, out, { recursive: true, verbatimSymlinks: true });

// The app's code is this repo's build: Resources/app just loads it, so its own folder (and node_modules) are the repo's.
const appDir = join(out, "Contents", "Resources", "app");
mkdirSync(appDir, { recursive: true });
const { version } = JSON.parse(readFileSync(join(desktop, "package.json"), "utf8"));
writeFileSync(join(appDir, "package.json"), JSON.stringify({ name: "beatsheet", productName: "beatsheet", version, main: "index.js" }, null, 2));
writeFileSync(join(appDir, "index.js"), `require(${JSON.stringify(join(desktop, "dist", "main.cjs"))});\n`);

// Name and identity.
const plist = join(out, "Contents", "Info.plist");
const set = (key, value) => run("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${value}`, plist]);
set("CFBundleName", "beatsheet");
set("CFBundleDisplayName", "beatsheet");
set("CFBundleIdentifier", "dev.beatsheet.studio");
// What macOS says when beatsheet first asks for the camera or microphone (recording, cloning your voice).
set("NSCameraUsageDescription", "beatsheet records from your camera when you choose Record → Camera.");
set("NSMicrophoneUsageDescription", "beatsheet records your voice for voiceovers and screen recordings, and to clone your voice for narration.");

// The icon: the bar-and-beat b (icon.mjs).
console.log("Drawing the icon…");
await writeIcns(join(out, "Contents", "Resources", "electron.icns"));

// Changing the bundle breaks Electron's signature; sign it again for this Mac only.
console.log("Signing for this Mac…");
run("codesign", ["--force", "--deep", "--sign", "-", out]);
console.log(`\nMade ${out}\nOpen it, or drag it to Applications.`);
