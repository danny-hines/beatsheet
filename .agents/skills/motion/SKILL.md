---
name: motion
description: Design and build scenes in beatsheet, the shots that aren't footage. Kinetic type, title cards, stats that count up, before/after splits, photo walls, a phone showing the real site, labelled callouts, an exploded 3D model of the product from its own CAD files. Use when a cut needs designed shots, when writing a scene with write_scene, or when using the kit (kit:Title, kit:Callouts…).
---

# Designing scenes

Footage proves something is real; designed scenes explain it and make it memorable. The ones that make people stop are unmistakably *this* project's: its brand, its product's real parts and numbers, one visual idea that comes from what it is, finished with the restraint of a good motion designer. Scenes assembled from stock pieces in a stock style look like every other generated video, however well they move.

## First, a design system for this project

Before any scene, decide how this video looks, from the project's own material, the way a designer starts a brand film. It starts with the look (`/look`), which titles, captions, scenes and the footage's grade all draw with:

- **Colour and type.**
  - **With a brand:** from the brand itself: the site's CSS (its custom properties, its heading and button styles), the logo, the product, and the fonts the site really uses.
  - **For personal footage** (a family beach trip, a wedding, a birthday): from the footage and the occasion. `palette` reads the footage's colours (the misty greys and driftwood of a Pacific beach, the turquoise and white of a Greek one) and suggests paper, ink and accents from them. Shift them to the mood: warmer, softer, bolder.
  - **Type that suits the mood:** rounded and friendly, handwritten, a travel journal's typewriter, an elegant serif, a clean modern sans. Set `fonts.displayWeight` for how heavy the headings are, and `fonts.caps: false` for a script or handwritten face. The Mac's own fonts need nothing: Avenir Next, Futura, Gill Sans, Optima, Didot, Baskerville, Hoefler Text, American Typewriter, Rockwell, Marker Felt, Noteworthy, Snell Roundhand. Any Google font comes in with `add_font`.
- **A grade.** `/look/grade` colours all the footage the same way: sunny and warm for a beach day (`warmth` 0.3, `saturation` 1.1), soft and nostalgic (`fade` 0.3, `saturation` 0.85), crisp and cool for a winter morning. Keep it subtle: people should still look like themselves. Add `grain` for film.
- **A motif.** One visual idea that recurs and couldn't belong to anything else:
  - from the product: the viewfinder of a camera, the bed and nozzle of a 3D printer, the terminal of a CLI tool, the receipt of a payments app;
  - from what's in the footage: a postcard and its stamp for a trip, the horizon line of the sea, a film strip, the page of a scrapbook.
- **A motion character.** Precise and technical, warm and soft, loud and punchy, slow and floaty for a lazy beach day. It decides the easing, the speed, and whether anything ever shakes.
- **What to leave out.** Glitches in a calm brand or a family video, paper texture in a sleek one, bounce in a serious one.

**Let the person pick the vibe when it's theirs to pick.** A brand's look is decided by the brand, and a person who has said what they're after ("relaxing beach vibes") has decided theirs. Otherwise:
1. Make 2–3 looks that fit the footage and differ in feel: say, misty and calm, golden and nostalgic, bright and playful.
2. Show them with `preview_looks`, which draws each on the project's own footage.
3. Offer them in a `choose` hand-off, each option's `image` set to its preview. When you're already asking something else (the directions for the cut), add the looks as a second question on the same card (`questions`).
4. Set the one they pick with `edit_project` on `/look`, with its `name` and a `note` on where it comes from and how it should feel.

Write the design system down as `DESIGN.md` with `write_scene` (a few lines on each), next to the scenes. Then build the few pieces every scene shares in that style, in a file of their own (`scenes/ui.tsx`): the background, the title treatment, the callout, the card. A video looks designed because it's a consistent system, not a collection of effects.

## Hero moments are written for this project

The few moments that carry the video (the hook, the reveal, the "what's inside", the payoff, the end card) get scenes written for this project with `write_scene`, from its real parts, numbers, screens and photos, in its design system.

The kit (`kit:…`) is for quick utility shots (a simple stat, a quote, a phone showing the site) and for sketching an idea before writing the real one. Its pieces take the project's look, but its layouts are the same in every project: if most designed shots are kit scenes, the video looks like every other beatsheet video, and `review_cut` says so.

## Designing one scene

1. **The one idea,** in a sentence: what should someone understand or feel here?
2. **Three ways to show it,** in words. Pick the most specific to this project: the one that couldn't be in anyone else's video.
3. **Build it** in the design system: background, picture, a few words of type, then the details.
4. **Look at it** with `frame` at four moments: before anything lands, mid-move, just settled, and the last frame.
5. **Critique it** against the checklist below, as a design lead would before a client sees it, and fix the weakest thing. Do this at least once for every hero scene: the first version is never the best one.

## What good looks like

- **Specific.** Real names, numbers, geometry, screens and photos from the project. If the scene could advertise any product, start again.
- **Hierarchy.** One focal point per frame and a clear order to read things in. Type in two or three sizes, with big contrast between them; about six words on screen at once, captions aside.
- **Space.** Generous margins (about 80u from the edges), things aligned to a grid, nothing cramped. In a vertical frame, keep the bottom fifth clear for captions and the app's buttons.
- **Colour.** The look's palette, with one highlight colour used sparingly.
- **Motion with a reason.** Each thing arrives on the word or beat that names it, eased to suit the brand. Related things stagger. Movement settles before the next idea arrives. At most one or two hard hits (a slam, a shake, a flash) in the whole video, where they're earned.
- **Finish.** The details that make it feel made: lines that draw on (an SVG path animating `strokeDashoffset`), a pulse ring on an anchor point, leader lines that elbow neatly to their labels, soft light and shadow on 3D, a little texture or grain, tabular figures for numbers that count.
- **Restraint.** If an effect doesn't serve the idea, leave it out.

## Two ways to make one

- **Your own scene,** for anything that matters. `write_scene` with a React component (TSX); the shot is `"component": "scenes/<File>.tsx#<Export>"` with `props`. It compiles as you write it, and errors come straight back. Look at it with `frame`.
- **From the kit, no code,** for quick utility shots. A coded shot with `"component": "kit:<Name>"` and props: `kit:Title`, `kit:Words` (kinetic type), `kit:Stat`, `kit:Cards`, `kit:Quote`, `kit:Code`, `kit:Split` (before/after), `kit:Grid` (photo wall), `kit:Polaroids`, `kit:Phone`, `kit:Callouts`, `kit:Media`, and overlays (`kit:Viewfinder`, `kit:Flash`, `kit:Stamp`, `kit:ScanLine`) for a track above a picture. `list_kit` has every prop. Your own scenes can use the same pieces from `@beatsheet/motion`, styled your way.

```json
{ "id": "s04", "track": "pic", "fidelity": "rough", "label": "Six printed parts",
  "start": { "kind": "word", "line": "inside", "word": "six" },
  "content": { "kind": "coded", "component": "scenes/Inside.tsx#Inside", "props": { "at": "six" } },
  "captions": false }
```

## The scene API

```tsx
import { AbsoluteFill } from "remotion";
import { useScene, useLook, prog, springAt, shakeAt, ease, rand, /* pieces: */ Paper, Ink, Blueprint, Kicker, Slam, Title, Rise, Pop, Chip, Stamp, Counter, Typewriter, Flash, Shake, Viewfinder, ScanLine, Glitch, Media, Split, Grid, Polaroids, Phone, Callouts, Cards, Quote, Code, ThreeCanvas } from "@beatsheet/motion";
```

- `useScene()`:
  - `t`: seconds into the shot; `frame`, `fps` and `duration` too.
  - `width`, `height`, and `u`: one unit at 1080 px on the frame's short side. **Size everything in `u`** and it holds up in every format.
  - `vertical`, and `look` (the project's).
  - `words`: the narration, timed from the shot's start. `word("chunky")` is when a word is spoken; `word("styles", 1)` is its second time.
  - `beats`, and `beat(n, "bar")`.
  - `asset(id)`: a URL for a photo or clip. `file("scenes/files/x.stl")`: a URL for a file you imported.
  - `props`.
- `useLook()`: `paper`, `ink`, `accent`, `accent2`, `accent3`, `color(name, fallback)`, the `display`, `body` and `mono` fonts, `displayWeight`, and `caps` (whether big type goes in capitals). Without a `/look` these are plain neutrals, so set the project's first.
- `Media` shows a photo or clip in the look's grade, like the footage around it. For footage you draw yourself, `gradeFilter(look.grade)` is the CSS `filter`, with `<GradeDefs grade={look.grade} />` beside it.
- Timing:
  - `prog(t, at, dur, ease.out)`: eased 0 → 1.
  - `springAt(t, at)`: lively 0 → 1 that overshoots.
  - `shakeAt(t, at, amount)`: a shake offset in pixels.
  - `ease.{out, in, inOut, back, expo}`, and `rand(seed)` for scatter that stays put.
- Every kit piece takes `at`: seconds into the shot, or a spoken word (`at="chunky"`).

**Rules.** A scene must draw the same picture for the same frame, every time:
- Compute everything from `t` and `frame`. No timers, no `useState` animation, no CSS transitions or animations, no unseeded `Math.random()`.
- Don't fetch from the web: use `asset()` and `file()`.
- Imports: `react`, `remotion`, `three` (and its `three/examples/jsm/...` loaders), `@beatsheet/motion`, and your own files beside the scene.
- Keep type off the edges (about 80u), and keep the bottom fifth of a vertical frame clear for captions and the app's buttons.

## Making things move well

- **Land on words.** A label appears as its part is named, the stat counts as the number is said, the before/after wipes on "transforms". Time with `at: "<word>"`, and start the shot on a word anchor.
- **Keep it alive.** Something should change every second or so: a piece arriving, the camera drifting, a number climbing. A still frame for 2 s reads as dead. `Media` takes `push`; footage shots take `content.motion`.
- **One idea per scene,** with a few words of type, big. The narration says the rest.
- **Layer it:** a background, then the picture, then type, then labels and details, each in the design system. Overlays on a track above footage (the motif, a frame, a label) tie footage and scenes together.
- **Mark chapters** with a change the design system defines (the background shifts, the highlight changes), the same way every time.
- **When a moment earns a hit,** give it weight once: the movement, a sound cue (`/sfx`) on the same frame, and maybe a flash. Then let the next shots breathe.
- **Use what's real.**
  - `import_file` the product's CAD (STL, GLB) for an exploded view;
  - `capture_page` the site for a phone, scrolling with `fullPage`;
  - the actual launch post goes in a quote, the actual numbers in a stat;
  - real photos and their restyles go in a before/after or a wall.

## Worked examples

`examples/` beside this file. They show technique; restyle them in the project's own design system rather than copying their look.

- **`Hook.tsx`:** the hero photo in a camera viewfinder. The focus box locks on a word, a flash and shake hit on the shutter, and the line slams in as it's spoken. (A camera's motif for a camera: find the equivalent for your project.)
- **`Exploded.tsx`:** the product's own STL parts, assembled, then pulled apart. Each part goes straight out from the middle, a label pins to each as it separates, and the camera is framed with `fit()`.

  To use it:
  1. `import_file` each STL (from the repo's `hardware/stl/`, say).
  2. Copy `Exploded.tsx` with `write_scene`, and restyle it.
  3. Use it as `scenes/Exploded.tsx#Exploded` with `props.parts`: `[{ file, label, sub?, color? }]`.

### 3D in short

`ThreeCanvas` does the WebGL plumbing:
- `setup` builds the scene once, and may be async (load models there).
- `draw(state, t, ctx)` poses the scene for time `t` and can return labels (`ctx.toScreen(mesh)` gives a part's point on the frame).
- `ctx.fit(object, { margin })` frames the camera on anything.
- CAD files are Z-up, so turn the group `-Math.PI / 2` on X.
- Light it like a product shot: a key light, a soft fill, a rim to separate it from the background, and a ground shadow. Flat ambient light looks like a preview.
- Blueprint looks: a `Blueprint` background with `new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff }))` instead of solid meshes.

## Check it

`frame` at a few moments of each designed shot: before things land, mid-move and settled. Look for:
- type cut off at the edges;
- labels on top of each other;
- empty space where something didn't load (a scene that fails shows its error in red);
- type that fights the captions (set the shot's `captions: false`).

Then `review_cut`. Its design pass shows every designed shot larger, at three moments, with what the project says about its design. Critique those as a design lead would and fix the three weakest things. If you can start a subagent, have it look at the designed shots with `frame` and the brand's references and name the three weakest things without your reasoning: a fresh eye is harsher.
