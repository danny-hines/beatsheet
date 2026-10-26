// Bundles the main process and preload. beatsheet's own packages (TypeScript sources) are bundled in; everything else
// (sharp, Remotion, Electron itself) is loaded from node_modules at run time.
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ownCode = {
  name: "bundle-own-code",
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => (args.path.startsWith("@beatsheet/") ? undefined : { path: args.path, external: true }));
  },
};
const common = { bundle: true, platform: "node", format: "cjs", target: "node22", sourcemap: true, logLevel: "warning", plugins: [ownCode] };
await build({ ...common, entryPoints: [join(here, "../src/main.ts")], outfile: join(here, "../dist/main.cjs") });
await build({ ...common, entryPoints: [join(here, "../src/preload.ts")], outfile: join(here, "../dist/preload.cjs") });
// On Windows the window shows beatsheet's icon (the Mac's comes from the app bundle).
if (process.platform === "win32") {
  const { iconPng } = await import("./icon.mjs");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(here, "../dist/icon.png"), await iconPng(256));
}
console.log("built apps/desktop/dist");
