import * as fs from 'fs';
import { Config } from '../src/core/Config';
import { TerrainGenerator } from '../src/terrain/TerrainGenerator';
import { buildJunctionRegistry } from '../src/roads/JunctionRegistry';
import { buildAutoJunction, AUTO } from '../src/roads/JunctionAuto';
import { buildAutoPadMesh, AUTO_LIFT } from '../src/roads/JunctionAutoMesh';
import { pointInOutline } from '../src/roads/JunctionAutoTerrain';
// AUTO CONNECT AT GRADE, A-5 (headless, no three.js): the pad mesh + the terrain carve of the 2 pilots, flag ON, compared with the same game with the flag OFF.
// Run: node --experimental-transform-types --import ./scripts/reg.mjs scripts/junction-auto-mesh-check.ts docs [JNxxx JNyyy]  -> docs/STEPA5_OUTPUT.txt
const out = process.argv[2] ?? 'docs';
const ids = process.argv.length > 3 ? process.argv.slice(3) : [...Config.roads.autoJunction.ids];
const lines: string[] = [];
let fails = 0;
const P = (s: string): void => { lines.push(s); console.log(s); };
const T = (name: string, ok: boolean, text: string): void => { if (!ok) fails++; P(`  [${ok ? 'PASS' : 'FAIL'}] ${name}: ${text}`); };
const f2 = (v: number): string => v.toFixed(2);
const tmp: any = { h: 0, water: NaN, fx: 0, fz: 0 };
const hash = (roads: any[]): string => { let h = 0; for (const r of roads) for (let i = 0; i < r.xs.length; i++) h = (h * 31 + Math.round(r.xs[i] * 100) + 7 * Math.round(r.zs[i] * 100) + 13 * Math.round(r.ys[i] * 100)) | 0; return String(h); };

P('AUTO CONNECT AT GRADE, A-5 / A-5c: pad mesh + terrain carve + roundabout markings (' + ids.length + ' junctions: ' + ids.join(', ') + ')');
// ---- game with the flag OFF (baseline)
Config.roads.autoJunction.enabled = false;
const g0: any = new TerrainGenerator(Config.world.seed);
T('flag OFF: no auto pads', g0.roads.autoPads === null, 'RoadNetwork.autoPads is ' + (g0.roads.autoPads === null ? 'null' : 'NOT null'));
const hash0 = hash(g0.roads.roads);
// ---- game with the flag ON
Config.roads.autoJunction.enabled = true;
Config.roads.autoJunction.ids = ids;
const g1: any = new TerrainGenerator(Config.world.seed);
const net = g1.roads;
for (const a of net.autoInfo) P(`  ${a.id}: ${a.built ? 'built' : 'NOT built'} (${a.why})`);
const terr = net.autoPads;
T('flag ON: both pilots built', !!terr && terr.count === ids.length, `${terr ? terr.count : 0} pads of ${ids.length}`);
T('road data identical (flag ON vs OFF)', hash(net.roads) === hash0, `hash ${hash0} / ${hash(net.roads)} (no road point moved by the pads)`);
if (!terr) { fs.writeFileSync(`${out}/STEPA5_OUTPUT.txt`, lines.join('\n') + '\n'); process.exit(1); }

// the engine run again on the FINAL roads must give the same pad as the game built (stale-height check)
const reg = buildJunctionRegistry(net.roads);
const others = reg.nodes.map((n: any) => ({ id: n.id, x: n.x, z: n.z }));
const ground = (x: number, z: number): { h: number; water: boolean } => { g1.sampleGround(x, z, tmp); return { h: tmp.h, water: !Number.isNaN(tmp.water) }; };
const o: any = { w: 0, y: 0, inside: false };
for (let i = 0; i < terr.count; i++) {
  const pad = terr.padAt(i);
  P(`--- ${pad.id} ${pad.type}, area ${f2(pad.area)} m2, ${pad.legs.length} legs`);
  const node = reg.nodes.find((n: any) => n.id === pad.id);
  const again = buildAutoJunction({ node, roads: net.roads, others, ground });
  T('pad equals the engine on the final roads', again.pass && Math.abs(again.plane.y0 - pad.plane.y0) < 1e-6 && again.outline.length === pad.outline.length, `plane y0 ${f2(pad.plane.y0)} / ${f2(again.plane.y0)}`);

  // ---- mesh
  const t0 = Date.now();
  const m = buildAutoPadMesh(i, terr);
  const nV = m.positions.length / 3;
  let bad = 0; for (const v of m.positions) if (!Number.isFinite(v)) bad++;
  let oob = 0; for (const k of m.indices) if (k < 0 || k >= nV) oob++;
  T('mesh numbers', bad === 0 && oob === 0 && m.indices.length % 3 === 0 && m.indices.length / 3 === m.stats.tris, `${nV} vertices, ${m.stats.tris} triangles (surface ${m.stats.surfaceTris}, kerb ${m.stats.kerbTris}, marks ${m.stats.markTris}, island ${m.stats.islandTris}), ${Date.now() - t0} ms, ${bad} bad numbers, ${oob} bad indices`);
  T('mesh has every part', m.stats.surfaceTris > 0 && m.stats.kerbTris > 0 && (pad.markings.length === 0 || m.stats.markTris > 0) && (pad.ring ? m.stats.islandTris > 0 : true), `surface, kerbs${pad.markings.length ? ', marks' : ''}${pad.ring ? ', island' : ''} present`);
  if (pad.ring) {
    // A-5c: every leg of a roundabout has a give-way line and a zebra; the line lies on the pad, outside the ring, the zebra is one car length behind it
    const stops = pad.markings.filter((q: any) => q.kind === 'stop'), zebras = pad.markings.filter((q: any) => q.kind === 'zebra');
    T('roundabout markings: give-way line + zebra on every leg', stops.length === pad.legs.length && zebras.length === pad.legs.length, `${stops.length} give-way lines, ${zebras.length} zebras, ${pad.legs.length} legs`);
    let worst = 1e9, onPad = 0;
    for (const q of stops as any[]) { worst = Math.min(worst, Math.min(Math.hypot(q.p0[0] - pad.x, q.p0[1] - pad.z), Math.hypot(q.p1[0] - pad.x, q.p1[1] - pad.z)) - pad.ring.outerR); if (pointInOutline(pad.outline, q.p0[0], q.p0[1]) && pointInOutline(pad.outline, q.p1[0], q.p1[1])) onPad++; }
    T('give-way lines: outside the ring, inside the pad', worst >= AUTO.rbGiveWayGap - 0.01 && onPad === stops.length, `closest line ${f2(worst)} m outside the ring edge (aim ${AUTO.rbGiveWayGap} m), ${onPad} of ${stops.length} lines inside the pad outline`);
  }
  T('mesh size', m.stats.tris < 20000, `${m.stats.tris} triangles (limit 20000 per pad)`);
  // winding: surface triangles face up
  let down = 0, up = 0;
  for (let k = 0; k < m.stats.surfaceTris; k++) {
    const a = m.indices[k * 3], b = m.indices[k * 3 + 1], c = m.indices[k * 3 + 2];
    const ny = (m.positions[b * 3 + 2] - m.positions[a * 3 + 2]) * (m.positions[c * 3] - m.positions[a * 3]) - (m.positions[b * 3] - m.positions[a * 3]) * (m.positions[c * 3 + 2] - m.positions[a * 3 + 2]);
    if (ny >= 0) up++; else down++;
  }
  void up;
  T('surface faces up', down === 0, `${down} surface triangles face down`);
  // ---- surface vs terrain. The first surfaceTris * 3 vertices are the asphalt. Off the leg corridors (3 m margin) it lies exactly AUTO_LIFT above the carved terrain;
  // inside a corridor it may rise above that (never below) because it follows the old ribbon, by at most the step limit 0.15 m + 0.02.
  let maxOff = 0, nOff = 0, minIn = 1e9, maxIn = -1e9, nIn = 0;
  for (let v = 0; v < m.stats.surfaceTris * 3; v += 2) {
    const x = m.positions[v * 3], y = m.positions[v * 3 + 1], z = m.positions[v * 3 + 2];
    g1.sample(x, z, tmp);
    const d = y - (tmp.h + AUTO_LIFT);
    let inCorr = false;
    for (const l of pad.legs) { const s = (x - l.q[0]) * l.u[0] + (z - l.q[1]) * l.u[1], lat = (x - l.q[0]) * l.n[0] + (z - l.q[1]) * l.n[1]; if (s >= -3 && s <= l.trim + 5 && Math.abs(lat) < l.halfW + 3) inCorr = true; }
    if (inCorr) { nIn++; minIn = Math.min(minIn, d); maxIn = Math.max(maxIn, d); } else { nOff++; maxOff = Math.max(maxOff, Math.abs(d)); }
  }
  T('asphalt lies on the carved terrain (off the corridors)', nOff >= 10 && maxOff < 0.005, `${nOff} asphalt vertices: biggest gap to terrain + ${AUTO_LIFT} m = ${maxOff.toFixed(4)} m (limit 0.005)`);
  T('asphalt never below the terrain, follows the old ribbon in the corridors', nIn === 0 || (minIn > -0.005 && maxIn < 0.17), `${nIn} vertices in the leg corridors: from ${minIn.toFixed(3)} to +${maxIn.toFixed(3)} m above terrain + ${AUTO_LIFT} m (limit -0.005 .. +0.17)`);
  // ---- pad meets every road end
  for (const l of pad.legs) {
    const lv = terr.levelOf(i, l.endXZ[0], l.endXZ[1]);
    g1.sample(l.endXZ[0], l.endXZ[1], tmp);
    T(`leg ${l.name} end level`, Math.abs(lv - l.endY) < 0.02 && Math.abs(tmp.h - l.endY) < 0.15, `pad level ${f2(lv)} m, road ${f2(l.endY)} m, terrain ${f2(tmp.h)} m (step ${f2(lv - l.endY)} m)`);
  }
  // ---- terrain continuity across the skirt: no step above 0.5 m between points 0.5 m apart, along 4 rays from the centre outwards
  let maxStep = 0, maxStep0 = 0;
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * 2 * Math.PI;
    let prev: number | null = null, prev0: number | null = null;
    for (let r = 0; r < 70; r += 0.5) {
      const x = pad.x + r * Math.cos(ang), z = pad.z + r * Math.sin(ang);
      g1.sample(x, z, tmp);
      if (prev !== null) maxStep = Math.max(maxStep, Math.abs(tmp.h - prev));
      prev = tmp.h;
      g0.sample(x, z, tmp);
      if (prev0 !== null) maxStep0 = Math.max(maxStep0, Math.abs(tmp.h - prev0));
      prev0 = tmp.h;
    }
  }
  T('terrain skirt is smooth', maxStep < 0.5 || maxStep <= maxStep0 + 0.05, `biggest height step between points 0.5 m apart on 16 rays 0..70 m: ${f2(maxStep)} m with the pad, ${f2(maxStep0)} m without it (a step that is also there without the pad is old terrain, not the skirt)`);
  // ---- flag OFF vs ON: the terrain changes only near the pad
  const R = Math.hypot(...pad.outline.map((q) => Math.hypot(q[0] - pad.x, q[1] - pad.z)).slice(0, 0).concat([0, 0])) + Math.max(...pad.outline.map((q) => Math.hypot(q[0] - pad.x, q[1] - pad.z))) + terr.emb;
  let farChanged = 0, nearChanged = 0, far = 0;
  for (let k = 0; k < 4000; k++) {
    const ang = Math.random() * 2 * Math.PI, rr = Math.random() * (R + 150);
    const x = pad.x + rr * Math.cos(ang), z = pad.z + rr * Math.sin(ang);
    g0.sample(x, z, tmp); const h0 = tmp.h;
    g1.sample(x, z, tmp);
    const d = Math.abs(tmp.h - h0);
    let nearOther = false;
    for (let j = 0; j < terr.count; j++) if (j !== i) { const q = terr.padAt(j); if (Math.hypot(x - q.x, z - q.z) < 90) nearOther = true; }
    if (nearOther) continue; // another pad's carve may be here
    if (rr > R + 8) { far++; if (d > 1e-9) farChanged++; } else if (d > 1e-6) nearChanged++;
  }
  T('flag OFF vs ON: terrain far from the pad identical', farChanged === 0, `${far} random points beyond ${f2(R + 8)} m from the centre: ${farChanged} changed; ${nearChanged} of the points nearer changed (the carve)`);
}
// ---- A-5c part 2: ribbon trim (flag ON, Config.roads.autoJunction.trimRibbon true = default) compared with the same game with trimRibbon false
{
  const n1: any = net;
  const tp = terr.trimmedPoints(net.roads);
  let still = 0, straddle = 0, maxStr = 0, total1 = 0;
  for (const [, list] of n1.chunkSegs as Map<string, number[]>) {
    total1 += list.length;
    for (const sg of list) {
      const road = net.roads[n1.segRoad[sg]]; const set = tp.get(road.id); if (!set) continue;
      const i = n1.segPt[sg], j = (i + 1) % road.xs.length;
      if (set.has(i) && set.has(j)) still++;
      else if (set.has(i) || set.has(j)) { straddle++; maxStr = Math.max(maxStr, Math.hypot(road.xs[j] - road.xs[i], road.zs[j] - road.zs[i])); }
    }
  }
  T('ribbon trim: segments removed', net.autoTrimmed > 0, `${net.autoTrimmed} ribbon segments of the leg roads lie inside the ${terr.count} pad outlines and get no ribbon`);
  T('ribbon trim: no kept segment is fully inside a pad', still === 0, `${still} kept segments have both points inside a pad outline`);
  T('ribbon trim: the segment at the trim end stays', straddle > 0 && maxStr < 25, `${straddle} segments cross a pad outline and stay (longest ${f2(maxStr)} m, so the ribbon ends inside the pad by less than that)`);
  Config.roads.autoJunction.trimRibbon = false;
  const g2: any = new TerrainGenerator(Config.world.seed);
  Config.roads.autoJunction.trimRibbon = true;
  let total2 = 0; for (const [, list] of g2.roads.chunkSegs as Map<string, number[]>) total2 += list.length;
  T('ribbon trim: only the covered segments differ', total2 - total1 === net.autoTrimmed && g2.roads.autoTrimmed === 0, `ribbon segments ${total2} without trim, ${total1} with trim, difference ${total2 - total1} = removed ${net.autoTrimmed}`);
  T('ribbon trim: road data identical', hash(g2.roads.roads) === hash(net.roads) && hash(net.roads) === hash0, `hash ${hash(net.roads)} (no road point moved by the trim)`);
  let dt = 0; for (let k = 0; k < 3000; k++) { const q = terr.padAt(k % terr.count); const x = q.x + (Math.random() - 0.5) * 300, z = q.z + (Math.random() - 0.5) * 300; g1.sample(x, z, tmp); const a = tmp.h; g2.sample(x, z, tmp); dt = Math.max(dt, Math.abs(a - tmp.h)); }
  T('ribbon trim: terrain identical with and without trim', dt < 1e-9, `3000 random points near the pads, biggest height difference ${dt.toExponential(1)} m`);
  T('flag OFF: nothing trimmed', g0.roads.autoTrimmed === 0, `autoTrimmed ${g0.roads.autoTrimmed} with the flag OFF`);
}
// ---- the old junction pads must not overlap an auto pad
let minGap = 1e18;
for (let i = 0; i < terr.count; i++) { const p = terr.padAt(i); for (const q of net.pads) minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.z - q.z) - q.rCore - Math.max(...p.outline.map((w: number[]) => Math.hypot(w[0] - p.x, w[1] - p.z)))); }
T('no old junction pad overlaps an auto pad', net.pads.length === 0 || minGap > 0, `${net.pads.length} old pads, smallest gap ${net.pads.length ? f2(minGap) : 'n/a'} m`);
P(`RESULT ${fails === 0 ? 'ALL PASS' : fails + ' FAIL'}`);
fs.writeFileSync(`${out}/STEPA5_OUTPUT.txt`, lines.join('\n') + '\n');
if (fails) process.exit(1);
