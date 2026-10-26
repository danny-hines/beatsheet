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
  - Least certain in the worker (`packages/engine/native/sam-cuda-worker.py`): point prompts (`cut_out` with `point`, and the fallback when a box finds nothing), and boxes. A box is used as an example of what to find, keeping the match that best fills it.
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

Status: not started.

| Step | Result | Notes | Commit |
| --- | --- | --- | --- |
| 1. doctor | | | |
| 2. npm run check | | | |
| 3. app opens | | | |
| 4. agents sign in | | | |
| 5. keys in Credential Manager | | | |
| 6. import 4K HEVC + HEIC | | | |
| 7. song analysis | | | |
| 8. agent turn, key refused | | | |
| 9. edit, notes, undo | | | |
| 10. export | | | |
| 11. voices, Kokoro | | | |
| 12. recording | | | |
| 13. subjects without SAM | | | |
| 14. SAM 3.1 install and cut-outs | | | |
| 15. Recycle Bin | | | |
| 16. npm run app | | | |
| 17. 5070 | | | |
