// Which junctions are good places for an interchange? Run: npx tsx scripts/interchange-candidates.ts
// Reads the real road network (flag off), looks at every junction pad where two DIVIDED roads (highway / arterial / avenue) meet nearly at right angles, builds
// a diamond, a parclo and a cloverleaf there, and checks each against water, steep ground and other roads. Writes docs/INTERCHANGE_CANDIDATES_BN.md
// with the table and a ready-to-paste Config.roads.interchange list. Nothing in the game is changed.
import { writeFileSync } from 'node:fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { dividedSectionOf, type DividedSection } from '../src/roads/RoadSection';
import { buildInterchange, type InterchangeModel, type RoadSection } from '../src/interchange';
import type { TerrainSample } from '../src/terrain/Lakes';

Config.roads.interchange.enabled = false;
const g = new TerrainGenerator(Config.world.seed);
const R = g.roads;
const tmp: TerrainSample = { h: 0, water: NaN, fx: 0, fz: 0 };

const sec = (s: DividedSection): RoadSection => ({ roadId: -1, halfWidth: s.halfWidth, kerbLane: s.halfWidth - s.shyOuter - s.laneW / 2, laneW: s.laneW, lanesPerDir: s.lanesPerDir, designKmh: s.designKmh });
const RANK: Record<string, number> = { highway: 3, arterial: 2, avenue: 1 };

interface Check {
  pattern: string;
  ok: boolean;
  water: number;
  steep: number;
  nearRoad: number;
  errors: number;
}

function check(m: InterchangeModel, ownRoads: Set<number>, padId: number): Check {
  let water = 0;
  let steep = 0;
  let nearRoad = 0;
  for (const r of m.ramps) {
    for (let i = 0; i < r.xs.length; i += 2) {
      g.sampleNatural(r.xs[i], r.zs[i], tmp);
      if (!Number.isNaN(tmp.water) && tmp.h < tmp.water + 0.3) water++;
      if (Math.abs(tmp.h - r.ys[i]) > 9) steep++;
      let hit = false;
      for (const o of R.roads) {
        if (ownRoads.has(o.id) || o.earth) continue;
        for (let j = 0; j < o.xs.length && !hit; j++) if (Math.abs(o.xs[j] - r.xs[i]) < 22 && Math.abs(o.zs[j] - r.zs[i]) < 22 && Math.hypot(o.xs[j] - r.xs[i], o.zs[j] - r.zs[i]) < 20) hit = true;
        if (hit) break;
      }
      if (!hit) for (const p of R.pads) if (p.id !== padId && Math.hypot(p.x - r.xs[i], p.z - r.zs[i]) < 45) hit = true;
      if (hit) nearRoad++;
    }
  }
  const errors = m.issues.filter((i) => i.level === 'error').length;
  return { pattern: m.spec.pattern, ok: water === 0 && steep === 0 && nearRoad === 0 && errors === 0, water, steep, nearRoad, errors };
}

interface Cand {
  pad: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  main: DividedSection;
  cross: DividedSection;
  mainName: string;
  crossName: string;
  checks: Check[];
  best: string;
  upper: 'main' | 'cross';
}
const cands: Cand[] = [];
for (const pad of R.pads) {
  const arms = pad.arms.map((a) => ({ a, road: R.roads[a.roadId] })).filter((e) => e.road && dividedSectionOf(e.road));
  const roadIds = [...new Set(arms.map((e) => e.a.roadId))];
  if (roadIds.length < 2) continue;
  const byRank = [...roadIds].sort((p, q) => RANK[dividedSectionOf(R.roads[q])!.id] - RANK[dividedSectionOf(R.roads[p])!.id] || R.roads[q].length - R.roads[p].length);
  const mainId = byRank[0];
  const crossId = byRank.find((id) => {
    if (id === mainId) return false;
    const am = arms.find((e) => e.a.roadId === mainId)!.a.theta;
    const ac = arms.find((e) => e.a.roadId === id)!.a.theta;
    return Math.abs(Math.sin(am - ac)) >= 0.9;
  });
  if (crossId === undefined) continue;
  if (dividedSectionOf(R.roads[mainId])!.id === 'avenue') continue; // downtown 110 m blocks: far too small for an interchange
  const mainR = R.roads[mainId];
  const crossR = R.roads[crossId];
  const ms = dividedSectionOf(mainR)!;
  const cs = dividedSectionOf(crossR)!;
  const yaw = arms.find((e) => e.a.roadId === mainId)!.a.theta;
  const own = new Set([mainId, crossId]);
  const checks: Check[] = [];
  for (const pattern of ['cloverleaf', 'parclo', 'diamond']) {
    const m = buildInterchange({ id: `p${pad.id}`, pattern, x: pad.x, z: pad.z, y: pad.y, yaw, main: sec(ms), cross: sec(cs) }, (x, z) => {
      g.sampleNatural(x, z, tmp);
      return tmp.h;
    });
    checks.push(check(m, own, pad.id));
  }
  const best = checks.find((c) => c.ok)?.pattern ?? 'none';
  cands.push({ pad: pad.id, x: pad.x, z: pad.z, y: pad.y, yaw, main: ms, cross: cs, mainName: mainR.name, crossName: crossR.name, checks, best, upper: 'main' });
}
cands.sort((a, b) => RANK[b.main.id] - RANK[a.main.id] || RANK[b.cross.id] - RANK[a.cross.id] || a.pad - b.pad);

const mark = (c: Check): string => (c.ok ? 'OK' : `x (water ${c.water}, steep ${c.steep}, road ${c.nearRoad}${c.errors ? `, err ${c.errors}` : ''})`);
const lines: string[] = [];
lines.push('# INTERCHANGE — candidate junctions (auto-generated)', '');
lines.push(`\`npx tsx scripts/interchange-candidates.ts\` — ${R.pads.length} junction pads checked; ${cands.length} have two divided roads meeting at about 90 degrees.`, '');
lines.push('Check = does the pattern fit: no water, no ground more than 9 m from the ramp height, no other road / pad within 20 m of a ramp. **OK** = fits; the best (biggest) pattern that fits is recommended.', '');
lines.push('| pad | x | z | main x cross | roads | cloverleaf | parclo | diamond | recommend |', '|---|---|---|---|---|---|---|---|---|');
for (const c of cands) lines.push(`| ${c.pad} | ${c.x.toFixed(0)} | ${c.z.toFixed(0)} | ${c.main.id} x ${c.cross.id} | ${c.mainName} x ${c.crossName} | ${mark(c.checks[0])} | ${mark(c.checks[1])} | ${mark(c.checks[2])} | **${c.best}** |`);
const fit = cands.filter((c) => c.best !== 'none');
lines.push('', `## Ready to paste (${fit.length} junctions where at least one pattern fits)`, '', 'Copy the lines you want into `Config.roads.interchange.list` and set `enabled: true`.', '', '```ts');
for (const c of fit) lines.push(`{ id: 'I${c.pad}', pattern: '${c.best}', x: ${c.x.toFixed(0)}, z: ${c.z.toFixed(0)}, yaw: ${c.yaw.toFixed(3)}, main: '${c.main.id}', cross: '${c.cross.id}' }, // ${c.mainName} x ${c.crossName}`);
lines.push('```', '');

// verify: put the recommended entries into a REAL network (flag on) and count what is built
Config.roads.interchange.enabled = true;
for (const c of fit) Config.roads.interchange.list.push({ id: `I${c.pad}`, pattern: c.best, x: c.x, z: c.z, yaw: c.yaw, main: c.main.id, cross: c.cross.id });
const warn = console.warn;
let warned = '';
console.warn = (m: unknown): void => {
  warned += `${String(m)}\n`;
};
const g2 = new TerrainGenerator(Config.world.seed);
console.warn = warn;
const want = fit.reduce((n, c) => n + (c.best === 'cloverleaf' ? 8 : 4), 0);
const got = g2.roads.roads.filter((r) => r.kind === 'ramp').length;
lines.push(`Verified in the real network (flag on): ${g2.roads.interchanges.length} of ${fit.length} interchanges built, ${got} ramp roads (expected ${want})${warned ? `, warnings: ${warned.trim()}` : ', no warnings'}.`, '');
writeFileSync('docs/INTERCHANGE_CANDIDATES_BN.md', lines.join('\n'));
console.log(`verify: ${g2.roads.interchanges.length}/${fit.length} built, ${got}/${want} ramps${warned ? ' WARN ' + warned : ''}`);
console.log(lines.slice(0, 6 + cands.length + 4).join('\n'));
console.log(`\n${cands.length} candidates, ${fit.length} fit at least one pattern -> docs/INTERCHANGE_CANDIDATES_BN.md`);
