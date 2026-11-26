/**
 * A blockout, played where a take is asked for: the stretch of another cut (a grey set, a stand-in for each person and
 * the camera's move) that a take would be given to keep the camera of. It's the cut itself, drawn live, in the format
 * and over the seconds the engine would render and send (`blockoutStretch`), so what's watched here is what's paid for.
 */
import { blockoutStretch, cutView, type ProjectFile } from "@beatsheet/schema";
import { BeatsheetVideo, metadataFor, type VideoProps } from "@beatsheet/video";
import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";

/** A blockout as a shot keeps it: the cut it's drawn in, which of its shots to follow, and video vs 16-frame sheet mode. */
export type BlockoutPick = { cut: string; shots?: string[]; mode?: "video" | "sheet" };

/** The cuts that could be a blockout for `cutId`: the project's other cuts made only of designed shots. */
export function blockoutCuts(doc: ProjectFile | undefined, cutId: string | undefined) {
  return (doc?.cuts ?? []).filter((c) => c.id !== cutId && c.shots.length > 0 && c.shots.every((s) => s.content.kind === "coded"));
}

/** The stretch a pick comes to for a take of this shape, or nothing when its cut is gone. */
export function useBlockout(pick: BlockoutPick | undefined, aspect: string) {
  const doc = useStore((s) => s.doc);
  return useMemo(() => {
    const cut = pick && doc?.cuts.find((c) => c.id === pick.cut);
    if (!doc || !cut) return undefined;
    const project = cutView(doc, cut.id);
    return { project, name: cut.name, shots: cut.shots, ...blockoutStretch(project, pick!.shots, aspect) };
  }, [doc, pick?.cut, pick?.shots?.join(), aspect]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Plays it from its start: for watching a take and its blockout together. */
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
  if (!b || !inputProps || !meta || !(b.to - b.from > 0) || meta.durationInFrames < 2) return <div className="blockout-none dim small">{b ? "Nothing to play in that stretch." : "That cut isn't in the project any more."}</div>;
  return (
    <Player
      // A different stretch is a different clip: it starts again from its first frame.
      key={`${pick.cut}:${b.format.id}:${first}:${last}`}
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
 * Interactive before/after wipe comparator stacking a take over its 3D blockout so framing, camera moves and cut
 * alignment can be scrubbed directly on top of each other.
 */
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
      <div className="wipe-layer wipe-base">
        <BlockoutPlayer ref={blockoutRef} pick={pick} aspect={aspect.replace(/\s+/g, "").replace("/", ":")} />
      </div>
      <div className="wipe-layer wipe-top" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
        {children}
      </div>
      <div
        className="wipe-handle"
        style={{ left: `${split}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Compare blockout and take"
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
      <span className="stage-tag">Blockout{label ? ` · ${label}` : ""}</span>
      <span className="stage-tag right">Take</span>
    </div>
  );
}
