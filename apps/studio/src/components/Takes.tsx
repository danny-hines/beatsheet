/**
 * A placeholder or generated shot's takes, and making more: stills first (a board for the shot, cents each), then a
 * rough clip from the chosen board, then a final once the cut holds. The models come from the catalog, checked
 * against this shot and the services set up, and the ones that can't make it say why rather than being hidden. The
 * button says what a batch will cost.
 */
import { useCallback, useEffect, useState } from "react";
import type { MakeAsk, MakeJob } from "@beatsheet/engine";
import { castOf, type Choices, type Fit, type FitOk, type MakeOp, type Quality, type Shot } from "@beatsheet/schema";
import { hideBroken, posterUrl, proxyUrl, round2 } from "../lib";
import { actions, useProject, useStore } from "../store";
import { TextField } from "./ui";

const isOpen = (j: MakeJob) => j.status === "queued" || j.status === "running";
export const money = (usd?: number) => (usd === undefined ? "" : `~$${usd.toFixed(2)}`);
/** What it costs where it runs: a plan's allowance rather than money. */
export const cost = (f: { usd?: number }) => (f.usd === 0 ? "on your plan" : money(f.usd));
const wait = (s?: number) => (s === undefined ? "" : s < 90 ? `~${Math.max(10, Math.round(s / 10) * 10)}s` : `~${Math.round(s / 60)} min`);
/** A model, where it runs when it runs in more than one place, what it costs and how long it takes; or why it can't. */
const fitLabel = (f: Fit, where = false) => {
  if (!f.ok) return `${f.label}: ${f.why.reason}`;
  const place = (where || !!f.also?.length) && f.where;
  // "ChatGPT plan" already says it's on the plan.
  return [f.label, place, !(place && f.usd === 0) && cost(f), wait(f.wait)].filter(Boolean).join(" · ");
};

/** A model picked in ModelSelect, and where it runs when there's a choice: "gpt-image@chatgpt". */
export const pickOf = (value: string): { model?: string; via?: string } => {
  if (!value) return {};
  const [model, via] = value.split("@");
  return { model, ...(via ? { via } : {}) };
};
/** A ready model in each place it can run: itself (the cheapest), then the others. */
const placesOf = (f: FitOk): FitOk[] => [f, ...(f.also ?? []).map((o) => ({ ...f, route: o.route, where: o.where, usd: o.usd, also: undefined }))];
/** The fit for a pick (Auto when there's none), or nothing when that model can't make this now. */
export function fitOf(choices: Choices | undefined, value: string): FitOk | undefined {
  if (!choices || !value) return choices?.auto;
  const { model, via } = pickOf(value);
  const f = choices.ready.find((x) => x.model === model);
  return f && (via ? placesOf(f).find((x) => x.route === via) : f);
}

/**
 * The project's jobs that `match` (a shot's, a sheet's), asked for again every couple of seconds while any is going;
 * finished takes arrive with the project. `make` starts more, and says why when it can't.
 */
export function useMake(match: (j: MakeJob) => boolean, key: string) {
  const projectId = useStore((s) => s.projectId)!;
  const [jobs, setJobs] = useState<MakeJob[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // `key` names what `match` matches; the function itself is new each render.
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/jobs`).catch(() => undefined);
    if (r?.ok) setJobs(((await r.json()) as MakeJob[]).filter(match));
  }, [projectId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void refresh(), [refresh]);
  const going = jobs.filter(isOpen);
  useEffect(() => {
    if (!going.length) return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [going.length, refresh]);
  const make = async (ask: MakeAsk) => {
    setError("");
    setSending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ask) });
      const j = (await res.json()) as { jobs?: MakeJob[]; error?: string };
      if (!res.ok || !j.jobs) throw new Error(j.error ?? `${res.status}`);
      setJobs((prev) => [...prev, ...j.jobs!]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const failed = jobs.filter((j) => j.status === "failed" && j.updatedAt >= hourAgo).at(-1);
  // A failed take the service had made is fetched again for nothing; one it never made is asked for again.
  const retry = async (job: MakeJob) => {
    await fetch(`/api/projects/${projectId}/jobs/retry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [job.id] }) });
    await refresh();
  };
  return { going, make, sending, error, failed, retry };
}

/** A failed take or sheet: why, and trying it again (free when the service had made it). */
export function Failed({ job, what, retry }: { job: MakeJob; what: string; retry: (j: MakeJob) => void }) {
  return (
    <p className="warn small">
      {what} didn't come: {job.error}{" "}
      <button className="link small" onClick={() => retry(job)} title={job.charged ? "It was made; fetch it again, at no cost" : "Ask for it again; it costs again"}>
        Try again{job.charged ? "" : ` · ${money(job.usd)}`}
      </button>
    </p>
  );
}

/**
 * Which models could make something, from the engine, asked again when what's asked changes and when the project is
 * saved (the engine reads the saved file: a cast member just made, a prompt just edited). Says why when it can't.
 */
export function useChoices(query: Record<string, string | number | undefined>) {
  const projectId = useStore((s) => s.projectId)!;
  const version = useStore((s) => s.version);
  const [choices, setChoices] = useState<Choices>();
  const [problem, setProblem] = useState("");
  const q = new URLSearchParams(Object.entries(query).flatMap(([k, v]) => (v === undefined || v === "" ? [] : [[k, String(v)]]))).toString();
  useEffect(() => {
    let live = true;
    fetch(`/api/projects/${projectId}/make?${q}`)
      .then((r) => r.json() as Promise<{ choices?: Choices; error?: string }>)
      .then((j) => {
        if (!live) return;
        setProblem(j.choices ? "" : (j.error ?? "Couldn't list the models"));
        if (j.choices) setChoices(j.choices);
      })
      .catch((e: unknown) => live && setProblem(e instanceof Error ? e.message : String(e)));
    return () => void (live = false);
  }, [projectId, q, version]);
  return { choices, problem };
}

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
  const [quality, setQuality] = useState<Quality>("rough");
  const [fromBoard, setFromBoard] = useState(true);
  const [model, setModel] = useState("");
  const [count, setCount] = useState(2);
  const start = op === "video" && fromBoard ? board : undefined;
  const length = seconds && Number.isFinite(seconds) ? round2(seconds) : undefined;
  const { going, make, sending, error, failed, retry } = useMake((j) => j.shot === shot.id && (!j.cut || j.cut === cutId), `${shot.id}:${cutId}`);
  const { choices, problem } = useChoices({ op, shot: shot.id, cut: cutId, count, seconds: length, start, quality: op === "video" ? quality : undefined });
  const chosen = fitOf(choices, model);
  // A model picked for stills can't make video, and the other way round.
  useEffect(() => {
    if (model && choices && !fitOf(choices, model)) setModel("");
  }, [choices, model]);

  // Who the prompt names: the cast it'll be given, and any @name that isn't in the cast.
  const named = castOf(prompt, p.cast, c.kind === "generated" ? c.cast : undefined).filter((u) => u.member.kind !== "style");
  const style = p.look?.style ? p.cast?.find((m) => m.id === p.look!.style && m.kind === "style") : undefined;
  const unknown = [...prompt.matchAll(/@([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]!).filter((id) => !p.cast?.some((m) => m.id === id));

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
  const what = op === "image" ? (count === 1 ? "still" : "stills") : `${quality} ${count === 1 ? "clip" : "clips"}`;
  const aspect = `${format.width} / ${format.height}`;

  return (
    <div className="takes">
      <h4>Takes</h4>
      {takes.length + going.length > 0 ? (
        <div className="take-strip">
          {takes.map((id) => {
            const a = p.assets.find((x) => x.id === id);
            return a ? <Take key={id} projectId={projectId} id={id} video={a.kind === "video"} duration={a.duration} final={a.provenance?.params?.quality === "final"} on={c.kind === "generated" && c.take === id} aspect={aspect} onPick={() => pick(id)} /> : null;
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
        <TextField multiline value={prompt} placeholder="What's in the shot, and how the camera sees it. Name the cast with @: @cat" onCommit={editPrompt} />
      </label>
      {(named.length > 0 || unknown.length > 0 || style) && (
        <p className="dim small cast-line">
          {named.length > 0 && (
            <>With {named.map((u) => u.member.name + (u.variant ? ` (${u.variant.id})` : "") + (u.style ? `, ${u.style.name.toLowerCase()}` : "")).join(", ")}. </>
          )}
          {style && <>In the style of {style.name}. </>}
          {unknown.length > 0 && <span className="warn">{unknown.map((id) => `@${id}`).join(", ")} isn't in the cast.</span>}
        </p>
      )}
      <div className="make-row">
        <div className="segmented">
          <button className={op === "image" ? "on" : ""} onClick={() => setOp("image")} title="A board: a still for the shot, cents each">
            Stills
          </button>
          <button className={op === "video" ? "on" : ""} onClick={() => setOp("video")} title="A clip, from the chosen still if there is one">
            Video
          </button>
        </div>
        {op === "video" && (
          <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} title="A rough to judge the cut, or a final once it holds" aria-label="Quality">
            <option value="rough">Rough</option>
            <option value="final">Final</option>
          </select>
        )}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} title="How many takes" aria-label="How many takes">
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <ModelSelect choices={choices} model={model} setModel={setModel} />
      </div>
      {op === "video" && board && (
        <label className="check-row small">
          <input type="checkbox" checked={fromBoard} onChange={(e) => setFromBoard(e.target.checked)} />
          Start from the chosen still
        </label>
      )}
      <WhyNot choices={choices} />
      <div className="make-row">
        <button
          className="primary"
          disabled={!chosen || !prompt.trim() || sending}
          onClick={() =>
            void make({ op, cut: cutId, shot: shot.id, prompt, count, ...(op === "video" ? { quality } : {}), ...pickOf(model), ...(start ? { start } : {}), ...(length ? { seconds: length } : {}) })
          }
        >
          Make {count} {what}
          {chosen?.usd !== undefined ? ` · ${cost(chosen)}` : ""}
        </button>
        {going.length > 0 && <span className="dim small">{going.length} on the way</span>}
      </div>
      {(error || problem) && <p className="warn small">{error || problem}</p>}
      {failed && !error && <Failed job={failed} what="A take" retry={(j) => void retry(j)} />}
    </div>
  );
}

/** Auto, the ready models with what each costs, then the ones that can't be used, grayed out with why. */
export function ModelSelect({ choices, model, setModel }: { choices?: Choices; model: string; setModel: (m: string) => void }) {
  return (
    <select value={model} onChange={(e) => setModel(e.target.value)} title="Which model makes it" aria-label="Model">
      <option value="">{choices?.auto ? `Auto (${fitLabel(choices.auto)})` : "Auto"}</option>
      {choices?.ready.flatMap((f) =>
        f.also?.length
          ? placesOf(f).map((x) => (
              <option key={`${x.model}@${x.route}`} value={`${x.model}@${x.route}`}>
                {fitLabel(x, true)}
              </option>
            ))
          : [
              <option key={f.model} value={f.model}>
                {fitLabel(f)}
              </option>,
            ],
      )}
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
        <optgroup label="Can't make this">
          {choices.unfit.map((f) => (
            <option key={f.model} disabled>
              {fitLabel(f)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** When nothing can make it: why not, for each model, and where to add a key. */
export function WhyNot({ choices }: { choices?: Choices }) {
  if (!choices || choices.ready.length) return null;
  return (
    <p className="dim small">
      {[...choices.unfit, ...choices.setup].map((f) => (!f.ok ? `${f.label}: ${f.why.reason}` : "")).join(". ")}.{" "}
      {!!choices.setup.length && (
        <button className="link small" onClick={() => actions.setSettingsOpen(true, "services")}>
          Media services
        </button>
      )}
    </p>
  );
}

/** One take: its poster, playing on hover when it's a clip. */
function Take({ projectId, id, video, duration, final, on, aspect, onPick }: { projectId: string; id: string; video: boolean; duration?: number; final: boolean; on: boolean; aspect: string; onPick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button className={`take ${on ? "on" : ""}`} style={{ aspectRatio: aspect }} onClick={onPick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={on ? `${id}: the one the shot shows` : `${id}: show this one`}>
      {video && hover ? <video src={proxyUrl(projectId, id)} autoPlay muted loop playsInline /> : <img src={posterUrl(projectId, id)} alt="" onError={hideBroken} />}
      {video && <span className="badge">{final ? "Final" : "▶"} {duration ? `${duration.toFixed(1)}s` : ""}</span>}
    </button>
  );
}
