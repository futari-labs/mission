// Controlled experiments, set from the URL and read once. They exist to isolate what a frame costs
// on a real device, one variable at a time:
//
//   ?dpr=1.25            rendered pixels per CSS pixel, held for the whole visit
//   ?msaa=0              samples of the scene buffer: 0, 2, or 4
//   ?tier=1              start on this quality tier (0 is the lowest) and stay on it
//   ?bloom=0.5           bloom resolution as a share of the frame
//   ?governor=off        never change tier
//   ?off=bloom,clouds    leave parts of the frame out. Passes: bloom, transition, grain, shadows.
//                        Layers: terrain, landmark, ridges, clouds, banks, wood, foliage, mist,
//                        particles, shafts, exhibits, explore, passage.
//
// Setting dpr, msaa, or tier also holds the governor still, so the variable under test stays put.
import type * as THREE from 'three';

export type LayerName = 'terrain' | 'landmark' | 'ridges' | 'clouds' | 'banks' | 'wood' | 'foliage' | 'mist' | 'particles' | 'shafts' | 'exhibits' | 'explore' | 'passage';

const params = new URLSearchParams(location.search);
const number = (key: string): number | null => {
	const raw = params.get(key);
	const n = raw === null || raw === '' ? Number.NaN : Number(raw);
	return Number.isFinite(n) ? n : null;
};

const dpr = number('dpr');
const msaa = number('msaa');
const tier = number('tier');

export const experiment = {
	dpr,
	msaa,
	tier,
	bloom: number('bloom'),
	governor: params.get('governor') !== 'off' && dpr === null && msaa === null && tier === null,
	off: new Set((params.get('off') ?? '').split(',').filter(Boolean)),
} as const;

/** Marks an object, and everything under it, as one named layer of the frame, so an experiment can leave it out. */
export function tag<T extends THREE.Object3D>(object: T, layer: LayerName): T {
	object.userData.layer = layer;
	return object;
}

/** Takes the layers named in ?off= out of every camera's view. Call again after anything joins the scene. */
export function applyLayerExperiment(root: THREE.Object3D): void {
	if (experiment.off.size === 0) return;
	const visit = (object: THREE.Object3D, inherited: string | undefined) => {
		const layer = (object.userData.layer as string | undefined) ?? inherited;
		// a layer mask is tested per object and survives the per-frame visibility switches of the journey
		if (layer && experiment.off.has(layer)) object.layers.set(31);
		for (const child of object.children) visit(child, layer);
	};
	visit(root, undefined);
}
