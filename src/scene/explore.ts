// The final installation: particles that stream in from the Kensaku lens along the beam,
// gather into one of three forms on a stone base, and move away from the pointer.
import gsap from 'gsap';
import * as THREE from 'three';
import { STATION } from './journey.ts';
import { look } from './look.ts';

export const FORM_COUNT = 3;

export class Explore {
	readonly root = new THREE.Group();
	private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
	private readonly uniforms = {
		uTime: { value: 0 },
		uFrom: { value: new THREE.Vector3(1, 0, 0) },
		uTo: { value: new THREE.Vector3(1, 0, 0) },
		uMorph: { value: 1 },
		uGather: { value: 0 },
		uShow: { value: 0 },
		uSpin: { value: 0 },
		uCenter: { value: STATION.explore.clone() },
		uStart: { value: STATION.kensaku.clone().add(new THREE.Vector3(0, 0, 0.6)) },
		uRayOrigin: { value: new THREE.Vector3() },
		uRayDir: { value: new THREE.Vector3(0, 0, -1) },
		uPush: { value: 0 },
		uSize: { value: look.particles.size },
		uColor: { value: new THREE.Color(look.particles.color) },
		uHot: { value: new THREE.Color(look.particles.hot) },
		uFogColor: { value: new THREE.Color() },
		uFogDensity: { value: 0 },
	};
	private form = 0;
	private readonly ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
	private readonly groove: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
	/** Kept in the scene at all times so the light count is constant. See Bridge.lights. */
	readonly lamp: THREE.PointLight;
	private readonly stage = new THREE.Group();
	private tween: gsap.core.Tween | null = null;

	constructor(fog: THREE.FogExp2, base: THREE.Mesh) {
		this.uniforms.uFogColor.value = fog.color;
		const c = STATION.explore;
		base.position.add(new THREE.Vector3(c.x, c.y - 2.75, c.z));
		const bright = new THREE.Color(look.seam.color);
		this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.03, 8, 96), new THREE.MeshBasicMaterial({ color: bright.clone().multiplyScalar(3) }));
		this.ring.rotation.x = Math.PI / 2;
		this.ring.position.set(c.x, c.y + 2.55, c.z);
		this.groove = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.022, 6, 96), new THREE.MeshBasicMaterial({ color: bright.clone().multiplyScalar(2.2) }));
		this.groove.rotation.x = Math.PI / 2;
		this.groove.position.set(c.x, c.y - 2.75, c.z);
		this.lamp = new THREE.PointLight(look.seam.color, 24, 14, 2);
		this.lamp.position.set(c.x, c.y + 3.1, c.z);
		this.stage.add(base, this.ring, this.groove);
		this.root.add(this.stage);
	}

	async load(count: number): Promise<void> {
		const response = await fetch('/assets/particles.bin');
		if (!response.ok) throw new Error(`particles.bin: ${response.status}`);
		const all = new Int16Array(await response.arrayBuffer());
		const total = all.length / 9;
		const n = Math.min(count, total);
		const geometry = new THREE.BufferGeometry();
		const names = ['aFormA', 'aFormB', 'aFormC'];
		for (const [k, name] of names.entries()) geometry.setAttribute(name, new THREE.BufferAttribute(all.slice(k * total * 3, k * total * 3 + n * 3), 3, true));
		const seed = new Float32Array(n);
		for (let i = 0; i < n; i++) seed[i] = Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
		geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
		const material = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			fog: false,
			vertexShader: /* glsl */ `
				uniform float uTime, uMorph, uGather, uShow, uSpin, uPush, uSize, uFogDensity;
				uniform vec3 uFrom, uTo, uCenter, uStart, uRayOrigin, uRayDir;
				attribute vec3 aFormA, aFormB, aFormC;
				attribute float aSeed;
				varying float vHeat;
				varying float vFog;
				varying float vShade;
				vec3 form(vec3 w) { return (aFormA * w.x + aFormB * w.y + aFormC * w.z) * 3.0; }
				void main() {
					float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.7 - aSeed * 0.7, 0.0, 1.0));
					vec3 local = mix(form(uFrom), form(uTo), m);
					float burst = sin(m * 3.14159);
					local += burst * 0.85 * vec3(sin(aSeed * 91.0 + uTime * 3.1), cos(aSeed * 57.0 + uTime * 2.3) + 0.4, sin(aSeed * 33.0 - uTime * 2.7));
					float cs = cos(uSpin), sn = sin(uSpin);
					local = vec3(local.x * cs + local.z * sn, local.y, local.z * cs - local.x * sn);
					vShade = 0.5 + 0.5 * dot(normalize(local + vec3(0.0, 0.4, 0.0)), normalize(vec3(-0.5, 0.7, 0.5)));
					vec3 world = uCenter + local;
					// before gathering, each particle rides the beam from the lens
					float g = smoothstep(0.0, 1.0, clamp(uGather * 1.9 - aSeed * 0.9, 0.0, 1.0));
					float reach = clamp(uGather * 2.4 + 0.12, 0.0, 1.0);
					// three unrelated random values per particle, so the stream never lines up into curves
					float h1 = fract(sin(aSeed * 913.45) * 47453.5);
					float h2 = fract(sin(aSeed * 177.7) * 9631.3);
					float h3 = fract(sin(aSeed * 431.9) * 28411.7);
					float along = fract(h1 + uTime * 0.03) * reach;
					float angle = h2 * 6.2832 + along * 9.0 + uTime * 0.3;
					float radius = (0.04 + 0.55 * h3 * h3) * (0.35 + along);
					vec3 riding = mix(uStart, uCenter, along) + vec3(cos(angle), sin(angle), 0.0) * radius;
					world = mix(riding, world, g);
					vec3 rel = world - uRayOrigin;
					vec3 away = rel - uRayDir * dot(rel, uRayDir);
					float near = smoothstep(1.25, 0.0, length(away));
					world += normalize(away + vec3(1e-4)) * near * uPush * 0.85;
					vHeat = clamp(burst * 0.9 + near * uPush * 0.8 + (1.0 - g) * 0.55, 0.0, 1.0);
					vec4 mv = viewMatrix * vec4(world, 1.0);
					float d = -mv.z;
					gl_Position = projectionMatrix * mv;
					gl_PointSize = clamp(uSize * (0.7 + 0.6 * fract(aSeed * 17.0)) * projectionMatrix[1][1] * 450.0 / d, 1.2, 9.0) * step(0.001, uShow) * step(1.6, d);
					vFog = 1.0 - exp(-pow(uFogDensity * d * 0.5, 1.55));
				}`,
			fragmentShader: /* glsl */ `
				uniform vec3 uColor, uHot, uFogColor;
				uniform float uShow;
				varying float vHeat;
				varying float vFog;
				varying float vShade;
				void main() {
					vec2 c = gl_PointCoord * 2.0 - 1.0;
					float r2 = dot(c, c);
					if (r2 > 1.0 || uShow < 0.01) discard;
					vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
					float lit = 0.3 + 0.8 * max(dot(n, normalize(vec3(-0.45, 0.6, 0.66))), 0.0);
					vec3 col = mix(uColor * (0.45 + 0.75 * vShade) * lit, uHot * 1.5, vHeat);
					gl_FragColor = vec4(mix(col, uFogColor, vFog), 1.0);
				}`,
		});
		this.points = new THREE.Points(geometry, material);
		this.points.frustumCulled = false;
		this.root.add(this.points);
	}

	/** Morphs to another form. Safe to call repeatedly with the same index. */
	setForm(index: number, instant: boolean): void {
		if (index === this.form) return;
		const weights = (i: number) => new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
		// start from wherever an unfinished morph has reached, so quick changes do not jump
		const from = this.uniforms.uFrom.value.clone().lerp(this.uniforms.uTo.value, this.uniforms.uMorph.value);
		this.uniforms.uFrom.value.copy(from);
		this.uniforms.uTo.value.copy(weights(index));
		this.form = index;
		this.tween?.kill();
		this.uniforms.uMorph.value = instant ? 1 : 0;
		if (!instant) this.tween = gsap.to(this.uniforms.uMorph, { value: 1, duration: 1.9, ease: 'power2.inOut' });
	}

	update(dt: number, state: { gather: number; stream: number; fogDensity: number; stage: boolean }, ray: THREE.Ray | null, time: number, calm: boolean): void {
		const u = this.uniforms;
		u.uTime.value = time;
		u.uGather.value = state.gather;
		u.uShow.value = state.stream;
		u.uFogDensity.value = state.fogDensity;
		// a slow sway, not a full turn: every form keeps facing the visitor
		u.uSpin.value = calm ? 0 : Math.sin(time * look.particles.spin) * 0.42;
		const k = 1 - Math.exp(-dt * 4);
		u.uPush.value += ((ray && state.gather > 0.95 ? 1 : 0) - u.uPush.value) * k;
		if (ray) {
			u.uRayOrigin.value.copy(ray.origin);
			u.uRayDir.value.copy(ray.direction);
		}
		this.stage.visible = state.stage;
		this.lamp.intensity = state.stage ? 24 * (0.6 + 0.4 * state.gather) : 0;
	}

	set visible(v: boolean) {
		this.root.visible = v;
		if (!v) this.lamp.intensity = 0;
	}

	dispose(): void {
		this.tween?.kill();
		this.points?.geometry.dispose();
		this.points?.material.dispose();
		for (const m of [this.ring, this.groove]) {
			m.geometry.dispose();
			m.material.dispose();
		}
	}
}
