// Standalone walkthrough of City Mall - 10 floors, glass, 100 m atrium (mall.html). The mall itself is just buildMall() - no dependency on the city.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadCatalog, FLOORS } from './MallCatalog';
import { buildMall } from './MallBuilder';
import { MallInteraction } from './MallInteraction';
import { MALL_ATRIUM_R, MALL_BUILDING_LOCAL, MALL_EXTENT } from './MallSite';

const CSS = `
.mall-ui{position:fixed;inset:0;pointer-events:none;font-family:'Noto Sans Bengali',system-ui,sans-serif;color:#fff}
.mall-ui .panel{position:absolute;left:12px;top:12px;background:rgba(15,23,42,.82);border-radius:12px;padding:10px 12px;pointer-events:auto;max-width:230px;max-height:92vh;overflow:auto}
.mall-ui h1{font-size:16px;margin:0 0 8px;color:#f97316}
.mall-ui button{display:block;width:100%;margin:3px 0;padding:6px 8px;border:0;border-radius:8px;background:#1e293b;color:#fff;text-align:left;cursor:pointer;font:inherit;font-size:13px;border-left:5px solid var(--c)}
.mall-ui button:hover{background:#334155}
.mall-ui .help{position:absolute;left:12px;bottom:12px;font-size:12px;background:rgba(15,23,42,.7);padding:6px 10px;border-radius:8px}
.mall-ui .cross{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px;border:2px solid #fff;border-radius:50%;opacity:.8}
.mall-ui .tip{position:absolute;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(15,23,42,.92);border:2px solid #f97316;border-radius:14px;padding:10px 18px;text-align:center;display:none}
.mall-ui input{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:0;margin-bottom:6px;font:inherit;font-size:13px}.mall-ui #mini{position:absolute;right:12px;bottom:12px;border-radius:10px;background:rgba(15,23,42,.8)}.mall-ui .tip b{font-size:18px;display:block}.mall-ui .tip i{color:#f97316;font-style:normal;font-size:20px}.mall-ui .tip small{opacity:.8}`;

export async function startMallViewer(container: HTMLElement): Promise<void> {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  await document.fonts.load('700 48px "Noto Sans Bengali"', 'কখগ').catch(() => undefined); // canvas signs need the font ready
  const catalog = await loadCatalog();
  const mall = buildMall(catalog);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3f5);
  scene.fog = new THREE.Fog(0xbfe3f5, 500, 1600);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // makes metals look right
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(30, 60, 25); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
  scene.add(mall.group);
  for (let f = 0; f < mall.floors.length; f++) mall.ensureFloor(f); // the viewer shows every floor (the game builds a floor when the player comes near)

  const cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1800);
  const pos = mall.spawn.clone(); let yaw = mall.spawnYaw, pitch = 0, overview = false;
  const EYE = 1.65, R = 0.45;

  // ---- UI ----
  const ui = document.createElement('div'); ui.className = 'mall-ui';
  ui.innerHTML = `<div class="panel"><h1>City Mall · ১০ তলা</h1><input id="q" placeholder="পণ্য খুঁজুন…"><div id="res"></div><div id="shops"></div></div><canvas id="mini" width="180" height="180"></canvas><div class="cross"></div>
    <div class="tip" id="tip"></div>
    <div class="help">W A S D চলুন · Shift দৌড় · মাউস ঘোরান · <b>পণ্যে ক্লিক = অর্ডার পেজ (নতুন ট্যাব)</b> · O = ওপর থেকে দেখুন · Esc = মাউস ছাড়ুন</div>`;
  document.body.appendChild(ui);
  const shopsEl = ui.querySelector('#shops') as HTMLElement, tip = ui.querySelector('#tip') as HTMLElement;
  let lastFloor = -1;
  for (const s of mall.shops) {
    if (s.floor !== lastFloor) { lastFloor = s.floor; const h = document.createElement('div'); h.style.cssText = 'margin:8px 0 2px;font-size:12px;opacity:.8'; h.textContent = `${FLOORS[s.floor].bn} · ${FLOORS[s.floor].dept}`; shopsEl.appendChild(h); }
    const b = document.createElement('button');
    b.textContent = s.category.bn; b.style.setProperty('--c', '#' + s.category.color.toString(16).padStart(6, '0'));
    b.onclick = () => { overview = false; mall.roof.visible = true; pos.set(s.viewPos.x, s.viewPos.y, s.viewPos.z); yaw = s.yaw; pitch = 0; };
    shopsEl.appendChild(b);
  }
  const inter = new MallInteraction(cam, renderer.domElement, mall.pickables, (p) => {
    tip.style.display = p ? 'block' : 'none';
    if (p) tip.innerHTML = `<b>${p.title}</b>${p.url ? `<i>${p.sub}</i><br><small>ক্লিক করুন → অর্ডার পেজ নতুন ট্যাবে খুলবে</small>` : `<small>${p.sub}</small>`}`;
  });
  inter.blockers = mall.blockers;
  const goTo = (x: number, y: number, z: number, yw: number) => { overview = false; mall.roof.visible = true; inter.maxDist = 14; pos.set(x, y, z); yaw = yw; pitch = 0; };
  const q = ui.querySelector('#q') as HTMLInputElement, res = ui.querySelector('#res') as HTMLElement;
  q.addEventListener('keydown', (e) => e.stopPropagation());
  q.addEventListener('input', () => {
    res.innerHTML = ''; const v = q.value.trim().toLowerCase(); if (!v) return;
    mall.items.filter((i) => (i.product.name + i.category.bn + i.category.en).toLowerCase().includes(v)).slice(0, 8).forEach((i) => {
      const b = document.createElement('button'); b.textContent = `${i.product.name} — ৳ ${i.product.price.toLocaleString('bn-BD')}`;
      b.style.setProperty('--c', '#' + i.category.color.toString(16).padStart(6, '0')); b.onclick = () => goTo(i.viewPos.x, i.viewPos.y, i.viewPos.z, i.yaw); res.appendChild(b);
    });
  });
  const mini = (ui.querySelector('#mini') as HTMLCanvasElement).getContext('2d')!;
  const curFloor = () => Math.max(0, Math.min(mall.floors.length - 1, Math.floor((pos.y + 0.3) / 5)));
  const MK = 170 / Math.max(MALL_EXTENT.x1 - MALL_EXTENT.x0, MALL_EXTENT.z1 - MALL_EXTENT.z0);
  const drawMini = () => {
    const X = (x: number) => 5 + (x - MALL_EXTENT.x0) * MK, Z = (z: number) => 5 + (z - MALL_EXTENT.z0) * MK;
    mini.clearRect(0, 0, 180, 180); mini.fillStyle = '#e5e7eb'; mini.beginPath();
    MALL_BUILDING_LOCAL.forEach(([x, z], i) => (i ? mini.lineTo(X(x), Z(z)) : mini.moveTo(X(x), Z(z)))); mini.closePath(); mini.fill();
    mini.fillStyle = 'rgba(15,23,42,0.85)'; mini.beginPath(); mini.arc(X(0), Z(0), MALL_ATRIUM_R * MK, 0, 7); mini.fill(); // the atrium
    mini.fillStyle = '#f97316'; mini.font = '12px sans-serif'; mini.fillText(String(curFloor()), 8, 16);
    mini.fillStyle = '#ef4444'; mini.beginPath(); mini.arc(X(pos.x), Z(pos.z), 4, 0, 7); mini.fill();
    mini.strokeStyle = '#ef4444'; mini.lineWidth = 2; mini.beginPath(); mini.moveTo(X(pos.x), Z(pos.z)); mini.lineTo(X(pos.x - Math.sin(yaw) * 12), Z(pos.z - Math.cos(yaw) * 12)); mini.stroke();
  };

  // ---- input ----
  const keys = new Set<string>();
  addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'KeyO') { overview = !overview; mall.roof.visible = !overview; inter.maxDist = overview ? 400 : 14; if (overview) document.exitPointerLock(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  renderer.domElement.addEventListener('click', () => {
    if (inter.click()) return;
    if (!overview) void renderer.domElement.requestPointerLock();
  });
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0022, -1.4, 1.4);
  });
  addEventListener('resize', () => {
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  });

  const blocked = (x: number, z: number) =>
    mall.solids.some((r) => x > r.minX - R && x < r.maxX + R && z > r.minZ - R && z < r.maxZ + R && pos.y + 1.7 > r.minY + 0.05 && pos.y + 0.6 < r.maxY) ||
    mall.floorSolids[curFloor()].some((r) => x > r.minX - R && x < r.maxX + R && z > r.minZ - R && z < r.maxZ + R) || // the columns of the floor you are on
    mall.rampRails.some((r) => Math.abs(x - r.cx) < r.hx * Math.cos(r.rotZ) && Math.abs(z - r.cz) < r.hz + R && Math.abs(pos.y + 1 - (r.cy + (x - r.cx) * Math.tan(r.rotZ))) < 1.1);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!overview) {
      const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const r = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const v = (keys.has('ShiftLeft') ? 8 : 4.2) * dt;
      const nx = pos.x + (-Math.sin(yaw) * f + Math.cos(yaw) * r) * v, nz = pos.z + (-Math.cos(yaw) * f - Math.sin(yaw) * r) * v;
      if (!blocked(nx, pos.z)) pos.x = nx;
      if (!blocked(pos.x, nz)) pos.z = nz;
      pos.y += (mall.surfaceAt(pos.x, pos.z, pos.y) - pos.y) * Math.min(1, dt * 14); // walk up / down the ramps, drop through the atrium
      cam.position.set(pos.x, pos.y + EYE, pos.z);
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
    } else {
      cam.position.set(0, 420, 380); cam.lookAt(0, 10, 0);
    }
    mall.fixtureGroups.forEach((g, i) => { g.visible = i === curFloor(); });
    mall.update(dt);
    drawMini();
    inter.update();
    renderer.render(scene, cam);
  });
}
