/**
 * The shots inside one long file: a tape transferred whole, a DVD, a film. Where the picture changes all at once is a
 * cut (ffmpeg's scene score), and each stretch between cuts becomes a moment on the clip ("Shot 3"), so a clip shot can
 * start on it and the agent can log it like a file of its own.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { Moment } from "@beatsheet/schema";
import { assetPath, cachePaths } from "./paths.ts";
import { loadProject, updateFile } from "./store.ts";

const run = promisify(execFile);

/** The moments a split makes; splitting again replaces them, and leaves the ones marked by hand. */
const SHOT = /^shot-\d+$/;

/** Times of the cuts in a file: where ffmpeg's scene score jumps past `threshold` (0..1). */
export async function cutsIn(file: string, threshold: number): Promise<number[]> {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:v:0", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"], { maxBuffer: 64 * 1024 * 1024 });
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
}

/** The stretches between cuts, none shorter than `shortest` seconds (a flash or a fade's flicker isn't a shot). */
export function shotsBetween(cuts: number[], duration: number, shortest = 1): { t: number; end: number }[] {
  const starts = [0];
  for (const c of [...cuts].sort((a, b) => a - b)) if (c - starts.at(-1)! >= shortest && duration - c >= shortest) starts.push(c);
  return starts.map((t, i) => ({ t: Math.round(t * 100) / 100, end: Math.round((starts[i + 1] ?? duration) * 100) / 100 }));
}

/**
 * Splits a clip into its shots, as moments "Shot 1", "Shot 2"… Reads the small preview copy when there is one (the
 * cuts are the same, and it's quicker). Returns the shots.
 */
export async function splitAtCuts(projectId: string, assetId: string, opts: { threshold?: number } = {}): Promise<Moment[]> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind !== "video" || !a.duration) throw new Error(`"${assetId}" isn't a clip`);
  const proxy = cachePaths(dir, a.id).proxy;
  const cuts = await cutsIn(existsSync(proxy) ? proxy : assetPath(project, dir, a), opts.threshold ?? 0.3);
  const shots: Moment[] = shotsBetween(cuts, a.duration).map((s, i) => ({ id: `shot-${i + 1}`, ...s, label: `Shot ${i + 1}` }));
  updateFile(projectId, (d) => {
    const x = d.assets.find((y) => y.id === assetId);
    if (x) x.moments = [...(x.moments ?? []).filter((m) => !SHOT.test(m.id)), ...shots].sort((p, q) => p.t - q.t);
  });
  return shots;
}
