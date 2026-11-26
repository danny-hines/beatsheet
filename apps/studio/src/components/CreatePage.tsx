/**
 * Full-width, model-driven Creation Screen: ingredient slots dynamically reshape to match the selected model & directing
 * mode (stills + cast refs, start/end board video, 3D blockout camera + refs, motion-copy drive clip, or lip-sync),
 * paired with a live Flight Check showing everything that will be sent and what it costs.
 */
import { useEffect, useMemo, useState } from "react";
import type { MakeAsk, MakeDraft, MakeInputMode, MakeJob, MakePlan } from "@beatsheet/engine";
import {
  aspectOf,
  blockoutDuration,
  CATALOG,
  castOf,
  castPictures,
  PREVIS_BY_ID,
  PREVIS_MOVES,
  resolveTimeline,
  type Asset,
  type CatalogModel,
  type MakeOp,
  type Quality,
  type Shot,
} from "@beatsheet/schema";
import { ASSET_DRAG, hideBroken, posterUrl, round2 } from "../lib";
import { actions, useProject, useStore, useTimeline } from "../store";
import { blockoutCuts, BlockoutPlayer } from "./Blockout";
import { Icon } from "./Icon";
import { shotPrompt, shotsToMake } from "./MakeShots";
import { cost, fitOf, ModelPicker, pickOf, useChoices, WhyNot } from "./Takes";
import { answer } from "./Turn";

export type CreateLaunch = {
  draft?: Partial<MakeDraft>;
  plan?: MakePlan;
  backLabel?: string;
  legacyCut?: string;
};

const INPUT_MODES: { id: MakeInputMode; label: string; hint: string }[] = [
  { id: "board", label: "From board", hint: "Start from a still frame (+ optional end frame)" },
  { id: "blockout", label: "Blockout camera", hint: "Follow a 3D camera blockout (MP4 or 16-frame sheet) + reference pictures" },
  { id: "refs", label: "References", hint: "Animate from reference pictures without a locked first frame" },
  { id: "drive", label: "Copy movement", hint: "Transfer body motion from a clip onto your board" },
  { id: "speech", label: "Lip sync", hint: "Make a board talk or re-sync mouths to voiced lines" },
  { id: "text", label: "Prompt only", hint: "Generate video directly from words" },
];

/** Capabilities summary pills for a catalog model. */
function modelBadges(m: CatalogModel | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (m.ops.includes("image")) {
    if (m.takes.refs) out.push(`Up to ${m.takes.refs} refs`);
    else out.push("Prompt only");
    return out;
  }
  if (m.takes.start) out.push(m.takes.end ? "Start + End" : "Start frame");
  if (m.takes.refs) out.push(`Up to ${m.takes.refs} refs`);
  if (m.takes.camera) out.push("Blockout video");
  else if (m.takes.refs) out.push("16-frame sheet");
  if (m.takes.drive) out.push("Motion copy");
  if (m.takes.speech) out.push(m.takes.clip ? "Lip sync + Dub" : "Lip sync");
  if (m.sound) out.push("Sound");
  return out;
}

/** Which video input modes a given model supports. */
function supportedModes(m: CatalogModel | undefined): MakeInputMode[] {
  if (!m) return ["board", "blockout", "refs", "drive", "speech", "text"];
  const modes: MakeInputMode[] = [];
  if (m.takes.start && !m.takes.drive && !m.takes.speech) modes.push("board");
  if (m.takes.camera || (m.takes.refs ?? 0) > 0) modes.push("blockout");
  if ((m.takes.refs ?? 0) > 0) modes.push("refs");
  if (m.takes.drive) modes.push("drive");
  if (m.takes.speech) modes.push("speech");
  if (m.routes.some((r) => r.endpoints.text)) modes.push("text");
  return modes.length ? modes : ["text"];
}

/** Best board still on a shot, if it has one. */
function boardOfShot(assets: Asset[], shot: Shot | undefined): string | undefined {
  if (!shot || shot.content.kind !== "generated") return undefined;
  const c = shot.content;
  const isImg = (id: string | undefined) => !!id && assets.find((a) => a.id === id)?.kind === "image";
  if (isImg(c.take)) return c.take;
  if (isImg(c.start)) return c.start;
  return c.refs?.find(isImg) ?? [...(c.takes ?? [])].reverse().find(isImg);
}

export function CreatePage({
  launch,
  onStarted,
  onClose,
}: {
  launch: CreateLaunch;
  onStarted: (jobs: MakeJob[], shotId?: string) => void;
  onClose: () => void;
}) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const doc = useStore((s) => s.doc);
  const p = useProject();
  const tl = useTimeline();
  const format = p.formats[0]!;
  const defaultAspect = aspectOf(format.width, format.height);

  const initial = launch.draft ?? launch.plan?.draft ?? {};
  const initShot = initial.shot ? p.shots.find((s) => s.id === initial.shot) : undefined;
  const initBoard = initial.start ?? boardOfShot(p.assets, initShot);
  const initOp: MakeOp = initial.op ?? (initShot && (initBoard || initShot.blockout) ? "video" : "image");

  const [shotId, setShotId] = useState(initial.shot ?? "");
  const [op, setOp] = useState<MakeOp>(initOp);
  const [quality, setQuality] = useState<Quality>(initial.quality ?? "rough");
  const [modelPick, setModelPick] = useState(initial.model ? (initial.via ? `${initial.model}@${initial.via}` : initial.model) : "");
  const [inputMode, setInputMode] = useState<MakeInputMode>(
    initial.inputMode ?? (initOp === "image" ? "refs" : initShot?.blockout || initial.useBlockout ? "blockout" : initBoard ? "board" : "board"),
  );
  const [prompt, setPrompt] = useState(initial.prompt ?? (initShot ? shotPrompt(initShot, initOp) : ""));
  const [start, setStart] = useState<string | undefined>(initBoard);
  const [end, setEnd] = useState<string | undefined>(initial.end ?? (initShot?.content.kind === "generated" ? initShot.content.end : undefined));
  const [refs, setRefs] = useState<string[]>(initial.refs ?? (initOp === "video" && initBoard && (initial.inputMode === "blockout" || initShot?.blockout) ? [initBoard] : []));
  const [blockoutMode, setBlockoutMode] = useState<"video" | "sheet">(initial.blockoutMode ?? initShot?.blockout?.mode ?? "video");
  const [legacyCut, setLegacyCut] = useState<string>(launch.legacyCut ?? "");
  const [blockoutPreset, setBlockoutPreset] = useState(initial.blockoutPreset ?? "orbit");
  const [tweakText, setTweakText] = useState("");
  const [drive, setDrive] = useState<{ asset: string; from: number; to?: number } | undefined>(
    initial.drive ?? (initShot?.content.kind === "generated" ? initShot.content.drive : undefined),
  );
  const [speechDub, setSpeechDub] = useState(!!initial.speechDub);
  const [seconds, setSeconds] = useState<number>(initial.seconds ?? 5);
  const [aspect, setAspect] = useState<string>(initial.aspect ?? defaultAspect);
  const [count, setCount] = useState<number>(initial.count ?? (initOp === "image" ? 2 : 1));
  const [activeStep, setActiveStep] = useState<number>(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pickingSlot, setPickingSlot] = useState<"start" | "end" | "ref" | undefined>();
  const [overSlot, setOverSlot] = useState<string>();

  const shot = shotId ? p.shots.find((s) => s.id === shotId) : undefined;
  const resolved = shot ? tl.shots.find((r) => r.id === shot.id) : undefined;
  const shotSeconds = resolved && Number.isFinite(resolved.end - resolved.start) ? round2(resolved.end - resolved.start) : undefined;
  const legacyBlockouts = useMemo(() => blockoutCuts(doc, cutId), [doc, cutId]);
  const clips = useMemo(() => p.assets.filter((a) => a.kind === "video" && !a.cutout && !a.version && a.provenance?.source !== "generated"), [p.assets]);
  const images = useMemo(() => p.assets.filter((a) => a.kind === "image" && !a.cutout), [p.assets]);

  // Apply a recipe step from Smart Prep.
  const applyStep = (idx: number, d: MakeDraft) => {
    setActiveStep(idx);
    setOp(d.op);
    setQuality(d.quality);
    setModelPick(d.model ? (d.via ? `${d.model}@${d.via}` : d.model) : "");
    setInputMode(d.inputMode);
    setPrompt(d.prompt);
    if (d.start) setStart(d.start);
    if (d.refs) setRefs(d.refs);
    if (d.blockoutMode) setBlockoutMode(d.blockoutMode);
    if (d.blockoutPreset) setBlockoutPreset(d.blockoutPreset);
    if (d.seconds) setSeconds(d.seconds);
    setCount(d.count);
    setError("");
  };

  // Switch target shot cleanly, pre-populating its prompt, board and blockout if available.
  const changeShot = (nextId: string) => {
    setShotId(nextId);
    const s = nextId ? p.shots.find((x) => x.id === nextId) : undefined;
    if (!s) return;
    const b = boardOfShot(p.assets, s);
    if (b) {
      setStart(b);
      if (inputMode === "blockout" && !refs.includes(b)) setRefs([b, ...refs]);
    }
    if (s.blockout) setBlockoutMode(s.blockout.mode ?? "video");
    if (!prompt.trim()) setPrompt(shotPrompt(s, op));
  };

  // Debounce prompt for model-fit queries.
  const [settledPrompt, setSettledPrompt] = useState(prompt);
  useEffect(() => {
    const t = setTimeout(() => setSettledPrompt(prompt), 350);
    return () => clearTimeout(t);
  }, [prompt]);

  // Voice lines heard while this shot plays (for lip-sync mode).
  const namedCast = useMemo(() => castOf(prompt, p.cast, shot?.content.kind === "generated" ? shot.content.cast : undefined).filter((u) => u.member.kind !== "style"), [prompt, p.cast, shot]);
  const heardLines = useMemo(() => {
    if (!shot) return [];
    const voiced = p.voice?.lines ?? [];
    if (!voiced.length) return [];
    const full = resolveTimeline(p, p.formats[0]!.id);
    const r = full.shots.find((s) => s.id === shot.id);
    const all = r ? full.lines.filter((l) => l.end > r.start + 1e-6 && l.start < r.end - 1e-6) : [];
    const theirs = all.filter((l) => namedCast.some((u) => u.member.kind === "character" && u.member.id === voiced.find((v) => v.id === l.id)?.speaker));
    return (theirs.length ? theirs : all).map((l) => ({ ...l, voiced: !!voiced.find((v) => v.id === l.id)?.file }));
  }, [p, shot, namedCast]);

  const showingTakeId = shot?.content.kind === "generated" ? shot.content.take : undefined;
  const showingVideo = !!showingTakeId && p.assets.find((a) => a.id === showingTakeId)?.kind === "video";
  const hasShotBlockout = !!shot?.blockout?.beats.length;
  const activeCameraQuery =
    op !== "video"
      ? {}
      : inputMode === "blockout"
        ? hasShotBlockout
          ? { camera: "blockout", cameraMode: blockoutMode }
          : legacyCut
            ? { camera: legacyCut, cameraMode: blockoutMode }
            : { camera: "none" }
        : { camera: "none" };

  const activeStart = op === "video" && (inputMode === "board" || inputMode === "drive" || (inputMode === "speech" && !(speechDub && showingVideo))) ? start : undefined;
  const activeEnd = op === "video" && inputMode === "board" && activeStart ? end : undefined;
  const activeRefs = op === "image" || (op === "video" && (inputMode === "refs" || inputMode === "blockout")) ? refs : [];
  const activeDrive = op === "video" && inputMode === "drive" && drive ? { drive: drive.asset, from: drive.from, to: drive.to } : { drive: "none" };
  const activeSpeech = op === "video" && inputMode === "speech" ? { speech: "lines", ...(speechDub && showingVideo ? { clip: "take" } : {}) } : { speech: "none" };
  const effectiveSeconds = op === "video" ? (shotSeconds ?? seconds) : undefined;

  const { choices, problem, absent } = useChoices({
    op,
    cut: cutId,
    shot: shot?.id,
    prompt: settledPrompt,
    count,
    seconds: effectiveSeconds,
    aspect: shot ? undefined : aspect,
    quality: op === "video" ? quality : undefined,
    start: activeStart,
    end: op === "video" ? (activeEnd ?? "none") : undefined,
    refs: activeRefs.length ? activeRefs.join(",") : undefined,
    ...(op === "video" ? activeDrive : {}),
    ...(op === "video" ? activeSpeech : {}),
    ...activeCameraQuery,
  });

  // When a specific model is selected, automatically adapt inputMode if the chosen model only works in another paradigm.
  const pickedModelId = pickOf(modelPick).model;
  const chosenFit = fitOf(choices, modelPick);
  const catalogModel = CATALOG.find((m) => m.id === (pickedModelId ?? chosenFit?.model));
  const activeRoute = catalogModel?.routes.find((r) => r.via === (pickOf(modelPick).via ?? chosenFit?.route));
  const allowedModes = useMemo(() => (op === "video" ? supportedModes(pickedModelId ? catalogModel : undefined) : (["refs", "text"] as MakeInputMode[])), [op, pickedModelId, catalogModel]);

  const selectModel = (next: string) => {
    setModelPick(next);
    const mid = pickOf(next).model;
    if (op === "video" && mid) {
      const cm = CATALOG.find((m) => m.id === mid);
      const sup = supportedModes(cm);
      if (!sup.includes(inputMode)) setInputMode(sup[0]!);
      if (cm && !cm.takes.camera && (cm.takes.refs ?? 0) > 0 && inputMode === "blockout") setBlockoutMode("sheet");
    }
  };

  // Max references allowed by the currently selected model + route.
  const maxRefs = activeRoute?.takes?.refs ?? catalogModel?.takes.refs ?? (op === "image" ? 10 : 10);
  const takesEnd = op === "video" && inputMode === "board" && (catalogModel ? !!catalogModel.takes.end && activeRoute?.takes?.end !== false : true);

  // Auto-resolved cast pictures when no manual ref list overrides stills.
  const autoCastPics = useMemo(() => (op === "image" && !refs.length ? castPictures(castOf(prompt, p.cast), maxRefs || 4) : []), [op, refs.length, prompt, p.cast, maxRefs]);
  const unknownCast = [...prompt.matchAll(/@([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]!).filter((id) => !p.cast?.some((m) => m.id === id));
  const styleMember = p.look?.style ? p.cast?.find((m) => m.id === p.look!.style && m.kind === "style") : undefined;

  // Quickly attach a kit:Previs preset blockout directly onto the target shot (never creating a separate cut).
  const attachPresetBlockout = (presetId: string) => {
    if (!shot) return;
    const preset = PREVIS_BY_ID.get(presetId) ?? PREVIS_MOVES[0]!;
    const dur = Math.max(2, Math.min(15, Math.round(shotSeconds ?? seconds ?? 5)));
    actions.edit((d) => {
      const s = d.shots.find((x) => x.id === shot.id);
      if (!s) return;
      s.blockout = {
        beats: [{ id: preset.id, label: preset.label, duration: dur, component: "kit:Previs", props: { move: preset.id } }],
        mode: blockoutMode,
        note: preset.summary,
      };
    });
  };

  const askAgentBlockout = () => {
    const target = shot ? `shot ${shot.id}` : "this idea";
    const extra = tweakText.trim();
    setTweakText("");
    void answer({
      text: extra
        ? `On ${target}'s 3D camera blockout: ${extra}. Update it with set_blockout (never create a separate cut) and hand off a blockout review.`
        : `Design a 3D camera blockout for ${target} matching "${prompt.trim() || shot?.intent || shot?.label || "this shot"}" using set_blockout (never create a separate cut), and hand off a blockout review so I can approve the move before generating video.`,
    });
  };

  const make = async () => {
    setError("");
    setSending(true);
    const ask: MakeAsk = {
      op,
      cut: cutId,
      prompt: prompt.trim(),
      count,
      ...(shot ? { shot: shot.id } : { aspect }),
      ...pickOf(modelPick),
      ...(activeRefs.length ? { refs: activeRefs } : {}),
      ...(op === "video"
        ? {
            quality,
            ...(activeStart ? { start: activeStart } : {}),
            end: activeEnd ?? null,
            drive: inputMode === "drive" && drive ? drive : null,
            speech: inputMode === "speech" ? {} : null,
            ...(inputMode === "speech" && speechDub && showingVideo ? { clip: "take" as const } : {}),
            camera:
              inputMode === "blockout"
                ? hasShotBlockout
                  ? { blockout: true, mode: blockoutMode }
                  : legacyCut
                    ? { cut: legacyCut, mode: blockoutMode }
                    : null
                : null,
            ...(effectiveSeconds ? { seconds: effectiveSeconds } : {}),
          }
        : {}),
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ask) });
      const j = (await res.json()) as { jobs?: MakeJob[]; error?: string };
      if (!res.ok || !j.jobs) throw new Error(j.error ?? `${res.status}`);
      onStarted(j.jobs, shot?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const aspects = [...new Set([...p.formats.map((f) => aspectOf(f.width, f.height)), "16:9", "9:16", "1:1", "4:5"])];
  const what = op === "image" ? (count === 1 ? "still" : "stills") : `${quality} ${count === 1 ? "clip" : "clips"}`;
  const missingBlockout = op === "video" && inputMode === "blockout" && !hasShotBlockout && !legacyCut;
  const missingStart = op === "video" && (inputMode === "board" || inputMode === "drive") && !activeStart;
  const missingDrive = op === "video" && inputMode === "drive" && !drive;
  const canSubmit = !!chosenFit && !!prompt.trim() && !sending && !missingBlockout && !missingDrive;

  const flightPics: { id: string; part: string; label: string }[] = [
    ...(activeStart ? [{ id: activeStart, part: "Starts from", label: p.assets.find((a) => a.id === activeStart)?.label ?? activeStart }] : []),
    ...(activeEnd ? [{ id: activeEnd, part: "Ends on", label: p.assets.find((a) => a.id === activeEnd)?.label ?? activeEnd }] : []),
    ...(activeRefs.length
      ? activeRefs.map((id) => ({ id, part: "Reference", label: p.assets.find((a) => a.id === id)?.label ?? id }))
      : autoCastPics.map((x) => ({ id: x.asset, part: `@${x.use.id}`, label: x.use.member.name }))),
  ];

  const dropAsset = (slot: "start" | "end" | "ref") => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(ASSET_DRAG)) return;
      e.preventDefault();
      setOverSlot(slot);
    },
    onDragLeave: () => setOverSlot(undefined),
    onDrop: (e: React.DragEvent) => {
      setOverSlot(undefined);
      const a = p.assets.find((x) => x.id === e.dataTransfer.getData(ASSET_DRAG));
      if (!a || a.kind !== "image") return;
      e.preventDefault();
      if (slot === "start") setStart(a.id);
      else if (slot === "end") setEnd(a.id);
      else if (!refs.includes(a.id) && refs.length < Math.max(1, maxRefs)) setRefs([...refs, a.id]);
    },
  });

  return (
    <div className="make-page create-page">
      <header className="page-head">
        <button className="back" onClick={onClose}>
          <Icon name="back" size={12} /> {launch.backLabel ?? "Back"}
        </button>
        <h2>Create {op === "image" ? "stills" : "video"}</h2>
        <select className="create-target" value={shotId} onChange={(e) => changeShot(e.target.value)} aria-label="Target">
          <option value="">Standalone (Library)</option>
          {shotsToMake(p).map((s) => (
            <option key={s.id} value={s.id}>
              Shot {s.id}: {(s.label ?? shotPrompt(s)).slice(0, 42)}
            </option>
          ))}
        </select>
        <div className="segmented">
          <button
            className={op === "image" ? "on" : ""}
            onClick={() => {
              setOp("image");
              setModelPick("");
              setCount(2);
            }}
          >
            Stills
          </button>
          <button
            className={op === "video" ? "on" : ""}
            onClick={() => {
              setOp("video");
              setModelPick("");
              setCount(1);
              if (inputMode === "text" && start) setInputMode("board");
            }}
          >
            Video
          </button>
        </div>
        {op === "video" && (
          <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} aria-label="Quality">
            <option value="rough">Rough</option>
            <option value="final">Final</option>
          </select>
        )}
        <span className="spacer" />
      </header>

      {launch.plan && (
        <section className="create-plan-banner">
          <div className="create-plan-head">
            <strong className="small">Suggested workflow</strong>
            {launch.plan.by && <span className="dim small">· planned by {launch.plan.by.model ?? launch.plan.by.agent}</span>}
          </div>
          <p className="small">{launch.plan.rationale}</p>
          {launch.plan.steps && launch.plan.steps.length > 1 && (
            <div className="create-plan-steps">
              {launch.plan.steps.map((st, i) => (
                <button key={i} className={`create-step ${activeStep === i ? "on" : ""}`} onClick={() => applyStep(i, st.draft)}>
                  <strong>{st.label}</strong>
                  {st.costHint && <span className="dim small"> · {st.costHint}</span>}
                  {st.detail && <span className="dim small create-step-detail">{st.detail}</span>}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="create-cols">
        <section className="create-main">
          {/* 1. Model & Route */}
          <div className="create-section">
            <div className="create-section-head">
              <h4>Model</h4>
              <div className="create-badges">
                {modelBadges(catalogModel).map((b) => (
                  <span key={b} className="pill small">
                    {b}
                  </span>
                ))}
              </div>
            </div>
            <div className="make-row">
              <ModelPicker choices={choices} model={modelPick} setModel={selectModel} />
              {op === "video" && !shot && (
                <label className="small seconds" title="Clip length in seconds">
                  <input type="number" min={2} max={30} step={1} value={seconds} onChange={(e) => setSeconds(Math.max(2, Math.min(30, Number(e.target.value) || 5)))} />s
                </label>
              )}
              {!shot && !(op === "video" && activeStart) && (
                <select value={aspect} onChange={(e) => setAspect(e.target.value)} aria-label="Aspect ratio">
                  {aspects.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {catalogModel?.note && <p className="dim small">{catalogModel.note}</p>}
          </div>

          {/* 2. Video Directing Mode (adapts to model capabilities) */}
          {op === "video" && (
            <div className="create-section">
              <h4>How to direct this clip</h4>
              <div className="chips create-modes" role="radiogroup" aria-label="Directing method">
                {INPUT_MODES.map((m) => {
                  const supported = allowedModes.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      role="radio"
                      aria-checked={inputMode === m.id}
                      className={`chip ${inputMode === m.id ? "on" : ""} ${supported ? "" : "dim"}`}
                      onClick={() => {
                        setInputMode(m.id);
                        if (pickedModelId && !supported) setModelPick("");
                        if (m.id === "blockout" && start && !refs.includes(start)) setRefs([start, ...refs]);
                        if (m.id === "drive" && !drive && clips.length) setDrive({ asset: clips[0]!.id, from: 0 });
                      }}
                      title={m.hint}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Dynamic Ingredient Slots */}
          <div className="create-section">
            <h4>Ingredients for {catalogModel?.label ?? (op === "image" ? "stills" : "this clip")}</h4>
            <div className="create-slots">
              {/* Start Frame slot (board / drive / talking-still speech) */}
              {op === "video" && (inputMode === "board" || inputMode === "drive" || (inputMode === "speech" && !(speechDub && showingVideo))) && (
                <div className={`slot-card ${overSlot === "start" ? "over" : ""}`} {...dropAsset("start")}>
                  <div className="slot-head">
                    <strong>{inputMode === "drive" ? "Character board (start frame)" : "Start frame (board)"}</strong>
                    {start && (
                      <button className="link small" onClick={() => setStart(undefined)}>
                        Clear
                      </button>
                    )}
                  </div>
                  {start ? (
                    <div className="slot-picked">
                      <img src={posterUrl(projectId, start)} alt="" onError={hideBroken} />
                      <div className="slot-picked-meta">
                        <span className="small">{p.assets.find((a) => a.id === start)?.label ?? start}</span>
                        <button className="link small" onClick={() => setPickingSlot("start")}>
                          Change…
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="slot-empty">
                      <p className="dim small">Settle a cheap board still first so framing, cast and lighting are locked before spending video tokens.</p>
                      <div className="make-row">
                        <button
                          className="primary small"
                          onClick={() => {
                            setOp("image");
                            setModelPick("");
                            setCount(2);
                          }}
                        >
                          Make board stills first
                        </button>
                        {images.length > 0 && (
                          <button className="small" onClick={() => setPickingSlot("start")}>
                            Pick picture…
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* End Frame slot (only when model & route support it) */}
              {takesEnd && activeStart && (
                <div className={`slot-card ${overSlot === "end" ? "over" : ""}`} {...dropAsset("end")}>
                  <div className="slot-head">
                    <strong>End frame</strong> <span className="dim small">(optional)</span>
                    {end && (
                      <button className="link small" onClick={() => setEnd(undefined)}>
                        Clear
                      </button>
                    )}
                  </div>
                  {end ? (
                    <div className="slot-picked">
                      <img src={posterUrl(projectId, end)} alt="" onError={hideBroken} />
                      <div className="slot-picked-meta">
                        <span className="small">{p.assets.find((a) => a.id === end)?.label ?? end}</span>
                        <button className="link small" onClick={() => setPickingSlot("end")}>
                          Change…
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="small" onClick={() => setPickingSlot("end")} disabled={!images.length}>
                      + Pick end frame…
                    </button>
                  )}
                </div>
              )}

              {/* 3D Camera Blockout slot */}
              {op === "video" && inputMode === "blockout" && (
                <div className="slot-card slot-wide">
                  <div className="slot-head">
                    <strong>3D Camera Blockout</strong>
                    <span className="spacer" />
                    <div className="segmented" role="group" aria-label="Blockout delivery mode">
                      <button
                        className={blockoutMode === "video" ? "on" : ""}
                        onClick={() => setBlockoutMode("video")}
                        title="Reference MP4 (Seedance 2.5 exact frame timing; bills blockout seconds too)"
                      >
                        Reference clip
                      </button>
                      <button
                        className={blockoutMode === "sheet" ? "on" : ""}
                        onClick={() => setBlockoutMode("sheet")}
                        title="4×4 16-frame storyboard sheet sent as a reference image (no video surcharge; works on Wan 3.0, MiniMax H3, HappyHorse & Seedance)"
                      >
                        16-frame sheet
                      </button>
                    </div>
                  </div>

                  {shot && hasShotBlockout ? (
                    <>
                      <div className="camera-preview" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
                        <BlockoutPlayer pick={{ blockout: true, shot: shot.id, cut: cutId, mode: blockoutMode }} aspect={aspect} />
                      </div>
                      <p className="dim small">
                        Shot {shot.id}'s blockout ({blockoutDuration(shot.blockout!)}s) · an immutable snapshot will be saved with this take so you can always compare side by side.
                      </p>
                      <div className="make-row">
                        <input
                          className="slot-tweak-input"
                          value={tweakText}
                          onChange={(e) => setTweakText(e.target.value)}
                          placeholder='Ask agent to adjust (e.g. "slower camera move")…'
                          onKeyDown={(e) => e.key === "Enter" && tweakText.trim() && askAgentBlockout()}
                        />
                        <button className="small" disabled={!tweakText.trim()} onClick={askAgentBlockout}>
                          Ask agent
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="slot-empty">
                      {shot ? (
                        <>
                          <p className="dim small">Attach a 3D camera preset to shot {shot.id}, or have the agent build a custom blockout in this cut's conversation.</p>
                          <div className="make-row">
                            <select value={blockoutPreset} onChange={(e) => setBlockoutPreset(e.target.value)} aria-label="Camera preset">
                              {PREVIS_MOVES.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label} — {m.summary.slice(0, 44)}
                                </option>
                              ))}
                            </select>
                            <button className="primary small" onClick={() => attachPresetBlockout(blockoutPreset)}>
                              Use preset
                            </button>
                            <button className="small" onClick={askAgentBlockout}>
                              Ask agent to block it out
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="dim small">Pick a target shot above to attach a 1:1 camera blockout (or choose an existing legacy blockout cut below).</p>
                      )}
                      {legacyBlockouts.length > 0 && (
                        <div className="make-row small">
                          <span className="dim">Or legacy blockout cut:</span>
                          <select value={legacyCut} onChange={(e) => setLegacyCut(e.target.value)}>
                            <option value="">None</option>
                            {legacyBlockouts.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Driving Motion Clip slot */}
              {op === "video" && inputMode === "drive" && (
                <div className="slot-card slot-wide">
                  <div className="slot-head">
                    <strong>Driving movement clip</strong>
                  </div>
                  {clips.length ? (
                    <div className="make-row small">
                      <select
                        value={drive?.asset ?? clips[0]!.id}
                        onChange={(e) => setDrive({ asset: e.target.value, from: 0 })}
                        aria-label="Driving clip"
                      >
                        {clips.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label ?? c.id}
                          </option>
                        ))}
                      </select>
                      <span>from</span>
                      <input
                        className="seconds"
                        type="number"
                        min={0}
                        step={0.1}
                        value={drive?.from ?? 0}
                        onChange={(e) => setDrive({ asset: drive?.asset ?? clips[0]!.id, from: Math.max(0, Number(e.target.value) || 0), to: drive?.to })}
                      />
                      <span>to</span>
                      <input
                        className="seconds"
                        type="number"
                        min={0}
                        step={0.1}
                        value={drive?.to ?? ""}
                        placeholder={String(round2((drive?.from ?? 0) + (effectiveSeconds ?? 5)))}
                        onChange={(e) => setDrive({ asset: drive?.asset ?? clips[0]!.id, from: drive?.from ?? 0, to: e.target.value ? Number(e.target.value) : undefined })}
                      />
                    </div>
                  ) : (
                    <p className="dim small">Record or import a reference clip of someone acting the movement out first.</p>
                  )}
                </div>
              )}

              {/* Speech / Lip-Sync slot */}
              {op === "video" && inputMode === "speech" && (
                <div className="slot-card slot-wide">
                  <div className="slot-head">
                    <strong>Voiced lines to lip-sync</strong>
                  </div>
                  {heardLines.length > 0 ? (
                    <>
                      <p className="small">
                        {heardLines.map((l) => `“${l.text}”`).join(" ")}
                        {heardLines.some((l) => !l.voiced) && <span className="warn"> Not voiced yet — narrate them first.</span>}
                      </p>
                      {showingVideo && (
                        <div className="segmented">
                          <button className={speechDub ? "on" : ""} onClick={() => setSpeechDub(true)}>
                            Redraw mouths in current clip
                          </button>
                          <button className={!speechDub ? "on" : ""} onClick={() => setSpeechDub(false)}>
                            Make board still talk
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="dim small">Pick a shot that has voiced narration/dialogue lines playing over it.</p>
                  )}
                </div>
              )}

              {/* Reference Pictures slot (Stills, Video Refs, and Blockout Camera) */}
              {(op === "image" || (op === "video" && (inputMode === "refs" || inputMode === "blockout"))) && (
                <div className={`slot-card slot-wide ${overSlot === "ref" ? "over" : ""}`} {...dropAsset("ref")}>
                  <div className="slot-head">
                    <strong>
                      Reference pictures {maxRefs > 0 ? `(${refs.length || autoCastPics.length} / ${maxRefs})` : "(not supported by this model)"}
                    </strong>
                    {refs.length > 0 && (
                      <button className="link small" onClick={() => setRefs([])}>
                        {op === "image" ? "Use @cast automatically" : "Clear"}
                      </button>
                    )}
                  </div>
                  {maxRefs === 0 ? (
                    <p className="dim small">{catalogModel?.label} generates from text only — switch models to pass reference pictures.</p>
                  ) : (
                    <>
                      <div className="slot-ref-strip">
                        {refs.map((id) => (
                          <span key={id} className="slot-ref-item">
                            <img src={posterUrl(projectId, id)} alt="" onError={hideBroken} />
                            <button className="slot-ref-x" onClick={() => setRefs(refs.filter((x) => x !== id))} aria-label="Remove reference">
                              <Icon name="close" size={10} />
                            </button>
                          </span>
                        ))}
                        {!refs.length &&
                          autoCastPics.map((x) => (
                            <span key={x.asset} className="slot-ref-item auto" title={`Auto-attached from @${x.use.id}`}>
                              <img src={posterUrl(projectId, x.asset)} alt="" onError={hideBroken} />
                              <span className="slot-ref-tag">@{x.use.id}</span>
                            </span>
                          ))}
                        {refs.length < maxRefs && images.length > 0 && (
                          <button className="slot-ref-add" onClick={() => setPickingSlot("ref")} title="Add a reference picture (or drag from Media)">
                            <Icon name="add" size={14} />
                          </button>
                        )}
                      </div>
                      {op === "image" && !refs.length && !autoCastPics.length && (
                        <p className="dim small">Mention @cast members in the prompt below to attach their sheets automatically, or drop/pick pictures here.</p>
                      )}
                      {op === "video" && inputMode === "blockout" && !refs.length && (
                        <p className="dim small">Add your shot's board or character sheets here so the model knows who and what replaces the grey stand-ins.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 4. Prompt */}
          <div className="create-section">
            <h4>Prompt</h4>
            <textarea
              className="make-prompt create-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                op === "image"
                  ? "Describe one frame as a camera sees it. Name cast with @: @cat on the rainy fire escape, low angle, dawn light"
                  : inputMode === "blockout"
                    ? "Name each striped stand-in by color and describe the real set: The red capsule is @cat in a yellow raincoat on a wet stone alley…"
                    : "Describe what moves and how the camera moves. The board already sets who and where."
              }
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit && void make()}
            />
            {(!!p.cast?.some((m) => m.kind !== "style") || unknownCast.length > 0 || styleMember) && (
              <div className="cast-chips">
                {p.cast
                  ?.filter((m) => m.kind !== "style")
                  .map((m) => (
                    <button
                      key={m.id}
                      className={`chip ${namedCast.some((u) => u.member.id === m.id) ? "on" : ""}`}
                      onClick={() => setPrompt((prev) => `${prev}${prev && !/\s$/.test(prev) ? " " : ""}@${m.id} `)}
                      title={m.about ?? m.name}
                    >
                      @{m.id}
                    </button>
                  ))}
                {styleMember && <span className="dim small">Style: {styleMember.name}</span>}
                {unknownCast.length > 0 && <span className="warn small">{unknownCast.map((id) => `@${id}`).join(", ")} isn't in the cast.</span>}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Flight Check */}
        <aside className="create-flight">
          <h4>Flight check</h4>
          <p className="dim small">
            {chosenFit ? (
              <>
                <strong>{chosenFit.label}</strong> on {chosenFit.where}
                {chosenFit.seconds ? ` · ${chosenFit.seconds}s` : ""}
                {chosenFit.aspect ? ` · ${chosenFit.aspect}` : ""}
              </>
            ) : (
              "Pick a ready model and ingredients to estimate."
            )}
          </p>

          {(flightPics.length > 0 || (op === "video" && inputMode === "blockout" && (hasShotBlockout || legacyCut))) && (
            <div className="flight-sends">
              <span className="dim small">Will upload</span>
              <div className="flight-pics">
                {flightPics.map((fp, i) => (
                  <div key={`${fp.id}-${i}`} className="flight-pic" title={fp.label}>
                    <img src={posterUrl(projectId, fp.id)} alt="" onError={hideBroken} />
                    <span>{fp.part}</span>
                  </div>
                ))}
                {op === "video" && inputMode === "blockout" && (hasShotBlockout || legacyCut) && (
                  <div className="flight-pic blockout">
                    <span>{blockoutMode === "sheet" ? "16-frame sheet" : "Blockout MP4"}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {op === "video" && absent.length > 0 && (
            <p className="warn small">
              {absent.join(", ")} {absent.length === 1 ? "isn't" : "aren't"} in this clip's pictures, so the model would invent them.
            </p>
          )}
          {missingStart && <p className="dim small">No board still attached yet — starting from a settled still usually gives much better results.</p>}
          {missingBlockout && <p className="warn small">Attach a camera blockout preset (or ask the agent for one) before generating.</p>}
          {(error || problem) && <p className="warn small">{error || problem}</p>}
          <WhyNot choices={choices} />

          <div className="flight-foot">
            <div className="make-row">
              <span className="dim small">Takes</span>
              <span className="stepper">
                <button disabled={count <= 1} onClick={() => setCount(count - 1)} aria-label="One fewer">
                  <Icon name="minus" size={10} />
                </button>
                <span>{count}</span>
                <button disabled={count >= 4} onClick={() => setCount(count + 1)} aria-label="One more">
                  <Icon name="add" size={10} />
                </button>
              </span>
              <span className="spacer" />
              {chosenFit?.usd !== undefined && <strong className="small">{cost(chosenFit)}</strong>}
            </div>
            <button className="primary create-go" disabled={!canSubmit} onClick={() => void make()} title="Start generating (⌘ Enter)">
              {sending ? "Starting…" : `Make ${count} ${what}`}
              {chosenFit?.usd !== undefined && !sending ? ` · ${cost(chosenFit)}` : ""}
            </button>
          </div>
        </aside>
      </div>

      {/* Inline picture picker overlay */}
      {pickingSlot && (
        <div className="modal-back" onClick={() => setPickingSlot(undefined)}>
          <div className="modal asset-pick-modal" onClick={(e) => e.stopPropagation()}>
            <div className="make-row">
              <h3>Pick a picture for {pickingSlot === "start" ? "start frame" : pickingSlot === "end" ? "end frame" : "reference"}</h3>
              <span className="spacer" />
              <button className="icon" onClick={() => setPickingSlot(undefined)} aria-label="Close">
                <Icon name="close" size={12} />
              </button>
            </div>
            <div className="asset-pick-grid">
              {images.map((img) => (
                <button
                  key={img.id}
                  className="asset-pick-card"
                  onClick={() => {
                    if (pickingSlot === "start") setStart(img.id);
                    else if (pickingSlot === "end") setEnd(img.id);
                    else if (!refs.includes(img.id)) setRefs([...refs, img.id]);
                    setPickingSlot(undefined);
                  }}
                  title={img.label ?? img.id}
                >
                  <img src={posterUrl(projectId, img.id)} loading="lazy" alt="" onError={hideBroken} />
                  <span className="small">{img.label ?? img.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
