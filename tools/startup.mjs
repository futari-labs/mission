// Measures stalls while the page loads and the first time the journey reaches each chapter:
// frame intervals over 34 ms from the first frame to the end of the entrance, and the longest frame
// after first arriving at each station. Every load is a new browser context with an empty cache.
// Intervals are time between animation frames, on this machine. They are not a phone's.
// Usage: node tools/startup.mjs [base-url] [--loads=5] [--desktop] [--label=text]
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const loads = Number(flag('loads') ?? 5);
const desktop = args.includes('--desktop');
const viewport = desktop ? { width: 1440, height: 900 } : { width: 402, height: 874 };
const stations = [0.3, 0.43, 0.67, 0.8, 1.02, 1.19];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });

const rows = [];
for (let i = 0; i < loads; i++) {
	const context = await browser.newContext({ viewport, deviceScaleFactor: desktop ? 1 : 3, isMobile: !desktop, hasTouch: !desktop });
	const page = await context.newPage();
	const t0 = Date.now();
	await page.goto(`${base}/?probe`);
	await page.waitForFunction(() => window.__futari?.state === 'entering' || window.__futari?.state === 'ready', null, { timeout: 30000 });
	const shownAfter = Date.now() - t0;
	await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	const entrance = await page.evaluate(() => {
		const p = window.__futariProbe;
		// the first interval is the time since the loop was started, not a frame
		const frames = p.frames.slice(1);
		const slow = frames.flatMap((ms, k) => (ms > 34 ? [`#${k + 2}: ${Math.round(ms)}`] : []));
		return { frames: frames.length, over34: slow.length, longest: Math.max(0, ...frames), inSlow: frames.filter((ms) => ms > 34).reduce((a, b) => a + b, 0), slow, firstScript: p.script[0] ?? 0, programs: p.stats().programs };
	});
	const arrivals = [];
	for (const u of stations) {
		await page.evaluate((v) => {
			window.__futariProbe.frames.length = 0;
			window.__futari.jump(v);
		}, u);
		await page.waitForTimeout(700);
		arrivals.push(await page.evaluate(() => Math.max(0, ...window.__futariProbe.frames)));
	}
	rows.push({ shownAfter, ...entrance, arrivals });
	await context.close();
}
await browser.close();

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const line = (name, values) => console.log(`${name.padEnd(42)} ${String(Math.round(median(values))).padStart(4)}  [${Math.round(Math.min(...values))}-${Math.round(Math.max(...values))}]`);
console.log(`# ${flag('label') ?? base}: ${viewport.width}x${viewport.height}, ${desktop ? 'desktop' : 'touch emulation at 3x'}, ${loads} loads with an empty cache. Milliseconds, median [range]. Desktop CPU and GPU.`);
line('scene first shown after', rows.map((r) => r.shownAfter));
line('script in the first frame', rows.map((r) => r.firstScript));
line('frames over 34 ms until the entrance ends', rows.map((r) => r.over34));
line('longest frame until the entrance ends', rows.map((r) => r.longest));
line('time in frames over 34 ms', rows.map((r) => r.inSlow));
for (const [s, u] of stations.entries()) line(`longest frame on first arrival at ${u}`, rows.map((r) => r.arrivals[s]));
line('shader programs after the entrance', rows.map((r) => r.programs));
console.log('slow frames of each load (frame number: interval):');
for (const r of rows) console.log(`  ${r.slow.join('  ') || 'none'}`);
