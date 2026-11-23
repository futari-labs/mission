// Captures the resting composition of every chapter from a running preview server.
// Usage: node tools/capture.mjs <out-dir> [base-url] [--bare]
// --bare hides the HTML overlay. Use it to regenerate public/fallback/.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [out = 'captures', base = 'http://localhost:4173'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const bare = process.argv.includes('--bare');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const views = [
	{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
	{ name: 'phone', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
const rests = { lab: 0, engineering: 0.365, kensaku: 0.59, explore: 1 };
for (const v of views) {
	const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.deviceScaleFactor, isMobile: v.isMobile, hasTouch: v.hasTouch });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text()));
	await page.goto(`${base}/?still`);
	await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	await page.waitForTimeout(2500);
	if (bare) await page.addStyleTag({ content: '.brand,.chapters,.panel,.loader{visibility:hidden}' });
	for (const [chapter, rest] of Object.entries(rests)) {
		await page.evaluate((p) => scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight)), rest);
		await page.waitForFunction((c) => window.__futari?.chapter === c, chapter, { timeout: 10000 }).catch(() => errors.push(`chapter ${chapter} not reached`));
		await page.waitForTimeout(700);
		await page.screenshot({ path: path.join(out, `${chapter}-${v.name}.jpg`), type: 'jpeg', quality: 90 });
	}
	console.log(v.name, errors.slice(0, 4).join(' | ') || 'no errors');
	await context.close();
}
await browser.close();
