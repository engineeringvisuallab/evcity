// Side view of every ramp of one interchange in the REAL terrain: natural ground, ramp surface, bridge stretches and piers.
// Run: npx tsx scripts/interchange-profile.ts   -> docs/interchange-preview/profile.svg
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

const base = new TerrainGenerator(Config.world.seed);
const hw = base.roads.roads.filter((r) => r.kind === 'highway' && !r.earth).sort((a, b) => b.length - a.length)[0];
const k = Math.floor(hw.xs.length / 2);
const yaw = Math.atan2(hw.zs[k + 1] - hw.zs[k - 1], hw.xs[k + 1] - hw.xs[k - 1]);
Config.roads.interchange.enabled = true;
Config.roads.interchange.list.push({ id: 'T1', pattern: 'cloverleaf', x: hw.xs[k], z: hw.zs[k], yaw, main: 'highway', cross: 'avenue' });
const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const ramps = R.roads.filter((r) => r.kind === 'ramp');

const W = 1100;
const rowH = 150;
const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${rowH * ramps.length + 30}" font-family="sans-serif" font-size="12"><rect width="100%" height="100%" fill="#fff"/>`];
ramps.forEach((r, ri) => {
  const y0 = 20 + ri * rowH;
  const lo = Math.min(...r.ys, ...Array.from(r.xs, (x, i) => g.heightAt(x, r.zs[i]))) - 1;
  const hi = Math.max(...r.ys) + 2;
  const X = (s: number): number => 60 + (s / r.length) * (W - 90);
  const Y = (h: number): number => y0 + rowH - 28 - ((h - lo) / (hi - lo)) * (rowH - 50);
  out.push(`<text x="4" y="${y0 + 12}" font-weight="bold">${r.name}</text>`);
  // ground (terrain AS BUILT, with the road cut and fill) and natural ground
  const pts = (f: (i: number) => number): string => Array.from(r.xs, (_, i) => `${X(i * r.step).toFixed(1)},${Y(f(i)).toFixed(1)}`).join(' ');
  out.push(`<polyline fill="none" stroke="#b08a4a" stroke-width="2" points="${pts((i) => g.heightAt(r.xs[i], r.zs[i]))}"/>`);
  out.push(`<polyline fill="none" stroke="#2c7" stroke-width="1" stroke-dasharray="3 3" points="${pts((i) => r.hNat[i])}"/>`);
  // bridge stretches (slab) and piers
  const done = new Set<number>();
  for (let i = 0; i < r.xs.length; i++) {
    const id = r.bridgeOf[i];
    if (id < 0 || done.has(id)) continue;
    done.add(id);
    const b = R.bridges[id];
    out.push(`<rect x="${X(b.i0 * r.step)}" y="${Y(Math.max(...r.ys.slice(b.i0, b.i1 + 1))) - 3}" width="${X(b.i1 * r.step) - X(b.i0 * r.step)}" height="${(rowH - 50) + 4}" fill="#9cf" opacity="0.18"/>`);
    const n = Math.max(1, Math.ceil(b.spanM / 25));
    const approach = (b.lengthM - b.spanM) / 2;
    for (let q = 1; q < n; q++) {
      const s = b.i0 * r.step + approach + (b.spanM * q) / n;
      const idx = Math.min(r.xs.length - 1, Math.round(s / r.step));
      const gy = g.heightAt(r.xs[idx], r.zs[idx]);
      out.push(`<rect x="${X(s) - 2}" y="${Y(r.ys[idx] - 1.1)}" width="4" height="${Math.max(1, Y(gy) - Y(r.ys[idx] - 1.1))}" fill="#555"/>`);
    }
  }
  out.push(`<polyline fill="none" stroke="#c0392b" stroke-width="3" points="${pts((i) => r.ys[i])}"/>`);
  out.push(`<text x="${W - 300}" y="${y0 + 12}" fill="#444">length ${r.length.toFixed(0)} m · max height over ground ${Math.max(...Array.from(r.ys, (y, i) => y - g.heightAt(r.xs[i], r.zs[i]))).toFixed(1)} m</text>`);
});
out.push(`<text x="4" y="${rowH * ramps.length + 22}" fill="#333">red = ramp surface, brown = terrain as built (after cut/fill), green dashed = natural ground, blue band = bridge (dry viaduct), dark bars = piers</text></svg>`);
writeFileSync('docs/interchange-preview/profile.svg', out.join('\n'));
console.log('wrote profile.svg,', ramps.length, 'ramps');
