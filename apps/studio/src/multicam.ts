/**
 * Multicam in the studio: lining cameras up (the engine does it, by sound), cutting to an angle at the playhead (the
 * number keys), and cutting a stretch to whoever is talking. The cuts are the person's own edits, so undo works.
 */
import { anglesOf, cutToAngle, cutToSpeakers, formatTime, groupWords, resolveTimeline, type Asset } from "@beatsheet/schema";
import { pictureTrack, runJob } from "./lib";
import { actions, getState, setState, timelineFor } from "./store";

let hintTimer: ReturnType<typeof setTimeout> | undefined;
const say = (hint: string, long = false) => {
  clearTimeout(hintTimer);
  setState({ hint });
  hintTimer = setTimeout(() => setState({ hint: undefined }), long ? 6000 : 2600);
};

/** Lines up recordings of one event by their sound, so shots can switch between them. */
export async function lineUp(assets: Asset[]) {
  const { projectId } = getState();
  if (!projectId) return;
  say(`Lining up ${assets.length} recordings by their sound…`, true);
  try {
    await actions.flushSave();
    const out = await actions.quietly(() => runJob(`/api/projects/${projectId}/angles`, { assets: assets.map((a) => a.id) }));
    await actions.reload();
    const r = JSON.parse(out ?? "{}") as { group: string; angles: { asset: string; offset: number }[]; left: { asset: string; why: string }[] };
    const name = (id: string) => assets.find((a) => a.id === id)?.label ?? id;
    const lined = r.angles.map((x, k) => `${k + 1}: ${name(x.asset)}${x.offset ? ` (+${formatTime(x.offset)})` : ""}`).join(", ");
    const left = r.left.map((x) => `${name(x.asset)} (${x.why})`).join("; ");
    say(`Angles ${lined}. Number keys cut to one at the playhead.${left ? ` Left out: ${left}.` : ""}`, true);
  } catch (err) {
    say(`Couldn't line them up: ${err instanceof Error ? err.message : String(err)}`, true);
  }
}

/** The picture shot at the playhead, and its group's angles when it shows one. */
function here() {
  const s = getState();
  if (!s.project) return undefined;
  const tl = timelineFor(s.project, s.format);
  const pic = pictureTrack(s.project);
  const r = tl.shots.find((x) => x.track === pic && s.playhead >= x.start - 1e-3 && s.playhead < x.end - 1e-3);
  const shot = r && s.project.shots.find((x) => x.id === r.id);
  const asset = shot?.content.kind === "clip" ? s.project.assets.find((a) => a.id === (shot.content as { asset: string }).asset) : undefined;
  return { s, tl, r, shot, asset, angles: asset?.angle ? anglesOf(s.project, asset.angle.group) : [] };
}

/** 1–9: from the playhead on, the picture shows angle `n` of the group playing there. */
export function angleKey(n: number): boolean {
  const h = here();
  if (!h?.asset?.angle || !h.angles.length) return false;
  const to = h.angles[n - 1];
  if (!to) return say(`There are ${h.angles.length} angles here`), true;
  if (to.id === h.asset.id) return true;
  let ok: string | undefined;
  actions.edit((d) => void (ok = cutToAngle(d, h.tl, h.s.playhead, to.id)));
  if (!ok) say(`${to.label ?? to.id} wasn't rolling for all of that shot`);
  return true;
}

/**
 * Cuts the run of shots from one group around `shotId` to whoever is talking, each speaker on the camera that hears
 * them loudest (`map` to say otherwise).
 */
export async function cutToTalkers(shotId: string, map?: Record<string, string>) {
  const { project, projectId, format } = getState();
  if (!project || !projectId) return;
  const tl = timelineFor(project, format);
  const pic = pictureTrack(project);
  const group = (id: string) => {
    const c = project.shots.find((x) => x.id === id)?.content;
    return c?.kind === "clip" ? project.assets.find((a) => a.id === c.asset)?.angle?.group : undefined;
  };
  const g = group(shotId);
  if (!g) return;
  // The shots on either side showing the same event.
  const run = tl.shots.filter((r) => r.track === pic && Number.isFinite(r.start)).sort((a, b) => a.start - b.start);
  let i = run.findIndex((r) => r.id === shotId), j = i;
  while (i > 0 && group(run[i - 1]!.id) === g) i--;
  while (j + 1 < run.length && group(run[j + 1]!.id) === g) j++;
  const from = run[i]!.start, to = run[j]!.end;
  say("Listening for who's talking…", true);
  const res = await fetch(`/api/projects/${projectId}/angles?group=${encodeURIComponent(g)}`);
  const found = (await res.json()) as { master?: string; words: { w: string; s: number; e: number; speaker?: string }[]; angles: Record<string, string> };
  const master = project.assets.find((a) => a.id === found.master);
  if (!master) return say("Transcribe one of the cameras first (who's speaking, in its page in the Library): that's how it knows who talks when.", true);
  const angles = { ...found.angles, ...map };
  if (!found.words.some((w) => w.speaker)) return say("Its transcript doesn't tell speakers apart: transcribe it again with who's speaking on.", true);
  let cuts = 0;
  actions.edit((d) => {
    const work = resolveTimeline(d, format);
    cuts = cutToSpeakers(d, work, groupWords(d, work, master, found.words, from, to), from, to, (sp) => angles[sp]);
  });
  const who = Object.entries(angles)
    .map(([sp, a]) => `${sp.replace(/^speaker_(\d+)$/, (_, k) => `Speaker ${Number(k) + 1}`)} on ${project.assets.find((x) => x.id === a)?.label ?? a}`)
    .join(", ");
  say(cuts ? `Cut to whoever's talking: the picture changes angle ${cuts} time${cuts === 1 ? "" : "s"} (${who}).` : `No change of angle needed (${who}).`, true);
}
