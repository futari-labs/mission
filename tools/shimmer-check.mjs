// A proxy for foliage shimmer, since nobody is watching: renders pairs of frames a fraction of a
// pixel of camera travel apart (one pixel of scroll) and reports how many pixels changed sharply between them. Stable
// edges change a little everywhere. Shimmer shows as many isolated pixels changing a lot.
// Usage: node tools/shimmer-check.mjs [base-url] [--dpr=2] [--phone] [--query=msaa=0&dpr=1.25]
// --phone uses a touch phone frame, so the page takes its coarse tier. --query adds experiment switches.
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const phone = process.argv.includes('--phone');
const dpr = Number(process.argv.find((a) => a.startsWith('--dpr='))?.slice(6) ?? (phone ? 3 : 1));
const query = process.argv.find((a) => a.startsWith('--query='))?.slice(8) ?? '';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const viewport = phone ? { width: 402, height: 874 } : { width: 1440, height: 900 };
const page = await (await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: phone, hasTouch: phone })).newPage();
await page.goto(`${base}/?still&bare${query ? `&${query}` : ''}`);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
// the copy fades with position, and that is not what is being measured
await page.addStyleTag({ content: '.brand,.chapters,.panel,.loader{visibility:hidden}' });
const grab = async (u) => {
	await page.evaluate((v) => window.__futari.jump(v), u);
	await page.waitForTimeout(250);
	const { data, info } = await sharp(await page.screenshot({ type: 'png' })).greyscale().raw().toBuffer({ resolveWithObject: true });
	return { data, info };
};
// The page scrolls in whole pixels, so the smallest camera move there is comes from one pixel of scroll.
const step = await page.evaluate(() => 1 / window.__futari.unitPixels());
const PAIRS = 5;
// positions where the camera is moving past the groves of each season
for (const [label, u] of [['spring, leaving Engineering', 0.5], ['summer, entering the rings', 0.75], ['autumn, arriving at Explore', 0.9]]) {
	let sharpChanges = 0;
	let total = 0;
	let count = 0;
	let a = await grab(u);
	for (let k = 1; k <= PAIRS; k++) {
		const b = await grab(u + k * step);
		for (let i = 0; i < a.data.length; i++) {
			const d = Math.abs(a.data[i] - b.data[i]);
			total += d;
			if (d > 40) sharpChanges++;
		}
		count += a.data.length;
		a = b;
	}
	console.log(label.padEnd(30), JSON.stringify({ meanChange: +(total / count).toFixed(3), pixelsChangingOver15Percent: `${+((100 * sharpChanges) / count).toFixed(3)}%` }));
}
await browser.close();
