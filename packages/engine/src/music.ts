/** Beat grid and sections for a song, via the librosa script (run with uv, so there's nothing to install by hand). */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BeatGrid, MusicSection } from "@beatsheet/schema";
import { REPO } from "./paths.ts";

const run = promisify(execFile);

export type MusicAnalysis = { grid: BeatGrid; duration: number; sections: MusicSection[]; barEnergy: number[] };

export async function analyzeMusic(file: string): Promise<MusicAnalysis> {
  const script = join(REPO, "packages", "engine", "py", "analyze_music.py");
  const { stdout } = await run("uv", ["run", "--quiet", "--with", "librosa", "--with", "numpy", "python", "-I", script, file], {
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
