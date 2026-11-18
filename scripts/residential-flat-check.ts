// FLAT-RESIDENTIAL STEP 2 check (headless): before / after of the 6 flat residential zones.
// Run: npx tsx scripts/residential-flat-check.ts      (prints PASS / FAIL lines, exit code 1 if any FAIL)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { getWorldZoneAt } from '../src/city/WorldZones';
import { FLAT_ZONES, FLAT_CAP, BANK_REACH } from '../src/terrain/ResidentialFlat';

const gen = new TerrainGenerator(Config.world.seed);
const flat = gen.residentialFlat;
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
/** Ground without roads (natural + flat), flat on / off. */
const gnd = (x: number, z: number, on: boolean) => { flat.enabled = on; gen.sampleNatural(x, z, sc); flat.apply(x, z, sc); flat.enabled = true; return { h: sc.h, w: sc.water }; };
/** The ground of the game (roads, rail, pads included). */
const full = (x: number, z: number, on: boolean) => { flat.enabled = on; gen.sample(x, z, sc); flat.enabled = true; return { h: sc.h, w: sc.water }; };
const isWet = (g: { h: number; w: number }) => g.h < 0.2 || (!Number.isNaN(g.w) && g.h < g.w - 0.05);
const q = (v: number[], p: number) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (v: number, d = 1) => (Number.isNaN(v) ? '-' : v.toFixed(d));
let fails = 0;
const verdict = (ok: boolean, name: string, info: string) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); };

const CELL = 25, D = 25;
console.log('=== 1. slope of the zone ground (ground without roads; land cells; slope over 50 m) ===');
console.log('zone            p90 before -> after | <3% before -> after | 3-8% before -> after | max |change| m');
const slopeAfterP90: Record<string, number> = {};
for (const zd of FLAT_ZONES) {
  const sb: number[] = [], sa: number[] = []; let maxChange = 0;
  for (let z = -5000; z < 5000; z += CELL) for (let x = -5000; x < 5000; x += CELL) {
    if (getWorldZoneAt(x, z).id !== zd.id) continue;
    const b = gnd(x, z, false); if (isWet(b)) continue;
    const a = gnd(x, z, true);
    maxChange = Math.max(maxChange, Math.abs(a.h - b.h));
    const sl = (on: boolean) => { const hx = gnd(x + D, z, on).h - gnd(x - D, z, on).h, hz = gnd(x, z + D, on).h - gnd(x, z - D, on).h; return (Math.hypot(hx, hz) / (2 * D)) * 100; };
    sb.push(sl(false)); sa.push(sl(true));
  }
  const sh = (v: number[], lo: number, hi: number) => (v.filter((s) => s >= lo && s < hi).length / (v.length || 1)) * 100;
  slopeAfterP90[zd.id] = q(sa, 0.9);
  console.log(`${zd.id.padEnd(14)}  ${f(q(sb, 0.9)).padStart(5)} -> ${f(q(sa, 0.9)).padEnd(5)}      | ${f(sh(sb, 0, 3), 0).padStart(3)}% -> ${f(sh(sa, 0, 3), 0).padStart(3)}%       | ${f(sh(sb, 3, 8), 0).padStart(3)}% -> ${f(sh(sa, 3, 8), 0).padStart(3)}%         | ${f(maxChange)}`);
  verdict(maxChange <= FLAT_CAP + 0.01, `${zd.id}: cut/fill <= ${FLAT_CAP} m`, `max change ${f(maxChange, 2)} m`);
}

console.log('\n=== 2. blend outside the zones: jump per 5 m that the flattening ADDED (natural step <= 0.5 m, after step > 0.5 m) ===');
for (const zd of FLAT_ZONES) {
  // box around the zone
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let z = -5000; z < 5000; z += 50) for (let x = -5000; x < 5000; x += 50) if (getWorldZoneAt(x, z).id === zd.id) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const m = zd.blend + 60; let added = 0, worst = 0, n = 0, natBig = 0, wx = 0, wz = 0;
  for (let z = z0 - m; z < z1 + m; z += 5) for (let x = x0 - m; x < x1 + m; x += 5) {
    if (getWorldZoneAt(x, z).id === zd.id) continue; // outside the zone only (inside it is the level itself)
    const b = gnd(x, z, false); if (isWet(b)) continue;
    const a = gnd(x, z, true); if (Math.abs(a.h - b.h) < 1e-6) continue; // not touched
    n++;
    for (const [dx, dz] of [[5, 0], [0, 5]]) {
      const b2 = gnd(x + dx, z + dz, false), a2 = gnd(x + dx, z + dz, true); if (isWet(b2)) continue;
      const jb = Math.abs(b2.h - b.h), ja = Math.abs(a2.h - a.h);
      if (jb > 0.5) natBig++;
      if (ja > 0.5 && jb <= 0.5) { added++; if (ja > worst) { worst = ja; wx = x; wz = z; } }
    }
  }
  verdict(added === 0, `${zd.id}: no jump > 0.5 m / 5 m added in the blend`, `touched cells ${n}, jumps added ${added}, worst ${f(worst, 2)} m / 5 m at (${Math.round(wx)}, ${Math.round(wz)}), (natural steps > 0.5 m: ${natBig})`);
}

console.log('\n=== 3. water: no wet ground is changed, no dry ground is flooded (ground without roads) ===');
for (const zd of FLAT_ZONES) {
  let changedWet = 0, flooded = 0, n = 0;
  for (let z = -5000; z < 5000; z += 10) for (let x = -5000; x < 5000; x += 10) {
    if (getWorldZoneAt(x, z).id !== zd.id) continue;
    const b = gnd(x, z, false); const a = gnd(x, z, true); n++;
    if (isWet(b) && Math.abs(a.h - b.h) > 1e-6) changedWet++;
    if (!isWet(b) && isWet(a)) flooded++;
  }
  verdict(changedWet === 0 && flooded === 0, `${zd.id}: water / banks`, `cells ${n}, wet changed ${changedWet}, flooded ${flooded}`);
}

console.log('\n=== 4. roads of the game in the zones: ground at the road vs the road level (game ground, roads + earthworks) ===');
const roads: any[] = gen.roads.roads;
for (const zd of FLAT_ZONES) {
  let pts = 0, offB = 0, offA = 0, maxOffB = 0, maxOffA = 0, brg = 0, clrB = 1e9, clrA = 1e9, buried = 0;
  for (const r of roads) for (let i = 0; i < r.xs.length; i++) {
    if (getWorldZoneAt(r.xs[i], r.zs[i]).id !== zd.id) continue;
    pts++;
    const b = full(r.xs[i], r.zs[i], false), a = full(r.xs[i], r.zs[i], true);
    if (r.bridgeOf[i] >= 0) { brg++; clrB = Math.min(clrB, r.ys[i] - b.h); clrA = Math.min(clrA, r.ys[i] - a.h); if (r.ys[i] - a.h < 0.5 && r.ys[i] - b.h >= 0.5) buried++; continue; }
    const ob = Math.abs(b.h - r.ys[i]), oa = Math.abs(a.h - r.ys[i]);
    maxOffB = Math.max(maxOffB, ob); maxOffA = Math.max(maxOffA, oa);
    if (ob > 0.35) offB++; if (oa > 0.35) offA++;
  }
  verdict(offA <= offB && buried === 0, `${zd.id}: roads stay on the ground`, `road points ${pts} (bridge ${brg}); ground-vs-road > 0.35 m: before ${offB} (max ${f(maxOffB, 2)}), after ${offA} (max ${f(maxOffA, 2)}); bridge clearance min ${f(clrB)} -> ${f(clrA)} m, decks buried by the flattening ${buried}`);
}

console.log('\n=== 5. goal p90 slope <= 5%: measured on the ground that CAN be flattened (ground without roads; roads = section 7, plots = section 6) ===');
console.log('   counted: dry land, >= 115 m from every river / lake edge (90 m bank fade + 25 m slope stencil), natural ground within 6 m of the zone level (hills and the river valley are NOT counted)');
{
  const wq = { d: 1e9, level: 0 };
  const waterD = (x: number, z: number) => { wq.d = 1e9; gen.rivers.edgeDistance(x, z, wq); gen.lakes.edgeDistance(x, z, BANK_REACH + 30, wq); return wq.d; };
  for (const zd of FLAT_ZONES) {
    const sl: number[] = []; let all = 0;
    for (let z = -5000; z < 5000; z += CELL) for (let x = -5000; x < 5000; x += CELL) {
      if (getWorldZoneAt(x, z).id !== zd.id) continue;
      const b = gnd(x, z, false); if (isWet(b)) continue;
      all++;
      if (Math.abs(b.h - zd.level) > 6 || waterD(x, z) < 115) continue;
      const hx = gnd(x + D, z, true).h - gnd(x - D, z, true).h, hz = gnd(x, z + D, true).h - gnd(x, z - D, true).h;
      sl.push((Math.hypot(hx, hz) / (2 * D)) * 100);
    }
    const p = q(sl, 0.9);
    verdict(p <= 5, `${zd.id}: p90 slope <= 5% on flattenable land`, `p90 ${f(p)}% (all-land p90 ${f(slopeAfterP90[zd.id])}%), counted cells ${sl.length} of ${all} (${f((sl.length / (all || 1)) * 100, 0)}%)`);
  }
}

console.log('\n=== 6. STEP 3: building plots of the 6 zones (pad on / off; ground of the game, roads included) ===');
{
  const pads = flat.plotPads;
  verdict(pads.length > 0, 'plot pads built', `${pads.length} plots`);
  for (const p of pads) {
    const rng = (on: boolean) => {
      flat.plotsEnabled = on; let mn = 1e9, mx = -1e9, wet = 0;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const lx = (i / 2) * (p.W / 2), lz = (j / 2) * (p.D / 2);
        const g = full(p.x + lx * p.c + lz * p.s, p.z - lx * p.s + lz * p.c, true); mn = Math.min(mn, g.h); mx = Math.max(mx, g.h); if (isWet(g)) wet++;
      }
      flat.plotsEnabled = true; return { r: mx - mn, wet };
    };
    const b = rng(false), a = rng(true);
    // outside the pad + blend nothing changes (probe a ring 40 m from the plot centre edge)
    let far = 0; const R = Math.hypot(p.W, p.D) / 2 + 12 + 30;
    for (let k = 0; k < 16; k++) { const x = p.x + R * Math.cos(k * Math.PI / 8), z = p.z + R * Math.sin(k * Math.PI / 8); if (pads.some((o) => o !== p && (x - o.x) ** 2 + (z - o.z) ** 2 <= o.reach2)) continue; flat.plotsEnabled = false; const h0 = full(x, z, true).h; flat.plotsEnabled = true; if (Math.abs(full(x, z, true).h - h0) > 1e-6) far++; }
    verdict(a.r <= Math.max(0.5, b.r) && a.wet === b.wet && far === 0, `plot (${p.x}, ${p.z}) ${p.W}x${p.D}: flat, no flooding, local only`, `ground range under the plot ${f(b.r, 2)} -> ${f(a.r, 2)} m, wet points ${b.wet} -> ${a.wet}, changed far away ${far}`);
    verdict(a.r <= 0.6, `plot (${p.x}, ${p.z}): range under the plot <= 0.6 m`, `${f(a.r, 2)} m`);
  }
}

console.log('\n=== 7. STEP 3: cross slope of the fixed R2 / L / C streets (ground across the pavement, bridges skipped) + their grade (info) ===');
for (const zd of FLAT_ZONES) {
  let n = 0, bad = 0, mx = 0; const steep: string[] = [];
  for (const r of roads) {
    if (!/^(R2|L|C)-/.test(r.name)) continue;
    let maxG = 0, inZone = 0;
    for (let i = 0; i < r.xs.length; i++) {
      if (getWorldZoneAt(r.xs[i], r.zs[i]).id !== zd.id || r.bridgeOf[i] >= 0) continue;
      inZone++;
      const w = r.halfWidth, a = full(r.xs[i] + r.nx[i] * w, r.zs[i] + r.nz[i] * w, true).h, b = full(r.xs[i] - r.nx[i] * w, r.zs[i] - r.nz[i] * w, true).h;
      const cs = (Math.abs(a - b) / (2 * w)) * 100; n++; mx = Math.max(mx, cs); if (cs > 3) bad++;
      if (i > 0) maxG = Math.max(maxG, (Math.abs(r.ys[i] - r.ys[i - 1]) / Math.hypot(r.xs[i] - r.xs[i - 1], r.zs[i] - r.zs[i - 1])) * 100);
    }
    if (inZone && maxG > 4) steep.push(`${r.name} ${f(maxG)}%`);
  }
  verdict(bad === 0, `${zd.id}: street cross slope <= 3 %`, `points ${n}, max ${f(mx, 2)} %, over 3 %: ${bad}`);
  console.log(`   INFO fixed street grade > 4 % (heights are fixed, not changed): ${steep.join(', ') || 'none'}`);
}

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAIL'}`);
process.exit(fails ? 1 : 0);
