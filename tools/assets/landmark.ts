// The Futari landmark: the characters 二人 as monumental stone. 二 stands on the left, 人 on the
// right, and the visitor's path runs through the space between them.
// The outlines come from Noto Sans JP Black (see glyphs/SOURCE.md). Each glyph is cut into blocks
// along joints chosen for its strokes. Every block is a signed distance field: the glyph outline
// inside one region, extruded, with worn edges, seeded chips, and surface noise.
import { readFileSync } from 'node:fs';
import { clamp, lerp, makeNoise, mulberry32 } from './noise.ts';
import type { Vec3 } from './surfacenets.ts';

export type Pt = [number, number];
type Command = { t: 'M' | 'L' | 'Q' | 'C' | 'Z'; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number };
interface GlyphData {
	char: string;
	box: [number, number, number, number];
	offset: [number, number];
	commands: Command[];
}

/** Height of one em in metres. The characters stand about 6 m tall. */
export const EM = 6.6;
/** How far 人 stands in the snow. 二 sits a little higher so its lower stroke rests on the ground. */
const SINK = 0.5;
const DEPTH = 1.7;
const ROUND = 0.06;
const JOINT = 0.022;
const N = makeNoise(77);
const data = JSON.parse(readFileSync(new URL('./glyphs/futari-glyphs.json', import.meta.url), 'utf8')) as { glyphs: { ni: GlyphData; hito: GlyphData } };

class Glyph {
	readonly edges: [number, number, number, number][] = [];
	readonly min: Pt = [Infinity, Infinity];
	readonly max: Pt = [-Infinity, -Infinity];

	constructor(g: GlyphData, drop: number) {
		const place = (x: number, y: number): Pt => [(x + g.offset[0]) * EM, (y + g.offset[1]) * EM - drop];
		let start: Pt = [0, 0];
		let at: Pt = [0, 0];
		const line = (to: Pt) => {
			if (to[0] !== at[0] || to[1] !== at[1]) this.edges.push([at[0], at[1], to[0], to[1]]);
			at = to;
		};
		for (const c of g.commands) {
			if (c.t === 'M') start = at = place(c.x!, c.y!);
			else if (c.t === 'L') line(place(c.x!, c.y!));
			else if (c.t === 'Z') line(start);
			else {
				const p0 = at;
				const p1 = place(c.x1!, c.y1!);
				const p2 = c.t === 'C' ? place(c.x2!, c.y2!) : p1;
				const p3 = place(c.x!, c.y!);
				for (let i = 1; i <= 12; i++) {
					const t = i / 12;
					const u = 1 - t;
					line(
						c.t === 'Q'
							? [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p3[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p3[1]]
							: [u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]],
					);
				}
			}
		}
		for (const [x0, y0, x1, y1] of this.edges) {
			this.min[0] = Math.min(this.min[0], x0, x1);
			this.min[1] = Math.min(this.min[1], y0, y1);
			this.max[0] = Math.max(this.max[0], x0, x1);
			this.max[1] = Math.max(this.max[1], y0, y1);
		}
	}

	/** Signed distance to the outline. Negative inside. Even-odd, so separate contours and holes both work. */
	sd(px: number, py: number): number {
		let best = Infinity;
		let inside = false;
		for (const [x0, y0, x1, y1] of this.edges) {
			const ex = x1 - x0;
			const ey = y1 - y0;
			const wx = px - x0;
			const wy = py - y0;
			const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey));
			const bx = wx - ex * t;
			const by = wy - ey * t;
			best = Math.min(best, bx * bx + by * by);
			if (y0 > py !== y1 > py && px < x0 + ((py - y0) / ey) * ex) inside = !inside;
		}
		return (inside ? -1 : 1) * Math.sqrt(best);
	}
}

/** A half-plane n . p <= d. A block's region is the intersection of a few of these. */
type Plane = [number, number, number];
// each cut is a line through (x, y), turned by `tilt` radians so joints are not perfectly square
const above = (y: number, tilt = 0, x = 0): Plane => [Math.sin(tilt), -Math.cos(tilt), Math.sin(tilt) * x - Math.cos(tilt) * y];
const below = (y: number, tilt = 0, x = 0): Plane => [-Math.sin(tilt), Math.cos(tilt), -Math.sin(tilt) * x + Math.cos(tilt) * y];
const rightOf = (x: number, tilt = 0, y = 0): Plane => [-Math.cos(tilt), Math.sin(tilt), -Math.cos(tilt) * x + Math.sin(tilt) * y];
const leftOf = (x: number, tilt = 0, y = 0): Plane => [Math.cos(tilt), -Math.sin(tilt), Math.cos(tilt) * x - Math.sin(tilt) * y];

export interface Block {
	name: string;
	/** -1 for 二 on the left, 1 for 人 on the right. The two glyphs part along x as whole groups. */
	side: -1 | 1;
	glyph: Glyph;
	planes: Plane[];
	/** Build order within its glyph, from the ground up. Drives the entrance. */
	order: number;
	zc: number;
	depth: number;
	/** 0 stays put under the pointer, 1 moves freely. */
	mobility: number;
	/** Whether light shows in the joints this block shares. */
	glow: boolean;
	chips: [number, number, number, number][];
	min: Vec3;
	max: Vec3;
	pivot: Vec3;
	out: Vec3;
	tint: number;
}

const NI = new Glyph(data.glyphs.ni, SINK - 0.34);
const HITO = new Glyph(data.glyphs.hito, SINK);

function region(b: { glyph: Glyph; planes: Plane[] }, x: number, y: number): number {
	let d = b.glyph.sd(x, y);
	for (const [nx, ny, off] of b.planes) d = Math.max(d, nx * x + ny * y - off + JOINT);
	return d;
}

function makeBlocks(): Block[] {
	const rand = mulberry32(41);
	const jitter = (a: number, b: number) => a + (b - a) * rand();
	const blocks: Block[] = [];
	const add = (name: string, side: -1 | 1, glyph: Glyph, planes: Plane[], order: number, mobility: number, glow: boolean, out: Vec3, chipCount: number) => {
		const depth = DEPTH + jitter(-0.07, 0.07);
		const zc = jitter(-0.035, 0.035);
		// bounds of the glyph inside this region, found by sampling
		const min: Vec3 = [Infinity, Infinity, zc - depth / 2];
		const max: Vec3 = [-Infinity, -Infinity, zc + depth / 2];
		const inside: Pt[] = [];
		for (let y = glyph.min[1]; y <= glyph.max[1]; y += 0.05)
			for (let x = glyph.min[0]; x <= glyph.max[0]; x += 0.05)
				if (region({ glyph, planes }, x, y) < 0) {
					min[0] = Math.min(min[0], x - 0.06);
					min[1] = Math.min(min[1], y - 0.06);
					max[0] = Math.max(max[0], x + 0.06);
					max[1] = Math.max(max[1], y + 0.06);
					if (Math.abs(region({ glyph, planes }, x, y)) < 0.05) inside.push([x, y]);
				}
		const chips: Block['chips'] = [];
		for (let c = 0; c < chipCount && inside.length; c++) {
			const [x, y] = inside[Math.floor(rand() * inside.length)];
			chips.push([x, y, zc + (rand() < 0.5 ? -1 : 1) * depth * 0.5 * (rand() < 0.75 ? 1 : jitter(0, 1)), jitter(0.07, 0.17)]);
		}
		blocks.push({ name, side, glyph, planes, order, zc, depth, mobility, glow, chips, min, max, pivot: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, zc], out: [out[0], out[1], out[2] * (rand() < 0.5 ? -1 : 1)], tint: rand() });
	};

	// 二: the lower stroke rests on the ground in three blocks, the upper stroke hovers in two
	const nw = NI.max[0] - NI.min[0];
	const mid = (NI.min[1] + NI.max[1]) / 2;
	const l1 = NI.min[0] + nw * 0.36;
	const l2 = NI.min[0] + nw * 0.69;
	const lowY = NI.min[1] + 0.5;
	const highY = NI.max[1] - 0.5;
	add('ni_low_a', -1, NI, [below(mid), leftOf(l1, 0.09, lowY)], 0, 0.2, false, [-0.3, 0.5, 0.8], 4);
	add('ni_low_b', -1, NI, [below(mid), rightOf(l1, 0.09, lowY), leftOf(l2, -0.07, lowY)], 1, 0.25, false, [0, 0.6, 0.8], 3);
	add('ni_low_c', -1, NI, [below(mid), rightOf(l2, -0.07, lowY)], 2, 0.2, false, [0.3, 0.5, 0.8], 4);
	const u1 = NI.min[0] + nw * 0.47;
	add('ni_high_a', -1, NI, [above(mid), leftOf(u1, -0.1, highY)], 3, 1, true, [-0.35, 0.85, 0.4], 3);
	add('ni_high_b', -1, NI, [above(mid), rightOf(u1, -0.1, highY)], 4, 1, true, [0.35, 0.85, 0.4], 3);

	// 人: find where the two strokes part, then cut above and below that point
	const cx = (() => {
		const y = HITO.max[1] - 0.25;
		let lo = Infinity;
		let hi = -Infinity;
		for (let x = HITO.min[0]; x <= HITO.max[0]; x += 0.02)
			if (HITO.sd(x, y) < 0) {
				lo = Math.min(lo, x);
				hi = Math.max(hi, x);
			}
		return (lo + hi) / 2;
	})();
	let crotch = HITO.max[1];
	while (crotch > HITO.min[1] && HITO.sd(cx, crotch - 0.3) < 0) crotch -= 0.02;
	crotch -= 0.3;
	const upper = crotch + 0.55;
	const lower = HITO.min[1] + (crotch - HITO.min[1]) * 0.46;
	add('hito_foot_l', 1, HITO, [below(lower, 0.1, cx), leftOf(cx)], 0, 0.2, false, [-0.4, 0.4, 0.8], 4);
	add('hito_foot_r', 1, HITO, [below(lower, -0.1, cx), rightOf(cx)], 0, 0.2, false, [0.4, 0.4, 0.8], 4);
	add('hito_leg_l', 1, HITO, [above(lower, 0.1, cx), below(upper, -0.08, cx), leftOf(cx, 0.05, crotch)], 1, 0.7, true, [-0.6, 0.55, 0.5], 3);
	add('hito_leg_r', 1, HITO, [above(lower, -0.1, cx), below(upper, -0.08, cx), rightOf(cx, 0.05, crotch)], 1, 0.7, true, [0.6, 0.55, 0.5], 3);
	add('hito_crown', 1, HITO, [above(upper, -0.08, cx)], 2, 0.9, true, [0, 1, 0.3], 3);
	return blocks;
}

export const BLOCKS: Block[] = makeBlocks();

/** Where the guiding light starts: in the space between the characters. */
export const LIGHT = { x: 0, y: 3.15, z: 0, gap: data.glyphs.hito.offset[0] * EM + data.glyphs.hito.box[0] * EM - (data.glyphs.ni.offset[0] + data.glyphs.ni.box[2]) * EM };

/** Block shape without chips or noise. Cheap enough for occlusion sampling. */
export function sdBlockCoarse(b: Block, x: number, y: number, z: number): number {
	const ox = Math.max(b.min[0] - x, 0, x - b.max[0]);
	const oy = Math.max(b.min[1] - y, 0, y - b.max[1]);
	const oz = Math.max(b.min[2] - z, 0, z - b.max[2]);
	const outside = Math.hypot(ox, oy, oz);
	if (outside > 0.7) return outside;
	const a = region(b, x, y) + ROUND;
	const c = Math.abs(z - b.zc) - b.depth / 2 + ROUND;
	return Math.hypot(Math.max(a, 0), Math.max(c, 0)) + Math.min(Math.max(a, c), 0) - ROUND;
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

export function sdLandmarkCoarse(x: number, y: number, z: number, skip: Block | null = null): number {
	let d = Infinity;
	for (const b of BLOCKS) if (b !== skip) d = Math.min(d, sdBlockCoarse(b, x, y, z));
	return d;
}

/** The outline of a block as line segments [x0, y0, x1, y1, ...], traced from its field. Used for construction lines. */
export function outline(b: Block, cell = 0.14): number[] {
	const out: number[] = [];
	const f = (x: number, y: number) => region(b, x, y);
	for (let y = b.min[1] - cell; y < b.max[1] + cell; y += cell)
		for (let x = b.min[0] - cell; x < b.max[0] + cell; x += cell) {
			const v = [f(x, y), f(x + cell, y), f(x + cell, y + cell), f(x, y + cell)];
			const corner: Pt[] = [[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell]];
			const cross: Pt[] = [];
			for (let i = 0; i < 4; i++) {
				const j = (i + 1) % 4;
				if (v[i] < 0 !== v[j] < 0) {
					const t = v[i] / (v[i] - v[j]);
					cross.push([lerp(corner[i][0], corner[j][0], t), lerp(corner[i][1], corner[j][1], t)]);
				}
			}
			if (cross.length >= 2) out.push(+cross[0][0].toFixed(3), +cross[0][1].toFixed(3), +cross[1][0].toFixed(3), +cross[1][1].toFixed(3));
		}
	return out;
}
