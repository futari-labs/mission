// Drives the journey the way a visitor would and checks that the camera never jumps and that
// state always resolves from scroll position. Prints one line per scenario.
// Usage: node tools/motion-test.mjs [base-url] [--headless]
import { chromium } from 'playwright-core';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: process.argv.includes('--headless'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
const reset = () => page.evaluate(() => { window.__futariProbe.frames.length = 0; window.__futariProbe.camera.length = 0; });
const state = () => page.evaluate(() => ({ ...window.__futari, progress: +window.__futariProbe.stats().progress.toFixed(4), goal: +(scrollY / (document.documentElement.scrollHeight - innerHeight)).toFixed(4) }));
// largest camera movement between two consecutive frames, in metres, and the frame interval at that moment
const jumps = () => page.evaluate(() => {
	const c = window.__futariProbe.camera, f = window.__futariProbe.frames;
	let worst = { step: 0, at: 0, interval: 0 }, travelled = 0;
	for (let i = 4; i < c.length; i += 4) {
		const step = Math.hypot(c[i] - c[i - 4], c[i + 1] - c[i - 3], c[i + 2] - c[i - 2]);
		travelled += step;
		if (step > worst.step) worst = { step: +step.toFixed(3), at: +c[i + 3].toFixed(3), interval: +f[i / 4].toFixed(1) };
	}
	return { frames: c.length / 4, travelled: +travelled.toFixed(1), worstStep: worst };
});
const wheel = async (total, perSecond) => {
	const step = (perSecond / 60) * Math.sign(total);
	for (let y = 0; Math.abs(y) < Math.abs(total); y += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(16); }
};
const report = async (label, extra = {}) => console.log(label.padEnd(34), JSON.stringify({ ...(await jumps()), ...(await state()), ...extra }));
const max = () => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);

await page.goto(`${base}/?probe`);
await page.mouse.move(720, 450);
await page.waitForFunction(() => window.__futari?.state === 'entering');
await page.waitForTimeout(1100);
await reset();
await wheel(700, 900); // start scrolling one second into the entrance
await page.waitForTimeout(1800);
await report('scroll during entrance');

const m = await max();
await reset(); await wheel(m * 0.17, 900); await page.waitForTimeout(250);
await report('forward into transition 1');
await reset(); await wheel(-m * 0.1, 900); await page.waitForTimeout(1200);
await report('reverse inside transition 1');
await reset(); await wheel(m * 0.34, 2400); await page.waitForTimeout(1500);
await report('fast forward to kensaku');
await reset(); await wheel(-m * 0.06, 900); await page.waitForTimeout(1200);
await report('reverse inside transition 2');
await reset(); await wheel(m * 0.22, 900); await wheel(-m * 0.08, 900); await page.waitForTimeout(1500);
await report('reverse inside passage');
await reset(); await page.click('nav.chapters a[href="#explore"]'); await page.waitForTimeout(3500);
await report('nav click: explore');
await reset(); await page.click('nav.chapters a[href="#lab"]'); await page.waitForTimeout(4500);
await report('nav click: lab');

// reload mid-page: the browser restores the scroll position, and the scene must resolve to it
await page.evaluate((y) => scrollTo(0, y), m * 0.59);
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
