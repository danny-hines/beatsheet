import { FORMAT_PRESETS, slugify } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { actions } from "../store";

type Job = { id: string; status: "running" | "done" | "error"; progress: number; log: string[]; error?: string; project: string };
type Scan = { ok: boolean; videos: number; photos: number };

const RECIPES = [
  { id: "montage", label: "Montage", hint: "Clips and photos cut to music", ready: true },
  { id: "narrated", label: "Narrated", hint: "Voiceover drives the timing", ready: false },
  { id: "cinematic", label: "Cinematic", hint: "Story beats and a shot list", ready: false },
];

/** New project: the brief, the footage and the song in one step. Importing runs on the server with live progress. */
export function NewProjectDialog() {
  const [title, setTitle] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [formats, setFormats] = useState<string[]>(["vertical"]);
  const [target, setTarget] = useState(30);
  const [max, setMax] = useState(60);
  const [folder, setFolder] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [song, setSong] = useState("");
  const [firstCut, setFirstCut] = useState(true);
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [picking, setPicking] = useState<"" | "folder" | "audio">("");

  const projectId = idEdited ? id : slugify(title);
  const close = () => !job && actions.setNewProjectOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // What's in the folder, so you know you picked the right one.
  useEffect(() => {
    if (!folder.trim()) return setScan(null);
    const t = setTimeout(async () => setScan((await (await fetch(`/api/scan?path=${encodeURIComponent(folder.trim())}`)).json()) as Scan), 250);
    return () => clearTimeout(t);
  }, [folder]);

  const pick = async (kind: "folder" | "audio") => {
    setPicking(kind);
    try {
      const res = await fetch("/api/pick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) });
      const { path } = (await res.json()) as { path: string | null };
      if (path) (kind === "folder" ? setFolder : setSong)(path);
    } finally {
      setPicking("");
    }
  };

  const create = async () => {
    setError("");
    if (!title.trim()) return setError("Give it a title.");
    if (!formats.length) return setError("Pick at least one format.");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        id: projectId,
        folder: folder.trim() || undefined,
        song: song.trim() || undefined,
        formats,
        firstCut: firstCut && !!song.trim() && !!folder.trim(),
        brief: {
          goal: goal.trim() || undefined,
          audience: audience.trim() || undefined,
          tone: tone.split(",").map((t) => t.trim()).filter(Boolean),
          targetLength: target || undefined,
          maxLength: max || undefined,
        },
      }),
    });
    const body = (await res.json()) as Job & { error?: string };
    if (!res.ok) return setError(body.error ?? "Couldn't create the project.");
    let j = body;
    setJob(j);
    while (j.status === "running") {
      await new Promise((r) => setTimeout(r, 500));
      j = (await (await fetch(`/api/jobs/${j.id}`)).json()) as Job;
      setJob(j);
    }
    if (j.status === "error") return;
    await actions.loadList();
    await actions.open(j.project);
    actions.setStage(firstCut && song.trim() && folder.trim() ? "assemble" : "material");
    actions.setNewProjectOpen(false);
  };

  if (job) {
    return (
      <div className="modal-back">
        <div className="modal new-project">
          <h3>{job.status === "error" ? "Import stopped" : `Setting up ${title}`}</h3>
          <div className="progress">
            <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
            <span>{Math.round(job.progress * 100)}%</span>
          </div>
          <pre className="job-log">{job.log.slice(-8).join("\n") || "Starting…"}</pre>
          {job.status === "error" && (
            <>
              <p className="warn">{job.error}</p>
              <div className="modal-actions">
                <span className="spacer" />
                <button onClick={() => setJob(null)}>Back</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal new-project" onClick={(e) => e.stopPropagation()}>
        <h3>New project</h3>
        <div className="np-grid">
          <div className="form">
            <label>
              Title
              <input autoFocus value={title} placeholder="Seabrook weekend" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Project id
              <input
                value={projectId}
                onChange={(e) => {
                  setIdEdited(true);
                  setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                }}
              />
            </label>
            <div className="field">
              <span className="field-label">Kind of video</span>
              <div className="choice-row">
                {RECIPES.map((r) => (
                  <button key={r.id} className={r.id === "montage" ? "on" : ""} disabled={!r.ready} title={r.ready ? r.hint : `${r.hint} (coming soon)`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Goal
              <textarea rows={2} value={goal} placeholder="A 30-second reel of the trip to share with family" onChange={(e) => setGoal(e.target.value)} />
            </label>
            <label>
              Audience
              <input value={audience} placeholder="Friends and family on Instagram" onChange={(e) => setAudience(e.target.value)} />
            </label>
            <label>
              Tone
              <input value={tone} placeholder="Sunny, playful, fast" onChange={(e) => setTone(e.target.value)} />
            </label>
          </div>
          <div className="form">
            <div className="field">
              <span className="field-label">Formats</span>
              <div className="format-choices">
                {FORMAT_PRESETS.map((f) => {
                  const on = formats.includes(f.id);
                  return (
                    <button key={f.id} className={`format-choice ${on ? "on" : ""}`} onClick={() => setFormats(on ? formats.filter((x) => x !== f.id) : [...formats, f.id])}>
                      <span className="format-shape" style={{ aspectRatio: `${f.width} / ${f.height}` }} />
                      <span>
                        <strong>{f.label}</strong>
                        <span className="dim small">{f.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="row">
              <label>
                Target length
                <span className="numfield">
                  <input type="number" value={target} min={5} onChange={(e) => setTarget(Number(e.target.value))} />
                  <span className="suffix">s</span>
                </span>
              </label>
              <label>
                Longest
                <span className="numfield">
                  <input type="number" value={max} min={5} onChange={(e) => setMax(Number(e.target.value))} />
                  <span className="suffix">s</span>
                </span>
              </label>
            </div>
            <label>
              Footage folder
              <span className="path-row">
                <input value={folder} placeholder="~/Movies/trip" onChange={(e) => setFolder(e.target.value)} />
                <button onClick={() => pick("folder")} disabled={!!picking}>{picking === "folder" ? "…" : "Choose…"}</button>
              </span>
              {scan && <span className={`small ${scan.ok && scan.videos + scan.photos ? "dim" : "warn"}`}>{scan.ok ? `${scan.videos} videos and ${scan.photos} photos` : "Can't read that folder"}</span>}
            </label>
            <label>
              Song
              <span className="path-row">
                <input value={song} placeholder="Optional: add one later" onChange={(e) => setSong(e.target.value)} />
                <button onClick={() => pick("audio")} disabled={!!picking}>{picking === "audio" ? "…" : "Choose…"}</button>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={firstCut} disabled={!song.trim() || !folder.trim()} onChange={(e) => setFirstCut(e.target.checked)} />
              Make a first cut on the beat as soon as it's imported
            </label>
          </div>
        </div>
        {error && <p className="warn">{error}</p>}
        <div className="modal-actions">
          <span className="dim small">Footage stays where it is. beatsheet keeps small preview copies in projects/{projectId || "…"}/.</span>
          <span className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={create}>Create project</button>
        </div>
      </div>
    </div>
  );
}
