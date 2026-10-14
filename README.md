# beatsheet

A video editor where your coding agent (Claude Code or Codex, on your own subscription) does the heavy lifting and you keep fine control. You move through stages (brief → material → structure → board → assemble → craft → sound → finish), make quick edits directly, and pin notes anywhere. When you're ready, you send the notes to the agent as one batch.

The core idea is that **nothing is placed at a fixed time unless it has to be**. A cut starts on a word, a beat, a bar of a section, a moment inside a clip, or another shot. Re-record a line or swap the song, and everything that depends on it re-times itself. Dragging a cut in the UI snaps to those anchors, so your direct edits keep working that way too.

## Run it

```bash
npm install
npm run dev        # studio at http://localhost:5180
npm run check      # typecheck, tests, and validate every example project
```

## What's here (milestone 1, steps 1–2)

| Path | What it is |
|---|---|
| `packages/schema` | The project file format (zod), the resolver that turns anchors into times per format, snapping, and descriptions |
| `apps/studio` | The UI shell: stage views, an anchor-aware timeline, a stand-in preview, notes, and the batch hand-off |
| `examples/sparkade-social` | Your Sparkade social cut, ported from `~/sparkade-video`: real lines, word timings, music edits and script intents. It resolves to the same times as Sparkade's own builder in both formats |
| `examples/lisbon-montage` | A stand-in vacation reel with no media yet: beat-synced shots, a clip synced to the drop, a generated shot with two takes, and a placeholder |
| `scripts/validate-examples.ts` | Checks every example against the format and resolves each format |

The example notes are sample data. The studio saves straight to `examples/*/project.json`, so `git checkout examples` resets them.

## Not built yet

- **Step 3 (engine):** the real player (Remotion), media ingest with low-res proxies, thumbnails and beat detection, rendering, and the MCP server that lets Claude Code and Codex read notes and edit the project.
- **Later:** recipes as skills (narrated, montage, cinematic), the narrated recipe ported from Sparkade/Muse Cam, services behind API keys (fal, ElevenLabs, Runway, Gemini), the Send button over Channels, packaging as a Claude Code plugin, and Electron.

See [docs/DESIGN.md](docs/DESIGN.md) for the reasoning.
