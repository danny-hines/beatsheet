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
- `still_from_clip`: a clip's last frame (or a moment in it) as a still, to start the next clip from.

## Cheap before expensive

With Auto's picks, a still costs about 4¢, a rough five-second clip about 20¢, a final about 80¢ (`list_models` prices the rest). So:

1. **Boards:** stills for every shot (`op: "image"`, 2 takes each). Settle the story, the cast's look, the framing and the light here.
2. **Roughs:** clips from each shot's chosen board (`op: "video"`, `start: "board"`, 1–2 takes). Judge the motion and the cut.
3. **Finals:** once the cut holds, the shots that stay made again with the best model (`quality: "final"`, `start: "board"`, 1 take).

A clip that starts from a board keeps everything the board settled, so never skip to video without one.

Waste comes from making things before they're settled, more than from what a model costs. On a 13-minute remake, all 305 boards made before the portraits were picked went unused, and so did 35 of 77 clips. So:

- **Settle before a pass.** No pass over many shots until every character in them has a chosen portrait and the person has approved a sample of boards.
- **Fix it on the board.** A board costs a few cents or nothing; a clip costs 20¢ to $2. A note about framing, staging, the set or who's there gets settled on the board, with the person, before its clip is made again. After rounds of notes on free boards, three of four clips held on the first try, where the earlier clips for those shots had all been rejected.
- **Agree the staging of a dear take.** Before a take over about $1 (a long take, or Kling 4.0 past about 6 seconds), tell the person what happens in it, in order, and show a board of the hard moment when there is one. One 15-second shot took three Kling takes and $6.59 over which side the doors shut from and how they're barred, which a sentence could have settled first.

## Models

- Leave the model to Auto unless there's a reason; it picks the first ready model of the quality asked for. `list_models` says what each is good for.
- Keep to one model per pass: mixing models across shots changes how they look. Name it with `model` once you've picked.
- Stills: Nano Banana 2.1 (fal or a Gemini key, about 4¢, Auto's pick). Also Muse Image (a Meta key, 1¢ a still, good for many boards) and GPT Image (an OpenAI key or fal, about 3¢; first in blind votes, follows long, exact prompts, keeps a real person's face from their photos, and draws legible text like a sign or a note). The first Nano Banana stays until Google retires it in March 2027. GPT Image also runs on the person's ChatGPT plan through Codex, and Muse Image on a Muse Code plan where Meta has turned its image tool on: no charge, from the plan's allowance, about half a minute each on their own, but a big pass queues (on the ChatGPT plan, half of a remake's stills took over a minute and a half, and one in ten over ten minutes). list_models says where each model runs (`via`); generate uses the plan unless you pass the key's `via`. A plan's allowance runs out, so for a big pass of boards a cheap key (Muse Image, 1¢) can be kinder.
- **Fights and blood in stills:** GPT Image refuses them for people drawn from real photos, on the plan and on a key alike. On the plan a refusal can take many minutes, and can come back as a failed job that says only "done". So take those shots out of a GPT Image pass before it starts: Nano Banana 2.1 draws stage blood and keeps a photographic look but ages young faces; FLUX 3 Image Klein is free on the person's card but flatter; or draw the fighters apart with GPT Image and copy the clash (see Copying movement below). One refusal says the same about every shot like it.
- Video, by kind of shot (`docs/MODELS.md` has the evidence, and says where it's thin). Prices are for five seconds.
  - **Auto:** H3 Max Turbo for roughs (about 20¢) and H3 Max for finals (1080p, about 80¢), fal's tunings of MiniMax H3: the best value in blind votes, but not strong at big action or steady close-up faces.
  - **Wan 3.0** (480p rough about 25¢, 1080p final about $1): first in blind votes from a prompt, takes real people, 2 to 30 seconds in one take.
  - **Kling 4.0** (720p rough about 79¢, 1080p final about $1.18): camera moves (the only one that orbited on request) and long takes that keep to their beats, 3 to 30 seconds.
  - **Seedance 2.5** (480p rough about $1.10, 1080p final about $5.80): first from a board, and for dialogue, bodies in motion, contact and weight. The dearest by far; save it for the shots that need it.
  - **Gemini Omni Flash** (360p rough about 15¢, 1080p final about 75¢): sound from a prompt, 3 to 10 seconds, wide or tall only.
  - **From a first long film** (one project; `docs/MODELS.md` has the numbers): Wan 3.0 for a simple shot with one person. Kling 4.0 when faces or a held prop must stay steady, or the camera move matters: on the five shots where both ran it was kept on three, at three times the price a second, and a take runs about five minutes, sometimes fifteen. H3 Max Turbo comes back in about 12 seconds, so it's a cheap look at how a board moves.
  - Older and ranked below these: MiniMax H3 itself (5–15s, about 30¢), Kling 3 Pro, Kling 2.5 Turbo, Wan 2.2.
  - A model with no tier (Wan 3.0, Kling 4.0, Seedance 2.5, Gemini Omni Flash) makes roughs and finals both: `quality` picks the size and the price.
  - **Sound:** all of these but Kling 3 Pro, Kling 2.5 Turbo and Wan 2.2 make their own, so write what's heard into the prompt ("Sound: …") and leave the score to the cut.
  - **References with no board** (`refs`): MiniMax H3 (9 pictures), Wan 3.0 (10), Seedance 2.5 (30).
  - **Real people:** Seedance 2.5 and Gemini Omni Flash won't draw them, so a shot with a character made from the person's own photos doesn't offer them, and `list_models` says why.
  - **Commercial use:** `list_models` says when what a model makes somewhere isn't free to use commercially under its license ("not for commercial use", "limited", "unclear", with why): MiniMax H3 and FLUX 3 Image Klein on the person's own card, LongCat Avatar on fal. Making for fun or to learn, use them as any other. When the brief says the video is commercial (a client, an ad, a channel that earns), pick models without the label, and say so when that costs more.
  - **Copying the movement in another clip:** SCAIL-2 or Wan 2.2 Animate on the person's own hardware through ComfyUI, or Kling Motion Control on fal without one (see Copying movement below).
  - **Lip sync** (a board made to say the cut's voiced line, or the mouths in a take changed to): see Lip sync below.
- **On the person's own hardware** (ComfyUI, connected in Settings → Making): Wan 2.2 from a board, up to 5 seconds, at no charge (`via: "comfy"`; the same model on fal makes up to 10), and quick on a big card (a 3-second rough in under a minute on a 4090), so it's a good rough pass to rank first when it's there; Wan 2.2 5B, the small one, softer (a staff can smear), and the only one a Mac can run itself; MiniMax H3 from a board (and an end frame), 5 to 15 seconds with its own sound, on a 24 GB NVIDIA card; FLUX 3 Image Klein for stills (boards and sheets from up to 10 references, seconds each); the two that copy movement; and InfiniteTalk, which makes a board say a line. Free, private, and nothing softens what's in the shot, but slow, one at a time. `list_models` says for each whether this machine (or the connected one) can run it and why not: an NVIDIA card is needed for the fp8 models, a laptop with no graphics card can't run any of them and should connect the ComfyUI on a computer that can, and a ComfyUI missing model files says so (Settings → Making fetches them). Don't route around it: say what's needed in a `provide` hand-off.
- Boards and sheets from different still models look different (grain, color, how faces are drawn). Make a character's first sheets with two or three still models at once (`generate` with `models`, one or two takes each), look at them side by side, keep the best as the main picture, take the others out of `images`, and make the boards with the model whose sheet won.
- A shot longer than any model makes is refused with the reason: split it into two shots.

## Writing a prompt for a still

One moment, described as a camera would see it:

- **Who and what's happening:** the cast by @id, and one action. "@cat squeezes through @cat-flap".
- **Where:** the set by @id, or a few concrete details.
- **Framing:** shot size and angle ("low angle, close", "wide, from across the street", "over the shoulder").
- **Light and time:** "dawn, warm low sun through the window", "sodium streetlight, wet pavement".
- **The look:** the project's style, by @id if there's a style entry, else in a few words ("35mm film, shallow depth of field").

Specific nouns beat adjectives. Say what's in the frame, not what it means in the story. No words or signs to read in the picture unless the shot is about them. Write the shot's description so it also works for the clip: the moment, then what moves ("…; it trots off down the path, camera holding low").

**A board a clip will start from is that clip's first frame.** Draw the moment before the action, not its peak: the fist still back, both hands holding the book, the sheet still over the clock. A board of the peak gives a clip that starts halfway through. When the shot's payoff is one particular frame (a pose that has to match the original, a reveal), make that frame first, let the person pick it, then make the start frame and run the clip between them (`start` and `end`). A board that stays a still can be the peak.

## Writing a prompt for a clip

The board already says what's in the frame, so say what changes:

- one main action, sized to the length (a five-second clip is one gesture, one move across the frame);
- the camera: static, slow push in, pan with them, handheld follow;
- the pace: "slowly", "in one quick dash".

Don't cut to another scene or bring in new people mid-clip; that's another shot.

**Everyone in a clip has to be in a picture it's given.** Clips get no cast pictures, only their start and end frames, so anyone in neither is invented: a stranger, often a small one. Before you send it, check which frame has each face. When someone has to arrive during the clip, put them in an end frame drawn from their portrait. A clip only holds a face as far as its frames show it, so keep head turns small and faces large.

Each model has its own way with a prompt (what to describe from the board, how it takes sound and dialogue, how to name reference pictures): read its section in [models.md](models.md) before writing for it. Which model suits which kind of shot, and why, is in `docs/MODELS.md`.

**Carrying a clip on.** A clip that ends mid-action continues in the next shot from its last frame: `still_from_clip` on it, then `generate` (op `video`) with `start` set to that still, and a prompt for what happens next. The cut between them lands on the same frame, so it reads as one continuous move.

## Copying movement from a clip

When the action is hard to describe or a service won't draw it (a fight, two people grappling, a dance, a stunt), copy it instead: the people in a shot's board move the way the people in a stretch of a clip move. The clip can be the original footage (a remake of an old film) or the person and friends acting the shot out on a phone and bringing it in. It runs in ComfyUI on the person's own NVIDIA card, at no charge; `list_models` says when it can't run here and why. Without the card, Kling Motion Control on fal does it: about 17¢ a second, up to 30 seconds, framed as the clip is.

- **Which one.** SCAIL-2 (Auto's pick) tells people apart, so it's the one for two or more people, contact, and props in hands; up to about 7.7 seconds. Wan 2.2 Animate follows one person's skeleton and face, so it suits a solo move or a close-up where the expression matters, and it's quicker (a 3-second rough took 4 minutes on a 4090, SCAIL-2's 13); up to about 9.7 seconds. A prop the board doesn't show may ghost, as it only sees the person's pose. Name it with `model: "wan-2.2-animate"`.
- `generate` with op `video`, `start: "board"` and `drive: { asset, from, to }`: the clip and the stretch of it, in seconds. Without `to`, the shot's length after `from`. Split a longer action into shots. The take is the stretch plus half a second either side where the clip has it, and the shot starts where the stretch does.
- The board is who and where; the clip is only how they move. Make the board with the same number of people, framed and placed as in the clip's first frame, left to right in the same order: SCAIL-2 matches people by position. A board where two people stand apart (which still models will draw) turns into the fight when the clip has them clash. Someone in the board who isn't in the clip fades away with SCAIL-2, and stands still with Wan 2.2 Animate (a staff swing from a one-person clip, with a masked figure watching, kept the figure).
- Write the prompt long and specific, as SCAIL-2 was trained on: who each person is and wears, the place, the light, the action, and "static camera" when the clip's camera holds still.
- The shot keeps what it followed, so a final (`quality: "final"`, the full workflow) follows the same stretch without saying it again. `drive: null` makes an ordinary clip instead.
- Look at the rough beside the clip it followed (`frame` on both at the same moment): hands, props and anyone who leaves the frame are where it slips. A prop the board doesn't hold won't appear.

## Lip sync

A character who says a line on screen, saying the cut's own line: the narration you voiced (`narrate`), in step with when it's heard. Two ways, by what the shot has:

- **Make the board talk** (`generate` op `video`, `start: "board"`, `speech: {}`): a new clip of the board saying it, the head and shoulders moving with the words. For dialogue shots that have only a board, or whose rough has the wrong mouth.
- **Change the mouths in the clip** (`speech: {}`, `clip: "take"`): the take the shot shows, as it moves, with the mouth redrawn. For a rough that's right apart from the mouth, and for a take that copied movement from footage (the remake's faces changed, so the old mouths don't fit). The new take replaces the one it was made from, and keeps its board and the movement it followed.

What it says: `speech: {}` is the lines heard while the shot plays, the ones its characters speak (a line's `speaker`), else all of them; `speech: { lines: [...] }` names them; `speech: { asset, from, to }` takes a file's sound instead (the original footage, cleaned when it has been). Lines must be voiced first. The take covers the shot with half a second either side, longer when a model makes no less (some make 5 seconds at least), and the shot starts in it where the line lines up; it comes in silent, as the cut's voice already plays the line. The shot keeps what it said, so another take says it again; `speech: null` for an ordinary clip.

- **Which model** (`docs/MODELS.md` has the evidence; there's no blind comparison yet, so take the person's picks as the evidence). Making a board talk: H3 Max Lip Sync (Auto; 480p roughs about 5¢ a second, 1080p finals 16¢, 5 seconds at least, up to 15 minutes), or Kling Avatar 2 Pro, OmniHuman 2, VEED Fabric 1.0, LongCat Avatar (in steps of about 5 seconds) and sync-3 on fal, or InfiniteTalk on the person's own NVIDIA card through ComfyUI at no charge (480p, up to 14.7 seconds; on fal 20¢ a second, up to 28.8). Changing the mouths in a clip: Kling Lip Sync for a rough (about 1¢ a second, 2 to 10 seconds), LatentSync for a longer rough (20¢ a take up to 40 seconds; it repaints only the mouth, so the clip stays sharp), sync-3 for a final (about 13¢ a second; the vendors' pick, handles profiles and hands in front of the mouth), Lipsync 2 Pro between. `list_models` with `speech` (and `clip`) says what each would cost and why the others can't.
- Write the prompt as for any clip from its board, and say how they speak ("talks quietly, looking just off camera"), not the words: the words come from the sound (models.md says which models read the prompt at all).
- One person speaking per take. Two people talking in one shot: lip-sync one, or split the shot.
- Watch it in the cut (`review_cut`) with the voice playing; a mouth that's late or early by a few frames is the lining up, not the model.

## Cast and sets

What keeps the cat the same cat from shot to shot.

- **One entry per recurring character, place, prop or style** (`/cast`): a short lowercase `id` (what prompts call it), a `name`, its `kind`, and `about`: visual specifics only, 10–25 words ("woman in her forties, short curly gray hair, round tortoiseshell glasses, mustard cardigan"; for a pet, "orange tabby, white chest and paws, a notch in the left ear"). Look at the person's photos (`look_at_assets`) to write it. `seen` lists the photos it's in.
- **From the footage:** someone in the person's own clips or photos (family, a pet, a friend who agreed) goes in with `find_subjects`, then `cast_from_subject`, which cuts a still of them from the clearest frame. Name the subject first if you know who it is.
- **Their voice:** `transcribe` the clips they talk in (with `speakers`), `name_speaker` the one that's them (the same cast id as their face), and they're named in the other clips too. In a clip with both faces found and a transcript, faces and voices join by themselves: naming one names the other. `transcript` with `who` then lists what they actually said, to build a scene around their own words rather than words put in their mouth.
- **Finding the cast in the Library** (the person asks, or presses Find in my photos): `list_assets`, then `look_at_assets` in batches of a dozen or so until you've seen every photo and clip that isn't made. Group what recurs: the same person, pet, place or thing in three or more pictures (two if it's clearly someone who matters, like the person themselves). Skip one-offs, crowds and strangers. For each group: an id and a name (the person's words for them if the brief or labels say; "the tabby" if not), its kind, `about` from the pictures, and its assets, the clearest first. Anyone already in the cast keeps their id, so their new pictures join them. Then `hand_off` kind `cast` with the groups as `proposals`, most pictures first, up to 12; the message says how many pictures you went through. The ones they keep are in the cast when their answer arrives: then write `about` where it's thin and offer sheets for the characters (`list_models` for what that costs).
- **A character's pictures, in four steps** (Inspect shows them for each look). `about` is who they are (face, hair, build), the same in every look; `wears` is what they wear in the plain look. 1. **Face** (`faces`): the photos the face comes from; by default their own photos (`seen`), and for a look the plain one's chosen portrait. 2. **Wardrobe**: the words (`wears`, or a look's `about`) and `wardrobe` pictures: a costume photo, or `wardrobe_from_photo` to cut what they wear in one of their photos below the face. 3. **Portrait**: `generate` with `sheet: "cat"` and `portrait: true`, from two or three models. The first becomes `portrait`, the rest go to `portraits`; show them to the person with a `choose` hand-off (they judge likeness) and set `portrait` to the pick. 4. **Sheet**: `generate` with `sheet: "cat"`, made from the chosen portrait and the wardrobe: the face once, close up, then the body from the front (cropped at the neck) and the back. The first becomes `sheet`, the rest `sheets`; choose the same way. Models are given the chosen sheet, else the chosen portrait: one picture, one face. A real person's own photos are only what portraits are made from: they're often old and small, differ in hair from photo to photo, and can't show a costume. Places, props and styles keep `images` (given in order, up to three) and `kept`: places get a wide view or two, styles one still that shows the look.
- **Style:** a style entry in `/cast` (kind `style`, with `about`: "hand-drawn 2D animation, clean ink lines, flat colors") made the project's with `/look/style`. Sheets and boards are drawn in it without saying so in each prompt; without one, they're photographs. A cast member drawn unlike the rest (a cartoon cat in a photographed street) gets its own `style`. Set the style before making sheets: boards follow their sheets, so a sheet in the wrong style makes the cast look pasted into the world.
- **Looks** (`variants`) for another outfit, state or time of day: `{ id: "heist", about: "wearing a tiny black eye mask" }`, named @cat/heist. Each look has its own steps, and models get its own chosen picture, never mixed with the plain one's, or the plain one's while it has none. A look that only adds something (blood, rain, a scarf) needs no portrait: its sheet is made from the plain look's chosen portrait, with what's different in every view. A look that changes the face (a fake beard, a hat, a wig) gets portraits of its own first. Make a look only for someone seen more than one way in the film; a character only ever seen in costume is described in costume in the plain one (Inspect's Merge into Plain folds a look in, and every shot that names it follows).
- **In every prompt it's in,** by @id. The model reads the name and description, and stills are given each one's main picture, then up to two more each while there's room: characters first, then props, places and the style. Nano Banana takes four (two people get two each), GPT Image and Muse Image ten; whoever is left out is described in words only. Clips get no cast pictures: the board they start from carries the cast.
- **Close shots leave the place's @ out.** A place's picture is a wide view, and the model copies its framing: a "close-up at the fish market" with @market comes back as a wide shot of the market with the cat small in it. Say where in a few words instead ("at a fish market stall, on crushed ice").
- **A pose reference costs likeness.** A frame from old footage given first pulls the face away from the portrait. Put the chosen portrait first, say the pose in words, and turn the face three-quarters to the camera, large enough to read. To match a pose exactly (a cut back to the original), give the frame and a copy with its parts labeled, and check the labels with the person: old footage misleads (a blurred bat read as a tree trunk).
- **Real people** only when they've agreed: the person, and family they've sent photos of for this. Someone who has died: their family decides. Some models won't take pictures of real people; `list_models` says so.
- Famous films' names and characters are often refused: describe the look instead ("a hooded knight with a glowing blue blade").

## Takes

- Boards: 2 takes a shot (1 for a first pass over a long film, as many get redrawn when their scene's clips are made). Look at both (`look_at_assets`), pick the better (`/shots/id=…/content/take`), and say why in a word if it isn't obvious.
- A board that's wrong (off-model cast, the wrong framing, a continuity slip like the wrong time of day) gets a sharper prompt and another try. After two tries that miss the same way, change the approach (split the shot, simplify the action) or ask the person.
- **A board that's nearly right gets edited, not drawn again.** Redrawing rolls everything, and the part that was right goes with it. `generate` with the take first in `refs` and a prompt that starts "Edit this picture" and says what changes and what stays exactly as it is. To fix a face, keep the scene and change only the face, with the chosen portrait as the second ref. For the next shot in the same place, start from its neighbor's frame (edit it, or crop it first) so the set stays the same set: a railing drawn twice comes out as two railings. Go back to the first picture each time rather than chaining edits ([models.md](models.md)).
- Roughs: 1–2 takes. Before you hand one off, `frame` its start, middle and end: each face against the portrait, who's in frame and how big, hands, props that bend or open, and that it starts where the action should. Then watch it in the cut (`review_cut`), not alone.
- A clip that misses gets a better board or prompt, not the same request again: it's far more often those than luck. After two that miss the same way, change the frame, the model or the shot.
- Finals: 1 take, from the board the rough came from.

## Money

- The person sets how much a turn may spend without asking (a few dollars); `generate` refuses past it and says so.
- Before a pass over many shots, estimate it: `list_models` with `shots`. If it's over what's left, ask first: a `choose` hand-off whose options say what they'd cost ("Rough clips for all 16 shots · about $5.60", "Just the 6 key shots · about $2.10").
- A pass over several shots starts all or nothing, so nothing is half made.
- A final isn't an upscale: it renders the shot again, so motion the person approved can change, and a pass costs far more than the roughs did (on a 13-minute cut, $190–220 for one take of each shot). Price it early, make finals only where the difference shows, and ask first. A shot under a heavy look (an old-film treatment, black and white, strong grain) may not need one: show the person the rough in the cut and let them say.
- When a service refuses something, rephrase what's in the shot, or move that kind of shot to a model whose rules allow it. Don't disguise it to get it past the same filter.
- What runs on the person's own hardware costs nothing, but takes minutes a take and the card does one at a time (a 3-second SCAIL-2 rough took 13 minutes on an RTX 4090); a final (the full workflow) takes much longer. Say roughly how long a pass will take rather than what it costs, and ask before a pass of finals.
