import { describe, expect, it } from "vitest";
import { OPENING } from "../src/agents.ts";
import { readStudioMessage, studioSession } from "../src/agent/session.ts";

const opening = `We're working on the beatsheet project "Muse Cam" (id muse-cam), on its cut "9:16 · 1 min" (cut 9-16-1-min). This conversation is about that cut: pass cut "9-16-1-min" to the cut-level tools. Call get_project to see where it stands.`;

describe("which cut a session belongs to", () => {
  it("reads the project and cut from the studio's opening", () => {
    expect(studioSession({ id: "s1", updatedAt: "2026-10-25T00:00:00Z", prompt: opening })).toMatchObject({ project: "muse-cam", title: "Muse Cam", cut: "9-16-1-min", cutName: "9:16 · 1 min" });
  });

  it("keeps sessions from before cuts had their own, as the whole project's", () => {
    const old = `We're working on the beatsheet project "Muse Cam" (id muse-cam). Call get_project to see where it stands.`;
    const s = studioSession({ id: "s0", updatedAt: "2026-10-24T00:00:00Z", prompt: old });
    expect(s).toMatchObject({ project: "muse-cam", title: "Muse Cam" });
    expect(s?.cut).toBeUndefined();
    expect(OPENING.test("We're working in beatsheet. Call list_projects")).toBe(true);
  });

  it("shows the opening in the transcript as a new session on the cut", () => {
    expect(readStudioMessage(`${opening}\n\nMake it calmer.`)).toEqual({ text: "Make it calmer.", display: "New session on 9:16 · 1 min", notes: undefined });
  });
});
