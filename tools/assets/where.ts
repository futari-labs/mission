// Prints where each bank falls in the frame at given journey positions: a composition aid.
// Usage: node tools/assets/where.ts 0.24,0.43
import * as THREE from 'three';
import { poseAt } from '../../src/scene/journey.ts';
import { BANKS, bankGround } from './landscape.ts';

for (const u of (process.argv[2] ?? '0.43,0.67,1.02').split(',').map(Number)) {
	const pose = poseAt(u, 1, 1.6, { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 27 });
	const camera = new THREE.PerspectiveCamera(pose.fov, 1.6, 0.1, 3000);
	camera.position.copy(pose.position);
	camera.lookAt(pose.target);
	camera.updateMatrixWorld();
	console.log(`u ${u}  camera ${pose.position.toArray().map((v) => v.toFixed(1))}`);
	for (const b of BANKS) {
		// the part of the bank that stands above the cloud tops, as a range across the frame
		let [lo, hi, near] = [9, -9, 1e9];
		for (let a = 0; a < 64; a++)
			for (let r = 0; r <= 1.2; r += 0.05) {
				const x = b.x + Math.cos((a / 64) * Math.PI * 2) * r * b.radius;
				const z = b.z + Math.sin((a / 64) * Math.PI * 2) * r * b.radius;
				const h = bankGround(b, x, z).h;
				if (h < -14) continue;
				const p = new THREE.Vector3(x, h, z);
				const d = p.distanceTo(camera.position);
				p.project(camera);
				if (p.z > 1 || Math.abs(p.y) > 1.2) continue;
				lo = Math.min(lo, p.x);
				hi = Math.max(hi, p.x);
				near = Math.min(near, d);
			}
		if (hi > -1 && lo < 1) console.log(`  ${b.name.padEnd(12)} x ${lo.toFixed(2)} to ${hi.toFixed(2)}  nearest ${near.toFixed(0)} m`);
	}
}
