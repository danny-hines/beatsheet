/**
 * The kit's pieces that show the project's own material: a photo or clip in a box, before/after splits, photo walls,
 * polaroids dropping in, a phone showing a site, labelled callouts on a picture, cards, posts and code, and a canvas
 * for three.js.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, continueRender, delayRender, getRemotionEnvironment, Img, OffthreadVideo } from "remotion";
import { GradeDefs, gradeFilter } from "../grade.tsx";
import { Background, Chip, isLight, Kicker, Pop, Rise, Typewriter } from "./parts.tsx";
import { clamp01, ease, prog, rand, springAt, useAt, useLook, useScene, type At } from "./scene.tsx";

// ---------------------------------------------------------------------------------------------------------------
// Pictures

/**
 * A project asset (photo or clip) filling its box: cropped to fit, `focus` where to keep (0..1), optionally moving. In
 * the look's grade, like the footage around it, unless `graded` is false.
 */
export function Media({ asset, focus, zoom = 1, from = 0, style, push, graded = true }: { asset: string; focus?: { x: number; y: number }; zoom?: number; from?: number; style?: CSSProperties; push?: number; graded?: boolean }) {
  const s = useScene();
  const a = s.assets.get(asset);
  const pos = `${(focus?.x ?? 0.5) * 100}% ${(focus?.y ?? 0.5) * 100}%`;
  const scale = zoom * (1 + (push ?? 0) * clamp01(s.t / Math.max(0.1, s.duration)));
  const grade = graded ? s.look.grade : undefined;
  const img: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", objectPosition: pos, transform: `scale(${scale})`, transformOrigin: pos, display: "block", filter: gradeFilter(grade) };
  if (!a) return <div style={{ ...style, background: "#333", color: "#fff", display: "grid", placeItems: "center", fontSize: 24 * s.u }}>no asset {asset}</div>;
  return (
    <div style={{ overflow: "hidden", ...style }}>
      <GradeDefs grade={grade} />
      {a.kind === "video" ? <OffthreadVideo src={s.asset(asset)} muted trimBefore={Math.round(from * s.fps)} style={img} pauseWhenBuffering /> : <Img src={s.asset(asset)} style={img} pauseWhenLoading />}
    </div>
  );
}

/**
 * Before and after: two pictures stacked (or side by side), the second wiping in at `at`, each with a label. For a
 * transformation, a restyle, then and now.
 */
export function Split({ before, after, labels = ["Before", "After"], at, direction, bg = "ink" }: { before: string; after: string; labels?: string[]; at?: At; direction?: "vertical" | "horizontal"; bg?: string }) {
  const l = useLook();
  const s = useScene();
  const wipe = prog(s.t, useAt(at, 0.4), 0.45, ease.inOut);
  const vertical = (direction ?? (s.vertical ? "vertical" : "horizontal")) === "vertical";
  const half: CSSProperties = vertical ? { position: "absolute", left: 0, right: 0, height: "50%" } : { position: "absolute", top: 0, bottom: 0, width: "50%" };
  const line = 8 * l.u;
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      <Media asset={before} style={{ ...half, ...(vertical ? { top: 0 } : { left: 0 }) }} />
      <div style={{ ...half, ...(vertical ? { bottom: 0 } : { right: 0 }), overflow: "hidden", clipPath: vertical ? `inset(0 ${(1 - wipe) * 100}% 0 0)` : `inset(${(1 - wipe) * 100}% 0 0 0)` }}>
        <Media asset={after} style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ position: "absolute", background: l.accent, ...(vertical ? { left: 0, right: 0, top: `calc(50% - ${line / 2}px)`, height: line, transform: `scaleX(${wipe})`, transformOrigin: "left" } : { top: 0, bottom: 0, left: `calc(50% - ${line / 2}px)`, width: line, transform: `scaleY(${wipe})`, transformOrigin: "top" }) }} />
      {labels[0] && <div style={{ position: "absolute", left: 36 * l.u, top: 36 * l.u }}><Chip color="#ffffff" text={l.ink}>{labels[0]}</Chip></div>}
      {labels[1] && wipe > 0.6 && (
        <div style={{ position: "absolute", left: vertical ? 36 * l.u : `calc(50% + ${36 * l.u}px)`, top: vertical ? `calc(50% + ${36 * l.u}px)` : 36 * l.u }}>
          <Chip>{labels[1]}</Chip>
        </div>
      )}
    </AbsoluteFill>
  );
}

/**
 * A wall of pictures: starts on one (`zoomFrom`, its index) filling the frame and pulls back to the whole grid from
 * `at`; or, tilted, drifts slowly like a pinboard. For "1 photo, 12 worlds", "60 shared photos".
 */
export function Grid({ assets, columns, at, dur = 0.9, zoomFrom, tilt = 0, drift = 0, gap = 10, bg = "ink" }: { assets: string[]; columns?: number; at?: At; dur?: number; zoomFrom?: number; tilt?: number; drift?: number; gap?: number; bg?: string }) {
  const s = useScene();
  const list = assets ?? [];
  const cols = columns ?? Math.max(2, Math.round(Math.sqrt(list.length * (s.vertical ? 0.55 : 1.8))));
  const rows = Math.ceil(list.length / cols);
  const cellW = (s.width - gap * s.u * (cols + 1)) / cols;
  const cellH = s.vertical ? cellW * 1.6 : cellW * 0.66;
  const gridH = rows * cellH + (rows + 1) * gap * s.u;
  const p = zoomFrom === undefined ? 1 : prog(s.t, useAt(at, 0.3), dur, ease.inOut);
  // Zoomed in, the chosen tile fills the frame; zoomed out, the grid fits.
  let transform = "";
  if (zoomFrom !== undefined) {
    const i = Math.min(list.length - 1, Math.max(0, zoomFrom));
    const cx = gap * s.u + (i % cols) * (cellW + gap * s.u) + cellW / 2;
    const cy = (s.height - gridH) / 2 + gap * s.u + Math.floor(i / cols) * (cellH + gap * s.u) + cellH / 2;
    const zIn = Math.max(s.width / cellW, s.height / cellH);
    const z = zIn + (1 - zIn) * p;
    const tx = (s.width / 2 - cx) * (1 - p), ty = (s.height / 2 - cy) * (1 - p);
    transform = `translate(${tx * z}px, ${ty * z}px) scale(${z})`;
  }
  const d = drift * s.t * 20 * s.u;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Background bg={bg} />
      <AbsoluteFill style={{ transform: `${transform} rotate(${tilt}deg) translateY(${-d}px) scale(${tilt ? 1.25 : 1})` }}>
        <div style={{ position: "absolute", left: 0, top: (s.height - gridH) / 2, width: s.width, display: "grid", gridTemplateColumns: `repeat(${cols}, ${cellW}px)`, gap: gap * s.u, padding: gap * s.u }}>
          {list.map((a, i) => (
            <Media key={`${a}-${i}`} asset={a} style={{ width: cellW, height: cellH, borderRadius: 10 * s.u }} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Photos dropping onto a pile one after another (at their `ats`, or every `every` seconds from `at`), each with a caption. */
export function Polaroids({ assets, captions, at, every = 0.45, ats, bg = "paper", size = 0.62 }: { assets: string[]; captions?: string[]; at?: At; every?: number; ats?: At[]; bg?: string; size?: number }) {
  const l = useLook();
  const s = useScene();
  const from = useAt(at, 0.1);
  const times = (assets ?? []).map((_, i) => ats?.[i]);
  const resolved = times.map((x, i) => (x === undefined ? from + i * every : typeof x === "number" ? x : (s.word(x) ?? from + i * every)));
  const w = s.width * size;
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      {(assets ?? []).map((a, i) => {
        const k = springAt(s.t, resolved[i]!, { stiffness: 200, damping: 18 });
        if (s.t < resolved[i]!) return null;
        const rot = (rand(i + 1) - 0.5) * 14;
        const dx = (rand(i + 7) - 0.5) * s.width * 0.18, dy = (rand(i + 11) - 0.5) * s.height * 0.12;
        return (
          <div
            key={`${a}-${i}`}
            style={{
              position: "absolute",
              left: s.width / 2 - w / 2 + dx,
              top: s.height * 0.42 - w * 0.62 + dy,
              width: w,
              background: "#fff",
              padding: `${18 * s.u}px ${18 * s.u}px ${captions?.[i] ? 18 * s.u : 70 * s.u}px`,
              borderRadius: 8 * s.u,
              boxShadow: `0 ${20 * s.u}px ${60 * s.u}px rgba(0,0,0,0.35)`,
              transform: `translateY(${(1 - k) * -s.height * 0.6}px) rotate(${rot * k}deg) scale(${1.15 - 0.15 * k})`,
            }}
          >
            <Media asset={a} style={{ width: "100%", aspectRatio: "1 / 1" }} />
            {captions?.[i] && <div style={{ fontFamily: l.body, fontWeight: 700, color: "#151515", fontSize: 30 * s.u, lineHeight: 1.25, marginTop: 16 * s.u }}>{captions[i]}</div>}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/**
 * A phone sliding up with something on its screen: a screenshot or clip (`asset`), optionally scrolling, with the
 * address bar typing out `url`.
 */
export function Phone({ asset, url, at, scroll = 0, bg = "paper", children }: { asset?: string; url?: string; at?: At; scroll?: number; bg?: string; children?: ReactNode }) {
  const l = useLook();
  const s = useScene();
  const from = useAt(at, 0);
  const k = springAt(s.t, from, { stiffness: 140, damping: 18 });
  const w = Math.min(s.width * 0.72, s.height * 0.42), h = w * 2.05;
  const r = 70 * s.u, bezel = 16 * s.u;
  const a = asset ? s.assets.get(asset) : undefined;
  const tall = a?.width && a?.height ? (a.height / a.width) * (w - bezel * 2) : h;
  const shift = Math.max(0, tall - (h - bezel * 2 - 70 * s.u)) * scroll * prog(s.t, from + 0.6, Math.max(0.5, s.duration - from - 0.8), ease.inOut);
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      <div style={{ position: "absolute", left: (s.width - w) / 2, top: (s.height - h) / 2 + (1 - k) * s.height * 0.7, width: w, height: h, borderRadius: r, background: "#111", padding: bezel, boxShadow: `0 ${40 * s.u}px ${90 * s.u}px rgba(0,0,0,0.35)` }}>
        <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: r - bezel, overflow: "hidden", background: "#fff" }}>
          {url && (
            <div style={{ height: 70 * s.u, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 10 * s.u, background: "#f2f2f2", fontFamily: l.body, fontSize: 24 * s.u, color: "#333" }}>
              <span style={{ background: "#e4e4e4", borderRadius: 99, padding: `${4 * s.u}px ${22 * s.u}px` }}>
                <Typewriter text={url} at={from + 0.3} cps={18} />
              </span>
            </div>
          )}
          {a && <Media asset={asset!} style={{ width: "100%", height: tall, transform: `translateY(${-shift}px)` }} focus={{ x: 0.5, y: 0 }} />}
          {children}
          <div style={{ position: "absolute", top: 12 * s.u, left: "50%", width: w * 0.3, height: 30 * s.u, marginLeft: -w * 0.15, borderRadius: 99, background: "#111" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

export type CalloutPoint = { x: number; y: number; label: string; sub?: string; at?: At; side?: "left" | "right" };

/**
 * Labels with leader lines pointing at parts of the picture: each point (0..1 of the frame) gets a dot, a line and a
 * label that pops in at its `at` (a spoken word works well: the part named as it's said). Over a picture (`asset`), or
 * transparent over whatever's below.
 */
export function Callouts({ points, asset, bg = "none" }: { points: CalloutPoint[]; asset?: string; bg?: string }) {
  const l = useLook();
  const s = useScene();
  const shown = (points ?? []).filter((pt) => pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1);
  const spots = layoutLabels(shown, s);
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      {asset && <Media asset={asset} style={{ position: "absolute", inset: 0 }} />}
      {shown.map((pt, i) => <CalloutLabel key={i} pt={pt} spot={spots[i]!} i={i} l={l} s={s} />)}
    </AbsoluteFill>
  );
}

type Spot = { side: "left" | "right"; lx: number; ly: number };

/** Where each label sits: beside its point, inside the frame, and (on each side) never on top of another. */
function layoutLabels(points: CalloutPoint[], s: ReturnType<typeof useScene>): Spot[] {
  const margin = 30 * s.u, gap = 62 * s.u;
  const spots = points.map((pt): Spot => {
    const side = pt.side ?? (pt.x > 0.5 ? "right" : "left");
    const px = pt.x * s.width, py = pt.y * s.height;
    const labelW = Math.max(pt.label.length * 28 * 0.8, (pt.sub?.length ?? 0) * 18 * 0.62) * s.u + 40 * s.u;
    const lx = side === "right" ? Math.min(s.width - margin - labelW, px + 160 * s.u) : Math.max(margin + labelW, px - 160 * s.u);
    return { side, lx, ly: py - 70 * s.u };
  });
  for (const side of ["left", "right"] as const) {
    const order = spots.map((sp, i) => ({ sp, i })).filter((x) => x.sp.side === side).sort((a, b) => a.sp.ly - b.sp.ly);
    for (let k = 1; k < order.length; k++) {
      const prev = order[k - 1]!.sp, cur = order[k]!.sp;
      if (cur.ly - prev.ly < gap) cur.ly = prev.ly + gap;
    }
  }
  return spots;
}

function CalloutLabel({ pt, spot, i, l, s }: { pt: CalloutPoint; spot: Spot; i: number; l: ReturnType<typeof useLook>; s: ReturnType<typeof useScene> }) {
  const at = useAt(pt.at, 0.3 + i * 0.5);
  const k = prog(s.t, at, 0.35);
  if (s.t < at) return null;
  const { side, lx, ly } = spot;
  const px = pt.x * s.width, py = pt.y * s.height;
  const len = Math.hypot(lx - px, ly - py) * k;
  const angle = Math.atan2(ly - py, lx - px);
  return (
    <>
      <div style={{ position: "absolute", left: px - 9 * s.u, top: py - 9 * s.u, width: 18 * s.u, height: 18 * s.u, borderRadius: 99, background: l.accent, border: `${3 * s.u}px solid ${l.ink}` }} />
      <div style={{ position: "absolute", left: px, top: py, width: len, height: 3 * s.u, background: l.ink, transformOrigin: "0 50%", transform: `rotate(${angle}rad)` }} />
      <div style={{ position: "absolute", left: lx, top: ly, transform: `translate(${side === "right" ? "0" : "-100%"}, -50%)` }}>
        <Pop at={at + 0.2} origin={side === "right" ? "0% 50%" : "100% 50%"}>
          <div style={{ background: l.ink, color: "#fff", borderRadius: 10 * s.u, padding: `${10 * s.u}px ${18 * s.u}px`, fontFamily: l.display, fontWeight: l.displayWeight, fontSize: 28 * s.u, lineHeight: 1.05, textTransform: l.caps ? "uppercase" : "none", whiteSpace: "nowrap" }}>
            {pt.label}
            {pt.sub && <div style={{ fontFamily: l.mono, fontSize: 18 * s.u, color: l.accent, textTransform: "none", marginTop: 4 * s.u }}>{pt.sub}</div>}
          </div>
        </Pop>
      </div>
    </>
  );
}

export type CardItem = { title: string; body?: string; meta?: string; tag?: string; image?: string; at?: At };

/** Cards stacking in, one by one: announcements, facts, steps. Dark glass on ink, white on paper. */
export function Cards({ items, kicker, bg = "ink", at }: { items: CardItem[]; kicker?: string; bg?: string; at?: At }) {
  const l = useLook();
  const s = useScene();
  const from = useAt(at, 0.2);
  const dark = bg === "ink" || bg === "blueprint";
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      <AbsoluteFill style={{ padding: `${(s.vertical ? 200 : 90) * s.u}px ${70 * s.u}px`, gap: 28 * s.u, justifyContent: "flex-start" }}>
        {kicker && <Kicker color={dark ? "#fff" : undefined}>{kicker}</Kicker>}
        {(items ?? []).map((c, i) => (
          <CardView key={i} c={c} at={c.at} fallback={from + i * 0.7} dark={dark} l={l} s={s} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function CardView({ c, at, fallback, dark, l, s }: { c: CardItem; at?: At; fallback: number; dark: boolean; l: ReturnType<typeof useLook>; s: ReturnType<typeof useScene> }) {
  const t0 = useAt(at, fallback);
  if (s.t < t0) return null;
  return (
    <Rise at={t0} distance={80}>
      <div style={{ background: dark ? "rgba(255,255,255,0.08)" : "#fff", border: dark ? "1px solid rgba(255,255,255,0.14)" : undefined, borderRadius: 22 * s.u, padding: 30 * s.u, display: "flex", gap: 24 * s.u, boxShadow: dark ? undefined : `0 ${16 * s.u}px ${40 * s.u}px rgba(0,0,0,0.12)` }}>
        {c.image && <Media asset={c.image} style={{ width: 160 * s.u, height: 160 * s.u, borderRadius: 14 * s.u, flex: "none" }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: l.mono, fontSize: 20 * s.u, color: dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)" }}>
            <span>{c.meta}</span>
            {c.tag && <span style={{ background: l.accent, color: l.ink, borderRadius: 99, padding: `${2 * s.u}px ${14 * s.u}px`, fontFamily: l.display, fontWeight: l.displayWeight }}>{c.tag}</span>}
          </div>
          <div style={{ fontFamily: l.display, fontWeight: l.displayWeight, fontSize: 46 * s.u, color: dark ? "#fff" : l.ink, lineHeight: 1.05, marginTop: 8 * s.u }}>{c.title}</div>
          {c.body && <div style={{ fontFamily: l.body, fontSize: 28 * s.u, color: dark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.7)", marginTop: 10 * s.u, lineHeight: 1.3 }}>{c.body}</div>}
        </div>
      </div>
    </Rise>
  );
}

/** A post, as it appeared: name, handle, date and what it said. */
export function Quote({ text, name, handle, date, at, bg = "ink" }: { text: string; name?: string; handle?: string; date?: string; at?: At; bg?: string }) {
  const l = useLook();
  const s = useScene();
  const t0 = useAt(at, 0.2);
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      <AbsoluteFill style={{ justifyContent: "center", padding: 70 * s.u }}>
        <Pop at={t0}>
          <div style={{ background: "#fff", color: "#111", borderRadius: 28 * s.u, padding: 44 * s.u, boxShadow: `0 ${30 * s.u}px ${70 * s.u}px rgba(0,0,0,0.35)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: l.body, fontSize: 26 * s.u, color: "#555" }}>
              <span>
                <b style={{ color: "#111" }}>{name}</b> {handle}
              </span>
              <span>{date}</span>
            </div>
            <div style={{ fontFamily: l.body, fontWeight: 700, fontSize: 52 * s.u, lineHeight: 1.18, marginTop: 20 * s.u }}>“{text}”</div>
          </div>
        </Pop>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Code (or a command) typing itself out in a dark panel. */
export function Code({ code, title, at, cps = 40, bg = "none" }: { code: string; title?: string; at?: At; cps?: number; bg?: string }) {
  const l = useLook();
  const s = useScene();
  const t0 = useAt(at, 0.2);
  return (
    <AbsoluteFill>
      <Background bg={bg} />
      <AbsoluteFill style={{ justifyContent: "center", padding: 60 * s.u }}>
        <Rise at={t0}>
          <div style={{ background: "#0f0f14", border: `2px solid ${l.accent2}`, borderRadius: 18 * s.u, padding: `${26 * s.u}px ${32 * s.u}px`, boxShadow: `0 0 ${40 * s.u}px ${l.accent2}55` }}>
            {title && <div style={{ fontFamily: l.mono, fontSize: 20 * s.u, color: l.accent, marginBottom: 12 * s.u, letterSpacing: "0.1em" }}>{title}</div>}
            <pre style={{ margin: 0, fontFamily: l.mono, fontSize: 30 * s.u, color: "#e8e8ee", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
              <Typewriter text={code} at={t0 + 0.2} cps={cps} />
            </pre>
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// three.js

export type ThreeContext = {
  THREE: typeof import("three");
  scene: import("three").Scene;
  camera: import("three").PerspectiveCamera;
  renderer: import("three").WebGLRenderer;
  width: number;
  height: number;
  /** URL of a file in the project's code folder (a model in files/). */
  file: (path: string) => string;
  /** Where a point or object is on the frame, 0..1 from the top left: for labels that follow parts of the model. */
  toScreen: (target: import("three").Object3D | import("three").Vector3) => { x: number; y: number };
  /**
   * Points the camera at an object so all of it fits the frame (whatever its shape), from a direction (default: front,
   * a little above and to the side). `margin` 1.15 leaves a little room; more for things that will move apart.
   */
  fit: (target: import("three").Object3D, opts?: { margin?: number; from?: [number, number, number] }) => void;
};

/**
 * A three.js canvas that draws one exact picture per frame, so it plays in the studio and renders the same. `setup`
 * builds the scene once (loading models is fine: it's waited for); `draw` poses it for time `t` (seconds into the shot)
 * and may return labels to pin on parts (points from ctx.toScreen), drawn as callouts over the canvas.
 */
export function ThreeCanvas<S>({
  setup,
  draw,
  style,
  background,
}: {
  setup: (ctx: ThreeContext) => S | Promise<S>;
  draw: (state: S, t: number, ctx: ThreeContext) => void | CalloutPoint[];
  style?: CSSProperties;
  background?: string;
}) {
  const s = useScene();
  const holder = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<{ state: S; ctx: ThreeContext } | null>(null);
  const [error, setError] = useState("");
  const rendering = getRemotionEnvironment().isRendering;
  const [handle] = useState(() => (rendering ? delayRender("Setting up a three.js scene", { timeoutInMilliseconds: 60_000 }) : null));
  const held = useRef(handle !== null);
  const release = () => {
    if (held.current) continueRender(handle!);
    held.current = false;
  };
  // Each mount gets its own canvas and gives its WebGL context back when it goes: a shot unmounts whenever the playhead
  // leaves it, and browsers drop the oldest contexts (drawing black) once a page holds too many.
  useEffect(() => {
    let gone = false;
    let renderer: import("three").WebGLRenderer | undefined;
    const el = document.createElement("canvas");
    el.width = s.width;
    el.height = s.height;
    el.style.width = "100%";
    el.style.height = "100%";
    holder.current!.appendChild(el);
    void (async () => {
      try {
        const THREE = await import("three");
        if (gone) return;
        renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, alpha: !background, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(s.width, s.height, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const scene = new THREE.Scene();
        if (background) scene.background = new THREE.Color(background);
        const camera = new THREE.PerspectiveCamera(35, s.width / s.height, 0.1, 1000);
        camera.position.set(0, 0, 10);
        const toScreen = (target: import("three").Object3D | import("three").Vector3) => {
          const v = target instanceof THREE.Vector3 ? target.clone() : new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3());
          camera.updateMatrixWorld();
          v.project(camera);
          return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
        };
        const fit: ThreeContext["fit"] = (target, opts = {}) => {
          const sphere = new THREE.Box3().setFromObject(target).getBoundingSphere(new THREE.Sphere());
          const vfov = (camera.fov * Math.PI) / 180;
          const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
          const dist = (sphere.radius * (opts.margin ?? 1.15)) / Math.sin(Math.min(vfov, hfov) / 2);
          const dir = new THREE.Vector3(...(opts.from ?? [0.55, 0.35, 1])).normalize();
          camera.position.copy(sphere.center).addScaledVector(dir, dist);
          camera.near = Math.max(0.01, dist / 100);
          camera.far = dist * 10;
          camera.updateProjectionMatrix();
          camera.lookAt(sphere.center);
        };
        const ctx: ThreeContext = { THREE, scene, camera, renderer, width: s.width, height: s.height, file: s.file, toScreen, fit };
        const state = await setup(ctx);
        if (!gone) setReady({ state, ctx });
      } catch (err) {
        if (!gone) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      gone = true;
      release();
      renderer?.dispose();
      renderer?.forceContextLoss();
      el.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Posed while rendering (it depends only on t), so labels from it are drawn in the same frame as the picture.
  const labels = ready ? (draw(ready.state, s.t, ready.ctx) ?? []) : [];
  // The render is held until the first picture (or the error) is committed, not just until setup resolves: Remotion
  // can capture the frame as soon as the hold goes, before React has drawn anything, leaving an empty canvas.
  useLayoutEffect(() => {
    if (ready) ready.ctx.renderer.render(ready.ctx.scene, ready.ctx.camera);
    if (ready || error) release();
  }, [ready, error, s.frame]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AbsoluteFill style={style}>
      <div ref={holder} style={{ position: "absolute", inset: 0 }} />
      {labels.length > 0 && <Callouts points={labels} />}
      {error && <div style={{ position: "absolute", left: 40, top: 40, right: 40, color: "#ff8a80", fontFamily: "monospace", fontSize: 28 * s.u }}>three.js: {error}</div>}
    </AbsoluteFill>
  );
}

/** Light paper-on-dark helpers for scenes that want text to read on any picture. */
export const readable = (bgColor: string) => (isLight(bgColor) ? "#141414" : "#ffffff");
