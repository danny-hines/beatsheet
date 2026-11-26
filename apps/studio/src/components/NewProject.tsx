import type { Reference } from "@beatsheet/schema";
import { FORMAT_PRESETS } from "@beatsheet/schema";
import { useEffect, useRef, useState } from "react";
import { desktop, pickPath, pathParts } from "../lib";
import { LENGTH_PRESETS, MOOD_PRESETS, RECIPE_CATEGORIES, RECIPES, recipeById, VISUAL_STYLES } from "../recipes";
import { actions, getState, useStore } from "../store";
import { keptReferences, ReferencesField } from "./References";
import { Icon } from "./Icon";

type Job = { id: string; status: "running" | "done" | "error"; progress: number; log: string[]; error?: string; project: string; output?: string };
type Scan = { ok: boolean; videos: number; photos: number };

const titleFromFolder = (path: string) =>
  (pathParts(path).filter(Boolean).pop() ?? "")
    .replace(/^\d{4}[_-]/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const pick = pickPath;

const FORMAT_SHAPES: Record<string, { w: number; h: number }> = {
  landscape: { w: 22, h: 13 },
  vertical: { w: 12, h: 21 },
  square: { w: 16, h: 16 },
  portrait: { w: 14, h: 18 },
};

const FORMAT_ORDER = ["landscape", "vertical", "square", "portrait"];
const ORDERED_FORMATS = [...FORMAT_PRESETS].sort((a, b) => FORMAT_ORDER.indexOf(a.id) - FORMAT_ORDER.indexOf(b.id));

/**
 * Unified New Project dialog: optionally started from a Home recipe card or a dropped footage folder.
 * Keeps title, multi-line brief, aspect ratio, optional style/mood/length, and optional footage directly visible.
 */
export function NewProjectDialog() {
  const start = useStore((s) => s.newProjectStart);
  const preferred = useStore((s) => s.setup?.settings.agent);
  const initialRecipe = recipeById(start?.recipe);
  const dropped = start?.folder;

  const [recipeId, setRecipeId] = useState(initialRecipe?.id ?? "");
  const [folder, setFolder] = useState(dropped ?? "");
  const [scan, setScan] = useState<Scan | null>(null);
  const [title, setTitle] = useState(dropped ? titleFromFolder(dropped) : "");
  const [titleEdited, setTitleEdited] = useState(false);
  const [goal, setGoal] = useState("");
  const [formats, setFormats] = useState<string[]>(initialRecipe ? [...initialRecipe.defaultFormats] : ["landscape"]);
  const [style, setStyle] = useState(initialRecipe?.defaultStyle ?? "");
  const [customStyle, setCustomStyle] = useState("");
  const [moods, setMoods] = useState<string[]>(initialRecipe?.defaultMoods ? [...initialRecipe.defaultMoods] : []);
  const [customMood, setCustomMood] = useState("");
  const [target, setTarget] = useState("");
  const [more, setMore] = useState(!!initialRecipe?.expandMore);
  const [audience, setAudience] = useState("");
  const [references, setReferences] = useState<Reference[]>([]);
  const [song, setSong] = useState("");
  const [autoStart, setAutoStart] = useState(!!dropped || !!initialRecipe);
  const [autoStartTouched, setAutoStartTouched] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const goalRef = useRef<HTMLTextAreaElement>(null);

  const selectedRecipe = recipeById(recipeId);
  const close = () => !job && actions.setNewProjectOpen(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Auto-size the brief textarea cleanly for multi-paragraph ideas or pasted scripts.
  useEffect(() => {
    const el = goalRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(240, Math.max(88, el.scrollHeight))}px`;
  }, [goal]);

  // Keep default auto-start in sync until the user explicitly toggles it.
  useEffect(() => {
    if (autoStartTouched) return;
    setAutoStart(!!folder || !!goal.trim() || !!recipeId);
  }, [folder, goal, recipeId, autoStartTouched]);

  // Scan the chosen folder so the user sees video & photo counts right away.
  useEffect(() => {
    if (!folder) return setScan(null);
    let live = true;
    void fetch(`/api/scan?path=${encodeURIComponent(folder)}`)
      .then((r) => r.json())
      .then((s: Scan) => live && setScan(s));
    return () => {
      live = false;
    };
  }, [folder]);

  const switchRecipe = (nextId: string) => {
    setRecipeId(nextId);
    const next = recipeById(nextId);
    setFormats(next ? [...next.defaultFormats] : ["landscape"]);
    setStyle(next?.defaultStyle ?? "");
    setCustomStyle("");
    setMoods(next?.defaultMoods ? [...next.defaultMoods] : []);
    setMore(!!next?.expandMore);
  };

  const chooseFolder = async () => {
    const path = await pick("folder");
    if (!path) return;
    setFolder(path);
    if (!titleEdited) setTitle(titleFromFolder(path));
  };

  const toggleFormat = (id: string) => {
    setFormats((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));
  };

  const addCustomMood = () => {
    const v = customMood.trim();
    if (!v) return;
    if (!moods.includes(v)) setMoods([...moods, v]);
    setCustomMood("");
  };

  const create = async () => {
    setError("");
    if (!title.trim()) return setError("Give it a title.");
    if (folder && scan && !scan.ok) return setError("That folder has no photos or videos.");
    const activeStyle = (customStyle.trim() || style).trim() || undefined;
    const secs = target.trim() ? Number(target.trim()) : undefined;
    const validSecs = secs && Number.isFinite(secs) && secs > 0 ? secs : undefined;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        folder: folder || undefined,
        song: song || undefined,
        recipe: selectedRecipe?.recipe,
        spine: selectedRecipe?.spine,
        style: activeStyle,
        formats,
        brief: {
          goal: goal.trim() || undefined,
          audience: audience.trim() || undefined,
          tone: moods.length ? moods : undefined,
          references: keptReferences(references),
        },
        spec: {
          purpose: selectedRecipe?.title,
          targetLength: validSecs,
          maxLength: validSecs ? Math.max(validSecs * 2, 60) : undefined,
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
    actions.setNewProjectOpen(false);
    const pref = getState().setup?.settings.agent;
    if (autoStart && pref) {
      actions.setSide("agent");
      void actions.agentCommand("start", { agent: pref.id, model: pref.model, thinking: pref.thinking, project: j.project });
    }
  };

  if (job) {
    return (
      <div className="modal-back">
        <div className="modal new-project">
          <div className="np-head">
            <h3>{job.status === "error" ? "Import stopped" : `Bringing in ${title}`}</h3>
          </div>
          <div className="np-body">
            <div className="progress">
              <div style={{ width: `${Math.round(job.progress * 100)}%` }} />
              <span>{Math.round(job.progress * 100)}%</span>
            </div>
            <pre className="job-log">{job.log.slice(-8).join("\n") || "Starting…"}</pre>
            {job.status === "error" ? (
              <p className="warn">{job.error}</p>
            ) : (
              <p className="dim small">Your footage stays where it is; beatsheet makes small preview copies.</p>
            )}
          </div>
          {job.status === "error" && (
            <div className="np-foot">
              <span className="spacer" />
              <button onClick={() => setJob(null)}>Back</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // In the desktop app a folder can be dropped right onto the dialog.
  const onDrop = (e: React.DragEvent) => {
    const file = e.dataTransfer.files[0];
    if (!file || !desktop) return;
    e.preventDefault();
    const path = desktop.pathFor(file);
    setFolder(path);
    if (!titleEdited) setTitle(titleFromFolder(path));
  };

  const activeStyleLabel = customStyle.trim() || style;
  const presetLenIds = LENGTH_PRESETS.map((l) => l.id as string);
  const customLen = !!target && !presetLenIds.includes(target);
  const extraMoods = moods.filter((m) => !(MOOD_PRESETS as readonly string[]).includes(m));
  const wordCount = goal.trim() ? goal.trim().split(/\s+/).length : 0;

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal new-project" onClick={(e) => e.stopPropagation()} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <div className="np-head">
          <h3>New project</h3>
          <span className={`np-recipe-pill ${selectedRecipe ? "" : "blank"}`}>
            <select aria-label="Recipe" value={recipeId} onChange={(e) => switchRecipe(e.target.value)}>
              <option value="">Blank project</option>
              {RECIPE_CATEGORIES.filter((c) => c.id !== "featured").map((c) => (
                <optgroup key={c.id} label={c.label}>
                  {RECIPES.filter((r) => r.category === c.id).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </span>
          <span className="spacer" />
          <button className="icon np-close" onClick={close} aria-label="Close">
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="np-body">
          <div className="field">
            <label className="np-label" htmlFor="np-title">
              Title
            </label>
            <input
              id="np-title"
              autoFocus={!dropped}
              value={title}
              placeholder={selectedRecipe?.titlePlaceholder ?? "Untitled video"}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleEdited(true);
              }}
            />
          </div>

          <div className="field">
            <div className="np-field-head">
              <label className="np-label" htmlFor="np-goal">
                What are you making? <span className="np-opt">(optional · short line or full script)</span>
              </label>
              {wordCount > 0 && (
                <span className="mono dim small">
                  {wordCount} word{wordCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <textarea
              id="np-goal"
              ref={goalRef}
              className="np-goal"
              rows={3}
              autoFocus={!!dropped}
              value={goal}
              placeholder={selectedRecipe?.goalPlaceholder ?? "Describe the video, paste a rough script or outline, or leave blank and figure it out with the agent…"}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="np-field-head">
              <span className="np-label">Aspect ratio</span>
              <span className="dim small">Pick one or more</span>
            </div>
            <div className="np-formats">
              {ORDERED_FORMATS.map((f) => {
                const shape = FORMAT_SHAPES[f.id] ?? { w: 18, h: 14 };
                const on = formats.includes(f.id);
                return (
                  <button key={f.id} type="button" className={`np-format ${on ? "on" : ""}`} onClick={() => toggleFormat(f.id)}>
                    <span className="np-format-shape" style={{ width: shape.w, height: shape.h }} />
                    <span className="np-format-meta">
                      <strong>{f.label}</strong>
                      <span className="dim">{f.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <div className="np-field-head">
              <span className="np-label">
                Visual style <span className="np-opt">(optional)</span>
              </span>
              <span className="dim small">{activeStyleLabel || "Auto — agent decides"}</span>
            </div>
            <div className="np-chips">
              {VISUAL_STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`np-chip ${style === s && !customStyle.trim() ? "on" : ""}`}
                  onClick={() => {
                    setCustomStyle("");
                    setStyle(style === s ? "" : s);
                  }}
                >
                  {s}
                </button>
              ))}
              <input
                className="np-chip-input"
                value={customStyle}
                placeholder="Custom style…"
                onChange={(e) => {
                  setCustomStyle(e.target.value);
                  if (e.target.value.trim()) setStyle("");
                }}
              />
            </div>
          </div>

          <div className="field">
            <div className="np-field-head">
              <span className="np-label">
                Mood &amp; tone <span className="np-opt">(optional · also guides pacing)</span>
              </span>
            </div>
            <div className="np-chips">
              {[...MOOD_PRESETS, ...extraMoods].map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`np-chip mood ${moods.includes(m) ? "on" : ""}`}
                  onClick={() => setMoods(moods.includes(m) ? moods.filter((x) => x !== m) : [...moods, m])}
                >
                  {m}
                </button>
              ))}
              <input
                className="np-chip-input"
                value={customMood}
                placeholder="+ Custom mood…"
                onChange={(e) => setCustomMood(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomMood();
                  }
                }}
                onBlur={addCustomMood}
              />
            </div>
          </div>

          <div className="field">
            <span className="np-label">
              Target length <span className="np-opt">(optional)</span>
            </span>
            <div className="np-chips">
              {LENGTH_PRESETS.map((l) => (
                <button key={l.label} type="button" className={`np-chip ${target === l.id ? "on" : ""}`} onClick={() => setTarget(l.id)}>
                  {l.label}
                </button>
              ))}
              <label className={`np-len-custom ${customLen ? "on" : ""}`}>
                <input
                  type="number"
                  min={5}
                  step={5}
                  placeholder="sec"
                  value={customLen ? target : ""}
                  onChange={(e) => setTarget(e.target.value.trim())}
                />
                <span>s</span>
              </label>
            </div>
          </div>

          <div className="field">
            <span className="np-label">
              Footage <span className="np-opt">(optional)</span>
            </span>
            <div className={`np-footage ${folder ? (scan && !scan.ok ? "bad" : "has") : ""}`}>
              <Icon name="folder" size={16} />
              <div className="np-footage-info">
                {folder ? (
                  <>
                    <code title={folder}>{folder}</code>
                    <span className={`small ${scan && !scan.ok ? "warn" : "dim"}`}>
                      {scan ? (scan.ok ? `${scan.videos} videos · ${scan.photos} photos` : "No photos or videos here") : "Looking…"}
                    </span>
                  </>
                ) : (
                  <span className="dim small">
                    {desktop ? "Drop a folder here, or skip and add clips anytime inside the studio." : "Optional — skip and add clips anytime inside the studio."}
                  </span>
                )}
              </div>
              <button type="button" onClick={() => void chooseFolder()}>
                {folder ? "Change…" : "Choose folder…"}
              </button>
              {folder && (
                <button type="button" className="link small" onClick={() => setFolder("")}>
                  Remove
                </button>
              )}
            </div>
          </div>

          <button type="button" className="link np-more" onClick={() => setMore(!more)}>
            <Icon name={more ? "down" : "right"} size={10} /> {more ? "Hide extra options" : "More options: audience, song, references"}
          </button>

          {more && (
            <div className="np-more-box">
              <div className="field">
                <label className="np-label" htmlFor="np-audience">
                  Audience <span className="np-opt">(optional)</span>
                </label>
                <input id="np-audience" value={audience} placeholder="e.g. Family & friends, developers on X, prospective customers" onChange={(e) => setAudience(e.target.value)} />
              </div>
              <div className="field">
                <span className="np-label">
                  Song <span className="np-opt">(optional)</span>
                </span>
                <div className="path-row">
                  {song ? <code>{song}</code> : <span className="dim small">None yet; the agent will ask or generate one when needed.</span>}
                  <button type="button" onClick={() => void pick("audio").then((p) => p && setSong(p))}>
                    Choose…
                  </button>
                  {song && (
                    <button type="button" className="link small" onClick={() => setSong("")}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <ReferencesField value={references} onChange={setReferences} />
            </div>
          )}

          {error && <p className="warn small np-error">{error}</p>}
        </div>

        <div className="np-foot">
          {preferred ? (
            <label className="np-autostart">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => {
                  setAutoStartTouched(true);
                  setAutoStart(e.target.checked);
                }}
              />
              <span>
                <strong>Start agent</strong> on Turn 1
              </span>
            </label>
          ) : (
            <span />
          )}
          <span className="spacer" />
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={() => void create()} disabled={!formats.length}>
            {autoStart && preferred ? "Create & start" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
