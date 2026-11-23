// Captures the opening scene from a running preview server.
// Usage: node tools/capture.mjs <out-dir> [base-url] [--entrance] [--bare]
// --bare hides the HTML overlay. Use it to regenerate public/fallback/.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [out = 'captures', base = 'http://localhost:4173'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const entrance = process.argv.includes('--entrance');
const bare = process.argv.includes('--bare');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const views = [
	{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
	{ name: 'phone', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
for (const v of views) {
	const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
	const t0 = Date.now();
	await page.goto(`${base}/${entrance ? '' : '?still'}`);
	if (entrance) {
		await page.waitForFunction(() => window.__futari?.state === 'entering', null, { timeout: 30000 });
		const start = Date.now();
		for (const ms of [150, 700, 1300, 1900, 2500, 3100, 3700, 4600]) {
			await page.waitForTimeout(Math.max(0, ms - (Date.now() - start)));
			await page.screenshot({ path: path.join(out, `entrance-${v.name}-${String(ms).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 85 });
		}
	} else {
		await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
		await page.waitForTimeout(700);
		if (bare) await page.addStyleTag({ content: '.mast,.intro,.hint,.loader{visibility:hidden}' });
		await page.screenshot({ path: path.join(out, `hero-${v.name}.jpg`), type: 'jpeg', quality: 90 });
	}
	console.log(v.name, `${Date.now() - t0} ms`, errors.slice(0, 4).join(' | ') || 'no errors');
	await context.close();
}
await browser.close();
