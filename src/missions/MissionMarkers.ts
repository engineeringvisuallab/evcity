import * as THREE from 'three';
import { MISSIONS } from './MissionData';
import type { MissionPin } from './MissionTypes';

/**
 * MISSION PLACE MARKERS: every mission place is drawn in the world as a green, see-through CIRCULAR CYLINDER (a light pillar) that stands exactly
 * on the arrival circle (`place.radius`), plus a bright ring on the ground. So the player can see from far away where a mission takes place,
 * and sees the exact circle he has to enter.
 *
 * - Positions are ABSOLUTE world coordinates; the group is added to `world.root`, which the floating origin moves (like StationSignLayer).
 * - The tracked (active) mission pulses and is brighter; a finished mission turns dim; the others are plain green.
 * - Nothing here touches the mission logic or the physics: it is only drawing (no collider, the player walks straight through).
 */

/** The marker itself: a small green cylinder at the centre of the mission place, always there. */
const MARK_DIAMETER = 1; // m
const MARK_HEIGHT = 1.5; // m
/** The tall see-through light pillar over the whole arrival circle (off: only the small marker, the ground ring and the disc are drawn). */
const SHOW_WALL = false;
const HEIGHT = 70; // m above the ground of the centre
const BELOW = 25; // m the wall reaches under the centre height, so the wall is closed on a slope
const GREEN = 0x22e06a;
const GREEN_DONE = 0x6fae86;

interface Marker {
  id: string;
  group: THREE.Group;
  wall: THREE.Mesh;
  ring: THREE.Mesh;
  disc: THREE.Mesh;
  mark: THREE.Mesh;
  markMat: THREE.MeshBasicMaterial;
  wallMat: THREE.MeshBasicMaterial;
  ringMat: THREE.MeshBasicMaterial;
  discMat: THREE.MeshBasicMaterial;
}

/** A soft vertical fade (bright at the bottom, clear at the top) so the pillar looks like light and not like a solid tube. */
function makeFade(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.15)'); // top
  grd.addColorStop(0.55, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,1)'); // ground
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MissionMarkers {
  private group = new THREE.Group();
  private markers: Marker[] = [];
  private fade = makeFade();
  private t = 0;

  constructor(root: THREE.Object3D, groundAt: (x: number, z: number) => number) {
    this.group.name = 'mission-markers';
    for (const m of MISSIONS) {
      const { x, z, radius } = m.place;
      const y0 = groundAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, y0, z);

      // the wall: an open cylinder, seen from inside and outside
      const wallMat = new THREE.MeshBasicMaterial({
        color: GREEN, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, map: this.fade ?? null, blending: THREE.AdditiveBlending,
      });
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, HEIGHT + BELOW, 64, 1, true), wallMat);
      wall.position.y = (HEIGHT - BELOW) / 2;
      wall.renderOrder = 5;
      wall.frustumCulled = false;
      wall.visible = SHOW_WALL;
      g.add(wall);

      // the ring on the ground (flat, follows the centre height: good on flat mission sites)
      const ringMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.9, radius, 96), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.25;
      ring.renderOrder = 6;
      ring.frustumCulled = false;
      g.add(ring);

      // a faint disc inside the circle
      const discMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.9, 64), discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.2;
      disc.renderOrder = 4;
      disc.frustumCulled = false;
      g.add(disc);

      // the small marker: 1 m wide, 1.5 m high, standing on the ground at the centre
      const markMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9 });
      const mark = new THREE.Mesh(new THREE.CylinderGeometry(MARK_DIAMETER / 2, MARK_DIAMETER / 2, MARK_HEIGHT, 32), markMat);
      mark.position.y = MARK_HEIGHT / 2;
      mark.renderOrder = 7;
      mark.frustumCulled = false;
      g.add(mark);

      this.group.add(g);
      this.markers.push({ id: m.id, group: g, wall, ring, disc, mark, wallMat, ringMat, discMat, markMat });
    }
    root.add(this.group);
  }

  /** Call every frame with the pins of the MissionManager (active / done). */
  update(dt: number, pins: readonly MissionPin[]): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    for (const mk of this.markers) {
      const pin = pins.find((p) => p.id === mk.id);
      const done = !!pin?.done;
      const active = !!pin?.active;
      const col = done ? GREEN_DONE : GREEN;
      mk.wallMat.color.setHex(col);
      mk.ringMat.color.setHex(col);
      mk.discMat.color.setHex(col);
      mk.markMat.color.setHex(col);
      mk.markMat.opacity = done ? 0.55 : active ? 0.7 + 0.3 * pulse : 0.95;
      mk.wallMat.opacity = done ? 0.14 : active ? 0.34 + 0.2 * pulse : 0.3;
      mk.ringMat.opacity = done ? 0.5 : active ? 0.75 + 0.25 * pulse : 0.85;
      mk.discMat.opacity = done ? 0.05 : active ? 0.1 + 0.1 * pulse : 0.1;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const mk of this.markers) {
      mk.wall.geometry.dispose();
      mk.ring.geometry.dispose();
      mk.disc.geometry.dispose();
      mk.mark.geometry.dispose();
      mk.markMat.dispose();
      mk.wallMat.dispose();
      mk.ringMat.dispose();
      mk.discMat.dispose();
    }
    this.fade?.dispose();
    this.markers = [];
  }
}
