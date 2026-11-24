// The transition vocabulary as one post-processing effect: a frost front that rises with block
// displacement and a color fringe along its edge, a white-out for passing through the seam,
// and a dim for the project dialog. Every strength is a uniform that rests at 0.
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { type Color, Uniform } from 'three';

const fragment = /* glsl */ `
uniform float uFrost;
uniform float uFront;
uniform float uWhite;
uniform float uDim;
uniform float uClock;
uniform vec3 uFog;

float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
	vec3 col = inputColor.rgb;
	if (uFrost > 0.002) {
		float n = tNoise(uv * vec2(5.0, 3.0) + uClock * 0.04) * 0.65 + tNoise(uv * vec2(17.0, 10.0)) * 0.35;
		float edge = uFront + (n - 0.5) * 0.34;
		float below = smoothstep(edge + 0.03, edge - 0.2, uv.y);
		float band = smoothstep(0.24, 0.0, abs(uv.y - edge));
		float cellHash = tHash(floor(uv * vec2(44.0, 25.0)));
		vec2 shifted = uv + vec2((cellHash - 0.5) * 0.07, 0.0) * band * uFrost * step(0.5, cellHash);
		float fringe = 0.0055 * band * uFrost;
		col = vec3(texture2D(inputBuffer, shifted + vec2(fringe, 0.0)).r, texture2D(inputBuffer, shifted).g, texture2D(inputBuffer, shifted - vec2(fringe, 0.0)).b);
		float crystals = 0.78 + 0.22 * tNoise(uv * vec2(160.0, 90.0));
		col = mix(col, uFog * 1.03, clamp(below * uFrost * crystals * 1.25, 0.0, 1.0));
	}
	col = mix(col, vec3(1.18, 1.22, 1.3), uWhite);
	col = mix(col, col * 0.16 + vec3(0.012, 0.016, 0.026), uDim);
	outputColor = vec4(col, inputColor.a);
}`;

export class TransitionEffect extends Effect {
	constructor(fog: Color) {
		super('TransitionEffect', fragment, {
			blendFunction: BlendFunction.NORMAL,
			attributes: EffectAttribute.CONVOLUTION,
			uniforms: new Map<string, Uniform>([
				['uFrost', new Uniform(0)],
				['uFront', new Uniform(0)],
				['uWhite', new Uniform(0)],
				['uDim', new Uniform(0)],
				['uClock', new Uniform(0)],
				['uFog', new Uniform(fog)],
			]),
		});
	}

	set(frost: number, front: number, white: number, dim: number, clock: number): void {
		this.uniforms.get('uFrost')!.value = frost;
		this.uniforms.get('uFront')!.value = front;
		this.uniforms.get('uWhite')!.value = white;
		this.uniforms.get('uDim')!.value = dim;
		this.uniforms.get('uClock')!.value = clock;
	}
}
