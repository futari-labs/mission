// Controlled rendering experiments: one variable at a time, the scene held still at each station.
// A variant is a query string of the switches in src/scene/experiment.ts, for example "dpr=1.25" or
// "msaa=0&off=bloom". Every variant is compared with the first one. "dpr=3@http://localhost:4174" runs
// a variant against another build.
//
// Reported per station and variant, as the median of the runs:
//   frame   mean interval between animation frames with the display limit removed. This is what a
//           whole frame costs on THIS machine's CPU and GPU together. It is not a phone's frame time.
//   gpu     GPU time of the frame's own draw commands from EXT_disjoint_timer_query_webgl2, when the
//           browser offers it. "n/a" when it does not.
//   cpu     main-thread time inside the frame callback. CPU work, not GPU time.
//
// The viewport defaults to an iPhone 17 Pro (402x874 at 3x) with touch emulation, so the page takes
// its coarse-pointer path. It still runs on a desktop GPU: use it to compare variants, not to
// predict a phone's frame rate.
//
// Usage: node tools/ablate.mjs [base-url] --variants="dpr=1.75;dpr=1.25;dpr=1" [--runs=3] [--desktop]
//        [--stations=0,0.43,0.8] [--headed] [--dpr=3] [--label=text] [--capped]
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4173';
const variants = (flag('variants') ?? '').split(';').map((v) => v.trim());
const runs = Number(flag('runs') ?? 3);
const desktop = args.includes('--desktop');
const viewport = desktop ? { width: 1440, height: 900 } : { width: 402, height: 874 };
const deviceScaleFactor = Number(flag('dpr') ?? (desktop ? 2 : 3));
const NAMED = [['winter, opening', 0], ['spring, engineering builds', 0.3], ['spring, engineering rest', 0.43], ['summer, kensaku rest', 0.67], ['ring passage', 0.8], ['autumn, explore rest', 1.02], ['return, dispersing', 1.13], ['return, arriving', 1.22]];
const wanted = flag('stations')?.split(',').map(Number);
const stations = wanted ? wanted.map((u) => NAMED.find(([, at]) => at === u) ?? [`position ${u}`, u]) : NAMED;

// Uncapped, frames queue on the GPU and a timer query counts the wait. With --capped the display paces
// the frames, so the gpu column is each frame's own cost and the frame column is just the refresh rate.
const capped = args.includes('--capped');
const browser = await chromium.launch({ channel: 'chrome', headless: !args.includes('--headed'), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', ...(capped ? [] : ['--disable-frame-rate-limit', '--disable-gpu-vsync'])] });

// Wraps each animation frame in a GPU timer query on the page's own WebGL context.
const gpuTimer = () => {
	const state = { gl: null, ext: null, pending: [], samples: [], active: null };
	window.__gpu = state;
	const getContext = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
		const gl = getContext.call(this, type, ...rest);
		if (type === 'webgl2' && gl && !state.gl) {
			state.gl = gl;
			state.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
		}
		return gl;
	};
	const raf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (fn) =>
		raf((t) => {
			const { gl, ext } = state;
			if (!gl || !ext) return fn(t);
			for (let i = state.pending.length - 1; i >= 0; i--) {
				const q = state.pending[i];
				if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
				if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) state.samples.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
				gl.deleteQuery(q);
				state.pending.splice(i, 1);
			}
			const query = state.pending.length < 4 ? gl.createQuery() : null;
			if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
			try {
				fn(t);
			} finally {
				if (query) {
					gl.endQuery(ext.TIME_ELAPSED_EXT);
					state.pending.push(query);
				}
			}
		});
};

async function measure(variant) {
	const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile: !desktop, hasTouch: !desktop });
	const page = await context.newPage();
	await page.addInitScript(gpuTimer);
	// "query@url" measures another build, so two builds can share one interleaved run
	const [query, origin = base] = variant.split('@');
	await page.goto(`${origin}/?probe${query ? `&${query}` : ''}`);
	await page.waitForFunction(() => window.__futari?.state === 'ready', null, { timeout: 30000 });
	await page.waitForTimeout(1500);
	const out = [];
	for (const [, u] of stations) {
		await page.evaluate((v) => window.__futari.jump(v), u);
		await page.waitForTimeout(900);
		await page.evaluate(() => {
			window.__futariProbe.frames.length = 0;
			window.__futariProbe.script.length = 0;
			window.__gpu.samples.length = 0;
		});
		await page.waitForTimeout(1400);
		out.push(
			await page.evaluate(() => {
				const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : Number.NaN);
				const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : Number.NaN);
				const probe = window.__futariProbe;
				const s = probe.stats();
				const gl = window.__gpu.gl;
				return { frame: mean(probe.frames), cpu: mean(probe.script), gpu: median(window.__gpu.samples), n: probe.frames.length, calls: s.calls, triangles: s.triangles, buffer: gl ? `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}` : '?', dpr: s.dpr };
			}),
		);
	}
	await context.close();
	return out;
}

const results = variants.map(() => []);
for (let run = 0; run < runs; run++) for (let v = 0; v < variants.length; v++) results[v].push(await measure(variants[v]));
await browser.close();

const median = (a) => {
	const s = a.filter((x) => !Number.isNaN(x)).sort((x, y) => x - y);
	return s.length ? s[Math.floor(s.length / 2)] : Number.NaN;
};
const ms = (x) => (Number.isNaN(x) ? '  n/a' : x.toFixed(2).padStart(5));
console.log(`# ${flag('label') ?? base}: ${viewport.width}x${viewport.height} at ${deviceScaleFactor}x, ${desktop ? 'desktop' : 'touch emulation'}, ${runs} runs, median. Milliseconds. ${capped ? 'Paced by the display: read the gpu column' : 'Display limit removed'}. Desktop GPU.`);
console.log('# frame: mean animation-frame interval (CPU and GPU together). gpu: timer query over the frame. cpu: main thread in the frame callback.');
stations.forEach(([name], s) => {
	console.log(`\n## ${name}`);
	const first = median(results[0].map((r) => r[s].frame));
	const firstGpu = median(results[0].map((r) => r[s].gpu));
	variants.forEach((variant, v) => {
		const rows = results[v].map((r) => r[s]);
		const frame = median(rows.map((r) => r.frame));
		const gpu = median(rows.map((r) => r.gpu));
		const delta = v === 0 ? '      ' : `${frame - first >= 0 ? '+' : ''}${(frame - first).toFixed(2)}`.padStart(6);
		const gpuDelta = v === 0 || Number.isNaN(gpu) ? '      ' : `${gpu - firstGpu >= 0 ? '+' : ''}${(gpu - firstGpu).toFixed(2)}`.padStart(6);
		console.log(`${(variant || '(as built)').padEnd(34)} frame ${ms(frame)} ${delta}  gpu ${ms(gpu)} ${gpuDelta}  cpu ${ms(median(rows.map((r) => r.cpu)))}  calls ${String(rows[0].calls).padStart(3)}  tris ${String(rows[0].triangles).padStart(6)}  ${rows[0].buffer}`);
	});
});
