/**
 * Pure three.js scene construction and camera posing for `kit:Previs`, shared between the Remotion scene component
 * (`kit/previs.tsx`) and the studio's single-context visual preset previewer (`previsPreview.ts`).
 */
import {
  PREVIS_BY_ID,
  previsCameraAt,
  previsSubjectAt,
  rampProgress,
  type PrevisCameraOpts,
  type PrevisLook,
  type PrevisSet,
  type PrevisSubject,
} from "@beatsheet/schema";

export type ThreeMod = typeof import("three");

export type PrevisSceneRig = {
  nodes: { sub: PrevisSubject; node: import("three").Group }[];
  dispose: () => void;
};

/** Palette for each visual look. */
export function previsPaletteFor(look: PrevisLook) {
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

/** Procedural bold diagonal stripe texture on a canvas so stand-ins carry colour and depth without looking human. */
function stripeTexture(
  THREE: ThreeMod,
  hex: string,
  inkOnly = false,
  cache?: Map<string, import("three").CanvasTexture>,
): { tex: import("three").CanvasTexture; owned: boolean } {
  const key = `${inkOnly ? "ink" : hex}`;
  const hit = cache?.get(key);
  if (hit) return { tex: hit, owned: false };
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
  if (cache) {
    cache.set(key, tex);
    return { tex, owned: false };
  }
  return { tex, owned: true };
}

/** Populates a three.js scene with fog, lights, matte-grey set geometry and striped stand-ins. */
export function populatePrevisScene(
  THREE: ThreeMod,
  scene: import("three").Scene,
  opts: {
    set: PrevisSet;
    look: PrevisLook;
    subjects: PrevisSubject[];
    textureCache?: Map<string, import("three").CanvasTexture>;
  },
): PrevisSceneRig {
  const { set, look, subjects, textureCache } = opts;
  const pal = previsPaletteFor(look);
  const ownedGeos: import("three").BufferGeometry[] = [];
  const ownedMats: import("three").Material[] = [];
  const ownedTexs: import("three").Texture[] = [];

  const trackGeo = <T extends import("three").BufferGeometry>(g: T): T => {
    ownedGeos.push(g);
    return g;
  };
  const trackMat = <T extends import("three").Material>(m: T): T => {
    ownedMats.push(m);
    return m;
  };

  scene.background = new THREE.Color(pal.bg);
  scene.fog = new THREE.Fog(pal.bg, 12, 34);
  const amb = new THREE.AmbientLight(0xffffff, look === "ink" ? 1.15 : 0.72);
  const key = new THREE.DirectionalLight(0xffffff, look === "ink" ? 0.35 : 0.88);
  key.position.set(5, 9, 6);
  const fill = new THREE.DirectionalLight(0xd8e2f0, 0.35);
  fill.position.set(-6, 4, -4);
  scene.add(amb, key, fill);

  // Coarse set geometry so parallax and camera speed read clearly without dictating surface detail.
  const setGroup = new THREE.Group();
  const wire = look === "sketch" || look === "ink";
  const wallMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: pal.wall,
      roughness: 0.92,
      metalness: 0.04,
      ...(wire ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : {}),
    }),
  );
  const edgeMat = trackMat(new THREE.LineBasicMaterial({ color: pal.edge, transparent: true, opacity: wire ? 0.85 : 0.22 }));

  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const geo = trackGeo(new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(x, y, z);
    setGroup.add(mesh);
    const edges = new THREE.LineSegments(trackGeo(new THREE.EdgesGeometry(geo)), edgeMat);
    edges.position.copy(mesh.position);
    setGroup.add(edges);
  };

  const floorGeo = trackGeo(new THREE.PlaneGeometry(44, 44));
  const floorMat = trackMat(new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.95 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  setGroup.add(floor);

  const grid = new THREE.GridHelper(32, 32, pal.grid1, pal.grid2);
  grid.position.y = 0.004;
  setGroup.add(grid);

  if (set === "room") {
    addBox(10, 3.6, 0.25, 0, 1.8, -4.5);
    addBox(0.25, 3.6, 10, -5, 1.8, 0.5);
    addBox(0.25, 3.6, 10, 5, 1.8, 0.5);
    addBox(2.2, 0.78, 0.9, -2.2, 0.39, -3.5);
    addBox(1.8, 1.4, 0.3, 1.6, 1.9, -4.32);
  } else if (set === "street") {
    for (let z = -10; z <= 8; z += 4.5) {
      addBox(2.8, 5.5 + ((Math.abs(z) * 1.7) % 3), 3.4, -5.8, 2.75, z);
      addBox(2.8, 4.8 + ((Math.abs(z + 2) * 2.1) % 3.5), 3.4, 5.8, 2.4, z + 1);
    }
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
    for (let z = -10; z <= 6; z += 2.5) addBox(4.0, 0.25, 0.25, 0, 3.1, z);
    addBox(0.45, 3.2, 0.45, -1.35, 1.6, 1.9);
  } else if (set === "clearing") {
    const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.34, 5.2, 10));
    const trunkEdgesGeo = wire ? trackGeo(new THREE.EdgesGeometry(trunkGeo)) : undefined;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 5.4 + (i % 3) * 1.4;
      const m = new THREE.Mesh(trunkGeo, wallMat);
      m.position.set(Math.cos(a) * r, 2.6, Math.sin(a) * r);
      setGroup.add(m);
      if (trunkEdgesGeo) {
        const e = new THREE.LineSegments(trunkEdgesGeo, edgeMat);
        e.position.copy(m.position);
        setGroup.add(e);
      }
    }
  } else {
    addBox(1.4, 0.08, 1.4, 0, 0.04, 0);
    addBox(12, 5, 0.2, 0, 2.5, -6.5);
  }
  scene.add(setGroup);

  // Stand-in capsules (people) and blocks (props).
  const ghost = look === "ghosts";
  const nodes = subjects.map((s) => {
    const group = new THREE.Group();
    const isProp = s.kind === "prop" || s.kind === "box";
    const h = s.height ?? (isProp ? 0.55 : 1.75);
    const color = s.color ?? "#e5484d";
    let mat: import("three").MeshStandardMaterial;
    if (ghost) {
      mat = trackMat(new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.42, roughness: 0.55 }));
    } else {
      const { tex, owned } = stripeTexture(THREE, color, look === "ink", textureCache);
      if (owned) ownedTexs.push(tex);
      mat = trackMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.72,
          metalness: 0.05,
          ...(wire ? { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 } : {}),
        }),
      );
    }

    if (isProp) {
      const geo = trackGeo(new THREE.BoxGeometry(h * 0.9, h, h * 0.9));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = h / 2 + 0.08;
      group.add(mesh);
      if (wire) {
        const e = new THREE.LineSegments(trackGeo(new THREE.EdgesGeometry(geo)), trackMat(new THREE.LineBasicMaterial({ color: "#151518" })));
        e.position.copy(mesh.position);
        group.add(e);
      }
    } else {
      const r = Math.min(0.24, h * 0.13);
      const bodyLen = Math.max(0.2, h - r * 2);
      const geo = trackGeo(new THREE.CapsuleGeometry(r, bodyLen, 10, 20));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = h / 2;
      group.add(mesh);
      if (wire) {
        const e = new THREE.LineSegments(trackGeo(new THREE.EdgesGeometry(geo, 22)), trackMat(new THREE.LineBasicMaterial({ color: "#1a1a1a" })));
        e.position.copy(mesh.position);
        group.add(e);
      }
      const eye = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(r * 0.24, 12, 12)),
        trackMat(new THREE.MeshBasicMaterial({ color: look === "ink" ? "#111111" : "#ffffff" })),
      );
      eye.position.set(0, h * 0.85, r * 0.92);
      group.add(eye);
    }

    group.rotation.y = ((s.facing ?? 0) * Math.PI) / 180;
    group.position.set(s.x ?? 0, 0, s.z ?? 0);
    scene.add(group);
    return { sub: s, node: group };
  });

  const dispose = () => {
    grid.dispose();
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMats) m.dispose();
    for (const t of ownedTexs) t.dispose();
  };

  return { nodes, dispose };
}

/** Poses camera and moving stand-ins at normalized progress `u` (0..1) for a preset move. */
export function posePrevisScene(
  camera: import("three").PerspectiveCamera,
  nodes: PrevisSceneRig["nodes"],
  moveId: string,
  u: number,
  opts: PrevisCameraOpts = {},
) {
  const preset = PREVIS_BY_ID.get(moveId) ?? PREVIS_BY_ID.get("push-in")!;
  const prog = Math.min(1, Math.max(0, u));
  const cam = previsCameraAt(preset.id, prog, opts);
  const subProg = rampProgress(prog, opts.speedRamp);
  for (const { sub, node } of nodes) {
    const pos = previsSubjectAt(sub, subProg);
    node.position.x = pos.x;
    node.position.z = pos.z;
  }
  camera.fov = cam.fov;
  camera.position.set(...cam.pos);
  camera.up.set(Math.sin(cam.roll), Math.cos(cam.roll), 0);
  camera.lookAt(...cam.target);
  camera.updateProjectionMatrix();
}
