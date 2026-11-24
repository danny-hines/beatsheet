// Makes sure Remotion's headless Chrome is there and prints where it is. Remotion keeps its download under the folder
// the process is working in (the nearest package.json's node_modules/.remotion), so this is run with its working
// folder set to where the browser should live (chrome.ts). The answer is the last line: BROWSER {"path": "…"}.
import { ensureBrowser } from "@remotion/renderer";

let said = -1;
const status = await ensureBrowser({
  logLevel: "error",
  onBrowserDownload: () => ({
    version: null,
    onProgress: ({ percent }) => {
      const tenth = Math.floor(percent * 10);
      if (tenth > said) process.stderr.write(`PROGRESS ${(said = tenth) * 10}\n`);
    },
  }),
});
process.stdout.write(`\nBROWSER ${JSON.stringify(status)}\n`);
