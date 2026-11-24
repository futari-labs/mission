import { type CSSProperties, type FocusEvent, type MouseEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mark } from './content/mark.ts';
import { site } from './content/site.ts';
import { CHAPTERS, type ChapterId, chapterAt, JOURNEY_SCREENS, scrollProgress, scrollToChapter } from './journey/chapters.ts';
import type { Engine, EngineState } from './scene/Engine.ts';

type Phase = EngineState | 'unavailable';
type ProjectId = (typeof site.projects)[number]['id'];

declare global {
	interface Window {
		__futari?: { state: Phase; chapter: ChapterId | null };
	}
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** The last section also holds the final screen, so the journey ends with the page. */
const span = (id: ChapterId): CSSProperties => {
	const c = CHAPTERS.find((x) => x.id === id)!;
	// svh, not dvh: a phone toolbar that hides while scrolling must not change the length of the journey
	return { height: `${(c.to - c.from) * JOURNEY_SCREENS * 100 + (id === 'explore' ? 100 : 0)}svh` };
};

export function App() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const engine = useRef<Engine | null>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const [phase, setPhase] = useState<Phase>('loading');
	// The active chapter changes while scrolling, so it is written straight to the DOM.
	// React only reads it when something else causes a render.
	const root = useRef<HTMLDivElement>(null);
	const chapterRef = useRef<ChapterId | null>(chapterAt(scrollProgress()));
	const chapter = chapterRef.current;
	const setChapter = useCallback((next: ChapterId | null) => {
		chapterRef.current = next;
		if (!root.current) return;
		for (const panel of root.current.querySelectorAll<HTMLElement>('.panel')) panel.dataset.active = String(panel.dataset.chapter === next);
		for (const link of root.current.querySelectorAll<HTMLElement>('.chapters a')) {
			const on = link.dataset.chapter === next || (link.dataset.chapter === 'engineering' && next === 'kensaku');
			if (on) link.setAttribute('aria-current', 'true');
			else link.removeAttribute('aria-current');
		}
	}, []);
	const [open, setOpen] = useState<ProjectId | null>(null);
	const [form, setForm] = useState(0);

	// A reload or a back navigation returns to the same point of the journey. The browser's own
	// restoration runs before these tall sections exist, so the position is kept here instead.
	useLayoutEffect(() => {
		history.scrollRestoration = 'manual';
		const key = 'futari.progress';
		const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
		const saved = Number(sessionStorage.getItem(key));
		if (entry && entry.type !== 'navigate' && saved > 0) {
			scrollTo(0, saved * (document.documentElement.scrollHeight - innerHeight));
			setChapter(chapterAt(scrollProgress()));
		}
		const save = () => sessionStorage.setItem(key, String(scrollProgress()));
		addEventListener('pagehide', save);
		// A resize or a rotation changes the page length. Keep the visitor at the same point of the journey.
		let last = scrollProgress();
		let size = [innerWidth, innerHeight];
		const track = () => void (last = scrollProgress());
		const resized = () => {
			const real = innerWidth !== size[0] || Math.abs(innerHeight - size[1]) > 120;
			size = [innerWidth, innerHeight];
			if (real) scrollTo(0, last * (document.documentElement.scrollHeight - innerHeight));
		};
		addEventListener('scroll', track, { passive: true });
		addEventListener('resize', resized);
		return () => {
			removeEventListener('pagehide', save);
			removeEventListener('scroll', track);
			removeEventListener('resize', resized);
		};
	}, [setChapter]);

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('still')) document.documentElement.dataset.still = '';
		let cancelled = false;
		const state = { phase: 'loading' as Phase, chapter: chapterAt(scrollProgress()) };
		const publish = () => void (window.__futari = { state: state.phase, chapter: state.chapter });
		const report = (next: Phase) => {
			if (cancelled) return;
			state.phase = next;
			setPhase(next);
			document.documentElement.dataset.webgl = next === 'unavailable' || next === 'failed' ? 'unavailable' : 'ok';
			publish();
		};
		// Without the scene, chapters still follow the scroll position.
		const fallbackChapter = () => {
			if (engine.current) return;
			state.chapter = chapterAt(scrollProgress());
			setChapter(state.chapter);
			publish();
		};
		addEventListener('scroll', fallbackChapter, { passive: true });
		// the scene code loads after first paint so the text never waits for it
		import('./scene/Engine.ts')
			.then(({ Engine }) => {
				if (cancelled || !canvas.current) return;
				engine.current = new Engine(canvas.current, {
					still: params.has('still'),
					reducedMotion: reducedMotion(),
					onState: report,
					onChapter: (next) => {
						state.chapter = next;
						setChapter(next);
						publish();
					},
					onCopy: (id, opacity) => {
						const panel = root.current?.querySelector<HTMLElement>(`.panel[data-chapter="${id}"]`);
						if (panel) panel.style.opacity = String(opacity);
					},
				});
				return engine.current.load();
			})
			.catch((error) => {
				console.error('WebGL is unavailable', error);
				engine.current = null;
				report('unavailable');
			});
		return () => {
			cancelled = true;
			removeEventListener('scroll', fallbackChapter);
			engine.current?.dispose();
			engine.current = null;
		};
	}, [setChapter]);

	const go = useCallback((id: ChapterId) => (event: MouseEvent) => {
		event.preventDefault();
		scrollToChapter(id, !reducedMotion());
	}, []);

	// Keyboard focus that lands in another chapter brings that chapter into view.
	const reveal = useCallback((id: ChapterId) => (event: FocusEvent) => {
		if (event.target instanceof HTMLElement && event.target.matches(':focus-visible') && chapterAt(scrollProgress()) !== id) scrollToChapter(id, false);
	}, []);

	const show = (id: ProjectId) => setOpen(id);
	// the dialog opens after its content has rendered, so focus lands on the close button
	useEffect(() => {
		if (!open || dialog.current?.open) return;
		dialog.current?.showModal();
		document.documentElement.dataset.dialog = 'open';
		engine.current?.setDim(true);
	}, [open]);
	const closed = () => {
		setOpen(null);
		delete document.documentElement.dataset.dialog;
		engine.current?.setDim(false);
	};
	const select = (index: number) => {
		const next = (index + site.explore.links.length) % site.explore.links.length;
		setForm(next);
		engine.current?.setForm(next);
	};
	const project = site.projects.find((p) => p.id === open);

	return (
		<div className="site" data-phase={phase} ref={root}>
			<div className="scene" aria-hidden="true">
				<canvas ref={canvas} />
			</div>
			<header className="mast">
				<div className="brand">
				<a className="wordmark" href="#lab" onClick={go('lab')} aria-label={`${site.wordmark}, back to the start`}>
					<svg viewBox={mark.viewBox} aria-hidden="true">
						<path d={mark.path} />
					</svg>
					<span>{site.wordmark}</span>
				</a>
				<p className="label identity">{`// ${site.identity}`}</p>
				</div>
				<nav className="chapters label" aria-label="Chapters">
					{site.nav.map((item) => {
						const current = item.chapter === chapter || (item.chapter === 'engineering' && chapter === 'kensaku');
						return (
							<a key={item.chapter} href={`#${item.chapter}`} data-chapter={item.chapter} onClick={go(item.chapter)} aria-current={current ? 'true' : undefined}>
								{item.label}
							</a>
						);
					})}
				</nav>
			</header>
			<main>
				<section id="lab" className="chapter" style={span('lab')} aria-labelledby="intro-heading" onFocus={reveal('lab')}>
					<div className="panel" data-chapter="lab" data-active={chapter === 'lab'}>
						<div className="intro">
							<p className="label intro-tag" aria-hidden="true">
								{'////// Lab'}
							</p>
							<h1 id="intro-heading">{site.intro}</h1>
							<p className="supporting">{site.supporting}</p>
						</div>
						<p className="label hint">{site.scrollHint}</p>
					</div>
				</section>
				<section aria-labelledby="work-heading">
					<h2 id="work-heading" className="visually-hidden">
						{site.workHeading}
					</h2>
					{site.projects.map((p) => (
						<article key={p.id} id={p.id} className="chapter" style={span(p.id)} aria-labelledby={`${p.id}-title`} onFocus={reveal(p.id)}>
							<div className={`panel exhibit exhibit-${p.id}`} data-chapter={p.id} data-active={chapter === p.id}>
								<div className="exhibit-head">
									<p className="label">{`${site.workHeading} / ${p.number}`}</p>
									<h3 id={`${p.id}-title`}>{p.title}</h3>
									<p className="label category">{p.category}</p>
								</div>
								<div className="exhibit-body">
									<p className="line">{p.line}</p>
									<div className="actions">
										<button type="button" className="bracket" onClick={() => show(p.id)} aria-haspopup="dialog">
											{site.details}
											<span className="visually-hidden">{`: ${p.title}`}</span>
										</button>
										<a className="arrow" href={p.repository} target="_blank" rel="noopener noreferrer">
											{site.repository}
											<span className="visually-hidden">{`: ${p.title} on GitHub`}</span>
										</a>
									</div>
								</div>
							</div>
						</article>
					))}
				</section>
				<section id="explore" className="chapter" style={span('explore')} aria-labelledby="explore-heading" onFocus={reveal('explore')}>
					<div className="panel explore" data-chapter="explore" data-active={chapter === 'explore'}>
						<div className="explore-head">
							<p className="label">{'////// Links'}</p>
							<h2 id="explore-heading">{site.explore.heading}</h2>
							<p className="line">{site.explore.line}</p>
						</div>
						<button type="button" className="step step-previous" onClick={() => select(form - 1)} aria-label={site.explore.previous}>
							<span aria-hidden="true" />
						</button>
						<button type="button" className="step step-next" onClick={() => select(form + 1)} aria-label={site.explore.next}>
							<span aria-hidden="true" />
						</button>
						<ul className="destinations">
							{site.explore.links.map((link, i) => (
								<li key={link.href}>
									<a href={link.href} target="_blank" rel="noopener noreferrer" aria-current={i === form ? 'true' : undefined} onFocus={() => select(i)} onPointerEnter={(e) => e.pointerType === 'mouse' && select(i)}>
										<span className="destination-label">{link.label}</span>
										<span className="label destination-note">{link.note}</span>
									</a>
								</li>
							))}
						</ul>
						<p className="label colophon">{site.footer}</p>
					</div>
				</section>
			</main>
			<dialog ref={dialog} className="details" aria-labelledby="details-title" onClose={closed}>
				{project && (
					<article>
						<form method="dialog">
							<button type="submit" className="bracket close">
								{site.close}
							</button>
						</form>
						<p className="label">{`${site.workHeading} / ${project.number}`}</p>
						<h2 id="details-title">{project.title}</h2>
						<p className="label category">{project.category}</p>
						{project.detail.map((text) => (
							<p key={text} className="detail-text">
								{text}
							</p>
						))}
						<dl>
							{project.facts.map(([term, value]) => (
								<div key={term}>
									<dt className="label">{term}</dt>
									<dd>{value}</dd>
								</div>
							))}
						</dl>
						<a className="arrow" href={project.repository} target="_blank" rel="noopener noreferrer">
							{project.repository.replace('https://', '')}
						</a>
					</article>
				)}
			</dialog>
			<div className="loader label" role="status" aria-live="polite">
				<span className="loader-glyphs" aria-hidden="true" />
				<span className="visually-hidden">{phase === 'loading' ? 'Loading the scene' : ''}</span>
			</div>
		</div>
	);
}
