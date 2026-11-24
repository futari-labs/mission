// Verifies the looping journey in a real browser. Every scenario scrolls with wheel or touch input,
// reads the continuous position the renderer used on every frame, and checks it.
// Positions are journey units. The lap length and the start of the return are read from the page.
// Usage: node tools/loop-test.mjs [base-url] [--headless]
import { chromium } from 'playwright-core';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const headless = process.argv.includes('--headless');
const gpu = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
let LAP = 1.28;
let MAP = null;
// The browser settles a scroll on a whole pixel, which can move the position back by under 1 px.
// One pixel is about 0.00012 units. Anything beyond that would be a real backward movement.
const BACK = -2e-4;
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

async function open(ctx = {}) {
	const browser = await chromium.launch({ channel: 'chrome', headless, args: gpu });
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctx });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => {
		if (errors.length === 0) console.log(`      first page error: ${e.stack?.split('\n').slice(0, 4).join(' / ')}`);
		errors.push(String(e).slice(0, 140));
	});
	await page.goto(`${base}/?probe`);
	await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	await page.waitForTimeout(2500);
	await page.mouse.move(700, 450);
	MAP = await page.evaluate(() => window.__futari.map);
	LAP = MAP.cycle;
	return { browser, context, page, errors };
}
const reset = (page) => page.evaluate(() => { const p = window.__futariProbe; p.frames.length = 0; p.camera.length = 0; p.shift.length = 0; });
const stats = (page) => page.evaluate(() => ({ ...window.__futariProbe.stats(), chapter: window.__futari.chapter, goal: window.__futari.units(), requests: performance.getEntriesByType('resource').length }));
// A camera jump is a step that frame timing does not explain. At one screen a second the fastest
// stretch of the path covers about 1.6 m in a 60 Hz frame, so a step is scaled to a 60 Hz frame, and
// the frames in which the renderer catches up after a stalled one are left out.
const JUMP = 2;
// from the per-frame log: travel covered, any backward movement of the damped position, and the largest camera step
const trace = (page) => page.evaluate(() => {
	const c = window.__futariProbe.camera, f = window.__futariProbe.frames, sh = window.__futariProbe.shift;
	let back = 0, worst = 0, worstAt = 0, slow = 0, catchingUp = 0;
	for (let i = 4; i < c.length; i += 4) {
		back = Math.min(back, c[i + 3] - c[i - 1]);
		// when the return begins, camera and installation move along z together. Discount that shared move.
		const moved = sh[i / 4] - sh[i / 4 - 1];
		const raw = Math.min(Math.hypot(c[i] - c[i - 4], c[i + 1] - c[i - 3], c[i + 2] - c[i - 2]), Math.hypot(c[i] - c[i - 4], c[i + 1] - c[i - 3], c[i + 2] - c[i - 2] - moved));
		const step = (raw * 16.7) / Math.max(16.7, f[i / 4]);
		if (f[i / 4] > 33.4) catchingUp = 16;
		if (catchingUp > 0) catchingUp--;
		else if (step > worst) { worst = step; worstAt = c[i + 3]; }
		if (f[i / 4] > 33.4) slow++;
	}
	return { from: +c[3].toFixed(3), to: +c[c.length - 1].toFixed(3), mostBackward: +back.toFixed(5), worstStep: +worst.toFixed(2), worstAt: +worstAt.toFixed(3), framesOver33ms: slow, frames: c.length / 4 };
});
const wheel = async (page, units, perSecond = 900) => {
	const unit = await page.evaluate(() => window.__futari.unitPixels());
	const step = (perSecond / 60) * Math.sign(units);
	for (let y = 0; Math.abs(y) < Math.abs(units) * unit; y += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(16); }
};
const settle = (page, ms = 1300) => page.waitForTimeout(ms);
// a chapter link is a journey at a scrolling pace: wait for it to arrive, then for the camera to settle
const arrive = async (page, ms = 1300) => { await page.waitForFunction(() => !window.__futari.navigation().active, null, { timeout: 30000 }); await settle(page, ms); };
const show = (label, t) => console.log(`      ${label}: ${JSON.stringify(t)}`);

// ---- 1. two complete laps downward, no reversal, no reset
let { browser, context, page, errors } = await open();
const before = await stats(page);
await reset(page);
const seen = [];
const sampler = setInterval(async () => { try { const c = await page.evaluate(() => window.__futari.chapter); if (c && seen[seen.length - 1] !== c) seen.push(c); } catch {} }, 120);
await wheel(page, 2 * LAP + 0.03);
await settle(page);
clearInterval(sampler);
let t = await trace(page);
const after = await stats(page);
show('two laps', t);
check('1. two laps downward: position only ever increases', t.mostBackward >= BACK && t.to > 2 * LAP);
check('1. chapters repeat in order for two laps', seen.join().startsWith('lab,engineering,kensaku,explore,lab,engineering,kensaku,explore,lab'), seen.join());
check('1. no camera jump at normal speed', t.worstStep < JUMP, `largest step ${t.worstStep} m at ${t.worstAt}`);
check('1. the scroll position was rebased without the visitor noticing', after.rebases >= 1, `${after.rebases} rebase(s), physical scrollY stays inside the spacer`);
check('7. shader programs, geometries, and textures unchanged after two laps', before.programs === after.programs && before.geometries === after.geometries && before.textures === after.textures, `programs ${before.programs}/${after.programs}, geometries ${before.geometries}/${after.geometries}, textures ${before.textures}/${after.textures}`);
check('7. no asset requested again', before.requests === after.requests, `${before.requests} requests before, ${after.requests} after`);
check('1. entrance did not replay', (await page.evaluate(() => window.__futari.state)) === 'ready');

// ---- 2. upward from the opening back into Explore
await page.evaluate(() => window.__futari.jump(0));
await settle(page);
await reset(page);
await wheel(page, -0.24);
await settle(page);
t = await trace(page);
show('upward crossing', t);
check('2. upward from the opening reaches Explore', (await stats(page)).chapter === 'explore' && t.to < 0);
check('2. position only ever decreases, no camera jump', t.worstStep < JUMP && t.from - t.to > 0.2, `largest step ${t.worstStep} m`);

// ---- 3. stop and reverse just before, on, and just after the join
for (const [label, at] of [['before', LAP - 0.035], ['on', LAP], ['after', LAP + 0.035]]) {
	await page.evaluate((u) => window.__futari.jump(u), at - 0.05);
	await settle(page);
	await reset(page);
	await wheel(page, 0.05, 500);
	await page.waitForTimeout(500);
	const held = await stats(page);
	await page.waitForTimeout(700);
	const stillThere = await stats(page);
	await wheel(page, -0.07, 500);
	await wheel(page, 0.09, 500);
	await settle(page);
	t = await trace(page);
	check(`3. stop ${label} the join holds the state`, Math.abs(held.travel - stillThere.travel) < 0.0008, `position ${(held.travel * LAP).toFixed(4)} then ${(stillThere.travel * LAP).toFixed(4)}`);
	check(`3. reverse ${label} the join is continuous`, t.worstStep < JUMP, `largest step ${t.worstStep} m at ${t.worstAt}`);
}

// ---- 4. fast scroll across the join
await page.evaluate((u) => window.__futari.jump(u), MAP.rests.explore);
await settle(page);
await reset(page);
await wheel(page, LAP - MAP.rests.explore + 0.3, 5200);
await settle(page, 1800);
t = await trace(page);
show('fast across the join', t);
check('4. fast scroll across the join never moves backward', t.mostBackward >= BACK, `most backward ${t.mostBackward}`);
check('4. the return transition is traversed, not skipped', t.from < MAP.returnFrom && t.to > LAP + 0.2 && t.frames > 60, `${t.frames} frames from ${t.from} to ${t.to}`);
check('4. arrives in the first transition of the next lap', (await stats(page)).progress > 0.2);

// ---- 5. after crossing: navigation, dialog, reload, resize
await page.click('nav.chapters a[href="#explore"]');
await arrive(page);
let s = await stats(page);
check('5. navigation to Explore after crossing', s.chapter === 'explore', `position ${(s.travel * LAP).toFixed(3)}`);
await reset(page);
await page.click('nav.chapters a[href="#lab"]');
await arrive(page);
t = await trace(page);
s = await stats(page);
check('5. Explore to Lab goes forward through the return', s.chapter === 'lab' && t.to > t.from && t.mostBackward >= BACK, `${t.from} to ${t.to}`);
await page.click('nav.chapters a[href="#engineering"]');
await arrive(page);
const held = (await stats(page)).travel;
await page.locator('#engineering button.bracket').click();
await page.waitForTimeout(500);
await page.mouse.wheel(0, 900);
await page.waitForTimeout(700);
const inDialog = await page.evaluate(() => ({ open: document.querySelector('dialog').open, focus: !!document.activeElement.closest('dialog') }));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
s = await stats(page);
check('5. dialog after crossing: opens, holds position, returns focus', inDialog.open && inDialog.focus && Math.abs(s.travel - held) < 0.0008 && (await page.evaluate(() => document.activeElement === document.querySelector('#engineering button.bracket'))), `position ${(held * LAP).toFixed(4)} then ${(s.travel * LAP).toFixed(4)}`);
const inReturn = MAP.returnFrom + 0.09;
await page.evaluate((u) => window.__futari.jump(u), 2 * LAP + inReturn);
await settle(page, 800);
await page.reload();
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await settle(page, 1500);
s = await stats(page);
check('5. reload inside the return restores the same place in the lap', Math.abs(s.progress - inReturn) < 0.003, `position within lap ${s.progress.toFixed(4)}`);
await page.setViewportSize({ width: 800, height: 1000 });
await settle(page, 900);
const resized = await stats(page);
await page.setViewportSize({ width: 1440, height: 900 });
await settle(page, 900);
check('5. resize keeps the same place in the lap', Math.abs(resized.progress - inReturn) < 0.003 && Math.abs((await stats(page)).progress - inReturn) < 0.003, `${resized.progress.toFixed(4)}`);
check('no page errors', errors.length === 0, [...new Set(errors)].slice(0, 2).join(' | '));
await browser.close();

// ---- touch: synthesized flings on a phone-sized touch context, two laps downward
({ browser, context, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
const cdp = await context.newCDPSession(page);
await reset(page);
const unit = await page.evaluate(() => window.__futari.unitPixels());
const start = (await stats(page)).travel;
let flings = 0;
while ((await stats(page)).travel - start < 2.05 && flings < 80) {
	await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 600, yDistance: -1500, speed: 3200, gestureSourceType: 'touch' });
	flings++;
}
await settle(page, 1500);
t = await trace(page);
s = await stats(page);
show(`touch, ${flings} flings`, t);
check('touch: two laps downward by synthesized flings, position only increases', t.mostBackward >= BACK && s.travel - start > 2, `${((s.travel - start) * LAP).toFixed(2)} units, ${s.rebases} rebase(s)`);
// each synthesized fling lands a few pixels long. A lap lost or gained in a rebase would be thousands of pixels.
check('touch: distance scrolled matches distance travelled', Math.abs((s.travel - start) * LAP * unit - flings * 1500) < flings * 1500 * 0.01, `${Math.round((s.travel - start) * LAP * unit)} px of travel for ${flings * 1500} px of flings`);
await browser.close();

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
