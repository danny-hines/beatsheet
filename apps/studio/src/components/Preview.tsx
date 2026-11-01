import { formatTime, subjectAt } from "@beatsheet/schema";
import { BeatsheetVideo, metadataFor, placement, underlayFinder, type VideoProps } from "@beatsheet/video";
import { Player, Thumbnail, type PlayerRef } from "@remotion/player";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { KIND_LABEL, noteHere, noteTime, pictureTrack, reportError, shotsAt } from "../lib";
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
  const rate = useStore((s) => s.rate);
  const solo = useStore((s) => s.solo);
  const said = useStore((s) => s.said);
  const words = useMemo(() => Object.fromEntries(Object.entries(said).map(([id, x]) => [id, x.words])), [said]);
  // The words of the clips the cut plays, for captions of what's said on camera.
  useEffect(() => void actions.loadSaid(), [project]);
  const t = at ?? playhead;
  const format = project.formats.find((f) => f.id === formatId)!;
  const frame = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; r: Rect } | null>(null);
  /** Set when a drag drew a region, so the click that ends it doesn't also select the shot. */
  const drew = useRef(false);

  const codeVersion = useStore((s) => s.codeVersion);
  const inputProps = useMemo<VideoProps>(() => ({ project, format: formatId, mediaBase: `/media/${projectId}`, quality: "proxy", codeVersion, solo, words }), [project, formatId, projectId, codeVersion, solo, words]);
  const meta = useMemo(() => metadataFor(inputProps), [inputProps]);

  // If the composition throws, Remotion's player shows ⚠️ until it's made again. Show what went wrong instead, and
  // make a fresh player on the next change to the cut (an edit mid-turn may have caused it), or on Try again.
  const [generation, setGeneration] = useState(0);
  const [crash, setCrash] = useState<{ message: string; props: VideoProps } | null>(null);
  const latest = useRef(inputProps);
  latest.current = inputProps;
  useEffect(() => {
    if (crash && crash.props !== inputProps) {
      setCrash(null);
      setGeneration((g) => g + 1);
    }
  }, [inputProps, crash]);
  const reload = () => {
    setCrash(null);
    setGeneration((g) => g + 1);
  };
  // Each time the agent hands the turn back, the player starts fresh with the cut it made.
  const handedBack = useStore((s) => (s.doc?.turn?.who === "you" ? s.doc.turn.since : ""));
  const seenTurn = useRef(handedBack);
  useEffect(() => {
    if (handedBack && handedBack !== seenTurn.current) reload();
    seenTurn.current = handedBack;
  }, [handedBack]);

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
    const onPause = () => setState({ playing: false, rate: 1, playhead: p.getCurrentFrame() / fps });
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
  }, [at, meta.fps, meta.durationInFrames, generation]);

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
    // A drawn region becomes a note on that part of the frame, written right there.
    const box = frame.current!.getBoundingClientRect();
    actions.noteOn(
      current ? { kind: "shot", shot: current.id } : { kind: "time", t: Math.round(t * 100) / 100 },
      { x: box.left + (r.x + r.w / 2) * box.width, y: box.top + (r.y + r.h) * box.height },
      { at: Math.round(t * 100) / 100, region: { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) } },
    );
  };

  return (
    <div className="preview-wrap">
      <div ref={frame} className={`frame live pulse-${pulse}`} style={{ aspectRatio: `${format.width} / ${format.height}` }}>
        {at === undefined ? (
          <Player
            key={generation}
            ref={playerRef}
            errorFallback={({ error }) => <Crashed error={error} onCrash={(message) => setCrash((c) => c ?? { message, props: latest.current })} />}
            component={BeatsheetVideo}
            inputProps={inputProps}
            durationInFrames={meta.durationInFrames}
            compositionWidth={meta.width}
            compositionHeight={meta.height}
            fps={meta.fps}
            playbackRate={rate}
            style={{ width: "100%", height: "100%" }}
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            moveToBeginningWhenEnded={false}
            acknowledgeRemotionLicense
            // Every sound gets its own <audio>, however many play at once (a burst of sound effects would otherwise
            // run past Remotion's shared pool of 5 and stop the player). Playing always starts from a click or key here.
            numberOfSharedAudioTags={0}
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
        {at === undefined && <PreviewMenu onReload={reload} />}
        {crash && at === undefined && (
          <div className="player-crash">
            <strong>The player hit an error</strong>
            <span className="mono small">{crash.message}</span>
            <span className="player-crash-actions">
              <button onClick={reload}>Reload the preview</button>
              <button onClick={() => location.reload()}>Reload the studio</button>
            </span>
          </div>
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
          {at === undefined && <ShotSubjects t={t} format={formatId} />}
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

/**
 * While a clip shot is open in the inspector (and the cut is paused), the people and things found in it are outlined
 * where they are in the frame right now; the ones its effects follow are bright.
 */
function ShotSubjects({ t, format }: { t: number; format: string }) {
  const p = useProject();
  const tl = useTimeline();
  const sel = useStore((s) => s.selection);
  const side = useStore((s) => s.side);
  const playing = useStore((s) => s.playing);
  if (side !== "inspect" || sel?.kind !== "shot" || playing) return null;
  const shot = p.shots.find((s) => s.id === sel.id);
  const r = tl.shots.find((s) => s.id === sel.id);
  if (!shot || !r || shot.content.kind !== "clip" || t < r.start || t >= r.end) return null;
  const c = shot.content;
  const a = p.assets.find((x) => x.id === c.asset);
  const fmt = p.formats.find((f) => f.id === format);
  if (!a?.subjects?.length || !fmt) return null;
  const pl = placement(shot, r, a, format, underlayFinder(p, tl), t - r.start, { width: fmt.width, height: fmt.height });
  const used = new Set([...(c.effects ?? []).map((e) => e.subject), c.reframe?.[format]?.follow]);
  return (
    <>
      {a.subjects.map((s) => {
        const b = subjectAt(s, pl.sourceT, 0.15);
        if (!b) return null;
        const px = pl.cover.rect(b);
        return (
          <div
            key={s.id}
            className={`subject-box k-${s.kind} ${used.has(s.id) ? "used" : "faint"}`}
            style={{ left: `${(px.x / fmt.width) * 100}%`, top: `${(px.y / fmt.height) * 100}%`, width: `${(px.w / fmt.width) * 100}%`, height: `${(px.h / fmt.height) * 100}%` }}
          >
            <span>{s.label}</span>
          </div>
        );
      })}
    </>
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
      <button onClick={() => prevCut !== undefined && actions.seek(prevCut)} title="Previous cut (↑)">⏮</button>
      <button onClick={() => actions.seek(playhead - 1 / fps)} title="Back one frame (←)">◀︎</button>
      <button className="play" onClick={actions.togglePlay} title="Play / pause (space)">{playing ? "❚❚" : "▶"}</button>
      <button onClick={() => actions.seek(playhead + 1 / fps)} title="Forward one frame (→)">▶︎</button>
      <button onClick={() => nextCut !== undefined && actions.seek(nextCut)} title="Next cut (↓)">⏭</button>
      <span className="tc">
        {formatTime(playhead)} <span className="dim">/ {formatTime(tl.duration)}</span>
      </span>
      {shot && (
        <span className="now-playing">
          <FidelityPill fidelity={shot.fidelity} /> <span className="mono dim">{shot.id}</span> {shot.label}{" "}
          <span className="dim small">{KIND_LABEL[shot.content.kind]}</span>
        </span>
      )}
      <button className="note-here" onClick={noteHere} title="Note the selection or the shot under the playhead (N). Drag on the frame to note part of it.">
        ✎ Note
      </button>
    </div>
  );
}

/** Remotion's player shows this in place of the frame when the composition throws; it reports the error once. */
function Crashed({ error, onCrash }: { error: Error; onCrash: (message: string) => void }) {
  useEffect(() => {
    reportError("player", error);
    onCrash(error.message);
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** The player's ⋯ menu, shown on hover: start the preview again, or the whole studio (the project and cut stay put). */
function PreviewMenu({ onReload }: { onReload: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className={`preview-menu ${open ? "open" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
      <button className="preview-menu-button" title="Preview options" onClick={() => setOpen(!open)}>
        ⋯
      </button>
      {open && (
        <div className="preview-menu-list">
          <button
            onClick={() => {
              setOpen(false);
              onReload();
            }}
          >
            Reload the preview
          </button>
          <button onClick={() => location.reload()}>Reload the studio</button>
        </div>
      )}
    </div>
  );
}
