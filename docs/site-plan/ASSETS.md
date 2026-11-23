# Asset production

This document records which asset tools exist on the development machine, what the feasibility prototype showed, and how each asset gets made.

## Tools found on 2026-11-23

Machine: Apple M1 Pro, 16 GB, macOS, Node.js 22.20.0, pnpm 10.22.0.

| Tool | Status | Note |
| --- | --- | --- |
| Google Chrome 157 with Playwright | Present | Headless Chrome renders WebGL 2 on the GPU through Metal. Verified by loading the reference and the prototype. |
| Playwright browser cache | Present | Chromium, WebKit, and Playwright's own ffmpeg build for video recording. |
| `cwebp`, `sips` | Present | Image conversion. |
| Blender | Not installed | Blender 4.5.16 LTS was downloaded to a scratch folder and its checksum matched the published value. `Blender -b --version` ran. The session's permission check blocked the modeling script, so no Blender output exists. |
| `ffmpeg`, ImageMagick | Not installed | Not required. Playwright records video and builds contact sheets. |
| `gltf-transform`, `gltfpack`, `toktx`, `basisu` | Not installed | `@gltf-transform/core` 4.5.1, `meshoptimizer` 1.3.0, and `ktx2-encoder` 0.6.0 are available from npm and need no system install. Their use here is untested. |

## Feasibility prototype

The prototype is in `docs/site-plan/spike/`. It is throwaway code and no part of it ships.

Question: can a deterministic script with no modeling application produce the bridge, render it in a real browser, and let an agent inspect the result?

What ran:

1. `bridge-v1-arch.js` and `bridge-v2-cantilever.js` generate the bridge as separate beveled blocks with three.js 0.187.0, plus a noise terrain.
2. `run.mjs` renders five views in headless Chrome and saves screenshots.

Results:

| Check | Result |
| --- | --- |
| Script to screenshot loop | Works. One command produces five views in under 10 s. |
| Geometry | V2 has 21 separate blocks and 6,888 triangles. Each block is its own mesh, as the entrance and pointer response need. |
| Silhouette at 160 px | V1 reads as one arch. V2 reads as two forms and a lit gap. See `CREATIVE_DIRECTION.md`. |
| Surface quality | Not acceptable. Faces are flat, joints carry no occlusion, and the terrain has no features. |
| Seam light | Visible, with no spill onto nearby stone. |

Conclusion: generating geometry in TypeScript is proven. The distance to the reference is in baked surface detail and lighting, not in geometry. The plan therefore puts a baking step in the asset pipeline and reviews surface quality at the first milestone.

Not proven: baked occlusion, edge wear, KTX2 encoding, mesh compression, and transmission on the enclosures. PR 3 and PR 7 test each of these and record the numbers.

## Production route

All generators are TypeScript scripts under `tools/assets/`. They run in Node.js with a fixed seed. Every export is committed, so a build or a CI run never needs a modeling tool.

| Asset | Route | Editable source | Export |
| --- | --- | --- | --- |
| Bridge geometry | Profile curves and a segment table become beveled blocks. Edge chips come from seeded cuts on the lower courses. One mesh per block, pivots at block centers. | `tools/assets/bridge/` | `public/assets/bridge.glb`, meshopt compressed |
| Bridge occlusion and wear | Ray-cast occlusion per vertex with `three-mesh-bvh` on a mid-density mesh, baked twice: assembled and loosened. Curvature per vertex drives edge wear. Stored as vertex colors. | Same folder | Inside `bridge.glb` |
| Landscape | Heightfield from seeded ridged noise with three authored layers: foreground rock, platform, ridgelines. Normal and occlusion come from the heightfield. The far ridges are separate low meshes. | `tools/assets/terrain/` | `public/assets/terrain.glb`, `terrain_normal`, `terrain_ao` |
| Detail maps | Tiling stone normal and roughness, and a frost mask, generated from seeded noise. Applied by world position so that no unwrap is needed. | `tools/assets/textures/` | `public/assets/tex/*.ktx2` or WebP, decided by measurement in PR 3 |
| Exhibit 01, the assembly | Slabs, posts, and joints from a parameter table. Enclosure from a prism cut by seeded planes. | `tools/assets/exhibits/engineering/` | `public/assets/exhibit-engineering.glb` |
| Exhibit 02, the lens | Faceted disc from a lathe profile with planar cuts. Result plates from a parameter table. | `tools/assets/exhibits/kensaku/` | `public/assets/exhibit-kensaku.glb` |
| Particle targets | Seeded surface samples from the bridge mark, the assembly, and the lens. 24,000 points each on desktop, a 8,000 point subset on low tier. | `tools/assets/particles/` | `public/assets/particles.bin`, 16-bit quantized |
| Environment map | Small generated gradient sky, prefiltered at load. | `tools/assets/env/` | `public/assets/env.ktx2` or generated at runtime |
| Static fallback images | Playwright screenshots of the real scene at the three rest frames, desktop and phone. | `tools/fallback/capture.ts` | `public/fallback/*.webp` |
| Fonts | Geist and Geist Mono from Fontsource, subset to Latin. | `package.json` | Bundled WOFF2 |
| Sound | None in version 1. | Not applicable | Not applicable |

`pnpm assets:build` regenerates every export. `pnpm assets:check` fails when a regenerated file differs from the committed file, when the manifest is incomplete, or when a file exceeds its budget.

### Optional Blender route

Blender adds sculpted high-detail meshes and texture bakes from a high-detail mesh to a light mesh. Use it only if the first milestone review finds that vertex-baked detail cannot reach the standard on the bridge.

Conditions:

- You approve installing and running Blender 4.5 LTS. The session that wrote this plan could not run it.
- Scripts are Python, run with `Blender -b --factory-startup -P`, and take a fixed seed.
- Exports are committed. CI does not need Blender.
- `spike/blender-bridge-NOT-RUN.py` is a starting draft. It has never been executed and may contain errors.

## Asset manifest

`assets/manifest.json` is the single record of every runtime asset. `pnpm assets:check` validates it.

| Field | Meaning |
| --- | --- |
| `id` | Stable name, for example `bridge` |
| `purpose` | What the asset is for and which chapter uses it |
| `source` | `generated`, `authored`, or `third-party` |
| `license` | SPDX identifier, or `proprietary-futari` for generated work |
| `editableSource` | Path to the generator or source file |
| `exportCommand` | Command that rebuilds the export |
| `runtimePath` | Path under `public/` |
| `bytes`, `sha256` | Size and hash of the committed export |
| `budgetBytes` | Limit that `assets:check` enforces |
| `tiers` | Which quality tiers load the asset |

## Budgets

These are starting limits. PR 3 measures real sizes and PR 8 measures frame times. A measured result can change a limit only with the numbers recorded in the PR.

| Item | Limit |
| --- | --- |
| HTML, CSS, JavaScript, and fonts before any 3D asset | 450 KB compressed |
| Chapter A assets: bridge, terrain, detail maps, environment | 3.0 MB |
| Each exhibit | 0.9 MB |
| Particle targets | 0.5 MB |
| Whole site on the high tier | 8.0 MB. The reference transferred about 14.4 MB. |
| Triangles in view, high tier | 400,000 |
| Triangles in view, low tier | 150,000 |
| Draw calls in view | 150 |
| Largest texture | 2048 px on high, 1024 px on low |

## Missing deliverables

No deliverable is blocked. Two carry risk.

1. Bridge surface detail. The route above is untested. If PR 4 cannot reach the standard, the fallback is the Blender route, which needs your approval.
2. Enclosure material. Frosted transmission that keeps the inner object visible is untested on this stack. PR 7 measures its frame cost and falls back to a cheaper frosted shell on the low tier.
