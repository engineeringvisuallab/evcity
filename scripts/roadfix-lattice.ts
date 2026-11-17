// ROADFIX curvature-aware path search (lattice A*): 24 headings, arc primitives with radius >= class minimum, so the result already has a legal radius.
import { hNat, wetAt, buildingHit, railDist, LIMIT, RAIL_CLEAR, hyp } from './roadfix-lib';
export interface LOpt { cls: number; frac: number; pad?: number; startHead: number; endHead: number; blocked?: (x: number, z: number) => boolean; maxNodes?: number; rMul?: number }
const NH = 24, DEL = (2 * Math.PI) / NH;
export function lattice(a: number[], b: number[], o: LOpt): number[][] | null {
  const L = LIMIT[o.cls]; const Rc = L.rmin * (o.rMul ?? 1.12); const pad = o.pad ?? 500; const maxN = o.maxNodes ?? 250000;
  const x0 = Math.min(a[0], b[0]) - pad, x1 = Math.max(a[0], b[0]) + pad, z0 = Math.min(a[1], b[1]) - pad, z1 = Math.max(a[1], b[1]) + pad;
  const badC = new Map<number, boolean>(); const bad = (x: number, z: number): boolean => { const k = Math.round(x / 5) * 100003 + Math.round(z / 5); let v = badC.get(k); if (v === undefined) { v = wetAt(x, z) || railDist(x, z).d < RAIL_CLEAR || buildingHit(x, z, L.half) || (o.blocked ? o.blocked(x, z) : false); badC.set(k, v); } return v; };
  const hC = new Map<number, number>(); const H = (x: number, z: number): number => { const k = Math.round(x * 2) * 200003 + Math.round(z * 2); let v = hC.get(k); if (v === undefined) { v = hNat(x, z); hC.set(k, v); } return v; };
  const arcLen = Rc * DEL; const prims: { sig: number; len: number }[] = [{ sig: 0, len: 30 }, { sig: 1, len: arcLen }, { sig: -1, len: arcLen }];
  interface N { x: number; z: number; k: number; g: number; f: number; par: N | null; seg: number[][] }
  const heap: N[] = []; const push = (n: N) => { heap.push(n); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p].f <= heap[c].f) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = (): N => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const best = new Map<string, number>(); const key = (x: number, z: number, k: number) => Math.round(x / 8) + ',' + Math.round(z / 8) + ',' + k;
  const s: N = { x: a[0], z: a[1], k: o.startHead, g: 0, f: hyp(b[0] - a[0], b[1] - a[1]), par: null, seg: [] }; push(s); best.set(key(s.x, s.z, s.k), 0); let nodes = 0; let nearest = 1e9; (globalThis as any).__lat = { nodes: 0, nearest: 1e9 };
  while (heap.length && nodes < maxN) { const n = pop(); nodes++; const dg = hyp(n.x - b[0], n.z - b[1]); if (dg < nearest) nearest = dg; (globalThis as any).__lat = { nodes, nearest: Math.round(nearest), open: heap.length };
    const dk = Math.min(Math.abs(n.k - o.endHead), NH - Math.abs(n.k - o.endHead)); if (hyp(n.x - b[0], n.z - b[1]) < 22 && dk <= 1) { const out: number[][] = []; const ch: N[] = []; for (let q: N | null = n; q; q = q.par) ch.push(q); ch.reverse(); out.push([a[0], a[1]]); for (const q of ch) for (const p of q.seg) out.push(p); out.push([b[0], b[1]]); return out; }
    if (n.g > best.get(key(n.x, n.z, n.k))! + 1e-6) continue; const th = n.k * DEL;
    for (const pr of prims) { let nk = n.k, ex: number, ez: number; const seg: number[][] = [];
      if (pr.sig === 0) { ex = n.x + 30 * Math.cos(th); ez = n.z + 30 * Math.sin(th); } else { nk = (n.k + pr.sig + NH) % NH; const t2 = th + pr.sig * DEL; ex = n.x + Rc * pr.sig * (Math.sin(t2) - Math.sin(th)); ez = n.z - Rc * pr.sig * (Math.cos(t2) - Math.cos(th)); }
      if (ex < x0 || ex > x1 || ez < z0 || ez > z1) continue; let ok = true; const ns = Math.max(2, Math.round(pr.len / 8));
      for (let i = 1; i <= ns && ok; i++) { const u = i / ns; let px: number, pz: number; if (pr.sig === 0) { px = n.x + 30 * u * Math.cos(th); pz = n.z + 30 * u * Math.sin(th); } else { const t2 = th + pr.sig * DEL * u; px = n.x + Rc * pr.sig * (Math.sin(t2) - Math.sin(th)); pz = n.z - Rc * pr.sig * (Math.cos(t2) - Math.cos(th)); } if (bad(px, pz)) ok = false; seg.push([px, pz]); }
      if (!ok) continue; const g = Math.abs(H(ex, ez) - H(n.x, n.z)) / pr.len; if (g > L.grade * o.frac) continue;
      const tx = Math.cos(nk * DEL), tz = Math.sin(nk * DEL); const side = Math.abs(H(ex - tz * L.half, ez + tx * L.half) - H(ex + tz * L.half, ez - tx * L.half)) / (2 * L.half); if (side > 0.45) continue;
      const cost = pr.len * (1 + 3 * g / L.grade + 2 * side) + (pr.sig ? 2 : 0); const ng = n.g + cost; const kk = key(ex, ez, nk); const old = best.get(kk); if (old !== undefined && old <= ng) continue; best.set(kk, ng);
      push({ x: ex, z: ez, k: nk, g: ng, f: ng + hyp(b[0] - ex, b[1] - ez), par: n, seg }); } }
  return null;
}
export const headIdx = (dx: number, dz: number): number => ((Math.round(Math.atan2(dz, dx) / DEL) % NH) + NH) % NH;
