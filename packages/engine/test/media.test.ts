import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { makeFrames, makeFullPicture, makeImageProxy, makeOnce, makePeaks, makePoster, makeVideoProxy, needsConverting, pictureBytes } from "../src/media.ts";

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

describe("what the timeline shows of a clip", () => {
  it("draws its sound fifty times a second, loud where the tone plays and silent after", async () => {
    const wav = join(dir, "tone.wav");
    // A second of tone, then a second of silence.
    ff("-f", "lavfi", "-i", "sine=f=440:d=1", "-af", "apad=pad_dur=1", "-ar", "48000", wav);
    const out = join(dir, "peaks", "tone.json");
    await makePeaks(wav, out);
    const { rate, peaks } = JSON.parse(readFileSync(out, "utf8")) as { rate: number; peaks: string };
    const values = [...Buffer.from(peaks, "base64")];
    expect(rate).toBe(50);
    expect(values.length).toBeGreaterThanOrEqual(99);
    expect(values.length).toBeLessThanOrEqual(101);
    expect(Math.min(...values.slice(5, 45))).toBeGreaterThan(20);
    expect(Math.max(...values.slice(60))).toBe(0);
  });

  it("gives a file with no sound an empty waveform", async () => {
    const silent = join(dir, "silent.mp4");
    ff("-f", "lavfi", "-i", "testsrc2=s=320x240:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", silent);
    const out = join(dir, "peaks", "silent.json");
    await makePeaks(silent, out);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({ rate: 50, peaks: "" });
  });

  it("makes a filmstrip with a frame a second for a short clip", async () => {
    const out = join(dir, "frames", "clip.jpg");
    await makeFrames(join(dir, "clip.mp4"), out, 3);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", out]).toString().trim();
    const [w, h] = probe.split(",").map(Number);
    expect(h).toBe(72);
    expect(w).toBe(128 * 3);
  });
});

/**
 * turned.heic is a phone-style photo made for this: 400×200 as stored, red on its left half and blue on its right,
 * marked to be shown turned a quarter clockwise. Shown right, it's 200×400 with red on top.
 */
describe("a phone's HEIC photo", () => {
  const heic = join(import.meta.dirname, "turned.heic");
  const shown = async (picture: Buffer | string) => {
    const { data, info } = await sharp(picture).rotate().raw().toBuffer({ resolveWithObject: true });
    const at = (10 * info.width + Math.round(info.width / 2)) * info.channels;
    return { size: `${info.width}x${info.height}`, top: data[at]! > data[at + 2]! ? "red" : "blue" };
  };

  it("isn't something the picture library reads by itself (if it ever is, the converting can go)", async () => {
    await expect(sharp(heic).rotate().raw().toBuffer()).rejects.toThrow();
  });

  // ffmpeg reads HEIC from 7.1; an older one on the PATH can't be asked to.
  const ffmpegReadsHeic = (() => {
    const v = /ffmpeg version n?(\d+)\.(\d+)/.exec(spawnSync("ffmpeg", ["-version"]).stdout?.toString() ?? "");
    return !!v && (Number(v[1]) > 7 || (Number(v[1]) === 7 && Number(v[2]) >= 1));
  })();

  it.skipIf(process.platform !== "darwin")("comes out the way it's shown through the Mac's own converter", async () => {
    expect(await shown(await pictureBytes(heic, "sips"))).toEqual({ size: "200x400", top: "red" });
  });

  it.skipIf(!ffmpegReadsHeic)("comes out the way it's shown through ffmpeg, as on Windows", async () => {
    expect(await shown(await pictureBytes(heic, "ffmpeg"))).toEqual({ size: "200x400", top: "red" });
  });

  it.skipIf(process.platform !== "darwin" && !ffmpegReadsHeic)("gets its screen-sized copy and its poster, upright", async () => {
    const proxy = join(dir, "heic", "image.jpg");
    const poster = join(dir, "heic", "poster.jpg");
    await makeImageProxy(heic, proxy);
    await makePoster(heic, poster, "image");
    expect(await shown(proxy)).toEqual({ size: "200x400", top: "red" });
    // The poster is always 480 on its long side.
    expect(await shown(poster)).toEqual({ size: "240x480", top: "red" });
    // Nothing left behind in the folder but the two pictures.
    expect(readdirSync(join(dir, "heic")).sort()).toEqual(["image.jpg", "poster.jpg"]);
  });

  it.skipIf(process.platform !== "darwin" && !ffmpegReadsHeic)("gets a full-size copy for a finished export, which Chrome can draw", async () => {
    expect(needsConverting(heic)).toBe(true);
    expect(needsConverting("IMG_0001.HEIC")).toBe(true);
    expect(needsConverting("IMG_0001.jpg")).toBe(false);
    const full = join(dir, "heic-full", "full.jpg");
    await makeFullPicture(heic, full);
    expect(await shown(full)).toEqual({ size: "200x400", top: "red" });
    expect((await sharp(full).metadata()).format).toBe("jpeg");
  });

  it("leaves other photos as they are", async () => {
    const jpg = join(dir, "plain.jpg");
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#336699" } }).jpeg().toFile(jpg);
    expect((await pictureBytes(jpg)).equals(readFileSync(jpg))).toBe(true);
  });

  it("says which photo it couldn't read", async () => {
    const broken = join(dir, "broken.heic");
    writeFileSync(broken, "not a photo");
    await expect(pictureBytes(broken)).rejects.toThrow(/Couldn't read the photo .*broken\.heic/);
  });
});
