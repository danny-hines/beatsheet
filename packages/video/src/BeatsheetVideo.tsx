/**
 * The one composition behind every beatsheet project: the studio plays it live and the renderer exports it. It draws
 * straight from project.json, so a drag in the timeline and an agent's edit show up the same way.
 */
import {
  centreOn,
  cover,
  pictureOf,
  resolveTimeline,
  SFX_SECONDS,
  SFX_SOUNDS,
  subjectAt,
  subjectFocus,
  versionAt,
  type Asset,
  type Captions as CaptionSettings,
  type ClipEffect,
  type Cover,
  type Grade,
  type Look,
  type Motion,
  type Project,
  type ResolvedShot,
  type Shot,
  type SubjectTrack,
  type Timeline,
  type Track,
} from "@beatsheet/schema";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, getRemotionEnvironment, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Grain, SceneContext, type SceneInfo } from "./kit/index.tsx";
import { GradeDefs, gradeFilter, Vignette } from "./grade.tsx";
import { SceneComponent } from "./runtime.tsx";

export type MediaQuality = "proxy" | "original";
export type VideoProps = {
  project: Project;
  format: string;
  /** Where media is served, e.g. /media/july-4 in the studio or http://localhost:4321/media/july-4 when rendering. */
  mediaBase: string;
  quality: MediaQuality;
  /** Changes when the project's scene code changes, so scenes reload. */
  codeVersion?: string;
  /** Only this part of the sound plays (a track's id, or voice, music or sfx): the studio's solo, never saved. */
  solo?: string;
};

/** How loud a part of the mix plays: its level in the cut, off when it's muted or another part is soloed. */
export type Loudness = { gain: number; muted: boolean };
export function loudnessOf(project: Project, part: string, solo?: string): Loudness {
  const track = project.tracks.find((t) => t.id === part);
  const own = track ? { gain: track.gain, muted: track.muted } : project.mix?.[part as "voice" | "music" | "sfx"];
  return { gain: own?.gain ?? 1, muted: !!own?.muted || (!!solo && solo !== part) };
}

export function assetUrl(base: string, a: Asset, quality: MediaQuality): string {
  if (quality === "proxy" && a.kind === "video") return `${base}/asset/${a.id}/proxy`;
  if (quality === "proxy" && a.kind === "image") return `${base}/asset/${a.id}/image`;
  return `${base}/asset/${a.id}/original`;
}
export const fileUrl = (base: string, path: string) => `${base}/file/${encodeURIComponent(path)}`;
/** Where a clip's sound plays from: its cleaned sound once it's been cleaned, else its own file. */
export const soundUrl = (base: string, a: Asset, quality: MediaQuality) => (a.cleaned ? `${base}/asset/${a.id}/sound` : assetUrl(base, a, quality));

/** Size, frame rate and length of the composition for a project in one format. */
export function metadataFor(props: VideoProps) {
  const fmt = props.project.formats.find((f) => f.id === props.format) ?? props.project.formats[0]!;
  const tl = resolveTimeline(props.project, fmt.id);
  const seconds = Number.isFinite(tl.duration) && tl.duration > 0 ? tl.duration : 1;
  return { width: fmt.width, height: fmt.height, fps: fmt.fps, durationInFrames: Math.max(1, Math.ceil(seconds * fmt.fps)) };
}

export const BeatsheetVideo: React.FC<VideoProps> = ({ project, format, mediaBase, quality, codeVersion, solo }) => {
  const { fps } = useVideoConfig();
  const tl = useMemo(() => resolveTimeline(project, format), [project, format]);
  const assets = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project]);
  const shots = useMemo(() => new Map(project.shots.map((s) => [s.id, s])), [project]);
  const f = (t: number) => Math.round(t * fps);
  const hasMusic = tl.cues.length > 0;
  const underlay = useMemo(() => underlayFinder(project, tl), [project, tl]);
  const look = project.look ?? {};
  const duck = useMemo(() => ducker(tl, project.music?.duck), [tl, project.music?.duck]);
  const scene = { project, tl, assets, base: mediaBase, quality, format, codeVersion };
  const music = loudnessOf(project, "music", solo), voice = loudnessOf(project, "voice", solo), sfx = loudnessOf(project, "sfx", solo);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <LookFonts look={look} base={mediaBase} />
      {project.tracks.map((track) =>
        track.hidden ? null : tl.shots
          .filter((r) => r.track === track.id && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
          .map((r) => (
            // Premounting loads and seeks each shot's media a second early, so cuts don't stall playback.
            <Sequence key={r.id} from={f(r.start)} durationInFrames={Math.max(1, f(r.end) - f(r.start))} premountFor={fps} name={`${r.id} ${shots.get(r.id)?.label ?? ""}`}>
              <Entrance shot={shots.get(r.id)!} r={r} assets={assets} format={format} underlay={underlay}>
                <ShotView shot={shots.get(r.id)!} r={r} track={track} assets={assets} base={mediaBase} quality={quality} muteClips={hasMusic} format={format} underlay={underlay} scene={scene} loud={loudnessOf(project, track.id, solo)} />
              </Entrance>
            </Sequence>
          )),
      )}
      {look.grain ? <Grain amount={look.grain} /> : null}
      {project.captions && <CaptionsLayer tl={tl} project={project} settings={project.captions} look={look} />}
      {tl.cues.map((c) => {
        const a = assets.get(c.asset);
        if (!a || !Number.isFinite(c.start) || !Number.isFinite(c.end) || music.muted) return null;
        const dur = Math.max(1, f(c.end) - f(c.start));
        return (
          <Sequence key={c.id} from={f(c.start)} durationInFrames={dur} premountFor={fps} name={`music ${c.id}`}>
            <Audio
              src={assetUrl(mediaBase, a, "original")}
              onError={mediaError(a.label ?? a.id)}
              trimBefore={f(c.trackFrom)}
              // Fades in and out, and dips under the narration.
              volume={(fr) => music.gain * c.gain * Math.min(1, c.fadeIn ? fr / (c.fadeIn * fps) : 1, c.fadeOut ? (dur - fr) / (c.fadeOut * fps) : 1) * duck(c.start + fr / fps)}
            />
          </Sequence>
        );
      })}
      {tl.lines.map((l) => {
        const file = project.voice?.lines.find((x) => x.id === l.id)?.file;
        if (!file || voice.muted) return null;
        return (
          <Sequence key={l.id} from={f(l.start)} durationInFrames={f(l.end) - f(l.start) + 8} name={`voice ${l.id}`}>
            <Audio src={fileUrl(mediaBase, file)} volume={voice.gain} onError={mediaError(`line ${l.id}`)} />
          </Sequence>
        );
      })}
      {tl.sfx.map((x) => {
        if (!Number.isFinite(x.t) || sfx.muted) return null;
        const a = assets.get(x.sound);
        const src = a ? assetUrl(mediaBase, a, "original") : (SFX_SOUNDS as readonly string[]).includes(x.sound) ? `${mediaBase}/sfx/${x.sound}` : undefined;
        if (!src) return null;
        return (
          // As long as the sound itself (a little over), so a run of quick pops doesn't hold a pile of audio open.
          <Sequence key={x.id} from={Math.max(0, f(x.t))} durationInFrames={Math.max(1, f((a?.duration ?? SFX_SECONDS[x.sound as keyof typeof SFX_SECONDS] ?? 2) + 0.1))} name={`sound ${x.id}`}>
            <Audio src={src} volume={x.gain * sfx.gain} onError={mediaError(`sound ${x.sound}`)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * How loud the music plays at time t: full, or `level` (0.35 unless the cut says) while the narration speaks, easing
 * down just before each line and back up just after.
 */
function ducker(tl: Timeline, level?: number) {
  const dip = level ?? 0.35;
  if (!tl.lines.length || dip >= 1) return () => 1;
  const spans = tl.lines.filter((l) => Number.isFinite(l.start)).map((l) => [l.start - 0.12, l.end + 0.2] as const);
  const ramp = 0.25;
  return (t: number) => {
    let w = 0;
    for (const [a, b] of spans) w = Math.max(w, Math.min(1, Math.max(0, Math.min((t - (a - ramp)) / ramp, (b + ramp - t) / ramp))));
    return 1 - w * (1 - dip);
  };
}

/** The look's own font files, loaded before anything draws with them. */
function LookFonts({ look, base }: { look: Look; base: string }) {
  const files = look.fontFiles ?? [];
  const key = files.map((f) => `${f.family}:${f.path}`).join("|");
  const [handle] = useState(() => (files.length && getRemotionEnvironment().isRendering ? delayRender("Loading the look's fonts") : null));
  useEffect(() => {
    if (!files.length || typeof FontFace === "undefined") return void (handle !== null && continueRender(handle));
    Promise.all(
      files.map(async (f) => {
        const face = new FontFace(f.family, `url(${base}/project-file/${f.path.split("/").map(encodeURIComponent).join("/")})`, { weight: f.weight ?? "normal", style: f.style ?? "normal" });
        document.fonts.add(await face.load());
      }),
    )
      .catch((err) => console.error("beatsheet: a look font didn't load", err))
      .finally(() => handle !== null && continueRender(handle));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * The narration on screen, a short phrase at a time, the word being spoken in the accent colour. Off while a shot that
 * already shows the same words (`captions: false`) plays.
 */
function CaptionsLayer({ tl, project, settings, look }: { tl: Timeline; project: Project; settings: CaptionSettings; look: Look }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const phrases = useMemo(() => phrasesOf(tl), [tl]);
  const quiet = useMemo(() => {
    const off = new Set(project.shots.filter((s) => s.captions === false).map((s) => s.id));
    return tl.shots.filter((r) => off.has(r.id));
  }, [tl, project.shots]);
  if (quiet.some((r) => t >= r.start && t < r.end)) return null;
  const i = phrases.findIndex((p, k) => t >= p.from && t < (phrases[k + 1]?.from ?? p.until) && t < p.until);
  const phrase = phrases[i];
  if (!phrase) return null;
  const u = Math.min(width, height) / 1080;
  const size = 78 * u * (settings.size ?? 1);
  // The brand's highlight, else the usual caption yellow.
  const accent = look.colors?.accent ?? "#ffd60a";
  const upper = settings.uppercase ?? look.fonts?.caps ?? true;
  const pos = settings.position ?? "bottom";
  const highlight = (settings.style ?? "words") === "words";
  return (
    <AbsoluteFill
      style={{
        justifyContent: pos === "top" ? "flex-start" : pos === "middle" ? "center" : "flex-end",
        alignItems: "center",
        padding: pos === "bottom" ? `0 ${70 * u}px ${height > width ? height * 0.2 : height * 0.1}px` : pos === "top" ? `${height * 0.12}px ${70 * u}px 0` : `0 ${70 * u}px`,
        pointerEvents: "none",
      }}
    >
      <div style={{ textAlign: "center", lineHeight: 1.05, fontFamily: look.fonts?.display ?? "Helvetica Neue, Arial, sans-serif", fontWeight: look.fonts?.displayWeight ?? 800, fontSize: size, textTransform: upper ? "uppercase" : "none" }}>
        {phrase.words.map((w, k) => {
          const on = highlight && t >= w.s && t < (phrase.words[k + 1]?.s ?? phrase.until);
          const pop = on ? 1 + 0.08 * Math.max(0, 1 - (t - w.s) / 0.12) : 1;
          return (
            <span
              key={k}
              style={{
                display: "inline-block",
                marginRight: "0.25em",
                color: on ? accent : "#fff",
                transform: `scale(${pop})`,
                WebkitTextStroke: `${Math.max(2, 7 * u)}px #111`,
                paintOrder: "stroke fill",
                textShadow: `0 ${6 * u}px ${18 * u}px rgba(0,0,0,0.45)`,
              }}
            >
              {w.w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

type Phrase = { from: number; until: number; words: { w: string; s: number; e: number }[] };

/** Narration cut into phrases of a few words, breaking at punctuation, each shown from its first word to the next phrase. */
export function phrasesOf(tl: Timeline): Phrase[] {
  const out: Phrase[] = [];
  for (const line of tl.lines) {
    if (!Number.isFinite(line.start)) continue;
    let cur: Phrase["words"] = [];
    const flush = () => {
      if (!cur.length) return;
      out.push({ from: cur[0]!.s - 0.04, until: cur[cur.length - 1]!.e + 0.35, words: cur });
      cur = [];
    };
    for (const w of line.words) {
      cur.push(w);
      const chars = cur.reduce((n, x) => n + x.w.length + 1, 0);
      if (/[,.;:!?]$/.test(w.w) || cur.length >= 3 || chars > 16) flush();
    }
    flush();
  }
  return out;
}

type Underlay = { r: ResolvedShot; shot: Shot; asset: Asset };
export type FindUnderlay = (assetId: string, t: number) => Underlay | undefined;

/** Clip shots on picture tracks by asset, so a cut-out can line up over its source while both are on screen. */
export function underlayFinder(project: Project, tl: Timeline): FindUnderlay {
  const shots = new Map(project.shots.map((s) => [s.id, s]));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const picture = new Set(project.tracks.filter((t) => t.kind === "picture").map((t) => t.id));
  const list = tl.shots
    .filter((r) => picture.has(r.track) && Number.isFinite(r.start) && Number.isFinite(r.end))
    .map((r) => ({ r, shot: shots.get(r.id)! }))
    .filter((x) => x.shot?.content.kind === "clip");
  return (assetId, t) => {
    const hit = list.find((x) => x.shot.content.kind === "clip" && x.shot.content.asset === assetId && t >= x.r.start - 1e-3 && t < x.r.end);
    return hit && { ...hit, asset: assets.get(assetId)! };
  };
}

type SceneEnv = { project: Project; tl: Timeline; assets: Map<string, Asset>; base: string; quality: MediaQuality; format: string; codeVersion?: string };

function ShotView(props: {
  shot: Shot;
  r: ResolvedShot;
  track: Track;
  assets: Map<string, Asset>;
  base: string;
  quality: MediaQuality;
  muteClips: boolean;
  format: string;
  underlay: FindUnderlay;
  scene: SceneEnv;
  loud: Loudness;
}) {
  const { shot, r, track, assets } = props;
  const c = shot.content;
  if (c.kind === "text") return <TextOverlay text={c.text} style={c.style} duration={r.end - r.start} look={props.scene.project.look} />;
  if (c.kind === "coded") return <CodedShot component={c.component} props={c.props ?? {}} r={r} env={props.scene} fallback={track.kind === "picture" ? <Card shot={shot} /> : undefined} />;
  const assetId = c.kind === "clip" ? c.asset : c.kind === "generated" ? c.take : undefined;
  const a = assetId ? assets.get(assetId) : undefined;
  if (!a || (a.kind !== "video" && a.kind !== "image")) return track.kind === "picture" ? <Card shot={shot} /> : <Chip shot={shot} />;
  const version = c.kind === "clip" && c.version ? assets.get(c.version) : undefined;
  return <Picture {...props} a={a} version={version} grade={props.scene.project.look?.grade} />;
}

/** A designed scene: what it knows about its shot (time, words, beats, look, assets), then the scene itself. */
function CodedShot({ component, props, r, env, fallback }: { component: string; props: Record<string, unknown>; r: ResolvedShot; env: SceneEnv; fallback?: ReactNode }) {
  const info = useMemo<SceneInfo>(() => {
    const words = env.tl.lines.flatMap((l) => l.words.map((w) => ({ w: w.w, s: w.s - r.start, e: w.e - r.start, line: l.id })));
    const beats = env.tl.beats.map((b) => ({ t: b.t - r.start, bar: b.bar }));
    return {
      start: r.start,
      duration: r.end - r.start,
      format: env.format,
      look: env.project.look ?? {},
      words,
      beats,
      assets: env.assets,
      assetUrl: (id: string) => {
        const a = env.assets.get(id);
        return a ? assetUrl(env.base, a, env.quality) : "";
      },
      fileUrl: (path: string) => `${env.base}/scene-file/${path.split("/").map(encodeURIComponent).join("/")}`,
      props,
    };
  }, [r.start, r.end, env, props]);
  return (
    <SceneContext.Provider value={info}>
      <SceneComponent component={component} codeBase={`${env.base}/code`} codeVersion={env.codeVersion} props={props} fallback={fallback} />
    </SceneContext.Provider>
  );
}

/**
 * How a picture sits in the frame `local` seconds into its shot: its crop (following a subject when the reframe says
 * so) and, for a cut-out on screen with its source, the source shot's crop and moment, so the two line up exactly.
 */
export function placement(shot: Shot, r: ResolvedShot, a: Asset, format: string, underlay: FindUnderlay, local: number, out: { width: number; height: number }) {
  const c = shot.content;
  const under = a.cutout ? underlay(a.cutout.of, r.start + local) : undefined;
  const placed = under ?? { r, shot, asset: a };
  const pc = placed.shot.content.kind === "clip" ? placed.shot.content : undefined;
  const speed = pc?.speed ?? (c.kind === "clip" ? c.speed ?? 1 : 1);
  // Seconds into the placed asset's file now (what its subjects are timed by).
  const sourceT = (placed.r.sourceIn ?? 0) + (r.start + local - placed.r.start) * speed;
  // A clip and a generated shot are framed the same way.
  const reframe = pc?.reframe?.[format] ?? pictureOf(c)?.reframe?.[format];
  const src = { width: placed.asset.width ?? a.width ?? out.width, height: placed.asset.height ?? a.height ?? out.height };
  const follow = reframe?.follow ? placed.asset.subjects?.find((x) => x.id === reframe.follow) : undefined;
  const focus = follow ? subjectFocus(follow, sourceT) : undefined;
  const pos = focus ? centreOn(src, out, focus) : reframe ? { x: reframe.x, y: reframe.y } : { x: 0.5, y: 0.5 };
  // Photos get a slow push in; a cut-out photo pushes in with its source, or holds still on its own.
  const pushes = a.kind === "image" && (!a.cutout || !!under) && !pictureOf(c)?.motion;
  const pushFrom = under ? under.r.start : r.start, pushLen = under ? under.r.end - under.r.start : r.end - r.start;
  const push = pushes ? interpolate(r.start + local - pushFrom, [0, Math.max(0.01, pushLen)], [1, 1.07], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const zoom = (reframe?.zoom ?? 1) * push;
  // A cut-out clip plays the stretch of its own file that matches its source's moment.
  const trimSeconds = under && a.cutout ? Math.max(0, sourceT - local * speed - (a.cutout.from ?? 0)) : r.sourceIn ?? 0;
  return { pos, zoom, sourceT, speed, trimSeconds, cover: cover(src, out, pos, zoom) };
}

function Picture(props: { shot: Shot; r: ResolvedShot; a: Asset; version?: Asset; base: string; quality: MediaQuality; muteClips: boolean; format: string; underlay: FindUnderlay; grade?: Grade; loud: Loudness }) {
  const { shot, r, a, version, base, quality, muteClips, format, underlay, grade, loud } = props;
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const c = shot.content;
  const p = placement(shot, r, a, format, underlay, frame / fps, { width, height });
  const origin = `${p.pos.x * 100}% ${p.pos.y * 100}%`;
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: origin,
    transformOrigin: origin,
    transform: p.zoom !== 1 ? `scale(${p.zoom})` : undefined,
  };
  const effects = !a.cutout ? pictureOf(c)?.effects : undefined;
  const own = c.kind === "clip" ? c.volume : undefined;
  const muted = a.cutout || loud.muted ? true : own === undefined ? muteClips : own === 0;
  // Its own volume times its track's, fading up at the start and away at the end when it says so.
  const fadeIn = c.kind === "clip" ? c.fadeIn : undefined, fadeOut = c.kind === "clip" ? c.fadeOut : undefined;
  const level = (own ?? 1) * loud.gain;
  const frames = (r.end - r.start) * fps;
  const volume = fadeIn || fadeOut ? (fr: number) => level * Math.max(0, Math.min(1, fadeIn ? fr / (fadeIn * fps) : 1, fadeOut ? (frames - fr) / (fadeOut * fps) : 1)) : level === 1 ? undefined : level;
  // A version of the clip (restored, made again) shows in its place where it covers what the shot plays.
  const vAt = version && !a.cutout ? versionAt(version, a.id, r.sourceIn ?? 0, (r.sourceIn ?? 0) + (r.end - r.start) * p.speed) : undefined;
  const shown = vAt !== undefined ? version! : a;
  // The sound stays the clip's own, cleaned when it has been: then it plays beside the picture, which is muted.
  const apart = !a.cutout && (vAt !== undefined || !!a.cleaned);
  // The project's grade, then the shot's own look (mono behind a cut-out, say).
  style.filter = gradeFilter(grade, c.kind === "clip" && c.look ? LOOKS[c.look] : undefined);
  const motion = pictureOf(c)?.motion;
  const move = motion ? poseAt(motion, frame / fps / Math.max(0.01, r.end - r.start), width, height) : undefined;
  // In the player a file that won't load (still being made, gone missing) shows as a card; a render still fails on it.
  const [broken, setBroken] = useState("");
  const onError = getRemotionEnvironment().isPlayer ? (err?: unknown) => setBroken(err instanceof Error ? err.message : "it didn't load") : undefined;
  if (broken) return <MissingMedia label={a.label ?? a.id} why={broken} />;
  return (
    <AbsoluteFill style={{ overflow: "hidden", transform: move }}>
      <GradeDefs grade={grade} />
      {a.kind === "image" ? (
        <Img src={assetUrl(base, a, quality)} style={style} pauseWhenLoading onError={onError && (() => onError())} />
      ) : (
        <OffthreadVideo
          src={assetUrl(base, shown, quality)}
          onError={onError}
          trimBefore={Math.max(0, Math.round((vAt ?? p.trimSeconds) * fps))}
          playbackRate={p.speed}
          muted={apart || muted}
          volume={apart ? undefined : volume}
          style={style}
          transparent={!!a.cutout}
          pauseWhenBuffering
        />
      )}
      {a.kind === "video" && apart && !muted && (
        <Audio src={soundUrl(base, a, quality)} trimBefore={Math.max(0, Math.round(p.trimSeconds * fps))} playbackRate={p.speed} volume={volume} pauseWhenBuffering onError={mediaError(`the sound of ${a.label ?? a.id}`)} />
      )}
      {/* A cut-out's source underneath already has the vignette. */}
      {!a.cutout && <Vignette amount={grade?.vignette} />}
      {effects?.map((e, i) => <SubjectEffect key={i} effect={e} track={a.subjects?.find((x) => x.id === e.subject)} t={p.sourceT} cover={p.cover} />)}
    </AbsoluteFill>
  );
}

/** In the player, a sound that won't load is skipped (with a warning) instead of stopping the whole preview. */
const mediaError = (what: string) => (getRemotionEnvironment().isPlayer ? (err: Error) => console.warn(`beatsheet: couldn't play ${what}: ${err.message}`) : undefined);

/** Where a picture couldn't be shown in the player: what it was, and why. */
function MissingMedia({ label, why }: { label: string; why: string }) {
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  return (
    <AbsoluteFill style={{ background: "#15161b", color: "#c9ccd4", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 60 * u, fontFamily: "Helvetica Neue, Arial, sans-serif" }}>
      <div style={{ fontSize: 34 * u, fontWeight: 700 }}>Couldn't play “{label}”</div>
      <div style={{ fontSize: 22 * u, opacity: 0.7, marginTop: 10 * u }}>{why}</div>
    </AbsoluteFill>
  );
}

const EASES: Record<string, (x: number) => number> = {
  linear: (x) => x,
  in: (x) => x * x * x,
  out: (x) => 1 - Math.pow(1 - x, 3),
  "in-out": (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
};

/** Where a moving picture is `p` (0..1) of the way through its shot: a CSS transform between its two poses. */
export function poseAt(m: Motion, p: number, width: number, height: number): string {
  const k = (EASES[m.ease ?? "in-out"] ?? EASES["in-out"]!)(Math.min(1, Math.max(0, p)));
  const a = m.from ?? {}, b = m.to ?? {};
  const mix = (x: number | undefined, y: number | undefined, d: number) => (x ?? d) + ((y ?? d) - (x ?? d)) * k;
  return `translate(${mix(a.x, b.x, 0) * width}px, ${mix(a.y, b.y, 0) * height}px) rotate(${mix(a.rotate, b.rotate, 0)}deg) scale(${mix(a.scale, b.scale, 1)})`;
}

/** Looks a clip can be drawn with; mono or dim behind full-colour cut-outs of the same picture makes them pop. */
export const LOOKS: Record<string, string> = {
  mono: "grayscale(1) contrast(1.05)",
  dim: "brightness(0.55)",
  blur: "blur(18px) brightness(0.8)",
  "mono-dim": "grayscale(1) brightness(0.6)",
  warm: "sepia(0.25) saturate(1.25) hue-rotate(-8deg)",
  cool: "saturate(0.9) hue-rotate(12deg) brightness(1.02)",
  faded: "contrast(0.85) saturate(0.75) brightness(1.08)",
};

/** A blur, name tag or spotlight that follows a subject; nothing while the subject isn't on screen. */
function SubjectEffect({ effect, track, t, cover: cv }: { effect: ClipEffect; track?: SubjectTrack; t: number; cover: Cover }) {
  const { width, height } = useVideoConfig();
  if (!track) return null;
  const box = subjectAt(track, t);
  if (!box) return null;
  const px = cv.rect(box);
  const u = width / 1080;
  if (effect.kind === "blur") {
    // A little larger than the box, so hair and chin are covered too.
    const pad = 0.18;
    const w = px.w * (1 + pad * 2), h = px.h * (1 + pad * 2);
    const blur = `blur(${Math.round(Math.max(6, (effect.amount ?? 0.6) * 0.12 * Math.max(w, h)))}px)`;
    return (
      <div
        style={{
          position: "absolute",
          left: px.x - px.w * pad,
          top: px.y - px.h * pad,
          width: w,
          height: h,
          borderRadius: effect.shape === "box" ? 12 * u : "50%",
          backdropFilter: blur,
          WebkitBackdropFilter: blur,
          background: "rgba(128,128,128,0.08)",
        }}
      />
    );
  }
  if (effect.kind === "spotlight") {
    const cx = px.x + px.w / 2, cy = px.y + px.h / 2;
    const rx = Math.max(px.w, px.h) * 0.9;
    return <AbsoluteFill style={{ background: `radial-gradient(ellipse ${rx}px ${rx * 1.15}px at ${cx}px ${cy}px, transparent 55%, rgba(0,0,0,${effect.amount ?? 0.55}) 100%)` }} />;
  }
  const below = effect.place === "below";
  const cx = Math.min(width - 40 * u, Math.max(40 * u, px.x + px.w / 2));
  const y = below ? Math.min(height - 120 * u, px.y + px.h + 18 * u) : Math.max(20 * u, px.y - 18 * u);
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: y,
        transform: `translate(-50%, ${below ? "0" : "-100%"})`,
        background: "rgba(255,255,255,0.94)",
        color: "#111",
        fontFamily: "Helvetica Neue, Arial, sans-serif",
        fontWeight: 800,
        fontSize: 40 * u,
        padding: `${10 * u}px ${22 * u}px`,
        borderRadius: 999,
        whiteSpace: "nowrap",
        boxShadow: `0 ${6 * u}px ${24 * u}px rgba(0,0,0,0.35)`,
      }}
    >
      {effect.text}
    </div>
  );
}

const ENTRANCES = ["pop", "fade", "slide-up", "zoom", "whip", "flash", "wipe", "glitch", "blur", "slam"];

/**
 * How a shot comes in (its `transition`): pop, fade, slide-up or zoom. A cut-out grows from its own middle, so the
 * pieces of a picture can pop in one by one right where they belong.
 */
function Entrance(props: { shot: Shot; r: ResolvedShot; assets: Map<string, Asset>; format: string; underlay: FindUnderlay; children: React.ReactNode }) {
  const kind = props.shot.transition?.kind;
  if (!kind || !ENTRANCES.includes(kind)) return <>{props.children}</>;
  return <EntranceMotion {...props} kind={kind} />;
}

function EntranceMotion({ shot, r, assets, format, underlay, kind, children }: { shot: Shot; r: ResolvedShot; assets: Map<string, Asset>; format: string; underlay: FindUnderlay; kind: string; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const dur = Math.max(0.05, shot.transition?.duration ?? (kind === "whip" ? 0.22 : kind === "glitch" ? 0.2 : kind === "slam" ? 0.5 : 0.35)) * fps;
  const p = Math.min(1, frame / dur);
  if (p >= 1) return <AbsoluteFill>{children}</AbsoluteFill>;
  if (kind === "flash") return (
    <AbsoluteFill>
      {children}
      <AbsoluteFill style={{ background: "#fff", opacity: 1 - p }} />
    </AbsoluteFill>
  );
  const c = shot.content;
  const a = c.kind === "clip" ? assets.get(c.asset) : undefined;
  let origin = "50% 50%";
  if (a?.cutout?.box) {
    const px = placement(shot, r, a, format, underlay, frame / fps, { width, height }).cover.rect(a.cutout.box);
    origin = `${px.x + px.w / 2}px ${px.y + px.h / 2}px`;
  }
  const easeOut = 1 - Math.pow(1 - p, 3);
  let style: CSSProperties;
  if (kind === "fade") style = { opacity: p };
  else if (kind === "slide-up") style = { opacity: Math.min(1, p * 2), transform: `translateY(${(1 - easeOut) * 12}%)` };
  else if (kind === "zoom") style = { opacity: Math.min(1, p * 2), transform: `scale(${1.15 - 0.15 * easeOut})`, transformOrigin: origin };
  else if (kind === "whip") style = { transform: `translateX(${(1 - easeOut) * 100}%)`, filter: `blur(${(1 - p) * 24}px)` };
  else if (kind === "wipe") style = { clipPath: `inset(0 ${(1 - easeOut) * 100}% 0 0)` };
  else if (kind === "blur") style = { opacity: Math.min(1, p * 1.5), filter: `blur(${(1 - easeOut) * 30}px)` };
  else if (kind === "glitch") {
    const j = (n: number) => Math.sin(frame * 91.7 + n) * 0.5;
    style = { transform: `translate(${j(1) * 6}%, ${j(2) * 1.5}%)`, filter: `hue-rotate(${j(3) * 160}deg) saturate(2)`, opacity: frame % 2 ? 0.85 : 1 };
  } else if (kind === "slam") {
    // Lands big and fast in the first third, then the frame shakes as it settles.
    const land = Math.min(1, p * 3);
    const after = Math.max(0, p * 3 - 1) / 2;
    const shake = after < 1 ? (1 - after) * 2.5 : 0;
    style = { transform: `scale(${1.6 - 0.6 * (1 - Math.pow(1 - land, 3))}) translate(${Math.sin(frame * 83) * shake}%, ${Math.cos(frame * 71) * shake}%)`, opacity: Math.min(1, land * 3), transformOrigin: origin };
  }
  else {
    // pop: grows from nothing, overshoots a touch, settles.
    const back = 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
    style = { opacity: Math.min(1, p * 4), transform: `scale(${Math.max(0, back)})`, transformOrigin: origin };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

function TextOverlay({ text, style, duration, look }: { text: string; style?: string; duration: number; look?: Look }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const fade = Math.min(1, frame / 6, (duration * fps - frame) / 6);
  const u = width / 1080;
  const display = look?.fonts?.display ?? "Helvetica Neue, Arial, sans-serif";
  const heavy = look?.fonts?.displayWeight ?? 900;
  const caps = look?.fonts?.caps ?? true;
  const base: CSSProperties = { color: "#fff", textAlign: "center", textShadow: `0 ${4 * u}px ${18 * u}px rgba(0,0,0,0.6)`, padding: `0 ${60 * u}px` };
  const type: CSSProperties =
    style === "title-huge"
      ? { fontFamily: display, fontWeight: heavy, fontSize: 200 * u, letterSpacing: "-0.01em", textTransform: caps ? "uppercase" : "none", lineHeight: 0.92 }
      : style === "title-bold"
      ? { fontFamily: display, fontWeight: heavy, fontSize: 104 * u, letterSpacing: caps ? "0.04em" : 0, textTransform: caps ? "uppercase" : "none", lineHeight: 1.05 }
      : style === "handwritten"
        ? // The Mac's script faces, then Windows' own.
          { fontFamily: "Snell Roundhand, Brush Script MT, Segoe Script, Ink Free, cursive", fontSize: 120 * u }
        : { fontFamily: look?.fonts?.body ?? "Helvetica Neue, Arial, sans-serif", fontWeight: 700, fontSize: 64 * u };
  return (
    <AbsoluteFill style={{ justifyContent: style === "handwritten" ? "flex-end" : "flex-start", paddingTop: (style === "title-huge" ? 380 : 300) * u, paddingBottom: 360 * u, opacity: fade }}>
      <div style={{ ...base, ...type }}>{text}</div>
    </AbsoluteFill>
  );
}

/** Stand-in for a shot with no picture yet (an idea card, or code the composition can't run). */
function Card({ shot }: { shot: Shot }) {
  const { width } = useVideoConfig();
  const u = width / 1080;
  return (
    <AbsoluteFill
      style={{
        background: shot.content.kind === "placeholder" ? "repeating-linear-gradient(135deg, #22252b 0 40px, #1c1e23 40px 80px)" : "radial-gradient(circle at 30% 20%, #3b3f68, #15161d)",
        color: "#e6e8ec",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 90 * u,
        fontFamily: "Helvetica Neue, Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 28 * u, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.6 }}>{shot.content.kind}</div>
      <div style={{ fontSize: 64 * u, fontWeight: 800, margin: `${16 * u}px 0` }}>{shot.label ?? shot.id}</div>
      {shot.intent && <div style={{ fontSize: 32 * u, lineHeight: 1.35, opacity: 0.8, maxWidth: 900 * u }}>{shot.intent}</div>}
    </AbsoluteFill>
  );
}

function Chip({ shot }: { shot: Shot }) {
  const { width } = useVideoConfig();
  const u = width / 1080;
  return (
    <AbsoluteFill style={{ alignItems: "flex-end", justifyContent: "flex-start", padding: 24 * u }}>
      <div style={{ background: "rgba(0,0,0,0.55)", color: "#cfd3da", fontFamily: "Helvetica Neue, Arial, sans-serif", fontSize: 22 * u, padding: `${6 * u}px ${12 * u}px`, borderRadius: 8 * u }}>
        {shot.label ?? shot.id}
      </div>
    </AbsoluteFill>
  );
}
