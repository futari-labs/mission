// Naive surface nets: turns a signed distance function into an indexed triangle mesh.
export type Sdf = (x: number, y: number, z: number) => number;
export type Vec3 = [number, number, number];

const EDGES: [number, number][] = [
	[0, 1], [2, 3], [4, 5], [6, 7],
	[0, 2], [1, 3], [4, 6], [5, 7],
	[0, 4], [1, 5], [2, 6], [3, 7],
];

export function surfaceNets(f: Sdf, min: Vec3, max: Vec3, h: number): { positions: number[]; indices: number[] } {
	const nx = Math.ceil((max[0] - min[0]) / h) + 1;
	const ny = Math.ceil((max[1] - min[1]) / h) + 1;
	const nz = Math.ceil((max[2] - min[2]) / h) + 1;
	const vals = new Float32Array(nx * ny * nz);
	for (let k = 0; k < nz; k++)
		for (let j = 0; j < ny; j++)
			for (let i = 0; i < nx; i++) vals[i + nx * (j + ny * k)] = f(min[0] + i * h, min[1] + j * h, min[2] + k * h);
	const cx = nx - 1;
	const cy = ny - 1;
	const cz = nz - 1;
	const cell = new Int32Array(cx * cy * cz).fill(-1);
	const positions: number[] = [];
	const v = new Float32Array(8);
	for (let k = 0; k < cz; k++)
		for (let j = 0; j < cy; j++)
			for (let i = 0; i < cx; i++) {
				let mask = 0;
				for (let c = 0; c < 8; c++) {
					const val = vals[i + (c & 1) + nx * (j + ((c >> 1) & 1) + ny * (k + ((c >> 2) & 1)))];
					v[c] = val;
					if (val < 0) mask |= 1 << c;
				}
				if (mask === 0 || mask === 255) continue;
				let sx = 0;
				let sy = 0;
				let sz = 0;
				let n = 0;
				for (const [a, b] of EDGES) {
					if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
					const t = v[a] / (v[a] - v[b]);
					sx += lerpBit(a, b, 0, t);
					sy += lerpBit(a, b, 1, t);
					sz += lerpBit(a, b, 2, t);
					n++;
				}
				cell[i + cx * (j + cy * k)] = positions.length / 3;
				positions.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
			}
	const indices: number[] = [];
	const step = [1, nx, nx * ny];
	const dims = [cx, cy, cz];
	const p = [0, 0, 0];
	for (p[2] = 0; p[2] < nz; p[2]++)
		for (p[1] = 0; p[1] < ny; p[1]++)
			for (p[0] = 0; p[0] < nx; p[0]++) {
				const idx = p[0] + nx * (p[1] + ny * p[2]);
				for (let axis = 0; axis < 3; axis++) {
					const u = (axis + 1) % 3;
					const w = (axis + 2) % 3;
					if (p[axis] >= dims[axis] || p[u] === 0 || p[w] === 0 || p[u] >= dims[u] || p[w] >= dims[w]) continue;
					const inside0 = vals[idx] < 0;
					const inside1 = vals[idx + step[axis]] < 0;
					if (inside0 === inside1) continue;
					const q = [p[0], p[1], p[2]];
					const at = (du: number, dw: number) => {
						q[u] = p[u] - du;
						q[w] = p[w] - dw;
						return cell[q[0] + cx * (q[1] + cy * q[2])];
					};
					const a = at(0, 0);
					const b = at(1, 0);
					const c = at(1, 1);
					const d = at(0, 1);
					if (a < 0 || b < 0 || c < 0 || d < 0) continue;
					if (inside0) indices.push(a, b, c, a, c, d);
					else indices.push(a, c, b, a, d, c);
				}
			}
	return { positions, indices };
}

function lerpBit(a: number, b: number, bit: number, t: number): number {
	const ca = (a >> bit) & 1;
	const cb = (b >> bit) & 1;
	return ca + (cb - ca) * t;
}
