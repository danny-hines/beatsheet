/**
 * Single-WebGL-context thumbnail & hover-animation previewer for `PREVIS_MOVES` presets.
 *
 * Uses one lazy offscreen `THREE.WebGLRenderer` to snap 1:1 resting posters into an in-memory cache and drive a
 * smooth 60fps 2D-canvas blit on whichever preset card is currently hovered or focused — avoiding browser WebGL
 * context limits (~8–16 per page) and automatically releasing the GPU context shortly after idle.
 */
import { PREVIS_BY_ID, previsThumbAt, type PrevisLook } from "@beatsheet/schema";
import { populatePrevisScene, posePrevisScene, type ThreeMod } from "./kit/previsScene.ts";

const PREVIEW_SIZE = 240;
const IDLE_RELEASE_MS = 2500;

type SharedGL = {
  THREE: ThreeMod;
  renderer: import("three").WebGLRenderer;
  canvas: HTMLCanvasElement;
  camera: import("three").PerspectiveCamera;
  textures: Map<string, import("three").CanvasTexture>;
};

const posterCache = new Map<string, string>();
let shared: SharedGL | null = null;
let initPromise: Promise<SharedGL | null> | null = null;
let activeUsers = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function disposeSharedGL() {
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
  const gl = shared;
  shared = null;
  initPromise = null;
  if (!gl) return;
  for (const tex of gl.textures.values()) tex.dispose();
  gl.textures.clear();
  gl.renderer.dispose();
  gl.renderer.forceContextLoss();
}

function retainGL() {
  activeUsers++;
  if (idleTimer !== undefined) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
}

function releaseGL() {
  activeUsers = Math.max(0, activeUsers - 1);
  if (activeUsers === 0 && shared && idleTimer === undefined) {
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      if (activeUsers === 0) disposeSharedGL();
    }, IDLE_RELEASE_MS);
  }
}

async function ensureGL(): Promise<SharedGL | null> {
  if (shared) return shared;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const THREE = await import("three");
      const canvas = document.createElement("canvas");
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
      renderer.setPixelRatio(1);
      renderer.setSize(PREVIEW_SIZE, PREVIEW_SIZE, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
      const gl: SharedGL = { THREE, renderer, canvas, camera, textures: new Map() };
      canvas.addEventListener(
        "webglcontextlost",
        () => {
          if (shared === gl) {
            shared = null;
            initPromise = null;
          }
        },
        { once: true },
      );
      shared = gl;
      return gl;
    } catch {
      initPromise = null;
      return null;
    }
  })();
  return initPromise;
}

function encodeFrame(canvas: HTMLCanvasElement): string {
  const webp = canvas.toDataURL("image/webp", 0.84);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

function renderOnePoster(gl: SharedGL, moveId: string, look: PrevisLook = "pills"): string | undefined {
  const preset = PREVIS_BY_ID.get(moveId);
  if (!preset) return undefined;
  const scene = new gl.THREE.Scene();
  const rig = populatePrevisScene(gl.THREE, scene, {
    set: preset.defaultSet,
    look,
    subjects: preset.defaultSubjects,
    textureCache: gl.textures,
  });
  try {
    posePrevisScene(gl.camera, rig.nodes, preset.id, previsThumbAt(preset));
    gl.renderer.render(scene, gl.camera);
    const url = encodeFrame(gl.canvas);
    posterCache.set(moveId, url);
    return url;
  } finally {
    rig.dispose();
  }
}

/** Synchronously returns a cached 1:1 poster data URL for a preset, if already rendered this session. */
export function getCachedPrevisPoster(moveId: string): string | undefined {
  return posterCache.get(moveId);
}

/** Renders (or returns from cache) a single preset's 1:1 resting thumbnail using the shared WebGL context. */
export async function renderPrevisPoster(moveId: string): Promise<string | undefined> {
  const cached = posterCache.get(moveId);
  if (cached) return cached;
  retainGL();
  try {
    const gl = await ensureGL();
    if (!gl) return undefined;
    return posterCache.get(moveId) ?? renderOnePoster(gl, moveId);
  } finally {
    releaseGL();
  }
}

/**
 * Renders uncached 1:1 preset posters in small animation-frame chunks so opening a full 26-card gallery stays responsive
 * and fills smoothly within a few frames.
 */
export async function renderPrevisPosters(
  moveIds: string[],
  onEach?: (id: string, url: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const missing: string[] = [];
  for (const id of moveIds) {
    const cached = posterCache.get(id);
    if (cached) onEach?.(id, cached);
    else missing.push(id);
  }
  if (!missing.length || signal?.aborted) return;

  retainGL();
  try {
    const gl = await ensureGL();
    if (!gl || signal?.aborted) return;
    const perFrame = 4;
    for (let i = 0; i < missing.length; i += perFrame) {
      if (signal?.aborted) return;
      const chunk = missing.slice(i, i + perFrame);
      for (const id of chunk) {
        if (signal?.aborted) return;
        const url = posterCache.get(id) ?? renderOnePoster(gl, id);
        if (url) onEach?.(id, url);
      }
      if (i + perFrame < missing.length) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
  } finally {
    releaseGL();
  }
}

/**
 * Animates a preset's 3D blockout directly into a 1:1 target `<canvas>` (via 2D drawImage blit from the single shared
 * WebGL renderer). Non-seamless moves include a short hold at start and end so the opening and closing framing read
 * clearly. Returns a stop function that cleans up GPU geometry and stops the RAF loop.
 */
export function startPrevisHoverLoop(
  moveId: string,
  target: HTMLCanvasElement,
  onProgress?: (u: number) => void,
): () => void {
  const preset = PREVIS_BY_ID.get(moveId);
  if (!preset) return () => {};

  let stopped = false;
  let rafId = 0;
  let cleanupRig: (() => void) | undefined;
  retainGL();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    cleanupRig?.();
    cleanupRig = undefined;
    releaseGL();
  };

  void ensureGL().then((gl) => {
    if (stopped || !gl) return;
    if (target.width !== PREVIEW_SIZE || target.height !== PREVIEW_SIZE) {
      target.width = PREVIEW_SIZE;
      target.height = PREVIEW_SIZE;
    }
    const ctx2d = target.getContext("2d");
    if (!ctx2d) return;

    const scene = new gl.THREE.Scene();
    const rig = populatePrevisScene(gl.THREE, scene, {
      set: preset.defaultSet,
      look: "pills",
      subjects: preset.defaultSubjects,
      textureCache: gl.textures,
    });
    cleanupRig = rig.dispose;

    const startHold = preset.seamlessLoop ? 0 : 260;
    const moveDur = preset.seamlessLoop ? 2800 : 2350;
    const endHold = preset.seamlessLoop ? 0 : 490;
    const cycle = startHold + moveDur + endHold;
    const t0 = performance.now();

    const draw = (now: number) => {
      if (stopped) return;
      // If context was lost mid-hover, stop gracefully so the resting poster remains visible.
      if (shared !== gl) {
        stop();
        return;
      }
      const elapsed = (now - t0) % cycle;
      const u = elapsed <= startHold ? 0 : elapsed >= startHold + moveDur ? 1 : (elapsed - startHold) / moveDur;
      posePrevisScene(gl.camera, rig.nodes, preset.id, u);
      gl.renderer.render(scene, gl.camera);
      ctx2d.drawImage(gl.canvas, 0, 0, target.width, target.height);
      onProgress?.(u);
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
  });

  return stop;
}
