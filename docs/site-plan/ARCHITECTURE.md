# Architecture

The site is a static single-page application. Semantic HTML carries all content. One persistent WebGL canvas behind the HTML renders the environment. One scroll-progress value drives the camera, the scene, and the content states.

## Stack

Versions are the current npm releases on 2026-11-23. PR 1 installs them, commits one `pnpm-lock.yaml`, and proves that they build together.

| Package | Version | Role |
| --- | --- | --- |
| `typescript` | 7.0.2 | Application language |
| `react`, `react-dom` | 19.3.1 | Interface. `@react-three/fiber` 9.8.2 accepts React 19.0 to 19.3. |
| `vite` | 8.3.8 | Build and dev server. Needs Node.js 22.12 or later. |
| `three` | 0.187.0 | Rendering |
| `@react-three/fiber` | 9.8.2 | Scene graph in React |
| `@react-three/drei` | 10.7.9 | Used for loaders and the transmission material only |
| `postprocessing`, `@react-three/postprocessing` | 6.39.6, 3.2.2 | Bloom, grain, and the transition pass |
| `gsap` with ScrollTrigger | 3.15.1 | The scroll timeline |
| `three-mesh-bvh` | 0.9.18 | Build-time occlusion baking |
| `@biomejs/biome` | 2.6.8 | Lint and format. `typescript-eslint` 8.73.0 does not accept TypeScript 7. |
| `vitest` | 5.1.1 | Unit tests |
| `@playwright/test` | 1.65.1 | Browser tests, screenshots, and recordings |

If TypeScript 7 fails with any package, PR 1 pins TypeScript 6.0 and records the reason.

## Layers

```text
<html data-phase data-quality data-webgl data-form>
  <canvas>            fixed, behind content, aria-hidden, one WebGL context for the whole visit
  <header>            wordmark link, navigation
  <main>
    <section #lab>      h1 intro, supporting copy, scroll hint
    <section #work>     two <article> exhibits: title, category, line, details button, repository link
    <section #explore>  three links, previous and next buttons
  <footer>            the three links again
  <dialog>            project details, one at a time
```

The HTML is complete and readable with no canvas. The canvas adds the environment. The static fallback replaces the canvas with images of the real scene.

## Source layout

```text
src/
  content/site.ts            copy, links, project data. The only place to edit text.
  styles/tokens.css          colors, type scale, spacing, margins
  journey/phases.ts          named phases and their progress ranges
  journey/keyframes.ts       camera keyframes per phase, desktop and phone
  journey/progress.ts        the progress store: plain object, subscribe, no React state
  journey/scroll.ts          ScrollTrigger setup, section navigation, reduced-motion mapping
  ui/                        header, sections, exhibit labels, dialog, explore links
  scene/Canvas.tsx           the single canvas, context loss handling, render suspension
  scene/rig/                 camera rig that reads progress and pointer
  scene/lighting.ts          every light and its values
  scene/materials/           stone, frost, enclosure, seam, particle. Shared by all chapters.
  scene/effects/             transition pass, bloom, grain
  scene/lab/                 bridge, terrain, ambient particles, entrance sequence
  scene/exhibits/            shared exhibit frame, engineering, kensaku
  scene/explore/             base, particle system, form selection
  quality/tiers.ts           quality tiers and the frame-time governor
  probe.ts                   test probe, active only with ?probe=1
tools/assets/                generators and bakers. See ASSETS.md.
tools/fallback/              static fallback capture
tests/unit/                  pure logic
tests/e2e/                   browser journeys
tests/visual/                evidence capture: stills, contact sheets, recordings
```

Camera keyframes, light settings, material parameters, quality tiers, and copy each have one file. The README lists them.

## One scroll-progress authority

1. The document scrolls natively. `<main>` has real height. No library replaces the scrollbar or captures the wheel.
2. One ScrollTrigger covers the whole document and writes `progress`, a number from 0 to 1, into the progress store.
3. The progress store is a plain module: a mutable value, a `subscribe` function, and a derived `phase`. It holds no React state.
4. The camera rig, the scene, and the effects read `progress` inside the render loop.
5. Content states change only when `phase` changes. The store then sets `data-phase` on `<html>`. CSS shows and hides copy from that attribute. React does not re-render per frame.
6. Navigation links scroll the document to the rest point of a phase. They never set `progress` directly.
7. On resize or rotation, ScrollTrigger refreshes, the rig picks desktop or phone keyframes from the aspect ratio, and `progress` is recomputed from the new scroll position.

Forward scroll, reverse scroll, a fast jump, and section navigation all pass through the same value, so they cannot disagree.

### Phases

| Phase | Progress | Kind |
| --- | --- | --- |
| `lab.rest` | 0.00 to 0.08 | Rest |
| `lab.depart` | 0.08 to 0.20 | Camera move |
| `lab-work.transition` | 0.20 to 0.30 | Transition |
| `work.engineering` | 0.30 to 0.46 | Rest |
| `work.travel` | 0.46 to 0.52 | Move |
| `work.kensaku` | 0.52 to 0.68 | Rest |
| `work-explore.passage` | 0.68 to 0.82 | Transition |
| `explore.rest` | 0.82 to 1.00 | Rest |

The entrance is not a phase. It is a time-based sequence that runs once at `progress` 0 and ends early when `progress` leaves 0.

Each rest phase has one camera keyframe per framing. Each move or transition interpolates between its neighbors with a named easing. `keyframes.ts` holds every position, target, and field of view as plain data.

### Reduced motion

`prefers-reduced-motion: reduce` selects a second mapping from `progress` to camera. The camera holds the rest keyframe of the nearest rest phase. Moves and transitions become opacity cross-fades. The entrance is skipped. Ambient rotation and scramble stop. Content order and scroll length stay the same.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Scroll progress and phase | `journey/progress.ts` | Page |
| Pointer position, damped | `scene/rig` | Page |
| Quality tier | `quality/tiers.ts` | Page. Can only step down during a visit, except after a context restore. |
| WebGL status: `ok`, `lost`, `unavailable` | `scene/Canvas.tsx` | Page |
| Open project dialog | React state in `ui/` | Until closed |
| Selected particle form | React state in `ui/`, mirrored to `data-form` | Page |
| Asset load state per asset | Loader module | Page |

## Rendering rules

- One canvas and one renderer for the whole visit. Chapters mount and unmount their meshes by phase with a margin of one phase on each side.
- Geometry and materials are created once and shared. Repeated elements use instancing.
- No React state updates inside the render loop.
- Every timeline, listener, geometry, material, texture, and render target is disposed when its owner unmounts.
- Rendering stops while `document.hidden` is true and while the dialog covers a static scene.
- The particle system starts as one points mesh with a vertex shader that blends between two seeded target buffers. A simulation step is added only if a side-by-side capture shows a visible gain inside the frame budget.

## Quality tiers

| Tier | Pixel ratio cap | Shadows | Transmission | Particles | Post-processing |
| --- | --- | --- | --- | --- | --- |
| High | 1.5 | Soft, 2048 | Yes | 24,000 | Bloom, grain, transition pass |
| Medium | 1.25 | Soft, 1024 | Yes, half-resolution buffer | 16,000 | Bloom, transition pass |
| Low | 1.0 | Baked only | Frosted shell without refraction | 8,000 | Transition pass only |
| Static | Not applicable | Not applicable | Not applicable | None | Fallback images |

The start tier comes from device hints: pointer type, viewport, and `deviceMemory`. A governor measures frame time over 60 frames and steps down one tier when the 95th percentile exceeds 22 ms. Camera framing and text layout are the same on every tier.

## Loading and failure

| Situation | Behavior |
| --- | --- |
| First paint | HTML content and navigation are usable. The canvas shows fog color. |
| Chapter A assets loading | The glyph row shows. Scroll works. The entrance starts when the bridge and terrain are ready. |
| Later chapter asset not ready on arrival | The chapter shows its HTML content over fog. The scene fades in when the asset arrives. |
| One asset fails | The loader retries once. On a second failure the chapter uses its fallback image, and the other chapters keep running. |
| WebGL unavailable | `data-webgl="unavailable"`. The fallback images sit behind the same HTML. |
| Context lost | `data-webgl="lost"`. The fallback image for the current phase shows. On restore, the scene rebuilds from the loaded assets and returns to the current `progress`. |
| Page hidden | Rendering stops. It resumes on return. |

## Accessibility

- Landmarks: `header`, `nav`, `main`, three labelled sections, `footer`.
- One `h1`. Each chapter has an `h2`. Each exhibit title is an `h3`.
- The details control is a `button` named `View details: <project>`. The dialog is a native `dialog` opened with `showModal()`, labelled by the project title. Escape closes the dialog. Focus returns to the button that opened it. Scroll position is restored.
- The Chapter C destinations are `a` elements. Focus or hover on a link selects its particle form. Previous and next buttons select a form on touch screens. The selected link has `aria-current="true"`.
- Every interactive element has a visible focus ring with 3 to 1 contrast against fog and graphite.
- Text sits on a local scrim where the scene behind it could drop contrast under 4.5 to 1.
- The canvas is `aria-hidden`. No information exists only in the canvas.
- Touch targets are 44 px or larger. Nothing depends on hover.
- Layout uses `dvh` units and safe-area insets. Rotation triggers the same path as resize.

## Test probe

With `?probe=1`, `window.__futari` exposes `progress`, `phase`, `tier`, `webgl`, `form`, a frame-time buffer, and `loseContext()` and `restoreContext()`. The probe reads state and triggers context loss only. `data-phase`, `data-quality`, `data-webgl`, and `data-form` are always present and are what most tests assert.

## Deployment

The build output is static files. No authentication, database, payment, or server code exists. This plan does not choose a host or deploy. `vite build` output must work from any static file server at the site root.

## Alternatives considered

| Choice | Alternative | Why not |
| --- | --- | --- |
| Native scroll with ScrollTrigger | Wheel capture, as the reference does | Breaks keyboard, touch inertia, and reduced-motion expectations. Fails the brief. |
| HTML text over the canvas | Text drawn in WebGL, as the reference does | No accessible content, no real links. Scramble on short labels is cheap enough in HTML. |
| Generators in TypeScript | Blender as the main route | Blender could not run in the planning session. TypeScript needs no install and reruns in CI. Blender stays an option. See `ASSETS.md`. |
| Vertex-baked occlusion plus world-space detail maps | Unwrapped texture atlases | Needs no unwrap tool. Untested. PR 3 and PR 4 decide with captures. |
| One points mesh with target blending | GPU simulation from the start | Brief asks to start simple and add complexity on evidence. |
| Biome | ESLint with `typescript-eslint` | `typescript-eslint` 8.73.0 requires TypeScript below 6.1. |
