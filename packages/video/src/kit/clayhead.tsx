/**
 * Identity-stripped matte-grey 3D clay head driven by 52 ARKit blendshapes + 3D head pose (`kit:ClayHead`).
 * 100% procedural Three.js geometry (MIT/commercial-safe, zero FLAME/SPECTRE research weights).
 *
 * Used by Facial Performance Transfer (`perform.ts`): renders a crisp 3-point-lit neutral clay mask MP4 that strips
 * the actor's skin, hair, glasses and background while preserving micro-expressions, eye gaze, blinks, brow tension,
 * lip articulation and head motion for Seedance 2.5's reference-video route.
 */
import { EMOTION_PRESETS, faceFrameAt, type ArkitBlendshape, type FaceFrame, type FacePerformanceTrack } from "@beatsheet/schema";
import { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, getRemotionEnvironment } from "remotion";
import { ThreeCanvas, type ThreeContext } from "./media.tsx";
import { useScene } from "./scene.tsx";

export type ClayHeadProps = {
  /** Inline 52-blendshape ARKit performance track. */
  track?: FacePerformanceTrack;
  /** Or a project-relative JSON file holding a FacePerformanceTrack (e.g. "media/a1.face.json"). */
  trackFile?: string;
  /** Built-in static emotion preset (neutral, joy, surprise, anger, sadness, skeptical, smirk, focus) when no track is given. */
  preset?: string;
  /** Scale blendshape & head-motion intensity (default 1.0; e.g. 1.2 for stronger read). */
  intensity?: number;
  /** Temporal smoothing window in seconds (default 0.05). */
  smooth?: number;
  /** Matte clay albedo hex (default "#b9bcc2"). */
  clayColor?: string;
  /** Neutral studio backdrop hex (default "#454952"). */
  bgColor?: string;
};

type ClayRig = {
  headPivot: import("three").Group;
  jawPivot: import("three").Group;
  leftEyeBall: import("three").Group;
  rightEyeBall: import("three").Group;
  leftUpperLid: import("three").Mesh;
  rightUpperLid: import("three").Mesh;
  leftLowerLid: import("three").Mesh;
  rightLowerLid: import("three").Mesh;
  leftBrowInner: import("three").Mesh;
  leftBrowOuter: import("three").Mesh;
  rightBrowInner: import("three").Mesh;
  rightBrowOuter: import("three").Mesh;
  leftCheek: import("three").Mesh;
  rightCheek: import("three").Mesh;
  noseBridge: import("three").Group;
  upperLipCenter: import("three").Mesh;
  upperLipLeft: import("three").Mesh;
  upperLipRight: import("three").Mesh;
  lowerLipCenter: import("three").Mesh;
  lowerLipLeft: import("three").Mesh;
  lowerLipRight: import("three").Mesh;
  mouthCornerLeft: import("three").Mesh;
  mouthCornerRight: import("three").Mesh;
  mouthCavity: import("three").Mesh;
};

function buildClayRig(THREE: typeof import("three"), clayColor: string): { root: import("three").Group; rig: ClayRig } {
  const root = new THREE.Group();
  const clay = new THREE.MeshStandardMaterial({ color: clayColor, roughness: 0.72, metalness: 0.03 });
  const clayDark = new THREE.MeshStandardMaterial({ color: "#8e929b", roughness: 0.8, metalness: 0.02 });
  const clayLip = new THREE.MeshStandardMaterial({ color: "#a5a8b0", roughness: 0.62, metalness: 0.04 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#dcdfe5", roughness: 0.25, metalness: 0.05 });
  const irisMat = new THREE.MeshStandardMaterial({ color: "#4e535d", roughness: 0.2, metalness: 0.08 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: "#1c1f25", roughness: 0.1, metalness: 0.1 });
  const cavityMat = new THREE.MeshStandardMaterial({ color: "#2d3038", roughness: 0.95, metalness: 0 });
  const teethMat = new THREE.MeshStandardMaterial({ color: "#cfd3da", roughness: 0.45, metalness: 0.02 });

  // Fixed neutral shoulders & neck bust base so head rotation reads cleanly.
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.92, 32, 24), clay);
  shoulders.scale.set(1.15, 0.58, 0.65);
  shoulders.position.set(0, -1.28, -0.05);
  root.add(shoulders);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.72, 24), clay);
  neck.position.set(0, -0.78, -0.04);
  root.add(neck);

  // Articulated head pivot at top of cervical spine.
  const headPivot = new THREE.Group();
  headPivot.position.set(0, -0.45, 0);
  root.add(headPivot);

  const head = new THREE.Group();
  head.position.set(0, 0.58, 0.04);
  headPivot.add(head);

  // Sculpted cranium + zygomatic face oval.
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.68, 40, 32), clay);
  cranium.scale.set(0.86, 1.06, 0.96);
  cranium.position.set(0, 0.14, -0.05);
  head.add(cranium);

  const midFace = new THREE.Mesh(new THREE.SphereGeometry(0.56, 36, 28), clay);
  midFace.scale.set(0.92, 0.98, 0.88);
  midFace.position.set(0, -0.08, 0.12);
  head.add(midFace);

  // Subtle sculpted ears (help read head yaw unmistakably).
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 14), clay);
    ear.scale.set(0.45, 1.35, 0.75);
    ear.position.set(side * 0.58, 0.02, -0.04);
    ear.rotation.y = side * 0.25;
    head.add(ear);
  }

  // Cheeks (articulated for smile squint and cheek puff).
  const makeCheek = (side: -1 | 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), clay);
    m.scale.set(1.1, 0.9, 0.72);
    m.position.set(side * 0.28, -0.1, 0.43);
    head.add(m);
    return m;
  };
  const leftCheek = makeCheek(-1);
  const rightCheek = makeCheek(1);

  // Sculpted nose bridge + tip + nostrils (responds to sneer).
  const noseBridge = new THREE.Group();
  noseBridge.position.set(0, 0.03, 0.56);
  head.add(noseBridge);
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.34, 16), clay);
  bridge.position.set(0, 0.02, 0.02);
  bridge.rotation.x = -0.22;
  noseBridge.add(bridge);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 16), clay);
  tip.scale.set(1.08, 0.86, 1.0);
  tip.position.set(0, -0.14, 0.08);
  noseBridge.add(tip);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 12), clay);
    wing.position.set(side * 0.085, -0.16, 0.04);
    noseBridge.add(wing);
  }

  // Eye sockets, articulated eyeballs + upper/lower clay eyelids.
  const makeEye = (side: -1 | 1) => {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), clayDark);
    socket.scale.set(1.18, 0.82, 0.55);
    socket.position.set(side * 0.22, 0.14, 0.49);
    head.add(socket);

    const ball = new THREE.Group();
    ball.position.set(side * 0.22, 0.14, 0.51);
    head.add(ball);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), eyeMat);
    ball.add(sclera);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.052, 20), irisMat);
    iris.position.set(0, 0, 0.105);
    ball.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), pupilMat);
    pupil.position.set(0, 0, 0.107);
    ball.add(pupil);

    const upperLid = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), clay);
    upperLid.position.set(side * 0.22, 0.14, 0.515);
    upperLid.rotation.x = -0.58;
    head.add(upperLid);

    const lowerLid = new THREE.Mesh(new THREE.SphereGeometry(0.116, 20, 14, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.52), clay);
    lowerLid.position.set(side * 0.22, 0.14, 0.515);
    lowerLid.rotation.x = 0.48;
    head.add(lowerLid);

    return { ball, upperLid, lowerLid };
  };
  const leftEye = makeEye(-1);
  const rightEye = makeEye(1);

  // Articulated 2-segment clay eyebrow ridges (inner + outer per side).
  const makeBrow = (side: -1 | 1) => {
    const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.11, 8, 12), clayDark);
    inner.rotation.z = Math.PI / 2 - side * 0.08;
    inner.position.set(side * 0.14, 0.29, 0.56);
    head.add(inner);

    const outer = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.11, 8, 12), clayDark);
    outer.rotation.z = Math.PI / 2 + side * 0.18;
    outer.position.set(side * 0.29, 0.28, 0.52);
    head.add(outer);
    return { inner, outer };
  };
  const leftBrow = makeBrow(-1);
  const rightBrow = makeBrow(1);

  // Articulated lower jaw + chin pivot.
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.14, 0.12);
  head.add(jawPivot);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.42, 30, 24), clay);
  jaw.scale.set(0.88, 0.92, 0.94);
  jaw.position.set(0, -0.25, 0.08);
  jawPivot.add(jaw);

  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.18, 22, 16), clay);
  chin.scale.set(1.05, 0.85, 0.92);
  chin.position.set(0, -0.44, 0.34);
  jawPivot.add(chin);

  // Recessed oral cavity + subtle upper/lower clay teeth arches so jawOpen & visemes read crisply.
  const mouthCavity = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), cavityMat);
  mouthCavity.scale.set(1.22, 0.55, 0.6);
  mouthCavity.position.set(0, -0.34, 0.45);
  head.add(mouthCavity);

  const upperTeeth = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.045, 16, 1, true, -0.9, 1.8), teethMat);
  upperTeeth.position.set(0, -0.31, 0.42);
  head.add(upperTeeth);

  // Articulated multi-segment clay lips (upper center/L/R, lower center/L/R, corners L/R).
  const lipSeg = (r: number, len: number) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 12), clayLip);
  const upperLipCenter = lipSeg(0.036, 0.09);
  upperLipCenter.rotation.z = Math.PI / 2;
  upperLipCenter.position.set(0, -0.31, 0.555);
  head.add(upperLipCenter);

  const upperLipLeft = lipSeg(0.031, 0.09);
  upperLipLeft.rotation.z = Math.PI / 2 + 0.14;
  upperLipLeft.position.set(-0.1, -0.322, 0.535);
  head.add(upperLipLeft);

  const upperLipRight = lipSeg(0.031, 0.09);
  upperLipRight.rotation.z = Math.PI / 2 - 0.14;
  upperLipRight.position.set(0.1, -0.322, 0.535);
  head.add(upperLipRight);

  const lowerLipCenter = lipSeg(0.04, 0.1);
  lowerLipCenter.rotation.z = Math.PI / 2;
  lowerLipCenter.position.set(0, -0.368, 0.55);
  head.add(lowerLipCenter);

  const lowerLipLeft = lipSeg(0.032, 0.085);
  lowerLipLeft.rotation.z = Math.PI / 2 - 0.14;
  lowerLipLeft.position.set(-0.1, -0.358, 0.53);
  head.add(lowerLipLeft);

  const lowerLipRight = lipSeg(0.032, 0.085);
  lowerLipRight.rotation.z = Math.PI / 2 + 0.14;
  lowerLipRight.position.set(0.1, -0.358, 0.53);
  head.add(lowerLipRight);

  const mouthCornerLeft = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), clayLip);
  mouthCornerLeft.position.set(-0.175, -0.34, 0.495);
  head.add(mouthCornerLeft);

  const mouthCornerRight = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), clayLip);
  mouthCornerRight.position.set(0.175, -0.34, 0.495);
  head.add(mouthCornerRight);

  return {
    root,
    rig: {
      headPivot,
      jawPivot,
      leftEyeBall: leftEye.ball,
      rightEyeBall: rightEye.ball,
      leftUpperLid: leftEye.upperLid,
      rightUpperLid: rightEye.upperLid,
      leftLowerLid: leftEye.lowerLid,
      rightLowerLid: rightEye.lowerLid,
      leftBrowInner: leftBrow.inner,
      leftBrowOuter: leftBrow.outer,
      rightBrowInner: rightBrow.inner,
      rightBrowOuter: rightBrow.outer,
      leftCheek,
      rightCheek,
      noseBridge,
      upperLipCenter,
      upperLipLeft,
      upperLipRight,
      lowerLipCenter,
      lowerLipLeft,
      lowerLipRight,
      mouthCornerLeft,
      mouthCornerRight,
      mouthCavity,
    },
  };
}

/** Applies one `FaceFrame` (3D head pose + 52 ARKit blendshapes) to the Three.js clay rig. */
function applyFaceFrame(rig: ClayRig, frame: FaceFrame) {
  const s = (name: ArkitBlendshape) => frame.shapes[name] ?? 0;

  // 1. Head orientation & subtle translation.
  rig.headPivot.rotation.set(
    Math.max(-0.55, Math.min(0.55, frame.pose.pitch)),
    Math.max(-0.75, Math.min(0.75, frame.pose.yaw)),
    Math.max(-0.45, Math.min(0.45, frame.pose.roll)),
    "YXZ",
  );
  rig.headPivot.position.set(
    Math.max(-0.25, Math.min(0.25, (frame.pose.tx ?? 0) * 0.4)),
    -0.45 + Math.max(-0.15, Math.min(0.15, (frame.pose.ty ?? 0) * 0.3)),
    Math.max(-0.2, Math.min(0.2, (frame.pose.tz ?? 0) * 0.25)),
  );

  // 2. Eyeballs (gaze direction).
  const lookYawL = (s("eyeLookInLeft") - s("eyeLookOutLeft")) * 0.42;
  const lookYawR = (s("eyeLookOutRight") - s("eyeLookInRight")) * 0.42;
  const lookPitchL = (s("eyeLookDownLeft") - s("eyeLookUpLeft")) * 0.35;
  const lookPitchR = (s("eyeLookDownRight") - s("eyeLookUpRight")) * 0.35;
  rig.leftEyeBall.rotation.set(lookPitchL, lookYawL, 0);
  rig.rightEyeBall.rotation.set(lookPitchR, lookYawR, 0);

  // 3. Eyelids (blink, wide, squint).
  rig.leftUpperLid.rotation.x = -0.58 + s("eyeBlinkLeft") * 1.12 - s("eyeWideLeft") * 0.28 + s("eyeSquintLeft") * 0.22;
  rig.rightUpperLid.rotation.x = -0.58 + s("eyeBlinkRight") * 1.12 - s("eyeWideRight") * 0.28 + s("eyeSquintRight") * 0.22;
  rig.leftLowerLid.rotation.x = 0.48 - s("eyeSquintLeft") * 0.28 - s("eyeBlinkLeft") * 0.16;
  rig.rightLowerLid.rotation.x = 0.48 - s("eyeSquintRight") * 0.28 - s("eyeBlinkRight") * 0.16;

  // 4. Eyebrows (innerUp, outerUp, browDown).
  const innerUp = s("browInnerUp");
  const downL = s("browDownLeft");
  const downR = s("browDownRight");
  const outL = s("browOuterUpLeft");
  const outR = s("browOuterUpRight");
  rig.leftBrowInner.position.y = 0.29 + innerUp * 0.075 - downL * 0.065;
  rig.leftBrowInner.rotation.z = Math.PI / 2 + 0.08 - innerUp * 0.26 + downL * 0.28;
  rig.leftBrowOuter.position.y = 0.28 + outL * 0.075 - downL * 0.04;
  rig.leftBrowOuter.rotation.z = Math.PI / 2 - 0.18 + outL * 0.16 - downL * 0.12;

  rig.rightBrowInner.position.y = 0.29 + innerUp * 0.075 - downR * 0.065;
  rig.rightBrowInner.rotation.z = Math.PI / 2 - 0.08 + innerUp * 0.26 - downR * 0.28;
  rig.rightBrowOuter.position.y = 0.28 + outR * 0.075 - downR * 0.04;
  rig.rightBrowOuter.rotation.z = Math.PI / 2 + 0.18 - outR * 0.16 + downR * 0.12;

  // 5. Cheeks & nose sneer.
  const puff = s("cheekPuff");
  const sqL = s("cheekSquintLeft");
  const sqR = s("cheekSquintRight");
  rig.leftCheek.scale.set(1.1 + puff * 0.28 + sqL * 0.08, 0.9 + puff * 0.18, 0.72 + puff * 0.35 + sqL * 0.12);
  rig.leftCheek.position.y = -0.1 + sqL * 0.05;
  rig.rightCheek.scale.set(1.1 + puff * 0.28 + sqR * 0.08, 0.9 + puff * 0.18, 0.72 + puff * 0.35 + sqR * 0.12);
  rig.rightCheek.position.y = -0.1 + sqR * 0.05;

  const sneer = (s("noseSneerLeft") + s("noseSneerRight")) * 0.5;
  rig.noseBridge.position.y = 0.03 + sneer * 0.035;
  rig.noseBridge.rotation.z = (s("noseSneerLeft") - s("noseSneerRight")) * 0.08;

  // 6. Jaw & articulated lips.
  const jawOpen = Math.max(0, s("jawOpen") - s("mouthClose") * 0.6);
  const jawShiftX = (s("jawRight") - s("jawLeft")) * 0.06;
  rig.jawPivot.rotation.x = jawOpen * 0.42;
  rig.jawPivot.position.x = jawShiftX;
  rig.jawPivot.position.z = 0.12 + s("jawForward") * 0.05;

  const pucker = s("mouthPucker");
  const funnel = s("mouthFunnel");
  const smileL = s("mouthSmileLeft");
  const smileR = s("mouthSmileRight");
  const frownL = s("mouthFrownLeft");
  const frownR = s("mouthFrownRight");
  const stretchL = s("mouthStretchLeft");
  const stretchR = s("mouthStretchRight");
  const press = (s("mouthPressLeft") + s("mouthPressRight")) * 0.5;
  const mouthX = (s("mouthRight") - s("mouthLeft")) * 0.06;
  const upperLift = (s("mouthUpperUpLeft") + s("mouthUpperUpRight")) * 0.035 + s("mouthShrugUpper") * 0.025;
  const lowerDrop = jawOpen * 0.15 + (s("mouthLowerDownLeft") + s("mouthLowerDownRight")) * 0.035 - s("mouthShrugLower") * 0.02;
  const narrow = 1 - pucker * 0.38 - funnel * 0.22 + (smileL + smileR + stretchL + stretchR) * 0.09;
  const protrude = (pucker + funnel) * 0.065;

  rig.upperLipCenter.position.set(mouthX, -0.31 + upperLift - press * 0.014, 0.555 + protrude - s("mouthRollUpper") * 0.025);
  rig.upperLipCenter.scale.set(1, narrow, 1 - press * 0.25);

  rig.upperLipLeft.position.set(mouthX - 0.1 * narrow, -0.322 + upperLift * 0.6 + smileL * 0.02 - frownL * 0.02, 0.535 + protrude * 0.7);
  rig.upperLipRight.position.set(mouthX + 0.1 * narrow, -0.322 + upperLift * 0.6 + smileR * 0.02 - frownR * 0.02, 0.535 + protrude * 0.7);

  rig.lowerLipCenter.position.set(mouthX + jawShiftX * 0.5, -0.368 - lowerDrop + press * 0.015, 0.55 + protrude - s("mouthRollLower") * 0.025);
  rig.lowerLipCenter.scale.set(1, narrow, 1 - press * 0.25);

  rig.lowerLipLeft.position.set(mouthX - 0.1 * narrow, -0.358 - lowerDrop * 0.75 + smileL * 0.02 - frownL * 0.02, 0.53 + protrude * 0.7);
  rig.lowerLipRight.position.set(mouthX + 0.1 * narrow, -0.358 - lowerDrop * 0.75 + smileR * 0.02 - frownR * 0.02, 0.53 + protrude * 0.7);

  rig.mouthCornerLeft.position.set(
    mouthX - (0.175 + smileL * 0.045 + stretchL * 0.04 - pucker * 0.06 - funnel * 0.03),
    -0.34 + smileL * 0.055 - frownL * 0.055 - jawOpen * 0.035,
    0.495 - smileL * 0.03 + protrude * 0.5,
  );
  rig.mouthCornerRight.position.set(
    mouthX + (0.175 + smileR * 0.045 + stretchR * 0.04 - pucker * 0.06 - funnel * 0.03),
    -0.34 + smileR * 0.055 - frownR * 0.055 - jawOpen * 0.035,
    0.495 - smileR * 0.03 + protrude * 0.5,
  );

  // Dark mouth opening expands cleanly behind the parted lips.
  rig.mouthCavity.position.set(mouthX, -0.335 - lowerDrop * 0.45, 0.46);
  rig.mouthCavity.scale.set(Math.max(0.45, 1.15 * narrow), Math.max(0.08, 0.18 + jawOpen * 0.95 + funnel * 0.3), 0.6);
}

/** Ready-made `kit:ClayHead` component: renders a deterministic 3D clay head driven by ARKit blendshapes. */
export function ClayHead(props: ClayHeadProps) {
  const s = useScene();
  const [loaded, setLoaded] = useState<FacePerformanceTrack | undefined>(props.track);
  const [handle] = useState(() => (!props.track && props.trackFile && getRemotionEnvironment().isRendering ? delayRender("Loading face performance track") : null));

  useEffect(() => {
    if (props.track) {
      setLoaded(props.track);
      if (handle !== null) continueRender(handle);
      return;
    }
    if (!props.trackFile) {
      if (handle !== null) continueRender(handle);
      return;
    }
    let live = true;
    const url = props.trackFile.startsWith("http") || props.trackFile.startsWith("/") ? props.trackFile : s.file(props.trackFile);
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<FacePerformanceTrack>) : undefined))
      .then((data) => {
        if (live && data) setLoaded(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (handle !== null) continueRender(handle);
      });
    return () => {
      live = false;
    };
  }, [props.track, props.trackFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const track: FacePerformanceTrack = useMemo(() => {
    if (loaded) return loaded;
    const preset = EMOTION_PRESETS[props.preset ?? "neutral"] ?? EMOTION_PRESETS.neutral!;
    return {
      version: 1,
      fps: 30,
      duration: Math.max(1, s.duration),
      frames: [{ t: 0, pose: preset.pose, shapes: preset.shapes }],
    };
  }, [loaded, props.preset, s.duration]);

  const clayColor = props.clayColor ?? "#b9bcc2";
  const bgColor = props.bgColor ?? "#454952";
  const intensity = props.intensity ?? 1;
  const smooth = props.smooth ?? 0.05;

  const setup = ({ THREE, scene, camera }: ThreeContext) => {
    scene.background = new THREE.Color(bgColor);
    camera.fov = 34;
    camera.position.set(0, 0.16, 3.15);
    camera.lookAt(0, 0.05, 0);
    camera.updateProjectionMatrix();

    // Clean 3-point soft studio lighting so clay creases, eyelids and lips read unmistakably.
    const hemi = new THREE.HemisphereLight(0xf3f5fa, 0x3b404c, 0.72);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfffaf2, 1.35);
    key.position.set(2.2, 2.6, 3.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6e2f5, 0.58);
    fill.position.set(-2.5, 0.9, 2.0);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xeef4ff, 0.65);
    rim.position.set(0.2, 2.2, -2.8);
    scene.add(rim);

    const { root, rig } = buildClayRig(THREE, clayColor);
    scene.add(root);
    return { rig };
  };

  const draw = (state: { rig: ClayRig }, t: number) => {
    const frame = faceFrameAt(track, t, { smoothWindow: smooth, intensity });
    applyFaceFrame(state.rig, frame);
  };

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <ThreeCanvas setup={setup} draw={draw} />
    </AbsoluteFill>
  );
}
