# Working in beatsheet

## Project files are the source of truth

Each project is one `project.json` (format: `packages/schema/src/types.ts`). The studio, tests and agents all read and write it. After editing one, run `node scripts/validate-examples.ts` (or `npm run check`).

- **A project has shared material and cuts.** Shared: the footage folders (`sources`), the footage itself (`assets`, with ratings, tags and moments) and the `brief`. Each cut (`cuts[]`) is a version of the video with its own `spec` (purpose, length, audience), formats, music, voice, shots, notes and stages. Code mostly works on one cut at a time: `cutView(file, cutId)` gives a `Project` (the cut plus the shared parts) and `withCut(file, project)` writes it back.
- Files from before cuts (`beatsheet/0.1`) are upgraded when read (`upgrade` in `packages/schema/src/cuts.ts`) and written in the new shape, with the original kept as `project.v1.json`.

- **Time is an anchor, never a raw timecode.** Start a shot on a `word`, `line`, `beat`/`bar` (counted from a music `section`), `section`, `moment` in a clip, or another `shot`, plus an `offset` when needed. Use `{ "kind": "time" }` only when nothing else fits.
- Shots on a track chain in array order: a shot without `end` runs until the next shot's start. Insert new shots in time order.
- Bars and beats are stored counting from 0 (`n: 0` is the first bar of the section). The UI shows them counting from 1.
- Respect locks. Don't change anything a locked stage owns (a locked `structure` means the script and voice are final).
- Lines, shots and cues with `only` exist in just those formats. Per-format pauses go in `gaps`.

## Working on a project

- Real projects live in `projects/<id>/` (not in git): `project.json`, the song in `music/`, and a `.cache/` of preview copies, posters and filmstrips. The footage stays in its own folders (`sources`); asset paths are relative to their source.
- Prefer the `beatsheet` MCP tools when they're available: `get_project`, `list_assets`, `look_at_assets`, `log_assets`, `first_cut`, `set_song`, `edit_project`, `create_cut`, `add_asset`, `find_subjects`, `track_subject`, `join_subjects`, `cut_out`, `list_voices`, `narrate`, `generate_music`, `generate_sfx`, `fit_music`, `list_kit`, `write_scene`, `import_file`, `capture_page`, `import_media`, `palette`, `preview_looks`, `add_font`, `review_cut`, `get_batch`, `resolve_note`, `frame`, `render`, `hand_off`. Cut-level tools take `cut` (default the first cut). They validate every write and check versions, so they never clobber the person's edits in the studio. Editing `project.json` by hand works too, but run `node scripts/validate-examples.ts` afterwards for examples.
- Recipes (how to run each stage for a kind of video) are skills in `.agents/skills/` (linked from `.claude/skills/` for Claude Code). Montages: `.agents/skills/montage/SKILL.md`; narrated videos: `story`; designed scenes: `motion`.
- CLI: `npm run beatsheet -- <import|song|assemble|cache|render|analyze|list>`.
- Designed (coded) shots name a component: `kit:<Name>` from the kit in `packages/video/src/kit` (props in `catalog.ts`), or `<file>#<Export>` relative to the project's `codeRoot` (its `scenes/` folder by default). The engine compiles scene files with esbuild (`packages/engine/src/scenes.ts`) and the page runs them with its own React, Remotion, three and kit (`packages/video/src/runtime.tsx`). Scenes must be deterministic: everything from `t`/`frame`, nothing fetched.
- The project's `look` (colours, fonts, grain, the footage's grade) is shared by every cut; captions and `sfx` cues belong to a cut. Built-in sounds are in `packages/engine/sfx`.
- Files you make (a generated clip, a trimmed export, a still) go in through `add_asset` with their provenance, so the studio can show them and make their previews. Don't write into a footage folder.
- Narration is a cut's `voice`: lines with text, a file and timed words. `narrate` writes and voices them (`packages/engine/src/narrate.ts`, voices in `voices.ts`: ElevenLabs, Kokoro or the Mac's own through `native/speech.swift`) into `projects/<id>/vo/<cut>/`; a voiced line's file name carries a fingerprint of its voice and words (`lineState` in `packages/schema/src/voice.ts`), so changed lines show and only they are read again. Earlier files stay, for undo.
- Services (ElevenLabs and the rest) are used only through beatsheet's tools, which read keys from the Keychain inside the engine. Agents never read keys or call a service's API themselves; hosted Claude Code sessions are blocked from the Keychain (`permissionArgs` in `packages/engine/src/agent/claude.ts`).
- Recordings made in the studio (screen, camera, microphone) are footage with `provenance.source: "recorded"`, kept in `projects/<id>/recordings/`.
- Subjects (`asset.subjects`) are faces, people and things found or followed in a file, as boxes over time (`[t, x, y, w, h]`, 0..1, top-left). Clip shots can follow them: `content.effects` (blur, label, spotlight) and `content.reframe.<format>.follow`. Ids stay stable when they're found again, so effects keep pointing at the same person. Cut-outs are assets with `cutout: { of, box, from }`; they line up over their source when it's on screen (`packages/schema/src/frame.ts` has the geometry). Apple Vision does the work through `packages/engine/native/vision.swift`, built on first use. `cut_out` with a `prompt` uses SAM 3 when it's installed from Settings (`packages/engine/src/sam.ts`, which runs `native/sam-worker.py` in its own Python under Application Support), or SAM 3.1 through fal.

## Turns

The studio shows whose turn it is. Starting work makes it the agent's turn (a snapshot is saved, so the person can undo the whole turn). End every turn with `hand_off`: say what you did and what you need, as a `choose` (2 or 3 options, each with key-frame `assets`), a `review` (a cut to watch) or a `provide` (something only the person has, like a song). A hosted agent that stops without handing off gives the turn back anyway, but with no question for the person.

## Addressing a batch of notes

A batch lists note ids with resolved context: the shot, the line, the time range, and the frame region if one was drawn. For each note:

1. Make the change in `project.json`. For coded shots, edit the component under the project's `codeRoot`.
2. Keep the change scoped to what the note points at.
3. Set the note's `status` to `"done"` and write a one-line `reply` saying what changed. If you can't do it, leave it `"open"` and use `reply` to say why.

## Code

- TypeScript throughout. `packages/schema` is pure (no DOM, no Node APIs) so the studio, the engine and an MCP server can all share it.
- The resolver never throws on bad timing. It returns diagnostics and NaN times; keep it that way.
- Add a test in `packages/schema/test` for every resolver change. The Sparkade tests use real numbers from that cut, so keep them passing.
