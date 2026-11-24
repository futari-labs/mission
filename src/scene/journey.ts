// The narrative as a pure function of scroll progress: where the camera is, and every value
// the scene derives from that. Nothing here keeps state.
import * as THREE from 'three';
import { CHAPTERS, nearestChapter } from '../journey/chapters.ts';
import { look } from './look.ts';

/** Height of the guiding light. It starts between the two characters of the landmark. */
export const BEAM_Y = 3.15;
export const STATION = {
	engineering: new THREE.Vector3(0, BEAM_Y, -60),
	kensaku: new THREE.Vector3(0, BEAM_Y, -110),
	explore: new THREE.Vector3(0, BEAM_Y, -165),
};

export interface Pose {
	position: THREE.Vector3;
	target: THREE.Vector3;
	fov: number;
}

export interface JourneyState {
	/** 0 closed, 1 fully parted: the two characters making room for the camera. */
	gate: number;
	/** How far the beam has extended from the seam, 0 to 1. */
	beam: number;
	fogDensity: number;
	white: number;
	frost: number;
	front: number;
	lab: boolean;
	engineering: boolean;
	kensaku: boolean;
	explore: boolean;
	/** 0 particles still streaming from the lens, 1 gathered into a form. */
	gather: number;
	/** 0 hidden, 1 shown: the particle system as a whole. */
	stream: number;
	/** The base and lights of the installation. Hidden until the camera has passed the lens. */
	stage: boolean;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const span = (p: number, a: number, b: number) => THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);
const step = THREE.MathUtils.smoothstep;

interface Framing {
	hero: [THREE.Vector3, THREE.Vector3];
	engineering: [THREE.Vector3, THREE.Vector3];
	kensaku: [THREE.Vector3, THREE.Vector3];
	explore: [THREE.Vector3, THREE.Vector3];
	fov: number;
}

const E = STATION.engineering;
const K = STATION.kensaku;
const X = STATION.explore;
const DESKTOP: Framing = {
	hero: [v(...look.camera.desktop.position), v(...look.camera.desktop.target)],
	engineering: [v(-3.4, BEAM_Y + 0.75, E.z + 13.8), v(-0.15, BEAM_Y - 0.3, E.z)],
	kensaku: [v(3.6, BEAM_Y + 0.55, K.z + 14.2), v(0.25, BEAM_Y - 0.45, K.z - 0.2)],
	explore: [v(0, BEAM_Y + 0.75, X.z + 12.2), v(0, BEAM_Y - 0.7, X.z)],
	fov: 27,
};
const PHONE: Framing = {
	hero: [v(...look.camera.phone.position), v(...look.camera.phone.target)],
	engineering: [v(-2.6, BEAM_Y + 1.0, E.z + 15.5), v(0.1, BEAM_Y - 0.15, E.z)],
	kensaku: [v(2.8, BEAM_Y + 0.9, K.z + 16.5), v(-0.1, BEAM_Y - 0.3, K.z)],
	explore: [v(0, BEAM_Y + 0.9, X.z + 17.5), v(0, BEAM_Y - 0.1, X.z)],
	fov: 41,
};

interface Paths {
	framing: Framing;
	toEngineering: [THREE.CatmullRomCurve3, THREE.CatmullRomCurve3];
	toKensaku: [THREE.CatmullRomCurve3, THREE.CatmullRomCurve3];
	toExplore: [THREE.CatmullRomCurve3, THREE.CatmullRomCurve3];
}

function buildPaths(f: Framing): Paths {
	const curve = (...pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');
	return {
		framing: f,
		// toward the light, between the two characters, and along the beam, as one move
		toEngineering: [
			curve(f.hero[0], v(-3.2, 2.9, 17), v(-0.3, BEAM_Y - 0.05, 6), v(0, BEAM_Y, -5), v(-1.4, BEAM_Y + 0.3, -32), f.engineering[0]),
			curve(f.hero[1], v(0, BEAM_Y - 0.1, -6), v(0, BEAM_Y, -24), v(0, BEAM_Y, -42), v(0.2, BEAM_Y - 0.1, -57), f.engineering[1]),
		],
		// past the first enclosure on its near side, then on to the next
		toKensaku: [
			curve(f.engineering[0], v(-4.1, BEAM_Y + 0.5, E.z + 1.5), v(-1.6, BEAM_Y + 0.2, E.z - 20), f.kensaku[0]),
			curve(f.engineering[1], v(0, BEAM_Y, E.z - 16), v(-0.2, BEAM_Y - 0.2, K.z + 6), f.kensaku[1]),
		],
		// beside the lens, up over the beam, and down to the installation
		toExplore: [
			curve(f.kensaku[0], v(4.3, BEAM_Y + 0.6, K.z - 0.5), v(1.4, BEAM_Y + 3.6, K.z - 27), f.explore[0]),
			curve(f.kensaku[1], v(0, BEAM_Y, K.z - 22), v(0, BEAM_Y - 0.9, X.z + 2), f.explore[1]),
		],
	};
}

const PATHS = { desktop: buildPaths(DESKTOP), phone: buildPaths(PHONE) };
const scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };

function along(paths: Paths, progress: number, position: THREE.Vector3, target: THREE.Vector3): void {
	const f = paths.framing;
	const use = (pair: [THREE.CatmullRomCurve3, THREE.CatmullRomCurve3], t: number) => {
		pair[0].getPointAt(ease(t), position);
		pair[1].getPointAt(ease(t), target);
	};
	const rest = (pair: [THREE.Vector3, THREE.Vector3]) => {
		position.copy(pair[0]);
		target.copy(pair[1]);
	};
	if (progress <= 0.06) rest(f.hero);
	else if (progress < 0.31) use(paths.toEngineering, span(progress, 0.06, 0.31));
	else if (progress <= 0.42) rest(f.engineering);
	else if (progress < 0.53) use(paths.toKensaku, span(progress, 0.42, 0.53));
	else if (progress <= 0.65) rest(f.kensaku);
	else if (progress < 0.82) use(paths.toExplore, span(progress, 0.65, 0.82));
	else rest(f.explore);
}

/** Camera pose for a progress value. `wide` is 0 for a phone portrait frame and 1 for desktop. */
export function poseAt(progress: number, wide: number, reducedMotion: boolean, out: Pose): Pose {
	const p = reducedMotion ? restProgress(progress) : progress;
	along(PATHS.phone, p, scratch.a, scratch.b);
	along(PATHS.desktop, p, scratch.c, scratch.d);
	out.position.lerpVectors(scratch.a, scratch.c, wide);
	out.target.lerpVectors(scratch.b, scratch.d, wide);
	out.fov = THREE.MathUtils.lerp(PHONE.fov, DESKTOP.fov, wide);
	return out;
}

/** With reduced motion the camera only ever stands at a rest pose. */
export function restProgress(progress: number): number {
	const chapter = nearestChapter(progress);
	return chapter.id === 'lab' ? 0 : chapter.id === 'explore' ? 1 : chapter.rest;
}

export function stateAt(progress: number, cameraZ: number, reducedMotion: boolean, out: JourneyState): JourneyState {
	// the first transition is keyed to the camera's distance from the seam
	const passing = THREE.MathUtils.clamp((15 - cameraZ) / 39, 0, 1);
	const still = reducedMotion ? 0 : 1;
	out.gate = 1 - step(cameraZ, 4, 17);
	out.beam = reducedMotion ? 1 : step(progress, 0.05, 0.2);
	out.fogDensity = THREE.MathUtils.lerp(look.fog.density, look.fog.voidDensity, 1 - step(cameraZ, -22, 0));
	out.white = still * 0.92 * (1 - step(cameraZ, -1.5, 3.5)) * step(cameraZ, -17, -5.5);
	const second = Math.sin(Math.PI * span(progress, 0.435, 0.52)) ** 1.5;
	const third = Math.sin(Math.PI * span(progress, 0.665, 0.77)) ** 1.5;
	out.frost = still * Math.max(step(passing, 0, 0.3) * (1 - step(passing, 0.62, 1)), 0.5 * second, 0.45 * third);
	out.front = second > 0 ? 1.35 - 1.7 * span(progress, 0.435, 0.52) : third > 0 ? 1.35 - 1.7 * span(progress, 0.665, 0.77) : passing * 2.6 - 0.15;
	out.lab = cameraZ > -10;
	out.engineering = cameraZ < 3 && cameraZ > E.z - 22;
	out.kensaku = cameraZ < E.z + 6 && cameraZ > K.z - 26;
	out.explore = cameraZ < K.z + 16;
	out.stage = cameraZ < K.z - 1.5;
	out.stream = step(progress, 0.635, 0.68);
	out.gather = reducedMotion ? 1 : step(progress, 0.7, 0.83);
	return out;
}

export const emptyState = (): JourneyState => ({ gate: 0, beam: 0, fogDensity: look.fog.density, white: 0, frost: 0, front: 0, lab: true, engineering: false, kensaku: false, explore: false, gather: 0, stream: 0, stage: false });
export const emptyPose = (): Pose => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 27 });
export { CHAPTERS };
