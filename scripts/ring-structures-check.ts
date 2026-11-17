// STEP 5.3b check (CP5.3): the structures (bridges / viaducts) of the ring.
//  1. every wet point of the centreline is inside a structure (no dam across a river)   2. no fill higher than the viaduct limit stands outside a structure
//  3. every structure has an approach slab of STRUCT.approach at both ends               4. the terrain under the INNER part of a structure is never raised (no earth dam in a valley)
//  5. the ground stays STRUCT.groundGap below the underside of the slab over the WHOLE deck width incl. the approach slabs
// Run: npx tsx scripts/ring-structures-check.ts
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { STRUCT } from '../src/roads/ring/RingStructures';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(78)} ${detail}`); };
const f = (v: number, d = 1): string => v.toFixed(d);
const gen = new TerrainGenerator(Config.world.seed);
const net = gen.roads;
const ring = net.roads.find((r) => r.name === 'M8')!;
const n = ring.xs.length;
const st = net.bridges.filter((b) => b.roadId === ring.id);
const o = { h: 0, water: NaN, fx: 0, fz: 0 };
const nat = (x: number, z: number): { h: number; w: number } => { gen.sampleNatural(x, z, o); return { h: o.h, w: o.water }; };
const inside = (i: number): boolean => ring.bridgeOf[i] >= 0;
const stationOf = (i: number): number => Math.round((i * ring.length) / n);

console.log(`RING STRUCTURES (Step 5.3b)   ring ${f(ring.length, 0)} m, ${n} points, ${st.length} structures`);
console.log('  no  stations         length  wet span  type  water  clearance(underside over water/ground)');
st.forEach((b, k) => console.log(`  S${k + 1}  ${String(stationOf(b.i0)).padStart(5)} - ${String(stationOf(b.i1)).padStart(5)}  ${String(f(b.lengthM, 0)).padStart(5)} m  ${String(f(b.spanM, 0)).padStart(5)} m   ${b.type.padEnd(4)}  ${f(b.waterY)}   ${f(b.clearanceM)} m`));

// 1 + 2
let wetOut = 0, fillOut = 0, fillWorst = 0; const fillAt: string[] = [];
for (let i = 0; i < n; i++) {
  const g = nat(ring.xs[i], ring.zs[i]);
  const wet = !Number.isNaN(g.w) && g.h < g.w + 0.3 && g.h > 2;
  if (wet && !inside(i)) wetOut++;
  const fill = ring.ys[i] - ring.hNat[i];
  if (!inside(i) && fill > 25) { fillOut++; fillWorst = Math.max(fillWorst, fill); if (fillAt.length < 3) fillAt.push(`st ${stationOf(i)}`); }
}
check(wetOut === 0, '1. every wet point of the centreline is inside a structure', `bad ${wetOut}`);
check(fillOut === 0, '2. no fill higher than 25 m outside a structure', `worst ${f(fillWorst)} m, bad ${fillOut} ${fillAt.join(' ')}`);

// 3
const appr = Math.ceil(STRUCT.approach / ring.step);
let apprBad = 0;
for (const b of st) {
  // the structure's own first / last wet or high point is at least `appr` points inside from both ends, so the approach slabs lie on the embankment
  if (b.i1 - b.i0 < 2 * appr + 2) apprBad++;
}
check(apprBad === 0, `3. every structure is long enough for two approach slabs of ${STRUCT.approach} m`, `bad ${apprBad}`);

// 4 + 5
const OFFS = [-30, -22, -10, 0, 10, 22, 30];
let nIn = 0, riseBad = 0, riseWorst = 0; const riseAt: string[] = [];
let nAll = 0, touchAll = 0, worstAll = 0; const touchAt: string[] = [];
for (const b of st) {
  for (let i = b.i0; i <= b.i1; i++) {
    const innerPt = i >= b.i0 + appr && i <= b.i1 - appr;
    for (const u of OFFS) {
      const x = ring.xs[i] + ring.nx[i] * u, z = ring.zs[i] + ring.nz[i] * u;
      const nt = nat(x, z);
      gen.sampleGround(x, z, o); net.apply(x, z, o);
      const fin = o.h;
      if (innerPt) { nIn++; const rise = fin - nt.h; if (rise > 0.05) { riseBad++; riseWorst = Math.max(riseWorst, rise); if (riseAt.length < 3) riseAt.push(`st ${stationOf(i)} u${u} +${f(rise)}`); } }
      if (Math.abs(u) <= 22) {
        nAll++;
        const slab = ring.ys[i] - STRUCT.deckDepth;
        if (fin > slab - STRUCT.groundGap + 0.02) { touchAll++; worstAll = Math.max(worstAll, fin - (slab - STRUCT.groundGap)); if (touchAt.length < 3) touchAt.push(`st ${stationOf(i)} u${u}`); }
      }
    }
  }
}
check(riseBad === 0, '4. terrain under the inner part of a structure is never raised (no earth dam)', `${nIn} points, worst rise ${f(riseWorst, 2)} m, bad ${riseBad} ${riseAt.join(' ')}`);
check(touchAll === 0, `5. whole deck incl. approach slabs: ground stays ${STRUCT.groundGap} m below the slab underside`, `${nAll} points, worst ${f(worstAll, 2)} m, bad ${touchAll} ${touchAt.join(' ')}`);

// info: low clearance (not a pass / fail, needs the user's OK)
for (const [k, b] of st.entries()) if (!Number.isNaN(b.waterY) && b.clearanceM < 3 && b.spanM > 0) console.log(`  INFO  S${k + 1} (station ${stationOf(b.i0)}-${stationOf(b.i1)}): underside only ${f(b.clearanceM)} m over the water (low; the grade line is unchanged, user decision pending)`);
console.log(fails === 0 ? 'ALL CHECKS PASS' : `${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
