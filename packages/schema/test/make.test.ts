import { describe, expect, it } from "vitest";
import {
  aspectOf,
  CATALOG,
  castOf,
  castPictures,
  picturesGiven,
  castPrompt,
  checkCut,
  checkReferences,
  chooseModels,
  cutView,
  driveWindow,
  fitModel,
  HANDLE,
  fewestStillRefs,
  maxStillRefs,
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
  STAGE_IDS,
  withCut,
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
    expect(fitModel(gpt, { op: "image", prompt: "x", aspect: "9:16" }, both)).toMatchObject({ ok: true, route: "chatgpt", where: "ChatGPT plan", usd: 0, also: [{ route: "openai", where: "OpenAI", usd: 0.03 }] });
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "openai" }, both)).toMatchObject({ ok: true, route: "openai", endpoint: "gpt-image-2.5-flare", usd: 0.03 });
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "openai" }, both)).not.toHaveProperty("also");
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "chatgpt" }, { openai: both.openai })).toMatchObject({ ok: false, why: { kind: "connect", reason: "Runs on chatgpt" } });
    expect(fitModel(gpt, { op: "image", prompt: "x", via: "meta" }, both)).toMatchObject({ ok: false, why: { kind: "fit", reason: "GPT Image doesn't run on meta" } });
    // fal sells it too, for someone with only a fal key.
    expect(fitModel(gpt, { op: "image", prompt: "x" }, { fal })).toMatchObject({ ok: true, route: "fal", endpoint: "openai/gpt-image-2.5/flare/text-to-image", usd: 0.03 });
    // A plan whose image tool isn't on yet doesn't stop the key from making it.
    const muse = CATALOG.find((m) => m.id === "muse-image")!;
    const gated = { meta: { label: "Meta", state: "ready" }, "muse-code": { label: "Muse Code plan", state: "failing", detail: "not on yet" } } satisfies Record<string, ServiceState>;
    expect(fitModel(muse, { op: "image", prompt: "x" }, gated)).toMatchObject({ ok: true, route: "meta", usd: 0.01 });
    expect(fitModel(muse, { op: "image", prompt: "x" }, gated)).not.toHaveProperty("also");
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
        expect(r.endpoints.text ?? r.endpoints.start ?? r.endpoints.refs ?? r.endpoints.drive, `${m.id} on ${r.via}`).toBeTruthy();
        // One that follows a clip takes its start picture with the clip, at the one endpoint.
        if (m.takes.drive) expect(r.endpoints.drive, `${m.id} follows a clip on ${r.via}`).toBeTruthy();
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
    expect(fitModel(wan, { ...board, quality: "rough" }, services)).toMatchObject({ ok: true, seconds: 5, usd: 0.25 });
    expect(fitModel(wan, { ...board, quality: "final" }, services)).toMatchObject({ ok: true, seconds: 5, usd: 1 });
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
    expect(c.unfit.find((f) => f.model === "kling-3")).toMatchObject({ why: { reason: "Nowhere runs Kling 3 Pro with only a prompt" } });
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
    expect(c.unfit.find((f) => f.model === "seedance-2.5")).toMatchObject({ why: { kind: "fit", reason: "Won't draw real people, and Theo and Nana are from your own photos" } });
    expect(c.unfit.find((f) => f.model === "gemini-omni-flash")).toMatchObject({ why: { kind: "fit" } });
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
    expect(fitModel(both, ask(3), { fal, comfy: comfy() })).toMatchObject({ ok: true, route: "comfy", seconds: 4, usd: 0, wait: 300, also: [{ route: "fal", usd: 0.32 }] });
    expect(fitModel(both, ask(7), { fal, comfy: comfy() })).toMatchObject({ ok: true, route: "fal", seconds: 8 });
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
