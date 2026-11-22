/**
 * Pictures and clips, large, over everything: fit to the window, zoomed with the wheel (or + and −) around the
 * pointer, dragged to look around once zoomed, and the rest of the strip it was opened from a key away (← and →). Esc
 * closes it. Inspect's thumbnails are too small to judge a face by; this is where they're looked at.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { imageUrl, proxyUrl } from "../lib";
import { Icon } from "./Icon";

/** `src` is the file to show when it isn't the asset `id` itself (a picture the agent made in the project's folder). */
export type ViewerItem = { id: string; video?: boolean; caption?: string; src?: string };

/** The most it zooms in, as a multiple of fitting the window. */
const MOST = 12;
const STEP = 1.5;

export function Viewer({
  projectId,
  items,
  at,
  onClose,
  actions,
}: {
  projectId: string;
  items: ViewerItem[];
  at: number;
  onClose: () => void;
  /** Buttons for the one showing (make it the main one, take it out). */
  actions?: (item: ViewerItem, index: number) => ReactNode;
}) {
  // Followed by id, so it stays on the same picture when the strip is reordered under it.
  const [current, setCurrent] = useState({ id: items[at]?.id, i: at });
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null);
  const found = items.findIndex((x) => x.id === current.id);
  const index = found >= 0 ? found : Math.min(current.i, items.length - 1);
  const item = items[index];

  /** Zooms to `scale` keeping the point (px, py) from the stage's center where it is; back to fit at 1. */
  const zoomTo = (scale: number, px = 0, py = 0) =>
    setView((v) => {
      const s = Math.min(MOST, Math.max(1, scale));
      if (s === 1) return { scale: 1, x: 0, y: 0 };
      const k = s / v.scale;
      return { scale: s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  const fromCenter = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) };
  };
  const go = (step: number) => {
    if (items.length < 2) return;
    const i = (index + step + items.length) % items.length;
    setCurrent({ id: items[i]!.id, i });
    setView({ scale: 1, x: 0, y: 0 });
  };

  // The wheel (and a trackpad's pinch) zooms; the page behind mustn't scroll or zoom, so it's not passive.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = fromCenter(e);
      setView((v) => {
        const s = Math.min(MOST, Math.max(1, v.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
        if (s === 1) return { scale: 1, x: 0, y: 0 };
        const k = s / v.scale;
        return { scale: s, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Its keys come first, and none reach the editor behind (Delete there would delete a shot).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "+" || e.key === "=") zoomTo(view.scale * STEP);
      else if (e.key === "-" || e.key === "_") zoomTo(view.scale / STEP);
      else if (e.key === "0") zoomTo(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    if (!items.length) onClose();
  }, [items.length, onClose]);
  if (!item) return null;

  const style = { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` };
  return createPortal(
    <div className="viewer" role="dialog" aria-label="Picture, large">
      <div
        ref={stage}
        className={`viewer-stage ${view.scale > 1 ? "zoomed" : ""} ${dragging ? "dragging" : ""}`}
        onPointerDown={(e) => {
          // The arrows are buttons of their own; holding on to the pointer would take their clicks.
          if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
          drag.current = { x: e.clientX, y: e.clientY, from: { x: view.x, y: view.y }, moved: false };
          if (view.scale > 1) {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging(true);
          }
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
          if (view.scale > 1) setView((v) => ({ ...v, x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y }));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          setDragging(false);
          // A click on the dark around the picture, at fit, closes it.
          if (d && !d.moved && view.scale === 1 && e.target === e.currentTarget) onClose();
        }}
        onDoubleClick={(e) => {
          const p = fromCenter(e);
          if (view.scale > 1) zoomTo(1);
          else zoomTo(3, p.x, p.y);
        }}
      >
        {item.video ? (
          <video key={item.id} src={item.src ?? proxyUrl(projectId, item.id)} style={style} controls autoPlay loop playsInline />
        ) : (
          <img key={item.id} src={item.src ?? imageUrl(projectId, item.id)} style={style} alt="" draggable={false} />
        )}
        {items.length > 1 && (
          <>
            <button className="viewer-step prev" onClick={() => go(-1)} title="The one before (←)" aria-label="The one before">
              <Icon name="back" size={24} />
            </button>
            <button className="viewer-step next" onClick={() => go(1)} title="The next one (→)" aria-label="The next one">
              <Icon name="forward" size={24} />
            </button>
          </>
        )}
      </div>
      <div className="viewer-bar">
        <span className="viewer-caption">{item.caption ?? item.id}</span>
        {items.length > 1 && (
          <span className="dim small">
            {index + 1} of {items.length}
          </span>
        )}
        <span className="spacer" />
        {actions?.(item, index)}
        <button onClick={() => zoomTo(view.scale / STEP)} disabled={view.scale === 1} title="Zoom out (−)" aria-label="Zoom out">
          <Icon name="minus" size={12} />
        </button>
        <button className="viewer-zoom" onClick={() => zoomTo(1)} title="Fit to the window (0); the wheel or a double-click zooms where the pointer is" aria-label="Fit">
          {view.scale === 1 ? "Fit" : `${view.scale.toFixed(1)}×`}
        </button>
        <button onClick={() => zoomTo(view.scale * STEP)} disabled={view.scale >= MOST} title="Zoom in (+)" aria-label="Zoom in">
          <Icon name="add" size={12} />
        </button>
        <button onClick={onClose} title="Close (Esc)" aria-label="Close">
          <Icon name="close" size={12} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Two arrows pointing out: see it large. */
export function EnlargeIcon() {
  return (
    <Icon name="enlarge" size={12} />
  );
}
