// Makes the app people install: apps/desktop/release/dist/beatsheet-<version>-<arch>.dmg (and a .zip of the app, for
// updates). Unlike the personal build (make-app.mjs), it runs without this folder: everything it needs is inside it.
//
//   npm run dist             the DMG and the zip
//   npm run dist -- --dir    just the app, in release/dist/mac-<arch>/ (quicker, for trying it)
//
// What goes in (release/stage, laid out like the repository so the engine finds things where it always has):
//   - the build (apps/desktop/dist: the main process, the MCP server, the video bundle, the programs it carries) and
//     the built studio;
//   - what the engine reads as it runs (its helpers' sources, workers, sounds, workflows, the examples) and what it
//     puts in the person's workspace (the instructions, the recipes, the files they point at);
//   - the packages the built code loads at run time, with everything they depend on, copied from node_modules as
//     installed, so the app runs exactly what the checkout was tested with.
// The staged folder becomes Contents/Resources/beatsheet. Electron's own app folder holds only a loader for it.
//
// Signing. With a Developer ID Application certificate in the keychain the app is signed for the hardened runtime
// (build/entitlements.mac.plist) and notarized with the notarytool profile named by BEATSHEET_NOTARY_PROFILE
// ("beatsheet-notary" unless set; make it once with `xcrun notarytool store-credentials beatsheet-notary`). The
// certificate and the credentials stay in the keychain: this script never sees them. Without a certificate the app is
// signed for this Mac only, and says so: it's for trying the packaging, not for giving to anyone.
//
// Updates. The installed app looks for newer versions where "updates" in apps/desktop/package.json says: an
// electron-builder publish entry, such as { "provider": "github", "owner": "…", "repo": "…" } for a public
// repository's releases, or { "provider": "generic", "url": "https://…/" } for a folder on a web server
// (BEATSHEET_UPDATE_URL names such a folder for one build, for trying it). With one set, this also writes
// latest-mac.yml beside the zip: put the three (the yml, the zip and its blockmap) where the entry points, with the
// DMG for people to download (for GitHub, a release tagged v<version>; the README has the command). Nothing is
// uploaded from here. With none set, the app doesn't look for updates.
//
// Mac only so far.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build as packageApp, Platform } from "electron-builder";
import { writeIcns } from "./icon.mjs";

if (process.platform !== "darwin") {
  console.error("npm run dist makes the Mac app so far. On Windows, npm run app makes the personal build.");
  process.exit(1);
}

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(desktop, "..", "..");
const release = join(desktop, "release");
const stage = join(release, "stage");
const out = join(release, "dist");
const arch = process.arch; // arm64, or x64 on an Intel Mac
const dirOnly = process.argv.includes("--dir");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: repo, stdio: "inherit", ...opts });
const { version, description, updates } = JSON.parse(readFileSync(join(desktop, "package.json"), "utf8"));
const feed = process.env.BEATSHEET_UPDATE_URL ? { provider: "generic", url: process.env.BEATSHEET_UPDATE_URL } : (updates ?? null);

// The oldest macOS it runs on, set by the Swift helpers (SWIFT_TARGET) and matched by the ffmpeg build.
const { SWIFT_TARGET } = await import("../../../packages/engine/src/native.ts");
const { REFERENCE } = await import("../../../packages/engine/src/workspace.ts");
const MACOS_MIN = /macos([\d.]+)$/.exec(SWIFT_TARGET)[1];

// ---- The build

if (!existsSync(join(desktop, "vendor", `darwin-${arch}`, "ffmpeg"))) {
  console.error("The app carries its own ffmpeg, and it hasn't been built yet. Run scripts/build-ffmpeg.sh (about ten minutes, once), then this again.");
  process.exit(1);
}
console.log("Building the studio and the app's own pieces…");
run("npm", ["run", "build", "-w", "@beatsheet/studio"]);
run(process.execPath, [join(desktop, "scripts", "build.mjs")]);
for (const need of ["main.cjs", "preload.cjs", "mcp.mjs", "video/index.html", "bin/ffmpeg", "bin/ffprobe"]) {
  if (!existsSync(join(desktop, "dist", need))) throw new Error(`The build is missing apps/desktop/dist/${need}`);
}
if (!readdirSync(join(desktop, "dist", "bin")).some((f) => f.startsWith("beatsheet-vision-"))) throw new Error("The Swift helpers weren't built (they need Xcode's command line tools)");

// ---- Staging

console.log("Gathering what the app carries…");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

/**
 * Copies something this build made (a folder outside git) to the same place in the staged folder. Source maps stay
 * behind, except the video bundle's: Remotion opens them when it renders.
 */
const carryBuilt = (path) => {
  mkdirSync(dirname(join(stage, path)), { recursive: true });
  const video = join(repo, "apps", "desktop", "dist", "video") + sep;
  cpSync(join(repo, path), join(stage, path), { recursive: true, filter: (src) => (!src.endsWith(".map") || src.startsWith(video)) && !src.endsWith(".DS_Store") });
};
/**
 * Copies a file or folder of the repository to the same place in the staged folder: the files git tracks, as they are
 * here now. What merely sits in the folder (an example's previews and renders, a stray download) doesn't ship.
 */
const carry = (path) => {
  const files = execFileSync("git", ["ls-files", "-z", "--", path], { cwd: repo }).toString().split("\0").filter(Boolean);
  if (!files.length) throw new Error(`Nothing under ${path} is tracked by git`);
  for (const file of files) {
    mkdirSync(dirname(join(stage, file)), { recursive: true });
    cpSync(join(repo, file), join(stage, file));
  }
};

const changed = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repo }).toString().trim();
if (changed) console.log(`  Note: ${changed.split("\n").length} tracked files have changes that aren't committed; the app is built from them as they are.`);

carryBuilt("apps/desktop/dist");
carryBuilt("apps/studio/dist");
for (const dir of ["native", "py", "sfx", "comfy"]) carry(`packages/engine/${dir}`);
carry("examples");
// What the workspace is given (workspace.ts): the instructions, the recipes, and the files they point at.
carry("LICENSE");
carry("CLAUDE.md");
carry(".agents/skills");
for (const path of REFERENCE) carry(path);

/**
 * The packages the built code loads as it runs (what the bundles leave outside: see build.mjs), plus the two it runs
 * or reads without importing: three, which scenes' imports are bundled from, and Chrome DevTools MCP. @remotion/bundler
 * stays behind: the video is bundled already.
 */
const RUNTIME_PACKAGES = ["sharp", "@remotion/renderer", "esbuild", "zod", "@modelcontextprotocol/sdk", "electron-updater", "three", "chrome-devtools-mcp"];

/** Where Node would find `name` from `from`: the nearest node_modules holding it. */
function installed(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dir === repo || dir === dirname(dir)) return undefined;
  }
}

/** Every package `names` need at run time, as folders under the repository's node_modules. */
function withDependencies(names) {
  const found = new Set();
  const visit = (name, from, required) => {
    const dir = installed(name, from);
    if (!dir) {
      // Packages for other kinds of computer, and optional peers nobody installed, aren't there and aren't needed.
      if (required) throw new Error(`${name} (needed by ${relative(repo, from)}) isn't installed`);
      return;
    }
    if (found.has(dir)) return;
    if (!dir.startsWith(join(repo, "node_modules") + sep)) throw new Error(`${name} isn't under node_modules (${dir}); it can't be staged where Node would look for it`);
    found.add(dir);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir, true);
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) visit(dep, dir, false);
    // A peer is the package's to use but someone else's to install (remotion's React); ones marked optional are skipped.
    for (const dep of Object.keys(pkg.peerDependencies ?? {})) if (!pkg.peerDependenciesMeta?.[dep]?.optional) visit(dep, dir, false);
  };
  for (const name of names) visit(name, repo, true);
  return [...found].sort();
}

const packages = withDependencies(RUNTIME_PACKAGES);
for (const dir of packages) {
  // Each package's own files; the packages nested inside it are in the list themselves when they're needed.
  cpSync(dir, join(stage, relative(repo, dir)), { recursive: true, filter: (src) => !src.endsWith(".map") && !src.endsWith(".DS_Store") && !relative(dir, src).split(sep).includes("node_modules") });
}
writeFileSync(join(stage, "package.json"), `${JSON.stringify({ name: "beatsheet", version, private: true, license: "MIT", description }, null, 2)}\n`);
const megabytes = (dir) => Math.round(Number(execFileSync("du", ["-sk", dir]).toString().split("\t")[0]) / 1024);
console.log(`  ${packages.length} packages, ${megabytes(stage)} MB in all`);

// ---- Packaging

// Electron's own app folder: a name, a version and a loader for the real thing, which sits beside it in Resources.
const shell = join(release, "shell");
rmSync(shell, { recursive: true, force: true });
mkdirSync(shell, { recursive: true });
writeFileSync(join(shell, "package.json"), `${JSON.stringify({ name: "beatsheet", productName: "beatsheet", version, description, main: "index.js" }, null, 2)}\n`);
writeFileSync(join(shell, "index.js"), `require(require("node:path").join(process.resourcesPath, "beatsheet", "apps", "desktop", "dist", "main.cjs"));\n`);
const icon = join(release, "beatsheet.icns");
await writeIcns(icon);

const identities = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"]).toString();
const signed = /"Developer ID Application: /.test(identities);
const notarize = signed && !process.argv.includes("--no-notarize");
if (notarize) process.env.APPLE_KEYCHAIN_PROFILE ??= process.env.BEATSHEET_NOTARY_PROFILE ?? "beatsheet-notary";
console.log(
  signed
    ? `Signing with the Developer ID certificate in the keychain${notarize ? `, and notarizing with the "${process.env.APPLE_KEYCHAIN_PROFILE}" profile` : " (not notarizing)"}.`
    : "No Developer ID Application certificate in the keychain: signing for this Mac only. This build is for trying the packaging; it won't open on another Mac.",
);

rmSync(out, { recursive: true, force: true });
const electronVersion = JSON.parse(readFileSync(join(repo, "node_modules", "electron", "package.json"), "utf8")).version;
await packageApp({
  targets: Platform.MAC.createTarget(),
  // Where the app looks for updates is written into it; putting the files there is someone's own step.
  publish: "never",
  config: {
    appId: "dev.beatsheet.studio",
    productName: "beatsheet",
    directories: { app: shell, output: out, buildResources: join(desktop, "build") },
    // The Electron already installed and tested here, not one fetched for the occasion.
    electronDist: join(repo, "node_modules", "electron", "dist"),
    electronVersion,
    // Nothing to compile: every package comes ready-made from node_modules.
    npmRebuild: false,
    nodeGypRebuild: false,
    publish: feed,
    // With a certificate, an app that came out unsigned is a failure, not a warning.
    forceCodeSigning: signed,
    // Electron runs as Node for beatsheet's MCP server (agent/cli.ts), so that switch stays as Electron ships it: on.
    // The staged folder goes in before signing, exactly as staged.
    afterPack: (context) => {
      const resources = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources");
      cpSync(stage, join(resources, "beatsheet"), { recursive: true, verbatimSymlinks: true });
      // Electron's own welcome app, which a copy of the installed Electron brings along; app.asar is what runs.
      rmSync(join(resources, "default_app.asar"), { force: true });
    },
    mac: {
      target: dirOnly ? [{ target: "dir", arch: [arch] }] : [{ target: "dmg", arch: [arch] }, { target: "zip", arch: [arch] }],
      category: "public.app-category.video",
      icon,
      minimumSystemVersion: MACOS_MIN,
      extendInfo: {
        // What macOS says when beatsheet first asks for the camera or microphone (recording, cloning your voice).
        NSCameraUsageDescription: "beatsheet records from your camera when you choose Record → Camera.",
        NSMicrophoneUsageDescription: "beatsheet records your voice for voiceovers and screen recordings, and to clone your voice for narration.",
      },
      // Programs are signed one by one (ffmpeg, the helpers, the packages' own); the pictures, sounds and fonts beside
      // them are covered by the app's seal and don't need signatures of their own.
      signIgnore: ["/Contents/Resources/beatsheet/.*\\.(?!node$|dylib$)[A-Za-z0-9_-]+$"],
      ...(signed
        ? { hardenedRuntime: true, gatekeeperAssess: false, entitlements: join(desktop, "build", "entitlements.mac.plist"), entitlementsInherit: join(desktop, "build", "entitlements.mac.plist"), notarize }
        : { identity: "-", hardenedRuntime: false, notarize: false }),
    },
    dmg: { title: `beatsheet ${version}` },
  },
});

// ---- Checking what was made

const app = join(out, `mac${arch === "x64" ? "" : `-${arch}`}`, "beatsheet.app");
if (!existsSync(app)) throw new Error(`The app isn't where it was expected: ${app}`);
const inside = join(app, "Contents", "Resources", "beatsheet");
for (const need of ["LICENSE", "apps/desktop/dist/main.cjs", "apps/desktop/dist/video/bundle.js.map", "apps/desktop/dist/bin/ffmpeg", "apps/studio/dist/index.html", ".agents/skills/montage/SKILL.md", "node_modules/three/examples/jsm", "node_modules/sharp/package.json", "packages/engine/sfx"]) {
  if (!existsSync(join(inside, need))) throw new Error(`The packaged app is missing ${need}`);
}
run("codesign", ["--verify", "--deep", "--strict", app]);
if (signed) {
  // As Gatekeeper will judge it on someone else's Mac.
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
  if (notarize) run("xcrun", ["stapler", "validate", app]);
}
console.log(`\nMade ${relative(repo, app)} (${megabytes(app)} MB)`);
if (!dirOnly) for (const f of readdirSync(out).filter((f) => /\.(dmg|zip)$/.test(f))) console.log(`     ${relative(repo, join(out, f))} (${Math.round(statSync(join(out, f)).size / 1048576)} MB)`);
console.log(feed ? `Looks for updates at ${feed.url ?? `${feed.provider}: ${feed.owner}/${feed.repo}`}${signed ? "" : " (an update only goes in when the app is signed with a Developer ID)"}.` : "Doesn't look for updates: no \"updates\" entry in apps/desktop/package.json.");
if (!signed) console.log("Signed for this Mac only: not something to give to anyone.");
