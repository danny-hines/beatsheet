/**
 * Finishing a shot by hand, in the inspector: its values at the playhead with keys to move them over time (scale,
 * position, rotation, opacity, volume), where it sits in the frame (picture in picture, opacity, blend, corners, a
 * mask, a green screen keyed out), and its own grade on top of the look's.
 */
import { addKeyAt, BLENDS, formatTime, KEY_DEFAULTS, keyed, keyValue, removeKey, setKey, type Keyed, type Layout, type Shot } from "@beatsheet/schema";
import { actions, useProject, useStore, useTimeline } from "../store";
import { GradeControls } from "./GradeControls";

const ROWS: { prop: Keyed; label: string; min: number; max: number; step: number }[] = [
  { prop: "scale", label: "Scale", min: 0.1, max: 4, step: 0.01 },
  { prop: "x", label: "Across", min: -1, max: 1, step: 0.005 },
  { prop: "y", label: "Down", min: -1, max: 1, step: 0.005 },
  { prop: "rotate", label: "Turn", min: -180, max: 180, step: 0.5 },
  { prop: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01 },
  { prop: "volume", label: "Volume", min: 0, max: 2, step: 0.01 },
];

const PLACES: { label: string; box?: Layout["box"] }[] = [
  { label: "Whole frame" },
  { label: "Top right", box: { x: 0.64, y: 0.04, w: 0.32, h: 0.32 } },
  { label: "Top left", box: { x: 0.04, y: 0.04, w: 0.32, h: 0.32 } },
  { label: "Bottom right", box: { x: 0.64, y: 0.64, w: 0.32, h: 0.32 } },
  { label: "Bottom left", box: { x: 0.04, y: 0.64, w: 0.32, h: 0.32 } },
  { label: "Left half", box: { x: 0, y: 0, w: 0.5, h: 1 } },
  { label: "Right half", box: { x: 0.5, y: 0, w: 0.5, h: 1 } },
];

export function ShotKeys({ shot }: { shot: Shot }) {
  const project = useProject();
  const tl = useTimeline();
  const playhead = useStore((s) => s.playhead);
  const format = useStore((s) => s.format);
  const r = tl.shots.find((x) => x.id === shot.id);
  if (!r) return null;
  const fps = project.formats.find((f) => f.id === format)?.fps ?? 30;
  const t = Math.min(Math.max(0, playhead - r.start), r.end - r.start);
  const inside = playhead >= r.start && playhead < r.end;
  const near = 0.5 / fps;
  const edit = (fn: (s: Shot) => void) => actions.edit((d) => fn(d.shots.find((x) => x.id === shot.id)!));
  const sounds = shot.content.kind === "clip";
  const rows = ROWS.filter((x) => x.prop !== "volume" || sounds);
  const times = [...new Set((shot.keys ?? []).map((k) => k.t))].sort((a, b) => a - b);
  return (
    <div className="shot-look">
      <h4>
        Moves &amp; keys <span className="dim small">{inside ? `at ${formatTime(t)} into the shot` : "move the playhead into the shot to key it"}</span>
      </h4>
      {rows.map((row) => {
        const v = keyValue(shot.keys, row.prop, t, KEY_DEFAULTS[row.prop]);
        const has = keyed(shot.keys, row.prop);
        const here = shot.keys?.some((k) => k[row.prop] !== undefined && Math.abs(k.t - t) <= near);
        return (
          <div key={row.prop} className="key-row">
            <span>{row.label}</span>
            <input
              type="range"
              min={row.min}
              max={row.max}
              step={row.step}
              value={v}
              onChange={(e) => edit((s) => setKey(s, row.prop, t, Number(e.target.value), near))}
              title={has ? "Sets it here (a key at the playhead)" : "Sets it for the whole shot; ◆ to key it"}
            />
            <span className="mono small">{row.prop === "rotate" ? `${Math.round(v)}°` : v.toFixed(2)}</span>
            <button
              className={`key-btn ${here ? "on" : has ? "some" : ""}`}
              disabled={!inside}
              onClick={() => edit((s) => (here ? removeKey(s, t, row.prop, near) : addKeyAt(s, t, [row.prop], KEY_DEFAULTS, near)))}
              title={here ? "Take the key here out" : "A key here: it can change from this moment"}
            >
              ◆
            </button>
          </div>
        );
      })}
      {times.length > 0 && (
        <p className="small dim">
          Keys at{" "}
          {times.map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              <button className="link small" onClick={() => actions.seek(r.start + k)}>
                {formatTime(k)}
              </button>
            </span>
          ))}{" "}
          ·{" "}
          <button className="link small" onClick={() => edit((s) => void delete s.keys)}>
            clear them
          </button>
        </p>
      )}
    </div>
  );
}

export function ShotFrame({ shot }: { shot: Shot }) {
  const L = shot.layout ?? {};
  const edit = (fn: (l: Layout) => void) =>
    actions.edit((d) => {
      const s = d.shots.find((x) => x.id === shot.id)!;
      const l = structuredClone(s.layout ?? {});
      fn(l);
      for (const k of Object.keys(l) as (keyof Layout)[]) if (l[k] === undefined) delete l[k];
      if (Object.keys(l).length) s.layout = l;
      else delete s.layout;
    });
  const place = PLACES.findIndex((p) => JSON.stringify(p.box) === JSON.stringify(L.box));
  const picture = shot.content.kind === "clip" || shot.content.kind === "generated";
  return (
    <div className="shot-look">
      <h4>Frame</h4>
      <div className="look-row">
        <label>
          Where
          <select value={place < 0 ? "custom" : String(place)} onChange={(e) => e.target.value !== "custom" && edit((l) => void (l.box = PLACES[Number(e.target.value)]!.box))}>
            {PLACES.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
            {place < 0 && <option value="custom">Its own place</option>}
          </select>
        </label>
        <label>
          Blend
          <select value={L.blend ?? "normal"} onChange={(e) => edit((l) => void (l.blend = e.target.value === "normal" ? undefined : (e.target.value as Layout["blend"])))}>
            {BLENDS.map((b) => (
              <option key={b} value={b}>
                {b[0]!.toUpperCase() + b.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {L.box && (
        <div className="look-row box-row">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k}>
              {{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]}
              <input type="number" min={0} max={1} step={0.01} value={L.box![k]} onChange={(e) => edit((l) => void (l.box = { ...l.box!, [k]: Math.min(1, Math.max(0, Number(e.target.value))) }))} />
            </label>
          ))}
        </div>
      )}
      <div className="look-row">
        <label>
          Opacity
          <input type="range" min={0} max={1} step={0.01} value={L.opacity ?? 1} onChange={(e) => edit((l) => void (l.opacity = Number(e.target.value) === 1 ? undefined : Number(e.target.value)))} />
        </label>
        <label>
          Corners
          <input type="range" min={0} max={0.5} step={0.01} value={L.radius ?? 0} onChange={(e) => edit((l) => void (l.radius = Number(e.target.value) || undefined))} />
        </label>
      </div>
      <div className="look-row">
        <label>
          Mask
          <select
            value={L.mask ? `${L.mask.shape}${L.mask.invert ? "-out" : ""}` : ""}
            onChange={(e) =>
              edit((l) => {
                const v = e.target.value;
                if (!v) return void (l.mask = undefined);
                const [shape, out] = v.split("-");
                l.mask = { shape: shape as "rect" | "ellipse", box: l.mask?.box ?? { x: 0.2, y: 0.15, w: 0.6, h: 0.7 }, feather: l.mask?.feather ?? 0.08, ...(out ? { invert: true } : {}) };
              })
            }
          >
            <option value="">None</option>
            <option value="ellipse">An oval</option>
            <option value="rect">A rectangle</option>
            <option value="ellipse-out">Outside an oval</option>
            <option value="rect-out">Outside a rectangle</option>
          </select>
        </label>
        {L.mask && (
          <label>
            Soft edge
            <input type="range" min={0} max={0.5} step={0.01} value={L.mask.feather ?? 0} onChange={(e) => edit((l) => void (l.mask = { ...l.mask!, feather: Number(e.target.value) }))} />
          </label>
        )}
      </div>
      {L.mask && (
        <div className="look-row box-row">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k}>
              {{ x: "Left", y: "Top", w: "Width", h: "Height" }[k]}
              <input type="number" min={0} max={1} step={0.01} value={L.mask!.box[k]} onChange={(e) => edit((l) => void (l.mask = { ...l.mask!, box: { ...l.mask!.box, [k]: Math.min(1, Math.max(0, Number(e.target.value))) } }))} />
            </label>
          ))}
        </div>
      )}
      {picture && (
        <div className="look-row">
          <label title="A green or blue screen behind someone, taken out so what's under the shot shows">
            Key out
            <select value={L.key?.color ?? ""} onChange={(e) => edit((l) => void (l.key = e.target.value ? { ...(l.key ?? {}), color: e.target.value as "green" | "blue" } : undefined))}>
              <option value="">Nothing</option>
              <option value="green">A green screen</option>
              <option value="blue">A blue screen</option>
            </select>
          </label>
          {L.key && (
            <>
              <label>
                How much
                <input type="range" min={0} max={1} step={0.02} value={L.key.strength ?? 0.5} onChange={(e) => edit((l) => void (l.key = { ...l.key!, strength: Number(e.target.value) }))} />
              </label>
              <label title="Takes the screen's colour off edges and hair">
                Spill
                <input type="range" min={0} max={1} step={0.02} value={L.key.spill ?? 0.5} onChange={(e) => edit((l) => void (l.key = { ...l.key!, spill: Number(e.target.value) }))} />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ShotGrade({ shot }: { shot: Shot }) {
  const c = shot.content;
  if (c.kind !== "clip" && c.kind !== "generated") return null;
  return (
    <div className="shot-look">
      <h4>
        Color <span className="dim small">on top of the look's grade</span>
      </h4>
      <GradeControls
        grade={c.grade}
        vignette={false}
        onChange={(g) =>
          actions.edit((d) => {
            const s = d.shots.find((x) => x.id === shot.id)!;
            if (s.content.kind !== "clip" && s.content.kind !== "generated") return;
            if (g) s.content.grade = g;
            else delete s.content.grade;
          })
        }
      />
    </div>
  );
}
