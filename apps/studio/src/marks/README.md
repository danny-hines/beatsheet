# Service marks

The logos in this folder belong to the companies they stand for. They are not covered by beatsheet's license and are
shown only to say which service a row in Settings connects to, beside that service's name.

- One file per service, named for its id in the engine (`fal.png` for `fal`). Plans, CLIs and hosted models that go by
  another's mark are listed in `SAME_AS` in `../marks.ts`.
- `<id>.svg` and `<id>.png` are shown exactly as their owner made them. `<id>.mask.svg` is a one-colour shape, drawn in
  the text colour (a CSS mask). Every file is byte for byte what its owner serves: don't edit, recolour or redraw one.
- A file that carries its owner's clear space inside it (OpenAI's Blossom is the middle half of its file, ElevenLabs'
  bars a third of theirs) is drawn
  larger, by `LARGER` in `../marks.ts`, so the mark itself matches the others. That's a size on screen, not an edit.
- A service with no file here gets a tile with its initial (nothing at all on the agent cards). Leave it that way when
  the owner's terms ask for permission first, or when nobody has read them.
- Marks are for services and agents a person connects, not for the makers of models that run on someone else's service.

## Where each came from

All fetched 2026-11-21.

| File | What it is | Source | Terms |
| --- | --- | --- | --- |
| `comfyui.svg` | ComfyUI's logomark | `https://www.comfy.org/icons/logomark.svg`, as shown on comfy.org/brand | comfy.org/brand: integrations may reference it; use as provided, don't recolour or modify, don't imply endorsement |
| `elevenlabs.mask.svg` | ElevenLabs' "11" symbol | "ElevenLabs Symbol (SVG)" on elevenlabs.io/brand | elevenlabs.io/brand: guidelines for third parties; keep clear space around it (the file carries its own) |
| `openai.svg` | OpenAI's Blossom, the white one | `OAI_OpenAI-Blossom_White.svg` in `https://cdn.openai.com/brand/openai-logos.zip`, linked from openai.com/brand | openai.com/brand, accepted 2026-11-21: using it means agreeing to OpenAI's Marks terms; only where it directly relates to OpenAI services (the key, the ChatGPT plan, Codex, Whisper on OpenAI), exactly as provided, never more prominent than beatsheet's own, acknowledged as OpenAI's |
| `gemini.png` | Gemini's icon, 512px | the `rel="icon"` on gemini.google.com (gstatic.com) | about.google/brand-resource-center/guidance/apis, accepted 2026-11-21: a product icon is allowed in a list of compatible products, beside its name, Google's own artwork unchanged, not looking as if it comes from Google, with a trademark line in the product |
| `antigravity.svg` | Antigravity's site icon | `https://antigravity.google/favicon.svg` | Google's, as for `gemini.png` |
| `fal.png` | fal's site icon, 512px | the `rel="icon"` on fal.ai | none published that we found |
| `higgsfield.png` | Higgsfield's site icon, 192px | `https://higgsfield.ai/icon.png` | none published that we found |
| `replicate.mask.svg` | Replicate's pinned-tab icon, made to be tinted | the `mask-icon` on replicate.com | none published that we found |
| `tein.svg` | Tein's site icon (it turns light on a dark page by itself) | `https://tein.ai/favicon.svg` | none published that we found |

The trademark line Google and OpenAI ask for is `MarksNote` in `../components/ui.tsx`, shown at the foot of the
Settings panes their marks appear on. Keep it while their files are here.

## Not here, and why

Read 2026-11-21. Each needs a decision or a request from whoever publishes beatsheet before its mark goes in.

| Service (rows it would show on) | What its owner says |
| --- | --- |
| Anthropic (Claude Code) | anthropic.com/legal/trademark-guidelines and Claude Code's legal page: saying in plain text that a product runs Claude Code is fine; any use of the logo needs written permission |
| Meta (Meta, Muse Code plan, Muse Code) | meta.com/brand/resources/meta/company-brand: "All usage of the Meta logo requires approval", through a Meta contact's Brand Review request. The same page lets you refer to Meta's trademarks by name where that's needed to describe a product's relationship to a Meta one ("Built with Llama"), and says that is not a trademark license. So the name in text is fine and the logo isn't, yet |
| Runway | runway.com/brand-guidelines: the symbol may stand in for the wordmark in small spaces, but the logo is never under 24px tall; the mark here is 16px |
