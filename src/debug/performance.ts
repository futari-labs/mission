// The opt-in performance overlay. Loaded only for ?debug=performance.
//
// It keeps four measurements apart and names each for what it is:
//   frame interval          time between animation frames. What the visitor sees. Not a cost.
//   CPU frame work          main-thread time inside the frame callback.
//   CPU render submission   the part of that spent issuing WebGL calls. Not GPU time.
//   GPU                     a timer query where the browser has one (Chrome). Where it has none
//                           (Safari), how long after submission the GPU reported the frame done,
//                           sampled with a fence: an upper bound, and labelled as one.
//
// Per frame it writes a few numbers into preallocated arrays and nothing else: no allocation, no
// DOM, no logging. The panel and the engine snapshot are refreshed twice a second.
import { unitsOf } from '../journey/chapters.ts';
import { navigationState, readTravel } from '../journey/travel.ts';
import { sceneAt } from '../scene/journey.ts';
import type { CreateDiagnostics, DiagnosticsSnapshot, DiagnosticsSource, PerformanceDiagnostics } from './types.ts';

declare global {
	interface Window {
		/** For tools/overlay-test.mjs. Present only with ?debug=performance. */
		__futariPerf?: { report: () => Report; reset: () => void; refresh: () => void; lastCopy: () => string };
	}
}

const SCHEMA = 'futari-perf/1';
/** Frames kept for the rolling figures: a minute at 60 fps. */
const WINDOW = 3600;
/** The panel's figures cover this much of the recent past. */
const RECENT_MS = 5000;
const REFRESH_MS = 500;
/** A frame is slow when its interval passes this many budgets: a missed refresh, with room for timer noise. */
const SLOW_BUDGETS = 1.5;
const RECENT_SLOW = 24;
const MARKS = 60;
const TIMELINE = 30;
const JOURNEYS = 24;
const GPU_SAMPLES = 512;
/** One frame in this many is fenced where there is no timer query. */
const FENCE_EVERY = 20;

const GPU_QUERY = 'GPU time (timer query)';
const GPU_FENCE = 'GPU completion latency (fence, sampled, upper bound)';
const GPU_NONE = 'not measurable in this browser';

const GPU_CAVEAT: Record<string, string> = {
	[GPU_QUERY]: 'Where the query is emulated (Chrome on Metal) it runs to the end of the frame on the GPU, waiting for the display included. Near the frame interval it is that wait, not work: compare builds with the display limit removed.',
	[GPU_FENCE]: 'Time from the end of submission until a poll found the GPU had finished the frame. It includes queueing and up to pollResolutionMs of polling delay, so the true figure is lower. One frame in 20 is sampled.',
};

type Stats = { n: number; mean: number; p50: number; p90: number; p95: number; p99: number; max: number };

/** Every value of a capture in fixed bins a tenth of a millisecond wide, so percentiles cover the whole capture in constant memory. */
class Series {
	private readonly bins: Uint32Array;
	private count = 0;
	private sum = 0;
	private max = 0;

	constructor(limitMs: number) {
		this.bins = new Uint32Array(limitMs * 10 + 1);
	}

	add(ms: number): void {
		this.bins[Math.min(this.bins.length - 1, Math.max(0, (ms * 10) | 0))]++;
		this.count++;
		this.sum += ms;
		if (ms > this.max) this.max = ms;
	}

	reset(): void {
		this.bins.fill(0);
		this.count = this.sum = this.max = 0;
	}

	private quantile(q: number): number {
		const want = Math.max(1, Math.ceil(q * this.count));
		let seen = 0;
		for (let i = 0; i < this.bins.length; i++) {
			seen += this.bins[i];
			if (seen >= want) return i === this.bins.length - 1 ? this.max : Math.min(this.max, (i + 0.5) / 10);
		}
		return this.max;
	}

	stats(): Stats {
		if (this.count === 0) return { n: 0, mean: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0 };
		return { n: this.count, mean: r2(this.sum / this.count), p50: r2(this.quantile(0.5)), p90: r2(this.quantile(0.9)), p95: r2(this.quantile(0.95)), p99: r2(this.quantile(0.99)), max: r2(this.max) };
	}
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

interface Quality {
	tier: number;
	tierName: string;
	dpr: number;
	msaa: number;
	bloomScale: number;
	buffer: [number, number];
	css: [number, number];
}
interface Resources {
	programs: number;
	geometries: number;
	textures: number;
}
interface Journey {
	to: string | null;
	from: number;
	toTravel: number;
	plannedMs: number;
	actualMs: number;
	outcome: string;
}

export interface Report {
	schema: string;
	at: string;
	url: string;
	userAgent: string;
	browser: ReturnType<typeof parseAgent>;
	screen: { width: number; height: number; devicePixelRatio: number; viewport: [number, number]; visualViewport: [number, number, number] | null; orientation: string };
	input: { coarsePointer: boolean; reducedMotion: boolean; lowPowerMode: string };
	capture: { seconds: number; frames: number };
	frameIntervalMs: Stats & { fps: number };
	cpuFrameWorkMs: Stats;
	cpuRenderSubmissionMs: Stats;
	gpu: { method: string; samples: number; mean: number; p50: number; p95: number; max: number; pollResolutionMs?: number; discarded: number; caveat?: string };
	slowFrames: { budgetMs: number; overBudgetX1_5: number; over33ms: number; over50ms: number; over100ms: number; byScene: Record<string, number>; recent: [number, number, string, number, number][]; recentColumns: string };
	quality: { start: Quality | null; end: Quality | null; transitionPass: boolean; tierCeiling: number; tierCount: number; timeline: [number, string][] };
	governor: { budgetMs: number; cadenceMs: number; capped: boolean; slowShare: number; state: string };
	draw: { calls: [number, number]; triangles: [number, number]; note: string };
	resources: { start: Resources | null; end: Resources | null; rebases: number };
	position: { units: number; travel: number; scene: string; chapter: string | null; engineState: string };
	marks: [number, string, string][];
	navigation: Journey[];
}

/** Browser and system from the user agent. Safari 26 reports a frozen "iPhone OS 18_6", so the Version/ token is the one to trust there. */
function parseAgent(ua: string) {
	const pick = (re: RegExp) => ua.match(re)?.[1]?.replace(/_/g, '.') ?? null;
	const ios = /iPhone|iPad|iPod/.test(ua);
	const name = /CriOS\//.test(ua) ? 'Chrome (iOS)' : /FxiOS\//.test(ua) ? 'Firefox (iOS)' : /EdgiOS\//.test(ua) ? 'Edge (iOS)' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'unknown';
	const version = pick(/(?:CriOS|FxiOS|EdgiOS|Edg|Firefox|Chrome)\/([\d.]+)/) ?? pick(/Version\/([\d.]+)/);
	const webkitVersion = pick(/Version\/([\d.]+)/);
	const os = ios ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'unknown';
	const osVersion = pick(/(?:iPhone OS|CPU OS|Android|Mac OS X|Windows NT) ([\d_.]+)/);
	return {
		name,
		version,
		os,
		osVersionFromUA: osVersion,
		device: pick(/\((iPhone|iPad|iPod|Macintosh|Linux|Windows|Android)[;)]/),
		// On iOS every browser is WebKit and its version follows the system, so this is the system's version when the UA's own is frozen.
		...(ios ? { webkitVersion, note: 'iOS 26 and later freeze the OS version in the user agent at 18_6. Version/ follows the real system version: confirm in Settings > General > About.' } : {}),
	};
}

const STYLE = /* css */ `
.fperf{position:fixed;z-index:2147483000;left:calc(8px + env(safe-area-inset-left));bottom:calc(8px + env(safe-area-inset-bottom));width:calc(100vw - 16px - env(safe-area-inset-left) - env(safe-area-inset-right));max-width:440px;box-sizing:border-box;font:10.5px/1.45 ui-monospace,'Geist Mono Variable',Menlo,Consolas,monospace;color:#e8edf5;background:rgb(10 13 20 / .86);border:1px solid rgb(255 255 255 / .16);border-radius:10px;pointer-events:auto;text-shadow:none;-webkit-text-size-adjust:100%;text-size-adjust:100%;letter-spacing:0;contain:layout paint}
.fperf[data-dock='top']{top:calc(62px + env(safe-area-inset-top));bottom:auto}
.fperf *{box-sizing:border-box}
.fperf button{font:inherit;color:inherit;background:rgb(255 255 255 / .1);border:1px solid rgb(255 255 255 / .2);border-radius:7px;min-height:40px;padding:0 10px;margin:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.fperf button:active{background:rgb(255 255 255 / .24)}
.fperf-bar{display:flex;gap:6px;padding:6px;align-items:stretch}
.fperf-bar .fperf-toggle{flex:1 1 auto;min-width:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:none;border-color:transparent;padding:0 4px}
.fperf-body{padding:0 8px 8px}
.fperf[data-collapsed='true'] .fperf-body{display:none}
.fperf-text{margin:0;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}
.fperf-text b{font-weight:600;color:#fff}
.fperf-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.fperf-row button{flex:1 1 auto}
.fperf-status{margin-top:6px;min-height:1.45em;color:#b9f5c8}
.fperf-status[data-bad='true']{color:#ffc9b0}
.fperf-manual{display:none;width:100%;height:90px;margin-top:6px;font:16px/1.3 ui-monospace,Menlo,monospace;color:#e8edf5;background:rgb(0 0 0 / .5);border:1px solid rgb(255 255 255 / .2);border-radius:7px}
.fperf-manual[data-shown='true']{display:block}
`;

const LOW_POWER = ['unknown', 'on', 'off'] as const;
const store = {
	get(key: string): string | null {
		try {
			return sessionStorage.getItem(`futari.perf.${key}`);
		} catch {
			return null;
		}
	},
	set(key: string, value: string): void {
		try {
			sessionStorage.setItem(`futari.perf.${key}`, value);
		} catch {
			// private browsing: the setting lasts for the page
		}
	},
};

export const createDiagnostics: CreateDiagnostics = (source: DiagnosticsSource): PerformanceDiagnostics => {
	const gl = source.gl;
	const params = new URLSearchParams(location.search);
	// the engine may offer its damped position cheaply. Until it does, the scroll goal stands in for it.
	const cheapUnits = (source as DiagnosticsSource & { units?: () => number }).units?.bind(source);
	const unitsNow = () => cheapUnits?.() ?? unitsOf(readTravel());

	// ---- per-frame storage, all preallocated
	const intervals = new Float32Array(WINDOW);
	const scratch = new Float32Array(WINDOW);
	let head = 0;
	let filled = 0;
	const interval = new Series(400);
	const work = new Series(150);
	const submit = new Series(150);
	const slow = { budget: 0, over33: 0, over50: 0, over100: 0 };
	const slowByScene = new Map<string, number>();
	// position, interval, CPU work, and time into the capture of the most recent slow frames
	const slowRing = new Float32Array(RECENT_SLOW * 4);
	let slowHead = 0;
	let slowCount = 0;
	let pendingSlow = -1;
	const gpuSamples = new Float32Array(GPU_SAMPLES);
	let gpuHead = 0;
	let gpuCount = 0;
	let gpuSum = 0;
	let gpuMax = 0;
	let gpuDiscarded = 0;
	let pollGapSum = 0;
	let pollGaps = 0;

	let captureStart = performance.now();
	let frames = 0;
	let frameAt = 0;
	let renderAt = 0;
	let budgetMs = 1000 / 60;
	const marks: [number, string, string][] = [];
	const timeline: [number, string][] = [];
	const journeys: Journey[] = [];
	let qualityStart: Quality | null = null;
	let qualityKey = '';
	let resourcesStart: Resources | null = null;
	const draw = { calls: [Infinity, 0] as [number, number], triangles: [Infinity, 0] as [number, number] };

	// ---- GPU: a timer query where there is one, a fence where there is not
	const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
	const forced = params.get('gpu');
	const timer = gl2 && forced !== 'fence' && forced !== 'none' ? (gl2.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null) : null;
	const fences = !timer && gl2 !== null && forced !== 'none';
	const gpuMethod = timer ? GPU_QUERY : fences ? GPU_FENCE : GPU_NONE;
	let query: WebGLQuery | null = null;
	let queryOpen = false;
	let queryPending = false;
	let sync: WebGLSync | null = null;
	let syncAt = 0;
	let syncSeen = 0;
	let syncTimer = 0;
	let sinceFence = 0;
	let contextLost = false;

	const addGpu = (ms: number) => {
		gpuSamples[gpuHead] = ms;
		gpuHead = (gpuHead + 1) % GPU_SAMPLES;
		gpuCount++;
		gpuSum += ms;
		if (ms > gpuMax) gpuMax = ms;
	};
	const dropGpu = () => {
		// after a lost context every query and fence is gone with it
		query = null;
		queryOpen = queryPending = false;
		sync = null;
		clearTimeout(syncTimer);
	};
	const pollFence = () => {
		if (!sync || !gl2 || contextLost) return;
		const now = performance.now();
		const status = gl2.clientWaitSync(sync, 0, 0);
		if (status === gl2.ALREADY_SIGNALED || status === gl2.CONDITION_SATISFIED) {
			addGpu(now - syncAt);
			// the frame finished somewhere between the last look and this one
			pollGapSum += now - syncSeen;
			pollGaps++;
		} else if (status === gl2.WAIT_FAILED || now - syncAt > 250) gpuDiscarded++;
		else {
			syncSeen = now;
			syncTimer = window.setTimeout(pollFence, 1);
			return;
		}
		gl2.deleteSync(sync);
		sync = null;
	};
	const onLost = () => {
		contextLost = true;
		dropGpu();
	};
	const onRestored = () => {
		contextLost = false;
	};
	gl.canvas.addEventListener('webglcontextlost', onLost);
	gl.canvas.addEventListener('webglcontextrestored', onRestored);

	// ---- navigation: one journey at a time, logged when it ends
	let journey: Journey | null = null;
	let journeyAt = 0;
	const closeJourney = (outcome: string, actualMs: number) => {
		if (!journey) return;
		journey.outcome = outcome;
		journey.actualMs = Math.round(actualMs);
		journeys.push(journey);
		if (journeys.length > JOURNEYS) journeys.shift();
		journey = null;
	};
	const watchNavigation = (now: number) => {
		const nav = navigationState();
		if (journey && (!nav.active || nav.to !== journey.toTravel || nav.chapter !== journey.to)) {
			// the same flag still up with another destination: a second link was clicked mid-journey
			if (nav.active) closeJourney('replaced', now - journeyAt);
			else closeJourney(nav.lastOutcome ?? 'ended', nav.lastDurationMs > 0 ? nav.lastDurationMs : now - journeyAt);
		}
		if (nav.active && !journey) {
			journey = { to: nav.chapter, from: r3(nav.from), toTravel: nav.to, plannedMs: Math.round(nav.durationMs), actualMs: 0, outcome: 'running' };
			journeyAt = now - nav.elapsedMs;
		}
	};

	// ---- the panel
	const style = document.createElement('style');
	style.textContent = STYLE;
	document.head.append(style);
	const root = document.createElement('div');
	root.className = 'fperf';
	root.setAttribute('role', 'region');
	root.setAttribute('aria-label', 'Performance diagnostics');
	const button = (label: string, act: () => void, cls = '') => {
		const b = document.createElement('button');
		b.type = 'button';
		b.textContent = label;
		if (cls) b.className = cls;
		b.addEventListener('click', act);
		return b;
	};
	const bar = document.createElement('div');
	bar.className = 'fperf-bar';
	const body = document.createElement('div');
	body.className = 'fperf-body';
	const text = document.createElement('pre');
	text.className = 'fperf-text';
	const status = document.createElement('div');
	status.className = 'fperf-status';
	status.setAttribute('role', 'status');
	const manual = document.createElement('textarea');
	manual.className = 'fperf-manual';
	manual.readOnly = true;
	manual.setAttribute('aria-label', 'Report, to select and copy by hand');
	let collapsed = (store.get('collapsed') ?? String(matchMedia('(max-width: 640px), (max-height: 520px)').matches)) === 'true';
	// On a phone the chapter's own buttons and links sit along the bottom edge, and the header along the top:
	// the strip just under the header only ever covers a label. On a wide screen the lower left is free.
	let dock = store.get('dock') ?? (matchMedia('(max-width: 640px)').matches ? 'top' : 'bottom');
	let lowPower = LOW_POWER.find((v) => v === store.get('lowPower')) ?? 'unknown';
	let copied = '';
	const say = (message: string, bad = false) => {
		status.textContent = message;
		status.dataset.bad = String(bad);
	};

	const toggle = button('', () => {
		collapsed = !collapsed;
		store.set('collapsed', String(collapsed));
		root.dataset.collapsed = String(collapsed);
		toggle.setAttribute('aria-expanded', String(!collapsed));
		refresh();
	}, 'fperf-toggle');
	const reset = () => {
		head = filled = frames = 0;
		interval.reset();
		work.reset();
		submit.reset();
		slow.budget = slow.over33 = slow.over50 = slow.over100 = 0;
		slowByScene.clear();
		slowHead = slowCount = 0;
		pendingSlow = -1;
		gpuHead = gpuCount = gpuSum = gpuMax = gpuDiscarded = pollGapSum = pollGaps = 0;
		marks.length = timeline.length = journeys.length = 0;
		draw.calls = [Infinity, 0];
		draw.triangles = [Infinity, 0];
		qualityStart = resourcesStart = null;
		qualityKey = '';
		captureStart = performance.now();
		manual.dataset.shown = 'false';
		say('Capture restarted.');
		refresh();
	};
	const lowPowerButton = button('', () => {
		lowPower = LOW_POWER[(LOW_POWER.indexOf(lowPower) + 1) % LOW_POWER.length];
		store.set('lowPower', lowPower);
		lowPowerButton.textContent = `Low Power Mode: ${lowPower}`;
	});
	lowPowerButton.textContent = `Low Power Mode: ${lowPower}`;

	const showManual = (json: string) => {
		manual.value = json;
		manual.dataset.shown = 'true';
		if (collapsed) toggle.click();
		say('Copy was refused. Select the text below and copy it by hand.', true);
	};
	/** The copy that needs no secure context: the phone reaches a test build over plain http on the local network. */
	const copyByCommand = (json: string): boolean => {
		const area = document.createElement('textarea');
		area.value = json;
		area.readOnly = true;
		// 16 px keeps iOS from zooming to the field. It stays on screen, or iOS will not select it.
		area.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px';
		document.body.append(area);
		area.focus({ preventScroll: true });
		area.select();
		area.setSelectionRange(0, json.length);
		let ok = false;
		try {
			ok = document.execCommand('copy');
		} catch {
			ok = false;
		}
		area.remove();
		return ok;
	};
	const copy = () => {
		const json = JSON.stringify(report());
		const done = (how: string) => {
			copied = json;
			manual.dataset.shown = 'false';
			say(`Report copied (${r1(json.length / 1024)} kB, ${how}).`);
		};
		if (isSecureContext && navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(json).then(
				() => done('clipboard'),
				() => (copyByCommand(json) ? done('copy command') : showManual(json)),
			);
		} else if (copyByCommand(json)) done('copy command');
		else showManual(json);
	};
	const fileName = () => `futari-perf-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
	const download = () => {
		const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 1)], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName();
		link.style.display = 'none';
		document.body.append(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 30000);
		say(`Report saved as ${link.download}.`);
	};
	const share = () => {
		const json = JSON.stringify(report());
		navigator.share({ title: 'Futari performance report', text: json }).then(
			() => say('Report shared.'),
			(error: unknown) => say(error instanceof DOMException && error.name === 'AbortError' ? 'Share cancelled.' : 'Share failed. Use Copy or Download.', true),
		);
	};

	const row = document.createElement('div');
	row.className = 'fperf-row';
	row.append(lowPowerButton, button('Download', download, 'fperf-download'));
	if (typeof navigator.share === 'function') row.append(button('Share', share, 'fperf-share'));
	row.append(
		button('Move', () => {
			dock = dock === 'top' ? 'bottom' : 'top';
			store.set('dock', dock);
			root.dataset.dock = dock;
		}, 'fperf-move'),
		button('Collapse', () => toggle.click(), 'fperf-collapse'),
	);
	bar.append(toggle, button('Reset', reset, 'fperf-reset'), button('Copy', copy, 'fperf-copy'));
	body.append(text, row, status, manual);
	root.append(bar, body);
	root.dataset.collapsed = String(collapsed);
	root.dataset.dock = dock;
	toggle.setAttribute('aria-expanded', String(!collapsed));
	document.body.append(root);

	// ---- figures
	/** The intervals of the last RECENT_MS, oldest dropped first, sorted into `scratch`. Returns how many, and their sum. */
	const recent = (): [number, number] => {
		let n = 0;
		let sum = 0;
		for (let i = 1; i <= filled && sum < RECENT_MS; i++) {
			const v = intervals[(head - i + WINDOW) % WINDOW];
			scratch[n++] = v;
			sum += v;
		}
		scratch.subarray(0, n).sort();
		return [n, sum];
	};
	const gpuStats = () => {
		const n = Math.min(gpuCount, GPU_SAMPLES);
		const sorted = Float32Array.from(gpuSamples.subarray(0, n)).sort();
		const at = (q: number) => (n === 0 ? 0 : r2(sorted[Math.min(n - 1, Math.floor(n * q))]));
		return { samples: gpuCount, mean: gpuCount ? r2(gpuSum / gpuCount) : 0, p50: at(0.5), p95: at(0.95), max: r2(gpuMax) };
	};
	const qualityOf = (s: DiagnosticsSnapshot): Quality => ({ tier: s.tier, tierName: s.tierName, dpr: r3(s.dpr), msaa: s.msaa, bloomScale: s.bloomScale, buffer: [s.bufferWidth, s.bufferHeight], css: [s.cssWidth, s.cssHeight] });
	const resourcesOf = (s: DiagnosticsSnapshot): Resources => ({ programs: s.programs, geometries: s.geometries, textures: s.textures });
	const elapsed = () => performance.now() - captureStart;

	/** Reads the engine once and folds what only changes slowly into the capture. */
	const sample = (): DiagnosticsSnapshot => {
		const s = source.snapshot();
		if (s.budgetMs > 0) budgetMs = s.budgetMs;
		qualityStart ??= qualityOf(s);
		resourcesStart ??= resourcesOf(s);
		const key = `tier ${s.tier} ${s.tierName} · DPR ${r3(s.dpr)} · MSAA ${s.msaa} · bloom ${s.bloomScale} · ${s.bufferWidth}x${s.bufferHeight}`;
		if (key !== qualityKey) {
			qualityKey = key;
			timeline.push([r1(elapsed() / 1000), key]);
			if (timeline.length > TIMELINE) timeline.splice(1, 1);
		}
		// counters of the last frame the engine drew. A frame between two samples is not seen.
		if (s.calls > 0) {
			draw.calls = [Math.min(draw.calls[0], s.calls), Math.max(draw.calls[1], s.calls)];
			draw.triangles = [Math.min(draw.triangles[0], s.triangles), Math.max(draw.triangles[1], s.triangles)];
		}
		return s;
	};

	const slowList = (): Report['slowFrames']['recent'] => {
		const out: Report['slowFrames']['recent'] = [];
		for (let i = Math.min(slowCount, RECENT_SLOW); i >= 1; i--) {
			const at = ((slowHead - i + RECENT_SLOW) % RECENT_SLOW) * 4;
			out.push([r1(slowRing[at + 3]), r3(slowRing[at]), sceneAt(slowRing[at]), r1(slowRing[at + 1]), r1(slowRing[at + 2])]);
		}
		return out;
	};

	function report(): Report {
		const s = sample();
		const frame = interval.stats();
		const view = window.visualViewport;
		return {
			schema: SCHEMA,
			at: new Date().toISOString(),
			url: location.href,
			userAgent: navigator.userAgent,
			browser: parseAgent(navigator.userAgent),
			screen: { width: screen.width, height: screen.height, devicePixelRatio, viewport: [innerWidth, innerHeight], visualViewport: view ? [r1(view.width), r1(view.height), r2(view.scale)] : null, orientation: screen.orientation?.type ?? (innerWidth > innerHeight ? 'landscape' : 'portrait') },
			input: { coarsePointer: s.coarsePointer, reducedMotion: s.reducedMotion, lowPowerMode: lowPower },
			capture: { seconds: r1(elapsed() / 1000), frames },
			frameIntervalMs: { ...frame, fps: frame.mean > 0 ? r1(1000 / frame.mean) : 0 },
			cpuFrameWorkMs: work.stats(),
			cpuRenderSubmissionMs: submit.stats(),
			gpu: { method: gpuMethod, ...gpuStats(), ...(fences && pollGaps ? { pollResolutionMs: r2(pollGapSum / pollGaps) } : {}), discarded: gpuDiscarded, ...(gpuMethod === GPU_NONE ? {} : { caveat: GPU_CAVEAT[gpuMethod] }) },
			slowFrames: { budgetMs: r2(budgetMs), overBudgetX1_5: slow.budget, over33ms: slow.over33, over50ms: slow.over50, over100ms: slow.over100, byScene: Object.fromEntries(slowByScene), recent: slowList(), recentColumns: 'seconds into capture, position in journey units, scene, frame interval ms, CPU frame work ms' },
			quality: { start: qualityStart, end: qualityOf(s), transitionPass: s.transitionPass, tierCeiling: s.tierCeiling, tierCount: s.tierCount, timeline: [...timeline] },
			governor: { budgetMs: r2(s.budgetMs), cadenceMs: r2(s.cadenceMs), capped: s.capped, slowShare: r3(s.slowShare), state: s.governor },
			draw: { calls: draw.calls[1] ? draw.calls : [0, 0], triangles: draw.triangles[1] ? draw.triangles : [0, 0], note: 'min and max of the last drawn frame, sampled twice a second' },
			resources: { start: resourcesStart, end: resourcesOf(s), rebases: s.rebases },
			position: { units: r3(s.units), travel: r3(s.travel), scene: s.scene, chapter: s.chapter, engineState: s.engineState },
			marks: [...marks],
			navigation: journey ? [...journeys, { ...journey, actualMs: Math.round(performance.now() - journeyAt) }] : [...journeys],
		};
	}

	const esc = (v: string) => v.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
	function refresh(): void {
		const s = sample();
		const [n, sum] = recent();
		const at = (q: number) => (n === 0 ? 0 : scratch[Math.min(n - 1, Math.floor(n * q))]);
		// frames per second over the last second or so, from the intervals themselves
		let fpsFrames = 0;
		let fpsSum = 0;
		for (let i = 1; i <= filled && fpsSum < 1000; i++) {
			fpsSum += intervals[(head - i + WINDOW) % WINDOW];
			fpsFrames++;
		}
		const fps = fpsSum > 0 ? (fpsFrames / fpsSum) * 1000 : 0;
		const time = clock(elapsed());
		toggle.textContent = `${collapsed ? '▸' : '▾'} ${time} ${fps.toFixed(0)}fps p95 ${at(0.95).toFixed(1)} T${s.tier} ${s.bufferWidth}x${s.bufferHeight}`;
		if (collapsed) return;
		const all = interval.stats();
		const cpu = work.stats();
		const sub = submit.stats();
		const gpu = gpuStats();
		const nav = navigationState();
		const scenes = [...slowByScene].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => `${name} ${count}`);
		const lastSlow = slowList().slice(-3).reverse().map((f) => `${f[1].toFixed(3)} ${f[3].toFixed(0)}ms`);
		// a timer query that reads about one whole frame interval is timing the wait for the display, not the work
		const queued = gpuMethod === GPU_QUERY && gpu.samples > 10 && all.p50 > 0 && gpu.p50 > 0.85 * all.p50;
		const lines = [
			`<b>${esc(s.scene)}</b> · u ${s.units.toFixed(3)} · lap ${Math.floor(s.travel)} · ${s.chapter ?? 'no chapter'}${s.engineState === 'ready' ? '' : ` · ${esc(s.engineState)}`}`,
			`<b>frame interval</b> ${fps.toFixed(1)} fps, last ${Math.round(sum / 1000)} s`,
			`  p50 ${at(0.5).toFixed(1)}  p95 ${at(0.95).toFixed(1)}  p99 ${at(0.99).toFixed(1)}  max ${(n ? scratch[n - 1] : 0).toFixed(1)} ms`,
			`<b>capture</b> ${time}, ${frames} frames`,
			`  p50 ${all.p50.toFixed(1)}  p95 ${all.p95.toFixed(1)}  p99 ${all.p99.toFixed(1)}  max ${all.max.toFixed(0)} ms`,
			`<b>slow frames</b> &gt;${SLOW_BUDGETS}x budget ${slow.budget} · &gt;33 ${slow.over33} · &gt;50 ${slow.over50} · &gt;100 ms ${slow.over100}`,
			...(scenes.length ? [`  where: ${esc(scenes.join(' · '))}`] : []),
			...(lastSlow.length ? [`  latest at ${lastSlow.join(' · ')}`] : []),
			`<b>CPU frame work</b> p50 ${cpu.p50.toFixed(1)} p95 ${cpu.p95.toFixed(1)} ms`,
			`<b>CPU render submission</b> p50 ${sub.p50.toFixed(1)} p95 ${sub.p95.toFixed(1)} ms`,
			...(gpuMethod === GPU_NONE ? ['<b>GPU</b> not measurable in this browser'] : [`<b>${gpuMethod}</b>`, gpu.samples ? `  p50 ${gpu.p50.toFixed(1)} p95 ${gpu.p95.toFixed(1)} max ${gpu.max.toFixed(1)} ms, ${gpu.samples} samples${queued ? '\n  reads near the frame interval: it includes the wait for the display' : ''}` : '  waiting for a sample']),
			`<b>quality</b> tier ${s.tier} of 0-${Math.max(0, s.tierCount - 1)} "${esc(s.tierName)}", ceiling ${s.tierCeiling}`,
			`  DPR ${r2(s.dpr)} of ${r2(s.devicePixelRatio)} · MSAA ${s.msaa} · bloom ${r2(s.bloomScale)} · transition pass ${s.transitionPass ? 'on' : 'skipped'}`,
			`canvas ${s.cssWidth}x${s.cssHeight} CSS px · drawing buffer ${s.bufferWidth}x${s.bufferHeight} px`,
			`draw calls ${s.calls} · triangles ${s.triangles.toLocaleString('en')} · programs ${s.programs}`,
			`  geometries ${s.geometries} · textures ${s.textures} · rebases ${s.rebases}`,
			`<b>governor</b> ${esc(s.governor)} · slow share ${(s.slowShare * 100).toFixed(0)}%`,
			`  budget ${s.budgetMs.toFixed(1)} ms · display cadence ${s.cadenceMs.toFixed(1)} ms${s.capped ? '\n  <b>the browser is capping frames</b>: Low Power Mode?' : ''}`,
			nav.active
				? `<b>navigation</b> to ${nav.chapter ?? '?'} · ${(nav.elapsedMs / 1000).toFixed(1)} of ${(nav.durationMs / 1000).toFixed(1)} s\n  travel ${nav.from.toFixed(3)} to ${nav.to.toFixed(3)}`
				: `<b>navigation</b> idle${nav.lastOutcome ? ` · last: ${nav.lastOutcome} after ${(nav.lastDurationMs / 1000).toFixed(1)} s` : ''}${journeys.length ? ` · ${journeys.length} logged` : ''}`,
		];
		text.innerHTML = lines.join('\n');
	}

	const interval2Hz = window.setInterval(refresh, REFRESH_MS);
	refresh();
	window.__futariPerf = { report, reset, refresh, lastCopy: () => copied };

	return {
		frameStart(intervalMs) {
			const now = performance.now();
			frameAt = now;
			watchNavigation(now);
			if (queryPending && query && gl2 && timer && !contextLost && gl2.getQueryParameter(query, gl2.QUERY_RESULT_AVAILABLE)) {
				// a disjoint reading means the GPU was interrupted while it timed: the number is not a frame's cost
				if (gl2.getParameter(timer.GPU_DISJOINT_EXT)) gpuDiscarded++;
				else addGpu((gl2.getQueryParameter(query, gl2.QUERY_RESULT) as number) / 1e6);
				queryPending = false;
			}
			// the first callback after the loop starts or resumes has no previous frame to measure from
			if (!(intervalMs > 0.05)) return;
			frames++;
			intervals[head] = intervalMs;
			head = (head + 1) % WINDOW;
			if (filled < WINDOW) filled++;
			interval.add(intervalMs);
			if (intervalMs > 33.4) slow.over33++;
			if (intervalMs > 50) slow.over50++;
			if (intervalMs > 100) slow.over100++;
			if (intervalMs > budgetMs * SLOW_BUDGETS) {
				slow.budget++;
				const u = unitsNow();
				const scene = sceneAt(u);
				slowByScene.set(scene, (slowByScene.get(scene) ?? 0) + 1);
				pendingSlow = slowHead * 4;
				slowRing[pendingSlow] = u;
				slowRing[pendingSlow + 1] = intervalMs;
				slowRing[pendingSlow + 2] = 0;
				slowRing[pendingSlow + 3] = (now - captureStart) / 1000;
				slowHead = (slowHead + 1) % RECENT_SLOW;
				slowCount++;
			}
		},
		renderStart() {
			renderAt = performance.now();
			if (timer && gl2 && !queryPending && !contextLost) {
				query ??= gl2.createQuery();
				if (query) {
					gl2.beginQuery(timer.TIME_ELAPSED_EXT, query);
					queryOpen = true;
				}
			}
		},
		renderEnd() {
			const now = performance.now();
			submit.add(now - renderAt);
			if (queryOpen && gl2 && timer) {
				gl2.endQuery(timer.TIME_ELAPSED_EXT);
				queryOpen = false;
				queryPending = true;
			} else if (fences && gl2 && !sync && !contextLost && ++sinceFence >= FENCE_EVERY) {
				sinceFence = 0;
				sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
				// without a flush the fence may sit in the command queue and never be reached
				gl2.flush();
				syncAt = syncSeen = performance.now();
				syncTimer = window.setTimeout(pollFence, 0);
			}
		},
		frameEnd() {
			const cpu = performance.now() - frameAt;
			work.add(cpu);
			// the work that follows a slow interval is the nearest thing the page can see to its cause
			if (pendingSlow >= 0) {
				slowRing[pendingSlow + 2] = cpu;
				pendingSlow = -1;
			}
		},
		mark(kind, detail = '') {
			if (kind === 'context') dropGpu();
			marks.push([r1(elapsed() / 1000), kind, detail]);
			// the first marks say how the visit began. After that the newest matter most.
			if (marks.length > MARKS) marks.splice(8, 1);
		},
		dispose() {
			clearInterval(interval2Hz);
			clearTimeout(syncTimer);
			gl.canvas.removeEventListener('webglcontextlost', onLost);
			gl.canvas.removeEventListener('webglcontextrestored', onRestored);
			if (gl2 && !contextLost) {
				if (queryOpen && timer) gl2.endQuery(timer.TIME_ELAPSED_EXT);
				if (query) gl2.deleteQuery(query);
				if (sync) gl2.deleteSync(sync);
			}
			root.remove();
			style.remove();
			delete window.__futariPerf;
		},
	};
};
