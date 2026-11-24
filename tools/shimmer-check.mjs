// A proxy for foliage shimmer, since nobody is watching: renders pairs of frames a fraction of a
// pixel of camera travel apart and reports how many pixels changed sharply between them. Stable
// edges change a little everywhere. Shimmer shows as many isolated pixels changing a lot.
// Usage: node tools/shimmer-check.mjs [base-url] [--dpr=2]
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const dpr = Number(process.argv.find((a) => a.startsWith('--dpr='))?.slice(6) ?? 1);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr })).newPage();
await page.goto(`${base}/?still&bare`);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
const grab = async (u) => {
	await page.evaluate((v) => window.__futari.jump(v), u);
	await page.waitForTimeout(400);
	const { data, info } = await sharp(await page.screenshot({ type: 'png' })).greyscale().raw().toBuffer({ resolveWithObject: true });
	return { data, info };
};
// positions where the camera is moving past the groves of each season
for (const [label, u] of [['spring, leaving Engineering', 0.5], ['summer, entering the rings', 0.75], ['autumn, arriving at Explore', 0.9]]) {
	const a = await grab(u);
	const b = await grab(u + 0.00004);
	let sharpChanges = 0;
	let total = 0;
	for (let i = 0; i < a.data.length; i++) {
		const d = Math.abs(a.data[i] - b.data[i]);
		total += d;
		if (d > 40) sharpChanges++;
	}
	console.log(label.padEnd(30), JSON.stringify({ meanChange: +(total / a.data.length).toFixed(2), pixelsChangingOver15Percent: `${+((100 * sharpChanges) / a.data.length).toFixed(3)}%` }));
}
await browser.close();
