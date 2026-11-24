# Four seasons

One lap of the journey is one year. The lab is winter, Futari Engineering is spring, Kensaku is summer, Explore is autumn, and the return carries autumn back to winter.

## One season value

`season` runs from 0 (winter) through 1, 2, and 3 to 4, which is winter again. `stateAt` in `src/scene/journey.ts` derives it from the journey position: each chapter rests in one season, and each move between chapters carries the year forward. Stopping holds it and reversing turns it back.

`look.seasons` in `src/scene/look.ts` has one entry per season. The environment blends between neighbouring entries, so everything seasonal moves together:

| Control | Winter | Spring | Summer | Autumn |
| --- | --- | --- | --- | --- |
| Sky and fog colour | cool grey | pale, soft | bluer | warm, soft |
| Haze between the exhibits | 1 | 1.08 | 0.6 | 0.92 |
| Key light | cold, diffuse | soft, warm-white | brightest | warm |
| Sun height above the horizon | 41° | 41° | 58° | 22° |
| Snow line | everywhere | above 112 m | above 172 m | above 190 m |
| Growth on the lower slopes | none | fresh green | full green | amber and rust, more bare ground |
| Tree canopies | none | about half out, cherries in blossom | full | turned, about half fallen |
| Fallen leaves on the ground | none | none | a trace | under the trees and in the gullies |
| In the air | snow | a few petals | almost nothing | leaves |
| Cloud tops | as before | a little brighter | tall and white | softer |

The sky colour is the fog colour, and ridges, clouds, hills, and trees all fade to the same sky function, so the whole frame changes season together.

## Geography

The geography is the same all year and reuses the environment from the last pass: three ridge bands with a valley along the direction of travel, and the cloud sea. Two things are new.

- **Banks.** Eight summits rise out of the cloud to either side of the line of travel. One stands close to each resting view, on the side away from that chapter's heading.
- **Trees.** Cherry, maple, birch, and shrubs stand in groves on the banks. Each plant leafs at its own pace, so a season arrives across a hillside and not all at once.

`docs/environment-realism/README.md` describes how the banks and trees are built and shaded. They replaced the first version, which used terraced mounds and a single rounded canopy per tree.

Banks and trees belong to the growing seasons. In winter the opening's own terrain stands where they are, so they fade into the sky and stop being drawn. They are loaded and compiled offscreen with the later chapters.

One pool of 1,000 points (450 on touch devices) is the snow, the petals, and the leaves. Only its colour, size, shape, and amount change. Petals and leaves are kept to the sides and the lower frame.

## Transitions

- **Winter to spring** happens on the way to Engineering, mostly under the existing white-out, so the green world is revealed as the view clears.
- **Spring to summer** is the short move to Kensaku: blossom fades, canopies fill, haze thins, the sky turns bluer.
- **Summer to autumn** is the ring passage: foliage turns behind the rings, the light warms, and the sun drops from 58° to 22° above the horizon.
- **Autumn to winter** is the return. The environment moves with the installation, hides in the thick snow, and the season reaches winter before the opening landscape is clear.

The particle forms are untouched. Leaves, petals, and snow are a separate pool and never join or replace a form.

## Measured cost

Headed Chrome 158, Apple M1 Pro, 1440 by 900, device pixel ratio 1. Two laps down and one lap up. Frame intervals are the time between animation frames as seen by the page.

| | Winter-only environment | Four seasons |
| --- | --- | --- |
| Mean frame interval | 6.9 ms | 6.9 ms |
| 95th percentile | 8.4 ms | 8.4 ms |
| Frames over 33 ms | 0 | 0 |
| Shader programs | 41 | 44 |
| Geometries | 75 | 77 |
| Draw calls, opening at rest | 46 | 46 |

Raw output: `before/perf.txt` and `perf.txt`. This pass was not re-measured at a retina pixel ratio. The captures in this folder were refreshed after the vegetation and terrain pass, whose measurements, including retina and phone-sized frames, are in `docs/environment-realism/README.md`.

## Evidence in this folder

| File | Shows |
| --- | --- |
| `winter-*.jpg`, `spring-*.jpg`, `summer-*.jpg`, `autumn-*.jpg` | The four resting scenes, desktop and phone |
| `before/desktop.jpg`, `after-desktop.jpg`, `after-phone.jpg` | Twelve matched positions around the lap |
| `year-forward.jpg` | Frames from a live scroll through one whole lap |
| `return-reverse.jpg` | Frames from a live scroll backward through the return, winter to autumn |
