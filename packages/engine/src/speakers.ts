/**
 * Who's speaking, on this computer: sherpa-onnx's speaker labeller (pyannote's segmentation and a voice-embedding
 * model, clustered), so a family tape transcribed by Whisper here can say who said what without leaving the computer.
 * It runs on the processor everywhere, from a small build for each system (about 60 MB with its models), installed
 * beside Whisper in beatsheet's own folder, then checked on a clip with two voices. Whisper's words are then given the
 * speaker whose turn they fall in (assignSpeakers in the schema).
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SpeakerTurn } from "@beatsheet/schema";
import { REPO } from "./paths.ts";
import { IS_WINDOWS, run as runLaunch, systemExe } from "./platform.ts";
import { download, stream, type Download } from "./pyenv.ts";
import { SETTINGS_DIR } from "./settings.ts";
import type { Machine } from "./whispercpp.ts";

const exec = promisify(execFile);

export const SPEAKERS_DIR = join(SETTINGS_DIR, "whisper", "speakers");
const READY = join(SPEAKERS_DIR, "ready.json");
const CHECK = join(REPO, "packages", "engine", "native", "speakers-check.mp3");

/** sherpa-onnx v2.0.1, pinned: a processor build for each system (no text-to-speech, which beatsheet doesn't need). */
const RELEASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download";
const build = (name: string, bytes: number, sha256: string): Download & { name: string } => ({ name, url: `${RELEASE}/v2.0.1/${name}`, bytes, sha256 });
const BUILDS: Record<string, Download & { name: string }> = {
  // MT: carries its own C++ runtime, so it needs nothing else installed.
  "win32-x64": build("sherpa-onnx-v2.0.1-win-x64-shared-MT-Release-no-tts.tar.bz2", 25_567_228, "a644dfe2f7944afec9a356d2557c0452380f20ffcf2f8c704653cfce37558596"),
  "win32-arm64": build("sherpa-onnx-v2.0.1-win-arm64-shared-MD-Release-no-tts.tar.bz2", 20_618_046, "18bb6210f6e7ec527d8ac07bf97ff1183c1392625f80ded951548e4f5b1355fd"),
  "darwin-arm64": build("sherpa-onnx-v2.0.1-osx-arm64-shared-no-tts.tar.bz2", 18_663_994, "4fcc6c77c8d8d2e2f04cfdc17c6fd224c01469b78529370eb9d8e0e5ec97ac79"),
  "darwin-x64": build("sherpa-onnx-v2.0.1-osx-x64-shared-no-tts.tar.bz2", 21_058_330, "029b5ea0a4bd2f0c034a337c0043019323fd06491728d7fc712592e3b558be52"),
  "linux-x64": build("sherpa-onnx-v2.0.1-linux-x64-shared-no-tts.tar.bz2", 25_289_904, "b3b095f619059d54914027ff38f8a0a132ea3bbc5df32a212a9743a8bd1467b2"),
  "linux-arm64": build("sherpa-onnx-v2.0.1-linux-aarch64-shared-cpu.tar.bz2", 27_889_232, "a8fc9fb3940d1aa3f83136767742b05068f00253f560d53c4f5aeb75ab4cb350"),
};
/** The models carry no published checksums; these are of the files as downloaded on 2026-10-29. */
const SEGMENTATION: Download & { name: string } = {
  name: "sherpa-onnx-pyannote-segmentation-3-0.tar.bz2",
  url: `${RELEASE}/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2`,
  bytes: 6_958_444,
  sha256: "24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488",
};
/** WeSpeaker's ResNet34, trained on VoxCeleb (thousands of voices in many languages). */
const EMBEDDING: Download & { name: string } = {
  name: "wespeaker_en_voxceleb_resnet34_LM.onnx",
  url: `${RELEASE}/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx`,
  bytes: 26_530_550,
  sha256: "e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012",
};

type Ready = { binary: string; segmentation: string; embedding: string; at: string };

/** The build for a machine, and what it all downloads; nothing when there's none for it. */
export function speakersPlan(m: Pick<Machine, "platform" | "arch">): { build: Download & { name: string }; bytes: number } | undefined {
  const b = BUILDS[`${m.platform}-${m.arch}`];
  return b && { build: b, bytes: b.bytes + SEGMENTATION.bytes + EMBEDDING.bytes };
}

export function speakersReady(): Ready | undefined {
  try {
    const r = JSON.parse(readFileSync(READY, "utf8")) as Ready;
    return existsSync(r.binary) && existsSync(r.segmentation) && existsSync(r.embedding) ? r : undefined;
  } catch {
    return undefined;
  }
}

/** A .tar.bz2 unpacked into `out`. */
const unbz2 = (archive: string, out: string) => runLaunch({ command: IS_WINDOWS ? systemExe("tar.exe") : "tar", args: ["-xjf", archive, "-C", out] }, { timeout: 10 * 60_000 });

function find(dir: string, test: (name: string) => boolean): string | undefined {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && test(e.name)) return p;
    if (e.isDirectory()) {
      const hit = find(p, test);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Installs the speaker labeller for this machine and checks it hears two voices in the check clip. Called by
 * Whisper's install, and on its own for a Whisper installed before it.
 */
export async function installSpeakers(m: Pick<Machine, "platform" | "arch">, signal: AbortSignal, log: (l: string) => void, onProgress: (f: number) => void = () => {}): Promise<Ready> {
  const plan = speakersPlan(m);
  if (!plan) throw new Error(`sherpa-onnx has no build for ${m.platform} ${m.arch}`);
  mkdirSync(SPEAKERS_DIR, { recursive: true });
  rmSync(READY, { force: true });
  const archive = join(SPEAKERS_DIR, plan.build.name);
  await download(plan.build, archive, signal, (f) => onProgress(f * 0.5));
  const bin = join(SPEAKERS_DIR, "bin");
  rmSync(bin, { recursive: true, force: true });
  mkdirSync(bin, { recursive: true });
  log(`Unpacking ${plan.build.name}`);
  await unbz2(archive, bin);
  rmSync(archive, { force: true });
  const binary = find(bin, (n) => n === (IS_WINDOWS ? "sherpa-onnx-offline-speaker-diarization.exe" : "sherpa-onnx-offline-speaker-diarization"));
  if (!binary) throw new Error(`There's no speaker labeller in ${plan.build.name}`);

  const seg = join(SPEAKERS_DIR, SEGMENTATION.name);
  await download(SEGMENTATION, seg, signal, (f) => onProgress(0.5 + f * 0.1));
  const segDir = join(SPEAKERS_DIR, "segmentation");
  rmSync(segDir, { recursive: true, force: true });
  mkdirSync(segDir, { recursive: true });
  await unbz2(seg, segDir);
  rmSync(seg, { force: true });
  const segmentation = find(segDir, (n) => n === "model.onnx");
  if (!segmentation) throw new Error("There's no model.onnx in the segmentation model");
  const embedding = join(SPEAKERS_DIR, EMBEDDING.name);
  await download(EMBEDDING, embedding, signal, (f) => onProgress(0.6 + f * 0.35));

  const ready: Ready = { binary, segmentation, embedding, at: new Date().toISOString() };
  const wav = join(tmpdir(), `beatsheet-speakers-check-${process.pid}.wav`);
  await exec("ffmpeg", ["-v", "error", "-y", "-i", CHECK, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav]);
  try {
    const turns = await runSpeakers(ready, wav, { signal });
    const voices = new Set(turns.map((t) => t.speaker)).size;
    log(`Heard ${voices} voice${voices === 1 ? "" : "s"} in the check clip, in ${turns.length} turns`);
    if (voices !== 2) throw new Error(`It ran, but heard ${voices} voice${voices === 1 ? "" : "s"} in a clip with two`);
  } finally {
    rmSync(wav, { force: true });
  }
  writeFileSync(READY, JSON.stringify(ready, null, 2));
  onProgress(1);
  return ready;
}

export function removeSpeakers() {
  rmSync(SPEAKERS_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

/**
 * Who spoke when in a 16 kHz mono WAV. With `people`, it's told how many voices there are; otherwise it decides.
 */
export async function runSpeakers(r: Ready, wav: string, opts: { people?: number; signal?: AbortSignal } = {}): Promise<SpeakerTurn[]> {
  const threads = String(Math.max(1, Math.min(4, cpus().length - 1)));
  const args = [
    `--segmentation.pyannote-model=${r.segmentation}`,
    `--embedding.model=${r.embedding}`,
    `--segmentation.num-threads=${threads}`,
    `--embedding.num-threads=${threads}`,
    ...(opts.people ? [`--clustering.num-clusters=${opts.people}`] : ["--clustering.cluster-threshold=0.5"]),
    wav,
  ];
  let out = "";
  await stream(r.binary, args, { env: process.env, signal: opts.signal ?? new AbortController().signal, onLine: (l) => (out += `${l}\n`) });
  return readTurns(out);
}

/** The labeller's lines, "1.583 -- 3.406 speaker_00", as turns. */
export function readTurns(out: string): SpeakerTurn[] {
  return [...out.matchAll(/^\s*([\d.]+)\s+--\s+([\d.]+)\s+(\S+)\s*$/gm)].map((m) => ({ s: Number(m[1]), e: Number(m[2]), speaker: m[3]! }));
}
