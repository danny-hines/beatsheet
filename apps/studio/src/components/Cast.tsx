/**
 * Cast and sets: the characters, places, props and styles made shots keep the same from shot to shot. They're listed
 * at the top of the Library. Right-click a photo to make one from it or add it to one; select one to name it,
 * describe it and make its sheet (clean views that models are given to match).
 */
import type { Asset, CastMember } from "@beatsheet/schema";
import { useState } from "react";
import { hideBroken, posterUrl } from "../lib";
import { actions, useProject, useStore } from "../store";
import { money, useChoices, useMake, WhyNot } from "./Takes";
import { PopMenu, TextField } from "./ui";

type Kind = CastMember["kind"];
const KINDS: [Kind, string][] = [
  ["character", "Character"],
  ["place", "Set"],
  ["prop", "Prop"],
  ["style", "Style"],
];
const WORD: Record<Kind, string> = { character: "character", place: "set", prop: "prop", style: "style" };
/** What a description of each kind looks like: the specifics a model can draw. */
const ABOUT_EXAMPLE: Record<Kind, string> = {
  character: "Woman in her forties, short curly gray hair, round tortoiseshell glasses, mustard cardigan, warm crooked smile",
  place: "Narrow alley, wet brick, steam from a grate, one neon sign",
  prop: "Battered brass pocket watch, cracked face, initials engraved on the lid",
  style: "Hand-drawn 2D animation, clean ink lines, flat colors, soft shading",
};

/** A cast id from a name that no other member has: "Mochi the cat" is mochi-the-cat. */
const castIdFor = (name: string, taken: string[], fallback: string) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || fallback;
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};
/** The id a member gets before it has a name; naming it gives it one from the name. */
const UNNAMED = /^(character|place|prop|style)(-\d+)?$/;

/** Makes a cast member (from a picture, when there's one) and selects it, so its name can be typed straight away. */
function newMember(kind: Kind, from?: Asset) {
  let id = "";
  actions.edit((d) => {
    const cast = (d.cast ??= []);
    id = castIdFor("", cast.map((m) => m.id), kind);
    cast.push({ id, name: "", kind, ...(from ? { seen: [{ asset: from.id }] } : {}) });
  });
  actions.select({ kind: "cast", id });
}

/** Adds a picture to where a cast member is seen. */
function addTo(id: string, a: Asset) {
  actions.edit((d) => {
    const m = d.cast?.find((x) => x.id === id);
    if (m && !m.seen?.some((s) => s.asset === a.id)) m.seen = [...(m.seen ?? []), { asset: a.id }];
  });
}

const label = (m: CastMember) => m.name || `Unnamed ${WORD[m.kind]}`;

/** Styles to start from: picking one adds it to the cast as a style, which can then be described further. */
const STYLE_PRESETS: { id: string; name: string; about: string }[] = [
  { id: "photographic", name: "Photographic", about: "photographed, realistic, natural light, real textures" },
  { id: "hand-drawn", name: "Hand-drawn", about: "hand-drawn 2D animation, clean ink lines, flat colors, soft shading" },
  { id: "animated-3d", name: "3D animated", about: "3D animated feature film, soft global illumination, rounded stylized shapes" },
  { id: "stop-motion", name: "Stop-motion", about: "stop-motion clay animation, handmade miniature sets, visible fingerprints" },
  { id: "watercolor", name: "Watercolor", about: "watercolor illustration, soft washes, paper texture, loose edges" },
  { id: "comic", name: "Comic book", about: "comic book art, bold ink outlines, halftone shading, strong flat colors" },
  { id: "noir", name: "Film noir", about: "black and white film noir, hard shadows, high contrast, wet streets" },
];

/**
 * Picks a style: one already in the cast, or a preset (added to the cast as it's picked), or none, which means the
 * one it falls back to (`fallback` says which).
 */
export function StyleSelect({ value, onChange, fallback }: { value?: string; onChange: (id: string | undefined) => void; fallback: string }) {
  const p = useProject();
  const styles = (p.cast ?? []).filter((m) => m.kind === "style");
  const presets = STYLE_PRESETS.filter((s) => !styles.some((m) => m.id === s.id));
  const pick = (id: string) => {
    if (!id) return onChange(undefined);
    const preset = STYLE_PRESETS.find((s) => s.id === id);
    if (preset && !styles.some((m) => m.id === id)) actions.edit((d) => void (d.cast ??= []).push({ id: preset.id, name: preset.name, kind: "style", about: preset.about }));
    onChange(id);
  };
  return (
    <select value={value ?? ""} onChange={(e) => pick(e.target.value)} aria-label="Style">
      <option value="">{fallback}</option>
      {styles.map((m) => (
        <option key={m.id} value={m.id}>
          {label(m)}
        </option>
      ))}
      {presets.length > 0 && (
        <optgroup label="Add a style">
          {presets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** What a style setting falls back to: the look's style, else photographs. */
export function lookStyleName(p: { cast?: CastMember[]; look?: { style?: string } }): string {
  const m = p.look?.style ? p.cast?.find((x) => x.id === p.look!.style) : undefined;
  return m ? label(m) : "Photographic";
}

/** The cast and sets, at the top of the Library: each one's main picture, name and @id. */
export function CastList() {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const selection = useStore((s) => s.selection);
  const [adding, setAdding] = useState<{ x: number; y: number }>();
  const cast = p.cast ?? [];
  return (
    <div className="cast-list">
      <div className="library-group dim small cast-head">
        Cast &amp; sets
        <button className="link small" onClick={(e) => setAdding({ x: e.clientX, y: e.clientY })} title="A character, set, prop or style, from a description">
          + New
        </button>
      </div>
      {cast.map((m) => {
        const pic = m.images?.[0] ?? m.seen?.find((s) => p.assets.find((a) => a.id === s.asset)?.kind === "image")?.asset;
        return (
          <button key={m.id} className={`asset-row cast-row ${selection?.kind === "cast" && selection.id === m.id ? "sel" : ""}`} onClick={() => actions.select({ kind: "cast", id: m.id })}>
            <span className="asset-row-thumb">
              {pic ? <img src={posterUrl(projectId, pic)} loading="lazy" alt="" onError={hideBroken} /> : <span className="asset-row-note">{label(m)[0]!.toUpperCase()}</span>}
            </span>
            <span className="asset-row-body">
              <span className={`asset-row-label ${m.name ? "" : "dim"}`}>{label(m)}</span>
              <span className="asset-row-meta small">
                <span className="mono">@{m.id}</span>
                <span className="tag">{WORD[m.kind]}</span>
                {!m.images?.length && <span className="dim">no sheet</span>}
              </span>
            </span>
          </button>
        );
      })}
      {!cast.length && <p className="dim small library-empty">Right-click a photo to make a character or a set from it.</p>}
      {adding && (
        <PopMenu {...adding} onClose={() => setAdding(undefined)}>
          {KINDS.map(([k, name]) => (
            <button
              key={k}
              role="menuitem"
              onClick={() => {
                setAdding(undefined);
                newMember(k);
              }}
            >
              {name}
            </button>
          ))}
        </PopMenu>
      )}
    </div>
  );
}

/** A Library item's right-click menu: make a cast member or a set from a photo, or add it to one. */
export function AssetMenu({ a, x, y, onClose }: { a: Asset; x: number; y: number; onClose: () => void }) {
  const p = useProject();
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const photo = a.kind === "image";
  return (
    <PopMenu x={x} y={y} onClose={onClose}>
      {photo && (
        <>
          <button role="menuitem" onClick={pick(() => newMember("character", a))}>
            Make a character from this
          </button>
          <button role="menuitem" onClick={pick(() => newMember("place", a))}>
            Make a set from this
          </button>
          <button role="menuitem" onClick={pick(() => newMember("prop", a))}>
            Make a prop from this
          </button>
          {!!p.cast?.length && <hr />}
          {p.cast?.map((m) => (
            <button key={m.id} role="menuitem" disabled={m.seen?.some((s) => s.asset === a.id)} onClick={pick(() => addTo(m.id, a))}>
              Add to {label(m)} <span className="dim mono">@{m.id}</span>
            </button>
          ))}
          <hr />
        </>
      )}
      <button role="menuitem" onClick={pick(() => actions.noteOn({ kind: "asset", asset: a.id }, { x: x + 160, y: y - 20 }))}>
        Note about this…
      </button>
    </PopMenu>
  );
}

/** A cast member in Inspect: its name and @id, what it looks like, its pictures, and making its sheet. */
export function CastView({ id }: { id: string }) {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const m = p.cast?.find((x) => x.id === id);
  const [count, setCount] = useState(2);
  const [sheetOf, setSheetOf] = useState("");
  const sheet = sheetOf || id;
  const { going, make, sending, error, failed } = useMake((j) => !!j.sheet && (j.sheet === id || j.sheet.startsWith(`${id}/`)), `sheet:${id}`);
  const { choices, problem } = useChoices({ op: "image", sheet, count });
  if (!m) return <p className="dim small">That cast member is gone.</p>;

  const edit = (fn: (m: CastMember) => void) => actions.edit((d) => fn(d.cast!.find((x) => x.id === id)!));
  // A member without a name of its own takes its id from the name it's given; a named one keeps its id, which
  // prompts already use.
  const rename = (name: string) => {
    const newId = UNNAMED.test(id) && name.trim() ? castIdFor(name, (p.cast ?? []).map((x) => x.id).filter((x) => x !== id), m.kind) : id;
    actions.edit((d) => {
      const x = d.cast!.find((c) => c.id === id)!;
      x.name = name.trim();
      x.id = newId;
    });
    if (newId !== id) actions.select({ kind: "cast", id: newId });
  };
  const remove = () => {
    actions.edit((d) => void (d.cast = d.cast!.filter((x) => x.id !== id)));
    actions.select(undefined);
  };
  const photos = (m.seen ?? []).map((s) => p.assets.find((a) => a.id === s.asset)).filter((a): a is Asset => !!a);
  const fromPhotos = !m.images?.length && photos.some((a) => a.kind === "image");

  return (
    <div className="inspector cast-view">
      <div className="insp-head">
        <span className="mono dim">@{m.id}</span>
        <span className="spacer" />
        <select value={m.kind} onChange={(e) => edit((x) => void (x.kind = e.target.value as Kind))} aria-label="Kind">
          {KINDS.map(([k, name]) => (
            <option key={k} value={k}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <TextField value={m.name} placeholder={`Name this ${WORD[m.kind]}`} autoFocus={!m.name} onCommit={rename} />
      <label>
        {m.kind === "style" ? "What it's like" : "What it looks like"}
        <TextField multiline value={m.about ?? ""} placeholder={ABOUT_EXAMPLE[m.kind]} onCommit={(v) => edit((x) => void (v.trim() ? (x.about = v.trim()) : delete x.about))} />
      </label>
      {m.kind !== "style" && (
        <div className="insp-row">
          <span>Style</span>
          <StyleSelect value={m.style} fallback={`The project's: ${lookStyleName(p)}`} onChange={(s) => edit((x) => void (s ? (x.style = s) : delete x.style))} />
        </div>
      )}
      <p className="dim small">
        {m.kind === "style"
          ? `Shots are drawn in it when the project's look (or a cast member) names it; prompts can name it as @${m.id}.`
          : `Prompts name it as @${m.id}; it's described to the model and its first picture is given to match.`}
      </p>

      <h4>Pictures</h4>
      {m.images?.length || going.length ? (
        <div className="take-strip">
          {(m.images ?? []).map((a, i) => (
            <Picture key={a} projectId={projectId} id={a} main={i === 0} onMain={() => edit((x) => void (x.images = [a, ...x.images!.filter((y) => y !== a)]))} onRemove={() => edit((x) => void (x.images = x.images!.filter((y) => y !== a)))} />
          ))}
          {going.map((j) => (
            <div key={j.id} className="take pending" style={{ aspectRatio: "16 / 9" }}>
              {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
            </div>
          ))}
        </div>
      ) : (
        <p className="dim small">{fromPhotos ? "None yet: make a sheet from its photos below." : "None yet: make a sheet from its description, or add photos of it from the Library (right-click → Add to)."}</p>
      )}
      <div className="make-row">
        {!!m.variants?.length && (
          <select value={sheetOf} onChange={(e) => setSheetOf(e.target.value)} aria-label="Sheet for">
            <option value="">{label(m)}</option>
            {m.variants.map((v) => (
              <option key={v.id} value={`${id}/${v.id}`}>
                {v.id}
              </option>
            ))}
          </select>
        )}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many">
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button className="primary" disabled={!choices?.auto || sending || (!m.about && !fromPhotos && !m.images?.length)} onClick={() => void make({ op: "image", sheet, count })}>
          Make {count === 1 ? "a sheet" : `${count} sheets`}
          {choices?.auto?.usd !== undefined ? ` · ${money(choices.auto.usd)}` : ""}
        </button>
      </div>
      <WhyNot choices={choices} />
      {(error || problem) && <p className="warn small">{error || problem}</p>}
      {failed && !error && <p className="warn small">A sheet didn't come: {failed.error}</p>}

      {photos.length > 0 && (
        <>
          <h4>Seen in</h4>
          <div className="take-strip">
            {photos.map((a) => (
              <Picture key={a.id} projectId={projectId} id={a.id} onRemove={() => edit((x) => void (x.seen = x.seen!.filter((s) => s.asset !== a.id)))} />
            ))}
          </div>
        </>
      )}

      <h4>Variants</h4>
      {m.variants?.map((v, i) => (
        <div key={v.id} className="variant-row">
          <span className="mono small">@{m.id}/{v.id}</span>
          <TextField value={v.about} placeholder="What's different: wearing a tiny black eye mask" onCommit={(t) => edit((x) => void (x.variants![i]!.about = t))} />
          <button className="link danger small" onClick={() => edit((x) => void (x.variants = x.variants!.filter((y) => y.id !== v.id)))} title="Remove this variant">
            ×
          </button>
        </div>
      ))}
      <VariantAdd taken={(m.variants ?? []).map((v) => v.id)} onAdd={(vid, about) => edit((x) => void (x.variants = [...(x.variants ?? []), { id: vid, about }]))} />

      <div className="make-row cast-remove">
        <button className="link danger small" onClick={remove}>
          Remove from the cast
        </button>
      </div>
    </div>
  );
}

/** A new variant: what's different, and a short id for it. */
function VariantAdd({ taken, onAdd }: { taken: string[]; onAdd: (id: string, about: string) => void }) {
  const [about, setAbout] = useState("");
  const add = () => {
    if (!about.trim()) return;
    onAdd(castIdFor(about.split(/[,;]/)[0]!.replace(/^(wearing|in|with|at) (a |an |the )?/i, ""), taken, "variant"), about.trim());
    setAbout("");
  };
  return (
    <div className="make-row">
      <input value={about} placeholder="Another outfit or state: soaked from the rain" onChange={(e) => setAbout(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="New variant" />
      <button disabled={!about.trim()} onClick={add}>
        Add
      </button>
    </div>
  );
}

/** One of a cast member's pictures: the main one outlined; click another to make it the main one. */
function Picture({ projectId, id, main, onMain, onRemove }: { projectId: string; id: string; main?: boolean; onMain?: () => void; onRemove: () => void }) {
  return (
    <span className="cast-pic">
      <button className={`take ${main ? "on" : ""}`} onClick={onMain} disabled={!onMain} title={main ? `${id}: the one models get` : onMain ? `${id}: make this the one models get` : id}>
        <img src={posterUrl(projectId, id)} alt="" onError={hideBroken} />
      </button>
      <button className="cast-pic-remove" onClick={onRemove} title="Take this picture out" aria-label="Take this picture out">
        ×
      </button>
    </span>
  );
}
