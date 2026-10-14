/**
 * The one composition behind every beatsheet project: the studio plays it live and the renderer exports it. It draws
 * straight from project.json, so a drag in the timeline and an agent's edit show up the same way.
 */
import { resolveTimeline, type Asset, type Project, type ResolvedShot, type Shot, type Track } from "@beatsheet/schema";
import { useMemo, type CSSProperties } from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

export type MediaQuality = "proxy" | "original";
export type VideoProps = {
  project: Project;
  format: string;
  /** Where media is served, e.g. /media/july-4 in the studio or http://localhost:4321/media/july-4 when rendering. */
  mediaBase: string;
  quality: MediaQuality;
};

export function assetUrl(base: string, a: Asset, quality: MediaQuality): string {
  if (quality === "proxy" && a.kind === "video") return `${base}/asset/${a.id}/proxy`;
  if (quality === "proxy" && a.kind === "image") return `${base}/asset/${a.id}/image`;
  return `${base}/asset/${a.id}/original`;
}
export const fileUrl = (base: string, path: string) => `${base}/file/${encodeURIComponent(path)}`;

/** Size, frame rate and length of the composition for a project in one format. */
export function metadataFor(props: VideoProps) {
  const fmt = props.project.formats.find((f) => f.id === props.format) ?? props.project.formats[0]!;
  const tl = resolveTimeline(props.project, fmt.id);
  const seconds = Number.isFinite(tl.duration) && tl.duration > 0 ? tl.duration : 1;
  return { width: fmt.width, height: fmt.height, fps: fmt.fps, durationInFrames: Math.max(1, Math.ceil(seconds * fmt.fps)) };
}

export const BeatsheetVideo: React.FC<VideoProps> = ({ project, format, mediaBase, quality }) => {
  const { fps } = useVideoConfig();
  const tl = useMemo(() => resolveTimeline(project, format), [project, format]);
  const assets = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project]);
  const shots = useMemo(() => new Map(project.shots.map((s) => [s.id, s])), [project]);
  const f = (t: number) => Math.round(t * fps);
  const hasMusic = tl.cues.length > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {project.tracks.map((track) =>
        tl.shots
          .filter((r) => r.track === track.id && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
          .map((r) => (
            // Premounting loads and seeks each shot's media a second early, so cuts don't stall playback.
            <Sequence key={r.id} from={f(r.start)} durationInFrames={Math.max(1, f(r.end) - f(r.start))} premountFor={fps} name={`${r.id} ${shots.get(r.id)?.label ?? ""}`}>
              <ShotView shot={shots.get(r.id)!} r={r} track={track} assets={assets} base={mediaBase} quality={quality} muteClips={hasMusic} format={format} />
            </Sequence>
          )),
      )}
      {tl.cues.map((c) => {
        const a = assets.get(c.asset);
        if (!a || !Number.isFinite(c.start) || !Number.isFinite(c.end)) return null;
        const dur = Math.max(1, f(c.end) - f(c.start));
        return (
          <Sequence key={c.id} from={f(c.start)} durationInFrames={dur} premountFor={fps} name={`music ${c.id}`}>
            <Audio
              src={assetUrl(mediaBase, a, "original")}
              trimBefore={f(c.trackFrom)}
              volume={(fr) => c.gain * Math.min(1, c.fadeIn ? fr / (c.fadeIn * fps) : 1, c.fadeOut ? (dur - fr) / (c.fadeOut * fps) : 1)}
            />
          </Sequence>
        );
      })}
      {tl.lines.map((l) => {
        const file = project.voice?.lines.find((x) => x.id === l.id)?.file;
        if (!file) return null;
        return (
          <Sequence key={l.id} from={f(l.start)} durationInFrames={f(l.end) - f(l.start) + 8} name={`voice ${l.id}`}>
            <Audio src={fileUrl(mediaBase, file)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

function ShotView(props: {
  shot: Shot;
  r: ResolvedShot;
  track: Track;
  assets: Map<string, Asset>;
  base: string;
  quality: MediaQuality;
  muteClips: boolean;
  format: string;
}) {
  const { shot, r, track, assets, base, quality, muteClips, format } = props;
  const { fps } = useVideoConfig();
  const c = shot.content;
  if (c.kind === "text") return <TextOverlay text={c.text} style={c.style} duration={r.end - r.start} />;
  const assetId = c.kind === "clip" ? c.asset : c.kind === "generated" ? c.take : undefined;
  const a = assetId ? assets.get(assetId) : undefined;
  if (!a || (a.kind !== "video" && a.kind !== "image")) return track.kind === "picture" ? <Card shot={shot} /> : <Chip shot={shot} />;

  const reframe = c.kind === "clip" ? c.reframe?.[format] : undefined;
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: reframe ? `${reframe.x * 100}% ${reframe.y * 100}%` : "50% 50%",
    transformOrigin: reframe ? `${reframe.x * 100}% ${reframe.y * 100}%` : "50% 50%",
    transform: reframe?.zoom && reframe.zoom !== 1 ? `scale(${reframe.zoom})` : undefined,
  };
  if (a.kind === "image") return <Still src={assetUrl(base, a, quality)} style={style} duration={r.end - r.start} />;
  const volume = c.kind === "clip" ? c.volume : undefined;
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={assetUrl(base, a, quality)}
        trimBefore={Math.max(0, Math.round((r.sourceIn ?? 0) * fps))}
        playbackRate={c.kind === "clip" ? c.speed ?? 1 : 1}
        muted={volume === undefined ? muteClips : volume === 0}
        volume={volume}
        style={style}
        pauseWhenBuffering
      />
    </AbsoluteFill>
  );
}

/** Photos get a slow push in, so they read as part of a moving cut. */
function Still({ src, style, duration }: { src: string; style: CSSProperties; duration: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, Math.max(1, duration * fps)], [1, 1.07]);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={src} style={{ ...style, transform: `${style.transform ?? ""} scale(${zoom})` }} pauseWhenLoading />
    </AbsoluteFill>
  );
}

function TextOverlay({ text, style, duration }: { text: string; style?: string; duration: number }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const fade = Math.min(1, frame / 6, (duration * fps - frame) / 6);
  const u = width / 1080;
  const base: CSSProperties = { color: "#fff", textAlign: "center", textShadow: `0 ${4 * u}px ${18 * u}px rgba(0,0,0,0.6)`, padding: `0 ${60 * u}px` };
  const look: CSSProperties =
    style === "title-bold"
      ? { fontFamily: "Helvetica Neue, Arial, sans-serif", fontWeight: 900, fontSize: 104 * u, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.05 }
      : style === "handwritten"
        ? { fontFamily: "Snell Roundhand, Brush Script MT, cursive", fontSize: 120 * u }
        : { fontFamily: "Helvetica Neue, Arial, sans-serif", fontWeight: 700, fontSize: 64 * u };
  return (
    <AbsoluteFill style={{ justifyContent: style === "handwritten" ? "flex-end" : "flex-start", paddingTop: 300 * u, paddingBottom: 360 * u, opacity: fade }}>
      <div style={{ ...base, ...look }}>{text}</div>
    </AbsoluteFill>
  );
}

/** Stand-in for a shot with no picture yet (an idea card, or code the composition can't run). */
function Card({ shot }: { shot: Shot }) {
  const { width } = useVideoConfig();
  const u = width / 1080;
  return (
    <AbsoluteFill
      style={{
        background: shot.content.kind === "placeholder" ? "repeating-linear-gradient(135deg, #22252b 0 40px, #1c1e23 40px 80px)" : "radial-gradient(circle at 30% 20%, #3b3f68, #15161d)",
        color: "#e6e8ec",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 90 * u,
        fontFamily: "Helvetica Neue, Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 28 * u, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6 }}>{shot.content.kind}</div>
      <div style={{ fontSize: 64 * u, fontWeight: 800, margin: `${16 * u}px 0` }}>{shot.label ?? shot.id}</div>
      {shot.intent && <div style={{ fontSize: 32 * u, lineHeight: 1.35, opacity: 0.8, maxWidth: 900 * u }}>{shot.intent}</div>}
    </AbsoluteFill>
  );
}

function Chip({ shot }: { shot: Shot }) {
  const { width } = useVideoConfig();
  const u = width / 1080;
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", padding: 24 * u }}>
      <div style={{ background: "rgba(0,0,0,0.55)", color: "#cfd3da", fontFamily: "Helvetica Neue, Arial, sans-serif", fontSize: 22 * u, padding: `${6 * u}px ${12 * u}px`, borderRadius: 8 * u }}>
        {shot.label ?? shot.id}
      </div>
    </AbsoluteFill>
  );
}
