// The one authority for where the visitor is.
//
// `travel` counts laps and never wraps: 0.98, 1.0, 1.02 and onward. Everything else derives from it.
// The renderer damps it and then takes the fraction to find the position inside one lap.
//
// The page scrolls natively over a spacer that is LAPS laps tall. travel = base + scrollY / lapPixels.
// When the visitor drifts away from the middle lap, `maintain` moves scrollY by whole laps and
// changes `base` by the same number, so travel does not change and nothing on screen moves.
//
// A chapter link is a journey: this module scrolls the page itself, frame by frame, at a steady
// manual pace, to the chapter's rest. It moves the same scroll position a wheel or a finger moves,
// so everything that follows from scroll position plays as it does by hand, and the visitor can
// take over at any moment.
import { CHAPTERS, type ChapterId, CYCLE, NAVIGATION_EASE_IN_SECONDS, NAVIGATION_EASE_OUT_SECONDS, NAVIGATION_SCREENS_PER_SECOND, SCREENS_PER_UNIT } from './chapters.ts';

const LAPS = 7;
const HOME = 3;
const KEY = 'futari.position';

// A journey is kept in travel units, laps, so a resize or a whole-lap correction under it changes nothing.
const SCREENS_PER_LAP = CYCLE * SCREENS_PER_UNIT;
const CRUISE = NAVIGATION_SCREENS_PER_SECOND / SCREENS_PER_LAP;
const EASE_IN = CRUISE / NAVIGATION_EASE_IN_SECONDS;
const EASE_OUT = CRUISE / NAVIGATION_EASE_OUT_SECONDS;
/** Shedding speed that a new destination has made excessive may be firmer than the approach to a rest. */
const BRAKE = EASE_OUT * 2.5;
/** A scroll position further than this from where a journey put it, in CSS pixels, was moved by someone else. */
const FOREIGN_SCROLL = 2;
/** How many of its latest scroll positions a journey still recognises as its own. */
const ECHOES = 8;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar']);

interface Journey {
	position: number;
	/** Laps per second, signed. */
	velocity: number;
	target: number;
	startedAt: number;
	last: number;
	frame: number;
}

let track: HTMLElement | null = null;
let trackPx = 0;
let lapPx = 0;
let base = -HOME;
let current = 0;
let lastScroll = 0;
let rebases = 0;
let journey: Journey | null = null;
/**
 * Where the latest scrolls made here left the page. On a phone the scroll position is owned by
 * another process and reported back a moment later, so the page can briefly read a position that
 * was set a few frames ago. A journey must not take its own echo for the visitor's hand.
 */
const produced = new Float64Array(ECHOES);
let made = 0;
/** Fingers on the screen. The scroll position is theirs while there are any. */
let fingers = 0;

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
export const trackHeight = `${LAPS * SCREENS_PER_LAP * 100}svh`;

/**
 * Continuous position in laps. Without a scroll track (no WebGL) it stays where it was.
 * During a journey it is the journey's own position, which the scroll position follows to the
 * nearest pixel: reading the exact value keeps that rounding out of the camera.
 */
export function readTravel(): number {
	if (journey) current = journey.position;
	else if (lapPx > 0) current = base + scrollY / lapPx;
	return current;
}

export const lapPixels = (): number => lapPx;
export const rebaseCount = (): number => rebases;

/** Every scroll made here goes through this, so a journey can tell its own scrolling from the visitor's. */
function setScroll(y: number): void {
	scrollTo(0, y);
	produced[made++ % ECHOES] = scrollY;
}

/** True when the scroll position is nowhere a journey recently put it: the visitor, or something else, moved it. */
function movedByOther(): boolean {
	const y = scrollY;
	for (let i = 0; i < ECHOES; i++) if (Math.abs(y - produced[i]) <= FOREIGN_SCROLL) return false;
	return true;
}

/** Puts a logical position under the middle lap of the spacer. */
export function placeTravel(travel: number): void {
	if (lapPx <= 0) return;
	endJourney('interrupted');
	base = Math.floor(travel) - HOME;
	setScroll((travel - base) * lapPx);
	current = travel;
}

/**
 * Which lap of the spacer a scroll position is in. The browser keeps scroll positions to the pixel,
 * so the start of a lap can read as a hair before it. One pixel of tolerance keeps the opening,
 * which rests exactly on a lap boundary, in the lap it begins.
 */
const lapOf = (y: number): number => Math.floor((y + 1) / lapPx);

function recentre(): void {
	const shift = lapOf(scrollY) - HOME;
	if (shift === 0) return;
	// the browser rounds scroll positions to whole pixels, so take the new base from where it actually landed
	const travel = readTravel();
	setScroll(scrollY - shift * lapPx);
	base = travel - scrollY / lapPx;
	rebases++;
}

/**
 * Keeps the visitor away from the ends of the spacer. Called every frame.
 * It waits for scrolling to pause, because moving the scroll position can cut a touch fling short.
 * It never acts under a finger that is resting on the screen, and it leaves a journey alone for as
 * long as the journey runs. It only acts mid-scroll or mid-journey when an end of the spacer is close.
 */
export function maintain(now: number): void {
	if (lapPx <= 0 || document.documentElement.dataset.dialog) return;
	if (lapOf(scrollY) === HOME) return;
	const laps = scrollY / lapPx;
	const nearEnd = laps < 0.8 || laps > LAPS - 0.8 - innerHeight / lapPx;
	const paused = !journey && fingers === 0 && now - lastScroll > 180;
	if (nearEnd || paused) recentre();
}

/**
 * One step of a journey: the speed it should have this far from its destination, approached gently.
 * Far away that is the cruising pace. Near the rest it is the speed from which an even deceleration
 * stops exactly there. Returns true on arrival.
 */
function advance(j: Pick<Journey, 'position' | 'velocity' | 'target'>, dt: number): boolean {
	const remaining = j.target - j.position;
	const distance = Math.abs(remaining);
	const toward = Math.sign(remaining) || 1;
	const desired = toward * Math.min(CRUISE, Math.sqrt(2 * EASE_OUT * distance));
	const gaining = j.velocity * toward >= 0 && Math.abs(desired) > Math.abs(j.velocity);
	const limit = (gaining ? EASE_IN : BRAKE) * dt;
	j.velocity += Math.min(limit, Math.max(-limit, desired - j.velocity));
	const move = j.velocity * dt;
	// a journey never passes its destination: it ends on it
	if (distance < 1e-7 || (move * toward > 0 && Math.abs(move) >= distance)) {
		j.position = j.target;
		j.velocity = 0;
		return true;
	}
	j.position += move;
	return false;
}

/** How long a journey will take from a position and a speed, by running it ahead of time. */
function plannedSeconds(position: number, velocity: number, target: number): number {
	const ahead = { position, velocity, target };
	const dt = 1 / 120;
	let seconds = 0;
	while (seconds < 120 && !advance(ahead, dt)) seconds += dt;
	return seconds + dt;
}

function interruptOnWheel(event: WheelEvent): void {
	// a pinch on a trackpad arrives as a wheel with ctrl held: that is zoom, not scrolling
	if (!event.ctrlKey && event.deltaY !== 0) endJourney('interrupted');
}

function interruptOnTouch(event: TouchEvent): void {
	// A finger on a link may be a tap that sends the journey somewhere else. It takes over only once it moves.
	const onControl = event.type === 'touchstart' && event.target instanceof Element && event.target.closest('a, button') !== null;
	if (!onControl) endJourney('interrupted');
}

function interruptOnKey(event: KeyboardEvent): void {
	if (!SCROLL_KEYS.has(event.key)) return;
	// space on a control presses it, and does not scroll
	const pressing = (event.key === ' ' || event.key === 'Spacebar') && event.target instanceof Element && event.target.closest('a, button, input, textarea, select') !== null;
	if (!pressing) endJourney('interrupted');
}

const listening: AddEventListenerOptions = { passive: true, capture: true };

function endJourney(outcome: NonNullable<NavigationState['lastOutcome']>): void {
	const j = journey;
	if (!j) return;
	journey = null;
	cancelAnimationFrame(j.frame);
	removeEventListener('wheel', interruptOnWheel, listening);
	removeEventListener('touchstart', interruptOnTouch, listening);
	removeEventListener('touchmove', interruptOnTouch, listening);
	removeEventListener('keydown', interruptOnKey, listening);
	navigation.active = false;
	navigation.lastOutcome = outcome;
	navigation.lastDurationMs = navigation.elapsedMs = performance.now() - j.startedAt;
	// from here the scroll position is the authority again, wherever it is
	lastScroll = performance.now();
}

function step(now: number): void {
	const j = journey;
	if (!j) return;
	// A dialog holds the page still, and a scroll position that is not where this journey left it
	// means the visitor has moved it: a scrollbar drag, a scroll this module does not listen for.
	if (lapPx <= 0 || document.documentElement.dataset.dialog || movedByOther()) {
		endJourney('interrupted');
		return;
	}
	// a long gap is a hidden tab or a stall: carry on from here and do not leap
	const dt = Math.min(Math.max(0, (now - j.last) / 1000), 0.1);
	j.last = now;
	navigation.elapsedMs = performance.now() - j.startedAt;
	const arrived = advance(j, dt);
	setScroll((j.position - base) * lapPx);
	if (arrived) endJourney('arrived');
	else j.frame = requestAnimationFrame(step);
}

/**
 * Travels to the nearest occurrence of a chapter's rest point, forward or back, across the lap
 * boundary if that is closer. With `smooth` it is a journey at a manual scrolling pace, which any
 * scroll input interrupts and another call replaces. Without, it is there at once.
 */
export function goToChapter(id: ChapterId, smooth: boolean): void {
	if (lapPx <= 0) {
		document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
		return;
	}
	const here = readTravel();
	const phase = CHAPTERS.find((c) => c.id === id)!.rest / CYCLE;
	const candidates = [-1, 0, 1].map((k) => Math.floor(here) + k + phase);
	const target = candidates.reduce((best, c) => (Math.abs(c - here) < Math.abs(best - here) - 1e-6 ? c : best), candidates[2]);
	// a journey that is replaced hands its speed to the next, so a change of mind is not a stop and a start
	const velocity = journey?.velocity ?? 0;
	endJourney('replaced');
	// start from the middle lap: no journey is longer than half a lap, so none needs correcting on the way
	recentre();
	if (!smooth) {
		setScroll((target - base) * lapPx);
		return;
	}
	const now = performance.now();
	produced.fill(scrollY);
	journey = { position: here, velocity, target, startedAt: now, last: now, frame: requestAnimationFrame(step) };
	addEventListener('wheel', interruptOnWheel, listening);
	addEventListener('touchstart', interruptOnTouch, listening);
	addEventListener('touchmove', interruptOnTouch, listening);
	addEventListener('keydown', interruptOnKey, listening);
	Object.assign(navigation, { active: true, chapter: id, from: here, to: target, elapsedMs: 0, durationMs: plannedSeconds(here, velocity, target) * 1000 });
}

/** Binds the scroll spacer. Restores the saved position after a reload or a back navigation. */
export function initTravel(element: HTMLElement): () => void {
	track = element;
	history.scrollRestoration = 'manual';
	trackPx = track.offsetHeight;
	lapPx = trackPx / LAPS;
	const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
	const saved = Number(sessionStorage.getItem(KEY));
	placeTravel(entry && entry.type !== 'navigate' && saved > 0 && saved < 1 ? saved : 0);
	const scrolled = () => {
		lastScroll = performance.now();
		if (journey && movedByOther()) endJourney('interrupted');
		readTravel();
	};
	// A resize or a rotation changes the lap length in pixels: keep the same logical position.
	// A phone toolbar sliding away also fires `resize`, but the spacer is in svh and does not change.
	// Then the scroll position is already right, and setting it would cut a touch fling short.
	const resized = () => {
		const measured = track?.offsetHeight ?? 0;
		if (measured === trackPx) return;
		const keep = journey ? journey.position : current;
		trackPx = measured;
		lapPx = measured / LAPS;
		if (lapPx > 0) setScroll((keep - base) * lapPx);
		else endJourney('interrupted');
	};
	// a finger that has just lifted may have thrown the page: the pause is counted from then
	const touched = (event: TouchEvent) => {
		fingers = event.touches.length;
		lastScroll = performance.now();
	};
	// only the place within the lap is worth keeping across a reload
	const save = () => sessionStorage.setItem(KEY, String(((readTravel() % 1) + 1) % 1));
	addEventListener('scroll', scrolled, { passive: true });
	addEventListener('resize', resized);
	addEventListener('pagehide', save);
	for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) addEventListener(type, touched, { passive: true });
	return () => {
		endJourney('interrupted');
		removeEventListener('scroll', scrolled);
		removeEventListener('resize', resized);
		removeEventListener('pagehide', save);
		for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) removeEventListener(type, touched);
		fingers = 0;
		track = null;
		trackPx = 0;
		lapPx = 0;
	};
}
