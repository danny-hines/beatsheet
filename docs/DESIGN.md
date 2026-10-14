# Design notes

## The problem

Prompting an agent to edit a video produces better work than hours in a traditional editor. But every change goes through chat and a full render: you describe a timestamp, the agent works out what you meant, and you wait. Small nudges cost as much as big changes, and long sessions burn tokens re-reading the whole project.

## Principles

1. **Anchors, not timecodes.** The Sparkade and Muse Cam projects already time everything from narration words and music bars, which is why a re-recorded line re-cuts the whole video. beatsheet makes that the file format. A traditional editor's absolute timeline would throw it away.
2. **The spine depends on the kind of video.** Narrated explainers hang off the voice, montages off the music's beats and sections, vlogs off the footage transcript, and cinematic pieces off story beats and then picture.
3. **Four kinds of shot on one timeline.** *Clip* (your footage: in point, crop, speed, look) is plain data the UI fully edits. *Generated* keeps its prompt and takes, so regenerating is a button. *Coded* is a component the agent writes, with named values (knobs) the UI turns into controls. *Text* and *placeholder* cover the rest.
4. **Each shot has its own stage.** One shot can be final while another is still an idea card, and the preview always uses the best version of each.
5. **Edits versus notes.** Anything you can do with a drag or a slider happens in the UI and costs no tokens. Anything that needs judgment or generation becomes a note pinned to a shot, line, word, cue, asset or part of the frame. Notes queue until you send them as a batch, and each one carries its resolved context so the agent opens only what it needs.
6. **Locks.** Locking a stage marks what's final for you and the agent alike, such as the script once the voice is recorded.

## Who drives

The agent drives the app, not the other way around. The user's own Claude Code or Codex session, signed in through its normal flow, connects to the engine's MCP server. This is agent-agnostic, uses the subscription the user already has, and stays within Anthropic's rules: the Agent SDK can't use claude.ai sign-in in a third-party app without approval. An embedded agent (Agent SDK or Codex's app-server with an API key) can come later for people without either tool. It would use the same MCP tools and skills, so it's a UI project, not a new harness.

Small single-call jobs, like tagging footage or suggesting hooks, go to services behind API keys alongside fal, Runway and ElevenLabs. The UI can trigger them directly without the agent.

## Packaging

1. Local engine plus web UI, opened in the Claude or Codex desktop app's browser pane. Agent knowledge (recipes, stage how-tos) ships as skills, and the engine as an MCP server, bundled as a Claude Code plugin.
2. Electron around the same engine and UI for people without Node.
3. Artifacts and MCP Apps for side jobs: sharing a storyboard or rough cut for comments, and small in-chat choices.

## Milestones

1. **Format, UI shell, then the engine with a montage end to end** (in progress: format and shell done).
2. Narrated recipe: port the Sparkade/Muse Cam conventions.
3. Services with API keys, the Send button through Channels, and plugin packaging.
4. Brief, structure and board stages done properly, plus a cinematic recipe.
5. Electron.
