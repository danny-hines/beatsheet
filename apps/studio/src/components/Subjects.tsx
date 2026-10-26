import { formatTime, subjectAt, type Asset, type ClipEffect, type ProjectFile, type Rect, type Shot, type SubjectTrack } from "@beatsheet/schema";
import { useState } from "react";
import { runJob } from "../lib";
import { actions, useProject, useStore } from "../store";
import { MotionSelect } from "./Designed";
import { TextField } from "./ui";

const KIND_GLYPH: Record<SubjectTrack["kind"], string> = { face: "☺", person: "♟", object: "◎" };

const span = (s: SubjectTrack) => {
  const a = s.samples[0]?.[0] ?? 0, b = s.samples[s.samples.length - 1]?.[0] ?? 0;
  return b > a ? `${a.toFixed(1)}–${b.toFixed(1)}s` : "";
};

/** Every place a subject is used (effects and reframes, in any cut), so it isn't removed out from under them. */
function usesOf(doc: ProjectFile | undefined, assetId: string, subjectId: string): string[] {
  const out: string[] = [];
  for (const c of doc?.cuts ?? [])
    for (const s of c.shots) {
      if (s.content.kind !== "clip" || s.content.asset !== assetId) continue;
      if (s.content.effects?.some((e) => e.subject === subjectId) || Object.values(s.content.reframe ?? {}).some((r) => r.follow === subjectId)) out.push(`${s.id} in ${c.name}`);
    }
  return out;
}

/** Subject boxes drawn over a clip at time t (in the clip's own seconds). */
export function SubjectBoxes({ a, t, hover }: { a: Asset; t: number; hover?: string | null }) {
  return (
    <>
      {(a.subjects ?? []).map((s) => {
        const b = subjectAt(s, t, 0.15);
        if (!b) return null;
        return (
          <div key={s.id} className={`subject-box k-${s.kind} ${hover === s.id ? "hot" : ""}`} style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>
            <span>{s.label}</span>
          </div>
        );
      })}
    </>
  );
}

type Busy = { what: string; progress: number } | null;

/**
 * The people and things in a file: find faces and people, box something to follow it, name them, and lift them out as
 * cut-outs. The agent uses the same tools; what's found here shows up for it too.
 */
export function SubjectTools({
  a,
  t,
  boxing,
  setBoxing,
  hover,
  setHover,
  seek,
}: {
  a: Asset;
  t: number;
  boxing: boolean;
  setBoxing: (on: boolean) => void;
  hover: string | null;
  setHover: (id: string | null) => void;
  seek: (t: number) => void;
}) {
  const projectId = useStore((s) => s.projectId)!;
  const doc = useStore((s) => s.doc);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [made, setMade] = useState<string[]>([]);
  const subjects = a.subjects ?? [];
  const isVideo = a.kind === "video";
  // Cut-outs by description: SAM on this Mac does photos and stills from clips; through fal, photos.
  const samHere = useStore((s) => s.setup?.sam?.state === "ready");
  const canDescribe = useStore((s) => !!s.setup?.capabilities.includes("segment")) && (samHere || !isVideo);
  const [describe, setDescribe] = useState("");
  const [separately, setSeparately] = useState(false);
  const cutDescribed = () => {
    const prompt = describe.trim();
    if (!prompt) return;
    void job(`Cutting out ${prompt}`, "cutout", { prompt, each: separately, ...(isVideo ? { still: Math.round(t * 100) / 100 } : {}) });
  };

  const job = async (what: string, action: string, body: object) => {
    setError("");
    setMade([]);
    setBusy({ what, progress: 0 });
    try {
      const out = await runJob(`/api/projects/${projectId}/${action}`, { asset: a.id, ...body }, (p) => setBusy({ what, progress: p }));
      if (action === "cutout" && out) setMade(out.split(","));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  // Someone who leaves the frame and comes back is two tracks; joining them keeps the first's name, and effects follow.
  const join = async (keep: string, other: string) => {
    setError("");
    const res = await fetch(`/api/projects/${projectId}/subjects/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: a.id, keep, others: [other] }) });
    if (!res.ok) setError(((await res.json()) as { error?: string }).error ?? "Couldn't join them");
  };
  const rename = (id: string, label: string) => actions.edit((d) => void (d.assets.find((x) => x.id === a.id)!.subjects!.find((s) => s.id === id)!.label = label));
  const remove = (id: string) =>
    actions.edit((d) => {
      const asset = d.assets.find((x) => x.id === a.id)!;
      asset.subjects = asset.subjects!.filter((s) => s.id !== id);
      if (!asset.subjects.length) delete asset.subjects;
    });

  return (
    <div className="subject-tools">
      <h4>
        People &amp; things <span className="dim small">for effects that follow them</span>
      </h4>
      {subjects.length > 0 && (
        <ul className="subject-list">
          {subjects.map((s) => {
            const used = usesOf(doc, a.id, s.id);
            return (
              <li key={s.id} className={hover === s.id ? "hot" : ""} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}>
                <span className={`glyph k-${s.kind}`} title={s.kind}>
                  {KIND_GLYPH[s.kind]}
                </span>
                <TextField value={s.label} onCommit={(v) => v.trim() && rename(s.id, v.trim())} />
                {isVideo && (
                  <button className="link small mono" onClick={() => seek(s.samples[0]?.[0] ?? 0)} title="Jump to where it's first seen">
                    {span(s)}
                  </button>
                )}
                {isVideo && (
                  <button className="link small" disabled={!!busy} onClick={() => void job(`Cutting out ${s.label}`, "cutout", { subject: s.id })} title="A transparent clip of just them">
                    Cut out
                  </button>
                )}
                {isVideo && subjects.some((o) => o.id !== s.id && o.kind === s.kind) && (
                  <select
                    className="same-as"
                    value=""
                    title="The same person or thing, seen again later: join them into one"
                    onChange={(e) => e.target.value && void join(e.target.value, s.id)}
                  >
                    <option value="">⇄ Same as…</option>
                    {subjects
                      .filter((o) => o.id !== s.id && o.kind === s.kind)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                  </select>
                )}
                <button className="link danger small" disabled={used.length > 0} title={used.length ? `Used by ${used.join(", ")}` : "Remove"} onClick={() => remove(s.id)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="subject-actions">
        <button disabled={!!busy} onClick={() => void job("Finding faces and people", "subjects", {})}>
          {subjects.some((s) => s.by === "apple-vision") ? "Find again" : "Find faces & people"}
        </button>
        {isVideo && (
          <button className={boxing ? "on" : ""} disabled={!!busy} onClick={() => setBoxing(!boxing)} title="Drag a box around something on the clip to follow it">
            {boxing ? "Drag on the clip…" : "Box something"}
          </button>
        )}
      </div>
      <div className="subject-actions">
        <span className="dim small">Cut out:</span>
        {a.kind === "image" ? (
          <>
            <button className="link small" disabled={!!busy} onClick={() => void job("Cutting out everyone", "cutout", { mode: "people" })}>
              Everyone
            </button>
            <button className="link small" disabled={!!busy} onClick={() => void job("Cutting out each person", "cutout", { mode: "people", each: true })}>
              Each person
            </button>
            <button className="link small" disabled={!!busy} onClick={() => void job("Cutting out the subject", "cutout", { mode: "subject" })}>
              Main subject
            </button>
          </>
        ) : (
          <>
            <button className="link small" disabled={!!busy} onClick={() => void job("Cutting out everyone", "cutout", { mode: "people" })} title="A transparent clip of the people (up to 30 seconds)">
              Everyone
            </button>
            <button className="link small" disabled={!!busy} onClick={() => void job("Freezing a cut-out", "cutout", { mode: "people", each: true, still: Math.round(t * 100) / 100 })} title="Each person at this moment, as stills">
              Each person at {formatTime(t)}
            </button>
          </>
        )}
      </div>
      {canDescribe && (
        <div className="subject-actions describe">
          <input
            placeholder={isVideo ? `Or describe it, at ${formatTime(t)}: the dog…` : "Or describe it: the dog, the kids…"}
            value={describe}
            onChange={(e) => setDescribe(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && cutDescribed()}
          />
          <label className="small" title="One cut-out for each match, largest first: pieces to pop in one by one">
            <input type="checkbox" checked={separately} onChange={(e) => setSeparately(e.target.checked)} /> Each
          </label>
          <button disabled={!!busy || !describe.trim()} onClick={cutDescribed}>
            Cut out
          </button>
        </div>
      )}
      {busy && (
        <div className="subject-busy">
          <span className="small">{busy.what}…</span>
          <div className="progress thin">
            <div style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        </div>
      )}
      {error && <p className="warn small">{error}</p>}
      {made.length > 0 && (
        <p className="small">
          Made{" "}
          {made.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <button className="link small" onClick={() => actions.select({ kind: "asset", id })}>
                {id}
              </button>
            </span>
          ))}
          . They line up over this file when both are on screen.
        </p>
      )}
    </div>
  );
}

/** After a box is drawn on a clip: what is it? Then it's followed through the clip. */
export function BoxLabel({ onDone }: { onDone: (label: string) => void }) {
  const [label, setLabel] = useState("");
  return (
    <div className="moment-draft">
      <input
        autoFocus
        value={label}
        placeholder="What is it? (Enter to follow it)"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(label.trim());
          if (e.key === "Escape") onDone("");
        }}
      />
      <button className="link small" onClick={() => onDone("")}>
        Cancel
      </button>
    </div>
  );
}

export async function followBox(projectId: string, assetId: string, at: number, box: Rect, label: string, onProgress?: (p: number) => void) {
  return runJob(`/api/projects/${projectId}/track`, { asset: assetId, at, box, label }, onProgress);
}

const LOOK_OPTIONS = ["", "mono", "mono-dim", "dim", "blur", "warm", "cool", "faded"];
const ENTRANCE_OPTIONS = ["", "pop", "fade", "slide-up", "zoom", "whip", "flash", "wipe", "glitch", "blur", "slam"];
const EFFECT_LABEL: Record<ClipEffect["kind"], string> = { blur: "Blur", label: "Name tag", spotlight: "Spotlight" };

/**
 * A shot's look and motion: how it comes in, and for a clip its look, a crop that keeps someone in frame, and effects
 * that follow a subject.
 */
export function ShotLook({ shot }: { shot: Shot }) {
  const p = useProject();
  const format = useStore((s) => s.format);
  const editShot = (fn: (s: Shot) => void) => actions.edit((d) => fn(d.shots.find((s) => s.id === shot.id)!));
  const c = shot.content;
  const a = c.kind === "clip" ? p.assets.find((x) => x.id === c.asset) : undefined;
  const subjects = a?.subjects ?? [];
  const [adding, setAdding] = useState<ClipEffect["kind"] | null>(null);
  const fmt = p.formats.find((f) => f.id === format);
  const reframe = c.kind === "clip" ? c.reframe?.[format] : undefined;

  return (
    <div className="shot-look">
      <h4>Look &amp; motion</h4>
      <div className="look-row">
        <label>
          Comes in
          <select
            value={shot.transition?.kind ?? ""}
            onChange={(e) => editShot((s) => void (e.target.value ? (s.transition = { ...s.transition, kind: e.target.value }) : delete s.transition))}
          >
            {ENTRANCE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o ? o[0]!.toUpperCase() + o.slice(1).replace("-", " ") : "Cut"}
              </option>
            ))}
          </select>
        </label>
        <MotionSelect shot={shot} />
        {c.kind === "clip" && (
          <label>
            Look
            <select value={c.look ?? ""} onChange={(e) => editShot((s) => s.content.kind === "clip" && void (e.target.value ? (s.content.look = e.target.value) : delete s.content.look))}>
              {LOOK_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o || "As shot"}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {c.kind === "clip" && a && !a.cutout && (
        <>
          {subjects.length === 0 ? (
            <p className="dim small">
              Find the people in{" "}
              <button className="link small" onClick={() => actions.select({ kind: "asset", id: a.id })}>
                {a.label ?? a.id}
              </button>{" "}
              to blur a face, add a name tag that follows someone, or keep them in a {fmt?.label ?? format} crop.
            </p>
          ) : (
            <>
              <label className="follow-row">
                Keep in frame ({fmt?.label ?? format})
                <select
                  value={reframe?.follow ?? ""}
                  onChange={(e) =>
                    editShot((s) => {
                      if (s.content.kind !== "clip") return;
                      const r = s.content.reframe?.[format] ?? { x: 0.5, y: 0.5, zoom: 1 };
                      if (e.target.value) r.follow = e.target.value;
                      else delete r.follow;
                      s.content.reframe = { ...s.content.reframe, [format]: r };
                    })
                  }
                >
                  <option value="">Fixed crop</option>
                  {subjects.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              {(c.effects ?? []).map((e, i) => (
                <div key={i} className="effect-row">
                  <span className="pill">{EFFECT_LABEL[e.kind]}</span>
                  <span className="small">{subjects.find((x) => x.id === e.subject)?.label ?? <span className="warn">missing {e.subject}</span>}</span>
                  {e.kind === "label" && (
                    <TextField value={e.text} onCommit={(v) => editShot((s) => s.content.kind === "clip" && void ((s.content.effects![i] as Extract<ClipEffect, { kind: "label" }>).text = v))} />
                  )}
                  <span className="spacer" />
                  <button className="link danger small" onClick={() => editShot((s) => s.content.kind === "clip" && void (s.content.effects = s.content.effects!.filter((_, j) => j !== i)))}>
                    ✕
                  </button>
                </div>
              ))}
              {adding ? (
                <div className="effect-row">
                  <span className="pill">{EFFECT_LABEL[adding]}</span>
                  <select
                    autoFocus
                    defaultValue=""
                    onChange={(e) => {
                      const subject = e.target.value;
                      if (!subject) return;
                      const label = subjects.find((x) => x.id === subject)?.label ?? "";
                      const effect: ClipEffect = adding === "label" ? { kind: "label", subject, text: /^(Face|Person) \d+$/.test(label) ? "Name" : label } : { kind: adding, subject };
                      editShot((s) => s.content.kind === "clip" && void (s.content.effects = [...(s.content.effects ?? []), effect]));
                      setAdding(null);
                    }}
                  >
                    <option value="">Who?</option>
                    {subjects.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                  <button className="link small" onClick={() => setAdding(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="subject-actions">
                  <button className="link small" onClick={() => setAdding("blur")}>
                    + Blur
                  </button>
                  <button className="link small" onClick={() => setAdding("label")}>
                    + Name tag
                  </button>
                  <button className="link small" onClick={() => setAdding("spotlight")}>
                    + Spotlight
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
