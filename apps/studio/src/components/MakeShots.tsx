/**
 * Make's Shots page: the cut as the shots still to be made, a card each, with how far along each one is; and one shot
 * opened large: the take being looked at, the rest of its takes under it, and making more beside it. A pass makes
 * takes for every shot that needs one, priced first.
 */
import { useEffect, useRef, useState } from "react";
import type { MakeAsk, MakeJob } from "@beatsheet/engine";
import { aspectOf, cameraOfTake, CATALOG, FIDELITY, type Asset, type Fidelity, type MakeOp, type Project, type Quality, type Shot } from "@beatsheet/schema";
import { ASSET_DRAG, FIDELITY_LABEL, hideBroken, imageUrl, posterUrl, proxyUrl, putInShot, round2, timeAgo } from "../lib";
import { actions, useProject, useStore, useTimeline } from "../store";
import { BlockoutPlayer, useBlockout, type BlockoutHandle, type BlockoutPick } from "./Blockout";
import { NotesFor } from "./Side";
import { madeWith, money, pickOf, pickTake, Takes } from "./Takes";
import { FidelityPill } from "./ui";
import { EnlargeIcon, Viewer } from "./Viewer";
import { Icon } from "./Icon";

export const isOpen = (j: MakeJob) => j.status === "queued" || j.status === "running";

/** The shots a take can be for: placeholders and made shots, in the cut's order. */
export function shotsToMake(p: Project): Shot[] {
  return p.shots.filter((s) => s.content.kind === "placeholder" || s.content.kind === "generated");
}
export const shotPrompt = (s: Shot, op?: MakeOp) => (s.content.kind === "placeholder" ? s.content.description : s.content.kind === "generated" ? ((op === "video" ? s.content.clipPrompt : undefined) ?? s.content.prompt) : "");
/** A shot's takes, as the files they are. */
const takesOf = (p: Project, s: Shot): Asset[] => (s.content.kind === "generated" ? (s.content.takes ?? (s.content.take ? [s.content.take] : [])) : []).flatMap((id) => p.assets.find((a) => a.id === id) ?? []);

/**
 * The shots a pass makes takes for: for stills, the ones with no still yet; for clips, the ones with a still to start
 * from and no clip yet (or, for finals, no final).
 */
export function passShots(p: Project, op: MakeOp, quality: Quality): Shot[] {
  const kindOf = (id: string | undefined) => p.assets.find((a) => a.id === id);
  return shotsToMake(p).filter((s) => {
    const c = s.content;
    const takes = takesOf(p, s);
    if (op === "image") return !takes.some((a) => a.kind === "image");
    const board = c.kind === "generated" && (kindOf(c.take)?.kind === "image" || !!c.start);
    const clips = takes.filter((a) => a.kind === "video");
    return board && (quality === "final" ? !clips.some((a) => a.provenance?.params?.quality === "final") : !clips.length);
  });
}

type Estimate = { rows: { model: string; label: string; usd: number; made: number; unfit: { shot?: string; reason: string }[] }[]; auto: { usd: number; made: number }; problems: { shot?: string; reason: string }[] };

/**
 * A pass over the cut: takes for every shot that needs one, each from its own description, at the shot's length and
 * the cut's shape. What it would cost with each model is asked first; it starts all or nothing.
 */
function Pass({ start, onStarted, onClose }: { start: { op: MakeOp; quality: Quality }; onStarted: (jobs: MakeJob[]) => void; onClose: () => void }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const [op, setOp] = useState(start.op);
  const [quality, setQuality] = useState(start.quality);
  const [count, setCount] = useState(2);
  const [picked, setModel] = useState("");
  const video = op === "video";
  const shots = passShots(p, op, quality);
  const model = pickOf(picked).model;
  const asks: MakeAsk[] = shots.map((s) => ({ op, cut: cutId, shot: s.id, count, ...(model ? { model } : {}), ...(video ? { quality, start: "board" } : {}) }));
  const key = JSON.stringify(asks.map((a) => ({ ...a, model: undefined })));
  const [est, setEst] = useState<Estimate>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setEst(undefined);
    const plain = JSON.parse(key) as MakeAsk[];
    if (!plain.length) return;
    let live = true;
    void fetch(`/api/projects/${projectId}/make/estimate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asks: plain }) })
      .then((r) => r.json() as Promise<Estimate>)
      .then((e) => live && setEst(e))
      .catch(() => {});
    return () => void (live = false);
  }, [projectId, key]);
  const row = model ? est?.rows.find((r) => r.model === model) : undefined;
  const all = shots.length;
  // Only a model that can make every shot in the pass; Auto picks per shot.
  const ok = !!est && (model ? row?.made === all : est.auto.made === all);
  const usd = model ? row?.usd : est?.auto.usd;
  const make = async () => {
    setError("");
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asks }) });
      const j = (await res.json()) as { jobs?: MakeJob[]; error?: string };
      if (!res.ok || !j.jobs) throw new Error(j.error ?? `${res.status}`);
      onStarted(j.jobs);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };
  const what = video ? `${quality} ${count === 1 ? "clip" : "clips"}` : count === 1 ? "still" : "stills";
  const short = (r: Estimate["rows"][number]) => `${r.label} · ${r.made === all ? money(r.usd) : `can make ${r.made} of ${all}`}`;
  return (
    <section className="make-pass">
      <div className="make-row">
        <strong>A pass over the cut</strong>
        <span className="spacer" />
        <button className="icon" onClick={onClose} title="Close" aria-label="Close">
          <Icon name="close" size={12} />
        </button>
      </div>
      <p className="small dim">
        {all
          ? `${all} shot${all === 1 ? "" : "s"} ${video ? `with a still and no ${quality === "final" ? "final" : "clip"} yet` : "with no still yet"}: ${shots.map((s) => s.id).join(", ")}. Each one's own description is its prompt${video ? ", from its chosen still" : ""}.`
          : video
            ? `Every shot with a still already has a ${quality === "final" ? "final" : "clip"}.`
            : "Every shot already has a still."}
      </p>
      <div className="make-row">
        <div className="segmented">
          <button
            className={!video ? "on" : ""}
            onClick={() => {
              setOp("image");
              setModel("");
            }}
            title="Stills: boards, cents each"
          >
            Stills
          </button>
          <button
            className={video ? "on" : ""}
            onClick={() => {
              setOp("video");
              setModel("");
            }}
            title="Clips, from each shot's chosen still"
          >
            Video
          </button>
        </div>
        {video && (
          <select
            value={quality}
            onChange={(e) => {
              setQuality(e.target.value as Quality);
              setModel("");
            }}
            aria-label="Quality"
            title="Roughs to judge, or finals once the cut holds"
          >
            <option value="rough">Rough</option>
            <option value="final">Final</option>
          </select>
        )}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many" title="How many takes a shot">
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n} a shot
            </option>
          ))}
        </select>
        <select value={model ?? ""} onChange={(e) => setModel(e.target.value)} aria-label="Model" title="Which model makes them">
          <option value="">{est ? `Auto · ${est.auto.made === all ? money(est.auto.usd) : `can make ${est.auto.made} of ${all}`}` : "Auto"}</option>
          {est?.rows
            .filter((r) => r.made > 0)
            .sort((a, b) => b.made - a.made || a.usd - b.usd)
            .map((r) => (
              <option key={r.model} value={r.model} disabled={r.made !== all}>
                {short(r)}
              </option>
            ))}
        </select>
      </div>
      {est && !ok && all > 0 && (
        <p className="warn small">{[...est.problems, ...(row?.unfit ?? [])].map((x) => `${x.shot ? `Shot ${x.shot}: ` : ""}${x.reason}`).join(". ") || "Nothing can make all of them now."}</p>
      )}
      <div className="make-row">
        <button className="primary" disabled={!all || !ok || sending} onClick={() => void make()}>
          Make {count} {what} for each of {all} shot{all === 1 ? "" : "s"}
          {usd !== undefined && ok ? ` · ${usd === 0 ? (CATALOG.find((m) => m.id === model)?.routes.every((r) => r.via === "comfy") ? "on your graphics card" : "on your plan") : money(usd)}` : ""}
        </button>
        {error && <span className="warn small">{error}</span>}
      </div>
    </section>
  );
}

/** The cut's shots to make, a card each, in the cut's order; and passes over the ones that still need something. */
export function ShotsPage({ jobs, onStarted }: { jobs: MakeJob[]; onStarted: (jobs: MakeJob[]) => void }) {
  const p = useProject();
  const tl = useTimeline();
  const cutId = useStore((s) => s.cutId);
  const [pass, setPass] = useState<{ op: MakeOp; quality: Quality }>();
  const shots = shotsToMake(p);
  const others = p.shots.filter((s) => p.tracks.find((t) => t.id === s.track)?.kind === "picture").length - shots.filter((s) => p.tracks.find((t) => t.id === s.track)?.kind === "picture").length;
  if (!shots.length) {
    return (
      <div className="make-empty">
        <h2>No shots to make in this cut</h2>
        <p className="dim">
          Shots that are made rather than filmed show up here: placeholders the agent writes into the cut from your brief, and any you add in Edit. Each gets stills first, then a clip from the one you choose.
        </p>
        <p className="dim small">Meanwhile, describe a picture below and it goes to the Library, or build the cast first.</p>
      </div>
    );
  }
  const stages = FIDELITY.map((f) => [f, shots.filter((s) => s.fidelity === f).length] as const).filter(([, n]) => n);
  const need = { stills: passShots(p, "image", "rough").length, roughs: passShots(p, "video", "rough").length, finals: passShots(p, "video", "final").length };
  const aspect = `${p.formats[0]!.width} / ${p.formats[0]!.height}`;
  return (
    <div className="make-page">
      <header className="page-head">
        <h2>
          {shots.length} shot{shots.length === 1 ? "" : "s"} to make
        </h2>
        <span className="stage-counts">
          {stages.map(([f, n]) => (
            <span key={f} className="small">
              <FidelityPill fidelity={f} /> {n}
            </span>
          ))}
        </span>
        {others > 0 && (
          <span className="dim small">
            · {others} more in the cut {others === 1 ? "is" : "are"} footage or designed
          </span>
        )}
        <span className="spacer" />
        {need.stills > 0 && (
          <button onClick={() => setPass({ op: "image", quality: "rough" })} title="A still for every shot that has none, each from its own description">
            Stills for {need.stills}
          </button>
        )}
        {need.roughs > 0 && (
          <button onClick={() => setPass({ op: "video", quality: "rough" })} title="A rough clip for every shot with a chosen still and no clip yet">
            Rough clips for {need.roughs}
          </button>
        )}
        {need.finals > 0 && need.finals !== need.roughs && (
          <button onClick={() => setPass({ op: "video", quality: "final" })} title="A final for every shot that has a still and no final yet">
            Finals for {need.finals}
          </button>
        )}
      </header>
      {pass && <Pass key={`${pass.op}:${pass.quality}`} start={pass} onStarted={onStarted} onClose={() => setPass(undefined)} />}
      <div className="shot-grid">
        {shots.map((s) => {
          const r = tl.shots.find((x) => x.id === s.id);
          const seconds = r && Number.isFinite(r.end - r.start) ? r.end - r.start : undefined;
          const n = p.shots.filter((x) => x.track === s.track).indexOf(s) + 1;
          return <ShotCard key={s.id} shot={s} n={n} seconds={seconds} aspect={aspect} going={jobs.filter((j) => isOpen(j) && j.shot === s.id && (!j.cut || j.cut === cutId)).length} />;
        })}
      </div>
    </div>
  );
}

/** One shot on the Shots page: the take it shows (playing under the pointer), or what it's to be, and how far along it is. */
function ShotCard({ shot, n, seconds, aspect, going }: { shot: Shot; n: number; seconds?: number; aspect: string; going: number }) {
  const projectId = useStore((s) => s.projectId)!;
  const p = useProject();
  const [hover, setHover] = useState(false);
  const [over, setOver] = useState(false);
  const c = shot.content;
  const take = c.kind === "generated" && c.take ? p.assets.find((a) => a.id === c.take) : undefined;
  const takes = takesOf(p, shot);
  const stills = takes.filter((a) => a.kind === "image").length;
  const clips = takes.length - stills;
  const text = shotPrompt(shot);
  return (
    <button
      className={`shot-card ${over ? "over" : ""}`}
      onClick={() => actions.select({ kind: "shot", id: shot.id })}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // A picture from the Library or the Made page, dropped here, becomes the take the shot shows.
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(ASSET_DRAG)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const a = p.assets.find((x) => x.id === e.dataTransfer.getData(ASSET_DRAG));
        if (!a || (a.kind !== "image" && a.kind !== "video")) return;
        e.preventDefault();
        actions.edit((d) => putInShot(d, shot.id, a));
      }}
      title={shot.intent}
    >
      <span className={`shot-frame ${take ? "" : "idea"}`} style={{ aspectRatio: aspect }}>
        {take ? (
          take.kind === "video" && hover ? (
            <video src={proxyUrl(projectId, take.id)} autoPlay muted loop playsInline />
          ) : (
            <img src={posterUrl(projectId, take.id)} loading="lazy" alt="" onError={hideBroken} />
          )
        ) : (
          <span className="shot-idea">{text || "Nothing written for it yet"}</span>
        )}
        <span className="shot-n">{String(n).padStart(2, "0")}</span>
        <FidelityPill fidelity={shot.fidelity} />
        {seconds !== undefined && <span className="shot-len">{seconds.toFixed(1)}s</span>}
        {going > 0 && (
          <span className="shot-going">
            <span className="dots" /> {going} on the way
          </span>
        )}
      </span>
      <span className="shot-card-body">
        <span className="shot-card-label">{shot.label ?? shot.id}</span>
        {take && <span className="shot-card-text dim small">{text}</span>}
        <span className="dim small">
          {[stills && `${stills} still${stills === 1 ? "" : "s"}`, clips && `${clips} clip${clips === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "No takes yet"}
        </span>
      </span>
    </button>
  );
}

/**
 * One shot, large: the take being looked at, every take it has under it (the one the cut shows marked), and making
 * more beside it. Looking at a take doesn't change the cut; Use this take does. When a take is to keep a blockout's
 * camera, the blockout plays beside the take, and the two can be played together.
 */
export function ShotPage({ shot, jobs, back, backLabel }: { shot: Shot; jobs: MakeJob[]; back: () => void; backLabel: string }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const tl = useTimeline();
  const r = tl.shots.find((x) => x.id === shot.id);
  const seconds = r && Number.isFinite(r.end - r.start) ? round2(r.end - r.start) : undefined;
  const c = shot.content;
  const takes = takesOf(p, shot);
  const showing = c.kind === "generated" ? c.take : undefined;
  const [looking, setLooking] = useState<string>();
  const [large, setLarge] = useState(false);
  // A take that's just arrived is the one to look at.
  const last = takes.at(-1)?.id;
  const [seen, setSeen] = useState(takes.length);
  useEffect(() => {
    if (takes.length > seen && last) setLooking(last);
    setSeen(takes.length);
  }, [takes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const look = takes.find((a) => a.id === looking) ?? takes.find((a) => a.id === showing) ?? takes.at(-1);
  const going = jobs.filter((j) => isOpen(j) && j.shot === shot.id && (!j.cut || j.cut === cutId));
  const list = shotsToMake(p);
  const at = list.indexOf(shot);
  const go = (s: Shot | undefined) => s && actions.select({ kind: "shot", id: s.id });
  const format = p.formats[0]!;
  const aspect = `${format.width} / ${format.height}`;
  const editShot = (fn: (s: Shot) => void) => actions.edit((d) => fn(d.shots.find((s) => s.id === shot.id)!));
  const kind = (a: Asset) => (a.kind === "video" ? (a.provenance?.params?.quality === "final" ? "Final" : "Rough clip") : "Still");
  // The blockout beside the take: the one the make form is set to keep the camera of (the stretch the engine would
  // render and send), else the one the take being looked at kept, as that cut is now. It can be put away.
  const [picked, setPicked] = useState<BlockoutPick>();
  const [away, setAway] = useState(false);
  const followed = cameraOfTake(look);
  const its = picked ?? (followed && "cut" in followed ? followed : undefined);
  const cam = away ? undefined : its;
  const blockout = useBlockout(cam, aspectOf(format.width, format.height));
  const video = useRef<HTMLVideoElement>(null);
  const drawn = useRef<BlockoutHandle>(null);
  const kept = look?.provenance?.params?.camera as { cut?: string } | undefined;
  const doc = useStore((s) => s.doc);
  return (
    <div className="make-page shot-page">
      <header className="page-head">
        <button className="back" onClick={back}>
          <Icon name="back" size={12} /> {backLabel}
        </button>
        <span className="mono dim">{shot.id}</span>
        <h2>{shot.label ?? "Shot"}</h2>
        <select value={shot.fidelity} onChange={(e) => editShot((s) => void (s.fidelity = e.target.value as Fidelity))} title="How far along this shot is" aria-label="How far along this shot is">
          {FIDELITY.map((f) => (
            <option key={f} value={f}>
              {FIDELITY_LABEL[f]}
            </option>
          ))}
        </select>
        <span className="dim small">{[seconds !== undefined ? `${seconds}s` : "", p.formats.map((f) => f.label).join(" and ")].filter(Boolean).join(" · ")}</span>
        <span className="spacer" />
        <span className="dim small">
          {at + 1} of {list.length}
        </span>
        <button className="icon" disabled={at <= 0} onClick={() => go(list[at - 1])} title="The shot before" aria-label="The shot before">
          <Icon name="back" size={12} />
        </button>
        <button className="icon" disabled={at >= list.length - 1} onClick={() => go(list[at + 1])} title="The next shot" aria-label="The next shot">
          <Icon name="forward" size={12} />
        </button>
        <button
          onClick={() => {
            actions.setMode("edit");
            if (r && Number.isFinite(r.start)) actions.seek(r.start);
          }}
          title="Go to this shot on the timeline, in Edit"
        >
          Show in the cut
        </button>
      </header>
      <div className="shot-cols">
        <section className="shot-stage-col">
          <div className={`stage-pair ${cam ? "two" : ""}`}>
          <div className={`stage ${look ? "" : "empty"}`} style={{ aspectRatio: look?.width && look.height ? `${look.width} / ${look.height}` : aspect }}>
            {cam && look && <span className="stage-tag">Take</span>}
            {look ? (
              look.kind === "video" ? (
                <video ref={video} key={look.id} src={proxyUrl(projectId, look.id)} poster={posterUrl(projectId, look.id)} controls loop playsInline />
              ) : (
                <img key={look.id} src={imageUrl(projectId, look.id)} alt="" onClick={() => setLarge(true)} onError={hideBroken} />
              )
            ) : (
              <div className="stage-idea">
                <p>{shotPrompt(shot) || "Nothing written for this shot yet."}</p>
                <p className="dim small">{going.length ? "Its first takes are on the way." : "No takes yet. Make a few stills to settle the shot, then a clip from the one you like."}</p>
              </div>
            )}
          </div>
          {cam && (
            <div className="stage blockout" style={{ aspectRatio: blockout ? `${blockout.format.width} / ${blockout.format.height}` : aspect }}>
              <BlockoutPlayer ref={drawn} pick={cam} aspect={aspectOf(format.width, format.height)} />
              <span className="stage-tag">
                Blockout{blockout ? ` · ${blockout.name} · ${round2(blockout.to - blockout.from)}s` : ""}
              </span>
            </div>
          )}
          </div>
          {look && (
            <div className="stage-bar">
              <span className="small">
                {kind(look)}
                <span className="dim">{[madeWith(look), look.duration ? `${look.duration.toFixed(1)}s` : "", look.provenance?.costUsd !== undefined ? `$${look.provenance.costUsd.toFixed(2)}` : "", look.provenance?.createdAt ? timeAgo(look.provenance.createdAt) : ""].filter(Boolean).map((x) => ` · ${x}`)}</span>
              </span>
              {kept?.cut && <span className="dim small">· kept the camera of {doc?.cuts.find((x) => x.id === kept.cut)?.name ?? kept.cut}</span>}
              <span className="spacer" />
              {its && (
                <button onClick={() => setAway(!away)} title={away ? "Play the blockout beside the take" : "Give the take the whole stage"}>
                  {away ? "Show the blockout" : "Hide the blockout"}
                </button>
              )}
              {cam && look.kind === "video" && (
                <button
                  onClick={() => {
                    if (video.current) {
                      video.current.currentTime = 0;
                      void video.current.play();
                    }
                    drawn.current?.restart();
                  }}
                  title="Play the take and the blockout from their starts together, to compare the move, the framing and where the cuts fall"
                >
                  Play both
                </button>
              )}
              {look.id === showing ? (
                <span className="in-cut small">
                  <Icon name="check" size={12} /> The cut shows this one
                </span>
              ) : (
                <button className="primary" onClick={() => pickTake(shot.id, look.id, seconds)} title="Make it the take the cut shows for this shot">
                  Use this take
                </button>
              )}
              <button className="icon" onClick={() => setLarge(true)} title="See it large, to zoom in" aria-label="See it large">
                <EnlargeIcon />
              </button>
            </div>
          )}
          {look && <Given a={look} />}
          {takes.length + going.length > 0 && (
            <div className="take-tray">
              {takes.map((a) => (
                <TrayTake key={a.id} a={a} projectId={projectId} looking={a.id === look?.id} showing={a.id === showing} badge={kind(a)} onLook={() => setLooking(a.id)} onUse={() => pickTake(shot.id, a.id, seconds)} />
              ))}
              {going.map((j) => (
                <div key={j.id} className="tray-take pending" style={{ aspectRatio: aspect }} title={j.op === "image" ? "A still on its way" : "A clip on its way"}>
                  {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
                </div>
              ))}
            </div>
          )}
          {shot.intent && shot.intent !== shot.label && (
            <p className="dim small">
              <strong>What it's for.</strong> {shot.intent}
            </p>
          )}
        </section>
        <aside className="shot-make-col inspector">
          <Takes key={shot.id} shot={shot} seconds={seconds} strip={false} onCamera={setPicked} />
          <NotesFor />
        </aside>
      </div>
      {large && look && (
        <Viewer
          projectId={projectId}
          items={takes.map((a) => ({ id: a.id, video: a.kind === "video", caption: [kind(a), madeWith(a) && `made with ${madeWith(a)}`].filter(Boolean).join(" · ") }))}
          at={takes.indexOf(look)}
          onClose={() => setLarge(false)}
          actions={(item) => (item.id === showing ? <span className="dim small">The one the cut shows</span> : <button onClick={() => pickTake(shot.id, item.id, seconds)}>Use this take</button>)}
        />
      )}
    </div>
  );
}

/**
 * What a take was made from, for one that came out wrong to be traced to what went in: every picture and clip it was
 * given, each named for the part it played (what it starts from, ends on, a reference), and the words it was told.
 * These are the agent's choices as much as the person's; the make form doesn't set references.
 */
export function Given({ a }: { a: Asset }) {
  const projectId = useStore((s) => s.projectId)!;
  const p = useProject();
  const made = a.provenance;
  if (made?.source !== "generated") return null;
  const asked = (made.params ?? {}) as { prompt?: string; start?: string; end?: string; drive?: { asset?: string }; clip?: { asset?: string }; camera?: { asset?: string } };
  const part = (id: string) => (id === asked.start ? "Starts from" : id === asked.end ? "Ends on" : id === asked.drive?.asset ? "Moves like" : id === asked.clip?.asset ? "Mouths changed in" : id === asked.camera?.asset ? "Camera of" : "Reference");
  const from = [...new Set([asked.start, asked.end, ...(made.refs ?? [])].filter((id): id is string => !!id))];
  const told = asked.prompt ?? made.prompt;
  if (!from.length && !told) return null;
  return (
    <div className="given">
      {from.length > 0 && (
        <div className="given-pics">
          <span className="dim small">Made from</span>
          {from.map((id) => {
            const x = p.assets.find((y) => y.id === id);
            return (
              <button key={id} className="given-pic" disabled={!x} onClick={() => actions.select({ kind: "asset", id })} title={`${part(id)}: ${x ? (x.label ?? id) : `${id} (not in the project any more)`}`}>
                {x && <img src={posterUrl(projectId, id)} loading="lazy" alt="" onError={hideBroken} />}
                <span>{part(id)}</span>
              </button>
            );
          })}
        </div>
      )}
      {told && (
        <details className="given-told small">
          <summary>What it was told</summary>
          <p>{told}</p>
        </details>
      )}
    </div>
  );
}

/** A take in a shot's tray: click to look at it, double-click to use it. */
function TrayTake({ a, projectId, looking, showing, badge, onLook, onUse }: { a: Asset; projectId: string; looking: boolean; showing: boolean; badge: string; onLook: () => void; onUse: () => void }) {
  const [hover, setHover] = useState(false);
  const video = a.kind === "video";
  return (
    <button
      className={`tray-take ${looking ? "looking" : ""} ${showing ? "on" : ""}`}
      style={{ aspectRatio: a.width && a.height ? `${a.width} / ${a.height}` : "16 / 9" }}
      onClick={onLook}
      onDoubleClick={onUse}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG, a.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      title={showing ? "The take the cut shows" : "Look at this take (double-click to use it)"}
    >
      {video && hover ? <video src={proxyUrl(projectId, a.id)} autoPlay muted loop playsInline /> : <img src={posterUrl(projectId, a.id)} loading="lazy" alt="" onError={hideBroken} />}
      <span className="badge">
        {video && <Icon name="play" size={8} />} {badge}
      </span>
      {showing && (
        <span className="tray-in" title="The take the cut shows">
          <Icon name="check" size={10} />
        </span>
      )}
    </button>
  );
}
