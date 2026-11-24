// Regenerates every runtime asset of the opening scene. Deterministic: same inputs, same bytes.
// Run with: pnpm assets:build
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { growClimber } from './arbor.ts';
import { assembled, RING, SHAPES, type Shape } from './exhibits.ts';
import { foliageAtlas } from './foliage.ts';
import { type BakedMesh, writeGlb } from './glb.ts';
import { BLOCKS, type Block, LIGHT, outline, sdBlock, sdBlockCoarse, sdLandmarkCoarse } from './landmark.ts';
import { buildLandscape } from './landscape.ts';
import { clamp, makeNoise, mulberry32, smooth } from './noise.ts';
import { encodeGrayPng } from './png.ts';
import { type Sdf, surfaceNets, type Vec3 } from './surfacenets.ts';
import { terrain, terrainHeight, terrainNoise } from './terrain-fn.ts';
import { CARD_REACH, growTree, type Part, SPECIES, UV_TILES } from './trees.ts';

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

// Landmark bake channels: R occlusion when assembled, G occlusion of the block alone,
// B edge wear (0.5 is flat, above is a convex edge), A how much joint light this point shows.
function bakeBlock(b: Block): BakedMesh {
	const f: Sdf = (x, y, z) => sdBlock(b, x, y, z);
	const m = 0.22;
	const { positions, indices } = surfaceNets(f, [b.min[0] - m, b.min[1] - m, b.min[2] - m], [b.max[0] + m, b.max[1] + m, b.max[2] + m], 0.05);
	const count = positions.length / 3;
	const pos = new Float32Array(positions);
	const normals = new Float32Array(count * 3);
	const bake = new Uint8Array(count * 4);
	const world: Sdf = (x, y, z) => Math.min(sdLandmarkCoarse(x, y, z), y - terrainHeight(x, z));
	const others: Sdf = (x, y, z) => sdLandmarkCoarse(x, y, z, b);
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
		// light shows only inside the joints a glowing block shares with its neighbours
		bake[i * 4 + 3] = b.glow ? byte(1.6 * (1 - occlusion(others, p, n, 0.22))) : 0;
	}
	const idx = new Uint32Array(indices);
	// surface nets does not guarantee winding, so orient every triangle by the field normal
	orient(idx, pos, normals);
	return {
		name: b.name, positions: pos, normals, bake, indices: idx,
		extras: { side: b.side, order: b.order, mobility: b.mobility, pivot: b.pivot.map((v) => +v.toFixed(3)), out: b.out, outline: outline(b), z0: +b.min[2].toFixed(3), z1: +b.max[2].toFixed(3) },
	};
}

// Exhibit parts use the landmark's channels, so they share its material: R occlusion with the whole
// sculpture assembled, G occlusion of the part alone, B edge wear, A joint light (ring segment only).
// The runtime blends R and G by how far a part is from its seat, so no neighbour's shadow stays on a part that has moved away.
function bakeShape(shape: Shape): BakedMesh {
	const { positions, indices } = surfaceNets(shape.fine, shape.min, shape.max, shape.cell);
	const count = positions.length / 3;
	// a shape thinner than its cell, or outside its own bounds, leaves nothing to mesh
	if (indices.length === 0) throw new Error(`${shape.name}: no surface inside its bounds at cell ${shape.cell}`);
	const pos = new Float32Array(positions);
	const normals = new Float32Array(count * 3);
	const bake = new Uint8Array(count * 4);
	const f = shape.fine;
	const g = shape.coarse;
	const whole = shape.motion ? assembled(shape.group) : g;
	for (let i = 0; i < count; i++) {
		let p: Vec3 = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
		let n = gradient(f, p[0], p[1], p[2], 0.008);
		const d = f(p[0], p[1], p[2]);
		p = [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d];
		n = gradient(f, p[0], p[1], p[2], 0.008);
		pos.set(p, i * 3);
		normals.set(n, i * 3);
		const e = 0.05;
		const lap = (g(p[0] + e, p[1], p[2]) + g(p[0] - e, p[1], p[2]) + g(p[0], p[1] + e, p[2]) + g(p[0], p[1] - e, p[2]) + g(p[0], p[1], p[2] + e) + g(p[0], p[1], p[2] - e) - 6 * g(p[0], p[1], p[2])) / e;
		bake.set([byte(occlusion(whole, p, n, 0.4)), byte(occlusion(g, p, n, 0.4)), byte(0.5 + lap * 0.55), byte(shape.glow ? shape.glow(p[0], p[1], p[2]) : 0)], i * 4);
	}
	const idx = new Uint32Array(indices);
	orient(idx, pos, normals);
	const r3 = (v: number[]) => v.map((x) => +x.toFixed(3));
	const pivot = shape.motion?.pivot ?? [(shape.min[0] + shape.max[0]) / 2, (shape.min[1] + shape.max[1]) / 2, (shape.min[2] + shape.max[2]) / 2];
	const extras = shape.motion ? { group: shape.group, pivot: r3(pivot), from: shape.motion.from, axis: shape.motion.axis, angle: shape.motion.angle, window: shape.motion.window, substance: shape.substance ?? 'stone', grain: shape.grain, rides: shape.motion.rides } : shape.group === 'ring' ? { ring: RING } : undefined;
	return { name: shape.name, positions: pos, normals, bake, indices: idx, extras };
}

function orient(idx: Uint32Array, pos: Float32Array, normals: Float32Array): void {
	for (let t = 0; t < idx.length; t += 3) {
		const [a, c, d] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
		const ux = pos[c] - pos[a], uy = pos[c + 1] - pos[a + 1], uz = pos[c + 2] - pos[a + 2];
		const vx = pos[d] - pos[a], vy = pos[d + 1] - pos[a + 1], vz = pos[d + 2] - pos[a + 2];
		const dot = (uy * vz - uz * vy) * normals[a] + (uz * vx - ux * vz) * normals[a + 1] + (ux * vy - uy * vx) * normals[a + 2];
		if (dot < 0) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
	}
}

/** Points spread evenly over the surface of some meshes, moved and scaled into the particle volume. */
function samplePoints(meshes: BakedMesh[], count: number, seed: number, center: Vec3, scale: Vec3, keep: (y: number, nz: number) => boolean = () => true): Float32Array {
	const rand = mulberry32(seed);
	const tris: { m: BakedMesh; t: number; area: number }[] = [];
	let total = 0;
	for (const m of meshes)
		for (let t = 0; t < m.indices.length; t += 3) {
			const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
			const p = m.positions;
			const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
			const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
			const nzRaw = ux * vy - uy * vx;
			const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nzRaw);
			if (area === 0 || !keep((p[a + 1] + p[b + 1] + p[c + 1]) / 3, nzRaw / (2 * area))) continue;
			total += area;
			tris.push({ m, t, area: total });
		}
	const out = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const r = rand() * total;
		let lo = 0;
		let hi = tris.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (tris[mid].area < r) lo = mid + 1;
			else hi = mid;
		}
		const { m, t } = tris[lo];
		const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
		let u = rand();
		let v = rand();
		if (u + v > 1) [u, v] = [1 - u, 1 - v];
		for (let k = 0; k < 3; k++) out[i * 3 + k] = (m.positions[a + k] + u * (m.positions[b + k] - m.positions[a + k]) + v * (m.positions[c + k] - m.positions[a + k]) - center[k]) * scale[k];
	}
	return out;
}

// Terrain bake channels: R occlusion from the landmark, G snow cover, B cavity (0.5 is flat), A broad tint.
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
			if (withBridge && Math.abs(x) < 11 && Math.abs(z) < 6) {
				const p: Vec3 = [x, s.h + 0.02, z];
				ao = occlusion((px, py, pz) => sdLandmarkCoarse(px, py, pz), p, n, 1.4);
				// stone overhead blocks sky light: sample the landmark field above the ground
				let over = 0;
				for (let hgt = 1; hgt <= 6; hgt += 1) over = Math.max(over, smooth(1.3, 0.1, sdLandmarkCoarse(x, s.h + hgt, z)));
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
// `ONLY=exhibits pnpm assets:build` rebuilds the exhibits alone, for working on their shapes.
const quick = process.env.ONLY === 'exhibits';

/** A tree part or a climber part as a mesh. Card corners are stored in 0 to 1 so they quantize: 0.5 is the centre. */
const plantMesh = (name: string, part: Part, corners?: number[]): BakedMesh => ({
	name,
	positions: new Float32Array(part.positions),
	normals: new Float32Array(part.normals),
	bake: new Uint8Array(part.bake),
	indices: new Uint32Array(part.indices),
	uvs: new Float32Array(part.uvs),
	uvs1: corners && new Float32Array(corners.map((c) => c * 0.5 + 0.5)),
});

const shapes = SHAPES.map(bakeShape);
const climber = growClimber();
await writeGlb(`${OUT}/exhibits.glb`, [...shapes, plantMesh('engineering_climber_wood', climber.wood), plantMesh('engineering_climber_cards', climber.cards, climber.cards.corners)], { uvTiles: UV_TILES, cardReach: CARD_REACH });
const tris = (m: BakedMesh[]) => m.reduce((n, x) => n + x.indices.length / 3, 0);
const exhibitReport = {
	exhibitParts: shapes.length,
	exhibitTriangles: Object.fromEntries(['engineering', 'kensaku', 'base', 'ring'].map((g) => [g, shapes.reduce((n, m, i) => n + (SHAPES[i].group === g ? m.indices.length / 3 : 0), 0)])),
	climberTriangles: [climber.wood.indices.length / 3, climber.cards.indices.length / 3],
	exhibitsBytes: statSync(`${OUT}/exhibits.glb`).size,
};
if (quick) {
	console.log(JSON.stringify({ ...exhibitReport, seconds: (Date.now() - t0) / 1000 }, null, 1));
	process.exit(0);
}

const blocks = BLOCKS.map(bakeBlock);
await writeGlb(`${OUT}/landmark.glb`, blocks, { light: LIGHT });
const near: [number, number, number, number] = [-40, 36, -18, 54];
await writeGlb(`${OUT}/terrain.glb`, [
	bakeTerrain('near', near[0], near[1], near[2], near[3], 0.2, null, true),
	bakeTerrain('far', -264, 264, -304, 76, 2.4, [near[0] + 3, near[1] - 3, near[2] + 3, near[3] - 3], false),
]);
writeFileSync(`${OUT}/stone-detail.png`, detailTexture(512));

// The seasonal banks, and one mesh pair per species and level of detail for what grows on them.
const land = buildLandscape();
const flora: BakedMesh[] = [];
for (const sp of SPECIES)
	for (const detail of [0, 1] as const) {
		const tree = growTree(sp, detail);
		flora.push(plantMesh(`${tree.name}_wood`, tree.wood), plantMesh(`${tree.name}_cards`, tree.cards, tree.cards.corners));
	}
const round = (v: number) => Math.round(v * 1000) / 1000;
await writeGlb(`${OUT}/landscape.glb`, [...land.banks, ...flora], {
	species: SPECIES.map((sp) => sp.name),
	uvTiles: UV_TILES,
	cardReach: CARD_REACH,
	// species, detail, x, y, z, yaw, scale, early, tint, blossom
	plants: land.plants.map((p) => [p.species, p.detail, round(p.x), round(p.y), round(p.z), round(p.yaw), round(p.scale), round(p.early), round(p.tint), round(p.blossom)]),
});
writeFileSync(`${OUT}/foliage.png`, (await foliageAtlas()).png);

// Particle targets for the final installation: 3 forms of PARTICLES points, 16-bit, in a volume of +-3.
const PARTICLES = 24000;
// each form is the whole sculpture in its assembled pose: every part of that group
const shape = (group: string) => shapes.filter((_, i) => SHAPES[i].group === group);
const forms = [
	// 二人 again: only the front and back faces, flattened in depth, so the strokes stay crisp at any particle count
	samplePoints(blocks, PARTICLES, 5, [0, 2.75, 0], [0.285, 0.285, 0.13], (y, nz) => y > 0.05 && Math.abs(nz) > 0.7),
	// the arbor is taller than the volume allows at full size, so it is drawn a little smaller
	samplePoints(shape('engineering'), PARTICLES, 6, [0, 0.15, 0], [0.8, 0.8, 0.8]),
	samplePoints(shape('kensaku'), PARTICLES, 7, [0, -0.55, 0.15], [0.92, 0.92, 0.92]),
];
const packed = new Int16Array(PARTICLES * 9);
forms.forEach((f, k) => {
	for (let i = 0; i < f.length; i++) packed[k * PARTICLES * 3 + i] = Math.round(clamp(f[i] / 3, -1, 1) * 32767);
});
writeFileSync(`${OUT}/particles.bin`, Buffer.from(packed.buffer));

const report = {
	blocks: blocks.length,
	landmarkTriangles: tris(blocks),
	landmarkBytes: statSync(`${OUT}/landmark.glb`).size,
	terrainBytes: statSync(`${OUT}/terrain.glb`).size,
	detailBytes: statSync(`${OUT}/stone-detail.png`).size,
	...exhibitReport,
	particlesBytes: statSync(`${OUT}/particles.bin`).size,
	bankTriangles: Object.fromEntries(land.banks.map((b) => [b.name, b.indices.length / 3])),
	floraTriangles: Object.fromEntries(flora.map((m) => [m.name, m.indices.length / 3])),
	plants: land.plants.length,
	plantsDetailed: land.plants.filter((p) => p.detail === 0).length,
	landscapeBytes: statSync(`${OUT}/landscape.glb`).size,
	foliageBytes: statSync(`${OUT}/foliage.png`).size,
	seconds: (Date.now() - t0) / 1000,
};
console.log(JSON.stringify(report, null, 1));
