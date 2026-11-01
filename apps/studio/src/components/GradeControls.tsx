/**
 * Grading by hand: sliders for warmth, tint, saturation, contrast, brightness and fade, and three colour wheels
 * (shadows, midtones, highlights) that push each range towards a colour and brighten or darken it. The project's look
 * and a single shot use the same controls; a shot's grade goes on top of the look's.
 */
import type { Grade } from "@beatsheet/schema";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Slider = { key: "warmth" | "tint" | "saturation" | "contrast" | "brightness" | "fade" | "vignette"; label: string; min: number; max: number; step: number; none: number };
const SLIDERS: Slider[] = [
  { key: "warmth", label: "Warmth", min: -1, max: 1, step: 0.05, none: 0 },
  { key: "tint", label: "Tint", min: -1, max: 1, step: 0.05, none: 0 },
  { key: "saturation", label: "Saturation", min: 0, max: 2, step: 0.05, none: 1 },
  { key: "contrast", label: "Contrast", min: 0.5, max: 1.5, step: 0.05, none: 1 },
  { key: "brightness", label: "Brightness", min: 0.5, max: 1.5, step: 0.05, none: 1 },
  { key: "fade", label: "Fade", min: 0, max: 1, step: 0.05, none: 0 },
  { key: "vignette", label: "Vignette", min: 0, max: 1, step: 0.05, none: 0 },
];

type Wheel = "lift" | "gamma" | "gain";
const WHEELS: { key: Wheel; label: string; none: number; reach: number }[] = [
  { key: "lift", label: "Shadows", none: 0, reach: 0.1 },
  { key: "gamma", label: "Midtones", none: 1, reach: 0.35 },
  { key: "gain", label: "Highlights", none: 1, reach: 0.35 },
];
// Red, green and blue around the wheel, a third of a turn apart.
const ANGLES = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** A wheel's puck (x, y in -1..1) and its brightness (-1..1) as red, green and blue amounts, and back. */
function toChannels(x: number, y: number, level: number, none: number, reach: number): [number, number, number] {
  return ANGLES.map((a) => r3(none + reach * (x * Math.cos(a) + y * Math.sin(a) + level))) as [number, number, number];
}
function fromChannels(v: [number, number, number] | undefined, none: number, reach: number) {
  const d = (v ?? [none, none, none]).map((c) => (c - none) / reach);
  const level = (d[0]! + d[1]! + d[2]!) / 3;
  const x = (2 / 3) * d.reduce((s, c, i) => s + (c - level) * Math.cos(ANGLES[i]!), 0);
  const y = (2 / 3) * d.reduce((s, c, i) => s + (c - level) * Math.sin(ANGLES[i]!), 0);
  return { x, y, level };
}

/** Takes out what's at its neutral value, so an untouched grade is no grade. */
function tidy(g: Grade): Grade | undefined {
  const out: Grade = {};
  for (const s of SLIDERS) if (g[s.key] !== undefined && Math.abs(g[s.key]! - s.none) > 1e-6) out[s.key] = g[s.key];
  const wheels: NonNullable<Grade["wheels"]> = {};
  for (const w of WHEELS) {
    const v = g.wheels?.[w.key];
    if (v && v.some((c) => Math.abs(c - w.none) > 1e-3)) wheels[w.key] = v;
  }
  if (Object.keys(wheels).length) out.wheels = wheels;
  return Object.keys(out).length ? out : undefined;
}

export function GradeControls({ grade, onChange, vignette = true }: { grade?: Grade; onChange: (g: Grade | undefined) => void; vignette?: boolean }) {
  const g = grade ?? {};
  return (
    <div className="grade-controls">
      {SLIDERS.filter((s) => vignette || s.key !== "vignette").map((s) => (
        <GradeSlider key={`${s.key}-${g[s.key] ?? s.none}`} s={s} value={g[s.key] ?? s.none} onCommit={(v) => onChange(tidy({ ...g, [s.key]: v }))} />
      ))}
      <div className="wheels">
        {WHEELS.map((w) => (
          <ColourWheel key={w.key} label={w.label} value={g.wheels?.[w.key]} none={w.none} reach={w.reach} onCommit={(v) => onChange(tidy({ ...g, wheels: { ...(g.wheels ?? {}), [w.key]: v } }))} />
        ))}
      </div>
    </div>
  );
}

/** A slider the project takes when it's let go, not on every step of a drag; double-click puts it back. */
function GradeSlider({ s, value, onCommit }: { s: Slider; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const done = () => v !== value && onCommit(v);
  return (
    <label className="insp-row" title="Double-click to put it back">
      <span>{s.label}</span>
      <input type="range" min={s.min} max={s.max} step={s.step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={done} onKeyUp={done} onDoubleClick={() => onCommit(s.none)} />
    </label>
  );
}

/** One colour wheel: drag the dot towards a colour, the slider under it for brighter or darker; double-click resets. */
function ColourWheel({ label, value, none, reach, onCommit }: { label: string; value?: [number, number, number]; none: number; reach: number; onCommit: (v: [number, number, number]) => void }) {
  const start = fromChannels(value, none, reach);
  const [pos, setPos] = useState({ x: start.x, y: start.y });
  const [level, setLevel] = useState(start.level);
  useEffect(() => {
    const s = fromChannels(value, none, reach);
    setPos({ x: s.x, y: s.y });
    setLevel(s.level);
  }, [value?.join(","), none, reach]); // eslint-disable-line react-hooks/exhaustive-deps
  const disc = useRef<HTMLDivElement>(null);
  const at = (e: ReactPointerEvent) => {
    const r = disc.current!.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    const len = Math.hypot(x, y);
    if (len > 1) (x /= len), (y /= len);
    return { x, y };
  };
  const commit = (p = pos, l = level) => onCommit(toChannels(p.x, p.y, l, none, reach));
  return (
    <div className="wheel">
      <div
        ref={disc}
        className="wheel-disc"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setPos(at(e));
        }}
        onPointerMove={(e) => e.buttons === 1 && setPos(at(e))}
        onPointerUp={(e) => commit(at(e))}
        onDoubleClick={() => {
          setPos({ x: 0, y: 0 });
          setLevel(0);
          commit({ x: 0, y: 0 }, 0);
        }}
        title={`${label}: drag toward a color; double-click to reset`}
      >
        <span className="wheel-puck" style={{ left: `${50 + pos.x * 50}%`, top: `${50 - pos.y * 50}%` }} />
      </div>
      <input type="range" min={-1} max={1} step={0.05} value={level} onChange={(e) => setLevel(Number(e.target.value))} onPointerUp={() => commit()} onKeyUp={() => commit()} title={`${label}: brighter or darker`} />
      <span className="small dim">{label}</span>
    </div>
  );
}
