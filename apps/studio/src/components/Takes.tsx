/**
 * A placeholder or generated shot's takes, and making more: stills first (a board for the shot, cents each), then a
 * rough clip from the chosen board, then a final once the cut holds. The models come from the catalog, checked
 * against this shot and the services set up, and the ones that can't make it say why rather than being hidden. The
 * button says what a batch will cost.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MakeAsk, MakeJob } from "@beatsheet/engine";
import { CATALOG, castOf, commercialWords, resolveTimeline, type Asset, type Choices, type Fit, type FitOk, type MakeOp, type Quality, type Shot } from "@beatsheet/schema";
import { hideBroken, posterUrl, proxyUrl, round2 } from "../lib";
import { actions, useProject, useStore } from "../store";
import { TextField } from "./ui";
import { EnlargeIcon, Viewer } from "./Viewer";

const isOpen = (j: MakeJob) => j.status === "queued" || j.status === "running";
export const money = (usd?: number) => (usd === undefined ? "" : `~$${usd.toFixed(2)}`);
/** A catalog model by name, from its id or (as older takes recorded it) one of its endpoints. */
export const modelLabel = (id: string) => (CATALOG.find((c) => c.id === id) ?? CATALOG.find((c) => c.routes.some((r) => Object.values(r.endpoints).includes(id))))?.label ?? id;
/** The model a picture was made with, by name, when it was made. */
export const madeWith = (a: Asset | undefined) => (a?.provenance?.source === "generated" && a.provenance.model ? modelLabel(a.provenance.model) : undefined);
/** What it costs where it runs: a plan's allowance, or the person's own graphics card, rather than money. */
export const cost = (f: { usd?: number; route?: string }) => (f.route === "comfy" ? "on your graphics card" : f.usd === 0 ? "on your plan" : money(f.usd));
const wait = (s?: number) => (s === undefined ? "" : s < 90 ? `~${Math.max(10, Math.round(s / 10) * 10)}s` : `~${Math.round(s / 60)} min`);
/**
 * A model, where it runs when it runs in more than one place, what it costs and how long it takes, and when what it
 * makes there isn't free to use commercially, that; or why it can't.
 */
export const fitLabel = (f: Fit, where = false) => {
  if (!f.ok) return `${f.label}: ${f.why.reason}`;
  const place = (where || !!f.also?.length) && f.where;
  // "ChatGPT plan" already says it's on the plan.
  return [f.label, place, !(place && f.usd === 0) && cost(f), wait(f.wait), f.commercial && commercialWords(f.commercial)].filter(Boolean).join(" · ");
};

/** A model picked in ModelSelect, and where it runs when there's a choice: "gpt-image@chatgpt". */
export const pickOf = (value: string): { model?: string; via?: string } => {
  if (!value) return {};
  const [model, via] = value.split("@");
  return { model, ...(via ? { via } : {}) };
};
/** A ready model in each place it can run: itself (the cheapest), then the others. */
const placesOf = (f: FitOk): FitOk[] => [f, ...(f.also ?? []).map((o) => ({ ...f, route: o.route, where: o.where, usd: o.usd, commercial: o.commercial, also: undefined }))];
/** The fit for a pick (Auto when there's none), or nothing when that model can't make this now. */
export function fitOf(choices: Choices | undefined, value: string): FitOk | undefined {
  if (!choices || !value) return choices?.auto;
  const { model, via } = pickOf(value);
  const f = choices.ready.find((x) => x.model === model);
  return f && (via ? placesOf(f).find((x) => x.route === via) : f);
}

/**
 * The project's jobs that `match` (a shot's, a sheet's), asked for again every couple of seconds while any is going;
 * finished takes arrive with the project. `make` starts more (several requests at once start all or none), and says
 * why when it can't.
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
  const make = async (ask: MakeAsk | MakeAsk[]) => {
    setError("");
    setSending(true);
    try {
      const body = Array.isArray(ask) ? { asks: ask } : ask;
      const res = await fetch(`/api/projects/${projectId}/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
  const shown = takes.map((id) => p.assets.find((x) => x.id === id)).filter((a): a is Asset => !!a);
  const [large, setLarge] = useState<number>();
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
  // A clip can copy the movement in a stretch of another (SCAIL-2): the one the shot's takes followed, until changed.
  const clips = p.assets.filter((a) => a.kind === "video" && !a.cutout && !a.version && a.provenance?.source !== "generated");
  const [follow, setFollow] = useState<{ asset: string; from: number; to?: number } | undefined>(c.kind === "generated" ? c.drive : undefined);
  // Who the prompt names: the cast it'll be given, and any @name that isn't in the cast.
  const named = castOf(prompt, p.cast, c.kind === "generated" ? c.cast : undefined).filter((u) => u.member.kind !== "style");
  // A clip can say the lines heard while the shot plays (lip-sync): the ones its characters say, else all of them. The
  // chosen still is made to talk, or the mouths in the clip showing are changed.
  const heard = useMemo(() => {
    const voiced = p.voice?.lines ?? [];
    if (!voiced.length) return [];
    const tl = resolveTimeline(p, p.formats[0]!.id);
    const r = tl.shots.find((s) => s.id === shot.id);
    const all = r ? tl.lines.filter((l) => l.end > r.start + 1e-6 && l.start < r.end - 1e-6) : [];
    const theirs = all.filter((l) => named.some((u) => u.member.kind === "character" && u.member.id === voiced.find((v) => v.id === l.id)?.speaker));
    return (theirs.length ? theirs : all).map((l) => ({ ...l, voiced: !!voiced.find((v) => v.id === l.id)?.file }));
  }, [p, shot.id, named.map((u) => u.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [say, setSay] = useState(c.kind === "generated" && !!c.speech);
  const [dub, setDub] = useState(showing?.kind === "video");
  const speaking = op === "video" && say && heard.length > 0;
  const changing = speaking && dub && showing?.kind === "video";
  const start = op === "video" && fromBoard && !changing ? board : undefined;
  const length = seconds && Number.isFinite(seconds) ? round2(seconds) : undefined;
  const drive = op === "video" ? (follow && !speaking ? { drive: follow.asset, from: follow.from, to: follow.to } : { drive: "none" }) : {};
  const lipsync = op === "video" ? (speaking ? { speech: "lines", ...(changing ? { clip: "take" } : {}) } : { speech: "none" }) : {};
  const { going, make, sending, error, failed, retry } = useMake((j) => j.shot === shot.id && (!j.cut || j.cut === cutId), `${shot.id}:${cutId}`);
  const { choices, problem } = useChoices({ op, shot: shot.id, cut: cutId, count, seconds: length, start, quality: op === "video" ? quality : undefined, ...drive, ...lipsync });
  const chosen = fitOf(choices, model);
  // A model picked for stills can't make video, and the other way round.
  useEffect(() => {
    if (model && choices && !fitOf(choices, model)) setModel("");
  }, [choices, model]);
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
          {shown.map((a, i) => (
            <Take
              key={a.id}
              projectId={projectId}
              id={a.id}
              video={a.kind === "video"}
              duration={a.duration}
              final={a.provenance?.params?.quality === "final"}
              on={c.kind === "generated" && c.take === a.id}
              aspect={aspect}
              onPick={() => pick(a.id)}
              onEnlarge={() => setLarge(i)}
            />
          ))}
          {going.map((j) => (
            <div key={j.id} className="take pending" style={{ aspectRatio: aspect }} title={j.op === "image" ? "A still on its way" : "A clip on its way"}>
              {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
            </div>
          ))}
        </div>
      ) : (
        <p className="dim small">No takes yet. Make a few stills to settle the shot, then a clip from the one you like.</p>
      )}
      {large !== undefined && (
        <Viewer
          projectId={projectId}
          items={shown.map((a) => ({ id: a.id, video: a.kind === "video", caption: [a.id, madeWith(a) && `made with ${madeWith(a)}`].filter(Boolean).join(" · ") }))}
          at={large}
          onClose={() => setLarge(undefined)}
          actions={(item) =>
            c.kind === "generated" && c.take === item.id ? (
              <span className="dim small">The one the shot shows</span>
            ) : (
              <button onClick={() => pick(item.id)}>Show this one</button>
            )
          }
        />
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
      {op === "video" && board && !changing && (
        <label className="check-row small">
          <input type="checkbox" checked={fromBoard} onChange={(e) => setFromBoard(e.target.checked)} />
          Start from the chosen still
        </label>
      )}
      {op === "video" && heard.length > 0 && (
        <>
          <label className="check-row small" title="Lip-sync: whoever's in it says the lines heard while the shot plays, in step with the cut's voice">
            <input
              type="checkbox"
              checked={say}
              onChange={(e) => {
                setSay(e.target.checked);
                if (e.target.checked) setFollow(undefined);
              }}
            />
            Say the lines heard here
          </label>
          {say && (
            <>
              <p className="dim small">
                {heard.map((l) => `“${l.text}”`).join(" ")}
                {heard.some((l) => !l.voiced) && <span className="warn"> Not voiced yet: narrate {heard.filter((l) => !l.voiced).length === 1 ? "it" : "them"} first.</span>}
              </p>
              {showing?.kind === "video" && (
                <select value={dub ? "clip" : "still"} onChange={(e) => setDub(e.target.value === "clip")} aria-label="What says them" title="Change the mouths in the clip the shot shows, keeping how it moves; or make a new clip of the chosen still talking">
                  <option value="clip">Change the mouths in the clip showing</option>
                  <option value="still">Make the chosen still talk</option>
                </select>
              )}
            </>
          )}
        </>
      )}
      {op === "video" && clips.length > 0 && !speaking && (
        <>
          <label className="check-row small" title="The people in the still move as the people in a stretch of a clip do: someone acting the shot out, or the original footage">
            <input
              type="checkbox"
              checked={!!follow}
              onChange={(e) => {
                setFollow(e.target.checked ? { asset: clips[0]!.id, from: 0 } : undefined);
                if (e.target.checked) setSay(false);
              }}
            />
            Copy the movement in a clip
          </label>
          {follow && (
            <div className="make-row small">
              <select value={follow.asset} onChange={(e) => setFollow({ asset: e.target.value, from: 0 })} aria-label="The clip to follow">
                {clips.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label ?? a.id}
                  </option>
                ))}
              </select>
              <span>from</span>
              <Seconds value={follow.from} onCommit={(from) => setFollow({ ...follow, from: from ?? 0 })} label="Second of the clip to start at" />
              <span>to</span>
              <Seconds value={follow.to} placeholder={length ? String(round2(follow.from + length)) : "end"} onCommit={(to) => setFollow({ ...follow, to })} label="Second of the clip to stop at" />
            </div>
          )}
        </>
      )}
      <WhyNot choices={choices} only={speaking ? (id) => !!CATALOG.find((m) => m.id === id)?.takes.speech : follow ? (id) => !!CATALOG.find((m) => m.id === id)?.takes.drive : undefined} />
      <div className="make-row">
        <button
          className="primary"
          disabled={!chosen || !prompt.trim() || sending}
          onClick={() =>
            void make({
              op,
              cut: cutId,
              shot: shot.id,
              prompt,
              count,
              ...(op === "video" ? { quality, drive: speaking ? null : (follow ?? null), speech: speaking ? {} : null, ...(changing ? { clip: "take" as const } : {}) } : {}),
              ...pickOf(model),
              ...(start ? { start } : {}),
              ...(length ? { seconds: length } : {}),
            })
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
              <option key={`${x.model}@${x.route}`} value={`${x.model}@${x.route}`} title={x.commercial?.why}>
                {fitLabel(x, true)}
              </option>
            ))
          : [
              <option key={f.model} value={f.model} title={f.commercial?.why}>
                {fitLabel(f)}
              </option>,
            ],
      )}
      {!!choices?.setup.length && (
        <optgroup label="Needs a key, a connection or an install">
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

/**
 * When nothing can make it: why not, for each model (or only the ones that do this kind of thing, `only`: the ones that
 * lip-sync, for a take that says its line), and where to add a key (or connect ComfyUI).
 */
export function WhyNot({ choices: all, only }: { choices?: Choices; only?: (model: string) => boolean }) {
  if (!all || all.ready.length) return null;
  const choices = only ? { ...all, setup: all.setup.filter((f) => only(f.model)), unfit: all.unfit.filter((f) => only(f.model)) } : all;
  // ComfyUI to connect, or model files to fetch into it, are in Settings → Making; keys are in Media services.
  const onComfy = (f: Fit) => !f.ok && ((f.why.kind === "connect" && f.why.services.includes("comfy")) || (f.why.kind === "install" && f.why.service === "comfy"));
  const comfy = choices.setup.some(onComfy);
  const keys = choices.setup.some((f) => !onComfy(f));
  return (
    <p className="dim small">
      {[...choices.unfit, ...choices.setup].map((f) => (!f.ok ? `${f.label}: ${f.why.reason}` : "")).join(". ")}.{" "}
      {keys && (
        <button className="link small" onClick={() => actions.setSettingsOpen(true, "services")}>
          Media services
        </button>
      )}{" "}
      {comfy && (
        <button className="link small" onClick={() => actions.setSettingsOpen(true, "make")}>
          ComfyUI settings
        </button>
      )}
    </p>
  );
}

/** A number of seconds, saved when it's left; empty for none. */
function Seconds({ value, placeholder, label, onCommit }: { value?: number; placeholder?: string; label: string; onCommit: (s: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    const s = text.trim() === "" ? undefined : Number(text);
    if (s === undefined || (Number.isFinite(s) && s >= 0)) onCommit(s === undefined ? undefined : round2(s));
    else setText(value === undefined ? "" : String(value));
  };
  return <input className="seconds" type="number" min={0} step={0.1} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} aria-label={label} />;
}

/** One take: its poster, playing on hover when it's a clip, and a button to see it large. */
function Take({
  projectId,
  id,
  video,
  duration,
  final,
  on,
  aspect,
  onPick,
  onEnlarge,
}: {
  projectId: string;
  id: string;
  video: boolean;
  duration?: number;
  final: boolean;
  on: boolean;
  aspect: string;
  onPick: () => void;
  onEnlarge: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span className="take-wrap" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button className={`take ${on ? "on" : ""}`} style={{ aspectRatio: aspect }} onClick={onPick} title={on ? `${id}: the one the shot shows` : `${id}: show this one`}>
        {video && hover ? <video src={proxyUrl(projectId, id)} autoPlay muted loop playsInline /> : <img src={posterUrl(projectId, id)} alt="" onError={hideBroken} />}
        {video && <span className="badge">{final ? "Final" : "▶"} {duration ? `${duration.toFixed(1)}s` : ""}</span>}
      </button>
      <button className="enlarge" onClick={onEnlarge} title="See it large, to zoom in" aria-label="See it large">
        <EnlargeIcon />
      </button>
    </span>
  );
}
