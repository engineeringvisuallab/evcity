// STEP 9.2 J1 layer test: the layer builds one mesh + one solid when enabled, nothing when disabled, and disposes cleanly. Run: npx tsx scripts/m8-stack-layer-test.ts
import * as THREE from 'three';
import { StackInterchangeLayer } from '../src/interchange/m8/StackInterchangeLayer';

let fails = 0;
const chk = (ok: boolean, msg: string): void => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); };
const root = new THREE.Group();
const off = new StackInterchangeLayer(root, { enabled: false, x: 0, z: 0, y: 0, yaw: 0 });
chk(off.solids.length === 0 && root.children.length === 0, 'disabled: no mesh, no solid');
const on = new StackInterchangeLayer(root, { enabled: true, x: 1000, z: -500, y: 12, yaw: 0.5 }, () => 12);
chk(on.solids.length === 1 && root.children.length === 1, 'enabled: one mesh, one solid');
const s = on.solids[0];
chk(Math.hypot(s.cx - 1000, s.cz + 500) < 120, `solid centred at the crossing (${s.cx.toFixed(0)}, ${s.cz.toFixed(0)}), radius ${s.radius.toFixed(0)} m`);
chk(s.positions.length / 3 > 40000 && s.indices.length % 3 === 0, `${s.positions.length / 3} vertices, ${s.indices.length / 3} triangles`);
on.dispose();
chk(root.children.length === 0, 'dispose removes the group');
console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
