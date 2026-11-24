// Still frames along the lap from a running preview server, with the draw calls and triangles of
// each, for comparing two builds or two settings image for image. Time is held (?still), so two
// runs of the same build give the same pixels.
// Usage: node tools/env-frames.mjs <out-dir> [base-url] [--phone] [--dpr=3] [--query=msaa=0&dpr=1.25] [--at=0.3,0.43] [--steps=40] [--reverse]
// With a second directory: node tools/env-frames.mjs --diff <dir-a> <dir-b>   counts the pixels that differ.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const plain = args.filter((a) => !a.startsWith('--'));

if (args.includes('--diff')) {
	const [a, b] = plain;
	let worst = 0;
	for (const file of fs.readdirSync(a).filter((f) => f.endsWith('.png')).sort()) {
		if (!fs.existsSync(path.join(b, file))) continue;
		const [x, y] = await Promise.all([a, b].map((d) => sharp(path.join(d, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
		if (x.info.width !== y.info.width || x.info.height !== y.info.height) {
			console.log(file.padEnd(16), 'sizes differ');
			continue;
		}
		let over = 0;
		let max = 0;
		let sum = 0;
		for (let i = 0; i < x.data.length; i += 3) {
			const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2]));
			if (d > 8) over++;
			if (d > max) max = d;
			sum += d;
		}
		const pixels = x.data.length / 3;
		worst = Math.max(worst, over / pixels);
		console.log(file.padEnd(16), JSON.stringify({ over8: over, share: `${((100 * over) / pixels).toFixed(3)}%`, max, mean: +(sum / pixels).toFixed(3) }));
	}
	console.log('worst share over 8 levels:', `${(100 * worst).toFixed(3)}%`);
	process.exit(0);
}

const [out = 'frames', base = 'http://localhost:4173'] = plain;
const phone = args.includes('--phone');
const dpr = Number(flag('dpr') ?? (phone ? 3 : 1));
const query = flag('query') ?? '';
const steps = Number(flag('steps') ?? 32);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const viewport = phone ? { width: 402, height: 874 } : { width: 1440, height: 900 };
const page = await (await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: phone, hasTouch: phone })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 200)));
await page.goto(`${base}/?still&probe${query ? `&${query}` : ''}`);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.addStyleTag({ content: '.brand,.chapters,.panel,.loader,.mast{visibility:hidden}' });
// what is on the GPU before any travel: if the warm-up did its work, a lap adds nothing to it
const start = await page.evaluate(() => window.__futariProbe.stats());
const cycle = await page.evaluate(() => window.__futari.map.cycle);
let at = flag('at') ? flag('at').split(',').map(Number) : Array.from({ length: steps }, (_, i) => +((i / steps) * cycle).toFixed(4));
if (args.includes('--reverse')) at = [...at].reverse();
for (const u of at) {
	await page.evaluate((v) => window.__futari.jump(v), u);
	await page.waitForTimeout(350);
	const s = await page.evaluate(() => window.__futariProbe.stats());
	await page.screenshot({ path: path.join(out, `${u.toFixed(4)}.png`), type: 'png' });
	console.log(u.toFixed(4), JSON.stringify({ calls: s.calls, triangles: s.triangles }));
}
const end = await page.evaluate(() => ({ ...window.__futariProbe.stats(), assets: performance.getEntriesByType('resource').filter((r) => r.name.includes('/assets/')).map((r) => `${r.name.split('/').pop()} ${Math.round(r.transferSize / 1024)} kB`) }));
console.log('resources', JSON.stringify({ programs: [start.programs, end.programs], geometries: [start.geometries, end.geometries], textures: [start.textures, end.textures], assets: end.assets }));
console.log(errors.length ? `errors: ${errors.slice(0, 4).join(' | ')}` : 'no errors');
await browser.close();
