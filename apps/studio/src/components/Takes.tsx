/**
 * A placeholder or generated shot's takes, and making more: stills first (a board for the shot, cents each), then video
 * from the chosen board. The models come from the catalog, checked against this shot and the services set up, and the
 * ones that can't make it say why rather than being hidden. The button says what a batch will cost.
 */
import { useCallback, useEffect, useState } from "react";
import type { Choices, Fit, MakeOp, Shot } from "@beatsheet/schema";
import { hideBroken, posterUrl, proxyUrl, round2 } from "../lib";
import { actions, useProject, useStore } from "../store";
import { TextField } from "./ui";

/** A job as the engine saves it (packages/engine/src/make.ts), as far as this needs. */
type Job = {
  id: string;
  cut?: string;
  shot?: string;
  op: MakeOp;
  status: "queued" | "running" | "done" | "failed" | "canceled";
  position?: number;
  error?: string;
  updatedAt: string;
};

const isOpen = (j: Job) => j.status === "queued" || j.status === "running";
const money = (usd?: number) => (usd === undefined ? "" : `~$${usd.toFixed(2)}`);
const wait = (s?: number) => (s === undefined ? "" : s < 90 ? `~${Math.max(10, Math.round(s / 10) * 10)}s` : `~${Math.round(s / 60)} min`);
const fitLabel = (f: Fit) => (f.ok ? [f.label, money(f.usd), wait(f.wait)].filter(Boolean).join(" · ") : `${f.label}: ${f.why.reason}`);

export function Takes({ shot, seconds }: { shot: Shot; seconds?: number }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const c = shot.content as Extract<Shot["content"], { kind: "placeholder" | "generated" }>;
  const takes = c.kind === "generated" ? (c.takes ?? []) : [];
  const showing = c.kind === "generated" && c.take ? p.assets.find((a) => a.id === c.take) : undefined;
  // The still a clip starts from: the one showing, or the one the clip showing was made from.
  const board = showing?.kind === "image" ? showing.id : c.kind === "generated" ? c.start : undefined;
  const prompt = c.kind === "placeholder" ? c.description : c.prompt;
  const format = p.formats[0]!;

  const [op, setOp] = useState<MakeOp>(board ? "video" : "image");
  const [fromBoard, setFromBoard] = useState(true);
  const [model, setModel] = useState("");
  const [count, setCount] = useState(2);
  const [choices, setChoices] = useState<Choices>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const start = op === "video" && fromBoard ? board : undefined;
  const length = seconds && Number.isFinite(seconds) ? round2(seconds) : undefined;

  // Which models could make this, with this shot's length and shape and the services there are.
  useEffect(() => {
    const q = new URLSearchParams({ op, shot: shot.id, count: String(count) });
    if (cutId) q.set("cut", cutId);
    if (length) q.set("seconds", String(length));
    if (start) q.set("start", start);
    let live = true;
    fetch(`/api/projects/${projectId}/make?${q}`)
      .then((r) => r.json() as Promise<{ choices?: Choices; error?: string }>)
      .then((j) => live && (j.choices ? setChoices(j.choices) : setError(j.error ?? "Couldn't list the models")))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => void (live = false);
  }, [projectId, cutId, shot.id, op, count, length, start]);

  // This shot's jobs; while any is going, asked again every couple of seconds. Finished takes arrive with the project.
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/jobs`).catch(() => undefined);
    if (r?.ok) setJobs(((await r.json()) as Job[]).filter((j) => j.shot === shot.id && (!j.cut || j.cut === cutId)));
  }, [projectId, cutId, shot.id]);
  useEffect(() => void refresh(), [refresh]);
  const going = jobs.filter(isOpen);
  useEffect(() => {
    if (!going.length) return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [going.length, refresh]);

  const chosen = choices && (model ? choices.ready.find((f) => f.model === model) : choices.auto);
  // A model picked for stills can't make video, and the other way round.
  useEffect(() => {
    if (model && choices && !choices.ready.some((f) => f.model === model)) setModel("");
  }, [choices, model]);

  const make = async () => {
    setError("");
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/make`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, cut: cutId, shot: shot.id, prompt, count, ...(model ? { model } : {}), ...(start ? { start } : {}), ...(length ? { seconds: length } : {}) }),
      });
      const j = (await res.json()) as { jobs?: Job[]; error?: string };
      if (!res.ok || !j.jobs) throw new Error(j.error ?? `${res.status}`);
      setJobs((prev) => [...prev, ...j.jobs!]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const pick = (id: string) =>
    actions.edit((d) => {
      const s = d.shots.find((x) => x.id === shot.id)!;
      if (s.content.kind === "generated") s.content.take = id;
    });
  const editPrompt = (v: string) =>
    actions.edit((d) => {
      const s = d.shots.find((x) => x.id === shot.id)!;
      if (s.content.kind === "placeholder") s.content.description = v;
      else if (s.content.kind === "generated") s.content.prompt = v;
    });
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const failed = jobs.filter((j) => j.status === "failed" && j.updatedAt >= hourAgo).at(-1);
  const what = op === "image" ? (count === 1 ? "still" : "stills") : count === 1 ? "clip" : "clips";
  const aspect = `${format.width} / ${format.height}`;

  return (
    <div className="takes">
      <h4>Takes</h4>
      {takes.length + going.length > 0 ? (
        <div className="take-strip">
          {takes.map((id) => {
            const a = p.assets.find((x) => x.id === id);
            return a ? <Take key={id} projectId={projectId} id={id} video={a.kind === "video"} duration={a.duration} on={c.kind === "generated" && c.take === id} aspect={aspect} onPick={() => pick(id)} /> : null;
          })}
          {going.map((j) => (
            <div key={j.id} className="take pending" style={{ aspectRatio: aspect }} title={j.op === "image" ? "A still on its way" : "A clip on its way"}>
              {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
            </div>
          ))}
        </div>
      ) : (
        <p className="dim small">No takes yet. Make a few stills to settle the shot, then a clip from the one you like.</p>
      )}
      <label>
        Prompt
        <TextField multiline value={prompt} placeholder="What's in the shot, and how the camera sees it" onCommit={editPrompt} />
      </label>
      <div className="make-row">
        <div className="segmented">
          <button className={op === "image" ? "on" : ""} onClick={() => setOp("image")} title="A board: a still for the shot, cents each">
            Stills
          </button>
          <button className={op === "video" ? "on" : ""} onClick={() => setOp("video")} title="A clip, from the chosen still if there is one">
            Video
          </button>
        </div>
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} title="How many takes" aria-label="How many takes">
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} title="Which model makes it" aria-label="Model">
          <option value="">{choices?.auto ? `Auto (${fitLabel(choices.auto)})` : "Auto"}</option>
          {choices?.ready.map((f) => (
            <option key={f.model} value={f.model}>
              {fitLabel(f)}
            </option>
          ))}
          {!!choices?.setup.length && (
            <optgroup label="Needs a key or an install">
              {choices.setup.map((f) => (
                <option key={f.model} disabled>
                  {fitLabel(f)}
                </option>
              ))}
            </optgroup>
          )}
          {!!choices?.unfit.length && (
            <optgroup label="Can't make this shot">
              {choices.unfit.map((f) => (
                <option key={f.model} disabled>
                  {fitLabel(f)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
      {op === "video" && board && (
        <label className="check-row small">
          <input type="checkbox" checked={fromBoard} onChange={(e) => setFromBoard(e.target.checked)} />
          Start from the chosen still
        </label>
      )}
      {choices && !choices.ready.length && (
        <p className="dim small">
          {[...choices.unfit, ...choices.setup].map((f) => (!f.ok ? `${f.label}: ${f.why.reason}` : "")).join(". ")}.{" "}
          {!!choices.setup.length && (
            <button className="link small" onClick={() => actions.setSettingsOpen(true, "services")}>
              Media services
            </button>
          )}
        </p>
      )}
      <div className="make-row">
        <button className="primary" disabled={!chosen || !prompt.trim() || sending} onClick={() => void make()}>
          Make {count} {what}
          {chosen?.usd !== undefined ? ` · ${money(chosen.usd)}` : ""}
        </button>
        {going.length > 0 && <span className="dim small">{going.length} on the way</span>}
      </div>
      {error && <p className="warn small">{error}</p>}
      {failed && !error && <p className="warn small">A take didn't come: {failed.error}</p>}
    </div>
  );
}

/** One take: its poster, playing on hover when it's a clip. */
function Take({ projectId, id, video, duration, on, aspect, onPick }: { projectId: string; id: string; video: boolean; duration?: number; on: boolean; aspect: string; onPick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button className={`take ${on ? "on" : ""}`} style={{ aspectRatio: aspect }} onClick={onPick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={on ? `${id}: the one the shot shows` : `${id}: show this one`}>
      {video && hover ? <video src={proxyUrl(projectId, id)} autoPlay muted loop playsInline /> : <img src={posterUrl(projectId, id)} alt="" onError={hideBroken} />}
      {video && <span className="badge">▶ {duration ? `${duration.toFixed(1)}s` : ""}</span>}
    </button>
  );
}
