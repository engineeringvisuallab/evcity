// EVLab Tower: the Presentation Hall (ground floor, north part): raked floor, stage, LED screen, seats, audience, and the wall to the lobby with its three openings.
// Building-local coordinates (see EVLabLayout).
import * as THREE from 'three';
import { BLD, DIVIDER, HALL, LECTERN, REAR_Y, SCREEN, SEAT_BLOCKS, SEAT_W, hallFloorY, type Ramp, type Solid } from './EVLabLayout';
import { buildAudience, type AudienceBuild, type Seat } from './EVLabAudience';
import type { Parts } from './EVLabParts';
import { HALL_TRUSS } from './EVLabStructure';
import { Q } from '../core/Quality';

export type { Mood } from './EVLabAudience';

/** What the screen shows: the same fields as a mission HallSlide. */
export interface ScreenSlide { title: string; icon: string; bullets: string[] }

export interface HallBuild {
  group: THREE.Group;
  solids: Solid[];
  ramps: Ramp[];
  audience: AudienceBuild;
  showSlide(slide: ScreenSlide | null, topic: string): void;
  update(dt: number, t: number): void;
}

/** Crystal-and-gold chandeliers: a gold ring, a chain and 10 glowing bulbs each. Used by the lobby too. */
export function addChandeliers(P: Parts, g: THREE.Object3D, at: ReadonlyArray<readonly [number, number]>, y: number, scale = 1): void {
  const gold = P.gold(), bulb = P.glow(0xffe6b0, 1.5, 0xffd27a);
  for (const [x, z] of at) {
    const c = P.k.node(g, x, y, z);
    P.k.cyl(c, 0.04 * scale, 0.04 * scale, 3.4 * scale, 0, 1.7 * scale, 0, gold, 6);
    P.k.cyl(c, 1.3 * scale, 1.3 * scale, 0.12 * scale, 0, 0, 0, gold, 24);
    P.k.cyl(c, 0.7 * scale, 0.7 * scale, 0.1 * scale, 0, -0.5 * scale, 0, gold, 20);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; P.k.sphere(c, 0.16 * scale, Math.cos(a) * 1.3 * scale, 0.16 * scale, Math.sin(a) * 1.3 * scale, bulb); }
    P.k.sphere(c, 0.3 * scale, 0, -0.7 * scale, 0, bulb);
  }
}

export function buildHall(P: Parts): HallBuild {
  const { k, t } = P;
  const g = new THREE.Group();
  g.name = 'EVLabHall';
  const solids: Solid[] = [];
  const ramps: Ramp[] = [];
  const H = BLD.H;
  const x0 = HALL.x0, x1 = HALL.x1, z0 = HALL.z0;
  const zd0 = DIVIDER.z - 0.5, zd1 = DIVIDER.z + 0.5;
  const wood = P.lit(t.wood, 0xffffff, 0.3), woodDark = P.lit(t.wood, 0x8a6a50, 0.3), carpet = P.lit(t.carpet, 0xffffff, 0.12);
  const stone = P.lit(t.stone, 0xffffff, 0.12), gold = P.gold(), cove = P.glow(0xffe2a8, 1.1);

  // ---- floor: flat in front of the first row, raked in the seating area, flat rear aisle (REAR_Y)
  P.hplane(g, x0, x1, z0, HALL.slopeZ0, 0.004, carpet, 4, 4);
  P.slope(g, x0, x1, HALL.slopeZ0, 0, HALL.slopeZ1, REAR_Y, carpet, 4, 4);
  ramps.push({ x0, x1, zA: HALL.slopeZ0, yA: 0, zB: HALL.slopeZ1, yB: REAR_Y });
  P.hplane(g, x0, x1, HALL.slopeZ1, zd1, REAR_Y + 0.004, carpet, 4, 4);
  solids.push([x0, x1, HALL.slopeZ1, zd1, -1, REAR_Y]);

  // ---- side walls (lining on the inside) and the ceiling
  for (const s of [-1, 1] as const) {
    const a = s < 0 ? x0 - 1 : x1, b = s < 0 ? x0 : x1 + 1;
    P.tbox(g, a, b, z0, zd1, 0, H, stone, 8, 8);
    solids.push([a, b, z0, zd1, 0, H]);
    P.vplane(g, 'x', s < 0 ? x0 + 0.03 : x1 - 0.03, z0, zd0, 0, H, s < 0 ? 1 : -1, woodDark, 4, 4);
    for (let z = z0 + 8; z < zd0; z += 8) P.tbox(g, s < 0 ? x0 : x1 - 0.12, s < 0 ? x0 + 0.12 : x1, z - 0.08, z + 0.08, 0, H, gold);
  }
  P.hplane(g, x0, x1, z0, zd1, H, P.lit(t.ceiling, 0xffffff, 0.2), 6, 6, false);
  for (let z = z0 + 6; z < zd0; z += 9) P.tbox(g, x0 + 2, x1 - 2, z, z + 0.5, H - 0.2, H - 0.1, cove);
  addChandeliers(P, g, [[-36, -5], [36, -5], [-36, 8], [36, 8]], 14.2, 1.0);
  // ---- step 1.1b: the column-free roof (70.5 m span) is carried by steel Warren trusses every 9 m; the bottom chord hangs just below the ceiling,
  // the rest of each truss lies in the 2 m roof zone above it (hidden by the ceiling). One instanced mesh for all members.
  {
    const tr = HALL_TRUSS, steel = P.lit(null, 0x3a4048, 0.3), bg = k.own(new THREE.BoxGeometry(1, 1, 1));
    const ms: THREE.Matrix4[] = [], ex = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3(), mid = new THREE.Vector3(), one = new THREE.Vector3();
    const bar = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number): void => {
      dir.set(bx - ax, by - ay, bz - az);
      const len = dir.length();
      dir.normalize();
      mid.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      ms.push(new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(ex, dir), one.set(len, w, w)));
    };
    const pl = tr.span / tr.panels;
    for (const x of tr.xs) {
      bar(x, tr.yBot, tr.zA, x, tr.yBot, tr.zB, tr.chord);
      bar(x, tr.yTop, tr.zA, x, tr.yTop, tr.zB, tr.chord);
      for (let i = 0; i <= tr.panels; i++) { const z = tr.zA + i * pl; bar(x, tr.yBot, z, x, tr.yTop, z, tr.diag * 0.8); }
      for (let i = 0; i < tr.panels; i++) {
        const za = tr.zA + i * pl, zb = za + pl;
        if (i % 2) bar(x, tr.yBot, za, x, tr.yTop, zb, tr.diag); else bar(x, tr.yTop, za, x, tr.yBot, zb, tr.diag);
      }
    }
    const im = new THREE.InstancedMesh(bg, steel, ms.length);
    ms.forEach((m, i) => im.setMatrixAt(i, m));
    im.frustumCulled = false;
    g.add(im);
  }


  // ---- the wall to the lobby: stone, three openings (6.5 m high above the ramp tops), a gold lintel, wood lining on the hall side
  const cuts = DIVIDER.openings.slice().sort((p, q) => p[0] - q[0]);
  let cx: number = x0;
  const seg = (a: number, b: number): void => {
    if (b - a < 0.05) return;
    P.tbox(g, a, b, zd0, zd1, 0, H, stone, 8, 8);
    solids.push([a, b, zd0, zd1, 0, H]);
    P.vplane(g, 'z', zd0 - 0.03, a, b, 0, H, -1, woodDark, 4, 4);
  };
  for (const [a, b] of cuts) {
    seg(cx, a);
    const top = REAR_Y + 6.5;
    P.tbox(g, a, b, zd0, zd1, top, H, stone, 8, 8);
    solids.push([a, b, zd0, zd1, top, H]);
    P.tbox(g, a - 0.15, b + 0.15, zd0 - 0.05, zd1 + 0.05, top - 0.25, top, gold);
    cx = b;
  }
  seg(cx, x1);

  // ---- stage, curtains, LED screen, lectern
  const sx = HALL.stageX;
  P.tbox(g, -sx, sx, z0, HALL.stageZ1, 0, HALL.stageH, wood, 4, 4);
  P.tbox(g, -sx - 0.1, sx + 0.1, HALL.stageZ1, HALL.stageZ1 + 0.12, 0, HALL.stageH + 0.08, gold);
  solids.push([-sx, sx, z0, HALL.stageZ1, 0, HALL.stageH]);
  // the two stage ramps (carpet, gold side rails) at the side aisles of the seat blocks
  for (const [a, b] of [[-17, -13], [13, 17]] as const) {
    P.slope(g, a, b, HALL.stageZ1, HALL.stageH, HALL.slopeZ0, 0, carpet, 4, 4);
    ramps.push({ x0: a, x1: b, zA: HALL.stageZ1, yA: HALL.stageH, zB: HALL.slopeZ0, yB: 0 });
  }
  const velvet = P.lit(null, 0x7a1220, 0.15);
  for (const s of [-1, 1]) P.tbox(g, s < 0 ? -sx : 23, s < 0 ? -23 : sx, z0 + 0.2, z0 + 1.2, HALL.stageH, H - 1, velvet);
  P.tbox(g, -sx, sx, z0 + 0.2, z0 + 1.2, H - 2.6, H - 1, velvet);
  const cv = document.createElement('canvas');
  cv.width = 1536; cv.height = 432;
  const sc = cv.getContext('2d') as CanvasRenderingContext2D;
  const stex = k.own(new THREE.CanvasTexture(cv));
  stex.colorSpace = THREE.SRGBColorSpace;
  stex.anisotropy = 4;
  const draw = (slide: ScreenSlide | null, topic: string): void => {
    const W = cv.width, Hh = cv.height;
    const bg = sc.createLinearGradient(0, 0, W, Hh);
    bg.addColorStop(0, '#0b1830'); bg.addColorStop(1, '#17335c');
    sc.fillStyle = bg; sc.fillRect(0, 0, W, Hh);
    sc.strokeStyle = '#d4af37'; sc.lineWidth = 6; sc.strokeRect(8, 8, W - 16, Hh - 16);
    // step 3: no text on the screen (no title, no slide icon, no bullet points): a plain blank screen. The slide arguments are kept so the callers do not change.
    void slide; void topic;
    stex.needsUpdate = true;
  };
  draw(null, '');
  P.vplane(g, 'z', SCREEN.z + 0.02, SCREEN.x - SCREEN.w / 2, SCREEN.x + SCREEN.w / 2, SCREEN.y - SCREEN.h / 2, SCREEN.y + SCREEN.h / 2, 1, k.own(new THREE.MeshBasicMaterial({ map: stex, toneMapped: false })));
  P.tbox(g, -SCREEN.w / 2 - 0.4, SCREEN.w / 2 + 0.4, SCREEN.z - 0.2, SCREEN.z + 0.01, SCREEN.y - SCREEN.h / 2 - 0.4, SCREEN.y + SCREEN.h / 2 + 0.4, gold);
  const dark = P.lit(null, 0x2a1c12, 0.3);
  P.tbox(g, LECTERN.x - 0.7, LECTERN.x + 0.7, LECTERN.z - 0.4, LECTERN.z + 0.4, HALL.stageH, HALL.stageH + 1.1, dark);
  P.tbox(g, LECTERN.x - 0.72, LECTERN.x + 0.72, LECTERN.z - 0.42, LECTERN.z + 0.42, HALL.stageH + 1.1, HALL.stageH + 1.16, gold);
  P.cyl(g, 0.012, 0.012, 0.5, LECTERN.x + 0.2, HALL.stageH + 1.4, LECTERN.z + 0.1, gold, 6);
  solids.push([LECTERN.x - 0.75, LECTERN.x + 0.75, LECTERN.z - 0.45, LECTERN.z + 0.45, HALL.stageH, HALL.stageH + 1.2]);

  // ---- seats (2 strips per block), seat-row colliders (people walk in the aisles) and the audience
  const seats: Seat[] = [];
  const seatMat = P.lit(null, 0x8a1c2b, 0.2);
  for (let i = 0; i < HALL.rows; i++) {
    const z = HALL.rowZ0 + i * HALL.rowStep, y = hallFloorY(z);
    for (const [a, b] of SEAT_BLOCKS) {
      solids.push([a, b, z - 0.55, z + 0.3, y, y + 1.0]);
      for (let x = a + SEAT_W / 2; x < b; x += SEAT_W) seats.push({ x, y, z });
      // one cushion strip + one back strip per block (the seats are the people's job to show; 66 strips instead of 2900 seats)
      P.tbox(g, a, b, z - 0.28, z + 0.24, y + 0.39, y + 0.51, seatMat);
      P.tbox(g, a, b, z + 0.23, z + 0.33, y + 0.5, y + 1.12, seatMat);
    }
  }
  // step 5: people walk in and sit down on these seats (the hall is empty until a mission runs); how many seats get a person depends on the quality tier
  const audience = buildAudience(P, seats, Q.hallFill);
  g.add(audience.group);

  return {
    group: g,
    solids,
    ramps,
    audience,
    showSlide: draw,
    update: (dt, tt) => audience.update(dt, tt),
  };
}
