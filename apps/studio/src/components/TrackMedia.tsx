/**
 * What a block on the timeline shows of its media: a filmstrip of the frames it plays, and a waveform of its sound,
 * both for the stretch of the file the block covers.
 */
import { filmFrames } from "@beatsheet/schema";
import { useEffect, useRef, useState } from "react";

type Peaks = { rate: number; data: Uint8Array };
const peaksCache = new Map<string, Promise<Peaks | null>>();

/** A file's waveform, fetched once per page. */
function loadPeaks(url: string): Promise<Peaks | null> {
  let p = peaksCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<{ rate: number; peaks: string }>) : null))
      .then((j) => (j ? { rate: j.rate, data: Uint8Array.from(atob(j.peaks), (c) => c.charCodeAt(0)) } : null))
      .catch(() => null);
    peaksCache.set(url, p);
  }
  return p;
}

/** Forgets a waveform, so it's fetched again (after a clip's sound is cleaned, say). */
export const forgetPeaks = (url: string) => peaksCache.delete(url);

/**
 * The waveform of `seconds` of a file's sound from `from`, drawn `width` pixels wide: the loudest moment under each
 * pixel, mirrored about the middle, on a scale that keeps quiet speech visible.
 */
export function Wave({ url, from, seconds, width, height, className }: { url: string; from: number; seconds: number; width: number; height: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  useEffect(() => {
    let live = true;
    void loadPeaks(url).then((p) => live && setPeaks(p));
    return () => void (live = false);
  }, [url]);
  // Wide blocks are drawn at most this many pixels across and stretched; there's nothing finer to see.
  const w = Math.max(1, Math.min(4000, Math.round(width)));
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.data.length) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(height * dpr);
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = getComputedStyle(c).color;
    const mid = c.height / 2;
    const per = (seconds * peaks.rate) / c.width;
    for (let x = 0; x < c.width; x++) {
      const a = Math.floor(from * peaks.rate + x * per);
      const b = Math.max(a + 1, Math.floor(from * peaks.rate + (x + 1) * per));
      let max = 0;
      for (let i = Math.max(0, a); i < Math.min(peaks.data.length, b); i++) if (peaks.data[i]! > max) max = peaks.data[i]!;
      if (!max) continue;
      const h = Math.sqrt(max / 255) * mid;
      g.fillRect(x, mid - h, 1, Math.max(1, h * 2));
    }
  }, [peaks, from, seconds, w, height]);
  if (!peaks?.data.length) return null;
  return <canvas ref={ref} className={`wave ${className ?? ""}`} style={{ width, height }} />;
}

/**
 * The frames a clip shows across a block, `width` pixels wide: for each tile, the frame of the clip's filmstrip
 * nearest the moment it plays there.
 */
export function Strip({ url, duration, from, seconds, width, height, aspect }: { url: string; duration: number; from: number; seconds: number; width: number; height: number; aspect: number }) {
  const { step, count } = filmFrames(duration);
  const tile = Math.max(24, Math.min(160, height * aspect));
  const n = Math.min(80, Math.ceil(width / tile));
  if (width < 24) return null;
  return (
    <div className="strip" style={{ height }}>
      {Array.from({ length: n }, (_, k) => {
        const t = from + ((k + 0.5) * tile * seconds) / width;
        const i = Math.max(0, Math.min(count - 1, Math.floor(t / step)));
        return (
          <span
            key={k}
            style={{
              left: k * tile,
              width: tile,
              backgroundImage: `url(${url})`,
              backgroundSize: `${count * 100}% 100%`,
              backgroundPositionX: count > 1 ? `${(i / (count - 1)) * 100}%` : "0",
            }}
          />
        );
      })}
    </div>
  );
}
