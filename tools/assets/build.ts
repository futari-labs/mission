// Regenerates every runtime asset of the opening scene. Deterministic: same inputs, same bytes.
// Run with: pnpm assets:build
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { BLOCKS, type Block, SEAM, sdBlock, sdBlockCoarse, sdBridgeCoarse } from './bridge.ts';
import { type BakedMesh, writeGlb } from './glb.ts';
import { clamp, makeNoise, smooth } from './noise.ts';
import { encodeGrayPng } from './png.ts';
import { type Sdf, surfaceNets, type Vec3 } from './surfacenets.ts';
import { terrain, terrainHeight, terrainNoise } from './terrain-fn.ts';

const OUT = 'public/assets';
mkdirSync(OUT, { recursive: true });
const byte = (v: number) => Math.round(clamp(v) * 255);

function gradient(f: Sdf, x: number, y: number, z: number, e: number): Vec3 {
	const gx = f(x + e, y, z) - f(x - e, y, z);
	const gy = f(x, y + e, z) - f(x, y - e, z);
	const gz = f(x, y, z + e) - f(x, y, z - e);
	const l = Math.hypot(gx, gy, gz) || 1;
	return [gx / l, gy / l, gz / l];
}

/** Occlusion from a distance field: how much nearer than expected the surroundings are along the normal. */
function occlusion(f: Sdf, p: Vec3, n: Vec3, reach: number): number {
	let occ = 0;
	let total = 0;
	let w = 1;
	for (let i = 1; i <= 5; i++) {
		const dist = 0.05 + (reach * i) / 5;
		occ += (w * Math.max(0, dist - f(p[0] + n[0] * dist, p[1] + n[1] * dist, p[2] + n[2] * dist))) / dist;
		total += w;
		w *= 0.72;
	}
	return clamp(1 - (1.5 * occ) / total);
}

// Bridge bake channels: R occlusion when assembled, G occlusion of the block alone,
// B edge wear (0.5 is flat, above is a convex edge), A per-block tint.
function bakeBlock(b: Block): BakedMesh {
	const f: Sdf = (x, y, z) => sdBlock(b, x, y, z);
	const m = 0.22;
	const { positions, indices } = surfaceNets(f, [b.min[0] - m, b.min[1] - m, b.min[2] - m], [b.max[0] + m, b.max[1] + m, b.max[2] + m], 0.062);
	const count = positions.length / 3;
	const pos = new Float32Array(positions);
	const normals = new Float32Array(count * 3);
	const bake = new Uint8Array(count * 4);
	const world: Sdf = (x, y, z) => Math.min(sdBridgeCoarse(x, y, z), y - terrainHeight(x, z));
	const self: Sdf = (x, y, z) => sdBlockCoarse(b, x, y, z);
	for (let i = 0; i < count; i++) {
		let p: Vec3 = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
		let n = gradient(f, p[0], p[1], p[2], 0.012);
		const d = f(p[0], p[1], p[2]);
		p = [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d];
		n = gradient(f, p[0], p[1], p[2], 0.012);
		pos.set(p, i * 3);
		normals.set(n, i * 3);
		const e = 0.07;
		const lap = (self(p[0] + e, p[1], p[2]) + self(p[0] - e, p[1], p[2]) + self(p[0], p[1] + e, p[2]) + self(p[0], p[1] - e, p[2]) + self(p[0], p[1], p[2] + e) + self(p[0], p[1], p[2] - e) - 6 * self(p[0], p[1], p[2])) / e;
		bake[i * 4] = byte(occlusion(world, p, n, 0.55));
		bake[i * 4 + 1] = byte(occlusion(self, p, n, 0.55));
		bake[i * 4 + 2] = byte(0.5 + lap * 0.55);
		bake[i * 4 + 3] = byte(b.tint);
	}
	const idx = new Uint32Array(indices);
	// surface nets does not guarantee winding, so orient every triangle by the field normal
	for (let t = 0; t < idx.length; t += 3) {
		const [a, c, d] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
		const ux = pos[c] - pos[a], uy = pos[c + 1] - pos[a + 1], uz = pos[c + 2] - pos[a + 2];
		const vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
		const dot = (uy * vz - uz * vy) * normals[a] + (uz * vx - ux * vz) * normals[a + 1] + (ux * vy - uy * vx) * normals[a + 2];
		if (dot < 0) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
	}
	return {
		name: b.name, positions: pos, normals, bake, indices: idx,
		extras: { side: b.side, kind: b.kind, order: b.order, pivot: b.pivot, out: b.out, poly: b.poly.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]), z0: +b.min[2].toFixed(3), z1: +b.max[2].toFixed(3) },
	};
}

// Terrain bake channels: R occlusion from the bridge, G snow cover, B cavity (0.5 is flat), A broad tint.
function bakeTerrain(name: string, x0: number, x1: number, z0: number, z1: number, step: number, hole: [number, number, number, number] | null, withBridge: boolean): BakedMesh {
	const nx = Math.round((x1 - x0) / step) + 1;
	const nz = Math.round((z1 - z0) / step) + 1;
	const pos = new Float32Array(nx * nz * 3);
	const normals = new Float32Array(nx * nz * 3);
	const bake = new Uint8Array(nx * nz * 4);
	const N = terrainNoise;
	for (let k = 0; k < nz; k++)
		for (let i = 0; i < nx; i++) {
			const x = x0 + i * step;
			const z = z0 + k * step;
			const v = i + k * nx;
			const s = terrain(x, z);
			const e = Math.min(0.08, step * 0.4);
			const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
			const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
			const l = Math.hypot(hx, 2 * e, hz);
			const n: Vec3 = [-hx / l, (2 * e) / l, -hz / l];
			const sunk = hole !== null && x > hole[0] && x < hole[1] && z > hole[2] && z < hole[3];
			pos.set([x, s.h - (sunk ? 5 : 0), z], v * 3);
			normals.set(n, v * 3);
			const c = Math.max(0.45, step);
			const cavity = (terrainHeight(x + c, z) + terrainHeight(x - c, z) + terrainHeight(x, z + c) + terrainHeight(x, z - c) - 4 * s.h) / c;
			const snow = smooth(0.5, 0.8, n[1] + 0.07 * N.n3(x * 0.4, 1.7, z * 0.4) + 0.05 * N.n3(x * 1.7, 3.1, z * 1.7)) * (1 - 0.6 * s.rocky * smooth(0.97, 0.78, n[1])) * (1 - 0.8 * s.scour * smooth(-0.05, 0.3, N.fbm(x * 0.33, 5.5, z * 0.33, 2)));
			let ao = 1;
			if (withBridge && Math.abs(x) < 12 && Math.abs(z) < 6) {
				const p: Vec3 = [x, s.h + 0.02, z];
				ao = occlusion((px, py, pz) => sdBridgeCoarse(px, py, pz), p, n, 1.4);
				// the deck overhead blocks sky light: sample the bridge field above the ground
				let over = 0;
				for (let hgt = 1; hgt <= 6; hgt += 1) over = Math.max(over, smooth(1.3, 0.1, sdBridgeCoarse(x, s.h + hgt, z)));
				ao *= 1 - 0.42 * over;
			}
			bake.set([byte(ao), byte(snow), byte(0.5 - cavity * 0.9), byte(0.5 + 0.5 * N.fbm(x * 0.045, 6.6, z * 0.045, 2))], v * 4);
		}
	const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
	let o = 0;
	for (let k = 0; k < nz - 1; k++)
		for (let i = 0; i < nx - 1; i++) {
			const a = i + k * nx;
			idx.set([a, a + nx, a + 1, a + 1, a + nx, a + nx + 1], o);
			o += 6;
		}
	return { name, positions: pos, normals, bake, indices: idx };
}

// Tiling stone grain as a height map. The app derives a normal map from it at load.
function detailTexture(size: number): Buffer {
	const N = makeNoise(4242);
	const px = new Uint8Array(size * size);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const u = (x / size) * 8;
			const v = (y / size) * 8;
			const grain = N.fbm(u, v, 0.5, 5, 8);
			const cracks = N.ridged(u * 2, v * 2, 3.5, 3, 16);
			const pits = Math.max(0, N.n3(u * 6, v * 6, 9.5, 48) - 0.35);
			px[x + y * size] = byte(0.5 + 0.55 * grain + 0.22 * (cracks - 0.4) - 0.9 * pits);
		}
	return encodeGrayPng(size, size, px);
}

const t0 = Date.now();
const blocks = BLOCKS.map(bakeBlock);
await writeGlb(`${OUT}/bridge.glb`, blocks, { seam: SEAM });
const near: [number, number, number, number] = [-40, 36, -18, 54];
await writeGlb(`${OUT}/terrain.glb`, [
	bakeTerrain('near', near[0], near[1], near[2], near[3], 0.2, null, true),
	bakeTerrain('far', -264, 264, -304, 76, 2.4, [near[0] + 3, near[1] - 3, near[2] + 3, near[3] - 3], false),
]);
writeFileSync(`${OUT}/stone-detail.png`, detailTexture(512));

const tris = (m: BakedMesh[]) => m.reduce((s, x) => s + x.indices.length / 3, 0);
const report = {
	blocks: blocks.length,
	bridgeTriangles: tris(blocks),
	bridgeBytes: statSync(`${OUT}/bridge.glb`).size,
	terrainBytes: statSync(`${OUT}/terrain.glb`).size,
	detailBytes: statSync(`${OUT}/stone-detail.png`).size,
	seconds: (Date.now() - t0) / 1000,
};
console.log(JSON.stringify(report, null, 1));
