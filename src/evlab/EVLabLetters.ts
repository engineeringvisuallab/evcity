import * as THREE from 'three';
import { Parts } from './EVLabParts';
import { BAND_H, FACE_LAYOUT, LAYOUTS, blockHeight, letterQuads, lineTops, type LetterLayout } from './EVLabLettersPlan';

// EVLab Step RT5: the lettering "Engineering Visual Lab EVLab" on the 4 faces of the tower. Two transparent canvas textures (one for the east / west
// faces, one for the north / south faces, 1024 px wide), two meshes (one per texture, 22 quads each, static, no per-frame work, no shadow).
// The material is unlit (it is a sign): it reads at night as well as by day; `setNight` only dims it a little in daylight.

export interface LettersBuild {
  group: THREE.Group;
  setNight(k: number): void;
  /** Triangle count (for the budget). */
  tris: number;
}

const TEX_W = 1024;

function drawLayout(c: CanvasRenderingContext2D, w: number, h: number, L: LetterLayout): void {
  const pm = w / L.W; // pixels per metre (the same in x and y: the canvas has the aspect of the band)
  const tops = lineTops(L);
  c.clearRect(0, 0, w, h);
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  L.lines.forEach((l, i) => {
    const capPx = l.cap * pm;
    let fs = capPx / 0.72; // cap height of a bold sans font is about 0.72 em
    const font = (s: number): string => `bold ${Math.round(s)}px "Arial Black", Arial, Helvetica, sans-serif`;
    c.font = font(fs);
    // keep the line inside the texture (a font with wider capitals than estimated is made smaller, not cut)
    const wide = c.measureText(l.text).width * l.squeeze;
    const maxW = w * 0.94;
    let sq = l.squeeze;
    if (wide > maxW) sq *= maxW / wide;
    const baseline = (tops[i] + l.cap) * pm; // distance from the top of the canvas to the baseline
    c.save();
    c.translate(w / 2, baseline);
    c.scale(sq, 1);
    c.lineWidth = Math.max(2, capPx * 0.07);
    c.strokeStyle = '#06222e';
    c.strokeText(l.text, 0, 0);
    c.fillStyle = l.accent ? '#ffd36b' : '#fff0c2';
    c.fillText(l.text, 0, 0);
    c.restore();
  });
}

export function buildTowerLetters(P: Parts): LettersBuild {
  const { k } = P;
  const g = new THREE.Group();
  g.name = 'EVLabTowerLetters';
  const quads = letterQuads();
  let tris = 0;
  const mats: THREE.MeshBasicMaterial[] = [];
  for (const kind of ['side', 'wide'] as const) {
    const L = LAYOUTS[kind];
    const h = Math.round((TEX_W * BAND_H) / L.W);
    const map = k.texture(TEX_W, h, (c, w, hh) => drawLayout(c, w, hh, L));
    map.generateMipmaps = true;
    // sanity: the block must fit into the band (the plan test checks the numbers too)
    if (blockHeight(L) > BAND_H) console.warn('EVLab letters: text block taller than the band');
    const mat = k.own(new THREE.MeshBasicMaterial({ map, alphaTest: 0.4, toneMapped: false, side: THREE.FrontSide }));
    mats.push(mat);
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const q of quads) {
      if (FACE_LAYOUT[q.face] !== kind) continue;
      const base = pos.length / 3;
      for (let j = 0; j < 4; j++) { pos.push(q.p[j][0], q.p[j][1], q.p[j][2]); uv.push(q.uv[j][0], q.uv[j][1]); }
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1); // the winding of the glass loft in EVLabFacade (outward)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(k.own(geo), mat);
    mesh.name = 'letters-' + kind;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // the strip is large and the group is one object of the facade
    g.add(mesh);
    tris += idx.length / 3;
  }
  const setNight = (nk: number): void => { for (const m of mats) m.color.setScalar(0.82 + 0.18 * nk); };
  setNight(0);
  return { group: g, setNight, tris };
}
