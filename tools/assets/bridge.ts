// The Futari bridge: two balanced cantilever halves built from separate stone blocks.
// Every block is a signed distance field: an extruded profile with worn edges, a recessed
// panel, seeded chips, and surface noise. The halves stop short of each other at the seam.
import { clamp, lerp, makeNoise, mulberry32 } from './noise.ts';
import type { Vec3 } from './surfacenets.ts';

export type Pt = [number, number];
export type BlockKind = 'plinth' | 'pier' | 'table' | 'front' | 'back';

export interface Block {
	name: string;
	side: -1 | 1;
	kind: BlockKind;
	/** Build order within its half, from the ground outward. Drives the entrance. */
	order: number;
	poly: Pt[];
	zc: number;
	depth: number;
	recess: boolean;
	chips: [number, number, number, number][];
	min: Vec3;
	max: Vec3;
	pivot: Vec3;
	/** Direction a block moves when it loosens. */
	out: Vec3;
	tint: number;
}

export const SEAM_GAP = 0.44;
const BACK = -7.7;
const PX0 = -5.9;
const PC = -4.7;
const PX1 = -3.5;
const TIP = -SEAM_GAP / 2;
const HY = 3.3;
const J = 0.02;
const ROUND = 0.055;
const N = makeNoise(77);

interface HalfSpec {
	side: -1 | 1;
	tipY: number;
	frontCuts: number[];
	backCuts: number[];
	courses: number[];
	splitCourse: number;
	seed: number;
}

const HALVES: HalfSpec[] = [
	{ side: -1, tipY: 5.86, frontCuts: [0.21, 0.42, 0.62, 0.81], backCuts: [0.52], courses: [0.6, 1.95], splitCourse: 1, seed: 11 },
	{ side: 1, tipY: 5.7, frontCuts: [0.27, 0.53, 0.78], backCuts: [0.45], courses: [0.6, 1.5, 2.4], splitCourse: 2, seed: 23 },
];

function piecewise(points: Pt[], x: number): number {
	for (let i = 0; i < points.length - 1; i++) {
		const [x0, y0] = points[i];
		const [x1, y1] = points[i + 1];
		if (x <= x1 || i === points.length - 2) return lerp(y0, y1, clamp((x - x0) / (x1 - x0)));
	}
	return points[points.length - 1][1];
}

function buildHalf(spec: HalfSpec): Block[] {
	const rand = mulberry32(spec.seed);
	const jitter = (a: number, b: number) => a + (b - a) * rand();
	const deck: Pt[] = [[BACK, 5.25], [PC, 5.42], [TIP, spec.tipY]];
	const soffitFront: Pt[] = [[PX1, HY], [-2.15, 4.5], [TIP, spec.tipY - 0.7]];
	const soffitBack: Pt[] = [[BACK, 4.05], [PX0, HY]];
	const deckY = (x: number) => piecewise(deck, x);
	const blocks: Block[] = [];
	let order = 0;
	const add = (kind: BlockKind, poly: Pt[], depth: number, out: Vec3, recess: boolean, chipCount: number) => {
		const zc = jitter(-0.03, 0.03);
		const mirrored: Pt[] = poly.map(([x, y]) => [x * -spec.side, y]);
		const xs = mirrored.map((p) => p[0]);
		const ys = mirrored.map((p) => p[1]);
		const min: Vec3 = [Math.min(...xs), Math.min(...ys), zc - depth / 2];
		const max: Vec3 = [Math.max(...xs), Math.max(...ys), zc + depth / 2];
		const chips: Block['chips'] = [];
		for (let c = 0; c < chipCount; c++) {
			const i = Math.floor(rand() * mirrored.length);
			const a = mirrored[i];
			const b = mirrored[(i + 1) % mirrored.length];
			const t = rand();
			const onFace = rand() < 0.7;
			const z = onFace ? zc + (rand() < 0.5 ? -1 : 1) * depth * 0.5 : zc + jitter(-0.5, 0.5) * depth;
			chips.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), z, jitter(0.07, 0.19)]);
		}
		blocks.push({
			name: `${spec.side < 0 ? 'L' : 'R'}${String(blocks.length).padStart(2, '0')}_${kind}`,
			side: spec.side,
			kind,
			order: order++,
			poly: mirrored,
			zc,
			depth,
			recess,
			chips,
			min,
			max,
			pivot: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, zc],
			out: [out[0] * -spec.side, out[1], out[2] * (rand() < 0.5 ? -1 : 1)],
			tint: rand(),
		});
	};

	// pier: a plinth, then battered courses, one of them split by a vertical joint
	const half = (y: number) => 1.2 + 0.42 * (1 - clamp(y / HY));
	const wp = half(0) + 0.24;
	add('plinth', [[PC - wp, -1.3], [PC + wp, -1.3], [PC + wp, 0.44], [PC + wp - 0.13, 0.6 - J], [PC - wp + 0.13, 0.6 - J], [PC - wp, 0.44]], 3.78, [0, 0, 1], false, 5);
	const ys = [...spec.courses, HY];
	for (let i = 0; i < ys.length - 1; i++) {
		const y0 = ys[i] + J;
		const y1 = ys[i + 1] - J;
		const cuts = i + 1 === spec.splitCourse ? [PC + jitter(-0.3, 0.3)] : [];
		const edges = [null, ...cuts, null];
		for (let k = 0; k < edges.length - 1; k++) {
			const l = edges[k];
			const r = edges[k + 1];
			const l0 = l === null ? PC - half(y0) : l + J;
			const l1 = l === null ? PC - half(y1) : l + J;
			const r0 = r === null ? PC + half(y0) : r - J;
			const r1 = r === null ? PC + half(y1) : r - J;
			add('pier', [[l0, y0], [r0, y0], [r1, y1], [l1, y1]], 3.36 + jitter(-0.04, 0.04), [k === 0 ? -0.5 : 0.5, 0.1, 1], false, 4);
		}
	}
	add('table', [[PX0 + J, HY + J], [PX1 - J, HY + J], [PX1 - J, deckY(PX1 - J)], [PC, deckY(PC)], [PX0 + J, deckY(PX0 + J)]], 3.16, [0, 1, 0.25], true, 3);

	const arm = (kind: 'front' | 'back', x0: number, x1: number, cuts: number[], soffit: Pt[], d0: number, d1: number) => {
		const fr = [0, ...cuts.map((c) => c + jitter(-0.015, 0.015)), 1];
		const armOrder = order;
		for (let i = 0; i < fr.length - 1; i++) {
			const pa = lerp(x0, x1, fr[i]);
			const pb = lerp(x0, x1, fr[i + 1]);
			// a joint gap everywhere except at the free end of the arm
			const lo = Math.min(pa, pb) + (Math.min(pa, pb) === BACK ? 0 : J);
			const hi = Math.max(pa, pb) - (Math.max(pa, pb) === TIP ? 0 : J);
			const step = jitter(-0.025, 0.035);
			const bottom: Pt[] = [[lo, piecewise(soffit, lo)], ...soffit.filter(([x]) => x > lo + 0.05 && x < hi - 0.05), [hi, piecewise(soffit, hi)]];
			const topPts: Pt[] = [[hi, deckY(hi) + step], ...deck.filter(([x]) => x > lo + 0.05 && x < hi - 0.05).reverse().map(([x, y]): Pt => [x, y + step]), [lo, deckY(lo) + step]];
			const mid = (fr[i] + fr[i + 1]) / 2;
			const toward = kind === 'front' ? 1 : -1;
			order = armOrder + i;
			add(kind, [...bottom, ...topPts], lerp(d0, d1, mid) + jitter(-0.05, 0.05), [0.55 * toward, 0.75, 0.35], false, 2);
		}
		order = armOrder + fr.length - 1;
	};
	const tableOrder = order;
	arm('front', PX1, TIP, spec.frontCuts, soffitFront, 2.96, 1.92);
	order = tableOrder;
	arm('back', PX0, BACK, spec.backCuts, soffitBack, 2.96, 2.62);
	return blocks;
}

export const BLOCKS: Block[] = HALVES.flatMap(buildHalf);

export const SEAM = {
	gap: SEAM_GAP,
	yMin: Math.min(...HALVES.map((h) => h.tipY - 0.7)),
	yMax: Math.max(...HALVES.map((h) => h.tipY)),
	depth: 1.92,
};

/** Signed distance to a closed polygon. Negative inside. */
function sdPolygon(px: number, py: number, poly: Pt[]): number {
	let d = Infinity;
	let sign = 1;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		const ex = xj - xi;
		const ey = yj - yi;
		const wx = px - xi;
		const wy = py - yi;
		const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey));
		const bx = wx - ex * t;
		const by = wy - ey * t;
		d = Math.min(d, bx * bx + by * by);
		const c1 = py >= yi;
		const c2 = py < yj;
		const c3 = ex * wy > ey * wx;
		if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
	}
	return sign * Math.sqrt(d);
}

/** Block shape without chips or noise. Cheap enough for occlusion sampling. */
export function sdBlockCoarse(b: Block, x: number, y: number, z: number): number {
	const ox = Math.max(b.min[0] - x, 0, x - b.max[0]);
	const oy = Math.max(b.min[1] - y, 0, y - b.max[1]);
	const oz = Math.max(b.min[2] - z, 0, z - b.max[2]);
	const outside = Math.hypot(ox, oy, oz);
	if (outside > 0.7) return outside;
	const d2 = sdPolygon(x, y, b.poly);
	const a = d2 + ROUND;
	const c = Math.abs(z - b.zc) - b.depth / 2 + ROUND;
	let d = Math.hypot(Math.max(a, 0), Math.max(c, 0)) + Math.min(Math.max(a, c), 0) - ROUND;
	if (b.recess) {
		const panel = Math.max(d2 + 0.21, b.depth / 2 - 0.05 - Math.abs(z - b.zc));
		d = Math.max(d, -panel);
	}
	return d;
}

const smax = (a: number, b: number, k: number) => {
	const h = clamp(0.5 - (0.5 * (a - b)) / k);
	return lerp(a, b, h) + k * h * (1 - h);
};

/** Full block shape: chips at edges and two scales of surface noise. */
export function sdBlock(b: Block, x: number, y: number, z: number): number {
	let d = sdBlockCoarse(b, x, y, z);
	if (d > 0.4) return d;
	for (const [cx, cy, cz, r] of b.chips) d = smax(d, r - Math.hypot(x - cx, y - cy, z - cz), 0.035);
	const low = N.fbm(x * 0.85 + b.tint * 40, y * 0.85, z * 0.85, 2);
	const mid = N.fbm(x * 3.6, y * 3.6 + b.tint * 9, z * 3.6, 2);
	const pit = Math.max(0, N.n3(x * 9, y * 9, z * 9) - 0.42);
	return d + 0.02 * low + 0.009 * mid + 0.05 * pit;
}

export function sdBridgeCoarse(x: number, y: number, z: number, skip: Block | null = null): number {
	let d = Infinity;
	for (const b of BLOCKS) if (b !== skip) d = Math.min(d, sdBlockCoarse(b, x, y, z));
	return d;
}
