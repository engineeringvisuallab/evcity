# J8 picture: solid mesh + paint (markings, islands, gore) as a layered 2D plan (solid first, paint on top), whole junction + close-up of the R6 entry. Input: mesh json (a = solid, b = paint). Output docs/j300_paint.png
import json, sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
M = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/mesh2.json')); cx, cz = -1659.94, -2410.42
def layer(ax, m, lim, c0, order=True):
    P = np.array(m['p']).reshape(-1, 3); C = np.array(m['c']).reshape(-1, 3); I = np.array(m['i']).reshape(-1, 3)
    t = P[I]; c = t.mean(axis=1); k = (abs(c[:, 0] - c0[0]) < lim) & (abs(c[:, 2] - c0[1]) < lim); t = t[k]; col = C[I][k].mean(axis=1)
    o = np.argsort(t.mean(axis=1)[:, 1]) if order else np.arange(len(t))
    ax.add_collection(PolyCollection([[(a[0], -a[2]) for a in q] for q in t[o]], facecolors=col[o], edgecolors='none'))
fig, axs = plt.subplots(1, 2, figsize=(16, 8))
for ax, lim, c0, title in ((axs[0], 150, (cx, cz), 'J8 plan: markings, islands, gore'), (axs[1], 55, (-1660 - 50, -2410 - 85), 'close-up: R6 entry / exit, zebra, arrow, yield')):
    layer(ax, M['a'], lim * 1.2, c0); layer(ax, M['b'], lim * 1.2, c0, order=False)
    ax.set_xlim(c0[0] - lim, c0[0] + lim); ax.set_ylim(-(c0[1] + lim), -(c0[1] - lim)); ax.set_aspect('equal'); ax.set_facecolor('#8fae7a'); ax.set_title(title)
plt.tight_layout(); plt.savefig('docs/j300_paint.png', dpi=105)
