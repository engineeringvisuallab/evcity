// AT-GRADE 3-WAY JUNCTION (no flyover): three divided highways meet in one level pad with rounded corners (kerb radius R).
// Pure geometry (no three.js): arm directions, the pad outline and the arm start distance. The renderer is buildJunction3Object (InterchangeView.ts).
// Plane coordinates (x, z); arm k points along (cos a, sin a); its "left" normal is (-sin a, cos a).

export type P = { x: number; z: number };

export interface Junction3Geo {
  /** Arm direction angles (rad), counter-clockwise. */
  angles: number[];
  /** Distance from the centre where every arm strip begins (= where the pad ends along the arm). */
  s: number;
  /** Closed pad outline, counter-clockwise; fan-fill it from (0,0). */
  outline: P[];
}

export function junction3Angles(kind: 'T' | 'Y'): number[] {
  return kind === 'T' ? [0, Math.PI / 2, Math.PI] : [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
}

export function junction3Geometry(kind: 'T' | 'Y', W: number, R: number, arcSteps = 10): Junction3Geo {
  const angles = junction3Angles(kind);
  const n = angles.length;
  const delta = (k: number): number => {
    let d = angles[(k + 1) % n] - angles[k];
    while (d <= 0) d += 2 * Math.PI;
    return d;
  };
  // arm start distance = the farthest tangent point of any rounded corner
  let s = 20;
  for (let k = 0; k < n; k++) {
    const d = delta(k);
    if (d < Math.PI - 1e-6) s = Math.max(s, (W + R) / Math.tan(d / 2));
  }
  s += 1;
  const dir = (a: number): P => ({ x: Math.cos(a), z: Math.sin(a) });
  const nor = (a: number): P => ({ x: -Math.sin(a), z: Math.cos(a) });
  const outline: P[] = [];
  for (let k = 0; k < n; k++) {
    const a = angles[k];
    const d = dir(a);
    const nn = nor(a);
    outline.push({ x: d.x * s - nn.x * W, z: d.z * s - nn.z * W }); // mouth, right side
    outline.push({ x: d.x * s + nn.x * W, z: d.z * s + nn.z * W }); // mouth, left side
    const dl = delta(k);
    if (dl < Math.PI - 1e-6) {
      const b = angles[(k + 1) % n];
      const t = (W + R) / Math.tan(dl / 2);
      const A: P = { x: d.x * t + nn.x * W, z: d.z * t + nn.z * W };
      const db = dir(b);
      const nb = nor(b);
      const B: P = { x: db.x * t - nb.x * W, z: db.z * t - nb.z * W };
      const mid = a + dl / 2;
      const oR = (W + R) / Math.sin(dl / 2);
      const O: P = { x: Math.cos(mid) * oR, z: Math.sin(mid) * oR };
      const a0 = Math.atan2(A.z - O.z, A.x - O.x);
      let sweep = Math.atan2(B.z - O.z, B.x - O.x) - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      for (let i = 0; i <= arcSteps; i++) {
        const q = a0 + (sweep * i) / arcSteps;
        outline.push({ x: O.x + Math.cos(q) * R, z: O.z + Math.sin(q) * R });
      }
    }
  }
  return { angles, s, outline };
}

/** Polygon area (positive when counter-clockwise in the (x, z) plane). */
export function polyArea(p: P[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.z - q.x * p[i].z;
  }
  return a / 2;
}
