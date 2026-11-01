/**
 * Getting a cut out: the kinds of file it renders to, and the cut as a timeline other editors open (OpenTimelineIO for
 * DaVinci Resolve and the tools that read it, Final Cut Pro 7 XML for Premiere), pointing at the original footage so
 * the edit can be finished there. Designed and made shots that aren't footage come through as gaps named for what's
 * in them (render those as video first to carry them over).
 */
import type { Timeline } from "./resolve.ts";
import type { Project } from "./types.ts";

export type ExportKind = "mp4" | "hevc" | "prores" | "alpha" | "webm" | "gif" | "wav" | "mp3";
export const EXPORT_KINDS: Record<ExportKind, { label: string; ext: string; why: string; video: boolean; audio: boolean }> = {
  mp4: { label: "MP4 (H.264)", ext: "mp4", why: "Plays everywhere; what social sites want", video: true, audio: true },
  hevc: { label: "MP4 (HEVC)", ext: "mp4", why: "About half the size at the same quality; newer devices", video: true, audio: true },
  prores: { label: "ProRes 422 HQ", ext: "mov", why: "Big, for finishing in another editor without losing anything", video: true, audio: true },
  alpha: { label: "ProRes 4444, see-through", ext: "mov", why: "Keeps transparency where nothing's drawn: titles and cut-outs to lay over other video", video: true, audio: true },
  webm: { label: "WebM (VP9)", ext: "webm", why: "For the web", video: true, audio: true },
  gif: { label: "GIF", ext: "gif", why: "No sound, small and short, for chat and docs", video: true, audio: false },
  wav: { label: "Sound only (WAV)", ext: "wav", why: "The mix, uncompressed", video: false, audio: true },
  mp3: { label: "Sound only (MP3)", ext: "mp3", why: "The mix, small", video: false, audio: true },
};

/** What an editor needs to know about a file to point at it: where it is, and what's in it. */
export type FileInfo = { path: string; duration?: number; fps?: number; width?: number; height?: number; audio?: boolean };

type Item = { name: string; start: number; end: number; file?: FileInfo; from?: number; speed?: number; note?: string };
type Lane = { name: string; kind: "video" | "audio"; items: Item[] };

/**
 * The cut as lanes of items in cut time: each picture and overlay track (footage and made takes as clips of their
 * files, anything else as a named gap), then the clips' own sound, the narration and the music.
 */
export function exportLanes(p: Project, tl: Timeline, fileOf: (asset: string) => FileInfo | undefined, lineFile: (path: string) => FileInfo | undefined): Lane[] {
  const shots = new Map(p.shots.map((s) => [s.id, s]));
  const lanes: Lane[] = [];
  const clipSound: Item[] = [];
  for (const track of p.tracks) {
    if (track.kind !== "picture" && track.kind !== "overlay") continue;
    const items: Item[] = [];
    for (const r of tl.shots) {
      if (r.track !== track.id || !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.end <= r.start) continue;
      const s = shots.get(r.id)!;
      const c = s.content;
      const asset = c.kind === "clip" ? c.asset : c.kind === "generated" ? c.take : undefined;
      const file = asset ? fileOf(asset) : undefined;
      const name = s.label ?? s.id;
      if (!file) {
        items.push({ name, start: r.start, end: r.end, note: c.kind === "text" ? `Text: ${c.text}` : c.kind === "coded" ? `Designed: ${c.component}` : c.kind === "placeholder" ? `To make: ${c.description}` : "No picture yet" });
        continue;
      }
      const speed = c.kind === "clip" ? c.speed ?? 1 : 1;
      const item = { name, start: r.start, end: r.end, file, from: r.sourceIn ?? 0, speed };
      items.push(item);
      const muted = c.kind === "clip" && (c.volume === 0 || track.muted);
      if (c.kind === "clip" && file.audio && !muted) clipSound.push({ ...item });
    }
    if (items.length) lanes.push({ name: track.label, kind: "video", items });
  }
  if (clipSound.length) lanes.push({ name: "Clip sound", kind: "audio", items: clipSound.sort((a, b) => a.start - b.start) });
  const voice: Item[] = [];
  for (const l of tl.lines) {
    const line = p.voice?.lines.find((x) => x.id === l.id);
    const file = line?.file ? lineFile(line.file) : undefined;
    if (file && Number.isFinite(l.start)) voice.push({ name: l.id, start: l.start, end: l.end, file, from: 0 });
  }
  if (voice.length) lanes.push({ name: "Narration", kind: "audio", items: voice });
  const music: Item[] = [];
  for (const c of tl.cues) {
    const file = fileOf(c.asset);
    if (file && Number.isFinite(c.start) && Number.isFinite(c.end)) music.push({ name: c.id, start: c.start, end: c.end, file, from: c.trackFrom });
  }
  if (music.length) lanes.push({ name: "Music", kind: "audio", items: music });
  return lanes;
}

const fileUrl = (path: string) => (/^[a-z]:[\\/]/i.test(path) ? `file:///${path.replace(/\\/g, "/")}` : `file://${path}`).replace(/ /g, "%20");

/** The cut as OpenTimelineIO JSON (.otio), at `fps`. */
export function toOtio(name: string, lanes: Lane[], duration: number, fps: number): string {
  const rt = (seconds: number, rate = fps) => ({ OTIO_SCHEMA: "RationalTime.1", rate, value: Math.round(seconds * rate) });
  const range = (from: number, seconds: number, rate = fps) => ({ OTIO_SCHEMA: "TimeRange.1", start_time: rt(from, rate), duration: rt(seconds, rate) });
  const gap = (seconds: number, label = "") => ({ OTIO_SCHEMA: "Gap.1", name: label, source_range: range(0, seconds), effects: [], markers: [], metadata: {} });
  const track = (lane: Lane) => {
    const children: unknown[] = [];
    let t = 0;
    for (const it of lane.items) {
      if (it.start > t + 1e-3) children.push(gap(it.start - t));
      const seconds = it.end - Math.max(it.start, t);
      if (seconds <= 0) continue;
      if (!it.file) children.push({ ...gap(seconds, it.name), metadata: { beatsheet: { note: it.note } } });
      else {
        const rate = it.file.fps ?? fps;
        const speed = it.speed ?? 1;
        children.push({
          OTIO_SCHEMA: "Clip.2",
          name: it.name,
          source_range: range(it.from ?? 0, seconds * speed, rate),
          effects: speed !== 1 ? [{ OTIO_SCHEMA: "LinearTimeWarp.1", name: "speed", effect_name: "LinearTimeWarp", time_scalar: speed, metadata: {} }] : [],
          markers: [],
          metadata: {},
          media_references: {
            DEFAULT_MEDIA: {
              OTIO_SCHEMA: "ExternalReference.1",
              name: it.file.path.split(/[\\/]/).pop(),
              target_url: fileUrl(it.file.path),
              available_range: it.file.duration ? range(0, it.file.duration, rate) : null,
              metadata: {},
            },
          },
          active_media_reference_key: "DEFAULT_MEDIA",
        });
      }
      t = it.end;
    }
    if (duration > t + 1e-3) children.push(gap(duration - t));
    return { OTIO_SCHEMA: "Track.1", name: lane.name, kind: lane.kind === "video" ? "Video" : "Audio", children, effects: [], markers: [], metadata: {}, source_range: null };
  };
  return JSON.stringify(
    {
      OTIO_SCHEMA: "Timeline.1",
      name,
      global_start_time: rt(0),
      tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: lanes.map(track), effects: [], markers: [], metadata: {}, source_range: null },
      metadata: { beatsheet: { exported: true } },
    },
    null,
    2,
  );
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The cut as Final Cut Pro 7 XML (xmeml), which Premiere Pro imports, at `fps` and `width`×`height`. */
export function toXmeml(name: string, lanes: Lane[], duration: number, fmt: { fps: number; width: number; height: number }): string {
  const fps = Math.round(fmt.fps);
  const ntsc = Math.abs(fmt.fps - fps) > 0.01 ? "TRUE" : "FALSE";
  const rate = `<rate><timebase>${fps}</timebase><ntsc>${ntsc}</ntsc></rate>`;
  const f = (seconds: number) => Math.round(seconds * fmt.fps);
  const files = new Map<string, string>();
  const fileXml = (file: FileInfo, kind: "video" | "audio") => {
    const known = files.get(file.path);
    if (known) return `<file id="${known}"/>`;
    const id = `file-${files.size + 1}`;
    files.set(file.path, id);
    const media =
      kind === "video"
        ? `<media><video><samplecharacteristics>${rate}<width>${file.width ?? fmt.width}</width><height>${file.height ?? fmt.height}</height></samplecharacteristics></video>${file.audio ? "<audio><channelcount>2</channelcount></audio>" : ""}</media>`
        : `<media><audio><channelcount>2</channelcount></audio></media>`;
    return `<file id="${id}"><name>${esc(file.path.split(/[\\/]/).pop() ?? id)}</name><pathurl>${esc(fileUrl(file.path))}</pathurl>${rate}<duration>${f(file.duration ?? duration)}</duration>${media}</file>`;
  };
  let n = 0;
  const items = (lane: Lane) =>
    lane.items
      .filter((it) => it.file)
      .map((it) => {
        const len = f(it.end) - f(it.start);
        const inF = f(it.from ?? 0);
        const speed = it.speed ?? 1;
        const out = inF + Math.round(len * speed);
        const filter =
          speed !== 1
            ? `<filter><effect><name>Time Remap</name><effectid>timeremap</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>speed</parameterid><name>speed</name><value>${speed * 100}</value></parameter></effect></filter>`
            : "";
        return `<clipitem id="clip-${++n}"><name>${esc(it.name)}</name>${rate}<start>${f(it.start)}</start><end>${f(it.end)}</end><in>${inF}</in><out>${out}</out>${fileXml(it.file!, lane.kind)}${lane.kind === "video" ? filter : ""}</clipitem>`;
      })
      .join("");
  const video = lanes.filter((l) => l.kind === "video").map((l) => `<track>${items(l)}</track>`).join("");
  const audio = lanes.filter((l) => l.kind === "audio").map((l) => `<track>${items(l)}</track>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4"><sequence id="sequence-1"><name>${esc(name)}</name><duration>${f(duration)}</duration>${rate}<media><video><format><samplecharacteristics>${rate}<width>${fmt.width}</width><height>${fmt.height}</height></samplecharacteristics></format>${video}</video><audio>${audio}</audio></media></sequence></xmeml>
`;
}
