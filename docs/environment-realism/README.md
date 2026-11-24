# Vegetation and near terrain

This pass replaced the trees and the nearby hills of the growing seasons. The seasonal direction, the journey, and the winter opening are unchanged. The baseline is commit `2345a43`, tagged `seasons-baseline`.

The evidence here is stills, frames sampled from live scrolls, and logged measurements. Nobody watched the result in motion, on a physical phone, or in a browser other than Chrome.

## What changed

| | Before | After |
| --- | --- | --- |
| Trees | One perturbed icosahedron on a five-sided cylinder | Three species and a shrub, grown as branching skeletons with bark, leaf clusters, and blossom |
| Seasonal change | The crown scales and changes colour | Leaf clusters appear and fall one by one on fixed branches. Blossom is strung along the branches |
| Nearby hills | Six stepped mounds, 1,120 quads each, coloured by one noise blend | Eight banks sampled from one height function, textured from photographed rock, turf, soil, and leaf litter |
| Light on them | A fixed direction written into each shader | The season's sun, sky, and bounce light, shared with the scene's lamps |
| Tree normals | Left in object space | Transformed through each instance's rotation and scale |
| Grounding | None | Shade under each crown and in each hollow, baked into the ground |
| Sun height | Fixed | 41° in winter and spring, 58° in summer, 22° in autumn |

## Trees

`tools/assets/trees.ts` grows each species from a short description of how each order of branching behaves: how many shoots leave the parent, at what angle, how long, how much they wander, and whether they reach up or droop.

| Species | Shape | Where it shows |
| --- | --- | --- |
| Cherry | Forks low and spreads into a flat crown | Every cherry blossoms in spring |
| Maple | Heavy limbs and a broad, broken crown | Carries most of the autumn colour |
| Birch | One tall leaning leader, pale bark, an open crown | Stays airy at full leaf |
| Shrub | Many stems from the ground | Rims, benches, and the lee of rocks |

The wood is tapering tubes with bark coordinates. The trunk swells unevenly into roots at its foot, and it starts 0.45 m below the surface, so a tree on a slope has no gap under it.

Leaves and blossom are cards: four vertices at the centre of a cluster, pushed out to the corners in the vertex shader so the card faces the camera. Each card carries the order in which it appears and falls. That is what makes the seasonal change structural:

- **Spring.** About half the clusters are out, starting at the twig ends. Blossom clusters sit along the branches. A tree in blossom holds its leaves back until the petals fall.
- **Summer.** Every cluster is out and they overlap. Clusters deep in the crown are darker, and the gaps between limbs stay open.
- **Autumn.** About half the clusters have fallen, the inside of the crown first, so the branches show. Leaf colour varies by tree, by cluster, and by leaf, between amber, copper, muted red, and the green that remains. Fallen leaves gather on the ground under the crowns and in the gullies.

Branches and placement never change. Only coverage and colour follow the season value, so stopping holds a tree as it is and reversing puts its leaves back.

`tools/assets/foliage.ts` draws the atlas the cards use: shoots of small leaves, bunches of five-petalled flowers, and a grass tuft that is drawn but not yet placed. It stores shape and lightness only. The season supplies the colour.

Each species has two meshes. There are 133 plants: 57 within 70 m of the line of travel use the detailed mesh, and 76 use a mesh with fewer sides, no twigs, and fewer, larger cards. A touch device draws 89 plants, all with the simpler mesh. The choice is made once at build time from where the plant stands, so nothing switches while the camera moves.

## Banks

`bankGround` in `tools/assets/landscape.ts` is the only description of the ground. The meshes are sampled from it and every plant is placed on it.

A bank is a summit standing out of the cloud: a rolling top, benches that follow the contours, broken ledges, gullies that run down the fall line, and knuckles of rock around the shoulder. The shoulder that faces the line of travel always has a bench, which is where the camera can see a grove.

The surface is chosen per pixel from slope and from what the build baked into each vertex:

- **Rock** where the ground is steep or an outcrop pushes through. It is projected from the sides, so its beds lie level across a face.
- **Soil** in the gullies, at the edge of the rock, and in worn patches.
- **Turf** on the rest, sampled at two sizes so the photograph does not repeat across a hillside.
- **Leaf litter** under the crowns and in hollows, in autumn.

The shaders keep each photograph's detail and replace its average colour with the colour the season asks for. Rock stays a neutral grey beside the stone sculptures, and the season's light tints it.

The four banks nearest the camera use a 0.6 to 0.75 m grid. The four further off use 1.2 to 1.6 m. The three distant ridge bands keep their coarse meshes. They gained two noise reads that break up their flat facets.

## Composition

One bank stands close to each resting view, on the side away from that chapter's heading. At rest the nearest trees are about 60 to 90 m away, and roughly 150 to 300 pixels tall on a 1440 by 900 frame.

The build tests every candidate plant against the journey's own camera (`poseAt`) at eleven positions. It rejects a plant whose crown would fall behind an exhibit while it assembles or rests, behind the particle form, behind a chapter's heading or description, or in the opening of the rings, unless it is more than 200 m away. `node tools/assets/where.ts` prints where each bank falls in the frame at any position.

## Light, haze, and grounding

The environment computes one light per frame from the season: sun direction, sun colour and strength, sky colour, and bounce colour. The banks, bark, and leaves use it, and the scene's own key light is set to the same direction and colour, so stone and vegetation agree.

- Leaves are lit with a wrapped term, so the side away from the sun is not black. A crown seen toward the sun gains a little transmitted light.
- Each cluster is shaded as part of one rounded crown and as a small rounded mass of its own.
- Bark and ground use the normal maps of their photographs. Touch devices skip those reads.
- Everything fades toward the shared sky function with distance. The amount follows the season's haze, so spring is soft and summer is clear.

There are no dynamic shadows on the vegetation. The existing shadow map covers a 30 m region around the opening and is redrawn only when a block of the landmark moves. Extending it to the seasonal stations would mean a second shadow pass over several hundred thousand triangles. The ground instead carries baked shade: darker under each crown, and darker in hollows. It does not move with the sun.

The sun now changes height with the season. It returns to its winter direction within the first quarter of the autumn-to-winter leg, before the opening comes back into view, so the opening's shadow map stays true.

## The return

The banks and plants are children of the environment group, so they move 285 m with it when the return begins, fade fully into the sky with it, and come back with it. Every new shader applies the same veil.

Surface patterns are sampled in the group's own coordinates (world position less `uShift`). This pass found that the earlier layers were not: the cloud pattern, the ridges' growth patches, and the falling leaves were sampled in world space, so they changed on the first frame of the return. `before-return-start.jpg` shows the cloud changing between two positions 0.001 apart. `after-return-start.jpg` shows the same two positions now matching.

The banks fade out as growth falls below 0.3 and stop being drawn below 0.1. In both directions that happens under the first white-out or under the return's veil.

One defect appeared and was fixed during this pass. Leaf edges are resolved by multisample coverage, which needs the card's alpha. That alpha was also being written into the frame, and a later pass treated those pixels differently, which left a faint outline of the trees inside the return's veil and made foliage look pale. The cards no longer write alpha.

## Loading and resources

| File | Size | Holds |
| --- | --- | --- |
| `landscape.glb` | 1.2 MB | Eight banks, two meshes for each of four species, and every plant's position |
| `land-albedo.jpg` | 0.2 MB | Colour of rock, turf, soil, leaf litter, and bark |
| `land-normal.jpg` | 0.4 MB | Their normal maps |
| `foliage.png` | 0.2 MB | Leaf, blossom, and grass shapes |

They load with the later chapters, behind the opening, and are drawn once into the offscreen warm-up frame. Requests went from 11 to 15. Across two laps the page holds 47 shader programs, 99 geometries, and 29 textures, with no change from the first lap to the second.

## Asset provenance

- **Surface photographs:** five Poly Haven textures, all CC0 1.0. `tools/assets/textures/SOURCE.md` lists each asset, its authors, and its page.
- **Tree geometry and the foliage atlas:** generated by code in this repository. No tree model was downloaded.
- **Blender** is not installed on this machine and was not used.

## Measured cost

Headed Chrome 158, Apple M1 Pro, 1440 by 900 unless noted. Both builds were measured in the same session. Frame intervals are the time between animation frames as seen by the page, not GPU time.

### Cost of each scene

`tools/scene-cost.mjs` holds the scene still at each position and samples it there. Triangles and draw calls are what that scene draws, not an end-of-lap snapshot.

| Scene | Draw calls, before to after | Triangles, before to after |
| --- | --- | --- |
| Winter, opening | 46 to 46 | 507,038 to 507,038 |
| Spring, Engineering assembling | 41 to 63 | 131,802 to 649,960 |
| Spring, Engineering at rest | 44 to 66 | 194,506 to 712,664 |
| Summer, Kensaku assembling | 40 to 62 | 133,782 to 651,940 |
| Summer, Kensaku at rest | 44 to 66 | 202,998 to 721,156 |
| Ring passage | 38 to 60 | 316,022 to 834,180 |
| Autumn, Explore at rest | 33 to 55 | 111,626 to 629,784 |

The vegetation and banks add 22 draw calls and about 518,000 triangles wherever they are drawn. The ring passage is the heaviest scene of the lap at 834,180 triangles. On a touch device they add 14 draw calls and about 252,000 triangles.

At device pixel ratio 1 every scene in both builds holds the display's 6.9 ms interval, so that setting cannot show a difference. The comparison below uses a requested ratio of 2, which the site caps at a rendered ratio of 1.5, and runs Chrome without waiting for the display, so an interval shows what a frame costs.

| Scene, rendered ratio 1.5, uncapped | Before, mean | After, mean | Before, 95th | After, 95th |
| --- | --- | --- | --- | --- |
| Winter, opening | 8.8 ms | 8.8 ms | 9.7 ms | 9.7 ms |
| Spring, Engineering assembling | 5.6 ms | 6.9 ms | 8.2 ms | 8.7 ms |
| Spring, Engineering at rest | 7.5 ms | 8.9 ms | 8.5 ms | 9.8 ms |
| Summer, Kensaku assembling | 5.4 ms | 6.6 ms | 6.2 ms | 7.4 ms |
| Summer, Kensaku at rest | 7.1 ms | 8.4 ms | 8.2 ms | 9.4 ms |
| Ring passage | 5.8 ms | 6.9 ms | 7.8 ms | 8.4 ms |
| Autumn, Explore at rest | 5.8 ms | 6.5 ms | 7.0 ms | 7.2 ms |

The seasonal scenes cost 0.7 to 1.4 ms more per frame. The heaviest of them now costs about what the opening already did.

The same comparison in a 390 by 844 touch viewport, requested ratio 3 and rendered ratio 1.75, shows 0 to 0.3 ms more per frame (for example spring at rest, 2.6 to 2.9 ms). That is viewport emulation on the M1 Pro's GPU. It shows the reduced plant count and simpler shading are in effect. It does not predict a phone's frame rate.

### Whole laps

`tools/perf.mjs`, with the display's refresh in effect. Two laps down and one lap up.

| | Before | After |
| --- | --- | --- |
| Ratio 1: mean, 95th percentile | 6.9 ms, 8.2 to 8.3 ms | 6.9 to 7.0 ms, 8.2 to 8.3 ms |
| Ratio 1: frames over 33 ms in three laps | 0 | 1 (38 ms, late in the return) |
| Rendered ratio 1.5: mean, 95th percentile | 7.6 ms, 9.4 to 9.6 ms | 7.9 to 8.0 ms, 10.0 to 10.1 ms |
| Rendered ratio 1.5: frames over 33 ms in three laps | 2 (34 and 35 ms) | 4 (34 to 40 ms) |
| Shader programs, geometries, textures | 44, 77, 26 | 47, 99, 29 |
| Requests | 11 | 15 |
| JavaScript heap after three laps | 29 MB | 44 MB |

The slow frames are single frames in both builds. At ratio 1.5 the new build had them where an enclosure first appears (positions 0.378 and 0.625) and at 0.495, where the baseline also had one. Their count varies from run to run: an earlier run of the same builds had one each.

`perf.txt` also holds the shimmer proxy for both builds: no pixel changed by more than 15 percent between frames a fraction of a pixel apart, in either build.

## Checks

| Check | Result |
| --- | --- |
| `pnpm build`, `pnpm lint` | Pass |
| `tools/journey-test.mjs`, including reduced motion and the no-WebGL fallback | Pass |
| `tools/loop-test.mjs`: two laps down, the upward crossing, stop and reverse at the join, reload and resize in the return | Pass |
| Resources stable across laps | 47 programs, 99 geometries, 29 textures before and after |
| Fallback images | Regenerated in `public/fallback/` |

The loop test caught one problem, now fixed: banks outside the warm-up camera's view were culled from the warm-up frame, so one reached the GPU mid-lap. The banks are no longer culled.

## Evidence in this folder

| File | Shows |
| --- | --- |
| `spring-*.jpg`, `summer-*.jpg`, `autumn-*.jpg` | The three resting views, desktop and phone size |
| `before-desktop.jpg`, `after-desktop.jpg` | Eight matched positions around the lap |
| `before-phone.jpg`, `after-phone.jpg` | The same positions in a 390 by 844 frame |
| `transitions.jpg` | Eighteen positions held partway through each seasonal change |
| `year-forward.jpg` | Frames from a live scroll through one whole lap |
| `return-reverse.jpg` | Frames from a live scroll backward through the return |
| `before-return-start.jpg`, `after-return-start.jpg` | Either side of the return's coordinate shift |
| `before-cost.txt`, `cost.txt`, `perf.txt` | Raw measurements |

Recordings of two laps are written to `docs/journey/loop-desktop.webm` and `loop-phone.webm` by `node tools/record.mjs docs/journey`. They are not committed.

## Remaining limitations

- **Phone frame.** A 390 by 844 frame is narrower than the space the exhibits leave on desktop, so the near groves fall outside it. Spring and summer show a bank and small distant trees. Autumn shows no trees. On a phone the season still reads mainly from sky, light, ridges, and what is in the air. The phone views are viewport emulation on a desktop GPU, not a physical phone.
- **Shadows.** Shade under the trees is baked and does not follow the sun. Trees cast no shadow on each other or on the rock faces.
- **Leaf detail.** At 60 to 90 m a cluster is 20 to 40 pixels wide. Clusters read as sprays of leaves, not as individual leaves, except on the nearest autumn trees.
- **Far ridges.** The three ridge bands are still coarse meshes with a simple colour blend. Beside the new banks their flat shading is more noticeable, most of all the green ridge behind Engineering.
- **Banks behind exhibits.** From the Engineering and Kensaku rests, a distant bank sits behind the enclosure at 130 to 190 m. It is hazed, and no crown nearer than 200 m stands there, but the view is not empty sky.
- **Copy over rock.** The two project descriptions sit over textured rock. They are legible in the captures. Contrast was judged by eye, not measured.
- **Motion.** Shimmer was checked with a proxy that compares frames a fraction of a pixel apart (`tools/shimmer-check.mjs`), not by watching. It found no sharply changing pixels in either build.
- **Ground cover.** There are shrubs but no grass blades or small stones standing off the surface.
- **Winter.** The opening's terrain was not touched.
