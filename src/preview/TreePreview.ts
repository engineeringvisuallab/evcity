import * as THREE from 'three';
import { TreeAssets } from '../vegetation/TreeAssets';
import { TREE_KIND_COUNT } from '../vegetation/TreeTypes';

/**
 * Dev-only viewer for every tree model (not part of the game build). Open /preview-trees.html while `npm run dev` is running.
 * Drag = turn, wheel = zoom, buttons = pick a tree / all in a row / near or far detail level.
 */
const NAMES = ['broadleaf', 'pine', 'acacia (old "palm")', 'oak', 'vase', 'slender', 'Sal', 'Segun', 'Koroi', 'Bot (banyan)', 'Shimul', 'Narikel', 'Khejur', 'Tal', 'Kola', 'Krishnachura', 'Debdaru', 'Bamboo (bash jhar)'];
const SPACING = 36;

export function startTreePreview(host: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;touch-action:none';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcd7ee);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x8a7a66, 0.9 * Math.PI));
  const sun = new THREE.DirectionalLight(0xfff3d6, 1.4);
  sun.position.set(120, 200, 90);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 400), new THREE.MeshLambertMaterial({ color: 0x7e9a66 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const assets = new TreeAssets();
  let lod = 0;
  const meshes: THREE.Mesh[] = [];
  for (let k = 0; k < TREE_KIND_COUNT; k++) {
    const m = new THREE.Mesh(assets.geometries[k][lod], assets.materialFor(k));
    m.position.set(k * SPACING, 0, 0);
    scene.add(m);
    meshes.push(m);
  }

  let selected = -1; // -1 = all
  const view = { yaw: 0.5, pitch: 0.18, dist: 200 };
  const target = new THREE.Vector3();
  const fit = (): void => {
    if (selected < 0) {
      target.set(((TREE_KIND_COUNT - 1) * SPACING) / 2, 10, 0);
      view.dist = ((TREE_KIND_COUNT * SPACING) / 2) / Math.tan((camera.fov * Math.PI) / 360) * 0.8;
    } else {
      const g = meshes[selected].geometry;
      g.computeBoundingBox();
      const b = g.boundingBox!;
      const h = b.max.y - b.min.y;
      const w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
      target.set(selected * SPACING, b.min.y + h * 0.5, 0);
      view.dist = (Math.max(h, w * 0.9) * 0.62) / Math.tan((camera.fov * Math.PI) / 360);
    }
  };
  fit();

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:8px;top:8px;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font:14px Arial,sans-serif';
  host.appendChild(hud);
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;right:8px;top:44px;display:flex;gap:6px;overflow-x:auto';
  host.appendChild(bar);
  const mk = (label: string, fn: () => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    bar.appendChild(b);
  };
  const refresh = (): void => {
    hud.textContent = `${selected < 0 ? 'All trees' : NAMES[selected]} - detail ${lod === 0 ? 'near (LOD0)' : 'far (LOD1)'}`;
  };
  mk('All', () => { selected = -1; fit(); refresh(); });
  mk('LOD 0/1', () => {
    lod = 1 - lod;
    meshes.forEach((m, k) => { m.geometry = assets.geometries[k][lod]; });
    refresh();
  });
  for (let k = 0; k < TREE_KIND_COUNT; k++) mk(NAMES[k], () => { selected = k; fit(); refresh(); });
  refresh();

  const el = renderer.domElement;
  let drag = false, lx = 0, ly = 0;
  el.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => { drag = false; });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.yaw -= (e.clientX - lx) * 0.006;
    view.pitch = Math.max(-0.2, Math.min(1.4, view.pitch + (e.clientY - ly) * 0.005));
    lx = e.clientX;
    ly = e.clientY;
  });
  el.addEventListener('wheel', (e) => { view.dist *= Math.exp(e.deltaY * 0.001); e.preventDefault(); }, { passive: false });

  const resize = (): void => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const loop = (t: number): void => {
    assets.update(t / 1000);
    camera.position.set(
      target.x + view.dist * Math.cos(view.pitch) * Math.sin(view.yaw),
      target.y + view.dist * Math.sin(view.pitch),
      target.z + view.dist * Math.cos(view.pitch) * Math.cos(view.yaw),
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
