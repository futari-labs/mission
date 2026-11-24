// Compares what a frame costs between builds or experiment switches, with the scene held at one
// place. The browser does not wait for the display, so a frame interval is a cost, not a refresh rate.
// It reports, per place and variant, the median over several interleaved runs of:
//   frame   mean time between animation frames, in ms
//   script  median main-thread time inside the frame callback (CPU, not GPU)
//   gpu     median EXT_disjoint_timer_query_webgl2 time around the frame's WebGL calls. Chrome on Metal
//           emulates the query, and frames that overlap count their queueing, so read it as a ranking.
//   calls, tris   draw calls and triangles of the last frame
// This is a desktop GPU even with --phone: the frame is phone-shaped, the hardware is not.
// Usage: node tools/env-ablate.mjs [--phone] [--dpr=3] [--runs=3] [--at=0,0.43,0.67] [--headed] label=url-with-query ...
//   node tools/env-ablate.mjs --phone base=http://localhost:4174/?dpr=3 new=http://localhost:4173/?dpr=3 "nofol=http://localhost:4173/?dpr=3&off=foliage"
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const phone = args.includes('--phone');
const dpr = Number(flag('dpr') ?? (phone ? 3 : 1));
const runs = Number(flag('runs') ?? 3);
const NAMES = { 0: 'winter, opening', 0.3: 'spring, engineering builds', 0.43: 'spring, engineering rest', 0.57: 'summer, kensaku builds', 0.67: 'summer, kensaku rest', 0.8: 'ring passage', 1.02: 'autumn, explore rest', 1.19: 'return, middle' };
const at = (flag('at') ?? '0,0.43,0.67,0.8,1.02,1.19').split(',').map(Number);
const variants = args.filter((a) => !a.startsWith('--')).map((a) => ({ label: a.slice(0, a.indexOf('=')), url: a.slice(a.indexOf('=') + 1) }));
const viewport = phone ? { width: 402, height: 874 } : { width: 1440, height: 900 };

// Wraps every animation frame in a timer query, once the scene's own context exists.
const timer = () => {
	const state = { gl: null, ext: null, pending: [], active: null, gpu: [] };
	window.__envGpu = state.gpu;
	const raf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (fn) =>
		raf((t) => {
			if (!state.gl && window.__futari?.state === 'ready') {
				state.gl = document.querySelector('canvas')?.getContext('webgl2') ?? null;
				state.ext = state.gl?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null;
			}
			const { gl, ext } = state;
			if (!gl || !ext) return fn(t);
			for (let i = state.pending.length - 1; i >= 0; i--) {
				const q = state.pending[i];
				if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
				if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) state.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
				gl.deleteQuery(q);
				state.pending.splice(i, 1);
			}
			const q = state.pending.length < 8 ? gl.createQuery() : null;
			if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
			fn(t);
			if (q) {
				gl.endQuery(ext.TIME_ELAPSED_EXT);
				state.pending.push(q);
			}
		});
};

const browser = await chromium.launch({ channel: 'chrome', headless: !args.includes('--headed'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const results = new Map();
for (let run = 0; run < runs; run++) {
	for (const v of variants) {
		const page = await (await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: phone, hasTouch: phone })).newPage();
		await page.addInitScript(timer);
		const url = new URL(v.url);
		url.searchParams.set('probe', '');
		await page.goto(url.href);
		await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
		await page.waitForTimeout(1500);
		for (const u of at) {
			await page.evaluate((p) => window.__futari.jump(p), u);
			await page.waitForTimeout(700);
			await page.evaluate(() => {
				window.__futariProbe.frames.length = 0;
				window.__futariProbe.script.length = 0;
				window.__envGpu.length = 0;
			});
			await page.waitForTimeout(1500);
			const r = await page.evaluate(() => {
				const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : Number.NaN);
				const p = window.__futariProbe;
				const s = p.stats();
				return { frame: p.frames.reduce((a, b) => a + b, 0) / p.frames.length, script: median(p.script), gpu: median(window.__envGpu), calls: s.calls, triangles: s.triangles, n: p.frames.length, buffer: `${document.querySelector('canvas').width}x${document.querySelector('canvas').height}` };
			});
			const key = `${u}|${v.label}`;
			results.set(key, [...(results.get(key) ?? []), r]);
		}
		await page.context().close();
	}
}
const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
console.log(`# ${viewport.width}x${viewport.height}, device pixel ratio ${dpr}, ${runs} interleaved runs, median of runs [range of frame]. Milliseconds. Display limit removed. Desktop GPU.`);
for (const u of at) {
	console.log(`\n## ${NAMES[u] ?? u}`);
	let first = null;
	for (const v of variants) {
		const list = results.get(`${u}|${v.label}`);
		const frames = list.map((r) => r.frame);
		const frame = median(frames);
		first ??= frame;
		const gpu = median(list.map((r) => r.gpu));
		console.log(
			v.label.padEnd(22),
			`frame ${frame.toFixed(2)} [${Math.min(...frames).toFixed(2)}-${Math.max(...frames).toFixed(2)}]`,
			`${frame - first >= 0 ? '+' : ''}${(frame - first).toFixed(2)}`.padStart(6),
			` gpu ${Number.isNaN(gpu) ? ' n/a' : gpu.toFixed(2)}`,
			` script ${median(list.map((r) => r.script)).toFixed(2)}`,
			` calls ${list[0].calls}  tris ${list[0].triangles}  ${list[0].buffer}`,
		);
	}
}
await browser.close();
