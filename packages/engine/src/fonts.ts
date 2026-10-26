/**
 * Fonts from Google Fonts for a project's look: a family's Latin files for the weights asked for, saved in the
 * project's fonts/ folder as entries for the look's fontFiles, so the player and every render draw with them. Google's
 * fonts are free to use in videos (SIL Open Font License or Apache).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectDir } from "./paths.ts";

export type FontFile = { family: string; path: string; weight?: string; style?: string };

// Google serves WOFF2 to browsers it recognises.
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function css(family: string, axis: string): Promise<string | undefined> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}${axis}&display=swap`;
  const res = await fetch(url, { headers: { "user-agent": BROWSER } });
  return res.ok ? res.text() : undefined;
}

type Face = { style: string; weight: string; url: string };

/** The Latin faces in a Google Fonts stylesheet (not latin-ext, cyrillic and the rest). */
export function latinFaces(sheet: string): Face[] {
  const out: Face[] = [];
  for (const m of sheet.matchAll(/\/\*\s*latin\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1]!;
    const url = /src:\s*url\(([^)]+)\)/.exec(body)?.[1];
    if (url) out.push({ style: /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal", weight: /font-weight:\s*([\d ]+)/.exec(body)?.[1]?.trim() ?? "400", url });
  }
  return out;
}

export async function addFont(id: string, family: string, opts: { weights?: number[]; italic?: boolean } = {}): Promise<FontFile[]> {
  const weights = [...new Set(opts.weights?.length ? opts.weights : [400, 700])].sort((a, b) => a - b);
  const axis = (ws: number[]) => (opts.italic ? `:ital,wght@${[0, 1].flatMap((i) => ws.map((w) => `${i},${w}`)).join(";")}` : `:wght@${ws.join(";")}`);
  // All the weights at once; when the family lacks one of them, each on its own, keeping those it has.
  let sheets = [await css(family, axis(weights))];
  if (!sheets[0]) sheets = await Promise.all(weights.map((w) => css(family, axis([w]))));
  const faces = sheets.flatMap((s) => (s ? latinFaces(s) : []));
  if (!faces.length) throw new Error(`Google Fonts has no "${family}"${opts.weights?.length ? ` in weight ${weights.join(", ")}` : ""}. Check the name at fonts.google.com.`);
  // A variable font serves every weight from one file: download it once and give it the whole range.
  const byUrl = new Map<string, Face[]>();
  for (const f of faces) byUrl.set(f.url, [...(byUrl.get(f.url) ?? []), f]);
  const dir = join(projectDir(id), "fonts");
  mkdirSync(dir, { recursive: true });
  const slug = family.replace(/[^\w]+/g, "");
  const files: FontFile[] = [];
  for (const [url, same] of byUrl) {
    const ws = same.flatMap((f) => f.weight.split(" ").map(Number));
    const weight = Math.min(...ws) === Math.max(...ws) ? String(ws[0]) : `${Math.min(...ws)} ${Math.max(...ws)}`;
    const style = same[0]!.style;
    const name = `${slug}-${weight.replace(" ", "-")}${style === "italic" ? "-italic" : ""}.woff2`;
    const path = join(dir, name);
    if (!existsSync(path)) {
      const res = await fetch(url, { headers: { "user-agent": BROWSER } });
      if (!res.ok) throw new Error(`Couldn't download ${family} ${weight} (${res.status})`);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
    files.push({ family, path: `fonts/${name}`, weight, ...(style === "italic" ? { style } : {}) });
  }
  return files;
}
