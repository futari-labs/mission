// The world the whole journey happens in: distant winter ridges at three depths, a broken sea of
// clouds below, and sparse snow that stays with the camera. It is separate from the opening's own
// terrain, which is composed for one view and hidden for the rest of the lap.
//
// Nothing here uses the scene fog. Each layer fades toward the sky colour behind it by an authored
// amount, so its contrast drops with distance whatever the local fog is doing.
import * as THREE from 'three';
import { look } from './look.ts';
import { SKY_GLSL } from './sky.ts';

/** The corridor of travel runs along -z from the landmark to the installation. This is its middle. */
const CENTRE = new THREE.Vector3(0, 0, -75);
const hash = (n: number) => Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;

/** Smooth 1D noise with period `period`, for ridge lines that close on themselves. */
function ridgeNoise(x: number, period: number, seed: number): number {
	const i = Math.floor(x);
	const f = x - i;
	const t = f * f * (3 - 2 * f);
	const at = (k: number) => hash((((k % period) + period) % period) + seed * 57);
	return at(i) * (1 - t) + at(i + 1) * t;
}

/**
 * Peak height around the compass, 0 to 1. Angle 90 degrees is straight ahead along the journey.
 * A valley is left open ahead, where the exhibits' headings sit and where the rings lead,
 * with the main massifs to either side of it.
 */
function crest(angle: number, layer: number): number {
	const deg = (((angle * 180) / Math.PI) % 360 + 360) % 360;
	const bump = (at: number, wide: number, tall: number) => {
		const d = Math.min(Math.abs(deg - at), 360 - Math.abs(deg - at));
		return tall * Math.exp(-((d / wide) ** 2));
	};
	const massifs = [
		bump(66 - layer * 5, 12, 1), bump(116 + layer * 5, 13, 0.92), bump(30 - layer * 4, 15, 0.6), bump(152 + layer * 4, 16, 0.66),
		bump(215 + layer * 12, 26, 0.7), bump(300 - layer * 10, 30, 0.75), bump(255, 14, 0.4),
	].reduce((a, b) => Math.max(a, b), 0);
	const valley = 1 - 0.62 * Math.exp(-(((deg - 91) / (8 - layer)) ** 2));
	const jag = 0.55 * ridgeNoise((deg / 360) * 40, 40, layer) + 0.3 * ridgeNoise((deg / 360) * 110, 110, layer + 3) + 0.15 * ridgeNoise((deg / 360) * 300, 300, layer + 6);
	return (0.3 + 0.7 * massifs) * valley * (0.55 + 0.75 * jag);
}

function ridgeGeometry(layer: number): THREE.BufferGeometry {
	const { radius, width, height } = look.environment.ridges[layer];
	const around = 420;
	const across = 8;
	const positions: number[] = [];
	const indices: number[] = [];
	for (let i = 0; i <= around; i++) {
		const angle = (i / around) * Math.PI * 2;
		const peak = crest(angle, layer) * height;
		for (let j = 0; j <= across; j++) {
			const v = j / across;
			const r = radius + (v - 0.38) * width;
			// one main crest, steeper toward the journey, with a lower shoulder behind it
			const profile = Math.sin(Math.PI * Math.min(1, v / 0.76)) ** 1.3 * (v < 0.38 ? 1 : 0.6 + 0.4 * Math.cos((v - 0.38) * 5));
			const rough = 1 + 0.22 * (ridgeNoise(i * 0.37 + j * 3.1, 9999, layer + 11) - 0.5);
			positions.push(CENTRE.x + Math.cos(angle) * r, look.environment.cloudTop - 40 + (peak + 40) * profile * rough, CENTRE.z - Math.sin(angle) * r);
			if (i < around && j < across) {
				const a = i * (across + 1) + j;
				const b = a + across + 1;
				indices.push(a, a + 1, b, b, a + 1, b + 1);
			}
		}
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

function cloudTexture(size: number): THREE.DataTexture {
	let s = 20260;
	const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
	const grid = 8;
	const lattice = Array.from({ length: 5 }, (_, o) => Float32Array.from({ length: (grid << o) ** 2 }, rand));
	const data = new Uint8Array(size * size);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			let v = 0;
			let amp = 0.5;
			for (let o = 0; o < 5; o++) {
				const n = grid << o;
				const fx = (x / size) * n;
				const fy = (y / size) * n;
				const x0 = Math.floor(fx);
				const y0 = Math.floor(fy);
				const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0));
				const sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0));
				const at = (i: number, j: number) => lattice[o][(j % n) * n + (i % n)];
				v += amp * ((at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy);
				amp *= 0.5;
			}
			data[y * size + x] = Math.round(v * 255);
		}
	const t = new THREE.DataTexture(data, size, size, THREE.RedFormat);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	t.magFilter = THREE.LinearFilter;
	t.generateMipmaps = true;
	t.needsUpdate = true;
	return t;
}

const WORLD_VERTEX = /* glsl */ `
	varying vec3 vWorld;
	varying vec3 vNormal;
	void main() {
		vec4 w = modelMatrix * vec4(position, 1.0);
		vWorld = w.xyz;
		vNormal = normal;
		gl_Position = projectionMatrix * viewMatrix * w;
	}`;

export class Environment {
	readonly root = new THREE.Group();
	private readonly uniforms = {
		uTime: { value: 0 },
		uFogColor: { value: new THREE.Color() },
		/** 1 hides every layer in the sky. Used while the return moves the world under cover of snow. */
		uVeil: { value: 0 },
		uNoise: { value: cloudTexture(256) },
		uCloudTop: { value: look.environment.cloudTop },
		uSnow: { value: 1 },
	};
	private readonly snow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

	constructor(fog: THREE.FogExp2, coarse: boolean) {
		this.uniforms.uFogColor.value = fog.color;
		look.environment.ridges.forEach((ridge, i) => {
			const material = new THREE.ShaderMaterial({
				uniforms: { ...this.uniforms, uHaze: { value: ridge.haze }, uRock: { value: new THREE.Color(look.environment.rock) }, uSnowColor: { value: new THREE.Color(look.environment.snow) } },
				fog: false,
				vertexShader: WORLD_VERTEX,
				fragmentShader: /* glsl */ `
					uniform vec3 uFogColor, uRock, uSnowColor;
					uniform float uHaze, uVeil, uCloudTop;
					varying vec3 vWorld;
					varying vec3 vNormal;
					${SKY_GLSL}
					void main() {
						vec3 n = normalize(vNormal);
						float lit = 0.62 + 0.55 * max(dot(n, normalize(vec3(-0.5, 0.7, 0.5))), 0.0);
						float snow = smoothstep(0.45, 0.8, n.y + 0.002 * (vWorld.y - uCloudTop));
						vec3 col = mix(uRock, uSnowColor, snow) * lit;
						// the foot of every ridge dissolves into the cloud sea
						float low = 1.0 - smoothstep(uCloudTop - 4.0, uCloudTop + 22.0, vWorld.y);
						float haze = max(max(uHaze, low), uVeil);
						gl_FragColor = vec4(mix(col, futariSky(normalize(vWorld - cameraPosition), uFogColor), haze), 1.0);
					}`,
			});
			const mesh = new THREE.Mesh(ridgeGeometry(i), material);
			mesh.frustumCulled = false;
			mesh.renderOrder = -6 + i * -1;
			this.root.add(mesh);
		});

		// two cloud decks at different depths: gaps in the upper one show the lower one moving more slowly
		for (const [height, scale, opacity, drift] of [[look.environment.cloudTop - 22, 0.0006, 0.8, 0.0005], [look.environment.cloudTop, 0.00095, look.environment.cloudOpacity, 0.001]] as const) {
			const deck = new THREE.Mesh(
				new THREE.CircleGeometry(1900, 48).rotateX(-Math.PI / 2),
				new THREE.ShaderMaterial({
					uniforms: { ...this.uniforms, uScale: { value: scale }, uOpacity: { value: opacity }, uDrift: { value: drift } },
					transparent: true,
					depthWrite: false,
					fog: false,
					vertexShader: WORLD_VERTEX,
					fragmentShader: /* glsl */ `
						uniform sampler2D uNoise;
						uniform vec3 uFogColor;
						uniform float uTime, uVeil, uScale, uOpacity, uDrift;
						varying vec3 vWorld;
						${SKY_GLSL}
						void main() {
							vec2 p = vWorld.xz * uScale + uTime * vec2(uDrift, uDrift * 0.4);
							float n = texture2D(uNoise, p).r * 0.72 + texture2D(uNoise, p * 3.1 + 0.37).r * 0.28;
							vec3 view = vWorld - cameraPosition;
							float dist = length(view);
							// broken nearby, closing into a continuous sea toward the horizon
							float cover = mix(smoothstep(0.45, 0.54, n), 1.0, smoothstep(520.0, 1500.0, dist));
							vec3 dir = view / dist;
							// lit tops in the ivory of the horizon, cool shadow in the folds
							vec3 top = futariSky(normalize(vec3(dir.x, 0.03, dir.z)), uFogColor);
							vec3 col = mix(top * vec3(0.5, 0.56, 0.7), top * 1.08 + 0.03, smoothstep(0.47, 0.7, n));
							// far cloud takes the colour of the horizon it meets, so there is no dividing line
							col = mix(col, top, smoothstep(500.0, 1700.0, dist));
							gl_FragColor = vec4(col, cover * uOpacity * (1.0 - uVeil));
						}`,
				}),
			);
			deck.position.set(CENTRE.x, height, CENTRE.z);
			deck.renderOrder = -4;
			deck.frustumCulled = false;
			this.root.add(deck);
		}
		// each bank is a large blended quad, and they overlap toward the horizon: a few is all the frame can afford
		this.root.add(this.banks(coarse ? 9 : 16));
		this.snow = this.snowfall(coarse ? 450 : 1000);
		this.root.add(this.snow);
	}

	/** Cloud banks that rise out of the sea toward the sides, so the horizon is never one straight edge. */
	private banks(count: number): THREE.InstancedMesh {
		const material = new THREE.ShaderMaterial({
			uniforms: this.uniforms,
			transparent: true,
			depthWrite: false,
			fog: false,
			vertexShader: /* glsl */ `
				attribute vec4 aBank;
				varying vec2 vUv;
				varying vec3 vWorld;
				varying float vSeed;
				void main() {
					vUv = uv;
					vSeed = aBank.w;
					vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
					vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
					vec3 w = centre + right * position.x * aBank.x + vec3(0.0, position.y * aBank.y, 0.0);
					vWorld = w;
					gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uNoise;
				uniform vec3 uFogColor;
				uniform float uTime, uVeil;
				varying vec2 vUv;
				varying vec3 vWorld;
				varying float vSeed;
				${SKY_GLSL}
				void main() {
					vec2 c = vUv - 0.5;
					float n = texture2D(uNoise, vUv * vec2(0.7, 0.45) + vSeed * 7.0 + uTime * 0.002).r;
					// a soft mound: full at the base, feathered and broken at the top and the ends
					float shape = smoothstep(0.5, 0.12, abs(c.x)) * smoothstep(0.5, -0.1, c.y + (n - 0.5) * 0.5) * smoothstep(-0.5, -0.3, c.y);
					vec3 view = vWorld - cameraPosition;
					float dist = length(view);
					vec3 top = futariSky(normalize(vec3(view.x, dist * 0.03, view.z)), uFogColor);
					vec3 col = mix(top * vec3(0.56, 0.62, 0.76), top * 1.07 + 0.03, smoothstep(-0.3, 0.4, c.y + (n - 0.5) * 0.5));
					col = mix(col, top, smoothstep(500.0, 1500.0, dist));
					gl_FragColor = vec4(col, shape * smoothstep(0.3, 0.6, n + 0.25) * 0.82 * (1.0 - uVeil) * smoothstep(25.0, 70.0, dist));
				}`,
		});
		const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, count);
		const data = new Float32Array(count * 4);
		const m = new THREE.Matrix4();
		for (let i = 0; i < count; i++) {
			// kept off the line of travel: the corridor ahead stays open
			const angle = hash(i + 1) * Math.PI * 2;
			const off = Math.abs(Math.cos(angle));
			const radius = 150 + hash(i + 31) * 520 + (1 - off) * 130;
			const wide = 110 + hash(i + 61) * 170 + radius * 0.16;
			m.makeTranslation(CENTRE.x + Math.cos(angle) * radius, look.environment.cloudTop + 1 + wide * 0.07, CENTRE.z - Math.sin(angle) * radius);
			mesh.setMatrixAt(i, m);
			data.set([wide, wide * (0.2 + hash(i + 91) * 0.14), 0, hash(i + 121)], i * 4);
		}
		mesh.geometry.setAttribute('aBank', new THREE.InstancedBufferAttribute(data, 4));
		mesh.frustumCulled = false;
		mesh.renderOrder = -3;
		return mesh;
	}

	/** Sparse snow in a box that wraps around the camera, so it is present everywhere on the journey. */
	private snowfall(count: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
		const seed = new Float32Array(count * 3);
		for (let i = 0; i < seed.length; i++) seed[i] = hash(i * 1.37 + 5);
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(seed, 3));
		const points = new THREE.Points(
			geometry,
			new THREE.ShaderMaterial({
				uniforms: this.uniforms,
				transparent: true,
				depthWrite: false,
				fog: false,
				vertexShader: /* glsl */ `
					uniform float uTime;
					varying float vAlpha;
					void main() {
						vec3 box = vec3(64.0, 30.0, 64.0);
						vec3 drift = vec3(0.7, -0.26, 0.2) * uTime * (0.4 + position.y);
						vec3 p = cameraPosition + mod(position * box + drift - cameraPosition, box) - box * 0.5;
						vec4 mv = viewMatrix * vec4(p, 1.0);
						float d = -mv.z;
						gl_Position = projectionMatrix * mv;
						gl_PointSize = clamp((0.03 + position.x * 0.05) * projectionMatrix[1][1] * 480.0 / d, 0.9, 4.0);
						// thin near the middle of the frame, where the structures and the copy are
						float side = smoothstep(0.05, 0.6, length(gl_Position.xy / gl_Position.w * vec2(0.7, 1.0)));
						vAlpha = (0.25 + 0.5 * position.z) * smoothstep(1.5, 5.0, d) * smoothstep(32.0, 18.0, d) * (0.35 + 0.65 * side);
					}`,
				fragmentShader: /* glsl */ `
					uniform float uSnow, uVeil;
					varying float vAlpha;
					void main() {
						float r = length(gl_PointCoord - 0.5);
						gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), vAlpha * uSnow * smoothstep(0.5, 0.1, r));
					}`,
			}),
		);
		points.frustumCulled = false;
		points.renderOrder = 6;
		return points;
	}

	/**
	 * `shift` moves the whole environment along z with the installation during the return, and `veil`
	 * hides it while it moves back. `snow` is how much of the travelling snow shows.
	 */
	update(time: number, shift: number, veil: number, snow: number): void {
		this.uniforms.uTime.value = time;
		this.uniforms.uVeil.value = veil;
		this.uniforms.uSnow.value = snow;
		this.root.position.z = shift;
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
