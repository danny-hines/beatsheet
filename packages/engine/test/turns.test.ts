import { describe, expect, it } from "vitest";
import { branchCut, parseFile, SCHEMA_V1, STAGE_IDS, type ProjectFile } from "@beatsheet/schema";
import { answerMessage, describeChanges } from "../src/turns.ts";

const base = (): ProjectFile => {
  const r = parseFile({
    schema: SCHEMA_V1,
    id: "trip",
    title: "Trip",
    recipe: "montage",
    brief: { goal: "reel" },
    formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "music",
    assets: [
      { id: "a", kind: "video", path: "a.mp4", duration: 5 },
      { id: "b", kind: "video", path: "b.mp4", duration: 5 },
    ],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: [],
    notes: [],
  });
  if (!r.ok) throw new Error("bad fixture");
  return r.file;
};

describe("what a turn changed", () => {
  it("names logging, the brief and new cuts", () => {
    const before = base();
    const after = structuredClone(before);
    after.assets[0]!.rating = 5;
    after.assets[1]!.label = "Kids at the parade";
    after.brief.audience = "Family";
    after.cuts[0]!.shots = [{ id: "s1", track: "pic", content: { kind: "clip", asset: "a" }, fidelity: "rough" }];
    const { file } = branchCut(after, "main", { name: "Bouncy take", origin: { by: "agent" } });
    expect(describeChanges(before, file)).toEqual(["Logged 2 clips", "Updated the brief", "Made a cut: Bouncy take", "Main cut: 1 shot changed", "Bouncy take: 1 shot"]);
  });

  it("says nothing when nothing changed", () => {
    expect(describeChanges(base(), base())).toEqual([]);
  });
});

describe("answers", () => {
  it("put what the person typed before the notes", () => {
    const msg = answerMessage("trip", { who: "you", since: "", cut: "main" }, { text: "punchier please", notes: "(Attached: 2 beatsheet notes …)" });
    expect(msg).toBe("punchier please\n\n(Attached: 2 beatsheet notes …)");
  });

  it("give the card's other questions their picks, or leave them to the agent", () => {
    const turn = {
      who: "you" as const,
      since: "",
      cut: "main",
      ask: {
        kind: "choose" as const,
        message: "Which directions?",
        options: [
          { id: "o1", label: "Sweet recap" },
          { id: "o2", label: "Bouncy highlights" },
        ],
        questions: [{ id: "look", message: "And which look?", options: [{ id: "look-1", label: "Misty coast" }, { id: "look-2", label: "Golden hour" }] }],
      },
    };
    expect(answerMessage("trip", turn, { picks: ["o2"], also: { look: ["look-1"] } })).toBe(
      'On project trip, cut main, I picked "Bouncy highlights" (o2) for "Which directions?".\n\nFor "And which look?" (look), I picked "Misty coast" (look-1).',
    );
    expect(answerMessage("trip", turn, { picks: ["o1"] })).toContain(`For "And which look?" (look), no pick: it's your call.`);
  });
});
