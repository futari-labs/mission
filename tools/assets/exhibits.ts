// Signed distance fields for the two project exhibits, their crystal enclosures, the base of the
// final installation, and the segment that the three passage rings are built from.
//
// Each sculpture is a set of rigid parts. A part has its shape in the assembled pose and an authored
// start pose: where it comes from, how it is turned, and when in the assembly it moves. The runtime
// derives every frame from those two poses and the scroll position.
// Local coordinates: the guiding light passes through the origin of each exhibit along the z axis.
import { clamp, makeNoise, mulberry32 } from './noise.ts';
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

/** Start pose of a part relative to its assembled pose, and when it moves. */
export interface Motion {
	/** Where the part starts, as an offset in metres from its seated position. */
	from: Vec3;
	/** It starts turned by `angle` radians about `axis`, through its own centre. */
	axis: Vec3;
	angle: number;
	/** The slice of the assembly, 0 to 1, in which this part travels and seats. */
	window: [number, number];
}

export interface Shape {
	name: string;
	/** Parts with the same group form one sculpture: they occlude each other and share a particle form. */
	group: string;
	coarse: Sdf;
	fine: Sdf;
	min: Vec3;
	max: Vec3;
	cell: number;
	motion?: Motion;
	/** Marks where joint light shows, 0 to 1. Only the ring segment uses it. */
	glow?: Sdf;
}

const grain = (x: number, y: number, z: number) => 0.007 * N.fbm(x * 1.6, y * 1.6, z * 1.6, 2) + 0.004 * N.fbm(x * 6, y * 6, z * 6, 2);
const withGrain = (f: Sdf): Sdf => (x, y, z) => f(x, y, z) + grain(x, y, z);
const wavy = (f: Sdf): Sdf => (x, y, z) => f(x, y, z) + 0.012 * N.fbm(x * 1.1, y * 1.1, z * 1.1, 2) + 0.004 * N.n3(x * 5, y * 5, z * 5);

function part(group: string, name: string, f: Sdf, min: Vec3, max: Vec3, cell: number, motion: Motion): Shape {
	const m = 0.12;
	return { name: `${group}_${name}`, group, coarse: f, fine: withGrain(f), min: [min[0] - m, min[1] - m, min[2] - m], max: [max[0] + m, max[1] + m, max[2] + m], cell, motion };
}

// ---- Exhibit 01. A foundation, four posts, and three levels lowered between them: a full plate
// (define), an open frame (review), and a part-built level (execute).
const LEVELS = [-0.95, -0.3, 0.45];
const HALF = 0.72;
const engineering: Shape[] = [
	part('engineering', 'base_low', (x, y, z) => box(x, y, z, 0, -1.58, 0, 1.28, 0.13, 1.28, 0.03), [-1.28, -1.71, -1.28], [1.28, -1.45, 1.28], 0.036, { from: [0, -5, 0], axis: [0, 1, 0], angle: 0.7, window: [0, 0.17] }),
	part('engineering', 'base_high', (x, y, z) => box(x, y, z, 0, -1.37, 0, 1.06, 0.08, 1.06, 0.03), [-1.06, -1.45, -1.06], [1.06, -1.29, 1.06], 0.036, { from: [0, -4, 0], axis: [0, 1, 0], angle: -0.8, window: [0.07, 0.24] }),
	...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz], k) =>
		part(
			'engineering',
			`post_${k}`,
			(x, y, z) => {
				const px = x - sx * 0.82;
				const pz = z - sz * 0.82;
				let d = Math.min(box(px, y, pz, 0, -0.02, 0, 0.085, 1.28, 0.085), box(px, y, pz, 0, 1.26, 0, 0.13, 0.06, 0.13));
				for (const ly of LEVELS) d = Math.min(d, box(px, y, pz, 0, ly, 0, 0.15, 0.13, 0.15, 0.025));
				return d;
			},
			[sx * 0.82 - 0.16, -1.31, sz * 0.82 - 0.16],
			[sx * 0.82 + 0.16, 1.33, sz * 0.82 + 0.16],
			0.03,
			{ from: [sx * 2.4, 6 + k * 0.6, sz * 2.4], axis: [-sz, 0, sx], angle: 0.6, window: [0.18 + 0.055 * k, 0.42 + 0.055 * k] },
		),
	),
	part(
		'engineering',
		'level_1',
		(x, y, z) => {
			let d = box(x, y, z, 0, LEVELS[0], 0, HALF, 0.065, HALF);
			// a raised grid: the plan
			if (Math.abs(y - (LEVELS[0] + 0.075)) < 0.08) {
				const gx = Math.abs(((x + 2) % 0.36) - 0.18);
				const gz = Math.abs(((z + 2) % 0.36) - 0.18);
				d = Math.min(d, Math.max(Math.min(gx, gz) - 0.016, Math.abs(y - (LEVELS[0] + 0.075)) - 0.014, Math.abs(x) - 0.64, Math.abs(z) - 0.64));
			}
			return d;
		},
		[-HALF, LEVELS[0] - 0.07, -HALF],
		[HALF, LEVELS[0] + 0.1, HALF],
		0.03,
		{ from: [0, 5.2, 0], axis: [0, 1, 0], angle: 0.22, window: [0.5, 0.68] },
	),
	part('engineering', 'level_2', (x, y, z) => Math.max(box(x, y, z, 0, LEVELS[1], 0, HALF, 0.065, HALF), -box(x, y, z, 0, LEVELS[1], 0, 0.44, 0.4, 0.44, 0.01)), [-HALF, LEVELS[1] - 0.07, -HALF], [HALF, LEVELS[1] + 0.07, HALF], 0.03, { from: [0, 5.4, 0], axis: [0, 1, 0], angle: -0.2, window: [0.6, 0.78] }),
	part('engineering', 'level_3_slab', (x, y, z) => box(x, y, z, 0, LEVELS[2], -0.36, HALF, 0.065, 0.36), [-HALF, LEVELS[2] - 0.07, -HALF], [HALF, LEVELS[2] + 0.07, 0], 0.03, { from: [0, 4.6, -1.6], axis: [1, 0, 0], angle: 0.35, window: [0.7, 0.87] }),
	part('engineering', 'level_3_beam_a', (x, y, z) => box(x, y, z, 0, LEVELS[2], 0.62, HALF, 0.06, 0.075), [-HALF, LEVELS[2] - 0.065, 0.54], [HALF, LEVELS[2] + 0.065, 0.7], 0.028, { from: [0, 4, 2.2], axis: [0, 0, 1], angle: 0.5, window: [0.78, 0.93] }),
	part('engineering', 'level_3_beam_b', (x, y, z) => box(x, y, z, 0.62, LEVELS[2], 0.13, 0.075, 0.06, 0.42), [0.54, LEVELS[2] - 0.065, -0.3], [0.7, LEVELS[2] + 0.065, 0.56], 0.028, { from: [3, 3.4, 0], axis: [1, 0, 0], angle: -0.5, window: [0.84, 0.98] }),
];

// ---- Exhibit 02. An optical instrument: a base, a stand, a rack, four result plates that slide
// into line, and a ring that closes from three arcs. A hole through every plate lets the light pass.
const RING_Z = 0.62;
const arc = (index: number): Sdf => {
	// three arcs of 120 degrees. The joint at the bottom sits on the stand.
	const a0 = ((30 + index * 120) * Math.PI) / 180;
	const a1 = a0 + (120 * Math.PI) / 180;
	return (x, y, z) => {
		const torus = Math.hypot(Math.hypot(x, y) - 1.05, z - RING_Z) - 0.115;
		const edge0 = -(-Math.sin(a0) * x + Math.cos(a0) * y) + 0.012;
		const edge1 = -Math.sin(a1) * x + Math.cos(a1) * y + 0.012;
		return Math.max(torus, edge0, edge1);
	};
};
const kensaku: Shape[] = [
	part('kensaku', 'base', (x, y, z) => Math.min(disc(x, y, z, -1.95, 1.36, 0.1), disc(x, y, z, -1.8, 1.08, 0.06)), [-1.36, -2.05, -1.36], [1.36, -1.74, 1.36], 0.034, { from: [0, -3.6, 0], axis: [0, 1, 0], angle: 0.9, window: [0, 0.24] }),
	part('kensaku', 'stand', (x, y, z) => Math.min(box(x, y, z, 0, -1.47, RING_Z, 0.065, 0.36, 0.065), box(x, y, z, 0, -1.14, RING_Z, 0.14, 0.05, 0.12)), [-0.14, -1.83, RING_Z - 0.12], [0.14, -1.09, RING_Z + 0.12], 0.026, { from: [0, 3.2, 1.4], axis: [1, 0, 0], angle: 0.5, window: [0.12, 0.36] }),
	part(
		'kensaku',
		'rack',
		(x, y, z) => {
			const ax = Math.abs(x);
			return Math.min(box(ax, y, z, 0.62, -0.56, -0.5, 0.05, 0.05, 0.86), box(ax, y, z, 0.62, -1.2, -1.24, 0.05, 0.6, 0.05), box(ax, y, z, 0.62, -1.2, 0.2, 0.05, 0.6, 0.05));
		},
		[-0.67, -1.8, -1.36],
		[0.67, -0.51, 0.36],
		0.028,
		{ from: [0, 0.4, -4.2], axis: [0, 1, 0], angle: 0.25, window: [0.16, 0.42] },
	),
	...[0, 1, 2, 3].map((i) => {
		const hw = 0.8 - 0.05 * i;
		const hh = 0.52 - 0.035 * i;
		const pz = 0.12 - 0.42 * i;
		const cy = -0.5 + hh;
		const side = i % 2 === 0 ? 1 : -1;
		return part(
			'kensaku',
			`plate_${i}`,
			(x, y, z) => {
				let plate = Math.max(box(x, y, z, 0, cy, pz, hw, hh, 0.032), 0.13 - Math.hypot(x, y));
				for (let b = 0; b < 3; b++) plate = Math.min(plate, box(x, y, z, -0.12 * (b % 2), cy + hh - 0.16 - b * 0.17, pz + 0.04, hw * (0.72 - 0.14 * b), 0.028, 0.014, 0.008));
				return plate;
			},
			[-hw, cy - hh, pz - 0.04],
			[hw, cy + hh, pz + 0.06],
			0.026,
			// plates come in from alternate sides, turned, and square up as they reach the line of the light
			{ from: [side * 3.4, 0.25, 0], axis: [0, 1, 0], angle: side * 0.55, window: [0.34 + 0.09 * i, 0.58 + 0.09 * i] },
		);
	}),
	...[0, 1, 2].map((i) => {
		const mid = ((90 + i * 120) * Math.PI) / 180;
		return part('kensaku', `arc_${i}`, arc(i), [-1.18, -1.18, RING_Z - 0.13], [1.18, 1.18, RING_Z + 0.13], 0.026, { from: [Math.cos(mid) * 2.3, Math.sin(mid) * 2.3, 0.9], axis: [0, 0, 1], angle: 0.75, window: [0.66 + 0.05 * i, 0.94 + 0.02 * i] });
	}),
];

// ---- The base of the final installation
const base: Sdf = (x, y, z) => {
	let d = Math.min(disc(x, y, z, -0.2, 3.1, 0.2, 0.04), disc(x, y, z, 0.1, 2.05, 0.12, 0.04), disc(x, y, z, 0.3, 1.15, 0.09, 0.03));
	const r = Math.hypot(x, z);
	d = Math.max(d, 0.035 - Math.hypot(r - 2.6, y - 0.0)); // a groove that the ring light fills
	return d;
};

// ---- One segment of a passage ring: an eighth of a stone ring whose axis is z, centred on the
// top of the ring. The runtime turns and scales copies of it into three rings.
export const RING = { radius: 3.7, segments: 8 };
const HALF_ARC = Math.PI / RING.segments;
const ringEdges = (x: number, y: number): [number, number] => {
	// distance past each end face of the segment. Negative inside.
	const a0 = Math.PI / 2 - HALF_ARC;
	const a1 = Math.PI / 2 + HALF_ARC;
	return [-(-Math.sin(a0) * x + Math.cos(a0) * y), -Math.sin(a1) * x + Math.cos(a1) * y];
};
const chips = (() => {
	const rand = mulberry32(88);
	return Array.from({ length: 7 }, () => {
		const a = Math.PI / 2 + (rand() - 0.5) * 2 * HALF_ARC * 0.9;
		const r = RING.radius + (rand() < 0.5 ? -0.52 : 0.52);
		return [Math.cos(a) * r, Math.sin(a) * r, (rand() < 0.5 ? -1 : 1) * 0.56, 0.09 + rand() * 0.12];
	});
})();
const ringSegment: Sdf = (x, y, z) => {
	const r = Math.hypot(x, y) - RING.radius;
	// a bevelled section: wider at the back, with a shallow channel around the outer face
	const qr = Math.abs(r) - 0.52 + 0.06;
	const qz = Math.abs(z) - 0.6 + 0.06;
	let d = Math.hypot(Math.max(qr, 0), Math.max(qz, 0)) + Math.min(Math.max(qr, qz), 0) - 0.06;
	d = Math.max(d, (Math.abs(r) + Math.abs(z)) * Math.SQRT1_2 - 0.68);
	d = Math.max(d, -(Math.hypot(r - 0.52, z) - 0.08));
	// a shallow step on the faces that look along the axis, so the ring reads as worked stone
	d = Math.max(d, -Math.max(Math.abs(r) - 0.26, 0.54 - Math.abs(z)));
	const [e0, e1] = ringEdges(x, y);
	d = Math.max(d, e0 + 0.02, e1 + 0.02);
	for (const [cx, cy, cz, cr] of chips) d = Math.max(d, cr - Math.hypot(x - cx, y - cy, z - cz));
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

const w = 2 * RING.radius * Math.sin(HALF_ARC) * 0.5 + 0.5;
export const SHAPES: Shape[] = [
	...engineering,
	{ name: 'engineering_shell', group: 'shell', coarse: prism, fine: wavy(prism), min: [-2.1, -2.5, -2.1], max: [2.1, 2.3, 2.1], cell: 0.07 },
	...kensaku,
	{ name: 'kensaku_shell', group: 'shell', coarse: hex, fine: wavy(hex), min: [-2.6, -2.7, -2.2], max: [2.6, 2.2, 1.6], cell: 0.07 },
	{ name: 'base', group: 'base', coarse: base, fine: withGrain(base), min: [-3.3, -0.55, -3.3], max: [3.3, 0.55, 3.3], cell: 0.05 },
	{
		name: 'ring_segment',
		group: 'ring',
		coarse: ringSegment,
		fine: (x, y, z) => ringSegment(x, y, z) + 2.2 * grain(x, y, z) + 0.05 * Math.max(0, N.n3(x * 7, y * 7, z * 7) - 0.45),
		min: [-w, RING.radius - 0.95, -0.76],
		max: [w, RING.radius + 0.76, 0.76],
		// 24 copies are in view at once, so this mesh is coarser than the exhibit parts
		cell: 0.066,
		// light shows on the two end faces, where a segment meets its neighbours
		glow: (x, y) => {
			const [e0, e1] = ringEdges(x, y);
			return clamp(1 - Math.min(-e0, -e1) / 0.13);
		},
	},
];

/** Everything one sculpture is made of, as a single field in its assembled pose. */
export function assembled(group: string): Sdf {
	const parts = SHAPES.filter((s) => s.group === group);
	return (x, y, z) => parts.reduce((d, s) => Math.min(d, s.coarse(x, y, z)), Infinity);
}
