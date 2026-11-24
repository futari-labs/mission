# Journey: sequence, transitions, and the loop

One light connects the four chapters. A shard of light hangs between the two characters of the 二人
landmark and extends into a beam that runs straight back through the scene. Each exhibit sits on that
beam, and the beam ends in the particle installation. From there the particles carry the visitor back
to the landmark, and the journey repeats for as long as the visitor keeps scrolling.

## One travel value

`travel` counts laps and never wraps: 0.98, 1.0, 1.02 and onward. `src/journey/travel.ts` is the only
place that turns scroll position into travel, and the renderer, the chapter copy, navigation, focus,
restore, and resize all go through it.

Each frame the renderer damps the continuous travel value, then takes its fraction to find the position
inside one lap. Damping happens before wrapping, so crossing from one lap into the next is more travel,
never a move back through the sequence. Everything on screen is a pure function of that position: the
camera pose, the parting of the two characters, fog density, which groups render, the transition effect,
the particles, and which chapter's HTML shows. Nothing listens for wheel events, so stopping holds the
state and reversing plays it backward. Pointer parallax and ambient motion are added on top and run on
their own clock, so they continue across the join.

I did not use ScrollTrigger. Reading the native scroll position in the existing frame loop does the same
job with no second source of truth.

### How native scrolling keeps going

The page has one copy of the content and one tall spacer, `.track`, seven laps long. The visitor starts
in the middle lap. `travel = base + scrollY / lapPixels`.

When the visitor is no longer in the middle lap, `maintain` moves `scrollY` by whole laps and changes
`base` by the same number, reading the scroll position back so the result is exact to the sub-pixel.
Travel does not change, so nothing on screen moves. It waits for scrolling to pause for 180 ms, because
moving the scroll position can cut a touch fling short. It acts mid-scroll only within 0.8 lap of an end
of the spacer, which takes three laps of unbroken scrolling to reach. It never runs while a dialog is open,
under a finger that is resting on the screen, or during a chapter link's journey.

A reload restores the position within the lap. A resize or rotation keeps the same logical position.
A `resize` event that leaves the spacer the same height, which is what a phone toolbar sliding away
sends, does not touch the scroll position: setting it there would cut a touch fling short.

### Chapter links are journeys

A chapter link travels to the nearest occurrence of that chapter's rest point, forward or back, across
the lap boundary if that is closer. From Explore, Lab is nearer forward, so that link plays the return.

The link does not use the browser's smooth scroll, which covers any distance in well under a second.
`travel.ts` scrolls the page itself, one frame at a time, on an animation-frame loop that runs only while
a journey does. It moves the same scroll position a wheel or a finger moves, so construction, copy,
seasons, and transitions play exactly as they do by hand, and the renderer needs to know nothing about it.

The pace is one setting, `NAVIGATION_SCREENS_PER_SECOND` in `src/journey/chapters.ts`: viewport heights
of scrolling per second, 0.9. A steady manual scroll in the test tools is one viewport a second and the
unhurried scroll of the recordings is half that, so 0.9 is a normal scrolling pace, and it is the same
on every screen. A journey eases up to that pace in `NAVIGATION_EASE_IN_SECONDS` (1 s), holds it, and
eases down to rest in `NAVIGATION_EASE_OUT_SECONDS` (1.2 s). Its duration is therefore its distance
divided by the pace, plus 1.1 s. A hop too short to reach the pace peaks lower.

| Route | Direction | Scrolling | Duration |
| --- | --- | --- | --- |
| Lab to Work, Work to Lab | forward, back | 3.7 screens | 5.1 s |
| Work to Explore, Explore to Work | forward, back | 5.0 screens | 6.7 s |
| Explore to Lab, Lab to Explore | forward through the return, back through it | 2.2 screens | 3.5 s |

A journey is kept in travel units, not pixels. Each frame it asks how fast it should be going this far
from its destination, moves its speed gently toward that, and sets the scroll position to match. So:

- A resize or rotation on the way changes the lap length under it and nothing else.
- It starts from the middle lap of the spacer and is never longer than half a lap, so `maintain` leaves
  it alone for exactly as long as it runs. There is no timeout.
- Another link replaces it and inherits its speed. A destination further on is carried on to without a
  stop. One behind turns the pace round.
- A wheel, a finger on the scene, a scroll key, or any scroll it did not make (a scrollbar drag) ends it
  at once. It simply stops driving: the page is where it was that frame, and the renderer's damping eases
  the camera out. A phone reports the scroll position back a moment after it is set, so the journey
  recognises its own last few positions and does not take that echo for the visitor's hand. A finger that lands on a link or a button takes over only once it moves, so a tap on
  another chapter replaces the journey instead of stopping it.
- Opening the details dialog ends it.
- A frame that arrives late advances it by at most a tenth of a second of travel, so it never leaps.
- It ends exactly on the rest point, the same place a jump lands.

While a journey runs, `readTravel` returns the journey's own position, which the scroll position follows
to the nearest pixel, so pixel rounding never reaches the camera. With reduced motion, and for keyboard
focus that lands in another chapter, a link is an immediate jump as before.

Without WebGL the spacer is hidden and the page is a plain finite document.

## Sequence

Positions are journey units. One lap is 1.28 units, about 10.9 screens of scrolling.

| Position | What happens |
| --- | --- |
| 0.00 to 0.06 | The lab at rest. |
| 0.06 to 0.36 | One continuous camera move: toward the light, between 二 and 人, along the beam to Exhibit 01. Each character slides aside as a whole. A frost front rises with block displacement and a color fringe, the view whites out inside the light, and clears into fog. From 0.20 the Engineering arbor builds ahead of the camera, part by part, and its frame stands at 0.35. The climber then grows through it and flowers, from 0.34 to 0.40. |
| 0.36 to 0.48 | Futari Engineering at rest. |
| 0.48 to 0.60 | The camera passes beside the arbor and follows the beam. Kensaku's instrument is set up from 0.515 and stands at 0.60. From 0.59 to 0.63 its mirror turns to the sun, its iris opens, and the light comes to a point on one result. |
| 0.60 to 0.72 | Kensaku at rest. |
| 0.72 to 0.94 | The ring passage. The camera passes beside the lens, joins the line of the light, and goes through three stone rings that assemble ahead of it. Particles leave the lens along the beam and gather at the installation. |
| 0.94 to 1.10 | Explore further at rest. Links select the particle form. |
| 1.10 to 1.28 | The return. See below. Position 1.28 is position 0 of the next lap. |

`docs/construction/README.md` describes how parts assemble and the ring passage. `docs/exhibits/README.md` describes the two exhibits.

The entrance is time-based and runs once per page load. If scrolling starts during it, it finishes at
3.5 times speed instead of jumping. Later laps arrive at the finished landmark.

Under reduced motion the camera holds the rest pose of the nearest chapter, and the return is split
between Explore and the lab with no travel.

## The return

1. Explore's copy fades. The base and its ring light sink away.
2. The selected particle form loosens. Each particle leaves for its own place in a large volume of air
   along the camera's path, and turns from lit grey to white. Any of the three forms works, and the
   selection is not touched, so reversing gathers the same form again.
3. The camera moves forward through the cloud and rises. Fog thickens to drifting snow. The light
   between the two characters shows through the fog ahead the whole way.
4. The particles thin out one by one while the landscape's own snow and mist fade in.
5. The mountains and 二人 emerge as the fog clears, and the camera descends into exactly the opening pose.

The exhibits and the installation stand in open fog, so their place in the world is free. When the
return begins, the installation and the camera are both drawn 285 m further along z, in front of the
opening camera. Only the installation is visible then, so the move cannot be seen, and from that point
the camera's flight to the landmark is one real path through one space. The return sets every scene
value from the position alone. Nothing in it depends on where the camera is, so it cannot switch the
exhibits or the first white-out back on.

At the join, the end of one lap and the start of the next are the same state: camera pose and field of
view, finished landmark at resting light, opening fog, beam retracted, no transition effect, only the
lab group drawn, opening copy shown.

## Rendering

One renderer and one scene. The lab, each exhibit, and the installation are groups that render only while
the camera is near them, so at most two are drawn at once. The transition effect is one post-processing
pass with four uniforms. Frost, the white-out, and the dialog's dim rest at zero for most of the lap, and
the pass is left out of every frame in which they do.

How many pixels are rendered, and how the scene buffer is sampled, is a quality tier. A phone and a desktop
start on different tiers, and a governor moves between them from measured frames.
`docs/mobile-performance/README.md` describes the tiers, the governor, and how to measure on a phone.

Four rules came out of measurement and should be kept.

- The number of lights in the scene never changes. Lights sit outside the groups that get hidden and go
  to zero intensity instead. Hiding a light changes the light count, and every lit shader then recompiles
  the first time a chapter appears.
- Everything is compiled and uploaded before it is needed, and for the buffer it will be drawn into. Materials
  are compiled against a small half-float target, the same kind the frames use: compiled against the canvas
  they come out as different programs and the real ones compile again in the first frame. The opening is drawn
  into that target once before the entrance starts its clock. The later chapters are drawn into it one group
  per frame when they load, so no single frame carries all of their uploads. A visit that starts in a later
  chapter draws it at once.
- The canvas is as tall as the viewport gets with the browser's toolbar away (`100lvh`), so a phone's toolbar
  sliding in or out never resizes it. A resize that does change the canvas is applied once, at the start of
  the next frame, and never moves the journey: the damped travel carries on from where it was.
- Chapter copy fades by scroll progress, set as an inline opacity on a permanent layer. The chapter links
  switch with no transition. CSS transitions on either dropped a frame at every chapter boundary.

The landmark's shadow map redraws only on frames where a block has moved.

## Checks

Start `pnpm preview`, then:

| Command | What it does |
| --- | --- |
| `node tools/loop-test.mjs` | The loop: two laps downward, upward across the join, stops and reversals at the join, fast scroll across it, navigation, dialog, reload, and resize after crossing, stable resources, and touch flings. Exits non-zero on failure. |
| `node tools/journey-test.mjs` | Chapters, links, details dialog, keyboard, touch, reduced motion, fallbacks. Exits non-zero on failure. |
| `node tools/nav-test.mjs` | Chapter links, on a desktop frame and a phone-sized touch frame: all six routes with duration, pace, direction, and exact arrival; that what lies between is played; wheel, touch, and key taking over without a jump; replacement; resize and rotation on the way; the lap boundary; reduced motion. Prints the measured durations. Exits non-zero on failure. |
| `node tools/motion-test.mjs` | Camera continuity for the entrance handoff, reversals, fast scroll, navigation, reload, resize. |
| `node tools/governor-test.ts` | The quality governor against scripted frames: sustained and moderate slowdowns, startup stalls, a browser frame-rate cap, raising and locking out a tier. No browser. |
| `node tools/governor-live.mjs` | The governor in a real page on a phone-sized frame: a tier change keeps the journey continuous, and a rotation rebuilds the buffers without moving it. |
| `node tools/overlay-test.mjs` | The `?debug=performance` overlay: absent and not loaded on a normal visit, refresh rate, capture, reset, copy, download. |
| `node tools/startup.mjs` | Stalls while the page loads and on first arrival at each chapter, over several loads with an empty cache. |
| `node tools/ablate.mjs --variants="dpr=1.75;dpr=1.25"` | Controlled rendering experiments: frame cost with one setting changed at a time, the scene held still at each station. |
| `node tools/perf.mjs` | Frame intervals, draw calls, and triangles for the opening, two laps downward, and one lap upward, plus resource counts. Headed by default. |
| `node tools/scene-cost.mjs` | Draw calls, triangles, and frame intervals with the scene held still at each chapter and transition. `--dpr=2` and `--phone` set the frame. `--uncapped` stops waiting for the display, to compare the cost of two builds. |
| `node tools/forms-sheet.mjs out.jpg` | The three particle forms at Explore, one frame each. |
| `node tools/shimmer-check.mjs` | A proxy for shimmer: how many pixels change sharply between frames one pixel of scroll apart. `--phone` takes the phone tier, `--query=msaa=0` adds experiment switches. |
| `node tools/env-frames.mjs out-dir` | Still frames along the lap with the draw calls and triangles of each. `--diff dir-a dir-b` counts the pixels that differ between two sets, for showing that a change is pixel-identical. |
| `node tools/record.mjs docs/journey` | Records more than two laps scrolling downward only. Add `--join` for the upward crossing. |
| `node tools/motion-sheet.mjs out.jpg` | Frames sampled from a live scroll, as one contact sheet. Positions may run past one lap. |

Edit the sequence in `src/journey/chapters.ts` and `src/scene/journey.ts`. Edit the scroll bookkeeping in `src/journey/travel.ts`.
