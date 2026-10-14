# beatsheet

A video editor where your coding agent (Claude Code or Codex, on your own subscription) does the heavy lifting and you keep fine control. You move through stages (brief → material → structure → board → assemble → craft → sound → finish), make quick edits directly, and pin notes anywhere. When you're ready, you send the notes to the agent as one batch.

The core idea is that **nothing is placed at a fixed time unless it has to be**. A cut starts on a word, a beat, a bar of a section, a moment inside a clip, or another shot. Re-record a line or swap the song, and everything that depends on it re-times itself. Dragging a cut in the UI snaps to those anchors, so your direct edits keep working that way too.

## Run it

```bash
npm install
npm run dev                      # studio at http://localhost:5180
npm run check                    # typecheck, tests, validate the examples
```

Make a project from a folder of footage. Your footage stays where it is; the project gets preview copies and thumbnails, about a minute per 100 files:

```bash
npm run beatsheet -- import ~/Movies/trip --id trip --title "Trip" --song ~/Music/song.mp3
npm run beatsheet -- assemble trip          # instant first cut on the beat
npm run beatsheet -- render trip --draft    # MP4 in projects/trip/out/
```

Song analysis (tempo, downbeat, sections) runs librosa through `uv`, so there's nothing extra to install.

## Use it with your agent

The agent works on projects through beatsheet's MCP server while you watch and edit in the studio. Every change shows up live, and every write is validated and version-checked so neither side overwrites the other.

- **Claude Code:** open a session in this folder. It picks up `.mcp.json` (approve the `beatsheet` server when asked) and the `montage` skill in `.claude/skills`.
- **Codex:** add the server to `~/.codex/config.toml`. `AGENTS.md` carries the same conventions.

  ```toml
  [mcp_servers.beatsheet]
  command = "node"
  args = ["/Users/you/beatsheet/packages/engine/src/mcp.ts"]
  ```

Then ask for things like "log the footage in july-4 and make a better first cut", or, after leaving notes in the studio, "handle my beatsheet notes".

## What's here

| Path | What it is |
|---|---|
| `packages/schema` | The project format, the anchor resolver, snapping, the deterministic first cut (`autoAssemble`) and the notes batch. Pure TypeScript, shared by everything |
| `packages/engine` | Import (probe, preview copies, thumbnails, filmstrips), song analysis, versioned project storage, the media/API server, rendering, the MCP server and the CLI |
| `packages/video` | The Remotion composition behind every project: the studio plays it live and the renderer exports it |
| `apps/studio` | The UI: stage views, the anchor-aware timeline, the live player, notes and the batch hand-off, render buttons |
| `projects/` | Your projects (not in git) |
| `examples/` | Sparkade's social cut ported from `~/sparkade-video`, and a stand-in Lisbon montage with no media |
| `.claude/skills/montage` | The montage recipe the agent follows |

## Not built yet

- Coded shots (Sparkade's Remotion scenes) play as placeholder cards. The narrated recipe will run them.
- Loudness mastering, captions, ducking and sound effects.
- Services behind API keys (fal, ElevenLabs, Runway, Gemini).
- The Send button pushing straight into an open session through Channels. For now, mark notes sent and tell the agent to handle them.
- Packaging as a Claude Code plugin, and Electron.

See [docs/DESIGN.md](docs/DESIGN.md) for the reasoning.
