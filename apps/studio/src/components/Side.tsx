import {
  anglesOf,
  describeTarget,
  FIDELITY,
  formatTime,
  type Fidelity,
  type Note,
  type Project,
  switchAngle,
  type Shot,
  type Timeline,
} from "@beatsheet/schema";
import { useMemo, useState } from "react";
import { AGENT_NAMES, assetMap, FIDELITY_LABEL, KIND_LABEL, noteMatches, noteTime, runJob, selectionForTarget, shotSummary, targetFromSelection, WINDOWS, pathParts } from "../lib";
import { actions, getState, setState, useProject, useStore, useTimeline } from "../store";
import { AgentPanel } from "./AgentPanel";
import { AssetView } from "./AssetView";
import { LookPanel, SceneProps } from "./Designed";
import { LineVoice, NarrationOverview } from "./Narration";
import { ShotLook } from "./Subjects";
import { Takes } from "./Takes";
import { Script } from "./Script";
import { cutToTalkers } from "../multicam";
import { ShotFrame, ShotGrade, ShotKeys } from "./ShotFinish";
import { CastView } from "./Cast";
import { AnchorChip, Empty, TextField } from "./ui";

export function SidePanel() {
  const side = useStore((s) => s.side);
  const project = useProject();
  const pending = project.notes.filter((n) => n.status === "queued" || n.status === "open").length;
  const agent = useStore((s) => s.agent);
  const here = !agent.project || agent.project === project.id;
  const asks = here ? agent.approvals.length : 0;
  return (
    <>
      <div className="tabs">
        <button className={`agent-tab ${side === "agent" ? "on" : ""}`} onClick={() => actions.setSide("agent")}>
          <span className={`dot ${!here ? "idle" : agent.status === "running" || agent.status === "starting" ? "pending" : agent.status === "idle" ? "on" : "idle"}`} />{" "}
          {here && agent.agent && agent.status !== "off" ? AGENT_NAMES[agent.agent] : "Agent"}
          {asks > 0 && <span className="count">{asks}</span>}
        </button>
        <button className={side === "notes" ? "on" : ""} onClick={() => actions.setSide("notes")}>
          Notes {pending > 0 && <span className="count">{pending}</span>}
        </button>
        <button className={side === "inspect" ? "on" : ""} onClick={() => actions.setSide("inspect")}>
          Inspect
        </button>
        <button className={side === "script" ? "on" : ""} onClick={() => actions.setSide("script")} title="The cut as what's said in it: edit the words to edit the cut">
          Script
        </button>
      </div>
      <div className={`side-body ${side === "agent" ? "agent" : ""}`}>{side === "inspect" ? <Inspector /> : side === "notes" ? <Notes /> : side === "script" ? <Script /> : <AgentPanel />}</div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function Inspector() {
  const p = useProject();
  const tl = useTimeline();
  const sel = useStore((s) => s.selection);
  const assets = useMemo(() => assetMap(p), [p]);

  if (sel?.kind === "shot") {
    const shot = p.shots.find((s) => s.id === sel.id);
    const r = tl.shots.find((s) => s.id === sel.id);
    if (!shot) return <Empty>That shot no longer exists.</Empty>;
    const list = p.shots.filter((s) => s.track === shot.track);
    const next = list[list.indexOf(shot) + 1];
    const editShot = (fn: (s: Shot) => void) => actions.edit((d) => fn(d.shots.find((s) => s.id === shot.id)!));
    return (
      <div className="inspector">
        <div className="insp-head">
          <span className="mono dim">{shot.id}</span>
          <span className="pill">{KIND_LABEL[shot.content.kind]}</span>
          <span className="spacer" />
          <select value={shot.fidelity} onChange={(e) => editShot((s) => void (s.fidelity = e.target.value as Fidelity))} title="How far along this shot is">
            {FIDELITY.map((f) => (
              <option key={f} value={f}>{FIDELITY_LABEL[f]}</option>
            ))}
          </select>
        </div>
        <TextField value={shot.label ?? ""} placeholder="Label" onCommit={(v) => editShot((s) => void (s.label = v || undefined))} />
        {r && (
          <dl>
            <dt>Plays</dt>
            <dd className="mono">
              {formatTime(r.start)} → {formatTime(r.end)} <span className="dim">({(r.end - r.start).toFixed(2)}s)</span>
            </dd>
            <dt>Starts on</dt>
            <dd><AnchorChip anchor={shot.start} fallback={list.indexOf(shot) ? "end of previous shot" : "start of cut"} /></dd>
            <dt>Ends on</dt>
            <dd>
              <AnchorChip anchor={shot.end} fallback={shot.duration !== undefined ? `${shot.duration}s after start` : next ? `${next.id} starts` : "end of cut"} />
            </dd>
            <dt>Content</dt>
            <dd>{shotSummary(shot, assets)}</dd>
            {shot.transition && (
              <>
                <dt>Transition</dt>
                <dd>{shot.transition.kind}</dd>
              </>
            )}
            {shot.only && (
              <>
                <dt>Formats</dt>
                <dd>{shot.only.map((f) => p.formats.find((x) => x.id === f)?.label).join(", ")} only</dd>
              </>
            )}
          </dl>
        )}
        {(shot.content.kind === "placeholder" || shot.content.kind === "generated") && <Takes key={shot.id} shot={shot} seconds={r ? r.end - r.start : undefined} />}
        <SceneProps shot={shot} />
        <ShotTiming shot={shot} />
        <label>
          Intent
          <TextField multiline value={shot.intent ?? ""} placeholder="What this shot is for" onCommit={(v) => editShot((s) => void (s.intent = v || undefined))} />
        </label>
        <ShotLook shot={shot} />
        <ShotKeys shot={shot} />
        <ShotFrame shot={shot} />
        <ShotGrade shot={shot} />
        <NotesFor />
      </div>
    );
  }

  if (sel?.kind === "asset") {
    const a = p.assets.find((x) => x.id === sel.id);
    if (!a) return <Empty>That asset no longer exists.</Empty>;
    return (
      <>
        <AssetView a={a} />
        <div className="inspector">
          <NotesFor />
        </div>
      </>
    );
  }

  // Not keyed by id: naming a new member changes its id, and the panel stays put while you go on typing.
  if (sel?.kind === "cast") return <CastView id={sel.id} />;

  if (sel?.kind === "line") {
    const l = p.voice?.lines.find((x) => x.id === sel.id);
    const r = tl.lines.find((x) => x.id === sel.id);
    if (!l) return <Empty>That line no longer exists.</Empty>;
    const editLine = (fn: (x: NonNullable<typeof l>) => void) => actions.edit((d) => fn(d.voice!.lines.find((x) => x.id === l.id)!));
    return (
      <div className="inspector">
        <div className="insp-head"><span className="mono dim">{l.id}</span><span className="pill">Line</span></div>
        <TextField multiline value={l.text} placeholder="What it says" onCommit={(v) => v.trim() && editLine((x) => void (x.text = v.trim()))} />
        <TextField value={l.tts ?? ""} placeholder="Spoken as (when it differs: numbers, names)" onCommit={(v) => editLine((x) => void (x.tts = v.trim() || undefined))} />
        <LineVoice p={p} l={l} />
        <dl>
          <dt>Plays</dt>
          <dd className="mono">{r ? `${formatTime(r.start)} → ${formatTime(r.end)}` : "not in this format"}</dd>
          <dt>Audio</dt>
          <dd className="mono small line-file" title={l.file}>
            {(l.file ? pathParts(l.file).pop() : undefined) ?? "none yet"}
          </dd>
        </dl>
        <h4>Words</h4>
        <div className="chips">
          {(r?.words ?? []).map((w, i) => (
            <button key={i} className="chip" onClick={() => actions.seek(w.s)} title={formatTime(w.s)}>{w.w}</button>
          ))}
        </div>
        <NotesFor />
      </div>
    );
  }

  if (sel?.kind === "cue") {
    const c = p.music?.cues.find((x) => x.id === sel.id);
    const r = tl.cues.find((x) => x.id === sel.id);
    if (!c) return <Empty>That cue no longer exists.</Empty>;
    return (
      <div className="inspector">
        <div className="insp-head"><span className="mono dim">{c.id}</span><span className="pill">Music</span></div>
        <h3>{assets.get(c.asset)?.label}</h3>
        <dl>
          <dt>In the cut</dt>
          <dd className="mono">{r ? `${formatTime(r.start)} → ${formatTime(r.end)}` : "not in this format"}</dd>
          <dt>From the track</dt>
          <dd className="mono">{r ? formatTime(r.trackFrom) : "—"}{c.to !== undefined && ` to ${formatTime(c.to)}`}</dd>
          {c.sync && (<><dt>Lands</dt><dd>track {formatTime(c.sync.track)} on <AnchorChip anchor={c.sync.at} /></dd></>)}
          {c.end && (<><dt>Ends on</dt><dd><AnchorChip anchor={c.end} /></dd></>)}
        </dl>
        <NotesFor />
      </div>
    );
  }

  return <ProjectOverview p={p} tl={tl} />;
}

function ProjectOverview({ p, tl }: { p: Project; tl: Timeline }) {
  return (
    <div className="inspector">
      <h3>{p.title}</h3>
      <dl>
        <dt>Recipe</dt>
        <dd>{p.recipe}</dd>
        <dt>Spine</dt>
        <dd>{p.spine}</dd>
        <dt>Length</dt>
        <dd>{formatTime(tl.duration)}</dd>
        <dt>Shots</dt>
        <dd>{tl.shots.length} in this format</dd>
      </dl>
      {tl.diagnostics.length > 0 ? (
        <>
          <h4 className="warn">Timing problems</h4>
          <ul className="plain">
            {tl.diagnostics.map((d, i) => (
              <li key={i}><strong>{d.where}</strong>: {d.message}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="dim small">Every anchor resolves. Select a shot, line, music cue or asset to inspect it.</p>
      )}
      <NarrationOverview p={p} />
      <LookPanel p={p} />
    </div>
  );
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/**
 * Smooth slow motion: the stretch of the clip the shot plays, given the frames in between (RIFE, on this computer) so
 * there's a new frame for every one the cut shows, as a version the shot shows in its place.
 */
async function smooth(shot: Shot, tl: Timeline) {
  const { project, projectId, cutId } = getState();
  const r = tl.shots.find((x) => x.id === shot.id);
  const c = shot.content;
  if (!project || !projectId || !r || c.kind !== "clip") return;
  const a = project.assets.find((x) => x.id === c.asset);
  const speed = c.speed ?? 1;
  const from = r.sourceIn ?? c.in ?? 0;
  const fps = Math.min(120, Math.round((a?.fps ?? 30) / speed));
  setState({ hint: "Making the frames in between (RIFE)…" });
  try {
    await actions.flushSave();
    await actions.quietly(() => runJob(`/api/projects/${projectId}/restore`, { asset: c.asset, from: Math.max(0, from - 0.5), to: from + (r.end - r.start) * speed + 0.5, steps: { fps }, use: true, cut: cutId }));
    await actions.reload();
    setState({ hint: `Smooth: ${fps} frames a second of it, played at ${speed}×.` });
  } catch (err) {
    setState({ hint: `Couldn't make it smooth: ${err instanceof Error ? err.message : String(err)}` });
  }
}

/**
 * A shot's timing and sound, set by hand: how fast its footage plays, how loud, its fades, how long its entrance
 * takes, and whether it's locked.
 */
function ShotTiming({ shot }: { shot: Shot }) {
  const p = useProject();
  const tl = useTimeline();
  const editShot = (fn: (s: Shot) => void) => actions.edit((d) => fn(d.shots.find((s) => s.id === shot.id)!));
  const c = shot.content;
  const clip = c.kind === "clip" ? c : undefined;
  const a = clip ? p.assets.find((x) => x.id === clip.asset) : undefined;
  const video = a?.kind === "video";
  const underMusic = !!p.music?.cues.length;
  const num = (v: string) => (v.trim() === "" ? undefined : Math.max(0, Number(v)));
  return (
    <div className="shot-look">
      <h4>Timing &amp; sound</h4>
      {clip && video && (
        <div className="look-row">
          <label title="How fast the footage plays; the shot keeps its place in the cut">
            Speed
            <select value={String(clip.speed ?? 1)} onChange={(e) => editShot((s) => s.content.kind === "clip" && void (Number(e.target.value) === 1 ? delete s.content.speed : (s.content.speed = Number(e.target.value))))}>
              {[...new Set([...SPEEDS, clip.speed ?? 1])].sort((x, y) => x - y).map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
          <label title={underMusic && clip.volume === undefined ? "Quiet under the music until you give it a volume" : "How loud its own sound plays"}>
            Volume {clip.volume === undefined ? (underMusic ? "(off under music)" : "") : `${Math.round(clip.volume * 100)}%`}
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={clip.volume ?? (underMusic ? 0 : 1)}
              onChange={(e) => editShot((s) => s.content.kind === "clip" && void (s.content.volume = Number(e.target.value)))}
              onDoubleClick={() => editShot((s) => s.content.kind === "clip" && void delete s.content.volume)}
            />
          </label>
        </div>
      )}
      {clip && a?.angle && (
        <div className="look-row">
          <label title="Which camera it shows, from the same moment (the number keys cut to one at the playhead)">
            Angle
            <select value={clip.asset} onChange={(e) => actions.edit((d) => void switchAngle(d, tl, shot.id, e.target.value))}>
              {anglesOf(p, a.angle.group).map((x, k) => (
                <option key={x.id} value={x.id}>
                  {k + 1}. {x.label ?? x.id}
                </option>
              ))}
            </select>
          </label>
          <button className="small" style={{ alignSelf: "flex-end" }} onClick={() => void cutToTalkers(shot.id)} title="Cuts this run of shots so whoever's talking is on screen, each on the camera that hears them best">
            Cut to whoever's talking
          </button>
        </div>
      )}
      {clip && video && (
        <div className="look-row">
          <label title="The speed it ends at: slowing into a moment, or speeding out of one">
            Ramps to
            <select
              value={clip.ramp ? String(clip.ramp.to) : ""}
              onChange={(e) => editShot((s) => s.content.kind === "clip" && void (e.target.value ? (s.content.ramp = { ...(s.content.ramp ?? {}), to: Number(e.target.value) }) : delete s.content.ramp))}
            >
              <option value="">Steady</option>
              {SPEEDS.filter((v) => v !== (clip.speed ?? 1)).map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
          <label className="check" title="Holds the frame it starts on for the whole shot">
            <input type="checkbox" checked={!!clip.freeze} onChange={(e) => editShot((s) => s.content.kind === "clip" && void (e.target.checked ? (s.content.freeze = true) : delete s.content.freeze))} /> Freeze
          </label>
        </div>
      )}
      {clip && video && (clip.speed ?? 1) < 1 && !clip.ramp && !clip.freeze && (
        <p className="small dim">
          Slowed down, it repeats frames.{" "}
          <button className="link small" onClick={() => void smooth(shot, tl)} title="Makes the frames in between with RIFE on this computer, and shows them in the shot">
            Make it smooth
          </button>
        </p>
      )}
      {clip && video && (
        <div className="look-row">
          <label title="Seconds its sound starts before its picture: you hear them before you see them (a J-cut)">
            Sound early
            <input type="number" min={0} step={0.1} value={clip.lead ?? ""} placeholder="0" onChange={(e) => editShot((s) => s.content.kind === "clip" && void ((s.content.lead = num(e.target.value) || undefined) === undefined && delete s.content.lead))} />
          </label>
          <label title="Seconds its sound goes on after its picture, over the next shot (an L-cut)">
            Sound late
            <input type="number" min={0} step={0.1} value={clip.trail ?? ""} placeholder="0" onChange={(e) => editShot((s) => s.content.kind === "clip" && void ((s.content.trail = num(e.target.value) || undefined) === undefined && delete s.content.trail))} />
          </label>
        </div>
      )}
      {clip && video && (
        <div className="look-row">
          <label title="Seconds its sound fades up over">
            Fade in
            <input type="number" min={0} step={0.1} value={clip.fadeIn ?? ""} placeholder="0" onChange={(e) => editShot((s) => s.content.kind === "clip" && void ((s.content.fadeIn = num(e.target.value)) === undefined && delete s.content.fadeIn))} />
          </label>
          <label title="Seconds its sound fades away over">
            Fade out
            <input type="number" min={0} step={0.1} value={clip.fadeOut ?? ""} placeholder="0" onChange={(e) => editShot((s) => s.content.kind === "clip" && void ((s.content.fadeOut = num(e.target.value)) === undefined && delete s.content.fadeOut))} />
          </label>
        </div>
      )}
      <div className="look-row">
        {shot.transition && (
          <label title="How long its entrance takes, in seconds">
            Comes in over
            <input
              type="number"
              min={0.05}
              step={0.05}
              value={shot.transition.duration ?? ""}
              placeholder="0.35"
              onChange={(e) => editShot((s) => s.transition && void ((s.transition.duration = num(e.target.value)) === undefined && delete s.transition.duration))}
            />
          </label>
        )}
        <label className="check" title="A locked shot can't be changed by hand or by the agent">
          <input type="checkbox" checked={!!shot.locked} onChange={(e) => editShot((s) => void (e.target.checked ? (s.locked = true) : delete s.locked))} /> Locked
        </label>
      </div>
    </div>
  );
}

function NotesFor() {
  const p = useProject();
  const tl = useTimeline();
  const sel = useStore((s) => s.selection);
  const notes = p.notes.filter((n) => n.status !== "dismissed" && noteMatches(n, sel));
  return (
    <div className="notes-for">
      <h4>
        Notes here{" "}
        <button
          className="link"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            actions.noteOn(targetFromSelection(sel, p, tl, getState().playhead), { x: r.left - 120, y: r.bottom });
          }}
        >
          + Add
        </button>
      </h4>
      {notes.length ? notes.map((n) => <NoteCard key={n.id} n={n} compact />) : <p className="dim small">None yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
const STATUS_LABEL: Record<Note["status"], string> = { open: "Handed back", queued: "Attached", working: "With the agent", done: "Done", dismissed: "Dismissed" };

/** Every note on this cut: attached to your next message, with the agent, or done with its reply. */
function Notes() {
  const p = useProject();
  const groups: [string, Note[]][] = [
    ["Attached to your next message", p.notes.filter((n) => n.status === "queued")],
    ["Handed back", p.notes.filter((n) => n.status === "open")],
    ["With the agent", p.notes.filter((n) => n.status === "working")],
    ["Done", p.notes.filter((n) => n.status === "done").reverse()],
  ];
  return (
    <div className="notes">
      <p className="dim small notes-how">
        Note anything: press N for what's selected, right-click a shot, {WINDOWS ? "Shift-drag" : "⇧-drag"} along the ruler for a stretch, draw on the frame, or ✎ a clip in Media. Notes go with your next message to the agent.
      </p>
      <div className="note-groups">
        {groups.map(([title, list]) =>
          list.length ? (
            <section key={title}>
              <h4>
                {title} <span className="dim">{list.length}</span>
              </h4>
              {list.map((n) => (
                <NoteCard key={n.id} n={n} />
              ))}
            </section>
          ) : null,
        )}
        {!p.notes.length && <Empty>No notes on this cut yet.</Empty>}
      </div>
    </div>
  );
}

function NoteCard({ n, compact }: { n: Note; compact?: boolean }) {
  const p = useProject();
  const tl = useTimeline();
  const [editing, setEditing] = useState(false);
  const set = (fn: (x: Note) => void) => actions.edit((d) => fn(d.notes.find((x) => x.id === n.id)!));
  const t = noteTime(n, tl);
  const fmt = n.format ? p.formats.find((f) => f.id === n.format)?.label : undefined;
  return (
    <div className={`note-card st-${n.status}`}>
      <div className="note-meta">
        <button
          className="chip"
          onClick={() => {
            const s = selectionForTarget(n.target);
            if (s) actions.select(s);
            if (t !== undefined) actions.seek(t);
            if (n.format && n.format !== getState().format) actions.setFormat(n.format);
            setState({ side: "notes" });
          }}
        >
          {describeTarget(n.target, p)}
        </button>
        {t !== undefined && <span className="mono dim small">{formatTime(t)}</span>}
        {fmt && <span className="dim small">{fmt}</span>}
        {n.author === "reviewer" && <span className="pill" title="Left on a shared review">{n.by ?? "A reviewer"}</span>}
        {n.region && <span className="dim small" title="Points at part of the frame">▣</span>}
        <span className="spacer" />
        {!compact && <span className={`status st-${n.status}`}>{STATUS_LABEL[n.status]}</span>}
      </div>
      {editing || (!n.text && n.status !== "done") ? (
        <TextField
          multiline
          autoFocus={editing}
          value={n.text}
          placeholder="Describe the change for this area"
          onCommit={(v) => {
            set((x) => {
              x.text = v;
              if (x.status === "open" && !n.text && v.trim()) x.status = "queued";
            });
            setEditing(false);
          }}
        />
      ) : (
        <p className="note-text" onDoubleClick={() => n.status !== "done" && setEditing(true)}>{n.text}</p>
      )}
      {n.reply && <p className="note-reply"><span className="who">Agent</span> {n.reply}</p>}
      {!compact && (n.status === "queued" || n.status === "open") && (
        <div className="note-actions">
          {n.status === "open" && (
            <button className="link" onClick={() => set((x) => void (x.status = "queued"))} title="Attach it to your next message again">
              Try again
            </button>
          )}
          <button className="link" onClick={() => setEditing(true)}>Edit</button>
          <button className="link danger" onClick={() => actions.removeNote(n.id)}>Remove</button>
        </div>
      )}
    </div>
  );
}
