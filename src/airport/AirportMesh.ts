/**
 * Airport — plan -> geometry (typed arrays, local frame, no three.js).
 * Three layers so the renderer can give each its own material:
 *   ground : pavement + paint   (receives shadows, polygon-offset)
 *   solid  : buildings & props  (casts shadows)
 *   lights : emissive points    (unlit material, night-dimmable)
 */

import { AIRPORT_COLORS as C, AIRPORT_SPEC as S } from './AirportSpec';
import type { RGB } from './AirportSpec';
import type { AirportPlan, LightColor, PavementKind } from './AirportPlan';
import { MeshBuilder } from './MeshBuilder';
import type { MeshArrays } from './MeshBuilder';
import { Geo, type V3 } from '../airplane/Loft';
import { srgb } from './AirportSpec';

/** Extra colours for the detailed buildings (roof arch, solar panels, trees, ground vehicles). */
const D = {
  solar: srgb(0x16273d), glassLight: srgb(0x6f9ab8), mullion: srgb(0x7b8086), trunk: srgb(0x6b5a40), leaf: srgb(0x2f7d3a), leaf2: srgb(0x3f9a4a),
  yellow: srgb(0xe8c020), white: srgb(0xeeeeea), orange: srgb(0xe8772e), blue: srgb(0x1f6fa8), green: srgb(0x2fae4a), red: srgb(0xc23b2f), dark: srgb(0x25282b), tyre: srgb(0x1b1b1c),
} as const;

/** Concatenate mesh arrays into one (indices offset). */
function concat(...parts: MeshArrays[]): MeshArrays {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.positions.length; ni += p.indices.length; }
  const positions = new Float32Array(nv), normals = new Float32Array(nv), colors = new Float32Array(nv), indices = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    positions.set(p.positions, vo); normals.set(p.normals, vo); colors.set(p.colors, vo);
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + vo / 3;
    vo += p.positions.length; io += p.indices.length;
  }
  return { positions, normals, colors, indices };
}

/** A seven-segment style runway numeral. `up` = +1: reads towards +x (the pilot flies towards +x), -1: towards -x. Drawn with ground rectangles (local frame). */
const SEG: Record<string, number[]> = { '0': [1, 1, 1, 0, 1, 1, 1], '1': [0, 0, 1, 0, 0, 1, 0], '2': [1, 0, 1, 1, 1, 0, 1], '3': [1, 0, 1, 1, 0, 1, 1], '4': [0, 1, 1, 1, 0, 1, 0], '5': [1, 1, 0, 1, 0, 1, 1], '6': [1, 1, 0, 1, 1, 1, 1], '7': [1, 0, 1, 0, 0, 1, 0], '8': [1, 1, 1, 1, 1, 1, 1], '9': [1, 1, 1, 1, 0, 1, 1] };
function numeral(g: MeshBuilder, text: string, cx: number, cz: number, up: 1 | -1, y: number, col: RGB): void {
  const gw = 6.2, gh = 13, st = 1.1, gap = 3; // glyph width / height / stroke / gap between digits (m)
  const total = text.length * gw + (text.length - 1) * gap;
  text.split('').forEach((ch, i) => {
    const u0 = -total / 2 + gw / 2 + i * (gw + gap);
    const s = SEG[ch] ?? SEG['0'];
    // segments in glyph space (u right, v up): [u, v, w, h]: top, upper-left, upper-right, middle, lower-left, lower-right, bottom
    const defs: [number, number, number, number][] = [[0, gh / 2 - st / 2, gw, st], [-gw / 2 + st / 2, gh / 4, st, gh / 2], [gw / 2 - st / 2, gh / 4, st, gh / 2], [0, 0, gw, st], [-gw / 2 + st / 2, -gh / 4, st, gh / 2], [gw / 2 - st / 2, -gh / 4, st, gh / 2], [0, -gh / 2 + st / 2, gw, st]];
    defs.forEach(([du, dv, w, h], k) => { if (s[k]) g.rect(cx + up * dv, cz + up * (u0 + du), h, w, y, col); });
  });
}

/** A palm / broadleaf tree for the landscaping (trunk + two crowns). */
function tree(b: MeshBuilder, x: number, z: number, s: number, palm: boolean): void {
  b.box(x, 0, z, 0.45 * s, (palm ? 7 : 4) * s, 0.45 * s, D.trunk);
  if (palm) { b.frustum(x, 6.2 * s, z, 5.5 * s, 5.5 * s, 0.8 * s, 0.8 * s, 1.6 * s, D.leaf); b.frustum(x, 7.4 * s, z, 3.4 * s, 3.4 * s, 0.4 * s, 0.4 * s, 1.0 * s, D.leaf2); } else { b.frustum(x, 3.2 * s, z, 5.2 * s, 5.2 * s, 2.4 * s, 2.4 * s, 3.2 * s, D.leaf); b.frustum(x, 5.4 * s, z, 3.4 * s, 3.4 * s, 0.6 * s, 0.6 * s, 2.6 * s, D.leaf2); }
}

/** One ground-support equipment set (tug, baggage train, belt loader, fuel truck, GPU, catering truck, air stairs), nose towards +z. */
function gse(b: MeshBuilder, cx: number, cz: number, flip: number): void {
  const x = (dx: number): number => cx + dx * flip;
  // pushback tug
  b.box(x(0), 0.5, cz, 2.4, 1.3, 4.2, D.yellow); b.box(x(0), 1.8, cz - 0.4, 2.0, 1.0, 2.0, D.dark);
  for (const dx of [-1.2, 1.2]) for (const dz of [-1.4, 1.4]) b.box(x(dx), 0, cz + dz, 0.4, 0.7, 0.8, D.tyre);
  // baggage train: a tractor and three carts
  b.box(x(6), 0.4, cz, 1.6, 1.2, 2.6, D.white); b.box(x(6), 1.6, cz + 0.2, 1.4, 0.9, 1.3, D.dark);
  for (let i = 1; i <= 3; i++) { b.box(x(6), 0.5, cz - i * 3.3, 2.0, 0.25, 3.0, D.blue); b.box(x(6), 0.75, cz - i * 3.3, 1.7, 0.9, 2.6, i % 2 ? D.orange : D.white); }
  // belt loader
  b.box(x(-7), 0.7, cz, 2.2, 1.2, 5.5, D.white); b.box(x(-7), 1.9, cz - 3.2, 1.0, 0.35, 5.5, D.dark);
  // fuel truck: chassis + tank
  b.box(x(14), 0.5, cz, 2.6, 0.7, 9, D.red); b.frustum(x(14), 1.2, cz - 1.2, 2.5, 6.4, 2.3, 6.2, 2.3, D.white); b.box(x(14), 1.1, cz + 4.0, 2.4, 1.8, 1.6, D.red);
  // GPU + air stairs + catering truck
  b.box(x(-14), 0.3, cz, 1.4, 1.3, 2.4, D.green);
  b.box(x(-19), 0.5, cz, 1.8, 1.5, 4.4, D.white); b.box(x(-19), 2.0, cz - 1.5, 1.6, 0.4, 2.0, D.dark);
  b.box(x(21), 0.6, cz, 2.5, 3.2, 6.2, D.white); b.box(x(21), 3.8, cz - 0.6, 2.7, 0.3, 4.2, D.blue);
}


export interface AirportMeshData {
  ground: MeshArrays;
  solid: MeshArrays;
  lights: MeshArrays;
}

const PAVEMENT_COLOR: Record<PavementKind, RGB> = {
  shoulder: C.shoulder, runway: C.runway, taxiway: C.taxiway, connector: C.taxiway,
  apron: C.apron, parking: C.parking, road: C.road,
};

const LIGHT_COLOR: Record<LightColor, RGB> = {
  white: C.lightWhite, green: C.lightGreen, red: C.lightRed, blue: C.lightBlue, amber: C.lightAmber,
};

/** The curved terminal roof: a lens-shaped slab arching over the building, with a big canopy over the airside (-z) and a short one over the landside. */
function roofArch(cx: number, cz: number, w: number, d: number, h: number): MeshArrays {
  const g = new Geo();
  const zA = cz - d / 2 - 14, zB = cz + d / 2 + 4, n = 16, mid = (zA + zB) / 2, half = (zB - zA) / 2;
  const top = (z: number): number => h + 0.8 + 3.4 * (1 - Math.pow((z - mid) / half, 2));
  const prof: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const z = zA + ((zB - zA) * i) / n; prof.push([z, top(z)]); }
  for (let i = n; i >= 0; i--) { const z = zA + ((zB - zA) * i) / n; prof.push([z, top(z) - 0.9 - 0.5 * (1 - Math.pow((z - mid) / half, 2))]); }
  const ring = (x: number): V3[] => prof.map(([z, y]) => [x, y, z] as V3);
  g.loft([ring(cx - w / 2 - 3), ring(cx + w / 2 + 3)], (_r, j) => (j <= n ? srgb(0xa3abb1) : C.terminalRoof), undefined, { start: true, end: true });
  // slender columns under the airside canopy
  for (let x = -w / 2 + 6; x <= w / 2 - 6 + 1e-6; x += 28) g.cylinder('y', cx + x, h * 0.5, cz - d / 2 - 11, 0.35, h, D.mullion, 8);
  return g.build();
}

/** The control tower: a tapered round shaft, a flared glass control room (cab), a cone roof, a mast and a beacon. */
function towerLoft(cx: number, cz: number, w: number, shaftH: number, cab: number, cabH: number): MeshArrays {
  const g = new Geo();
  const ring = (y: number, r: number, n = 16): V3[] => { const out: V3[] = []; for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; out.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); } return out; };
  const r0 = w * 0.78, r1 = w * 0.52;
  g.loft([ring(0, r0 * 1.15), ring(shaftH * 0.5, r0), ring(shaftH, r1)], () => C.towerShaft, undefined, { start: true, end: false });
  for (const y of [shaftH * 0.25, shaftH * 0.55, shaftH * 0.85]) g.cylinder('y', cx, y, cz, r1 + 0.55 + (1 - y / shaftH) * 0.5, 0.35, C.towerCab, 16); // rings
  g.loft([ring(shaftH, r1), ring(shaftH + 1.2, r1 * 1.1), ring(shaftH + 4.2, cab * 0.56)], () => C.towerCab, undefined, { start: false, end: false }); // flared base of the cab
  g.loft([ring(shaftH + 4.2, cab * 0.56), ring(shaftH + 4.2 + cabH, cab * 0.5)], () => D.glassLight, undefined, { start: false, end: false }); // the glass
  g.loft([ring(shaftH + 4.2 + cabH, cab * 0.6), ring(shaftH + 5.2 + cabH, cab * 0.5), ring(shaftH + 7.4 + cabH, 0.5)], () => C.terminalRoof, undefined, { start: true, end: true }); // roof
  g.cylinder('y', cx, shaftH + 7.4 + cabH, cz, 0.15, 6, C.pole, 6);
  return g.build();
}

export function buildAirportMesh(plan: AirportPlan): AirportMeshData {
  const ground = new MeshBuilder();
  const solid = new MeshBuilder();
  const arches: MeshArrays[] = [];
  const towers: MeshArrays[] = [];
  const lights = new MeshBuilder();

  // ---------------------------------------------------------------- ground
  for (const p of plan.pavements) {
    const y = p.kind === 'runway' ? S.y.runway : S.y.pavement;
    ground.rect(p.cx, p.cz, p.w, p.d, y, PAVEMENT_COLOR[p.kind]);
  }

  // helipad disc (ring + dark centre)
  const hp = plan.helipad;
  ground.disc(hp.x, hp.z, hp.radius, S.y.marking, C.white);
  ground.disc(hp.x, hp.z, hp.radius - 1.2, S.y.marking2, C.helipadDisc);

  for (const m of plan.markings) {
    const y = m.layer === 2 ? S.y.marking3 : m.layer === 1 ? S.y.marking2 : S.y.marking;
    ground.rect(m.cx, m.cz, m.w, m.d, y, m.color === 'yellow' ? C.yellow : C.white);
  }

  // runway numerals: each threshold carries the compass heading of the direction you fly from it (09 / 27 ...)
  const rw = plan.pavements.find((p) => p.kind === 'runway');
  if (rw) {
    const h = plan.site.heading, bearing = (Math.atan2(Math.cos(h), Math.sin(h)) * 180) / Math.PI;
    const num = (b: number): string => String(Math.round((((b % 360) + 360) % 360) / 10) || 36).padStart(2, '0');
    numeral(ground, num(bearing), rw.cx - rw.w / 2 + 78, rw.cz, 1, S.y.marking3, C.white);
    numeral(ground, num(bearing + 180), rw.cx + rw.w / 2 - 78, rw.cz, -1, S.y.marking3, C.white);
  }

  // ---------------------------------------------------------------- solid
  for (const b of plan.buildings) {
    switch (b.kind) {
      case 'terminal': {
        // body + a glass curtain wall on both faces (vertical mullions + two transoms) + a curved roof with a solar strip and a big airside canopy
        solid.box(b.cx, 0, b.cz, b.w, b.h, b.d, C.terminal);
        for (const side of [-1, 1]) {
          const z = b.cz + side * (b.d / 2 + 0.1);
          solid.box(b.cx, 1.2, z, b.w - 6, b.h - 2.4, 0.22, C.glass);
          solid.box(b.cx, b.h * 0.42, z + side * 0.12, b.w - 6, 0.3, 0.3, D.mullion);
          solid.box(b.cx, b.h * 0.78, z + side * 0.12, b.w - 6, 0.3, 0.3, D.mullion);
          for (let mx = -b.w / 2 + 3; mx <= b.w / 2 - 3 + 1e-6; mx += 4) solid.box(b.cx + mx, 1.2, z + side * 0.12, 0.3, b.h - 2.4, 0.34, D.mullion);
        }
        // entrance doors on the landside
        solid.box(b.cx, 0, b.cz + b.d / 2 + 0.25, 16, 4.2, 0.2, D.glassLight);
        for (const px of [-9, 9]) solid.box(b.cx + px, 0, b.cz + b.d / 2 + 5, 0.6, 5.4, 0.6, D.mullion);
        solid.box(b.cx, 5.4, b.cz + b.d / 2 + 3, 24, 0.5, 6.4, C.terminalRoof); // entrance canopy
        arches.push(roofArch(b.cx, b.cz, b.w, b.d, b.h));
        solid.box(b.cx, b.h + 2.2, b.cz - 2, b.w - 36, 0.35, 14, D.solar); // solar panels on the crest
        break;
      }
      case 'jetbridge': {
        solid.box(b.cx, 3.2, b.cz, b.w, b.h, b.d, C.jetbridge);
        solid.box(b.cx, 2.6, b.cz - b.d / 2, 4.6, 5.6, 4.6, C.jetbridge); // docking cab
        solid.box(b.cx, 0, b.cz - b.d / 2, 0.5, 2.6, 0.5, C.pole); // support leg
        solid.box(b.cx - 0.9, 0, b.cz - b.d / 2, 0.45, 0.5, 0.9, D.tyre); solid.box(b.cx + 0.9, 0, b.cz - b.d / 2, 0.45, 0.5, 0.9, D.tyre); // wheel bogie
        solid.box(b.cx, 3.0, b.cz - b.d / 2 - 2.5, 4.8, 5.0, 0.35, D.dark); // soft canopy at the aircraft door
        solid.frustum(b.cx, 0, b.cz + b.d / 2, 5.2, 5.2, 4.6, 4.6, 5.2, C.jetbridge); // rotunda at the terminal
        break;
      }
      case 'tower': {
        towers.push(towerLoft(b.cx, b.cz, b.w, b.h, S.tower.cab, S.tower.cabH));
        break;
      }
      case 'hangar': {
        const roof = C.hangarRoofs[b.tint % C.hangarRoofs.length] ?? C.terminalRoof;
        solid.gable(b.cx, 0, b.cz, b.w, b.d, b.h, S.hangar.roofH, C.hangarWall, roof);
        solid.box(b.cx, 0, b.cz - b.d / 2 - 0.1, b.w * 0.75, b.h * 0.8, 0.3, C.hangarDoor); // door (taxiway side)
        break;
      }
    }
  }

  // floodlight poles
  for (const p of plan.poles) {
    solid.box(p.x, 0, p.z, 0.5, p.h, 0.5, C.pole);
    solid.box(p.x, p.h, p.z, 3, 0.6, 1.6, C.pole);
  }

  // windsock
  const ws = plan.windsock;
  solid.box(ws.x, 0, ws.z, 0.3, 7, 0.3, C.pole);
  solid.box(ws.x + 0.9, 6.2, ws.z, 1.5, 0.6, 0.6, C.sockOrange);
  solid.box(ws.x + 2.4, 6.2, ws.z, 1.5, 0.6, 0.6, C.sockWhite);
  solid.box(ws.x + 3.9, 6.2, ws.z, 1.5, 0.6, 0.6, C.sockOrange);

  // perimeter fence (axis-aligned segments)
  for (const f of plan.fence) {
    const t = S.fence.thickness;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const w = Math.abs(f.x1 - f.x0) || t;
    const d = Math.abs(f.z1 - f.z0) || t;
    solid.box(cx, 0, cz, w, S.fence.height, d, C.fence);
  }

  // landscaping: palms along the entrance road and round the car park, trees beside the hangars
  const road = plan.pavements.filter((p) => p.kind === 'road');
  for (const r of road) for (let k = 0; k * 16 < Math.min(r.d, 240); k++) for (const sx of [-1, 1]) tree(solid, r.cx + sx * (r.w / 2 + 6), r.cz - r.d / 2 + 8 + k * 16, 1, true);
  const park = plan.pavements.find((p) => p.kind === 'parking');
  if (park) for (let k = 0; k <= 8; k++) { tree(solid, park.cx - park.w / 2 + (k * park.w) / 8, park.cz + park.d / 2 + 5, 0.9, k % 2 === 0); }
  for (const b of plan.buildings) if (b.kind === 'hangar') tree(solid, b.cx, b.cz + b.d / 2 + 7, 0.9, false);
  // ground-support equipment near both ends of the terminal front
  const term = plan.buildings.find((b) => b.kind === 'terminal');
  if (term) { gse(solid, term.cx - 138, term.cz - term.d / 2 - 36, 1); gse(solid, term.cx + 138, term.cz - term.d / 2 - 36, -1); }

  // ---------------------------------------------------------------- lights
  for (const l of plan.lights) {
    lights.box(l.x, l.y - 0.2, l.z, 0.45, 0.4, 0.45, LIGHT_COLOR[l.color]);
  }

  return { ground: ground.build(), solid: concat(solid.build(), ...arches, ...towers), lights: lights.build() };
}
