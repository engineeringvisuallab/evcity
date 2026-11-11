// EVLab step 5: the arrival routes of the hall audience (pure maths, no three.js).
import { DIVIDER, HALL, REAR_Y, SEAT_BLOCKS, SEAT_W, hallFloorY } from '../src/evlab/EVLabLayout';
import { AISLES, ARRIVE_SPAN, LEAVE_SPAN, ROW_LANE, SEAT_SETBACK, aisleFor, leftAt, planPerson, sample, sampleLeave, seatedAt, walkTime, type Sample, type Seat } from '../src/evlab/EVLabAudiencePath';

// same generator as src/structures (copied here so the test needs no three.js)
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.error('FAIL: ' + m); } };

const seats: Seat[] = [];
for (let i = 0; i < HALL.rows; i++) {
  const z = HALL.rowZ0 + i * HALL.rowStep, y = hallFloorY(z);
  for (const [a, b] of SEAT_BLOCKS) for (let x = a + SEAT_W / 2; x < b; x += SEAT_W) seats.push({ x, y, z });
}
const r = mulberry32(5);
const plans = seats.filter(() => r() < 0.62).map((s) => planPerson(s, r));
console.log(`${plans.length} people, aisles ${AISLES.map((a) => a.toFixed(2)).join(' ')}`);
ok(plans.length > 1000, 'a crowded hall');

// seat colliders of the hall (same numbers as EVLabHall): the walk must never go through one
const rows: { z0: number; z1: number }[] = [];
for (let i = 0; i < HALL.rows; i++) { const z = HALL.rowZ0 + i * HALL.rowStep; rows.push({ z0: z - 0.55, z1: z + 0.3 }); }
const inSeatBox = (x: number, z: number): boolean => SEAT_BLOCKS.some(([a, b]) => x > a && x < b) && rows.some((q) => z > q.z0 + 0.02 && z < q.z1 - 0.02);

let maxSeated = 0, maxWalk = 0, bad = 0, badY = 0, early = 0;
const s: Sample = { phase: 'away', x: 0, y: 0, z: 0, h: 0, sit: 0, stride: 0 };
for (const p of plans) {
  maxSeated = Math.max(maxSeated, seatedAt(p));
  maxWalk = Math.max(maxWalk, walkTime(p));
  // enters through one of the three openings
  const dx = p.way[1].x;
  ok(DIVIDER.openings.some(([a, b]) => dx > a && dx < b), 'comes in through an opening');
  // walks the whole path in small steps: never inside a seat block, y follows the floor
  for (let t = p.delay; t < p.delay + walkTime(p); t += 0.25) {
    sample(p, t, s);
    if (s.z < HALL.slopeZ1 + 9 && s.z > HALL.slopeZ0 - 2 && inSeatBox(s.x, s.z)) bad++;
    if (s.z <= 14.5 && s.z >= HALL.slopeZ0 && Math.abs(s.y - (s.z > HALL.slopeZ1 ? REAR_Y : hallFloorY(s.z))) > 0.2) badY++;
  }
  sample(p, p.delay - 0.01, s); if (s.phase !== 'away') early++;
  sample(p, seatedAt(p) + 1, s);
  ok(s.phase === 'seated' && Math.abs(s.x - p.seat.x) < 1e-6 && Math.abs(s.z - (p.seat.z - SEAT_SETBACK)) < 1e-6 && Math.abs(s.y - p.seat.y) < 1e-6, 'ends exactly on the seat');
  ok(Math.abs(Math.abs(s.h) - Math.PI) < 1e-6, 'seated people face the stage (north)');
  // the row lane is clear in front of the seat
  ok(p.way[p.way.length - 1].z === p.seat.z - ROW_LANE && !inSeatBox(p.way[p.way.length - 1].x, p.way[p.way.length - 1].z), 'row lane is in the leg room');
  ok(aisleFor(p.seat.x) === AISLES[0] || aisleFor(p.seat.x) === AISLES[1] || aisleFor(p.seat.x) === AISLES[2] || aisleFor(p.seat.x) === AISLES[3], 'aisle is one of the four');
}
console.log(`everyone seated after ${maxSeated.toFixed(1)} s (longest walk ${maxWalk.toFixed(1)} s, arrivals spread over ${ARRIVE_SPAN} s)`);
ok(bad === 0, `nobody walks through a seat block (${bad} samples)`);
ok(badY === 0, `feet follow the floor (${badY} samples)`);
ok(early === 0, 'nobody shows up before the start');
ok(maxSeated < 75, 'the hall is full within about a minute');

// they come bit by bit: at 1/4 of the span only a part is seated or walking, at the end everybody is seated
let seatedEarly = 0, walkingMid = 0;
for (const p of plans) { sample(p, 6, s); if (s.phase === 'seated') seatedEarly++; if (s.phase === 'walk') walkingMid++; }
ok(seatedEarly < plans.length * 0.2, 'at 6 s most people are still on their way');
ok(walkingMid > 20, 'at 6 s many people are walking');
console.log(`at 6 s: ${walkingMid} walking, ${seatedEarly} seated`);

// ---- step 6: the way out
let leaveBad = 0, leaveY = 0, maxLeft = 0, startsLate = 0;
for (const p of plans) {
  maxLeft = Math.max(maxLeft, leftAt(p));
  sampleLeave(p, 0, s);
  if (p.leaveDelay > 0.05 && !(s.phase === 'seated' && Math.abs(s.z - (p.seat.z - SEAT_SETBACK)) < 1e-6)) startsLate++;
  for (let t = p.leaveDelay; t < leftAt(p); t += 0.25) {
    sampleLeave(p, t, s);
    if (s.phase === 'walk') {
      if (s.z < HALL.slopeZ1 + 9 && s.z > HALL.slopeZ0 - 2 && inSeatBox(s.x, s.z)) leaveBad++;
      if (s.z <= 14.5 && s.z >= HALL.slopeZ0 && Math.abs(s.y - (s.z > HALL.slopeZ1 ? REAR_Y : hallFloorY(s.z))) > 0.2) leaveY++;
    }
  }
  sampleLeave(p, leftAt(p) + 0.5, s);
  ok(s.phase === 'away', 'gone at the end');
  sampleLeave(p, p.leaveDelay + p.riseTime + 0.5, s); // just after getting up: in the row lane, standing
  ok(Math.abs(s.z - (p.seat.z - ROW_LANE)) < 1.5, 'gets up into the row lane');
}
console.log(`everybody out after ${maxLeft.toFixed(1)} s (leave span ${LEAVE_SPAN} s)`);
ok(startsLate === 0, 'people sit until their turn');
ok(leaveBad === 0, `nobody leaves through a seat block (${leaveBad})`);
ok(leaveY === 0, `feet follow the floor on the way out (${leaveY})`);
ok(maxLeft < 90, 'the hall is empty within 90 s');

console.log(fails ? `${fails} FAILED` : 'evlab audience: all ok');
process.exit(fails ? 1 : 0);
