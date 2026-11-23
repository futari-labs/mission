// Chapter ranges on the scroll journey. No rendering imports, so the page shell can use it.
export type ChapterId = 'lab' | 'engineering' | 'kensaku' | 'explore';

export interface ChapterRange {
	id: ChapterId;
	/** Span of the document that belongs to this chapter. Sets the section height. */
	from: number;
	to: number;
	/** The HTML of the chapter shows while progress is inside this range. */
	showFrom: number;
	showTo: number;
	/** Where navigation lands. */
	rest: number;
}

/** Scrollable length of the journey in viewport heights. */
export const JOURNEY_SCREENS = 8.5;

export const CHAPTERS: ChapterRange[] = [
	{ id: 'lab', from: 0, to: 0.24, showFrom: -1, showTo: 0.105, rest: 0 },
	{ id: 'engineering', from: 0.24, to: 0.475, showFrom: 0.295, showTo: 0.435, rest: 0.365 },
	{ id: 'kensaku', from: 0.475, to: 0.74, showFrom: 0.52, showTo: 0.665, rest: 0.59 },
	{ id: 'explore', from: 0.74, to: 1, showFrom: 0.835, showTo: 2, rest: 1 },
];

export function chapterAt(progress: number): ChapterId | null {
	return CHAPTERS.find((c) => progress >= c.showFrom && progress < c.showTo)?.id ?? null;
}

/** How visible a chapter's copy is at a progress value: a short fade either side of its range. */
export function chapterOpacity(c: ChapterRange, progress: number, fade = 0.012): number {
	const ramp = (edge: number) => {
		const t = Math.min(1, Math.max(0, (progress - (edge - fade)) / (2 * fade)));
		return t * t * (3 - 2 * t);
	};
	return ramp(c.showFrom) * (1 - ramp(c.showTo));
}

/** The chapter whose rest pose is used when motion is reduced. */
export function nearestChapter(progress: number): ChapterRange {
	return CHAPTERS.find((c) => progress < c.to) ?? CHAPTERS[CHAPTERS.length - 1];
}

export function scrollProgress(): number {
	const max = document.documentElement.scrollHeight - innerHeight;
	return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}

export function scrollToChapter(id: ChapterId, smooth: boolean): void {
	const chapter = CHAPTERS.find((c) => c.id === id)!;
	const max = document.documentElement.scrollHeight - innerHeight;
	scrollTo({ top: chapter.rest * max, behavior: smooth ? 'smooth' : 'auto' });
}
