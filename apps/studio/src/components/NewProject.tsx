import type { Reference } from "@beatsheet/schema";
import { FORMAT_PRESETS } from "@beatsheet/schema";
import { useEffect, useState } from "react";
import { desktop, pickPath, pathParts } from "../lib";
import { actions, getState, useStore } from "../store";
import { keptReferences, ReferencesField } from "./References";

type Job = { id: string; status: "running" | "done" | "error"; progress: number; log: string[]; error?: string; project: string; output?: string };
type Scan = { ok: boolean; videos: number; photos: number };

const titleFromFolder = (path: string) =>
  (pathParts(path).filter(Boolean).pop() ?? "")
    .replace(/^\d{4}[_-]/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const pick = pickPath;

/**
 * New project: footage (a folder, or nothing yet) and a few words about what it's for. Everything else has a sensible
 * default under More. Once it's in, the default agent takes the first turn: logging the footage and proposing directions.
 */
export function NewProjectDialog() {
  const start = useStore((s) => s.newProjectStart);
  const dropped = typeof start === "object" ? start.folder : undefined;
  const [route, setRoute] = useState<"folder" | "scratch" | null>(dropped ? "folder" : start === "scratch" ? "scratch" : null);
  const [folder, setFolder] = useState(dropped ?? "");
  const [scan, setScan] = useState<Scan | null>(null);
  const [title, setTitle] = useState(dropped ? titleFromFolder(dropped) : "");
  const [titleEdited, setTitleEdited] = useState(false);
  const [goal, setGoal] = useState("");
  const [more, setMore] = useState(false);
  const [audience, setAudience] = useState("");
  const [references, setReferences] = useState<Reference[]>([]);
  const [formats, setFormats] = useState<string[]>(["vertical"]);
  const [target, setTarget] = useState(30);
  const [song, setSong] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);

  const close = () => !job && actions.setNewProjectOpen(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // What's in the folder, so you know you picked the right one.
  useEffect(() => {
    if (!folder) return setScan(null);
    void fetch(`/api/scan?path=${encodeURIComponent(folder)}`)
      .then((r) => r.json())
      .then((s: Scan) => setScan(s));
  }, [folder]);

  const chooseFolder = async () => {
    const path = await pick("folder");
    if (!path) return;
    setFolder(path);
    setRoute("folder");
    if (!titleEdited) setTitle(titleFromFolder(path));
  };

  const create = async () => {
    setError("");
    if (!title.trim()) return setError("Give it a title.");
    if (route === "folder" && !scan?.ok) return setError("That folder has no photos or videos.");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        folder: route === "folder" ? folder : undefined,
        song: song || undefined,
        formats,
        brief: { goal: goal.trim() || undefined, audience: audience.trim() || undefined, references: keptReferences(references) },
        spec: { targetLength: target || undefined, maxLength: target ? Math.max(target * 2, 60) : undefined },
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
    actions.setNewProjectOpen(false);
    // With footage in, the agent goes first: it logs everything and comes back with directions to pick from.
    const preferred = getState().setup?.settings.agent;
    if (route === "folder" && preferred) {
      actions.setSide("agent");
      void actions.agentCommand("start", { agent: preferred.id, model: preferred.model, project: j.project });
    }
  };

  if (job) {
    return (
      <div className="modal-back">
        <div className="modal new-project">
          <h3>{job.status === "error" ? "Import stopped" : `Bringing in ${title}`}</h3>
          <div className="progress">
            <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
            <span>{Math.round(job.progress * 100)}%</span>
          </div>
          <pre className="job-log">{job.log.slice(-8).join("\n") || "Starting…"}</pre>
          {job.status === "error" ? (
            <>
              <p className="warn">{job.error}</p>
              <div className="modal-actions">
                <span className="spacer" />
                <button onClick={() => setJob(null)}>Back</button>
              </div>
            </>
          ) : (
            <p className="dim small">Your footage stays where it is; beatsheet makes small preview copies. When it's done, the agent takes the first look.</p>
          )}
        </div>
      </div>
    );
  }

  // In the Mac app a folder can be dropped right onto the dialog.
  const onDrop = (e: React.DragEvent) => {
    const file = e.dataTransfer.files[0];
    if (!file || !desktop) return;
    e.preventDefault();
    const path = desktop.pathFor(file);
    setFolder(path);
    setRoute("folder");
    if (!titleEdited) setTitle(titleFromFolder(path));
  };
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal new-project" onClick={(e) => e.stopPropagation()} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <h3>New project</h3>
        {!route ? (
          <div className="np-routes">
            <button className="np-route" onClick={() => void chooseFolder()}>
              <strong>Open a footage folder</strong>
              <span className="dim small">
                Pick the folder with your clips and photos{desktop ? ", or drop it here" : ""}. The agent goes through all of it and suggests a few directions.
              </span>
            </button>
            <button className="np-route" onClick={() => setRoute("scratch")}>
              <strong>Start from scratch</strong>
              <span className="dim small">An empty project. Add footage whenever you're ready.</span>
            </button>
          </div>
        ) : (
          <div className="form">
            {route === "folder" && (
              <div className="np-folder">
                <code>{folder}</code>
                <span className="dim small">{scan ? (scan.ok ? `${scan.videos} videos · ${scan.photos} photos` : "No photos or videos here") : "Looking…"}</span>
                <button onClick={() => void chooseFolder()}>Change…</button>
              </div>
            )}
            <label>
              Title
              <input
                autoFocus={route === "scratch"}
                value={title}
                placeholder="Seabrook weekend"
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
              />
            </label>
            <label>
              <span>What's it for? <span className="dim">(optional)</span></span>
              <input value={goal} placeholder="A short reel of the trip to share with family" onChange={(e) => setGoal(e.target.value)} />
            </label>
            <button className="link np-more" onClick={() => setMore(!more)}>
              {more ? "▾ Less" : "▸ More: audience, references, format, length, song"}
            </button>
            {more && (
              <>
                <label>
                  Audience
                  <input value={audience} placeholder="Family and friends" onChange={(e) => setAudience(e.target.value)} />
                </label>
                <ReferencesField value={references} onChange={setReferences} />
                <div className="field">
                  <span className="field-label">Format</span>
                  <div className="format-choices">
                    {FORMAT_PRESETS.map((f) => (
                      <button
                        key={f.id}
                        className={`format-choice ${formats.includes(f.id) ? "on" : ""}`}
                        onClick={() => setFormats(formats.includes(f.id) ? formats.filter((x) => x !== f.id) : [...formats, f.id])}
                      >
                        <span className="format-shape" style={{ aspectRatio: `${f.width} / ${f.height}` }} />
                        <span>
                          <strong>{f.label}</strong>
                          <span className="dim small">{f.platforms?.join(", ")}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <label>
                  Length
                  <span className="row">
                    <input type="number" min={5} step={5} value={target} onChange={(e) => setTarget(Number(e.target.value))} style={{ width: 80 }} /> seconds
                  </span>
                </label>
                <div className="field">
                  <span className="field-label">Song</span>
                  <div className="path-row">
                    {song ? <code>{song}</code> : <span className="dim small">None yet; the agent will ask when it needs one.</span>}
                    <button onClick={() => void pick("audio").then((p) => p && setSong(p))}>Choose…</button>
                    {song && (
                      <button className="link" onClick={() => setSong("")}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        {error && <p className="warn small">{error}</p>}
        <div className="modal-actions">
          {route && (
            <button className="link" onClick={() => setRoute(null)}>
              ← Back
            </button>
          )}
          <span className="spacer" />
          <button onClick={close}>Cancel</button>
          {route && (
            <button className="primary" onClick={() => void create()} disabled={!formats.length}>
              {route === "folder" ? "Create and start" : "Create"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
