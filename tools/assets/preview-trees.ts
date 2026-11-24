import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { foliageAtlas } from './foliage.ts';
import { CARD_REACH, growTree, SPECIES } from './trees.ts';

const out = process.argv[2];
const W = 520, H = 560, S = 44;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SPECIES.length}" height="${H * 2}"><rect width="100%" height="100%" fill="#b9c4c8"/>`;
SPECIES.forEach((sp, k) => {
	for (const mode of [0, 1]) {
		const t = growTree(sp, 0);
		const ox = k * W + W / 2, oy = mode * H + H - 30;
		const px = (x: number, y: number) => [ox + x * S, oy - y * S];
		// wood triangles, flat
		const w = t.wood;
		let g = '';
		for (let i = 0; i < w.indices.length; i += 3) {
			const p = [0, 1, 2].map((j) => px(w.positions[w.indices[i + j] * 3], w.positions[w.indices[i + j] * 3 + 1]));
			g += `<path d="M${p[0]} L${p[1]} L${p[2]}Z" fill="#4a3d38"/>`;
		}
		const c = t.cards;
		const items: [number, string][] = [];
		for (let q = 0; q < c.positions.length / 12; q++) {
			const v = q * 4;
			const [x, y, z] = [c.positions[v * 3], c.positions[v * 3 + 1], c.positions[v * 3 + 2]];
			const half = Math.hypot(c.corners[v * 2], c.corners[v * 2 + 1]) * CARD_REACH / Math.SQRT2;
			const order = c.bake[v * 4] / 255, shade = c.bake[v * 4 + 2] / 255, kind = c.bake[v * 4 + 3];
			const [sx, sy] = px(x, y);
			if (kind > 128) { if (mode === 0 && order < 0.9) items.push([z, `<circle cx="${sx}" cy="${sy}" r="${half * S * 0.75}" fill="rgb(${240 * shade},${205 * shade},${215 * shade})" opacity="0.9"/>`]); }
			else if (order < (mode === 0 ? 0.3 : 1)) items.push([z, `<circle cx="${sx}" cy="${sy}" r="${half * S * 0.8}" fill="rgb(${70 * shade + 20},${120 * shade + 20},${60 * shade + 10})" opacity="0.8"/>`]);
		}
		items.sort((a, b) => a[0] - b[0]);
		svg += `${g + items.map((i) => i[1]).join('')}<text x="${ox - 240}" y="${mode * H + 20}" font-size="14">${sp.name} ${mode ? 'summer' : 'spring'} wood ${w.indices.length / 3} tris, cards ${c.positions.length / 12}</text>`;
	}
});
svg += '</svg>';
await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(out);
const a = await foliageAtlas();
writeFileSync(out.replace('.jpg', '-atlas.png'), a.png);
await sharp(a.png).flatten({ background: '#203040' }).jpeg().toFile(out.replace('.jpg', '-atlas.jpg'));
for (const sp of SPECIES) for (const d of [0, 1] as const) { const t = growTree(sp, d); console.log(t.name, 'wood', t.wood.indices.length / 3, 'cards', t.cards.positions.length / 12, 'crown', t.crown.join(',')); }
