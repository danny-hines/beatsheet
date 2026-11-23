import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rootsEnv, rootsFrom } from "../src/paths.ts";

const checkout = () => join("/", "code", "beatsheet");
const never = () => {
  throw new Error("asked for the checkout");
};

describe("beatsheet's folders", () => {
  it("are all the repository in a checkout", () => {
    const repo = checkout();
    expect(rootsFrom({}, checkout)).toEqual({
      resources: repo,
      workspace: repo,
      runtime: join(repo, ".beatsheet"),
      projects: join(repo, "projects"),
      examples: join(repo, "examples"),
    });
  });

  it("come apart for an installed app: what ships is read from one place, projects and agents live in another", () => {
    const resources = join("/", "Applications", "beatsheet.app", "Contents", "Resources", "beatsheet");
    const workspace = join("/", "Users", "sam", "Movies", "beatsheet");
    const r = rootsFrom({ BEATSHEET_RESOURCES: resources, BEATSHEET_WORKSPACE: workspace }, never);
    expect(r).toEqual({
      resources,
      workspace,
      runtime: join(workspace, ".beatsheet"),
      projects: join(workspace, "projects"),
      examples: join(resources, "examples"),
    });
  });

  it("keep scratch and projects wherever they're put", () => {
    const runtime = join("/", "Users", "sam", "Library", "Application Support", "beatsheet", "runtime");
    const projects = join("/", "Volumes", "Footage", "projects");
    const r = rootsFrom({ BEATSHEET_RUNTIME: runtime, BEATSHEET_PROJECTS: projects }, checkout);
    expect(r.runtime).toBe(runtime);
    expect(r.projects).toBe(projects);
    expect(r.workspace).toBe(checkout());
  });

  it("take an empty setting as not set", () => {
    expect(rootsFrom({ BEATSHEET_RESOURCES: "", BEATSHEET_WORKSPACE: "", BEATSHEET_RUNTIME: "", BEATSHEET_PROJECTS: "" }, checkout)).toEqual(rootsFrom({}, checkout));
  });

  it("are handed to a child process whole, so it lands in the same ones", () => {
    const r = rootsFrom({ BEATSHEET_RESOURCES: join("/", "app"), BEATSHEET_WORKSPACE: join("/", "home"), BEATSHEET_PROJECTS: join("/", "elsewhere") }, never);
    expect(rootsFrom(rootsEnv(r), never)).toEqual(r);
  });
});
