/**
 * Smart Prep for the Make Creation Screen: takes a short natural-language description of what the person wants to make,
 * asks the configured agent's fast model (with a fast deterministic fallback if unavailable) for the best model, route,
 * ingredient mode, prompt and optional multi-step cheap-first workflow, and returns a validated draft ready to open
 * directly in the Creation Screen.
 */
import {
  aspectOf,
  CATALOG,
  castOf,
  chooseModels,
  PREVIS_BY_ID,
  PREVIS_MOVES,
  realPeople,
  resolveTimeline,
  type MakeOp,
  type Quality,
} from "@beatsheet/schema";
import { quickAsk } from "./agent/fast.ts";
import { connectedStates, preferredProvider, type AudioRefAsk } from "./make.ts";
import { loadProject } from "./store.ts";

export type MakeInputMode = "text" | "board" | "refs" | "blockout" | "drive" | "speech";

export type MakeDraft = {
  op: MakeOp;
  quality: Quality;
  model?: string;
  via?: string;
  inputMode: MakeInputMode;
  prompt: string;
  start?: string;
  end?: string;
  refs?: string[];
  useBlockout?: boolean;
  blockoutMode?: "video" | "sheet";
  blockoutPreset?: string;
  drive?: { asset: string; from: number; to?: number };
  speech?: boolean;
  speechDub?: boolean;
  audioRefs?: AudioRefAsk[];
  seconds?: number;
  aspect?: string;
  count: number;
  shot?: string;
};

export type MakePlanStep = {
  label: string;
  detail: string;
  costHint?: string;
  draft: MakeDraft;
};

export type MakePlan = {
  rationale: string;
  draft: MakeDraft;
  steps?: MakePlanStep[];
  by?: { agent: string; model?: string };
};

const SYSTEM = `You are a concise, practical video-production assistant for beatsheet's Make Creation Screen.
Given what the person wants to make plus the project's connected models, cast, and shot context, pick the best workflow and pre-fill the creation screen.

Rules:
- Cheap before expensive: when the person asks for a video (especially Seedance, Kling, or a camera-blocked shot) and there is NO board/start still yet, recommend a multi-step plan in "steps":
  Step 1: Board still (op: "image", cheap still model) to settle look/cast/framing first.
  Step 2 (only if a specific camera move like orbit, dolly-zoom, crane, whip-pan, bullet-time, tracking shot is asked for): 3D blockout (still using op: "video", inputMode: "blockout", blockoutPreset: "<presetId>") OR jump straight to video if no special camera move is needed.
  Final step: The video clip (op: "video") using the best ready video model.
  Put Step 1 as the top-level "draft" when a board should be settled first, or put the video draft directly if a board already exists or the person explicitly asked for a still/text-to-video.
- Pick ONLY model ids and route ("via") values listed as READY in the context. Never invent ids.
- Respect real people: if a character is marked realPerson: true, never pick a model/route marked refusesRealPeople unless that route explicitly allows real people (e.g. seedance-2.5 on tein).
- Choose inputMode matching the model's capabilities:
  - For op "image": "refs" if cast/refs are used, else "text".
  - For op "video":
    - "blockout" if using a 3D camera blockout (magi-2 / seedance-2.5 for video mode, or wan-3 / minimax-h3 / happyhorse-1.1 for sheet mode).
    - "drive" if copying movement from an existing footage clip (scail-2 / wan-2.2-animate / kling-motion-control).
    - "speech" if lip-syncing dialogue lines (minimax-h3-lipsync / kling-avatar / sync-3 / etc.).
    - "board" if starting from a still board (default for most video shots).
    - "refs" if animating from reference pictures (or multimodal reference audio: music beat, voiced lines, character voice timbre, or an audio clip — supported on magi-2, seedance-2.5, wan-3, and minimax-h3 on Runway) without a locked start frame.
    - "text" only if generating video from words alone.
- Keep @cast mentions (like @cat) in prompts when referencing cast members.
- Reply ONLY with a single valid JSON object (no markdown fences, no commentary) matching:
{
  "rationale": "1-2 sentences explaining why this model and workflow fit.",
  "draft": {
    "op": "image" | "video",
    "quality": "rough" | "final",
    "model": "<ready model id or omit for Auto>",
    "via": "<ready route id or omit>",
    "inputMode": "text" | "board" | "refs" | "blockout" | "drive" | "speech",
    "prompt": "clean, model-ready prompt",
    "blockoutPreset": "<PREVIS_MOVES id if camera move fits>",
    "blockoutMode": "video" | "sheet",
    "seconds": 5,
    "count": 2
  },
  "steps": [
    { "label": "1. Settle board still", "detail": "Generate framing & cast look cheaply first", "costHint": "~$0.04", "draft": { ... } },
    { "label": "2. Animate clip", "detail": "Bring board to life with ...", "costHint": "~$0.80", "draft": { ... } }
  ]
}`;

/** Extracts the first JSON object from an LLM response (tolerating accidental code fences). */
export function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Deterministic fallback plan when no fast agent CLI is available or an LLM call fails. */
export function heuristicMakePlan(projectId: string, opts: { cut?: string; shot?: string; intent: string }): MakePlan {
  const { project } = loadProject(projectId, opts.cut);
  const shot = opts.shot ? project.shots.find((s) => s.id === opts.shot) : undefined;
  const format = project.formats[0]!;
  const aspect = aspectOf(format.width, format.height);
  const tl = resolveTimeline(project, format.id);
  const span = shot ? tl.shots.find((s) => s.id === shot.id) : undefined;
  const shotSeconds = span && Number.isFinite(span.end - span.start) ? Math.max(2, Math.min(15, Math.round(span.end - span.start))) : undefined;
  const c = shot?.content.kind === "generated" ? shot.content : undefined;
  const isImg = (id: string | undefined) => !!id && project.assets.find((a) => a.id === id)?.kind === "image";
  const board = c ? (isImg(c.take) ? c.take : isImg(c.start) ? c.start : c.refs?.find(isImg) ?? [...(c.takes ?? [])].reverse().find(isImg)) : undefined;

  const text = opts.intent.trim();
  const lower = text.toLowerCase();
  const states = connectedStates();
  const imgChoices = chooseModels(CATALOG, { op: "image", prompt: text, aspect }, states, [], preferredProvider("image", states));
  const vidChoices = chooseModels(CATALOG, { op: "video", prompt: text, quality: "rough", seconds: shotSeconds ?? 5, aspect }, states, [], preferredProvider("video", states));

  const wantsStill = /\b(still|board|photo|picture|portrait|frame|image|illustration)\b/i.test(lower) && !/\b(clip|video|animate|orbit|pan|dolly|crane|zoom|talking|lip[- ]?sync|motion)\b/i.test(lower);
  const wantsSpeech = /\b(lip[- ]?sync|speak|say(?:ing)?|talk(?:ing)?|dialogue|line)\b/i.test(lower);
  const wantsDrive = /\b(copy movement|motion copy|fight|dance|stunt|act(?:ed|ing) out|phone clip)\b/i.test(lower);
  const preset = PREVIS_MOVES.find((m) => lower.includes(m.id.replace(/-/g, " ")) || lower.includes(m.label.toLowerCase().split(" (")[0]!));
  const wantsBlockout = !!shot?.blockout || !!preset || /\b(blockout|camera move|orbit|dolly|crane|whip pan|bullet[- ]?time|steadicam|snorricam)\b/i.test(lower);
  const secMatch = /\b(\d{1,2})\s*(?:s|sec|seconds?)\b/i.exec(text);
  const seconds = secMatch ? Math.max(2, Math.min(30, Number(secMatch[1]))) : (shotSeconds ?? 5);

  const imgModel = imgChoices.auto;
  const stillDraft: MakeDraft = {
    op: "image",
    quality: "rough",
    model: imgModel?.model,
    via: imgModel?.route,
    inputMode: castOf(text, project.cast).length ? "refs" : "text",
    prompt: text,
    aspect,
    count: 2,
    ...(shot ? { shot: shot.id } : {}),
  };

  if (wantsStill) {
    return {
      rationale: `Start with 2 stills${imgModel ? ` using ${imgModel.label} on ${imgModel.where}` : ""} to lock in framing and look.`,
      draft: stillDraft,
    };
  }

  const videoInputMode: MakeInputMode = wantsSpeech ? "speech" : wantsDrive ? "drive" : wantsBlockout ? "blockout" : board ? "board" : "board";
  const uses = castOf(text, project.cast);
  const people = realPeople(uses, project.assets);
  const camReq =
    videoInputMode === "blockout"
      ? chooseModels(
          CATALOG,
          {
            op: "video",
            prompt: text,
            quality: "rough",
            seconds,
            aspect,
            realPeople: people.length ? people : undefined,
            camera: { cut: project.cut.id, format: format.id, from: 0, to: seconds, mode: "video" },
          },
          states,
          [],
          preferredProvider("video", states),
        ).auto
      : undefined;
  const vidModel = camReq ?? vidChoices.auto;
  const videoDraft: MakeDraft = {
    op: "video",
    quality: "rough",
    model: vidModel?.model,
    via: vidModel?.route,
    inputMode: videoInputMode,
    prompt: text,
    ...(board && videoInputMode !== "blockout" ? { start: board } : {}),
    ...(board && videoInputMode === "blockout" ? { refs: [board] } : {}),
    ...(videoInputMode === "blockout" ? { useBlockout: true, blockoutMode: camReq ? "video" : "sheet", blockoutPreset: preset?.id ?? "orbit" } : {}),
    ...(videoInputMode === "speech" ? { speech: true } : {}),
    seconds,
    aspect,
    count: 1,
    ...(shot ? { shot: shot.id } : {}),
  };

  if (!board) {
    const imgCost = imgModel?.usd !== undefined ? (imgModel.usd === 0 ? "free on plan" : `~$${(imgModel.usd * 2).toFixed(2)}`) : undefined;
    const vidCost = vidModel?.usd !== undefined ? (vidModel.usd === 0 ? "free" : `~$${vidModel.usd.toFixed(2)}`) : undefined;
    const steps: MakePlanStep[] = [
      { label: "1. Settle board still", detail: "Generate a cheap still first to nail framing, lighting and cast likeness.", costHint: imgCost, draft: stillDraft },
      {
        label: videoInputMode === "blockout" ? `2. Blockout (${preset?.label ?? "camera move"}) + animate` : "2. Animate clip",
        detail: `Animate from your chosen board${vidModel ? ` with ${vidModel.label}` : ""}.`,
        costHint: vidCost,
        draft: videoDraft,
      },
    ];
    return {
      rationale: `Settling a cheap board still before spending video tokens avoids wasted clips${videoInputMode === "blockout" ? " — then pair it with a 3D blockout to lock the camera move" : ""}.`,
      draft: stillDraft,
      steps,
    };
  }

  return {
    rationale: `Using your shot's settled board${videoInputMode === "blockout" ? " with a camera blockout" : ""}${vidModel ? ` on ${vidModel.label}` : ""}.`,
    draft: videoDraft,
  };
}

/** Runs the fast lightweight agent to plan a Make creation, falling back to heuristics cleanly on any error. */
export async function prepareMake(projectId: string, opts: { cut?: string; shot?: string; intent: string }): Promise<MakePlan> {
  const fallback = heuristicMakePlan(projectId, opts);
  const { project } = loadProject(projectId, opts.cut);
  const shot = opts.shot ? project.shots.find((s) => s.id === opts.shot) : undefined;
  const format = project.formats[0]!;
  const aspect = aspectOf(format.width, format.height);
  const states = connectedStates();
  const readyModels = CATALOG.flatMap((m) => {
    const routes = m.routes.filter((r) => states[r.via]?.state === "ready" && !states[r.via]?.endpoints?.[Object.values(r.endpoints)[0] ?? ""]);
    if (!routes.length) return [];
    return [
      {
        id: m.id,
        label: m.label,
        ops: m.ops,
        tier: m.tier,
        takes: m.takes,
        sound: !!m.sound,
        refusesRealPeople: !!m.refusesRealPeople,
        routes: routes.map((r) => ({ via: r.via, realPeople: !!r.realPeople, price: r.price })),
      },
    ];
  });
  const cast = (project.cast ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    name: m.name,
    realPerson: m.kind === "character" && !!(m.seen?.length),
  }));
  const c = shot?.content.kind === "generated" ? shot.content : undefined;
  const isImg = (id: string | undefined) => !!id && project.assets.find((a) => a.id === id)?.kind === "image";
  const board = c ? (isImg(c.take) ? c.take : isImg(c.start) ? c.start : c.refs?.find(isImg) ?? [...(c.takes ?? [])].reverse().find(isImg)) : undefined;
  const context = {
    intent: opts.intent,
    aspect,
    targetShot: shot
      ? {
          id: shot.id,
          label: shot.label,
          fidelity: shot.fidelity,
          hasBoard: !!board,
          boardAsset: board,
          hasBlockout: !!shot.blockout,
          existingPrompt: c?.prompt ?? (shot.content.kind === "placeholder" ? shot.content.description : undefined),
        }
      : null,
    cast,
    readyModels,
    previsPresets: PREVIS_MOVES.map((m) => m.id),
  };

  try {
    const res = await quickAsk({ system: SYSTEM, prompt: JSON.stringify(context), timeoutMs: 25_000 });
    const parsed = parseJsonObject(res.text);
    if (!parsed || typeof parsed.draft !== "object" || !parsed.draft) return fallback;
    const readyIds = new Set(readyModels.map((m) => m.id));
    const sanitizeDraft = (raw: Record<string, unknown>, base: MakeDraft): MakeDraft => {
      const op: MakeOp = raw.op === "image" || raw.op === "video" ? raw.op : base.op;
      const quality: Quality = raw.quality === "final" ? "final" : "rough";
      const model = typeof raw.model === "string" && readyIds.has(raw.model) ? raw.model : undefined;
      const validRoute = model && typeof raw.via === "string" && readyModels.find((m) => m.id === model)?.routes.some((r) => r.via === raw.via) ? raw.via : undefined;
      const allowedModes: MakeInputMode[] = ["text", "board", "refs", "blockout", "drive", "speech"];
      const inputMode: MakeInputMode = typeof raw.inputMode === "string" && allowedModes.includes(raw.inputMode as MakeInputMode) ? (raw.inputMode as MakeInputMode) : base.inputMode;
      const blockoutPreset = typeof raw.blockoutPreset === "string" && PREVIS_BY_ID.has(raw.blockoutPreset) ? raw.blockoutPreset : base.blockoutPreset;
      const seconds = typeof raw.seconds === "number" && Number.isFinite(raw.seconds) ? Math.max(2, Math.min(30, Math.round(raw.seconds))) : base.seconds;
      const count = typeof raw.count === "number" && Number.isFinite(raw.count) ? Math.max(1, Math.min(4, Math.round(raw.count))) : base.count;
      return {
        op,
        quality,
        ...(model ? { model } : {}),
        ...(validRoute ? { via: validRoute } : {}),
        inputMode,
        prompt: typeof raw.prompt === "string" && raw.prompt.trim() ? raw.prompt.trim() : opts.intent.trim(),
        ...(op === "video" && board && inputMode !== "blockout" ? { start: board } : {}),
        ...(op === "video" && board && inputMode === "blockout" ? { refs: [board] } : {}),
        ...(inputMode === "blockout" ? { useBlockout: true, blockoutMode: raw.blockoutMode === "sheet" ? "sheet" : "video", ...(blockoutPreset ? { blockoutPreset } : {}) } : {}),
        ...(inputMode === "speech" ? { speech: true } : {}),
        ...(op === "video" && seconds ? { seconds } : {}),
        aspect,
        count,
        ...(shot ? { shot: shot.id } : {}),
      };
    };
    const draft = sanitizeDraft(parsed.draft as Record<string, unknown>, fallback.draft);
    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : undefined;
    const steps = rawSteps
      ?.flatMap((s): MakePlanStep[] => {
        if (!s || typeof s !== "object") return [];
        const obj = s as Record<string, unknown>;
        if (typeof obj.label !== "string" || !obj.draft || typeof obj.draft !== "object") return [];
        return [
          {
            label: obj.label,
            detail: typeof obj.detail === "string" ? obj.detail : "",
            ...(typeof obj.costHint === "string" ? { costHint: obj.costHint } : {}),
            draft: sanitizeDraft(obj.draft as Record<string, unknown>, draft),
          },
        ];
      })
      .slice(0, 4);
    return {
      rationale: typeof parsed.rationale === "string" && parsed.rationale.trim() ? parsed.rationale.trim() : fallback.rationale,
      draft,
      ...(steps && steps.length >= 2 ? { steps } : {}),
      by: { agent: res.agent, model: res.model },
    };
  } catch {
    return fallback;
  }
}
