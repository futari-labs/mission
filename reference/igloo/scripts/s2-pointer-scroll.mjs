// Scenario 2: pointer response at rest, then a coarse wheel-scroll pass through the whole journey.
import fs from 'node:fs';
import { open, shot, sleep, sheet, URL_REF } from './lib.mjs';
const out = process.argv[2];
const { browser, page, logs } = await open({ width: 1440, height: 900 });
await page.goto(URL_REF, { waitUntil: 'load' });
await sleep(15000);
const html = await page.evaluate(() => document.body.outerHTML.replace(/\s+/g, ' ').slice(0, 2500));
fs.writeFileSync(`${out}/../body.html.txt`, html);
fs.mkdirSync(out, { recursive: true });
// pointer: corners and centre, then dwell on a block
const pts = [['none', null], ['left', [150, 450]], ['right', [1290, 450]], ['top', [720, 80]], ['bottom', [720, 820]], ['block-a', [600, 400]], ['block-b', [760, 400]], ['block-c', [650, 500]], ['entrance', [960, 500]]];
const pf = [];
for (const [name, p] of pts) {
  if (p) { await page.mouse.move(p[0], p[1], { steps: 25 }); await sleep(1600); }
  pf.push(await shot(page, out, `ptr-${name}`));
}
await page.mouse.move(720, 450, { steps: 10 });
await sheet(pf, `${out}/sheet-pointer.jpg`, { cols: 3, thumbW: 600 });
// click test on a block (does it do anything?)
await page.mouse.click(600, 400); await sleep(1500);
await shot(page, out, 'ptr-click-block');
// coarse scroll pass
const sf = [];
const state = [];
for (let i = 1; i <= 48; i++) {
  await page.mouse.wheel(0, 500);
  await sleep(1100);
  sf.push(await shot(page, out, `scroll-${String(i).padStart(2, '0')}`));
  state.push(await page.evaluate(() => ({ y: scrollY, h: document.documentElement.scrollHeight, text: document.body.innerText.trim().slice(0, 80) })));
}
fs.writeFileSync(`${out}/scroll-state.json`, JSON.stringify(state));
fs.writeFileSync(`${out}/logs.txt`, logs.join('\n'));
await browser.close();
for (let k = 0; k < sf.length; k += 12) await sheet(sf.slice(k, k + 12), `${out}/sheet-scroll-${k / 12 + 1}.jpg`, { cols: 3, thumbW: 600 });
console.log('done');
