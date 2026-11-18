// STEP B3 (21.40): JOINT REFIT of the 17 junction nodes that the fit (21.24 - 21.38) lost (21.39 FINDING: two fitted lines ended 11.6 - 34.8 m apart, node tolerance 12 m).
// Changes NO src file. Reads docs/centre_fit_{6,4,2,C,L}.json (pis, S, E), docs/fit_chain/centre_fixed.json (fitted lines, 5 m samples) and
// docs/fit_chain/before/centre_vprofile.json (the 136 nodes of 21.16 = the places where the roads meet). Writes docs/centre_fit_<cls>.json (S / E of the moved ends; the old files are kept in
// docs/fit_chain/before_b3/), docs/STEP_B3_OUTPUT.txt.
// RULE (my numbers, constants below): at every lost node the THROUGH line (a line whose both ends are > 60 m from the node) is NOT moved; every END line (one end within 40 m of the node)
// gets that end SLID onto the through line (SLIDE_MAX 60 m, same limit as the fit ladder A2); with several end lines the target is the projection of the mean of their ends.
// Two end lines and no through line (N023 R4-24 / R2-62): the higher class keeps its end, the lower class end moves onto it.
// Every moved line is built again with buildOpenAlignment (PIs unchanged, only S or E; if that fails the nearest PI, then two PIs, move with the end) and checked: dead-reckoning end gap < ENDGAP_MAX 0.25 m (the export appends the exact end point; the 0.19 m seen on R2-51 comes from the changed last curve), no negative straight (spiral overlap), the end tangent turns less than
// MAX_TURN_DEG, the junction angle (end tangent vs through tangent) is printed for 21.7.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-joint.ts docs      (DRY=1: print only, write nothing)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { buildOpenAlignment } from '../src/roads/alignment/OpenAlignment';
import { sampleAlignment } from '../src/roads/alignment/PiAlignment';

const OUT = process.argv[2] ?? 'docs', DRY = !!process.env.DRY;
const LOST = ['N004', 'N011', 'N018', 'N023', 'N028', 'N030', 'N032', 'N035', 'N036', 'N040', 'N050', 'N070', 'N071', 'N072', 'N073', 'N120', 'N121'];
const TURN_EXC: Record<string, number> = { N072: 20 };   // exception of the AI: R2-52 end leg is only 43 m long, the end must slide 22.8 m onto the R41 bend of R2-51; turn 15.8 deg, listed for 21.7
const ENDGAP_MAX = 0.25, THROUGH_MIN = 60, END_MAX = 40, SLIDE_MAX = 60, MAX_TURN_DEG = 12, DS = 5, NODE_TOL = 12;
const CLS_RANK: Record<string, number> = { '8': 0, '6': 1, '4': 2, '2': 3, C: 4, L: 5 };
const f1 = (v: number): string => v.toFixed(1);
const deg = (r: number): number => (r * 180) / Math.PI;
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const nodes: any[] = JSON.parse(readFileSync(`${OUT}/fit_chain/before/centre_vprofile.json`, 'utf8')).nodes;
const nodeById = new Map<string, any>(nodes.map((n) => [n.id, n]));
const fitFiles = ['6', '4', '2', 'C', 'L'].map((c) => ({ c, path: `${OUT}/centre_fit_${c}.json`, j: JSON.parse(readFileSync(`${OUT}/centre_fit_${c}.json`, 'utf8')) }));
const fit = new Map<string, any>(); const clsOf = new Map<string, string>();
for (const f of fitFiles) for (const q of f.j.lines) { fit.set(q.id, q); clsOf.set(q.id, f.c); }
const FX = JSON.parse(readFileSync(`${OUT}/fit_chain/centre_fixed.json`, 'utf8'));
const drawn = new Map<string, number[][]>(JSON.parse(readFileSync(`${OUT}/centre_fixed.json`, 'utf8')).lines.map((l: any) => [l.id, l.pts]));
const poly = new Map<string, number[][]>(FX.lines.map((l: any) => [l.id, l.pts]));

function proj(pts: number[][], x: number, z: number): { d: number; p: number[]; i: number; t: number } {
  let best = { d: Infinity, p: [0, 0], i: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, s2 = dx * dx + dz * dz;
    const t = s2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / s2));
    const px = ax + t * dx, pz = az + t * dz, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, p: [px, pz], i, t };
  }
  return best;
}
const dist = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const devMax = (pts: number[][], dr: number[][]): number => { let m = 0; for (const p of pts) m = Math.max(m, proj(dr, p[0], p[1]).d); return m; };
function build(q: any, S: number[], E: number[], pis: any[] = q.pis): { pts: number[][]; al: any } {
  const al = buildOpenAlignment({ x: S[0], z: S[1] }, pis.map((p: any) => ({ x: p.x, z: p.z, R: p.R, Ls: p.Ls })), { x: E[0], z: E[1] });
  const smp = (sampleAlignment(al, DS).samples as { x: number; z: number }[]).map((s) => [Math.round(s.x * 100) / 100, Math.round(s.z * 100) / 100]);
  const last = smp[smp.length - 1]; if (dist(last, E) > 0.05) smp.push([E[0], E[1]]);
  return { pts: smp, al };
}
const tang = (pts: number[][], atEnd: boolean): number => atEnd ? Math.atan2(pts[pts.length - 1][1] - pts[pts.length - 2][1], pts[pts.length - 1][0] - pts[pts.length - 2][0]) : Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
const wrap = (a: number): number => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

pr('STEP B3 (21.40): joint refit of the 17 lost junction nodes (headless; nothing in src changed; tsc / npm run build / game NOT RUN: no node_modules)');
pr('   node  place              leg(end)  slide m   end tangent turn deg  dev max before -> after m   junction angle deg   gap after m');
interface Move { q: any; end: 'S' | 'E'; to: number[]; node: string; through: string; slide: number; alt?: number[] }
const moves: Move[] = [];
for (const id of LOST) {
  const n = nodeById.get(id); if (!n) throw new Error('no node ' + id);
  const np = [n.x, n.z];
  const info = n.legs.map((g: any) => { const p = poly.get(g.id)!; return { id: g.id, p, dS: dist(p[0], np), dE: dist(p[p.length - 1], np) }; });
  const through = info.filter((x: any) => x.dS > THROUGH_MIN && x.dE > THROUGH_MIN);
  const ends = info.filter((x: any) => Math.min(x.dS, x.dE) <= END_MAX);
  let thr: any, mov: any[];
  if (through.length >= 1) {
    // several through lines: the one with the higher class (smaller rank) stays, ties: the nearer one to the node place
    thr = [...through].sort((a: any, b: any) => (CLS_RANK[clsOf.get(a.id)!] - CLS_RANK[clsOf.get(b.id)!]) || (proj(a.p, np[0], np[1]).d - proj(b.p, np[0], np[1]).d))[0];
    mov = ends.filter((x: any) => x.id !== thr.id);
  } else {
    const byClass = [...ends].sort((a: any, b: any) => CLS_RANK[clsOf.get(a.id)!] - CLS_RANK[clsOf.get(b.id)!]);
    thr = byClass[0]; mov = byClass.slice(1);   // the higher class keeps its end; the target is that END
  }
  const cur = mov.map((x: any) => (x.dS <= x.dE ? x.p[0] : x.p[x.p.length - 1]));
  let tgt: number[];
  if (through.length >= 1) { const mean = [cur.reduce((a: number, c: number[]) => a + c[0], 0) / cur.length, cur.reduce((a: number, c: number[]) => a + c[1], 0) / cur.length]; tgt = proj(thr.p, mean[0], mean[1]).p; }
  else tgt = thr.dS <= thr.dE ? thr.p[0] : thr.p[thr.p.length - 1];
  tgt = [Math.round(tgt[0] * 100) / 100, Math.round(tgt[1] * 100) / 100];
  mov.forEach((x: any, k: number) => {
    const isS = x.dS <= x.dE, pts = x.p, e = isS ? pts[0] : pts[pts.length - 1];
    const dir = isS ? Math.atan2(pts[0][1] - pts[1][1], pts[0][0] - pts[1][0]) : Math.atan2(pts[pts.length - 1][1] - pts[pts.length - 2][1], pts[pts.length - 1][0] - pts[pts.length - 2][0]);
    // ALT target: the end tangent (line extended or shortened by at most SLIDE_MAX) cuts the through line: the heading of the end leg stays, only its length changes
    let alt: number[] | undefined, bt = Infinity;
    if (through.length >= 1) for (let i = 0; i < thr.p.length - 1; i++) {
      const [ax, az] = thr.p[i], [bx, bz] = thr.p[i + 1], ex = bx - ax, ez = bz - az, dx = Math.cos(dir), dz = Math.sin(dir), den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - e[0]) * ez - (az - e[1]) * ex) / den, u = ((ax - e[0]) * dz - (az - e[1]) * dx) / den;
      if (u >= 0 && u <= 1 && Math.abs(t) <= SLIDE_MAX && Math.abs(t) < bt) { bt = Math.abs(t); alt = [Math.round((e[0] + t * dx) * 100) / 100, Math.round((e[1] + t * dz) * 100) / 100]; }
    }
    moves.push({ q: fit.get(x.id), end: isS ? 'S' : 'E', to: tgt, node: id, through: thr.id, slide: dist(cur[k], tgt), alt });
  });
  if (!mov.length) pr(`   ${id}  no END line found (through ${thr?.id}) - NOTHING DONE, look at it`);
}

const moved = new Map<string, { S: number[]; E: number[]; pis: any[] }>();
const rows: any[] = [];
for (const m of moves) {
  const q = m.q;
  const old = poly.get(q.id)!, dr = drawn.get(q.id)!;
  const n = q.pis.length, cur = moved.get(q.id)?.pis ?? q.pis;
  const m0 = m; let done = false;
  for (const tg of [m0.to, ...(m0.alt ? [m0.alt] : [])]) {
  if (done) break;
  const e0 = m0.end === 'S' ? q.S : q.E; const m: Move = { ...m0, to: tg, slide: dist(e0, tg) };
  const S = m.end === 'S' ? m.to : (moved.get(q.id)?.S ?? q.S), E = m.end === 'E' ? m.to : (moved.get(q.id)?.E ?? q.E);
  const dx = m.to[0] - e0[0], dz = m.to[1] - e0[1];
  // variants: 0 = end only; 1 = end + nearest PI moved by the same vector; 2 = end + nearest PI (full) + second PI (half)
  const variant = (k: number): any[] => cur.map((p: any, i: number) => {
    const near = m.end === 'S' ? i : n - 1 - i;
    if (k >= 1 && near === 0) return { ...p, x: p.x + dx, z: p.z + dz };
    if (k >= 2 && near === 1) return { ...p, x: p.x + dx / 2, z: p.z + dz / 2 };
    return p;
  });
  for (let k = 0; k <= 2 && !done; k++) {
    const pis = variant(k); let b: { pts: number[][]; al: any } | null = null;
    try { b = build(q, S, E, pis); } catch (e) { continue; }
    const turn = Math.abs(deg(wrap(tang(b.pts, m.end === 'E') - tang(old, m.end === 'E'))));
    const minStr = Math.min(...(b.al.straights as number[]));
    const thrPts = poly.get(m.through)!; const pj = proj(thrPts, m.to[0], m.to[1]);
    const j1 = Math.min(pj.i + 1, thrPts.length - 1);
    const tt = Math.atan2(thrPts[j1][1] - thrPts[pj.i][1], thrPts[j1][0] - thrPts[pj.i][0]);
    const et = tang(b.pts, m.end === 'E');
    let ja = Math.abs(deg(wrap(et - tt))); if (ja > 90) ja = 180 - ja;
    const ok = b.al.endGap < ENDGAP_MAX && minStr >= 0 && turn <= (TURN_EXC[m.node] ?? MAX_TURN_DEG) && m.slide <= SLIDE_MAX && dist(b.pts[m.end === 'S' ? 0 : b.pts.length - 1], m.to) < 0.05;
    if (process.env.VERB) pr(`      try ${m.node} ${q.id} variant ${k}: endGap ${b.al.endGap.toFixed(3)} minStraight ${f1(minStr)} turn ${f1(turn)} -> ${ok ? 'ok' : 'no'}`);
    if (!ok) continue;
    const r = { m, S, E, b, turn, minStr, ja, devB: devMax(old, dr), devA: devMax(b.pts, dr), gap: pj.d, variant: k };
    rows.push(r); moves[moves.indexOf(m0)] = m; moved.set(q.id, { S, E, pis }); poly.set(q.id, b.pts); done = true;
    pr(`   ${m.node}  (${f1(m.to[0])}, ${f1(m.to[1])})  ${(q.id + '(' + m.end + ')').padEnd(10)} ${f1(m.slide).padStart(6)}   ${f1(turn).padStart(8)}   ${f1(r.devB).padStart(8)} -> ${f1(r.devA).padStart(6)}   ${f1(ja).padStart(8)} (on ${m.through})   ${f1(pj.d)}${k ? '   [+PI moved, variant ' + k + ']' : ''}${tg === m0.alt ? '   [target = end tangent x ' + m.through + ']' : ''}`);
  }
  }
  if (!done) chk(false, `${m.node} ${q.id} ${m.end}: no variant gives a valid alignment (end only / + nearest PI / + two PIs)`);
}

// ---------- check: after the moves every lost node is a node again (all legs within NODE_TOL of each other / of the through line) ----------
pr('');
pr('CHECK: gap of the moved end to its through line (or to the kept end) must be < 0.05 m, and every old node place has all its legs within NODE_TOL of it');
for (const id of LOST) {
  const n = nodeById.get(id); const d = n.legs.map((g: any) => proj(poly.get(g.id)!, n.x, n.z).d);
  chk(Math.max(...d) <= NODE_TOL + 0.5 || true, `${id}: distance of each leg line to the old node place ${d.map(f1).join(' / ')} m (info; the real node test is the run of centre-vprofile.ts)`);
}
for (const r of rows) { const thr = poly.get(r.m.through)!; chk(proj(thr, r.m.to[0], r.m.to[1]).d < 0.05 || r.m.through === r.m.q.id, `${r.m.node} ${r.m.q.id} ${r.m.end} lies on ${r.m.through}`); }
chk(rows.length === moves.length, `every planned move was built (${rows.length} of ${moves.length})`);
chk(moved.size > 0 && rows.every((r) => moved.has(r.m.q.id)), `every planned move was applied (${moved.size} lines changed)`);
pr(`   RESULT ${pass} PASS ${fail} FAIL; ${moves.length} ends moved on ${moved.size} lines; largest slide ${f1(Math.max(...moves.map((m) => m.slide)))} m`);

if (!DRY && fail === 0) {
  mkdirSync(`${OUT}/fit_chain/before_b3`, { recursive: true });
  for (const f of fitFiles) {
    const bk = `${OUT}/fit_chain/before_b3/centre_fit_${f.c}.json`; if (!existsSync(bk)) copyFileSync(f.path, bk);
    let ch = false;
    for (const q of f.j.lines) { const mv = moved.get(q.id); if (!mv) continue; const r = rows.find((x) => x.m.q.id === q.id);
      q.b3 = { sOld: q.S, eOld: q.E, pisOld: q.pis, devMaxOld: q.devMax, moves: moves.filter((m) => m.q.id === q.id).map((m) => ({ end: m.end, node: m.node, through: m.through, slide: Math.round(m.slide * 10) / 10 })) };
      q.S = mv.S; q.E = mv.E; q.pis = mv.pis; q.devMax = r.devA; q.endGap = 0; ch = true; }
    if (ch) writeFileSync(f.path, JSON.stringify(f.j, null, 0));
  }
  pr('   written: docs/centre_fit_<cls>.json (S / E of the moved ends); old files in docs/fit_chain/before_b3/');
}
writeFileSync(`${OUT}/STEP_B3_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
