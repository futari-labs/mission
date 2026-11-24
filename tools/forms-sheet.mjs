// Captures the three particle forms of the Explore installation, one frame each.
// Usage: node tools/forms-sheet.mjs <out-file> [base-url] [--phone]
import { chromium } from 'playwright-core';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [out = 'forms.jpg', base = 'http://localhost:4173'] = args;
const phone = process.argv.includes('--phone');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const page = await browser.newPage({ viewport });
await page.goto(`${base}/?still`);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.evaluate(() => window.__futari.jump(1.02));
await page.waitForTimeout(600);
const frames = [];
for (let i = 0; i < 3; i++) {
	if (i > 0) await page.locator('.step-next').click();
	await page.waitForTimeout(2200);
	frames.push((await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64'));
}
const w = phone ? 300 : 640;
const sheet = await browser.newPage({ viewport: { width: 3 * (w + 3) + 6, height: 600 } });
await sheet.setContent(`<body style="margin:0;background:#111"><div id="g" style="display:grid;grid-template-columns:repeat(3,${w}px);gap:3px;padding:3px;width:max-content">${frames.map((f) => `<img style="width:${w}px;display:block" src="data:image/jpeg;base64,${f}">`).join('')}</div></body>`, { waitUntil: 'load' });
await (await sheet.$('#g')).screenshot({ path: out, type: 'jpeg', quality: 86 });
console.log('wrote', out);
await browser.close();
