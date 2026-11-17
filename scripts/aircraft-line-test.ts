// Aircraft factory: the assembly line's schedule (pure numbers, no renderer needed).
// Run: npx tsx scripts/aircraft-line-test.ts
import { CYCLE, L } from '../src/engineering/mechanical/aircraft-factory/layout';
import { EXIT_X, MOVE0, MOVE1, SLOTS, SLOT_X, LIFT_M, START_OFFSET, clock, paintLevel, planePose, rolloutIndex, rolloutTime, testPose } from '../src/engineering/mechanical/aircraft-factory/schedule';

let bad = 0;
const ok = (c: boolean, m: string): void => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };

// the numbers agree with the layout of the site
ok(SLOTS === 5 && SLOT_X.join() === [L.st.wing, L.st.fuse, L.st.final, L.st.paint, L.st.test].join(), `five stations at the layout's x (${SLOT_X.join(', ')})`);
ok(EXIT_X === L.exit.x && CYCLE === 300, `the exit point is the layout's (${EXIT_X}) and a cycle is ${CYCLE} s`);

// every moment: each station holds exactly one body, nothing stands in two places
let slotsOk = true, xOk = true;
for (let t = 0; t < 4 * CYCLE; t += 7.3) {
  const used = new Set<number>();
  for (let p = 0; p < SLOTS; p++) { const s = planePose(p, t); used.add(s.slot); if (s.x > SLOT_X[0] + 1e-6 || s.x < EXIT_X - 1e-6) xOk = false; }
  if (used.size !== SLOTS) slotsOk = false;
}
ok(slotsOk, 'at every moment each of the five stations holds exactly one aeroplane body');
ok(xOk, 'all bodies stay between the wing station and the exit point');

// all bodies move one station west together, every cycle, and only west
let together = true, west = true;
for (let p = 0; p < SLOTS; p++) {
  for (let c = 0; c < 6; c++) {
    const t0 = c * CYCLE - START_OFFSET + 1; // just after a cycle starts
    const a = planePose(p, t0), b = planePose(p, t0 + CYCLE);
    if (b.slot !== (a.slot + 1) % SLOTS) together = false;
    let prev = a.x;
    for (let f = 0; f <= 1; f += 0.01) { const s = planePose(p, t0 + f * CYCLE * 0.99); if (a.slot < SLOTS - 1 && s.x > prev + 1e-6) west = false; prev = s.x; }
  }
}
ok(together, 'every body is one station further after one cycle (300 s)');
ok(west, 'the bodies never move east inside a cycle');

// the handover: the body of the test cell reaches the exit point exactly at rolloutTime(k) and is gone until the cycle ends; the others wait
let handOk = true;
for (let k = 0; k < 6; k++) {
  const T = rolloutTime(k);
  const c = clock(T);
  if (Math.abs(c.f - MOVE1) > 1e-9) handOk = false;
  const before = [...Array(SLOTS).keys()].map((p) => planePose(p, T - 1)), after = [...Array(SLOTS).keys()].map((p) => planePose(p, T + 1));
  const last = before.findIndex((s) => s.slot === SLOTS - 1);
  if (!before[last].visible || Math.abs(before[last].x - EXIT_X) > 3) handOk = false;
  if (after[last].visible || after.filter((s) => !s.visible).length !== 1) handOk = false;
  if (rolloutIndex(T + 0.01) !== k || rolloutIndex(T - 0.01) !== k - 1 && k > 0) handOk = false;
}
ok(handOk, `one finished aeroplane reaches the exit every ${CYCLE} s (first at ${rolloutTime(0).toFixed(0)} s) and is handed over at that moment`);
ok(Math.abs(rolloutTime(1) - rolloutTime(0) - CYCLE) < 1e-9 && rolloutTime(0) > 0 && rolloutTime(-1) < 0, 'rollouts are exactly one cycle apart, the first one comes after the start');

// the towing happens between MOVE0 and MOVE1 and nowhere else
let towOk = true;
for (let f = 0; f < 1; f += 0.02) { const s = planePose(0, f * CYCLE - START_OFFSET + 0.001); if (s.towing !== (f >= MOVE0 && f < MOVE1)) towOk = false; }
ok(towOk, 'bodies are towed only between 78 % and 90 % of a cycle');

// paint: bare until the paint station, primer, then livery for good
const lv = (s: number, d: number): number => paintLevel(s, d);
ok(lv(0, 1) === 0 && lv(2, 1) === 0 && lv(3, 0.05) === 0 && lv(3, 0.3) === 1 && lv(3, 0.9) === 2 && lv(4, 0) === 2, 'paint: bare aluminium, then primer, then the EVCity livery');
let mono = true;
for (let d = 0.01; d <= 1; d += 0.01) if (lv(3, d) < lv(3, d - 0.01)) mono = false;
ok(mono, 'the paint level never goes back');

// the test cell lifts the aeroplane on jacks, swings the gear, and sets it down; nothing happens elsewhere
let maxLift = 0, gearUp = false, other = false, ends = true;
for (let d = 0; d <= 1; d += 0.01) { const p = testPose(4, d); maxLift = Math.max(maxLift, p.lift); if (p.gearUp) gearUp = true; if (p.lift < 0 || p.lift > 1) ends = false; }
for (let s = 0; s < 4; s++) for (let d = 0; d <= 1; d += 0.1) { const p = testPose(s, d); if (p.lift !== 0 || p.gearUp || p.lamps !== 0) other = true; }
ok(maxLift > 0.99 && gearUp && ends && testPose(4, 1).lift === 0 && testPose(4, 0.02).lift === 0, `test cell: jacks lift the aeroplane by ${LIFT_M} m, the gear swings, the aeroplane comes down again`);
ok(!other, 'only the test cell lifts the aeroplane');

console.log(bad ? `${bad} problem(s)` : 'ALL OK');
process.exit(bad ? 1 : 0);
