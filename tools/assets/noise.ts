// Seeded Perlin noise with optional x/y period, plus fractal helpers. Deterministic across runs.
export function mulberry32(seed: number): () => number {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number): number => {
	const t = clamp((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};

export function makeNoise(seed: number) {
	const rand = mulberry32(seed);
	const p = new Uint8Array(512);
	const base = Array.from({ length: 256 }, (_, i) => i);
	for (let i = 255; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[base[i], base[j]] = [base[j], base[i]];
	}
	for (let i = 0; i < 512; i++) p[i] = base[i & 255];
	const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
	const grad = (hash: number, x: number, y: number, z: number) => {
		const h = hash & 15;
		const u = h < 8 ? x : y;
		const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
		return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
	};
	const wrap = (i: number, period: number) => (period > 0 ? ((i % period) + period) % period : i) & 255;

	/** Perlin noise in about [-1, 1]. A period above 0 makes x and y tile. */
	function n3(x: number, y: number, z: number, period = 0): number {
		const xf = Math.floor(x);
		const yf = Math.floor(y);
		const zf = Math.floor(z);
		const X0 = wrap(xf, period);
		const X1 = wrap(xf + 1, period);
		const Y0 = wrap(yf, period);
		const Y1 = wrap(yf + 1, period);
		const Z0 = zf & 255;
		const Z1 = (zf + 1) & 255;
		const dx = x - xf;
		const dy = y - yf;
		const dz = z - zf;
		const u = fade(dx);
		const v = fade(dy);
		const w = fade(dz);
		const h = (X: number, Y: number, Z: number) => p[p[p[X] + Y] + Z];
		const x00 = lerp(grad(h(X0, Y0, Z0), dx, dy, dz), grad(h(X1, Y0, Z0), dx - 1, dy, dz), u);
		const x10 = lerp(grad(h(X0, Y1, Z0), dx, dy - 1, dz), grad(h(X1, Y1, Z0), dx - 1, dy - 1, dz), u);
		const x01 = lerp(grad(h(X0, Y0, Z1), dx, dy, dz - 1), grad(h(X1, Y0, Z1), dx - 1, dy, dz - 1), u);
		const x11 = lerp(grad(h(X0, Y1, Z1), dx, dy - 1, dz - 1), grad(h(X1, Y1, Z1), dx - 1, dy - 1, dz - 1), u);
		return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
	}

	function fbm(x: number, y: number, z: number, octaves: number, period = 0): number {
		let sum = 0;
		let amp = 0.5;
		let norm = 0;
		let f = 1;
		for (let o = 0; o < octaves; o++) {
			sum += amp * n3(x * f, y * f, z * f + o * 17.3, period * f);
			norm += amp;
			amp *= 0.5;
			f *= 2;
		}
		return sum / norm;
	}

	/** Ridged multifractal in [0, 1]. Sharp crests, soft valleys. */
	function ridged(x: number, y: number, z: number, octaves: number, period = 0): number {
		let sum = 0;
		let amp = 0.5;
		let norm = 0;
		let f = 1;
		let prev = 1;
		for (let o = 0; o < octaves; o++) {
			let r = 1 - Math.abs(n3(x * f, y * f, z * f + o * 11.7, period * f));
			r *= r;
			sum += amp * r * prev;
			norm += amp;
			prev = clamp(r * 1.6);
			amp *= 0.5;
			f *= 2.07;
		}
		return sum / norm;
	}
	return { n3, fbm, ridged };
}
