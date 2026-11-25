# J7-C picture: 3D view of the game solid mesh (reads a mesh json made by scripts via tsx), saves docs/j300_struct_c.png
import json, sys, numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
M = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '/tmp/mesh.json'))
P = np.array(M['p']).reshape(-1, 3); Cc = np.array(M['c']).reshape(-1, 3); I = np.array(M['i']).reshape(-1, 3)
cx, cz = -1659.94, -2410.42
fig = plt.figure(figsize=(15, 7))
for k, (el, az, lim) in enumerate([(32, -60, 330), (90, -90, 700)]):
    ax = fig.add_subplot(1, 2, k + 1, projection='3d')
    tri = P[I]; cen = tri.mean(axis=1); m = (abs(cen[:, 0] - cx) < lim) & (abs(cen[:, 2] - cz) < lim)
    t = tri[m]; col = Cc[I][m].mean(axis=1)
    poly = [[(a[0] - cx, a[2] - cz, a[1]) for a in q] for q in t]
    ax.add_collection3d(Poly3DCollection(poly, facecolors=col, edgecolors='none'))
    ax.set_xlim(-lim, lim); ax.set_ylim(-lim, lim); ax.set_zlim(15, 15 + lim * 1.2 if k == 0 else 70); ax.view_init(el, az); ax.set_box_aspect((1, 1, 0.18 if k else 0.35)); ax.set_axis_off()
    ax.set_title('J7-C solid mesh, ' + ('3D view' if k == 0 else 'plan view (R4 arm rises to the old road)'))
plt.tight_layout(); plt.savefig('docs/j300_struct_c.png', dpi=110)
