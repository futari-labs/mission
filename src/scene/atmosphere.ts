// Depth cues between the layers: drifting snow and slow banks of mist.
import * as THREE from 'three';
import { tag } from './experiment.ts';

function valueNoiseTexture(size: number, seed: number): THREE.DataTexture {
	let s = seed;
	const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
	const grid = 16;
	const lattice = Array.from({ length: 4 }, (_, o) => Float32Array.from({ length: (grid << o) ** 2 }, rand));
	const data = new Uint8Array(size * size);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			let v = 0;
			let amp = 0.5;
			for (let o = 0; o < 4; o++) {
				const n = grid << o;
				const fx = (x / size) * n;
				const fy = (y / size) * n;
				const x0 = Math.floor(fx);
				const y0 = Math.floor(fy);
				const tx = fx - x0;
				const ty = fy - y0;
				const sx = tx * tx * (3 - 2 * tx);
				const sy = ty * ty * (3 - 2 * ty);
				const at = (i: number, j: number) => lattice[o][(j % n) * n + (i % n)];
				v += amp * ((at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy);
				amp *= 0.5;
			}
			data[y * size + x] = Math.round(v * 255);
		}
	const t = new THREE.DataTexture(data, size, size, THREE.RedFormat);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.minFilter = t.magFilter = THREE.LinearFilter;
	t.needsUpdate = true;
	return t;
}

export class Atmosphere {
	readonly root = new THREE.Group();
	private readonly uniforms = { uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uNoise: { value: valueNoiseTexture(256, 91) }, uReveal: { value: 1 } };

	constructor(fog: THREE.FogExp2, particles: number) {
		this.uniforms.uFogColor.value = fog.color;
		this.root.add(this.snow(particles));
		// x, y, z, width, height, opacity, drift speed
		const banks: [number, number, number, number, number, number, number][] = [
			[4, 1.8, -15, 76, 8, 0.3, 0.006],
			[-34, 6, -34, 90, 20, 0.42, 0.004],
			[38, 7, -48, 100, 24, 0.4, -0.005],
			[0, 12, -84, 190, 40, 0.34, 0.003],
			[-10, -1.6, 9, 64, 4.5, 0.16, -0.008],
		];
		for (const b of banks) this.root.add(this.bank(...b));
	}

	private snow(count: number): THREE.Points {
		const position = new Float32Array(count * 3);
		const seed = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			position.set([Math.random() * 70 - 40, Math.random() * 16 - 1, Math.random() * 70 - 30], i * 3);
			seed[i] = Math.random();
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
		geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
		const material = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			transparent: true,
			depthWrite: false,
			fog: false,
			vertexShader: /* glsl */ `
				uniform float uTime;
				attribute float aSeed;
				varying float vAlpha;
				void main() {
					vec3 p = position;
					float t = uTime * (0.35 + aSeed * 0.5);
					p.x = mod(p.x + 40.0 + t * 0.9 + sin(uTime * 0.4 + aSeed * 40.0) * 0.4, 70.0) - 40.0;
					p.y = mod(p.y + 1.0 - t * 0.28, 16.0) - 1.0;
					p.z = mod(p.z + 30.0 + t * 0.25, 70.0) - 30.0;
					vec4 mv = modelViewMatrix * vec4(p, 1.0);
					float d = -mv.z;
					gl_Position = projectionMatrix * mv;
					gl_PointSize = clamp((0.035 + aSeed * 0.05) * projectionMatrix[1][1] * 500.0 / d, 0.9, 5.0);
					vAlpha = (0.35 + aSeed * 0.55) * smoothstep(0.6, 3.0, d) * exp(-d * 0.02);
				}`,
			fragmentShader: /* glsl */ `
				uniform float uReveal;
				varying float vAlpha;
				void main() {
					float r = length(gl_PointCoord - 0.5);
					gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), vAlpha * uReveal * smoothstep(0.5, 0.08, r));
				}`,
		});
		const points = new THREE.Points(geometry, material);
		points.frustumCulled = false;
		return tag(points, 'particles');
	}

	private bank(x: number, y: number, z: number, w: number, h: number, opacity: number, speed: number): THREE.Mesh {
		const material = new THREE.ShaderMaterial({
			uniforms: { ...this.uniforms, uOpacity: { value: opacity }, uSpeed: { value: speed }, uScale: { value: new THREE.Vector2(w / 60, h / 30) } },
			transparent: true,
			depthWrite: false,
			fog: false,
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uNoise;
				uniform vec3 uFogColor;
				uniform float uTime, uOpacity, uSpeed, uReveal;
				uniform vec2 uScale;
				varying vec2 vUv;
				void main() {
					vec2 p = vUv * uScale;
					float n = texture2D(uNoise, p + vec2(uTime * uSpeed, 0.0)).r * 0.65 + texture2D(uNoise, p * 2.3 - vec2(uTime * uSpeed * 1.7, 0.1)).r * 0.35;
					float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x) * smoothstep(0.0, 0.42, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
					gl_FragColor = vec4(uFogColor * 1.05, smoothstep(0.34, 0.8, n) * edge * uOpacity * uReveal);
				}`,
		});
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
		mesh.position.set(x, y, z);
		mesh.renderOrder = 5;
		return tag(mesh, 'mist');
	}

	set reveal(v: number) {
		this.uniforms.uReveal.value = v;
	}

	update(time: number): void {
		this.uniforms.uTime.value = time;
	}

	dispose(): void {
		this.uniforms.uNoise.value.dispose();
		this.root.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.geometry) m.geometry.dispose();
			if (m.material) (m.material as THREE.Material).dispose();
		});
	}
}
