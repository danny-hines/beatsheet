import { anchorForTime, describeAnchor, formatTime, snapPoints, type Anchor, type Asset, type NoteTarget, type Shot, type SnapPoint } from "@beatsheet/schema";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { assetMap, noteTime, posterUrl, selectionForTarget, shotAsset, shotSummary, shotSwatch } from "../lib";
import { actions, setState, useProject, useStore, useTimeline, type Selection } from "../store";

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
  const projectId = useStore((s) => s.projectId)!;
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

  // ---- A note on anything: right-click an item, or ⇧-drag along the ruler to pick a stretch of the cut.
  const noteMenu = (target: NoteTarget, select?: Selection) => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (select) actions.select(select);
    actions.noteOn(target, { x: e.clientX, y: e.clientY });
  };
  const [stretch, setStretch] = useState<{ from: number; to: number; x0: number } | null>(null);
  // Dragging on the ruler moves the playhead; with ⇧ it marks a stretch for a note instead.
  const rulerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const t = timeAt(e.clientX);
    if (e.shiftKey) setStretch({ from: t, to: t, x0: e.clientX });
    actions.seek(t);
  };
  const rulerMove = (e: ReactPointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    if (!stretch || Math.abs(e.clientX - stretch.x0) < 5) return actions.seek(timeAt(e.clientX));
    setStretch({ ...stretch, to: timeAt(e.clientX) });
  };
  const rulerUp = (e: ReactPointerEvent) => {
    if (!stretch) return;
    const [from, to] = [Math.min(stretch.from, stretch.to), Math.max(stretch.from, stretch.to)];
    setStretch(null);
    if (to - from < 0.2) return;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    actions.noteOn({ kind: "range", from: r2(from), to: r2(to) }, { x: e.clientX, y: e.clientY }, { at: r2(from) });
  };

  // ---- Scrubbing in the lanes. Pressing on empty space moves the playhead there; pressing on a shot, line or cue
  // selects it, and dragging from there scrubs (so a lane full of shots can still be scrubbed).
  const press = useRef<{ x0: number; moving: boolean } | null>(null);
  const scrub = (e: ReactPointerEvent, now = true) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const lane = (e.currentTarget as HTMLElement).closest(".lane") as HTMLElement | null;
    lane?.setPointerCapture(e.pointerId);
    press.current = { x0: e.clientX, moving: now };
    if (now) actions.seek(timeAt(e.clientX));
  };
  const scrubMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    if (!p.moving && Math.abs(e.clientX - p.x0) < 4) return;
    p.moving = true;
    actions.seek(timeAt(e.clientX));
  };
  const scrubEnd = () => void (press.current = null);
  const lane = { onPointerDown: (e: ReactPointerEvent) => scrub(e), onPointerMove: scrubMove, onPointerUp: scrubEnd, onPointerCancel: scrubEnd };

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
          {tl.sfx.length > 0 && <div className="tl-label" style={{ height: H.sfx }}>Sound</div>}
          {project.tracks.map((t) => (
            <div key={t.id} className="tl-label" style={{ height: H[t.kind] }} title={t.label}><span>{t.label}</span></div>
          ))}
          <div className="tl-label" style={{ height: H.notes }}>Notes</div>
        </div>
        <div className="tl-scroll" ref={scroller}>
          <div className="tl-canvas" ref={canvas} style={{ width }} onPointerMove={moveDrag} onPointerUp={endDrag}>
            <div className="tl-ruler" style={{ height: RULER_H }} onPointerDown={rulerDown} onPointerMove={rulerMove} onPointerUp={rulerUp} title="Click or drag to move the playhead; ⇧-drag to note a stretch of the cut">
              <Ruler z={z} duration={duration} />
              {stretch && Math.abs(stretch.to - stretch.from) > 0 && (
                <div className="tl-stretch" style={{ left: x(Math.min(stretch.from, stretch.to)), width: Math.abs(x(stretch.to) - x(stretch.from)) }} />
              )}
            </div>

            {tl.lines.length > 0 && (
              <div className="lane" style={{ height: H.voice }} {...lane}>
                {tl.lines.map((l) => (
                  <div
                    key={l.id}
                    className={`line-block ${selection?.kind === "line" && selection.id === l.id ? "sel" : ""}`}
                    style={{ left: x(l.start), width: Math.max(2, x(l.end) - x(l.start)) }}
                    title={`${l.id}: ${l.text}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      actions.select({ kind: "line", id: l.id });
                      scrub(e, false);
                    }}
                    onContextMenu={noteMenu({ kind: "line", line: l.id }, { kind: "line", id: l.id })}
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
              <div className="lane music-lane" style={{ height: H.music }} {...lane}>
                {tl.sections.map((s, i) => (
                  <div
                    key={s.id}
                    className="section-band"
                    style={{ left: x(s.start), width: x(s.end) - x(s.start), background: SECTION_COLORS[i % SECTION_COLORS.length] }}
                    title={`${s.label} ${formatTime(s.start)} · right-click for a note`}
                    onContextMenu={noteMenu({ kind: "section", section: s.id })}
                  >
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
                      scrub(e, false);
                    }}
                    onContextMenu={noteMenu({ kind: "cue", cue: c.id }, { kind: "cue", id: c.id })}
                  />
                ))}
              </div>
            )}

            {tl.sfx.length > 0 && (
              <div className="lane sfx-lane" style={{ height: H.sfx }} {...lane}>
                {tl.sfx
                  .filter((cue) => Number.isFinite(cue.t))
                  .map((cue) => (
                    <span
                      key={cue.id}
                      className="sfx-cue"
                      style={{ left: x(cue.t) }}
                      title={`${cue.sound} at ${formatTime(cue.t)}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        actions.seek(cue.t);
                      }}
                    >
                      {z >= 40 ? cue.sound : ""}
                    </span>
                  ))}
              </div>
            )}

            {project.tracks.map((track) => (
              <div key={track.id} className={`lane track-${track.kind}`} style={{ height: H[track.kind] }} {...lane}>
                {tl.shots
                  .filter((s) => s.track === track.id && Number.isFinite(s.start) && Number.isFinite(s.end))
                  .map((r) => {
                    const shot = shotById.get(r.id)!;
                    const sel = selection?.kind === "shot" && selection.id === r.id;
                    const notes = formatNotes.filter((n) => n.target.kind === "shot" && n.target.shot === r.id && n.status !== "done").length;
                    const endHandle = !!shot.end || shot.duration !== undefined;
                    const thumb = track.kind === "picture" && shotAsset(shot) ? `url(${posterUrl(projectId, shotAsset(shot)!)})` : undefined;
                    return (
                      <div
                        key={r.id}
                        className={`shot-block kind-${shot.content.kind} fid-${shot.fidelity} ${sel ? "sel" : ""}`}
                        style={{ left: x(r.start), width: Math.max(3, x(r.end) - x(r.start)), "--swatch": shotSwatch(shot, assets), "--thumb": thumb } as CSSProperties}
                        title={`${r.id} · ${shot.label ?? ""}\n${formatTime(r.start)} → ${formatTime(r.end)}\n${shotSummary(shot, assets)}`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          actions.select({ kind: "shot", id: r.id });
                          scrub(e, false);
                        }}
                        onContextMenu={noteMenu({ kind: "shot", shot: r.id }, { kind: "shot", id: r.id })}
                      >
                        <span className="shot-label">{shot.label ?? r.id}</span>
                        <ShotBadges shot={shot} format={format} assets={assets} />
                        {track.kind === "picture" && <span className="shot-sub">{shotSummary(shot, assets)}</span>}
                        {notes > 0 && <span className="shot-notes">{notes}</span>}
                        {!shot.locked && <span className="handle start" onPointerDown={(e) => startDrag(e, r.id, "start")} />}
                        {!shot.locked && endHandle && <span className="handle end" onPointerDown={(e) => startDrag(e, r.id, "end")} />}
                      </div>
                    );
                  })}
              </div>
            ))}

            <div className="lane notes-lane" style={{ height: H.notes }} {...lane}>
              {formatNotes.map((n) => {
                const t = noteTime(n, tl);
                if (t === undefined || !Number.isFinite(t)) return null;
                const open = (e: ReactPointerEvent) => {
                  e.stopPropagation();
                  actions.seek(t);
                  actions.select(selectionForTarget(n.target));
                  // Attached notes can still be changed; sent ones are history in the Notes tab.
                  if (n.status === "queued") actions.noteOn(n.target, { x: e.clientX, y: e.clientY }, { id: n.id, text: n.text, at: n.at, region: n.region });
                  else setState({ side: "notes" });
                };
                // A note on a stretch of the cut shows as a band across it.
                if (n.target.kind === "range")
                  return <button key={n.id} className={`note-band st-${n.status}`} style={{ left: x(n.target.from), width: Math.max(4, x(n.target.to) - x(n.target.from)) }} title={n.text} onPointerDown={open} />;
                return <button key={n.id} className={`note-pin st-${n.status}`} style={{ left: x(t) }} title={n.text} onPointerDown={open} />;
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

/** Small marks on a shot block for what's layered on it: effects, a crop that follows someone, a look, an entrance. */
function ShotBadges({ shot, format, assets }: { shot: Shot; format: string; assets: Map<string, Asset> }) {
  const c = shot.content;
  const marks: [string, string][] = [];
  if (c.kind === "clip") {
    const a = assets.get(c.asset);
    const who = (id: string) => a?.subjects?.find((s) => s.id === id)?.label ?? id;
    if (a?.cutout) marks.push(["✂", "A cut-out"]);
    if (c.effects?.length) marks.push(["◍", c.effects.map((e) => `${e.kind === "label" ? `Name tag "${e.text}"` : e.kind === "blur" ? "Blur" : "Spotlight"} on ${who(e.subject)}`).join("\n")]);
    const follow = c.reframe?.[format]?.follow;
    if (follow) marks.push(["⤧", `Keeps ${who(follow)} in frame`]);
    if (c.look) marks.push(["◐", `Look: ${c.look}`]);
  }
  if (shot.transition?.kind) marks.push(["↗", `Comes in: ${shot.transition.kind}`]);
  if (!marks.length) return null;
  return (
    <span className="shot-badges">
      {marks.map(([glyph, title]) => (
        <span key={glyph} title={title}>
          {glyph}
        </span>
      ))}
    </span>
  );
}
