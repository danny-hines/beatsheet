import type { Job } from "@beatsheet/engine";
import { formatTime, type Brief, type CutSpec, type Reference } from "@beatsheet/schema";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { desktop, isTyping, OS, keys, WINDOWS } from "../lib";
import { actions, getState, timelineFor, useProject, useStore } from "../store";
import { keptReferences, ReferencesField } from "./References";
import { NumberField, TextField } from "./ui";

const list = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * A dialog over the editor. It's drawn at the top of the page, not inside whatever opened it: in the Mac app the top
 * bar is the window's drag handle, and fields inside it can't be clicked into.
 */
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <span className="spacer" />
          <button onClick={onClose}>Done</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** The brief: what the whole project is for, and what this cut is. The agent reads both. */
export function BriefDialog({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const b = p.brief;
  const set = (fn: (b: Brief) => void) => actions.edit((d) => fn(d.brief));
  const setSpec = (fn: (s: CutSpec) => void) => actions.edit((d) => fn(d.spec));
  return (
    <Dialog title="Brief" onClose={onClose}>
      <div className="np-grid">
        <div className="form">
          <h4>The project</h4>
          <label>
            Title
            <TextField value={p.title} onCommit={(v) => v.trim() && actions.edit((d) => void (d.title = v.trim()))} />
          </label>
          <label>
            Goal
            <TextField multiline value={b.goal} onCommit={(v) => set((x) => void (x.goal = v))} />
          </label>
          <label>
            Audience
            <TextField value={b.audience ?? ""} onCommit={(v) => set((x) => void (x.audience = v || undefined))} />
          </label>
          <label>
            Tone
            <TextField value={(b.tone ?? []).join(", ")} onCommit={(v) => set((x) => void (x.tone = list(v)))} placeholder="Comma-separated" />
          </label>
          <BriefReferences value={b.references ?? []} onCommit={(refs) => set((x) => void (x.references = refs.length ? refs : undefined))} />
          <label>
            Notes
            <TextField multiline value={b.notes ?? ""} onCommit={(v) => set((x) => void (x.notes = v || undefined))} />
          </label>
        </div>
        <div className="form">
          <h4>This cut · {p.cut.name}</h4>
          <label>
            Name
            <TextField value={p.cut.name} onCommit={(v) => v.trim() && actions.edit((d) => void (d.cut.name = v.trim()))} />
          </label>
          <label>
            What it's for
            <TextField value={p.spec.purpose ?? ""} onCommit={(v) => setSpec((x) => void (x.purpose = v || undefined))} placeholder="e.g. 30s sizzle for Instagram" />
          </label>
          <div className="row">
            <label>
              Target length
              <NumberField value={p.spec.targetLength} step={1} suffix="s" onCommit={(v) => setSpec((x) => void (x.targetLength = v))} />
            </label>
            <label>
              Longest allowed
              <NumberField value={p.spec.maxLength} step={1} suffix="s" onCommit={(v) => setSpec((x) => void (x.maxLength = v))} />
            </label>
          </div>
          <label>
            Audience, if different
            <TextField value={p.spec.audience ?? ""} onCommit={(v) => setSpec((x) => void (x.audience = v || undefined))} />
          </label>
          <label>
            Tone, if different
            <TextField value={(p.spec.tone ?? []).join(", ")} onCommit={(v) => setSpec((x) => void (x.tone = list(v).length ? list(v) : undefined))} />
          </label>
          {p.cut.origin && (
            <p className="dim small">
              {p.cut.origin.by === "agent" ? "The agent" : "You"} made this cut
              {p.cut.origin.from ? ` from ${getState().doc?.cuts.find((c) => c.id === p.cut.origin!.from)?.name ?? p.cut.origin.from}` : ""}
              {p.cut.origin.note ? `: ${p.cut.origin.note}` : "."}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * The brief's references, edited in place: typing changes a draft, and the brief takes it when you leave a field (or
 * add, remove or change the kind of one), so a description doesn't become an undo step per letter.
 */
function BriefReferences({ value, onCommit }: { value: Reference[]; onCommit: (refs: Reference[]) => void }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(draft);
  latest.current = draft;
  const saved = JSON.stringify(keptReferences(value));
  // Someone else (the agent, an undo) changed them: show theirs.
  useEffect(() => setDraft(value), [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (refs = latest.current) => JSON.stringify(keptReferences(refs)) !== saved && onCommit(keptReferences(refs));
  return (
    <div
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && commit()}
      onChange={(e) => (e.target as HTMLElement).tagName === "SELECT" && setTimeout(() => commit())}
    >
      <ReferencesField
        value={draft}
        onChange={(refs) => {
          setDraft(refs);
          // Adding an empty row waits for something in it; removing one counts straight away.
          if (refs.length < draft.length) commit(refs);
        }}
      />
    </div>
  );
}

/** Export: each format of the cut on screen, with a quick draft or a full-quality render. */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const open = p.notes.filter((n) => n.status === "open" || n.status === "queued" || n.status === "working").length;
  return (
    <Dialog title={`Export · ${p.cut.name}`} onClose={onClose}>
      {open > 0 && <p className="warn small">{open} notes on this cut are still open or with the agent.</p>}
      <div className="format-cards">
        {p.formats.map((f) => {
          const tl = timelineFor(p, f.id);
          const over = p.spec.maxLength !== undefined && tl.duration > p.spec.maxLength;
          return (
            <div key={f.id} className="card format-card">
              <span className="format-shape big" style={{ aspectRatio: `${f.width} / ${f.height}` }} />
              <div>
                <h3>{f.label}</h3>
                <div className="dim">
                  {f.width}×{f.height} · {f.fps} fps{f.platforms?.length ? ` · ${f.platforms.join(", ")}` : ""}
                </div>
                <div className={over ? "warn" : ""}>
                  {formatTime(tl.duration)} {p.spec.targetLength ? `(target ${formatTime(p.spec.targetLength)})` : ""}
                </div>
                {tl.diagnostics.length > 0 && <div className="warn">{tl.diagnostics.length} timing problems</div>}
                <RenderControls format={f.id} label={f.label} />
              </div>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

/**
 * Draft or full-quality export of one format. In the Mac app the person says where it goes and what it's called (the
 * folder is remembered), then can show it in Finder or open it; in a browser it lands in the project's out/ folder.
 */
function RenderControls({ format, label }: { format: string; label: string }) {
  const projectId = useStore((s) => s.projectId)!;
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const start = async (quality: "proxy" | "original") => {
    setError("");
    let saveAs: string | undefined;
    if (desktop?.saveVideo) {
      const { doc, cutId } = getState();
      const cut = doc?.cuts.find((c) => c.id === cutId);
      const name = `${[doc?.title, doc && doc.cuts.length > 1 ? cut?.name : undefined, label].filter(Boolean).join(" - ")}${quality === "proxy" ? " (draft)" : ""}.mp4`.replace(/[/:\\]/g, "-");
      const chosen = await desktop.saveVideo({ name, dir: lastExportDir() });
      if (!chosen) return;
      saveAs = chosen;
      rememberExportDir(chosen.slice(0, Math.max(chosen.lastIndexOf("/"), WINDOWS ? chosen.lastIndexOf("\\") : -1)));
    }
    const res = await fetch(`/api/projects/${projectId}/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cut: getState().cutId, format, quality, saveAs }) });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The export didn't start");
    let j = (await res.json()) as Job;
    setJob(j);
    while (j.status === "running") {
      await new Promise((r) => setTimeout(r, 700));
      j = (await (await fetch(`/api/jobs/${j.id}`)).json()) as Job;
      setJob(j);
    }
  };
  const output = WINDOWS ? job?.output?.replace(/\\/g, "/") : job?.output;
  const file = output?.split("/").pop();
  // Inside the project's out/ folder the page can play it; anywhere else, Finder and the person's own player can.
  const inProject = !!output?.includes(`/${projectId}/out/`);
  return (
    <div className="render">
      <div className="row">
        <button onClick={() => start("proxy")} disabled={job?.status === "running"} title="Fast, from the preview copies">
          Draft {label}
        </button>
        <button className="primary" onClick={() => start("original")} disabled={job?.status === "running"} title="Full quality, from the original footage">
          Render {label}
        </button>
      </div>
      {job?.status === "running" && (
        <div className="progress">
          <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
          <span>{Math.round(job.progress * 100)}%</span>
        </div>
      )}
      {(error || job?.status === "error") && <div className="warn small">{error || job?.error}</div>}
      {job?.status === "done" && file && (
        <div className="rendered">
          {inProject && <video src={`/media/${projectId}/out/${file}?v=${job.id}`} controls />}
          <div className="mono small dim">{job.output}</div>
          <div className="row">
            {desktop?.reveal && <button onClick={() => desktop!.reveal!(job.output!)}>Show in {OS.files}</button>}
            {desktop?.openFile && <button onClick={() => void desktop!.openFile!(job.output!)}>Open</button>}
            {!desktop && inProject && (
              <a className="button" href={`/media/${projectId}/out/${file}`} download={file}>
                Download
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["Space"], "Play / pause"],
  [["←", "→"], `Step a frame (${keys("⇧")} for a second)`],
  [["↑", "↓"], "Previous / next shot"],
  [["Home", "End"], "Start / end"],
  [["N"], "Note what's selected, or the shot under the playhead"],
  [["Drag on the frame"], "Note a part of the picture"],
  [["Drag on the timeline"], "Move the playhead"],
  [[WINDOWS ? "Shift-drag on the ruler" : "⇧ drag on the ruler"], "Note a stretch of the cut"],
  [["Esc"], "Clear the selection"],
  [[keys("⌘Z"), keys("⇧⌘Z")], "Undo / redo"],
  [[keys("⌘N")], `New project (${OS.app})`],
  [[keys("⇧⌘N")], `New cut (${OS.app})`],
  [[keys("⇧⌘O")], `All projects (${OS.app})`],
  [[keys("⌘E")], `Export (${OS.app})`],
  [["?"], "These shortcuts"],
];

/** The keyboard shortcuts, on ?. */
export function Shortcuts() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === "?") setOpen((o) => !o);
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={() => setOpen(false)}>
      <div className="modal shortcuts" onClick={(e) => e.stopPropagation()}>
        <h3>Shortcuts</h3>
        <dl>
          {SHORTCUTS.map(([k, what]) => (
            <div key={what}>
              <dt>
                {k.map((x) => (
                  <kbd key={x}>{x}</kbd>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** The folder the last export went to, so the next save dialog opens there. */
function lastExportDir(): string | undefined {
  try {
    return localStorage.getItem("beatsheet.exportDir") ?? undefined;
  } catch {
    return undefined;
  }
}
function rememberExportDir(dir: string) {
  try {
    localStorage.setItem("beatsheet.exportDir", dir);
  } catch {
    // private window; it just won't remember
  }
}
