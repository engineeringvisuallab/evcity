// Headless check of the City Mall shop plan (STEP C3): pure maths, needs no three.js / Rapier.   npm run test:mall-shops   (= npx tsx scripts/mall-shops-check.ts)
import { MALL_BUILDING_LOCAL as P, MALL_ATRIUM_R } from '../src/mall/MallSite';
import { coreFootprints } from '../src/mall/MallCores';
import { edgeDist, floorLayout, insidePoly } from '../src/mall/MallLayout';
import { SHOP, OUTER_R, rayHit, shopSlots, deptPoses } from '../src/mall/MallShops';
import { CATEGORIES, FLOORS } from '../src/mall/MallCatalog';
import { BAYS, FAMILY_OF, layoutShop, type FamilyId } from '../src/mall/MallFixtures';

let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const inPoly = (p: [number, number][], x: number, z: number) => insidePoly(p, x, z);

// the outline is star-shaped about the atrium centre (one wall hit per ray), so the polar shop plan is valid
let multi = 0;
for (let k = 0; k < 720; k++) {
  const a = (k / 720) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); let hits = 0;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const ax = P[j][0], az = P[j][1], ex = P[i][0] - ax, ez = P[i][1] - az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-12) continue; const t = (ax * ez - az * ex) / den, u = (ax * dz - az * dx) / den; if (t > 0 && u >= 0 && u < 1) hits++; }
  if (hits !== 1) multi++;
}
ok(multi === 0, `the outline is star-shaped about the centre (${multi} of 720 rays hit the wall more than once)`);

const S = shopSlots(), cols = floorLayout().cols;
ok(S.length === 8 && S.filter((s) => s.ring === 'inner').length === 4 && S.filter((s) => s.ring === 'outer').length === 4, '8 shop slots: 4 inner + 4 outer');
for (const s of S) {
  const rs = s.poly.map(([x, z]) => Math.hypot(x, z));
  ok(s.poly.every(([x, z]) => inPoly(P as any, x, z) && edgeDist(P, x, z) >= SHOP.wall - 0.6), `slot ${s.index} (${s.ring} ${s.sx > 0 ? 'E' : 'W'}${s.sz > 0 ? 'S' : 'N'}) lies inside the outline, >= ${SHOP.wall} m off the glass`);
  ok(Math.min(...rs) >= (s.ring === 'inner' ? SHOP.promR : OUTER_R) - 0.01 && (s.ring === 'outer' || Math.max(...rs) <= SHOP.ring1 + 0.01), `slot ${s.index}: radius range ${Math.min(...rs).toFixed(1)}..${Math.max(...rs).toFixed(1)} m (atrium edge ${MALL_ATRIUM_R} m stays free)`);
  ok(s.poly.every(([x, z]) => Math.abs(x) >= SHOP.aisle - 0.01 && Math.abs(z) >= SHOP.aisle - 0.01), `slot ${s.index}: keeps out of the 4 door aisles (|x|, |z| >= ${SHOP.aisle})`);
  ok(s.area > 4000, `slot ${s.index}: area ${s.area.toFixed(0)} m2`);
  ok(inPoly(s.poly, s.board.x, s.board.z) && inPoly(s.poly, s.view.x, s.view.z), `slot ${s.index}: the board post and the viewing spot are inside the shop`);
  ok(cols.every(([cx, cz]) => Math.abs(cx - s.board.x) >= 1.1 || Math.abs(cz - s.board.z) >= 1.1), `slot ${s.index}: the board post stands clear of every column`);
}
// the 8 shops do not overlap
let overlap = 0;
for (let x = -200; x <= 200; x += 2) for (let z = -200; z <= 200; z += 2) if (S.filter((s) => inPoly(s.poly, x, z)).length > 1) overlap++;
ok(overlap === 0, `no two shops overlap (${overlap} grid points in two shops)`);
// stair / lift cores (+ lobby) are in the free promenade
ok(coreFootprints().every(([a, b, c, d]) => [[a, c], [a, d], [b, c], [b, d]].every(([x, z]) => Math.hypot(x, z) < SHOP.promR - 2)), `stair / lift cores end at r < ${SHOP.promR - 2} m: inside the free promenade, no shop touches them`);
// department signs hang over the aisles, clear of the cores and the shops
ok(deptPoses().every((d) => Math.abs(d.x * d.az) < 0.01 && Math.abs(d.z * d.ax) < 0.01 && Math.hypot(d.x, d.z) > 61 && Math.hypot(d.x, d.z) < SHOP.promR), '4 department signs hang over the 4 axis aisles, between the cores and the inner shops');
ok(S.every((s) => rayHit(Math.cos(s.thMid) * s.sx, Math.sin(s.thMid) * s.sz) > OUTER_R + 20), 'the outer shops are deep enough (>= 20 m)');
// catalog: 10 floors x 8 categories
const ids = new Set(CATEGORIES.map((c) => c.id));
ok(CATEGORIES.length === 80 && ids.size === 80, `80 categories, all ids unique (${CATEGORIES.length} / ${ids.size})`);
ok([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].every((f) => CATEGORIES.filter((c) => c.floor === f).length === 8), 'every floor 0..9 has exactly 8 categories (= 8 shops)');
ok(FLOORS.length === 10 && FLOORS.every((f) => f.bn && f.en && f.dept && f.deptEn), '10 floor names with a department name (Bangla + English)');
// ---- STEP C4: fixtures ----
const FAMS = Object.keys(BAYS) as FamilyId[];
ok(CATEGORIES.every((c) => FAMILY_OF[c.id] && BAYS[FAMILY_OF[c.id]]), 'every one of the 80 categories has a fixture family');
ok(FAMS.length === 16 && FAMS.every((f) => BAYS[f].length > 0 && BAYS[f].every((b) => b.boxes.length >= 3 && b.boxes.length <= 12 && b.len === BAYS[f][0].len && b.depth === BAYS[f][0].depth)), `16 fixture families, 3..12 boxes per bay, one length / depth per family`);
const CAP = 300;
let worst = '', bad = 0, nBays = 0, nRuns = 0, maxBays = 0, minBays = 1e9, nBoxes = 0;
const HALF = (b: { len: number; depth: number }) => [b.len / 2, b.depth / 2];
for (const fam of new Set(CATEGORIES.map((c) => FAMILY_OF[c.id]))) for (const s of S) {
  const L = layoutShop(s, fam, CAP), [hl, hd] = HALF(BAYS[fam][0]);
  nBays += L.bays.length; nRuns += L.runs.length; maxBays = Math.max(maxBays, L.bays.length); if (L.bays.length) minBays = Math.min(minBays, L.bays.length);
  nBoxes += L.bays.reduce((n, p) => n + p.bay.boxes.length, 0);
  for (const p of L.bays) {
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => [p.x + a * hl, p.z + b * hd] as [number, number]);
    if (!corners.every(([x, z]) => inPoly(s.poly, x, z))) { bad++; worst = `${fam} slot ${s.index}: bay outside the shop at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`; }
    if (cols.some(([cx, cz]) => Math.abs(cx - p.x) < hl + 0.5 + 0.3 && Math.abs(cz - p.z) < hd + 0.5 + 0.3)) { bad++; worst = `${fam} slot ${s.index}: bay on a column`; }
    if (Math.abs(s.board.x - p.x) < hl + 1 && Math.abs(s.board.z - p.z) < hd + 1) { bad++; worst = `${fam} slot ${s.index}: bay too near the board post`; }
    if (Math.abs(p.x) < SHOP.aisle || Math.abs(p.z) < SHOP.aisle) { bad++; worst = `${fam} slot ${s.index}: bay on a door aisle`; }
  }
  // bays of one shop do not overlap (rows 12 m apart, bays tile a row): check the runs
  for (let i = 0; i < L.runs.length; i++) for (let j = i + 1; j < L.runs.length; j++) { const a = L.runs[i], b = L.runs[j]; if (Math.abs(a.cx - b.cx) < a.hx + b.hx - 0.01 && Math.abs(a.cz - b.cz) < a.hz + b.hz - 0.01) { bad++; worst = `${fam} slot ${s.index}: two runs overlap`; } }
  // every bay is inside exactly one run
  if (!L.bays.every((p) => L.runs.some((r) => Math.abs(p.x - r.cx) <= r.hx + 1e-6 && Math.abs(p.z - r.cz) <= r.hz + 1e-6))) { bad++; worst = `${fam} slot ${s.index}: a bay is in no collider run`; }
}
ok(bad === 0, `all fixture bays: inside their shop, off the columns, clear of the board post and the door aisles, runs do not overlap (${bad} problems${worst ? ': ' + worst : ''})`);
ok(maxBays <= CAP * 1.5 && minBays >= 1, `bays per shop: max ${maxBays} (cap ${CAP}, rows are thinned to fit), min ${minBays}`);
// the real mix: the 80 categories of the mall, per floor
let floorMax = 0, tot = 0, totRuns = 0, totBoxes = 0;
for (let f = 0; f < 10; f++) { let n = 0, r = 0, b = 0; CATEGORIES.filter((c) => c.floor === f).forEach((c, i) => { const L = layoutShop(S[i], FAMILY_OF[c.id], CAP); n += L.bays.length; r += L.runs.length; b += L.bays.reduce((a, p) => a + p.bay.boxes.length, 0); }); console.log(`floor ${f}: ${n} bays, ${r} colliders, ${b} boxes (~${b * 12} triangles)`); floorMax = Math.max(floorMax, b); tot += n; totRuns += r; totBoxes += b; }
ok(tot > 0 && floorMax < 40000, `the busiest floor has ${floorMax} fixture boxes (<= 40,000 = ~480k triangles, only the floor the player is on is drawn)`);
console.log(`all 10 floors: ${tot} bays (${(tot / 80).toFixed(0)} per shop), ${totRuns} colliders, ${totBoxes} boxes`);
console.log('shop areas (m2):', S.map((s) => s.area.toFixed(0)).join(', '));
console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
