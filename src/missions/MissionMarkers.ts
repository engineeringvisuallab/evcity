import * as THREE from 'three';
import { MISSIONS } from './MissionData';
import type { MissionPin } from './MissionTypes';

/**
 * MISSION PLACE MARKERS: every mission place is drawn in the world as ONE small green cylinder (1 m wide, 1.5 m high) at the centre of the place.
 * The big ground ring, the faint disc and the tall light pillar are gone: the circle of the mission place is no longer drawn.
 *
 * - Drawing only: the arrival radius (`place.radius`) and the mission logic are untouched, so the player still does the mission as soon as he is
 *   inside the (invisible) circle. No collider, the player walks straight through the marker.
 * - Positions are ABSOLUTE world coordinates; the group is added to `world.root`, which the floating origin moves (like StationSignLayer).
 * - The tracked (active) mission pulses; a finished mission turns dim; the others are plain green.
 */

const MARK_DIAMETER = 1; // m
const MARK_HEIGHT = 1.5; // m
const GREEN = 0x22e06a;
const GREEN_DONE = 0x6fae86;

interface Marker {
  id: string;
  group: THREE.Group;
  mark: THREE.Mesh;
  markMat: THREE.MeshBasicMaterial;
}

export class MissionMarkers {
  private group = new THREE.Group();
  private markers: Marker[] = [];
  private t = 0;

  constructor(root: THREE.Object3D, groundAt: (x: number, z: number) => number) {
    this.group.name = 'mission-markers';
    // one geometry for every marker
    const geo = new THREE.CylinderGeometry(MARK_DIAMETER / 2, MARK_DIAMETER / 2, MARK_HEIGHT, 32);
    this.geo = geo;
    for (const m of MISSIONS) {
      const { x, z } = m.place;
      const g = new THREE.Group();
      g.position.set(x, groundAt(x, z), z);

      // the small marker: 1 m wide, 1.5 m high, standing on the ground at the centre
      const markMat = new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.9 });
      const mark = new THREE.Mesh(geo, markMat);
      mark.position.y = MARK_HEIGHT / 2;
      mark.renderOrder = 7;
      mark.frustumCulled = false;
      g.add(mark);

      this.group.add(g);
      this.markers.push({ id: m.id, group: g, mark, markMat });
    }
    root.add(this.group);
  }

  private geo: THREE.CylinderGeometry;

  /** Call every frame with the pins of the MissionManager (active / done). */
  update(dt: number, pins: readonly MissionPin[]): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    for (const mk of this.markers) {
      const pin = pins.find((p) => p.id === mk.id);
      const done = !!pin?.done;
      const active = !!pin?.active;
      mk.markMat.color.setHex(done ? GREEN_DONE : GREEN);
      mk.markMat.opacity = done ? 0.55 : active ? 0.7 + 0.3 * pulse : 0.95;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geo.dispose();
    for (const mk of this.markers) mk.markMat.dispose();
    this.markers = [];
  }
}
