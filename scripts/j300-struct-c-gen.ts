// J7-C GENERATOR (headless). Retaining walls (platform edge, R6 / R4 arms, 4 ramps incl. inner walls along the ring), earth slopes (fill <= 4 m), REAL wing wall tops (replace the ASSUMED J7-A ones),
// light + sign positions, and the road SURFACE ribbons (arms, ramps) so the game layer can show a solid junction.
// Writes src/roads/junction/J300StructC.ts (GENERATED data) and docs/J300_STRUCT_C.json.  Run: npx tsx scripts/j300-struct-c-gen.ts   Then: npx tsx scripts/j300-struct-c-check.ts docs
// Inputs: docs/J300_TERRAIN.json (arm rows, platform toe), docs/J300_RAMPS.json (ramp rows, ring level table), docs/J300_STRUCT_A.json, docs/J300_STRUCT_B.json.
import { readFileSync, writeFileSync } from 'fs';
const r2 = (x: number): number => Math.round(x * 100) / 100;
const rd = (f: string): any => JSON.parse(readFileSync('docs/' + f, 'utf8'));
const T = rd('J300_TERRAIN.json'), RM = rd('J300_RAMPS.json'), SA = rd('J300_STRUCT_A.json'), SB = rd('J300_STRUCT_B.json');
const FR = T.frame; const yaw: number = FR.yaw; const ux = Math.cos(yaw), uz = Math.sin(yaw); const DECK: number = FR.deckY;
const toW = (u: number, v: number): { x: number; z: number } => ({ x: FR.ox + u * ux + v * uz, z: FR.oz + u * uz - v * ux });
const inv = (x: number, z: number): [number, number] => { const dx = x - FR.ox, dz = z - FR.oz; return [dx * ux + dz * uz, dx * uz - dz * ux]; };
const dirW = (a: number, b: number): [number, number] => [ux * a + uz * b, uz * a - ux * b];   // local direction -> world direction
const RT: number[][] = RM.ringTable; const ringY = (u: number): number => { const t = (u + 700) / 5; const i = Math.max(0, Math.min(RT.length - 2, Math.floor(t))); return RT[i][1] + (t - i) * (RT[i + 1][1] - RT[i][1]); };
const existing = (u: number, v: number): number => { const a = Math.abs(v); return a <= 22.1 ? ringY(u) : ringY(u) - (a - 22.1) / 2; };
const wrap = (a: number): number => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
const WALL_MIN = 4, EMBED = 0.5;
type Pt = number[];          // wall point [x, z, top, bottom, nx, nz]  (n = unit normal on the VISIBLE face side; the slab goes the other way)
type Wall = { id: string; kind: string; thick: number; pts: Pt[] };
const walls: Wall[] = []; const slopes: { id: string; kind: string; pts: Pt[] }[] = [];  // slope point [edgeX, edgeZ, edgeLevel, toeX, toeZ, naturalLevel]
const lights: any[] = [];

// ---- 1) platform wall (face at r 62.6 = outer circle 62 + shoulder 0.6), open where the ring, the arms and the ramps attach
const RO = T.platform.ro as number, RFACE = RO + 0.6; const toe: number[][] = T.platform.toe;
const openAt: [number, number][] = [[0, 24], [180, 24]];
for (const k of ['R6', 'R4']) { const r0 = T.arms[k].rows[0]; const [u, v] = inv(r0[1], r0[2]); openAt.push([Math.atan2(v, u) * 180 / Math.PI, 19]); }
for (const r of RM.ramps) openAt.push([Math.atan2(r.rows[0][1], r.rows[0][0]) * 180 / Math.PI, 11]);
const isOpen = (a: number): boolean => openAt.some(([c, h]) => Math.abs(wrap(a - c)) < h);
const natAt = (a: number): number => { const t = ((a % 360) + 360) % 360 / 5; const i = Math.floor(t) % toe.length, j = (i + 1) % toe.length; const f = t - Math.floor(t); return toe[i][3] + (toe[j][3] - toe[i][3]) * f; };
{ let run: Pt[] = []; let n = 0; const flush = (): void => { if (run.length > 1) walls.push({ id: 'PLAT-' + (++n), kind: 'platform', thick: 0.8, pts: run }); run = []; };
  for (let a = -180; a <= 180.001; a += 2.5) { const aa = Math.min(a, 180); const nat = natAt(aa); const open = isOpen(aa) || DECK - nat < 0.5;
    if (open) { flush(); continue; } const ca = Math.cos(aa * Math.PI / 180), sa = Math.sin(aa * Math.PI / 180); const p = toW(RFACE * ca, RFACE * sa); const nw = dirW(ca, sa);
    run.push([r2(p.x), r2(p.z), DECK, r2(nat - EMBED), r2(nw[0]), r2(nw[1])]); }
  flush(); }

// ---- 2) arms: walls where fill > 4 m, slopes where 0 < fill <= 4 m; surface ribbon
const surfArms: any[] = [];
for (const id of ['R6', 'R4']) { const A = T.arms[id]; const rows: number[][] = A.rows; const top: number = A.top;
  // J10 Option A: R4 ribbon TAPER at the join (real R4-9: pavement half width 11.5 m, lane 3.5 m). Over the last TAPER m before the join the half width goes top -> 11.5 + 0.6 and the paint lane line 7.15 -> 7.0.
  const TAPER = 70, HW_JOIN = 11.5 + 0.6, sEnd = rows[rows.length - 1][0];
  surfArms.push({ id, top: r2(top), pts: rows.map((r) => { if (id !== 'R4') return [r2(r[1]), r2(r[2]), r2(r[3])]; const k = Math.max(0, Math.min(1, (sEnd - r[0]) / TAPER)); return [r2(r[1]), r2(r[2]), r2(r[3]), r2(HW_JOIN + (top - HW_JOIN) * k), r2(7.0 + 0.15 * k)]; }) });
  for (const [side, sd, hi] of [['L', 1, 5], ['R', -1, 9]] as [string, number, number][]) {
    let wrun: Pt[] = [], srun: Pt[] = [], nw = 0, ns = 0;
    const fw = (): void => { if (wrun.length > 1) walls.push({ id: `${id}-${side}-W${++nw}`, kind: 'arm', thick: 0.8, pts: wrun }); wrun = []; };
    const fs = (): void => { if (srun.length > 1) slopes.push({ id: `${id}-${side}-S${++ns}`, kind: 'arm', pts: srun }); srun = []; };
    for (let i = 0; i < rows.length; i++) { const r = rows[i]; const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)]; const dx = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dz); const nx = -dz / L, nz = dx / L;
      const h = r[hi]; const ex = r[1] + sd * nx * top, ez = r[2] + sd * nz * top;
      if (h > WALL_MIN) { fs(); wrun.push([r2(ex), r2(ez), r2(r[3]), r2(r[3] - h - EMBED), r2(sd * nx), r2(sd * nz)]); }
      else if (h > 0.05) { fw(); srun.push([r2(ex), r2(ez), r2(r[3]), r2(r[hi + 2]), r2(r[hi + 3]), r2(r[3] - h)]); }
      else { fw(); fs(); } }
    fw(); fs(); } }

// ---- 3) ramps: outer wall / slope + inner wall between the ramp and the ring; surface ribbon
const rampStat: any[] = []; const surfRamps: any[] = [];
for (const r of RM.ramps) { const rows: number[][] = r.rows.filter((x: number[]) => Math.abs(x[0]) <= r.noseX); const sel = rows.filter((_: number[], i: number) => i % 2 === 0 || i === rows.length - 1);
  let ow: Pt[] = [], iw: Pt[] = [], os: Pt[] = [], nO = 0, nI = 0, nS = 0; let maxH = 0, maxIn = 0; const rib: number[][] = [];
  const fo = (): void => { if (ow.length > 1) walls.push({ id: `${r.id}-O${++nO}`, kind: 'ramp-out', thick: 0.8, pts: ow }); ow = []; };
  const fi = (): void => { if (iw.length > 1) walls.push({ id: `${r.id}-I${++nI}`, kind: 'ramp-in', thick: 0.8, pts: iw }); iw = []; };
  const fs = (): void => { if (os.length > 1) slopes.push({ id: `${r.id}-S${++nS}`, kind: 'ramp', pts: os }); os = []; };
  for (const x of sel) { const lev = x[4], nat = x[5], h = lev - nat; const eA = [x[7], x[8]], eB = [x[9], x[10]]; const aIn = Math.abs(eA[1]) <= Math.abs(eB[1]); const inn = aIn ? eA : eB, out = aIn ? eB : eA;
    let ex = out[0] - inn[0], ev = out[1] - inn[1]; const el = Math.hypot(ex, ev) || 1; ex /= el; ev /= el; const nW = dirW(ex, ev);
    const pO = toW(out[0] + ex * 0.6, out[1] + ev * 0.6), pI = toW(inn[0] - ex * 0.6, inn[1] - ev * 0.6), pi = toW(inn[0], inn[1]), po = toW(out[0], out[1]);
    rib.push([r2(pI.x), r2(pI.z), r2(pi.x), r2(pi.z), r2(po.x), r2(po.z), r2(pO.x), r2(pO.z), r2(lev)]);
    if (h > WALL_MIN) { fs(); ow.push([r2(pO.x), r2(pO.z), r2(lev), r2(nat - EMBED), r2(nW[0]), r2(nW[1])]); maxH = Math.max(maxH, h); }
    else if (h > 0.05) { fo(); const toeP = toW(out[0] + ex * (0.6 + 2 * h), out[1] + ev * (0.6 + 2 * h)); os.push([r2(pO.x), r2(pO.z), r2(lev), r2(toeP.x), r2(toeP.z), r2(nat)]); } else { fo(); fs(); }
    const bot = x[11] ? nat : Math.max(nat, existing(x[0], inn[1] - Math.sign(inn[1]) * 0.6)); const hIn = lev - bot;
    if (hIn > 0.3) { iw.push([r2(pI.x), r2(pI.z), r2(lev), r2(bot - EMBED), r2(-nW[0]), r2(-nW[1])]); maxIn = Math.max(maxIn, hIn); } else fi(); }
  fo(); fi(); fs(); rampStat.push({ id: r.id, maxOuterH: r2(maxH), maxInnerH: r2(maxIn) }); surfRamps.push({ id: r.id, rows: rib });
  let acc = 0, last: number[] | null = null, k = 0; for (const x of rows) { if (last) acc += Math.hypot(x[0] - last[0], x[1] - last[1]); last = x; if (x[11] || acc < 40) continue; acc = 0; const aIn = Math.abs(x[8]) <= Math.abs(x[10]); const out = aIn ? [x[9], x[10]] : [x[7], x[8]]; const inn = aIn ? [x[7], x[8]] : [x[9], x[10]]; let ex = out[0] - inn[0], ev = out[1] - inn[1]; const el = Math.hypot(ex, ev) || 1; ex /= el; ev /= el; const p = toW(out[0] + ex * 0.35, out[1] + ev * 0.35); const dn = dirW(-ex, -ev); lights.push({ id: `${r.id}-L${++k}`, kind: 'ramp', x: r2(p.x), z: r2(p.z), y: r2(x[4]), dx: r2(dn[0]), dz: r2(dn[1]) }); } }

// ---- 4) wing walls of J7-A (4): REAL tops from the ramp rows; visible face toward the ring (v 22.7), slab 0.6 into the ramp fill
const wingReal: any[] = [];
for (const w of SA.wing) { const sideV = w.side === 'L' ? 1 : -1; const ramp = RM.ramps.find((r: any) => Math.sign(r.rows[0][0]) === (w.portal === 'E' ? 1 : -1) && Math.sign(r.rows[Math.min(60, r.rows.length - 1)][1]) === sideV); if (!ramp) { wingReal.push({ id: w.id, error: 'no ramp' }); continue; }
  const lev = (u: number): number => { const R = ramp.rows; for (let i = 0; i < R.length - 1; i++) { const a = Math.abs(R[i][0]), b = Math.abs(R[i + 1][0]); if (a <= Math.abs(u) && Math.abs(u) <= b && b > a) return R[i][4] + (R[i + 1][4] - R[i][4]) * (Math.abs(u) - a) / (b - a); } return NaN; };
  const nrm = dirW(0, -sideV); const pts: Pt[] = [];
  const rows = w.rows.map((q: any) => { const rt = r2(lev(q.u)); const p = toW(q.u, sideV * w.vFace); pts.push([r2(p.x), r2(p.z), rt, r2(q.ring - EMBED), r2(nrm[0]), r2(nrm[1])]); return { d: q.d, u: q.u, assumedTop: q.top, realTop: rt, ring: q.ring, realH: r2(rt - q.ring) }; });
  walls.push({ id: w.id, kind: 'wing', thick: 0.6, pts }); wingReal.push({ id: w.id, ramp: ramp.id, rows }); }

// ---- 5) ring underpass box walls (J7-A numbers): outer walls v 22.7..23.7, central wall v -0.6..0.6, bottom = ring level - 0.5, top = roof soffit; stations every 134 / 27 m
{ const B = SA.box; const N = 27; for (const [id, vf, nv, th] of [['BOX-OL', 22.7, -1, 1.0], ['BOX-OR', -22.7, 1, 1.0], ['BOX-C', 0.6, 1, 1.2]] as [string, number, number, number][]) { const pts: Pt[] = []; const nrm = dirW(0, nv);
    for (let i = 0; i <= N; i++) { const u = B.u0 + (B.u1 - B.u0) * i / N; const p = toW(u, vf); pts.push([r2(p.x), r2(p.z), B.roof.soffitY, r2(ringY(u) - EMBED), r2(nrm[0]), r2(nrm[1])]); }
    walls.push({ id, kind: 'box', thick: th, pts }); } }

// ---- 6) lights: arms (every 40 m, alternate sides, not under the rail viaduct deck + 3 m), platform rim, island, box
const sAt = (rows: number[][], s: number): { x: number; z: number; y: number; nx: number; nz: number } | null => { for (let i = 0; i < rows.length - 1; i++) if (rows[i][0] <= s && s <= rows[i + 1][0]) { const t = (s - rows[i][0]) / (rows[i + 1][0] - rows[i][0]); const dx = rows[i + 1][1] - rows[i][1], dz = rows[i + 1][2] - rows[i][2], L = Math.hypot(dx, dz); return { x: rows[i][1] + dx * t, z: rows[i][2] + dz * t, y: rows[i][3] + (rows[i + 1][3] - rows[i][3]) * t, nx: -dz / L, nz: dx / L }; } return null; };
const RAIL_WIN: [number, number] = [SB.road.sUnderDeck[0] - 3, SB.road.sUnderDeck[1] + 3];
for (const id of ['R6', 'R4']) { const A = T.arms[id]; let k = 0; for (let s = 40; s < A.length - 10; s += 40) { if (id === 'R6' && s >= RAIL_WIN[0] && s <= RAIL_WIN[1]) continue; const p = sAt(A.rows, s); if (!p) continue; const sd = (++k % 2) ? 1 : -1; const off = A.top - 0.35; lights.push({ id: `${id}-L${k}`, kind: 'arm', x: r2(p.x + sd * p.nx * off), z: r2(p.z + sd * p.nz * off), y: r2(p.y), dx: r2(-sd * p.nx), dz: r2(-sd * p.nz) }); } }
for (let a = -180, k = 0; a < 180; a += 20) { if (isOpen(a) || isOpen(a + 8) || isOpen(a - 8)) continue; const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); const p = toW(62.35 * c, 62.35 * s); const d = dirW(-c, -s); lights.push({ id: `PLAT-L${++k}`, kind: 'platform', x: r2(p.x), z: r2(p.z), y: DECK, dx: r2(d[0]), dz: r2(d[1]) }); }
for (let a = 0, k = 0; a < 360; a += 45) { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); const p = toW(46 * c, 46 * s); lights.push({ id: `ISL-M${++k}`, kind: 'island', x: r2(p.x), z: r2(p.z), y: DECK, dx: 0, dz: 0 }); }
const boxLamps: any[] = []; for (let u = -60; u <= 60; u += 10) for (const v of [-11.65, 11.65]) { const p = toW(u, v); boxLamps.push({ x: r2(p.x), z: r2(p.z), y: r2(SA.box.roof.soffitY - 0.35) }); }

// ---- 7) signs: 2 ring gantries (span +-24.5, beam bottom 6.5 m over the ring) + 2 roadside boards on the arms. NO legends yet (J8 / J11)
const signs: any[] = []; for (const u of [-330, 330]) { const p = toW(u, 0); signs.push({ id: `GANTRY-${u < 0 ? 'W' : 'E'}`, kind: 'gantry', x: r2(p.x), z: r2(p.z), y: r2(ringY(u)), u, span: 24.5, clear: 6.5, boardW: 9, boardH: 2.6, yaw: r2(yaw) }); }
for (const id of ['R6', 'R4']) { const A = T.arms[id]; const p = sAt(A.rows, 120)!; const e = A.top + 1.2; signs.push({ id: `${id}-SIGN`, kind: 'roadside', x: r2(p.x + p.nx * e), z: r2(p.z + p.nz * e), y: r2(p.y), nx: r2(p.nx), nz: r2(p.nz), boardW: 3.2, boardH: 1.8, clear: 2.2 }); }

const stat = (kind: string): { n: number; len: number; maxH: number } => { let n = 0, len = 0, maxH = 0; for (const w of walls) if (w.kind === kind) { n++; for (let i = 0; i < w.pts.length; i++) { maxH = Math.max(maxH, w.pts[i][2] - w.pts[i][3] - EMBED); if (i) len += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]); } } return { n, len: r2(len), maxH: r2(maxH) }; };
const out = { generated: new Date().toISOString().slice(0, 10), frame: FR, rule: { wallMin: WALL_MIN, embed: EMBED, parapet: { w: 0.5, h: 0.9 }, wallPointFormat: '[x, z, top, bottom, nx, nz]', slopePointFormat: '[edgeX, edgeZ, edgeLevel, toeX, toeZ, naturalLevel]', rampSurfFormat: '[padX, padZ, innX, innZ, outX, outZ, pOutX, pOutZ, level] (pad = 0.6 m shoulder beyond the pavement edge)' },
  deck: { cx: FR.ox, cz: FR.oz, yaw, y: DECK, ri: 48, ro: 62, face: RFACE }, box: { u0: SA.box.u0, u1: SA.box.u1, vHalf: SA.box.outsideW / 2, roofTop: DECK, soffit: SA.box.roof.soffitY }, ringTable: RT.filter((_, i) => i % 1 === 0).slice(100, 200).map((q) => [q[0], q[1]]),
  walls, slopes, lights, boxLamps, signs, surfArms, surfRamps, wing: wingReal, ramps: rampStat,
  totals: { platform: stat('platform'), arm: stat('arm'), rampOut: stat('ramp-out'), rampIn: stat('ramp-in'), wing: stat('wing'), box: stat('box'), lights: lights.length, boxLamps: boxLamps.length, signs: signs.length } };
writeFileSync('docs/J300_STRUCT_C.json', JSON.stringify(out));
const body = JSON.stringify({ rule: out.rule, deck: out.deck, box: out.box, ringTable: out.ringTable, walls, slopes, lights, boxLamps, signs, surfArms, surfRamps, wing: wingReal, totals: out.totals });
writeFileSync('src/roads/junction/J300StructC.ts', `// J300 STRUCTURES PART C (J7-C), GENERATED by scripts/j300-struct-c-gen.ts. Retaining walls, earth slopes, road surface ribbons, light and sign positions, real wing wall tops. Pure data, world coordinates (x east, z south, y up), levels in m.\n// wall point [x, z, top, bottom, nx, nz] (n = unit normal on the visible face side, slab goes the other way); slope point [edgeX, edgeZ, edgeLevel, toeX, toeZ, naturalLevel].\nexport const J300_STRUCT_C = ${body} as const;\n`);
console.log('walls', walls.length, 'slopes', slopes.length, 'lights', lights.length, 'signs', signs.length); console.log(JSON.stringify(out.totals));
console.log('wing', JSON.stringify(wingReal.map((w) => w.rows ? [w.id, w.rows[0].assumedTop, w.rows[0].realTop] : w)));
