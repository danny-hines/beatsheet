# Editing by hand

beatsheet's cuts are timed by anchors (a word, a beat, a bar, a moment in a clip), not timecodes, so the agent can recut them when the narration or the music changes. Editing by hand keeps that: every drag and key in the studio is an edit to `project.json` that writes anchors, made by the schema's own operations, so the agent and the studio edit the same way and both undo.

## What each edit does to the timing

- **Split** (S, ⌘B) puts the new cut on what's at the playhead: the word or beat it's on (within half a frame), else the nearest word, beat or bar plus an offset. The second piece carries on from the same frame of its footage and keeps the shot's end. Anything that started on the shot's end now starts on the second piece's end. A move through the shot (a push in) is split where the picture is at the cut.
- **Delete** (⌫) on the picture: the shot before holds on through the time the deleted one had, so there's no black. On an overlay or text track the time is left empty. Anything that started on the deleted shot keeps its moment, re-anchored (`anchorAt`); a note on it moves to the stretch of the cut it covered.
- **Delete and close the gap** (⇧⌫, "ripple"): what's placed by time after it moves up by its length, and a shot that simply followed the one before comes straight after. What's on a word or a beat stays with it, because the narration or the music sets the timing there; on a cut timed by its shots (each with a length), rippling closes the gap as it would anywhere.
- **Move** a picture shot and it takes the place of the shot where it's dropped, the ones between shifting by one: on a cut timed by words or beats the cuts stay where they are and the footage is reordered; on a cut where each shot has a length, shots move with their lengths. A clip that landed a moment on a beat (`sync`) plays from where it did instead. Overlays and titles move freely, keeping their length.
- **Drag an edge** to move a cut: the footage stays where it was in the cut (its in-point moves with the cut), and the shot before, if it ran up to this one, still does. Dragging a shot's end when it runs until the next shot starts moves the next shot's start.
- **Slip** (⌘-drag, ⌥, and ⌥.) slides the footage under a shot; a clip landed on a moment keeps landing, on a point that far along.
- **Overwrite** (Put in at the playhead, a marked range dragged onto the timeline, paste): splits what's there at both ends and replaces the middle, so the cuts either side keep their timing.

The operations are in `packages/schema/src/edit.ts`, tested in `packages/schema/test/edit.test.ts`.

## Talking footage, several cameras, finishing, exports

- **Script** (`script.ts`): a word said across a cut belongs to the shot that plays its middle. Deleting words takes out from halfway through the pause before them to halfway through the pause after. New transcripts are fitted to the sound (`fitWordsToSound`): whisper.cpp stretches a word over the pause after it and starts the next one late.
- **Angles** (`multicam.ts`, engine `multicam.ts`): recordings are lined up by cross-correlating their loudness envelopes (500 a second, slow swells taken out), so they need sound in common; a match under 1.5 times the next best is left out. Each speaker's camera is the one that hears them loudest relative to how loud it hears everyone.
- **Keys and layout** (`keys.ts`, the renderer's `Placed`): keys are in seconds into the shot, so they move with it. A layout's box is a fraction of the frame; a mask's box is a fraction of the shot's box.
- **Exports** (`exports.ts`, engine `render.ts`, `share.ts`): every file with sound is mastered to −14 LUFS. Timeline files point at the original footage, not the playable copies.

## Gaps

- **Playing backwards** (J) is slow with video in it: the player seeks each frame.
- **A split coded scene** starts its animation again in the second piece.
- **Undoing a corrected word** brings back the old transcript version's date, not the old word (the transcript file changed). Transcripts made before this don't have their words fitted to the sound; transcribe again to fit them.
- **Speed ramps** play as eight steady stretches. Moments, words and subjects in a ramped shot are placed as if its speed were steady.
- **Reversing a clip**, **EQ and compression**, **LUTs**, **scopes** and **matching one shot's color to another's** aren't here yet.
- **The chroma key** is a color-difference key for green and blue screens, with a spill control; it has no edge refinement, and other colors can't be keyed.
- **Timeline files** carry the footage, its timing and speed. Designed shots, titles and captions come through as gaps named for what's in them; keys, layouts, grades, masks and dissolves don't come through.
- **Review links** work on the same network only (there's no hosting), and Windows may ask to let beatsheet through its firewall the first time.
