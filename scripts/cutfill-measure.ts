// ROAD CUT / FILL SMOOTHING: MEASURE (headless, READ ONLY: nothing in src changes).
// Run: npx tsx scripts/cutfill-measure.ts [out.txt]        (default out = docs/CUTFILL_MEASURE.txt)
// For every road, every ~STRIDE m along it, both sides, offsets core, core+2, ... (2 m steps, 80 m), it reads the road ground (natural + residential flat + roads.apply = the
// ground the road earthwork makes; rail / port / pads are NOT in this layer) and measures
//   CROSS  step = h(o+5) - h(o)               (m per 5 m, across the verge)
//   ALONG  step = h(s+5 m) - h(s) at one offset (m per 5 m, along the road: this finds jumps where the nearest road / segment switches)
//   ADDED  = how much the road made the step bigger than the ground under it had (|step| - |step of the ground without roads|)
// and says WHY (cause) with a diagnostic copy of RoadNetwork.apply() (which part of apply() decided each point).
import * as fs from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';

const gen = new TerrainGenerator(Config.world.seed);
const rn: any = gen.roads;
const STRIDE = Number(process.env.STRIDE ?? 10);
const OFFS = Number(process.env.OFFS ?? 40); // number of 2 m offsets (80 m)
const OUT = process.argv[2] ?? 'docs/CUTFILL_MEASURE.txt';
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const CELL = 64, DAY_CUT = 1 / 2, DAY_FILL = 1 / 3;
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };

interface Diag { h: number; kind: string; road: number; seg: number }
/** Ground without the roads (natural + residential flat). */
function ref0(x: number, z: number): { h: number; wet: boolean } {
  gen.sampleGround(x, z, sc); gen.residentialFlat.apply(x, z, sc);
  const wet = sc.h < 0.2 || (!Number.isNaN(sc.water) && sc.h < sc.water + 0.3);
  return { h: sc.h, wet };
}
/** Diagnostic copy of RoadNetwork.apply(): same result in h, plus which part decided. */
function diag(x: number, z: number): Diag {
  gen.sampleGround(x, z, sc); gen.residentialFlat.apply(x, z, sc);
  const out = sc;
  const segs: Int32Array | undefined = rn.cellOf(x, z);
  if (!segs) return { h: out.h, kind: 'none', road: -1, seg: -1 };
  if (!Number.isNaN(out.water) && out.h < out.water + 0.3) return { h: out.h, kind: 'wet', road: -1, seg: -1 };
  let bw = 0, by = 0, bd = Infinity, bseg = -1, bkind = 'none';
  let carve = Infinity, carveW = 0, carveD = Infinity, nbBeyond = false, nbD = Infinity;
  let dd = Infinity, inner = Infinity, dby = 0, dcore = 0, dcut = 0.5, dseg = -1;
  const pl = rn.padCells.get((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512));
  if (pl) for (let q = 0; q < pl.length; q++) {
    const p = rn.pads[pl[q]]; const d = Math.hypot(x - p.x, z - p.z);
    if (d >= p.rCore + p.emb) continue;
    const w = 1 - smooth(p.rCore, p.rCore + p.emb, d);
    if (w > bw + 1e-6) { bw = w; bd = w >= 1 - 1e-6 ? -1 : d; by = p.y + p.a * (x - p.x) + p.b * (z - p.z); bseg = 100000 + pl[q]; bkind = 'pad'; }
  }
  if (rn.j1 && rn.j1Cells.has((Math.floor(x / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512)) && rn.j1.sample(x, z, rn.j1Out) && rn.j1Out.w > bw + 1e-6) {
    bw = rn.j1Out.w; bd = bw >= 1 - 1e-6 ? -1 : (1 - bw) * 20; by = rn.j1Out.y; bseg = 200000; bkind = 'j1';
  }
  for (let q = 0; q < segs.length; q++) {
    const s = segs[q];
    const abx = rn.sbx[s] - rn.sax[s], abz = rn.sbz[s] - rn.saz[s], l2 = abx * abx + abz * abz;
    let t = l2 > 0 ? ((x - rn.sax[s]) * abx + (z - rn.saz[s]) * abz) / l2 : 0;
    const traw = t; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (rn.sax[s] + abx * t), z - (rn.saz[s] + abz * t));
    const core = rn.score[s];
    if (rn.sbridge[s]) {
      const rr = rn.roads[rn.segRoad[s]]; const ring = rr.daylight === true;
      if (ring && d < nbD) {
        const pi = rn.segPt[s]; const len = Math.sqrt(abx * abx + abz * abz); nbD = d;
        nbBeyond = (traw * len < -4 && pi > 0 && rr.bridgeOf[pi - 1] !== rr.bridgeOf[pi]) || ((traw - 1) * len > 4 && rr.bridgeOf[pi + 2] !== rr.bridgeOf[pi]);
      }
      const deck = rn.say[s] + (rn.sby[s] - rn.say[s]) * t - (ring ? 0.7 : 0.7);
      if (rn.sbridge[s] === 2 && d < inner) inner = d;
      if ((ring || out.h > deck) && d < core + 5) {
        const cw = 1 - smooth(core + 0.5, core + 5, d);
        if (cw > carveW + 1e-6 || (cw > carveW - 1e-6 && d < carveD)) { carveW = cw; carve = deck; carveD = d; }
      }
      continue;
    }
    const e = rn.sea[s] + (rn.seb[s] - rn.sea[s]) * t;
    if (d >= core + e) continue;
    if (rn.segRoad[s] === rn.islandLinkId && rn.behindLinkStart(x, z)) continue;
    if (rn.sday[s]) {
      if (d < dd) { dd = d; dby = rn.say[s] + (rn.sby[s] - rn.say[s]) * t; dcore = core; dcut = rn.sca[s] + (rn.scb[s] - rn.sca[s]) * t; dseg = s; }
      continue;
    }
    const w = 1 - smooth(core, core + e, d);
    if (w > bw + 1e-6 || (w > bw - 1e-6 && d < bd)) { bw = w; bd = d; by = rn.say[s] + (rn.sby[s] - rn.say[s]) * t; bseg = s; bkind = 'strip'; }
  }
  let kind = 'none', road = -1, seg = -1;
  if (dd < Infinity) {
    const run = dd > dcore ? dd - dcore : 0;
    const lo = dby - run * DAY_FILL, hi = dby + run * dcut;
    if (out.h < lo) { if (!(inner < dd)) { out.h = lo; kind = run === 0 ? 'plat' : 'fill'; } }
    else if (out.h > hi) { out.h = hi; kind = run === 0 ? 'plat' : dcut > 1 ? 'cutwall' : 'cut'; }
    else kind = 'free';
    road = rn.segRoad[dseg]; seg = dseg;
  }
  if (bw > 0) { out.h += (by - out.h) * bw; kind = bkind + (kind === 'none' || kind === 'free' ? '' : '+' + kind); if (bseg >= 0 && bseg < 100000) { road = rn.segRoad[bseg]; seg = bseg; } else { road = -2; seg = bseg; } }
  carveW *= 1 - bw; if (nbBeyond) carveW = 0;
  if (carveW > 0 && out.h > carve) { out.h -= (out.h - carve) * carveW; kind += '+carve'; }
  return { h: out.h, kind, road, seg };
}

const names = (id: number) => (id >= 0 ? rn.roads[id].name : id === -2 ? 'pad/J1' : '-');
interface Rec { road: string; roadId: number; cum: number; side: number; off: number; x: number; z: number; type: 'cross' | 'along'; step: number; added: number; why: string; other: boolean }
const recs: Rec[] = [];
const walls: Rec[] = [];
const stat: Record<string, { prof: number; wallP: number; jumpP: number; jump05: number; jump1: number; a05: number; a1: number }> = {};
let nRoads = 0, nStations = 0, nSamples = 0;
const fullS = { h: 0, water: NaN, fx: 0, fz: 0 };
const median = (v: number[]) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const DS = 2; // cross profile resolution (m)
for (const r of rn.roads) {
  if (r.length < 20) continue;
  nRoads++;
  const core = r.halfWidth + r.shoulder;
  const stride = Math.max(1, Math.round(STRIDE / r.step));
  const key = r.tier + ':' + r.kind;
  stat[key] ??= { prof: 0, wallP: 0, jumpP: 0, jump05: 0, jump1: 0, a05: 0, a1: 0 };
  const S = stat[key];
  for (let i = stride; i < r.xs.length - 1; i += stride) {
    if (r.bridgeOf[i] >= 0) continue;
    nStations++;
    const j = Math.min(r.xs.length - 1, i + 1);
    const dl = r.cum[j] - r.cum[i];
    if (dl < 1) continue;
    for (const sd of [-1, 1]) {
      const h: number[] = [], kinds: string[] = [], roadsAt: number[] = [], wet: boolean[] = [], touched: boolean[] = [];
      let untouched = 0;
      for (let k = 0; k <= OFFS; k++) {
        const o = core + k * DS;
        const px = r.xs[i] + r.nx[i] * o * sd, pz = r.zs[i] + r.nz[i] * o * sd;
        const d = diag(px, pz); const r0 = ref0(px, pz); nSamples += 2;
        h.push(d.h); kinds.push(d.kind); roadsAt.push(d.road); wet.push(r0.wet || d.kind === 'wet');
        const t = Math.abs(d.h - r0.h) > 0.02; touched.push(t);
        // ALONG jump at the same offset (not in the first 2 m: that is the pavement edge)
        if (k >= 1 && !r0.wet) {
          const qx = r.xs[j] + r.nx[j] * o * sd, qz = r.zs[j] + r.nz[j] * o * sd;
          const d2 = diag(qx, qz); const r2 = ref0(qx, qz); nSamples += 2;
          if (!r2.wet && (t || Math.abs(d2.h - r2.h) > 0.02)) {
            const f = 5 / dl; const st = (d2.h - d.h) * f; const stRef = (r2.h - r0.h) * f; const added = Math.abs(st - stRef);
            if (added > 0.5) S.a05++; if (added > 1) S.a1++;
            if (added > 0.3) {
              const why = d.road !== d2.road ? `two roads: ${names(d.road)} -> ${names(d2.road)}` : d.seg !== d2.seg && d.kind !== d2.kind ? `segment switch ${d.kind} -> ${d2.kind}` : `${d.kind} -> ${d2.kind}`;
              recs.push({ road: r.name, roadId: r.id, cum: r.cum[i], side: sd, off: o, x: px, z: pz, type: 'along', step: st, added, why, other: false });
            }
          }
        }
        if (!t) { if (++untouched >= 4) break; } else untouched = 0;
      }
      // CROSS profile: steps per DS m; a LEDGE = a step much bigger than the steps around it (a smooth slope has none); a WALL = a face steeper than 1:1
      const st: number[] = [];
      for (let k = 0; k + 1 < h.length; k++) st.push(wet[k] || wet[k + 1] ? NaN : h[k + 1] - h[k]);
      S.prof++;
      let worstLedge = 0, wk = -1, wallK = -1, wallRise = 0;
      for (let k = 0; k < st.length; k++) {
        if (Number.isNaN(st[k]) || !(touched[k] || touched[k + 1])) continue;
        const nb: number[] = [];
        for (let m = Math.max(0, k - 3); m <= Math.min(st.length - 1, k + 3); m++) if (m !== k && !Number.isNaN(st[m])) nb.push(Math.abs(st[m]));
        const led = Math.abs(st[k]) - median(nb);
        // a wall: the cut face rises at least 1 m per 1 m (2 m per DS)
        if (Math.abs(st[k]) >= DS * 1.0) { wallRise += Math.abs(st[k]); if (wallK < 0) wallK = k; }
        // a ledge that is just a steep wall is a wall, not a ledge
        if (led > worstLedge && Math.abs(st[k]) < DS * 1.0) { worstLedge = led; wk = k; }
      }
      if (wallK >= 0) {
        S.wallP++;
        walls.push({ road: r.name, roadId: r.id, cum: r.cum[i], side: sd, off: core + wallK * DS, x: r.xs[i] + r.nx[i] * (core + wallK * DS) * sd, z: r.zs[i] + r.nz[i] * (core + wallK * DS) * sd, type: 'cross', step: wallRise, added: wallRise, why: kinds[wallK + 1] ?? '', other: false });
      }
      if (wk >= 0 && worstLedge > 0.3) {
        S.jumpP++; if (worstLedge > 0.5) S.jump05++; if (worstLedge > 1) S.jump1++;
        const why = roadsAt[wk] !== roadsAt[wk + 1] ? `two roads: ${names(roadsAt[wk])} -> ${names(roadsAt[wk + 1])}` : `${kinds[wk]} -> ${kinds[wk + 1]}`;
        recs.push({ road: r.name, roadId: r.id, cum: r.cum[i], side: sd, off: core + wk * DS, x: r.xs[i] + r.nx[i] * (core + wk * DS) * sd, z: r.zs[i] + r.nz[i] * (core + wk * DS) * sd, type: 'cross', step: st[wk], added: worstLedge, why, other: false });
      }
    }
  }
}
// does rail / port / pads change the point? (then the cause is not the road)
for (const q of recs) { gen.sample(q.x, q.z, fullS); const d = diag(q.x, q.z); q.other = Math.abs(fullS.h - d.h) > 0.05; }

// cluster: keep the worst per (road, 60 m window, side)
const score = (q: Rec) => q.added;
const best = new Map<string, Rec>();
for (const q of recs) { if (q.other) continue; const key = q.road + '|' + Math.floor(q.cum / 60) + '|' + q.side; const b = best.get(key); if (!b || score(q) > score(b)) best.set(key, q); }
const top = [...best.values()].sort((a, b) => score(b) - score(a));
const lines: string[] = [];
lines.push(`CUTFILL MEASURE  roads ${nRoads}, stations ${nStations}, samples ${nSamples}, stride ${STRIDE} m, offsets ${OFFS} x ${DS} m, layer = natural + residential flat + roads.apply`);
lines.push('LEDGE = a step across the verge that is bigger than the steps around it (m): a smooth slope has none. WALL = face steeper than 1:1. ALONG jump = ground height jump along the road at the same offset (m per 5 m, more than the ground under it had).');
lines.push('');
lines.push('=== A. per road class (profiles = cross sections measured, both sides) ===');
lines.push('class                  profiles | with WALL | with LEDGE >0.3 | >0.5 m | >1 m | ALONG jumps >0.5 m | >1 m');
for (const [k, s] of Object.entries(stat)) lines.push(`${k.padEnd(22)} ${String(s.prof).padStart(8)} | ${String(s.wallP).padStart(9)} | ${String(s.jumpP).padStart(15)} | ${String(s.jump05).padStart(6)} | ${String(s.jump1).padStart(4)} | ${String(s.a05).padStart(18)} | ${String(s.a1).padStart(4)}`);
lines.push('');
lines.push('=== B. WORST 20 JUMPS / LEDGES (one per road / 60 m / side; rail, port and pad areas left out). Walls are in section D ===');
lines.push('no  road      s(m)   side  offset  x, z                 type   step(m)  ledge(m)   why');
top.slice(0, 20).forEach((q, n) => lines.push(`${String(n + 1).padStart(2)}  ${q.road.padEnd(9)} ${q.cum.toFixed(0).padStart(6)} ${q.side > 0 ? 'L' : 'R'}     ${q.off.toFixed(0).padStart(4)}   ${('(' + q.x.toFixed(0) + ', ' + q.z.toFixed(0) + ')').padEnd(20)} ${q.type.padEnd(6)} ${q.step.toFixed(2).padStart(7)}  ${q.added.toFixed(2).padStart(7)}    ${q.why}`));
lines.push('');
const why: Record<string, number> = {};
for (const q of best.values()) { if (score(q) < 0.5) continue; const k = q.type + ': ' + q.why.replace(/two roads: .*/, 'two roads').replace(/\+carve/g, ''); why[k] = (why[k] ?? 0) + 1; }
lines.push('=== C. CAUSE count among the places with ledge / jump >= 0.5 m (one per road / 60 m / side) ===');
for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1])) lines.push(`${String(v).padStart(6)}  ${k}`);
lines.push(`places >= 0.5 m: ${[...best.values()].filter((q) => score(q) >= 0.5).length}, >= 1 m: ${[...best.values()].filter((q) => score(q) >= 1).length}; records inside rail / port / pad areas left out: ${recs.filter((q) => q.other).length}`);
lines.push('');
const wallBy = new Map<string, Rec>();
for (const q of walls) { if (q.other) continue; const key = q.road + '|' + Math.floor(q.cum / 120) + '|' + q.side; const b = wallBy.get(key); if (!b || q.step > b.step) wallBy.set(key, q); }
const wl = [...wallBy.values()].sort((a, b) => b.step - a.step);
const wallRoad: Record<string, number> = {};
for (const q of walls) wallRoad[q.road] = (wallRoad[q.road] ?? 0) + 1;
lines.push(`=== D. WALLS (cut face steeper than 1:1): ${walls.length} profiles on ${Object.keys(wallRoad).length} roads; worst 10 (rise of the steep part, one per road / 120 m / side) ===`);
wl.slice(0, 10).forEach((q, n) => lines.push(`${String(n + 1).padStart(2)}  ${q.road.padEnd(9)} s ${q.cum.toFixed(0).padStart(6)} ${q.side > 0 ? 'L' : 'R'}  (${q.x.toFixed(0)}, ${q.z.toFixed(0)})  wall rise ${q.step.toFixed(1)} m  ${q.why}`));
lines.push('walls per road (profiles): ' + Object.entries(wallRoad).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', '));
const text = lines.join('\n') + '\n';
fs.writeFileSync(OUT, text);
console.log(text);