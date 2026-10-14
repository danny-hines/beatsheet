import { STAGE_IDS, type StageState } from "@beatsheet/schema";
import { STAGE_LABELS } from "../lib";
import { actions, useProject, useStore, useTimeline } from "../store";

export function TopBar() {
  const p = useProject();
  const tl = useTimeline();
  const list = useStore((s) => s.list);
  const projectId = useStore((s) => s.projectId);
  const format = useStore((s) => s.format);
  const save = useStore((s) => s.save);
  const saveError = useStore((s) => s.saveError);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  return (
    <header className="topbar">
      <span className="brand">beatsheet</span>
      <select className="project-pick" value={projectId} onChange={(e) => actions.open(e.target.value)}>
        {list.map((x) => (
          <option key={x.id} value={x.id}>{x.title}</option>
        ))}
      </select>
      <span className="pill pill-recipe">{p.recipe}</span>
      <span className="dim small">spine: {p.spine}</span>
      <span className="spacer" />
      {tl.diagnostics.length > 0 && (
        <span className="warn small" title={tl.diagnostics.map((d) => `${d.where}: ${d.message}`).join("\n")}>
          ⚠ {tl.diagnostics.length} timing {tl.diagnostics.length === 1 ? "problem" : "problems"}
        </span>
      )}
      {p.formats.length > 1 && (
        <div className="segmented" title="Each format resolves its own cut">
          {p.formats.map((f) => (
            <button key={f.id} className={f.id === format ? "on" : ""} onClick={() => actions.setFormat(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      {p.formats.length === 1 && <span className="dim small">{p.formats[0]!.label}</span>}
      <button onClick={actions.undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
      <button onClick={actions.redo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
      <span className={`save save-${save}`} title={saveError}>
        {save === "saved" ? "Saved" : save === "saving" ? "Saving…" : save === "dirty" ? "Unsaved" : "Not saved"}
      </span>
    </header>
  );
}

const STATUS_ICON: Record<StageState["status"], string> = { done: "✓", active: "●", todo: "○", skipped: "–" };

export function StageRail() {
  const p = useProject();
  const stage = useStore((s) => s.stage);
  return (
    <nav className="rail">
      {STAGE_IDS.map((id, i) => {
        const st = p.stages[id];
        return (
          <button key={id} className={`rail-item st-${st.status} ${stage === id ? "on" : ""}`} onClick={() => actions.setStage(id)}>
            <span className="rail-icon">{STATUS_ICON[st.status]}</span>
            <span className="rail-num">{i + 1}</span>
            <span className="rail-title">{STAGE_LABELS[id].title}</span>
            {st.locked && <span className="rail-lock" title="Locked">🔒</span>}
          </button>
        );
      })}
      <div className="rail-foot dim small">
        Shots move through stages on their own. A rough cut can sit next to a finished shot.
      </div>
    </nav>
  );
}

export function StageHeader() {
  const p = useProject();
  const stage = useStore((s) => s.stage);
  const st = p.stages[stage];
  const set = (patch: Partial<StageState>) => actions.edit((d) => void Object.assign(d.stages[stage], patch));
  return (
    <div className="stage-head">
      <div>
        <h2>
          {STAGE_LABELS[stage].title}
          {st.summary && <span className="stage-summary"> · {st.summary}</span>}
        </h2>
        <div className="dim small">{STAGE_LABELS[stage].blurb}</div>
      </div>
      <span className="spacer" />
      <select value={st.status} onChange={(e) => set({ status: e.target.value as StageState["status"] })}>
        <option value="todo">To do</option>
        <option value="active">In progress</option>
        <option value="done">Done</option>
        <option value="skipped">Skipped</option>
      </select>
      <button className={st.locked ? "on" : ""} onClick={() => set({ locked: !st.locked })} title="Locked stages are off limits to edits, including the agent's">
        {st.locked ? "🔒 Locked" : "Lock"}
      </button>
    </div>
  );
}
