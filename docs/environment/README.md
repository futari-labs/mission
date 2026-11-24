# Environment

The whole journey now happens in one winter landscape above a sea of clouds. The opening keeps its own grounded terrain. Everything after it is suspended above a cloud-filled valley with distant ridges still in view.

## Layers, far to near

| Layer | What it is |
| --- | --- |
| Sky | One colour function of direction: cool blue-grey overhead, a paler horizon with a little ivory, a broad soft light ahead and to the right, a deeper tone below the horizon. The change happens low in the sky, inside the band a level camera sees. |
| Ridges | Three bands of snow ridges at 360 m, 640 m, and 1,020 m from the middle of the journey, each taller and fainter than the one in front. Their feet dissolve into the cloud. |
| Cloud sea | Two decks 20 m and 42 m below the line of travel. Nearby the upper deck is broken, so the lower one shows through and moves more slowly. Toward the horizon it closes into a continuous sea. |
| Cloud banks | 16 soft mounds (9 on touch devices) rising out of the sea toward the sides, so the horizon is never one straight edge. |
| Snow | Sparse snow in a box that wraps around the camera, thinned toward the middle of the frame. It yields to the opening's own snow while that is on screen. |

## Decisions

- **Separate from the opening's terrain.** The opening's terrain is composed for one view and its mountains stand where the later chapters are, so it stays hidden after the opening. The environment is its own module, `src/scene/environment.ts`, and is never hidden.
- **A valley along the direction of travel.** The ridges leave a gap straight ahead, with the main massifs about 25 degrees to either side. Both project headings and the Explore heading fall in that gap, and the ring passage leads into it.
- **One sky function for everything.** Fog, ridges, cloud decks, and cloud banks all fade to the same `futariSky` colour for their direction, so anything far away dissolves into exactly the sky behind it.
- **Authored haze, not scene fog.** Each ridge band fades by a fixed amount (0.2, 0.4, 0.6). The scene fog changes along the journey, and at these distances it would erase the ridges.
- **Thinner fog between the exhibits.** Fog density there went from 0.026 to 0.015. The exhibits are crisper, and the next structure is faintly visible at depth before the camera reaches it.
- **Far cloud takes the horizon's colour.** That removes a dividing line where the sea meets the sky.

## The return and the loop

When the return begins, the camera and the installation are drawn 260 m further along z. The environment moves with them, so no ridge or cloud bank jumps. In the thick snow of the middle of the return every environment layer fades fully into the sky, moves back to its own place while hidden, and comes out again with the opening landscape. At the lap boundary the environment is in the same place on both sides. Its drift runs on the ambient clock, which does not reset.

Under reduced motion the layers are present and still.

## Measured cost

Headed Chrome 158, Apple M1 Pro, 1440 by 900. Frame intervals are the time between animation frames as seen by the page.

At device pixel ratio 1, two laps down and one lap up:

| | Before | After |
| --- | --- | --- |
| Mean frame interval | 6.9 ms | 6.9 ms |
| 95th percentile | 8.3 ms | 8.4 ms |
| Frames over 33 ms | 0 | 0 |
| Draw calls, opening at rest | 39 | 46 |
| Triangles, opening at rest | 486,750 | 507,038 |
| Shader programs | 33 | 41 |

At a retina pixel ratio (capped at 1.5), measured back to back in one session:

| | Before | After |
| --- | --- | --- |
| Opening at rest, mean | 14.2 ms | 12.6 ms |
| One lap down, mean | 8.7 ms | 8.6 ms |
| One lap down, 95th percentile | 13.7 ms | 12.5 ms |
| One lap down, frames over 33 ms | 6 | 4 |

The retina numbers were taken on a machine that was running slower than in earlier sessions, so compare the two columns with each other and not with older reports. The difference between them is within run-to-run variation.

The first version of the clouds used 44 banks and three texture reads per deck. At retina resolution that pushed a lap's 95th percentile to 16.5 ms. The current version uses 16 banks and two reads.

Raw output: `before/perf.txt` and `perf.txt`.

## Evidence in this folder

| File | Shows |
| --- | --- |
| `before/desktop.jpg`, `after-desktop.jpg` | Twelve matched positions around the lap |
| `before/phone.jpg`, `after-phone.jpg` | The same positions at phone size |
| `return-forward.jpg`, `return-reverse.jpg` | Frames from a live scroll through the return, both ways |
