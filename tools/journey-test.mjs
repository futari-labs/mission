// Functional checks of the journey in a real browser: chapters, links, project details,
// keyboard focus, touch, reduced motion, and the fallbacks. Exits non-zero on any failure.
// Usage: node tools/journey-test.mjs [base-url]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:4173';
const gpu = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const to = (page, p) => page.evaluate((v) => scrollTo(0, v * (document.documentElement.scrollHeight - innerHeight)), p);
const chapter = (page) => page.evaluate(() => window.__futari?.chapter ?? null);
const LINKS = ['https://github.com/futari-labs', 'https://github.com/futari-labs/engineering', 'https://github.com/futari-labs/kensaku'];

async function open(args, ctx = {}, url = base) {
	const browser = await chromium.launch({ channel: 'chrome', headless: true, args });
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctx });
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
	await page.goto(url);
	await page.waitForFunction(() => ['ready', 'unavailable', 'failed'].includes(window.__futari?.state), null, { timeout: 30000 });
	return { browser, page, errors };
}

// ---- desktop, pointer and keyboard
let { browser, page, errors } = await open(gpu);
await page.waitForTimeout(2500);
const order = [];
for (const p of [0, 0.365, 0.59, 1, 0.59, 0.365, 0]) { await to(page, p); await page.waitForTimeout(1300); order.push(await chapter(page)); }
check('chapters resolve forward and back', order.join() === 'lab,engineering,kensaku,explore,kensaku,engineering,lab', order.join());
const hrefs = await page.evaluate(() => [...document.querySelectorAll('.destinations a')].map((a) => a.href));
check('three exact destinations', JSON.stringify(hrefs.map((h) => h.replace(/\/$/, ''))) === JSON.stringify(LINKS), hrefs.join(' '));
check('one h1', (await page.locator('h1').count()) === 1);

for (const [id, repo] of [['engineering', LINKS[1]], ['kensaku', LINKS[2]]]) {
	await page.click(`nav.chapters a[href="#${id === 'kensaku' ? 'engineering' : id}"]`);
	await to(page, id === 'kensaku' ? 0.59 : 0.365);
	await page.waitForTimeout(1400);
	const before = await page.evaluate(() => scrollY);
	const button = page.locator(`#${id} button.bracket`);
	await button.focus();
	await page.keyboard.press('Enter');
	await page.waitForTimeout(500);
	const inside = await page.evaluate(() => ({ open: document.querySelector('dialog').open, focusInDialog: !!document.activeElement.closest('dialog'), title: document.querySelector('#details-title')?.textContent, repo: document.querySelector('dialog a.arrow')?.href, text: document.querySelector('dialog').textContent }));
	check(`${id}: details open by keyboard, focus inside`, inside.open && inside.focusInDialog, inside.title);
	check(`${id}: repository link`, inside.repo === repo, inside.repo);
	if (id === 'kensaku') check('kensaku: sandbox stated', /sandbox/i.test(inside.text) && /no real money/i.test(inside.text) && /no merchant order/i.test(inside.text));
	await page.mouse.wheel(0, 600);
	await page.keyboard.press('Escape');
	await page.waitForTimeout(500);
	const after = await page.evaluate((sel) => ({ open: document.querySelector('dialog').open, back: document.activeElement === document.querySelector(sel), y: scrollY }), `#${id} button.bracket`);
	check(`${id}: Escape closes, focus returns, scroll unchanged`, !after.open && after.back && Math.abs(after.y - before) < 2, `scroll ${before} -> ${after.y}`);
	check(`${id}: still the same chapter`, (await chapter(page)) === id);
	await button.click();
	await page.waitForTimeout(400);
	await page.locator('dialog button.close').click();
	await page.waitForTimeout(400);
	check(`${id}: opens by click, close button closes`, !(await page.evaluate(() => document.querySelector('dialog').open)));
}

// keyboard focus on a link in another chapter brings that chapter into view and selects its form
await to(page, 0);
await page.waitForTimeout(1200);
await page.locator('.destinations a').nth(2).focus();
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
await page.waitForTimeout(1600);
const focused = await page.evaluate(() => ({ chapter: window.__futari.chapter, current: [...document.querySelectorAll('.destinations a')].findIndex((a) => a.getAttribute('aria-current')) }));
check('keyboard focus reveals the explore chapter', focused.chapter === 'explore', focused.chapter);
check('focused link becomes the selected form', focused.current === 2, `index ${focused.current}`);
await page.locator('.step-next').click();
check('next button cycles the selection', (await page.evaluate(() => [...document.querySelectorAll('.destinations a')].findIndex((a) => a.getAttribute('aria-current')))) === 0);
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();

// ---- touch, phone size
({ browser, page, errors } = await open(gpu, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }));
await page.waitForTimeout(2500);
await to(page, 0.365); await page.waitForTimeout(1400);
await page.tap('#engineering button.bracket'); await page.waitForTimeout(500);
check('touch: details open by tap', await page.evaluate(() => document.querySelector('dialog').open));
await page.tap('dialog button.close'); await page.waitForTimeout(400);
await to(page, 1); await page.waitForTimeout(1500);
await page.tap('.step-next'); await page.waitForTimeout(300);
check('touch: next button selects without hover', (await page.evaluate(() => [...document.querySelectorAll('.destinations a')].findIndex((a) => a.getAttribute('aria-current')))) === 1);
const small = await page.evaluate(() => [...document.querySelectorAll('.panel[data-active="true"] a, .panel[data-active="true"] button')].map((e) => e.getBoundingClientRect()).filter((r) => r.height < 40).length);
check('touch: targets at least 40 px tall', small === 0, `${small} smaller`);
await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(1200);
check('rotation keeps the chapter', (await chapter(page)) === 'explore');
await browser.close();

// ---- reduced motion
({ browser, page } = await open(gpu, { reducedMotion: 'reduce' }));
await page.waitForTimeout(2000);
const rm = [];
for (const p of [0, 0.2, 0.365, 0.48, 0.59, 0.75, 1]) { await to(page, p); await page.waitForTimeout(500); rm.push(await chapter(page)); }
check('reduced motion: same content order, a chapter always shown', rm.every(Boolean) && rm.filter((c, i, a) => c !== a[i - 1]).join() === 'lab,engineering,kensaku,explore', rm.join());
await browser.close();

// ---- no WebGL: every chapter readable in the page flow
({ browser, page } = await open(['--disable-gpu', '--disable-3d-apis']));
await page.waitForTimeout(900);
const flat = await page.evaluate(() => ({ webgl: document.documentElement.dataset.webgl, visible: [...document.querySelectorAll('.panel')].every((p) => getComputedStyle(p).opacity === '1' && getComputedStyle(p).position === 'relative'), images: [...document.querySelectorAll('.chapter')].map((c) => getComputedStyle(c).backgroundImage.includes('/fallback/')), links: document.querySelectorAll('.destinations a').length, buttons: document.querySelectorAll('button.bracket').length }));
check('no WebGL: all panels in flow and visible', flat.webgl === 'unavailable' && flat.visible);
check('no WebGL: every chapter has a fallback image', flat.images.every(Boolean), flat.images.join());
await page.locator('#kensaku button.bracket').click();
check('no WebGL: details still work', await page.evaluate(() => document.querySelector('dialog').open));
await browser.close();

// ---- later assets blocked: opening and text unaffected
{
	const b = await chromium.launch({ channel: 'chrome', headless: true, args: gpu });
	const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
	await pg.route('**/assets/exhibits.glb', (r) => r.abort());
	await pg.goto(base);
	await pg.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	await pg.waitForTimeout(2500);
	await to(pg, 0.365); await pg.waitForTimeout(1300);
	const r = await pg.evaluate(() => ({ webgl: document.documentElement.dataset.webgl, chapters: document.documentElement.dataset.chapters, title: getComputedStyle(document.querySelector('#engineering .panel')).opacity, chapter: window.__futari.chapter }));
	check('exhibits blocked: opening keeps running, copy shows', r.webgl === 'ok' && r.chapters === 'unavailable' && r.title === '1' && r.chapter === 'engineering', JSON.stringify(r));
	await b.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
