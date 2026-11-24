// The solid materials: one stone family for the landmark, the exhibits, and the opening's landscape,
// and the timber and bronze of the exhibits. All read baked vertex data (occlusion, wear or snow,
// tint) and add tiling grain by position, so no mesh needs UVs.
import * as THREE from 'three';
import { look } from './look.ts';

export const stoneUniforms = {
	uDetail: { value: null as THREE.Texture | null },
	uLoosen: { value: 0 },
	/** Brightness of the light inside the landmark's joints. */
	uJoint: { value: 0 },
	uJointColor: { value: new THREE.Color(look.seam.color) },
};

/** Turns the grayscale grain height map into a texture with a normal in RG and height in B. */
export async function loadDetailTexture(url: string): Promise<THREE.DataTexture> {
	const image = await new THREE.ImageLoader().loadAsync(url);
	const size = image.width;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(image, 0, 0);
	const src = ctx.getImageData(0, 0, size, size).data;
	const out = new Uint8Array(size * size * 4);
	const h = (x: number, y: number) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const dx = (h(x + 1, y) - h(x - 1, y)) * 3.2;
			const dy = (h(x, y + 1) - h(x, y - 1)) * 3.2;
			const l = Math.hypot(dx, dy, 1);
			const i = (y * size + x) * 4;
			out[i] = Math.round((-dx / l) * 127.5 + 127.5);
			out[i + 1] = Math.round((-dy / l) * 127.5 + 127.5);
			out[i + 2] = src[i];
			out[i + 3] = 255;
		}
	const texture = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = 8;
	texture.needsUpdate = true;
	return texture;
}

const VERTEX_PARS = /* glsl */ `
attribute vec4 aBake;
varying vec4 vBake;
varying vec3 vWPos;
varying vec3 vOPos;
varying vec3 vWNormal;`;

const VERTEX_MAIN = /* glsl */ `
vBake = aBake;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vOPos = transformed;
vWNormal = normalize(mat3(modelMatrix) * objectNormal);`;

const FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uDetail;
uniform float uLoosen;
uniform float uJoint;
uniform float uVeil;
uniform vec3 uJointColor;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uCover;
uniform vec4 uGrain;
varying vec4 vBake;
varying vec3 vWPos;
varying vec3 vOPos;
varying vec3 vWNormal;
void fDetail(vec3 p, vec3 w, out float h, out vec3 off) {
	vec4 a = texture2D(uDetail, p.zy);
	vec4 b = texture2D(uDetail, p.xz);
	vec4 c = texture2D(uDetail, p.xy);
	h = a.b * w.x + b.b * w.y + c.b * w.z;
	vec2 na = a.rg * 2.0 - 1.0;
	vec2 nb = b.rg * 2.0 - 1.0;
	vec2 nc = c.rg * 2.0 - 1.0;
	off = vec3(0.0, na.y, na.x) * w.x + vec3(nb.x, 0.0, nb.y) * w.y + vec3(nc.x, nc.y, 0.0) * w.z;
}`;

const SHARED_ALBEDO = /* glsl */ `
vec3 fN = normalize(vWNormal);
vec3 fW = pow(abs(fN), vec3(4.0));
fW /= fW.x + fW.y + fW.z;
float fH1; vec3 fO1; fDetail(vWPos * SCALE_A, fW, fH1, fO1);
float fH2; vec3 fO2; fDetail(vWPos * SCALE_B, fW, fH2, fO2);
float fGrain = fH1 * 0.62 + fH2 * 0.38;`;

// Landmark and exhibits: stone with lighter worn edges and frost on faces that look up.
const BRIDGE_ALBEDO = /* glsl */ `
${SHARED_ALBEDO}
float fAo = mix(vBake.r, vBake.g, uLoosen);
float fEdge = smoothstep(0.62, 0.92, vBake.b);
float fCrease = smoothstep(0.47, 0.25, vBake.b);
vec3 fStone = mix(uColA, uColB, smoothstep(0.25, 0.8, fGrain)) * (0.93 + 0.14 * fH1);
fStone = mix(fStone, uColB * 1.1, fEdge * 0.4);
float fFrost = uCover * clamp(smoothstep(0.3, 0.86, fN.y + (fGrain - 0.5) * 0.7) * 0.9 + fEdge * 0.1 + fCrease * 0.2 * step(0.0, fN.y), 0.0, 1.0);
diffuseColor.rgb = mix(fStone, uColC, fFrost) * mix(1.0, fAo, 0.4);
float fRough = mix(0.93, 0.7, fFrost) - 0.1 * (fGrain - 0.5);`;

// Landscape: snow on gentle slopes, rock where it is steep, darker in hollows.
const TERRAIN_ALBEDO = /* glsl */ `
${SHARED_ALBEDO}
float fAo = vBake.r;
float fSnow = smoothstep(0.36, 0.6, vBake.g + (fH1 - 0.5) * 0.8 + (fH2 - 0.5) * 0.55);
vec3 fRock = mix(uColA, uColB, smoothstep(0.3, 0.7, fH2 * 0.7 + fH1 * 0.3));
vec3 fGround = mix(fRock, uColC * (0.9 + 0.2 * vBake.a) * (0.94 + 0.12 * fH2), fSnow);
diffuseColor.rgb = fGround * clamp(0.5 + 1.0 * vBake.b, 0.5, 1.22) * mix(1.0, fAo, 0.5);
float fRough = mix(0.96, 0.82, fSnow);
fO1 *= mix(1.7, 1.0, fSnow);
fO2 *= mix(1.9, 1.0, fSnow);`;

// Timber: fibres run along the piece, so the grain is laid out in the part's own space and stays
// with it while it travels. Faces that the weather reaches, and worn edges, go pale and grey.
const TIMBER_ALBEDO = /* glsl */ `
vec3 fN = normalize(vWNormal);
vec3 fAxis = uGrain.w > 0.5 ? normalize(vec3(-vOPos.z, 0.0, vOPos.x)) : normalize(uGrain.xyz);
float fAlong = dot(vOPos, fAxis);
vec3 fAcross = vOPos - fAxis * fAlong;
vec2 fQ = vec2(dot(fAcross, vec3(0.61, 0.33, 0.72)), dot(fAcross, vec3(-0.5, 0.8, 0.31)));
float fGrain = texture2D(uDetail, vec2(fQ.x * 2.3 + fQ.y * 1.1, fAlong * 0.13)).b * 0.6 + texture2D(uDetail, vec2(fQ.y * 6.1 - fQ.x * 2.0, fAlong * 0.46 + 0.3)).b * 0.4;
vec3 fO1 = vec3(0.0);
vec3 fO2 = vec3(0.0);
float fAo = mix(vBake.r, vBake.g, uLoosen);
float fEdge = smoothstep(0.6, 0.9, vBake.b);
vec3 fWood = mix(uColA, uColB, smoothstep(0.32, 0.72, fGrain));
fWood = mix(fWood, uColC, uCover * clamp(0.5 * fEdge + 0.4 * smoothstep(0.15, 0.9, fN.y) + 0.5 * (fGrain - 0.5), 0.0, 0.75));
diffuseColor.rgb = fWood * mix(1.0, fAo, 0.6);
float fRough = 0.8 - 0.16 * (fGrain - 0.5);`;

// Bronze: dark where it has weathered, bright where edges are handled and rubbed.
const METAL_ALBEDO = /* glsl */ `
${SHARED_ALBEDO}
float fAo = mix(vBake.r, vBake.g, uLoosen);
float fEdge = smoothstep(0.58, 0.88, vBake.b);
vec3 fMetal = mix(mix(uColA, uColB, smoothstep(0.3, 0.75, fGrain)), uColC, uCover * fEdge);
// the fourth bake channel marks a face polished to a mirror
fMetal = mix(fMetal, vec3(0.9), vBake.a);
diffuseColor.rgb = fMetal * mix(1.0, fAo, 0.5);
float fRough = mix(mix(0.62, 0.34, fEdge) + 0.2 * (fGrain - 0.5), 0.06, vBake.a);
fO1 *= 0.35;
fO2 *= 0.25;`;

export type StoneKind = 'landmark' | 'terrain' | 'timber' | 'metal';

/** What may differ between two materials of one kind: its three tones, and how much of the third lies on it. */
export interface Tone {
	/** Base dark, base light, and the cover: frost, lichen, weathering, or polish, by kind. */
	colors: readonly [string, string, string];
	cover: number;
	/** Timber only: the grain's direction in the part's own space, or 'around' the vertical axis. */
	grain?: readonly [number, number, number] | 'around';
}

/** Uniforms a single material may own instead of sharing the landmark's. */
export interface StoneOverrides {
	/** 1 uses the mesh's own occlusion, 0 the occlusion baked with its neighbours in place. */
	uLoosen?: { value: number };
	uJoint?: { value: number };
	/** 1 hides the mesh in the fog behind it. */
	uVeil?: { value: number };
}

const NO_VEIL = { value: 0 };

export function createStoneMaterial(kind: StoneKind, own: StoneOverrides = {}, tone?: Tone): THREE.MeshStandardMaterial {
	const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: kind === 'metal' ? 0.85 : 0 });
	const stone = kind !== 'terrain';
	const colors = tone?.colors ?? (stone ? [look.stone.dark, look.stone.light, look.stone.frost] : [look.ground.rockDark, look.ground.rockLight, look.ground.snow]);
	const albedo = { landmark: BRIDGE_ALBEDO, terrain: TERRAIN_ALBEDO, timber: TIMBER_ALBEDO, metal: METAL_ALBEDO }[kind];
	const grain = tone?.grain;
	material.defines = { SCALE_A: stone ? '0.55' : '0.31', SCALE_B: stone ? '2.4' : '1.7', ...(stone ? { FOG_SCALE: '0.82' } : {}) };
	material.customProgramCacheKey = () => `futari-stone-${kind}`;
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uDetail = stoneUniforms.uDetail;
		shader.uniforms.uLoosen = own.uLoosen ?? stoneUniforms.uLoosen;
		shader.uniforms.uJoint = own.uJoint ?? stoneUniforms.uJoint;
		shader.uniforms.uVeil = own.uVeil ?? NO_VEIL;
		shader.uniforms.uJointColor = stoneUniforms.uJointColor;
		shader.uniforms.uColA = { value: new THREE.Color(colors[0]) };
		shader.uniforms.uColB = { value: new THREE.Color(colors[1]) };
		shader.uniforms.uColC = { value: new THREE.Color(colors[2]) };
		shader.uniforms.uCover = { value: tone?.cover ?? 1 };
		shader.uniforms.uGrain = { value: grain === 'around' ? new THREE.Vector4(0, 1, 0, 1) : new THREE.Vector4(...(grain ?? [0, 1, 0]), 0) };
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
			.replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_MAIN}`);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
			.replace('#include <map_fragment>', `#include <map_fragment>\n${albedo}`)
			.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(fRough, 0.05, 1.0);')
			.replace(
				'#include <normal_fragment_maps>',
				`#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(normalize(fN + ${stone ? '0.5' : '0.85'} * fO1 + ${stone ? '0.38' : '0.6'} * fO2), 0.0)).xyz);`,
			)
			// light inside the joints: the bake marks where, the landmark sets how bright
			.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${stone ? 'totalEmissiveRadiance += uJointColor * (uJoint * smoothstep(0.22, 0.95, vBake.a));' : ''}`)
			.replace('#include <fog_fragment>', '#include <fog_fragment>\n#ifdef USE_FOG\ngl_FragColor.rgb = mix(gl_FragColor.rgb, futariSky(fogVec / max(fogDist, 1e-4), fogColor), uVeil);\n#endif')
			.replace(
				'#include <aomap_fragment>',
				'#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= fAo;\nreflectedLight.indirectSpecular *= fAo;\nreflectedLight.directDiffuse *= mix(1.0, fAo, 0.5);',
			);
	};
	return material;
}

/** The exported meshes carry their bake in COLOR_0. Rename it so three.js does not tint with it. */
export function adoptBake(geometry: THREE.BufferGeometry): void {
	const bake = geometry.getAttribute('color');
	if (!bake) return;
	geometry.setAttribute('aBake', bake);
	geometry.deleteAttribute('color');
}
