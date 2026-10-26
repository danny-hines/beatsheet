import { describe, expect, it } from "vitest";
import { cutView, parseFile, SCHEMA_V1, STAGE_IDS, type Project, type Shot } from "@beatsheet/schema";
import { designChecks } from "../src/review.ts";

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
