// Samples the entrance and the pointer response into one contact sheet.
// Usage: node tools/motion-check.mjs <out-dir> [base-url]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const [out = 'captures', base = 'http://localhost:4173'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const frames = [];
const grab = async (label) => frames.push({ label, data: (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64') });
await page.goto(base);
await page.waitForFunction(() => window.__futari?.state === 'entering', null, { timeout: 30000 });
const start = Date.now();
for (const ms of [200, 800, 1400, 2000, 2600, 3200, 4200]) {
	await page.waitForTimeout(Math.max(0, ms - (Date.now() - start)));
	await grab(`entrance ${ms} ms`);
}
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(600);
await grab('rest, pointer away');
await page.mouse.move(600, 360, { steps: 20 });
await page.waitForTimeout(1500);
await grab('pointer on left arm');
await page.mouse.move(715, 345, { steps: 10 });
await page.waitForTimeout(1500);
await grab('pointer on seam');
await page.mouse.move(60, 820, { steps: 20 });
await page.waitForTimeout(2500);
await grab('2.5 s after pointer left');
const html = `<body style="margin:0;background:#111;font:12px Menlo,monospace;color:#fff"><div id="g" style="display:grid;grid-template-columns:repeat(4,480px);gap:4px;padding:4px;width:max-content">${frames.map((f) => `<figure style="margin:0;position:relative"><img style="width:480px;display:block" src="data:image/jpeg;base64,${f.data}"><figcaption style="position:absolute;left:0;top:0;background:#000c;padding:2px 5px">${f.label}</figcaption></figure>`).join('')}</div></body>`;
const sheet = await browser.newPage({ viewport: { width: 1960, height: 800 } });
await sheet.setContent(html, { waitUntil: 'load' });
await (await sheet.$('#g')).screenshot({ path: path.join(out, 'motion-sheet.jpg'), type: 'jpeg', quality: 82 });
await browser.close();
console.log('wrote', path.join(out, 'motion-sheet.jpg'));
