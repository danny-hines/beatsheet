import {
  buildBatch,
  describeTarget,
  FIDELITY,
  formatTime,
  type Fidelity,
  type Note,
  type Project,
  type Shot,
  type Timeline,
} from "@beatsheet/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENT_NAME, assetMap, FIDELITY_LABEL, hideBroken, KIND_LABEL, nextId, noteMatches, noteTime, posterUrl, selectionForTarget, shotSummary, stripUrl, targetFromSelection } from "../lib";
import { actions, getState, setState, useProject, useStore, useTimeline } from "../store";
import { AnchorChip, Empty, Stars, TextField } from "./ui";

export function SidePanel() {
  const side = useStore((s) => s.side);
  const project = useProject();
  const pending = project.notes.filter((n) => n.status === "queued" || n.status === "open").length;
  return (
    <>
      <div className="tabs">
        <button className={side === "inspect" ? "on" : ""} onClick={() => actions.setSide("inspect")}>
          Inspect
        </button>
        <button className={side === "notes" ? "on" : ""} onClick={() => actions.setSide("notes")}>
          Notes {pending > 0 && <span className="count">{pending}</span>}
        </button>
      </div>
      <div className="side-body">{side === "inspect" ? <Inspector /> : <Notes />}</div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function Inspector() {
  const p = useProject();
  const tl = useTimeline();
  const sel = useStore((s) => s.selection);
  const projectId = useStore((s) => s.projectId)!;
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
        <label>
          Intent
          <TextField multiline value={shot.intent ?? ""} placeholder="What this shot is for" onCommit={(v) => editShot((s) => void (s.intent = v || undefined))} />
        </label>
        <NotesFor />
      </div>
    );
  }

  if (sel?.kind === "asset") {
    const a = p.assets.find((x) => x.id === sel.id);
    if (!a) return <Empty>That asset no longer exists.</Empty>;
    const usedBy = p.shots.filter((s) => (s.content.kind === "clip" && s.content.asset === a.id) || (s.content.kind === "generated" && s.content.takes?.includes(a.id)));
    return (
      <div className="inspector">
        <div className="asset-hero" style={{ background: a.color ?? "#333" }}>
          {a.kind !== "music" && <img src={a.kind === "video" ? stripUrl(projectId, a.id) : posterUrl(projectId, a.id)} alt="" onError={hideBroken} />}
        </div>
        <h3>{a.label ?? a.id}</h3>
        <dl>
          <dt>File</dt>
          <dd className="mono small">{a.path}</dd>
          <dt>Kind</dt>
          <dd>{a.kind}</dd>
          {a.duration !== undefined && (<><dt>Length</dt><dd>{formatTime(a.duration)}</dd></>)}
          {a.width && (<><dt>Size</dt><dd>{a.width}×{a.height}</dd></>)}
          {a.grid && (<><dt>Grid</dt><dd>{a.grid.bpm} BPM, downbeat at {a.grid.downbeat}s</dd></>)}
          {a.provenance && (
            <>
              <dt>Source</dt>
              <dd>
                {a.provenance.source}
                {a.provenance.provider && ` · ${a.provenance.provider}`}
                {a.provenance.model && ` · ${a.provenance.model}`}
                {a.provenance.costUsd !== undefined && ` · $${a.provenance.costUsd.toFixed(2)}`}
              </dd>
            </>
          )}
          {a.provenance?.prompt && (<><dt>Prompt</dt><dd className="small">{a.provenance.prompt}</dd></>)}
        </dl>
        {a.kind !== "music" && <Stars rating={a.rating} onChange={(r) => actions.edit((d) => void (d.assets.find((x) => x.id === a.id)!.rating = r))} />}
        {a.moments && (
          <>
            <h4>Moments</h4>
            <ul className="plain">
              {a.moments.map((m) => (
                <li key={m.id}>
                  <span className="mono dim">{m.t.toFixed(1)}s</span> {m.label} {m.score !== undefined && <span className="dim">({Math.round(m.score * 100)}%)</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {a.sections && (
          <>
            <h4>Sections</h4>
            <ul className="plain">
              {a.sections.map((s) => (
                <li key={s.id}><span className="mono dim">{formatTime(s.start)}</span> {s.label}</li>
              ))}
            </ul>
          </>
        )}
        <h4>Used in</h4>
        {usedBy.length ? (
          <div className="chips">
            {usedBy.map((s) => (
              <button key={s.id} className="chip" onClick={() => actions.select({ kind: "shot", id: s.id })}>{s.id} · {s.label}</button>
            ))}
          </div>
        ) : (
          <p className="dim small">Not in the cut yet.</p>
        )}
        <NotesFor />
      </div>
    );
  }

  if (sel?.kind === "line") {
    const l = p.voice?.lines.find((x) => x.id === sel.id);
    const r = tl.lines.find((x) => x.id === sel.id);
    if (!l) return <Empty>That line no longer exists.</Empty>;
    return (
      <div className="inspector">
        <div className="insp-head"><span className="mono dim">{l.id}</span><span className="pill">Line</span></div>
        <p className="line-quote">{l.text}</p>
        {l.tts && <p className="dim small">Spoken as: {l.tts}</p>}
        <dl>
          <dt>Plays</dt>
          <dd className="mono">{r ? `${formatTime(r.start)} → ${formatTime(r.end)}` : "not in this format"}</dd>
          <dt>Audio</dt>
          <dd className="mono small">{l.file}</dd>
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
    </div>
  );
}

function NotesFor() {
  const p = useProject();
  const sel = useStore((s) => s.selection);
  const notes = p.notes.filter((n) => n.status !== "dismissed" && noteMatches(n, sel));
  return (
    <div className="notes-for">
      <h4>
        Notes here <button className="link" onClick={actions.compose}>+ Add</button>
      </h4>
      {notes.length ? notes.map((n) => <NoteCard key={n.id} n={n} compact />) : <p className="dim small">None yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
const STATUS_LABEL: Record<Note["status"], string> = { open: "Held", queued: "Next batch", working: "With agent", done: "Done", dismissed: "Dismissed" };

function Notes() {
  const p = useProject();
  const [showBatch, setShowBatch] = useState(false);
  const groups: [string, Note[]][] = [
    ["Next batch", p.notes.filter((n) => n.status === "queued")],
    ["Held back", p.notes.filter((n) => n.status === "open")],
    ["With the agent", p.notes.filter((n) => n.status === "working")],
    ["Done", p.notes.filter((n) => n.status === "done")],
  ];
  const queued = groups[0]![1].filter((n) => n.text.trim());
  return (
    <div className="notes">
      <Composer />
      <div className="note-groups">
        {groups.map(([title, list]) =>
          list.length ? (
            <section key={title}>
              <h4>{title} <span className="dim">{list.length}</span></h4>
              {list.map((n) => <NoteCard key={n.id} n={n} />)}
            </section>
          ) : null,
        )}
      </div>
      <div className="send">
        <button className="primary" disabled={!queued.length} onClick={() => setShowBatch(true)}>
          Send {queued.length || ""} to agent
        </button>
      </div>
      {showBatch && <BatchDialog notes={queued} onClose={() => setShowBatch(false)} />}
    </div>
  );
}

/** Compose requests already acted on, so remounting the tab doesn't steal focus again. */
let composeHandled = 0;

function Composer() {
  const p = useProject();
  const tl = useTimeline();
  const sel = useStore((s) => s.selection);
  const playhead = useStore((s) => s.playhead);
  const format = useStore((s) => s.format);
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const target = targetFromSelection(sel, p, tl, playhead);
  const compose = useStore((s) => s.compose);
  useEffect(() => {
    if (compose > composeHandled) {
      composeHandled = compose;
      ref.current?.focus();
    }
  }, [compose]);
  const add = () => {
    if (!text.trim()) return;
    // Assets aren't on the timeline, so a note about one has no playhead time.
    const at = target.kind === "asset" ? undefined : Math.round(getState().playhead * 100) / 100;
    actions.edit((d) => {
      d.notes.push({ id: nextId("n", d.notes), text: text.trim(), status: "queued", target, at, format, stage: getState().stage, author: "you", createdAt: new Date().toISOString() });
    });
    setText("");
  };
  return (
    <div className="composer">
      <div className="dim small">
        Note on <strong>{describeTarget(target, p)}</strong>{target.kind !== "asset" && <> at {formatTime(playhead)}</>}
      </div>
      <textarea
        ref={ref}
        value={text}
        placeholder="What should change? Enter adds it to the next batch."
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            add();
          }
          if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
        }}
      />
    </div>
  );
}

function NoteCard({ n, compact }: { n: Note; compact?: boolean }) {
  const p = useProject();
  const tl = useTimeline();
  const [editing, setEditing] = useState(false);
  const focused = useStore((s) => s.focusNote === n.id);
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
        {n.region && <span className="dim small" title="Points at part of the frame">▣</span>}
        <span className="spacer" />
        {!compact && <span className={`status st-${n.status}`}>{STATUS_LABEL[n.status]}</span>}
      </div>
      {editing || (!n.text && n.status !== "done") ? (
        <TextField
          multiline
          autoFocus={focused || editing}
          value={n.text}
          placeholder="Describe the change for this area"
          onCommit={(v) => {
            if (focused) setState({ focusNote: undefined });
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
      {!compact && n.status !== "done" && n.status !== "working" && (
        <div className="note-actions">
          {n.status === "queued" ? (
            <button className="link" onClick={() => set((x) => void (x.status = "open"))}>Hold back</button>
          ) : (
            <button className="link" onClick={() => set((x) => void (x.status = "queued"))}>Add to batch</button>
          )}
          <button className="link" onClick={() => setEditing(true)}>Edit</button>
          <button className="link danger" onClick={() => set((x) => void (x.status = "dismissed"))}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
type SendResult = { count: number; delivered: "muse" | "none"; agent?: { kind: "muse" | "other" }; message: string; error?: string };

function BatchDialog({ notes, onClose }: { notes: Note[]; onClose: () => void }) {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const agents = useStore((s) => s.agents);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [sending, setSending] = useState(false);
  const where = useStore((s) => s.list.find((x) => x.id === projectId)?.where ?? "examples");
  const batch = useMemo(() => buildBatch(p, notes, { file: `${where}/${projectId}/project.json` }), [p, projectId, notes, where]);
  const target = agents.find((a) => a.kind === "muse" && a.museSession);
  const someone = target ?? agents[0];
  const prompt = [
    `Address these ${notes.length} beatsheet notes on ${p.title}.`,
    `Edit ${batch.project.file}${p.codeRoot ? ` and the coded shots under ${p.codeRoot}` : ""}. Keep timing as anchors (words, beats, sections, shots), never raw timecodes.`,
    `When a note is handled, set its status to "done" and write a one-line "reply" saying what changed.`,
    "",
    "```json",
    JSON.stringify(batch, null, 2),
    "```",
  ].join("\n");
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };
  const send = async () => {
    setSending(true);
    try {
      await actions.flushSave();
      const res = await fetch("/api/agents/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: projectId }) });
      setResult((await res.json()) as SendResult);
    } finally {
      setSending(false);
    }
  };

  if (result) {
    const name = result.agent ? AGENT_NAME[result.agent.kind] : "your agent";
    return (
      <div className="modal-back" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{result.delivered === "none" ? "Notes marked as sent" : `Sent to ${name}`}</h3>
          {result.delivered !== "none" ? (
            <p>
              {result.count === 1 ? "It has the note and is working on it." : `It has the ${result.count} notes and is working on them.`} Each one moves to
              Done with a reply as it's handled.
            </p>
          ) : (
            <>
              <p>
                {result.error
                  ? `${name} couldn't be messaged (it may have been started without session messaging), so tell it:`
                  : agents.length
                    ? `${name} can't be messaged from here, so tell it:`
                    : "Muse Code isn't connected. Connect it from the top right, then tell it:"}{" "}
                <strong>“handle my beatsheet notes”</strong>. It picks up exactly these notes.
              </p>
              <div className="modal-actions">
                <button onClick={() => copy("handle my beatsheet notes")}>{copied ? "Copied" : "Copy that"}</button>
              </div>
            </>
          )}
          <div className="modal-actions">
            <span className="spacer" />
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Send {notes.length} note{notes.length === 1 ? "" : "s"} to {someone ? AGENT_NAME[someone.kind] : "your agent"}</h3>
        <p className="dim">
          {target
            ? `${AGENT_NAME[target.kind]} gets them right away and starts on them.`
            : someone
              ? `${AGENT_NAME[someone.kind]} is connected, but this session can't be messaged, so after sending, tell it “handle my beatsheet notes”.`
              : "Muse Code isn't connected yet. Sending marks the notes as sent; the next session you connect picks them up."}{" "}
          Each note goes with the shot, line or frame area it points at, so the agent opens only what it needs.
        </p>
        <details>
          <summary className="small">What the agent gets</summary>
          <pre className="batch">{prompt}</pre>
        </details>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => copy(prompt)}>{copied ? "Copied" : "Copy as text"}</button>
          <span className="spacer" />
          <button className="primary" onClick={send} disabled={sending}>
            {sending ? "Sending…" : target ? `Send to ${AGENT_NAME[target.kind]}` : "Mark as sent"}
          </button>
        </div>
      </div>
    </div>
  );
}
