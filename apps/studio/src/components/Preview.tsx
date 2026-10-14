import { formatTime, type Note } from "@beatsheet/schema";
import { BeatsheetVideo, metadataFor, type VideoProps } from "@beatsheet/video";
import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { KIND_LABEL, nextId, noteTime, pictureTrack, shotsAt } from "../lib";
import { actions, getState, registerPlayer, setState, useProject, useStore, useTimeline } from "../store";
import { FidelityPill } from "./ui";

type Rect = { x: number; y: number; w: number; h: number };

/** The live cut: the real composition in a Remotion player, with note regions and the beat counter drawn on top. */
export function Preview({ at }: { at?: number }) {
  const project = useProject();
  const tl = useTimeline();
  const projectId = useStore((s) => s.projectId)!;
  const playhead = useStore((s) => s.playhead);
  const formatId = useStore((s) => s.format);
  const t = at ?? playhead;
  const format = project.formats.find((f) => f.id === formatId)!;
  const frame = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; r: Rect } | null>(null);
  /** Set when a drag drew a region, so the click that ends it doesn't also select the shot. */
  const drew = useRef(false);

  const inputProps = useMemo<VideoProps>(() => ({ project, format: formatId, mediaBase: `/media/${projectId}`, quality: "proxy" }), [project, formatId, projectId]);
  const meta = useMemo(() => metadataFor(inputProps), [inputProps]);

  // The main preview is the clock: it drives the playhead while playing, and follows it when paused.
  useEffect(() => {
    if (at !== undefined) return;
    const p = playerRef.current;
    if (!p) return;
    const fps = meta.fps;
    registerPlayer({ play: () => p.play(), pause: () => p.pause(), toggle: () => p.toggle(), seekTo: (f) => p.seekTo(f), fps });
    p.seekTo(Math.round(getState().playhead * fps));
    const onFrame = (e: { detail: { frame: number } }) => getState().playing && setState({ playhead: e.detail.frame / fps });
    const onPlay = () => setState({ playing: true });
    const onPause = () => setState({ playing: false, playhead: p.getCurrentFrame() / fps });
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      registerPlayer(undefined);
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
      if (getState().playing) setState({ playing: false });
    };
  }, [at, meta.fps, meta.durationInFrames]);

  const pic = pictureTrack(project);
  const current = pic ? shotsAt(tl, pic, t)[0] : undefined;
  const section = [...tl.sections].reverse().find((s) => t >= s.start);
  const beatIndex = tl.beats.findLastIndex((b) => b.t <= t + 1e-6);
  const beat = tl.beats[beatIndex];
  const pulse = beat && t - beat.t < 0.09 ? (beat.bar ? "bar" : "beat") : "";
  let barInfo = "";
  if (beat && section) {
    const inSection = tl.beats.slice(0, beatIndex + 1).filter((b) => b.t >= section.start - 1e-3);
    const bars = inSection.filter((b) => b.bar).length;
    const sinceBar = inSection.length - 1 - inSection.findLastIndex((b) => b.bar);
    barInfo = `${section.label} · bar ${Math.max(1, bars)} · beat ${sinceBar + 1}`;
  }

  const regions = project.notes.filter((n) => {
    if (!n.region || n.status === "dismissed" || (n.format && n.format !== formatId)) return false;
    if (n.target.kind === "shot" && n.target.shot !== current?.id) return false;
    const nt = noteTime(n, tl);
    return nt !== undefined && Math.abs(nt - t) < 0.75;
  });

  // ---- Drawing a region to pin a note to.
  const rel = (e: ReactPointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const down = (e: ReactPointerEvent) => {
    if (at !== undefined || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = rel(e);
    setDrawing({ x0: p.x, y0: p.y, r: { x: p.x, y: p.y, w: 0, h: 0 } });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drawing) return;
    const p = rel(e);
    setDrawing({ ...drawing, r: { x: Math.min(p.x, drawing.x0), y: Math.min(p.y, drawing.y0), w: Math.abs(p.x - drawing.x0), h: Math.abs(p.y - drawing.y0) } });
  };
  const up = () => {
    if (!drawing) return;
    const r = drawing.r;
    setDrawing(null);
    drew.current = r.w >= 0.03 && r.h >= 0.03;
    if (!drew.current) return;
    const round = (v: number) => Math.round(v * 1000) / 1000;
    const id = nextId("n", project.notes);
    actions.edit((d) => {
      const note: Note = {
        id,
        text: "",
        status: "open",
        target: current ? { kind: "shot", shot: current.id } : { kind: "time", t: Math.round(t * 100) / 100 },
        at: Math.round(t * 100) / 100,
        region: { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) },
        format: formatId,
        stage: getState().stage,
        author: "you",
        createdAt: new Date().toISOString(),
      };
      d.notes.push(note);
    });
    setState({ side: "notes", focusNote: id });
  };

  return (
    <div className="preview-wrap">
      <div ref={frame} className={`frame live pulse-${pulse}`} style={{ aspectRatio: `${format.width} / ${format.height}` }}>
        {at === undefined ? (
          <Player
            ref={playerRef}
            component={BeatsheetVideo}
            inputProps={inputProps}
            durationInFrames={meta.durationInFrames}
            compositionWidth={meta.width}
            compositionHeight={meta.height}
            fps={meta.fps}
            style={{ width: "100%", height: "100%" }}
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            moveToBeginningWhenEnded={false}
            acknowledgeRemotionLicense
          />
        ) : (
          <Thumbnail
            component={BeatsheetVideo}
            inputProps={inputProps}
            durationInFrames={meta.durationInFrames}
            compositionWidth={meta.width}
            compositionHeight={meta.height}
            fps={meta.fps}
            frameToDisplay={Math.min(meta.durationInFrames - 1, Math.round(t * meta.fps))}
            style={{ width: "100%", height: "100%" }}
          />
        )}
        <div
          className="frame-overlay"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onClick={() => {
            if (drew.current) drew.current = false;
            else if (current) actions.select({ kind: "shot", id: current.id });
          }}
        >
          {barInfo && <div className="bar-info">{barInfo}</div>}
          {regions.map((n) => (
            <div key={n.id} className={`region st-${n.status}`} style={{ left: `${n.region!.x * 100}%`, top: `${n.region!.y * 100}%`, width: `${n.region!.w * 100}%`, height: `${n.region!.h * 100}%` }}>
              <span>{n.text || "new note"}</span>
            </div>
          ))}
          {drawing && (
            <div className="region drawing" style={{ left: `${drawing.r.x * 100}%`, top: `${drawing.r.y * 100}%`, width: `${drawing.r.w * 100}%`, height: `${drawing.r.h * 100}%` }} />
          )}
        </div>
      </div>
    </div>
  );
}

export function Transport() {
  const project = useProject();
  const tl = useTimeline();
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const fps = project.formats.find((f) => f.id === getState().format)?.fps ?? 30;
  const pic = pictureTrack(project);
  const cuts = tl.shots.filter((s) => s.track === pic && Number.isFinite(s.start)).map((s) => s.start);
  const currentId = pic ? shotsAt(tl, pic, playhead)[0]?.id : undefined;
  const shot = currentId ? project.shots.find((x) => x.id === currentId) : undefined;
  const prevCut = [...cuts].reverse().find((c) => c < playhead - 0.01);
  const nextCut = cuts.find((c) => c > playhead + 0.01);
  return (
    <div className="transport">
      <button onClick={() => prevCut !== undefined && actions.seek(prevCut)} title="Previous cut">⏮</button>
      <button onClick={() => actions.seek(playhead - 1 / fps)} title="Back one frame (←)">◀︎</button>
      <button className="play" onClick={actions.togglePlay} title="Play / pause (space)">{playing ? "❚❚" : "▶"}</button>
      <button onClick={() => actions.seek(playhead + 1 / fps)} title="Forward one frame (→)">▶︎</button>
      <button onClick={() => nextCut !== undefined && actions.seek(nextCut)} title="Next cut">⏭</button>
      <span className="tc">
        {formatTime(playhead)} <span className="dim">/ {formatTime(tl.duration)}</span>
      </span>
      {shot && (
        <span className="now-playing">
          <FidelityPill fidelity={shot.fidelity} /> <span className="mono dim">{shot.id}</span> {shot.label}{" "}
          <span className="dim small">{KIND_LABEL[shot.content.kind]}</span>
        </span>
      )}
      <span className="spacer" />
      <span className="dim hint">Drag on the frame to pin a note · N adds a note</span>
    </div>
  );
}
