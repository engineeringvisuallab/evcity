// ROADFIX R1: WET lines (road over water). Rule: every wet run <= SMALL m -> keep the line, mark the bridge. Longer run -> try to move the line out of the water (lattice, junction to junction); if impossible -> LONG BRIDGE (kept, reported).
// Lines that already have a tunnel / viaduct profile (roadfix.tunnel / roadfix.struct) are never moved (the structure would be lost): they only get the bridge mark. Writes docs/roadfix_wet.json (or $OUT).
import { readFileSync, writeFileSync } from 'fs';
import { LIMIT, metrics, plen, resamplePts, hyp, wetAt } from './roadfix-lib';
import { lat2 } from './roadfix-lat2';
const J = JSON.parse(readFileSync(process.env.IN || 'docs/map_all_roads_v3.json', 'utf8')); const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SMALL = +(process.env.SMALL || 60); const J1 = [-87, -277];
const at = (pts: number[][], s: number): number[] => { let c = 0; for (let i = 1; i < pts.length; i++) { const l = hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (c + l >= s) { const t = (s - c) / l; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; } c += l; } return pts[pts.length - 1]; };
const relax = (p: number[][], it: number): number[][] => { let q = resamplePts(p, 10).map((v) => [v[0], v[1]]); for (let k = 0; k < it; k++) { const n = q.map((v) => [v[0], v[1]]); for (let i = 2; i < q.length - 2; i++) { n[i][0] = (q[i - 2][0] + 2 * q[i - 1][0] + 2 * q[i][0] + 2 * q[i + 1][0] + q[i + 2][0]) / 8; n[i][1] = (q[i - 2][1] + 2 * q[i - 1][1] + 2 * q[i][1] + 2 * q[i + 1][1] + q[i + 2][1]) / 8; } q = n; } return q; };
const runsOf = (pts: number[][]): { s0: number; s1: number; len: number }[] => { const d = resamplePts(pts, 10); const o: { s0: number; s1: number; len: number }[] = []; let a = -1; for (let i = 0; i <= d.length; i++) { const w = i < d.length && wetAt(d[i][0], d[i][1]); if (w && a < 0) a = i; if (!w && a >= 0) { o.push({ s0: a * 10, s1: (i - 1) * 10, len: (i - a) * 10 }); a = -1; } } return o; };
const near = (pts: number[][], c: number[], r: number): boolean => resamplePts(pts, 20).some((p) => hyp(p[0] - c[0], p[1] - c[1]) < r);
const out: any[] = []; const cnt: Record<string, number> = { bridge: 0, moved: 0, long: 0 };
for (const r of J.roads) { if (only && !only.includes(r.id)) continue; const cls = r.cls as number; const L = LIMIT[cls]; const runs = runsOf(r.pts); if (!runs.length) continue;
  const tot = plen(r.pts); const locked = !!(r.roadfix && (r.roadfix.tunnel || r.roadfix.struct)); const maxrun = Math.max(...runs.map((q) => q.len));
  if (maxrun <= SMALL || locked) { cnt.bridge++; out.push({ id: r.id, cls, action: locked && maxrun > SMALL ? 'bridge-locked' : 'bridge', bridges: runs }); console.log(' ', r.id.padEnd(9), 'cls', cls, (locked && maxrun > SMALL ? 'BRIDGE (line has tunnel/viaduct, not moved) ' : 'BRIDGE ') + runs.map((q) => q.len).join('+') + ' m'); continue; }
  const ea = r.pts[0], eb = r.pts[r.pts.length - 1]; const t0 = at(r.pts, 20), t1 = at(r.pts, tot - 20);
  const sAng = Math.atan2(t0[1] - ea[1], t0[0] - ea[0]), eAng = Math.atan2(eb[1] - t1[1], eb[0] - t1[0]); const eh = ((Math.round((eAng - sAng) / (Math.PI / 12)) % 24) + 24) % 24; const eT = [Math.cos(eAng), Math.sin(eAng)];
  let best: any = null; let why = 'no path';
  outer: for (const pad of [400, 900]) { const p = lat2(ea, eb, { cls, pad, maxNodes: 800000, startHead: 0, endHead: eh, baseAng: sAng, endTan: eT }); if (!p) { why = 'no path in +-' + pad + ' m'; continue; }
    for (const it of [0, 4, 12, 30]) { const line = it ? relax(p, it) : p; if (plen(line) > 1.6 * tot + 250) { why = 'too long'; continue; } const m = metrics(line, cls); const wr = runsOf(line); const wm = wr.length ? Math.max(...wr.map((q) => q.len)) : 0;
      if (!m.prof.ok) { why = 'profile'; continue; } if (m.minR < L.rmin) { why = 'radius'; continue; } if (wm > SMALL) { why = 'still ' + wm + ' m of water'; continue; } best = { line, runs: wr, len: plen(line), it }; break outer; } }
  if (best) { cnt.moved++; out.push({ id: r.id, cls, action: 'moved', old_len: Math.round(tot), new_len: Math.round(best.len), pts: best.line.map((q: number[]) => [+q[0].toFixed(3), +q[1].toFixed(3)]), bridges: best.runs, near_j1: near(best.line, J1, 300) });
    console.log(' ', r.id.padEnd(9), 'cls', cls, `MOVED ${Math.round(tot)} -> ${Math.round(best.len)} m, water ${best.runs.length ? best.runs.map((q: number) => q.len).join('+') + ' m (bridge)' : 'none'}${near(best.line, J1, 300) ? '  NEAR J1' : ''}`); }
  else { cnt.long++; out.push({ id: r.id, cls, action: 'long-bridge', why, bridges: runs }); console.log(' ', r.id.padEnd(9), 'cls', cls, 'LONG BRIDGE kept ' + runs.map((q) => q.len).join('+') + ' m  (' + why + ')'); } }
console.log('WET RESULT', JSON.stringify(cnt)); writeFileSync(process.env.OUT || 'docs/roadfix_wet.json', JSON.stringify(out));
