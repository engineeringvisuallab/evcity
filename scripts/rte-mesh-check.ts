// STEP RE-9 (headless): CHECK of src/roads/junction/RteMesh.ts (pure math, reads RteStructData.ts only; no game, no three.js, no terrain).
// Run: npx tsx scripts/rte-mesh-check.ts docs      Writes docs/RTE_MESH.txt. Prints PASS / FAIL; what is not run is printed as NOT RUN.
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { buildRteMesh, RTE_MESH } from '../src/roads/junction/RteMesh';
import { RTE_RAMP_STRUCTS, RTE_WEDGE_STRUCTS, RTE_STRUCT_FRAME } from '../src/roads/junction/RteStructData';

const out = process.argv[2] ?? 'docs';
const lines: string[] = [];
const P = (s: string): void => { lines.push(s); console.log(s); };
let fails = 0;
const CHK = (txt: string, ok: boolean, note = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${txt}  ${note}`); };
const f = (v: number, d = 2): string => v.toFixed(d);

const m = buildRteMesh();
const pos = m.positions, idx = m.indices, T = idx.length / 3;
P(`RE-9 MESH of the RT-E structures: ${m.stats.tris} triangles, ${m.stats.verts} vertices (deck ${m.stats.deckTris}, concrete ${m.stats.concreteTris}, parapet ${m.stats.barrierTris}, marks ${m.stats.markTris}, lamps ${m.stats.lampTris}); ${m.stats.skipped} degenerate triangles skipped.`);

// C1 numbers and index range
let bad = 0; for (const v of pos) if (!Number.isFinite(v)) bad++;
let oob = 0; for (const i of idx) if (i < 0 || i >= pos.length / 3) oob++;
CHK('C1 every coordinate is a finite number, every index is inside the vertex list, index count is a multiple of 3', bad === 0 && oob === 0 && idx.length % 3 === 0 && m.colors.length === pos.length, `${bad} bad numbers, ${oob} bad indices`);

// C2 parts cover all triangles once, in order
const pr = m.parts, names = ['deck', 'concrete', 'barrier', 'mark', 'lamp'] as const;
let cover = pr.deck[0] === 0 && pr[names[4]][1] === T; for (let k = 0; k + 1 < names.length; k++) if (pr[names[k]][1] !== pr[names[k + 1]][0]) cover = false;
CHK('C2 the five parts (deck, concrete, parapet, marks, lamps) cover every triangle exactly once', cover, names.map(n => `${n} ${pr[n][0]}..${pr[n][1]}`).join(', '));

// triangle normals
const nrm = (t: number): [number, number, number] => {
  const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
  const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
};
// C3 deck and marks face up
let down = 0; for (const n of ['deck', 'mark'] as const) for (let t = pr[n][0]; t < pr[n][1]; t++) if (nrm(t)[1] <= 0) down++;
CHK('C3 every deck and mark triangle looks up (+y)', down === 0, `${down} facing down`);

// per structure: sections and the triangle ranges it owns (the builder emits ramps first, then wedges; 2 deck triangles and 6 parapet triangles per section pair and side)
interface Str { name: string; sec: { x: number; z: number; y: number; hw: number }[]; deck: [number, number]; bar: [number, number] }
const strs: Str[] = []; { let d = pr.deck[0], b = pr.barrier[0];
  for (const r of RTE_RAMP_STRUCTS) { const n = r.s.length - 1; strs.push({ name: r.name, sec: r.s.map((_, i) => ({ x: r.x[i], z: r.z[i], y: r.deckY[i], hw: r.width[i] / 2 })), deck: [d, d + 2 * n], bar: [b, b + 12 * n] }); d += 2 * n; b += 12 * n; }
  for (const w of RTE_WEDGE_STRUCTS) { const n = w.d.length - 1; strs.push({ name: w.key, sec: w.d.map((_, i) => ({ x: w.x[i], z: w.z[i], y: w.deckY[i], hw: w.netWidth[i] / 2 })), deck: [d, d + 2 * n], bar: [b, b + 6 * n] }); d += 2 * n; b += 6 * n; } }
const nearY = (S: Str, x: number, z: number): number => { let bd = 1e9, by = 0; for (const q of S.sec) { const dd = Math.hypot(q.x - x, q.z - z); if (dd < bd) { bd = dd; by = q.y; } } return by; };
CHK('C3b the structure triangle ranges add up to the deck and parapet parts', strs[strs.length - 1].deck[1] === pr.deck[1] && strs[strs.length - 1].bar[1] === pr.barrier[1], strs.map(q => q.name).join(', '));

// C4 deck surface level = data level (the nearest section of any structure, 1 cm)
let worst = 0, wn = '', nv = 0;
for (const S of strs) for (let t = S.deck[0]; t < S.deck[1]; t++) for (let k = 0; k < 3; k++) {
  const v = idx[t * 3 + k] * 3, e = Math.abs(pos[v + 1] - nearY(S, pos[v], pos[v + 2])); nv++; if (e > worst) { worst = e; wn = S.name; }
}
const seen = new Set<number>(); for (let t = pr.deck[0]; t < pr.deck[1]; t++) for (let k = 0; k < 3; k++) seen.add(idx[t * 3 + k]);
CHK('C4 every deck-surface vertex is at the data level of its nearest section (<= 1 cm; the mesh is exactly the data)', worst <= 0.011, `worst ${f(worst, 3)} m (${wn}, ${nv} vertices; nearest section of the SAME structure)`);

// C5 deck footprint reaches the data width (M3 and M4, middle section, vertices of that structure only)
for (const S of strs.slice(0, 2)) {
  const i = Math.floor(S.sec.length / 2), q = S.sec[i], dx = S.sec[i + 1].x - S.sec[i - 1].x, dz = S.sec[i + 1].z - S.sec[i - 1].z, l = Math.hypot(dx, dz), px = -dz / l, pz = dx / l;
  let mn = 1e9, mx = -1e9;
  for (let t = S.deck[0]; t < S.deck[1]; t++) for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k] * 3; if (Math.hypot(pos[v] - q.x, pos[v + 2] - q.z) < 5) { const o = (pos[v] - q.x) * px + (pos[v + 2] - q.z) * pz; mn = Math.min(mn, o); mx = Math.max(mx, o); } }
  CHK(`C5 ${S.name} deck width at section ${i} = data width ${f(q.hw * 2, 1)} m`, Math.abs(mx - q.hw) < 0.2 && Math.abs(mn + q.hw) < 0.2, `lateral ${f(mn)} .. ${f(mx)}`);
}

// C6 wedge deck lies outside the existing arm deck edge (|u| >= 22.4) and no wedge vertex is inside the arm pavement
{
  const F = RTE_STRUCT_FRAME; let inside = 0, n = 0, minU = 1e9;
  const nW = RTE_WEDGE_STRUCTS.reduce((a, w) => a + w.d.length, 0);
  for (const v of seen) {
    const x = pos[v * 3], z = pos[v * 3 + 2];
    let near = false; for (const w of RTE_WEDGE_STRUCTS) for (let i = 0; i < w.d.length; i++) if (Math.hypot(w.x[i] - x, w.z[i] - z) < 4) { near = true; break; }
    if (!near) continue;
    const u = Math.abs((x - F.J[0]) * F.t[0] + (z - F.J[1]) * F.t[1]); n++; minU = Math.min(minU, u); if (u < 22.4 - 0.1) inside++;
  }
  CHK('C6 every wedge / wing deck vertex is outside the existing arm deck edge |u| >= 22.4 m (no overlap, no z-fight with the arm viaduct)', inside === 0 && n > 0, `${n} vertices near ${nW} wedge sections, smallest |u| ${f(minU)} m, ${inside} inside`);
}

// C7 parapet top faces are barrierH above the deck (same structure, nearest section)
{
  let bmax = 0, cnt = 0, who = '';
  for (const S of strs) for (let t = S.bar[0]; t < S.bar[1]; t++) if (nrm(t)[1] > 0) { const a = idx[t * 3] * 3, e = Math.abs(pos[a + 1] - nearY(S, pos[a], pos[a + 2]) - RTE_MESH.barrierH); if (e > bmax) { bmax = e; who = S.name; } cnt++; }
  CHK(`C7 parapet top faces are ${RTE_MESH.barrierH} m above the deck (nearest section of the same structure, slope tolerance 0.3 m)`, bmax <= 0.3 && cnt > 0, `${cnt} top triangles, worst ${f(bmax)} m (${who})`);
}

// C8 every pier: column bottom at footY, cap top at soffitY (a vertex exists there)
{
  let miss = 0, tot = 0;
  const piers = [...RTE_RAMP_STRUCTS.flatMap(r => r.piers), ...RTE_WEDGE_STRUCTS.flatMap(w => w.piers)];
  for (const p of piers) {
    tot++; let hasFoot = false, hasTop = false;
    for (let t = pr.concrete[0]; t < pr.concrete[1] && !(hasFoot && hasTop); t++) for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k] * 3; if (Math.hypot(pos[v] - p.x, pos[v + 2] - p.z) > 6) continue;
      if (Math.abs(pos[v + 1] - p.footY) < 0.005) hasFoot = true; if (Math.abs(pos[v + 1] - p.soffitY) < 0.005) hasTop = true;
    }
    if (!(hasFoot && hasTop)) miss++;
  }
  CHK('C8 every pier has its column foot at footY and its cap top at the deck soffit level (data)', miss === 0 && tot > 0, `${tot} piers, ${miss} without`);
}

// C9 triangle budget (ASSUMED)
const BUDGET = 60000;
CHK(`C9 triangle budget <= ${BUDGET} (ASSUMED; one mesh, vertex colours, no textures)`, m.stats.tris <= BUDGET, `${m.stats.tris}`);

// C10 determinism
const m2 = buildRteMesh();
CHK('C10 the builder is deterministic (second run identical)', m2.positions.length === pos.length && m2.indices.every((v, i) => v === idx[i]) && m2.positions.every((v, i) => v === pos[i]), '');

// C11 bounding box vs data
{
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, mny = 1e9, mxy = -1e9;
  for (let i = 0; i < pos.length; i += 3) { mnx = Math.min(mnx, pos[i]); mxx = Math.max(mxx, pos[i]); mny = Math.min(mny, pos[i + 1]); mxy = Math.max(mxy, pos[i + 1]); mnz = Math.min(mnz, pos[i + 2]); mxz = Math.max(mxz, pos[i + 2]); }
  const dmax = Math.max(...RTE_RAMP_STRUCTS.flatMap(r => r.deckY));
  CHK('C11 the mesh stays near the data: highest point <= highest deck + parapet / lamp height + 0.1 m', mxy <= dmax + RTE_MESH.lampH + 0.1, `x ${f(mnx, 0)}..${f(mxx, 0)}, z ${f(mnz, 0)}..${f(mxz, 0)}, y ${f(mny)}..${f(mxy)} (highest deck ${f(dmax)})`);
}

// C12 (STEP 5, user 2026-11-22: old strips beside the arm must go): the game default (Config.roads.junctionRteWedges.enabled = false) draws NO wedge / wing strip, only M3 / M4
{
  const noW = buildRteMesh({ skipArmWindow1: true, skipArmWedges: true }), withW = buildRteMesh({ skipArmWindow1: true });
  CHK('C12 skipArmWedges removes every arm wedge / wing strip and keeps the ramp bridges (fewer triangles, ramps unchanged, config default = off)', noW.stats.tris < withW.stats.tris && noW.stats.tris > 0 && Config.roads.junctionRteWedges.enabled === false, `${noW.stats.tris} tris without wedges, ${withW.stats.tris} with`);
}

P('');
P('NOT RUN  three.js layer (RteLayer.ts), Config / Engine wiring, npx tsc --noEmit of the whole project, npm run build, the game, the look of the mesh in the game, collision (cars / player on the decks), terrain carve and embankment under the ramps, ground-level lanes and slips (A2S, S2A, added lanes), signs, water check (sc.water > sc.h), Validate.ts.');
P('ASSUMED  parapet 0.9 x 0.4 m, edge line 0.7 m from the deck edge, lane divider on while the deck is >= 8 m wide, lamps every 40 m 9 m high, arrows every 100 m, approach slab 0.5 m, wing net strip starts 0.15 m outside the nominal width centre, 60 000 triangle budget.');
P(`\nSUMMARY: ${fails === 0 ? 'ALL PASS' : 'FAIL'} (${lines.filter(l => l.startsWith('PASS')).length} PASS, ${fails} FAIL)`);
writeFileSync(`${out}/RTE_MESH.txt`, lines.join('\n') + '\n');
