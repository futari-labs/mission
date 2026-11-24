// Exhibit 02, Kensaku: an open optical instrument standing in a shallow basin of water.
//
// Two stone piers rise out of the water and carry a bronze mount on trunnions. The mount holds a
// glass lens on the line of the guiding light. In front of it and below, a mirror on a stem turns
// to catch the summer sun and throw it up into the lens. Behind it, three slate plates of results
// stand in line on a rail. When the mirror is true and the iris has opened, the light comes to a
// point on the nearest plate and one line of it lights.
//
// Local coordinates: the light passes through the origin along z. The camera stands toward +z.
import { clamp } from './noise.ts';
import { bounds, box, disc, type Motion, part, type Shape, sweep } from './shape.ts';
import type { Sdf, Vec3 } from './surfacenets.ts';

const G = 'kensaku';
/** Where the lens stands on the axis, and the size of the mount around it. */
export const LENS = { z: 0.35, radius: 0.76, mount: 0.92 };
/** The middle of the mirror, and the way its face looks once it has been turned to the sun. */
export const MIRROR = { at: [0, -1.02, 1.96] as Vec3, normal: [-0.236, 0.92, -0.305] as Vec3, radius: 0.3 };
/** Where each plate stands on the axis. The light comes to its point on the first. */
export const PLATES = [-0.3, -0.72, -1.14];
// The app draws the water, the lens glass, and the light itself. Where they sit is repeated in
// `exhibit.optics` in src/scene/look.ts, and the two must agree.
const PIER = 1.12;

const round2 = (a: number, b: number, r: number) => Math.hypot(Math.max(a + r, 0), Math.max(b + r, 0)) + Math.min(Math.max(a + r, b + r), 0) - r;

const basin: Sdf = (x, y, z) => {
	// a low rim around a shallow floor, on a wider course that meets the ground
	const rim = Math.max(disc(x, y, z, -1.9, 1.56, 0.13, 0.035), -disc(x, y, z, -1.74, 1.38, 0.1, 0.02));
	return Math.min(rim, disc(x, y, z, -2.0, 1.68, 0.05, 0.03));
};

const pier = (side: number): Sdf => (x, y, z) => {
	const dz = z - LENS.z;
	// slimmer toward the top, on a foot that stands in the water
	const taper = 0.02 * clamp((y + 1.8) / 1.9);
	let d = box(x, y, z, side * PIER, -0.86, LENS.z, 0.1 - taper, 0.98, 0.16 - taper, 0.02);
	d = Math.min(d, box(x, y, z, side * PIER, -1.8, LENS.z, 0.17, 0.085, 0.23, 0.025));
	// the head is cut to cradle the trunnion
	return Math.max(d, -Math.max(Math.hypot(Math.max(y, 0) - 0, dz) - 0.058, -y - 0.02));
};

const mount: Sdf = (x, y, z) => {
	const r = Math.hypot(x, y);
	const dz = z - LENS.z;
	let d = round2(Math.abs(r - 0.84) - 0.08, Math.abs(dz) - 0.075, 0.012);
	// a bead around each edge, and studs around the face
	d = Math.min(d, Math.hypot(r - 0.9, Math.abs(dz) - 0.075) - 0.026);
	const a = Math.round(Math.atan2(y, x) / (Math.PI / 6)) * (Math.PI / 6);
	d = Math.min(d, Math.hypot(x - Math.cos(a) * 0.835, y - Math.sin(a) * 0.835, dz - 0.078) - 0.026);
	// trunnions out to the piers, with a hand wheel beyond each
	d = Math.min(d, Math.max(Math.hypot(y, dz) - 0.05, Math.abs(Math.abs(x) - 1.08) - 0.2));
	return Math.min(d, round2(Math.hypot(y, dz) - 0.105, Math.abs(Math.abs(x) - 1.29) - 0.022, 0.012));
};

// two spherical faces meeting at a thin edge inside the mount
const lens: Sdf = (x, y, z) => {
	const dz = z - LENS.z;
	const R = 1.75;
	const face = Math.max(Math.hypot(x, y, dz - (R - 0.085)) - R, Math.hypot(x, y, dz + (R - 0.085)) - R);
	return Math.max(face, Math.hypot(x, y) - LENS.radius - 0.02);
};

function blade(index: number): Shape {
	const mid = ((90 + index * 120) * Math.PI) / 180;
	const half = (50 * Math.PI) / 180;
	const z = LENS.z + 0.118;
	const f: Sdf = (x, y, zz) => {
		// a crescent lying against the inside of the mount
		const r = Math.hypot(x, y);
		let turn = Math.atan2(y, x) - mid;
		turn = Math.atan2(Math.sin(turn), Math.cos(turn));
		// wider at the hinge than at the tip
		const taper = 0.1 - 0.05 * clamp(turn / half, -1, 1);
		const flat = Math.max(Math.abs(r - (0.79 - taper)) - taper, (Math.abs(turn) - half) * r);
		return round2(flat, Math.abs(zz - z) - 0.017, 0.006);
	};
	const hinge: Vec3 = [Math.cos(mid - half) * 0.8, Math.sin(mid - half) * 0.8, z];
	// closed, each blade lies across the lens. Opening swings it back against the mount.
	return part(G, `blade_${index}`, f, [-0.85, -0.85, z - 0.03], [0.85, 0.85, z + 0.03], 0.017, { from: [0, 0, 0], axis: [0, 0, 1], angle: 0.78, window: [1.12, 1.62], pivot: hinge, rides: 'kensaku_mount' }, 'metal');
}

const stem: Sdf = (() => {
	const m = MIRROR.at;
	const rod = sweep([[0, -1.82, 1.46], [0, -1.5, 1.6], [0, -1.24, m[2] - 0.02]], [[1, 0, 0], [1, 0, 0], [1, 0, 0]], () => [0.036, 0.036], 0.02);
	return (x, y, z) => {
		// a foot on the rim, a rod, and a fork that holds the mirror by its edge
		let d = Math.min(rod(x, y, z), box(x, y, z, 0, -1.79, 1.47, 0.11, 0.035, 0.09, 0.015));
		d = Math.min(d, box(x, y, z, 0, -1.24, m[2], 0.37, 0.026, 0.026, 0.012));
		return Math.min(d, box(Math.abs(x), y, z, 0.355, -1.13, m[2], 0.024, 0.13, 0.024, 0.01));
	};
})();

const mirrorDistance = (x: number, y: number, z: number): [number, number] => {
	const [px, py, pz] = [x - MIRROR.at[0], y - MIRROR.at[1], z - MIRROR.at[2]];
	const h = px * MIRROR.normal[0] + py * MIRROR.normal[1] + pz * MIRROR.normal[2];
	return [Math.hypot(px - MIRROR.normal[0] * h, py - MIRROR.normal[1] * h, pz - MIRROR.normal[2] * h), h];
};
const mirror: Sdf = (x, y, z) => {
	const [r, h] = mirrorDistance(x, y, z);
	// a disc in a rolled rim
	return Math.min(round2(r - MIRROR.radius, Math.abs(h) - 0.018, 0.008), Math.hypot(r - MIRROR.radius, h) - 0.03);
};

const rail: Sdf = (x, y, z) => {
	const ax = Math.abs(x);
	// two rods under the plates, on a trestle at each end
	let d = Math.max(Math.hypot(ax - 0.42, y + 0.8) - 0.03, Math.abs(z + 0.72) - 0.72);
	for (const at of [-0.06, -1.38]) {
		d = Math.min(d, box(ax, y, z, 0, -0.84, at, 0.5, 0.028, 0.03, 0.012));
		d = Math.min(d, box(ax, y, z, 0.42, -1.36, at, 0.032, 0.52, 0.032, 0.012));
	}
	return d;
};

function plate(index: number): Shape {
	const z = PLATES[index];
	const hw = 0.6 + 0.05 * index;
	const top = 0.46 + 0.13 * index;
	const cy = (top - 0.7) / 2;
	const hh = (top + 0.7) / 2;
	// lines of a result, raised on the face. The second line of the first plate is the one that is chosen.
	const lines = [0.3, 0.17, -0.3, -0.43].map((ly, k) => ({ y: ly + (top - 0.46), half: hw * [0.78, 0.6, 0.7, 0.46][k], x: -hw * [0.06, 0.24, 0.14, 0.38][k] }));
	const f: Sdf = (x, y, zz) => {
		// a thin slate with a hole for the light, standing on two shoes that ride the rail
		let d = Math.max(box(x, y, zz, 0, cy, z, hw, hh, 0.03, 0.01), 0.105 - Math.hypot(x, y));
		for (const l of lines) d = Math.min(d, box(x, y, zz, l.x, l.y, z + 0.04, l.half, 0.03, 0.02, 0.006));
		return Math.min(d, box(Math.abs(x), y, zz, 0.42, -0.74, z, 0.07, 0.055, 0.045, 0.012));
	};
	const side = index % 2 === 0 ? 1 : -1;
	const shape = part(G, `plate_${index}`, f, [-hw, -0.8, z - 0.05], [hw, top, z + 0.07], 0.028, { from: [side * 3.2, 0.2, 0], axis: [0, 1, 0], angle: side * 0.6, window: [0.58 + 0.09 * index, 0.8 + 0.09 * index] }, 'slate');
	if (index === 0) {
		const chosen = lines[1];
		// what lights when the light is brought to a point: the chosen line, and the edge of the hole
		shape.glow = (x, y, zz) => {
			const line = clamp(1 - Math.max(box(x, y, zz, chosen.x, chosen.y, z + 0.04, chosen.half, 0.03, 0.02, 0.006), 0) / 0.02);
			return zz > z ? Math.max(line, clamp(1 - Math.abs(Math.hypot(x, y) - 0.13) / 0.03)) : 0;
		};
	}
	return shape;
}

const fixed = (name: string, f: Sdf, lo: Vec3, hi: Vec3, cell: number, motion: Motion, substance: Shape['substance']) => part(G, name, f, lo, hi, cell, motion, substance);

const mirrorShape = (() => {
	const m = MIRROR.at;
	// stowed, the mirror lies back. It is turned up to the sun when the instrument is brought to bear.
	const shape = part(G, 'mirror', mirror, [m[0] - 0.36, m[1] - 0.2, m[2] - 0.36], [m[0] + 0.36, m[1] + 0.2, m[2] + 0.36], 0.018, { from: [0, 0, 0], axis: [1, 0, 0], angle: 0.85, window: [1.0, 1.4], pivot: m, rides: 'kensaku_stem' }, 'metal');
	// the polished face
	shape.glow = (x, y, z) => {
		const [r, h] = mirrorDistance(x, y, z);
		return h > 0 ? clamp((MIRROR.radius - 0.03 - r) / 0.02) : 0;
	};
	return shape;
})();

export const INSTRUMENT: Shape[] = [
	fixed('basin', basin, [-1.68, -2.05, -1.68], [1.68, -1.76, 1.68], 0.05, { from: [0, 4.4, 0], axis: [0, 1, 0], angle: 0.7, window: [0, 0.2] }, 'stone'),
	...[1, -1].map((side, k) => fixed(`pier_${side > 0 ? 'east' : 'west'}`, pier(side), [side * PIER - 0.18, -1.89, LENS.z - 0.24], [side * PIER + 0.18, 0.13, LENS.z + 0.24], 0.03, { from: [side * 2.6, 4.2, 0], axis: [0, 0, 1], angle: side * 0.5, window: [0.1 + 0.05 * k, 0.32 + 0.05 * k] }, 'stone')),
	fixed('rail', rail, [-0.5, -1.89, -1.46], [0.5, -0.76, 0.02], 0.022, { from: [0, 0.5, -3.8], axis: [0, 1, 0], angle: 0.3, window: [0.2, 0.42] }, 'metal'),
	fixed('stem', stem, ...bounds([[-0.38, -1.83, 1.38], [0.38, -1.0, MIRROR.at[2] + 0.03]], 0.02), 0.02, { from: [0, 2.6, 2.8], axis: [1, 0, 0], angle: -0.6, window: [0.26, 0.46] }, 'metal'),
	mirrorShape,
	// the mount comes down lying flat and swings upright on its trunnions as it seats
	fixed('mount', mount, [-1.32, -0.95, LENS.z - 0.11], [1.32, 0.95, LENS.z + 0.11], 0.025, { from: [0, 3.2, 0], axis: [1, 0, 0], angle: 1.3, window: [0.36, 0.6], pivot: [0, 0, LENS.z] }, 'metal'),
	fixed('lens', lens, [-0.79, -0.79, LENS.z - 0.1], [0.79, 0.79, LENS.z + 0.1], 0.03, { from: [0, 0.2, 3.4], axis: [0, 1, 0], angle: 0.5, window: [0.52, 0.72] }, 'glass'),
	...[0, 1, 2].map(blade),
	...[0, 1, 2].map(plate),
];
