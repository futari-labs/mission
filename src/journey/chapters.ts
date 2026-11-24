// Chapter ranges on one lap of the journey. No rendering imports, so the page shell can use it.
//
// Positions are in journey units. One lap is CYCLE units long: the four chapters and their
// transitions take 0 to 0.98, and the return to the opening takes 0.98 to CYCLE. Position CYCLE
// is position 0 of the next lap.
export type ChapterId = 'lab' | 'engineering' | 'kensaku' | 'explore';

export interface ChapterRange {
	id: ChapterId;
	/** The HTML of the chapter shows while the position is inside this range. May start before 0: it wraps. */
	showFrom: number;
	showTo: number;
	/** Where navigation lands. */
	rest: number;
}

/** Length of one lap in journey units. */
export const CYCLE = 1.16;
/** Where the return to the opening begins. */
export const RETURN_FROM = 0.98;
/** Viewport heights of scrolling per journey unit. One lap is CYCLE times this. */
export const SCREENS_PER_UNIT = 8.5;

export const CHAPTERS: ChapterRange[] = [
	{ id: 'lab', showFrom: -0.022, showTo: 0.105, rest: 0 },
	{ id: 'engineering', showFrom: 0.295, showTo: 0.435, rest: 0.365 },
	{ id: 'kensaku', showFrom: 0.52, showTo: 0.665, rest: 0.59 },
	{ id: 'explore', showFrom: 0.835, showTo: 0.972, rest: 0.9 },
];

/** Position within the lap for any continuous travel value, in journey units. */
export function unitsOf(travel: number): number {
	return (((travel % 1) + 1) % 1) * CYCLE;
}

const inside = (c: ChapterRange, u: number) => (u >= c.showFrom && u < c.showTo) || (u - CYCLE >= c.showFrom && u - CYCLE < c.showTo);

export function chapterAt(u: number): ChapterId | null {
	return CHAPTERS.find((c) => inside(c, u))?.id ?? null;
}

/** How visible a chapter's copy is at a position: a short fade either side of its range. */
export function chapterOpacity(c: ChapterRange, u: number, fade = 0.012): number {
	const at = (p: number) => {
		const ramp = (edge: number) => {
			const t = Math.min(1, Math.max(0, (p - (edge - fade)) / (2 * fade)));
			return t * t * (3 - 2 * t);
		};
		return ramp(c.showFrom) * (1 - ramp(c.showTo));
	};
	return Math.max(at(u), at(u - CYCLE));
}

/** The chapter whose rest pose is used when motion is reduced. Every position belongs to one. */
export function nearestChapter(u: number): ChapterRange {
	const edges: [number, ChapterId][] = [[0.24, 'lab'], [0.475, 'engineering'], [0.74, 'kensaku'], [(RETURN_FROM + CYCLE) / 2, 'explore']];
	const id = edges.find(([to]) => u < to)?.[1] ?? 'lab';
	return CHAPTERS.find((c) => c.id === id)!;
}
