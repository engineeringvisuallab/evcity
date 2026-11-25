// J7-C WATER CHECK (runs FIRST). Real game natural terrain (sampleNatural), a point is wet if sc.water > sc.h. Read only.  Run: npx tsx scripts/j300-struct-c-water.ts   -> docs/J300_STRUCT_C_WATER.txt
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
const rd = (f: string): any => JSON.parse(readFileSync('docs/' + f, 'utf8'));
const T = rd('J300_TERRAIN.json'), RM = rd('J300_RAMPS.json'), FR = T.frame;
const g: any = new TerrainGenerator(Config.world.seed); const sc: any = { h: 0, water: NaN, fx: 0, fz: 0 };
const wet = (x: number, z: number): boolean => { g.sampleNatural(x, z, sc); return Number.isFinite(sc.water) && sc.water > sc.h; };
const ux = Math.cos(FR.yaw), uz = Math.sin(FR.yaw); const toW = (u: number, v: number): number[] => [FR.ox + u * ux + v * uz, FR.oz + u * uz - v * ux];
const L: string[] = ['J7-C WATER CHECK (sc.water > sc.h, real natural terrain, nothing changed)']; let bad = 0;
const rep = (name: string, n: number, w: number): void => { bad += w; L.push(`${w === 0 ? 'PASS' : 'FAIL'}  ${name}  ${n} points, ${w} wet`); };
{ let n = 0, w = 0; for (let r = 0; r <= 66; r += 3) for (let a = 0; a < 360; a += 5) { const p = toW(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)); n++; if (wet(p[0], p[1])) w++; } rep('platform disc r 0..66', n, w); }
for (const k of ['R6', 'R4']) { let n = 0, w = 0; for (const r of T.arms[k].rows) for (const [x, z] of [[r[1], r[2]], [r[7], r[8]], [r[11], r[12]]]) { n++; if (wet(x, z)) w++; } rep(`arm ${k} centre + both toes`, n, w); }
for (const r of RM.ramps) { let n = 0, w = 0; for (const x of r.rows) { if (Math.abs(x[0]) > r.noseX) continue; for (const [u, v] of [[x[7], x[8]], [x[9], x[10]]]) { const p = toW(u, v); n++; if (wet(p[0], p[1])) w++; } } rep(`ramp ${r.id} both edges`, n, w); }
{ let n = 0, w = 0; for (let u = -90; u <= 90; u += 5) for (const v of [-30, 0, 30]) { const p = toW(u, v); n++; if (wet(p[0], p[1])) w++; } rep('ring box area u -90..90', n, w); }
L.push(`SUMMARY water: ${bad === 0 ? 'ALL PASS (headless run)' : 'FAIL ' + bad + ' wet points'}`); writeFileSync('docs/J300_STRUCT_C_WATER.txt', L.join('\n') + '\n'); console.log(L.join('\n'));
