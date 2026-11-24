// Owns the renderer and the frame loop. Each frame it reads scroll progress, asks the journey
// for the camera pose and scene state, then adds pointer and ambient motion on top.
import gsap from 'gsap';
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import * as THREE from 'three';
import type { DiagnosticsSnapshot, PerformanceDiagnostics } from '../debug/types.ts';
import { CHAPTERS, type ChapterId, CYCLE, chapterAt, chapterOpacity, nearestChapter, unitsOf } from '../journey/chapters.ts';
import { maintain, navigationState, readTravel, rebaseCount } from '../journey/travel.ts';
import { Atmosphere } from './atmosphere.ts';
import { Beam } from './beam.ts';
import { Environment } from './environment.ts';
import { type ExhibitSet, loadExhibits } from './exhibits.ts';
import { applyLayerExperiment, experiment, tag } from './experiment.ts';
import { Explore } from './explore.ts';
import { emptyPose, emptyState, poseAt, restUnits, sceneAt, stateAt } from './journey.ts';
import { Landmark } from './landmark.ts';
import { look } from './look.ts';
import { loadDetailTexture, stoneUniforms } from './materials.ts';
import { Passage } from './passage.ts';
import { Governor, HOLD_AFTER_CHANGE_MS, HOLD_AT_START_MS, loadOf, pixelRatioFor, type Tier, tiersFor } from './quality.ts';
import { createSky, installFog } from './sky.ts';
import { Terrain } from './terrain.ts';
import { TransitionEffect } from './transition.ts';

declare global {
	interface Window {
		__futariProbe?: {
			frames: number[];
			script: number[];
			camera: number[];
			shift: number[];
			stats: () => { calls: number; triangles: number; dpr: number; width: number; height: number; progress: number; travel: number; programs: number; geometries: number; textures: number; rebases: number; tier: number; tierName: string; msaa: number; bufferWidth: number; bufferHeight: number; governor: string; frameCost: number; slowShare: number };
		};
	}
}

export type EngineState = 'loading' | 'entering' | 'ready' | 'failed';

export interface EngineOptions {
	/** Skip the entrance and hold a deterministic frame. Used for captures. */
	still: boolean;
	reducedMotion: boolean;
	onState: (state: EngineState) => void;
	onChapter: (chapter: ChapterId | null) => void;
	/** Opacity of one chapter's copy. Called only when the value changes. */
	onCopy: (chapter: ChapterId, opacity: number) => void;
}

export class Engine {
	private readonly canvas: HTMLCanvasElement;
	private readonly options: EngineOptions;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly composer: EffectComposer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(27, 1, 0.3, 2600);
	private readonly fog = new THREE.FogExp2(look.fog.color, look.fog.density);
	private readonly lab = new THREE.Group();
	private readonly landmark = new Landmark();
	private readonly terrain = new Terrain();
	private readonly atmosphere: Atmosphere;
	private readonly beam: Beam;
	private readonly environment: Environment;
	private keyLight!: THREE.DirectionalLight;
	private hemisphere!: THREE.HemisphereLight;
	private sunDistance = 1;
	private summerSky!: THREE.Texture;
	private readonly transition: TransitionEffect;
	/** The pass that draws the transition effect. It is skipped while every strength rests at zero. */
	private transitionPass: EffectPass | null = null;
	private bloom: BloomEffect | null = null;
	private exhibits: ExhibitSet | null = null;
	private explore: Explore | null = null;
	private passage: Passage | null = null;
	private readonly timer = new THREE.Timer();
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly pointerSmooth = new THREE.Vector2();
	private pointerActive = false;
	/** A first guess at the kind of device. It picks the ladder of tiers. The governor goes by what the frames do. */
	private readonly coarse = matchMedia('(pointer: coarse)').matches;
	/** Entrance blend: 0 is the high opening view, 1 hands the camera to scroll progress. */
	private readonly intro = { camera: 0, fog: 1, snow: 0 };
	private timeline: gsap.core.Timeline | null = null;
	/** Damped continuous travel, in laps. It never wraps. The single input of the narrative. */
	private travel = 0;
	/** Travel when the page loaded. Moving away from it hurries the entrance. */
	private origin = 0;
	/** Position within the current lap, in journey units. Derived from `travel` every frame. */
	private units = 0;
	private chapter: ChapterId | null | undefined;
	private readonly copy = new Map<ChapterId, number>();
	private form = 0;
	private readonly dim = { value: 0 };
	private readonly pose = emptyPose();
	private readonly introPose = emptyPose();
	private readonly state = emptyState();
	private loaded = false;
	private frame = 0;
	private running = false;
	private disposed = false;
	private readonly tiers: Tier[];
	private readonly governor: Governor;
	/** What the buffers were last built for. A resize that changes none of it does nothing. */
	private readonly built = { width: 0, height: 0, pixelRatio: 0, samples: -1, bloom: 0 };
	private pixelRatio = 1;
	private bloomScale = 1;
	/** A resize is applied at the start of the next frame, so several events in one frame cost one rebuild. */
	private resizeDue = false;
	/** Frames drawn since the context was (re)made. The first few run every pass, so every shader is compiled. */
	private drawn = 0;
	private transitionRan = false;
	/** Work owed before the later chapters can appear without a stall, done one piece per frame. */
	private readonly chores: (() => void)[] = [];
	private probe: ((interval: number) => void) | null = null;
	/** With ?debug=performance: the overlay. Null on a normal visit, which then collects nothing. */
	private diagnostics: PerformanceDiagnostics | null = null;
	private engineState: EngineState = 'loading';
	/** With ?probe: milliseconds of script time spent in each frame callback. */
	private readonly scriptTimes: number[] = [];
	private readonly cleanup: (() => void)[] = [];
	private readonly right = new THREE.Vector3();
	private readonly bufferSize = new THREE.Vector2();
	private readonly pixel = new Uint8Array(4);

	constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
		this.canvas = canvas;
		this.options = options;
		installFog();
		const ladder = tiersFor(this.coarse);
		this.tiers = ladder.tiers;
		// a capture holds the top tier, so it is the same image on every machine
		const start = experiment.tier ?? (options.still ? ladder.tiers.length - 1 : ladder.start);
		this.governor = new Governor({ loads: ladder.tiers.map(loadOf), start, enabled: experiment.governor && !options.still });
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false });
		this.renderer.toneMapping = THREE.NoToneMapping;
		this.renderer.info.autoReset = false;
		this.renderer.shadowMap.enabled = !experiment.off.has('shadows');
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.renderer.shadowMap.autoUpdate = false;
		this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: this.samples });
		this.scene.fog = this.fog;
		this.atmosphere = new Atmosphere(this.fog, this.coarse ? 700 : 1500);
		this.beam = new Beam(this.coarse ? 260 : 520);
		// present from the first frame and never hidden, so it is compiled with the opening
		this.environment = new Environment(this.fog, this.coarse);
		this.scene.add(this.environment.root);
		this.transition = new TransitionEffect(this.fog.color);
		this.travel = this.origin = readTravel();
		this.units = unitsOf(this.travel);
		this.buildPipeline();
		this.buildLights();
		this.bind();
		this.applyTier();
		this.calibrate();
		const params = new URLSearchParams(location.search);
		if (params.get('debug') === 'performance') {
			void import('../debug/performance.ts').then(({ createDiagnostics }) => {
				if (!this.disposed) this.diagnostics = createDiagnostics({ gl: this.renderer.getContext(), snapshot: () => this.snapshot(), units: () => this.units });
			});
		}
		if (params.has('probe')) {
			const frames: number[] = [];
			const info = this.renderer.info;
			const camera: number[] = [];
			const shift: number[] = [];
			window.__futariProbe = {
				frames,
				script: this.scriptTimes,
				camera,
				shift,
				stats: () => {
					const buffer = this.renderer.getDrawingBufferSize(this.bufferSize);
					return { calls: info.render.calls, triangles: info.render.triangles, dpr: this.pixelRatio, width: this.canvas.clientWidth, height: this.canvas.clientHeight, progress: this.units, travel: this.travel, programs: info.programs?.length ?? 0, geometries: info.memory.geometries, textures: info.memory.textures, rebases: rebaseCount(), tier: this.governor.tier, tierName: this.tier.name, msaa: this.composer.multisampling, bufferWidth: buffer.x, bufferHeight: buffer.y, governor: this.governor.status, frameCost: this.governor.lastCost, slowShare: this.governor.slowShare };
				},
			};
			this.probe = (interval) => {
				frames.push(interval);
				camera.push(this.camera.position.x, this.camera.position.y, this.camera.position.z, this.travel * CYCLE);
				// where the installation is drawn. A step in this is a move of camera and scene together, not camera motion.
				shift.push(this.state.shift);
			};
		}
	}

	private get tier(): Tier {
		return this.tiers[this.governor.tier];
	}

	/** Samples of the scene buffer for the current tier. */
	private get samples(): number {
		return experiment.msaa ?? this.tier.msaa;
	}

	private report(state: EngineState): void {
		this.engineState = state;
		this.diagnostics?.mark('state', state);
		this.options.onState(state);
	}

	/** Everything the performance overlay shows that is not a per-frame sample. */
	private snapshot(): DiagnosticsSnapshot {
		const info = this.renderer.info;
		const buffer = this.renderer.getDrawingBufferSize(this.bufferSize);
		const g = this.governor;
		return {
			units: this.units,
			travel: this.travel,
			chapter: this.chapter ?? null,
			scene: sceneAt(this.units),
			engineState: this.engineState,
			tier: g.tier,
			tierName: this.tier.name,
			tierCeiling: g.ceiling,
			tierCount: this.tiers.length,
			dpr: this.pixelRatio,
			devicePixelRatio,
			msaa: this.composer.multisampling,
			bloomScale: this.bloomScale,
			transitionPass: this.transitionRan,
			cssWidth: this.built.width,
			cssHeight: this.built.height,
			bufferWidth: buffer.x,
			bufferHeight: buffer.y,
			calls: info.render.calls,
			triangles: info.render.triangles,
			programs: info.programs?.length ?? 0,
			geometries: info.memory.geometries,
			textures: info.memory.textures,
			rebases: rebaseCount(),
			budgetMs: g.budget,
			cadenceMs: g.cadence,
			capped: g.capped,
			slowShare: g.slowShare,
			frameCostMs: g.lastCost,
			governor: experiment.governor ? g.status : 'held by the URL',
			coarsePointer: this.coarse,
			reducedMotion: this.options.reducedMotion,
			navigation: navigationState(),
		};
	}

	private buildPipeline(): void {
		const off = experiment.off;
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		if (off.has('post')) return;
		if (!off.has('transition')) {
			this.transitionPass = new EffectPass(this.camera, this.transition);
			this.composer.addPass(this.transitionPass);
		}
		const bloom = new BloomEffect({ mipmapBlur: true, intensity: look.bloom.intensity, luminanceThreshold: look.bloom.threshold, luminanceSmoothing: look.bloom.smoothing, radius: look.bloom.radius });
		// The whole bloom chain, from the luminance mask down, runs at a share of the frame set by the tier.
		const setSize = bloom.setSize.bind(bloom);
		bloom.setSize = (width: number, height: number) => setSize(Math.round(width * this.bloomScale), Math.round(height * this.bloomScale));
		this.bloom = bloom;
		const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
		grain.blendMode.opacity.value = look.grain;
		const vignette = new VignetteEffect({ offset: look.vignette.offset, darkness: look.vignette.darkness });
		const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL ?? ToneMappingMode.AGX });
		this.composer.addPass(new EffectPass(this.camera, ...(off.has('bloom') ? [] : [bloom]), vignette, tone, grain));
	}

	private buildLights(): void {
		this.scene.add(createSky(this.fog));
		const pmrem = new THREE.PMREMGenerator(this.renderer);
		const envScene = new THREE.Scene();
		envScene.add(createSky(this.fog));
		this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
		this.scene.environmentIntensity = look.lights.environment;
		// the same sky in summer's colour, for the bronze and glass of the exhibit that stands in summer
		const summer = new THREE.Scene();
		summer.add(createSky(new THREE.FogExp2(look.seasons[2].sky, 0)));
		this.summerSky = pmrem.fromScene(summer, 0.02).texture;
		pmrem.dispose();
		const { hemisphere, key, rim } = look.lights;
		this.hemisphere = new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity);
		this.scene.add(this.hemisphere);
		const keyLight = new THREE.DirectionalLight(key.color, key.intensity);
		keyLight.position.set(...key.position);
		keyLight.target.position.set(0, 2.5, 0);
		keyLight.castShadow = true;
		keyLight.shadow.mapSize.set(2048, 2048);
		Object.assign(keyLight.shadow.camera, { left: -15, right: 15, top: 13, bottom: -11, near: 4, far: 60 });
		keyLight.shadow.radius = 5;
		keyLight.shadow.bias = -0.0005;
		keyLight.shadow.normalBias = 0.035;
		const rimLight = new THREE.DirectionalLight(rim.color, rim.intensity);
		rimLight.position.set(...rim.position);
		this.keyLight = keyLight;
		this.sunDistance = keyLight.position.distanceTo(keyLight.target.position);
		this.scene.add(keyLight, keyLight.target, rimLight);
	}

	private bind(): void {
		const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, target: Window | HTMLElement = window) => {
			target.addEventListener(type, fn as EventListener, { passive: true });
			this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
		};
		// A phone fires resize when its toolbar slides, a rotation fires several, and most of them change
		// nothing the renderer is built for. The next frame looks once and rebuilds only what changed.
		on('resize', () => this.requestResize());
		on('pointermove', (e) => {
			// against the canvas, which on a phone is taller than the window while the toolbar shows
			this.pointer.set((e.clientX / (this.built.width || innerWidth)) * 2 - 1, -(e.clientY / (this.built.height || innerHeight)) * 2 + 1);
			this.pointerActive = true;
		});
		on('pointerleave', () => (this.pointerActive = false), document.documentElement);
		on('pointerup', (e) => {
			if (e.pointerType !== 'mouse') this.pointerActive = false;
		});
		on('blur', () => (this.pointerActive = false));
		const visibility = () => (document.hidden ? this.stop() : this.start());
		document.addEventListener('visibilitychange', visibility);
		const lost = (e: Event) => {
			e.preventDefault();
			this.stop();
			this.diagnostics?.mark('context', 'lost');
			document.documentElement.dataset.webgl = 'lost';
		};
		const restored = () => {
			document.documentElement.dataset.webgl = 'ok';
			this.diagnostics?.mark('context', 'restored');
			// every buffer and program is gone: rebuild, and let each pass run once before any is skipped
			this.built.width = 0;
			this.drawn = 0;
			this.resize();
			this.start();
		};
		this.canvas.addEventListener('webglcontextlost', lost);
		this.canvas.addEventListener('webglcontextrestored', restored);
		this.cleanup.push(() => {
			document.removeEventListener('visibilitychange', visibility);
			this.canvas.removeEventListener('webglcontextlost', lost);
			this.canvas.removeEventListener('webglcontextrestored', restored);
		});
	}

	/**
	 * Reads how fast the display delivers frames while there is nothing to draw yet. A browser that
	 * is already pacing below 60 fps here (Safari in Low Power Mode) is a limit, not rendering load.
	 */
	private calibrate(): void {
		let last = 0;
		let best = Number.POSITIVE_INFINITY;
		let seen = 0;
		const tick = (now: number) => {
			if (this.disposed) return;
			if (last > 0) {
				best = Math.min(best, now - last);
				seen++;
			}
			last = now;
			if (seen < 12 && !this.running) requestAnimationFrame(tick);
			else if (seen >= 4) this.governor.calibrate(best);
		};
		requestAnimationFrame(tick);
	}

	async load(): Promise<void> {
		this.report('loading');
		// The later chapters load alongside the opening, so a visitor who reloads mid-journey does not wait for the landmark first.
		const later = this.loadLater();
		try {
			const [detail] = await Promise.all([loadDetailTexture('/assets/stone-detail.png'), this.landmark.load(), this.terrain.load()]);
			if (this.disposed) return;
			stoneUniforms.uDetail.value = detail;
			this.lab.add(tag(this.terrain.root, 'terrain'), tag(this.landmark.root, 'landmark'), this.atmosphere.root);
			this.scene.add(this.lab, this.beam.root, this.landmark.lights);
			applyLayerExperiment(this.scene);
			await this.compile();
			if (this.disposed) return;
			// the opening's buffers and textures reach the GPU here, before the entrance starts its clock
			this.warm(() => {});
			this.loaded = true;
			this.enter();
			this.start();
		} catch (error) {
			console.error('Opening scene failed to load', error);
			this.report('failed');
		}
		await later;
	}

	private async loadLater(): Promise<void> {
		try {
			// the banks and groves are not in the opening, so they load with the later chapters
			const exhibits = await loadExhibits(this.environment.load().then(() => this.environment.flora), this.environment.shared, this.summerSky);
			const explore = new Explore(this.fog, exhibits.base);
			await explore.load(this.coarse ? 9000 : 24000);
			if (this.disposed) return;
			explore.setForm(this.form, true);
			const passage = new Passage(exhibits.ringSegment);
			const groups = [tag(exhibits.engineering.root, 'exhibits'), tag(exhibits.kensaku.root, 'exhibits'), tag(explore.root, 'explore'), tag(passage.root, 'passage')];
			for (const group of groups) group.visible = false;
			this.scene.add(...groups, exhibits.engineering.glow, exhibits.kensaku.glow, explore.lamp);
			applyLayerExperiment(this.scene);
			this.syncFoliage();
			await this.compile();
			if (this.disposed) return;
			// From here the frame loop draws them wherever the journey stands, so a visit that begins in a
			// later chapter sees it at once. The rest reach the GPU over the next few frames.
			this.exhibits = exhibits;
			this.explore = explore;
			this.passage = passage;
			this.chores.push(() => this.warm(() => this.environment.warm(true), () => this.environment.warm(false)));
			for (const group of groups) {
				this.chores.push(() => {
					const was = group.visible;
					this.warm(() => (group.visible = true), () => (group.visible = was));
				});
			}
			if (!this.running) this.runChores();
		} catch (error) {
			// Their HTML stays readable over fog. Only the 3D of the later chapters is missing.
			console.error('Later chapters failed to load', error);
			document.documentElement.dataset.chapters = 'unavailable';
		}
	}

	/** A small buffer of the same kind the scene is drawn into, so what compiles and uploads for it is what the frames use. */
	private offscreen: THREE.WebGLRenderTarget | null = null;
	/** A view that holds the whole world, so a warm-up draws every mesh whatever its bounds. */
	private readonly everywhere = new THREE.OrthographicCamera(-4000, 4000, 4000, -4000, -8000, 8000);

	private get warmTarget(): THREE.WebGLRenderTarget {
		this.offscreen ??= new THREE.WebGLRenderTarget(32, 32, { type: THREE.HalfFloatType });
		return this.offscreen;
	}

	/**
	 * Compiles every material now in the scene, visible or not, for the buffer the frames are drawn into.
	 * Where the browser compiles in parallel the page stays responsive meanwhile.
	 */
	private compile(): Promise<unknown> {
		this.renderer.setRenderTarget(this.warmTarget);
		const ready = this.renderer.compileAsync(this.scene, this.camera);
		this.renderer.setRenderTarget(null);
		return ready;
	}

	/**
	 * Draws the scene once into the small buffer with `show` applied, so the geometry and textures it
	 * shows are uploaded now and not in the frame where the journey first reaches them.
	 */
	private warm(show: () => void, hide: () => void = () => {}): void {
		const labWas = this.lab.visible;
		// the opening is warmed by the first call, before anything else exists. Later calls leave it out.
		this.lab.visible = !this.loaded;
		this.beam.update(1, 0);
		show();
		this.renderer.setRenderTarget(this.warmTarget);
		this.renderer.render(this.scene, this.everywhere);
		this.renderer.setRenderTarget(null);
		hide();
		this.lab.visible = labWas;
	}

	/** One piece of warm-up per frame keeps each frame's share bounded. Without a running loop it is all done at once. */
	private runChores(): void {
		for (let chore = this.chores.shift(); chore; chore = this.chores.shift()) chore();
		this.offscreen?.dispose();
		this.offscreen = null;
	}

	private enter(): void {
		const d = look.entrance.duration;
		const tl = gsap.timeline({ onComplete: () => this.report('ready') });
		this.timeline = tl;
		tl.to(this.intro, { fog: 0, duration: d * 0.86, ease: 'power2.out' }, 0);
		tl.to(this.intro, { camera: 1, duration: d * 0.95, ease: 'power3.inOut' }, 0);
		tl.to(this.intro, { snow: 1, duration: d * 0.5, ease: 'none' }, d * 0.4);
		let last = 0;
		for (const b of this.landmark.blocks) {
			const at = 0.25 + b.order * 0.115;
			b.lines.visible = true;
			tl.to(b.lines.material, { opacity: 0.85, duration: 0.3, ease: 'power1.out' }, Math.max(0, at - 0.25));
			tl.to(b, { build: 1, duration: 1.15, ease: 'power3.out' }, at);
			tl.to(b.lines.material, { opacity: 0, duration: 0.5, ease: 'power1.in', onComplete: () => void (b.lines.visible = false) }, at + 0.7);
			last = Math.max(last, at + 1.15);
		}
		// the light between the characters comes on when the last stones settle: a short flare, then the resting level
		tl.to(this.landmark, { lightLevel: 1.9, duration: 0.22, ease: 'power2.out' }, last - 0.15);
		tl.to(this.landmark, { lightLevel: 1, duration: 0.9, ease: 'power2.inOut' }, last + 0.07);
		tl.call(() => this.report('entering'), [], 0);
		// arriving mid-page, for a capture, or with reduced motion: no entrance to watch
		if (this.options.still || this.options.reducedMotion || this.units > 0.02) tl.progress(1);
	}

	/** Scrolling during the entrance finishes it fast instead of cutting it, so the camera never snaps. */
	private hurryEntrance(): void {
		if (this.timeline && this.timeline.progress() < 1 && this.timeline.timeScale() === 1) this.timeline.timeScale(3.5);
	}

	setForm(index: number): void {
		this.form = index;
		this.explore?.setForm(index, this.options.reducedMotion || this.state.gather < 0.5);
	}

	/** Dims the scene behind the project dialog. */
	setDim(on: boolean): void {
		gsap.to(this.dim, { value: on ? 1 : 0, duration: this.options.reducedMotion ? 0 : 0.5, ease: 'power2.out', overwrite: true });
	}

	/** Leaf edges are resolved by multisampling where the scene buffer has samples, and by an alpha test where it has none. */
	private syncFoliage(): void {
		(this.environment as { setMultisampled?: (on: boolean) => void }).setMultisampled?.(this.composer.multisampling > 0);
	}

	/** Puts the governor's tier into effect: sampling, bloom resolution, and through `resize` the pixel ratio. */
	private applyTier(): void {
		this.composer.multisampling = this.samples;
		this.syncFoliage();
		this.bloomScale = experiment.bloom ?? this.tier.bloom;
		// at half size one fewer level reaches the same widest blur
		if (this.bloom) this.bloom.mipmapBlurPass.levels = this.bloomScale <= 0.5 ? 7 : 8;
		this.built.bloom = -1;
		this.resize();
	}

	private changeTier(): void {
		this.diagnostics?.mark('tier', `${this.tier.name} (${this.governor.tier} of ${this.tiers.length - 1}): ${this.governor.status}`);
		this.applyTier();
	}

	private requestResize(): void {
		if (this.running) this.resizeDue = true;
		else this.resize();
	}

	/**
	 * Rebuilds the buffers for the canvas as it now is, if anything they were built for has changed.
	 * It does not draw and does not touch the journey: the next frame carries on from where the damped
	 * travel is, so a rotation or a change of tier cannot make the camera jump.
	 */
	private resize(): void {
		this.resizeDue = false;
		const width = this.canvas.clientWidth || innerWidth;
		const height = this.canvas.clientHeight || innerHeight;
		const pixelRatio = experiment.dpr ?? pixelRatioFor(this.tier, width, height, devicePixelRatio);
		const samples = this.composer.multisampling;
		const b = this.built;
		if (b.width === width && b.height === height && b.pixelRatio === pixelRatio && b.samples === samples && b.bloom === this.bloomScale) return;
		Object.assign(b, { width, height, pixelRatio, samples, bloom: this.bloomScale });
		this.pixelRatio = pixelRatio;
		this.camera.aspect = width / height;
		this.renderer.setPixelRatio(pixelRatio);
		this.composer.setSize(width, height, false);
		// rebuilding the buffers costs a frame or two, which says nothing about the tier
		this.governor.hold(performance.now(), HOLD_AFTER_CHANGE_MS);
		this.diagnostics?.mark('resize', `${width}x${height} css, ratio ${pixelRatio.toFixed(2)}, ${samples} samples, ${this.tier.name}`);
	}

	start(): void {
		if (this.running || this.disposed || document.hidden) return;
		this.running = true;
		this.timer.reset();
		this.resize();
		this.governor.hold(performance.now(), this.drawn === 0 ? HOLD_AT_START_MS : HOLD_AFTER_CHANGE_MS);
		const loop = () => {
			if (!this.running) return;
			this.frame = requestAnimationFrame(loop);
			this.timer.update();
			const raw = this.timer.getDelta();
			const interval = raw * 1000;
			this.probe?.(interval);
			this.diagnostics?.frameStart(interval);
			if (this.governor.frame(interval, performance.now()) !== null) this.changeTier();
			if (this.resizeDue) this.resize();
			const chore = this.chores.shift();
			if (chore) {
				chore();
				// a warm-up frame is long by design
				this.governor.hold(performance.now(), 400);
				if (this.chores.length === 0) this.runChores();
			}
			const measure = this.governor.wantsCost;
			const began = this.probe ? performance.now() : 0;
			this.render(Math.min(raw, 0.05));
			if (this.probe) this.scriptTimes.push(performance.now() - began);
			if (measure) {
				// Reading one pixel back returns only when the GPU has finished everything queued. After that the
				// same frame is drawn again and read back again: the time between the two reads is what one whole
				// frame costs, script and GPU together, with no wait for the display in it. Asked for a few times a
				// visit, when a change of tier depends on it.
				const gl = this.renderer.getContext();
				this.renderer.setRenderTarget(null);
				gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel);
				const from = performance.now();
				this.render(0);
				gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel);
				const now = performance.now();
				if (this.governor.cost(now - from, now) !== null) this.changeTier();
			}
			this.diagnostics?.frameEnd();
		};
		this.frame = requestAnimationFrame(loop);
	}

	stop(): void {
		this.running = false;
		cancelAnimationFrame(this.frame);
	}

	private render(dt: number): void {
		if (!this.loaded) return;
		const { still, reducedMotion } = this.options;
		const calm = still || reducedMotion;
		const time = calm ? 0 : this.timer.getElapsed();
		const wide = THREE.MathUtils.smoothstep(this.camera.aspect, 0.72, 1.45);

		// 1. narrative: continuous travel, damped, is the only input. The lap position is taken after damping,
		// so crossing from one lap into the next is just more travel, never a move back through the sequence.
		maintain(performance.now());
		const goal = readTravel();
		if (Math.abs(goal - this.origin) > 0.004) this.hurryEntrance();
		// a jump of more than half a lap (the End key, a restored position) goes the short way round
		if (Math.abs(goal - this.travel) > 0.6) this.travel += Math.round(goal - this.travel);
		this.travel = calm ? goal : this.travel + (goal - this.travel) * (1 - Math.exp(-dt * 5.5));
		if (Math.abs(goal - this.travel) < 1e-6) this.travel = goal;
		const raw = unitsOf(this.travel);
		// with reduced motion there is no travel between chapters: the scene stands at a chapter's rest
		const u = reducedMotion ? restUnits(raw) : raw;
		this.units = u;
		poseAt(u, wide, this.camera.aspect, this.pose);
		stateAt(u, this.pose.position.z, reducedMotion, this.state);
		const chapter = reducedMotion ? nearestChapter(raw).id : chapterAt(raw);
		if (chapter !== this.chapter) {
			this.chapter = chapter;
			this.options.onChapter(chapter);
		}
		// the copy fades with position, not on a timer, so it reverses exactly and costs no layer changes
		for (const c of CHAPTERS) {
			const opacity = reducedMotion ? (c.id === chapter ? 1 : 0) : Math.round(chapterOpacity(c, raw) * 50) / 50;
			if (this.copy.get(c.id) !== opacity) {
				this.copy.set(c.id, opacity);
				this.options.onCopy(c.id, opacity);
			}
		}

		// 2. entrance: blends from the high opening view into whatever the narrative pose is
		const settled = this.intro.camera > 0.999;
		if (!settled) {
			const c = look.camera;
			this.introPose.position.set(...c.introPhone.position).lerp(this.right.set(...c.introDesktop.position), wide);
			this.introPose.target.set(...c.introPhone.target).lerp(this.right.set(...c.introDesktop.target), wide);
			this.pose.position.lerpVectors(this.introPose.position, this.pose.position, this.intro.camera);
			this.pose.target.lerpVectors(this.introPose.target, this.pose.target, this.intro.camera);
		}

		// 3. temporary motion, added on top and never written back
		const follow = this.pointerActive && settled && !calm;
		const k = 1 - Math.exp(-dt * 3.2);
		this.pointerSmooth.x += ((follow ? this.pointer.x : 0) - this.pointerSmooth.x) * k;
		this.pointerSmooth.y += ((follow ? this.pointer.y : 0) - this.pointerSmooth.y) * k;
		this.camera.position.copy(this.pose.position);
		this.camera.fov = this.pose.fov;
		this.camera.updateProjectionMatrix();
		this.camera.lookAt(this.pose.target);
		this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
		this.camera.position.addScaledVector(this.right, this.pointerSmooth.x * look.camera.parallax.x);
		this.camera.position.y += this.pointerSmooth.y * look.camera.parallax.y + Math.sin(time * 0.23) * 0.03;
		this.camera.lookAt(this.pose.target);
		this.camera.updateMatrixWorld();
		let ray: THREE.Ray | null = null;
		if (follow) {
			this.raycaster.setFromCamera(this.pointer, this.camera);
			ray = this.raycaster.ray;
		}

		// 4. apply the state: only groups near the camera render
		const s = this.state;
		this.lab.visible = s.lab;
		this.landmark.gate = s.gate;
		if (s.lab) {
			// the shadow map redraws only on frames where a block has moved
			this.renderer.shadowMap.needsUpdate = this.landmark.update(dt, s.gate > 0.01 ? null : ray, time) || !settled;
			this.atmosphere.reveal = this.intro.snow * s.snow;
			this.atmosphere.update(time);
		} else this.landmark.dark();
		this.beam.update(s.beam * this.landmark.lightLevel, time);
		// The season sets the sky, the light, and the haze together. What is in the air yields to the
		// opening's own snow while that is on screen.
		const season = this.environment.update(time, s.season, s.worldShift, s.worldVeil, s.lab ? 1 - 0.75 * this.intro.snow * s.snow : 1);
		this.keyLight.color.copy(season.key);
		this.keyLight.intensity = season.keyPower;
		// The sun's height changes with the season. It is at winter's whenever the opening is in view,
		// so the opening's shadow map, drawn for that light, stays true.
		this.keyLight.position.copy(this.keyLight.target.position).addScaledVector(season.sun, this.sunDistance);
		this.hemisphere.color.copy(season.hemiSky);
		this.hemisphere.groundColor.copy(season.hemiGround);
		// haze thins or thickens the air between the exhibits. The opening and the return keep their own fog.
		const density = s.fogDensity * (s.lab || s.shift !== 0 ? 1 : season.haze);
		this.fog.density = density + (look.fog.introDensity - density) * this.intro.fog;
		const pointer = follow ? this.pointer : null;
		if (this.exhibits) {
			this.exhibits.engineering.visible = s.engineering;
			this.exhibits.kensaku.visible = s.kensaku;
			if (s.engineering) {
				this.exhibits.engineering.assemble(s.engineeringBuild, s.engineeringGrowth);
				this.exhibits.engineering.update(dt, this.chapter === 'engineering' ? pointer : null, time);
			}
			if (s.kensaku) {
				this.exhibits.kensaku.assemble(s.kensakuBuild, s.kensakuFocus);
				this.exhibits.kensaku.update(dt, this.chapter === 'kensaku' ? pointer : null, time);
			}
		}
		if (this.passage) {
			this.passage.visible = s.passage;
			if (s.passage) this.passage.update(s.rings, s.ringVeil);
		}
		if (this.explore) {
			this.explore.visible = s.explore;
			if (s.explore) this.explore.update(dt, s, this.chapter === 'explore' ? ray : null, time, calm);
		}
		this.transition.set(s.frost, s.front, s.white, this.dim.value, time);
		// Frost, the white-out, and the dialog's dim all rest at zero for most of the lap, and a pass that
		// would copy the frame unchanged is left out. It runs in the first frames regardless, so its
		// shader is compiled before a transition needs it.
		this.transitionRan = this.drawn < 3 || s.frost > 0.002 || s.white > 0.001 || this.dim.value > 0.001;
		if (this.transitionPass) this.transitionPass.enabled = this.transitionRan;
		this.drawn++;
		this.renderer.info.reset();
		this.diagnostics?.renderStart();
		this.composer.render(dt);
		this.diagnostics?.renderEnd();
	}

	dispose(): void {
		this.disposed = true;
		this.stop();
		this.diagnostics?.dispose();
		this.timeline?.kill();
		gsap.killTweensOf(this.dim);
		for (const fn of this.cleanup) fn();
		this.offscreen?.dispose();
		this.landmark.dispose();
		this.terrain.dispose();
		this.atmosphere.dispose();
		this.beam.dispose();
		this.environment.dispose();
		this.passage?.dispose();
		this.exhibits?.dispose();
		this.explore?.dispose();
		stoneUniforms.uDetail.value?.dispose();
		this.scene.environment?.dispose();
		this.summerSky.dispose();
		this.composer.dispose();
		this.renderer.dispose();
	}
}
