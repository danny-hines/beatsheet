import { useEffect, useState } from "react";
import { actions, useProject, useStore, useTimeline } from "../store";
import { AgentMenu } from "./AgentMenu";
import { CutMenu } from "./Cuts";
import { BriefDialog, ExportDialog } from "./Dialogs";
import { TurnLine } from "./Turn";
import { keys } from "../lib";

/**
 * The top bar: back to the projects, which project and cut, whose turn it is (the one thing to look at), then the agent, the format, and
 * the few things you do yourself: read the brief, export, undo.
 */
export function TopBar() {
  const p = useProject();
  const tl = useTimeline();
  const title = useStore((s) => s.doc?.title);
  const format = useStore((s) => s.format);
  const save = useStore((s) => s.save);
  const saveError = useStore((s) => s.saveError);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [dialog, setDialog] = useState<"brief" | "export" | null>(null);
  useEffect(() => {
    const onExport = () => setDialog("export");
    window.addEventListener("beatsheet:export", onExport);
    return () => window.removeEventListener("beatsheet:export", onExport);
  }, []);
  return (
    <header className="topbar">
      <button className="icon home-back" onClick={() => void actions.goHome()} title={`All projects (${keys("⇧⌘O")})`} aria-label="All projects">
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="project-name" title={title}>
        {title}
      </span>
      <CutMenu />
      <span className="spacer" />
      <TurnLine />
      <span className="spacer" />
      {tl.diagnostics.length > 0 && (
        <span className="warn small" title={tl.diagnostics.map((d) => `${d.where}: ${d.message}`).join("\n")}>
          ⚠ {tl.diagnostics.length}
        </span>
      )}
      {p.formats.length > 1 && (
        <div className="segmented" title="Each format has its own timing">
          {p.formats.map((f) => (
            <button key={f.id} className={f.id === format ? "on" : ""} onClick={() => actions.setFormat(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      <AgentMenu />
      <button onClick={() => setDialog("brief")} title="What the project is for, and what this cut is">
        Brief
      </button>
      <button className="primary" onClick={() => setDialog("export")} title="Render this cut">
        Export
      </button>
      <button className="icon" onClick={actions.undo} disabled={!canUndo} title={`Undo (${keys("⌘Z")})`}>
        ↶
      </button>
      <button className="icon" onClick={actions.redo} disabled={!canRedo} title={`Redo (${keys("⇧⌘Z")})`}>
        ↷
      </button>
      <button className="icon" onClick={() => actions.setSettingsOpen(true)} title="Settings: agents, models and media services">
        ⚙
      </button>
      <span className={`save save-${save}`} title={saveError ?? (save === "saved" ? "Saved" : undefined)} />
      {dialog === "brief" && <BriefDialog onClose={() => setDialog(null)} />}
      {dialog === "export" && <ExportDialog onClose={() => setDialog(null)} />}
    </header>
  );
}
