// Scrolls the real page at a steady speed and samples frames along the way into a contact sheet.
// These are frames from live motion, labelled with the progress the scene had reached.
// It shows what each moment looks like. It cannot show whether the motion feels smooth.
// Usage: node tools/motion-sheet.mjs <out-file> [base-url] [--from=0.04] [--to=0.84] [--reverse] [--phone]
import { chromium } from 'playwright-core';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [out = 'motion-sheet.jpg', base = 'http://localhost:4173'] = args;
const opt = (k, d) => Number(process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const phone = process.argv.includes('--phone');
const reverse = process.argv.includes('--reverse');
const from = opt("from", 0), to = opt("to", 1.2), every = opt("every", 0.034);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const page = await browser.newPage({ viewport });
await page.goto(`${base}/?probe`);
await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(2500);
// positions are journey units and may run past one lap (1.16) to show the loop
const unit = await page.evaluate(() => window.__futari.unitPixels());
const [a, b] = reverse ? [to, from] : [from, to];
await page.evaluate((u) => window.__futari.jump(u), a);
await page.waitForTimeout(1500);
await page.mouse.move(viewport.width / 2, viewport.height / 2);
const frames = [];
let next = a;
const dir = Math.sign(b - a);
const step = (viewport.height * 0.8) / 60;
for (let y = a * unit; dir > 0 ? y <= b * unit : y >= b * unit; y += step * dir) {
	await page.mouse.wheel(0, step * dir);
	await page.waitForTimeout(16);
	const u = await page.evaluate(() => window.__futariProbe.stats().travel * window.__futari.map.cycle);
	if (dir > 0 ? u >= next : u <= next) {
		frames.push({ label: `u ${u.toFixed(3)}`, data: (await page.screenshot({ type: 'jpeg', quality: 76 })).toString('base64') });
		next += every * dir;
	}
}
const cols = opt('cols', phone ? 12 : 6);
const w = opt('w', phone ? 160 : 320);
const html = `<body style="margin:0;background:#111;font:11px Menlo,monospace;color:#fff"><div id="g" style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:3px;padding:3px;width:max-content">${frames.map((f) => `<figure style="margin:0;position:relative"><img style="width:${w}px;display:block" src="data:image/jpeg;base64,${f.data}"><figcaption style="position:absolute;left:0;top:0;background:#000c;padding:1px 4px">${f.label}</figcaption></figure>`).join('')}</div></body>`;
const sheet = await browser.newPage({ viewport: { width: cols * (w + 3) + 6, height: 800 } });
await sheet.setContent(html, { waitUntil: 'load' });
await (await sheet.$('#g')).screenshot({ path: out, type: 'jpeg', quality: 84 });
await browser.close();
console.log('wrote', out, frames.length, 'frames');
