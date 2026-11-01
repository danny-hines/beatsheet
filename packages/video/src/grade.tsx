/**
 * The look's grade on footage. Warmth, tint and fade are one colour matrix (an SVG filter, worked in sRGB like the CSS
 * filters next to it), so a cut-out graded the same way still lines up with its source underneath; brightness,
 * contrast and saturation are CSS filters; a vignette is a gradient over the picture.
 */
import type { CSSProperties } from "react";
import type { Grade } from "@beatsheet/schema";

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** The colour matrix's rows for warmth, tint and fade, or nothing when there's none. */
export function gradeMatrix(g: Grade | undefined): number[] | undefined {
  const w = g?.warmth ?? 0, t = g?.tint ?? 0, f = g?.fade ?? 0;
  if (!w && !t && !f) return undefined;
  // Warmth lifts red and drops blue, tint trades green against red and blue, and fade lifts the blacks a little
  // while keeping white where it is.
  const lift = 0.2 * f;
  const scale = [1 + 0.1 * w + 0.03 * t, 1 + 0.02 * w - 0.07 * t, 1 - 0.16 * w + 0.03 * t].map((s) => s * (1 - lift));
  const offset = [0.025 * w, 0, -0.03 * w].map((o) => o + lift);
  return [scale[0]!, 0, 0, 0, offset[0]!, 0, scale[1]!, 0, 0, offset[1]!, 0, 0, scale[2]!, 0, offset[2]!, 0, 0, 0, 1, 0].map(r3);
}

/**
 * The three wheels as a curve for each channel (17 points from black to white): lift raises the shadows and leaves
 * white, gain scales towards the highlights, gamma bends the midtones (above 1, brighter).
 */
export function wheelTables(g: Grade | undefined): [number[], number[], number[]] | undefined {
  const w = g?.wheels;
  if (!w || (!w.lift?.some(Boolean) && !w.gamma?.some((x) => x !== 1) && !w.gain?.some((x) => x !== 1))) return undefined;
  const curve = (c: 0 | 1 | 2) =>
    Array.from({ length: 17 }, (_, i) => {
      const x = i / 16;
      const lifted = x + (w.lift?.[c] ?? 0) * (1 - x);
      const gained = Math.min(1, Math.max(0, lifted * (w.gain?.[c] ?? 1)));
      return r3(Math.pow(gained, 1 / Math.max(0.1, w.gamma?.[c] ?? 1)));
    });
  return [curve(0), curve(1), curve(2)];
}

const filterId = (m: number[] | undefined, t: number[][] | undefined) =>
  `bs-grade-${[...(m ?? []), ...(t?.flat() ?? [])].map((x) => String(x).replace("-", "m").replace(".", "p")).join("_")}`;

/** The CSS `filter` for footage in this grade, with any other filter (a shot's own look) after it. */
export function gradeFilter(g: Grade | undefined, also?: string): string | undefined {
  const parts: string[] = [];
  const m = gradeMatrix(g);
  const t = wheelTables(g);
  if (m || t) parts.push(`url(#${filterId(m, t)})`);
  if (g?.brightness !== undefined && g.brightness !== 1) parts.push(`brightness(${g.brightness})`);
  if (g?.contrast !== undefined && g.contrast !== 1) parts.push(`contrast(${g.contrast})`);
  if (g?.saturation !== undefined && g.saturation !== 1) parts.push(`saturate(${g.saturation})`);
  if (also) parts.push(also);
  return parts.length ? parts.join(" ") : undefined;
}

/** The SVG the grade's filter refers to; put it next to the graded picture. */
export function GradeDefs({ grade }: { grade?: Grade }) {
  const m = gradeMatrix(grade);
  const t = wheelTables(grade);
  if (!m && !t) return null;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter id={filterId(m, t)} colorInterpolationFilters="sRGB">
        {m && <feColorMatrix type="matrix" values={m.join(" ")} />}
        {t && (
          <feComponentTransfer>
            <feFuncR type="table" tableValues={t[0].join(" ")} />
            <feFuncG type="table" tableValues={t[1].join(" ")} />
            <feFuncB type="table" tableValues={t[2].join(" ")} />
          </feComponentTransfer>
        )}
      </filter>
    </svg>
  );
}

/** The vignette, over the picture. */
export function Vignette({ amount }: { amount?: number }) {
  if (!amount) return null;
  const style: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${r3(0.8 * amount)}) 100%)` };
  return <div style={style} />;
}
