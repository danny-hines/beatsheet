/**
 * Small Swift helpers for what macOS does best (Vision for subjects, AVSpeechSynthesizer for the Mac's voices), built
 * from `native/<name>.swift` with the Xcode command line tools the first time each is needed, and again whenever its
 * source changes.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { REPO } from "./paths.ts";
import { SETTINGS_DIR } from "./settings.ts";

const run = promisify(execFile);
const WHAT: Record<string, string> = { vision: "Apple's Vision tools", speech: "The Mac's voices" };

const building = new Map<string, Promise<string>>();

/** The helper's binary, building it if needed. */
export function swiftHelper(name: "vision" | "speech"): Promise<string> {
  if (process.platform !== "darwin") return Promise.reject(new Error(`${WHAT[name]} need a Mac.`));
  const source = join(REPO, "packages", "engine", "native", `${name}.swift`);
  const hash = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 12);
  const dir = join(SETTINGS_DIR, "bin");
  const bin = join(dir, `beatsheet-${name}-${hash}`);
  if (existsSync(bin)) return Promise.resolve(bin);
  let p = building.get(name);
  if (!p) {
    p = (async () => {
      mkdirSync(dir, { recursive: true });
      const tmp = `${bin}.${process.pid}.tmp`;
      try {
        await run("xcrun", ["swiftc", "-O", "-swift-version", "5", "-o", tmp, source], { maxBuffer: 1 << 24 });
      } catch (err) {
        const msg = String((err as { stderr?: string }).stderr || (err as Error).message);
        throw new Error(
          /xcrun|developer tools|xcode-select|active developer/i.test(msg)
            ? `${WHAT[name]} need the Xcode Command Line Tools. Run \`xcode-select --install\`, then try again.`
            : `Couldn't build the ${name} helper: ${msg.split("\n").find((l) => l.includes("error")) ?? msg.slice(0, 300)}`,
        );
      }
      renameSync(tmp, bin);
      // Earlier builds (from older versions of the source) aren't needed any more.
      for (const f of readdirSync(dir)) if (f.startsWith(`beatsheet-${name}-`) && join(dir, f) !== bin) rmSync(join(dir, f), { force: true });
      return bin;
    })().finally(() => building.delete(name));
    building.set(name, p);
  }
  return p;
}
