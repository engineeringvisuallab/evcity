// STEP HK-6 (data only, src NOT changed): the new RING profile at the node (ring OVER, HK-4, deck 1.4) on the 10 m grid of RingProfileData.ts, and what the game's own structure rules make of it.
// Run (after hk-vertical.ts): npx tsx scripts/hk-ring-profile.ts -> docs/HK_RING.txt, docs/hk_ring_patch.csv, docs/hk_ring_patch.json
import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RING_PROFILE_STEP, RING_PROFILE_Y } from '../src/roads/ring/RingProfileData';
import { STRUCT } from '../src/roads/ring/RingStructures';
const out: string[] = []; let fails = 0, warns = 0;
const say = (s: string): void => { out.push(s); console.log(s); };
const chk = (ok: boolean, n: string, d: string, warn = false): void => { if (!ok) { if (warn) warns++; else fails++; } say(`  ${ok ? 'PASS' : warn ? 'WARN' : 'FAIL'}  ${n.padEnd(66)} ${d}`); };
const f1 = (x: number): string => x.toFixed(1), f2 = (x: number): string => x.toFixed(2);
const VIADUCT_FILL = 7.5; // RoadNetwork.ts: a fill higher than this beside a river valley becomes a viaduct (RING_VIADUCT_TALL 25 m anywhere)
const gen: any = new TerrainGenerator(Config.world.seed); const net: any = gen.roads;
const ring = net.roads.find((r: any) => r.name === 'M8'), arm = net.roads.find((r: any) => r.name === 'J1-S');
const L: number = ring.length; const JX = arm.xs[arm.xs.length - 1], JZ = arm.zs[arm.zs.length - 1]; let k0 = 0, bd = 1e18;
for (let i = 0; i < ring.xs.length; i++) { const d = Math.hypot(ring.xs[i] - JX, ring.zs[i] - JZ); if (d < bd) { bd = d; k0 = i; } } const sJ: number = ring.cum[k0];
const lerp = (r: any, arr: number[], s: number): number => { const ss = ((s % L) + L) % L; let lo = 0, hi = r.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= ss) lo = m; else hi = m; } const t = (ss - r.cum[lo]) / ((r.cum[hi] - r.cum[lo]) || 1); return arr[lo] + (arr[hi] - arr[lo]) * t; };
const V = JSON.parse(readFileSync('docs/hk_vertical.json', 'utf8')); const W: number[][] = V.res['WEST_1.4'].pts, E: number[][] = V.res['EAST_1.4'].pts; // [d, level]; d + = WEST
const smooth = (t: number): number => { const q = Math.max(0, Math.min(1, t)); return q * q * (3 - 2 * q); };
// HK-4 profile stops at 600 m and meets the old ring only to within 1 m on the WEST: the leftover difference is faded out between 600 and 780 m with a smoothstep (no step in the profile, about 0.5 % extra grade)
const newY = (d: number, old: number): number => { const a = d >= 0 ? W : E, ad = Math.abs(d); if (ad > 600) { if (d < 0) return old; const p600 = W.find((p) => p[0] >= 600) ?? W[W.length - 1]; const oldAt600 = old - 0; void oldAt600; return old + (OLD_DIFF600 ?? 0) * (1 - smooth((ad - 600) / 180)); } const i = Math.min(a.length - 2, Math.floor(ad / 5)); const t = (ad - i * 5) / 5; return a[i][1] + (a[i + 1][1] - a[i][1]) * t; };
const oldAtStation = (s: number): number => { const t = s / RING_PROFILE_STEP, i = Math.floor(t); return RING_PROFILE_Y[i] + (RING_PROFILE_Y[i + 1] - RING_PROFILE_Y[i]) * (t - i); };
const OLD_DIFF600: number = (W.find((p) => p[0] >= 600) ?? W[W.length - 1])[1] - oldAtStation(sJ + 600);
say(`HK-6 ring profile: ring length ${f1(L)} m, node at station ${f1(sJ)} m, profile grid ${RING_PROFILE_STEP} m (${RING_PROFILE_Y.length} samples).`);
const patch: { i: number; s: number; d: number; old: number; nw: number; hNat: number; fill: number; wet: boolean; water: number }[] = [];
const n = RING_PROFILE_Y.length; const o = { h: 0, water: NaN, fx: 0, fz: 0 };
for (let i = 0; i < n; i++) {
  const s = i * RING_PROFILE_STEP; let d = s - sJ; // station increases WEST (HK-4): d = station - sJ is + west
  if (Math.abs(d) > 800) continue;
  const old = RING_PROFILE_Y[i], nw = Math.abs(d) <= 780 ? newY(d, old) : old;
  const x = lerp(ring, ring.xs, s), z = lerp(ring, ring.zs, s); gen.sampleNatural(x, z, o);
  const hNat = lerp(ring, ring.hNat, s); const wet = !Number.isNaN(o.water) && o.h < o.water + 0.3 && o.h > 2;
  patch.push({ i, s, d, old, nw, hNat, fill: nw - hNat, wet, water: o.water });
}
const changed = patch.filter((p) => Math.abs(p.nw - p.old) > 0.005);
say(`Samples in +-800 m: ${patch.length}; changed: ${changed.length} (d ${Math.min(...changed.map((p) => p.d)).toFixed(0)} .. +${Math.max(...changed.map((p) => p.d)).toFixed(0)} m); max raise ${f2(Math.max(...changed.map((p) => p.nw - p.old)))} m.`);
// grade on the new grid
let gMax = 0, gAt = 0; for (let k = 1; k < patch.length; k++) { if (patch[k].i !== patch[k - 1].i + 1) continue; const g = Math.abs(patch[k].nw - patch[k - 1].nw) / RING_PROFILE_STEP; if (g > gMax) { gMax = g; gAt = patch[k].d; } }
chk(gMax <= 0.04, 'ring grade on the 10 m grid <= 4 % (motorway limit)', `${f2(gMax * 100)} % at d ${gAt} m (WEST + / EAST -)`);
// grid join: the first / last changed sample must meet the old profile (no step)
const first = changed[0], last = changed[changed.length - 1];
chk(Math.abs(patch[patch.indexOf(first) - 1].nw - patch[patch.indexOf(first) - 1].old) < 0.01 && Math.abs(patch[patch.indexOf(last) + 1].nw - patch[patch.indexOf(last) + 1].old) < 0.01, 'new profile meets the old ring profile at both ends of the change', `left d ${first.d.toFixed(0)}, right d ${last.d.toFixed(0)}`);
// structure rule of the game on the NEW profile: wet = bridge; fill above 7.5 m = viaduct (beside a river valley)
const zone = (pred: (p: typeof patch[0]) => boolean): string => { const z: string[] = []; let a: typeof patch[0] | null = null, b: typeof patch[0] | null = null; for (const p of patch) { if (pred(p)) { if (!a) a = p; b = p; } else if (a && b) { z.push(`d ${a.d.toFixed(0)} .. ${b.d.toFixed(0)} (${Math.abs(b.d - a.d).toFixed(0)} m)`); a = null; } } if (a && b) z.push(`d ${a.d.toFixed(0)} .. ${b.d.toFixed(0)} (${Math.abs(b.d - a.d).toFixed(0)} m)`); return z.join('; ') || 'none'; };
say(`WET stretches of the ring (auto BRIDGE by the wet rule, the E1 rebuilt river bridge is one of them): ${zone((p) => p.wet)}`);
say(`New ring more than ${VIADUCT_FILL} m above natural ground (VIADUCT by the fill rule where a river is beside; else an earth embankment up to RING_VIADUCT_TALL 25 m): ${zone((p) => p.fill > VIADUCT_FILL)}`);
say(`New ring more than 3 m above natural ground: ${zone((p) => p.fill > 3)}`);
const maxFill = patch.reduce((m, p) => (p.fill > m.fill ? p : m)); say(`Highest new ring above natural ground: ${f1(maxFill.fill)} m at d ${maxFill.d.toFixed(0)} m (old ring there: ${f1(maxFill.old - maxFill.hNat)} m).`);
// river bridge freeboard: deck underside = road - STRUCT.deckDepth; water level from the terrain
const wetP = patch.filter((p) => p.wet && Math.abs(p.d) <= 700); const free = wetP.map((p) => ({ d: p.d, free: p.nw - STRUCT.deckDepth - p.water }));
if (free.length) { const m = free.reduce((a, b) => (b.free < a.free ? b : a)); say(`River bridge: ${wetP.length} wet samples; lowest deck underside above the water: ${f2(m.free)} m at d ${m.d.toFixed(0)} m (old ring: ${f2(wetP.reduce((a, p) => Math.min(a, p.old - STRUCT.deckDepth - p.water), 1e9))} m).`); chk(m.free >= 1.0, 'river bridge: underside at least 1.0 m above the water', `${f2(m.free)} m`); }
say(`Ring deck over the crossing (lower roads + C-D roads + aux lanes): level part |d| <= 51.5 m at ${f2(newY(0, 0))} m; clearance 5.5 m over the lower roads (HK-4).`);
say('SUMMARY OF WHAT THE GAME DOES WITH THIS PROFILE: a wet stretch becomes a bridge by itself; a ring stretch with fill > 7.5 m beside a river valley becomes a viaduct by itself; the deck over the arm / link / C-D roads at the node is NOT made by any rule (the arm and link are junction roads): it is a hand-made structure (HK-8). Earth embankments up to 7.5 m are built by the ring terrain rule (HK-7 checks the skirt).');
say('NOT RUN: the game, tsc, build, the existing ring checks (ring-structures, ring-facade, ring-cut: scripts not in the zip), src NOT patched (patch is data in docs/), the river bridge level against the real water table beyond the samples, the arm / link ends.');
say(`RESULT ${fails} FAIL, ${warns} WARN`);
writeFileSync('docs/HK_RING.txt', out.join('\n') + '\n');
writeFileSync('docs/hk_ring_patch.csv', 'i,station,d_west_plus,old_y,new_y,natural_y,new_fill,wet\n' + patch.map((p) => `${p.i},${p.s},${p.d.toFixed(1)},${f2(p.old)},${f2(p.nw)},${f2(p.nw - p.fill)},${f2(p.fill)},${p.wet ? 1 : 0}`).join('\n') + '\n');
writeFileSync('docs/hk_ring_patch.json', JSON.stringify({ sJ, L, step: RING_PROFILE_STEP, changedFrom: first.i, changedTo: last.i, values: Object.fromEntries(changed.map((p) => [p.i, +f2(p.nw)])) }));
