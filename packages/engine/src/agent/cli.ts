/**
 * Finding the agent CLIs and starting things the way the person's terminal would. The studio may run without their
 * login PATH (a desktop app never has it), so ask a login shell, then look where each CLI installs. On Windows the
 * PATH a new terminal would get is in the registry, and npm's CLIs are .cmd shims that need starting their own way
 * (`launch` in platform.ts).
 */
import { execFile, spawn, type SpawnOptions } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { BUILT, RESOURCES, ROOTS_ENV, RUNTIME, WORKSPACE } from "../paths.ts";
import { antigravityServer, installAntigravity } from "./antigravity-server.ts";
import { cliGuesses, findOnPath, launch, mergePath, pathKey, powershell, registryPath, systemExe, withPath } from "../platform.ts";

const run = promisify(execFile);
const WINDOWS = process.platform === "win32";

export type CliName = "muse" | "codex" | "claude" | "antigravity";

/**
 * Getting each CLI working: the official install command (when there's one beatsheet can run for you) and the command
 * that signs in. Sign-in happens in the CLI itself, in a terminal, or for Antigravity on Google's own page in the
 * browser (it has no sign-in command); beatsheet never sees the credentials. On Windows the installers are
 * PowerShell's (Claude Code's and Muse Code's install.ps1) or npm's. Antigravity is Google's ACP server, which
 * beatsheet downloads.
 */
export const SETUP: Record<CliName, { install?: string; signIn: string }> = WINDOWS
  ? {
      muse: { install: "irm https://dev.meta.ai/install.ps1 | iex", signIn: "muse" },
      codex: { install: "npm install -g @openai/codex", signIn: "codex login" },
      claude: { install: "irm https://claude.ai/install.ps1 | iex", signIn: "claude" },
      antigravity: { install: "Downloads Google's Antigravity ACP server (about 130 MB) from dl.google.com", signIn: "" },
    }
  : {
      muse: { install: "curl -fsSL https://dev.meta.ai/install.sh | bash", signIn: "muse" },
      codex: { install: "npm install -g @openai/codex", signIn: "codex login" },
      claude: { install: "curl -fsSL https://claude.ai/install.sh | bash", signIn: "claude" },
      antigravity: { install: "Downloads Google's Antigravity ACP server (about 130 MB) from dl.google.com", signIn: "" },
    };

/**
 * The CLIs that update themselves when told to, and the npm package whose latest version says there's something to
 * update to. Muse Code updates itself whenever it's opened, and Antigravity's server is beatsheet's own download.
 */
export const UPDATES: Partial<Record<CliName, { args: string[]; package: string }>> = {
  codex: { args: ["update"], package: "@openai/codex" },
  claude: { args: ["update"], package: "@anthropic-ai/claude-code" },
};

/** The version in what a CLI prints for --version ("codex-cli 0.164.0", "2.1.311 (Claude Code)"). */
export const versionIn = (text: string) => /\d+\.\d+\.\d+/.exec(text)?.[0];

/** Whether version `a` is later than `b`, by its numbers. */
export function newer(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.split(".").map((n) => parseInt(n, 10) || 0));
  for (let i = 0; i < 3; i++) if ((x![i] ?? 0) !== (y![i] ?? 0)) return (x![i] ?? 0) > (y![i] ?? 0);
  return false;
}

/** What npm says a package's latest version is, asked at most every six hours. Not knowing is fine: nothing is offered. */
const latest = new Map<string, { at: number; version?: string }>();
async function latestVersion(pkg: string): Promise<string | undefined> {
  const hit = latest.get(pkg);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.version;
  let version: string | undefined;
  try {
    const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) version = versionIn(String(((await res.json()) as { version?: unknown }).version ?? ""));
  } catch {
    // offline, or npm is slow
  }
  // A lookup that failed is tried again in a few minutes rather than hours.
  latest.set(pkg, { at: version ? Date.now() : Date.now() - 6 * 3600_000 + 5 * 60_000, version });
  return version;
}

/** The version of a CLI that's installed, and a later one when it can be updated to it from here. */
export async function cliVersions(name: CliName): Promise<{ version?: string; latest?: string }> {
  if (name === "antigravity") return {};
  const cli = await findCli(name);
  if (!cli) return {};
  const env = await cliEnv();
  const said = await new Promise<string>((resolve) => {
    const child = spawnCli(cli, ["--version"], { cwd: WORKSPACE, env, stdio: ["ignore", "pipe", "ignore"] });
    let text = "";
    child.stdout!.on("data", (d) => (text += d));
    const timer = setTimeout(() => child.kill(), 15_000);
    child.on("error", () => resolve(""));
    child.on("close", () => (clearTimeout(timer), resolve(text)));
  });
  const version = versionIn(said);
  const update = UPDATES[name];
  const published = version && update ? await latestVersion(update.package) : undefined;
  return { version, latest: published && newer(published, version!) ? published : undefined };
}

const found = new Map<CliName, { at: number; path: string | null }>();
/** Look again next time, e.g. right after installing. */
export const forgetCli = (name: CliName) => found.delete(name);
export async function findCli(name: CliName): Promise<string | null> {
  if (name === "antigravity") return antigravityServer()?.command ?? null;
  const hit = found.get(name);
  if (hit && Date.now() - hit.at < 60_000) return hit.path;
  let path: string | null = null;
  if (WINDOWS) {
    // Where a new terminal would find it, then where its installer puts it.
    const env = await cliEnv();
    path = findOnPath(name, env[pathKey(env)] ?? "") ?? null;
  } else {
    try {
      const { stdout } = await run("/bin/zsh", ["-lc", `command -v ${name}`], { timeout: 8000 });
      const p = stdout.trim().split("\n").pop();
      if (p?.startsWith("/")) path = p;
    } catch {
      // not on the login PATH
    }
  }
  path ??= cliGuesses(name).find((g) => existsSync(g)) ?? null;
  found.set(name, { at: Date.now(), path });
  return path;
}

/** Starts a CLI found by findCli (on Windows an npm .cmd shim runs on Node; see `launch`). */
export function spawnCli(cli: string, args: string[], opts: SpawnOptions) {
  const l = launch(cli, args);
  return spawn(l.command, l.args, { windowsHide: true, ...opts, windowsVerbatimArguments: l.windowsVerbatimArguments });
}

let loginPath: string | undefined;
/** The environment for a CLI: this process's, with the login shell's PATH so its own tools (node, git) resolve. */
export async function cliEnv(extra: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  if (WINDOWS) {
    // The registry's PATH (what a new terminal gets) is read each time: Setup may have just installed something.
    const PATH = mergePath([await registryPath().catch(() => ""), process.env[pathKey(process.env)]]);
    return { ...withPath(process.env, PATH), ...extra };
  }
  if (loginPath === undefined) {
    try {
      const { stdout } = await run("/bin/zsh", ["-lc", 'printf %s "$PATH"'], { timeout: 8000 });
      loginPath = stdout.trim();
    } catch {
      loginPath = "";
    }
  }
  const PATH = [loginPath, process.env.PATH].filter(Boolean).join(":");
  return { ...process.env, PATH, ...extra };
}

/**
 * Gives this process the login shell's PATH. An app opened from Finder starts with a bare one (/usr/bin:/bin…), so the
 * tools beatsheet runs itself (ffmpeg, ffprobe, uv, Homebrew's in general) wouldn't be found. Homebrew's usual folders
 * are added too, in case the shell's profile doesn't set them.
 */
export async function useLoginPath(): Promise<void> {
  if (WINDOWS) {
    // A Windows app already has the PATH the person set; this adds anything installed since it started.
    const key = pathKey(process.env);
    process.env[key] = mergePath([process.env[key], await registryPath().catch(() => "")]);
    return;
  }
  const env = await cliEnv();
  const parts = [...(env.PATH ?? "").split(":"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  process.env.PATH = [...new Set(parts.filter(Boolean))].join(":");
}

export type NodeCommand = { command: string; args: string[]; env: Record<string, string> };

/**
 * A script as a command that runs it on Node. From a terminal this process is Node, and runs it. Inside the desktop app
 * this process is Electron, which runs as Node when ELECTRON_RUN_AS_NODE says so: an app built with its own pieces
 * (`own`) uses that, so the person needs no Node of their own; one without them falls back to their `node`.
 */
export function nodeCommand(script: string, on: { execPath: string; electron: boolean; own: boolean }): NodeCommand {
  if (!on.electron) return { command: on.execPath, args: [script], env: {} };
  return on.own ? { command: on.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: "1" } } : { command: "node", args: [script], env: {} };
}

const HERE = { execPath: process.execPath, electron: !!process.versions.electron, own: !!BUILT.mcp };
const mcp = nodeCommand(BUILT.mcp ?? join(RESOURCES, "packages", "engine", "src", "mcp.ts"), HERE);

/**
 * beatsheet's MCP server as a stdio command, with the folders it works in: the one file the desktop app built, or the
 * source. This is what an agent started by hand gets (the workspace's .mcp.json).
 */
export const MCP_COMMAND: NodeCommand = { ...mcp, env: { ...mcp.env, ...ROOTS_ENV } };

/** The same for sessions the studio hosts, which mark themselves so the menu doesn't list them twice. */
export const MCP_SERVER: NodeCommand = { ...MCP_COMMAND, env: { BEATSHEET_HOSTED: "1", ...MCP_COMMAND.env } };

/**
 * Chrome DevTools MCP attached to the person's own running Chrome (signed in), for agents without a Chrome tool of
 * their own when "Use my Chrome" is on. It needs Chrome 144+ with remote debugging turned on at
 * chrome://inspect/#remote-debugging, and Chrome asks the person to allow each connection.
 */
export const CHROME_DEVTOOLS: NodeCommand = (() => {
  const c = nodeCommand(join(RESOURCES, "node_modules", "chrome-devtools-mcp", "build", "src", "bin", "chrome-devtools-mcp.js"), HERE);
  return { ...c, args: [...c.args, "--autoConnect", "--no-usage-statistics"] };
})();

/** Whether the person's Codex has its own way into their Chrome (OpenAI's Chrome plugin, enabled in its config). */
export function codexHasChrome(): boolean {
  try {
    const config = readFileSync(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml"), "utf8");
    return /\[plugins\."chrome@openai-bundled"\]\s*\n\s*enabled\s*=\s*true/.test(config);
  } catch {
    return false;
  }
}

/** Runs the CLI's official installer in a login shell, passing each line of output on. */
export async function installCli(name: CliName, onLine: (line: string) => void): Promise<void> {
  if (name === "antigravity") return installAntigravity(onLine);
  const command = SETUP[name].install;
  if (!command) throw new Error(`beatsheet can't install ${name} for you`);
  onLine(`$ ${command}`);
  const env = await cliEnv();
  const shell = WINDOWS ? powershell(command) : { command: "/bin/zsh", args: ["-lc", command] };
  await followed(spawn(shell.command, shell.args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }), onLine, "The installer");
  forgetCli(name);
}

/** Runs the CLI's own updater, a line of its output at a time. */
export async function updateCli(name: CliName, onLine: (line: string) => void): Promise<void> {
  const update = UPDATES[name];
  const cli = await findCli(name);
  if (!update || !cli) throw new Error(`beatsheet can't update ${name} for you`);
  onLine(`$ ${name} ${update.args.join(" ")}`);
  await followed(spawnCli(cli, update.args, { cwd: WORKSPACE, env: await cliEnv(), stdio: ["ignore", "pipe", "pipe"] }), onLine, "The updater");
  forgetCli(name);
}

/** Waits for an installer or updater to finish, passing on each line it prints (colours and cursor moves taken out). */
function followed(child: ReturnType<typeof spawn>, onLine: (line: string) => void, what: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let rest = "";
    const take = (d: Buffer) => {
      const lines = (rest + d.toString()).split(/\r?\n|\r/);
      rest = lines.pop() ?? "";
      // eslint-disable-next-line no-control-regex
      for (const l of lines.map((x) => x.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, ""))) if (l.trim()) onLine(l);
    };
    child.stdout!.on("data", take);
    child.stderr!.on("data", take);
    child.on("error", reject);
    child.on("close", (code) => {
      if (rest.trim()) onLine(rest);
      code === 0 ? resolve() : reject(new Error(`${what} stopped with an error (exit ${code})`));
    });
  });
}

/** Opens Terminal (on Windows, a console window) running the CLI's sign-in, in the beatsheet folder. */
export async function openSignIn(name: CliName): Promise<void> {
  const cli = await findCli(name);
  if (!cli) throw new Error(`${name} isn't installed`);
  const dir = join(RUNTIME, "launch");
  mkdirSync(dir, { recursive: true });
  if (WINDOWS) {
    const script = join(dir, `sign-in-${name}.cmd`);
    // `call`, so a .cmd shim (npm's codex) returns to the script; /k keeps the window open to read what it said.
    const command = SETUP[name].signIn.replace(/^\S+/, `call "${cli}"`);
    // UTF-8 (chcp 65001), as the script is written, for a folder or user name beyond ASCII.
    writeFileSync(script, ["@echo off", "chcp 65001 >nul", `title Sign in to ${name}`, `cd /d "${WORKSPACE}"`, command, ""].join("\r\n"));
    const child = spawn(process.env.ComSpec ?? systemExe("cmd.exe"), ["/d", "/c", `start "Sign in to ${name}" "${process.env.ComSpec ?? systemExe("cmd.exe")}" /k "${script}"`], {
      env: await cliEnv(),
      detached: true,
      stdio: "ignore",
      windowsVerbatimArguments: true,
    });
    child.unref();
    return;
  }
  const script = join(dir, `sign-in-${name}.command`);
  const command = SETUP[name].signIn.replace(/^\S+/, `'${cli}'`);
  writeFileSync(script, ["#!/bin/zsh -l", `cd '${WORKSPACE}'`, `printf '\\e]0;Sign in to ${name}\\a'`, command, ""].join("\n"));
  chmodSync(script, 0o755);
  await run("open", ["-a", "Terminal", script]);
}
