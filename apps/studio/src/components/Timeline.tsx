import { anchorForTime, describeAnchor, formatTime, frozen, moveShot, slipShot, snapPoints, trimEnd, trimStart, type Anchor, type Asset, type NoteTarget, type Shot, type SnapPoint } from "@beatsheet/schema";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { deleteSelected, putSource, splitHere } from "../editing";
import { ASSET_DRAG, assetMap, dropAsset, noteTime, posterUrl, RANGE_DRAG, selectionForTarget, shotAsset, shotSummary, shotSwatch, keys, WINDOWS } from "../lib";
import { actions, setState, useProject, useStore, useTimeline, type Selection } from "../store";
import { Strip, Wave } from "./TrackMedia";
import { Mixer } from "./Mixer";

const PAD = 48;
const RULER_H = 22;
const H = { voice: 46, music: 46, picture: 58, overlay: 28, text: 28, audio: 28, sfx: 28, notes: 22 } as const;
const SECTION_COLORS = ["#5b4a8f", "#3f6f8f", "#8f5b3f", "#3f8f6b", "#8f3f5e", "#6b8f3f"];

/** What a drag on the timeline is doing: moving a cut (an edge), moving a shot, or slipping the footage under it. */
type Drag =
  | { mode: "edge"; shot: string; edge: "start" | "end"; t: number; anchor?: Anchor; label: string; snapped: boolean }
  | { mode: "move"; shot: string; grab: number; t: number; track: string; anchor?: Anchor; label: string; snapped: boolean }
  | { mode: "slip"; shot: string; x0: number; delta: number };

export function Timeline() {
  const project = useProject();
  const tl = useTimeline();
  const zoom = useStore((s) => s.zoom);
  const selection = useStore((s) => s.selection);
  const also = useStore((s) => s.also);
  const marks = useStore((s) => s.marks);
  const hint = useStore((s) => s.hint);
  const solo = useStore((s) => s.solo);
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
  const fps = project.formats.find((f) => f.id === format)?.fps ?? 30;

  const timeAt = (clientX: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / z);
  };
  const snap = (t: number, free: boolean, exclude?: string) => {
    if (!dragPoints.current.length) dragPoints.current = snapPoints(tl, { excludeShot: exclude });
    const res = anchorForTime(t, dragPoints.current, free ? 0 : 8 / z);
    return { t: res.snapped && res.point ? res.point.t : t, anchor: res.anchor, label: describeAnchor(res.anchor, project), snapped: res.snapped };
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

  // ---- Scrubbing on empty space in the lanes: pressing moves the playhead there, dragging scrubs.
  const scrubbing = useRef(false);
  const lane = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      scrubbing.current = true;
      actions.seek(timeAt(e.clientX));
    },
    onPointerMove: (e: ReactPointerEvent) => scrubbing.current && actions.seek(timeAt(e.clientX)),
    onPointerUp: () => void (scrubbing.current = false),
    onPointerCancel: () => void (scrubbing.current = false),
  };
  // Lines and music cues select on a press, and scrub when dragged.
  const pickAndScrub = (e: ReactPointerEvent, sel: Selection) => {
    e.stopPropagation();
    actions.select(sel);
    lane.onPointerDown(e);
  };

  // ---- Shots: a press selects (⇧ a run, ⌘ one more), and a drag moves the shot (⌘-drag slips its footage).
  const press = useRef<{ shot: string; x0: number; t0: number; slip: boolean; armed: boolean } | null>(null);
  const shotDown = (e: ReactPointerEvent, r: { id: string; start: number }) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const mod = e.metaKey || e.ctrlKey;
    const chosen = (selection?.kind === "shot" && selection.id === r.id) || also.includes(r.id);
    if (e.shiftKey) actions.selectMore(r.id, "run");
    else if (mod && !chosen) actions.selectMore(r.id, "toggle");
    else if (!chosen) actions.select({ kind: "shot", id: r.id });
    else if (selection?.kind === "shot" && selection.id !== r.id) setState({ selection: { kind: "shot", id: r.id }, also: [selection.id, ...also.filter((x) => x !== r.id)] });
    const shot = shotById.get(r.id);
    if (!shot || frozen(project, shot) || e.shiftKey) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    press.current = { shot: r.id, x0: e.clientX, t0: timeAt(e.clientX), slip: mod, armed: mod && chosen };
  };
  const shotMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!drag && Math.abs(e.clientX - p.x0) < 4) return;
    const r = tl.shots.find((s) => s.id === p.shot)!;
    if (p.slip) return setDrag({ mode: "slip", shot: p.shot, x0: p.x0, delta: -(e.clientX - p.x0) / z });
    const lane = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>(".lane[data-track]");
    const shot = shotById.get(p.shot)!;
    const kind = project.tracks.find((t) => t.id === shot.track)?.kind;
    const dest = lane?.dataset.track && project.tracks.find((t) => t.id === lane.dataset.track)?.kind === kind ? lane.dataset.track : shot.track;
    const grab = p.t0 - r.start;
    const at = timeAt(e.clientX);
    // A picture shot lands where the pointer is; anything else by its left edge, which snaps.
    const s = kind === "picture" ? { t: at, anchor: undefined, label: "", snapped: false } : snap(at - grab, e.altKey, p.shot);
    setDrag({ mode: "move", shot: p.shot, grab, track: dest, ...s });
  };
  const shotUp = (e: ReactPointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    // A ⌘-click on a shot already selected, without a drag, takes it out of the selection.
    if (!drag && p.armed) actions.selectMore(p.shot, "toggle");
    finishDrag();
    e.stopPropagation();
  };

  // ---- Dragging a cut (a shot's edge).
  const startEdge = (e: ReactPointerEvent, shot: string, edge: "start" | "end") => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragPoints.current = snapPoints(tl, { excludeShot: shot });
    const r = tl.shots.find((s) => s.id === shot)!;
    setDrag({ mode: "edge", shot, edge, t: edge === "start" ? r.start : r.end, label: "", snapped: false });
    actions.select({ kind: "shot", id: shot });
  };
  const moveEdge = (e: ReactPointerEvent) => {
    if (drag?.mode !== "edge") return;
    setDrag({ ...drag, ...snap(timeAt(e.clientX), e.altKey) });
  };
  const finishDrag = () => {
    const d = drag;
    setDrag(null);
    dragPoints.current = [];
    if (!d) return;
    if (d.mode === "edge" && d.anchor) {
      const { shot, edge, anchor, t } = d;
      actions.edit((draft) => {
        if (edge === "start") return void trimStart(draft, tl, shot, anchor, t);
        // A shot that runs until the next one starts: its end is the next one's start, so that's what moves.
        const s = draft.shots.find((x) => x.id === shot)!;
        const r = tl.shots.find((x) => x.id === shot)!;
        const next = tl.shots.find((x) => x.track === s.track && x.id !== shot && Math.abs(x.start - r.end) < 1e-3);
        if (!s.end && s.duration === undefined && next) trimStart(draft, tl, next.id, anchor, t);
        else trimEnd(draft, tl, shot, anchor, t);
      });
    }
    if (d.mode === "move") {
      const { shot, t, anchor, track } = d;
      actions.edit((draft) => void moveShot(draft, tl, shot, t, anchor ?? { kind: "time", t: Math.round(t * 1000) / 1000 }, track));
    }
    if (d.mode === "slip" && Math.abs(d.delta) > 0.5 / fps) {
      const s = shotById.get(d.shot);
      const speed = s?.content.kind === "clip" ? s.content.speed ?? 1 : 1;
      actions.edit((draft) => void slipShot(draft, tl, d.shot, d.delta * speed));
    }
  };

  // ---- A picture dragged in from the Library (or a marked stretch of a clip): where it would go, then putting it there.
  const [dropAt, setDropAt] = useState<{ track: string; t: number; label: string; snapped: boolean } | null>(null);
  const dropHandlers = (track: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(ASSET_DRAG) && !e.dataTransfer.types.includes(RANGE_DRAG)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (dropAt === null) dragPoints.current = [];
      const s = snap(timeAt(e.clientX), e.altKey);
      if (dropAt?.track !== track || Math.abs(dropAt.t - s.t) > 0.001) setDropAt({ track, t: s.t, label: s.label, snapped: s.snapped });
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropAt(null);
    },
    onDrop: (e: React.DragEvent) => {
      setDropAt(null);
      const s = snap(timeAt(e.clientX), e.altKey);
      dragPoints.current = [];
      const range = e.dataTransfer.getData(RANGE_DRAG);
      if (range) {
        e.preventDefault();
        putSource(JSON.parse(range).asset as string, s.t, track, s.anchor);
        return;
      }
      const id = e.dataTransfer.getData(ASSET_DRAG);
      const a = id ? project.assets.find((x) => x.id === id) : undefined;
      if (!a) return;
      e.preventDefault();
      let placed: string | undefined;
      actions.edit((d) => void (placed = dropAsset(d, tl, track, s.t, s.anchor, a)));
      if (placed) actions.select({ kind: "shot", id: placed });
    },
  });

  const formatNotes = project.notes.filter((n) => n.status !== "dismissed" && (!n.format || n.format === format));
  const lineFiles = new Map((project.voice?.lines ?? []).filter((l) => l.file).map((l) => [l.id, l.file!]));
  const isSel = (id: string) => (selection?.kind === "shot" && selection.id === id) || also.includes(id);
  const moving = drag?.mode === "move" ? drag : undefined;
  const slipping = drag?.mode === "slip" ? drag : undefined;
  const landing = moving && project.tracks.find((t) => t.id === moving.track)?.kind === "picture" ? tl.shots.find((r) => r.track === moving.track && moving.t >= r.start && moving.t < r.end) : undefined;
  const marked = marks.in !== undefined || marks.out !== undefined;

  return (
    <section className="timeline">
      <div className="tl-toolbar">
        <span className="tl-title">Timeline</span>
        <button className="tl-tool" onClick={splitHere} title={`Split at the playhead (${keys("⌘B")} or S)`}>
          ✂ Split
        </button>
        <button className="tl-tool" onClick={() => deleteSelected(false)} title={`Delete the selection; the shot before holds on (${keys("⌫")}). ${keys("⇧⌫")} closes the gap.`}>
          Delete
        </button>
        <span className={`tl-hint ${hint ? "news" : ""}`}>
          {hint ??
            `Drag a shot to move it, ${keys("⌘")}-drag to slip its footage, drag an edge to move its cut. It snaps to ${project.spine === "music" ? "bars and beats" : "words and lines"}; hold ${keys("⌥")} to place it freely. I and O mark a stretch.`}
        </span>
        <span className="spacer" />
        {marked && (
          <button className="link small" onClick={() => setState({ marks: {} })} title="Clear the in and out marks">
            {marks.in !== undefined ? formatTime(marks.in) : "…"} → {marks.out !== undefined ? formatTime(marks.out) : "…"} ✕
          </button>
        )}
        <Mixer />
        <button onClick={() => actions.setZoom(z / 1.5)} title="Zoom out">−</button>
        <button onClick={() => setState({ zoom: 0 })}>Fit</button>
        <button onClick={() => actions.setZoom(z * 1.5)} title="Zoom in">+</button>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <div style={{ height: RULER_H }} />
          {tl.lines.length > 0 && <LaneLabel part="voice" label="Voice" height={H.voice} solo={solo} />}
          {tl.cues.length > 0 && <LaneLabel part="music" label="Music" height={H.music} solo={solo} />}
          {tl.sfx.length > 0 && <LaneLabel part="sfx" label="Sound" height={H.sfx} solo={solo} />}
          {project.tracks.map((t) => (
            <LaneLabel key={t.id} part={t.id} label={t.label} height={H[t.kind]} solo={solo} />
          ))}
          <div className="tl-label" style={{ height: H.notes }}>Notes</div>
        </div>
        <div className="tl-scroll" ref={scroller}>
          <div className="tl-canvas" ref={canvas} style={{ width }} onPointerMove={(e) => (drag?.mode === "edge" ? moveEdge(e) : shotMove(e))} onPointerUp={(e) => (press.current ? shotUp(e) : finishDrag())}>
            <div className="tl-ruler" style={{ height: RULER_H }} onPointerDown={rulerDown} onPointerMove={rulerMove} onPointerUp={rulerUp} title={`Click or drag to move the playhead; ${WINDOWS ? "Shift-drag" : "⇧-drag"} to note a stretch of the cut`}>
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
                    onPointerDown={(e) => pickAndScrub(e, { kind: "line", id: l.id })}
                    onContextMenu={noteMenu({ kind: "line", line: l.id }, { kind: "line", id: l.id })}
                  >
                    {lineFiles.get(l.id) && <Wave url={`/media/${projectId}/peaks/${encodeURIComponent(lineFiles.get(l.id)!)}`} from={0} seconds={l.end - l.start} width={Math.max(2, x(l.end) - x(l.start))} height={H.voice - 12} className="line-wave" />}
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
                    onPointerDown={(e) => pickAndScrub(e, { kind: "cue", id: c.id })}
                    onContextMenu={noteMenu({ kind: "cue", cue: c.id }, { kind: "cue", id: c.id })}
                  >
                    <Wave url={`/media/${projectId}/asset/${c.asset}/peaks`} from={c.trackFrom} seconds={c.end - c.start} width={Math.max(1, x(c.end) - x(c.start))} height={H.music - 27} className="cue-wave" />
                  </div>
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
              <div
                key={track.id}
                data-track={track.id}
                className={`lane track-${track.kind} ${dropAt?.track === track.id || (moving && moving.track === track.id && track.kind !== "picture") ? "dropping" : ""}`}
                style={{ height: H[track.kind] }}
                {...lane}
                {...(track.kind === "picture" || track.kind === "overlay" ? dropHandlers(track.id) : {})}
              >
                {tl.shots
                  .filter((s) => s.track === track.id && Number.isFinite(s.start) && Number.isFinite(s.end))
                  .map((r) => {
                    const shot = shotById.get(r.id)!;
                    const sel = isSel(r.id);
                    const notes = formatNotes.filter((n) => n.target.kind === "shot" && n.target.shot === r.id && n.status !== "done").length;
                    const media = shotMedia(shot, r, assets);
                    const thumb = track.kind === "picture" && shotAsset(shot) && !media?.strip ? `url(${posterUrl(projectId, shotAsset(shot)!)})` : undefined;
                    const lifted = moving?.shot === r.id;
                    const w = Math.max(3, x(r.end) - x(r.start));
                    return (
                      <div
                        key={r.id}
                        className={`shot-block kind-${shot.content.kind} fid-${shot.fidelity} ${sel ? "sel" : ""} ${lifted ? "lifted" : ""} ${landing?.id === r.id && !lifted ? "landing" : ""} ${frozen(project, shot) ? "locked" : ""}`}
                        style={{ left: x(r.start), width: Math.max(3, x(r.end) - x(r.start)), "--swatch": shotSwatch(shot, assets), "--thumb": thumb } as CSSProperties}
                        title={`${r.id} · ${shot.label ?? ""}\n${formatTime(r.start)} → ${formatTime(r.end)}\n${shotSummary(shot, assets)}`}
                        onPointerDown={(e) => shotDown(e, r)}
                        onContextMenu={noteMenu({ kind: "shot", shot: r.id }, { kind: "shot", id: r.id })}
                      >
                        {media?.strip && track.kind !== "text" && (
                          <Strip url={`/media/${projectId}/asset/${media.asset.id}/frames`} duration={media.asset.duration ?? 1} from={media.from} seconds={media.seconds} width={w} height={H[track.kind] - 10} aspect={media.aspect} />
                        )}
                        {media?.sound && <Wave url={`/media/${projectId}/asset/${media.asset.id}/peaks`} from={media.from} seconds={media.seconds} width={w} height={14} className={`shot-wave ${media.quiet ? "quiet" : ""}`} />}
                        <span className="shot-label">{shot.label ?? r.id}</span>
                        <ShotBadges shot={shot} format={format} assets={assets} />
                        {track.kind === "picture" && <span className="shot-sub">{shotSummary(shot, assets)}</span>}
                        {notes > 0 && <span className="shot-notes">{notes}</span>}
                        {shot.keys?.map((k, i) => <span key={i} className="key-dot" style={{ left: x(r.start + k.t) - x(r.start) }} title={`A key at ${formatTime(k.t)} into the shot`} />)}
                        {slipping?.shot === r.id && <span className="slip-label">slip {slipping.delta >= 0 ? "+" : "−"}{formatTime(Math.abs(slipping.delta))}</span>}
                        {!frozen(project, shot) && <span className="handle start" onPointerDown={(e) => startEdge(e, r.id, "start")} />}
                        {!frozen(project, shot) && <span className="handle end" onPointerDown={(e) => startEdge(e, r.id, "end")} />}
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
            {marked && (
              <div
                className="tl-marks"
                style={{ left: x(marks.in ?? 0), width: Math.max(1, x(marks.out ?? duration) - x(marks.in ?? 0)) }}
                title="The marked stretch: Delete takes it out, N notes it"
              />
            )}
            <Playhead z={z} />
            {dropAt && (
              <div className={`drag-ghost ${dropAt.snapped ? "snapped" : ""}`} style={{ left: x(dropAt.t) }}>
                <span className="drag-label">
                  {dropAt.snapped ? `at ${dropAt.label} · ` : ""}
                  {formatTime(dropAt.t)}
                </span>
              </div>
            )}
            {drag?.mode === "edge" && (
              <div className={`drag-ghost ${drag.snapped ? "snapped" : ""}`} style={{ left: x(drag.t) }}>
                <span className="drag-label">
                  {drag.snapped ? "snaps to " : ""}
                  {drag.label} · {formatTime(drag.t)}
                </span>
              </div>
            )}
            {moving && !landing && (
              <div className={`drag-ghost ${moving.snapped ? "snapped" : ""}`} style={{ left: x(moving.t) }}>
                <span className="drag-label">
                  {moving.snapped ? `on ${moving.label} · ` : ""}
                  {formatTime(moving.t)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * What a clip shot plays of its file: the stretch (from where, for how long, at its speed), whether it has frames to
 * show and sound to draw, and whether that sound is heard (clips are quiet under music unless given a volume).
 */
function shotMedia(shot: Shot, r: { start: number; end: number; sourceIn?: number }, assets: Map<string, Asset>) {
  const c = shot.content;
  if (c.kind !== "clip") return undefined;
  const asset = assets.get(c.asset);
  if (!asset || asset.kind !== "video") return undefined;
  const speed = c.speed ?? 1;
  return {
    asset,
    from: r.sourceIn ?? c.in ?? 0,
    seconds: (r.end - r.start) * speed,
    strip: true,
    sound: !asset.cutout,
    quiet: c.volume === 0,
    aspect: asset.width && asset.height ? asset.width / asset.height : 16 / 9,
  };
}

/** A lane's name, and its switches: mute, solo, and for tracks hide and lock. */
function LaneLabel({ part, label, height, solo }: { part: string; label: string; height: number; solo?: string }) {
  const project = useProject();
  const track = project.tracks.find((t) => t.id === part);
  const level = track ?? project.mix?.[part as "voice" | "music" | "sfx"];
  const sounds = !track || track.kind === "picture" || track.kind === "overlay" || track.kind === "audio" || track.kind === "sfx";
  const flip = (key: "muted" | "hidden" | "locked") =>
    actions.edit((d) => {
      const t = d.tracks.find((x) => x.id === part);
      if (t) return void (t[key] ? delete t[key] : (t[key] = true));
      if (key !== "muted") return;
      const k = part as "voice" | "music" | "sfx";
      const mix = (d.mix ??= {});
      const l = (mix[k] ??= {});
      if (l.muted) delete l.muted;
      else l.muted = true;
    });
  return (
    <div className={`tl-label ${track?.hidden ? "off" : ""}`} style={{ height }} title={label}>
      <span>{label}</span>
      <span className="tk-btns">
        {sounds && (
          <button className={`tk-btn ${level?.muted ? "on" : ""}`} onClick={() => flip("muted")} title={level?.muted ? "Unmute" : "Mute"}>
            M
          </button>
        )}
        {sounds && (
          <button className={`tk-btn ${solo === part ? "on solo" : ""}`} onClick={() => setState({ solo: solo === part ? undefined : part })} title={solo === part ? "Hear everything again" : "Hear only this (in the studio; nothing is saved)"}>
            S
          </button>
        )}
        {track && track.kind !== "audio" && track.kind !== "sfx" && (
          <button className={`tk-btn ${track.hidden ? "on" : ""}`} onClick={() => flip("hidden")} title={track.hidden ? "Show it" : "Hide it"}>
            H
          </button>
        )}
        {track && (
          <button className={`tk-btn ${track.locked ? "on" : ""}`} onClick={() => flip("locked")} title={track.locked ? "Unlock it" : "Lock it: its shots can't be changed by hand"}>
            L
          </button>
        )}
      </span>
    </div>
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
  if (shot.locked) marks.push(["🔒", "Locked"]);
  if (c.kind === "clip") {
    const a = assets.get(c.asset);
    const who = (id: string) => a?.subjects?.find((s) => s.id === id)?.label ?? id;
    if (a?.cutout) marks.push(["✂", "A cut-out"]);
    if (c.effects?.length) marks.push(["◍", c.effects.map((e) => `${e.kind === "label" ? `Name tag "${e.text}"` : e.kind === "blur" ? "Blur" : "Spotlight"} on ${who(e.subject)}`).join("\n")]);
    const follow = c.reframe?.[format]?.follow;
    if (follow) marks.push(["⤧", `Keeps ${who(follow)} in frame`]);
    if (c.look) marks.push(["◐", `Look: ${c.look}`]);
    if (c.speed && c.speed !== 1) marks.push([`${c.speed}×`, `Plays at ${c.speed}× speed`]);
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
