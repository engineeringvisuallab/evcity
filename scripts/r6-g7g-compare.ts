// STEP G7g (headless): fingerprint of everything that must NOT change when R6-8 and the two slips join the game: every road except R6-8 / R6-8:m1 / R6-8:m2 (points, heights, bridge marks), the J1-E arm, the ring and M8 roads, the junction pads, the bridges, the railway.
// Run: npx tsx scripts/r6-g7g-compare.ts      (run once on the old src and once on the new src, compare the lines)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
const gen: any = new TerrainGenerator(Config.world.seed);
const NEW = new Set(['R6-8', 'R6-8:m1', 'R6-8:m2']);
const hash = (vals: number[]) => { let h = 0; for (const v of vals) h = (h * 31 + Math.round(v * 100)) % 1000000007; return h; };
const roads = (gen.roads.roads as any[]).filter((r) => !NEW.has(r.name));
const all: number[] = [], arm: number[] = [], big: number[] = [];
for (const r of roads) { const v: number[] = []; for (let i = 0; i < r.xs.length; i++) v.push(r.xs[i], r.zs[i], r.ys[i], r.bridgeOf ? r.bridgeOf[i] : -1); all.push(...v); if (r.name === 'J1-E') arm.push(...v); if (r.tier === 1 && r.name !== 'J1-E') big.push(...v); }
const pads = gen.roads.pads as any[]; const padv: number[] = []; for (const p of pads) padv.push(p.x, p.z, p.rCore);
const br = (gen.roads.bridges ?? []) as any[]; const e = gen.rail.edges as any[]; const rv: number[] = []; for (const ed of e) for (let i = 0; i < ed.xs.length; i++) rv.push(ed.xs[i], ed.zs[i]);
console.log(`roads (without R6-8 / slips): ${roads.length}, hash ${hash(all)}`);
console.log(`J1-E arm: ${roads.filter((r) => r.name === 'J1-E').length} road, hash ${hash(arm)}`);
console.log(`other tier-1 roads (ring, M8, R6, island link): hash ${hash(big)}`);
console.log(`junction pads: ${pads.length}, hash ${hash(padv)}`);
console.log(`bridges (all roads, count only): ${br.length}`);
console.log(`rail: ${e.length} edges, ${gen.rail.piers.length} piers, ${gen.rail.steelSpans.length} steel spans, ${gen.rail.crossings.length} road crossings, hash ${hash(rv)}`);
console.log(`has R6-8: ${(gen.roads.roads as any[]).some((r) => r.name === 'R6-8')}, slips: ${(gen.roads.roads as any[]).filter((r) => r.kind === 'ramp' && NEW.has(r.name)).length}`);
