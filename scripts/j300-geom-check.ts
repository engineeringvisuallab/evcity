// J4 GEOMETRY CHECK (headless). Reads docs/J300_GEOM.json (written by scripts/j300-geom-gen.ts) and the real game terrain (water, read only).
// Run: npx tsx scripts/j300-geom-check.ts docs     Writes docs/J300_GEOM.txt. Every line is PASS / FAIL / INFO; what is not run is printed as NOT RUN.
import { readFileSync, writeFileSync } from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { crestK, stoppingSight, minRadius } from '../src/interchange/Standards';

const dir = process.argv[2] ?? 'docs';
const J: any = JSON.parse(readFileSync(`${dir}/J300_GEOM.json`, 'utf8'));
const out: string[] = []; const P = (s = ''): void => { out.push(s); console.log(s); };
let fails = 0; const CHK = (t: string, ok: boolean, n = ''): void => { if (!ok) fails++; P(`${ok ? 'PASS' : 'FAIL'}  ${t}  ${n}`); };
const f1 = (v: number): string => v.toFixed(1), f2 = (v: number): string => v.toFixed(2);
const D = Math.PI / 180, RO = 62;
const wrapDeg = (a: number): number => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

P('J4 GEOMETRY CHECK (headless, real game terrain read only, nothing in the game changed)');
P(`frame O (${J.frame.ox}, ${J.frame.oz}) yaw ${J.frame.yawDeg} deg, u0 ${J.frame.u0}, deck ${J.frame.deckY} m`);

// 1) roundabout legs
P(''); P('1) LEGS (entry / exit paths, J3 rules: entry angle 30, R1 <= 59.5, exit R3 >= R2 = 51.5)');
for (const l of J.legs) {
  const T = l.template;
  if (l.entry) {
    const e = l.entry;
    CHK(`${l.id} entry angle`, Math.abs(Math.abs(e.entryAngleDeg) - 30) < 0.1, `${e.entryAngleDeg} deg (target 30)`);
    CHK(`${l.id} entry radius R1 <= 59.5`, e.arcR <= 59.5, `${e.arcR} m`);
    const yd = Math.hypot(e.yield[0], e.yield[1]);
    CHK(`${l.id} yield point on the outer circle r = ${RO}`, Math.abs(yd - RO) < 0.05, `r ${f2(yd)}`);
    const c = e.centre; let maxJump = 0; for (let i = 1; i < c.length; i++) { const dh = Math.abs(wrapDeg(c[i][2] - c[i - 1][2])); maxJump = Math.max(maxJump, dh); }
    CHK(`${l.id} entry heading smooth (no kink)`, maxJump < 3.0, `max step ${f2(maxJump)} deg per sample`);
    CHK(`${l.id} entry widths ${T.widthApp} -> ${T.widthEntry} m, flare ${T.flare} m`, Math.abs(e.width[0] - T.widthApp) < 0.01 && Math.abs(e.width[e.width.length - 1] - T.widthEntry) < 0.01, `first ${e.width[0]} last ${e.width[e.width.length - 1]}`);
  }
  if (l.exit) {
    const x = l.exit;
    CHK(`${l.id} exit radius R3 >= R2 (51.5)`, x.arcR >= 51.5, `${x.arcR} m`);
    const ld = Math.hypot(x.leave[0], x.leave[1]);
    CHK(`${l.id} exit leaves the outer circle r = ${RO} tangentially`, Math.abs(ld - RO) < 0.05, `r ${f2(ld)}`);
    const c = x.centre; let maxJump = 0; for (let i = 1; i < c.length; i++) { const dh = Math.abs(wrapDeg(c[i][2] - c[i - 1][2])); maxJump = Math.max(maxJump, dh); }
    CHK(`${l.id} exit heading smooth (no kink)`, maxJump < 3.0, `max step ${f2(maxJump)} deg per sample`);
  }
}

// 2) no overlap between different legs outside the circle
P(''); P('2) LEG CLEARANCE (centre-line distance >= half widths + 0.5 m, points outside r = 70 m)');
{ const pts: { id: string; u: number; v: number; w: number }[] = [];
  for (const l of J.legs) { for (const part of ['entry', 'exit'] as const) { const q = l[part]; if (!q) continue; q.centre.forEach((p: number[], i: number) => { if (Math.hypot(p[0], p[1]) > 70) pts.push({ id: l.id + (part === 'entry' ? '-in' : '-out'), u: p[0], v: p[1], w: part === 'entry' ? q.width[i] : q.width }); }); } }
  let worst = 1e9, wa = '', wb = '';
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j]; if (a.id.split('-')[0] === b.id.split('-')[0] && a.id.slice(0, a.id.lastIndexOf('-')) === b.id.slice(0, b.id.lastIndexOf('-'))) continue; const m = Math.hypot(a.u - b.u, a.v - b.v) - (a.w + b.w) / 2; if (m < worst) { worst = m; wa = a.id; wb = b.id; } }
  CHK('different legs keep a gap >= 0.5 m between their edges', worst >= 0.5, `smallest gap ${f1(worst)} m between ${wa} and ${wb}`); }

// 3) crossings and islands
P(''); P('3) PEDESTRIAN CROSSINGS (J3: R6 / R4 2 lanes AT the crossing, refuge >= 2.4 m)');
for (const c of J.crossings) {
  const leg = J.legs.find((l: any) => l.id === c.leg);
  if (leg.kind === 'arm') {
    const rc = Math.abs(c.centre[1]); const dirv = leg.id === 'R6' ? 1 : -1;
    const wAt = (q: any): number => { let best = q.width[0], bd = 1e9; q.centre.forEach((p: number[], i: number) => { const d = Math.abs(dirv * p[1] - rc); if (d < bd) { bd = d; best = q.width[i]; } }); return best; };
    const wIn = wAt(leg.entry); const lanes = Math.round(wIn / leg.template.laneW);
    CHK(`${c.leg} entry carriageway at the crossing is 2 lanes`, lanes === 2 && Math.abs(wIn - leg.template.widthApp) < 0.01, `width ${f2(wIn)} m = ${lanes} lanes (flare not started)`);
    CHK(`${c.leg} refuge >= 2.4 m`, c.refuge >= 2.4, `${c.refuge} m (two stages of ${c.stageWidth} m)`);
    CHK(`${c.leg} crossing clear of the circle (>= 12 m from the outer edge)`, c.fromCircleEdge >= 12, `${c.fromCircleEdge} m`);
    const il = J.islands.find((i: any) => i.leg === c.leg);
    const pg: number[][] = il ? il.polygon : []; const segX = (a: number[], b: number[], c2: number[], d: number[]): boolean => { const o = (p: number[], q: number[], r: number[]): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return o(a, b, c2) * o(a, b, d) < 0 && o(c2, d, a) * o(c2, d, b) < 0; };
    let selfX = 0; for (let i = 0; i < pg.length; i++) for (let j = i + 2; j < pg.length; j++) { if (i === 0 && j === pg.length - 1) continue; if (segX(pg[i], pg[(i + 1) % pg.length], pg[j], pg[(j + 1) % pg.length])) selfX++; }
    CHK(`${c.leg} island polygon is simple (no self-crossing)`, selfX === 0, `${selfX} crossings`);
    CHK(`${c.leg} splitter island polygon exists`, il && il.polygon.length > 6, `${il ? il.polygon.length : 0} points, width at crossing ${il ? il.widthAtCrossing : 0} m`);
  } else {
    P(`INFO  ${c.leg} ramp crossing: single stage ${c.stageWidth} m, no refuge (ramp is 2 lanes, 7.0 m), ${c.fromCircleEdge} m from the circle edge`);
  }
}

// 4) arms
P(''); P('4) ARMS (R6 climbs, R4 re-route)');
const KC = crestK(60), SS = stoppingSight(60), KS = (SS * SS) / (120 + 3.5 * SS), RMIN = minRadius(60);
for (const id of ['R6', 'R4']) {
  const a = J.arms[id]; const rows: any[] = a.rows;
  CHK(`${id} end meets the old road: gap <= 0.5 m, heading gap <= 0.1 deg`, a.endGap <= 0.5 && a.endHeadingGapDeg <= 0.1, `gap ${a.endGap} m, heading ${a.endHeadingGapDeg} deg`);
  { const v50 = id === 'R4'; const rm = v50 ? minRadius(50) : RMIN; CHK(`${id} radius >= min radius at ${v50 ? 50 : 60} km/h (${f1(rm)} m)` + (v50 ? ' [J4-R4 engineer exception: approach to a roundabout, J11 puts a 50 km/h sign before the curve]' : ''), a.radius >= rm, `R ${a.radius} m, spiral ${a.spiralLs} m`); }
  CHK(`${id} deck level at the circle edge = ${J.frame.deckY} m`, Math.abs(rows[0].y - J.frame.deckY) < 0.05, `${rows[0].y}`);
  const lastY = rows[rows.length - 1].y; CHK(`${id} end level = old road level`, Math.abs(lastY - a.yEnd) < 0.1, `${lastY} vs ${a.yEnd}`);
  let gmax = 0; for (let i = 1; i < rows.length; i++) { const ds = rows[i].s - rows[i - 1].s; if (ds > 0.5) gmax = Math.max(gmax, Math.abs(rows[i].y - rows[i - 1].y) / ds); }
  const lim = id === 'R6' ? 0.04 : 0.06;
  CHK(`${id} max grade <= ${lim * 100} % (limit)`, gmax <= lim + 1e-4, `max ${f2(gmax * 100)} %`);
  const crestA = Math.abs(a.vpi[1] ? (a.vpi[1].y - a.vpi[0].y) / (a.vpi[1].s - a.vpi[0].s) : 0) * 100;
  CHK(`${id} crest curve L >= K x A (K ${f1(KC)})`, a.vpi[0].L >= KC * crestA - 0.01, `L ${a.vpi[0].L} m, A ${f2(crestA)} %, needs ${f1(KC * crestA)} m`);
  if (a.sag) { const Asag = (a.grade + a.gradeUp) * 100; CHK(`${id} sag curve L >= K x A (K ${f1(KS)})`, a.sag.L >= KS * Asag - 0.5, `L ${f1(a.sag.L)} m, A ${f2(Asag)} %, needs ${f1(KS * Asag)} m`); }
  let cut = 0, fill = 0, cutS = 0, exCut = 0; for (const r of rows) { const d = r.y - r.nat; if (r.ex) { exCut = Math.max(exCut, -d); continue; } if (-d > cut) { cut = -d; cutS = r.s; } fill = Math.max(fill, d); }
  CHK(`${id} cut <= 12 m (H7)`, cut <= 12, `max NEW cut ${f1(cut)} m at s ${cutS}` + (exCut > 0 ? `; rows within 15 m of the old R4-9 line are EXISTING cut (up to ${f1(exCut)} m, already in the game)` : ''));
  if (fill > 7) P(`INFO  ${id} fill up to ${f1(fill)} m (> 7 m): needs MSE walls (J2 decided walls above 4 m; wall design NOT RUN)`); else P(`PASS  ${id} fill <= 7 m  max ${f1(fill)} m`);
}
{ const g: any = new TerrainGenerator(Config.world.seed); const sc = g.makeSample();
  for (const id of ['R6', 'R4']) { const rows: any[] = J.arms[id].rows; let wet = 0; for (const r of rows) { g.sample(r.x, r.z, sc); if (!Number.isNaN(sc.water) && sc.water > sc.h) wet++; } CHK(`${id} no surface water on the axis`, wet === 0, `${wet} of ${rows.length} samples wet`); } }

P(''); P('NOT RUN: rail clearance of the new R4 / R6 line, buildings and trees on the arms, crossing with other roads (R1 list), MSE wall design, superelevation (J5), traffic simulation, game look.');
P(''); P(fails === 0 ? 'ALL RUN CHECKS PASS' : `${fails} FAIL`);
writeFileSync(`${dir}/J300_GEOM.txt`, out.join('\n') + '\n');
