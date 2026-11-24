// Runs the quality governor against scripted frames: what it does under sustained load, a moderate
// slowdown, startup spikes, a browser frame-rate cap, and when there is room to raise the tier.
// No browser. Exits non-zero on any failure.
// Usage: node tools/governor-test.ts
import { FRAME_60, Governor, loadOf, tiersFor } from '../src/scene/quality.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

interface Frame {
	/** Milliseconds since the previous animation frame. */
	interval: number;
	/** What a measured frame would cost, script and GPU together. */
	cost: number;
}
interface Run {
	changes: [seconds: number, tier: number][];
	measured: number;
	governor: Governor;
}

/** Feeds `seconds` of frames. `frame` sees the time, the current tier, and the frame's index. */
function run(governor: Governor, seconds: number, frame: (t: number, tier: number, i: number) => Frame, from = 0): Run {
	const changes: [number, number][] = [];
	let measured = 0;
	let now = from * 1000;
	for (let i = 0; now < (from + seconds) * 1000; i++) {
		const f = frame(now / 1000, governor.tier, i);
		now += f.interval;
		let tier = governor.frame(f.interval, now);
		if (governor.wantsCost) {
			measured++;
			tier = governor.cost(f.cost, now) ?? tier;
		}
		if (tier !== null) changes.push([+(now / 1000).toFixed(1), tier]);
	}
	return { changes, measured, governor };
}

const phone = tiersFor(true);
const desktop = tiersFor(false);
const make = (ladder: typeof phone, start = ladder.start) => new Governor({ loads: ladder.tiers.map(loadOf), start, enabled: true });
/** A display at 60 Hz where a share of the frames take two refreshes. */
const dropping = (share: number, cost: number) => (_t: number, _tier: number, i: number): Frame => ({ interval: (i * share) % 1 < share ? FRAME_60 * 2 : FRAME_60, cost });
const smooth = (cost: number) => (): Frame => ({ interval: FRAME_60, cost });
const list = (r: Run) => r.changes.map(([t, tier]) => `${t}s→${tier}`).join(' ') || 'none';

// ---- nothing to do
{
	const r = run(make(desktop), 120, smooth(5));
	check('desktop at 60 fps: stays on the top tier and measures nothing', r.changes.length === 0 && r.measured === 0, `${list(r)}, ${r.measured} measured`);
}
{
	const r = run(make(desktop), 60, (t) => ({ interval: t < 2.6 && t > 2.5 ? 220 : FRAME_60, cost: 5 }));
	check('a stall at startup is not load', r.changes.length === 0, list(r));
}
{
	// one long frame every two seconds: 1 in 120
	const r = run(make(desktop), 60, (_t, _tier, i) => ({ interval: i % 120 === 0 ? 90 : FRAME_60, cost: 5 }));
	check('an isolated spike every two seconds is not load', r.changes.length === 0, list(r));
}

// ---- sustained load
{
	// 45 fps: one frame in three takes two refreshes. Every tier below the top is light enough.
	const r = run(make(desktop), 30, (t, tier, i) => (tier === 2 ? dropping(1 / 3, 21)(t, tier, i) : smooth(9)()));
	check('sustained 45 fps: one tier down, then steady', r.changes.length === 1 && r.changes[0][1] === 1, list(r));
	check('  and within a few seconds', r.changes[0]?.[0] < 8, `${r.changes[0]?.[0]} s`);
}
{
	// The old rule counted frames over 24 ms up by one and others down by two, and acted at 90. At 52 fps it never fired.
	let old = 0;
	let oldFired = false;
	const frames = dropping(0.15, 18);
	for (let i = 0; i < 3600; i++) {
		old = frames(0, 0, i).interval > 24 ? old + 1 : Math.max(0, old - 2);
		if (old > 90) oldFired = true;
	}
	const r = run(make(desktop), 30, (t, tier, i) => (tier === 2 ? frames(t, tier, i) : smooth(9)()));
	check('a moderate slowdown (52 fps) lowers the tier, which the old rule never did', r.changes.length === 1 && !oldFired, `${list(r)}, old rule fired: ${oldFired}`);
}
{
	// heavy everywhere: goes down a tier at a time and stops at the floor
	const r = run(make(phone), 60, dropping(0.4, 25));
	check('overloaded at every tier: steps down to the lowest and stays', r.changes.map((c) => c[1]).join() === '1,0', list(r));
	check('  reported as overload, not as a cap', !r.governor.capped && /lowest/.test(r.governor.status), r.governor.status);
}

// ---- a browser cap is not load
{
	const g = make(phone);
	const r = run(g, 20, () => ({ interval: 1000 / 30, cost: 6 }));
	check('30 fps with cheap frames (Low Power Mode): tier kept, marked as capped', r.changes.length === 0 && g.capped && Math.abs(g.budget - 1000 / 30) < 0.5, `${list(r)}, capped ${g.capped}, budget ${g.budget.toFixed(1)}`);
	const after = run(g, 20, smooth(6), 20);
	check('  the cap lifting restores the 60 fps budget', !g.capped && Math.abs(g.budget - FRAME_60) < 0.01 && after.changes.every((c) => c[1] >= phone.start), `capped ${g.capped}, ${list(after)}`);
}
{
	const g = make(phone);
	g.calibrate(1000 / 30);
	const r = run(g, 20, () => ({ interval: 1000 / 30, cost: 6 }));
	check('a cap seen before the first frame: no tier change, nothing measured', r.changes.length === 0 && g.capped && r.measured === 0, `${list(r)}, ${r.measured} measured`);
}
{
	const g = make(phone);
	const r = run(g, 30, dropping(0.25, 5));
	check('frames missed while each is cheap (work outside rendering): tier kept', r.changes.length === 0 && !g.capped, `${list(r)}, ${g.status}`);
}
{
	const g = make(phone);
	g.calibrate(1000 / 30);
	const r = run(g, 30, (t, tier, i) => ({ interval: (1000 / 30) * (tier > 0 && i % 3 === 0 ? 2 : 1), cost: tier > 0 ? 40 : 12 }));
	check('overload under a cap still lowers the tier', r.changes.length > 0 && r.changes.at(-1)?.[1] === 0, list(r));
}

// ---- raising
{
	const r = run(make(phone), 60, smooth(4));
	check('room to spare on a phone: raised once, after a calm stretch, and kept', r.changes.length === 1 && r.changes[0][1] === 3 && r.changes[0][0] > 8, list(r));
}
{
	const r = run(make(phone), 300, smooth(7));
	check('not enough headroom: never raised, and the measuring stops', r.changes.length === 0 && r.measured <= 16, `${list(r)}, ${r.measured} measured`);
}
{
	// the measurement said there was room, the tier itself says otherwise
	const r = run(make(phone), 300, (t, tier, i) => (tier === 3 ? dropping(0.3, 20)(t, tier, i) : smooth(4)()));
	const up = r.changes.filter((c) => c[1] === 3);
	const down = r.changes.find((c) => c[1] === 2);
	check('a raised tier that misses frames is left at once and never tried again', up.length === 1 && r.changes.length === 2 && !!down && down[0] - up[0][0] < 3, list(r));
	check('  the ceiling records it', r.governor.ceiling === 2, `ceiling ${r.governor.ceiling}`);
}
{
	// heavy at the top until 20 s, light afterwards: one retry, much later
	const r = run(make(desktop), 180, (t, tier, i) => (tier === 2 && t < 20 ? dropping(0.3, 20)(t, tier, i) : smooth(3)()));
	check('a tier left under load is retried once, after a long calm', r.changes.map((c) => c[1]).join() === '1,2' && r.changes[1][0] - r.changes[0][0] >= 45, list(r));
}
{
	// A scene that is heavy for a few seconds in every twenty, for five minutes. The tier must not follow it up and down.
	const r = run(make(phone), 300, (t, tier, i) => (t % 20 < 6 && tier >= 2 ? dropping(0.35, 22)(t, tier, i) : smooth(tier >= 2 ? 4 : 3)()));
	check('alternating light and heavy scenes: no oscillation', r.changes.length <= 3, list(r));
}

// ---- held
{
	const g = new Governor({ loads: phone.tiers.map(loadOf), start: 1, enabled: false });
	const r = run(g, 30, dropping(0.5, 30));
	check('a held governor never moves', r.changes.length === 0 && g.tier === 1 && r.measured === 0);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
