// ROADFIX lattice A* with the FINISHED LEVEL in the state: x, z, heading (24) and level y (0.5 m). Every step: grade <= class limit, cut <= 12, fill <= 7 across the pavement, radius >= class minimum by construction.
import { hNat, wetAt, buildingHit, railDist, LIMIT, RAIL_CLEAR, hyp } from './roadfix-lib';
export interface L2Opt { baseAng?: number; endTan?: number[]; wH?: number; cls: number; pad?: number; startHead: number; endHead: number; blocked?: (x: number, z: number) => boolean; maxNodes?: number; rMul?: number; gradeMul?: number }
let BASE = 0; const NH = 24, DEL = (2 * Math.PI) / NH, U = 0.5, MAXCUT = 11, MAXFILL = 6;
export function lat2(a: number[], b: number[], o: L2Opt): number[][] | null {
  BASE = o.baseAng ?? 0; const L = LIMIT[o.cls]; const Rc = L.rmin * (o.rMul ?? 1.12); const GR = L.grade * (o.gradeMul ?? 0.97); const pad = o.pad ?? 500; const maxN = o.maxNodes ?? 1200000;
  const x0 = Math.min(a[0], b[0]) - pad, x1 = Math.max(a[0], b[0]) + pad, z0 = Math.min(a[1], b[1]) - pad, z1 = Math.max(a[1], b[1]) + pad;
  const badC = new Map<number, boolean>(); const bad = (x: number, z: number): boolean => { if (hyp(x - a[0], z - a[1]) < 60 || hyp(x - b[0], z - b[1]) < 60) return false; const k = Math.round(x / 5) * 100003 + Math.round(z / 5); let v = badC.get(k); if (v === undefined) { v = wetAt(x, z) || railDist(x, z).d < RAIL_CLEAR || buildingHit(x, z, L.half) || (o.blocked ? o.blocked(x, z) : false); badC.set(k, v); } return v; };
  const wC = new Map<number, [number, number, number]>(); // [hmin, hmax, hcentre] across the pavement, per 4 m cell and 3 normal directions folded in by heading
  const win = (x: number, z: number, k: number): [number, number, number] => { const key = (Math.round(x / 2) * 100003 + Math.round(z / 2)) * 24 + k; let v = wC.get(key); if (!v) { const tx = Math.cos(BASE + k * DEL), tz = Math.sin(BASE + k * DEL); const c = hNat(x, z), l = hNat(x - tz * L.half, z + tx * L.half), r = hNat(x + tz * L.half, z - tx * L.half); v = [Math.min(c, l, r), Math.max(c, l, r), c]; wC.set(key, v); } return v; };
  const okY = (y: number, w: [number, number, number]) => y >= w[1] - MAXCUT - 1e-6 && y <= w[0] + MAXFILL + 1e-6;
  const arcLen = Rc * DEL; const prims = [{ sig: 0, len: 30 }, { sig: 1, len: arcLen }, { sig: -1, len: arcLen }];
  const gw = win(b[0], b[1], o.endHead); const gLo = gw[1] - MAXCUT, gHi = gw[0] + MAXFILL;
  interface N { x: number; z: number; k: number; yi: number; g: number; f: number; par: N | null; seg: number[][] }
  const heap: N[] = []; const push = (n: N) => { heap.push(n); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p].f <= heap[c].f) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = (): N => { const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const best = new Map<number, number>(); const key = (x: number, z: number, k: number, yi: number) => (((Math.round((x - x0) / 12) * 1024 + Math.round((z - z0) / 12)) * 24 + k) * 4096) + yi + 800;
  const WH = o.wH ?? 1.3; const hf = (x: number, z: number, yi: number) => { const y = yi * U; const dy = y < gLo ? gLo - y : y > gHi ? y - gHi : 0; return WH * Math.max(hyp(b[0] - x, b[1] - z), dy / GR); };
  const sw = win(a[0], a[1], o.startHead); const sLo = Math.ceil((sw[1] - MAXCUT) / U), sHi = Math.floor((sw[0] + MAXFILL) / U);
  for (let yi = sLo; yi <= sHi; yi++) { const n: N = { x: a[0], z: a[1], k: o.startHead, yi, g: Math.abs(yi * U - sw[2]) * 2, f: 0, par: null, seg: [] }; n.f = n.g + hf(a[0], a[1], yi); best.set(key(n.x, n.z, n.k, yi), n.g); push(n); }
  let nodes = 0; let nearest = 1e9;
  while (heap.length && nodes < maxN) { const n = pop(); nodes++; const dg = hyp(n.x - b[0], n.z - b[1]); if (dg < nearest) nearest = dg; (globalThis as any).__lat = { nodes, nearest: Math.round(nearest), open: heap.length };
    const dk = Math.min(Math.abs(n.k - o.endHead), NH - Math.abs(n.k - o.endHead)); const yN = n.yi * U;
    if (dg >= 40 && dg < 170 && dk <= 1 && yN >= gLo - 0.01 && yN <= gHi + 0.01) { const hd = Math.atan2(b[1] - n.z, b[0] - n.x); let da = Math.abs(hd - (BASE + n.k * DEL)) % (2 * Math.PI); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da < 0.6) { const et = o.endTan || [Math.cos(BASE + o.endHead * DEL), Math.sin(BASE + o.endHead * DEL)]; const P0 = [n.x, n.z];
        for (const sc of [1.0, 1.5, 2.0]) { const t0 = [Math.cos(BASE + n.k * DEL) * dg * sc, Math.sin(BASE + n.k * DEL) * dg * sc], t1 = [et[0] * dg * sc, et[1] * dg * sc]; const hp: number[][] = [[n.x, n.z]]; const m = Math.ceil(dg / 5);
          for (let i2 = 1; i2 <= m; i2++) { const u = i2 / m, u2 = u * u, u3 = u2 * u; const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2; hp.push([h00 * P0[0] + h10 * t0[0] + h01 * b[0] + h11 * t1[0], h00 * P0[1] + h10 * t0[1] + h01 * b[1] + h11 * t1[1]]); }
          let mr = 1e9; for (let i2 = 2; i2 + 2 < hp.length; i2++) { const A = hp[i2 - 2], B = hp[i2], C = hp[i2 + 2]; const ab = hyp(B[0] - A[0], B[1] - A[1]), bc = hyp(C[0] - B[0], C[1] - B[1]), ca = hyp(A[0] - C[0], A[1] - C[1]); const ar = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])); if (ar > 1e-6) mr = Math.min(mr, (ab * bc * ca) / (2 * ar)); }
          if (mr < L.rmin * 1.03) continue; let fine = true; for (let i2 = 1; i2 < hp.length && fine; i2 += 2) { if (!okY(yN, win(hp[i2][0], hp[i2][1], o.endHead))) fine = false; } if (!fine) continue;
          const out: number[][] = []; const ch: N[] = []; for (let q: N | null = n; q; q = q.par) ch.push(q); ch.reverse(); out.push([a[0], a[1]]); for (const q of ch) for (const p of q.seg) out.push(p); for (let i2 = 1; i2 < hp.length; i2++) out.push(hp[i2]); return out; } } }
    if (n.g > best.get(key(n.x, n.z, n.k, n.yi))! + 1e-6) continue; const th = BASE + n.k * DEL;
    for (const pr of prims) { let nk = n.k; const pos = (u: number): [number, number] => { if (pr.sig === 0) return [n.x + 30 * u * Math.cos(th), n.z + 30 * u * Math.sin(th)]; const t2 = th + pr.sig * DEL * u; return [n.x + Rc * pr.sig * (Math.sin(t2) - Math.sin(th)), n.z - Rc * pr.sig * (Math.cos(t2) - Math.cos(th))]; };
      if (pr.sig) nk = (n.k + pr.sig + NH) % NH; const [ex, ez] = pos(1); if (ex < x0 || ex > x1 || ez < z0 || ez > z1) continue;
      const ns = Math.max(2, Math.round(pr.len / 8)); const seg: number[][] = []; const pp: [number, number][] = []; let ok = true; for (let i = 1; i <= ns && ok; i++) { const q = pos(i / ns); if (bad(q[0], q[1])) ok = false; pp.push(q); seg.push([q[0], q[1]]); } if (!ok) continue;
      const kmid = pr.sig ? (n.k * 2 + pr.sig + 2 * NH) % (2 * NH) / 2 : n.k; const maxd = Math.floor((GR * pr.len) / U + 1e-9);
      for (let d = -maxd; d <= maxd; d++) { const yi2 = n.yi + d; let good = true; for (let i = 1; i <= ns && good; i++) { const y = (n.yi + (d * i) / ns) * U; if (!okY(y, win(pp[i - 1][0], pp[i - 1][1], Math.round(i === ns ? nk : n.k) % NH))) good = false; } if (!good) continue;
        const wE = win(ex, ez, nk); const cost = pr.len * (1 + 0.03 * Math.abs(yi2 * U - wE[2]) + 0.4 * Math.abs(d * U) / (pr.len * GR)) + (pr.sig ? 3 : 0); const ng = n.g + cost; const kk = key(ex, ez, nk, yi2); const old = best.get(kk); if (old !== undefined && old <= ng) continue; best.set(kk, ng);
        push({ x: ex, z: ez, k: nk, yi: yi2, g: ng, f: ng + hf(ex, ez, yi2), par: n, seg }); } } }
  return null;
}
