import { AbsoluteFill } from "remotion";
import { Flash, Media, Shake, Slam, Viewfinder, useScene } from "@beatsheet/motion";

/**
 * A hook: the hero photo in the product's viewfinder, the focus box hunting then locking on a spoken word, a white
 * flash and a shake on the shutter, and the line slamming in word by word as it's said.
 *
 *   { "kind": "coded", "component": "scenes/Hook.tsx#Hook",
 *     "props": { "photo": "p-0912-gym", "line": "This camera can't take a normal photo.", "lock": "camera", "shutter": "photo" } }
 *
 * Give the shot `"captions": false`: the words are already on screen.
 */
export function Hook({ photo, line, lock = 0.6, shutter }: { photo: string; line: string; lock?: number | string; shutter?: number | string }) {
  const s = useScene();
  const hit = typeof shutter === "string" ? (s.word(shutter) ?? 1.2) : (shutter ?? 1.2);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Shake at={hit} amount={18}>
        {/* A slow push in, so the picture is never still. */}
        <Media asset={photo} push={0.08} style={{ position: "absolute", inset: 0 }} />
        <Viewfinder label="MUSE CAM" status="READY" lockAt={lock} focus={{ x: 0.5, y: 0.3, w: 0.32, h: 0.18 }} />
        <Slam text={line} position="bottom" size={120} color="#ffffff" />
      </Shake>
      <Flash at={hit} />
    </AbsoluteFill>
  );
}
