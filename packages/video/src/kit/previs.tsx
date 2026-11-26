/**
 * Ready-made 3D camera blockout scene (`kit:Previs`): coarse matte-grey set geometry, height-accurate striped stand-in
 * pills (with eye-direction dots and zero limbs) and deterministic camera moves from `@beatsheet/schema`.
 *
 * Works both as a video reference blockout (Seedance 2.5) and as a 16-frame storyboard contact sheet (`mode: "sheet"`).
 * Supports five visual styles (`look`): pills, sketch, ink, ghosts and empty (camera-only).
 */
import {
  PREVIS_BY_ID,
  previsCameraAt,
  previsSubjectAt,
  rampProgress,
  type PrevisLook,
  type PrevisSet,
  type PrevisSpeedRamp,
  type PrevisSubject,
} from "@beatsheet/schema";
import { AbsoluteFill } from "remotion";
import { ThreeCanvas, type ThreeContext } from "./media.tsx";
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

/** Procedural bold diagonal stripe texture on a canvas so stand-ins carry colour and depth without looking human. */
function stripeTexture(THREE: typeof import("three"), hex: string, inkOnly = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d")!;
  g.fillStyle = inkOnly ? "#ffffff" : hex;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = inkOnly ? "#1a1a1a" : "#151518";
  g.lineWidth = inkOnly ? 8 : 28;
  for (let i = -256; i < 512; i += 56) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 256, 256);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Palette for each visual look. */
function paletteFor(look: PrevisLook) {
  switch (look) {
    case "sketch":
      return { bg: "#f4f1ea", floor: "#e6e1d6", grid1: "#b8b0a0", grid2: "#d2cbbd", wall: "#dcd6ca", edge: "#2a2620" };
    case "ink":
      return { bg: "#ffffff", floor: "#f8f8f8", grid1: "#1a1a1a", grid2: "#bbbbbb", wall: "#ffffff", edge: "#111111" };
    case "ghosts":
      return { bg: "#1c1e24", floor: "#262932", grid1: "#494f5e", grid2: "#343946", wall: "#2f333f", edge: "#8d96aa" };
    case "empty":
    case "pills":
    default:
      return { bg: "#8e9299", floor: "#72767d", grid1: "#4a4e54", grid2: "#5d6169", wall: "#83878f", edge: "#52565e" };
  }
}

/** Builds simple matte-grey architectural volumes so camera parallax and framing read unmistakably. */
function buildSet(ctx: ThreeContext, set: PrevisSet, look: PrevisLook) {
  const { THREE, scene } = ctx;
  const pal = paletteFor(look);
  const group = new THREE.Group();
  const wire = look === "sketch" || look === "ink";
  const wallMat = new THREE.MeshStandardMaterial({
    color: pal.wall,
    roughness: 0.92,
    metalness: 0.04,
    ...(wire ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : {}),
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: pal.edge, transparent: true, opacity: wire ? 0.85 : 0.22 });

  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    edges.position.copy(mesh.position);
    group.add(edges);
  };

  // Ground plane and metre grid.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  const grid = new THREE.GridHelper(32, 32, pal.grid1, pal.grid2);
  grid.position.y = 0.004;
  group.add(grid);

  if (set === "room") {
    addBox(10, 3.6, 0.25, 0, 1.8, -4.5);
    addBox(0.25, 3.6, 10, -5, 1.8, 0.5);
    addBox(0.25, 3.6, 10, 5, 1.8, 0.5);
    // Reference table/window framing cue on back wall.
    addBox(2.2, 0.78, 0.9, -2.2, 0.39, -3.5);
    addBox(1.8, 1.4, 0.3, 1.6, 1.9, -4.32);
  } else if (set === "street") {
    for (let z = -10; z <= 8; z += 4.5) {
      addBox(2.8, 5.5 + ((Math.abs(z) * 1.7) % 3), 3.4, -5.8, 2.75, z);
      addBox(2.8, 4.8 + ((Math.abs(z + 2) * 2.1) % 3.5), 3.4, 5.8, 2.4, z + 1);
    }
    // Kerb curbs along road.
    addBox(0.4, 0.16, 26, -3.4, 0.08, 0);
    addBox(0.4, 0.16, 26, 3.4, 0.08, 0);
  } else if (set === "alley") {
    addBox(1.8, 6.2, 18, -3.1, 3.1, -1);
    addBox(1.8, 6.2, 18, 3.1, 3.1, -1);
    addBox(6.4, 5.0, 0.5, 0, 2.5, -10.5);
    addBox(0.9, 1.1, 1.3, -1.7, 0.55, -2.8);
    addBox(0.7, 0.85, 0.7, 1.65, 0.425, 1.2);
  } else if (set === "corridor") {
    addBox(0.3, 3.2, 22, -2.0, 1.6, -2);
    addBox(0.3, 3.2, 22, 2.0, 1.6, -2);
    // Overhead ribs + foreground wipe pillar on left.
    for (let z = -10; z <= 6; z += 2.5) addBox(4.0, 0.25, 0.25, 0, 3.1, z);
    addBox(0.45, 3.2, 0.45, -1.35, 1.6, 1.9);
  } else if (set === "clearing") {
    // Ring of simple cylindrical trunks for outdoor parallax.
    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 5.2, 10);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 5.4 + (i % 3) * 1.4;
      const m = new THREE.Mesh(trunkGeo, wallMat);
      m.position.set(Math.cos(a) * r, 2.6, Math.sin(a) * r);
      group.add(m);
      if (wire) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(trunkGeo), edgeMat);
        e.position.copy(m.position);
        group.add(e);
      }
    }
  } else {
    // Studio plinth / cyclorama blocks for clean spatial reference.
    addBox(1.4, 0.08, 1.4, 0, 0.04, 0);
    addBox(12, 5, 0.2, 0, 2.5, -6.5);
  }

  scene.add(group);
}

/** Builds one striped stand-in capsule (person) or block (prop) with eye-direction dot. */
function buildStandIn(THREE: typeof import("three"), s: PrevisSubject, look: PrevisLook) {
  const group = new THREE.Group();
  const isProp = s.kind === "prop" || s.kind === "box";
  const h = s.height ?? (isProp ? 0.55 : 1.75);
  const color = s.color ?? "#e5484d";
  const wire = look === "sketch" || look === "ink";
  const ghost = look === "ghosts";

  const mat = ghost
    ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.42, roughness: 0.55 })
    : new THREE.MeshStandardMaterial({
        map: stripeTexture(THREE, color, look === "ink"),
        roughness: 0.72,
        metalness: 0.05,
        ...(wire ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : {}),
      });

  if (isProp) {
    const geo = new THREE.BoxGeometry(h * 0.9, h, h * 0.9);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = h / 2 + 0.08;
    group.add(mesh);
    if (wire) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: "#151518" }));
      e.position.copy(mesh.position);
      group.add(e);
    }
  } else {
    const r = Math.min(0.24, h * 0.13);
    const bodyLen = Math.max(0.2, h - r * 2);
    const geo = new THREE.CapsuleGeometry(r, bodyLen, 10, 20);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = h / 2;
    group.add(mesh);
    if (wire) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 22), new THREE.LineBasicMaterial({ color: "#1a1a1a" }));
      e.position.copy(mesh.position);
      group.add(e);
    }
    // White eye-direction dot at eye height on the front face (+Z before facing rotation).
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.24, 12, 12),
      new THREE.MeshBasicMaterial({ color: look === "ink" ? "#111111" : "#ffffff" }),
    );
    eye.position.set(0, h * 0.85, r * 0.92);
    group.add(eye);
  }

  group.rotation.y = ((s.facing ?? 0) * Math.PI) / 180;
  group.position.set(s.x ?? 0, 0, s.z ?? 0);
  return group;
}

export function Previs(props: PrevisProps) {
  const s = useScene();
  const preset = PREVIS_BY_ID.get(props.move ?? "push-in") ?? PREVIS_BY_ID.get("push-in")!;
  const look: PrevisLook = props.look ?? (props.cameraOnly ? "empty" : "pills");
  const set: PrevisSet = props.set ?? preset.defaultSet;
  const subjects: PrevisSubject[] = props.cameraOnly || look === "empty" ? [] : (props.subjects ?? preset.defaultSubjects);
  const pal = paletteFor(look);
  const dur = Math.max(0.05, s.duration);
  const u = Math.min(1, Math.max(0, s.t / dur));
  const moveKey = JSON.stringify([preset.id, look, set, subjects]);

  return (
    <AbsoluteFill>
      <ThreeCanvas
        key={moveKey}
        background={pal.bg}
        setup={(ctx) => {
          const { THREE, scene } = ctx;
          scene.fog = new THREE.Fog(pal.bg, 12, 34);
          const amb = new THREE.AmbientLight(0xffffff, look === "ink" ? 1.15 : 0.72);
          const key = new THREE.DirectionalLight(0xffffff, look === "ink" ? 0.35 : 0.88);
          key.position.set(5, 9, 6);
          const fill = new THREE.DirectionalLight(0xd8e2f0, 0.35);
          fill.position.set(-6, 4, -4);
          scene.add(amb, key, fill);
          buildSet(ctx, set, look);
          const nodes = subjects.map((sub) => {
            const node = buildStandIn(THREE, sub, look);
            scene.add(node);
            return { sub, node };
          });
          return { nodes };
        }}
        draw={(state, t, ctx) => {
          const prog = Math.min(1, Math.max(0, t / dur));
          const cam = previsCameraAt(preset.id, prog, {
            lens: props.lens,
            distance: props.distance,
            height: props.height,
            angle: props.angle,
            speedRamp: props.speedRamp,
          });
          const subProg = rampProgress(prog, props.speedRamp);
          for (const { sub, node } of state.nodes) {
            const pos = previsSubjectAt(sub, subProg);
            node.position.x = pos.x;
            node.position.z = pos.z;
          }
          ctx.camera.fov = cam.fov;
          ctx.camera.position.set(...cam.pos);
          ctx.camera.up.set(Math.sin(cam.roll), Math.cos(cam.roll), 0);
          ctx.camera.lookAt(...cam.target);
          ctx.camera.updateProjectionMatrix();
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
