import { describe, expect, it } from "vitest";
import { browserFrom } from "../src/chrome.ts";
import { putFirstOnPath } from "../src/platform.ts";

describe("the programs the app carries", () => {
  it("go ahead of everything on the PATH, Homebrew's included", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/opt/homebrew/bin:/usr/bin:/bin" };
    putFirstOnPath("/Applications/beatsheet.app/Contents/Resources/bin", env, "darwin");
    expect(env.PATH).toBe("/Applications/beatsheet.app/Contents/Resources/bin:/opt/homebrew/bin:/usr/bin:/bin");
  });

  it("aren't listed twice when a process is handed a PATH that already has them", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/app/bin:/bin" };
    putFirstOnPath("/app/bin", env, "darwin");
    expect(env.PATH).toBe("/app/bin:/usr/bin:/bin");
  });

  it("leave the PATH alone when the app carries none", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
    putFirstOnPath(undefined, env, "darwin");
    expect(env.PATH).toBe("/usr/bin:/bin");
  });

  it("go first on Windows too, under the name its PATH already has", () => {
    const env: NodeJS.ProcessEnv = { Path: "C:\\Windows\\System32;C:\\Program Files\\FFmpeg\\bin" };
    putFirstOnPath("C:\\Program Files\\beatsheet\\resources\\bin", env, "win32");
    expect(env.Path).toBe("C:\\Program Files\\beatsheet\\resources\\bin;C:\\Windows\\System32;C:\\Program Files\\FFmpeg\\bin");
    expect(env.PATH).toBeUndefined();
  });
});

describe("where the browser for rendering is", () => {
  it("is the path on the last BROWSER line, whatever was printed before it", () => {
    const out = 'Downloading…\n\nBROWSER {"type":"local-puppeteer-browser","path":"/Users/sam/Library/Application Support/beatsheet/chrome/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell"}\n';
    expect(browserFrom(out)).toBe("/Users/sam/Library/Application Support/beatsheet/chrome/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell");
  });

  it("is nothing when there's no browser, or no answer", () => {
    expect(browserFrom('BROWSER {"type":"no-browser"}\n')).toBeUndefined();
    expect(browserFrom('BROWSER {"type":"version-mismatch","actualVersion":null}\n')).toBeUndefined();
    expect(browserFrom("Error: getaddrinfo ENOTFOUND\n")).toBeUndefined();
    expect(browserFrom("BROWSER not json\n")).toBeUndefined();
  });
});
