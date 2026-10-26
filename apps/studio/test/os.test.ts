import { describe, expect, it } from "vitest";
import { shortcut, splitPath, words } from "../src/os.ts";

describe("the studio's words for the computer it's on", () => {
  it("writes shortcuts the Mac way on a Mac, untouched", () => {
    for (const k of ["⇧⌘O", "⌘Z", "⇧⌘Z", "⌘,", "⌥", "⇧"]) expect(shortcut(k, false)).toBe(k);
  });

  it("writes them the Windows way on a PC", () => {
    expect(shortcut("⇧⌘O", true)).toBe("Ctrl+Shift+O");
    expect(shortcut("⌘Z", true)).toBe("Ctrl+Z");
    expect(shortcut("⌘,", true)).toBe("Ctrl+,");
    expect(shortcut("⌥", true)).toBe("Alt");
    expect(shortcut("⇧", true)).toBe("Shift");
  });

  it("names Finder, the Keychain and the Trash on a Mac, and Windows' own on a PC", () => {
    expect(words(false)).toMatchObject({ here: "this Mac", files: "Finder", keys: "Keychain", trash: "Trash", app: "Mac app" });
    expect(words(true)).toMatchObject({ here: "this PC", files: "File Explorer", keys: "Credential Manager", trash: "Recycle Bin" });
  });

  it("splits paths on either slash only on Windows", () => {
    expect(splitPath("C:\\Users\\me\\clip.mp4", true).pop()).toBe("clip.mp4");
    expect(splitPath("/Users/me/odd\\name.mp4", false).pop()).toBe("odd\\name.mp4");
  });
});
