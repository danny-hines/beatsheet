import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Asset } from "@beatsheet/schema";
import { playableFor } from "../src/ingest.ts";
import { makePlayable } from "../src/media.ts";
import { assetPath, originalPath, playablePath } from "../src/paths.ts";
import { probe } from "../src/probe.ts";

const dir = mkdtempSync(join(tmpdir(), "beatsheet-oldvideo-"));
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

beforeAll(() => {
  // Two seconds of PAL DV, as a camcorder's tape comes off: interlaced, bottom field first, 720×576 with pixels 16:15 wide.
  ff("-f", "lavfi", "-i", "testsrc2=s=720x576:r=50:d=2", "-f", "lavfi", "-i", "sine=d=2", "-vf", "interlace=scan=bff", "-target", "pal-dv", join(dir, "tape.dv"));
  ff("-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(dir, "phone.mp4"));
});

describe("old video", () => {
  it("knows a tape's fields and its pixels' shape, and that it needs a copy to play", async () => {
    const tape = await probe(join(dir, "tape.dv"));
    expect(tape).toMatchObject({ kind: "video", width: 768, height: 576, fps: 25, interlaced: true, sar: 1.0667 });
    expect(playableFor("tape.dv", tape)).toEqual({ deinterlace: true, sar: 1.0667 });
    const phone = await probe(join(dir, "phone.mp4"));
    expect(phone.interlaced).toBeUndefined();
    expect(phone.sar).toBeUndefined();
    expect(playableFor("phone.mp4", phone)).toBeUndefined();
    // A progressive AVI still needs a copy: it won't play as it is.
    expect(playableFor("old.avi", {})).toEqual({});
  });

  it("plays from a copy with a frame for every field and square pixels, once it's made", async () => {
    const a: Asset = { id: "tape", kind: "video", path: "tape.dv", playable: { deinterlace: true, sar: 1.0667 } };
    const project = { sources: [{ id: "footage", path: dir }] };
    expect(assetPath(project, dir, a)).toBe(join(dir, "tape.dv"));
    await makePlayable(originalPath(project, dir, a), playablePath(dir, a.id), a.playable!);
    expect(assetPath(project, dir, a)).toBe(join(dir, "media", "tape.mp4"));
    expect(originalPath(project, dir, a)).toBe(join(dir, "tape.dv"));
    const copy = await probe(assetPath(project, dir, a));
    expect(copy).toMatchObject({ codec: "h264", width: 768, height: 576, fps: 50, hasAudio: true });
    expect(copy.interlaced).toBeUndefined();
    expect(copy.sar).toBeUndefined();
  });
});
