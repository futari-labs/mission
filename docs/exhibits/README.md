# The seasonal exhibits

The two project exhibits were redesigned so that each belongs to its season. The journey, the scroll-driven construction, the ring passage, the typography, and the loop are unchanged. The baseline is commit `0cea7ce`, tagged `realism-baseline`.

The evidence here is stills, frames sampled from live scrolls, and logged measurements. Nobody watched the result in motion, on a physical phone, or in a browser other than Chrome.

| Season | Chapter | Idea | Object |
| --- | --- | --- | --- |
| Winter | Futari Labs | Identity and foundations | The 二人 monument, unchanged |
| Spring | Futari Engineering | Construction enables growth | A timber arbor that a climber grows through |
| Summer | Kensaku | Light brings information into focus | An open instrument that focuses sunlight on one result |
| Autumn | Explore | The work gathers, then disperses | The particle forms, regenerated from the new objects |

## What was removed

The crystal prism around Engineering and the hexagonal crystal around Kensaku are gone, with their geometry, their material, and the `shell` settings. The beat that used to resolve each enclosure now drives what the exhibit does once it stands: `engineeringGrowth` and `kensakuFocus` in `src/scene/journey.ts`.

The whole-exhibit sway, bob, and pointer tilt are gone too. Nothing with a foundation moves.

## Engineering: the arbor

Two A-frame supports stand on stone footings either side of the guiding light. Each divides at its head into three curved ribs. The six ribs close around the light and turn out at their tips, like a bud that has begun to open. Six arched pieces seat between the ribs. The two widest stand over the light where it enters and leaves, and they are what join the two halves into one frame.

A climber is planted in a stone bed between the footings. It is the reason the frame exists, and it only grows once the frame is complete.

| Step | Position | What happens |
| --- | --- | --- |
| 1 | 0.20 to 0.26 | The footings and the planted bed come down and settle. The two supports swing in and stand, with their bronze shoes and bands. |
| 2 | 0.24 to 0.27 | The tie beam passes through both supports and is wedged. |
| 3 | 0.25 to 0.32 | The ribs go up: the middle rib of each hand first, then the two beside it. |
| 4 | 0.30 to 0.35 | The arches seat on their pegs. The two wide ones come last and join the hands. The light at the heart comes on. |
| 5 | 0.34 to 0.38 | Stems rise from the bed, wind up one leg of each support, follow two ribs, and run out over a wide arch. Leaves open behind the growing tip. |
| 6 | 0.37 to 0.40 | Blossom opens along the stems, and in short chains hanging from the arches. |

Joinery is modelled, not textured: the through-tenon and wedges of the tie beam, the peg through each head, a peg at each foot of every arch, and bronze shoes, bands, and straps.

There are 20 rigid parts of stone, soil, timber, and bronze, and the climber.

## Kensaku: the instrument

Two stone piers stand in a shallow basin of water. They carry a bronze mount on trunnions, with a hand wheel on each. The mount holds a glass lens on the line of the guiding light. In front of the lens and below it, a mirror on a forked stem. Behind it, three slate plates of results stand in line on a rail. Each plate has raised lines and a hole for the light.

| Step | Position | What happens |
| --- | --- | --- |
| 1 | 0.515 to 0.55 | The basin comes down and the two piers stand in it. The rail and the mirror's stem arrive. |
| 2 | 0.545 to 0.58 | The mount comes down lying flat and swings upright on its trunnions. The lens slides in from the front. The iris is closed. |
| 3 | 0.565 to 0.60 | The three plates slide in from alternate sides and square up on the line of the light. |
| 4 | 0.59 to 0.61 | The mirror turns up to the sun, and a shaft of sunlight rises from it into the lens. The iris opens. |
| 5 | 0.60 to 0.63 | Behind the lens the light gathers and narrows to a point on the first plate. One line of that plate lights. |

The lens is the only glass. The mirror's face, the sunlight shaft, the cone behind the lens, and the lit line are authored: none of them is a simulation of the optics. The mirror sends light into the lens at about 30 degrees to its axis, which a real lens would not bring to that point.

There are 14 rigid parts of stone, slate, bronze, and glass, and the water.

## Grounding

Each exhibit stands on its own outcrop: a crag with a level, turfed top that rises out of the cloud on the line of travel. The crags are two more banks in `tools/assets/landscape.ts`, built by the same height function and drawn with the same rock and turf as the others. Their tops meet the undersides of the footings and the basin, and the ground is baked darker under and close around each exhibit.

Like the other banks, the crags belong to the growing seasons. They fade in under the first white-out and are hidden in winter and through the return. From Engineering's rest, Kensaku's crag is visible ahead as a bare stack until the instrument is set up on it.

## Materials

Every rigid part names what it is made of, and the app gives each its own shading (`src/scene/materials.ts`):

- **Stone** keeps the monument's stone and replaces its frost with lichen in spring and sun-bleaching in summer.
- **Timber** has fibres that run along each piece: straight for the legs and beams, along the curve for the ribs, around the frame for the arches. The grain is laid out in the part's own space, so it stays with a part while it travels. Upward faces and worn edges are paler and greyer.
- **Bronze** is dark where it has weathered and bright on worn edges. On the instrument it reflects a summer sky.
- **Slate** is dark stone whose marked line lights when the light comes to a point.
- **Glass** is clear where the eye looks straight through and brighter toward its edge, and glows from within when the light gathers.
- **Water** shows the sky and a darker shoreline by how shallow the eye's angle is, and carries slow ripples and broken sunlight.

The climber is drawn by the tree shaders, so the season lights and colours it like the groves. It differs in one way: its stems, leaves, and flowers appear in the order the plant grows, set by the scroll position.

Both exhibits are lit by the same seasonal key light, sky, and bounce as the landscape around them.

## Motion

Assembly, growth, and focus are functions of the scroll position alone. Stopping holds any stage, reversing undoes it in order, and every lap repeats it. A part can ride another until its own move begins: the iris blades ride the mount, and the mirror rides its stem.

What moves on its own is small: leaves stir, the water ripples, and the light at the heart breathes and answers the pointer. Under reduced motion the clock is stopped, so those are still, and each exhibit is shown complete.

## Explore

The Engineering and Kensaku particle forms are sampled from the new parts, so they have the silhouettes the visitor has just seen. The arbor is taller than the particle volume, so its form is drawn at 80 percent. The climber is not part of the form.

## Pipeline

- `tools/assets/shape.ts` holds what a part is and the shapes parts are built from, including a bar of rectangular section swept along a curve.
- `tools/assets/arbor.ts` and `tools/assets/instrument.ts` hold the two exhibits. `arbor.ts` also grows the climber along the same curves as the ribs and arches.
- `ONLY=exhibits pnpm assets:build` rebuilds the exhibits alone in about 15 seconds.
- Where the instrument's lens, mirror, plates, and water sit is written twice: in `instrument.ts` for the geometry and in `exhibit.optics` in `src/scene/look.ts` for the light and the water. The two must agree.

## Measured cost

Headed Chrome 158, Apple M1 Pro, 1440 by 900 unless noted. Both builds were measured in the same session. Frame intervals are the time between animation frames as seen by the page, not GPU time.

### Cost of each scene

`tools/scene-cost.mjs` holds the scene still at each position and samples it there. The frame times use a requested pixel ratio of 2, which the site caps at a rendered ratio of 1.5, with Chrome not waiting for the display, so an interval shows what a frame costs.

| Scene | Draw calls | Triangles | Mean, before | Mean, after |
| --- | --- | --- | --- | --- |
| Winter, opening | 46 to 46 | 507,038 to 507,038 | 8.6 ms | 8.6 ms |
| Spring, Engineering assembling | 63 to 77 | 649,960 to 643,706 | 6.8 ms | 7.0 ms |
| Spring, Engineering at rest | 66 to 78 | 712,664 to 644,058 | 8.8 ms | 6.9 ms |
| Summer, Kensaku assembling | 62 to 71 | 651,940 to 675,778 | 6.6 ms | 6.8 ms |
| Summer, Kensaku at rest | 66 to 73 | 721,156 to 676,130 | 8.3 ms | 6.9 ms |
| Ring passage | 60 to 64 | 834,180 to 840,250 | 6.9 ms | 7.0 ms |
| Autumn, Explore at rest | 55 to 57 | 629,784 to 635,742 | 6.4 ms | 6.5 ms |

The two resting scenes are 1.4 to 1.9 ms cheaper per frame. Each crystal enclosure was a large, double-sided, blended surface in front of everything else, and it is gone. The exhibits have more parts, so draw calls rose by 7 to 14 where they are in view. The other scenes changed by 0.2 ms or less, which is within the variation between runs.

In a 390 by 844 touch viewport at a rendered ratio of 1.75, the resting scenes went from 2.9 to 2.2 ms (spring) and 2.6 to 2.2 ms (summer). That is viewport emulation on the M1 Pro's GPU, not a physical phone.

At pixel ratio 1 every scene in both builds holds the display's 6.9 ms interval.

### Whole laps

`tools/perf.mjs`, with the display's refresh in effect. Two laps down and one lap up.

| | Before | After |
| --- | --- | --- |
| Ratio 1: mean, 95th percentile | 6.9 ms, 8.2 to 8.3 ms | 6.9 ms, 8.2 to 8.3 ms |
| Ratio 1: frames over 33 ms in three laps | 0 | 0 |
| Rendered ratio 1.5: mean | 7.9 to 8.0 ms | 7.5 to 7.7 ms |
| Rendered ratio 1.5: 95th percentile | 9.9 to 10.3 ms | 9.3 to 10.0 ms |
| Rendered ratio 1.5: frames over 33 ms in three laps | 5 (34 to 42 ms) | 2 (both 34 ms) |
| Shader programs, geometries, textures | 47, 99, 29 | 50, 118, 30 |
| Requests | 15 | 15 |
| `exhibits.glb` | 2.10 MB | 1.85 MB |
| JavaScript heap after three laps | 43 MB | 45 MB |

In the baseline, two of the slow frames fell at 0.378 and 0.388, where Engineering's enclosure resolved. The new build has none there. The count of slow frames varies from run to run, so the difference of three is suggestive, not established.

Both builds show one long frame of 125 to 155 ms at the very start of the entrance.

## Checks

| Check | Result |
| --- | --- |
| `pnpm build`, `pnpm lint` | Pass |
| `tools/journey-test.mjs`, including dialogs, reduced motion, and the no-WebGL fallback | Pass |
| `tools/loop-test.mjs`: two laps down, the upward crossing, stop and reverse at the join | Pass |
| Resources stable across laps | 50 programs, 118 geometries, 30 textures before and after |
| Fallback images | Regenerated in `public/fallback/` |

## Evidence in this folder

| File | Shows |
| --- | --- |
| `engineering-*.jpg`, `kensaku-*.jpg` | The two resting views, desktop and phone size |
| `before-engineering.jpg`, `after-engineering.jpg` | Eight matched positions through Engineering's construction |
| `before-kensaku.jpg`, `after-kensaku.jpg` | Eight matched positions through Kensaku's construction |
| `before-phone.jpg`, `after-phone.jpg` | Eight of those positions in a 390 by 844 frame |
| `before-forms.jpg`, `after-forms.jpg` | The three particle forms at Explore |
| `construction-forward.jpg`, `construction-reverse.jpg` | Frames from a live scroll through both constructions, down and then back up |
| `cost.txt`, `perf.txt` | Raw measurements |

Recordings of two laps are written to `docs/journey/loop-desktop.webm` and `loop-phone.webm` by `node tools/record.mjs docs/journey`. They are not committed.

## Remaining limitations

- **The optics are authored.** The shafts and the lit line show a light path. They do not trace one, and the mirror's angle would not focus where the cone does.
- **The mirror is seen from behind.** It faces the lens, so from the resting camera its bronze back shows, not its polished face.
- **Reflections.** The water reflects the sky and a tone for the far shore. It does not reflect the instrument above it. Bronze and glass on the instrument reflect a summer sky made once at load, and bronze on the arbor reflects the winter one.
- **No cast shadows.** The exhibits cast no shadow on their crags. The ground under them is darkened by a bake that does not follow the sun.
- **Close ground.** When the camera passes within a few metres of a crag, its rock texture is magnified and soft.
- **Climber.** Its leaves are sprays on cards that face the camera, like the trees. At the resting distance a spray is about 40 pixels wide.
- **Copy.** The descriptions sit over the crags' turf and rock. They are legible in the captures. Contrast was judged by eye, not measured.
- **Pointer.** Moving the pointer now changes only the light and the camera's small parallax. Nothing on the exhibits turns toward it.
- **Motion.** Assembly, growth, and focus were reviewed as frames sampled from live scrolls in both directions, not watched.
