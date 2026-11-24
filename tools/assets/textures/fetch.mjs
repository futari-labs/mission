// Downloads the photographed surface textures from Poly Haven (CC0) and packs them for the site.
// Run once, or after changing the list: node tools/assets/textures/fetch.mjs
// The packed results in public/assets/ are committed, so `pnpm assets:build` needs no network.
//
// Each output is one tall image with a square layer per surface, in the order of LAYERS. The app
// cuts it into a texture array, so every layer tiles and mipmaps on its own.
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

/** Order matters: the shaders address layers by index. `metres` is the width the photograph covers. */
export const LAYERS = [
	{ id: 'cliff_side', use: 'rock', metres: 1.83 },
	{ id: 'grass_ground', use: 'grass', metres: 2.51 },
	{ id: 'forest_floor', use: 'soil', metres: 2.14 },
	{ id: 'dry_decay_leaves', use: 'leaf litter', metres: 2.0 },
	{ id: 'sakura_bark', use: 'bark', metres: 1.6 },
];
const SIZE = 512;
const CACHE = 'tools/assets/textures/cache';
const OUT = 'public/assets';

async function fetchMap(id, map) {
	const file = `${CACHE}/${id}_${map}_1k.jpg`;
	if (!existsSync(file)) {
		const url = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${id}/${id}_${map}_1k.jpg`;
		const response = await fetch(url, { headers: { 'User-Agent': 'asset-fetch/1.0' } });
		if (!response.ok) throw new Error(`${url}: ${response.status}`);
		writeFileSync(file, Buffer.from(await response.arrayBuffer()));
	}
	return sharp(file).resize(SIZE, SIZE, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
}

async function strip(map, name, options) {
	const layers = await Promise.all(LAYERS.map((l) => fetchMap(l.id, map)));
	const path = `${OUT}/${name}`;
	await sharp(Buffer.concat(layers), { raw: { width: SIZE, height: SIZE * LAYERS.length, channels: 3 } }).jpeg(options).toFile(path);
	console.log(path, statSync(path).size);
}

mkdirSync(CACHE, { recursive: true });
await strip('diff', 'land-albedo.jpg', { quality: 80, chromaSubsampling: '4:2:0', mozjpeg: true });
// normals keep full chroma: the three channels are one vector, not a colour
await strip('nor_gl', 'land-normal.jpg', { quality: 72, chromaSubsampling: '4:4:4', mozjpeg: true });
