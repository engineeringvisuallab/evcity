// EVLab campus: flat road ribbons (ring road, connectors, bridge decks), a low wall strip for the island's quay, and the asphalt texture.
// Building-local metres (x east, z south). Pure three.js geometry, nothing from the world.
import * as THREE from 'three';
import type { Kit } from '../structures';

/** Asphalt ribbon texture: u = across the road (0..1), v = along it (one tile = 8 m). Dashed centre line, solid white edge lines. */
export function asphaltTexture(k: Kit): THREE.CanvasTexture {
  const t = k.texture(128, 128, (c, w, h) => {
    c.fillStyle = '#6f7274'; c.fillRect(0, 0, w, h); // the game's road asphalt (grey 0.46 / 0.47 / 0.48)
    let s = 7;
    const rnd = (): number => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${(rnd() * 0.08).toFixed(3)})`; c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
    c.fillStyle = 'rgba(235,235,225,0.92)';
    c.fillRect(w * 0.035, 0, 4, h); c.fillRect(w * 0.965 - 4, 0, 4, h); // edge lines
    c.fillStyle = 'rgba(240,200,60,0.95)';
    c.fillRect(w / 2 - 2, 0, 4, h * 0.5); // dashed centre line (half of every tile)
  });
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

type Pt = readonly [number, number];

/** A flat ribbon of constant width along a polyline (y = height). Normals point up; both faces are drawn. `tile` = metres per texture repeat along the line. */
export function roadStrip(g: THREE.Object3D, k: Kit, pts: ReadonlyArray<Pt>, halfW: number, y: number, mat: THREE.Material, tile = 8): THREE.Mesh {
  const n = pts.length;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    const nx = -dz, nz = dx;
    if (i > 0) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0] + nx * halfW, y, p[1] + nz * halfW, p[0] - nx * halfW, y, p[1] - nz * halfW);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, len / tile, 1, len / tile);
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = k.own(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  g.add(m);
  return m;
}

/** A vertical wall along a polyline from y0 up to y1 (both faces drawn). `tile` = metres per texture repeat. */
export function wallStrip(g: THREE.Object3D, k: Kit, pts: ReadonlyArray<Pt>, y0: number, y1: number, mat: THREE.Material, tile = 6): THREE.Mesh {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pos.push(pts[i][0], y0, pts[i][1], pts[i][0], y1, pts[i][1]);
    uv.push(len / tile, 0, len / tile, (y1 - y0) / tile);
  }
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = k.own(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  g.add(m);
  return m;
}

/** Cut a closed contour into the runs of points for which `skip` is false. */
export function runsOf(pts: ReadonlyArray<Pt>, skip: (x: number, z: number) => boolean): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    if (skip(p[0], p[1])) { if (cur.length > 1) out.push(cur); cur = []; } else cur.push(p);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}
