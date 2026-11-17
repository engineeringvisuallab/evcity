// STEP G7g survey (headless, numbers only, nothing in src/ changed): J1-E arm, L27, L33 and the R6-5 east end.
// Run: npx tsx scripts/r6-g7g-survey.ts docs   (prints; writes docs/STEP_R6_G7G_SURVEY.txt)
import { writeFileSync, readFileSync } from 'node:fs';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { J1_ARM_DATA } from '../src/roads/junction/J1ArmData';
const dir = process.argv[2] ?? 'docs'; const P: string[] = []; const pr = (s = '') => { P.push(s); console.log(s); };
const gen: any = new TerrainGenerator(Config.world.seed); const sc = gen.makeSample();
const smp = (x: number, z: number) => { gen.sample(x, z, sc); return { h: sc.h as number, w: sc.water as number | null }; };
const arm = J1_ARM_DATA.find((d) => d.name === 'J1-E')!;
const lines = JSON.parse(readFileSync(dir + '/r6_g5_lines.json', 'utf8')).lines as any[];
const L = (id: number) => lines.find((l) => l.src_id === id)!.pts as number[][];
const inStruct = (s: number) => arm.structs.some((r) => s >= r[0] && s <= r[1]);
pr('G7g SURVEY J1-E arm (s from J1 centre; arm data starts at s 315; structs = ' + JSON.stringify(arm.structs) + ')');
pr('  s      x        z     arm y   ground  above  water(surface)  struct');
for (let i = 0; i < arm.s.length; i++) { const s = arm.s[i]; if (s > 2400) break; if (Math.abs(s % 100) > 5 && Math.abs(s % 100) < 95 && i % 5) continue; const [x, z] = arm.pts[i]; const g = smp(x, z); pr(`${s.toFixed(0).padStart(5)} ${x.toFixed(0).padStart(7)} ${z.toFixed(0).padStart(8)} ${arm.ys[i].toFixed(1).padStart(7)} ${g.h.toFixed(1).padStart(7)} ${(arm.ys[i] - g.h).toFixed(1).padStart(6)} ${g.w == null ? '      -' : g.w.toFixed(1).padStart(7)}      ${inStruct(s) ? 'STRUCT' : ''}`); }
const segX = (a: number[], b: number[], c: number[], d: number[]) => { const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-9) return null; const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den; return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null; };
for (const id of [27, 33, 8]) {
  const pts = L(id); pr(); pr(`LINE L${id}: ${pts.length} pts, ends (${pts[0].map((v) => v.toFixed(0))}) -> (${pts[pts.length - 1].map((v) => v.toFixed(0))})`);
  let cum = 0; const cs = [0]; for (let i = 1; i < pts.length; i++) { cum += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cs.push(cum); }
  pr(`  length ${cum.toFixed(0)} m`);
  for (let i = 0; i + 1 < pts.length; i++) for (let j = 0; j + 1 < arm.pts.length; j++) { const X = segX(pts[i], pts[i + 1], arm.pts[j], arm.pts[j + 1]); if (X) { const s = arm.s[j] + X.u * (arm.s[j + 1] - arm.s[j]); const lineS = cs[i] + X.t * (cs[i + 1] - cs[i]); const d1 = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]], d2 = [arm.pts[j + 1][0] - arm.pts[j][0], arm.pts[j + 1][1] - arm.pts[j][1]]; const ang = Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1])) * 180 / Math.PI; const x = pts[i][0] + X.t * d1[0], z = pts[i][1] + X.t * d1[1]; const g = smp(x, z); pr(`  CROSSES J1-E at arm s ${s.toFixed(0)} (line s ${lineS.toFixed(0)} of ${cum.toFixed(0)}), point (${x.toFixed(0)}, ${z.toFixed(0)}), angle ${Math.min(ang, 180 - ang).toFixed(0)} deg, arm y ${(arm.ys[j] + X.u * (arm.ys[j + 1] - arm.ys[j])).toFixed(1)}, ground ${g.h.toFixed(1)}, water ${g.w == null ? '-' : g.w.toFixed(1)}, arm in structure: ${inStruct(s)}`); } }
  let wetM = 0; for (let i = 0; i < pts.length; i++) { const g = smp(pts[i][0], pts[i][1]); if (g.w != null && g.w > g.h - 0.3) wetM++; }
  pr(`  wet points on the line: ${wetM}`);
}
// rail near J1-E arm
pr(); pr('RAIL edges: nearest distance to J1-E arm s 315..2400');
for (const e of gen.rail.edges) { let m = 1e9, at = 0; for (let i = 0; i < arm.pts.length; i += 1) { if (arm.s[i] > 2400) break; for (let k = 0; k < e.xs.length; k++) { const d = Math.hypot(e.xs[k] - arm.pts[i][0], e.zs[k] - arm.pts[i][1]); if (d < m) { m = d; at = arm.s[i]; } } } if (m < 600) pr(`  ${e.id}: ${m.toFixed(0)} m at arm s ${at.toFixed(0)}`); }
pr('GAME ROADS within 400 m of the J1-E arm (s 315..2400):');
for (const r of gen.roads.roads) { if (r.name === 'J1-E') continue; let m = 1e9, at = 0; for (let i = 0; i < arm.pts.length; i++) { if (arm.s[i] > 2400) break; for (let k = 0; k < r.xs.length; k++) { const d = Math.hypot(r.xs[k] - arm.pts[i][0], r.zs[k] - arm.pts[i][1]); if (d < m) { m = d; at = arm.s[i]; } } } if (m < 400) pr(`  ${r.name}: ${m.toFixed(0)} m at arm s ${at.toFixed(0)}`); }
writeFileSync(dir + '/STEP_R6_G7G_SURVEY.txt', P.join('\n') + '\n');
