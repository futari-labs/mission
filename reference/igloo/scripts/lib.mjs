import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36';
export const URL_REF = 'https://www.igloo.inc/';
const ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

export async function open({ width = 1440, height = 900, dpr = 1, mobile = false, touch = false, reducedMotion = 'no-preference', video = null } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ARGS });
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: touch,
    userAgent: mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : UA,
    reducedMotion, ...(video ? { recordVideo: { dir: video, size: { width, height } } } : {}),
  });
  const page = await context.newPage();
  const net = [];
  page.on('response', async r => {
    try {
      const h = r.headers();
      net.push({ url: r.url(), status: r.status(), type: h['content-type'] || '', len: Number(h['content-length'] || 0), enc: h['content-encoding'] || '' });
    } catch {}
  });
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
  page.on('pageerror', e => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
  return { browser, context, page, net, logs };
}

export async function shot(page, dir, name, opts = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: opts.quality ?? 82, ...(opts.clip ? { clip: opts.clip } : {}) });
  return file;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Compose labelled thumbnails into one image so many frames can be reviewed at once.
export async function sheet(files, out, { cols = 3, thumbW = 640, labels = null } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const imgs = files.map((f, i) => {
    const b64 = fs.readFileSync(f).toString('base64');
    const label = labels ? labels[i] : path.basename(f, '.jpg');
    return `<figure><img src="data:image/jpeg;base64,${b64}"><figcaption>${label}</figcaption></figure>`;
  }).join('');
  const html = `<html><body style="margin:0;background:#111;font:12px/1.2 Menlo,monospace;color:#fff"><div id="g" style="display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:4px;padding:4px;width:max-content">${imgs}</div><style>figure{margin:0;position:relative}img{width:${thumbW}px;display:block}figcaption{position:absolute;left:0;top:0;background:#000c;padding:2px 5px}</style></body></html>`;
  const page = await browser.newPage({ viewport: { width: cols * (thumbW + 4) + 8, height: 800 } });
  await page.setContent(html, { waitUntil: 'load' });
  const el = await page.$('#g');
  await el.screenshot({ path: out, type: 'jpeg', quality: 80 });
  await browser.close();
  return out;
}
