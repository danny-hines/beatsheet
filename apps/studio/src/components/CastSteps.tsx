/**
 * A character's or wardrobe's look, settled step by step with decoupled face & wardrobe ingredients:
 * - Characters: Face photos + chosen Portrait → 360° Face Sheet, and Wardrobe (or shared @wardrobe + headwear mode) →
 *   headless/ghost-mannequin Outfit Sheet, plus a collapsible legacy Combined Sheet option. Models automatically get
 *   the format that works best for them (split 360° + outfit, single portrait + outfit, or procedural composite).
 * - Wardrobes: reusable headless front/back outfit turnarounds shared across characters and variants (clean vs tattered).
 */
import type { MakeJob, SheetKind } from "@beatsheet/engine";
import { characterIngredients, lookGiven, resolveWardrobe, type Asset, type CastLook, type CastMember, type HeadwearMode } from "@beatsheet/schema";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type HTMLAttributes, type ReactNode } from "react";
import { ASSET_DRAG, desktop, hideBroken, posterUrl } from "../lib";
import { actions, useProject } from "../store";
import { madeWith, modelLabel } from "./Takes";
import { PopMenu, TextField } from "./ui";
import { Viewer } from "./Viewer";
import { Icon } from "./Icon";

export type CastPhotoRole = "faces" | "wardrobe" | "images";

const IMAGE_FILE_RE = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Reads a browser File as base64 without the data-URL prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error(`Couldn't read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Uploads local file paths or File objects into a project and attaches them to a cast member's photo strip. */
export async function uploadCastPhotos(
  projectId: string,
  memberId: string,
  opts: { paths?: string[]; files?: File[]; look?: string; role: CastPhotoRole },
): Promise<{ assets?: string[]; error?: string }> {
  let paths = opts.paths?.filter(Boolean);
  let filesPayload: { name: string; data: string }[] | undefined;
  if (!paths?.length && opts.files?.length) {
    const imageFiles = opts.files.filter((f) => f.type.startsWith("image/") || IMAGE_FILE_RE.test(f.name));
    if (!imageFiles.length) return { error: "Only image files (JPG, PNG, WebP, HEIC) can be added as reference photos." };
    const pathFor = desktop?.pathFor;
    const desktopPaths = pathFor ? imageFiles.map((f) => pathFor(f)).filter(Boolean) : [];
    if (desktopPaths.length === imageFiles.length) paths = desktopPaths;
    else {
      filesPayload = await Promise.all(imageFiles.map(async (f) => ({ name: f.name, data: await fileToBase64(f) })));
    }
  }
  if (!paths?.length && !filesPayload?.length) return {};
  const res = await fetch(`/api/projects/${projectId}/cast/${memberId}/photos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(paths?.length ? { paths } : { files: filesPayload }),
      ...(opts.look ? { look: opts.look } : {}),
      role: opts.role,
    }),
  }).catch(() => undefined);
  if (!res) return { error: "Couldn't reach the engine" };
  const j = (await res.json().catch(() => ({}))) as { assets?: string[]; error?: string };
  return res.ok ? j : { error: j.error ?? "Couldn't add those photos" };
}

/** Whether a drag event carries OS files (from Finder / Explorer) in addition to in-app asset drags. */
export const hasFileDrop = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/**
 * Dashed "+ Add photo" tile that sits at the end of a reference-photo strip: lets the user pick photos from their
 * computer (native multi-select dialog in the desktop app, file input in a browser) or pick existing photos already
 * in the project library.
 */
export function AddPhotoTile({
  projectId,
  memberId,
  variantId,
  role,
  existing,
  onPickAsset,
  label = "Add photo",
  compact,
}: {
  projectId: string;
  memberId: string;
  variantId?: string;
  role: CastPhotoRole;
  existing: string[];
  onPickAsset: (assetId: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const p = useProject();
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const [libAt, setLibAt] = useState<CSSProperties>();
  const [libTab, setLibTab] = useState<"photos" | "generated" | "all">("photos");
  const [libQuery, setLibQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const libRef = useRef<HTMLDivElement>(null);

  const libraryImages = p.assets
    .filter((a) => a.kind === "image" && !a.cutout)
    .sort((a, b) => Number(isOwnPhoto(b)) - Number(isOwnPhoto(a)));
  const ownImages = libraryImages.filter((a) => isOwnPhoto(a));
  const generatedImages = libraryImages.filter((a) => !isOwnPhoto(a));
  const hasLibraryChoices = libraryImages.some((a) => !existing.includes(a.id));
  const q = libQuery.trim().toLowerCase();
  const shownImages = (libTab === "photos" ? ownImages : libTab === "generated" ? generatedImages : libraryImages).filter(
    (a) => !q || a.id.toLowerCase().includes(q) || (a.label ?? "").toLowerCase().includes(q) || (a.tags ?? []).some((t) => t.toLowerCase().includes(q)),
  );

  useEffect(() => {
    if (!libAt) return;
    const close = () => setLibAt(undefined);
    const out = (e: Event) => !libRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", out, true);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", out, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [libAt]);

  const fromComputer = async () => {
    setMenu(undefined);
    setErr("");
    if (desktop?.pickImages) {
      const paths = await desktop.pickImages();
      if (!paths?.length) return;
      setBusy(true);
      const r = await uploadCastPhotos(projectId, memberId, { paths, look: variantId, role });
      setBusy(false);
      if (r.error) setErr(r.error);
    } else if (desktop?.pickFootage) {
      const paths = await desktop.pickFootage("files");
      if (!paths?.length) return;
      setBusy(true);
      const r = await uploadCastPhotos(projectId, memberId, { paths, look: variantId, role });
      setBusy(false);
      if (r.error) setErr(r.error);
    } else {
      fileInput.current?.click();
    }
  };

  const onFilesPicked = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (fileInput.current) fileInput.current.value = "";
    if (!files.length) return;
    setErr("");
    setBusy(true);
    const r = await uploadCastPhotos(projectId, memberId, { files, look: variantId, role });
    setBusy(false);
    if (r.error) setErr(r.error);
  };

  const openLibrary = () => {
    setMenu(undefined);
    setLibTab(ownImages.length ? "photos" : "all");
    setLibQuery("");
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(540, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const spaceBelow = window.innerHeight - r.bottom - 16;
    const spaceAbove = r.top - 16;
    const openAbove = spaceBelow < 320 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(220, Math.min(460, openAbove ? spaceAbove : spaceBelow));
    setLibAt(openAbove ? { left, bottom: window.innerHeight - r.top + 6, width, maxHeight } : { left, top: r.bottom + 6, width, maxHeight });
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy) return;
    if (hasLibraryChoices) {
      setMenu({ x: e.clientX, y: e.clientY });
    } else {
      void fromComputer();
    }
  };

  return (
    <>
      <span className={`cast-pic cast-add-wrap ${compact ? "compact" : ""}`.trim()}>
        <button
          ref={btnRef}
          type="button"
          className="cast-add-photo"
          disabled={busy}
          onClick={onClick}
          title={hasLibraryChoices ? "Add photos from your computer or pick from this project's library (you can also drag image files here)" : "Choose photos from your computer (or drag image files here)"}
        >
          <span className="cast-add-plus">{busy ? "…" : "+"}</span>
          <span className="small">{busy ? "Adding…" : label}</span>
        </button>
        {err && <span className="warn small cast-add-err">{err}</span>}
      </span>
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        multiple
        hidden
        onChange={(e) => void onFilesPicked(e.target.files)}
      />
      {menu && (
        <PopMenu {...menu} onClose={() => setMenu(undefined)}>
          <button role="menuitem" onClick={() => void fromComputer()}>
            Choose from computer…
          </button>
          <button role="menuitem" onClick={openLibrary}>
            Pick from project library…
          </button>
        </PopMenu>
      )}
      {libAt && (
        <div ref={libRef} className="cast-lib-picker" style={libAt} role="dialog" aria-label="Pick photos from project library">
          <div className="cast-lib-head">
            <span className="small">Pick from project library</span>
            <span className="spacer" />
            <button type="button" className="link small" onClick={() => (setLibAt(undefined), void fromComputer())}>
              From computer…
            </button>
            <button type="button" className="link small" onClick={() => setLibAt(undefined)}>
              Done
            </button>
          </div>
          <div className="cast-lib-bar">
            <div className="segmented small" role="tablist" aria-label="Filter library images">
              <button type="button" role="tab" aria-selected={libTab === "photos"} className={libTab === "photos" ? "on" : ""} onClick={() => setLibTab("photos")}>
                Photos ({ownImages.length})
              </button>
              <button type="button" role="tab" aria-selected={libTab === "generated"} className={libTab === "generated" ? "on" : ""} onClick={() => setLibTab("generated")}>
                Generated ({generatedImages.length})
              </button>
              <button type="button" role="tab" aria-selected={libTab === "all"} className={libTab === "all" ? "on" : ""} onClick={() => setLibTab("all")}>
                All ({libraryImages.length})
              </button>
            </div>
            <input
              type="search"
              className="cast-lib-search small"
              placeholder="Filter by name or tag…"
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
              aria-label="Filter library images"
            />
          </div>
          <div className="cast-lib-grid">
            {shownImages.map((a) => {
              const has = existing.includes(a.id);
              const by = madeWith(a) ?? (isOwnPhoto(a) ? "Photo" : undefined);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`cast-lib-item ${has ? "has" : ""}`}
                  onClick={() => !has && onPickAsset(a.id)}
                  disabled={has}
                  title={has ? `${a.label ?? a.id} (already added)` : `Add ${a.label ?? a.id}`}
                >
                  <img src={posterUrl(projectId, a.id)} alt="" loading="lazy" onError={hideBroken} />
                  {by && <span className="badge">{by}</span>}
                  {has && (
                    <span className="cast-lib-check" aria-hidden="true">
                      <Icon name="check" size={11} />
                    </span>
                  )}
                </button>
              );
            })}
            {!shownImages.length && (
              <span className="dim small cast-lib-empty">
                {q ? "No images match that filter." : libTab === "photos" ? "No imported photos yet — use From computer… or switch to Generated." : "No images here."}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

type Variant = NonNullable<CastMember["variants"]>[number];
type Made = "portrait" | "faceSheet" | "outfitSheet" | "sheet";
const OTHERS: Record<Made, "portraits" | "faceSheets" | "outfitSheets" | "sheets"> = {
  portrait: "portraits",
  faceSheet: "faceSheets",
  outfitSheet: "outfitSheets",
  sheet: "sheets",
};
const MADE_LABEL: Record<Made, string> = {
  portrait: "portrait",
  faceSheet: "360° face sheet",
  outfitSheet: "outfit sheet",
  sheet: "combined sheet",
};
const MADE_PLURAL: Record<Made, string> = {
  portrait: "portraits",
  faceSheet: "face sheets",
  outfitSheet: "outfit sheets",
  sheet: "combined sheets",
};
/** Where a picture sits in a look's steps, to drag it from or drop it on. */
type Spot = "before" | "faces" | "wardrobe" | Made | "portraits" | "faceSheets" | "outfitSheets" | "sheets";
/** A picture being dragged (PICTURE_DRAG): which, and where in the steps it's from (none for the footage). */
type Dragged = { asset?: string; from?: Spot };

const jobMatches = (j: MakeJob, kind: Made) => {
  const sk: SheetKind = j.sheetKind ?? (j.portrait ? "portrait" : "sheet");
  return (
    (kind === "portrait" && sk === "portrait") ||
    (kind === "faceSheet" && sk === "face-sheet") ||
    (kind === "outfitSheet" && sk === "outfit-sheet") ||
    (kind === "sheet" && sk === "sheet")
  );
};

/** A person's or a thing's own photo (brought in, recorded, a still from their footage), as the engine's ownPhotos tells. */
export const isOwnPhoto = (a: Asset | undefined) => a?.kind === "image" && !a.cutout && ["import", "capture", "recorded", undefined].includes(a.provenance?.source);

/** What's being dragged among cast pictures: from which look and row, or a photo from the footage (`asset`). */
export const PICTURE_DRAG = "application/x-beatsheet-picture";

const HEADWEAR_OPTIONS: { value: HeadwearMode; label: string }[] = [
  { value: "none", label: "None — bare 360° head + headless outfit" },
  { value: "ghost", label: "Hat / hood / mask — ghost mannequin on outfit sheet" },
  { value: "face", label: "Attached to face — beard, wimple, glasses, facial wounds" },
];

export function CharacterSteps({
  projectId,
  member: m,
  variant,
  plainLabel,
  going,
  canMake,
  makeSummary,
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
  /** Short readout of the selected model(s) and count (e.g. "2× Nano Banana 2.1 · ~$0.08"). */
  makeSummary?: string;
  onMake: (sheetKind: SheetKind, opts?: { usePortrait?: boolean }) => void;
  edit: (fn: (m: CastMember) => void) => void;
  /** Writing who they are from their pictures (a link), under the words. */
  describe?: ReactNode;
}) {
  const p = useProject();
  const [viewing, setViewing] = useState<{ row: "faces" | "wardrobe" | Made | "before"; items: string[]; at: number }>();
  const [menu, setMenu] = useState<{ x: number; y: number }>();
  const [cutting, setCutting] = useState("");
  const [dropError, setDropError] = useState("");
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
    for (const k of ["images", "kept", "faces", "wardrobe", "portraits", "faceSheets", "outfitSheets", "sheets"] as const)
      if (l[k] && !l[k]!.length && k !== "faces") delete l[k];
  };

  // Step 1: face photos & portrait.
  const own = [...new Set([...(m.images ?? []), ...(m.kept ?? []), ...(m.seen ?? []).map((s) => s.asset)])].filter((a) => isOwnPhoto(asset(a)));
  const settled = variant ? [m.faceSheet, m.portrait, m.sheet, ...(m.images ?? [])].find(image) : undefined;
  const faceChoices = [...new Set([...(settled ? [settled] : []), ...own, ...(look.faces ?? [])])].filter(image);
  const faceDefault = variant && settled ? [settled] : own;
  const faces = look.faces ?? faceDefault;
  const [faceSource, setFaceSource] = useState<"photos" | "portrait">(faces.length > 0 ? "photos" : "portrait");
  const toggleFace = (a: string) =>
    editLook((l) => {
      const now = l.faces ?? faceDefault;
      l.faces = now.includes(a) ? now.filter((x) => x !== a) : [...now, a];
    });
  const removeFacePhoto = (a: string) =>
    editLook(
      (l) => {
        if (l.faces) l.faces = l.faces.filter((x) => x !== a);
        if (l.images) l.images = l.images.filter((x) => x !== a);
        if (l.kept) l.kept = l.kept.filter((x) => x !== a);
        tidy(l);
      },
      (x) => {
        if (!variant && x.seen) x.seen = x.seen.filter((s) => s.asset !== a);
      },
    );

  // Wardrobe & shared wardrobe options.
  const wardrobe = look.wardrobe ?? [];
  const inherited = variant && !wardrobe.length ? (m.wardrobe ?? []) : [];
  const headwear: HeadwearMode = look.headwear ?? (!variant ? "none" : m.headwear ?? "none");
  const sharedWardrobes = (p.cast ?? []).filter((c) => c.kind === "wardrobe");
  const linkedRef = look.outfit ?? (variant ? m.outfit : undefined);
  const linkedWardrobe = linkedRef ? resolveWardrobe(linkedRef, p.cast) : undefined;
  const linkedOwn = !!look.outfit;
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

  const saveAsWardrobe = () => {
    const baseText = (variant ? variant.about : m.wears) ?? "";
    const suggestedName = variant ? `${m.name || m.id} (${variant.id}) outfit` : `${m.name || m.id} outfit`;
    actions.edit((d) => {
      const cast = (d.cast ??= []);
      const taken = cast.map((x) => x.id);
      const baseSlug = `${m.id}${variant ? `-${variant.id}` : ""}-outfit`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "wardrobe";
      let newId = baseSlug;
      for (let n = 2; taken.includes(newId); n++) newId = `${baseSlug}-${n}`;
      const src = cast.find((x) => x.id === m.id);
      const srcLook = variant ? src?.variants?.find((v) => v.id === variant.id) : src;
      if (!src || !srcLook) return;
      cast.push({
        id: newId,
        name: suggestedName,
        kind: "wardrobe",
        ...(baseText.trim() ? { about: baseText.trim() } : {}),
        ...(srcLook.wardrobe?.length ? { wardrobe: [...srcLook.wardrobe] } : {}),
        ...(srcLook.outfitSheet ? { outfitSheet: srcLook.outfitSheet } : {}),
        ...(srcLook.outfitSheets?.length ? { outfitSheets: [...srcLook.outfitSheets] } : {}),
        ...(srcLook.headwear && srcLook.headwear !== "face" ? { headwear: srcLook.headwear } : {}),
      });
      srcLook.outfit = newId;
    });
  };

  const put = (a: string, from: Spot | undefined, to: Exclude<Spot, "before">) =>
    editLook(
      (l) => {
        if (from === "before") {
          l.images = l.images?.filter((x) => x !== a);
          l.kept = l.kept?.filter((x) => x !== a);
        }
        if (from === "wardrobe" && to !== "wardrobe") l.wardrobe = l.wardrobe?.filter((x) => x !== a);
        for (const kind of ["portrait", "faceSheet", "outfitSheet", "sheet"] as const)
          if (from === kind || from === OTHERS[kind]) {
            if (l[kind] === a) delete l[kind];
            l[OTHERS[kind]] = l[OTHERS[kind]]?.filter((x) => x !== a);
          }
        if (to === "faces") {
          if (!isOwnPhoto(asset(a))) l.faces = [...new Set([...(l.faces ?? faceDefault), a])];
          else if (l.faces && !l.faces.includes(a)) l.faces = [...l.faces, a];
        } else if (to === "wardrobe") l.wardrobe = [...(l.wardrobe ?? []).filter((x) => x !== a), a];
        else if (to === "portrait" || to === "faceSheet" || to === "outfitSheet" || to === "sheet") {
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
      const acceptFiles = (to === "faces" || to === "wardrobe") && hasFileDrop(e);
      if (!e.dataTransfer.types.includes(ASSET_DRAG) && !e.dataTransfer.types.includes(PICTURE_DRAG) && !acceptFiles) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(to);
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(undefined),
    onDrop: (e) => {
      setOver(undefined);
      setDragging(false);
      if ((to === "faces" || to === "wardrobe") && e.dataTransfer.files?.length) {
        e.preventDefault();
        e.stopPropagation();
        setDropError("");
        void uploadCastPhotos(projectId, m.id, { files: Array.from(e.dataTransfer.files), look: variant?.id, role: to }).then((r) => r.error && setDropError(r.error));
        return;
      }
      const d = JSON.parse(e.dataTransfer.getData(PICTURE_DRAG) || "{}") as Dragged;
      const a = e.dataTransfer.getData(ASSET_DRAG) || d.asset;
      if (!a || !image(a)) return;
      e.preventDefault();
      e.stopPropagation();
      put(a, d.from, to);
    },
  });

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
  const canMakeOutfit = !!(
    !linkedOwn &&
    (wardrobe.length || inherited.length || (variant ? variant.about : m.wears) || (variant && m.outfitSheet))
  );

  // Pictures from before there were steps: given to models until chosen sheets exist.
  const before = [...(look.images ?? []), ...(look.kept ?? [])];
  const fromBefore = (a: string, to: Made | "faces" | "wardrobe" | null) =>
    editLook(
      (l) => {
        l.images = l.images?.filter((x) => x !== a);
        l.kept = l.kept?.filter((x) => x !== a);
        if (to === "portrait" || to === "faceSheet" || to === "outfitSheet" || to === "sheet") {
          if (l[to]) l[OTHERS[to]] = [l[to]!, ...(l[OTHERS[to]] ?? [])];
          l[to] = a;
        } else if (to === "wardrobe") l.wardrobe = [...(l.wardrobe ?? []), a];
        else if (to === "faces" && l.faces) l.faces = [...l.faces, a];
        tidy(l);
      },
      (x) => void (to === "faces" && !x.seen?.some((s) => s.asset === a) && (x.seen = [...(x.seen ?? []), { asset: a }])),
    );

  const sortedAs = (a: string): Made | "faces" | undefined => {
    const x = asset(a);
    if (isOwnPhoto(x)) return "faces";
    if (x?.provenance?.source !== "generated") return undefined;
    if (x.tags?.includes("face-sheet")) return "faceSheet";
    if (x.tags?.includes("outfit-sheet")) return "outfitSheet";
    return x.tags?.includes("portrait") ? "portrait" : x.tags?.includes("sheet") ? "sheet" : undefined;
  };
  const sortable = (() => {
    const n = { portrait: 0, faceSheet: 0, outfitSheet: 0, sheet: 0, faces: 0 };
    for (const a of before) {
      const to = sortedAs(a);
      if (to) n[to]++;
    }
    const words = [
      n.portrait && `${n.portrait} portrait${n.portrait === 1 ? "" : "s"}`,
      n.faceSheet && `${n.faceSheet} face sheet${n.faceSheet === 1 ? "" : "s"}`,
      n.outfitSheet && `${n.outfitSheet} outfit sheet${n.outfitSheet === 1 ? "" : "s"}`,
      n.sheet && `${n.sheet} sheet${n.sheet === 1 ? "" : "s"}`,
      n.faces && `${n.faces} photo${n.faces === 1 ? "" : "s"} to the face`,
    ].filter(Boolean);
    return { total: n.portrait + n.faceSheet + n.outfitSheet + n.sheet + n.faces, words: words.join(", ") };
  })();
  const sortBefore = () =>
    editLook(
      (l) => {
        const keep = (list?: string[]) =>
          list?.filter((a) => {
            const to = sortedAs(a);
            if (to === "portrait" || to === "faceSheet" || to === "outfitSheet" || to === "sheet") {
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

  // What models receive, using canonical ingredients + procedural packaging.
  const ing = characterIngredients({ member: m, variant }, p.cast);
  const given = lookGiven(look);
  const hasDecoupledFace = !!(ing.faceSheet || ing.portrait);
  const gets = (() => {
    if (hasDecoupledFace && ing.outfitSheet) {
      const faceDesc = ing.faceSheet && ing.portrait ? "360° face sheet (or portrait on grid-sensitive models)" : ing.faceSheet ? "360° face sheet" : "chosen portrait";
      const outfitDesc = ing.wardrobeUse ? `@${ing.wardrobeUse.id} outfit sheet` : "outfit sheet";
      return `${faceDesc} + ${outfitDesc} — sent as separate role-bound refs, or auto-composited when a model's ref cap is tight`;
    }
    if (ing.legacySheet) return "the chosen combined sheet";
    if (ing.faceSheet) return "the 360° face sheet (add an outfit sheet to lock wardrobe)";
    if (ing.portrait) return "the chosen portrait, until a 360° face sheet + outfit sheet (or combined sheet) is chosen";
    if (ing.outfitSheet) return `${ing.wardrobeUse ? `@${ing.wardrobeUse.id} ` : ""}outfit sheet (add a portrait or 360° face sheet to lock likeness)`;
    if (given.length) return `${Math.min(given.length, 3) === 1 ? "a picture" : `${Math.min(given.length, 3)} pictures`} from before the steps`;
    return "no picture yet, only the words";
  })();

  const by = (a: string) => madeWith(asset(a)) ?? (isOwnPhoto(asset(a)) ? "Photo" : undefined);
  const open = (row: NonNullable<typeof viewing>["row"], items: string[], a: string) => setViewing({ row, items, at: Math.max(0, items.indexOf(a)) });
  const pending = (kind: Made) =>
    going
      .filter((j) => jobMatches(j, kind))
      .map((j) => (
        <span key={j.id} className="cast-pic">
          <div className="take pending" title={`A ${MADE_LABEL[kind]} from ${modelLabel(j.model)} on its way`}>
            {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
            <br />
            {modelLabel(j.model)}
          </div>
        </span>
      ));
  const made = (kind: Made, emptyHint?: string, inheritedPic?: string) => {
    const chosen = look[kind];
    const others = look[OTHERS[kind]] ?? [];
    const all = [...(chosen ? [chosen] : []), ...others];
    return (
      <>
        <div {...dropOn(kind)}>
          {chosen ? (
            <Picture projectId={projectId} id={chosen} main by={by(chosen)} className="chosen" dnd={dragFrom(kind, chosen)} onOpen={() => open(kind, all, chosen)} onRemove={() => takeOut(kind, chosen)} />
          ) : inheritedPic ? (
            <Picture projectId={projectId} id={inheritedPic} borrowed by={`From ${plainLabel}`} className="chosen" onOpen={() => open(kind, [inheritedPic], inheritedPic)} />
          ) : (
            <span className="dim small cast-none">{emptyHint ?? `No ${MADE_LABEL[kind]} chosen yet.`}</span>
          )}
        </div>
        {(others.length > 0 || dragging || going.some((j) => jobMatches(j, kind))) && (
          <>
            <div className="dim small">
              Other {MADE_PLURAL[kind]} · {others.length}
              {others.length ? " · click one to see it large and choose it, or drag it onto the chosen one" : ""}
            </div>
            <div {...dropOn(OTHERS[kind])}>
              {others.map((a) => (
                <Picture key={a} projectId={projectId} id={a} by={by(a)} dnd={dragFrom(OTHERS[kind], a)} onOpen={() => open(kind, all, a)} onChoose={() => choose(kind, a)} onRemove={() => takeOut(kind, a)} />
              ))}
              {pending(kind)}
              {!others.length && <span className="dim small cast-none">Drop one here to keep it to choose from later.</span>}
            </div>
          </>
        )}
      </>
    );
  };

  const hasLegacySheet = !!(look.sheet || look.sheets?.length || going.some((j) => jobMatches(j, "sheet")));
  const hasDecoupledReady = !!(ing.faceSheet && ing.outfitSheet);
  const hasFacePhotos = faces.length > 0;
  const hasOwnPortrait = !!look.portrait;
  const canFaceSheet = hasFacePhotos || !!sheetFace || !!m.about;
  const usePortraitForFaceSheet = hasOwnPortrait ? (!hasFacePhotos ? true : faceSource === "portrait") : !hasFacePhotos && !!sheetFace;

  return (
    <div className="cast-steps">
      <div className="cast-gets small">
        <span className="dim">Models get </span>
        {gets}
      </div>

      <Step n={1} done={!!(look.portrait || (variant && m.portrait))} title="Face & portrait" note={variant ? "· lock face if this look changes it" : "· photos + front likeness anchor"}>
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
              onRemove={a === settled ? undefined : () => removeFacePhoto(a)}
            />
          ))}
          <AddPhotoTile
            projectId={projectId}
            memberId={m.id}
            variantId={variant?.id}
            role="faces"
            existing={faceChoices}
            onPickAsset={(aid) => put(aid, undefined, "faces")}
          />
        </div>
        {dropError && <span className="warn small">{dropError}</span>}
        {!faceChoices.length && <span className="dim small cast-none">Add reference photos (or drag image files here). Without photos, portraits are generated from the description.</span>}
        <label>
          <span>
            Who they are <span className="dim">· {variant ? "shared across all looks" : "face, hair & build in every look"}</span>
          </span>
          <TextField multiline value={m.about ?? ""} placeholder="A 17-year-old with long straight ginger-red hair, pale freckled skin, light eyes" onCommit={(v) => edit((x) => void (v.trim() ? (x.about = v.trim()) : delete x.about))} />
        </label>
        {describe}
        {variant && (
          <label>
            <span>
              Face changes in this look <span className="dim">· only for this look&apos;s portrait &amp; 360° face sheet</span>
            </span>
            <TextField
              multiline
              value={variant.faceAbout ?? ""}
              placeholder="Stage blood smeared across brow and cheek; bruised eye; wet tangled hair (leave blank if the face doesn't change)"
              onCommit={(v) =>
                edit((x) => {
                  const target = x.variants!.find((item) => item.id === variant.id)!;
                  if (v.trim()) target.faceAbout = v.trim();
                  else delete target.faceAbout;
                })
              }
            />
          </label>
        )}
        <div className="cast-step-sub">
          {made(
            "portrait",
            variant && m.portrait ? `Inherits ${plainLabel}'s portrait unless this look alters the face (headwear/wounds).` : "No portrait chosen yet.",
            variant && headwear !== "face" ? m.portrait : undefined,
          )}
          <div className="make-row">
            <button className={!look.portrait && !(variant && headwear !== "face" && m.portrait) ? "primary" : ""} disabled={!canMake} onClick={() => onMake("portrait")} title="Head-and-shoulders likeness anchor (bare shoulders unless headwear is attached to face)">
              Make portraits
            </button>
            {makeSummary && <span className="dim small">{makeSummary}</span>}
          </div>
        </div>
      </Step>

      <Step n={2} done={!!(look.faceSheet || (variant && headwear !== "face" && m.faceSheet))} title="360° face sheet" note="· 6-angle bare turnaround">
        {made(
          "faceSheet",
          variant && m.faceSheet && headwear !== "face"
            ? `Inherits ${plainLabel}'s 360° face sheet — no need to remake unless the face changes.`
            : usePortraitForFaceSheet
              ? "No 360° face sheet yet. Generated from the chosen portrait + angled face photos."
              : "No 360° face sheet yet. Generated directly from your selected face photos.",
          variant && headwear !== "face" ? m.faceSheet : undefined,
        )}
        {hasFacePhotos && hasOwnPortrait && (
          <div className="cast-source-row small">
            <span className="dim">Source</span>
            <div className="segmented small" role="group" aria-label="360° face sheet source">
              <button
                type="button"
                className={faceSource === "photos" ? "on" : ""}
                onClick={() => setFaceSource("photos")}
                title="Generate directly from your selected Step 1 face references (ignores the chosen portrait)"
              >
                Face refs ({faces.length})
              </button>
              <button
                type="button"
                className={faceSource === "portrait" ? "on" : ""}
                onClick={() => setFaceSource("portrait")}
                title="Anchor on this look's chosen portrait first, with Step 1 refs for side angles"
              >
                Portrait + refs
              </button>
            </div>
          </div>
        )}
        <div className="make-row">
          <button
            className={canFaceSheet && !look.faceSheet && !(variant && headwear !== "face" && m.faceSheet) ? "primary" : ""}
            disabled={!canMake || !canFaceSheet}
            onClick={() => onMake("face-sheet", { usePortrait: usePortraitForFaceSheet })}
            title="3×2 six-panel turnaround (left profile, front, right profile, left 3/4, back, right 3/4) on neutral mid-gray"
          >
            Make 360° face sheet
          </button>
          {!canFaceSheet ? <span className="dim small">Add face photos, a description, or choose a portrait first.</span> : makeSummary && <span className="dim small">{makeSummary}</span>}
        </div>
      </Step>

      <Step n={3} done={!!(linkedRef || wardrobe.length || inherited.length || (variant ? variant.about : m.wears))} title="Wardrobe" note="· outfit description, shared wardrobe & headwear">
        <label>
          <span>Shared wardrobe</span>
          <div className="cast-wardrobe-link">
            <select
              value={look.outfit ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                editLook((l) => {
                  if (v) l.outfit = v;
                  else delete l.outfit;
                });
              }}
              aria-label="Shared wardrobe"
            >
              <option value="">{variant && m.outfit ? `Inherit ${plainLabel}'s (@${m.outfit})` : "Custom for this character"}</option>
              {sharedWardrobes.map((w) => [
                <option key={w.id} value={w.id}>
                  @{w.id} — {w.name || w.id}
                </option>,
                ...(w.variants ?? []).map((v) => (
                  <option key={`${w.id}/${v.id}`} value={`${w.id}/${v.id}`}>
                    @{w.id}/{v.id} — {w.name || w.id} ({v.id})
                  </option>
                )),
              ])}
            </select>
            {linkedWardrobe && (
              <button className="link small" onClick={() => actions.openCast(linkedWardrobe.member.id)} title="Open this reusable wardrobe">
                Open @{linkedWardrobe.member.id}
              </button>
            )}
            {!look.outfit && (look.outfitSheet || (variant ? variant.about : m.wears)) && (
              <button className="link small" onClick={saveAsWardrobe} title="Extract this costume into a reusable Wardrobe entry other characters can wear">
                Save as reusable wardrobe
              </button>
            )}
          </div>
        </label>
        <label>
          <span>Headwear &amp; face accessories</span>
          <select
            value={look.headwear ?? ""}
            onChange={(e) => {
              const v = e.target.value as HeadwearMode | "";
              editLook((l) => {
                if (v) l.headwear = v;
                else delete l.headwear;
              });
            }}
            aria-label="Headwear mode"
          >
            {variant && <option value="">Inherit {plainLabel}&apos;s ({m.headwear ?? "none"})</option>}
            {HEADWEAR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {variant ? (
            <span>
              Outfit changes in this look <span className="dim">· only for this look&apos;s outfit sheet &amp; shots</span>
            </span>
          ) : (
            "What they wear"
          )}
          {variant ? (
            <TextField
              multiline
              value={variant.about}
              placeholder="Battle-tattered & mud-splattered doublet; dark stains down the front; torn sleeve"
              onCommit={(t) => edit((x) => void (x.variants!.find((v) => v.id === variant.id)!.about = t))}
            />
          ) : (
            <TextField multiline value={m.wears ?? ""} placeholder="Dark wool doublet with ruff collar, puffed breeches, scuffed leather boots" onCommit={(v) => edit((x) => void (v.trim() ? (x.wears = v.trim()) : delete x.wears))} />
          )}
        </label>
        <div {...dropOn("wardrobe")}>
          {wardrobe.map((a) => (
            <Picture key={a} projectId={projectId} id={a} by={by(a)} dnd={dragFrom("wardrobe", a)} onOpen={() => open("wardrobe", wardrobe, a)} onRemove={() => editLook((l) => void ((l.wardrobe = l.wardrobe!.filter((x) => x !== a)), tidy(l)))} />
          ))}
          {inherited.map((a) => (
            <Picture key={a} projectId={projectId} id={a} borrowed by={by(a)} onOpen={() => open("wardrobe", inherited, a)} />
          ))}
          <AddPhotoTile
            projectId={projectId}
            memberId={m.id}
            variantId={variant?.id}
            role="wardrobe"
            existing={[...wardrobe, ...inherited]}
            onPickAsset={(aid) => put(aid, undefined, "wardrobe")}
            label="Add costume photo"
          />
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

      <Step
        n={4}
        done={!!ing.outfitSheet}
        title="Outfit sheet"
        note={
          linkedWardrobe
            ? `· from shared @${linkedRef}`
            : headwear === "ghost"
              ? "· front & back ghost mannequin (includes hat/hood/mask)"
              : "· headless front & back turnaround"
        }
      >
        {linkedWardrobe ? (
          <div className="take-strip">
            {ing.outfitSheet ? (
              <Picture projectId={projectId} id={ing.outfitSheet} borrowed by={`@${linkedRef}`} className="chosen" onOpen={() => open("outfitSheet", [ing.outfitSheet!], ing.outfitSheet!)} />
            ) : (
              <span className="dim small cast-none">
                Linked to @{linkedRef}, which has no outfit sheet yet.{" "}
                <button className="link small" onClick={() => actions.openCast(linkedWardrobe.member.id)}>
                  Open @{linkedWardrobe.member.id} to make it
                </button>
              </span>
            )}
          </div>
        ) : (
          <>
            {made(
              "outfitSheet",
              variant && m.outfitSheet
                ? `No variant outfit sheet yet — generating one edits directly from ${plainLabel}'s outfit sheet.`
                : "No outfit sheet yet. Generated headless on neutral mid-gray (no face sent).",
              variant && !look.outfitSheet ? m.outfitSheet : undefined,
            )}
            <div className="make-row">
              <button
                className={canMakeOutfit && !look.outfitSheet ? "primary" : ""}
                disabled={!canMake || !canMakeOutfit}
                onClick={() => onMake("outfit-sheet")}
                title="2-panel front and back headless outfit turnaround on neutral mid-gray (zero face photos sent)"
              >
                Make outfit sheet
              </button>
              {!canMakeOutfit ? <span className="dim small">Describe what they wear or drop a wardrobe photo first.</span> : makeSummary && <span className="dim small">{makeSummary}</span>}
            </div>
          </>
        )}
      </Step>

      <details className="cast-fold" open={hasLegacySheet && !hasDecoupledReady}>
        <summary>Combined sheet (legacy / manual){look.sheet ? " · chosen" : ""}</summary>
        <p className="dim small">
          Optional single-image face + body turnaround. When a 360° face sheet (or portrait) and outfit sheet are set above, beatsheet automatically supplies them separately or composites them to fit each model.
        </p>
        {made("sheet", "No combined sheet chosen.")}
        <div className="make-row">
          <button disabled={!canMake || !sheetFace} onClick={() => onMake("sheet")} title="Legacy 16:9 sheet: close-up face + front body (cropped at neck) + back body">
            Make combined sheet
          </button>
          {!sheetFace ? <span className="dim small">Choose a portrait first.</span> : makeSummary && <span className="dim small">{makeSummary}</span>}
        </div>
      </details>

      {before.length > 0 && (
        <details className="cast-fold" open>
          <summary>Pictures from before the steps · {before.length}</summary>
          <p className="dim small">Models get these until a portrait or sheet is chosen. Drag each onto its step, or click one to say what it is.</p>
          {sortable.total > 0 && (
            <p className="small">
              <button onClick={sortBefore} title="Made portraits and sheets go to their steps; their own photos go to the face">
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

      {viewing && (() => {
        const liveItems = (() => {
          const row = viewing.row;
          if (row === "faces") return faceChoices;
          if (row === "wardrobe") return wardrobe.length ? wardrobe : inherited;
          if (row === "before") return before;
          if (row === "outfitSheet" && linkedWardrobe) return ing.outfitSheet ? [ing.outfitSheet] : [];
          const c = look[row];
          const rest = look[OTHERS[row]] ?? [];
          if (!c && !rest.length) return viewing.items;
          return [...(c ? [c] : []), ...rest];
        })();
        return (
          <Viewer
            projectId={projectId}
            items={liveItems.map((a) => ({ id: a, caption: [a, madeWith(asset(a)) ? `made with ${madeWith(asset(a))}` : isOwnPhoto(asset(a)) ? "their own photo" : ""].filter(Boolean).join(" · ") }))}
            at={Math.min(viewing.at, Math.max(0, liveItems.length - 1))}
            onClose={() => setViewing(undefined)}
            actions={(item) => {
              const a = item.id;
              const row = viewing.row;
              if (row === "faces")
                return (
                  <>
                    <button onClick={() => toggleFace(a)}>{faces.includes(a) ? "Don't take the face from it" : "Take the face from it"}</button>
                    {a !== settled && (
                      <button className="danger" onClick={() => (removeFacePhoto(a), setViewing(undefined))}>
                        Remove photo
                      </button>
                    )}
                  </>
                );
              if (row === "wardrobe")
                return wardrobe.includes(a) ? (
                  <button className="danger" onClick={() => editLook((l) => void ((l.wardrobe = l.wardrobe!.filter((x) => x !== a)), tidy(l)))}>
                    Take out
                  </button>
                ) : null;
              if (row === "outfitSheet" && linkedWardrobe)
                return <span className="dim small">From shared @{linkedRef}</span>;
              if (row === "portrait" || row === "faceSheet" || row === "outfitSheet" || row === "sheet")
                return (
                  <>
                    {look[row] === a ? (
                      <span className="dim small">Chosen {MADE_LABEL[row]}</span>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => {
                          choose(row, a);
                          setViewing(undefined);
                        }}
                      >
                        Use this one
                      </button>
                    )}
                    {(look[row] === a || look[OTHERS[row]]?.includes(a)) && (
                      <button className="danger" onClick={() => takeOut(row, a)}>
                        Take out
                      </button>
                    )}
                  </>
                );
              return (
                <>
                  <button onClick={() => fromBefore(a, "portrait")}>It&apos;s the portrait</button>
                  <button onClick={() => fromBefore(a, "faceSheet")}>It&apos;s the 360° face sheet</button>
                  <button onClick={() => fromBefore(a, "outfitSheet")}>It&apos;s the outfit sheet</button>
                  <button onClick={() => fromBefore(a, "sheet")}>It&apos;s the combined sheet</button>
                  {isOwnPhoto(asset(a)) && <button onClick={() => fromBefore(a, "faces")}>A face photo</button>}
                  <button onClick={() => fromBefore(a, "wardrobe")}>Wardrobe</button>
                  <button className="danger" onClick={() => fromBefore(a, null)}>
                    Take out
                  </button>
                </>
              );
            }}
          />
        );
      })()}
    </div>
  );
}

/** Reusable wardrobe entry: headless front & back outfit sheet (with optional ghost-mannequin headwear) worn by characters. */
export function WardrobeSteps({
  projectId,
  member: m,
  variant,
  plainLabel,
  going,
  canMake,
  makeSummary,
  onMake,
  edit,
  describe,
}: {
  projectId: string;
  member: CastMember;
  variant?: Variant;
  plainLabel: string;
  going: MakeJob[];
  canMake: boolean;
  makeSummary?: string;
  onMake: (sheetKind: SheetKind) => void;
  edit: (fn: (m: CastMember) => void) => void;
  describe?: ReactNode;
}) {
  const p = useProject();
  const [viewing, setViewing] = useState<{ row: "wardrobe" | "outfitSheet"; items: string[]; at: number }>();
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<"wardrobe" | "outfitSheet" | "outfitSheets">();
  const look: CastLook = variant ?? m;
  const asset = (id?: string) => (id ? p.assets.find((a) => a.id === id) : undefined);
  const image = (id?: string) => asset(id)?.kind === "image";
  const editLook = (fn: (l: CastLook) => void) => edit((x) => fn(variant ? x.variants!.find((v) => v.id === variant.id)! : x));
  const tidy = (l: CastLook) => {
    for (const k of ["wardrobe", "outfitSheets"] as const) if (l[k] && !l[k]!.length) delete l[k];
  };
  const wardrobe = look.wardrobe ?? [];
  const inherited = variant && !wardrobe.length ? (m.wardrobe ?? []) : [];
  const headwear: HeadwearMode = look.headwear ?? (!variant ? "none" : m.headwear ?? "none");
  const chosen = look.outfitSheet;
  const others = look.outfitSheets ?? [];
  const all = [...(chosen ? [chosen] : []), ...others];
  const by = (a: string) => madeWith(asset(a)) ?? (isOwnPhoto(asset(a)) ? "Photo" : undefined);

  const wornBy = (p.cast ?? []).filter(
    (c) =>
      c.kind === "character" &&
      (c.outfit === m.id || c.outfit?.startsWith(`${m.id}/`) || c.variants?.some((v) => v.outfit === m.id || v.outfit?.startsWith(`${m.id}/`))),
  );

  const choose = (a: string) =>
    editLook((l) => {
      const prev = l.outfitSheet;
      l.outfitSheet = a;
      l.outfitSheets = [...(prev && prev !== a ? [prev] : []), ...(l.outfitSheets ?? []).filter((x) => x !== a)];
      tidy(l);
    });
  const takeOut = (a: string) =>
    editLook((l) => {
      if (l.outfitSheet === a) delete l.outfitSheet;
      l.outfitSheets = (l.outfitSheets ?? []).filter((x) => x !== a);
      tidy(l);
    });

  const put = (a: string, from: Spot | undefined, to: "wardrobe" | "outfitSheet" | "outfitSheets") =>
    editLook((l) => {
      if (from === "wardrobe" && to !== "wardrobe") l.wardrobe = l.wardrobe?.filter((x) => x !== a);
      if (from === "outfitSheet" || from === "outfitSheets") {
        if (l.outfitSheet === a) delete l.outfitSheet;
        l.outfitSheets = l.outfitSheets?.filter((x) => x !== a);
      }
      if (to === "wardrobe") l.wardrobe = [...(l.wardrobe ?? []).filter((x) => x !== a), a];
      else if (to === "outfitSheet") {
        const prev = l.outfitSheet;
        l.outfitSheet = a;
        l.outfitSheets = [...(prev && prev !== a ? [prev] : []), ...(l.outfitSheets ?? []).filter((x) => x !== a)];
      } else l.outfitSheets = [...(l.outfitSheets ?? []).filter((x) => x !== a), a];
      tidy(l);
    });

  const dragFrom = (from: "wardrobe" | "outfitSheet" | "outfitSheets", a: string): HTMLAttributes<HTMLSpanElement> => ({
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

  const dropOn = (to: "wardrobe" | "outfitSheet" | "outfitSheets"): HTMLAttributes<HTMLElement> => ({
    className: `take-strip ${over === to ? "drop-on" : ""}`,
    onDragOver: (e) => {
      const acceptFiles = to === "wardrobe" && hasFileDrop(e);
      if (!e.dataTransfer.types.includes(ASSET_DRAG) && !e.dataTransfer.types.includes(PICTURE_DRAG) && !acceptFiles) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(to);
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(undefined),
    onDrop: (e) => {
      setOver(undefined);
      setDragging(false);
      if (to === "wardrobe" && e.dataTransfer.files?.length) {
        e.preventDefault();
        e.stopPropagation();
        void uploadCastPhotos(projectId, m.id, { files: Array.from(e.dataTransfer.files), look: variant?.id, role: "wardrobe" });
        return;
      }
      const d = JSON.parse(e.dataTransfer.getData(PICTURE_DRAG) || "{}") as Dragged;
      const a = e.dataTransfer.getData(ASSET_DRAG) || d.asset;
      if (!a || !image(a)) return;
      e.preventDefault();
      e.stopPropagation();
      put(a, d.from, to);
    },
  });

  const canMakeOutfit = !!(wardrobe.length || inherited.length || (variant ? variant.about : m.about) || (variant && m.outfitSheet));

  return (
    <div className="cast-steps">
      <div className="cast-gets small">
        <span className="dim">Reusable wardrobe · </span>
        {wornBy.length ? (
          <>
            worn by{" "}
            {wornBy.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <button className="link small mono" onClick={() => actions.openCast(c.id)}>
                  @{c.id}
                </button>
              </span>
            ))}
          </>
        ) : (
          "link this from any character's Wardrobe step so multiple actors can wear it consistently"
        )}
      </div>

      <Step n={1} done={!!(wardrobe.length || inherited.length || (variant ? variant.about : m.about))} title="Garment & headwear" note="· costume details & reference photos">
        <label>
          {variant ? "What's different in this state" : "What the outfit looks like"}
          {variant ? (
            <TextField
              multiline
              value={variant.about}
              placeholder="Battle-tattered, torn sleeves, mud-splattered hem"
              onCommit={(t) => edit((x) => void (x.variants!.find((v) => v.id === variant.id)!.about = t))}
            />
          ) : (
            <TextField
              multiline
              value={m.about ?? ""}
              placeholder="Heavy black Renaissance hooded inquisitor robe with silver clasp, leather belt, matte white mask"
              onCommit={(v) => edit((x) => void (v.trim() ? (x.about = v.trim()) : delete x.about))}
            />
          )}
        </label>
        {!variant && describe}
        <label>
          <span>Headwear</span>
          <select
            value={look.headwear ?? ""}
            onChange={(e) => {
              const v = e.target.value as HeadwearMode | "";
              editLook((l) => {
                if (v) l.headwear = v;
                else delete l.headwear;
              });
            }}
            aria-label="Wardrobe headwear mode"
          >
            {variant && <option value="">Inherit {plainLabel}&apos;s ({m.headwear ?? "none"})</option>}
            <option value="none">None — headless collarless outfit</option>
            <option value="ghost">Hat / hood / helmet / mask — ghost mannequin over empty void</option>
          </select>
        </label>
        <div {...dropOn("wardrobe")}>
          {wardrobe.map((a) => (
            <Picture
              key={a}
              projectId={projectId}
              id={a}
              by={by(a)}
              dnd={dragFrom("wardrobe", a)}
              onOpen={() => setViewing({ row: "wardrobe", items: wardrobe, at: wardrobe.indexOf(a) })}
              onRemove={() => editLook((l) => void ((l.wardrobe = l.wardrobe!.filter((x) => x !== a)), tidy(l)))}
            />
          ))}
          {inherited.map((a) => (
            <Picture key={a} projectId={projectId} id={a} borrowed by={by(a)} onOpen={() => setViewing({ row: "wardrobe", items: inherited, at: inherited.indexOf(a) })} />
          ))}
          <AddPhotoTile
            projectId={projectId}
            memberId={m.id}
            variantId={variant?.id}
            role="wardrobe"
            existing={[...wardrobe, ...inherited]}
            onPickAsset={(aid) => editLook((l) => void (l.wardrobe = [...(l.wardrobe ?? []).filter((x) => x !== aid), aid]))}
            label="Add costume photo"
          />
        </div>
      </Step>

      <Step n={2} done={!!chosen} title="Outfit sheet" note={headwear === "ghost" ? "· ghost-mannequin front & back" : "· headless front & back"}>
        <div {...dropOn("outfitSheet")}>
          {chosen ? (
            <Picture projectId={projectId} id={chosen} main by={by(chosen)} className="chosen" dnd={dragFrom("outfitSheet", chosen)} onOpen={() => setViewing({ row: "outfitSheet", items: all, at: 0 })} onRemove={() => takeOut(chosen)} />
          ) : variant && m.outfitSheet ? (
            <Picture projectId={projectId} id={m.outfitSheet} borrowed by={`From ${plainLabel}`} className="chosen" onOpen={() => setViewing({ row: "outfitSheet", items: [m.outfitSheet!], at: 0 })} />
          ) : (
            <span className="dim small cast-none">No outfit sheet yet.</span>
          )}
        </div>
        {(others.length > 0 || dragging || going.length > 0) && (
          <>
            <div className="dim small">
              Other outfit sheets · {others.length}
              {others.length ? " · click one to see it large and choose it, or drag it onto the chosen one" : ""}
            </div>
            <div {...dropOn("outfitSheets")}>
              {others.map((a) => (
                <Picture
                  key={a}
                  projectId={projectId}
                  id={a}
                  by={by(a)}
                  dnd={dragFrom("outfitSheets", a)}
                  onOpen={() => setViewing({ row: "outfitSheet", items: all, at: all.indexOf(a) })}
                  onChoose={() => choose(a)}
                  onRemove={() => takeOut(a)}
                />
              ))}
              {going.map((j) => (
                <span key={j.id} className="cast-pic">
                  <div className="take pending">
                    {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
                    <br />
                    {modelLabel(j.model)}
                  </div>
                </span>
              ))}
              {!others.length && <span className="dim small cast-none">Drop one here to keep it to choose from later.</span>}
            </div>
          </>
        )}
        <div className="make-row">
          <button className={!chosen && canMakeOutfit ? "primary" : ""} disabled={!canMake || !canMakeOutfit} onClick={() => onMake("outfit-sheet")}>
            Make outfit sheet
          </button>
          {makeSummary && <span className="dim small">{makeSummary}</span>}
          {variant && m.outfitSheet && <span className="dim small">Edits directly from {plainLabel}&apos;s outfit sheet to preserve cut &amp; seams.</span>}
        </div>
      </Step>

      {viewing && (() => {
        const liveItems = viewing.row === "wardrobe" ? (wardrobe.length ? wardrobe : inherited) : all.length ? all : viewing.items;
        return (
          <Viewer
            projectId={projectId}
            items={liveItems.map((a) => ({ id: a, caption: [a, madeWith(asset(a)) ? `made with ${madeWith(asset(a))}` : ""].filter(Boolean).join(" · ") }))}
            at={Math.min(viewing.at, Math.max(0, liveItems.length - 1))}
            onClose={() => setViewing(undefined)}
            actions={(item) => {
              const a = item.id;
              if (viewing.row === "wardrobe")
                return wardrobe.includes(a) ? (
                  <button className="danger" onClick={() => editLook((l) => void ((l.wardrobe = l.wardrobe!.filter((x) => x !== a)), tidy(l)))}>
                    Take out
                  </button>
                ) : null;
              return (
                <>
                  {chosen === a ? (
                    <span className="dim small">Chosen outfit sheet</span>
                  ) : (
                    <button
                      className="primary"
                      onClick={() => {
                        choose(a);
                        setViewing(undefined);
                      }}
                    >
                      Use this one
                    </button>
                  )}
                  {(chosen === a || others.includes(a)) && (
                    <button className="danger" onClick={() => takeOut(a)}>
                      Take out
                    </button>
                  )}
                </>
              );
            }}
          />
        );
      })()}
    </div>
  );
}

/**
 * A non-human character (pet, animal, robot, dragon, creature): reference photos + description, an optional full-figure
 * hero still, and a multi-angle full-body turnaround sheet — with no human wardrobe or headless-body pipeline.
 */
export function NonHumanSteps({
  projectId,
  member: m,
  variant,
  plainLabel,
  going,
  canMake,
  makeSummary,
  onMake,
  edit,
  describe,
}: {
  projectId: string;
  member: CastMember;
  variant?: Variant;
  plainLabel: string;
  going: MakeJob[];
  canMake: boolean;
  makeSummary?: string;
  onMake: (sheetKind: SheetKind) => void;
  edit: (fn: (m: CastMember) => void) => void;
  describe?: ReactNode;
}) {
  const p = useProject();
  const [viewing, setViewing] = useState<{ row: "faces" | "portrait" | "sheet" | "before"; items: string[]; at: number }>();
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<"faces" | "portrait" | "portraits" | "sheet" | "sheets">();
  const look: CastLook = variant ?? m;
  const asset = (id?: string) => (id ? p.assets.find((a) => a.id === id) : undefined);
  const image = (id?: string) => asset(id)?.kind === "image";
  const editLook = (fn: (l: CastLook) => void, also?: (x: CastMember) => void) =>
    edit((x) => {
      fn(variant ? x.variants!.find((v) => v.id === variant.id)! : x);
      also?.(x);
    });
  const tidy = (l: CastLook) => {
    for (const k of ["images", "kept", "faces", "portraits", "sheets"] as const) if (l[k] && !l[k]!.length && k !== "faces") delete l[k];
  };

  const own = [...new Set([...(m.images ?? []), ...(m.kept ?? []), ...(m.seen ?? []).map((s) => s.asset)])].filter((a) => isOwnPhoto(asset(a)));
  const settled = variant ? [m.sheet, m.portrait, ...(m.images ?? [])].find(image) : undefined;
  const refChoices = [...new Set([...(settled ? [settled] : []), ...own, ...(look.faces ?? [])])].filter(image);
  const refDefault = variant && settled ? [settled] : own;
  const refs = look.faces ?? refDefault;
  const toggleRef = (a: string) =>
    editLook((l) => {
      const now = l.faces ?? refDefault;
      l.faces = now.includes(a) ? now.filter((x) => x !== a) : [...now, a];
    });
  const removeRefPhoto = (a: string) =>
    editLook(
      (l) => {
        if (l.faces) l.faces = l.faces.filter((x) => x !== a);
        if (l.images) l.images = l.images.filter((x) => x !== a);
        if (l.kept) l.kept = l.kept.filter((x) => x !== a);
        tidy(l);
      },
      (x) => {
        if (!variant && x.seen) x.seen = x.seen.filter((s) => s.asset !== a);
      },
    );

  const choose = (kind: "portrait" | "sheet", a: string) =>
    editLook((l) => {
      const prev = l[kind];
      l[kind] = a;
      l[OTHERS[kind]] = [...(prev && prev !== a ? [prev] : []), ...(l[OTHERS[kind]] ?? []).filter((x) => x !== a)];
      tidy(l);
    });
  const takeOut = (kind: "portrait" | "sheet", a: string) =>
    editLook((l) => {
      if (l[kind] === a) delete l[kind];
      l[OTHERS[kind]] = (l[OTHERS[kind]] ?? []).filter((x) => x !== a);
      tidy(l);
    });

  const put = (a: string, from: Spot | undefined, to: "faces" | "portrait" | "portraits" | "sheet" | "sheets") =>
    editLook(
      (l) => {
        if (from === "before") {
          l.images = l.images?.filter((x) => x !== a);
          l.kept = l.kept?.filter((x) => x !== a);
        }
        for (const kind of ["portrait", "sheet"] as const)
          if (from === kind || from === OTHERS[kind]) {
            if (l[kind] === a) delete l[kind];
            l[OTHERS[kind]] = l[OTHERS[kind]]?.filter((x) => x !== a);
          }
        if (to === "faces") {
          if (!isOwnPhoto(asset(a))) l.faces = [...new Set([...(l.faces ?? refDefault), a])];
          else if (l.faces && !l.faces.includes(a)) l.faces = [...l.faces, a];
        } else if (to === "portrait" || to === "sheet") {
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
  const dropOn = (to: "faces" | "portrait" | "portraits" | "sheet" | "sheets"): HTMLAttributes<HTMLElement> => ({
    className: `take-strip ${over === to ? "drop-on" : ""}`,
    onDragOver: (e) => {
      const acceptFiles = to === "faces" && hasFileDrop(e);
      if (!e.dataTransfer.types.includes(ASSET_DRAG) && !e.dataTransfer.types.includes(PICTURE_DRAG) && !acceptFiles) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(to);
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(undefined),
    onDrop: (e) => {
      setOver(undefined);
      setDragging(false);
      if (to === "faces" && e.dataTransfer.files?.length) {
        e.preventDefault();
        e.stopPropagation();
        void uploadCastPhotos(projectId, m.id, { files: Array.from(e.dataTransfer.files), look: variant?.id, role: "faces" });
        return;
      }
      const d = JSON.parse(e.dataTransfer.getData(PICTURE_DRAG) || "{}") as Dragged;
      const a = e.dataTransfer.getData(ASSET_DRAG) || d.asset;
      if (!a || !image(a)) return;
      e.preventDefault();
      e.stopPropagation();
      put(a, d.from, to);
    },
  });

  const before = [...(look.images ?? []), ...(look.kept ?? [])];
  const fromBefore = (a: string, to: "portrait" | "sheet" | "faces" | null) =>
    editLook(
      (l) => {
        l.images = l.images?.filter((x) => x !== a);
        l.kept = l.kept?.filter((x) => x !== a);
        if (to === "portrait" || to === "sheet") {
          if (l[to]) l[OTHERS[to]] = [l[to]!, ...(l[OTHERS[to]] ?? [])];
          l[to] = a;
        } else if (to === "faces" && l.faces) l.faces = [...l.faces, a];
        tidy(l);
      },
      (x) => void (to === "faces" && !x.seen?.some((s) => s.asset === a) && (x.seen = [...(x.seen ?? []), { asset: a }])),
    );

  const by = (a: string) => madeWith(asset(a)) ?? (isOwnPhoto(asset(a)) ? "Photo" : undefined);
  const open = (row: NonNullable<typeof viewing>["row"], items: string[], a: string) => setViewing({ row, items, at: Math.max(0, items.indexOf(a)) });
  const canGenerate = !!(m.about || variant?.about || refs.length || look.portrait || settled);
  const gets = look.sheet
    ? "the chosen full-body turnaround sheet"
    : look.portrait
      ? "the chosen hero still, until a turnaround sheet is chosen"
      : variant && (m.sheet || m.portrait)
        ? `${plainLabel}'s ${m.sheet ? "turnaround sheet" : "hero still"}, with what's different in words`
        : before.length
          ? `${Math.min(before.length, 3) === 1 ? "a picture" : `${Math.min(before.length, 3)} pictures`} from before the steps`
          : "no picture yet, only the words";

  const made = (kind: "portrait" | "sheet", labelWord: string, pluralWord: string, emptyHint: string, inheritedPic?: string) => {
    const otherKey = kind === "portrait" ? ("portraits" as const) : ("sheets" as const);
    const chosen = look[kind];
    const others = look[otherKey] ?? [];
    const all = [...(chosen ? [chosen] : []), ...others];
    const pendingJobs = going.filter((j) => jobMatches(j, kind));
    return (
      <>
        <div {...dropOn(kind)}>
          {chosen ? (
            <Picture projectId={projectId} id={chosen} main by={by(chosen)} className="chosen" dnd={dragFrom(kind, chosen)} onOpen={() => open(kind, all, chosen)} onRemove={() => takeOut(kind, chosen)} />
          ) : inheritedPic ? (
            <Picture projectId={projectId} id={inheritedPic} borrowed by={`From ${plainLabel}`} className="chosen" onOpen={() => open(kind, [inheritedPic], inheritedPic)} />
          ) : (
            <span className="dim small cast-none">{emptyHint}</span>
          )}
        </div>
        {(others.length > 0 || dragging || pendingJobs.length > 0) && (
          <>
            <div className="dim small">
              Other {pluralWord} · {others.length}
              {others.length ? " · click one to see it large and choose it, or drag it onto the chosen one" : ""}
            </div>
            <div {...dropOn(otherKey)}>
              {others.map((a) => (
                <Picture key={a} projectId={projectId} id={a} by={by(a)} dnd={dragFrom(otherKey, a)} onOpen={() => open(kind, all, a)} onChoose={() => choose(kind, a)} onRemove={() => takeOut(kind, a)} />
              ))}
              {pendingJobs.map((j) => (
                <span key={j.id} className="cast-pic">
                  <div className="take pending" title={`A ${labelWord} from ${modelLabel(j.model)} on its way`}>
                    {j.position !== undefined ? `${j.position + 1} in line` : "Making…"}
                    <br />
                    {modelLabel(j.model)}
                  </div>
                </span>
              ))}
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

      <Step n={1} done={!!(refs.length || m.about || variant?.about)} title="Reference & identity" note="· photos & description">
        <div {...dropOn("faces")}>
          {refChoices.map((a) => (
            <Picture
              key={a}
              projectId={projectId}
              id={a}
              by={a === settled ? `${plainLabel}'s` : by(a)}
              off={!refs.includes(a)}
              tick={{ on: refs.includes(a), toggle: () => toggleRef(a) }}
              onOpen={() => open("faces", refChoices, a)}
              onRemove={a === settled ? undefined : () => removeRefPhoto(a)}
            />
          ))}
          <AddPhotoTile
            projectId={projectId}
            memberId={m.id}
            variantId={variant?.id}
            role="faces"
            existing={refChoices}
            onPickAsset={(aid) => put(aid, undefined, "faces")}
          />
        </div>
        {!refChoices.length && <span className="dim small cast-none">Add reference photos (or drag image files here), or describe them below to generate from scratch.</span>}
        <label>
          <span>
            Who or what they are <span className="dim">· species, markings, silhouette, materials</span>
          </span>
          <TextField
            multiline
            value={m.about ?? ""}
            placeholder="Orange tabby cat, white chest and paws, green eyes, notch in left ear — or friendly brushed-brass helper robot with glowing amber eyes"
            onCommit={(v) => edit((x) => void (v.trim() ? (x.about = v.trim()) : delete x.about))}
          />
        </label>
        {describe}
        {variant && (
          <label>
            What&apos;s different in this look
            <TextField
              multiline
              value={variant.about}
              placeholder="Wearing a tiny black eye mask; battle-scarred armor; soaked from the rain"
              onCommit={(t) => edit((x) => void (x.variants!.find((v) => v.id === variant.id)!.about = t))}
            />
          </label>
        )}
      </Step>

      <Step n={2} done={!!(look.portrait || (variant && m.portrait))} title="Hero still" note="· optional 1:1 full-figure anchor">
        {made(
          "portrait",
          "hero still",
          "hero stills",
          "Optional — generate to lock design & markings before making the full turnaround, or skip straight to Step 3.",
          variant && !look.portrait ? m.portrait : undefined,
        )}
        <div className="make-row">
          <button disabled={!canMake || !canGenerate} onClick={() => onMake("portrait")} title="Full-figure 1:1 three-quarter hero study on neutral mid-gray">
            Make hero stills
          </button>
          {makeSummary && <span className="dim small">{makeSummary}</span>}
        </div>
      </Step>

      <Step n={3} wide done={!!look.sheet} title="Full-body turnaround sheet" note="· 16:9 front, 3/4, side & back views on mid-gray">
        {made(
          "sheet",
          "turnaround sheet",
          "turnaround sheets",
          variant && m.sheet
            ? `No variant turnaround yet — generating one edits directly from ${plainLabel}'s turnaround sheet.`
            : "No turnaround sheet yet. Made from your reference photos, chosen hero still, or description.",
          variant && !look.sheet ? m.sheet : undefined,
        )}
        <div className="make-row">
          <button className={canGenerate && !look.sheet ? "primary" : ""} disabled={!canMake || !canGenerate} onClick={() => onMake("sheet")} title="Multi-angle full-body turnaround sheet (front, 3/4, side profile, back) on neutral mid-gray">
            Make turnaround sheet
          </button>
          {!canGenerate ? <span className="dim small">Add a description or reference photo first.</span> : makeSummary && <span className="dim small">{makeSummary}</span>}
        </div>
      </Step>

      {before.length > 0 && (
        <details className="cast-fold" open>
          <summary>Pictures from before the steps · {before.length}</summary>
          <p className="dim small">Drag onto Hero still or Turnaround sheet, or click one to sort it.</p>
          <div className="take-strip">
            {before.map((a) => (
              <Picture key={a} projectId={projectId} id={a} by={by(a)} dnd={dragFrom("before", a)} onOpen={() => open("before", before, a)} onRemove={() => fromBefore(a, null)} />
            ))}
          </div>
        </details>
      )}

      {viewing && (() => {
        const liveItems = (() => {
          const row = viewing.row;
          if (row === "faces") return refChoices;
          if (row === "before") return before;
          const c = look[row];
          const rest = look[OTHERS[row]] ?? [];
          if (!c && !rest.length) return viewing.items;
          return [...(c ? [c] : []), ...rest];
        })();
        return (
          <Viewer
            projectId={projectId}
            items={liveItems.map((a) => ({ id: a, caption: [a, madeWith(asset(a)) ? `made with ${madeWith(asset(a))}` : isOwnPhoto(asset(a)) ? "reference photo" : ""].filter(Boolean).join(" · ") }))}
            at={Math.min(viewing.at, Math.max(0, liveItems.length - 1))}
            onClose={() => setViewing(undefined)}
            actions={(item) => {
              const a = item.id;
              const row = viewing.row;
              if (row === "faces")
                return (
                  <>
                    <button onClick={() => toggleRef(a)}>{refs.includes(a) ? "Don't use as reference" : "Use as reference"}</button>
                    {a !== settled && (
                      <button className="danger" onClick={() => (removeRefPhoto(a), setViewing(undefined))}>
                        Remove photo
                      </button>
                    )}
                  </>
                );
              if (row === "portrait" || row === "sheet")
                return (
                  <>
                    {look[row] === a ? (
                      <span className="dim small">Chosen {row === "portrait" ? "hero still" : "turnaround sheet"}</span>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => {
                          choose(row, a);
                          setViewing(undefined);
                        }}
                      >
                        Use this one
                      </button>
                    )}
                    {(look[row] === a || look[OTHERS[row]]?.includes(a)) && (
                      <button className="danger" onClick={() => takeOut(row, a)}>
                        Take out
                      </button>
                    )}
                  </>
                );
              return (
                <>
                  <button onClick={() => fromBefore(a, "portrait")}>It&apos;s the hero still</button>
                  <button onClick={() => fromBefore(a, "sheet")}>It&apos;s the turnaround sheet</button>
                  <button onClick={() => fromBefore(a, "faces")}>Reference photo</button>
                  <button className="danger" onClick={() => fromBefore(a, null)}>
                    Take out
                  </button>
                </>
              );
            }}
          />
        );
      })()}
    </div>
  );
}

/** One step of a look: its number (a tick once it's done), its name, and what it's for. */
function Step({ n, done, wide, title, note, children }: { n: number; done: boolean; wide?: boolean; title: string; note: string; children: ReactNode }) {
  return (
    <section className={`cast-step ${wide ? "wide" : ""}`.trim()}>
      <div className="cast-step-head">
        <span className={`cast-step-n ${done ? "done" : ""}`}>{done ? <Icon name="check" size={10} /> : n}</span>
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
  onChoose,
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
  onChoose?: () => void;
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
          {tick.on && <Icon name="check" size={12} />}
        </button>
      )}
      {onChoose && (
        <button
          type="button"
          className="cast-pic-use"
          onClick={(e) => {
            e.stopPropagation();
            onChoose();
          }}
          title="Use this as the chosen picture"
        >
          Use
        </button>
      )}
      {onRemove && (
        <button className="cast-pic-remove" onClick={onRemove} title="Take this picture out" aria-label="Take this picture out">
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}
