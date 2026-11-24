// The 二人 landmark at runtime: one group per stone block, the light between the two characters,
// the construction lines used by the entrance, the pointer response, and the parting of the two
// characters when the camera passes between them.
import * as THREE from 'three';
import { loadGlb, meshesOf } from './assets.ts';
import { look } from './look.ts';
import { adoptBake, createStoneMaterial, stoneUniforms } from './materials.ts';

/** What the asset build writes on every block. See bakeBlock in tools/assets/build.ts. */
interface BlockExtras {
	/** -1 for 二, 1 for 人. Each character parts as a whole, so its shape never breaks. */
	side: -1 | 1;
	order: number;
	/** 0 stays put under the pointer, 1 moves freely. */
	mobility: number;
	pivot: [number, number, number];
	out: [number, number, number];
	/** Outline of the block as flat line segments in x and y. */
	outline: number[];
	z0: number;
	z1: number;
}

export interface BlockRig {
	group: THREE.Group;
	lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
	home: THREE.Vector3;
	out: THREE.Vector3;
	order: number;
	side: -1 | 1;
	mobility: number;
	/** 0 is the start pose of the entrance, 1 is in place. */
	build: number;
	introOffset: THREE.Vector3;
	introAxis: THREE.Vector3;
	introAngle: number;
	loosen: number;
	twistAxis: THREE.Vector3;
}

export class Landmark {
	readonly root = new THREE.Group();
	/**
	 * Lights live outside the group that gets hidden. The number of lights in the scene must never
	 * change, or every lit shader recompiles the first time a chapter appears.
	 */
	readonly lights = new THREE.Group();
	readonly blocks: BlockRig[] = [];
	/** Where the guiding light starts, between the two characters. */
	readonly origin = new THREE.Vector3();
	/** 0 is dark, 1 is the resting brightness. The entrance and the pointer both drive it. */
	lightLevel = 0;
	/** 0 closed, 1 parted. Set from scroll progress: the two characters make room for the camera. */
	gate = 0;
	private boost = 0;
	private lastMotion = -1;
	private core!: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
	private halo!: THREE.Sprite;
	private light!: THREE.PointLight;
	private pool!: THREE.PointLight;
	private touch!: THREE.PointLight;
	private readonly tmp = new THREE.Vector3();
	private readonly quat = new THREE.Quaternion();
	private readonly quat2 = new THREE.Quaternion();

	async load(): Promise<void> {
		const gltf = await loadGlb('/assets/landmark.glb');
		const material = createStoneMaterial('landmark');
		const seed = (i: number) => Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1;
		for (const mesh of meshesOf(gltf.scene)) {
			const extras = mesh.userData as BlockExtras;
			adoptBake(mesh.geometry);
			mesh.material = material;
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			const home = new THREE.Vector3(...extras.pivot);
			const group = new THREE.Group();
			group.position.copy(home);
			mesh.position.sub(home);
			group.add(mesh);
			const i = this.blocks.length;
			const lines = constructionLines(extras);
			this.blocks.push({
				group,
				lines,
				home,
				out: new THREE.Vector3(...extras.out).normalize(),
				order: extras.order,
				side: extras.side,
				mobility: extras.mobility,
				build: 0,
				introOffset: new THREE.Vector3(extras.side * (0.6 + seed(i + 7) * 1.4), 5.5 + extras.order * 1.3 + seed(i) * 2, (seed(i + 3) - 0.5) * 3.2),
				introAxis: new THREE.Vector3(seed(i + 11) - 0.5, seed(i + 13) - 0.5, seed(i + 17) - 0.5).normalize(),
				introAngle: (seed(i + 19) - 0.5) * 0.9,
				loosen: 0,
				twistAxis: new THREE.Vector3(seed(i + 23) - 0.5, seed(i + 29) - 0.5, seed(i + 31) - 0.5).normalize(),
			});
			this.root.add(group, lines);
		}
		const light = gltf.scene.userData.light as { x: number; y: number; z: number };
		this.origin.set(light.x, light.y, light.z);
		this.buildLight();
	}

	private buildLight(): void {
		// a small shard of light that hangs between the characters, not a third stroke
		this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: look.seam.color, fog: false }));
		this.core.scale.set(0.55, 1.7, 0.55);
		this.core.position.copy(this.origin);
		this.halo = new THREE.Sprite(
			new THREE.SpriteMaterial({ map: haloTexture(), color: look.seam.color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }),
		);
		this.halo.position.copy(this.origin);
		this.halo.scale.set(4.4, 4.4, 1);
		this.light = new THREE.PointLight(look.seam.color, 0, 15, 2);
		this.light.position.copy(this.origin).add(new THREE.Vector3(0, 0.1, 0.4));
		this.pool = new THREE.PointLight(look.seam.color, 0, 9, 2);
		this.pool.position.set(this.origin.x, 2, 0.6);
		this.touch = new THREE.PointLight(look.seam.color, 0, 7, 2);
		this.root.add(this.core, this.halo);
		this.lights.add(this.light, this.pool, this.touch);
	}

	/**
	 * Advances block poses. `ray` is the pointer ray in world space, or null when the pointer is away.
	 * Returns whether any block moved enough to change its shadow.
	 */
	update(dt: number, ray: THREE.Ray | null, time: number): boolean {
		const k = 1 - Math.exp(-dt * look.pointer.stiffness);
		let maxLoosen = 0;
		let near = 0;
		let motion = this.gate;
		for (const b of this.blocks) {
			let target = 0;
			if (ray && b.build > 0.999) {
				const d = Math.sqrt(ray.distanceSqToPoint(b.home));
				target = THREE.MathUtils.smoothstep(look.pointer.radius - d, 0, look.pointer.radius - 0.5) * b.mobility;
			}
			b.loosen += (target - b.loosen) * k;
			maxLoosen = Math.max(maxLoosen, b.loosen);
			motion += b.loosen + b.build;
			const settle = 1 - b.build;
			this.tmp.copy(b.introOffset).multiplyScalar(settle).addScaledVector(b.out, b.loosen * look.pointer.travel);
			// the whole character slides aside, so 二 and 人 keep their shapes while the camera passes
			this.tmp.x += b.side * this.gate * look.gate.part;
			// a slow breath so the standing stones are never frozen
			this.tmp.y += Math.sin(time * 0.5 + b.order * 0.9 + b.side) * 0.005 * b.mobility;
			b.group.position.copy(b.home).add(this.tmp);
			this.quat.setFromAxisAngle(b.introAxis, b.introAngle * settle);
			this.quat2.setFromAxisAngle(b.twistAxis, b.loosen * look.pointer.twist);
			b.group.quaternion.copy(this.quat).multiply(this.quat2);
			b.group.visible = b.build > 0.001;
		}
		if (ray) {
			const d = Math.sqrt(ray.distanceSqToPoint(this.origin));
			near = THREE.MathUtils.smoothstep(4.5 - d, 0, 4);
			ray.closestPointToPoint(this.origin, this.tmp);
			this.touch.position.set(THREE.MathUtils.clamp(this.tmp.x, -7, 7), THREE.MathUtils.clamp(this.tmp.y, 0.8, 6.2), 2.2);
		}
		this.boost += (near - this.boost) * k;
		stoneUniforms.uLoosen.value = maxLoosen;
		const level = this.lightLevel * (1 + 0.55 * this.boost + 0.8 * this.gate) * (0.97 + 0.03 * Math.sin(time * 1.7));
		stoneUniforms.uJoint.value = look.seam.joint * this.lightLevel * (1 + 1.4 * maxLoosen + 0.6 * this.boost);
		this.core.material.color.set(look.seam.color).multiplyScalar(look.seam.core * level);
		this.core.visible = level > 0.01;
		this.core.rotation.y = time * 0.4;
		this.halo.material.opacity = look.seam.halo * Math.min(level, 1.6);
		this.light.intensity = look.seam.light * level;
		this.pool.intensity = look.seam.pool * level;
		this.touch.intensity = 26 * maxLoosen * this.lightLevel;
		const moved = Math.abs(motion - this.lastMotion) > 1e-4;
		this.lastMotion = motion;
		return moved;
	}

	/** Called while the lab is hidden. */
	dark(): void {
		this.light.intensity = this.pool.intensity = this.touch.intensity = 0;
	}

	dispose(): void {
		for (const mesh of meshesOf(this.root)) mesh.geometry.dispose();
		for (const b of this.blocks) {
			b.lines.geometry.dispose();
			b.lines.material.dispose();
		}
		this.halo.material.map?.dispose();
		this.halo.material.dispose();
		this.core.geometry.dispose();
		this.core.material.dispose();
	}
}

/** The outline of one block at its final place: both faces, and edges between them at the corners. */
function constructionLines(extras: BlockExtras): BlockRig['lines'] {
	const pts: number[] = [];
	const o = extras.outline;
	for (let i = 0; i < o.length; i += 4) {
		pts.push(o[i], o[i + 1], extras.z0, o[i + 2], o[i + 3], extras.z0, o[i], o[i + 1], extras.z1, o[i + 2], o[i + 3], extras.z1);
		// a cross edge every few segments is enough to read the depth
		if ((i / 4) % 7 === 0) pts.push(o[i], o[i + 1], extras.z0, o[i], o[i + 1], extras.z1);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	const material = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
	const lines = new THREE.LineSegments(geometry, material);
	lines.visible = false;
	return lines;
}

function haloTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d')!;
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grad.addColorStop(0, 'rgba(255,255,255,0.9)');
	grad.addColorStop(0.18, 'rgba(255,255,255,0.32)');
	grad.addColorStop(0.5, 'rgba(255,255,255,0.07)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return new THREE.CanvasTexture(c);
}
