// Digest of a generated road network (roads, pads, bridges): used to prove "scenario OFF == the original game".
// Run: npx tsx scripts/j6-net-digest.ts   -> prints JSON {roads, pads, bridges, hash, perRoad}
import { createHash } from 'node:crypto';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';

const f = (a: ArrayLike<number>): string => Array.from(a, (v) => v.toFixed(4)).join(',');
const h = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 16);

export interface NetDigest {
  roads: number;
  pads: number;
  bridges: number;
  hash: string;
  perRoad: Record<string, { geo: string; full: string }>;
}

export function digestNetwork(R: any): NetDigest {
  const perRoad: Record<string, { geo: string; full: string }> = {};
  const all: string[] = [];
  for (const r of R.roads) {
    const geo = h(`${r.name}|${r.kind}|${f(r.xs)}|${f(r.zs)}`);
    const full = h(`${geo}|${f(r.ys)}|${f(r.hNat)}|${Array.from(r.bridgeOf).join(',')}`);
    perRoad[`${r.id}:${r.name}`] = { geo, full };
    all.push(full);
  }
  for (const p of R.pads) all.push(h(`${p.id}|${p.x.toFixed(4)}|${p.z.toFixed(4)}|${p.y.toFixed(4)}|${p.kind}|${p.arms.map((a: any) => `${a.roadId}@${a.theta.toFixed(4)}`).join(';')}`));
  for (const b of R.bridges) all.push(h(`${b.id}|${b.roadId}|${b.i0}|${b.i1}|${b.type}|${b.spanM}`));
  return { roads: R.roads.length, pads: R.pads.length, bridges: R.bridges.length, hash: h(all.join('|')), perRoad };
}

if (process.argv[1] && process.argv[1].endsWith('j6-net-digest.ts')) {
  const g: any = new TerrainGenerator(Config.world.seed);
  console.log(JSON.stringify(digestNetwork(g.roads)));
}
