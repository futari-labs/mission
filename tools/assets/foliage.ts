// Draws the foliage atlas: sprays of leaves, bunches of blossom, and a grass tuft, one per cell.
//
// The atlas carries shape, not colour. Red is lightness, green is a number per leaf or flower that
// the app turns into colour variation, blue marks the heart of a flower, and alpha is the outline.
// The season supplies the colour, so one atlas serves spring, summer, and autumn.
import sharp from 'sharp';
import { mulberry32 } from './noise.ts';
import { ATLAS } from './trees.ts';

const CELL = 256;

/** A pointed leaf from its stalk at the origin to its tip `length` away, with a paler midrib. */
function leaf(x: number, y: number, turn: number, length: number, light: number, id: number, slim = 0.4): string {
	const w = length * slim;
	const fill = `rgb(${light},${id},0)`;
	const rib = `rgb(${Math.min(255, light + 26)},${id},0)`;
	const path = `M0,0 C${w},${-length * 0.22} ${w * 0.9},${-length * 0.72} 0,${-length} C${-w * 0.9},${-length * 0.72} ${-w},${-length * 0.22} 0,0Z`;
	return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${turn.toFixed(1)})"><path d="${path}" fill="${fill}"/><path d="M0,0 L0,${(-length * 0.92).toFixed(1)}" stroke="${rib}" stroke-width="${Math.max(1, length * 0.035).toFixed(1)}"/></g>`;
}

function flower(x: number, y: number, r: number, id: number, turn: number): string {
	let out = `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${turn.toFixed(0)})">`;
	for (let k = 0; k < 5; k++) {
		const a = (k / 5) * Math.PI * 2;
		out += `<ellipse cx="${(Math.cos(a) * r * 0.55).toFixed(1)}" cy="${(Math.sin(a) * r * 0.55).toFixed(1)}" rx="${(r * 0.5).toFixed(1)}" ry="${(r * 0.4).toFixed(1)}" transform="rotate(${((a * 180) / Math.PI).toFixed(0)} ${(Math.cos(a) * r * 0.55).toFixed(1)} ${(Math.sin(a) * r * 0.55).toFixed(1)})" fill="rgb(${238 - k * 5},${id},0)"/>`;
	}
	return `${out}<circle r="${(r * 0.24).toFixed(1)}" fill="rgb(170,${id},255)"/></g>`;
}

type Draw = (rng: () => number) => string;

/** One shoot: a thin stem from (x, y) heading `turn` degrees, with leaves alternating down both sides. */
function shoot(rng: () => number, x: number, y: number, turn: number, length: number, leaves: number, size: [number, number], slim: number): string {
	const rad = (turn * Math.PI) / 180;
	const bend = (rng() - 0.5) * 0.5;
	let out = '';
	let stem = `M${x.toFixed(1)},${y.toFixed(1)}`;
	for (let i = 1; i <= leaves; i++) {
		const t = i / leaves;
		const a = rad + bend * t;
		const px = x + Math.sin(a) * length * t;
		const py = y - Math.cos(a) * length * t;
		stem += ` L${px.toFixed(1)},${py.toFixed(1)}`;
		// leaves are drawn darkest first, so the ones on top are the ones in the light
		const light = 112 + Math.round(t * 96 + rng() * 40);
		const out2 = i === leaves ? 0 : (i % 2 === 0 ? -1 : 1) * (48 + rng() * 26);
		out += leaf(px, py, (a * 180) / Math.PI + out2, size[0] + rng() * (size[1] - size[0]), light, Math.round(rng() * 255), slim);
	}
	return `<path d="${stem}" stroke="rgb(82,128,0)" stroke-width="2.4" fill="none" stroke-linecap="round"/>${out}`;
}

const spray =
	(shoots: number, spread: number, leaves: number, size: [number, number], slim: number): Draw =>
	(rng) => {
		const first = rng() * 360;
		return Array.from({ length: shoots }, (_, i) => shoot(rng, 128, 128, first + (i / shoots) * spread + (rng() - 0.5) * 34, 66 + rng() * 34, leaves, size, slim)).join('');
	};

const clump: Draw = (rng) =>
	Array.from({ length: 110 }, (_, i) => {
		const a = rng() * Math.PI * 2;
		const d = Math.sqrt(rng()) * 96;
		return leaf(128 + Math.cos(a) * d, 132 + Math.sin(a) * d, rng() * 360, 24 + rng() * 15, 108 + Math.round((i / 110) * 110 + rng() * 34), Math.round(rng() * 255), 0.46);
	}).join('');

const bunch =
	(count: number): Draw =>
	(rng) =>
		Array.from({ length: count }, () => {
			const a = rng() * Math.PI * 2;
			const d = Math.sqrt(rng()) * 84;
			return flower(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 14 + rng() * 9, Math.round(rng() * 255), rng() * 72);
		}).join('');

const tuft: Draw = (rng) =>
	Array.from({ length: 30 }, (_, i) => leaf(128 + (rng() - 0.5) * 120, 250, (rng() - 0.5) * 78, 90 + rng() * 140, 110 + Math.round((i / 30) * 120), Math.round(rng() * 255), 0.07)).join('');

const CELLS: Draw[] = [spray(7, 360, 10, [30, 46], 0.46), spray(5, 200, 11, [30, 44], 0.44), clump, spray(4, 300, 9, [30, 44], 0.42), bunch(19), bunch(11), tuft, spray(6, 360, 11, [30, 48], 0.32)];

/** RGBA pixels of the atlas, with the colour of empty pixels filled in so mipmaps do not darken the edges. */
export async function foliageAtlas(): Promise<{ png: Buffer; width: number; height: number }> {
	const width = CELL * ATLAS.columns;
	const height = CELL * ATLAS.rows;
	const rng = mulberry32(606);
	const cells = CELLS.map((draw, i) => `<svg x="${(i % ATLAS.columns) * CELL}" y="${Math.floor(i / ATLAS.columns) * CELL}" width="${CELL}" height="${CELL}" viewBox="0 0 256 256">${draw(rng)}</svg>`);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${cells.join('')}</svg>`;
	const { data } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] > 0) continue;
		data[i] = 170;
		data[i + 1] = 128;
		data[i + 2] = 0;
	}
	const png = await sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
	return { png, width, height };
}
