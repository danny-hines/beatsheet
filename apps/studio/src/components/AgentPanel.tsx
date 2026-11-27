import type { AgentApproval, AgentId, AgentItem, AgentQueued } from "@beatsheet/engine";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AGENT_NAMES, toolCallWords } from "../lib";
import { actions, agentFor, useProject, useStore } from "../store";
import { AgentChooser, AgentHead, TerminalSessions } from "./AgentMenu";
import { AgentWorkField } from "./AgentMotion";
import { AttachedNotes } from "./NoteEditor";
import { answer, TurnCard, useTurn } from "./Turn";
import { Icon } from "./Icon";

/** The Agent tab: this project's hosted session, live. Its messages, what it's doing, what it needs approved, and a box to talk to it. */
export function AgentPanel() {
  const view = useStore((s) => agentFor(s));
  const projectId = useStore((s) => s.projectId);
  const cutId = useStore((s) => s.cutId);
  const cuts = useStore((s) => s.doc?.cuts);

  // Within a project, each cut has its own conversation. One busy on another cut stays there; one that's done gives way to this cut's.
  if (view.project === projectId && view.cut && view.cut !== cutId && view.status !== "off") {
    const other = cuts?.find((c) => c.id === view.cut);
    const name = view.agent ? AGENT_NAMES[view.agent] : "The agent";
    if (view.status === "running" || view.status === "starting")
      return (
        <div className="agent-empty">
          <h3>Agent</h3>
          <p className="dim">
            {name} is working on the cut <strong>{other?.name ?? view.cut}</strong>.{" "}
            <button className="link" onClick={() => actions.visitCut(view.cut!)}>
              Go to it
            </button>
          </p>
          <p className="dim small">Each cut has a conversation of its own. This one's picks up once {name} hands that cut back.</p>
        </div>
      );
    return <NoSession error={view.error} note={other ? `Each cut has a conversation of its own; "${other.name}" keeps its.` : undefined} />;
  }

  if (!view.sessionId && view.status !== "starting") return <NoSession error={view.error} />;

  return <SessionChat />;
}

const EMPTY_ITEMS: AgentItem[] = [];
const EMPTY_QUEUED: AgentQueued[] = [];

function latestToolId(items: AgentItem[]) {
  for (let i = items.length - 1; i >= 0; i--) if (items[i]!.kind === "tool") return items[i]!.id;
  return undefined;
}

/** Triggers motion pulses when new tool calls arrive and a warm gold hand-off wash when working settles. */
function useAgentMotion(working: boolean, items: AgentItem[]) {
  const [pulseKey, setPulseKey] = useState(0);
  const [handoffKey, setHandoffKey] = useState(0);
  const prevWorking = useRef(working);
  const lastTool = useRef<string | undefined>(latestToolId(items));

  useEffect(() => {
    const id = latestToolId(items);
    if (id && id !== lastTool.current) {
      lastTool.current = id;
      setPulseKey((k) => k + 1);
    }
  }, [items]);

  useEffect(() => {
    if (prevWorking.current && !working) setHandoffKey((k) => k + 1);
    prevWorking.current = working;
  }, [working]);

  return { pulseKey, handoffKey };
}

function SessionChat() {
  const view = useStore((s) => agentFor(s));
  const turn = useTurn();
  const running = view.status === "running";
  const working = running || view.status === "starting";
  const yourTurn = !working && turn.who === "you" && !turn.elsewhere && (!!turn.ask || !!turn.changes?.length);
  const { pulseKey, handoffKey } = useAgentMotion(working, view.items);
  return (
    <div className={`agent-chat ${view.agent ?? ""} ${working ? "working" : ""} ${yourTurn ? "your-turn" : ""}`}>
      <AgentWorkField working={working} pulseKey={pulseKey} handoffKey={handoffKey} />
      <AgentHead session working={working} pulseKey={pulseKey} handoffKey={handoffKey} />
      <Transcript
        items={view.items}
        queued={view.queued ?? EMPTY_QUEUED}
        running={running}
        starting={view.status === "starting"}
        waiting={view.approvals.length > 0}
        heardAt={view.heardAt}
        agentId={view.agent}
        agent={(view.agent && AGENT_NAMES[view.agent]) || "The agent"}
      />
      {view.approvals.length > 0 && (
        <div className="agent-approvals">
          {view.approvals.map((a) => (
            <ApprovalCard key={a.id} a={a} />
          ))}
        </div>
      )}
      {view.error && <p className="warn small agent-error">{view.error}</p>}
      {!running && <TurnCard />}
      <Composer running={running} disabled={view.status === "starting" || view.status === "error"} />
    </div>
  );
}

/** No session yet: who'll pick up (the default agent, in the head, whose menu has every agent, model and earlier session), or the full choice when there's no default. */
function NoSession({ error, note }: { error?: string; note?: string }) {
  const preferred = useStore((s) => s.setup?.settings.agent);
  const turn = useTurn();
  const working = turn.who === "agent" && !turn.stalled && !turn.elsewhere;
  const yourTurn = !working && turn.who === "you" && !turn.elsewhere && (!!turn.ask || !!turn.changes?.length);
  const { pulseKey, handoffKey } = useAgentMotion(working, EMPTY_ITEMS);
  return (
    <div className={`agent-chat ${working ? "working" : ""} ${yourTurn ? "your-turn" : ""}`}>
      <AgentWorkField working={working} pulseKey={pulseKey} handoffKey={handoffKey} />
      {preferred && <AgentHead session={false} working={working} pulseKey={pulseKey} handoffKey={handoffKey} />}
      <div className="agent-empty">
        {error && <p className="warn small">{error}</p>}
        <p className="dim small">{preferred ? "Picks up as soon as you send something. Nothing is running yet." : "Choose an agent to work with."}</p>
        {note && <p className="dim small">{note}</p>}
        {!preferred && (
          <>
            <TerminalSessions />
            <AgentChooser />
          </>
        )}
      </div>
      <span className="spacer" />
      <TurnCard />
      <Composer running={false} disabled={false} />
    </div>
  );
}

/** How long a busy agent can go without a word before the panel says so (a tool that's running is excused). */
const QUIET_MS = 3 * 60_000;

function Transcript({
  items,
  queued,
  running,
  starting,
  waiting,
  heardAt,
  agentId,
  agent,
}: {
  items: AgentItem[];
  queued: AgentQueued[];
  running: boolean;
  starting: boolean;
  waiting: boolean;
  heardAt?: string;
  agentId?: AgentId;
  agent: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const prevQueued = useRef(queued.length);
  const now = useNow(running);
  // When the transcript last moved: what the thinking line counts from.
  const last = items.at(-1);
  const shape = `${items.length}:${last?.status}:${last?.text?.length ?? 0}:${(last?.summary ?? []).join("").length}`;
  const moved = useRef({ shape, at: Date.now() });
  if (moved.current.shape !== shape) moved.current = { shape, at: Date.now() };
  // Newly queued messages always scroll into view so what the person just sent never feels lost.
  if (queued.length > prevQueued.current) pinned.current = true;
  prevQueued.current = queued.length;
  // Follow the conversation unless the person has scrolled up to read.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });
  const onScroll = () => {
    const el = ref.current!;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  const blankThought = last?.kind === "reasoning" && !last.text && !(last.summary ?? []).some(Boolean);
  const quiet = running && !waiting && (!last || last.status !== "running" || last.kind === "user" || blankThought);
  const toolRunning = items.some((x) => x.kind === "tool" && x.status === "running");
  const silent = running && !toolRunning && !waiting && heardAt ? now - new Date(heardAt).getTime() : 0;
  return (
    <div className="agent-transcript" ref={ref} onScroll={onScroll}>
      {starting && !items.length && <p className="dim small agent-wait">Starting…</p>}
      {items.map((item) => (
        <ItemView key={item.id} item={item} since={item === last ? moved.current.at : undefined} now={now} />
      ))}
      {quiet && (
        <div className="agent-thinking">
          <span className="dots" /> Thinking <span className="agent-elapsed">{elapsed(now - moved.current.at)}</span>
        </div>
      )}
      {silent > QUIET_MS && (
        <p className="agent-quiet small">
          No word from {agent} for {Math.floor(silent / 60_000)} min. It may still be thinking, or it may be stuck (a Mac that slept can drop its
          connection). If nothing changes, press Stop, then ask it to carry on.
        </p>
      )}
      {queued.map((q) => (
        <QueuedMessage key={q.id} item={q} running={running} agentId={agentId} />
      ))}
    </div>
  );
}

/** A message waiting in the queue while the agent works: shown right in the conversation with Send now and Remove. */
function QueuedMessage({ item, running, agentId }: { item: AgentQueued; running: boolean; agentId?: AgentId }) {
  const [busy, setBusy] = useState(false);
  const sending = !!item.sending;
  const notesOnly = !item.text && !!item.notes;
  const body = item.text || (notesOnly ? "" : item.display) || "";
  const statusLabel = sending ? "Sending…" : running ? "Queued" : "Queued · paused";
  const sendTip = !running
    ? "Send this message now"
    : agentId === "antigravity"
      ? "Stop the current turn and send this now"
      : "Send into the current turn right away";
  const removeTip = item.notes ? "Remove from queue and put its notes back in the composer" : "Remove from queue";
  return (
    <div className={`agent-user agent-queued ${sending ? "sending" : ""}`}>
      <div className="agent-queued-head">
        <span className="agent-queued-tag">
          {sending && <span className="spin" />}
          {statusLabel}
        </span>
        <span className="spacer" />
        <div className="agent-queued-actions">
          <button
            type="button"
            className="agent-queued-send"
            disabled={busy || sending}
            title={sendTip}
            onClick={async () => {
              setBusy(true);
              try {
                await actions.agentCommand("send-now", { id: item.id });
              } finally {
                setBusy(false);
              }
            }}
          >
            Send now
          </button>
          <button
            type="button"
            className="agent-queued-remove"
            disabled={busy}
            title={removeTip}
            onClick={async () => {
              setBusy(true);
              try {
                await actions.agentCommand("unqueue", { id: item.id });
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove
          </button>
        </div>
      </div>
      {item.display && item.text && <div className="agent-queued-display dim small">{item.display}</div>}
      {body && <div className="agent-queued-body">{body}</div>}
      {item.notes ? (
        <span className="agent-user-notes">
          {item.text ? `+ ${item.notes} note${item.notes === 1 ? "" : "s"}` : `${item.notes} attached note${item.notes === 1 ? "" : "s"}`}
        </span>
      ) : null}
    </div>
  );
}

/** The clock, ticking each second while `on`. */
function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function ItemView({ item, since, now }: { item: AgentItem; since?: number; now: number }) {
  switch (item.kind) {
    case "user":
      // The studio's own messages (the opening, a pick) show as what they did; what the person typed shows as typed.
      return (
        <>
          {item.display && <div className="agent-event">{item.display}</div>}
          {item.text && (
            <div className="agent-user">
              {item.text}
              {item.notes ? <span className="agent-user-notes">+ {item.notes} note{item.notes === 1 ? "" : "s"}</span> : null}
            </div>
          )}
        </>
      );
    case "assistant":
      return item.text ? <div className="agent-reply">{renderMarkdown(item.text)}</div> : null;
    case "reasoning":
      return <Reasoning item={item} />;
    case "tool":
      return <ToolCall item={item} took={since !== undefined && item.status === "running" && now - since > 5000 ? elapsed(now - since) : undefined} />;
    default:
      return item.text ? <div className="agent-tool dim small">{item.text}</div> : null;
  }
}

function Reasoning({ item }: { item: AgentItem }) {
  const text = (item.summary ?? []).filter(Boolean).join("\n\n") || item.text || "";
  if (!text) return null;
  const live = item.status === "running";
  return (
    <details className="agent-reasoning" open={live}>
      <summary>{live ? "Thinking…" : "Thought"}</summary>
      <div>{renderMarkdown(text)}</div>
    </details>
  );
}

function ToolCall({ item, took }: { item: AgentItem; took?: string }) {
  const { title, detail } = toolCallWords(item);
  return (
    <div className={`agent-tool ${item.status} ${item.server === "beatsheet" ? "ours" : ""}`} title={`${item.server ? `${item.server}.` : ""}${item.tool} ${typeof item.args === "string" ? item.args : JSON.stringify(item.args ?? "")}`}>
      <StatusIcon status={item.status} />
      <span className="agent-tool-title">{title}</span>
      {detail && <span className="dim agent-tool-detail">{detail}</span>}
      {took && <span className="agent-elapsed">{took}</span>}
      {item.error && item.status !== "done" && <div className="warn small agent-tool-fail">{item.error}</div>}
    </div>
  );
}

const StatusIcon = ({ status }: { status: AgentItem["status"] }) =>
  status === "running" ? <span className="spin" /> : <span className={`agent-tick ${status}`}><Icon name={status === "done" ? "check" : "close"} size={12} /></span>;

/**
 * Something the agent wants to do that needs an OK. A long command shows its first lines (all of it on request), and
 * the buttons stay in view however long it is.
 */
function ApprovalCard({ a }: { a: AgentApproval }) {
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const long = !!a.detail && (a.detail.length > 220 || a.detail.split("\n").length > 4);
  return (
    <div className="agent-approval">
      <strong>{a.title}</strong>
      {a.detail && <pre className={`agent-approval-detail ${long && !all ? "clamped" : ""}`}>{a.detail}</pre>}
      {long && (
        <button className="link small agent-approval-more" onClick={() => setAll(!all)}>
          {all ? "Show less" : "Show all"}
        </button>
      )}
      <div className="agent-start">
        {a.choices.map((c) => (
          <button
            key={c.id}
            className={c.primary ? "primary" : ""}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void actions.agentCommand("approval", { approvalId: a.id, choiceId: c.id });
            }}
          >
            {c.label}
          </button>
        ))}
        <span className="spacer" />
        <button className="link small" onClick={() => actions.setSettingsOpen(true, "agent")} title="Let the agent work without asking (Settings → Agent)">
          Stop asking…
        </button>
      </div>
    </div>
  );
}

function Composer({ running, disabled }: { running: boolean; disabled: boolean }) {
  const projectId = useStore((s) => s.projectId);
  const cutId = useStore((s) => s.cutId);
  const draftKey = `${projectId ?? ""}/${cutId ?? ""}`;
  const text = useStore((s) => s.agentDrafts[draftKey] ?? "");
  const setText = (next: string) => actions.setAgentDraft(draftKey, next);
  const ref = useRef<HTMLTextAreaElement>(null);
  // No autofocus: keys like Space and N belong to the player until the person clicks in here.
  const turn = useTurn();
  const attached = useProject().notes.filter((n) => n.status === "queued" && n.author === "you").length;
  // Whatever's typed, plus the attached notes, answers the turn: it goes to the session on this project, or starts the default agent.
  const send = () => {
    if (!text.trim() && !attached) return;
    void answer({ text });
    setText("");
  };
  return (
    <div className="agent-compose">
      <AttachedNotes />
      <div className="agent-compose-box">
        <textarea
          ref={ref}
          rows={2}
          value={text}
          disabled={disabled}
          placeholder={running ? "Working. Anything you send queues next…" : turn.who === "you" && turn.ask && !turn.elsewhere ? "Or reply in your own words…" : "Ask for a change…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
      </div>
      <div className="agent-compose-actions">
        <span className="dim small">{attached ? "" : "Enter to send · N to note what's selected"}</span>
        <span className="spacer" />
        {running && <button onClick={() => void actions.agentCommand("interrupt")}>Stop</button>}
        <button className="primary" disabled={disabled || (!text.trim() && !attached)} onClick={send}>
          {running
            ? attached
              ? `Queue with ${attached} note${attached === 1 ? "" : "s"}`
              : "Queue"
            : attached
              ? `Send with ${attached} note${attached === 1 ? "" : "s"}`
              : "Send"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
/** Just enough Markdown for chat replies: paragraphs, bullet and numbered lists, `code`, **bold** and fenced blocks. */
function renderMarkdown(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.startsWith("```"); i++) code.push(lines[i]!);
      i++;
      blocks.push(<pre key={blocks.length}>{code.join("\n")}</pre>);
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const list: string[] = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i]!); i++) list.push(lines[i]!.replace(/^\s*([-*]|\d+\.)\s/, ""));
      const items = list.map((l, j) => <li key={j}>{inline(l)}</li>);
      blocks.push(ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    } else if (!line.trim()) {
      i++;
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i]!.trim() && !lines[i]!.startsWith("```") && !/^\s*([-*]|\d+\.)\s/.test(lines[i]!); i++) para.push(lines[i]!.replace(/^#+\s*/, ""));
      blocks.push(<p key={blocks.length}>{inline(para.join("\n"))}</p>);
    }
  }
  return blocks;
}

function inline(text: string): ReactNode {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 3) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const label = link[1]!.replace(/^`|`$/g, "");
      const href = link[2]!;
      if (/^https?:\/\//.test(href))
        return (
          <a key={i} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        );
      return (
        <span key={i} className="agent-file-chip" title={href.replace(/^file:\/\//, "")}>
          {label}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
