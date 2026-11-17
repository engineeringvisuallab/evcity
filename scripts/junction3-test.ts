import { junction3Geometry, polyArea } from '../src/interchange/Junction3Geometry';
for (const kind of ['T','Y'] as const) {
  const g = junction3Geometry(kind, 12.7, 30);
  // star-shapedness from the centre: angle must increase monotonically around the outline
  let bad = 0, prev = Math.atan2(g.outline[0].z, g.outline[0].x), total = 0;
  for (let i = 1; i <= g.outline.length; i++) { const q = g.outline[i % g.outline.length]; let d = Math.atan2(q.z, q.x) - prev; while (d > Math.PI) d -= 2*Math.PI; while (d < -Math.PI) d += 2*Math.PI; if (d <= 0) bad++; total += d; prev = Math.atan2(q.z, q.x); }
  const minR = Math.min(...g.outline.map(p => Math.hypot(p.x, p.z)));
  console.log(kind, 's=', g.s.toFixed(1), 'pts', g.outline.length, 'area', polyArea(g.outline).toFixed(0), 'monotonic-bad', bad, 'turn', (total/Math.PI/2).toFixed(2), 'minDist', minR.toFixed(1));
}
