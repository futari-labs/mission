// The two project exhibits and the shared pieces of the later chapters. They come from one GLB.
// Each exhibit is a set of rigid stone parts inside a frosted crystal enclosure. Every part has a
// seated pose and an authored start pose, and `assemble` places it between the two for a given
// amount of assembly. Nothing accumulates: the same input always gives the same pose.
import * as THREE from 'three';
import { loadGlb, meshesOf } from './assets.ts';
import { STATION } from './journey.ts';
import { look } from './look.ts';
import { adoptBake, createStoneMaterial } from './materials.ts';

/** What the asset build writes on every movable part. See tools/assets/exhibits.ts. */
interface PartExtras {
	group: string;
	pivot: [number, number, number];
	from: [number, number, number];
	axis: [number, number, number];
	angle: number;
	window: [number, number];
}

interface Part {
	holder: THREE.Group;
	home: THREE.Vector3;
	from: THREE.Vector3;
	axis: THREE.Vector3;
	angle: number;
	window: [number, number];
	/** 1 away from its seat, 0 seated. Blends the part's own shading with the assembled shading. */
	apart: { value: number };
}

const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class Exhibit {
	readonly root = new THREE.Group();
	/** Kept in the scene at all times so the light count is constant. See Landmark.lights. */
	readonly glow: THREE.PointLight;
	private readonly body = new THREE.Group();
	private readonly parts: Part[] = [];
	private readonly shell: THREE.Mesh;
	private readonly form: { value: number };
	private readonly core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
	private readonly turn = new THREE.Vector2();
	private readonly phase: number;
	private focus = 1;

	constructor(station: THREE.Vector3, parts: THREE.Mesh[], shell: THREE.Mesh, form: { value: number }, focus: THREE.Vector3, facing: number) {
		this.phase = station.z;
		this.shell = shell;
		this.form = form;
		this.root.position.copy(station);
		this.body.rotation.y = facing;
		for (const mesh of parts) {
			const extras = mesh.userData as PartExtras;
			const apart = { value: 0 };
			mesh.material = createStoneMaterial('landmark', { uLoosen: apart });
			const home = new THREE.Vector3(...extras.pivot);
			const holder = new THREE.Group();
			mesh.position.sub(home);
			holder.add(mesh);
			this.body.add(holder);
			this.parts.push({ holder, home, from: new THREE.Vector3(...extras.from), axis: new THREE.Vector3(...extras.axis).normalize(), angle: extras.angle, window: extras.window, apart });
		}
		this.body.add(shell);
		this.core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.seam.color).multiplyScalar(6), fog: false }));
		this.core.position.copy(focus);
		this.glow = new THREE.PointLight(look.seam.color, look.exhibit.glow, 7, 2);
		this.glow.position.copy(station).add(focus);
		this.body.add(this.core);
		this.root.add(this.body);
		this.assemble(1, 1);
	}

	/**
	 * Places every part for `amount` of assembly, 0 to 1, and the enclosure for `enclosure`, 0 to 1.
	 * The light comes into focus as the last parts seat.
	 */
	assemble(amount: number, enclosure: number): void {
		for (const p of this.parts) {
			const t = ease(THREE.MathUtils.clamp((amount - p.window[0]) / (p.window[1] - p.window[0]), 0, 1));
			const away = 1 - t;
			p.holder.position.copy(p.home).addScaledVector(p.from, away);
			// the turn resolves a little before the part lands, so it seats square
			p.holder.quaternion.setFromAxisAngle(p.axis, p.angle * Math.max(0, away * 1.25 - 0.25));
			p.apart.value = away;
		}
		this.focus = THREE.MathUtils.smoothstep(amount, 0.88, 1);
		this.form.value = enclosure;
		this.shell.visible = enclosure > 0.002;
		this.core.visible = this.focus > 0.01;
		this.core.scale.setScalar(0.4 + 0.6 * this.focus);
	}

	/** `pointer` is in normalized device coordinates, or null when the pointer is away. */
	update(dt: number, pointer: THREE.Vector2 | null, time: number): void {
		const k = 1 - Math.exp(-dt * 3);
		this.turn.x += ((pointer ? pointer.x : 0) - this.turn.x) * k;
		this.turn.y += ((pointer ? pointer.y : 0) - this.turn.y) * k;
		// temporary motion only: a slow sway plus a small damped turn toward the pointer
		this.root.rotation.y = this.turn.x * look.exhibit.turn + Math.sin(time * 0.21 + this.phase) * 0.035;
		this.root.rotation.x = -this.turn.y * look.exhibit.tilt;
		this.root.position.y = STATION.engineering.y + Math.sin(time * 0.33 + this.phase) * 0.035;
		const pulse = 1 + 0.06 * Math.sin(time * 1.6 + this.phase);
		this.glow.intensity = look.exhibit.glow * this.focus * pulse * (1 + 0.5 * Math.hypot(this.turn.x, this.turn.y));
	}

	set visible(v: boolean) {
		this.root.visible = v;
		if (!v) this.glow.intensity = 0;
	}
}

export interface ExhibitSet {
	engineering: Exhibit;
	kensaku: Exhibit;
	base: THREE.Mesh;
	/** One segment of a passage ring. The passage instances it. */
	ringSegment: THREE.Mesh;
	dispose: () => void;
}

/** A fresnel shell: clear when seen face on, frosted at the edges and on top. `form` fades it in as it resolves. */
function createCrystal(form: { value: number }): THREE.MeshPhysicalMaterial {
	const s = look.exhibit.shell;
	const crystal = new THREE.MeshPhysicalMaterial({ color: s.color, roughness: s.roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18, ior: 1.31, envMapIntensity: 1.7, transparent: true, side: THREE.DoubleSide, depthWrite: false });
	crystal.defines = { ...crystal.defines, FOG_SCALE: '0.55' };
	crystal.customProgramCacheKey = () => 'futari-crystal';
	crystal.onBeforeCompile = (shader) => {
		shader.uniforms.uForm = form;
		shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uForm;').replace(
			'#include <normal_fragment_maps>',
			`#include <normal_fragment_maps>
			float fFacing = abs(dot(normalize(vViewPosition), normal));
			float fRim = pow(1.0 - clamp(fFacing, 0.0, 1.0), 2.0);
			float fTop = smoothstep(0.35, 0.95, inverseTransformDirection(normal, viewMatrix).y);
			diffuseColor.a = clamp(mix(${s.clear.toFixed(2)}, ${s.frosted.toFixed(2)}, fRim) + 0.3 * fTop, 0.0, 0.95);
			// the enclosure resolves edges first: frost at the rim arrives before the clear faces
			diffuseColor.a *= (gl_FrontFacing ? 1.0 : 0.55) * smoothstep(0.0, 1.0, uForm * (1.0 + fRim) - fRim * 0.0);`,
		);
	};
	return crystal;
}

export async function loadExhibits(): Promise<ExhibitSet> {
	const gltf = await loadGlb('/assets/exhibits.glb');
	const meshes = meshesOf(gltf.scene);
	const materials: THREE.Material[] = [];
	const take = (name: string) => {
		const mesh = meshes.find((m) => m.name === name)!;
		mesh.removeFromParent();
		return mesh;
	};
	const partsOf = (group: string) => meshes.filter((m) => (m.userData as Partial<PartExtras>).group === group);
	for (const mesh of meshes) adoptBake(mesh.geometry);
	const build = (station: THREE.Vector3, group: string, focus: THREE.Vector3, facing: number) => {
		const form = { value: 1 };
		const crystal = createCrystal(form);
		materials.push(crystal);
		const shell = take(`${group}_shell`);
		shell.geometry.deleteAttribute('aBake');
		shell.material = crystal;
		const parts = partsOf(group);
		for (const p of parts) p.removeFromParent();
		const exhibit = new Exhibit(station, parts, shell, form, focus, facing);
		for (const p of parts) materials.push(p.material as THREE.Material);
		return exhibit;
	};
	const engineering = build(STATION.engineering, 'engineering', new THREE.Vector3(0, 0, 0), 0.5);
	const kensaku = build(STATION.kensaku, 'kensaku', new THREE.Vector3(0, 0, 0.62), 0);
	const base = take('base');
	base.material = createStoneMaterial('landmark');
	materials.push(base.material as THREE.Material);
	return {
		engineering,
		kensaku,
		base,
		ringSegment: take('ring_segment'),
		dispose: () => {
			for (const m of meshes) m.geometry.dispose();
			for (const m of materials) m.dispose();
		},
	};
}
