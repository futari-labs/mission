// Exhibit 01, Futari Engineering: a timber arbor that a climber grows through.
//
// Two supports stand on stone footings either side of the guiding light. Each divides at its head
// into three curved ribs, and the six ribs together close around the light like a bud that has
// begun to open. Arched pieces seat between the ribs and tie the two halves into one frame, with the
// widest arches standing over the light where it enters and leaves. Only then does the climber, planted in the bed between the footings, rise through it and flower.
//
// Local coordinates: the light passes through the origin along z, so nothing crosses that line.
import { clamp, lerp, mulberry32, smooth } from './noise.ts';
import { bounds, box, type Motion, part, type Shape, sweep } from './shape.ts';
import type { Sdf, Vec3 } from './surfacenets.ts';
import { ATLAS, type Branch, type Cards, card, type Part, tube } from './trees.ts';

const G = 'engineering';
const SIDES = [1, -1] as const;
/** Ribs fan from each support to these angles either side of straight out, in radians. */
const FAN = [-0.92, 0, 0.92] as const;
const HEAD: Vec3 = [0.93, -0.34, 0];
/** The height at which the arches spring from the ribs, and how high each rib of a hand stands. */
const SPRING = 0.62;
const TOPS = [1.84, 2.06, 1.84];

/** Smooth curve through values at even steps of t. */
function through(values: number[], t: number): number {
	const f = clamp(t) * (values.length - 1);
	const i = Math.min(values.length - 2, Math.floor(f));
	const k = f - i;
	const at = (j: number) => values[Math.max(0, Math.min(values.length - 1, j))];
	const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
	return b + 0.5 * k * (c - a + k * (2 * a - 5 * b + 4 * c - d + k * (3 * (b - c) + d - a)));
}

/** A point on a rib: `side` is which support, `fan` which of its three ribs (0 to 2), t 0 at the head to 1 at the tip. */
export function ribPoint(side: number, fan: number, t: number): { p: Vec3; out: Vec3 } {
	// out from the head, widest at the belly, drawn in at the neck, and the tip turned out like a petal
	const radius = through([HEAD[0], 1.2, 1.4, 1.42, 1.28, 1.1, 1.04, 1.2], t);
	const y = lerp(HEAD[1], TOPS[fan], t ** 0.94);
	// the outer ribs swing round in the lower half, then rise straight
	const angle = (side > 0 ? 0 : Math.PI) + FAN[fan] * smooth(0, 0.46, t);
	return { p: [Math.cos(angle) * radius, y, Math.sin(angle) * radius], out: [Math.cos(angle), 0, Math.sin(angle)] };
}

/** A point on one leg of a support: `face` is +1 for the leg toward +z. t 0 at the foot, 1 at the head. */
export function legPoint(side: number, face: number, t: number): Vec3 {
	return [side * lerp(0.76, HEAD[0] - 0.01, t), lerp(-1.44, HEAD[1] - 0.08, t), face * lerp(0.38, 0.07, t)];
}


const timber = (name: string, f: Sdf, points: Vec3[], pad: number, cell: number, motion: Motion, grain: Shape['grain']) => part(G, name, f, ...bounds(points, pad), cell, motion, 'timber', grain);

/** Where the tie beam passes through each support. */
const TIE = { x: 0.84, y: -1.0 };

function support(side: number): Shape[] {
	const legs = [1, -1].map((face) => sweep([legPoint(side, face, 0), legPoint(side, face, 1)], [[side, 0, 0], [side, 0, 0]], () => [0.085, 0.085], 0.014));
	const body: Sdf = (x, y, z) => {
		let d = Math.min(legs[0](x, y, z), legs[1](x, y, z));
		// a transom between the legs, which the tie beam passes through
		d = Math.min(d, box(x, y, z, side * TIE.x, TIE.y, 0, 0.065, 0.1, 0.36, 0.014));
		d = Math.max(d, -box(x, y, z, side * TIE.x, TIE.y, 0, 0.2, 0.062, 0.05, 0.004));
		// the head: a block the legs meet in and the ribs spring from, with a peg through it
		d = Math.min(d, box(x, y, z, side * HEAD[0], HEAD[1] - 0.02, 0, 0.15, 0.15, 0.2, 0.03));
		return Math.min(d, Math.max(Math.hypot(y - HEAD[1] + 0.02, z) - 0.028, Math.abs(x - side * HEAD[0]) - 0.19));
	};
	// bronze: a shoe on each foot, a band under the head, and a strap where the tie comes through
	const metal: Sdf = (x, y, z) => {
		let d = Infinity;
		for (const face of [1, -1]) {
			const foot = legPoint(side, face, 0.05);
			d = Math.min(d, box(x, y, z, foot[0], -1.37, foot[2], 0.108, 0.085, 0.108, 0.012));
		}
		d = Math.min(d, box(x, y, z, side * (HEAD[0] - 0.03), HEAD[1] - 0.26, 0, 0.115, 0.03, 0.21, 0.01));
		return Math.min(d, Math.max(box(x, y, z, side * TIE.x, TIE.y, 0, 0.078, 0.112, 0.085, 0.01), -box(x, y, z, side * TIE.x, TIE.y, 0, 0.3, 0.064, 0.052, 0.004)));
	};
	const motion: Motion = { from: [side * 3.2, 4.6, 0], axis: [0, 0, 1], angle: side * 0.55, window: side > 0 ? [0.1, 0.32] : [0.15, 0.37] };
	const name = side > 0 ? 'east' : 'west';
	const reach: Vec3[] = [[side * 0.6, -1.5, -0.5], [side * 1.2, HEAD[1] + 0.2, 0.5]];
	return [timber(`support_${name}`, body, reach, 0.02, 0.03, motion, [side * 0.1, 1, 0]), part(G, `fittings_${name}`, metal, ...bounds(reach, 0.02), 0.026, motion, 'metal')];
}

function rib(side: number, fan: number, index: number): Shape {
	const steps = 24;
	const line = Array.from({ length: steps + 1 }, (_, i) => ribPoint(side, fan, i / steps));
	// deep at the root and fine at the tip
	const bar = sweep(line.map((l) => l.p), line.map((l) => l.out), (t) => [lerp(0.088, 0.05, t), lerp(0.06, 0.038, t)], 0.014);
	const out = line[10].out;
	// the middle rib of each hand goes up first, then the two beside it
	const start = 0.36 + (fan === 1 ? 0 : 0.1) + index * 0.022;
	return timber(`rib_${index}`, bar, line.map((l) => l.p), 0.12, 0.028, { from: [out[0] * 2.8, 3.2, out[2] * 2.8], axis: [-out[2], 0, out[0]], angle: -0.9, window: [start, start + 0.22] }, [0, 1, 0]);
}

/** Where each rib passes the height the arches spring from, in order around the frame. */
const springs = SIDES.flatMap((side) =>
	FAN.map((_, fan) => {
		let t = 0;
		while (t < 1 && ribPoint(side, fan, t).p[1] < SPRING) t += 0.002;
		const p = ribPoint(side, fan, t).p;
		return { angle: Math.atan2(p[2], p[0]), radius: Math.hypot(p[0], p[2]) };
	}),
).sort((a, b) => a.angle - b.angle);

/** A point on the arch between spring `i` and the next, k 0 to 1 across it. Wider arches rise higher. */
export function archPoint(i: number, k: number, lift = 0): Vec3 {
	const a = springs[i];
	const b = springs[(i + 1) % springs.length];
	const span = (b.angle - a.angle + Math.PI * 2) % (Math.PI * 2);
	const angle = a.angle + span * k;
	const rise = Math.sin(Math.PI * k);
	const radius = lerp(a.radius, b.radius, k) + 0.035 + 0.05 * rise + lift;
	return [Math.cos(angle) * radius, SPRING + (0.14 + 0.24 * span) * rise ** 0.8, Math.sin(angle) * radius];
}

function arches(): Shape[] {
	return springs.map((_, i) => {
		const steps = 16;
		const line = Array.from({ length: steps + 1 }, (_, k) => archPoint(i, k / steps));
		const bar = sweep(line, line.map((p) => [p[0], 0, p[2]] as Vec3), () => [0.036, 0.05], 0.012);
		// a peg through each foot, where the arch sits in its rib
		const f: Sdf = (x, y, z) => {
			let d = bar(x, y, z);
			for (const p of [line[0], line[steps]]) {
				const l = Math.hypot(p[0], p[2]);
				d = Math.min(d, Math.max(Math.hypot(y - p[1], (x * -p[2] + z * p[0]) / l) - 0.018, Math.abs((x * p[0] + z * p[2]) / l - l) - 0.1));
			}
			return d;
		};
		const mid = line[steps / 2];
		const wide = Math.abs(mid[0]) < 0.3;
		// the four between neighbouring ribs seat first. The two that span the light's path join the hands last.
		const start = wide ? 0.86 : 0.64 + i * 0.03;
		const l = Math.hypot(mid[0], mid[2]);
		return timber(`arch_${i}`, f, line, 0.1, 0.026, { from: [(mid[0] / l) * 2.4, wide ? 2.6 : 1.4, (mid[2] / l) * 2.4], axis: wide ? [1, 0, 0] : [0, 1, 0], angle: wide ? -0.6 * Math.sign(mid[2]) : 0.5, window: [start, start + (wide ? 0.13 : 0.18)] }, 'around');
	});
}

function foundations(): Shape[] {
	const footing = (side: number): Sdf => (x, y, z) => {
		// a dressed block with a chamfered top, on a wider rough course
		const top = Math.max(box(x, y, z, side * 0.8, -1.55, 0, 0.29, 0.11, 0.56, 0.02), (Math.abs(x - side * 0.8) + (y + 1.55)) * Math.SQRT1_2 - 0.255);
		return Math.min(top, box(x, y, z, side * 0.8, -1.7, 0, 0.34, 0.06, 0.62, 0.03));
	};
	const kerb: Sdf = (x, y, z) => Math.max(box(x, y, z, 0, -1.64, 0, 0.47, 0.12, 0.46, 0.03), -box(x, y, z, 0, -1.5, 0, 0.385, 0.2, 0.375, 0.02));
	const soil: Sdf = (x, y, z) => box(x, y, z, 0, -1.63, 0, 0.385, 0.06 + 0.03 * Math.cos(x * 3) * Math.cos(z * 3), 0.375, 0.03);
	return [
		...SIDES.map((side, k) => part(G, `footing_${side > 0 ? 'east' : 'west'}`, footing(side), [side * 0.8 - 0.34, -1.76, -0.62], [side * 0.8 + 0.34, -1.44, 0.62], 0.036, { from: [side * 0.8, 4.4 + k, 0], axis: [0, 1, 0], angle: side * 0.5, window: [k * 0.04, 0.16 + k * 0.04] })),
		part(G, 'bed', kerb, [-0.47, -1.76, -0.46], [0.47, -1.52, 0.46], 0.034, { from: [0, 4, 1.2], axis: [0, 1, 0], angle: -0.4, window: [0.06, 0.22] }),
		part(G, 'soil', soil, [-0.39, -1.7, -0.38], [0.39, -1.52, 0.38], 0.04, { from: [0, 4, 1.2], axis: [0, 1, 0], angle: -0.4, window: [0.06, 0.22] }, 'soil'),
	];
}

const tie: Shape = (() => {
	const f: Sdf = (x, y, z) => {
		// through both transoms, held by a wedge outside each
		let d = box(x, y, z, 0, TIE.y, 0, 1.04, 0.058, 0.046, 0.01);
		for (const side of SIDES) d = Math.min(d, box(x, y, z, side * (TIE.x + 0.12), TIE.y, 0, 0.016, 0.13, 0.03, 0.006));
		return d;
	};
	return timber('tie', f, [[-1.04, TIE.y - 0.13, -0.05], [1.04, TIE.y + 0.13, 0.05]], 0.02, 0.024, { from: [0, 2.4, 3.4], axis: [0, 1, 0], angle: 0.5, window: [0.28, 0.46] }, [1, 0, 0]);
})();

export const ARBOR: Shape[] = [
	...foundations(),
	...SIDES.flatMap(support),
	tie,
	...SIDES.flatMap((side, s) => [1, 0, 2].map((fan, k) => rib(side, fan, s * 3 + k))),
	...arches(),
];

/**
 * The climber. Its stems are tubes and its leaves and blossom are cards, in the same form as the
 * trees (see trees.ts), so the same shading draws them. What differs is what the fourth bake
 * channel of the wood and the first of the cards hold: how far the plant has grown when that
 * point appears, 0 at the root to 1 at the last tip.
 */
export function growClimber(): { wood: Part; cards: Cards } {
	const rng = mulberry32(2718);
	const wood: Part = { positions: [], normals: [], uvs: [], bake: [], indices: [] };
	const cards: Cards = { ...{ positions: [], normals: [], uvs: [], bake: [], indices: [] }, corners: [] };
	const jitter = (amount: number): Vec3 => [(rng() - 0.5) * amount, (rng() - 0.5) * amount, (rng() - 0.5) * amount];
	const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
	const outward = (p: Vec3): Vec3 => {
		const l = Math.hypot(p[0], p[2]) || 1;
		return [p[0] / l, 0.45, p[2] / l];
	};
	const LEAVES = [0, 1, 3, 7];

	/** One stem along a path. `from` and `to` are the growth at its two ends. Leaves and flowers follow it. */
	const stem = (path: Vec3[], radius: number, from: number, to: number, flowers: number, hanging = false) => {
		const lengths = [0];
		for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
		const total = lengths[lengths.length - 1];
		const grow = lengths.map((l) => lerp(from, to, l / total));
		const branch: Branch = { nodes: path, radii: path.map((_, i) => radius * lerp(1, 0.45, i / (path.length - 1))), order: 2, grow };
		tube(wood, branch, 5, 0, rng);
		for (let d = 0.1; d < total; d += 0.11 + 0.07 * rng()) {
			let i = 1;
			while (lengths[i] < d) i++;
			const k = (d - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
			const at: Vec3 = [lerp(path[i - 1][0], path[i][0], k), lerp(path[i - 1][1], path[i][1], k), lerp(path[i - 1][2], path[i][2], k)];
			const g = lerp(from, to, d / total);
			const out = outward(at);
			// a leaf spray, held a little off the stem
			card(cards, add(add(at, [out[0] * 0.07, 0.02, out[2] * 0.07]), jitter(0.09)), out, 0.1 + 0.07 * rng(), LEAVES[Math.floor(rng() * LEAVES.length)], rng() * 6.28, [clamp(g * 0.9 + 0.06), rng(), 0.72 + 0.28 * rng(), 0]);
			if (rng() > flowers) continue;
			if (hanging) {
				// a short chain of flowers hanging from the stem, smaller toward its end
				const drop = 3 + Math.floor(rng() * 3);
				for (let j = 0; j < drop; j++) card(cards, add(at, [(rng() - 0.5) * 0.04, -0.07 - j * 0.085, (rng() - 0.5) * 0.04]), out, 0.085 - j * 0.011, ATLAS.blossom[j % 2], rng() * 6.28, [clamp(0.15 + 0.6 * rng() + j * 0.05), rng(), 0.85, 1]);
			} else card(cards, add(add(at, [out[0] * 0.1, 0.05, out[2] * 0.1]), jitter(0.08)), out, 0.075 + 0.04 * rng(), ATLAS.blossom[Math.floor(rng() * 2)], rng() * 6.28, [clamp(0.1 + 0.85 * rng()), rng(), 0.9, 1]);
		}
	};

	for (const side of SIDES) {
		// toward the viewer on one hand and away on the other, so the two do not mirror each other
		const face = side;
		const root: Vec3 = [side * 0.3, -1.56, face * 0.14];
		// out of the bed and twice round the leg on the way up
		const climb: Vec3[] = [root, [side * 0.52, -1.42, face * 0.3]];
		const turns = 2.25;
		for (let i = 0; i <= 26; i++) {
			const t = 0.06 + 0.9 * (i / 26);
			const c = legPoint(side, face, t);
			const a = t * turns * Math.PI * 2 + (side > 0 ? 0 : 2);
			climb.push([c[0] + Math.cos(a) * 0.13, c[1], c[2] + Math.sin(a) * 0.13]);
		}
		stem(climb, 0.03, 0, 0.3, 0.1);
		const top = climb[climb.length - 1];
		// then along two ribs, standing a little off each
		const follow = (fan: number, upTo: number, to: number, flowers: number) => {
			const path: Vec3[] = [top];
			for (let i = 1; i <= 16; i++) {
				const t = 0.04 + (upTo - 0.04) * (i / 16);
				const r = ribPoint(side, fan, t);
				const wind = Math.sin(t * 9 + fan) * 0.05;
				path.push([r.p[0] + r.out[0] * 0.1 - r.out[2] * wind, r.p[1], r.p[2] + r.out[2] * 0.1 + r.out[0] * wind]);
			}
			stem(path, 0.021, 0.3, to, flowers);
			return path;
		};
		follow(2, 0.93, 0.9, 0.5);
		follow(1, 0.78, 0.8, 0.4);
		// and a runner over the wide arch beside it, which carries the hanging flowers
		const arch = springs.findIndex((_, i) => Math.abs(archPoint(i, 0.5)[0]) < 0.3 && Math.sign(archPoint(i, 0.5)[2]) === face);
		const along = (k: number) => archPoint(arch, side * face > 0 ? k : 1 - k, 0.05);
		stem(Array.from({ length: 11 }, (_, i) => add(along(0.04 + 0.62 * (i / 10)), [0, 0.04 + 0.015 * Math.sin(i * 2.1), 0])), 0.014, 0.58, 1, 0.9, true);
	}
	return { wood, cards };
}
