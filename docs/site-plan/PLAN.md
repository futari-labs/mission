# Futari Labs site: execution plan

Goal: a polished, immersive 3D site that says who Futari Labs is, what it builds, shows two real projects, and links to the work.

This plan is a checklist. An owner runs it box by box. You audit it from the evidence that each box names. Nothing here is approved or implemented. Execution starts on your explicit go.

Supporting documents in this folder:

- `REFERENCE_ANALYSIS.md`: what igloo.inc does and what each observation means for this site.
- `CREATIVE_DIRECTION.md`: identity, copy, palette, type, the bridge, exhibits, storyboard.
- `ASSETS.md`: tools found, the feasibility prototype, the production route, budgets.
- `ARCHITECTURE.md`: stack, layers, scroll authority, tiers, failure handling, accessibility.

## What changes

The repository holds only a two-line `README.md` today. Eleven PRs add a static site: semantic HTML first, then one scroll-driven journey, then generated assets, then three chapters on a single canvas.

## PRs in landing order

| PR | Change | Depends on | Review-gated |
| --- | --- | --- | --- |
| 1 `shell` | Project setup and the complete HTML site with no canvas | none | no |
| 2 `journey` | Scroll-progress authority, phases, camera rig on an empty canvas | 1 | yes |
| 3 `assets` | Asset generators, bakers, manifest, and checks for the bridge and terrain | 1 | no |
| 4 `lab-rest` | The opening scene at rest: bridge, landscape, light, materials, type | 2, 3 | yes |
| 5 `lab-motion` | Entrance sequence, ambient motion, pointer response | 4 | yes |
| 6 `transition` | The first scroll transition, forward and reverse | 5 | yes |
| 7 `exhibit-engineering` | Exhibit 01 with its details dialog | 6 | yes |
| 8 `resilience` | Quality tiers, reduced motion, loading, failure, static fallback | 7 | yes |
| Gate M1 | Visual slice review. PRs 9 to 11 wait for your decision. | 8 | yes |
| 9 `exhibit-kensaku` | Exhibit 02 with its details dialog | Gate M1 | yes |
| 10 `explore` | Passage and the particle installation | Gate M1 | yes |
| 11 `finish` | Full-journey polish, responsive completion, optimization, README, final evidence | 9, 10 | yes |

### Dependency graph

```text
1 shell ──┬── 2 journey ──┐
          └── 3 assets ───┴── 4 lab-rest ── 5 lab-motion ── 6 transition ── 7 exhibit-engineering ── 8 resilience ── Gate M1 ──┬── 9 exhibit-kensaku ──┐
                                                                                                                              └── 10 explore ──────────┴── 11 finish
```

- PR 2 and PR 3 both branch from trunk after PR 1 and can run at the same time. Their files do not overlap.
- PR 9 and PR 10 both branch from trunk after Gate M1 and can run at the same time. PR 2 and PR 7 create every shared slot that they fill, so neither edits `journey/phases.ts`, `journey/keyframes.ts`, or `content/site.ts` beyond its own entries.
- PRs 4 to 8 are sequential. One owner holds the visual language and the timeline through all of them.
- At most two PRs are in progress at once.

### How each PR is verified

Every PR has three kinds of check. Tests alone do not verify a PR.

- Unit: `pnpm typecheck && pnpm lint && pnpm test` pass.
- Live: the built site runs in a real browser and a named scenario meets a stated condition. The repository has no project `verify` skill, so live checks use the `run` skill and Playwright against `pnpm preview`.
- Perf: one named metric, measured on trunk first, with the number that fails the PR.

Perf environment for every measurement: this M1 Pro, Chrome through Playwright with the GPU enabled, 1440 by 900, pixel ratio 1. Each PR records the Chrome version and whether the run was headless. Frame times from headless Chrome are not proof of real-device smoothness. Phone performance on a physical device stays unproven until you test one.

A review-gated PR waits for your review before merge. You review the stills, the recording, and the live site.

---

## PR 1 `shell`: project setup and the complete HTML site

- [ ] Depends on: nothing.
- [ ] Files: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `biome.json`, `playwright.config.ts`, `index.html`, `.gitignore`, `.github/workflows/ci.yml`, `src/main.tsx`, `src/content/site.ts`, `src/styles/`, `src/ui/`, `tests/unit/content.test.ts`, `tests/e2e/shell.spec.ts`, `README.md`.
- [ ] Change: install the stack from `ARCHITECTURE.md`. Build the full semantic page: header, three sections, two exhibit articles, the details dialog, the three links, footer, self-hosted fonts, tokens. No canvas.
- [ ] Result you see: a readable fog-grey page with every piece of copy and every link, usable by keyboard.
- [ ] Unit: `content.test.ts` fails if any link differs from the three GitHub URLs, if a project lacks a title, line, detail, or repository, or if copy contains a digit followed by "customers", "users", or "%".
- [ ] Live: with WebGL disabled by a Chrome flag, at 1440 by 900, 820 by 1180, 390 by 844, and 320 by 640: the `h1` text is visible, Tab reaches every control in document order with a visible focus ring, each details button opens the dialog, Escape closes it, focus returns to the button, and `scrollY` is unchanged. No request leaves the site origin.
- [ ] Perf: metric is compressed JavaScript plus CSS plus fonts in `dist/`. This PR sets the baseline. Fails above 450 KB.

## PR 2 `journey`: scroll-progress authority on an empty canvas

- [ ] Depends on: PR 1.
- [ ] Files: `src/journey/`, `src/scene/Canvas.tsx`, `src/scene/rig/`, `src/probe.ts`, `tests/unit/journey.test.ts`, `tests/e2e/journey.spec.ts`. Edits `src/main.tsx` and `src/ui/` navigation.
- [ ] Change: add the progress store, the phase table, keyframes as data for desktop and phone, the reduced-motion mapping, section navigation, and one fog-colored canvas whose camera follows `progress`. A debug grid stands in for the scene.
- [ ] Result you see: scrolling moves a camera over a grid and the header shows the active chapter.
- [ ] Unit: phases cover 0 to 1 with no gap or overlap. `phaseAt` is monotonic. Keyframe interpolation returns the exact keyframe at each rest point. The reduced-motion mapping returns only rest keyframes.
- [ ] Live: scroll to ten fixed positions forward, then the same ten in reverse, then jump from top to bottom in one step, then click each navigation link. After each, `data-phase` equals the phase for that position and probe `progress` is within 0.005 of `scrollY / maxScroll`. Resize to 700 by 900 and to 1920 by 1080 mid-journey: the same holds. With reduced motion, the phase order is identical.
- [ ] Perf: metric is React commits during a 5 s scripted scroll, counted with the React profiler in the probe build. Baseline on trunk is zero because trunk has no scroll logic. Fails if commits exceed phase changes plus 2.
- [ ] Review: you check scroll feel and navigation.

## PR 3 `assets`: generators, bakers, manifest, checks

- [ ] Depends on: PR 1. Independent of PR 2.
- [ ] Files: `tools/assets/`, `assets/manifest.json`, `public/assets/`, `tests/unit/assets.test.ts`, `tests/visual/asset-turntable.ts`. Adds scripts to `package.json`.
- [ ] Change: build the bridge and terrain generators, the occlusion and curvature bakers, the detail map generator, compression, the manifest, `pnpm assets:build`, and `pnpm assets:check`.
- [ ] Result you see: a contact sheet of the bridge and the terrain from eight angles, rendered alone on neutral light.
- [ ] Unit: two runs of `assets:build` give identical hashes. The manifest validates. Each file is under its budget. The bridge has 20 to 24 separately named blocks.
- [ ] Live: `asset-turntable.ts` loads each export in Chrome and saves the sheet. Condition: no load error, and the 160 px side view of the bridge shows two separate halves and a gap.
- [ ] Perf: metric is total bytes of Chapter A assets and triangle count. Trunk baseline is zero. Fails above 3.0 MB or 400,000 triangles. This PR also records KTX2 against WebP for one texture, in bytes and decode time, and picks one.

## PR 4 `lab-rest`: the opening scene at rest

- [ ] Depends on: PR 2 and PR 3.
- [ ] Files: `src/scene/lab/`, `src/scene/lighting.ts`, `src/scene/materials/`, `src/scene/effects/` for bloom and grain, `tests/visual/stills.ts`. Fills the `lab.rest` keyframes.
- [ ] Change: place the bridge and landscape, set fog, light, materials, ambient particles, and the interface text over them, for desktop and phone framing.
- [ ] Result you see: the hero frame from the storyboard, still.
- [ ] Unit: material and light parameters load from their single files. No new logic beyond that.
- [ ] Live: `stills.ts` captures the rest frame at 1440 by 900, 820 by 1180, 390 by 844, and a 160 px thumbnail. Conditions: the `h1` and wordmark meet 4.5 to 1 contrast against the pixels behind them, measured from the screenshot. The thumbnail shows two halves and a lit gap.
- [ ] Perf: metric is 95th percentile frame time over 10 s at rest. Baseline is PR 2 on trunk. Fails above 16.7 ms on the high tier.
- [ ] Review: you compare the still with reference capture 02 for composition, silhouette, material detail, lighting, and atmospheric depth. This is the first look at surface quality. If vertex-baked detail falls short, the Blender route in `ASSETS.md` is decided here.

## PR 5 `lab-motion`: entrance, ambient motion, pointer response

- [ ] Depends on: PR 4.
- [ ] Files: `src/scene/lab/entrance.ts`, `src/scene/lab/pointer.ts`, `src/scene/rig/`, `tests/e2e/lab.spec.ts`.
- [ ] Change: add the entrance from the real segments, drift, pointer parallax, segment loosening near the pointer, and seam brightening.
- [ ] Result you see: segments settle from each pier toward the center, the seam lights, and segments near the pointer loosen and return.
- [ ] Unit: pointer displacement is zero beyond its radius and never exceeds its cap. The entrance end state equals the rest state.
- [ ] Live: scroll 300 px during the entrance: the entrance ends and `data-phase` follows the scroll. Move the pointer across the bridge, then away: 2 s later a screenshot matches the rest still within 1 percent of pixels. Interface text boxes do not move by more than 1 px during pointer motion.
- [ ] Perf: metric is 95th percentile frame time during the entrance and during a 5 s pointer sweep. Baseline is PR 4. Fails above 16.7 ms.
- [ ] Review: you check the entrance and the pointer response on the live site.

## PR 6 `transition`: the first scroll transition

- [ ] Depends on: PR 5.
- [ ] Files: `src/scene/effects/transition/`, `src/journey/keyframes.ts` for `lab.depart` and `lab-work.transition`, `tests/visual/sequence.ts`.
- [ ] Change: add the frost front, block displacement, and chromatic edge as one pass driven by `progress`, plus the camera push before it.
- [ ] Result you see: scrolling carries the view from the bridge into fog and back, with a clear start, peak, and end.
- [ ] Unit: each effect strength is zero outside its range and reaches its peak once inside it.
- [ ] Live: `sequence.ts` captures 20 frames across progress 0.08 to 0.30 forward and 20 in reverse. Conditions: frame k forward and frame k reverse differ by under 1 percent of pixels. The last frame has zero displacement and no fringe. With reduced motion, no frame has displacement or fringe.
- [ ] Perf: metric is 95th percentile frame time during a 4 s scripted scroll through the range. Baseline is PR 5. Fails above 16.7 ms.
- [ ] Review: you compare the sequence with reference capture 04.

## PR 7 `exhibit-engineering`: Exhibit 01 and its details

- [ ] Depends on: PR 6.
- [ ] Files: `tools/assets/exhibits/engineering/`, `public/assets/exhibit-engineering.glb`, `assets/manifest.json`, `src/scene/exhibits/`, `src/scene/materials/enclosure.ts`, `src/ui/` exhibit labels and dialog styling, `tests/e2e/exhibit.spec.ts`. Also creates the empty `kensaku` and `explore` slots in the phase, keyframe, and content files.
- [ ] Change: generate the assembly and its prism enclosure, place them in `work.engineering`, wire labels, pointer rotation, and the dialog with a dimmed scene.
- [ ] Result you see: the assembly inside frosted crystal, with its title, category, line, and a working details view.
- [ ] Unit: asset checks from PR 3 pass for the new asset. Pointer rotation stays inside its range.
- [ ] Live: by pointer, by touch, and by keyboard: open details, read the text, follow the repository link target without leaving the test, press Escape. Conditions: focus is inside the dialog while open, focus returns to the details button, `scrollY` and `data-phase` are unchanged, the link `href` is `https://github.com/futari-labs/engineering`. A still shows the inner object visible through the enclosure.
- [ ] Perf: metric is 95th percentile frame time at rest on the exhibit with transmission on. Baseline is PR 6 at the same progress. Fails above 16.7 ms on high. Records the medium and low tier numbers.
- [ ] Review: you compare the exhibit with reference captures 05 and 09.

## PR 8 `resilience`: tiers, reduced motion, loading, failure, fallback

- [ ] Depends on: PR 7.
- [ ] Files: `src/quality/`, `src/scene/Canvas.tsx`, loader module, `tools/fallback/capture.ts`, `public/fallback/`, `tests/e2e/resilience.spec.ts`.
- [ ] Change: add the tier table and governor, the reduced-motion treatment for PRs 4 to 7, loading states, asset retry and fallback, context loss and restore, render suspension, and fallback images captured from the real scene.
- [ ] Result you see: the same content in every failure case, with images of the real scene where the canvas cannot run.
- [ ] Unit: the governor steps down after 60 slow frames and never steps up during a visit. Tier tables are complete.
- [ ] Live: seven scenarios, each with its condition.
  1. Block `bridge.glb`: the HTML is usable and the fallback image shows.
  2. Delay every asset by 5 s: scroll and navigation work during the delay.
  3. Disable WebGL: `data-webgl="unavailable"` and the fallback shows.
  4. Call probe `loseContext()` at an exhibit, then `restoreContext()`: the scene returns at the same `progress`.
  5. Hide the page for 3 s: the frame counter does not advance.
  6. Reduced motion: no camera movement between rest phases.
  7. Rotate 390 by 844 to 844 by 390: no content is clipped and `data-phase` is correct.
- [ ] Perf: metric is 95th percentile frame time per tier over the journey from progress 0 to 0.46, with CPU throttled 4 times for the low tier. Baseline is PR 7. Fails above 16.7 ms on high and above 33 ms on low.
- [ ] Review: you check reduced motion and the fallback on the live site.

## Gate M1: visual slice review

The first milestone must prove the visual direction before the plan expands. A working canvas or a passing build does not pass this gate.

- [ ] Capture stills at these moments, at 1440 by 900 and 390 by 844, next to the reference capture for the same moment.

| Moment | Futari still | Reference capture |
| --- | --- | --- |
| Entrance midpoint | segments half settled | 01 |
| Lab at rest | hero | 02 |
| Pointer near the centerpiece | loosened segments | 03 |
| Transition peak | progress 0.25 | 04 |
| Exhibit at rest | Exhibit 01 | 05 |
| Details open | dialog | 09 |
| Phone at rest | hero and exhibit | 13 |

- [ ] Record a 30 s video of the journey from load to Exhibit 01 and back, and a contact sheet of 24 frames from it.
- [ ] Score ten aspects from 1 to 5, each with one concrete observation: composition, silhouette, material detail, lighting, atmospheric depth, typography, camera continuity, transition finish, interaction response, mobile readability.
- [ ] An independent reviewer that did not write the code reviews the same stills and video against the reference captures. The reviewer lists the largest remaining gaps with concrete observations. The reviewer sees the images, not the author's scores.
- [ ] Fix every aspect scored under 4 by either party, then capture again. Repeat up to three rounds without asking you.
- [ ] Write `docs/site-plan/evidence/M1.md` with the stills, both score sets, the gaps fixed, and the gaps that remain.
- [ ] You decide: continue, change direction, or approve the Blender route.

## PR 9 `exhibit-kensaku`: Exhibit 02 and its details

- [ ] Depends on: Gate M1.
- [ ] Files: `tools/assets/exhibits/kensaku/`, `public/assets/exhibit-kensaku.glb`, `assets/manifest.json`, `src/scene/exhibits/kensaku/`, its entries in the content and keyframe files, `tests/e2e/exhibit.spec.ts`.
- [ ] Change: generate the lens and its disc enclosure, place them in `work.kensaku` with mirrored labels, and add the travel between exhibits.
- [ ] Result you see: a second exhibit whose outline differs from the first at thumbnail size.
- [ ] Unit: asset checks pass. The detail text contains the words "sandbox" and "no real money".
- [ ] Live: the PR 7 scenario for this exhibit, with `href` `https://github.com/futari-labs/kensaku`. A 160 px still of each exhibit side by side shows two different outlines.
- [ ] Perf: as PR 7, baseline PR 8.
- [ ] Review: you compare the two exhibits side by side.

## PR 10 `explore`: passage and particle installation

- [ ] Depends on: Gate M1. Independent of PR 9.
- [ ] Files: `tools/assets/particles/`, `public/assets/particles.bin`, `assets/manifest.json`, `src/scene/explore/`, `src/ui/` explore links, its entries in the keyframe file, `tests/e2e/explore.spec.ts`.
- [ ] Change: sample the three particle targets, build the base, light, and points mesh, add the passage, and wire link focus, hover, and the previous and next buttons to the selected form.
- [ ] Result you see: particles gather into the bridge mark, the assembly, or the lens as the selected link changes, and move away from the pointer.
- [ ] Unit: each target has the stated point count and fits the unit bounds. The blend between two targets is exact at 0 and 1.
- [ ] Live: focus each link with Tab, hover each link, and press next on a touch viewport. Conditions: `data-form` changes to the matching form, `aria-current` moves, and a still 2.5 s later matches the stored still for that form within 3 percent. Each link `href` is one of the three GitHub URLs. With the canvas disabled, all three links work. After a pointer sweep, a still 2.5 s later matches the rest still within 3 percent.
- [ ] Perf: metric is 95th percentile frame time during a morph with 24,000 particles. Baseline is PR 8 at progress 1.0 with an empty stage. Fails above 16.7 ms on high. Records the low tier with 8,000 particles.
- [ ] Review: you check the morph and the pointer response.

## PR 11 `finish`: full journey, responsive completion, optimization, handoff

- [ ] Depends on: PR 9 and PR 10.
- [ ] Files: `src/journey/keyframes.ts`, `src/scene/effects/`, `src/styles/`, `README.md`, `tests/e2e/acceptance.spec.ts`, `docs/site-plan/evidence/FINAL.md`.
- [ ] Change: tune transitions across the whole journey, finish tablet and narrow phone layouts, remove unused code and assets, and write the README.
- [ ] Result you see: the complete site from load to footer and back.
- [ ] Unit: all checks pass. `assets:check` passes. The README names the files for copy, camera keyframes, lights, materials, and tiers.
- [ ] Live: `acceptance.spec.ts` runs every journey in the table below at 1440 by 900, 820 by 1180, 390 by 844, and 320 by 640.
- [ ] Perf: metric is 95th percentile frame time over the full scripted journey, total transfer size, and compressed JavaScript size. Baseline is trunk after PR 10. Fails above 16.7 ms on high, 33 ms on low, 8.0 MB, or 450 KB.
- [ ] Review: you review the final evidence file, which must include desktop and phone stills, one recording, check results, measured performance with its environment, and an honest list of remaining visual gaps. The file must not call the result equal to the reference.

### Acceptance journeys

| Journey | Condition | First covered by |
| --- | --- | --- |
| Enter the site | Content is readable before assets load. The entrance completes or is skipped by scroll. | PR 1, PR 5 |
| Scroll through all chapters and back | `data-phase` visits every phase in order, then in reverse. | PR 2, PR 11 |
| Navigate directly to the projects | The Work link lands on `work.engineering`. | PR 2 |
| Open and close each project detail | Focus trapped, Escape closes, focus and scroll restored. | PR 7, PR 9 |
| Keyboard and touch | Every control is reachable by Tab and usable by tap. | PR 1, PR 7, PR 10 |
| Change the selected particle link | `data-form` and `aria-current` follow the selection. | PR 10 |
| External destinations | The three `href` values are exact. | PR 1 |
| Resize during the experience | Phase and framing stay valid after three resizes and one rotation. | PR 2, PR 8 |
| Reduced motion | Same content order, no camera travel between rest frames. | PR 2, PR 8 |
| Unavailable model, texture, or WebGL context | Content stays usable with the fallback image. | PR 8 |

## Defaults taken, which you can change before the go

| Decision | Default | Alternative |
| --- | --- | --- |
| Bridge silhouette | Two balanced cantilevers, prototype V2 | Two arch halves, prototype V1, which read as one arch |
| Asset route | TypeScript generators with build-time baking | Blender 4.5 LTS scripts, which need your approval to install and run |
| Typefaces | Geist and Geist Mono | Any pair under the SIL Open Font License |
| Sound | None | Add later behind an explicit control |
| Reference captures | Kept out of git because the repository is public | Commit them if you make the repository private |
| Hosting | Not chosen. The build is static files. | Any static host |

## What stays unproven

- Surface quality of the bridge from vertex-baked occlusion and world-space detail maps. PR 4 is the first evidence.
- The Blender route. The planning session could not execute Blender.
- Frosted transmission cost on the exhibits. PR 7 measures it.
- KTX2 encoding from npm tooling. PR 3 measures it.
- TypeScript 7 with every package in the stack. PR 1 proves or pins.
- Smoothness on a physical phone, and behavior in Safari and Firefox. Chrome and Chrome device emulation are the only tested environments.
- The reference's sound and easing curves were not inspected.

## Process notes

- The Futari bootstrap skill was not used in this session, at your instruction. No `.futari/` contract and no approval record exist. These documents sit outside `docs/futari/`, so a later `/futari:bootstrap` run can initialize cleanly and adopt them.
- Nothing is committed. The new files are in the working tree on `main`.
