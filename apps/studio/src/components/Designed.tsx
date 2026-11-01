import type { Grade, Look, Motion, Project, Shot } from "@beatsheet/schema";
import { NEUTRAL } from "@beatsheet/video";
import { useState } from "react";
import { actions } from "../store";
import { TextField } from "./ui";
import { StyleSelect } from "./Cast";
import { GradeControls } from "./GradeControls";

const MOVES: Record<string, Motion | undefined> = {
  none: undefined,
  "push in": { from: { scale: 1 }, to: { scale: 1.15 } },
  "pull out": { from: { scale: 1.2 }, to: { scale: 1 } },
  "pan left": { from: { scale: 1.15, x: 0.04 }, to: { scale: 1.15, x: -0.04 } },
  "pan right": { from: { scale: 1.15, x: -0.04 }, to: { scale: 1.15, x: 0.04 } },
  "drift up": { from: { scale: 1.12, y: 0.03 }, to: { scale: 1.12, y: -0.03 } },
  "slow turn": { from: { scale: 1.18, rotate: -1.5 }, to: { scale: 1.12, rotate: 1.5 } },
};

/** How a footage shot moves through its length: a push in, a pull out, a pan. */
export function MotionSelect({ shot }: { shot: Shot }) {
  // Clips and generated shots move the same way.
  if (shot.content.kind !== "clip" && shot.content.kind !== "generated") return null;
  const now = shot.content.motion;
  const name = Object.entries(MOVES).find(([, m]) => JSON.stringify(m) === JSON.stringify(now))?.[0] ?? (now ? "custom" : "none");
  return (
    <label>
      Moves
      <select
        value={name}
        onChange={(e) =>
          actions.edit((d) => {
            const c = d.shots.find((s) => s.id === shot.id)!.content;
            if (c.kind !== "clip" && c.kind !== "generated") return;
            const m = MOVES[e.target.value];
            if (m) c.motion = structuredClone(m);
            else delete c.motion;
          })
        }
      >
        {Object.keys(MOVES).map((m) => (
          <option key={m} value={m}>
            {m === "none" ? "Still" : m[0]!.toUpperCase() + m.slice(1)}
          </option>
        ))}
        {name === "custom" && <option value="custom">Custom</option>}
      </select>
    </label>
  );
}

/** A designed scene: which one, and its props as JSON to tweak (text, timings, which pictures). */
export function SceneProps({ shot }: { shot: Shot }) {
  const [error, setError] = useState("");
  if (shot.content.kind !== "coded") return null;
  const c = shot.content;
  return (
    <div className="scene-props">
      <div className="insp-row">
        <span>Scene</span>
        <span className="mono small">{c.component}</span>
      </div>
      <TextField
        multiline
        value={JSON.stringify(c.props ?? {}, null, 2)}
        placeholder="{}"
        onCommit={(v) => {
          try {
            const props = v.trim() ? (JSON.parse(v) as Record<string, unknown>) : {};
            setError("");
            actions.edit((d) => {
              const x = d.shots.find((s) => s.id === shot.id)!.content;
              if (x.kind === "coded") x.props = props;
            });
          } catch (err) {
            setError(`That isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`);
          }
        }}
      />
      {error && <p className="warn small">{error}</p>}
      <label className="check-row small">
        <input
          type="checkbox"
          checked={shot.captions !== false}
          onChange={(e) => actions.edit((d) => void (d.shots.find((s) => s.id === shot.id)!.captions = e.target.checked ? undefined : false))}
        />{" "}
        Captions over this shot
      </label>
    </div>
  );
}

const SWATCHES = ["paper", "ink", "accent", "accent2"];

/** How the grade's sliders run: range and step, and the value that leaves the footage as shot. */
/** The project's look: its colours, display font, grain and grade. Scenes, titles, captions and footage all draw with it. */
export function LookPanel({ p }: { p: Project }) {
  const look: Look = p.look ?? {};
  const colors = { ...Object.fromEntries(SWATCHES.map((k) => [k, ""])), ...(look.colors ?? {}) };
  const set = (fn: (l: Look) => void) =>
    actions.edit((d) => {
      d.look = structuredClone(d.look ?? {});
      fn(d.look);
    });
  return (
    <section className="look-panel">
      <h4>Look{look.name ? `: ${look.name}` : ""}</h4>
      {look.note && <p className="dim small">{look.note}</p>}
      {!p.look && <p className="dim small">None yet. The agent makes one from the brand, or from the footage; or pick colours here.</p>}
      <div className="look-swatches">
        {Object.entries(colors).map(([name, value]) => (
          <Swatch key={name} name={name} value={value} onCommit={(v) => set((l) => void (l.colors = { ...(l.colors ?? {}), [name]: v }))} />
        ))}
      </div>
      <div className="insp-row" title="The style made shots and cast sheets are drawn in, unless a cast member has its own">
        <span>Made shots</span>
        <StyleSelect value={look.style} fallback="None (photographs)" onChange={(s) => set((l) => void (s ? (l.style = s) : delete l.style))} />
      </div>
      <div className="insp-row">
        <span>Display font</span>
        <TextField value={look.fonts?.display ?? ""} placeholder="Arial Black" onCommit={(v) => set((l) => void (l.fonts = { ...(l.fonts ?? {}), display: v.trim() || undefined }))} />
      </div>
      <LookSlider key={`grain-${look.grain ?? 0}`} label="Grain" min={0} max={0.2} step={0.01} value={look.grain ?? 0} onCommit={(v) => set((l) => void (l.grain = v || undefined))} />
      <GradeControls grade={look.grade} onChange={(g) => set((l) => void (g ? (l.grade = g) : delete l.grade))} />
    </section>
  );
}

/** One named colour; the project takes it when the picker closes, not on every step of a drag. */
function Swatch({ name, value, onCommit }: { name: string; value: string; onCommit: (v: string) => void }) {
  const fallback = NEUTRAL[name as keyof typeof NEUTRAL] ?? NEUTRAL.accent;
  const [v, setV] = useState(/^#[0-9a-f]{6}$/i.test(value) ? value : fallback);
  return (
    <label className="look-swatch" title={name}>
      <input type="color" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
      <span className="small">{name}</span>
    </label>
  );
}

/** A slider the project takes when it's let go, not on every step of a drag. */
function LookSlider({ label, min, max, step, value, onCommit }: { label: string; min: number; max: number; step: number; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const done = () => v !== value && onCommit(v);
  return (
    <label className="insp-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} onPointerUp={done} onKeyUp={done} />
    </label>
  );
}
