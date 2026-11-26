import { describe, expect, it } from "vitest";
import {
  aspectOf,
  billedWithClip,
  CATALOG,
  castOf,
  castPictures,
  picturesGiven,
  castPrompt,
  checkCut,
  checkReferences,
  chooseModels,
  commercialWords,
  cutView,
  driveWindow,
  fitModel,
  followTakes,
  preferredOf,
  providersOf,
  HANDLE,
  fewestStillRefs,
  maxStillRefs,
  missingFromFrames,
  parseFile,
  pictureOf,
  keepCast,
  realPeople,
  renameCast,
  mergeLook,
  Project,
  resolveTimeline,
  SCHEMA_VERSION,
  shotNeeds,
  showTake,
  blockoutStretch,
  cameraOnShot,
  speechWindow,
  STAGE_IDS,
  takeLead,
  withCut,
  type Asset,
  type CastMember,
  type CatalogModel,
  type ProjectFile,
  type ProjectInput,
  type ServiceState,
} from "../src/index.ts";

// A model like Kling: two fixed lengths, three aspects, a start and an end frame, on fal.
const fixed: CatalogModel = {
  id: "fixed",
  label: "Fixed",
  by: "test",
  note: "",
  ops: ["video"],
  takes: { start: true, end: true },
  lengths: [5, 10],
  aspects: ["16:9", "9:16", "1:1"],
  wait: 120,
  routes: [{ via: "fal", shape: "kling", endpoints: { text: "fal/fixed/t2v", start: "fal/fixed/i2v" }, price: { perSecond: 0.07 } }],
};
// Any length up to 10 seconds, on fal or Replicate, cheaper on Replicate.
const ranged: CatalogModel = {
  ...fixed,
  id: "ranged",
  label: "Ranged",
  takes: { start: true },
  lengths: { min: 1.1, max: 10 },
  routes: [
    { via: "fal", shape: "wan", endpoints: { text: "fal/ranged" }, price: { perSecond: 0.08 } },
    { via: "replicate", shape: "wan", endpoints: { text: "rep/ranged" }, price: { perSecond: 0.05 } },
  ],
};
// Stills from a prompt and up to two references, at any size; only on Runway.
const stills: CatalogModel = {
  id: "stills",
  label: "Stills",
  by: "test",
  note: "",
  ops: ["image"],
  takes: { refs: 2 },
  aspects: ["any"],
  routes: [{ via: "runway", shape: "stills", endpoints: { text: "rw/stills", refs: "rw/stills-edit" }, price: { perImage: 0.04 } }],
};

const fal: ServiceState = { label: "fal", state: "ready" };
const services = { fal } satisfies Record<string, ServiceState>;

describe("whether a model can make a shot", () => {
  it("asks for the shortest length that covers the shot, with a little either side when that length allows it", () => {
    const f = fitModel(fixed, { op: "video", prompt: "a cat", seconds: 3.2, aspect: "16:9" }, services);
    expect(f).toMatchObject({ ok: true, route: "fal", endpoint: "fal/fixed/t2v", seconds: 5, aspect: "16:9" });
    // A 5-second shot gets the 5-second take, not a 10-second one at twice the price for half a second either side.
    expect(fitModel(fixed, { op: "video", prompt: "a cat", seconds: 5 }, services)).toMatchObject({ ok: true, seconds: 5, usd: 0.35 });
    expect(fitModel(fixed, { op: "video", prompt: "a cat", seconds: 5.2 }, services)).toMatchObject({ ok: true, seconds: 10 });
    // Just under the longest: no room for handles, but it still fits.
    expect(fitModel(fixed, { op: "video", prompt: "a cat", seconds: 9.8 }, services)).toMatchObject({ ok: true, seconds: 10 });
    expect(fitModel(ranged, { op: "video", prompt: "a cat", seconds: 3.2 }, services)).toMatchObject({ ok: true, seconds: 3.2 + 2 * HANDLE });
  });

  it("says when a shot is longer than the model makes, and that splitting it would do", () => {
    const f = fitModel(fixed, { op: "video", prompt: "a cat", seconds: 12.4 }, services);
    expect(f).toMatchObject({ ok: false, why: { kind: "fit", reason: "Makes up to 10s; this shot is 12.4s", fix: "split" } });
  });

  it("asks for the nearest shape it makes when a crop keeps most of the picture, and refuses when it wouldn't", () => {
    expect(fitModel(fixed, { op: "video", prompt: "x", aspect: "4:5" }, services)).toMatchObject({ ok: true, aspect: "1:1" });
    const portrait = fitModel({ ...fixed, aspects: ["16:9"] }, { op: "video", prompt: "x", aspect: "9:16" }, services);
    expect(portrait).toMatchObject({ ok: false, why: { kind: "fit", reason: "Makes 16:9, not 9:16" } });
    // A take that starts from a picture comes out the picture's shape, so no aspect is asked for.
    expect(fitModel({ ...fixed, aspects: ["16:9"] }, { op: "video", prompt: "x", aspect: "9:16", start: "board" }, services)).toMatchObject({
      ok: true,
      endpoint: "fal/fixed/i2v",
      aspect: undefined,
    });
  });

  it("checks pictures and references against what the model takes", () => {
    expect(fitModel(ranged, { op: "video", prompt: "x", start: "a", end: "b" }, services)).toMatchObject({ ok: false, why: { reason: "Doesn't take an end frame", fix: "drop-end" } });
    expect(fitModel(fixed, { op: "video", prompt: "x", end: "b" }, services)).toMatchObject({ ok: false, why: { reason: "An end frame needs a start frame too" } });
    expect(fitModel(fixed, { op: "video", prompt: "x", refs: ["cat"] }, services)).toMatchObject({ ok: false, why: { fix: "via-start-frame" } });
    expect(fitModel(stills, { op: "image", prompt: "x", refs: ["a", "b", "c"] }, { runway: { label: "Runway", state: "ready" } })).toMatchObject({
      ok: false,
      why: { reason: "Takes up to 2 references; this has 3", fix: "drop-refs" },
    });
  });

  it("uses the cheapest connected service, and estimates the cost of all the takes", () => {
    const both = { fal, replicate: { label: "Replicate", state: "ready" } } satisfies Record<string, ServiceState>;
    expect(fitModel(ranged, { op: "video", prompt: "x", seconds: 4, count: 2 }, both)).toMatchObject({ ok: true, route: "replicate", usd: 0.5 });
    expect(fitModel(ranged, { op: "video", prompt: "x", seconds: 4, count: 2 }, services)).toMatchObject({ ok: true, route: "fal", usd: 0.8 });
    expect(fitModel(stills, { op: "image", prompt: "x", count: 3 }, { runway: { label: "Runway", state: "ready" } })).toMatchObject({ ok: true, usd: 0.12, aspect: undefined });
  });

  it("says where else it could run, and makes it there when asked", () => {
    const gpt = CATALOG.find((m) => m.id === "gpt-image")!;
    const both = { openai: { label: "OpenAI", state: "ready" }, chatgpt: { label: "ChatGPT plan", state: "ready" } } satisfies Record<string, ServiceState>;
    // The plan costs nothing more, so it comes first; the key is the other choice.
    expect(fitModel(gpt, { op: "image", prompt: "x", aspect: "9:16" }, both)).toMatchObject({ ok: true, route: "chatgpt", where: "ChatGPT plan", usd: 0, also: [{ route: "openai", where: "OpenAI", usd: 0.04 }] });
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "openai" }, both)).toMatchObject({ ok: true, route: "openai", endpoint: "gpt-image-2.6-flare", usd: 0.04 });
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "openai" }, both)).not.toHaveProperty("also");
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "chatgpt" }, { openai: both.openai })).toMatchObject({ ok: false, why: { kind: "connect", reason: "Runs on chatgpt" } });
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "meta" }, both)).toMatchObject({ ok: false, why: { kind: "fit", reason: "GPT Image doesn't run on meta" } });
    // fal sells it too, for someone with only a fal key.
    expect(fitModel(gpt, { op: "image", prompt: "x" }, { fal })).toMatchObject({ ok: true, route: "fal", endpoint: "openai/gpt-image-2.6/flare/text-to-image", usd: 0.04 });
    // A plan whose image tool isn't on yet doesn't stop the key from making it.
    const muse = CATALOG.find((m) => m.id === "muse-image")!;
    const gated = { meta: { label: "Meta", state: "ready" }, "muse-code": { label: "Muse Code plan", state: "failing", detail: "not on yet" } } satisfies Record<string, ServiceState>;
    expect(fitModel(muse, { op: "image", prompt: "x" }, gated)).toMatchObject({ ok: true, route: "meta", usd: 0.01 });
    expect(fitModel(muse, { op: "image", prompt: "x" }, gated)).not.toHaveProperty("also");
    // Nano Banana 2.1 on the Antigravity plan: free, up to 3 references (more refs need fal/Gemini/Runway).
    const banana = CATALOG.find((m) => m.id === "nano-banana-2.1")!;
    const agy = { antigravity: { label: "Antigravity plan", state: "ready" } } satisfies Record<string, ServiceState>;
    expect(fitModel(banana, { op: "image", prompt: "x", aspect: "9:16", refs: ["a", "b", "c"] }, agy)).toMatchObject({ ok: true, route: "antigravity", where: "Antigravity plan", usd: 0 });
    expect(fitModel(banana, { op: "image", prompt: "x", refs: ["a", "b", "c", "d"] }, agy)).toMatchObject({ ok: false, why: { kind: "connect" } });
    expect(fitModel(banana, { op: "image", prompt: "x", via: "antigravity", refs: ["a", "b", "c", "d"] }, agy)).toMatchObject({ ok: false, why: { kind: "fit", fix: "drop-refs" } });
  });

  it("says which services would run it, or why the one there is can't", () => {
    expect(fitModel(stills, { op: "image", prompt: "x" }, services)).toMatchObject({ ok: false, why: { kind: "connect", reason: "Runs on runway", services: ["runway"] } });
    expect(fitModel(stills, { op: "image", prompt: "x" }, { runway: { label: "Runway", state: "missing" } })).toMatchObject({ why: { reason: "Runs on Runway" } });
    expect(fitModel(ranged, { op: "video", prompt: "x" }, { fal: { label: "fal", state: "missing" }, replicate: { label: "Replicate", state: "missing" } })).toMatchObject({
      why: { kind: "connect", reason: "Runs on fal or Replicate", services: ["fal", "replicate"] },
    });
    expect(fitModel(fixed, { op: "video", prompt: "x" }, { fal: { label: "fal", state: "failing", detail: "That key was refused" } })).toMatchObject({
      why: { kind: "failing", reason: "fal: That key was refused", service: "fal" },
    });
  });

  it("says when the balance won't cover it", () => {
    const low = { fal: { label: "fal", state: "ready", balanceUsd: 0.4 } } satisfies Record<string, ServiceState>;
    expect(fitModel(fixed, { op: "video", prompt: "x", seconds: 8, count: 2 }, low)).toMatchObject({
      ok: false,
      why: { kind: "funds", reason: "fal has $0.40; this is about $1.40", balanceUsd: 0.4, needUsd: 1.4 },
    });
  });
});

describe("multi-provider routing and optional preference", () => {
  // A model on a card of the person's own as well as on fal, and one only on their card.
  const both: CatalogModel = {
    ...ranged,
    id: "both",
    label: "Both",
    routes: [ranged.routes[0]!, ranged.routes[1]!, { via: "comfy", shape: "wan", endpoints: { text: "wan-t2v" }, price: { perSecond: 0 }, note: "Slower on your own card" }],
  };
  const catalog = [fixed, ranged, stills, both];
  const connected = { fal, replicate: { label: "Replicate", state: "ready" }, runway: { label: "Runway", state: "missing" }, comfy: { label: "Your own hardware", state: "ready" } } satisfies Record<string, ServiceState>;

  it("lists the services stills or video can come from, with what each offers, and never the person's own hardware", () => {
    expect(providersOf(catalog, "video")).toEqual([
      { id: "fal", models: ["Fixed", "Ranged", "Both"] },
      { id: "replicate", models: ["Ranged", "Both"] },
    ]);
    expect(providersOf(catalog, "image")).toEqual([{ id: "runway", models: ["Stills"] }]);
  });

  it("keeps the person's preferred provider only while it's connected for that op, and undefined when unset", () => {
    expect(preferredOf(catalog, "video", connected, "replicate")).toBe("replicate");
    expect(preferredOf(catalog, "video", connected, undefined)).toBeUndefined();
    expect(preferredOf(catalog, "video", { ...connected, replicate: { label: "Replicate", state: "missing" } }, "replicate")).toBeUndefined();
    expect(preferredOf(catalog, "video", connected, "comfy")).toBeUndefined();
    expect(preferredOf(catalog, "image", connected, "fal")).toBeUndefined();
  });

  it("keeps every connected service ready, while letting a preferred provider guide Auto and break ties", () => {
    // No preference: cheapest connected route wins, with the other ready route in `also`.
    expect(fitModel(ranged, { op: "video", prompt: "x", seconds: 4 }, connected)).toMatchObject({
      ok: true,
      route: "replicate",
      usd: 0.25,
      also: [{ route: "fal", usd: 0.4 }],
    });

    // Preferring fal makes fal win over cheaper Replicate, while Replicate stays available via `also` and explicit `via`.
    expect(fitModel(ranged, { op: "video", prompt: "x", seconds: 4 }, connected, "fal")).toMatchObject({
      ok: true,
      route: "fal",
      usd: 0.4,
      also: [{ route: "replicate", usd: 0.25 }],
    });
    expect(fitModel(ranged, { op: "video", prompt: "x", via: "replicate" }, connected, "fal")).toMatchObject({ ok: true, route: "replicate" });

    // Preferring Replicate makes Auto pick Replicate first, while fal-only `fixed` stays ready (not blocked) and is used when a shot requires it.
    const choices = chooseModels(catalog, { op: "video", prompt: "x" }, connected, [], "replicate");
    expect(choices.ready.map((f) => [f.model, f.route])).toEqual([["ranged", "replicate"], ["both", "comfy"], ["fixed", "fal"]]);
    expect(choices.auto).toMatchObject({ model: "ranged", route: "replicate" });
    expect(choices.setup).toEqual([]);
    // Only `fixed` takes an end frame: even with Replicate preferred, Auto falls back to fal seamlessly.
    expect(chooseModels(catalog, { op: "video", prompt: "x", start: "a", end: "b" }, connected, [], "replicate").auto).toMatchObject({ model: "fixed", route: "fal" });
  });

  it("runs the person's own hardware first on shared models, with the preferred cloud service next in also", () => {
    const fit = fitModel(both, { op: "video", prompt: "x", seconds: 4 }, connected, "fal");
    expect(fit).toMatchObject({ ok: true, route: "comfy", usd: 0, note: "Slower on your own card", also: [{ route: "fal", usd: 0.4 }, { route: "replicate", usd: 0.25 }] });
    expect(fitModel(both, { op: "video", prompt: "x", seconds: 4, via: "fal" }, connected, "fal")).toMatchObject({ ok: true, route: "fal" });
  });
});

describe("choosing between models", () => {
  const catalog = [fixed, ranged, stills];

  it("groups them into ready, needing a key, and not fitting, with Auto the first ready one", () => {
    const c = chooseModels(catalog, { op: "video", prompt: "x", start: "a", end: "b" }, services);
    expect(c.auto?.model).toBe("fixed");
    expect(c.ready.map((f) => f.model)).toEqual(["fixed"]);
    expect(c.unfit.map((f) => f.model)).toEqual(["ranged"]);
    // Only models that make this kind of thing are listed.
    expect([...c.ready, ...c.setup, ...c.unfit].some((f) => f.model === "stills")).toBe(false);
    expect(chooseModels(catalog, { op: "image", prompt: "x" }, services).setup.map((f) => f.model)).toEqual(["stills"]);
  });

  it("follows the person's ranking, then the catalog's order", () => {
    expect(chooseModels(catalog, { op: "video", prompt: "x", seconds: 4 }, services).auto?.model).toBe("fixed");
    expect(chooseModels(catalog, { op: "video", prompt: "x", seconds: 4 }, services, ["ranged"]).auto?.model).toBe("ranged");
  });

  it("finds a model in the real catalog for a board and for a rough cut of a shot", () => {
    expect(chooseModels(CATALOG, { op: "image", prompt: "a cat on a porch", aspect: "9:16" }, services).auto).toMatchObject({ model: "nano-banana-2.1", aspect: "9:16" });
    expect(chooseModels(CATALOG, { op: "video", prompt: "a cat leaves", start: "board", seconds: 3.2 }, services).auto).toMatchObject({ model: "minimax-h3-max-turbo", seconds: 5 });
    for (const m of CATALOG)
      for (const r of m.routes) {
        expect(r.endpoints.text ?? r.endpoints.start ?? r.endpoints.refs ?? r.endpoints.drive ?? r.endpoints.talk ?? r.endpoints.dub, `${m.id} on ${r.via}`).toBeTruthy();
        // One that follows a clip takes its start picture with the clip, at the one endpoint; one that lip-syncs takes
        // its picture (or its clip) with what's said.
        if (m.takes.drive) expect(r.endpoints.drive, `${m.id} follows a clip on ${r.via}`).toBeTruthy();
        else if (m.takes.speech) expect(r.endpoints.talk ?? r.endpoints.dub, `${m.id} lip-syncs on ${r.via}`).toBeTruthy();
        else if (m.takes.start) expect(r.endpoints.start, `${m.id} starts from a picture on ${r.via}`).toBeTruthy();
        if (r.takes?.refs ?? m.takes.refs) expect(r.endpoints.refs, `${m.id} takes references on ${r.via}`).toBeTruthy();
      }
  });

  it("sends an end frame only where the model takes one, and says where that is", () => {
    const comfy: ServiceState = { label: "ComfyUI", state: "ready" };
    const ends = { op: "video" as const, prompt: "x", start: "board", end: "last", seconds: 3 };
    // Wan 2.2 takes one on fal, not on your own card, though the card is free.
    expect(fitModel(CATALOG.find((m) => m.id === "wan-2.2")!, ends, { fal, comfy })).toMatchObject({ ok: true, route: "fal" });
    expect(fitModel(CATALOG.find((m) => m.id === "wan-2.2")!, { ...ends, via: "comfy" }, { fal, comfy })).toMatchObject({
      ok: false,
      why: { kind: "fit", fix: "drop-end", reason: "Doesn't take an end frame on ComfyUI; it does on fal" },
    });
    // MiniMax H3 takes one on either, and its references only on fal.
    const h3 = CATALOG.find((m) => m.id === "minimax-h3")!;
    expect(fitModel(h3, ends, { fal, comfy })).toMatchObject({ ok: true, route: "comfy", endpoint: "minimax-h3-i2v", seconds: 5, usd: 0, also: [{ route: "fal", usd: 0.3 }] });
    expect(fitModel(h3, { op: "video", prompt: "x", refs: ["a", "b"], seconds: 8 }, { fal, comfy })).toMatchObject({ ok: true, route: "fal", endpoint: "minimax/h3/reference-to-video", seconds: 9, usd: 0.54 });
  });
});

describe("what a shot asks of a take", () => {
  const make = (over: Partial<ProjectInput> = {}): Project =>
    Project.parse({
      schema: SCHEMA_VERSION,
      id: "t",
      title: "test",
      recipe: "film",
      brief: { goal: "test" },
      formats: [
        { id: "port", label: "9:16", width: 1080, height: 1920, fps: 30 },
        { id: "land", label: "16:9", width: 1920, height: 1080, fps: 30 },
      ],
      stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
      spine: "shots",
      assets: [],
      tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
      shots: [],
      notes: [],
      ...over,
    });

  it("is the shot's length in the first format, that format's shape, and its description", () => {
    const p = make({
      shots: [
        { id: "s1", track: "pic", duration: 2.5, content: { kind: "placeholder", description: "The cat slips out the cat flap" }, fidelity: "idea" },
        { id: "s2", track: "pic", duration: 3.2, content: { kind: "placeholder", description: "Down the alley" }, fidelity: "idea" },
      ],
    });
    expect(shotNeeds(p, "s2")).toEqual({ seconds: 3.2, aspect: "9:16", prompt: "Down the alley" });
    expect(shotNeeds(p, "nope")).toEqual({ aspect: "9:16" });
  });

  it("names the shapes of common sizes", () => {
    expect(aspectOf(1920, 1080)).toBe("16:9");
    expect(aspectOf(1080, 1350)).toBe("4:5");
    expect(aspectOf(1366, 768)).toBe("16:9");
    expect(aspectOf(720, 480)).toBe("3:2");
  });

  it("plays a generated take from its in point, and checks its pictures are in the project", () => {
    const take = { id: "take1", kind: "video" as const, path: "made/takes/take1.mp4", duration: 5 };
    const p = make({
      assets: [take, { id: "board1", kind: "image", path: "made/takes/board1.png" }],
      shots: [{ id: "s1", track: "pic", duration: 3.2, content: { kind: "generated", prompt: "x", take: "take1", takes: ["take1"], start: "board1", in: 0.5 }, fidelity: "rough" }],
    });
    expect(resolveTimeline(p).shots[0]).toMatchObject({ start: 0, end: 3.2, sourceIn: 0.5 });
    expect(checkCut(p)).toEqual([]);
    const missing = make({ ...p, assets: [take], shots: p.shots });
    expect(checkCut(missing).map((i) => i.message)).toContain('unknown asset "board1"');
  });
});

describe("roughs and finals", () => {
  it("picks H3 Max Turbo for a rough and H3 Max for a final, from the shot's board", () => {
    const board = { op: "video" as const, prompt: "the cat leaves", start: "board", seconds: 3.2 };
    expect(chooseModels(CATALOG, { ...board, quality: "rough" }, services).auto).toMatchObject({ model: "minimax-h3-max-turbo", seconds: 5, usd: 0.2 });
    expect(chooseModels(CATALOG, { ...board, quality: "final" }, services).auto).toMatchObject({ model: "minimax-h3-max", seconds: 5, usd: 0.8 });
  });

  it("prices a model that makes both at the size it makes each: Wan 3.0's rough at 480p, its final at 1080p", () => {
    const board = { op: "video" as const, prompt: "the cat leaves", start: "board", seconds: 3.2 };
    const wan = CATALOG.find((m) => m.id === "wan-3")!;
    expect(fitModel(wan, { ...board, quality: "rough" }, services)).toMatchObject({ ok: true, seconds: 4, usd: 0.2 });
    expect(fitModel(wan, { ...board, quality: "final" }, services)).toMatchObject({ ok: true, seconds: 4, usd: 0.8 });
    // With no tier, it's in both lists, where the catalog puts it.
    const rough = chooseModels(CATALOG, { ...board, quality: "rough" }, services).ready.map((f) => f.model);
    const final = chooseModels(CATALOG, { ...board, quality: "final" }, services).ready.map((f) => f.model);
    expect(rough.indexOf("wan-3")).toBeLessThan(rough.indexOf("minimax-h3-max"));
    expect(final.indexOf("wan-3")).toBeLessThan(final.indexOf("minimax-h3-max-turbo"));
  });

  it("makes a long take with the models that make one, up to 30 seconds", () => {
    const c = chooseModels(CATALOG, { op: "video", prompt: "a long walk", start: "board", seconds: 24, quality: "final" }, services);
    expect(c.ready.map((f) => f.model)).toEqual(["wan-3", "kling-4", "seedance-2.5"]);
    expect(c.auto).toMatchObject({ model: "wan-3", seconds: 25, usd: 5 });
    expect(c.unfit.find((f) => f.model === "minimax-h3-max")).toMatchObject({ why: { reason: "Makes up to 15s; this shot is 24s", fix: "split" } });
  });

  it("makes a final from a prompt alone with a final that takes one", () => {
    const c = chooseModels(CATALOG, { op: "video", prompt: "the cat leaves", seconds: 3.2, quality: "final" }, services);
    expect(c.auto).toMatchObject({ model: "minimax-h3-max", seconds: 5, usd: 0.8 });
    // Kling 3 Pro takes a prompt alone only through Runway, which isn't connected here: something to set up, not a misfit.
    expect(c.setup.find((f) => f.model === "kling-3")).toMatchObject({ why: { kind: "connect", services: ["runway", "higgsfield"] } });
  });

  it("makes a final from references with one that takes them, and says why the others can't", () => {
    const c = chooseModels(CATALOG, { op: "video", prompt: "@cat leaves", refs: ["cat"], seconds: 3.2, quality: "final" }, services);
    expect(c.auto).toMatchObject({ model: "wan-3", endpoint: "alibaba/wan-3.0/reference-to-video", usd: 1 });
    // A rough model that takes them is still there, after the finals.
    expect(c.ready.map((f) => f.model)).toEqual(["wan-3", "seedance-2.5", "minimax-h3"]);
    expect(c.unfit.find((f) => f.model === "kling-3")).toMatchObject({ why: { reason: "Doesn't take references; a start frame made from them would do" } });
  });
});

describe("real people", () => {
  const assets: Project["assets"] = [
    {
      id: "beach",
      kind: "image",
      path: "beach.jpg",
      subjects: [
        { id: "face-1", label: "Theo", kind: "face", samples: [[0, 0.4, 0.2, 0.1, 0.1]] },
        { id: "dog", label: "Biscuit", kind: "object", samples: [[0, 0.6, 0.6, 0.2, 0.2]] },
      ],
    },
  ];
  const cast: CastMember[] = [
    { id: "theo", name: "Theo", kind: "character", seen: [{ asset: "beach", subject: "face-1" }] },
    { id: "biscuit", name: "Biscuit", kind: "character", seen: [{ asset: "beach", subject: "dog" }] },
    { id: "nana", name: "Nana", kind: "character", seen: [{ asset: "beach" }] },
    { id: "robot", name: "the robot", kind: "character", about: "a tin robot" },
    { id: "pier", name: "the pier", kind: "place", seen: [{ asset: "beach" }] },
    { id: "tabby", name: "the tabby", kind: "character", seen: [{ asset: "cat-photo" }] },
    { id: "grandpa", name: "Grandpa", kind: "character", seen: [{ asset: "old-photo" }] },
  ];

  it("are characters from the person's own photos, unless those say it's a thing or a pet", () => {
    const more: Project["assets"] = [...assets, { id: "cat-photo", kind: "image", path: "cat.jpg", subjects: [] }, { id: "old-photo", kind: "image", path: "grandpa.jpg" }];
    // Nana is the whole beach photo, which has a face in it; nobody looked for faces in Grandpa's, so he's taken to be
    // a person; the tabby's was looked through and has none; Biscuit was picked out as a thing.
    expect(realPeople(castOf("@theo, @biscuit, @nana, @tabby, @grandpa and @robot on @pier", cast), more)).toEqual(["Theo", "Nana", "Grandpa"]);
    expect(realPeople(castOf("@robot walks @biscuit along @pier", cast), assets)).toEqual([]);
  });

  it("rule out the models that won't draw them, before anything else, and leave the rest", () => {
    const shot = { op: "video" as const, prompt: "x", start: "board", seconds: 5, quality: "final" as const, realPeople: ["Theo", "Nana"] };
    const c = chooseModels(CATALOG, shot, services);
    // Seedance 2.5 draws them on one route only, Tein, which isn't connected here: that's something to set up, not a misfit.
    expect(c.unfit.some((f) => f.model === "seedance-2.5")).toBe(false);
    expect(c.setup.find((f) => f.model === "seedance-2.5")).toMatchObject({ why: { kind: "connect", reason: "With real people in it, runs only on tein", services: ["tein"] } });
    expect(c.unfit.find((f) => f.model === "gemini-omni-flash")).toMatchObject({ why: { kind: "fit", reason: "Won't draw real people, and Theo and Nana are from your own photos" } });
    const withTein = { ...services, tein: { label: "Tein", state: "ready" as const } };
    const seedance = CATALOG.find((m) => m.id === "seedance-2.5")!;
    // With Tein connected it runs there, and fal isn't offered beside it for this shot.
    const there = fitModel(seedance, shot, withTein);
    expect(there).toMatchObject({ ok: true, route: "tein", where: "Tein", endpoint: "seedance-2-5" });
    expect(there).not.toHaveProperty("also");
    expect(fitModel(seedance, { ...shot, via: "fal" }, withTein)).toMatchObject({ ok: false, why: { kind: "fit", reason: "Won't draw real people on fal, and Theo and Nana are from your own photos; it does on Tein" } });
    // With nobody real in it, both places run it and the cheaper one is taken.
    expect(fitModel(seedance, { ...shot, realPeople: undefined }, withTein)).toMatchObject({ ok: true, route: "tein", also: [{ route: "fal" }] });
    expect(c.ready.some((f) => f.model === "wan-3")).toBe(true);
    expect(chooseModels(CATALOG, { ...shot, realPeople: undefined }, services).ready.some((f) => f.model === "seedance-2.5")).toBe(true);
  });
});

describe("cast and sets in prompts", () => {
  const cast: CastMember[] = [
    {
      id: "cat",
      name: "the cat",
      kind: "character",
      about: "orange tabby, white chest, a notch in the left ear",
      images: ["cat-sheet"],
      variants: [{ id: "heist", about: "wearing a tiny black eye mask", images: ["cat-heist"] }],
    },
    { id: "alley", name: "the alley", kind: "place", about: "narrow, wet brick, steam from a grate" },
    { id: "noir", name: "noir", kind: "style", about: "black and white, hard shadows", images: ["noir-ref"] },
  ];

  it("finds who a prompt names, with a variant, then the others listed, each once", () => {
    const uses = castOf("@cat/heist slinks down @alley, past @dog, and @cat/heist looks back", cast, ["noir", "alley"]);
    expect(uses.map((u) => u.id)).toEqual(["cat/heist", "alley", "noir"]);
    expect(uses[0]!.variant?.about).toBe("wearing a tiny black eye mask");
  });

  it("names each one in words the model reads, described the first time, and says which picture is whom", () => {
    const uses = castOf("@cat/heist slinks down @alley, and @cat/heist looks back", cast, ["noir"]);
    // The variant's own picture only: the plain cat's shows it without the mask.
    const pictured = castPictures(uses);
    expect(pictured.map((p) => p.asset)).toEqual(["cat-heist", "noir-ref"]);
    expect(castPrompt("@cat/heist slinks down @alley, and @cat/heist looks back", uses, pictured.map((p) => p.use))).toBe(
      "the cat (orange tabby, white chest, a notch in the left ear; wearing a tiny black eye mask) slinks down the alley (narrow, wet brick, steam from a grate), and the cat looks back." +
        " In the style of noir (black and white, hard shadows). Reference pictures, in order: the cat, noir. Keep each one's features, markings and colors as they are there; draw them in the style asked for.",
    );
    // Someone not in the cast is left as written.
    expect(castPrompt("@dog barks", castOf("@dog barks", cast))).toBe("@dog barks");
  });

  it("draws a cast member in its own style when it has one, unless the prompt names that style anyway", () => {
    const drawn: CastMember[] = [
      ...cast.map((m) => (m.id === "cat" ? { ...m, style: "toon" } : m)),
      { id: "toon", name: "hand-drawn", kind: "style", about: "2D animation, clean ink lines" },
    ];
    // A cartoon cat in a noir alley: the cat says its own style, and the shot is in the project's.
    const uses = castOf("@cat strolls down @alley", drawn, ["noir"]);
    expect(castPrompt("@cat strolls down @alley", uses)).toBe(
      "the cat (orange tabby, white chest, a notch in the left ear; in the style of hand-drawn: 2D animation, clean ink lines) strolls down the alley (narrow, wet brick, steam from a grate)." +
        " In the style of noir (black and white, hard shadows).",
    );
    // A sheet of the cat in its style names the style itself, so the cat's description doesn't say it again.
    const sheet = "A reference sheet of @cat, in the style of @toon";
    expect(castPrompt(sheet, castOf(sheet, drawn))).toBe(
      "A reference sheet of the cat (orange tabby, white chest, a notch in the left ear), in the style of hand-drawn (2D animation, clean ink lines)",
    );
  });

  const make = (over: Partial<ProjectInput> = {}): Project =>
    Project.parse({
      schema: SCHEMA_VERSION,
      id: "t",
      title: "test",
      recipe: "film",
      brief: { goal: "test" },
      formats: [{ id: "port", label: "9:16", width: 1080, height: 1920, fps: 30 }],
      stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
      spine: "shots",
      assets: [{ id: "cat-sheet", kind: "image", path: "made/cat.jpg" }],
      tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
      shots: [],
      notes: [],
      ...over,
    });

  it("checks cast pictures are the project's own, ids can follow an @, and shots name cast that exists", () => {
    const p = make({
      cast: [
        { id: "cat", name: "the cat", kind: "character", images: ["cat-sheet"], variants: [{ id: "heist", about: "a mask", kept: ["heist-gone"] }], seen: [{ asset: "cat-sheet", subject: "face-1" }] },
        { id: "The Alley", name: "the alley", kind: "place", images: ["alley-photo"] },
      ],
      shots: [{ id: "s1", track: "pic", duration: 2, content: { kind: "generated", prompt: "x", cast: ["cat/heist", "dog"] }, fidelity: "idea" }],
    });
    expect(checkCut(p).map((i) => `${i.path}: ${i.message}`)).toEqual([
      'cast.0: unknown asset "heist-gone"',
      'cast.0.seen.0: "cat-sheet" has no subject "face-1"',
      `cast.1.id: "The Alley" can't follow an @: use lowercase letters, numbers and dashes`,
      'cast.1: unknown asset "alley-photo"',
      'shots.0.content.cast: no cast member "dog"',
    ]);
  });

  it("checks a style is a style in the cast, for the look and for a cast member", () => {
    const p = make({
      look: { style: "cat" },
      cast: [
        { id: "cat", name: "the cat", kind: "character", style: "toon" },
        { id: "toon", name: "hand-drawn", kind: "style" },
      ],
    });
    expect(checkCut(p).map((i) => `${i.path}: ${i.message}`)).toEqual(['look.style: no style "cat" in the cast']);
    expect(checkCut({ ...p, look: { style: "toon" }, cast: [{ ...p.cast![0]!, style: "noir" }, p.cast![1]!] }).map((i) => i.message)).toEqual(['no style "noir" in the cast']);
  });

  it("renames a member or a variant everywhere it's used, and refuses an id that's taken or can't follow an @", () => {
    const file = (): ProjectFile =>
      withCut({ schema: SCHEMA_VERSION, cuts: [], ...make() } as never, {
        ...make({
          look: { style: "noir" },
          cast: [...structuredClone(cast), { id: "dog", name: "the dog", kind: "character", style: "noir" }],
          assets: [{ id: "take1", kind: "image", path: "made/takes/take1.png", label: "@cat/heist in @alley", provenance: { source: "generated", prompt: "@cat/heist in @alley", cast: ["cat/heist", "alley"] } }],
          shots: [{ id: "s1", track: "pic", duration: 2, content: { kind: "generated", prompt: "@cat/heist sneaks past @cat-flap and @catnip, then @cat naps", cast: ["cat", "noir"] }, fidelity: "idea" }],
        }),
      });
    const f = file();
    expect(renameCast(f, "cat/heist", "masked")).toBe(true);
    expect(f.cast![0]!.variants![0]!.id).toBe("masked");
    expect(f.cuts[0]!.shots[0]!.content).toMatchObject({ prompt: "@cat/masked sneaks past @cat-flap and @catnip, then @cat naps", cast: ["cat", "noir"] });
    expect(f.assets[0]).toMatchObject({ label: "@cat/masked in @alley", provenance: { prompt: "@cat/masked in @alley", cast: ["cat/masked", "alley"] } });

    f.cuts[0]!.voice = { leadIn: 0.3, defaultGap: 0.5, tail: 1, lines: [{ id: "meow", text: "Meow.", duration: 0, words: [], speaker: "cat" }] };
    expect(checkReferences(f).filter((i) => i.path.includes("speaker"))).toEqual([]);
    expect(renameCast(f, "cat", "marmalade")).toBe(true);
    expect(f.cuts[0]!.voice!.lines[0]!.speaker).toBe("marmalade");
    f.cuts[0]!.voice!.lines[0]!.speaker = "alley";
    expect(checkReferences(f).filter((i) => i.path.includes("speaker")).map((i) => i.message)).toEqual(['no character "alley" in the cast']);
    f.cuts[0]!.voice!.lines[0]!.speaker = "marmalade";
    expect(f.cuts[0]!.shots[0]!.content).toMatchObject({ prompt: "@marmalade/masked sneaks past @cat-flap and @catnip, then @marmalade naps", cast: ["marmalade", "noir"] });
    expect(f.assets[0]!.provenance!.cast).toEqual(["marmalade/masked", "alley"]);

    // A style's new id follows it into the look and onto the members drawn in it.
    expect(renameCast(f, "noir", "film-noir")).toBe(true);
    expect([f.look?.style, f.cast![3]!.style, (f.cuts[0]!.shots[0]!.content as { cast: string[] }).cast[1]]).toEqual(["film-noir", "film-noir", "film-noir"]);
    expect(checkReferences(f).filter((i) => !i.message.startsWith("unknown asset"))).toEqual([]);

    const before = JSON.stringify(f);
    expect([renameCast(f, "alley", "dog"), renameCast(f, "alley", "The Alley"), renameCast(f, "marmalade/nope", "x"), renameCast(f, "ghost", "x")]).toEqual([false, false, false, false]);
    expect(JSON.stringify(f)).toBe(before);
  });

  it("merges a look into the plain one, for someone only ever seen that way", () => {
    const f = withCut({ schema: SCHEMA_VERSION, cuts: [], ...make() } as never, {
      ...make({
        cast: structuredClone(cast).map((m) => (m.id === "cat" ? { ...m, kept: ["cat-old"] } : m)),
        assets: [{ id: "take1", kind: "image", path: "made/takes/take1.png", label: "@cat/heist in @alley", provenance: { source: "generated", prompt: "@cat/heist in @alley", cast: ["cat/heist", "cat", "alley"] } }],
        shots: [
          { id: "s1", track: "pic", duration: 2, content: { kind: "generated", prompt: "@cat/heist sneaks past @cat-flap, then @cat/heist naps", cast: ["cat/heist", "noir"] }, fidelity: "idea" },
          { id: "s2", track: "pic", duration: 2, content: { kind: "placeholder", description: "@cat/heist on the roof" }, fidelity: "idea" },
        ],
      }),
    });
    expect(mergeLook(f, "cat/heist")).toBe(true);
    // What models read for the look, and the pictures they were given; the plain one's own wait in kept.
    const cat = f.cast![0]!;
    expect(cat).toMatchObject({ about: "orange tabby, white chest, a notch in the left ear; wearing a tiny black eye mask", images: ["cat-heist"], kept: ["cat-sheet", "cat-old"] });
    expect(cat.variants).toBeUndefined();
    expect(f.cuts[0]!.shots[0]!.content).toMatchObject({ prompt: "@cat sneaks past @cat-flap, then @cat naps", cast: ["cat", "noir"] });
    expect(f.cuts[0]!.shots[1]!.content).toMatchObject({ description: "@cat on the roof" });
    expect(f.assets[0]).toMatchObject({ label: "@cat in @alley", provenance: { prompt: "@cat in @alley", cast: ["cat", "alley"] } });
    expect(mergeLook(f, "cat/heist")).toBe(false);
  });

  it("merges a look's steps into the plain one: its chosen portrait and sheet, with the plain one's beside them", () => {
    const f = withCut({ schema: SCHEMA_VERSION, cuts: [], ...make() } as never, {
      ...make({
        cast: [
          {
            id: "will",
            name: "Will",
            kind: "character",
            about: "ginger hair",
            wears: "a doublet",
            portrait: "p1",
            portraits: ["p0"],
            sheet: "s1",
            variants: [{ id: "old", about: "a fake beard", portrait: "p2", sheets: ["s2"], wardrobe: ["w1"] }],
          },
        ],
      }),
    });
    expect(mergeLook(f, "will/old")).toBe(true);
    expect(f.cast![0]).toMatchObject({ about: "ginger hair", wears: "a doublet; a fake beard", portrait: "p2", portraits: ["p1", "p0"], sheet: "s1", sheets: ["s2"], wardrobe: ["w1"] });
  });

  it("keeps the proposals the person picked: new ones seen in their pictures, and more pictures for one already there", () => {
    const f: ProjectFile = withCut({ schema: SCHEMA_VERSION, cuts: [], ...make() } as never, {
      ...make({
        cast: [{ id: "cat", name: "the cat", kind: "character", seen: [{ asset: "p1" }] }],
        assets: ["p1", "p2", "p3", "p4"].map((id) => ({ id, kind: "image" as const, path: `${id}.jpg` })),
      }),
    });
    const proposals = [
      { id: "cat", kind: "character" as const, name: "Marmalade", about: "orange tabby", assets: ["p1", "p2"] },
      { id: "Aunt Rosa", kind: "character" as const, name: "Aunt Rosa", about: "curly gray hair", assets: ["p3", "gone"] },
      { id: "porch", kind: "place" as const, name: "The porch", assets: ["p4"] },
      { id: "shed", kind: "place" as const, name: "The shed", assets: ["p4"] },
    ];
    expect(keepCast(f, proposals, ["cat", "Aunt Rosa", "porch"])).toEqual({ added: ["aunt-rosa", "porch"], joined: ["cat"] });
    // The cat keeps its name and id, gains the new picture once, and its description where it had none.
    expect(f.cast![0]).toEqual({ id: "cat", name: "the cat", kind: "character", seen: [{ asset: "p1" }, { asset: "p2" }], about: "orange tabby" });
    expect(f.cast!.slice(1)).toEqual([
      { id: "aunt-rosa", kind: "character", name: "Aunt Rosa", about: "curly gray hair", seen: [{ asset: "p3" }] },
      { id: "porch", kind: "place", name: "The porch", seen: [{ asset: "p4" }] },
    ]);
    // One found in footage before it had a name takes the proposal's.
    f.cast![0]!.name = "";
    keepCast(f, proposals, ["cat"]);
    expect(f.cast![0]!.name).toBe("Marmalade");
    // A new one whose id is taken by a style gets one of its own.
    f.cast!.push({ id: "noir", name: "Noir", kind: "style" });
    expect(keepCast(f, [{ id: "noir", kind: "prop", name: "Noir hat", assets: ["p4"] }], ["noir"])).toEqual({ added: ["noir-2"], joined: [] });
  });

  it("is kept with the project, not a cut, when a cut is written back", () => {
    const r = parseFile({ ...withCut({ schema: SCHEMA_VERSION, cuts: [], ...make() } as never, make()), schema: SCHEMA_VERSION });
    expect(r.ok).toBe(true);
    const file = r.ok ? r.file : undefined!;
    const view = cutView(file);
    view.cast = [{ id: "cat", name: "the cat", kind: "character" }];
    const back = withCut(file, view);
    expect(back.cast?.map((m) => m.id)).toEqual(["cat"]);
    expect("cast" in back.cuts[0]!).toBe(false);
  });
});

describe("more cast than a model takes pictures of", () => {
  it("gives a character with a chosen sheet only that, else its chosen portrait, and a look its own or the plain one's", () => {
    const will: CastMember = {
      id: "will",
      name: "Will",
      kind: "character",
      about: "ginger hair",
      wears: "a dark doublet",
      portrait: "will-portrait",
      sheet: "will-sheet",
      images: ["will-photo"],
      variants: [
        { id: "bloodied", about: "stage blood on his face" },
        { id: "wet", about: "soaked", portrait: "wet-portrait" },
      ],
    };
    expect(picturesGiven(castOf("@will", [will])[0]!)).toEqual(["will-sheet"]);
    expect(picturesGiven(castOf("@will/bloodied", [will])[0]!)).toEqual(["will-sheet"]);
    expect(picturesGiven(castOf("@will/wet", [will])[0]!)).toEqual(["wet-portrait"]);
    // What they wear is read with who they are, then what's different in the look.
    expect(castPrompt("@will/bloodied runs", castOf("@will/bloodied runs", [will]))).toBe("Will (ginger hair; a dark doublet; stage blood on his face) runs");
  });

  it("gives the characters' pictures first, up to the most a still takes, and the rest only in words", () => {
    const pic = (id: string, kind: CastMember["kind"]): CastMember => ({ id, name: id, kind, about: `${id} look`, images: [`${id}-pic`] });
    const cast = [pic("kitchen", "place"), pic("mom", "character"), pic("dad", "character"), pic("kid", "character"), pic("cat", "character"), pic("mug", "prop")];
    const prompt = "@mom, @dad, @kid and @cat at breakfast in @kitchen, a @mug on the table";
    const uses = castOf(prompt, cast);
    const pictured = castPictures(uses, fewestStillRefs(CATALOG));
    // The first Nano Banana takes 4; the others take more (Nano Banana 2.1, 14), and are given more once picked.
    expect([fewestStillRefs(CATALOG), maxStillRefs(CATALOG)]).toEqual([4, 14]);
    expect(pictured.map((p) => p.asset)).toEqual(["mom-pic", "dad-pic", "kid-pic", "cat-pic"]);
    expect(castPictures(uses, 10).map((p) => p.asset)).toEqual(["mom-pic", "dad-pic", "kid-pic", "cat-pic", "mug-pic", "kitchen-pic"]);
    // Everyone is still described; only the pictured are named as references.
    expect(castPrompt(prompt, uses, pictured.map((p) => p.use))).toMatch(/in kitchen \(kitchen look\), a mug \(mug look\) on the table\. Reference pictures, in order: mom, dad, kid, cat\./);
  });

  it("gives each character's main picture, then their next ones while there's room, three each at most, before places", () => {
    const cast: CastMember[] = [
      { id: "set", name: "the forest", kind: "place", images: ["forest-1", "forest-2"] },
      {
        id: "will",
        name: "Will",
        kind: "character",
        images: ["will-1", "will-2", "will-3", "will-4"],
        variants: [
          { id: "old", about: "a cotton-wool beard", images: ["will-portrait", "will-sheet"], kept: ["will-portrait-2"] },
          { id: "young", about: "clean-shaven" },
        ],
      },
      { id: "bell", name: "Bell", kind: "character", images: ["bell-1", "bell-2"] },
    ];
    const uses = castOf("@will/old faces @bell in @set", cast);
    // A look gets its own pictures, never mixed with the plain one's; one with none yet gets the plain one's. Kept ones aren't given.
    expect(picturesGiven(uses[0]!)).toEqual(["will-portrait", "will-sheet"]);
    expect(picturesGiven(castOf("@will/young", cast)[0]!)).toEqual(["will-1", "will-2", "will-3"]);
    expect(castPictures(uses, 4).map((p) => p.asset)).toEqual(["will-portrait", "will-sheet", "bell-1", "bell-2"]);
    expect(castPictures(uses, 10).map((p) => p.asset)).toEqual(["will-portrait", "will-sheet", "bell-1", "bell-2", "forest-1", "forest-2"]);
    const pictured = castPictures(uses, 5).map((p) => p.use);
    expect(castPrompt("@will/old faces @bell in @set", uses, pictured)).toMatch(/Reference pictures, in order: 2 pictures of Will, 2 pictures of Bell, the forest./);
  });
});

describe("a generated shot framed like a clip", () => {
  const make = (over: Partial<ProjectInput> = {}): Project =>
    Project.parse({
      schema: SCHEMA_VERSION,
      id: "t",
      title: "test",
      recipe: "film",
      brief: { goal: "test" },
      formats: [
        { id: "port", label: "9:16", width: 1080, height: 1920, fps: 30 },
        { id: "land", label: "16:9", width: 1920, height: 1080, fps: 30 },
      ],
      stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
      spine: "shots",
      assets: [{ id: "take1", kind: "video", path: "made/takes/take1.mp4", duration: 5, subjects: [{ id: "face-1", label: "Lily", kind: "face", by: "vision", samples: [[0, 0.4, 0.3, 0.2, 0.2]] }] }],
      tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
      shots: [],
      notes: [],
      ...over,
    });

  it("follows a subject found on its take, in a format of another shape, and checks the subject is there", () => {
    const shot = (follow: string) => ({
      id: "s1",
      track: "pic",
      duration: 3,
      content: { kind: "generated" as const, prompt: "x", take: "take1", takes: ["take1"], reframe: { land: { x: 0.5, y: 0.5, zoom: 1, follow } }, effects: [{ kind: "spotlight" as const, subject: follow }] },
      fidelity: "rough" as const,
    });
    expect(pictureOf(make({ shots: [shot("face-1")] }).shots[0]!.content)).toMatchObject({ asset: "take1", reframe: { land: { follow: "face-1" } } });
    expect(checkCut(make({ shots: [shot("face-1")] }))).toEqual([]);
    expect(checkCut(make({ shots: [shot("face-9")] })).map((i) => i.message)).toEqual(['"take1" has no subject "face-9"', '"take1" has no subject "face-9"']);
  });
});

describe("copying movement from a clip", () => {
  const scail = CATALOG.find((m) => m.id === "scail-2")!;
  const comfy: ServiceState = { label: "ComfyUI", state: "ready" };
  const drive = { asset: "fight", from: 2, to: 5 };

  it("needs a stretch of a clip and a picture of who moves, and runs on ComfyUI at no charge", () => {
    expect(fitModel(scail, { op: "video", prompt: "x", start: "board", seconds: 3 }, { comfy })).toMatchObject({ ok: false, why: { kind: "fit", reason: expect.stringContaining("Copies the movement") } });
    expect(fitModel(scail, { op: "video", prompt: "x", drive, seconds: 3 }, { comfy })).toMatchObject({ ok: false, why: { reason: expect.stringContaining("Needs a picture of who moves") } });
    expect(fitModel(scail, { op: "video", prompt: "x", start: "board", drive, seconds: 3 }, { comfy })).toMatchObject({ ok: true, route: "comfy", where: "ComfyUI", endpoint: "scail2-animation", seconds: 4, usd: 0 });
    expect(fitModel(scail, { op: "video", prompt: "x", start: "board", drive, seconds: 3 }, {})).toMatchObject({ ok: false, why: { kind: "connect", services: ["comfy"] } });
  });

  it("is the only model that follows a clip, so Auto picks it for a rough or a final, and the others say why not", () => {
    for (const quality of ["rough", "final"] as const) {
      const choices = chooseModels(CATALOG, { op: "video", prompt: "x", start: "board", drive, seconds: 3, quality }, { fal, comfy });
      expect(choices.auto?.model).toBe("scail-2");
      expect(choices.unfit.find((f) => f.model === "kling-3")).toMatchObject({ why: { reason: "Doesn't copy movement from a clip" } });
    }
    // Without a clip to follow, it isn't offered.
    expect(chooseModels(CATALOG, { op: "video", prompt: "x", start: "board", seconds: 3 }, { fal, comfy }).auto?.model).not.toBe("scail-2");
  });

  it("refuses a stretch longer than its workflow makes, and says splitting it would do", () => {
    expect(fitModel(scail, { op: "video", prompt: "x", start: "board", drive: { ...drive, to: 12 }, seconds: 10 }, { comfy })).toMatchObject({ ok: false, why: { fix: "split" } });
  });

  it("widens the stretch by the take's spare evenly where the clip has room, else on the side that has it", () => {
    expect(driveWindow(drive, 4, 20)).toEqual({ from: 1.5, to: 5.5, lead: 0.5 });
    // At the clip's start, all of it after; at its end, all of it before.
    expect(driveWindow({ ...drive, from: 0, to: 3 }, 4, 20)).toEqual({ from: 0, to: 4, lead: 0 });
    expect(driveWindow({ ...drive, from: 17, to: 20 }, 4, 20)).toEqual({ from: 16, to: 20, lead: 1 });
    // A clip with no room either side is followed as it is.
    expect(driveWindow({ ...drive, from: 0, to: 3 }, 4, 3)).toEqual({ from: 0, to: 3, lead: 0 });
  });
});

describe("lip sync", () => {
  // A model that makes a picture talk, at least 5 seconds of it, and one that changes the mouths in a clip.
  const talk: CatalogModel = {
    id: "talk",
    label: "Talk",
    by: "test",
    note: "",
    ops: ["video"],
    takes: { start: true, speech: true },
    lengths: { min: 5, max: 60 },
    aspects: ["any"],
    routes: [{ via: "fal", shape: "talk", endpoints: { talk: "fal/talk" }, price: { perSecond: 0.08 } }],
  };
  const dub: CatalogModel = { ...talk, id: "dub", label: "Dub", takes: { clip: true, speech: true }, lengths: { min: 1, max: 30 }, routes: [{ via: "fal", shape: "dub", endpoints: { dub: "fal/dub" }, price: { perSecond: 0.1 } }] };
  const speech = { lines: ["l1"], from: 2, to: 5 };
  const clip = { asset: "take1", from: 0.5, to: 3.5 };

  it("makes a picture say what it's given, made as long as the model's shortest when the shot is shorter", () => {
    expect(fitModel(talk, { op: "video", prompt: "x", start: "board", speech, seconds: 3 }, { fal })).toMatchObject({ ok: true, endpoint: "fal/talk", seconds: 5, usd: 0.4 });
    expect(fitModel(talk, { op: "video", prompt: "x", speech, seconds: 3 }, { fal })).toMatchObject({ ok: false, why: { reason: "Needs a picture of who speaks: start from the shot's board" } });
    expect(fitModel(talk, { op: "video", prompt: "x", start: "board", seconds: 3 }, { fal })).toMatchObject({ ok: false, why: { reason: expect.stringContaining("Lip-syncs") } });
    expect(fitModel(talk, { op: "video", prompt: "x", clip, speech, seconds: 3 }, { fal })).toMatchObject({ ok: false, why: { reason: expect.stringContaining("doesn't change the mouths in a clip") } });
  });

  it("changes the mouths in a clip, and models that don't lip-sync say so", () => {
    expect(fitModel(dub, { op: "video", prompt: "x", clip, speech, seconds: 3 }, { fal })).toMatchObject({ ok: true, endpoint: "fal/dub", seconds: 4 });
    expect(fitModel(dub, { op: "video", prompt: "x", start: "board", speech, seconds: 3 }, { fal })).toMatchObject({ ok: false, why: { reason: expect.stringContaining("Changes the mouths in a clip") } });
    expect(fitModel(fixed, { op: "video", prompt: "x", start: "board", speech, seconds: 3 }, { fal })).toMatchObject({ ok: false, why: { reason: "Doesn't lip-sync to a voice" } });
    expect(chooseModels([fixed, talk, dub], { op: "video", prompt: "x", clip, speech, seconds: 3 }, { fal }).auto?.model).toBe("dub");
  });

  it("picks from the catalog: H3 Max Lip Sync to make a board talk, Kling's for a rough redo of the mouths and sync-3 for a final", () => {
    const talking = { op: "video" as const, prompt: "x", start: "board", speech, seconds: 3 };
    expect(chooseModels(CATALOG, talking, { fal }).auto).toMatchObject({ model: "minimax-h3-max-lipsync", seconds: 5, usd: 0.25 });
    expect(chooseModels(CATALOG, { ...talking, quality: "final" }, { fal }).auto).toMatchObject({ model: "minimax-h3-max-lipsync", usd: 0.8 });
    const redo = { op: "video" as const, prompt: "x", clip, speech, seconds: 3 };
    expect(chooseModels(CATALOG, { ...redo, quality: "rough" }, { fal }).auto?.model).toBe("kling-lipsync");
    expect(chooseModels(CATALOG, { ...redo, quality: "final" }, { fal }).auto?.model).toBe("sync-3");
    // Longer than Kling's 10 seconds, a rough goes to LatentSync, $0.20 a take.
    expect(chooseModels(CATALOG, { ...redo, seconds: 12, quality: "rough" }, { fal }).auto).toMatchObject({ model: "latentsync", usd: 0.2 });
    // Without fal, InfiniteTalk on your own card; past its workflow's 14.7 seconds, only on fal.
    const comfy: ServiceState = { label: "ComfyUI", state: "ready" };
    expect(chooseModels(CATALOG, talking, { comfy }).auto).toMatchObject({ model: "infinitetalk", route: "comfy", usd: 0 });
    expect(fitModel(CATALOG.find((m) => m.id === "infinitetalk")!, { ...talking, seconds: 20 }, { fal, comfy })).toMatchObject({ ok: true, route: "fal", seconds: 21, usd: 4.2 });
  });

  it("bills a short take as the service does, and LongCat in its own lengths", () => {
    const redo = { op: "video" as const, prompt: "x", clip, speech, seconds: 3, quality: "rough" as const };
    // Kling's 4 seconds cost what 5 do; LatentSync's are $0.20 a take up to 40 seconds.
    expect(fitModel(CATALOG.find((m) => m.id === "kling-lipsync")!, redo, { fal })).toMatchObject({ ok: true, seconds: 4, usd: 0.07 });
    expect(fitModel(CATALOG.find((m) => m.id === "latentsync")!, { ...redo, count: 2 }, { fal })).toMatchObject({ ok: true, seconds: 4, usd: 0.4 });
    const longcat = CATALOG.find((m) => m.id === "longcat-avatar")!;
    expect(fitModel(longcat, { op: "video", prompt: "x", start: "board", speech, seconds: 3 }, { fal })).toMatchObject({ ok: true, seconds: 5.8, usd: 0.87 });
    expect(fitModel(longcat, { op: "video", prompt: "x", start: "board", speech, seconds: 7, quality: "final" }, { fal })).toMatchObject({ ok: true, seconds: 10.8, usd: 3.24 });
  });

  it("says where what a model makes isn't free to use commercially, place by place", () => {
    const comfy: ServiceState = { label: "ComfyUI", state: "ready" };
    const h3 = CATALOG.find((m) => m.id === "minimax-h3")!;
    const board = { op: "video" as const, prompt: "x", start: "board", seconds: 5 };
    // On your card, its license leaves out the US; on fal, nothing does.
    const local = fitModel(h3, board, { fal, comfy });
    expect(local).toMatchObject({ ok: true, route: "comfy", commercial: { use: "no", why: expect.stringContaining("US") }, also: [{ route: "fal" }] });
    expect(local.ok && local.also![0]!.commercial).toBeUndefined();
    expect(fitModel(h3, { ...board, via: "fal" }, { fal, comfy })).not.toHaveProperty("commercial");
    expect(fitModel(CATALOG.find((m) => m.id === "flux3-klein")!, { op: "image", prompt: "x" }, { comfy })).toMatchObject({ commercial: { use: "limited" } });
    expect(fitModel(CATALOG.find((m) => m.id === "longcat-avatar")!, { op: "video", prompt: "x", start: "board", speech, seconds: 3 }, { fal })).toMatchObject({ commercial: { use: "unclear" } });
    expect(commercialWords({ use: "no", why: "" })).toBe("not for commercial use");
  });

  it("widens what's said to the take's length, and keeps it in step with the clip whose mouths change", () => {
    // The cut's voice is silent past either end, so it widens evenly, or all after at the cut's start.
    expect(speechWindow(speech, undefined, 5)).toEqual({ from: 1, to: 6, lead: 1 });
    expect(speechWindow({ lines: ["l1"], from: 0, to: 3 }, undefined, 4)).toEqual({ from: 0, to: 4, lead: 0 });
    // The take showing began half a second before the shot: the sound moves with the clip, which has only so much room.
    expect(speechWindow(speech, clip, 4, 4)).toEqual({ from: 1.5, to: 5.5, lead: 0.5, clip: { from: 0, to: 4 } });
  });
});

describe("models on your own hardware", () => {
  // Like Wan 2.2: up to 10 seconds on fal, up to 5 on a ComfyUI workflow.
  const both: CatalogModel = {
    ...ranged,
    id: "both",
    label: "Both",
    routes: [
      { via: "fal", shape: "wan", endpoints: { start: "fal/both" }, price: { perSecond: 0.08 } },
      { via: "comfy", shape: "wan-i2v", endpoints: { start: "both-workflow" }, price: { perSecond: 0 }, lengths: { min: 1.1, max: 5 }, wait: 300 },
    ],
  };
  const comfy = (over: Partial<ServiceState> = {}): ServiceState => ({ label: "ComfyUI", state: "ready", ...over }) as ServiceState;
  const ask = (seconds: number) => ({ op: "video" as const, prompt: "x", start: "board", seconds });

  it("makes it on your card where it fits there, at no charge, and on the service where only that makes it long enough", () => {
    expect(fitModel(both, ask(3), { fal, comfy: comfy() })).toMatchObject({ ok: true, route: "comfy", seconds: 3.5, usd: 0, wait: 300, also: [{ route: "fal", usd: 0.28 }] });
    expect(fitModel(both, ask(7), { fal, comfy: comfy() })).toMatchObject({ ok: true, route: "fal", seconds: 7.5 });
    expect(fitModel(both, ask(7), { comfy: comfy() })).toMatchObject({ ok: false, why: { kind: "connect", services: ["fal"] } });
    expect(fitModel({ ...both, routes: [both.routes[1]!] }, ask(7), { comfy: comfy() })).toMatchObject({ ok: false, why: { kind: "fit", fix: "split", reason: "Makes up to 5s; this shot is 7s" } });
  });

  it("says what a connected ComfyUI is missing, or that its machine can't run it, and points a laptop at another computer", () => {
    const local = { ...both, routes: [both.routes[1]!] };
    const missing = comfy({ endpoints: { "both-workflow": { kind: "install", reason: "ComfyUI is missing what Both needs: model loras/x.safetensors is missing" } } });
    expect(fitModel(local, ask(3), { comfy: missing })).toMatchObject({ ok: false, why: { kind: "install", service: "comfy", reason: expect.stringContaining("missing") } });
    const mac = comfy({ endpoints: { "both-workflow": { kind: "machine", reason: "Needs an NVIDIA graphics card, and this computer has Apple M3 Pro" } } });
    expect(fitModel(local, ask(3), { comfy: mac })).toMatchObject({ ok: false, why: { kind: "machine", reason: "Needs an NVIDIA graphics card, and this computer has Apple M3 Pro" } });
    // Not connected, on a laptop that couldn't run it either: still something to set up, by connecting another computer.
    const laptop: ServiceState = { label: "ComfyUI", state: "missing", endpoints: { "both-workflow": { kind: "machine", reason: "Needs an NVIDIA graphics card, and this computer has only Intel UHD Graphics 620: connect a ComfyUI on a computer that can" } } };
    expect(fitModel(local, ask(3), { comfy: laptop })).toMatchObject({ ok: false, why: { kind: "connect", reason: "Runs on ComfyUI. Needs an NVIDIA graphics card, and this computer has only Intel UHD Graphics 620: connect a ComfyUI on a computer that can" } });
    // The service can still make it where the machine can't.
    expect(fitModel(both, ask(3), { fal, comfy: mac })).toMatchObject({ ok: true, route: "fal" });
  });

  it("puts what a machine can't run with what can't make the shot, and what's missing with what the person can set up", () => {
    const mac = comfy({ endpoints: { "scail2-animation": { kind: "machine", reason: "Needs an NVIDIA graphics card" }, "wan22-ti2v-5b": { kind: "install", reason: "ComfyUI is missing what Wan 2.2 5B needs" } } });
    const drive = chooseModels(CATALOG, { op: "video", prompt: "x", start: "board", drive: { asset: "fight", from: 0, to: 2 }, seconds: 2 }, { comfy: mac });
    expect(drive.unfit.find((f) => f.model === "scail-2")).toMatchObject({ why: { kind: "machine" } });
    expect(drive.auto?.model).toBe("wan-2.2-animate");
    const board = chooseModels(CATALOG, { op: "video", prompt: "x", start: "board", seconds: 3 }, { comfy: mac });
    expect(board.setup.find((f) => f.model === "wan-2.2-5b")).toMatchObject({ why: { kind: "install" } });
    expect(board.auto?.model).toBe("minimax-h3");
  });
});

describe("a take's spare", () => {
  const clip = { op: "video" as const, prompt: "the cat leaves", seconds: 3.2 };

  it("makes a clip from a start frame a little longer at its end, and one with an end frame too no longer than the shot", () => {
    const model: CatalogModel = { ...ranged, takes: { start: true, end: true }, routes: [{ via: "fal", shape: "wan", endpoints: { start: "fal/ranged" }, price: { perSecond: 0.08 } }] };
    expect(fitModel(model, { ...clip, start: "board" }, services)).toMatchObject({ ok: true, seconds: 3.2 + HANDLE });
    expect(fitModel(model, { ...clip, start: "board", end: "pose" }, services)).toMatchObject({ ok: true, seconds: 3.2 });
    // From words alone there's no frame it has to open on, so it keeps its spare either side.
    expect(fitModel(ranged, clip, services)).toMatchObject({ ok: true, seconds: 3.2 + 2 * HANDLE });
  });

  it("keeps a short shot from paying for a whole extra second", () => {
    const wan = CATALOG.find((m) => m.id === "wan-3")!;
    expect(fitModel(wan, { ...clip, start: "board", seconds: 2.02 }, services)).toMatchObject({ ok: true, seconds: 3 });
    expect(fitModel(wan, { ...clip, start: "board", seconds: 5.24 }, services)).toMatchObject({ ok: true, seconds: 6 });
  });

  it("starts the shot on the start frame, or where it ends on the end frame, or in the middle of a clip from words", () => {
    const none = () => undefined;
    expect(takeLead({ start: "board", shotSeconds: 3.2 }, 6, none)).toBe(0);
    expect(takeLead({ start: "board", end: "pose", shotSeconds: 3.2 }, 6, none)).toBeCloseTo(2.8);
    expect(takeLead({ shotSeconds: 3.2 }, 6, none)).toBe(HANDLE);
    expect(takeLead({ shotSeconds: 3.2 }, 3.6, none)).toBeCloseTo(0.2);
    expect(takeLead({ start: "board", end: "pose", shotSeconds: 6 }, 5, none)).toBe(0);
    // One that follows a clip starts where the stretch does, whatever frames it has.
    expect(takeLead({ start: "board", drive: { asset: "fight", from: 2, to: 5 }, seconds: 4, shotSeconds: 3 }, 4, () => 10)).toBe(HANDLE);
  });
});

const shotProject = (assets: Asset[], cast: CastMember[], shots: ProjectInput["shots"]) =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "t",
    title: "test",
    recipe: "film",
    brief: { goal: "test" },
    formats: [{ id: "wide", label: "16:9", width: 1920, height: 1080, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "shots",
    assets,
    cast,
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots,
    notes: [],
  });

describe("showing another take", () => {
  const madeBy = (id: string, model: string, provider: string, params: Record<string, unknown>, kind: "video" | "image" = "video"): Asset => ({
    id,
    kind,
    path: `${id}.mp4`,
    ...(kind === "video" ? { duration: 5 } : {}),
    provenance: { source: "generated", provider, params: { model, ...params } },
  });
  const wan = madeBy("wan-take", "wan-3", "fal", { prompt: "he dives in and catches both", start: "hall", end: "catch", seconds: 5, shotSeconds: 4 });
  const kling = madeBy("kling-take", "kling-4", "fal", { prompt: "he streaks in", start: "hall", seconds: 5, shotSeconds: 4 });
  const shown = { kind: "generated" as const, prompt: "an empty hall", clipPrompt: "he streaks in", take: "kling-take", takes: ["kling-take", "wan-take"], model: "kling-4", provider: "fal", start: "hall", in: 0.8 };

  it("says who made it, what it was told, and what it started and ended on", () => {
    const next = showTake(shown, wan, [wan, kling], 4);
    expect(next).toMatchObject({ take: "wan-take", model: "wan-3", clipPrompt: "he dives in and catches both", prompt: "an empty hall", start: "hall", end: "catch", in: 1 });
  });

  it("drops the end frame and the trim the take it replaces had", () => {
    const next = showTake({ ...shown, take: "wan-take", end: "catch", in: 1 }, kling, [wan, kling], 4);
    expect(next).toMatchObject({ take: "kling-take", model: "kling-4", clipPrompt: "he streaks in", start: "hall" });
    expect(next).not.toHaveProperty("end");
    expect(next).not.toHaveProperty("in");
  });

  it("only says who made a take that doesn't record how it was asked for, leaving the trim it was given", () => {
    const old = madeBy("old-take", "wan-3", "fal", { seconds: 5 });
    expect(showTake(shown, old, [old], 4)).toMatchObject({ take: "old-take", model: "wan-3", clipPrompt: "he streaks in", start: "hall", in: 0.8 });
  });

  it("has a still say what's in the frame, with no trim", () => {
    const board = madeBy("board", "gpt-image", "chatgpt", { prompt: "the hall, with the book mid-fall" }, "image");
    const next = showTake(shown, board, [board], 4);
    expect(next).toMatchObject({ take: "board", model: "gpt-image", provider: "chatgpt", prompt: "the hall, with the book mid-fall", clipPrompt: "he streaks in" });
    expect(next).not.toHaveProperty("in");
  });

  it("keeps the board of the clip a take with changed mouths was made from", () => {
    const dub = madeBy("dub", "sync-3", "fal", { prompt: "he talks", clip: { asset: "wan-take", from: 0, to: 4 }, speech: { lines: ["boast"], from: 1, to: 5 }, seconds: 4, shotSeconds: 4 });
    expect(showTake(shown, dub, [dub], 4)).toMatchObject({ take: "dub", model: "sync-3", start: "hall", speech: { lines: ["boast"] } });
  });

  it("follows a take set by hand in an edit, keeping a trim the same edit set", () => {
    const before = shotProject([wan, kling], [], [{ id: "catch", track: "pic", duration: 4, content: shown, fidelity: "rough" }]);
    const after = structuredClone(before);
    Object.assign(after.shots[0]!.content, { take: "wan-take" });
    followTakes(before, after);
    expect(after.shots[0]!.content).toMatchObject({ take: "wan-take", model: "wan-3", end: "catch", in: 1 });

    const trimmed = structuredClone(before);
    Object.assign(trimmed.shots[0]!.content, { take: "wan-take", in: 0.25 });
    followTakes(before, trimmed);
    expect(trimmed.shots[0]!.content).toMatchObject({ take: "wan-take", model: "wan-3", in: 0.25 });
  });
});

describe("who's in a clip's frames", () => {
  const made = (id: string, cast: string[], refs: string[] = []): Asset => ({ id, kind: "image", path: `${id}.png`, provenance: { source: "generated", cast, refs } });
  const old = { id: "hamlet", name: "Hamlet (Sam)", kind: "character", about: "a black cloak", portrait: "old-face" } as CastMember;
  const young = { id: "young-hamlet", name: "Young Hamlet (Max)", kind: "character", about: "a boy", portrait: "young-face" } as CastMember;
  const epic = { id: "epic", name: "Period epic", kind: "style", about: "steel-blue" } as CastMember;
  const assets: Asset[] = [
    made("old-face", ["hamlet"]),
    made("young-face", ["young-hamlet"]),
    made("gallery", ["hamlet", "epic"], ["old-face"]),
    // Edited from a frame he's in, to take him out of it: all it was made with is the style.
    made("empty-hall", ["epic"], ["gallery"]),
    made("catch", ["hamlet", "epic"], ["empty-hall", "old-face"]),
    made("face-swap", ["epic"], ["empty-hall", "young-face"]),
    made("boy", ["young-hamlet", "epic"]),
    { id: "photo", kind: "image", path: "photo.jpg" },
    { id: "lifted", kind: "image", path: "still.png", provenance: { source: "synth" } },
  ];
  const project = { assets, cast: [old, young, epic] };
  const missing = (frames: string[], prompt: string, intent = "") => missingFromFrames(project, frames, castOf(prompt, project.cast), [prompt, intent]);

  it("catches a character who's in neither frame, though the prompt only describes them and the shot says who", () => {
    expect(missing(["empty-hall"], "The red-haired young man streaks into frame", "Hamlet streaks in and catches both")).toEqual(["Hamlet (Sam)"]);
  });

  it("is content when an end frame has them, or they're named on the frame", () => {
    expect(missing(["empty-hall", "catch"], "He streaks in", "Hamlet streaks in and catches both")).toEqual([]);
    expect(missing(["gallery"], "@hamlet lets go")).toEqual([]);
  });

  it("goes by the cast pictures a frame was given, as an edit doesn't always name them", () => {
    expect(missing(["face-swap"], "@young-hamlet raises the skull")).toEqual([]);
  });

  it("takes a younger self for someone of that name, but not for someone asked for by id", () => {
    expect(missing(["boy"], "Flashback, the lamp swings", "Hamlet at the university")).toEqual([]);
    expect(missing(["boy"], "@hamlet watches the lamp swing")).toEqual(["Hamlet (Sam)"]);
  });

  it("doesn't take Young Hamlet for Hamlet as well when working out who a shot is about", () => {
    expect(missing(["boy"], "Young Hamlet works alone")).toEqual([]);
    expect(missing(["gallery"], "Young Hamlet works alone")).toEqual(["Young Hamlet (Max)"]);
  });

  it("says nothing of a frame it knows nothing about: a photo, a still from a clip", () => {
    expect(missing(["photo"], "@hamlet walks away")).toEqual([]);
    expect(missing(["lifted"], "@hamlet walks away")).toEqual([]);
    expect(missing(["empty-hall", "photo"], "@hamlet walks away")).toEqual([]);
  });

  it("names everyone missing from a clip with no pictures at all, and nobody from a clip of no one", () => {
    expect(missing([], "@hamlet walks away")).toEqual(["Hamlet (Sam)"]);
    expect(missing(["empty-hall"], "The camera trucks past the columns, mist drifting")).toEqual([]);
  });
});

describe("what a clip is told", () => {
  const p = shotProject([], [{ id: "cat", name: "the cat", kind: "character", about: "orange tabby" } as CastMember], [
    { id: "a", track: "pic", duration: 3, content: { kind: "generated", prompt: "@cat on a wall at dawn", clipPrompt: "@cat jumps down" }, fidelity: "rough" },
    { id: "b", track: "pic", duration: 3, content: { kind: "generated", prompt: "@cat in the alley" }, fidelity: "board" },
  ]);

  it("says what moves in a clip and what's in the frame in a still, a clip having the still's words until it has its own", () => {
    expect(shotNeeds(p, "a", "video").prompt).toBe("@cat jumps down");
    expect(shotNeeds(p, "a", "image").prompt).toBe("@cat on a wall at dawn");
    expect(shotNeeds(p, "a").prompt).toBe("@cat on a wall at dawn");
    expect(shotNeeds(p, "b", "video").prompt).toBe("@cat in the alley");
  });

  it("follows a cast member renamed in a clip's words, and in what a take recorded", () => {
    const f: ProjectFile = {
      schema: SCHEMA_VERSION,
      id: "t",
      title: "t",
      sources: [],
      brief: { goal: "t" },
      assets: [{ id: "take", kind: "video", path: "t.mp4", provenance: { source: "generated", params: { prompt: "@cat jumps down" } } }],
      cast: [{ id: "cat", name: "the cat", kind: "character", about: "orange tabby" } as CastMember],
      cuts: [{ id: "main", name: "Main", recipe: "film", spec: {}, formats: p.formats, stages: p.stages, spine: "shots", tracks: p.tracks, shots: structuredClone(p.shots), notes: [] }],
    } as ProjectFile;
    expect(renameCast(f, "cat", "marmalade")).toBe(true);
    expect(f.cuts[0]!.shots[0]!.content).toMatchObject({ clipPrompt: "@marmalade jumps down" });
    expect(f.assets[0]!.provenance?.params?.prompt).toBe("@marmalade jumps down");
  });
});

describe("keeping a clip's camera", () => {
  const seedance = CATALOG.find((m) => m.id === "seedance-2.5")!;
  const tein: ServiceState = { label: "Tein", state: "ready" };
  // A blockout: seven seconds of a cut, drawn vertical.
  const camera = { cut: "blockout", format: "vertical", from: 0, to: 7 };
  const ask = { op: "video" as const, prompt: "x", camera, seconds: 7, aspect: "9:16" };

  it("runs on Seedance, through Tein before fal, as long as the clip, and is billed for the clip's seconds too", () => {
    const rough = fitModel(seedance, { ...ask, refs: ["board"] }, { fal, tein });
    expect(rough).toMatchObject({ ok: true, route: "tein", endpoint: "seedance-2-5", seconds: 7, aspect: "9:16", also: [{ route: "fal" }] });
    // 7 seconds of clip and 7 of take, at the rate for a take with a reference video.
    expect(rough.ok && rough.usd).toBeCloseTo(14 * 0.0809, 3);
    const final = fitModel(seedance, { ...ask, quality: "final", count: 2 }, { fal, tein });
    expect(final.ok && final.usd).toBeCloseTo(2 * 14 * 0.4595, 3);
    // Without a clip the same take costs its own seconds at the plain rate.
    const plain = fitModel(seedance, { op: "video", prompt: "x", seconds: 7, aspect: "9:16", via: "tein" }, { fal, tein });
    expect(plain.ok && plain.usd).toBeCloseTo(8 * 0.1355, 3);
    expect(fitModel(seedance, ask, {})).toMatchObject({ ok: false, why: { kind: "connect", services: ["fal", "tein", "runway", "higgsfield"] } });
  });

  it("is billed by Runway for the clip at half the take's rate, and never less than its least for a take", () => {
    const runway = { runway: { label: "Runway", state: "ready" } } satisfies Record<string, ServiceState>;
    // 7 seconds of take at $0.20 and 7 of clip at $0.10: $0.15 for each second of the two.
    const rough = fitModel(seedance, { ...ask, refs: ["board"] }, runway);
    expect(rough).toMatchObject({ ok: true, route: "runway", endpoint: "seedance2_5", seconds: 7 });
    expect(rough.ok && rough.usd).toBeCloseTo(7 * 0.2 + 7 * 0.1, 3);
    const final = fitModel(seedance, { ...ask, quality: "final" }, runway);
    expect(final.ok && final.usd).toBeCloseTo(7 * 0.68 + 7 * 0.34, 3);
    // The shortest rough without a clip would be $0.80 by the second: its least.
    expect(fitModel(seedance, { op: "video", prompt: "x", seconds: 3, aspect: "9:16" }, runway)).toMatchObject({ ok: true, seconds: 4, usd: 0.8 });
    expect(fitModel(seedance, { op: "video", prompt: "x", seconds: 9, aspect: "9:16", quality: "final" }, runway)).toMatchObject({ ok: true, seconds: 10, usd: 6.8 });
    // Whether it draws real people there isn't known, so it isn't offered for them.
    expect(fitModel(seedance, { op: "video", prompt: "x", seconds: 5, realPeople: ["Mara"] }, runway)).toMatchObject({ ok: false, why: { kind: "connect", services: ["tein"] } });
  });

  it("is billed by Higgsfield at its dearer rate for the take's seconds only, not the clip's", () => {
    const higgsfield = { higgsfield: { label: "Higgsfield", state: "ready" } } satisfies Record<string, ServiceState>;
    const rough = fitModel(seedance, { ...ask, refs: ["board"] }, higgsfield);
    expect(rough).toMatchObject({ ok: true, route: "higgsfield", endpoint: "bytedance/seedance-2.5/reference-to-video", seconds: 7 });
    expect(rough.ok && rough.usd).toBeCloseTo(7 * 0.1387, 3);
    const final = fitModel(seedance, { ...ask, quality: "final" }, higgsfield);
    expect(final.ok && final.usd).toBeCloseTo(7 * 0.7858, 3);
    // Without a clip, its plain rate, and no least for a take.
    expect(fitModel(seedance, { op: "video", prompt: "x", seconds: 3, aspect: "9:16" }, higgsfield)).toMatchObject({ ok: true, endpoint: "bytedance/seedance-2.5/text-to-video", seconds: 4, usd: 0.471 });
    // Whether it draws real people there isn't known, so it isn't offered for them.
    expect(fitModel(seedance, { op: "video", prompt: "x", seconds: 5, realPeople: ["Mara"] }, higgsfield)).toMatchObject({ ok: false, why: { kind: "connect", services: ["tein"] } });
  });

  it("runs through fal too, which bills the clip's seconds as well at its own lower rate, and draws no real people", () => {
    const rough = fitModel(seedance, { ...ask, refs: ["board"] }, { fal });
    expect(rough).toMatchObject({ ok: true, route: "fal", endpoint: "bytedance/seedance-2.5/us/reference-to-video", seconds: 7, aspect: "9:16" });
    // fal's rate with a reference video is its plain one times 0.0128/0.0214 a token (0.0140/0.0234 at 1080p), with no least.
    expect(rough.ok && rough.usd).toBeCloseTo(14 * 0.2205 * (0.0128 / 0.0214), 2);
    const final = fitModel(seedance, { ...ask, quality: "final", via: "fal" }, { fal, tein });
    expect(final).toMatchObject({ ok: true, route: "fal" });
    expect(final.ok && final.usd).toBeCloseTo(14 * 1.164 * (0.014 / 0.0234), 2);
    expect(fitModel(seedance, { ...ask, camera: { ...camera, to: 2 }, seconds: 4 }, { fal })).toMatchObject({ ok: true, usd: Math.round(6 * 0.1319 * 1000) / 1000 });
    // With someone from the person's own photos it runs through Tein alone.
    expect(fitModel(seedance, { ...ask, realPeople: ["mara"] }, { fal, tein })).toMatchObject({ ok: true, route: "tein" });
    expect(fitModel(seedance, { ...ask, realPeople: ["mara"] }, { fal, tein })).not.toHaveProperty("also");
    expect(fitModel(seedance, { ...ask, realPeople: ["mara"] }, { fal })).toMatchObject({ ok: false, why: { kind: "connect", services: ["tein"] } });
  });

  it("is billed as Tein bills: the clip rounded up to a tenth plus the take, and never under the take and two thirds more", () => {
    expect(billedWithClip(7, 7, 2 / 3)).toBe(14);
    expect(billedWithClip(10, 12.04, 2 / 3)).toBe(22.1);
    // Tein's own examples of the least it bills: 7 for a 4-second take, 17 for 10, 25 for 15, 50 for 30.
    expect([billedWithClip(4, 2, 2 / 3), billedWithClip(10, 3, 2 / 3), billedWithClip(15, 2, 2 / 3), billedWithClip(30, 12, 2 / 3)]).toEqual([7, 17, 25, 50]);
    expect(billedWithClip(5, 3)).toBe(8);
  });

  it("takes 2 to 30 seconds of clip and no start frame, and no other model keeps a camera", () => {
    expect(fitModel(seedance, { ...ask, camera: { ...camera, to: 1.5 }, seconds: 1.5 }, { tein })).toMatchObject({ ok: false, why: { reason: "Follows 2s of clip at least; this is 1.5s" } });
    expect(fitModel(seedance, { ...ask, camera: { ...camera, to: 40 }, seconds: 40 }, { tein })).toMatchObject({ ok: false, why: { fix: "split" } });
    expect(fitModel(seedance, { ...ask, start: "board" }, { tein })).toMatchObject({ ok: false, why: { reason: expect.stringContaining("not from a start frame") } });
    // A short blockout still gets the shortest take Seedance makes.
    expect(fitModel(seedance, { ...ask, camera: { ...camera, to: 3 }, seconds: 3 }, { tein })).toMatchObject({ ok: true, seconds: 4 });
    const choices = chooseModels(CATALOG, ask, { fal, tein });
    expect(choices.auto?.model).toBe("seedance-2.5");
    expect(choices.unfit.find((f) => f.model === "kling-3")).toMatchObject({ why: { reason: "Doesn't keep the camera of a clip it's given" } });
  });

  it("starts where the clip does, with anything it runs over at its end", () => {
    expect(takeLead({ camera, seconds: 4, shotSeconds: 3 }, 4, () => undefined)).toBe(0);
    // A take from a prompt alone has its spare either side.
    expect(takeLead({ seconds: 4, shotSeconds: 3 }, 4, () => undefined)).toBe(0.5);
  });

  // A blockout: two camera moves, 4 and 3 seconds, drawn wide and vertical.
  const move = (id: string, duration: number) => ({ id, track: "pic", duration, content: { kind: "coded" as const, component: "scenes/Blockout.tsx#Blockout" }, fidelity: "board" as const });
  const blockout = Project.parse({
    ...shotProject([], [], [move("orbit", 4), move("push", 3)]),
    formats: [
      { id: "wide", label: "21:9", width: 2520, height: 1080, fps: 30 },
      { id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 },
    ],
  });

  it("follows the blockout in its format closest in shape, all of it or from the first shot named to the last", () => {
    expect(blockoutStretch(blockout, undefined, "16:9")).toMatchObject({ format: { id: "wide" }, from: 0, to: 7, missing: [], has: ["orbit", "push"] });
    expect(blockoutStretch(blockout, undefined, "4:5")).toMatchObject({ format: { id: "vertical" }, from: 0, to: 7 });
    expect(blockoutStretch(blockout, ["push"], "9:16")).toMatchObject({ format: { id: "vertical" }, from: 4, to: 7, missing: [] });
    // Named out of order, it's still the stretch from the first to the last; a shot that isn't there is said.
    expect(blockoutStretch(blockout, ["push", "orbit"], "9:16")).toMatchObject({ from: 0, to: 7 });
    expect(blockoutStretch(blockout, ["orbit", "crane"], "9:16")).toMatchObject({ from: 0, to: 4, missing: ["crane"] });
  });

  it("is kept on the shot by its cut and shots, so the next take follows the blockout as it is then", () => {
    expect(cameraOnShot({ ...camera, shots: ["orbit"] })).toEqual({ cut: "blockout", shots: ["orbit"] });
    expect(cameraOnShot(camera)).toEqual({ cut: "blockout" });
    expect(cameraOnShot({ asset: "walk", from: 1, to: 5 })).toEqual({ asset: "walk", from: 1, to: 5 });
    const take: Asset = { id: "orbit-take", kind: "video", path: "orbit-take.mp4", duration: 4, provenance: { source: "generated", provider: "tein", params: { model: "seedance-2.5", prompt: "she turns", camera: { ...camera, to: 4, shots: ["orbit"] }, seconds: 4 } } };
    const plain: Asset = { id: "plain-take", kind: "video", path: "plain-take.mp4", duration: 5, provenance: { source: "generated", provider: "fal", params: { model: "wan-3", prompt: "she turns", start: "board", seconds: 5 } } };
    const shown = { kind: "generated" as const, prompt: "a courtyard", take: "plain-take", takes: ["plain-take", "orbit-take"], start: "board" };
    const followed = showTake(shown, take, [take, plain], 4);
    expect(followed).toMatchObject({ take: "orbit-take", camera: { cut: "blockout", shots: ["orbit"] } });
    expect(followed).not.toHaveProperty("start");
    // Going back to a take that kept no camera, the shot keeps none.
    expect(showTake(followed, plain, [take, plain], 4)).not.toHaveProperty("camera");
  });
});
