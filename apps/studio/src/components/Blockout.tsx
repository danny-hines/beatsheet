/**
 * Live 3D blockout player: renders either a shot-owned `shot.blockout` (1:1 on the shot, never a separate cut)
 * or a legacy cut-based blockout stretch directly via Remotion `<Player>`.
 */
import { blockoutProject, blockoutStretch, cutView, type Blockout, type ProjectFile } from "@beatsheet/schema";
import { BeatsheetVideo, metadataFor, type VideoProps } from "@beatsheet/video";
import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";

/** A blockout reference: either a shot's own `shot.blockout`, an inline Blockout preview, or a legacy cut stretch. */
export type BlockoutPick =
  | { blockout: true; shot: string; cut?: string; mode?: "video" | "sheet" }
  | { inline: Blockout; shot?: string; mode?: "video" | "sheet" }
  | { cut: string; shots?: string[]; mode?: "video" | "sheet" };

/** Legacy cuts that could be a blockout for `cutId`: other cuts made only of designed shots. */
export function blockoutCuts(doc: ProjectFile | undefined, cutId: string | undefined) {
  return (doc?.cuts ?? []).filter((c) => c.id !== cutId && c.shots.length > 0 && c.shots.every((s) => s.content.kind === "coded"));
}

/** Resolves any BlockoutPick into a playable stand-in Project, Format, and [from, to] stretch. */
export function useBlockout(pick: BlockoutPick | undefined, aspect: string) {
  const doc = useStore((s) => s.doc);
  const currentCutId = useStore((s) => s.cutId);
  const pickKey = !pick
    ? ""
    : "inline" in pick
      ? `inline:${JSON.stringify(pick.inline)}`
      : "blockout" in pick
        ? `shot:${pick.cut ?? currentCutId}:${pick.shot}`
        : `cut:${pick.cut}:${pick.shots?.join(",") ?? ""}`;
  return useMemo(() => {
    if (!doc || !pick) return undefined;
    if ("inline" in pick) {
      const base = cutView(doc, currentCutId);
      const bp = blockoutProject(base, pick.shot ?? "preview", pick.inline, aspect);
      return { project: bp.project, name: pick.inline.note ?? "Camera blockout", shots: bp.project.shots, format: bp.format, from: 0, to: bp.duration };
    }
    if ("blockout" in pick) {
      const targetCut = pick.cut ?? currentCutId;
      const base = cutView(doc, targetCut);
      const shot = base.shots.find((s) => s.id === pick.shot);
      if (!shot?.blockout?.beats.length) return undefined;
      const bp = blockoutProject(base, shot.id, shot.blockout, aspect);
      return {
        project: bp.project,
        name: shot.blockout.note ?? `${shot.label ?? shot.id} blockout`,
        shots: bp.project.shots,
        format: bp.format,
        from: 0,
        to: bp.duration,
      };
    }
    const cut = doc.cuts.find((c) => c.id === pick.cut);
    if (!cut) return undefined;
    const project = cutView(doc, cut.id);
    return { project, name: cut.name, shots: cut.shots, ...blockoutStretch(project, pick.shots, aspect) };
  }, [doc, currentCutId, pickKey, aspect]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Plays a live blockout from its start: for watching a take and its blockout together. */
export type BlockoutHandle = { restart(): void; pause(): void };

export const BlockoutPlayer = forwardRef<BlockoutHandle, { pick: BlockoutPick; aspect: string }>(function BlockoutPlayer({ pick, aspect }, ref) {
  const projectId = useStore((s) => s.projectId)!;
  const codeVersion = useStore((s) => s.codeVersion);
  const b = useBlockout(pick, aspect);
  const player = useRef<PlayerRef>(null);
  const inputProps = useMemo<VideoProps | undefined>(() => b && { project: b.project, format: b.format.id, mediaBase: `/media/${projectId}`, quality: "proxy", codeVersion }, [b, projectId, codeVersion]);
  const meta = useMemo(() => inputProps && metadataFor(inputProps), [inputProps]);
  const first = b && meta ? Math.min(meta.durationInFrames - 1, Math.max(0, Math.round(b.from * meta.fps))) : 0;
  const last = b && meta ? Math.min(meta.durationInFrames - 1, Math.max(first + 1, Math.round(b.to * meta.fps) - 1)) : 0;
  useImperativeHandle(
    ref,
    () => ({
      restart() {
        player.current?.seekTo(first);
        player.current?.play();
      },
      pause: () => player.current?.pause(),
    }),
    [first],
  );
  if (!b || !inputProps || !meta || !(b.to - b.from > 0) || meta.durationInFrames < 2) {
    return <div className="blockout-none dim small">{b ? "Nothing to play in that stretch." : "Blockout unavailable."}</div>;
  }
  const key = "inline" in pick ? `inline:${b.format.id}:${first}:${last}` : "blockout" in pick ? `shot:${pick.shot}:${b.format.id}:${first}:${last}` : `cut:${pick.cut}:${b.format.id}:${first}:${last}`;
  return (
    <Player
      key={key}
      ref={player}
      component={BeatsheetVideo}
      inputProps={inputProps}
      durationInFrames={meta.durationInFrames}
      compositionWidth={meta.width}
      compositionHeight={meta.height}
      fps={meta.fps}
      inFrame={first}
      outFrame={last}
      initialFrame={first}
      loop
      controls
      errorFallback={({ error }) => <div className="blockout-none warn small">The blockout couldn't be drawn: {error.message}</div>}
      style={{ height: "100%", maxWidth: "100%", aspectRatio: `${meta.width} / ${meta.height}` }}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      acknowledgeRemotionLicense
      numberOfSharedAudioTags={0}
    />
  );
});

/**
 * Interactive before/after wipe comparator stacking a take over any base media/blockout layer so framing,
 * camera moves, motion transfer and cut alignment can be scrubbed directly on top of each other.
 */
export function WipeFrame({
  aspect,
  baseLabel,
  topLabel = "Take",
  base,
  top,
}: {
  aspect: string;
  baseLabel: string;
  topLabel?: string;
  base: ReactNode;
  top: ReactNode;
}) {
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setSplit(Math.max(2, Math.min(98, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={box}
      className="stage blockout-wipe"
      style={{ aspectRatio: aspect }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("video, button, input")) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId) && move(e.clientX)}
    >
      <div className="wipe-layer wipe-base">{base}</div>
      <div className="wipe-layer wipe-top" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        {top}
      </div>
      <div
        className="wipe-handle"
        style={{ left: `${split}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Compare guide and take"
        aria-valuemin={2}
        aria-valuemax={98}
        aria-valuenow={Math.round(split)}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && move(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setSplit((s) => Math.max(2, s - 4));
          if (e.key === "ArrowRight") setSplit((s) => Math.min(98, s + 4));
        }}
      >
        <span className="wipe-knob" aria-hidden="true">
          ↔
        </span>
      </div>
      <span className="stage-tag">{baseLabel}</span>
      <span className="stage-tag right">{topLabel}</span>
    </div>
  );
}

/** Legacy convenience wrapper stacking children over a live BlockoutPlayer. */
export function BlockoutWipe({
  pick,
  aspect,
  label,
  blockoutRef,
  children,
}: {
  pick: BlockoutPick;
  aspect: string;
  label?: string;
  blockoutRef?: React.Ref<BlockoutHandle>;
  children: ReactNode;
}) {
  return (
    <WipeFrame
      aspect={aspect}
      baseLabel={`Blockout${label ? ` · ${label}` : ""}`}
      base={<BlockoutPlayer ref={blockoutRef} pick={pick} aspect={aspect.replace(/\s+/g, "").replace("/", ":")} />}
      top={children}
    />
  );
}
