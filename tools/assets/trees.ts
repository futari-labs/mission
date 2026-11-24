// Grows the trees of the seasonal groves: a branching skeleton per species, meshed as tapering
// bark tubes, with leaf and blossom clusters placed along the twigs as small cards.
//
// The wood is ordinary geometry. Every card is four vertices at the centre of its cluster, and
// the app pushes them out to the corners facing the camera, so a card can grow, thin, and fall
// with the season. What each vertex carries is documented on `TreeMesh`.
import { clamp, lerp, mulberry32, smooth } from './noise.ts';

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/** How one order of branching behaves. Order 0 is the trunk, 3 the twigs that carry the leaves. */
interface Order {
	/** How many of these grow from each parent, and from how far along it they start. */
	count: number;
	from: number;
	/** Angle away from the parent in radians, and length as a share of the parent's length. */
	angle: number;
	ratio: number;
	/** Thickness as a share of the parent where it leaves it. */
	thick: number;
	/** Random bending per step, and the pull upward (above 0) or downward along its length. */
	wander: number;
	lift: number;
	/** How much thinner the far end is than the near end, 0 to 1. */
	taper: number;
}

export interface Species {
	name: string;
	seed: number;
	height: number;
	radius: number;
	/** 0 keeps side branches the same length up the trunk, 1 shortens them toward the top. */
	conical: number;
	orders: [Order, Order, Order, Order];
	/** Leaf clusters: card half-size in metres, spacing along a twig, and which atlas cells to use. */
	leaf: { size: number; every: number; cells: number[] };
	/** Blossom clusters per metre of branch. */
	blossom: number;
}

// Three trees and a shrub. The shapes differ where it shows from far away: how low the trunk
// divides, how wide the crown spreads, and how much sky is left between the limbs.
export const SPECIES: Species[] = [
	{
		// spreading, low-forking, flat-topped: the blossom tree
		name: 'cherry',
		seed: 11,
		height: 3.0,
		radius: 0.3,
		conical: 0,
		orders: [
			{ count: 1, from: 0, angle: 0, ratio: 1, thick: 1, wander: 0.11, lift: 0.05, taper: 0.3 },
			{ count: 5, from: 0.5, angle: 0.98, ratio: 1.55, thick: 0.62, wander: 0.13, lift: 0.07, taper: 0.62 },
			{ count: 5, from: 0.3, angle: 0.8, ratio: 0.5, thick: 0.52, wander: 0.16, lift: 0.03, taper: 0.6 },
			{ count: 4, from: 0.25, angle: 0.75, ratio: 0.5, thick: 0.5, wander: 0.2, lift: -0.02, taper: 0.5 },
		],
		leaf: { size: 0.42, every: 0.34, cells: [0, 1, 3] },
		blossom: 7.5,
	},
	{
		// broad and heavy-limbed, with a rounded but broken crown
		name: 'maple',
		seed: 23,
		height: 4.4,
		radius: 0.36,
		conical: 0.25,
		orders: [
			{ count: 1, from: 0, angle: 0, ratio: 1, thick: 1, wander: 0.07, lift: 0.06, taper: 0.4 },
			{ count: 6, from: 0.42, angle: 0.78, ratio: 1.2, thick: 0.56, wander: 0.12, lift: 0.1, taper: 0.62 },
			{ count: 5, from: 0.28, angle: 0.72, ratio: 0.52, thick: 0.5, wander: 0.15, lift: 0.05, taper: 0.6 },
			{ count: 4, from: 0.2, angle: 0.7, ratio: 0.52, thick: 0.5, wander: 0.2, lift: 0, taper: 0.5 },
		],
		leaf: { size: 0.5, every: 0.36, cells: [0, 2, 7] },
		blossom: 1.2,
	},
	{
		// tall and narrow on one leaning leader, with an open, airy crown
		name: 'birch',
		seed: 37,
		height: 8.6,
		radius: 0.2,
		conical: 0.7,
		orders: [
			{ count: 1, from: 0, angle: 0, ratio: 1, thick: 1, wander: 0.06, lift: 0.04, taper: 0.72 },
			{ count: 11, from: 0.34, angle: 0.92, ratio: 0.36, thick: 0.46, wander: 0.12, lift: 0.07, taper: 0.66 },
			{ count: 4, from: 0.25, angle: 0.75, ratio: 0.5, thick: 0.5, wander: 0.16, lift: -0.04, taper: 0.6 },
			{ count: 3, from: 0.25, angle: 0.7, ratio: 0.55, thick: 0.5, wander: 0.2, lift: -0.1, taper: 0.5 },
		],
		leaf: { size: 0.36, every: 0.3, cells: [1, 3, 7] },
		blossom: 0,
	},
	{
		// a low thicket: many stems from the ground and no trunk to speak of
		name: 'shrub',
		seed: 53,
		height: 0.35,
		radius: 0.09,
		conical: 0,
		orders: [
			{ count: 1, from: 0, angle: 0, ratio: 1, thick: 1, wander: 0.1, lift: 0, taper: 0.1 },
			{ count: 7, from: 0.1, angle: 0.8, ratio: 2.5, thick: 0.55, wander: 0.16, lift: 0.1, taper: 0.7 },
			{ count: 3, from: 0.3, angle: 0.7, ratio: 0.55, thick: 0.55, wander: 0.18, lift: 0.04, taper: 0.6 },
			{ count: 2, from: 0.3, angle: 0.7, ratio: 0.6, thick: 0.6, wander: 0.2, lift: 0, taper: 0.5 },
		],
		leaf: { size: 0.27, every: 0.2, cells: [2, 0] },
		blossom: 1.5,
	},
];

interface Branch {
	nodes: V3[];
	radii: number[];
	order: number;
}

/** A point part of the way along a branch, with the direction and thickness of the branch there. */
function along(b: Branch, t: number): { p: V3; dir: V3; r: number } {
	const f = clamp(t) * (b.nodes.length - 1);
	const i = Math.min(b.nodes.length - 2, Math.floor(f));
	const k = f - i;
	return { p: add(mul(b.nodes[i], 1 - k), mul(b.nodes[i + 1], k)), dir: norm(sub(b.nodes[i + 1], b.nodes[i])), r: lerp(b.radii[i], b.radii[i + 1], k) };
}

function skeleton(sp: Species): Branch[] {
	const rng = mulberry32(sp.seed);
	const unit = (): V3 => norm([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]);
	const out: Branch[] = [];
	const shoot = (origin: V3, dir: V3, length: number, radius: number, order: number) => {
		const o = sp.orders[order];
		const steps = [10, 7, 5, 3][order];
		const branch: Branch = { nodes: [origin], radii: [radius], order };
		let d = dir;
		let p = origin;
		for (let s = 1; s <= steps; s++) {
			d = norm(add(add(d, mul(unit(), o.wander)), [0, o.lift, 0]));
			p = add(p, mul(d, length / steps));
			branch.nodes.push(p);
			branch.radii.push(radius * (1 - (s / steps) * o.taper));
		}
		out.push(branch);
		if (order === 3) return;
		const next = sp.orders[order + 1];
		const count = Math.max(1, Math.round(next.count * (0.8 + 0.4 * rng())));
		let turn = rng() * Math.PI * 2;
		for (let k = 0; k < count; k++) {
			const t = next.from + (1 - next.from) * ((k + 0.25 + 0.6 * rng()) / count);
			const at = along(branch, t);
			// each one leaves the parent about a golden angle around from the last, so none stack up
			turn += 2.4 + (rng() - 0.5) * 0.9;
			const side = norm(cross(at.dir, Math.abs(at.dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
			const around = add(mul(side, Math.cos(turn)), mul(cross(at.dir, side), Math.sin(turn)));
			const angle = next.angle * (0.75 + 0.5 * rng());
			// uneven lengths are what open gaps in a crown
			const reach = (0.62 + 0.7 * rng()) * (order === 0 ? 1 - sp.conical * ((t - next.from) / (1 - next.from)) * 0.75 : 1 - 0.3 * Math.abs(t - 0.55));
			shoot(at.p, norm(add(mul(at.dir, Math.cos(angle)), mul(around, Math.sin(angle)))), length * next.ratio * reach, Math.min(at.r * 0.8, radius * next.thick * (0.8 + 0.4 * rng())), order + 1);
		}
	};
	// the trunk starts below the ground, so a tree on a slope has no gap under it
	shoot([0, -0.45, 0], norm([(rng() - 0.5) * 0.24, 1, (rng() - 0.5) * 0.24]), sp.height + 0.45, sp.radius, 0);
	return out;
}

/**
 * One level of detail of one species.
 *
 * Wood: `uv` is the bark coordinate in tiles divided by UV_TILES. `bake` is R occlusion,
 * G branching order (0 trunk to 1 twig), B a tone variation, A unused.
 *
 * Cards: `position` is the centre of the cluster, repeated on all four vertices. `normal` points
 * out of the crown, for shading the crown as one mass. `uv` is the atlas coordinate. `corner` is
 * where that vertex sits from the centre, in units of CARD_REACH metres. `bake` is R the order in
 * which clusters appear and fall (low first to come, last to go), G a colour variation,
 * B occlusion from depth inside the crown, A 0 for leaves and 1 for blossom.
 */
export interface TreeMesh {
	name: string;
	wood: Part;
	cards: Part & { corners: number[] };
	/** Crown centre and radius in metres, for the app's shading. */
	crown: number[];
}
interface Part {
	positions: number[];
	normals: number[];
	uvs: number[];
	bake: number[];
	indices: number[];
}
export const UV_TILES = 16;
export const CARD_REACH = 2;
/** The atlas is 4 cells wide and 2 tall. Cells 0 to 3 and 7 are leaves, 4 and 5 blossom, 6 a grass tuft. */
export const ATLAS = { columns: 4, rows: 2 };
const BARK_METRES = 1.1;

function tube(part: Part, b: Branch, sides: number, flare: number, rng: () => number) {
	const start = part.positions.length / 3;
	let side: V3 = norm(cross(norm(sub(b.nodes[1], b.nodes[0])), [0.31, 0.2, 0.93]));
	let run = 0;
	const tone = rng();
	b.nodes.forEach((p, i) => {
		const dir = norm(sub(b.nodes[Math.min(i + 1, b.nodes.length - 1)], b.nodes[Math.max(i - 1, 0)]));
		// carry the frame along the branch without letting it twist
		side = norm(sub(side, mul(dir, dot(side, dir))));
		const other = cross(dir, side);
		if (i > 0) run += Math.hypot(...sub(p, b.nodes[i - 1]));
		// whole turns of bark around, so the seam matches
		const wraps = Math.max(1, Math.round((2 * Math.PI * b.radii[0]) / BARK_METRES));
		for (let j = 0; j <= sides; j++) {
			const a = (j / sides) * Math.PI * 2;
			// roots: the foot of the trunk swells, more in some directions than others
			const root = flare * Math.exp(-Math.max(0, p[1] + 0.2) / 0.34) * (1 + 0.45 * Math.cos(a * 3 + b.radii[0] * 40) + 0.25 * Math.cos(a * 5 + 1.3));
			const r = b.radii[i] * (1 + root);
			const n = add(mul(side, Math.cos(a)), mul(other, Math.sin(a)));
			part.positions.push(...add(p, mul(n, r)));
			part.normals.push(...norm(add(n, [0, root * 0.6, 0])));
			part.uvs.push(((j / sides) * wraps) / UV_TILES, run / BARK_METRES / UV_TILES);
			// darker under the crown and where the trunk meets the ground
			const shade = b.order === 0 ? lerp(0.62, 1, smooth(-0.1, 0.5, p[1])) * lerp(1, 0.72, smooth(1.2, 3.5, p[1])) : 0.7;
			part.bake.push(Math.round(shade * 255), Math.round((b.order / 3) * 255), Math.round(tone * 255), 255);
		}
		if (i === 0) return;
		for (let j = 0; j < sides; j++) {
			const a = start + (i - 1) * (sides + 1) + j;
			const c = a + sides + 1;
			part.indices.push(a, c, a + 1, a + 1, c, c + 1);
		}
	});
}

function card(cards: TreeMesh['cards'], centre: V3, normal: V3, half: number, cell: number, roll: number, bake: [number, number, number, number]) {
	const start = cards.positions.length / 3;
	const cx = cell % ATLAS.columns;
	const cy = Math.floor(cell / ATLAS.columns);
	const inset = 0.004;
	const [c, s] = [Math.cos(roll), Math.sin(roll)];
	for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
		cards.positions.push(...centre);
		cards.normals.push(...normal);
		cards.uvs.push((cx + (x > 0 ? 1 - inset : inset)) / ATLAS.columns, (cy + (y > 0 ? inset : 1 - inset)) / ATLAS.rows);
		cards.corners.push(((x * c - y * s) * half) / CARD_REACH, ((x * s + y * c) * half) / CARD_REACH);
		cards.bake.push(...bake.map((v) => Math.round(clamp(v) * 255)));
	}
	cards.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

/** `detail` 0 is the tree for close groves. 1 is the same tree with fewer sides and larger, fewer cards. */
export function growTree(sp: Species, detail: 0 | 1): TreeMesh {
	const branches = skeleton(sp);
	const rng = mulberry32(sp.seed * 7 + 1);
	const wood: Part = { positions: [], normals: [], uvs: [], bake: [], indices: [] };
	const cards: TreeMesh['cards'] = { positions: [], normals: [], uvs: [], bake: [], indices: [], corners: [] };
	const sides = detail === 0 ? [9, 6, 4, 3] : [6, 4, 3, 0];
	for (const b of branches) if (sides[b.order] > 0) tube(wood, b, sides[b.order], b.order === 0 && sp.name !== 'shrub' ? 0.75 : 0, rng);

	// where the leaves go: along every twig, and along the outer half of what carries the twigs
	const spots: { p: V3; tip: number }[] = [];
	for (const b of branches) {
		if (b.order < 2) continue;
		const length = b.nodes.slice(1).reduce((s, p, i) => s + Math.hypot(...sub(p, b.nodes[i])), 0);
		const first = b.order === 3 ? 0.2 : 0.55;
		for (let t = first; t <= 1.001; t += sp.leaf.every / Math.max(length, 0.2)) {
			const at = along(b, t);
			spots.push({ p: add(at.p, [(rng() - 0.5) * 0.3, (rng() - 0.3) * 0.22, (rng() - 0.5) * 0.3]), tip: t });
		}
	}
	const centre = mul(spots.reduce((s, c) => add(s, c.p), [0, 0, 0] as V3), 1 / spots.length);
	const reach = Math.max(...spots.map((c) => Math.hypot(...sub(c.p, centre))));
	const thin = detail === 0 ? 1 : 2;
	spots.forEach((spot, i) => {
		if (i % thin !== 0) return;
		const out = sub(spot.p, centre);
		const depth = Math.hypot(...out) / reach;
		// inner and lower clusters sit in the shade of the rest
		const shade = lerp(0.42, 1, smooth(0.15, 0.85, depth)) * lerp(0.8, 1, smooth(-0.5, 0.5, out[1] / reach));
		// twig ends leaf first and hold their leaves longest. The inside fills in last and empties first.
		const order = clamp(0.05 + 0.8 * rng() + 0.25 * (1 - spot.tip) - 0.12 * depth);
		const cell = sp.leaf.cells[Math.floor(rng() * sp.leaf.cells.length)];
		card(cards, spot.p, norm(add(norm(out), [0, 0.35, 0])), sp.leaf.size * (0.75 + 0.5 * rng()) * (detail === 0 ? 1 : 1.45), cell, rng() * Math.PI * 2, [order, rng(), shade, 0]);
	});

	// blossom: small clusters strung along the branches themselves, not over the crown as a whole
	if (sp.blossom > 0) {
		let k = 0;
		for (const b of branches) {
			if (b.order === 0) continue;
			const length = b.nodes.slice(1).reduce((s, p, i) => s + Math.hypot(...sub(p, b.nodes[i])), 0);
			const n = Math.round(length * sp.blossom * (b.order === 1 ? 0.5 : 1));
			for (let j = 0; j < n; j++) {
				const at = along(b, b.order === 1 ? 0.35 + 0.65 * rng() : 0.08 + 0.92 * rng());
				const p = add(at.p, mul(norm([rng() - 0.5, rng() - 0.35, rng() - 0.5]), at.r + 0.05 + 0.1 * rng()));
				if (k++ % (detail === 0 ? 1 : 3) !== 0) continue;
				const out = sub(p, centre);
				const shade = lerp(0.6, 1, smooth(0.1, 0.8, Math.hypot(...out) / reach));
				card(cards, p, norm(add(norm(out), [0, 0.5, 0])), (0.15 + 0.11 * rng()) * (detail === 0 ? 1 : 1.7), 4 + Math.floor(rng() * 2), rng() * Math.PI * 2, [rng(), rng(), shade, 1]);
			}
		}
	}
	return { name: `${sp.name}_${detail}`, wood, cards, crown: [...centre, reach].map((v) => Math.round(v * 100) / 100) };
}

/** Radius in metres within which a tree of this species shades and covers the ground. */
export function crownOf(sp: Species): { centre: V3; reach: number } {
	const t = growTree(sp, 1);
	return { centre: [t.crown[0], t.crown[1], t.crown[2]], reach: t.crown[3] };
}
