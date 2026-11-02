# Prompting each model

How each model wants its prompt, beyond what SKILL.md says for every clip. From each maker's guide where there is one, fal's model pages, and tested community guides; the evidence and sources are in `docs/MODELS.md`. Read the section for the model you're about to use.

## For every video model

- From a board, say what moves, not what the board shows: restating the picture gives a near-static clip or a face that drifts. (MiniMax H3 is the exception, below.)
- One camera move, with a pace word ("slow push in", "quick whip pan"). When it shouldn't move, say "locked-off camera"; with no direction, most models drift. Orbits of 90–180° in a short clip, never 360°; two stacked moves lose the second.
- About one beat per two seconds. Too much action for the length gets rushed, dropped or cut into shots of its own.
- Dialogue: quotation marks around the spoken words and nowhere else (a word quoted for emphasis gets said aloud), a speaker and a tone before each line, at most about 2.5 words a second. A line that's too long for the clip comes out fast or slips out of sync.
- Sound: the cut's music, voice and sfx are the real soundtrack, so ask for what's heard in the shot and no score: "Sound: rain on the awning, distant traffic; no music." Say what's there rather than only what isn't.
- Real lettering doesn't survive a video model. Put it in a coded overlay, or on the board and animate gently.
- A model that refuses a shot: rephrase what's in it (see SKILL.md). Don't hide faces, rename things or reach for a looser service to get past it.

## In the catalog

**Kling 2.5 Turbo and Kling 3 Pro (fal).** Two to five short sentences: who moves, how, the camera, the atmosphere. From a board, motion and camera only, and always name a move, or Kling holds mostly static. Clips of 3–6 seconds hold together better than long ones. Neither makes sound here (Kling 3 is sent with its own sound off), so leave dialogue and sound out.

**Wan 2.2 (fal at 720p, or the 14B and 5B on the person's card).** 80–120 words in the order the camera sees things: shot size and angle, the subject, the action, the background. One shot size and one move, about 5 seconds' worth. Describing the foreground moving against the background gives parallax. No sound.

**MiniMax H3, H3 Max and H3 Max Turbo (fal).** Start from the board: a sentence on its style, who's in it and where, then what happens next, in order. Keep who they are, what they wear and where things stand as the board has them. Write camera moves as part of the action ("she turns as the camera eases in"), not tacked on at the end. It makes its own sound, so write the sound in: the place's sound in a sentence or two, and "no music" or a description of the music you do want. For dialogue, describe each voice the first time it speaks ("a young woman, quiet and breathy, says: …"); for voiceover, say it's off-screen and her lips stay closed. fal rewrites the prompt into H3's own structure by default, so plain sentences work. With references (`refs`, no board), beatsheet adds a line saying the pictures are references for who and what is in the shot; refer to them as "Image 1", "Image 2" in the order given, each with a job ("the woman in Image 1 walks her dog from Image 2"), and say which wins if two disagree. H3 isn't strong at big action or steady faces; for a fight or a close-up, see `docs/MODELS.md`.

**MiniMax H3 on the person's card (ComfyUI).** Nothing rewrites the prompt here, and MiniMax's [prompt guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) wants its own structure: three labelled fields, `integrated_multimodal_description:` (`[Shot 1]` first, later shots with a cut time like `[Shot 2] At 00:03.500, …`), `overall_soundscape:` and `non_diegetic_music:` (`N/A` for none), with dialogue as `(S1) says: <d>[English] the words</d>`. From a board, the guide puts an instruction line first that names the board `<Picture 1>` as the frame at 0.00 seconds. Its license doesn't cover the US, EU, UK or South Korea (`docs/MODELS.md`).

**SCAIL-2 and Wan 2.2 Animate.** See Copying movement in SKILL.md: long and specific, who each person is and wears, the place, the light, and "static camera" when the clip's camera holds.

**GPT Image (stills).** Order the prompt: the background or place, the subject, the details, then the constraints. Say what it's for ("a storyboard frame for a 9:16 video"). Label the pictures it's given ("Image 1: Mia's face") and, when editing, repeat what must stay the same. Medium quality for boards; high for lettering, faces and real people.

**Nano Banana (stills).** Full sentences, as if briefing an artist. To keep someone, name the picture to keep them from. When a board is nearly right, edit it rather than make it again, but go back to the original sheet each time rather than chaining edits of edits: every still model drifts as it's edited again and again.

**Character sheets, for every still model** (two tips from creators, not yet tested here): a mid-gray background, because white blows out when the sheet is used as a reference; and the face once, with the full-body view kept clear, so the video model isn't handed several faces to choose from.

## Not in the catalog yet

For when they're added (`docs/MODELS.md` says why each is worth it).

**Seedance 2.5.** The first 20–30 words carry the most weight: open with the subject and the core action. Give every file a job in upload order: "@Image1 is the first frame; @Image2 is Mia's face and wardrobe; @Video1 is the camera move." Quote every spoken line with a speaker label and a tone; dialogue written as plain prose comes back as burned-in subtitles. State the camera distance for small subjects, and the contact points and what follows (the leaves scatter, the mug tips). Iterate as drafts at 480p and complete the chosen one by its `draft_id`: a downloaded draft uploaded again is a new, different take. Refuses real people.

**Wan 3.0.** Turn `enable_prompt_expansion` off for a written prompt, and set `resolution` (it defaults to 1080p). Say "one continuous shot": a four-word prompt came back as five cuts in five seconds. Name a shot size with the move ("medium close-up, slight low angle, slow push in"). References by position ("the woman in Image 1"). Lines in quotes with emotion, tone and pace, about two short sentences per 5 seconds. Say what you want to hear, or it picks its own soundtrack; its mix runs loud.

**Kling 4.0.** As Kling 3, with timed shots in `multi_prompt` and up to 8 keyframes between the start and end frames, describing the path between them. No seed, so budget an extra take.

**Gemini Omni Flash.** The camera first, then subject, action, setting and light. `<FIRST_FRAME>`, `<LAST_FRAME>`, `<IMAGE_REF_0>` (counting from 0), each said to be a frame or a reference. `[0-3s]` timecodes place beats on the music. Never a real person.

**LTX-2.5.** One paragraph in the present tense, starting with the action, 4–8 sentences, under 200 words. Light as a source with a direction. From a board, only the change, ending on how things finish. No shot lists, no "Camera:" labels, no negatives.
