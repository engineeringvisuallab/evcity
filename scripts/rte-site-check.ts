// STEP RE-0 (HANDOFF_JUNCTION_RTE.md): site check of junction RT-E = ring (M8) x J1-E arm, X 2335 Z 1438. READ ONLY: no src change.
// Run: npx tsx scripts/rte-site-check.ts   -> docs/RTE_SITE.txt + docs/rte_site.json (picture: python3 tools/rte-site-plot.py docs)
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';

const out: string[] = []; let fails = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; say(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${detail}`); };
const info = (name: string, detail: string): void => say(`  INFO  ${name.padEnd(64)} ${detail}`);

const gen: any = new TerrainGenerator(Config.world.seed);
const net: any = gen.roads;
const ring = net.roads.find((r: any) => r.name === 'M8');
const arm = net.roads.find((r: any) => r.name === 'J1-E');
const JX = arm.xs[arm.xs.length - 1], JZ = arm.zs[arm.zs.length - 1];
const o = { h: 0, water: NaN, fx: 0, fz: 0 };
const nat = (x: number, z: number): { h: number; wet: boolean } => { gen.sampleNatural(x, z, o); return { h: o.h, wet: !Number.isNaN(o.water) && o.h < o.water + 0.3 }; };

// ring station of the junction and ring frame
let k0 = 0, bd = 1e18;
for (let i = 0; i < ring.xs.length; i++) { const d = Math.hypot(ring.xs[i] - JX, ring.zs[i] - JZ); if (d < bd) { bd = d; k0 = i; } }
const sJ: number = ring.cum[k0];
const at = (r: any, s: number): { x: number; z: number; y: number; k: number } => {
  const L = r.length; let ss = r.closed ? ((s % L) + L) % L : Math.max(0, Math.min(L, s));
  let lo = 0, hi = r.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= ss) lo = m; else hi = m; }
  const span = r.cum[hi] - r.cum[lo] || 1; const t = (ss - r.cum[lo]) / span;
  return { x: r.xs[lo] + (r.xs[hi] - r.xs[lo]) * t, z: r.zs[lo] + (r.zs[hi] - r.zs[lo]) * t, y: r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t, k: lo };
};
const pj = at(ring, sJ), pa = at(ring, sJ - 5), pb = at(ring, sJ + 5);
let tx = pb.x - pa.x, tz = pb.z - pa.z; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
// left normal of the travel direction (x east, z south): (tz, -tx). Verified below with the csv convention northing = 5000 - z.
const lnx = tz, lnz = -tx;
const q = at(arm, arm.length - 60); let ax = q.x - JX, az = q.z - JZ; const al = Math.hypot(ax, az); ax /= al; az /= al;
const angle = Math.acos(Math.min(1, Math.abs(tx * ax + tz * az))) * 180 / Math.PI;
const stemLeft = ax * lnx + az * lnz > 0;
const sideStem = stemLeft ? 1 : -1; // +1 = left normal side of increasing station
say('RTE SITE CHECK (RE-0) ring x J1-E');
say(`Junction point (arm end) X ${JX.toFixed(1)} Z ${JZ.toFixed(1)}; ring station ${sJ.toFixed(0)} m of ${ring.length.toFixed(0)} m; ring point ${pj.x.toFixed(1)}, ${pj.z.toFixed(1)}, distance ${bd.toFixed(2)} m`);
say(`Ring: half width ${ring.halfWidth} m, median half ${ring.medianHalf} m (median ${ring.medianHalf * 2} m), lane ${ring.laneW} m, shoulder ${ring.shoulder} m. Arm: half width ${arm.halfWidth}, median half ${arm.medianHalf}`);
say(`Ring heading (x, z) = (${tx.toFixed(3)}, ${tz.toFixed(3)}); stem points (${ax.toFixed(3)}, ${az.toFixed(3)}); stem is on the ${stemLeft ? 'LEFT' : 'RIGHT'} of the increasing station direction`);
say(`Left-hand traffic: direction A (keep-left lane on the stem side) = ${stemLeft ? 'INCREASING station (R- to R+)' : 'DECREASING station (R+ to R-)'}; direction B = the other one.`);

// vertical
say('\n1. LEVELS');
const prof: any = { ring: [], arm: [] };
let maxG = 0, minG = 99; say('  ring: station offset s-J (m), level y (m), grade to the next point (%)');
for (let d = -1000; d <= 1000; d += 100) { const a = at(ring, sJ + d), b = at(ring, sJ + d + 20); const g = (b.y - a.y) / 20 * 100; prof.ring.push([d, a.y, g]); say(`    ${String(d).padStart(6)}  ${a.y.toFixed(2).padStart(7)}  ${g.toFixed(2).padStart(6)}`); }
for (let d = -300; d <= 300; d += 10) { const a = at(ring, sJ + d), b = at(ring, sJ + d + 10); const g = Math.abs((b.y - a.y) / 10 * 100); maxG = Math.max(maxG, g); minG = Math.min(minG, g); }
check(maxG <= 3, 'ring grade within +-300 m of the T <= 3 %', `max ${maxG.toFixed(2)} %`);
const yJ = pj.y; say(`  ring level at the T ${yJ.toFixed(2)} m, arm end level ${arm.ys[arm.ys.length - 1].toFixed(2)} m (diff ${(arm.ys[arm.ys.length - 1] - yJ).toFixed(2)} m)`);
say('  arm: distance from the T (m), level (m), natural ground (m), bridge index');
for (let d = 0; d <= 700; d += 50) { const a = at(arm, arm.length - d); const n = nat(a.x, a.z); const bi = (arm.bridgeOf as any)[a.k]; prof.arm.push([d, a.y, n.h, bi]); say(`    ${String(d).padStart(6)}  ${a.y.toFixed(2).padStart(7)}  ${n.h.toFixed(2).padStart(7)}  ${bi}`); }
// bridge ranges
const ranges = (r: any, from: number, to: number, fromEnd: boolean): string[] => { const res: string[] = []; let cur: number | null = null; let last = 0;
  for (let i = 0; i < r.xs.length; i++) { const d = fromEnd ? r.length - r.cum[i] : r.cum[i] - sJ; if (d < from || d > to) continue; const b = (r.bridgeOf as any)[i] >= 0; if (b && cur === null) cur = d; if (!b && cur !== null) { res.push(`${cur.toFixed(0)}..${last.toFixed(0)}`); cur = null; } last = d; }
  if (cur !== null) res.push(`${cur.toFixed(0)}..${last.toFixed(0)}`); return res; };
const ringBr = ranges(ring, -1500, 1500, false), armBr = ranges(arm, 0, 1500, true);
say(`  ring structures (s offset from the T): ${ringBr.join(' | ') || 'none'}`);
say(`  arm structures (distance from the T): ${armBr.join(' | ') || 'none'}`);
const armFirst = armBr.length ? Math.min(...armBr.map((s) => Number(s.split('..')[0]))) : 1e9;
info('arm: first structure from the T', `${armFirst.toFixed(0)} m`);
// ring curvature near the T (radius from heading change)
const hd = (s: number): number => { const a = at(ring, s), b = at(ring, s + 10); return Math.atan2(b.z - a.z, b.x - a.x); };
let dh = hd(sJ + 400) - hd(sJ - 400); while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
const Rr = Math.abs(dh) < 1e-6 ? Infinity : 800 / Math.abs(dh);
check(Rr >= 1500, 'ring nearly straight within +-400 m (mean radius >= 1500 m)', Number.isFinite(Rr) ? `R ${Rr.toFixed(0)} m` : 'straight');
check(angle >= 70 && angle <= 110, 'stem meets the ring at 70..110 deg', `${angle.toFixed(1)} deg`);

// quadrants
say('\n2. FREE LAND (4 quadrants). Box: along the ring 80..S1 m from the T, offset 25..200 m from the ring centreline.');
const rail = gen.rail.edges as any[];
const railDist = (x: number, z: number): { d: number; id: string } => { let best = 1e9, id = ''; for (const e of rail) { for (let i = 0; i < e.xs.length; i += 2) { const d = Math.hypot(e.xs[i] - x, e.zs[i] - z); if (d < best) { best = d; id = e.id; } } } return { d: best, id }; };
const bld = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
const quads: any[] = [];
const S1 = 600;
for (const sg of [-1, 1]) for (const side of [1, -1]) {
  const name = `${sg < 0 ? 'R-' : 'R+'} / ${side === sideStem ? 'STEM side' : 'FAR side'}`;
  let maxCut = 0, maxFill = 0, wet = 0, n = 0, minRail = 1e9, railId = '', nb = 0, maxSlope = 0; const seen = new Set<number>();
  for (let d = 80; d <= S1; d += 40) { const rp = at(ring, sJ + sg * d); const rlx = rp.x, rlz = rp.z;
    for (let off = 25; off <= 200; off += 25) { const x = rlx + side * lnx * off, z = rlz + side * lnz * off; const nn = nat(x, z); n++; if (nn.wet) wet++; const diff = nn.h - rp.y; maxCut = Math.max(maxCut, diff); maxFill = Math.max(maxFill, -diff);
      const n2 = nat(x + lnx * side * 5, z + lnz * side * 5); maxSlope = Math.max(maxSlope, Math.abs(n2.h - nn.h) / 5 * 100);
      if (off % 50 === 0) { const rd = railDist(x, z); if (rd.d < minRail) { minRail = rd.d; railId = rd.id; } } } }
  bld.forEach((b: any, i: number) => { const rel = ((b.x - pj.x) * tx + (b.z - pj.z) * tz) * sg; const lat = ((b.x - pj.x) * lnx + (b.z - pj.z) * lnz) * side; if (rel >= 80 && rel <= S1 && lat >= 25 && lat <= 200 && !seen.has(i)) { seen.add(i); nb++; } });
  quads.push({ name, maxCut, maxFill, wetShare: wet / n, minRail, railId, buildings: nb, maxSlope });
  say(`  ${name.padEnd(18)} ground above ring (cut) max ${maxCut.toFixed(1)} m, below ring (fill) max ${maxFill.toFixed(1)} m, steepest 5 m slope ${maxSlope.toFixed(0)} %, wet ${(100 * wet / n).toFixed(0)} %, rail min ${minRail.toFixed(0)} m (${railId}), buildings in box ${nb}`);
}
const far = quads.filter((x) => x.name.includes('FAR'));
for (const f of far) { check(f.wetShare === 0, `${f.name}: no water in the box`, `wet ${(100 * f.wetShare).toFixed(0)} %`); check(f.buildings === 0, `${f.name}: no building in the box`, `${f.buildings}`); check(f.minRail > 60, `${f.name}: rail more than 60 m from the sampled points`, `${f.minRail.toFixed(0)} m`); check(f.maxFill <= 7 && f.maxCut <= 12, `${f.name}: ring-to-ground difference within fill 7 / cut 12`, `fill ${f.maxFill.toFixed(1)} cut ${f.maxCut.toFixed(1)}`); }
// other roads near
say('\n3. OTHER ROADS AND RAIL NEAR THE T');
const near: string[] = [];
for (const r of net.roads) { if (r === ring || r === arm) continue; let m = 1e9; for (let i = 0; i < r.xs.length; i++) m = Math.min(m, Math.hypot(r.xs[i] - JX, r.zs[i] - JZ)); if (m < 700) near.push(`${r.name} ${m.toFixed(0)} m`); }
say(`  roads within 700 m of the T: ${near.join(', ') || 'none'}`);
info('other roads within 700 m (R2 lines, not a ramp conflict: a ramp must stay clear of them, see RE-1)', near.join(', ') || 'none');
let rmin = 1e9, rid = ''; for (const e of rail) for (let i = 0; i < e.xs.length; i++) { const d = Math.hypot(e.xs[i] - JX, e.zs[i] - JZ); if (d < rmin) { rmin = d; rid = e.id; } }
info('nearest rail point to the T', `${rmin.toFixed(0)} m (${rid})`);
let nbld = 0; for (const b of bld as any[]) if (Math.hypot(b.x - JX, b.z - JZ) < 400) nbld++;
info('buildings within 400 m of the T (all quadrants, arm and ring corridor included)', `${nbld}`);
const nw = nat(JX, JZ); info('natural ground at the T / water', `${nw.h.toFixed(2)} m / ${nw.wet}`);
// rail polyline in the ring frame (rel = along the ring from the T, lat = to the left of the increasing direction)
const railPts: number[][] = [];
for (const e of rail) for (let i = 0; i < e.xs.length; i++) { const rel = (e.xs[i] - pj.x) * tx + (e.zs[i] - pj.z) * tz, lat = (e.xs[i] - pj.x) * lnx + (e.zs[i] - pj.z) * lnz; if (Math.abs(rel) < 900 && Math.abs(lat) < 600) railPts.push([e.xs[i], e.zs[i], rel, lat, e.design ? e.design[i] : NaN, e.ground ? e.ground[i] : NaN]); }
if (railPts.length) { const rels = railPts.map((r) => r[2]), lats = railPts.map((r) => r[3]);
  say(`  rail east-2 inside the 900 x 600 m window: ${railPts.length} points, along-ring ${Math.min(...rels).toFixed(0)}..${Math.max(...rels).toFixed(0)} m, lateral (left +) ${Math.min(...lats).toFixed(0)}..${Math.max(...lats).toFixed(0)} m`);
  const nr = railPts.reduce((b, r) => (Math.hypot(r[2], r[3]) < Math.hypot(b[2], b[3]) ? r : b)); say(`  rail point nearest to the T: along ${nr[2].toFixed(0)} m, lateral ${nr[3].toFixed(0)} m, rail level ${Number(nr[4]).toFixed(1)} m, ground ${Number(nr[5]).toFixed(1)} m`); }
const grid: number[][] = []; for (let gz = -700; gz <= 700; gz += 20) { const row: number[] = []; for (let gx = -700; gx <= 700; gx += 20) row.push(Math.round(nat(JX + gx, JZ + gz).h * 10) / 10); grid.push(row); }
const ringPts: number[][] = []; for (let d = -900; d <= 900; d += 10) { const a = at(ring, sJ + d); ringPts.push([a.x, a.z, a.y]); }
const armPts: number[][] = []; for (let d = 0; d <= 900; d += 10) { const a = at(arm, arm.length - d); armPts.push([a.x, a.z, a.y]); }
const otherPts: any[] = net.roads.filter((r: any) => r !== ring && r !== arm).map((r: any) => ({ n: r.name, p: r.xs.map((x: number, i: number) => [x, r.zs[i]]).filter((p: number[]) => Math.hypot(p[0] - JX, p[1] - JZ) < 1100) })).filter((r: any) => r.p.length);
say('\n4. NOT CHECKED in RE-0: trees and grass, drainage lines, the user\'s look in the game, ring carve with the final ground (natural ground is used), buildings of the city plan not yet placed.');
say(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAIL'}`);
writeFileSync('docs/RTE_SITE.txt', out.join('\r\n') + '\r\n');
writeFileSync('docs/rte_site.json', JSON.stringify({ J: [JX, JZ], sJ, ring: { len: ring.length, hw: ring.halfWidth, mh: ring.medianHalf }, t: [tx, tz], ln: [lnx, lnz], stemLeft, sideStem, angle, quads, prof, ringBr, armBr, grid, ringPts, armPts, railPts, otherPts }, null, 1));
