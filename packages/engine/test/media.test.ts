import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeOnce, makeVideoProxy } from "../src/media.ts";

const dir = mkdtempSync(join(tmpdir(), "beatsheet-media-"));
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

beforeAll(() => {
  ff("-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=3", "-f", "lavfi", "-i", "sine=d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", join(dir, "clip.mp4"));
});

describe("making previews", () => {
  it("makes a file once however many ask for it at the same time, and leaves no temporary file", async () => {
    const out = join(dir, "once", "poster.jpg");
    let made = 0;
    const make = async (tmp: string) => {
      made++;
      await new Promise((r) => setTimeout(r, 20));
      writeFileSync(tmp, "poster");
    };
    await Promise.all([makeOnce(out, make), makeOnce(out, make), makeOnce(out, make)]);
    expect(made).toBe(1);
    expect(readFileSync(out, "utf8")).toBe("poster");
    expect(readdirSync(join(dir, "once"))).toEqual(["poster.jpg"]);
    // Made already: not again.
    await makeOnce(out, make);
    expect(made).toBe(1);
  });

  it("cleans up after a job that fails, and tries again when asked again", async () => {
    const out = join(dir, "fails", "strip.jpg");
    await expect(
      makeOnce(out, async (tmp) => {
        writeFileSync(tmp, "half");
        throw new Error("ffmpeg fell over");
      }),
    ).rejects.toThrow("ffmpeg fell over");
    expect(readdirSync(join(dir, "fails"))).toEqual([]);
    await makeOnce(out, async (tmp) => writeFileSync(tmp, "strip"));
    expect(readFileSync(out, "utf8")).toBe("strip");
  });

  it("keeps the file another process made while this one was making it", async () => {
    const out = join(dir, "raced", "proxy.mp4");
    await makeOnce(out, async (tmp) => {
      writeFileSync(out, "theirs");
      writeFileSync(tmp, "ours");
    });
    expect(readFileSync(out, "utf8")).toBe("theirs");
    expect(readdirSync(join(dir, "raced"))).toEqual(["proxy.mp4"]);
  });

  it("makes one whole preview copy when the import and the studio ask for it at once", async () => {
    const out = join(dir, ".cache", "proxy", "clip.mp4");
    await Promise.all([makeVideoProxy(join(dir, "clip.mp4"), out), makeVideoProxy(join(dir, "clip.mp4"), out)]);
    expect(existsSync(out)).toBe(true);
    // Decodes start to finish without a complaint.
    const decode = spawnSync("ffmpeg", ["-v", "error", "-i", out, "-f", "null", "-"], { encoding: "utf8" });
    expect(decode.status).toBe(0);
    expect(decode.stderr).toBe("");
    expect(readdirSync(join(dir, ".cache", "proxy"))).toEqual(["clip.mp4"]);
  });
});
