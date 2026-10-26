import { cutView, FORMAT_PRESETS, formatPreset, resolveTimeline, type Cut, type CutSpec, type Format } from "@beatsheet/schema";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AGENT_NAMES, keys } from "../lib";
import { actions, useStore } from "../store";
import { answer } from "./Turn";

/** The cut on screen and the project's other cuts: switch between them, rename or delete one, or make a new one. */
export function CutMenu() {
  const doc = useStore((s) => s.doc);
  const cutId = useStore((s) => s.cutId);
  const [open, setOpen] = useState(false);
  const [making, setMaking] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onNew = () => setMaking(true);
    window.addEventListener("beatsheet:new-cut", onNew);
    return () => window.removeEventListener("beatsheet:new-cut", onNew);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  if (!doc) return null;
  const current = doc.cuts.find((c) => c.id === cutId) ?? doc.cuts[0]!;
  return (
    <div className="cut-menu" ref={ref}>
      <button className="cut-button" onClick={() => setOpen(!open)} title="Cuts: versions of this video, each with its own length, formats, music and shots">
        <span className="cut-button-name">{current.name}</span>
        {doc.cuts.length > 1 && <span className="dim small">{doc.cuts.length} cuts</span>}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="cut-panel">
          <p className="dim small">Versions of this video. They share the footage and the brief; each has its own length, formats, music, shots and notes.</p>
          {doc.cuts.map((c) => (
            <CutRow
              key={c.id}
              c={c}
              on={c.id === current.id}
              only={doc.cuts.length === 1}
              onPick={() => {
                actions.setCut(c.id);
                setOpen(false);
              }}
            />
          ))}
          <button
            className="cut-new"
            onClick={() => {
              setOpen(false);
              setMaking(true);
            }}
          >
            + New cut…<span className="dim small">{keys("⇧⌘N")}</span>
          </button>
        </div>
      )}
      {making && <NewCutDialog from={current.id} onClose={() => setMaking(false)} />}
    </div>
  );
}

/** One cut in the menu: its name, how long it runs, its formats, who made it. Rename and delete are on hover. */
function CutRow({ c, on, only, onPick }: { c: Cut; on: boolean; only: boolean; onPick: () => void }) {
  const doc = useStore((s) => s.doc)!;
  const [name, setName] = useState<string>();
  const length = useMemo(() => {
    const view = cutView(doc, c.id);
    return resolveTimeline(view, view.formats[0]!.id).duration;
  }, [doc, c.id]);
  const facts = [length > 0 ? clock(length) : "Empty", c.formats.map((f) => f.label).join(" · "), c.origin?.by === "agent" ? "by the agent" : ""].filter(Boolean).join(" · ");
  const commit = () => {
    if (name !== undefined && name.trim() && name.trim() !== c.name) actions.renameCut(c.id, name);
    setName(undefined);
  };
  const remove = () => {
    if (window.confirm(`Delete the cut “${c.name}”? Its shots and notes go with it; ${keys("⌘Z")} brings it back.`)) actions.deleteCut(c.id);
  };
  return (
    <div className={`cut-row ${on ? "on" : ""}`}>
      {name !== undefined ? (
        <input
          className="cut-rename"
          autoFocus
          value={name}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setName(undefined);
          }}
        />
      ) : (
        <button className="cut-row-main" onClick={onPick} title={c.spec.purpose ?? c.origin?.note}>
          <span className="cut-check">{on ? "✓" : ""}</span>
          <span className="cut-row-text">
            <span className="cut-row-name">{c.name}</span>
            <span className="dim small">{facts}</span>
          </span>
        </button>
      )}
      {name === undefined && (
        <span className="cut-row-actions">
          <button className="icon" title="Rename" aria-label={`Rename ${c.name}`} onClick={() => setName(c.name)}>
            ✎
          </button>
          {!only && (
            <button className="icon" title="Delete this cut" aria-label={`Delete ${c.name}`} onClick={remove}>
              ×
            </button>
          )}
        </span>
      )}
    </div>
  );
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const span = (s: number) => (s < 60 ? `${s}s` : s % 60 ? clock(s) : `${s / 60} min`);

/**
 * A new cut. Most start fresh: a blank slate the agent builds again from the footage, choosing the clips, story and
 * music for this cut's own goal, audience and shape (another roll of the dice at the same length, or a long landscape
 * version, a vertical teaser). A variation starts as a copy of a cut, keeping its length and shape, and changes from
 * there: funnier, slower, another song. Either way the new cut gets a conversation of its own.
 */
function NewCutDialog({ from: initial, onClose }: { from: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc)!;
  const projectId = useStore((s) => s.projectId);
  const agent = useStore((s) => s.agent);
  const preferred = useStore((s) => s.setup?.settings.agent?.id);
  // The session on this project if there is one, else the agent new sessions start with.
  const who = agent.project === projectId && agent.status !== "off" && agent.status !== "error" ? agent.agent : preferred;
  const current = doc.cuts.find((c) => c.id === initial) ?? doc.cuts[0]!;
  const shapes = presetsOf(current.formats);
  const [mode, setMode] = useState<"fresh" | "variation">("fresh");
  const [name, setName] = useState("");
  const [aim, setAim] = useState("");
  const [formats, setFormats] = useState<string[]>(shapes);
  const [length, setLength] = useState(current.spec.targetLength ? String(current.spec.targetLength) : "30");
  const [from, setFrom] = useState(initial);
  const [agentDoes, setAgentDoes] = useState(!!who);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const fresh = mode === "fresh";
  const source = fresh ? current : (doc.cuts.find((c) => c.id === from) ?? current);
  const seconds = Number(length) > 0 ? Number(length) : (current.spec.targetLength ?? 30);
  const sameShape = formats.length === shapes.length && formats.every((f) => shapes.includes(f));
  const same = sameShape && seconds === (current.spec.targetLength ?? 30);
  const songs = doc.assets.filter((a) => a.kind === "music");
  // The new cut gets a conversation of its own, which would cut off one that's working.
  const busy = agent.status === "running" || agent.status === "starting";
  const busyOn = busy ? (agent.project === projectId ? `"${doc.cuts.find((c) => c.id === agent.cut)?.name ?? "another cut"}"` : "another project") : undefined;
  const rework = agentDoes && !!who && !busy;
  // A different shape or length names itself ("16:9 · 2 min"); otherwise the first words of what to aim for, or a take.
  const fallback = unique(
    doc,
    fresh && !same
      ? `${formats.map((f) => FORMAT_PRESETS.find((p) => p.id === f)!.label).join(" + ")} · ${span(seconds)}`
      : (words(aim) ?? (fresh ? `Take ${doc.cuts.length + 1}` : `${source.name}, take ${doc.cuts.length + 1}`)),
  );

  const make = () => {
    const called = name.trim() || fallback;
    const note = aim.trim() || undefined;
    if (fresh) {
      // Another roll of the dice keeps what the cut is for; a new shape or length is a new cut to think through.
      const spec: CutSpec = {
        purpose: same ? source.spec.purpose : undefined,
        audience: same ? source.spec.audience : undefined,
        tone: same ? source.spec.tone : undefined,
        targetLength: seconds,
        maxLength: same ? source.spec.maxLength : undefined,
      };
      const picked = sameShape ? structuredClone(source.formats) : formats.map((f) => formatPreset(f)!);
      spec.platforms = sameShape ? source.spec.platforms : [...new Set(picked.flatMap((f) => f.platforms ?? []))];
      const id = actions.freshCut(called, { formats: picked, spec, note });
      onClose();
      if (!id || !rework) return;
      const shape = picked.map((f) => f.label).join(" and ");
      const music = songs.length
        ? ` The project already has ${songs.length === 1 ? "a song" : "songs"} (${songs.map((a) => `"${a.label ?? a.id}" (${a.id})`).join(", ")}): use one only if it suits this cut, otherwise ask me for one.`
        : " The project has no song yet; ask me for one if this cut needs music.";
      void answer({
        text:
          `I made a new cut, "${called}" (cut ${id}): ${shape}, about ${span(seconds)}. It's a blank slate.` +
          (note ? ` What it's for: ${note}.` : "") +
          ` Read the brief and this cut's spec, then decide afresh what this cut needs for its own goal, audience and shape: which footage fits it best (go back to the logs, and to the clips themselves where it matters), the story and pacing, and the music.` +
          ` Don't adapt the other cuts or reuse their shots or song by default, and leave them as they are.${music}` +
          ` If what this cut is for isn't clear, hand_off with 2–3 directions for it first; otherwise build it and hand it back for me to watch.`,
      });
      return;
    }
    const id = actions.branchCut(called, { from: source.id, note });
    onClose();
    if (!id || !rework) return;
    void answer({
      text:
        `I made a new cut, "${called}" (cut ${id}), as a copy of "${source.name}" (cut ${source.id}). ` +
        (note ? `Change it: ${note}. ` : "Make it a different take on the same idea. ") +
        `Keep its length and formats, leave "${source.name}" as it is, and hand the new one back for me to watch.`,
    });
  };

  // Drawn at the top of the page: inside the Mac app's top bar (the window's drag handle) its fields couldn't be clicked.
  return createPortal(
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal new-cut"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          make();
        }}
      >
        <h3>New cut</h3>
        <div className="np-routes new-cut-modes">
          <button type="button" className={`np-route ${fresh ? "on" : ""}`} onClick={() => setMode("fresh")}>
            <strong>Fresh start</strong>
            <span className="dim small">A blank slate: footage, story and music chosen again for this cut's own goal and shape. Keep the shape and length for another roll of the dice, or change them.</span>
          </button>
          <button type="button" className={`np-route ${fresh ? "" : "on"}`} onClick={() => setMode("variation")}>
            <strong>Variation</strong>
            <span className="dim small">A copy of a cut with the same shape and length, changed from there: funnier, slower, another song.</span>
          </button>
        </div>
        <div className="form">
          {fresh ? (
            <>
              <div className="field">
                <span className="field-label">Shape</span>
                <div className="format-choices">
                  {FORMAT_PRESETS.map((f) => (
                    <button
                      type="button"
                      key={f.id}
                      className={`format-choice ${formats.includes(f.id) ? "on" : ""}`}
                      onClick={() => setFormats(formats.includes(f.id) ? formats.filter((x) => x !== f.id) : [...formats, f.id])}
                    >
                      <span className="format-shape" style={{ aspectRatio: `${f.width} / ${f.height}` }} />
                      <span>
                        <strong>{f.label}</strong>
                        <span className="dim small">{f.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label>
                Length
                <span className="new-cut-length">
                  <input type="number" min={1} step={1} value={length} onChange={(e) => setLength(e.target.value)} />
                  seconds
                </span>
              </label>
              <label>
                <span>Anything to aim for <span className="dim">(optional)</span></span>
                <input value={aim} placeholder="e.g. Calmer, for YouTube; open on the sunset" onChange={(e) => setAim(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label>
                Variation of
                <select value={source.id} onChange={(e) => setFrom(e.target.value)}>
                  {doc.cuts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                What to change
                <input autoFocus value={aim} placeholder="e.g. More playful, faster cuts, try another song" onChange={(e) => setAim(e.target.value)} />
              </label>
            </>
          )}
          <label>
            <span>Name <span className="dim">(optional)</span></span>
            <input value={name} placeholder={fallback} onChange={(e) => setName(e.target.value)} />
          </label>
          {who && busyOn ? (
            <p className="dim small">
              {AGENT_NAMES[who]} is still working on {busyOn}, so {fresh ? "you get an empty cut" : "you get the copy"}. Ask it here once it hands back; each cut has a conversation of its own.
            </p>
          ) : who ? (
            <label className="check">
              <input type="checkbox" checked={agentDoes} onChange={(e) => setAgentDoes(e.target.checked)} />
              <span>
                {fresh ? `Have ${AGENT_NAMES[who]} make it` : `Have ${AGENT_NAMES[who]} make the changes`}
                <span className="dim small"> · {agentDoes ? "in a new conversation for this cut; it hands the cut back for you to watch" : fresh ? "you get an empty cut to fill yourself" : "you get the copy to change yourself"}</span>
              </span>
            </label>
          ) : (
            <p className="dim small">
              {fresh ? "You get an empty cut to fill yourself." : "You get the copy to change yourself."} With an agent set up in Settings, it can {fresh ? "make the cut" : "make the changes"} for you.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={fresh && !formats.length}>
            {rework ? "Make it" : fresh ? "Make the cut" : "Make the copy"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** The presets matching a cut's formats by shape (a cut's own "land" is the 16:9 preset). */
const presetsOf = (formats: Format[]) => [...new Set(formats.flatMap((f) => FORMAT_PRESETS.filter((p) => Math.abs(p.width / p.height - f.width / f.height) < 0.01).map((p) => p.id)))];

/** A name from the first few words of what the person wrote: "more playful, faster cuts" → "More playful". */
function words(text: string): string | undefined {
  const first = (text.split(/[,.;:!?(]/)[0] ?? "").trim().split(/\s+/).slice(0, 4).join(" ");
  return first ? first[0]!.toUpperCase() + first.slice(1) : undefined;
}

/** `name`, or `name 2`, `name 3`… when a cut already has it. */
function unique(doc: { cuts: Cut[] }, name: string): string {
  let out = name;
  for (let n = 2; doc.cuts.some((c) => c.name === out); n++) out = `${name} ${n}`;
  return out;
}
