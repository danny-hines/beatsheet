import { AbsoluteFill } from "remotion";
import type { Group, Mesh } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Kicker, Paper, ThreeCanvas, ease, prog, useScene, type CalloutPoint } from "@beatsheet/motion";

type Part = { file: string; label: string; sub?: string; color?: string };

/**
 * The product's own CAD parts, assembled, then pulled apart (each part straight out from the middle) with a label on
 * each. `apart` is when it comes apart: seconds or a spoken word.
 */
export function Exploded({ parts, kicker, apart = 0.6, spread = 0.9 }: { parts: Part[]; kicker?: string; apart?: number | string; spread?: number }) {
  const s = useScene();
  const t0 = typeof apart === "number" ? apart : (s.word(apart) ?? 0.6);
  return (
    <AbsoluteFill>
      <Paper />
      <ThreeCanvas
        setup={async ({ THREE, scene, file, fit }) => {
          scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9488, 2.4));
          const key = new THREE.DirectionalLight(0xffffff, 2.2);
          key.position.set(4, 6, 8);
          scene.add(key);
          const loader = new STLLoader();
          const group: Group = new THREE.Group();
          const meshes: Mesh[] = [];
          for (const p of parts) {
            const geo = await loader.loadAsync(file(p.file));
            geo.computeVertexNormals();
            const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: p.color ?? "#ece6d8", roughness: 0.6, metalness: 0.05 }));
            group.add(mesh);
            meshes.push(mesh);
          }
          // CAD is Z-up; three is Y-up. Then centre the assembly and size it to the frame.
          group.rotation.x = -Math.PI / 2;
          group.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(group);
          const size = box.getSize(new THREE.Vector3());
          const centre = box.getCenter(new THREE.Vector3());
          const holder = new THREE.Group();
          group.position.sub(centre);
          holder.add(group);
          holder.scale.setScalar(5 / Math.max(size.x, size.y, size.z));
          scene.add(holder);
          // Each part's way out: from the assembly's middle through the part's own middle.
          const mid = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
          const dirs = meshes.map((m) => {
            const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).sub(mid);
            return c.lengthSq() < 1e-6 ? new THREE.Vector3(0, 1, 0) : c.normalize();
          });
          // Framed with room for the parts to move apart.
          fit(holder, { margin: 1 + spread * 0.7 });
          return { holder, meshes, dirs, unit: Math.max(size.x, size.y, size.z) };
        }}
        draw={({ holder, meshes, dirs, unit }, t, ctx) => {
          const k = prog(t, t0, 1.1, ease.inOut);
          holder.rotation.y = -0.5 + t * 0.25;
          meshes.forEach((m, i) => {
            // In the group's own (CAD) space, so "out" is out from the assembly.
            const d = dirs[i]!.clone().applyQuaternion(m.parent!.quaternion.clone().invert());
            m.position.copy(d.multiplyScalar(k * unit * spread * 0.6));
          });
          return k < 0.6
            ? []
            : meshes.map((m, i): CalloutPoint => ({ ...ctx.toScreen(m), label: parts[i]!.label, sub: parts[i]!.sub, at: t0 + 0.9 + i * 0.18 }));
        }}
      />
      {kicker && (
        <AbsoluteFill style={{ padding: `${(s.vertical ? 140 : 80) * s.u}px ${80 * s.u}px` }}>
          <Kicker>{kicker}</Kicker>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
