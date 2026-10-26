import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileScene } from "../src/scenes.ts";

const dir = mkdtempSync(join(tmpdir(), "beatsheet-scenes-"));
const write = (name: string, code: string) => {
  const file = join(dir, name);
  writeFileSync(file, code);
  return file;
};

describe("compiling scenes", () => {
  it("takes React, Remotion, three and the kit from the page, bundles the rest, and lists the exports", async () => {
    write("helper.ts", "export const twice = (n: number) => n * 2;");
    const file = write(
      "Scene.tsx",
      `import { AbsoluteFill } from "remotion";
       import { useScene, Title } from "@beatsheet/motion";
       import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
       import { twice } from "./helper";
       export function Scene() { const s = useScene(); void STLLoader; return <AbsoluteFill><Title text={String(twice(s.t))} /></AbsoluteFill>; }
       export const Other = () => null;`,
    );
    const r = await compileScene(file);
    if ("error" in r) throw new Error(r.error);
    expect(r.exports.sort()).toEqual(["Other", "Scene"]);
    expect(r.hosts.sort()).toEqual(["@beatsheet/motion", "react/jsx-runtime", "remotion", "three"]);
    // The page's copies are required by name; the loader's own code and the helper are inside the bundle.
    expect(r.code).toContain('require("three")');
    expect(r.code).toContain("STLLoader");
    expect(r.code).toContain("n * 2");
  });

  it("says where a scene doesn't compile", async () => {
    const r = await compileScene(write("Broken.tsx", "export const X = () => <div>{oops</div>;"));
    expect("error" in r && r.error).toMatch(/Broken\.tsx:1:\d+/);
  });
});
