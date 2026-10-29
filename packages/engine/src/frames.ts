/**
 * A still cut from a clip, added to the project beside it: its last frame, to start the next clip from (so it carries
 * on from where this one ends), or any moment, to animate or give a sheet. Video models start from a picture, not a
 * clip, so this is how a clip is continued.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Asset } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { assetPath, projectDir } from "./paths.ts";
import { loadProject } from "./store.ts";

const run = promisify(execFile);

/**
 * Cuts the frame at `at` seconds (the last frame when it's left out) from a clip into a new still asset, or finds the
 * one already cut there. Returns the still.
 */
export async function stillFromClip(projectId: string, assetId: string, at?: number): Promise<Asset> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind !== "video") throw new Error(`"${assetId}" is a ${a.kind}, not a clip`);
  if (at !== undefined && (at < 0 || (a.duration !== undefined && at > a.duration))) throw new Error(`"${assetId}" is ${a.duration?.toFixed(1)}s long; there's no frame at ${at}s`);
  const when = at === undefined ? "last" : at.toFixed(2);
  const have = project.assets.find((x) => x.provenance?.refs?.[0] === assetId && x.provenance.params?.frame === when);
  if (have) return have;
  const folder = join(projectDir(projectId), "made", "frames");
  mkdirSync(folder, { recursive: true });
  const out = join(folder, `${assetId}-${when.replace(".", "_")}.jpg`);
  const file = assetPath(project, dir, a);
  // The last frame: read the final half second and keep overwriting the one picture, so what's left is the end.
  const args = at === undefined ? ["-sseof", "-0.5", "-i", file, "-update", "1", "-q:v", "2", out] : ["-ss", String(at), "-i", file, "-frames:v", "1", "-q:v", "2", out];
  rmSync(out, { force: true });
  await run("ffmpeg", ["-v", "error", "-y", ...args]);
  if (!existsSync(out)) throw new Error(`Couldn't cut a frame from "${assetId}"`);
  const name = a.label ?? a.id;
  return addAsset(projectId, out, {
    id: `${assetId}-${at === undefined ? "end" : "frame"}`,
    label: `${at === undefined ? "Last frame" : `Frame at ${when}s`} of ${name.length > 40 ? `${name.slice(0, 37).trimEnd()}…` : name}`,
    tags: ["still"],
    provenance: { source: "capture", refs: [assetId], params: { frame: when }, createdAt: new Date().toISOString() },
  });
}
