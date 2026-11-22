/**
 * Cast and sets: the characters, places, props and styles made shots keep the same from shot to shot. They're listed
 * at the top of the Library. Right-click a photo to make one from it or add it to one; select one to name it,
 * describe it and make its sheet (clean views that models are given to match).
 */
import type { MakeJob } from "@beatsheet/engine";
import { castOf, lookGiven, mergeLook, PICTURES_EACH, renameCast, speakerLabel, type Asset, type CastMember, type Project } from "@beatsheet/schema";
import { useMemo, useState, type HTMLAttributes } from "react";
import { hideBroken, posterUrl } from "../lib";
import { lineUp } from "../multicam";
import { actions, getState, setState, useProject, useStore } from "../store";
import { cost, Failed, fitLabel, fitOf, madeWith, modelLabel, money, useChoices, useMake, WhyNot } from "./Takes";
import { Viewer } from "./Viewer";
import { CharacterSteps, isOwnPhoto, Picture, PICTURE_DRAG } from "./CastSteps";
import { PopMenu, TextField } from "./ui";
import { VoicePicker } from "./Voices";
import { Icon } from "./Icon";

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
        // Its chosen portrait (a look's when the plain one has none), else what it's given, else a photo it's seen in.
        const pic =
          m.portrait ??
          m.variants?.find((v) => v.portrait)?.portrait ??
          m.sheet ??
          m.images?.[0] ??
          m.seen?.find((s) => p.assets.find((a) => a.id === s.asset)?.kind === "image")?.asset;
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
                {![m, ...(m.variants ?? [])].some((l) => lookGiven(l).length) && <span className="dim">no pictures</span>}
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

/** A cast member's plain look, as its looks name it; the others are its variants' ids. */
const PLAIN = "";
const PLAIN_LABEL: Record<Kind, string> = { character: "Plain", place: "As it is", prop: "Plain", style: "" };
/** What making pictures of a cast member is called, by kind. */
const MAKE_WORD: Record<Kind, string> = { character: "Make sheets", place: "Make views", prop: "Make sheets", style: "Make stills" };


/** How many of this cut's made shots name each of a cast member's looks (PLAIN for the plain one). */
function shotsPerLook(p: Project, id: string): Map<string, number> {
  const n = new Map<string, number>();
  for (const s of p.shots) {
    const c = s.content;
    if (c.kind !== "generated" && c.kind !== "placeholder") continue;
    const prompt = c.kind === "generated" ? c.prompt : c.description;
    const uses = castOf(prompt ?? "", p.cast, c.kind === "generated" ? c.cast : undefined).filter((u) => u.member.id === id);
    for (const look of new Set(uses.map((u) => u.variant?.id ?? PLAIN))) n.set(look, (n.get(look) ?? 0) + 1);
  }
  return n;
}

/** A cast member in Inspect, starting on the look its shots use most. */
export function CastView({ id }: { id: string }) {
  return <CastPanel key={id} id={id} />;
}

/**
 * A cast member, built around its looks: the plain one and each variant (@galileo/old), with how many shots use each.
 * A look's pictures are what models are given for it, in order, in three slots; portraits and sheets made of it wait
 * beside them, kept, until one is dragged into a slot. Its footage (what portraits are made from) and its settings fold
 * away below.
 */
function CastPanel({ id }: { id: string }) {
  const p = useProject();
  const projectId = useStore((s) => s.projectId)!;
  const m = p.cast?.find((x) => x.id === id);
  const perLook = useMemo(() => shotsPerLook(p, id), [p, id]);
  const [lookAsked, setLook] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [count, setCount] = useState(2);
  // The models pictures are made with: Auto's pick, until others are ticked to compare theirs side by side.
  const [models, setModels] = useState<string[]>();
  const [describing, setDescribing] = useState("");
  const looks = [PLAIN, ...(m?.variants ?? []).map((v) => v.id)];
  const look = lookAsked !== undefined && looks.includes(lookAsked) ? lookAsked : looks.reduce((best, l) => ((perLook.get(l) ?? 0) > (perLook.get(best) ?? 0) ? l : best), PLAIN);
  const sheet = look ? `${id}/${look}` : id;
  const { going, make, sending, error, failed, retry } = useMake((j) => !!j.sheet && (j.sheet === id || j.sheet.startsWith(`${id}/`)), `sheet:${id}`);
  const { choices, problem } = useChoices({ op: "image", sheet, count });
  const ready = choices?.ready ?? [];
  const picked = (models ?? (choices?.auto ? [choices.auto.model] : [])).filter((x) => ready.some((f) => f.model === x));
  const fits = picked.map((x) => fitOf(choices, x)!);
  const price = fits.length > 1 && fits.some((f) => f.usd) ? money(fits.reduce((sum, f) => sum + (f.usd ?? 0), 0)) : fits[0] ? cost(fits[0]) : "";
  const tick = (model: string, on: boolean) => setModels(ready.map((f) => f.model).filter((x) => (x === model ? on : picked.includes(x))));
  if (!m) return <p className="dim small">That cast member is gone.</p>;

  const variant = look ? m.variants?.find((v) => v.id === look) : undefined;
  const edit = (fn: (m: CastMember) => void) => actions.edit((d) => fn(d.cast!.find((x) => x.id === id)!));
  // The look being shown, in the file: the cast member itself, or its variant.
  const editLook = (fn: (l: { images?: string[]; kept?: string[] }) => void) => edit((x) => fn(look ? x.variants!.find((v) => v.id === look)! : x));
  const setPictures = (given: string[], kept: string[]) =>
    editLook((l) => {
      if (given.length) l.images = given;
      else delete l.images;
      if (kept.length) l.kept = kept;
      else delete l.kept;
    });
  // A picture made on the wrong look goes to another: into its first slot when it has nothing, else its kept.
  const moveToLook = (a: string, to: string) =>
    edit((x) => {
      const strip = (l: { images?: string[]; kept?: string[] }) => {
        l.images = l.images?.filter((y) => y !== a);
        l.kept = l.kept?.filter((y) => y !== a);
        if (!l.images?.length) delete l.images;
        if (!l.kept?.length) delete l.kept;
      };
      strip(look ? x.variants!.find((v) => v.id === look)! : x);
      const target = to ? x.variants!.find((v) => v.id === to)! : x;
      if (target.images?.length) target.kept = [...(target.kept ?? []), a];
      else target.images = [a];
    });
  const given = (variant ?? m).images ?? [];
  const kept = (variant ?? m).kept ?? [];
  // A look with no pictures of its own is given the plain one's.
  const borrowed = variant && !given.length && m.images?.length ? m.images.slice(0, PICTURES_EACH) : undefined;

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
  const reIdLook = (from: string) => (to: string) => {
    if (m.variants?.some((x) => x.id === to)) return `@${id}/${to} is taken`;
    actions.editFile((f) => void renameCast(f, `${id}/${from}`, to));
    moveJobs(`${id}/${from}`, to);
    setLook(to);
  };
  const removeLook = (vid: string) => {
    edit((x) => void (x.variants = x.variants!.filter((y) => y.id !== vid)));
    setLook(PLAIN);
  };
  // For someone only ever seen in this look: it becomes the plain one, and every shot that names it follows.
  const mergeIntoPlain = (vid: string) => {
    actions.editFile((f) => void mergeLook(f, `${id}/${vid}`));
    void fetch(`/api/projects/${projectId}/jobs/rename`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merge: `${id}/${vid}` }) }).catch(() => {});
    setLook(PLAIN);
  };
  const remove = () => {
    actions.edit((d) => void (d.cast = d.cast!.filter((x) => x.id !== id)));
    actions.select(undefined);
  };
  const makeIt = (portrait: boolean) => {
    const ask = { op: "image" as const, sheet, count, ...(portrait ? { portrait: true } : {}) };
    void make(models ? picked.map((model) => ({ ...ask, model })) : ask);
  };

  const footage = (m.seen ?? []).map((s) => p.assets.find((a) => a.id === s.asset)).filter((a): a is Asset => !!a);
  const photos = footage.filter((a) => a.kind === "image");
  const clips = footage.length - photos.length;
  const canMake = !!(m.about || m.wears || variant?.about || photos.length || given.length || borrowed?.length);
  const nShots = perLook.get(look) ?? 0;
  const lookName = variant ? `@${id}/${variant.id}` : `@${id}`;
  // Where what's made comes from, said once, under the buttons.
  const sources = `Pictures are made from ${given.length || borrowed?.length ? "this look's pictures" : photos.length ? "the photos below" : "the description"}`;
  const describeLink = (!!m.images?.length || photos.length > 0) && (
    <p className="small">
      <button className="link small" disabled={describing === "Looking…"} onClick={() => void describe()} title="Gemini looks at its pictures and writes what it looks like">
        {describing === "Looking…" ? "Looking at its pictures…" : m.about ? "Describe it again from its pictures" : "Describe it from its pictures"}
      </button>
      {describing && describing !== "Looking…" && <span className="warn"> {describing}</span>}
    </p>
  );

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

      {m.kind !== "style" && (
        <div className="looks" role="tablist" aria-label="Looks">
          {looks.map((l) => (
            <button
              key={l || "plain"}
              role="tab"
              aria-selected={l === look}
              className={`look-chip ${l === look ? "on" : ""}`}
              onClick={() => setLook(l)}
              title={`${l ? `@${id}/${l}` : `@${id}`}: ${perLook.get(l) ? `in ${perLook.get(l)} shot${perLook.get(l) === 1 ? "" : "s"} of this cut` : "in no shots of this cut yet"}`}
            >
              {l || PLAIN_LABEL[m.kind]}
              {!!perLook.get(l) && <span className="n">{perLook.get(l)}</span>}
            </button>
          ))}
          <button className="look-chip add" onClick={() => setAdding(!adding)} title="The same one in another outfit, state or time of day">
            + New look
          </button>
        </div>
      )}
      {adding && (
        <LookAdd
          taken={(m.variants ?? []).map((v) => v.id)}
          onAdd={(vid, about) => {
            edit((x) => void (x.variants = [...(x.variants ?? []), { id: vid, about }]));
            setLook(vid);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="look">
        <div className="look-head small" title="What prompts call this look, and how many of this cut's shots do">
          {variant ? <IdField prefix={`${m.id}/`} value={variant.id} onRename={reIdLook(variant.id)} /> : <span className="mono">@{m.id}</span>}
          <span className="spacer" />
          <span className="dim nowrap">{nShots ? `in ${nShots} shot${nShots === 1 ? "" : "s"}` : "in no shots yet"}</span>
        </div>
        {m.kind === "character" ? (
          <CharacterSteps
            key={look}
            projectId={projectId}
            member={m}
            variant={variant}
            lookName={lookName}
            plainLabel={PLAIN_LABEL[m.kind]}
            going={going.filter((j) => j.sheet === sheet)}
            canMake={!!picked.length && !sending}
            onMake={makeIt}
            edit={edit}
            describe={describeLink}
          />
        ) : (
          <>
            <label>
              {variant ? "What's different" : m.kind === "style" ? "What it's like" : "What it looks like"}
              {variant ? (
                <TextField
                  multiline
                  value={variant.about}
                  placeholder="What's different: wearing a tiny black eye mask"
                  onCommit={(t) => edit((x) => void (x.variants!.find((v) => v.id === variant.id)!.about = t))}
                />
              ) : (
                <TextField multiline value={m.about ?? ""} placeholder={ABOUT_EXAMPLE[m.kind]} onCommit={(v) => edit((x) => void (v.trim() ? (x.about = v.trim()) : delete x.about))} />
              )}
            </label>
            {!variant && describeLink}
            <LookPictures
              key={look}
              projectId={projectId}
              lookKey={sheet}
              lookName={lookName}
              given={given}
              kept={kept}
              borrowed={borrowed}
              borrowedFrom={PLAIN_LABEL[m.kind] || label(m)}
              going={going.filter((j) => j.sheet === sheet)}
              onChange={setPictures}
              otherLooks={looks.filter((l) => l !== look).map((l) => ({ key: l, name: l || PLAIN_LABEL[m.kind] }))}
              onMoveTo={moveToLook}
            />
            <div className="make-row">
              <button className="primary" disabled={!picked.length || sending || !canMake} onClick={() => makeIt(false)}>
                {MAKE_WORD[m.kind]}
              </button>
            </div>
          </>
        )}
        <details className="make-options small">
          <summary>
            {count} each{picked.length ? ` from ${picked.map(modelLabel).join(", ")}` : ""}
            {price ? ` · ${price}` : ""}
          </summary>
          <div className="make-row">
            <span className="dim">How many from each model</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many from each model">
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {ready.map((f) => (
            <label key={f.model} className="check-row" title="Tick more than one to compare what each makes">
              <input type="checkbox" checked={picked.includes(f.model)} onChange={(e) => tick(f.model, e.target.checked)} />
              {fitLabel(f)}
            </label>
          ))}
        </details>
        {m.kind !== "character" && (
          <p className="dim small">
            {sources}. New ones wait in Kept until you drag one into a slot{given.length ? "" : " (the first goes into slot 1)"}.
          </p>
        )}
        <WhyNot choices={choices} />
        {(error || problem) && <p className="warn small">{error || problem}</p>}
        {failed && !error && <Failed job={failed} what={failed.portrait ? "A portrait" : "A sheet"} retry={(j) => void retry(j)} />}
        {variant && (
          <p className="small">
            <button
              className="link small"
              onClick={() => mergeIntoPlain(variant.id)}
              title={`For when ${label(m)} is only ever seen this way: shots that name ${lookName} name @${id}, and this look's description and pictures become the ${PLAIN_LABEL[m.kind].toLowerCase()} one's (its own pictures wait in Kept). Undo takes it back.`}
            >
              Merge into {PLAIN_LABEL[m.kind]}
            </button>
            <span className="dim"> · </span>
            <button className="link danger small" onClick={() => removeLook(variant.id)} title={`Shots that name ${lookName} get the plain look instead`}>
              Remove this look
            </button>
          </p>
        )}
      </div>

      {(footage.length > 0 || !!m.heard?.length) && (
        <details className="cast-fold">
          <summary>
            From your footage ·{" "}
            {[photos.length && `${photos.length} photo${photos.length === 1 ? "" : "s"}`, clips && `${clips} clip${clips === 1 ? "" : "s"}`, m.heard?.length && "their voice"].filter(Boolean).join(", ")}
          </summary>
          <p className="dim small">{m.kind === "character" ? "Where they were found. Their photos are step 1's, where you choose which the face comes from." : "What its pictures are made from. Models aren't given these unless you drag one into a look."}</p>
          {footage.length > 0 && (
            <Footage
              projectId={projectId}
              assets={footage}
              lookName={lookName}
              onAdd={m.kind === "character" ? undefined : (a) => !given.includes(a) && !kept.includes(a) && setPictures(given, [...kept, a])}
              onRemove={(a) => edit((x) => void (x.seen = x.seen!.filter((s) => s.asset !== a)))}
            />
          )}
          {!!m.heard?.length && (
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
                      <Icon name="close" size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      )}

      <details className="cast-fold">
        <summary>Settings · {[m.kind !== "style" && "style", m.kind === "character" && "voice", "remove"].filter(Boolean).join(", ")}</summary>
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
        <p className="small">
          <button className="link danger small" onClick={remove}>
            Remove from the cast
          </button>
        </p>
      </details>
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

/** A new look: what's different, and a short id for it from its first words. */
function LookAdd({ taken, onAdd, onCancel }: { taken: string[]; onAdd: (id: string, about: string) => void; onCancel: () => void }) {
  const [about, setAbout] = useState("");
  const add = () => {
    if (!about.trim()) return;
    onAdd(castIdFor(about.split(/[,;]/)[0]!.replace(/^(wearing|in|with|at) (a |an |the )?/i, ""), taken, "look"), about.trim());
    setAbout("");
  };
  return (
    <div className="make-row">
      <input
        autoFocus
        value={about}
        placeholder="What's different: soaked from the rain"
        onChange={(e) => setAbout(e.target.value)}
        onKeyDown={(e) => (e.key === "Enter" ? add() : e.key === "Escape" && onCancel())}
        aria-label="New look"
      />
      <button disabled={!about.trim()} onClick={add}>
        Add
      </button>
    </div>
  );
}

/** Where a picture dragged among a look's came from (PICTURE_DRAG): which look and row, or a photo from the footage. */
type Row = "given" | "kept";
type Dragged = { look?: string; row?: Row; i?: number; asset?: string };

/**
 * A look's pictures: the three models are given, in numbered slots (the first is the main one), and the ones kept
 * beside them, not given. Drag between them to choose; a photo from the footage can be dragged in too. A look with
 * none of its own shows the plain one's, faded, since that's what models get. Clicking any one shows it large.
 */
function LookPictures({
  projectId,
  lookKey,
  lookName,
  given,
  kept,
  borrowed,
  borrowedFrom,
  going,
  onChange,
  otherLooks,
  onMoveTo,
}: {
  projectId: string;
  lookKey: string;
  lookName: string;
  given: string[];
  kept: string[];
  borrowed?: string[];
  borrowedFrom: string;
  going: MakeJob[];
  onChange: (given: string[], kept: string[]) => void;
  /** The cast member's other looks, which a picture can be moved to. */
  otherLooks: { key: string; name: string }[];
  onMoveTo: (asset: string, look: string) => void;
}) {
  const p = useProject();
  const [large, setLarge] = useState<{ borrowed?: boolean; at: number }>();
  const [over, setOver] = useState<string>();
  // More than three given (from before there were slots) shows the rest as kept.
  const g = given.slice(0, PICTURES_EACH);
  const k = [...given.slice(PICTURES_EACH), ...kept];
  const asset = (a: string) => p.assets.find((x) => x.id === a);
  const badge = (a: string) => madeWith(asset(a)) ?? (isOwnPhoto(asset(a)) ? "Photo" : undefined);

  /** Puts a picture in a slot (pushing the last one given into kept), or among the kept before another. */
  const put = (item: string, from: { row: Row; i: number } | undefined, to: { row: Row; i: number }) => {
    const ng = [...g];
    const nk = [...k];
    if (from) (from.row === "given" ? ng : nk).splice(from.i, 1);
    else if (ng.includes(item) || nk.includes(item)) return;
    if (to.row === "given") {
      ng.splice(Math.min(to.i, ng.length), 0, item);
      while (ng.length > PICTURES_EACH) nk.unshift(ng.pop()!);
    } else nk.splice(Math.min(from?.row === "kept" && from.i < to.i ? to.i - 1 : to.i, nk.length), 0, item);
    onChange(ng, nk);
  };
  const takeOut = (a: string) => onChange(g.filter((x) => x !== a), k.filter((x) => x !== a));
  const dragFrom = (row: Row, i: number): HTMLAttributes<HTMLSpanElement> => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(PICTURE_DRAG, JSON.stringify({ look: lookKey, row, i } satisfies Dragged));
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => setOver(undefined),
  });
  const dropOn = (row: Row, i: number, spot: string): HTMLAttributes<HTMLElement> => ({
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(PICTURE_DRAG)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(spot);
    },
    onDrop: (e) => {
      const d = JSON.parse(e.dataTransfer.getData(PICTURE_DRAG) || "{}") as Dragged;
      setOver(undefined);
      e.preventDefault();
      e.stopPropagation();
      if (d.asset) {
        if (asset(d.asset)?.kind === "image") put(d.asset, undefined, { row, i });
      } else if (d.look === lookKey && d.row && d.i !== undefined) {
        const item = (d.row === "given" ? g : k)[d.i];
        if (item) put(item, { row: d.row, i: d.i }, { row, i });
      }
    },
  });

  const all = [...g, ...k];
  const caption = (a: string) => {
    const i = g.indexOf(a);
    const where = i === 0 ? "slot 1, the main one" : i > 0 ? `slot ${i + 1}` : "kept, not given to models";
    const by = madeWith(asset(a));
    return [a, by ? `made with ${by}` : isOwnPhoto(asset(a)) ? "their own photo" : "", where].filter(Boolean).join(" · ");
  };
  const showBorrowed = !!borrowed?.length && !g.length;

  return (
    <>
      <div className="small dim">Models get, in this order</div>
      <div className="slots">
        {[0, 1, 2].map((i) => {
          const a = g[i];
          const b = showBorrowed ? borrowed![i] : undefined;
          return (
            <div key={i} className={`slot ${over === `given:${i}` ? "over" : ""}`} {...dropOn("given", i, `given:${i}`)}>
              <span className="slot-n">{i + 1}</span>
              {a ? (
                <Picture projectId={projectId} id={a} main={i === 0} by={badge(a)} dnd={dragFrom("given", i)} onOpen={() => setLarge({ at: i })} onRemove={() => takeOut(a)} />
              ) : b ? (
                <Picture projectId={projectId} id={b} borrowed by={badge(b)} onOpen={() => setLarge({ borrowed: true, at: i })} />
              ) : (
                <span className="slot-empty dim small">{i === g.length ? "Drag one here" : ""}</span>
              )}
            </div>
          );
        })}
      </div>
      {showBorrowed && <p className="dim small">Nothing of its own yet, so models get the {borrowedFrom.toLowerCase()} look's pictures, with what's different in words.</p>}
      <div className="small dim">Kept, not given{k.length ? " · drag one into a slot" : ""}</div>
      <div className={`take-strip kept ${over === "kept:end" ? "over" : ""}`} {...dropOn("kept", k.length, "kept:end")}>
        {k.map((a, i) => (
          <Picture
            key={a}
            projectId={projectId}
            id={a}
            by={badge(a)}
            className={over === `kept:${i}` ? "drop-before" : ""}
            dnd={{ ...dragFrom("kept", i), ...dropOn("kept", i, `kept:${i}`) }}
            onOpen={() => setLarge({ at: g.length + i })}
            onRemove={() => takeOut(a)}
          />
        ))}
        {going.map((j) => (
          <span key={j.id} className="cast-pic">
            <div className="take pending" title={`A ${j.portrait ? "portrait" : "sheet"} from ${modelLabel(j.model)} on its way`}>
              {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
              <br />
              {modelLabel(j.model)} {j.portrait ? "portrait" : "sheet"}
            </div>
          </span>
        ))}
        {!k.length && !going.length && <span className="dim small kept-empty">Portraits and sheets you make wait here.</span>}
      </div>
      {large &&
        (large.borrowed ? (
          <Viewer
            projectId={projectId}
            items={borrowed!.map((a) => ({ id: a, caption: `${a} · the ${borrowedFrom.toLowerCase()} look's, given until ${lookName} has its own` }))}
            at={large.at}
            onClose={() => setLarge(undefined)}
          />
        ) : (
          <Viewer
            projectId={projectId}
            items={all.map((a) => ({ id: a, video: asset(a)?.kind === "video", caption: caption(a) }))}
            at={large.at}
            onClose={() => setLarge(undefined)}
            actions={(item) => {
              const i = g.indexOf(item.id);
              const from = i >= 0 ? { row: "given" as const, i } : { row: "kept" as const, i: k.indexOf(item.id) };
              return (
                <>
                  {i !== 0 && (
                    <button onClick={() => put(item.id, from, { row: "given", i: 0 })} title="Slot 1: the one models get first">
                      Make it the main one
                    </button>
                  )}
                  {i < 0 && g.length > 0 && g.length < PICTURES_EACH && <button onClick={() => put(item.id, from, { row: "given", i: g.length })}>Put it in slot {g.length + 1}</button>}
                  {i >= 0 && <button onClick={() => put(item.id, from, { row: "kept", i: 0 })}>Move to kept</button>}
                  {otherLooks.map((l) => (
                    <button key={l.key || "plain"} onClick={() => onMoveTo(item.id, l.key)} title={`It belongs to the ${l.name} look: it goes into that look's kept (or its first slot, when it has nothing)`}>
                      Move to {l.name}
                    </button>
                  ))}
                  <button className="danger" onClick={() => takeOut(item.id)}>
                    Take out
                  </button>
                </>
              );
            }}
          />
        ))}
    </>
  );
}

/** The photos and clips a cast member was found in: what its portraits are made from. A photo can be dragged into a look. */
function Footage({ projectId, assets, lookName, onAdd, onRemove }: { projectId: string; assets: Asset[]; lookName: string; onAdd?: (id: string) => void; onRemove: (id: string) => void }) {
  const [large, setLarge] = useState<number>();
  return (
    <>
      <div className="take-strip">
        {assets.map((a, i) => (
          <Picture
            key={a.id}
            projectId={projectId}
            id={a.id}
            by={a.kind === "video" ? "Clip" : undefined}
            dnd={
              a.kind === "image"
                ? {
                    draggable: true,
                    onDragStart: (e) => {
                      e.dataTransfer.setData(PICTURE_DRAG, JSON.stringify({ asset: a.id } satisfies Dragged));
                      e.dataTransfer.effectAllowed = "copy";
                    },
                  }
                : undefined
            }
            onOpen={() => setLarge(i)}
            onRemove={() => onRemove(a.id)}
          />
        ))}
      </div>
      {large !== undefined && (
        <Viewer
          projectId={projectId}
          items={assets.map((a) => ({ id: a.id, video: a.kind === "video", caption: `${a.label ?? a.id} · from your footage` }))}
          at={large}
          onClose={() => setLarge(undefined)}
          actions={(item) => (
            <>
              {onAdd && assets.find((a) => a.id === item.id)?.kind === "image" && <button onClick={() => onAdd(item.id)}>Add to {lookName}'s kept</button>}
              <button className="danger" onClick={() => onRemove(item.id)} title="Take it out of where they're seen">
                Not them
              </button>
            </>
          )}
        />
      )}
    </>
  );
}
