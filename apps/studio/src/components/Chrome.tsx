import type { AgentView } from "@beatsheet/engine";
import { useEffect, useRef, useState } from "react";
import { actions, useProject, useStore, useTimeline, type ProjectSummary } from "../store";
import { CutMenu } from "./Cuts";
import { BriefDialog, ExportDialog } from "./Dialogs";
import { TurnLine } from "./Turn";
import { AGENT_NAMES, keys, sessionActivity, timeAgo } from "../lib";
import { Icon } from "./Icon";

/**
 * The top bar: back to the projects, which project and cut, whose turn it is (the one thing to look at), then the format, and
 * the few things you do yourself: read the brief, export, undo.
 */
export function TopBar() {
  const p = useProject();
  const tl = useTimeline();
  const format = useStore((s) => s.format);
  const save = useStore((s) => s.save);
  const saveError = useStore((s) => s.saveError);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const mode = useStore((s) => s.mode);
  const [dialog, setDialog] = useState<"brief" | "export" | null>(null);
  useEffect(() => {
    const onExport = () => setDialog("export");
    window.addEventListener("beatsheet:export", onExport);
    return () => window.removeEventListener("beatsheet:export", onExport);
  }, []);
  return (
    <header className="topbar">
      <button className="icon home-back" onClick={() => void actions.goHome()} title={`All projects (${keys("⇧⌘O")})`} aria-label="All projects">
        <Icon name="back" />
      </button>
      <ProjectMenu />
      <CutMenu />
      <CutBack />
      <div className="segmented mode-switch" role="tablist" aria-label="Mode">
        <button role="tab" aria-selected={mode === "edit"} className={mode === "edit" ? "on" : ""} onClick={() => actions.setMode("edit")} title="Put the cut together">
          Edit
        </button>
        <button role="tab" aria-selected={mode === "make"} className={mode === "make" ? "on" : ""} onClick={() => actions.setMode("make")} title="Make stills and clips with your services">
          Make
        </button>
      </div>
      <span className="spacer" />
      <TurnLine />
      <span className="spacer" />
      {tl.diagnostics.length > 0 && (
        <span className="warn small" title={tl.diagnostics.map((d) => `${d.where}: ${d.message}`).join("\n")}>
          <Icon name="warn" size={14} /> {tl.diagnostics.length}
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
      <button onClick={() => setDialog("brief")} title="What the project is for, and what this cut is">
        Brief
      </button>
      <button className="primary" onClick={() => setDialog("export")} title="Render this cut">
        Export
      </button>
      <button className="icon" onClick={actions.undo} disabled={!canUndo} title={`Undo (${keys("⌘Z")})`}>
        <Icon name="undo" />
      </button>
      <button className="icon" onClick={actions.redo} disabled={!canRedo} title={`Redo (${keys("⇧⌘Z")})`}>
        <Icon name="redo" />
      </button>
      <button className="icon" onClick={() => actions.setSettingsOpen(true)} title="Settings: agents, models and media services">
        <Icon name="tune" />
      </button>
      <span className={`save save-${save}`} title={saveError ?? (save === "saved" ? "Saved" : undefined)} />
      {dialog === "brief" && <BriefDialog onClose={() => setDialog(null)} />}
      {dialog === "export" && <ExportDialog onClose={() => setDialog(null)} />}
    </header>
  );
}

/** After a link took the person to another cut (a blockout, a hand-off's option, the agent's cut): the way back. */
function CutBack() {
  const back = useStore((s) => s.back);
  const cutId = useStore((s) => s.cutId);
  const name = useStore((s) => (s.back ? s.doc?.cuts.find((c) => c.id === s.back!.cutId)?.name : undefined));
  if (!back || !name || back.cutId === cutId) return null;
  return (
    <button className="cut-back" onClick={actions.goBack} title={`Back to "${name}"${back.mode === "make" ? " in Make" : ""}, where you were`}>
      <Icon name="back" size={12} />
      <span className="cut-back-name">Back to {name}</span>
    </button>
  );
}

type ProjectStatus = { rank: number; tone: "warn" | "agent" | "you"; pending: boolean; text: string };

function projectStatus(p: ProjectSummary, session?: AgentView): ProjectStatus | undefined {
  const who = session?.agent ? AGENT_NAMES[session.agent] : "The agent";
  if (session && session.approvals.length > 0) return { rank: 0, tone: "warn", pending: true, text: `${who} needs your OK` };
  if (session && (session.status === "running" || session.status === "starting")) {
    const doing = sessionActivity(session);
    return { rank: 1, tone: "agent", pending: true, text: `${who} · ${doing}` };
  }
  if (session?.status === "error") return { rank: 2, tone: "warn", pending: false, text: `${who} stopped` };
  if (p.turn?.ask) return { rank: 3, tone: "you", pending: false, text: "Your turn" };
  if (p.turn?.who === "agent") return { rank: 4, tone: "agent", pending: false, text: "Agent's turn" };
  return undefined;
}

/**
 * The open project and a quick switcher for hopping between projects while their agents work in parallel. Shows a live
 * badge whenever another project needs approval, has an agent running, stopped with an error, or handed back its turn.
 */
function ProjectMenu() {
  const projectId = useStore((s) => s.projectId);
  const title = useStore((s) => s.doc?.title ?? projectId ?? "");
  const list = useStore((s) => s.list);
  const sessions = useStore((s) => s.agentSessions);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void actions.loadList();
    const outside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  // Every project to show in the switcher: the person's projects, plus the current one (even if an example) and any
  // project with a live hosted session.
  const rows: { p: ProjectSummary; session?: AgentView; status?: ProjectStatus }[] = [];
  const seen = new Set<string>();
  for (const p of list) {
    const session = sessions[p.id];
    const hasLive = !!session && session.status !== "off";
    if (p.where === "examples" && p.id !== projectId && !hasLive) continue;
    seen.add(p.id);
    rows.push({ p, session, status: projectStatus(p, session) });
  }
  for (const [id, session] of Object.entries(sessions)) {
    if (!id || seen.has(id) || session.status === "off") continue;
    const stub: ProjectSummary = { id, title: id, recipe: "", where: "projects", cuts: 1 };
    rows.push({ p: stub, session, status: projectStatus(stub, session) });
  }
  rows.sort((a, b) => {
    const ra = a.status?.rank ?? 9;
    const rb = b.status?.rank ?? 9;
    if (ra !== rb) return ra - rb;
    return (b.p.edited ?? "").localeCompare(a.p.edited ?? "");
  });

  // What's happening on *other* projects right now, so a background approval or hand-off never goes unnoticed.
  const others = rows.filter((r) => r.p.id !== projectId);
  const approvals = others.filter((r) => (r.session?.approvals.length ?? 0) > 0);
  const working = others.filter((r) => !(r.session?.approvals.length) && (r.session?.status === "running" || r.session?.status === "starting"));
  const errored = others.filter((r) => r.session?.status === "error");
  const yourTurn = others.filter((r) => !r.session?.approvals.length && r.session?.status !== "running" && r.session?.status !== "starting" && r.session?.status !== "error" && !!r.p.turn?.ask);

  const badge = approvals.length
    ? { tone: "warn" as const, pending: true, label: approvals.length === 1 ? "Needs OK" : `${approvals.length} OK`, tip: `Needs approval: ${approvals.map((r) => r.p.title).join(", ")}` }
    : working.length
      ? { tone: "agent" as const, pending: true, label: String(working.length), tip: `Working in the background: ${working.map((r) => r.p.title).join(", ")}` }
      : errored.length
        ? { tone: "warn" as const, pending: false, label: String(errored.length), tip: `Stopped: ${errored.map((r) => r.p.title).join(", ")}` }
        : yourTurn.length
          ? { tone: "you" as const, pending: false, label: String(yourTurn.length), tip: `Your turn: ${yourTurn.map((r) => r.p.title).join(", ")}` }
          : undefined;

  const pick = (r: (typeof rows)[number]) => {
    setOpen(false);
    if (r.p.id === projectId) return;
    if ((r.session?.approvals.length ?? 0) > 0) actions.setSide("agent");
    void actions.open(r.p.id);
  };

  return (
    <div className="cut-menu project-menu" ref={ref}>
      <button
        className="project-button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={badge ? `${title} — ${badge.tip}` : `${title} — switch project`}
      >
        <span className="project-name">{title}</span>
        {badge && (
          <span className={`project-activity ${badge.tone}`}>
            <span className={`dot ${badge.pending ? "pending" : "on"}`} />
            {badge.label}
          </span>
        )}
        <Icon name="down" size={10} className="caret" />
      </button>
      {open && (
        <div className="cut-panel project-panel">
          <div className="project-panel-list">
            {rows.map((r) => {
              const on = r.p.id === projectId;
              return (
                <div key={r.p.id} className={`cut-row ${on ? "on" : ""}`}>
                  <button className="cut-row-main" onClick={() => pick(r)}>
                    <span className="cut-check">{on && <Icon name="check" size={14} />}</span>
                    <span className="cut-row-text">
                      <span className="cut-row-name">{r.p.title}</span>
                      {r.status ? (
                        <span className={`project-row-status ${r.status.tone}`}>
                          <span className={`dot ${r.status.pending ? "pending" : "on"}`} />
                          {r.status.text}
                        </span>
                      ) : (
                        <span className="dim small">{[r.p.cuts > 1 ? `${r.p.cuts} cuts` : "", r.p.edited ? timeAgo(r.p.edited) : ""].filter(Boolean).join(" · ") || "Idle"}</span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
          <div className="project-panel-foot">
            <button
              className="cut-new"
              onClick={() => {
                setOpen(false);
                void actions.goHome();
              }}
            >
              All projects<span className="dim small">{keys("⇧⌘O")}</span>
            </button>
            <button
              className="cut-new"
              onClick={() => {
                setOpen(false);
                actions.setNewProjectOpen(true);
              }}
            >
              + New project…<span className="dim small">{keys("⌘N")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
