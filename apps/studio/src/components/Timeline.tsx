import { anchorForTime, describeAnchor, formatTime, snapPoints, type Anchor, type SnapPoint } from "@beatsheet/schema";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { assetMap, noteTime, selectionForTarget, shotSummary, shotSwatch } from "../lib";
import { actions, setState, useProject, useStore, useTimeline } from "../store";

const PAD = 48;
const RULER_H = 22;
const H = { voice: 46, music: 46, picture: 58, overlay: 28, text: 28, audio: 28, sfx: 28, notes: 22 } as const;
const SECTION_COLORS = ["#5b4a8f", "#3f6f8f", "#8f5b3f", "#3f8f6b", "#8f3f5e", "#6b8f3f"];

type Drag = { shot: string; edge: "start" | "end"; t: number; anchor?: Anchor; label: string; snapped: boolean };

export function Timeline() {
  const project = useProject();
  const tl = useTimeline();
  const zoom = useStore((s) => s.zoom);
  const selection = useStore((s) => s.selection);
  const format = useStore((s) => s.format);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragPoints = useRef<SnapPoint[]>([]);

  const duration = Number.isFinite(tl.duration) && tl.duration > 0 ? tl.duration : 10;
  // Zoom 0 is fit mode: the scale follows the visible width until the user zooms by hand.
  const [viewW, setViewW] = useState(0);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setViewW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const z = zoom || Math.max(4, (viewW - PAD) / duration);
  const width = duration * z + PAD;
  const x = (t: number) => t * z;
  const assets = useMemo(() => assetMap(project), [project]);
  const shotById = useMemo(() => new Map(project.shots.map((s) => [s.id, s])), [project]);

  const timeAt = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / z);
  };

  // ---- Scrubbing on the ruler and empty lane space.
  const scrub = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    actions.seek(timeAt(e.clientX));
  };
  const scrubMove = (e: ReactPointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) actions.seek(timeAt(e.clientX));
  };

  // ---- Dragging a cut.
  const startDrag = (e: ReactPointerEvent, shot: string, edge: "start" | "end") => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragPoints.current = snapPoints(tl, { excludeShot: shot });
    const r = tl.shots.find((s) => s.id === shot)!;
    setDrag({ shot, edge, t: edge === "start" ? r.start : r.end, label: "", snapped: false });
    actions.select({ kind: "shot", id: shot });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    const t = timeAt(e.clientX);
    const res = anchorForTime(t, dragPoints.current, e.altKey ? 0 : 8 / z);
    setDrag({ ...drag, t: res.snapped && res.point ? res.point.t : t, anchor: res.anchor, label: describeAnchor(res.anchor, project), snapped: res.snapped });
  };
  const endDrag = () => {
    if (drag?.anchor) {
      const { shot, edge, anchor } = drag;
      actions.edit((d) => {
        const s = d.shots.find((x) => x.id === shot);
        if (!s) return;
        if (edge === "start") s.start = anchor;
        else {
          s.end = anchor;
          delete s.duration;
        }
      });
    }
    setDrag(null);
  };

  const formatNotes = project.notes.filter((n) => n.status !== "dismissed" && (!n.format || n.format === format));

  return (
    <section className="timeline">
      <div className="tl-toolbar">
        <span className="tl-title">Timeline</span>
        <span className="tl-hint">
          Drag the left edge of a shot to move its cut. It snaps to {project.spine === "music" ? "bars and beats" : "words and lines"}; hold ⌥ to place it freely.
        </span>
        <span className="spacer" />
        <button onClick={() => actions.setZoom(z / 1.5)} title="Zoom out">−</button>
        <button onClick={() => setState({ zoom: 0 })}>Fit</button>
        <button onClick={() => actions.setZoom(z * 1.5)} title="Zoom in">+</button>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <div style={{ height: RULER_H }} />
          {tl.lines.length > 0 && <div className="tl-label" style={{ height: H.voice }}>Voice</div>}
          {tl.cues.length > 0 && <div className="tl-label" style={{ height: H.music }}>Music</div>}
          {project.tracks.map((t) => (
            <div key={t.id} className="tl-label" style={{ height: H[t.kind] }}>{t.label}</div>
          ))}
          <div className="tl-label" style={{ height: H.notes }}>Notes</div>
        </div>
        <div className="tl-scroll" ref={scroller}>
          <div className="tl-canvas" ref={canvas} style={{ width }} onPointerMove={moveDrag} onPointerUp={endDrag}>
            <div className="tl-ruler" style={{ height: RULER_H }} onPointerDown={scrub} onPointerMove={scrubMove}>
              <Ruler z={z} duration={duration} />
            </div>

            {tl.lines.length > 0 && (
              <div className="lane" style={{ height: H.voice }} onPointerDown={scrub} onPointerMove={scrubMove}>
                {tl.lines.map((l) => (
                  <div
                    key={l.id}
                    className={`line-block ${selection?.kind === "line" && selection.id === l.id ? "sel" : ""}`}
                    style={{ left: x(l.start), width: Math.max(2, x(l.end) - x(l.start)) }}
                    title={`${l.id}: ${l.text}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      actions.select({ kind: "line", id: l.id });
                    }}
                  >
                    <span className="line-text">{l.text}</span>
                    {z >= 30 &&
                      l.words.map((w, i) => (
                        <span key={i} className="word" style={{ left: x(w.s) - x(l.start) }}>
                          {z >= 70 ? w.w : ""}
                        </span>
                      ))}
                  </div>
                ))}
              </div>
            )}

            {tl.cues.length > 0 && (
              <div className="lane music-lane" style={{ height: H.music }} onPointerDown={scrub} onPointerMove={scrubMove}>
                {tl.sections.map((s, i) => (
                  <div key={s.id} className="section-band" style={{ left: x(s.start), width: x(s.end) - x(s.start), background: SECTION_COLORS[i % SECTION_COLORS.length] }} title={`${s.label} ${formatTime(s.start)}`}>
                    {s.label}
                  </div>
                ))}
                {tl.beats.map((b, i) => (
                  <div key={i} className={`beat ${b.bar ? "bar" : ""}`} style={{ left: x(b.t) }} />
                ))}
                {tl.cues.map((c) => (
                  <div
                    key={c.id}
                    className={`cue-block ${selection?.kind === "cue" && selection.id === c.id ? "sel" : ""}`}
                    style={{ left: x(c.start), width: x(c.end) - x(c.start) }}
                    title={`${c.id}: ${c.asset} from ${formatTime(c.trackFrom)}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      actions.select({ kind: "cue", id: c.id });
                    }}
                  />
                ))}
              </div>
            )}

            {project.tracks.map((track) => (
              <div key={track.id} className={`lane track-${track.kind}`} style={{ height: H[track.kind] }} onPointerDown={scrub} onPointerMove={scrubMove}>
                {tl.shots
                  .filter((s) => s.track === track.id && Number.isFinite(s.start) && Number.isFinite(s.end))
                  .map((r) => {
                    const shot = shotById.get(r.id)!;
                    const sel = selection?.kind === "shot" && selection.id === r.id;
                    const notes = formatNotes.filter((n) => n.target.kind === "shot" && n.target.shot === r.id && n.status !== "done").length;
                    const endHandle = !!shot.end || shot.duration !== undefined;
                    return (
                      <div
                        key={r.id}
                        className={`shot-block kind-${shot.content.kind} fid-${shot.fidelity} ${sel ? "sel" : ""}`}
                        style={{ left: x(r.start), width: Math.max(3, x(r.end) - x(r.start)), "--swatch": shotSwatch(shot, assets) } as CSSProperties}
                        title={`${r.id} · ${shot.label ?? ""}\n${formatTime(r.start)} → ${formatTime(r.end)}\n${shotSummary(shot, assets)}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          actions.select({ kind: "shot", id: r.id });
                        }}
                      >
                        <span className="shot-label">{shot.label ?? r.id}</span>
                        {track.kind === "picture" && <span className="shot-sub">{shotSummary(shot, assets)}</span>}
                        {notes > 0 && <span className="shot-notes">{notes}</span>}
                        {!shot.locked && <span className="handle start" onPointerDown={(e) => startDrag(e, r.id, "start")} />}
                        {!shot.locked && endHandle && <span className="handle end" onPointerDown={(e) => startDrag(e, r.id, "end")} />}
                      </div>
                    );
                  })}
              </div>
            ))}

            <div className="lane notes-lane" style={{ height: H.notes }} onPointerDown={scrub} onPointerMove={scrubMove}>
              {formatNotes.map((n) => {
                const t = noteTime(n, tl);
                if (t === undefined || !Number.isFinite(t)) return null;
                return (
                  <button
                    key={n.id}
                    className={`note-pin st-${n.status}`}
                    style={{ left: x(t) }}
                    title={n.text}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      actions.seek(t);
                      actions.select(selectionForTarget(n.target));
                      setState({ side: "notes" });
                    }}
                  />
                );
              })}
            </div>

            {tl.markers.map((m) => (
              <div key={m.id} className="marker" style={{ left: x(m.t) }} title={m.label} />
            ))}
            <Playhead z={z} />
            {drag && (
              <div className={`drag-ghost ${drag.snapped ? "snapped" : ""}`} style={{ left: x(drag.t) }}>
                <span className="drag-label">
                  {drag.snapped ? "snaps to " : ""}
                  {drag.label} · {formatTime(drag.t)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Ruler({ z, duration }: { z: number; duration: number }) {
  const step = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * z >= 64) ?? 120;
  const ticks = [];
  for (let t = 0; t <= duration + 1e-6; t += step) {
    ticks.push(
      <div key={t} className="tick" style={{ left: t * z }}>
        <span>{step < 1 ? formatTime(t) : formatTime(t).replace(/\.00$/, "")}</span>
      </div>,
    );
  }
  return <>{ticks}</>;
}

function Playhead({ z }: { z: number }) {
  const t = useStore((s) => s.playhead);
  // Keep the playhead in view while playing.
  const playing = useStore((s) => s.playing);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!playing || !ref.current) return;
    const sc = ref.current.closest(".tl-scroll") as HTMLElement | null;
    if (!sc) return;
    const px = t * z;
    if (px > sc.scrollLeft + sc.clientWidth - 80 || px < sc.scrollLeft) sc.scrollLeft = px - 80;
  }, [t, z, playing]);
  return <div ref={ref} className="playhead" style={{ left: t * z }} />;
}
