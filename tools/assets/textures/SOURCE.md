# Surface textures

The photographed surfaces of the seasonal banks and the bark of the trees come from Poly Haven. Every Poly Haven asset is released under CC0 1.0, which allows any use without attribution. The sources are recorded here so that each one can be found again.

| Layer | Use | Asset | Authors | Page |
| --- | --- | --- | --- | --- |
| 0 | Rock faces and ledges | Cliff Side | James Ray Cock, Jenelle van Heerden, Dario Barresi | https://polyhaven.com/a/cliff_side |
| 1 | Turf | Grass Ground | Charlotte Baglioni | https://polyhaven.com/a/grass_ground |
| 2 | Soil | Forest Floor | eye-candy.xyz | https://polyhaven.com/a/forest_floor |
| 3 | Fallen leaves | Dry Decay Leaves | Amal Kumar | https://polyhaven.com/a/dry_decay_leaves |
| 4 | Bark | Sakura Bark | Charlotte Baglioni | https://polyhaven.com/a/sakura_bark |

Licence: https://creativecommons.org/publicdomain/zero/1.0/

## What the site uses

`fetch.mjs` downloads the 1k JPEG colour map and OpenGL normal map of each asset, resizes them to 512 pixels, and stacks them into two files:

- `public/assets/land-albedo.jpg`: colour, one square layer per row of the table.
- `public/assets/land-normal.jpg`: normals, in the same order.

The app cuts each file into a texture array. The shaders keep each photograph's detail and local hue and replace its average colour with the colour the season asks for, so the same five photographs serve spring, summer, and autumn.

The downloads are cached in `tools/assets/textures/cache/`, which is not committed. The two packed files are committed, so `pnpm assets:build` needs no network.

## What is not sourced

The trees are not downloaded models. `tools/assets/trees.ts` grows each species' branch structure, and `tools/assets/foliage.ts` draws the atlas of leaf sprays, blossom, and grass used on their cards. Both are original to this repository.
