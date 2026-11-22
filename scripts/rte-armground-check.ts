// RE-9 ARM GROUND CHECK, headless, REAL game data (tsx): Config.roads.junctionRteArmGround OFF vs ON (J1-E arm viaduct at stem d 160..271 -> ground road on an embankment).
// Run: npx tsx scripts/rte-armground-check.ts docs   Writes docs/RTE_ARMGROUND.txt. Prints PASS / FAIL; what is not run is printed as NOT RUN.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { RTE_STRUCT_FRAME as FR } from '../src/roads/junction/RteStructData';
import { buildRteMesh } from '../src/roads/junction/RteMesh';

const dir = process.argv[2] ?? 'docs';
const lines: string[] = []; const P = (s: string): void => { lines.push(s); console.log(s); };
let fails = 0; const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const hash = (parts: ArrayLike<number>[]): string => { const h = createHash('sha1'); for (const p of parts) h.update(Buffer.from(new Float64Array(Array.from(p)).buffer)); return h.digest('hex').slice(0, 10); };
const sig = (g: any): { rail: string; roads: Map<string, string> } => {
  const rail = g.rail; const piers = hash([rail.piers.flatMap((q: any) => [q.s, q.x, q.z, q.baseY, q.deckY])]);
  return { rail: piers + ':' + rail.piers.length + ':' + rail.edges.length, roads: new Map(g.roads.roads.map((r: any) => [r.name, hash([r.xs, r.zs, r.ys])])) };
};
const dOf = (x: number, z: number): number => -((x - FR.J[0]) * FR.ln[0] + (z - FR.J[1]) * FR.ln[1]);
const build = (on: boolean): any => { Config.roads.junctionRteArmGround.enabled = on; return new TerrainGenerator(Config.world.seed); };
const old: any = build(false); const sOld = sig(old);
const gen: any = build(true); const sNew = sig(gen);
const arm = (g: any): any => g.roads.roads.find((r: any) => r.name === 'J1-E');
const onBridge = (g: any, d0: number, d1: number): number => { const a = arm(g); let n = 0; for (let i = 0; i < a.xs.length; i++) { const d = dOf(a.xs[i], a.zs[i]); if (d >= d0 && d <= d1 && a.bridgeOf[i] >= 0) n++; } return n; };
P(`RE-9 ARM GROUND: arm points on a structure at d 160..271: OFF ${onBridge(old, 160, 271)}, ON ${onBridge(gen, 160, 271)}; at d 391..694 (rail / stream viaduct): OFF ${onBridge(old, 391, 694)}, ON ${onBridge(gen, 391, 694)}`);
CHK('A1 the viaduct at d 160..271 was a structure before and is not any more', onBridge(old, 160, 271) > 0 && onBridge(gen, 160, 271) === 0, `${onBridge(old, 160, 271)} -> ${onBridge(gen, 160, 271)} points`);
CHK('A2 the viaduct at d 391..694 (rail and stream crossing) is unchanged', onBridge(old, 391, 694) > 0 && onBridge(old, 391, 694) === onBridge(gen, 391, 694), `${onBridge(old, 391, 694)} / ${onBridge(gen, 391, 694)} points`);
CHK('A3 rail unchanged (piers, edges)', sOld.rail === sNew.rail, sOld.rail + ' / ' + sNew.rail);
let chg = 0; for (const [k, v] of sOld.roads) if (sNew.roads.get(k) !== v) chg++;
CHK('A4 every road unchanged (xs, zs, ys): the arm profile is NOT changed', chg === 0 && sOld.roads.size === sNew.roads.size, `${chg} changed of ${sOld.roads.size}`);
// A5 the finished ground under the arm in d 160..271: centre and +-15 m = the road level (embankment), before it was a dip
const sc = gen.makeSample(), sco = old.makeSample(); const a = arm(gen);
let worstC = 0, worstS = 0, wetN = 0, oldMin = 99, n = 0;
for (let d = 160; d <= 271; d += 6) {
  const x = FR.J[0] - d * FR.ln[0], z = FR.J[1] - d * FR.ln[1], y = gen.roads.roadYAt(a, x, z).y;
  gen.sample(x, z, sc); worstC = Math.max(worstC, Math.abs(sc.h - y)); old.sample(x, z, sco); oldMin = Math.min(oldMin, sco.h - y);
  for (const o of [-26, -15, 15, 26]) { const px = x + o * FR.t[0], pz = z + o * FR.t[1]; gen.sample(px, pz, sc); if (sc.water != null && !Number.isNaN(sc.water) && sc.water > sc.h) wetN++; if (Math.abs(o) <= 15) worstS = Math.max(worstS, Math.abs(sc.h - y)); }
  n++;
}
CHK('A5 finished ground = road level on the centre line at d 160..271 (<= 0.15 m)', worstC <= 0.15, `worst ${worstC.toFixed(2)} m over ${n} stations (before: ground up to ${(-oldMin).toFixed(2)} m BELOW the road)`);
CHK('A6 ground at +-15 m from the axis within 1.0 m of the road level (embankment, not a hole)', worstS <= 1.0, `worst ${worstS.toFixed(2)} m`);
CHK('A7 no wet ground under / beside the new embankment (sc.water > sc.h)', wetN === 0, `${wetN} wet samples`);
// A8 mesh: the wedge decks of window 160..271 are skipped, the others stay
const full = buildRteMesh(), skip = buildRteMesh({ skipArmWindow1: true });
CHK('A8 mesh without the arm window 160..271 wedges is smaller; default (flag false) is the old mesh', skip.positions.length < full.positions.length && full.positions.length / 3 === 26346, `full ${full.positions.length / 3} vertices, without ${skip.positions.length / 3}`);
P('');
P('NOT RUN  game (look of the embankment, trees on it), npm run build, full tsc, traffic on the arm, minimap, ramp strips M3 / M4 beside the arm (still bridges), ground-level merge of the ramps, wider slip lanes.');
P('ASSUMED  the arm road profile (J1ArmData) stays exactly as it is; only the structure registration of the station range 2750..2900 of J1-E is skipped (terrain then follows the road: embankment 2 .. 5 m high, daylight slopes).');
P(`\nSUMMARY: ${fails === 0 ? 'ALL PASS' : 'FAIL'} (${lines.filter(l => l.startsWith('PASS')).length} PASS, ${fails} FAIL)`);
writeFileSync(`${dir}/RTE_ARMGROUND.txt`, lines.join('\n') + '\n');
