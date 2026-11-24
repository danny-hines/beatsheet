/** Where an update has got to, and what the menu says about it. Kept apart from updates.ts so it runs without Electron. */
export type UpdateState =
  | { kind: "off" }
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "fetching"; version: string; percent: number }
  | { kind: "ready"; version: string }
  | { kind: "failed"; why: string };

/** What the menu item says, and whether it can be chosen, for where an update has got to. */
export function updateMenu(state: UpdateState): { label: string; enabled: boolean } | undefined {
  switch (state.kind) {
    case "off":
      return undefined;
    case "checking":
      return { label: "Checking for Updates…", enabled: false };
    case "fetching":
      return { label: `Downloading beatsheet ${state.version}… ${Math.round(state.percent)}%`, enabled: false };
    case "ready":
      return { label: `Restart to Update to ${state.version}…`, enabled: true };
    default:
      return { label: "Check for Updates…", enabled: true };
  }
}
