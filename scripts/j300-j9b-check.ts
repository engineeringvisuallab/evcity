// J9-b CHECK (headless, real game terrain + real road network, switch ON). Run: npx tsx scripts/j300-j9b-check.ts docs   Writes docs/J300_J9B.txt + docs/J300_J9B.json (grids for the picture).
// What it proves: (1) the arm strips are cut to the road (R6 free end, R4 hill saddle), (2) only CUT: no sample is ever raised, (3) nothing changes beyond the carve reach, (4) the old R4-9 beyond the join is not dented,
// (5) the cut face is no steeper than 1:2 (+ the natural slope), (6) the switch OFF path costs nothing and changes nothing, (7) the chunk workers get the same switch.
// Every line prints PASS / FAIL / INFO; anything not run is printed as NOT RUN.
import { writeFileSync, readFileSync } from 'fs';
import { performance } from 'perf_hooks';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { J300_ARMS } from '../src/roads/junction/J300Geometry';
import { J300_STRUCT_C as C } from '../src/roads/junction/J300StructC';
import { J300Carve, J300C } from '../src/roads/junction/J300Carve';
import { SECTION_M6, SECTION_M4 } from '../src/roads/standards/SectionTable';

const dir = process.argv[2] ?? 'docs'; const out: string[] = []; const P = (s = ''): void => { out.push(s); console.log(s); }; let fails = 0;
const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const r2 = (x: number): number => Math.round(x * 100) / 100;
Config.roads.junctionJ300.enabled = true;
const g: any = new TerrainGenerator(Config.world.seed); const sc = g.makeSample(); const rn: any = g.roads;
const Hon = (x: number, z: number): number => { g.sample(x, z, sc); return sc.h; };
Hon(0, 0); const inst = rn.j300Carve; // first call decides the switch and builds the carve lazily
const Hoff = (x: number, z: number): number => { rn.j300Carve = null; const h = Hon(x, z); rn.j300Carve = inst; return h; }; // same ground, carve disabled (only for this comparison)
P('J9-b CHECK (headless, real terrain + road network, switch ON, carve ON vs carve disabled on the same network)');
CHK('carve object built when the switch is ON', inst instanceof J300Carve && !inst.empty);

const W6 = SECTION_M6.pavementEdge + 0.6, W4 = SECTION_M4.pavementEdge + 0.6;
const ARMS: { id: 'R6' | 'R4'; rows: any[]; top: number }[] = [{ id: 'R6', rows: J300_ARMS.R6.rows as any[], top: W6 }, { id: 'R4', rows: J300_ARMS.R4.rows as any[], top: W4 }];
const normal = (rows: any[], i: number): [number, number] => { const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };

// ---- 1 strip is cut to the road (mesh surface = level + 0.015, terrain must not be above the road surface on the whole ribbon)
let seen = 0;
for (const A of ARMS) {
  let worst = -1e9, cutRows = 0, worstS = 0; let maxCut = 0, depthErr = 0;
  for (let i = 0; i < A.rows.length; i++) {
    const r = A.rows[i]; const [nx, nz] = normal(A.rows, i); let rowHit = false;
    for (let o = -A.top; o <= A.top + 1e-6; o += 2.075) {
      const x = r.x + nx * o, z = r.z + nz * o; const h = Hon(x, z), h0 = Hoff(x, z); seen++;
      if (h - r.y > worst) { worst = h - r.y; worstS = r.s; }
      if (h0 > r.y + 0.05) { rowHit = true; maxCut = Math.max(maxCut, h0 - r.y); depthErr = Math.max(depthErr, Math.abs(h - (r.y - J300C.trench))); }
    }
    if (rowHit) cutRows++;
  }
  CHK(`${A.id}: terrain never above the road surface on the whole ribbon (|offset| <= ${A.top} m)`, worst <= 0.0, `worst +${r2(worst)} m at s ${worstS} (${A.rows.length} rows)`);
  P(`INFO  ${A.id}: ${cutRows} rows needed a cut (natural ground above the road on the ribbon), deepest ${r2(maxCut)} m (J6 data: ${A.id === 'R6' ? 2.32 : 'R4 cut up to 18.5 m at the join incl. EXISTING hill cut'})`);
  CHK(`${A.id}: where cut, the ground sits about ${J300C.trench} m under the road surface (deviation <= 0.6 m, so never more than 0.9 m under it)`, depthErr <= 0.6, `max deviation from the trench depth ${r2(depthErr)} m`);
}

// ---- 2 cut only + 3 nothing beyond reach: random grid over a wide area
let raised = 0, maxRaise = 0, outsideChanged = 0, changed = 0, n = 0, maxLower = 0;
const bb = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }; for (const A of ARMS) for (const r of A.rows) { bb.x0 = Math.min(bb.x0, r.x); bb.x1 = Math.max(bb.x1, r.x); bb.z0 = Math.min(bb.z0, r.z); bb.z1 = Math.max(bb.z1, r.z); }
const M = 140; let seed = 12345; const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (let k = 0; k < 14000; k++) {
  const x = bb.x0 - M + rnd() * (bb.x1 - bb.x0 + 2 * M), z = bb.z0 - M + rnd() * (bb.z1 - bb.z0 + 2 * M); const a = Hon(x, z), b = Hoff(x, z); n++;
  const d = a - b; if (d > 1e-6) { raised++; maxRaise = Math.max(maxRaise, d); } if (d < -1e-6) { changed++; maxLower = Math.max(maxLower, -d); }
  if (Math.abs(d) > 1e-6 && inst.cap(x, z) === Infinity) outsideChanged++;
}
CHK('CUT ONLY: no sample is higher with the carve than without it', raised === 0, `${n} random samples, ${changed} lowered (max ${r2(maxLower)} m), ${raised} raised (max ${maxRaise.toExponential(1)})`);
CHK('nothing changes where no arm is in reach (cap = none)', outsideChanged === 0, `${outsideChanged} samples`);

// ---- 4 old R4-9 beyond the join: pavement centre line must not be dented
{ const road = rn.roads.find((r: any) => r.name === 'R4-9'); const e = road.xs.length - 1; let maxD8 = 0, maxD0 = 0, dist = 0, cnt = 0;
  for (let i = e; i >= Math.max(0, e - 40); i--) { if (i < e) dist += Math.hypot(road.xs[i + 1] - road.xs[i], road.zs[i + 1] - road.zs[i]); if (dist > 60) break;
    const d = Math.abs(Hon(road.xs[i], road.zs[i]) - Hoff(road.xs[i], road.zs[i])); cnt++; if (dist >= 8) maxD8 = Math.max(maxD8, d); else maxD0 = Math.max(maxD0, d); }
  CHK('old R4-9 beyond the join: pavement centre line not dented (>= 8 m from the join)', maxD8 <= 0.02, `${cnt} points, max change ${r2(maxD8)} m`);
  P(`INFO  old R4-9 within 8 m of the join: max change ${r2(maxD0)} m (the soft end of the arm strip, under the arm road)`); }

// ---- 5 cut face steepness: gradient of the ground in the carve zone, 2 m steps on a grid around each arm; compare with natural
{ const hard = (x: number, z: number): number => Hon(x, z); let worstG = 0, worstAt = '', worstNat = 0, cells = 0, over = 0, joinWorst = 0;
  const J = J300_ARMS.R4.end;
  for (const A of ARMS) for (let i = 0; i < A.rows.length; i += 2) { const r = A.rows[i]; const [nx, nz] = normal(A.rows, i);
    for (let o = -(A.top + 60); o <= A.top + 60; o += 2) { const x = r.x + nx * o, z = r.z + nz * o; if (inst.cap(x, z) === Infinity) continue;
      const h = hard(x, z), hn = hard(x + nx * 2, z + nz * 2); const gr = Math.abs(hn - h) / 2; cells++; const nat = Math.abs(Hoff(x + nx * 2, z + nz * 2) - Hoff(x, z)) / 2;
      if (gr > worstG) { worstG = gr; worstAt = `${A.id} s ${r.s} off ${o}`; worstNat = nat; } if (gr > 0.75 && gr > nat + 0.1) over++;
      if (A.id === 'R4' && Math.hypot(x - J.x, z - J.z) < 60) joinWorst = Math.max(joinWorst, gr); } }
  CHK('cut face across the arms: gradient <= 0.75 (1:2 = 0.5 plus the natural slope) where the carve made it', over === 0, `${cells} transect steps, ${over} steeper than 0.75 and than natural + 0.1; steepest overall ${r2(worstG)} (${worstAt}, natural there ${r2(worstNat)})`);
  P(`INFO  steepest cross gradient within 60 m of the R4 join: ${r2(joinWorst)} (the old road's own trench there is a smoothstep cutting, steeper than 1:2)`); }

// ---- 5b along-the-road step at the join plane: road corridor +-30 m, 2 m steps parallel to the old R4-9 direction, around the join
{ const A = ARMS[1]; const e = A.rows.length - 1; const r = A.rows[e]; const a = A.rows[e - 3]; const tx = (r.x - a.x), tz = (r.z - a.z), tl = Math.hypot(tx, tz); const ux = tx / tl, uz = tz / tl; const nx = -uz, nz = ux;
  let worst = 0, at = ''; for (let o = -45; o <= 45; o += 3) for (let s = -40; s <= 40; s += 2) { const x = r.x + ux * s + nx * o, z = r.z + uz * s + nz * o; const h = Hon(x, z), h2 = Hon(x + ux * 2, z + uz * 2); const gr = Math.abs(h2 - h) / 2; if (gr > worst) { worst = gr; at = `s ${s} off ${o}`; } }
  const nat = (() => { let w = 0; for (let o = -45; o <= 45; o += 3) for (let s = -40; s <= 40; s += 2) { const x = r.x + ux * s + nx * o, z = r.z + uz * s + nz * o; w = Math.max(w, Math.abs(Hoff(x + ux * 2, z + uz * 2) - Hoff(x, z)) / 2); } return w; })();
  CHK('R4 join plane: the carve makes no cliff along the road (steepest gradient not above the area WITHOUT the carve, and <= 2.0)', worst <= Math.min(2.0, nat + 0.05), `steepest ${r2(worst)} at ${at}; same area WITHOUT the carve ${r2(nat)} (the old road trench is steeper than 1:2)`); }

// ---- ramps + platform: informational (no carve needed)
{ let worst = -1e9, wr = ''; for (const Rp of (C as any).surfRamps) for (let i = 0; i < Rp.rows.length; i++) { const r = Rp.rows[i]; for (const [x, z] of [[r[0], r[1]], [(r[2] + r[4]) / 2, (r[3] + r[5]) / 2], [r[6], r[7]]]) { const d = Hon(x, z) - r[8]; if (d > worst) { worst = d; wr = `${Rp.id} row ${i}`; } } }
  P(`INFO  ramps: highest ground above a ramp level ${r2(worst)} m at ${wr} (the last rows touch the ring's own platform at the nose: ring / aux lane, J9-c; arms need no ramp carve)`); }

// ---- 6 cost of the OFF path + the cap lookup
{ const N = 200000; let t0 = performance.now(); let s = 0; for (let k = 0; k < N; k++) { s += inst.cap(bb.x0 - 3000 - k, bb.z0 - 3000); } const tFar = performance.now() - t0;
  t0 = performance.now(); for (let k = 0; k < 20000; k++) s += inst.cap(bb.x0 + rnd() * (bb.x1 - bb.x0), bb.z0 + rnd() * (bb.z1 - bb.z0)) > 1e8 ? 0 : 1; const tNear = performance.now() - t0;
  P(`INFO  cap() cost: ${(tFar / N * 1000).toFixed(3)} us per far sample (bbox reject), ${(tNear / 20000 * 1000).toFixed(2)} us per sample in the corridor area`); }
{ const gOff: any = (() => { Config.roads.junctionJ300.enabled = false; const q: any = new TerrainGenerator(Config.world.seed); const s2 = q.makeSample(); q.sample(bb.x0, bb.z0, s2); return q; })();
  CHK('switch OFF: no carve object is built (null) = no cost, no change', gOff.roads.j300Carve === null, 'j300Carve === null'); Config.roads.junctionJ300.enabled = true; }

// ---- 7 worker parity (source check only)
{ const rd = (f: string): string => readFileSync(f, 'utf8');
  const okLoader = /j300: j300Active\(\)/.test(rd('src/world/ChunkLoader.ts')) && (rd('src/world/ChunkLoader.ts').match(/j300: j300Active\(\)/g) ?? []).length >= 2;
  const wk = rd('src/workers/chunk.worker.ts'); const okWorker = /Config\.roads\.junctionJ300\.enabled = true/.test(wk) && /ensureGenerator\(req\.seed, req\.j300 === true\)/.test(wk) && wk.indexOf('junctionJ300.enabled = true') < wk.indexOf('new TerrainGenerator');
  const okMsg = (rd('src/workers/messages.ts').match(/j300\?: boolean/g) ?? []).length === 2;
  CHK('chunk worker gets the switch from the main thread (generate + grass messages), set before the generator is built (SOURCE check)', okLoader && okWorker && okMsg, `loader ${okLoader}, worker ${okWorker}, messages ${okMsg}`);
  P('NOT RUN  real browser worker (needs the game in a browser): ?j300=1 in the page URL is NOT visible to a worker, the flag now travels in the message.'); }

// ---- cross sections for the picture (ground with the carve, without it, road level), 2 m steps, +-70 m
const sections: any[] = [];
for (const [id, ss] of [['R4', [150, 200, 250, 300, 330]], ['R6', [540, 570, 600]]] as [string, number[]][]) { const A = ARMS.find((q) => q.id === id)!;
  for (const sv of ss) { let bi = 0, bd = 1e9; for (let i = 0; i < A.rows.length; i++) { const d = Math.abs(A.rows[i].s - sv); if (d < bd) { bd = d; bi = i; } } const r = A.rows[bi]; const [nx, nz] = normal(A.rows, bi);
    const on: number[] = [], off: number[] = [], offs: number[] = []; for (let o = -70; o <= 70; o += 2) { offs.push(o); on.push(r2(Hon(r.x + nx * o, r.z + nz * o))); off.push(r2(Hoff(r.x + nx * o, r.z + nz * o))); }
    sections.push({ id, s: r.s, y: r.y, top: A.top, offs, on, off }); } }
// ---- grids for the picture
const grid = (id: string, cx: number, cz: number, half: number, step: number): any => { const nx = Math.round(2 * half / step) + 1; const a: number[] = [], b: number[] = []; for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) { const x = cx - half + i * step, z = cz - half + j * step; a.push(r2(Hon(x, z))); b.push(r2(Hoff(x, z))); } return { id, x0: cx - half, z0: cz - half, step, n: nx, carve: a, nocarve: b }; };
const grids = [grid('R4 hill saddle (join)', -1480, -2190, 160, 4), grid('R6 free end', -1990, -2940, 100, 4)];
writeFileSync(`${dir}/J300_J9B.json`, JSON.stringify({ constants: J300C, sections, arms: ARMS.map((A) => ({ id: A.id, top: A.top, rows: A.rows.map((r: any) => [r.s, r.x, r.z, r.y]) })), grids }));
P('NOT RUN: in-game look (browser), terrain mesh LOD / chunk seams, trees / buildings / grass on the cut (vegetation placement unchanged), ring through the box + rail piers (J9-c), minimap + collision + old signs / charge points (J9-d), traffic (J10).');
P(''); P(`${fails} FAIL`); writeFileSync(`${dir}/J300_J9B.txt`, out.join('\n') + '\n');
