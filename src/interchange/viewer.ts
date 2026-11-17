// INTERCHANGE standalone viewer: no game, no road network. `npm run dev`, then open /interchange-viewer.html
// Switch pattern / dressing with the buttons; drag = orbit, wheel = zoom, right drag = pan.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DIVIDED_SECTIONS } from '../roads/RoadSection';
import { buildInterchange, patternIds, type RoadSection } from './index';
import { buildInterchangeObject, type InterchangeObject } from './InterchangeView';

const section = (k: 'highway' | 'arterial' | 'avenue'): RoadSection => {
  const s = DIVIDED_SECTIONS.find((d) => d.id === k) ?? DIVIDED_SECTIONS[0];
  return { roadId: -1, halfWidth: s.halfWidth, kerbLane: s.halfWidth - s.shyOuter - s.laneW / 2, laneW: s.laneW, lanesPerDir: s.lanesPerDir, designKmh: s.designKmh };
};

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9c8e8);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 6000);
camera.position.set(380, 260, 380);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 5, 0);
controls.maxPolarAngle = Math.PI * 0.495;

scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b7a55, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(300, 500, 200);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 10, far: 1500 });
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshStandardMaterial({ color: 0x7f9a5a, roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.05;
floor.receiveShadow = true;
scene.add(floor);

const ui = document.createElement('div');
ui.style.cssText = 'position:fixed;left:10px;top:10px;font:13px system-ui;background:#000a;color:#fff;padding:8px 10px;border-radius:6px';
document.body.appendChild(ui);
const info = document.createElement('div');

let current: InterchangeObject | null = null;
let pattern = 'cloverleaf';
let dressing: 'plain' | 'garden' | 'grand' = 'grand';

function rebuild(): void {
  if (current) {
    scene.remove(current.group);
    current.dispose();
    current = null;
  }
  const model = buildInterchange({ id: 'view', pattern, x: 0, z: 0, y: 0, yaw: 0, main: section('highway'), cross: section('arterial'), dressing });
  current = buildInterchangeObject(model);
  scene.add(current.group);
  const errs = model.issues.filter((i) => i.level === 'error').map((i) => i.message);
  info.textContent = `${pattern} / ${dressing} — ${model.ramps.length} ramps, ~${current.triangles} triangles${errs.length ? ' — ERROR: ' + errs.join('; ') : ''}`;
}

const row = (label: string, items: readonly string[], pick: (v: string) => void): void => {
  const d = document.createElement('div');
  d.append(label + ' ');
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it;
    b.style.margin = '2px';
    b.onclick = (): void => {
      pick(it);
      rebuild();
    };
    d.appendChild(b);
  }
  ui.appendChild(d);
};
row('pattern', patternIds(), (v) => (pattern = v));
row('dressing', ['plain', 'garden', 'grand'], (v) => (dressing = v as typeof dressing));
ui.appendChild(info);
rebuild();

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
