/**
 * Making new footage: what a request asks for, the models that could make it, and for each one whether it can and,
 * if not, why. Pure, so the studio's picker, the engine and the agent's tools all give the same answer. The models
 * themselves are in catalog.ts; the engine knows which services are connected and runs the jobs.
 */
import { resolveTimeline } from "./resolve.ts";
import type { CastMember, Project } from "./types.ts";

/** What can be asked for. More join as they're wired up: extend, edit-video, swap, lipsync, restore, isolate. */
export const MAKE_OPS = ["image", "video"] as const;
export type MakeOp = (typeof MAKE_OPS)[number];

/** The shape of a request a service has its own endpoint for. */
export type RequestShape = "text" | "start" | "refs";

/** One place a model runs, and what it costs there. */
export type ModelRoute = {
  /** The service, by its id in the engine's services list: "fal". */
  via: string;
  /** Which of the engine's adapters turns a request into this service's inputs ("kling", "wan", "nano-banana"). */
  shape: string;
  /** The service's own id for each shape of request it takes. */
  endpoints: Partial<Record<RequestShape, string>>;
  /** In US dollars, from the service's own page. Estimates, not quotes. */
  price: { perImage?: number; perSecond?: number };
};

export type CatalogModel = {
  id: string;
  label: string;
  /** Who made it. */
  by: string;
  /** One line on what it's good for. */
  note: string;
  ops: MakeOp[];
  /** For video: whether it's for roughs (fast and cheap, to judge the cut) or finals (the best there is). */
  tier?: Quality;
  /** What it can be given besides a prompt: a picture to start from, one to end on, and how many references. */
  takes: { start?: boolean; end?: boolean; refs?: number };
  /** For video: the lengths it makes, as a list or a range, in seconds. */
  lengths?: number[] | { min: number; max: number };
  /** The aspects it makes ("16:9"), or "any". When it starts from a picture, the picture's shape decides instead. */
  aspects: string[];
  /** Makes its own sound. */
  sound?: boolean;
  /** Roughly how long one take takes, in seconds, for estimates. */
  wait?: number;
  routes: ModelRoute[];
};

/** A video take is a rough (to judge the cut cheaply) or a final (made again with the best model, once the cut holds). */
export type Quality = "rough" | "final";

/** Something to make: the operation, its inputs (asset ids), and what the shot it's for needs. */
export type MakeRequest = {
  op: MakeOp;
  prompt: string;
  /** For video: Auto prefers models of this tier. */
  quality?: Quality;
  start?: string;
  end?: string;
  refs?: string[];
  /** How long it has to play, in seconds (the shot's length). */
  seconds?: number;
  /** The shape it has to fill: "9:16". */
  aspect?: string;
  /** How many takes. */
  count?: number;
};

/** Whether a service can be used now. `label` is its name for people ("fal"). */
export type ServiceState = { label: string } & ({ state: "ready"; balanceUsd?: number } | { state: "missing" } | { state: "failing"; detail: string });

/** Why a model can't make this request, said so the studio and the agent can show it as it is. */
export type Why =
  | { kind: "fit"; reason: string; fix?: "split" | "drop-refs" | "drop-end" | "via-start-frame" }
  | { kind: "connect"; reason: string; services: string[] }
  | { kind: "funds"; reason: string; balanceUsd: number; needUsd: number }
  | { kind: "failing"; reason: string; service: string };

export type FitOk = {
  ok: true;
  model: string;
  label: string;
  route: string;
  /** The service's endpoint for this shape of request. */
  endpoint: string;
  /** The length to ask for: the shot's plus a little either side when the model allows it. */
  seconds?: number;
  /** The aspect to ask for, when the model takes one. */
  aspect?: string;
  /** Estimated cost of all the takes, in US dollars. */
  usd?: number;
  /** Roughly how long, in seconds. */
  wait?: number;
};
export type Fit = FitOk | { ok: false; model: string; label: string; why: Why };

/** Takes are made this much longer at each end, when the model allows, so the shot can be retimed without another. */
export const HANDLE = 0.5;

/** The aspects models are asked for, widest first. */
export const ASPECTS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"] as const;

const ratio = (aspect: string) => {
  const [w, h] = aspect.split(":").map(Number);
  return w && h ? w / h : NaN;
};

/** The standard aspect closest to a width and height: 1080×1920 is 9:16, 1366×768 is 16:9. */
export function aspectOf(width: number, height: number): string {
  const r = width / height;
  return ASPECTS.reduce((best, a) => (Math.abs(Math.log(ratio(a) / r)) < Math.abs(Math.log(ratio(best) / r)) ? a : best), ASPECTS[0]);
}

/** How much of a picture of aspect `made` is left after cropping it to `wanted` (1 when they match). */
const kept = (made: string, wanted: string) => {
  const a = ratio(made), b = ratio(wanted);
  return Math.min(a, b) / Math.max(a, b);
};

/** A crop that keeps less than this of the picture is no longer the shot that was made. */
const MIN_KEPT = 0.6;

const seconds1 = (s: number) => `${Math.round(s * 10) / 10}s`;
const money = (usd: number) => `$${usd < 1 ? usd.toFixed(2) : usd.toFixed(2).replace(/\.00$/, "")}`;
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs.at(-1)}`);

/** Which of a service's endpoints a request needs. */
export const shapeOf = (req: Pick<MakeRequest, "start" | "refs">): RequestShape => (req.refs?.length ? "refs" : req.start ? "start" : "text");

/** The length to ask for, or why it can't be made. */
function lengthFor(model: CatalogModel, wanted: number | undefined): { seconds: number } | { why: Why } {
  const l = model.lengths;
  if (!l) return { why: { kind: "fit", reason: `${model.label} doesn't say what lengths it makes` } };
  const options = Array.isArray(l) ? [...l].sort((a, b) => a - b) : undefined;
  const max = options ? options.at(-1)! : (l as { max: number }).max;
  const min = options ? options[0]! : (l as { min: number }).min;
  if (wanted === undefined || !Number.isFinite(wanted)) return { seconds: options ? options[0]! : Math.min(max, Math.max(min, 5)) };
  if (wanted > max + 1e-6) return { why: { kind: "fit", reason: `Makes up to ${seconds1(max)}; this shot is ${seconds1(wanted)}`, fix: "split" } };
  const padded = wanted + 2 * HANDLE;
  if (options) {
    const bare = options.find((o) => o >= wanted - 1e-6) ?? max;
    const roomy = options.find((o) => o >= padded - 1e-6);
    // The spare either side is worth a little more length (5 seconds rather than 4), not a take twice as long at twice the price.
    return { seconds: roomy !== undefined && roomy <= bare * 1.5 ? roomy : bare };
  }
  return { seconds: Math.round(Math.min(max, Math.max(min, padded)) * 100) / 100 };
}

/** The aspect to ask for, or why it can't be made. */
function aspectFor(model: CatalogModel, wanted: string | undefined): { aspect?: string } | { why: Why } {
  if (model.aspects.includes("any")) return { aspect: wanted };
  if (!wanted) return { aspect: model.aspects[0] };
  if (model.aspects.includes(wanted)) return { aspect: wanted };
  const best = model.aspects.reduce((a, b) => (kept(b, wanted) > kept(a, wanted) ? b : a));
  if (kept(best, wanted) >= MIN_KEPT) return { aspect: best };
  return { why: { kind: "fit", reason: `Makes ${list(model.aspects)}, not ${wanted}` } };
}

/** What a request would cost on a route: per image, or per second of video, times the takes. */
function costOn(route: ModelRoute, op: MakeOp, seconds: number | undefined, count: number): number | undefined {
  const each = op === "image" ? route.price.perImage : route.price.perSecond !== undefined && seconds !== undefined ? route.price.perSecond * seconds : undefined;
  return each === undefined ? undefined : Math.round(each * count * 1000) / 1000;
}

/**
 * Whether `model` can make `req` with the services there are, and if so where, at what length and shape, and for
 * about how much. What the model can't do is checked before what isn't connected: connecting a service won't help a
 * model that can't make the shot.
 */
export function fitModel(model: CatalogModel, req: MakeRequest, services: Record<string, ServiceState>): Fit {
  const no = (why: Why): Fit => ({ ok: false, model: model.id, label: model.label, why });
  const count = Math.max(1, req.count ?? 1);
  if (!model.ops.includes(req.op)) return no({ kind: "fit", reason: `${model.label} doesn't make ${req.op === "image" ? "images" : "video"}` });
  if (req.start && !model.takes.start) return no({ kind: "fit", reason: "Doesn't start from a picture" });
  if (req.end && !req.start) return no({ kind: "fit", reason: "An end frame needs a start frame too", fix: "drop-end" });
  if (req.end && !model.takes.end) return no({ kind: "fit", reason: "Doesn't take an end frame", fix: "drop-end" });
  const refs = req.refs?.length ?? 0;
  const maxRefs = model.takes.refs ?? 0;
  if (refs > maxRefs) {
    if (maxRefs === 0 && model.takes.start && !req.start) return no({ kind: "fit", reason: "Doesn't take references; a start frame made from them would do", fix: "via-start-frame" });
    return no({ kind: "fit", reason: maxRefs ? `Takes up to ${maxRefs} reference${maxRefs === 1 ? "" : "s"}; this has ${refs}` : "Doesn't take references", fix: "drop-refs" });
  }
  let seconds: number | undefined;
  if (req.op === "video") {
    const l = lengthFor(model, req.seconds);
    if ("why" in l) return no(l.why);
    seconds = l.seconds;
  }
  let aspect: string | undefined;
  // A take that starts from a picture comes out the picture's shape.
  if (!req.start) {
    const a = aspectFor(model, req.aspect);
    if ("why" in a) return no(a.why);
    aspect = a.aspect;
  }

  const shape = shapeOf(req);
  const routes = model.routes.filter((r) => r.endpoints[shape]);
  if (!routes.length) return no({ kind: "fit", reason: `Nowhere runs ${model.label} with ${shape === "refs" ? "references" : shape === "start" ? "a start frame" : "only a prompt"}` });
  const state = (r: ModelRoute): ServiceState => services[r.via] ?? { label: r.via, state: "missing" };
  const ready = routes
    .filter((r) => state(r).state === "ready")
    .map((r) => ({ r, usd: costOn(r, req.op, seconds, count), balance: (state(r) as { balanceUsd?: number }).balanceUsd }))
    .sort((a, b) => (a.usd ?? Infinity) - (b.usd ?? Infinity));
  const affordable = ready.find((x) => x.balance === undefined || x.usd === undefined || x.usd <= x.balance);
  if (affordable)
    return { ok: true, model: model.id, label: model.label, route: affordable.r.via, endpoint: affordable.r.endpoints[shape]!, seconds, aspect, usd: affordable.usd, wait: model.wait };
  if (ready.length) {
    const x = ready[0]!;
    return no({ kind: "funds", reason: `${state(x.r).label} has ${money(x.balance!)}; this is about ${money(x.usd!)}`, balanceUsd: x.balance!, needUsd: x.usd! });
  }
  const failing = routes.find((r) => state(r).state === "failing");
  if (failing) {
    const s = state(failing) as { label: string; detail: string };
    return no({ kind: "failing", reason: `${s.label}: ${s.detail}`, service: failing.via });
  }
  const labels = [...new Set(routes.map((r) => state(r).label))];
  return no({ kind: "connect", reason: `Runs on ${list(labels)}`, services: [...new Set(routes.map((r) => r.via))] });
}

/** The models that make `req.op`, sorted for a picker: ready to use, needing a key, and not fitting this request. */
export type Choices = { auto?: FitOk; ready: FitOk[]; setup: Fit[]; unfit: Fit[] };

/**
 * Every model that makes this kind of thing, checked against the request. Auto is the first ready one of the tier
 * asked for (a rough or a final), in `ranking` (model ids, best first), then in catalog order.
 */
export function chooseModels(catalog: CatalogModel[], req: MakeRequest, services: Record<string, ServiceState>, ranking: string[] = []): Choices {
  const order = (id: string) => {
    const m = catalog.find((x) => x.id === id);
    const offTier = req.quality && m?.tier && m.tier !== req.quality ? 1000 : 0;
    const i = ranking.indexOf(id);
    return offTier + (i === -1 ? ranking.length + catalog.indexOf(m!) : i);
  };
  const fits = catalog
    .filter((m) => m.ops.includes(req.op))
    .map((m) => fitModel(m, req, services))
    .sort((a, b) => order(a.model) - order(b.model));
  const ready = fits.filter((f): f is FitOk => f.ok);
  return {
    auto: ready[0],
    ready,
    setup: fits.filter((f) => !f.ok && f.why.kind !== "fit"),
    unfit: fits.filter((f) => !f.ok && f.why.kind === "fit"),
  };
}

// ---- Cast and sets in prompts.

/** A cast member a prompt names, the variant when it names one (@cat/heist), and its own style when it has one. */
export type CastUse = { id: string; member: CastMember; variant?: NonNullable<CastMember["variants"]>[number]; style?: CastMember };

const MENTION = /@([a-z0-9][a-z0-9-]*)(?:\/([a-z0-9][a-z0-9-]*))?/g;

/** The cast and sets a prompt names (@cat, @cat/heist), then any others listed (as "cat" or "cat/heist"), each once. */
export function castOf(prompt: string, cast: CastMember[] | undefined, also: string[] = []): CastUse[] {
  const out: CastUse[] = [];
  const add = (id: string, v?: string) => {
    const member = cast?.find((m) => m.id === id);
    const variant = v ? member?.variants?.find((x) => x.id === v) : undefined;
    const style = member?.style && member.kind !== "style" ? cast?.find((m) => m.id === member.style && m.kind === "style") : undefined;
    const key = variant ? `${id}/${variant.id}` : id;
    if (member && !out.some((u) => u.id === key)) out.push({ id: key, member, ...(variant ? { variant } : {}), ...(style ? { style } : {}) });
  };
  for (const m of prompt.matchAll(MENTION)) add(m[1]!, m[2]);
  for (const x of also) add(...(x.split("/") as [string, string?]));
  return out;
}

/** A cast member as the model reads it: its name, then what it looks like, and its own style unless the prompt names that style anyway. */
const described = (u: CastUse, uses: CastUse[]) => {
  const own = u.style && !uses.some((x) => x.id === u.style!.id) ? `in the style of ${u.style.name}${u.style.about ? `: ${u.style.about}` : ""}` : "";
  const about = [u.member.about, u.variant?.about, own].filter(Boolean).join("; ");
  return about ? `${u.member.name} (${about})` : u.member.name;
};

/**
 * The prompt as a model reads it: each @mention becomes the name, described the first time, and cast listed but not
 * named in the prompt are added at the end (a style as "In the style of…"). With reference pictures, it says which
 * picture is whom.
 */
export function castPrompt(prompt: string, uses: CastUse[], pictured: CastUse[] = []): string {
  const seen = new Set<string>();
  let text = prompt.replace(MENTION, (whole, id: string, v?: string) => {
    const u = uses.find((x) => x.id === (v ? `${id}/${v}` : id)) ?? uses.find((x) => x.id === id);
    if (!u) return whole;
    const first = !seen.has(u.id);
    seen.add(u.id);
    return first ? described(u, uses) : u.member.name;
  });
  const sentence = (t: string) => (/[.!?]\s*$/.test(t) ? t.trimEnd() : `${t.trimEnd()}.`);
  const rest = uses.filter((u) => !seen.has(u.id));
  const others = rest.filter((u) => u.member.kind !== "style");
  const styles = rest.filter((u) => u.member.kind === "style");
  if (others.length) text = `${sentence(text)} With ${others.map((u) => described(u, uses)).join(", ")}.`;
  if (styles.length) text = `${sentence(text)} In the style of ${styles.map((u) => described(u, uses)).join(" and ")}.`;
  if (pictured.length) text = `${sentence(text)} Reference pictures, in order: ${pictured.map((u) => u.member.name).join(", ")}. Keep each one's features, markings and colors as they are there; draw them in the style asked for.`;
  return text;
}

/** Who gets a picture first when there are more than a model takes: the characters, then props, places and the style. */
const PICTURE_ORDER: CastMember["kind"][] = ["character", "prop", "place", "style"];

/**
 * The cast that have a picture to give a model, with the picture: the variant's own if it has one, else the main
 * one. With `max`, only that many, characters first (the rest are still described in words).
 */
export function castPictures(uses: CastUse[], max = Infinity): { use: CastUse; asset: string }[] {
  return uses
    .flatMap((use) => {
      const asset = use.variant?.images?.[0] ?? use.member.images?.[0];
      return asset ? [{ use, asset }] : [];
    })
    .sort((a, b) => PICTURE_ORDER.indexOf(a.use.member.kind) - PICTURE_ORDER.indexOf(b.use.member.kind))
    .slice(0, max);
}

/** The most reference pictures any model in a catalog takes for stills. */
export const maxStillRefs = (catalog: CatalogModel[]) => Math.max(0, ...catalog.filter((m) => m.ops.includes("image")).map((m) => m.takes.refs ?? 0));

/** What a shot asks of a take: how long it plays (in the cut's first format), that format's shape, and a first prompt. */
export function shotNeeds(project: Project, shotId: string): { seconds?: number; aspect: string; prompt?: string } {
  const format = project.formats[0]!;
  const aspect = aspectOf(format.width, format.height);
  const shot = project.shots.find((s) => s.id === shotId);
  if (!shot) return { aspect };
  const r = resolveTimeline(project, format.id).shots.find((s) => s.id === shotId);
  const length = r ? r.end - r.start : NaN;
  const c = shot.content;
  const prompt = c.kind === "placeholder" ? c.description : c.kind === "generated" ? c.prompt : shot.intent;
  return { seconds: Number.isFinite(length) && length > 0 ? Math.round(length * 1000) / 1000 : undefined, aspect, prompt };
}
