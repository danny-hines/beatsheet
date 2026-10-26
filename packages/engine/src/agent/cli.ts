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
import { REPO } from "../paths.ts";
import { cliGuesses, findOnPath, launch, mergePath, pathKey, powershell, registryPath, systemExe, withPath } from "../platform.ts";

const run = promisify(execFile);
const WINDOWS = process.platform === "win32";

export type CliName = "muse" | "codex" | "claude";

/**
 * Getting each CLI working: the official install command (when there's one beatsheet can run for you) and the command
 * that signs in. Sign-in always happens in the CLI itself, in a terminal; beatsheet never sees the credentials. On
 * Windows the installers are PowerShell's (Claude Code's install.ps1) or npm's.
 */
export const SETUP: Record<CliName, { install?: string; signIn: string }> = WINDOWS
  ? {
      muse: { signIn: "muse" },
      codex: { install: "npm install -g @openai/codex", signIn: "codex login" },
      claude: { install: "irm https://claude.ai/install.ps1 | iex", signIn: "claude" },
    }
  : {
      muse: { signIn: "muse" },
      codex: { install: "npm install -g @openai/codex", signIn: "codex login" },
      claude: { install: "curl -fsSL https://claude.ai/install.sh | bash", signIn: "claude" },
    };

const found = new Map<CliName, { at: number; path: string | null }>();
/** Look again next time, e.g. right after installing. */
export const forgetCli = (name: CliName) => found.delete(name);
export async function findCli(name: CliName): Promise<string | null> {
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

/**
 * beatsheet's MCP server as a stdio command. Sessions the studio hosts mark themselves so the menu doesn't list them
 * twice. Inside the Mac app this process is Electron, so the server runs on the person's own Node instead.
 */
export const MCP_SERVER = {
  command: process.versions.electron ? "node" : process.execPath,
  args: [join(REPO, "packages", "engine", "src", "mcp.ts")],
  env: { BEATSHEET_HOSTED: "1" },
};

/**
 * Chrome DevTools MCP attached to the person's own running Chrome (signed in), for agents without a Chrome tool of
 * their own when "Use my Chrome" is on. It needs Chrome 144+ with remote debugging turned on at
 * chrome://inspect/#remote-debugging, and Chrome asks the person to allow each connection.
 */
export const CHROME_DEVTOOLS = {
  command: MCP_SERVER.command,
  args: [join(REPO, "node_modules", "chrome-devtools-mcp", "build", "src", "bin", "chrome-devtools-mcp.js"), "--autoConnect", "--no-usage-statistics"],
};

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
  const command = SETUP[name].install;
  if (!command) throw new Error(`beatsheet can't install ${name} for you`);
  onLine(`$ ${command}`);
  const env = await cliEnv();
  const shell = WINDOWS ? powershell(command) : { command: "/bin/zsh", args: ["-lc", command] };
  await new Promise<void>((resolve, reject) => {
    const child = spawn(shell.command, shell.args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let rest = "";
    const take = (d: Buffer) => {
      const lines = (rest + d.toString()).split(/\r?\n|\r/);
      rest = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onLine(l);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", reject);
    child.on("close", (code) => {
      if (rest.trim()) onLine(rest);
      code === 0 ? resolve() : reject(new Error(`The installer stopped with an error (exit ${code})`));
    });
  });
  forgetCli(name);
}

/** Opens Terminal (on Windows, a console window) running the CLI's sign-in, in the beatsheet folder. */
export async function openSignIn(name: CliName): Promise<void> {
  const cli = await findCli(name);
  if (!cli) throw new Error(`${name} isn't installed`);
  const dir = join(REPO, ".beatsheet", "launch");
  mkdirSync(dir, { recursive: true });
  if (WINDOWS) {
    const script = join(dir, `sign-in-${name}.cmd`);
    // `call`, so a .cmd shim (npm's codex) returns to the script; /k keeps the window open to read what it said.
    const command = SETUP[name].signIn.replace(/^\S+/, `call "${cli}"`);
    // UTF-8 (chcp 65001), as the script is written, for a folder or user name beyond ASCII.
    writeFileSync(script, ["@echo off", "chcp 65001 >nul", `title Sign in to ${name}`, `cd /d "${REPO}"`, command, ""].join("\r\n"));
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
  writeFileSync(script, ["#!/bin/zsh -l", `cd '${REPO}'`, `printf '\\e]0;Sign in to ${name}\\a'`, command, ""].join("\n"));
  chmodSync(script, 0o755);
  await run("open", ["-a", "Terminal", script]);
}
