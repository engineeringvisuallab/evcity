// Aircraft factory: parts, the 12-stop English tour, the moving assembly line (it follows ONE clock), staged building, paint, test cell. Builds the factory directly (no terrain).
// Run: npx tsx scripts/aircraft-factory-test.ts
import * as THREE from 'three';
import { createAircraftFactory } from '../src/engineering/mechanical/aircraft-factory';
import { CYCLE } from '../src/engineering/mechanical/aircraft-factory/layout';
import { LIFT_M, MOVE0, SLOTS, START_OFFSET, planePose, rolloutTime } from '../src/engineering/mechanical/aircraft-factory/schedule';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null });
(globalThis as Record<string, unknown>).window = globalThis;
if (!(globalThis as Record<string, unknown>).document) (globalThis as Record<string, unknown>).document = { createElement: stubEl };
let bad = 0;
const ok = (c: boolean, m: string): void => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) bad++; };

let T = 0;
const infra = createAircraftFactory({ clock: () => T } as never);

// ---- parts and tour
ok(infra.parts.map((p) => p.id).join() === 'gate,line,hall,cnc,wing,fuse,final,paint,test', `parts: ${infra.parts.map((p) => p.id).join()}`);
const ids = infra.tour.map((s) => s.id).join();
ok(ids === 'intro,gate,cnc,wing,fuselage,join,tail,engines,paint,test,rollout,outro' && infra.narrationLang === 'en', `twelve English stops in the planned order (${ids})`);
const partIds = new Set(infra.parts.map((p) => p.id));
ok(infra.tour.every((s) => partIds.has(s.partId)), 'every stop points at a part that exists');
ok(infra.tour.every((s) => s.text.length > 300 && /^[\x20-\x7e]+$/.test(s.text)), 'every stop has a real English narration (plain ASCII)');
const need = ['aluminium', 'CNC', 'lift', 'rivet', 'turbofan', 'Newton', 'primer', 'corrosion', 'test'];
const all = infra.tour.map((s) => s.text).join(' ');
ok(need.every((w) => all.toLowerCase().includes(w.toLowerCase())), `the narration teaches: ${need.join(', ')}`);
ok(infra.tour.every((s) => [s.shot.azimuthDeg, s.shot.elevationDeg, s.shot.distance, ...s.shot.target].every(Number.isFinite) && (!s.focus || s.focus.length === 6)), 'every camera shot is valid');

// ---- the line: five bodies, one clock
const planes: THREE.Object3D[] = [];
infra.root.traverse((o) => { if (o.name === 'airliner') planes.push(o); });
ok(planes.length === SLOTS, `${planes.length} aeroplane bodies stand on the line`);
const sync = (t: number): void => { T = t; infra.update(0.016); };
let follows = true;
for (const t of [0, 50, 150, 240, 300, 480, 1000, 1234.5]) {
  sync(t);
  planes.forEach((g, p) => { const s = planePose(p, t); if (g.visible !== s.visible || (s.visible && Math.abs(g.position.x - s.x) > 1e-6)) follows = false; });
}
ok(follows, 'every body is exactly where the shared clock says (also after a jump of the clock)');
sync(1000); const x1 = planes.map((g) => g.position.x); infra.update(30); const x2 = planes.map((g) => g.position.x);
ok(x1.every((x, i) => Math.abs(x - x2[i]) < 1e-9), 'the factory\'s own animation time does not move the line (only the clock does)');
const alone = createAircraftFactory();
const aPl: THREE.Object3D[] = []; alone.root.traverse((o) => { if (o.name === 'airliner') aPl.push(o); });
const ax0 = aPl.map((g) => g.position.x);
for (let i = 0; i < 1300; i++) alone.update(0.1); // 130 s: past the tow at 78 % of the cycle
const ax1 = aPl.map((g) => g.position.x);
ok(ax0.some((x, i) => Math.abs(x - ax1[i]) > 0.5), 'without a clock option (standalone preview) the line follows its own time');
sync(rolloutTime(2) + 1);
ok(planes.filter((g) => !g.visible).length === 1, 'right after a rollout one body is gone (handed over), the other four stand in their stations');

// ---- staged building: count the visible parts of body 0 when it has finished station 1, 2, 3, 4, 5
const visibleMeshes = (o: THREE.Object3D): THREE.Mesh[] => { const r: THREE.Mesh[] = []; const walk = (n: THREE.Object3D): void => { if (!n.visible) return; if (n instanceof THREE.Mesh) r.push(n); n.children.forEach(walk); }; walk(o); return r; };
const atSlot = (slot: number, dwell: number): THREE.Mesh[] => {
  // body 0 is in slot = cycle mod 5: pick the time of that slot with the wanted dwell
  const t = (slot + dwell * MOVE0) * CYCLE - START_OFFSET;
  sync(t);
  const s = planePose(0, t);
  if (s.slot !== slot) throw new Error(`body 0 is in slot ${s.slot}, wanted ${slot}`);
  return visibleMeshes(planes[0]);
};
const n = [0, 1, 2, 3, 4].map((s) => atSlot(s, 1).length);
ok(n[0] >= 3 && n[0] < n[1] && n[1] < n[2], `parts appear station by station (${n.join(' < ')} meshes visible): wing, then fuselage barrels, then tail / engines / gear`);
ok(n[2] === n[3] && n[4] <= n[3] && n[4] >= n[3] - 1, 'paint and test add no parts (in the test cell only a blinking lamp may be off), they change the paint and move the aeroplane');
const w05 = atSlot(0, 0.05).length, w5 = atSlot(0, 0.5).length, w1 = atSlot(0, 1).length;
ok(w05 < w5 && w1 < w5 && w1 > w05, `inside station 1 the wing grows: spars and ribs (${w05} -> ${w5} parts), then the skin closes the box and the skeleton is hidden (${w1})`);

// ---- paint: bare -> primer -> livery
const mats = (slot: number, d: number): Set<THREE.Material> => new Set(atSlot(slot, d).filter((m) => m.castShadow).map((m) => m.material as THREE.Material)); // the painted skin parts and the gear
const m0 = mats(3, 0.05), m1 = mats(3, 0.3), m2 = mats(3, 0.9), m3 = mats(4, 0.05);
const only = (a: Set<THREE.Material>, b: Set<THREE.Material>): number => [...a].filter((x) => !b.has(x)).length;
ok(only(m1, m0) > 0 && only(m0, m1) > 0 && only(m2, m1) > 0 && only(m1, m2) > 0, 'paint station: bare aluminium, then primer, then the livery (the materials change twice)');
ok(only(m2, m3) === 0 && only(m3, m2) === 0, 'the livery stays on in the test cell');

// ---- test cell: jacks lift the aeroplane, the gear swings up
const gy = (slot: number, d: number): number => { atSlot(slot, d); return planes[0].position.y; };
const meshesAt = (d: number): number => atSlot(4, d).length;
ok(Math.abs(gy(4, 0.02) - 0.2) < 1e-6 && gy(4, 0.5) > 0.2 + LIFT_M * 0.99 && Math.abs(gy(4, 1) - 0.2) < 1e-6, `the aeroplane is lifted by ${LIFT_M} m on jacks in the test cell and sets down again`);
ok(meshesAt(0.5) < meshesAt(0.05), 'the gear is retracted while it hangs on the jacks (the gear swing test)');

// ---- cranes and robots move
let cranes = 0;
infra.root.traverse((o) => { if (o.name === 'environment' && o.parent?.name === 'hall') cranes = o.children.length; });
const cx0 = infra.root.getObjectByName('hall')!.children.find((c) => c.name === 'environment')!.children.map((c) => c.position.x);
infra.update(20);
const cx1 = infra.root.getObjectByName('hall')!.children.find((c) => c.name === 'environment')!.children.map((c) => c.position.x);
ok(cranes === 3 && cx0.some((x, i) => Math.abs(x - cx1[i]) > 0.5), 'three overhead cranes travel along the hall');

// ---- solids (needs the real three.js)
ok(infra.solids().length > 100, `colliders: ${infra.solids().length}`);
infra.dispose();
alone.dispose();
console.log(bad ? `${bad} problem(s)` : 'ALL OK');
process.exit(bad ? 1 : 0);
