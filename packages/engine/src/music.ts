/**
 * Beat grid and sections for a song, via the librosa script. It runs with uv, which brings Python and librosa itself;
 * uv is fetched when the person doesn't have it, so there's nothing to install by hand.
 */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BeatGrid, MusicSection } from "@beatsheet/schema";
import { RESOURCES } from "./paths.ts";
import { findUv } from "./pyenv.ts";

const run = promisify(execFile);

let uv: Promise<string> | undefined;
/** uv, found once: the person's own, or fetched into beatsheet's folder the first time a song is analysed. */
const ourUv = () =>
  (uv ??= findUv(() => {}, AbortSignal.timeout(10 * 60_000)).catch((err) => {
    uv = undefined;
    throw err;
  }));

export type MusicAnalysis = { grid: BeatGrid; duration: number; sections: MusicSection[]; barEnergy: number[] };

export async function analyzeMusic(file: string): Promise<MusicAnalysis> {
  const script = join(RESOURCES, "packages", "engine", "py", "analyze_music.py");
  const { stdout } = await run(await ourUv(), ["run", "--quiet", "--with", "librosa", "--with", "numpy", "python", "-I", script, file], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const j = JSON.parse(stdout) as {
    bpm: number;
    downbeat: number;
    beatsPerBar: number;
    duration: number;
    sections: { id: string; label: string; start: number; end: number; level: "low" | "mid" | "high" }[];
    barEnergy: number[];
  };
  return {
    grid: { bpm: j.bpm, downbeat: j.downbeat, beatsPerBar: j.beatsPerBar },
    duration: j.duration,
    sections: j.sections.map(({ id, label, start, end, level }) => ({ id, label, start, end, level })),
    barEnergy: j.barEnergy,
  };
}
