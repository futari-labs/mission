# Journey: sequence and transitions

One light connects the four chapters. A shard of light hangs between the two characters of the 二人
landmark and extends into a beam that runs straight back through the scene. Each exhibit sits on that beam, and the beam ends in the particle
installation.

## One progress value

`progress` is `scrollY / (scrollHeight - innerHeight)`, read every frame and damped. Everything else is
a pure function of it: the camera pose, the parting of the two characters, fog density, which groups render,
the transition effect, and which chapter's HTML shows. Nothing listens for wheel events, so reversing,
jumping, reloading mid-page, and resizing all resolve to the same state. Pointer parallax and ambient
motion are added on top of the base pose and never write to it.

I did not use ScrollTrigger. Reading the native scroll position in the existing frame loop does the same
job with no second source of truth.

## Sequence

| Progress | What happens |
| --- | --- |
| 0.00 to 0.06 | The lab at rest. |
| 0.06 to 0.31 | One continuous camera move: toward the light, between 二 and 人, along the beam to Exhibit 01. Each character slides aside as a whole as the camera nears. The beam extends ahead. A frost front rises with block displacement and a color fringe, the view whites out inside the light, and clears into fog. |
| 0.31 to 0.42 | Futari Engineering at rest. |
| 0.42 to 0.53 | The camera passes beside the first enclosure and follows the beam to Kensaku. A lighter frost pass marks the midpoint. |
| 0.53 to 0.65 | Kensaku at rest. |
| 0.65 to 0.82 | Particles leave the lens along the beam. The camera follows, rises, and settles in front of the installation as the particles gather. |
| 0.82 to 1.00 | Explore further at rest. Links select the particle form. |

The entrance is time-based and runs once. If scrolling starts during it, it finishes at 3.5 times speed
instead of jumping, and the camera blends into the scroll pose.

Under reduced motion the camera holds the rest pose of the nearest chapter and the transition effect is off.

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
| `node tools/journey-test.mjs` | Chapters, links, details dialog, keyboard, touch, reduced motion, fallbacks. Exits non-zero on failure. |
| `node tools/motion-test.mjs` | Camera continuity for the entrance handoff, reversals, fast scroll, navigation, reload, resize. |
| `node tools/perf.mjs` | Frame intervals, draw calls, and triangles for the opening and the whole journey. Headed by default. |
| `node tools/record.mjs docs/journey` | Records the journey forward and back as a video. |
| `node tools/motion-sheet.mjs out.jpg` | Frames sampled from a live scroll, as one contact sheet. |

Edit the sequence in `src/journey/chapters.ts` and `src/scene/journey.ts`.
