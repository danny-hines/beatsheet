/**
 * Make mode. Three pages (Shots, Cast & sets, Made), plus a full-width model-driven Creation Screen (`CreatePage`)
 * launched from "+ Create", any shot's "Make take…", an asset's "Vary / Animate / Continue", or the bottom Quick
 * Intent Bar backed by the fast agent model (`POST /api/projects/:id/make/prepare`). Made defaults to a de-bloated
 * Grouped view (one row per Shot / Cast member / Standalone lineage with collapsible intermediate drawers) so large
 * projects stay effortless to navigate.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MakeJob, MakePlan } from "@beatsheet/engine";
import { CATALOG, classifyGeneratedAssets, isAssetReferenced, removeGeneratedAsset, removeShotTake, type Asset } from "@beatsheet/schema";
import { ASSET_DRAG, hideBroken, posterUrl, proxyUrl, putInShot, timeAgo } from "../lib";
import { actions, agentFor, setState, useProject, useStore, type State } from "../store";
import { AssetView } from "./AssetView";
import { AssetMenu } from "./Cast";
import { CreatePage, type CreateLaunch } from "./CreatePage";
import { GuideCompare, guideOfAsset } from "./GuideCompare";
import { Icon } from "./Icon";
import { CastMemberPage, CastPage } from "./MakeCast";
import { useMakeSummary } from "./MakeSettings";
import { draftFromAssetOrJob, Given, isOpen, ShotPage, shotPrompt, ShotsPage, shotsToMake } from "./MakeShots";
import { NotesFor } from "./Side";
import { madeWith, money } from "./Takes";
import { FidelityPill } from "./ui";

/** Whether a job's cost counts: what was asked for, unless it failed or was stopped before the service made it. */
const counts = (j: MakeJob) => j.charged || (j.status !== "failed" && j.status !== "canceled");
const modelLabel = (id: string) => CATALOG.find((m) => m.id === id)?.label ?? id;
const ratio = (aspect?: string) => (aspect ?? "16:9").replace(":", " / ");
const PAGES: [State["makePage"], string][] = [
  ["shots", "Shots"],
  ["cast", "Cast & sets"],
  ["made", "Made"],
];

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
  const notice = useStore((s) => s.notice);
  const { jobs, setJobs, cancel, retry } = useJobs();
  const [creating, setCreating] = useState<CreateLaunch>();

  const started = (js: MakeJob[]) => setJobs((prev) => [...prev, ...js]);

  // A cut with nothing to make opens on what's been made, not on an empty page of shots.
  useEffect(() => {
    if (page === "shots" && !shotsToMake(p).length) setState({ makePage: "made" });
  }, [projectId, cutId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the creation screen if the user switches page or selects something else.
  const selKey = sel ? `${sel.kind}:${"id" in sel ? sel.id : ""}` : "";
  useEffect(() => {
    setCreating(undefined);
  }, [page, selKey]);

  // What's selected opens large: a shot to make, a cast member, or a file.
  const shot = sel?.kind === "shot" ? shotsToMake(p).find((s) => s.id === sel.id) : undefined;
  const member = sel?.kind === "cast" ? p.cast?.find((m) => m.id === sel.id) : undefined;
  const asset = sel?.kind === "asset" ? p.assets.find((a) => a.id === sel.id) : undefined;
  const back = () => actions.select(undefined);
  const backLabel = PAGES.find(([id]) => id === page)![1];
  const openCreate = (launch: CreateLaunch = {}) => setCreating({ backLabel: shot ? `Shot ${shot.id}` : asset ? (asset.label ?? asset.id) : backLabel, ...launch });

  // Quick Intent Bar shows on top-level Shots / Made pages and AssetPage, hidden inside Creation Screen, ShotPage, or Cast.
  const showIntentBar = !creating && !shot && !member && (page !== "cast" || !!asset);

  // Each page keeps its scroll position; overlays open at the top.
  const scroller = useRef<HTMLDivElement>(null);
  const places = useRef<Record<string, number>>({});
  const open = creating ? "create" : shot ? `shot:${shot.id}` : member ? `cast:${member.id}` : asset ? `asset:${asset.id}` : undefined;
  const where = open ?? page;
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = open ? 0 : (places.current[where] ?? 0);
  }, [where]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="make-view">
      <MakeNav
        jobs={jobs}
        creating={!!creating}
        onTab={() => setCreating(undefined)}
        onCreate={() => openCreate({ draft: shot ? { shot: shot.id } : undefined })}
      />
      {notice && (
        <div className="notice">
          {notice}
          <button className="link" onClick={actions.dismissNotice}>
            Dismiss
          </button>
        </div>
      )}
      <div className="make-scroll" ref={scroller} onScroll={(e) => void (places.current[where] = e.currentTarget.scrollTop)}>
        {creating ? (
          <CreatePage
            launch={creating}
            onStarted={(js, sId) => {
              started(js);
              setCreating(undefined);
              if (sId) actions.select({ kind: "shot", id: sId });
              else actions.setMakePage("made");
            }}
            onClose={() => setCreating(undefined)}
          />
        ) : shot ? (
          <ShotPage key={shot.id} shot={shot} jobs={jobs} back={back} backLabel={backLabel} onCreate={openCreate} onStarted={started} retry={(j) => void retry([j.id])} />
        ) : member ? (
          <CastMemberPage id={member.id} back={back} backLabel={backLabel} />
        ) : asset ? (
          <AssetPage a={asset} job={jobs.find((j) => j.asset === asset.id)} onCreate={openCreate} back={back} backLabel={backLabel} />
        ) : page === "shots" ? (
          <ShotsPage jobs={jobs} onStarted={started} />
        ) : page === "cast" ? (
          <CastPage />
        ) : (
          <Board jobs={jobs} onCreate={openCreate} retry={(j) => void retry([j.id])} />
        )}
      </div>
      {showIntentBar && <IntentBar onLaunch={(l) => openCreate(l)} />}
      <Queue jobs={jobs} cancel={(j) => void cancel([j.id])} />
    </main>
  );
}

/** Make's pages, "+ Create", and the panel on the right brought back when folded away. */
function MakeNav({ jobs, creating, onTab, onCreate }: { jobs: MakeJob[]; creating: boolean; onTab: () => void; onCreate: () => void }) {
  const p = useProject();
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const page = useStore((s) => s.makePage);
  const wide = useStore((s) => s.makeWide);
  const agent = useStore((s) => agentFor(s));
  const asks = agent.approvals.length;

  // Meaningful Made count: distinct shot/cast groups + non-intermediate standalone outputs (not raw 841 retries).
  const madeCount = useMemo(() => {
    if (!doc) return 0;
    const cls = classifyGeneratedAssets(doc, cutId);
    const groups = new Set<string>();
    let standalone = 0;
    for (const [id, info] of cls) {
      if (info.owner?.kind === "shot") groups.add(`shot:${info.owner.cut}:${info.owner.shot}`);
      else if (info.owner?.kind === "cast") groups.add(`cast:${info.owner.member}`);
      else if (!info.intermediate) standalone++;
      else if (!id) break;
    }
    return groups.size + standalone;
  }, [doc, cutId]);

  const n: Record<State["makePage"], number> = { shots: shotsToMake(p).length, cast: p.cast?.length ?? 0, made: madeCount };
  return (
    <nav className="make-nav">
      <div className="make-tabs" role="tablist" aria-label="Make">
        {PAGES.map(([id, name]) => (
          <button
            key={id}
            role="tab"
            aria-selected={!creating && page === id}
            className={!creating && page === id ? "on" : ""}
            onClick={() => {
              onTab();
              actions.setMakePage(id);
            }}
          >
            {name}
            {n[id] > 0 && <span className="n">{n[id]}</span>}
            {id === "made" && jobs.some(isOpen) && <span className="dots" title="Some are on the way" />}
          </button>
        ))}
      </div>
      <span className="spacer" />
      <button className={creating ? "primary on" : "primary"} onClick={onCreate} title="Open the full model-driven Creation Screen">
        <Icon name="add" size={12} /> Create
      </button>
      {wide && (
        <button onClick={() => actions.setMakeWide(false)} title="Bring back the agent and the notes">
          Agent {asks > 0 && <span className="count">{asks}</span>} <Icon name="back" size={12} />
        </button>
      )}
    </nav>
  );
}

// ---- Quick Intent Bar (replaces the cramped bottom Composer).

function IntentBar({ onLaunch }: { onLaunch: (launch: CreateLaunch) => void }) {
  const projectId = useStore((s) => s.projectId)!;
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const [text, setText] = useState("");
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  const plan = async () => {
    const intent = text.trim();
    if (!intent) return onLaunch({});
    setError("");
    setPlanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/make/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cut: cutId, intent }),
      });
      const out = (await res.json()) as MakePlan & { error?: string };
      if (!res.ok || !out.draft) throw new Error(out.error ?? `${res.status}`);
      setText("");
      onLaunch({ plan: out, draft: out.draft });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  };

  return (
    <section
      className={`intent-bar ${over ? "over" : ""}`}
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
        onLaunch({ draft: { op: "video", inputMode: "board", start: a.id, prompt: text.trim() } });
      }}
    >
      <div className="intent-bar-row">
        <input
          className="intent-input"
          value={text}
          disabled={planning}
          onChange={(e) => setText(e.target.value)}
          placeholder='Describe what you want to make… e.g. "6s slow orbit around @cast at dusk" (or drop a still)'
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void plan();
            }
          }}
        />
        <button className="primary" disabled={planning || !text.trim()} onClick={() => void plan()} title="Use your fast agent model to pick the best workflow, model & ingredients, then open the Creation Screen">
          {planning ? "Planning…" : "Plan with agent"}
        </button>
        <button
          disabled={planning}
          onClick={() => {
            const prompt = text.trim();
            setText("");
            onLaunch({ draft: prompt ? { prompt } : undefined });
          }}
          title="Open the Creation Screen directly without agent planning"
        >
          Open creator
        </button>
      </div>
      {error && <p className="warn small">{error}</p>}
    </section>
  );
}

// ---- A file, large.

/**
 * A take (or any file from the Library) opened in Make: when it has a driving guide (saved blockout snapshot,
 * 16-frame sheet, legacy blockout, motion-copy clip, or restored source), renders the unified `<GuideCompare>` right
 * at the top so side-by-side / wipe compare is always 1 click away.
 */
function AssetPage({ a, job, onCreate, back, backLabel }: { a: Asset; job?: MakeJob; onCreate: (l: CreateLaunch) => void; back: () => void; backLabel: string }) {
  const projectId = useStore((s) => s.projectId)!;
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const p = useProject();
  const [continuing, setContinuing] = useState(false);
  const made = a.provenance?.source === "generated";
  const prompt = job?.request.prompt ?? a.provenance?.prompt ?? "";
  const video = a.kind === "video";
  const guide = guideOfAsset(projectId, doc, cutId, a);
  const format = p.formats[0]!;
  const aspect = a.width && a.height ? `${a.width} / ${a.height}` : `${format.width} / ${format.height}`;
  const forShot = job?.shot && p.shots.some((s) => s.id === job.shot) ? job.shot : undefined;
  const from = job?.request.start ? p.assets.find((x) => x.id === job.request.start) : undefined;

  // The next clip starts where this one ends: extract last frame and open Creation Screen pre-loaded.
  const carryOn = async () => {
    setContinuing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/frame`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: a.id }) });
      const out = (await res.json()) as Asset & { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't take its last frame");
      await actions.reload();
      onCreate({ draft: { op: "video", inputMode: "board", start: out.id, prompt: "", count: 1, ...(job?.quality ? { quality: job.quality } : {}) } });
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
    } finally {
      setContinuing(false);
    }
  };

  return (
    <div className={`make-page asset-page ${guide ? "has-guide" : ""}`}>
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
        {made && (
          <button onClick={() => onCreate(draftFromAssetOrJob(a, job, forShot))} title="Open these settings in the Creation Screen to vary or iterate">
            Vary…
          </button>
        )}
        {a.kind === "image" && (
          <button
            onClick={() => onCreate({ draft: { op: "video", inputMode: "board", start: a.id, prompt: made ? prompt : "", shot: forShot, count: 1 } })}
            title="Make a clip that starts from this picture"
          >
            Animate…
          </button>
        )}
        {video && (
          <button disabled={continuing} onClick={() => void carryOn()} title="Make a clip that starts where this one ends, from its last frame">
            {continuing ? "…" : "Continue…"}
          </button>
        )}
        {(a.kind === "image" || video) && <UseInShot asset={a} />}
      </header>
      {guide && <GuideCompare asset={a} guide={guide} aspect={aspect} />}
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

// ---- The Made Board: Grouped (default, de-bloated) and Recent Batches.

type Batch = { id: string; jobs: MakeJob[]; first: MakeJob; children: Batch[] };

/** Requests as rows, newest first; clips made from a still (via start OR first ref, e.g. blockouts) nest under it. */
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
    const parentId = b.first.request.start ?? (b.first.op === "video" ? b.first.request.refs?.[0] : undefined);
    const parent = parentId ? madeBy.get(parentId) : undefined;
    (parent && parent !== b ? parent.children : top).push(b);
  }
  const newest = (a: Batch, b: Batch) => b.first.createdAt.localeCompare(a.first.createdAt);
  for (const b of byId.values()) b.children.sort(newest);
  return top.sort(newest);
}

const GROUP_FILTERS = [
  ["all", "All"],
  ["clips", "Clips"],
  ["shots", "Shots"],
  ["cast", "Cast"],
  ["standalone", "Standalone"],
] as const;
type GroupFilter = (typeof GROUP_FILTERS)[number][0];

const BATCH_FILTERS = [
  ["all", "All"],
  ["stills", "Stills"],
  ["clips", "Clips"],
  ["sheets", "Cast pictures"],
  ["loose", "Not in a shot"],
] as const;
type BatchFilter = (typeof BATCH_FILTERS)[number][0];
const matchesBatch = (f: BatchFilter, j: MakeJob) => (f === "stills" ? j.op === "image" && !j.sheet : f === "clips" ? j.op === "video" : f === "sheets" ? !!j.sheet : f === "loose" ? !j.shot && !j.sheet : true);

type MadeGroup = {
  key: string;
  kind: "shot" | "cast" | "standalone";
  title: string;
  subtitle?: string;
  shotId?: string;
  ownerShotId?: string;
  cutId?: string;
  castId?: string;
  fidelity?: State["project"] extends never ? never : string;
  hero?: Asset;
  others: Asset[];
  going: MakeJob[];
  searchText: string;
  updatedAt: string;
};

function Board({ jobs, onCreate, retry }: { jobs: MakeJob[]; onCreate: (l: CreateLaunch) => void; retry: (j: MakeJob) => void }) {
  const p = useProject();
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const [view, setView] = useState<"grouped" | "batches">("grouped");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [batchFilter, setBatchFilter] = useState<BatchFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const jobByAsset = useMemo(() => {
    const m = new Map<string, MakeJob>();
    for (const j of jobs) if (j.asset) m.set(j.asset, j);
    return m;
  }, [jobs]);

  const batches = useMemo(() => batchesOf(jobs), [jobs]);
  const flatBatches = useMemo(() => {
    const all: Batch[] = [];
    const walk = (b: Batch) => {
      all.push(b);
      b.children.forEach(walk);
    };
    batches.forEach(walk);
    return all.sort((a, b) => b.first.createdAt.localeCompare(a.first.createdAt));
  }, [batches]);

  // Build grouped view from project assets + classification + open jobs (works even for assets whose jobs log was cleared).
  const groups = useMemo<MadeGroup[]>(() => {
    if (!doc) return [];
    const cls = classifyGeneratedAssets(doc, cutId);
    const assetById = new Map(doc.assets.map((a) => [a.id, a]));
    const shotMap = new Map<string, { cut: string; shot: string; assets: Asset[]; going: MakeJob[] }>();
    const castMap = new Map<string, { member: string; assets: Asset[]; going: MakeJob[] }>();
    const standaloneAssets: Asset[] = [];
    const standaloneGoing: MakeJob[] = [];

    for (const a of doc.assets) {
      if (a.provenance?.source !== "generated") continue;
      const info = cls.get(a.id);
      if (info?.owner?.kind === "shot") {
        const k = `${info.owner.cut}:${info.owner.shot}`;
        const g = shotMap.get(k) ?? { cut: info.owner.cut, shot: info.owner.shot, assets: [], going: [] };
        g.assets.push(a);
        shotMap.set(k, g);
      } else if (info?.owner?.kind === "cast") {
        const k = info.owner.member;
        const g = castMap.get(k) ?? { member: k, assets: [], going: [] };
        g.assets.push(a);
        castMap.set(k, g);
      } else {
        standaloneAssets.push(a);
      }
    }

    for (const j of jobs) {
      if (!isOpen(j)) continue;
      if (j.shot) {
        const c = j.cut ?? cutId ?? doc.cuts[0]?.id ?? "";
        const k = `${c}:${j.shot}`;
        const g = shotMap.get(k) ?? { cut: c, shot: j.shot, assets: [], going: [] };
        g.going.push(j);
        shotMap.set(k, g);
      } else if (j.sheet) {
        const member = j.sheet.split("/")[0]!;
        const g = castMap.get(member) ?? { member, assets: [], going: [] };
        g.going.push(j);
        castMap.set(member, g);
      } else {
        standaloneGoing.push(j);
      }
    }

    const newestAsset = (a: Asset, b: Asset) => (b.provenance?.createdAt ?? "").localeCompare(a.provenance?.createdAt ?? "");
    const out: MadeGroup[] = [];

    // 1. Shot groups
    for (const [k, g] of shotMap) {
      const cut = doc.cuts.find((c) => c.id === g.cut);
      const shot = cut?.shots.find((s) => s.id === g.shot);
      const sorted = [...g.assets].sort(newestAsset);
      const chosenId = shot?.content.kind === "generated" ? shot.content.take : shot?.content.kind === "clip" ? shot.content.asset : undefined;
      const hero =
        (chosenId ? sorted.find((a) => a.id === chosenId) : undefined) ??
        sorted.find((a) => a.kind === "video") ??
        sorted[0];
      const others = sorted.filter((a) => a.id !== hero?.id);
      const updatedAt = [hero?.provenance?.createdAt, sorted[0]?.provenance?.createdAt, g.going[0]?.createdAt].filter(Boolean).sort().at(-1) ?? "";
      out.push({
        key: `shot:${k}`,
        kind: "shot",
        title: shot?.label ?? `Shot ${g.shot}`,
        subtitle: g.cut !== cutId && cut ? `${g.shot} · ${cut.name}` : g.shot,
        shotId: g.cut === cutId ? g.shot : undefined,
        ownerShotId: g.shot,
        cutId: g.cut,
        fidelity: shot?.fidelity,
        hero,
        others,
        going: g.going,
        searchText: [g.shot, shot?.label, shot?.intent, ...sorted.map((a) => `${a.label ?? ""} ${a.provenance?.prompt ?? ""}`)].filter(Boolean).join(" ").toLowerCase(),
        updatedAt,
      });
    }

    // 2. Cast groups
    for (const [memberId, g] of castMap) {
      const member = doc.cast?.find((m) => m.id === memberId);
      const sorted = [...g.assets].sort(newestAsset);
      const chosenId = member?.sheet ?? member?.faceSheet ?? member?.outfitSheet ?? member?.portrait ?? member?.images?.[0];
      const hero = (chosenId ? sorted.find((a) => a.id === chosenId) : undefined) ?? sorted[0];
      const others = sorted.filter((a) => a.id !== hero?.id);
      const updatedAt = [hero?.provenance?.createdAt, sorted[0]?.provenance?.createdAt, g.going[0]?.createdAt].filter(Boolean).sort().at(-1) ?? "";
      out.push({
        key: `cast:${memberId}`,
        kind: "cast",
        title: member?.name ?? `@${memberId}`,
        subtitle: `@${memberId}`,
        castId: member?.id,
        hero,
        others,
        going: g.going,
        searchText: [memberId, member?.name, member?.about, ...sorted.map((a) => `${a.label ?? ""} ${a.provenance?.prompt ?? ""}`)].filter(Boolean).join(" ").toLowerCase(),
        updatedAt,
      });
    }

    // 3. Standalone groups: nest source stills under standalone videos made from them.
    const standaloneSet = new Set(standaloneAssets.map((a) => a.id));
    const tucked = new Set<string>();
    const standaloneSorted = [...standaloneAssets].sort(newestAsset);
    const videosFirst = [...standaloneSorted.filter((a) => a.kind === "video"), ...standaloneSorted.filter((a) => a.kind !== "video")];

    for (const a of videosFirst) {
      if (tucked.has(a.id)) continue;
      const children: Asset[] = [];
      if (a.kind === "video") {
        const params = (a.provenance?.params ?? {}) as { start?: string; end?: string };
        const parentIds = [params.start, params.end, ...(a.provenance?.refs ?? [])].filter((id): id is string => !!id && standaloneSet.has(id) && id !== a.id);
        for (const pid of parentIds) {
          if (!tucked.has(pid)) {
            tucked.add(pid);
            const pa = assetById.get(pid);
            if (pa) children.push(pa);
          }
        }
      }
      out.push({
        key: `standalone:${a.id}`,
        kind: "standalone",
        title: a.label ?? (a.provenance?.prompt?.slice(0, 64) || a.id),
        subtitle: a.kind === "video" ? "Standalone clip" : "Standalone still",
        hero: a,
        others: children,
        going: [],
        searchText: [a.id, a.label, a.provenance?.prompt, ...children.map((c) => c.label ?? c.id)].filter(Boolean).join(" ").toLowerCase(),
        updatedAt: a.provenance?.createdAt ?? "",
      });
    }
    if (standaloneGoing.length) {
      out.unshift({
        key: "standalone:going",
        kind: "standalone",
        title: "Making now",
        subtitle: "Standalone",
        others: [],
        going: standaloneGoing,
        searchText: standaloneGoing.map((j) => j.request.prompt).join(" ").toLowerCase(),
        updatedAt: standaloneGoing[0]!.createdAt,
      });
    }

    return out.sort((a, b) => {
      // In-progress groups float to the top, then shots in this cut / most recently updated.
      if (a.going.length !== b.going.length) return b.going.length - a.going.length;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [doc, cutId, jobs]);

  const q = query.trim().toLowerCase();
  const hasAnything = groups.length > 0 || batches.length > 0;
  if (!hasAnything) {
    return (
      <div className="make-empty">
        <h2>Nothing made yet</h2>
        <p className="dim">Describe what you want to make below, open the Creator, or open a shot and make its first stills. Everything made collects here, grouped cleanly by shot and cast.</p>
      </div>
    );
  }

  const matchesGroup = (g: MadeGroup, f: GroupFilter) =>
    f === "all"
      ? true
      : f === "shots"
        ? g.kind === "shot"
        : f === "cast"
          ? g.kind === "cast"
          : f === "standalone"
            ? g.kind === "standalone"
            : g.hero?.kind === "video" || g.others.some((a) => a.kind === "video");

  const filteredGroups = groups.filter((g) => matchesGroup(g, groupFilter) && (!q || g.searchText.includes(q)));
  const filteredBatches = (batchFilter === "all" && !q ? batches : flatBatches.filter((b) => matchesBatch(batchFilter, b.first))).filter(
    (b) => !q || `${b.first.shot ?? ""} ${b.first.sheet ?? ""} ${b.first.request.prompt}`.toLowerCase().includes(q),
  );

  const removerFor = (a: Asset, group?: MadeGroup): (() => void) | undefined => {
    if (!doc) return undefined;
    if (group?.kind === "shot" && group.cutId && group.ownerShotId) {
      const s = doc.cuts.find((c) => c.id === group.cutId)?.shots.find((x) => x.id === group.ownerShotId);
      if (s?.content.kind === "generated" && (s.content.take === a.id || s.content.takes?.includes(a.id))) {
        return () => actions.editFile((d) => void removeShotTake(d, group.cutId!, group.ownerShotId!, a.id));
      }
    }
    if (group?.kind === "cast") return undefined;
    if (a.provenance?.source === "generated" && !isAssetReferenced(doc, a.id)) {
      return () => actions.editFile((d) => void removeGeneratedAsset(d, a.id));
    }
    return undefined;
  };

  return (
    <div className="make-page">
      <header className="page-head">
        <h2>Made</h2>
        <div className="segmented" role="group" aria-label="View mode">
          <button className={view === "grouped" ? "on" : ""} onClick={() => setView("grouped")} title="Group outputs by shot, cast member, and lineage with intermediate stills tucked away">
            Grouped
          </button>
          <button className={view === "batches" ? "on" : ""} onClick={() => setView("batches")} title="Every request in chronological order">
            Recent batches
          </button>
        </div>
        <input
          className="made-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by shot, @cast, or prompt…"
          aria-label="Filter made items"
        />
        <div className="filter-chips" role="tablist" aria-label="Show">
          {view === "grouped"
            ? GROUP_FILTERS.map(([id, name]) => {
                const n = groups.filter((g) => matchesGroup(g, id)).length;
                return (
                  <button key={id} role="tab" aria-selected={groupFilter === id} className={groupFilter === id ? "on" : ""} disabled={!n && id !== "all"} onClick={() => setGroupFilter(id)}>
                    {name} <span className="n">{n}</span>
                  </button>
                );
              })
            : BATCH_FILTERS.map(([id, name]) => {
                const n = id === "all" ? flatBatches.length : flatBatches.filter((b) => matchesBatch(id, b.first)).length;
                return (
                  <button key={id} role="tab" aria-selected={batchFilter === id} className={batchFilter === id ? "on" : ""} disabled={!n && id !== "all"} onClick={() => setBatchFilter(id)}>
                    {name} <span className="n">{n}</span>
                  </button>
                );
              })}
        </div>
      </header>

      {view === "grouped" ? (
        <section className="made-groups">
          {filteredGroups.map((g) => {
            const openDrawer = !!expanded[g.key];
            const otherClips = g.others.filter((a) => a.kind === "video").length;
            const otherStills = g.others.length - otherClips;
            const drawerSummary =
              g.kind === "cast"
                ? `${g.others.length} earlier attempt${g.others.length === 1 ? "" : "s"}`
                : [otherClips && `${otherClips} alt clip${otherClips === 1 ? "" : "s"}`, otherStills && `${otherStills} still${otherStills === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
            return (
              <div key={g.key} className="made-group">
                <div className="made-group-head">
                  {g.shotId ? (
                    <button className="link made-group-title" onClick={() => actions.select({ kind: "shot", id: g.shotId! })}>
                      {g.title}
                    </button>
                  ) : g.castId ? (
                    <button className="link made-group-title" onClick={() => actions.select({ kind: "cast", id: g.castId! })}>
                      {g.title}
                    </button>
                  ) : (
                    <strong className="made-group-title">{g.title}</strong>
                  )}
                  {g.subtitle && <span className="mono dim small">{g.subtitle}</span>}
                  {g.fidelity && <FidelityPill fidelity={g.fidelity as Shot["fidelity"]} />}
                  {g.updatedAt && <span className="dim small">· {timeAgo(g.updatedAt)}</span>}
                  <span className="spacer" />
                  {g.shotId && (
                    <button
                      className="link small"
                      onClick={() => {
                        const s = p.shots.find((x) => x.id === g.shotId);
                        onCreate({ draft: { shot: g.shotId, prompt: s ? shotPrompt(s) : "" } });
                      }}
                    >
                      Make more…
                    </button>
                  )}
                  {g.others.length > 0 && (
                    <button
                      className="link small"
                      onClick={() => setExpanded((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                      aria-expanded={openDrawer}
                    >
                      {openDrawer ? "Hide" : `+ ${drawerSummary}`} <Icon name={openDrawer ? "down" : "right"} size={10} />
                    </button>
                  )}
                </div>
                <div className="batch-cards">
                  {g.hero && <AssetCard a={g.hero} job={jobByAsset.get(g.hero.id)} onCreate={onCreate} onRemove={removerFor(g.hero, g)} />}
                  {g.going.map((j) => (
                    <div key={j.id} className="make-card pending" style={{ aspectRatio: ratio(j.request.aspect) }}>
                      {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
                    </div>
                  ))}
                </div>
                {openDrawer && g.others.length > 0 && (
                  <div className="made-group-drawer">
                    <div className="batch-cards">
                      {g.others.map((a) => (
                        <AssetCard key={a.id} a={a} job={jobByAsset.get(a.id)} onCreate={onCreate} onRemove={removerFor(a, g)} compact />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!filteredGroups.length && <p className="dim small">Nothing matches this filter.</p>}
        </section>
      ) : (
        <section className="make-board">
          {filteredBatches.map((b) => (
            <BatchRow key={b.id} batch={b} onCreate={onCreate} retry={retry} nest={batchFilter === "all" && !q} />
          ))}
          {!filteredBatches.length && <p className="dim small">None of those yet.</p>}
        </section>
      )}
    </div>
  );
}

type Shot = ReturnType<typeof useProject>["shots"][number];

function BatchRow({ batch, onCreate, retry, nest }: { batch: Batch; onCreate: (l: CreateLaunch) => void; retry: (j: MakeJob) => void; nest: boolean }) {
  const p = useProject();
  const j = batch.first;
  const r = j.request;
  const usd = batch.jobs.filter(counts).reduce((s, x) => s + (x.usd ?? 0), 0);
  const sheetWord =
    j.sheetKind === "face-sheet"
      ? "360° face sheet for"
      : j.sheetKind === "outfit-sheet"
        ? "Outfit sheet for"
        : j.sheetKind === "portrait" || j.portrait
          ? "Portrait of"
          : "Sheet for";
  const kind = j.sheet ? `${sheetWord} @${j.sheet}` : j.op === "image" ? "Stills" : `${j.quality === "final" ? "Final" : "Rough"} clips`;
  const shot = j.shot && p.shots.some((s) => s.id === j.shot) ? j.shot : undefined;
  const member = j.sheet && p.cast?.some((m) => m.id === j.sheet!.split("/")[0]) ? j.sheet.split("/")[0] : undefined;
  const where = j.shot ? (shot ? "" : `for shot ${j.shot} (gone)`) : j.sheet ? "" : "for the Library";
  const shown = batch.jobs.filter((x) => x.status !== "canceled" || x.asset);
  return (
    <div className="batch">
      <div className="batch-head">
        <strong className="small">{member ? sheetWord : kind}</strong>
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
        <button className="link small" onClick={() => onCreate(draftFromAssetOrJob(undefined, j, j.shot))} title="Open this request in the Creation Screen">
          Vary…
        </button>
      </div>
      <p className="batch-prompt small" title={r.sent ?? r.prompt}>
        {r.prompt}
      </p>
      <div className="batch-cards">
        {shown.map((x) => (
          <JobCard key={x.id} job={x} onCreate={onCreate} retry={retry} />
        ))}
      </div>
      {nest && batch.children.length > 0 && (
        <div className="batch-children">
          {batch.children.map((c) => (
            <BatchRow key={c.id} batch={c} onCreate={onCreate} retry={retry} nest />
          ))}
        </div>
      )}
    </div>
  );
}

/** A generated asset card (used in both Grouped board and completed JobCard). Shows guide badges when blockout/motion guided. */
function AssetCard({ a, job, onCreate, onRemove, compact }: { a: Asset; job?: MakeJob; onCreate: (l: CreateLaunch) => void; onRemove?: () => void; compact?: boolean }) {
  const projectId = useStore((s) => s.projectId)!;
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const selected = useStore((s) => (s.selection?.kind === "asset" ? s.selection.id : undefined));
  const [hover, setHover] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const [continuing, setContinuing] = useState(false);
  const video = a.kind === "video";
  const final = a.provenance?.params?.quality === "final";
  const guide = guideOfAsset(projectId, doc, cutId, a);
  const style = { aspectRatio: ratio(a.width && a.height ? `${a.width}:${a.height}` : job?.request.aspect) };

  const carryOn = async () => {
    setContinuing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/frame`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: a.id }) });
      const out = (await res.json()) as Asset & { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Couldn't take its last frame");
      await actions.reload();
      onCreate({ draft: { op: "video", inputMode: "board", start: out.id, prompt: "", count: 1, ...(job?.quality ? { quality: job.quality } : {}) } });
    } catch (err) {
      setState({ notice: err instanceof Error ? err.message : String(err) });
    } finally {
      setContinuing(false);
    }
  };

  return (
    <div
      className={`make-card ${compact ? "compact" : ""} ${selected === a.id ? "sel" : ""}`}
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
      {video && hover ? <video src={proxyUrl(projectId, a.id)} autoPlay muted loop playsInline /> : <img src={posterUrl(projectId, a.id)} loading="lazy" alt="" onError={hideBroken} />}
      {video && (
        <span className="badge">
          {final ? "Final" : <Icon name="play" size={10} />} {a.duration ? `${a.duration.toFixed(1)}s` : ""}
        </span>
      )}
      {guide && (
        <span className="badge right" title={`${guide.label} · click card to compare side by side`}>
          <Icon name="camera" size={9} /> {guide.kind === "clip" ? (guide.role === "drive" ? "Motion" : guide.role === "version" ? "Version" : "Camera") : "Blockout"}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="make-card-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={video ? "Remove this clip (Undo brings it back)" : "Remove this still (Undo brings it back)"}
          aria-label={video ? "Remove clip" : "Remove still"}
        >
          <Icon name="close" size={12} />
        </button>
      )}
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {!video && (
          <button
            onClick={() =>
              onCreate({ draft: { op: "video", inputMode: "board", start: a.id, prompt: job?.request.prompt ?? a.provenance?.prompt ?? "", shot: job?.shot, count: 1 } })
            }
            title="Make a clip that starts from this still"
          >
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

/** A take on the Recent Batches board: delegates completed takes to AssetCard, handles pending/failed states. */
function JobCard({ job, onCreate, retry }: { job: MakeJob; onCreate: (l: CreateLaunch) => void; retry: (j: MakeJob) => void }) {
  const p = useProject();
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const a = job.asset ? p.assets.find((x) => x.id === job.asset) : undefined;
  if (a) {
    const targetCut = job.cut ?? cutId;
    let onRemove: (() => void) | undefined;
    if (doc) {
      const s = job.shot && targetCut ? doc.cuts.find((c) => c.id === targetCut)?.shots.find((x) => x.id === job.shot) : undefined;
      if (s?.content.kind === "generated" && (s.content.take === a.id || s.content.takes?.includes(a.id))) {
        onRemove = () => actions.editFile((d) => void removeShotTake(d, targetCut!, job.shot!, a.id));
      } else if (!job.sheet && a.provenance?.source === "generated" && !isAssetReferenced(doc, a.id)) {
        onRemove = () => actions.editFile((d) => void removeGeneratedAsset(d, a.id));
      }
    }
    return <AssetCard a={a} job={job} onCreate={onCreate} onRemove={onRemove} />;
  }
  const style = { aspectRatio: ratio(job.request.aspect) };
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
