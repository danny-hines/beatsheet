import { describe, expect, it } from "vitest";
import { cutView, parseFile, resolveTimeline, SCHEMA_V1, STAGE_IDS, type Project, type Shot } from "@beatsheet/schema";
import { designChecks, reviewPaths, reviewRange } from "../src/review.ts";

const project = (shots: Shot[], look?: Project["look"]): Project => {
  const r = parseFile({
    schema: SCHEMA_V1,
    id: "demo",
    title: "Demo",
    recipe: "story",
    brief: { goal: "launch" },
    formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "voice",
    assets: [],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [],
    notes: [],
  });
  if (!r.ok) throw new Error("bad fixture");
  return { ...cutView(r.file, "main"), shots, look };
};
const kit = (id: string, component: string, transition?: string): Shot => ({
  id,
  track: "pic",
  fidelity: "rough",
  content: { kind: "coded", component },
  ...(transition ? { transition: { kind: transition } } : {}),
});
const brand = { colors: { paper: "#fff", ink: "#000", accent: "#f60" } };

describe("the design pass's notes on a cut", () => {
  it("asks for the brand's look, scenes of its own, variety and restraint", () => {
    const notes = designChecks(project([kit("a", "kit:Title", "slam"), kit("b", "kit:Title", "glitch"), kit("c", "kit:Title", "flash"), kit("d", "kit:Stat")]));
    expect(notes.join("\n")).toMatch(/no \/look/);
    expect(notes.join("\n")).toMatch(/All 4 designed shots are stock kit scenes/);
    expect(notes.join("\n")).toMatch(/kit:Title is used 3 times \(a, b, c\)/);
    expect(notes.join("\n")).toMatch(/3 shots come in with a slam, glitch, flash or whip/);
  });

  it("asks for a look when there are titles but no designed shots", () => {
    const title: Shot = { id: "t", track: "pic", fidelity: "rough", content: { kind: "text", text: "Seabrook" } };
    expect(designChecks(project([title])).join("\n")).toMatch(/from the footage and the occasion/);
    expect(designChecks(project([title], brand))).toEqual([]);
  });

  it("is quiet about a branded cut whose hero moments are its own", () => {
    expect(designChecks(project([kit("a", "scenes/Hook.tsx#Hook"), kit("b", "kit:Stat"), kit("c", "scenes/End.tsx#End", "slam")], brand))).toEqual([]);
    expect(designChecks(project([]))).toEqual([]);
  });
});

describe("where review_cut keeps its preview video and sheets", () => {
  it("keeps them under .cache/review named by cut and format, sanitizing odd ids", () => {
    const p = reviewPaths("/ws/projects/demo", "teaser", "vertical");
    expect(p.video).toBe("/ws/projects/demo/.cache/review/teaser-vertical.mp4");
    expect(p.sheet).toBe("/ws/projects/demo/.cache/review/teaser-vertical-sheet.jpg");
    expect(p.designs).toBe("/ws/projects/demo/.cache/review/teaser-vertical-designs.jpg");
    expect(reviewPaths("/ws/projects/demo", "../bad cut", "9:16").video).toBe("/ws/projects/demo/.cache/review/-bad-cut-9-16.mp4");
    expect(reviewPaths("/ws/projects/demo", "main", "wide", { from: 60, to: 74.8 }).video).toBe("/ws/projects/demo/.cache/review/main-wide-60s-74_8s.mp4");
  });
});

describe("reviewRange", () => {
  const timed = () =>
    resolveTimeline(
      project([
        { id: "s1", track: "pic", fidelity: "rough", start: { kind: "time", t: 0 }, duration: 5, content: { kind: "text", text: "One" } },
        { id: "s2", track: "pic", fidelity: "rough", start: { kind: "time", t: 5 }, duration: 8, content: { kind: "text", text: "Two" } },
        { id: "s3", track: "pic", fidelity: "rough", start: { kind: "time", t: 13 }, duration: 7, content: { kind: "text", text: "Three" } },
      ]),
    );

  it("defaults to the full cut and resolves explicit times or shot lists", () => {
    const tl = timed();
    expect(reviewRange(tl)).toEqual({ from: 0, to: 20, ranged: false });
    expect(reviewRange(tl, { from: 12, to: 25 })).toEqual({ from: 12, to: 20, ranged: true });
    expect(reviewRange(tl, { shots: ["s2", "s3"] })).toEqual({ from: 5, to: 20, ranged: true });
    expect(reviewRange(tl, { shots: ["s1", "s3"] })).toEqual({ from: 0, to: 20, ranged: false });
  });

  it("refuses unknown shots or an empty range", () => {
    const tl = timed();
    expect(() => reviewRange(tl, { shots: ["nope"] })).toThrow(/nope/);
    expect(() => reviewRange(tl, { from: 15, to: 10 })).toThrow(/Nothing to review/);
    expect(() => reviewRange(tl, { from: 25 })).toThrow(/Nothing to review/);
  });
});
