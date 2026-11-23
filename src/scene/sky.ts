// Sky gradient and fog. The fog fades every surface into the sky color that lies behind it,
// so distant ridges dissolve into the gradient instead of into one flat color.
import * as THREE from 'three';

const SKY_GLSL = /* glsl */ `
vec3 futariSky(vec3 d, vec3 base) {
	float up = clamp(d.y * 2.2 + 0.08, 0.0, 1.0);
	vec3 c = mix(base, base * vec3(1.13, 1.135, 1.14) + vec3(0.035), smoothstep(0.0, 1.0, up));
	float glow = pow(max(dot(d, normalize(vec3(0.55, 0.3, -0.78))), 0.0), 5.0);
	c += vec3(0.085, 0.09, 0.1) * glow;
	c *= 1.0 - 0.1 * smoothstep(0.0, -0.35, d.y);
	return c;
}`;

let installed = false;

/** Replaces the fog chunks of three.js once, before any material compiles. */
export function installFog(): void {
	if (installed) return;
	installed = true;
	THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
	varying vec3 vFogWorld;
#endif`;
	THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogWorld = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
	THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform float fogDensity;
	varying vec3 vFogWorld;
	#ifndef FOG_SCALE
		#define FOG_SCALE 1.0
	#endif
	${SKY_GLSL}
#endif`;
	THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	vec3 fogVec = vFogWorld - cameraPosition;
	float fogDist = length(fogVec);
	float fogThin = mix(0.5, 1.0, exp(-max(vFogWorld.y, 0.0) * 0.024));
	float fogFactor = 1.0 - exp(-pow(fogDensity * fogDist * fogThin * FOG_SCALE, 1.55));
	gl_FragColor.rgb = mix(gl_FragColor.rgb, futariSky(fogVec / max(fogDist, 1e-4), fogColor), fogFactor);
#endif`;
}

export function createSky(fog: THREE.FogExp2): THREE.Mesh {
	const material = new THREE.ShaderMaterial({
		uniforms: { fogColor: { value: fog.color } },
		vertexShader: /* glsl */ `
			varying vec3 vDir;
			void main() {
				vDir = position;
				vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
				gl_Position = p.xyww;
			}`,
		fragmentShader: /* glsl */ `
			uniform vec3 fogColor;
			varying vec3 vDir;
			${SKY_GLSL}
			void main() { gl_FragColor = vec4(futariSky(normalize(vDir), fogColor), 1.0); }`,
		side: THREE.BackSide,
		depthWrite: false,
		depthTest: false,
		fog: false,
	});
	const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
	sky.renderOrder = -10;
	sky.frustumCulled = false;
	return sky;
}
