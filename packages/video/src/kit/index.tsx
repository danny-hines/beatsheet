/**
 * @beatsheet/motion: what scenes are made of. A scene file imports from here (and from react, remotion and three);
 * a shot can also use any of the ready-made scenes in KIT directly, as `kit:Name` with props.
 */
import { AbsoluteFill } from "remotion";
import { Background, Blueprint, Chip, Counter, Flash, Glitch, Grain, GridLines, Ink, isLight, Kicker, Paper, Pop, Rise, ScanLine, Shake, Slam, Solid, Stamp, Title, Typewriter, Viewfinder } from "./parts.tsx";
import { Callouts, Cards, Code, Grid, Media, Phone, Polaroids, Quote, readable, Split, ThreeCanvas } from "./media.tsx";
import { useLook, useScene } from "./scene.tsx";

export * from "./scene.tsx";
export { Background, Blueprint, Callouts, Cards, Chip, Code, Counter, Flash, Glitch, Grain, Grid, GridLines, Ink, isLight, Kicker, Media, Paper, Phone, Polaroids, Pop, Quote, readable, Rise, ScanLine, Shake, Slam, Solid, Split, Stamp, ThreeCanvas, Title, Typewriter, Viewfinder };
export type { CalloutPoint, CardItem, ThreeContext } from "./media.tsx";
export { GradeDefs, gradeFilter, Vignette } from "../grade.tsx";

/** A big number counting up with a label: "60 SHARED PHOTOS", "30 STYLES". */
function Stat({ value, label, kicker, at, bg = "ink", prefix, suffix }: { value: number; label: string; kicker?: string; at?: number | string; bg?: string; prefix?: string; suffix?: string }) {
  const l = useLook();
  const s = useScene();
  const dark = bg === "ink" || bg === "blueprint" || (bg !== "paper" && bg !== "none" && !isLight(l.color(bg, l.paper)));
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      <AbsoluteFill style={{ justifyContent: "center", padding: 90 * s.u }}>
        {kicker && <Kicker at={at} color={dark ? "#fff" : undefined}>{kicker}</Kicker>}
        <Pop at={at} origin="0% 50%">
          <div style={{ fontFamily: l.display, fontWeight: l.displayWeight, fontSize: 280 * s.u, lineHeight: 0.9, color: dark ? l.accent : l.accent2 }}>
            <Counter to={value} at={at} prefix={prefix} suffix={suffix} />
          </div>
        </Pop>
        <Rise at={typeof at === "number" ? at + 0.3 : at}>
          <div style={{ fontFamily: l.display, fontWeight: l.displayWeight, fontSize: 90 * s.u, lineHeight: 0.95, color: dark ? "#fff" : l.ink, textTransform: l.caps ? "uppercase" : "none" }}>{label}</div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Kinetic words over whatever's below (or on a background): `text`, or the narration spoken during the shot. */
function Words(props: Parameters<typeof Slam>[0] & { bg?: string }) {
  const s = useScene();
  const spoken = s.words.filter((w) => w.s >= -0.05 && w.s < s.duration).map((w) => w.w).join(" ");
  return (
    <AbsoluteFill>
      <Background bg={props.bg} />
      <Slam {...props} text={props.text ?? spoken} />
    </AbsoluteFill>
  );
}

/** An overlay of the camera's viewfinder, a flash, a stamp or a scan line, to sit on a track above a picture. */
const Overlay = {
  Viewfinder,
  Flash: (p: Parameters<typeof Flash>[0]) => <Flash {...p} />,
  Stamp: (p: Parameters<typeof Stamp>[0]) => (
    <AbsoluteFill>
      <Stamp {...p} />
    </AbsoluteFill>
  ),
  ScanLine,
};

/** The ready-made scenes a shot can use as `kit:Name`, each taking its props from the shot. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KIT: Record<string, React.FC<any>> = {
  Title,
  Words,
  Slam: Words,
  Stat,
  Cards,
  Quote,
  Code,
  Split,
  Grid,
  Polaroids,
  Phone,
  Callouts,
  Media: (p: Parameters<typeof Media>[0] & { bg?: string }) => (
    <AbsoluteFill>
      <Background bg={p.bg} />
      <Media {...p} style={{ position: "absolute", inset: 0 }} />
    </AbsoluteFill>
  ),
  Paper: () => <Paper />,
  Ink: () => <Ink />,
  Blueprint: () => <Blueprint />,
  ...Overlay,
};

export { KIT_PROPS } from "./catalog.ts";
