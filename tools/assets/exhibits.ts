// The two project exhibits, the base of the final installation, and the segment that the three
// passage rings are built from. Each exhibit is a set of rigid parts with an authored start pose
// (see shape.ts). Local coordinates: the guiding light passes through the origin of each exhibit
// along the z axis.
import { ARBOR } from './arbor.ts';
import { INSTRUMENT } from './instrument.ts';
import { clamp, mulberry32 } from './noise.ts';
import { disc, pitted, type Shape, withGrain } from './shape.ts';
import type { Sdf } from './surfacenets.ts';

export type { Shape } from './shape.ts';

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

const w = 2 * RING.radius * Math.sin(HALF_ARC) * 0.5 + 0.5;
export const SHAPES: Shape[] = [
	...ARBOR,
	...INSTRUMENT,
	{ name: 'base', group: 'base', coarse: base, fine: withGrain(base), min: [-3.3, -0.55, -3.3], max: [3.3, 0.55, 3.3], cell: 0.05 },
	{
		name: 'ring_segment',
		group: 'ring',
		coarse: ringSegment,
		fine: pitted(ringSegment),
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
