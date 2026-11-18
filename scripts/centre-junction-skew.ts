// STEP 21.7-4 SKEWED T JUNCTIONS (headless, READ ONLY: changes NO src file and NO data file; writes docs/STEP_21_7_4_OUTPUT.txt + docs/centre_junction_skew.json).
// The 5 BLOCKED nodes of 21.49 (N028 N034 N039 N050 N080) stay where they are as recorded exceptions (41.7 - 51.3 deg). This script gives the junction mouth numbers (AI decisions, constants below, all printed):
//  1. kerb radius per corner: obtuse corner larger, acute corner smaller (phi/90 and 90/phi of the base radius of 21.7-2), clamped to 6 .. 25 m (R_FLOOR, Step 8)
//  2. stop control on the minor road; stop line distance from the major centre line along the minor axis = (road half width + STOP_EDGE) / sin(phi)
//  3. sight distance of the priority T with the longer crossing path of a skew: extra path = major road width x (1 / sin(phi) - 1) at CROSS_V m/s added to the gap time TG
// Whether the NEW (longer) sight triangle is free of buildings and hills is NOT RUN here (needs the ground check of centre-junction-geom.ts): listed for the user.
// Run: node --experimental-transform-types scripts/centre-junction-skew.ts docs
import { readFileSync, writeFileSync } from 'fs';
const OUT = process.argv[2] ?? 'docs';
const f1 = (v: number): string => v.toFixed(1), f0 = (v: number): string => v.toFixed(0);
const L: string[] = []; const pr = (s = ''): void => { L.push(s); console.log(s); };
let pass = 0, fail = 0; const chk = (ok: boolean, msg: string): void => { if (ok) pass++; else fail++; pr(`   ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const info = (msg: string): void => pr(`   INFO  ${msg}`);
const g = JSON.parse(readFileSync(`${OUT}/centre_junction_geom.json`, 'utf8'));
const C = g.constants, V: Record<string, number> = C.V, W: Record<string, number> = C.W, TG: number = C.TG, R_FLOOR: number = C.R_FLOOR;
const LANES: Record<string, number> = { '6': 2, '4': 2, '2': 1, C: 1, L: 1 };       // lanes per direction, same as 21.7-2
const NODES = ['N080', 'N034', 'N028', 'N050', 'N039'];                              // worst angle first
const STOP_EDGE = 3.0, CROSS_V = 4.0, R_MAX = 25;                                     // m beyond the major lane edge; crossing speed m/s (ASSUMED)
pr('STEP 21.7-4 SKEWED T JUNCTIONS (headless, read only; src / data NOT changed; tsc / build / game NOT RUN)');
pr(`constants (MY choices): kerb radius clamp ${R_FLOOR} .. ${R_MAX} m; acute x phi/90, obtuse x 90/phi; stop line edge ${STOP_EDGE} m; crossing speed ${CROSS_V} m/s; gap time TG ${TG} s (21.7-2)`);
pr();
const rows: any[] = [];
for (const id of NODES) {
  const t = g.tjunctions.find((q: any) => q.id === id); if (!t) { chk(false, `${id}: not in 21.7-2 tjunctions`); continue; }
  const phi: number = t.phi, s = Math.sin((phi * Math.PI) / 180), vmaj = V[t.majCls];
  const ra = Math.max(R_FLOOR, Math.min(R_MAX, t.kerbBase * (phi / 90))), ro = Math.min(R_MAX, t.kerbBase * (90 / phi));
  const half = LANES[t.majCls] * W[t.majCls], width = 2 * half, stop = (half + STOP_EDGE) / s;
  const extra = (width * (1 / s - 1)) / CROSS_V, isd = 0.278 * vmaj * (TG + extra);
  const r = { id, minor: t.minor, major: t.major.split('+')[0], phi, kind: t.kind, kerbAcute: +ra.toFixed(1), kerbObtuse: +ro.toFixed(1), stopLineM: +stop.toFixed(1), isdOld: t.isd, isdSkew: +isd.toFixed(1), ssd: t.ssd, oldSightFit: t.sightFit, pocketFit: t.pocketFit, pocketAvail: t.avail, pocketNeed: t.pocketShort ? +t.pocketShort.total.toFixed(1) : null };
  rows.push(r);
  pr(`   ${id}  ${r.minor} x ${r.major}  ${f1(phi)} deg  type ${t.kind}  kerb acute ${f1(ra)} / obtuse ${f1(ro)} m  stop line ${f1(stop)} m from the major centre line  sight ${f0(t.isd)} -> ${f0(isd)} m (stopping ${f0(t.ssd)})  turn pocket: ${t.pocketFit}${t.avail ? ' (' + f0(t.avail) + ' m free, short form ' + f0(r.pocketNeed ?? 0) + ' m)' : ''}`);
}
pr();
chk(rows.length === NODES.length, `all ${NODES.length} nodes found in 21.7-2`);
chk(rows.every((r) => r.kerbAcute >= R_FLOOR && r.kerbObtuse <= R_MAX && r.kerbAcute <= r.kerbObtuse), 'every kerb radius is inside 6 .. 25 m and acute <= obtuse');
chk(rows.every((r) => r.isdSkew >= r.isdOld && r.isdSkew >= r.ssd), 'every skew sight distance is >= the 90 deg value and >= the stopping sight');
const pk = rows.filter((r) => r.pocketFit === 'NO');
info(`LIST for the user: ${pk.map((r) => r.id + ' turn pocket does not fit even in the short form (' + f0(r.pocketAvail) + ' m free, ' + f0(r.pocketNeed) + ' m needed)').join('; ') || 'none'}`);
info(`NOT RUN: the new sight triangle (length ${rows.map((r) => r.id + ' ' + f0(r.isdSkew)).join(', ')} m) against buildings and hills. 21.7-2 only checked the old, shorter triangle.`);
info('Stop control on every minor road above: STOP sign + stop line, major road has priority. Kerb radii and stop lines are numbers only; the mesh of the mouths is a build step (B7).');
pr();
pr(`SUMMARY 21.7-4: ${pass} PASS, ${fail} FAIL`);
writeFileSync(`${OUT}/STEP_21_7_4_OUTPUT.txt`, L.join('\n') + '\n');
writeFileSync(`${OUT}/centre_junction_skew.json`, JSON.stringify({ note: 'STEP 21.7-4 skewed T junctions', constants: { STOP_EDGE, CROSS_V, R_MAX, R_FLOOR, TG }, nodes: rows }) + '\n');
process.exit(fail === 0 ? 0 : 1);
