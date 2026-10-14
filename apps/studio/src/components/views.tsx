import {
  anchorForTime,
  describeAnchor,
  formatTime,
  snapPoints,
  STAGE_IDS,
  type Asset,
  type Brief,
  type Fidelity,
  type Project,
  type Shot,
} from "@beatsheet/schema";
import { useMemo, useState, type CSSProperties } from "react";
import { assetMap, FIDELITY_LABEL, hideBroken, KIND_LABEL, nextId, pictureTrack, posterUrl, shotAsset, shotSummary, shotSwatch, STAGE_LABELS } from "../lib";
import { actions, timelineFor, useProject, useStore, useTimeline } from "../store";
import { Preview, Transport } from "./Preview";
import { AnchorChip, Empty, FidelityPill, NumberField, Pill, Stars, TextField } from "./ui";

const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

// ---------------------------------------------------------------------------------------------------------------
export function BriefView() {
  const p = useProject();
  const b = p.brief;
  const set = (fn: (b: Brief) => void) => actions.edit((d) => fn(d.brief));
  return (
    <div className="view two-col">
      <div className="form">
        <label>
          Goal
          <TextField multiline value={b.goal} onCommit={(v) => set((x) => void (x.goal = v))} />
        </label>
        <label>
          Audience
          <TextField value={b.audience ?? ""} onCommit={(v) => set((x) => void (x.audience = v || undefined))} />
        </label>
        <label>
          Platforms
          <TextField value={(b.platforms ?? []).join(", ")} onCommit={(v) => set((x) => void (x.platforms = list(v)))} placeholder="Comma-separated" />
        </label>
        <div className="row">
          <label>
            Target length
            <NumberField value={b.targetLength} step={1} suffix="s" onCommit={(v) => set((x) => void (x.targetLength = v))} />
          </label>
          <label>
            Longest allowed
            <NumberField value={b.maxLength} step={1} suffix="s" onCommit={(v) => set((x) => void (x.maxLength = v))} />
          </label>
        </div>
        <label>
          Tone
          <TextField value={(b.tone ?? []).join(", ")} onCommit={(v) => set((x) => void (x.tone = list(v)))} placeholder="Comma-separated" />
        </label>
        <label>
          References
          <TextField value={(b.references ?? []).join(", ")} onCommit={(v) => set((x) => void (x.references = list(v)))} placeholder="Links or asset ids" />
        </label>
        <label>
          Notes
          <TextField multiline value={b.notes ?? ""} onCommit={(v) => set((x) => void (x.notes = v || undefined))} />
        </label>
      </div>
      <div className="stack">
        <div className="card">
          <h3>Formats</h3>
          {p.formats.map((f) => {
            const d = timelineFor(p, f.id).duration;
            const over = b.maxLength !== undefined && d > b.maxLength;
            return (
              <div key={f.id} className="format-row">
                <span className={`format-shape`} style={{ aspectRatio: `${f.width} / ${f.height}` }} />
                <div>
                  <strong>{f.label}</strong> <span className="dim">{f.width}×{f.height} · {f.fps} fps</span>
                  <div className="dim">{f.platforms?.join(", ")}</div>
                </div>
                <span className="spacer" />
                <span className={over ? "warn" : ""}>{formatTime(d)}</span>
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3>Recipe</h3>
          <p>
            <strong>{p.recipe}</strong> · timing hangs off the <strong>{p.spine}</strong>.
          </p>
          <p className="dim">
            The recipe is a skill that tells the agent how to run each stage for this kind of video. It also decides which stages
            apply: {STAGE_IDS.filter((s) => p.stages[s].status === "skipped").map((s) => STAGE_LABELS[s].title).join(", ") || "none"} skipped here.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function usageMap(p: Project) {
  const used = new Map<string, string[]>();
  const add = (a: string, by: string) => used.set(a, [...(used.get(a) ?? []), by]);
  for (const s of p.shots) {
    const c = s.content;
    if (c.kind === "clip") add(c.asset, s.id);
    if (c.kind === "generated") for (const a of new Set([...(c.takes ?? []), ...(c.take ? [c.take] : [])])) add(a, s.id);
  }
  for (const c of p.music?.cues ?? []) add(c.asset, c.id);
  return used;
}

export function MaterialView() {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const selection = useStore((s) => s.selection);
  const [filter, setFilter] = useState<"all" | "keepers" | "unrated" | "rejected" | "generated">("all");
  const used = useMemo(() => usageMap(p), [p]);
  const shown = p.assets.filter((a) => {
    if (filter === "keepers") return (a.rating ?? 0) >= 3;
    if (filter === "unrated") return !a.rating;
    if (filter === "rejected") return a.rating === -1;
    if (filter === "generated") return a.provenance?.source === "generated";
    return true;
  });
  const generatedCost = p.assets.reduce((n, a) => n + (a.provenance?.costUsd ?? 0), 0);
  const moments = p.assets.reduce((n, a) => n + (a.moments?.length ?? 0), 0);
  const rate = (id: string, r: number) => actions.edit((d) => void (d.assets.find((a) => a.id === id)!.rating = r));

  return (
    <div className="view">
      <div className="toolbar">
        {(["all", "keepers", "unrated", "rejected", "generated"] as const).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f[0]!.toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="spacer" />
        <span className="dim">
          {p.assets.length} assets · {moments} moments logged · {p.assets.filter((a) => a.rating === -1).length} rejected
          {generatedCost > 0 && ` · $${generatedCost.toFixed(2)} spent generating`}
        </span>
      </div>
      <div className="asset-grid">
        {shown.map((a) => (
          <AssetCard key={a.id} a={a} projectId={projectId} used={used.get(a.id) ?? []} selected={selection?.kind === "asset" && selection.id === a.id} onRate={(r) => rate(a.id, r)} />
        ))}
      </div>
    </div>
  );
}

function AssetCard({ a, projectId, used, selected, onRate }: { a: Asset; projectId: string; used: string[]; selected: boolean; onRate: (r: number) => void }) {
  const portrait = (a.height ?? 0) > (a.width ?? 0);
  return (
    <div className={`asset-card ${selected ? "sel" : ""} ${a.rating === -1 ? "rejected" : ""}`} onClick={() => actions.select({ kind: "asset", id: a.id })}>
      <div className="asset-thumb" style={{ background: a.color ?? "#333" }}>
        {a.kind !== "music" && <img className="thumb-img" src={posterUrl(projectId, a.id)} loading="lazy" alt="" onError={hideBroken} />}
        <span className="asset-kind">{a.provenance?.source === "generated" ? "generated" : a.kind}</span>
        {a.width && <span className={`orient ${portrait ? "portrait" : ""}`} />}
        {a.duration !== undefined && <span className="asset-dur">{formatTime(a.duration).replace(/^0:/, "")}</span>}
        {a.moments && a.duration && (
          <div className="moments">
            {a.moments.map((m) => (
              <span key={m.id} className="moment" style={{ left: `${(m.t / a.duration!) * 100}%` }} title={`${m.label} @ ${m.t}s`} />
            ))}
          </div>
        )}
      </div>
      <div className="asset-body">
        <div className="asset-label">{a.label ?? a.id}</div>
        <div className="dim small">
          {a.width ? `${a.width}×${a.height}` : a.grid ? `${a.grid.bpm} BPM` : a.kind}
          {used.length > 0 && ` · used in ${used.join(", ")}`}
        </div>
        {a.tags && <div className="tags">{a.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
        {a.kind !== "music" && <Stars rating={a.rating} onChange={onRate} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function StructureView() {
  const p = useProject();
  const tl = useTimeline();
  const format = useStore((s) => s.format);
  const selection = useStore((s) => s.selection);
  const locked = !!p.stages.structure.locked;
  const firstFormat = p.formats[0]!.id;
  const setGap = (lineId: string, v: number) =>
    actions.edit((d) => {
      const l = d.voice!.lines.find((x) => x.id === lineId)!;
      if (format === firstFormat && l.gaps?.[format] === undefined) l.gapAfter = v;
      else l.gaps = { ...l.gaps, [format]: v };
    });

  return (
    <div className="view">
      {locked && <div className="banner">🔒 Structure is locked: the script and recorded voice are final. Unlock the stage to change pauses.</div>}
      {p.voice && (
        <div className="card">
          <h3>
            Script <span className="dim">· {tl.lines.length} lines in this format · {p.voice.voice}</span>
          </h3>
          <table className="script">
            <thead>
              <tr>
                <th>Line</th>
                <th>Text</th>
                <th>Starts</th>
                <th>Length</th>
                <th>Pause after</th>
              </tr>
            </thead>
            <tbody>
              {tl.lines.map((r) => {
                const l = p.voice!.lines.find((x) => x.id === r.id)!;
                const isLast = r === tl.lines.at(-1);
                const gap = l.gaps?.[format] ?? l.gapAfter ?? (isLast ? p.voice!.tail : p.voice!.defaultGap);
                return (
                  <tr
                    key={r.id}
                    className={selection?.kind === "line" && selection.id === r.id ? "sel" : ""}
                    onClick={() => {
                      actions.select({ kind: "line", id: r.id });
                      actions.seek(r.start);
                    }}
                  >
                    <td className="mono">{r.id}</td>
                    <td>
                      {r.text} {l.only && <Pill>{l.only.map((f) => p.formats.find((x) => x.id === f)?.label).join(", ")} only</Pill>}
                    </td>
                    <td className="mono dim">{formatTime(r.start)}</td>
                    <td className="mono dim">{l.duration.toFixed(2)}s</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <NumberField value={+gap.toFixed(3)} step={0.05} suffix={isLast ? "s tail" : "s"} disabled={locked} onCommit={(v) => setGap(r.id, v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tl.cues.length > 0 && <MusicCard />}
    </div>
  );
}

function MusicCard() {
  const p = useProject();
  const tl = useTimeline();
  const assets = assetMap(p);
  return (
    <div className="card">
      <h3>Music</h3>
      {tl.cues.map((r) => {
        const cue = p.music!.cues.find((c) => c.id === r.id)!;
        const a = assets.get(r.asset)!;
        const dur = a.duration ?? 1;
        const pct = (t: number) => `${(t / dur) * 100}%`;
        return (
          <div key={r.id} className="cue-card" onClick={() => actions.select({ kind: "cue", id: r.id })}>
            <div className="cue-head">
              <strong>{a.label}</strong>
              <span className="dim">
                {a.grid && `${a.grid.bpm} BPM · `}plays {formatTime(r.trackFrom)}–{formatTime(r.trackFrom + (r.end - r.start))} of the track, at {formatTime(r.start)}–{formatTime(r.end)} in the cut
              </span>
            </div>
            <div className="track-map">
              {(a.sections ?? []).map((s, i, all) => (
                <div key={s.id} className="track-sec" style={{ left: pct(s.start), width: pct((s.end ?? all[i + 1]?.start ?? dur) - s.start) }}>
                  {s.label}
                </div>
              ))}
              <div className="track-used" style={{ left: pct(r.trackFrom), width: pct(r.end - r.start) }} />
            </div>
            {cue.sync && (
              <div className="dim small">
                Lands the track at {formatTime(cue.sync.track)} on <AnchorChip anchor={cue.sync.at} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function BoardView() {
  const p = useProject();
  const tl = useTimeline();
  const format = useStore((s) => s.format);
  const selection = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const projectId = useStore((s) => s.projectId)!;
  const assets = useMemo(() => assetMap(p), [p]);
  const pic = pictureTrack(p);
  const fmt = p.formats.find((f) => f.id === format)!;
  const shots = tl.shots.filter((s) => s.track === pic).map((r) => ({ r, s: p.shots.find((x) => x.id === r.id)! }));
  const counts = Object.fromEntries((["idea", "board", "rough", "final"] as Fidelity[]).map((f) => [f, shots.filter((x) => x.s.fidelity === f).length]));

  const addShot = () => {
    const res = anchorForTime(playhead, snapPoints(tl), 0.25);
    const id = nextId("s", p.shots);
    actions.edit((d) => {
      const shot: Shot = { id, track: pic!, label: "New shot", start: res.anchor, fidelity: "idea", content: { kind: "placeholder", description: "Describe the shot" } };
      // A track's shots chain in array order, so insert after the last shot that starts before this one.
      const before = tl.shots.filter((s) => s.track === pic && s.start <= playhead).at(-1);
      const idx = before ? d.shots.findIndex((s) => s.id === before.id) + 1 : 0;
      d.shots.splice(idx, 0, shot);
    });
    actions.select({ kind: "shot", id });
  };

  return (
    <div className="view">
      <div className="toolbar">
        <div className="fid-bar">
          {(["idea", "board", "rough", "final"] as Fidelity[]).map((f) => (
            <span key={f} className={`fid-seg fid-${f}`} style={{ flex: counts[f] || 0 }} title={`${counts[f]} ${FIDELITY_LABEL[f]}`}>
              {counts[f] ? `${counts[f]} ${FIDELITY_LABEL[f].toLowerCase()}` : ""}
            </span>
          ))}
        </div>
        <span className="spacer" />
        <button onClick={addShot} title="Adds an idea card at the playhead, anchored to the nearest word or beat">+ Shot at playhead</button>
      </div>
      <div className={`board-grid ${fmt.height > fmt.width ? "tall" : ""}`}>
        {shots.map(({ r, s }) => {
          const notes = p.notes.filter((n) => n.target.kind === "shot" && n.target.shot === s.id && n.status !== "done" && n.status !== "dismissed").length;
          return (
            <div
              key={s.id}
              className={`board-card ${selection?.kind === "shot" && selection.id === s.id ? "sel" : ""}`}
              onClick={() => {
                actions.select({ kind: "shot", id: s.id });
                actions.seek(r.start);
              }}
            >
              <div className={`board-frame kind-${s.content.kind}`} style={{ aspectRatio: `${fmt.width} / ${fmt.height}`, "--swatch": shotSwatch(s, assets) } as CSSProperties}>
                {shotAsset(s) && <img className="thumb-img" src={posterUrl(projectId, shotAsset(s)!)} loading="lazy" alt="" onError={hideBroken} />}
                <span className="board-kind">{KIND_LABEL[s.content.kind]}</span>
                {notes > 0 && <span className="shot-notes">{notes}</span>}
              </div>
              <div className="board-body">
                <div className="board-title">
                  <span className="mono dim">{s.id}</span> {s.label}
                  <span className="spacer" />
                  <FidelityPill fidelity={s.fidelity} />
                </div>
                <div className="dim small">
                  {formatTime(r.start)} · {(r.end - r.start).toFixed(2)}s · {shotSummary(s, assets)}
                </div>
                {s.intent && <div className="board-intent">{s.intent}</div>}
                <AnchorChip anchor={s.start} fallback="follows previous shot" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function AssembleView() {
  return (
    <div className="view assemble">
      <Preview />
      <Transport />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function CraftView() {
  const p = useProject();
  const tl = useTimeline();
  const selection = useStore((s) => s.selection);
  const format = useStore((s) => s.format);
  const assets = useMemo(() => assetMap(p), [p]);
  const shot = selection?.kind === "shot" ? p.shots.find((s) => s.id === selection.id) : undefined;
  const r = shot ? tl.shots.find((x) => x.id === shot.id) : undefined;
  const editShot = (fn: (s: Shot) => void) => shot && actions.edit((d) => fn(d.shots.find((s) => s.id === shot.id)!));

  return (
    <div className="view craft">
      <div className="craft-list">
        {tl.shots.map((x) => {
          const s = p.shots.find((y) => y.id === x.id)!;
          return (
            <button key={s.id} className={`craft-item ${shot?.id === s.id ? "on" : ""}`} onClick={() => actions.select({ kind: "shot", id: s.id })}>
              <span className="sw" style={{ background: shotSwatch(s, assets) }} />
              <span className="mono dim">{s.id}</span> {s.label}
              <span className="spacer" />
              {s.knobs && <span className="dim small">{Object.keys(s.knobs).length} values</span>}
            </button>
          );
        })}
      </div>
      {!shot || !r ? (
        <Empty>Pick a shot to polish it. Values the agent exposes in code show up here as controls.</Empty>
      ) : (
        <div className="craft-detail">
          <div className="craft-preview">
            <Preview at={(r.start + r.end) / 2} />
          </div>
          <div className="craft-controls">
            <h3>
              {shot.label ?? shot.id} <span className="dim">· {KIND_LABEL[shot.content.kind]}</span>
            </h3>
            {shot.knobs && (
              <div className="control-group">
                <h4>Values</h4>
                {Object.entries(shot.knobs).map(([k, knob]) => (
                  <label key={k} className="knob">
                    <span>{knob.label ?? k}</span>
                    {typeof knob.value === "number" ? (
                      <>
                        <input
                          type="range"
                          min={knob.min ?? 0}
                          max={knob.max ?? Math.max(1, knob.value * 2)}
                          step={knob.step ?? 0.01}
                          value={knob.value}
                          onChange={(e) => editShot((s) => void (s.knobs![k]!.value = Number(e.target.value)))}
                        />
                        <span className="mono">{knob.value}</span>
                      </>
                    ) : typeof knob.value === "boolean" ? (
                      <input type="checkbox" checked={knob.value} onChange={(e) => editShot((s) => void (s.knobs![k]!.value = e.target.checked))} />
                    ) : (
                      <TextField value={knob.value} onCommit={(v) => editShot((s) => void (s.knobs![k]!.value = v))} />
                    )}
                  </label>
                ))}
              </div>
            )}
            {shot.content.kind === "clip" && (() => {
              const c = shot.content;
              const rf = c.reframe?.[format] ?? { x: 0.5, y: 0.5, zoom: 1 };
              const setRf = (key: "x" | "y" | "zoom", v: number) =>
                editShot((s) => {
                  if (s.content.kind !== "clip") return;
                  s.content.reframe = { ...s.content.reframe, [format]: { ...rf, [key]: v } };
                });
              return (
                <div className="control-group">
                  <h4>Clip · {assets.get(c.asset)?.label}</h4>
                  {c.sync ? (
                    <p className="small">
                      Moment <strong>{String(c.sync.moment)}</strong> plays on <AnchorChip anchor={c.sync.at} />, so the in point follows the cut (now {r.sourceIn?.toFixed(2)}s).
                    </p>
                  ) : (
                    <label className="knob">
                      <span>In point</span>
                      <NumberField value={c.in ?? 0} suffix="s" onCommit={(v) => editShot((s) => s.content.kind === "clip" && void (s.content.in = v))} />
                    </label>
                  )}
                  <label className="knob">
                    <span>Speed</span>
                    <NumberField value={c.speed ?? 1} step={0.05} suffix="×" onCommit={(v) => editShot((s) => s.content.kind === "clip" && void (s.content.speed = v))} />
                  </label>
                  <label className="knob">
                    <span>Look</span>
                    <TextField value={c.look ?? ""} onCommit={(v) => editShot((s) => s.content.kind === "clip" && void (s.content.look = v || undefined))} />
                  </label>
                  {(["x", "y", "zoom"] as const).map((key) => (
                    <label key={key} className="knob">
                      <span>Frame {key === "zoom" ? "zoom" : `focus ${key}`}</span>
                      <input type="range" min={key === "zoom" ? 1 : 0} max={key === "zoom" ? 3 : 1} step={0.01} value={rf[key] ?? 1} onChange={(e) => setRf(key, Number(e.target.value))} />
                      <span className="mono">{(rf[key] ?? 1).toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              );
            })()}
            {shot.content.kind === "generated" && (() => {
              const c = shot.content;
              return (
                <div className="control-group">
                  <h4>Generated</h4>
                  <label>
                    Prompt
                    <TextField multiline value={c.prompt} onCommit={(v) => editShot((s) => s.content.kind === "generated" && void (s.content.prompt = v))} />
                  </label>
                  <div className="takes">
                    {(c.takes ?? []).map((id, i) => {
                      const a = assets.get(id);
                      return (
                        <button key={id} className={`take ${c.take === id ? "on" : ""}`} onClick={() => editShot((s) => s.content.kind === "generated" && void (s.content.take = id))}>
                          <span className="sw" style={{ background: a?.color }} />
                          Take {i + 1}
                          <span className="dim small">
                            seed {String(a?.provenance?.seed ?? "?")} · ${a?.provenance?.costUsd?.toFixed(2) ?? "?"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button disabled title="Calls the provider directly from the UI once the engine exists (step 3)">
                    Generate another take
                  </button>
                </div>
              );
            })()}
            {shot.content.kind === "coded" && (
              <div className="control-group">
                <h4>Code</h4>
                <p className="mono small">{shot.content.component}</p>
                <p className="dim small">The agent writes this component. Any value it names as a knob appears above as a control, so you can tune it without a round trip.</p>
              </div>
            )}
            {shot.content.kind === "text" && (
              <div className="control-group">
                <h4>Text</h4>
                <TextField value={shot.content.text} onCommit={(v) => editShot((s) => s.content.kind === "text" && void (s.content.text = v))} />
              </div>
            )}
            {shot.content.kind === "placeholder" && (
              <div className="control-group">
                <h4>Placeholder</h4>
                <TextField multiline value={shot.content.description} onCommit={(v) => editShot((s) => s.content.kind === "placeholder" && void (s.content.description = v))} />
                <p className="dim small">Leave a note on this card to have the agent find footage for it or generate it.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function SoundView() {
  const p = useProject();
  const tl = useTimeline();
  const locked = !!p.stages.structure.locked;
  const speech = tl.lines.reduce((n, l) => n + (l.end - l.start), 0);
  const setCue = (id: string, key: "fadeIn" | "fadeOut" | "gain", v: number) => actions.edit((d) => void (d.music!.cues.find((c) => c.id === id)![key] = v));
  return (
    <div className="view">
      {p.voice && (
        <div className="card">
          <h3>Voice</h3>
          <div className="row">
            <span>{p.voice.voice}</span>
            <span className="dim">
              {tl.lines.length} lines · {speech.toFixed(1)}s of speech in a {tl.duration.toFixed(1)}s cut
            </span>
          </div>
          <div className="row">
            <label className="knob">
              <span>Lead-in</span>
              <NumberField value={p.voice.leadIn} step={0.05} suffix="s" disabled={locked} onCommit={(v) => actions.edit((d) => void (d.voice!.leadIn = v))} />
            </label>
            <label className="knob">
              <span>Default pause</span>
              <NumberField value={p.voice.defaultGap} step={0.05} suffix="s" disabled={locked} onCommit={(v) => actions.edit((d) => void (d.voice!.defaultGap = v))} />
            </label>
          </div>
        </div>
      )}
      {tl.cues.length > 0 && (
        <div className="card">
          <h3>Music edits</h3>
          <table className="script">
            <thead>
              <tr>
                <th>Cue</th>
                <th>Plays</th>
                <th>Lands</th>
                <th>Fade in</th>
                <th>Fade out</th>
                <th>Gain</th>
              </tr>
            </thead>
            <tbody>
              {tl.cues.map((r) => {
                const c = p.music!.cues.find((x) => x.id === r.id)!;
                return (
                  <tr key={r.id} onClick={() => actions.select({ kind: "cue", id: r.id })}>
                    <td className="mono">{r.id}</td>
                    <td className="dim">
                      {formatTime(r.start)}–{formatTime(r.end)} <span className="small">(track from {formatTime(r.trackFrom)})</span>
                    </td>
                    <td>{c.sync ? <>track {formatTime(c.sync.track)} on <AnchorChip anchor={c.sync.at} /></> : <AnchorChip anchor={c.start} fallback="start of cut" />}</td>
                    <td onClick={(e) => e.stopPropagation()}><NumberField value={c.fadeIn ?? 0} step={0.1} suffix="s" onCommit={(v) => setCue(r.id, "fadeIn", v)} /></td>
                    <td onClick={(e) => e.stopPropagation()}><NumberField value={c.fadeOut ?? 0} step={0.1} suffix="s" onCommit={(v) => setCue(r.id, "fadeOut", v)} /></td>
                    <td onClick={(e) => e.stopPropagation()}><NumberField value={c.gain ?? 1} step={0.05} onCommit={(v) => setCue(r.id, "gain", v)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="dim small">Ducking under the voice, sound effects and loudness mastering arrive with the engine.</p>
        </div>
      )}
      {!p.voice && !tl.cues.length && <Empty>No voice or music yet.</Empty>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
type Job = { id: string; status: "running" | "done" | "error"; progress: number; output?: string; error?: string };

/** Draft renders use the small preview copies and take seconds; final renders read the original footage. */
function RenderControls({ format, label }: { format: string; label: string }) {
  const projectId = useStore((s) => s.projectId)!;
  const [job, setJob] = useState<Job | null>(null);
  const start = async (quality: "proxy" | "original") => {
    const res = await fetch(`/api/projects/${projectId}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ format, quality }) });
    let j = (await res.json()) as Job;
    setJob(j);
    while (j.status === "running") {
      await new Promise((r) => setTimeout(r, 700));
      j = (await (await fetch(`/api/jobs/${j.id}`)).json()) as Job;
      setJob(j);
    }
  };
  const file = job?.output?.split("/").pop();
  return (
    <div className="render">
      <div className="row">
        <button onClick={() => start("proxy")} disabled={job?.status === "running"} title="Fast, from the preview copies">Draft {label}</button>
        <button className="primary" onClick={() => start("original")} disabled={job?.status === "running"} title="Full quality, from the original footage">
          Render {label}
        </button>
      </div>
      {job?.status === "running" && (
        <div className="progress"><div style={{ width: `${Math.round(job.progress * 100)}%` }} /><span>{Math.round(job.progress * 100)}%</span></div>
      )}
      {job?.status === "error" && <div className="warn small">{job.error}</div>}
      {job?.status === "done" && file && (
        <div className="rendered">
          <video src={`/media/${projectId}/out/${file}?v=${job.id}`} controls />
          <div className="mono small dim">{job.output}</div>
        </div>
      )}
    </div>
  );
}

export function FinishView() {
  const p = useProject();
  const notesLeft = p.notes.filter((n) => n.status === "open" || n.status === "queued" || n.status === "working").length;
  const unfinished = p.shots.filter((s) => s.fidelity === "idea" || s.fidelity === "board");
  const stagesLeft = STAGE_IDS.filter((s) => s !== "finish" && (p.stages[s].status === "todo" || p.stages[s].status === "active"));
  return (
    <div className="view">
      <div className="format-cards">
        {p.formats.map((f) => {
          const tl = timelineFor(p, f.id);
          const over = p.brief.maxLength !== undefined && tl.duration > p.brief.maxLength;
          return (
            <div key={f.id} className="card format-card">
              <span className="format-shape big" style={{ aspectRatio: `${f.width} / ${f.height}` }} />
              <div>
                <h3>{f.label}</h3>
                <div className="dim">{f.width}×{f.height} · {f.fps} fps · {f.platforms?.join(", ")}</div>
                <div className={over ? "warn" : ""}>
                  {formatTime(tl.duration)} {p.brief.targetLength ? `(target ${formatTime(p.brief.targetLength)})` : ""}
                </div>
                {tl.diagnostics.length > 0 && <div className="warn">{tl.diagnostics.length} timing problems</div>}
                <RenderControls format={f.id} label={f.label} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="card">
        <h3>Before you ship</h3>
        <ul className="checks">
          <li className={notesLeft ? "todo" : "ok"}>{notesLeft ? `${notesLeft} notes still open or with the agent` : "All notes resolved"}</li>
          <li className={unfinished.length ? "todo" : "ok"}>{unfinished.length ? `${unfinished.length} shots still at idea or board: ${unfinished.map((s) => s.id).join(", ")}` : "Every shot is at least rough"}</li>
          <li className={stagesLeft.length ? "todo" : "ok"}>{stagesLeft.length ? `Stages not done: ${stagesLeft.map((s) => STAGE_LABELS[s].title).join(", ")}` : "Every stage is done or skipped"}</li>
          <li className="todo">Loudness mastering and captions aren't automatic yet</li>
        </ul>
      </div>
    </div>
  );
}
