/**
 * Checks this computer has what beatsheet needs, and says what to install when it doesn't: Node, ffmpeg and ffprobe,
 * uv, the agent CLIs, the recipes' links, and on Windows the NVIDIA card and driver SAM 3.1 wants. It changes nothing.
 *
 *   node scripts/doctor.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findCli, useLoginPath } from "../packages/engine/src/agent/cli.ts";
import { REPO } from "../packages/engine/src/paths.ts";
import { inContainer, systemExe } from "../packages/engine/src/platform.ts";
import { SETTINGS_DIR } from "../packages/engine/src/settings.ts";

const WINDOWS = process.platform === "win32";
let problems = 0;
const say = (ok: boolean | "maybe", what: string, detail: string, fix?: string) => {
  if (ok === false) problems++;
  console.log(`${ok === true ? "✓" : ok === "maybe" ? "·" : "✕"} ${what}: ${detail}${ok !== true && fix ? `\n    → ${fix}` : ""}`);
};
const version = (cmd: string, args = ["-version"]) => {
  try {
    return execFileSync(cmd, args, { timeout: 15_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).toString().split(/\r?\n/)[0]!.trim();
  } catch {
    return undefined;
  }
};

await useLoginPath();
console.log(`beatsheet at ${REPO}\nits own folder: ${SETTINGS_DIR}\n`);

// Started from inside a packaged app (a terminal in Claude's desktop app), Windows keeps beatsheet's folder in that
// app's own copy. Only a folder that exists can say so; this changes nothing.
const boxed = WINDOWS && existsSync(SETTINGS_DIR) ? inContainer(SETTINGS_DIR) : undefined;
if (boxed)
  say(false, "its own folder", `kept in ${boxed}'s own copy: this terminal runs inside ${boxed}`, `Run beatsheet from a terminal opened from the Start menu. From inside ${boxed}, SAM and Kokoro can't install, and its settings aren't the ones the app sees when started normally.`);

const node = Number(process.versions.node.split(".")[0]);
say(node >= 24, "Node", process.versions.node, "Install Node 24 or later (it runs beatsheet's TypeScript as it is): https://nodejs.org");

const install = (mac: string, win: string) => (WINDOWS ? win : mac);
const ffmpeg = version("ffmpeg");
say(!!ffmpeg, "ffmpeg", ffmpeg ?? "not found", install("brew install ffmpeg", "winget install Gyan.FFmpeg, then open a new terminal"));
const ffprobe = version("ffprobe");
say(!!ffprobe, "ffprobe", ffprobe ?? "not found", install("brew install ffmpeg", "comes with ffmpeg (winget install Gyan.FFmpeg)"));
if (ffmpeg && WINDOWS) {
  const encoders = (() => {
    try {
      return execFileSync("ffmpeg", ["-hide_banner", "-encoders"], { timeout: 15_000, windowsHide: true }).toString();
    } catch {
      return "";
    }
  })();
  say(encoders.includes("h264_nvenc") ? true : "maybe", "NVENC", encoders.includes("h264_nvenc") ? "preview copies on the graphics card" : "not in this ffmpeg; preview copies use the processor", "Gyan's full build has it");
  say(encoders.includes("libvpx-vp9") || "maybe", "VP9 (cut-out clips)", encoders.includes("libvpx-vp9") ? "yes" : "not in this ffmpeg", "Use a full build (winget install Gyan.FFmpeg)");
}
const uv = version("uv", ["--version"]);
say(uv ? true : "maybe", "uv", uv ?? "not found (needed to analyse songs; Settings fetches its own for SAM and Kokoro)", install("brew install uv", "winget install astral-sh.uv"));

for (const name of ["claude", "codex", "muse"] as const) {
  const at = await findCli(name);
  say(at ? true : "maybe", `${name} CLI`, at ?? "not installed (one agent is enough)", name === "claude" ? install("curl -fsSL https://claude.ai/install.sh | bash", "irm https://claude.ai/install.ps1 | iex   (in PowerShell)") : name === "codex" ? "npm install -g @openai/codex" : undefined);
}
if (WINDOWS) {
  const git = version("git", ["--version"]);
  say(git ? true : "maybe", "Git for Windows", git ?? "not found", "Claude Code's Bash tool uses Git Bash: winget install Git.Git");
}

// The recipes reach Claude Code through links in .claude/skills, and Codex reads AGENTS.md, a link to CLAUDE.md. A
// checkout without symlinks has small text files there instead.
const relink = WINDOWS ? "Turn on Developer Mode (Settings → System → Advanced; For developers on older Windows), then in this folder: git config core.symlinks true && git checkout -- .claude/skills AGENTS.md" : "git checkout -- .claude/skills AGENTS.md";
for (const skill of ["montage", "story", "motion"]) {
  const link = join(REPO, ".claude", "skills", skill);
  const ok = existsSync(join(link, "SKILL.md"));
  const why = !existsSync(link) ? "missing" : lstatSync(link).isFile() ? `a text file saying "${readFileSync(link, "utf8").trim()}", not a link` : "doesn't lead to SKILL.md";
  say(ok, `recipe link .claude/skills/${skill}`, ok ? "ok" : why, relink);
}
const agents = join(REPO, "AGENTS.md");
const agentsOk = existsSync(agents) && readFileSync(agents, "utf8").length > 200;
say(agentsOk, "AGENTS.md (for Codex)", agentsOk ? "ok" : "a text file, not the link to CLAUDE.md", relink);

if (WINDOWS) {
  try {
    const csv = execFileSync(systemExe("nvidia-smi.exe"), ["--query-gpu=name,memory.total,driver_version,compute_cap", "--format=csv,noheader,nounits"], { timeout: 10_000, windowsHide: true }).toString().trim();
    for (const line of csv.split(/\r?\n/)) {
      const [name, mem, driver, cc] = line.split(",").map((x) => x.trim());
      const good = Number(driver!.split(".")[0]) >= 570 && Number(cc) >= 8;
      say(good, "NVIDIA card", `${name}, ${Math.round(Number(mem) / 1024)} GB, driver ${driver}, compute ${cc}${Number(mem) < 16_000 ? " (SAM 3.1 works on shorter, smaller clips here)" : ""}`, "SAM 3.1 needs an RTX 30-series or newer and driver 570+: update from nvidia.com or the NVIDIA app");
    }
  } catch {
    say("maybe", "NVIDIA card", "nvidia-smi didn't answer; SAM 3.1 won't be offered", "Install the NVIDIA driver");
  }
  const vc = ["vcruntime140.dll", "msvcp140.dll"].every((d) => existsSync(systemExe(d)));
  say(vc || "maybe", "Visual C++ runtime", vc ? "installed" : "missing (PyTorch for SAM 3.1 needs it)", "winget install Microsoft.VCRedist.2015+.x64");
}

console.log(problems ? `\n${problems} thing${problems === 1 ? "" : "s"} to fix.` : "\nAll set.");
process.exitCode = problems ? 1 : 0;
