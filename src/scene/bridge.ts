// The landmark at runtime: one group per stone block, the seam of light, the construction
// lines used by the entrance, and the pointer response.
import * as THREE from 'three';
import { loadGlb, meshesOf } from './assets.ts';
import { look } from './look.ts';
import { adoptBake, createStoneMaterial, stoneUniforms } from './materials.ts';

interface BlockExtras {
	side: -1 | 1;
	kind: 'plinth' | 'pier' | 'table' | 'front' | 'back';
	order: number;
	pivot: [number, number, number];
	out: [number, number, number];
	poly: [number, number][];
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
	/** How much this block parts when the camera passes through the seam. Only the arm tips move. */
	gate: number;
}

const MOBILITY: Record<BlockExtras['kind'], number> = { plinth: 0, pier: 0.25, table: 0.5, front: 1, back: 0.8 };

export class Bridge {
	readonly root = new THREE.Group();
	/**
	 * Lights live outside the group that gets hidden. The number of lights in the scene must never
	 * change, or every lit shader recompiles the first time a chapter appears.
	 */
	readonly lights = new THREE.Group();
	readonly blocks: BlockRig[] = [];
	readonly seamPosition = new THREE.Vector3();
	/** 0 is dark, 1 is the resting brightness. The entrance and the pointer both drive it. */
	seamLevel = 0;
	/** 0 closed, 1 parted. Set from scroll progress: the arm tips open for the camera. */
	gate = 0;
	private seamBoost = 0;
	private core!: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
	private halo!: THREE.Sprite;
	private light!: THREE.PointLight;
	private pool!: THREE.PointLight;
	private touch!: THREE.PointLight;
	private readonly tmp = new THREE.Vector3();
	private readonly quat = new THREE.Quaternion();
	private readonly quat2 = new THREE.Quaternion();

	async load(): Promise<void> {
		const gltf = await loadGlb('/assets/bridge.glb');
		const material = createStoneMaterial('bridge');
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
			const height = 5 + extras.order * 0.9 + seed(i) * 2.5;
			const lines = constructionLines(extras);
			this.blocks.push({
				group,
				lines,
				home,
				out: new THREE.Vector3(...extras.out).normalize(),
				order: extras.order,
				side: extras.side,
				mobility: MOBILITY[extras.kind],
				build: 0,
				introOffset: new THREE.Vector3(extras.side * (1.2 + seed(i + 7) * 1.6), height, (seed(i + 3) - 0.5) * 3),
				introAxis: new THREE.Vector3(seed(i + 11) - 0.5, seed(i + 13) - 0.5, seed(i + 17) - 0.5).normalize(),
				introAngle: (seed(i + 19) - 0.5) * 1.1,
				loosen: 0,
				twistAxis: new THREE.Vector3(seed(i + 23) - 0.5, seed(i + 29) - 0.5, seed(i + 31) - 0.5).normalize(),
				gate: extras.kind === 'front' ? THREE.MathUtils.smoothstep(4.2 - Math.abs(home.x), 0.4, 3.9) : 0,
			});
			this.root.add(group, lines);
		}
		const seam = gltf.scene.userData.seam as { gap: number; yMin: number; yMax: number; depth: number };
		this.buildSeam(seam);
	}

	private buildSeam(seam: { gap: number; yMin: number; yMax: number; depth: number }): void {
		const h = seam.yMax - seam.yMin;
		this.seamPosition.set(0, seam.yMin + h / 2, 0);
		this.core = new THREE.Mesh(
			new THREE.BoxGeometry(seam.gap * 0.34, h * 0.9, seam.depth * 0.74),
			new THREE.MeshBasicMaterial({ color: look.seam.color, fog: false }),
		);
		this.core.position.copy(this.seamPosition);
		this.halo = new THREE.Sprite(
			new THREE.SpriteMaterial({ map: haloTexture(), color: look.seam.color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }),
		);
		this.halo.position.copy(this.seamPosition);
		this.halo.scale.set(4.6, 4.6, 1);
		this.light = new THREE.PointLight(look.seam.color, 0, 16, 2);
		this.light.position.copy(this.seamPosition).add(new THREE.Vector3(0, -0.1, 0.5));
		this.pool = new THREE.PointLight(look.seam.color, 0, 11, 2);
		this.pool.position.set(0, 3, 0.6);
		this.touch = new THREE.PointLight(look.seam.color, 0, 7, 2);
		this.root.add(this.core, this.halo);
		this.lights.add(this.light, this.pool, this.touch);
	}

	private lastMotion = -1;

	/**
	 * Advances block poses. `ray` is the pointer ray in world space, or null when the pointer is away.
	 * Returns whether any block moved enough to change its shadow.
	 */
	update(dt: number, ray: THREE.Ray | null, time: number): boolean {
		const k = 1 - Math.exp(-dt * look.pointer.stiffness);
		let maxLoosen = 0;
		let nearSeam = 0;
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
			this.tmp.x += b.side * this.gate * b.gate * 1.5;
			this.tmp.y += this.gate * b.gate * 0.35;
			// a slow breath so the assembled bridge is never frozen
			this.tmp.y += Math.sin(time * 0.5 + b.order * 0.9 + b.side) * 0.004 * b.mobility;
			b.group.position.copy(b.home).add(this.tmp);
			this.quat.setFromAxisAngle(b.introAxis, b.introAngle * settle);
			this.quat2.setFromAxisAngle(b.twistAxis, b.loosen * look.pointer.twist);
			b.group.quaternion.copy(this.quat).multiply(this.quat2);
			b.group.visible = b.build > 0.001;
		}
		if (ray) {
			const d = Math.sqrt(ray.distanceSqToPoint(this.seamPosition));
			nearSeam = THREE.MathUtils.smoothstep(4.5 - d, 0, 4);
			ray.closestPointToPoint(this.seamPosition, this.tmp);
			this.touch.position.set(THREE.MathUtils.clamp(this.tmp.x, -7, 7), THREE.MathUtils.clamp(this.tmp.y, 1, 6.5), 2.4);
		}
		this.seamBoost += (nearSeam - this.seamBoost) * k;
		stoneUniforms.uLoosen.value = maxLoosen;
		const level = this.seamLevel * (1 + 0.55 * this.seamBoost + 0.8 * this.gate) * (0.97 + 0.03 * Math.sin(time * 1.7));
		this.core.material.color.set(look.seam.color).multiplyScalar(look.seam.core * level);
		this.core.visible = level > 0.01;
		this.core.scale.set(1 + this.gate * 4, 1, 1);
		this.halo.material.opacity = look.seam.halo * Math.min(level, 1.6);
		this.light.intensity = look.seam.light * level;
		this.pool.intensity = look.seam.pool * level;
		this.touch.intensity = 26 * maxLoosen * this.seamLevel;
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

/** The outline of one block at its final place: both faces and the edges between them. */
function constructionLines(extras: BlockExtras): BlockRig['lines'] {
	const pts: number[] = [];
	const corners = extras.poly.filter((p, i, all) => {
		const a = all[(i + all.length - 1) % all.length];
		const b = all[(i + 1) % all.length];
		const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
		return Math.abs(cross) > 0.02;
	});
	corners.forEach((p, i) => {
		const q = corners[(i + 1) % corners.length];
		pts.push(p[0], p[1], extras.z0, q[0], q[1], extras.z0, p[0], p[1], extras.z1, q[0], q[1], extras.z1, p[0], p[1], extras.z0, p[0], p[1], extras.z1);
	});
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
