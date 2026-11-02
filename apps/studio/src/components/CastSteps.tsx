/**
 * A character's look, settled step by step: the photos its face comes from, what it wears, then a portrait chosen from
 * those made, then a sheet made from that portrait and chosen the same way. Models are given the chosen sheet (else
 * the chosen portrait), so a character is one picture, and one face, in every shot.
 */
import type { MakeJob } from "@beatsheet/engine";
import { lookGiven, type Asset, type CastLook, type CastMember } from "@beatsheet/schema";
import { useState, type HTMLAttributes, type ReactNode } from "react";
import { ASSET_DRAG, hideBroken, posterUrl } from "../lib";
import { useProject } from "../store";
import { madeWith, modelLabel } from "./Takes";
import { PopMenu, TextField } from "./ui";
import { Viewer } from "./Viewer";

type Variant = NonNullable<CastMember["variants"]>[number];
type Made = "portrait" | "sheet";
const OTHERS = { portrait: "portraits", sheet: "sheets" } as const;
/** Where a picture sits in a look's steps, to drag it from or drop it on. */
type Spot = "before" | "faces" | "wardrobe" | Made | "portraits" | "sheets";
/** A picture being dragged (PICTURE_DRAG): which, and where in the steps it's from (none for the footage). */
type Dragged = { asset?: string; from?: Spot };

/** A person's or a thing's own photo (brought in, recorded, a still from their footage), as the engine's ownPhotos tells. */
export const isOwnPhoto = (a: Asset | undefined) => a?.kind === "image" && !a.cutout && ["import", "capture", "recorded", undefined].includes(a.provenance?.source);

/** What's being dragged among cast pictures: from which look and row, or a photo from the footage (`asset`). */
export const PICTURE_DRAG = "application/x-beatsheet-picture";

export function CharacterSteps({
  projectId,
  member: m,
  variant,
  lookName,
  plainLabel,
  going,
  canMake,
  onMake,
  edit,
  describe,
}: {
  projectId: string;
  member: CastMember;
  variant?: Variant;
  lookName: string;
  plainLabel: string;
  /** Portraits and sheets of this look still being made. */
  going: MakeJob[];
  /** Whether making can start: a model is ready and nothing's being sent. */
  canMake: boolean;
  onMake: (portrait: boolean) => void;
  edit: (fn: (m: CastMember) => void) => void;
  /** Writing who they are from their pictures (a link), under the words. */
  describe?: ReactNode;
}) {
  const p = useProject();
  const [viewing, setViewing] = useState<{ row: "faces" | "wardrobe" | Made | "before"; items: string[]; at: number }>();
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const [cutting, setCutting] = useState("");
  // A picture being dragged within the steps, and the spot it's over.
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<Spot>();
  const look: CastLook = variant ?? m;
  const asset = (id?: string) => (id ? p.assets.find((a) => a.id === id) : undefined);
  const image = (id?: string) => asset(id)?.kind === "image";
  const editLook = (fn: (l: CastLook) => void, also?: (x: CastMember) => void) =>
    edit((x) => {
      fn(variant ? x.variants!.find((v) => v.id === variant.id)! : x);
      also?.(x);
    });
  const tidy = (l: CastLook) => {
    for (const k of ["images", "kept", "faces", "wardrobe", "portraits", "sheets"] as const) if (l[k] && !l[k]!.length && k !== "faces") delete l[k];
  };

  // Step 1: the face. Their own photos; a look also offers the plain look's settled face, and starts from it.
  const own = [...new Set([...(m.images ?? []), ...(m.kept ?? []), ...(m.seen ?? []).map((s) => s.asset)])].filter((a) => isOwnPhoto(asset(a)));
  const settled = variant ? [m.portrait, m.sheet, ...(m.images ?? [])].find(image) : undefined;
  const faceChoices = [...new Set([...(settled ? [settled] : []), ...own, ...(look.faces ?? [])])].filter(image);
  const faceDefault = variant && settled ? [settled] : own;
  const faces = look.faces ?? faceDefault;
  const toggleFace = (a: string) =>
    editLook((l) => {
      const now = l.faces ?? faceDefault;
      l.faces = now.includes(a) ? now.filter((x) => x !== a) : [...now, a];
    });

  // Step 2: the wardrobe. A look without pictures of its own wears the plain one's.
  const wardrobe = look.wardrobe ?? [];
  const inherited = variant && !wardrobe.length ? (m.wardrobe ?? []) : [];
  const fromPhoto = async (a: string) => {
    setMenu(undefined);
    setCutting("Cutting the clothes out of the photo…");
    const res = await fetch(`/api/projects/${projectId}/cast/${m.id}/wardrobe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset: a, ...(variant ? { look: variant.id } : {}) }),
    }).catch(() => undefined);
    const j = res ? ((await res.json()) as { cropped?: boolean; error?: string }) : { error: "Couldn't reach the engine" };
    setCutting(j.error ?? (j.cropped ? "" : "No face was found in it to cut below, so it's the whole photo, and the face in it may compete. Say the clothes in words too."));
  };
  /**
   * Puts a picture in a spot, moving it out of the one it came from (a picture from the Library or the footage is
   * added). A chosen portrait or sheet put aside joins the others, and one dropped on the chosen spot takes its place.
   */
  const put = (a: string, from: Spot | undefined, to: Exclude<Spot, "before">) =>
    editLook(
      (l) => {
        if (from === "before") {
          l.images = l.images?.filter((x) => x !== a);
          l.kept = l.kept?.filter((x) => x !== a);
        }
        if (from === "wardrobe" && to !== "wardrobe") l.wardrobe = l.wardrobe?.filter((x) => x !== a);
        for (const kind of ["portrait", "sheet"] as const)
          if (from === kind || from === OTHERS[kind]) {
            if (l[kind] === a) delete l[kind];
            l[OTHERS[kind]] = l[OTHERS[kind]]?.filter((x) => x !== a);
          }
        if (to === "faces") {
          // Their own photo joins the photos it's taken from; anything else becomes one of the faces chosen.
          if (!isOwnPhoto(asset(a))) l.faces = [...new Set([...(l.faces ?? faceDefault), a])];
          else if (l.faces && !l.faces.includes(a)) l.faces = [...l.faces, a];
        } else if (to === "wardrobe") l.wardrobe = [...(l.wardrobe ?? []).filter((x) => x !== a), a];
        else if (to === "portrait" || to === "sheet") {
          const prev = l[to];
          l[to] = a;
          l[OTHERS[to]] = [...(prev && prev !== a ? [prev] : []), ...(l[OTHERS[to]] ?? []).filter((x) => x !== a)];
        } else l[to] = [...(l[to] ?? []).filter((x) => x !== a), a];
        tidy(l);
      },
      (x) => void (to === "faces" && isOwnPhoto(asset(a)) && !x.seen?.some((s) => s.asset === a) && (x.seen = [...(x.seen ?? []), { asset: a }])),
    );
  const dragFrom = (from: Spot, a: string): HTMLAttributes<HTMLSpanElement> => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(PICTURE_DRAG, JSON.stringify({ asset: a, from } satisfies Dragged));
      e.dataTransfer.effectAllowed = "move";
      setDragging(true);
    },
    onDragEnd: () => {
      setDragging(false);
      setOver(undefined);
    },
  });
  const dropOn = (to: Exclude<Spot, "before">): HTMLAttributes<HTMLElement> => ({
    className: `take-strip ${over === to ? "drop-on" : ""}`,
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(ASSET_DRAG) && !e.dataTransfer.types.includes(PICTURE_DRAG)) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(to);
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(undefined),
    onDrop: (e) => {
      const d = JSON.parse(e.dataTransfer.getData(PICTURE_DRAG) || "{}") as Dragged;
      const a = e.dataTransfer.getData(ASSET_DRAG) || d.asset;
      setOver(undefined);
      setDragging(false);
      if (!a || !image(a)) return;
      e.preventDefault();
      e.stopPropagation();
      put(a, d.from, to);
    },
  });

  // Steps 3 and 4: the portrait, then the sheet made from it (a look's, or the plain one's).
  const choose = (kind: Made, a: string) =>
    editLook((l) => {
      const prev = l[kind];
      l[kind] = a;
      l[OTHERS[kind]] = [...(prev && prev !== a ? [prev] : []), ...(l[OTHERS[kind]] ?? []).filter((x) => x !== a)];
      tidy(l);
    });
  const takeOut = (kind: Made, a: string) =>
    editLook((l) => {
      if (l[kind] === a) delete l[kind];
      l[OTHERS[kind]] = (l[OTHERS[kind]] ?? []).filter((x) => x !== a);
      tidy(l);
    });
  const sheetFace = look.portrait ?? settled;

  // Pictures from before there were steps: given to models until a portrait or sheet is chosen.
  const before = [...(look.images ?? []), ...(look.kept ?? [])];
  const fromBefore = (a: string, to: Made | "faces" | "wardrobe" | null) =>
    editLook(
      (l) => {
        l.images = l.images?.filter((x) => x !== a);
        l.kept = l.kept?.filter((x) => x !== a);
        if (to === "portrait" || to === "sheet") {
          if (l[to]) l[OTHERS[to]] = [l[to]!, ...(l[OTHERS[to]] ?? [])];
          l[to] = a;
        } else if (to === "wardrobe") l.wardrobe = [...(l.wardrobe ?? []), a];
        else if (to === "faces" && l.faces) l.faces = [...l.faces, a];
        tidy(l);
      },
      // A face photo stays among their own, where the face is taken from.
      (x) => void (to === "faces" && !x.seen?.some((s) => s.asset === a) && (x.seen = [...(x.seen ?? []), { asset: a }])),
    );

  // What sorting would do: a made portrait or sheet goes to its step, their own photo to the face. (A photo brought in
  // can be tagged "portrait" for its shape, so only made pictures go by their tags.)
  const sortedAs = (a: string): Made | "faces" | undefined => {
    const x = asset(a);
    if (isOwnPhoto(x)) return "faces";
    if (x?.provenance?.source !== "generated") return undefined;
    return x.tags?.includes("portrait") ? "portrait" : x.tags?.includes("sheet") ? "sheet" : undefined;
  };
  const sortable = (() => {
    const n = { portrait: 0, sheet: 0, faces: 0 };
    for (const a of before) {
      const to = sortedAs(a);
      if (to) n[to]++;
    }
    const words = [n.portrait && `${n.portrait} portrait${n.portrait === 1 ? "" : "s"}`, n.sheet && `${n.sheet} sheet${n.sheet === 1 ? "" : "s"}`, n.faces && `${n.faces} photo${n.faces === 1 ? "" : "s"} to the face`].filter(Boolean);
    return { total: n.portrait + n.sheet + n.faces, words: words.join(", ") };
  })();
  const sortBefore = () =>
    editLook(
      (l) => {
        // The pictures given first come first, so the one in slot 1 becomes the chosen one.
        const keep = (list?: string[]) =>
          list?.filter((a) => {
            const to = sortedAs(a);
            if (to === "portrait" || to === "sheet") {
              if (!l[to]) l[to] = a;
              else if (l[to] !== a && !l[OTHERS[to]]?.includes(a)) l[OTHERS[to]] = [...(l[OTHERS[to]] ?? []), a];
            }
            return !to;
          });
        l.images = keep(l.images);
        l.kept = keep(l.kept);
        tidy(l);
      },
      (x) => {
        for (const a of before) if (sortedAs(a) === "faces" && !x.seen?.some((s) => s.asset === a)) x.seen = [...(x.seen ?? []), { asset: a }];
      },
    );

  const given = lookGiven(look);
  const gets = look.sheet
    ? "the chosen sheet"
    : look.portrait
      ? "the chosen portrait, until a sheet is chosen"
      : given.length
        ? `${Math.min(given.length, 3) === 1 ? "a picture" : `${Math.min(given.length, 3)} pictures`} from before the steps`
        : variant && lookGiven(m).length
          ? `the ${plainLabel.toLowerCase()} look's ${m.sheet ? "sheet" : m.portrait ? "portrait" : "pictures"}, with what's different in words`
          : "no picture yet, only the words";

  const by = (a: string) => madeWith(asset(a)) ?? (isOwnPhoto(asset(a)) ? "Photo" : undefined);
  const open = (row: NonNullable<typeof viewing>["row"], items: string[], a: string) => setViewing({ row, items, at: Math.max(0, items.indexOf(a)) });
  const pending = (kind: Made) =>
    going
      .filter((j) => !!j.portrait === (kind === "portrait"))
      .map((j) => (
        <span key={j.id} className="cast-pic">
          <div className="take pending" title={`A ${kind} from ${modelLabel(j.model)} on its way`}>
            {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
            <br />
            {modelLabel(j.model)}
          </div>
        </span>
      ));
  const made = (kind: Made) => {
    const chosen = look[kind];
    const others = look[OTHERS[kind]] ?? [];
    const all = [...(chosen ? [chosen] : []), ...others];
    return (
      <>
        <div {...dropOn(kind)}>
          {chosen ? (
            <Picture projectId={projectId} id={chosen} main by={by(chosen)} className="chosen" dnd={dragFrom(kind, chosen)} onOpen={() => open(kind, all, chosen)} />
          ) : (
            <span className="dim small cast-none">
              {kind === "portrait" && variant && settled ? `None of its own: its sheet takes the face from the ${plainLabel.toLowerCase()} look's.` : `No ${kind} chosen yet.`}
            </span>
          )}
        </div>
        {(others.length > 0 || dragging || going.some((j) => !!j.portrait === (kind === "portrait"))) && (
          <>
            <div className="dim small">
              Other {OTHERS[kind]} · {others.length}
              {others.length ? " · click one to see it large and choose it, or drag it onto the chosen one" : ""}
            </div>
            <div {...dropOn(OTHERS[kind])}>
              {others.map((a) => (
                <Picture key={a} projectId={projectId} id={a} by={by(a)} dnd={dragFrom(OTHERS[kind], a)} onOpen={() => open(kind, all, a)} onRemove={() => takeOut(kind, a)} />
              ))}
              {pending(kind)}
              {!others.length && <span className="dim small cast-none">Drop one here to keep it to choose from later.</span>}
            </div>
          </>
        )}
      </>
    );
  };

  return (
    <div className="cast-steps">
      <div className="cast-gets small">
        <span className="dim">Models get </span>
        {gets}
      </div>

      <Step n={1} done={faces.length > 0} title="Face" note={variant ? "· what this look's face starts from" : "· from their photos"}>
        <div {...dropOn("faces")}>
          {faceChoices.map((a) => (
            <Picture
              key={a}
              projectId={projectId}
              id={a}
              by={a === settled ? `${plainLabel}'s` : by(a)}
              off={!faces.includes(a)}
              tick={{ on: faces.includes(a), toggle: () => toggleFace(a) }}
              onOpen={() => open("faces", faceChoices, a)}
            />
          ))}
          {!faceChoices.length && <span className="dim small cast-none">No photos of them yet: right-click one in the Library to add it, or drag one here. Without any, portraits are made from the words.</span>}
        </div>
        <label>
          <span>
            Who they are <span className="dim">· in every look</span>
          </span>
          <TextField multiline value={m.about ?? ""} placeholder="A 17-year-old with long straight ginger-red hair, pale freckled skin, light eyes" onCommit={(v) => edit((x) => void (v.trim() ? (x.about = v.trim()) : delete x.about))} />
        </label>
        {describe}
      </Step>

      <Step n={2} done={!!(wardrobe.length || inherited.length || (variant ? variant.about : m.wears))} title="Wardrobe" note="· words, pictures, or both">
        <label>
          {variant ? "What's different in this look" : "What they wear"}
          {variant ? (
            <TextField
              multiline
              value={variant.about}
              placeholder="Soaked from the rain; a tiny black eye mask"
              onCommit={(t) => edit((x) => void (x.variants!.find((v) => v.id === variant.id)!.about = t))}
            />
          ) : (
            <TextField multiline value={m.wears ?? ""} placeholder="A dark wool doublet with a ruff, puffed breeches, a fake white beard on an elastic strap" onCommit={(v) => edit((x) => void (v.trim() ? (x.wears = v.trim()) : delete x.wears))} />
          )}
        </label>
        <div {...dropOn("wardrobe")}>
          {wardrobe.map((a) => (
            <Picture key={a} projectId={projectId} id={a} by={by(a)} dnd={dragFrom("wardrobe", a)} onOpen={() => open("wardrobe", wardrobe, a)} onRemove={() => editLook((l) => void ((l.wardrobe = l.wardrobe!.filter((x) => x !== a)), tidy(l)))} />
          ))}
          {inherited.map((a) => (
            <Picture key={a} projectId={projectId} id={a} borrowed by={by(a)} onOpen={() => open("wardrobe", inherited, a)} />
          ))}
          {!wardrobe.length && !inherited.length && <span className="dim small cast-none">Drag a picture of the clothes here (a costume photo from the Library), or:</span>}
        </div>
        <div className="make-row small">
          <button className="link small" disabled={!own.length || cutting.startsWith("Cutting")} onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })} title="The clothes they wear in one of their photos, cut below the face">
            As they wear it in a photo…
          </button>
          {cutting && <span className={cutting.startsWith("Cutting") ? "dim" : "warn"}>{cutting}</span>}
        </div>
        {menu && (
          <PopMenu {...menu} onClose={() => setMenu(undefined)}>
            {own.map((a) => (
              <button key={a} role="menuitem" onClick={() => void fromPhoto(a)}>
                {asset(a)?.label ?? a}
              </button>
            ))}
          </PopMenu>
        )}
      </Step>

      <Step n={3} done={!!look.portrait} title="Portrait" note="· head and shoulders, in this wardrobe">
        {made("portrait")}
        <div className="make-row">
          <button className={look.portrait ? "" : "primary"} disabled={!canMake} onClick={() => onMake(true)} title="Made from the face photos and the wardrobe">
            Make portraits
          </button>
        </div>
      </Step>

      <Step n={4} done={!!look.sheet} title="Sheet" note="· from the chosen portrait and the wardrobe">
        {made("sheet")}
        <div className="make-row">
          <button className={look.portrait && !look.sheet ? "primary" : ""} disabled={!canMake || !sheetFace} onClick={() => onMake(false)} title="The face once, close up, then the body from the front (cropped at the neck) and the back">
            Make sheets
          </button>
          {!sheetFace && <span className="dim small">Choose a portrait first: the sheet is made from it.</span>}
        </div>
      </Step>

      {before.length > 0 && (
        <details className="cast-fold" open>
          <summary>Pictures from before the steps · {before.length}</summary>
          <p className="dim small">Models get these until a portrait or sheet is chosen. Drag each onto its step, or click one to say what it is.</p>
          {sortable.total > 0 && (
            <p className="small">
              <button onClick={sortBefore} title="Made portraits and sheets go to their steps (the first of each, as it was ordered, becomes the chosen one); their own photos go to the face">
                Sort them
              </button>{" "}
              <span className="dim">{sortable.words}</span>
            </p>
          )}
          <div className="take-strip">
            {before.map((a) => (
              <Picture key={a} projectId={projectId} id={a} by={by(a)} dnd={dragFrom("before", a)} onOpen={() => open("before", before, a)} onRemove={() => fromBefore(a, null)} />
            ))}
          </div>
        </details>
      )}

      {viewing && (
        <Viewer
          projectId={projectId}
          items={viewing.items.map((a) => ({ id: a, caption: [a, madeWith(asset(a)) ? `made with ${madeWith(asset(a))}` : isOwnPhoto(asset(a)) ? "their own photo" : ""].filter(Boolean).join(" · ") }))}
          at={viewing.at}
          onClose={() => setViewing(undefined)}
          actions={(item) => {
            const a = item.id;
            const row = viewing.row;
            if (row === "faces")
              return <button onClick={() => toggleFace(a)}>{faces.includes(a) ? "Don't take the face from it" : "Take the face from it"}</button>;
            if (row === "wardrobe")
              return wardrobe.includes(a) ? (
                <button className="danger" onClick={() => editLook((l) => void ((l.wardrobe = l.wardrobe!.filter((x) => x !== a)), tidy(l)))}>
                  Take out
                </button>
              ) : null;
            if (row === "portrait" || row === "sheet")
              return (
                <>
                  {look[row] === a ? <span className="dim small">The chosen {row}</span> : <button onClick={() => choose(row, a)}>Use this one</button>}
                  <button className="danger" onClick={() => takeOut(row, a)}>
                    Take out
                  </button>
                </>
              );
            return (
              <>
                <button onClick={() => fromBefore(a, "portrait")}>It's the portrait</button>
                <button onClick={() => fromBefore(a, "sheet")}>It's the sheet</button>
                {isOwnPhoto(asset(a)) && <button onClick={() => fromBefore(a, "faces")}>A face photo</button>}
                <button onClick={() => fromBefore(a, "wardrobe")}>Wardrobe</button>
                <button className="danger" onClick={() => fromBefore(a, null)}>
                  Take out
                </button>
              </>
            );
          }}
        />
      )}
    </div>
  );
}

/** One step of a look: its number (a tick once it's done), its name, and what it's for. */
function Step({ n, done, title, note, children }: { n: number; done: boolean; title: string; note: string; children: ReactNode }) {
  return (
    <section className="cast-step">
      <div className="cast-step-head">
        <span className={`cast-step-n ${done ? "done" : ""}`}>{done ? "✓" : n}</span>
        <span className="cast-step-title">{title}</span>
        <span className="dim small">{note}</span>
      </div>
      {children}
    </section>
  );
}

/**
 * One picture: the main one outlined, a made one badged with its model (or "Photo"), a borrowed one faded. Clicking it
 * shows it large; a tick, where there is one, says whether it's used.
 */
export function Picture({
  projectId,
  id,
  main,
  borrowed,
  off,
  by,
  className = "",
  dnd,
  tick,
  onOpen,
  onRemove,
}: {
  projectId: string;
  id: string;
  main?: boolean;
  borrowed?: boolean;
  off?: boolean;
  by?: string;
  className?: string;
  dnd?: HTMLAttributes<HTMLSpanElement>;
  tick?: { on: boolean; toggle: () => void };
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const what = by === "Photo" ? "their own photo" : by === "Clip" ? "a clip" : by ? `made with ${by}` : "";
  const title = `${id}${main ? ": the chosen one" : ""}${what ? ` (${what})` : ""}. Click to see it large${dnd?.draggable ? "; drag to move it" : ""}`;
  return (
    <span className={`cast-pic ${borrowed ? "borrowed" : ""} ${off ? "off" : ""} ${className}`} {...dnd}>
      <button className={`take ${main ? "on" : ""}`} onClick={onOpen} title={title}>
        <img src={posterUrl(projectId, id)} alt="" onError={hideBroken} draggable={false} />
        {by && <span className="badge">{by}</span>}
      </button>
      {tick && (
        <button className={`cast-pic-tick ${tick.on ? "on" : ""}`} onClick={tick.toggle} title={tick.on ? "Used: click to leave it out" : "Not used: click to use it"} aria-label={tick.on ? "Leave it out" : "Use it"} aria-pressed={tick.on}>
          {tick.on ? "✓" : ""}
        </button>
      )}
      {onRemove && (
        <button className="cast-pic-remove" onClick={onRemove} title="Take this picture out" aria-label="Take this picture out">
          ×
        </button>
      )}
    </span>
  );
}
