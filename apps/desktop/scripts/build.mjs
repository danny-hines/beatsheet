// Bundles the main process and preload, and the pieces the app runs in place of the source: the MCP server, the
// video composition, (on a Mac) the Swift helpers, and ffmpeg when it's been built. beatsheet's own packages
// (TypeScript sources) are bundled in; everything else (sharp, Remotion, Electron itself) is loaded from node_modules
// at run time.
import { build } from "esbuild";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ownCode = {
  name: "bundle-own-code",
  setup(b) {
    // A Windows path (C:\…) doesn't start with . or / either, but it's a file, not a package.
    b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@beatsheet/") || isAbsolute(args.path) ? undefined : { path: args.path, external: true }));
  },
};
const common = { bundle: true, platform: "node", format: "cjs", target: "node22", sourcemap: true, logLevel: "warning", plugins: [ownCode] };
await build({ ...common, entryPoints: [join(here, "../src/main.ts")], outfile: join(here, "../dist/main.cjs") });
await build({ ...common, entryPoints: [join(here, "../src/preload.ts")], outfile: join(here, "../dist/preload.cjs") });
// What the app runs in place of the source, so it needs no Node of the person's and no bundler (main.ts points the
// engine at them). beatsheet's MCP server as one file: a module, since it ends on a top-level await.
await build({ ...common, format: "esm", entryPoints: [join(here, "../../../packages/engine/src/mcp.ts")], outfile: join(here, "../dist/mcp.mjs") });
// And the video composition as Remotion serves it. Made afresh: its files are named by their contents.
const video = join(here, "../dist/video");
rmSync(video, { recursive: true, force: true });
const { bundle } = await import("@remotion/bundler");
await bundle({ entryPoint: join(here, "../../../packages/video/src/root.tsx"), outDir: video });
// The Swift helpers ready-made, in the folder of programs the app carries (dist/bin, which goes ahead of the PATH), so
// a Mac the app is installed on needs no Xcode tools. Each is built once per version of its source. Without the tools
// here the app builds them on first use, as it always has.
if (process.platform === "darwin") {
  const { buildSwiftHelper, SWIFT_TARGET } = await import("../../../packages/engine/src/native.ts");
  for (const name of ["vision", "speech"]) {
    try {
      await buildSwiftHelper(name, join(here, "../dist/bin"), SWIFT_TARGET);
    } catch (err) {
      console.warn(`The ${name} helper wasn't built ahead: ${err.message}`);
    }
  }
}
// ffmpeg and ffprobe built from source (scripts/build-ffmpeg.sh), into the same folder, so the app runs its own and
// needs none installed. Without them it uses what's on the PATH (Homebrew's, winget's), as a checkout always has.
const exe = process.platform === "win32" ? ".exe" : "";
const vendor = join(here, "../vendor", `${process.platform}-${process.arch}`);
// FFMPEG.txt goes with them: what they were built from, and their licence (the GPL), which has to travel with them.
for (const name of [`ffmpeg${exe}`, `ffprobe${exe}`, "FFMPEG.txt"]) {
  const from = join(vendor, name);
  const to = join(here, "../dist/bin", name);
  if (!existsSync(from)) {
    // One taken out of vendor/ isn't left behind in the app.
    rmSync(to, { force: true });
    continue;
  }
  const a = statSync(from);
  const b = existsSync(to) ? statSync(to) : undefined;
  if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  if (!name.endsWith(".txt")) chmodSync(to, 0o755);
}
// On Windows the window shows beatsheet's icon (the Mac's comes from the app bundle).
if (process.platform === "win32") {
  const { iconPng } = await import("./icon.mjs");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(here, "../dist/icon.png"), await iconPng(256));
}
console.log("built apps/desktop/dist");
