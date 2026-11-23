// The guiding light: a thin beam from the seam back through every exhibit to the installation,
// with a slow stream of motes travelling along it.
import * as THREE from 'three';
import { BEAM_Y, STATION } from './journey.ts';
import { look } from './look.ts';

export class Beam {
	readonly root = new THREE.Group();
	private readonly line: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
	private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
	/** The beam stops short of the installation. From there the light travels as particles. */
	private readonly length = -STATION.explore.z - 27;

	constructor(count: number) {
		const geometry = new THREE.CylinderGeometry(look.beam.radius, look.beam.radius, 1, 6, 1, true);
		geometry.rotateX(Math.PI / 2).translate(0, 0, -0.5);
		const material = new THREE.ShaderMaterial({
			uniforms: { uColor: { value: new THREE.Color(look.seam.color).multiplyScalar(look.beam.brightness) } },
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			fog: false,
			vertexShader: /* glsl */ `
				varying float vDepth;
				void main() {
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					vDepth = -mv.z;
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: /* glsl */ `
				uniform vec3 uColor;
				varying float vDepth;
				void main() {
					// faint beside the camera, strongest a few metres ahead, fading with distance
					float a = smoothstep(2.5, 11.0, vDepth) * exp(-vDepth * 0.016);
					gl_FragColor = vec4(uColor * a, a);
				}`,
		});
		this.line = new THREE.Mesh(geometry, material);
		this.line.position.set(0, BEAM_Y, 0);
		const seed = new Float32Array(count);
		for (let i = 0; i < count; i++) seed[i] = Math.random();
		const points = new THREE.BufferGeometry();
		points.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
		points.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
		this.motes = new THREE.Points(
			points,
			new THREE.ShaderMaterial({
				uniforms: { uTime: { value: 0 }, uLength: { value: 0 }, uY: { value: BEAM_Y } },
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				fog: false,
				vertexShader: /* glsl */ `
					uniform float uTime, uLength, uY;
					attribute float aSeed;
					varying float vAlpha;
					void main() {
						float travel = fract(aSeed * 13.7 + uTime * (0.012 + 0.02 * fract(aSeed * 71.3)));
						float angle = aSeed * 190.0 + travel * 9.0;
						float radius = 0.04 + 0.42 * fract(aSeed * 37.1) * fract(aSeed * 37.1);
						vec3 p = vec3(cos(angle) * radius, uY + sin(angle) * radius, -travel * uLength);
						vec4 mv = viewMatrix * vec4(p, 1.0);
						float d = -mv.z;
						gl_Position = projectionMatrix * mv;
						gl_PointSize = clamp(projectionMatrix[1][1] * 22.0 / d, 0.8, 5.0);
						vAlpha = 0.8 * smoothstep(0.5, 2.5, d) * exp(-d * 0.045) * step(0.01, uLength);
					}`,
				fragmentShader: /* glsl */ `
					varying float vAlpha;
					void main() {
						float r = length(gl_PointCoord - 0.5);
						gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * 1.6, vAlpha * smoothstep(0.5, 0.05, r));
					}`,
			}),
		);
		this.motes.frustumCulled = false;
		this.root.add(this.line, this.motes);
	}

	update(reveal: number, time: number): void {
		const length = Math.max(0.001, reveal * this.length);
		this.line.scale.z = length;
		this.line.visible = reveal > 0.001;
		this.motes.visible = this.line.visible;
		this.motes.material.uniforms.uTime.value = time;
		this.motes.material.uniforms.uLength.value = length;
	}

	dispose(): void {
		this.line.geometry.dispose();
		this.line.material.dispose();
		this.motes.geometry.dispose();
		this.motes.material.dispose();
	}
}
