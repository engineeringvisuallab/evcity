# Renders docs/m8_stack_mesh.json (scripts/m8-stack-mesh-check.ts) with a small painter's-algorithm projection -> docs/m8_stack_mesh.png. Run: python3 tools/m8-stack-mesh-plot.py
import json, numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
d = json.load(open('docs/m8_stack_mesh.json'))
P = np.array(d['p']).reshape(-1, 3); C = np.array(d['c']).reshape(-1, 3); I = np.array(d['i']).reshape(-1, 3)
T = P[I]; col = C[I].mean(1)
n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
def view(ax, az, el, cx, cz, half, zs=1.0, title=''):
    a, e = np.radians(az), np.radians(el)
    # world (x, y up, z). camera direction from azimuth / elevation
    right = np.array([np.cos(a), 0, np.sin(a)]); fwd = np.array([-np.sin(a) * np.cos(e), -np.sin(e), np.cos(a) * np.cos(e)])
    up = np.cross(fwd, right) * -1
    Q = T.copy(); Q[:, :, 0] -= cx; Q[:, :, 2] -= cz; Q[:, :, 1] *= zs
    sx = Q @ right; sy = Q @ up; dep = Q @ fwd
    xy = np.stack([sx, sy], -1)
    inside = (np.abs(sx).max(1) < half * 1.3) & (np.abs(sy).max(1) < half * 1.3)
    order = np.argsort(-dep.mean(1)[inside])
    idx = np.where(inside)[0][order]
    light = 0.55 + 0.45 * np.abs(n[idx] @ (np.array([0.4, 0.8, 0.3]) / 0.95))
    ax.add_collection(PolyCollection(xy[idx], facecolors=np.clip(col[idx] * light[:, None], 0, 1), edgecolors='none'))
    ax.set_xlim(-half, half); ax.set_ylim(-half * 0.62, half * 0.62); ax.set_aspect('equal'); ax.set_axis_off(); ax.set_title(title)
fig, axs = plt.subplots(1, 3, figsize=(21, 7))
view(axs[0], 35, 28, 0, 0, 330, 2.0, 'oblique (height x2)')
view(axs[1], 0, 0.1, 0, 0, 480, 6.0, 'side elevation (height x6): road B level 4 over road A, ramps, piers')
view(axs[2], 0, 89, 90, 40, 130, 1.0, 'plan, east exit zone: tapers, aux lane, markings')
fig.suptitle('J1 stack mesh')
fig.savefig('docs/m8_stack_mesh.png', dpi=80, bbox_inches='tight', facecolor='#e8eef2')
