# Reference analysis: igloo.inc

This document records what the live reference does and what each observation means for the Futari Labs site. It separates what the captures show from what is inferred.

## How the reference was inspected

- Browser: Google Chrome 157 driven by Playwright 1.65.1 in headless mode. WebGL 2 ran on the GPU. The reported renderer was `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)`.
- Date: 2026-11-23 and 2026-11-24.
- Viewports: 1440 by 900 desktop, 390 by 844 phone with touch, 820 by 1180 tablet with touch. Three live resizes: 700 by 900, 1440 by 600, 1920 by 1080.
- Input: pointer moves, clicks, wheel scroll in steps of 100 to 500 units, synthesized touch scroll, arrow keys, Space, Page Down, Tab, Escape.
- Scripts: `reference/igloo/scripts/`. Each script is one scenario. Run a script with `node reference/igloo/scripts/<name>.mjs <output-dir>` after `pnpm add -D playwright-core`.
- Captures: `reference/igloo/captures/`. The folder is ignored by git because the repository is public and the images belong to Igloo Inc. and Abeto. Regenerate them with the scripts.
- Written source: the Abeto case study on Awwwards, dated 2024-10-31.

## What was not inspected

- Sound. Headless Chrome has no audio output. The capture shows only that the label changes from `Sound: Off` to `Sound: On` after the first click.
- Easing curves and frame pacing. Motion was sampled as stills every 100 to 650 ms. No frame was watched in real time.
- Safari, Firefox, and a physical phone. Phone and tablet results come from Chrome device emulation.
- The site with WebGL disabled.
- Project detail pages for the second exhibit, and the external link targets.

## Observations and consequences

Capture numbers refer to files in `reference/igloo/captures/`.

### Loading and entrance (captures 01, 02)

| Observed | Consequence for Futari |
| --- | --- |
| The loader is one row of scrambling glyphs, about 45 px wide, centered on flat fog grey. No logo, no progress bar. It lasted 1.6 s with a warm cache and about 5.5 s cold. | Keep the loading state this small. Futari must also show the real heading, intro copy, and navigation as HTML during the load, which the reference does not. |
| The entrance uses the scene geometry. A wireframe igloo draws from a point seen from above. A line network radiates out. A white flash marks the top. The shaded igloo appears with a glowing base outline. The ground grows outward from the footprint with a blocky glowing edge. Mountains and fog arrive last. | Build the entrance from the bridge segments, not from a separate animation asset. Order: structure lines, solid segments, ground growing out from the piers, atmosphere last. |
| The camera moves once, from a high top-down view to the three-quarter hero view, over about 3.5 s. The interface text scrambles in only after the camera settles. | One continuous camera move. Hold interface text until the camera is at rest so the text never slides against a moving scene. |
| The whole entrance takes about 5.5 s after the assets are ready. Scroll input was not tested during the entrance. | Target 3 to 4 s. Scroll must work during the entrance. Scrolling fast-forwards the entrance to its end state. |

### Opening landscape and centerpiece (capture 02)

| Observed | Consequence for Futari |
| --- | --- |
| The igloo covers about 41 percent of the width and 55 percent of the height. Its center sits near the middle of the frame, slightly above the vertical midpoint. | The bridge is wider than tall. Give it about 55 to 60 percent of the width on desktop and keep the top corners clear for text. |
| Three depth layers are distinct. A dark textured ridge crosses the lower left third. The igloo sits on a lighter mound. Three mountain layers fade into fog behind. | Model three terrain layers on purpose: one foreground rock mass, one platform mound, and two or more ridgelines. The prototype in `spike/` shows that one smooth heightfield does not produce this. |
| Fog is lighter at the top and denser at distance. The centerpiece keeps full contrast. | Use height and distance fog. Exclude the bridge from the densest fog range so it stays readable. |
| Light escapes through the joints between blocks and spills onto the ground near the entrance. | The seam light must also light nearby surfaces. A bright strip alone will look pasted on. |
| Block surfaces show pitting, worn edges, and frost on upper faces at close range. | Plan surface detail at three scales: baked occlusion and edge wear, a tiling detail normal, and frost by surface direction. |
| Small numbered labels with thin connector lines sit on some blocks. The numbers carry no stated meaning. | Use the same label style only for real content: segment order numbers or project numbers. No invented measurements. |

### Pointer response in the opening scene (capture 03)

| Observed | Consequence for Futari |
| --- | --- |
| With the pointer far away, the blocks sit assembled and the joints glow faintly. | Rest state is assembled. The bridge silhouette is exact when the pointer is away. |
| With the pointer near, the closest blocks move outward and rotate a few degrees. The interior glow brightens. Labels appear on the displaced blocks. | Displace only segments near the pointer. Cap the displacement so the two halves still read as a bridge. Raise the seam brightness with proximity. |
| The camera shifts by a small amount with pointer position. The text does not move. | Limit camera parallax to about 1 degree. Interface text stays fixed. |
| A click on a block produced no navigation. | The landmark is not a control. Navigation stays in HTML. |

### Interface scale and placement (captures 02, 09)

| Observed | Consequence for Futari |
| --- | --- |
| Edge margin is about 50 px at 1440 px width, 3.5 percent. | Use one margin token that scales with viewport width. |
| The wordmark is top left, about 155 px wide. A copyright line in monospace sits under it. | Compact wordmark top left. One short identity line under it. |
| The manifesto is top right, right aligned, about 150 px wide, seven short lines of 13 px monospace. | Intro copy top right in a narrow column. The Futari line is the page `h1`. |
| The scroll hint and sound toggle sit bottom left. | Scroll hint bottom left. No sound control in version 1. See the creative direction. |
| The reference uses IBM Plex Mono, read from `document.fonts`. | Choose a different monospace face so the site is not a copy. |
| The page has no DOM text, no links, and no focusable element. `document.body.innerText` is empty and Tab leaves focus on `body`. | Futari does the opposite. All copy, navigation, and links are semantic HTML over the canvas. |

### Transition into the gallery (capture 04)

| Observed | Consequence for Futari |
| --- | --- |
| The first 1,000 wheel units, about 9 percent of the journey, move only the camera. The scene stays intact. | Start the first scroll range with a slow camera push and no effect. The stillness makes the effect read. |
| The effect begins at the bottom edge. Fog rises. A rainbow fringe follows the fog boundary. Terrain under the boundary smears. | The transition has a direction. Drive one fog front upward. Tie the chromatic fringe to the front only. |
| At the peak, the igloo shrinks, recedes, and breaks into block-shaped displaced fragments. The top-right text glitches out. | Peak: displacement in screen-space blocks on the receding bridge, and interface text exits with a short scramble. |
| The effect resolves in plain fog. The first exhibit rises from the bottom edge and its label scrambles into place. | Resolution is calm fog, then the exhibit enters from below. Label text appears after the exhibit stops. |
| The transition spans about 1,000 wheel units and tracks scroll in both directions. | Scrub the transition to scroll progress. Reverse scroll plays it backward. |

### Project gallery (captures 05, 06, 07)

| Observed | Consequence for Futari |
| --- | --- |
| Each exhibit is one ice block about 23 percent of the width and 62 percent of the height, centered. | Give each exhibit about 60 percent of the viewport height on desktop. |
| The two blocks have different outlines. The first is a compact faceted lump. The second is a tall slab. | Design two enclosure outlines that differ at thumbnail size: one vertical prism and one round lens. |
| The enclosed object stays visible through frosted, pitted ice with soft refraction and a faint color fringe on highlights. | Use transmission only on the enclosure. Keep roughness high enough to stay frosted but low enough to see the inner object. |
| Labels sit on three sides with thin leader lines: project number and name, a fake `TEMP` reading, a date with `CLICK TO EXPLORE`. | Labels: project number and name, category, one-line description, and a details button. No fake readings. |
| The background is flat fog with large blurred monospace text and a faint dot grid. | Use blurred project words as backdrop texture. The words must come from the project copy. |
| The block turns a few degrees toward the pointer. | Small rotation range, damped. |
| When scrolling stops near an exhibit, the view settles with the exhibit centered. | Add a gentle settle to each exhibit rest point. Keep it weaker than native scroll so the page never fights the user. |

### Project detail and return (captures 08, 09)

| Observed | Consequence for Futari |
| --- | --- |
| On click, labels glitch for about 0.8 s, then the block breaks into a colored particle burst at about 1.3 s. | Keep the opening effect under 0.6 s. A dialog must be usable fast. |
| By 2.0 s the scene is dark slate. The object stays as a dim silhouette behind the text. | Dim and simplify the scene behind the dialog. Keep the exhibit visible as a dark shape for continuity. |
| Text is one centered monospace column about 500 px wide, with `Summary`, `Discover`, and `Visit` headings and bracketed links. | One column, 60 to 70 characters wide. Sections: summary, what it does, repository link. |
| `Close` sits top right inside corner brackets. Escape also closes. | Close button top right. Escape closes. Focus returns to the details button. |
| Closing returns to the same exhibit at the same scroll position. | Lock scroll while the dialog is open. Restore the exact position on close. |

### Passage and particle installation (captures 10, 11, 12)

| Observed | Consequence for Futari |
| --- | --- |
| The passage takes about 41 percent of the journey. The camera flies down through two glowing segmented stone rings toward a small bright cluster. | The reference spends its largest share here. Futari has a smaller scope, so give the passage 12 to 16 percent and one clear motif: travel along the seam light. |
| The camera arrives top-down over concentric floor rings, then tilts to eye level. | End the passage with one tilt from above to eye level so the base reads before the form. |
| The form is made of small shaded spheres on a stepped circular pedestal, under a ring light, inside a faint cylindrical curtain. | Stage: one stepped base, one overhead light, one soft backdrop. Particles are lit points, not flat sprites. |
| The form rotates slowly at rest. | Slow rotation at rest. Stop the rotation under reduced motion. |
| A pointer sweep pushes nearby particles along the sweep and brightens them. They return in 1.2 to 2.5 s. | Local push with a speed-based brightness. Return in under 2 s. |
| Selecting another link bursts the form into a turbulent column and re-forms it in about 2.2 s. The link label scrambles. | Morph between seeded targets in about 1.5 to 2 s with a brightness peak mid-morph. |
| The selector is a bracketed label on the pedestal front with thin arrows at mid-height. All of it is canvas. | Use real links and real buttons in HTML at the same position. |
| Scrolling past the end loops back to the opening scene. | Do not loop. Native scroll ends at a footer with the three links. |

### Responsive behavior (captures 13, 14, 16)

| Observed | Consequence for Futari |
| --- | --- |
| On the phone, the igloo is larger relative to the width and shifts left. Wordmark and manifesto share the top 140 px. | Define separate phone camera keyframes. Stack wordmark and intro in the top band and keep the bridge below it. |
| Exhibits fill 60 to 80 percent of the phone width. | Frame exhibits by width on portrait screens. |
| Live resize rescales the scene and the interface in one step with no broken state. | Recompute framing from the viewport on resize. Test three live resizes. |
| Arrow keys scroll the journey. Space, Page Down, and Tab do nothing. | Native scroll gives all scroll keys for free. Tab order must reach every control. |
| With `prefers-reduced-motion: reduce`, the entrance and the transition effects looked the same as without it. | Futari must differ here. Reduced motion gets static camera positions and plain fades. |

## Inferred, not observed

These points come from file names in the network log and from the case study. They are not visible in the captures.

- Textures ship as KTX2 (45 files, 11.0 MB). Geometry ships as Draco (20 files). One EXR environment map lights the exhibits. Total transfer was about 14.4 MB including 2.9 MB of audio. Futari targets 8 MB with no audio.
- File names such as `igloo_color`, `igloo_exploded_color`, `ground_color`, and `ground_sansigloo_color` suggest that lighting is baked into color maps, with separate bakes for the assembled and exploded states. This supports baking occlusion for the bridge in both states.
- `volumes/*_64.ktx2` and the case study indicate that particle forms come from 64-cubed volume data exported from VDB with a custom exporter. Futari starts with seeded surface points and adds simulation only if it shows.
- The case study states that all interface text is drawn in WebGL from SDF font textures to make glitch and scramble effects cheap. Futari keeps essential text in HTML and limits scramble to short decorative labels.
- The case study names the tools: Houdini and Blender for 3D, Three.js, three-mesh-bvh, Svelte, GSAP, and Vite for code. The ice blocks came from a custom crystal growth algorithm inside a base shape. The team iterated on shaders and models live in the browser.
- The case study says each exhibit got its own ice block after the team saw that identical blocks looked the same when scrolling past.

## Where Futari differs on purpose

1. Semantic HTML carries all content, navigation, and links. The reference has none.
2. Native document scroll drives the journey. The reference captures the wheel and has no scroll height.
3. Reduced motion changes the experience. The reference showed no change.
4. The journey ends. The reference loops.
5. Sound is absent in version 1. The reference turns sound on at the first click.
6. Labels carry real content. The reference uses invented readings.
