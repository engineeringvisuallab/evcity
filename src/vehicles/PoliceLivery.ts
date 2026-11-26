// Look of a PARKED police car (src/buildings/EmergencyParking.ts): roof light bar (red + blue, steady) and the two navy side stripes.
// The pursuit cars of PolicePursuitManager build their own flashing lights; this is the static copy and it shares ONE set of geometries / materials
// between all parked police cars (performance rules: no new material per object).
import * as THREE from 'three';
import type { Vehicle } from './Vehicle';

const FRAME = new THREE.MeshLambertMaterial({ color: 0x20272c });
const RED = new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0x600000, emissiveIntensity: 0.8 });
const BLUE = new THREE.MeshLambertMaterial({ color: 0x177dff, emissive: 0x002a7a, emissiveIntensity: 0.8 });
const NAVY = new THREE.MeshLambertMaterial({ color: 0x172c50 });
const G_BAR = new THREE.BoxGeometry(0.62, 0.08, 0.24);
const G_LAMP = new THREE.BoxGeometry(0.25, 0.13, 0.22);
const G_STRIPE = new THREE.BoxGeometry(0.055, 0.18, 1.9);

export function addPoliceLivery(vehicle: Vehicle): void {
  const g = new THREE.Group();
  g.name = 'police-livery';
  const roofY = vehicle.spec.id === 'jeep' ? 1.10 : 0.84;
  const bar = new THREE.Mesh(G_BAR, FRAME);
  bar.position.set(0, roofY, -0.24);
  const red = new THREE.Mesh(G_LAMP, RED);
  red.position.set(0.17, roofY + 0.07, -0.24);
  const blue = new THREE.Mesh(G_LAMP, BLUE);
  blue.position.set(-0.17, roofY + 0.07, -0.24);
  const stripeL = new THREE.Mesh(G_STRIPE, NAVY);
  stripeL.position.set(0.91, 0.08, 0);
  const stripeR = new THREE.Mesh(G_STRIPE, NAVY);
  stripeR.position.set(-0.91, 0.08, 0);
  g.add(bar, red, blue, stripeL, stripeR);
  for (const m of [bar, red, blue]) m.castShadow = true;
  vehicle.model.root.add(g);
}
