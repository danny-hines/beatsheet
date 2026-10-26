/**
 * The Python tooling Settings' installs share (SAM, Kokoro): uv, a command's output passed on line by line, how much a
 * folder takes, and a big download in resumable pieces. On Windows uv comes from its PowerShell installer and a
 * folder's size is added up by hand (there's no du).
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { cliEnv } from "./agent/cli.ts";
import { capture, IS_WINDOWS, pickWhere, powershell, psString, systemExe } from "./platform.ts";
import { SETTINGS_DIR } from "./settings.ts";

const run = promisify(execFile);

/** Where SAM's install keeps its own uv, which Kokoro's install may find and use too. */
const SAM_HOME = join(SETTINGS_DIR, "sam3");

/**
 * uv, the Python package manager: the person's own if they have it, otherwise its official installer, into `home`'s
 * bin folder (SAM's by default; Kokoro uses it too).
 */
export async function findUv(log: (l: string) => void, signal: AbortSignal, home = SAM_HOME): Promise<string> {
  if (IS_WINDOWS) return findUvWindows(log, signal, home);
  const own = join(home, "bin", "uv");
  const env = await cliEnv();
  try {
    const { stdout } = await run("/bin/zsh", ["-lc", "command -v uv"], { timeout: 8000, env });
    const p = stdout.trim().split("\n").pop();
    if (p?.startsWith("/")) {
      log(`Using uv at ${p}`);
      return p;
    }
  } catch {
    // not on the login PATH
  }
  const known = ["/opt/homebrew/bin/uv", "/usr/local/bin/uv", join(process.env.HOME ?? "", ".local", "bin", "uv"), join(SAM_HOME, "bin", "uv"), own].find((p) => existsSync(p));
  if (known) {
    log(`Using uv at ${known}`);
    return known;
  }
  // UV_UNMANAGED_INSTALL puts it in our folder and leaves the shell profile alone.
  const command = `curl -LsSf https://astral.sh/uv/install.sh | env UV_UNMANAGED_INSTALL='${join(home, "bin")}' sh`;
  log(`$ ${command}`);
  await stream("/bin/zsh", ["-lc", command], { env, signal, onLine: log });
  if (!existsSync(own)) throw new Error("The uv installer finished, but uv isn't where it should be");
  return own;
}

/** The same on Windows: uv on the PATH, where its installers put it, or its PowerShell installer into our folder. */
async function findUvWindows(log: (l: string) => void, signal: AbortSignal, home: string): Promise<string> {
  const own = join(home, "bin", "uv.exe");
  const env = await cliEnv();
  const where = await capture(systemExe("where.exe"), ["uv"], { env, timeout: 8000 }).catch(() => undefined);
  const known = (where && pickWhere(where.out)) ?? [join(homedir(), ".local", "bin", "uv.exe"), join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Links", "uv.exe"), join(SAM_HOME, "bin", "uv.exe"), own].find((p) => existsSync(p));
  if (known) {
    log(`Using uv at ${known}`);
    return known;
  }
  // UV_UNMANAGED_INSTALL puts it in our folder and leaves the PATH alone.
  const command = `$env:UV_UNMANAGED_INSTALL = ${psString(join(home, "bin"))}; irm https://astral.sh/uv/install.ps1 | iex`;
  log(`> ${command}`);
  const ps = powershell(command);
  await stream(ps.command, ps.args, { env, signal, onLine: log });
  if (!existsSync(own)) throw new Error("The uv installer finished, but uv isn't where it should be");
  return own;
}

/** Pieces of the model fetched at once: the CDN gives each connection a few MB/s, and many together much more. */
const CONNECTIONS = 8;
const PIECE = 16 * 2 ** 20;

/** A big file to fetch: where, how big, its SHA-256, and any headers it needs (a token for a gated model). */
export type Download = { url: string; bytes: number; sha256: string; headers?: Record<string, string> };

/**
 * Downloads a big file in pieces over several connections, writing each where it belongs. A manifest beside the
 * partial file lists the pieces done, so a stopped download resumes. The whole file is checked against its SHA-256
 * before it's kept.
 */
export async function download(what: Download, file: string, signal: AbortSignal, onProgress: (f: number) => void): Promise<void> {
  if (existsSync(file) && statSync(file).size === what.bytes) return onProgress(1);
  mkdirSync(dirname(file), { recursive: true });
  const part = `${file}.part`, manifest = `${part}.json`;
  const count = Math.ceil(what.bytes / PIECE);
  const range = (i: number) => [i * PIECE, Math.min(what.bytes, (i + 1) * PIECE) - 1] as const;
  let done = new Set<number>();
  try {
    const m = JSON.parse(readFileSync(manifest, "utf8")) as { url: string; done: number[] };
    if (m.url === what.url) done = new Set(m.done);
  } catch {
    // no manifest: whatever partial file is there can't be trusted
  }
  if (!done.size) rmSync(part, { force: true });
  let got = [...done].reduce((n, i) => n + range(i)[1] - range(i)[0] + 1, 0);
  /** Bytes of the pieces still coming in, so the bar moves smoothly. */
  const coming = new Map<number, number>();
  let reported = 0;
  const report = (force = false) => {
    const now = got + [...coming.values()].reduce((a, b) => a + b, 0);
    if (!force && now - reported < 4e6) return;
    reported = now;
    onProgress(Math.min(0.99, now / what.bytes));
  };
  report(true);

  // One piece failing stops the others; stopping the install stops them all.
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  signal.addEventListener("abort", onAbort);
  const queue = [...Array(count).keys()].filter((i) => !done.has(i));
  const fd = await open(part, existsSync(part) ? "r+" : "w+");
  const fetchPiece = async (i: number) => {
    const [from, to] = range(i);
    for (let attempt = 1; ; attempt++) {
      coming.set(i, 0);
      try {
        const res = await fetch(what.url, { signal: stop.signal, headers: { ...what.headers, Range: `bytes=${from}-${to}` } });
        if (res.status !== 206 || !res.body) throw new Error(`Hugging Face answered ${res.status}`);
        let at = from;
        for await (const chunk of Readable.fromWeb(res.body as import("node:stream/web").ReadableStream) as AsyncIterable<Buffer>) {
          await fd.write(chunk, 0, chunk.length, at);
          at += chunk.length;
          coming.set(i, at - from);
          report();
        }
        if (at !== to + 1) throw new Error("a piece of the model came back short");
        coming.delete(i);
        return at - from;
      } catch (err) {
        coming.delete(i);
        if (stop.signal.aborted || attempt === 4) throw err;
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  };
  const worker = async () => {
    for (let i = queue.shift(); i !== undefined && !stop.signal.aborted; i = queue.shift()) {
      // Not `got += await …`: that reads `got` before the wait, losing what other pieces added meanwhile.
      const bytes = await fetchPiece(i);
      got += bytes;
      done.add(i);
      writeFileSync(manifest, JSON.stringify({ url: what.url, done: [...done] }));
      report();
    }
  };
  try {
    const each = async () => {
      try {
        await worker();
      } catch (err) {
        stop.abort();
        throw err;
      }
    };
    const results = await Promise.allSettled(Array.from({ length: CONNECTIONS }, each));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason instanceof Error ? new Error(`Couldn't download the model: ${failed.reason.message}`) : failed.reason;
  } finally {
    signal.removeEventListener("abort", onAbort);
    await fd.close();
  }

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(part) as AsyncIterable<Buffer>) hash.update(chunk);
  if (hash.digest("hex") !== what.sha256) {
    rmSync(part, { force: true });
    rmSync(manifest, { force: true });
    throw new Error("The model download was damaged (its checksum didn't match). Install again to download it fresh.");
  }
  renameSync(part, file);
  rmSync(manifest, { force: true });
  onProgress(1);
}

/** Terminal colours and styles, which a log on a page doesn't want. */
const plain = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, "");

/** Runs a command, passing each line of its output on; rejects if it fails or is stopped. */
export function stream(cmd: string, args: string[], opts: { cwd?: string; env: NodeJS.ProcessEnv; signal: AbortSignal; onLine: (l: string) => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"], signal: opts.signal, windowsHide: true });
    let rest = "", last = "";
    const take = (d: Buffer) => {
      const lines = (rest + d.toString()).split(/\r?\n|\r/);
      rest = lines.pop() ?? "";
      for (const l of lines.map(plain)) if (l.trim()) opts.onLine((last = l));
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", reject);
    child.on("close", (code) => {
      if (rest.trim()) opts.onLine((last = plain(rest)));
      code === 0 ? resolve() : reject(new Error(`${last.trim() || `${cmd.split(/[\\/]/).pop()} stopped with an error`} (exit ${code})`));
    });
  });
}

export async function du(dir: string): Promise<number> {
  if (IS_WINDOWS) return sizeOf(dir);
  try {
    const { stdout } = await run("du", ["-sk", dir]);
    return Number(stdout.split("\t")[0]) * 1024;
  } catch {
    return 0;
  }
}

/** Bytes in a folder, not following links. */
function sizeOf(path: string): number {
  try {
    const s = lstatSync(path);
    return s.isDirectory() ? readdirSync(path).reduce((n, f) => n + sizeOf(join(path, f)), 0) : s.size;
  } catch {
    return 0;
  }
}
