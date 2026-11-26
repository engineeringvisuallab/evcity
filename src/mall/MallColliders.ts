// CITY MALL, STEP R1: the Rapier colliders of the mall, shared by MallManager (the game) and scripts/mall-test.ts so both use ONE truth.
//  - createStaticColliders: everything that is always there (glass wall, ground floor, 9 floor slabs, closed roof, stair / lift cores, billboards)
//  - FloorColliders: what belongs to ONE floor (the ~680 columns of a floor, the atrium balustrade, later the shelves). ~680 columns x 10 floors would be 6,800 colliders, so the game keeps
//    only the floor(s) the player is on (MallBuild.floorSolids / floorObbs) and creates / removes the rest on the way (PERFORMANCE_RULES.md: physics collider only NEAR).
import type RAPIER from '@dimforge/rapier3d-compat';
import type { MallBuild, Obb, Solid } from './MallBuilder';

type Rapier = typeof RAPIER;

const solidDesc = (R: Rapier, s: Solid): RAPIER.ColliderDesc =>
  R.ColliderDesc.cuboid((s.maxX - s.minX) / 2, (s.maxY - s.minY) / 2, (s.maxZ - s.minZ) / 2)
    .setTranslation((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2).setFriction(0.4);
const obbDesc = (R: Rapier, o: Obb): RAPIER.ColliderDesc =>
  R.ColliderDesc.cuboid(o.hx, (o.y1 - o.y0) / 2, o.hz).setTranslation(o.cx, (o.y0 + o.y1) / 2, o.cz)
    .setRotation({ x: 0, y: Math.sin(o.rot / 2), z: 0, w: Math.cos(o.rot / 2) }).setFriction(0.2);

/** The always-on colliders, all attached to `body` (a fixed body at the mall's origin + yaw). */
export function createStaticColliders(R: Rapier, W: RAPIER.World, body: RAPIER.RigidBody, b: MallBuild): void {
  for (const s of b.solids) W.createCollider(solidDesc(R, s), body); // billboards, stair rails + landings, lift shafts, directory boards
  for (const r of b.ramps) { // ramps between the floors (walkable slopes)
    const dx = r.x1 - r.x0, dy = r.y1 - r.y0, len = Math.hypot(dx, dy), ang = Math.atan(dy / dx); // in (-90, 90) deg: the box never turns upside down
    const cx = (r.x0 + r.x1) / 2 + Math.sin(ang) * (r.thick / 2), cy = (r.y0 + r.y1) / 2 - Math.cos(ang) * (r.thick / 2);
    W.createCollider(R.ColliderDesc.cuboid(len / 2, r.thick / 2, r.width / 2).setTranslation(cx, cy, r.zc).setRotation({ x: 0, y: 0, z: Math.sin(ang / 2), w: Math.cos(ang / 2) }).setFriction(1), body);
  }
  for (const r of b.rampRails) {
    W.createCollider(R.ColliderDesc.cuboid(r.hx, r.hy, r.hz).setTranslation(r.cx, r.cy, r.cz).setRotation({ x: 0, y: 0, z: Math.sin(r.rotZ / 2), w: Math.cos(r.rotZ / 2) }), body);
  }
  for (const o of b.obbs) W.createCollider(obbDesc(R, o), body); // the glass curtain wall (turned boxes)
  for (const m of b.meshSolids) W.createCollider(R.ColliderDesc.trimesh(m.vertices, m.indices).setFriction(1), body); // ground floor, floor slabs, roof (triangle meshes)
}

/** Keeps the per-floor colliders of exactly the floors you ask for. */
export class FloorColliders {
  private made = new Map<number, RAPIER.Collider[]>();
  constructor(private R: Rapier, private W: RAPIER.World, private body: RAPIER.RigidBody, private b: MallBuild) {}

  /** The floors that have colliders now. */
  get floors(): number[] { return [...this.made.keys()].sort((a, b) => a - b); }

  /** Make the colliders of exactly these floors exist (create the new ones, remove the others). Cheap when nothing changes. */
  set(want: Iterable<number>): void {
    const w = new Set<number>();
    for (const f of want) if (f >= 0 && f < this.b.floorSolids.length) w.add(f);
    for (const [f, list] of this.made) if (!w.has(f)) { for (const c of list) this.W.removeCollider(c, true); this.made.delete(f); }
    for (const f of w) {
      if (this.made.has(f)) continue;
      const list: RAPIER.Collider[] = [];
      for (const s of this.b.floorSolids[f]) list.push(this.W.createCollider(solidDesc(this.R, s), this.body));
      for (const o of this.b.floorObbs[f]) list.push(this.W.createCollider(obbDesc(this.R, o), this.body));
      this.made.set(f, list);
    }
  }

  dispose(): void { this.set([]); }
}

const AROUND = new Map<number, readonly number[]>();
const NONE: readonly number[] = [], GROUND: readonly number[] = [0];
/**
 * Which floors need colliders for something standing `feet` m above the mall's ground floor: the floor it stands on and, within 1 m of a floor level, the next one too
 * (so a column / rail of the floor it is about to reach is there before the feet arrive). `near` = outside but close to the building: only the ground floor (the doorways).
 * Returns shared arrays (no allocation per call), so `want !== last` is a cheap "did it change" test.
 */
export function floorsAround(feet: number, floorH: number, nFloors: number, inside: boolean, near: boolean): readonly number[] {
  if (!inside) return near ? GROUND : NONE;
  const top = Math.max(0, Math.min(nFloors - 1, Math.floor((feet + 1.0) / floorH))), low = Math.max(0, Math.min(nFloors - 1, Math.floor((feet - 1.0) / floorH)));
  const key = top * 32 + low;
  let r = AROUND.get(key);
  if (!r) { r = top === low ? [top] : [low, top]; AROUND.set(key, r); }
  return r;
}
