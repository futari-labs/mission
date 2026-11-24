// Scenario 1: load at desktop size, sample the entrance sequence, record page structure and network.
import fs from 'node:fs';
import { open, shot, sleep, sheet, URL_REF } from './lib.mjs';
const out = process.argv[2];
const { browser, page, net, logs } = await open({ width: 1440, height: 900 });
const t0 = Date.now();
page.goto(URL_REF, { waitUntil: 'commit' }).catch(e => logs.push('goto: ' + e));
const marks = [500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 15000, 20000, 26000];
const files = [];
for (const m of marks) {
  const wait = m - (Date.now() - t0); if (wait > 0) await sleep(wait);
  files.push(await shot(page, out, `intro-t${String(m).padStart(5, '0')}`));
}
const dom = await page.evaluate(() => {
  const canv = [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, style: c.getAttribute('style') }));
  const text = document.body.innerText.trim().slice(0, 1500);
  const links = [...document.querySelectorAll('a')].map(a => ({ href: a.href, text: a.innerText.trim().slice(0, 60) })).slice(0, 40);
  return {
    title: document.title, canv, text, links,
    scrollH: document.documentElement.scrollHeight, innerH: innerHeight, bodyOverflow: getComputedStyle(document.body).overflow, htmlOverflow: getComputedStyle(document.documentElement).overflow,
    elCount: document.querySelectorAll('*').length,
    bodyChildren: [...document.body.children].map(e => `${e.tagName.toLowerCase()}#${e.id}.${e.className}`.slice(0, 120)),
    fonts: [...document.fonts].map(f => `${f.family} ${f.weight} ${f.status}`),
    audio: document.querySelectorAll('audio,video').length,
  };
});
fs.writeFileSync(`${out}/dom.json`, JSON.stringify(dom, null, 2));
fs.writeFileSync(`${out}/net.json`, JSON.stringify(net, null, 2));
fs.writeFileSync(`${out}/logs.txt`, logs.join('\n'));
await browser.close();
await sheet(files, `${out}/sheet-intro.jpg`, { cols: 3, thumbW: 600 });
console.log('done', files.length, 'requests', net.length);
