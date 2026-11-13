// Browser-side wrapper of the REAL 3D export: builds the geometry from the game data (RealModel) and writes it as .glb or .obj (MeshWriters).
import type { TerrainGenerator } from '../terrain/TerrainGenerator';
import { MAX_REAL_VERTS, buildRealModel, type RealModelOptions } from './RealModel';
import { glbFromParts, objFromParts } from './MeshWriters';
import type { ModelExportResult, ModelFormat } from './ModelExport';

/** Above this many vertices an .obj text file gets unreasonably large: use .glb. */
export const MAX_OBJ_VERTS = 1_500_000;

export function exportRealModel(gen: TerrainGenerator, o: RealModelOptions, format: ModelFormat): ModelExportResult {
  const whole = o.radius >= 5000;
  const opts: RealModelOptions = whole ? { ...o, centerX: 0, centerZ: 0 } : o;
  const m = buildRealModel(gen, opts);
  if (!m.parts.length) throw new Error('এই এলাকায় এক্সপোর্ট করার মতো কিছু পাওয়া যায়নি');
  if (format === 'obj' && m.stats.vertices > MAX_OBJ_VERTS) {
    throw new Error(`OBJ-এর জন্য খুব বড় (${Math.round(m.stats.vertices / 1000)} হাজার ভার্টেক্স): GLB বাছুন, অথবা এলাকা/মান কমান`);
  }
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const info = [
    `${m.stats.chunks} টি চাঙ্ক (${m.stats.areaKm2.toFixed(1)} বর্গকিমি), ${Math.round(m.stats.vertices / 1000)} হাজার ভার্টেক্স, ${Math.round(m.stats.triangles / 1000)} হাজার ত্রিভুজ`,
    `অংশ: ${m.parts.map((p) => p.name).join(', ')}`,
    whole ? 'কেন্দ্র: ম্যাপের মাঝখান (০,০); একক: মিটার' : 'কেন্দ্র: তোমার জায়গা; একক: মিটার, x পূর্ব, y উপর, z দক্ষিণ',
  ];
  if (format === 'obj') {
    return { name: `evcity_real3d_${stamp}.obj`, data: new Blob(objFromParts(m.parts), { type: 'text/plain' }), mime: 'text/plain', info };
  }
  return { name: `evcity_real3d_${stamp}.glb`, data: glbFromParts(m.parts) as unknown as BlobPart, mime: 'model/gltf-binary', info };
}

export { MAX_REAL_VERTS };
