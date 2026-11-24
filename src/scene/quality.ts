// Quality tiers, and the governor that moves between them from what the frames actually do.
//
// A tier sets how many pixels are rendered and how the scene buffer is sampled. Which ladder a
// device gets is a first guess from its pointer: coarse means a phone or tablet. From there the
// governor goes by measurement alone: how often a frame misses its slot on the display, and, when
// a decision depends on it, what one frame costs from its first line of script to the moment the
// GPU has finished it.
//
// Nothing here touches the DOM or WebGL. tools/governor-test.ts runs it against scripted frames.

export interface Tier {
	name: string;
	/** Rendered pixels per CSS pixel, before the display's own ratio and the pixel ceiling cap it. */
	dpr: number;
	/** The most pixels the drawing buffer may have. Keeps a tablet from rendering several phones' worth of frame. */
	maxPixels: number;
	/** Samples of the scene buffer. With 0 the foliage switches from coverage to an alpha-tested edge. */
	msaa: 0 | 2 | 4;
	/** Bloom resolution as a share of the frame. */
	bloom: number;
}

/**
 * The ladders, lowest tier first, and where each starts.
 *
 * Desktop starts at the top: the accepted look, 1.5 pixels per CSS pixel with four samples. Its lower
 * tiers only shed pixels, as before.
 *
 * A phone starts one below its top. Measured on the baseline (docs/mobile-performance): multisampling
 * the half-float scene buffer costs more than any other single setting, and a phone's display is dense
 * enough that 1.5 pixels per CSS pixel without it holds up beside 1.75 with it. The top tier keeps the
 * previous resolution and sampling, and is reached only when measured frames show room for it.
 */
export function tiersFor(coarse: boolean): { tiers: Tier[]; start: number } {
	if (!coarse) {
		return {
			tiers: [
				{ name: 'desktop-1.0', dpr: 1, maxPixels: Number.POSITIVE_INFINITY, msaa: 4, bloom: 1 },
				{ name: 'desktop-1.25', dpr: 1.25, maxPixels: Number.POSITIVE_INFINITY, msaa: 4, bloom: 1 },
				{ name: 'desktop-1.5', dpr: 1.5, maxPixels: Number.POSITIVE_INFINITY, msaa: 4, bloom: 1 },
			],
			start: 2,
		};
	}
	return {
		tiers: [
			{ name: 'phone-1.0', dpr: 1, maxPixels: 0.8e6, msaa: 0, bloom: 0.5 },
			{ name: 'phone-1.25', dpr: 1.25, maxPixels: 1.1e6, msaa: 0, bloom: 0.5 },
			{ name: 'phone-1.5', dpr: 1.5, maxPixels: 1.5e6, msaa: 0, bloom: 0.5 },
			{ name: 'phone-1.75-msaa', dpr: 1.75, maxPixels: 2.2e6, msaa: 2, bloom: 0.5 },
		],
		start: 2,
	};
}

/** The pixel ratio a tier renders at on this canvas and display. */
export function pixelRatioFor(tier: Tier, cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
	const ceiling = Math.sqrt(tier.maxPixels / Math.max(1, cssWidth * cssHeight));
	return Math.max(0.75, Math.min(tier.dpr, devicePixelRatio, ceiling));
}

/** Relative rendering load of a tier: its pixels, and the price of multisampling measured on the baseline. */
export const loadOf = (tier: Tier): number => tier.dpr * tier.dpr * (tier.msaa > 0 ? 1.6 : 1);

export const FRAME_60 = 1000 / 60;

/** Frames in the rolling window, and how often it is judged. */
const WINDOW = 96;
const EVERY = 24;
/** A tier on trial is judged on fewer frames, so one that is too heavy is left quickly. */
const TRIAL_WINDOW = 48;
const TRIAL_MS = 10000;
/** A frame that took this many budgets missed its slot on the display. */
const MISSED = 1.4;
/** Consider a lower tier when this share of the window missed, on this many judgements in a row. */
const LOWER_AT = 0.12;
const LOWER_AFTER = 2;
/** A frame that costs this share of the budget, measured, is overload. Below it, missed frames have another cause. */
const OVERLOAD = 0.8;
/** Frames measured in a row to confirm overload. The least of them counts, so one spike does not. */
const CONFIRM_FRAMES = 3;
/** Consider a higher tier only after this long with almost nothing missed. */
const RAISE_BELOW = 0.02;
const RAISE_AFTER_MS = 8000;
/** While a higher tier is possible, a frame's cost is measured this often, and at least this many times before deciding. */
const SAMPLE_EVERY_MS = 2500;
const SAMPLES_TO_RAISE = 3;
/** Raise only if the heaviest frame measured, scaled to the next tier's load, would use this share of the budget. */
const HEADROOM = 0.6;
/** After finding too little headroom, look again this much later, and only this many times in a visit. */
const RECHECK_AFTER_MS = 30000;
const RECHECKS = 3;
/** A tier left for being too heavy may be tried once more after this long. One that fails on trial is out for the visit. */
const RETRY_AFTER_MS = 45000;
const STRIKES_OUT = 2;
/** Frames are ignored for this long after a change of tier, and after the loop starts. */
export const HOLD_AFTER_CHANGE_MS = 1500;
export const HOLD_AT_START_MS = 2500;
const HOLD_ON_TRIAL_MS = 800;

export interface GovernorOptions {
	/** Relative rendering load of each tier, lowest first. Only the ratios matter. */
	loads: number[];
	start: number;
	/** False holds the tier for the whole visit: captures, and experiments that set the variable under test. */
	enabled: boolean;
}

/**
 * Chooses the tier from what the frames do.
 *
 * - It judges a rolling window by the share of frames that missed their slot, so one long stall
 *   (a shader compile, a tab switch) counts as one frame, and a sustained 50 fps counts as what it is.
 * - Before it lowers a tier it asks for the cost of a frame, measured to the end of the GPU's work
 *   (`wantsCost`, answered through `cost`). If frames are being missed while each one costs well under
 *   the budget, rendering is not the cause: either the browser is pacing frames itself (Safari in
 *   Low Power Mode holds 30 fps), which becomes the new budget, or something else on the page is
 *   busy. Neither is helped by a lower tier, so the tier stays.
 * - It raises a tier only after a long calm stretch in which the heaviest measured frame, scaled to
 *   the next tier's load, leaves clear headroom. The raised tier is on trial: if it misses frames it is
 *   left at once and not tried again. A tier left under sustained load may be retried once, much later.
 *   So the tier cannot oscillate.
 */
export class Governor {
	tier: number;
	/** The interval the renderer is held to: the display's, but never tighter than 60 fps. */
	budget = FRAME_60;
	/** The median interval of the last window. */
	cadence = FRAME_60;
	/** The browser is pacing frames slower than 60 fps by itself. */
	capped = false;
	/** Share of the last window that missed its slot. */
	slowShare = 0;
	/** The last measured cost of one frame, script and GPU together, in milliseconds. 0 before any measurement. */
	lastCost = 0;
	/** True when the next frame should be measured to the end of the GPU's work and reported through `cost`. */
	wantsCost = false;
	status = 'starting';

	private readonly enabled: boolean;
	private readonly loads: number[];
	private readonly intervals = new Float32Array(WINDOW);
	private readonly missed = new Uint8Array(WINDOW);
	private readonly sorted = new Float32Array(WINDOW);
	private readonly strikes: number[];
	private readonly struckAt: number[];
	private at = 0;
	private filled = 0;
	private missedCount = 0;
	private sinceJudged = 0;
	private over = 0;
	private heldUntil = 0;
	private calmSince = -1;
	private confirmLeft = 0;
	private confirmBest = Number.POSITIVE_INFINITY;
	private trialUntil = 0;
	private sampledAt = 0;
	private samples = 0;
	private peakCost = 0;
	private recheckAt = 0;
	private rechecks = 0;

	constructor(options: GovernorOptions) {
		this.loads = options.loads;
		this.tier = Math.min(options.loads.length - 1, Math.max(0, options.start));
		this.enabled = options.enabled && options.loads.length > 1;
		this.strikes = new Array<number>(options.loads.length).fill(0);
		this.struckAt = new Array<number>(options.loads.length).fill(0);
		if (!this.enabled) this.status = options.enabled ? 'one tier' : 'held';
	}

	/** The highest tier that may still be used. */
	get ceiling(): number {
		let top = this.tier;
		while (top + 1 < this.loads.length && this.strikes[top + 1] < STRIKES_OUT) top++;
		return top;
	}

	/** Ignore frames for a while: the loop has just started, the buffers were just rebuilt, the tab came back. */
	hold(now: number, ms: number): void {
		this.heldUntil = Math.max(this.heldUntil, now + ms);
		this.clear();
	}

	/**
	 * What the display does with nothing to draw, read while the assets load. A display that is already
	 * slower than 60 fps before the first frame is a cap, not load.
	 */
	calibrate(idleIntervalMs: number): void {
		if (!this.enabled || idleIntervalMs <= FRAME_60 * MISSED) return;
		this.capped = true;
		this.budget = idleIntervalMs;
		this.status = 'frame rate capped by the browser';
	}

	/** One frame interval in milliseconds. Returns the new tier when it changes, otherwise null. */
	frame(intervalMs: number, now: number): number | null {
		if (!this.enabled || now < this.heldUntil) return null;
		if (this.calmSince < 0) this.calmSince = now;
		const miss = intervalMs > this.budget * MISSED ? 1 : 0;
		this.missedCount += miss - this.missed[this.at];
		this.missed[this.at] = miss;
		this.intervals[this.at] = intervalMs;
		this.at = (this.at + 1) % WINDOW;
		if (this.filled < WINDOW) this.filled++;
		const trial = now < this.trialUntil;
		if (++this.sinceJudged < EVERY || this.filled < (trial ? TRIAL_WINDOW : WINDOW)) return null;
		this.sinceJudged = 0;
		return this.judge(now, trial);
	}

	private judge(now: number, trial: boolean): number | null {
		this.slowShare = this.missedCount / this.filled;
		this.sorted.fill(Number.POSITIVE_INFINITY);
		this.sorted.set(this.intervals.subarray(0, this.filled));
		this.sorted.sort();
		this.cadence = this.sorted[this.filled >> 1];

		// a cap that has lifted: frames arrive faster than the rate taken for the display's
		if (this.capped && this.cadence < this.budget * 0.75) {
			this.capped = false;
			this.budget = FRAME_60;
			this.status = 'steady';
			this.clear();
			this.calmSince = now;
			return null;
		}
		if (this.slowShare >= LOWER_AT) {
			this.calmSince = now;
			this.resetSamples();
			// a tier on trial that misses frames has answered the question
			if (trial) return this.lower(now, STRIKES_OUT);
			if (++this.over >= LOWER_AFTER && this.confirmLeft === 0) {
				this.over = 0;
				this.confirmLeft = CONFIRM_FRAMES;
				this.confirmBest = Number.POSITIVE_INFINITY;
				this.wantsCost = true;
				this.status = 'measuring a frame';
			}
			return null;
		}
		this.over = 0;
		this.status = this.capped ? 'frame rate capped by the browser' : trial ? `trying tier ${this.tier}` : 'steady';
		if (this.slowShare > RAISE_BELOW) {
			this.calmSince = now;
			this.resetSamples();
			return null;
		}
		// under a cap the frames say nothing about 60 fps, so the tier stays
		const next = this.tier + 1;
		if (this.capped || trial || next >= this.loads.length || this.strikes[next] >= STRIKES_OUT) return null;
		if (this.strikes[next] > 0 && now - this.struckAt[next] < RETRY_AFTER_MS) return null;
		if (now < this.recheckAt || this.rechecks >= RECHECKS) return null;
		if (now - this.sampledAt >= SAMPLE_EVERY_MS) {
			this.sampledAt = now;
			this.wantsCost = true;
		}
		if (now - this.calmSince < RAISE_AFTER_MS || this.samples < SAMPLES_TO_RAISE) return null;
		const predicted = (this.peakCost * this.loads[next]) / this.loads[this.tier];
		this.resetSamples();
		if (predicted > this.budget * HEADROOM) {
			// not enough room. Look again later, a few times at most.
			this.recheckAt = now + RECHECK_AFTER_MS;
			this.rechecks++;
			this.calmSince = now;
			return null;
		}
		this.tier = next;
		this.trialUntil = now + TRIAL_MS;
		this.status = `trying tier ${next}`;
		this.hold(now, HOLD_ON_TRIAL_MS);
		this.calmSince = this.heldUntil;
		return next;
	}

	/**
	 * The cost of the frame that was asked for: milliseconds from the start of its script to the end
	 * of the GPU's work on it. Returns the new tier when it changes, otherwise null.
	 */
	cost(ms: number, now: number): number | null {
		this.wantsCost = false;
		this.lastCost = ms;
		if (this.confirmLeft === 0) {
			this.samples++;
			this.peakCost = Math.max(this.peakCost, ms);
			return null;
		}
		this.confirmBest = Math.min(this.confirmBest, ms);
		if (--this.confirmLeft > 0) {
			this.wantsCost = true;
			return null;
		}
		this.calmSince = now;
		if (this.confirmBest >= this.budget * OVERLOAD) return this.lower(now, 1);
		const cadence = this.cadence;
		this.clear();
		if (cadence >= this.budget * MISSED) {
			// every frame is cheap and still they arrive slowly: the browser is pacing them
			this.capped = true;
			this.budget = cadence;
			this.status = 'frame rate capped by the browser';
		} else this.status = 'frames missed outside rendering';
		return null;
	}

	private lower(now: number, strikes: number): number | null {
		if (this.tier === 0) {
			this.status = 'overloaded at the lowest tier';
			this.hold(now, HOLD_AFTER_CHANGE_MS);
			return null;
		}
		this.strikes[this.tier] = Math.min(STRIKES_OUT, this.strikes[this.tier] + strikes);
		this.struckAt[this.tier] = now;
		this.tier--;
		this.trialUntil = 0;
		this.status = `lowered to tier ${this.tier}`;
		this.hold(now, HOLD_AFTER_CHANGE_MS);
		this.calmSince = this.heldUntil;
		return this.tier;
	}

	private resetSamples(): void {
		this.samples = 0;
		this.peakCost = 0;
	}

	private clear(): void {
		this.missed.fill(0);
		this.at = 0;
		this.filled = 0;
		this.missedCount = 0;
		this.sinceJudged = 0;
		this.over = 0;
		this.slowShare = 0;
	}
}
