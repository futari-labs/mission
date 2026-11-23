import { chromium } from 'playwright-core';
import fs from 'node:fs'; import path from 'node:path';
const root = process.cwd(), out = path.join(root, 'out'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
async function grab(name, cam, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await page.route('http://spike.local/**', r => { const u = new URL(r.request().url()); const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname); if (!f.startsWith(root) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: 'nf' }); r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' }); });
  await page.goto(`http://spike.local/?cam=${cam}`);
  await page.waitForFunction(() => window.__spike && window.__spike.ready, null, { timeout: 30000 }).catch(() => {});
  const info = await page.evaluate(() => window.__spike || null);
  await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 88 });
  console.log(name, JSON.stringify(info), errs.slice(0, 3).join(' | '));
  await page.close();
}
await grab('hero-1440', 'hero', 1440, 900);
await grab('side-1440', 'side', 1440, 900);
await grab('close-1440', 'close', 1440, 900);
await grab('thumb-160', 'hero', 160, 100);
await grab('phone-390', 'phone', 390, 844);
await browser.close();
