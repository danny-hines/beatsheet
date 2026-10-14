---
name: montage
description: Make or improve a beat-synced montage (vacation reel, event recap, Reels/TikTok/Shorts) in beatsheet. Use when someone asks for a montage, reel, recap or highlight video from a folder of clips and photos, asks to log footage, or asks you to handle their beatsheet notes on a montage project.
---

# Montage recipe

A montage's timing hangs off the music: cuts land on beats, and the song's energy sets the pace. The person reviews in the beatsheet studio (`npm run dev`, http://localhost:5180) while you work through the `beatsheet` MCP tools. Every change you make shows up there live.

## 1. Start or find the project

- New footage: `npm run beatsheet -- import <folder> --id <short-id> --title "<Title>" [--song <file>]`. This makes preview copies and thumbnails, about a minute per 100 files.
- Existing: `list_projects`, then `get_project`. Read the brief (length, tone, platforms) and which stages are done or locked.

## 2. Log the footage (material stage)

Logging is what makes the cut good, so don't skip it. Work through `list_assets` (filter `unrated`) in groups of up to 12 with `look_at_assets`. A video comes back as 8 frames with the time of each frame; a photo comes back as a thumbnail. For each asset, `log_assets`:

- **rating**: 5 for the best moments of the day, 3 for usable, 1 for filler, -1 to reject (blurry, accidental, pocket shots, near-duplicates of something better).
- **label**: a few words saying what it is ("Kids at the parade", "Sparklers in the driveway").
- **tags**: people, place, activity, time of day.
- **moments** (videos): seconds into the source worth landing on a beat, such as a jump, a burst, a laugh or a wave crashing. Estimate them from the frame times; score them 0–1.

Keep labels to what's visible. Don't guess names.

## 3. Music (structure stage)

The cut needs a song with a beat grid. If the project has none, ask the person for a file (or offer to generate one), then `set_song`. `get_project` lists the song's sections (Intro, Build, Drop…) with their energy.

## 4. First cut (assemble stage)

`first_cut` with `include` set to the keepers in story order (usually the order they were shot), and `targetLength` from the brief. It lands the song's first drop early, cuts every bar in builds and every 2 beats in drops, and puts each clip's best moment early in its shot.

## 5. Make it better

Look at it with `frame` (at the drop, at section changes, at a few random shots), then refine with `edit_project`:

- **Land moments on beats**: set a clip's `content.sync` to `{ "moment": "<moment id>", "at": { "kind": "beat", "n": 0, "from": "drop" } }` (the big moment on the drop is the classic).
- **Pace**: hold the strongest shots longer by removing the next cut, or by moving a shot's `start` to a later beat. Keep 2-beat cuts for high-energy runs.
- **Framing for vertical**: landscape footage gets `content.reframe.<format> = { x, y, zoom }`. Point `x`,`y` (0–1) at the subject.
- **Story**: open on a wide or establishing shot, put the best moment on the drop, end on people (a group shot or a calm wide shot).
- **Text**: one title card is enough; keep it short.

Address shots by id in patches: `/shots/id=s07/start`. Keep timing as anchors (beats, bars, sections, moments). After a batch of edits, check `frame` on what changed, then tell the person what you did. They'll review and leave notes.

## 6. Notes

When the person says something like "handle my notes": call `get_batch`. For each note, make the scoped change, check it with `frame` if it's visual, then `resolve_note` with a one-line reply. If a note asks for something you can't do, resolve it with `done: false` and say why.

## 7. Export

`render` with `draft: true` for a quick look, then a final render. Output lands in `projects/<id>/out/`.
