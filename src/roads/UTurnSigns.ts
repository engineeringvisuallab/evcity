// ROADS STEP 6b: the U-turn sign mesh: two instanced meshes per 1 km square (poles, boards), built near the player only. The plan is roads/UTurnSignPlan.ts.
import * as THREE from 'three';
import { Config } from '../core/Config';
import type { RoadNetwork } from './RoadNetwork';
import { planUTurnSigns, type UTurnSign } from './UTurnSignPlan';

const CELL = 1000;
interface Cell { x: number; z: number; list: UTurnSign[]; poles: THREE.InstancedMesh | null; boards: THREE.InstancedMesh | null }

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a5aa8';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.strokeRect(5, 5, 118, 118);
  // the U-turn arrow: up the left leg, a half circle over the top, down the right leg with the head
  g.lineWidth = 11;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(44, 106);
  g.lineTo(44, 56);
  g.arc(64, 56, 20, Math.PI, 0, false);
  g.lineTo(84, 76);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(68, 76);
  g.lineTo(100, 76);
  g.lineTo(84, 98);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class UTurnSignView {
  readonly group = new THREE.Group();
  private cells: Cell[] = [];
  private poleGeo: THREE.BufferGeometry;
  private boardGeo = new THREE.PlaneGeometry(0.7, 0.7);
  private poleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private boardMat: THREE.MeshLambertMaterial;
  private timer = 9;
  count = 0;

  constructor(parent: THREE.Object3D, roads: RoadNetwork) {
    const S = Config.city.uturn.sign;
    this.boardMat = new THREE.MeshLambertMaterial({ map: signTexture() });
    // pole (thin cylinder) + a grey back plate behind the board, merged with vertex colours
    const pole = new THREE.CylinderGeometry(0.035, 0.04, S.boardBottom + 0.35, 8);
    pole.translate(0, (S.boardBottom + 0.35) / 2, 0);
    const back = new THREE.BoxGeometry(0.74, 0.74, 0.03);
    back.translate(0, S.boardBottom + 0.35, -0.03);
    const parts = [{ g: pole, c: [0.45, 0.46, 0.48] }, { g: back, c: [0.5, 0.5, 0.52] }];
    let nv = 0;
    let ni = 0;
    for (const p of parts) { nv += p.g.getAttribute('position').count; ni += p.g.getIndex()!.count; }
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const idx = new Uint16Array(ni);
    let vo = 0;
    let io = 0;
    for (const p of parts) {
      const pa = p.g.getAttribute('position');
      const na = p.g.getAttribute('normal');
      for (let i = 0; i < pa.count; i++) {
        pos.set([pa.getX(i), pa.getY(i), pa.getZ(i)], (vo + i) * 3);
        nor.set([na.getX(i), na.getY(i), na.getZ(i)], (vo + i) * 3);
        col.set(p.c, (vo + i) * 3);
      }
      const ia = p.g.getIndex()!;
      for (let i = 0; i < ia.count; i++) idx[io + i] = ia.getX(i) + vo;
      vo += pa.count;
      io += ia.count;
      p.g.dispose();
    }
    this.poleGeo = new THREE.BufferGeometry();
    this.poleGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.poleGeo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this.poleGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.poleGeo.setIndex(new THREE.BufferAttribute(idx, 1));

    const HALF = Config.world.size / 2;
    const map = new Map<string, Cell>();
    for (const sg of planUTurnSigns(roads)) {
      const cx = Math.floor((sg.x + HALF) / CELL);
      const cz = Math.floor((sg.z + HALF) / CELL);
      const key = cx + ',' + cz;
      let c = map.get(key);
      if (!c) { c = { x: cx * CELL - HALF + CELL / 2, z: cz * CELL - HALF + CELL / 2, list: [], poles: null, boards: null }; map.set(key, c); }
      c.list.push(sg);
    }
    this.cells = [...map.values()];
    parent.add(this.group);
  }

  /** 2 Hz: build the squares within `showRadius` of the player, drop far ones. Player position in WORLD metres. */
  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    const R = Config.city.uturn.sign.showRadius + CELL * 0.71;
    let n = 0;
    for (const c of this.cells) {
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < R && !c.poles) this.build(c);
      else if (d > R + 300 && c.poles) this.drop(c);
      if (c.poles) { c.poles.visible = c.boards!.visible = d < R; if (d < R) n += c.list.length; }
    }
    this.count = n;
  }

  private build(c: Cell): void {
    const S = Config.city.uturn.sign;
    const n = c.list.length;
    c.poles = new THREE.InstancedMesh(this.poleGeo, this.poleMat, n);
    c.boards = new THREE.InstancedMesh(this.boardGeo, this.boardMat, n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const sg = c.list[i];
      d.position.set(sg.x, sg.y, sg.z);
      d.rotation.set(0, Math.atan2(sg.fx, sg.fz), 0);
      d.updateMatrix();
      c.poles.setMatrixAt(i, d.matrix);
      d.position.set(sg.x, sg.y + S.boardBottom + 0.35, sg.z);
      d.translateZ(0.001); // a hair in front of the back plate
      d.updateMatrix();
      c.boards.setMatrixAt(i, d.matrix);
    }
    for (const m of [c.poles, c.boards]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.matrixAutoUpdate = false;
      m.castShadow = false;
      m.receiveShadow = false;
      this.group.add(m);
    }
    c.poles.name = `uturn sign poles ${Math.round(c.x)},${Math.round(c.z)}`;
    c.boards.name = `uturn sign boards ${Math.round(c.x)},${Math.round(c.z)}`;
  }

  private drop(c: Cell): void {
    for (const m of [c.poles, c.boards]) if (m) { this.group.remove(m); m.dispose(); }
    c.poles = c.boards = null;
  }

  dispose(): void {
    for (const c of this.cells) this.drop(c);
    this.group.parent?.remove(this.group);
    this.poleGeo.dispose();
    this.boardGeo.dispose();
    this.poleMat.dispose();
    this.boardMat.map?.dispose();
    this.boardMat.dispose();
  }
}
