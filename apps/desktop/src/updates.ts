/**
 * Updates for the installed app. It looks for a newer version a little after it starts and every few hours, fetches
 * one in the background, and then asks, once, whether to restart now; otherwise the update goes in the next time the
 * app quits. Nothing restarts on its own: an agent may be in the middle of a turn. The menu has the same thing on
 * demand (Check for Updates…, which becomes Restart to Update once one is ready).
 *
 * Where it looks is decided when the app is built: scripts/dist.mjs writes the feed (the "updates" entry of
 * package.json) into the app as app-update.yml. An app built without one doesn't look, and has no menu item.
 * On a Mac an update only goes in if the app is signed with a Developer ID: macOS checks the new copy's signature
 * against the running one.
 */
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, dialog, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { updateMenu, type UpdateState } from "./update-menu.ts";

const FIRST_LOOK = 15_000;
const LOOK_EVERY = 4 * 60 * 60_000;

let state: UpdateState = { kind: "off" };
let changed: () => void = () => {};
let window: () => BrowserWindow | null = () => null;
let log: (line: string) => void = () => {};
// The person asked (from the menu): they're told how it went, where a look in the background says nothing.
let asked = false;
let offered: string | undefined;
let updater: typeof import("electron-updater").autoUpdater | undefined;

const set = (next: UpdateState) => {
  state = next;
  changed();
};

/** The menu item for updates, or none when this app doesn't look for them. */
export function updateMenuItem(): MenuItemConstructorOptions | undefined {
  const item = updateMenu(state);
  return item && { ...item, click: () => void chosen() };
}

const tell = (message: string, detail?: string) => {
  const w = window();
  const options = { type: "info" as const, message, ...(detail ? { detail } : {}), buttons: ["OK"] };
  return w ? dialog.showMessageBox(w, options) : dialog.showMessageBox(options);
};

async function offer(version: string) {
  const w = window();
  const options = {
    type: "info" as const,
    message: `beatsheet ${version} is ready`,
    detail: "Restart to finish updating. An agent that's working will be stopped, so let it finish its turn first. If you'd rather not now, the update goes in the next time you quit.",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = w ? await dialog.showMessageBox(w, options) : await dialog.showMessageBox(options);
  if (response === 0) updater?.quitAndInstall();
}

async function chosen() {
  if (state.kind === "ready") return offer(state.version);
  asked = true;
  await look();
}

async function look() {
  if (!updater || state.kind === "checking" || state.kind === "fetching" || state.kind === "ready") return;
  try {
    await updater.checkForUpdates();
  } catch (err) {
    // The "error" event has said so already.
    log(`couldn't look: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Starts looking for updates, when this app was built with somewhere to look. `onChange` is called whenever the menu
 * item should be drawn again; `unattended` (a check without a person at the screen) keeps the dialogs away.
 */
export async function startUpdates(opts: { window: () => BrowserWindow | null; onChange: () => void; logFile: string; unattended?: boolean }): Promise<void> {
  if (!app.isPackaged || !existsSync(join(process.resourcesPath, "app-update.yml"))) return;
  window = opts.window;
  changed = opts.onChange;
  log = (line) => {
    try {
      mkdirSync(dirname(opts.logFile), { recursive: true });
      appendFileSync(opts.logFile, `${new Date().toISOString()} ${line}\n`);
    } catch {
      // nowhere to write: go without a log
    }
  };
  const quiet = !!opts.unattended;
  // Loaded only here, so a checkout never needs it. It's a CommonJS package whose `autoUpdater` is made on first use,
  // which Node's import doesn't always see as a named export: it's on the default export then.
  const loaded = await import("electron-updater");
  updater = loaded.autoUpdater ?? (loaded as unknown as { default?: typeof loaded }).default?.autoUpdater;
  if (!updater) throw new Error("the updater didn't load");
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = { info: (m: unknown) => log(String(m)), warn: (m: unknown) => log(`warning: ${String(m)}`), error: (m: unknown) => log(`error: ${String(m)}`), debug: () => {} };

  updater.on("checking-for-update", () => set({ kind: "checking" }));
  updater.on("update-not-available", () => {
    set({ kind: "current" });
    if (asked && !quiet) void tell("beatsheet is up to date", `You have version ${app.getVersion()}, the newest there is.`);
    asked = false;
  });
  updater.on("update-available", (info) => set({ kind: "fetching", version: info.version, percent: 0 }));
  updater.on("download-progress", (p) => state.kind === "fetching" && set({ ...state, percent: p.percent }));
  updater.on("update-downloaded", (info) => {
    log(`ready: ${info.version}`);
    set({ kind: "ready", version: info.version });
    asked = false;
    // Offered once for each version; after that it waits in the menu.
    if (offered !== info.version && !quiet) {
      offered = info.version;
      void offer(info.version);
    }
  });
  updater.on("error", (err) => {
    const why = err?.message?.split("\n")[0] ?? "something went wrong";
    set({ kind: "failed", why });
    if (asked && !quiet) void tell("Couldn't check for updates", why);
    asked = false;
  });

  set({ kind: "idle" });
  setTimeout(() => void look(), quiet ? 1500 : FIRST_LOOK).unref();
  setInterval(() => void look(), LOOK_EVERY).unref();
}
