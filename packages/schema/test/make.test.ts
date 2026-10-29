import { describe, expect, it } from "vitest";
import {
  aspectOf,
  CATALOG,
  checkCut,
  chooseModels,
  fitModel,
  HANDLE,
  Project,
  resolveTimeline,
  SCHEMA_VERSION,
  shotNeeds,
  STAGE_IDS,
  type CatalogModel,
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
  it("asks for the shortest length that covers the shot with a little either side", () => {
    const f = fitModel(fixed, { op: "video", prompt: "a cat", seconds: 3.2, aspect: "16:9" }, services);
    expect(f).toMatchObject({ ok: true, route: "fal", endpoint: "fal/fixed/t2v", seconds: 5, aspect: "16:9" });
    // 4.5s plus the handles is over 5, so it's the 10-second take.
    expect(fitModel(fixed, { op: "video", prompt: "a cat", seconds: 4.5 }, services)).toMatchObject({ ok: true, seconds: 10 });
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
    expect(chooseModels(CATALOG, { op: "image", prompt: "a cat on a porch", aspect: "9:16" }, services).auto).toMatchObject({ model: "nano-banana", aspect: "9:16" });
    expect(chooseModels(CATALOG, { op: "video", prompt: "a cat leaves", start: "board", seconds: 3.2 }, services).auto).toMatchObject({ model: "kling-2.5-turbo", seconds: 5 });
    for (const m of CATALOG)
      for (const r of m.routes) {
        expect(r.endpoints.text ?? r.endpoints.start ?? r.endpoints.refs, `${m.id} on ${r.via}`).toBeTruthy();
        if (m.takes.start) expect(r.endpoints.start, `${m.id} starts from a picture on ${r.via}`).toBeTruthy();
        if (m.takes.refs) expect(r.endpoints.refs, `${m.id} takes references on ${r.via}`).toBeTruthy();
      }
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
