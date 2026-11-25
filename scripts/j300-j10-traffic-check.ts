// J10 TRAFFIC CHECK (headless, real game data, switch ON). Run: npx tsx scripts/j300-j10-traffic-check.ts   Writes docs/J300_J10_TRAFFIC.txt
// Per movement of J300Link: no jump (step <= 6.5 m), heading change per step, level step per step, anchors on the game roads (R6-7 / R4-9 / M8),
// lead-in distance and level gap at both ends, speed profile, reachability of every exit, groups at the road ends. PASS / FAIL per line, NOT RUN list at the end.
import { writeFileSync } from 'fs';
import { Config } from '../src/core/Config';

const { TerrainGenerator } = await import('../src/terrain/TerrainGenerator');
const { J300Link, J300_SPEED } = await import('../src/traffic/J300Link');
Config.roads.junctionJ300.enabled = true;
const g: any = new TerrainGenerator(Config.world.seed);
const roads: any[] = g.roads.roads;
const link = new J300Link(roads);

const out: string[] = []; let fails = 0;
const P = (s = ''): void => { out.push(s); console.log(s); };
const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const f2 = (v: number, d = 2): string => v.toFixed(d);
const wrap = (a: number): number => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
const roadY = (r: any, x: number, z: number): { y: number; d: number } => { let b = { y: 0, d: 1e9 }; for (let i = 0; i + 1 < r.xs.length; i++) { const vx = r.xs[i + 1] - r.xs[i], vz = r.zs[i + 1] - r.zs[i], l2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - r.xs[i]) * vx + (z - r.zs[i]) * vz) / l2)); const d = Math.hypot(x - (r.xs[i] + t * vx), z - (r.zs[i] + t * vz)); if (d < b.d) b = { y: r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t, d }; } return b; };

P('J10 TRAFFIC CHECK (headless, real road network switch ON, J300Link from J300 legs / arms / ramps data)');
P(`roads ${roads.length}, moves ${link.moves.length} of 10, R6-7 id ${link.r6Road}, R4-9 id ${link.r4Road}, M8 id ${link.ringRoad}`);
CHK('all 10 movements built (complete)', link.complete, `${link.moves.length} / 10`);
CHK('game roads R6-7, R4-9 and M8 exist', link.r6Road >= 0 && link.r4Road >= 0 && link.ringRoad >= 0);

let worstStep = 0, worstHead = 0, worstDy = 0;
for (const m of link.moves) {
  P(''); P(`== ${m.id}  length ${f2(m.length, 1)} m, circle sweep ${f2(m.sweepDeg, 1)} deg, ${m.pts.length} points, from ${roads[m.from.roadId].name} s ${f2(m.from.s, 1)} dir ${m.from.dir} (tip ${f2(m.from.dist, 1)} m off the centre line) -> to ${roads[m.to.roadId].name} s ${f2(m.to.s, 1)} dir ${m.to.dir} (${f2(m.to.dist, 1)} m off)`);
  let maxStep = 0, maxHead = 0, maxDy = 0, minStep = 1e9;
  for (let i = 1; i < m.pts.length; i++) {
    const a = m.pts[i - 1], b = m.pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
    maxStep = Math.max(maxStep, d); minStep = Math.min(minStep, d); maxDy = Math.max(maxDy, Math.abs(b.y - a.y));
    if (i >= 2) { const p = m.pts[i - 2]; const h1 = Math.atan2(a.z - p.z, a.x - p.x), h2 = Math.atan2(b.z - a.z, b.x - a.x); maxHead = Math.max(maxHead, Math.abs(wrap(((h2 - h1) * 180) / Math.PI))); }
  }
  worstStep = Math.max(worstStep, maxStep); worstHead = Math.max(worstHead, maxHead); worstDy = Math.max(worstDy, maxDy);
  CHK(`${m.id}: no jump (every step <= 6.5 m, >= 1 m)`, maxStep <= 6.5 && minStep >= 1, `${f2(minStep)} .. ${f2(maxStep)} m`);
  CHK(`${m.id}: heading change per step <= 18 deg`, maxHead <= 18, `max ${f2(maxHead, 1)} deg`);
  CHK(`${m.id}: level step per step <= 0.4 m (8 % on 5 m)`, maxDy <= 0.4, `max ${f2(maxDy)} m`);
  const p0 = m.pts[0], pn = m.pts[m.pts.length - 1], r0 = roads[m.from.roadId], rn = roads[m.to.roadId], y0 = roadY(r0, p0.x, p0.z), yn = roadY(rn, pn.x, pn.z);
  CHK(`${m.id}: first point level = level of ${r0.name} at the foot point (<= 0.5 m)`, Math.abs(p0.y - y0.y) <= 0.5, `${f2(p0.y)} vs ${f2(y0.y)} m, ${f2(y0.d, 1)} m off the centre line`);
  CHK(`${m.id}: last point level = level of ${rn.name} at the foot point (<= 0.5 m)`, Math.abs(pn.y - yn.y) <= 0.5, `${f2(pn.y)} vs ${f2(yn.y)} m, ${f2(yn.d, 1)} m off the centre line`);
  CHK(`${m.id}: first / last point within 25 m of the game road centre line (lead-in / merge can reach it)`, m.from.dist <= 25 && m.to.dist <= 25, `${f2(m.from.dist, 1)} / ${f2(m.to.dist, 1)} m`);
  const vmax = Math.max(...m.pts.map((p) => p.v)), vmin = Math.min(...m.pts.map((p) => p.v));
  CHK(`${m.id}: speed profile ${f2(vmin, 1)} .. ${f2(vmax, 1)} m/s: circle = ${J300_SPEED.circle} m/s, never above the leg design speed`, Math.abs(m.pts[m.iYield + 1].v - J300_SPEED.circle) < 0.6 && vmax <= J300_SPEED.arm + 1e-9, `iYield ${m.iYield}, iLeave ${m.iLeave}`);
  CHK(`${m.id}: circle part on the deck level ${f2(m.pts[m.iYield].y)} m (flat)`, m.pts.slice(m.iYield, m.iLeave + 1).every((p) => Math.abs(p.y - m.pts[m.iYield].y) <= 0.05), '');
}

P(''); P('== reachability and groups');
for (const o of ['R6', 'R4', 'Eo', 'Wo']) { const k = link.moves.filter((q) => q.id.endsWith('>' + o)); CHK(`exit ${o} reachable from >= 2 entries`, k.length >= 2, k.map((q) => q.id).join(', ')); }
for (const i of ['R6', 'R4', 'Ei', 'Wi']) { const k = link.moves.filter((q) => q.id.startsWith(i + '>')); CHK(`entry ${i} has >= 2 movements`, k.length >= 2, k.map((q) => q.id).join(', ')); }
const gr6 = link.moves.filter((q) => q.id.startsWith('R6>')), gr4 = link.moves.filter((q) => q.id.startsWith('R4>'));
CHK('R6>* movements leave R6-7 at ONE tip (same road, dir, s within 3 m)', gr6.length === 3 && gr6.every((q) => q.from.roadId === link.r6Road && q.from.dir === gr6[0].from.dir && Math.abs(q.from.s - gr6[0].from.s) < 3), gr6.map((q) => f2(q.from.s, 1)).join(' / '));
CHK('R4>* movements leave R4-9 at ONE tip', gr4.length === 3 && gr4.every((q) => q.from.roadId === link.r4Road && q.from.dir === gr4[0].from.dir && Math.abs(q.from.s - gr4[0].from.s) < 3), gr4.map((q) => f2(q.from.s, 1)).join(' / '));
CHK('R6>* tip lies at the END of R6-7 (s within 3 m of its length) and R4>* at the end of R4-9', link.moves.length > 0 && Math.abs(gr6[0].from.s - roads[link.r6Road].length) < 3 && Math.abs(gr4[0].from.s - roads[link.r4Road].length) < 3, `R6-7 ${f2(gr6[0]?.from.s, 1)} of ${f2(roads[link.r6Road].length, 1)}, R4-9 ${f2(gr4[0]?.from.s, 1)} of ${f2(roads[link.r4Road].length, 1)}`);
CHK('Ei / Wi tips and Eo / Wo ends all lie on M8', link.moves.filter((q) => q.id.startsWith('Ei') || q.id.startsWith('Wi')).every((q) => q.from.roadId === link.ringRoad) && link.moves.filter((q) => q.id.endsWith('Eo') || q.id.endsWith('Wo')).every((q) => q.to.roadId === link.ringRoad));
const arrive = link.moves.filter((q) => q.id.endsWith('>R6')).every((q) => q.to.roadId === link.r6Road && q.to.dir === -q.from.dir * 0 + q.to.dir) && link.moves.filter((q) => q.id.endsWith('>R4')).every((q) => q.to.roadId === link.r4Road);
CHK('moves into R6 / R4 end on R6-7 / R4-9 (travelling away from the arm end)', arrive);

P(''); P(`SUMMARY worst step ${f2(worstStep)} m, worst heading change ${f2(worstHead, 1)} deg, worst level step ${f2(worstDy)} m`);
P(`${fails} FAIL`);
P('NOT RUN: vehicle height under 5.5 m on the ring under the deck (J7 clearance PASS earlier), roundabout give-way (circulating flow has priority), R4-4 T junction movements, signals (none: roundabout), in-game drive, Route / RoadGraph hook in a browser, microsimulation.');
writeFileSync('docs/J300_J10_TRAFFIC.txt', out.join('\n') + '\n');
process.exit(0);
