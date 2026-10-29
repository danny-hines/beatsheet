---
name: make
description: Make stills and clips in beatsheet with generate, and keep them consistent with cast and sets. Use whenever you make pictures or video (generate, list_models, jobs), write a prompt for an image or video model, make a cast member's sheet, plan what a pass of boards, roughs or finals will cost, or pick between takes.
---

# Making stills and clips

`generate` makes pictures and video with the person's services (fal, and stills with OpenAI or Meta keys), as takes for shots or as sheets for cast members. Everything it makes lands in the project with where it came from: the model, the prompt the model read, the seed, the cost. The `film` recipe is the whole process for a video made from nothing; this is the craft for each request.

## The tools

- `list_models`: which models could make a request (for a shot, several shots, or a sheet), what each would cost and take, and why the others can't (too long, the wrong shape, no start frame, no key). With `shots`, what a whole pass would cost with each model.
- `generate`: starts the takes and returns at once. Takes for a placeholder or generated shot (or `shots`) land on it: the first take is the one it shows, then the first clip over a still, then the first final over a rough. A `sheet` adds stills to a cast member's pictures.
- `jobs`: where they've got to, with `wait` to hold until they're in (stills take seconds, clips minutes). A take that failed says why.
- `get_project` lists the cast and sets; `edit_project` changes them (`/cast`) and picks a shot's take (`/shots/id=alley/content/take`).

## Cheap before expensive

A still costs about 4¢, a rough five-second clip about 35¢, a final about 56¢. So:

1. **Boards:** stills for every shot (`op: "image"`, 2 takes each). Settle the story, the cast's look, the framing and the light here.
2. **Roughs:** clips from each shot's chosen board (`op: "video"`, `start: "board"`, 1–2 takes). Judge the motion and the cut.
3. **Finals:** once the cut holds, the shots that stay made again with the best model (`quality: "final"`, `start: "board"`, 1 take).

A clip that starts from a board keeps everything the board settled, so never skip to video without one.

## Models

- Leave the model to Auto unless there's a reason; it picks the first ready model of the quality asked for. `list_models` says what each is good for.
- Keep to one model per pass: mixing models across shots changes how they look. Name it with `model` once you've picked.
- Stills: Nano Banana (fal). With the person's own keys, also Muse Image (Meta, 1¢ a still, good for many boards) and GPT Image (OpenAI, about 2¢; follows long, exact prompts and draws legible text like a sign or a note). Roughs: Kling 2.5 Turbo (or Wan 2.2, cheaper, any length up to 10s). Finals: Kling 3 Pro, from a board only.
- Boards and sheets from different still models look different (grain, color, how faces are drawn). Make a cast member's sheet and the boards with one model, then keep it.
- A shot longer than any model makes is refused with the reason: split it into two shots.

## Writing a prompt for a still

One moment, described as a camera would see it:

- **Who and what's happening:** the cast by @id, and one action. "@cat squeezes through @cat-flap".
- **Where:** the set by @id, or a few concrete details.
- **Framing:** shot size and angle ("low angle, close", "wide, from across the street", "over the shoulder").
- **Light and time:** "dawn, warm low sun through the window", "sodium streetlight, wet pavement".
- **The look:** the project's style, by @id if there's a style entry, else in a few words ("35mm film, shallow depth of field").

Specific nouns beat adjectives. Say what's in the frame, not what it means in the story. No words or signs to read in the picture unless the shot is about them. Write the shot's description so it also works for the clip: the moment, then what moves ("…; it trots off down the path, camera holding low").

## Writing a prompt for a clip

The board already says what's in the frame, so say what changes:

- one main action, sized to the length (a five-second clip is one gesture, one move across the frame);
- the camera: static, slow push in, pan with them, handheld follow;
- the pace: "slowly", "in one quick dash".

Don't cut to another scene or bring in new people mid-clip; that's another shot.

## Cast and sets

What keeps the cat the same cat from shot to shot.

- **One entry per recurring character, place, prop or style** (`/cast`): a short lowercase `id` (what prompts call it), a `name`, its `kind`, and `about`: visual specifics only, 10–25 words ("woman in her forties, short curly gray hair, round tortoiseshell glasses, mustard cardigan"; for a pet, "orange tabby, white chest and paws, a notch in the left ear"). Look at the person's photos (`look_at_assets`) to write it. `seen` lists the photos it's in.
- **From the footage:** someone in the person's own clips or photos (family, a pet, a friend who agreed) goes in with `find_subjects`, then `cast_from_subject`, which cuts a still of them from the clearest frame. Name the subject first if you know who it is.
- **Pictures:** `generate` with `sheet: "cat"` makes clean reference views, from its photos when it has some, else from `about`. Look at them; keep the good ones in `images`, best first (the first is the one models get). Places get a wide view or two; styles, one still that shows the look.
- **Style:** a style entry in `/cast` (kind `style`, with `about`: "hand-drawn 2D animation, clean ink lines, flat colors") made the project's with `/look/style`. Sheets and boards are drawn in it without saying so in each prompt; without one, they're photographs. A cast member drawn unlike the rest (a cartoon cat in a photographed street) gets its own `style`. Set the style before making sheets: boards follow their sheets, so a sheet in the wrong style makes the cast look pasted into the world.
- **Variants** for another outfit, state or time of day: `{ id: "heist", about: "wearing a tiny black eye mask" }`, named @cat/heist. A variant can have its own sheet (`sheet: "cat/heist"`).
- **In every prompt it's in,** by @id. The model reads the name and description, and stills are given the pictures: up to four, characters first, then props, places and the style; the rest are described in words only.
- **Close shots leave the place's @ out.** A place's picture is a wide view, and the model copies its framing: a "close-up at the fish market" with @market comes back as a wide shot of the market with the cat small in it. Say where in a few words instead ("at a fish market stall, on crushed ice").
- **Real people** only when they've agreed: the person, and family they've sent photos of for this. Someone who has died: their family decides. Some models won't take pictures of real people; `list_models` says so.
- Famous films' names and characters are often refused: describe the look instead ("a hooded knight with a glowing blue blade").

## Takes

- Boards: 2 takes a shot. Look at both (`look_at_assets`), pick the better (`/shots/id=…/content/take`), and say why in a word if it isn't obvious.
- A board that's wrong (off-model cast, the wrong framing, a continuity slip like the wrong time of day) gets a sharper prompt and another try. After two tries that miss the same way, change the approach (split the shot, simplify the action) or ask the person.
- Roughs: 1–2 takes. Watch them in the cut (`review_cut`, `frame`), not alone.
- Finals: 1 take, from the board the rough came from.

## Money

- The person sets how much a turn may spend without asking (a few dollars); `generate` refuses past it and says so.
- Before a pass over many shots, estimate it: `list_models` with `shots`. If it's over what's left, ask first: a `choose` hand-off whose options say what they'd cost ("Rough clips for all 16 shots · about $5.60", "Just the 6 key shots · about $2.10").
- A pass over several shots starts all or nothing, so nothing is half made.
- When fal refuses something (its safety checker), rephrase what's in the shot; don't try to get around it.
