// Scenario 6: phone and tablet composition at the three resting states, plus a reduced-motion probe.
import { open, shot, sleep, sheet, URL_REF } from './lib.mjs';
const out = process.argv[2];
async function journey(tag, opts, useTouch) {
  const { browser, context, page } = await open(opts);
  await page.goto(URL_REF, { waitUntil: 'load' });
  await sleep(15000);
  const f = [];
  f.push(await shot(page, out, `${tag}-1-hero`));
  const cdp = await context.newCDPSession(page);
  let total = 0;
  const scroll = async (d, settle) => {
    if (useTouch) await cdp.send('Input.synthesizeScrollGesture', { x: opts.width / 2, y: opts.height * 0.7, yDistance: -d, speed: 1600, gestureSourceType: 'touch' });
    else await page.mouse.wheel(0, d);
    total += d; await sleep(settle);
  };
  for (let i = 0; i < 6; i++) await scroll(250, 500);
  f.push(await shot(page, out, `${tag}-2-after1500`));
  for (let i = 0; i < 2; i++) await scroll(250, 500);
  await sleep(3000);
  f.push(await shot(page, out, `${tag}-3-after2000`));
  for (let i = 0; i < 6; i++) await scroll(250, 500);
  await sleep(3000);
  f.push(await shot(page, out, `${tag}-4-after3500`));
  for (let i = 0; i < 26; i++) await scroll(250, 450);
  await sleep(3500);
  f.push(await shot(page, out, `${tag}-5-after10000`));
  await browser.close();
  return f;
}
const phone = await journey('phone', { width: 390, height: 844, dpr: 2, mobile: true, touch: true }, true);
await sheet(phone, `${out}/sheet-phone.jpg`, { cols: 5, thumbW: 360 });
const tablet = await journey('tablet', { width: 820, height: 1180, dpr: 1, mobile: true, touch: true }, true);
await sheet(tablet, `${out}/sheet-tablet.jpg`, { cols: 5, thumbW: 360 });
// reduced motion probe
const { browser, page } = await open({ width: 1440, height: 900, reducedMotion: 'reduce' });
const t0 = Date.now();
page.goto(URL_REF, { waitUntil: 'commit' }).catch(() => {});
const rf = [];
for (const m of [3000, 7500, 10000, 14000]) { const w = m - (Date.now() - t0); if (w > 0) await sleep(w); rf.push(await shot(page, out, `rm-t${String(m).padStart(5, '0')}`)); }
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 250); await sleep(500); }
rf.push(await shot(page, out, 'rm-after1500'));
await browser.close();
await sheet(rf, `${out}/sheet-reduced-motion.jpg`, { cols: 5, thumbW: 360 });
console.log('done');
