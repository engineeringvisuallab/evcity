// STEP J1-g3: checks of the finished ground of the open star J1 (terrain pad + join with the four arms). Run: npx tsx scripts/j1-g3-check.ts docs
// Reads the game terrain (TerrainGenerator) and the pure terrain class (src/roads/junction/GroundJ1Terrain.ts). Writes docs/STEPJ1G3_OUTPUT.txt and docs/j1g3.json. Changes nothing else.
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1Terrain, J1_S_END, J1_SA, J1_SB, J1_HALF_W, pviLevel, type J1Arm } from '../src/roads/junction/GroundJ1Terrain';
import { J1_ARM_PVI } from '../src/roads/junction/J1ArmProfiles';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
import { DIRS, J1_APPROACH_INPUTS, type Dir, type V2 } from '../src/roads/junction/GroundJ1Geometry';
import { OPEN_PARAMS, buildArm, buildMovements, deriveOpen, pavedOutline, pointInPoly, toWorld } from '../src/roads/junction/OpenJ1Geometry';

const out = process.argv[2] ?? 'docs';
const L: string[] = []; const p = (s = ''): void => { L.push(s); console.log(s); };
let fails = 0;
const CHK = (n: string, ok: boolean, d: string): void => { p(`  ${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(96)} ${d}`); if (!ok) fails++; };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2), f3 = (v: number): string => v.toFixed(3);
const pc = (v: number, d = 2): string => (v * 100).toFixed(d) + ' %';

const gen = new TerrainGenerator(Config.world.seed);
const T = gen.roads.j1 as J1Terrain;
const C = Config.roads.junctionJ1;
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const nat = (x: number, z: number): number => { gen.sampleNatural(x, z, sc); return sc.h; };
const ARMS = ['N', 'E', 'S', 'W'] as const;
const D = deriveOpen();
const FLOWS = JSON.parse(readFileSync(`${out}/j1a.json`, 'utf8')).FLOWS as Record<Dir, { L: number; T: number; R: number }>;
const arms = Object.fromEntries(DIRS.map((d) => [d, buildArm(d)])) as Record<Dir, ReturnType<typeof buildArm>>;
const mv = buildMovements(arms, FLOWS);
const outline = pavedOutline(arms);
const world = (q: V2): [number, number] => { const w = toWorld(q); return [w.x, w.z]; };
const s0 = { w: 0, y: 0 }, s1 = { w: 0, y: 0 };

p('J1-g3 CHECK: terrain pad + join with the arms, open ground interchange, C10 (-87, -277) yaw 37.5 (2026-11-14)');
p('');
p('1. NUMBERS');
p(`  pad plane (Config.roads.junctionJ1): centre ${f3(C.y)} m, grade ${pc(Math.hypot(T.cfg.a, T.cfg.b))}, flat square |e|, |n| <= ${C.rCore} m, skirt ${C.emb} m`);
p(`  paved star +-${f1(D.Cx)} m (slip arcs end at s ${f1(D.Cx)}); pad plane to SA = ${J1_SA} m; the arm level is the plane at SA and becomes the approved arm profile at SB = ${J1_SB} m; lane zone ends at S_END = ${J1_S_END} m (open star zone ${f1(Math.max(...DIRS.map((d) => arms[d].sZone)))} m), half width ${J1_HALF_W} m`);
p('');

// ---------------------------------------------------------------- 2. pad
let sMax = 0, sMin = 0, nS = 0;
for (let e = -D.Cx; e <= D.Cx; e += 3) for (let n = -D.Cx; n <= D.Cx; n += 3) {
  const [x, z] = world([e, n]); if (!pointInPoly(e, n, outline)) continue;
  const d = T.levelAt(x, z) - nat(x, z); sMax = Math.max(sMax, d); sMin = Math.min(sMin, d); nS++;
}
p(`2. PAD   under the paved star (inside the paved outline, ${nS} samples every 3 m): max fill ${f2(sMax)} m, max cut ${f2(-sMin)} m`);
p('');

// ---------------------------------------------------------------- 3. arm join
p(`3. ARM JOIN   finished axis level L(s): plane for s <= ${J1_SA}, then arm profile + d(s) (cubic, same level and grade as the plane at SA, 0 and 0 at SB = ${J1_SB}), exactly the arm profile from SB`);
const profVertices: Record<string, number[]> = {};
let worstG = 0, worstStar = 0, worstJoin = 0, worstStep = 0, worstDiffEnd = 0, worstCurv = 0;
const series: Record<string, { s: number[]; level: number[]; profile: number[]; natural: number[] }> = {};
for (const arm of ARMS) {
  const lv = (s: number): number => T.armLevel(arm, s);
  const vt = J1_ARM_PVI[arm].filter((v) => v.Lc === 0 && v.s > 1).map((v) => v.s); profVertices[arm] = vt;
  const nearVertex = (s: number): boolean => vt.some((v) => Math.abs(s - v) <= 1.5);
  let gmax = 0, gstar = 0, gstep = 0;
  for (let s = 1; s <= 340; s += 1) {
    const g = Math.abs(lv(s) - lv(s - 1)); gmax = Math.max(gmax, g); if (s <= J1_SA) gstar = Math.max(gstar, g);
    if (s >= 2 && !nearVertex(s)) { const st = Math.abs(lv(s) - 2 * lv(s - 1) + lv(s - 2)); gstep = Math.max(gstep, st); }
  }
  const gl = lv(J1_SA) - lv(J1_SA - 1), gr = lv(J1_SA + 1) - lv(J1_SA); const brkA = Math.abs(gr - gl);
  const gl2 = lv(J1_SB) - lv(J1_SB - 1), gr2 = lv(J1_SB + 1) - lv(J1_SB); const brkB = Math.abs(gr2 - gl2);
  let dEnd = 0; for (let s = J1_SB; s <= 340; s += 5) dEnd = Math.max(dEnd, Math.abs(lv(s) - pviLevel(J1_ARM_PVI[arm], s)));
  // extra grade from the join: finished grade minus profile grade
  let extra = 0; for (let s = J1_SA; s <= J1_SB; s += 1) extra = Math.max(extra, Math.abs((lv(s) - lv(s - 1)) - (pviLevel(J1_ARM_PVI[arm], s) - pviLevel(J1_ARM_PVI[arm], s - 1))));
  worstG = Math.max(worstG, gmax); worstStar = Math.max(worstStar, gstar); worstJoin = Math.max(worstJoin, brkA, brkB); worstStep = Math.max(worstStep, gstep); worstDiffEnd = Math.max(worstDiffEnd, dEnd); worstCurv = Math.max(worstCurv, extra);
  series[arm] = { s: [], level: [], profile: [], natural: [] };
  for (let s = 0; s <= 340; s += 5) { const [x, z] = T.axisPoint(arm, s); series[arm].s.push(s); series[arm].level.push(+lv(s).toFixed(3)); series[arm].profile.push(+pviLevel(J1_ARM_PVI[arm], s).toFixed(3)); series[arm].natural.push(+nat(x, z).toFixed(3)); }
  p(`  arm ${arm}: level at the centre ${f3(lv(0))} m, at SA ${f3(lv(J1_SA))} (plane - profile ${f3(T.delta[arm])} m), at SB ${f3(lv(J1_SB))}, at s ${J1_S_END} ${f3(lv(J1_S_END))} m; steepest grade 0..340 m ${pc(gmax)} (first ${J1_SA} m ${pc(gstar)}); extra grade from the join ${pc(extra)}`);
  p(`         grade break at SA ${pc(brkA, 3)}, at SB ${pc(brkB, 3)}, largest other grade step per 1 m ${pc(gstep, 3)}${vt.length ? ` (own profile vertices with no curve at s ${vt.map((v) => v.toFixed(0)).join(', ')} are left out of this number)` : ''}`);
}
p('');

// ---------------------------------------------------------------- 4. arm zones against the natural ground
p('4. ARM ZONES against the natural ground (axis and both edges of the paved width, s = 0..315 m, every 5 m)');
const zone: Record<string, { fill: number; cut: number }> = {};
for (const arm of ARMS) {
  let fill = 0, cut = 0;
  for (let s = 0; s <= J1_S_END; s += 5) for (const o of [-23.4, 0, 23.4]) {
    const [e, n] = arm === 'N' ? [o, s] : arm === 'S' ? [o, -s] : arm === 'E' ? [s, o] : [-s, o];
    const [x, z] = T.toWorld(e, n); const d = T.levelAt(x, z) - nat(x, z); fill = Math.max(fill, d); cut = Math.max(cut, -d);
  }
  zone[arm] = { fill, cut }; p(`  arm ${arm}: max fill ${f2(fill)} m, max cut ${f2(cut)} m`);
}
p('');

// ---------------------------------------------------------------- 5. skirt, water, rail
let wet = 0, wetPaved = 0, ptsSkirt = 0, slopeMax = 0;
const STEP = 3;
for (let e = -J1_S_END - 40; e <= J1_S_END + 40; e += STEP) for (let n = -J1_S_END - 40; n <= J1_S_END + 40; n += STEP) {
  const [x, z] = T.toWorld(e, n);
  if (!T.sample(x, z, s0)) continue;
  const a = T.armOf(e, n);
  gen.sampleNatural(x, z, sc); const isWet = !Number.isNaN(sc.water) && sc.h < sc.water;
  if (isWet) { wet++; if (pointInPoly(e, n, outline)) wetPaved++; }
  if (s0.w > 0 && s0.w < 1 && a.s <= J1_S_END - 10) {
    // the J1 skirt alone: natural ground blended to the finished level with the same weight the game uses (the EVLab lake / pad beside the star is NOT part of this slope, it is re-placed later)
    const hJ = (xx: number, zz: number): number => { T.sample(xx, zz, s1); const h0 = nat(xx, zz); return h0 + s1.w * (s1.y - h0); };
    const hx = hJ(x + 1, z), hx0 = hJ(x - 1, z), hz = hJ(x, z + 1), hz0 = hJ(x, z - 1);
    slopeMax = Math.max(slopeMax, Math.hypot((hx - hx0) / 2, (hz - hz0) / 2)); ptsSkirt++;
  }
}
// rail: nearest railway to the paved outline (corners and every 5 m of the edges) and to the arm axes up to S_END
let railMin = 1e9;
const segDist = (px: number, pz: number): number => { let best = 1e9; for (const e of gen.rail.edges) for (let k = 0; k + 1 < e.xs.length; k++) { const dx = e.xs[k + 1] - e.xs[k], dz = e.zs[k + 1] - e.zs[k], l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - e.xs[k]) * dx + (pz - e.zs[k]) * dz) / l2)); best = Math.min(best, Math.hypot(px - e.xs[k] - t * dx, pz - e.zs[k] - t * dz)); } return best; };
for (let i = 0; i < outline.length; i += 3) { const [x, z] = world(outline[i]); railMin = Math.min(railMin, segDist(x, z)); }
for (const arm of ARMS) for (let s = 0; s <= J1_S_END; s += 10) { const [x, z] = T.axisPoint(arm, s); railMin = Math.min(railMin, segDist(x, z)); }
p(`5. SKIRT, WATER, RAIL`);
p(`  embankment skirt (J1 alone, without the EVLab ground): ${ptsSkirt} points (inside s <= ${J1_S_END - 10}), steepest finished slope ${pc(slopeMax, 1)} (1:3 = 33.3 %), wet points under pad + lane zones + skirt ${wet}, under the paved outline ${wetPaved}`);
p(`  nearest railway to the paved outline and the arm axes (s 0..${J1_S_END}): ${f1(railMin)} m`);
p('');

// ---------------------------------------------------------------- 6. lane centre lines and outline on the finished ground
let lanePts = 0, laneBad = 0, laneDiff = 0, outBad = 0, outDiff = 0;
for (const m of mv) for (const q of m.pts) { const [x, z] = world(q); T.sample(x, z, s0); lanePts++; if (s0.w < 1 - 1e-9) laneBad++; laneDiff = Math.max(laneDiff, Math.abs(gen.heightAt(x, z) - T.levelAt(x, z))); }
for (const q of outline) { const [x, z] = world(q); T.sample(x, z, s0); if (s0.w < 1 - 1e-9) outBad++; outDiff = Math.max(outDiff, Math.abs(gen.heightAt(x, z) - T.levelAt(x, z))); }
// the paved outline must stay inside the flat zone: lateral distance from the axis of every outline point beyond SA
let lat = 0; for (const q of outline) { const a = T.armOf(q[0], q[1]); if (a.s > J1_SA) lat = Math.max(lat, a.o); }

// ---------------------------------------------------------------- 7. data of the arms
let dataDiff = 0, dataN = 0, firstDiff = 0, firstGap = 0;
for (const d of J1_ARM_DATA) {
  const arm = d.name.slice(3) as J1Arm;
  for (let i = 0; i < d.s.length; i++) { if (d.s[i] > 345) break; dataDiff = Math.max(dataDiff, Math.abs(d.ys[i] - T.armLevel(arm, d.s[i]))); dataN++; }
  firstDiff = Math.max(firstDiff, Math.abs(d.ys[0] - T.armLevel(arm, J1_S_END)));
  const [ax, az] = T.axisPoint(arm, J1_S_END); firstGap = Math.max(firstGap, Math.hypot(d.pts[0][0] - ax, d.pts[0][1] - az));
}
const zoneEnd = Math.max(...DIRS.map((d) => arms[d].sZone)), clearMin = Math.min(...DIRS.map((d) => J1_APPROACH_INPUTS[d].clear));

p('6. PASS / FAIL');
CHK('pad plane grade between 0.3 % and 2 % (junction surface rule of J1-c)', Math.hypot(T.cfg.a, T.cfg.b) >= 0.003 - 1e-6 && Math.hypot(T.cfg.a, T.cfg.b) <= 0.02 + 1e-6, pc(Math.hypot(T.cfg.a, T.cfg.b)));
CHK('star: max fill and max cut under the paved star <= 1.5 m', sMax <= 1.5 && -sMin <= 1.5, `fill ${f2(sMax)} m, cut ${f2(-sMin)} m`);
CHK('arm zones: max fill / cut under every arm zone (s 0..315, axis and edges) <= 7 m (rule D4: fill over 7 m = viaduct)', ARMS.every((a) => zone[a].fill <= 7 && zone[a].cut <= 7), ARMS.map((a) => `${a} +${f2(zone[a].fill)}/-${f2(zone[a].cut)}`).join('  '));
CHK(`skirt slope: the finished surface in the embankment is never steeper than 1:3 (smoothstep skirt ${C.emb} m)`, slopeMax <= 1 / 3 + 1e-3, pc(slopeMax, 1));
CHK('no water under the paved outline, the pad, the lane zones or their skirt', wet === 0, `${wet} wet points`);
CHK('railway at least 50 m from the paved outline and the arm axes (rule of J1-g1)', railMin >= 50, `${f1(railMin)} m`);
CHK('every lane centre line of g2 (32) lies on full-weight ground (w = 1) and the game ground equals the finished level (< 3 cm)', laneBad === 0 && laneDiff < 0.03, `${laneBad} of ${lanePts} points not full weight, max diff ${f3(laneDiff)} m`);
CHK('every corner of the paved outline lies on full-weight ground and the game ground equals the finished level (< 3 cm)', outBad === 0 && outDiff < 0.03, `${outBad} of ${outline.length} points not full weight, max diff ${f3(outDiff)} m`);
CHK(`the paved outline lies inside the flat lane zone (half width ${J1_HALF_W} m, at least 3 m shoulder)`, lat <= J1_HALF_W - 3, `${f2(lat)} m`);
CHK('grade inside the open star (first 100 m of every arm) <= 2 %', worstStar <= 0.02, pc(worstStar));
CHK('arm axis grade 0..340 m <= 4 % (arm limit of the J1-c rows)', worstG <= 0.04, pc(worstG));
CHK('arm axis: the join of plane and profile has no grade break (SA and SB, each <= 0.05 %) and no new grade step per 1 m over 0.1 %', worstJoin <= 0.0005 && worstStep <= 0.001, `breaks ${pc(worstJoin, 3)}, steps ${pc(worstStep, 3)}`);
CHK('arm join: the extra grade the join adds to the approved profile (s SA..SB) is <= 0.8 %', worstCurv <= 0.008, pc(worstCurv));
CHK('arm join: from SB the finished level IS the arm profile (difference 0)', worstDiffEnd < 1e-9, `${worstDiffEnd.toExponential(1)} m`);
CHK(`arm join: the generated arm data (J1ArmData, from s ${J1_S_END}) starts on the axis at S_END at the finished level and agrees along its first points (${dataN})`, firstDiff < 0.005 && firstGap < 0.05 && dataDiff < 0.005, `level ${f3(firstDiff)} m, position ${f3(firstGap)} m, max ${f3(dataDiff)} m`);
CHK(`constants: SA ${J1_SA} >= arc tangent point ${f1(D.Cx)}, SB ${J1_SB} < S_END ${J1_S_END}, zone ${f1(zoneEnd)} <= S_END, S_END <= smallest clear length ${clearMin}, Config rCore = SA`, J1_SA >= D.Cx && J1_SB < J1_S_END && zoneEnd <= J1_S_END && J1_S_END <= clearMin && C.rCore === J1_SA, `${J1_SA} / ${J1_SB} / ${J1_S_END}`);
p('');
p(fails === 0 ? 'ALL PASS' : `${fails} FAIL`);
void OPEN_PARAMS;
writeFileSync(`${out}/STEPJ1G3_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${out}/j1g3.json`, JSON.stringify({ SA: J1_SA, SB: J1_SB, S_END: J1_S_END, pad: { y: C.y, a: C.a, b: C.b, rCore: C.rCore, emb: C.emb }, series, starFill: sMax, starCut: -sMin, zone, slopeMax, railMin, worstG, worstStar, worstJoin, worstStep, worstCurv }, null, 1));
process.exit(fails ? 1 : 0);
