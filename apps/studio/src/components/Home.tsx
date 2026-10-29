import type { TrashPlan } from "@beatsheet/engine";
import type { HandOff } from "@beatsheet/schema";
import { useEffect, useRef, useState } from "react";
import { AGENT_NAMES, desktop, hideBroken, pickPath, posterUrl, timeAgo, OS, keys, WINDOWS } from "../lib";
import { actions, useStore, type ProjectSummary } from "../store";
import { Mark, PopMenu } from "./ui";

/**
 * Where the app opens: start a project (from a folder, picked or dropped anywhere on the window, or from scratch),
 * or pick one up where it was left, with whose turn it is on each.
 */
export function Home() {
  const list = useStore((s) => s.list);
  const listed = useStore((s) => s.listed);
  const [dropping, setDropping] = useState(false);
  const [menu, setMenu] = useState<{ p: ProjectSummary; x: number; y: number }>();
  const [trashing, setTrashing] = useState<ProjectSummary>();
  const now = useNow();
  const mine = list.filter((p) => p.where !== "examples").sort((a, b) => (b.edited ?? "").localeCompare(a.edited ?? ""));
  const examples = list.filter((p) => p.where === "examples");

  const openFolder = async () => {
    const folder = await pickPath("folder");
    if (folder) actions.setNewProjectOpen(true, { folder });
  };
  // In the Mac app a footage folder can be dropped anywhere here.
  const drop = desktop && {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: (e: React.DragEvent) => !e.relatedTarget && setDropping(false),
    onDrop: (e: React.DragEvent) => {
      setDropping(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      actions.setNewProjectOpen(true, { folder: desktop!.pathFor(file) });
    },
  };

  return (
    <div className={`home ${dropping ? "dropping" : ""}`} {...drop}>
      <div className="home-bar" />
      <div className="home-body">
        <div className="home-page">
          <header className="home-head">
            <Mark />
            <h1>beatsheet</h1>
            <span className="spacer" />
            <button className="icon" onClick={() => actions.setSettingsOpen(true)} title={`Settings: agents, models and media services (${keys("⌘,")})`}>
              ⚙
            </button>
          </header>

          <section className="home-section">
            <h2>New project</h2>
            <div className="home-new">
              <button className="home-route" onClick={() => void openFolder()}>
                <FolderIcon />
                <span>
                  <strong>Open a footage folder</strong>
                  <span className="dim small">The agent goes through every clip and photo, then suggests a few directions to pick from.</span>
                </span>
              </button>
              <button className="home-route" onClick={() => actions.setNewProjectOpen(true, "scratch")}>
                <PlusIcon />
                <span>
                  <strong>Start from scratch</strong>
                  <span className="dim small">An empty project. Add footage whenever you're ready.</span>
                </span>
              </button>
            </div>
            {desktop && <p className="dim small home-hint">Or drop a folder of footage anywhere on this window.</p>}
          </section>

          <section className="home-section">
            <h2>Projects {mine.length > 0 && <span className="dim">{mine.length}</span>}</h2>
            {listed && !mine.length ? (
              <p className="dim home-empty">Nothing here yet. Your projects show up here, newest first.</p>
            ) : (
              <div className="home-grid">
                {mine.map((p) => (
                  <ProjectCard key={p.id} p={p} now={now} onMenu={(x, y) => setMenu({ p, x, y })} />
                ))}
              </div>
            )}
          </section>

          {examples.length > 0 && (
            <section className="home-section">
              <h2>Examples</h2>
              <div className="home-grid">
                {examples.map((p) => (
                  <ProjectCard key={p.id} p={p} now={now} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      {dropping && (
        <div className="home-drop">
          <FolderIcon />
          <strong>Drop to start a project from this folder</strong>
        </div>
      )}
      {menu && <CardMenu {...menu} onClose={() => setMenu(undefined)} onTrash={() => setTrashing(menu.p)} />}
      {trashing && <TrashDialog p={trashing} onClose={() => setTrashing(undefined)} />}
    </div>
  );
}

/** A project: a few of its pictures, what's in it, whose turn it is, and when it last changed. */
function ProjectCard({ p, now, onMenu }: { p: ProjectSummary; now: number; onMenu?: (x: number, y: number) => void }) {
  const agent = useStore((s) => s.agent);
  const posters = p.posters ?? [];
  const working = agent.project === p.id && (agent.status === "running" || agent.status === "starting");
  const count = (n: number | undefined, one: string) => (n ? `${n} ${one}${n === 1 ? "" : "s"}` : "");
  const facts = [count(p.videos, "video"), count(p.photos, "photo"), p.cuts > 1 ? `${p.cuts} cuts` : ""].filter(Boolean).join(" · ");
  const turn = working
    ? { tone: "agent", text: `${AGENT_NAMES[agent.agent ?? "other"]} is working` }
    : p.turn?.who === "agent"
      ? { tone: "agent", text: "Agent's turn" }
      : p.turn?.ask
        ? { tone: "you", text: `Your turn: ${askWords(p.turn.ask)}` }
        : undefined;
  return (
    <div
      className="project-card-wrap"
      onContextMenu={
        onMenu &&
        ((e) => {
          e.preventDefault();
          onMenu(e.clientX, e.clientY);
        })
      }
    >
      <button className="project-card" onClick={() => void actions.open(p.id)} title={`Open ${p.title}`}>
        <div className={`project-posters n${Math.min(posters.length, 3)}`}>
          {posters.slice(0, 3).map((x) => (
            <div key={x.asset} className="project-poster" style={x.color ? { background: x.color } : undefined}>
              <img src={posterUrl(p.id, x.asset)} alt="" loading="lazy" onError={hideBroken} />
            </div>
          ))}
          {!posters.length && <span className="dim small">No footage yet</span>}
        </div>
        <div className="project-card-body">
          <strong className="project-card-title">{p.title}</strong>
          <span className="dim small">{facts || "Empty"}</span>
          <span className="project-card-foot">
            {turn && (
              <span className={`project-turn ${turn.tone}`}>
                <span className={`dot ${working ? "pending" : "on"}`} />
                {turn.text}
              </span>
            )}
            <span className="spacer" />
            {p.edited && <span className="dim small">{timeAgo(p.edited, now)}</span>}
          </span>
        </div>
      </button>
      {onMenu && (
        <button
          className="project-more"
          title="More"
          aria-label={`More for ${p.title}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.right, r.bottom + 4);
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden>
            <circle cx="3.5" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="12.5" cy="8" r="1.4" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** A project's menu, from its ⋯ or a right-click. */
function CardMenu({ p, x, y, onClose, onTrash }: { p: ProjectSummary; x: number; y: number; onClose: () => void; onTrash: () => void }) {
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <PopMenu x={x} y={y} onClose={onClose}>
      <button role="menuitem" onClick={pick(() => void actions.open(p.id))}>
        Open
      </button>
      <button role="menuitem" onClick={pick(() => void revealProject(p.id))}>
        Show in {OS.files}
      </button>
      <hr />
      <button role="menuitem" className="danger" onClick={pick(onTrash)}>
        {WINDOWS ? "Move to the Recycle Bin…" : "Move to Trash…"}
      </button>
    </PopMenu>
  );
}

const revealProject = (id: string) => fetch("/api/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: id }) });

/** Says what moving a project to the Trash takes (its own folder) and what it leaves (the footage), then does it. */
function TrashDialog({ p, onClose }: { p: ProjectSummary; onClose: () => void }) {
  const agent = useStore((s) => s.agent);
  const [plan, setPlan] = useState<TrashPlan>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch(`/api/projects/${p.id}/trash`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (r.ok) setPlan(body as TrashPlan);
      else setError((body as { error?: string }).error ?? "Couldn't look in the project's folder");
    });
  }, [p.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onClose]);
  const working = agent.project === p.id && (agent.status === "running" || agent.status === "starting");
  const trash = async () => {
    setBusy(true);
    const why = await actions.trashProject(p.id);
    setBusy(false);
    if (why) setError(why);
    else onClose();
  };
  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal trash-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="trash-title">
        <h3 id="trash-title">Move “{p.title}” to the {OS.trash}?</h3>
        {!plan && !error && <p className="dim">Looking in its folder…</p>}
        {plan && (
          <>
            {plan.keeps.length > 0 && (
              <div className="trash-keeps">
                <strong>Your footage stays where it is.</strong>
                <span className="dim small">Nothing in {plan.keeps.length === 1 ? "this folder" : "these folders"} is touched:</span>
                {plan.keeps.map((k) => (
                  <code key={k} title={k}>
                    {tilde(k)}
                  </code>
                ))}
              </div>
            )}
            <p className="dim small">
              What goes is the project's own folder, {size(plan.bytes)}: its cuts, notes and turns, the previews, its copy of the song, exports
              {plan.made ? `, ${plan.recordings ? "" : "and "}${plan.made === 1 ? "one file" : `${plan.made} files`} made for it (cut-outs, clips)` : ""}
              {plan.recordings ? `, and ${plan.recordings === 1 ? "the recording" : `the ${plan.recordings} recordings`} you made in beatsheet` : ""}. {WINDOWS ? "You can restore it from the Recycle Bin." : "You can put it back from the Trash in Finder."}
            </p>
          </>
        )}
        {working && <p className="warn small">{AGENT_NAMES[agent.agent ?? "other"]} is working on it, and stops first.</p>}
        {(plan?.blocked || error) && <p className="warn small">{plan?.blocked || error}</p>}
        <div className="modal-actions">
          <button className="link" onClick={() => void revealProject(p.id)}>
            Show in {OS.files}
          </button>
          <span className="spacer" />
          <button onClick={onClose} disabled={busy} autoFocus>
            Cancel
          </button>
          <button className="danger" onClick={() => void trash()} disabled={!plan || !!plan.blocked || busy}>
            {busy ? "Moving…" : WINDOWS ? "Move to the Recycle Bin" : "Move to Trash"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Home folders as ~, the way Finder people read them (C:\Users\<name> too, on Windows). */
const tilde = (path: string) => (WINDOWS ? path.replace(/^[a-z]:\\Users\\[^\\]+(?=\\|$)/i, "~") : path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~"));
const size = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : "under 1 MB");

const askWords = (ask: HandOff) =>
  ask.kind === "choose" ? "pick a direction" : ask.kind === "review" ? "watch the cut" : ask.need === "song" ? "add a song" : ask.need === "footage" ? "add footage" : ask.need === "chrome" ? "let it use your Chrome" : ask.need === "cast" ? "add pictures" : "reply";

/** The time, every half minute, so "edited 3m ago" stays true while the list is open. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const FolderIcon = () => (
  <svg className="home-icon" viewBox="0 0 24 24" aria-hidden>
    <path
      d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg className="home-icon" viewBox="0 0 24 24" aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
