// Central park layout sanity (pure, no three): zones, trees / benches / lamps are on lawn or promenade, never in a bed or on a path.
import { PARK, PARK_FLOWERS, Z_BED, Z_BORDER, Z_LAWN, Z_PAVED, parkBenches, parkLamps, parkTrees, parkZone, zoneFlower, zoneKind } from '../src/park/CentralPark';
let fail = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fail++; console.log('FAIL', m); } };
const count = [0, 0, 0, 0, 0];
const fl = new Set<number>();
for (let x = -60; x <= 60; x += 0.5) for (let z = 240; z <= 360; z += 0.5) {
  const zn = parkZone(PARK.x + x, z);
  count[zoneKind(zn)]++;
  if (zoneKind(zn) === Z_BED || zoneKind(zn) === Z_BORDER) fl.add(zoneFlower(zn));
}
console.log('cells lawn/paved/bed/border (0.25 m2):', count[Z_LAWN], count[Z_PAVED], count[Z_BED], count[Z_BORDER], 'flowers used', [...fl].sort().join(','));
ok(fl.size === 6, 'all six flowers appear');
ok(count[Z_BED] * 0.25 > 800, 'bed area > 800 m2');
const trees = parkTrees();
ok(trees.length === 24, 'trees ' + trees.length);
for (const t of trees) {
  const k = zoneKind(parkZone(t.x, t.z));
  ok(k === Z_LAWN, `tree at ${t.x.toFixed(1)},${t.z.toFixed(1)} zone ${k}`);
  ok(Math.hypot(t.x - PARK.x, t.z - PARK.z) < PARK.promIn - 1.5 || Math.hypot(t.x - PARK.x, t.z - PARK.z) < PARK.promIn, 'tree inside promenade');
}
for (const b of parkBenches()) ok(zoneKind(parkZone(b.x, b.z)) === Z_LAWN, 'bench on lawn ' + b.x.toFixed(1));
for (const l of parkLamps()) { const k = zoneKind(parkZone(l.x, l.z)); ok(k === Z_BORDER || k === Z_PAVED, 'lamp zone ' + k); }
ok(zoneKind(parkZone(PARK.x, PARK.z)) === Z_PAVED, 'centre paved');
ok(zoneKind(parkZone(PARK.x + 62, PARK.z)) === 0, 'outside none');
ok(PARK_FLOWERS.length === 6, 'flowers');
console.log(fail ? 'FAIL' : 'PASS');
process.exit(fail ? 1 : 0);
