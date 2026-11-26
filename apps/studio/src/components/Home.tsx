import type { TrashPlan } from "@beatsheet/engine";
import type { HandOff } from "@beatsheet/schema";
import { useEffect, useRef, useState } from "react";
import { AGENT_NAMES, desktop, hideBroken, posterUrl, timeAgo, OS, keys, WINDOWS } from "../lib";
import { RECIPE_CATEGORIES, RECIPES, recipePreviewUrl, type RecipeCategoryId, type RecipeTemplate } from "../recipes";
import { actions, useStore, type ProjectSummary } from "../store";
import { Mark, PopMenu } from "./ui";
import { Icon } from "./Icon";

/**
 * Where the app opens: browse recipes or start from scratch (or drop a footage folder anywhere on the window), then
 * pick up any project where it was left, with whose turn it is on each.
 */
export function Home() {
  const list = useStore((s) => s.list);
  const listed = useStore((s) => s.listed);
  const [dropping, setDropping] = useState(false);
  const [cat, setCat] = useState<RecipeCategoryId>("featured");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<{ p: ProjectSummary; x: number; y: number }>();
  const [trashing, setTrashing] = useState<ProjectSummary>();
  const now = useNow();

  const mine = list.filter((p) => p.where !== "examples").sort((a, b) => (b.edited ?? "").localeCompare(a.edited ?? ""));
  const examples = list.filter((p) => p.where === "examples");
  const q = query.trim().toLowerCase();
  const shownMine = q ? mine.filter((p) => p.title.toLowerCase().includes(q) || p.recipe.toLowerCase().includes(q)) : mine;

  // In the desktop app a footage folder can be dropped anywhere here.
  const drop = desktop && {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: (e: React.DragEvent) => !e.relatedTarget && setDropping(false),
    onDrop: (e: React.DragEvent) => {
      setDropping(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      e.preventDefault();
      actions.setNewProjectOpen(true, { folder: desktop!.pathFor(file) });
    },
  };

  return (
    <div className={`home ${dropping ? "dropping" : ""}`} {...drop}>
      <div className="home-bar" />
      <div className="home-body">
        <div className="home-page">
          <header className="home-head">
            <Mark />
            <h1 className="wordmark" aria-label="beatsheet">
              beat<i />sheet
            </h1>
            {desktop && (
              <span className="home-drop-hint">
                <Icon name="folder" size={13} /> Drop a footage folder anywhere
              </span>
            )}
            <span className="spacer" />
            <button className="primary home-new-btn" onClick={() => actions.setNewProjectOpen(true)}>
              <Icon name="add" size={13} /> New project
            </button>
            <button className="icon" onClick={() => actions.setSettingsOpen(true)} title={`Settings: agents, models and media services (${keys("⌘,")})`}>
              <Icon name="tune" />
            </button>
          </header>

          <RecipeShelf cat={cat} onCat={setCat} />

          <section className="home-section">
            <div className="home-sec-head">
              <h2>
                Projects {mine.length > 0 && <span className="dim">{mine.length}</span>}
              </h2>
              <span className="spacer" />
              {mine.length > 3 && (
                <input
                  className="home-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter projects…"
                  aria-label="Filter projects"
                />
              )}
            </div>
            {listed && !mine.length ? (
              <p className="dim home-empty">Nothing here yet. Your projects show up here, newest first.</p>
            ) : shownMine.length ? (
              <div className="home-grid">
                {shownMine.map((p) => (
                  <ProjectCard key={p.id} p={p} now={now} onMenu={(x, y) => setMenu({ p, x, y })} />
                ))}
              </div>
            ) : (
              <p className="dim small home-empty">No projects match “{query}”.</p>
            )}
          </section>

          {examples.length > 0 && (
            <section className="home-section">
              <div className="home-sec-head">
                <h2>Examples</h2>
              </div>
              <div className="home-grid">
                {examples.map((p) => (
                  <ProjectCard key={p.id} p={p} now={now} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      {dropping && (
        <div className="home-drop">
          <Icon name="folder" size={44} className="home-icon" />
          <strong>Drop to start a project from this folder</strong>
        </div>
      )}
      {menu && <CardMenu {...menu} onClose={() => setMenu(undefined)} onTrash={() => setTrashing(menu.p)} />}
      {trashing && <TrashDialog p={trashing} onClose={() => setTrashing(undefined)} />}
    </div>
  );
}

/** Category pills + horizontal scrolling recipe rail, with Start from scratch pinned first. */
function RecipeShelf({ cat, onCat }: { cat: RecipeCategoryId; onCat: (c: RecipeCategoryId) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: true, right: false });
  const items = cat === "featured" ? RECIPES.filter((r) => r.featured) : RECIPES.filter((r) => r.category === cat);

  const syncEdges = () => {
    const el = railRef.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft <= 12,
      right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 12,
    });
  };

  useEffect(() => {
    if (railRef.current) railRef.current.scrollLeft = 0;
    const id = requestAnimationFrame(syncEdges);
    window.addEventListener("resize", syncEdges);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", syncEdges);
    };
  }, [cat]);

  const scrollBy = (dx: number) => railRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  return (
    <section className="home-section recipe-shelf">
      <div className="recipe-shelf-top">
        <h2>Start a project</h2>
        <div className="recipe-cats" role="tablist" aria-label="Recipe categories">
          {RECIPE_CATEGORIES.map((c) => (
            <button key={c.id} className={`recipe-cat ${c.id === cat ? "on" : ""}`} role="tab" aria-selected={c.id === cat} onClick={() => onCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="recipe-rail-shell">
        <div className={`recipe-fade left ${edges.left ? "hidden" : ""}`} />
        <div className={`recipe-fade right ${edges.right ? "hidden" : ""}`} />
        <button className={`recipe-arrow left ${edges.left ? "hidden" : ""}`} onClick={() => scrollBy(-540)} aria-label="Scroll recipes left">
          <Icon name="back" size={13} />
        </button>
        <button className={`recipe-arrow right ${edges.right ? "hidden" : ""}`} onClick={() => scrollBy(540)} aria-label="Scroll recipes right">
          <Icon name="forward" size={13} />
        </button>
        <div className="recipe-rail" ref={railRef} onScroll={syncEdges}>
          <button className="recipe-card scratch" onClick={() => actions.setNewProjectOpen(true)}>
            <span className="recipe-scratch-plus">
              <Icon name="add" size={16} />
            </span>
            <strong>Start from scratch</strong>
            <span className="dim small">Blank project. Drop footage or write a brief whenever you're ready.</span>
          </button>
          {items.map((r) => (
            <RecipeCard key={r.id} r={r} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecipeCard({ r }: { r: RecipeTemplate }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = recipePreviewUrl(r.id);
  const onEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => {});
  };
  const onLeave = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  };
  return (
    <button
      className="recipe-card"
      onClick={() => actions.setNewProjectOpen(true, { recipe: r.id })}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <div className="recipe-media">
        {src ? <video ref={videoRef} src={src} muted loop playsInline preload="metadata" /> : <RecipeArtwork kind={r.artwork} />}
      </div>
      <div className="recipe-scrim" />
      <div className="recipe-badges">
        <span className={`recipe-pill ${src ? "has-video" : ""}`}>{r.tag}</span>
      </div>
      <div className="recipe-info">
        <strong>{r.title}</strong>
        <span>{r.subtitle}</span>
      </div>
    </button>
  );
}

/** Clean procedural mini-artwork for recipe cards before their rendered .mp4 preview loop is added. */
function RecipeArtwork({ kind }: { kind: string }) {
  switch (kind) {
    case "launch":
      return (
        <div className="r-art r-art-launch">
          <div className="r-art-grid" />
          <span className="r-art-kicker">INTRODUCING</span>
          <span className="r-art-big">BUILT TO<br />SHIP FAST</span>
          <div className="r-art-stats">
            <span>10× FASTER</span>
            <span>LIVE UI</span>
          </div>
        </div>
      );
    case "explainer":
      return (
        <div className="r-art r-art-explainer">
          <svg viewBox="0 0 280 180" fill="none" aria-hidden>
            <g stroke="rgba(134,197,154,0.2)" strokeWidth="1">
              <line x1="20" y1="36" x2="260" y2="36" />
              <line x1="20" y1="72" x2="260" y2="72" />
              <line x1="20" y1="108" x2="260" y2="108" />
            </g>
            <path className="r-art-curve" d="M32 104 C 76 104, 88 46, 138 52 C 186 58, 194 94, 244 40" stroke="#86c59a" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="138" cy="52" r="5" fill="#ffcb3d" />
            <circle cx="244" cy="40" r="4" fill="#8db8e8" />
            <line x1="138" y1="52" x2="162" y2="30" stroke="#ffcb3d" strokeWidth="1" strokeDasharray="2 2" />
            <rect x="164" y="20" width="66" height="17" rx="3" fill="rgba(255,203,61,0.16)" stroke="rgba(255,203,61,0.5)" />
            <text x="172" y="32" fill="#ffcb3d" fontFamily="IBM Plex Mono, monospace" fontSize="9">KEY STEP</text>
          </svg>
        </div>
      );
    case "build":
      return (
        <div className="r-art r-art-build">
          <div className="r-art-row"><i className="g" /><span>01 · CAD &amp; parts list</span><span className="spacer" /><em>0:08</em></div>
          <div className="r-art-row"><i className="y" /><span>02 · First prototype fail</span><span className="spacer" /><em>0:24</em></div>
          <div className="r-art-row"><i className="b" /><span>03 · Final working demo</span><span className="spacer" /><em>0:48</em></div>
        </div>
      );
    case "promo":
      return (
        <div className="r-art r-art-promo">
          <span className="r-art-slam">STOP SCROLLING</span>
          <span className="r-art-sub">HOOK · PROOF · CTA</span>
        </div>
      );
    case "titles":
      return (
        <div className="r-art r-art-titles">
          <span className="r-art-sub">A FILM BY YOU</span>
          <span className="r-art-wide">HORIZON</span>
        </div>
      );
    case "talking":
      return (
        <div className="r-art r-art-talking">
          <div className="r-art-wave">
            {[28, 52, 74, 44, 88, 66, 36, 78, 54, 92, 60, 40, 72, 48].map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="r-art-cap">Cut the pauses, <em>keep the punch</em></div>
        </div>
      );
    case "multicam":
      return (
        <div className="r-art r-art-multicam">
          <div className="r-art-cam live"><span>CAM A</span></div>
          <div className="r-art-cam alt"><span>CAM B</span></div>
        </div>
      );
    case "trip":
    case "tribute":
    case "photo":
      return (
        <div className={`r-art r-art-montage kind-${kind}`}>
          <div className="r-art-frames">
            <span />
            <span />
            <span />
          </div>
          <div className="r-art-beats">
            {[4, 9, 5, 10, 6, 8, 4, 10, 6, 9, 5, 7].map((h, i) => (
              <i key={i} style={{ height: `${h}px` }} />
            ))}
          </div>
        </div>
      );
    case "restore":
      return (
        <div className="r-art r-art-restore">
          <div className="r-art-res-l"><span>VHS 480i</span></div>
          <div className="r-art-res-r"><span>CLEAN 4K</span></div>
          <div className="r-art-res-line" />
        </div>
      );
    default:
      return (
        <div className={`r-art r-art-film kind-${kind}`}>
          <div className="r-art-letterbox">
            <div>
              <span className="r-art-kicker">{kind === "trailer" ? "ACT II · REVEAL" : kind === "pet" ? "SCENE 04 · ALLEY" : kind === "remake" ? "STYLE TRANSFER" : "SHOT 01 · WIDE"}</span>
              <span className="r-art-scene">{kind === "trailer" ? "ONE LAST RIDE" : kind === "pet" ? "@CAT ENTERS VAULT" : kind === "remake" ? "STOP-MOTION PASS" : "BOARDS → ROUGHS"}</span>
            </div>
            <span className="r-art-tag">24 FPS</span>
          </div>
        </div>
      );
  }
}

/** A project: a few of its pictures, what's in it, whose turn it is, and when it last changed. */
function ProjectCard({ p, now, onMenu }: { p: ProjectSummary; now: number; onMenu?: (x: number, y: number) => void }) {
  const agent = useStore((s) => s.agent);
  const posters = p.posters ?? [];
  const working = agent.project === p.id && (agent.status === "running" || agent.status === "starting");
  const count = (n: number | undefined, one: string) => (n ? `${n} ${one}${n === 1 ? "" : "s"}` : "");
  const facts = [count(p.videos, "video"), count(p.photos, "photo"), p.cuts > 1 ? `${p.cuts} cuts` : ""].filter(Boolean).join(" · ");
  const turn = working
    ? { tone: "agent", text: `${AGENT_NAMES[agent.agent ?? "other"]} is working` }
    : p.turn?.who === "agent"
      ? { tone: "agent", text: "Agent's turn" }
      : p.turn?.ask
        ? { tone: "you", text: `Your turn: ${askWords(p.turn.ask)}` }
        : undefined;
  return (
    <div
      className="project-card-wrap"
      onContextMenu={
        onMenu &&
        ((e) => {
          e.preventDefault();
          onMenu(e.clientX, e.clientY);
        })
      }
    >
      <button className="project-card" onClick={() => void actions.open(p.id)} title={`Open ${p.title}`}>
        <div className={`project-posters n${Math.min(posters.length, 3)}`}>
          {posters.slice(0, 3).map((x) => (
            <div key={x.asset} className="project-poster" style={x.color ? { background: x.color } : undefined}>
              <img src={posterUrl(p.id, x.asset)} alt="" loading="lazy" onError={hideBroken} />
            </div>
          ))}
          {!posters.length && <span className="dim small">No footage yet</span>}
        </div>
        <div className="project-card-body">
          <div className="project-card-head">
            <strong className="project-card-title">{p.title}</strong>
            {p.recipe && <span className="project-recipe-tag">{p.recipe}</span>}
          </div>
          <span className="dim small">{facts || "Empty"}</span>
          <span className="project-card-foot">
            {turn && (
              <span className={`project-turn ${turn.tone}`}>
                <span className={`dot ${working ? "pending" : "on"}`} />
                {turn.text}
              </span>
            )}
            <span className="spacer" />
            {p.edited && <span className="dim small">{timeAgo(p.edited, now)}</span>}
          </span>
        </div>
      </button>
      {onMenu && (
        <button
          className="project-more"
          title="More"
          aria-label={`More for ${p.title}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMenu(r.right, r.bottom + 4);
          }}
        >
          <Icon name="more" />
        </button>
      )}
    </div>
  );
}

/** A project's menu, from its ⋯ or a right-click. */
function CardMenu({ p, x, y, onClose, onTrash }: { p: ProjectSummary; x: number; y: number; onClose: () => void; onTrash: () => void }) {
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <PopMenu x={x} y={y} onClose={onClose}>
      <button role="menuitem" onClick={pick(() => void actions.open(p.id))}>
        Open
      </button>
      <button role="menuitem" onClick={pick(() => void revealProject(p.id))}>
        Show in {OS.files}
      </button>
      <hr />
      <button role="menuitem" className="danger" onClick={pick(onTrash)}>
        {WINDOWS ? "Move to the Recycle Bin…" : "Move to Trash…"}
      </button>
    </PopMenu>
  );
}

const revealProject = (id: string) => fetch("/api/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project: id }) });

/** Says what moving a project to the Trash takes (its own folder) and what it leaves (the footage), then does it. */
function TrashDialog({ p, onClose }: { p: ProjectSummary; onClose: () => void }) {
  const agent = useStore((s) => s.agent);
  const [plan, setPlan] = useState<TrashPlan>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch(`/api/projects/${p.id}/trash`).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (r.ok) setPlan(body as TrashPlan);
      else setError((body as { error?: string }).error ?? "Couldn't look in the project's folder");
    });
  }, [p.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy, onClose]);
  const working = agent.project === p.id && (agent.status === "running" || agent.status === "starting");
  const trash = async () => {
    setBusy(true);
    const why = await actions.trashProject(p.id);
    setBusy(false);
    if (why) setError(why);
    else onClose();
  };
  return (
    <div className="modal-back" onClick={() => !busy && onClose()}>
      <div className="modal trash-dialog" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="trash-title">
        <h3 id="trash-title">Move “{p.title}” to the {OS.trash}?</h3>
        {!plan && !error && <p className="dim">Looking in its folder…</p>}
        {plan && (
          <>
            {plan.keeps.length > 0 && (
              <div className="trash-keeps">
                <strong>Your footage stays where it is.</strong>
                <span className="dim small">Nothing in {plan.keeps.length === 1 ? "this folder" : "these folders"} is touched:</span>
                {plan.keeps.map((k) => (
                  <code key={k} title={k}>
                    {tilde(k)}
                  </code>
                ))}
              </div>
            )}
            <p className="dim small">
              What goes is the project's own folder, {size(plan.bytes)}: its cuts, notes and turns, the previews, its copy of the song, exports
              {plan.made ? `, ${plan.recordings ? "" : "and "}${plan.made === 1 ? "one file" : `${plan.made} files`} made for it (cut-outs, clips)` : ""}
              {plan.recordings ? `, and ${plan.recordings === 1 ? "the recording" : `the ${plan.recordings} recordings`} you made in beatsheet` : ""}. {WINDOWS ? "You can restore it from the Recycle Bin." : "You can put it back from the Trash in Finder."}
            </p>
          </>
        )}
        {working && <p className="warn small">{AGENT_NAMES[agent.agent ?? "other"]} is working on it, and stops first.</p>}
        {(plan?.blocked || error) && <p className="warn small">{plan?.blocked || error}</p>}
        <div className="modal-actions">
          <button className="link" onClick={() => void revealProject(p.id)}>
            Show in {OS.files}
          </button>
          <span className="spacer" />
          <button onClick={onClose} disabled={busy} autoFocus>
            Cancel
          </button>
          <button className="danger" onClick={() => void trash()} disabled={!plan || !!plan.blocked || busy}>
            {busy ? "Moving…" : WINDOWS ? "Move to the Recycle Bin" : "Move to Trash"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Home folders as ~, the way Finder people read them (C:\Users\<name> too, on Windows). */
const tilde = (path: string) => (WINDOWS ? path.replace(/^[a-z]:\\Users\\[^\\]+(?=\\|$)/i, "~") : path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~"));
const size = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : "under 1 MB");

const askWords = (ask: HandOff) =>
  ask.kind === "choose" ? "pick a direction" : ask.kind === "review" ? "watch the cut" : ask.kind === "cast" ? "keep the cast you want" : ask.need === "song" ? "add a song" : ask.need === "footage" ? "add footage" : ask.need === "chrome" ? "let it use your Chrome" : ask.need === "cast" ? "add pictures" : "reply";

/** The time, every half minute, so "edited 3m ago" stays true while the list is open. */
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
