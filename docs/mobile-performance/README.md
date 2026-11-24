# Mobile performance

How the scene is kept to a frame budget on a phone, how to measure it on a real one, and what was
measured while this was built.

**Status: no measurement in this document comes from a phone.** Everything below marked *emulated* is
Chrome 158 on a Mac (Apple M-series GPU) with a phone-sized frame, 402 x 874 CSS pixels at 3x with touch
emulation, which is an iPhone 17 Pro's frame on a desktop GPU. It shows which settings cost what relative
to each other. It does not show a phone's frame rate. The physical-device check is the last section.

## Measure on the phone

Open the build with `?debug=performance`. A one-line bar appears under the header: capture time, frames
per second, 95th-percentile frame interval, quality tier, and the real drawing-buffer size.

1. Tap the bar's text to expand it. Tap **Low Power Mode: unknown** until it matches the phone's setting
   (Settings > Battery). The browser cannot read it, and Low Power Mode holds Safari at 30 frames per second.
2. Tap **Reset**. The clock restarts at 0:00 and every counter clears. Tap **Collapse**.
3. Use the site: scroll, use the chapter links, open a details dialog, rotate.
4. Tap **Copy** (it is on the collapsed bar too) and paste the JSON into a message. If the status line
   says copying was refused, the report appears in a text box to select by hand. **Download** saves
   `futari-perf-<date>.json` to Files instead. **Share** appears on https origins.

Note alongside the report: the iOS version (Settings > General > About, because Safari 26 reports a frozen
system version in its user agent), whether the phone was charging, and whether it felt warm.

The report keeps four measurements apart:

| Key | What it is |
| --- | --- |
| `frameIntervalMs` | Time between animation frames. What the visitor sees. Not a cost. |
| `cpuFrameWorkMs` | Main-thread time inside the frame callback. |
| `cpuRenderSubmissionMs` | The part of that spent issuing WebGL calls. Not GPU time. |
| `gpu` | Chrome: a timer query. Safari has none, so a fence is sampled on one frame in 20 and the report gives how long after submission the GPU reported the frame done, labelled as an upper bound. |

`governor.lastFrameCostMs` is a fifth: the cost of one whole frame, script and GPU together, which the
governor measures itself a few times a visit (see below). `slowFrames` counts frames over 1.5 budgets, over
33.4 ms, 50 ms, and 100 ms, by scene, with the position of the most recent ones. `quality.timeline` and
`marks` record every change of tier, every rebuild of the buffers, and every journey by chapter link.

A normal visit loads none of this: the overlay is a separate 17 kB chunk requested only with the parameter.

### Isolate what a frame costs

These switches are read once from the URL (`src/scene/experiment.ts`) and combine with the overlay, for
example `?debug=performance&dpr=1.25&msaa=0`.

| Switch | Effect |
| --- | --- |
| `dpr=1.25` | Rendered pixels per CSS pixel, held for the visit |
| `msaa=0` | Samples of the scene buffer: 0, 2, or 4 |
| `tier=1` | Start on this tier (0 is the lowest) and stay on it |
| `bloom=0.5` | Bloom resolution as a share of the frame |
| `governor=off` | Never change tier |
| `off=bloom,clouds` | Leave parts out. Passes: `bloom`, `transition`, `grain`, `shadows`. Layers: `terrain`, `landmark`, `ridges`, `clouds`, `banks`, `wood`, `foliage`, `mist`, `particles`, `shafts`, `exhibits`, `explore`, `passage` |

`dpr`, `msaa`, and `tier` also hold the governor still, so the variable under test stays put. The first
comparison to make on the phone is `tier=3`, `tier=2`, `tier=1`: one capture each over the same lap.

## Quality tiers

`src/scene/quality.ts`. A tier sets rendered pixels per CSS pixel, samples of the scene buffer, and bloom
resolution. A coarse pointer picks the phone ladder. That is only the first guess.

| Tier | Pixel ratio | Samples | Bloom | Buffer on an iPhone 17 Pro |
| --- | --- | --- | --- | --- |
| `phone-1.0` | 1.0 | 0 | half | 402 x 874 |
| `phone-1.25` | 1.25 | 0 | half | 502 x 1092 |
| `phone-1.5` (start) | 1.5 | 0 | half | 603 x 1311 |
| `phone-1.75-msaa` | 1.75 | 2 | half | 703 x 1529 |
| `desktop-1.0`, `-1.25` | 1.0, 1.25 | 4 | full | |
| `desktop-1.5` (start) | 1.5 | 4 | full | unchanged from before |

The buffer heights assume the canvas is the full 874 px. In Safari it is the large viewport height, which
is less than the screen. Each phone tier also has a ceiling on total pixels, so a tablet does not render
several phones' worth of frame. HTML text is not affected by any of this.

Before this work a phone rendered at 1.75 with 2 samples, full-resolution bloom, and the transition pass in
every frame. The top phone tier keeps that resolution and sampling.

Where the scene buffer has one sample per pixel, two things are drawn differently:

- Leaf and blossom cards cut their edge with an alpha test at half coverage. With the old 0.04 cut, which
  only coverage made right, every leaf drew about a pixel fat.
- The guiding beam is a tube a few centimetres across, one or two pixels on screen, and it broke into
  steps. It is drawn as a ribbon that faces the camera, is never narrower than the pixels can hold, and
  fades across its edge. Where the buffer is multisampled the tube is drawn as before.

### The governor

The old rule lowered the pixel ratio after 90 net frames over 24 ms, counting slow frames up by one and
the rest down by two. A steady 52 frames per second never triggered it, and it never raised anything.

The governor judges a rolling window of 96 frames by the share that missed their slot on the display
(an interval over 1.4 budgets). One long stall is one frame. The budget is the display's interval, never
tighter than 60 frames per second.

- **Lowering.** At 12 % missed on two judgements in a row it measures a frame before acting: it draws the
  frame, reads one pixel back, draws the same frame again and reads back again. The read returns only when
  the GPU has finished, so the time between the two reads is one whole frame's cost with no wait for the
  display in it. If that is 80 % of the budget or more, rendering is overloaded and the tier drops. If
  frames are missed while each costs little, a lower tier would not help: either the browser is pacing
  frames itself, which becomes the budget and is reported as `capped`, or something outside rendering is
  busy. The tier stays.
- **A cap seen early.** While the assets load there is nothing to draw, and the display's own cadence is
  read then. Thirty frames per second before the first frame is a cap from the start.
- **Raising.** Only after 8 s with under 2 % missed, and only if the heaviest of at least three measured
  frames, scaled to the next tier's load, would use under 60 % of the budget. The raised tier is on
  trial for 10 s and judged on 48 frames: if it misses frames it is left at once and locked out for the
  visit. A tier left under sustained load may be retried once, 45 s later. So the tier cannot oscillate.
- **Not load.** Frames are ignored for 2.5 s after the loop starts and 1.5 s after any rebuild of the
  buffers, and a frame that carried a warm-up step is not counted.

`node tools/governor-test.ts` runs twenty scripted cases with no browser. `node tools/governor-live.mjs`
watches it in a page.

The measurement has one known bias. A GPU that is idling at a low clock reads slow, so the governor may
see less headroom than there is and hold the tier. That errs toward the lower tier.

## What changed

### Rendering budget

- Tiers and the governor above.
- **The transition pass is skipped while it has nothing to draw.** Frost, the white-out, and the dialog's
  dim rest at zero for most of the lap. The pass runs in the first three frames after the context is made,
  so its shader is compiled before a transition needs it. Frames with frost, the white-out, the return, and
  the dim are the same images as before, within film grain.
- **Bloom at half resolution on phones**, from the luminance mask down, with one fewer level so the widest
  blur is the same size.
- **Culling.** Banks, groves, the climber, and the passage rings are culled against the camera. Groves are
  drawn in batches by side of the corridor and 40 m of depth. A third fewer triangles over a lap, and the
  frames are pixel-identical. The warm-up disables culling while it draws, so nothing uploads mid-journey.

### Loading and the first frames

- **Materials are compiled for the buffer the frames use.** `renderer.compile` ran with the canvas as its
  target, which produces different programs from the half-float scene buffer, so the real ones compiled
  again inside the first frame. Compiling now targets a small half-float buffer and uses `compileAsync`.
- **The opening is drawn once into that buffer before the entrance starts its clock**, and the later
  chapters one group per frame when they load, not all in one frame.
- **Texture work off the main thread or made cheap:** images are decoded with `createImageBitmap`, the
  mean-colour pass uses a table, and the noise generators lost their inner closures. About 70 ms to 27 ms
  on the emulated phone frame.
- **Assets the phone tier never uses are not fetched:** `land-normal.jpg` (383 kB) and two thirds of the
  particle targets (`particles-coarse.bin`, 158 kB against 422 kB).
- **The entrance now plays on phones.** A scroll position is a whole number of pixels and a lap rarely is,
  so on most phone frames the page rests a fraction of a pixel before the lap's start. The engine read that
  as arriving mid-page and skipped the entrance. It did so on the 402 x 874 frame used here.

### Resize and scroll

- **The canvas is `100lvh` tall**, the viewport with the browser's toolbar away. The toolbar sliding in or
  out covers or uncovers the bottom of the canvas and does not resize it, so no buffer is rebuilt in the
  middle of a scroll. With the toolbar showing, the bottom strip of the scene is behind it.
- **A resize is applied once, at the start of the next frame, and only if the canvas size, pixel ratio,
  samples, or bloom scale changed.** It no longer draws a frame with a zero time step, which used to snap
  the damped travel to the scroll goal. Rotation and tier changes keep the camera where it was.
- **The scroll position is not corrected when the spacer has not changed size.** The toolbar fires `resize`
  while the `svh` spacer stays the same, and the `scrollTo` that followed could cut a fling short. The
  scroll authority also no longer recentres under a resting finger.

### Chapter links

`docs/journey.md` describes them. A link is now a journey at `NAVIGATION_SCREENS_PER_SECOND = 0.9`
viewport heights per second (`src/journey/chapters.ts`), one second of easing in and 1.2 s out, driven
through the page's own scroll position: Lab to Work 5.1 s, Work to Explore 6.6 s, Explore to Lab 3.5 s.

## What the measurements say

Raw outputs are beside this file. All emulated, as described at the top.

### Where a frame goes (`ablate-layers.txt`, baseline at 1206 x 2622 with 2 samples)

- With every layer of the scene switched off, a frame still costs 3.6 to 3.75 ms of 5.1 to 8.4 ms. The
  post chain and the sky are half the frame or more.
- Multisampling is the most expensive single setting: without it a frame is a third shorter, at all
  three scenes measured (`pipeline-baseline.txt`).
- The transition pass costs 17 % to 22 % of a frame while it draws nothing.
- Bloom costs 12 % to 16 %. At half resolution it costs about half of that.
- The opening's terrain is 2.2 ms of a 6.8 ms opening, and 2.7 ms of the 8.4 ms return. That is its
  fragment shader, not its triangles.
- Geometry is not the limit here. At 201 x 437, where only vertices cost anything, every scene is 0.2 to
  0.5 ms over an empty one. No detail levels were added, and no geometry or capture changed.
- Clouds cost at most 0.36 ms and mist 0.15 ms. They were left alone.

### Pixel ratio, with everything else held (`pipeline-baseline.txt`)

Mean frame interval with the display limit removed, 2 samples, full pipeline. About 1.7 ms of each figure
is this machine's fixed cost per frame, so the part that scales with pixels is the remainder: at 1.25 it
is a third of what it is at 1.75, and at 1.0 almost nothing is left to measure.

| Pixel ratio | Opening | Engineering | Return, arriving |
| --- | --- | --- | --- |
| 3.0 (the display's own) | 6.28 ms | 4.56 ms | 6.63 ms |
| 1.75 (before) | 2.86 ms | 2.22 ms | 3.00 ms |
| 1.5 | 2.32 ms | 1.87 ms | 2.40 ms |
| 1.25 | 2.09 ms | 1.74 ms | 2.09 ms |
| 1.0 | 1.76 ms | 1.74 ms | 2.07 ms |

That table alone would point at 1.25 as the conservative start. The start tier is 1.5 without
multisampling instead: dropping the samples saves more than the step from 1.5 to 1.25 does, and at native
size 1.5 without samples holds its edges better than 1.25 with them (`tiers-*.jpg`).

### Before and after (`tiers-scaled.txt`)

Every configuration is scaled by 3 / 1.75 so the desktop GPU is the limit and not the CPU. The ratios are
the result. Before is `main` at 1b37617.

| Scene | Before | Top tier | Start tier `phone-1.5` | `phone-1.25` | `phone-1.0` |
| --- | --- | --- | --- | --- | --- |
| Opening | 6.12 ms | 5.57 | 3.39 | 2.74 | 2.04 |
| Engineering builds | 4.36 | 3.15 | 2.11 | 1.71 | 1.68 |
| Engineering | 5.28 | 3.42 | 2.20 | 1.87 | 1.69 |
| Kensaku | 5.49 | 3.64 | 2.19 | 1.91 | 1.64 |
| Ring passage | 5.82 | 4.85 | 2.78 | 2.07 | 1.58 |
| Explore | 4.58 | 3.44 | 2.06 | 1.70 | 1.59 |
| Return, dispersing | 4.38 | 3.01 | 1.93 | 1.54 | 1.52 |
| Return, arriving | 7.50 | 5.97 | 3.51 | 2.83 | 2.01 |

The start tier is 40 % to 55 % of the frame it replaces. Triangles at the rests: Engineering 373,882 to
216,719, Kensaku 405,954 to 204,789, ring passage 570,074 to 361,777, Explore 365,566 to 134,285.

### The image

`tiers-engineering.jpg` and `tiers-kensaku.jpg` are native-size crops of the phone frame, left to right:
before, the top tier, `phone-1.5`, and a lower tier (`phone-1.25` and `phone-1.0`). The top tier matches
the frame it replaces to within film grain at every station compared: mean difference 1.5 to 2.0 of 255,
which is what two captures of one build differ by. `phone-1.5` is slightly softer and its hard edges are
not smoothed. The lower tiers are visibly softer.

On the desktop frame, 1440 x 900 at 2x, seven stations of the new build differ from `main` by exactly as
much as `main` differs from itself. The desktop image is unchanged.

### Loading (`startup-*.txt`, five loads with an empty cache)

| | Phone frame, before | after | Desktop, before | after |
| --- | --- | --- | --- | --- |
| Script in the first frame | 69 ms | 15 ms | 54 ms | 17 ms |
| Longest frame until the entrance ends | 73 ms | 20 ms | 100 ms | 32 ms |
| Frames over 34 ms until then | 1 | 0 | 2 | 0 |
| Scene first shown after | 283 ms | 354 ms | 334 ms | 280 ms |

The phone "before" column has no entrance in it, because that build skipped it at this frame size.

### Laps (`perf-*.txt`) and sustained use (`soak-phone-after.txt`)

Two laps downward and one upward at one viewport per second hold 60 frames per second before and after
on this GPU, at both frame sizes, with resource counts unchanged across laps. That says the changes broke
nothing. It cannot show a gain, because this GPU was never the limit at these sizes.

Four minutes on the phone frame, twelve rounds of Work, Explore, Lab by chapter link with flings forward
and back between: 15,434 frames, median 16.7 ms, 95th percentile 18.4, 99th 19.2, longest 25.3, none over
33 ms. The tier stayed `phone-1.5`. Programs 51, geometries 168, textures 28 at the start and at the end.

## Checks

Run against a preview server: `journey-test` 28, `nav-test` 115, `loop-test` 26, `overlay-test` 49,
`governor-live` 11, `governor-test` 20, and `motion-test` with no errors. Two `loop-test` checks were
changed: the touch-distance tolerance (60 px failed on `main` too, at 67 px over 19,500) is now 1 %, and
the camera-jump check is scaled to a 60 Hz frame.

## Not verified on a phone

None of the following could be checked without the device:

- Frame rate, frame pacing, and which tier the governor settles on, in Safari on the iPhone 17 Pro, over a
  full lap, the return, and several minutes of use.
- That reading one pixel back waits for the GPU in Safari as it does in Chrome, which the governor's
  measurement depends on. `governor.lastFrameCostMs` in a report shows whether the figure is plausible.
- That the fence-based GPU figure in the overlay works in Safari. It was exercised in Chrome only.
- Per-frame `scrollTo` during a chapter journey: smoothness, and that Safari's own scroll reporting never
  reads as the visitor taking over.
- Touch taking over a journey with a real finger, a tap on a link during a fling, and that the toolbar
  collapsing mid-fling no longer cuts momentum.
- The `100lvh` canvas with Safari's toolbar: that nothing is resized when it slides, and that the framing
  with the toolbar showing is acceptable.
- Copying the report over plain `http`, which uses the fallback path.
- Low Power Mode being recognised as a cap, and the tier being kept.
