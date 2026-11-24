// Records the looping journey as a video, in a headed browser on the real GPU.
// Default: more than two complete laps scrolling downward only.
// --join: upward from the opening into Explore, then down across the join.
// --study: slow, pausing and reversing through each construction and the ring passage.
// Usage: node tools/record.mjs <out-dir> [base-url] [--phone] [--join]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [out = 'docs/journey', base = 'http://localhost:4173'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const phone = process.argv.includes('--phone');
const size = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone, recordVideo: { dir: out, size } });
const page = await context.newPage();
await page.goto(base);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(1800);
await page.mouse.move(size.width / 2, size.height / 2);
const lap = await page.evaluate(() => window.__futari.unitPixels() * window.__futari.map.cycle);
// about half a screen per second: an unhurried scroll
const step = (size.height * 0.5) / 60;
const wheel = async (laps) => {
	for (let y = 0; y < Math.abs(laps) * lap; y += step) {
		await page.mouse.wheel(0, step * Math.sign(laps));
		await page.waitForTimeout(16);
	}
	await page.waitForTimeout(1800);
};
const unit = await page.evaluate(() => window.__futari.unitPixels());
const to = async (u, rate = 0.3) => {
	// a slow scroll to a position, in journey units
	const now = await page.evaluate(() => window.__futari.units());
	const px = (u - now) * unit;
	const s = ((size.height * rate) / 60) * Math.sign(px);
	for (let y = 0; Math.abs(y) < Math.abs(px); y += s) {
		await page.mouse.wheel(0, s);
		await page.waitForTimeout(16);
	}
	await page.waitForTimeout(1500);
};
if (process.argv.includes('--study')) {
	// slow, with a pause and a reversal halfway through each construction and inside the ring passage
	for (const [ahead, back, on] of [[0.3, 0.23, 0.43], [0.565, 0.52, 0.67], [0.81, 0.74, 0.86], [0.9, 0.84, 1.0]]) {
		await to(ahead);
		await to(back);
		await to(on);
	}
} else if (process.argv.includes('--join')) {
	// upward from the opening into Explore, then down across the join again
	await wheel(-0.3);
	await wheel(0.45);
} else {
	// more than two complete laps, downward only: no reversal and no reset
	await wheel(2.12);
}
const video = page.video();
await context.close();
const kind = process.argv.includes('--study') ? 'study' : process.argv.includes('--join') ? 'join' : 'loop';
const target = path.join(out, `${kind}-${phone ? 'phone' : 'desktop'}.webm`);
fs.renameSync(await video.path(), target);
await browser.close();
console.log('wrote', target, `${(fs.statSync(target).size / 1e6).toFixed(1)} MB`);
