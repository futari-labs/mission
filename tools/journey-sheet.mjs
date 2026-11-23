// Samples the journey at fixed progress values into one contact sheet. Each frame is the
// resolved state for that scroll position, so it shows composition, not motion.
// Usage: node tools/journey-sheet.mjs <out-file> [base-url] [--phone] [p1,p2,...]
import { chromium } from 'playwright-core';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [out = 'journey-sheet.jpg', base = 'http://localhost:4173'] = args;
const phone = process.argv.includes('--phone');
const list = args[2]?.split(',').map(Number) ?? [0, 0.09, 0.12, 0.15, 0.17, 0.185, 0.2, 0.215, 0.24, 0.28, 0.365, 0.45, 0.475, 0.5, 0.59, 0.68, 0.72, 0.76, 0.8, 1];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const page = await browser.newPage({ viewport });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?still`);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
const frames = [];
for (const p of list) {
	await page.evaluate((v) => scrollTo(0, v * (document.documentElement.scrollHeight - innerHeight)), p);
	await page.waitForTimeout(350);
	frames.push({ label: `p ${p}`, data: (await page.screenshot({ type: 'jpeg', quality: 78 })).toString('base64') });
}
const opt = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const cols = opt('cols', phone ? 10 : 5);
const w = opt('w', phone ? 190 : 384);
const html = `<body style="margin:0;background:#111;font:11px Menlo,monospace;color:#fff"><div id="g" style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:3px;padding:3px;width:max-content">${frames.map((f) => `<figure style="margin:0;position:relative"><img style="width:${w}px;display:block" src="data:image/jpeg;base64,${f.data}"><figcaption style="position:absolute;left:0;top:0;background:#000c;padding:1px 4px">${f.label}</figcaption></figure>`).join('')}</div></body>`;
const sheet = await browser.newPage({ viewport: { width: cols * (w + 3) + 6, height: 800 } });
await sheet.setContent(html, { waitUntil: 'load' });
await (await sheet.$('#g')).screenshot({ path: out, type: 'jpeg', quality: 84 });
await browser.close();
console.log('wrote', out, errors.slice(0, 3).join(' | ') || 'no errors');
