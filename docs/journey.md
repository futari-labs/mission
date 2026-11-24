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
of the spacer, which takes three laps of unbroken scrolling to reach. It never runs while a dialog is open.

Navigation scrolls to the nearest occurrence of a chapter's rest point, forward or back. From Explore,
Lab is nearer forward, so that link plays the return.

A reload restores the position within the lap. A resize or rotation keeps the same logical position.

Without WebGL the spacer is hidden and the page is a plain finite document.

## Sequence

Positions are journey units. One lap is 1.28 units, about 10.9 screens of scrolling.

| Position | What happens |
| --- | --- |
| 0.00 to 0.06 | The lab at rest. |
| 0.06 to 0.36 | One continuous camera move: toward the light, between 二 and 人, along the beam to Exhibit 01. Each character slides aside as a whole. A frost front rises with block displacement and a color fringe, the view whites out inside the light, and clears into fog. From 0.20 the Engineering sculpture builds ahead of the camera, part by part. Its enclosure resolves from 0.35. |
| 0.36 to 0.48 | Futari Engineering at rest. |
| 0.48 to 0.60 | The camera passes beside the first enclosure and follows the beam. Kensaku's parts align from 0.515, and its enclosure resolves from 0.59. |
| 0.60 to 0.72 | Kensaku at rest. |
| 0.72 to 0.94 | The ring passage. The camera passes beside the lens, joins the line of the light, and goes through three stone rings that assemble ahead of it. Particles leave the lens along the beam and gather at the installation. |
| 0.94 to 1.10 | Explore further at rest. Links select the particle form. |
| 1.10 to 1.28 | The return. See below. Position 1.28 is position 0 of the next lap. |

`docs/construction/README.md` describes the construction and the ring passage.

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
return begins, the installation and the camera are both drawn 260 m further along z, in front of the
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
pass with four uniforms.

Three rules came out of measurement and should be kept.

- The number of lights in the scene never changes. Lights sit outside the groups that get hidden and go
  to zero intensity instead. Hiding a light changes the light count, and every lit shader then recompiles
  the first time a chapter appears.
- The later chapters are drawn once into a small offscreen target when they load, so their shaders and
  buffers are ready before the visitor scrolls to them.
- Chapter copy fades by scroll progress, set as an inline opacity on a permanent layer. The chapter links
  switch with no transition. CSS transitions on either dropped a frame at every chapter boundary.

The landmark's shadow map redraws only on frames where a block has moved.

## Checks

Start `pnpm preview`, then:

| Command | What it does |
| --- | --- |
| `node tools/loop-test.mjs` | The loop: two laps downward, upward across the join, stops and reversals at the join, fast scroll across it, navigation, dialog, reload, and resize after crossing, stable resources, and touch flings. Exits non-zero on failure. |
| `node tools/journey-test.mjs` | Chapters, links, details dialog, keyboard, touch, reduced motion, fallbacks. Exits non-zero on failure. |
| `node tools/motion-test.mjs` | Camera continuity for the entrance handoff, reversals, fast scroll, navigation, reload, resize. |
| `node tools/perf.mjs` | Frame intervals, draw calls, and triangles for the opening, two laps downward, and one lap upward, plus resource counts. Headed by default. |
| `node tools/record.mjs docs/journey` | Records more than two laps scrolling downward only. Add `--join` for the upward crossing. |
| `node tools/motion-sheet.mjs out.jpg` | Frames sampled from a live scroll, as one contact sheet. Positions may run past one lap. |

Edit the sequence in `src/journey/chapters.ts` and `src/scene/journey.ts`. Edit the scroll bookkeeping in `src/journey/travel.ts`.
