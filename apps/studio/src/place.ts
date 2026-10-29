/**
 * Putting a picture into the cut: as the take a placeholder or made shot shows, or as a new clip where it was dropped
 * on the timeline. Pure (no DOM), so it's tested on its own.
 */
import type { Anchor, Asset, Project, Shot, Timeline } from "@beatsheet/schema";

const round2 = (x: number) => Math.round(x * 100) / 100;
const freeId = (prefix: string, taken: { id: string }[]) => {
  const ids = new Set(taken.map((x) => x.id));
  let n = taken.length + 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
};

/**
 * Makes `a` the take shot `shotId` shows: a placeholder becomes a made shot with it (its description the prompt), a
 * made shot adds it to its takes. A clip says it's a rough or a final; a still makes it a board.
 */
export function putInShot(d: Project, shotId: string, a: Asset) {
  const s = d.shots.find((x) => x.id === shotId);
  if (!s) return;
  const c = s.content;
  const from = a.provenance;
  const video = a.kind === "video";
  if (c.kind === "placeholder") {
    s.content = {
      kind: "generated",
      prompt: c.description,
      take: a.id,
      takes: [a.id],
      ...(from?.provider ? { provider: from.provider } : {}),
      ...(typeof from?.params?.model === "string" ? { model: from.params.model } : {}),
    };
  } else if (c.kind === "generated") {
    c.takes = [...new Set([...(c.takes ?? []), a.id])];
    c.take = a.id;
  } else return;
  const made = s.content as Extract<Shot["content"], { kind: "generated" }>;
  // A clip made from a still remembers it, so a final can start from the same board.
  if (video && from?.refs?.[0] && d.assets.some((x) => x.id === from.refs![0] && x.kind === "image")) made.start = from.refs[0];
  if (!video) delete made.in;
  s.fidelity = video ? (from?.params?.quality === "final" ? "final" : "rough") : "board";
}

/**
 * Puts a picture from the Library where it was dropped on a track, at `t` (`at` is that time as an anchor, snapped to
 * what's near): onto a placeholder or made shot, as the take it shows; anywhere else, as a new clip after the shot
 * under it, or at the end. A shot with a length of its own is followed by it; one that runs until the next starts is
 * split at `t`. Returns the shot it went into or made.
 */
export function dropAsset(d: Project, tl: Timeline, track: string, t: number, at: Anchor, a: Asset): string | undefined {
  const placed = tl.shots.filter((r) => r.track === track && Number.isFinite(r.start) && Number.isFinite(r.end));
  const under = placed.filter((r) => r.start <= t && t < r.end).at(-1);
  const target = under && d.shots.find((s) => s.id === under.id);
  if (target && (target.content.kind === "placeholder" || target.content.kind === "generated")) {
    putInShot(d, target.id, a);
    return target.id;
  }
  const after = target ?? d.shots.find((s) => s.id === placed.filter((r) => r.start <= t).at(-1)?.id);
  const ownLength = (s: Shot) => !!s.end || s.duration !== undefined;
  const length = round2(a.kind === "video" ? Math.min(a.duration ?? 4, 8) : 3);
  const shot: Shot = { id: freeId("shot", d.shots), track, content: { kind: "clip", asset: a.id }, fidelity: "rough" };
  const next = after ? d.shots.slice(d.shots.indexOf(after) + 1).find((s) => s.track === track) : undefined;
  // Ahead of everything on the track: it stops where the first shot starts, if that's sooner.
  const first = placed.find((r) => r.start > t);
  if (!after) Object.assign(shot, { start: at, duration: round2(first ? Math.min(length, first.start - t) : length) });
  else if (ownLength(after)) shot.duration = length;
  // Split where it was dropped: it runs until the next shot starts, or for its own length when nothing follows.
  else Object.assign(shot, { start: at }, next ? {} : { duration: length });
  const i = after ? d.shots.indexOf(after) + 1 : d.shots.findIndex((s) => s.track === track);
  d.shots.splice(i < 0 ? d.shots.length : i, 0, shot);
  return shot.id;
}
