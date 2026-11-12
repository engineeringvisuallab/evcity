// EVLab parking lot (Step 7): the meshes. Layout numbers are in EVLabParking (pure). Building-local metres.
// Flat asphalt, one merged mesh of white bay lines, low kerbs, the entry road to the F6 highway and a few lamp posts.
// No colliders (like the other parking lots: the ground is the ground; the kerb is only 14 cm high).
import * as THREE from 'three';
import { DRIVE, LAMPS, LOT, kerbRects, paintRects } from './EVLabParking';
import { cornerFlare, roadStrip } from './EVLabRoads';
import { EVLAB_ROAD } from './EVLabSite';
import { BUILDING_Z } from './EVLabLayout';
import type { Parts } from './EVLabParts';

export interface ParkingLotBuild {
  group: THREE.Group;
  /** Lamp post positions (building-local x, z): EVLabGrounds adds them to its instanced lamps. */
  lamps: Array<[number, number]>;
}

/** One geometry from many flat rectangles [x0, x1, z0, z1] at height y (all faces up). */
function flatRects(P: Parts, rects: ReadonlyArray<readonly [number, number, number, number]>, y: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (const [x0, x1, z0, z1] of rects) {
    const b = pos.length / 3;
    pos.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z1);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const geo = P.k.own(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * `ground(x, z)` (optional) = height of the real ground above the floor level (m) at a building-local point. The entry road follows it, because the last
 * metres before the F6 highway run down to the highway's own level (0.5 m lower than the campus floor). Without it the road is flat.
 */
export function buildParkingLot(P: Parts, road: THREE.Material, ground?: (x: number, z: number) => number): ParkingLotBuild {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabParkingLot';
  const y = 0.05; // same height as the campus roads (just above the levelled terrain)

  const mat = (color: number, factor: number): THREE.MeshLambertMaterial =>
    k.own(new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: factor }));

  // asphalt of the lot (the same grey as the roads), then the white paint on top of it
  const asphalt = new THREE.Mesh(flatRects(P, [[LOT.x0, LOT.x1, LOT.z0, LOT.z1]], y), mat(0x5f6366, -2));
  asphalt.receiveShadow = true;
  const paint = new THREE.Mesh(flatRects(P, paintRects(), y + 0.012), mat(0xf1f1ea, -4));
  paint.receiveShadow = true;
  g.add(asphalt, paint);

  // low concrete kerb round the lot (open at the entry road and at the promenade walkway)
  const kerbMat = P.lit(null, 0x9a9ea3, 0.05);
  for (const [x0, x1, z0, z1] of kerbRects()) P.tbox(g, x0, x1, z0, z1, 0, y + 0.14, kerbMat);

  // the entry road: from the middle of the cross aisle south to the highway (asphalt ribbon with edge lines and a dashed centre line)
  const pts: Array<[number, number]> = [], ys: number[] = [];
  const zEnd = Math.min(DRIVE.z1, EVLAB_ROAD.edgeZ - BUILDING_Z + 0.3); // stops at the highway's north asphalt edge, it does not run onto the lanes
  for (let z = DRIVE.z0; z < zEnd - 1e-6; z += 4) { pts.push([DRIVE.x, z]); ys.push(ground ? ground(DRIVE.x, z) + 0.08 : y); }
  pts.push([DRIVE.x, zEnd]); ys.push(ground ? ground(DRIVE.x, zEnd) + 0.08 : y);
  // (flat ground is 0.03 m below the floor: + 0.08 = the same 0.05 as the lot)
  roadStrip(g, k, pts, DRIVE.halfW, y, road, 8, ys);
  const yAtDrive = (x: number, z: number): number => (ground ? ground(x, z) + 0.08 : y);
  cornerFlare(g, k, 1, DRIVE.x + DRIVE.halfW, zEnd, 4, yAtDrive);
  cornerFlare(g, k, -1, DRIVE.x - DRIVE.halfW, zEnd, 4, yAtDrive);

  return { group: g, lamps: LAMPS.map(([x, z]) => [x, z] as [number, number]) };
}
