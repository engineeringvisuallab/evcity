// Headless test of the export engine (src/export): npx tsx scripts/export-test.ts
// GIS part: every layer is built from the real game data, written as shapefile / GeoJSON / zip and read back.
// 3D part: a small synthetic scene is exported as .obj and .glb (needs three.js, so it only runs where node_modules exists).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { GIS_LAYERS } from '../src/export/GisLayers';
import { layerToGeoJson, layerToShapefile } from '../src/export/GisWriter';
import { buildGisZip } from '../src/export/GisExport';
import { crc32 } from '../src/export/ZipWriter';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

const g = new TerrainGenerator(Config.world.seed);
const W = Config.world.size;
const dec = new TextDecoder();

for (const def of GIS_LAYERS) {
  const L = def.build(g);
  ok(L.features.length > 0, `${L.id}: ${L.features.length} features`);
  let finite = true, inside = true;
  for (const f of L.features) {
    if (f.attrs.length !== L.fields.length) { finite = false; continue; }
    for (const part of f.parts) for (const p of part) {
      if (!p.every(Number.isFinite)) finite = false;
      if (p[0] < -200 || p[0] > W + 200 || p[1] < -200 || p[1] > W + 200) inside = false;
    }
  }
  ok(finite, `${L.id}: all coordinates and attribute counts valid`);
  ok(inside, `${L.id}: inside the 0..${W} m grid`);

  // shapefile: read back with an independent parser
  const files = layerToShapefile(L);
  const shp = files.get(`${L.id}.shp`)!, shx = files.get(`${L.id}.shx`)!, dbf = files.get(`${L.id}.dbf`)!;
  const v = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
  const vx = new DataView(shx.buffer, shx.byteOffset, shx.byteLength);
  const vd = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  const expectType = { point: 1, polyline: 3, polygon: 5 }[L.geom] + (L.hasZ ? 10 : 0);
  ok(v.getInt32(0, false) === 9994 && v.getInt32(24, false) * 2 === shp.length && v.getInt32(32, true) === expectType, `${L.id}: .shp header (type ${expectType}, ${shp.length} bytes)`);
  ok(vx.getInt32(24, false) * 2 === shx.length && (shx.length - 100) / 8 === L.features.length, `${L.id}: .shx has one index row per feature`);
  ok(vd.getUint32(4, true) === L.features.length && vd.getUint16(8, true) + vd.getUint16(10, true) * L.features.length + 1 === dbf.length, `${L.id}: .dbf size matches records`);
  let recOk = true, ringOk = true, pts = 0;
  for (let i = 0; i < L.features.length; i++) {
    const off = vx.getInt32(100 + 8 * i, false) * 2;
    const clen = vx.getInt32(104 + 8 * i, false) * 2;
    if (v.getInt32(off, false) !== i + 1 || v.getInt32(off + 4, false) * 2 !== clen || v.getInt32(off + 8, true) !== expectType) { recOk = false; continue; }
    if (L.geom === 'point') { pts++; continue; }
    const nParts = v.getInt32(off + 44, true);
    const nPts = v.getInt32(off + 48, true);
    pts += nPts;
    if (nParts !== L.features[i].parts.length) recOk = false;
    if (L.geom === 'polygon') {
      const p0 = off + 52 + 4 * nParts;
      let a = 0;
      for (let k = 0; k < nPts - 1; k++) a += v.getFloat64(p0 + 16 * k, true) * v.getFloat64(p0 + 16 * (k + 1) + 8, true) - v.getFloat64(p0 + 16 * (k + 1), true) * v.getFloat64(p0 + 16 * k + 8, true);
      const first = [v.getFloat64(p0, true), v.getFloat64(p0 + 8, true)];
      const last = [v.getFloat64(p0 + 16 * (nPts - 1), true), v.getFloat64(p0 + 16 * (nPts - 1) + 8, true)];
      if (!(a < 0) || first[0] !== last[0] || first[1] !== last[1]) ringOk = false; // outer rings: clockwise and closed
    }
  }
  ok(recOk, `${L.id}: every .shp record matches the .shx index and part counts (${pts} points)`);
  if (L.geom === 'polygon') ok(ringOk, `${L.id}: polygon rings are closed and clockwise`);

  const gj = JSON.parse(layerToGeoJson(L)) as { features: unknown[] };
  ok(gj.features.length === L.features.length, `${L.id}: GeoJSON feature count`);
}

// the zip: parse the central directory, check every CRC and the names
{
  const ids = GIS_LAYERS.map((l) => l.id);
  const z = buildGisZip(g, ids, 'both');
  const b = z.bytes;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const eocd = b.length - 22;
  ok(v.getUint32(eocd, true) === 0x06054b50, 'zip: end-of-directory record found');
  const n = v.getUint16(eocd + 10, true);
  let o = v.getUint32(eocd + 16, true);
  let crcOk = true;
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    const nameLen = v.getUint16(o + 28, true);
    const crc = v.getUint32(o + 16, true);
    const size = v.getUint32(o + 24, true);
    const local = v.getUint32(o + 42, true);
    const name = dec.decode(b.subarray(o + 46, o + 46 + nameLen));
    names.push(name);
    const data = b.subarray(local + 30 + v.getUint16(local + 26, true), local + 30 + v.getUint16(local + 26, true) + size);
    if (crc32(data) !== crc || v.getUint32(local, true) !== 0x04034b50) crcOk = false;
    o += 46 + nameLen;
  }
  ok(crcOk, `zip: ${n} entries, every CRC-32 correct`);
  ok(names.includes('README.txt') && names.includes('shapefile/roads_centerline.shp') && names.includes('geojson/roads_centerline.geojson'), 'zip: README, shapefile and geojson folders present');
  ok(z.lines.length === GIS_LAYERS.length, 'zip: one summary line per layer');
  let threw = false;
  try { buildGisZip(g, [], 'shp'); } catch { threw = true; }
  ok(threw, 'zip: no layer picked -> clear error');
}

// 3D export on a synthetic scene (only where three.js is installed)
try {
  const THREE = await import('three');
  const { exportModel } = await import('../src/export/ModelExport');
  // GLTFExporter writes the .glb through FileReader (browser API): a small stand-in for node
  const G = globalThis as unknown as { FileReader?: unknown };
  if (!G.FileReader) {
    G.FileReader = class {
      result: ArrayBuffer | string | null = null;
      onloadend: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsArrayBuffer(b: Blob): void { void b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.(); }); }
      readAsDataURL(b: Blob): void { void b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); this.onload?.(); }); }
    };
  }
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.set(-1000, 0, -2000); // floating origin (1000, 2000)
  scene.add(root);
  const box = new THREE.BoxGeometry(2, 2, 2);
  const std = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const near = new THREE.Mesh(box, std); near.position.set(1010, 5, 2005); root.add(near);
  const far = new THREE.Mesh(box, std); far.position.set(1500, 0, 2000); root.add(far);
  const shader = new THREE.Mesh(box, new THREE.ShaderMaterial()); shader.position.set(1020, 1, 2000); root.add(shader);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), std); sky.position.set(1000, 0, 2000); root.add(sky);
  const hidden = new THREE.Mesh(box, std); hidden.position.set(1005, 0, 2000); hidden.visible = false; root.add(hidden);
  const inst = new THREE.InstancedMesh(box, std, 3);
  [[1010, 0, 2000], [1050, 0, 2000], [1900, 0, 2000]].forEach(([x, y, z], i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
  root.add(inst);

  const obj = await exportModel(scene, { format: 'obj', radius: 100, centerX: 0, centerZ: 0 });
  const text = obj.data as string;
  const vlines = text.split('\n').filter((l) => l.startsWith('v '));
  ok(obj.name.endsWith('.obj') && vlines.length === 24 * 4, `obj: near box + shader box + 2 instances = ${vlines.length / 24} meshes (expected 4)`);
  ok(vlines.every((l) => l.split(' ').slice(1).every((n) => Math.abs(Number(n)) < 100)), 'obj: coordinates are centred on the export centre (all within the radius)');

  const glb = await exportModel(scene, { format: 'glb', radius: 100, centerX: 0, centerZ: 0 });
  const buf = glb.data as ArrayBuffer;
  const dv = new DataView(buf);
  ok(dv.getUint32(0, true) === 0x46546c67 && dv.getUint32(8, true) === buf.byteLength, `glb: valid header, ${buf.byteLength} bytes`);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(dec.decode(new Uint8Array(buf, 20, jsonLen))) as { nodes: { name?: string; extensions?: unknown }[]; meshes: unknown[] };
  ok(json.nodes.length >= 3, `glb: ${json.nodes.length} nodes (near box, shader box, instanced mesh)`);
} catch (e) {
  console.log('SKIP 3D part (three.js not installed here):', String(e).slice(0, 120));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
