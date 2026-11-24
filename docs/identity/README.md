# Identity: 二人

The centerpiece of the site is the word 二人 (futari, "two people") as a stone sculpture. 二 stands on the left and 人 on the right. The same two outlines make the header mark, the favicon, and the first particle form of the final chapter.

## Decisions

- **Typeface.** Noto Sans JP Black. Its strokes are about 1 m thick at sculpture scale, which reads as stone. Source and license: `tools/assets/glyphs/SOURCE.md`.
- **Scale.** One em is 6.6 m. 人 stands 6.1 m tall and the pair is 14.3 m wide, close to the bridge it replaces, so the landscape and camera distances carry over.
- **Spacing.** The space between the characters is 0.3 em, about 2 m. That is wider than the font's own spacing because the visitor's path runs through it.
- **Grounding.** 人 stands 0.5 m deep in the snow. 二 sits 0.34 m higher than the font places it, so its lower stroke rests on the ground. The upper stroke of 二 hovers at its true height above the lower one.
- **Segmentation.** Ten blocks, chosen per stroke. The lower stroke of 二 is three blocks and the upper stroke two. 人 is cut where its two strokes part: a crown, two upper legs, and two feet. Every cut is tilted a few degrees.
- **Light.** One shard of light hangs between the characters and is the start of the guiding beam. A thin light shows inside the joints of the hovering stroke of 二 and the upper joints of 人. The bake marks where joints are, and the landmark sets how bright they are.
- **Passage.** The camera passes between the characters. Each character slides 0.8 m aside as a whole, so neither shape breaks.
- **Camera.** The opening view is closer to head-on than the bridge view was (14 degrees off axis instead of 19), because the characters must read first.
- **Particles.** The first particle form samples only the front and back faces of the sculpture and flattens the depth, so the strokes stay crisp at the phone's lower particle count.
- **Marks.** The header mark and favicon are the exact vector outlines, with no weathering.

ふたり is not used. Geist has no Japanese glyphs, so it would need a second set of outlines, and the sculpture and the mark already carry the identity.

## Measured change

Headed Chrome 158, Apple M1 Pro, 1440 by 900, device pixel ratio 1. Frame intervals are the time between animation frames as seen by the page.

| | Bridge | 二人 |
| --- | --- | --- |
| Landmark blocks | 24 | 10 |
| Landmark triangles | 290,692 | 142,872 |
| Landmark file | 1.85 MB | 0.95 MB |
| Mesh cell size | 62 mm | 50 mm |
| Opening at rest: draw calls | 53 | 39 |
| Opening at rest: triangles per frame | 634,574 | 486,750 |
| Opening at rest: mean frame interval | 6.9 ms | 7.0 ms |
| Whole journey: frames over 33 ms | 0 | 0 |

Raw output: `before/perf-bridge.txt` and `perf-futari.txt`.

## Evidence in this folder

| File | Shows |
| --- | --- |
| `before/` | The bridge hero and particle form, for comparison |
| `hero-desktop.jpg`, `hero-phone.jpg` | The resting composition |
| `entrance-and-pointer.jpg` | The entrance sampled over time, then the pointer on each character |
| `passage-forward.jpg`, `passage-reverse.jpg` | Frames from a live scroll through the first transition, both ways |
| `particles-desktop.jpg`, `particles-phone.jpg` | The closing 二人 particle form |
