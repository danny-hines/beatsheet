/**
 * Cast and sets: the characters, places, props and styles made shots keep the same from shot to shot. They're listed
 * at the top of the Library. Right-click a photo to make one from it or add it to one; select one to name it,
 * describe it and make its sheet (clean views that models are given to match).
 */
import type { MakeJob, SheetKind } from "@beatsheet/engine";
import { castOf, commercialWords, lookGiven, mergeLook, PICTURES_EACH, renameCast, speakerLabel, type Asset, type CastMember, type Choices, type Fit, type FitOk, type Project } from "@beatsheet/schema";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";
import { hideBroken, posterUrl } from "../lib";
import { lineUp } from "../multicam";
import { actions, useProject, useStore } from "../store";
import { cost, Failed, fitOf, madeWith, modelLabel, money, pickOf, useChoices, useMake, WhyNot } from "./Takes";
import { Viewer } from "./Viewer";
import { AddPhotoTile, CharacterSteps, hasFileDrop, isOwnPhoto, NonHumanSteps, Picture, PICTURE_DRAG, uploadCastPhotos, WardrobeSteps } from "./CastSteps";
import { PopMenu, TextField } from "./ui";
import { VoicePicker } from "./Voices";
import { Icon } from "./Icon";

const CAST_THUMBS = import.meta.glob<string>("../assets/cast/*.webp", { eager: true, query: "?url", import: "default" });
const castThumb = (id: string) => CAST_THUMBS[`../assets/cast/${id}.webp`];

export type Kind = CastMember["kind"];
export const KINDS: [Kind, string][] = [
  ["character", "Character"],
  ["wardrobe", "Wardrobe"],
  ["place", "Set"],
  ["prop", "Prop"],
  ["style", "Style"],
];
export const WORD: Record<Kind, string> = { character: "character", wardrobe: "wardrobe", place: "set", prop: "prop", style: "style" };

const NEW_CAST_OPTIONS: { id: string; kind: Kind; nonHuman?: boolean; thumb: string; title: string; subtitle: string }[] = [
  { id: "human", kind: "character", thumb: "human", title: "Person", subtitle: "Face turnaround + swappable outfits" },
  { id: "nonhuman", kind: "character", nonHuman: true, thumb: "nonhuman", title: "Creature / Non-human", subtitle: "Pets, robots, dragons — full-body sheet" },
  { id: "wardrobe", kind: "wardrobe", thumb: "wardrobe", title: "Wardrobe", subtitle: "Reusable costume or uniform across cast" },
  { id: "place", kind: "place", thumb: "place", title: "Set", subtitle: "Recurring location or environment" },
  { id: "prop", kind: "prop", thumb: "prop", title: "Prop", subtitle: "Hero object, vehicle, or held item" },
  { id: "style", kind: "style", thumb: "style", title: "Style", subtitle: "Visual look, film stock, or art medium" },
];
/** What a description of each kind looks like: the specifics a model can draw. */
const ABOUT_EXAMPLE: Record<Kind, string> = {
  character: "Woman in her forties, short curly gray hair, round tortoiseshell glasses, mustard cardigan, warm crooked smile",
  wardrobe: "Heavy black Renaissance hooded inquisitor robe with silver clasp, leather belt, worn hem, matte white mask",
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
const UNNAMED = /^(character|creature|wardrobe|place|prop|style)(-\d+)?$/;

/** Makes a cast member (from pictures, when there are some) and opens it in Make → Cast & sets so creation always has full room. */
export function newMember(kind: Kind, from: Asset[] = [], opts?: { nonHuman?: boolean }) {
  let id = "";
  const nonHuman = kind === "character" && !!opts?.nonHuman;
  actions.edit((d) => {
    const cast = (d.cast ??= []);
    id = castIdFor("", cast.map((m) => m.id), nonHuman ? "creature" : kind);
    cast.push({
      id,
      name: "",
      kind,
      ...(nonHuman ? { nonHuman: true } : {}),
      ...(from.length
        ? kind === "wardrobe"
          ? { wardrobe: from.map((a) => a.id), seen: from.map((a) => ({ asset: a.id })) }
          : { seen: from.map((a) => ({ asset: a.id })) }
        : {}),
    });
  });
  actions.openCast(id);
}

/** Enlarged visual picker for adding a new cast member, wardrobe, set, prop, or style. */
export function NewCastMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  return (
    <PopMenu x={x} y={y} onClose={onClose} className="cast-new-menu" width={344} estHeight={430}>
      <div className="cast-new-head">Add to cast &amp; sets</div>
      {NEW_CAST_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          role="menuitem"
          className="cast-new-item"
          onClick={() => {
            onClose();
            newMember(opt.kind, [], opt.nonHuman ? { nonHuman: true } : undefined);
          }}
        >
          <span className="cast-new-thumb">
            <img src={castThumb(opt.thumb)} alt="" />
          </span>
          <span className="cast-new-text">
            <span className="cast-new-title">{opt.title}</span>
            <span className="cast-new-sub">{opt.subtitle}</span>
          </span>
        </button>
      ))}
    </PopMenu>
  );
}

/** Adds pictures to where a cast member is seen (and for a wardrobe, straight to its wardrobe references). */
function addTo(id: string, as: Asset[]) {
  actions.edit((d) => {
    const m = d.cast?.find((x) => x.id === id);
    if (!m) return;
    for (const a of as) {
      if (!m.seen?.some((s) => s.asset === a.id)) m.seen = [...(m.seen ?? []), { asset: a.id }];
      if (m.kind === "wardrobe" && a.kind === "image" && !m.wardrobe?.includes(a.id)) m.wardrobe = [...(m.wardrobe ?? []), a.id];
    }
  });
}

export const label = (m: CastMember) => m.name || `Unnamed ${WORD[m.kind]}`;

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

/** The picture that stands for a cast member: its chosen portrait, 360° face sheet, outfit sheet, combined sheet, or a photo it's seen in. */
export const castPicture = (p: Project, m: CastMember): string | undefined =>
  m.portrait ??
  m.variants?.find((v) => v.portrait)?.portrait ??
  m.faceSheet ??
  m.outfitSheet ??
  m.variants?.find((v) => v.outfitSheet)?.outfitSheet ??
  m.sheet ??
  m.images?.[0] ??
  m.seen?.find((s) => p.assets.find((a) => a.id === s.asset)?.kind === "image")?.asset;

/** How many of this cut's shots to make name a cast member, in any of its looks. */
export const shotsWith = (p: Project, id: string): number => [...shotsPerLook(p, id).values()].reduce((a, b) => a + b, 0);

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
        <span className="spacer" />
        <button className="link small" onClick={(e) => setAdding({ x: e.clientX, y: e.clientY })} title="Add a person, creature, wardrobe, set, prop, or style">
          + New
        </button>
      </div>
      {cast.map((m) => {
        const pic = castPicture(p, m);
        return (
          <button key={m.id} className={`asset-row cast-row ${selection?.kind === "cast" && selection.id === m.id ? "sel" : ""}`} onClick={() => actions.openCast(m.id)}>
            <span className="asset-row-thumb">
              {pic ? <img src={posterUrl(projectId, pic)} loading="lazy" alt="" onError={hideBroken} /> : <span className="asset-row-note">{label(m)[0]!.toUpperCase()}</span>}
            </span>
            <span className="asset-row-body">
              <span className={`asset-row-label ${m.name ? "" : "dim"}`}>{label(m)}</span>
              <span className="asset-row-meta small">
                <span className="mono">@{m.id}</span>
                <span className="tag">{m.kind === "character" && m.nonHuman ? "creature" : WORD[m.kind]}</span>
                {![m, ...(m.variants ?? [])].some((l) => lookGiven(l).length || l.outfit) && <span className="dim">no pictures</span>}
              </span>
            </span>
          </button>
        );
      })}
      {!cast.length && <p className="dim small library-empty">Right-click a photo to make a character or a set from it.</p>}
      {adding && <NewCastMenu {...adding} onClose={() => setAdding(undefined)} />}
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
            Make a person from {these}
          </button>
          <button role="menuitem" onClick={pick(() => newMember("character", photos, { nonHuman: true }))}>
            Make a creature / pet from {these}
          </button>
          <button role="menuitem" onClick={pick(() => newMember("wardrobe", photos))}>
            Make a wardrobe from {these}
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
const PLAIN_LABEL: Record<Kind, string> = { character: "Plain", wardrobe: "Clean", place: "As it is", prop: "Plain", style: "" };
/** What making pictures of a cast member is called, by kind. */
const MAKE_WORD: Record<Kind, string> = { character: "Make sheets", wardrobe: "Make outfit sheet", place: "Make views", prop: "Make sheets", style: "Make stills" };


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
  // The model(s) pictures are made with ("model" or "model@via"): undefined means Auto; ticking multiple compares side by side.
  const [picks, setPicks] = useState<string[]>();
  const [describing, setDescribing] = useState("");
  const looks = [PLAIN, ...(m?.variants ?? []).map((v) => v.id)];
  const look = lookAsked !== undefined && looks.includes(lookAsked) ? lookAsked : looks.reduce((best, l) => ((perLook.get(l) ?? 0) > (perLook.get(best) ?? 0) ? l : best), PLAIN);
  const sheet = look ? `${id}/${look}` : id;
  const { going, make, sending, error, failed, retry } = useMake((j) => !!j.sheet && (j.sheet === id || j.sheet.startsWith(`${id}/`)), `sheet:${id}`);
  const { choices, problem } = useChoices({ op: "image", sheet, count, ...(m?.kind === "wardrobe" ? { sheetKind: "outfit-sheet" } : {}) });
  const ready = choices?.ready ?? [];
  const activePicks = (picks ?? (choices?.auto ? [choices.auto.model] : [])).filter((x) => !!fitOf(choices, x));
  const fits = activePicks.map((x) => fitOf(choices, x)!);
  const price = fits.length > 1 && fits.some((f) => f.usd) ? money(fits.reduce((sum, f) => sum + (f.usd ?? 0), 0)) : fits[0] ? cost(fits[0]) : "";
  const makeSummary = activePicks.length
    ? activePicks.length === 1
      ? `${count}× ${fits[0]!.label}${price ? ` · ${price}` : ""}`
      : `${count} each × ${activePicks.length} models${price ? ` · ${price}` : ""}`
    : "";
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
  const makeIt = (sheetKind: SheetKind, opts?: { usePortrait?: boolean }) => {
    const ask = {
      op: "image" as const,
      sheet,
      sheetKind,
      count,
      ...(sheetKind === "portrait" ? { portrait: true } : {}),
      ...(opts?.usePortrait === false ? { usePortrait: false } : {}),
    };
    void make(picks?.length ? activePicks.map((x) => ({ ...ask, ...pickOf(x) })) : ask);
  };

  const footage = (m.seen ?? []).map((s) => p.assets.find((a) => a.id === s.asset)).filter((a): a is Asset => !!a);
  const photos = footage.filter((a) => a.kind === "image");
  const clips = footage.length - photos.length;
  const canMake = !!(m.about || m.wears || m.outfit || variant?.about || variant?.outfit || m.outfitSheet || m.faceSheet || photos.length || given.length || borrowed?.length);
  const nShots = perLook.get(look) ?? 0;
  const lookName = variant ? `@${id}/${variant.id}` : `@${id}`;
  // Where what's made comes from, said once, under the buttons.
  const sources = `Pictures are made from ${given.length || borrowed?.length ? "this look's pictures" : photos.length ? "the photos below" : "the description"}`;
  const hasPics = !!(m.images?.length || m.faces?.length || m.wardrobe?.length || m.portrait || m.faceSheet || m.outfitSheet || m.sheet || photos.length > 0);
  const describeLink = hasPics && (
    <p className="small">
      <button className="link small" disabled={describing === "Looking…"} onClick={() => void describe()} title="Uses your connected agent (or a vision key) to inspect the pictures and write a description">
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
        {m.kind === "character" && (
          <div className="segmented small" role="group" aria-label="Character type" title="Humans split face & wardrobe; non-humans (pets, robots, dragons) use a full-body turnaround sheet">
            <button className={!m.nonHuman ? "on" : ""} onClick={() => edit((x) => void delete x.nonHuman)}>
              Human
            </button>
            <button className={m.nonHuman ? "on" : ""} onClick={() => edit((x) => void (x.nonHuman = true))}>
              Non-human
            </button>
          </div>
        )}
        <select value={m.kind} onChange={(e) => edit((x) => void (x.kind = e.target.value as Kind))} aria-label="Kind">
          {KINDS.map(([k, name]) => (
            <option key={k} value={k}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <TextField value={m.name} placeholder={`Name this ${m.kind === "character" && m.nonHuman ? "creature / non-human" : WORD[m.kind]}`} autoFocus={!m.name} onCommit={rename} />

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
        <div className="cast-make-bar">
          <span className="dim small">Image model</span>
          <CastModelPicker choices={choices} picks={picks} onChange={setPicks} price={price} />
          <select className="cast-count" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Takes per model" title="How many variations to generate from each selected model">
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} {activePicks.length > 1 ? "each" : n === 1 ? "take" : "takes"}
              </option>
            ))}
          </select>
          {activePicks.length > 1 && (
            <span className="cast-compare-chips small">
              {fits.map((f, i) => {
                const raw = activePicks[i]!;
                return (
                  <span key={raw} className="chip">
                    {f.label}
                    <button
                      className="link"
                      aria-label={`Remove ${f.label}`}
                      onClick={() => {
                        const next = activePicks.filter((x) => x !== raw);
                        setPicks(next.length ? next : undefined);
                      }}
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </span>
                );
              })}
            </span>
          )}
        </div>
        {m.kind === "character" && m.nonHuman ? (
          <NonHumanSteps
            key={look}
            projectId={projectId}
            member={m}
            variant={variant}
            plainLabel={PLAIN_LABEL[m.kind]}
            going={going.filter((j) => j.sheet === sheet)}
            canMake={!!activePicks.length && !sending}
            makeSummary={makeSummary}
            onMake={makeIt}
            edit={edit}
            describe={describeLink}
          />
        ) : m.kind === "character" ? (
          <CharacterSteps
            key={look}
            projectId={projectId}
            member={m}
            variant={variant}
            lookName={lookName}
            plainLabel={PLAIN_LABEL[m.kind]}
            going={going.filter((j) => j.sheet === sheet)}
            canMake={!!activePicks.length && !sending}
            makeSummary={makeSummary}
            onMake={makeIt}
            edit={edit}
            describe={describeLink}
          />
        ) : m.kind === "wardrobe" ? (
          <WardrobeSteps
            key={look}
            projectId={projectId}
            member={m}
            variant={variant}
            plainLabel={PLAIN_LABEL[m.kind]}
            going={going.filter((j) => j.sheet === sheet)}
            canMake={!!activePicks.length && !sending}
            makeSummary={makeSummary}
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
              memberId={m.id}
              variantId={variant?.id}
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
              <button className="primary" disabled={!activePicks.length || sending || !canMake} onClick={() => makeIt("sheet")}>
                {MAKE_WORD[m.kind]}
              </button>
              {makeSummary && <span className="dim small">{makeSummary}</span>}
            </div>
          </>
        )}
        {m.kind !== "character" && m.kind !== "wardrobe" && (
          <p className="dim small">
            {sources}. New ones wait in Kept until you drag one into a slot{given.length ? "" : " (the first goes into slot 1)"}.
          </p>
        )}
        <WhyNot choices={choices} />
        {(error || problem) && <p className="warn small">{error || problem}</p>}
        {failed && !error && (
          <Failed
            job={failed}
            what={
              failed.sheetKind === "face-sheet"
                ? "A 360° face sheet"
                : failed.sheetKind === "outfit-sheet"
                  ? "An outfit sheet"
                  : failed.sheetKind === "portrait" || failed.portrait
                    ? "A portrait"
                    : "A sheet"
            }
            retry={(j) => void retry(j)}
          />
        )}
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
 * Multi-model & route picker for generating cast portraits and sheets: click any model to use it alone, pick a route
 * pill when a model runs on multiple providers, or tick checkboxes on 2+ models to generate and compare side by side.
 */
function CastModelPicker({
  choices,
  picks,
  onChange,
  price,
}: {
  choices: Choices | undefined;
  picks: string[] | undefined;
  onChange: (next: string[] | undefined) => void;
  price: string;
}) {
  const [at, setAt] = useState<CSSProperties>();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setAt(undefined);

  useEffect(() => {
    if (!at) return;
    const out = (e: Event) => !panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", out, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", out, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  const open = () => {
    const r = button.current!.getBoundingClientRect();
    const width = Math.min(440, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setAt(r.bottom + 360 > window.innerHeight && r.top > window.innerHeight - r.bottom ? { left, bottom: window.innerHeight - r.top + 4, width } : { left, top: r.bottom + 4, width });
  };

  const ready = choices?.ready ?? [];
  const activePicks = (picks ?? (choices?.auto ? [choices.auto.model] : [])).filter((x) => !!fitOf(choices, x));
  const multiWhere = new Set(ready.flatMap((x) => [x.route, ...(x.also ?? []).map((o) => o.route)])).size > 1;
  const pickForModel = (modelId: string) => activePicks.find((x) => pickOf(x).model === modelId);
  const isPicked = (modelId: string) => !!pickForModel(modelId);

  const selectOnly = (value: string) => {
    onChange(value ? [value] : undefined);
    close();
  };

  const toggleModel = (modelId: string, on: boolean) => {
    const cur = picks ?? (choices?.auto ? [choices.auto.model] : []);
    const next = on ? [...cur.filter((x) => pickOf(x).model !== modelId), modelId] : cur.filter((x) => pickOf(x).model !== modelId);
    if (!next.length) return;
    onChange(next);
  };

  const setRoute = (modelId: string, route: string) => {
    const val = `${modelId}@${route}`;
    const cur = picks ?? (choices?.auto ? [choices.auto.model] : []);
    if (cur.some((x) => pickOf(x).model === modelId)) {
      onChange(cur.map((x) => (pickOf(x).model === modelId ? val : x)));
    } else {
      onChange([val]);
      close();
    }
  };

  const singleFit = activePicks.length === 1 ? fitOf(choices, activePicks[0]!) : undefined;
  const singleSel = activePicks.length === 1 ? pickOf(activePicks[0]!) : undefined;
  const buttonLabel = !picks?.length
    ? choices?.auto
      ? `Auto · ${choices.auto.label}`
      : "Auto"
    : activePicks.length === 1
      ? (singleFit?.label ?? modelLabel(singleSel?.model ?? activePicks[0]!))
      : `Compare ${activePicks.length} models`;
  const buttonCost =
    activePicks.length > 1
      ? price
      : singleFit
        ? [(multiWhere || !!singleSel?.via || !!singleFit.also?.length) && singleFit.where, cost(singleFit)].filter(Boolean).join(" · ")
        : "";

  const settings = (pane: string, text: string) => (
    <button className="link small" onClick={() => (close(), actions.setSettingsOpen(true, pane))}>
      {text}
    </button>
  );
  const onComfy = (f: Fit) => !f.ok && ((f.why.kind === "connect" && f.why.services.includes("comfy")) || (f.why.kind === "install" && f.why.service === "comfy"));
  const setup = choices?.setup ?? [];
  const off = (f: Fit) =>
    f.ok ? null : (
      <div key={f.model} className="model-row off">
        <span className="model-row-name">{f.label}</span>
        <span className="model-row-note">{f.why.reason}</span>
      </div>
    );

  const placesOf = (f: FitOk): FitOk[] => [f, ...(f.also ?? []).map((o) => ({ ...f, route: o.route, where: o.where, usd: o.usd, commercial: o.commercial, note: o.note, also: undefined }))];

  return (
    <>
      <button ref={button} className={`model-pick cast-model-pick ${at ? "open" : ""}`} onClick={() => (at ? close() : open())} aria-haspopup="menu" aria-expanded={!!at} title="Choose one image model or tick multiple to compare side by side">
        <span className="model-pick-name">{buttonLabel}</span>
        {buttonCost && <span className="model-pick-cost">{buttonCost}</span>}
        <Icon name="down" size={10} />
      </button>
      {at && (
        <div ref={panel} className="model-menu cast-model-menu" role="menu" style={at}>
          <button role="menuitemradio" aria-checked={!picks?.length} className={`model-row ${!picks?.length ? "on" : ""}`} onClick={() => selectOnly("")}>
            <span className="model-row-name">Auto</span>
            <span className="model-row-cost">{choices?.auto ? cost(choices.auto) : ""}</span>
            <span className="model-row-note">{choices?.auto ? `Best ready for this: ${choices.auto.label} on ${choices.auto.where}` : "Nothing can make this now"}</span>
          </button>
          {ready.length > 0 && (
            <h5>
              Ready <span className="spacer" />
              <span className="dim small" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                Tick multiple to compare
              </span>
            </h5>
          )}
          {ready.map((f) => {
            const raw = pickForModel(f.model);
            const selected = !!raw && !!picks?.length;
            const places = placesOf(f);
            const chosenVia = raw ? pickOf(raw).via : undefined;
            const active = (chosenVia ? places.find((x) => x.route === chosenVia) : undefined) ?? f;
            const showWhere = multiWhere || places.length > 1;
            return (
              <div key={f.model} className="model-item">
                <div className={`cast-model-row ${selected ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={isPicked(f.model)}
                    onChange={(e) => toggleModel(f.model, e.target.checked)}
                    aria-label={`Include ${f.label} in comparison`}
                    title="Tick to compare alongside other models"
                  />
                  <button className="model-row" onClick={() => selectOnly(raw ?? f.model)} title={`Use only ${f.label}`}>
                    <span className="model-row-name">
                      {active.label}
                      {showWhere && <span className="dim"> · {active.where}</span>}
                    </span>
                    <span className="model-row-cost">{cost(active)}</span>
                    {(active.note || active.commercial) && <span className="model-row-note">{[active.commercial && commercialWords(active.commercial), active.note].filter(Boolean).join(". ")}</span>}
                  </button>
                </div>
                {places.length > 1 && (
                  <div className="model-routes cast-model-routes" role="group" aria-label={`Where to run ${f.label}`}>
                    {places.map((x) => {
                      const on = isPicked(f.model) && active.route === x.route;
                      const tip = [x.commercial && commercialWords(x.commercial), x.note].filter(Boolean).join(". ") || undefined;
                      return (
                        <button key={x.route} type="button" className={`chip model-route ${on ? "on" : ""}`} onClick={() => setRoute(f.model, x.route)} title={tip}>
                          {x.where}
                          {x.usd !== undefined ? ` · ${cost(x)}` : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {setup.length > 0 && (
            <>
              <h5>
                Needs a key, a connection or an install <span className="spacer" />
                {setup.some((f) => !onComfy(f)) && settings("services", "Media services")}
                {setup.some(onComfy) && settings("make", "ComfyUI")}
              </h5>
              {setup.map(off)}
            </>
          )}
          {!!choices?.unfit.length && (
            <>
              <h5>Can&apos;t make this</h5>
              {choices.unfit.map(off)}
            </>
          )}
        </div>
      )}
    </>
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
  memberId,
  variantId,
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
  memberId: string;
  variantId?: string;
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
      if (!e.dataTransfer.types.includes(PICTURE_DRAG) && !hasFileDrop(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(spot);
    },
    onDrop: (e) => {
      setOver(undefined);
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files?.length) {
        void uploadCastPhotos(projectId, memberId, { files: Array.from(e.dataTransfer.files), look: variantId, role: "images" });
        return;
      }
      const d = JSON.parse(e.dataTransfer.getData(PICTURE_DRAG) || "{}") as Dragged;
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
        <AddPhotoTile
          projectId={projectId}
          memberId={memberId}
          variantId={variantId}
          role="images"
          existing={all}
          onPickAsset={(aid) => put(aid, undefined, g.length < PICTURES_EACH ? { row: "given", i: g.length } : { row: "kept", i: k.length })}
        />
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
