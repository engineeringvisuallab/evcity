// ROADFIX step 2: re-route every R6/R4/R2 line that has a HILL / radius / building / rail-near problem. Read only on src/; writes docs/roadfix_result.json
import { readFileSync, writeFileSync } from 'fs';
import { LIMIT, metrics, plen, resamplePts, f0, hyp } from './roadfix-lib';
import { lat2 } from './roadfix-lat2';
import { headIdx } from './roadfix-lattice';
const J = JSON.parse(readFileSync('docs/map_all_roads_v2.json', 'utf8'));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null; const kinds = (process.env.KINDS || 'HILL,R,BLD,RAILNEAR').split(',');
const problems = (pts: number[][], cls: number) => { const m = metrics(pts, cls); const L = LIMIT[cls]; const p: string[] = [];
  if (!m.prof.ok) p.push('HILL'); if (m.minR < L.rmin) p.push('R'); if (m.bldPts > 0) p.push('BLD');
  if (m.railNearRuns.some((q) => !m.railCross.some((c) => c.at >= q.s0 - 20 && c.at <= q.s1 + 20))) p.push('RAILNEAR'); return { p, m }; };
const at = (pts: number[][], s: number): number[] => { let c = 0; for (let i = 1; i < pts.length; i++) { const l = hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (c + l >= s) { const t = (s - c) / l; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; } c += l; } return pts[pts.length - 1]; };
function dp(p: number[][], tol: number): number[][] { if (p.length < 3) return p; let md = 0, mi = 0; const a = p[0], b = p[p.length - 1], bx = b[0] - a[0], bz = b[1] - a[1], bl = hyp(bx, bz) || 1;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((p[i][0] - a[0]) * bz - (p[i][1] - a[1]) * bx) / bl; if (d > md) { md = d; mi = i; } }
  if (md <= tol) return [a, b]; return [...dp(p.slice(0, mi + 1), tol).slice(0, -1), ...dp(p.slice(mi), tol)]; }
function relax(p: number[][], it: number): number[][] { let q = resamplePts(p, 10).map((v) => [v[0], v[1]]); for (let k = 0; k < it; k++) { const n = q.map((v) => [v[0], v[1]]); for (let i = 2; i < q.length - 2; i++) { n[i][0] = (q[i - 2][0] + 2 * q[i - 1][0] + 2 * q[i][0] + 2 * q[i + 1][0] + q[i + 2][0]) / 8; n[i][1] = (q[i - 2][1] + 2 * q[i - 1][1] + 2 * q[i][1] + 2 * q[i + 1][1] + q[i + 2][1]) / 8; } q = n; } return q; }
const res: any[] = []; let nP = 0, nF = 0; const byCls: Record<number, number[]> = { 6: [0, 0], 4: [0, 0], 2: [0, 0] };
for (const r of J.roads) {
  if (only && !only.includes(r.id)) continue; const cls = r.cls as number; const L = LIMIT[cls];
  const base = problems(r.pts, cls); const bp = base.p.filter((k) => kinds.includes(k)); if (!bp.length) continue; nP++; byCls[cls][0]++;
  const tot = plen(r.pts); const FULL = !!process.env.FULL; const A = FULL ? 0 : 45, ea = FULL ? r.pts[0] : at(r.pts, Math.min(A, tot / 3)), eb = FULL ? r.pts[r.pts.length - 1] : at(r.pts, Math.max(tot - A, (2 * tot) / 3)); const t0 = FULL ? at(r.pts, 20) : ea, t1 = FULL ? at(r.pts, tot - 20) : eb;
  const head = r.pts.filter((_: any, i: number) => i === 0).concat([ea]); const tail = [eb, r.pts[r.pts.length - 1]]; let best: any = null; let why = 'no path';
  const sAng = Math.atan2(t0[1] - r.pts[0][1], t0[0] - r.pts[0][0]); const eAng = Math.atan2(r.pts[r.pts.length - 1][1] - t1[1], r.pts[r.pts.length - 1][0] - t1[0]); const sh = 0; const eh = ((Math.round((eAng - sAng) / (Math.PI / 12)) % 24) + 24) % 24; const eT = [Math.cos(eAng), Math.sin(eAng)];
  outer: for (const pad of (process.env.PADS ? process.env.PADS.split(',').map(Number) : [400, 900])) for (const frac of [1]) { const p = lat2(ea, eb, { cls, pad, maxNodes: process.env.MAXN ? +process.env.MAXN : undefined, startHead: sh, endHead: eh, baseAng: sAng, endTan: eT }); if (!p) { why = 'no profile-feasible path in +-' + pad + ' m (' + JSON.stringify((globalThis as any).__lat) + ')'; continue; }
    for (const it of [0, 4, 12, 30]) { const mid = it ? relax(p, it) : p; const line = FULL ? mid : [head[0], ...mid, tail[1]]; if (plen(line) > 4 * tot + 400) { why = 'too long'; continue; } const v = problems(line, cls); const left = v.p.filter((k) => kinds.includes(k)); why = 'frac ' + frac + ' still ' + left.join('+'); if (!left.length) { best = { line, pad, frac, it, len: plen(line) }; break outer; } } }
  if (best) { nF++; byCls[cls][1]++; res.push({ id: r.id, cls, was: bp, old_len: Math.round(tot), new_len: Math.round(best.len), frac: best.frac, pts: best.line.map((q: number[]) => [+q[0].toFixed(3), +q[1].toFixed(3)]) }); }
  console.log(' ', r.id.padEnd(9), 'cls', cls, bp.join('+').padEnd(14), best ? `FIXED ${f0(tot)} -> ${f0(best.len)} m (frac ${best.frac}, relax ${best.it})` : 'NOT FIXED: ' + why);
}
console.log(`RESULT: ${nP} with a problem, FIXED ${nF}, NOT FIXED ${nP - nF}`); for (const c of [6, 4, 2]) console.log(`  R${c}: ${byCls[c][0]} with a problem, fixed ${byCls[c][1]}`);
writeFileSync(process.env.OUT || 'docs/roadfix_result.json', JSON.stringify(res));
