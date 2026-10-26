/**
 * The agent's look at its own cut before handing it over: a quick low-resolution render, a contact sheet of it (one
 * frame every second or two, read row by row), and the problems a person would notice first. A picture that sits still
 * too long, silence, a landscape clip left uncropped in a vertical cut, narration with no captions, a cut that runs long.
 *
 * Then the design pass, for the shots that are designed rather than footage: each one larger, as it enters, midway and
 * settled, for the agent (or a fresh critic) to judge as a design lead would, with what the project itself says about
 * its design: no look of its own, hero moments left to stock kit scenes, the same scene over and over, a slam on every cut.
 */
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { formatTime, resolveTimeline, type Project } from "@beatsheet/schema";
import { loadProject } from "./store.ts";

const run = promisify(execFile);
const ffmpegLog = (args: string[]) => run("ffmpeg", ["-hide_banner", "-nostats", ...args], { maxBuffer: 1 << 25 }).then((r) => r.stderr, (err: { stderr?: string }) => err.stderr ?? "");

export type Review = {
  sheet: Buffer;
  every: number;
  columns: number;
  notes: string[];
  duration: number;
  /** The designed shots, a row each (as `designRows` lists them): entering, midway and settled. */
  designs?: Buffer;
  designRows?: string[];
  /** What the project says about its design, for the design pass. */
  designNotes: string[];
};

export async function reviewCut(projectId: string, opts: { cut?: string; format?: string } = {}): Promise<Review> {
  const { project } = loadProject(projectId, opts.cut);
  const fmt = project.formats.find((f) => f.id === opts.format) ?? project.formats[0]!;
  const tl = resolveTimeline(project, fmt.id);
  const dir = join(tmpdir(), `beatsheet-review-${process.pid}-${Date.now().toString(36)}`);
  mkdirSync(dir, { recursive: true });
  try {
    const { renderProject } = await import("./render.ts");
    const video = await renderProject(projectId, { cut: project.cut.id, format: fmt.id, quality: "proxy", scale: 0.3, out: join(dir, "review.mp4"), master: false });
    const duration = tl.duration;
    const every = duration > 90 ? 2 : 1;
    const vertical = fmt.height > fmt.width;
    const columns = vertical ? 10 : 6;
    const tile = vertical ? "216:384" : "320:180";
    const frames = Math.ceil(duration / every);
    const rows = Math.ceil(frames / columns);
    const sheetFile = join(dir, "sheet.jpg");
    await run("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `fps=1/${every},scale=${tile},tile=${columns}x${rows}:padding=4:color=gray`, "-frames:v", "1", "-q:v", "4", sheetFile], { maxBuffer: 1 << 24 });

    const notes: string[] = [];
    // Pictures that don't move: nothing changing on screen for 2 seconds or more.
    const freeze = await ffmpegLog(["-i", video, "-vf", "freezedetect=n=0.004:d=2", "-an", "-f", "null", "-"]);
    const starts = [...freeze.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
    const lengths = [...freeze.matchAll(/freeze_duration: ([\d.]+)/g)].map((m) => Number(m[1]));
    for (const [i, s] of starts.entries()) {
      const len = lengths[i] ?? duration - s;
      const shots = tl.shots.filter((r) => r.start < s + len && r.end > s && project.tracks.find((t) => t.id === r.track)?.kind === "picture").map((r) => r.id);
      notes.push(`Nothing moves for ${len.toFixed(1)}s at ${formatTime(s)}${shots.length ? ` (${shots.join(", ")})` : ""}: cut sooner, add motion (content.motion), or put something on top.`);
    }
    // Silence: no music, voice or sound for over a second.
    const quiet = await ffmpegLog(["-i", video, "-af", "silencedetect=noise=-45dB:d=1.2", "-vn", "-f", "null", "-"]);
    for (const m of quiet.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)) notes.push(`Silent for ${Number(m[2]).toFixed(1)}s at ${formatTime(Number(m[1]))}.`);
    const loud = await ffmpegLog(["-i", video, "-af", "ebur128=peak=true", "-f", "null", "-"]);
    const lufs = Number(/I:\s*(-?[\d.]+) LUFS/.exec(loud.slice(loud.lastIndexOf("Summary")))?.[1]);
    if (Number.isFinite(lufs)) notes.push(`Mix loudness ${lufs.toFixed(1)} LUFS before mastering (exports are mastered to -14).`);

    notes.push(...checks(project, tl, fmt.id, fmt.width, fmt.height));

    // The designed shots, bigger: the picture track's first, then overlays, longest first, up to ten.
    const tracks = new Map(project.tracks.map((t) => [t.id, t]));
    const shots = new Map(project.shots.map((s) => [s.id, s]));
    const designed = tl.shots
      .filter((r) => shots.get(r.id)?.content.kind === "coded" && Number.isFinite(r.start) && r.end > r.start)
      .sort((a, b) => Number(tracks.get(b.track)?.kind === "picture") - Number(tracks.get(a.track)?.kind === "picture") || b.end - b.start - (a.end - a.start))
      .slice(0, 10)
      .sort((a, b) => a.start - b.start);
    let designs: Buffer | undefined;
    const designRows: string[] = [];
    if (designed.length) {
      const { renderStills } = await import("./render.ts");
      const times = designed.flatMap((r) => [0.2, 0.55, 0.92].map((f) => r.start + (r.end - r.start) * f));
      const stills = join(dir, "designs");
      mkdirSync(stills, { recursive: true });
      await renderStills(projectId, { cut: project.cut.id, format: fmt.id, times, scale: vertical ? 0.3 : 0.25, dir: stills });
      const designFile = join(dir, "designs.jpg");
      await run("ffmpeg", ["-v", "error", "-y", "-i", join(stills, "still-%03d.jpg"), "-vf", `tile=3x${designed.length}:padding=6:color=gray`, "-frames:v", "1", "-q:v", "3", designFile], { maxBuffer: 1 << 24 });
      designs = readFileSync(designFile);
      for (const r of designed) {
        const s = shots.get(r.id)!;
        const c = s.content.kind === "coded" ? s.content.component : "";
        designRows.push(`${r.id} (${c}${s.label ? `, "${s.label}"` : ""}) ${formatTime(r.start)}–${formatTime(r.end)}`);
      }
    }
    return { sheet: readFileSync(sheetFile), every, columns, notes, duration, designs, designRows, designNotes: designChecks(project) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What the project itself says about the design of its designed shots. */
export function designChecks(p: Project): string[] {
  const out: string[] = [];
  const coded = p.shots.filter((s) => s.content.kind === "coded");
  const titled = coded.length || p.shots.some((s) => s.content.kind === "text") || !!p.captions;
  if (titled && (!p.look?.colors || !Object.keys(p.look.colors).length))
    out.push(
      "There's no /look: titles and designed shots draw in beatsheet's plain neutrals. Give the project a look of its own: the brand's colours and fonts when there is one (its site's CSS, its logo), else one from the footage and the occasion (palette for its colours, a font that suits the mood, a grade), offered as a choice with preview_looks if the person hasn't said what they're after.",
    );
  if (!coded.length) return out;
  const component = (s: (typeof coded)[number]) => (s.content.kind === "coded" ? s.content.component : "");
  const own = coded.filter((s) => !component(s).startsWith("kit:"));
  if (coded.length >= 3 && !own.length)
    out.push(`All ${coded.length} designed shots are stock kit scenes. The moments that carry the video (the hook, the reveal, the end card) should be scenes written for this project with write_scene, in its own design system; keep the kit for quick utility shots.`);
  const uses = new Map<string, string[]>();
  for (const s of coded) if (component(s).startsWith("kit:")) uses.set(component(s), [...(uses.get(component(s)) ?? []), s.id]);
  for (const [name, ids] of uses)
    if (ids.length >= 3) out.push(`${name} is used ${ids.length} times (${ids.join(", ")}): vary them, or make it a deliberate recurring device in the project's own style.`);
  const loud = p.shots.filter((s) => ["slam", "glitch", "flash", "whip"].includes(s.transition?.kind ?? "")).map((s) => s.id);
  if (loud.length >= 3 && loud.length > p.shots.length / 5)
    out.push(`${loud.length} shots come in with a slam, glitch, flash or whip (${loud.join(", ")}): keep hard hits for the one or two moments that earn them; most cuts read better clean.`);
  return out;
}

/** What's worth fixing, from the project itself. */
function checks(p: Project, tl: ReturnType<typeof resolveTimeline>, format: string, width: number, height: number): string[] {
  const out: string[] = [];
  const shots = new Map(p.shots.map((s) => [s.id, s]));
  const assets = new Map(p.assets.map((a) => [a.id, a]));
  if (p.spec.targetLength && Math.abs(tl.duration - p.spec.targetLength) > Math.max(3, p.spec.targetLength * 0.15))
    out.push(`It runs ${formatTime(tl.duration)}; the target is ${p.spec.targetLength}s.`);
  if (p.spec.maxLength && tl.duration > p.spec.maxLength) out.push(`It's over the ${p.spec.maxLength}s limit.`);
  if (tl.lines.length && !p.captions) out.push("There's narration but no captions: most people watch with the sound off. Turn them on with /captions.");
  if (!tl.sfx.length && tl.shots.length > 6) out.push("No sound effects: a whoosh or pop on the big cuts, a shutter or tick where something happens, makes it feel made.");
  const frameAspect = width / height;
  for (const r of tl.shots) {
    const s = shots.get(r.id);
    if (!s || s.content.kind !== "clip") continue;
    const a = assets.get(s.content.asset);
    if (!a?.width || !a?.height || a.cutout) continue;
    const aspect = a.width / a.height;
    const mismatch = aspect / frameAspect;
    if ((mismatch > 1.4 || mismatch < 0.7) && !s.content.reframe?.[format] && !s.content.motion)
      out.push(`${r.id} is ${aspect > 1 ? "landscape" : "portrait"} footage in a ${width}×${height} frame with no reframe: set content.reframe.${format} (or follow a subject) so the crop keeps what matters.`);
    if (a.kind === "image" && r.end - r.start > 3.5 && !s.content.motion) out.push(`${r.id} holds a photo for ${(r.end - r.start).toFixed(1)}s: give it motion or cut sooner.`);
  }
  const designed = p.shots.filter((s) => s.content.kind === "coded").length;
  if (tl.duration > 20 && designed === 0) out.push("Every shot is footage: a designed scene or two (a title, a stat, a before/after, labelled parts) would lift it.");
  if (tl.diagnostics.length) out.push(`Timing problems: ${tl.diagnostics.map((d) => `${d.where}: ${d.message}`).join("; ")}`);
  return out;
}
