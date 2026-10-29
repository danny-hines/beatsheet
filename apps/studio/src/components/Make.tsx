/**
 * Make mode: the composer (what to make, with which model, and for which shot or just for the Library), the board
 * (everything made for this project, a row per request, with what was made from a take nested under it) and the queue
 * (what's on the way, and what it's cost). Takes made for a shot land on it as they do from Inspect; loose ones wait on
 * the board and in the Library until they're put in a shot.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MakeAsk, MakeJob } from "@beatsheet/engine";
import { aspectOf, CATALOG, castOf, type Asset, type MakeOp, type Project, type Quality, type Shot } from "@beatsheet/schema";
import { ASSET_DRAG, hideBroken, posterUrl, proxyUrl, putInShot, round2, timeAgo } from "../lib";
import { actions, useProject, useStore, useTimeline } from "../store";
import { AssetMenu } from "./Cast";
import { useMakeSummary } from "./MakeSettings";
import { cost, fitOf, money, ModelSelect, pickOf, useChoices, WhyNot } from "./Takes";

const isOpen = (j: MakeJob) => j.status === "queued" || j.status === "running";
/** Whether a job's cost counts: what was asked for, unless it failed or was stopped before the service made it. */
const counts = (j: MakeJob) => j.charged || (j.status !== "failed" && j.status !== "canceled");
const modelLabel = (id: string) => CATALOG.find((m) => m.id === id)?.label ?? id;
const ratio = (aspect?: string) => (aspect ?? "16:9").replace(":", " / ");

/** What the composer is set to make. Cards on the board fill it in (Animate, Vary). */
type Draft = { op: MakeOp; prompt: string; count: number; model: string; quality: Quality; seconds: number; aspect: string; start?: string; shot?: string };

/** The project's jobs, asked for again every couple of seconds while any is going. */
function useJobs() {
  const projectId = useStore((s) => s.projectId)!;
  const [jobs, setJobs] = useState<MakeJob[]>([]);
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/jobs`).catch(() => undefined);
    if (r?.ok) setJobs((await r.json()) as MakeJob[]);
  }, [projectId]);
  useEffect(() => void refresh(), [refresh]);
  const going = jobs.some(isOpen);
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [going, refresh]);
  const post = async (what: "cancel" | "retry", ids: string[]) => {
    await fetch(`/api/projects/${projectId}/jobs/${what}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    await refresh();
  };
  return { jobs, setJobs, refresh, cancel: (ids: string[]) => post("cancel", ids), retry: (ids: string[]) => post("retry", ids) };
}

export function MakeView() {
  const p = useProject();
  const format = p.formats[0]!;
  const { jobs, setJobs, cancel, retry } = useJobs();
  const [draft, setDraft] = useState<Draft>({ op: "image", prompt: "", count: 2, model: "", quality: "rough", seconds: 5, aspect: aspectOf(format.width, format.height) });
  const top = useRef<HTMLDivElement>(null);
  const use = (d: Partial<Draft>) => {
    setDraft((x) => ({ ...x, ...d }));
    top.current?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <main className="make-view">
      <div className="make-scroll">
        <div ref={top} />
        <Composer draft={draft} setDraft={setDraft} onStarted={(js) => setJobs((prev) => [...prev, ...js])} />
        <Board jobs={jobs} use={use} retry={(j) => void retry([j.id])} />
      </div>
      <Queue jobs={jobs} cancel={(j) => void cancel([j.id])} />
    </main>
  );
}

// ---- The composer.

/** The shots a take can be for: placeholders and made shots, in the cut's order. */
function shotsToMake(p: Project): Shot[] {
  return p.shots.filter((s) => s.content.kind === "placeholder" || s.content.kind === "generated");
}
const shotPrompt = (s: Shot) => (s.content.kind === "placeholder" ? s.content.description : s.content.kind === "generated" ? s.content.prompt : "");

function Composer({ draft, setDraft, onStarted }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; onStarted: (jobs: MakeJob[]) => void }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const tl = useTimeline();
  const set = (d: Partial<Draft>) => setDraft((x) => ({ ...x, ...d }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);

  const shot = draft.shot ? p.shots.find((s) => s.id === draft.shot) : undefined;
  const resolved = shot ? tl.shots.find((r) => r.id === shot.id) : undefined;
  const shotSeconds = resolved && Number.isFinite(resolved.end - resolved.start) ? round2(resolved.end - resolved.start) : undefined;
  // The prompt the models are checked against lags the typing a little, so each key doesn't ask the engine again.
  const [settled, setSettled] = useState(draft.prompt);
  useEffect(() => {
    const t = setTimeout(() => setSettled(draft.prompt), 400);
    return () => clearTimeout(t);
  }, [draft.prompt]);
  const video = draft.op === "video";
  const seconds = video && !shot ? draft.seconds : undefined;
  const { choices, problem } = useChoices({
    op: draft.op,
    cut: cutId,
    shot: draft.shot,
    prompt: settled,
    count: draft.count,
    start: video ? draft.start : undefined,
    seconds,
    aspect: shot ? undefined : draft.aspect,
    quality: video ? draft.quality : undefined,
  });
  const chosen = fitOf(choices, draft.model);
  // A model picked for stills can't make video, and the other way round.
  useEffect(() => {
    if (draft.model && choices && !fitOf(choices, draft.model)) set({ model: "" });
  }, [choices, draft.model]); // eslint-disable-line react-hooks/exhaustive-deps

  const named = castOf(draft.prompt, p.cast).filter((u) => u.member.kind !== "style");
  const unknown = [...draft.prompt.matchAll(/@([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]!).filter((id) => !p.cast?.some((m) => m.id === id));
  const style = p.look?.style ? p.cast?.find((m) => m.id === p.look!.style && m.kind === "style") : undefined;
  // Puts @id where the cursor is, with a space either side as needed, and the cursor after it, ready for the next word.
  const mention = (id: string) => {
    const el = area.current;
    const at = el?.selectionStart ?? draft.prompt.length;
    const before = draft.prompt.slice(0, at);
    const after = draft.prompt.slice(at);
    const text = `${before}${before && !/\s$/.test(before) ? " " : ""}@${id}${/^\s/.test(after) ? "" : " "}`;
    set({ prompt: text + after });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(text.length, text.length);
    });
  };
  const pickShot = (id: string) => {
    const s = p.shots.find((x) => x.id === id);
    set({ shot: id || undefined, ...(s && !draft.prompt.trim() ? { prompt: shotPrompt(s) } : {}) });
  };

  const make = async () => {
    setError("");
    setSending(true);
    const ask: MakeAsk = {
      op: draft.op,
      cut: cutId,
      prompt: draft.prompt.trim(),
      count: draft.count,
      ...(draft.shot ? { shot: draft.shot } : { aspect: draft.aspect }),
      ...pickOf(draft.model),
      ...(video ? { quality: draft.quality, ...(draft.start ? { start: draft.start } : {}), ...(seconds ? { seconds } : {}) } : {}),
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ask) });
      const j = (await res.json()) as { jobs?: MakeJob[]; error?: string };
      if (!res.ok || !j.jobs) throw new Error(j.error ?? `${res.status}`);
      onStarted(j.jobs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const start = draft.start ? p.assets.find((a) => a.id === draft.start) : undefined;
  const aspects = [...new Set([...p.formats.map((f) => aspectOf(f.width, f.height)), "16:9", "9:16", "1:1", "4:5"])];
  const what = video ? `${draft.quality} ${draft.count === 1 ? "clip" : "clips"}` : draft.count === 1 ? "still" : "stills";

  return (
    <section className="make-composer">
      <div className="make-row">
        <span className="dim small">For</span>
        <select value={draft.shot ?? ""} onChange={(e) => pickShot(e.target.value)} aria-label="What it's for" title="A shot it's for gets the takes; otherwise they go to the Library">
          <option value="">The Library</option>
          {shotsToMake(p).map((s) => (
            <option key={s.id} value={s.id}>
              Shot {s.id}: {shotPrompt(s).slice(0, 48)}
            </option>
          ))}
        </select>
        {shot && <span className="dim small">{[shotSeconds !== undefined ? `${shotSeconds}s` : "", p.formats.map((f) => f.label).join(" and ")].filter(Boolean).join(" · ")}</span>}
      </div>
      <textarea
        ref={area}
        className="make-prompt"
        value={draft.prompt}
        rows={4}
        placeholder="What's in the picture, and how the camera sees it. Name the cast with @: @cat on the windowsill at dawn, close up"
        onChange={(e) => set({ prompt: e.target.value })}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && chosen && draft.prompt.trim() && void make()}
      />
      {!!p.cast?.length && (
        <div className="cast-chips">
          {p.cast
            .filter((m) => m.kind !== "style")
            .map((m) => (
              <button key={m.id} className={`chip ${named.some((u) => u.member.id === m.id) ? "on" : ""}`} onClick={() => mention(m.id)} title={m.about ?? m.name}>
                @{m.id}
              </button>
            ))}
        </div>
      )}
      {(unknown.length > 0 || style) && (
        <p className="dim small">
          {style && <>In the style of {style.name}. </>}
          {unknown.length > 0 && <span className="warn">{unknown.map((id) => `@${id}`).join(", ")} isn't in the cast.</span>}
        </p>
      )}
      <div className="make-row">
        <div className="segmented">
          <button className={!video ? "on" : ""} onClick={() => set({ op: "image" })} title="Stills: boards, cents each">
            Stills
          </button>
          <button className={video ? "on" : ""} onClick={() => set({ op: "video" })} title="A clip, from a still when you give it one">
            Video
          </button>
        </div>
        {video && (
          <select value={draft.quality} onChange={(e) => set({ quality: e.target.value as Quality })} aria-label="Quality" title="A rough to judge, or a final once it holds">
            <option value="rough">Rough</option>
            <option value="final">Final</option>
          </select>
        )}
        {video && !shot && (
          <label className="small seconds" title="How long a clip">
            <input type="number" min={1} max={15} step={1} value={draft.seconds} onChange={(e) => set({ seconds: Number(e.target.value) || 5 })} />s
          </label>
        )}
        {!shot && !(video && start) && (
          <select value={draft.aspect} onChange={(e) => set({ aspect: e.target.value })} aria-label="Shape" title="The shape of the picture">
            {aspects.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <select value={draft.count} onChange={(e) => set({ count: Number(e.target.value) })} aria-label="How many" title="How many takes">
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <ModelSelect choices={choices} model={draft.model} setModel={(model) => set({ model })} />
      </div>
      {video && start && (
        <div className="make-row start-frame">
          <img src={posterUrl(projectId, start.id)} alt="" onError={hideBroken} />
          <span className="small">Starts from {start.label ?? start.id}</span>
          <button className="link small" onClick={() => set({ start: undefined })}>
            Don't
          </button>
        </div>
      )}
      <WhyNot choices={choices} />
      <div className="make-row">
        <button className="primary" disabled={!chosen || !draft.prompt.trim() || sending} onClick={() => void make()}>
          Make {draft.count} {what}
          {chosen?.usd !== undefined ? ` · ${cost(chosen)}` : ""}
        </button>
        {(error || problem) && <span className="warn small">{error || problem}</span>}
      </div>
    </section>
  );
}

// ---- The board.

type Batch = { id: string; jobs: MakeJob[]; first: MakeJob; children: Batch[] };

/** Requests as rows, newest first; one made from another's take (a clip from a still) nests under it. */
function batchesOf(jobs: MakeJob[]): Batch[] {
  const byId = new Map<string, Batch>();
  for (const j of jobs) {
    const b = byId.get(j.batch) ?? { id: j.batch, jobs: [], first: j, children: [] };
    b.jobs.push(j);
    byId.set(j.batch, b);
  }
  const madeBy = new Map<string, Batch>();
  for (const b of byId.values()) for (const j of b.jobs) if (j.asset) madeBy.set(j.asset, b);
  const top: Batch[] = [];
  for (const b of byId.values()) {
    const parent = b.first.request.start ? madeBy.get(b.first.request.start) : undefined;
    (parent && parent !== b ? parent.children : top).push(b);
  }
  const newest = (a: Batch, b: Batch) => b.first.createdAt.localeCompare(a.first.createdAt);
  for (const b of byId.values()) b.children.sort(newest);
  return top.sort(newest);
}

function Board({ jobs, use, retry }: { jobs: MakeJob[]; use: (d: Partial<Draft>) => void; retry: (j: MakeJob) => void }) {
  const batches = useMemo(() => batchesOf(jobs), [jobs]);
  if (!batches.length) return <p className="dim small board-empty">Nothing made yet. Describe a picture above, or a shot's takes from Inspect, and it shows up here.</p>;
  return (
    <section className="make-board">
      {batches.map((b) => (
        <BatchRow key={b.id} batch={b} use={use} retry={retry} />
      ))}
    </section>
  );
}

function BatchRow({ batch, use, retry }: { batch: Batch; use: (d: Partial<Draft>) => void; retry: (j: MakeJob) => void }) {
  const p = useProject();
  const j = batch.first;
  const r = j.request;
  const usd = batch.jobs.filter(counts).reduce((s, x) => s + (x.usd ?? 0), 0);
  const kind = j.sheet ? `Sheet for @${j.sheet}` : j.op === "image" ? "Stills" : `${j.quality === "final" ? "Final" : "Rough"} clips`;
  const where = j.shot ? (p.shots.some((s) => s.id === j.shot) ? `for shot ${j.shot}` : `for shot ${j.shot} (gone)`) : j.sheet ? "" : "for the Library";
  const shown = batch.jobs.filter((x) => x.status !== "canceled" || x.asset);
  return (
    <div className="batch">
      <div className="batch-head">
        <strong className="small">{kind}</strong>
        <span className="dim small">{[modelLabel(j.model), where, usd ? `$${usd.toFixed(2)}` : "", timeAgo(j.createdAt)].filter(Boolean).join(" · ")}</span>
        <span className="spacer" />
        <button className="link small" onClick={() => use({ op: j.op, prompt: r.prompt, model: `${j.model}@${j.route}`, count: batch.jobs.length, shot: j.shot, start: r.start, ...(j.quality ? { quality: j.quality } : {}), ...(r.aspect ? { aspect: r.aspect } : {}), ...(r.seconds ? { seconds: r.seconds } : {}) })} title="Put this request in the composer, to make more like it or change it">
          Vary
        </button>
      </div>
      <p className="batch-prompt small" title={r.sent ?? r.prompt}>
        {r.prompt}
      </p>
      <div className="batch-cards">
        {shown.map((x) => (
          <Card key={x.id} job={x} use={use} retry={retry} />
        ))}
      </div>
      {batch.children.length > 0 && (
        <div className="batch-children">
          {batch.children.map((c) => (
            <BatchRow key={c.id} batch={c} use={use} retry={retry} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A take on the board: what it made (playing on hover), or where it is, or why it didn't come. */
function Card({ job, use, retry }: { job: MakeJob; use: (d: Partial<Draft>) => void; retry: (j: MakeJob) => void }) {
  const projectId = useStore((s) => s.projectId)!;
  const selected = useStore((s) => (s.selection?.kind === "asset" ? s.selection.id : undefined));
  const p = useProject();
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const a = job.asset ? p.assets.find((x) => x.id === job.asset) : undefined;
  const style = { aspectRatio: ratio(a?.width && a.height ? `${a.width}:${a.height}` : job.request.aspect) };
  if (!a) {
    if (isOpen(job))
      return (
        <div className="make-card pending" style={style}>
          {job.position !== undefined ? `${job.position + 1} in line` : "Making…"}
        </div>
      );
    return (
      <div className="make-card failed" style={style} title={job.error}>
        <span className="small">{job.status === "canceled" ? "Stopped" : job.status === "done" ? "Not in the project any more" : (job.error ?? "Didn't come")}</span>
        {job.status === "failed" && (
          <button className="link small" onClick={() => retry(job)} title={job.charged ? "It was made; fetch it again, at no cost" : "Ask for it again; it costs again"}>
            Try again{job.charged ? "" : ` · ${money(job.usd)}`}
          </button>
        )}
      </div>
    );
  }
  const video = a.kind === "video";
  const final = a.provenance?.params?.quality === "final";
  return (
    <div
      className={`make-card ${selected === a.id ? "sel" : ""}`}
      style={style}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ASSET_DRAG, a.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => actions.select({ kind: "asset", id: a.id })}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      title={`${a.label ?? a.id}${a.provenance?.costUsd !== undefined ? ` · $${a.provenance.costUsd.toFixed(3)}` : ""}`}
    >
      {video && hover ? <video src={proxyUrl(projectId, a.id)} autoPlay muted loop playsInline /> : <img src={posterUrl(projectId, a.id)} alt="" onError={hideBroken} />}
      {video && <span className="badge">{final ? "Final" : "▶"} {a.duration ? `${a.duration.toFixed(1)}s` : ""}</span>}
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {!video && (
          <button onClick={() => use({ op: "video", start: a.id, prompt: job.request.prompt, shot: job.shot, model: "", count: 1 })} title="Make a clip that starts from this still">
            Animate
          </button>
        )}
        <UseInShot asset={a} />
      </div>
      {menu && <AssetMenu a={a} x={menu.x} y={menu.y} onClose={() => setMenu(undefined)} />}
    </div>
  );
}

/** Puts a take in one of the cut's placeholder or made shots, as the take it shows. */
function UseInShot({ asset }: { asset: Asset }) {
  const p = useProject();
  const shots = shotsToMake(p);
  if (!shots.length) return null;
  return (
    <select
      value=""
      onChange={(e) => e.target.value && actions.edit((d) => putInShot(d, e.target.value, asset))}
      aria-label="Use in a shot"
      title="Make it the take a shot shows"
    >
      <option value="">Use in…</option>
      {shots.map((s) => (
        <option key={s.id} value={s.id}>
          Shot {s.id}
          {s.content.kind === "generated" && s.content.take === asset.id ? " (showing it)" : ""}
        </option>
      ))}
    </select>
  );
}

// ---- The queue.

function Queue({ jobs, cancel }: { jobs: MakeJob[]; cancel: (j: MakeJob) => void }) {
  const limit = useMakeSummary();
  const going = jobs.filter(isOpen);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const spent = (list: MakeJob[]) => list.filter(counts).reduce((s, j) => s + (j.usd ?? 0), 0);
  const today = spent(jobs.filter((j) => j.createdAt >= midnight.toISOString()));
  return (
    <footer className="make-queue">
      <div className="queue-jobs">
        {going.length ? (
          going.map((j) => (
            <span key={j.id} className="queue-job small" title={j.request.prompt}>
              <span className="dots" /> {j.op === "image" ? "Still" : "Clip"} · {modelLabel(j.model)} · {j.position !== undefined ? `${j.position + 1} in line` : `${timeAgo(j.createdAt).replace(/ ago$/, "")}`}
              <button className="link small" onClick={() => cancel(j)} title="Stop it. One already being made may still be charged">
                Stop
              </button>
            </span>
          ))
        ) : (
          <span className="dim small">Nothing on the way.</span>
        )}
      </div>
      <span className="dim small" title="What made takes cost: today and in all, in this project, and against the spending limit (Settings → Making)">
        This project: ${spent(jobs).toFixed(2)} · today ${today.toFixed(2)}
        {limit && limit !== "No limit" ? ` · limit ${limit}` : ""}
      </span>
    </footer>
  );
}
