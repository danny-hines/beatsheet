import { useEffect, useRef } from "react";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function sizeCanvas(canvas: HTMLCanvasElement, dpr: number) {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/**
 * Small illuminated constellation orb in the Agent header: drifts calmly while idle, accelerates and brightens
 * smoothly while the agent is working, and flashes warm chinagraph gold on hand-off to your turn.
 */
export function AgentOrb({ working, pulseKey = 0, handoffKey = 0 }: { working: boolean; pulseKey?: number; handoffKey?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ working, workLevel: working ? 1 : 0, flash: 0, lastPulse: pulseKey, lastHandoff: handoffKey });
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const s = state.current;
    s.working = working;
    if (pulseKey !== s.lastPulse) {
      s.lastPulse = pulseKey;
      s.flash = Math.max(s.flash, 0.45);
    }
    if (handoffKey !== s.lastHandoff) {
      s.lastHandoff = handoffKey;
      s.flash = 1;
    }
    redrawRef.current();
  }, [working, pulseKey, handoffKey]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = reducedMotion();

    const draw = (t: number, wl: number, flash: number) => {
      const sized = sizeCanvas(canvas, dpr);
      if (!sized) return;
      const { ctx, w, h } = sized;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const speed = 0.24 + wl * 1.45;
      const n = 7;
      const pts: { x: number; y: number; gold: boolean }[] = [];
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + t * speed + i * 0.2;
        const rad = 5.4 + wl * 2.3 + Math.sin(t * (1.2 + wl * 2) + i) * (0.75 + wl * 1.05);
        pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, gold: i === 0 || i === 4 });
      }
      ctx.lineWidth = 0.8;
      for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 2) % n]!;
        ctx.strokeStyle = flash > 0.2 ? `rgba(255, 203, 61, ${0.3 + flash * 0.5})` : `rgba(141, 184, 232, ${0.22 + wl * 0.44})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.gold ? 1.65 : 1.25, 0, Math.PI * 2);
        ctx.fillStyle = p.gold || flash > 0.35 ? "#ffcb3d" : "#8db8e8";
        ctx.globalAlpha = 0.56 + wl * 0.44;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    if (reduced) {
      const drawStatic = () => draw(1.2, state.current.working ? 1 : 0, 0);
      redrawRef.current = drawStatic;
      drawStatic();
      return;
    }

    redrawRef.current = () => {};
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const s = state.current;
      s.workLevel += ((s.working ? 1 : 0) - s.workLevel) * Math.min(1, dt * 3.4);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt * 1.25);
      draw(now / 1000, s.workLevel, s.flash);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span className="agent-orb" aria-hidden>
      <canvas ref={ref} />
    </span>
  );
}

/**
 * Cue-Sheet Dot Matrix working-state background (Study D): a fine perforated dot-matrix field fades in around the
 * Agent panel perimeter with a calm agent-blue interference wave while working, blooms a subtle radial ripple on tool
 * calls, washes warm chinagraph gold on hand-off, and stops its render loop completely once settled idle (0% idle CPU).
 */
export function AgentWorkField({ working, pulseKey = 0, handoffKey = 0 }: { working: boolean; pulseKey?: number; handoffKey?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    working,
    workLevel: working ? 1 : 0,
    toolPulse: 0,
    handoffFlash: 0,
    lastPulse: pulseKey,
    lastHandoff: handoffKey,
    running: false,
  });
  const startRef = useRef<() => void>(() => {});

  useEffect(() => {
    const s = state.current;
    s.working = working;
    if (pulseKey !== s.lastPulse) {
      s.lastPulse = pulseKey;
      s.toolPulse = 1;
    }
    if (handoffKey !== s.lastHandoff) {
      s.lastHandoff = handoffKey;
      s.handoffFlash = 1;
    }
    startRef.current();
  }, [working, pulseKey, handoffKey]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = reducedMotion();

    const draw = (t: number) => {
      const sized = sizeCanvas(canvas, dpr);
      if (!sized) return;
      const { ctx, w, h } = sized;
      ctx.clearRect(0, 0, w, h);
      const s = state.current;
      const wl = s.workLevel;
      const fl = s.handoffFlash;
      const tp = s.toolPulse;
      if (wl < 0.004 && fl < 0.004 && tp < 0.004) return;

      const pitch = 14;
      const alpha = wl + fl * 0.85;
      const ripR = (1 - tp) * Math.max(w, h) * 0.9;
      for (let y = 44; y < h - 8; y += pitch) {
        for (let x = 10; x < w - 6; x += pitch) {
          const nx = x / w;
          const ny = y / h;
          // Weight luminance toward perimeter & top/bottom so the center transcript remains crisp and calm.
          const edgeBias = 0.24 + 0.76 * Math.max(Math.abs(nx - 0.5) * 1.4, Math.abs(ny - 0.48) * 1.3);
          const wave = Math.sin(x * 0.024 + y * 0.018 - t * 2.0) * 0.5 + 0.5;
          let boost = 0;
          if (tp > 0.01) {
            const d = Math.hypot(x - w * 0.34, y - h * 0.36);
            boost = Math.max(0, 1 - Math.abs(d - ripR) / 38) * tp;
          }
          const dotA = Math.min(0.8, (0.035 + wave * 0.21 * edgeBias + boost * 0.52) * alpha);
          if (dotA < 0.018) continue;
          ctx.fillStyle =
            fl > 0.28 && ny > 0.48
              ? `rgba(255, 203, 61, ${dotA * 1.25})`
              : boost > 0.25
                ? `rgba(255, 203, 61, ${dotA})`
                : `rgba(141, 184, 232, ${dotA})`;
          const r = 1.0 + wave * 0.5 + boost * 1.05;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    if (reduced) {
      state.current.workLevel = state.current.working ? 1 : 0;
      draw(0);
      startRef.current = () => {
        state.current.workLevel = state.current.working ? 1 : 0;
        draw(0);
      };
      return;
    }

    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const s = state.current;
      s.workLevel += ((s.working ? 1 : 0) - s.workLevel) * Math.min(1, dt * 3.2);
      if (s.handoffFlash > 0) s.handoffFlash = Math.max(0, s.handoffFlash - dt * 1.15);
      if (s.toolPulse > 0) s.toolPulse = Math.max(0, s.toolPulse - dt * 1.05);
      draw(now / 1000);
      if (!s.working && s.workLevel < 0.004 && s.handoffFlash < 0.004 && s.toolPulse < 0.004) {
        s.workLevel = 0;
        s.handoffFlash = 0;
        s.toolPulse = 0;
        draw(now / 1000);
        s.running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      const s = state.current;
      if (s.running) return;
      if (!s.working && s.workLevel < 0.004 && s.handoffFlash < 0.004 && s.toolPulse < 0.004) return;
      s.running = true;
      prev = performance.now();
      raf = requestAnimationFrame(tick);
    };
    startRef.current = start;
    start();

    const ro = new ResizeObserver(() => {
      if (!state.current.running) draw(performance.now() / 1000);
    });
    ro.observe(canvas);
    return () => {
      state.current.running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="agent-fx-layer" aria-hidden />;
}
