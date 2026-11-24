// Scenario 3: fine-grained landscape -> gallery transition, gallery rest frame, pointer on block, click to open detail.
import { open, shot, sleep, sheet, URL_REF } from './lib.mjs';
const out = process.argv[2];
const { browser, page } = await open({ width: 1440, height: 900 });
await page.goto(URL_REF, { waitUntil: 'load' });
await sleep(15000);
await page.mouse.move(200, 700);
const tf = [];
let total = 0;
for (let i = 0; i < 20; i++) {
  await page.mouse.wheel(0, 100); total += 100;
  await sleep(650);
  tf.push(await shot(page, out, `trans-${String(total).padStart(4, '0')}`));
}
await sheet(tf, `${out}/sheet-transition.jpg`, { cols: 4, thumbW: 450 });
await sleep(2500);
await shot(page, out, 'gallery-rest-2000', { quality: 90 });
// pointer over block
const pf = [];
for (const [n, p] of [['off', [200, 700]], ['block-left', [560, 640]], ['block-mid', [700, 660]], ['block-right', [860, 640]]]) {
  await page.mouse.move(p[0], p[1], { steps: 20 }); await sleep(1500);
  pf.push(await shot(page, out, `gptr-${n}`));
}
// nudge so the "click to explore" state shows, then click the block and sample the open animation
await page.mouse.wheel(0, 250); await sleep(2500);
pf.push(await shot(page, out, 'gallery-2250'));
await page.mouse.wheel(0, 250); await sleep(2500);
pf.push(await shot(page, out, 'gallery-2500'));
await sheet(pf, `${out}/sheet-gallery-pointer.jpg`, { cols: 3, thumbW: 600 });
await browser.close();
console.log('done');
