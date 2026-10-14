# Working in beatsheet

## Project files are the source of truth

Each video is one `project.json` (format: `packages/schema/src/types.ts`). The studio, tests and agents all read and write it. After editing one, run `node scripts/validate-examples.ts` (or `npm run check`).

- **Time is an anchor, never a raw timecode.** Start a shot on a `word`, `line`, `beat`/`bar` (counted from a music `section`), `section`, `moment` in a clip, or another `shot`, plus an `offset` when needed. Use `{ "kind": "time" }` only when nothing else fits.
- Shots on a track chain in array order: a shot without `end` runs until the next shot's start. Insert new shots in time order.
- Bars and beats are stored counting from 0 (`n: 0` is the first bar of the section). The UI shows them counting from 1.
- Respect locks. Don't change anything a locked stage owns (a locked `structure` means the script and voice are final).
- Lines, shots and cues with `only` exist in just those formats. Per-format pauses go in `gaps`.

## Addressing a batch of notes

A batch lists note ids with resolved context: the shot, the line, the time range, and the frame region if one was drawn. For each note:

1. Make the change in `project.json`. For coded shots, edit the component under the project's `codeRoot`.
2. Keep the change scoped to what the note points at.
3. Set the note's `status` to `"done"` and write a one-line `reply` saying what changed. If you can't do it, leave it `"open"` and use `reply` to say why.

## Code

- TypeScript throughout. `packages/schema` is pure (no DOM, no Node APIs) so the studio, the engine and an MCP server can all share it.
- The resolver never throws on bad timing. It returns diagnostics and NaN times; keep it that way.
- Add a test in `packages/schema/test` for every resolver change. The Sparkade tests use real numbers from that cut, so keep them passing.
