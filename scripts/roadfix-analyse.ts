// ROADFIX step 1: read-only analysis of all 278 lines. Writes docs/roadfix_analysis.json
import { readFileSync, writeFileSync } from 'fs';
import { LIMIT, metrics, f0, RAIL_CLEAR } from './roadfix-lib';
const J = JSON.parse(readFileSync(process.env.IN || 'docs/map_all_roads_v2.json', 'utf8'));
const out: any[] = []; const cnt: Record<string, number> = {};
const only = process.env.ONLY;
for (const r of J.roads) {
  if (only && !r.id.startsWith(only)) continue;
  const L = LIMIT[r.cls]; const tn = r.roadfix && r.roadfix.tunnel; const m = metrics(r.pts, r.cls, tn ? (tn.poly ? tn.poly.slice(1).map((q: number[], i: number) => [tn.poly[i], q]) : [[tn.a, tn.b]]) : []); const pr: string[] = [];
  const stc = r.roadfix && r.roadfix.struct; if (!m.prof.ok && !stc) pr.push('HILL@' + f0(m.prof.failAt));
  if (m.minR < L.rmin) pr.push('R' + f0(m.minR));
  const grade = (r.roadfix && r.roadfix.railx) ? [] : m.railCross.filter((c) => c.above < 9);
  if (grade.length) pr.push('RAILX' + grade.length);
  const near = m.railNearRuns.filter((q) => !m.railCross.some((c) => c.at >= q.s0 - 20 && c.at <= q.s1 + 20));
  if (near.length) pr.push('RAILNEAR');
  const brg = r.roadfix && r.roadfix.bridges; if (m.wetLen > 0 && !brg) pr.push('WET' + f0(m.wetLen));
  if (m.bldPts > 0) pr.push('BLD' + m.bldPts);
  pr.forEach((p) => { const k = p.replace(/[0-9@]+/g, ''); cnt[k] = (cnt[k] || 0) + 1; });
  out.push({ id: r.id, cls: r.cls, len: Math.round(m.len), problems: pr, bridge_m: brg ? brg.reduce((q: number, b: any) => q + b.len, 0) : undefined, struct: stc ? { tunnel_m: stc.tunnel_m, viaduct_m: stc.viaduct_m } : undefined, maxG: +m.maxNatGrade.toFixed(3), fencedLen: m.fencedLen });
  console.log(r.id.padEnd(10), 'cls', r.cls, f0(m.len).padStart(5) + 'm', pr.join(' ') || 'ok');
}
console.log('COUNTS', JSON.stringify(cnt), 'with problem', out.filter((o) => o.problems.length).length, '/', out.length);
writeFileSync(process.env.OUT || 'docs/roadfix_analysis.json', JSON.stringify(out));
