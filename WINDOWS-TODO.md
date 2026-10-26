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
