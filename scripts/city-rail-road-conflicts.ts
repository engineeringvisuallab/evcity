// STEP CRR-5a (headless, numbers only, nothing in src/ changed): which EXISTING roads does each of the 5 rail-corridor roads touch?
// Run: npx tsx scripts/city-rail-road-conflicts.ts docs   (needs docs/city_rail_road_reach.json (version crr1b) + docs/city_rail_road_loops.json (reach crr1b);
//      writes docs/city_rail_road_conflicts.json + docs/STEP_CRR5A_OUTPUT.txt)
// The new road centreline of a line = the rail centreline from its start up to the leave point s_t (CRR-1b path) + the loop (CRR-2b best candidate, every 5 m).
// Existing roads = the finished game network (TerrainGenerator, incl. J1 arms, R6 / R4 / R2 / C / L lines, ring, earth tracks).
// For every existing road: centreline crossings (point, which side is on a bridge, heights), footprint overlap (asphalt + shoulder of both roads), nearest gap, junction pads, and what the contact is meant to be
// (J1 junction / small-road node of CRR-1b / T target of CRR-2b) or a real CONFLICT. Proposals are decided in the handoff (section 11, CRR-5a).
import fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RAIL_DESIGN as D } from '../src/rail/RailPlan';

const dir = process.argv[2] ?? 'docs';
const HALF = 11.2; // new road: 2 x 3.5 m lanes + 1.0 m shoulder from the rail line (CRR-1)
const NEAR_GAP = 25; // list roads whose edge is closer than this (m) to the new road edge
Config.roads.junctionJ1Arms.enabled = true;
const gen: any = new TerrainGenerator(Config.world.seed);
const net = gen.roads, sc = gen.makeSample(), rail = gen.rail;
const ground = (x: number, z: number): number => { gen.sample(x, z, sc); return sc.h; };
const R1 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_reach.json', 'utf8'));
const L2 = JSON.parse(fs.readFileSync(dir + '/city_rail_road_loops.json', 'utf8'));
if (R1.version !== 'crr1b' || L2.reach !== 'crr1b') throw new Error('needs the CRR-1b reach json and the CRR-2b loops json');

interface Rd { name: string; lanes: number; kind: string; tier: number; earth: boolean; xs: ArrayLike<number>; zs: ArrayLike<number>; ys: ArrayLike<number>; bridgeOf: ArrayLike<number>; hw: number; sh: number; id: number }
const roads: Rd[] = net.roads.filter((r: any) => r.xs.length > 1).map((r: any) => ({ id: r.id, name: r.name, lanes: r.lanes, kind: r.kind, tier: r.tier, earth: !!r.earth, xs: r.xs, zs: r.zs, ys: r.ys, bridgeOf: r.bridgeOf, hw: r.planHalfWidth, sh: r.shoulder }));

const segPt = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(px - ax - t * vx, pz - az - t * vz);
};
const distTo = (x: number, z: number, r: Rd): { d: number; k: number } => {
  let m = Infinity, kk = 0;
  for (let k = 0; k + 1 < r.xs.length; k++) { if (Math.abs(r.xs[k] - x) > 400 && Math.abs(r.xs[k + 1] - x) > 400) continue; const d = segPt(x, z, r.xs[k], r.zs[k], r.xs[k + 1], r.zs[k + 1]); if (d < m) { m = d; kk = k; } }
  return { d: m, k: kk };
};
const cross = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): { x: number; z: number; t: number } | null => {
  const d1x = bx - ax, d1z = bz - az, d2x = dx - cx, d2z = dz - cz, den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den, u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { x: ax + t * d1x, z: az + t * d1z, t } : null;
};

const out: any = { rules: { HALF, NEAR_GAP }, lines: {} };
const log: string[] = []; const P = (m: string): void => { console.log(m); log.push(m); };
P(`CRR-5a: existing roads touched by the 5 corridor roads (new half width ${HALF} m, list gap < ${NEAR_GAP} m edge to edge)`);
for (const id of Object.keys(R1.lines)) {
  const r1 = R1.lines[id], g = L2.lines[id].good[0];
  const n = Math.max(2, Math.round((g.st - r1.start) / 10) + 1);
  const along: number[][] = r1.path.slice(0, n).map((p: number[]) => [p[0], p[1]]);
  const loop: number[][] = g.path.map((p: number[]) => [p[0], p[1]]);
  const line = [...along, ...loop.slice(1)];
  // densify to 5 m with the along-rail s (0 at the line start)
  const pts: { x: number; z: number; s: number }[] = []; let cum = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const L = Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]), m = Math.max(1, Math.ceil(L / 5));
    for (let k = 0; k < m; k++) pts.push({ x: line[i][0] + ((line[i + 1][0] - line[i][0]) * k) / m, z: line[i][1] + ((line[i + 1][1] - line[i][1]) * k) / m, s: cum + (L * k) / m });
    cum += L;
  }
  pts.push({ x: line[line.length - 1][0], z: line[line.length - 1][1], s: cum });
  const total = cum, loopS = cum - loop.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - loop[i - 1][0], p[1] - loop[i - 1][1]) : 0), 0);
  const items: any[] = [];
  for (const r of roads) {
    // centreline crossings
    const xs: any[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      if (Math.abs(r.xs[0] - pts[i].x) > 5000) continue;
      for (let k = 0; k + 1 < r.xs.length; k++) {
        if (Math.max(pts[i].x, pts[i + 1].x) < Math.min(r.xs[k], r.xs[k + 1]) - 1 || Math.min(pts[i].x, pts[i + 1].x) > Math.max(r.xs[k], r.xs[k + 1]) + 1) continue;
        const c = cross(pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, r.xs[k], r.zs[k], r.xs[k + 1], r.zs[k + 1]);
        if (c) { const s = pts[i].s + c.t * (pts[i + 1].s - pts[i].s); if (!xs.some((q) => Math.abs(q.s - s) < 20)) xs.push({ s: Math.round(s), x: Math.round(c.x), z: Math.round(c.z), onBridge: r.bridgeOf[k] >= 0, roadY: +r.ys[k].toFixed(1), groundY: +ground(c.x, c.z).toFixed(1) }); }
      }
    }
    // nearest gap along the line, overlap range, near range
    let minGap = Infinity, atS = 0, ovS0 = Infinity, ovS1 = -Infinity, nrS0 = Infinity, nrS1 = -Infinity, ovLen = 0;
    for (const p of pts) {
      const { d } = distTo(p.x, p.z, r); const gap = d - HALF - r.hw - r.sh;
      if (gap < minGap) { minGap = gap; atS = p.s; }
      if (gap < 0) { ovS0 = Math.min(ovS0, p.s); ovS1 = Math.max(ovS1, p.s); ovLen += 5; }
      if (gap < NEAR_GAP) { nrS0 = Math.min(nrS0, p.s); nrS1 = Math.max(nrS1, p.s); }
    }
    if (!xs.length && minGap >= NEAR_GAP) continue;
    // the intended contact
    let role = 'CONFLICT';
    const nodeHit = (r1.nodes ?? []).find((q: any) => q.road === r.name && xs.some((c) => Math.abs(c.s - q.s) < 30));
    const tHit = r.name === g.target && Math.hypot(pts[pts.length - 1].x - g.T[0], pts[pts.length - 1].z - g.T[1]) < 15;
    if (nodeHit) role = nodeHit.lanes >= 6 ? 'J1 junction (rule 5)' : 'small-road node on the rail (CRR-3)';
    else if (tHit) role = 'T target of the loop (CRR-2b)';
    if (role === 'CONFLICT' && !xs.length && !ovLen) role = 'near only (no contact, no action)';
    // pier check at every crossing node (the crossing road passes BETWEEN two rail piers; section 1.0 m shoulder, skew angle from the two directions)
    const pe = rail.piers.filter((q: any) => q.edgeId === id).map((q: any) => q.s as number).sort((a: number, b: number) => a - b);
    for (const c of xs) {
      const i = Math.max(0, Math.min(pts.length - 2, pts.findIndex((q) => q.s >= c.s) - 1)); const k = distTo(c.x, c.z, r).k;
      const ax = pts[i + 1].x - pts[i].x, az = pts[i + 1].z - pts[i].z, bx = r.xs[k + 1] - r.xs[k], bz = r.zs[k + 1] - r.zs[k];
      const ang = Math.acos(Math.min(1, Math.abs(ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1)));
      const need = (r.lanes * 3.5 / 2 + 1.0 + D.pierSize / 2 + D.pierRoadGap) / Math.max(0.2, Math.sin(ang));
      const prev = pe.filter((v: number) => v <= c.s).pop(), next = pe.find((v: number) => v > c.s);
      const steel = rail.steelSpans.some((q: any) => q.edgeId === id && c.s >= q.s0 && c.s <= q.s1);
      Object.assign(c, { angDeg: Math.round((ang * 180) / Math.PI), pierBefore: prev == null ? null : Math.round(c.s - prev), pierAfter: next == null ? null : Math.round(next - c.s), pierNeed: Math.round(need), steelSpan: steel, pierOk: steel || ((prev == null || c.s - prev >= need) && (next == null || next - c.s >= need)) });
    }
    items.push({ road: r.name, lanes: r.lanes, kind: r.kind, tier: r.tier, earth: r.earth, role, crossings: xs, minGap: +minGap.toFixed(1), minGapAtS: Math.round(atS), overlapM: ovLen, overlapS: ovLen ? [Math.round(ovS0), Math.round(ovS1)] : null, nearS: [Math.round(nrS0), Math.round(nrS1)] });
  }
  // junction pads near the new road
  const pads: any[] = [];
  for (const p of net.pads) {
    let m = Infinity, at = 0; for (const q of pts) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < m) { m = d; at = q.s; } }
    if (m < p.rCore + HALF + 10) pads.push({ x: Math.round(p.x), z: Math.round(p.z), rCore: +p.rCore.toFixed(0), dist: +m.toFixed(0), atS: Math.round(at) });
  }
  out.lines[id] = { path: pts.filter((_, i) => i % 2 === 0).map((q) => [Math.round(q.x), Math.round(q.z)]), start: r1.start, leaveS: g.st, lengthM: Math.round(total), loopFromS: Math.round(loopS), items, pads };
  P(`${id}: along rail s ${r1.start}..${g.st}, loop ${g.len} m, line ${Math.round(total)} m, target ${g.target}`);
  for (const it of items) {
    const cx = it.crossings.map((c: any) => `(${c.x}, ${c.z}) s ${c.s}${c.onBridge ? ' ARM/ROAD ON BRIDGE' : ''} roadY ${c.roadY} ground ${c.groundY}, angle ${c.angDeg} deg, piers ${c.pierBefore} / ${c.pierAfter} m (need ${c.pierNeed}${c.steelSpan ? ', STEEL SPAN' : ''}) ${c.pierOk ? 'PASS' : 'FAIL'}`).join('; ');
    P(`   ${it.road} (${it.lanes} lanes${it.earth ? ', earth track' : ''}, ${it.kind}) [${it.role}] crossings: ${cx || 'none'}; nearest gap ${it.minGap} m at s ${it.minGapAtS}${it.overlapM ? `; FOOTPRINT OVERLAP ${it.overlapM} m (s ${it.overlapS})` : ''}`);
  }
  for (const p of pads) P(`   junction pad at (${p.x}, ${p.z}) core R ${p.rCore} m, ${p.dist} m from the line at s ${p.atS}`);
}
fs.writeFileSync(dir + '/city_rail_road_conflicts.json', JSON.stringify(out));
fs.writeFileSync(dir + '/STEP_CRR5A_OUTPUT.txt', log.join('\n') + '\n');
