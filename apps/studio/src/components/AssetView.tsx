import { formatTime, slugify, speakerLabel, TRANSCRIBERS, whoSpeaks, type Asset, type Moment, type Rect } from "@beatsheet/schema";
import { useEffect, useRef, useState } from "react";
import { mark, putSource, sourceClock } from "../editing";
import { hideBroken, posterUrl, proxyUrl, RANGE_DRAG, runJob, stripUrl, OS, pathParts } from "../lib";
import { BoxLabel, followBox, SubjectBoxes, SubjectTools } from "./Subjects";
import { CleanSound, RestoreClip, useCleanSound } from "./Restore";
import { actions, getState, setState, useProject, useStore } from "../store";
import { PopMenu, Stars, TextField } from "./ui";

const imageUrl = (projectId: string, assetId: string) => `/media/${projectId}/asset/${assetId}/image`;
const boxStyle = (r: Rect) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

const usesAsset = (s: { content: { kind: string; asset?: string; takes?: string[]; take?: string } }, id: string) =>
  (s.content.kind === "clip" && s.content.asset === id) || (s.content.kind === "generated" && (s.content.take === id || !!s.content.takes?.includes(id)));

/**
 * A file from the library, up close: watch it, rate it, name and tag it, and mark the moments worth landing on a
 * beat. These are the same facts the agent logs, so fixing one here steers its next cut.
 */
export function AssetView({ a }: { a: Asset }) {
  const projectId = useStore((s) => s.projectId)!;
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const project = useStore((s) => s.project)!;
  const video = useRef<HTMLVideoElement>(null);
  const [t, setTime] = useState(0);
  // I and O mark the clip where it's playing.
  const setT = (at: number) => {
    sourceClock.t = at;
    setTime(at);
  };
  const source = useStore((s) => (s.source?.asset === a.id ? s.source : undefined));
  const [playing, setPlaying] = useState(false);
  const [marking, setMarking] = useState<number | null>(null);
  const [revealError, setRevealError] = useState("");
  const media = useRef<HTMLDivElement>(null);
  const [boxing, setBoxing] = useState(false);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; r: Rect } | null>(null);
  const [drawn, setDrawn] = useState<Rect | null>(null);
  const [following, setFollowing] = useState<number | null>(null);
  const [followError, setFollowError] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  // Heard as recorded, or through its cleaned sound.
  const [hear, setHear] = useState<"own" | "clean">("clean");
  useCleanSound(video, a.cleaned ? `/media/${projectId}/asset/${a.id}/sound` : undefined, hear === "clean");
  const aspect = a.width && a.height ? a.width / a.height : 16 / 9;
  const rel = (e: React.PointerEvent) => {
    const r = media.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const editAsset = (fn: (x: Asset) => void) => actions.edit((d) => fn(d.assets.find((x) => x.id === a.id)!));

  // A different file starts at its beginning.
  useEffect(() => {
    setT(0);
    setPlaying(false);
    setMarking(null);
    setRevealError("");
    setBoxing(false);
    setDrawn(null);
    setFollowError("");
  }, [a.id]);

  const isVideo = a.kind === "video";
  const duration = a.duration ?? 0;
  const seek = (to: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration || v.duration || 0, to));
    setT(v.currentTime);
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      // One thing plays at a time: the cut pauses while you watch a clip.
      if (getState().playing) actions.togglePlay();
      void v.play();
    } else v.pause();
  };

  // Shots that use this file, here and in the project's other cuts.
  const here = project.shots.filter((s) => usesAsset(s, a.id));
  const elsewhere = (doc?.cuts ?? []).filter((c) => c.id !== cutId && c.shots.some((s) => usesAsset(s, a.id)));
  // A moment a shot lands on a beat can't be removed out from under it (in any cut).
  const syncedTo = (m: Moment) => {
    for (const c of doc?.cuts ?? []) {
      const s = c.shots.find((x) => x.content.kind === "clip" && x.content.asset === a.id && x.content.sync?.moment === m.id);
      if (s) return c.id === cutId ? `${s.id} lands this moment on a beat` : `${s.id} in ${c.name} lands this moment on a beat`;
    }
    return undefined;
  };

  const moments = [...(a.moments ?? [])].sort((x, y) => x.t - y.t);
  const addMoment = (label: string, at: number) =>
    editAsset((x) => {
      const taken = new Set((x.moments ?? []).map((m) => m.id));
      let id = slugify(label) || "moment";
      for (let n = 2; taken.has(id); n++) id = `${slugify(label) || "moment"}-${n}`;
      x.moments = [...(x.moments ?? []), { id, t: Math.round(at * 10) / 10, label }].sort((p, q) => p.t - q.t);
    });

  const tags = a.tags ?? [];
  const setTags = (next: string[]) => editAsset((x) => void (x.tags = next.length ? next : undefined));

  const reveal = async () => {
    setRevealError("");
    const r = await fetch("/api/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: projectId, asset: a.id }) });
    if (!r.ok) setRevealError(((await r.json()) as { error?: string }).error ?? "Couldn't show it.");
  };

  return (
    <div className="inspector asset-view">
      {(isVideo || a.kind === "image") && (
        <div className="clip-player">
          <div className={`clip-frame ${a.cutout ? "checker" : ""}`} style={{ aspectRatio: Math.max(aspect, 1), background: a.cutout ? undefined : a.color ?? "#111" }}>
            <div
              ref={media}
              className={`clip-media ${boxing ? "boxing" : ""}`}
              style={{ aspectRatio: aspect }}
              onClick={() => !boxing && isVideo && toggle()}
              onPointerDown={(e) => {
                if (!boxing) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                const p = rel(e);
                setDrawn(null);
                setDrawing({ x0: p.x, y0: p.y, r: { x: p.x, y: p.y, w: 0, h: 0 } });
              }}
              onPointerMove={(e) => {
                if (!drawing) return;
                const p = rel(e);
                setDrawing({ ...drawing, r: { x: Math.min(p.x, drawing.x0), y: Math.min(p.y, drawing.y0), w: Math.abs(p.x - drawing.x0), h: Math.abs(p.y - drawing.y0) } });
              }}
              onPointerUp={() => {
                if (!drawing) return;
                if (drawing.r.w > 0.02 && drawing.r.h > 0.02) setDrawn(drawing.r);
                setDrawing(null);
              }}
            >
              {isVideo ? (
                <video
                  ref={video}
                  key={a.id}
                  src={proxyUrl(projectId, a.id)}
                  poster={a.cutout ? undefined : posterUrl(projectId, a.id)}
                  preload="metadata"
                  playsInline
                  onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
              ) : (
                <img src={imageUrl(projectId, a.id)} alt="" onError={hideBroken} />
              )}
              <SubjectBoxes a={a} t={isVideo ? t : 0} hover={hover} />
              {(drawing?.r ?? drawn) && <div className="subject-box drawing" style={boxStyle((drawing?.r ?? drawn)!)} />}
              {isVideo && !playing && !boxing && <span className="clip-play">▶</span>}
            </div>
          </div>
          {isVideo && (
            <>
              <Scrubber a={a} t={t} duration={duration} moments={moments} onSeek={seek} projectId={projectId} source={source} />
              <div className="clip-bar">
                <button className="icon" onClick={toggle} title="Play / pause this clip">
                  {playing ? "❚❚" : "▶"}
                </button>
                <span className="mono small">
                  {formatTime(t)} <span className="dim">/ {formatTime(duration)}</span>
                </span>
                <span className="spacer" />
                <button className="link small" onClick={() => mark("in", t)} title="Mark where the stretch to use starts (I)">
                  In
                </button>
                <button className="link small" onClick={() => mark("out", t)} title="Mark where it ends (O)">
                  Out
                </button>
                <button className="link small" onClick={() => setMarking(t)} title="Mark a moment worth landing on a beat">
                  ◆ Mark {formatTime(t)}
                </button>
              </div>
              <div className="clip-bar">
                <span
                  className="range-chip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(RANGE_DRAG, JSON.stringify({ asset: a.id, in: source?.in, out: source?.out }));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title="Drag onto the timeline to put it in there"
                >
                  {source?.in !== undefined || source?.out !== undefined
                    ? `${formatTime(source.in ?? 0)} → ${formatTime(source.out ?? duration)} (${formatTime((source.out ?? duration) - (source.in ?? 0))})`
                    : "The whole clip"}
                </span>
                <span className="spacer" />
                <button className="small" onClick={() => putSource(a.id)} title="Over whatever's on the picture at the playhead, the cuts either side staying where they are">
                  Put in at the playhead
                </button>
              </div>
            </>
          )}
          {drawn && (
            <BoxLabel
              onDone={(label) => {
                const box = drawn;
                setDrawn(null);
                setBoxing(false);
                if (!label) return;
                setFollowing(0);
                setFollowError("");
                followBox(projectId, a.id, isVideo ? t : 0, box, label, setFollowing)
                  .catch((e: unknown) => setFollowError(e instanceof Error ? e.message : String(e)))
                  .finally(() => setFollowing(null));
              }}
            />
          )}
          {following !== null && (
            <div className="subject-busy">
              <span className="small">Following it through the clip…</span>
              <div className="progress thin">
                <div style={{ width: `${Math.round(following * 100)}%` }} />
              </div>
            </div>
          )}
          {followError && <p className="warn small">{followError}</p>}
        </div>
      )}
      {(a.kind === "audio" || a.kind === "voice" || a.kind === "music") && (
        <audio key={a.id} className="asset-audio" controls preload="metadata" src={`/media/${projectId}/asset/${a.id}/original`} />
      )}
      {a.version && (
        <p className="dim small">
          A restored version of{" "}
          <button className="link small" onClick={() => actions.select({ kind: "asset", id: a.version!.of })}>
            {project.assets.find((x) => x.id === a.version!.of)?.label ?? a.version.of}
          </button>{" "}
          from {formatTime(a.version.from)}, in step with it. A shot of that clip shows it in its place (Shows, in the shot's look), with the clip's own sound.
        </p>
      )}
      {a.cutout && (
        <p className="dim small">
          A cut-out of{" "}
          <button className="link small" onClick={() => actions.select({ kind: "asset", id: a.cutout!.of })}>
            {project.assets.find((x) => x.id === a.cutout!.of)?.label ?? a.cutout.of}
          </button>
          . Put it on a track above its source and it lines up exactly.
        </p>
      )}

      <TextField value={a.label ?? ""} placeholder="What's in it" onCommit={(v) => editAsset((x) => void (x.label = v.trim() || undefined))} />
      {a.kind !== "music" && (
        <div className="asset-rating">
          <Stars rating={a.rating} onChange={(r) => editAsset((x) => void (x.rating = r))} />
          <span className="dim small">{a.rating === -1 ? "Rejected: the agent leaves it out" : a.rating ? (a.rating >= 4 ? "A keeper" : "Rated") : "Not rated yet"}</span>
        </div>
      )}

      {a.kind !== "music" && (
        <>
          <h4>Tags</h4>
          <TagEditor tags={tags} onChange={setTags} />
        </>
      )}

      {isVideo && (
        <>
          <h4>
            Moments <span className="dim small">worth landing on a beat</span>
          </h4>
          {marking !== null && (
            <MomentDraft
              at={marking}
              onDone={(label) => {
                if (label) addMoment(label, marking);
                setMarking(null);
              }}
            />
          )}
          {(a.duration ?? 0) >= 20 && <SplitAtCuts a={a} />}
          {moments.length ? (
            <ul className="moment-list">
              {moments.map((m) => {
                const synced = syncedTo(m);
                return (
                  <li key={m.id} className={Math.abs(t - m.t) < 0.25 ? "here" : ""}>
                    <button className="mono small link" onClick={() => seek(m.t)} title="Jump to it">
                      {formatTime(m.t)}
                    </button>
                    <TextField
                      value={m.label}
                      onCommit={(v) => v.trim() && editAsset((x) => void (x.moments!.find((y) => y.id === m.id)!.label = v.trim()))}
                    />
                    {m.score !== undefined && <span className="score" style={{ opacity: 0.35 + m.score * 0.65 }} title={`Strength ${Math.round(m.score * 100)}%`} />}
                    <button
                      className="link danger small"
                      disabled={!!synced}
                      title={synced ?? "Remove"}
                      onClick={() => editAsset((x) => void (x.moments = x.moments!.filter((y) => y.id !== m.id)))}
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            marking === null && <p className="dim small">None yet. Play it and press ◆ Mark at a jump, a laugh, a burst.</p>
          )}
        </>
      )}

      {a.kind !== "image" && !a.cutout && !a.version && <Said a={a} seek={seek} />}
      {a.kind !== "image" && !a.cutout && !a.version && <CleanSound a={a} hear={hear} setHear={setHear} />}
      {isVideo && !a.cutout && !a.version && <RestoreClip a={a} t={t} />}

      {(isVideo || a.kind === "image") && !a.cutout && (
        <SubjectTools a={a} t={isVideo ? t : 0} boxing={boxing} setBoxing={setBoxing} hover={hover} setHover={setHover} seek={seek} />
      )}

      {a.sections && (
        <>
          <h4>Sections</h4>
          <ul className="plain">
            {a.sections.map((s) => (
              <li key={s.id}>
                <span className="mono dim">{formatTime(s.start)}</span> {s.label}
                {s.level && <span className="dim small"> · {s.level} energy</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>In the cut</h4>
      {here.length ? (
        <div className="chips">
          {here.map((s) => (
            <button key={s.id} className="chip" onClick={() => actions.select({ kind: "shot", id: s.id })}>
              {s.id} · {s.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="dim small">Not in this cut.</p>
      )}
      {elsewhere.length > 0 && (
        <p className="dim small">
          Also in{" "}
          {elsewhere.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <button className="link small" onClick={() => actions.setCut(c.id)}>
                {c.name}
              </button>
            </span>
          ))}
        </p>
      )}

      <details className="asset-details">
        <summary className="dim small">File details</summary>
        <dl>
          <dt>File</dt>
          <dd className="mono small">
            {pathParts(a.path).pop()}{" "}
            <button className="link small" onClick={() => void reveal()}>
              Show in {OS.files}
            </button>
            {revealError && <span className="warn small"> {revealError}</span>}
          </dd>
          <dt>Kind</dt>
          <dd>
            {a.kind}
            {a.width ? ` · ${a.width}×${a.height}` : ""}
            {a.fps ? ` · ${Math.round(a.fps)} fps` : ""}
          </dd>
          {a.capturedAt && (
            <>
              <dt>Shot</dt>
              <dd>{new Date(a.capturedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd>
            </>
          )}
          {a.grid && (
            <>
              <dt>Grid</dt>
              <dd>
                {a.grid.bpm} BPM, downbeat at {a.grid.downbeat}s
              </dd>
            </>
          )}
          {a.provenance && (
            <>
              <dt>Made by</dt>
              <dd>
                {a.provenance.source}
                {a.provenance.provider && ` · ${a.provenance.provider}`}
                {a.provenance.model && ` · ${a.provenance.model}`}
                {a.provenance.costUsd !== undefined && ` · $${a.provenance.costUsd.toFixed(2)}`}
              </dd>
            </>
          )}
          {a.provenance?.prompt && (
            <>
              <dt>Prompt</dt>
              <dd className="small">{a.provenance.prompt}</dd>
            </>
          )}
        </dl>
      </details>
    </div>
  );
}

type Choice = { id: string; label: string; ok: boolean; why?: string; kind?: string; where?: string; seconds?: number; usd?: number };
type Said = { by: string; language?: string; lines: { s: number; e: number; text: string; speaker?: string }[]; costUsd?: number };

const about = (c: Choice) => [c.where, c.usd !== undefined ? (c.usd < 0.01 ? "under 1¢" : `~$${c.usd.toFixed(2)}`) : "free", c.seconds !== undefined ? `~${c.seconds < 90 ? `${Math.max(5, c.seconds)}s` : `${Math.round(c.seconds / 60)} min`}` : ""].filter(Boolean).join(" · ");

/**
 * What's said in a clip: transcribed by whichever transcriber suits this computer (Whisper here, or a service with a
 * key; Auto picks), then read a line at a time, each a click away from where it's said.
 */
function Said({ a, seek }: { a: Asset; seek: (t: number) => void }) {
  const projectId = useStore((s) => s.projectId)!;
  const p = useProject();
  const [naming, setNaming] = useState<{ speaker: string; x: number; y: number }>();
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState<Said>();
  const [choices, setChoices] = useState<{ auto?: Choice; ready: Choice[]; setup: Choice[] }>();
  const [pick, setPick] = useState("");
  const [speakers, setSpeakers] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [again, setAgain] = useState(false);
  const has = !!a.transcript;
  useEffect(() => {
    setSaid(undefined);
    if (!has) return;
    void fetch(`/api/projects/${projectId}/transcripts/${a.id}`)
      .then((r) => (r.ok ? (r.json() as Promise<Said>) : undefined))
      .then(setSaid);
  }, [projectId, a.id, a.transcript?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  const asking = !has || again;
  useEffect(() => {
    if (!asking) return;
    void fetch(`/api/projects/${projectId}/transcribe?asset=${encodeURIComponent(a.id)}${speakers ? "&speakers=1" : ""}`)
      .then((r) => r.json() as Promise<{ auto?: Choice; ready: Choice[]; setup: Choice[] }>)
      .then(setChoices);
  }, [projectId, a.id, speakers, asking]);
  const chosen = pick ? choices?.ready.find((c) => c.id === pick) : choices?.auto;
  const go = async () => {
    setError("");
    setBusy(0);
    try {
      await actions.flushSave();
      await runJob(`/api/projects/${projectId}/transcribe`, { asset: a.id, ...(pick ? { with: pick } : {}), speakers }, setBusy);
      await actions.reload();
      setAgain(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const t = a.transcript;
  return (
    <>
      <h4>
        What's said{" "}
        {t && (
          <span className="dim small">
            {t.words.toLocaleString()} words{t.speakers ? ` · ${t.speakers} speaker${t.speakers === 1 ? "" : "s"}` : ""} · {TRANSCRIBERS.find((x) => x.id === t.by)?.label ?? t.by}
          </span>
        )}
      </h4>
      {said && !again && (
        <>
          <ul className="said-list">
            {said.lines.map((l, i) => (
              <li key={i}>
                <button className="mono small link" onClick={() => seek(l.s)} title="Jump to it">
                  {formatTime(l.s)}
                </button>
                {l.speaker && (
                  <button
                    className={`said-speaker small link ${whoSpeaks(p.cast, a.id, l.speaker) ? "named" : ""}`}
                    onClick={(e) => setNaming({ speaker: l.speaker!, x: e.clientX, y: e.clientY })}
                    title="Say who this is"
                  >
                    {whoSpeaks(p.cast, a.id, l.speaker)?.name || speakerLabel(l.speaker)}
                  </button>
                )}
                <span className="small">{l.text}</span>
              </li>
            ))}
          </ul>
          {!said.lines.length && <p className="dim small">Nothing was said in it.</p>}
          {said.lines.some((l) => l.speaker && !whoSpeaks(p.cast, a.id, l.speaker)) && <p className="dim small">Click a speaker to say who it is; they're looked for in your other clips too.</p>}
          {heard && <p className="small">{heard}</p>}
          <button className="link small" onClick={() => setAgain(true)}>
            Transcribe it again…
          </button>
        </>
      )}
      {asking && (
        <>
          <div className="make-row">
            <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Transcriber" title="Who transcribes it">
              <option value="">{choices?.auto ? `Auto (${choices.auto.label}${about(choices.auto) ? ` · ${about(choices.auto)}` : ""})` : "Auto"}</option>
              {choices?.ready.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {about(c) ? ` · ${about(c)}` : ""}
                </option>
              ))}
              {!!choices?.setup.length && (
                <optgroup label="Can't use now">
                  {choices.setup.map((c) => (
                    <option key={c.id} disabled>
                      {c.label}: {c.why}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <label className="check small" title="Only a transcriber that can tell people apart">
              <input type="checkbox" checked={speakers} onChange={(e) => (setSpeakers(e.target.checked), setPick(""))} /> Who's speaking
            </label>
          </div>
          {busy !== null ? (
            <div className="progress thin">
              <div style={{ width: `${Math.round(busy * 100)}%` }} />
            </div>
          ) : (
            <div className="make-row">
              <button className="primary" disabled={!chosen} onClick={() => void go()}>
                Transcribe{chosen && about(chosen) ? ` · ${about(chosen)}` : ""}
              </button>
              {again && (
                <button className="link small" onClick={() => setAgain(false)}>
                  Keep this one
                </button>
              )}
              {choices && !choices.ready.length && (
                <button className="link small" onClick={() => actions.setSettingsOpen(true, "transcribe")}>
                  Set one up
                </button>
              )}
            </div>
          )}
          {choices && !choices.ready.length && <p className="dim small">{choices.setup.map((c) => `${c.label}: ${c.why}`).join(". ")}.</p>}
        </>
      )}
      {error && <p className="warn small">{error}</p>}
      {naming && (
        <NameSpeaker
          asset={a}
          {...naming}
          onClose={() => setNaming(undefined)}
          onNamed={(said) => {
            setNaming(undefined);
            setHeard(said);
          }}
        />
      )}
    </>
  );
}

/**
 * Who a speaker is: someone in the cast, or someone new (added to the cast); then their voice is looked for in the
 * project's other clips.
 */
function NameSpeaker({ asset, speaker, x, y, onClose, onNamed }: { asset: Asset; speaker: string; x: number; y: number; onClose: () => void; onNamed: (said: string) => void }) {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const now = whoSpeaks(p.cast, asset.id, speaker);
  const people = (p.cast ?? []).filter((m) => m.kind === "character");
  const send = async (who: { cast?: string; name?: string }) => {
    setBusy(true);
    try {
      await actions.flushSave();
      const out = await runJob(`/api/projects/${projectId}/speakers`, { asset: asset.id, speaker, ...who });
      await actions.reload();
      const r = out ? (JSON.parse(out) as { member: string; found: { asset: string }[]; joined?: { member: string; by: string }[]; why?: string }) : undefined;
      const m = r && getState().doc?.cast?.find((x) => x.id === r.member);
      const clips = r ? new Set(r.found.map((f) => f.asset)).size : 0;
      const faces = r?.joined?.filter((j) => j.member === r.member && j.by === "voice").length ?? 0;
      const face = faces ? ` Their face is named where they're talking on screen${faces > 1 ? ` (${faces} clips)` : ""}.` : "";
      onNamed(!m ? "" : (clips ? `Found ${m.name} in ${clips} other clip${clips === 1 ? "" : "s"} too.` : r?.why ? `${r.why}.` : `Didn't hear ${m.name} in your other clips.`) + face);
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
      onClose();
    }
  };
  return (
    <PopMenu x={x} y={y} onClose={onClose}>
      <p className="dim small menu-note">Who is {now?.name || speakerLabel(speaker)}?</p>
      {people.map((m) => (
        <button key={m.id} role="menuitem" disabled={busy || now?.id === m.id} onClick={() => void send({ cast: m.id })}>
          {m.name || `@${m.id}`} <span className="dim mono">@{m.id}</span>
        </button>
      ))}
      {!!people.length && <hr />}
      <form
        className="menu-note"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void send({ name });
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Someone new: Grandpa" aria-label="Their name" disabled={busy} />
      </form>
      {now && (
        <button role="menuitem" disabled={busy} onClick={() => void send({})}>
          Not {now.name}
        </button>
      )}
      {busy && <p className="dim small menu-note">Looking for them in your other clips…</p>}
    </PopMenu>
  );
}

/**
 * A long file (a tape transferred whole, a DVD) split into its shots, as moments: where the picture changes all at once
 * is a cut.
 */
function SplitAtCuts({ a }: { a: Asset }) {
  const projectId = useStore((s) => s.projectId)!;
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const split = async () => {
    setBusy(true);
    setSaid("");
    try {
      await actions.flushSave();
      const res = await fetch(`/api/projects/${projectId}/split`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: a.id }) });
      const out = (await res.json()) as { shots?: unknown[]; error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't split it");
      await actions.reload();
      setSaid(`${out.shots!.length} shot${out.shots!.length === 1 ? "" : "s"}`);
    } catch (err) {
      setSaid(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const split1 = (a.moments ?? []).some((m) => /^shot-\d+$/.test(m.id));
  return (
    <p className="small">
      <button className="link small" disabled={busy} onClick={() => void split()} title="Find where the picture changes all at once, and mark each shot between as a moment">
        {busy ? "Finding its cuts…" : split1 ? "Split it at its cuts again" : "Split it at its cuts"}
      </button>
      {said && <span className="dim"> {said}</span>}
    </p>
  );
}

/** The clip's filmstrip as a scrub bar, with its moments marked and the playhead on top. */
function Scrubber({ a, t, duration, moments, onSeek, projectId, source }: { a: Asset; t: number; duration: number; moments: Moment[]; onSeek: (t: number) => void; projectId: string; source?: { in?: number; out?: number } }) {
  const from = source?.in ?? 0, to = source?.out ?? duration;
  const marked = !!source && (source.in !== undefined || source.out !== undefined);
  const bar = useRef<HTMLDivElement>(null);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };
  return (
    <div
      ref={bar}
      className="clip-scrub"
      style={{ backgroundImage: `url(${stripUrl(projectId, a.id)})` }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onSeek(at(e.clientX));
      }}
      onPointerMove={(e) => e.buttons === 1 && onSeek(at(e.clientX))}
    >
      {duration > 0 &&
        moments.map((m) => (
          <span key={m.id} className="clip-moment" style={{ left: `${(m.t / duration) * 100}%` }} title={`${formatTime(m.t)} ${m.label}`} />
        ))}
      {duration > 0 && marked && <span className="clip-range" style={{ left: `${(from / duration) * 100}%`, width: `${(Math.max(0, to - from) / duration) * 100}%` }} />}
      {duration > 0 && <span className="clip-head" style={{ left: `${(t / duration) * 100}%` }} />}
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const tag = draft.trim().toLowerCase();
    setDraft("");
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
  };
  return (
    <div className="tag-editor">
      {tags.map((tag) => (
        <span key={tag} className="chip tag">
          {tag}
          <button className="link" onClick={() => onChange(tags.filter((x) => x !== tag))} title={`Remove ${tag}`}>
            ✕
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={tags.length ? "+ tag" : "Add a tag"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

function MomentDraft({ at, onDone }: { at: number; onDone: (label: string) => void }) {
  const [label, setLabel] = useState("");
  return (
    <div className="moment-draft">
      <span className="mono small">{formatTime(at)}</span>
      <input
        autoFocus
        value={label}
        placeholder="What happens here? (Enter)"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(label.trim());
          if (e.key === "Escape") onDone("");
        }}
      />
      <button className="link small" onClick={() => onDone("")}>
        Cancel
      </button>
    </div>
  );
}
