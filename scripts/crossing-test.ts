// ROADS STEP 6b: headless checks of the mid-block pedestrian crossings and the footpath break. Run: npx tsx scripts/crossing-test.ts
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { FS, planFootpaths, rampFactor } from '../src/roads/FootpathPlan';
import { planMedians, crossingZoneHas } from '../src/roads/MedianPlan';
import { dividedSectionOf } from '../src/roads/RoadSection';
import { padIndex } from '../src/roads/PadIndex';
import { planUTurnSigns } from '../src/roads/UTurnSignPlan';
import { medianSoilTop } from '../src/roads/RoadSection';

let failed = 0;
const ok = (c: boolean, m: string): void => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); };
const C = Config.city.streetCrossing;

const gen = new TerrainGenerator();
const roads = gen.roads;
const byId = new Map(roads.roads.map((r) => [r.id, r]));
const mp = planMedians(roads);
const fp = planFootpaths(roads);
const nearPad = padIndex(roads);
const street = mp.crossings.filter((c) => c.street);
const mall = mp.crossings.filter((c) => !c.street);
console.log(`\n=== CROSSINGS: ${street.length} street, ${mall.length} mall ===`);
ok(street.length >= 20, `enough street crossings (${street.length})`);
ok(street.every((c) => { const r = byId.get(c.roadId)!; return !dividedSectionOf(r) && !r.earth && !r.closed; }), 'street crossings only on undivided roads, never on earth tracks or loops');
ok(street.every((c) => { const r = byId.get(c.roadId)!; return r.tier === 4 || roads.isCityPoint(c.x, c.z); }), 'every street crossing is inside a city');
ok(street.every((c) => !nearPad(c.x, c.z, C.padClear * 0.99)), `none within ${C.padClear} m of a junction pad`);
ok(street.every((c) => { const r = byId.get(c.roadId)!; for (let i = 0; i < r.xs.length - 1; i++) if (r.cum[i + 1] >= c.s) return r.bridgeOf[i] < 0 && r.bridgeOf[i + 1] < 0; return true; }), 'none on a bridge');
let minGap = 1e9;
for (const c of street) for (const d of street) if (c !== d && c.roadId === d.roadId) minGap = Math.min(minGap, Math.abs(c.s - d.s));
ok(minGap >= C.spacing[0] * 0.5, `two crossings of one road are at least ${Math.round(C.spacing[0] * 0.5)} m apart (closest ${minGap > 1e8 ? 'n/a' : minGap.toFixed(0)} m)`);

// the footpath: no run covers the crossing centre; both run ends beside it are dropped kerbs (ramp factor 0)
let covered = 0, noRamp = 0, withPath = 0;
for (const c of mp.crossings) {
  for (const u of fp.runs) {
    if (u.roadId !== c.roadId) continue;
    const s0 = u.p[7], s1 = u.p[(u.n - 1) * FS + 7];
    if (c.s > s0 + 1e-6 && c.s < s1 - 1e-6) covered++;
    for (const [k, sk] of [[0, s0], [u.n - 1, s1]] as [number, number][]) if (Math.abs(sk - c.s) < C.breakHalf + 3.5) { withPath++; if (rampFactor(u, k) !== 0) noRamp++; }
  }
}
ok(covered === 0, `no footpath run crosses a pedestrian crossing (${covered} do)`);
ok(withPath > 0 && noRamp === 0, `${withPath} footpath ends beside crossings, all dropped kerbs`);

// lamps (StreetLights imports three: skipped where three is not installed)
let planStreetLights: typeof import('../src/environment/StreetLights').planStreetLights | null = null;
try { planStreetLights = (await import('../src/environment/StreetLights')).planStreetLights; } catch { console.log('NOTE three is missing: lamp check skipped'); }
const lamps = planStreetLights ? planStreetLights(roads) : [];
let lampIn = 0;
for (const l of lamps) for (const c of mp.crossings) {
  const r = byId.get(c.roadId)!;
  if (Math.hypot(l.x - c.x, l.z - c.z) < 20) {
    // arc length of the lamp along the road, found from the nearest road point
    let best = 1e9, bs = 0;
    for (let i = 0; i < r.xs.length; i++) { const d = Math.hypot(r.xs[i] - l.x, r.zs[i] - l.z); if (d < best) { best = d; bs = r.cum[i]; } }
    if (best < r.halfWidth + 8 && crossingZoneHas(mp, c.roadId, bs, 0.5)) lampIn++;
  }
}
ok(lampIn === 0, `no lamp pole inside a crossing zone (${lampIn})`);
// U-turn signs
console.log('\n=== U-TURN SIGNS ===');
const signs = planUTurnSigns(roads);
const nOpen = mp.uturns.openings.length;
ok(signs.length >= nOpen, `${signs.length} signs for ${nOpen} openings (2 directions each, a few lost near pads / bridges)`);
ok(signs.length <= nOpen * 2, 'at most 2 signs per opening');
let bad = 0, wrongFace = 0, notMedian = 0;
for (const sg of signs) {
  const o = mp.uturns.openings.find((q) => q.id === sg.openingId)!;
  const r = byId.get(sg.roadId)!;
  // facing the driver: the driver comes from the opening's side AWAY from the board, so the board normal points away from the opening
  const toOpen = (o.x - sg.x) * sg.fx + (o.z - sg.z) * sg.fz;
  if (toOpen > 0) wrongFace++;
  const run = mp.runs.find((u) => u.roadId === sg.roadId && sg.s > u.p[7] && sg.s < u.p[(u.n - 1) * 8 + 7]);
  if (!run) notMedian++;
  if (Math.abs(sg.s - o.s) < 20 || Math.abs(sg.s - o.s) > 80) bad++;
  if (Math.abs(sg.y) > 1e5 || !(medianSoilTop(r) > 0)) bad++;
}
ok(wrongFace === 0, `every board faces the oncoming driver (${wrongFace} wrong)`);
ok(notMedian === 0, `every pole stands on a median run (${notMedian} not)`);
ok(bad === 0, `signs are 20..80 m from their opening (${bad} bad)`);
console.log(failed ? `\n${failed} FAILURES` : '\nALL OK');
process.exit(failed ? 1 : 0);
