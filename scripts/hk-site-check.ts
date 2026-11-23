// STEP HK-0 (HANDOFF_HATIKAMRUL.md): site check of the RING S NODE = ring (M8) x J1-S arm (north) x island link M6-1 (south). READ ONLY: no src change.
// Run: npx tsx scripts/hk-site-check.ts   -> docs/HK_SITE.txt + docs/hk_site.json (picture: python3 tools/hk-site-plot.py docs)
import { writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';
import { FILL_PLACEMENTS } from '../src/buildings/PlacementsFill';

const out: string[] = []; let fails = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; say(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(62)} ${detail}`); };
const info = (name: string, detail: string): void => say(`  INFO  ${name.padEnd(62)} ${detail}`);

const gen: any = new TerrainGenerator(Config.world.seed);
const net: any = gen.roads;
const ring = net.roads.find((r: any) => r.name === 'M8');
const arm = net.roads.find((r: any) => r.name === 'J1-S');
const link = net.roads.find((r: any) => r.name === 'M6-1');
if (!ring || !arm || !link) throw new Error(`missing road: ring ${!!ring} arm ${!!arm} link ${!!link}`);
const JX = arm.xs[arm.xs.length - 1], JZ = arm.zs[arm.zs.length - 1];
const o = { h: 0, water: NaN, fx: 0, fz: 0 };
const nat = (x: number, z: number): { h: number; wet: boolean } => { gen.sampleNatural(x, z, o); return { h: o.h, wet: !Number.isNaN(o.water) && o.h < o.water + 0.3 }; };
const at = (r: any, s: number): { x: number; z: number; y: number; k: number } => {
  const L = r.length; const ss = r.closed ? ((s % L) + L) % L : Math.max(0, Math.min(L, s));
  let lo = 0, hi = r.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= ss) lo = m; else hi = m; }
  const span = r.cum[hi] - r.cum[lo] || 1; const t = (ss - r.cum[lo]) / span;
  return { x: r.xs[lo] + (r.xs[hi] - r.xs[lo]) * t, z: r.zs[lo] + (r.zs[hi] - r.zs[lo]) * t, y: r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t, k: lo };
};
let k0 = 0, bd = 1e18;
for (let i = 0; i < ring.xs.length; i++) { const d = Math.hypot(ring.xs[i] - JX, ring.zs[i] - JZ); if (d < bd) { bd = d; k0 = i; } }
const sJ: number = ring.cum[k0];
const pj = at(ring, sJ), pa = at(ring, sJ - 5), pb = at(ring, sJ + 5);
let tx = pb.x - pa.x, tz = pb.z - pa.z; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
const lnx = tz, lnz = -tx; // left normal of increasing station (x east, z south)
const dirOf = (r: any, fromEnd: boolean): number[] => { const q = fromEnd ? at(r, r.length - 60) : at(r, 60); const c = fromEnd ? [JX, JZ] : [r.xs[0], r.zs[0]]; const dx = q.x - c[0], dz = q.z - c[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; };
const ad = dirOf(arm, true), ld = dirOf(link, false);
const armSide = ad[0] * lnx + ad[1] * lnz > 0 ? 1 : -1, linkSide = ld[0] * lnx + ld[1] * lnz > 0 ? 1 : -1;
const angle = Math.acos(Math.min(1, Math.abs(tx * ad[0] + tz * ad[1]))) * 180 / Math.PI;
say('HK SITE CHECK (HK-0) ring S node: ring M8 x J1-S arm x island link M6-1');
say(`Node (arm end) X ${JX.toFixed(1)} Z ${JZ.toFixed(1)}; ring station ${sJ.toFixed(0)} of ${ring.length.toFixed(0)} m; ring point ${pj.x.toFixed(1)}, ${pj.z.toFixed(1)}, distance ${bd.toFixed(2)} m; user readout X -1121 Z 2304 is ${Math.hypot(-1121 - JX, 2304 - JZ).toFixed(0)} m away`);
say(`Ring: half width ${ring.halfWidth} m, median half ${ring.medianHalf} m, lane ${ring.laneW} m. Arm J1-S half width ${arm.halfWidth} m. Link M6-1 half width ${link.halfWidth} m, median half ${link.medianHalf} m, lane ${link.laneW} m, first point ${link.xs[0].toFixed(1)}, ${link.zs[0].toFixed(1)}`);
say(`Ring heading (x, z) = (${tx.toFixed(3)}, ${tz.toFixed(3)}); arm points (${ad[0].toFixed(3)}, ${ad[1].toFixed(3)}) on the ${armSide > 0 ? 'LEFT' : 'RIGHT'} of increasing station; link points (${ld[0].toFixed(3)}, ${ld[1].toFixed(3)}) on the ${linkSide > 0 ? 'LEFT' : 'RIGHT'}`);
check(armSide === -linkSide, 'arm and link are on opposite sides of the ring (4-leg cross)', `arm ${armSide}, link ${linkSide}`);
check(angle >= 70 && angle <= 110, 'arm meets the ring at 70..110 deg', `${angle.toFixed(1)} deg`);
const linkAngle = Math.acos(Math.min(1, Math.abs(tx * ld[0] + tz * ld[1]))) * 180 / Math.PI;
info('link first 60 m meets the ring at', `${linkAngle.toFixed(1)} deg`);

say('\n1. LEVELS');
const prof: any = { ring: [], arm: [], link: [] };
say('  ring: offset from node (m), level (m), grade to +20 m (%)  [+ = station increasing = WEST]');
for (let d = -600; d <= 600; d += 100) { const a = at(ring, sJ + d), b = at(ring, sJ + d + 20); prof.ring.push([d, a.y, (b.y - a.y) / 20 * 100]); say(`    ${String(d).padStart(6)}  ${a.y.toFixed(2).padStart(7)}  ${((b.y - a.y) / 20 * 100).toFixed(2).padStart(6)}`); }
let maxG = 0; for (let d = -300; d <= 300; d += 10) { const a = at(ring, sJ + d), b = at(ring, sJ + d + 10); maxG = Math.max(maxG, Math.abs((b.y - a.y) / 10 * 100)); }
check(maxG <= 3, 'ring grade within +-300 m of the node <= 3 %', `max ${maxG.toFixed(2)} %`);
say('  arm J1-S: distance from node (m), level, natural ground, structure index (-1 = none)');
for (let d = 0; d <= 700; d += 50) { const a = at(arm, arm.length - d); const n = nat(a.x, a.z); prof.arm.push([d, a.y, n.h, (arm.bridgeOf as any)[a.k]]); say(`    ${String(d).padStart(6)}  ${a.y.toFixed(2).padStart(7)}  ${n.h.toFixed(2).padStart(7)}  ${(arm.bridgeOf as any)[a.k]}`); }
say('  link M6-1: distance along the link (m), level, natural ground, structure index');
for (let d = 0; d <= 700; d += 50) { const a = at(link, d); const n = nat(a.x, a.z); prof.link.push([d, a.y, n.h, (link.bridgeOf as any)[a.k]]); say(`    ${String(d).padStart(6)}  ${a.y.toFixed(2).padStart(7)}  ${n.h.toFixed(2).padStart(7)}  ${(link.bridgeOf as any)[a.k]}`); }
const ranges = (r: any, from: number, to: number, mode: 'ring' | 'end' | 'start'): string[] => { const res: string[] = []; let cur: number | null = null; let last = 0;
  for (let i = 0; i < r.xs.length; i++) { const d = mode === 'end' ? r.length - r.cum[i] : mode === 'start' ? r.cum[i] : r.cum[i] - sJ; if (d < from || d > to) continue; const b = (r.bridgeOf as any)[i] >= 0; if (b && cur === null) cur = d; if (!b && cur !== null) { res.push(`${cur.toFixed(0)}..${last.toFixed(0)}`); cur = null; } last = d; }
  if (cur !== null) res.push(`${cur.toFixed(0)}..${last.toFixed(0)}`); return res; };
const ringBr = ranges(ring, -1500, 1500, 'ring'), armBr = ranges(arm, 0, 1500, 'end'), linkBr = ranges(link, 0, 1500, 'start');
say(`  ring structures (offset from node): ${ringBr.join(' | ') || 'none'}`); say(`  arm structures (distance from node): ${armBr.join(' | ') || 'none'}`); say(`  link structures (along link): ${linkBr.join(' | ') || 'none'}`);
const first = (a: string[]): number => (a.length ? Math.min(...a.map((s) => Number(s.split('..')[0]))) : 1e9);
check(first(armBr) >= 450, 'arm: first structure at least 450 m from the node (room to raise 290 m)', `${first(armBr).toFixed(0)} m`);
check(first(linkBr) >= 450, 'link: first structure at least 450 m from the link start', `${first(linkBr).toFixed(0)} m`);
const eastBr = ringBr.map((s) => s.split('..').map(Number)).filter((p) => p[1] < 0).map((p) => -p[1]); info('ring: nearest structure on the EAST (offset -) side', eastBr.length ? `${Math.min(...eastBr).toFixed(0)} m from the node` : 'none within 1500 m');
const westBr = ringBr.map((s) => s.split('..').map(Number)).filter((p) => p[0] > 0).map((p) => p[0]); info('ring: nearest structure on the WEST (offset +) side', westBr.length ? `${Math.min(...westBr).toFixed(0)} m from the node` : 'none within 1500 m');
const hd = (s: number): number => { const a = at(ring, s), b = at(ring, s + 10); return Math.atan2(b.z - a.z, b.x - a.x); };
let dh = hd(sJ + 400) - hd(sJ - 400); while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
const Rr = Math.abs(dh) < 1e-6 ? Infinity : 800 / Math.abs(dh);
check(Rr >= 1500, 'ring nearly straight within +-400 m (mean radius >= 1500 m)', Number.isFinite(Rr) ? `R ${Rr.toFixed(0)} m` : 'straight');

say('\n2. FREE LAND, 4 QUADRANTS. Box: along the ring 100..450 m from the node, offset 40..350 m from the ring centreline (Hatikamrul is about 600-700 m wide).');
const rail = gen.rail.edges as any[];
const railDist = (x: number, z: number): { d: number; id: string } => { let best = 1e9, id = ''; for (const e of rail) for (let i = 0; i < e.xs.length; i += 2) { const d = Math.hypot(e.xs[i] - x, e.zs[i] - z); if (d < best) { best = d; id = e.id; } } return { d: best, id }; };
const bld = [...BUILDING_PLACEMENTS, ...FILL_PLACEMENTS];
const quads: any[] = [];
for (const sg of [-1, 1]) for (const side of [1, -1]) {
  const name = `${sg < 0 ? 'EAST' : 'WEST'}${side === armSide ? '-ARM(north)' : '-LINK(south)'}`;
  let maxCut = 0, maxFill = 0, wet = 0, n = 0, minRail = 1e9, railId = '', nb = 0, maxSlope = 0; const seen = new Set<number>();
  for (let d = 100; d <= 450; d += 50) { const rp = at(ring, sJ + sg * d);
    for (let off = 40; off <= 350; off += 30) { const x = rp.x + side * lnx * off, z = rp.z + side * lnz * off; const nn = nat(x, z); n++; if (nn.wet) wet++; const diff = nn.h - rp.y; maxCut = Math.max(maxCut, diff); maxFill = Math.max(maxFill, -diff);
      const n2 = nat(x + lnx * side * 5, z + lnz * side * 5); maxSlope = Math.max(maxSlope, Math.abs(n2.h - nn.h) / 5 * 100);
      const rd = railDist(x, z); if (rd.d < minRail) { minRail = rd.d; railId = rd.id; } } }
  bld.forEach((b: any, i: number) => { const rel = ((b.x - pj.x) * tx + (b.z - pj.z) * tz) * sg; const lat = ((b.x - pj.x) * lnx + (b.z - pj.z) * lnz) * side; if (rel >= 100 && rel <= 450 && lat >= 40 && lat <= 350 && !seen.has(i)) { seen.add(i); nb++; } });
  quads.push({ name, sg, side, maxCut, maxFill, wetShare: wet / n, minRail, railId, buildings: nb, maxSlope });
  say(`  ${name.padEnd(14)} cut max ${maxCut.toFixed(1)} m, fill max ${maxFill.toFixed(1)} m, steepest 5 m slope ${maxSlope.toFixed(0)} %, wet ${(100 * wet / n).toFixed(0)} %, rail min ${minRail.toFixed(0)} m (${railId}), buildings ${nb}`);
}
for (const f of quads) { check(f.wetShare === 0, `${f.name}: no water in the box`, `wet ${(100 * f.wetShare).toFixed(0)} %`); check(f.minRail > 60, `${f.name}: rail more than 60 m from the sampled points`, `${f.minRail.toFixed(0)} m`); check(f.maxFill <= 7 && f.maxCut <= 12, `${f.name}: ground within fill 7 / cut 12 m of the ring level`, `fill ${f.maxFill.toFixed(1)} cut ${f.maxCut.toFixed(1)}`); info(`${f.name}: buildings in the box (replaced later, not a FAIL)`, `${f.buildings}`); }

say('\n3. OTHER ROADS AND RAIL NEAR THE NODE');
const near: string[] = [];
for (const r of net.roads) { if (r === ring || r === arm || r === link) continue; let m = 1e9; for (let i = 0; i < r.xs.length; i++) m = Math.min(m, Math.hypot(r.xs[i] - JX, r.zs[i] - JZ)); if (m < 700) near.push(`${r.name} ${m.toFixed(0)} m`); }
info('roads within 700 m of the node', near.join(', ') || 'none');
let rmin = 1e9, rid = ''; for (const e of rail) for (let i = 0; i < e.xs.length; i++) { const d = Math.hypot(e.xs[i] - JX, e.zs[i] - JZ); if (d < rmin) { rmin = d; rid = e.id; } }
info('nearest rail point to the node', `${rmin.toFixed(0)} m (${rid})`);
let nbld = 0; for (const b of bld as any[]) if (Math.hypot(b.x - JX, b.z - JZ) < 450) nbld++;
info('buildings within 450 m of the node (all quadrants, corridors included)', `${nbld}`);
const nw = nat(JX, JZ); info('natural ground at the node / water', `${nw.h.toFixed(2)} m / ${nw.wet}`);
const railPts: number[][] = []; for (const e of rail) for (let i = 0; i < e.xs.length; i++) { if (Math.hypot(e.xs[i] - JX, e.zs[i] - JZ) < 900) railPts.push([e.xs[i], e.zs[i]]); }
const grid: number[][] = []; for (let gz = -700; gz <= 700; gz += 20) { const row: number[] = []; for (let gx = -700; gx <= 700; gx += 20) row.push(Math.round(nat(JX + gx, JZ + gz).h * 10) / 10); grid.push(row); }
const pts = (r: any, a: number, b: number, mode: 'ring' | 'end' | 'start'): number[][] => { const rr: number[][] = []; for (let d = a; d <= b; d += 10) { const p = mode === 'ring' ? at(r, sJ + d) : mode === 'end' ? at(r, r.length - d) : at(r, d); rr.push([p.x, p.z, p.y]); } return rr; };
const otherPts: any[] = net.roads.filter((r: any) => r !== ring && r !== arm && r !== link).map((r: any) => ({ n: r.name, p: r.xs.map((x: number, i: number) => [x, r.zs[i]]).filter((p: number[]) => Math.hypot(p[0] - JX, p[1] - JZ) < 1100) })).filter((r: any) => r.p.length);
say('\n4. NOT CHECKED in HK-0: trees and grass, drainage, the carved ground (natural ground is used), the look in the game, city-plan buildings not yet placed, the C-D / ramp geometry itself (HK-3 onwards).');
say(`\nRESULT: ${fails === 0 ? 'ALL PASS' : fails + ' FAIL'}`);
writeFileSync('docs/HK_SITE.txt', out.join('\r\n') + '\r\n');
writeFileSync('docs/hk_site.json', JSON.stringify({ J: [JX, JZ], sJ, t: [tx, tz], ln: [lnx, lnz], armSide, linkSide, angle, quads, prof, ringBr, armBr, linkBr, grid, ringPts: pts(ring, -900, 900, 'ring'), armPts: pts(arm, 0, 900, 'end'), linkPts: pts(link, 0, 900, 'start'), railPts, otherPts }, null, 1));
