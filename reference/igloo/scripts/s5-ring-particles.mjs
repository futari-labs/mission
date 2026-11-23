// Scenario 5: second exhibit, passage through the ring into the particle chapter, particle rest, pointer disturbance, link switching.
import { open, shot, sleep, sheet, URL_REF } from './lib.mjs';
const out = process.argv[2];
const { browser, page } = await open({ width: 1440, height: 900 });
await page.goto(URL_REF, { waitUntil: 'load' });
await sleep(15000);
await page.mouse.move(200, 700);
let total = 0;
const wheel = async (d, settle) => { await page.mouse.wheel(0, d); total += d; await sleep(settle); };
while (total < 3500) await wheel(250, 450);
await sleep(3500);
await shot(page, out, 'block2-rest', { quality: 90 });
const pass = [];
while (total < 9500) { await wheel(250, 700); pass.push(await shot(page, out, `pass-${String(total).padStart(5, '0')}`)); }
await sheet(pass, `${out}/sheet-passage.jpg`, { cols: 4, thumbW: 450 });
while (total < 10000) await wheel(250, 600);
await sleep(4000);
await shot(page, out, 'particles-rest', { quality: 90 });
const pf = [];
pf.push(await shot(page, out, 'p0-rest'));
// sweep the pointer through the particle body
await page.mouse.move(500, 450); await sleep(300);
await page.mouse.move(900, 450, { steps: 12 });
pf.push(await shot(page, out, 'p1-sweep-000'));
await sleep(350); pf.push(await shot(page, out, 'p1-sweep-350'));
await sleep(900); pf.push(await shot(page, out, 'p1-sweep-1250'));
await page.mouse.move(720, 430, { steps: 8 }); await sleep(1500);
pf.push(await shot(page, out, 'p2-hover-centre'));
await page.mouse.move(200, 200, { steps: 8 }); await sleep(2500);
pf.push(await shot(page, out, 'p3-returned'));
// switch link: right arrow
const t0 = Date.now();
await page.mouse.click(1147, 420);
for (const m of [200, 600, 1200, 2200, 4000]) { const w = m - (Date.now() - t0); if (w > 0) await sleep(w); pf.push(await shot(page, out, `p4-next-${String(m).padStart(4, '0')}`)); }
await page.mouse.click(1147, 420); await sleep(4000);
pf.push(await shot(page, out, 'p5-next2'));
await page.mouse.click(1147, 420); await sleep(4000);
pf.push(await shot(page, out, 'p6-next3'));
await page.mouse.click(329, 420); await sleep(4000);
pf.push(await shot(page, out, 'p7-prev'));
await sheet(pf, `${out}/sheet-particles.jpg`, { cols: 4, thumbW: 450 });
await shot(page, out, 'particles-rest-b', { quality: 90 });
await browser.close();
console.log('done');
