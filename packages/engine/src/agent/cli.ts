/**
 * Finding the agent CLIs and starting things the way the person's terminal would. The studio may run without their
 * login PATH (a desktop app never has it), so ask a login shell, then look where each CLI installs.
 */
import { execFile, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { REPO } from "../paths.ts";

const run = promisify(execFile);
const home = homedir();

export type CliName = "muse" | "codex" | "claude";

/** Where each CLI's installer puts it, for when the login shell doesn't say. */
const GUESSES: Record<CliName, string[]> = {
  muse: [join(home, ".local/bin/muse")],
  codex: [join(home, ".local/bin/codex"), join(home, ".npm-global/bin/codex")],
  claude: [join(home, ".local/bin/claude"), join(home, ".claude/local/claude"), join(home, ".npm-global/bin/claude")],
};

/**
 * Getting each CLI working: the official install command (when there's one beatsheet can run for you) and the command
 * that signs in. Sign-in always happens in the CLI itself, in a terminal; beatsheet never sees the credentials.
 */
export const SETUP: Record<CliName, { install?: string; signIn: string }> = {
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
  try {
    const { stdout } = await run("/bin/zsh", ["-lc", `command -v ${name}`], { timeout: 8000 });
    const p = stdout.trim().split("\n").pop();
    if (p?.startsWith("/")) path = p;
  } catch {
    // not on the login PATH
  }
  path ??= [...GUESSES[name], `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`].find((g) => existsSync(g)) ?? null;
  found.set(name, { at: Date.now(), path });
  return path;
}

let loginPath: string | undefined;
/** The environment for a CLI: this process's, with the login shell's PATH so its own tools (node, git) resolve. */
export async function cliEnv(extra: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
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
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/bin/zsh", ["-lc", command], { env, stdio: ["ignore", "pipe", "pipe"] });
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

/** Opens Terminal running the CLI's sign-in, in the beatsheet folder. */
export async function openSignIn(name: CliName): Promise<void> {
  const cli = await findCli(name);
  if (!cli) throw new Error(`${name} isn't installed`);
  const dir = join(REPO, ".beatsheet", "launch");
  mkdirSync(dir, { recursive: true });
  const script = join(dir, `sign-in-${name}.command`);
  const command = SETUP[name].signIn.replace(/^\S+/, `'${cli}'`);
  writeFileSync(script, ["#!/bin/zsh -l", `cd '${REPO}'`, `printf '\\e]0;Sign in to ${name}\\a'`, command, ""].join("\n"));
  chmodSync(script, 0o755);
  await run("open", ["-a", "Terminal", script]);
}
