// EVLab steps 1.2b + 1.2c: glass partition around the lift / stair lobby and the office gates (pure layout test, no three.js).
import * as TL from '../src/evlab/EVLabTowerLayout';

let fails = 0;
const ok = (c: boolean, m: string): void => { if (!c) { fails++; console.error('FAIL: ' + m); } };

const officeLevels: number[] = [], otherLevels: number[] = [];
for (let n = 1; n <= TL.T.roof; n++) (TL.FLOORS[n].kind === 'office' ? officeLevels : otherLevels).push(n);
console.log(`${officeLevels.length} office floors get the partition, ${otherLevels.length} other levels stay open`);
ok(officeLevels.length > 40, 'many office floors');
ok(otherLevels.every((n) => TL.partitionOf(n).length === 0 && TL.partitionSolids(n).length === 0), 'only office floors have a partition');

// geometry: the lobby is exactly the strip between the two core blocks
const L = TL.LOBBY;
ok(Math.abs(L.x0 - TL.CORES[0].x1) < 1e-6 && Math.abs(L.x1 - TL.CORES[1].x0) < 1e-6, 'lobby lies between the blocks');
ok(L.x1 - L.x0 > 20 && L.z1 - L.z0 > 10, `lobby size ${(L.x1 - L.x0).toFixed(1)} x ${(L.z1 - L.z0).toFixed(1)} m is roomy`);
for (const n of officeLevels) {
  const ring = TL.ringOf(n), pw = TL.partitionOf(n);
  ok(pw.length === 2 && pw[0].side === 'north' && pw[1].side === 'south', `level ${n}: two partitions`);
  for (const w of pw) {
    ok(TL.inRing(ring, w.x0, w.z, 0.6) && TL.inRing(ring, w.x1, w.z, 0.6), `level ${n}: partition ${w.side} stands inside the glass wall`);
    ok(w.g1 - w.g0 >= 2.4 && w.g0 > w.x0 + 2 && w.g1 < w.x1 - 2, `level ${n}: gate ${w.side} is wide (${(w.g1 - w.g0).toFixed(1)} m) and inside the wall`);
  }
}
ok(TL.PART.gateH >= 2.4 && TL.PART.gateH < TL.T.floorH - TL.T.slab - 0.3, 'gate height fits under the ceiling');

// walk test with a 0.45 m radius: lift doors -> gate -> office wings; sealed when the gates are shut
type Box = readonly [number, number, number, number, number, number];
const core = TL.coreColliders().solids;
function walk(n: number, shutGates: boolean): { r: (x: number, z: number) => boolean; count: (xa: number, xb: number) => number } {
  const y = TL.levelY(n), R = 0.45, C = 0.25, X0 = -85, X1 = 85, Z0 = 10, Z1 = 62;
  const boxes: Box[] = [...TL.levelSolids(n).solids, ...core];
  if (shutGates) for (const w of TL.partitionOf(n)) boxes.push([w.g0, w.g1, w.z - 0.06, w.z + 0.06, y, y + 3]);
  const ring = TL.ringOf(n);
  const Wc = Math.round((X1 - X0) / C) + 1, Dc = Math.round((Z1 - Z0) / C) + 1;
  const id = (x: number, z: number): number => Math.round((z - Z0) / C) * Wc + Math.round((x - X0) / C);
  const blocked = (x: number, z: number): boolean =>
    !TL.inRing(ring, x, z, 0.8) || boxes.some((b) => b[4] < y + 1.7 && b[5] > y + 0.3 && x > b[0] - R && x < b[1] + R && z > b[2] - R && z < b[3] + R);
  const seen = new Uint8Array(Wc * Dc);
  const [sx, sz] = TL.blockToWorld(0, TL.LIFTS[0].cx, 43.2); // in front of lift 1 (a bit further out so the 0.45 m body fits)
  const st: Array<[number, number]> = [[sx, sz]];
  seen[id(sx, sz)] = 1;
  while (st.length) {
    const [x, z] = st.pop()!;
    for (const [dx, dz] of [[C, 0], [-C, 0], [0, C], [0, -C]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < X0 || nx > X1 || nz < Z0 || nz > Z1 || seen[id(nx, nz)] || blocked(nx, nz)) continue;
      seen[id(nx, nz)] = 1; st.push([nx, nz]);
    }
  }
  const count = (xa: number, xb: number): number => { let c = 0; for (let x = xa; x <= xb; x += C) for (let z = Z0; z <= Z1; z += C) if (seen[id(x, z)] === 1) c++; return c; };
  return { r: (x, z) => seen[id(x, z)] === 1, count };
}
const cx = (L.x0 + L.x1) / 2;
for (const n of [2, 3, 10, 33, 60, 83]) {
  if (!officeLevels.includes(n)) continue;
  const ring = TL.ringOf(n), open = walk(n, false), shut = walk(n, true);
  // standing places: in front of the two lift doors and the two stair doors (inside the lobby), the middle of the lobby, in front of both gates (office side)
  const inLobby: Array<[number, number]> = [];
  for (const [blk, x] of [[0, TL.LIFTS[0].cx], [1, TL.LIFTS[1].cx], [0, TL.STAIRS[0].doorX], [1, TL.STAIRS[1].doorX]] as const) {
    const [wx, wz] = TL.blockToWorld(blk, x, 41.2 + 1.2); // ~1.2 m out from the door
    inLobby.push([wx, wz]);
  }
  for (const [x, z] of inLobby) { ok(open.r(x, z), `level ${n}: standing in front of a lift / stair door at (${x.toFixed(1)}, ${z.toFixed(1)}) is possible and connected`); ok(shut.r(x, z), `level ${n}: (sealed test) lobby spot reachable`); }
  const north: [number, number] = [cx, L.z0 - 1.5], south: [number, number] = [cx, L.z1 + 1.5];
  ok(open.r(...north) && open.r(...south), `level ${n}: both gates lead to the office strip (north + south)`);
  ok(!shut.r(...north) && !shut.r(...south), `level ${n}: with the gates shut the glass really closes the lobby`);
  const wx = TL.CORES[1].x1 + 0.3, west = open.count(-ring.hx, -wx), east = open.count(wx, ring.hx); // cells beyond the outer faces of the core blocks
  ok(west > 150, `level ${n}: west wing reachable through the gate (${west} cells)`);
  ok(east > 150, `level ${n}: east wing reachable through the gate (${east} cells)`);
  ok(shut.count(-ring.hx, -wx) === 0 && shut.count(wx, ring.hx) === 0, `level ${n}: with the gates shut no wing is reachable from the lobby`);
  // furniture keeps out of the lobby and the gate approach
  const plan = TL.floorPlan(n);
  const bad = plan.items.filter((it) => it.t === 'desk' && TL.nearLobby(it.x, it.z, 1.7, 0.85));
  ok(bad.length === 0, `level ${n}: ${bad.length} desks inside the lobby zone`);
  const inside = plan.solids.filter((b) => b[0] < L.x1 && b[1] > L.x0 && b[2] < L.z1 && b[3] > L.z0 && b[5] - b[4] < 3);
  ok(inside.length === 0, `level ${n}: ${inside.length} furniture solids inside the lobby`);
}
console.log(fails ? `${fails} FAILED` : 'evlab partition: all ok');
process.exit(fails ? 1 : 0);
