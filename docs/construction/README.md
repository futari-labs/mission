# Construction and the ring passage

> The two exhibits described here were redesigned. Engineering is now a timber arbor that a climber grows through, Kensaku an open optical instrument over a basin of water, and neither has a crystal enclosure. See `docs/exhibits/README.md`. How parts move between two authored poses, the ring passage, and the return are as described below.

The world builds itself as the visitor scrolls, and the camera travels through what has been built.

## What changed

- **Engineering builds on the approach.** The sculpture is 11 rigid parts. The two foundation plates rise, the four posts descend and seat one after another, the three levels are lowered between the posts, and the last two beams close the top. The light comes into focus as the last beam seats, and only then does the crystal resolve around it.
- **Kensaku aligns.** Ten parts, in a shorter sequence: base, stand, and rack seat, then four result plates slide in from alternate sides and square up on the line of the light, then three arcs converge into the ring.
- **Three rings.** Beyond Kensaku, three stone rings stand on the line of the guiding light, 15 m apart. Each is eight copies of one segment. The segments start scattered around the ring's place and move in as the camera approaches, the nearest ring first. The camera passes through the middle of each.
- **The return is unchanged.** Explore, the particle-to-snow return, the one-time entrance, and the loop join are as before.

The lap is 1.28 journey units, up from 1.16, about 10 percent more scrolling.

## Design decisions

- **Two poses per part.** The asset build writes each part's seated pose and an authored start pose: an offset, a turn, and the slice of the assembly in which it moves. The runtime places every part between the two from the scroll position. Nothing accumulates, so stopping holds a half-built state, reversing takes it apart, and every lap is the same.
- **Levels fit between the posts.** The levels are 1.44 m wide and the posts stand 1.64 m apart, so a level can be lowered into the frame without passing through a post.
- **Turns resolve before arrival.** A part finishes turning a little before it lands, so it seats square and reads as heavy.
- **Shading follows the part.** Each part carries two occlusion bakes: alone, and with the whole sculpture in place. The shader blends them by how far the part is from its seat, so no neighbour's shadow stays on a part that has moved away.
- **The enclosure comes last.** The crystal fades in from its edges after the last part seats, so it never hides the construction.
- **Rings close ahead of the camera.** A ring's assembly is a function of the camera's distance to it. It starts 36 m out and is closed 7 m before the camera arrives, so nothing moves across the opening in use. At that moment the next ring is about 40 percent assembled and the third has barely started.
- **Light marks the connection.** When a ring closes, light shows on the end faces where segments meet and along the rim.
- **Rings stay hidden at rest.** They are veiled in fog while Kensaku is at rest and emerge when the visitor scrolls on.
- **No frost wipe in the passage.** The rings are the event there.
- **Room for the passage.** The installation stands 25 m further back, so all three rings fit between Kensaku and Explore and are behind the camera at Explore's rest.

Under reduced motion the camera only stands at chapter rests, where everything is complete, and the rings never show.

## Measured cost

Headed Chrome 158, Apple M1 Pro, 1440 by 900, device pixel ratio 1. Frame intervals are the time between animation frames as seen by the page.

| | Before | After |
| --- | --- | --- |
| Two laps down, one lap up: mean frame interval | 6.9 ms | 6.9 ms |
| Same: 95th percentile | 8.3 ms | 8.3 ms |
| Same: frames over 33 ms | 0 | 0 |
| Shader programs | 32 | 33 |
| Geometries | 45 | 68 |
| Exhibits file | 1.87 MB | 2.10 MB |
| Requests over three laps | 11 | 11 |

The one new shader program is the instanced variant of the stone shader for the rings. It is warmed with the later chapters, and the count does not change during scrolling.

| Stage | Draw calls | Triangles |
| --- | --- | --- |
| Opening at rest | 39 | 486,750 |
| Engineering, half built | 32 | 95,194 |
| Engineering at rest | 35 | 157,898 |
| Kensaku at rest | 35 | 166,390 |
| Ring passage | 29 | 279,414 |
| Explore at rest | 24 | 75,018 |

Each ring is one instanced draw call. The ring segment was first meshed at 15,220 triangles, which put the passage at 441,462. It is now 8,468.

Raw output: `before/perf.txt` and `perf.txt`.

## Evidence in this folder

| File | Shows |
| --- | --- |
| `engineering-build.jpg`, `engineering-phone.jpg` | Frames from a live scroll through Engineering's construction |
| `kensaku-build.jpg` | Frames from a live scroll through Kensaku's alignment |
| `passage-desktop.jpg`, `passage-phone.jpg` | The ring passage, forward |
| `passage-reverse.jpg` | The ring passage, scrolling back |
| `before/lap.jpg` | One lap before this change |

Recordings are in `docs/journey/`: `loop-desktop.webm` and `loop-phone.webm` are more than two laps scrolling down only, and `study-desktop.webm` is slow, pausing and reversing halfway through each construction and inside the passage.
