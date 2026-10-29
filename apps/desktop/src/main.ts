/**
 * beatsheet's main process: starts the engine (the API, media, live events, the hosted agents) on a local port, opens
 * the studio in a window, and gives it native pickers and a menu. Run from the repo, it uses the repo's projects and
 * tools; with BEATSHEET_DEV_URL it opens the Vite dev server instead, for working on the studio with hot reload.
 *
 * On Windows the window keeps its own title bar (dark, to match), the menu is Windows' (Ctrl shortcuts, Exit), privacy
 * links open Windows Settings, and recording asks which screen with a small dialog of its own.
 */
import childProcess from "node:child_process";
import { existsSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeTheme, session, shell, systemPreferences, type MenuItemConstructorOptions } from "electron";

// The engine finds projects, recipes and its MCP server relative to the repo.
process.env.BEATSHEET_REPO ??= resolve(__dirname, "..", "..", "..");
const REPO = process.env.BEATSHEET_REPO;
// Opened from Finder the app starts in /, where tools that work relative to where they run (Remotion's browser
// download, for one) can't write; work from the repo instead.
process.chdir(REPO);
const DEV_URL = process.env.BEATSHEET_DEV_URL;
const WINDOWS = process.platform === "win32";
if (WINDOWS) hideConsoles();

let win: BrowserWindow | null = null;
let stopServer: (() => void) | undefined;

async function studioUrl(): Promise<string> {
  if (DEV_URL) return DEV_URL;
  // Loaded only now, after BEATSHEET_REPO is set.
  const { serveApp } = await import("../../../packages/engine/src/app-server.ts");
  // The same port every launch, so the studio remembers each project's last cut (and the rest of what it keeps).
  const server = await serveApp({ studioDir: join(REPO, "apps", "studio", "dist"), port: Number(process.env.BEATSHEET_PORT ?? 47219) });
  stopServer = server.close;
  return server.origin;
}

async function openWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    title: "beatsheet",
    backgroundColor: "#121317",
    ...(WINDOWS ? windowsFrame() : { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 17 } }),
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  // Links (API key pages, docs) open in the browser, never in the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(currentOrigin)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
  win.on("closed", () => (win = null));
  await win.loadURL(currentOrigin);
  // For checking the app without a person at the screen: a picture of this window only, then (optionally) quit.
  const snap = process.env.BEATSHEET_SNAPSHOT;
  if (snap) {
    if (process.env.BEATSHEET_SNAPSHOT_HASH) await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(process.env.BEATSHEET_SNAPSHOT_HASH)}`);
    await new Promise((r) => setTimeout(r, Number(process.env.BEATSHEET_SNAPSHOT_WAIT ?? 4000)));
    const image = await win.webContents.capturePage();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(snap, image.toPNG());
    console.log(`beatsheet: snapshot at ${snap}`);
    if (process.env.BEATSHEET_SNAPSHOT_QUIT) app.quit();
  }
}
let currentOrigin = "";

ipcMain.handle("beatsheet:pick", async (_e, kind: "folder" | "audio" | "file") => {
  const options: Electron.OpenDialogOptions =
    kind === "folder"
      ? { title: "Choose a folder", properties: ["openDirectory"] }
      : kind === "file"
        ? { title: "Choose a file", properties: ["openFile"] }
        : { title: "Choose a song or recording", properties: ["openFile"], filters: [{ name: "Audio", extensions: ["mp3", "m4a", "wav", "aac", "aiff", "flac", "ogg", "webm"] }] };
  const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return r.canceled ? null : (r.filePaths[0] ?? null);
});

// Where an export goes: the person names it and picks the folder (the last one used, else Movies).
ipcMain.handle("beatsheet:save-video", async (_e, opts: { name: string; dir?: string }) => {
  const options = {
    title: "Export",
    buttonLabel: "Export",
    defaultPath: join(opts.dir ?? app.getPath("videos"), opts.name),
    filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"] as ("createDirectory" | "showOverwriteConfirmation")[],
  };
  const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  return r.canceled || !r.filePath ? null : r.filePath.toLowerCase().endsWith(".mp4") ? r.filePath : `${r.filePath}.mp4`;
});
ipcMain.handle("beatsheet:reveal", (_e, path: string) => shell.showItemInFolder(path));
ipcMain.handle("beatsheet:open-file", (_e, path: string) => shell.openPath(path));

// Footage: photos and videos, a folder of them, or several of either, in one picker on the Mac. Windows' picker chooses
// files or folders, never both (asked for both, it only lets you choose a folder), so there the studio asks for one.
ipcMain.handle("beatsheet:pick-footage", async (_e, kind: "files" | "folder" = "files") => {
  const mac = process.platform === "darwin";
  const options: Electron.OpenDialogOptions =
    !mac && kind === "folder"
      ? { title: "Add a folder of footage", buttonLabel: "Add", properties: ["openDirectory"] }
      : {
          title: "Add footage",
          message: "Choose photos and videos, or a folder of them",
          buttonLabel: "Add",
          properties: mac ? ["openFile", "openDirectory", "multiSelections"] : ["openFile", "multiSelections"],
          filters: [{ name: "Photos and videos", extensions: ["mp4", "mov", "m4v", "webm", "dv", "avi", "mpg", "mpeg", "vob", "mts", "m2ts", "mod", "tod", "3gp", "wmv", "mkv", "flv", "jpg", "jpeg", "png", "heic", "heif", "webp"] }],
        };
  const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return r.canceled || !r.filePaths.length ? null : r.filePaths;
});

// The camera and microphone: macOS asks the person once, and remembers. Windows has one switch for desktop apps.
ipcMain.handle("beatsheet:media-access", async (_e, kind: "camera" | "microphone") => {
  if (WINDOWS) return systemPreferences.getMediaAccessStatus(kind) === "denied" ? "denied" : "granted";
  if (process.platform !== "darwin") return "granted";
  const status = systemPreferences.getMediaAccessStatus(kind);
  if (status === "not-determined") return (await systemPreferences.askForMediaAccess(kind)) ? "granted" : "denied";
  return status;
});
const PRIVACY = { camera: "Privacy_Camera", microphone: "Privacy_Microphone", screen: "Privacy_ScreenCapture" } as const;
const WINDOWS_PRIVACY = { camera: "ms-settings:privacy-webcam", microphone: "ms-settings:privacy-microphone", screen: "ms-settings:privacy" } as const;
ipcMain.handle("beatsheet:open-privacy", (_e, kind: keyof typeof PRIVACY) =>
  shell.openExternal(WINDOWS ? (WINDOWS_PRIVACY[kind] ?? WINDOWS_PRIVACY.camera) : `x-apple.systempreferences:com.apple.preference.security?${PRIVACY[kind] ?? PRIVACY.camera}`),
);

/**
 * Recording the screen: macOS's own picker (a window, an app or a whole display), which needs no Screen Recording
 * permission for beatsheet. Before macOS 15, without that picker, it records the main display.
 */
function screenCapture() {
  if (WINDOWS) return windowsScreenCapture();
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      void desktopCapturer
        .getSources({ types: ["screen"] })
        .then((sources) => callback(sources[0] ? { video: sources[0] } : null))
        .catch(() => callback(null));
    },
    { useSystemPicker: true },
  );
}

function menu() {
  if (WINDOWS) return windowsMenu();
  const send = (command: string) => () => win?.webContents.send("beatsheet:menu", command);
  const template: MenuItemConstructorOptions[] = [
    {
      label: "beatsheet",
      submenu: [{ role: "about" }, { type: "separator" }, { label: "Settings…", accelerator: "Cmd+,", click: send("settings") }, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "quit" }],
    },
    {
      label: "File",
      submenu: [
        { label: "New Project…", accelerator: "Cmd+N", click: send("new-project") },
        { label: "New Cut…", accelerator: "Cmd+Shift+N", click: send("new-cut") },
        { label: "All Projects", accelerator: "Cmd+Shift+O", click: send("home") },
        { type: "separator" },
        { label: "Add Footage…", accelerator: "Cmd+Shift+I", click: send("add-footage") },
        { label: "Record Screen…", accelerator: "Cmd+Shift+R", click: send("record-screen") },
        { label: "Record Camera…", click: send("record-camera") },
        { label: "Record Voice…", click: send("record-voice") },
        { type: "separator" },
        { label: "Export…", accelerator: "Cmd+E", click: send("export") },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- Windows

/**
 * An app has no console, so every program it starts (ffmpeg, uv, Python, the agents) would open a console window of
 * its own for a moment. On Windows they all start hidden instead, wherever in the engine (or Remotion) they're started.
 */
function hideConsoles() {
  const cp = childProcess as unknown as Record<string, (...args: unknown[]) => unknown>;
  const hidden = (args: unknown[]) => {
    const at = args.findIndex((a, i) => i > 0 && !!a && typeof a === "object" && !Array.isArray(a));
    if (at >= 0) args[at] = { windowsHide: true, ...(args[at] as object) };
    else args.splice(typeof args[args.length - 1] === "function" ? args.length - 1 : args.length, 0, { windowsHide: true });
    return args;
  };
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"]) {
    const original = cp[name]!;
    const wrapped = (...args: unknown[]) => original.apply(childProcess, hidden(args));
    const custom = (original as unknown as Record<symbol, (...a: unknown[]) => unknown>)[promisify.custom];
    if (custom) Object.defineProperty(wrapped, promisify.custom, { value: (...args: unknown[]) => custom.apply(childProcess, hidden(args)) });
    cp[name] = wrapped;
  }
  syncBuiltinESMExports();
}

/** Windows' own title bar, dark like the app, with beatsheet's icon when the app build has drawn it. */
function windowsFrame(): Electron.BrowserWindowConstructorOptions {
  nativeTheme.themeSource = "dark";
  const icon = join(__dirname, "icon.png");
  return { autoHideMenuBar: false, ...(existsSync(icon) ? { icon } : {}) };
}

/** The same commands as the Mac's menu, the Windows way: Ctrl shortcuts, Settings under File, Exit last. */
function windowsMenu() {
  const send = (command: string) => () => win?.webContents.send("beatsheet:menu", command);
  const template: MenuItemConstructorOptions[] = [
    {
      label: "&File",
      submenu: [
        { label: "New Project…", accelerator: "Ctrl+N", click: send("new-project") },
        { label: "New Cut…", accelerator: "Ctrl+Shift+N", click: send("new-cut") },
        { label: "All Projects", accelerator: "Ctrl+Shift+O", click: send("home") },
        { type: "separator" },
        { label: "Add Footage…", accelerator: "Ctrl+Shift+I", click: send("add-footage") },
        { label: "Add a Folder of Footage…", click: send("add-footage-folder") },
        { label: "Record Screen…", accelerator: "Ctrl+Shift+R", click: send("record-screen") },
        { label: "Record Camera…", click: send("record-camera") },
        { label: "Record Voice…", click: send("record-voice") },
        { type: "separator" },
        { label: "Export…", accelerator: "Ctrl+E", click: send("export") },
        { type: "separator" },
        { label: "Settings…", accelerator: "Ctrl+,", click: send("settings") },
        { type: "separator" },
        { role: "quit", label: "Exit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "&View",
      // Ctrl+Shift+I is Add Footage here, so the developer tools are F12.
      submenu: [{ role: "reload" }, { role: "toggleDevTools", accelerator: "F12" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    { role: "windowMenu" },
    { label: "&Help", submenu: [{ label: "About beatsheet", click: () => void dialog.showMessageBox({ title: "beatsheet", message: "beatsheet", detail: `Version ${app.getVersion()}\n${REPO}` }) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Recording the screen on Windows, which has no picker of its own for apps: one screen is recorded straight away; with
 * several, a small dialog asks which.
 */
function windowsScreenCapture() {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void (async () => {
      const screens = await desktopCapturer.getSources({ types: ["screen"] });
      if (screens.length <= 1) return callback(screens[0] ? { video: screens[0] } : null);
      const options = { type: "question" as const, title: "Record", message: "Which screen?", buttons: [...screens.map((s, i) => s.name || `Screen ${i + 1}`), "Cancel"], cancelId: screens.length, defaultId: 0 };
      const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
      callback(screens[response] ? { video: screens[response] } : null);
    })().catch(() => callback(null));
  });
}

app.setName("beatsheet");
// Taskbar grouping and the icon Windows shows for the app.
if (WINDOWS) app.setAppUserModelId("dev.beatsheet.studio");
// The preview's sounds each get their own <audio> (see Preview.tsx); playback always starts from the person's click or key.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.whenReady().then(async () => {
  menu();
  screenCapture();
  currentOrigin = await studioUrl();
  console.log(`beatsheet: studio at ${currentOrigin}`);
  await openWindow();
  app.on("activate", () => !win && void openWindow());
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => stopServer?.());
