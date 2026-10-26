# Windows: handoff to the PC

For the Claude session on Danny's Windows PC (the RTX 4090). The Windows port was written on the Mac and passes every test there, but none of it has run on Windows yet. Your job is to prove it on this PC and fix what breaks.

## Start here

1. `git pull` on `main`: the Mac may have pushed since.
2. This clone was made without symlinks, so the recipes in `.claude/skills` aren't linked. Ask Danny to turn on Developer Mode (Settings → System → For developers), then run:
   ```powershell
   git config core.symlinks true
   git checkout -- .claude/skills AGENTS.md
   ```
3. Read `CLAUDE.md`, then the README's **Windows** section: Before you start, Run it, and its **Test checklist** (steps 1–17).
4. Work through the checklist in order. Fix what breaks as you go, and record each step under Results below.

## How to work

- **Commits:** commit straight to `main` and push. Danny doesn't want branches. Pull before you start, and again before you push: the Mac pushes too.
- **The Mac must keep working.** Platform differences live behind the seams in `packages/engine/src/platform.ts`, with tests in `packages/engine/test/platform.test.ts`. Change shared code only in ways that are safe on macOS. `packages/schema` stays pure. `npm run check` passes before every push.
- **Ask Danny first** before installing anything (the `winget` lines in the README included), and before anything that spends money (ElevenLabs credits, fal).
- **Secrets:** never read or print a key or token: not Credential Manager, not settings, not the Hugging Face token for SAM 3.1. Danny pastes the token into Settings himself. Services are used only through beatsheet's own tools.
- **Footage:** a project made on the Mac points at its footage by Mac paths. Test with footage that's on this PC.

## What's most likely to need work

From the README's "Not proved yet":
- Muse Code may not run on Windows at all.
- Codex's sandbox on Windows.
- Word timings for Windows' built-in voices.
- SAM 3.1's video path on `triton-windows`.
- HEIC photos, which need ffmpeg 7.1 or later.
- On the 5070 (12 GB): whether SAM 3.1 fits in memory.

## Notes from the session that wrote the port

- **SAM 3.1:**
  - It does photos too, as one-frame videos, so there's one 3.5 GB download. If photo cut-outs disappoint, the fallback is Meta's image model with the `facebook/sam3` checkpoint.
  - Least certain in the worker (`packages/engine/native/sam-cuda-worker.py`): point prompts (`cut_out` with `point`, and the fallback when a box finds nothing; patched after a review found they came back empty), and boxes. A box is used as an example of what to find, keeping the match that best fills it.
  - Workarounds for Meta's sam3#544 and #523 stay harmless if upstream fixes them.
- **Switches for testing SAM:**
  - `BEATSHEET_SAM_TRITON=0` runs the three Triton steps on the processor.
  - `BEATSHEET_SAM_LOW=1` puts the 4090 in the 5070's 12 GB mode.
  - The install log says whether Triton works on the card.
- **Helpers:** the C# helpers (keys, Windows voices) are compiled on first use by Windows PowerShell 5.1 into `%LOCALAPPDATA%\beatsheet\bin`. A failure shows as "Couldn't build the … helper"; deleting that folder forces a rebuild.
- **Without SAM:** OpenCV runs through `uv run` (`opencv-contrib-python-headless` 4.10.0.84) with a pinned 230 KB face model in `%LOCALAPPDATA%\beatsheet\models`.
- **Voices:** only the SAPI desktop voices (David, Zira) show up; the newer "natural" Narrator voices aren't reachable that way. Kokoro runs PyTorch on the processor and hasn't been tried.
- **Agents:**
  - Hosted Claude Code needs Git for Windows for its Bash tool, and gets PowerShell rules that deny reading Credential Manager.
  - Codex runs with `sandbox: "workspace-write"`, which may behave differently on Windows.
  - Muse Code may not exist for Windows.
- **The app:**
  - Ctrl+Shift+I is Add Footage, so the developer tools are on F12.
  - Recording takes a whole screen, with no window picker (the PC's own sound isn't wired up).
  - `explorer.exe` returns exit code 1 even when "Show in File Explorer" works; that's ignored on purpose.

## Reporting back

Messages from this PC can't reach the Mac session, so this file is the channel. After each step, update the Results table and push. When you finish, or get stuck on something only Danny can do, say so at the top of Results.

## Results

Status: in progress on the PC (2026-10-26). Engine, CLI, MCP server and a hosted Claude Code turn all work on synthetic footage; waiting on Danny for real phone footage (HEIC, 4K HEVC from a phone) and for the steps that need someone at the screen.

| Step | Result | Notes | Commit |
| --- | --- | --- | --- |
| 1. doctor | ✓ | "All set" once uv was installed (winget, Danny's OK) and Developer Mode turned on (on this build it's Settings → System → **Advanced**, not "For developers"), then the links checked out again. Codex and Muse not installed. | |
| 2. npm run check | ✓ | Passes, before and after pulling a0835b4 (104 tests). | |
| 3. app opens | partly | `npm run desktop` failed to build: the desktop build's esbuild plugin took `C:\…\main.ts` for a package name and marked it external. Fixed. Setup renders, with the 4090 and 24 GB, and still does after a0835b4. Title bar and menu still to see (the snapshot is the page only). | dcbbff0 |
| 4. agents sign in | partly | Claude Code: installed, "Signed in". Codex not installed. | |
| 5. keys in Credential Manager | | | |
| 6. import 4K HEVC + HEIC | partly | CLI import of synthetic footage (a 4K HEVC clip made with `hevc_nvenc`, a 1080p clip, a 12 MP JPEG): proxies, posters and strips in about a second. Real phone footage and HEIC still to do. | |
| 7. song analysis | partly | CLI: 120.01 BPM on a synthetic 120 BPM song (uv and librosa). Studio still to do. | |
| 8. agent turn, key refused | | | |
| 9. edit, notes, undo | | | |
| 10. export | | | |
| 11. voices, Kokoro | partly | `list_voices` gives David and Zira. Narrating worked, but every word was timed 1.5× late: SAPI times its events by the voice's own rate (16 kHz for both), and the helper wrote 24 kHz. At 16 kHz both voices' word starts match the audio to the millisecond (checked with silence detection). A bookmark can't measure the rate instead: David adds 0.2 s after it, and without a full stop it fires mid-line. Listen, captions in the player, and Kokoro still to do. | |
| 12. recording | | | |
| 13. subjects without SAM | | | |
| 14. SAM 3.1 install and cut-outs | | | |
| 15. Recycle Bin | | | |
| 16. npm run app | | | |
| 17. 5070 | | | |

**Also checked on the PC.** On a throwaway `synthtest` project: `assemble` and `render --draft` (a 30 s vertical draft in 32 s, −13.9 LUFS); `node scripts/mcp-smoke.ts synthtest --frame` (33 tools, edits, a refused bad edit, a branched cut, a frame in 2.6 s); `node scripts/agent-smoke.ts claude --project synthtest` (the hosted session ran a whole opening turn: logged footage, fetched fonts, previewed looks, loaded the montage recipe through the link and handed off, with no errors or approval cards).

**Watch out:** npm 11.9 on the PC rewrites `package-lock.json` without its `libc` fields after `npm install`. Don't commit that from the PC.
