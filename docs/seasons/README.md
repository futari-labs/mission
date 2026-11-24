# Four seasons

One lap of the journey is one year. The lab is winter, Futari Engineering is spring, Kensaku is summer, Explore is autumn, and the return carries autumn back to winter.

## One season value

`season` runs from 0 (winter) through 1, 2, and 3 to 4, which is winter again. `stateAt` in `src/scene/journey.ts` derives it from the journey position: each chapter rests in one season, and each move between chapters carries the year forward. Stopping holds it and reversing turns it back.

`look.seasons` in `src/scene/look.ts` has one entry per season. The environment blends between neighbouring entries, so everything seasonal moves together:

| Control | Winter | Spring | Summer | Autumn |
| --- | --- | --- | --- | --- |
| Sky and fog colour | cool grey | pale, soft | bluer | warm, soft |
| Haze between the exhibits | 1 | 1.08 | 0.6 | 0.92 |
| Key light | cold, diffuse | soft, warm-white | brightest | lower and warm |
| Snow line | everywhere | above 112 m | above 172 m | above 190 m |
| Growth on the lower slopes | none | fresh green | full green | amber and rust, more bare ground |
| Tree canopies | none | filling in, a third in blossom | full | turned and thinner |
| In the air | snow | a few petals | almost nothing | leaves |
| Cloud tops | as before | a little brighter | tall and white | softer |

The sky colour is the fog colour, and ridges, clouds, hills, and trees all fade to the same sky function, so the whole frame changes season together.

## Geography

The geography is the same all year and reuses the environment from the last pass: three ridge bands with a valley along the direction of travel, and the cloud sea. Two things are new.

- **Hills.** Six terraced hills rise out of the cloud near the line of travel, placed to the side of each exhibit that is opposite its heading.
- **Trees.** 96 trees in loose groves on those hills (54 on touch devices), drawn as one instanced mesh. Each tree fills out at its own pace, so a season arrives across a hillside and not all at once.

Hills and trees belong to the growing seasons. In winter the opening's own terrain stands where they are, so they fade into the sky and stop being drawn. They are compiled offscreen at load with the later chapters.

One pool of 1,000 points (450 on touch devices) is the snow, the petals, and the leaves. Only its colour, size, shape, and amount change. Petals and leaves are kept to the sides and the lower frame.

## Transitions

- **Winter to spring** happens on the way to Engineering, mostly under the existing white-out, so the green world is revealed as the view clears.
- **Spring to summer** is the short move to Kensaku: blossom fades, canopies fill, haze thins, the sky turns bluer.
- **Summer to autumn** is the ring passage: foliage turns behind the rings and the light warms and lowers.
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

Raw output: `before/perf.txt` and `perf.txt`. This pass was not re-measured at a retina pixel ratio.

## Evidence in this folder

| File | Shows |
| --- | --- |
| `winter-*.jpg`, `spring-*.jpg`, `summer-*.jpg`, `autumn-*.jpg` | The four resting scenes, desktop and phone |
| `before/desktop.jpg`, `after-desktop.jpg`, `after-phone.jpg` | Twelve matched positions around the lap |
| `year-forward.jpg` | Frames from a live scroll through one whole lap |
| `return-reverse.jpg` | Frames from a live scroll backward through the return, winter to autumn |
