import * as THREE from 'three';
import type { Infrastructure, InfrastructureDef, InfraBuildOptions, InfraPart, TourStop } from '../../core/types';
import { resolveOptions } from '../../core/options';
import { collectSolids, type SolidShape } from '../../core/solids';
import { createMaterials } from '../../core/materials';
import { Site } from '../../core/Site';
import { makeLabel } from '../../core/Labels';
import { AnimSet, flow, spin } from '../../core/anim';
import { box, cyl, cylH, building, pipe, valve, pump, tank, railRect, buriedLine, lightPole, V } from '../../core/prims';

/**
 * MAIN STATION PUMP STATION (EVCity Step 2). Stands on the MAIN_STATION_LOT of the vehicle area (see parking/ParkingSite.ts) and is also the
 * place where fuel is loaded / unloaded, so the south half (the apron) is left free for vehicles.
 *
 * Local frame: x = along the road (east of the lot), z = + towards the road (south side = entrance). Pad 50 m x 36 m.
 *   CWR: 2 cells x 500 m3 (inner 9.4 x 10 m, water 5.3 m deep) | pump house: 2 duty + 1 standby, 100 m3/h each, TDH 40 m, 22 kW
 *   suction DN250 (flooded, one gate valve per CWR cell + common header) | discharge DN200 per pump (NRV + gate valve) | discharge header DN250 + flowmeter.
 */
const NAME = 'Main Station Pump Station (3 x 100 m3/h)';
export const PUMP_PAD = { minX: -25, maxX: 25, minZ: -18, maxZ: 18 };
const SITE = { minX: -26, maxX: 26, minZ: -19, maxZ: 19 };

// pipe radii drawn a little bigger than real so they read from far away (labels give the real nominal sizes)
const R_DN250 = 0.2;
const R_DN200 = 0.16;
const Y_AXIS = 0.85; // pump shaft height = suction pipe height
const PUMPS_X = [-4.6, 0, 4.6];
const PUMP_Z = 0.1;
const HEADER_Z = 4.6;
const HEADER_Y = 1.2;

const LABELS: [string, number, number, number, number?][] = [
  ['Main Station pump station', 0, 11, -1, 1.2],
  ['CWR cell 1 - 500 m3', -5.2, 4.2, -12, 0.9],
  ['CWR cell 2 - 500 m3', 5.2, 4.2, -12, 0.9],
  ['Gate valve (cell isolation)', -5.2, 3.4, -5.8, 0.7],
  ['Gate valve (cell isolation)', 5.2, 3.4, -5.8, 0.7],
  ['Suction header DN250', 0, 2.6, -3.8, 0.8],
  ['Pump 1 - duty - 100 m3/h, 40 m, 22 kW', -4.6, 4.2, 0.1, 0.75],
  ['Pump 2 - duty - 100 m3/h, 40 m, 22 kW', 0, 5.2, 0.1, 0.75],
  ['Pump 3 - STANDBY', 4.6, 4.2, 0.1, 0.75],
  ['NRV DN200', -4.6, 3.6, 2.0, 0.65],
  ['NRV DN200', 0, 3.6, 2.0, 0.65],
  ['NRV DN200', 4.6, 3.6, 2.0, 0.65],
  ['Gate valve DN200', -4.6, 3.6, 3.7, 0.6],
  ['Gate valve DN200', 0, 3.6, 3.7, 0.6],
  ['Gate valve DN200', 4.6, 3.6, 3.7, 0.6],
  ['Discharge header DN250', -9, 2.8, HEADER_Z, 0.8],
  ['Flowmeter (electromagnetic)', 13, 3.2, HEADER_Z, 0.8],
  ['To city supply (buried DN250)', 21, 2.6, HEADER_Z, 0.8],
  ['MCC & control room', 18, 6.5, -9.5, 0.9],
  ['Fuel receiving tank (unload here)', -19, 5.4, 11.5, 0.9],
  ['Drive in and stop: fuel unload / tanker load', 6, 3.2, 13, 0.9],
];

function shot(id: string, partId: string | undefined, title: string, text: string, az: number, el: number, dist: number, target: [number, number, number], focus?: TourStop['focus']): TourStop {
  return { id, partId, titleBn: title, voiceId: id, text, shot: { azimuthDeg: az, elevationDeg: el, distance: dist, target }, focus };
}
const TOUR: TourStop[] = [
  shot('intro', undefined, 'The pump station at a glance', 'This is the Main Station pump station. Clean water is stored in two reservoirs, pumped by three pumps, and sent to the city. The pipe colours tell you what flows inside. Walk around and read the labels.', 25, 30, 78, [0, 2, -2]),
  shot('cwr', 'cwr', '1. Clear water reservoir (CWR)', 'The clear water reservoir has two cells of 500 cubic metres each. Two cells let operators clean or repair one cell while the other keeps supplying water. The water is about five metres deep.', 15, 32, 40, [0, 0, -12], [-10.4, -4, -17.5, 10.4, 1.4, -6.5]),
  shot('suction', 'pumphouse', '2. Suction pipes DN250', 'Each cell has a gate valve and a DN250 suction pipe. The pipes sit below the water level, so the pumps are always flooded and never run dry. The two pipes meet in a common suction header.', 20, 22, 26, [0, 1, -4.5], [-7, 0, -7, 7, 2.5, -3]),
  shot('pumps', 'pumphouse', '3. Pump house: 2 duty + 1 standby', 'Three centrifugal pumps, each 100 cubic metres per hour at 40 metres head, driven by a 22 kilowatt motor. Two pumps run, one stands by. If a pump trips or is serviced, the standby starts.', 10, 18, 24, [0, 1.5, 0.5], [-8, 0, -4, 8, 3, 3.5]),
  shot('discharge', 'pumphouse', '4. Discharge: NRV and gate valve', 'Every pump discharges through a DN200 pipe with a non-return valve, NRV, and a gate valve. The NRV stops water flowing back and protects the pump when it stops. The gate valve isolates the pump for maintenance.', 12, 20, 22, [0, 2, 3], [-7, 0.5, 1, 7, 3, 5.5]),
  shot('header', 'pumphouse', '5. Discharge header and flowmeter', 'The three branches join the DN250 discharge header. An electromagnetic flowmeter measures how much water leaves the station. From here a buried pipe carries the water to the city.', 5, 20, 34, [8, 1.5, HEADER_Z], [-6, 0, 3.5, 22, 3, 6]),
  shot('mcc', 'electrical', '6. MCC and control room', 'The motor control centre holds the starters for the three 22 kilowatt motors. The control room shows tank levels, pump status and flow.', 340, 22, 30, [18, 3, -9.5], [14, 0, -13, 22, 6, -6]),
  shot('fuel', 'fuel', '7. Fuel unloading bay', 'The south half of the pad is the fuel bay. Drive a fuel vehicle in and stop to unload into the receiving tank for a bonus. A fuel tanker stops here to load fuel for the small stations.', 160, 24, 36, [-8, 1, 12], [-24, 0, 6, 8, 5, 18]),
];

export function createPumpStation(options?: InfraBuildOptions): Infrastructure {
  const opts = resolveOptions(options, 'E', PUMP_PAD.maxX);
  const mats = createMaterials();
  const site = new Site(SITE, PUMP_PAD);
  const anim = new AnimSet();
  const solids: SolidShape[] = [];
  const root = new THREE.Group();
  root.name = 'pump';
  const part = (id: string, nameBn: string): InfraPart => {
    const group = new THREE.Group();
    group.name = id;
    root.add(group);
    return { id, nameBn, group };
  };
  const cwr = part('cwr', 'Clear water reservoir');
  const ph = part('pumphouse', 'Pump house');
  const el = part('electrical', 'MCC & control room');
  const fuel = part('fuel', 'Fuel bay');
  const parts = [cwr, ph, el, fuel];
  const sol = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void => {
    solids.push({ kind: 'box', c: [cx, cy, cz], q: [0, 0, 0, 1], h: [hx, hy, hz] });
  };

  // ---------------- ground: concrete everywhere, asphalt apron on the road side (vehicles drive here), kerb stones
  root.add(site.buildGround(mats.concrete, opts.skirtDepth, mats.concreteDark));
  box(fuel.group, 49.4, 0.04, 12.4, mats.asphalt, 0, 0.3, 11.8);
  for (const x of [-18, -6, 6, 18]) box(fuel.group, 0.25, 0.02, 9, mats.white, x, 0.33, 11.8); // bay lines

  // ---------------- CWR: 2 cells, inner 9.4 x 10 m, water surface 1.3 m above the floor level (depth 4 m below ground) = 5.3 m deep = ~500 m3 per cell
  for (const [i, x] of [-5.2, 5.2].entries()) {
    tank(cwr.group, site, mats, { x, z: -12, w: 10.4, d: 11, depth: 4, top: 1.4, level: 1.3, water: mats.waterClear, rail: true });
    sol(x, 0.7, -12 - 5.25, 5.2, 1.4, 0.25); sol(x, 0.7, -12 + 5.25, 5.2, 1.4, 0.25); // tank walls (north / south) as solids
    sol(x - 4.95, 0.7, -12, 0.25, 1.4, 5); sol(x + 4.95, 0.7, -12, 0.25, 1.4, 5);
    box(cwr.group, 1.2, 0.4, 1.2, mats.steel, x, 1.4, -15.5 + i * 0.01); // access hatch
  }
  // vent pipes + level transmitter posts
  for (const x of [-5.2, 5.2]) { cyl(cwr.group, 0.12, 2.2, mats.steel, x + 3, 1.4, -17, 8); cyl(cwr.group, 0.08, 1.6, mats.yellow, x - 3, 1.4, -17, 8); }

  // ---------------- pump house (open to the south so the pumps can be seen)
  building(ph.group, mats, { x: 0, z: -0.5, w: 17, d: 8, h: 5, open: 'S', door: 'E' });
  sol(0, 2.5, -4.325, 8.5, 2.5, 0.2); sol(-8.325, 2.5, -0.5, 0.2, 2.5, 3.8); sol(8.325, 2.5, -0.5, 0.2, 2.5, 3.8);
  const suctionMat = mats.pipe.raw;
  const dischMat = mats.pipe.delivery;
  // suction: CWR south wall (z -6.5) -> gate valve -> common header at z -3.8 (all at pump shaft height)
  for (const x of [-5.2, 5.2]) {
    pipe(ph.group, [V(x, Y_AXIS, -12 + 5.5), V(x, Y_AXIS, -3.8)], R_DN250, mats.pipe.filtered);
    valve(ph.group, mats, x, Y_AXIS + 0.3, -5.7, R_DN250 * 1.4, 'z');
  }
  void suctionMat;
  pipe(ph.group, [V(-5.2, Y_AXIS, -3.8), V(5.2, Y_AXIS, -3.8)], R_DN250, mats.pipe.filtered);
  for (const px of PUMPS_X) {
    // pumps point their suction side (+x) to -z (towards the CWR)
    pump(ph.group, mats, px, PUMP_Z, Math.PI / 2, 0, 1);
    // suction branch: header -> pump inlet (pump inlet face is 1.75 m from the pump centre)
    pipe(ph.group, [V(px, Y_AXIS, -3.8), V(px, Y_AXIS, PUMP_Z - 1.7)], R_DN250, mats.pipe.filtered);
    // discharge: vertical riser at (px, PUMP_Z - 0.55), over to z = 2.0 (NRV), 3.7 (gate valve), down to the header
    const rx = px, rz = PUMP_Z - 0.55;
    pipe(ph.group, [V(rx, 1.9, rz), V(rx, 2.8, rz), V(rx, 2.8, 5.2), V(rx, HEADER_Y, 5.2), V(rx, HEADER_Y, HEADER_Z)], R_DN200, dischMat);
    // NRV: a fatter body with a flap-stub on top, in the horizontal run; gate valve downstream
    cylH(ph.group, R_DN200 * 1.9, 0.9, mats.yellow, rx, 2.8, 2.0, 'z', 14);
    box(ph.group, 0.12, 0.35, 0.12, mats.steel, rx, 3.0, 2.0);
    valve(ph.group, mats, rx, 2.8, 3.7, R_DN200 * 1.5, 'z');
    // pressure gauge on the riser
    cyl(ph.group, 0.04, 0.35, mats.steel, rx + 0.3, 1.9, rz, 6);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 14), mats.white);
    gauge.rotation.x = Math.PI / 2; gauge.position.set(rx + 0.3, 2.3, rz); ph.group.add(gauge);
  }
  // discharge header DN250 along x -> flowmeter -> buried line to the city
  pipe(ph.group, [V(PUMPS_X[0], HEADER_Y, HEADER_Z), V(20, HEADER_Y, HEADER_Z), V(20, -0.6, HEADER_Z)], R_DN250, dischMat);
  cylH(ph.group, 0.55, 1.4, mats.motor, 13, HEADER_Y, HEADER_Z, 'x', 16); // flowmeter body
  box(ph.group, 0.6, 0.5, 0.5, mats.white, 13, HEADER_Y + 0.85, HEADER_Z); // transmitter head
  buriedLine(ph.group, mats.pipe.delivery, [V(20, 0, HEADER_Z), V(24, 0, HEADER_Z)], 4);
  // motor fans spin (the 2 duty pumps run, the standby is still)
  for (const px of [PUMPS_X[0], PUMPS_X[1]]) {
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 8), mats.steel);
    fan.rotation.z = Math.PI / 2; fan.position.set(px, 0.85 + 0.0, PUMP_Z + 0.95); ph.group.add(fan);
    spin(anim, fan, 'x', 18);
  }
  // water flow dots: CWR -> suction -> pump -> header -> city (the standby pump has none)
  const dots = { color: 0x9fd8ff, speed: 3, spacing: 1.4, size: 0.1 };
  flow(anim, ph.group, [V(-5.2, Y_AXIS, -9), V(-5.2, Y_AXIS, -3.8), V(PUMPS_X[0], Y_AXIS, -3.8), V(PUMPS_X[0], Y_AXIS, PUMP_Z - 1.7)], dots);
  flow(anim, ph.group, [V(5.2, Y_AXIS, -9), V(5.2, Y_AXIS, -3.8), V(PUMPS_X[1], Y_AXIS, -3.8), V(PUMPS_X[1], Y_AXIS, PUMP_Z - 1.7)], dots);
  for (const px of [PUMPS_X[0], PUMPS_X[1]]) flow(anim, ph.group, [V(px, 2.8, PUMP_Z - 0.55), V(px, 2.8, 5.2), V(px, HEADER_Y, 5.2), V(px, HEADER_Y, HEADER_Z), V(20, HEADER_Y, HEADER_Z)], { ...dots, color: 0x2a7fc4 });

  // ---------------- MCC & control room (north-east corner)
  building(el.group, mats, { x: 18, z: -9.5, w: 8, d: 6, h: 3.6, door: 'S' });
  sol(18, 1.8, -9.5, 4, 1.8, 3);
  box(el.group, 1.2, 0.8, 0.4, mats.steel, 14.5, 0, -6.2); // transformer-side cubicle (outside)
  lightPole(el.group, mats, -22, 16, 1);
  lightPole(el.group, mats, 22, 16, -1);

  // ---------------- fuel bay: receiving tank (horizontal drum on saddles), hose + hand-hold, canopy-free so vehicles can drive in
  cylH(fuel.group, 1.25, 6, mats.red, -19, 1.65, 10.5, 'x', 22);
  for (const sx of [-21, -17]) box(fuel.group, 0.5, 0.9, 2.4, mats.concreteDark, sx, 0, 10.5);
  box(fuel.group, 0.6, 0.2, 0.6, mats.steel, -19, 2.9, 10.5); // filler hatch
  pipe(fuel.group, [V(-15.8, 1.2, 10.5), V(-14.5, 1.2, 10.5), V(-14.5, 0.5, 12.5)], 0.12, mats.pipe.gas);
  box(fuel.group, 0.4, 0.5, 0.4, mats.yellow, -14.5, 0, 12.5); // unloading coupling post
  sol(-19, 1.6, 10.5, 3, 1.6, 1.3);
  railRect(fuel.group, mats.steel, -19, 10.5, 8.5, 5, 0.3);

  // ---------------- labels
  const labels = new THREE.Group();
  labels.name = 'labels';
  for (const [text, x, y, z, sc] of LABELS) {
    const tag = makeLabel(text, sc ?? 1);
    tag.position.set(x, y, z);
    labels.add(tag);
  }
  root.add(labels);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mat = o.material as THREE.Material;
      const fx = o.name === 'fx';
      o.castShadow = !mat.transparent && !fx;
      o.receiveShadow = !fx;
    }
  });
  root.updateWorldMatrix(true, true);

  return {
    id: 'pump',
    nameBn: NAME,
    category: 'civil',
    narrationLang: 'en',
    root,
    parts,
    tour: TOUR,
    legend: ['filtered', 'delivery', 'gas'],
    footprint: { width: SITE.maxX - SITE.minX, depth: SITE.maxZ - SITE.minZ },
    // the apron (z > 6) stays free for vehicles: only the real structures are solid (collectSolids would also add the tank-wall boxes -> keep them, plus ours)
    solids: () => [...collectSolids(root), ...solids],
    setLabelsVisible: (v) => { labels.visible = v; },
    update: (dt) => anim.update(dt),
    dispose: () => {
      root.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose(); });
      Object.values(mats.pipe).forEach((m) => m.dispose());
      Object.entries(mats).forEach(([k, m]) => { if (k !== 'pipe') (m as THREE.Material).dispose(); });
      anim.dispose();
    },
  };
}

export const pumpStationDef: InfrastructureDef = {
  id: 'pump',
  nameBn: NAME,
  category: 'civil',
  create: (o) => createPumpStation(o),
};
