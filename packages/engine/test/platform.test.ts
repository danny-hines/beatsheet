import { describe, expect, it } from "vitest";
import { permissionArgs } from "../src/agent/claude.ts";
import { touchesKeys } from "../src/agent/session.ts";
import { hardwareProxy } from "../src/media.ts";
import {
  appDataDir,
  cliGuesses,
  cmdQuote,
  containerOf,
  launch,
  mergePath,
  npmShimTarget,
  findOnPath,
  powershell,
  replaceFile,
  revealCommand,
  untarCommand,
  unzipCommand,
  venvPython,
  withPath,
} from "../src/platform.ts";
import { parseGpus, unsupported, videoLimits } from "../src/sam-cuda.ts";
import { fitSize, readRate } from "../src/subjects-windows.ts";

describe("where beatsheet keeps its own things", () => {
  it("is Application Support on a Mac, as it always was", () => {
    expect(appDataDir("darwin", {}, "/Users/me")).toBe("/Users/me/Library/Application Support/beatsheet");
  });

  it("is %LOCALAPPDATA% on Windows", () => {
    expect(appDataDir("win32", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }, "C:\\Users\\me")).toBe("C:\\Users\\me\\AppData\\Local\\beatsheet");
    expect(appDataDir("win32", {}, "C:\\Users\\me")).toBe("C:\\Users\\me\\AppData\\Local\\beatsheet");
  });

  it("finds a virtual environment's Python where each system puts it", () => {
    expect(venvPython("/a/venv", "darwin")).toBe("/a/venv/bin/python");
    expect(venvPython("C:\\a\\venv", "win32")).toBe("C:\\a\\venv\\Scripts\\python.exe");
  });

  // Real paths from a PC where beatsheet was started from a terminal in Claude's desktop app.
  it("knows when Windows keeps it in another app's container", () => {
    const dir = "C:\\Users\\danny\\AppData\\Local\\beatsheet\\sam3";
    expect(containerOf(dir, "C:\\Users\\danny\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\LocalCache\\Local\\beatsheet\\sam3")).toBe("Claude");
    expect(containerOf(dir, dir)).toBeUndefined();
    expect(containerOf(dir, "c:\\users\\danny\\appdata\\local\\beatsheet\\sam3")).toBeUndefined();
    expect(containerOf("/Users/me/Library/Application Support/beatsheet", "/Users/me/Library/Application Support/beatsheet")).toBeUndefined();
  });
});

describe("replacing a file in one step", () => {
  const flaky = (failures: number, code = "EPERM") => {
    let calls = 0;
    return {
      rename: () => {
        if (++calls <= failures) throw Object.assign(new Error(code), { code });
      },
      calls: () => calls,
    };
  };

  it("tries again on Windows while something holds the file for a moment", () => {
    const r = flaky(3);
    replaceFile("a.tmp", "a", "win32", r.rename);
    expect(r.calls()).toBe(4);
  });

  it("renames once on a Mac, and gives up on Windows for any other error", () => {
    const mac = flaky(1);
    expect(() => replaceFile("a.tmp", "a", "darwin", mac.rename)).toThrow("EPERM");
    expect(mac.calls()).toBe(1);
    const gone = flaky(1, "ENOENT");
    expect(() => replaceFile("a.tmp", "a", "win32", gone.rename)).toThrow("ENOENT");
    expect(gone.calls()).toBe(1);
  });
});

describe("PATH", () => {
  it("joins lists with the system's separator, first wins, no repeats", () => {
    expect(mergePath(["/opt/homebrew/bin:/usr/bin", "/usr/bin:/bin"], "darwin")).toBe("/opt/homebrew/bin:/usr/bin:/bin");
    // Windows ignores case and a trailing slash.
    expect(mergePath(["C:\\Windows\\System32;C:\\Tools\\", "c:\\windows\\system32;C:\\tools;D:\\bin"], "win32")).toBe("C:\\Windows\\System32;C:\\Tools\\;D:\\bin");
  });

  it("sets PATH under one name on Windows, whatever case it came in", () => {
    const env = withPath({ Path: "C:\\old", PATH: "C:\\older", HOME: "x" }, "C:\\new", "win32");
    expect(Object.keys(env).filter((k) => k.toUpperCase() === "PATH")).toEqual(["Path"]);
    expect(env.Path).toBe("C:\\new");
    expect(withPath({ PATH: "/old" }, "/new", "darwin")).toEqual({ PATH: "/new" });
  });
});

describe("finding the agent CLIs", () => {
  it("looks where each installer puts them on a Mac, as before", () => {
    expect(cliGuesses("claude", "darwin", {}, "/Users/me")).toEqual([
      "/Users/me/.local/bin/claude",
      "/Users/me/.claude/local/claude",
      "/Users/me/.npm-global/bin/claude",
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
    ]);
    expect(cliGuesses("codex", "darwin", {}, "/Users/me")).toEqual(["/Users/me/.local/bin/codex", "/Users/me/.npm-global/bin/codex", "/opt/homebrew/bin/codex", "/usr/local/bin/codex"]);
  });

  it("looks for the native installer's .exe and npm's .cmd on Windows", () => {
    const g = cliGuesses("codex", "win32", { APPDATA: "C:\\Users\\me\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }, "C:\\Users\\me");
    expect(g).toContain("C:\\Users\\me\\.local\\bin\\codex.exe");
    expect(g).toContain("C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd");
  });

  it("takes a real program over a script shim anywhere on the PATH, and nothing that isn't a program", () => {
    const there = new Set(["C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd", "C:\\Users\\me\\AppData\\Roaming\\npm\\claude", "C:\\Users\\me\\.local\\bin\\claude.exe"]);
    const PATH = 'C:\\Users\\me\\AppData\\Roaming\\npm;"C:\\Users\\me\\.local\\bin";';
    expect(findOnPath("claude", PATH, (p) => there.has(p))).toBe("C:\\Users\\me\\.local\\bin\\claude.exe");
    expect(findOnPath("codex", PATH, (p) => there.has(p))).toBeUndefined();
  });
});

describe("starting a CLI on Windows", () => {
  // What npm writes for `npm install -g @openai/codex`.
  const shim = [
    "@ECHO off",
    "GOTO start",
    ":find_dp0",
    "SET dp0=%~dp0",
    "EXIT /b",
    ":start",
    "SETLOCAL",
    "CALL :find_dp0",
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ") ELSE (",
    '  SET "_prog=node"',
    "  SET PATHEXT=%PATHEXT:;.JS;=;%",
    ")",
    'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
  ].join("\r\n");

  it("finds the script an npm shim runs", () => {
    expect(npmShimTarget(shim, "C:\\Users\\me\\AppData\\Roaming\\npm")).toBe("C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js");
    expect(npmShimTarget("@echo off\r\nsomething.exe %*", "C:\\x")).toBeUndefined();
  });

  it("runs an npm shim's script on Node, so a JSON argument arrives whole", () => {
    const json = JSON.stringify({ mcpServers: { beatsheet: { command: "node" } } });
    const l = launch("C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd", ["app-server", json], "win32", () => shim);
    expect(l.command).toBe("node");
    expect(l.args).toEqual(["C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js", "app-server", json]);
    expect(l.windowsVerbatimArguments).toBeUndefined();
  });

  it("sends any other .cmd through cmd.exe with every argument escaped", () => {
    const l = launch("C:\\Tools\\muse.cmd", ["serve", 'a "b" & c'], "win32", () => "@echo off\r\nmuse.exe %*");
    expect(l.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(l.windowsVerbatimArguments).toBe(true);
    expect(l.args[3]).toContain(cmdQuote('a "b" & c'));
    expect(cmdQuote("a & b")).toBe('^"a^ ^&^ b^"');
  });

  it("starts programs as they are everywhere else", () => {
    expect(launch("C:\\Users\\me\\.local\\bin\\claude.exe", ["-p"], "win32")).toEqual({ command: "C:\\Users\\me\\.local\\bin\\claude.exe", args: ["-p"] });
    expect(launch("/Users/me/.local/bin/claude", ["-p"], "darwin")).toEqual({ command: "/Users/me/.local/bin/claude", args: ["-p"] });
  });
});

describe("what each system does its own way", () => {
  it("shows a file in Finder, or selected in File Explorer", () => {
    expect(revealCommand("/Users/me/a.mp4", "darwin")).toEqual({ command: "open", args: ["-R", "/Users/me/a.mp4"] });
    const w = revealCommand("C:\\Users\\me\\a b.mp4", "win32");
    expect(w.command.toLowerCase()).toMatch(/explorer\.exe$/);
    expect(w.args).toEqual(['/select,"C:\\Users\\me\\a b.mp4"']);
    expect(w.windowsVerbatimArguments).toBe(true);
  });

  it("unpacks zips with ditto on a Mac and Windows' own tar on a PC", () => {
    expect(unzipCommand("/d/a.zip", "/d/out", "darwin")).toEqual({ command: "ditto", args: ["-x", "-k", "/d/a.zip", "/d/out"] });
    const w = unzipCommand("C:\\d\\a.zip", "C:\\d\\out", "win32");
    expect(w.command.toLowerCase()).toMatch(/system32\\tar\.exe$/);
    expect(w.args).toEqual(["-xf", "C:\\d\\a.zip", "-C", "C:\\d\\out"]);
    expect(untarCommand("/d/a.tgz", "/d/x", "darwin")).toEqual({ command: "tar", args: ["-xzf", "/d/a.tgz", "-C", "/d/x", "--strip-components", "1"] });
  });

  it("hands PowerShell its script whole, as UTF-16 base64", () => {
    const l = powershell("Write-Output 'é'");
    expect(l.command.toLowerCase()).toMatch(/powershell\.exe$/);
    const script = Buffer.from(l.args[l.args.indexOf("-EncodedCommand") + 1]!, "base64").toString("utf16le");
    expect(script).toContain("Write-Output 'é'");
    expect(script).toContain("UTF8Encoding");
  });

  it("makes preview copies with VideoToolbox on a Mac and NVENC on a PC", () => {
    expect(hardwareProxy("darwin")).toEqual({ decode: ["-hwaccel", "videotoolbox"], encode: ["-c:v", "h264_videotoolbox", "-b:v", "3M", "-g", "15"] });
    expect(hardwareProxy("win32").encode).toContain("h264_nvenc");
    expect(hardwareProxy("win32").encode).toContain("yuv420p");
  });
});

describe("keeping hosted agents away from the keys", () => {
  const flag = (args: string[], name: string) => (args[args.indexOf(name) + 1] ?? "").split(",");

  it("gives Claude Code the same rules on a Mac as before", () => {
    const looking = ["ls", "pwd", "which", "file", "stat", "du", "wc", "ffprobe", "mdls"].flatMap((c) => [`Bash(${c})`, `Bash(${c} *)`]);
    const keys = "Bash(security *),Bash(*find-generic-password*),Bash(*find-internet-password*),Bash(*dump-keychain*)";
    expect(permissionArgs("ask", false, false)).toEqual(["--allowedTools", ["mcp__beatsheet", ...looking].join(","), "--disallowedTools", keys]);
    expect(permissionArgs("free", true, false)).toEqual(["--permission-mode", "acceptEdits", "--allowedTools", ["mcp__beatsheet", ...looking, "Bash", "Edit", "Write", "WebFetch", "WebSearch", "mcp__claude-in-chrome"].join(","), "--disallowedTools", keys]);
  });

  it("refuses Credential Manager on Windows, from Bash and PowerShell alike", () => {
    for (const level of ["ask", "free"] as const) {
      const denied = flag(permissionArgs(level, false, true), "--disallowedTools");
      expect(denied).toEqual(expect.arrayContaining(["Bash(security *)", "Bash(*beatsheet-credentials*)", "PowerShell(*beatsheet-credentials*)", "PowerShell(*CredRead*)", "PowerShell(*PasswordVault*)"]));
    }
    expect(flag(permissionArgs("free", false, true), "--allowedTools")).toContain("PowerShell");
    expect(flag(permissionArgs("ask", false, true), "--allowedTools")).not.toContain("PowerShell");
  });

  it("knows a request that reads keys on Windows, never approving it on the person's behalf", () => {
    expect(touchesKeys({ command: "& 'C:\\Users\\me\\AppData\\Local\\beatsheet\\bin\\beatsheet-credentials-abc.exe' get fal" }, true)).toBe(true);
    expect(touchesKeys({ command: "[Windows.Security.Credentials.PasswordVault]::new().RetrieveAll()" }, true)).toBe(true);
    expect(touchesKeys({ command: "cmdkey /list" }, true)).toBe(true);
    expect(touchesKeys({ file_path: "C:\\Users\\me\\.codex\\auth.json" }, true)).toBe(true);
    expect(touchesKeys({ command: "Get-ChildItem C:\\Users\\me\\Videos" }, true)).toBe(false);
    // On a Mac the Windows names mean nothing special, as before.
    expect(touchesKeys({ command: "cmdkey /list" }, false)).toBe(false);
  });
});

describe("SAM 3.1 on an NVIDIA card", () => {
  const csv = "NVIDIA GeForce RTX 4090, 24564, 576.88, 8.9\r\nNVIDIA GeForce RTX 3090, 24576, 576.88, 8.6\r\n";

  it("reads the cards nvidia-smi lists", () => {
    expect(parseGpus(csv)).toEqual([
      { name: "NVIDIA GeForce RTX 4090", memoryMb: 24564, driver: 576, compute: 8.9 },
      { name: "NVIDIA GeForce RTX 3090", memoryMb: 24576, driver: 576, compute: 8.6 },
    ]);
  });

  it("runs on an RTX 30, 40 or 50 with a recent driver, and says why not otherwise", () => {
    const card = (memoryMb: number, driver: number, compute: number) => ({ gpu: { name: "card", memoryMb, driver, compute } });
    expect(unsupported(card(24564, 576, 8.9), "win32", "x64")).toBeUndefined();
    expect(unsupported(card(12227, 581, 12.0), "win32", "x64")).toBeUndefined();
    expect(unsupported(card(11264, 576, 7.5), "win32", "x64")).toMatch(/RTX 30/);
    expect(unsupported(card(24564, 552, 8.9), "win32", "x64")).toMatch(/driver/);
    expect(unsupported({ why: "Needs an NVIDIA graphics card" }, "win32", "x64")).toMatch(/NVIDIA/);
    expect(unsupported(card(24564, 576, 8.9), "darwin", "arm64")).toMatch(/Windows/);
  });

  it("works on smaller clips on a 12 GB card", () => {
    expect(videoLimits({ name: "RTX 4090", memoryMb: 24564, driver: 576, compute: 8.9 })).toEqual({ maxSide: 1920, maxSeconds: 30, low: false });
    expect(videoLimits({ name: "RTX 5070", memoryMb: 12227, driver: 581, compute: 12 })).toEqual({ maxSide: 1280, maxSeconds: 20, low: true });
  });

  it("cuts clips down to even sizes and a frame count the card can take", () => {
    expect(fitSize(3840, 2160, 1920)).toEqual({ width: 1920, height: 1080 });
    expect(fitSize(1080, 1920, 1280)).toEqual({ width: 720, height: 1280 });
    expect(fitSize(1001, 563, 1920)).toEqual({ width: 1002, height: 564 });
    expect(readRate(12, 5)).toBe(5);
    expect(readRate(600, 5)).toBe(2);
    expect(readRate(3600, 10, 2)).toBe(2);
  });
});
