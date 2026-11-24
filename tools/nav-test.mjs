// Checks the journey a chapter link starts, in a real browser, on a desktop frame and on a phone-sized
// touch frame: every route between Lab, Work, and Explore, its duration and pace, that it passes
// through what lies between, that it arrives exactly, and that wheel, touch, and keys take over
// without a jump. Positions are journey units. The pace is read from the page, so tuning it does
// not break the checks. Exits non-zero on any failure.
// Usage: node tools/nav-test.mjs [base-url] [--headed]
import { chromium } from 'playwright-core';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const headless = !process.argv.includes('--headed');
const gpu = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const NAMES = [null, 'lab', 'engineering', 'kensaku', 'explore'];
const LINK = { lab: 'lab', work: 'engineering', explore: 'explore' };
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function open(ctx, query = '?probe') {
	const browser = await chromium.launch({ channel: 'chrome', headless, args: gpu });
	const context = await browser.newContext(ctx);
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
	await page.goto(`${base}/${query}`);
	await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	await page.waitForTimeout(2000);
	// One row per frame: time, position the page is at, scroll position, whether a journey runs, chapter shown.
	// Read just after the frame's callbacks, so a row holds what that frame did.
	await page.evaluate((names) => {
		const log = (window.__navLog = { on: false, rows: [] });
		const tick = (t) => {
			if (log.on) setTimeout(() => log.rows.push([t, window.__futari.units(), scrollY, window.__futari.navigation().active ? 1 : 0, names.indexOf(window.__futari.chapter)]), 0);
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, NAMES);
	const map = await page.evaluate(() => ({ ...window.__futari.map, unit: window.__futari.unitPixels(), height: innerHeight }));
	return { browser, context, page, errors, map };
}

const jump = async (page, u, ms = 1100) => { await page.evaluate((v) => window.__futari.jump(v), u); await page.waitForTimeout(ms); };
const begin = (page) => page.evaluate(() => { const p = window.__futariProbe; p.frames.length = 0; p.camera.length = 0; p.shift.length = 0; window.__navLog.rows.length = 0; window.__navLog.on = true; });
const rows = (page) => page.evaluate(() => { window.__navLog.on = false; return window.__navLog.rows.slice(); });
const now = (page) => page.evaluate(() => ({ u: window.__futari.units(), y: scrollY, chapter: window.__futari.chapter, nav: window.__futari.navigation(), camera: window.__futariProbe.stats().travel * window.__futari.map.cycle, rebases: window.__futariProbe.stats().rebases }));
// distance between two readings in pixels of scrolling, taken from position so a whole-lap correction does not count
const moved = (a, b, map) => (a.u - b.u) * map.unit;
const click = (page, id) => page.click(`nav.chapters a[href="#${id}"]`);
const arrived = async (page, settle = 1500) => { await page.waitForFunction(() => !window.__futari.navigation().active, null, { timeout: 30000 }); await page.waitForTimeout(settle); };
// From the renderer's own per-frame log: the largest camera step, discounting the shared move at the
// start of the return. A camera jump is a step that frame timing does not explain: a step is scaled
// to a 60 Hz frame, and the frames in which the renderer catches up after a stalled one are left out.
// At the set pace the fastest stretch of the path is about 1.5 m a frame.
const JUMP = 1.9;
const camera = (page) => page.evaluate(() => {
	const c = window.__futariProbe.camera, sh = window.__futariProbe.shift, f = window.__futariProbe.frames;
	let worst = 0, worstAt = 0, late = 0, catchingUp = 0;
	const seen = [];
	for (let i = 4; i < c.length; i += 4) {
		const moved = sh[i / 4] - sh[i / 4 - 1];
		const raw = Math.min(Math.hypot(c[i] - c[i - 4], c[i + 1] - c[i - 3], c[i + 2] - c[i - 2]), Math.hypot(c[i] - c[i - 4], c[i + 1] - c[i - 3], c[i + 2] - c[i - 2] - moved));
		const step = (raw * 16.7) / Math.max(16.7, f[i / 4]);
		if (f[i / 4] > 33.4) catchingUp = 16;
		if (catchingUp > 0) catchingUp--;
		else if (step > worst) { worst = step; worstAt = c[i + 3]; }
		late = Math.max(late, f[i / 4]);
		seen.push(c[i + 3]);
	}
	return { worstStep: +worst.toFixed(2), worstAt: +worstAt.toFixed(3), longestFrame: Math.round(late), positions: seen };
});
// position within the lap, and the distance between two positions the short way round
const within = (u, cycle) => ((u % cycle) + cycle) % cycle;
const apart = (a, b, cycle) => { const d = Math.abs(within(a, cycle) - within(b, cycle)); return Math.min(d, cycle - d); };

/** Pace of a logged journey, in viewport heights per second, from the rows where it ran. */
function pace(log, map) {
	const run = log.filter((r) => r[3] === 1);
	if (run.length < 12) return { peak: 0, cruise: 0, backward: 0, jolt: 0, frames: run.length };
	const dir = Math.sign(run[run.length - 1][1] - run[0][1]) || 1;
	let backward = 0;
	const speeds = [];
	let late = 0, lastLate = -1;
	// Speed over a quarter of a second. A late frame holds the journey to a tenth of a second of travel,
	// so that it never leaps: windows that contain one are left out, and the frame is counted.
	for (let i = 0, j = 0; i < run.length; i++) {
		if (i > 0) backward = Math.min(backward, (run[i][1] - run[i - 1][1]) * dir);
		if (i > 0 && run[i][0] - run[i - 1][0] > 40) { late++; lastLate = i; }
		while (run[i][0] - run[j][0] > 250) j++;
		speeds.push(j > 0 && j > lastLate && run[i][0] - run[j][0] > 150 ? ((run[i][1] - run[j][1]) * dir * map.screensPerUnit * 1000) / (run[i][0] - run[j][0]) : null);
	}
	// the largest change of that speed from one frame to the next, as an acceleration in screens per second squared
	let jolt = 0;
	for (let i = 1; i < speeds.length; i++) if (speeds[i] !== null && speeds[i - 1] !== null) jolt = Math.max(jolt, Math.abs(speeds[i] - speeds[i - 1]) * 60);
	const known = speeds.filter((v) => v !== null);
	const middle = known.slice(Math.floor(known.length * 0.35), Math.ceil(known.length * 0.6)).sort((a, b) => a - b);
	return { peak: Math.max(...known), cruise: middle[Math.floor(middle.length / 2)] ?? 0, backward, jolt, late, frames: run.length, dir };
}

const table = [];

async function routes(label, ctx) {
	const { browser, context, page, errors, map } = await open(ctx);
	const R = map.rests, P = map.pace, px = 1 / map.unit;
	const expected = (units) => (units * map.screensPerUnit) / P.screensPerSecond + (P.easeInSeconds + P.easeOutSeconds) / 2;
	// from, link, distance in units, direction, chapters that must show on the way, a stretch that must be played and not skipped
	const cases = [
		['Lab', R.lab, 'Work', R.engineering, 1, [], [0.2, 0.35, 'the arbor builds']],
		['Work', R.engineering, 'Explore', R.explore, 1, ['kensaku'], [0.72, 0.94, 'the ring passage']],
		['Explore', R.explore, 'Lab', map.cycle, 1, [], [map.returnFrom, map.cycle, 'the return']],
		['Lab', R.lab, 'Explore', R.explore - map.cycle, -1, [], [map.returnFrom - map.cycle, 0, 'the return, reversed']],
		['Explore', R.explore, 'Work', R.engineering, -1, ['kensaku'], [0.72, 0.94, 'the ring passage, reversed']],
		['Work', R.engineering, 'Lab', R.lab, -1, [], [0.2, 0.35, 'the arbor, unbuilding']],
	];
	const durations = [];
	for (const [from, start, to, end, dir, via, [a, b, stretch]] of cases) {
		const name = `${label}: ${from} to ${to}`;
		await jump(page, start);
		const before = await now(page);
		await begin(page);
		await click(page, LINK[to.toLowerCase()]);
		const planned = (await now(page)).nav.durationMs;
		await arrived(page);
		const log = await rows(page);
		const after = await now(page);
		const p = pace(log, map);
		const cam = await camera(page);
		const distance = Math.abs(end - start);
		const want = expected(distance);
		const took = after.nav.lastDurationMs / 1000;
		durations.push([distance, took]);
		table.push({ frame: label, route: `${from} to ${to}`, screens: +(distance * map.screensPerUnit).toFixed(2), direction: dir > 0 ? 'forward' : 'back', seconds: +took.toFixed(2), planned: +(planned / 1000).toFixed(2), cruise: +p.cruise.toFixed(2), peak: +p.peak.toFixed(2) });
		check(`${name}: arrives, by the route expected`, after.nav.lastOutcome === 'arrived' && Math.sign(after.u - before.u) === dir && Math.abs(Math.abs(after.u - before.u) - distance) < 3 * px, `${before.u.toFixed(3)} to ${after.u.toFixed(3)}`);
		check(`${name}: rests exactly on the chapter`, apart(after.u, end, map.cycle) < 1.5 * px && apart(after.camera, end, map.cycle) < 1.5 * px && after.chapter === LINK[to.toLowerCase()], `${(apart(after.u, end, map.cycle) / px).toFixed(2)} px off, camera ${(apart(after.camera, end, map.cycle) / px).toFixed(2)} px off, ${after.chapter}`);
		check(`${name}: takes the time its distance asks for`, Math.abs(took - want) < 0.35 && Math.abs(took - planned / 1000) < 0.25, `${took.toFixed(2)} s, planned ${(planned / 1000).toFixed(2)} s, ${distance.toFixed(2)} units at the set pace is ${want.toFixed(2)} s`);
		check(`${name}: holds the set pace, and never exceeds it`, Math.abs(p.cruise - P.screensPerSecond) < 0.05 && p.peak < P.screensPerSecond * 1.06, `cruise ${p.cruise.toFixed(3)}, peak ${p.peak.toFixed(3)} screens per second`);
		check(`${name}: one direction, eased in and out`, p.backward > -1e-9 && p.jolt < 2.6 * (P.screensPerSecond / P.easeOutSeconds) * 1.5, `most backward ${p.backward.toExponential(1)}, largest change of pace ${p.jolt.toFixed(2)} screens/s²${p.late ? `, ${p.late} late frame(s)` : ''}`);
		const played = cam.positions.filter((u) => u > Math.min(a, b) && u < Math.max(a, b)).length;
		const shown = [...new Set(log.map((r) => NAMES[r[4]]).filter(Boolean))];
		check(`${name}: plays what lies between`, played > 60 && via.every((c) => shown.includes(c)), `${played} frames inside ${stretch}; copy shown: ${shown.join(', ')}`);
		check(`${name}: no camera jump`, cam.worstStep < JUMP, `largest step ${cam.worstStep} m at ${cam.worstAt}, longest frame ${cam.longestFrame} ms`);
	}
	const byDistance = [...durations].sort((x, y) => x[0] - y[0]);
	check(`${label}: a longer journey takes longer`, byDistance.every((d, i) => i === 0 || d[1] >= byDistance[i - 1][1] - 0.4) && byDistance[byDistance.length - 1][1] - byDistance[0][1] > 1.5, byDistance.map((d) => `${(d[0] * map.screensPerUnit).toFixed(1)} screens ${d[1].toFixed(1)} s`).join(', '));
	check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
	return { browser, context, page, map };
}

// ---- desktop: the six routes, then taking over, replacing, resizing, and the lap boundary
{
	const { browser, page, map } = await routes('desktop', DESKTOP);
	const R = map.rests, px = 1 / map.unit;
	await page.mouse.move(720, 450);

	// wheel
	await jump(page, R.lab);
	await begin(page);
	await click(page, 'engineering');
	await page.waitForTimeout(2200);
	let before = await now(page);
	await page.mouse.wheel(0, 120);
	await page.waitForTimeout(900);
	let after = await now(page);
	await page.waitForTimeout(900);
	let later = await now(page);
	let cam = await camera(page);
	check('desktop: a wheel takes over at once', before.nav.active && !after.nav.active && after.nav.lastOutcome === 'interrupted');
	check('desktop: after the wheel, the page is where the wheel put it', moved(after, before, map) > 110 && moved(after, before, map) < 190 && Math.abs(moved(later, after, map)) < 1, `wheel of 120 px: the page moved ${Math.round(moved(after, before, map))} px from where the journey was, then ${moved(later, after, map).toFixed(1)} px more`);
	check('desktop: no camera jump when the wheel takes over', cam.worstStep < JUMP, `largest step ${cam.worstStep} m`);

	// a scroll key
	await jump(page, R.engineering);
	await begin(page);
	await click(page, 'explore');
	await page.waitForTimeout(2200);
	before = await now(page);
	await page.keyboard.press('ArrowDown');
	await page.waitForTimeout(900);
	after = await now(page);
	await page.waitForTimeout(900);
	later = await now(page);
	cam = await camera(page);
	check('desktop: a scroll key takes over at once', before.nav.active && !after.nav.active && after.nav.lastOutcome === 'interrupted');
	check('desktop: after the key, the page is where the key put it', moved(after, before, map) > 20 && moved(after, before, map) < 110 && Math.abs(moved(later, after, map)) < 1, `the page moved ${Math.round(moved(after, before, map))} px from where the journey was, then ${moved(later, after, map).toFixed(1)} px more`);
	check('desktop: no camera jump when the key takes over', cam.worstStep < JUMP, `largest step ${cam.worstStep} m`);

	// a scroll this module does not listen for: the scroll position moved by something else
	await jump(page, R.lab);
	await click(page, 'engineering');
	await page.waitForTimeout(1500);
	await page.evaluate(() => scrollBy(0, 60));
	await page.waitForTimeout(400);
	after = await now(page);
	check('desktop: any other scroll, such as a scrollbar drag, takes over', !after.nav.active && after.nav.lastOutcome === 'interrupted');

	// keys that do not scroll leave the journey alone
	await jump(page, R.lab);
	await click(page, 'engineering');
	await page.waitForTimeout(800);
	await page.keyboard.press('Shift');
	await page.keyboard.press('a');
	await page.waitForTimeout(300);
	check('desktop: a key that does not scroll leaves the journey running', (await now(page)).nav.active);
	await arrived(page, 600);

	// replaced on the way, by a destination behind: the pace turns round, it does not snap
	await jump(page, R.engineering);
	await begin(page);
	await click(page, 'explore');
	await page.waitForTimeout(1800);
	const mid = await now(page);
	await click(page, 'lab');
	const turned = await now(page);
	await arrived(page);
	let log = await rows(page);
	after = await now(page);
	cam = await camera(page);
	const steps = log.slice(1).map((r, i) => Math.abs(r[1] - log[i][1]) * map.screensPerUnit * 1000 / Math.max(8, r[0] - log[i][0]));
	check('desktop: another link replaces the journey', turned.nav.active && turned.nav.lastOutcome === 'replaced' && turned.nav.chapter === 'lab' && after.nav.lastOutcome === 'arrived' && after.chapter === 'lab', `at ${mid.u.toFixed(3)}, then to ${after.u.toFixed(3)}`);
	check('desktop: the replacement turns round smoothly and arrives exactly', Math.max(...steps) < map.pace.screensPerSecond * 1.25 && cam.worstStep < JUMP && apart(after.u, R.lab, map.cycle) < 1.5 * px, `fastest frame ${Math.max(...steps).toFixed(2)} screens/s, largest camera step ${cam.worstStep} m`);

	// replaced on the way, by a destination ahead: it carries on without stopping
	await jump(page, R.lab);
	await begin(page);
	await click(page, 'engineering');
	await page.waitForFunction((u) => window.__futari.units() > u, 0.4, { timeout: 15000 });
	await click(page, 'explore');
	const onward = await now(page);
	await page.waitForTimeout(700);
	log = await rows(page);
	const slowest = Math.min(...log.slice(-30).map((r, i, a) => (i === 0 ? 9 : ((r[1] - a[i - 1][1]) * map.screensPerUnit * 1000) / Math.max(8, r[0] - a[i - 1][0]))));
	check('desktop: a destination further on is carried on to without a stop', onward.nav.active && onward.nav.chapter === 'explore' && onward.nav.to * map.cycle > 1 && slowest > 0.02, `slowest frame after the click ${slowest.toFixed(3)} screens/s`);
	await arrived(page);
	after = await now(page);
	check('desktop: and arrives at Explore', after.chapter === 'explore' && apart(after.u, R.explore, map.cycle) < 1.5 * px);

	// a resize on the way
	await jump(page, R.lab);
	await begin(page);
	await click(page, 'engineering');
	await page.waitForTimeout(2000);
	before = await now(page);
	await page.setViewportSize({ width: 1000, height: 700 });
	await page.waitForTimeout(250);
	const resized = await now(page);
	await arrived(page);
	log = await rows(page);
	after = await now(page);
	const unitAfter = await page.evaluate(() => window.__futari.unitPixels());
	const p = pace(log, map);
	check('desktop: a resize on the way does not end or restart the journey', resized.nav.active && after.nav.lastOutcome === 'arrived' && Math.abs(after.nav.lastDurationMs - after.nav.durationMs) < 300, `${(after.nav.lastDurationMs / 1000).toFixed(2)} s, planned ${(after.nav.durationMs / 1000).toFixed(2)} s`);
	check('desktop: position is continuous through the resize, and arrival is exact at the new size', p.backward > -1e-9 && resized.u > before.u && resized.u - before.u < 0.05 && apart(after.u, R.engineering, map.cycle) < 1.5 / unitAfter && after.chapter === 'engineering', `${before.u.toFixed(4)} then ${resized.u.toFixed(4)}, rest ${after.u.toFixed(5)}`);
	await page.setViewportSize(DESKTOP.viewport);
	await page.waitForTimeout(600);

	// across the lap boundary: the scroll position is corrected by a whole lap under the journey's feet
	await jump(page, R.explore);
	const lapsBefore = (await now(page)).rebases;
	// scroll on into the next lap of the spacer at a steady pace and click in the same frame as the last
	// step, while that scroll is still fresh and before any pause corrects it
	const crossing = await page.evaluate((px) => new Promise((done) => {
		let gone = 0;
		const tick = () => {
			if (gone < px) { scrollBy(0, 15); gone += 15; requestAnimationFrame(tick); return; }
			const at = { lap: Math.floor(scrollY / (window.__futari.unitPixels() * window.__futari.map.cycle)), u: window.__futari.units() };
			const p = window.__futariProbe;
			p.frames.length = 0; p.camera.length = 0; p.shift.length = 0; window.__navLog.rows.length = 0; window.__navLog.on = true;
			document.querySelector('nav.chapters a[href="#engineering"]').click();
			done(at);
		};
		requestAnimationFrame(tick);
	}), (map.cycle - R.explore + 0.05) * map.unit);
	const started = await now(page);
	await arrived(page);
	log = await rows(page);
	after = await now(page);
	cam = await camera(page);
	const leap = Math.max(...log.slice(1).map((r, i) => Math.abs(r[1] - log[i][1]) * map.screensPerUnit * 1000 / Math.max(8, r[0] - log[i][0])));
	check('desktop: a journey begun in another lap of the spacer is rebased as it starts', crossing.lap !== 3 && started.rebases === lapsBefore + 1 && started.nav.active, `spacer lap ${crossing.lap} at ${crossing.u.toFixed(3)}, rebases ${lapsBefore} then ${started.rebases}`);
	check('desktop: the rebase is not seen: position continuous, no camera jump, exact arrival', leap < map.pace.screensPerSecond * 1.25 && cam.worstStep < JUMP && after.nav.lastOutcome === 'arrived' && apart(after.u, R.engineering, map.cycle) < 1.5 * px && after.u > map.cycle, `fastest frame ${leap.toFixed(2)} screens/s, camera ${cam.worstStep} m, at ${after.u.toFixed(3)}`);
	// and a journey that ends past the boundary is brought back to the middle lap once it rests
	await jump(page, R.explore);
	const restBefore = (await now(page)).rebases;
	await click(page, 'lab');
	await arrived(page, 900);
	after = await now(page);
	check('desktop: a journey that ends across the boundary rests there and is then rebased', after.rebases === restBefore + 1 && after.chapter === 'lab' && apart(after.u, 0, map.cycle) < 1.5 * px && Math.abs(after.camera - after.u) < 1.5 * px, `rebases ${restBefore} then ${after.rebases}, at ${after.u.toFixed(4)}`);
	await browser.close();
}

// ---- phone-sized touch frame: the six routes, then a finger taking over, a tap on another link, and a rotation
{
	const { browser, context, page, map } = await routes('phone', PHONE);
	const R = map.rests;
	const cdp = await context.newCDPSession(page);
	const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });

	await jump(page, R.lab);
	await begin(page);
	await click(page, 'engineering');
	await page.waitForTimeout(2200);
	let before = await now(page);
	await touch('touchStart', 600);
	await page.waitForTimeout(120);
	const held = await now(page);
	await page.waitForTimeout(400);
	const still = await now(page);
	for (let y = 590; y >= 480; y -= 10) { await touch('touchMove', y); await page.waitForTimeout(16); }
	await touch('touchEnd', 480);
	await page.waitForTimeout(1200);
	let after = await now(page);
	const cam = await camera(page);
	check('phone: a finger on the scene takes over at once', before.nav.active && !held.nav.active && held.nav.lastOutcome === 'interrupted');
	check('phone: under the finger the page holds where it was, with no snap', moved(held, before, map) >= 0 && moved(held, before, map) < 60 && Math.abs(moved(still, held, map)) < 1 && still.rebases === before.rebases, `${Math.round(moved(held, before, map))} px on from the last reading when the finger landed, then ${moved(still, held, map).toFixed(1)} px in 400 ms`);
	check('phone: the drag then moves the page from there', moved(after, still, map) > 60 && moved(after, still, map) < 400, `dragged 120 px, page moved ${Math.round(moved(after, still, map))} px`);
	check('phone: no camera jump when the finger takes over', cam.worstStep < JUMP, `largest step ${cam.worstStep} m`);

	// A finger that rests on the screen in another lap of the spacer: the whole-lap correction waits for it to lift.
	await jump(page, R.lab);
	await click(page, 'explore');
	await page.waitForTimeout(2000);
	before = await now(page);
	await touch('touchStart', 600);
	await page.waitForTimeout(700);
	const resting = await now(page);
	await touch('touchEnd', 600);
	await page.waitForTimeout(700);
	after = await now(page);
	check('phone: the scroll position is not corrected under a resting finger, only after it lifts', resting.rebases === before.rebases && Math.abs(resting.y - before.y) < 60 && after.rebases === before.rebases + 1 && Math.abs(moved(after, resting, map)) < 1, `rebases ${before.rebases}, ${resting.rebases} while held, ${after.rebases} after; position moved ${moved(after, resting, map).toFixed(1)} px`);

	// a tap on another chapter link replaces the journey: the finger on the link does not stop it first
	await jump(page, R.engineering);
	await begin(page);
	await page.tap('nav.chapters a[href="#explore"]');
	await page.waitForTimeout(1800);
	await page.tap('nav.chapters a[href="#lab"]');
	const tapped = await now(page);
	await arrived(page);
	after = await now(page);
	check('phone: a tap on another link replaces the journey without stopping it first', tapped.nav.active && tapped.nav.lastOutcome === 'replaced' && tapped.nav.chapter === 'lab' && after.nav.lastOutcome === 'arrived' && after.chapter === 'lab');

	// a rotation on the way
	await jump(page, R.engineering);
	await begin(page);
	await page.tap('nav.chapters a[href="#explore"]');
	await page.waitForTimeout(2500);
	before = await now(page);
	await page.setViewportSize({ width: 874, height: 402 });
	await page.waitForTimeout(250);
	const turned = await now(page);
	await arrived(page);
	const log = await rows(page);
	after = await now(page);
	const unitAfter = await page.evaluate(() => window.__futari.unitPixels());
	const p = pace(log, map);
	check('phone: a rotation on the way does not end or restart the journey', turned.nav.active && after.nav.lastOutcome === 'arrived' && Math.abs(after.nav.lastDurationMs - after.nav.durationMs) < 300, `${(after.nav.lastDurationMs / 1000).toFixed(2)} s, planned ${(after.nav.durationMs / 1000).toFixed(2)} s`);
	check('phone: position is continuous through the rotation, and arrival is exact in the new frame', p.backward > -1e-9 && turned.u > before.u && turned.u - before.u < 0.05 && apart(after.u, R.explore, map.cycle) < 1.5 / unitAfter && after.chapter === 'explore', `${before.u.toFixed(4)} then ${turned.u.toFixed(4)}, rest ${after.u.toFixed(5)}`);
	await page.setViewportSize(PHONE.viewport);
	await page.waitForTimeout(600);

	// a toolbar sliding away fires `resize` with the spacer unchanged: the scroll position must be left alone
	await jump(page, 0.3);
	const calls = await page.evaluate(async () => {
		let n = 0;
		const real = window.scrollTo;
		window.scrollTo = (...a) => { n++; real.apply(window, a); };
		dispatchEvent(new Event('resize'));
		await new Promise((r) => setTimeout(r, 300));
		window.scrollTo = real;
		return n;
	});
	check('phone: a resize that leaves the spacer unchanged does not touch the scroll position', calls === 0, `${calls} scroll correction(s)`);
	await browser.close();
}

// ---- reduced motion: there at once
{
	const { browser, page, map } = await open({ ...DESKTOP, reducedMotion: 'reduce' }, '');
	const px = 1 / map.unit;
	await page.evaluate(() => window.__futari.jump(0));
	await page.waitForTimeout(600);
	await click(page, 'engineering');
	const at = await page.evaluate(() => ({ u: window.__futari.units(), nav: window.__futari.navigation() }));
	await page.waitForTimeout(400);
	const chapter = await page.evaluate(() => window.__futari.chapter);
	check('reduced motion: a link goes there at once, with no journey', !at.nav.active && Math.abs(at.u - map.rests.engineering) < 1.5 * px && chapter === 'engineering', `at ${at.u.toFixed(4)} in the same task as the click`);
	await browser.close();
}

console.log('\nroute durations');
console.table(table);
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
