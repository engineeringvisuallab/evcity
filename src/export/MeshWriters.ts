// Writers for MeshPart lists (see RealModel.ts): .glb (glTF 2.0 binary) and .obj. Pure: no three.js, no DOM.
import type { MeshPart } from './RealModel';

const enc = new TextEncoder();

/** glTF 2.0 binary. One node + mesh + material per part; positions, normals, vertex colours (COLOR_0) and 32-bit indices. Units: metres, Y up. */
export function glbFromParts(parts: readonly MeshPart[], generator = 'EVCity export'): Uint8Array {
  const accessors: Record<string, unknown>[] = [];
  const views: Record<string, unknown>[] = [];
  const meshes: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const materials: Record<string, unknown>[] = [];
  const blobs: Uint8Array[] = [];
  let bytes = 0;
  const addView = (data: ArrayBufferView, target: number): number => {
    const u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    views.push({ buffer: 0, byteOffset: bytes, byteLength: u8.length, target });
    blobs.push(u8);
    bytes += u8.length; // every array is float32 / uint32, so offsets stay 4-byte aligned
    return views.length - 1;
  };
  const addAccessor = (view: number, componentType: number, count: number, type: string, extra: Record<string, unknown> = {}): number => {
    accessors.push({ bufferView: view, componentType, count, type, ...extra });
    return accessors.length - 1;
  };
  parts.forEach((p, i) => {
    const count = p.positions.length / 3;
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < p.positions.length; k += 3) {
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.positions[k + a]); hi[a] = Math.max(hi[a], p.positions[k + a]); }
    }
    if (!count) { lo = [0, 0, 0]; hi = [0, 0, 0]; }
    const attributes: Record<string, number> = {
      POSITION: addAccessor(addView(p.positions, 34962), 5126, count, 'VEC3', { min: lo, max: hi }),
      NORMAL: addAccessor(addView(p.normals, 34962), 5126, count, 'VEC3'),
    };
    if (p.colors) attributes.COLOR_0 = addAccessor(addView(p.colors, 34962), 5126, count, 'VEC3');
    const indices = addAccessor(addView(p.indices, 34963), 5125, p.indices.length, 'SCALAR');
    const alpha = p.alpha ?? 1;
    const base = p.colors ? [1, 1, 1] : p.baseColor ?? [0.6, 0.6, 0.6];
    materials.push({
      name: p.name,
      pbrMetallicRoughness: { baseColorFactor: [base[0], base[1], base[2], alpha], metallicFactor: 0, roughnessFactor: 0.95 },
      doubleSided: true,
      ...(alpha < 1 ? { alphaMode: 'BLEND' } : {}),
    });
    meshes.push({ name: p.name, primitives: [{ attributes, indices, material: i, mode: 4 }] });
    nodes.push({ name: p.name, mesh: i });
  });
  const json = {
    asset: { version: '2.0', generator },
    scene: 0,
    scenes: [{ name: 'EVCity', nodes: nodes.map((_, i) => i) }],
    nodes, meshes, materials, accessors, bufferViews: views,
    buffers: [{ byteLength: bytes }],
  };
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) { const t = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20); t.set(jsonBytes); jsonBytes = t; }
  const binPad = (4 - (bytes % 4)) % 4;
  const total = 12 + 8 + jsonBytes.length + 8 + bytes + binPad;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); // 'glTF'
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, jsonBytes.length, true);
  v.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  v.setUint32(o, bytes + binPad, true);
  v.setUint32(o + 4, 0x004e4942, true); // 'BIN'
  o += 8;
  for (const b of blobs) { out.set(b, o); o += b.length; }
  return out;
}

/** Wavefront OBJ (+ per-vertex colours as "v x y z r g b", understood by Blender and MeshLab). One object per part. Returns text chunks (join with new Blob). */
export function objFromParts(parts: readonly MeshPart[]): string[] {
  const chunks: string[] = ['# EVCity export: metres, x east, y up, z south\n'];
  let off = 1;
  for (const p of parts) {
    const n = p.positions.length / 3;
    const lines: string[] = [`o ${p.name}`];
    for (let i = 0; i < n; i++) {
      const c = p.colors ? ` ${p.colors[i * 3].toFixed(3)} ${p.colors[i * 3 + 1].toFixed(3)} ${p.colors[i * 3 + 2].toFixed(3)}` : '';
      lines.push(`v ${p.positions[i * 3].toFixed(3)} ${p.positions[i * 3 + 1].toFixed(3)} ${p.positions[i * 3 + 2].toFixed(3)}${c}`);
      if (lines.length > 50_000) { chunks.push(lines.join('\n') + '\n'); lines.length = 0; }
    }
    for (let i = 0; i < n; i++) {
      lines.push(`vn ${p.normals[i * 3].toFixed(3)} ${p.normals[i * 3 + 1].toFixed(3)} ${p.normals[i * 3 + 2].toFixed(3)}`);
      if (lines.length > 50_000) { chunks.push(lines.join('\n') + '\n'); lines.length = 0; }
    }
    for (let t = 0; t < p.indices.length; t += 3) {
      const a = p.indices[t] + off, b = p.indices[t + 1] + off, c = p.indices[t + 2] + off;
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
      if (lines.length > 50_000) { chunks.push(lines.join('\n') + '\n'); lines.length = 0; }
    }
    chunks.push(lines.join('\n') + '\n');
    off += n;
  }
  return chunks;
}
