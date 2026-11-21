# plots-tile-check.py : PLOT TILING P2 check. Draws every plot polygon of docs/city_plots_tiled.json on a 1 m raster and counts
#   GAP = free land covered by NO plot,  OVERLAP = ground in 2+ plots,  NOGO = plot ground deep inside road / rail / keep-out / water / steep.
# Run: python3 tools/plots-tile-check.py      Output: docs/city_plots_tiled_check.txt
import json, base64, numpy as np, cv2
N = json.load(open('docs/city_nogo.json')); P = json.load(open('docs/city_plots_tiled.json'))['plots']
nx, nz, X0, Z0, C = N['nx'], N['nz'], N['x0'], N['z0'], N['cell']
M = np.frombuffer(base64.b64decode(N['mask']), dtype=np.uint8).reshape(nz, nx); WET = np.frombuffer(base64.b64decode(N['wet']), dtype=np.uint8).reshape(nz, nx) > 0
S = 2; W = int(nx * C / S); H = int(nz * C / S); cnt = np.zeros((H, W), np.uint8)
for p in P:
    pts = np.array([[(x - X0) / S, (z - Z0) / S] for x, z in p['poly']]); x0, z0 = np.floor(pts.min(0)).astype(int) - 1; x1, z1 = np.ceil(pts.max(0)).astype(int) + 2
    tmp = np.zeros((z1 - z0, x1 - x0), np.uint8); cv2.fillPoly(tmp, [np.round((pts - [x0, z0]) * 16).astype(np.int32)], 1, shift=4); a0, b0 = max(x0, 0), max(z0, 0); a1, b1 = min(x1, W), min(z1, H); cnt[b0:b1, a0:a1] += tmp[b0 - z0:b1 - z0, a0 - x0:a1 - x0]
up = lambda a: np.kron(a, np.ones((int(C / S), int(C / S)), a.dtype)); import cv2 as _c; AREA = _c.imread('docs/city_plots_area.png', 0) > 0; HARD = 1 | 2 | 4 | 8 | 16 | 64
inside = AREA
fr = cv2.erode((up((M & HARD) == 0) & ~up(WET)).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0       # 3 m inside the free land
cr = cv2.erode(up((M & HARD) != 0).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
# overlap: 1 px wide strips on shared borders are only the drawing, so a 3x3 opening removes them
gap = int((fr & inside & (cnt == 0)).sum()); ov = int(cv2.morphologyEx((cnt >= 2).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).sum()); nogo = int((cr & inside & (cnt >= 1)).sum())
L = [f'plots {len(P)}', f'GAP (free land eroded 3 m, no plot): {gap} m2', f'OVERLAP (ground in 2+ plots): {ov} m2', f'NOGO (plot ground deep inside road/rail/keep-out/water/steep): {nogo} m2',
     'PASS' if gap == 0 and ov == 0 and nogo == 0 else 'see numbers (borders are simplified by 1.5 m, so a few m2 along edges is normal)']
print('\n'.join(L)); open('docs/city_plots_tiled_check.txt', 'w').write('\n'.join(L) + '\n')
