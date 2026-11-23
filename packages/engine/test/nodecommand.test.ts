import { describe, expect, it } from "vitest";
import { nodeCommand } from "../src/agent/cli.ts";

const NODE = "/usr/local/bin/node";
const APP = "/Applications/beatsheet.app/Contents/MacOS/beatsheet";

describe("running a script on Node", () => {
  it("from a terminal, uses the Node this is running on", () => {
    expect(nodeCommand("/repo/packages/engine/src/mcp.ts", { execPath: NODE, electron: false, own: false })).toEqual({ command: NODE, args: ["/repo/packages/engine/src/mcp.ts"], env: {} });
    // Built pieces don't change that: Node is Node.
    expect(nodeCommand("/repo/apps/desktop/dist/mcp.mjs", { execPath: NODE, electron: false, own: true })).toEqual({ command: NODE, args: ["/repo/apps/desktop/dist/mcp.mjs"], env: {} });
  });

  it("inside an app built with its own pieces, uses the app itself as Node, so the person needs none", () => {
    expect(nodeCommand("/app/dist/mcp.mjs", { execPath: APP, electron: true, own: true })).toEqual({ command: APP, args: ["/app/dist/mcp.mjs"], env: { ELECTRON_RUN_AS_NODE: "1" } });
  });

  it("inside an app without them, falls back to the person's node (Electron would open a window on the script)", () => {
    expect(nodeCommand("/repo/packages/engine/src/mcp.ts", { execPath: APP, electron: true, own: false })).toEqual({ command: "node", args: ["/repo/packages/engine/src/mcp.ts"], env: {} });
  });
});
