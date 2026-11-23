// Bundles the main process and preload, and the pieces the app runs in place of the source: the MCP server and the
// video composition. beatsheet's own packages (TypeScript sources) are bundled in; everything else (sharp, Remotion,
// Electron itself) is loaded from node_modules at run time.
import { build } from "esbuild";
import { rmSync } from "node:fs";
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
// On Windows the window shows beatsheet's icon (the Mac's comes from the app bundle).
if (process.platform === "win32") {
  const { iconPng } = await import("./icon.mjs");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(here, "../dist/icon.png"), await iconPng(256));
}
console.log("built apps/desktop/dist");
