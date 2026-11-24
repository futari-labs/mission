// The passage from Kensaku to the installation: three stone rings on the line of the guiding
// light. Each ring is eight copies of one segment. The segments start scattered around the ring's
// place and move into it as the camera approaches, the nearest ring first. When a ring closes,
// light shows in its joints and along its rim.
import * as THREE from 'three';
import { BEAM_Y, RING_Z } from './journey.ts';
import { look } from './look.ts';
import { createStoneMaterial } from './materials.ts';

interface Segment {
	angle: number;
	/** Start offset in the ring's own frame: outward along the segment's radius, and along the axis. */
	out: number;
	along: number;
	/** Extra turn about the ring axis and about the segment's own radius at the start. */
	spin: number;
	twist: number;
	window: [number, number];
}

interface Ring {
	mesh: THREE.InstancedMesh;
	rim: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
	frame: THREE.Matrix4;
	segments: Segment[];
	joint: { value: number };
	veil: { value: number };
}

// modest differences in size and angle give the three crossings a rhythm
const LAYOUT = [
	{ scale: 1, yaw: 0.07, pitch: -0.03, roll: 0.2 },
	{ scale: 1.16, yaw: -0.1, pitch: 0.04, roll: -0.35 },
	{ scale: 0.9, yaw: 0.05, pitch: 0.02, roll: 0.6 },
];
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const hash = (n: number) => Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;

export class Passage {
	readonly root = new THREE.Group();
	private readonly rings: Ring[] = [];
	private readonly base = new THREE.Matrix4();
	private readonly m = new THREE.Matrix4();
	private readonly q = new THREE.Quaternion();
	private readonly q2 = new THREE.Quaternion();
	private readonly v = new THREE.Vector3();
	private readonly one = new THREE.Vector3(1, 1, 1);
	private readonly axisZ = new THREE.Vector3(0, 0, 1);
	private readonly radial = new THREE.Vector3();

	constructor(segment: THREE.Mesh) {
		const { radius, segments: count } = (segment.userData as { ring: { radius: number; segments: number } }).ring;
		// the exported mesh is quantized, so its own transform is part of every copy
		segment.updateMatrix();
		this.base.copy(segment.matrix);
		LAYOUT.forEach((layout, i) => {
			const joint = { value: 0 };
			const veil = { value: 1 };
			const mesh = new THREE.InstancedMesh(segment.geometry, createStoneMaterial('landmark', { uJoint: joint, uVeil: veil }), count);
			mesh.frustumCulled = false;
			const frame = new THREE.Matrix4().compose(
				new THREE.Vector3(0, BEAM_Y, RING_Z[i]),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(layout.pitch, layout.yaw, layout.roll)),
				new THREE.Vector3(layout.scale, layout.scale, layout.scale),
			);
			const rim = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.53, 0.026, 6, 96), new THREE.MeshBasicMaterial({ color: look.seam.color }));
			rim.applyMatrix4(frame);
			const list: Segment[] = [];
			for (let k = 0; k < count; k++) {
				const h = (n: number) => hash(i * 31 + k * 7 + n);
				const start = h(1) * 0.42;
				list.push({
					angle: (k / count) * Math.PI * 2,
					out: 4.5 + h(2) * 4.5,
					along: (h(3) - 0.35) * 9,
					spin: (h(4) - 0.5) * 1.5,
					twist: (h(5) - 0.5) * 2.2,
					window: [start, start + 0.5 + h(6) * 0.08],
				});
			}
			this.rings.push({ mesh, rim, frame, segments: list, joint, veil });
			this.root.add(mesh, rim);
		});
		this.update([1, 1, 1], 0);
	}

	/** `progress` is how far each ring has assembled, 0 to 1. `veil` hides the rings in fog, 1 hidden. */
	update(progress: readonly number[], veil: number): void {
		this.rings.forEach((ring, i) => {
			const p = progress[i];
			ring.segments.forEach((s, k) => {
				const away = 1 - ease(THREE.MathUtils.clamp((p - s.window[0]) / (s.window[1] - s.window[0]), 0, 1));
				// the turn resolves before the segment arrives, so it slides home square
				const turn = Math.max(0, away * 1.3 - 0.3);
				const angle = s.angle + s.spin * turn;
				this.radial.set(-Math.sin(angle), Math.cos(angle), 0);
				this.q.setFromAxisAngle(this.axisZ, angle);
				this.q2.setFromAxisAngle(this.radial, s.twist * turn);
				this.v.copy(this.radial).multiplyScalar(s.out * away).setZ(s.along * away);
				this.m.compose(this.v, this.q2.multiply(this.q), this.one).premultiply(ring.frame).multiply(this.base);
				ring.mesh.setMatrixAt(k, this.m);
			});
			ring.mesh.instanceMatrix.needsUpdate = true;
			const closed = THREE.MathUtils.smoothstep(p, 0.86, 1);
			ring.joint.value = look.passage.joint * closed;
			ring.veil.value = veil;
			ring.rim.material.color.set(look.seam.color).multiplyScalar(look.passage.rim * closed * (1 - veil));
			ring.rim.visible = closed > 0.01;
		});
	}

	set visible(v: boolean) {
		this.root.visible = v;
	}

	dispose(): void {
		for (const ring of this.rings) {
			ring.mesh.dispose();
			(ring.mesh.material as THREE.Material).dispose();
			ring.rim.geometry.dispose();
			ring.rim.material.dispose();
		}
	}
}
