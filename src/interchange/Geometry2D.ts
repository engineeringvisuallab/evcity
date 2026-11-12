// INTERCHANGE FOUNDATION: small 2D geometry helpers. No three.js, no DOM, no game imports: everything here can be tested headless.
//
// LOCAL FRAME of an interchange: u = along the main road (its travel direction), v = the LEFT of u (the game drives on the left, like Bangladesh).
// Heading h is an angle in this frame: h = 0 is +u, h = +PI/2 is +v. A positive turn angle is a LEFT turn (counter-clockwise in (u, v)).
// World frame (x east, z south): world = centre + u * (cos yaw, sin yaw) + v * (sin yaw, -cos yaw). This is the same "left normal" as RoadSpec.nx / nz.

export interface P2 {
  u: number;
  v: number;
}

export const DEG = Math.PI / 180;

/** Draws a path like a turtle: straight pieces and circular arcs. Points are dense (about `step` m); resample() makes them even. */
export class Turtle {
  pts: P2[];
  constructor(
    public u: number,
    public v: number,
    public h: number,
    private step = 2,
  ) {
    this.pts = [{ u, v }];
  }

  straight(len: number): this {
    const n = Math.max(1, Math.ceil(len / this.step));
    const du = Math.cos(this.h) * (len / n);
    const dv = Math.sin(this.h) * (len / n);
    for (let i = 0; i < n; i++) {
      this.u += du;
      this.v += dv;
      this.pts.push({ u: this.u, v: this.v });
    }
    return this;
  }

  /** Circular arc of `radius` m turning by `angle` rad (positive = left, negative = right). */
  arc(radius: number, angle: number): this {
    const sign = angle >= 0 ? 1 : -1;
    const n = Math.max(2, Math.ceil((radius * Math.abs(angle)) / this.step));
    // centre of the turn: on the left (sign +1) or the right (sign -1) of the heading
    const cu = this.u - Math.sin(this.h) * radius * sign;
    const cv = this.v + Math.cos(this.h) * radius * sign;
    const h0 = this.h;
    for (let i = 1; i <= n; i++) {
      const h = h0 + (angle * i) / n;
      this.pts.push({ u: cu + Math.sin(h) * radius * sign, v: cv - Math.cos(h) * radius * sign });
    }
    this.h = h0 + angle;
    const last = this.pts[this.pts.length - 1];
    this.u = last.u;
    this.v = last.v;
    return this;
  }
}

/** Cubic Bezier through p0 -> p1 with the heading `h0` at the start and `h1` at the end (handle lengths k0, k1 m). */
export function bezier(p0: P2, h0: number, p1: P2, h1: number, k0: number, k1: number, n = 48): P2[] {
  const a = { u: p0.u + Math.cos(h0) * k0, v: p0.v + Math.sin(h0) * k0 };
  const b = { u: p1.u - Math.cos(h1) * k1, v: p1.v - Math.sin(h1) * k1 };
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    const c0 = m * m * m;
    const c1 = 3 * m * m * t;
    const c2 = 3 * m * t * t;
    const c3 = t * t * t;
    out.push({ u: c0 * p0.u + c1 * a.u + c2 * b.u + c3 * p1.u, v: c0 * p0.v + c1 * a.v + c2 * b.v + c3 * p1.v });
  }
  return out;
}

export function pathLength(pts: readonly P2[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v);
  return L;
}

/** Even spacing: one point every `step` m (the last point is always the end of the path). */
export function resample(pts: readonly P2[], step: number): P2[] {
  const L = pathLength(pts);
  const n = Math.max(2, Math.round(L / step) + 1);
  const out: P2[] = [{ u: pts[0].u, v: pts[0].v }];
  let seg = 1;
  let acc = 0; // length up to pts[seg - 1]
  for (let k = 1; k < n - 1; k++) {
    const target = (L * k) / (n - 1);
    while (seg < pts.length - 1 && acc + Math.hypot(pts[seg].u - pts[seg - 1].u, pts[seg].v - pts[seg - 1].v) < target) {
      acc += Math.hypot(pts[seg].u - pts[seg - 1].u, pts[seg].v - pts[seg - 1].v);
      seg++;
    }
    const a = pts[seg - 1];
    const b = pts[seg];
    const sl = Math.hypot(b.u - a.u, b.v - a.v) || 1;
    const t = Math.max(0, Math.min(1, (target - acc) / sl));
    out.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
  }
  out.push({ u: pts[pts.length - 1].u, v: pts[pts.length - 1].v });
  return out;
}

export function reversed(pts: readonly P2[]): P2[] {
  return pts.map((p) => ({ u: p.u, v: p.v })).reverse();
}

/** Rotate by k * 90 degrees counter-clockwise ((u, v) -> (-v, u) per step). */
export function rot90(p: P2, k: number): P2 {
  let { u, v } = p;
  for (let i = ((k % 4) + 4) % 4; i > 0; i--) {
    const t = u;
    u = -v;
    v = t;
  }
  return { u, v };
}

export function mirrorU(pts: readonly P2[]): P2[] {
  return pts.map((p) => ({ u: -p.u, v: p.v }));
}

/** Heading (rad) of the path at every point (central difference). */
export function headings(pts: readonly P2[]): number[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    return Math.atan2(b.v - a.v, b.u - a.u);
  });
}

/** Smallest radius (m) of the path, from three points that are about `span` m apart. Infinity = a straight line. */
export function minRadius(pts: readonly P2[], span = 12): number {
  let best = Infinity;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].u - pts[i - 1].u, pts[i].v - pts[i - 1].v));
  for (let i = 1; i < pts.length - 1; i++) {
    let a = i;
    let c = i;
    while (a > 0 && cum[i] - cum[a] < span) a--;
    while (c < pts.length - 1 && cum[c] - cum[i] < span) c++;
    if (a === i || c === i) continue;
    const A = pts[a];
    const B = pts[i];
    const C = pts[c];
    const ab = Math.hypot(B.u - A.u, B.v - A.v);
    const bc = Math.hypot(C.u - B.u, C.v - B.v);
    const ca = Math.hypot(A.u - C.u, A.v - C.v);
    const cross = Math.abs((B.u - A.u) * (C.v - A.v) - (B.v - A.v) * (C.u - A.u));
    if (cross < 1e-9) continue;
    best = Math.min(best, (ab * bc * ca) / (2 * cross)); // circumradius
  }
  return best;
}

/** Distance from the point to the nearest point of the path (and which segment). */
export function distToPath(p: P2, pts: readonly P2[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].u;
    const ay = pts[i - 1].v;
    const bx = pts[i].u - ax;
    const by = pts[i].v - ay;
    const l2 = bx * bx + by * by || 1;
    const t = Math.max(0, Math.min(1, ((p.u - ax) * bx + (p.v - ay) * by) / l2));
    best = Math.min(best, Math.hypot(p.u - (ax + bx * t), p.v - (ay + by * t)));
  }
  return best;
}

/** Smallest distance between two paths, sampled at the points of both (paths are dense enough: <= 8 m apart). */
export function minPathDistance(a: readonly P2[], b: readonly P2[], skipA?: (i: number) => boolean, skipB?: (j: number) => boolean): number {
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    if (skipA && skipA(i)) continue;
    for (let j = 0; j < b.length; j++) {
      if (skipB && skipB(j)) continue;
      const d = Math.hypot(a[i].u - b[j].u, a[i].v - b[j].v);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Crossings of two paths (segment-segment): the point and the fractional indices on a and b. */
export function crossings(a: readonly P2[], b: readonly P2[]): { u: number; v: number; ia: number; ib: number }[] {
  const out: { u: number; v: number; ia: number; ib: number }[] = [];
  for (let i = 1; i < a.length; i++) {
    const p = a[i - 1];
    const r = { u: a[i].u - p.u, v: a[i].v - p.v };
    for (let j = 1; j < b.length; j++) {
      const q = b[j - 1];
      const s = { u: b[j].u - q.u, v: b[j].v - q.v };
      const den = r.u * s.v - r.v * s.u;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q.u - p.u) * s.v - (q.v - p.v) * s.u) / den;
      const w = ((q.u - p.u) * r.v - (q.v - p.v) * r.u) / den;
      if (t >= 0 && t <= 1 && w >= 0 && w <= 1) out.push({ u: p.u + r.u * t, v: p.v + r.v * t, ia: i - 1 + t, ib: j - 1 + w });
    }
  }
  return out;
}

export const smoothstep01 = (t: number): number => {
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};
