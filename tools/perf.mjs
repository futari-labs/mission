// Measures frame intervals (time between animation frames as seen by the page, not GPU time),
// draw calls, triangles, and loading for the opening and, when the page scrolls, the full journey.
// --phone is a phone-sized frame with touch emulation on this machine's GPU. It is not a phone.
// Usage: node tools/perf.mjs [base-url] [--headless] [--dpr=2] [--phone]
import { chromium } from 'playwright-core';

const base = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const headless = process.argv.includes('--headless');
const phone = process.argv.includes('--phone');
const dpr = Number(process.argv.find((a) => a.startsWith('--dpr='))?.slice(6) ?? (phone ? 3 : 1));
const browser = await chromium.launch({ channel: 'chrome', headless, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
// the phone frame is an iPhone 17 Pro's: 402x874 CSS pixels at 3x
const viewport = phone ? { width: 402, height: 874 } : { width: 1440, height: 900 };
const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: phone, hasTouch: phone });
const page = await context.newPage();

const summarize = (frames) => {
	const s = [...frames].sort((a, b) => a - b);
	const at = (q) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
	return { frames: s.length, mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1), p50: +at(0.5).toFixed(1), p95: +at(0.95).toFixed(1), p99: +at(0.99).toFixed(1), max: +s[s.length - 1].toFixed(1), over33ms: s.filter((x) => x > 33.4).length };
};
const take = async (label) => {
	const r = await page.evaluate(() => {
		const probe = window.__futariProbe;
		const frames = probe.frames.splice(0);
		// the camera log has one entry of four numbers per frame, the last being the position in the lap
		const first = probe.camera.length / 4 - frames.length;
		const slowAt = frames.flatMap((ms, i) => (ms > 33.4 ? [`${probe.camera[(first + i) * 4 + 3].toFixed(3)} (${Math.round(ms)} ms)`] : []));
		return { frames, slowAt, stats: probe.stats() };
	});
	console.log(label.padEnd(26), JSON.stringify({ ...summarize(r.frames), calls: r.stats.calls, triangles: r.stats.triangles, ...(r.slowAt.length ? { slowAt: r.slowAt } : {}) }));
	return r.stats;
};

const t0 = Date.now();
await page.goto(`${base}/?probe`);
await page.waitForFunction(() => window.__futari?.state === 'entering', null, { timeout: 30000 });
const enteringAt = Date.now() - t0;
await page.evaluate(() => window.__futariProbe.frames.splice(0));
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
const stats = await take('entrance');
const load = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /assets\/.*\.(glb|png|bin)|Engine/.test(r.name)).map((r) => ({ name: r.name.split('/').pop().slice(0, 28), kb: Math.round(r.transferSize / 1024), ms: Math.round(r.responseEnd) })));
console.log('environment'.padEnd(26), JSON.stringify({ chrome: browser.version(), headless, viewport, dpr: stats.dpr, canvas: [stats.width, stats.height], drawingBuffer: [stats.bufferWidth, stats.bufferHeight], tier: stats.tierName, samples: stats.msaa, sceneVisibleAfterMs: enteringAt }));
console.log('loading'.padEnd(26), JSON.stringify(load));

await page.waitForTimeout(1500);
await page.evaluate(() => window.__futariProbe.frames.splice(0));
await page.waitForTimeout(3000);
await take('rest, 3 s');
for (let i = 0; i < 4; i++) {
	await page.mouse.move(viewport.width * 0.25, viewport.height * 0.42, { steps: 30 });
	await page.mouse.move(viewport.width * 0.75, viewport.height * 0.4, { steps: 30 });
}
await take('pointer sweeps');

const lap = await page.evaluate(() => window.__futari.unitPixels() * window.__futari.map.cycle);
if (lap > 50) {
	await page.mouse.move(viewport.width / 2, viewport.height / 2);
	const scroll = async (dir, label) => {
		await page.evaluate(() => window.__futariProbe.frames.splice(0));
		// about one viewport per second, in small wheel steps, like a steady trackpad scroll
		const step = (viewport.height / 60) * dir;
		for (let y = 0; y < lap; y += Math.abs(step)) {
			await page.mouse.wheel(0, step);
			await page.waitForTimeout(16);
		}
		await page.waitForTimeout(600);
		const s = await take(label);
		return s;
	};
	const before = await page.evaluate(() => window.__futariProbe.stats());
	await scroll(1, 'lap 1, downward');
	await scroll(1, 'lap 2, downward');
	await scroll(-1, 'one lap upward');
	const after = await page.evaluate(() => ({ ...window.__futariProbe.stats(), requests: performance.getEntriesByType('resource').length, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6) }));
	console.log('resources'.padEnd(26), JSON.stringify({ programs: [before.programs, after.programs], geometries: [before.geometries, after.geometries], textures: [before.textures, after.textures], requests: after.requests, heapMB: after.heapMB, rebases: after.rebases, tierAtEnd: after.tierName, governor: after.governor }));
}
await browser.close();
