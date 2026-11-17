// Main Station pump station (headless): npx tsx scripts/pump-test.ts
// builds the plant, checks the pad, the tour, the labels, and that the south apron (z > 6) has no solid (vehicles drive in there).
import * as THREE from 'three';
import { getInfrastructureDef, registerBuiltinInfrastructure } from '../src/engineering';
import { INFRA_PLACEMENTS } from '../src/engineering/InfraSites';
import { MAIN_STATION_LOT, worldToLot } from '../src/parking/ParkingSite';

const stubEl = (): Record<string, unknown> => ({ style: {}, appendChild() {}, remove() {}, textContent: '', getContext: () => null, width: 0, height: 0 });
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).document = { createElement: stubEl };
registerBuiltinInfrastructure();
let bad = 0;
const ok = (c: boolean, m: string): void => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) bad++; };

const def = getInfrastructureDef('pump');
ok(!!def, 'pump def is registered');
const infra = def!.create({ withEnvironment: false, groundY: () => 0, riverReach: 0, waterRel: -3, skirtDepth: 0 });
const pl = INFRA_PLACEMENTS.find((p) => p.id === 'pump')!;
ok(!!pl, 'pump placement exists');
ok(infra.tour.length >= 6 && infra.tour.every((s) => s.partId === undefined || infra.parts.some((p) => p.id === s.partId)), `tour has ${infra.tour.length} stops, all with valid parts`);

// pad corners must lie inside MAIN_STATION_LOT (so the unload area keeps its boundary)
const c = Math.cos(pl.yaw), s = Math.sin(pl.yaw);
const toWorld = (lx: number, lz: number) => ({ x: pl.x + lx * c + lz * s, z: pl.z - lx * s + lz * c });
let inside = true;
for (const [lx, lz] of [[pl.rect.x0, pl.rect.z0], [pl.rect.x1, pl.rect.z0], [pl.rect.x0, pl.rect.z1], [pl.rect.x1, pl.rect.z1]]) {
  const w = toWorld(lx, lz); const l = worldToLot(w.x, w.z);
  console.log(`  corner (${lx},${lz}) -> lot s ${l.s.toFixed(1)} n ${l.n.toFixed(1)}`);
  if (l.s < MAIN_STATION_LOT.s0 || l.s > MAIN_STATION_LOT.s1 || l.n < MAIN_STATION_LOT.n0 || l.n > MAIN_STATION_LOT.n1) inside = false;
}
ok(inside, 'pad lies inside MAIN_STATION_LOT');

infra.setLabelsVisible(false);
const box = new THREE.Box3();
infra.root.traverse((o) => { if (o.name === 'labels') return; if ((o as THREE.Mesh).isMesh && !(function up(n: THREE.Object3D | null): boolean { return !!n && (n.name === 'labels' || up(n.parent)); })(o)) box.expandByObject(o, true); });
console.log(`  bounding box x ${box.min.x.toFixed(1)}..${box.max.x.toFixed(1)} y ${box.min.y.toFixed(1)}..${box.max.y.toFixed(1)} z ${box.min.z.toFixed(1)}..${box.max.z.toFixed(1)}`);
ok(box.min.x >= pl.rect.x0 - 1 && box.max.x <= pl.rect.x1 + 1 && box.min.z >= pl.rect.z0 - 1 && box.max.z <= pl.rect.z1 + 1, 'everything stands inside the pad (+1 m)');

const solids = infra.solids();
const apron = solids.filter((sh) => sh.kind === 'box' && sh.c[2] - sh.h[2] > 5.9 && sh.c[0] > -16 && sh.c[0] < 25);
console.log(`  ${solids.length} solids`);
ok(apron.length === 0, 'no solid on the open part of the apron (x > -16, z > 6)');
const fuelTank = solids.some((sh) => sh.kind === 'box' && Math.abs(sh.c[0] + 19) < 0.5 && Math.abs(sh.c[2] - 10.5) < 0.5);
ok(fuelTank, 'the fuel receiving tank is solid');
let labelCount = 0; infra.root.traverse((o) => { if (o.name === 'labels') labelCount = o.children.length; });
ok(labelCount >= 18, `${labelCount} labels (pipes, valves, NRV, flowmeter, pumps)`);
infra.update?.(0.05);
infra.dispose();
console.log(bad === 0 ? 'ALL PASS' : `${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
