// Checks the opt-in performance overlay (?debug=performance) in a real browser: that a normal visit
// never loads it, that it shows and refreshes, that it leaves the chapter links usable, that a
// capture, a reset, a copy, and a download all work, and what it costs. Exits non-zero on any failure.
//
// Usage: node tools/overlay-test.mjs [base-url] [--lan=http://192.168.x.x:4173] [--shots=dir] [--real-clipboard]
//   --lan             the same build over the local network. Plain http to an address is not a secure
//                     context, which is how a phone reaches a test build, so copy must work there.
//   --real-clipboard  also copies for real and pastes it back. This overwrites the system clipboard.
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const lan = flag('lan');
const shots = flag('shots');
const realClipboard = args.includes('--real-clipboard');
if (shots) mkdirSync(shots, { recursive: true });
const gpu = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const PHONE = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1';
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const note = (name, detail) => console.log(`NOTE  ${name}  (${detail})`);

async function open(url, ctx = {}, launch = gpu) {
	const browser = await chromium.launch({ channel: 'chrome', headless: true, args: launch });
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, ...ctx });
	const page = await context.newPage();
	const errors = [];
	const requests = [];
	page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
	page.on('request', (r) => requests.push(r.url()));
	await page.goto(url);
	await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	return { browser, page, errors, requests };
}
const report = (page) => page.evaluate(() => window.__futariPerf.report());
/** Whether a tap at the middle of each chapter link and of the wordmark would reach it. */
const linksReachable = (page) => page.evaluate(() => [...document.querySelectorAll('nav.chapters a, a.wordmark')].map((a) => {
	const r = a.getBoundingClientRect();
	const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
	return hit === a || a.contains(hit);
}));
/** How many links and buttons of the header and of the chapter on screen a tap would not reach. */
const blocked = (page) => page.evaluate(() => [...document.querySelectorAll('nav.chapters a, a.wordmark, .panel[data-active="true"] a, .panel[data-active="true"] button')].filter((el) => {
	const r = el.getBoundingClientRect();
	if (r.width === 0 || r.height === 0) return false;
	const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
	return !(hit === el || el.contains(hit));
}).map((el) => el.textContent.trim().slice(0, 24)));
/** Scrolls a distance in journey units at a steady pace, one step per animation frame. */
const scroll = (page, units, screensPerSecond = 1.5) => page.evaluate(async ([u, pace]) => {
	const total = u * window.__futari.unitPixels();
	let done = 0;
	while (Math.abs(done) < Math.abs(total)) {
		const step = Math.sign(total) * Math.min(Math.abs(total - done), (innerHeight * pace) / 60);
		scrollBy(0, step);
		done += step;
		await new Promise(requestAnimationFrame);
	}
}, [units, screensPerSecond]);

// ---- a normal visit carries none of it
{
	const { browser, page, errors, requests } = await open(base, PHONE);
	await page.waitForTimeout(800);
	const there = await page.evaluate(() => ({ panel: !!document.querySelector('.fperf'), api: '__futariPerf' in window }));
	check('normal visit: no overlay and no hook', !there.panel && !there.api);
	check('normal visit: the overlay chunk is never requested', !requests.some((u) => /performance-[\w-]+\.js/.test(u)), requests.filter((u) => /\.js/.test(u)).map((u) => u.split('/').pop()).join(' '));
	check('normal visit: no page errors', errors.length === 0, errors.join(' | '));
	await browser.close();
}

// ---- phone: shows, refreshes, stays out of the way, captures
{
	const { browser, page, errors, requests } = await open(`${base}/?debug=performance`, { ...PHONE, userAgent: IPHONE_UA });
	await page.waitForSelector('.fperf', { timeout: 10000 });
	check('phone: the overlay chunk loads on request', requests.some((u) => /performance-[\w-]+\.js/.test(u)));
	const state = await page.evaluate(() => ({ collapsed: document.querySelector('.fperf').dataset.collapsed, box: document.querySelector('.fperf').getBoundingClientRect().toJSON(), buttons: [...document.querySelectorAll('.fperf-bar button')].map((b) => b.getBoundingClientRect().height) }));
	check('phone: starts as one line under the header', state.collapsed === 'true' && state.box.height < 60 && state.box.top >= 55 && state.box.top < 75, `${Math.round(state.box.height)} px tall at y ${Math.round(state.box.top)}`);
	check('phone: bar buttons at least 40 px tall', state.buttons.every((h) => h >= 40), state.buttons.map(Math.round).join());
	const bar1 = await page.textContent('.fperf-toggle');
	await page.waitForTimeout(1600);
	const bar2 = await page.textContent('.fperf-toggle');
	check('phone: the one-line form refreshes', bar1 !== bar2 && /fps/.test(bar2) && /p95/.test(bar2) && /\d+x\d+/.test(bar2), bar2);
	check('phone: chapter links and wordmark reachable, collapsed', (await linksReachable(page)).every(Boolean));
	if (shots) await page.screenshot({ path: `${shots}/overlay-phone-collapsed.png` });
	// collapsed, it must never sit on a control of any chapter
	const rests = await page.evaluate(() => window.__futari.map.rests);
	const covered = [];
	for (const [id, u] of Object.entries(rests)) {
		await page.evaluate((v) => window.__futari.jump(v), u);
		await page.waitForTimeout(1300);
		covered.push(...(await blocked(page)).map((label) => `${id}: ${label}`));
		if (shots && id !== 'lab') await page.screenshot({ path: `${shots}/overlay-phone-collapsed-${id}.png` });
	}
	check('phone: collapsed, every link and button of every chapter is reachable', covered.length === 0, covered.join(' | '));
	await page.evaluate(() => window.__futari.jump(0));
	await page.waitForTimeout(1300);

	await page.tap('.fperf-toggle');
	await page.waitForTimeout(700);
	const expanded = await page.evaluate(() => ({ text: document.querySelector('.fperf-text').textContent, box: document.querySelector('.fperf').getBoundingClientRect().toJSON(), small: [...document.querySelectorAll('.fperf button')].filter((b) => b.getBoundingClientRect().height < 40).length, font: getComputedStyle(document.querySelector('.fperf-text')).fontSize }));
	const labels = ['frame interval', 'slow frames', 'CPU', 'render submission', 'quality', 'MSAA', 'drawing buffer', 'draw calls', 'triangles', 'governor', 'budget', 'navigation'];
	check('phone: expanded form names every reading', labels.every((l) => expanded.text.includes(l)), labels.filter((l) => !expanded.text.includes(l)).join());
	check('phone: GPU reading is labelled by method', /GPU time \(timer query\)|GPU completion latency \(fence, sampled, upper bound\)|GPU not measurable/.test(expanded.text));
	check('phone: expanded form fits the screen', expanded.box.top >= 0 && expanded.box.right <= 402 && expanded.box.bottom <= 874, `${Math.round(expanded.box.width)}x${Math.round(expanded.box.height)} px, text ${expanded.font}`);
	check('phone: every control at least 40 px tall', expanded.small === 0, `${expanded.small} smaller`);
	check('phone: chapter links and wordmark reachable, expanded', (await linksReachable(page)).every(Boolean));
	const text1 = expanded.text;
	await page.waitForTimeout(1200);
	check('phone: expanded form refreshes', (await page.textContent('.fperf-text')) !== text1);
	if (shots) await page.screenshot({ path: `${shots}/overlay-phone-expanded-lab.png` });
	const refreshes = await page.evaluate(async () => {
		const el = document.querySelector('.fperf-text');
		let writes = 0;
		const seen = new MutationObserver(() => writes++);
		seen.observe(el, { childList: true, characterData: true, subtree: true });
		await new Promise((r) => setTimeout(r, 3000));
		seen.disconnect();
		return writes / 3;
	});
	check('phone: the panel is written about twice a second, not per frame', refreshes > 1 && refreshes < 3.5, `${refreshes.toFixed(1)} per second`);

	// a capture over one lap, with one deliberate stall so there is a slow frame to place
	await page.tap('.fperf-reset');
	const cycle = await page.evaluate(() => window.__futari.map.cycle);
	await scroll(page, 0.3);
	const stalledAt = await page.evaluate(() => { const u = window.__futari.units(); const t = performance.now(); while (performance.now() - t < 130); return u; });
	await scroll(page, cycle - 0.3);
	await page.waitForTimeout(700);
	const r = await report(page);
	const f = r.frameIntervalMs;
	check('capture: frame intervals are plausible', r.capture.frames > 200 && f.p50 > 4 && f.p50 < 40 && f.p50 <= f.p95 && f.p95 <= f.p99 && f.p99 <= f.max && f.fps > 20, JSON.stringify(f));
	check('capture: CPU frame work and render submission are separate and ordered', r.cpuFrameWorkMs.n > 200 && r.cpuRenderSubmissionMs.n > 200 && r.cpuRenderSubmissionMs.mean <= r.cpuFrameWorkMs.mean && r.cpuFrameWorkMs.mean < f.mean, `work ${r.cpuFrameWorkMs.mean} ms, submission ${r.cpuRenderSubmissionMs.mean} ms, interval ${f.mean} ms`);
	const stall = r.slowFrames.recent.find((s) => s[3] > 100);
	check('capture: the stalled frame is counted and placed', r.slowFrames.over100ms >= 1 && r.slowFrames.overBudgetX1_5 >= 1 && !!stall && Math.abs(stall[1] - stalledAt) < 0.03 && r.slowFrames.byScene[stall[2]] >= 1, stall ? `at ${stall[1]} "${stall[2]}", ${stall[3]} ms, stalled at ${stalledAt.toFixed(3)}` : 'not found');
	check('capture: slow-frame list is bounded', r.slowFrames.recent.length <= 24);
	const q = r.quality.end;
	check('capture: drawing buffer, DPR, and MSAA reported', q.buffer[0] > 0 && q.buffer[1] > 0 && q.css[0] === 402 && Math.abs(q.buffer[0] - Math.floor(402 * q.dpr)) <= 1 && [0, 2, 4].includes(q.msaa), `${q.css.join('x')} css, ${q.buffer.join('x')} px, DPR ${q.dpr}, MSAA ${q.msaa}`);
	check('capture: draw calls, triangles, and resources reported', r.draw.calls[0] > 0 && r.draw.calls[1] >= r.draw.calls[0] && r.draw.triangles[1] > 1000 && r.resources.end.programs > 0 && r.resources.end.geometries > 0 && r.resources.end.textures > 0 && r.resources.start.programs > 0, `calls ${r.draw.calls.join('-')}, triangles ${r.draw.triangles.join('-')}, ${JSON.stringify(r.resources.end)}`);
	check('capture: position, governor, and quality timeline present', typeof r.position.scene === 'string' && r.governor.budgetMs > 0 && r.quality.timeline.length >= 1 && r.quality.start !== null);
	check('capture: GPU method named, never confused with an interval', ['GPU time (timer query)', 'GPU completion latency (fence, sampled, upper bound)', 'not measurable in this browser'].includes(r.gpu.method), `${r.gpu.method}, ${r.gpu.samples} samples, p50 ${r.gpu.p50} ms`);
	if (r.gpu.method === 'GPU time (timer query)') check('capture: timer-query samples arrive', r.gpu.samples > 20 && r.gpu.p50 > 0 && r.gpu.p50 < 100, `${r.gpu.samples} samples`);
	check('report: iPhone Safari parsed from the user agent', r.browser.name === 'Safari' && r.browser.version === '26.1' && r.browser.os === 'iOS' && r.browser.device === 'iPhone' && r.browser.webkitVersion === '26.1', JSON.stringify(r.browser).slice(0, 120));
	check('report: device facts present', r.screen.devicePixelRatio === 3 && r.screen.viewport[0] === 402 && r.input.coarsePointer === true && r.input.lowPowerMode === 'unknown' && r.schema === 'futari-perf/1' && r.url.includes('debug=performance'));
	const size = JSON.stringify(r).length;
	check('report: small enough to paste', size < 12000, `${size} bytes`);

	// Low Power Mode is the tester's to state
	await page.tap('.fperf-row button:first-child');
	check('low power toggle is recorded', (await report(page)).input.lowPowerMode === 'on');

	// the overlay sees a chapter journey, whatever the navigation module reports of it
	await page.tap('nav.chapters a[href="#explore"]');
	await page.waitForTimeout(600);
	check('chapter link still navigates under the overlay', await page.evaluate(() => Math.abs(window.__futari.units() % window.__futari.map.cycle) > 0.001 || window.__futari.chapter !== 'lab'));
	check('navigation line is shown', /navigation/.test(await page.textContent('.fperf-text')));

	// download
	const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.tap('.fperf-download')]);
	const path = await download.path();
	let saved = null;
	try { saved = JSON.parse(readFileSync(path, 'utf8')); } catch { saved = null; }
	const keys = ['schema', 'at', 'url', 'userAgent', 'browser', 'screen', 'input', 'capture', 'frameIntervalMs', 'cpuFrameWorkMs', 'cpuRenderSubmissionMs', 'gpu', 'slowFrames', 'quality', 'governor', 'draw', 'resources', 'position', 'marks', 'navigation'];
	check('download: a named JSON file with every section', /^futari-perf-[\d-]+\.json$/.test(download.suggestedFilename()) && !!saved && keys.every((k) => k in saved), `${download.suggestedFilename()}${saved ? `, missing: ${keys.filter((k) => !(k in saved)).join() || 'none'}` : ', not JSON'}`);
	if (shots && saved) { await download.saveAs(`${shots}/sample-report.json`); }

	// reset
	await page.waitForTimeout(400);
	await page.tap('.fperf-reset');
	await page.waitForTimeout(300);
	const cleared = await report(page);
	check('reset clears the capture', cleared.capture.seconds < 1.5 && cleared.capture.frames < 90 && cleared.slowFrames.over100ms === 0 && cleared.slowFrames.recent.length === 0 && Object.keys(cleared.slowFrames.byScene).length === 0 && cleared.marks.length === 0, `${cleared.capture.frames} frames in ${cleared.capture.seconds} s`);

	// where the copy sits: the overlay over a chapter's text
	await page.evaluate(() => window.__futari.jump(window.__futari.map.rests.engineering));
	await page.waitForTimeout(1500);
	if (shots) await page.screenshot({ path: `${shots}/overlay-phone-expanded-engineering.png` });
	await page.tap('.fperf-move');
	const moved = await page.evaluate(() => { const b = document.querySelector('.fperf').getBoundingClientRect(); return { dock: document.querySelector('.fperf').dataset.dock, bottom: b.bottom }; });
	check('move docks the panel at the bottom', moved.dock === 'bottom' && moved.bottom > 850 && moved.bottom <= 874, `bottom at ${Math.round(moved.bottom)}`);
	await page.tap('.fperf-move');
	await page.tap('.fperf-collapse');
	await page.waitForTimeout(700);
	check('collapse returns to one line', await page.evaluate(() => document.querySelector('.fperf').dataset.collapsed === 'true' && document.querySelector('.fperf').getBoundingClientRect().height < 60));
	check('phone: no page errors', errors.length === 0, errors.join(' | '));
	await browser.close();
}

// ---- copy. The command path is the one a phone uses over plain http, so it is tested with the
// browser's own command replaced by a recorder, which leaves the system clipboard alone.
for (const [label, url, secure] of [['secure origin', base, true], ...(lan ? [['plain http on the local network', lan, false]] : [])]) {
	let opened;
	try { opened = await open(`${url}/?debug=performance`, PHONE); } catch (e) { check(`copy, ${label}: page reachable`, false, String(e).slice(0, 100)); continue; }
	const { browser, page } = opened;
	await page.waitForSelector('.fperf');
	const context = await page.evaluate(() => ({ secure: isSecureContext, clipboard: !!navigator.clipboard }));
	check(`copy, ${label}: context is as expected`, context.secure === secure && (secure || !context.clipboard), JSON.stringify(context));
	await page.evaluate(() => {
		window.__recorded = { command: null, api: null };
		document.execCommand = (name) => {
			const el = document.activeElement;
			window.__recorded.command = name === 'copy' && el instanceof HTMLTextAreaElement ? el.value.slice(el.selectionStart, el.selectionEnd) : `unexpected: ${name}`;
			return true;
		};
		if (navigator.clipboard) navigator.clipboard.writeText = (text) => { window.__recorded.api = text; return Promise.resolve(); };
	});
	await page.tap('.fperf-copy');
	await page.waitForTimeout(400);
	const got = await page.evaluate(() => ({ ...window.__recorded, status: document.querySelector('.fperf-status').textContent, last: window.__futariPerf.lastCopy() }));
	const text = secure ? got.api : got.command;
	let parsed = null;
	try { parsed = JSON.parse(text); } catch { parsed = null; }
	check(`copy, ${label}: ${secure ? 'clipboard API' : 'copy command with the whole report selected'}`, !!parsed && parsed.schema === 'futari-perf/1' && text === got.last && (secure ? got.command === null : got.api === null), got.status);
	if (secure) {
		// the API refusing (a permission prompt dismissed) falls back to the command, and that refusing shows the text
		await page.evaluate(() => { window.__recorded = { command: null, api: null }; navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
		await page.tap('.fperf-copy');
		await page.waitForTimeout(400);
		check('copy: a refused clipboard API falls back to the copy command', await page.evaluate(() => { try { return JSON.parse(window.__recorded.command).schema === 'futari-perf/1'; } catch { return false; } }));
		await page.evaluate(() => { document.execCommand = () => false; });
		await page.tap('.fperf-copy');
		await page.waitForTimeout(400);
		const manual = await page.evaluate(() => ({ shown: document.querySelector('.fperf-manual').dataset.shown, json: document.querySelector('.fperf-manual').value.startsWith('{"schema":"futari-perf/1"'), expanded: document.querySelector('.fperf').dataset.collapsed === 'false', status: document.querySelector('.fperf-status').textContent }));
		check('copy: when both are refused the report is shown to select by hand', manual.shown === 'true' && manual.json && manual.expanded, manual.status);
	}
	await browser.close();
}
if (!lan) note('copy over plain http not tested', 'pass --lan=http://<this machine>:<port>');

if (realClipboard && lan) {
	const { browser, page } = await open(`${lan}/?debug=performance`, { viewport: { width: 1440, height: 900 } });
	await page.waitForSelector('.fperf');
	await page.click('.fperf-copy');
	await page.waitForTimeout(300);
	const status = await page.textContent('.fperf-status');
	await page.evaluate(() => { const t = document.createElement('textarea'); t.id = 'paste-here'; t.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647'; document.body.append(t); t.focus(); });
	await page.keyboard.press('Meta+V');
	await page.waitForTimeout(300);
	const pasted = await page.evaluate(() => document.querySelector('#paste-here').value);
	check('copy, real clipboard over plain http: pastes back as the report', pasted.startsWith('{"schema":"futari-perf/1"') && /copy command/.test(status), `${status} ${pasted.length} bytes pasted`);
	await browser.close();
}

// ---- the fence path, which is what Safari gets, forced here with ?gpu=fence
{
	const { browser, page, errors } = await open(`${base}/?debug=performance&gpu=fence`, PHONE);
	await page.waitForSelector('.fperf');
	await page.waitForTimeout(4000);
	const g = (await report(page)).gpu;
	check('fence: labelled as a completion latency and an upper bound, with its polling resolution', g.method === 'GPU completion latency (fence, sampled, upper bound)' && g.samples >= 3 && g.p50 > 0 && g.p50 < 100 && g.pollResolutionMs > 0 && /upper|lower/.test(g.caveat), `${g.samples} samples, p50 ${g.p50} ms, resolution ${g.pollResolutionMs} ms, ${g.discarded} discarded`);
	check('fence: no page errors', errors.length === 0, errors.join(' | '));
	await browser.close();
	const none = await open(`${base}/?debug=performance&gpu=none`, PHONE);
	await none.page.waitForSelector('.fperf');
	await none.page.tap('.fperf-toggle');
	await none.page.waitForTimeout(700);
	check('no GPU measurement: says so', (await report(none.page)).gpu.method === 'not measurable in this browser' && /GPU not measurable in this browser/.test(await none.page.textContent('.fperf-text')));
	await none.browser.close();
}

// ---- desktop
{
	const { browser, page, errors } = await open(`${base}/?debug=performance`);
	await page.waitForSelector('.fperf');
	await page.waitForTimeout(1200);
	const d = await page.evaluate(() => ({ collapsed: document.querySelector('.fperf').dataset.collapsed, box: document.querySelector('.fperf').getBoundingClientRect().toJSON(), text: document.querySelector('.fperf-text').textContent }));
	check('desktop: expanded at the lower left', d.collapsed === 'false' && d.box.left < 20 && d.box.right < 500 && d.box.bottom <= 900 && /frame interval/.test(d.text), `${Math.round(d.box.width)}x${Math.round(d.box.height)} px`);
	check('desktop: chapter links and wordmark reachable', (await linksReachable(page)).every(Boolean));
	await page.click('nav.chapters a[href="#engineering"]');
	await page.waitForTimeout(2500);
	const nav = await page.evaluate(() => ({ line: document.querySelector('.fperf-text').textContent.split('\n').find((l) => l.startsWith('navigation')), log: window.__futariPerf.report().navigation }));
	note('desktop: navigation line after a chapter click', `${nav.line} | logged ${JSON.stringify(nav.log)}`);
	if (shots) await page.screenshot({ path: `${shots}/overlay-desktop.png` });
	check('desktop: no page errors', errors.length === 0, errors.join(' | '));
	await browser.close();
}

// ---- what it costs: the same held scene with and without the overlay, display limit removed,
// so a frame interval is the cost of a frame and not the refresh rate
{
	const uncapped = [...gpu, '--disable-frame-rate-limit', '--disable-gpu-vsync'];
	const measure = async (query) => {
		const { browser, page } = await open(`${base}/?probe${query}`, PHONE, uncapped);
		await page.evaluate(() => window.__futari.jump(window.__futari.map.rests.engineering));
		await page.waitForTimeout(1500);
		await page.evaluate(() => { window.__futariProbe.frames.splice(0); window.__futariProbe.script.splice(0); });
		await page.waitForTimeout(3000);
		const out = await page.evaluate(() => { const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length; return { interval: mean(window.__futariProbe.frames), script: mean(window.__futariProbe.script), frames: window.__futariProbe.frames.length }; });
		await browser.close();
		return out;
	};
	const runs = { without: [], with: [] };
	for (let i = 0; i < 3; i++) { runs.without.push(await measure('')); runs.with.push(await measure('&debug=performance')); }
	const median = (list, key) => list.map((r) => r[key]).sort((a, b) => a - b)[1];
	const interval = [median(runs.without, 'interval'), median(runs.with, 'interval')];
	const script = [median(runs.without, 'script'), median(runs.with, 'script')];
	console.log(`COST  held at Engineering, 402x874 at 3x, display limit removed, median of 3 runs each`);
	console.log(`COST  frame interval (whole cost of a frame): ${interval[0].toFixed(3)} ms without, ${interval[1].toFixed(3)} ms with, difference ${(interval[1] - interval[0]).toFixed(3)} ms`);
	console.log(`COST  CPU time inside the render call:        ${script[0].toFixed(3)} ms without, ${script[1].toFixed(3)} ms with, difference ${(script[1] - script[0]).toFixed(3)} ms`);
	check('cost: the overlay adds under 0.5 ms to an uncapped frame', interval[1] - interval[0] < 0.5, `${(interval[1] - interval[0]).toFixed(3)} ms`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
