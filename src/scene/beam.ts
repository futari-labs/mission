// The guiding light: a thin beam from the seam back through every exhibit to the installation,
// with a slow stream of motes travelling along it.
//
// The beam is a tube a few centimetres across, so on screen it is a line one or two pixels wide.
// Where the scene buffer is multisampled the tube is drawn as it is. Where it is not, a tube that
// thin breaks into steps, so the beam is drawn as a ribbon that faces the camera, is never narrower
// than the pixels can hold, and fades across its own edge: the same light, with a smooth outline.
import * as THREE from 'three';
import { tag } from './experiment.ts';
import { BEAM_Y, STATION } from './journey.ts';
import { look } from './look.ts';

export class Beam {
	readonly root = new THREE.Group();
	private readonly line: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
	private readonly ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
	private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
	private multisampled = true;
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
		this.ribbon = this.buildRibbon(material.uniforms.uColor);
		this.ribbon.position.copy(this.line.position);
		this.ribbon.visible = false;
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
		this.root.add(tag(this.line, 'shafts'), tag(this.ribbon, 'shafts'), tag(this.motes, 'particles'));
	}

	/** The beam for a buffer with one sample per pixel: a strip along the axis, turned to the camera in the vertex shader. */
	private buildRibbon(color: THREE.IUniform): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
		const segments = 96;
		const position = new Float32Array((segments + 1) * 2 * 3);
		const index: number[] = [];
		for (let i = 0; i <= segments; i++) {
			// x is the side of the strip, z how far along the beam: the same unit length the tube has
			position.set([-1, 0, -i / segments, 1, 0, -i / segments], i * 6);
			if (i < segments) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
		geometry.setIndex(index);
		const mesh = new THREE.Mesh(
			geometry,
			new THREE.ShaderMaterial({
				uniforms: { uColor: color, uRadius: { value: look.beam.radius }, uHeight: { value: 1000 } },
				transparent: true,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				side: THREE.DoubleSide,
				fog: false,
				vertexShader: /* glsl */ `
					uniform float uRadius, uHeight;
					varying float vDepth;
					varying float vAcross;
					varying float vHalf;
					varying float vPixel;
					void main() {
						vec4 centre = modelViewMatrix * vec4(0.0, 0.0, position.z, 1.0);
						vec3 axis = normalize((modelViewMatrix * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
						// across the beam and across the line of sight, so the strip always shows its face
						vec3 side = cross(axis, centre.xyz);
						float l = length(side);
						side = l > 1e-5 ? side / l : vec3(1.0, 0.0, 0.0);
						vDepth = -centre.z;
						// what one rendered pixel spans at this depth
						vPixel = 2.0 * max(vDepth, 0.05) / (projectionMatrix[1][1] * uHeight);
						// the tube's own radius, or three quarters of a pixel where the tube would be thinner than that
						vHalf = max(uRadius, 0.75 * vPixel);
						vAcross = position.x * (vHalf + vPixel);
						gl_Position = projectionMatrix * vec4(centre.xyz + side * vAcross, 1.0);
					}`,
				fragmentShader: /* glsl */ `
					uniform vec3 uColor;
					uniform float uRadius;
					varying float vDepth;
					varying float vAcross;
					varying float vHalf;
					varying float vPixel;
					void main() {
						float a = smoothstep(2.5, 11.0, vDepth) * exp(-vDepth * 0.016);
						// one pixel of fade across the edge, and where the strip was widened, less light per pixel: the same light in all
						float cover = clamp((vHalf - abs(vAcross)) / vPixel + 0.5, 0.0, 1.0) * uRadius / vHalf;
						gl_FragColor = vec4(uColor * a * cover, a);
					}`,
			}),
		);
		mesh.frustumCulled = false;
		return mesh;
	}

	/** Which form the beam takes: the tube where the scene buffer is multisampled, the ribbon where it is not. */
	setMultisampled(on: boolean): void {
		this.multisampled = on;
	}

	/** The height of the drawing buffer in pixels, from which the ribbon knows how wide a pixel is. */
	setBufferHeight(pixels: number): void {
		this.ribbon.material.uniforms.uHeight.value = pixels;
	}

	update(reveal: number, time: number): void {
		const length = Math.max(0.001, reveal * this.length);
		const shown = reveal > 0.001;
		this.line.scale.z = this.ribbon.scale.z = length;
		this.line.visible = shown && this.multisampled;
		this.ribbon.visible = shown && !this.multisampled;
		this.motes.visible = shown;
		this.motes.material.uniforms.uTime.value = time;
		this.motes.material.uniforms.uLength.value = length;
	}

	dispose(): void {
		this.line.geometry.dispose();
		this.line.material.dispose();
		this.ribbon.geometry.dispose();
		this.ribbon.material.dispose();
		this.motes.geometry.dispose();
		this.motes.material.dispose();
	}
}
