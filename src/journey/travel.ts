// The one authority for where the visitor is.
//
// `travel` counts laps and never wraps: 0.98, 1.0, 1.02 and onward. Everything else derives from it.
// The renderer damps it and then takes the fraction to find the position inside one lap.
//
// The page scrolls natively over a spacer that is LAPS laps tall. travel = base + scrollY / lapPixels.
// When the visitor drifts away from the middle lap, `maintain` moves scrollY by whole laps and
// changes `base` by the same number, so travel does not change and nothing on screen moves.
import { CHAPTERS, type ChapterId, CYCLE, SCREENS_PER_UNIT } from './chapters.ts';

const LAPS = 7;
const HOME = 3;
const KEY = 'futari.position';

let track: HTMLElement | null = null;
let lapPx = 0;
let base = -HOME;
let current = 0;
let lastScroll = 0;
let busyUntil = 0;
let rebases = 0;

/** An automatic journey to a chapter, for anything that reports on it. Positions are continuous travel, in laps. */
export interface NavigationState {
	active: boolean;
	chapter: ChapterId | null;
	from: number;
	to: number;
	/** Milliseconds since the journey began, and how long it is planned to take in all. */
	elapsedMs: number;
	durationMs: number;
	/** How the last journey ended, and how long it ran. */
	lastOutcome: 'arrived' | 'interrupted' | 'replaced' | null;
	lastDurationMs: number;
}

const navigation: NavigationState = { active: false, chapter: null, from: 0, to: 0, elapsedMs: 0, durationMs: 0, lastOutcome: null, lastDurationMs: 0 };

export const navigationState = (): Readonly<NavigationState> => navigation;

/** CSS height of the scroll spacer. svh, so a phone toolbar that hides while scrolling does not change the lap length. */
export const trackHeight = `${LAPS * CYCLE * SCREENS_PER_UNIT * 100}svh`;

/** Continuous position in laps. Without a scroll track (no WebGL) it stays where it was. */
export function readTravel(): number {
	if (lapPx > 0) current = base + scrollY / lapPx;
	return current;
}

export const lapPixels = (): number => lapPx;
export const rebaseCount = (): number => rebases;

/** Puts a logical position under the middle lap of the spacer. */
export function placeTravel(travel: number): void {
	if (lapPx <= 0) return;
	base = Math.floor(travel) - HOME;
	scrollTo(0, (travel - base) * lapPx);
	current = travel;
}

function recentre(): void {
	const shift = Math.floor(scrollY / lapPx) - HOME;
	if (shift === 0) return;
	// the browser rounds scroll positions to whole pixels, so take the new base from where it actually landed
	const travel = base + scrollY / lapPx;
	scrollTo(0, scrollY - shift * lapPx);
	base = travel - scrollY / lapPx;
	rebases++;
}

/**
 * Keeps the visitor away from the ends of the spacer. Called every frame.
 * It waits for scrolling to pause, because moving the scroll position can cut a touch fling short.
 * It only acts mid-scroll when an end of the spacer is close.
 */
export function maintain(now: number): void {
	if (lapPx <= 0 || document.documentElement.dataset.dialog) return;
	const laps = scrollY / lapPx;
	if (Math.floor(laps) === HOME) return;
	const nearEnd = laps < 0.8 || laps > LAPS - 0.8 - innerHeight / lapPx;
	const paused = now - lastScroll > 180 && now > busyUntil;
	if (nearEnd || paused) recentre();
}

/** Scrolls to the nearest occurrence of a chapter's rest point, forward or back, across the lap boundary if that is closer. */
export function goToChapter(id: ChapterId, smooth: boolean): void {
	if (lapPx <= 0) {
		document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
		return;
	}
	const here = readTravel();
	const phase = CHAPTERS.find((c) => c.id === id)!.rest / CYCLE;
	const candidates = [-1, 0, 1].map((k) => Math.floor(here) + k + phase);
	const target = candidates.reduce((best, c) => (Math.abs(c - here) < Math.abs(best - here) - 1e-6 ? c : best), candidates[2]);
	recentre();
	busyUntil = performance.now() + (smooth ? 1800 : 0);
	scrollTo({ top: (target - base) * lapPx, behavior: smooth ? 'smooth' : 'auto' });
}

/** Binds the scroll spacer. Restores the saved position after a reload or a back navigation. */
export function initTravel(element: HTMLElement): () => void {
	track = element;
	history.scrollRestoration = 'manual';
	lapPx = track.offsetHeight / LAPS;
	const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
	const saved = Number(sessionStorage.getItem(KEY));
	placeTravel(entry && entry.type !== 'navigate' && saved > 0 && saved < 1 ? saved : 0);
	const scrolled = () => {
		lastScroll = performance.now();
		readTravel();
	};
	// a resize or a rotation changes the lap length in pixels: keep the same logical position
	const resized = () => {
		const keep = current;
		lapPx = (track?.offsetHeight ?? 0) / LAPS;
		if (lapPx > 0) scrollTo(0, (keep - base) * lapPx);
	};
	// only the place within the lap is worth keeping across a reload
	const save = () => sessionStorage.setItem(KEY, String(((readTravel() % 1) + 1) % 1));
	addEventListener('scroll', scrolled, { passive: true });
	addEventListener('resize', resized);
	addEventListener('pagehide', save);
	return () => {
		removeEventListener('scroll', scrolled);
		removeEventListener('resize', resized);
		removeEventListener('pagehide', save);
		track = null;
		lapPx = 0;
	};
}
