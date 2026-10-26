/**
 * Pictures of web pages, for scenes that show the real thing: the product's site on a phone, a launch post, a
 * dashboard. Taken with the same headless Chrome the renderer uses, saved in the project, and added to the media.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBrowser } from "@remotion/renderer";
import { slugify, type Asset } from "@beatsheet/schema";
import { addAsset } from "./ingest.ts";
import { projectDir } from "./paths.ts";

export type CaptureOptions = {
  /** The browser window: a phone (390×844, the default) or a desktop (1440×900). */
  width?: number;
  height?: number;
  /** The whole page, top to bottom (for a scrolling phone), rather than what fits on screen. */
  fullPage?: boolean;
  /** Seconds to let the page settle (fonts, images, animation) before the picture. */
  wait?: number;
  label?: string;
};

export async function capturePage(projectId: string, url: string, opts: CaptureOptions = {}): Promise<Asset> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Give a full web address (https://…)");
  const width = opts.width ?? 390, height = opts.height ?? 844;
  const browser = await openBrowser("chrome", { chromiumOptions: { gl: "angle" }, logLevel: "error" });
  try {
    const page = await browser.newPage({ context: () => null, logLevel: "error", indent: false, pageIndex: 0, onBrowserLog: null, onLog: () => undefined });
    // A phone-sized window draws the site's mobile layout, at the phone's sharpness.
    await page.setViewport({ width, height, deviceScaleFactor: width < 800 ? 3 : 2 });
    await page.goto({ url, timeout: 45_000 });
    await new Promise((r) => setTimeout(r, (opts.wait ?? 1.5) * 1000));
    let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
    if (opts.fullPage) {
      const full = Math.min(12_000, Math.ceil(Number(await page.evaluate(() => document.documentElement.scrollHeight))));
      clip = { x: 0, y: 0, width, height: Math.max(height, full), scale: 1 };
    }
    // Straight to the DevTools protocol (Remotion's page wraps each reply in { value }).
    const reply = (await page._client().send("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) } as never)) as unknown as { value: { data: string } };
    const shot = reply.value;
    const dir = join(projectDir(projectId), "made", "pages");
    mkdirSync(dir, { recursive: true });
    const name = slugify(opts.label ?? url.replace(/^https?:\/\//, "").replace(/[/?#].*$/, (m) => m.replace(/[^a-z0-9]+/gi, "-"))).slice(0, 48) || "page";
    const file = join(dir, `${name}-${width}w${opts.fullPage ? "-full" : ""}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
    return addAsset(projectId, file, {
      label: opts.label ?? `${url.replace(/^https?:\/\//, "")} (${width < 800 ? "phone" : "desktop"})`,
      tags: ["web page", width < 800 ? "phone" : "desktop"],
      // Made here (not footage): a picture of a page, taken in headless Chrome.
      provenance: { source: "synth", provider: "chrome", prompt: url, createdAt: new Date().toISOString() },
    });
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}
