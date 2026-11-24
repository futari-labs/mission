// The narrative as a pure function of the position within one lap: where the camera is, and every
// value the scene derives from that. Nothing here keeps state.
import * as THREE from 'three';
import { CYCLE, nearestChapter, RETURN_FROM } from '../journey/chapters.ts';
import { look } from './look.ts';

/** Height of the guiding light. It starts between the two characters of the landmark. */
export const BEAM_Y = 3.15;
export const STATION = {
	engineering: new THREE.Vector3(0, BEAM_Y, -60),
	kensaku: new THREE.Vector3(0, BEAM_Y, -110),
	explore: new THREE.Vector3(0, BEAM_Y, -190),
};
/** Where the three passage rings stand on the line of the light, between Kensaku and the installation. */
export const RING_Z = [STATION.kensaku.z - 16, STATION.kensaku.z - 31, STATION.kensaku.z - 46];

/**
 * The exhibits and the installation stand in open fog, so where they are in the world is free.
 * For the return to the opening, the installation is treated as standing this far along z instead:
 * in front of the opening camera. The camera then flies forward through the dispersing particles
 * and arrives at the monument. The move happens while nothing else is visible, so it cannot be seen.
 */
export const RETURN_SHIFT = 95 - STATION.explore.z;

export interface Pose {
	position: THREE.Vector3;
	target: THREE.Vector3;
	fov: number;
}

export interface JourneyState {
	/** 0 closed, 1 fully parted: the two characters making room for the camera. */
	gate: number;
	/** How far the beam has extended from the landmark, 0 to 1. */
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
	/** Return to the opening: 0 the form holds, 1 its particles have become drifting snow. */
	disperse: number;
	/** Return to the opening: 0 the base and its lights are in place, 1 they have sunk away. */
	recede: number;
	/** How much of the landscape's own snow and mist shows. Below 1 only during the return. */
	snow: number;
	/** How far along z the installation is drawn from its station. See RETURN_SHIFT. */
	shift: number;
	/** Assembly of each exhibit's parts, 0 scattered to 1 seated, and of its enclosure. */
	engineeringBuild: number;
	engineeringShell: number;
	kensakuBuild: number;
	kensakuShell: number;
	/** The passage rings: whether they render, how hidden in fog they are, and how far each has assembled. */
	passage: boolean;
	ringVeil: number;
	rings: [number, number, number];
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// clamped: rounding can put the polynomial a hair above 1, and a curve has no point past its end
const ease = (t: number) => Math.min(1, Math.max(0, t * t * t * (t * (t * 6 - 15) + 10)));
const span = (p: number, a: number, b: number) => THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);
const step = THREE.MathUtils.smoothstep;

/** Where each chapter's camera rest begins and ends, in journey units. The moves fill the gaps. */
const T = { engineering: [0.36, 0.48], kensaku: [0.6, 0.72], explore: 0.94 } as const;

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

type Path = [THREE.CatmullRomCurve3, THREE.CatmullRomCurve3];
interface Paths {
	framing: Framing;
	toEngineering: Path;
	toKensaku: Path;
	toExplore: Path;
	toLab: Path;
}

function buildPaths(f: Framing): Paths {
	const curve = (...pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');
	const shifted = (p: THREE.Vector3) => p.clone().setZ(p.z + RETURN_SHIFT);
	const from = shifted(f.explore[0]);
	const look0 = shifted(f.explore[1]);
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
		// beside the lens, onto the line of the light, and through the middle of each ring in turn
		toExplore: [
			curve(f.kensaku[0], v(4.4, BEAM_Y + 0.5, K.z - 1), v(1.7, BEAM_Y + 0.45, K.z - 9), v(0.18, BEAM_Y + 0.32, RING_Z[0]), v(-0.26, BEAM_Y + 0.46, RING_Z[1]), v(0.14, BEAM_Y + 0.3, RING_Z[2]), f.explore[0]),
			curve(f.kensaku[1], v(0.7, BEAM_Y, K.z - 22), v(0, BEAM_Y + 0.1, RING_Z[1] - 9), v(0, BEAM_Y - 0.2, X.z + 7), f.explore[1]),
		],
		// the return: forward through the dispersing form, up into the snow, and down to the opening view
		toLab: [
			curve(from, v(0, BEAM_Y + 1.7, from.z - 14), v(f.hero[0].x * 0.45, 8.6, f.hero[0].z + 32), v(f.hero[0].x * 0.9, f.hero[0].y + 2.1, f.hero[0].z + 9), f.hero[0]),
			curve(look0, v(0, BEAM_Y + 0.6, look0.z - 26), v(0.1, 3.8, 24), f.hero[1]),
		],
	};
}

const PATHS = { desktop: buildPaths(DESKTOP), phone: buildPaths(PHONE) };
const scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };

function along(paths: Paths, u: number, position: THREE.Vector3, target: THREE.Vector3): void {
	const f = paths.framing;
	const use = (pair: Path, t: number) => {
		pair[0].getPointAt(ease(t), position);
		pair[1].getPointAt(ease(t), target);
	};
	const rest = (pair: [THREE.Vector3, THREE.Vector3]) => {
		position.copy(pair[0]);
		target.copy(pair[1]);
	};
	if (u <= 0.06) rest(f.hero);
	else if (u < T.engineering[0]) use(paths.toEngineering, span(u, 0.06, T.engineering[0]));
	else if (u <= T.engineering[1]) rest(f.engineering);
	else if (u < T.kensaku[0]) use(paths.toKensaku, span(u, T.engineering[1], T.kensaku[0]));
	else if (u <= T.kensaku[1]) rest(f.kensaku);
	else if (u < T.explore) use(paths.toExplore, span(u, T.kensaku[1], T.explore));
	else if (u <= RETURN_FROM) rest(f.explore);
	else use(paths.toLab, span(u, RETURN_FROM, CYCLE));
}

/**
 * Camera pose for a position within the lap.
 * `wide` is 0 for a phone portrait frame and 1 for desktop. `aspect` is the frame's width over height.
 */
export function poseAt(u: number, wide: number, aspect: number, out: Pose): Pose {
	along(PATHS.phone, u, scratch.a, scratch.b);
	along(PATHS.desktop, u, scratch.c, scratch.d);
	out.position.lerpVectors(scratch.a, scratch.c, wide);
	out.target.lerpVectors(scratch.b, scratch.d, wide);
	out.fov = THREE.MathUtils.lerp(PHONE.fov, DESKTOP.fov, wide);
	// Between the phone and desktop framings, the opening view pulls back so both characters stay
	// in frame. The pull fades in and out with the opening view, at both ends of the lap.
	const hero = Math.max(1 - step(u, 0.06, 0.14), step(u, CYCLE - 0.07, CYCLE));
	if (hero > 0) {
		const fit = Math.max(1, 1.6 / Math.max(aspect, 0.72)) ** (0.55 * wide);
		out.position.sub(out.target).multiplyScalar(1 + (fit - 1) * hero).add(out.target);
	}
	return out;
}

/** With reduced motion the camera only ever stands at a rest pose, and the scene is that chapter's rest state. */
export function restUnits(u: number): number {
	return nearestChapter(u).rest;
}

export function stateAt(u: number, cameraZ: number, reducedMotion: boolean, out: JourneyState): JourneyState {
	const still = reducedMotion ? 0 : 1;
	out.disperse = 0;
	out.recede = 0;
	out.snow = 1;
	out.shift = 0;
	out.engineeringBuild = out.engineeringShell = out.kensakuBuild = out.kensakuShell = 1;
	out.passage = false;
	out.ringVeil = 1;
	out.rings[0] = out.rings[1] = out.rings[2] = 1;

	if (u > RETURN_FROM) {
		// The return is set from the position alone. Nothing here may depend on where the camera is,
		// because the camera is back in the opening landscape while the installation is still in view.
		const t = span(u, RETURN_FROM, CYCLE);
		out.shift = RETURN_SHIFT;
		out.gate = 0;
		out.beam = 0;
		out.white = 0;
		out.frost = 0;
		out.front = 0;
		out.engineering = false;
		out.kensaku = false;
		out.explore = t < 0.9;
		out.stage = t < 0.55;
		out.gather = 1;
		out.disperse = step(t, 0.03, 0.5);
		out.recede = step(t, 0, 0.45);
		// the particles thin out as the landscape's own snow takes over
		out.stream = 1 - step(t, 0.5, 0.88);
		out.snow = step(t, 0.36, 0.78);
		out.lab = t > 0.3;
		// thick drifting snow in the middle, clearing to the opening's own air
		const thick = THREE.MathUtils.lerp(look.fog.voidDensity, look.fog.returnDensity, step(t, 0, 0.36));
		out.fogDensity = THREE.MathUtils.lerp(thick, look.fog.density, ease(span(t, 0.4, 0.97)));
		return out;
	}

	// the first transition is keyed to the camera's distance from the landmark
	const passing = THREE.MathUtils.clamp((15 - cameraZ) / 39, 0, 1);
	out.gate = 1 - step(cameraZ, 4, 17);
	out.beam = reducedMotion ? (u > 0.2 ? 1 : 0) : step(u, 0.05, 0.2);
	out.fogDensity = THREE.MathUtils.lerp(look.fog.density, look.fog.voidDensity, 1 - step(cameraZ, -22, 0));
	out.white = still * 0.92 * (1 - step(cameraZ, -1.5, 3.5)) * step(cameraZ, -17, -5.5);
	// a light frost pass marks the move to Kensaku. The ring passage has none: the rings are the event.
	const second = Math.sin(Math.PI * span(u, 0.49, 0.555)) ** 1.5;
	out.frost = still * Math.max(step(passing, 0, 0.3) * (1 - step(passing, 0.62, 1)), 0.42 * second);
	out.front = second > 0 ? 1.35 - 1.7 * span(u, 0.49, 0.555) : passing * 2.6 - 0.15;
	out.lab = cameraZ > -10;
	out.engineering = cameraZ < 3 && cameraZ > E.z - 22;
	out.kensaku = cameraZ < E.z + 6 && cameraZ > K.z - 26;
	out.explore = cameraZ < K.z + 16;
	out.stage = cameraZ < K.z - 1.5;
	out.stream = step(u, 0.71, 0.76);
	out.gather = reducedMotion ? 1 : step(u, 0.85, 0.955);

	// Construction is a function of the position alone. Each exhibit builds while the camera approaches
	// and its enclosure resolves last. Under reduced motion the camera only stands at rests, where all of it is complete.
	if (!reducedMotion) {
		out.engineeringBuild = span(u, 0.2, 0.372);
		out.engineeringShell = step(u, 0.352, 0.4);
		out.kensakuBuild = span(u, 0.515, 0.607);
		out.kensakuShell = step(u, 0.592, 0.632);
		// Each ring assembles as the camera nears it and is closed 7 m before the camera arrives,
		// so nothing moves across the opening the camera is about to use.
		out.passage = u > T.kensaku[1] - 0.006 && cameraZ > RING_Z[2] - 6;
		out.ringVeil = 1 - step(u, T.kensaku[1], T.kensaku[1] + 0.04);
		for (let i = 0; i < 3; i++) out.rings[i] = 1 - step(cameraZ, RING_Z[i] + 7, RING_Z[i] + 36);
	}
	return out;
}

export const emptyState = (): JourneyState => ({
	gate: 0, beam: 0, fogDensity: look.fog.density, white: 0, frost: 0, front: 0,
	lab: true, engineering: false, kensaku: false, explore: false,
	gather: 0, stream: 0, stage: false, disperse: 0, recede: 0, snow: 1, shift: 0,
	engineeringBuild: 1, engineeringShell: 1, kensakuBuild: 1, kensakuShell: 1, passage: false, ringVeil: 1, rings: [1, 1, 1],
});
export const emptyPose = (): Pose => ({ position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 27 });
