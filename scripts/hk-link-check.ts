// STEP HK-11a check: the 10 AI movements of the Hatikamrul interchange (src/traffic/HkLink.ts, pure math, not yet hooked into the game).
// Run: HK=1 npx tsx scripts/hk-ring-run.ts hk-link-check     (HK=0: no movement may exist)
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { hkFrame, hkRamps } from '../src/roads/ring/HkRamps';
import { HkLink } from '../src/traffic/HkLink';

let fails = 0;
const check = (ok: boolean, name: string, detail: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(74)} ${detail}`); };
const f1 = (v: number): string => v.toFixed(1);
const gen = new TerrainGenerator(Config.world.seed);
const roads = gen.roads.roads;
if (!Config.roads.hatikamrul.enabled) {
  const l = new HkLink(roads, []);
  check(l.moves.length === 0, 'H0 switch OFF: no movement can be built', `${l.moves.length}`);
  console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
}
const f = hkFrame(gen.roads)!;
const loops = hkRamps(f);
const link = new HkLink(roads, loops);
const M = new Map(link.moves.map((m) => [m.id, m]));
check(link.complete && link.moves.length === 10, 'H1 all 10 movements exist', link.moves.map((m) => m.id).join(' '));
const name = (id: number): string => roads[id].name;
const exp: Record<string, [string, string]> = { A2E: ['J1-S', 'M8'], A2W: ['J1-S', 'M8'], A2L: ['J1-S', 'M6-1'], L2W: ['M6-1', 'M8'], L2E: ['M6-1', 'M8'], L2A: ['M6-1', 'J1-S'], E2A: ['M8', 'J1-S'], E2L: ['M8', 'M6-1'], W2L: ['M8', 'M6-1'], W2A: ['M8', 'J1-S'] };
let okRoads = true; for (const [id, [a, b]] of Object.entries(exp)) { const m = M.get(id as never); if (!m || name(m.from.roadId) !== a || name(m.to.roadId) !== b) okRoads = false; }
check(okRoads, 'H2 every movement goes from the expected main road to the expected main road', '');
const d = (id: string, end: 'from' | 'to'): number => (M.get(id as never)?.[end].dir ?? 0);
// directions: arm 3 runs star -> node (+1 = southbound, towards the node), link 5 runs node -> south (+1 = away from the node)
check(['A2E', 'A2W', 'A2L'].every((i) => d(i, 'from') === 1) && ['L2W', 'L2E', 'L2A'].every((i) => d(i, 'from') === -1), 'H3 arm cars leave going to the node (+1), link cars going to the node (-1)', ['A2E', 'A2W', 'A2L', 'L2W', 'L2E', 'L2A'].map((i) => `${i}:${d(i, 'from')}`).join(' '));
check(['L2A', 'E2A', 'W2A'].every((i) => d(i, 'to') === -1) && ['A2L', 'E2L', 'W2L'].every((i) => d(i, 'to') === 1), 'H3b they join the arm going away from the node (-1) and the link going away (+1)', '');
const east = d('E2A', 'from'), west = d('W2L', 'from');
check(east === d('E2L', 'from') && west === d('W2A', 'from') && east === -west, 'H4 the two eastbound exits share one ring direction, the two westbound the other', `eastbound ${east}, westbound ${west}`);
check(d('A2E', 'to') === east && d('L2E', 'to') === east && d('A2W', 'to') === west && d('L2W', 'to') === west, 'H4b the entries join the ring in the right direction (A2E / L2E eastbound, A2W / L2W westbound)', '');
// lane tips: distance of the first / last point from the main road centre line (ring 17.3 = lane tip inside the deck, arm 16.8 = tip of the C-D taper, slips end 17.5, C-D end 12 .. 17)
let okDist = true; const dd: string[] = [];
for (const m of link.moves) { dd.push(`${m.id} ${f1(m.from.dist)}/${f1(m.to.dist)}`); for (const q of [m.from.dist, m.to.dist]) if (q < 10 || q > 20) okDist = false; }
check(okDist, 'H5 first / last point is 10 .. 20 m from the main road centre line (lane tip / merge)', dd.join('  '));
// level at the anchors
const levelAt = (roadId: number, s: number): number => { const r = roads[roadId]; let i = 0; while (i < r.cum.length - 2 && r.cum[i + 1] < s) i++; const t = Math.max(0, Math.min(1, (s - r.cum[i]) / ((r.cum[i + 1] - r.cum[i]) || 1))); return r.ys[i] + (r.ys[i + 1] - r.ys[i]) * t; };
let worstLvl = 0; for (const m of link.moves) { worstLvl = Math.max(worstLvl, Math.abs(m.pts[0].y - levelAt(m.from.roadId, m.from.s)), Math.abs(m.pts[m.pts.length - 1].y - levelAt(m.to.roadId, m.to.s))); }
check(worstLvl <= 0.8, 'H6 the path level meets the main road level at both ends', `worst ${f1(worstLvl)} m`);
// geometry
let maxGap = 0, maxSlope = 0, minR = Infinity, maxTurn = 0, minLen = Infinity;
for (const m of link.moves) {
  minLen = Math.min(minLen, m.length);
  for (let i = 1; i < m.pts.length; i++) { const g = Math.hypot(m.pts[i].x - m.pts[i - 1].x, m.pts[i].z - m.pts[i - 1].z); maxGap = Math.max(maxGap, g); if (g > 0.1) maxSlope = Math.max(maxSlope, Math.abs(m.pts[i].y - m.pts[i - 1].y) / g); }
  for (let i = 1; i + 1 < m.pts.length; i++) {
    const a = m.pts[i - 1], b = m.pts[i], c = m.pts[i + 1];
    const h1 = Math.atan2(b.z - a.z, b.x - a.x), h2 = Math.atan2(c.z - b.z, c.x - b.x); let dh = Math.abs(h2 - h1); if (dh > Math.PI) dh = 2 * Math.PI - dh; maxTurn = Math.max(maxTurn, dh * 180 / Math.PI);
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ac = Math.hypot(c.x - a.x, c.z - a.z);
    const cross = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)); if (cross > 1e-6) minR = Math.min(minR, (ab * bc * ac) / (2 * cross));
  }
}
check(maxGap <= 6.5, 'H7 the points are at most 6.5 m apart', `max ${f1(maxGap)} m`);
check(maxSlope <= 0.06, 'H7b grade <= 6 % everywhere', `max ${f1(maxSlope * 100)} %`);
check(minR >= 55, 'H7c radius >= 55 m everywhere (loops R 80, S-bend 93.7, the connectors included)', `min ${f1(minR)} m`);
check(maxTurn <= 12, 'H7d heading change <= 12 degrees per 5 m step', `max ${f1(maxTurn)} deg`);
// the path hugs the real pieces: every point within 5 m of a point of one of its pieces (nothing invented)
const pieceXZ = (nm: string): [number, number][] => { const i = roads.findIndex((r) => r.name === nm); if (i >= 0) return Array.from(roads[i].xs, (x, k) => [x, roads[i].zs[k]] as [number, number]); const L = loops.find((q) => q.id === nm)!; return L.xs.map((x, k) => [x, L.zs[k]] as [number, number]); };
let worstHug = 0; for (const m of link.moves) { const P = m.via.flatMap(pieceXZ); for (const p of m.pts) { let b = Infinity; for (const q of P) b = Math.min(b, Math.hypot(p.x - q[0], p.z - q[1])); worstHug = Math.max(worstHug, b); } }
check(worstHug <= 5, 'H8 every path point lies within 5 m of the real road / loop data (the 14 m connectors at the gores)', `worst ${f1(worstHug)} m`);
// length plausibility against the sum of the pieces (+-12 %)
let okLen = true; const ll: string[] = [];
for (const m of link.moves) { const sum = m.via.reduce((a, nm) => { const i = roads.findIndex((r) => r.name === nm); return a + (i >= 0 ? roads[i].length : loops.find((q) => q.id === nm)!.cum[loops.find((q) => q.id === nm)!.cum.length - 1]); }, 0); ll.push(`${m.id} ${Math.round(m.length)}/${Math.round(sum)}`); if (m.length > sum * 1.02 || m.length < sum * 0.45) okLen = false; }
check(okLen, 'H9 path length <= the sum of its pieces and not far below (the cut parts of the carrying road)', ll.join('  '));
console.log('  info  lengths (m):', link.moves.map((m) => `${m.id} ${Math.round(m.length)}`).join(', '));
console.log(`RESULT ${fails} FAIL`); process.exit(fails ? 1 : 0);
