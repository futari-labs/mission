// Records the journey forward and back as a video, in a headed browser on the real GPU.
// Usage: node tools/record.mjs <out-dir> [base-url] [--phone]
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
const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
// about half a screen per second: an unhurried scroll
const step = (size.height * 0.5) / 60;
for (const dir of [1, -1]) {
	for (let y = 0; y < max; y += step) {
		await page.mouse.wheel(0, step * dir);
		await page.waitForTimeout(16);
	}
	await page.waitForTimeout(2200);
}
const video = page.video();
await context.close();
const target = path.join(out, `journey-${phone ? 'phone' : 'desktop'}.webm`);
fs.renameSync(await video.path(), target);
await browser.close();
console.log('wrote', target, `${(fs.statSync(target).size / 1e6).toFixed(1)} MB`);
