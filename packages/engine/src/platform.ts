/**
 * Where beatsheet differs between the Mac and Windows: its own folder, finding and starting programs, and the commands
 * it runs for what each system does its own way (showing a file, the Trash, unpacking a zip). The Mac's answers are
 * what beatsheet has always done; Windows' sit beside them. Most of these take the platform (and the environment), so
 * tests can ask for either.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { extname, posix, win32 } from "node:path";

export type Platform = NodeJS.Platform;
export const IS_WINDOWS = process.platform === "win32";

/** "this Mac" or "this PC", for what people read. */
export const HERE = IS_WINDOWS ? "this PC" : "this Mac";

/** beatsheet's own folder: settings, helpers it builds, and what Settings installs (SAM, Kokoro). */
export function appDataDir(platform: Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  if (platform === "win32") return win32.join(env.LOCALAPPDATA ?? win32.join(home, "AppData", "Local"), "beatsheet");
  if (platform === "darwin") return posix.join(home, "Library", "Application Support", "beatsheet");
  return posix.join(env.XDG_DATA_HOME ?? posix.join(home, ".local", "share"), "beatsheet");
}

/** A virtual environment's Python. */
export const venvPython = (venv: string, platform: Platform = process.platform) =>
  platform === "win32" ? win32.join(venv, "Scripts", "python.exe") : posix.join(venv, "bin", "python");

/**
 * Renames over a file in one step, as writes that mustn't be seen half-done do. Windows refuses (EPERM, EBUSY,
 * EACCES) while anything has the file open for a moment (a reader, the antivirus), so there it tries again for a
 * second; a Mac renames straight away, as it always has.
 */
export function replaceFile(from: string, to: string, platform: Platform = process.platform, rename: (a: string, b: string) => void = renameSync) {
  if (platform !== "win32") return rename(from, to);
  for (let attempt = 1; ; attempt++) {
    try {
      return rename(from, to);
    } catch (err) {
      if (attempt >= 20 || !["EPERM", "EBUSY", "EACCES"].includes((err as NodeJS.ErrnoException).code ?? "")) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

// ---- PATH

/** The name the PATH variable has in `env` (Windows keeps whichever case it was given, usually "Path"). */
export function pathKey(env: NodeJS.ProcessEnv, platform: Platform = process.platform): string {
  if (platform !== "win32") return "PATH";
  return Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "Path";
}

/** Joins PATH lists, first wins, without repeats (case doesn't matter on Windows). */
export function mergePath(lists: (string | undefined)[], platform: Platform = process.platform): string {
  const sep = platform === "win32" ? ";" : ":";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists)
    for (const p of (list ?? "").split(sep)) {
      const key = platform === "win32" ? p.replace(/[\\/]+$/, "").toLowerCase() : p;
      if (!p || seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  return out.join(sep);
}

/** `env` with PATH set, under the one name Windows will use. */
export function withPath(env: NodeJS.ProcessEnv, PATH: string, platform: Platform = process.platform): NodeJS.ProcessEnv {
  const out = { ...env };
  const key = pathKey(env, platform);
  if (platform === "win32") for (const k of Object.keys(out)) if (k.toUpperCase() === "PATH") delete out[k];
  out[key] = PATH;
  return out;
}

/**
 * The PATH a new terminal would get on Windows: the machine's and the person's own, from the registry, with %VARS%
 * expanded. An app keeps the PATH it started with, so a tool installed since (ffmpeg, uv, an agent CLI) is found here.
 */
export function parseRegistryPath(regOutput: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const m = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(regOutput);
  if (!m) return undefined;
  return m[1]!.trim().replace(/%([^%]+)%/g, (all, name: string) => {
    const key = Object.keys(env).find((k) => k.toUpperCase() === name.toUpperCase());
    return key ? (env[key] ?? all) : all;
  });
}

export async function registryPath(): Promise<string> {
  const query = (key: string) => capture(systemExe("reg.exe"), ["query", key, "/v", "Path"]).then((r) => parseRegistryPath(r.out), () => undefined);
  const [machine, user] = await Promise.all([query("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment"), query("HKCU\\Environment")]);
  return mergePath([machine, user], "win32");
}

/** Windows' own folder. */
export const windowsDir = (env: NodeJS.ProcessEnv = process.env) => env.SystemRoot ?? env.windir ?? "C:\\Windows";
/** One of Windows' own programs, by its full path, so nothing on the PATH stands in for it (Git's tar, say). */
export const systemExe = (name: string, env: NodeJS.ProcessEnv = process.env) => win32.join(windowsDir(env), "System32", name);

// ---- Finding and starting programs

/** Where each agent CLI's installer puts it, for when the PATH doesn't say. */
export function cliGuesses(name: string, platform: Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string[] {
  if (platform === "win32") {
    const w = win32.join;
    const appData = env.APPDATA ?? w(home, "AppData", "Roaming");
    const local = env.LOCALAPPDATA ?? w(home, "AppData", "Local");
    return [
      // The native installers (Claude Code's install.ps1) put an .exe in ~\.local\bin; npm -g puts a .cmd shim in %APPDATA%\npm.
      w(home, ".local", "bin", `${name}.exe`),
      w(appData, "npm", `${name}.cmd`),
      w(local, "Programs", name, `${name}.exe`),
      w(home, ".claude", "local", `${name}.exe`),
      w(home, ".npm-global", `${name}.cmd`),
    ];
  }
  const j = posix.join;
  const own: Record<string, string[]> = {
    muse: [j(home, ".local/bin/muse")],
    codex: [j(home, ".local/bin/codex"), j(home, ".npm-global/bin/codex")],
    claude: [j(home, ".local/bin/claude"), j(home, ".claude/local/claude"), j(home, ".npm-global/bin/claude")],
  };
  return [...(own[name] ?? [j(home, ".local/bin", name)]), `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`];
}

/** What `where.exe` found, best first: a real program before a script shim. */
export function pickWhere(output: string): string | undefined {
  const rank = (p: string) => ({ ".exe": 0, ".com": 1, ".cmd": 2, ".bat": 3 })[extname(p).toLowerCase()] ?? 9;
  const found = output.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[a-z]:\\|^\\\\/i.test(l) && rank(l) < 9);
  return found.sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * The script an npm shim runs (`%APPDATA%\npm\codex.cmd` → …\node_modules\@openai\codex\bin\codex.js), so it can run
 * on Node directly instead of through cmd.exe, which can't pass arguments like a JSON config through intact.
 */
export function npmShimTarget(shimText: string, shimDir: string): string | undefined {
  const m = /"%(?:~)?dp0%?\\([^"]+\.(?:c|m)?js)"/i.exec(shimText);
  return m ? win32.resolve(shimDir, m[1]!) : undefined;
}

export type Launch = { command: string; args: string[]; windowsVerbatimArguments?: boolean };

/** cmd.exe's own quoting, for the rare shim that isn't npm's (after cross-spawn's). */
export function cmdQuote(arg: string): string {
  let a = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, "$1$1");
  a = `"${a}"`;
  return a.replace(/[()[\]%!^"`<>&|;, *?]/g, "^$&");
}

/**
 * How to start a program with these arguments. Windows can't start a .cmd or .bat directly (Node refuses, to keep
 * cmd.exe from reading the arguments as commands): an npm shim runs its script on Node, anything else goes through
 * cmd.exe with every argument escaped.
 */
export function launch(file: string, args: string[], platform: Platform = process.platform, read: (f: string) => string = (f) => readFileSync(f, "utf8")): Launch {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(file)) return { command: file, args };
  let script: string | undefined;
  try {
    script = npmShimTarget(read(file), win32.dirname(file));
  } catch {
    // unreadable: cmd.exe below
  }
  if (script) {
    const own = win32.join(win32.dirname(file), "node.exe");
    return { command: existsSync(own) ? own : "node", args: [script, ...args] };
  }
  const comspec = process.env.ComSpec ?? systemExe("cmd.exe");
  return { command: comspec, args: ["/d", "/s", "/c", `"${[file, ...args].map(cmdQuote).join(" ")}"`], windowsVerbatimArguments: true };
}

// ---- What each system does its own way

/** Shows a file in Finder or File Explorer. */
export function revealCommand(path: string, platform: Platform = process.platform): Launch {
  // explorer.exe takes /select,"<path>" as one argument, quoted its own way.
  if (platform === "win32") return { command: win32.join(windowsDir(), "explorer.exe"), args: [`/select,"${path}"`], windowsVerbatimArguments: true };
  return { command: "open", args: ["-R", path] };
}

/** Unpacks a .zip into a folder: ditto on the Mac, Windows' own tar (bsdtar reads zips) on Windows. */
export function unzipCommand(zip: string, out: string, platform: Platform = process.platform): Launch {
  if (platform === "win32") return { command: systemExe("tar.exe"), args: ["-xf", zip, "-C", out] };
  return { command: "ditto", args: ["-x", "-k", zip, out] };
}

/** Unpacks a .tar.gz, dropping its top folder. */
export function untarCommand(tgz: string, out: string, platform: Platform = process.platform): Launch {
  return { command: platform === "win32" ? systemExe("tar.exe") : "tar", args: ["-xzf", tgz, "-C", out, "--strip-components", "1"] };
}

/** A PowerShell string literal. */
export const psString = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Windows PowerShell 5.1, which every Windows 10 and 11 has, running `script` (UTF-8 in and out). */
export function powershell(script: string): Launch {
  const full = `$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); [Console]::InputEncoding = [Text.UTF8Encoding]::new($false)\n${script}`;
  return {
    command: systemExe("WindowsPowerShell\\v1.0\\powershell.exe"),
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(full, "utf16le").toString("base64")],
  };
}

/** Moves a folder to the Recycle Bin, as Delete in File Explorer does (so Restore works). */
export const recycleCommand = (folder: string) =>
  powershell(`Add-Type -AssemblyName Microsoft.VisualBasic\n[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(${psString(folder)}, 'OnlyErrorDialogs', 'SendToRecycleBin')`);

/** Windows' own file and folder pickers (for the studio in a browser; the app has its own). Prints the path, or nothing. */
export function pickerCommand(kind: "folder" | "audio" | "file"): Launch {
  const dialog =
    kind === "folder"
      ? `$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Choose a folder'; $d.ShowNewFolderButton = $true; if ($d.ShowDialog($owner) -eq 'OK') { $d.SelectedPath }`
      : `$d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = ${psString(kind === "audio" ? "Choose a song or recording" : "Choose a file")}; ${kind === "audio" ? `$d.Filter = 'Audio|*.mp3;*.m4a;*.wav;*.aac;*.aiff;*.flac;*.ogg;*.webm|All files|*.*';` : ""} if ($d.ShowDialog($owner) -eq 'OK') { $d.FileName }`;
  // A topmost owner window, so the picker comes up in front of the browser.
  return powershell(`Add-Type -AssemblyName System.Windows.Forms\n$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }\n${dialog}`);
}

/** Runs a command and collects what it says. Rejects only when it can't start; the exit code is in the answer. */
export function capture(command: string, args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv; timeout?: number; windowsVerbatimArguments?: boolean } = {}): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: opts.env ?? process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, windowsVerbatimArguments: opts.windowsVerbatimArguments });
    let out = "", err = "";
    const timer = opts.timeout ? setTimeout(() => child.kill(), opts.timeout) : undefined;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => (clearTimeout(timer), reject(e)));
    child.on("close", (code) => (clearTimeout(timer), resolve({ code: code ?? 1, out, err })));
    child.stdin.end(opts.input ?? "");
  });
}

/** Runs a Launch (see `launch`, `powershell`) and collects what it says. */
export const run = (l: Launch, opts: { input?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}) =>
  capture(l.command, l.args, { ...opts, windowsVerbatimArguments: l.windowsVerbatimArguments });
