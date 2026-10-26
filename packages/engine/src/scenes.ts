/**
 * Scenes: designed shots the agent writes as React components (kinetic type, cards, a phone showing the site, an
 * exploded 3D model with labels), kept in the project's scenes/ folder and compiled here with esbuild for the studio's
 * player and the renderer. React, Remotion, three and beatsheet's motion kit come from the page, so a scene shares their
 * one copy (and Remotion's clock) with the composition; anything else it imports is bundled in.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { build, type Plugin } from "esbuild";
import { expandHome, projectDir, REPO } from "./paths.ts";
import { loadFile } from "./store.ts";

/** What the page provides; a scene's imports of these are handed the page's own copy. */
export const HOST_MODULES = ["react", "react/jsx-runtime", "react-dom", "remotion", "@beatsheet/motion", "three"];

/** Where a project's scene code lives: its codeRoot, else the project folder. Shots name files relative to it. */
export function codeRoot(projectId: string): string {
  const { doc, dir } = loadFile(projectId);
  return doc.codeRoot ? resolve(dir, expandHome(doc.codeRoot)) : dir;
}

/** The folder new scenes are written to. */
export const scenesDir = (projectId: string) => join(projectDir(projectId), "scenes");

const inside = (root: string, p: string) => p === root || p.startsWith(root + sep);

/** A file a shot names, made absolute; refuses anything outside the code folder. */
export function sceneFile(projectId: string, path: string): string {
  const root = codeRoot(projectId);
  const file = resolve(root, path);
  if (!inside(root, file)) throw new Error(`${path} is outside the project's code folder`);
  return file;
}

export type Compiled = { code: string; hosts: string[]; exports: string[] } | { error: string };

const cache = new Map<string, { inputs: string[]; stamp: string; result: Compiled }>();
const stampOf = (files: string[]) => files.map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0)).join("|");

/**
 * Compiles a scene file (and whatever it imports) into one CommonJS module for the page to run, with the page's own
 * React, Remotion, three and kit. Cached until any file it's built from changes.
 */
export async function compileScene(file: string, nodeModules: string[] = []): Promise<Compiled> {
  const hit = cache.get(file);
  if (hit && hit.stamp === stampOf(hit.inputs)) return hit.result;
  if (!existsSync(file)) return { error: `There's no ${basename(file)} in the project's scenes` };
  const hosts = new Set<string>();
  const host: Plugin = {
    name: "host-modules",
    setup(b) {
      // Exactly these specifiers; three's own subpaths (loaders, controls) are bundled and import "three" from here.
      const filter = new RegExp(`^(${HOST_MODULES.map((m) => m.replace(/[/@.-]/g, (c) => `\\${c}`)).join("|")})$`);
      b.onResolve({ filter }, (args) => {
        hosts.add(args.path);
        return { path: args.path, external: true };
      });
    },
  };
  let result: Compiled;
  try {
    const out = await build({
      entryPoints: [file],
      bundle: true,
      write: false,
      metafile: true,
      format: "cjs",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      loader: { ".svg": "text", ".glsl": "text", ".json": "json" },
      nodePaths: [...nodeModules, join(REPO, "node_modules")],
      plugins: [host],
      logLevel: "silent",
      sourcemap: "inline",
    });
    const meta = out.metafile!.outputs[Object.keys(out.metafile!.outputs)[0]!]!;
    const inputs = Object.keys(out.metafile!.inputs).map((p) => (isAbsolute(p) ? p : resolve(p)));
    const code = out.outputFiles[0]!.text;
    // CommonJS output lists its exports in one __export(...) call: { Name: () => Name, … }.
    const listed = /__export\(\w+, \{([\s\S]*?)\}\);/.exec(code)?.[1];
    const exports = listed ? [...listed.matchAll(/(?:^|,)\s*(\w+):/g)].map((m) => m[1]!) : (meta.exports ?? []);
    result = { code, hosts: [...hosts], exports };
    cache.set(file, { inputs, stamp: stampOf(inputs), result });
    return result;
  } catch (err) {
    const errors = (err as { errors?: { text: string; location?: { file: string; line: number; column: number; lineText: string } }[] }).errors;
    const lines = errors?.length
      ? errors.slice(0, 5).map((e) => (e.location ? `${relative(dirname(file), e.location.file) || basename(file)}:${e.location.line}:${e.location.column}: ${e.text}\n    ${e.location.lineText.trim()}` : e.text))
      : [err instanceof Error ? err.message : String(err)];
    result = { error: lines.join("\n") };
    return result;
  }
}

/** What exports a compiled scene has, without running it (for the agent and get_project). */
export async function sceneExports(projectId: string, path: string): Promise<Compiled> {
  const root = codeRoot(projectId);
  return compileScene(sceneFile(projectId, path), [join(root, "node_modules")]);
}

const WRITABLE = new Set([".tsx", ".ts", ".jsx", ".js", ".css", ".json", ".svg", ".glsl", ".md"]);

/**
 * Writes a scene file into the project's scenes/ folder and compiles it, so mistakes come back straight away. Returns
 * the path shots use (relative to the code folder) and what it exports, or the compiler's errors.
 */
export async function writeScene(projectId: string, name: string, code: string): Promise<{ path: string; result: Compiled }> {
  const clean = name.replace(/^\/+|^scenes\//, "");
  if (!WRITABLE.has(extname(clean).toLowerCase())) throw new Error(`Scene files are .tsx, .ts, .jsx, .js, .css, .json, .svg, .glsl or .md (notes like BEATS.md), not ${extname(clean) || "no extension"}`);
  const dir = scenesDir(projectId);
  const file = resolve(dir, clean);
  if (!inside(dir, file)) throw new Error(`${name} is outside the project's scenes folder`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  const path = relative(codeRoot(projectId), file).split(sep).join("/");
  const result = /\.(tsx|ts|jsx|js)$/.test(file) ? await compileScene(file, [join(codeRoot(projectId), "node_modules")]) : { code: "", hosts: [], exports: [] };
  return { path, result };
}

/**
 * Copies a file a scene needs (a 3D model, a font, an SVG logo, data) from anywhere on this Mac into the project's
 * scenes/files/ folder. Returns the path scenes load it by: useScene().file("scenes/files/<name>").
 */
export function importSceneFile(projectId: string, from: string, as?: string): string {
  const src = resolve(expandHome(from));
  if (!existsSync(src) || !statSync(src).isFile()) throw new Error(`There's no file at ${src}`);
  if (/\/\.ssh\/|\/Keychains\/|auth\.json$|\.credentials|\.env$/i.test(src)) throw new Error("That file holds secrets; it can't go into a project");
  const dir = join(scenesDir(projectId), "files");
  mkdirSync(dir, { recursive: true });
  const name = (as ?? basename(src)).replace(/[^\w.-]+/g, "-");
  copyFileSync(src, join(dir, name));
  // As scenes ask for it: relative to the code folder, like the shots' component paths.
  return relative(codeRoot(projectId), join(dir, name)).split(sep).join("/");
}

/** The scene files a project has, for get_project. */
export function listScenes(projectId: string): string[] {
  const dir = scenesDir(projectId);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.name.startsWith(".") || f.name === "node_modules") continue;
      const p = join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(tsx|ts|jsx|js)$/.test(f.name)) out.push(relative(codeRoot(projectId), p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out;
}
