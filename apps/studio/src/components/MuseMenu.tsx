import type { MuseSession, Presence } from "@beatsheet/engine";
import { useEffect, useRef, useState } from "react";
import { agentActivity, modelLabel, MUSE_MODELS, timeAgo } from "../lib";
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

/** Connect Muse Code: what's connected and what it's doing, a new session on a chosen model, or a previous one resumed. */
export function MuseMenu() {
  const agents = useStore((s) => s.agents).filter((a) => a.kind === "muse");
  const muse = useStore((s) => s.muse);
  const projectId = useStore((s) => s.projectId);
  const [open, setOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [sessions, setSessions] = useState<MuseSession[] | null>(null);
  const [launching, setLaunching] = useState<{ startedAt: string; what: string } | null>(null);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const now = useNow(agents.length || launching ? 1000 : 0);

  useEffect(() => {
    if (!open) return;
    void actions.loadAgents();
    void fetch("/api/agents/sessions")
      .then((r) => r.json())
      .then((s: MuseSession[]) => setSessions(s));
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The launched session counts as connected once its beatsheet tools report in.
  useEffect(() => {
    if (launching && agents.some((a) => a.startedAt >= launching.startedAt)) setLaunching(null);
  }, [agents, launching]);

  const launch = async (body: { model?: string; session?: string }, what: string) => {
    setError("");
    const res = await fetch("/api/agents/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, project: projectId }) });
    const out = (await res.json()) as { startedAt?: string; error?: string };
    if (!res.ok || !out.startedAt) return setError(out.error ?? "Couldn't start Muse Code");
    setLaunching({ startedAt: out.startedAt, what });
    setChoosing(false);
  };

  const top = agents[0];
  return (
    <div className="agent-menu" ref={ref}>
      <button className={`agent-button muse ${top ? "connected" : ""}`} onClick={() => setOpen(!open)}>
        <span className={`dot ${top ? "on" : launching ? "pending" : "muse"}`} />
        {top ? (
          <>
            Muse Code
            {top.model && <span className="model-tag">{modelLabel(top.model)?.replace(/^Muse /, "")}</span>}
            {agents.length > 1 && <span className="dim"> +{agents.length - 1}</span>}
            {top.activity && <span className="dim small activity">{agentActivity(top)} · {timeAgo(top.activity.at, now)}</span>}
          </>
        ) : launching ? (
          "Starting Muse Code…"
        ) : (
          "Connect Muse Code"
        )}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="agent-panel">
          {!muse ? (
            <p className="small">
              Muse Code isn't installed on this Mac (no <span className="mono">muse</span> command). Install it, then come back here.
            </p>
          ) : (
            <>
              {agents.length > 0 && (
                <section>
                  <h4>Connected</h4>
                  {agents.map((a) => (
                    <SessionRow key={a.pid} a={a} now={now} />
                  ))}
                </section>
              )}
              {launching && (
                <p className="small pending-note">
                  Opening {launching.what} in Terminal. It connects here when it starts; approve the beatsheet tools if Muse asks the first time.
                </p>
              )}
              <section>
                <button className={`new-session ${choosing ? "on" : ""}`} onClick={() => setChoosing(!choosing)}>
                  <span>New session</span>
                  <span className="caret">{choosing ? "▴" : "▾"}</span>
                </button>
                {choosing && (
                  <div className="model-list">
                    {MUSE_MODELS.map((m) => (
                      <button key={m.id} className="model-option" onClick={() => launch({ model: m.id }, `a new ${m.label} session`)}>
                        <strong>{m.label}</strong>
                        {m.hint && <span className="dim small">{m.hint}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <section>
                <h4>Resume</h4>
                {sessions === null ? (
                  <p className="dim small">Looking for sessions…</p>
                ) : sessions.length ? (
                  sessions.map((s) => (
                    <button key={s.id} className="resume-option" onClick={() => launch({ session: s.id }, "your session")}>
                      <span className="resume-prompt">{s.title ?? "Projects overview"}</span>
                      <span className="dim small">
                        {modelLabel(s.model) ?? "Muse"} · {timeAgo(s.updatedAt, now)}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="dim small">No earlier sessions started from beatsheet yet.</p>
                )}
              </section>
              <p className="dim small">
                Opens in Terminal in the beatsheet folder with beatsheet's tools loaded{projectId ? `, pointed at ${projectId}` : ""}. Sessions you start yourself
                here show up too.
              </p>
            </>
          )}
          {error && <p className="warn small">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SessionRow({ a, now }: { a: Presence; now: number }) {
  return (
    <div className="agent-row">
      <div>
        <span className="dot on" /> <strong>Muse Code</strong> {a.model && <span className="model-tag">{modelLabel(a.model)}</span>}{" "}
        <span className="dim small">connected {timeAgo(a.startedAt, now)}</span>
      </div>
      <div className="small">{a.activity ? `${agentActivity(a)} · ${timeAgo(a.activity.at, now)}` : <span className="dim">Waiting for instructions</span>}</div>
    </div>
  );
}
