// STEP B7-6 batch L-a + L-b: EXPORT the L lines L-1 .. L-4, L-7 .. L-12 (local street, V30, fitted in 21.36 - 21.38) as game data: fitted centreline every 10 m + finished heights from the vertical chain (docs/centre_vprofile.json: PVIs + parabolic curves).
// Same method as scripts/centre-c-export.ts (21.68). Writes src/roads/c/CNewLineData.ts and docs/STEP_B7_5_C_OUTPUT.txt. Changes NO other src file.
// L-5 and L-6 (half viaduct / terrace, cut with walls) and L-14 (deep cut 14 m) wait for the structure batch; L-14 / L-15 / L-16 form a 4-arm node, they wait for their own batch. L-11 overshoots R2-14 by 6 m: trimmed at the R2-14 centre line (R1).
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/centre-c-export.ts docs
import { readFileSync, writeFileSync } from 'fs';
const OUT = process.argv[2] ?? 'docs', DS = 10, LIM = 0.08;   // C class limit 8 %
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const VP = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const FX = JSON.parse(readFileSync(`${OUT}/fit_chain/centre_fixed.json`, 'utf8'));
const BATCH = ['C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-7', 'C-8', 'C-9', 'C-10', 'C-11', 'C-12', 'C-13', 'C-1'];   // C-a (21.68) + C-1 (21.72)
function levelAt(v: any, s: number): number {
  const P: number[][] = v.pvi;
  const lineY = (q: number): number => { let k = 0; while (k < P.length - 2 && P[k + 1][0] < q) k++; const [s0, y0] = P[k], [s1, y1] = P[k + 1]; return y0 + ((y1 - y0) * (q - s0)) / (s1 - s0); };
  for (let k = 1; k < P.length - 1; k++) {
    const c = (v.curves as any[]).find((q) => Math.abs(q.s - P[k][0]) < 0.2); if (!c || !(c.L > 0)) continue;
    const bvc = P[k][0] - c.L / 2, evc = P[k][0] + c.L / 2; if (s < bvc || s > evc) continue;
    const g1 = (P[k][1] - P[k - 1][1]) / (P[k][0] - P[k - 1][0]), g2 = (P[k + 1][1] - P[k][1]) / (P[k + 1][0] - P[k][0]), x = s - bvc;
    return P[k][1] - g1 * (c.L / 2) + g1 * x + ((g2 - g1) * x * x) / (2 * c.L);
  }
  return lineY(s);
}
const plen = (p: number[][]): number => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
const J = JSON.parse(readFileSync(`${OUT}/centre_junction.json`, 'utf8'));
const ST: any[] = JSON.parse(readFileSync(`${OUT}/centre_structures.json`, 'utf8')).structures;
const BRIDGE = new Set(['viaduct', 'high viaduct', 'single-span girder bridge', 'multi-span girder bridge']);   // the types the game draws as a bridge deck (registerStructures); walls, cuts, terraces, RE embankments and cut-and-cover stretches stay ground (open cut with daylight slopes), tunnel candidates are only LISTED (R12)
const NOTBR: string[] = [];
const EXTRA: Record<string, number[][]> = {};   // 21.72 ENGINEER FIX (R8 water first): bridge decks over wet runs the structure list of 21.40 does not have (wet run of the game road + 25 m each side, found by the water check of scripts/b7-cnew-check.ts)
const NOSTRUCT: string[] = [];   // lines placed earlier and looked at WITHOUT their bridge range (R4-7 viaduct 655 - 816 m): left unchanged, listed in the handoff
// B7-4d (21.67): R1 fixes by the engineer (user 2026-11-18: 'all problem you can fix because you are my engineer').
const SPLIT: Record<string, string[]> = { 'C-6': ['N122'], 'C-7': ['N123'] };
const TRIM: Record<string, { at: 'start' | 'end'; other: string }> = {};
const ALLOW: Record<string, number> = { 'C-6': 2.1 };
const BL = 80;   // m, the level pin of a trimmed end fades out over this length (grade change <= offset / BL)
const dd = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
function projPoly(P: number[][], pt: number[]): { d: number; s: number } {   // distance of pt to the polyline and the station of the foot point
  let best = { d: 1e9, s: 0 }, cum = 0;
  for (let j = 0; j + 1 < P.length; j++) { const a = P[j], b = P[j + 1], dx = b[0] - a[0], dz = b[1] - a[1], sl = dx * dx + dz * dz, sg = Math.sqrt(sl); const t = sl > 0 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dz) / sl)) : 0; const d = Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dz)); if (d < best.d) best = { d, s: cum + t * sg }; cum += sg; }
  return best;
}
function firstCross(P: number[][], Q: number[][]): { s: number; x: number[] } | null {   // first plan intersection of two polylines, station on P
  let cum = 0;
  for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], r = [b[0] - a[0], b[1] - a[1]];
    for (let j = 0; j + 1 < Q.length; j++) { const c = Q[j], d = Q[j + 1], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-9) continue;
      const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { s: cum + t * Math.hypot(r[0], r[1]), x: [a[0] + t * r[0], a[1] + t * r[1]] }; }
    cum += Math.hypot(r[0], r[1]); }
  return null;
}
const nodeLev = new Map<string, { id: string; y: number }[]>();
pr('STEP B7-6 batch L-a + L-b: export of the L lines as game data (headless; the game is changed only by the registration in RoadNetwork + Config switch)');
pr('   line      length m  points  y start  y end   max grade %  min / max level m  PVIs  curves');
const out: string[] = []; let totalLen = 0;
for (const id of BATCH) {
  const l = FX.lines.find((q: any) => q.id === id), v = VP.lines.find((q: any) => q.id === id);
  if (!l || !v) { chk(false, `${id}: line or vertical profile missing`); continue; }
  chk(!l.built && !l.dropped && String(l.cls) === 'C', `${id} is a new, not dropped, class C line`);
  const len = plen(l.pts), sc = v.pvi[v.pvi.length - 1][0] / len;
  const cum = [0]; for (let i = 1; i < l.pts.length; i++) cum.push(cum[i - 1] + dd(l.pts[i], l.pts[i - 1]));
  const posAt = (d: number): number[] => { let j = 0; while (j < l.pts.length - 2 && cum[j + 1] < d) j++; const t = cum[j + 1] > cum[j] ? (d - cum[j]) / (cum[j + 1] - cum[j]) : 0; return [+(l.pts[j][0] + (l.pts[j + 1][0] - l.pts[j][0]) * t).toFixed(1), +(l.pts[j][1] + (l.pts[j + 1][1] - l.pts[j][1]) * t).toFixed(1)]; };
  let tg = 0; for (let i = 1; i < v.pvi.length; i++) tg = Math.max(tg, Math.abs(v.pvi[i][1] - v.pvi[i - 1][1]) / (v.pvi[i][0] - v.pvi[i - 1][0]));
  chk(tg <= LIM + 1e-4, `${id} max PVI tangent grade ${(tg * 100).toFixed(2)} % <= 8 %`);
  const tol = ALLOW[id] ?? Math.max(1.5, 0.0015 * len);
  chk(Math.abs(v.pvi[v.pvi.length - 1][0] - len) < tol, `${id} last PVI station ${f1(v.pvi[v.pvi.length - 1][0])} m = line length ${f1(len)} m (tolerance ${f1(tol)} m${ALLOW[id] ? ', NAMED allowance of this line, 21.67' : ': max(1.5 m, 0.15 % of the length), 21.65'})`);
  let d0 = 0, d1 = len, off0 = 0, off1 = 0;   // trim + level pin
  const tr = TRIM[id];
  if (tr) {
    const o = FX.lines.find((q: any) => q.id === tr.other), vo = VP.lines.find((q: any) => q.id === tr.other);
    const X = firstCross(tr.at === 'start' ? l.pts : l.pts.slice().reverse(), o.pts);
    if (!X || !vo) { chk(false, `${id}: crossing with ${tr.other} not found`); continue; }
    const so = projPoly(o.pts, X.x).s, yo = levelAt(vo, so * (vo.pvi[vo.pvi.length - 1][0] / plen(o.pts)));
    const dCut = tr.at === 'start' ? X.s : len - X.s, yOwn = levelAt(v, dCut * sc);
    if (tr.at === 'start') { d0 = dCut; off0 = yo - yOwn; } else { d1 = dCut; off1 = yo - yOwn; }
    chk(Math.abs(yo - yOwn) <= 0.7, `${id} ${tr.at} trimmed ${f1(tr.at === 'start' ? dCut : len - dCut)} m at the centre line of ${tr.other}; level ${f2(yOwn)} pinned to ${f2(yo)} (offset ${f2(yo - yOwn)} m, fades over ${BL} m)`);
  }
  const bounds = [d0]; const nodes = (SPLIT[id] ?? []).map((nid) => { const nd = J.nodes.find((q: any) => q.id === nid); const pj = projPoly(l.pts, [nd.x, nd.z]); chk(!!nd && pj.d < 4, `${id} node ${nid} lies on the line (${f2(pj.d)} m)`); return { nid, s: pj.s }; }).sort((a, b) => a.s - b.s);
  for (const q of nodes) bounds.push(q.s); bounds.push(d1);
  const yAt = (d: number): number => levelAt(v, d * sc) + off0 * Math.max(0, 1 - (d - d0) / BL) + off1 * Math.max(0, 1 - (d1 - d) / BL);
  for (let pi = 0; pi + 1 < bounds.length; pi++) {
    const a = bounds[pi], b = bounds[pi + 1], n = Math.max(2, Math.ceil((b - a) / DS)) + 1, nm = bounds.length > 2 ? `${id}.${pi + 1}` : id;
    const s: number[] = [], pts: number[][] = [], ys: number[] = [];
    for (let k = 0; k < n; k++) { const d = a + ((b - a) * k) / (n - 1); s.push(+(d - a).toFixed(1)); pts.push(posAt(d)); ys.push(+yAt(d).toFixed(2)); }
    let mg = 0; for (let i = 1; i < ys.length; i++) mg = Math.max(mg, Math.abs(ys[i] - ys[i - 1]) / ((s[i] - s[i - 1]) * sc));
    totalLen += b - a;
    pr(`   ${nm.padEnd(9)} ${f1(b - a).padStart(8)}  ${String(n).padStart(6)}  ${f2(ys[0]).padStart(7)} ${f2(ys[n - 1]).padStart(7)}  ${(mg * 100).toFixed(2).padStart(10)}      ${f1(Math.min(...ys))} / ${f1(Math.max(...ys))}   ${v.pvi.length}     ${v.curves.length}`);
    chk(mg <= LIM + 0.002, `${nm} max sampled grade ${(mg * 100).toFixed(2)} % <= 8 % + 0.2 % (heights rounded to 0.01 m at both ends of a 10 m step = up to 0.2 %)`);
    if (pi === 0 && !TRIM[id]?.at.startsWith('s')) chk(Math.abs(ys[0] - v.pvi[0][1]) < 0.02, `${nm} start level = PVI start level`);
    if (pi + 2 === bounds.length && TRIM[id]?.at !== 'end') chk(Math.abs(ys[n - 1] - v.pvi[v.pvi.length - 1][1]) < 0.02, `${nm} end level = PVI end level`);
    const brs0 = ST.filter((q) => q.line === id && !NOSTRUCT.includes(id) && BRIDGE.has(q.type)).map((q) => [+(Math.max(q.from, a) - a).toFixed(1), +(Math.min(q.to, b) - a).toFixed(1)]).filter((r) => r[1] - r[0] >= 40);
    const brs = [...brs0, ...(EXTRA[id] ?? []).filter((r) => r[1] > a && r[0] < b).map((r) => [Math.max(0, r[0] - a), Math.min(b - a, r[1] - a)])].sort((x, y) => x[0] - y[0]);
    for (const q of ST.filter((q) => q.line === id && !BRIDGE.has(q.type) && (q.type === 'cut-and-cover tunnel' || q.type === 'deep open cut with walls') && q.to > a && q.from < b)) NOTBR.push(`${nm} ${q.type} ${q.from}-${q.to} m (max ${q.max} m)`);
    if (brs.length) pr(`   ${nm.padEnd(9)} bridge ranges ${JSON.stringify(brs)}`);
    out.push(`  { name: '${nm}', src: 'B7', s: ${JSON.stringify(s)}, pts: ${JSON.stringify(pts)}, ys: ${JSON.stringify(ys)}${brs.length ? `, structs: ${JSON.stringify(brs)}` : ''} },`);
  }
  for (const q of nodes) { const arr = nodeLev.get(q.nid) ?? []; arr.push({ id, y: yAt(q.s) }); nodeLev.set(q.nid, arr); }
}
for (const [nid, arr] of nodeLev) if (arr.length === 2) chk(Math.abs(arr[0].y - arr[1].y) <= 0.1, `node ${nid}: ${arr[0].id} ${f2(arr[0].y)} m = ${arr[1].id} ${f2(arr[1].y)} m (within 0.1 m)`);
pr(`   TUNNEL / DEEP-CUT CANDIDATES (placed as open cut, the USER decides, R12): ${NOTBR.length}`); for (const q of NOTBR) pr('     ' + q);
pr(`   total length of the batch ${f1(totalLen)} m`);
pr('   NOT in this file: structures (no wet run; L-1 / L-2 / retaining wall entries of 25 / 55 m are walls, not bridges; checked again in scripts/b7-lnew-check.ts on the game terrain).');
pr(`   RESULT ${pass} PASS ${fail} FAIL`);
if (fail === 0) writeFileSync('src/roads/c/CNewLineData.ts', `// GENERATED by scripts/centre-c-export.ts (STEP B7-6, batch L-a). Do not edit: rerun the script. L lines L-1 .. L-4, L-7 .. L-12 (L-11 trimmed at R2-14): fitted centreline every 10 m (docs/fit_chain/centre_fixed.json) and finished heights from the vertical chain (docs/centre_vprofile.json).\r\n// Registered in RoadNetwork.layoutLRoads() behind Config.roads.lNew.enabled. Station s = metres from the first point.\r\nexport interface CNewLineData { name: string; src: string; s: number[]; pts: number[][]; ys: number[]; structs?: number[][] }\r\nexport const C_NEW_LINE_DATA: CNewLineData[] = [\r\n${out.join('\r\n')}\r\n];\r\n`);
writeFileSync(`${OUT}/STEP_B7_5_C_OUTPUT.txt`, L.join('\n') + '\n');
process.exit(fail === 0 ? 0 : 1);
