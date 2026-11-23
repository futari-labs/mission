// The landscape as one height function. Three authored layers: a calm platform under the bridge,
// one foreground ridge that crosses the lower left of the hero frame, and ridgelines behind.
import { clamp, lerp, makeNoise, smooth } from './noise.ts';

const N = makeNoise(1337);

function segment(x: number, z: number, ax: number, az: number, bx: number, bz: number) {
	const dx = bx - ax;
	const dz = bz - az;
	const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
	return { d: Math.hypot(x - (ax + dx * t), z - (az + dz * t)), t };
}

function peak(x: number, z: number, wx: number, wz: number, cx: number, cz: number, r: number, h: number): number {
	const d = Math.hypot(x - cx, z - cz) / r;
	if (d > 2.6) return 0;
	return h * Math.exp(-d * d) * (0.5 + 0.85 * N.ridged(wx * 0.03, 7.1, wz * 0.03, 4));
}

export interface TerrainSample {
	h: number;
	rocky: number;
}

export function terrain(x: number, z: number): TerrainSample {
	const wx = x + 7 * N.n3(x * 0.021, 5.1, z * 0.021);
	const wz = z + 7 * N.n3(x * 0.021, 9.7, z * 0.021);
	const e = Math.hypot(x / 13.5, z / 8.6);
	const plat = 1 - smooth(0.78, 1.75, e);
	const r = Math.hypot(x, z);

	let h = 1.5 * N.fbm(wx * 0.034, 0.3, wz * 0.034, 3);
	h -= 2.7 * smooth(0.9, 2.1, e) * (1 - smooth(40, 85, r));

	const back = 0.28 + 0.72 * smooth(16, -36, z);
	const mmask = smooth(30, 98, r) * back;
	h += mmask * (N.ridged(wx * 0.0105, 2.3, wz * 0.0105, 5) * 54 - 8);
	const peaks =
		peak(x, z, wx, wz, -58, -68, 30, 38) +
		peak(x, z, wx, wz, 62, -94, 34, 31) +
		peak(x, z, wx, wz, 40, -12, 13, 8) +
		peak(x, z, wx, wz, -38, -10, 11, 5.5) +
		peak(x, z, wx, wz, 10, -58, 22, 11);
	h += peaks;

	const fgSeg = segment(x, z, -27, 24.4, 5, 19.2);
	const fgShape = Math.exp(-((fgSeg.d / 3.3) ** 2));
	const fgH = lerp(4.9, 1.7, smooth(0.25, 1, fgSeg.t)) * (0.55 + 0.45 * smooth(0, 0.22, fgSeg.t));
	const fg = fgH * fgShape * (0.72 + 0.5 * N.ridged(x * 0.15, 1.1, z * 0.15, 3));
	h += fg;

	h = lerp(h, 0.1 * N.fbm(x * 0.12, 3.3, z * 0.12, 2), plat);

	const rocky = clamp(mmask * 1.3 + fg / 3.2 + peaks / 9);
	h += (0.42 * N.ridged(x * 0.21, 4.4, z * 0.21, 3) - 0.16) * (0.12 + 0.88 * rocky) * (1 - plat * 0.85);
	h += 0.06 * N.fbm(x * 0.8, 8.8, z * 0.8, 2) * (1 - plat * 0.4);
	const a = 0.55;
	const ripple = Math.sin((x * Math.cos(a) + z * Math.sin(a)) * 6.8 + 4.5 * N.n3(x * 0.22, 6.1, z * 0.22));
	h += 0.02 * ripple * (1 - rocky) * (0.4 + 0.6 * smooth(-0.2, 0.5, N.n3(x * 0.07, 2.2, z * 0.07)));
	return { h, rocky };
}

export const terrainHeight = (x: number, z: number): number => terrain(x, z).h;
export const terrainNoise = N;
