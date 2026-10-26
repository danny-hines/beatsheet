import { formatTime, type Asset, type Project } from "@beatsheet/schema";
import { useEffect, useMemo, useState } from "react";
import { desktop, hideBroken, pickFootage, posterUrl, stripUrl } from "../lib";
import type { RecordKind } from "../record";
import { actions, getState, useProject, useStore } from "../store";
import { RecorderDialog, RecordMenu } from "./Recorder";
import { answer } from "./Turn";

type Filter = "all" | "keepers" | "unrated" | "used" | "rejected";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["keepers", "Keepers"],
  ["used", "In this cut"],
  ["unrated", "Not logged"],
  ["rejected", "Rejected"],
];

/** Which assets the cut on screen uses. */
function usedIn(p: Project): Set<string> {
  const used = new Set<string>();
  for (const s of p.shots) {
    if (s.content.kind === "clip") used.add(s.content.asset);
    if (s.content.kind === "generated" && s.content.take) used.add(s.content.take);
  }
  for (const c of p.music?.cues ?? []) used.add(c.asset);
  return used;
}

/** The project's footage and music: what the agent made of each file, and whether this cut uses it. */
export function Library() {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const selection = useStore((s) => s.selection);
  const [filter, setFilter] = useState<Filter>("all");
  const used = useMemo(() => usedIn(p), [p]);
  const [hover, setHover] = useState<{ a: Asset; top: number; fx: number } | null>(null);
  const [recording, setRecording] = useState<RecordKind | null>(null);
  // The app menu's Record Screen/Camera/Voice come here.
  useEffect(() => {
    const onRecord = (e: Event) => setRecording((e as CustomEvent<RecordKind>).detail);
    window.addEventListener("beatsheet:record", onRecord);
    return () => window.removeEventListener("beatsheet:record", onRecord);
  }, []);

  const footage = p.assets.filter((a) => a.kind !== "music" && a.kind !== "voice");
  const logged = footage.filter((a) => a.rating || a.moments?.length || (a.label && !/^(Photo|Video \d+s|Screen recording|Camera|Voice recording) ·/.test(a.label))).length;
  const keep = (a: Asset) =>
    filter === "keepers" ? (a.rating ?? 0) >= 3 : filter === "unrated" ? !a.rating : filter === "used" ? used.has(a.id) : filter === "rejected" ? a.rating === -1 : true;
  const music = p.assets.filter((a) => a.kind === "music");
  // Footage grouped by the folder it came from (when there's more than one), what was recorded here, then what was
  // made here: cut-outs, and files the agent derived or generated.
  const recorded = (a: Asset) => a.provenance?.source === "recorded";
  const madeHere = (a: Asset) => !!a.cutout || (!!a.provenance && !["import", "capture", "recorded"].includes(a.provenance.source));
  const imported = footage.filter((a) => !madeHere(a) && !recorded(a));
  const groups = [
    ...(p.sources.length > 1
      ? p.sources.map((s) => ({ key: s.id, label: s.label ?? s.path.split("/").filter(Boolean).pop() ?? s.path, items: imported.filter((a) => (a.source ?? p.sources[0]!.id) === s.id && keep(a)) }))
      : [{ key: "all", label: "", items: imported.filter(keep) }]),
    { key: "recordings", label: "Recordings", items: footage.filter((a) => recorded(a) && keep(a)) },
    { key: "cutouts", label: "Cut-outs", items: footage.filter((a) => a.cutout && keep(a)) },
    { key: "made", label: "Made here", items: footage.filter((a) => madeHere(a) && !a.cutout && keep(a)) },
  ].filter((g) => (g.key === "all" && imported.length) || g.items.length);

  return (
    <aside
      className="library"
      onDragOver={(e) => desktop && e.preventDefault()}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files];
        if (!files.length || !desktop) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("beatsheet:add-footage", { detail: files.map((f) => desktop!.pathFor(f)).filter(Boolean) }));
      }}
    >
      <div className="library-head">
        <strong>Media</strong>
        <span className="dim small">
          {footage.length} files{footage.length ? ` · ${logged === footage.length ? "all logged" : `${logged} logged`}` : ""}
        </span>
      </div>
      <div className="library-filters">
        {FILTERS.map(([f, label]) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      <div className="library-list">
        {groups.map((g) => (
          <div key={g.key}>
            {g.label && <div className="library-group dim small">{g.label}</div>}
            {g.items.map((a) => (
              <AssetRow key={a.id} a={a} projectId={projectId} used={used.has(a.id)} selected={selection?.kind === "asset" && selection.id === a.id} onHover={setHover} />
            ))}
          </div>
        ))}
        {footage.length > 0 && groups.every((g) => !g.items.length) && <p className="dim small library-empty">Nothing here.</p>}
        {!footage.length && <AddFootage big onRecord={setRecording} />}
        {music.length > 0 && filter !== "unrated" && filter !== "rejected" && (
          <div>
            <div className="library-group dim small">Music</div>
            {music.filter((a) => filter !== "used" || used.has(a.id)).map((a) => (
              <AssetRow key={a.id} a={a} projectId={projectId} used={used.has(a.id)} selected={selection?.kind === "asset" && selection.id === a.id} />
            ))}
          </div>
        )}
      </div>
      {footage.length > 0 && <AddFootage onRecord={setRecording} />}
      {hover && <HoverCard {...hover} projectId={projectId} />}
      {recording && <RecorderDialog kind={recording} onClose={() => setRecording(null)} />}
    </aside>
  );
}

/**
 * A bigger look at the clip under the pointer: the filmstrip frame for where the pointer is across the row (8 frames
 * from the agent's filmstrip), the moments it logged, and what it made of the clip.
 */
function HoverCard({ a, top, fx, projectId }: Hover & { projectId: string }) {
  const W = 240;
  const aspect = a.width && a.height ? a.width / a.height : 16 / 9;
  const H = Math.round(Math.min(300, W / aspect));
  const video = a.kind === "video";
  const frame = Math.floor(fx * 8);
  // Each strip frame is drawn to cover the card, like a poster would.
  const fw = Math.max(W, H * aspect);
  const fh = fw / aspect;
  const style = video
    ? { backgroundImage: `url(${stripUrl(projectId, a.id)})`, backgroundSize: `${fw * 8}px ${fh}px`, backgroundPosition: `${-frame * fw + (W - fw) / 2}px ${(H - fh) / 2}px` }
    : { backgroundImage: `url(${posterUrl(projectId, a.id)})`, backgroundSize: "cover", backgroundPosition: "center" };
  return (
    <div className="hover-card" style={{ top: Math.max(56, Math.min(top - 40, window.innerHeight - H - 140)) }}>
      <div className="hover-frame" style={{ width: W, height: H, ...style }}>
        {video && a.duration && <span className="hover-time">{formatTime((frame + 0.5) * (a.duration / 8)).replace(/^0:/, "")}</span>}
      </div>
      {video && a.duration && (
        <div className="hover-bar">
          <span className="hover-head" style={{ left: `${fx * 100}%` }} />
          {a.moments?.map((m) => (
            <span key={m.id} className="hover-moment" style={{ left: `${(m.t / a.duration!) * 100}%` }} title={m.label} />
          ))}
        </div>
      )}
      <div className="hover-body">
        <strong>{a.label ?? a.id}</strong>
        <span className="dim small">
          {[a.kind, a.duration ? `${a.duration.toFixed(1)}s` : "", a.width && a.height ? `${a.width}×${a.height}` : "", a.capturedAt?.slice(11, 16)].filter(Boolean).join(" · ")}
        </span>
        {a.moments?.length ? <span className="small">{a.moments.map((m) => m.label).join(" · ")}</span> : null}
      </div>
    </div>
  );
}

type Job = { id: string; status: "running" | "done" | "error"; progress: number; log: string[]; error?: string; output?: string };

/** More footage into this project (files, folders, or both); when it's in, the agent is told so it can log the new files. */
function AddFootage({ big, onRecord }: { big?: boolean; onRecord: (kind: RecordKind) => void }) {
  const [job, setJob] = useState<Job | null>(null);
  // The app menu's Add Footage, and folders dropped on the media panel, come here too.
  useEffect(() => {
    const onAdd = (e: Event) => {
      const d = (e as CustomEvent<string | string[] | undefined>).detail;
      void add(typeof d === "string" ? [d] : d);
    };
    window.addEventListener("beatsheet:add-footage", onAdd);
    return () => window.removeEventListener("beatsheet:add-footage", onAdd);
  });
  const add = async (given?: string[]) => {
    if (job?.status === "running") return;
    const paths = given?.length ? given : await pickFootage();
    const projectId = getState().projectId;
    if (!paths?.length || !projectId) return;
    const res = await fetch(`/api/projects/${projectId}/footage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths }) });
    let j = (await res.json()) as Job & { error?: string };
    if (!res.ok) return setJob({ id: "", status: "error", progress: 0, log: [], error: j.error });
    setJob(j);
    while (j.status === "running") {
      await new Promise((r) => setTimeout(r, 600));
      j = (await (await fetch(`/api/jobs/${j.id}`)).json()) as Job;
      setJob(j);
    }
    if (j.status !== "done") return;
    setJob(null);
    const from = paths.length === 1 ? paths[0] : `${paths.length} places (${paths.map((p) => p.split("/").pop()).join(", ")})`;
    await answer({ provided: `I added ${j.output} new file${j.output === "1" ? "" : "s"} from ${from}. Log them, then fold the good ones into the cuts where they help.` });
  };
  if (job?.status === "running") {
    return (
      <div className="library-foot">
        <div className="progress">
          <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
          <span>{Math.round(job.progress * 100)}%</span>
        </div>
        <span className="dim small">{job.log.at(-1) ?? "Reading…"}</span>
      </div>
    );
  }
  return (
    <div className={`library-foot ${big ? "big" : ""}`}>
      {big && <p className="dim small">No footage yet. Add clips and photos (or a whole folder), or record something; the agent will go through it.</p>}
      {job?.status === "error" && <p className="warn small">{job.error}</p>}
      <div className="library-actions">
        <button className={big ? "primary" : ""} onClick={() => void add()}>
          + Add footage
        </button>
        <RecordMenu onPick={onRecord} big={big} />
      </div>
      {desktop && big && <p className="dim small">or drop files or a folder here</p>}
    </div>
  );
}

type Hover = { a: Asset; top: number; fx: number };

function AssetRow({ a, projectId, used, selected, onHover }: { a: Asset; projectId: string; used: boolean; selected: boolean; onHover?: (h: Hover | null) => void }) {
  const generic = !a.label || /^(Photo|Video \d+s|Screen recording|Camera|Voice recording) ·/.test(a.label);
  // Moving across the row scrubs the clip in the preview card beside the panel.
  const track = (e: React.MouseEvent) => {
    if (!onHover || a.kind === "music" || a.kind === "audio" || a.kind === "voice") return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onHover({ a, top: r.top, fx: Math.max(0, Math.min(0.999, (e.clientX - r.left) / r.width)) });
  };
  return (
    <button
      className={`asset-row ${selected ? "sel" : ""} ${a.rating === -1 ? "rejected" : ""}`}
      onClick={() => actions.select({ kind: "asset", id: a.id })}
      onMouseMove={track}
      onMouseLeave={() => onHover?.(null)}
    >
      <span className={`asset-row-thumb ${a.cutout ? "checker" : ""}`} style={{ background: a.cutout ? undefined : a.color ?? "#2a2e36" }}>
        {(a.kind === "video" || a.kind === "image") && <img src={a.cutout && a.kind === "image" ? `/media/${projectId}/asset/${a.id}/image` : posterUrl(projectId, a.id)} loading="lazy" alt="" onError={hideBroken} />}
        {a.kind === "music" && <span className="asset-row-note">♪</span>}
        {(a.kind === "audio" || a.kind === "voice") && <span className="asset-row-note">🎙</span>}
        {a.duration !== undefined && a.kind !== "image" && <span className="asset-row-dur">{formatTime(a.duration).replace(/^0:/, "").replace(/\.\d+$/, "")}</span>}
      </span>
      <span className="asset-row-body">
        <span className={`asset-row-label ${generic ? "dim" : ""}`}>{a.kind === "music" && a.grid ? `${a.label ?? a.id} · ${Math.round(a.grid.bpm)} BPM` : (a.label ?? a.id)}</span>
        <span className="asset-row-meta small">
          {a.rating && a.rating > 0 ? <span className="asset-row-stars">{"★".repeat(a.rating)}</span> : a.rating === -1 ? <span className="warn">rejected</span> : null}
          {a.moments?.length ? (
            <span className="asset-row-moments" title={a.moments.map((m) => m.label).join(" · ")}>
              ◆{a.moments.length}
            </span>
          ) : null}
          {a.tags
            ?.filter((t) => t !== "portrait" && t !== "landscape")
            .slice(0, 2)
            .map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
        </span>
      </span>
      {used && <span className="asset-row-used" title="Used in this cut" />}
      <span
        className="asset-row-note-btn"
        title="Note about this clip"
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          actions.noteOn({ kind: "asset", asset: a.id }, { x: r.right + 160, y: r.top - 20 });
        }}
      >
        ✎
      </span>
    </button>
  );
}
