// Samples rendering cost at each scene of the lap: draw calls, triangles, and frame intervals
// (time between animation frames as seen by the page, not GPU time), with the scene held still.
// With --uncapped the browser does not wait for the display, so an interval shows what a frame costs
// and not the refresh rate. Use it to compare two builds; it says nothing about smoothness.
// Usage: node tools/scene-cost.mjs [base-url] [--dpr=2] [--phone] [--headless] [--uncapped]
import { chromium } from 'playwright-core';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const phone = process.argv.includes('--phone');
const dpr = Number(process.argv.find((a) => a.startsWith('--dpr='))?.slice(6) ?? (phone ? 3 : 1));
const uncapped = process.argv.includes('--uncapped');
const browser = await chromium.launch({ channel: 'chrome', headless: process.argv.includes('--headless'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', ...(uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const page = await (await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: phone, hasTouch: phone })).newPage();
await page.goto(`${base}/?probe`);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
const stations = [['winter, opening', 0], ['spring, engineering building', 0.3], ['spring, engineering rest', 0.43], ['summer, kensaku building', 0.57], ['summer, kensaku rest', 0.67], ['ring passage', 0.8], ['autumn, explore rest', 1.02], ['return, start', 1.13]];
let env = null;
for (const [label, u] of stations) {
	await page.evaluate((v) => window.__futari.jump(v), u);
	await page.waitForTimeout(1000);
	await page.evaluate(() => window.__futariProbe.frames.splice(0));
	await page.waitForTimeout(1600);
	const r = await page.evaluate(() => {
		const f = window.__futariProbe.frames.splice(0).sort((a, b) => a - b);
		const s = window.__futariProbe.stats();
		return { calls: s.calls, triangles: s.triangles, meanMs: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), p95Ms: +f[Math.floor(f.length * 0.95)].toFixed(1), renderedPixelRatio: s.dpr, canvas: [s.width, s.height] };
	});
	env ??= { viewport, requestedDpr: dpr, renderedPixelRatio: r.renderedPixelRatio, emulatedPhone: phone, uncapped, chrome: browser.version() };
	console.log(label.padEnd(30), JSON.stringify({ calls: r.calls, triangles: r.triangles, meanMs: r.meanMs, p95Ms: r.p95Ms }));
}
console.log('environment'.padEnd(30), JSON.stringify(env));
await browser.close();
