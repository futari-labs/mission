// The world the whole journey happens in, and its year. Distant ridges at three depths, a sea of
// clouds, the banks and groves of the growing seasons (see vegetation.ts), and whatever the season
// puts in the air. One season value, set from the journey position, moves all of it together: snow
// line, growth, leaf colour, blossom, sky, sun, cloud, and whether snow, petals, or leaves are
// falling. It is separate from the opening's own terrain, which is composed for one view and hidden
// for the rest of the lap.
//
// Nothing here uses the scene fog. Each layer fades toward the sky colour behind it by an authored
// amount, so its contrast drops with distance whatever the local fog is doing.
//
// The return moves this whole group along z. Every pattern is therefore placed in the group's own
// coordinates (world position less `uShift`), so cloud, snow line, and falling leaves move with it.
import * as THREE from 'three';
import { tag } from './experiment.ts';
import { look } from './look.ts';
import { SKY_GLSL } from './sky.ts';
import { Grove } from './vegetation.ts';

type Season = (typeof look.seasons)[number];
/** The season's values at one moment of the year, blended between two neighbouring seasons. */
export interface SeasonMix {
	haze: number;
	key: THREE.Color;
	keyPower: number;
	hemiSky: THREE.Color;
	hemiGround: THREE.Color;
	/** Unit vector toward the sun. */
	sun: THREE.Vector3;
}

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
	uniform float uShift;
	varying vec3 vWorld;
	varying vec3 vLand;
	varying vec3 vNormal;
	void main() {
		vec4 w = modelMatrix * vec4(position, 1.0);
		vWorld = w.xyz;
		vLand = w.xyz - vec3(0.0, 0.0, uShift);
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
		// seasonal, all set in `update`
		uSnowLine: { value: -60 },
		uGrowth: { value: 0 },
		uCanopy: { value: 0 },
		uBlossom: { value: 0 },
		uLeafA: { value: new THREE.Color() },
		uLeafB: { value: new THREE.Color() },
		uLeafC: { value: new THREE.Color() },
		uGrass: { value: new THREE.Color() },
		uGround: { value: new THREE.Color() },
		uFlake: { value: new THREE.Color() },
		uLeaf: { value: 0 },
		uLitter: { value: 0 },
		uCloud: { value: 1 },
		/** How far along z the return has moved the group. */
		uShift: { value: 0 },
		// the season's light, for everything that is lit here and not by the scene's lights
		uSun: { value: new THREE.Vector3(0, 1, 0) },
		uKey: { value: new THREE.Color() },
		uHemiSky: { value: new THREE.Color() },
		uHemiGround: { value: new THREE.Color() },
		uAir: { value: 1 },
	};
	private readonly mix: SeasonMix = { haze: 1, key: new THREE.Color(), keyPower: 2.5, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), sun: new THREE.Vector3() };
	private readonly suns = look.seasons.map((s) => new THREE.Vector3(...s.sun).normalize());
	private readonly a = new THREE.Color();
	private readonly b = new THREE.Color();
	private readonly fogColor: THREE.Color;
	private readonly grove: Grove;
	private readonly snow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

	constructor(fog: THREE.FogExp2, coarse: boolean) {
		this.uniforms.uFogColor.value = fog.color;
		this.fogColor = fog.color;
		const land = (haze: number) =>
			new THREE.ShaderMaterial({
				uniforms: { ...this.uniforms, uHaze: { value: haze }, uRock: { value: new THREE.Color(look.environment.rock) }, uSnowColor: { value: new THREE.Color(look.environment.snow) } },
				fog: false,
				vertexShader: WORLD_VERTEX,
				fragmentShader: /* glsl */ `
					uniform sampler2D uNoise;
					uniform vec3 uFogColor, uRock, uSnowColor, uLeafA, uLeafB, uGround, uSun;
					varying vec3 vLand;
					uniform float uHaze, uVeil, uCloudTop, uSnowLine, uGrowth;
					varying vec3 vWorld;
					varying vec3 vNormal;
					${SKY_GLSL}
					void main() {
						vec3 n = normalize(vNormal);
						float lit = 0.62 + 0.55 * max(dot(n, uSun), 0.0);
						float patchy = texture2D(uNoise, vLand.xz * 0.006).r;
							// broken ground at a size the mesh does not have, so a slope is not one flat facet
							vec2 rough = vec2(texture2D(uNoise, vLand.xz * 0.021).r, texture2D(uNoise, vLand.zx * 0.021 + 0.43).r) - 0.5;
							n = normalize(n + vec3(rough.x, 0.0, rough.y) * 0.5);
							lit = 0.62 + 0.55 * max(dot(n, uSun), 0.0);
						// snow lies above a line that climbs through the year, and never on the steepest faces
						float snow = smoothstep(uSnowLine - 20.0, uSnowLine + 20.0, vWorld.y + 46.0 * (patchy - 0.5)) * smoothstep(0.4, 0.78, n.y + 0.1);
						// growth takes the lower, gentler slopes first and thins out with height
						float grown = uGrowth * smoothstep(0.34, 0.62, n.y + 0.25 * (patchy - 0.5)) * (1.0 - smoothstep(30.0, 150.0, vWorld.y));
						vec3 bare = mix(uRock, uGround, 0.6 * uGrowth);
						vec3 col = mix(mix(bare, mix(uLeafA, uLeafB, patchy), grown), uSnowColor, snow) * lit;
						// the foot of every slope dissolves into the cloud sea
						float low = 1.0 - smoothstep(uCloudTop - 4.0, uCloudTop + 22.0, vWorld.y);
						vec3 view = vWorld - cameraPosition;
						float haze = max(max(uHaze + 0.35 * smoothstep(150.0, 900.0, length(view)) * (1.0 - uHaze), low), uVeil);
						gl_FragColor = vec4(mix(col, futariSky(normalize(view), uFogColor), haze), 1.0);
					}`,
			});
		look.environment.ridges.forEach((ridge, i) => {
			const material = land(ridge.haze);
			const mesh = new THREE.Mesh(ridgeGeometry(i), material);
			mesh.frustumCulled = false;
			mesh.renderOrder = -6 + i * -1;
			this.root.add(tag(mesh, 'ridges'));
		});
		// The banks and groves belong to the growing seasons. In winter the opening's own terrain stands
		// where they are, so they fade out into the sky and stop being drawn.
		this.grove = new Grove(this.uniforms, coarse);
		this.root.add(this.grove.root);

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
						uniform float uTime, uVeil, uScale, uOpacity, uDrift, uCloud;
						varying vec3 vLand;
						varying vec3 vWorld;
						${SKY_GLSL}
						void main() {
							vec2 p = vLand.xz * uScale + uTime * vec2(uDrift, uDrift * 0.4);
							float n = texture2D(uNoise, p).r * 0.72 + texture2D(uNoise, p * 3.1 + 0.37).r * 0.28;
							vec3 view = vWorld - cameraPosition;
							float dist = length(view);
							// broken nearby, closing into a continuous sea toward the horizon
							float cover = mix(smoothstep(0.45, 0.54, n), 1.0, smoothstep(520.0, 1500.0, dist));
							vec3 dir = view / dist;
							// lit tops in the ivory of the horizon, cool shadow in the folds
							vec3 top = futariSky(normalize(vec3(dir.x, 0.03, dir.z)), uFogColor);
							vec3 col = mix(top * vec3(0.5, 0.56, 0.7), (top * 1.08 + 0.03) * uCloud, smoothstep(0.47, 0.7, n));
							// far cloud takes the colour of the horizon it meets, so there is no dividing line
							col = mix(col, top, smoothstep(500.0, 1700.0, dist));
							gl_FragColor = vec4(col, cover * uOpacity * (1.0 - uVeil));
						}`,
				}),
			);
			deck.position.set(CENTRE.x, height, CENTRE.z);
			deck.renderOrder = -4;
			deck.frustumCulled = false;
			this.root.add(tag(deck, 'clouds'));
		}
		// each bank is a large blended quad, and they overlap toward the horizon: a few is all the frame can afford
		this.root.add(tag(this.banks(coarse ? 9 : 16), 'clouds'));
		this.snow = tag(this.snowfall(coarse ? 450 : 1000), 'particles');
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
				uniform float uCloud;
				attribute vec4 aBank;
				varying vec2 vUv;
				varying vec3 vWorld;
				varying float vSeed;
				void main() {
					vUv = uv;
					vSeed = aBank.w;
					vec3 centre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
					vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
					// summer builds the banks up into tall white cloud
					float tall = 1.0 + 3.2 * max(uCloud - 1.0, 0.0);
					vec3 w = centre + right * position.x * aBank.x + vec3(0.0, (position.y + 0.5) * aBank.y * tall - 0.5 * aBank.y, 0.0);
					vWorld = w;
					gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uNoise;
				uniform vec3 uFogColor;
				uniform float uTime, uVeil, uCloud;
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
					vec3 col = mix(top * vec3(0.56, 0.62, 0.76), (top * 1.07 + 0.03) * uCloud, smoothstep(-0.3, 0.4, c.y + (n - 0.5) * 0.5));
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

	/**
	 * What is in the air, in a box that wraps around the camera so it is present everywhere:
	 * snow in winter, a few petals in spring, almost nothing in summer, leaves in autumn.
	 * One bounded pool does all of it. Only colour, size, shape, and amount change.
	 */
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
					uniform float uTime, uLeaf, uShift;
					varying float vAlpha;
					varying float vSpin;
					void main() {
						vec3 box = vec3(64.0, 30.0, 64.0);
						// petals and leaves fall slower than snow and wander sideways
						vec3 drift = vec3(0.7 + 0.5 * uLeaf, -0.26 + 0.1 * uLeaf, 0.2) * uTime * (0.4 + position.y);
						drift.x += sin(uTime * 0.7 + position.z * 40.0) * 1.2 * uLeaf;
						// wrapped around the camera in the group's own coordinates, so the return's move does not reseed it
						vec3 eye = cameraPosition - vec3(0.0, 0.0, uShift);
						vec3 p = eye + mod(position * box + drift - eye, box) - box * 0.5 + vec3(0.0, 0.0, uShift);
						vec4 mv = viewMatrix * vec4(p, 1.0);
						float d = -mv.z;
						gl_Position = projectionMatrix * mv;
						gl_PointSize = clamp((0.03 + position.x * 0.05) * (1.0 + 2.6 * uLeaf) * projectionMatrix[1][1] * 480.0 / d, 0.9, 4.0 + 10.0 * uLeaf);
						// kept toward the sides and the lower frame, away from the structures and the copy
						vec2 at = gl_Position.xy / gl_Position.w;
						float side = smoothstep(0.05, 0.6, length(at * vec2(0.7, 1.0)));
						side *= mix(1.0, smoothstep(0.35, -0.5, at.y) * smoothstep(0.25, 0.85, length(at)), uLeaf);
						vAlpha = (0.25 + 0.5 * position.z) * smoothstep(1.5, 5.0, d) * smoothstep(32.0, 18.0, d) * (0.35 + 0.65 * side);
						vSpin = position.z * 6.28 + uTime * (0.6 + position.x * 1.6);
					}`,
				fragmentShader: /* glsl */ `
					uniform vec3 uFlake;
					uniform float uSnow, uVeil, uLeaf;
					varying float vAlpha;
					varying float vSpin;
					void main() {
						vec2 c = gl_PointCoord - 0.5;
						float cs = cos(vSpin), sn = sin(vSpin);
						vec2 turned = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
						// a round flake, or the pointed oval of a petal or a leaf seen turning
						float r = mix(length(c), length(turned * vec2(1.0, 2.3)) + 0.12 * abs(turned.x), uLeaf);
						gl_FragColor = vec4(uFlake * mix(1.0, 0.82 + 0.3 * turned.y, uLeaf), vAlpha * uSnow * mix(1.0, 1.5, uLeaf) * smoothstep(0.5, mix(0.1, 0.38, uLeaf), r));
					}`,
			}),
		);
		points.frustumCulled = false;
		points.renderOrder = 6;
		return points;
	}

	/**
	 * `season` is where the year is, 0 winter to 4 winter again. `shift` moves the whole environment
	 * along z with the installation during the return, and `veil` hides it while it moves back.
	 * `air` is how much of the snow, petals, or leaves shows. Returns the season's light and haze.
	 */
	update(time: number, season: number, shift: number, veil: number, air: number): SeasonMix {
		const list = look.seasons;
		const i = Math.floor(season) % list.length;
		const from: Season = list[i];
		const to: Season = list[(i + 1) % list.length];
		const t = season - Math.floor(season);
		const num = (k: 'haze' | 'keyPower' | 'snowLine' | 'growth' | 'canopy' | 'blossom' | 'flakes' | 'leaf' | 'cloud' | 'litter') => from[k] + (to[k] - from[k]) * t;
		const col = (k: 'sky' | 'key' | 'hemiSky' | 'hemiGround' | 'leafA' | 'leafB' | 'leafC' | 'grass' | 'ground' | 'flake', out: THREE.Color) => out.copy(this.a.set(from[k])).lerp(this.b.set(to[k]), t);
		const u = this.uniforms;
		// the sky colour is the fog colour, and everything distant fades to it
		col('sky', this.fogColor);
		col('leafA', u.uLeafA.value);
		col('leafB', u.uLeafB.value);
		col('leafC', u.uLeafC.value);
		col('grass', u.uGrass.value);
		col('ground', u.uGround.value);
		col('flake', u.uFlake.value);
		u.uSnowLine.value = num('snowLine');
		u.uGrowth.value = num('growth');
		u.uCanopy.value = num('canopy');
		// blossom is a spring event: it peaks there and is gone well before summer and before winter
		u.uBlossom.value = Math.max(0, 1 - Math.abs(season - 1) * 1.6);
		u.uLeaf.value = num('leaf');
		u.uCloud.value = num('cloud');
		u.uLitter.value = num('litter');
		u.uShift.value = shift;
		u.uTime.value = time;
		u.uVeil.value = veil;
		u.uSnow.value = air * num('flakes');
		this.root.position.z = shift;
		// below this the banks have faded into the sky entirely
		this.grove.root.visible = u.uGrowth.value > 0.1;
		this.mix.haze = num('haze');
		this.mix.keyPower = num('keyPower');
		col('key', this.mix.key);
		col('hemiSky', this.mix.hemiSky);
		col('hemiGround', this.mix.hemiGround);
		// The sun is back where winter has it early in the last leg, before the opening and its fixed
		// shadows come back into view.
		this.mix.sun.copy(this.suns[i]).lerp(this.suns[(i + 1) % list.length], i === list.length - 1 ? Math.min(1, t / 0.22) : t).normalize();
		u.uSun.value.copy(this.mix.sun);
		// the same light the scene's own lamps give the stone, scaled to how these surfaces are shaded
		u.uKey.value.copy(this.mix.key).multiplyScalar((0.62 * this.mix.keyPower) / look.lights.key.intensity);
		u.uHemiSky.value.copy(this.mix.hemiSky);
		u.uHemiGround.value.copy(this.mix.hemiGround).multiplyScalar(1.8);
		u.uAir.value = this.mix.haze;
		return this.mix;
	}

	/** Loads the banks and groves. The rest of the environment needs nothing loaded. */
	load(): Promise<void> {
		return this.grove.load();
	}

	/** The season's light, sky, and clock as uniforms, for anything else that is lit outside the scene's lamps. */
	get shared(): Record<string, THREE.IUniform> {
		return this.uniforms;
	}

	/** The groves, for anything else that grows: the climber on the Engineering exhibit. Use after `load`. */
	get flora(): Grove {
		return this.grove;
	}

	/** Draws the banks and groves for one offscreen frame, so they are compiled before spring needs them. */
	warm(on: boolean): void {
		this.grove.root.visible = on;
	}

	dispose(): void {
		this.uniforms.uNoise.value.dispose();
		this.grove.root.removeFromParent();
		this.grove.dispose();
		this.root.traverse((o) => {
			const m = o as THREE.Mesh;
			if (m.geometry) m.geometry.dispose();
			if (m.material) (m.material as THREE.Material).dispose();
		});
	}
}
