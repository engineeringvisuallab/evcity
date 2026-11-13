// Headless test of the export engine (src/export): npx tsx scripts/export-test.ts
// GIS part: every layer is built from the real game data, written as shapefile / GeoJSON / zip and read back.
// 3D part: a small synthetic scene is exported as .obj and .glb (needs three.js, so it only runs where node_modules exists).
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { Config } from '../src/core/Config';
import { GIS_LAYERS } from '../src/export/GisLayers';
import { layerToGeoJson, layerToShapefile } from '../src/export/GisWriter';
import { buildGisZip } from '../src/export/GisExport';
import { crc32 } from '../src/export/ZipWriter';
import { ALL_REAL_LAYERS, buildRealModel, type MeshPart } from '../src/export/RealModel';
import { glbFromParts, objFromParts } from '../src/export/MeshWriters';
import { BUILDING_PLACEMENTS } from '../src/buildings/Placements';

let fails = 0;
const ok = (c: boolean, msg: string) => {
  console.log((c ? 'PASS ' : 'FAIL ') + msg);
  if (!c) fails++;
};

const g = new TerrainGenerator(Config.world.seed);
const W = Config.world.size;
const dec = new TextDecoder();
// what the game hands in at run time (the building registry and the lamp planner need three.js): a stand-in for the building floors, no lamps
const ctx = { buildingFloors: () => 3 };

for (const def of GIS_LAYERS) {
  const L = def.build(g, ctx);
  ok(L.features.length > 0 || !!def.optional, `${L.id}: ${L.features.length} features`);
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
  const expectType = { point: 1, polyline: 3, polygon: 5, multipatch: 31 }[L.geom] + (L.hasZ && L.geom !== 'multipatch' ? 10 : 0);
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
      for (let part = 0; part < nParts; part++) {
        const a0 = v.getInt32(off + 52 + 4 * part, true);
        const a1 = part + 1 < nParts ? v.getInt32(off + 52 + 4 * (part + 1), true) : nPts;
        let a = 0;
        for (let k = a0; k < a1 - 1; k++) a += v.getFloat64(p0 + 16 * k, true) * v.getFloat64(p0 + 16 * (k + 1) + 8, true) - v.getFloat64(p0 + 16 * (k + 1), true) * v.getFloat64(p0 + 16 * k + 8, true);
        const closed = v.getFloat64(p0 + 16 * a0, true) === v.getFloat64(p0 + 16 * (a1 - 1), true) && v.getFloat64(p0 + 16 * a0 + 8, true) === v.getFloat64(p0 + 16 * (a1 - 1) + 8, true);
        if (!(a < 0) || !closed) ringOk = false; // every ring: clockwise and closed
      }
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
  const z = buildGisZip(g, ids, 'both', ctx);
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

// REAL 3D from game data (pure, no three.js): terrain, water, road ribbon, rail, port, medians, footpaths, building blocks
{
  const b0 = BUILDING_PLACEMENTS[0];
  const checkParts = (tag: string, parts: MeshPart[], stats: { vertices: number; triangles: number }, maxAbs: number): void => {
    let okIdx = true, finite = true, within = true, nv = 0, nt = 0;
    for (const p of parts) {
      const v = p.positions.length / 3;
      nv += v;
      nt += p.indices.length / 3;
      for (const i of p.indices) if (i >= v) okIdx = false;
      for (let i = 0; i < p.positions.length; i++) {
        if (!Number.isFinite(p.positions[i]) || !Number.isFinite(p.normals[i])) finite = false;
        else if (i % 3 !== 1 && Math.abs(p.positions[i]) > maxAbs) within = false;
      }
      if (p.colors && p.colors.length !== p.positions.length) okIdx = false;
    }
    ok(okIdx && finite, `${tag}: every index in range, no NaN, normals/colours match`);
    ok(within, `${tag}: horizontal coordinates centred (all within ${maxAbs} m of the centre)`);
    ok(nv === stats.vertices && nt === stats.triangles, `${tag}: stats match (${nv} vertices, ${nt} triangles)`);
  };
  const checkGlb = (tag: string, parts: MeshPart[]): Uint8Array => {
    const glb = glbFromParts(parts);
    const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    const jl = dv.getUint32(12, true);
    const json = JSON.parse(dec.decode(glb.subarray(20, 20 + jl))) as {
      accessors: { bufferView: number; count: number; componentType: number; type: string; min?: number[]; max?: number[] }[];
      bufferViews: { byteOffset: number; byteLength: number }[];
      buffers: { byteLength: number }[];
      meshes: unknown[];
      materials: unknown[];
    };
    const binLen = dv.getUint32(20 + jl, true);
    ok(dv.getUint32(0, true) === 0x46546c67 && dv.getUint32(8, true) === glb.length && dv.getUint32(16, true) === 0x4e4f534a && dv.getUint32(24 + jl, true) === 0x004e4942, `${tag}: glb header + JSON + BIN chunk tags, length ${glb.length}`);
    ok((20 + jl) % 4 === 0 && binLen >= json.buffers[0].byteLength && binLen % 4 === 0, `${tag}: chunks 4-byte aligned, buffer ${json.buffers[0].byteLength} bytes`);
    let accOk = true;
    for (const a of json.accessors) {
      const bv = json.bufferViews[a.bufferView];
      const comps = { SCALAR: 1, VEC3: 3 }[a.type] ?? 0;
      if (bv.byteOffset % 4 !== 0 || bv.byteLength !== a.count * comps * 4 || bv.byteOffset + bv.byteLength > json.buffers[0].byteLength) accOk = false;
    }
    ok(accOk && json.meshes.length === parts.length && json.materials.length === parts.length, `${tag}: ${json.accessors.length} accessors fit their buffer views, ${parts.length} meshes / materials`);
    // POSITION min / max written to the file must equal the real extent of the first part
    const posAcc = json.accessors[0];
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < parts[0].positions.length; i += 3) { mn = Math.min(mn, parts[0].positions[i]); mx = Math.max(mx, parts[0].positions[i]); }
    ok(posAcc.min?.[0] === mn && posAcc.max?.[0] === mx, `${tag}: POSITION min/max in the file match the data`);
    // read the first vertex back from the BIN chunk
    const first = new Float32Array(glb.buffer.slice(glb.byteOffset + 28 + jl + json.bufferViews[0].byteOffset, glb.byteOffset + 28 + jl + json.bufferViews[0].byteOffset + 12));
    ok(first[0] === parts[0].positions[0] && first[1] === parts[0].positions[1] && first[2] === parts[0].positions[2], `${tag}: first vertex read back from the BIN chunk is identical`);
    return glb;
  };

  const t0 = Date.now();
  const hi = buildRealModel(g, { centerX: b0.x, centerZ: b0.z, radius: 300, quality: 'high', layers: ALL_REAL_LAYERS, buildingFloors: () => 3 });
  const names = hi.parts.map((p) => `${p.name}:${p.positions.length / 3}`).join(' ');
  ok(hi.parts.length >= 3 && hi.parts.some((p) => p.name === 'terrain'), `real-3D high around a building (${Date.now() - t0} ms): ${names}`);
  ok(hi.parts.some((p) => p.name === 'buildings'), 'real-3D: building blocks present near a placed building');
  checkParts('real-3D high', hi.parts, hi.stats, 1500);
  checkGlb('real-3D high', hi.parts);
  const objChunks = objFromParts(hi.parts);
  const obj = objChunks.join('');
  const vN = obj.split('\n').filter((l) => l.startsWith('v ')).length;
  const fN = obj.split('\n').filter((l) => l.startsWith('f ')).length;
  ok(vN === hi.stats.vertices && fN === hi.stats.triangles, `real-3D obj: ${vN} v lines and ${fN} f lines equal the mesh counts`);
  const maxIdx = Math.max(...obj.split('\n').filter((l) => l.startsWith('f ')).slice(0, 2000).flatMap((l) => l.split(' ').slice(1).map((t) => Number(t.split('//')[0]))));
  ok(maxIdx <= vN, 'real-3D obj: face indices point at existing vertices');

  // a road-heavy spot: where a road meets the middle of the map
  const r0 = g.roads.roads[0];
  const mid = Math.floor(r0.xs.length / 2);
  const roadsOnly = buildRealModel(g, { centerX: r0.xs[mid], centerZ: r0.zs[mid], radius: 200, quality: 'medium', layers: { ...ALL_REAL_LAYERS, terrain: false, water: false, buildings: false, rail: false, port: false } });
  ok(roadsOnly.parts.some((p) => p.name === 'roads') && roadsOnly.parts.some((p) => p.name === 'road_medians' || p.name === 'footpaths'), `real-3D roads-only on road ${r0.name}: ${roadsOnly.parts.map((p) => p.name).join(', ')}`);
  checkParts('real-3D roads', roadsOnly.parts, roadsOnly.stats, 1500);

  const t1 = Date.now();
  const whole = buildRealModel(g, { centerX: 0, centerZ: 0, radius: 5000, quality: 'low', layers: ALL_REAL_LAYERS, buildingFloors: () => 3 });
  ok(whole.stats.chunks === 400 && Math.abs(whole.stats.areaKm2 - 100) < 1e-6, `real-3D whole map: ${whole.stats.chunks} chunks, ${whole.stats.areaKm2} km2, ${whole.stats.vertices} vertices (${Date.now() - t1} ms)`);
  checkParts('real-3D whole map', whole.parts, whole.stats, 5200);
  const bigGlb = checkGlb('real-3D whole map', whole.parts);
  ok(whole.parts.some((p) => p.name === 'roads') && whole.parts.some((p) => p.name === 'railway'), `real-3D whole map has roads and railway (GLB ${(bigGlb.length / 1048576).toFixed(1)} MB)`);

  let threw = false;
  try { buildRealModel(g, { centerX: 0, centerZ: 0, radius: 5000, quality: 'high', layers: ALL_REAL_LAYERS }); } catch { threw = true; }
  ok(threw, 'real-3D whole map at HIGH quality -> clear "too big" error');
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
