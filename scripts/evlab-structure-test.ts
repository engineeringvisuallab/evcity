// EVLab step 1.1b: podium columns + transfer girders, hall roof trusses, outriggers + belt truss on the mechanical floors (pure layout test, no three.js).
import * as TL from '../src/evlab/EVLabTowerLayout';
import * as S from '../src/evlab/EVLabStructure';
import { BLD, DIVIDER, HALL } from '../src/evlab/EVLabLayout';

let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.error('FAIL: ' + m); } };
const same = (a: number, b: number): boolean => Math.abs(a - b) < 0.05;

// ---------------------------------------------------------------- podium
const pod = S.podium(), lvl1 = TL.columnsOf(1);
const transferred = lvl1.filter(S.isTransferred);
console.log(`podium: ${pod.cols.length} columns to the ground, ${pod.girders.length} transfer girders (${transferred.length} tower columns transferred)`);
ok(pod.girders.length === transferred.length && transferred.length > 0, 'every transferred column has its girder');
for (const c of lvl1) {
  if (S.isTransferred(c)) continue;
  const g = pod.cols.find((p) => same(p.x, c.x) && same(p.z, c.z));
  ok(!!g && g.s >= c.s - 1e-9, `tower column (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) continues to the ground and is not thinner`);
}
for (const p of pod.cols) {
  ok(p.s * p.s * TL.COL_CAP >= p.load * 0.999, `ground column (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) ${p.s} m carries ${(p.load / 1000).toFixed(0)} MN`);
  ok(S.podiumNeed(p.load) <= TL.STRUCT.maxSide + 1e-9, `ground column (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) section need ${S.podiumNeed(p.load).toFixed(2)} m is within the maximum`);
  ok(p.z - p.s / 2 > DIVIDER.z + 0.5 && p.z + p.s / 2 < BLD.hz - 1 && Math.abs(p.x) + p.s / 2 < BLD.hx - 1, `ground column (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) stands in the lobby, not in the hall or the walls`);
  // not in a ramp (3 openings, z DIVIDER.z .. 27) and not in a core block
  ok(!DIVIDER.openings.some(([a, b]) => p.x + p.s / 2 > a && p.x - p.s / 2 < b && p.z - p.s / 2 < 27), `ground column (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) is not in a ramp`);
  ok(!TL.CORES.some((b) => p.x + p.s / 2 > b.x0 && p.x - p.s / 2 < b.x1 && p.z + p.s / 2 > b.z0 && p.z - p.s / 2 < b.z1), `ground column (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) is not in a core block`);
}
// the columns do not touch the fixed lobby furniture (numbers copied from EVLabLobby: decor columns, desks, plants, sofas, tables)
const decor: Array<[number, number, number, number]> = [];
for (const x of [-76, -58, -40, 40, 58, 76]) for (const z of [22, 38]) decor.push([x - 1.1, x + 1.1, z - 1.1, z + 1.1]);
for (const x of [-30, 30]) decor.push([x - 6.2, x + 6.2, 52 - 1.5, 52 + 1.5]);
for (const [x, z] of [[-84, 53], [84, 53], [-12, 53], [12, 53], [-84, 18], [84, 18], [-30, 18], [30, 18]]) decor.push([x - 0.8, x + 0.8, z - 0.8, z + 0.8]);
for (const [x, z] of [[-50, 24], [50, 24]]) decor.push([x - 1.8, x + 1.8, z - 0.7, z + 0.7]);
for (const [x, z] of [[-75, 34], [75, 34]]) decor.push([x - 1.1, x + 1.1, z - 1.1, z + 1.1]);
for (const p of pod.cols) ok(!decor.some((d) => p.x + p.s / 2 > d[0] - 0.3 && p.x - p.s / 2 < d[1] + 0.3 && p.z + p.s / 2 > d[2] - 0.3 && p.z - p.s / 2 < d[3] + 0.3), `ground column (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) does not touch lobby furniture`);
for (const g of pod.girders) {
  const [l, r] = g.supports;
  ok(l.x < g.carries.x && r.x > g.carries.x && same(l.z, g.z) && same(r.z, g.z), `girder at z ${g.z.toFixed(1)}: the carried column lies between its supports`);
  const t = S.girderFlange(g) / S.PODIUM.girderW;
  console.log(`girder x ${g.x0.toFixed(1)} .. ${g.x1.toFixed(1)}, z ${g.z.toFixed(1)}: carries ${(g.load / 1000).toFixed(0)} MN, flange area ${S.girderFlange(g).toFixed(3)} m2 = ${(t * 1000).toFixed(0)} mm plate over ${S.PODIUM.girderW} m`);
  ok(t < 0.35, `girder flange plate ${(t * 1000).toFixed(0)} mm thick is buildable`);
  ok(S.PODIUM.girderBottom > 3 && S.PODIUM.girderBottom < S.PODIUM.ceil, 'girder hangs below the roof slab but far above head height');
}
ok(S.podiumSolids().length === pod.cols.length && S.podiumSolids().every((b) => b[0] < b[1] && b[2] < b[3] && b[4] < b[5]), 'podium colliders are valid');

// ---------------------------------------------------------------- hall roof trusses
const H = S.HALL_TRUSS;
console.log(`hall truss: ${H.xs.length} trusses, span ${H.span} m, depth ${H.depth.toFixed(2)} m (L/D ${H.ratio.toFixed(1)}), chord ${H.chord} m box (needs ${(H.chordA * 1e4).toFixed(0)} cm2), diagonal ${H.diag} m`);
ok(H.span === HALL.z1 - HALL.z0 || Math.abs(H.span - (DIVIDER.z - 0.5 - HALL.z0)) < 1e-9, 'truss spans the whole hall depth (wall to wall)');
ok(H.xs.every((x) => x - H.chord / 2 > HALL.x0 + 1 && x + H.chord / 2 < HALL.x1 - 1), 'all trusses stand inside the hall side walls');
ok(H.xs.every((x, i) => i === 0 || Math.abs(x - H.xs[i - 1] - H.spacing) < 1e-9), 'even spacing');
ok(H.yTop + H.chord / 2 <= BLD.roofTop, `top chord ${(H.yTop + H.chord / 2).toFixed(2)} m stays under the roof deck ${BLD.roofTop}`);
ok(H.yBot - H.chord / 2 > 15.5, 'bottom chord hangs less than 1.5 m below the ceiling and well above the screen / chandeliers');
ok(H.chord * 4 * 0.03 >= H.chordA * 0.98, 'chord box (30 mm walls) has the area the bending moment needs');
ok(H.ratio < 32, 'span / depth is within what a high-strength truss can do (cambered)');
for (const x of [-36, 36]) ok(H.xs.every((t) => Math.abs(t - x) > H.chord / 2 + 1), `chandelier at x ${x} hangs between trusses`);

// ---------------------------------------------------------------- mechanical floors
const core = TL.coreColliders().solids;
for (const n of S.MECH_LEVELS) {
  ok(TL.FLOORS[n].kind === 'mech', `level ${n} is a mechanical floor`);
  const out = S.outriggersOf(n), y = TL.levelY(n), top = TL.ceilY(n);
  ok(out.length === 2 && out[0].side === -1 && out[1].side === 1, `level ${n}: outriggers on both sides`);
  for (const o of out) {
    const open = o.panels.filter((p) => p.open);
    ok(open.length === 1 && open[0].x1 - open[0].x0 >= 3, `level ${n}: one open doorway panel >= 3 m (${open.length ? (open[0].x1 - open[0].x0).toFixed(1) : 'none'})`);
    ok(top - o.chord - y >= 2.2, `level ${n}: ${(top - o.chord - y).toFixed(2)} m of head room under the top chord in the doorway`);
    const face = o.side < 0 ? TL.CORES[0].x0 : TL.CORES[1].x1;
    ok(o.panels.some((p) => same(p.x0, Math.min(face, face)) || same(p.x1, face)), `level ${n}: the truss starts at the core block face`);
    ok(o.panels.length >= 2, `level ${n}: at least a closed panel at the core and a doorway`);
  }
  ok(S.beltOf(n).length >= 16, `level ${n}: belt truss round the facade (${S.beltOf(n).length} panels)`);
  // the doorway is walkable and the two halves of the floor are connected through it
  const boxes = [...TL.levelSolids(n).solids, ...S.outriggerSolids(n), ...core];
  const R = 0.45, blocked = (x: number, z: number): boolean => boxes.some((b) => b[4] < y + 1.7 && b[5] > y + 0.3 && x > b[0] - R && x < b[1] + R && z > b[2] - R && z < b[3] + R);
  for (const o of out) {
    const d = o.panels.find((p) => p.open)!, mx = (d.x0 + d.x1) / 2;
    ok(!blocked(mx, 33) && !blocked(mx, 35) && !blocked(mx, 37), `level ${n}: the ${o.side < 0 ? 'west' : 'east'} doorway at x ${mx.toFixed(1)} is free to walk through`);
    const closed = o.panels.find((p) => !p.open)!;
    ok(blocked((closed.x0 + closed.x1) / 2, 35), `level ${n}: a closed panel blocks the walk`);
  }
}
console.log(fails ? `${fails} FAILED` : 'evlab structure: all ok');
process.exit(fails ? 1 : 0);
