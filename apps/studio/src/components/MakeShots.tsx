/**
 * Make's Shots page: the cut as the shots still to be made, a card each, with how far along each one is; and one shot
 * opened large: the take being looked at (with unified side-by-side/wipe compare whenever guided by a blockout, motion
 * clip, or source version), clips separated from intermediate first frames under it, and the shot's recipe + 1:1
 * camera blockout beside it.
 */
import { useEffect, useState } from "react";
import type { MakeAsk, MakeDraft, MakeJob } from "@beatsheet/engine";
import {
  aspectOf,
  blockoutDuration,
  CATALOG,
  FIDELITY,
  PREVIS_BY_ID,
  PREVIS_MOVES,
  type Asset,
  type AudioRef,
  type Camera,
  type Fidelity,
  type MakeOp,
  type Project,
  type Quality,
  type Shot,
} from "@beatsheet/schema";
import { ASSET_DRAG, FIDELITY_LABEL, hideBroken, posterUrl, projectFileUrl, proxyUrl, putInShot, round2, timeAgo } from "../lib";
import { actions, useProject, useStore, useTimeline } from "../store";
import { BlockoutPlayer } from "./Blockout";
import type { CreateLaunch } from "./CreatePage";
import { GuideCompare, guideOfAsset } from "./GuideCompare";
import { Icon } from "./Icon";
import { NotesFor } from "./Side";
import { madeWith, modelLabel, money, pickOf, pickTake } from "./Takes";
import { answer } from "./Turn";
import { FidelityPill } from "./ui";
import { EnlargeIcon, Viewer } from "./Viewer";

export const isOpen = (j: MakeJob) => j.status === "queued" || j.status === "running";

/** The shots a take can be for: placeholders and made shots, in the cut's order. */
export function shotsToMake(p: Project): Shot[] {
  return p.shots.filter((s) => s.content.kind === "placeholder" || s.content.kind === "generated");
}
export const shotPrompt = (s: Shot, op?: MakeOp) =>
  s.content.kind === "placeholder" ? s.content.description : s.content.kind === "generated" ? ((op === "video" ? s.content.clipPrompt : undefined) ?? s.content.prompt) : "";

/** A shot's takes, as the files they are. */
const takesOf = (p: Project, s: Shot): Asset[] =>
  (s.content.kind === "generated" ? (s.content.takes ?? (s.content.take ? [s.content.take] : [])) : []).flatMap((id) => p.assets.find((a) => a.id === id) ?? []);

/** Converts a completed asset or MakeJob into a Creation Screen launch draft (for Vary / Re-create). */
export function draftFromAssetOrJob(a?: Asset, job?: MakeJob, shotId?: string): CreateLaunch {
  const op: MakeOp = job?.op ?? (a?.kind === "video" ? "video" : "image");
  const params = (a?.provenance?.params ?? {}) as {
    prompt?: string;
    model?: string;
    quality?: Quality;
    start?: string;
    end?: string;
    camera?: Camera;
    drive?: { asset: string; from: number; to?: number };
    speech?: unknown;
    clip?: unknown;
    audioRefs?: AudioRef[];
  };
  const prompt = job?.request.prompt ?? params.prompt ?? a?.provenance?.prompt ?? "";
  const model = job?.model ?? params.model;
  const via = job?.route ?? a?.provenance?.provider;
  const quality: Quality = job?.quality ?? params.quality ?? "rough";
  const shot = job?.shot ?? shotId;
  const camera = job?.request.camera ?? params.camera;
  const drive = job?.request.drive ?? params.drive;
  const speech = job?.request.speech ?? params.speech;
  const clip = job?.request.clip ?? params.clip;
  const audioRefs = job?.request.audioRefs ?? params.audioRefs;
  const start = job?.request.start ?? params.start;
  const end = job?.request.end ?? params.end;
  const audioAssetIds = new Set((audioRefs ?? []).flatMap((x) => ("asset" in x ? [x.asset] : [])));
  const refs = job?.request.refs ?? a?.provenance?.refs?.filter((id) => !audioAssetIds.has(id));

  let inputMode: MakeDraft["inputMode"] = op === "image" ? (refs?.length ? "refs" : "text") : "board";
  let useBlockout = false;
  let blockoutMode: "video" | "sheet" | undefined;
  let legacyCut: string | undefined;
  if (op === "video") {
    if (camera && "blockout" in camera) {
      inputMode = "blockout";
      useBlockout = true;
      blockoutMode = camera.mode ?? "video";
    } else if (camera && "cut" in camera) {
      inputMode = "blockout";
      blockoutMode = camera.mode ?? "video";
      legacyCut = camera.cut;
    } else if (drive) {
      inputMode = "drive";
    } else if (speech) {
      inputMode = "speech";
    } else if (start) {
      inputMode = "board";
    } else if (refs?.length || audioRefs?.length) {
      inputMode = "refs";
    } else {
      inputMode = "text";
    }
  }

  return {
    draft: {
      op,
      quality,
      model,
      via,
      inputMode,
      prompt,
      shot,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(refs?.length ? { refs } : {}),
      ...(audioRefs?.length ? { audioRefs } : {}),
      ...(useBlockout ? { useBlockout } : {}),
      ...(blockoutMode ? { blockoutMode } : {}),
      ...(drive ? { drive } : {}),
      ...(speech ? { speech: true, speechDub: !!clip } : {}),
      ...(job?.request.seconds ? { seconds: job.request.seconds } : a?.duration ? { seconds: Math.round(a.duration) } : {}),
      ...(job?.request.aspect ? { aspect: job.request.aspect } : {}),
      count: 1,
    },
    ...(legacyCut ? { legacyCut } : {}),
  };
}

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
    const board = c.kind === "generated" && (kindOf(c.take)?.kind === "image" || !!c.start || !!c.refs?.some((id) => kindOf(id)?.kind === "image"));
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
  const others =
    p.shots.filter((s) => p.tracks.find((t) => t.id === s.track)?.kind === "picture").length -
    shots.filter((s) => p.tracks.find((t) => t.id === s.track)?.kind === "picture").length;
  if (!shots.length) {
    return (
      <div className="make-empty">
        <h2>No shots to make in this cut</h2>
        <p className="dim">
          Shots that are made rather than filmed show up here: placeholders the agent writes into the cut from your brief, and any you add in Edit. Each gets stills first, then a clip from the one you choose.
        </p>
        <p className="dim small">Meanwhile, describe what you want to make below or open the Creator to start a standalone still or clip.</p>
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
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const [hover, setHover] = useState(false);
  const [over, setOver] = useState(false);
  const c = shot.content;
  const take = c.kind === "generated" && c.take ? p.assets.find((a) => a.id === c.take) : undefined;
  const takes = takesOf(p, shot);
  const stills = takes.filter((a) => a.kind === "image").length;
  const clips = takes.length - stills;
  const text = shotPrompt(shot);
  const hasBlockout = !!shot.blockout?.beats.length || !!(c.kind === "generated" && c.camera && ("blockout" in c.camera || "cut" in c.camera));
  const hasDrive = !!(c.kind === "generated" && c.drive);
  const hasSpeech = !!(c.kind === "generated" && c.speech);
  const hasAudioRefs = !!(c.kind === "generated" && c.audioRefs?.length);
  const takeGuide = take ? guideOfAsset(projectId, doc, cutId, take) : undefined;
  return (
    <button
      className={`shot-card ${over ? "over" : ""}`}
      onClick={() => actions.select({ kind: "shot", id: shot.id })}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
        <span className="shot-guide-badges dim small">
          <span>{[clips && `${clips} clip${clips === 1 ? "" : "s"}`, stills && `${stills} still${stills === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "No takes yet"}</span>
          {(hasBlockout || takeGuide?.kind === "snapshot-video" || takeGuide?.kind === "snapshot-sheet" || takeGuide?.kind === "live-blockout") && (
            <span className="pill small" title="Has a 3D camera blockout">
              <Icon name="camera" size={10} /> Blockout
            </span>
          )}
          {(hasDrive || (takeGuide?.kind === "clip" && takeGuide.role === "drive")) && (
            <span className="pill small" title="Motion-copy guided">
              Motion copy
            </span>
          )}
          {hasSpeech && <span className="pill small">Lip sync</span>}
          {hasAudioRefs && (
            <span className="pill small" title="Guided by reference audio">
              Audio ref
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/**
 * One shot, large: unified GuideCompare stage (works for saved blockout snapshots, 16-frame contact sheets,
 * legacy blockout cuts, motion-copy clips, and versions), clean Clips vs Boards tray under it, and a streamlined
 * Shot Recipe + 1:1 Camera Blockout panel beside it with 1-click Make take… into the full Creation Screen.
 */
export function ShotPage({
  shot,
  jobs,
  back,
  backLabel,
  onCreate,
  onStarted,
  retry,
}: {
  shot: Shot;
  jobs: MakeJob[];
  back: () => void;
  backLabel: string;
  onCreate: (launch: CreateLaunch) => void;
  onStarted: (jobs: MakeJob[]) => void;
  retry?: (job: MakeJob) => void;
}) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const doc = useStore((s) => s.doc);
  const p = useProject();
  const tl = useTimeline();
  const r = tl.shots.find((x) => x.id === shot.id);
  const seconds = r && Number.isFinite(r.end - r.start) ? round2(r.end - r.start) : undefined;
  const c = shot.content;
  const takes = takesOf(p, shot);
  const clips = takes.filter((a) => a.kind === "video");
  const stills = takes.filter((a) => a.kind === "image");
  const showing = c.kind === "generated" ? c.take : undefined;
  const [looking, setLooking] = useState<string>();
  const [large, setLarge] = useState(false);
  const [showAllStills, setShowAllStills] = useState(false);
  const [presetPick, setPresetPick] = useState("orbit");
  const [tweakNote, setTweakNote] = useState("");
  const [rerolling, setRerolling] = useState(false);
  const [rerollError, setRerollError] = useState("");
  const [dismissedFailed, setDismissedFailed] = useState<string[]>([]);

  // A take that's just arrived is the one to look at, and stays pinned in the tray so freshly made stills never hide themselves.
  const last = takes.at(-1)?.id;
  const [seenIds, setSeenIds] = useState<string[]>(() => takes.map((t) => t.id));
  const [freshIds, setFreshIds] = useState<string[]>([]);
  useEffect(() => {
    const added = takes.map((t) => t.id).filter((id) => !seenIds.includes(id));
    if (added.length) {
      setFreshIds((prev) => [...new Set([...prev, ...added])]);
      setLooking(added.at(-1) ?? last);
      setSeenIds(takes.map((t) => t.id));
    }
  }, [takes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = takes.find((a) => a.id === looking) ?? takes.find((a) => a.id === showing) ?? takes.at(-1);
  const lookJob = look ? jobs.find((j) => j.asset === look.id) : undefined;
  const guide = guideOfAsset(projectId, doc, cutId, look);
  const shotJobs = jobs.filter((j) => j.shot === shot.id && (!j.cut || j.cut === cutId));
  const going = shotJobs.filter(isOpen);
  const goingClips = going.filter((j) => j.op === "video");
  const goingStills = going.filter((j) => j.op === "image");
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const failedJobs = shotJobs
    .filter((j) => j.status === "failed" && j.updatedAt >= hourAgo && !dismissedFailed.includes(j.id))
    .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
  const list = shotsToMake(p);
  const at = list.indexOf(shot);
  const go = (s: Shot | undefined) => s && actions.select({ kind: "shot", id: s.id });
  const format = p.formats[0]!;
  const aspect = `${format.width} / ${format.height}`;
  const shape = aspectOf(format.width, format.height);
  const editShot = (fn: (s: Shot) => void) => actions.edit((d) => fn(d.shots.find((s) => s.id === shot.id)!));
  const kind = (a: Asset) => (a.kind === "video" ? (a.provenance?.params?.quality === "final" ? "Final" : "Rough clip") : "Still");

  // Active board still for this shot (used to launch video generation and keep the tray tidy once clips exist).
  const isImg = (id: string | undefined) => !!id && stills.some((s) => s.id === id);
  const activeBoardId =
    (c.kind === "generated" && isImg(c.take) ? c.take : undefined) ??
    (c.kind === "generated" && isImg(c.start) ? c.start : undefined) ??
    (c.kind === "generated" ? c.refs?.find(isImg) : undefined) ??
    stills.at(-1)?.id;
  const activeBoard = activeBoardId ? stills.find((s) => s.id === activeBoardId) : undefined;

  const hasBlockout = !!shot.blockout?.beats.length;
  const currentPrevisMove = shot.blockout?.beats.length === 1 && shot.blockout.beats[0]?.component === "kit:Previs" ? (shot.blockout.beats[0]?.props?.move as string | undefined) : undefined;

  const attachPreset = (presetId: string) => {
    const preset = PREVIS_BY_ID.get(presetId) ?? PREVIS_MOVES[0]!;
    const dur = Math.max(2, Math.min(15, Math.round(seconds ?? 5)));
    editShot((s) => {
      s.blockout = {
        beats: [{ id: preset.id, label: preset.label, duration: dur, component: "kit:Previs", props: { move: preset.id } }],
        mode: s.blockout?.mode ?? "video",
        note: preset.summary,
      };
    });
  };

  const askAgentBlockout = (note?: string) => {
    const text = note?.trim();
    setTweakNote("");
    void answer({
      text: text
        ? `On shot ${shot.id}'s 3D camera blockout: ${text}. Update it using set_blockout (never create a separate cut) and hand off a blockout review.`
        : `Design a 3D camera blockout for shot ${shot.id} (${shot.label ?? shotPrompt(shot)}) using set_blockout (never create a separate cut), and hand off a blockout review so I can check the move before generating video.`,
    });
  };

  // Smart default launch into Creation Screen based on shot stage; if the user selected a specific still, animate that one.
  const boardForVideo = look?.kind === "image" ? look : activeBoard;
  const openMakeTake = (override?: Partial<MakeDraft>) => {
    const defaultOp: MakeOp = override?.op ?? (boardForVideo || hasBlockout ? "video" : "image");
    const defaultInputMode: MakeDraft["inputMode"] =
      override?.inputMode ?? (defaultOp === "image" ? "refs" : hasBlockout ? "blockout" : boardForVideo ? "board" : "board");
    onCreate({
      backLabel: `Shot ${shot.id}`,
      draft: {
        shot: shot.id,
        op: defaultOp,
        quality: clips.length ? "final" : "rough",
        inputMode: defaultInputMode,
        prompt: shotPrompt(shot, defaultOp),
        ...(defaultOp === "video" && boardForVideo && defaultInputMode === "board" ? { start: boardForVideo.id } : {}),
        ...(defaultOp === "video" && boardForVideo && defaultInputMode === "blockout" ? { refs: [boardForVideo.id] } : {}),
        ...(hasBlockout && defaultInputMode === "blockout" ? { useBlockout: true, blockoutMode: shot.blockout?.mode ?? "video" } : {}),
        ...(seconds ? { seconds } : {}),
        count: defaultOp === "image" ? 2 : 1,
        ...override,
      },
    });
  };

  // 1-click re-roll of the currently viewed take using its exact job/provenance recipe.
  const rerollLook = async () => {
    if (!look) return;
    setRerollError("");
    setRerolling(true);
    try {
      const launch = draftFromAssetOrJob(look, lookJob, shot.id);
      const d = launch.draft!;
      const ask: MakeAsk = {
        op: d.op!,
        cut: cutId,
        shot: shot.id,
        prompt: d.prompt || shotPrompt(shot, d.op),
        count: 1,
        ...(d.model ? { model: d.model } : {}),
        ...(d.via ? { via: d.via } : {}),
        ...(d.refs?.length ? { refs: d.refs } : {}),
        ...(d.op === "video"
          ? {
              quality: d.quality ?? "rough",
              ...(d.start ? { start: d.start } : {}),
              end: d.end ?? null,
              drive: d.drive ?? null,
              speech: d.speech ? {} : null,
              ...(d.speech && d.speechDub ? { clip: "take" as const } : {}),
              camera: d.useBlockout
                ? { blockout: true, ...(d.blockoutMode ? { mode: d.blockoutMode } : {}) }
                : launch.legacyCut
                  ? { cut: launch.legacyCut, ...(d.blockoutMode ? { mode: d.blockoutMode } : {}) }
                  : null,
              ...(seconds ? { seconds } : {}),
            }
          : {}),
      };
      const res = await fetch(`/api/projects/${projectId}/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ask) });
      const j = (await res.json()) as { jobs?: MakeJob[]; error?: string };
      if (!res.ok || !j.jobs) throw new Error(j.error ?? `${res.status}`);
      onStarted(j.jobs);
    } catch (e) {
      setRerollError(e instanceof Error ? e.message : String(e));
    } finally {
      setRerolling(false);
    }
  };

  // When clips exist, keep the active board, any stills generated AFTER the latest clip, and any stills that arrived this visit visible; fold only older superseded stills.
  const hasClipsOrGoing = clips.length > 0 || goingClips.length > 0;
  const latestClipAt = clips.reduce((max, cl) => {
    const at = cl.provenance?.createdAt ?? "";
    return at > max ? at : max;
  }, "");
  const pinnedStills =
    hasClipsOrGoing && !showAllStills
      ? stills.filter(
          (s) =>
            s.id === activeBoardId ||
            s.id === look?.id ||
            s.id === showing ||
            freshIds.includes(s.id) ||
            (latestClipAt !== "" && (s.provenance?.createdAt ?? "") > latestClipAt),
        )
      : stills;
  const hiddenStillsCount = stills.length - pinnedStills.length;

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
          {look ? (
            <GuideCompare asset={look} guide={guide} aspect={aspect} onEnlarge={() => setLarge(true)} />
          ) : hasBlockout ? (
            <div className="stage blockout" style={{ aspectRatio: aspect }}>
              <BlockoutPlayer pick={{ blockout: true, shot: shot.id, cut: cutId }} aspect={shape} />
              <span className="stage-tag">Blockout · {blockoutDuration(shot.blockout!)}s</span>
            </div>
          ) : (
            <div className="stage empty" style={{ aspectRatio: aspect }}>
              <div className="stage-idea">
                <p>{shotPrompt(shot) || "Nothing written for this shot yet."}</p>
                <p className="dim small">
                  {going.length ? "Its first takes are on the way." : "No takes yet. Settle a cheap board still first, attach a camera blockout if needed, then generate video."}
                </p>
                {!going.length && (
                  <button className="primary" onClick={() => openMakeTake({ op: "image" })}>
                    Make first stills…
                  </button>
                )}
              </div>
            </div>
          )}

          {look && (
            <div className="stage-bar">
              <span className="small">
                {kind(look)}
                <span className="dim">
                  {[
                    madeWith(look),
                    look.duration ? `${look.duration.toFixed(1)}s` : "",
                    look.provenance?.costUsd !== undefined ? `$${look.provenance.costUsd.toFixed(2)}` : "",
                    look.provenance?.createdAt ? timeAgo(look.provenance.createdAt) : "",
                  ]
                    .filter(Boolean)
                    .map((x) => ` · ${x}`)}
                </span>
              </span>
              {(guide?.kind === "snapshot-video" || guide?.kind === "snapshot-sheet") && (
                <span className="pill small" title="Exact blockout snapshot saved when this take was generated">
                  Saved blockout snapshot
                </span>
              )}
              <span className="spacer" />
              {look.provenance?.source === "generated" && (
                <>
                  <button disabled={rerolling} onClick={() => void rerollLook()} title="Generate 1 more take with the exact same settings">
                    {rerolling ? "Starting…" : "Re-roll"}
                  </button>
                  <button onClick={() => onCreate({ backLabel: `Shot ${shot.id}`, ...draftFromAssetOrJob(look, lookJob, shot.id) })} title="Open this take's settings in the full Creation Screen">
                    Vary…
                  </button>
                </>
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
          {rerollError && <p className="warn small">{rerollError}</p>}
          {failedJobs.length > 0 && (
            <div className="shot-failed-list" role="alert">
              {failedJobs.map((j) => (
                <div key={j.id} className="shot-failed small">
                  <div className="shot-failed-head">
                    <strong>
                      {j.op === "video" ? "Clip" : "Still"} didn&apos;t come · {modelLabel(j.model)}
                    </strong>
                    <span className="dim">{timeAgo(j.updatedAt)}</span>
                    <span className="spacer" />
                    <button
                      className="link small"
                      onClick={() => onCreate({ backLabel: `Shot ${shot.id}`, ...draftFromAssetOrJob(undefined, j, shot.id) })}
                      title="Re-open this prompt and settings in Create to pick another model or adjust inputs"
                    >
                      Edit / change model…
                    </button>
                    {retry && (
                      <button
                        className="link small"
                        onClick={() => retry(j)}
                        title={j.charged ? "It was made; fetch it again, at no cost" : "Ask for it again"}
                      >
                        Try again
                      </button>
                    )}
                    <button
                      className="icon"
                      onClick={() => setDismissedFailed((prev) => [...prev, j.id])}
                      title="Dismiss this error"
                      aria-label="Dismiss error"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                  <p className="shot-failed-msg">{j.error ?? "Generation failed"}</p>
                </div>
              ))}
            </div>
          )}
          {look && <Given a={look} />}

          {/* Video takes (hero tray) */}
          {hasClipsOrGoing && (
            <div className="tray-section">
              <div className="tray-head small dim">
                <span>
                  Clips ({clips.length}
                  {goingClips.length ? ` + ${goingClips.length} making` : ""})
                </span>
              </div>
              <div className="take-tray">
                {clips.map((a) => (
                  <TrayTake
                    key={a.id}
                    a={a}
                    projectId={projectId}
                    looking={a.id === look?.id}
                    showing={a.id === showing}
                    guided={!!guideOfAsset(projectId, doc, cutId, a)}
                    badge={kind(a)}
                    onLook={() => setLooking(a.id)}
                    onUse={() => pickTake(shot.id, a.id, seconds)}
                  />
                ))}
                {goingClips.map((j) => (
                  <div key={j.id} className="tray-take pending" style={{ aspectRatio: aspect }} title={`A clip from ${modelLabel(j.model)} on its way`}>
                    <span>
                      {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
                      <br />
                      {modelLabel(j.model)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Boards / first frames (collapses earlier attempts once clips exist) */}
          {(stills.length > 0 || goingStills.length > 0) && (
            <div className="tray-section">
              <div className="tray-head small dim">
                <span>
                  {hasClipsOrGoing ? "Boards / first frames" : `Stills (${stills.length}${goingStills.length ? ` + ${goingStills.length} making` : ""})`}
                </span>
                {hiddenStillsCount > 0 && (
                  <button className="link small tray-fold" onClick={() => setShowAllStills(true)}>
                    + {hiddenStillsCount} earlier still{hiddenStillsCount === 1 ? "" : "s"}
                  </button>
                )}
                {hasClipsOrGoing && showAllStills && stills.length > 1 && (
                  <button className="link small tray-fold" onClick={() => setShowAllStills(false)}>
                    Collapse earlier stills
                  </button>
                )}
              </div>
              <div className="take-tray">
                {pinnedStills.map((a) => (
                  <TrayTake
                    key={a.id}
                    a={a}
                    projectId={projectId}
                    looking={a.id === look?.id}
                    showing={a.id === showing}
                    badge={a.id === activeBoardId && hasClipsOrGoing ? "Board" : (madeWith(a) ?? "Still")}
                    onLook={() => setLooking(a.id)}
                    onUse={() => pickTake(shot.id, a.id, seconds)}
                  />
                ))}
                {goingStills.map((j) => (
                  <div key={j.id} className="tray-take pending" style={{ aspectRatio: aspect }} title={`A still from ${modelLabel(j.model)} on its way`}>
                    <span>
                      {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
                      <br />
                      {modelLabel(j.model)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shot.intent && shot.intent !== shot.label && (
            <p className="dim small">
              <strong>What it's for.</strong> {shot.intent}
            </p>
          )}
        </section>

        {/* Right column: streamlined Shot Recipe + 1:1 Camera Blockout + Notes */}
        <aside className="shot-make-col inspector">
          <div className="shot-recipe">
            <h4>Make for this shot</h4>
            <p className="small dim shot-recipe-prompt">{shotPrompt(shot) || "No prompt written yet."}</p>
            <div className="shot-recipe-actions">
              <button className="primary" onClick={() => openMakeTake()}>
                <Icon name="add" size={12} /> {boardForVideo || hasBlockout ? (look?.kind === "image" ? "Make video from this still…" : "Make video take…") : "Make board stills…"}
              </button>
              <div className="make-row">
                {(boardForVideo || hasBlockout) && (
                  <button className="small" onClick={() => openMakeTake({ op: "image" })} title="Generate fresh board stills for this shot">
                    New board stills…
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="shot-blockout-card">
            <div className="make-row">
              <h4>Camera blockout</h4>
              <span className="spacer" />
              {hasBlockout && <span className="mono dim small">{blockoutDuration(shot.blockout!)}s</span>}
            </div>
            {hasBlockout ? (
              <>
                <div className="camera-preview" style={{ aspectRatio: aspect }}>
                  <BlockoutPlayer pick={{ blockout: true, shot: shot.id, cut: cutId }} aspect={shape} />
                </div>
                <p className="dim small">
                  {shot.blockout!.beats.map((b) => b.label ?? b.id).join(" → ")}
                  {shot.blockout!.note ? ` · ${shot.blockout!.note}` : ""}
                </p>
                <div className="make-row small">
                  <div className="segmented" role="group" aria-label="Default delivery mode">
                    <button
                      className={(shot.blockout!.mode ?? "video") === "video" ? "on" : ""}
                      onClick={() => editShot((s) => s.blockout && void (s.blockout.mode = "video"))}
                      title="Send rendered MP4 reference video (Seedance 2.5 exact timing)"
                    >
                      Reference clip
                    </button>
                    <button
                      className={shot.blockout!.mode === "sheet" ? "on" : ""}
                      onClick={() => editShot((s) => s.blockout && void (s.blockout.mode = "sheet"))}
                      title="Send 4×4 16-frame contact sheet as reference image (no video surcharge)"
                    >
                      16-frame sheet
                    </button>
                  </div>
                </div>
                <div className="make-row small">
                  <select
                    value={currentPrevisMove ?? ""}
                    onChange={(e) => e.target.value && attachPreset(e.target.value)}
                    aria-label="Swap camera preset"
                    title="Replace with a quick 3D camera preset"
                  >
                    <option value="">{currentPrevisMove ? "Swap preset…" : "Custom blockout (swap preset…)"}</option>
                    {PREVIS_MOVES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="make-row">
                  <input
                    className="slot-tweak-input"
                    value={tweakNote}
                    onChange={(e) => setTweakNote(e.target.value)}
                    placeholder='Ask agent to tweak (e.g. "slower orbit")…'
                    onKeyDown={(e) => e.key === "Enter" && tweakNote.trim() && askAgentBlockout(tweakNote)}
                  />
                  <button className="small" disabled={!tweakNote.trim()} onClick={() => askAgentBlockout(tweakNote)}>
                    Send
                  </button>
                </div>
                <div className="make-row">
                  <button
                    className="small"
                    onClick={() => openMakeTake({ op: "video", inputMode: "blockout", useBlockout: true, blockoutMode: shot.blockout?.mode ?? "video" })}
                  >
                    Generate from blockout…
                  </button>
                  <span className="spacer" />
                  <button className="link danger small" onClick={() => editShot((s) => void delete s.blockout)}>
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="dim small">1:1 3D camera guide for this shot (no separate cut). Pick a shot-type preset or ask the agent to block it out.</p>
                <div className="make-row small">
                  <select value={presetPick} onChange={(e) => setPresetPick(e.target.value)} aria-label="Camera preset">
                    {PREVIS_MOVES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <button className="small" onClick={() => attachPreset(presetPick)}>
                    Use preset
                  </button>
                </div>
                <button className="small" onClick={() => askAgentBlockout()}>
                  Ask agent to block it out
                </button>
              </>
            )}
          </div>

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
 * What a take was made from, for one that came out wrong to be traced to what went in: every picture, driving clip,
 * and camera blockout snapshot it was given, each named for the part it played, plus the words it was told.
 */
export function Given({ a }: { a: Asset }) {
  const projectId = useStore((s) => s.projectId)!;
  const doc = useStore((s) => s.doc);
  const p = useProject();
  const made = a.provenance;
  if (made?.source !== "generated") return null;
  const asked = (made.params ?? {}) as {
    prompt?: string;
    start?: string;
    end?: string;
    drive?: { asset?: string };
    clip?: { asset?: string };
    camera?: Camera & { snapshot?: string; snapshotKind?: "video" | "image" };
    audioRefs?: AudioRef[];
  };
  const camAsset = asked.camera && "asset" in asked.camera ? asked.camera.asset : undefined;
  const audioRefs = asked.audioRefs ?? [];
  const audioOnlyIds = new Set(audioRefs.flatMap((ar) => ("asset" in ar && p.assets.find((x) => x.id === ar.asset)?.kind !== "image" ? [ar.asset] : [])));
  const part = (id: string) =>
    id === asked.start
      ? "Starts from"
      : id === asked.end
        ? "Ends on"
        : id === asked.drive?.asset
          ? "Moves like"
          : id === asked.clip?.asset
            ? "Mouths changed in"
            : id === camAsset
              ? "Camera of"
              : "Reference";
  const from = [...new Set([asked.start, asked.end, asked.drive?.asset, asked.clip?.asset, camAsset, ...(made.refs ?? [])].filter((id): id is string => !!id && !audioOnlyIds.has(id)))];
  const camBlockout = asked.camera && ("blockout" in asked.camera || "cut" in asked.camera) ? asked.camera : undefined;
  const told = asked.prompt ?? made.prompt;
  if (!from.length && !camBlockout && !audioRefs.length && !told) return null;
  const audioText = (ar: AudioRef) =>
    ar.kind === "music"
      ? `Music ${round2(ar.from)}–${round2(ar.to)}s`
      : ar.kind === "speech"
        ? `Lines ${ar.lines.join(", ")}`
        : ar.kind === "voice"
          ? `@${ar.cast} voice`
          : `${ar.label ?? ar.asset} ${round2(ar.from)}–${round2(ar.to)}s`;
  return (
    <div className="given">
      {(from.length > 0 || camBlockout || audioRefs.length > 0) && (
        <div className="given-pics">
          <span className="dim small">Made from</span>
          {camBlockout && (
            <button
              className="given-pic blockout"
              onClick={() => {
                if ("blockout" in camBlockout && p.shots.some((s) => s.id === camBlockout.shot)) actions.select({ kind: "shot", id: camBlockout.shot });
                else if ("cut" in camBlockout && doc?.cuts.some((c) => c.id === camBlockout.cut)) {
                  actions.visitCut(camBlockout.cut);
                  actions.setMode("edit");
                }
              }}
              title={
                "blockout" in camBlockout
                  ? `Blockout of shot ${camBlockout.shot}${camBlockout.snapshot ? ` (snapshot saved)` : ""}`
                  : `Legacy blockout cut: ${doc?.cuts.find((c) => c.id === camBlockout.cut)?.name ?? camBlockout.cut}`
              }
            >
              {camBlockout.snapshot && (camBlockout.snapshotKind === "image" || camBlockout.mode === "sheet") ? (
                <img src={projectFileUrl(projectId, camBlockout.snapshot)} loading="lazy" alt="" onError={hideBroken} />
              ) : (
                <span className="given-pic-icon">
                  <Icon name="camera" size={16} />
                </span>
              )}
              <span>{camBlockout.mode === "sheet" ? "Blockout sheet" : "Blockout"}</span>
            </button>
          )}
          {from.map((id) => {
            const x = p.assets.find((y) => y.id === id);
            return (
              <button key={id} className="given-pic" disabled={!x} onClick={() => actions.select({ kind: "asset", id })} title={`${part(id)}: ${x ? (x.label ?? id) : `${id} (not in the project any more)`}`}>
                {x && <img src={posterUrl(projectId, id)} loading="lazy" alt="" onError={hideBroken} />}
                <span>{part(id)}</span>
              </button>
            );
          })}
          {audioRefs.map((ar, idx) => {
            const targetId = "asset" in ar ? ar.asset : undefined;
            const target = targetId ? p.assets.find((y) => y.id === targetId) : undefined;
            return (
              <button
                key={`aud-${idx}`}
                className="given-pic audio"
                disabled={!target}
                onClick={() => target && actions.select({ kind: "asset", id: target.id })}
                title={`Audio reference: ${audioText(ar)}`}
              >
                <span className="given-pic-icon">
                  <Icon name={ar.kind === "music" ? "music" : "mic"} size={16} />
                </span>
                <span>{audioText(ar)}</span>
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
function TrayTake({
  a,
  projectId,
  looking,
  showing,
  guided,
  badge,
  onLook,
  onUse,
}: {
  a: Asset;
  projectId: string;
  looking: boolean;
  showing: boolean;
  guided?: boolean;
  badge: string;
  onLook: () => void;
  onUse: () => void;
}) {
  const [hover, setHover] = useState(false);
  const video = a.kind === "video";
  return (
    <button
      className={`tray-take ${looking ? "viewing" : ""} ${showing ? "on" : ""}`}
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
        {guided && (
          <>
            {" "}
            <Icon name="camera" size={9} />
          </>
        )}
      </span>
      {showing && (
        <span className="tray-in" title="The take the cut shows">
          <Icon name="check" size={10} />
        </span>
      )}
    </button>
  );
}
