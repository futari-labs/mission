// The hills of the growing seasons and what stands on them.
//
// `bankHeight` is the one description of the ground. The meshes are sampled from it, and every
// tree and shrub is placed on it, so nothing can float above the surface or sink into it.
//
// A bank is a summit standing out of the cloud sea: a rolling top that carries the grove, benches
// and broken ledges stepping down from it, gullies worn into its flanks, and rock where it is steep.
import * as THREE from 'three';
import { type Pose, poseAt } from '../../src/scene/journey.ts';
import { clamp, lerp, makeNoise, mulberry32, smooth } from './noise.ts';
import { crownOf, SPECIES } from './trees.ts';

/** The foot of every bank is under the cloud tops, which the app draws at -20. */
const FOOT = -29;
const N = makeNoise(9091);

export interface Bank {
	name: string;
	x: number;
	z: number;
	radius: number;
	top: number;
	/** Grid spacing of its mesh in metres. Banks the camera passes close to are finer. */
	cell: number;
	trees: number;
	shrubs: number;
	/** How likely each species is here, in the order of SPECIES without the shrub. */
	mix: [number, number, number];
}

// Each resting view has one bank close enough to read its trees branch by branch, on the side
// away from that chapter's heading. The rest stand further off and fill the middle distance.
export const BANKS: Bank[] = [
	{ name: 'spring', x: 60, z: -108, radius: 46, top: 1.6, cell: 0.6, trees: 14, shrubs: 12, mix: [0.6, 0.25, 0.15] },
	{ name: 'summer', x: -58, z: -158, radius: 44, top: 1.2, cell: 0.6, trees: 14, shrubs: 11, mix: [0.15, 0.5, 0.35] },
	{ name: 'autumn', x: 45, z: -250, radius: 42, top: 0.6, cell: 0.6, trees: 13, shrubs: 10, mix: [0.2, 0.5, 0.3] },
	{ name: 'autumn_low', x: -40, z: -248, radius: 38, top: -5, cell: 0.75, trees: 6, shrubs: 8, mix: [0.1, 0.4, 0.5] },
	{ name: 'east', x: 78, z: -166, radius: 36, top: 3.5, cell: 1.2, trees: 12, shrubs: 4, mix: [0.3, 0.45, 0.25] },
	{ name: 'west', x: -92, z: -196, radius: 36, top: 3, cell: 1.2, trees: 12, shrubs: 4, mix: [0.25, 0.45, 0.3] },
	{ name: 'beyond', x: 62, z: -300, radius: 36, top: 2.5, cell: 1.4, trees: 11, shrubs: 2, mix: [0.2, 0.5, 0.3] },
	{ name: 'north', x: -100, z: -330, radius: 44, top: 3, cell: 1.6, trees: 12, shrubs: 0, mix: [0.2, 0.5, 0.3] },
];

export interface Ground {
	h: number;
	/** 0 to 1: exposed rock standing out of the turf. */
	outcrop: number;
	/** 0 to 1: the bed of a gully, where soil shows and leaves collect. */
	gully: number;
	/** Distance from the centre as a share of the bank's own outline: 0 the middle, 1 the foot. */
	d: number;
}

export function bankGround(b: Bank, x: number, z: number): Ground {
	const dx = x - b.x;
	const dz = z - b.z;
	const o = b.x * 0.173 + b.z * 0.091;
	const ax = dx / (Math.hypot(dx, dz) || 1);
	const az = dz / (Math.hypot(dx, dz) || 1);
	// a lobed outline, not a round one
	const outline = b.radius * (0.86 + 0.2 * N.n3(ax * 1.4 + o, az * 1.4, 0.5) + 0.1 * N.n3(ax * 3.1, az * 3.1 + o, 1.5));
	const d = Math.max(0, Math.hypot(dx, dz) / outline + 0.07 * N.n3(x * 0.07 + o, 2.2, z * 0.07));
	const fall = smooth(0.3, 1, d);
	const drop = (b.top - FOOT) * fall ** 1.8;
	// the flanks step down in benches that follow the contours, and the benches are broken, not continuous
	const stepped = (height: number, tread: number, seed: number) => {
		const q = drop / height + 0.35 * N.n3(x * 0.05 + seed, 3.3, z * 0.05 + o);
		const k = Math.floor(q);
		return (k + smooth(tread, 1, q - k) - (q - drop / height)) * height;
	};
	// the shoulder that faces the line of travel always has a bench: that is where the grove can be seen
	const facing = smooth(0.25, 0.8, -ax * Math.sign(b.x));
	const benches = Math.max(facing, smooth(-0.25, 0.3, N.n3(ax * 2.2 + o, az * 2.2, 7.1 + d)));
	const ledges = smooth(-0.1, 0.35, N.n3(x * 0.09 + o, 5.5, z * 0.09));
	let fallen = lerp(drop, stepped(7, 0.58 + 0.1 * facing, 1.7), 0.8 * benches);
	fallen = lerp(fallen, lerp(fallen, stepped(1.9, 0.5, 9.3), 0.75), ledges * smooth(0.02, 0.2, fall));
	let h = b.top - 1.5 * d * d + 1.3 * N.fbm(x * 0.05 + o, 4.1, z * 0.05, 3) * (1 - fall) - fallen;
	// gullies run down the fall line: nearly straight outward, wandering a little as they go
	const g = N.n3(ax * 5.3 + o, az * 5.3, 3.3 + d * 0.7);
	const gully = (1 - Math.min(1, Math.abs(g) * 4.2)) ** 2 * smooth(0.24, 0.5, d);
	h -= (0.5 + 2.4 * fall) * gully;
	// knuckles of rock push up through the turf around the shoulder of the hill
	const knob = Math.max(0, N.n3(x * 0.17 + o, 7.7, z * 0.17) - 0.3);
	const outcrop = smooth(0, 0.16, knob) * smooth(0.14, 0.4, d);
	h += 5 * knob * smooth(0.14, 0.4, d) * (1 - 0.6 * fall);
	h += 0.22 * N.fbm(x * 0.42, 1.1, z * 0.42 + o, 3) + 0.05 * N.n3(x * 1.9, 5, z * 1.9);
	return { h, outcrop, gully, d };
}

const normalAt = (b: Bank, x: number, z: number): [number, number, number] => {
	const e = 0.16;
	const hx = bankGround(b, x + e, z).h - bankGround(b, x - e, z).h;
	const hz = bankGround(b, x, z + e).h - bankGround(b, x, z - e).h;
	const l = Math.hypot(hx, 2 * e, hz);
	return [-hx / l, (2 * e) / l, -hz / l];
};

/** One tree or shrub standing on a bank. */
export interface Plant {
	species: number;
	/** 0 for the detailed mesh, 1 for the distant one. */
	detail: 0 | 1;
	x: number;
	y: number;
	z: number;
	yaw: number;
	scale: number;
	/** Per plant, 0 to 1: how early its leaves come, a colour variation, and how much it blossoms. */
	early: number;
	tint: number;
	blossom: number;
}

const CROWNS = SPECIES.map(crownOf);

// Where no crown may stand in the frame: behind an exhibit while it assembles and at rest, behind
// the particle form, and behind each chapter's heading. Boxes are [left, bottom, right, top] with
// the frame running from -1 to 1, tested from the journey's own camera at those positions.
const SUBJECT = [-0.37, -0.62, 0.37, 0.66];
const KEEP_CLEAR = [
	...[0.3, 0.36, 0.52, 0.57, 0.62, 0.96].map((u) => ({ u, boxes: [SUBJECT] })),
	// at rest: the heading on one side, and the description and its buttons on the other
	{ u: 0.43, boxes: [SUBJECT, [-0.92, 0.22, -0.3, 0.68], [0.42, -0.74, 0.9, -0.2]] },
	{ u: 0.67, boxes: [SUBJECT, [0.3, 0.22, 0.92, 0.68], [-0.96, -0.74, -0.42, -0.2]] },
	// through the rings, the way ahead stays open
	...[0.76, 0.82].map((u) => ({ u, boxes: [[-0.26, -0.5, 0.26, 0.5]] })),
	{ u: 1.02, boxes: [[-0.52, -1, 0.52, 0.72], [-1, 0.02, -0.5, 0.62]] },
].map(({ u, boxes }) => {
	const pose = poseAt(u, 1, 1.6, { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 27 } satisfies Pose);
	const camera = new THREE.PerspectiveCamera(pose.fov, 1.6, 0.1, 3000);
	camera.position.copy(pose.position);
	camera.lookAt(pose.target);
	camera.updateMatrixWorld();
	camera.updateProjectionMatrix();
	return { camera, boxes };
});
const point = new THREE.Vector3();
function inKeptClear(x: number, y: number, z: number): boolean {
	return KEEP_CLEAR.some(({ camera, boxes }) => {
		// further off than this a crown is small and hazed, and it gives a narrow phone frame its only trees
		if (point.set(x, y, z).distanceTo(camera.position) > 200) return false;
		point.project(camera);
		return point.z < 1 && boxes.some((b) => point.x > b[0] && point.x < b[2] && point.y > b[1] && point.y < b[3]);
	});
}
/** The camera travels close to the line x = 0 between these depths. Plants near it get the detailed mesh. */
const nearTravel = (x: number, z: number) => Math.hypot(x, z - clamp(z, -200, -30)) < 70;

function plant(b: Bank, rng: () => number): Plant[] {
	const out: Plant[] = [];
	const clear = (x: number, z: number, room: number) => out.every((p) => Math.hypot(p.x - x, p.z - z) > room * (p.species === 3 ? 0.5 : 1));
	// trees gather in two or three stands on the level ground, and never on the brink
	// and one stand is always on the shoulder that faces the line of travel, where it can be seen
	const toward = Math.atan2(0, -b.x);
	const stands = Array.from({ length: 3 }, (_, i) => {
		const a = i === 0 ? toward + (rng() - 0.5) * 0.9 : rng() * Math.PI * 2;
		const r = b.radius * (i === 0 ? 0.4 + 0.14 * rng() : 0.06 + 0.26 * rng());
		return [b.x + Math.cos(a) * r, b.z + Math.sin(a) * r];
	});
	const place = (species: number, tries: number, level: number, room: number, spread: number, within: [number, number], facing = false) => {
		for (let i = 0; i < tries; i++) {
			const stand = stands[facing ? 0 : Math.floor(rng() * stands.length)];
			const a = rng() * Math.PI * 2;
			const r = spread * Math.sqrt(rng());
			const x = stand[0] + Math.cos(a) * r;
			const z = stand[1] + Math.sin(a) * r;
			const g = bankGround(b, x, z);
			if (g.d < within[0] || g.d > within[1] || g.outcrop > 0.3 || normalAt(b, x, z)[1] < level || !clear(x, z, room)) continue;
			const tree = species < 3;
			if (inKeptClear(x, g.h + CROWNS[species].centre[1] * 0.85, z)) continue;
			out.push({
				species,
				detail: nearTravel(x, z) ? 0 : 1,
				x,
				y: g.h,
				z,
				yaw: rng() * Math.PI * 2,
				scale: tree ? 0.74 + 0.42 * rng() : 0.7 + 0.6 * rng(),
				early: rng(),
				tint: rng(),
				// every cherry blossoms, and here and there a maple or a shrub does
				blossom: species === 0 ? 0.8 + 0.2 * rng() : species === 2 ? 0 : rng() < 0.3 ? 0.45 + 0.4 * rng() : 0,
			});
			return;
		}
	};
	for (let i = 0; i < b.trees; i++) {
		const pick = rng();
		const species = pick < b.mix[0] ? 0 : pick < b.mix[0] + b.mix[1] ? 1 : 2;
		// nearly half of a close bank's trees stand on the shoulder the camera sees
		place(species, 120, 0.88, species === 2 ? 3.2 : 4.6, b.radius * 0.3, [0, 0.76], b.cell < 0.8 && i < b.trees * 0.45);
	}
	// shrubs take the rim, the benches, and the lee of the rocks, where a tree would not stand
	for (let i = 0; i < b.shrubs; i++) place(3, 60, 0.78, 2.2, b.radius * 0.62, [0.2, 0.8]);
	return out;
}

export interface BakedBank {
	name: string;
	positions: Float32Array;
	normals: Float32Array;
	/** R occlusion, with the shade under each crown. G exposed rock. B gully bed. A where fallen leaves gather. */
	bake: Uint8Array;
	indices: Uint32Array;
}

export function buildLandscape(): { banks: BakedBank[]; plants: Plant[] } {
	const banks: BakedBank[] = [];
	const plants: Plant[] = [];
	BANKS.forEach((b, bi) => {
		const here = plant(b, mulberry32(4100 + bi * 13));
		plants.push(...here);
		const crowns = here.map((p) => {
			const c = CROWNS[p.species];
			const [cs, sn] = [Math.cos(p.yaw), Math.sin(p.yaw)];
			return { x: p.x + (c.centre[0] * cs + c.centre[2] * sn) * p.scale, z: p.z + (-c.centre[0] * sn + c.centre[2] * cs) * p.scale, reach: c.reach * p.scale, tree: p.species < 3 };
		});
		const span = Math.ceil((b.radius * 1.22) / b.cell);
		const size = span * 2 + 1;
		const index = new Int32Array(size * size).fill(-1);
		const positions: number[] = [];
		const normals: number[] = [];
		const bake: number[] = [];
		for (let k = 0; k < size; k++)
			for (let i = 0; i < size; i++) {
				const x = b.x + (i - span) * b.cell;
				const z = b.z + (k - span) * b.cell;
				const g = bankGround(b, x, z);
				// nothing is needed below the cloud
				if (g.h < FOOT + 1.5) continue;
				index[k * size + i] = positions.length / 3;
				positions.push(x, g.h, z);
				normals.push(...normalAt(b, x, z));
				const c = 1.3;
				const hollow = (bankGround(b, x + c, z).h + bankGround(b, x - c, z).h + bankGround(b, x, z + c).h + bankGround(b, x, z - c).h - 4 * g.h) / c;
				let shade = 1;
				let litter = 0.55 * g.gully + 0.5 * smooth(0.25, 1.2, hollow);
				for (const crown of crowns) {
					const near = Math.hypot(x - crown.x, z - crown.z) / crown.reach;
					// the ground is darkest under the middle of a crown and clear a little beyond its edge
					shade *= 1 - (crown.tree ? 0.42 : 0.3) * smooth(1.05, 0.25, near);
					litter = Math.max(litter, (crown.tree ? 1 : 0.5) * smooth(1.5, 0.5, near));
				}
				bake.push(Math.round(clamp(shade * clamp(1 - hollow * 0.22, 0.5, 1.12)) * 255), Math.round(g.outcrop * 255), Math.round(clamp(g.gully) * 255), Math.round(clamp(litter) * 255));
			}
		const indices: number[] = [];
		for (let k = 0; k < size - 1; k++)
			for (let i = 0; i < size - 1; i++) {
				const [a, c, d, e] = [index[k * size + i], index[k * size + i + 1], index[(k + 1) * size + i], index[(k + 1) * size + i + 1]];
				if (a < 0 || c < 0 || d < 0 || e < 0) continue;
				indices.push(a, d, c, c, d, e);
			}
		banks.push({ name: `bank_${b.name}`, positions: new Float32Array(positions), normals: new Float32Array(normals), bake: new Uint8Array(bake), indices: new Uint32Array(indices) });
	});
	return { banks, plants };
}
