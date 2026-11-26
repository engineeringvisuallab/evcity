// REAL emergency vehicles in front of the original buildings (they replace the box cars that used to be drawn inside the building models):
//   hospital  : 2 ambulances in the emergency bay      clinic         : 1 ambulance
//   thana     : 3 police cars (2 sedans + 1 jeep)      (every placed copy of these models, the city fill and the thana prototype included)
// The spots are model-local (front = +z, same frame as the model code) and are turned into world positions the same way PlacedBuildings does.
// VehicleManager.addParkedNear() keeps them: a copy is only built while the player is near, and it is removed again when he is far away.
import { AMBULANCE, JEEP, SEDAN, type VehicleSpec } from '../vehicles/VehicleSpec';
import { BUILDING_PLACEMENTS, type BuildingPlacement } from './Placements';
import { DRAWN_FILL_PLACEMENTS } from './PlacementsResidential';
import { PROTO_MODEL_ID, PROTO_POS } from './ProtoSite';

export interface EmergencySpot {
  spec: VehicleSpec;
  x: number;
  z: number;
  yaw: number;
  body?: number;
  /** Add the police look (roof light bar + side stripes) after the vehicle is built. */
  police?: boolean;
}

interface Bay { spec: VehicleSpec; lx: number; lz: number; ry: number; body?: number; police?: boolean }

const POLICE_WHITE = 0xf2f1e8;
const BAYS: Record<string, readonly Bay[]> = {
  hospital: [
    { spec: AMBULANCE, lx: 21, lz: 15, ry: 0 },
    { spec: AMBULANCE, lx: 29, lz: 14, ry: 0 },
  ],
  clinic: [{ spec: AMBULANCE, lx: 9.5, lz: 9.5, ry: 0 }],
  police_station: [
    { spec: SEDAN, lx: -14, lz: 10, ry: 0, body: POLICE_WHITE, police: true },
    { spec: SEDAN, lx: -4, lz: 10, ry: 0, body: POLICE_WHITE, police: true },
    { spec: JEEP, lx: 18, lz: 10, ry: 0, body: POLICE_WHITE, police: true },
  ],
};

function spotsOf(p: { id: string; x: number; z: number; yaw: number }, out: EmergencySpot[]): void {
  const bays = BAYS[p.id];
  if (!bays) return;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  for (const b of bays) {
    // model frame -> world (the same rotation PlacedBuildings / FillBuildings use)
    out.push({ spec: b.spec, x: p.x + b.lx * c + b.lz * s, z: p.z - b.lx * s + b.lz * c, yaw: p.yaw + b.ry, body: b.body, police: b.police });
  }
}

/** Every parked emergency vehicle of the world (call once). */
export function emergencySpots(): EmergencySpot[] {
  const out: EmergencySpot[] = [];
  const lists: readonly (readonly BuildingPlacement[])[] = [BUILDING_PLACEMENTS, DRAWN_FILL_PLACEMENTS];
  for (const l of lists) for (const p of l) spotsOf(p, out);
  spotsOf({ id: PROTO_MODEL_ID, x: PROTO_POS.x, z: PROTO_POS.z, yaw: PROTO_POS.yaw }, out); // the thana prototype site
  return out;
}
