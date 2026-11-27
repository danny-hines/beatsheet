/**
 * Pure @mention autocomplete helpers for studio prompt inputs: detects an active @cast or @cast/variant token at the
 * caret, builds rich candidate rows (including character looks/variants and decoupled outfit thumbnails), ranks matches
 * so a character's looks stay grouped right underneath it, and applies clean text replacement.
 */
import { characterIngredients, picturesGiven, type CastMember } from "@beatsheet/schema";

export type ActiveMention = {
  /** Index of the leading `@` character in `text`. */
  start: number;
  /** End index of the full `@id` or `@id/variant` token (including any tail past the caret). */
  end: number;
  /** Text typed after `@` up to the caret (e.g. "", "gal", "galileo/", "galileo/bl"). */
  query: string;
};

export type MentionItem = {
  /** Full mention id without leading `@`, e.g. "galileo" or "galileo/bloodied". */
  id: string;
  /** Parent cast member id, e.g. "galileo". */
  memberId: string;
  /** Variant id when this row is a look/variant, e.g. "bloodied". */
  variantId?: string;
  kind: CastMember["kind"];
  /** Primary display label (the member's name, or the variant id for a look). */
  name: string;
  /** Parent member's display name for variant rows. */
  parentName?: string;
  /** Short description (wardrobe / visual summary). */
  detail?: string;
  /** Short badge shown on the right ("Plain", "Look", "Character", "Wardrobe", "Set", "Prop", "Style"). */
  badge: string;
  /** Primary thumbnail asset id (portrait / face sheet / image). */
  thumb?: string;
  /** Secondary outfit thumbnail asset id for characters with decoupled face + outfit sheets. */
  outfitThumb?: string;
};

const KIND_ORDER: CastMember["kind"][] = ["character", "place", "prop", "wardrobe", "style"];
const KIND_BADGE: Record<CastMember["kind"], string> = {
  character: "Character",
  place: "Set",
  prop: "Prop",
  wardrobe: "Wardrobe",
  style: "Style",
};

const BEFORE_MENTION = /(?:^|[\s([{"'“‘,:;])@([a-z0-9-]*(?:\/[a-z0-9-]*)?)$/i;
const MENTION_ALL = /@([a-z0-9][a-z0-9-]*)(?:\/([a-z0-9][a-z0-9-]*))?/g;

/**
 * Finds the active `@...` mention surrounding `caret`, if any. Requires `@` to start the string or follow whitespace
 * or opening/separating punctuation so email addresses (`a@b`) never trigger autocomplete.
 */
export function activeMention(text: string, caret: number): ActiveMention | undefined {
  const pos = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, pos);
  const m = before.match(BEFORE_MENTION);
  if (!m) return undefined;
  const query = m[1] ?? "";
  const start = pos - query.length - 1;
  const after = text.slice(pos);
  const tailMatch = query.includes("/") ? after.match(/^[a-z0-9-]*/i) : after.match(/^[a-z0-9-]*(?:\/[a-z0-9-]*)?/i);
  const tail = tailMatch?.[0] ?? "";
  return { start, end: pos + tail.length, query };
}

const hasContent = (m: CastMember): boolean =>
  !!(
    m.name.trim() ||
    m.about?.trim() ||
    m.wears?.trim() ||
    m.portrait ||
    m.faceSheet ||
    m.outfitSheet ||
    m.sheet ||
    m.outfit ||
    m.images?.length ||
    m.faces?.length ||
    m.wardrobe?.length ||
    m.seen?.length ||
    m.variants?.length
  );

/** Builds the flat ordered list of autocomplete items for every cast member and its variants. */
export function castMentionItems(cast: CastMember[] | undefined, opts?: { includeStyles?: boolean }): MentionItem[] {
  if (!cast?.length) return [];
  const includeStyles = opts?.includeStyles !== false;
  const members = cast
    .filter((m) => includeStyles || m.kind !== "style")
    .map((member, index) => ({ member, index }))
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.member.kind) - KIND_ORDER.indexOf(b.member.kind) ||
        Number(hasContent(b.member)) - Number(hasContent(a.member)) ||
        a.index - b.index,
    )
    .map((x) => x.member);

  const items: MentionItem[] = [];
  for (const m of members) {
    const hasVariants = !!m.variants?.length;
    if (m.kind === "character") {
      const ing = characterIngredients({ member: m }, cast);
      const thumb = ing.portrait ?? ing.faceSheet ?? ing.legacySheet ?? ing.legacyImages?.[0] ?? m.faces?.[0] ?? m.seen?.[0]?.asset ?? ing.outfitSheet;
      const outfitThumb = ing.outfitSheet && ing.outfitSheet !== thumb ? ing.outfitSheet : undefined;
      const detail = (hasVariants ? ing.outfitAbout || m.wears || m.about : m.about || m.wears || ing.outfitAbout)?.trim() || undefined;
      items.push({
        id: m.id,
        memberId: m.id,
        kind: m.kind,
        name: m.name.trim() || m.id,
        detail,
        badge: hasVariants ? "Plain" : KIND_BADGE.character,
        ...(thumb ? { thumb } : {}),
        ...(outfitThumb ? { outfitThumb } : {}),
      });
    } else {
      const pics = picturesGiven({ member: m }, cast);
      const thumb = pics[0] ?? m.wardrobe?.[0] ?? m.seen?.[0]?.asset;
      const detail = (m.about || m.wears)?.trim() || undefined;
      items.push({
        id: m.id,
        memberId: m.id,
        kind: m.kind,
        name: m.name.trim() || m.id,
        detail,
        badge: hasVariants && m.kind === "wardrobe" ? "Clean" : KIND_BADGE[m.kind],
        ...(thumb ? { thumb } : {}),
      });
    }

    for (const v of m.variants ?? []) {
      const id = `${m.id}/${v.id}`;
      if (m.kind === "character") {
        const ing = characterIngredients({ member: m, variant: v }, cast);
        const thumb = ing.portrait ?? ing.faceSheet ?? ing.legacySheet ?? ing.legacyImages?.[0] ?? v.faces?.[0] ?? m.faces?.[0] ?? m.seen?.[0]?.asset ?? ing.outfitSheet;
        const outfitThumb = ing.outfitSheet && ing.outfitSheet !== thumb ? ing.outfitSheet : undefined;
        const parts = [v.about?.trim(), v.faceAbout?.trim()];
        if (ing.outfitAbout?.trim() && !parts.some((x) => x && x.toLowerCase() === ing.outfitAbout!.trim().toLowerCase())) {
          parts.push(ing.outfitAbout.trim());
        }
        const detail = parts.filter(Boolean).join(" · ") || undefined;
        items.push({
          id,
          memberId: m.id,
          variantId: v.id,
          kind: m.kind,
          name: v.id,
          parentName: m.name.trim() || m.id,
          detail,
          badge: "Look",
          ...(thumb ? { thumb } : {}),
          ...(outfitThumb ? { outfitThumb } : {}),
        });
      } else {
        const pics = picturesGiven({ member: m, variant: v }, cast);
        const thumb = pics[0] ?? v.wardrobe?.[0] ?? m.outfitSheet ?? m.images?.[0];
        items.push({
          id,
          memberId: m.id,
          variantId: v.id,
          kind: m.kind,
          name: v.id,
          parentName: m.name.trim() || m.id,
          detail: v.about?.trim() || undefined,
          badge: m.kind === "wardrobe" ? "Variant" : "Look",
          ...(thumb ? { thumb } : {}),
        });
      }
    }
  }
  return items;
}

const wordStartsWith = (text: string, q: string): boolean =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w.startsWith(q));

function selfScore(item: MentionItem, q: string): number {
  const id = item.id.toLowerCase();
  const memberId = item.memberId.toLowerCase();
  const variantId = item.variantId?.toLowerCase();
  const name = item.name.toLowerCase();
  const parentName = item.parentName?.toLowerCase() ?? "";
  const detail = item.detail?.toLowerCase() ?? "";

  if (!variantId) {
    if (memberId === q) return 0;
    if (memberId.startsWith(q)) return 1;
    if (wordStartsWith(memberId, q) || wordStartsWith(name, q)) return 3;
    if (memberId.includes(q) || name.includes(q)) return 4;
    if (detail.includes(q)) return 5;
    return Infinity;
  }

  if (memberId === q) return 0.5;
  if (memberId.startsWith(q)) return 1.5;
  if (variantId.startsWith(q)) return 2;
  if (wordStartsWith(variantId, q) || wordStartsWith(memberId, q) || wordStartsWith(parentName, q)) return 3.5;
  if (id.includes(q) || parentName.includes(q)) return 4.5;
  if (detail.includes(q)) return 5.5;
  return Infinity;
}

/** Filters and ranks cast mention items for `query` (the text after `@`), keeping variants right below their parent. */
export function filterMentionItems(items: MentionItem[], query: string): MentionItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  if (q.includes("/")) {
    const [baseQ = "", varQ = ""] = q.split("/");
    return items
      .map((item, idx) => {
        if (!item.variantId) return null;
        const memberId = item.memberId.toLowerCase();
        const parentName = item.parentName?.toLowerCase() ?? "";
        const variantId = item.variantId.toLowerCase();
        const detail = item.detail?.toLowerCase() ?? "";
        let baseScore = 0;
        if (baseQ) {
          if (memberId === baseQ) baseScore = 0;
          else if (memberId.startsWith(baseQ)) baseScore = 1;
          else if (memberId.includes(baseQ) || parentName.includes(baseQ)) baseScore = 2;
          else return null;
        }
        let varScore = 0;
        if (varQ) {
          if (variantId === varQ) varScore = 0;
          else if (variantId.startsWith(varQ)) varScore = 1;
          else if (variantId.includes(varQ)) varScore = 2;
          else if (detail.includes(varQ)) varScore = 3;
          else return null;
        }
        return { item, score: baseScore * 10 + varScore, idx };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.score - b.score || a.idx - b.idx)
      .map((x) => x.item);
  }

  const memberOrder = new Map<string, number>();
  const parentScore = new Map<string, number>();
  items.forEach((item, idx) => {
    if (!item.variantId) {
      memberOrder.set(item.memberId, idx);
      parentScore.set(item.memberId, selfScore(item, q));
    }
  });

  return items
    .map((item, idx) => {
      const own = selfScore(item, q);
      if (!Number.isFinite(own)) return null;
      const pScore = item.variantId ? (parentScore.get(item.memberId) ?? Infinity) : own;
      // Keep a variant glued under its parent when the parent itself matches at least as strongly (e.g. `@gal` -> `@galileo` then `@galileo/bloodied`).
      // When the variant matches on its own more strongly than the parent (e.g. `@blood` -> `@galileo/bloodied`), rank it by its own match score.
      const groupScore = item.variantId && pScore <= own ? pScore : own;
      const groupKind = KIND_ORDER.indexOf(item.kind);
      const mOrd = memberOrder.get(item.memberId) ?? idx;
      return { item, groupScore, groupKind, mOrd, isVariant: item.variantId ? 1 : 0, own, idx };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort(
      (a, b) =>
        a.groupScore - b.groupScore ||
        a.groupKind - b.groupKind ||
        a.mOrd - b.mOrd ||
        a.isVariant - b.isVariant ||
        a.own - b.own ||
        a.idx - b.idx,
    )
    .map((x) => x.item);
}

/**
 * Replaces `mention` in `text` with `@${id}` and returns the updated text, next caret position, and whether the caret
 * landed past a trailing space (so autocomplete naturally closes without needing dismissal suppression).
 */
export function applyMention(text: string, mention: ActiveMention, id: string): { text: string; caret: number; closedBySpace: boolean } {
  const before = text.slice(0, mention.start);
  const after = text.slice(mention.end);
  const inserted = `@${id}`;
  if (after.startsWith(" ")) {
    return { text: `${before}${inserted}${after}`, caret: mention.start + inserted.length + 1, closedBySpace: true };
  }
  if (/^[\n\r\t.,;:!?)\]}"'”’]/.test(after)) {
    return { text: `${before}${inserted}${after}`, caret: mention.start + inserted.length, closedBySpace: false };
  }
  return { text: `${before}${inserted} ${after}`, caret: mention.start + inserted.length + 1, closedBySpace: true };
}

/** Inserts `@id` at the caret (or replaces the active `@...` mention if the caret is inside one). */
export function insertMentionAt(text: string, caret: number, id: string): { text: string; caret: number; closedBySpace: boolean } {
  const active = activeMention(text, caret);
  if (active) return applyMention(text, active, id);
  const pos = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const lead = before.length > 0 && !/[\s([{"'“‘]$/.test(before) ? " " : "";
  const inserted = `${lead}@${id}`;
  if (after.startsWith(" ")) {
    return { text: `${before}${inserted}${after}`, caret: pos + inserted.length + 1, closedBySpace: true };
  }
  if (/^[\n\r\t.,;:!?)\]}"'”’]/.test(after)) {
    return { text: `${before}${inserted}${after}`, caret: pos + inserted.length, closedBySpace: false };
  }
  return { text: `${before}${inserted} ${after}`, caret: pos + inserted.length + 1, closedBySpace: true };
}

/** Lists unique `@id` or `@id/variant` tokens in `prompt` that don't match any cast member or variant. */
export function unknownCastMentions(prompt: string, cast: CastMember[] | undefined): string[] {
  const unknown: string[] = [];
  for (const m of prompt.matchAll(MENTION_ALL)) {
    const id = m[1]!;
    const variant = m[2];
    const member = cast?.find((c) => c.id === id);
    const key = variant ? `${id}/${variant}` : id;
    if (!member || (variant && !member.variants?.some((v) => v.id === variant))) {
      if (!unknown.includes(key)) unknown.push(key);
    }
  }
  return unknown;
}
