import { describe, expect, it } from "vitest";
import { updateMenu } from "../src/update-menu.ts";

describe("the menu item for updates", () => {
  it("isn't there in an app that doesn't look for updates", () => {
    expect(updateMenu({ kind: "off" })).toBeUndefined();
  });

  it("offers to check when there's nothing going on, after finding none, and after a look that failed", () => {
    for (const state of [{ kind: "idle" }, { kind: "current" }, { kind: "failed", why: "offline" }] as const) expect(updateMenu(state)).toEqual({ label: "Check for Updates…", enabled: true });
  });

  it("says what it's doing while it looks and while it fetches, and can't be chosen then", () => {
    expect(updateMenu({ kind: "checking" })).toEqual({ label: "Checking for Updates…", enabled: false });
    expect(updateMenu({ kind: "fetching", version: "0.2.0", percent: 41.6 })).toEqual({ label: "Downloading beatsheet 0.2.0… 42%", enabled: false });
  });

  it("becomes the way to restart once an update is ready", () => {
    expect(updateMenu({ kind: "ready", version: "0.2.0" })).toEqual({ label: "Restart to Update to 0.2.0…", enabled: true });
  });
});
