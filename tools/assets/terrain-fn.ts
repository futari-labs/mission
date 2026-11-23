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
	/** Where wind has stripped the snow off near rock. Only the foreground and the platform flank. */
	scour: number;
}

export function terrain(x: number, z: number): TerrainSample {
	const wx = x + 7 * N.n3(x * 0.021, 5.1, z * 0.021);
	const wz = z + 7 * N.n3(x * 0.021, 9.7, z * 0.021);
	const e = Math.hypot(x / 13.5, z / 8.6);
	const plat = 1 - smooth(0.78, 1.75, e);
	const r = Math.hypot(x, z);

	let h = 1.5 * N.fbm(wx * 0.034, 0.3, wz * 0.034, 3);
	h -= 3.1 * smooth(0.86, 1.7, e) * (1 - smooth(44, 90, r));

	const back = 0.28 + 0.72 * smooth(16, -36, z);
	const mmask = smooth(58, 150, r) * back;
	h += mmask * (N.ridged(wx * 0.0105, 2.3, wz * 0.0105, 5) * 30 - 5);
	const peaks =
		peak(x, z, wx, wz, -10, -124, 38, 46) +
		peak(x, z, wx, wz, -70, -90, 36, 30) +
		peak(x, z, wx, wz, 98, -150, 50, 34) +
		peak(x, z, wx, wz, 58, -34, 17, 9) +
		peak(x, z, wx, wz, -54, -24, 15, 7) +
		peak(x, z, wx, wz, 44, -84, 20, 7);
	h += peaks;

	// placed from the desktop hero camera: far end at the left edge of frame, near end low at bottom center
	const fgSeg = segment(x, z, -16.2, 19.2, -3.4, 27.6);
	const fgShape = Math.exp(-((fgSeg.d / 3.1) ** 2));
	const fgH = 4.9 * (0.55 + 0.45 * smooth(0, 0.2, fgSeg.t)) * (1 - 0.62 * smooth(0.4, 1, fgSeg.t));
	const fg = fgH * fgShape * (0.72 + 0.5 * N.ridged(x * 0.15, 1.1, z * 0.15, 3));
	h += fg;

	h = lerp(h, 0.1 * N.fbm(x * 0.12, 3.3, z * 0.12, 2), plat);

	const flank = smooth(0.8, 1.25, e) * (1 - smooth(1.5, 2.4, e));
	const rocky = clamp(mmask * 1.3 + fg / 2.6 + peaks / 9 + flank * 0.7);
	h += (0.62 * N.ridged(x * 0.21, 4.4, z * 0.21, 4) - 0.22) * (0.1 + 0.9 * rocky) * (1 - plat * 0.85);
	h += 0.16 * (N.ridged(x * 0.9, 1.9, z * 0.9, 2) - 0.4) * rocky;
	h += 0.06 * N.fbm(x * 0.8, 8.8, z * 0.8, 2) * (1 - plat * 0.4);
	const a = 0.55;
	const ripple = Math.sin((x * Math.cos(a) + z * Math.sin(a)) * 6.8 + 4.5 * N.n3(x * 0.22, 6.1, z * 0.22));
	const drift = Math.sin((x * 0.31 - z * 0.95) * 2.9 + 5 * N.n3(x * 0.13, 4.4, z * 0.13));
	h += (0.007 * ripple + 0.012 * drift) * (1 - rocky) * smooth(-0.25, 0.45, N.n3(x * 0.09, 2.2, z * 0.09));
	return { h, rocky, scour: clamp(fg / 2.4 + flank * 0.75) };
}

export const terrainHeight = (x: number, z: number): number => terrain(x, z).h;
export const terrainNoise = N;
