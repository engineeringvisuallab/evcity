// EVLab Step 12: people sitting on the benches (plan, pose, no clash). npx tsx scripts/evlab-sitters-test.ts
import * as THREE from 'three';
import { BENCH, benchSeats, benches } from '../src/evlab/EVLabBenches';
import { SITTER_SCALE, planSitters, sitPose, sitterHip } from '../src/evlab/EVLabSitterPlan';
import { EVLabBenchSitters, type SitterFactory, type SitterView } from '../src/evlab/EVLabBenchSitters';

let fails = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const B = benches(), S = benchSeats();
for (const n of [0, 6, 12, 20]) {
  const p = planSitters(n);
  ok(p.length === n, `${n} people planned (${p.length})`);
  ok(new Set(p.map((q) => q.seat)).size === p.length, `${n}: nobody shares a seat`);
  const per = new Map<number, number[]>();
  for (const q of p) (per.get(q.bench) ?? per.set(q.bench, []).get(q.bench)!).push(q.seat - q.bench * BENCH.seats);
  ok([...per.values()].every((v) => v.length <= 2 && (v.length < 2 || (v.includes(0) && v.includes(2)))), `${n}: at most 2 per bench, and then on the two end places`);
  ok(p.every((q) => S[q.seat].bench === q.bench), `${n}: seat belongs to its bench`);
}
ok(JSON.stringify(planSitters(12)) === JSON.stringify(planSitters(12)), 'deterministic');
const p20 = planSitters(20);
const areas = new Set(p20.map((q) => B[q.bench].area));
ok(areas.size === 3, 'the 20 people sit in all 3 areas (plaza, island, bank)');
ok(p20.length < B.length / 2, `most benches stay empty (${new Set(p20.map((q) => q.bench)).size} of ${B.length} used)`);

// pose: soles on the ground for every body size and both hand variants
for (const sc of [SITTER_SCALE.min, 1, SITTER_SCALE.max]) {
  const q = sitPose(sc, 0);
  ok(q.miss < 0.01, `scale ${sc}: legs reach the ground (miss ${q.miss.toFixed(3)} m)`);
  const thighDown = Math.abs(q.thigh[0]) > 1.2 && Math.abs(q.thigh[0]) < 1.7;
  ok(thighDown && q.knee[0] > 0.8 && q.knee[0] < 1.9, `scale ${sc}: thigh ${q.thigh[0].toFixed(2)}, knee ${q.knee[0].toFixed(2)} rad are a sitting leg`);
  ok(Math.abs(q.hipY - (BENCH.seatH + 0.05 * sc)) < 1e-9, `scale ${sc}: hips rest on the seat`);
}
ok(sitPose(1, 1).elbow[1] !== sitPose(1, 0).elbow[1], 'hands variant 1 rests one hand on the seat');

// position: hip inside the bench footprint, behind the seat middle, facing the bench direction
let bad = '';
for (const q of p20) {
  const h = sitterHip(q.seat, q.scale), b = B[q.bench], sp = S[q.seat];
  const dx = h.x - b.x, dz = h.z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (Math.abs(lx) > BENCH.len / 2 || lz < BENCH.backZ || lz > 0 || h.yaw !== b.yaw || Math.abs(h.y - (sp.y + 0.05 * q.scale)) > 1e-9) bad += sp.id + ' ';
}
ok(bad === '', `every hip is on its bench, in front of the back rest and on the seat ${bad}`);

// the class with stand-ins: builds once when near, hides when far, setCount rebuilds, dispose frees
let made = 0, freed = 0;
const factory: SitterFactory = { person: (): SitterView => { made++; return { root: new THREE.Group(), sit: () => undefined, dispose: () => { freed++; } }; } };
const sit = new EVLabBenchSitters(factory);
sit.setCount(12);
sit.show(false);
ok(made === 0 && !sit.group.visible, 'far away: nobody built, nothing drawn');
sit.show(true);
ok(made === 12 && sit.seated === 12 && sit.group.visible && sit.group.children.length === 12, 'near: 12 people built and drawn');
sit.show(true);
ok(made === 12, 'built only once');
sit.show(false);
ok(!sit.group.visible && sit.seated === 12, 'far again: hidden, kept');
sit.setCount(6);
ok(freed === 12 && sit.seated === 0, 'new count frees the old people');
sit.show(true);
ok(made === 18 && sit.seated === 6, 'and builds the new 6');
sit.setCount(0); sit.show(true);
ok(!sit.group.visible && sit.seated === 0, 'count 0: nobody');
sit.dispose();

console.log(fails ? `\n${fails} FAILED` : '\nall ok');
process.exit(fails ? 1 : 0);
