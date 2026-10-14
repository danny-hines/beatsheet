import { formatTime, type Note } from "@beatsheet/schema";
import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { assetMap, KIND_LABEL, nextId, noteTime, pictureTrack, shotsAt, shotSummary, shotSwatch } from "../lib";
import { actions, getState, setState, useProject, useStore, useTimeline } from "../store";
import { FidelityPill } from "./ui";

type Rect = { x: number; y: number; w: number; h: number };

/** A stand-in for the real player: what's on screen at a time, drawn from the project's structure. */
export function Preview({ at }: { at?: number }) {
  const project = useProject();
  const tl = useTimeline();
  const playhead = useStore((s) => s.playhead);
  const formatId = useStore((s) => s.format);
  const t = at ?? playhead;
  const format = project.formats.find((f) => f.id === formatId)!;
  const assets = useMemo(() => assetMap(project), [project]);
  const frame = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; r: Rect } | null>(null);
  /** Set when a drag drew a region, so the click that ends it doesn't also select the shot. */
  const drew = useRef(false);

  const pic = pictureTrack(project);
  const current = pic ? shotsAt(tl, pic, t)[0] : undefined;
  const shot = current ? project.shots.find((s) => s.id === current.id) : undefined;
  const overlays = tl.shots
    .filter((r) => r.track !== pic && t >= r.start && t < r.end)
    .map((r) => project.shots.find((s) => s.id === r.id)!)
    .filter((s) => s.content.kind === "text");

  const line = tl.lines.find((l) => t >= l.start - 0.05 && t < l.end + 0.3);
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
    frame.current!.setPointerCapture(e.pointerId);
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
    let id = "";
    actions.edit((d) => {
      id = nextId("n", d.notes);
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

  const style = { aspectRatio: `${format.width} / ${format.height}`, "--swatch": shot ? shotSwatch(shot, assets) : "#1b1d22" } as CSSProperties;
  const c = shot?.content;
  let sourceLine = "";
  if (c?.kind === "clip" && current?.sourceIn !== undefined) {
    sourceLine = `source ${formatTime(current.sourceIn + (t - current.start) * (c.speed ?? 1))}${c.speed && c.speed !== 1 ? ` · ${c.speed}×` : ""}`;
  }
  if (c?.kind === "generated") {
    const n = c.takes?.indexOf(c.take ?? "") ?? -1;
    sourceLine = `take ${n + 1} of ${c.takes?.length ?? 0} · ${[c.provider, c.model].filter(Boolean).join(" ")}`;
  }

  return (
    <div className="preview-wrap">
      <div
        ref={frame}
        className={`frame kind-${c?.kind ?? "none"} pulse-${pulse}`}
        style={style}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onClick={() => {
          if (drew.current) drew.current = false;
          else if (shot) actions.select({ kind: "shot", id: shot.id });
        }}
      >
        {shot ? (
          <>
            <div className="frame-top">
              <FidelityPill fidelity={shot.fidelity} />
              <span className="frame-id">
                {shot.id} · {formatTime(current!.start)}–{formatTime(current!.end)}
              </span>
            </div>
            <div className="frame-center">
              <div className="frame-kind">{KIND_LABEL[shot.content.kind]}</div>
              <div className="frame-label">{shot.label ?? shot.id}</div>
              <div className="frame-sub">{shotSummary(shot, assets)}</div>
              {sourceLine && <div className="frame-source">{sourceLine}</div>}
              {shot.intent && <div className="frame-intent">{shot.intent}</div>}
            </div>
          </>
        ) : (
          <div className="frame-center">
            <div className="frame-sub">Nothing on the picture track here</div>
          </div>
        )}
        {overlays.map((o) => (
          <div key={o.id} className={`overlay-text style-${o.content.kind === "text" ? o.content.style ?? "plain" : "plain"}`}>
            {o.content.kind === "text" ? o.content.text : ""}
          </div>
        ))}
        {line && (
          <div className="captions">
            {line.words.map((w, i) => (
              <span key={i} className={t >= w.s && t < w.e + 0.05 ? "on" : t >= w.e ? "said" : ""}>
                {w.w}{" "}
              </span>
            ))}
          </div>
        )}
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
      <span className="spacer" />
      <span className="dim hint">Drag on the frame to pin a note to part of it · N adds a note at the playhead</span>
    </div>
  );
}
