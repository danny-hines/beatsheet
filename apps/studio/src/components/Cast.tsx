/**
 * Cast and sets: the characters, places, props and styles made shots keep the same from shot to shot. They're listed
 * at the top of the Library. Right-click a photo to make one from it or add it to one; select one to name it,
 * describe it and make its sheet (clean views that models are given to match).
 */
import type { MakeJob } from "@beatsheet/engine";
import { PICTURES_EACH, renameCast, speakerLabel, type Asset, type CastMember } from "@beatsheet/schema";
import { useState, type HTMLAttributes } from "react";
import { hideBroken, posterUrl } from "../lib";
import { lineUp } from "../multicam";
import { actions, getState, setState, useProject, useStore } from "../store";
import { cost, Failed, fitLabel, fitOf, madeWith, modelLabel, money, useChoices, useMake, WhyNot } from "./Takes";
import { Viewer } from "./Viewer";
import { PopMenu, TextField } from "./ui";
import { VoicePicker } from "./Voices";

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

/** Makes a cast member (from pictures, when there are some) and selects it, so its name can be typed straight away. */
function newMember(kind: Kind, from: Asset[] = []) {
  let id = "";
  actions.edit((d) => {
    const cast = (d.cast ??= []);
    id = castIdFor("", cast.map((m) => m.id), kind);
    cast.push({ id, name: "", kind, ...(from.length ? { seen: from.map((a) => ({ asset: a.id })) } : {}) });
  });
  actions.select({ kind: "cast", id });
}

/** Adds pictures to where a cast member is seen. */
function addTo(id: string, as: Asset[]) {
  actions.edit((d) => {
    const m = d.cast?.find((x) => x.id === id);
    if (!m) return;
    for (const a of as) if (!m.seen?.some((s) => s.asset === a.id)) m.seen = [...(m.seen ?? []), { asset: a.id }];
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

/**
 * Asks the agent to look through the Library for who and what recurs and propose them as the cast (a cast hand-off,
 * where the person keeps the ones they want).
 */
async function findCast() {
  const { projectId, cutId } = getState();
  await actions.flushSave();
  const res = await fetch("/api/turn/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project: projectId,
      cut: cutId,
      text: "Find the cast in my photos and clips: who and what recurs (people, pets, places, things), grouped with the pictures each is in, as a cast hand-off so I can keep the ones I want. The make skill says how.",
    }),
  });
  if (!res.ok) {
    setState({ notice: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The agent didn't get that." });
    if (res.status === 409) actions.setSettingsOpen(true);
    return;
  }
  actions.setSide("agent");
}

/** The cast and sets, at the top of the Library: each one's main picture, name and @id. */
export function CastList() {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const selection = useStore((s) => s.selection);
  const [adding, setAdding] = useState<{ x: number; y: number }>();
  const cast = p.cast ?? [];
  // Enough of the person's own pictures that someone or somewhere could recur in them.
  const pictures = p.assets.filter((a) => (a.kind === "image" || a.kind === "video") && a.provenance?.source !== "generated").length;
  return (
    <div className="cast-list">
      <div className="library-group dim small cast-head">
        Cast &amp; sets
        <span className="spacer" />
        {pictures >= 3 && (
          <button className="link small" onClick={() => void findCast()} title="The agent looks through your photos and clips for who and what recurs, and you keep the ones you want">
            Find in my photos
          </button>
        )}
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
/** Right-click on a picture in the Library, or on several picked together: the cast made from them, or a note. */
export function AssetMenu({ as, x, y, onClose }: { as: Asset[]; x: number; y: number; onClose: () => void }) {
  const p = useProject();
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // A cast member is made from photos; clips picked with them are left out.
  const photos = as.filter((a) => a.kind === "image");
  const these = photos.length === 1 ? "this" : `these ${photos.length}`;
  const one = as.length === 1 ? as[0] : undefined;
  return (
    <PopMenu x={x} y={y} onClose={onClose}>
      {photos.length > 0 && (
        <>
          <button role="menuitem" onClick={pick(() => newMember("character", photos))}>
            Make a character from {these}
          </button>
          <button role="menuitem" onClick={pick(() => newMember("place", photos))}>
            Make a set from {these}
          </button>
          <button role="menuitem" onClick={pick(() => newMember("prop", photos))}>
            Make a prop from {these}
          </button>
          {!!p.cast?.length && <hr />}
          {p.cast
            ?.filter((m) => m.kind !== "style")
            .map((m) => (
              <button key={m.id} role="menuitem" disabled={photos.every((a) => m.seen?.some((s) => s.asset === a.id))} onClick={pick(() => addTo(m.id, photos))}>
                Add {photos.length === 1 ? "" : `these ${photos.length} `}to {label(m)} <span className="dim mono">@{m.id}</span>
              </button>
            ))}
          {one && <hr />}
        </>
      )}
      {as.filter((a) => a.kind === "video").length > 1 && (
        <>
          <button role="menuitem" onClick={pick(() => void lineUp(as.filter((a) => a.kind === "video")))} title="Several cameras on one event: lined up by their sound, so the cut can switch between them in step">
            Line up as angles of one event
          </button>
          <hr />
        </>
      )}
      {one && (
        <button role="menuitem" onClick={pick(() => actions.noteOn({ kind: "asset", asset: one.id }, { x: x + 160, y: y - 20 }))}>
          Note about this…
        </button>
      )}
      {!photos.length && !one && as.filter((a) => a.kind === "video").length < 2 && <p className="dim small menu-note">Pick photos to make a cast member from them.</p>}
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
  // The models sheets are made with: Auto's pick, until others are ticked to compare their sheets side by side.
  const [models, setModels] = useState<string[]>();
  // A character's portrait (the face, in whatever a costume puts on it) rather than its sheet.
  const [portraitAsked, setPortrait] = useState(false);
  const portrait = portraitAsked && m?.kind === "character";
  const sheet = sheetOf || id;
  const { going, make, sending, error, failed, retry } = useMake((j) => !!j.sheet && (j.sheet === id || j.sheet.startsWith(`${id}/`)), `sheet:${id}`);
  const goingFor = (target: string) => going.filter((j) => j.sheet === target);
  const { choices, problem } = useChoices({ op: "image", sheet, count, portrait: portrait ? 1 : undefined });
  const ready = choices?.ready ?? [];
  const picked = (models ?? (choices?.auto ? [choices.auto.model] : [])).filter((x) => ready.some((f) => f.model === x));
  const fits = picked.map((x) => fitOf(choices, x)!);
  const price = fits.length > 1 && fits.some((f) => f.usd) ? money(fits.reduce((sum, f) => sum + (f.usd ?? 0), 0)) : fits[0] ? cost(fits[0]) : "";
  const sheets = count * Math.max(1, picked.length);
  const tick = (model: string, on: boolean) => setModels(ready.map((f) => f.model).filter((x) => (x === model ? on : picked.includes(x))));
  const [describing, setDescribing] = useState("");
  if (!m) return <p className="dim small">That cast member is gone.</p>;
  // A vision model writes what it looks like from its pictures; the words land in the field, to edit.
  const describe = async () => {
    setDescribing("Looking…");
    const res = await fetch(`/api/projects/${projectId}/cast/${id}/describe`, { method: "POST" }).catch(() => undefined);
    const j = res ? ((await res.json()) as { about?: string; error?: string }) : { error: "Couldn't reach the engine" };
    if (j.about) {
      actions.edit((d) => void (d.cast!.find((x) => x.id === id)!.about = j.about));
      setDescribing("");
    } else setDescribing(j.error ?? "Couldn't describe it");
  };

  const edit = (fn: (m: CastMember) => void) => actions.edit((d) => fn(d.cast!.find((x) => x.id === id)!));
  // A sheet or a take still being made follows a rename, so it comes in as the renamed one's.
  const moveJobs = (from: string, to: string) =>
    void fetch(`/api/projects/${projectId}/jobs/rename`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, to }) }).catch(() => {});
  // A member without a name of its own takes its id from the name it's given; a named one keeps its id, which
  // prompts already use.
  const rename = (name: string) => {
    const newId = UNNAMED.test(id) && name.trim() ? castIdFor(name, (p.cast ?? []).map((x) => x.id).filter((x) => x !== id), m.kind) : id;
    actions.editFile((f) => {
      f.cast!.find((c) => c.id === id)!.name = name.trim();
      if (newId !== id) renameCast(f, id, newId);
    });
    if (newId !== id) {
      moveJobs(id, newId);
      actions.select({ kind: "cast", id: newId });
    }
  };
  // A new id on purpose: every prompt and shot that names the old one follows.
  const reId = (to: string) => {
    if (p.cast?.some((x) => x.id === to)) return `@${to} is taken`;
    actions.editFile((f) => void renameCast(f, id, to));
    moveJobs(id, to);
    actions.select({ kind: "cast", id: to });
  };
  const reIdVariant = (from: string) => (to: string) => {
    if (m.variants?.some((x) => x.id === to)) return `@${id}/${to} is taken`;
    actions.editFile((f) => void renameCast(f, `${id}/${from}`, to));
    moveJobs(`${id}/${from}`, to);
    if (sheetOf === `${id}/${from}`) setSheetOf(`${id}/${to}`);
  };
  const remove = () => {
    actions.edit((d) => void (d.cast = d.cast!.filter((x) => x.id !== id)));
    actions.select(undefined);
  };
  const photos = (m.seen ?? []).map((s) => p.assets.find((a) => a.id === s.asset)).filter((a): a is Asset => !!a);
  const fromPhotos = !m.images?.length && photos.some((a) => a.kind === "image");
  // Their own photos, which a portrait is made from (as the engine's ownPhotos picks them).
  const own = [...(m.images ?? []), ...(m.seen ?? []).map((s) => s.asset)]
    .map((a) => p.assets.find((x) => x.id === a))
    .some((a) => a?.kind === "image" && !a.cutout && ["import", "capture", "recorded", undefined].includes(a.provenance?.source));
  const noun = portrait ? "portrait" : "sheet";
  const target = sheetOf ? `@${sheetOf}` : label(m);

  return (
    <div className="inspector cast-view">
      <div className="insp-head">
        <IdField value={m.id} onRename={reId} />
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
      {(!!m.images?.length || photos.some((a) => a.kind === "image")) && (
        <p className="small">
          <button className="link small" disabled={describing === "Looking…"} onClick={() => void describe()} title="Gemini looks at its pictures and writes what it looks like">
            {describing === "Looking…" ? "Looking at its pictures…" : m.about ? "Describe it again from its pictures" : "Describe it from its pictures"}
          </button>
          {describing && describing !== "Looking…" && <span className="warn"> {describing}</span>}
        </p>
      )}
      {m.kind !== "style" && (
        <div className="insp-row">
          <span>Style</span>
          <StyleSelect value={m.style} fallback={`The project's: ${lookStyleName(p)}`} onChange={(s) => edit((x) => void (s ? (x.style = s) : delete x.style))} />
        </div>
      )}
      {m.kind === "character" && (
        <div className="insp-row" title="The lines it says (a line's Said by) are read in this voice">
          <span>Voice</span>
          <VoicePicker value={m.voice} onChange={(v) => edit((x) => void (v ? (x.voice = v) : delete x.voice))} unset="The narrator's" />
        </div>
      )}
      <p className="dim small">
        {m.kind === "style"
          ? `Shots are drawn in it when the project's look (or a cast member) names it; prompts can name it as @${m.id}.`
          : `Prompts name it as @${m.id}; it's described to the model and given its pictures to match.`}
      </p>

      <h4>Pictures</h4>
      {m.images?.length || goingFor(id).length ? (
        <Pictures projectId={projectId} ids={m.images ?? []} going={goingFor(id)} onChange={(images) => edit((x) => void (images.length ? (x.images = images) : delete x.images))} />
      ) : (
        <p className="dim small">{fromPhotos ? "None yet: make a sheet from its photos below." : "None yet: make a sheet from its description, or add photos of it from the Library (right-click → Add to)."}</p>
      )}
      <PicturesHint count={m.images?.length ?? 0} />
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
        {m.kind === "character" && (
          <select value={portrait ? "portrait" : "sheet"} onChange={(e) => setPortrait(e.target.value === "portrait")} aria-label="A sheet or a portrait">
            <option value="sheet">Sheet</option>
            <option value="portrait">Portrait</option>
          </select>
        )}
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label={picked.length > 1 ? "How many from each model" : "How many"}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          className="primary"
          disabled={!picked.length || sending || (!m.about && !fromPhotos && !m.images?.length)}
          onClick={() => {
            const ask = { op: "image" as const, sheet, count, ...(portrait ? { portrait: true } : {}) };
            void make(models ? picked.map((model) => ({ ...ask, model })) : ask);
          }}
        >
          Make {sheets === 1 ? `a ${noun}` : `${sheets} ${noun}s`}
          {picked.length > 1 ? ` from ${picked.length} models` : ""}
          {price ? ` · ${price}` : ""}
        </button>
      </div>
      {m.kind === "character" && (
        <p className="dim small">
          {portrait
            ? own
              ? `Head and shoulders of ${target}, from ${label(m)}'s own photos: to settle what a costume does to the face (a fake beard, a hat, makeup) before the sheet. Keep the one that still looks like them, right after their photo, then make the sheet.`
              : `Head and shoulders of ${target}, from its description: pick the face, then make the sheet from it.`
            : `A sheet of ${target}: the face once, close up, then the body from the front (cropped at the neck) and the back, so models aren't given several faces to choose between.`}
        </p>
      )}
      {ready.length > 1 && (
        <div className="sheet-models small" title="Sheets from several models at once, to compare side by side and keep the best">
          <span className="dim">Made with</span>
          {ready.map((f) => (
            <label key={f.model} className="check-row">
              <input type="checkbox" checked={picked.includes(f.model)} onChange={(e) => tick(f.model, e.target.checked)} />
              {fitLabel(f)}
            </label>
          ))}
        </div>
      )}
      <WhyNot choices={choices} />
      {(error || problem) && <p className="warn small">{error || problem}</p>}
      {failed && !error && <Failed job={failed} what={failed.portrait ? "A portrait" : "A sheet"} retry={(j) => void retry(j)} />}

      {photos.length > 0 && (
        <>
          <h4>Seen in</h4>
          <Pictures projectId={projectId} ids={photos.map((a) => a.id)} unranked onChange={(ids) => edit((x) => void (x.seen = x.seen!.filter((s) => ids.includes(s.asset))))} />
        </>
      )}

      {!!m.heard?.length && (
        <>
          <h4>Heard in</h4>
          <ul className="heard-list small">
            {m.heard.map((h) => {
              const a = p.assets.find((x) => x.id === h.asset);
              return (
                <li key={`${h.asset}-${h.speaker}`}>
                  <button className="link small" onClick={() => actions.select({ kind: "asset", id: h.asset })} title="Show the clip and what's said in it">
                    {a?.label ?? h.asset}
                  </button>
                  <span className="dim"> · {speakerLabel(h.speaker)}</span>
                  <button className="link danger small" onClick={() => edit((x) => void (x.heard = x.heard!.filter((y) => !(y.asset === h.asset && y.speaker === h.speaker))))} title="That isn't them">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h4>Variants</h4>
      {m.variants?.map((v, i) => {
        const target = `${id}/${v.id}`;
        return (
          <div key={v.id} className="variant">
            <div className="variant-row">
              <IdField prefix={`${m.id}/`} value={v.id} onRename={reIdVariant(v.id)} />
              <span className="spacer" />
              <button className="link danger small" onClick={() => edit((x) => void (x.variants = x.variants!.filter((y) => y.id !== v.id)))} title="Remove this variant">
                ×
              </button>
            </div>
            <TextField multiline value={v.about} placeholder="What's different: wearing a tiny black eye mask" onCommit={(t) => edit((x) => void (x.variants![i]!.about = t))} />
            {v.images?.length || goingFor(target).length ? (
              <>
                <Pictures projectId={projectId} ids={v.images ?? []} going={goingFor(target)} onChange={(images) => edit((x) => void (images.length ? (x.variants![i]!.images = images) : delete x.variants![i]!.images))} />
                <PicturesHint count={v.images?.length ?? 0} />
              </>
            ) : (
              <p className="dim small">
                No pictures of its own yet, so models get {label(m)}'s pictures with this description.{" "}
                <button className="link small" onClick={() => setSheetOf(target)}>
                  Make sheets of it
                </button>
              </p>
            )}
          </div>
        );
      })}
      <VariantAdd taken={(m.variants ?? []).map((v) => v.id)} onAdd={(vid, about) => edit((x) => void (x.variants = [...(x.variants ?? []), { id: vid, about }]))} />

      <div className="make-row cast-remove">
        <button className="link danger small" onClick={remove}>
          Remove from the cast
        </button>
      </div>
    </div>
  );
}

/**
 * A cast id, to change: what's typed becomes one prompts can name (lowercase, dashes). `onRename` says why not when it
 * can't be, and the field goes back to the id it has.
 */
function IdField({ prefix = "", value, onRename }: { prefix?: string; value: string; onRename: (id: string) => string | void }) {
  const [problem, setProblem] = useState("");
  const [tries, setTries] = useState(0);
  const commit = (typed: string) => {
    const to = typed.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const why = to && to !== value ? onRename(to) : undefined;
    setProblem(why ?? "");
    setTries((n) => n + 1);
  };
  return (
    <span className="cast-id" title="What prompts call it. Changing it changes every prompt that uses it">
      <span className="mono dim">@{prefix}</span>
      <TextField key={`${value}-${tries}`} value={value} onCommit={commit} />
      {problem && <span className="warn small">{problem}</span>}
    </span>
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

/** Where a picture being dragged in a strip came from: which strip, and where in it. */
const PICTURE_DRAG = "application/x-beatsheet-picture";

/**
 * A strip of a cast member's (or a variant's) pictures, and its sheets on their way. Ranked, it's what models are
 * given: the main one outlined, the ones past what they get dimmed, and dragging one changes the order. Each made one
 * is marked with the model that made it, to compare sheets from several. Clicking one shows it large.
 */
function Pictures({ projectId, ids, going = [], unranked, onChange }: { projectId: string; ids: string[]; going?: MakeJob[]; unranked?: boolean; onChange: (ids: string[]) => void }) {
  const p = useProject();
  const [large, setLarge] = useState<number>();
  const [dragged, setDragged] = useState<number>();
  const [over, setOver] = useState<number>();
  const strip = ids.join(",");
  const assets = ids.map((a) => p.assets.find((x) => x.id === a));
  const move = (from: number, to: number) => {
    const next = ids.filter((_, i) => i !== from);
    next.splice(to > from ? to - 1 : to, 0, ids[from]!);
    onChange(next);
  };
  const caption = (i: number) => {
    const by = madeWith(assets[i]);
    const place = unranked ? "" : i === 0 ? "the main one" : i >= PICTURES_EACH ? "not given to models" : `given when there's room (${i + 1} of ${Math.min(ids.length, PICTURES_EACH)})`;
    return [ids[i], by && `made with ${by}`, place].filter(Boolean).join(" · ");
  };
  return (
    <>
      <div className="take-strip" onDragLeave={() => setOver(undefined)}>
        {ids.map((a, i) => (
          <Picture
            key={a}
            projectId={projectId}
            id={a}
            main={!unranked && i === 0}
            spare={!unranked && i >= PICTURES_EACH}
            by={madeWith(assets[i])}
            className={`${dragged === i ? "dragging" : ""} ${over === i && dragged !== undefined && dragged !== i && dragged !== i - 1 ? "drop-before" : ""}`}
            onOpen={() => setLarge(i)}
            onRemove={() => onChange(ids.filter((y) => y !== a))}
            drag={
              unranked
                ? undefined
                : {
                    onDragStart: (e) => {
                      e.dataTransfer.setData(PICTURE_DRAG, JSON.stringify({ strip, i }));
                      e.dataTransfer.effectAllowed = "move";
                      setDragged(i);
                    },
                    onDragEnd: () => {
                      setDragged(undefined);
                      setOver(undefined);
                    },
                    onDragOver: (e) => {
                      if (!e.dataTransfer.types.includes(PICTURE_DRAG)) return;
                      e.preventDefault();
                      setOver(i);
                    },
                    onDrop: (e) => {
                      const from = JSON.parse(e.dataTransfer.getData(PICTURE_DRAG) || "{}") as { strip?: string; i?: number };
                      setOver(undefined);
                      if (from.strip !== strip || from.i === undefined || from.i === i) return;
                      e.preventDefault();
                      move(from.i, i);
                    },
                  }
            }
          />
        ))}
        {going.map((j) => (
          <span key={j.id} className="cast-pic">
            <div className="take pending" title={`A ${j.portrait ? "portrait" : "sheet"} from ${modelLabel(j.model)} on its way`}>
              {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
              <br />
              {modelLabel(j.model)}
            </div>
          </span>
        ))}
      </div>
      {large !== undefined && (
        <Viewer
          projectId={projectId}
          items={ids.map((a, i) => ({ id: a, video: assets[i]?.kind === "video", caption: caption(i) }))}
          at={large}
          onClose={() => setLarge(undefined)}
          actions={(item, i) => (
            <>
              {!unranked && (
                <button onClick={() => move(i, 0)} disabled={i === 0} title="Put it first: the one models get first">
                  Make it the main one
                </button>
              )}
              <button className="danger" onClick={() => onChange(ids.filter((y) => y !== item.id))} title={unranked ? "It isn't them" : "Take this picture out"}>
                Take out
              </button>
            </>
          )}
        />
      )}
    </>
  );
}

/** What models get of a strip of pictures, once there's more than one to choose between. */
function PicturesHint({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <p className="dim small">
      Models get the outlined one, and up to {PICTURES_EACH - 1} more when there's room{count > PICTURES_EACH ? "; the dimmed ones are kept but not given" : ""}. Drag to change the order; click
      one to see it large.
    </p>
  );
}

/** One picture in a strip: the main one outlined, a made one badged with its model. Clicking it shows it large. */
function Picture({
  projectId,
  id,
  main,
  spare,
  by,
  className = "",
  drag,
  onOpen,
  onRemove,
}: {
  projectId: string;
  id: string;
  main?: boolean;
  spare?: boolean;
  by?: string;
  className?: string;
  drag?: Pick<HTMLAttributes<HTMLSpanElement>, "onDragStart" | "onDragEnd" | "onDragOver" | "onDrop">;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const title = `${id}${main ? ": the one models get first" : spare ? ": kept, not given to models" : ""}${by ? ` (made with ${by})` : ""}. Click to see it large${drag ? "; drag to change the order" : ""}`;
  return (
    <span className={`cast-pic ${spare ? "spare" : ""} ${className}`} draggable={!!drag} {...drag}>
      <button className={`take ${main ? "on" : ""}`} onClick={onOpen} title={title}>
        <img src={posterUrl(projectId, id)} alt="" onError={hideBroken} draggable={false} />
        {by && <span className="badge">{by}</span>}
      </button>
      <button className="cast-pic-remove" onClick={onRemove} title="Take this picture out" aria-label="Take this picture out">
        ×
      </button>
    </span>
  );
}
