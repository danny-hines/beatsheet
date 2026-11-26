/**
 * Pitch-preserving time stretching and formant-preserving pitch shifting via Rubber Band CLI (`rubberband --fine
 * --formant`), with an automatic ffmpeg `asetrate`+`aresample`+`atempo` fallback when the `rubberband` binary isn't
 * installed.
 *
 * Paired with `demucs.ts`, `shiftAudio(..., { keepMusic: true })` shifts ONLY the separated vocal stem and remixes
 * the untouched background music & ambience — ideal for character replacement (`swap`) and playful voice edits.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Asset } from "@beatsheet/schema";
import { separateStems, type DemucsRunner } from "./demucs.ts";
import { assetPath, BUILT, cleanPath, pitchPath } from "./paths.ts";
import { loadProject, updateFile } from "./store.ts";

const exec = promisify(execFile);

export type RubberbandStatus = {
  state: "ready" | "fallback";
  binary?: string;
  version?: string;
  detail: string;
};

const CANDIDATES = () =>
  [
    ...(BUILT.bin ? [join(BUILT.bin, process.platform === "win32" ? "rubberband.exe" : "rubberband")] : []),
    "/opt/homebrew/bin/rubberband",
    "/usr/local/bin/rubberband",
    "/usr/bin/rubberband",
    "rubberband",
  ];

/** Finds the `rubberband` CLI binary on this computer, if present. */
export function findRubberband(): { binary: string; version: string } | undefined {
  for (const bin of CANDIDATES()) {
    if (bin.includes("/") && !existsSync(bin)) continue;
    try {
      const out = execFileSync(bin, ["-V"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3000 });
      const version = out.trim().split("\n")[0]?.trim() || "installed";
      return { binary: bin, version };
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

export function rubberbandStatus(): RubberbandStatus {
  const found = findRubberband();
  if (found) {
    return {
      state: "ready",
      binary: found.binary,
      version: found.version,
      detail: `Rubber Band ${found.version} (high-quality formant-preserving pitch & speed)`,
    };
  }
  return {
    state: "fallback",
    detail: "Using ffmpeg fallback (install rubberband via Homebrew: `brew install rubberband` for R3 formant-preserving quality)",
  };
}

/** Builds a chained ffmpeg `atempo=...` filter for any positive speed factor (each stage stays in [0.5, 2.0]). */
export function atempoChain(factor: number): string {
  const stages: number[] = [];
  let rem = Math.max(0.125, Math.min(8, factor));
  while (rem > 2.0) {
    stages.push(2.0);
    rem /= 2.0;
  }
  while (rem < 0.5) {
    stages.push(0.5);
    rem /= 0.5;
  }
  stages.push(Math.round(rem * 10000) / 10000);
  return stages.map((s) => `atempo=${s}`).join(",");
}

export type ProcessAudioOpts = {
  /** Pitch shift in semitones (-12..+12). Default 0. */
  semitones?: number;
  /** Playback speed multiplier (>1 faster, <1 slower) preserving pitch. Default 1. */
  speed?: number;
  /** Preserve vocal formants (prevents chipmunk/monster artifacts). Default true. */
  formantPreserve?: boolean;
  /** Force ffmpeg fallback (useful for tests). */
  forceFfmpeg?: boolean;
};

/**
 * Processes an input WAV into an output WAV with pitch shift and/or pitch-preserving time stretch.
 * Returns which engine ran (`rubberband` or `ffmpeg`).
 */
export async function processAudio(inWav: string, outWav: string, opts: ProcessAudioOpts = {}): Promise<{ engine: "rubberband" | "ffmpeg" }> {
  const semitones = Math.max(-12, Math.min(12, opts.semitones ?? 0));
  const speed = Math.max(0.25, Math.min(4, opts.speed ?? 1));
  const formant = opts.formantPreserve ?? true;
  if (Math.abs(semitones) < 0.01 && Math.abs(speed - 1) < 0.005) {
    await exec("ffmpeg", ["-y", "-v", "error", "-i", inWav, "-c:a", "pcm_s16le", outWav]);
    return { engine: "ffmpeg" };
  }

  const rb = opts.forceFfmpeg ? undefined : findRubberband();
  if (rb) {
    const args: string[] = ["--fine"];
    if (formant) args.push("--formant");
    if (Math.abs(semitones) >= 0.01) args.push("-p", String(semitones));
    if (Math.abs(speed - 1) >= 0.005) args.push("-t", (1 / speed).toFixed(6));
    args.push(inWav, outWav);
    await exec(rb.binary, args, { maxBuffer: 16 * 1024 * 1024 });
    return { engine: "rubberband" };
  }

  // Fallback: ffmpeg asetrate (shifts pitch + speed together) + aresample back to 48kHz + atempo to restore exact speed.
  const rate = 48_000;
  const pitchFactor = Math.pow(2, semitones / 12);
  const filters: string[] = [];
  if (Math.abs(semitones) >= 0.01) {
    filters.push(`asetrate=${Math.round(rate * pitchFactor)}`, `aresample=${rate}`);
    // Compensate duration change from asetrate while also applying requested speed.
    filters.push(atempoChain(speed / pitchFactor));
  } else {
    filters.push(atempoChain(speed));
  }
  await exec("ffmpeg", ["-y", "-v", "error", "-i", inWav, "-ar", String(rate), "-af", filters.join(","), "-c:a", "pcm_s16le", outWav], { maxBuffer: 16 * 1024 * 1024 });
  return { engine: "ffmpeg" };
}

export type ShiftAudioOpts = {
  semitones?: number;
  speed?: number;
  /** Separate vocals from music via Demucs first, shift ONLY the vocals, and remix untouched music & ambience. */
  keepMusic?: boolean;
  formantPreserve?: boolean;
  /** When set, writes the processed audio to this file (WAV/M4A) without mutating `asset.pitch`. */
  outFile?: string;
  /** Optional clip stretch to extract before shifting (used by swap_character). */
  from?: number;
  to?: number;
  /** Injectable Demucs runner for unit tests. */
  demucsRunner?: DemucsRunner;
  forceFfmpeg?: boolean;
};

/**
 * Pitch-shifts (and/or pitch-preserving time-stretches) an asset's sound. Saves `media/<id>.pitch-*.m4a` and records
 * `asset.pitch` so clips play the shifted sound automatically (unless `outFile` is given, in which case it writes
 * straight to `outFile` for downstream muxing).
 */
export async function shiftAudio(
  projectId: string,
  assetId: string,
  opts: ShiftAudioOpts = {},
): Promise<{ asset: Asset; file: string; engine: "rubberband" | "ffmpeg"; keepMusic: boolean }> {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  if (a.kind === "image") throw new Error(`"${assetId}" is a photo; there's no sound to shift`);
  const semitones = Math.max(-12, Math.min(12, opts.semitones ?? 0));
  const speed = opts.speed ?? 1;
  if (Math.abs(semitones) < 0.01 && Math.abs(speed - 1) < 0.005) {
    throw new Error("Give a non-zero pitch shift (semitones) or speed change");
  }

  const work = join(tmpdir(), `beatsheet-pitch-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(work, { recursive: true });
  try {
    const trimArgs = [
      ...(opts.from !== undefined && opts.from > 0 ? ["-ss", String(opts.from)] : []),
      ...(opts.to !== undefined ? ["-t", String(Math.max(0.1, opts.to - (opts.from ?? 0)))] : []),
    ];
    let finalWav: string;
    let engine: "rubberband" | "ffmpeg";
    const keepMusic = !!opts.keepMusic && Math.abs(speed - 1) < 0.005;

    if (keepMusic) {
      const sep = await separateStems(projectId, assetId, { mode: "two-stem", runner: opts.demucsRunner });
      const vocalsSrc = sep.stems.vocals;
      const bgSrc = sep.stems.no_vocals;
      if (!vocalsSrc || !bgSrc) throw new Error("Demucs didn't return both vocals and no_vocals stems");
      const vIn = join(work, "vocals-in.wav");
      const bgIn = join(work, "bg-in.wav");
      const vOut = join(work, "vocals-shifted.wav");
      await exec("ffmpeg", ["-y", "-v", "error", ...trimArgs, "-i", vocalsSrc, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", vIn]);
      await exec("ffmpeg", ["-y", "-v", "error", ...trimArgs, "-i", bgSrc, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", bgIn]);
      ({ engine } = await processAudio(vIn, vOut, { semitones, speed: 1, formantPreserve: opts.formantPreserve, forceFfmpeg: opts.forceFfmpeg }));
      finalWav = join(work, "remixed.wav");
      await exec("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-i",
        vOut,
        "-i",
        bgIn,
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-c:a",
        "pcm_s16le",
        finalWav,
      ]);
    } else {
      const clean = cleanPath(dir, a);
      const src = clean && existsSync(clean) ? clean : assetPath(project, dir, a);
      if (!existsSync(src)) throw new Error(`Its file isn't there: ${src}`);
      const inWav = join(work, "in.wav");
      finalWav = join(work, "out.wav");
      await exec("ffmpeg", ["-y", "-v", "error", ...trimArgs, "-i", src, "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", inWav]);
      ({ engine } = await processAudio(inWav, finalWav, { semitones, speed, formantPreserve: opts.formantPreserve, forceFfmpeg: opts.forceFfmpeg }));
    }

    if (opts.outFile) {
      const codec = opts.outFile.endsWith(".wav") ? ["-c:a", "pcm_s16le"] : ["-c:a", "aac", "-b:a", "192k"];
      await exec("ffmpeg", ["-y", "-v", "error", "-i", finalWav, ...codec, opts.outFile]);
      return { asset: a, file: opts.outFile, engine, keepMusic };
    }

    mkdirSync(join(dir, "media"), { recursive: true });
    const pitch: NonNullable<Asset["pitch"]> = {
      semitones,
      ...(Math.abs(speed - 1) >= 0.005 ? { speed } : {}),
      ...(keepMusic ? { keepMusic: true } : {}),
      engine,
      at: new Date().toISOString(),
    };
    const out = pitchPath(dir, { ...a, pitch })!;
    await exec("ffmpeg", ["-y", "-v", "error", "-i", finalWav, "-c:a", "aac", "-b:a", "192k", out]);
    for (const f of readdirSync(join(dir, "media"))) {
      if (f.startsWith(`${a.id}.pitch-`) && join(dir, "media", f) !== out) rmSync(join(dir, "media", f), { force: true });
    }
    updateFile(projectId, (d) => {
      const x = d.assets.find((y) => y.id === a.id);
      if (x) x.pitch = pitch;
    });
    return { asset: { ...a, pitch }, file: out, engine, keepMusic };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Resets a clip's sound back to its un-shifted audio. */
export function unpitchAudio(projectId: string, assetId: string) {
  const { project, dir } = loadProject(projectId);
  const a = project.assets.find((x) => x.id === assetId);
  if (!a) throw new Error(`No asset "${assetId}"`);
  const file = pitchPath(dir, a);
  if (file) rmSync(file, { force: true });
  updateFile(projectId, (d) => {
    const x = d.assets.find((y) => y.id === assetId);
    if (x) delete x.pitch;
  });
}
