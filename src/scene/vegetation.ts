// The banks of the growing seasons, and the trees and shrubs that stand on them.
//
// Geometry comes from `landscape.glb`, built by `tools/assets/landscape.ts` and `trees.ts`. The
// banks are textured from photographed rock, grass, soil, and leaf litter, spread by slope and by
// what the build baked into each vertex. Each species is drawn as two instanced meshes: wood, and
// cards for its leaves and blossom. A card is a cluster that turns to face the camera and grows
// or shrinks with the season, so a crown fills, thins, and empties without its branches moving.
//
// Everything is lit by the season's sun and sky, and fades into the same sky as the rest of the
// environment. Surface patterns are placed in the environment's own coordinates, so they stay
// attached to the ground when the return moves the world.
import * as THREE from 'three';
import { loadGlb, meshesOf } from './assets.ts';
import { look } from './look.ts';
import { SKY_GLSL } from './sky.ts';

/** Layers of the land textures, in the order `tools/assets/textures/fetch.mjs` packs them. */
const LAYER = { rock: 0, grass: 1, soil: 2, litter: 3, bark: 4 } as const;
const LAYERS = 5;

type Uniforms = Record<string, THREE.IUniform>;

/** Cuts a tall image of square layers into a texture array, so each layer tiles and mipmaps on its own. */
async function loadLayers(url: string, colour: boolean): Promise<{ texture: THREE.DataArrayTexture; mean: THREE.Vector3[] }> {
	const image = await new THREE.ImageLoader().loadAsync(url);
	const size = image.width;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size * LAYERS;
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(image, 0, 0);
	const data = new Uint8Array(ctx.getImageData(0, 0, size, size * LAYERS).data.buffer);
	// the mean colour of each layer, in linear light: the shaders keep a photograph's detail and replace its average
	const mean = Array.from({ length: LAYERS }, (_, l) => {
		const sum = [0, 0, 0];
		for (let i = l * size * size * 4; i < (l + 1) * size * size * 4; i += 64) for (let c = 0; c < 3; c++) sum[c] += (data[i + c] / 255) ** 2.2;
		return new THREE.Vector3(...sum).multiplyScalar(16 / (size * size));
	});
	const texture = new THREE.DataArrayTexture(data, size, size, LAYERS);
	texture.format = THREE.RGBAFormat;
	texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 4;
	texture.needsUpdate = true;
	return { texture, mean };
}

// Shared by the three materials: the season's light, and the fade into the sky.
const LIGHT_GLSL = /* glsl */ `
	uniform vec3 uFogColor, uSun, uKey, uHemiSky, uHemiGround;
	uniform float uVeil, uGrowth, uAir, uCloudTop;
	${SKY_GLSL}
	// sky light from above, bounced light from below, and the sun. occlusion dims the sky and, less, the sun
	vec3 seasonLight(vec3 n, float sun, float open) {
		vec3 sky = mix(uHemiGround, uHemiSky, 0.5 + 0.5 * n.y) * 0.74;
		return sky * open + uKey * sun * mix(0.5, 1.0, open);
	}
	// the foot of every bank dissolves into the cloud, distance takes contrast, and in winter and
	// while the world moves under cover everything is sky
	vec3 intoSky(vec3 col, vec3 world) {
		vec3 view = world - cameraPosition;
		float dist = length(view);
		float low = 1.0 - smoothstep(uCloudTop - 5.0, uCloudTop + 15.0, world.y);
		float haze = min(1.0, (1.0 - exp(-dist / 400.0)) * uAir);
		haze = max(max(haze, low), max(uVeil, 1.0 - smoothstep(0.1, 0.3, uGrowth)));
		return mix(col, futariSky(view / dist, uFogColor), haze);
	}`;

const BANK_VERTEX = /* glsl */ `
	uniform float uShift;
	attribute vec4 aBake;
	varying vec3 vWorld;
	varying vec3 vLand;
	varying vec3 vNormal;
	varying vec4 vBake;
	void main() {
		vec4 w = modelMatrix * vec4(position, 1.0);
		vWorld = w.xyz;
		vLand = w.xyz - vec3(0.0, 0.0, uShift);
		vNormal = normalize(mat3(modelMatrix) * normal);
		vBake = aBake;
		gl_Position = projectionMatrix * viewMatrix * w;
	}`;

const BANK_FRAGMENT = /* glsl */ `
	uniform mediump sampler2DArray uLand;
	uniform mediump sampler2DArray uLandNormal;
	uniform sampler2D uNoise;
	uniform vec3 uMean[${LAYERS}];
	uniform vec3 uRock, uGrass, uGround, uLeafA, uLeafB;
	uniform float uLitter;
	varying vec3 vWorld;
	varying vec3 vLand;
	varying vec3 vNormal;
	varying vec4 vBake;
	${LIGHT_GLSL}
	// a photograph's detail and local hue, around the colour the season asks for
	vec3 toned(vec3 tex, int layer, vec3 want, float keep) {
		vec3 rel = tex / uMean[layer];
		float l = dot(rel, vec3(0.3, 0.5, 0.2));
		return want * mix(vec3(l), rel, keep);
	}
	vec2 bump(vec2 uv, int layer) {
		return texture(uLandNormal, vec3(uv, float(layer))).xy * 2.0 - 1.0;
	}
	void main() {
		vec3 n = normalize(vNormal);
		vec3 p = vLand;
		float broad = texture2D(uNoise, p.xz * 0.011).r;
		// patterns are projected from whichever side the surface faces, so nothing smears down a steep face
		vec3 w = pow(abs(n), vec3(4.0));
		w /= w.x + w.y + w.z;
		float fine = texture2D(uNoise, p.zy * 0.083).r * w.x + texture2D(uNoise, p.xy * 0.083 + 0.5).r * w.z + texture2D(uNoise, p.xz * 0.083 + 0.31).r * w.y;

		// what the ground is made of here: rock where it is steep or pushes through, soil in the
		// gullies, at the edge of the rock, and in worn patches, and turf on the rest
		float rock = max(1.0 - smoothstep(0.66, 0.8, n.y + 0.2 * (fine - 0.5)), smoothstep(0.3, 0.7, vBake.g + 0.4 * (fine - 0.5)));
		float worn = smoothstep(0.62, 0.74, fine * 0.6 + broad * 0.4);
		float soil = (1.0 - rock) * clamp(max(max(vBake.b * 1.4, 1.0 - smoothstep(0.78, 0.9, n.y)), 0.75 * worn), 0.0, 1.0);
		float litter = uLitter * (1.0 - rock) * smoothstep(0.3, 0.62, vBake.a * 0.8 + 0.5 * fine);

		// rock is projected from the sides, so its beds lie level across a face
		vec2 ux = vec2(p.z, -p.y) / 6.4;
		vec2 uz = vec2(p.x, -p.y) / 6.4;
		vec2 uy = p.xz / 5.2;
		float r = float(${LAYER.rock});
		vec3 rockTex = texture(uLand, vec3(ux, r)).rgb * w.x + texture(uLand, vec3(uz, r)).rgb * w.z + texture(uLand, vec3(uy, r)).rgb * w.y;
		// turf at two sizes, so the photograph does not repeat across a hillside
		vec2 ug = p.xz / 3.4;
		vec3 grassTex = mix(texture(uLand, vec3(ug, float(${LAYER.grass}))).rgb, texture(uLand, vec3(p.zx / 12.7 + 0.37, float(${LAYER.grass}))).rgb, 0.5);
		vec2 us = p.xz / 4.3;
		vec2 ul = p.xz / 3.1;

		vec3 turf = toned(grassTex, ${LAYER.grass}, mix(uGround, uGrass * (0.8 + 0.4 * broad), uGrowth), 0.5);
		vec3 col = mix(turf, toned(texture(uLand, vec3(us, float(${LAYER.soil}))).rgb, ${LAYER.soil}, uGround * 0.7, 0.6), soil);
		col = mix(col, toned(texture(uLand, vec3(ul, float(${LAYER.litter}))).rgb, ${LAYER.litter}, mix(uLeafA, uLeafB, fine) * 0.62, 0.6), 0.85 * litter);
		col = mix(col, toned(rockTex, ${LAYER.rock}, uRock * (0.85 + 0.35 * broad), 0.22), rock);

		#ifdef FINE
			// surface relief from the same photographs, in the frame each one was projected in
			vec2 bx = bump(ux, ${LAYER.rock});
			vec2 bz = bump(uz, ${LAYER.rock});
			vec2 by = bump(uy, ${LAYER.rock});
			vec3 relief = rock * 1.5 * (w.x * vec3(0.0, bx.y, bx.x) + w.z * vec3(bz.x, bz.y, 0.0) + w.y * vec3(by.x, 0.0, -by.y));
			vec2 bg = mix(bump(ug, ${LAYER.grass}), bump(ul, ${LAYER.litter}), litter);
			relief += (1.0 - rock) * 0.9 * vec3(bg.x, 0.0, -bg.y);
			n = normalize(n + relief);
		#endif

		// the bake carries the shade under each crown and in each hollow
		vec3 lit = seasonLight(n, max(dot(n, uSun), 0.0), vBake.r);
		gl_FragColor = vec4(intoSky(col * lit, vWorld), 1.0);
	}`;

const WOOD_VERTEX = /* glsl */ `
	attribute vec4 aBake;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec2 vUv;
	varying vec4 vBake;
	void main() {
		vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
		// a normal goes through the inverse of the scale, or a stretched tree is lit as if it were not
		mat3 im = mat3(instanceMatrix);
		vec3 n = normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
		vNormal = normalize(mat3(modelMatrix) * (im * n));
		vWorld = w.xyz;
		vUv = uv * float(UV_TILES);
		vBake = aBake;
		gl_Position = projectionMatrix * viewMatrix * w;
	}`;

const WOOD_FRAGMENT = /* glsl */ `
	uniform mediump sampler2DArray uLand;
	uniform mediump sampler2DArray uLandNormal;
	uniform vec3 uMean[${LAYERS}];
	uniform vec3 uBark;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec2 vUv;
	varying vec4 vBake;
	${LIGHT_GLSL}
	void main() {
		vec3 n = normalize(vNormal);
		vec3 tex = texture(uLand, vec3(vUv, float(${LAYER.bark}))).rgb / uMean[${LAYER.bark}];
		vec3 col = uBark * mix(vec3(dot(tex, vec3(0.3, 0.5, 0.2))), tex, 0.4) * (0.85 + 0.3 * vBake.b);
		#ifdef FINE
			// furrows: tilt the normal along the surface by the bark's own relief
			vec3 dx = dFdx(vWorld);
			vec3 dy = dFdy(vWorld);
			vec2 tx = dFdx(vUv);
			vec2 ty = dFdy(vUv);
			vec3 t = normalize(dx * ty.y - dy * tx.y);
			vec3 b = normalize(cross(n, t));
			vec2 m = texture(uLandNormal, vec3(vUv, float(${LAYER.bark}))).xy * 2.0 - 1.0;
			n = normalize(n + 0.9 * (t * m.x + b * m.y));
		#endif
		vec3 lit = seasonLight(n, max(dot(n, uSun), 0.0), vBake.r);
		gl_FragColor = vec4(intoSky(col * lit, vWorld), 1.0);
	}`;

const CARD_VERTEX = /* glsl */ `
	uniform float uCanopy, uBlossom, uTime;
	attribute vec2 uv1;
	attribute vec4 aBake;
	attribute vec4 aPlant;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec2 vUv;
	varying vec4 vBake;
	varying vec3 vPlant;
	void main() {
		vec3 centre = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
		// each plant leafs a little early or late, and one in blossom holds its leaves back until the petals fall
		float cover = uCanopy * (1.0 - 0.62 * uBlossom * aPlant.z) + 0.2 * (aPlant.x - 0.5);
		float shown = aBake.a > 0.5
			? smoothstep(0.0, 0.16, uBlossom * aPlant.z * 1.2 - aBake.r)
			: smoothstep(0.0, 0.14, cover - aBake.r);
		vec2 corner = (uv1 * 2.0 - 1.0) * float(CARD_REACH) * aPlant.w * shown;
		vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
		vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
		// barely moving air
		centre += 0.02 * aPlant.w * vec3(sin(uTime * 0.9 + centre.x * 0.8 + centre.y), 0.0, cos(uTime * 0.7 + centre.z * 0.8));
		vec3 w = centre + right * corner.x + up * corner.y;
		// the crown is shaded as one rounded mass, and each cluster as a small one on it
		vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
		vNormal = n + 0.45 * normalize(right * (uv1.x - 0.5) + up * (uv1.y - 0.5) + 1e-4);
		vWorld = w;
		vUv = uv;
		vBake = aBake;
		vPlant = aPlant.xyz;
		gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
	}`;

const CARD_FRAGMENT = /* glsl */ `
	uniform sampler2D uFoliage;
	uniform vec3 uLeafA, uLeafB, uLeafC, uPetal, uPetalDeep;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec2 vUv;
	varying vec4 vBake;
	varying vec3 vPlant;
	${LIGHT_GLSL}
	void main() {
		// sampled a level sharper than the size on screen asks for: leaves should stay leaves, and multisampling takes the edge off
		// small in the distance, a cluster keeps its share of the frame and does not thin to nothing
		vec2 size = vec2(textureSize(uFoliage, 0));
		float lod = max(0.0, 0.5 * log2(max(dot(dFdx(vUv * size), dFdx(vUv * size)), dot(dFdy(vUv * size), dFdy(vUv * size)))));
		vec4 t = texture2D(uFoliage, vUv, -1.0);
		float a = t.a * (1.0 + 0.5 * lod);
		a = clamp((a - 0.44) / max(fwidth(a), 0.06) + 0.5, 0.0, 1.0);
		if (a < 0.04) discard;

		vec3 col;
		if (vBake.a > 0.5) {
			// petals from near white to pink, differing by tree and by flower, with a deeper heart
			col = mix(uPetal, uPetalDeep, 0.75 * smoothstep(0.25, 0.95, fract(t.g * 0.7 + vPlant.y * 1.3)));
			col = mix(col, uPetalDeep * 0.8, 0.6 * t.b) * (0.46 + 0.56 * t.r);
		} else {
			// most of a tree is one colour of the season, some of each cluster is another, and a few leaves a third
			float k = fract(t.g * 0.45 + vBake.g * 0.25 + vPlant.y * 1.7);
			float j = fract(t.g * 3.7 + vBake.g * 1.9 + vPlant.y * 5.1);
			col = mix(uLeafA, uLeafB, smoothstep(0.35, 0.65, k));
			col = mix(col, uLeafC, smoothstep(0.66, 0.84, j));
			col *= 0.4 + 0.72 * t.r;
		}
		vec3 n = normalize(vNormal);
		// leaves pass light on: the side away from the sun is not black, and a crown seen against the sun glows
		float sun = clamp(dot(n, uSun) * 0.62 + 0.38, 0.0, 1.0);
		float through = pow(max(dot(normalize(vWorld - cameraPosition), uSun), 0.0), 3.0);
		vec3 lit = seasonLight(n, sun, vBake.b) + uKey * through * 0.5 * vec3(1.1, 1.0, 0.6) * (0.4 + 0.6 * vBake.b);
		gl_FragColor = vec4(intoSky(col * lit, vWorld), a);
	}`;

export class Grove {
	readonly root = new THREE.Group();
	private readonly shared: Uniforms;
	private readonly coarse: boolean;
	private readonly own: Uniforms;
	private readonly textures: THREE.Texture[] = [];

	/** `shared` are the environment's uniforms: season, light, sky, veil, and the shift of the return. */
	constructor(shared: Uniforms, coarse: boolean) {
		this.shared = shared;
		this.coarse = coarse;
		this.own = {
			uLand: { value: null },
			uLandNormal: { value: null },
			uFoliage: { value: null },
			uMean: { value: [] },
			uRock: { value: new THREE.Color(look.environment.cliff) },
			uPetal: { value: new THREE.Color(look.environment.petal) },
			uPetalDeep: { value: new THREE.Color(look.environment.petalDeep) },
		};
		// in winter the opening's own terrain stands here instead
		this.root.visible = false;
	}

	async load(): Promise<void> {
		const [gltf, albedo, normal, foliage] = await Promise.all([
			loadGlb('/assets/landscape.glb'),
			loadLayers('/assets/land-albedo.jpg', true),
			loadLayers('/assets/land-normal.jpg', false),
			new THREE.TextureLoader().loadAsync('/assets/foliage.png'),
		]);
		foliage.colorSpace = THREE.NoColorSpace;
		foliage.anisotropy = 4;
		foliage.flipY = false;
		this.textures.push(albedo.texture, normal.texture, foliage);
		this.own.uLand.value = albedo.texture;
		this.own.uLandNormal.value = normal.texture;
		this.own.uFoliage.value = foliage;
		this.own.uMean.value = albedo.mean;

		const extras = gltf.scene.userData as { species: string[]; uvTiles: number; cardReach: number; plants: number[][] };
		const defines: Record<string, string | number> = { UV_TILES: extras.uvTiles, CARD_REACH: extras.cardReach };
		// surface relief costs several texture reads per pixel, which a phone's fill rate should keep
		if (!this.coarse) defines.FINE = 1;
		const material = (vertexShader: string, fragmentShader: string, more: Uniforms = {}) =>
			new THREE.ShaderMaterial({ uniforms: { ...this.shared, ...this.own, ...more }, defines, vertexShader, fragmentShader, fog: false });
		const meshes = meshesOf(gltf.scene);
		gltf.scene.updateMatrixWorld(true);
		const bake = (mesh: THREE.Mesh) => {
			mesh.geometry.setAttribute('aBake', mesh.geometry.getAttribute('color'));
			mesh.geometry.deleteAttribute('color');
			return mesh;
		};

		const ground = material(BANK_VERTEX, BANK_FRAGMENT);
		for (const mesh of meshes.filter((m) => m.name.startsWith('bank_'))) {
			bake(mesh).material = ground;
			// never culled, so every bank reaches the GPU in the warm-up frame and none arrives mid-journey
			mesh.frustumCulled = false;
			mesh.renderOrder = -5;
			this.root.add(mesh);
		}

		// A touch device draws the distant mesh of every species, and leaves out a share of the plants.
		const plants = extras.plants.filter((_, i) => !this.coarse || i % 3 !== 2);
		const place = new THREE.Matrix4();
		const turn = new THREE.Quaternion();
		const up = new THREE.Vector3(0, 1, 0);
		extras.species.forEach((species, s) => {
			const bark = { uBark: { value: new THREE.Color(look.environment.bark[s]) } };
			const wood = material(WOOD_VERTEX, WOOD_FRAGMENT, bark);
			const cards = material(CARD_VERTEX, CARD_FRAGMENT);
			// edges of leaves are resolved by multisampling, not by blending, so they need no sorting
			cards.alphaToCoverage = true;
			for (const detail of [0, 1]) {
				const here = plants.filter((p) => p[0] === s && (this.coarse ? 1 : p[1]) === detail);
				if (here.length === 0) continue;
				const data = new Float32Array(here.length * 4);
				for (const [part, mat] of [['wood', wood], ['cards', cards]] as const) {
					const source = bake(meshes.find((m) => m.name === `${species}_${detail}_${part}`)!);
					const mesh = new THREE.InstancedMesh(source.geometry, mat, here.length);
					here.forEach((p, i) => {
						// the mesh is stored quantized, and its own transform restores its size
						place.compose(new THREE.Vector3(p[2], p[3], p[4]), turn.setFromAxisAngle(up, p[5]), new THREE.Vector3(p[6], p[6], p[6])).multiply(source.matrixWorld);
						mesh.setMatrixAt(i, place);
						data.set([p[7], p[8], p[9], p[6]], i * 4);
					});
					mesh.geometry.setAttribute('aPlant', new THREE.InstancedBufferAttribute(data, 4));
					if (part === 'cards') {
						// A card's alpha is only there to be turned into coverage. Left in the frame it would
						// tell the passes that follow that the leaf edges are part transparent, and they would
						// treat those pixels differently from the sky around them. So alpha is not written.
						mesh.onBeforeRender = (renderer) => renderer.getContext().colorMask(true, true, true, false);
						mesh.onAfterRender = (renderer) => renderer.getContext().colorMask(true, true, true, true);
					}
					mesh.frustumCulled = false;
					mesh.renderOrder = -5;
					this.root.add(mesh);
				}
			}
		});
	}

	dispose(): void {
		for (const t of this.textures) t.dispose();
		const materials = new Set<THREE.Material>();
		this.root.traverse((o) => {
			const m = o as THREE.Mesh;
			if (!m.geometry) return;
			m.geometry.dispose();
			materials.add(m.material as THREE.Material);
		});
		for (const m of materials) m.dispose();
	}
}
