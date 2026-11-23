import { useEffect, useRef, useState } from 'react';
import { site } from './content/site.ts';
import type { Engine, EngineState } from './scene/Engine.ts';

type Phase = EngineState | 'unavailable';

declare global {
	interface Window {
		__futari?: { state: Phase; skipEntrance: () => void };
	}
}

export function App() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const [phase, setPhase] = useState<Phase>('loading');

	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (params.has('still')) document.documentElement.dataset.still = '';
		let engine: Engine | null = null;
		let cancelled = false;
		const report = (state: Phase) => {
			if (cancelled) return;
			setPhase(state);
			document.documentElement.dataset.webgl = state === 'unavailable' || state === 'failed' ? 'unavailable' : 'ok';
			window.__futari = { state, skipEntrance: () => engine?.skipEntrance() };
		};
		// the scene code loads after first paint so the text never waits for it
		import('./scene/Engine.ts')
			.then(({ Engine }) => {
				if (cancelled || !canvas.current) return;
				engine = new Engine(canvas.current, { still: params.has('still'), reducedMotion, onState: report });
				return engine.load();
			})
			.catch((error) => {
				console.error('WebGL is unavailable', error);
				report('unavailable');
			});
		return () => {
			cancelled = true;
			engine?.dispose();
		};
	}, []);

	return (
		<div className="site" data-phase={phase}>
			<div className="scene" aria-hidden="true">
				<canvas ref={canvas} />
			</div>
			<header className="mast">
				<a className="wordmark" href="/" aria-label={`${site.wordmark}, home`}>
					<svg viewBox="0 0 34 14" aria-hidden="true">
						<path d="M0 0h14.6v4.4H9.2L6.6 14H1.9l2.6-9.6H0z" />
						<path d="M34 0H19.4v4.4h5.4l2.6 9.6h4.7l-2.6-9.6H34z" />
						<rect className="wordmark-seam" x="16.3" y="0" width="1.4" height="4.4" />
					</svg>
					<span>{site.wordmark}</span>
				</a>
				<p className="label identity">{`// ${site.identity}`}</p>
			</header>
			<main>
				<section className="intro" aria-labelledby="intro-heading">
					<p className="label intro-tag" aria-hidden="true">
						{'////// Lab'}
					</p>
					<h1 id="intro-heading">{site.intro}</h1>
					<p className="supporting">{site.supporting}</p>
				</section>
			</main>
			<p className="label hint">{site.scrollHint}</p>
			<div className="loader label" role="status" aria-live="polite">
				<span className="loader-glyphs" aria-hidden="true" />
				<span className="visually-hidden">{phase === 'loading' ? 'Loading the scene' : ''}</span>
			</div>
		</div>
	);
}
