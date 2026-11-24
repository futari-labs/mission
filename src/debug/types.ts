// The contract between the frame loop and the opt-in performance overlay (?debug=performance).
// The overlay module is loaded only when asked for, so a normal visit carries none of it.
import type { ChapterId } from '../journey/chapters.ts';
import type { NavigationState } from '../journey/travel.ts';

/** What the renderer is doing right now. Read at a low frequency, never per frame. */
export interface DiagnosticsSnapshot {
	/** Position within the lap in journey units, and the continuous travel in laps. */
	units: number;
	travel: number;
	chapter: ChapterId | null;
	/** A name for the stretch of the journey at `units`: "winter, opening", "ring passage", and so on. */
	scene: string;
	engineState: string;
	/** Quality tier: its index (0 is the lowest), its name, the highest tier the governor may still use, and how many there are. */
	tier: number;
	tierName: string;
	tierCeiling: number;
	tierCount: number;
	/** Rendered pixels per CSS pixel, the display's own ratio, and the samples of the scene buffer. */
	dpr: number;
	devicePixelRatio: number;
	msaa: number;
	bloomScale: number;
	/** Whether the transition pass ran in the last frame. It is skipped while its effects rest at zero. */
	transitionPass: boolean;
	/** The canvas in CSS pixels and its drawing buffer in real pixels. */
	cssWidth: number;
	cssHeight: number;
	bufferWidth: number;
	bufferHeight: number;
	/** Counters of the last rendered frame, and what is alive on the GPU. */
	calls: number;
	triangles: number;
	programs: number;
	geometries: number;
	textures: number;
	/** Whole-lap scroll corrections so far. */
	rebases: number;
	/** The governor's view: the frame interval it holds the renderer to, and the display cadence it measured. */
	budgetMs: number;
	cadenceMs: number;
	/** True when the browser itself is holding frames back (Low Power Mode, a 30 fps cap). That is not rendering overload. */
	capped: boolean;
	/** Share of recent frames that missed the budget, 0 to 1: the governor's rolling estimate. */
	slowShare: number;
	/**
	 * The governor's last measurement of one whole frame, script and GPU together: the time from the start of
	 * the frame's script until one pixel could be read back. 0 before any measurement. Taken a few times a visit.
	 */
	frameCostMs: number;
	/** What the governor is doing, in a few words: "steady", "cooldown", "trying tier 3", "held by ?dpr". */
	governor: string;
	coarsePointer: boolean;
	reducedMotion: boolean;
	navigation: Readonly<NavigationState>;
}

export interface DiagnosticsSource {
	gl: WebGL2RenderingContext | WebGLRenderingContext;
	snapshot(): DiagnosticsSnapshot;
	/** The rendered position within the lap, in journey units. Cheap enough to read every frame. */
	units(): number;
}

/** What the frame loop calls. Every method must be cheap: no layout, no logging, no allocation per frame. */
export interface PerformanceDiagnostics {
	/** Start of the frame callback. `intervalMs` is the time since the previous animation frame: a frame interval, not a cost. */
	frameStart(intervalMs: number): void;
	/** Around the WebGL submission of the frame, for a GPU measurement where the browser offers one. */
	renderStart(): void;
	renderEnd(): void;
	/** End of the frame callback. Between frameStart and frameEnd is main-thread work: CPU time, not GPU time. */
	frameEnd(): void;
	/** A discrete event worth a line in the report: a tier change, a resize, a lost context, a navigation. */
	mark(kind: string, detail?: string): void;
	dispose(): void;
}

export type CreateDiagnostics = (source: DiagnosticsSource) => PerformanceDiagnostics;
