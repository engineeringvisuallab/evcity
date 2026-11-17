import * as THREE from 'three';
import type { InfraPart } from '../../../core/types';
import { every } from '../../../core/anim';
import type { Ctx } from './ctx';
import { buildAirliner } from './airframe';
import { L } from '../layout';
import { SLOTS, planePose } from '../schedule';

/** Floor top of the hall (the wheels stand on it). */
const FLOOR_Y = 0.2;

/** The five aeroplane bodies of the line: the moving part of the factory. Each one is at its own stage (see schedule.ts); all follow ONE clock (the airplane manager's). */
export function buildLine({ a, anim, planes, kit, clock }: Ctx): InfraPart {
  const g = new THREE.Group();
  g.name = 'line';
  // moving things are not obstacles: the collider collector skips groups named 'environment'
  const env = new THREE.Group();
  env.name = 'environment';
  g.add(env);
  for (let p = 0; p < SLOTS; p++) {
    const plane = buildAirliner(kit, a);
    env.add(plane.group);
    planes.push(plane);
  }
  const tick = (): void => {
    const tm = clock();
    planes.forEach((plane, p) => {
      const pose = planePose(p, tm);
      plane.group.visible = pose.visible;
      if (!pose.visible) return;
      plane.apply(pose.slot, pose.dwell, tm);
      plane.group.position.set(pose.x, FLOOR_Y + plane.lift, L.lineZ);
    });
  };
  tick(); // the very first picture is already the right one
  every(anim, tick);
  return { id: 'line', nameBn: 'Aeroplanes on the line', group: g };
}
