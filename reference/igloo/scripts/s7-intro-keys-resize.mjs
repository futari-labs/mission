// Scenario 7: entrance sequence at a finer cadence, keyboard probe, live resize probe.
import { open, shot, sleep, sheet, URL_REF } from './lib.mjs';
import fs from 'node:fs';
const out = process.argv[2];
const { browser, page } = await open({ width: 1440, height: 900 });
const t0 = Date.now();
page.goto(URL_REF, { waitUntil: 'commit' }).catch(() => {});
const f = [];
for (let m = 600; m <= 9000; m += 350) { const w = m - (Date.now() - t0); if (w > 0) await sleep(w); f.push(await shot(page, out, `in-${String(m).padStart(5, '0')}`)); }
await sheet(f, `${out}/sheet-intro-fine.jpg`, { cols: 5, thumbW: 360 });
await shot(page, out, 'loader-crop', { clip: { x: 520, y: 350, width: 400, height: 200 } });
await sleep(6000);
// keyboard probe
const k = [];
k.push(await shot(page, out, 'k0'));
for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowDown'); await sleep(200); }
await sleep(1500); k.push(await shot(page, out, 'k1-arrowdown-x12'));
for (let i = 0; i < 4; i++) { await page.keyboard.press('Space'); await sleep(300); }
await sleep(1500); k.push(await shot(page, out, 'k2-space-x4'));
for (let i = 0; i < 4; i++) { await page.keyboard.press('PageDown'); await sleep(300); }
await sleep(1500); k.push(await shot(page, out, 'k3-pagedown-x4'));
for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); await sleep(200); }
await sleep(800); k.push(await shot(page, out, 'k4-tab-x5'));
const focus = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
// resize probe: go to gallery, then shrink and grow
for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 100); await sleep(250); }
await sleep(3000);
await page.setViewportSize({ width: 700, height: 900 }); await sleep(2500);
k.push(await shot(page, out, 'r1-700x900'));
await page.setViewportSize({ width: 1440, height: 600 }); await sleep(2500);
k.push(await shot(page, out, 'r2-1440x600'));
await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(2500);
k.push(await shot(page, out, 'r3-1920x1080'));
await sheet(k, `${out}/sheet-keys-resize.jpg`, { cols: 4, thumbW: 450 });
fs.writeFileSync(`${out}/focus.txt`, String(focus));
await browser.close();
console.log('done focus=', focus);
