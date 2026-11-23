// Owns the renderer, the frame loop, and the opening scene. One instance per page.
import gsap from 'gsap';
import { BloomEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect, BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { Atmosphere } from './atmosphere.ts';
import { Bridge } from './bridge.ts';
import { look, type Vec3Tuple } from './look.ts';
import { loadDetailTexture, stoneUniforms } from './materials.ts';
import { createSky, installFog } from './sky.ts';
import { Terrain } from './terrain.ts';

export type EngineState = 'loading' | 'entering' | 'ready' | 'failed';

export interface EngineOptions {
	/** Skip the entrance and hold a deterministic frame. Used for captures and reduced motion. */
	still: boolean;
	reducedMotion: boolean;
	onState: (state: EngineState) => void;
}

interface Shot {
	position: Vec3Tuple;
	target: Vec3Tuple;
	fov: number;
}

const mix = (a: Shot, b: Shot, t: number): Shot => ({
	position: a.position.map((v, i) => v + (b.position[i] - v) * t) as unknown as Vec3Tuple,
	target: a.target.map((v, i) => v + (b.target[i] - v) * t) as unknown as Vec3Tuple,
	fov: a.fov + (b.fov - a.fov) * t,
});

export class Engine {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly composer: EffectComposer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(27, 1, 0.3, 1200);
	private readonly fog = new THREE.FogExp2(look.fog.color, look.fog.density);
	private readonly bridge = new Bridge();
	private readonly terrain = new Terrain();
	private readonly atmosphere: Atmosphere;
	private readonly timer = new THREE.Timer();
	private loaded = false;
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly pointerSmooth = new THREE.Vector2();
	private pointerActive = false;
	private readonly intro = { camera: 0 };
	private timeline: gsap.core.Timeline | null = null;
	private frame = 0;
	private running = false;
	private disposed = false;
	private slowFrames = 0;
	private pixelRatio: number;
	private readonly cleanup: (() => void)[] = [];
	private readonly target = new THREE.Vector3();
	private readonly right = new THREE.Vector3();

	private readonly canvas: HTMLCanvasElement;
	private readonly options: EngineOptions;

	constructor(canvas: HTMLCanvasElement, options: EngineOptions) {
		this.canvas = canvas;
		this.options = options;
		installFog();
		const coarse = matchMedia('(pointer: coarse)').matches;
		this.pixelRatio = Math.min(devicePixelRatio, coarse ? 1.75 : 1.5);
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false });
		this.renderer.setPixelRatio(this.pixelRatio);
		this.renderer.toneMapping = THREE.NoToneMapping;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: coarse ? 2 : 4 });
		this.scene.fog = this.fog;
		this.atmosphere = new Atmosphere(this.fog, coarse ? 700 : 1500);
		this.buildPipeline();
		this.buildLights();
		this.bind();
		this.resize();
	}

	private buildPipeline(): void {
		this.composer.addPass(new RenderPass(this.scene, this.camera));
		const bloom = new BloomEffect({ mipmapBlur: true, intensity: look.bloom.intensity, luminanceThreshold: look.bloom.threshold, luminanceSmoothing: look.bloom.smoothing, radius: look.bloom.radius });
		const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
		grain.blendMode.opacity.value = look.grain;
		const vignette = new VignetteEffect({ offset: look.vignette.offset, darkness: look.vignette.darkness });
		const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL ?? ToneMappingMode.AGX });
		this.composer.addPass(new EffectPass(this.camera, bloom, vignette, tone, grain));
	}

	private buildLights(): void {
		const sky = createSky(this.fog);
		this.scene.add(sky);
		const pmrem = new THREE.PMREMGenerator(this.renderer);
		const envScene = new THREE.Scene();
		envScene.add(createSky(this.fog));
		this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
		this.scene.environmentIntensity = look.lights.environment;
		pmrem.dispose();
		const { hemisphere, key, rim } = look.lights;
		this.scene.add(new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity));
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
		this.scene.add(keyLight, keyLight.target, rimLight);
	}

	private bind(): void {
		const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, target: Window | HTMLElement = window) => {
			target.addEventListener(type, fn as EventListener, { passive: true });
			this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
		};
		on('resize', () => this.resize());
		on('pointermove', (e) => {
			this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
			this.pointerActive = true;
		});
		on('pointerleave', () => (this.pointerActive = false), document.documentElement);
		on('pointerup', (e) => {
			if (e.pointerType !== 'mouse') this.pointerActive = false;
		});
		on('blur', () => (this.pointerActive = false));
		// any intent to move on ends the entrance at once
		for (const type of ['wheel', 'touchmove', 'keydown'] as const) on(type, () => this.skipEntrance());
		const visibility = () => (document.hidden ? this.stop() : this.start());
		document.addEventListener('visibilitychange', visibility);
		this.cleanup.push(() => document.removeEventListener('visibilitychange', visibility));
		const lost = (e: Event) => {
			e.preventDefault();
			this.stop();
			document.documentElement.dataset.webgl = 'lost';
		};
		const restored = () => {
			document.documentElement.dataset.webgl = 'ok';
			this.resize();
			this.start();
		};
		this.canvas.addEventListener('webglcontextlost', lost);
		this.canvas.addEventListener('webglcontextrestored', restored);
		this.cleanup.push(() => {
			this.canvas.removeEventListener('webglcontextlost', lost);
			this.canvas.removeEventListener('webglcontextrestored', restored);
		});
	}

	async load(): Promise<void> {
		this.options.onState('loading');
		try {
			const [detail] = await Promise.all([loadDetailTexture('/assets/stone-detail.png'), this.bridge.load(), this.terrain.load()]);
			if (this.disposed) return;
			stoneUniforms.uDetail.value = detail;
			this.scene.add(this.terrain.root, this.bridge.root, this.atmosphere.root);
			this.loaded = true;
			this.renderer.compile(this.scene, this.camera);
			this.enter();
			this.start();
		} catch (error) {
			console.error('Opening scene failed to load', error);
			this.options.onState('failed');
		}
	}

	private enter(): void {
		const d = look.entrance.duration;
		const tl = gsap.timeline({ onComplete: () => this.options.onState('ready') });
		this.timeline = tl;
		this.fog.density = look.fog.introDensity;
		this.atmosphere.reveal = 0;
		tl.to(this.fog, { density: look.fog.density, duration: d * 0.86, ease: 'power2.out' }, 0);
		tl.to(this.intro, { camera: 1, duration: d * 0.95, ease: 'power3.inOut' }, 0);
		tl.to(this.atmosphere, { reveal: 1, duration: d * 0.5, ease: 'none' }, d * 0.4);
		let last = 0;
		for (const b of this.bridge.blocks) {
			const at = 0.25 + b.order * 0.115;
			b.lines.visible = true;
			tl.to(b.lines.material, { opacity: 0.85, duration: 0.3, ease: 'power1.out' }, Math.max(0, at - 0.25));
			tl.to(b, { build: 1, duration: 1.15, ease: 'power3.out' }, at);
			tl.to(b.lines.material, { opacity: 0, duration: 0.5, ease: 'power1.in', onComplete: () => void (b.lines.visible = false) }, at + 0.7);
			last = Math.max(last, at + 1.15);
		}
		// the seam lights when the last tips settle: a short flare, then the resting level
		tl.to(this.bridge, { seamLevel: 1.9, duration: 0.22, ease: 'power2.out' }, last - 0.15);
		tl.to(this.bridge, { seamLevel: 1, duration: 0.9, ease: 'power2.inOut' }, last + 0.07);
		tl.call(() => this.options.onState('entering'), [], 0);
		if (this.options.still || this.options.reducedMotion) tl.progress(1);
	}

	skipEntrance(): void {
		if (this.timeline && this.timeline.progress() < 1) this.timeline.progress(1);
	}

	private shot(): Shot {
		const aspect = this.camera.aspect;
		const t = THREE.MathUtils.smoothstep(aspect, 0.72, 1.45);
		const c = look.camera;
		const hero = mix(c.phone, c.desktop, t);
		// between the two framings, pull back so the whole bridge stays in view
		const wide = Math.max(1, 1.6 / Math.max(aspect, 0.72)) ** (0.55 * t);
		const fitted: Shot = { ...hero, position: hero.position.map((v, i) => hero.target[i] + (v - hero.target[i]) * wide) as unknown as Vec3Tuple };
		return mix(mix(c.introPhone, c.introDesktop, t), fitted, this.intro.camera);
	}

	private resize(): void {
		const w = this.canvas.clientWidth || innerWidth;
		const h = this.canvas.clientHeight || innerHeight;
		this.camera.aspect = w / h;
		this.renderer.setPixelRatio(this.pixelRatio);
		this.composer.setSize(w, h, false);
		this.render(0);
	}

	start(): void {
		if (this.running || this.disposed || document.hidden) return;
		this.running = true;
		this.timer.reset();
		const loop = () => {
			if (!this.running) return;
			this.frame = requestAnimationFrame(loop);
			this.timer.update();
			const dt = Math.min(this.timer.getDelta(), 0.05);
			this.govern(dt);
			this.render(dt);
		};
		this.frame = requestAnimationFrame(loop);
	}

	stop(): void {
		this.running = false;
		cancelAnimationFrame(this.frame);
	}

	/** Lowers the pixel ratio when frames stay slow. It never raises it again during a visit. */
	private govern(dt: number): void {
		this.slowFrames = dt > 0.024 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
		if (this.slowFrames > 90 && this.pixelRatio > 1) {
			this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
			this.slowFrames = 0;
			this.resize();
		}
	}

	private render(dt: number): void {
		if (!this.loaded) return;
		const calm = this.options.still || this.options.reducedMotion;
		const time = calm ? 0 : this.timer.getElapsed();
		const k = 1 - Math.exp(-dt * 3.2);
		const settled = this.intro.camera > 0.999;
		this.pointerSmooth.x += ((this.pointerActive && settled && !calm ? this.pointer.x : 0) - this.pointerSmooth.x) * k;
		this.pointerSmooth.y += ((this.pointerActive && settled && !calm ? this.pointer.y : 0) - this.pointerSmooth.y) * k;
		const shot = this.shot();
		this.target.set(...shot.target);
		this.camera.position.set(...shot.position);
		this.camera.fov = shot.fov;
		this.camera.updateProjectionMatrix();
		this.camera.lookAt(this.target);
		this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
		this.camera.position.addScaledVector(this.right, this.pointerSmooth.x * look.camera.parallax.x);
		this.camera.position.y += this.pointerSmooth.y * look.camera.parallax.y + Math.sin(time * 0.23) * 0.03;
		this.camera.lookAt(this.target);
		this.camera.updateMatrixWorld();
		let ray: THREE.Ray | null = null;
		if (this.pointerActive && settled && !calm) {
			this.raycaster.setFromCamera(this.pointer, this.camera);
			ray = this.raycaster.ray;
		}
		this.bridge.update(dt, ray, time);
		this.atmosphere.update(time);
		this.composer.render(dt);
	}

	dispose(): void {
		this.disposed = true;
		this.stop();
		this.timeline?.kill();
		for (const fn of this.cleanup) fn();
		this.bridge.dispose();
		this.terrain.dispose();
		this.atmosphere.dispose();
		stoneUniforms.uDetail.value?.dispose();
		this.scene.environment?.dispose();
		this.composer.dispose();
		this.renderer.dispose();
	}
}
