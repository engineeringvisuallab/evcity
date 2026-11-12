// Draws every pattern as a top view SVG: docs/interchange-preview/<pattern>.svg. Run: npx tsx scripts/interchange-preview.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildInterchange, patternIds, type InterchangeModel, type RoadSection } from '../src/interchange';

const HIGHWAY: RoadSection = { roadId: 1, halfWidth: 12.7, kerbLane: 10.45, laneW: 3.5, lanesPerDir: 3, designKmh: 100 };
const AVENUE: RoadSection = { roadId: 2, halfWidth: 11.65, kerbLane: 9.525, laneW: 3.25, lanesPerDir: 3, designKmh: 40 };

function svg(m: InterchangeModel): string {
  const R = m.footprintR + 30;
  const px = 2; // px per metre
  const W = R * 2 * px;
  const X = (x: number): number => (x - m.spec.x + R) * px;
  const Z = (z: number): number => (z - m.spec.z + R) * px;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" font-family="sans-serif">`);
  out.push(`<rect width="${W}" height="${W}" fill="#e8dcc4"/>`);
  // the two roads (strips of 2 x halfWidth) along the local axes
  const strip = (sec: RoadSection, a: { x: number; z: number }, b: { x: number; z: number }, col: string): void => {
    out.push(`<line x1="${X(a.x)}" y1="${Z(a.z)}" x2="${X(b.x)}" y2="${Z(b.z)}" stroke="${col}" stroke-width="${sec.halfWidth * 2 * px}" stroke-linecap="butt"/>`);
  };
  const E = m.footprintR + 30;
  strip(m.spec.cross, m.toWorld(0, -E), m.toWorld(0, E), m.levels.upper === 'cross' ? '#7a7f87' : '#5d6168');
  strip(m.spec.main, m.toWorld(-E, 0), m.toWorld(E, 0), m.levels.upper === 'main' ? '#7a7f87' : '#5d6168');
  for (const z of m.zones) out.push(`<circle cx="${X(z.x)}" cy="${Z(z.z)}" r="${z.radius * px}" fill="${z.kind === 'pond' ? '#6fb6d8' : '#79b86b'}" opacity="0.85"/>`);
  const hMax = m.levels.rise;
  for (const r of m.ramps) {
    const w = r.halfWidth * 2 * px;
    out.push(`<polyline fill="none" stroke="#2c2f33" stroke-width="${w + 3}" points="${r.xs.map((x, i) => `${X(x).toFixed(1)},${Z(r.zs[i]).toFixed(1)}`).join(' ')}"/>`);
    // colour by height: ground = light grey, bridge = orange
    for (let i = 1; i < r.xs.length; i++) {
      const t = Math.max(0, Math.min(1, (r.ys[i] - m.levels.y0) / hMax));
      const c = `rgb(${Math.round(150 + 100 * t)},${Math.round(155 - 20 * t)},${Math.round(160 - 90 * t)})`;
      out.push(`<line x1="${X(r.xs[i - 1]).toFixed(1)}" y1="${Z(r.zs[i - 1]).toFixed(1)}" x2="${X(r.xs[i]).toFixed(1)}" y2="${Z(r.zs[i]).toFixed(1)}" stroke="${c}" stroke-width="${w}"/>`);
    }
    // direction arrow in the middle
    const k = Math.floor(r.xs.length / 2);
    const a = Math.atan2(r.zs[k + 1] - r.zs[k - 1], r.xs[k + 1] - r.xs[k - 1]);
    out.push(`<g transform="translate(${X(r.xs[k])},${Z(r.zs[k])}) rotate(${(a * 180) / Math.PI})"><path d="M-9,-6 L9,0 L-9,6 Z" fill="#111"/></g>`);
    out.push(`<text x="${X(r.xs[k]) + 8}" y="${Z(r.zs[k]) - 8}" font-size="13" fill="#222">${r.id}</text>`);
    for (const j of [r.from, r.to]) out.push(`<circle cx="${X(j.x)}" cy="${Z(j.z)}" r="5" fill="${j.kind === 'terminal' ? '#d33' : j.kind === 'gore' ? '#2a7' : '#27c'}"/>`);
  }
  // structures: arch = dark bar across the road, pavilion = big triangle, fountain = diamond, palm = small green dot, billboard = flat bar
  for (const b of m.structures) {
    for (let i = 0; i < b.data.length; i += 6) {
      const x = X(b.data[i]);
      const z = Z(b.data[i + 2]);
      const yawDeg = (b.data[i + 3] * 180) / Math.PI;
      if (b.def === 'arch') out.push(`<g transform="translate(${x},${z}) rotate(${yawDeg + 90})"><rect x="${-b.data[i + 4] * px / 2}" y="-3" width="${b.data[i + 4] * px}" height="6" fill="#6b3b1e"/></g>`);
      else if (b.def === 'pavilion') out.push(`<path d="M${x},${z - 12} L${x + 11},${z + 8} L${x - 11},${z + 8} Z" fill="#b7791f" stroke="#222"/>`);
      else if (b.def === 'fountain') out.push(`<path d="M${x},${z - 10} L${x + 10},${z} L${x},${z + 10} L${x - 10},${z} Z" fill="#e6f4ff" stroke="#246"/>`);
      else if (b.def === 'palm') out.push(`<circle cx="${x}" cy="${z}" r="4" fill="#1f6b2a"/>`);
      else if (b.def === 'billboard') out.push(`<g transform="translate(${x},${z}) rotate(${yawDeg + 90})"><rect x="-12" y="-2" width="24" height="4" fill="#c0392b"/></g>`);
    }
  }
  for (const w of m.walls) {
    const r = m.ramps.find((q) => q.id === w.ramp)!;
    const off = (w.side === 'left' ? 1 : -1) * (r.halfWidth + 0.4);
    const pts: string[] = [];
    for (let i = w.i0; i <= w.i1; i++) {
      const a = Math.max(0, i - 1);
      const c = Math.min(r.xs.length - 1, i + 1);
      const tx = r.xs[c] - r.xs[a];
      const tz = r.zs[c] - r.zs[a];
      const l = Math.hypot(tx, tz) || 1;
      pts.push(`${X(r.xs[i] + (tz / l) * off).toFixed(1)},${Z(r.zs[i] - (tx / l) * off).toFixed(1)}`);
    }
    out.push(`<polyline fill="none" stroke="#444" stroke-width="3" points="${pts.join(' ')}"/>`);
  }
  const piers = m.parts.find((p) => p.kind === 'pier')!;
  for (let i = 0; i < piers.data.length; i += 5) out.push(`<rect x="${X(piers.data[i]) - 2.5}" y="${Z(piers.data[i + 2]) - 2.5}" width="5" height="5" fill="#fff" stroke="#000" stroke-width="0.6"/>`);
  out.push(`<text x="14" y="26" font-size="20" fill="#111">${m.spec.pattern}: ${m.ramps.length} ramps, footprint ${m.footprintR.toFixed(0)} m, issues ${m.issues.length}</text>`);
  out.push(`<text x="14" y="48" font-size="13" fill="#333">green dot = gore (leaves road), blue = merge (joins road), red = terminal (at-grade pad), white squares = piers, orange = ramp is high</text>`);
  out.push(`<text x="14" y="66" font-size="13" fill="#333">brown bar = arch, triangle = pavilion, diamond = fountain, green dot = palm, red bar = billboard, dark line = retaining wall</text>`);
  out.push('</svg>');
  return out.join('\n');
}

mkdirSync('docs/interchange-preview', { recursive: true });
for (const id of patternIds()) {
  if (id.startsWith('test-')) continue;
  const m = buildInterchange({ id, pattern: id, x: 0, z: 0, y: 0, yaw: 0, main: HIGHWAY, cross: AVENUE, dressing: 'grand' }, () => 0);
  writeFileSync(`docs/interchange-preview/${id}.svg`, svg(m));
  console.log('wrote', id);
}
