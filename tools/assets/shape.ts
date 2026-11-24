// What a rigid part of a sculpture is, and the distance-field pieces the sculptures are built from.
//
// A part has its shape in the assembled pose and an authored start pose: where it comes from, how
// it is turned, and when in the assembly it moves. The runtime derives every frame from those two
// poses and the scroll position.
import { makeNoise } from './noise.ts';
import type { Sdf, Vec3 } from './surfacenets.ts';

const N = makeNoise(909);

/** Start pose of a part relative to its assembled pose, and when it moves. */
export interface Motion {
	/** Where the part starts, as an offset in metres from its seated position. */
	from: Vec3;
	/** It starts turned by `angle` radians about `axis`, through `pivot` or else its own centre. */
	axis: Vec3;
	angle: number;
	/**
	 * The slice of the assembly in which this part travels and seats. 0 to 1 is the structure going
	 * up. 1 to 2 is what the exhibit does once it stands, for parts that move then.
	 */
	window: [number, number];
	pivot?: Vec3;
	/** The name of a part this one is carried by until its own move begins. */
	rides?: string;
}

/** What a part is made of. The app gives each its own shading. */
export type Substance = 'stone' | 'soil' | 'slate' | 'timber' | 'metal' | 'glass';

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
	/** Marks where light shows, 0 to 1: the joints of a ring segment, the chosen line of a result plate. */
	glow?: Sdf;
	substance?: Substance;
	/** Timber only: the direction the grain runs, or 'around' for a piece bent around the vertical axis. */
	grain?: Vec3 | 'around';
}

export function box(x: number, y: number, z: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, r = 0.02): number {
	const qx = Math.abs(x - cx) - hx + r;
	const qy = Math.abs(y - cy) - hy + r;
	const qz = Math.abs(z - cz) - hz + r;
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

export function disc(x: number, y: number, z: number, cy: number, radius: number, hy: number, r = 0.025): number {
	const qr = Math.hypot(x, z) - radius + r;
	const qy = Math.abs(y - cy) - hy + r;
	return Math.hypot(Math.max(qr, 0), Math.max(qy, 0)) + Math.min(Math.max(qr, qy), 0) - r;
}

/**
 * A bar of rectangular section that follows a line of points. `out[i]` is the direction the bar's
 * first side faces at `points[i]`, and `half(t)` gives half its size across that side and across
 * the other, where t runs 0 to 1 along the bar.
 */
export function sweep(points: Vec3[], out: Vec3[], half: (t: number) => [number, number], r = 0.012): Sdf {
	const segments = points.slice(1).map((b, i) => {
		const a = points[i];
		const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const length = Math.hypot(...d);
		const t: Vec3 = [d[0] / length, d[1] / length, d[2] / length];
		// the facing direction, made square to the bar
		const o = out[i];
		const k = o[0] * t[0] + o[1] * t[1] + o[2] * t[2];
		const nl = Math.hypot(o[0] - t[0] * k, o[1] - t[1] * k, o[2] - t[2] * k);
		const n: Vec3 = [(o[0] - t[0] * k) / nl, (o[1] - t[1] * k) / nl, (o[2] - t[2] * k) / nl];
		const s: Vec3 = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
		return { a, t, n, s, length };
	});
	const count = segments.length;
	return (x, y, z) => {
		let best = Infinity;
		for (let i = 0; i < count; i++) {
			const g = segments[i];
			const px = x - g.a[0];
			const py = y - g.a[1];
			const pz = z - g.a[2];
			const along = px * g.t[0] + py * g.t[1] + pz * g.t[2];
			const h = Math.min(g.length, Math.max(0, along));
			const [ha, hb] = half((i + h / g.length) / count);
			const qa = Math.abs(px * g.n[0] + py * g.n[1] + pz * g.n[2]) - ha + r;
			const qb = Math.abs(px * g.s[0] + py * g.s[1] + pz * g.s[2]) - hb + r;
			// Each segment ends where the next begins. Past either end of the whole bar, a flat face closes it.
			const over = Math.abs(along - h);
			const end = (i === 0 && along < 0) || (i === count - 1 && along > g.length);
			const qc = over > 0 ? over + (end ? r : 0) : -1;
			const d = Math.hypot(Math.max(qa, 0), Math.max(qb, 0), Math.max(qc, 0)) + Math.min(Math.max(qa, qb, qc), 0) - r;
			if (d < best) best = d;
		}
		return best;
	};
}

const roughness: Record<Substance, number> = { stone: 1, soil: 2.4, slate: 0.35, timber: 0.4, metal: 0.12, glass: 0 };
const grainOf = (x: number, y: number, z: number) => 0.007 * N.fbm(x * 1.6, y * 1.6, z * 1.6, 2) + 0.004 * N.fbm(x * 6, y * 6, z * 6, 2);
export const withGrain =
	(f: Sdf, amount = 1): Sdf =>
	(x, y, z) =>
		f(x, y, z) + amount * grainOf(x, y, z);
/** Coarser breaks in a surface, for stone that should read as worked and weathered. */
export const pitted =
	(f: Sdf): Sdf =>
	(x, y, z) =>
		f(x, y, z) + 2.2 * grainOf(x, y, z) + 0.05 * Math.max(0, N.n3(x * 7, y * 7, z * 7) - 0.45);

/** Outside its box by more than this, a part answers with the distance to the box: enough for shading, and far quicker. */
const REACH = 0.5;

export function part(group: string, name: string, f: Sdf, min: Vec3, max: Vec3, cell: number, motion: Motion, substance: Substance = 'stone', grain?: Shape['grain']): Shape {
	const m = 0.12;
	const lo: Vec3 = [min[0] - m, min[1] - m, min[2] - m];
	const hi: Vec3 = [max[0] + m, max[1] + m, max[2] + m];
	const bounded: Sdf = (x, y, z) => {
		const d = Math.hypot(Math.max(lo[0] - x, x - hi[0], 0), Math.max(lo[1] - y, y - hi[1], 0), Math.max(lo[2] - z, z - hi[2], 0));
		return d > REACH ? d : f(x, y, z);
	};
	return { name: `${group}_${name}`, group, coarse: bounded, fine: roughness[substance] > 0 ? withGrain(f, roughness[substance]) : f, min: lo, max: hi, cell, motion, substance, grain };
}

/** The box that holds a set of points, grown by `pad`. */
export function bounds(points: Vec3[], pad: number): [Vec3, Vec3] {
	const lo: Vec3 = [Infinity, Infinity, Infinity];
	const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
	for (const p of points)
		for (let k = 0; k < 3; k++) {
			lo[k] = Math.min(lo[k], p[k] - pad);
			hi[k] = Math.max(hi[k], p[k] + pad);
		}
	return [lo, hi];
}
