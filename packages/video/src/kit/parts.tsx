/**
 * The kit's building blocks: backgrounds, type that moves, labels, stamps and camera effects. Each draws in the
 * project's look and can be timed to a spoken word (`at="chunky"`) or to seconds into the shot (`at={1.2}`).
 */
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { cleanWord } from "@beatsheet/schema";
import { clamp01, ease, prog, rand, shakeAt, springAt, useAt, useLook, useScene, type At } from "./scene.tsx";

// ---------------------------------------------------------------------------------------------------------------
// Backgrounds

/** The brand's paper, with a soft wash of its accents; a faint grid if you like. */
export function Paper({ grid, glow = true }: { grid?: boolean; glow?: boolean }) {
  const l = useLook();
  const { t } = useScene();
  return (
    <AbsoluteFill style={{ background: l.paper, overflow: "hidden" }}>
      {glow && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(60% 40% at ${20 + Math.sin(t * 0.4) * 6}% 8%, ${l.accent}55, transparent 70%), radial-gradient(70% 45% at ${85 - Math.sin(t * 0.3) * 5}% 6%, ${l.accent2}40, transparent 70%)`,
          }}
        />
      )}
      {grid && <GridLines color={`${l.ink}12`} step={54 * l.u} />}
    </AbsoluteFill>
  );
}

/** Dark ink with a coloured glow: for data, quotes and code. */
export function Ink({ glow }: { glow?: string }) {
  const l = useLook();
  return (
    <AbsoluteFill style={{ background: "#0d0d10" }}>
      <AbsoluteFill style={{ background: `radial-gradient(80% 55% at 50% 15%, ${glow ?? l.accent2}66, transparent 70%), radial-gradient(70% 40% at 20% 100%, ${l.accent}22, transparent 70%)` }} />
    </AbsoluteFill>
  );
}

/** Blueprint blue with a drafting grid: for plans, wireframes, how it's built. */
export function Blueprint() {
  const l = useLook();
  return (
    <AbsoluteFill style={{ background: l.color("blueprint", "#3e3fc4") }}>
      <GridLines color="rgba(255,255,255,0.10)" step={40 * l.u} />
      <GridLines color="rgba(255,255,255,0.16)" step={200 * l.u} />
    </AbsoluteFill>
  );
}

export function GridLines({ color, step }: { color: string; step: number }) {
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`,
        backgroundSize: `${step}px ${step}px`,
      }}
    />
  );
}

/** A plain fill in one of the look's colours (or any colour). */
export function Solid({ color }: { color?: string }) {
  const l = useLook();
  return <AbsoluteFill style={{ background: l.color(color, l.ink) }} />;
}

/** Background by name, for kit shots' `bg` prop. */
export function Background({ bg }: { bg?: string }) {
  if (!bg || bg === "none") return null;
  if (bg === "paper") return <Paper />;
  if (bg === "paper-grid") return <Paper grid />;
  if (bg === "ink") return <Ink />;
  if (bg === "blueprint") return <Blueprint />;
  return <Solid color={bg} />;
}

/** Film grain that changes every frame. */
export function Grain({ amount = 0.06 }: { amount?: number }) {
  const { frame } = useScene();
  const seed = frame % 7;
  return (
    <AbsoluteFill
      style={{
        opacity: amount,
        mixBlendMode: "overlay",
        pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${seed}' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Type

/** A small label with a dot: what a scene is about ("META MODEL API", "PROTOTYPING IN FUSION"). */
export function Kicker({ children, color, dot, at, style }: { children: ReactNode; color?: string; dot?: string; at?: At; style?: CSSProperties }) {
  const l = useLook();
  const { t } = useScene();
  const from = useAt(at, 0);
  const p = prog(t, from, 0.35);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12 * l.u,
        fontFamily: l.display, fontWeight: l.displayWeight,
        fontSize: 26 * l.u,
        letterSpacing: l.caps ? "0.12em" : "0.02em",
        textTransform: l.caps ? "uppercase" : "none",
        color: l.color(color, l.ink),
        opacity: p,
        transform: `translateY(${(1 - p) * 14 * l.u}px)`,
        ...style,
      }}
    >
      <span style={{ width: 14 * l.u, height: 14 * l.u, borderRadius: 99, background: l.color(dot, l.accent) }} />
      {children}
    </div>
  );
}

/** Rises into place at `at`. */
export function Rise({ at, children, distance = 40, dur = 0.45, style }: { at?: At; children: ReactNode; distance?: number; dur?: number; style?: CSSProperties }) {
  const { t, u } = useScene();
  const p = prog(t, useAt(at, 0), dur);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * distance * u}px)`, ...style }}>{children}</div>;
}

/** Pops into place at `at`, overshooting a touch. */
export function Pop({ at, children, origin = "50% 50%", style }: { at?: At; children: ReactNode; origin?: string; style?: CSSProperties }) {
  const { t } = useScene();
  const s = springAt(t, useAt(at, 0), { stiffness: 260, damping: 16 });
  return <div style={{ transform: `scale(${s})`, transformOrigin: origin, opacity: clamp01(s * 3), ...style }}>{children}</div>;
}

const tokens = (text: string) => text.split(/\s+/).filter(Boolean);

/**
 * Words that slam in one at a time, each on its spoken word when the narration says it (else evenly through `over`
 * seconds from `at`). `accent` words (or the last word, by default) take the accent colour. The kinetic-type staple.
 */
export function Slam({
  text,
  at,
  over,
  accent,
  size = 150,
  color,
  align = "left",
  position = "center",
  uppercase,
  stroke,
  style,
}: {
  text: string;
  at?: At;
  over?: number;
  accent?: string[] | string;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  position?: "top" | "center" | "bottom";
  uppercase?: boolean;
  stroke?: boolean;
  style?: CSSProperties;
}) {
  const l = useLook();
  const s = useScene();
  const from = useAt(at, 0);
  const words = tokens(text ?? "");
  const longest = Math.max(1, ...words.map((w) => w.length));
  const fontSize = Math.min(size * l.u, (s.width - 160 * l.u) / (longest * 0.8));
  const hi = new Set((Array.isArray(accent) ? accent : accent ? [accent] : words.slice(-1)).map(cleanWord));
  // Each word's time: when it's spoken in this shot (in order), else spread evenly.
  const span = over ?? Math.max(0.6, Math.min(s.duration - from, words.length * 0.28));
  let after = from - 0.01;
  const times = words.map((w, i) => {
    const spoken = s.words.find((x) => x.s > after && cleanWord(x.w) === cleanWord(w) && x.s < s.duration);
    const at = spoken ? spoken.s : from + (i / Math.max(1, words.length)) * span;
    after = Math.max(after, at);
    return at;
  });
  const justify = position === "top" ? "flex-start" : position === "bottom" ? "flex-end" : "center";
  const base = l.color(color, l.ink);
  return (
    <AbsoluteFill style={{ justifyContent: justify, padding: `${(s.vertical ? 260 : 120) * l.u}px ${80 * l.u}px`, ...style }}>
      <div style={{ width: "100%", textAlign: align, lineHeight: 0.95, fontFamily: l.display, fontWeight: l.displayWeight, fontSize, letterSpacing: "-0.01em", textTransform: uppercase ?? l.caps ? "uppercase" : "none" }}>
        {words.map((w, i) => {
          const k = s.t - times[i]!;
          if (k < 0) return <span key={i} style={{ opacity: 0 }}>{w} </span>;
          const p = clamp01(k / 0.16);
          const scale = 1 + (1 - ease.out(p)) * 0.8;
          const shake = shakeAt(s.t, times[i]!, 6 * l.u, 14);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.22em",
                color: hi.has(cleanWord(w)) ? accentFor(l, color) : base,
                transform: `translate(${shake.x}px, ${shake.y}px) scale(${scale})`,
                transformOrigin: "50% 60%",
                opacity: clamp01(p * 3),
                WebkitTextStroke: stroke ? `${3 * l.u}px ${l.ink}` : undefined,
                // Light type over footage gets a shadow so it reads on anything.
                textShadow: stroke ? `0 ${6 * l.u}px 0 ${l.ink}` : isLight(base) ? `0 ${4 * l.u}px ${22 * l.u}px rgba(0,0,0,0.55)` : undefined,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** The highlight that reads where `base`-coloured type does: the second accent for dark type (on paper), the accent for light type (on footage or ink). */
function accentFor(l: ReturnType<typeof useLook>, base: string | undefined) {
  return isLight(l.color(base, l.ink)) ? l.accent : l.accent2;
}

/** Whether a colour is light (for picking text that reads on it). */
export function isLight(color: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return true;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** A pill: a label, a price, a status ("$0.01 / IMG", "PAIRED ✓"). */
export function Chip({ children, at, color, text, style }: { children: ReactNode; at?: At; color?: string; text?: string; style?: CSSProperties }) {
  const l = useLook();
  const bg = l.color(color, l.accent);
  return (
    <Pop at={at} style={{ display: "inline-block", ...style }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10 * l.u,
          background: bg,
          color: l.color(text, isLight(bg) ? l.ink : "#fff"),
          fontFamily: l.display, fontWeight: l.displayWeight,
          fontSize: 28 * l.u,
          padding: `${10 * l.u}px ${22 * l.u}px`,
          borderRadius: 999,
          textTransform: l.caps ? "uppercase" : "none",
          letterSpacing: l.caps ? "0.04em" : 0,
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
    </Pop>
  );
}

/** A rubber stamp slapped on at `at`: "ALL OFF-THE-SHELF", "WAY TOO CHUNKY". */
export function Stamp({ text, at, color, rotate = -8, size = 64, x = 0.5, y = 0.5 }: { text: string; at?: At; color?: string; rotate?: number; size?: number; x?: number; y?: number }) {
  const l = useLook();
  const { t } = useScene();
  const from = useAt(at, 0);
  const k = t - from;
  if (k < 0) return null;
  const p = clamp01(k / 0.14);
  const c = l.color(color, l.accent3);
  const shake = shakeAt(t, from + 0.12, 8 * l.u, 12);
  return (
    <div
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: `translate(-50%, -50%) translate(${shake.x}px, ${shake.y}px) rotate(${rotate}deg) scale(${1 + (1 - p) * 1.4})`,
        opacity: p,
        border: `${6 * l.u}px solid ${c}`,
        color: c,
        fontFamily: l.display, fontWeight: l.displayWeight,
        fontSize: size * l.u,
        padding: `${8 * l.u}px ${26 * l.u}px`,
        borderRadius: 10 * l.u,
        textTransform: l.caps ? "uppercase" : "none",
        whiteSpace: "nowrap",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {text}
    </div>
  );
}

/** Types itself out from `at`, a cursor blinking after. */
export function Typewriter({ text, at, cps = 22, style }: { text: string; at?: At; cps?: number; style?: CSSProperties }) {
  const { t } = useScene();
  const from = useAt(at, 0);
  const n = Math.max(0, Math.min(text.length, Math.floor((t - from) * cps)));
  const blink = Math.floor(t * 2) % 2 === 0;
  return (
    <span style={style}>
      {text.slice(0, n)}
      <span style={{ opacity: n < text.length || blink ? 1 : 0 }}>▌</span>
    </span>
  );
}

/** A number that counts up to `to` from `at`: "60 SHARED PHOTOS". */
export function Counter({ to, from = 0, at, dur = 1.2, decimals = 0, prefix = "", suffix = "", style }: { to: number; from?: number; at?: At; dur?: number; decimals?: number; prefix?: string; suffix?: string; style?: CSSProperties }) {
  const { t } = useScene();
  const p = prog(t, useAt(at, 0), dur, ease.expo);
  const n = from + (to - from) * p;
  return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{prefix}{n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

/**
 * A title card: a kicker, big display type (a second line in the accent), an optional line under it. On paper by
 * default; `bg="none"` puts it over whatever's below.
 */
export function Title({ text, kicker, sub, at, bg = "paper", size = 170, align = "left", position = "center" }: { text: string; kicker?: string; sub?: string; at?: At; bg?: string; size?: number; align?: "left" | "center"; position?: "top" | "center" | "bottom" }) {
  const l = useLook();
  const s = useScene();
  const from = useAt(at, 0);
  // A literal "\n" (escaped once too often) breaks the line too.
  const lines = (text ?? "").split(/\n|\\n/);
  const pad = 90 * l.u;
  // Big type that still fits: the longest word sets the ceiling (Arial Black runs about 0.78em a capital).
  const longest = Math.max(1, ...lines.flatMap((x) => x.split(/\s+/)).map((w) => w.length));
  const fontSize = Math.min(size * l.u, (s.width - pad * 2) / (longest * 0.8));
  const dark = bg === "ink" || bg === "blueprint" || (bg !== "paper" && bg !== "paper-grid" && bg !== "none" && !isLight(l.color(bg, l.paper)));
  const ink = dark ? "#fff" : l.ink;
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      <AbsoluteFill style={{ justifyContent: position === "top" ? "flex-start" : position === "bottom" ? "flex-end" : "center", alignItems: align === "center" ? "center" : "flex-start", padding: `${(s.vertical ? 240 : 110) * l.u}px ${pad}px`, textAlign: align }}>
        {kicker && <Kicker at={from} color={dark ? "#fff" : undefined}>{kicker}</Kicker>}
        <div style={{ width: "100%", fontFamily: l.display, fontWeight: l.displayWeight, fontSize, lineHeight: 0.92, textTransform: l.caps ? "uppercase" : "none", marginTop: kicker ? 24 * l.u : 0, letterSpacing: "-0.01em", overflowWrap: "break-word" }}>
          {lines.map((line, i) => (
            <Rise key={i} at={from + 0.08 + i * 0.12} distance={60}>
              <div style={{ color: i > 0 ? (dark ? l.accent : l.accent2) : ink }}>{line}</div>
            </Rise>
          ))}
        </div>
        {sub && (
          <Rise at={from + 0.2 + lines.length * 0.12}>
            <div style={{ fontFamily: l.body, fontSize: 40 * l.u, color: ink, opacity: 0.8, marginTop: 28 * l.u, maxWidth: 860 * l.u, lineHeight: 1.3 }}>{sub}</div>
          </Rise>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Camera effects

/** A white (or any colour) flash at `at`, gone in `dur`. */
export function Flash({ at, color = "#fff", dur = 0.3, peak = 0.9 }: { at?: At; color?: string; dur?: number; peak?: number }) {
  const { t } = useScene();
  const from = useAt(at, 0);
  const k = t - from;
  if (k < 0 || k > dur) return null;
  return <AbsoluteFill style={{ background: color, opacity: peak * (1 - k / dur), pointerEvents: "none" }} />;
}

/** Shakes what's inside when something hits at `at`. */
export function Shake({ at, amount = 16, children }: { at?: At; amount?: number; children: ReactNode }) {
  const { t, u } = useScene();
  const o = shakeAt(t, useAt(at, 0), amount * u);
  return <AbsoluteFill style={{ transform: `translate(${o.x}px, ${o.y}px)` }}>{children}</AbsoluteFill>;
}

/**
 * A camera viewfinder over the picture: corner brackets, a label and status, and a focus box that hunts and locks at
 * `lockAt` (where on the picture: `focus`, 0..1).
 */
export function Viewfinder({ label = "REC", status, focus = { x: 0.5, y: 0.42, w: 0.36, h: 0.22 }, lockAt, color = "#fff" }: { label?: string; status?: string; focus?: { x: number; y: number; w: number; h: number }; lockAt?: At; color?: string }) {
  const l = useLook();
  const { t, width, height } = useScene();
  const lock = useAt(lockAt, 0.6);
  const m = 46 * l.u, b = 70 * l.u, line = 5 * l.u;
  const locked = t >= lock;
  const hunt = locked ? 0 : Math.sin(t * 9) * 0.03 + (1 - prog(t, 0, lock)) * 0.08;
  const bx = (focus.x - focus.w / 2 + hunt) * width, by = (focus.y - focus.h / 2 - hunt * 0.6) * height;
  const bw = focus.w * width * (1 + hunt * 2), bh = focus.h * height * (1 + hunt * 2);
  const fc = locked ? l.accent : color;
  const corner = (pos: CSSProperties, borders: CSSProperties) => <div style={{ position: "absolute", width: b, height: b, ...pos, ...borders }} />;
  const edge = `${line}px solid ${color}`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {corner({ left: m, top: m }, { borderLeft: edge, borderTop: edge })}
      {corner({ right: m, top: m }, { borderRight: edge, borderTop: edge })}
      {corner({ left: m, bottom: m }, { borderLeft: edge, borderBottom: edge })}
      {corner({ right: m, bottom: m }, { borderRight: edge, borderBottom: edge })}
      <div style={{ position: "absolute", left: m + 24 * l.u, top: m + 18 * l.u, color, fontFamily: l.mono, fontSize: 24 * l.u, letterSpacing: "0.1em", display: "flex", gap: 10 * l.u, alignItems: "center" }}>
        <span style={{ width: 14 * l.u, height: 14 * l.u, borderRadius: 99, background: "#ff3b30", opacity: Math.floor(t * 2) % 2 ? 0.4 : 1 }} />
        {label}
      </div>
      {status && <div style={{ position: "absolute", right: m + 24 * l.u, top: m + 18 * l.u, color, fontFamily: l.mono, fontSize: 24 * l.u, letterSpacing: "0.1em" }}>{status}</div>}
      <div style={{ position: "absolute", left: bx, top: by, width: bw, height: bh, border: `${3 * l.u}px solid ${fc}`, borderRadius: 6 * l.u, transition: "none", boxShadow: locked ? `0 0 ${18 * l.u}px ${l.accent}88` : undefined }} />
    </AbsoluteFill>
  );
}

/** A bright line sweeping down the picture from `at` over `dur`: "processing". */
export function ScanLine({ at, dur = 1.2, color }: { at?: At; dur?: number; color?: string }) {
  const l = useLook();
  const { t, height } = useScene();
  const from = useAt(at, 0);
  const p = (t - from) / dur;
  if (p < 0 || p > 1) return null;
  const c = l.color(color, l.accent);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: p * height, height: 8 * l.u, background: c, boxShadow: `0 0 ${40 * l.u}px ${c}` }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: p * height, background: `${c}14` }} />
    </AbsoluteFill>
  );
}

/** A burst of digital glitch on what's inside, at `at`. */
export function Glitch({ at, dur = 0.18, amount = 1, children }: { at?: At; dur?: number; amount?: number; children: ReactNode }) {
  const { t, u, frame } = useScene();
  const from = useAt(at, 0);
  const on = t >= from && t < from + dur;
  if (!on) return <AbsoluteFill>{children}</AbsoluteFill>;
  const k = amount * 18 * u;
  const dx = (rand(frame) - 0.5) * k, dy = (rand(frame + 3) - 0.5) * k * 0.3;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px)`, filter: "saturate(1.6) contrast(1.2)" }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${-dx}px, 0)`, mixBlendMode: "screen", opacity: 0.5, filter: "hue-rotate(90deg)" }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}
