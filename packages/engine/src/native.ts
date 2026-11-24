/**
 * Small Swift helpers for what macOS does best (Vision for subjects, AVSpeechSynthesizer for the Mac's voices), built
 * from `native/<name>.swift` with the Xcode command line tools the first time each is needed, and again whenever its
 * source changes. The desktop app's build makes them ahead, and the app uses those. On Windows the same idea in C#
 * (`native/<name>.cs`: Credential Manager for keys, SAPI for Windows' own voices), compiled by Windows PowerShell,
 * which every Windows 10 and 11 has.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { BUILT, RESOURCES } from "./paths.ts";
import { powershell, psString, run as runLaunch } from "./platform.ts";
import { SETTINGS_DIR } from "./settings.ts";

const run = promisify(execFile);
const WHAT: Record<string, string> = { vision: "Apple's Vision tools", speech: "The Mac's voices" };

const building = new Map<string, Promise<string>>();

/**
 * What a helper built to run on other Macs is built for: the oldest macOS the helpers' code allows (vision.swift's
 * people and thing masks and speech.swift's voice traits arrived in 14), on this machine's kind of processor. Built on
 * first use instead, a helper is made for the Mac it's on.
 */
export const SWIFT_TARGET = `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos14.0`;

const swiftSource = (name: string) => join(RESOURCES, "packages", "engine", "native", `${name}.swift`);
/** A helper's file name, which carries its source's fingerprint: a changed source is a different file. */
const swiftFile = (name: string) => `beatsheet-${name}-${createHash("sha256").update(readFileSync(swiftSource(name))).digest("hex").slice(0, 12)}`;

/**
 * Compiles a Swift helper into `dir`, unless this version of its source is already built there, and removes builds of
 * earlier versions. The desktop app's build makes them ahead with `target` (SWIFT_TARGET), so a Mac it's installed on
 * needs no Xcode tools.
 */
export function buildSwiftHelper(name: "vision" | "speech", dir: string, target?: string): Promise<string> {
  const bin = join(dir, swiftFile(name));
  if (existsSync(bin)) return Promise.resolve(bin);
  let p = building.get(bin);
  if (!p) {
    p = (async () => {
      mkdirSync(dir, { recursive: true });
      const tmp = `${bin}.${process.pid}.tmp`;
      try {
        await run("xcrun", ["swiftc", "-O", "-swift-version", "5", ...(target ? ["-target", target] : []), "-o", tmp, swiftSource(name)], { maxBuffer: 1 << 24 });
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
    })().finally(() => building.delete(bin));
    building.set(bin, p);
  }
  return p;
}

/** The helper's binary: the one the desktop app's build made when it's this version of the source, else built now. */
export function swiftHelper(name: "vision" | "speech"): Promise<string> {
  if (process.platform !== "darwin") return Promise.reject(new Error(`${WHAT[name]} need a Mac.`));
  const built = BUILT.bin && join(BUILT.bin, swiftFile(name));
  if (built && existsSync(built)) return Promise.resolve(built);
  return buildSwiftHelper(name, join(SETTINGS_DIR, "bin"));
}

const CS: Record<string, { what: string; references: string[] }> = {
  credentials: { what: "Keeping keys in Credential Manager", references: [] },
  speech: { what: "Windows' own voices", references: ["System.Speech"] },
};

/** The Windows helper's .exe, building it if needed. */
export function windowsHelper(name: "credentials" | "speech"): Promise<string> {
  if (process.platform !== "win32") return Promise.reject(new Error(`${CS[name]!.what} needs Windows.`));
  const source = join(RESOURCES, "packages", "engine", "native", `${name}.cs`);
  const hash = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 12);
  const dir = join(SETTINGS_DIR, "bin");
  const exe = join(dir, `beatsheet-${name}-${hash}.exe`);
  if (existsSync(exe)) return Promise.resolve(exe);
  let p = building.get(name);
  if (!p) {
    p = (async () => {
      mkdirSync(dir, { recursive: true });
      const tmp = join(dir, `beatsheet-${name}-${hash}.${process.pid}.tmp.exe`);
      // Assemblies load by name first, so the compiler gets their real paths (System.Speech lives in the GAC).
      const refs = CS[name]!.references;
      const script = [
        ...refs.map((r) => `Add-Type -AssemblyName ${r}`),
        `$refs = @(${refs.map((r) => `([System.AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq ${psString(r)} } | Select-Object -First 1).Location`).join(", ")})`,
        // Warnings (a struct field P/Invoke fills in, say) would otherwise fail the build.
        `$params = @{ TypeDefinition = [IO.File]::ReadAllText(${psString(source)}); Language = 'CSharp'; OutputAssembly = ${psString(tmp)}; OutputType = 'ConsoleApplication'; IgnoreWarnings = $true }`,
        "if ($refs.Count) { $params.ReferencedAssemblies = $refs }",
        "Add-Type @params",
      ].join("\n");
      const r = await runLaunch(powershell(script), { timeout: 120_000 });
      if (r.code !== 0 || !existsSync(tmp)) {
        rmSync(tmp, { force: true });
        const msg = (r.err || r.out).trim();
        throw new Error(`Couldn't build the ${name} helper: ${msg.split("\n").find((l) => /error/i.test(l)) ?? msg.slice(0, 300)}`);
      }
      renameSync(tmp, exe);
      for (const f of readdirSync(dir)) if (f.startsWith(`beatsheet-${name}-`) && join(dir, f) !== exe) rmSync(join(dir, f), { force: true });
      return exe;
    })().finally(() => building.delete(name));
    building.set(name, p);
  }
  return p;
}
