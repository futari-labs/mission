// Tiling value noise: a few octaves of a random lattice, each twice as fine and half as strong as
// the one before, smoothly interpolated. The cloud sea, the mist, and the ground patterns all read
// a texture of it. It is made once at load on the main thread, so the loops here are flat: what a
// column needs is worked out once per octave, not once per pixel.

/** One channel of `size` by `size` noise that repeats at its edges. The same arguments always give the same bytes. */
export function valueNoise(size: number, grid: number, octaves: number, seed: number): Uint8Array<ArrayBuffer> {
	let s = seed;
	const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
	// every octave's lattice is drawn from the one sequence, coarsest first
	const lattice: Float32Array[] = [];
	for (let o = 0; o < octaves; o++) {
		const cells = new Float32Array((grid << o) ** 2);
		for (let i = 0; i < cells.length; i++) cells[i] = rand();
		lattice.push(cells);
	}
	const sum = new Float64Array(size * size);
	const left = new Int32Array(size);
	const right = new Int32Array(size);
	const blend = new Float64Array(size);
	let amp = 0.5;
	for (let o = 0; o < octaves; o++) {
		const n = grid << o;
		const cells = lattice[o];
		for (let x = 0; x < size; x++) {
			const fx = (x / size) * n;
			const x0 = Math.floor(fx);
			const t = fx - x0;
			left[x] = x0 % n;
			right[x] = (x0 + 1) % n;
			blend[x] = t * t * (3 - 2 * t);
		}
		for (let y = 0; y < size; y++) {
			const fy = (y / size) * n;
			const y0 = Math.floor(fy);
			const t = fy - y0;
			const sy = t * t * (3 - 2 * t);
			const upper = (y0 % n) * n;
			const lower = ((y0 + 1) % n) * n;
			const row = y * size;
			for (let x = 0; x < size; x++) {
				const sx = blend[x];
				sum[row + x] += amp * ((cells[upper + left[x]] * (1 - sx) + cells[upper + right[x]] * sx) * (1 - sy) + (cells[lower + left[x]] * (1 - sx) + cells[lower + right[x]] * sx) * sy);
			}
		}
		amp *= 0.5;
	}
	const data = new Uint8Array(size * size);
	for (let i = 0; i < data.length; i++) data[i] = Math.round(sum[i] * 255);
	return data;
}
