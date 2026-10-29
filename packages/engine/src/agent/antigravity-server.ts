/**
 * Google's ACP server for Antigravity (agy_acp_server), the one editors like Zed install from the ACP registry. It has
 * no installer of its own: beatsheet downloads Google's build from dl.google.com, checks it against the registry's
 * SHA-256, and unpacks it under its own folder, one folder per version.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { chmodSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { unzipCommand, type Platform } from "../platform.ts";
import { SETTINGS_DIR } from "../settings.ts";

export const ANTIGRAVITY_DIR = join(SETTINGS_DIR, "antigravity");
/** The registry's entry for Antigravity, kept by the ACP project, which is where Zed finds it too. */
const REGISTRY = "https://raw.githubusercontent.com/agentclientprotocol/registry/main/antigravity-acp/agent.json";
/** Only Google's own downloads are taken, whatever the registry says. */
const GOOGLE = "https://dl.google.com/agy-extensions/releases/";

type Build = { archive: string; cmd: string; args?: string[]; sha256: string };
type Registry = { version: string; distribution: { binary: Record<string, Build> } };
/** How to start an installed version, written next to it. */
type Launch = { version: string; cmd: string; args: string[] };

/** The registry's name for this machine: windows-x86_64, darwin-aarch64… */
export function platformKey(platform: Platform = process.platform, arch: string = process.arch): string {
  return `${platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : "linux"}-${arch === "arm64" ? "aarch64" : "x86_64"}`;
}

/** This machine's build from the registry's entry, refused unless it comes from Google with a checksum. */
export function pickBuild(entry: Registry, key = platformKey()): Build & { version: string } {
  const build = entry.distribution?.binary?.[key];
  if (!build) throw new Error(`Antigravity has no build for ${key}`);
  if (!build.archive.startsWith(GOOGLE)) throw new Error(`Antigravity's download isn't from Google (${build.archive})`);
  if (!/^[0-9a-f]{64}$/.test(build.sha256)) throw new Error("Antigravity's download has no checksum");
  if (!/^[\w.-]+$/.test(entry.version) || build.cmd.includes("..")) throw new Error("Antigravity's registry entry looks wrong");
  return { ...build, version: entry.version };
}

const launchOf = (dir: string): Launch | undefined => {
  try {
    return JSON.parse(readFileSync(join(dir, "launch.json"), "utf8")) as Launch;
  } catch {
    return undefined;
  }
};
const byVersion = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** The newest installed server and how to start it, or null. */
export function antigravityServer(root = ANTIGRAVITY_DIR): { command: string; args: string[]; version: string } | null {
  if (!existsSync(root)) return null;
  for (const v of readdirSync(root).filter((d) => /^\d[\w.-]*$/.test(d)).sort(byVersion).reverse()) {
    const launch = launchOf(join(root, v));
    const command = launch && join(root, v, launch.cmd);
    if (launch && command && existsSync(command)) return { command, args: launch.args, version: launch.version };
  }
  return null;
}

/** Downloads, checks and unpacks the newest server, telling `onLine` how it's going. Older versions are removed. */
export async function installAntigravity(onLine: (line: string) => void, root = ANTIGRAVITY_DIR): Promise<void> {
  onLine("Asking the ACP registry for Antigravity's latest version…");
  const res = await fetch(REGISTRY);
  if (!res.ok) throw new Error(`The ACP registry didn't answer (${res.status})`);
  const build = pickBuild((await res.json()) as Registry);
  const target = join(root, build.version);
  if (launchOf(target)) {
    onLine(`Antigravity ${build.version} is already installed.`);
    return;
  }
  mkdirSync(root, { recursive: true });
  const zip = join(root, `${build.version}.zip`);
  const partial = join(root, `${build.version}.partial`);
  try {
    onLine(`Downloading Antigravity ${build.version} from dl.google.com…`);
    const dl = await fetch(build.archive);
    if (!dl.ok || !dl.body) throw new Error(`The download failed (${dl.status})`);
    const total = Number(dl.headers.get("content-length")) || 0;
    const hash = createHash("sha256");
    const out = createWriteStream(zip);
    let got = 0;
    let told = 0;
    for await (const chunk of dl.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(chunk);
      got += chunk.length;
      if (!out.write(chunk)) await once(out, "drain");
      if (total && got - told >= total / 10) {
        told = got;
        onLine(`${Math.round((got / total) * 100)}% of ${Math.round(total / 1e6)} MB`);
      }
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (hash.digest("hex") !== build.sha256) throw new Error("The download doesn't match its checksum, so it wasn't installed");
    onLine("Checksum matches. Unpacking…");
    rmSync(partial, { recursive: true, force: true });
    mkdirSync(partial, { recursive: true });
    const unzip = unzipCommand(zip, partial);
    await promisify(execFile)(unzip.command, unzip.args, { windowsHide: true });
    if (process.platform !== "win32") chmodSync(join(partial, build.cmd), 0o755);
    writeFileSync(join(partial, "launch.json"), JSON.stringify({ version: build.version, cmd: build.cmd, args: build.args ?? [] } satisfies Launch, null, 2));
    renameSync(partial, target);
  } finally {
    rmSync(zip, { force: true });
    rmSync(partial, { recursive: true, force: true });
  }
  for (const old of readdirSync(root).filter((d) => d !== build.version && /^\d/.test(d))) {
    // A running server keeps its files busy; it goes next time.
    try {
      rmSync(join(root, old), { recursive: true, force: true });
    } catch {
      // still in use
    }
  }
  onLine(`Installed Antigravity ${build.version}.`);
}
