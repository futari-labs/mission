// Scenario 4: open a project detail from the gallery, sample the open animation, try Escape, then scroll while open.
import { open, shot, sleep, sheet, URL_REF } from './lib.mjs';
const out = process.argv[2];
const { browser, page } = await open({ width: 1440, height: 900 });
await page.goto(URL_REF, { waitUntil: 'load' });
await sleep(15000);
await page.mouse.move(200, 700);
for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 100); await sleep(250); }
await sleep(3500);
const f = [];
f.push(await shot(page, out, 'd00-before'));
await page.mouse.move(720, 430, { steps: 15 }); await sleep(800);
const t0 = Date.now();
await page.mouse.click(720, 430);
for (const m of [150, 400, 800, 1300, 2000, 3000, 4500, 6500]) {
  const w = m - (Date.now() - t0); if (w > 0) await sleep(w);
  f.push(await shot(page, out, `d-open-${String(m).padStart(4, '0')}`));
}
await shot(page, out, 'detail-rest', { quality: 90 });
await page.mouse.move(400, 300, { steps: 15 }); await sleep(1200);
f.push(await shot(page, out, 'd-ptr-moved'));
await page.keyboard.press('Escape'); await sleep(2500);
f.push(await shot(page, out, 'd-after-escape'));
await sheet(f, `${out}/sheet-detail.jpg`, { cols: 4, thumbW: 450 });
await browser.close();
console.log('done');
