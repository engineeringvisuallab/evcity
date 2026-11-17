// EVLab Tower: small building helpers shared by the shell, lobby, hall, grounds and tower. Building-local metres.
// The "rep" numbers of tbox / vplane / hplane / slope are METRES PER TEXTURE TILE (8 = one tile every 8 m); leave them out for no tiling.
import * as THREE from 'three';
import { Kit } from '../structures';
import type { EVLabTextures } from './EVLabTextures';

export class Parts {
  constructor(readonly k: Kit, readonly t: EVLabTextures) {}

  /** Lit surface (map optional). `gloss` 0..1 = how shiny (polished marble ~0.35, rough stone ~0.1). */
  lit(map: THREE.Texture | null, color: number, gloss: number): THREE.MeshPhongMaterial {
    const s = Math.round(255 * Math.min(1, gloss) * 0.7);
    return this.k.own(new THREE.MeshPhongMaterial({ map: map ?? null, color, specular: (s << 16) | (s << 8) | s, shininess: 18 + gloss * 70 }));
  }

  /** Light that does not depend on the sun: a lamp / glowing strip. `emissive` is only a hint for a warmer tint. */
  glow(color: number, intensity: number, emissive?: number): THREE.MeshBasicMaterial {
    const c = new THREE.Color(color);
    if (emissive !== undefined) c.lerp(new THREE.Color(emissive), 0.25);
    c.multiplyScalar(Math.min(1.6, intensity));
    return this.k.own(new THREE.MeshBasicMaterial({ color: c }));
  }

  gold(): THREE.MeshPhongMaterial {
    return this.k.own(new THREE.MeshPhongMaterial({ color: 0xd4af37, emissive: 0x2e2406, specular: 0xfff1b0, shininess: 90 }));
  }

  private scaleUV(geo: THREE.BufferGeometry, u: number, v: number, from = 0, to = Infinity): void {
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = from; i < Math.min(uv.count, to); i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
    uv.needsUpdate = true;
  }

  /** Box from min/max corners (x, z, y order like the layout files). Mesh is centred, position = centre. */
  tbox(g: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, mat: THREE.Material, uM = 0, vM = 0): THREE.Mesh {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const geo = this.k.own(new THREE.BoxGeometry(w, h, d));
    if (uM > 0) {
      const vv = vM > 0 ? vM : uM;
      // BoxGeometry face order: +x -x +y -y +z -z, 4 vertices each
      this.scaleUV(geo, d / uM, h / vv, 0, 8);
      this.scaleUV(geo, w / uM, d / vv, 8, 16);
      this.scaleUV(geo, w / uM, h / vv, 16, 24);
    }
    const me = new THREE.Mesh(geo, mat);
    me.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.add(me);
    return me;
  }

  cyl(g: THREE.Object3D, rt: number, rb: number, h: number, x: number, y: number, z: number, mat: THREE.Material, seg = 20): THREE.Mesh {
    return this.k.cyl(g, rt, rb, h, x, y, z, mat, seg);
  }

  /** Upright plane on x = at ('x') or z = at ('z'); a0..a1 runs along the other horizontal axis, b0..b1 is height. `face` = +1 / -1: which way it looks along its axis. */
  vplane(g: THREE.Object3D, axis: 'x' | 'z', at: number, a0: number, a1: number, b0: number, b1: number, face: 1 | -1, mat: THREE.Material, uM = 0, vM = 0): THREE.Mesh {
    const w = a1 - a0, h = b1 - b0;
    const geo = this.k.own(new THREE.PlaneGeometry(w, h));
    if (uM > 0) this.scaleUV(geo, w / uM, h / (vM > 0 ? vM : uM));
    const me = new THREE.Mesh(geo, mat);
    if (axis === 'z') { me.position.set((a0 + a1) / 2, (b0 + b1) / 2, at); me.rotation.y = face > 0 ? 0 : Math.PI; }
    else { me.position.set(at, (b0 + b1) / 2, (a0 + a1) / 2); me.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2; }
    g.add(me);
    return me;
  }

  /** Flat plane at height y. `up` false = faces down (a ceiling). */
  hplane(g: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y: number, mat: THREE.Material, uM = 0, vM = 0, up = true): THREE.Mesh {
    const w = x1 - x0, d = z1 - z0;
    const geo = this.k.own(new THREE.PlaneGeometry(w, d));
    if (uM > 0) this.scaleUV(geo, w / uM, d / (vM > 0 ? vM : uM));
    const me = new THREE.Mesh(geo, mat);
    me.rotation.x = up ? -Math.PI / 2 : Math.PI / 2;
    me.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    g.add(me);
    return me;
  }

  /** Sloped walkway slab (top surface passes through (zA, yA) and (zB, yB), 0.6 m thick below: the same pose as Layout.rampPose). */
  slope(g: THREE.Object3D, x0: number, x1: number, zA: number, yA: number, zB: number, yB: number, mat: THREE.Material, uM = 0, vM = 0): THREE.Mesh {
    const [za, ya, zb, yb] = zA <= zB ? [zA, yA, zB, yB] : [zB, yB, zA, yA];
    const dz = zb - za, dy = yb - ya, a = Math.atan2(dy, dz), len = Math.hypot(dz, dy), th = 0.3;
    const geo = this.k.own(new THREE.BoxGeometry(x1 - x0, th * 2, len));
    if (uM > 0) {
      const vv = vM > 0 ? vM : uM;
      this.scaleUV(geo, len / uM, (th * 2) / vv, 0, 8);
      this.scaleUV(geo, (x1 - x0) / uM, len / vv, 8, 16);
      this.scaleUV(geo, (x1 - x0) / uM, (th * 2) / vv, 16, 24);
    }
    const me = new THREE.Mesh(geo, mat);
    me.position.set((x0 + x1) / 2, (ya + yb) / 2 - th * Math.cos(a), (za + zb) / 2 + th * Math.sin(a));
    me.rotation.x = -a;
    g.add(me);
    return me;
  }
}
