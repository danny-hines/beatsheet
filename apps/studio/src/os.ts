/** Words and shortcuts for the computer beatsheet runs on, so the Mac's read as they always have and a PC's read right. */

export const words = (windows: boolean) =>
  windows
    ? { computer: "PC", here: "this PC", files: "File Explorer", keys: "Credential Manager", trash: "Recycle Bin", terminal: "a terminal window", settings: "Windows Settings", app: "app" }
    : { computer: "Mac", here: "this Mac", files: "Finder", keys: "Keychain", trash: "Trash", terminal: "Terminal", settings: "System Settings", app: "Mac app" };

/** A shortcut as the Mac writes it ("⇧⌘O", "⌥"), or on Windows as Windows does ("Ctrl+Shift+O", "Alt"). */
export function shortcut(mac: string, windows: boolean): string {
  if (!windows) return mac;
  const mods = [mac.includes("⌘") && "Ctrl", mac.includes("⇧") && "Shift", mac.includes("⌥") && "Alt"].filter(Boolean);
  const rest = mac.replace(/[⌘⇧⌥]/g, "");
  return [...mods, rest].filter(Boolean).join("+");
}

/** A path split into its folders and name (on Windows either slash separates them). */
export const splitPath = (path: string, windows: boolean) => path.split(windows ? /[\\/]/ : "/");
