import type { HandOff, ProjectFile } from "@beatsheet/schema";
import { useState } from "react";
import { AGENT_NAMES, pickFootage, pickPath, posterUrl, projectFileUrl, runJob, sessionActivity } from "../lib";
import { actions, getState, setState, useStore } from "../store";

/**
 * Whose move it is on the open project: the agent's (and what it's doing) or the person's (and what's asked).
 * `elsewhere` names the cut it's about when that isn't the one on screen.
 */
export function useTurn() {
  const doc = useStore((s) => s.doc);
  const agent = useStore((s) => s.agent);
  const projectId = useStore((s) => s.projectId);
  const cutId = useStore((s) => s.cutId);
  const preferred = useStore((s) => s.setup?.settings.agent);
  // An agent in a terminal working on this project (it isn't the studio's, so it doesn't show as a session here).
  const elsewhere = useStore((s) => s.agents.some((p) => !p.hosted && p.activity?.project === projectId && Date.now() - Date.parse(p.activity!.at) < 10 * 60_000));
  const here = !!agent.agent && agent.status !== "off" && agent.project === projectId;
  const working = here && (agent.status === "running" || agent.status === "starting");
  const turn = doc?.turn;
  const name = AGENT_NAMES[(here ? agent.agent : preferred?.id) ?? "other"] ?? "The agent";
  const about = turn?.cut && turn.cut !== cutId && (doc?.cuts.length ?? 0) > 1 ? { id: turn.cut, name: doc!.cuts.find((c) => c.id === turn.cut)?.name ?? turn.cut } : undefined;
  if (working) return { who: "agent" as const, name, line: sessionActivity(agent), here, elsewhere: about };
  // Its turn, but nothing's working on it for a while (beatsheet closed mid-turn, or the agent stopped): interrupted.
  const quiet = turn?.who === "agent" && !elsewhere && Date.now() - Date.parse(turn.since) > 8000;
  if (turn?.who === "agent" && quiet) return { who: "agent" as const, name, line: "stopped partway: carry on, or take the turn back", stalled: true, interrupted: true, here, elsewhere: about };
  if (turn?.who === "agent") return { who: "agent" as const, name, line: here ? "about to start" : "waiting for the agent to pick up", stalled: !here, here, elsewhere: about };
  return { who: "you" as const, name, ask: turn?.ask, line: turn?.ask ? askLine(turn.ask) : "tell the agent what to do next", here, changes: turn?.changes, undoable: !!turn?.before, elsewhere: about };
}

const askLine = (ask: HandOff) =>
  ask.kind === "choose"
    ? `pick ${ask.multiple ? "one or more" : "one"}: ${ask.message}`
    : ask.kind === "review"
      ? "watch the cut and leave notes"
      : ask.kind === "cast"
        ? `keep the cast you want: ${ask.message}`
        : `${ask.need === "song" ? "add a song" : ask.need === "footage" ? "add footage" : ask.need === "chrome" ? "let it use your Chrome" : ask.need === "cast" ? "add pictures" : "reply"}: ${ask.message}`;

/** One line in the top bar: whose turn it is and what that means right now. */
export function TurnLine() {
  const t = useTurn();
  return (
    <button
      className={`turn-line ${t.who}`}
      onClick={() => {
        if (t.elsewhere) actions.setCut(t.elsewhere.id);
        actions.setSide("agent");
      }}
      title={t.who === "you" ? "Your move" : "The agent is working; nothing is needed from you"}
    >
      <span className={`dot ${t.who === "agent" && !t.stalled ? "pending" : "on"}`} />
      <strong>{t.who === "agent" ? `${t.name}'s turn` : "Your turn"}</strong>
      <span className="turn-what">{t.elsewhere ? `on "${t.elsewhere.name}": ${t.line}` : t.line}</span>
    </button>
  );
}

/**
 * Sends the person's answer, with any notes they've attached on this cut: to the session on this project, or to a new
 * session of their default agent.
 */
export async function answer(body: { picks?: string[]; also?: Record<string, string[]>; text?: string; looksGood?: boolean; provided?: string; keep?: string[] }) {
  const { projectId, cutId } = getState();
  if (!projectId) return;
  await actions.flushSave();
  const res = await fetch("/api/turn/answer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: projectId, cut: cutId, notes: true, ...body }),
  });
  if (!res.ok) {
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    setState({ notice: out.error ?? "The agent didn't get that." });
    if (res.status === 409) actions.setSettingsOpen(true);
    return;
  }
  actions.setSide("agent");
}

/** Puts the project back to before the agent's last turn, after asking. */
async function undoTurn(name: string) {
  if (!window.confirm(`Undo everything ${name} did in its last turn? Edits you made since then are undone too.`)) return;
  const { projectId } = getState();
  const res = await fetch("/api/turn/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: projectId }) });
  if (!res.ok) setState({ notice: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't undo that turn." });
}

/**
 * The person's turn: what the agent's last turn changed (with a one-step undo), and what it asked for, answerable
 * right here or skipped.
 */
export function TurnCard() {
  const t = useTurn();
  // A turn belongs to its cut, like the conversation: elsewhere it's one line pointing there.
  if (t.elsewhere) {
    const waiting = t.who === "you" ? (t.ask ? `is waiting on you: ${t.line}` : undefined) : t.interrupted ? `: ${t.name} stopped partway` : undefined;
    if (!waiting) return null;
    return (
      <div className="turn-elsewhere small">
        <span className={`dot ${t.who === "you" ? "on" : "idle"}`} />
        <span>
          "{t.elsewhere.name}" {waiting}.
        </span>
        <button className="link small" onClick={() => actions.setCut(t.elsewhere!.id)}>
          Go to it
        </button>
      </div>
    );
  }
  if (t.who === "agent" && t.interrupted) return <Interrupted name={t.name} />;
  if (t.who !== "you" || (!t.ask && !t.changes?.length)) return null;
  const skip = async () => {
    const { projectId } = getState();
    await fetch("/api/turn/skip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: projectId }) });
  };
  return (
    <div className={`turn-card ${t.ask ? "" : "quiet"}`}>
      {t.changes?.length ? (
        <div className="turn-changes">
          <span className="dim small">{t.name === "The agent" ? "Last turn" : `${t.name}'s last turn`}:</span> <span className="small">{t.changes.join(" · ")}</span>
          {t.undoable && (
            <button className="link small" onClick={() => void undoTurn(t.name)} title="Put the project back to how it was before that turn">
              Undo that turn
            </button>
          )}
        </div>
      ) : null}
      {t.ask && (
        <>
          <div className="turn-card-head">
            <span className="dot on" /> <strong>Your turn</strong>
            <span className="spacer" />
            <button className="link small" onClick={() => void skip()} title="Set this question aside; you can still tell the agent what you want">
              Skip
            </button>
          </div>
          <p>{t.ask.message}</p>
          {t.ask.kind === "choose" ? <Choose ask={t.ask} /> : t.ask.kind === "review" ? <Review /> : t.ask.kind === "cast" ? <KeepCast ask={t.ask} /> : <Provide ask={t.ask} />}
        </>
      )}
    </div>
  );
}

/**
 * The agent's turn didn't finish (beatsheet was closed while it worked, or it stopped): carry on from where it was, in
 * the same conversation, or take the turn back.
 */
function Interrupted({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const pick = async (then: "continue" | "takeback") => {
    setBusy(true);
    await actions.flushSave();
    const res = await actions.quietly(() =>
      fetch("/api/agent/pickup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: getState().projectId, then }) }),
    );
    if (!res.ok) setState({ notice: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work." });
    setBusy(false);
  };
  return (
    <div className="turn-card interrupted">
      <div className="turn-card-head">
        <span className="dot idle" /> <strong>{name} stopped partway</strong>
      </div>
      <p className="small">
        Its turn didn't finish (beatsheet was closed while it was working, or it stopped), so anything it was waiting on didn't happen. Carry on and it picks up
        where it left off, or take the turn back to tell it something else.
      </p>
      <div className="turn-actions">
        <span className="spacer" />
        <button disabled={busy} onClick={() => void pick("takeback")}>
          Take the turn back
        </button>
        <button className="primary" disabled={busy} onClick={() => void pick("continue")}>
          Carry on
        </button>
      </div>
    </div>
  );
}

function Choose({ ask }: { ask: Extract<HandOff, { kind: "choose" }> }) {
  const [picked, setPicked] = useState<string[]>([]);
  // The card's other questions (the look to go with the directions), each picked on its own.
  const [also, setAlso] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const toggle = (multiple: boolean | undefined) => (p: string[], id: string) => (multiple ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]);
  return (
    <>
      <Options options={ask.options} picked={picked} onPick={(id) => setPicked((p) => toggle(ask.multiple)(p, id))} />
      {ask.questions?.map((q) => (
        <div key={q.id} className="turn-question">
          <p>{q.message}</p>
          <Options options={q.options} picked={also[q.id] ?? []} onPick={(id) => setAlso((a) => ({ ...a, [q.id]: toggle(q.multiple)(a[q.id] ?? [], id) }))} />
        </div>
      ))}
      <div className="turn-actions">
        <span className="dim small">{ask.multiple ? "Pick as many as you like; each becomes its own cut." : ""}</span>
        <span className="spacer" />
        <button
          className="primary"
          disabled={!picked.length || busy}
          onClick={async () => {
            setBusy(true);
            await answer({ picks: picked, also });
            setBusy(false);
          }}
        >
          {picked.length > 1 ? `Go with these ${picked.length}` : "Go with this"}
        </button>
      </div>
    </>
  );
}

type Option = Extract<HandOff, { kind: "choose" }>["options"][number];

const KINDS = { character: "Character", place: "Place", prop: "Prop" } as const;

/**
 * Who and what the agent found in the Library, each with the pictures it's in: the ones kept join the cast (or add their
 * pictures to the one already there with that id) as the answer goes.
 */
function KeepCast({ ask }: { ask: Extract<HandOff, { kind: "cast" }> }) {
  const projectId = useStore((s) => s.projectId);
  const cast = useStore((s) => s.doc?.cast);
  const [keep, setKeep] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));
  return (
    <>
      <div className="turn-options">
        {ask.proposals.map((p) => {
          const there = cast?.find((m) => m.id === p.id && m.kind !== "style");
          return (
            <button key={p.id} className={`turn-option ${keep.includes(p.id) ? "on" : ""}`} onClick={() => toggle(p.id)} aria-pressed={keep.includes(p.id)}>
              {projectId && (
                <span className="turn-board">
                  {p.assets.slice(0, 4).map((a) => (
                    <img key={a} src={posterUrl(projectId, a)} alt="" />
                  ))}
                </span>
              )}
              <span className="turn-option-text">
                <strong>
                  {p.name} <span className="dim small">@{p.id}</span>
                </strong>
                <span className="dim small">
                  {KINDS[p.kind]} · in {p.assets.length} picture{p.assets.length === 1 ? "" : "s"}
                  {there ? ` · adds to ${there.name || `@${there.id}`} in the cast` : ""}
                </span>
                {p.about && <span className="small">{p.about}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="turn-actions">
        <span className="dim small">Pick the ones to keep; they join Cast & sets with their pictures.</span>
        <span className="spacer" />
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await answer({ keep });
            setBusy(false);
          }}
        >
          {keep.length ? `Keep ${keep.length === ask.proposals.length && keep.length > 1 ? "all" : keep.length === 1 ? "this one" : `these ${keep.length}`}` : "Keep none"}
        </button>
      </div>
    </>
  );
}

/** One question's options: a few words each, with the frames, picture or cut that shows it. */
function Options({ options, picked, onPick }: { options: Option[]; picked: string[]; onPick: (id: string) => void }) {
  const projectId = useStore((s) => s.projectId);
  return (
    <div className="turn-options">
      {options.map((o) => (
        <button key={o.id} className={`turn-option ${picked.includes(o.id) ? "on" : ""}`} onClick={() => onPick(o.id)}>
          {projectId && o.image && <img className="turn-image" src={projectFileUrl(projectId, o.image)} alt="" />}
          {projectId && (o.assets?.length || o.asset) && (
            <span className="turn-board">
              {(o.assets?.length ? o.assets : [o.asset!]).slice(0, 4).map((a, i) => (
                <img key={`${a}-${i}`} src={posterUrl(projectId, a)} alt="" />
              ))}
            </span>
          )}
          <span className="turn-option-text">
            <strong>{o.label}</strong>
            {o.detail && <span className="dim small">{o.detail}</span>}
            {o.cut && (
              <span
                className="link small"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.setCut(o.cut!);
                }}
              >
                Watch it
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

function Review() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="turn-actions">
      <span className="dim small">Leave notes on anything you'd change and press Send, or:</span>
      <span className="spacer" />
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await answer({ looksGood: true });
          setBusy(false);
        }}
      >
        Looks good
      </button>
    </div>
  );
}

/**
 * The agent asked to work in the person's own signed-in Chrome: one click turns on Settings → Agent → Use my Chrome
 * (the session reopens with it) and tells the agent to go ahead.
 */
function UseChromeAnswer() {
  const [busy, setBusy] = useState(false);
  const on = useStore((s) => !!s.setup?.settings.chrome);
  const go = async () => {
    setBusy(true);
    try {
      if (!on) {
        const res = await fetch("/api/settings/chrome", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: true }) });
        if (!res.ok) throw new Error("Couldn't turn on Use my Chrome");
        await actions.loadSettings();
      }
      await answer({ provided: "I turned on Use my Chrome, so you can work in my signed-in Chrome now (I'm asked before you act on each site). Go ahead." });
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="turn-actions">
      <span className="dim small">You're asked before it acts on each site. Settings → Agent turns it off again.</span>
      <span className="spacer" />
      <button className="primary" disabled={busy} onClick={() => void go()}>
        {busy ? "Connecting…" : on ? "Go ahead in my Chrome" : "Use my Chrome"}
      </button>
    </div>
  );
}

/** Pictures of someone or somewhere only the person has (their cat, themselves, their street), for the cast. */
function CastPictures() {
  const [busy, setBusy] = useState("");
  const add = async () => {
    const paths = await pickFootage("files");
    if (!paths?.length) return;
    const { projectId, doc } = getState();
    const before = new Set(doc?.assets.map((a) => a.id));
    setBusy("Adding the pictures…");
    try {
      await runJob(`/api/projects/${projectId}/footage`, { paths });
      // The job only counts what it added; the project says which they are.
      const res = await fetch(`/api/projects/${projectId}`);
      const { project } = (await res.json()) as { project: ProjectFile };
      const added = project.assets.filter((a) => !before.has(a.id)).map((a) => a.id);
      await answer({ provided: added.length ? `I added ${added.length} picture${added.length === 1 ? "" : "s"}: ${added.join(", ")}.` : "Those pictures were already in the project." });
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="turn-actions">
      <span className="dim small">They're added to the project's footage, and the agent makes the cast from them.</span>
      <span className="spacer" />
      <button className="primary" disabled={!!busy} onClick={() => void add()}>
        {busy || "Add pictures…"}
      </button>
    </div>
  );
}

function Provide({ ask }: { ask: Extract<HandOff, { kind: "provide" }> }) {
  const [busy, setBusy] = useState("");
  // With ElevenLabs set up, the agent can make the song it described instead.
  const canMake = useStore((s) => !!s.setup?.services.find((x) => x.id === "elevenlabs")?.configured);
  if (ask.need === "chrome") return <UseChromeAnswer />;
  if (ask.need === "cast") return <CastPictures />;
  if (ask.need !== "song") return <p className="dim small">Reply below.</p>;
  const makeSong = async () => {
    setBusy("Asking for a song…");
    await answer({ provided: "Make the song you described with generate_music (one song, a few seconds longer than the cut), then build the cut to it." });
    setBusy("");
  };
  const chooseSong = async () => {
    const path = await pickPath("audio");
    if (!path) return;
    // The song is for the cut the agent asked about, which may not be the one on screen.
    const { projectId, cutId: shown, doc } = getState();
    const cutId = doc?.turn?.cut ?? shown;
    setBusy("Analysing the song…");
    try {
      const res = await fetch(`/api/projects/${projectId}/song`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file: path, cut: cutId }) });
      const out = (await res.json()) as { label?: string; bpm?: number; error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't use that song");
      await answer({ provided: `I added the song "${out.label}" (${out.bpm} BPM) as the music of cut ${cutId}.` });
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="turn-actions">
      <span className="dim small">{busy}</span>
      <span className="spacer" />
      {canMake && (
        <button disabled={!!busy} onClick={() => void makeSong()} title="The agent makes it with your ElevenLabs key (uses your ElevenLabs credits)">
          Make one
        </button>
      )}
      <button className="primary" disabled={!!busy} onClick={() => void chooseSong()}>
        Choose a song…
      </button>
    </div>
  );
}
