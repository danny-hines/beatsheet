/**
 * Unified comparator for ANY guided generation: blockout snapshots (MP4 or 16-frame contact sheet), legacy live
 * blockout cuts, motion-copy (`drive`) clips, camera-ref clips, and clip versions (relight / swap / performance /
 * restore). Used uniformly across ShotPage, Make → Made AssetPage, and reachable in 1 click from Library/Inspect.
 */
import { useEffect, useRef, useState } from "react";
import type { Asset, Camera, ProjectFile } from "@beatsheet/schema";
import { hideBroken, imageUrl, posterUrl, projectFileUrl, proxyUrl, round2 } from "../lib";
import { useStore } from "../store";
import { BlockoutPlayer, WipeFrame, type BlockoutHandle, type BlockoutPick } from "./Blockout";

export type AssetGuide =
  | { kind: "snapshot-video"; label: string; src: string; snapshot: string; shot?: string; legacyCut?: string }
  | { kind: "snapshot-sheet"; label: string; src: string; snapshot: string; shot?: string; legacyCut?: string }
  | { kind: "live-blockout"; label: string; pick: BlockoutPick; shot?: string; legacyCut?: string }
  | { kind: "clip"; label: string; assetId: string; from: number; to?: number; role: "camera" | "drive" | "version" };

/** Resolves the driving guide (blockout snapshot, legacy blockout cut, motion clip, or version source) for an asset. */
export function guideOfAsset(projectId: string, doc: ProjectFile | undefined, cutId: string | undefined, asset: Asset | undefined): AssetGuide | undefined {
  if (!asset) return undefined;
  const params = (asset.provenance?.params ?? {}) as {
    camera?: Camera & { snapshot?: string; snapshotKind?: "video" | "image" };
    drive?: { asset: string; from: number; to?: number };
  };
  const cam = params.camera;
  if (cam) {
    if ("blockout" in cam) {
      const label = `Blockout · ${cam.shot}${cam.mode === "sheet" ? " (16-frame sheet)" : ""}`;
      if (cam.snapshot) {
        const src = projectFileUrl(projectId, cam.snapshot);
        return cam.snapshotKind === "image" || cam.mode === "sheet"
          ? { kind: "snapshot-sheet", label, src, snapshot: cam.snapshot, shot: cam.shot }
          : { kind: "snapshot-video", label, src, snapshot: cam.snapshot, shot: cam.shot };
      }
      return { kind: "live-blockout", label, pick: { blockout: true, shot: cam.shot, cut: cam.cut ?? cutId, mode: cam.mode }, shot: cam.shot };
    }
    if ("cut" in cam) {
      const cutName = doc?.cuts.find((c) => c.id === cam.cut)?.name ?? cam.cut;
      const dur = round2((cam.to ?? 0) - (cam.from ?? 0));
      const label = `Blockout · ${cutName}${dur > 0 ? ` · ${dur}s` : ""}${cam.mode === "sheet" ? " (sheet)" : ""}`;
      if (cam.snapshot) {
        const src = projectFileUrl(projectId, cam.snapshot);
        return cam.snapshotKind === "image" || cam.mode === "sheet"
          ? { kind: "snapshot-sheet", label, src, snapshot: cam.snapshot, legacyCut: cam.cut }
          : { kind: "snapshot-video", label, src, snapshot: cam.snapshot, legacyCut: cam.cut };
      }
      return { kind: "live-blockout", label, pick: { cut: cam.cut, shots: cam.shots, mode: cam.mode }, legacyCut: cam.cut };
    }
    if ("asset" in cam) {
      const srcAsset = doc?.assets.find((x) => x.id === cam.asset);
      return {
        kind: "clip",
        label: `Camera of ${srcAsset?.label ?? cam.asset}`,
        assetId: cam.asset,
        from: cam.from ?? 0,
        to: cam.to,
        role: "camera",
      };
    }
  }
  if (params.drive?.asset) {
    const srcAsset = doc?.assets.find((x) => x.id === params.drive!.asset);
    return {
      kind: "clip",
      label: `Moves like ${srcAsset?.label ?? params.drive.asset}`,
      assetId: params.drive.asset,
      from: params.drive.from ?? 0,
      to: params.drive.to,
      role: "drive",
    };
  }
  if (asset.version?.of) {
    const srcAsset = doc?.assets.find((x) => x.id === asset.version!.of);
    return {
      kind: "clip",
      label: `Original · ${srcAsset?.label ?? asset.version.of}`,
      assetId: asset.version.of,
      from: asset.version.from,
      to: asset.duration ? asset.version.from + asset.duration : undefined,
      role: "version",
    };
  }
  return undefined;
}

export type CompareMode = "take" | "side" | "wipe";

/**
 * Renders a take alone, side-by-side beside its guide, or stacked in a draggable Wipe comparator,
 * with synchronized Play Both & seek/pause support for HTML videos and live Remotion blockouts.
 */
export function GuideCompare({
  asset,
  guide,
  aspect,
  defaultMode = "side",
  onEnlarge,
}: {
  asset: Asset;
  guide?: AssetGuide;
  aspect: string;
  defaultMode?: CompareMode;
  onEnlarge?: () => void;
}) {
  const projectId = useStore((s) => s.projectId)!;
  const canWipe = !!guide && asset.kind === "video" && guide.kind !== "snapshot-sheet";
  const [mode, setMode] = useState<CompareMode>(guide ? defaultMode : "take");
  const takeVideo = useRef<HTMLVideoElement>(null);
  const guideVideo = useRef<HTMLVideoElement>(null);
  const liveBlockout = useRef<BlockoutHandle>(null);

  // Reset to a sensible mode when switching between assets that have or lack a guide.
  useEffect(() => {
    if (!guide) setMode("take");
    else if (mode === "wipe" && !canWipe) setMode("side");
    else if (mode === "take" && defaultMode !== "take") setMode(defaultMode);
  }, [asset.id, guide?.kind, guide?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  const clipFrom = guide?.kind === "clip" ? guide.from : 0;
  const clipTo = guide?.kind === "clip" ? guide.to : undefined;

  // Keep clipped guide video looped within its [from, to] stretch.
  const onGuideTimeUpdate = () => {
    const v = guideVideo.current;
    if (!v || guide?.kind !== "clip") return;
    if (clipTo !== undefined && v.currentTime >= clipTo - 0.04) {
      v.currentTime = clipFrom;
      if (!v.paused) void v.play();
    }
  };

  const playBoth = () => {
    const tv = takeVideo.current;
    if (tv) {
      tv.currentTime = 0;
      void tv.play();
    }
    const gv = guideVideo.current;
    if (gv) {
      gv.currentTime = clipFrom;
      void gv.play();
    }
    liveBlockout.current?.restart();
  };

  const syncPause = () => {
    guideVideo.current?.pause();
    liveBlockout.current?.pause();
  };

  const syncSeek = () => {
    const tv = takeVideo.current;
    const gv = guideVideo.current;
    if (tv && gv) {
      const target = clipFrom + tv.currentTime;
      gv.currentTime = clipTo !== undefined ? Math.min(clipTo, target) : target;
    }
  };

  const stageAspect = asset.width && asset.height ? `${asset.width} / ${asset.height}` : aspect;

  const takeMedia =
    asset.kind === "video" ? (
      <video
        ref={takeVideo}
        key={asset.id}
        src={proxyUrl(projectId, asset.id)}
        poster={posterUrl(projectId, asset.id)}
        controls
        loop
        playsInline
        onPause={syncPause}
        onSeeked={syncSeek}
      />
    ) : (
      <img key={asset.id} src={imageUrl(projectId, asset.id)} alt="" onClick={onEnlarge} onError={hideBroken} />
    );

  const guideMedia = !guide ? null : guide.kind === "snapshot-video" ? (
    <video ref={guideVideo} key={guide.src} src={guide.src} controls muted loop playsInline />
  ) : guide.kind === "snapshot-sheet" ? (
    <img key={guide.src} src={guide.src} alt={guide.label} onError={hideBroken} />
  ) : guide.kind === "live-blockout" ? (
    <BlockoutPlayer ref={liveBlockout} pick={guide.pick} aspect={stageAspect.replace(/\s+/g, "").replace("/", ":")} />
  ) : (
    <video
      ref={guideVideo}
      key={`${guide.assetId}:${clipFrom}`}
      src={proxyUrl(projectId, guide.assetId)}
      poster={posterUrl(projectId, guide.assetId)}
      controls
      muted
      playsInline
      onLoadedMetadata={(e) => {
        if (clipFrom > 0) e.currentTarget.currentTime = clipFrom;
      }}
      onTimeUpdate={onGuideTimeUpdate}
    />
  );

  const showingGuide = !!guide && mode !== "take";

  return (
    <div className="guide-compare">
      {showingGuide && mode === "wipe" && canWipe ? (
        <WipeFrame aspect={stageAspect} baseLabel={guide.label} base={guideMedia} top={takeMedia} />
      ) : (
        <div className={`stage-pair ${showingGuide ? "two" : ""}`}>
          <div className="stage" style={{ aspectRatio: stageAspect }}>
            {showingGuide && <span className="stage-tag">Take</span>}
            {takeMedia}
          </div>
          {showingGuide && (
            <div className="stage blockout" style={{ aspectRatio: stageAspect }}>
              {guideMedia}
              <span className="stage-tag">{guide.label}</span>
            </div>
          )}
        </div>
      )}
      {guide && (
        <div className="guide-compare-bar">
          <span className="dim small">{guide.label}</span>
          <span className="spacer" />
          <div className="segmented" role="group" aria-label="Compare with guide">
            <button className={mode === "take" ? "on" : ""} onClick={() => setMode("take")} title="Show only the take">
              Take
            </button>
            <button className={mode === "side" ? "on" : ""} onClick={() => setMode("side")} title="Show the take and its guide side by side">
              Side by side
            </button>
            {canWipe && (
              <button className={mode === "wipe" ? "on" : ""} onClick={() => setMode("wipe")} title="Drag a divider across the take and its guide">
                Wipe
              </button>
            )}
          </div>
          {showingGuide && asset.kind === "video" && guide.kind !== "snapshot-sheet" && (
            <button onClick={playBoth} title="Play the take and its guide from their starts together">
              Play both
            </button>
          )}
        </div>
      )}
    </div>
  );
}
