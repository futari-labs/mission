// The two project exhibits and the shared pieces of the later chapters. They come from one GLB.
//
// Each exhibit is a set of rigid parts of stone, timber, and bronze, standing in the open on its own
// outcrop. Every part has a seated pose and an authored start pose, and `assemble` places it between
// the two for a given amount of assembly. What happens once the structure stands is each exhibit's
// own: the arbor's climber grows through it, and the instrument brings its light to a focus.
// Nothing accumulates: the same input always gives the same result.
import * as THREE from 'three';
import { loadGlb, meshesOf } from './assets.ts';
import { STATION } from './journey.ts';
import { look } from './look.ts';
import { adoptBake, createStoneMaterial, type Tone } from './materials.ts';
import { SKY_GLSL } from './sky.ts';
import type { Grove } from './vegetation.ts';

/** What the asset build writes on every movable part. See tools/assets/shape.ts. */
interface PartExtras {
	group: string;
	pivot: [number, number, number];
	from: [number, number, number];
	axis: [number, number, number];
	angle: number;
	window: [number, number];
	substance: 'stone' | 'soil' | 'slate' | 'timber' | 'metal' | 'glass';
	grain?: [number, number, number] | 'around';
	/** The name of a part this one is carried by. */
	rides?: string;
}

interface Part {
	name: string;
	rides?: string;
	holder: THREE.Group;
	home: THREE.Vector3;
	from: THREE.Vector3;
	axis: THREE.Vector3;
	angle: number;
	window: [number, number];
	/** 1 away from its seat, 0 seated. Blends the part's own shading with the assembled shading. */
	apart: { value: number };
}

type Tones = Record<'stone' | 'soil' | 'timber' | 'metal', Tone>;
type Uniforms = Record<string, THREE.IUniform>;
/** Makes the material of one part. `apart` is 1 while the part is away from its seat. */
type Maker = (extras: PartExtras, name: string, apart: { value: number }) => THREE.Material;

/** Stone, soil, timber, and bronze in the tones of one season. */
const solid =
	(tones: Tones): Maker =>
	(extras, _name, apart) => {
		const own = { uLoosen: apart };
		if (extras.substance === 'timber') return createStoneMaterial('timber', own, { ...tones.timber, grain: extras.grain });
		if (extras.substance === 'metal') return createStoneMaterial('metal', own, tones.metal);
		return createStoneMaterial('landmark', own, extras.substance === 'soil' ? tones.soil : tones.stone);
	};

const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class Exhibit {
	readonly root = new THREE.Group();
	/** Kept in the scene at all times so the light count is constant. See Landmark.lights. */
	readonly glow: THREE.PointLight;
	readonly materials: THREE.Material[] = [];
	protected readonly body = new THREE.Group();
	protected readonly core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
	/** Where the pointer is, damped. The foundations never move for it: only light and loose parts do. */
	protected readonly turn = new THREE.Vector2();
	protected readonly phase: number;
	/** 0 while the structure is going up, 1 once it stands: how far its light has come on. */
	protected lit = 1;
	private readonly parts: Part[] = [];
	private readonly brightness: number;

	constructor(station: THREE.Vector3, parts: THREE.Mesh[], heart: THREE.Vector3, make: Maker, brightness: number) {
		this.phase = station.z;
		this.brightness = brightness;
		this.root.position.copy(station);
		for (const mesh of parts) {
			const extras = mesh.userData as PartExtras;
			const apart = { value: 0 };
			mesh.material = make(extras, mesh.name, apart);
			this.materials.push(mesh.material);
			const home = new THREE.Vector3(...extras.pivot);
			const holder = new THREE.Group();
			mesh.position.sub(home);
			holder.add(mesh);
			this.body.add(holder);
			this.parts.push({ name: mesh.name, rides: extras.rides, holder, home, from: new THREE.Vector3(...extras.from), axis: new THREE.Vector3(...extras.axis).normalize(), angle: extras.angle, window: extras.window, apart });
		}
		// a part that rides another is held by it, and makes its own move from there
		for (const p of this.parts) {
			const carrier = this.parts.find((c) => c.name === p.rides);
			if (!carrier) continue;
			carrier.holder.add(p.holder);
			p.home.sub(carrier.home);
		}
		this.core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.seam.color).multiplyScalar(6), fog: false }));
		this.core.position.copy(heart);
		this.glow = new THREE.PointLight(look.seam.color, brightness, 7, 2);
		this.glow.position.copy(station).add(heart);
		this.body.add(this.core);
		this.root.add(this.body);
	}

	/**
	 * Places every part for `amount` of assembly, 0 to 1. `finish`, 0 to 1, is what follows once the
	 * structure stands. A part's window runs on the two laid end to end, so one that moves from 1.1
	 * to 1.6 does so during the finish. The light at the heart comes on as the last parts seat.
	 */
	assemble(amount: number, finish: number): void {
		const progress = amount + finish;
		for (const p of this.parts) {
			const t = ease(THREE.MathUtils.clamp((progress - p.window[0]) / (p.window[1] - p.window[0]), 0, 1));
			const away = 1 - t;
			p.holder.position.copy(p.home).addScaledVector(p.from, away);
			// the turn resolves a little before the part lands, so it seats square
			p.holder.quaternion.setFromAxisAngle(p.axis, p.angle * Math.max(0, away * 1.25 - 0.25));
			p.apart.value = away;
		}
		this.lit = THREE.MathUtils.smoothstep(amount, 0.88, 1);
		this.core.visible = this.lit > 0.01;
		this.core.scale.setScalar(0.4 + 0.6 * this.lit);
		this.complete(finish);
	}

	/** What the exhibit does once it stands, for `finish` from 0 to 1. */
	protected complete(_finish: number): void {}

	/** `pointer` is in normalized device coordinates, or null when the pointer is away. */
	update(dt: number, pointer: THREE.Vector2 | null, time: number): void {
		const k = 1 - Math.exp(-dt * 3);
		this.turn.x += ((pointer ? pointer.x : 0) - this.turn.x) * k;
		this.turn.y += ((pointer ? pointer.y : 0) - this.turn.y) * k;
		// the light breathes, and answers the pointer a little
		const pulse = 1 + 0.06 * Math.sin(time * 1.6 + this.phase);
		this.glow.intensity = this.brightness * this.lit * pulse * (1 + 0.5 * Math.hypot(this.turn.x, this.turn.y));
	}

	set visible(v: boolean) {
		this.root.visible = v;
		if (!v) this.glow.intensity = 0;
	}
}

/** Futari Engineering: the frame goes up, and then the climber planted at its foot grows through it and flowers. */
class Arbor extends Exhibit {
	private readonly growth = { uStem: { value: 2 }, uCanopy: { value: 2 }, uBlossom: { value: 1 }, uHold: { value: 0 } };

	constructor(parts: THREE.Mesh[], climber: { wood: THREE.Mesh; cards: THREE.Mesh }, flora: Grove) {
		super(STATION.engineering, parts, new THREE.Vector3(0, 0, 0), solid(look.exhibit.spring), look.exhibit.glow.engineering);
		const plant = flora.plant(climber.wood, climber.cards, look.exhibit.climber, this.growth);
		for (const mesh of plant.children) this.materials.push((mesh as THREE.Mesh).material as THREE.Material);
		this.body.add(plant);
		this.assemble(1, 1);
	}

	protected override complete(growth: number): void {
		// stems first, each leaf soon after the stem reaches it, and the flowers once most of it is green
		this.growth.uStem.value = growth / 0.6;
		this.growth.uCanopy.value = (growth - 0.05) / 0.6;
		this.growth.uBlossom.value = THREE.MathUtils.smoothstep(growth, 0.5, 1);
	}
}

// A shaft of light as a tapering tube that is brightest where the eye looks through its middle.
const SHAFT_VERTEX = /* glsl */ `
	uniform vec3 uFrom, uTo;
	uniform vec2 uRadius;
	varying vec3 vOut;
	varying vec3 vWorld;
	varying float vAlong;
	void main() {
		vec3 axis = uTo - uFrom;
		vec3 a = normalize(axis);
		vec3 b = normalize(cross(a, abs(a.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
		vec3 out3 = b * position.x + cross(a, b) * position.z;
		vec4 w = modelMatrix * vec4(uFrom + axis * position.y + out3 * mix(uRadius.x, uRadius.y, position.y), 1.0);
		vOut = mat3(modelMatrix) * out3;
		vWorld = w.xyz;
		vAlong = position.y;
		gl_Position = projectionMatrix * viewMatrix * w;
	}`;
const SHAFT_FRAGMENT = /* glsl */ `
	uniform vec3 uColor;
	uniform float uPower;
	varying vec3 vOut;
	varying vec3 vWorld;
	varying float vAlong;
	void main() {
		float through = abs(dot(normalize(vOut), normalize(vWorld - cameraPosition)));
		gl_FragColor = vec4(uColor * (uPower * pow(through, 1.7) * smoothstep(0.0, 0.12, vAlong)), 1.0);
	}`;

// Still water in the basin: it shows the sky by how shallow the eye's angle is, the piers standing
// in it as dark bars, and the stone under it where the eye looks down.
const WATER_VERTEX = /* glsl */ `
	varying vec3 vWorld;
	varying vec2 vPlace;
	void main() {
		vec4 w = modelMatrix * vec4(position, 1.0);
		vWorld = w.xyz;
		vPlace = position.xz;
		gl_Position = projectionMatrix * viewMatrix * w;
	}`;
const WATER_FRAGMENT = /* glsl */ `
	uniform sampler2D uNoise;
	uniform vec3 uFogColor, uSun, uKey, uBed, uGlowColor, uGrass;
	uniform vec4 uPiers;
	uniform float uTime, uGlow;
	varying vec3 vWorld;
	varying vec2 vPlace;
	${SKY_GLSL}
	void main() {
		vec3 view = normalize(vWorld - cameraPosition);
		// barely moving: two slow layers of ripple tilt the surface a little
		vec2 tilt = vec2(texture2D(uNoise, vPlace * 0.33 + uTime * vec2(0.011, 0.007)).r, texture2D(uNoise, vPlace * 0.33 + 0.5 - uTime * vec2(0.008, 0.012)).r) - 0.5;
		vec3 n = normalize(vec3(tilt.x * 0.16, 1.0, tilt.y * 0.16));
		vec3 r = reflect(view, n);
		float mirror = 0.03 + 0.97 * pow(1.0 - max(dot(-view, n), 0.0), 5.0);
		vec3 seen = futariSky(r, uFogColor);
		// low on the water the far banks show, darker than the sky above them
		seen = mix(seen, uGrass * 0.55, 0.6 * (1.0 - smoothstep(0.015, 0.11, r.y + tilt.x * 0.06)));
		// what stands in the water is seen in it: follow the reflected ray to the plane the piers stand in
		float t = (uPiers.z - vPlace.y) / r.z;
		float across = abs(abs(vPlace.x + r.x * t) - uPiers.x);
		seen = mix(seen, uBed * 0.5, step(0.0, t) * (1.0 - smoothstep(uPiers.y * 0.7, uPiers.y * 1.3, across)) * (1.0 - smoothstep(0.6, uPiers.w, r.y * t)));
		// the sun on the ripples, and the instrument's own light when it is brought to a point
		seen += uKey * 5.0 * pow(max(dot(r, uSun), 0.0), 240.0);
		seen += uKey * 1.3 * pow(max(texture2D(uNoise, vPlace * 2.1 + uTime * vec2(0.02, -0.013)).r - 0.6, 0.0) * 3.0, 3.0);
		seen += uGlowColor * uGlow * 0.5 * exp(-2.2 * dot(vPlace, vPlace));
		vec3 bed = uBed * (0.55 + 0.25 * texture2D(uNoise, vPlace * 0.9).r) * (0.5 + 0.5 * uKey);
		gl_FragColor = vec4(mix(bed, seen, mirror), 1.0);
	}`;

/** Kensaku: the instrument is set up, and then its mirror is turned to the sun, its iris opens, and the light comes to a point on one result. */
class Instrument extends Exhibit {
	private readonly point: { value: number };
	private readonly glare: { value: number };
	private readonly shafts: THREE.ShaderMaterial[] = [];
	private readonly water: THREE.ShaderMaterial;
	private readonly geometries: THREE.BufferGeometry[] = [];

	constructor(parts: THREE.Mesh[], shared: Uniforms, sky: THREE.Texture) {
		const o = look.exhibit.optics;
		// how far the light has come to a point, and how squarely the mirror has the sun
		const point = { value: 1 };
		const glare = { value: 1 };
		const tones = look.exhibit.summer;
		const plain = solid(tones);
		const make: Maker = (extras, name, apart) => {
			const own = { uLoosen: apart };
			if (extras.substance === 'glass') return createLens(point, sky);
			// the chosen line of the first plate lights with the focus, and the mirror's face with the sun on it
			if (extras.substance === 'slate') return createStoneMaterial('landmark', { ...own, uJoint: point }, tones.slate);
			const material = name.endsWith('mirror') ? createStoneMaterial('metal', { ...own, uJoint: glare }, tones.metal) : plain(extras, name, apart);
			// bronze shows the sky it stands under, which is the summer one
			if (extras.substance === 'metal') Object.assign(material, { envMap: sky, envMapIntensity: 1.25 });
			return material;
		};
		super(STATION.kensaku, parts, new THREE.Vector3(...o.point), make, look.exhibit.glow.kensaku);
		this.point = point;
		this.glare = glare;

		const tube = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0);
		this.geometries.push(tube);
		// from the mirror up into the lens, and from the lens down to its point on the first plate
		for (const [from, to, colour] of [[o.mirror, o.lensFront, o.sun], [o.lensBack, o.point, look.seam.color]] as const) {
			const material = new THREE.ShaderMaterial({
				uniforms: { uFrom: { value: new THREE.Vector3(...from) }, uTo: { value: new THREE.Vector3(...to) }, uRadius: { value: new THREE.Vector2(0.26, 0.34) }, uColor: { value: new THREE.Color(colour) }, uPower: { value: 0 } },
				vertexShader: SHAFT_VERTEX,
				fragmentShader: SHAFT_FRAGMENT,
				blending: THREE.AdditiveBlending,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide,
				fog: false,
			});
			const mesh = new THREE.Mesh(tube, material);
			mesh.frustumCulled = false;
			mesh.renderOrder = 3;
			this.shafts.push(material);
			this.materials.push(material);
			this.body.add(mesh);
		}

		this.water = new THREE.ShaderMaterial({
			uniforms: { ...shared, uBed: { value: new THREE.Color(tones.stone.colors[0]) }, uGlowColor: { value: new THREE.Color(look.seam.color) }, uGlow: this.point, uPiers: { value: new THREE.Vector4(...o.piers) } },
			vertexShader: WATER_VERTEX,
			fragmentShader: WATER_FRAGMENT,
			fog: false,
		});
		const pool = new THREE.Mesh(new THREE.CircleGeometry(o.water[1], 56).rotateX(-Math.PI / 2), this.water);
		pool.position.y = o.water[0];
		this.geometries.push(pool.geometry);
		this.materials.push(this.water);
		this.body.add(pool);
		this.assemble(1, 1);
	}

	protected override complete(focus: number): void {
		const step = THREE.MathUtils.smoothstep;
		// the mirror finds the sun, then the light gathers behind the lens and narrows to its point
		this.glare.value = 1.4 * step(focus, 0.12, 0.42);
		this.shafts[0].uniforms.uPower.value = 0.85 * step(focus, 0.16, 0.44);
		const gathered = step(focus, 0.36, 1);
		this.shafts[1].uniforms.uPower.value = (0.3 + 0.7 * gathered) * step(focus, 0.3, 0.5);
		this.shafts[1].uniforms.uRadius.value.set(0.66, THREE.MathUtils.lerp(0.5, 0.035, gathered));
		this.point.value = 1.5 * step(focus, 0.62, 1);
		// the light at the heart of this exhibit is that point, so it comes on with the focus
		this.lit = step(focus, 0.55, 1);
		this.core.visible = this.lit > 0.01;
		this.core.scale.setScalar(0.3 + 0.7 * this.lit);
	}

	disposeGeometry(): void {
		for (const g of this.geometries) g.dispose();
	}
}

/** The lens: clear where the eye looks straight through, brighter toward its edge, and lit from within by the gathered light. */
function createLens(point: { value: number }, sky: THREE.Texture): THREE.MeshPhysicalMaterial {
	const glass = new THREE.MeshPhysicalMaterial({ color: look.exhibit.optics.glass, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, envMap: sky, envMapIntensity: 1.6, transparent: true, depthWrite: false });
	glass.customProgramCacheKey = () => 'futari-lens';
	glass.onBeforeCompile = (shader) => {
		shader.uniforms.uPoint = point;
		shader.uniforms.uPointColor = { value: new THREE.Color(look.seam.color) };
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform float uPoint;\nuniform vec3 uPointColor;')
			.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nfloat fFacing = abs(dot(normalize(vViewPosition), normal));\ndiffuseColor.a = mix(0.14, 0.92, pow(1.0 - fFacing, 2.5));')
			.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uPointColor * (0.5 * uPoint * pow(fFacing, 6.0));');
	};
	return glass;
}

export interface ExhibitSet {
	engineering: Exhibit;
	kensaku: Exhibit;
	base: THREE.Mesh;
	/** One segment of a passage ring. The passage instances it. */
	ringSegment: THREE.Mesh;
	dispose: () => void;
}

/**
 * `groves` draws the climber, so the exhibits wait for the groves to load. `shared` are the
 * environment's uniforms, for what is lit by the season outside the scene's lamps. `sky` is the
 * summer sky as an environment map, for the bronze and glass that stand under it.
 */
export async function loadExhibits(groves: Promise<Grove>, shared: Uniforms, sky: THREE.Texture): Promise<ExhibitSet> {
	const [gltf, flora] = await Promise.all([loadGlb('/assets/exhibits.glb'), groves]);
	gltf.scene.updateMatrixWorld(true);
	const meshes = meshesOf(gltf.scene);
	const take = (name: string) => {
		const mesh = meshes.find((m) => m.name === name)!;
		mesh.removeFromParent();
		return mesh;
	};
	const partsOf = (group: string) => {
		const parts = meshes.filter((m) => (m.userData as Partial<PartExtras>).group === group);
		for (const p of parts) p.removeFromParent();
		return parts;
	};
	for (const mesh of meshes) adoptBake(mesh.geometry);
	const engineering = new Arbor(partsOf('engineering'), { wood: meshes.find((m) => m.name === 'engineering_climber_wood')!, cards: meshes.find((m) => m.name === 'engineering_climber_cards')! }, flora);
	const kensaku = new Instrument(partsOf('kensaku'), shared, sky);
	const base = take('base');
	base.material = createStoneMaterial('landmark');
	return {
		engineering,
		kensaku,
		base,
		ringSegment: take('ring_segment'),
		dispose: () => {
			for (const m of meshes) m.geometry.dispose();
			kensaku.disposeGeometry();
			for (const m of [...engineering.materials, ...kensaku.materials, base.material as THREE.Material]) m.dispose();
		},
	};
}
