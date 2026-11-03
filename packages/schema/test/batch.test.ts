import { describe, expect, it } from "vitest";
import { buildBatch, checkCut, Project, SCHEMA_VERSION, STAGE_IDS, type Note, type NoteTarget } from "../src/index.ts";

const project = (notes: Note[]): Project =>
  Project.parse({
    schema: SCHEMA_VERSION,
    id: "t",
    title: "test",
    recipe: "test",
    brief: { goal: "test" },
    formats: [{ id: "land", label: "16:9", width: 1920, height: 1080, fps: 30 }],
    stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])),
    spine: "shots",
    assets: [{ id: "a", kind: "video", path: "a.mp4", label: "Beach", duration: 30 }],
    tracks: [{ id: "pic", kind: "picture", label: "Picture" }],
    shots: ["s1", "s2", "s3"].map((id) => ({ id, track: "pic", label: `The ${id}`, duration: 2, content: { kind: "clip", asset: "a" }, fidelity: "rough" })),
    notes,
  });
const note = (target: NoteTarget): Note => ({ id: "n1", text: "warmer", status: "working", target, author: "you", createdAt: "2026-11-02T00:00:00Z" });

describe("a batch of notes", () => {
  it("a note on one shot carries that shot", () => {
    const p = project([note({ kind: "shot", shot: "s2" })]);
    const [n] = buildBatch(p, p.notes).notes;
    expect(n!.on).toBe("s2 · The s2");
    expect(n!.shot).toMatchObject({ id: "s2", plays: "0:02.00–0:04.00", content: "Beach (a)" });
    expect(n!.shots).toBeUndefined();
  });

  it("a note left on several shots carries every one of them, in the order they play", () => {
    const p = project([note({ kind: "shot", shot: "s3", also: ["s1"] })]);
    const [n] = buildBatch(p, p.notes).notes;
    expect(n!.on).toBe("s3 · The s3 and 1 more shot");
    expect(n!.shot).toBeUndefined();
    expect(n!.shots!.map((s) => `${s.id} ${s.plays}`)).toEqual(["s1 0:00.00–0:02.00", "s3 0:04.00–0:06.00"]);
  });

  it("every shot a note is on has to exist", () => {
    const p = project([note({ kind: "shot", shot: "s1", also: ["s9"] })]);
    expect(checkCut(p)).toEqual([{ path: "notes.0.target", message: 'unknown shot "s9"' }]);
  });
});
