import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { envelope, lagOf } from "../src/multicam.ts";

const dir = mkdtempSync(join(tmpdir(), "beatsheet-multicam-"));
const ff = (...args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

beforeAll(() => {
  // An event's sound: bursts of noise at uneven times, like voices and claps. Camera B started 1.234 s into it and
  // hears it quieter, with a hum of its own.
  ff("-f", "lavfi", "-i", "anoisesrc=d=20:c=pink:seed=7", "-af", "volume='if(lt(mod(t*t*0.3,2),0.5),1,0.05)':eval=frame", "-ar", "48000", join(dir, "event.wav"));
  ff("-i", join(dir, "event.wav"), "-t", "15", join(dir, "a.wav"));
  ff("-ss", "1.234", "-i", join(dir, "event.wav"), "-f", "lavfi", "-i", "sine=f=60:d=20", "-filter_complex", "[0:a]volume=0.4[x];[1:a]volume=0.05[h];[x][h]amix=inputs=2:duration=first", "-t", "12", join(dir, "b.wav"));
});

describe("lining cameras up by their sound", () => {
  it("finds how far after the first the second started, to within a frame", async () => {
    const [a, b] = await Promise.all([envelope(join(dir, "a.wav")), envelope(join(dir, "b.wav"))]);
    const { seconds, confidence } = lagOf(a, b);
    expect(Math.abs(seconds - 1.234)).toBeLessThan(1 / 60);
    expect(confidence).toBeGreaterThan(1.5);
  });

  it("finds it the other way round as a camera that started earlier", async () => {
    const [a, b] = await Promise.all([envelope(join(dir, "a.wav")), envelope(join(dir, "b.wav"))]);
    expect(Math.abs(lagOf(b, a).seconds + 1.234)).toBeLessThan(1 / 60);
  });
});
