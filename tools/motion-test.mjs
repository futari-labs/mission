// Drives the journey the way a visitor would and checks that the camera never jumps and that
// state always resolves from scroll position. Prints one line per scenario.
// Usage: node tools/motion-test.mjs [base-url] [--headless]
import { chromium } from 'playwright-core';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: process.argv.includes('--headless'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
const reset = () => page.evaluate(() => { window.__futariProbe.frames.length = 0; window.__futariProbe.camera.length = 0; window.__futariProbe.shift.length = 0; });
const state = () => page.evaluate(() => ({ state: window.__futari.state, chapter: window.__futari.chapter, position: +(window.__futariProbe.stats().travel * window.__futari.map.cycle).toFixed(4), goal: +window.__futari.units().toFixed(4) }));
// largest camera movement between two consecutive frames, in metres, and the frame interval at that moment
const jumps = () => page.evaluate(() => {
	const c = window.__futariProbe.camera, f = window.__futariProbe.frames, sh = window.__futariProbe.shift;
	let worst = { step: 0, at: 0, interval: 0 }, travelled = 0;
	for (let i = 4; i < c.length; i += 4) {
		const moved = sh[i / 4] - sh[i / 4 - 1];
		const step = Math.min(Math.hypot(c[i] - c[i - 4], c[i + 1] - c[i - 3], c[i + 2] - c[i - 2]), Math.hypot(c[i] - c[i - 4], c[i + 1] - c[i - 3], c[i + 2] - c[i - 2] - moved));
		travelled += step;
		if (step > worst.step) worst = { step: +step.toFixed(3), at: +c[i + 3].toFixed(3), interval: +f[i / 4].toFixed(1) };
	}
	return { frames: c.length / 4, travelled: +travelled.toFixed(1), worstStep: worst };
});
const wheel = async (total, perSecond) => {
	const step = (perSecond / 60) * Math.sign(total);
	for (let y = 0; Math.abs(y) < Math.abs(total); y += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(16); }
};
// a chapter link is a journey at a scrolling pace: wait for it to arrive, then for the camera to settle
const arrive = async () => { await page.waitForFunction(() => !window.__futari.navigation().active, null, { timeout: 30000 }); await page.waitForTimeout(1500); };
const report = async (label, extra = {}) => console.log(label.padEnd(34), JSON.stringify({ ...(await jumps()), ...(await state()), ...extra }));
// pixels of scrolling per journey unit
const max = () => page.evaluate(() => window.__futari.unitPixels());

await page.goto(`${base}/?probe`);
await page.mouse.move(720, 450);
await page.waitForFunction(() => window.__futari?.state === 'entering');
await page.waitForTimeout(1100);
await reset();
await wheel(700, 900); // start scrolling one second into the entrance
await page.waitForTimeout(1800);
await report('scroll during entrance');

const m = await max();
// each scenario stops and reverses halfway through one construction
const go = async (u) => { const now = await page.evaluate(() => window.__futari.units()); await wheel(m * (u - now), 900); };
await reset(); await go(0.3); await page.waitForTimeout(700);
await report('forward, engineering half built');
await reset(); await go(0.22); await go(0.34); await page.waitForTimeout(1000);
await report('reverse and resume, engineering');
await reset(); await wheel(m * 0.22, 2400); await page.waitForTimeout(1500);
await report('fast forward into kensaku build');
await reset(); await go(0.52); await go(0.6); await page.waitForTimeout(1000);
await report('reverse and resume, kensaku');
await reset(); await go(0.82); await page.waitForTimeout(700);
await report('forward, inside ring passage');
await reset(); await go(0.75); await go(0.9); await page.waitForTimeout(1000);
await report('reverse and resume, ring passage');
await reset(); await page.click('nav.chapters a[href="#explore"]'); await arrive();
await report('nav click: explore');
await reset(); await page.click('nav.chapters a[href="#lab"]'); await arrive();
await report('nav click: lab');

// reload mid-page: the browser restores the scroll position, and the scene must resolve to it
await page.evaluate(() => window.__futari.jump(window.__futari.map.rests.kensaku));
await page.waitForTimeout(600);
await page.reload();
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
await report('reload at kensaku');

await reset(); await page.setViewportSize({ width: 800, height: 1000 }); await page.waitForTimeout(1200);
await report('resize to 800x1000');
await reset(); await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(1200);
await report('resize back');
console.log('errors'.padEnd(34), errors.length ? errors.join(' | ') : 'none');
await browser.close();
