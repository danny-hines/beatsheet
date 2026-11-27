import type { Asset, HandOff, PlannedTake, ProjectFile } from "@beatsheet/schema";
import { aspectOf } from "@beatsheet/schema";
import { useState, type ReactNode } from "react";
import { AGENT_NAMES, hideBroken, imageUrl, pickFootage, pickPath, posterUrl, projectFileUrl, proxyUrl, runJob, sessionActivity } from "../lib";
import { actions, agentFor, getState, setState, useStore } from "../store";
import { BlockoutPlayer } from "./Blockout";
import { EnlargeIcon, Viewer, type ViewerItem } from "./Viewer";

/**
 * Whose move it is on the open project: the agent's (and what it's doing) or the person's (and what's asked).
 * `elsewhere` names the cut it's about when that isn't the one on screen.
 */
export function useTurn() {
  const doc = useStore((s) => s.doc);
  const agent = useStore((s) => agentFor(s));
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
        if (t.elsewhere) actions.visitCut(t.elsewhere.id);
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
  // A take a picked option planned that couldn't start: the agent hears why too, and nothing was spent.
  const { unstarted } = (await res.json().catch(() => ({}))) as { unstarted?: string[] };
  if (unstarted?.length) setState({ notice: `${unstarted.join(" ")} Nothing was spent.` });
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
        <button className="link small" onClick={() => actions.visitCut(t.elsewhere!.id)}>
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
          {t.ask.kind === "choose" ? <Choose ask={t.ask} /> : t.ask.kind === "review" ? <Review ask={t.ask} /> : t.ask.kind === "cast" ? <KeepCast ask={t.ask} /> : <Provide ask={t.ask} />}
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

const KINDS = { character: "Character", wardrobe: "Wardrobe", place: "Place", prop: "Prop" } as const;

/**
 * Who and what the agent found in the Library, each with the pictures it's in: the ones kept join the cast (or add their
 * pictures to the one already there with that id) as the answer goes.
 */
function KeepCast({ ask }: { ask: Extract<HandOff, { kind: "cast" }> }) {
  const projectId = useStore((s) => s.projectId);
  const cast = useStore((s) => s.doc?.cast);
  const assets = useStore((s) => s.doc?.assets);
  const [keep, setKeep] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [large, setLarge] = useState<string>();
  const toggle = (id: string) => setKeep((k) => (k.includes(id) ? k.filter((x) => x !== id) : [...k, id]));
  const pics = projectId ? ask.proposals.map((p) => pictures(projectId, assets, p.id, p.name, undefined, p.assets)) : [];
  return (
    <>
      <div className="turn-options">
        {ask.proposals.map((p, i) => {
          const there = cast?.find((m) => m.id === p.id && m.kind !== "style");
          return (
            <button key={p.id} className={`turn-option ${keep.includes(p.id) ? "on" : ""}`} onClick={() => toggle(p.id)} aria-pressed={keep.includes(p.id)}>
              <Board pics={pics[i] ?? []} onOpen={setLarge} />
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
        {projectId && large && (
          <Large
            projectId={projectId}
            pics={pics.flat()}
            at={large}
            onClose={() => setLarge(undefined)}
            action={(of) => (
              <button className={keep.includes(of) ? "on" : "primary"} onClick={() => toggle(of)} title={keep.includes(of) ? "Don't keep this one" : undefined}>
                {keep.includes(of) ? "Kept" : "Keep this one"}
              </button>
            )}
          />
        )}
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

/** A picture an option shows: small in the card, whole in the large view. `of` is the option it belongs to. */
type Pic = ViewerItem & { thumb: string; of: string };

/** An option's pictures: the one the agent made for it, then up to four of the footage it points at. */
function pictures(projectId: string, assets: Asset[] | undefined, of: string, caption: string, image: string | undefined, ids: string[]): Pic[] {
  const pics: Pic[] = image ? [{ id: `${of}/image`, of, caption, src: projectFileUrl(projectId, image), thumb: projectFileUrl(projectId, image) }] : [];
  ids.slice(0, 4).forEach((a, i) => {
    const video = assets?.find((x) => x.id === a)?.kind === "video";
    pics.push({ id: `${of}/${i}`, of, caption, video, src: video ? proxyUrl(projectId, a) : imageUrl(projectId, a), thumb: posterUrl(projectId, a) });
  });
  // One picture fills the card's width, where a poster would be soft.
  if (pics.length === 1 && !pics[0]!.video) pics[0]!.thumb = pics[0]!.src!;
  return pics;
}

/** An option's pictures, big enough to judge by: one fills the card's width, more go two to a row. Each opens large. */
function Board({ pics, onOpen }: { pics: Pic[]; onOpen: (id: string) => void }) {
  if (!pics.length) return null;
  return (
    <span className={`turn-board ${pics.length === 1 ? "one" : ""}`}>
      {pics.map((p) => (
        <span
          key={p.id}
          className="turn-pic"
          title="See it large (← and → go through the others)"
          onClick={(e) => {
            // It's inside the option's button: looking isn't picking.
            e.stopPropagation();
            onOpen(p.id);
          }}
        >
          <img src={p.thumb} alt="" />
          <span className="enlarge">
            <EnlargeIcon />
          </span>
        </span>
      ))}
    </span>
  );
}

const PART = { start: "Starts from", end: "Ends on", ref: "Reference" } as const;

type Steps = {
  sheet?: string;
  sheets?: string[];
  portrait?: string;
  portraits?: string[];
  faceSheet?: string;
  faceSheets?: string[];
  outfitSheet?: string;
  outfitSheets?: string[];
  images?: string[];
  kept?: string[];
  faces?: string[];
  wardrobe?: string[];
};

/** What a picture is to the cast, when it's one of theirs: "Galileo (William)'s 360° face sheet". */
function castName(cast: ProjectFile["cast"], id: string): string | undefined {
  for (const m of cast ?? []) {
    const looks: [Steps, string][] = [[m, m.name], ...(m.variants ?? []).map((v): [Steps, string] => [v, `${m.name} (${v.id})`])];
    for (const [l, name] of looks) {
      if (l.faceSheet === id || l.faceSheets?.includes(id)) return `${name}'s 360° face sheet`;
      if (l.outfitSheet === id || l.outfitSheets?.includes(id)) return `${name}'s outfit sheet`;
      if (l.sheet === id || l.sheets?.includes(id)) return `${name}'s sheet`;
      if (l.portrait === id || l.portraits?.includes(id)) return `${name}'s portrait`;
      if (l.faces?.includes(id)) return `a photo of ${name}`;
      if (l.wardrobe?.includes(id)) return `${name}'s wardrobe`;
      if (l.images?.includes(id) || l.kept?.includes(id)) return `a picture of ${name}`;
    }
  }
  return undefined;
}

type SendPic = Pic & { part: string; name: string };

/**
 * Everything a planned take sends that can be looked at, in the order the model gets it: each picture named for its
 * part and for what it is (a cast member's sheet; a made still by its id, as the agent calls it, since its label is
 * only the start of its prompt; footage by its label), then the clip it follows, if it's a clip.
 */
function sendsPictures(projectId: string, assets: Asset[] | undefined, cast: ProjectFile["cast"], of: string, m: PlannedTake): SendPic[] {
  const named = (id: string) => {
    const a = assets?.find((x) => x.id === id);
    const made = a?.provenance?.source === "generated" || !a?.label;
    return castName(cast, id) ?? (made ? id : a!.label!.length > 48 ? `${a!.label!.slice(0, 47)}…` : a!.label!);
  };
  const out: SendPic[] = m.pictures.map((p, i) => {
    const baseName = named(p.asset);
    const name = p.composite ? `${baseName} + ${named(p.composite.outfit)} (composited)` : baseName;
    const part = p.composite ? "Composite ref" : p.role === "face-sheet" ? "360° face" : p.role === "portrait" ? "Face ref" : p.role === "outfit" ? "Outfit ref" : PART[p.as];
    const caption = `${part}: ${name}${name === p.asset ? "" : ` (${p.asset})`}`;
    return { id: `${of}/sends/${i}`, of, part, name, caption, src: imageUrl(projectId, p.asset), thumb: posterUrl(projectId, p.asset) };
  });
  const clips: [string, { asset: string; from: number; to: number } | undefined][] = [
    ["Camera of", m.camera && "asset" in m.camera ? m.camera : undefined],
    ["Moves like", m.drive],
    ["Mouths changed in", m.clip],
  ];
  for (const [part, s] of clips) {
    if (!s) continue;
    const name = `${named(s.asset)}, ${round1(s.from)}–${round1(s.to)}s`;
    out.push({ id: `${of}/sends/${out.length}`, of, part, name, caption: `${part}: ${name} (${s.asset})`, video: true, src: proxyUrl(projectId, s.asset), thumb: posterUrl(projectId, s.asset) });
  }
  return out;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * What picking an option sends, before anything is paid for: every picture with the part it plays (each opens large),
 * the blockout it keeps the camera of (which opens its cut), the model, where it runs and what it costs, and the words
 * as the service gets them. It's the request the engine checked as the agent handed off, and picking starts it.
 */
function Sends({ planned: m, pics, onOpen }: { planned: PlannedTake; pics: SendPic[]; onOpen: (id: string) => void }) {
  const [told, setTold] = useState(false);
  const cuts = useStore((s) => s.doc?.cuts);
  const cost = m.usd === undefined ? "" : m.usd > 0 ? `about $${m.usd.toFixed(2)}` : "no charge";
  const facts = [`${m.count} ${m.op === "image" ? "still" : "clip"}${m.count === 1 ? "" : "s"}`, m.seconds && `${round1(m.seconds)}s`, m.aspect, cost].filter(Boolean).join(" · ");
  const shotBlockout = m.camera && "blockout" in m.camera ? m.camera : undefined;
  const legacyBlockout = m.camera && !shotBlockout && "cut" in m.camera ? m.camera : undefined;
  const hasBlockout = !!shotBlockout || !!legacyBlockout;
  const audioRefs = m.audioRefs ?? [];
  return (
    <span className="turn-sends">
      <span className="small">
        <strong>{m.started?.length ? "Started" : "Picking this sends"}</strong> <span className="dim">to {m.label} on {m.where} · {facts}</span>
      </span>
      {pics.length + (hasBlockout ? 1 : 0) + audioRefs.length > 0 ? (
        <span className="turn-sends-pics">
          {pics.map((p) => (
            <span
              key={p.id}
              className="turn-send"
              title={`${p.caption}. See it large`}
              onClick={(e) => {
                // It's inside the option's button: looking isn't picking.
                e.stopPropagation();
                onOpen(p.id);
              }}
            >
              <img src={p.thumb} alt="" loading="lazy" onError={hideBroken} />
              <span className="turn-send-part">{p.part}</span>
              <span className="turn-send-name">{p.name}</span>
            </span>
          ))}
          {shotBlockout && (
            <span
              className="turn-send blockout"
              title="This shot's 3D camera blockout. Click to open the shot in Make"
              onClick={(e) => {
                e.stopPropagation();
                actions.setMode("make");
                actions.select({ kind: "shot", id: shotBlockout.shot });
              }}
            >
              <span className="turn-send-part">{shotBlockout.mode === "sheet" ? "16-frame sheet" : "Blockout"}</span>
              <span className="turn-send-name">
                Shot {shotBlockout.shot}, {round1(shotBlockout.to - shotBlockout.from)}s
              </span>
            </span>
          )}
          {legacyBlockout && (
            <span
              className="turn-send blockout"
              title="The blockout it keeps the camera of: its move, framing and timing. Open the cut to watch it"
              onClick={(e) => {
                e.stopPropagation();
                actions.visitCut(legacyBlockout.cut);
              }}
            >
              <span className="turn-send-part">{legacyBlockout.mode === "sheet" ? "16-frame sheet" : "Camera of"}</span>
              <span className="turn-send-name">
                {cuts?.find((c) => c.id === legacyBlockout.cut)?.name ?? legacyBlockout.cut}, {round1(legacyBlockout.from)}–{round1(legacyBlockout.to)}s
              </span>
            </span>
          )}
          {audioRefs.map((ar, idx) => {
            const part =
              ar.kind === "music"
                ? "Audio · Music"
                : ar.kind === "speech"
                  ? "Audio · Lines"
                  : ar.kind === "voice"
                    ? `Audio · @${ar.cast}`
                    : `Audio${ar.role ? ` · ${ar.role}` : ""}`;
            const detail =
              ar.kind === "music"
                ? `${ar.label ? `${ar.label}, ` : ""}${round1(ar.from)}–${round1(ar.to)}s`
                : ar.kind === "speech"
                  ? `${ar.lines.join(", ")}, ${round1(ar.from)}–${round1(ar.to)}s`
                  : ar.kind === "voice"
                    ? `${ar.asset}, ${round1(ar.from)}–${round1(ar.to)}s`
                    : `${ar.label ?? ar.asset}, ${round1(ar.from)}–${round1(ar.to)}s`;
            return (
              <span
                key={`aud-${idx}`}
                className="turn-send audio"
                title={`${part}: ${detail}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if ("asset" in ar) actions.select({ kind: "asset", id: ar.asset });
                }}
              >
                <span className="turn-send-part">{part}</span>
                <span className="turn-send-name">{detail}</span>
              </span>
            );
          })}
        </span>
      ) : (
        <span className="dim small">No pictures go with it: words only.</span>
      )}
      <span
        className="link small"
        onClick={(e) => {
          e.stopPropagation();
          setTold(!told);
        }}
      >
        {told ? "Hide the words" : "The words it sends"}
      </span>
      {told && (
        <span className="turn-sends-told small" onClick={(e) => e.stopPropagation()}>
          {m.told}
        </span>
      )}
    </span>
  );
}

/** Every option's pictures in one large view, so ← and → compare them, with the option's own answer in its bar. */
function Large({ projectId, pics, at, onClose, action }: { projectId: string; pics: Pic[]; at: string; onClose: () => void; action: (of: string) => ReactNode }) {
  return (
    <Viewer
      projectId={projectId}
      items={pics}
      at={Math.max(0, pics.findIndex((p) => p.id === at))}
      onClose={onClose}
      actions={(item) => {
        const of = pics.find((p) => p.id === item.id)?.of;
        return of ? action(of) : null;
      }}
    />
  );
}

/** One question's options: a few words each, with the frames, picture or cut that shows it. */
function Options({ options, picked, onPick }: { options: Option[]; picked: string[]; onPick: (id: string) => void }) {
  const projectId = useStore((s) => s.projectId);
  const assets = useStore((s) => s.doc?.assets);
  const cast = useStore((s) => s.doc?.cast);
  const [large, setLarge] = useState<string>();
  const pics = projectId
    ? options.map((o) => pictures(projectId, assets, o.id, [o.label, o.detail].filter(Boolean).join(" · "), o.image, o.assets?.length ? o.assets : o.asset ? [o.asset] : []))
    : [];
  const sent = projectId ? options.map((o) => (o.make ? sendsPictures(projectId, assets, cast, o.id, o.make) : [])) : [];
  return (
    <div className="turn-options">
      {options.map((o, i) => (
        <button key={o.id} className={`turn-option ${picked.includes(o.id) ? "on" : ""}`} onClick={() => onPick(o.id)}>
          <Board pics={pics[i] ?? []} onOpen={setLarge} />
          <span className="turn-option-text">
            <strong>{o.label}</strong>
            {o.detail && <span className="dim small">{o.detail}</span>}
            {o.cut && (
              <span
                className="link small"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.visitCut(o.cut!);
                }}
              >
                Watch it
              </span>
            )}
          </span>
          {o.make && <Sends planned={o.make} pics={sent[i] ?? []} onOpen={setLarge} />}
        </button>
      ))}
      {projectId && large && (
        <Large
          projectId={projectId}
          pics={[...pics.flat(), ...sent.flat()]}
          at={large}
          onClose={() => setLarge(undefined)}
          action={(of) => (
            <button className={picked.includes(of) ? "on" : "primary"} onClick={() => onPick(of)}>
              {picked.includes(of) ? "Picked" : "Pick this"}
            </button>
          )}
        />
      )}
    </div>
  );
}

function Review({ ask }: { ask: Extract<HandOff, { kind: "review" }> }) {
  const [busy, setBusy] = useState(false);
  const project = useStore((s) => s.project);
  const fmt = project?.formats[0];
  const shape = fmt ? aspectOf(fmt.width, fmt.height) : "16:9";
  const reviewShot = ask.shot ? project?.shots.find((s) => s.id === ask.shot) : undefined;
  return (
    <>
      {ask.blockout && reviewShot?.blockout && (
        <div className="turn-blockout">
          <div className="camera-preview" style={{ aspectRatio: fmt ? `${fmt.width} / ${fmt.height}` : "16 / 9" }}>
            <BlockoutPlayer pick={{ blockout: true, shot: reviewShot.id, cut: ask.cut }} aspect={shape} />
          </div>
          <div className="turn-blockout-foot small">
            <span className="dim">
              Shot {reviewShot.label ?? reviewShot.id} blockout ({reviewShot.blockout.mode ?? "video"})
            </span>
            <button
              className="link small"
              onClick={() => {
                actions.setMode("make");
                actions.select({ kind: "shot", id: reviewShot.id });
              }}
            >
              Open shot in Make
            </button>
          </div>
        </div>
      )}
      <div className="turn-actions">
        <span className="dim small">{ask.blockout ? "Reply below to adjust the camera move, or:" : "Leave notes on anything you'd change and press Send, or:"}</span>
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
    </>
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
