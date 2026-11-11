// EVLab step 5: the audience model (real people who walk in and sit down). Uses only three's public API (instanceMatrix arrays).
import { buildAudience } from '../src/evlab/EVLabAudience';
import { HALL, SEAT_BLOCKS, SEAT_W, hallFloorY } from '../src/evlab/EVLabLayout';

let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.error('FAIL: ' + m); } };

const P = { k: { own: <T>(x: T): T => x } } as never;
const seats: { x: number; y: number; z: number }[] = [];
for (let i = 0; i < HALL.rows; i++) {
  const z = HALL.rowZ0 + i * HALL.rowStep, y = hallFloorY(z);
  for (const [a, b] of SEAT_BLOCKS) for (let x = a + SEAT_W / 2; x < b; x += SEAT_W) seats.push({ x, y, z });
}
const A = buildAudience(P, seats);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const meshes = A.group.children as any[];
const [torso, head, , thigh, shin, , , foot] = meshes;
const at = (m: { instanceMatrix: { array: ArrayLike<number> } }, i: number): number[] => [12, 13, 14].map((k) => m.instanceMatrix.array[i * 16 + k]);

ok(meshes.length === 8, `8 instanced meshes = 8 draw calls (got ${meshes.length})`);
ok(A.peopleCount > 1000 && A.peopleCount <= A.seatCount, 'a crowded hall');
ok(!A.present && A.arrived === 0 && A.seated === 0, 'empty by default');

A.setPresent(true);
let t = 0;
const run = (sec: number): void => { for (let k = 0; k < sec * 30; k++) { t += 1 / 30; A.update(1 / 30, t); } };
run(0.1);
ok(A.arrived > 0 && A.seated === 0, 'the first people come in at once, nobody sits yet');
run(5);
ok(A.arrived > 100 && A.arrived < A.peopleCount, 'people keep coming in bit by bit');
ok(A.seated < A.peopleCount * 0.1, 'most are still on their way');
let walkers = 0;
for (let i = 0; i < A.peopleCount; i++) {
  const h = at(head, i), f = at(foot, i * 2);
  if (h[0] === 0 && h[1] === 0 && h[2] === 0) continue; // not here yet / hidden
  if (Math.abs(h[1] - f[1]) > 1.2 && Math.abs(h[1] - f[1]) < 2.0) walkers++; // head about 1.5 m above the feet
}
ok(walkers > 50, `walking people have a human height (${walkers} checked)`);
run(80);
ok(A.arrived === A.peopleCount && A.seated === A.peopleCount, 'everyone is seated after the arrival');

// seated posture: head ~1.27 m above the seat floor, thigh forward (towards the stage = -z), shin hanging from the knee, foot on the floor
let badPose = 0, nan = 0;
for (let i = 0; i < A.peopleCount; i++) {
  const s = i;
  const h = at(head, s), tor = at(torso, s), th = at(thigh, s * 2), sh = at(shin, s * 2), ft = at(foot, s * 2);
  for (const m of meshes) for (const idx of [s * (m.count === A.peopleCount ? 1 : 2)]) for (let q = 0; q < 16; q++) if (!Number.isFinite(m.instanceMatrix.array[idx * 16 + q])) nan++;
  const floor = ft[1] - 0.0; // foot origin is on the floor
  if (Math.abs(h[1] - floor - 1.27) > 0.1) badPose++;
  if (!(sh[2] < th[2] - 0.3)) badPose++; // knee is in front of the hip
  if (Math.abs(tor[1] - floor - 0.58) > 0.05) badPose++; // pelvis sits on the cushion (0.51 + half a thigh)
}
ok(nan === 0, 'no NaN in any matrix');
ok(badPose === 0, `seated pose is right (${badPose} wrong values)`);

// moods: ovation stands everybody up (head higher), clap / listen keep working, then hidden again
const before = at(head, 500)[1];
A.setMood('ovation'); run(2);
ok(at(head, 500)[1] > before + 0.3, 'ovation: people stand up');
A.setMood('clap'); run(1);
A.setMood('listen'); run(3);
ok(Math.abs(at(head, 500)[1] - before) < 0.1, 'listening: sitting again');
// step 6: dismissal: people leave one after the other, then the hall is hidden
A.dismiss();
ok(A.leaving && A.present, 'dismiss: people start to leave');
run(8);
ok(A.leaving && A.seated < A.peopleCount && A.seated > 0, 'they leave one after the other');
run(90);
ok(!A.leaving && !A.present && !A.group.visible && A.seated === 0, 'the last one is out: the hall is empty and hidden');
A.setPresent(true);
run(10);
A.dismiss(); run(2);
A.setPresent(true); // a new mission while people still leave: fresh arrival
ok(!A.leaving && A.present && A.arrived === 0, 'a new mission during the leaving starts a fresh arrival');
A.setPresent(false);
ok(!A.group.visible && !A.present, 'hidden after the mission');
A.setPresent(true);
ok(A.arrived === 0 && A.seated === 0, 'a new mission starts with an empty hall again');
run(0.1);
ok(A.arrived > 0, 'and they come in again');

console.log(`${A.peopleCount} people on ${A.seatCount} seats`);
console.log(fails ? `${fails} FAILED` : 'evlab audience model: all ok');
process.exit(fails ? 1 : 0);
