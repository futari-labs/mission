# Creative direction

> The bridge centerpiece described below was replaced by the 二人 sculpture. See `docs/identity/README.md`. The palette, type, exhibits, and storyboard still apply.

This document fixes the look, the copy, and the sequence of the Futari Labs site. The reference analysis in `REFERENCE_ANALYSIS.md` supplies the evidence for each choice.

## Identity

Futari Labs is an independent lab that explores applied AI, agent orchestration, and useful software. The name means one founder building with God. The site says this only through three motifs: two forms that reach toward each other, visible construction in segments, and one light that guides the visitor through all three chapters. The site shows no people, no AI character, and no depiction of God.

The visual identity is precise, thoughtful, tactile, and ambitious.

## Copy

All copy lives in one module so that it stays easy to edit. Every project statement below comes from the repository README read on 2026-11-23.

| Slot | Text |
| --- | --- |
| Wordmark | Futari Labs |
| Identity line | Independent AI lab |
| Intro, page `h1` | An independent lab building useful AI systems. |
| Supporting copy | We explore applied AI through products, agent workflows, and the engineering that makes them work. |
| Scroll hint | Scroll to explore |
| Chapter B heading | Selected work |
| Exhibit 01 title | Futari Engineering |
| Exhibit 01 category | Agent workflow, Claude Code plugin |
| Exhibit 01 line | An interactive workflow for defining, reviewing, and executing software projects with agents. |
| Exhibit 01 detail | Futari Engineering is a Claude Code plugin with two commands. `/futari:bootstrap` runs product discovery, architecture, evaluations, independent review, and task design, and ends with an approval card in the terminal. `/futari:execute` verifies the approved contract and hands eligible work to pstack, starting with one vertical slice. |
| Exhibit 02 title | Kensaku |
| Exhibit 02 category | Product research, local web app |
| Exhibit 02 line | Product research with sources, merchant offers, and a simulated checkout. |
| Exhibit 02 detail | Kensaku is a local, single-user shopping research chat for the US, Singapore, and Japan. It answers with a short comparison and numbered source citations, then one card per product with offers taken only from direct merchant pages. Checkout is a sandbox demonstration. It opens a Stripe sandbox session, places no merchant order, and moves no real money. |
| Chapter C heading | Explore further |
| Link 1 | Futari Labs on GitHub, `https://github.com/futari-labs` |
| Link 2 | Futari Engineering, `https://github.com/futari-labs/engineering` |
| Link 3 | Kensaku, `https://github.com/futari-labs/kensaku` |

The site states no customer counts, traction, performance claims, testimonials, or launch dates.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `fog` | `#a6abb8` | Sky, fog, page background |
| `fog-light` | `#c9ced8` | Upper fog, exhibit backdrop highlights |
| `slate` | `#5a6170` | Shadowed stone, secondary text on light |
| `graphite` | `#1b2230` | Dialog backdrop, text on light fog |
| `ice` | `#f4f7fb` | Interface text, frost, highlights |
| `seam` | `#ffffff` with a cold tint `#e4eeff` on spill | The seam light and its spill only |

The seam is the only pure white in the scene. No other hue appears except the brief chromatic fringe during a transition.

## Typography

- Display face: Geist, variable, SIL Open Font License 1.1. Used for the wordmark, the intro, and titles.
- Label face: Geist Mono, variable, SIL Open Font License 1.1. Used for labels, categories, numbers, and dialog body text.
- Both faces are self-hosted from `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, version 5.3.0.
- Type scale, in rem at a 16 px root: 0.75, 0.8125, 1, 1.25, 1.75, 2.5. Labels use 0.75 with 0.06 em tracking in uppercase. Body text uses 0.8125 to 1.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64 px. The edge margin is `clamp(20px, 3.5vw, 56px)`.
- Essential text never distorts. Scramble applies only to labels of up to 24 characters, lasts up to 400 ms, and never runs under reduced motion.

The typefaces are a preference call. Swapping them changes two imports and two tokens.

## The centerpiece: two balanced cantilevers

The landmark is a compact monumental bridge under construction from both sides. Each half stands on its own pier. Each half has a short heavy back arm and a long front arm that thins toward the center. The two front tips stop short of each other. A narrow slab of white light fills the gap.

Balanced cantilever construction builds a bridge outward from each pier in segments until the halves meet. That one structure carries all three motifs: two forms reaching, purposeful construction, and light where they meet.

### Why this silhouette

The prototype in `spike/` compared two variants.

| Variant | Thumbnail read at 160 px | Verdict |
| --- | --- | --- |
| V1, two arch halves of wedge blocks (`v1-arch-*.jpg`) | A single stone arch bridge. The seam is hard to see. | Rejected. It reads as one generic object. |
| V2, two balanced cantilevers (`v2-cantilever-*.jpg`) | Two T-shaped forms with a bright bar between them. | Chosen direction. |

V2 is a blockout, not the design. The prototype shows four gaps that the first milestone must close.

1. The central opening is a round arch. Change the underside of each front arm to straighter, angular lines so that the opening reads as a gap between two arms.
2. The two halves are near mirror images. Vary the segment rhythm and give one tip a small vertical offset of about 0.15 m so that the halves read as two.
3. The surfaces are flat. Add baked occlusion, edge wear, a tiling detail normal, and frost on upper faces.
4. The seam light does not spill. Light the tip faces, the underside, and the ground under the gap.

### Required qualities

- Physical thickness: piers 3.2 m deep, arms 2.9 m at the root and 1.9 m at the tip, on a 17 m total length.
- Negative space: one large opening between the piers, and two smaller openings under the back arms.
- Segments: 20 to 24 blocks. Lengths vary by up to 15 percent. Joints are 4 cm wide and dark at rest.
- Bevels of 5 to 7 cm on every edge. Recessed joints. Chipped edges on the lower courses.
- Stone below, frost on surfaces that face up. One material family for bridge, terrain, and exhibit bases.
- Contact shading where the piers meet the ground.
- The seam light is narrow, 0.4 m wide, and never blooms over the tip geometry.

### Landscape

- Foreground: one rock mass that crosses the lower left of the frame, darker than the platform.
- Middle ground: a calm platform mound under the bridge, lighter than the foreground, with wind-shaped frost.
- Background: three ridgelines at increasing distance that fade into the fog.
- Fine particles drift between the camera and the bridge and between the bridge and the ridges.

## Lighting and materials

| Layer | Setting |
| --- | --- |
| Environment | Soft cold sky light from a small generated environment map. No visible sun. |
| Key | One directional light from the upper left front, with soft shadows, that shows the block faces. |
| Edge | One weak cold light from behind right for separation from the fog. |
| Seam | Emissive slab plus local lights. Brightness rises with pointer proximity and peaks when the entrance completes. |
| Contact | Baked occlusion in the assembled state and the loosened state. A soft ground shadow under each pier. |

Bloom is limited to the seam and stays under the threshold where it hides block edges. Transmission is used only on the two exhibit enclosures. Grain is static and faint. Depth of field is used only in Chapter B and Chapter C backdrops. The chromatic fringe exists only inside transitions.

## Exhibits

Both exhibits share stone, frost, and the seam light as their internal focal point. Their outlines differ.

| | Exhibit 01, Futari Engineering | Exhibit 02, Kensaku |
| --- | --- | --- |
| Inner object | The assembly. Three offset slabs stacked on four posts, with visible joints and one internal frame. The three levels stand for define, review, and execute. | The lens. Four thin result plates fanned behind a thick faceted disc, with one point of light at the focus. |
| Enclosure outline | Tall prism with chamfered corners. Vertical. | Wide faceted disc, hexagonal in outline. Round. |
| Focal point | A line of light up the central joint. | The focal point of light behind the disc. |
| Label position | Number and title upper left, category right, description and details button lower right. | Mirrored: number and title upper right, description and details button lower left. |

## Particle forms

Chapter C has three forms. Each form is sampled from geometry that the visitor has already seen.

| Link | Form |
| --- | --- |
| Futari Labs on GitHub | The bridge mark: two cantilever halves and the gap. |
| Futari Engineering | The assembly from Exhibit 01. |
| Kensaku | The lens from Exhibit 02. |

The stage is one stepped circular base, one overhead light, and a soft backdrop. The seam light from Chapter A is the light above the base.

## Transition vocabulary

Three effects, used together and nowhere else.

| Effect | Begin | Peak | Resolve |
| --- | --- | --- | --- |
| Frost front | A fog and frost edge enters from the bottom. | The front covers the lower two thirds. | Plain fog. |
| Block displacement | The receding subject shifts in small screen-space blocks along the front. | Displacement of up to 3 percent of the viewport width. | Zero displacement before the next subject enters. |
| Chromatic edge | A color fringe appears on the front only. | Fringe width of up to 6 px at 1440 px. | Gone before text appears. |

## Storyboard

Progress values are fractions of the scroll journey. The entrance is time-based and runs once.

| Beat | Progress | Frame | Motion | Interface |
| --- | --- | --- | --- | --- |
| 0. Load | before start | Fog color. HTML heading, intro, and navigation are visible. | None. | A small glyph row marks loading. |
| 1. Entrance | 3 to 4 s, time-based | Camera high above two piers. Segments settle outward from each pier toward the center. The seam lights when the last tips settle. Ground and ridges arrive last. | One camera move from high to the hero view. | Text fades in after the camera rests. |
| 2. The lab, rest | 0.00 to 0.08 | Hero view. Foreground rock lower left, bridge at 55 to 60 percent width, ridges behind. | Slow drift of particles. Pointer parallax up to 1 degree. Near segments loosen and the seam brightens. | Wordmark top left. Intro top right. Scroll hint bottom left. |
| 3. Depart | 0.08 to 0.20 | Camera pushes toward the seam and rises slightly. | Camera only. No effect. | Intro copy stays. |
| 4. Transition | 0.20 to 0.30 | Frost front rises. Bridge recedes and displaces. Fringe on the front. | All three effects, begin to resolve. | Intro exits. Chapter heading enters at the end. |
| 5. Exhibit 01, rest | 0.30 to 0.46 | The assembly in its prism, centered, 60 percent of the height. Blurred project words behind. | Exhibit rises from below, then turns up to 6 degrees with the pointer. | Labels and details button. |
| 6. Travel | 0.46 to 0.52 | Exhibit 01 leaves upward. Exhibit 02 rises. | Camera holds. Exhibits move. | Labels swap after the exhibit stops. |
| 7. Exhibit 02, rest | 0.52 to 0.68 | The lens, centered, mirrored labels. | As beat 5. | Labels and details button. |
| 8. Passage | 0.68 to 0.82 | The focal light of the lens grows to fill the frame, then narrows to the light above the base. The camera tilts from above to eye level. | Transition effects at half strength. | Chapter heading enters at the end. |
| 9. Explore further, rest | 0.82 to 1.00 | Particle form on the base under the light. | Slow rotation. Pointer push. Morph on selection. | Three links, previous and next buttons, footer. |

Under reduced motion, beats 3, 4, 6, and 8 become plain cross-fades between the rest frames. The camera does not move between rest frames. The content order is the same.

## Phone framing

- The bridge sits in the lower two thirds. The wordmark and intro stack in the top band.
- The camera pulls back and rises so that both piers stay in frame at 390 px width. The foreground rock moves to the bottom edge.
- Exhibits are framed by width at 70 percent. Labels stack above and below the exhibit.
- Chapter C places the links below the form in a single column with 44 px touch targets.

## Out of scope for version 1

- Sound. No licensed audio exists, and the brief requires sound to be off by default. A later version can add it behind an explicit control.
- Social or contact links. No verified destination exists beyond the three GitHub links.
- More than two projects.
