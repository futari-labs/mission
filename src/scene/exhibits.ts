// The two project exhibits and the base of the installation. They share one GLB.
// Each exhibit is a stone object inside a frosted crystal enclosure, lit at the point
// where the guiding light passes through it.
import * as THREE from 'three';
import { loadGlb, meshesOf } from './assets.ts';
import { STATION } from './journey.ts';
import { look } from './look.ts';
import { adoptBake, createStoneMaterial } from './materials.ts';

export class Exhibit {
	readonly root = new THREE.Group();
	/** Kept in the scene at all times so the light count is constant. See Bridge.lights. */
	readonly glow: THREE.PointLight;
	private readonly body = new THREE.Group();
	private readonly core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
	private readonly turn = new THREE.Vector2();
	private readonly phase: number;

	constructor(station: THREE.Vector3, inner: THREE.Mesh, shell: THREE.Mesh, focus: THREE.Vector3, facing: number) {
		this.phase = station.z;
		this.root.position.copy(station);
		this.body.rotation.y = facing;
		this.body.add(inner, shell);
		this.core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(look.seam.color).multiplyScalar(6), fog: false }));
		this.core.position.copy(focus);
		this.glow = new THREE.PointLight(look.seam.color, look.exhibit.glow, 7, 2);
		this.glow.position.copy(station).add(focus);
		this.body.add(this.core);
		this.root.add(this.body);
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
		this.glow.intensity = look.exhibit.glow * pulse * (1 + 0.5 * Math.hypot(this.turn.x, this.turn.y));
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
	dispose: () => void;
}

export async function loadExhibits(): Promise<ExhibitSet> {
	const gltf = await loadGlb('/assets/exhibits.glb');
	const stone = createStoneMaterial('landmark');
	const { shell: s } = look.exhibit;
	const crystal = new THREE.MeshPhysicalMaterial({
		color: s.color,
		roughness: s.roughness,
		metalness: 0,
		clearcoat: 1,
		clearcoatRoughness: 0.18,
		ior: 1.31,
		envMapIntensity: 1.7,
		transparent: true,
		side: THREE.DoubleSide,
		depthWrite: false,
	});
	crystal.defines = { ...crystal.defines, FOG_SCALE: '0.55' };
	crystal.customProgramCacheKey = () => 'futari-crystal';
	crystal.onBeforeCompile = (shader) => {
		shader.fragmentShader = shader.fragmentShader.replace(
			'#include <normal_fragment_maps>',
			`#include <normal_fragment_maps>
			float fFacing = abs(dot(normalize(vViewPosition), normal));
			float fRim = pow(1.0 - clamp(fFacing, 0.0, 1.0), 2.0);
			float fTop = smoothstep(0.35, 0.95, inverseTransformDirection(normal, viewMatrix).y);
			diffuseColor.a = clamp(mix(${s.clear.toFixed(2)}, ${s.frosted.toFixed(2)}, fRim) + 0.3 * fTop, 0.0, 0.95);
			diffuseColor.a *= gl_FrontFacing ? 1.0 : 0.55;`,
		);
	};
	const meshes = new Map(meshesOf(gltf.scene).map((m) => [m.name, m]));
	const take = (name: string, material: THREE.Material) => {
		const mesh = meshes.get(name)!;
		adoptBake(mesh.geometry);
		if (material === crystal) mesh.geometry.deleteAttribute('aBake');
		mesh.material = material;
		mesh.removeFromParent();
		return mesh;
	};
	const engineering = new Exhibit(STATION.engineering, take('engineering', stone), take('engineering_shell', crystal), new THREE.Vector3(0, 0, 0), 0.5);
	const kensaku = new Exhibit(STATION.kensaku, take('kensaku', stone), take('kensaku_shell', crystal), new THREE.Vector3(0, 0, 0.62), 0);
	const base = take('base', stone);
	return {
		engineering,
		kensaku,
		base,
		dispose: () => {
			for (const m of meshes.values()) m.geometry.dispose();
			stone.dispose();
			crystal.dispose();
		},
	};
}
