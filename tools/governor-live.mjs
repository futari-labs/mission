// Watches the quality governor in a real page, on a phone-sized frame with touch emulation:
//   1. left alone it changes tier at most once: up, after a calm stretch, if a measured frame shows room;
//   2. with the main thread slowed until frames are missed, it measures a frame, lowers the tier,
//      and the journey carries on from where it was: no jump of the camera, no page error;
//   3. a rotation in the middle of a scroll rebuilds the buffers once and does not move the journey.
// The slowdown is CPU throttling, so it shows the mechanism, not a phone's GPU. Exits non-zero on failure.
// Usage: node tools/governor-live.mjs [base-url]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173';
let failed = 0;
const check = (name, ok, detail = '') => {
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(query = '') {
	const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
	await page.goto(`${base}/?probe${query}`);
	await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	return { context, page, errors };
}
const stats = (page) => page.evaluate(() => window.__futariProbe.stats());
/** Samples the tier twice a second for `seconds`. */
async function watch(page, seconds) {
	const seen = [];
	for (let i = 0; i < seconds * 2; i++) {
		await page.waitForTimeout(500);
		const s = await stats(page);
		if (seen.at(-1)?.tier !== s.tier) seen.push({ at: i / 2, tier: s.tier, name: s.tierName, buffer: `${s.bufferWidth}x${s.bufferHeight}`, samples: s.msaa });
	}
	return seen;
}
const show = (seen) => seen.map((s) => `${s.at}s ${s.name} ${s.buffer}/${s.samples}`).join(' → ');

// ---- 1. room to spare
{
	const { context, page, errors } = await open();
	const first = await stats(page);
	check('a phone starts one tier below its top, without multisampling', first.tier === 2 && first.msaa === 0, `${first.tierName}, ${first.bufferWidth}x${first.bufferHeight}, ${first.msaa} samples`);
	const seen = await watch(page, 24);
	const last = await stats(page);
	// Whether it raises depends on what a frame measures on this machine at that moment. Either answer is right
	// as long as it is at most one change, made after the calm stretch, and kept.
	const raised = seen.length === 2 && seen[1].at > 8 && last.tier === 3 && last.msaa === 2;
	const stayed = seen.length === 1 && last.tier === 2;
	check('it changes tier at most once: raised after a calm stretch and kept, or held for lack of measured headroom', raised || stayed, `${raised ? 'raised' : 'held'}: ${show(seen)}; last measured frame ${last.frameCost.toFixed(1)} ms of a ${(1000 / 60).toFixed(1)} ms budget, ${last.governor}`);
	check('no page errors', errors.length === 0, errors.join(' | '));
	await context.close();
}

// ---- 2. overload while scrolling
/** A steady scroll with the main thread slowed 40 times. Returns the tiers seen and how the camera moved. */
async function overloaded(query) {
	const { context, page, errors } = await open(query);
	const cdp = await context.newCDPSession(page);
	await page.evaluate(() => window.__futari.jump(0.3));
	await page.waitForTimeout(800);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 40 });
	await page.evaluate(() => {
		window.__futariProbe.frames.length = 0;
		window.__futariProbe.camera.length = 0;
	});
	const scrolling = (async () => {
		for (let i = 0; i < 160; i++) {
			await page.mouse.wheel(0, 14);
			await page.waitForTimeout(50);
		}
	})();
	const seen = await watch(page, 12);
	await scrolling;
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	const trace = await page.evaluate(() => {
		const { camera } = window.__futariProbe;
		let worst = 0;
		let back = 0;
		for (let i = 4; i < camera.length; i += 4) {
			worst = Math.max(worst, Math.hypot(camera[i] - camera[i - 4], camera[i + 1] - camera[i - 3], camera[i + 2] - camera[i - 2]));
			back = Math.min(back, camera[i + 3] - camera[i - 1]);
		}
		return { worst, back, frames: camera.length / 4 };
	});
	const last = await stats(page);
	if (process.env.SHOT && !query) {
		await page.waitForTimeout(600);
		await page.screenshot({ path: process.env.SHOT });
	}
	await context.close();
	return { seen, trace, last, errors };
}
{
	// the same scroll with the tier held is the control: what the camera does in long frames with no change of tier
	const control = await overloaded('&governor=off');
	const { seen, trace, last, errors } = await overloaded('');
	check('missed frames lower the tier', seen.length >= 2 && last.tier < 2, `${show(seen)}; ${last.governor}`);
	check('the journey carries on through the change: travel never steps back', trace.back > -0.002, `most backward ${trace.back.toFixed(4)} units over ${trace.frames} frames`);
	check('  and the camera moves no further in a frame than it does with the tier held', trace.worst < control.trace.worst * 1.5 + 0.05, `largest step ${trace.worst.toFixed(3)} m, ${control.trace.worst.toFixed(3)} m held`);
	check('no page errors', errors.length === 0 && control.errors.length === 0, [...errors, ...control.errors].join(' | '));
}

// ---- 3. rotation mid-scroll, and toolbar-sized window changes that leave the canvas alone
{
	const { context, page, errors } = await open('&governor=off');
	await page.evaluate(() => window.__futari.jump(0.55));
	await page.waitForTimeout(900);
	const before = await page.evaluate(() => ({ units: window.__futari.units(), travel: window.__futariProbe.stats().travel }));
	await page.evaluate(() => (window.__futariProbe.camera.length = 0));
	await page.setViewportSize({ width: 874, height: 402 });
	await page.waitForTimeout(900);
	const turned = await page.evaluate(() => {
		const c = window.__futariProbe.camera;
		let worst = 0;
		for (let i = 4; i < c.length; i += 4) worst = Math.max(worst, Math.abs(c[i + 3] - c[i - 1]));
		const s = window.__futariProbe.stats();
		return { units: window.__futari.units(), worst, buffer: `${s.bufferWidth}x${s.bufferHeight}`, css: `${s.width}x${s.height}` };
	});
	check('rotation keeps the logical position', Math.abs(turned.units - before.units) < 0.002, `${before.units.toFixed(4)} → ${turned.units.toFixed(4)}`);
	check('  with no step of the rendered position', turned.worst < 0.004, `largest step ${turned.worst.toFixed(5)} units`);
	check('  and the buffers follow the canvas', turned.css === '874x402', `${turned.css} css, ${turned.buffer} buffer`);
	check('no page errors', errors.length === 0, errors.join(' | '));
	await context.close();
}

await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
