/**
 * Recording in the studio: the screen, a camera or the microphone, through the browser's own capture and
 * MediaRecorder. In the Mac app, macOS asks once for the camera and microphone, and the screen picker is macOS's own.
 * On Windows, Windows Settings has one switch for each that desktop apps share.
 */
import { useEffect, useRef, useState } from "react";
import { desktop, OS, WINDOWS } from "./lib";

export type RecordKind = "screen" | "camera" | "voice";

export const RECORD_WORDS: Record<RecordKind, { title: string; short: string; about: string }> = {
  screen: { title: "Record your screen", short: "Screen", about: WINDOWS ? "The whole screen, with your microphone if you like." : "A window, an app or the whole screen, with your microphone if you like." },
  camera: { title: "Record from a camera", short: "Camera", about: `Your ${OS.computer}'s camera or one plugged in, with sound.` },
  voice: { title: "Record your voice", short: "Voice", about: "Just the microphone: a voiceover, a reaction, a sample to clone your voice from." },
};

const VIDEO_TYPES = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
const SILENT_VIDEO_TYPES = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
const AUDIO_TYPES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

/** The best file MediaRecorder can make here: MP4 (H.264 and AAC) where it can, which needs no re-encoding later. */
export function recorderType(video: boolean, audio: boolean): string {
  const list = !video ? AUDIO_TYPES : audio ? VIDEO_TYPES : SILENT_VIDEO_TYPES;
  return list.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Raw sound: no echo cancelling or levelling, which make a voice sound processed. */
export const cleanAudio = (deviceId?: string): MediaTrackConstraints => ({
  deviceId: deviceId ? { exact: deviceId } : undefined,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 1 },
});

/**
 * Asks macOS for the camera or microphone (in the Mac app; a browser asks for itself). Resolves to why it can't, or
 * undefined when it's allowed.
 */
export async function allow(kind: "camera" | "microphone"): Promise<string | undefined> {
  if (!desktop?.mediaAccess) return undefined;
  const status = await desktop.mediaAccess(kind);
  if (status === "granted") return undefined;
  return `beatsheet isn't allowed to use the ${kind}. Turn it on in ${privacyPath(kind)}, then try again.`;
}

/** Where the switch is: System Settings on a Mac, Windows Settings (for desktop apps) on a PC. */
const privacyPath = (kind: "camera" | "microphone") =>
  WINDOWS
    ? `Windows Settings → Privacy & security → ${kind === "camera" ? "Camera" : "Microphone"} (and “Let desktop apps access your ${kind}”)`
    : `System Settings → Privacy & Security → ${kind === "camera" ? "Camera" : "Microphone"}`;

/** What went wrong, for a person: a refusal says where to allow it; cancelling a picker says nothing. */
export function captureError(err: unknown, what: "camera" | "microphone" | "screen"): string | undefined {
  const name = (err as { name?: string })?.name;
  if (name === "AbortError") return undefined;
  if (name === "NotAllowedError" || name === "SecurityError") {
    if (what === "screen") return undefined; // the picker was cancelled (or refused, which macOS explains itself)
    return desktop
      ? `beatsheet isn't allowed to use the ${what}. Turn it on in ${privacyPath(what)}.`
      : `This page isn't allowed to use the ${what}; allow it in the browser's address bar.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return `There's no ${what} to record from.`;
  if (name === "NotReadableError") return `The ${what} is busy in another app.`;
  return err instanceof Error ? err.message : String(err);
}

/** The cameras or microphones on this Mac, kept up to date as things are plugged in. Names show once one is allowed. */
export function useDevices(kind: "audioinput" | "videoinput", refresh: unknown): MediaDeviceInfo[] {
  const [list, setList] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const read = () => void navigator.mediaDevices?.enumerateDevices().then((d) => setList(d.filter((x) => x.kind === kind && x.deviceId)));
    read();
    navigator.mediaDevices?.addEventListener("devicechange", read);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", read);
  }, [kind, refresh]);
  return list;
}

/** How loud the stream's sound is right now, 0..1, for a level meter. */
export function useLevel(stream?: MediaStream | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream?.getAudioTracks().length) return setLevel(0);
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let frame = 0, shown = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (const x of data) peak = Math.max(peak, Math.abs(x));
      // Rises at once, falls gently, like a meter on a desk.
      shown = Math.max(peak, shown * 0.9);
      setLevel(Math.min(1, shown));
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      void ctx.close();
    };
  }, [stream]);
  return level;
}

export const stopStream = (s?: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());

export type TakeState = "idle" | "recording" | "paused";

/** One recording at a time from a stream: start, pause, resume, stop for the file. Seconds leave out the pauses. */
export function useTake() {
  const [state, setState] = useState<TakeState>("idle");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<{ recorder: MediaRecorder; chunks: Blob[]; done?: (b: Blob) => void } | null>(null);
  const clock = useRef({ total: 0, since: 0 });

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((clock.current.total + Date.now() - clock.current.since) / 1000), 200);
    return () => clearInterval(t);
  }, [state]);
  // Leaving mid-recording throws it away.
  useEffect(() => () => void (rec.current?.recorder.state !== "inactive" && rec.current?.recorder.stop()), []);

  return {
    state,
    seconds,
    start(stream: MediaStream, bits?: { video?: number; audio?: number }) {
      const type = recorderType(stream.getVideoTracks().length > 0, stream.getAudioTracks().length > 0);
      const recorder = new MediaRecorder(stream, { mimeType: type || undefined, videoBitsPerSecond: bits?.video, audioBitsPerSecond: bits?.audio ?? 192_000 });
      const r = { recorder, chunks: [] as Blob[], done: undefined as ((b: Blob) => void) | undefined };
      recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      recorder.onstop = () => r.done?.(new Blob(r.chunks, { type: recorder.mimeType || type }));
      rec.current = r;
      clock.current = { total: 0, since: Date.now() };
      setSeconds(0);
      // A piece every second, so a long recording isn't one huge buffer at the end.
      recorder.start(1000);
      setState("recording");
    },
    pause() {
      if (rec.current?.recorder.state !== "recording") return;
      rec.current.recorder.pause();
      clock.current.total += Date.now() - clock.current.since;
      setState("paused");
    },
    resume() {
      if (rec.current?.recorder.state !== "paused") return;
      rec.current.recorder.resume();
      clock.current.since = Date.now();
      setState("recording");
    },
    /** Finishes the recording; resolves to the file. */
    stop(): Promise<Blob> {
      const r = rec.current;
      if (!r || r.recorder.state === "inactive") return Promise.reject(new Error("Nothing is recording"));
      if (r.recorder.state === "recording") clock.current.total += Date.now() - clock.current.since;
      setSeconds(clock.current.total / 1000);
      return new Promise((ok) => {
        r.done = (b) => {
          setState("idle");
          ok(b);
        };
        r.recorder.stop();
      });
    },
  };
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
