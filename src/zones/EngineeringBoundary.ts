// Boundary FENCING around every engineering area (EngineeringZones.ts), same look as the SWTP fence (thin see-through mesh, steel top rail, slim steel posts, tall coloured corner posts), following the ground,
// closed all round (no gates). It only stops where a public road crosses it. The layout (which pieces exist) is src/city/EngineeringFence.ts.
//  - panels + posts are InstancedMesh (2 draw calls per area), an area's fence is hidden when the player is far away
//  - Rapier colliders (fixed body, absolute world coordinates, like the EVLab fence) so the player, cars and boats cannot go through
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { FloatingOrigin } from '../world/FloatingOrigin';
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { ENGINEERING_AREAS, ENGINEERING_GROUP_COLOR, type EngineeringArea } from '../city/EngineeringZones';
import { RoadHash, buildFenceLayout, type FenceLayout } from '../city/EngineeringFence';

export interface EngineeringBoundaryDeps {
  root: THREE.Object3D; // world.root: children use ABSOLUTE world coordinates
  physics: PhysicsWorld;
  origin: FloatingOrigin;
  terrain: TerrainGenerator;
  playerWorld: (out: THREE.Vector3) => THREE.Vector3;
}

/** Prototype settings. `solid` = the fence stops the player / vehicles (set false for a look-only fence). */
export const ENGINEERING_BOUNDARY = {
  solid: true,
  panelHeight: 2.2,
  postHeight: 2.6,
  cornerHeight: 9,
  colliderHeight: 4,
  /** An area's fence is drawn within this distance (m) of the area. */
  showDist: 1800,
} as const;

interface AreaFence {
  area: EngineeringArea;
  group: THREE.Group;
  layout: FenceLayout;
}

export class EngineeringBoundary {
  private fences: AreaFence[] = [];
  private body: RAPIER.RigidBody | null = null;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private p = new THREE.Vector3();

  constructor(private d: EngineeringBoundaryDeps) {
    const T = d.terrain;
    const hash = new RoadHash(T.roads.roads);
    const box = new THREE.BoxGeometry(1, 1, 1);
    // SWTP-style fencing: a thin see-through mesh panel, a steel top rail and slim steel posts (only the corner posts carry the group colour)
    const panelMat = new THREE.MeshLambertMaterial({ color: 0x9aa3a8, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x6b7480 });
    const cornerMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); // the colour of each corner post comes from its instance colour
    this.geos.push(box);
    this.mats.push(panelMat, steelMat, cornerMat);

    // ground height the fence stands on: the surface of the water where the area reaches into a lake or the sea
    const s = T.makeSample();
    const surface = (x: number, z: number): number => {
      T.sample(x, z, s);
      return Number.isNaN(s.water) ? s.h : Math.max(s.h, s.water);
    };

    const R = d.physics.RAPIER;
    const o = d.origin.origin;
    if (ENGINEERING_BOUNDARY.solid) this.body = d.physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(-o.x, 0, -o.z));

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    for (const area of ENGINEERING_AREAS) {
      const layout = buildFenceLayout(area, hash);
      const group = new THREE.Group();
      group.name = `EngineeringBoundary:${area.id}`;
      const n = layout.visual.length;
      const panels = new THREE.InstancedMesh(box, panelMat, n);
      const rails = new THREE.InstancedMesh(box, steelMat, n);
      const posts = new THREE.InstancedMesh(box, steelMat, n);
      const corners = new THREE.InstancedMesh(box, cornerMat, layout.corners.length);
      col.set(ENGINEERING_GROUP_COLOR[area.group]);
      layout.visual.forEach((pc, i) => {
        const len = Math.hypot(pc.bx - pc.ax, pc.bz - pc.az);
        const ga = surface(pc.ax, pc.az), gb = surface(pc.bx, pc.bz), gm = surface((pc.ax + pc.bx) / 2, (pc.az + pc.bz) / 2);
        const lo = Math.min(ga, gb, gm) - 0.5, hi = Math.max(ga, gb, gm);
        const yaw = -Math.atan2(pc.bz - pc.az, pc.bx - pc.ax);
        q.setFromAxisAngle(up, yaw);
        const ph = hi + ENGINEERING_BOUNDARY.panelHeight - lo;
        m.compose(pos.set((pc.ax + pc.bx) / 2, lo + ph / 2, (pc.az + pc.bz) / 2), q, sc.set(len + 0.05, ph, 0.05));
        panels.setMatrixAt(i, m);
        m.compose(pos.set((pc.ax + pc.bx) / 2, hi + ENGINEERING_BOUNDARY.panelHeight, (pc.az + pc.bz) / 2), q, sc.set(len + 0.05, 0.08, 0.08));
        rails.setMatrixAt(i, m);
        const kh = hi + ENGINEERING_BOUNDARY.postHeight - (ga - 0.5);
        m.compose(pos.set(pc.ax, ga - 0.5 + kh / 2, pc.az), q.identity(), sc.set(0.12, kh, 0.12));
        posts.setMatrixAt(i, m);
      });
      // tall corner posts in the colour of the area's group (easy to see from far away)
      layout.corners.forEach((c, k) => {
        const g = surface(c.x, c.z);
        const h = ENGINEERING_BOUNDARY.cornerHeight + 0.5;
        m.compose(pos.set(c.x, g - 0.5 + h / 2, c.z), q.identity(), sc.set(0.5, h, 0.5));
        corners.setMatrixAt(k, m);
        corners.setColorAt(k, col);
      });
      for (const im of [panels, rails, posts, corners]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false;
        group.add(im);
      }
      d.root.add(group);
      this.fences.push({ area, group, layout });

      if (this.body) {
        for (const pc of layout.solid) {
          const len = Math.hypot(pc.bx - pc.ax, pc.bz - pc.az);
          const ga = surface(pc.ax, pc.az), gb = surface(pc.bx, pc.bz), gm = surface((pc.ax + pc.bx) / 2, (pc.az + pc.bz) / 2);
          const lo = Math.min(ga, gb, gm) - 0.5, hi = Math.max(ga, gb, gm);
          const yaw = -Math.atan2(pc.bz - pc.az, pc.bx - pc.ax);
          const ch = hi + ENGINEERING_BOUNDARY.colliderHeight - lo;
          d.physics.world.createCollider(
            R.ColliderDesc.cuboid(len / 2 + 0.05, ch / 2, 0.3)
              .setTranslation((pc.ax + pc.bx) / 2, lo + ch / 2, (pc.az + pc.bz) / 2)
              .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
              .setFriction(0.4),
            this.body,
          );
        }
      }
    }
  }

  /** Once per rendered frame: only the fences near the player are drawn. */
  update(): void {
    this.d.playerWorld(this.p);
    const sd = ENGINEERING_BOUNDARY.showDist;
    for (const f of this.fences) {
      const a = f.area;
      const dx = Math.max(a.x0 - this.p.x, this.p.x - a.x1, 0);
      const dz = Math.max(a.z0 - this.p.z, this.p.z - a.z1, 0);
      f.group.visible = Math.hypot(dx, dz) < sd;
    }
  }

  dispose(): void {
    if (this.body) this.d.physics.world.removeRigidBody(this.body);
    for (const f of this.fences) {
      this.d.root.remove(f.group);
      for (const c of f.group.children) (c as THREE.InstancedMesh).dispose();
    }
    for (const g of this.geos) g.dispose();
    for (const mt of this.mats) mt.dispose();
    this.fences = [];
  }
}
