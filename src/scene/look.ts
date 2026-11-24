// Every tunable of the opening scene in one place: palette, fog, lights, camera keyframes, motion.
export const look = {
	fog: { color: '#a3a8b6', density: 0.0088, introDensity: 0.05, voidDensity: 0.015, returnDensity: 0.05 },
	stone: { dark: '#535966', light: '#858b99', frost: '#ccd3de' },
	ground: { rockDark: '#4c525f', rockLight: '#7b8291', snow: '#aeb4c2' },
	lights: {
		hemisphere: { sky: '#e6ecf6', ground: '#6f7684', intensity: 0.24 },
		key: { color: '#fff7ee', intensity: 2.5, position: [-15, 21, 15] as const },
		rim: { color: '#bfd2ff', intensity: 0.85, position: [13, 9, -17] as const },
		environment: 0.42,
	},
	seam: { color: '#eef4ff', core: 7.5, light: 62, pool: 4, halo: 0.5, joint: 0.75 },
	/** How far each character slides aside when the camera passes between them, in metres. */
	gate: { part: 0.8 },
	bloom: { intensity: 0.75, threshold: 0.92, smoothing: 0.25, radius: 0.72 },
	grain: 0.06,
	vignette: { offset: 0.32, darkness: 0.42 },
	camera: {
		// close to head on: the characters must read before anything else
		desktop: { position: [-7.4, 2.45, 31.5] as const, target: [0.2, 3.3, 0] as const, fov: 27 },
		phone: { position: [-8, 4.2, 47] as const, target: [0, 5.6, 0] as const, fov: 41 },
		introDesktop: { position: [-4, 16, 26] as const, target: [0, 2.6, 0] as const, fov: 27 },
		introPhone: { position: [-6, 24, 38] as const, target: [0, 3.2, 0] as const, fov: 41 },
		parallax: { x: 0.42, y: 0.22 },
	},
	pointer: { radius: 2.7, travel: 0.32, twist: 0.075, stiffness: 5.5 },
	entrance: { duration: 3.8 },
	exhibit: { turn: 0.11, tilt: 0.06, glow: 34, shell: { color: '#dde7f5', roughness: 0.16, clear: 0.2, frosted: 0.86 } },
	particles: { size: 0.034, color: '#8b93a6', hot: '#f2f6ff', spin: 0.23 },
	beam: { radius: 0.013, brightness: 2.6 },
	passage: { joint: 2.4, rim: 3.2 },
	// The world beyond the opening: ridges at three depths, and a sea of clouds below the journey.
	environment: {
		rock: '#474e5d',
		snow: '#c4cbd8',
		/** Per ridge band, near to far: distance, width, peak height, and how much it has faded into the sky. */
		ridges: [
			{ radius: 360, width: 150, height: 54, haze: 0.2 },
			{ radius: 640, width: 230, height: 112, haze: 0.4 },
			{ radius: 1020, width: 330, height: 205, haze: 0.6 },
		],
		cloudTop: -20,
		cloudOpacity: 0.94,
		/** Blossom, from its palest to its deepest, and the bark of the cherry, maple, birch, and shrub. */
		/** The rock of the banks: a little lighter and warmer than the far ridges, which are seen through more air. */
		cliff: '#70727a',
		petal: '#f4e9ec',
		petalDeep: '#e3a3b6',
		bark: ['#4b3f3c', '#4f473f', '#aaa69b', '#4a4238'],
	},
	/**
	 * One entry per season, in the order of the lap: the lab, Engineering, Kensaku, Explore.
	 * Everything seasonal is interpolated between neighbours, and autumn wraps to winter.
	 */
	seasons: [
		{ sky: '#a3a8b6', haze: 1, key: '#fff7ee', keyPower: 2.5, sun: [-15, 18.5, 15], hemiSky: '#e6ecf6', hemiGround: '#6f7684', snowLine: -60, growth: 0, canopy: 0, blossom: 0, leafA: '#5f7a55', leafB: '#6d8a5c', leafC: '#7a8a58', grass: '#6c7460', ground: '#5a606c', litter: 0, flake: '#f2f6ff', flakes: 1, leaf: 0, cloud: 1 },
		{ sky: '#b0bbbf', haze: 1.08, key: '#fff1dc', keyPower: 2.6, sun: [-15, 18.5, 15], hemiSky: '#eef1ee', hemiGround: '#7c8873', snowLine: 112, growth: 0.8, canopy: 0.56, blossom: 1, leafA: '#779c56', leafB: '#90ae66', leafC: '#afbc60', grass: '#7a9856', ground: '#7c7d66', litter: 0, flake: '#f7dbe3', flakes: 0.3, leaf: 0.55, cloud: 1.03 },
		{ sky: '#9bb1cd', haze: 0.6, key: '#fffcf4', keyPower: 3.1, sun: [-10, 24, 11], hemiSky: '#e4eefb', hemiGround: '#6c8068', snowLine: 172, growth: 1, canopy: 1.12, blossom: 0, leafA: '#4c7150', leafB: '#63895c', leafC: '#7b9450', grass: '#5f8450', ground: '#6f7458', litter: 0.05, flake: '#ffffff', flakes: 0.03, leaf: 0.55, cloud: 1.16 },
		{ sky: '#b9aa9c', haze: 0.92, key: '#ffd5a8', keyPower: 2.5, sun: [-22, 10.5, 13], hemiSky: '#f1e7da', hemiGround: '#857565', snowLine: 190, growth: 0.62, canopy: 0.52, blossom: 0, leafA: '#c0843f', leafB: '#a2523a', leafC: '#8a8a4a', grass: '#9a8c56', ground: '#84755e', litter: 1, flake: '#d2893a', flakes: 0.34, leaf: 1, cloud: 0.98 },
	],
} as const;

export type Vec3Tuple = readonly [number, number, number];
