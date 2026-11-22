/**
 * Make mode. The middle of the window is Make's own: three pages (the cut's shots to make, the cast and sets, and
 * everything made), and whatever is selected (a shot, a cast member, a take) opened large over them rather than in a
 * side panel. The composer is docked at the foot (what to make, with which model, and for which shot or just for the
 * Library), with the queue under it (what's on the way, and what it's cost). Takes made for a shot land on it; loose
 * ones wait on the Made page and in the Library until they're put in a shot.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MakeAsk, MakeJob } from "@beatsheet/engine";
import { aspectOf, CATALOG, castOf, type Asset, type MakeOp, type Quality } from "@beatsheet/schema";
import { ASSET_DRAG, hideBroken, posterUrl, proxyUrl, putInShot, round2, timeAgo } from "../lib";
import { actions, setState, useProject, useStore, useTimeline, type State } from "../store";
import { AssetView } from "./AssetView";
import { AssetMenu } from "./Cast";
import { CastMemberPage, CastPage } from "./MakeCast";
import { useMakeSummary } from "./MakeSettings";
import { Given, isOpen, ShotPage, shotPrompt, ShotsPage, shotsToMake } from "./MakeShots";
import { NotesFor } from "./Side";
import { cost, fitOf, madeWith, ModelPicker, money, pickOf, useChoices, WhyNot } from "./Takes";
import { Icon } from "./Icon";

/** Whether a job's cost counts: what was asked for, unless it failed or was stopped before the service made it. */
const counts = (j: MakeJob) => j.charged || (j.status !== "failed" && j.status !== "canceled");
const modelLabel = (id: string) => CATALOG.find((m) => m.id === id)?.label ?? id;
const ratio = (aspect?: string) => (aspect ?? "16:9").replace(":", " / ");
const PAGES: [State["makePage"], string][] = [
  ["shots", "Shots"],
  ["cast", "Cast & sets"],
  ["made", "Made"],
];

/** What the composer is set to make. Cards on the Made page fill it in (Animate, Vary). */
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
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const page = useStore((s) => s.makePage);
  const sel = useStore((s) => s.selection);
  const format = p.formats[0]!;
  const { jobs, setJobs, cancel, retry } = useJobs();
  const [draft, setDraft] = useState<Draft>({ op: "image", prompt: "", count: 2, model: "", quality: "rough", seconds: 5, aspect: aspectOf(format.width, format.height) });
  const area = useRef<HTMLTextAreaElement>(null);
  const use = (d: Partial<Draft>) => {
    setDraft((x) => ({ ...x, ...d }));
    requestAnimationFrame(() => area.current?.focus());
  };
  const started = (js: MakeJob[]) => setJobs((prev) => [...prev, ...js]);
  // A cut with nothing to make opens on what's been made, not on an empty page of shots.
  useEffect(() => {
    if (page === "shots" && !shotsToMake(p).length) setState({ makePage: "made" });
  }, [projectId, cutId]); // eslint-disable-line react-hooks/exhaustive-deps

  // What's selected opens large: a shot to make, a cast member, or a file.
  const shot = sel?.kind === "shot" ? shotsToMake(p).find((s) => s.id === sel.id) : undefined;
  const member = sel?.kind === "cast" ? p.cast?.find((m) => m.id === sel.id) : undefined;
  const asset = sel?.kind === "asset" ? p.assets.find((a) => a.id === sel.id) : undefined;
  const back = () => actions.select(undefined);
  const backLabel = PAGES.find(([id]) => id === page)![1];
  // A shot and a cast member have their own making; the composer is for everything else.
  const composing = !shot && !member && (page !== "cast" || !!asset);
  // Each page keeps its place: something opened large starts at its top, and closing it comes back to where the page was.
  const scroller = useRef<HTMLDivElement>(null);
  const places = useRef<Record<string, number>>({});
  const open = shot ? `shot:${shot.id}` : member ? `cast:${member.id}` : asset ? `asset:${asset.id}` : undefined;
  const where = open ?? page;
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = open ? 0 : (places.current[where] ?? 0);
  }, [where]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="make-view">
      <MakeNav jobs={jobs} />
      <div className="make-scroll" ref={scroller} onScroll={(e) => void (places.current[where] = e.currentTarget.scrollTop)}>
        {shot ? (
          <ShotPage key={shot.id} shot={shot} jobs={jobs} back={back} backLabel={backLabel} />
        ) : member ? (
          <CastMemberPage id={member.id} back={back} backLabel={backLabel} />
        ) : asset ? (
          <AssetPage a={asset} job={jobs.find((j) => j.asset === asset.id)} use={use} back={back} backLabel={backLabel} />
        ) : page === "shots" ? (
          <ShotsPage jobs={jobs} onStarted={started} />
        ) : page === "cast" ? (
          <CastPage />
        ) : (
          <Board jobs={jobs} use={use} retry={(j) => void retry([j.id])} />
        )}
      </div>
      {composing && <Composer draft={draft} setDraft={setDraft} onStarted={started} area={area} />}
      <Queue jobs={jobs} cancel={(j) => void cancel([j.id])} />
    </main>
  );
}

/** Make's pages, and the panel on the right brought back when it's folded away. */
function MakeNav({ jobs }: { jobs: MakeJob[] }) {
  const p = useProject();
  const page = useStore((s) => s.makePage);
  const wide = useStore((s) => s.makeWide);
  const agent = useStore((s) => s.agent);
  const asks = !agent.project || agent.project === p.id ? agent.approvals.length : 0;
  const n: Record<State["makePage"], number> = { shots: shotsToMake(p).length, cast: p.cast?.length ?? 0, made: jobs.filter((j) => j.asset && p.assets.some((a) => a.id === j.asset)).length };
  return (
    <nav className="make-nav">
      <div className="make-tabs" role="tablist" aria-label="Make">
        {PAGES.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={page === id} className={page === id ? "on" : ""} onClick={() => actions.setMakePage(id)}>
            {name}
            {n[id] > 0 && <span className="n">{n[id]}</span>}
            {id === "made" && jobs.some(isOpen) && <span className="dots" title="Some are on the way" />}
          </button>
        ))}
      </div>
      <span className="spacer" />
      {wide && (
        <button onClick={() => actions.setMakeWide(false)} title="Bring back the agent and the notes">
          Agent {asks > 0 && <span className="count">{asks}</span>} <Icon name="back" size={12} />
        </button>
      )}
    </nav>
  );
}

// ---- The composer.

function Composer({ draft, setDraft, onStarted, area }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void; onStarted: (jobs: MakeJob[]) => void; area: React.RefObject<HTMLTextAreaElement | null> }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const tl = useTimeline();
  const set = (d: Partial<Draft>) => setDraft((x) => ({ ...x, ...d }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

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
  const { choices, problem } = useChoices({ op: draft.op, cut: cutId, shot: shot?.id, prompt: settled, count: draft.count, start: video ? draft.start : undefined, seconds, aspect: shot ? undefined : draft.aspect, quality: video ? draft.quality : undefined });
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
    set({ shot: id || undefined, ...(s && !draft.prompt.trim() ? { prompt: shotPrompt(s, draft.op) } : {}) });
  };

  const make = async () => {
    setError("");
    setSending(true);
    const ask: MakeAsk = {
      op: draft.op,
      cut: cutId,
      prompt: draft.prompt.trim(),
      count: draft.count,
      ...(shot ? { shot: shot.id } : { aspect: draft.aspect }),
      ...pickOf(draft.model),
      ...(video ? { quality: draft.quality, ...(draft.start ? { start: draft.start } : {}), ...(seconds ? { seconds } : {}) } : {}),
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/make`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ask) });
      const j = (await res.json()) as { jobs?: MakeJob[]; error?: string };
      if (!res.ok || !j.jobs) throw new Error(j.error ?? `${res.status}`);
      onStarted(j.jobs);
      // What was asked for shows where it lands: on its shot, or with everything made.
      if (shot) actions.select({ kind: "shot", id: shot.id });
      else actions.setMakePage("made");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const start = video && draft.start ? p.assets.find((a) => a.id === draft.start) : undefined;
  const aspects = [...new Set([...p.formats.map((f) => aspectOf(f.width, f.height)), "16:9", "9:16", "1:1", "4:5"])];
  const what = video ? `${draft.quality} ${draft.count === 1 ? "clip" : "clips"}` : draft.count === 1 ? "still" : "stills";
  const lines = draft.prompt.split("\n").reduce((n, l) => n + 1 + Math.floor(l.length / 96), 0);

  return (
    <section
      className={`make-composer ${over ? "over" : ""}`}
      // What's attached decides what's made: a picture dropped here is what a clip starts from.
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(ASSET_DRAG)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const a = p.assets.find((x) => x.id === e.dataTransfer.getData(ASSET_DRAG));
        if (a?.kind !== "image") return;
        e.preventDefault();
        set({ op: "video", start: a.id, model: "" });
      }}
    >
      <div className="composer-main">
        <div className="composer-top">
          {start && (
            <span className="composer-start" title={`The clip starts from ${start.label ?? start.id}`}>
              <img src={posterUrl(projectId, start.id)} alt="" onError={hideBroken} />
              <span className="composer-start-word">Starts from</span>
              <button onClick={() => set({ start: undefined })} title="Don't start from it" aria-label="Don't start from it">
                <Icon name="close" size={10} />
              </button>
            </span>
          )}
          <textarea
            ref={area}
            className="make-prompt"
            value={draft.prompt}
            rows={Math.min(8, Math.max(2, lines))}
            placeholder={
              video
                ? start
                  ? "What moves, and how the camera does."
                  : "What happens, and how the camera sees it. Drop a picture here to start from it."
                : "What's in the picture, and how the camera sees it. Name the cast with @: @cat on the windowsill at dawn, close up"
            }
            onChange={(e) => set({ prompt: e.target.value })}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && chosen && draft.prompt.trim() && void make()}
          />
        </div>
        {(!!p.cast?.some((m) => m.kind !== "style") || unknown.length > 0 || style) && (
          <div className="cast-chips">
            {p.cast
              ?.filter((m) => m.kind !== "style")
              .map((m) => (
                <button key={m.id} className={`chip ${named.some((u) => u.member.id === m.id) ? "on" : ""}`} onClick={() => mention(m.id)} title={m.about ?? m.name}>
                  @{m.id}
                </button>
              ))}
            {style && <span className="dim small">In the style of {style.name}.</span>}
            {unknown.length > 0 && <span className="warn small">{unknown.map((id) => `@${id}`).join(", ")} isn't in the cast.</span>}
          </div>
        )}
        <div className="composer-bar">
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
          <span className="stepper" title="How many takes">
            <button disabled={draft.count <= 1} onClick={() => set({ count: draft.count - 1 })} aria-label="One fewer">
              <Icon name="minus" size={10} />
            </button>
            <span aria-label="How many takes">{draft.count}</span>
            <button disabled={draft.count >= 4} onClick={() => set({ count: draft.count + 1 })} aria-label="One more">
              <Icon name="add" size={10} />
            </button>
          </span>
          <ModelPicker choices={choices} model={draft.model} setModel={(model) => set({ model })} />
          <select
            className="composer-for"
            value={shot?.id ?? ""}
            onChange={(e) => pickShot(e.target.value)}
            aria-label="What it's for"
            title={shot ? [`Shot ${shot.id}`, shotSeconds !== undefined ? `${shotSeconds}s` : "", p.formats.map((f) => f.label).join(" and ")].filter(Boolean).join(" · ") : "A shot it's for gets the takes; otherwise they go to the Library"}
          >
            <option value="">For the Library</option>
            {shotsToMake(p).map((s) => (
              <option key={s.id} value={s.id}>
                For shot {s.id}: {(s.label ?? shotPrompt(s)).slice(0, 40)}
              </option>
            ))}
          </select>
        </div>
        {(error || problem) && <p className="warn small">{error || problem}</p>}
        <WhyNot choices={choices} />
      </div>
      <button className="primary composer-go" disabled={!chosen || !draft.prompt.trim() || sending} onClick={() => void make()} title="Make them (⌘ Enter)">
        <span>
          Make {draft.count} {what}
        </span>
        {chosen?.usd !== undefined && <span className="composer-go-cost">{cost(chosen)}</span>}
      </button>
    </section>
  );
}

// ---- A file, large.

/**
 * A take (or any file from the Library) opened in Make: the picture large with what's known about it beside it, and
 * for something made, what it was asked for and what to do with it next.
 */
function AssetPage({ a, job, use, back, backLabel }: { a: Asset; job?: MakeJob; use: (d: Partial<Draft>) => void; back: () => void; backLabel: string }) {
  const projectId = useStore((s) => s.projectId)!;
  const p = useProject();
  const [continuing, setContinuing] = useState(false);
  const made = a.provenance?.source === "generated";
  const prompt = job?.request.prompt ?? a.provenance?.prompt ?? "";
  const video = a.kind === "video";
  const forShot = job?.shot && p.shots.some((s) => s.id === job.shot) ? job.shot : undefined;
  const from = job?.request.start ? p.assets.find((x) => x.id === job.request.start) : undefined;
  // The next clip starts where this one ends: its last frame becomes a still, and the composer starts from it.
  const carryOn = async () => {
    setContinuing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/frame`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: a.id }) });
      const out = (await res.json()) as Asset & { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't take its last frame");
      await actions.reload();
      use({ op: "video", start: out.id, prompt: "", shot: undefined, model: "", count: 1, ...(job?.quality ? { quality: job.quality } : {}) });
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
    } finally {
      setContinuing(false);
    }
  };
  return (
    <div className="make-page asset-page">
      <header className="page-head">
        <button className="back" onClick={back}>
          <Icon name="back" size={12} /> {backLabel}
        </button>
        <h2>{a.label ?? a.id}</h2>
        {made && (
          <span className="dim small">
            {[
              job?.sheet ? `Sheet for @${job.sheet}` : video ? (a.provenance?.params?.quality === "final" ? "Final clip" : "Rough clip") : "Still",
              madeWith(a),
              a.provenance?.costUsd !== undefined ? `$${a.provenance.costUsd.toFixed(2)}` : "",
              a.provenance?.createdAt ? timeAgo(a.provenance.createdAt) : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        <span className="spacer" />
        {made && job && (
          <button
            onClick={() =>
              use({
                op: job.op,
                prompt: job.request.prompt,
                model: `${job.model}@${job.route}`,
                shot: job.shot,
                start: job.request.start,
                ...(job.quality ? { quality: job.quality } : {}),
                ...(job.request.aspect ? { aspect: job.request.aspect } : {}),
                ...(job.request.seconds ? { seconds: job.request.seconds } : {}),
              })
            }
            title="Put what was asked for in the composer, to make more like it or change it"
          >
            Vary
          </button>
        )}
        {a.kind === "image" && (
          <button onClick={() => use({ op: "video", start: a.id, prompt: made ? prompt : "", shot: forShot, model: "", count: 1 })} title="Make a clip that starts from this picture">
            Animate
          </button>
        )}
        {video && (
          <button disabled={continuing} onClick={() => void carryOn()} title="Make a clip that starts where this one ends, from its last frame">
            {continuing ? "…" : "Continue"}
          </button>
        )}
        {(a.kind === "image" || video) && <UseInShot asset={a} />}
      </header>
      {made && (prompt || forShot || from) && (
        <div className="asked">
          {prompt && <p title={job?.request.sent}>{prompt}</p>}
          <p className="dim small">
            {forShot && (
              <>
                Made for{" "}
                <button className="link small" onClick={() => actions.select({ kind: "shot", id: forShot })}>
                  shot {forShot}
                </button>
                .{" "}
              </>
            )}
            {from && (
              <>
                Starts from{" "}
                <button className="link small" onClick={() => actions.select({ kind: "asset", id: from.id })}>
                  {from.label ?? from.id}
                </button>
                .
              </>
            )}
          </p>
        </div>
      )}
      <Given a={a} />
      <AssetView a={a} />
      <div className="inspector asset-notes">
        <NotesFor />
      </div>
    </div>
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

const FILTERS = [
  ["all", "All"],
  ["stills", "Stills"],
  ["clips", "Clips"],
  ["sheets", "Cast pictures"],
  ["loose", "Not in a shot"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const matches = (f: Filter, j: MakeJob) => (f === "stills" ? j.op === "image" && !j.sheet : f === "clips" ? j.op === "video" : f === "sheets" ? !!j.sheet : f === "loose" ? !j.shot && !j.sheet : true);

/** Everything made for this project, newest first, a row per request. A filter shows one kind, each request on its own row. */
function Board({ jobs, use, retry }: { jobs: MakeJob[]; use: (d: Partial<Draft>) => void; retry: (j: MakeJob) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const batches = useMemo(() => batchesOf(jobs), [jobs]);
  // Filtered, what was made from a take stands on its own row, so a clip isn't hidden under a still that's filtered out.
  const flat = useMemo(() => {
    const all: Batch[] = [];
    const walk = (b: Batch) => {
      all.push(b);
      b.children.forEach(walk);
    };
    batches.forEach(walk);
    return all.sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt));
  }, [batches]);
  if (!batches.length) {
    return (
      <div className="make-empty">
        <h2>Nothing made yet</h2>
        <p className="dim">Describe a picture below, or open a shot and make its first stills. Everything made for this project collects here, with what was made from what.</p>
      </div>
    );
  }
  const shown = filter === "all" ? batches : flat.filter((b) => matches(filter, b.first));
  return (
    <div className="make-page">
      <header className="page-head">
        <h2>Made</h2>
        <div className="filter-chips" role="tablist" aria-label="Show">
          {FILTERS.map(([id, name]) => {
            const n = id === "all" ? flat.length : flat.filter((b) => matches(id, b.first)).length;
            return (
              <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} disabled={!n && id !== "all"} onClick={() => setFilter(id)}>
                {name} <span className="n">{n}</span>
              </button>
            );
          })}
        </div>
      </header>
      <section className="make-board">
        {shown.map((b) => (
          <BatchRow key={b.id} batch={b} use={use} retry={retry} nest={filter === "all"} />
        ))}
        {!shown.length && <p className="dim small">None of those yet.</p>}
      </section>
    </div>
  );
}

function BatchRow({ batch, use, retry, nest }: { batch: Batch; use: (d: Partial<Draft>) => void; retry: (j: MakeJob) => void; nest: boolean }) {
  const p = useProject();
  const j = batch.first;
  const r = j.request;
  const usd = batch.jobs.filter(counts).reduce((s, x) => s + (x.usd ?? 0), 0);
  const kind = j.sheet ? `Sheet for @${j.sheet}` : j.op === "image" ? "Stills" : `${j.quality === "final" ? "Final" : "Rough"} clips`;
  const shot = j.shot && p.shots.some((s) => s.id === j.shot) ? j.shot : undefined;
  const member = j.sheet && p.cast?.some((m) => m.id === j.sheet!.split("/")[0]) ? j.sheet.split("/")[0] : undefined;
  const where = j.shot ? (shot ? "" : `for shot ${j.shot} (gone)`) : j.sheet ? "" : "for the Library";
  const shown = batch.jobs.filter((x) => x.status !== "canceled" || x.asset);
  return (
    <div className="batch">
      <div className="batch-head">
        <strong className="small">{member ? (j.portrait ? "Portrait of" : "Sheet for") : kind}</strong>
        {shot && (
          <button className="link small" onClick={() => actions.select({ kind: "shot", id: shot })} title="Open the shot">
            for shot {shot}
          </button>
        )}
        {member && (
          <button className="link small mono" onClick={() => actions.select({ kind: "cast", id: member })} title="Open them in Cast & sets">
            @{j.sheet}
          </button>
        )}
        <span className="dim small">{[modelLabel(j.model), where, usd ? `$${usd.toFixed(2)}` : "", timeAgo(j.createdAt)].filter(Boolean).join(" · ")}</span>
        <span className="spacer" />
        <button
          className="link small"
          onClick={() =>
            use({
              op: j.op,
              prompt: r.prompt,
              model: `${j.model}@${j.route}`,
              count: batch.jobs.length,
              shot: j.shot,
              start: r.start,
              ...(j.quality ? { quality: j.quality } : {}),
              ...(r.aspect ? { aspect: r.aspect } : {}),
              ...(r.seconds ? { seconds: r.seconds } : {}),
            })
          }
          title="Put this request in the composer, to make more like it or change it"
        >
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
      {nest && batch.children.length > 0 && (
        <div className="batch-children">
          {batch.children.map((c) => (
            <BatchRow key={c.id} batch={c} use={use} retry={retry} nest />
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
  const [continuing, setContinuing] = useState(false);
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
  // The next clip starts where this one ends: its last frame becomes a still, and the composer starts from it.
  const carryOn = async () => {
    setContinuing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/frame`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: a.id }) });
      const out = (await res.json()) as Asset & { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't take its last frame");
      await actions.reload();
      use({ op: "video", start: out.id, prompt: "", shot: undefined, model: "", count: 1, ...(job.quality ? { quality: job.quality } : {}) });
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
    } finally {
      setContinuing(false);
    }
  };
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
      {video && (
        <span className="badge">
          {final ? "Final" : <Icon name="play" size={10} />} {a.duration ? `${a.duration.toFixed(1)}s` : ""}
        </span>
      )}
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {!video && (
          <button onClick={() => use({ op: "video", start: a.id, prompt: job.request.prompt, shot: job.shot, model: "", count: 1 })} title="Make a clip that starts from this still">
            Animate
          </button>
        )}
        {video && (
          <button disabled={continuing} onClick={() => void carryOn()} title="Make a clip that starts where this one ends, from its last frame">
            {continuing ? "…" : "Continue"}
          </button>
        )}
        <UseInShot asset={a} />
      </div>
      {menu && <AssetMenu as={[a]} x={menu.x} y={menu.y} onClose={() => setMenu(undefined)} />}
    </div>
  );
}

/** Puts a take in one of the cut's placeholder or made shots, as the take it shows. */
function UseInShot({ asset }: { asset: Asset }) {
  const p = useProject();
  const shots = shotsToMake(p);
  if (!shots.length) return null;
  return (
    <select value="" onChange={(e) => e.target.value && actions.edit((d) => putInShot(d, e.target.value, asset))} aria-label="Use in a shot" title="Make it the take a shot shows">
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
