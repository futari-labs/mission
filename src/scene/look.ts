// Every tunable of the opening scene in one place: palette, fog, lights, camera keyframes, motion.
export const look = {
	fog: { color: '#a3a8b6', density: 0.0088, introDensity: 0.05 },
	stone: { dark: '#535966', light: '#858b99', frost: '#ccd3de' },
	ground: { rockDark: '#4c525f', rockLight: '#7b8291', snow: '#aeb4c2' },
	lights: {
		hemisphere: { sky: '#e6ecf6', ground: '#6f7684', intensity: 0.24 },
		key: { color: '#fff7ee', intensity: 2.5, position: [-15, 21, 15] as const },
		rim: { color: '#bfd2ff', intensity: 0.85, position: [13, 9, -17] as const },
		environment: 0.42,
	},
	seam: { color: '#eef4ff', core: 7.5, light: 130, pool: 16, halo: 0.5 },
	bloom: { intensity: 0.75, threshold: 0.92, smoothing: 0.25, radius: 0.72 },
	grain: 0.06,
	vignette: { offset: 0.32, darkness: 0.42 },
	camera: {
		desktop: { position: [-10.5, 2.45, 31] as const, target: [0.3, 3.55, 0] as const, fov: 27 },
		phone: { position: [-28, 4.6, 37.5] as const, target: [0.2, 6, 0] as const, fov: 41 },
		introDesktop: { position: [-5, 17, 25] as const, target: [0, 2.6, 0] as const, fov: 27 },
		introPhone: { position: [-13, 24, 30] as const, target: [0, 3.2, 0] as const, fov: 41 },
		parallax: { x: 0.42, y: 0.22 },
	},
	pointer: { radius: 2.7, travel: 0.32, twist: 0.075, stiffness: 5.5 },
	entrance: { duration: 3.8 },
} as const;

export type Vec3Tuple = readonly [number, number, number];
