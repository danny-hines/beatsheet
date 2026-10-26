# beatsheet

A video editor where an AI agent does the editing and you direct it. Drop in a folder of footage and the agent takes the first turn: it watches and logs every clip, sharpens the brief, and comes back with a few directions to pick from. Pick one and it builds a playable cut. From then on you take turns. You watch, leave notes on anything, and send them; it makes the changes and hands the cut back.

The agent is one you already have, on your own sign-in: **Muse Code**, **Codex** (your ChatGPT plan) or **Claude Code** (your Claude plan). beatsheet runs it inside the app and gives it the tools to edit, look at frames and render.

Under the hood, **nothing is placed at a fixed time unless it has to be**. A shot starts on a word, a beat, a bar of a section, a moment inside a clip, or another shot. Swap the song or re-record a line, and everything that depends on it re-times itself. Dragging a cut in the timeline snaps to those anchors too.

## Run it

```bash
npm install
npm run desktop                  # the Mac app, from this folder
npm run app                      # makes apps/desktop/release/beatsheet.app to double-click
npm run dev                      # or the studio in a browser at http://localhost:5180
npm run check                    # typecheck, tests, validate the examples
```

`beatsheet.app` is a personal build linked to this folder: it uses the projects here and the agent CLIs on this Mac. Rebuild it after pulling changes. It needs ffmpeg (`brew install ffmpeg`); opened from Finder, it finds Homebrew's tools through your login shell's PATH.

## How it works

**First launch.** Setup asks for one working agent. Each card says whether that CLI is installed and signed in: **Install** runs the official installer, **Sign in** opens the CLI's own sign-in in Terminal, and **Check again** tries it. beatsheet never sees your agent's credentials. Below the agents are optional media services (fal, ElevenLabs, Gemini, Meta, Runway, OpenAI, Replicate, Pexels). Each key is verified before it's saved, kept in the macOS Keychain, and unlocks more for the agent: music, voice, images, video, stock footage. Setup is under ⚙ (or ⌘,) any time.

**Home.** The app opens on your projects: start a new one at the top, and below it every project, newest first, with a few of its pictures, what's in it and whose turn it is. In a project, ‹ at the top left (or ⇧⌘O) goes back. To delete one, use ⋯ on its card (or right-click it) → **Move to Trash**. Only the project's own folder goes (its cuts, previews, song copy, exports and anything made for it); the footage folders it points at aren't touched, and Finder's Put Back brings it back.

**New project** (⌘N, or from Home, where you can also drop a folder anywhere on the window). Open a footage folder or start from scratch, give it a title and say what it's for. Under More: audience, references, formats, length and a song. A reference is a link, a folder, a file or a note, and each can say what it's for ("match its pacing and titles", "our logo, for the end card"); the agent reads that beside it. The Brief (top bar) edits them later. Your footage stays where it is; beatsheet makes small preview copies, about a minute per 100 files.

**Media.** **+ Add footage** (⇧⌘I) takes photos and videos, whole folders, or both; drop them on the panel too. Adding a folder again picks up what's new in it. **Record ▾** beside it records into the project:

- **Screen:** macOS's own picker chooses a window, an app or a display, with your microphone if you like. It counts three, then records; stop from the dialog or the menu bar.
- **Camera:** the Mac's camera or one plugged in, with sound.
- **Voice:** just the microphone, with a level meter.

You can pause, watch it back, and keep it or go again. Recordings are saved as MP4 (M4A for sound) in the project's `recordings/` folder and listed under Recordings like any other footage. (File → Record Screen… is ⇧⌘R.)

**Turns.** The bar at the top says whose turn it is.

- *Agent's turn:* it's working. Watch it in the agent panel, or stop it. If beatsheet was closed partway through (or the agent stopped), the panel says so: **Carry on** picks up in the same conversation, or **Take the turn back**.
- *Your turn:* it handed something back. It might ask you to **choose** a direction (with key frames to look at), **review** a cut, or **provide** something it needs (a song, more footage). Answer, reply in your own words, leave notes, or **Skip** the question. The card also says what changed during its turn, with **Undo that turn** to put it all back.

**Notes on anything.** Press N, or use the ✎ and right-click menus:

- a shot, line, section or music cue on the timeline;
- a stretch of the timeline (⇧-drag along the ruler; a plain drag moves the playhead);
- a region of the frame (drag on the player);
- a clip in the media library ("use this somewhere").

Each note attaches to the composer like an attachment, and nothing goes out until you press Send, so you can send a pile of notes in one go. The agent reads them with `get_batch`, makes scoped changes, checks frames, and answers each one. The Notes tab keeps the history, including notes it handed back with a question.

**Cuts.** One project can hold any number of cuts: a 15-second vertical teaser, a long narrated YouTube version, a soft version and a bouncy one. They share the footage and its logging; each has its own length, formats, music, shots and notes. The cut menu next to the project name switches between them, renames or deletes one, and **+ New cut…** (⇧⌘N) makes one. A **fresh start** is a blank slate, with no shots and no music: keep the shape and length for another roll of the dice, or pick others for a long YouTube version or a vertical teaser, and the agent works out again which footage, story and music suit this cut's own goal, audience and shape, without leaning on your other cuts. (Without the agent you get the empty cut to fill yourself.) A **variation** copies a cut, keeping its length and shape, and the agent changes what you ask: funnier, slower, another song. The agent also makes variations on its own; they're marked "by the agent".

Each cut has **its own conversation** with the agent, so one cut's back-and-forth doesn't steer another. Switching cuts brings back that cut's conversation; a new cut starts a new one. The agent works on one cut at a time: while it's busy on one, the others say so, with a link to it.

**Narration.** Any cut can have a voiceover. The agent writes the lines and voices them with `narrate`, and every word is timed, so cuts and titles can land on a word. Inspect (with nothing selected) shows the cut's voice; change it and **Voice the lines** reads them again. Select a line to edit its words or how it's said, play it, or voice just that line; only lines whose words or voice changed are read again. **Settings → Voices** is where voices come from:

- **ElevenLabs** (with a key): its library, voices you **design** from a description (three takes; keep one), and **your own voice cloned** from a minute or two of reading a passage aloud (recorded right there) or from recordings you have. Pick the model too: Eleven v4, Multilingual v2 or Flash v2.5.
- **Kokoro**, installed on your Mac with one click (about 1.5 GB in beatsheet's own folder, **Remove** takes it away): an open voice model, free and offline, far more natural than the built-in voices. Not tested end to end yet.
- **The Mac's own voices**, always there. The ones macOS ships sound robotic; free Premium and Enhanced voices download from System Settings → Accessibility → Spoken Content → System voice → Manage Voices.

Listen to any of them, and choose the one new narration uses. Each cut can pick its own.

**Designed scenes.** Shots don't have to be footage. A designed shot is a React component the agent writes (`write_scene`), compiled as it's saved and played live in the player, so its edits show up while you watch. Or it's one from the kit, with no code: titles, kinetic type, a stat counting up, cards, a quote, a before/after split, a photo wall, polaroids, a phone showing the real site (`capture_page` takes the screenshot, scrolling if it's long), labelled callouts, and overlays like a viewfinder or a flash. Scenes move with the narration: a label lands on the word that names its part. They can be 3D too: the agent imports the product's own CAD files (`import_file`) and pulls the model apart with each part labelled. Select a designed shot to see its scene and tweak its props. A scene that breaks shows its error in red over the shot's card, which is also what the agent sees when it looks at the frame. Scenes live in the project's `scenes/` folder, or under its `codeRoot` (Sparkade's points at its own Remotion project; those scenes need that project's context, so they show as cards with the error).

**Look and captions.** A project has one look: its colours, fonts, grain and a grade for the footage (warmth, saturation, contrast, fade, vignette). Scenes, titles, captions and every clip and photo draw with it. The agent takes it from the brand's site when there's a brand. For personal footage it takes it from the footage itself and the occasion: `palette` reads the footage's colours (a misty Pacific beach is greys, driftwood and dune grass; a Greek island is whitewash and turquoise), and `add_font` brings in any Google font. When you haven't said what feel you're after, it previews two or three looks on your own footage (`preview_looks`) and asks you to pick, on the same card as the directions. You can adjust it under Inspect (with nothing selected). Captions show the narration a phrase at a time with the spoken word highlighted; a shot whose own type already says the words turns them off.

**Sound.** The timeline's Sound lane holds sound effects, each started on an anchor like a shot: whooshes into scene changes, pops as cards land, an impact on a reveal. Seventeen are built in, made for beatsheet; with an ElevenLabs key the agent can make others from a description (`generate_sfx`). Music dips under the voice by itself. `fit_music` cuts the song on bar lines so its real ending lands on the last frame, and the final render is mastered to −14 LUFS with a limiter, so it's as loud as everything else on social.

**Review pass.** Before handing a cut back, the agent renders a small copy and calls `review_cut`: a contact sheet of the whole cut, plus notes on anything held still too long, footage left uncropped in another format, silences, a cut that's too long, missing captions or sound. Then a design pass: every designed shot larger, as it enters, midway and settled, with notes on the design (no look of its own, hero moments left to stock kit scenes, the same scene over and over, a slam on every cut). The agent critiques those as a design lead would, with a fresh subagent where it can, fixes the weakest things and looks again.

**Taste.** Designed scenes start from a design system for the project (its look, a motif from the product or from what's in the footage, a motion character), written down as `DESIGN.md`. The moments that carry a video are written for the project; the kit is for quick utility shots. A project without a look of its own draws in plain neutrals, never another brand's colours.

**People, faces and cut-outs.** Select a clip in the library to find the faces and people in it (Apple's Vision framework, on your Mac, about a second a clip), or box anything to follow it. Then, on a shot:

- blur a stranger's face;
- add a name tag that follows someone;
- add a spotlight;
- keep someone in a vertical crop of landscape footage.

**Cut out** lifts people or things out of a photo or clip as transparent assets that line up over their source. That's how you get a title tucked behind someone, or a photo popping back into colour one person at a time. Shots can come in with a pop, fade, slide or zoom. The agent has all of this too, and the July 4 demo project has a cut showing it off.

**Cut out anything you describe.** Settings → On this Mac → SAM 3 → **Install** sets up Meta's Segment Anything 3 (the [MLX port](https://github.com/Deekshith-Dade/mlx_sam3)) on your Mac's GPU. One click does it all: uv (only if you don't have it), a Python of its own, the port's locked packages and the 3.4 GB model, downloaded in parallel, checksummed, and resumable if you press Stop. Then it runs a test cut-out. Everything stays in `~/Library/Application Support/beatsheet/sam3` (about 4.4 GB), and **Remove** deletes that folder. Once it's installed, type what you want ("the kids", "the boy in the cap", "truck") under a photo or clip, and the agent's `cut_out` takes a `prompt`. It works on photos and stills from clips; a cut-out takes about a second once the model is loaded. Short, concrete names work best. Without it, a fal key gets SAM 3.1 for photos through fal.

**Keys.** Space plays, arrows step frames (↑↓ jump shot to shot), N notes what's selected, and ? lists the rest.

**Layout.** The media library is on the left: everything logged, rated and tagged, grouped by folder, with filmstrip scrubbing on hover. The player and timeline are in the middle. On the right is the agent (the conversation, its tool calls and approvals), then Notes and Inspect.

## The agents

| Agent | How beatsheet runs it | Needs |
|---|---|---|
| Muse Code | `muse serve` (Muse Session Protocol) | `muse`, signed in |
| Codex | `codex app-server` | `codex`, signed in to ChatGPT |
| Claude Code | `claude -p` with stream-json in and out | `claude`, signed in with your Claude plan |

beatsheet's own tools are allowed without asking, and so is looking around (listing folders, reading a file's media details). Anything else the agent wants to run (a shell command that changes something, a file edit outside the project, the web) comes up as an approval card, with the command's first lines and **Show all**. Settings → Agent → **Let it work without asking** (or **Stop asking…** on any card) lets it run commands and edit files on its own; an open Claude Code session picks that up straight away. Services are used through beatsheet's tools (`narrate`, `generate_music`), which hold the keys. Claude Code is kept away from the Keychain by its permission rules; Codex's sandbox doesn't stop a shell command reading it, which is on the list below.

**Pages you're signed in to.** The agent's own browsers aren't signed in to anything. Settings → Agent → **Use my Chrome** has it work in your Chrome instead, and you're asked before it acts on each site. Claude Code goes through the Claude in Chrome extension (installed and signed in). Codex uses OpenAI's Chrome plugin, which comes with the ChatGPT app, when it has it. Muse Code (and Codex without that plugin) attach through Chrome DevTools MCP: turn on remote debugging once at chrome://inspect/#remote-debugging, and Chrome asks you to allow each connection. Muse Code also has computer use of its own; beatsheet passes on its requests to control an app, and never says yes to them for you. It can open a Google Photos album, download what the project doesn't have yet, and bring it in with `import_media`: files, folders or zips are copied into the project's `imported/` folder, and anything already there (the same file, a browser's "(1)" copy, the same shot under another name) is skipped. Without it, download the files yourself and tell the agent where they are.

**Music.** When a cut needs a song, the agent asks for one: **Choose a song…** from your Mac, or, with an ElevenLabs key, **Make one** and the agent makes the song it described (`generate_music`, about a minute, using your ElevenLabs credits). Made songs are analysed for beats and sections like any other and kept in the project's `music/` folder. Conversations belong to a cut: opening a cut brings back its last conversation, with its history (after a restart too), and the agent menu lists that cut's other sessions to **Resume** (and ones from before cuts had their own).

Agents started yourself in a terminal in this folder load beatsheet's tools too (`.mcp.json`; `muse --trust-workspace`) and show up under "In a terminal".

`node scripts/agent-smoke.ts <muse|codex|claude> [model]` checks the hosting end to end: it starts a session and asks for one beatsheet tool call.

## From the terminal

```bash
npm run beatsheet -- import ~/Movies/trip --id trip --title "Trip" --song ~/Music/song.mp3
npm run beatsheet -- assemble trip                  # instant first cut on the beat
npm run beatsheet -- render trip --draft            # MP4 in projects/trip/out/
npm run beatsheet -- render trip --cut teaser       # another cut
```

Song analysis (tempo, downbeat, sections) runs librosa through `uv`, so there's nothing extra to install.

## What's here

| Path | What it is |
|---|---|
| `packages/schema` | The project format (shared material plus cuts), the anchor resolver, snapping, the deterministic first cut (`autoAssemble`), the notes batch. Pure TypeScript, shared by everything |
| `packages/engine` | Import, song analysis, versioned project storage, turns, the media/API server and its live event stream, rendering, the MCP server, the hosted agents (`src/agent`), settings and media services, and the CLI |
| `packages/video` | The Remotion composition behind every project (the studio plays it live and the renderer exports it), the scene runtime, and the kit of designed scenes and pieces (`@beatsheet/motion`) |
| `apps/studio` | The UI: setup, new project, the media library, the player and anchor-aware timeline, the agent panel, turns and notes |
| `apps/desktop` | The Electron shell: a window, native pickers and menus, and the engine running inside it |
| `projects/` | Your projects (not in git) |
| `examples/` | Sparkade's social cut and a stand-in Lisbon montage with no media |
| `packages/engine/sfx` | The built-in sound effects (made by `packages/engine/py/make_sfx.py`) |
| `.agents/skills` | The recipes the agents follow: `montage` (cut to music), `story` (narrated showcases and explainers) and `motion` (designed scenes) |

Settings live in `~/Library/Application Support/beatsheet/settings.json` (no secrets; keys are in the Keychain). The local server answers only on 127.0.0.1, and anything that changes something needs the studio's `x-beatsheet` header, so a web page can't drive it.

## Not built yet

- Generating images and video with the service keys. Narration and music use ElevenLabs; the other services are verified and listed for the agent, with no generation tools yet. Music from fal or Gemini isn't wired up either. (SAM 3.1 cut-outs through fal are wired up but untested without a key.)
- Recording the Mac's own sound with the screen. Screen recordings take the microphone only for now.
- ElevenLabs speech, voice design, cloning and music are written to their documentation and untested end to end (they spend credits); listing voices is tested. Kokoro's install (about 1.5 GB) is untested.
- SAM for moving cut-outs. The MLX port does pictures, so SAM handles photos and stills, and Apple Vision handles clips. fal's SAM 3/3.1 video (about 0.5–1¢ per 16 frames) would bring it to any machine.
- Windows, for PCs with an NVIDIA card. First the Mac-only plumbing: finding the agent CLIs and their PATH (`zsh`), sign-in in Terminal, keys in the Keychain, settings in Application Support, the app build, `sips`, and Cmd shortcuts. Then SAM 3.1 installed from Settings with Meta's own code on CUDA. That needs a Hugging Face token with access to the gated weights, and `triton-windows` (or Transformers' SAM 3, which doesn't need Triton). Its video model would find, follow and cut out anything you name, in place of Apple Vision. Projects store absolute footage folders, so one made on the Mac needs a "find the footage" step on the PC. Check whether Muse Code runs on Windows.
- Tracks of the same person aren't joined automatically: someone who leaves the frame and comes back is two subjects until they're joined (`join_subjects`, or in the studio).
- Scenes written for another Remotion project (Sparkade's) run, but crash without that project's own context, so they show as cards. Giving them their context, or porting them, is next.
- ElevenLabs sound effects (`generate_sfx`) are written to its documentation and untested (they spend credits). The built-in sounds are tested.
- Agents on an API key instead of a CLI.
- Recording a signed-in page as video. The agent can browse it in your Chrome, but only you can record it (Record → Screen); a window recorder the agent can start and stop is next.
- Keeping Codex away from the Keychain: keys are stored with the `security` command, so a shell in Codex's sandbox can read them. They need storing where only beatsheet can read them.
- A signed, notarized app that runs without this folder.

See [docs/DESIGN.md](docs/DESIGN.md) for the reasoning.
