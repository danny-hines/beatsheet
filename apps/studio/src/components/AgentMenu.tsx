import type { AgentId, AgentSessionSummary, Presence } from "@beatsheet/engine";
import { useEffect, useRef, useState } from "react";
import { AGENT_NAMES, agentActivity, modelName, sessionActivity, timeAgo, OS } from "../lib";
import { actions, useStore } from "../store";

/** Re-renders every `ms` so "12s ago" stays true. */
function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!ms) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Connect an agent: the session the studio hosts and what it's doing, a new one on a chosen agent and model, or an earlier one resumed. */
export function AgentMenu() {
  const view = useStore((s) => s.agent);
  const list = useStore((s) => s.agentList);
  const presence = useStore((s) => s.agents);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const projectId = useStore((s) => s.projectId);
  const projects = useStore((s) => s.list);
  const cutId = useStore((s) => s.cutId);
  const cuts = useStore((s) => s.doc?.cuts);
  // Sessions running in a terminal also load beatsheet's tools; list the ones on this project, apart from the one hosted here.
  const elsewhere = presence.filter((a) => !a.hosted && !(a.museSession && a.museSession === view.sessionId) && (!a.activity?.project || a.activity.project === projectId));
  const now = useNow(open && elsewhere.length ? 1000 : 0);

  useEffect(() => {
    if (!open) return;
    void actions.loadAgents();
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hosted = !!view.agent && view.status !== "off";
  // A session belongs to the project and cut it was started on; one elsewhere isn't this cut's agent.
  const otherCut = hosted && view.project === projectId && !!view.cut && view.cut !== cutId;
  const away = (hosted && !!view.project && view.project !== projectId) || otherCut;
  const awayTitle = otherCut ? `"${cuts?.find((c) => c.id === view.cut)?.name ?? view.cut}"` : (projects.find((p) => p.id === view.project)?.title ?? view.project);
  const name = view.agent ? AGENT_NAMES[view.agent] : "Agent";
  const model = modelName(list, view.agent, view.model);
  return (
    <div className="agent-menu" ref={ref}>
      <button className={`agent-button ${view.agent ?? ""} ${hosted ? "connected" : ""}`} onClick={() => setOpen(!open)}>
        <span className={`dot ${view.status === "running" || view.status === "starting" ? "pending" : hosted && view.status !== "error" ? "on" : "idle"}`} />
        {view.status === "starting" ? (
          `Starting ${name}…`
        ) : hosted ? (
          <>
            {name}
            {model && <span className="model-tag">{model}</span>}
            <span className="dim small activity">{away ? `on ${awayTitle}` : sessionActivity(view)}</span>
          </>
        ) : (
          "Connect agent"
        )}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="agent-panel">
          {hosted && (
            <section>
              <h4>In the studio{away ? `, on ${awayTitle}` : ""}</h4>
              <div className="agent-row">
                <div>
                  <span className={`dot ${view.status === "running" ? "pending" : view.status === "error" ? "idle" : "on"}`} /> <strong>{name}</strong>{" "}
                  {model && <span className="model-tag">{model}</span>} {view.name && <span className="dim small">{view.name}</span>}
                </div>
                <div className="small">{view.error ? <span className="warn">{view.error}</span> : sessionActivity(view)}</div>
                <div className="agent-start">
                  <button
                    onClick={() => {
                      if (otherCut) actions.setCut(view.cut!);
                      else if (away && view.project) location.hash = view.project;
                      actions.setSide("agent");
                      setOpen(false);
                    }}
                  >
                    {away ? `Go to ${awayTitle}` : "Open chat"}
                  </button>
                  <button onClick={() => void actions.agentCommand("stop")}>Disconnect</button>
                </div>
              </div>
            </section>
          )}
          {elsewhere.length > 0 && (
            <section>
              <h4>In a terminal</h4>
              {elsewhere.map((a) => (
                <TerminalRow key={a.pid} a={a} now={now} model={a.kind === "other" ? a.model : modelName(list, a.kind, a.model)} />
              ))}
            </section>
          )}
          <AgentChooser onChosen={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

let lastChoice: AgentId | undefined;
const remembered = (): AgentId | undefined => {
  try {
    return (localStorage.getItem("beatsheet.agent") as AgentId | null) ?? undefined;
  } catch {
    return undefined;
  }
};

/** Pick an agent, then start a session on one of its models or resume an earlier one. It runs here, in the Agent tab. */
export function AgentChooser({ onChosen }: { onChosen?: () => void }) {
  const projectId = useStore((s) => s.projectId);
  const cutId = useStore((s) => s.cutId);
  const view = useStore((s) => s.agent);
  const list = useStore((s) => s.agentList);
  const presence = useStore((s) => s.agents);
  const preferred = useStore((s) => s.setup?.settings.agent);
  // Until the person picks one here: the agent already open, then the last one chosen, then their default (which
  // may load after this first renders).
  const [picked, setPick] = useState<AgentId | undefined>();
  const pick = picked ?? view.agent ?? lastChoice ?? preferred?.id ?? remembered();
  const [sessions, setSessions] = useState<AgentSessionSummary[] | null>(null);
  const now = Date.now();

  useEffect(() => {
    if (!list) void actions.loadAgentList();
  }, [list]);
  const installed = list?.filter((a) => a.installed) ?? [];
  const agent = list?.find((a) => a.id === pick) ?? installed[0] ?? list?.[0];

  useEffect(() => {
    setSessions(null);
    if (!agent?.installed) return;
    let live = true;
    void fetch(`/api/agent/sessions?agent=${agent.id}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}${projectId && cutId ? `&cut=${encodeURIComponent(cutId)}` : ""}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((s: AgentSessionSummary[]) => live && setSessions(s));
    return () => {
      live = false;
    };
  }, [agent?.id, agent?.installed, projectId, cutId]);

  const go = (command: "start" | "resume", body: Record<string, unknown>) => {
    if (!agent) return;
    lastChoice = agent.id;
    try {
      localStorage.setItem("beatsheet.agent", agent.id);
    } catch {
      // private window; it just won't remember
    }
    actions.setSide("agent");
    void actions.agentCommand(command, { ...body, agent: agent.id, project: projectId, cut: projectId ? cutId : undefined });
    onChosen?.();
  };

  if (!list) return <p className="dim small">Looking for Muse Code, Codex and Claude Code…</p>;
  // Not the one open here, and not one already running in a terminal.
  const busy = new Set([view.sessionId, ...presence.map((a) => a.museSession)]);
  const resumable = sessions?.filter((s) => !busy.has(s.id));
  return (
    <div className={`agent-chooser ${agent?.id ?? ""}`}>
      <div className="agent-pick">
        {list.map((a) => (
          <button key={a.id} className={`${a.id} ${a.id === agent?.id ? "on" : ""} ${a.installed ? "" : "missing"}`} onClick={() => setPick(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      {!agent?.installed ? (
        <p className="small">
          {agent?.label} isn't installed on {OS.here}.{" "}
          <button className="link" onClick={() => actions.setSettingsOpen(true)}>
            Set it up
          </button>
        </p>
      ) : agent.error ? (
        <p className="warn small">{agent.label} didn't start: {agent.error}</p>
      ) : (
        <>
          <section>
            <h4>New session</h4>
            <div className="model-list">
              {agent.models?.map((m) => (
                <button key={m.id} className="model-option" onClick={() => go("start", { model: m.id === "default" ? undefined : m.id })}>
                  <strong>
                    {m.label}
                    {preferred?.id === agent.id && (preferred.model ?? agent.models?.find((x) => x.default)?.id) === m.id ? (
                      <span className="dim small"> · your default</span>
                    ) : (
                      m.default && !preferred && <span className="dim small"> · default</span>
                    )}
                  </strong>
                  {m.hint && <span className="dim small">{m.hint}</span>}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>Resume</h4>
            {!resumable ? (
              <p className="dim small">Looking for sessions…</p>
            ) : resumable.length ? (
              resumable.map((s) => (
                <button key={s.id} className="resume-option" onClick={() => go("resume", { session: s.id })}>
                  <span className="resume-prompt">{s.title ? (s.cutName ? `${s.title} · ${s.cutName}` : `${s.title} · from before cuts had their own`) : "Projects overview"}</span>
                  <span className="dim small">{[modelName(list, agent.id, s.model), s.name, timeAgo(s.updatedAt, now)].filter(Boolean).join(" · ")}</span>
                </button>
              ))
            ) : (
              <p className="dim small">No earlier {agent.label} sessions on this {projectId ? "cut" : "project"}.</p>
            )}
          </section>
        </>
      )}
      <p className="dim small">
        Runs here in the studio on your own {agent?.label ?? "agent"} sign-in, with beatsheet's tools and recipes loaded{projectId ? `, pointed at ${projectId}` : ""}.
      </p>
    </div>
  );
}

function TerminalRow({ a, now, model }: { a: Presence; now: number; model?: string }) {
  return (
    <div className={`agent-row ${a.kind}`}>
      <div>
        <span className="dot on" /> <strong>{AGENT_NAMES[a.kind]}</strong> {model && <span className="model-tag">{model}</span>}{" "}
        <span className="dim small">connected {timeAgo(a.startedAt, now)}</span>
      </div>
      <div className="small">{a.activity ? `${agentActivity(a)} · ${timeAgo(a.activity.at, now)}` : <span className="dim">Waiting for instructions</span>}</div>
    </div>
  );
}
