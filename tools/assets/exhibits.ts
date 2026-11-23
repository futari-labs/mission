// Signed distance fields for the two project exhibits, their crystal enclosures, and the
// base of the final installation. Local coordinates: the guiding light passes through the
// origin of each exhibit along the z axis.
import { makeNoise, mulberry32 } from './noise.ts';
import type { Sdf, Vec3 } from './surfacenets.ts';

const N = makeNoise(909);

function box(x: number, y: number, z: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r = 0.02): number {
	const qx = Math.abs(x - cx) - hx + r;
	const qy = Math.abs(y - cy) - hy + r;
	const qz = Math.abs(z - cz) - hz + r;
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

function disc(x: number, y: number, z: number, cy: number, radius: number, hy: number, r = 0.025): number {
	const qr = Math.hypot(x, z) - radius + r;
	const qy = Math.abs(y - cy) - hy + r;
	return Math.hypot(Math.max(qr, 0), Math.max(qy, 0)) + Math.min(Math.max(qr, qy), 0) - r;
}

export interface Shape {
	name: string;
	coarse: Sdf;
	fine: Sdf;
	min: Vec3;
	max: Vec3;
	cell: number;
}

const grain = (x: number, y: number, z: number) => 0.007 * N.fbm(x * 1.6, y * 1.6, z * 1.6, 2) + 0.004 * N.fbm(x * 6, y * 6, z * 6, 2);

// Exhibit 01. Three levels on four posts: a full plate (define), an open frame (review),
// and a part-built level (execute). Connector blocks mark every joint.
const LEVELS = [-0.95, -0.3, 0.45];
const assembly: Sdf = (x, y, z) => {
	let d = Math.min(box(x, y, z, 0, -1.58, 0, 1.28, 0.13, 1.28, 0.03), box(x, y, z, 0, -1.37, 0, 1.06, 0.08, 1.06, 0.03));
	const ax = Math.abs(x);
	const az = Math.abs(z);
	d = Math.min(d, box(ax, y, az, 0.82, -0.02, 0.82, 0.085, 1.28, 0.085));
	for (const ly of LEVELS) d = Math.min(d, box(ax, y, az, 0.82, ly, 0.82, 0.15, 0.13, 0.15, 0.025));
	d = Math.min(d, box(ax, y, az, 0.82, 1.26, 0.82, 0.13, 0.06, 0.13));
	d = Math.min(d, box(x, y, z, 0, LEVELS[0], 0, 1.0, 0.065, 1.0));
	d = Math.min(d, Math.max(box(x, y, z, 0, LEVELS[1], 0, 1.0, 0.065, 1.0), -box(x, y, z, 0, LEVELS[1], 0, 0.6, 0.4, 0.6, 0.01)));
	d = Math.min(d, box(x, y, z, 0, LEVELS[2], -0.52, 1.0, 0.065, 0.48), box(x, y, z, 0, LEVELS[2], 0.82, 1.0, 0.06, 0.075), box(x, y, z, 0.82, LEVELS[2], 0.2, 0.075, 0.06, 0.6));
	// a raised grid on the first plate: the plan
	if (Math.abs(y - (LEVELS[0] + 0.075)) < 0.08) {
		const gx = Math.abs(((x + 2) % 0.5) - 0.25);
		const gz = Math.abs(((z + 2) % 0.5) - 0.25);
		d = Math.min(d, Math.max(Math.min(gx, gz) - 0.018, Math.abs(y - (LEVELS[0] + 0.075)) - 0.014, ax - 0.92, az - 0.92));
	}
	return d;
};

// Exhibit 02. A ring on a post in front of four result plates that ride two runners.
// A hole through every plate lets the light pass from the ring to the last result.
const lens: Sdf = (x, y, z) => {
	let d = Math.min(disc(x, y, z, -1.95, 1.36, 0.1), disc(x, y, z, -1.8, 1.08, 0.06));
	const ring = Math.hypot(Math.hypot(x, y) - 1.05, z - 0.62) - 0.115;
	d = Math.min(d, ring, box(x, y, z, 0, -1.47, 0.62, 0.065, 0.36, 0.065), box(x, y, z, 0, -1.14, 0.62, 0.14, 0.05, 0.12));
	const ax = Math.abs(x);
	d = Math.min(d, box(ax, y, z, 0.62, -0.56, -0.5, 0.05, 0.05, 0.86), box(ax, y, z, 0.62, -1.2, -1.24, 0.05, 0.6, 0.05), box(ax, y, z, 0.62, -1.2, 0.2, 0.05, 0.6, 0.05));
	for (let i = 0; i < 4; i++) {
		const hw = 0.8 - 0.05 * i;
		const hh = 0.52 - 0.035 * i;
		const pz = 0.12 - 0.42 * i;
		const cy = -0.5 + hh;
		let plate = Math.max(box(x, y, z, 0, cy, pz, hw, hh, 0.032), 0.13 - Math.hypot(x, y));
		for (let b = 0; b < 3; b++) plate = Math.min(plate, box(x, y, z, -0.12 * (b % 2), cy + hh - 0.16 - b * 0.17, pz + 0.04, hw * (0.72 - 0.14 * b), 0.028, 0.014, 0.008));
		d = Math.min(d, plate);
	}
	return d;
};

const base: Sdf = (x, y, z) => {
	let d = Math.min(disc(x, y, z, -0.2, 3.1, 0.2, 0.04), disc(x, y, z, 0.1, 2.05, 0.12, 0.04), disc(x, y, z, 0.3, 1.15, 0.09, 0.03));
	const r = Math.hypot(x, z);
	d = Math.max(d, 0.035 - Math.hypot(r - 2.6, y - 0.0)); // a groove that the ring light fills
	return d;
};

function crystal(seed: number, body: Sdf, reach: number): Sdf {
	const rand = mulberry32(seed);
	const cuts: [number, number, number, number][] = [];
	for (let i = 0; i < 9; i++) {
		const a = rand() * Math.PI * 2;
		const up = (rand() - 0.35) * 1.3;
		const l = Math.hypot(Math.cos(a), up, Math.sin(a));
		cuts.push([Math.cos(a) / l, up / l, Math.sin(a) / l, reach * (0.86 + 0.16 * rand())]);
	}
	return (x, y, z) => {
		let d = body(x, y, z);
		for (const [nx, ny, nz, off] of cuts) d = Math.max(d, x * nx + y * ny + z * nz - off);
		return d;
	};
}

const prism = crystal(31, (x, y, z) => Math.max(box(x, y, z, 0, -0.12, 0, 1.6, 2.1, 1.6, 0.04), (Math.abs(x) + Math.abs(z)) * Math.SQRT1_2 - 1.92), 2.25);
const hex = crystal(57, (x, y, z) => {
	const ax = Math.abs(x);
	const ay = Math.abs(y + 0.25);
	const h = Math.max(ay, ax * 0.866 + ay * 0.5) - 2.05;
	return Math.max(h, Math.abs(z + 0.3) - 1.55, Math.abs(z + 0.3) + 0.4 * Math.hypot(x, y + 0.25) - 2.15);
}, 2.45);

const withGrain = (f: Sdf): Sdf => (x, y, z) => f(x, y, z) + grain(x, y, z);
const wavy = (f: Sdf): Sdf => (x, y, z) => f(x, y, z) + 0.012 * N.fbm(x * 1.1, y * 1.1, z * 1.1, 2) + 0.004 * N.n3(x * 5, y * 5, z * 5);

export const SHAPES: Shape[] = [
	{ name: 'engineering', coarse: assembly, fine: withGrain(assembly), min: [-1.45, -1.85, -1.45], max: [1.45, 1.5, 1.45], cell: 0.034 },
	{ name: 'engineering_shell', coarse: prism, fine: wavy(prism), min: [-2.1, -2.5, -2.1], max: [2.1, 2.3, 2.1], cell: 0.07 },
	{ name: 'kensaku', coarse: lens, fine: withGrain(lens), min: [-1.55, -2.2, -1.5], max: [1.55, 1.35, 0.95], cell: 0.03 },
	{ name: 'kensaku_shell', coarse: hex, fine: wavy(hex), min: [-2.6, -2.7, -2.2], max: [2.6, 2.2, 1.6], cell: 0.07 },
	{ name: 'base', coarse: base, fine: withGrain(base), min: [-3.3, -0.55, -3.3], max: [3.3, 0.55, 3.3], cell: 0.05 },
];
