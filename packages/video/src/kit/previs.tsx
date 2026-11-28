/**
 * Ready-made 3D camera blockout scene (`kit:Previs`): coarse matte-grey set geometry, height-accurate striped stand-in
 * pills (with eye-direction dots and zero limbs) and deterministic camera moves from `@beatsheet/schema`.
 *
 * Works both as a video reference blockout (Seedance 2.5) and as a 16-frame storyboard contact sheet (`mode: "sheet"`).
 * Supports five visual styles (`look`): pills, sketch, ink, ghosts and empty (camera-only).
 */
import { PREVIS_BY_ID, type PrevisLook, type PrevisSet, type PrevisSpeedRamp, type PrevisSubject } from "@beatsheet/schema";
import { AbsoluteFill } from "remotion";
import { ThreeCanvas } from "./media.tsx";
import { populatePrevisScene, posePrevisScene, previsPaletteFor } from "./previsScene.ts";
import { useScene } from "./scene.tsx";

export type PrevisProps = {
  /** Camera move preset id from PREVIS_MOVES (e.g. "orbit", "dolly-zoom", "bullet-time", "crane-up"). Default "push-in". */
  move?: string;
  /** Visual look: pills (default), sketch, ink, ghosts, or empty (camera only). */
  look?: PrevisLook;
  /** Coarse grey set layout: studio, street, room, alley, corridor, clearing. */
  set?: PrevisSet;
  /** Stand-in figures or props; defaults to the preset's subjects. Pass [] or set cameraOnly: true for no figures. */
  subjects?: PrevisSubject[];
  /** Omit stand-ins so only the camera move and set geometry show. */
  cameraOnly?: boolean;
  /** 35mm-equivalent focal length in mm (e.g. 24, 35, 50, 85). */
  lens?: number;
  /** Multiplier on default camera distance (1 = preset default). */
  distance?: number;
  /** Height offset in metres added to camera height. */
  height?: number;
  /** Azimuth rotation around the scene, in degrees. */
  angle?: number;
  /** Mid-shot speed dip or surge (e.g. { at: 0.5, slow: 0.2 } for bullet-time). */
  speedRamp?: PrevisSpeedRamp;
  /** Optional minimal corner label (off by default so generative models never copy text). */
  hud?: boolean;
};

export function Previs(props: PrevisProps) {
  const s = useScene();
  const preset = PREVIS_BY_ID.get(props.move ?? "push-in") ?? PREVIS_BY_ID.get("push-in")!;
  const look: PrevisLook = props.look ?? (props.cameraOnly ? "empty" : "pills");
  const set: PrevisSet = props.set ?? preset.defaultSet;
  const subjects: PrevisSubject[] = props.cameraOnly || look === "empty" ? [] : (props.subjects ?? preset.defaultSubjects);
  const pal = previsPaletteFor(look);
  const dur = Math.max(0.05, s.duration);
  const u = Math.min(1, Math.max(0, s.t / dur));
  const moveKey = JSON.stringify([preset.id, look, set, subjects]);

  return (
    <AbsoluteFill>
      <ThreeCanvas
        key={moveKey}
        background={pal.bg}
        setup={(ctx) => populatePrevisScene(ctx.THREE, ctx.scene, { set, look, subjects })}
        draw={(rig, t, ctx) => {
          posePrevisScene(ctx.camera, rig.nodes, preset.id, t / dur, {
            lens: props.lens,
            distance: props.distance,
            height: props.height,
            angle: props.angle,
            speedRamp: props.speedRamp,
          });
        }}
      />
      {props.hud && (
        <div
          style={{
            position: "absolute",
            left: 24 * s.u,
            top: 20 * s.u,
            background: "rgba(15,15,18,0.68)",
            color: "#f2f2f5",
            fontFamily: "SF Mono, Menlo, monospace",
            fontSize: 20 * s.u,
            padding: `${6 * s.u}px ${12 * s.u}px`,
            borderRadius: 6 * s.u,
          }}
        >
          {preset.label} · {Math.round(u * 100)}%
        </div>
      )}
    </AbsoluteFill>
  );
}
