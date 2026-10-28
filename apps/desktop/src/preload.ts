/**
 * What the studio can ask of the app, beyond what a web page can do: native file and folder pickers, the real path of
 * something dropped on the window, the camera and microphone (macOS asks once), and the app menu's commands.
 */
import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("beatsheet", {
  desktop: true,
  /** "darwin" or "win32": the studio words a few things (shortcuts, Finder or File Explorer) to match. */
  platform: process.platform,
  pick: (kind: "folder" | "audio" | "file") => ipcRenderer.invoke("beatsheet:pick", kind) as Promise<string | null>,
  pickFootage: (kind?: "files" | "folder") => ipcRenderer.invoke("beatsheet:pick-footage", kind) as Promise<string[] | null>,
  saveVideo: (opts: { name: string; dir?: string }) => ipcRenderer.invoke("beatsheet:save-video", opts) as Promise<string | null>,
  reveal: (path: string) => ipcRenderer.invoke("beatsheet:reveal", path),
  openFile: (path: string) => ipcRenderer.invoke("beatsheet:open-file", path) as Promise<string>,
  pathFor: (file: File) => webUtils.getPathForFile(file),
  mediaAccess: (kind: "camera" | "microphone") => ipcRenderer.invoke("beatsheet:media-access", kind) as Promise<string>,
  openPrivacy: (kind: "camera" | "microphone" | "screen") => ipcRenderer.invoke("beatsheet:open-privacy", kind),
  onMenu: (fn: (command: string) => void) => {
    const listener = (_e: unknown, command: string) => fn(command);
    ipcRenderer.on("beatsheet:menu", listener);
    return () => ipcRenderer.off("beatsheet:menu", listener);
  },
});
