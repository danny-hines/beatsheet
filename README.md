# beatsheet

A video editor where Muse Code does the heavy lifting and you keep fine control. You move through stages (brief → material → structure → board → assemble → craft → sound → finish), make quick edits directly, and pin notes anywhere. When you're ready, you send the notes to the agent as one batch.

The core idea is that **nothing is placed at a fixed time unless it has to be**. A cut starts on a word, a beat, a bar of a section, a moment inside a clip, or another shot. Re-record a line or swap the song, and everything that depends on it re-times itself. Dragging a cut in the UI snaps to those anchors, so your direct edits keep working that way too.

## Run it

```bash
npm install
npm run dev                      # studio at http://localhost:5180
npm run check                    # typecheck, tests, validate the examples
```

Click **+ New** in the studio to start a project: title, goal, audience, tone, formats and length go into the brief, and you choose the footage folder and a song. beatsheet imports the footage, analyses the song and makes a first cut on the beat, with progress as it goes. Your footage stays where it is; the project gets small preview copies and thumbnails, about a minute per 100 files.

The same from the terminal:

```bash
npm run beatsheet -- import ~/Movies/trip --id trip --title "Trip" --song ~/Music/song.mp3
npm run beatsheet -- assemble trip          # instant first cut on the beat
npm run beatsheet -- render trip --draft    # MP4 in projects/trip/out/
```

Song analysis (tempo, downbeat, sections) runs librosa through `uv`, so there's nothing extra to install.

## Use it with Muse Code

Muse Code edits projects through beatsheet's MCP server while you watch and edit in the studio. Every change shows up live, and every write is validated and version-checked so neither side overwrites the other.

**Connect Muse Code** (top right in the studio) opens Muse in Terminal, in this folder, with beatsheet's tools and the montage recipe loaded:

- **New session** on Muse Wonder Full, Muse Wonder, Muse Spark 1.3 or Spark 1.2, with the open project named in its first message.
- **Resume** any earlier session started from beatsheet.

The menu shows the connected session, its model and what it's doing ("Muse Code · Wonder Full · editing july-4"). Sessions you start yourself with `muse --trust-workspace` in this folder show up too.

**Send** in the notes panel marks your queued notes as sent; tell Muse "handle my beatsheet notes" and it picks up exactly those. (Pushing the batch straight into the session is in progress.)

Muse loads `.mcp.json` and `.agents/skills` only in a trusted workspace; the studio's launcher passes `--trust-workspace`.

## What's here

| Path | What it is |
|---|---|
| `packages/schema` | The project format, the anchor resolver, snapping, the deterministic first cut (`autoAssemble`) and the notes batch. Pure TypeScript, shared by everything |
| `packages/engine` | Import (probe, preview copies, thumbnails, filmstrips), song analysis, versioned project storage, the media/API server, rendering, the MCP server and the CLI |
| `packages/video` | The Remotion composition behind every project: the studio plays it live and the renderer exports it |
| `apps/studio` | The UI: stage views, the anchor-aware timeline, the live player, notes and the batch hand-off, render buttons |
| `projects/` | Your projects (not in git) |
| `examples/` | Sparkade's social cut ported from `~/sparkade-video`, and a stand-in Lisbon montage with no media |
| `.agents/skills/montage` | The montage recipe Muse follows |

## Not built yet

- Coded shots (Sparkade's Remotion scenes) play as placeholder cards. The narrated recipe will run them.
- Loudness mastering, captions, ducking and sound effects.
- Services behind API keys (fal, ElevenLabs, Runway, Gemini).
- Packaging as a Claude Code plugin, and Electron.

See [docs/DESIGN.md](docs/DESIGN.md) for the reasoning.
