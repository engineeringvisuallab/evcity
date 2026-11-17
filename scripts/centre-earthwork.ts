// STEP 21.6c EARTHWORK / FORMATION (headless; changes NO src file, writes only docs/).
// Run: npx tsx scripts/centre-earthwork.ts [dir]   reads dir/centre_profile.json (stations x, z, natural ground g), dir/centre_vprofile.json (final PVI + curves),
// dir/centre_meshsec.json (section per stretch + OPEN <-> ZONE tapers of 21.6b); writes dir/STEP_21_6C_OUTPUT.txt and dir/centre_earthwork.json.
// Difference to 21.5: (1) the REAL section of every stretch (OPEN / ZONE, taper at a transition) instead of one section per class, (2) the ground is sampled ACROSS the road
// (every 0.5 m, both sides), so a side-hill gets cut on the uphill side and fill on the downhill side; the 21.5 volumes assumed the centre ground level all across,
// (3) cut slope 1:2 and fill slope 1:3 are followed to the catch point on the real ground, (4) the catch point is compared with the ROW (a catch point outside the ROW = land take / wall),
// (5) the list of structures (cut > 12 m centre, fill > 7 m centre, wet, and SIDE-HILL = the slope does not catch the ground in 60 m or its face is higher than 12 m cut / 7 m fill) with from-to metres for 21.8.
// My choices (change here): sample step across 0.5 m, search 60 m beyond the formation, fill slope starts at the shoulder edge (ditch toe ignored), cut slope starts at the ditch bottom
// (OPEN) or the formation edge (ZONE), pavement dug below the finished surface inside the paved edge only, topsoil / compaction / shrinkage NOT in the numbers.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { DESIGN } from '../src/roads/standards/Criteria';

const OUT = process.argv[2] ?? 'docs';
const DS = 10, MAXCUT = DESIGN.maxCut, MAXFILL = DESIGN.maxFill, CUT_SLOPE = DESIGN.cutSlope, FILL_SLOPE = DESIGN.fillSlope;
const STEP = 0.5, REACH = 60;
const f0 = (v: number): string => v.toFixed(0), f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const ground = (x: number, z: number): number => { gen.sampleGround(x, z, sc); return sc.h; };
const wetAt = (x: number, z: number): boolean => { gen.sample(x, z, sc); return !Number.isNaN(sc.water) && sc.water > sc.h; };

const P = JSON.parse(readFileSync(`${OUT}/centre_profile.json`, 'utf8'));
const V = JSON.parse(readFileSync(`${OUT}/centre_vprofile.json`, 'utf8'));
const M = JSON.parse(readFileSync(`${OUT}/centre_meshsec.json`, 'utf8'));
const pvById = new Map<string, any>(V.lines.map((l: any) => [l.id, l]));
const msById = new Map<string, any>(M.lines.map((l: any) => [l.id, l]));
const secById = new Map<string, any>(M.sections.map((s: any) => [s.id, s]));
const trByLine = new Map<string, any[]>(); for (const t of M.transitions) { const a = trByLine.get(t.line) ?? []; a.push(t); trByLine.set(t.line, a); }

function yAt(l: any, s: number): number {
  const pv: number[][] = l.pvi, cv: any[] = l.curves;
  for (let i = 1; i + 1 < pv.length; i++) { const c = cv[i - 1]; if (c.L > 0 && s >= pv[i][0] - c.L / 2 && s <= pv[i][0] + c.L / 2) { const g1 = (pv[i][1] - pv[i - 1][1]) / (pv[i][0] - pv[i - 1][0]), s0 = pv[i][0] - c.L / 2, y0 = pv[i][1] - g1 * c.L / 2; return y0 + g1 * (s - s0) + (c.A / 100) * (s - s0) ** 2 / (2 * c.L); } }
  let j = 0; while (j + 2 < pv.length && pv[j + 1][0] < s) j++; const t = (s - pv[j][0]) / (pv[j + 1][0] - pv[j][0]); return pv[j][1] + t * (pv[j + 1][1] - pv[j][1]);
}
interface Geo { id: string; pave: number; form: number; row: number; thick: number; cf: number; mh: number; ditchD: number; ditchW: number }
const geoOf = (id: string): Geo => { const s = secById.get(id); const d = s.drain ?? {}; return { id, pave: s.pavementEdge, form: s.formationHalf, row: s.rowHalf, thick: s.pavement, cf: s.crossFall, mh: s.median / 2, ditchD: d.ditchD ?? 0, ditchW: d.ditchW ?? 0 }; };
const geoCache = new Map<string, Geo>(); const geo = (id: string): Geo => geoCache.get(id) ?? geoCache.set(id, geoOf(id)).get(id)!;
function geoAt(lineId: string, s: number): Geo {   // section of the stretch, linear blend of the widths inside a taper
  const ms = msById.get(lineId); let st = ms.stretches.find((q: any) => s >= q.s0 && s < q.s1) ?? ms.stretches[ms.stretches.length - 1];
  const g = geo(st.section);
  for (const t of trByLine.get(lineId) ?? []) if (s >= t.from_s && s <= t.to_s) { const a = geo(t.from), b = geo(t.to); const w = (s - t.from_s) / (t.to_s - t.from_s); const m = (u: number, v: number): number => u + (v - u) * w;
    return { id: w < 0.5 ? a.id : b.id, pave: m(a.pave, b.pave), form: m(a.form, b.form), row: m(a.row, b.row), thick: m(a.thick, b.thick), cf: a.cf, mh: m(a.mh, b.mh), ditchD: m(a.ditchD, b.ditchD), ditchW: m(a.ditchW, b.ditchW) }; }
  return g;
}

pr('STEP 21.6c EARTHWORK / FORMATION (headless; nothing in src changed; tsc / npm run build / game NOT RUN; my numbers, constants at the top of the script)');
pr(`   cut slope 1:${CUT_SLOPE}, fill slope 1:${FILL_SLOPE} (DESIGN), structures: centre cut over ${MAXCUT} m = tunnel-candidate, centre fill over ${MAXFILL} m = viaduct, wet = bridge / culvert (metres, no volume); ground sampled across the road every ${STEP} m, search ${REACH} m beyond the formation edge`);
pr('');

interface Acc { km: number; cut: number; fill: number; tun: number; via: number; bri: number; side: number; rowOver: number; rowOver5: number; open: number; zone: number }
const acc = (): Acc => ({ km: 0, cut: 0, fill: 0, tun: 0, via: 0, bri: 0, side: 0, rowOver: 0, rowOver5: 0, open: 0, zone: 0 });
const byCls = new Map<string, Acc>(), bySec = new Map<string, Acc>(); const perLine: any[] = []; const structs: any[] = []; const rowRows: any[] = [];
let sideNo = 0, sideTall = 0; const t0 = Date.now();
for (const pl of P.lines) {
  const vl = pvById.get(pl.id), ms = msById.get(pl.id); if (!vl || !ms) continue; const cls = String(vl.cls);
  const n = pl.x.length; const A = byCls.get(cls) ?? byCls.set(cls, acc()).get(cls)!; const LA = acc();
  let s = 0; let cur: any = null; const lineEnd = vl.pvi[vl.pvi.length - 1][0];
  for (let i = 0; i < n; i++) {
    if (i > 0) s += Math.hypot(pl.x[i] - pl.x[i - 1], pl.z[i] - pl.z[i - 1]); const ds = i === 0 || i === n - 1 ? DS / 2 : DS;
    const sx = Math.min(s, lineEnd); const y = yAt(vl, sx); const gc = pl.g[i]; const d = y - gc; const G = geoAt(pl.id, sx); const SA = bySec.get(G.id) ?? bySec.set(G.id, acc()).get(G.id)!;
    for (const T of [A, LA, SA]) T.km += ds / 1000;
    const wet = wetAt(pl.x[i], pl.z[i]);
    let kind = ''; if (wet) kind = 'bridge'; else if (-d > MAXCUT) kind = 'tunnel'; else if (d > MAXFILL) kind = 'viaduct';
    if (kind) {
      for (const T of [A, LA, SA]) { if (kind === 'bridge') T.bri += ds; else if (kind === 'tunnel') T.tun += ds; else T.via += ds; }
      if (cur && cur.kind === kind && Math.abs(cur.to - (s - ds)) < DS * 1.01) { cur.to = s + ds / 2; cur.max = Math.max(cur.max, Math.abs(d)); } else { cur = { line: pl.id, cls, kind, from: Math.max(0, s - ds / 2), to: s + ds / 2, max: Math.abs(d) }; structs.push(cur); }
      continue;
    }
    // cross section at this station: tangent from the neighbours, left = (-tz, tx)
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1); let tx = pl.x[i1] - pl.x[i0], tz = pl.z[i1] - pl.z[i0]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    let cutA = 0, fillA = 0, catchMax = 0, noCatch = false, tall = false;
    for (const side of [1, -1]) {
      const nx = -tz * side, nz = tx * side;
      const surf = (o: number): number => y - G.cf * Math.max(0, o - G.mh);                    // finished surface at offset o
      const yE = surf(G.pave);                                                               // level at the paved edge
      const cutToe = G.form, cutLvl = yE - G.ditchD;                                         // cut slope starts at the ditch bottom
      const fillStart = Math.max(G.pave, G.form - G.ditchW);                                 // fill slope starts at the shoulder edge
      let o = 0; let caught = false; let cA = 0, fA = 0; let slopeSide = '';
      for (o = STEP / 2; o <= G.form + REACH; o += STEP) {
        const g = ground(pl.x[i] + nx * o, pl.z[i] + nz * o);
        if (o <= G.pave) { const sub = surf(o) - G.thick; if (g > sub) cA += (g - sub) * STEP; else fA += (sub - g) * STEP; }
        else if (o <= G.form) { const lv = o <= fillStart ? yE : cutLvl; if (g > lv) cA += (g - lv) * STEP; else fA += (lv - g) * STEP; }
        else {
          // beyond the formation: cut slope rises from the toe, fill slope falls from the shoulder edge; the ground decides which one applies
          const slC = cutLvl + (o - cutToe) / CUT_SLOPE, slF = yE - (o - fillStart) / FILL_SLOPE;
          if (g > slC) { cA += (g - slC) * STEP; slopeSide = 'cut'; }
          else if (g < slF) { fA += (slF - g) * STEP; slopeSide = 'fill'; }
          else { caught = true; catchMax = Math.max(catchMax, o); break; }
        }
      }
      if (!caught) { noCatch = true; catchMax = Math.max(catchMax, G.form + REACH); }
      else if (slopeSide === 'cut' && (catchMax - cutToe) / CUT_SLOPE > MAXCUT) tall = true;
      else if (slopeSide === 'fill' && (catchMax - fillStart) / FILL_SLOPE > MAXFILL) tall = true;
      cutA += cA; fillA += fA;
    }
    if (noCatch || tall) {   // slope does not catch the ground in REACH m, or the slope face is higher than the cut / fill limit: side-hill structure, no volume
      for (const T of [A, LA, SA]) T.side += ds; if (noCatch) sideNo += ds; else sideTall += ds;
      if (cur && cur.kind === 'sidehill' && Math.abs(cur.to - (s - ds)) < DS * 1.01) { cur.to = s + ds / 2; cur.max = Math.max(cur.max, Math.abs(d)); } else { cur = { line: pl.id, cls, kind: 'sidehill', from: Math.max(0, s - ds / 2), to: s + ds / 2, max: Math.abs(d) }; structs.push(cur); }
      continue;
    }
    cur = null;
    for (const T of [A, LA, SA]) { T.cut += cutA * ds; T.fill += fillA * ds; if (catchMax > G.row + 5) T.rowOver5 += ds; if (catchMax > G.row) T.rowOver += ds; if (G.id.endsWith('ZONE') || G.id.startsWith('C-') || G.id.startsWith('L-')) T.zone += ds; else T.open += ds; }
    if (catchMax > G.row) rowRows.push({ line: pl.id, s: Math.round(s), catchMax: Math.round(catchMax * 10) / 10, row: Math.round(G.row * 10) / 10, section: G.id });
  }
  perLine.push({ id: pl.id, cls, km: Math.round(LA.km * 1000) / 1000, cutM3: Math.round(LA.cut), fillM3: Math.round(LA.fill), tunnelM: Math.round(LA.tun), viaductM: Math.round(LA.via), bridgeM: Math.round(LA.bri), rowOverM: Math.round(LA.rowOver), rowOver5M: Math.round(LA.rowOver5), sidehillM: Math.round(LA.side) });
}
pr(`   (run time ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
pr('1. VOLUMES AND STRUCTURES PER CLASS (final 21.4c profile, 154 lines)');
let gc = 0, gf = 0, gt = 0, gv = 0, gb = 0, gs = 0;
for (const c of ['6', '4', '2', 'C', 'L']) { const T = byCls.get(c); if (!T) continue; gc += T.cut; gf += T.fill; gt += T.tun; gv += T.via; gb += T.bri; gs += T.side;
  pr(`   class ${c.padEnd(2)} ${f1(T.km).padStart(6)} km   cut ${f2(T.cut / 1e6)} Mm3   fill ${f2(T.fill / 1e6)} Mm3   tunnel-candidate ${f0(T.tun)} m   viaduct ${f0(T.via)} m   bridge ${f0(T.bri)} m   side-hill structure ${f0(T.side)} m   catch point outside ROW ${f0(T.rowOver)} m (over 5 m: ${f0(T.rowOver5)} m)`); }
pr(`   side-hill split: slope does not catch the ground in ${REACH} m ${f0(sideNo)} m, slope face higher than ${MAXCUT} m cut / ${MAXFILL} m fill ${f0(sideTall)} m`);
pr(`   TOTAL cut ${f2(gc / 1e6)} Mm3, fill ${f2(gf / 1e6)} Mm3 (net ${f2((gc - gf) / 1e6)} Mm3: ${gc > gf ? 'surplus to spoil' : 'borrow needed'}); structures ${f1(gt / 1000)} km tunnel-candidate, ${f1(gv / 1000)} km viaduct, ${f1(gb / 1000)} km bridge, ${f1(gs / 1000)} km side-hill (retaining wall / half viaduct)`);
try { const O = JSON.parse(readFileSync(`${OUT}/centre_sections.json`, 'utf8')).volumes; let oc = 0, of = 0; for (const k of Object.keys(O)) { oc += O[k].cut; of += O[k].fill; } pr(`   (21.5 on the same profile, one section per class and the centre ground across the road: cut ${f2(oc / 1e6)} Mm3, fill ${f2(of / 1e6)} Mm3)`); } catch { /* no 21.5 file */ }
pr('');
pr('2. PER SECTION (what the mesh builder will carry)');
for (const [id, T] of [...bySec].sort((a, b) => a[0].localeCompare(b[0]))) pr(`   ${id.padEnd(8)} ${f2(T.km).padStart(6)} km   cut ${f2(T.cut / 1e6)} Mm3   fill ${f2(T.fill / 1e6)} Mm3   cut per km ${f0(T.cut / Math.max(T.km, 1e-9) / 1000)} km3?`.replace(/cut per km .*$/, `cut per km ${f0(T.cut / Math.max(T.km, 1e-9))} m3   fill per km ${f0(T.fill / Math.max(T.km, 1e-9))} m3   catch outside ROW ${f0(T.rowOver)} m, over 5 m ${f0(T.rowOver5)} m`));
pr('');
pr('3. STRUCTURE LIST FOR 21.8 (merged stretches, metres along the line; one row per stretch)');
const sMin = structs.filter((q) => q.to - q.from >= 1);
for (const k of ['bridge', 'viaduct', 'tunnel', 'sidehill']) { const R = sMin.filter((q) => q.kind === k).sort((a, b) => (b.to - b.from) - (a.to - a.from)); pr(`   ${k.toUpperCase()} (${R.length} stretches, ${f0(R.reduce((a, q) => a + q.to - q.from, 0))} m):`); for (const q of R.slice(0, 25)) pr(`      ${q.line.padEnd(6)} cls ${q.cls.padEnd(2)} s ${f0(q.from).padStart(5)} .. ${f0(q.to).padStart(5)}  ${f0(q.to - q.from).padStart(4)} m  max ${f1(q.max)} m ${k === 'tunnel' ? 'cut' : k === 'viaduct' ? 'fill' : k === 'sidehill' ? 'centre cut / fill' : 'above bed'}`); if (R.length > 25) pr(`      ... ${R.length - 25} more in docs/centre_earthwork.json`); }
pr('');
pr('4. CATCH POINT MORE THAN 5 M OUTSIDE THE ROW (the slope runs well past the land strip: land take, a steeper slope or a retaining wall; decision later; the any-distance figure is in 1 and 2)');
const rowBy = new Map<string, number>(); for (const r of rowRows) if (r.catchMax > r.row + 5) rowBy.set(r.line, (rowBy.get(r.line) ?? 0) + DS);
const rowTop = [...rowBy].sort((a, b) => b[1] - a[1]).slice(0, 15); for (const [id, m] of rowTop) pr(`   ${id.padEnd(6)} ${f0(m).padStart(5)} m`);
pr(`   ${rowBy.size} lines, ${f0([...rowBy.values()].reduce((a, v) => a + v, 0))} m in all (structures and side-hill stretches are not counted here)`);
pr('');
pr('5. CHECKS');
chk(perLine.length === 154, `154 lines done (${perLine.length})`);
chk(perLine.every((l) => Number.isFinite(l.cutM3) && Number.isFinite(l.fillM3)), 'all volumes finite');
chk(perLine.every((l) => l.cutM3 >= 0 && l.fillM3 >= 0), 'no negative volume');
const kmSum = [...byCls.values()].reduce((a, T) => a + T.km, 0), kmSec = [...bySec.values()].reduce((a, T) => a + T.km, 0);
chk(Math.abs(kmSum - kmSec) < 0.01, `km per class ${f2(kmSum)} = km per section ${f2(kmSec)}`);
chk(structs.every((q) => q.to > q.from), 'every structure stretch has a length');
chk((byCls.get('L')?.cut ?? 0) + (byCls.get('L')?.fill ?? 0) > 0, 'L class volumes exist (sanity)');
pr(`PASS ${pass}  FAIL ${fail}`);
writeFileSync(`${OUT}/centre_earthwork.json`, JSON.stringify({ note: 'STEP 21.6c earthwork per class / section / line, structures (metres), catch points outside the ROW', params: { STEP, REACH, CUT_SLOPE, FILL_SLOPE, MAXCUT, MAXFILL }, classes: Object.fromEntries([...byCls]), sections: Object.fromEntries([...bySec]), lines: perLine, structures: structs.map((q) => ({ ...q, from: Math.round(q.from), to: Math.round(q.to), max: Math.round(q.max * 10) / 10 })), rowOver: rowRows }));
writeFileSync(`${OUT}/STEP_21_6C_OUTPUT.txt`, L.join('\n') + '\n');
