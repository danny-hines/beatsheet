/**
 * Making new footage: what a request asks for, the models that could make it, and for each one whether it can and,
 * if not, why. Pure, so the studio's picker, the engine and the agent's tools all give the same answer. The models
 * themselves are in catalog.ts; the engine knows which services are connected and runs the jobs.
 */
import { slugify } from "./formats.ts";
import { resolveTimeline } from "./resolve.ts";
import type { CastMember, CastProposal, Project, ProjectFile } from "./types.ts";

/** What can be asked for. More join as they're wired up: extend, edit-video, swap, lipsync, restore, isolate. */
export const MAKE_OPS = ["image", "video"] as const;
export type MakeOp = (typeof MAKE_OPS)[number];

/** The shape of a request a service has its own endpoint for: a clip that copies movement from another is "drive". */
export type RequestShape = "text" | "start" | "refs" | "drive";

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
  /** For video: the lengths it makes here, when that's less than the model makes elsewhere (a workflow on your own card). */
  lengths?: number[] | { min: number; max: number };
  /** What it takes here, when that's less than the model takes elsewhere: no end frame, fewer references. */
  takes?: { end?: boolean; refs?: number };
  /** Roughly how long one take takes here, when that isn't the model's usual. */
  wait?: number;
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
  /**
   * What it can be given besides a prompt: a picture to start from, one to end on, and how many references. `drive`:
   * it copies the movement of the people in a clip onto the people in the start picture, and needs both.
   */
  takes: { start?: boolean; end?: boolean; refs?: number; drive?: boolean };
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
  /** For video that copies movement: the stretch of a clip to follow. */
  drive?: Drive;
  /** How long it has to play, in seconds (the shot's length, or the stretch it follows). */
  seconds?: number;
  /** The shape it has to fill: "9:16". */
  aspect?: string;
  /** How many takes. */
  count?: number;
  /** Where to make it, when the model runs in more than one place ("chatgpt" rather than "openai"); default the cheapest that's ready. */
  via?: string;
};

/**
 * Whether a service can be used now. `label` is its name for people ("fal"). `endpoints` says why some of its endpoints
 * can't be used even so: what one is missing (to install), or what the machine it runs on can't do. A service that
 * isn't connected can say the second too, about this computer (ComfyUI on a laptop with no graphics card it could use).
 */
export type ServiceState = { label: string; endpoints?: Record<string, Unusable> } & (
  | { state: "ready"; balanceUsd?: number }
  | { state: "missing" }
  | { state: "failing"; detail: string }
);

/** Why one endpoint of a service can't be used: something to install first, or a machine that can't run it. */
export type Unusable = { kind: "install" | "machine"; reason: string };

/** Why a model can't make this request, said so the studio and the agent can show it as it is. */
export type Why =
  | { kind: "fit"; reason: string; fix?: "split" | "drop-refs" | "drop-end" | "via-start-frame" }
  | { kind: "connect"; reason: string; services: string[] }
  | { kind: "install"; reason: string; service: string }
  | { kind: "machine"; reason: string; service: string }
  | { kind: "funds"; reason: string; balanceUsd: number; needUsd: number }
  | { kind: "failing"; reason: string; service: string };

export type FitOk = {
  ok: true;
  model: string;
  label: string;
  route: string;
  /** Where it runs, for people: "fal", "ChatGPT plan". */
  where: string;
  /** The other places it could run now, cheapest first. */
  also?: { route: string; where: string; usd?: number }[];
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

/** A stretch of a clip whose movement a take copies, in seconds of the clip. */
export type Drive = { asset: string; from: number; to: number };

/**
 * The stretch of the clip a take that copies movement follows: the one asked for, widened to the take's length where
 * the clip has room (evenly either side, else on the side that has it), and how far into it the asked-for stretch
 * starts (where the shot starts in the take).
 */
export function driveWindow(drive: Drive, seconds: number, duration = Infinity): { from: number; to: number; lead: number } {
  const want = drive.to - drive.from;
  const extra = Math.max(0, seconds - want);
  const before = Math.min(drive.from, Math.max(extra / 2, extra - Math.max(0, duration - drive.to)));
  const r = (x: number) => Math.round(x * 1000) / 1000;
  const from = drive.from - before;
  return { from: r(from), to: r(Math.min(duration, from + Math.max(seconds, want))), lead: r(before) };
}

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
export const shapeOf = (req: Pick<MakeRequest, "start" | "refs" | "drive">): RequestShape => (req.drive ? "drive" : req.refs?.length ? "refs" : req.start ? "start" : "text");

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
  if (req.drive && !model.takes.drive) return no({ kind: "fit", reason: "Doesn't copy movement from a clip" });
  if (model.takes.drive && !req.drive) return no({ kind: "fit", reason: "Copies the movement in a clip: say which stretch of which clip to follow" });
  if (req.drive && !req.start) return no({ kind: "fit", reason: "Needs a picture of who moves: start from the shot's board" });
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
  const state = (r: ModelRoute): ServiceState => services[r.via] ?? { label: r.via, state: "missing" };
  const there = model.routes.filter((r) => r.endpoints[shape] && (!req.via || r.via === req.via));
  if (!there.length && req.via) return no({ kind: "fit", reason: `${model.label} doesn't run on ${services[req.via]?.label ?? req.via}` });
  if (!there.length)
    return no({ kind: "fit", reason: `Nowhere runs ${model.label} with ${shape === "refs" ? "references" : shape === "start" ? "a start frame" : shape === "drive" ? "a clip to follow" : "only a prompt"}` });
  // A route can take less than the model does elsewhere (no end frame on your own card).
  const takesHere = (r: ModelRoute) => (!req.end || r.takes?.end !== false) && refs <= (r.takes?.refs ?? maxRefs);
  const offered = there.filter(takesHere);
  if (!offered.length) {
    const elsewhere = [...new Set(model.routes.filter((r) => r.endpoints[shape] && takesHere(r)).map((r) => state(r).label))];
    const what = req.end && there.every((r) => r.takes?.end === false) ? "an end frame" : "this many references";
    return no({ kind: "fit", reason: `Doesn't take ${what} on ${list([...new Set(there.map((r) => state(r).label))])}${elsewhere.length ? `; it does on ${list(elsewhere)}` : ""}`, fix: what === "an end frame" ? "drop-end" : "drop-refs" });
  }
  // A route can make less than the model does elsewhere (a workflow on your own card): its own length there, or why not.
  const timed = offered.map((r): { r: ModelRoute; seconds?: number } | { r: ModelRoute; why: Why } => {
    if (req.op !== "video" || !r.lengths) return { r, seconds };
    const l = lengthFor({ ...model, lengths: r.lengths }, req.seconds);
    return "why" in l ? { r, why: l.why } : { r, seconds: l.seconds };
  });
  const routes = timed.filter((x): x is { r: ModelRoute; seconds?: number } => !("why" in x));
  if (!routes.length) return no((timed[0] as { why: Why }).why);

  const unusable = (r: ModelRoute) => state(r).endpoints?.[r.endpoints[shape]!];
  const ready = routes
    .filter(({ r }) => state(r).state === "ready" && !unusable(r))
    .map(({ r, seconds }) => ({ r, seconds, usd: costOn(r, req.op, seconds, count), balance: (state(r) as { balanceUsd?: number }).balanceUsd }))
    .sort((a, b) => (a.usd ?? Infinity) - (b.usd ?? Infinity));
  const affordable = ready.filter((x) => x.balance === undefined || x.usd === undefined || x.usd <= x.balance);
  if (affordable.length) {
    const [best, ...rest] = affordable.map((x) => ({ ...x, where: state(x.r).label }));
    const also = rest.map((x) => ({ route: x.r.via, where: x.where, usd: x.usd }));
    return {
      ok: true,
      model: model.id,
      label: model.label,
      route: best!.r.via,
      where: best!.where,
      ...(also.length ? { also } : {}),
      endpoint: best!.r.endpoints[shape]!,
      seconds: best!.seconds,
      aspect,
      usd: best!.usd,
      wait: best!.r.wait ?? model.wait,
    };
  }
  if (ready.length) {
    const x = ready[0]!;
    return no({ kind: "funds", reason: `${state(x.r).label} has ${money(x.balance!)}; this is about ${money(x.usd!)}`, balanceUsd: x.balance!, needUsd: x.usd! });
  }
  const failing = routes.find(({ r }) => state(r).state === "failing");
  if (failing) {
    const s = state(failing.r) as { label: string; detail: string };
    return no({ kind: "failing", reason: `${s.label}: ${s.detail}`, service: failing.r.via });
  }
  // Connected, but this endpoint can't be used there: something to install first, or a machine that can't run it.
  const blocked = routes.filter(({ r }) => state(r).state === "ready" && unusable(r));
  const install = blocked.find(({ r }) => unusable(r)!.kind === "install");
  if (install) return no({ kind: "install", reason: unusable(install.r)!.reason, service: install.r.via });
  const missing = routes.filter(({ r }) => state(r).state === "missing");
  if (missing.length) {
    // One that isn't connected may say why this computer couldn't run it either, so the person connects another.
    const hints = [...new Set(missing.flatMap(({ r }) => unusable(r)?.reason ?? []))];
    const labels = [...new Set(missing.map(({ r }) => state(r).label))];
    return no({ kind: "connect", reason: [`Runs on ${list(labels)}`, ...hints].join(". "), services: [...new Set(missing.map(({ r }) => r.via))] });
  }
  return no({ kind: "machine", reason: unusable(blocked[0]!.r)!.reason, service: blocked[0]!.r.via });
}

/**
 * The models that make `req.op`, sorted for a picker: ready to use, needing something the person can set up (a key, a
 * connection, an install), and the ones that can't make this request, or can't run on the machine there is.
 */
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
    setup: fits.filter((f) => !f.ok && f.why.kind !== "fit" && f.why.kind !== "machine"),
    unfit: fits.filter((f) => !f.ok && (f.why.kind === "fit" || f.why.kind === "machine")),
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

/** An id prompts can name after an @. */
export const CAST_ID = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Gives a cast member, or one of its variants ("cat/heist"), a new id everywhere it's used: the prompts and cast lists
 * of made shots in every cut, the lines it speaks, what takes were made with and their labels, and the styles that name it. Changes `file`
 * in place; false (and nothing changed) when there's nothing by that id, or the new one is taken or can't follow an @.
 */
export function renameCast(file: ProjectFile, from: string, to: string): boolean {
  const [id, variant] = from.split("/") as [string, string?];
  const member = file.cast?.find((m) => m.id === id);
  if (!member || !CAST_ID.test(to)) return false;
  if (variant) {
    const v = member.variants?.find((x) => x.id === variant);
    if (!v || (to !== variant && member.variants!.some((x) => x.id === to))) return false;
    v.id = to;
  } else {
    if (to !== id && file.cast!.some((m) => m.id === to)) return false;
    member.id = to;
    for (const m of file.cast!) if (m.style === id) m.style = to;
    if (file.look?.style === id) file.look.style = to;
  }
  const { key: map, text: inPrompt } = castRenaming(from, to);
  for (const cut of file.cuts) {
    for (const shot of cut.shots) {
      const c = shot.content;
      if (c?.kind !== "generated") continue;
      c.prompt = inPrompt(c.prompt);
      if (c.cast) c.cast = c.cast.map(map);
    }
    if (!variant) for (const l of cut.voice?.lines ?? []) if (l.speaker === id) l.speaker = to;
  }
  for (const a of file.assets) {
    if (a.label) a.label = inPrompt(a.label);
    const p = a.provenance;
    if (p?.cast) p.cast = p.cast.map(map);
    if (p?.prompt) p.prompt = inPrompt(p.prompt);
  }
  return true;
}

/**
 * Puts the proposals the person kept into the cast: each as a new member seen in its pictures, or, when its id is
 * already in the cast, its pictures added to that one. Pictures that aren't in the project are left out, and a new
 * member's id is made usable after an @ and unique. Changes `file` in place; says which ids were added and joined.
 */
export function keepCast(file: ProjectFile, proposals: CastProposal[], keep: string[]): { added: string[]; joined: string[] } {
  const out = { added: [] as string[], joined: [] as string[] };
  const have = new Set(file.assets.map((a) => a.id));
  for (const p of proposals.filter((x) => keep.includes(x.id))) {
    const seen = [...new Set(p.assets)].filter((a) => have.has(a)).map((asset) => ({ asset }));
    const cast = (file.cast ??= []);
    const same = cast.find((m) => m.id === p.id && m.kind !== "style");
    if (same) {
      same.seen = [...(same.seen ?? []), ...seen.filter((s) => !same.seen?.some((x) => x.asset === s.asset && !x.subject))];
      if (!same.about && p.about) same.about = p.about;
      if (!same.name.trim()) same.name = p.name;
      out.joined.push(same.id);
      continue;
    }
    const base = CAST_ID.test(p.id) ? p.id : slugify(p.name);
    let id = base;
    for (let n = 2; cast.some((m) => m.id === id); n++) id = `${base}-${n}`;
    cast.push({ id, kind: p.kind, name: p.name, ...(p.about ? { about: p.about } : {}), ...(seen.length ? { seen } : {}) });
    out.added.push(id);
  }
  return out;
}

/**
 * How the keys ("cat", "cat/heist") and @mentions that name a cast member or a variant change when `from` becomes
 * `to`: for the project (renameCast) and for whatever else holds them, like the jobs still being made.
 */
export function castRenaming(from: string, to: string): { key: (key: string) => string; text: (text: string) => string } {
  const [id, variant] = from.split("/") as [string, string?];
  const key = variant
    ? (k: string) => (k === from ? `${id}/${to}` : k)
    : (k: string) => {
        const [a, b] = k.split("/");
        return a === id ? (b ? `${to}/${b}` : to) : k;
      };
  const text = (t: string) =>
    t.replace(MENTION, (whole, a: string, b?: string) => {
      const k = b ? `${a}/${b}` : a;
      const next = key(k);
      return next === k ? whole : `@${next}`;
    });
  return { key, text };
}

/** The most reference pictures any model in a catalog takes for stills. */
export const maxStillRefs = (catalog: CatalogModel[]) => Math.max(0, ...catalog.filter((m) => m.ops.includes("image")).map((m) => m.takes.refs ?? 0));

/**
 * The reference pictures every model for stills takes, which a request is built with before a model is picked (so each
 * one can be offered); the one picked is then given as many as it takes.
 */
export const fewestStillRefs = (catalog: CatalogModel[]) =>
  Math.min(...catalog.filter((m) => m.ops.includes("image") && (m.takes.refs ?? 0) > 0).map((m) => m.takes.refs!), Infinity) || 0;

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
