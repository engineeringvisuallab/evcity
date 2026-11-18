// FLAT-RESIDENTIAL STEP 1 (headless, reads only, changes nothing in src/): terrain height + slope of every residential zone (and villages).
// Run: npx tsx scripts/residential-flat-scan.ts [out-dir] [--flat]   writes residential_scan.json (with --flat: residential_scan_flat.json), prints the table.
import { writeFileSync, mkdirSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { getWorldZoneAt, WORLD_ZONES } from '../src/city/WorldZones';

const out = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'docs';
// STEP 2: add --flat to scan the ground WITH the residential flattening (ResidentialFlat.ts); without it the natural ground is scanned (Step 1 numbers)
const useFlat = process.argv.includes('--flat');
mkdirSync(out, { recursive: true });
const gen = new TerrainGenerator(Config.world.seed);
const sc = { h: 0, water: NaN, fx: 0, fz: 0 };
const nat = (x: number, z: number) => { gen.sampleNatural(x, z, sc); if (useFlat) gen.residentialFlat.apply(x, z, sc); return { h: sc.h, w: sc.water }; };
const CELL = 25, HALF = 5000, D = 25;
const ids = WORLD_ZONES.filter((z) => z.kind === 'residential' || z.kind === 'village').map((z) => z.id);
const acc: Record<string, { h: number[]; s: number[]; water: number; n: number; xs: number[]; zs: number[] }> = {};
for (const id of ids) acc[id] = { h: [], s: [], water: 0, n: 0, xs: [], zs: [] };
for (let z = -HALF; z < HALF; z += CELL) for (let x = -HALF; x < HALF; x += CELL) {
  const hit = getWorldZoneAt(x, z); const a = acc[hit.id]; if (!a) continue;
  a.n++; const g = nat(x, z);
  if (g.h < 0.2 || (!Number.isNaN(g.w) && g.h < g.w - 0.05)) { a.water++; continue; }
  const hx = nat(x + D, z).h - nat(x - D, z).h, hz = nat(x, z + D).h - nat(x, z - D).h;
  a.h.push(g.h); a.s.push((Math.hypot(hx, hz) / (2 * D)) * 100); a.xs.push(x); a.zs.push(z);
}
const q = (v: number[], p: number) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (v: number, d = 1) => (Number.isNaN(v) ? '-' : v.toFixed(d));
const rows: any[] = [];
console.log('zone              kind         ha    water%  h min   p10   med   p90   max  | slope med  p90  | <3%  3-8%  8-15%  >15%');
for (const id of ids) {
  const a = acc[id]; const z = WORLD_ZONES.find((k) => k.id === id)!; const m = a.s.length || 1;
  const sh = (lo: number, hi: number) => (a.s.filter((s) => s >= lo && s < hi).length / m) * 100;
  const r = { id, kind: z.kind, ha: (a.n * CELL * CELL) / 1e4, waterPct: (a.water / (a.n || 1)) * 100, hMin: q(a.h, 0), h10: q(a.h, 0.1), hMed: q(a.h, 0.5), h90: q(a.h, 0.9), hMax: q(a.h, 0.9999),
    sMed: q(a.s, 0.5), s90: q(a.s, 0.9), flat: sh(0, 3), gentle: sh(3, 8), rolling: sh(8, 15), steep: sh(15, 1e9),
    cx: a.xs.length ? a.xs.reduce((s, v) => s + v, 0) / a.xs.length : z.x, cz: a.zs.length ? a.zs.reduce((s, v) => s + v, 0) / a.zs.length : z.z };
  rows.push(r);
  console.log(`${id.padEnd(16)} ${z.kind.padEnd(11)} ${f(r.ha, 0).padStart(5)} ${f(r.waterPct, 0).padStart(6)}  ${f(r.hMin).padStart(6)} ${f(r.h10).padStart(5)} ${f(r.hMed).padStart(5)} ${f(r.h90).padStart(5)} ${f(r.hMax).padStart(5)}  | ${f(r.sMed).padStart(7)} ${f(r.s90).padStart(5)}  | ${f(r.flat, 0).padStart(3)} ${f(r.gentle, 0).padStart(5)} ${f(r.rolling, 0).padStart(6)} ${f(r.steep, 0).padStart(5)}`);
}
writeFileSync(`${out}/${useFlat ? 'residential_scan_flat' : 'residential_scan'}.json`, JSON.stringify(rows, null, 1));
